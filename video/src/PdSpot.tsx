// "A dozen tools": a thirty-second spot for project-driver.com, cut to a
// recorded read. Real captures of the live site play on the phone; type lands
// on the beats of the voice. Same cinematic language as the Pit Board spot.

import {AbsoluteFill, Audio, Img, interpolate, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {C, sans, mono, clamp, sec, Grain, Vignette, Dawn, Camera, Line, Phone, Screen, XF, Fade} from './cinema';

export type PdAssets = {
  captures: {hero: string; areas: string; pillars: string; results: string; book: string; width: number; height: number; resultsFocus: {x: number; y: number; w: number; h: number} | null};
  audio: {vo?: string; music?: string};
};

const BLUE = '#3b6fe8';
export const PD_FRAMES = sec(30);

// Beats measured from the read (silencedetect on pd-vo.mp3).
const T = {
  hook: [0, 3.7],
  pain: [3.7, 8.2],
  plan: [8.2, 12.0],
  areas: [12.0, 15.9],
  team: [15.9, 19.5],
  proof: [19.5, 23.0],
  end: [23.0, 30],
} as const;

// 0–3.7: a dozen tools that don't talk. Type only, the site far out of focus behind.
const Hook: React.FC<{assets: PdAssets}> = ({assets}) => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{background: C.bg}}>
      <Img src={staticFile(assets.captures.hero.replace('.mp4', '.jpg'))} style={{position: 'absolute', width: '170%', left: '-35%', top: '-8%', filter: 'blur(40px) brightness(.28)', transform: `scale(${1.05 + f * 0.0006})`}} />
      <Dawn strength={0.16} color={BLUE} y="115%" />
      <AbsoluteFill style={{justifyContent: 'center', padding: 84, fontFamily: sans, color: C.text}}>
        <Line at={0.15} hold={3.4} size={54} y={760} color={C.muted}>Your business runs on</Line>
        <Line at={0.6} hold={3.0} size={124} y={860}>
          <b style={{fontWeight: 800, letterSpacing: -4, lineHeight: 1.0}}>a dozen tools</b>
        </Line>
        <Line at={1.6} hold={2.0} size={64} y={1180}>that don't talk to each other.</Line>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// 3.7–8.2: three short blows, over the site scrolling on the phone.
const Pain: React.FC<{assets: PdAssets}> = ({assets}) => {
  const f = useCurrentFrame();
  const ry = interpolate(f, [0, sec(4.5)], [-16, -6], clamp);
  return (
    <AbsoluteFill style={{background: C.bg}}>
      <Dawn strength={0.14} color={BLUE} />
      <Camera length={sec(4.5)} from={1.02} to={1.08}>
        <Phone rx={6} ry={ry} glow={0.3} sweepAt={10} width={560} y={-170}>
          <Screen src={assets.captures.hero} width={560} captureWidth={assets.captures.width} captureHeight={assets.captures.height} startFrom={sec(0.5)} />
        </Phone>
      </Camera>
      <Line at={0.05} hold={1.5} size={64} y={1500}><b style={{fontWeight: 800}}>Calls get missed.</b></Line>
      <Line at={1.25} hold={1.5} size={64} y={1500}><b style={{fontWeight: 800}}>Follow-up slips.</b></Line>
      <Line at={2.6} hold={1.9} size={64} y={1500}><b style={{fontWeight: 800}}>Nobody owns the system.</b></Line>
    </AbsoluteFill>
  );
};

// 8.2–12: plan it, build it, run it.
const Plan: React.FC<{assets: PdAssets}> = ({assets}) => {
  const f = useCurrentFrame();
  const ry = interpolate(f, [0, sec(3.8)], [8, -4], clamp);
  return (
    <AbsoluteFill style={{background: C.bg}}>
      <Dawn strength={0.18} color={BLUE} />
      <Camera length={sec(3.8)} from={1.04} to={1.1}>
        <Phone rx={3} ry={ry} glow={0.4} sweepAt={20} width={560} y={-170}>
          <Screen src={assets.captures.areas} width={560} captureWidth={assets.captures.width} captureHeight={assets.captures.height} startFrom={0} />
        </Phone>
      </Camera>
      <Line at={0.1} hold={3.6} size={44} y={1480} color={C.muted}>Project Driver</Line>
      <Line at={0.5} hold={3.2} size={76} y={1545}>
        <b style={{fontWeight: 800}}>plans it, builds it, </b><b style={{fontWeight: 800, color: BLUE}}>runs it.</b>
      </Line>
    </AbsoluteFill>
  );
};

// 12–15.9: the four areas, one word per beat.
const Areas: React.FC<{assets: PdAssets}> = ({assets}) => {
  const f = useCurrentFrame();
  const words = ['Marketing.', 'Operations.', 'Systems.', 'Leadership.'];
  return (
    <AbsoluteFill style={{background: C.bg}}>
      <Dawn strength={0.2} color={BLUE} />
      <Camera length={sec(3.9)} from={1.06} to={1.12}>
        <Phone rx={2} ry={-6} glow={0.45} sweepAt={-100} width={600} y={-170}>
          <Screen src={assets.captures.areas} width={600} captureWidth={assets.captures.width} captureHeight={assets.captures.height} startFrom={sec(3.8)} />
        </Phone>
      </Camera>
      <div style={{position: 'absolute', left: 84, right: 84, top: 1440, display: 'grid', gridTemplateColumns: '1fr', gap: '4px', fontFamily: sans}}>
        {words.map((w, i) => {
          const at = sec(0.05 + i * 0.78);
          const s = spring({frame: f - at, fps: 30, config: {damping: 200}});
          return (
            <div key={w} style={{fontSize: 62, fontWeight: 800, lineHeight: 1.15, color: i === 3 ? BLUE : C.text, opacity: s, transform: `translateY(${(1 - s) * 24}px)`, letterSpacing: -1}}>
              {w}
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// 15.9–19.5: one team, inside the tools you already use.
const Team: React.FC<{assets: PdAssets}> = ({assets}) => {
  const f = useCurrentFrame();
  const ry = interpolate(f, [0, sec(3.6)], [-10, 4], clamp);
  return (
    <AbsoluteFill style={{background: C.bg}}>
      <Dawn strength={0.16} color={BLUE} />
      <Camera length={sec(3.6)} from={1.02} to={1.09}>
        <Phone rx={4} ry={ry} glow={0.35} sweepAt={14} width={560} y={-170}>
          <Screen src={assets.captures.pillars} width={560} captureWidth={assets.captures.width} captureHeight={assets.captures.height} startFrom={sec(0.8)} />
        </Phone>
      </Camera>
      <Line at={0.1} hold={3.4} size={62} y={1500}>
        <b style={{fontWeight: 800}}>One team,</b> inside the tools you already use.
      </Line>
    </AbsoluteFill>
  );
};

// 19.5–23: proof. The results page, punched in, with one real number over it.
const Proof: React.FC<{assets: PdAssets}> = ({assets}) => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const stat = spring({frame: f - sec(1.4), fps, config: {damping: 18}});
  return (
    <AbsoluteFill style={{background: C.bg}}>
      <Dawn strength={0.2} color={BLUE} />
      <Camera length={sec(3.5)} from={1.06} to={1.14}>
        <Phone rx={2} ry={-3} glow={0.5} sweepAt={-100} width={600} y={-170}>
          <Screen src={assets.captures.results} width={600} captureWidth={assets.captures.width} captureHeight={assets.captures.height} startFrom={sec(2.4)} zoomTo={assets.captures.resultsFocus} zoomAt={12} />
        </Phone>
      </Camera>
      <div style={{position: 'absolute', left: 60, top: 260, padding: '28px 36px', borderRadius: 28, background: 'rgba(5,5,6,.82)', boxShadow: '0 30px 80px rgba(0,0,0,.6)', opacity: stat, transform: `scale(${0.9 + stat * 0.1})`, transformOrigin: 'left top', fontFamily: sans}}>
        <div style={{fontSize: 150, fontWeight: 800, color: BLUE, letterSpacing: -5, lineHeight: 1, textShadow: '0 6px 40px rgba(0,0,0,.9)'}}>+356%</div>
        <div style={{fontSize: 34, color: C.text, fontWeight: 600, marginTop: 8, maxWidth: 700}}>more calls from Google in 90 days</div>
        <div style={{fontSize: 28, color: C.muted, marginTop: 4}}>RGDS Garage Doors, a real client</div>
      </div>
      <Line at={0.05} hold={1.4} size={64} y={1500}><b style={{fontWeight: 800}}>Real businesses.</b></Line>
      <Line at={1.4} hold={2.0} size={64} y={1500}><b style={{fontWeight: 800}}>Real results.</b></Line>
    </AbsoluteFill>
  );
};

// 23–30: the mark, the ask, the number.
const End: React.FC = () => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const inS = spring({frame: f - 4, fps, config: {damping: 200}});
  const line = interpolate(f, [sec(0.9), sec(2.1)], [0, 1], clamp);
  const rest = interpolate(f, [sec(1.6), sec(2.4)], [0, 1], clamp);
  return (
    <AbsoluteFill style={{background: C.bg, justifyContent: 'center', alignItems: 'center', fontFamily: sans, color: C.text}}>
      <Dawn strength={0.18} color={BLUE} y="120%" />
      <div style={{opacity: inS, transform: `scale(${0.96 + inS * 0.04})`, width: 760}}>
        <Img src={staticFile('brand/pd-logo-large.webp')} style={{width: 760, filter: 'brightness(0) invert(1)'}} />
      </div>
      <div style={{width: 560 * line, height: 3, background: BLUE, marginTop: 60, boxShadow: `0 0 30px ${BLUE}`}} />
      <div style={{opacity: rest, marginTop: 50, fontSize: 72, fontWeight: 800, letterSpacing: -2}}>Book a call.</div>
      <div style={{opacity: rest, marginTop: 18, fontSize: 36, color: C.text, letterSpacing: 2, fontWeight: 600}}>project-driver.com</div>
      <div style={{opacity: rest, marginTop: 10, fontSize: 32, color: C.muted, fontFamily: mono}}>(754) 315-4467</div>
      <div style={{opacity: rest, position: 'absolute', bottom: 120, fontSize: 24, color: C.muted, letterSpacing: 4, fontWeight: 500}}>WE PLAN IT. BUILD IT. RUN IT.</div>
    </AbsoluteFill>
  );
};

export const PdSpot: React.FC<{assets: PdAssets}> = ({assets}) => {
  const scenes: [readonly [number, number], React.ReactNode][] = [
    [T.hook, <Hook assets={assets} />],
    [T.pain, <Pain assets={assets} />],
    [T.plan, <Plan assets={assets} />],
    [T.areas, <Areas assets={assets} />],
    [T.team, <Team assets={assets} />],
    [T.proof, <Proof assets={assets} />],
    [T.end, <End />],
  ];
  return (
    <AbsoluteFill style={{background: C.bg}}>
      {scenes.map(([[a, b], node], i) => (
        <Sequence key={i} from={sec(a) - (i ? XF : 0)} durationInFrames={sec(b) - sec(a) + (i ? XF : 0)}>
          <Fade length={sec(b) - sec(a) + (i ? XF : 0)} out={i === scenes.length - 1}>
            {node}
          </Fade>
        </Sequence>
      ))}
      <Vignette />
      <Grain />
      {assets.audio.vo ? <Audio src={staticFile(assets.audio.vo)} /> : null}
      {assets.audio.music ? <Audio src={staticFile(assets.audio.music)} volume={0.35} /> : null}
    </AbsoluteFill>
  );
};
