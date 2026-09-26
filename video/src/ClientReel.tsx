// A client's reel, driven entirely by a plan (public/plans/current.json).
// The plan names the client (colors, font, logo, phone), the scenes, the lines
// of type timed to the read, and the audio. Nothing about Project Driver
// appears: this is the client's spot, in the client's brand.
//
// Scene types: film (a 16:9 clip letterboxed at full width over a blurred
// fill, header bars cropped), clip (a 9:16 clip full bleed), image (a still,
// slow push), stats (a row of proof points), end (logo, phone, area).

import {AbsoluteFill, Audio, Easing, Img, interpolate, OffthreadVideo, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {clamp, sec, Grain, Vignette, XF, Fade} from './cinema';
import '@fontsource/albert-sans/500.css';
import '@fontsource/albert-sans/700.css';
import '@fontsource/albert-sans/800.css';
import '@fontsource/inter/700.css';
import '@fontsource/inter/800.css';

export type ReelLine = {at: number; hold: number; text: string; size?: number; accent?: boolean; y?: number};
export type ReelScene = {
  type: 'film' | 'clip' | 'image' | 'stats' | 'end';
  from: number;
  to: number;
  src?: string;
  start?: number; // seconds into the source clip
  zoom?: number; // extra scale on a film, crops baked-in bars
  position?: string; // object-position for full-bleed media
  fit?: 'cover' | 'contain'; // stills: full bleed (cover) or whole image over a blurred fill (contain)
  lines?: ReelLine[];
  items?: {big: string; small: string}[];
};
export type ReelPlan = {
  client: {
    short: string;
    name: string;
    phone: string;
    area: string;
    brand: {primary: string; accent: string; dark: string; light: string; font: string; logo: string};
    close: {line: string; sub: string};
  };
  seconds: number;
  audio: {vo?: string; music?: string; musicVolume?: number};
  scenes: ReelScene[];
};

const fontFor = (name: string) => `'${name}', 'Inter', sans-serif`;

// A line of the read, in the client's type: rises in on its beat, holds, fades.
const Line: React.FC<{line: ReelLine; font: string; accent: string}> = ({line, font, accent}) => {
  const f = useCurrentFrame();
  const start = sec(line.at);
  const end = start + sec(line.hold);
  const opacity = interpolate(f, [start, start + 10, end - 8, end], [0, 1, 1, 0], clamp);
  const rise = interpolate(f, [start, start + 18], [22, 0], {...clamp, easing: Easing.out(Easing.cubic)});
  return (
    <div style={{position: 'absolute', left: 72, right: 72, top: line.y ?? 1300, opacity, transform: `translateY(${rise}px)`, fontFamily: font, fontWeight: 800, fontSize: line.size ?? 78, lineHeight: 1.06, letterSpacing: -1.5, color: line.accent ? accent : '#fff', textShadow: '0 4px 40px rgba(0,0,0,.85)'}}>
      {line.text}
    </div>
  );
};

const Lines: React.FC<{scene: ReelScene; font: string; accent: string}> = ({scene, font, accent}) => (
  <>{(scene.lines ?? []).map((l, i) => <Line key={i} line={l} font={font} accent={accent} />)}</>
);

// The bottom of frame darkens so the type reads over any footage.
const Shade: React.FC = () => <AbsoluteFill style={{background: 'linear-gradient(180deg, rgba(0,0,0,.25) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,0) 55%, rgba(0,0,0,.85) 100%)'}} />;

const Film: React.FC<{scene: ReelScene; plan: ReelPlan}> = ({scene, plan}) => {
  const f = useCurrentFrame();
  const len = sec(scene.to - scene.from);
  const push = interpolate(f, [0, len], [1, 1.06], clamp);
  const zoom = scene.zoom ?? 1.18;
  const src = staticFile(scene.src!);
  const start = sec(scene.start ?? 0);
  return (
    <AbsoluteFill style={{background: plan.client.brand.dark}}>
      <OffthreadVideo src={src} muted startFrom={start} style={{position: 'absolute', width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(34px) brightness(.4)', transform: `scale(${1.25 * push})`}} />
      <div style={{position: 'absolute', left: 0, top: 380, width: 1080, height: 608, overflow: 'hidden', boxShadow: '0 40px 120px rgba(0,0,0,.8)', transform: `scale(${push})`}}>
        <OffthreadVideo src={src} muted startFrom={start} style={{width: '100%', height: '100%', objectFit: 'cover', objectPosition: scene.position ?? '50% 62%', transform: `scale(${zoom})`}} />
      </div>
      <Shade />
      <Lines scene={scene} font={fontFor(plan.client.brand.font)} accent={plan.client.brand.accent} />
    </AbsoluteFill>
  );
};

const Clip: React.FC<{scene: ReelScene; plan: ReelPlan}> = ({scene, plan}) => {
  const f = useCurrentFrame();
  const len = sec(scene.to - scene.from);
  const push = interpolate(f, [0, len], [1, 1.05], clamp);
  return (
    <AbsoluteFill style={{background: plan.client.brand.dark}}>
      <OffthreadVideo src={staticFile(scene.src!)} muted startFrom={sec(scene.start ?? 0)} style={{width: '100%', height: '100%', objectFit: 'cover', objectPosition: scene.position ?? '50% 50%', transformOrigin: scene.position ?? '50% 50%', transform: `scale(${push * (scene.zoom ?? 1)})`}} />
      <Shade />
      <Lines scene={scene} font={fontFor(plan.client.brand.font)} accent={plan.client.brand.accent} />
    </AbsoluteFill>
  );
};

const Still: React.FC<{scene: ReelScene; plan: ReelPlan}> = ({scene, plan}) => {
  const f = useCurrentFrame();
  const len = sec(scene.to - scene.from);
  const push = interpolate(f, [0, len], [1.0, 1.1], {...clamp, easing: Easing.inOut(Easing.quad)});
  return (
    <AbsoluteFill style={{background: plan.client.brand.dark}}>
      <Img src={staticFile(scene.src!)} style={{position: 'absolute', width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(40px) brightness(.35)', transform: 'scale(1.3)'}} />
      <Img src={staticFile(scene.src!)} style={{position: 'absolute', width: '100%', height: '100%', objectFit: scene.fit ?? 'contain', objectPosition: scene.position ?? '50% 40%', transform: `scale(${push})`}} />
      <Shade />
      <Lines scene={scene} font={fontFor(plan.client.brand.font)} accent={plan.client.brand.accent} />
    </AbsoluteFill>
  );
};

const Stats: React.FC<{scene: ReelScene; plan: ReelPlan}> = ({scene, plan}) => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const b = plan.client.brand;
  return (
    <AbsoluteFill style={{background: b.dark}}>
      {scene.src ? <OffthreadVideo src={staticFile(scene.src)} muted startFrom={sec(scene.start ?? 0)} style={{position: 'absolute', width: '100%', height: '100%', objectFit: 'cover', objectPosition: scene.position ?? '50% 50%', filter: 'brightness(.35)', transform: `scale(${scene.zoom ?? 1.2})`}} /> : null}
      <div style={{position: 'absolute', left: 72, right: 72, top: 520, display: 'grid', gap: 44, fontFamily: fontFor(b.font)}}>
        {(scene.items ?? []).map((it, i) => {
          const s = spring({frame: f - sec(0.2 + i * 0.55), fps, config: {damping: 200}});
          return (
            <div key={i} style={{opacity: s, transform: `translateX(${(1 - s) * -40}px)`, display: 'flex', alignItems: 'baseline', gap: 28, borderLeft: `10px solid ${b.primary}`, paddingLeft: 32}}>
              <div style={{fontSize: 130, fontWeight: 800, color: b.accent, letterSpacing: -4, lineHeight: 1}}>{it.big}</div>
              <div style={{fontSize: 44, fontWeight: 700, color: '#fff'}}>{it.small}</div>
            </div>
          );
        })}
      </div>
      <Lines scene={scene} font={fontFor(b.font)} accent={b.accent} />
    </AbsoluteFill>
  );
};

const End: React.FC<{scene: ReelScene; plan: ReelPlan}> = ({scene, plan}) => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const b = plan.client.brand;
  const logo = spring({frame: f - 4, fps, config: {damping: 200}});
  const phone = spring({frame: f - sec(0.9), fps, config: {damping: 16}});
  const rest = interpolate(f, [sec(1.6), sec(2.3)], [0, 1], clamp);
  return (
    <AbsoluteFill style={{background: b.dark, alignItems: 'center', fontFamily: fontFor(b.font)}}>
      <AbsoluteFill style={{background: `radial-gradient(ellipse 80% 45% at 50% 115%, ${b.primary} 0%, rgba(0,0,0,0) 70%)`, opacity: 0.35}} />
      <div style={{position: 'absolute', top: 430, opacity: logo, transform: `scale(${0.94 + logo * 0.06})`}}>
        <Img src={staticFile(b.logo)} style={{width: 420}} />
      </div>
      <div style={{position: 'absolute', top: 900, left: 72, right: 72, textAlign: 'center', opacity: phone, transform: `scale(${0.85 + phone * 0.15})`}}>
        <div style={{fontSize: 40, fontWeight: 700, color: b.accent, letterSpacing: 6, marginBottom: 18}}>{plan.client.close.line.toUpperCase().replace(/[\d() -]+$/, '').trim() || 'CALL'}</div>
        <div style={{fontSize: 128, fontWeight: 800, color: '#fff', letterSpacing: -3, lineHeight: 1}}>{plan.client.phone}</div>
      </div>
      <div style={{position: 'absolute', top: 1180, left: 72, right: 72, textAlign: 'center', opacity: rest, fontSize: 36, fontWeight: 700, color: '#fff'}}>{plan.client.close.sub}</div>
      <div style={{position: 'absolute', top: 1290, left: 72, right: 72, textAlign: 'center', opacity: rest, fontSize: 30, fontWeight: 500, color: 'rgba(255,255,255,.7)', letterSpacing: 3}}>{plan.client.area.toUpperCase()}</div>
      <Lines scene={scene} font={fontFor(b.font)} accent={b.accent} />
    </AbsoluteFill>
  );
};

export const ClientReel: React.FC<{plan: ReelPlan}> = ({plan}) => {
  const total = sec(plan.seconds);
  return (
    <AbsoluteFill style={{background: plan.client.brand.dark}}>
      {plan.scenes.map((scene, i) => {
        const a = sec(scene.from) - (i ? XF : 0);
        const len = sec(scene.to) - sec(scene.from) + (i ? XF : 0);
        const node = scene.type === 'film' ? <Film scene={scene} plan={plan} /> : scene.type === 'clip' ? <Clip scene={scene} plan={plan} /> : scene.type === 'image' ? <Still scene={scene} plan={plan} /> : scene.type === 'stats' ? <Stats scene={scene} plan={plan} /> : <End scene={scene} plan={plan} />;
        return (
          <Sequence key={i} from={a} durationInFrames={len}>
            <Fade length={len} out={i === plan.scenes.length - 1}>{node}</Fade>
          </Sequence>
        );
      })}
      <Vignette />
      <Grain opacity={0.07} />
      {plan.audio.vo ? <Audio src={staticFile(plan.audio.vo)} /> : null}
      {plan.audio.music ? <Audio src={staticFile(plan.audio.music)} volume={(f) => interpolate(f, [0, 20, total - 50, total], [0, plan.audio.musicVolume ?? 0.3, plan.audio.musicVolume ?? 0.3, 0], clamp)} /> : null}
    </AbsoluteFill>
  );
};
