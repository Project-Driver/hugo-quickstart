# Project Driver video

Reels for Project Driver products, made with [Remotion](https://remotion.dev): vertical 1080×1920 MP4s built in React.

Two kinds:

- **Walkthrough reel** (`WalkthroughReel`): real footage of the site, captured by driving a browser through it, cut to a conversion structure. `node scripts/reel.mjs shots/pitboard.json strategy/cold-owner.json` builds the site, records it, plans the cut and renders `out/cold-owner.mp4`. See `.claude/skills/make-reel/SKILL.md` for how the pieces fit.
- **Data reel** (`PitBoardReel`): text and numbers only, no footage. `pitboard-reel.mp4` is the current render.

```bash
npm install
npm run studio   # live preview in the browser, scrub the timeline
npm run render   # writes out/pitboard-reel.mp4
```

- `src/PitBoardReel.tsx` holds the six scenes: hook, 7 AM text, yesterday's numbers, money on the table, do this first, call to action.
- Every number and name comes from `src/sample-board.json`, a copy of the site's `data/sample_board.json`. Pass a different board (for example a real client's, from `/api/board`) and the same reel renders for that business.
- Colors and the logo match `themes/pitboard`. Fonts are bundled through `@fontsource`, so rendering needs no network.
- In a container without Chrome, point Remotion at a headless shell: `npm run render -- --browser-executable=/path/to/headless_shell`.

Remotion is free for individuals and companies of up to 3 people; larger companies need a license.
