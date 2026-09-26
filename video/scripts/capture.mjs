// Drives a browser through a shot list and records each shot as footage.
//
//   node scripts/capture.mjs shots/pitboard.json            # builds the site and records it locally
//   node scripts/capture.mjs shots/pitboard.json --live     # records the live URL instead
//
// Each shot becomes public/captures/<id>.mp4 (1080 wide, 30 fps), a poster
// jpg, and an entry in public/captures/meta.json with the extracted text and
// the on-screen box of the element to punch in on. Frames are taken one by one
// while the script scrolls, so timing is exact and the output is deterministic.

import {chromium} from 'playwright-core';
import {execFileSync, spawnSync} from 'node:child_process';
import {mkdirSync, readFileSync, writeFileSync, rmSync, existsSync} from 'node:fs';
import {resolve, dirname, join} from 'node:path';
import {serve} from './lib/serve.mjs';

const FPS = 30;
const VIEW = {width: 390, height: 844}; // iPhone-class CSS pixels
const SCALE = 1080 / VIEW.width; // renders at 1080x2338 device pixels
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const FFMPEG = process.env.FFMPEG_PATH || findFfmpeg();

// Remotion bundles an ffmpeg with libx264; Playwright's copy lacks it.
function findFfmpeg() {
  const dir = resolve('node_modules/@remotion/compositor-linux-x64-gnu');
  if (existsSync(join(dir, 'ffmpeg'))) {
    process.env.LD_LIBRARY_PATH = dir + (process.env.LD_LIBRARY_PATH ? ':' + process.env.LD_LIBRARY_PATH : '');
    return join(dir, 'ffmpeg');
  }
  if (spawnSync('ffmpeg', ['-version']).status === 0) return 'ffmpeg';
  throw new Error('ffmpeg not found; set FFMPEG_PATH');
}

const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

async function main() {
  const listPath = process.argv[2];
  if (!listPath) throw new Error('usage: capture.mjs <shots.json> [--live]');
  const live = process.argv.includes('--live');
  const list = JSON.parse(readFileSync(listPath, 'utf8'));
  const outDir = resolve('public/captures');
  mkdirSync(outDir, {recursive: true});

  let base = list.site.liveUrl;
  let server;
  if (!live) {
    // The site lives at shot.site.source relative to the shot list; SITE_DIR overrides it.
    const siteDir = process.env.SITE_DIR || resolve(dirname(listPath), list.site.source);
    const publicDir = join(siteDir, 'public');
    if (list.site.build === 'hugo') {
      execFileSync(resolve('node_modules/.bin/hugo'), ['--baseURL', 'http://localhost/', '-d', publicDir], {cwd: siteDir, stdio: 'inherit'});
    }
    server = await serve(publicDir);
    base = server.url;
  }
  console.log(`capturing from ${base}`);

  const browser = await chromium.launch({executablePath: CHROME, args: ['--headless=new', '--hide-scrollbars']});
  const meta = {base, fps: FPS, width: 1080, height: Math.floor((VIEW.height * SCALE) / 2) * 2, shots: {}};
  try {
    for (const shot of list.shots) {
      meta.shots[shot.id] = await record(browser, base, shot, outDir);
      console.log(`  ${shot.id}: ${meta.shots[shot.id].frames} frames`);
    }
  } finally {
    await browser.close();
    server?.close();
  }
  writeFileSync(join(outDir, 'meta.json'), JSON.stringify(meta, null, 2));
  console.log(`wrote ${join(outDir, 'meta.json')}`);
}

async function record(browser, base, shot, outDir) {
  const ctx = await browser.newContext({viewport: VIEW, deviceScaleFactor: SCALE, reducedMotion: 'no-preference'});
  const page = await ctx.newPage();
  await page.goto(base + shot.path, {waitUntil: 'networkidle'});
  await page.addStyleTag({content: 'html{scroll-behavior:auto!important} *{caret-color:transparent!important}'});
  await page.evaluate(() => document.fonts.ready);

  const frameDir = join(outDir, `${shot.id}.frames`);
  rmSync(frameDir, {recursive: true, force: true});
  mkdirSync(frameDir);
  let n = 0;
  const snap = async () => {
    await page.screenshot({path: join(frameDir, `${String(n++).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 92});
  };
  const scrollY = () => page.evaluate(() => window.scrollY);
  const maxY = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
  const targetY = async (sel, block = 'center') => page.evaluate(([s, b]) => {
    const el = document.querySelector(s);
    if (!el) throw new Error(`no element for ${s}`);
    const r = el.getBoundingClientRect();
    const offset = b === 'start' ? 96 : (window.innerHeight - r.height) / 2;
    return window.scrollY + r.top - offset;
  }, [sel, block]);

  // Smoothly scroll from the current position to y over `seconds`, one frame at a time.
  const glide = async (y, seconds) => {
    const from = await scrollY();
    const to = Math.max(0, Math.min(maxY, y));
    const frames = Math.max(1, Math.round(seconds * FPS));
    for (let i = 1; i <= frames; i++) {
      await page.evaluate((v) => window.scrollTo(0, v), from + (to - from) * ease(i / frames));
      await snap();
    }
  };

  for (const a of shot.actions) {
    if (a.wait) for (let i = 0; i < Math.round(a.wait * FPS); i++) await snap();
    else if (a.scrollTo) await glide(await targetY(a.scrollTo, a.block), a.seconds ?? 1);
    else if (a.scrollBy) await glide((await scrollY()) + a.scrollBy, a.seconds ?? 1);
    else if (a.click) { await page.click(a.click); await page.waitForTimeout(300); }
  }

  // Where to punch in, in output pixels, measured at the final scroll position.
  let focus = null;
  if (shot.focus) {
    const r = await page.evaluate((s) => {
      const el = document.querySelector(s);
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return {x: b.left, y: b.top, w: b.width, h: b.height};
    }, shot.focus);
    if (r) focus = {x: r.x * SCALE, y: r.y * SCALE, w: r.w * SCALE, h: r.h * SCALE};
  }

  const text = {};
  for (const [key, sel] of Object.entries(shot.extract || {})) {
    text[key] = await page.evaluate((s) => document.querySelector(s)?.innerText.trim() ?? null, sel);
  }

  await ctx.close();

  const mp4 = join(outDir, `${shot.id}.mp4`);
  execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', join(frameDir, '%05d.jpg'),
    '-vf', 'scale=1080:-2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'medium', '-movflags', '+faststart', mp4]);
  execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-i', join(frameDir, '00000.jpg'), '-vf', 'scale=540:-1', join(outDir, `${shot.id}.jpg`)]);
  rmSync(frameDir, {recursive: true, force: true});

  return {file: `captures/${shot.id}.mp4`, poster: `captures/${shot.id}.jpg`, frames: n, seconds: n / FPS, focus, text, path: shot.path};
}

main().catch((e) => { console.error(e); process.exit(1); });
