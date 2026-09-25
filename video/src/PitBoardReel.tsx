import {
  AbsoluteFill,
  Easing,
  interpolate,
  Sequence,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import '@fontsource/inter/500.css';
import '@fontsource/inter/700.css';
import '@fontsource/inter/800.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/700.css';
import type sampleBoard from './sample-board.json';

// Brand tokens, copied from themes/pitboard/static/css/pitboard.css.
const C = {
  bg: '#0b0c0e',
  panel: '#15171b',
  line: '#2a2d33',
  text: '#f4f5f7',
  muted: '#9aa0a6',
  yellow: '#ffd400',
  red: '#ff4d4f',
  green: '#8bd346',
  blue: '#4da3ff',
};
// Bundled with the project so rendering never needs to reach a font CDN.
const sans = "'Inter', sans-serif";
const mono = "'JetBrains Mono', monospace";

type Board = typeof sampleBoard;

// Scene lengths in frames at 30 fps.
const HOOK = 105;
const PHONE = 195;
const STATS = 150;
const MONEY = 180;
const DO_THIS = 105;
const CTA = 135;
export const REEL_FRAMES = HOOK + PHONE + STATS + MONEY + DO_THIS + CTA;

const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;

const usd = (n: number) => '$' + Math.round(n).toLocaleString('en-US');

// Fades a scene in and out so cuts are never hard.
const Scene: React.FC<{length: number; children: React.ReactNode}> = ({length, children}) => {
  const f = useCurrentFrame();
  const opacity = interpolate(f, [0, 8, length - 8, length], [0, 1, 1, 0], clamp);
  return (
    <AbsoluteFill style={{opacity, padding: 90, justifyContent: 'center', fontFamily: sans, color: C.text}}>
      {children}
    </AbsoluteFill>
  );
};

// Pops an element up from below, delayed by `delay` frames.
const Rise: React.FC<{delay?: number; children: React.ReactNode; style?: React.CSSProperties}> = ({
  delay = 0,
  children,
  style,
}) => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const s = spring({frame: f - delay, fps, config: {damping: 200}});
  return (
    <div style={{opacity: s, transform: `translateY(${(1 - s) * 60}px)`, ...style}}>{children}</div>
  );
};

const Count: React.FC<{to: number; delay?: number; format?: (n: number) => string}> = ({
  to,
  delay = 0,
  format = (n) => String(Math.round(n)),
}) => {
  const f = useCurrentFrame();
  const v = interpolate(f, [delay, delay + 30], [0, to], {...clamp, easing: Easing.out(Easing.cubic)});
  return <>{format(v)}</>;
};

const Hook: React.FC<{board: Board}> = ({board}) => (
  <Scene length={HOOK}>
    <Rise>
      <div style={{fontSize: 64, color: C.muted, fontWeight: 700}}>Yesterday,</div>
    </Rise>
    <Rise delay={8}>
      <div style={{fontSize: 150, fontWeight: 800, lineHeight: 1.02, letterSpacing: -4}}>
        <span style={{color: C.red}}>{board.lap.missed}</span> calls
        <br />
        went unanswered.
      </div>
    </Rise>
    <Rise delay={45}>
      <div style={{fontSize: 70, fontWeight: 700, marginTop: 50, color: C.yellow}}>Do you know who they were?</div>
    </Rise>
  </Scene>
);

const Phone: React.FC<{board: Board}> = ({board}) => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const {lap} = board;
  const top = board.moneyOnTheTable[0];
  const lines = [
    `PIT BOARD · ${board.account.name}`,
    `Calls ${lap.callsIn} · Missed ${lap.missed} (${lap.recovered} texted back)`,
    `New leads ${lap.newLeads} · Booked ${lap.booked}`,
    `Reply time ${lap.medianReplyMinutes}m · Score ${board.score}/100`,
    `Today: ${board.today.count} jobs, first at ${board.today.appointments[0].time}`,
    `On the table: ${board.moneyOnTheTableTotal} · ${top.label}: ${top.name}`,
  ];
  const drop = spring({frame: f - 20, fps, config: {damping: 14, mass: 0.6}});
  const buzz = f > 20 && f < 40 ? Math.sin(f * 2.2) * 6 : 0;
  return (
    <Scene length={PHONE}>
      <Rise>
        <div style={{fontSize: 60, fontWeight: 800, textAlign: 'center', marginBottom: 50}}>
          Now it's on your phone at <span style={{color: C.yellow, whiteSpace: 'nowrap'}}>7 AM.</span>
        </div>
      </Rise>
      <div
        style={{
          alignSelf: 'center',
          width: 820,
          height: 1120,
          borderRadius: 70,
          border: `10px solid ${C.line}`,
          background: '#050506',
          padding: 40,
          transform: `rotate(${buzz * 0.2}deg) translateX(${buzz}px)`,
        }}
      >
        <div style={{display: 'flex', justifyContent: 'space-between', color: C.muted, fontSize: 30, fontWeight: 700}}>
          <span>7:00</span>
          <span>Project Driver</span>
        </div>
        <div
          style={{
            marginTop: 40,
            background: C.panel,
            border: `2px solid ${C.line}`,
            borderRadius: 32,
            padding: '34px 36px',
            opacity: drop,
            transform: `translateY(${(1 - drop) * -120}px)`,
            fontFamily: mono,
            fontSize: 30,
            lineHeight: 1.55,
          }}
        >
          {lines.map((line, i) => {
            const start = 40 + i * 16;
            const shown = Math.floor(interpolate(f, [start, start + 14], [0, line.length], clamp));
            return (
              <div key={i} style={{color: i === 0 ? C.yellow : C.text, fontWeight: i === 0 ? 700 : 400, minHeight: 46}}>
                {line.slice(0, shown)}
              </div>
            );
          })}
        </div>
        <div style={{marginTop: 44, color: C.muted, fontSize: 30, fontWeight: 700, letterSpacing: 3, opacity: interpolate(f, [130, 140], [0, 1], clamp)}}>
          TODAY'S LINEUP
        </div>
        {board.today.appointments.map((a, i) => (
          <Rise key={a.id} delay={136 + i * 7}>
            <div style={{display: 'flex', gap: 28, alignItems: 'baseline', padding: '16px 0', borderBottom: `2px solid ${C.line}`}}>
              <span style={{fontFamily: mono, color: C.yellow, fontSize: 32, width: 130}}>{a.time}</span>
              <span style={{fontSize: 34, fontWeight: 700}}>{a.title}</span>
            </div>
          </Rise>
        ))}
      </div>
    </Scene>
  );
};

const Stats: React.FC<{board: Board}> = ({board}) => {
  const {lap} = board;
  const tiles = [
    {label: 'Calls in', value: lap.callsIn, color: C.text},
    {label: 'Missed', value: lap.missed, color: C.red},
    {label: 'Texted back', value: lap.recovered, color: C.green},
    {label: 'Booked', value: lap.booked, color: C.blue},
  ];
  return (
    <Scene length={STATS}>
      <Rise>
        <div style={{fontSize: 44, color: C.yellow, fontWeight: 700, letterSpacing: 4, textTransform: 'uppercase'}}>
          Yesterday, from your phones
        </div>
      </Rise>
      <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 36, marginTop: 50}}>
        {tiles.map((t, i) => (
          <Rise key={t.label} delay={6 + i * 6}>
            <div style={{background: C.panel, border: `2px solid ${C.line}`, borderRadius: 28, padding: '44px 40px'}}>
              <div style={{fontSize: 150, fontWeight: 800, color: t.color, lineHeight: 1}}>
                <Count to={t.value} delay={10 + i * 6} />
              </div>
              <div style={{fontSize: 40, color: C.muted, marginTop: 14, fontWeight: 500}}>{t.label}</div>
            </div>
          </Rise>
        ))}
      </div>
      <Rise delay={40}>
        <div style={{marginTop: 50, display: 'flex', alignItems: 'baseline', gap: 24}}>
          <span style={{fontSize: 44, color: C.muted, fontWeight: 500}}>Response score</span>
          <span style={{fontSize: 110, fontWeight: 800, color: C.yellow}}>
            <Count to={board.score} delay={44} />
          </span>
          <span style={{fontSize: 44, color: C.muted, fontWeight: 500}}>/100</span>
        </div>
      </Rise>
    </Scene>
  );
};

const Money: React.FC<{board: Board}> = ({board}) => {
  const items = board.moneyOnTheTable;
  const dollars = items.reduce((sum, m) => sum + (m.amount ?? 0), 0);
  return (
    <Scene length={MONEY}>
      <Rise>
        <div style={{fontSize: 44, color: C.yellow, fontWeight: 700, letterSpacing: 4, textTransform: 'uppercase'}}>
          Money on the table
        </div>
      </Rise>
      <Rise delay={4}>
        <div style={{fontSize: 190, fontWeight: 800, letterSpacing: -6, lineHeight: 1.05}}>
          <Count to={dollars} delay={10} format={usd} />
        </div>
      </Rise>
      <Rise delay={14}>
        <div style={{fontSize: 38, color: C.muted, marginTop: 24}}>
          in open estimates and invoices, plus {items.filter((m) => !m.amount).length} people waiting on you
        </div>
      </Rise>
      <div style={{marginTop: 40, display: 'flex', flexDirection: 'column', gap: 22}}>
        {items.map((m, i) => (
          <Rise key={i} delay={30 + i * 12}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: C.panel,
                borderLeft: `8px solid ${m.priority === 1 ? C.red : C.yellow}`,
                borderRadius: 18,
                padding: '26px 32px',
              }}
            >
              <div>
                <div style={{fontSize: 36, fontWeight: 700}}>{m.name}</div>
                <div style={{fontSize: 30, color: C.muted, marginTop: 4}}>{m.label}</div>
              </div>
              <div style={{fontSize: 38, fontWeight: 800, color: C.yellow}}>{m.amount ? usd(m.amount) : m.age}</div>
            </div>
          </Rise>
        ))}
      </div>
      <Rise delay={100}>
        <div style={{fontSize: 40, color: C.muted, marginTop: 36}}>Each one with a link to fix it.</div>
      </Rise>
    </Scene>
  );
};

const DoThis: React.FC<{board: Board}> = ({board}) => (
  <Scene length={DO_THIS}>
    <Rise>
      <div
        style={{
          display: 'inline-block',
          background: C.yellow,
          color: C.bg,
          fontWeight: 800,
          fontSize: 48,
          padding: '14px 30px',
          borderRadius: 14,
          letterSpacing: 3,
        }}
      >
        DO THIS FIRST
      </div>
    </Rise>
    <Rise delay={10}>
      <div style={{fontSize: 92, fontWeight: 800, lineHeight: 1.12, marginTop: 50, letterSpacing: -2}}>
        {board.doThis}
      </div>
    </Rise>
  </Scene>
);

const Logo: React.FC<{size: number}> = ({size}) => (
  <svg width={size} height={size} viewBox="0 0 64 64">
    <rect width="64" height="64" rx="12" fill={C.bg} />
    <rect x="12" y="14" width="40" height="10" rx="2" fill={C.yellow} />
    <rect x="12" y="28" width="40" height="10" rx="2" fill="#fff" />
    <rect x="12" y="42" width="24" height="10" rx="2" fill={C.yellow} />
  </svg>
);

const Cta: React.FC = () => (
  <Scene length={CTA}>
    <Rise>
      <div style={{display: 'flex', alignItems: 'center', gap: 30}}>
        <div style={{border: `3px solid ${C.line}`, borderRadius: 30}}>
          <Logo size={150} />
        </div>
        <div>
          <div style={{fontSize: 96, fontWeight: 800, letterSpacing: 4}}>
            PIT <span style={{color: C.yellow}}>BOARD</span>
          </div>
          <div style={{fontSize: 36, color: C.muted, fontWeight: 500}}>by Project Driver</div>
        </div>
      </div>
    </Rise>
    <Rise delay={10}>
      <div style={{fontSize: 100, fontWeight: 800, lineHeight: 1.08, marginTop: 70, letterSpacing: -3}}>
        Your business on one board, <span style={{color: C.yellow}}>every morning at 7.</span>
      </div>
    </Rise>
    <Rise delay={24}>
      <div style={{fontSize: 44, color: C.muted, marginTop: 40}}>
        HVAC · plumbing · roofing · any trade that lives on the phone
      </div>
    </Rise>
    <Rise delay={36}>
      <div
        style={{
          marginTop: 70,
          background: C.yellow,
          color: C.bg,
          fontSize: 54,
          fontWeight: 800,
          borderRadius: 22,
          padding: '34px 44px',
          textAlign: 'center',
        }}
      >
        Get your first board tomorrow
      </div>
      <div style={{fontSize: 38, color: C.muted, textAlign: 'center', marginTop: 26}}>
        From $97/month · pitboard.project-driver.com
      </div>
    </Rise>
  </Scene>
);

export const PitBoardReel: React.FC<{board: Board}> = ({board}) => {
  const scenes: [number, React.ReactNode][] = [
    [HOOK, <Hook board={board} />],
    [PHONE, <Phone board={board} />],
    [STATS, <Stats board={board} />],
    [MONEY, <Money board={board} />],
    [DO_THIS, <DoThis board={board} />],
    [CTA, <Cta />],
  ];
  let from = 0;
  return (
    <AbsoluteFill style={{background: C.bg}}>
      {scenes.map(([length, node], i) => {
        const seq = (
          <Sequence key={i} from={from} durationInFrames={length}>
            {node}
          </Sequence>
        );
        from += length;
        return seq;
      })}
    </AbsoluteFill>
  );
};
