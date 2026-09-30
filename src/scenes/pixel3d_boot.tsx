// OWNER: pixel3d builder. BOOT (global 0-54): retro title screen. Frame 0 is the poster.
import React, {useMemo} from 'react';
import {AbsoluteFill} from 'remotion';
import {C, PIXEL_TITLE, PH, PW, TIMELINE, rand} from '../theme';
import {useGlobalFrame} from '../ui';
import {Cam, KeyLights, PixelCanvas, PixelSvg, clamp01, makeRampMaterial, plusPath, pxPerUnit, snap, toWorld} from './pixel3d_core';

const EV = TIMELINE.events;
const PRESS = EV.pressStart; // 40
const [TR0, TR1] = EV.battleTransition; // 44, 54
const FLASHES = [TR0, TR0 + 2]; // two quick white flashes: 44, 46
const STRIPE0 = TR0 + 3; // 47: stripes start
const STRIPE_END = TR1 - 1; // 53: full black (last frame of the segment)

// ---------- layout (real px, all on the 4 px grid) ----------
const ORB = {x: 540, y: 548, r: 140};
const T_ALEX = 788, T_WICTOR = 932, T_SIZE = 128;
const BANNER_Y = 1136; // logical 284
const PRESS_Y = 1328, PRESS_SIZE = 64;
const MICRO_Y = 1460;

// ---------- sky ----------
const SKY = ['#04060C', '#060913', '#080D1B', '#0A1224', '#0C172E', '#0F1C38', '#122243', '#16294F'];
const BAND = PH / SKY.length; // 60 logical px
const ditherRow = (y: number, phase: number) => {
  let d = '';
  for (let x = phase; x < PW; x += 2) d += `M${x} ${y}h1v1h-1z`;
  return d;
};
const sparseRow = (y: number, phase: number) => {
  let d = '';
  for (let x = phase; x < PW; x += 4) d += `M${x} ${y}h1v1h-1z`;
  return d;
};
const DITHER = SKY.slice(1).map((col, i) => {
  const y = (i + 1) * BAND;
  return {col, d: sparseRow(y - 3, 1) + ditherRow(y - 2, 0) + ditherRow(y - 1, 1)};
});

type Star = {x: number; y: number; layer: number; ph: number; col: string};
const STAR_COLS = ['#FFFFFF', '#DCE6FF', '#9FE9F7', '#FFF1C4'];
const STARS: Star[] = Array.from({length: 150}, (_, i) => {
  const q = rand(i, 1);
  return {x: rand(i, 2) * PW, y: rand(i, 3) * PH, layer: q < 0.62 ? 0 : q < 0.9 ? 1 : 2, ph: Math.floor(rand(i, 4) * 24), col: STAR_COLS[Math.floor(rand(i, 5) * STAR_COLS.length)]};
});
const SPEED = [[0.05, 0.02], [0.11, 0.045], [0.2, 0.08]]; // logical px / frame, [x drift left, y drift down]

const Sky: React.FC<{g: number}> = ({g}) => {
  const layers: Record<string, {d: string; o: number}[]> = {};
  const push = (col: string, o: number, d: string) => {
    (layers[col] ??= []).push({d, o});
  };
  STARS.forEach((s, i) => {
    const [vx, vy] = SPEED[s.layer];
    const x = ((Math.floor(s.x - g * vx) % PW) + PW) % PW;
    const y = ((Math.floor(s.y + g * vy) % PH) + PH) % PH;
    const tw = (g + s.ph) % 24; // twinkle cycle
    if (s.layer === 0) {
      const o = tw < 6 ? 0.35 : tw < 18 ? 0.7 : 0.5;
      push(s.col, o, `M${x} ${y}h1v1h-1z`);
    } else if (s.layer === 1) {
      const o = tw < 4 ? 0.55 : 1;
      push(s.col, o, `M${x} ${y}h2v2h-2z`);
    } else {
      const arm = tw < 6 ? 1 : tw < 12 ? 2 : tw < 18 ? 3 : 2;
      push(s.col, 1, plusPath(x, y, arm));
      if (i % 2 === 0) push(s.col, 0.35, `M${x - 1} ${y - 1}h1v1h-1zM${x + 1} ${y - 1}h1v1h-1zM${x - 1} ${y + 1}h1v1h-1zM${x + 1} ${y + 1}h1v1h-1z`);
    }
  });
  // occasional shooting star (deterministic): crosses the top area 8..30
  const sh = g - 8;
  return (
    <PixelSvg>
      {SKY.map((col, i) => <rect key={i} x={0} y={i * BAND} width={PW} height={BAND} fill={col} />)}
      {DITHER.map((dd, i) => <path key={'d' + i} d={dd.d} fill={dd.col} />)}
      {Object.entries(layers).map(([col, items]) => items.map((it, j) => <path key={col + j} d={it.d} fill={col} opacity={it.o} />))}
      {sh >= 0 && sh < 16 && (() => {
        const hx = Math.round(236 - sh * 7), hy = Math.round(30 + sh * 3);
        let d = '';
        for (let k = 0; k < 7; k++) d += `M${hx + k * 2} ${hy - Math.round(k * 0.86)}h2v1h-2z`;
        return <g opacity={sh < 12 ? 1 : 0.5}><path d={`M${hx} ${hy}h2v2h-2z`} fill="#FFFFFF" /><path d={d} fill="#9FE9F7" opacity={0.6} /></g>;
      })()}
    </PixelSvg>
  );
};

// ---------- 3D orb ----------
const CAM: Cam = {z: 12, fov: 30};
export const ORANGE_RAMP = {color: C.orange, roughness: 0.42, tint: '#F2C4D8', light: '#FFD0A0', rim: '#EE6A34', rimT: 0.95};
const OrbScene: React.FC<{g: number; bob: number}> = ({g, bob}) => {
  const orbMat = useMemo(() => makeRampMaterial(ORANGE_RAMP), []);
  const k = pxPerUnit(CAM);
  const R = ORB.r / k;
  const [ox, oy] = toWorld(CAM, ORB.x, ORB.y + bob);
  return (
    <PixelCanvas cam={CAM} env={0.6}>
      <KeyLights dir={[-6, 7, 6]} intensity={2.6} fill={0} hemi={['#FFFFFF', '#2A3C9C', 0]} />
      <mesh position={[ox, oy, 0]} rotation={[0.3, g * 0.035, 0]} material={orbMat}>
        <sphereGeometry args={[R, 48, 36]} />
      </mesh>
    </PixelCanvas>
  );
};
// Dithered pixel glow around the orb (drawn under the 3D canvas).
const Glow: React.FC<{g: number; bob: number}> = ({g, bob}) => {
  const cx = ORB.x / 4, cy = (ORB.y + bob) / 4, r = ORB.r / 4;
  const pulse = g % 12 < 2 ? 1 : 0; // tiny breathing on the 12-frame grid
  let d1 = '', d2 = '', d3 = '';
  for (let y = Math.floor(cy - r - 10); y <= cy + r + 10; y++) for (let x = Math.floor(cx - r - 10); x <= cx + r + 10; x++) {
    const dd = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) - r;
    if (dd < -1 || dd > 9 + pulse) continue;
    if (dd < 2.5) { if ((x + y) % 2 === 0) d1 += `M${x} ${y}h1v1h-1z`; }
    else if (dd < 5.5 + pulse) { if (x % 2 === 0 && y % 2 === 0) d2 += `M${x} ${y}h1v1h-1z`; }
    else if ((x % 4 === 0 && y % 4 === 0) || ((x + 2) % 4 === 0 && (y + 2) % 4 === 0)) d3 += `M${x} ${y}h1v1h-1z`;
  }
  return (
    <PixelSvg>
      <path d={d1} fill="#FF8A30" opacity={0.75} />
      <path d={d2} fill="#FF7A1A" opacity={0.55} />
      <path d={d3} fill="#FF7A1A" opacity={0.35} />
    </PixelSvg>
  );
};
// Dotted orbit ring + riding "data bits"; the back half is drawn under the 3D canvas, the front half over it.
const BIT_COLS = [C.cyan, '#FFFFFF', '#FFD23F', C.cyan];
const RING = {rx: 1.6, ry: 0.36, tilt: -0.2};
const ringPt = (cx: number, cy: number, r: number, a: number): [number, number, boolean] => {
  const ex = Math.cos(a) * r * RING.rx, ey = Math.sin(a) * r * RING.ry;
  return [cx + ex * Math.cos(RING.tilt) - ey * Math.sin(RING.tilt), cy + ex * Math.sin(RING.tilt) + ey * Math.cos(RING.tilt), Math.sin(a) > 0];
};
const Orbit: React.FC<{g: number; bob: number; front: boolean}> = ({g, bob, front}) => {
  const cx = ORB.x / 4, cy = (ORB.y + bob) / 4, r = ORB.r / 4;
  let dots = '';
  const seen = new Set<string>();
  for (let j = 0; j < 72; j++) {
    const a = (j / 72) * Math.PI * 2 + g * 0.012;
    const [x, y, f] = ringPt(cx, cy, r, a);
    if (f !== front) continue;
    const key = `${Math.round(x)},${Math.round(y)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    dots += `M${Math.round(x)} ${Math.round(y)}h1v1h-1z`;
  }
  const bits = BIT_COLS.map((col, i) => {
    const a = g * 0.06 + (i / BIT_COLS.length) * Math.PI * 2;
    const [x, y, f] = ringPt(cx, cy, r, a);
    return {x, y, f, col, i};
  }).filter(b => b.f === front);
  return (
    <PixelSvg>
      <path d={dots} fill={front ? '#9FE9F7' : '#5A7CC0'} opacity={front ? 0.9 : 0.6} />
      {bits.map(b => (
        <g key={b.i}>
          <path d={plusPath(b.x + 1, b.y + 1, front ? 2 : 1)} fill="#140C26" />
          <path d={plusPath(b.x, b.y, front ? 2 : 1)} fill={b.col} opacity={front ? 1 : 0.75} />
        </g>
      ))}
    </PixelSvg>
  );
};
// Pixel sea at the bottom (the "estuary"): stepped bands, drifting shimmer dashes, orange reflection column.
const SEA_Y = 408; // logical
const SEA = ['#0A1A3A', '#0C2046', '#0F2754', '#122E62'];
const Sea: React.FC<{g: number}> = ({g}) => {
  let dash = '', refl = '';
  for (let row = 0; row < 18; row++) {
    const y = SEA_Y + 3 + row * 4;
    const n = 3 + (row % 3);
    for (let j = 0; j < n; j++) {
      const w = 4 + Math.floor(rand(row * 7 + j, 9) * 8);
      const x = Math.floor(((rand(row * 7 + j, 8) * PW + g * (0.25 + (row % 4) * 0.1)) % (PW + 20)) - 10);
      dash += `M${x} ${y}h${w}v1h-${w}z`;
    }
    const rw = 4 + row * 2 + ((Math.floor(g / 4) + row) % 3) * 2;
    const rx = Math.round(PW / 2 - rw / 2 + ((row + Math.floor(g / 6)) % 2 ? 2 : -2));
    if (row % 2 === 0) refl += `M${rx} ${y + 1}h${rw}v1h-${rw}z`;
  }
  return (
    <PixelSvg>
      {SEA.map((c, i) => <rect key={i} x={0} y={SEA_Y + i * 18} width={PW} height={18 + (i === SEA.length - 1 ? 10 : 0)} fill={c} />)}
      <rect x={0} y={SEA_Y} width={PW} height={1} fill="#2A4E9A" />
      <path d={dash} fill="#3A62C8" opacity={0.7} />
      <path d={refl} fill="#FF7A1A" opacity={0.55} />
    </PixelSvg>
  );
};

// ---------- title lockup ----------
const OUTLINE = '#140C26';
const EXTRUDE = ['#C4470F', '#9E3410', '#7A2612'];
const outlineShadows = (t: number, ext: number) => {
  const out: string[] = [];
  for (let dx = -t; dx <= t; dx += 4) for (let dy = -t; dy <= t + ext; dy += 4) if (dx !== 0 || dy !== 0) out.push(`${dx}px ${dy}px 0 ${OUTLINE}`);
  return out.join(',');
};
const extrudeShadows = (ext: number) => {
  const out: string[] = [];
  for (let dy = 4; dy <= ext; dy += 4) out.push(`0 ${dy}px 0 ${EXTRUDE[Math.min(EXTRUDE.length - 1, Math.floor((dy - 4) / 8))]}`);
  return out.join(',');
};
const TitleWord: React.FC<{text: string; top: number; size: number}> = ({text, top, size}) => {
  const w = text.length * size;
  const left = snap((1080 - w) / 2 + size / 16);
  const fp = size / 8; // one font pixel in real px
  const base: React.CSSProperties = {position: 'absolute', left, top, fontFamily: PIXEL_TITLE, fontSize: size, lineHeight: `${size}px`, whiteSpace: 'pre'};
  // stepped vertical gradient, one colour per font-pixel row (glyph rows 0..6)
  const rows = ['#FFF6D0', '#FFE27A', '#FFC23A', '#FFA42A', '#FF8A1E', '#FF7A1A', '#E8600E', '#E8600E'];
  const grad = `linear-gradient(180deg, ${rows.map((c, i) => `${c} ${i * fp}px, ${c} ${(i + 1) * fp}px`).join(', ')})`;
  return (
    <>
      <div style={{...base, color: OUTLINE, textShadow: outlineShadows(8, 24)}}>{text}</div>
      <div style={{...base, color: EXTRUDE[0], textShadow: extrudeShadows(24)}}>{text}</div>
      <div style={{...base, backgroundImage: grad, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent'}}>{text}</div>
    </>
  );
};

// Original ribbon: cyan plate with swallow-tail ends folding behind (drawn on the logical grid).
const Banner: React.FC = () => {
  const y0 = BANNER_Y / 4; // 284
  const L = 34, Rr = 236, Hh = 22; // main plate x 38..232 (776 px), 22 logical tall (88 px)
  const tail = (dir: 1 | -1) => {
    const xo = dir === 1 ? Rr - 8 : L + 8; // tail anchored under the plate end
    const xe = xo + dir * 28;
    const top = y0 + 6, bot = y0 + Hh + 6;
    const notch = xe - dir * 7;
    const pts = [[xo, top], [xe, top], [notch, (top + bot) / 2], [xe, bot], [xo, bot]];
    return pts.map(p => p.join(',')).join(' ');
  };
  const fold = (dir: 1 | -1) => {
    const x = dir === 1 ? Rr : L;
    return `${x},${y0 + Hh} ${x - dir * 8},${y0 + Hh} ${x - dir * 8},${y0 + Hh + 6}`;
  };
  return (
    <>
      <PixelSvg>
        {[1, -1].map(d => (
          <g key={d}>
            <polygon points={tail(d as 1 | -1)} fill="#1E5FB0" stroke={OUTLINE} strokeWidth={1} />
            <polygon points={fold(d as 1 | -1)} fill="#123C78" />
          </g>
        ))}
        <rect x={L - 1} y={y0 - 1} width={Rr - L + 2} height={Hh + 2} fill={OUTLINE} />
        <rect x={L} y={y0} width={Rr - L} height={Hh} fill={C.cyan} />
        <rect x={L} y={y0} width={Rr - L} height={2} fill="#B6F4FF" />
        <rect x={L} y={y0 + Hh - 3} width={Rr - L} height={3} fill="#22A6D6" />
      </PixelSvg>
      <div style={{position: 'absolute', left: 0, width: 1080, top: BANNER_Y + 20, textAlign: 'center', fontFamily: PIXEL_TITLE, fontSize: 48, lineHeight: '48px',
        color: C.navy, textShadow: `0 6px 0 rgba(255,255,255,0.45)`}}>ESTUARY VERSION</div>
    </>
  );
};

const PressStart: React.FC<{g: number}> = ({g}) => {
  let visible = g % 12 < 8; // blinks every 12 frames (8 on / 4 off)
  let col: string = '#F8F8F8';
  if (g >= PRESS) {
    visible = (g - PRESS) % 2 === 0; // rapid select flash: 40, 42, 44, 46, 48 on
    col = '#FFD23F';
  }
  const w = 11 * PRESS_SIZE;
  // Always mounted on its own compositor layer (opacity toggle) with padding around the glyph ink,
  // so toggling never leaves stale glyph edges behind.
  return (
    <div style={{position: 'absolute', left: snap((1080 - w) / 2 + 4) - 32, top: PRESS_Y - 32, padding: 32, opacity: visible ? 1 : 0, willChange: 'opacity',
      fontFamily: PIXEL_TITLE, fontSize: PRESS_SIZE, lineHeight: `${PRESS_SIZE}px`, whiteSpace: 'pre',
      color: col, textShadow: `8px 8px 0 ${OUTLINE}, 0 8px 0 ${OUTLINE}, 8px 0 0 ${OUTLINE}`}}>
      PRESS START
    </div>
  );
};

// Battle transition: two white flashes (44, 46), then 12 horizontal black stripes sweeping in alternate
// directions (47 -> 53, one step per frame); frame 53 is full black.
const Transition: React.FC<{g: number}> = ({g}) => {
  const flash = FLASHES.includes(g);
  const N = 12, SH = 1920 / N;
  const steps = STRIPE_END - STRIPE0 + 1; // 7
  const p = clamp01((g - STRIPE0 + 1) / steps);
  const e = p >= 1 ? 1 : 1 - Math.pow(1 - p, 1.6);
  return (
    <>
      {flash && <AbsoluteFill style={{background: '#F8F8F8'}} />}
      {g >= STRIPE0 && Array.from({length: N}, (_, i) => {
        const w = p >= 1 ? 1080 : snap(1080 * e, 8);
        const fromLeft = i % 2 === 0;
        return (
          <div key={i} style={{position: 'absolute', top: i * SH, height: SH, width: w, left: fromLeft ? 0 : 1080 - w, background: C.black,
            boxShadow: p < 1 ? `${fromLeft ? 8 : -8}px 0 0 ${C.boxFrameDark}` : undefined}} />
        );
      })}
    </>
  );
};

export const Boot: React.FC = () => {
  const g = useGlobalFrame('boot');
  const bob = Math.round(Math.sin((g / 48) * Math.PI * 2) * 3) * 4; // +/-12 px float, stepped to the grid
  return (
    <AbsoluteFill style={{background: SKY[0], overflow: 'hidden'}}>
      <Sky g={g} />
      <Sea g={g} />
      <Glow g={g} bob={bob} />
      <Orbit g={g} bob={bob} front={false} />
      <OrbScene g={g} bob={bob} />
      <Orbit g={g} bob={bob} front />
      <TitleWord text="ALEX" top={T_ALEX} size={T_SIZE} />
      <TitleWord text="WICTOR" top={T_WICTOR} size={T_SIZE} />
      <Banner />
      <PressStart g={g} />
      <div style={{position: 'absolute', left: 0, width: 1080, top: MICRO_Y, textAlign: 'center', fontFamily: PIXEL_TITLE, fontSize: 32, lineHeight: '32px',
        color: C.cyan, opacity: 0.85, textShadow: `4px 4px 0 ${OUTLINE}`}}>DAY 1 - SEPT 2026</div>
      <Transition g={g} />
    </AbsoluteFill>
  );
};
