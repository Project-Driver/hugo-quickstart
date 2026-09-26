import {Composition, staticFile} from 'remotion';
import {PitBoardReel, REEL_FRAMES} from './PitBoardReel';
import {WalkthroughReel, type Plan} from './WalkthroughReel';
import {Spot, SPOT_FRAMES, type SpotAssets} from './Spot';
import {PdSpot, PD_FRAMES, type PdAssets} from './PdSpot';
import {Portfolio, PORTFOLIO_FRAMES, type PortfolioAssets} from './Portfolio';
import {ClientReel, type ReelPlan} from './ClientReel';
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

// The project-driver.com spot: its captures, and the read in public/audio/pd-vo.mp3.
async function pdAssets(): Promise<PdAssets> {
  const meta = await fetch(staticFile('captures/meta.json')).then((r) => r.json());
  const has = async (p: string) => (await fetch(staticFile(p), {method: 'HEAD'})).ok;
  const opt = async (p: string) => ((await has(p)) ? p : undefined);
  const s = meta.shots;
  return {
    captures: {hero: s['pd-hero'].file, areas: s['pd-areas'].file, pillars: s['pd-pillars'].file, results: s['pd-results'].file, book: s['pd-book'].file, width: meta.width, height: meta.height, resultsFocus: null},
    audio: {vo: await opt('audio/pd-vo.mp3'), music: await opt('audio/pd-music.mp3')},
  };
}

// The portfolio spot: live scrolls from shots/portfolio.json, the brand films and
// the Bottima reel in public/broll and public/social, the posts we published, and
// the re-timed read in public/audio/pf-vo.mp3.
async function portfolioAssets(): Promise<PortfolioAssets> {
  const meta = await fetch(staticFile('captures/meta.json')).then((r) => r.json());
  const has = async (p: string) => (await fetch(staticFile(p), {method: 'HEAD'})).ok;
  const opt = async (p: string) => ((await has(p)) ? p : undefined);
  const cap = (id: string) => ({file: meta.shots[id].file, poster: meta.shots[id].poster});
  return {
    captures: {pd: cap('pf-pd-home'), pdResults: cap('pf-pd-results'), rgds: cap('pf-rgds'), hmr: cap('pf-hmr'), bottima: cap('pf-bottima'), width: meta.width, height: meta.height},
    films: {rgds: await opt('broll/rgds-brand.mp4'), pd: await opt('broll/pd-brand.mp4'), bottimaReel: await opt('social/bottima-reel.mp4'), massjugoReel: await opt('social/massjugo-reel.mp4')},
    social: ['social/rgds-before-after.png', 'social/bottima-scalp-1.png', 'social/pd-bottleneck.png', 'social/rgds-hurricane-1.png', 'social/bottima-aftercare.png', 'social/pd-soulverve-1.png', 'social/rgds-5star.png', 'social/bottima-beard.png', 'social/pd-three-systems.png', 'social/rgds-checkup-1.png', 'social/bottima-scalp-2.png', 'social/pd-friction.png'],
    audio: {vo: await opt('audio/pf-vo.mp3'), music: await opt('audio/pf-music.mp3')},
  };
}

const emptyCap = {file: '', poster: ''};

// A client's reel: the plan in public/plans/current.json says everything (scripts/produce.mjs writes it).
const emptyReel: ReelPlan = {client: {short: '', name: '', phone: '', area: '', brand: {primary: '#fff', accent: '#fff', dark: '#000', light: '#fff', font: 'Inter', logo: ''}, close: {line: '', sub: ''}}, seconds: 1, audio: {}, scenes: []};

export const Root: React.FC = () => (
  <>
    <Composition
      id="ClientReel"
      component={ClientReel}
      durationInFrames={30}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={{plan: emptyReel}}
      calculateMetadata={async () => {
        const plan: ReelPlan = await fetch(staticFile('plans/current.json')).then((r) => r.json());
        return {props: {plan}, durationInFrames: Math.round(plan.seconds * 30)};
      }}
    />
    <Composition
      id="Portfolio"
      component={Portfolio}
      durationInFrames={PORTFOLIO_FRAMES}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={{assets: {captures: {pd: emptyCap, pdResults: emptyCap, rgds: emptyCap, hmr: emptyCap, bottima: emptyCap, width: 1080, height: 2336}, films: {}, social: [], audio: {}} as PortfolioAssets}}
      calculateMetadata={async () => ({props: {assets: await portfolioAssets()}})}
    />
    <Composition
      id="PdSpot"
      component={PdSpot}
      durationInFrames={PD_FRAMES}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={{assets: {captures: {hero: '', areas: '', pillars: '', results: '', book: '', width: 1080, height: 2336, resultsFocus: null}, audio: {}} as PdAssets}}
      calculateMetadata={async () => ({props: {assets: await pdAssets()}})}
    />
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
