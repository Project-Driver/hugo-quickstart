// "7 AM": a thirty-second spot, cut like television, not like a screen recording.
//
// The phone is a lit object in space. The camera never stops moving, slowly.
// Type appears one line at a time, on the beats of the voice read in
// docs/spot-7am.md. Captured footage plays on the phone's screen; a generated
// or filmed clip drops into the b-roll slot when public/broll/ has one, and the
// voice and music play when public/audio/ has them.

import {
  AbsoluteFill,
  Audio,
  Easing,
  Img,
  interpolate,
  OffthreadVideo,
  Sequence,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import '@fontsource/inter/500.css';
import '@fontsource/inter/700.css';
import '@fontsource/inter/800.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/700.css';
import type sampleBoard from './sample-board.json';

type Board = typeof sampleBoard;
export type SpotAssets = {
  captures: {board: string; money: string; hero: string; moneyFocus: {x: number; y: number; w: number; h: number} | null; width: number; height: number};
  broll: {dashboard?: string; van?: string};
  audio: {vo?: string; music?: string};
};

const C = {bg: '#050506', text: '#f4f5f7', muted: '#9aa0a6', yellow: '#ffd400', red: '#ff4d4f', amber: '#ffb020', line: '#2a2d33', panel: '#101114'};
const sans = "'Inter', sans-serif";
const mono = "'JetBrains Mono', monospace";
const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;
const FPS = 30;
const sec = (s: number) => Math.round(s * FPS);

// The beats, in seconds, from the script.
const T = {
  open: [0, 3],
  buzz: [3, 6],
  text: [6, 10.8],
  board: [10.8, 17],
  money: [17, 22.4],
  dawn: [22.4, 24.7],
  logo: [24.7, 30],
} as const;
export const SPOT_FRAMES = sec(30);

// Film grain: a fresh noise seed every frame so it crawls like stock.
const Grain: React.FC<{opacity?: number}> = ({opacity = 0.09}) => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{pointerEvents: 'none', opacity, mixBlendMode: 'overlay'}}>
      <svg width="100%" height="100%">
        <filter id={`g${f}`}>
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed={f} stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter={`url(#g${f})`} />
      </svg>
    </AbsoluteFill>
  );
};

const Vignette: React.FC = () => (
  <AbsoluteFill style={{pointerEvents: 'none', background: 'radial-gradient(ellipse 70% 60% at 50% 45%, rgba(0,0,0,0) 40%, rgba(0,0,0,.75) 100%)'}} />
);

// Warm light rising from the bottom of frame: dawn, and later the brand's yellow.
const Dawn: React.FC<{strength: number; color?: string; y?: string}> = ({strength, color = C.amber, y = '110%'}) => (
  <AbsoluteFill style={{pointerEvents: 'none', opacity: strength, background: `radial-gradient(ellipse 90% 45% at 50% ${y}, ${color} 0%, rgba(255,176,32,0.18) 35%, rgba(0,0,0,0) 70%)`}} />
);

// A slow, continuous camera move over `length` frames: a push-in with a little drift.
const Camera: React.FC<{length: number; from?: number; to?: number; children: React.ReactNode}> = ({length, from = 1, to = 1.06, children}) => {
  const f = useCurrentFrame();
  const t = interpolate(f, [0, length], [0, 1], clamp);
  const s = from + (to - from) * t;
  return <AbsoluteFill style={{transform: `scale(${s}) translate(${-8 * t}px, ${6 * t}px)`}}>{children}</AbsoluteFill>;
};

// One line of the read. Fades and tracks in on its beat; holds; fades out.
const Line: React.FC<{at: number; hold: number; children: React.ReactNode; size?: number; color?: string; y?: number; align?: 'left' | 'center'}> = ({
  at, hold, children, size = 64, color = C.text, y = 1560, align = 'left',
}) => {
  const f = useCurrentFrame();
  const start = sec(at);
  const end = start + sec(hold);
  const opacity = interpolate(f, [start, start + 14, end - 10, end], [0, 1, 1, 0], clamp);
  const track = interpolate(f, [start, start + 24], [4, 0], {...clamp, easing: Easing.out(Easing.cubic)});
  const rise = interpolate(f, [start, start + 24], [18, 0], {...clamp, easing: Easing.out(Easing.cubic)});
  return (
    <div
      style={{
        position: 'absolute', left: 84, right: 84, top: y, opacity, transform: `translateY(${rise}px)`,
        fontFamily: sans, fontWeight: 500, fontSize: size, lineHeight: 1.22, color, letterSpacing: track - 1, textAlign: align,
        textShadow: '0 2px 30px rgba(0,0,0,.9)',
      }}
    >
      {children}
    </div>
  );
};

// The phone as an object: bezel, glass, a light sweep across it, and its glow on the surroundings.
const Phone: React.FC<{children?: React.ReactNode; rx?: number; ry?: number; glow?: number; sweepAt?: number; width?: number; y?: number}> = ({
  children, rx = 8, ry = -14, glow = 0.35, sweepAt = 10, width = 640, y = 0,
}) => {
  const f = useCurrentFrame();
  const height = width * 2.06;
  const sweep = interpolate(f, [sweepAt, sweepAt + 70], [-60, 160], clamp);
  return (
    <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center', perspective: 2400}}>
      <div
        style={{
          width, height, borderRadius: width * 0.14, background: '#0a0a0b', border: `3px solid #26282d`,
          boxShadow: `0 60px 140px rgba(0,0,0,.85), 0 0 120px rgba(255,212,0,${glow * 0.18}), inset 0 0 0 2px #000`,
          transform: `translateY(${y}px) rotateX(${rx}deg) rotateY(${ry}deg)`, transformStyle: 'preserve-3d', position: 'relative',
        }}
      >
        <div style={{position: 'absolute', inset: 20, borderRadius: width * 0.11, overflow: 'hidden', background: '#000'}}>
          {children}
          {/* glass: a soft reflection along the top and a light sweep that crosses once */}
          <div style={{position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(255,255,255,.07) 0%, rgba(255,255,255,0) 22%)', pointerEvents: 'none'}} />
          <div style={{position: 'absolute', top: '-20%', bottom: '-20%', width: '38%', left: `${sweep}%`, transform: 'skewX(-18deg)', background: 'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,.16) 50%, rgba(255,255,255,0) 100%)', pointerEvents: 'none'}} />
        </div>
      </div>
    </AbsoluteFill>
  );
};

// A capture on the phone's screen, scaled to fit, optionally zoomed toward a box.
const Screen: React.FC<{src: string; width: number; captureWidth: number; captureHeight: number; startFrom?: number; zoomTo?: {x: number; y: number; w: number; h: number} | null; zoomAt?: number}> = ({
  src, width, captureWidth, captureHeight, startFrom = 0, zoomTo = null, zoomAt = 60,
}) => {
  const f = useCurrentFrame();
  const scale = (width - 40) / captureWidth;
  let zoom = 1;
  let origin = '0 0';
  if (zoomTo) {
    const t = interpolate(f, [zoomAt, zoomAt + 36], [0, 1], {...clamp, easing: Easing.inOut(Easing.cubic)});
    zoom = 1 + t * 0.16;
    origin = `${captureWidth / 2}px ${Math.max(160, zoomTo.y + zoomTo.h / 2)}px`;
  }
  return (
    <div style={{width: captureWidth, height: captureHeight, transformOrigin: '0 0', transform: `scale(${scale})`}}>
      <div style={{transformOrigin: origin, transform: `scale(${zoom})`, width: captureWidth, height: captureHeight}}>
        <OffthreadVideo src={staticFile(src)} startFrom={startFrom} muted style={{width: captureWidth, height: captureHeight}} />
      </div>
    </div>
  );
};

// A b-roll slot: a filmed or generated clip if one exists, otherwise a lit, abstract stand-in.
const BRoll: React.FC<{src?: string; fallback: React.ReactNode; position?: string}> = ({src, fallback, position = '50% 50%'}) => (
  <AbsoluteFill>{src ? <OffthreadVideo src={staticFile(src)} muted style={{width: '100%', height: '100%', objectFit: 'cover', objectPosition: position}} /> : fallback}</AbsoluteFill>
);

// 0–6: the phone face-down on a dashboard, dawn coming, one buzz.
const Open: React.FC<{board: Board; assets: SpotAssets}> = ({board, assets}) => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const buzzAt = sec(3.9);
  const buzz = f >= buzzAt && f < buzzAt + 14 ? Math.sin((f - buzzAt) * 1.9) * 5 : 0;
  const lit = spring({frame: f - buzzAt, fps, config: {damping: 30}});
  const dawn = interpolate(f, [0, sec(6)], [0.08, 0.32], clamp);
  return (
    <AbsoluteFill style={{background: C.bg}}>
      <BRoll
        src={assets.broll.dashboard}
        position="46% 58%"
        fallback={
          <AbsoluteFill>
            {/* a dashboard: a dark curved surface with the horizon's first light behind it */}
            <Dawn strength={dawn} y="72%" />
            <div style={{position: 'absolute', left: -200, right: -200, top: 1120, height: 1200, borderRadius: '50% 50% 0 0 / 30% 30% 0 0', background: 'linear-gradient(180deg, #141518 0%, #08090a 40%)', boxShadow: '0 -30px 80px rgba(0,0,0,.8)'}} />
          </AbsoluteFill>
        }
      />
      {assets.broll.dashboard ? null : (
      <Camera length={sec(6)} from={1.08} to={1.16}>
        <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center', perspective: 2000}}>
          {/* the phone, face down: only the light leaking out around its edges tells us it woke up */}
          <div
            style={{
              width: 520, height: 1070, borderRadius: 74, background: 'linear-gradient(160deg, #1a1b1f 0%, #0b0c0e 60%)', border: '2px solid #2a2d33',
              transform: `rotateX(62deg) rotateZ(-8deg) translateX(${buzz}px) translateY(120px)`,
              boxShadow: `0 40px 90px rgba(0,0,0,.9), 0 0 ${40 + lit * 90}px rgba(255,212,0,${lit * 0.55}), 0 0 ${lit * 260}px rgba(255,212,0,${lit * 0.25})`,
            }}
          >
            <div style={{position: 'absolute', top: 40, left: 40, width: 130, height: 130, borderRadius: 40, background: '#0a0a0b', border: '2px solid #2a2d33'}} />
          </div>
        </AbsoluteFill>
      </Camera>
      )}
      <Line at={1.0} hold={2.7} size={58}>Yesterday, <b style={{fontWeight: 800}}>{words(board.lap.callsIn)} people</b> called you.</Line>
      <Line at={4.0} hold={2.0} size={58}>
        <b style={{fontWeight: 800, color: C.red}}>{words(board.lap.missed)}</b> you never got to.
      </Line>
    </AbsoluteFill>
  );
};

const words = (n: number) => ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'][n] ?? String(n);

// 6–10: the text, shot like a product.
const Text: React.FC<{board: Board; assets: SpotAssets}> = ({board, assets}) => {
  const f = useCurrentFrame();
  const top = board.moneyOnTheTable[0];
  const lines = [
    `PIT BOARD · ${board.account.name}`,
    `Calls ${board.lap.callsIn} · Missed ${board.lap.missed} (${board.lap.recovered} texted back)`,
    `New leads ${board.lap.newLeads} · Booked ${board.lap.booked}`,
    `On the table: ${board.moneyOnTheTableTotal}`,
    `${top.label}: ${top.name}`,
  ];
  const rx = interpolate(f, [0, sec(4)], [14, 6], clamp);
  const ry = interpolate(f, [0, sec(4)], [-22, -10], clamp);
  return (
    <AbsoluteFill style={{background: C.bg}}>
      {/* shallow focus: the site, far out of focus, behind the phone */}
      <Img src={staticFile(assets.captures.hero.replace('.mp4', '.jpg'))} style={{position: 'absolute', width: '160%', left: '-30%', top: '-10%', filter: 'blur(38px) brightness(.35)', transform: 'scale(1.1)'}} />
      <Dawn strength={0.22} />
      <Camera length={sec(4)} from={1.02} to={1.1}>
        <Phone rx={rx} ry={ry} glow={0.6} sweepAt={20}>
          <div style={{paddingTop: 150, textAlign: 'center', fontFamily: sans, color: C.text}}>
            <div style={{fontSize: 34, fontWeight: 500, color: C.muted, letterSpacing: 1}}>{board.todayLabel}</div>
            <div style={{fontSize: 168, fontWeight: 500, lineHeight: 1, letterSpacing: -6, marginTop: 6}}>7:00</div>
          </div>
          <div style={{margin: '90px 26px 0 26px', display: 'flex', justifyContent: 'space-between', fontFamily: sans, color: C.muted, fontSize: 19, fontWeight: 700, padding: '0 8px'}}>
            <span>MESSAGES · PROJECT DRIVER</span>
            <span>now</span>
          </div>
          <div style={{margin: '10px 26px 0', background: C.panel, border: `1.5px solid ${C.line}`, borderRadius: 26, padding: '24px 26px', fontFamily: mono, fontSize: 21, lineHeight: 1.6}}>
            {lines.map((line, i) => {
              const start = 16 + i * 12;
              const shown = Math.floor(interpolate(f, [start, start + 12], [0, line.length], clamp));
              const last = i === lines.length - 1;
              return (
                <div key={i} style={{color: i === 0 ? C.yellow : last ? C.red : C.text, fontWeight: i === 0 || last ? 700 : 400, minHeight: 34}}>
                  {line.slice(0, shown)}
                </div>
              );
            })}
          </div>
        </Phone>
      </Camera>
      <Line at={0.7} hold={2.3} size={58}>One of them still needs you.</Line>
      <Line at={3.1} hold={1.7} size={58}>This is her number.</Line>
    </AbsoluteFill>
  );
};

// 10–15: the board itself.
const BoardScene: React.FC<{assets: SpotAssets}> = ({assets}) => {
  const f = useCurrentFrame();
  const ry = interpolate(f, [0, sec(5)], [12, -6], clamp);
  return (
    <AbsoluteFill style={{background: C.bg}}>
      <Dawn strength={0.18} color={C.yellow} />
      <Camera length={sec(5)} from={1.04} to={1.12}>
        <Phone rx={4} ry={ry} glow={0.45} sweepAt={40} width={560} y={-150}>
          <Screen src={assets.captures.board} width={560} captureWidth={assets.captures.width} captureHeight={assets.captures.height} startFrom={sec(1.2)} />
        </Phone>
      </Camera>
      <Line at={0.7} hold={3.7} size={54}>Pit Board reads your phone, your inbox, your calendar.</Line>
      <Line at={4.5} hold={1.7} size={54}>
        Every morning at <b style={{fontWeight: 800, color: C.yellow}}>seven.</b>
      </Line>
    </AbsoluteFill>
  );
};

// 15–20: the money, and the tap.
const MoneyScene: React.FC<{board: Board; assets: SpotAssets}> = ({board, assets}) => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const tapAt = sec(3.3);
  const tap = spring({frame: f - tapAt, fps, config: {damping: 12, mass: 0.5}});
  const fx = assets.captures.moneyFocus;
  return (
    <AbsoluteFill style={{background: C.bg}}>
      <Dawn strength={0.2} color={C.yellow} />
      <Camera length={sec(5)} from={1.08} to={1.16}>
        <Phone rx={2} ry={-4} glow={0.5} sweepAt={-100} width={600} y={-150}>
          <Screen src={assets.captures.money} width={600} captureWidth={assets.captures.width} captureHeight={assets.captures.height} startFrom={sec(2.4)} zoomTo={fx} zoomAt={10} />
          {/* the tap: a ring on the row's Open button */}
          {fx && f >= tapAt ? (
            <div
              style={{
                position: 'absolute',
                left: ((fx.x + fx.w - 80) * (600 - 40)) / assets.captures.width,
                top: ((fx.y + fx.h / 2) * (600 - 40)) / assets.captures.width,
                width: 24, height: 24, marginLeft: -12, marginTop: -12, borderRadius: '50%',
                border: `3px solid ${C.yellow}`, transform: `scale(${1 + tap * 4})`, opacity: 1 - tap,
              }}
            />
          ) : null}
        </Phone>
      </Camera>
      <Line at={0.6} hold={2.4} size={54}>
        Every dollar sitting on the table. <b style={{fontWeight: 800, color: C.yellow}}>${board.unpaidTotal.toLocaleString('en-US')}</b> of it overdue.
      </Line>
      <Line at={3.0} hold={2.4} size={54}>One tap to go get it.</Line>
    </AbsoluteFill>
  );
};

// 20–24: the van at dawn. Silence.
const DawnScene: React.FC<{assets: SpotAssets}> = ({assets}) => {
  const f = useCurrentFrame();
  const sun = interpolate(f, [0, sec(4)], [0.35, 0.7], clamp);
  return (
    <AbsoluteFill style={{background: C.bg}}>
      <BRoll
        src={assets.broll.van}
        fallback={
          <AbsoluteFill>
            {/* a horizon: the sun just under it, the road a dark plane, headlights crossing */}
            <Dawn strength={sun} y="62%" />
            <div style={{position: 'absolute', left: 0, right: 0, top: '62%', height: 2, background: 'rgba(255,200,80,.5)', filter: 'blur(1px)'}} />
            <div style={{position: 'absolute', left: 0, right: 0, top: '62%', bottom: 0, background: 'linear-gradient(180deg, #0a0a0b 0%, #050506 100%)'}} />
            <div style={{position: 'absolute', left: 0, right: 0, top: '62%', height: 260, background: 'linear-gradient(180deg, rgba(255,176,32,.10) 0%, rgba(0,0,0,0) 100%)'}} />
          </AbsoluteFill>
        }
      />
      <Camera length={sec(4)} from={1} to={1.05}>
        <AbsoluteFill />
      </Camera>
      <Line at={0.5} hold={1.8} size={72} y={1460}>
        <b style={{fontWeight: 800}}>Before the first job.</b>
      </Line>
    </AbsoluteFill>
  );
};

const Logo: React.FC<{size: number}> = ({size}) => (
  <svg width={size} height={size} viewBox="0 0 64 64">
    <rect width="64" height="64" rx="12" fill="#0b0c0e" />
    <rect x="12" y="14" width="40" height="10" rx="2" fill={C.yellow} />
    <rect x="12" y="28" width="40" height="10" rx="2" fill="#fff" />
    <rect x="12" y="42" width="24" height="10" rx="2" fill={C.yellow} />
  </svg>
);

// 24–30: the mark. A yellow line draws across. The URL.
const End: React.FC = () => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const inS = spring({frame: f - 6, fps, config: {damping: 200}});
  const line = interpolate(f, [sec(0.8), sec(2)], [0, 1], {...clamp, easing: Easing.out(Easing.cubic)});
  const url = interpolate(f, [sec(2.2), sec(2.9)], [0, 1], clamp);
  return (
    <AbsoluteFill style={{background: C.bg, justifyContent: 'center', alignItems: 'center', fontFamily: sans, color: C.text}}>
      <Dawn strength={0.14} color={C.yellow} y="120%" />
      <div style={{opacity: inS, transform: `scale(${0.96 + inS * 0.04})`, display: 'flex', alignItems: 'center', gap: 34}}>
        <div style={{border: `2px solid ${C.line}`, borderRadius: 30}}>
          <Logo size={132} />
        </div>
        <div style={{fontSize: 92, fontWeight: 800, letterSpacing: 6}}>
          PIT <span style={{color: C.yellow}}>BOARD</span>
        </div>
      </div>
      <div style={{width: 560 * line, height: 3, background: C.yellow, marginTop: 54, boxShadow: `0 0 30px ${C.yellow}`}} />
      <div style={{opacity: url, marginTop: 44, fontSize: 34, color: C.muted, letterSpacing: 2, fontWeight: 500}}>Your business on one board.</div>
      <div style={{opacity: url, marginTop: 14, fontSize: 30, color: C.text, letterSpacing: 3, fontWeight: 700}}>pitboard.project-driver.com</div>
      <div style={{opacity: url, position: 'absolute', bottom: 120, fontSize: 24, color: C.muted, letterSpacing: 4, fontWeight: 500}}>FROM PROJECT DRIVER</div>
    </AbsoluteFill>
  );
};

// Fades a scene in over the previous one; scenes overlap by XF frames.
const XF = 10;
const Fade: React.FC<{length: number; out?: boolean; children: React.ReactNode}> = ({length, out = false, children}) => {
  const f = useCurrentFrame();
  const opacity = interpolate(f, out ? [0, XF, length - 20, length] : [0, XF], out ? [0, 1, 1, 0] : [0, 1], clamp);
  return <AbsoluteFill style={{opacity}}>{children}</AbsoluteFill>;
};

export const Spot: React.FC<{board: Board; assets: SpotAssets}> = ({board, assets}) => {
  const scenes: [readonly [number, number], React.ReactNode][] = [
    [[0, 6], <Open board={board} assets={assets} />],
    [T.text, <Text board={board} assets={assets} />],
    [T.board, <BoardScene assets={assets} />],
    [T.money, <MoneyScene board={board} assets={assets} />],
    [T.dawn, <DawnScene assets={assets} />],
    [T.logo, <End />],
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
