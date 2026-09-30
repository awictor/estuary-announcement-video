// OWNER: hd builder. Timing helpers + full-frame 2D effects for the HD "evolved" sections (reveal, card).
// Everything is a pure function of the GLOBAL frame `g` (see timeline.json).
import React from 'react';
import {C, H, TIMELINE, W, rand} from '../theme';

export const EV = TIMELINE.events;
export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const ramp = (g: number, a: number, b: number) => clamp01((g - a) / (b - a));
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - clamp01(t), 3);
export const easeInOutCubic = (t: number) => {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};
export const easeOutBack = (t: number, s = 1.4) => {
  const x = clamp01(t) - 1;
  return 1 + (s + 1) * x * x * x + s * x * x;
};
// Damped "pop": 0 before `at`, overshoots to ~1+amp, settles at 1 (used for scale pops).
export const pop = (g: number, at: number, amp = 0.35, decay = 4, freq = 0.85) => {
  if (g < at) return 0;
  const k = g - at;
  return 1 + amp * Math.exp(-k / decay) * Math.cos(k * freq);
};
// Frames since the most recent beat of the music grid (beat n at 54 + 12n).
export const sinceBeat = (g: number) => (((g - TIMELINE.beatGridStart) % TIMELINE.beatFrames) + TIMELINE.beatFrames) % TIMELINE.beatFrames;

// ---------- layout (real px) ----------
// cardIn: the reveal stack eases up/smaller while the trainer card slides up.
export const cardP = (g: number) => easeInOutCubic(ramp(g, EV.cardIn[0] - 1, EV.cardIn[1] - 2));
export const orbLayout = (g: number) => {
  const p = cardP(g);
  return {cx: 540, cy: lerp(572, 408, p), s: lerp(1, 0.6, p)};
};

// ---------- pixel resolve (546-564): stepped block sizes 40,24,16,8,4,2 then 1 ----------
export const blockSize = (g: number) => {
  const [a, b] = EV.pixelResolve;
  if (g >= b) return 1;
  const steps = [40, 24, 16, 8, 4, 2];
  return steps[Math.min(steps.length - 1, Math.max(0, Math.floor((g - a) / 3)))];
};

// SVG mosaic filter applied with CSS `filter:url(#id)` to a wrapper holding the WebGL canvas AND the DOM text,
// so both pixelate on the same frame-aligned grid. Samples a 2x2 dot at the centre of every b x b cell and
// dilates it to fill the cell exactly (b=2 uses a 1px dot + radius 1; the 1px overlap is invisible at that size).
export const MosaicDefs: React.FC<{b: number; id: string}> = ({b, id}) => {
  if (b <= 1) return null;
  const dot = b === 2 ? 1 : 2;
  const c = b === 2 ? 0 : b / 2 - 1;
  const r = b === 2 ? 1 : b / 2 - 1;
  return (
    <svg width={0} height={0} style={{position: 'absolute'}} aria-hidden>
      <defs>
        <filter id={id} x={0} y={0} width={W} height={H} filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
          <feFlood x={c} y={c} width={dot} height={dot} floodColor="#ffffff" floodOpacity={1} result="dot" />
          <feOffset in="dot" dx={0} dy={0} x={0} y={0} width={b} height={b} result="cell" />
          <feTile in="cell" x={0} y={0} width={W} height={H} result="grid" />
          <feComposite in="SourceGraphic" in2="grid" operator="in" result="samples" />
          <feMorphology in="samples" operator="dilate" radius={r} />
        </filter>
      </defs>
    </svg>
  );
};

// ---------- backdrop: near-black with warm glow behind the orb, cool glow behind the wordmark, vignette ----------
export const Backdrop: React.FC<{g: number}> = ({g}) => {
  const {cx, cy, s} = orbLayout(g);
  const p = cardP(g);
  const beat = Math.exp(-sinceBeat(g) / 5);
  const warm = 0.2 + 0.05 * beat;
  const wordY = lerp(930, 690, p);
  return (
    <div style={{position: 'absolute', inset: 0, background: C.black}}>
      <div style={{position: 'absolute', inset: 0,
        background: `radial-gradient(circle at ${cx}px ${cy}px, rgba(255,122,26,${warm}) 0px, rgba(255,122,26,${warm * 0.35}) ${260 * s}px, rgba(255,122,26,0) ${620 * s}px)`}} />
      <div style={{position: 'absolute', inset: 0,
        background: `radial-gradient(ellipse 760px 520px at 540px ${wordY}px, rgba(78,108,242,0.20) 0%, rgba(63,214,240,0.06) 55%, rgba(78,108,242,0) 100%)`}} />
      <div style={{position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse 1150px 1500px at 540px 860px, rgba(7,9,15,0) 55%, rgba(0,0,0,0.6) 100%)'}} />
    </div>
  );
};

// ---------- impact 546: warm white-out recedes, radial light burst + shock ring from the orb ----------
export const Burst: React.FC<{g: number}> = ({g}) => {
  const at = EV.impact;
  if (g < at || g > at + 30) return null;
  const k = g - at;
  const {cx, cy} = orbLayout(g);
  // Veil: continues the previous segment's white frame; warm and radial so it never reads as flat grey.
  const veil = [0.96, 0.74, 0.52, 0.34, 0.2, 0.1, 0.04][k] ?? 0;
  // centre clears slowest, edges fastest: the white light recedes into the orb
  const a0 = Math.pow(veil, 0.5), a1 = Math.pow(veil, 1.4), a2 = Math.pow(veil, 2.4);
  // 546 stays close to the incoming white frame; the light warms to orange over the next frames
  const warmT = clamp01(k / 1.5);
  const mixc = (p: number[], q: number[], t: number) => p.map((v, i) => Math.round(lerp(v, q[i], t))).join(',');
  const flash = Math.exp(-k / 4.5);
  const R = lerp(520, 1500, easeOutCubic(k / 14));
  const shock = easeOutCubic(k / 16);
  const shockR = lerp(170, 1250, shock);
  const shockO = (1 - shock) * 0.9;
  return (
    <>
      {veil > 0 && (
        <div style={{position: 'absolute', inset: 0,
          background: `radial-gradient(circle at ${cx}px ${cy}px, rgba(255,255,255,${a0}) 0px, rgba(255,240,222,${(a0 + a1) / 2}) 260px, rgba(${mixc([255, 236, 214], [255, 178, 100], warmT)},${a1}) 700px, rgba(${mixc([255, 226, 194], [255, 132, 44], warmT)},${a2}) 1400px)`}} />
      )}
      <div style={{position: 'absolute', inset: 0, mixBlendMode: 'screen', opacity: flash,
        background: `radial-gradient(circle at ${cx}px ${cy}px, rgba(255,255,255,1) 0px, rgba(255,240,220,0.95) ${R * 0.14}px, rgba(255,176,98,0.7) ${R * 0.32}px, rgba(255,122,26,0.32) ${R * 0.55}px, rgba(255,122,26,0) ${R}px)`}} />
      {shockO > 0.02 && (
        <svg width={W} height={H} style={{position: 'absolute', left: 0, top: 0, mixBlendMode: 'screen'}}>
          <circle cx={cx} cy={cy} r={shockR} fill="none" stroke="#FFE2C0" strokeOpacity={shockO} strokeWidth={lerp(46, 6, shock)} />
          <circle cx={cx} cy={cy} r={shockR * 0.82} fill="none" stroke="#FF9A4A" strokeOpacity={shockO * 0.5} strokeWidth={lerp(20, 3, shock)} />
        </svg>
      )}
    </>
  );
};

// Soft god-rays from the orb after impact (conic spokes, masked radially), fading into the hold.
export const Rays: React.FC<{g: number}> = ({g}) => {
  const at = EV.impact;
  const o = g < at ? 0 : 0.5 * Math.exp(-(g - at) / 16);
  if (o < 0.01) return null;
  const {cx, cy} = orbLayout(g);
  const rot = (g - at) * 0.35;
  return (
    <div style={{position: 'absolute', inset: 0, mixBlendMode: 'screen', opacity: o,
      background: `repeating-conic-gradient(from ${rot}deg at ${cx}px ${cy}px, rgba(255,200,150,0.55) 0deg, rgba(255,200,150,0) 5deg, rgba(255,200,150,0) 17deg, rgba(255,200,150,0.35) 22deg, rgba(255,200,150,0) 26deg, rgba(255,200,150,0) 36deg)`,
      WebkitMaskImage: `radial-gradient(circle at ${cx}px ${cy}px, #000 0px, rgba(0,0,0,0.6) 260px, rgba(0,0,0,0) 900px)`,
      maskImage: `radial-gradient(circle at ${cx}px ${cy}px, #000 0px, rgba(0,0,0,0.6) 260px, rgba(0,0,0,0) 900px)`}} />
  );
};

// ---------- drifting dust / embers (DOM, behind text; faded out of text bands) ----------
const DUST = 44;
export const Dust: React.FC<{g: number; keepOut: {y0: number; y1: number}[]}> = ({g, keepOut}) => {
  const t = g - EV.impact;
  const born = clamp01(t / 10);
  const dots: React.ReactNode[] = [];
  for (let i = 0; i < DUST; i++) {
    const warm = rand(i, 7) < 0.55;
    const size = 3 + rand(i, 3) * 7;
    const v = 0.35 + rand(i, 4) * 1.1;
    const x = 40 + rand(i, 1) * 1000 + Math.sin(t * 0.03 + i) * 14;
    const y = ((rand(i, 2) * 2100 - t * v) % 2100 + 2100) % 2100 - 90;
    let a = (0.18 + 0.4 * rand(i, 5)) * (0.65 + 0.35 * Math.sin(t * 0.18 + rand(i, 6) * 6.28)) * born;
    for (const k of keepOut) {
      const d = Math.max(k.y0 - y, y - k.y1, 0);
      a *= clamp01(d / 60);
    }
    if (a < 0.02) continue;
    const col = warm ? '255,190,130' : '150,190,255';
    dots.push(
      <div key={i} style={{position: 'absolute', left: x - size * 2, top: y - size * 2, width: size * 4, height: size * 4, borderRadius: '50%', opacity: a,
        background: `radial-gradient(circle, rgba(${col},1) 0%, rgba(${col},0.5) 18%, rgba(${col},0) 60%)`}} />,
    );
  }
  return <div style={{position: 'absolute', inset: 0}}>{dots}</div>;
};

// ---------- film grain (dithers the dark gradients so they survive LinkedIn's re-encode) ----------
export const Grain: React.FC<{g: number}> = ({g}) => (
  <svg width={W} height={H} style={{position: 'absolute', left: 0, top: 0, opacity: 0.07, mixBlendMode: 'overlay', pointerEvents: 'none'}} aria-hidden>
    <filter id={`hdgrain${g}`} x={0} y={0} width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency={0.85} numOctaves={1} seed={g} stitchTiles="stitch" />
      <feColorMatrix type="saturate" values="0" />
    </filter>
    <rect width={W} height={H} filter={`url(#hdgrain${g})`} />
  </svg>
);
