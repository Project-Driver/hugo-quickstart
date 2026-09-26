// One command from site to finished reel:
//   node scripts/reel.mjs shots/pitboard.json strategy/cold-owner.json [board.json] [--live] [--skip-capture]
import {execFileSync} from 'node:child_process';
import {existsSync, writeFileSync} from 'node:fs';

const args = process.argv.slice(2);
const flags = args.filter((a) => a.startsWith('--'));
const [shots, strategy, board] = args.filter((a) => !a.startsWith('--'));
if (!shots || !strategy) throw new Error('usage: reel.mjs <shots.json> <strategy.json> [board.json] [--live] [--skip-capture]');

const run = (cmd, a) => execFileSync(cmd, a, {stdio: ['ignore', 'inherit', 'inherit']});
if (!flags.includes('--skip-capture')) run('node', ['scripts/capture.mjs', shots, ...flags.filter((f) => f === '--live')]);
const plan = execFileSync('node', ['scripts/plan.mjs', strategy, ...(board ? [board] : [])]);
writeFileSync('public/plan.json', plan);

const name = strategy.replace(/^.*\//, '').replace(/\.json$/, '');
const out = `out/${name}.mp4`;
const browser = process.env.CHROME_HEADLESS_SHELL || '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';
run('npx', ['remotion', 'render', 'WalkthroughReel', out, ...(existsSync(browser) ? ['--browser-executable', browser] : [])]);
console.log(`\nreel: ${out}`);
