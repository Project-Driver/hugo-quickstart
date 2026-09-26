import {Composition, staticFile} from 'remotion';
import {PitBoardReel, REEL_FRAMES} from './PitBoardReel';
import {WalkthroughReel, type Plan} from './WalkthroughReel';
import {Spot, SPOT_FRAMES, type SpotAssets} from './Spot';
import board from './sample-board.json';

// A stand-in plan so the composition registers before any capture has run.
const emptyPlan: Plan = {fps: 30, width: 1080, height: 1920, capture: {width: 1080, height: 2336}, durationInFrames: 30, scenes: []};

// Which files the spot plays: captures from scripts/capture.mjs, and any b-roll
// or audio dropped into public/broll and public/audio.
async function spotAssets(): Promise<SpotAssets> {
  const meta = await fetch(staticFile('captures/meta.json')).then((r) => r.json());
  const has = async (p: string) => (await fetch(staticFile(p), {method: 'HEAD'})).ok;
  const opt = async (p: string) => ((await has(p)) ? p : undefined);
  return {
    captures: {
      board: meta.shots['board-product'].file,
      money: meta.shots['money-product'].file,
      hero: meta.shots['home-hero'].file,
      moneyFocus: meta.shots['money-product'].focus,
      width: meta.width,
      height: meta.height,
    },
    broll: {dashboard: await opt('broll/dashboard.mp4'), van: await opt('broll/van.mp4')},
    audio: {vo: await opt('audio/vo.mp3'), music: await opt('audio/music.mp3')},
  };
}

export const Root: React.FC = () => (
  <>
    <Composition
      id="Spot"
      component={Spot}
      durationInFrames={SPOT_FRAMES}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={{board, assets: {captures: {board: '', money: '', hero: '', moneyFocus: null, width: 1080, height: 2336}, broll: {}, audio: {}} as SpotAssets}}
      calculateMetadata={async () => ({props: {board, assets: await spotAssets()}})}
    />
    <Composition
      id="PitBoardReel"
      component={PitBoardReel}
      durationInFrames={REEL_FRAMES}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={{board}}
    />
    <Composition
      id="WalkthroughReel"
      component={WalkthroughReel}
      durationInFrames={emptyPlan.durationInFrames}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={{plan: emptyPlan}}
      // The cut lives in public/plan.json, written by scripts/plan.mjs; its length sets the video's.
      calculateMetadata={async () => {
        const plan: Plan = await fetch(staticFile('plan.json')).then((r) => r.json());
        return {durationInFrames: plan.durationInFrames, props: {plan}};
      }}
    />
  </>
);
