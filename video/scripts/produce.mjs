#!/usr/bin/env node
// Produces one client reel from a plan, end to end, with no one at the keyboard.
// This is the render worker the n8n flow calls (through GitHub Actions or a box).
//
//   node scripts/produce.mjs plans/rgds-storm.json [--out out/rgds-storm.mp4] [--skip-voice] [--upload]
//
// Steps:
//   1. Fetch any media the plan references by URL into public/ (a HighLevel media
//      library file, a site photo), so the plan can point at the live source.
//   2. Record the read with ElevenLabs (ELEVENLABS_API_KEY) if the plan carries a
//      `script` and no voice file yet; map its pauses; re-time each phrase to the
//      second its scene starts (plan.phrases[].at), writing public/audio/<id>-vo.mp3.
//   3. Generate the music bed if the plan carries `musicPrompt` and no music file.
//   4. Write public/plans/current.json and render the ClientReel composition.
//   5. Pull a frame at every scene boundary into out/<id>-frames/ for a check.
//   6. With --upload and HIGHLEVEL_API_KEY, upload the mp4 to the client's
//      HighLevel media library and print the file URL for the scheduler.
//
// Keys come from the environment only. Nothing here prints a secret.

import {execFileSync, spawnSync} from 'node:child_process';
import {createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {basename, dirname, extname, join, resolve} from 'node:path';
import {pipeline} from 'node:stream/promises';

const args = process.argv.slice(2);
const planPath = args.find((a) => !a.startsWith('--'));
if (!planPath) throw new Error('usage: produce.mjs <plan.json> [--out file.mp4] [--skip-voice] [--upload]');
const opt = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
const plan = JSON.parse(readFileSync(planPath, 'utf8'));
const id = plan.id || basename(planPath, '.json');
const out = opt('--out', `out/${id}.mp4`);
const FF = resolve('node_modules/@remotion/compositor-linux-x64-gnu');
process.env.LD_LIBRARY_PATH = FF;
const ffmpeg = join(FF, 'ffmpeg');
const log = (m) => console.log(`[produce] ${m}`);

async function fetchTo(url, dest) {
  if (existsSync(dest)) return;
  mkdirSync(dirname(dest), {recursive: true});
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  await pipeline(res.body, createWriteStream(dest));
}

// 1. Media by URL → public/clients/<client>/… ; the plan's src becomes the local path.
for (const scene of plan.scenes) {
  if (scene.src && /^https?:\/\//.test(scene.src)) {
    const name = basename(new URL(scene.src).pathname).replace(/[^\w.-]/g, '_');
    const local = `clients/${plan.client.short.toLowerCase()}/${name}`;
    await fetchTo(scene.src, join('public', local));
    scene.src = local;
    log(`fetched ${name}`);
  }
}

// 2. The read. plan.script is the text; plan.phrases places each phrase (in order) at a second.
const voiceFile = plan.audio?.vo || `audio/${id}-vo.mp3`;
if (plan.script && !existsSync(join('public', voiceFile)) && !args.includes('--skip-voice')) {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error('ELEVENLABS_API_KEY is not set and the plan needs a read');
  const voice = plan.voice?.id || 't0eCaS57KWbQQc1wRkah';
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: {'xi-api-key': key, 'content-type': 'application/json'},
    body: JSON.stringify({text: plan.script, model_id: plan.voice?.model || 'eleven_v3'}),
  });
  if (!res.ok) throw new Error(`ElevenLabs speech → ${res.status}: ${(await res.text()).slice(0, 300)}`);
  mkdirSync('out/takes', {recursive: true});
  const take = `out/takes/${id}-take.mp3`;
  writeFileSync(take, Buffer.from(await res.arrayBuffer()));
  log(`recorded the read (${take})`);
  // Pauses → phrases. The plan lists phrases in reading order with the second each should start.
  const det = spawnSync(ffmpeg, ['-hide_banner', '-i', take, '-af', 'silencedetect=noise=-35dB:d=0.3', '-f', 'null', '-'], {encoding: 'utf8'});
  const marks = [...det.stderr.matchAll(/silence_(start|end): ([0-9.]+)/g)].map((m) => [m[1], parseFloat(m[2])]);
  const dur = parseFloat(spawnSync(join(FF, 'ffprobe'), ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', take], {encoding: 'utf8'}).stdout);
  const cuts = [0];
  for (let i = 0; i < marks.length; i++) if (marks[i][0] === 'start' && marks[i + 1]?.[0] === 'end') cuts.push((marks[i][1] + marks[i + 1][1]) / 2);
  cuts.push(dur);
  const phrases = plan.phrases || [];
  if (cuts.length - 1 !== phrases.length) log(`warning: the read has ${cuts.length - 1} phrases, the plan expects ${phrases.length}; placing what matches`);
  const n = Math.min(cuts.length - 1, phrases.length);
  const map = phrases.slice(0, n).map((p, i) => ({from: Math.max(0, cuts[i] - 0.05), to: Math.min(dur, cuts[i + 1] + 0.05), at: p.at, text: p.text}));
  const mapPath = `spots/${id}-vo.json`;
  mkdirSync('spots', {recursive: true});
  writeFileSync(mapPath, JSON.stringify(map, null, 2));
  execFileSync('node', ['scripts/retime-vo.mjs', take, mapPath, join('public', voiceFile)], {stdio: 'inherit'});
  plan.audio = {...(plan.audio || {}), vo: voiceFile};
}

// 3. Music.
const musicFile = plan.audio?.music || `audio/${id}-music.mp3`;
if (plan.musicPrompt && !existsSync(join('public', musicFile))) {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error('ELEVENLABS_API_KEY is not set and the plan needs music');
  const res = await fetch('https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128', {
    method: 'POST',
    headers: {'xi-api-key': key, 'content-type': 'application/json'},
    body: JSON.stringify({prompt: plan.musicPrompt, music_length_ms: Math.round((plan.seconds + 2) * 1000), force_instrumental: true}),
  });
  if (!res.ok) throw new Error(`ElevenLabs music → ${res.status}: ${(await res.text()).slice(0, 300)}`);
  writeFileSync(join('public', musicFile), Buffer.from(await res.arrayBuffer()));
  plan.audio = {...(plan.audio || {}), music: musicFile};
  log('generated the music bed');
}

// 4. Render.
mkdirSync('public/plans', {recursive: true});
writeFileSync('public/plans/current.json', JSON.stringify(plan, null, 2));
writeFileSync(planPath, JSON.stringify(plan, null, 2));
mkdirSync(dirname(out), {recursive: true});
const shell = process.env.CHROME_HEADLESS_SHELL || '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';
const renderArgs = ['remotion', 'render', 'ClientReel', out, '--log=error', '--concurrency=2', ...(existsSync(shell) ? [`--browser-executable=${shell}`] : [])];
execFileSync('npx', renderArgs, {stdio: 'inherit'});
log(`rendered ${out}`);

// 5. Check frames at every cut.
const frameDir = `out/${id}-frames`;
mkdirSync(frameDir, {recursive: true});
for (const s of plan.scenes) {
  const t = (s.from + Math.min(1.2, (s.to - s.from) / 2)).toFixed(2);
  execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-ss', t, '-i', out, '-frames:v', '1', '-vf', 'scale=360:-1', join(frameDir, `${t}s.jpg`)]);
}
log(`check frames in ${frameDir}`);

// 6. Upload to the client's HighLevel media library.
if (args.includes('--upload')) {
  const key = process.env.HIGHLEVEL_API_KEY;
  const loc = plan.client.ghlLocationId;
  if (!key || !loc) throw new Error('HIGHLEVEL_API_KEY and plan.client.ghlLocationId are needed for --upload');
  const form = new FormData();
  form.set('file', new Blob([readFileSync(out)], {type: 'video/mp4'}), basename(out));
  form.set('name', `${id}.mp4`);
  const res = await fetch(`https://services.leadconnectorhq.com/medias/upload-file?altType=location&altId=${loc}`, {
    method: 'POST', headers: {Authorization: `Bearer ${key}`, Version: '2021-07-28'}, body: form,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`HighLevel upload → ${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
  log(`uploaded: ${body.url || JSON.stringify(body)}`);
  console.log(JSON.stringify({id, url: body.url, caption: plan.caption || ''}));
}
