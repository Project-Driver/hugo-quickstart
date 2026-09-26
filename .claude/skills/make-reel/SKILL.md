---
name: make-reel
description: Build a vertical product-walkthrough reel for a Project Driver site from real captured footage. Use when asked to make a reel, promo video, walkthrough or ad for Pit Board, Instant Teardown or another site in this repo.
---

# Make a reel

A reel is real footage of a real site, cut to a conversion structure, rendered by Remotion. No AI-generated footage is involved unless the person asks for it.

Everything lives in `video/`. Run commands from there.

## The pipeline

1. **Shot list** `shots/<site>.json`: which pages to visit and how to move through them (scroll to an element, pause, click). Each shot names a `focus` element to punch in on and `extract` selectors whose text feeds the captions.
2. **Capture** `node scripts/capture.mjs shots/<site>.json` builds the site with Hugo, serves it locally, drives Chromium through each shot and writes `public/captures/<id>.mp4` plus `meta.json` (extracted text, focus boxes). Add `--live` to record the deployed site instead.
3. **Strategy** `strategy/<audience>.json`: the conversion structure. Scenes are `hook`, `clip` or `cta`; `{{tokens}}` are filled from extracted text and the board's numbers. One strategy renders differently for every site and client.
4. **Plan** `node scripts/plan.mjs strategy/<audience>.json [board.json] > public/plan.json` turns strategy plus captures into a concrete cut.
5. **Render** `npx remotion render WalkthroughReel out/<name>.mp4`.

`node scripts/reel.mjs shots/<site>.json strategy/<audience>.json [board.json]` does all of it. `--skip-capture` reuses the last footage.

## Doing it well

- **Hook in the first second.** The hook scene carries a pain number from the data (missed calls, dollars on the table). Never open on a logo.
- **One idea per scene, cut every 3–7 seconds.** A shot longer than 7 s is two shots.
- **Caption every clip.** Most viewers watch muted. Captions are sentence case and under 12 words.
- **Punch in on the thing being sold**: the missed call row, the price, the button. If `plan.mjs` reports no zoom for a shot, its focus element was off screen when the shot ended; fix the shot's scroll, not the composition.
- **Every number must be real.** Sample data is labelled as a sample on the site; a client's reel uses their own board JSON, with their permission. Never invent a review, a customer or a result.
- **Check the render** before handing it over: pull frames at each cut with ffmpeg (Remotion's copy is in `node_modules/@remotion/compositor-linux-x64-gnu/`) and look at them. Black frames, clipped captions and off-screen punch-ins are the usual faults.
- New site: copy `shots/pitboard.json`, change paths and selectors, run a capture, and read `meta.json` to confirm the extracted text is what the captions need.
- New audience: copy `strategy/cold-owner.json`. Retargeting can skip the "what it is" scenes and go straight to proof and price.

## Environment

- Chromium: `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`; Remotion renders with `chromium_headless_shell-1194/chrome-linux/headless_shell` (`CHROME_PATH`, `CHROME_HEADLESS_SHELL` override).
- Hugo 0.101 is installed by npm into `video/node_modules/.bin/hugo`, matching `netlify.toml`.
- The shot list expects the site at the repo root (the `claude/project-driver-revenue-6fkwz3` branch). From another checkout, set `SITE_DIR=/path/to/site`.
- Recording a live site needs its domain allowed in the environment's network settings.
