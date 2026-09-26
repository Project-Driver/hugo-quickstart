import {
  AbsoluteFill,
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

// Brand tokens, copied from themes/pitboard/static/css/pitboard.css.
const C = {bg: '#0b0c0e', panel: '#15171b', line: '#2a2d33', text: '#f4f5f7', muted: '#9aa0a6', yellow: '#ffd400', red: '#ff4d4f'};
const sans = "'Inter', sans-serif";
const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;

export type Focus = {x: number; y: number; w: number; h: number};
export type Scene = {
  kind: 'hook' | 'clip' | 'cta';
  from: number;
  durationInFrames: number;
  src: string | null;
  poster: string | null;
  caption: string | null;
  lines: string[] | null;
  headline: string | null;
  button: string | null;
  footer: string | null;
  focus: Focus | null;
};
export type Plan = {
  fps: number;
  width: number;
  height: number;
  capture: {width: number; height: number};
  durationInFrames: number;
  scenes: Scene[];
};

const XFADE = 8; // frames of overlap between shots

// The device: the capture is 1080 wide; shown at this width inside a rounded frame.
const DEVICE_W = 940;
const DEVICE_H = 1480;

const Rise: React.FC<{delay?: number; children: React.ReactNode; style?: React.CSSProperties}> = ({delay = 0, children, style}) => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const s = spring({frame: f - delay, fps, config: {damping: 200}});
  return <div style={{opacity: s, transform: `translateY(${(1 - s) * 50}px)`, ...style}}>{children}</div>;
};

// A captured shot inside a phone-shaped frame, with an optional punch-in on `focus`
// during the last part of the shot.
const Device: React.FC<{scene: Scene; capture: Plan['capture']; dim?: number}> = ({scene, capture, dim = 0}) => {
  const f = useCurrentFrame();
  const scale = DEVICE_W / capture.width;
  let zoom = 1;
  let origin = '0 0';
  if (scene.focus) {
    const start = scene.durationInFrames * 0.55;
    const t = interpolate(f, [start, start + 24], [0, 1], {...clamp, easing: Easing.inOut(Easing.cubic)});
    zoom = interpolate(t, [0, 1], [1, Math.min(1.6, (capture.width * 0.8) / scene.focus.w)]);
    // Scale about the focus box's centre, kept inside the visible part of the
    // capture, so the punch-in never reveals an edge of the page.
    const visibleH = DEVICE_H / scale;
    const cx = scene.focus.x + scene.focus.w / 2;
    const cy = Math.min(visibleH - 80, Math.max(80, scene.focus.y + scene.focus.h / 2));
    origin = `${cx}px ${cy}px`;
  }
  return (
    <div
      style={{
        position: 'absolute',
        left: (1080 - DEVICE_W) / 2,
        top: 120,
        width: DEVICE_W,
        height: DEVICE_H,
        borderRadius: 54,
        overflow: 'hidden',
        border: `6px solid ${C.line}`,
        boxShadow: '0 40px 120px rgba(0,0,0,.6)',
        background: C.panel,
      }}
    >
      <div style={{width: capture.width, height: capture.height, transformOrigin: '0 0', transform: `scale(${scale})`, position: 'absolute', left: 0, top: 0}}>
        <div style={{width: capture.width, height: capture.height, transformOrigin: origin, transform: `scale(${zoom})`}}>
        {scene.src ? (
          <OffthreadVideo src={staticFile(scene.src)} muted style={{width: capture.width, height: capture.height}} />
        ) : scene.poster ? (
          <Img src={staticFile(scene.poster)} style={{width: capture.width, height: capture.height}} />
        ) : null}
        </div>
      </div>
      {dim > 0 ? <AbsoluteFill style={{background: `rgba(11,12,14,${dim})`}} /> : null}
    </div>
  );
};

const Caption: React.FC<{text: string}> = ({text}) => (
  <Rise delay={4} style={{position: 'absolute', left: 70, right: 70, top: 1650}}>
    <div style={{fontFamily: sans, fontWeight: 800, fontSize: 60, lineHeight: 1.15, color: C.text, letterSpacing: -1, textAlign: 'center', textShadow: '0 4px 24px rgba(0,0,0,.8)'}}>
      {text}
    </div>
  </Rise>
);

const Hook: React.FC<{scene: Scene; capture: Plan['capture']}> = ({scene, capture}) => {
  const lines = scene.lines ?? [];
  return (
    <AbsoluteFill style={{background: C.bg}}>
      <Device scene={scene} capture={capture} dim={0.82} />
      <AbsoluteFill style={{justifyContent: 'center', padding: 90, fontFamily: sans, color: C.text}}>
        {lines.map((line, i) => (
          <Rise key={i} delay={i * 10}>
            <div
              style={{
                fontSize: i === 1 ? 128 : 72,
                fontWeight: 800,
                lineHeight: 1.05,
                letterSpacing: i === 1 ? -4 : -1,
                color: i === 0 ? C.muted : i === 2 ? C.yellow : C.text,
                marginBottom: 24,
              }}
            >
              {i === 1 ? <Highlight text={line} /> : line}
            </div>
          </Rise>
        ))}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// Colours the leading number of a line red, e.g. "4 calls went unanswered."
const Highlight: React.FC<{text: string}> = ({text}) => {
  const m = text.match(/^(\S+)(.*)$/);
  if (!m || !/\d/.test(m[1])) return <>{text}</>;
  return (
    <>
      <span style={{color: C.red}}>{m[1]}</span>
      {m[2]}
    </>
  );
};

const Clip: React.FC<{scene: Scene; capture: Plan['capture']}> = ({scene, capture}) => (
  <AbsoluteFill style={{background: C.bg}}>
    <Device scene={scene} capture={capture} />
    {scene.caption ? <Caption text={scene.caption} /> : null}
  </AbsoluteFill>
);

const Logo: React.FC<{size: number}> = ({size}) => (
  <svg width={size} height={size} viewBox="0 0 64 64">
    <rect width="64" height="64" rx="12" fill={C.bg} />
    <rect x="12" y="14" width="40" height="10" rx="2" fill={C.yellow} />
    <rect x="12" y="28" width="40" height="10" rx="2" fill="#fff" />
    <rect x="12" y="42" width="24" height="10" rx="2" fill={C.yellow} />
  </svg>
);

const Cta: React.FC<{scene: Scene}> = ({scene}) => (
  <AbsoluteFill style={{background: C.bg, justifyContent: 'center', padding: 90, fontFamily: sans, color: C.text}}>
    <Rise>
      <div style={{display: 'flex', alignItems: 'center', gap: 30}}>
        <div style={{border: `3px solid ${C.line}`, borderRadius: 30}}>
          <Logo size={140} />
        </div>
        <div>
          <div style={{fontSize: 88, fontWeight: 800, letterSpacing: 4}}>
            PIT <span style={{color: C.yellow}}>BOARD</span>
          </div>
          <div style={{fontSize: 34, color: C.muted, fontWeight: 500}}>by Project Driver</div>
        </div>
      </div>
    </Rise>
    {scene.headline ? (
      <Rise delay={8}>
        <div style={{fontSize: 92, fontWeight: 800, lineHeight: 1.08, marginTop: 70, letterSpacing: -3}}>{scene.headline}</div>
      </Rise>
    ) : null}
    {scene.button ? (
      <Rise delay={20}>
        <div style={{marginTop: 70, background: C.yellow, color: C.bg, fontSize: 52, fontWeight: 800, borderRadius: 22, padding: '32px 44px', textAlign: 'center'}}>
          {scene.button}
        </div>
      </Rise>
    ) : null}
    {scene.footer ? (
      <Rise delay={26}>
        <div style={{fontSize: 36, color: C.muted, textAlign: 'center', marginTop: 26}}>{scene.footer}</div>
      </Rise>
    ) : null}
  </AbsoluteFill>
);

// Fades the scene in over the one before it (scenes overlap by XFADE frames).
const Fade: React.FC<{length: number; children: React.ReactNode}> = ({length, children}) => {
  const f = useCurrentFrame();
  const opacity = interpolate(f, [0, XFADE], [0, 1], clamp);
  return <AbsoluteFill style={{opacity}}>{children}</AbsoluteFill>;
};

export const WalkthroughReel: React.FC<{plan: Plan}> = ({plan}) => (
  <AbsoluteFill style={{background: C.bg}}>
    {plan.scenes.map((scene, i) => (
      <Sequence key={i} from={scene.from} durationInFrames={scene.durationInFrames}>
        <Fade length={scene.durationInFrames}>
          {scene.kind === 'hook' ? (
            <Hook scene={scene} capture={plan.capture} />
          ) : scene.kind === 'cta' ? (
            <Cta scene={scene} />
          ) : (
            <Clip scene={scene} capture={plan.capture} />
          )}
        </Fade>
      </Sequence>
    ))}
  </AbsoluteFill>
);
