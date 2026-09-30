// OWNER: pixel3d builder. RIVER (global 282-354): chapter 02 STREAMED. A pixelated river of spheres winds
// from the bottom-left to the top-right between the chapter block (y < 560) and the dialogue box (y >= 1362);
// the GOLD orb (the captured record) rides inside it for the whole segment.
import React, {useMemo} from 'react';
import {AbsoluteFill} from 'remotion';
import * as THREE from 'three';
import {C, TIMELINE, rand} from '../theme';
import {BOX, CHAPTER_KEEPOUT, ChapterTitle, Pill, TextBox, useGlobalFrame} from '../ui';
import {Ball, Cam, KeyLights, PixelCanvas, PixelSvg, Spheres, makeOutlineMaterial, makeRampMaterial, plusPath, pxPerUnit, sinceBeat, toScreen, toWorld} from './pixel3d_core';

const SEG = TIMELINE.segments.river; // 282..354
const [RIDE0, RIDE1] = TIMELINE.events.riverOrbRide; // 282, 354
export const RIVER_CAM: Cam = {z: 21, fov: 44};
const K = pxPerUnit(RIVER_CAM);

// Control points in real screen px (at z) -> world. Three runs: bottom (L->R), middle (R->L), top (L->R, exits right).
const CTRL: [number, number, number][] = [
  [-360, 1230, 0], [-40, 1234, 0.2], [300, 1226, -0.2], [600, 1204, 0.25], [800, 1140, 0],
  [830, 1026, -0.25], [680, 960, 0.2], [460, 940, 0], [280, 904, -0.2], [204, 816, 0.2],
  [276, 732, 0], [470, 698, -0.2], [760, 692, 0.2], [1000, 690, 0], [1440, 684, 0],
];
const CURVE = new THREE.CatmullRomCurve3(CTRL.map(([sx, sy, z]) => new THREE.Vector3(...toWorld(RIVER_CAM, sx, sy, z))), false, 'centripetal');
const NS = 2400;
const TAB = Array.from({length: NS + 1}, (_, i) => {
  const u = i / NS;
  const p = CURVE.getPointAt(u), t = CURVE.getTangentAt(u);
  const nl = Math.hypot(t.x, t.y) || 1;
  return {p, nx: -t.y / nl, ny: t.x / nl};
});
const at = (u: number) => TAB[Math.min(NS, Math.max(0, Math.round((((u % 1) + 1) % 1) * NS)))];
// Where the curve's centre crosses given screen x (first crossing from the start / last from the end).
const uAtX = (sx: number, fromEnd: boolean) => {
  const idx = [...TAB.keys()];
  if (fromEnd) idx.reverse();
  for (const i of idx) {
    const {p} = TAB[i];
    const [x] = toScreen(RIVER_CAM, p.x, p.y, p.z);
    if (fromEnd ? x <= sx : x >= sx) return i / NS;
  }
  return fromEnd ? 1 : 0;
};
const U_IN = uAtX(64, false); // orb centre on screen at the left edge on the first frame
const U_OUT = uAtX(1112, true); // orb centre past the right edge at ~352
const ORB_V = (U_OUT - U_IN) / (RIDE1 - 2 - RIDE0); // u per frame
export const orbU = (g: number) => U_IN + (g - RIDE0) * ORB_V;

const TUBE = 0.6; // world radius of the stream (sphere centres)
const SR = 0.17; // sphere radius
const N = 440;
const ORB_R = 0.46;
const ORB_Z = 0.25;

// Each sphere's colour class is fixed, so split them into three instanced meshes with their own ramp palettes.
const CLS = Array.from({length: N}, (_, i) => {
  const kc = rand(i, 4);
  return kc < 0.72 ? 0 : kc < 0.88 ? 1 : 2;
});
const IDX = [0, 1, 2].map(c => CLS.map((k, i) => (k === c ? i : -1)).filter(i => i >= 0));
const OUTLINE_W = 4.2 / K; // ~1 logical px

export const RiverStage: React.FC<{g: number}> = ({g}) => {
  const mats = useMemo(() => [
    makeRampMaterial({color: '#FFFFFF', roughness: 0.4, tint: '#C8D4FF', rim: '#B8C8FF'}),
    makeRampMaterial({color: C.navy, roughness: 0.4, tint: '#C0D0FF', light: '#3A5C9A', k: [0.55, 0.78, 0.4, 0.6], rim: '#2E4E86'}),
    makeRampMaterial({color: C.cyan, roughness: 0.4, tint: '#C8D8FF', light: '#D8FAFF', rim: '#9FE9F7'}),
  ], []);
  const outlineMat = useMemo(() => makeOutlineMaterial('#23328C'), []);
  const goldMat = useMemo(() => makeRampMaterial({color: '#FFD23F', roughness: 0.42, tint: '#F8D0C0', light: '#FFF6D0', t: [0.33, 0.58, 1.05, 0.12], k: [0.55, 0.78, 0.5, 0.95], rim: '#FFB020', rimT: 0.94}), []);
  const goldOutline = useMemo(() => makeOutlineMaterial('#6A3A08'), []);
  const lg = g - RIDE0;
  const ou = orbU(g);
  const o = at(ou);
  const op: [number, number, number] = [o.p.x, o.p.y, o.p.z + ORB_Z];
  const sb = sinceBeat(g);
  const pulse = sb === 0 ? 1.16 : sb === 1 ? 1.09 : sb === 2 ? 1.04 : 1;
  const part = ORB_R * 1.5;
  const sphere = (i: number) => {
    const v = ORB_V * (0.82 + 0.36 * rand(i, 1));
    const u = rand(i, 0) + lg * v;
    const q = at(u);
    const a = rand(i, 2) * Math.PI * 2 + lg * 0.05 * (rand(i, 5) - 0.5);
    const r = TUBE * Math.sqrt(rand(i, 3));
    let x = q.p.x + q.nx * r * Math.cos(a), y = q.p.y + q.ny * r * Math.cos(a);
    const z = q.p.z + r * Math.sin(a);
    // part the stream around the orb so it is never hidden by spheres in front of it
    const dx = x - op[0], dy = y - op[1], d = Math.hypot(dx, dy);
    if (z > op[2] - 0.35 && d < part) {
      const k = part / Math.max(d, 1e-3);
      x = op[0] + dx * k; y = op[1] + dy * k;
    }
    const s = (0.78 + 0.44 * rand(i, 6)) * pulse;
    return {p: [x, y, z] as [number, number, number], s};
  };
  return (
    <PixelCanvas cam={RIVER_CAM} env={0.6}>
      <fog attach="fog" args={[C.blue, 20.2, 24]} />
      <KeyLights dir={[-6, 7, 6]} intensity={2.6} fill={0} hemi={['#FFFFFF', '#2A3C9C', 0]} />
      {IDX.map((idx, c) => (
        <Spheres key={c} count={idx.length} radius={SR} material={mats[c]} outline={{material: outlineMat, width: OUTLINE_W}} update={j => sphere(idx[j])} />
      ))}
      <Ball p={op} r={ORB_R} material={goldMat} outline={goldOutline} ow={OUTLINE_W * 1.1} rot={[0.2, lg * 0.08, 0]} />
    </PixelCanvas>
  );
};

// Gold orb glow (dithered, drawn over the stream) + a short sparkle trail along the path behind it.
const OrbFx: React.FC<{g: number}> = ({g}) => {
  const ou = orbU(g);
  const o = at(ou);
  const [sx, sy] = toScreen(RIVER_CAM, o.p.x, o.p.y, o.p.z + ORB_Z);
  const cx = sx / 4, cy = sy / 4;
  const r = (ORB_R * pxPerUnit(RIVER_CAM, o.p.z + ORB_Z)) / 4;
  const beat = sinceBeat(g) < 2 ? 2 : 0;
  let d1 = '', d2 = '';
  for (let y = Math.floor(cy - r - 9); y <= cy + r + 9; y++) for (let x = Math.floor(cx - r - 9); x <= cx + r + 9; x++) {
    const dd = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) - r;
    if (dd < 0.6 || dd > 7 + beat) continue;
    if (dd < 3 + beat / 2) { if ((x + y) % 2 === 0) d1 += `M${x} ${y}h1v1h-1z`; }
    else if (x % 2 === 0 && y % 2 === 0) d2 += `M${x} ${y}h1v1h-1z`;
  }
  const trail = [0.012, 0.022, 0.034, 0.047].map((du, j) => {
    const q = at(ou - du);
    const [tx, ty] = toScreen(RIVER_CAM, q.p.x, q.p.y, q.p.z + ORB_Z);
    const wob = (rand(j, Math.floor(g / 2)) - 0.5) * 6;
    return {x: tx / 4 + q.nx * wob, y: ty / 4 - q.ny * wob, arm: j < 2 ? 2 : 1, o: 1 - j * 0.2};
  });
  return (
    <PixelSvg>
      <path d={d1} fill="#FFE27A" opacity={0.9} />
      <path d={d2} fill="#FFD23F" opacity={0.7} />
      {trail.map((t, j) => <path key={j} d={plusPath(t.x, t.y, t.arm)} fill={j % 2 ? '#FFFFFF' : '#FFE27A'} opacity={t.o} />)}
    </PixelSvg>
  );
};

// Subtle 2D current lines in the background (lighter blue dashes drifting right), kept below the title block.
const Current: React.FC<{g: number}> = ({g}) => {
  let d = '';
  for (let j = 0; j < 26; j++) {
    const y = 150 + Math.floor(rand(j, 11) * 190);
    const w = 6 + Math.floor(rand(j, 12) * 14);
    const x = Math.floor(((rand(j, 13) * 300 + (g - SEG.start) * (0.6 + rand(j, 14) * 0.8)) % 300) - 20);
    d += `M${x} ${y}h${w}v1h-${w}z`;
  }
  return <PixelSvg><path d={d} fill="#6C86F6" opacity={0.55} /></PixelSvg>;
};

export const River: React.FC = () => {
  const g = useGlobalFrame('river');
  return (
    <AbsoluteFill style={{background: C.blue, overflow: 'hidden'}}>
      <Current g={g} />
      <RiverStage g={g} />
      <OrbFx g={g} />
      <ChapterTitle num="02" title="STREAMED." at={TIMELINE.events.chapter02} segName="river" ink={C.white} shadow="rgba(10,31,58,0.55)" />
      {/* integration fix: pill enters 2 frames after the title (as in battle1) so the 1.3x title pop never runs under it (no drop here: the pill sits 12 px higher than in battle1) */}
      {g >= TIMELINE.events.chapter02 + 2 && (
        <div style={{position: 'absolute', left: 72, top: 468}}><Pill label="COLLECTION" value="estuary/team/members" /></div>
      )}
      <TextBox id="effective" segName="river" />
    </AbsoluteFill>
  );
};
// Exposed for layout checks.
export const RIVER_LIMITS = {top: CHAPTER_KEEPOUT.y1, bottom: BOX.y};
