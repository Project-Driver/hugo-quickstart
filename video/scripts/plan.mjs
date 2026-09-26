// Turns a strategy plus the captured footage and board data into a concrete cut.
//
//   node scripts/plan.mjs strategy/cold-owner.json > public/plan.json
//
// Every {{token}} in the strategy is filled from the text the capture extracted
// (headline, prices, labels) and from the board's numbers, so the same strategy
// renders differently for each site and each client.

import {readFileSync} from 'node:fs';

const FPS = 30;
const XFADE = 8; // frames each scene overlaps the one before it
const strategy = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const meta = JSON.parse(readFileSync('public/captures/meta.json', 'utf8'));
const board = JSON.parse(readFileSync(process.argv[3] || 'src/sample-board.json', 'utf8'));

const vars = {
  ...board.lap,
  score: board.score,
  business: board.account.name,
  onTable: board.moneyOnTheTableTotal,
  ...Object.assign({}, ...Object.values(meta.shots).map((s) => s.text)),
};
// Captured labels are shouty uppercase in the UI; captions read better in sentence case.
for (const k of ['firstLabel']) if (vars[k]) vars[k] = vars[k].charAt(0) + vars[k].slice(1).toLowerCase().replace(/\s*·.*$/, '');

const fill = (s) => s.replace(/\{\{(\w+)\}\}/g, (_, k) => {
  if (vars[k] == null) throw new Error(`no value for {{${k}}}`);
  return String(vars[k]);
});

// A punch-in only makes sense if the element is on screen at the end of the shot.
const visible = (f) => f && f.y >= 0 && f.y + f.h <= meta.height && f.h < meta.height * 0.6;

let from = 0;
const scenes = strategy.scenes.map((sc) => {
  const shot = sc.shot || sc.over;
  const cap = shot ? meta.shots[shot] : null;
  if (shot && !cap) throw new Error(`strategy uses shot "${shot}" which was not captured`);
  const seconds = sc.seconds ?? cap.seconds;
  const durationInFrames = Math.round(seconds * FPS);
  const out = {
    kind: sc.kind,
    from,
    durationInFrames,
    src: cap?.file ?? null,
    poster: cap?.poster ?? null,
    caption: sc.caption ? fill(sc.caption) : null,
    lines: sc.lines?.map(fill) ?? null,
    headline: sc.headline ? fill(sc.headline) : null,
    button: sc.button ? fill(sc.button) : null,
    footer: sc.footer ? fill(sc.footer) : null,
    focus: sc.punchIn && visible(cap?.focus) ? cap.focus : null,
  };
  from += durationInFrames - XFADE;
  return out;
});

const plan = {strategy: strategy.id, fps: FPS, width: 1080, height: 1920,
  capture: {width: meta.width, height: meta.height}, durationInFrames: from + XFADE, scenes};
process.stdout.write(JSON.stringify(plan, null, 2));
