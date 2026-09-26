import {Composition, staticFile} from 'remotion';
import {PitBoardReel, REEL_FRAMES} from './PitBoardReel';
import {WalkthroughReel, type Plan} from './WalkthroughReel';
import board from './sample-board.json';

// A stand-in plan so the composition registers before any capture has run.
const emptyPlan: Plan = {fps: 30, width: 1080, height: 1920, capture: {width: 1080, height: 2336}, durationInFrames: 30, scenes: []};

export const Root: React.FC = () => (
  <>
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
