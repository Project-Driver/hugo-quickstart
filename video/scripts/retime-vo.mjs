// Re-times a recorded read to the picture. A take is split at its pauses (from
// `ffmpeg silencedetect`) and each phrase is placed at the second the scene
// needs it, so the picture never waits on the voice and the voice never rushes
// the picture. Output is one mp3 the composition plays straight through.
//
//   node scripts/retime-vo.mjs out/takes/pf-russ-2.mp3 spots/portfolio-vo.json public/audio/pf-vo.mp3
//
// The JSON lists phrases as {from, to, at}: source seconds in the take, and the
// second in the film where the phrase should start.
import {execFileSync} from 'node:child_process';
import {readFileSync, existsSync} from 'node:fs';
import {resolve, join} from 'node:path';

const [take, plan, out] = process.argv.slice(2);
if (!take || !plan || !out) throw new Error('usage: retime-vo.mjs <take.mp3> <plan.json> <out.mp3>');
const dir = resolve('node_modules/@remotion/compositor-linux-x64-gnu');
process.env.LD_LIBRARY_PATH = dir;
const ffmpeg = existsSync(join(dir, 'ffmpeg')) ? join(dir, 'ffmpeg') : 'ffmpeg';

const phrases = JSON.parse(readFileSync(plan, 'utf8'));
const parts = phrases.map((p, i) => `[0:a]atrim=start=${p.from}:end=${p.to},asetpts=PTS-STARTPTS,adelay=${Math.round(p.at * 1000)}|${Math.round(p.at * 1000)}[p${i}]`);
const mix = `${phrases.map((_, i) => `[p${i}]`).join('')}amix=inputs=${phrases.length}:normalize=0:dropout_transition=0[vo]`;
execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-i', take, '-filter_complex', `${parts.join(';')};${mix}`, '-map', '[vo]', '-c:a', 'libmp3lame', '-q:a', '2', out]);
const last = phrases[phrases.length - 1];
console.log(`${out}: ${phrases.length} phrases, last ends at ${(last.at + last.to - last.from).toFixed(2)}s`);
