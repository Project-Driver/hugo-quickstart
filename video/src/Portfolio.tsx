// "Started the same way": the Project Driver portfolio spot. Live scrolls of the
// sites we built, the posts and reels we publish, the brand films, and the real
// numbers that followed, cut to a recorded read. Same cinematic language as the
// other spots (cinema.tsx). Beats in T are measured from the voice-over.

import {AbsoluteFill, Audio, Easing, Img, interpolate, OffthreadVideo, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {C, sans, mono, clamp, sec, Grain, Vignette, Dawn, Camera, Line, Phone, Screen, XF, Fade} from './cinema';

type Capture = {file: string; poster: string};
export type PortfolioAssets = {
  captures: {pd: Capture; pdResults: Capture; rgds: Capture; hmr: Capture; bottima: Capture; width: number; height: number};
  films: {rgds?: string; pd?: string; bottimaReel?: string};
  social: string[];
  audio: {vo?: string; music?: string};
};

const BLUE = '#3b6fe8';
export const PORTFOLIO_FRAMES = sec(47);

// Scene beats (seconds). The read is re-timed to these by scripts/retime-vo.mjs
// from spots/portfolio-vo.json, so each phrase lands where its scene starts.
export const T = {
  hook: [0, 4.5],
  invisible: [4.5, 8.5],
  sites: [8.5, 19.0],
  social: [19.0, 25.0],
  films: [25.0, 31.0],
  numbers: [31.0, 40.5],
  end: [40.5, 47],
} as const;

const Label: React.FC<{name: string; url: string; at?: number; hold?: number}> = ({name, url, at = 0.1, hold = 3}) => (
  <>
    <Line at={at} hold={hold} size={56} y={1500}><b style={{fontWeight: 800}}>{name}</b></Line>
    <Line at={at + 0.1} hold={hold - 0.1} size={30} y={1580} color={C.muted}><span style={{fontFamily: mono, letterSpacing: 1}}>{url}</span></Line>
  </>
);

// 0–4.2: "Every business you're about to see started the same way." Type over the PD film, far out of focus.
const Hook: React.FC<{assets: PortfolioAssets}> = ({assets}) => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{background: C.bg}}>
      {assets.films.pd ? (
        <OffthreadVideo src={staticFile(assets.films.pd)} muted startFrom={sec(6)} style={{position: 'absolute', width: '240%', left: '-70%', top: '18%', filter: 'blur(28px) brightness(.3)', transform: `scale(${1.02 + f * 0.0005})`}} />
      ) : null}
      <Dawn strength={0.14} color={BLUE} y="115%" />
      <AbsoluteFill style={{padding: 84, fontFamily: sans, color: C.text}}>
        <Line at={0.2} hold={4.2} size={54} y={720} color={C.muted}>Every business you're about to see</Line>
        <Line at={1.7} hold={2.7} size={112} y={820}>
          <b style={{fontWeight: 800, letterSpacing: -4, lineHeight: 1.02}}>started the same way.</b>
        </Line>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// 4.2–8: "Good at the work. Invisible online." The Bottima site on a phone, dark, then a white flash of light.
const Invisible: React.FC<{assets: PortfolioAssets}> = ({assets}) => {
  const f = useCurrentFrame();
  const bright = interpolate(f, [sec(1.9), sec(3.2)], [0.18, 1], {...clamp, easing: Easing.inOut(Easing.cubic)});
  return (
    <AbsoluteFill style={{background: C.bg}}>
      <Dawn strength={0.1 + bright * 0.12} color={BLUE} />
      <Camera length={sec(3.8)} from={1.0} to={1.07}>
        <AbsoluteFill style={{filter: `brightness(${bright})`}}>
          <Phone rx={7} ry={-14} glow={0.2} sweepAt={sec(1.9)} width={560} y={-160}>
            <Screen src={assets.captures.bottima.file} width={560} captureWidth={assets.captures.width} captureHeight={assets.captures.height} startFrom={sec(1)} />
          </Phone>
        </AbsoluteFill>
      </Camera>
      <Line at={0.15} hold={1.6} size={68} y={1500}><b style={{fontWeight: 800}}>Good at the work.</b></Line>
      <Line at={1.85} hold={2.1} size={68} y={1500}><b style={{fontWeight: 800}}>Invisible online.</b></Line>
    </AbsoluteFill>
  );
};

// 8–18.2: "So we built the websites." Four live sites, one phone each, each scroll recorded from the real page.
const Sites: React.FC<{assets: PortfolioAssets}> = ({assets}) => {
  const f = useCurrentFrame();
  const shots: {c: Capture; name: string; url: string; from: number; len: number; ry: [number, number]; start: number}[] = [
    {c: assets.captures.rgds, name: 'RGDS Garage Doors', url: 'residentialgaragedoorservice.net', from: 0, len: 3.0, ry: [-12, -4], start: sec(2.5)},
    {c: assets.captures.hmr, name: 'Historic Miami Rentals', url: 'historicmiamirentals.com', from: 3.0, len: 2.7, ry: [8, 2], start: sec(2.5)},
    {c: assets.captures.bottima, name: 'Bottima Barbershop', url: 'bottima.com', from: 5.7, len: 2.5, ry: [-6, 0], start: sec(9)},
    {c: assets.captures.pd, name: 'Project Driver', url: 'project-driver.com', from: 8.2, len: 2.3, ry: [6, -2], start: sec(2.5)},
  ];
  return (
    <AbsoluteFill style={{background: C.bg}}>
      <Dawn strength={0.18} color={BLUE} />
      <Line at={0.15} hold={2.8} size={64} y={150}><b style={{fontWeight: 800}}>So we built</b> the websites.</Line>
      {shots.map((s, i) => (
        <Sequence key={s.name} from={sec(s.from)} durationInFrames={sec(s.len) + XF}>
          <Fade length={sec(s.len) + XF}>
            <Camera length={sec(s.len)} from={1.02} to={1.09}>
              <Phone rx={4} ry={interpolate(f - sec(s.from), [0, sec(s.len)], s.ry, clamp)} glow={0.4} sweepAt={12} width={540} y={-60}>
                <Screen src={s.c.file} width={540} captureWidth={assets.captures.width} captureHeight={assets.captures.height} startFrom={s.start} />
              </Phone>
            </Camera>
            <Label name={s.name} url={s.url} at={0.15} hold={s.len - 0.1} />
          </Fade>
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};

// 18.2–24: "The posts. The reels." A wall of the posts we published slides up; then the Bottima reel plays on the phone.
const Social: React.FC<{assets: PortfolioAssets}> = ({assets}) => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const cols = 3;
  const tile = 400;
  const gap = 22;
  const rise = interpolate(f, [0, sec(3.6)], [0, -520], {...clamp, easing: Easing.inOut(Easing.quad)});
  const reelAt = sec(3.2);
  const reelIn = spring({frame: f - reelAt, fps, config: {damping: 200}});
  const wallOut = interpolate(f, [reelAt, reelAt + 18], [1, 0], clamp);
  return (
    <AbsoluteFill style={{background: C.bg}}>
      <Dawn strength={0.16} color={BLUE} />
      <AbsoluteFill style={{opacity: wallOut, perspective: 2000}}>
        <div style={{position: 'absolute', left: -90, top: 420 + rise, width: cols * (tile + gap), transform: 'rotateX(14deg) rotateZ(-6deg) scale(1.02)', transformStyle: 'preserve-3d', display: 'grid', gridTemplateColumns: `repeat(${cols}, ${tile}px)`, gap}}>
          {assets.social.map((src, i) => {
            const at = 4 + (i % cols) * 5 + Math.floor(i / cols) * 7;
            const s = spring({frame: f - at, fps, config: {damping: 200}});
            return (
              <div key={src} style={{width: tile, height: tile, borderRadius: 26, overflow: 'hidden', background: C.panel, boxShadow: '0 30px 70px rgba(0,0,0,.7)', opacity: s, transform: `translateY(${(1 - s) * 60}px)`}}>
                <Img src={staticFile(src)} style={{width: '100%', height: '100%', objectFit: 'cover'}} />
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
      {assets.films.bottimaReel ? (
        <AbsoluteFill style={{opacity: reelIn, transform: `scale(${0.94 + reelIn * 0.06})`}}>
          <Phone rx={5} ry={-10} glow={0.45} sweepAt={reelAt + 10} width={580} y={-120}>
            <OffthreadVideo src={staticFile(assets.films.bottimaReel)} muted startFrom={sec(1)} style={{width: 540, height: 540 * (1920 / 1080), objectFit: 'cover'}} />
          </Phone>
        </AbsoluteFill>
      ) : null}
      <Line at={0.15} hold={3.0} size={68} y={1500}><b style={{fontWeight: 800}}>The posts.</b></Line>
      <Line at={3.25} hold={2.7} size={68} y={1500}><b style={{fontWeight: 800}}>The reels.</b></Line>
    </AbsoluteFill>
  );
};

// A 16:9 film in a vertical frame: the clip full-width in the middle, itself blurred and enlarged behind.
const Film: React.FC<{src: string; startFrom: number; label: string}> = ({src, startFrom, label}) => {
  const f = useCurrentFrame();
  const push = 1 + f * 0.0007;
  return (
    <AbsoluteFill style={{background: C.bg, justifyContent: 'center', alignItems: 'center'}}>
      <OffthreadVideo src={staticFile(src)} muted startFrom={startFrom} style={{position: 'absolute', width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(30px) brightness(.45)', transform: `scale(${1.2 * push})`}} />
      <div style={{width: 1080, height: 608, overflow: 'hidden', boxShadow: '0 40px 120px rgba(0,0,0,.8)', transform: `scale(${push})`}}>
        <OffthreadVideo src={staticFile(src)} muted startFrom={startFrom} style={{width: '100%', height: '100%', objectFit: 'cover'}} />
      </div>
      <div style={{position: 'absolute', left: 84, top: 1290, fontFamily: mono, fontSize: 26, color: C.muted, letterSpacing: 3}}>{label}</div>
    </AbsoluteFill>
  );
};

// 24–29.8: "The films." RGDS's brand film, then Project Driver's.
const Films: React.FC<{assets: PortfolioAssets}> = ({assets}) => (
  <AbsoluteFill style={{background: C.bg}}>
    {assets.films.rgds ? (
      <Sequence from={0} durationInFrames={sec(3.1) + XF}>
        <Fade length={sec(3.1) + XF}><Film src={assets.films.rgds} startFrom={sec(4)} label="BRAND FILM · RGDS GARAGE DOORS" /></Fade>
      </Sequence>
    ) : null}
    {assets.films.pd ? (
      <Sequence from={sec(3.1)} durationInFrames={sec(2.9) + XF}>
        <Fade length={sec(2.9) + XF}><Film src={assets.films.pd} startFrom={sec(20)} label="BRAND FILM · PROJECT DRIVER" /></Fade>
      </Sequence>
    ) : null}
    <Line at={0.15} hold={5.7} size={68} y={1500}><b style={{fontWeight: 800}}>The films.</b></Line>
  </AbsoluteFill>
);

// A number that counts up on its beat.
const Stat: React.FC<{at: number; value: number; prefix?: string; suffix?: string; label: string; big?: boolean}> = ({at, value, prefix = '', suffix = '', label, big = false}) => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const s = spring({frame: f - sec(at), fps, config: {damping: 200}, durationInFrames: 40});
  const n = Math.round(value * interpolate(f, [sec(at), sec(at) + 40], [0, 1], {...clamp, easing: Easing.out(Easing.cubic)}));
  return (
    <div style={{opacity: s, transform: `translateY(${(1 - s) * 30}px)`, fontFamily: sans}}>
      <div style={{fontSize: big ? 150 : 96, fontWeight: 800, color: BLUE, letterSpacing: big ? -6 : -3, lineHeight: 1, textShadow: '0 6px 40px rgba(0,0,0,.9)'}}>{prefix}{n.toLocaleString('en-US')}{suffix}</div>
      <div style={{fontSize: 32, color: C.text, fontWeight: 600, marginTop: 10}}>{label}</div>
    </div>
  );
};

// 29.8–38.6: "And then we watched the numbers move." The results page live on the phone, and the real numbers over it.
const Numbers: React.FC<{assets: PortfolioAssets}> = ({assets}) => {
  const f = useCurrentFrame();
  const panel = interpolate(f, [sec(1.7), sec(2.3)], [0, 1], clamp);
  // Organic search sessions on project-driver.com, June → July 2026 (from the monthly SEO report): 7 → 22.
  const pts = [2, 4, 3, 5, 7, 9, 12, 16, 22];
  const w = 820, h = 220;
  const path = pts.map((v, i) => `${i === 0 ? 'M' : 'L'} ${(i / (pts.length - 1)) * w} ${h - (v / 22) * h}`).join(' ');
  const draw = interpolate(f, [sec(6.9), sec(8.6)], [1, 0], {...clamp, easing: Easing.inOut(Easing.cubic)});
  const chart = interpolate(f, [sec(6.7), sec(7.2)], [0, 1], clamp);
  return (
    <AbsoluteFill style={{background: C.bg}}>
      <Dawn strength={0.2} color={BLUE} />
      <Camera length={sec(9.5)} from={1.04} to={1.14}>
        <Phone rx={2} ry={-4} glow={0.5} sweepAt={-100} width={600} y={-150}>
          <Screen src={assets.captures.pdResults.file} width={600} captureWidth={assets.captures.width} captureHeight={assets.captures.height} startFrom={sec(4)} />
        </Phone>
      </Camera>
      <Line at={0.15} hold={1.8} size={62} y={1500}>And then we watched <b style={{fontWeight: 800}}>the numbers move.</b></Line>
      <div style={{position: 'absolute', left: 60, right: 60, top: 300, padding: '40px 44px', borderRadius: 32, background: 'rgba(5,5,6,.95)', backdropFilter: 'blur(24px)', boxShadow: '0 30px 80px rgba(0,0,0,.7)', opacity: panel, fontFamily: sans}}>
        <div style={{fontSize: 26, color: C.muted, letterSpacing: 3, fontFamily: mono, marginBottom: 26}}>RGDS GARAGE DOORS · FIRST 90 DAYS</div>
        <Stat at={2.0} value={356} prefix="+" suffix="%" label="more calls from Google" big />
        <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 30, marginTop: 34}}>
          <Stat at={4.8} value={267} prefix="+" suffix="%" label="more website visitors" />
          <Stat at={5.2} value={1555} label="keywords ranking" />
        </div>
        <div style={{opacity: chart, marginTop: 40}}>
          <div style={{fontSize: 26, color: C.muted, letterSpacing: 3, fontFamily: mono, marginBottom: 14}}>PROJECT-DRIVER.COM · GOOGLE VISITS, JUNE TO JULY</div>
          <svg width={w} height={h + 10} style={{overflow: 'visible'}}>
            <defs>
              <linearGradient id="pfg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={BLUE} stopOpacity="0.35" /><stop offset="1" stopColor={BLUE} stopOpacity="0" /></linearGradient>
            </defs>
            <path d={`${path} L ${w} ${h} L 0 ${h} Z`} fill="url(#pfg)" opacity={1 - draw} />
            <path d={path} fill="none" stroke={BLUE} strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={draw} style={{filter: `drop-shadow(0 0 16px ${BLUE})`}} />
          </svg>
          <div style={{display: 'flex', justifyContent: 'space-between', marginTop: 12, fontSize: 28, color: C.text, fontWeight: 600}}>
            <span style={{color: C.muted}}>7 in June</span><span>22 in July · <span style={{color: BLUE}}>3×</span></span>
          </div>
        </div>
        <div style={{marginTop: 26, fontSize: 22, color: C.muted}}>Real numbers, one client and our own site. Google Business Profile, Search Console and GA4. Yours will differ.</div>
      </div>
    </AbsoluteFill>
  );
};

// 38.6–46: the mark, the promise, the ask.
const End: React.FC = () => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const inS = spring({frame: f - 4, fps, config: {damping: 200}});
  const line = interpolate(f, [sec(0.9), sec(2.1)], [0, 1], clamp);
  const words = ['We plan it.', 'Build it.', 'Run it.'];
  const rest = interpolate(f, [sec(3.9), sec(4.5)], [0, 1], clamp);
  return (
    <AbsoluteFill style={{background: C.bg, justifyContent: 'center', alignItems: 'center', fontFamily: sans, color: C.text}}>
      <Dawn strength={0.18} color={BLUE} y="120%" />
      <div style={{opacity: inS, transform: `scale(${0.96 + inS * 0.04})`, width: 760}}>
        <Img src={staticFile('brand/pd-logo-large.webp')} style={{width: 760, filter: 'brightness(0) invert(1)'}} />
      </div>
      <div style={{width: 560 * line, height: 3, background: BLUE, marginTop: 60, boxShadow: `0 0 30px ${BLUE}`}} />
      <div style={{display: 'flex', gap: 22, marginTop: 50}}>
        {words.map((w, i) => {
          const s = spring({frame: f - sec(1.5 + i * 0.7), fps, config: {damping: 200}});
          return <div key={w} style={{fontSize: 54, fontWeight: 800, letterSpacing: -1, opacity: s, transform: `translateY(${(1 - s) * 20}px)`, color: i === 2 ? BLUE : C.text}}>{w}</div>;
        })}
      </div>
      <div style={{opacity: rest, marginTop: 60, fontSize: 84, fontWeight: 800, letterSpacing: -2}}>Book a call.</div>
      <div style={{opacity: rest, marginTop: 18, fontSize: 36, color: C.text, letterSpacing: 2, fontWeight: 600}}>project-driver.com</div>
      <div style={{opacity: rest, marginTop: 10, fontSize: 32, color: C.muted, fontFamily: mono}}>(754) 315-4467</div>
    </AbsoluteFill>
  );
};

export const Portfolio: React.FC<{assets: PortfolioAssets}> = ({assets}) => {
  const scenes: [readonly [number, number], React.ReactNode][] = [
    [T.hook, <Hook assets={assets} />],
    [T.invisible, <Invisible assets={assets} />],
    [T.sites, <Sites assets={assets} />],
    [T.social, <Social assets={assets} />],
    [T.films, <Films assets={assets} />],
    [T.numbers, <Numbers assets={assets} />],
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
      {assets.audio.music ? <Audio src={staticFile(assets.audio.music)} volume={(f) => interpolate(f, [0, 30, PORTFOLIO_FRAMES - 60, PORTFOLIO_FRAMES], [0, 0.28, 0.28, 0], clamp)} /> : null}
    </AbsoluteFill>
  );
};
