import {Composition} from 'remotion';
import {PitBoardReel, REEL_FRAMES} from './PitBoardReel';
import board from './sample-board.json';

export const Root: React.FC = () => (
  <Composition
    id="PitBoardReel"
    component={PitBoardReel}
    durationInFrames={REEL_FRAMES}
    fps={30}
    width={1080}
    height={1920}
    defaultProps={{board}}
  />
);
