// Shared cinematic pieces for the spots: grain, vignette, light, camera drift,
// timed lines of the read, the phone as a lit object, and a b-roll slot.
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
export const C = {bg: '#050506', text: '#f4f5f7', muted: '#9aa0a6', yellow: '#ffd400', red: '#ff4d4f', amber: '#ffb020', line: '#2a2d33', panel: '#101114'};
export const sans = "'Inter', sans-serif";
export const mono = "'JetBrains Mono', monospace";
export const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;
export const FPS = 30;
export const sec = (s: number) => Math.round(s * FPS);

// Film grain: a fresh noise seed every frame so it crawls like stock.
export const Grain: React.FC<{opacity?: number}> = ({opacity = 0.09}) => {
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

export const Vignette: React.FC = () => (
  <AbsoluteFill style={{pointerEvents: 'none', background: 'radial-gradient(ellipse 70% 60% at 50% 45%, rgba(0,0,0,0) 40%, rgba(0,0,0,.75) 100%)'}} />
);

// Warm light rising from the bottom of frame: dawn, and later the brand's yellow.
export const Dawn: React.FC<{strength: number; color?: string; y?: string}> = ({strength, color = C.amber, y = '110%'}) => (
  <AbsoluteFill style={{pointerEvents: 'none', opacity: strength, background: `radial-gradient(ellipse 90% 45% at 50% ${y}, ${color} 0%, rgba(255,176,32,0.18) 35%, rgba(0,0,0,0) 70%)`}} />
);

// A slow, continuous camera move over `length` frames: a push-in with a little drift.
export const Camera: React.FC<{length: number; from?: number; to?: number; children: React.ReactNode}> = ({length, from = 1, to = 1.06, children}) => {
  const f = useCurrentFrame();
  const t = interpolate(f, [0, length], [0, 1], clamp);
  const s = from + (to - from) * t;
  return <AbsoluteFill style={{transform: `scale(${s}) translate(${-8 * t}px, ${6 * t}px)`}}>{children}</AbsoluteFill>;
};

// One line of the read. Fades and tracks in on its beat; holds; fades out.
export const Line: React.FC<{at: number; hold: number; children: React.ReactNode; size?: number; color?: string; y?: number; align?: 'left' | 'center'}> = ({
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
export const Phone: React.FC<{children?: React.ReactNode; rx?: number; ry?: number; glow?: number; sweepAt?: number; width?: number; y?: number}> = ({
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
export const Screen: React.FC<{src: string; width: number; captureWidth: number; captureHeight: number; startFrom?: number; zoomTo?: {x: number; y: number; w: number; h: number} | null; zoomAt?: number}> = ({
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
export const BRoll: React.FC<{src?: string; fallback: React.ReactNode; position?: string}> = ({src, fallback, position = '50% 50%'}) => (
  <AbsoluteFill>{src ? <OffthreadVideo src={staticFile(src)} muted style={{width: '100%', height: '100%', objectFit: 'cover', objectPosition: position}} /> : fallback}</AbsoluteFill>
);


// Fades a scene in over the previous one; scenes overlap by XF frames.
export const XF = 10;
export const Fade: React.FC<{length: number; out?: boolean; children: React.ReactNode}> = ({length, out = false, children}) => {
  const f = useCurrentFrame();
  const opacity = interpolate(f, out ? [0, XF, length - 20, length] : [0, XF], out ? [0, 1, 1, 0] : [0, 1], clamp);
  return <AbsoluteFill style={{opacity}}>{children}</AbsoluteFill>;
};
