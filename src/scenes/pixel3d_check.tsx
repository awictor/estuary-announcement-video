// OWNER: pixel3d builder. CHECK (global 378-450): chapter 03 DELIVERED. Navy spheres stream in from the
// right edge and assemble a 3D checkmark (sphere k of N lands at 382 + 40k/N, ordered short arm -> long-arm
// tip); the GOLD orb flies in and pops onto the long-arm tip at 426.
import React, {useMemo} from 'react';
import {AbsoluteFill} from 'remotion';
import * as THREE from 'three';
import {C, TIMELINE, rand} from '../theme';
import {ChapterTitle, Pill, TextBox, useGlobalFrame} from '../ui';
import {Cam, Instances, KeyLights, PixelCanvas, PixelSvg, clamp01, easeOutCubic, groupXform, lerp, makeOutlineMaterial, makeRampMaterial,
  plusPath, pxPerUnit, toScreen, toWorld} from './pixel3d_core';

const SEG = TIMELINE.segments.check; // 378..450
const [AS0, AS1] = TIMELINE.events.checkAssemble; // 382, 422
const POP = TIMELINE.events.checkOrbPop; // 426
const CAM: Cam = {z: 20, fov: 40};
const K = pxPerUnit(CAM);

// ---------- checkmark layout (design in screen px, relative to the group centre) ----------
const GC = {x: 540, y: 968}; // group centre on screen
const A = {x: 186, y: 972}, B = {x: 414, y: 1202}, T = {x: 856, y: 756};
const loc = (sx: number, sy: number): [number, number] => [(sx - GC.x) / K, (GC.y - sy) / K];
const [Ax, Ay] = loc(A.x, A.y), [Bx, By] = loc(B.x, B.y), [Tx, Ty] = loc(T.x, T.y);
const STEP = 0.3, LAT = 0.3, SR = 0.2;
type P = {x: number; y: number; z: number; s: number; lat: number};
const PTS: P[] = (() => {
  const pts: P[] = [];
  const l1 = Math.hypot(Bx - Ax, By - Ay), l2 = Math.hypot(Tx - Bx, Ty - By);
  const arm = (x0: number, y0: number, x1: number, y1: number, len: number, j0: number, ext: number, sOff: number) => {
    const dx = (x1 - x0) / len, dy = (y1 - y0) / len, nx = -dy, ny = dx;
    const steps = Math.round((len + ext) / STEP);
    for (let j = j0; j <= steps; j++) {
      const t = j * STEP;
      for (const o of [-1, 0, 1]) pts.push({x: x0 + dx * t + nx * o * LAT, y: y0 + dy * t + ny * o * LAT, z: o === 0 ? 0.2 : 0, s: sOff + t, lat: o});
    }
  };
  arm(Ax, Ay, Bx, By, l1, 0, LAT, 0); // short arm, extended past the vertex to close the outer corner
  arm(Bx, By, Tx, Ty, l2, 1, 0, l1); // long arm
  // order along the stroke (short-arm start -> long-arm tip); within a step, outer lane first
  return pts.sort((a, b) => a.s - b.s || a.lat - b.lat);
})();
export const CHECK_N = PTS.length;
export const landFrame = (k: number) => AS0 + ((AS1 - AS0) * k) / CHECK_N;
const TIP_DIR = (() => { const l = Math.hypot(Tx - Bx, Ty - By); return [(Tx - Bx) / l, (Ty - By) / l]; })();
const ORB_R = 0.46;
const ORB_LOCAL: [number, number, number] = [Tx + TIP_DIR[0] * 0.52, Ty + TIP_DIR[1] * 0.52, 0.2];

// entry point for the stream: just past the right edge, between the tip and the box
const ENTRY = loc(1180, 1064);
const ORB_ENTRY = loc(1170, 920);

const rotYAt = (g: number) => lerp(-0.2, 0.14, clamp01((g - SEG.start) / (SEG.end - SEG.start)));
const breathAt = (g: number) => {
  let b = 1;
  for (const beat of [POP, POP + 12]) {
    const dt = g - beat;
    if (dt >= 0 && dt <= 8) b = 1 + 0.04 * Math.sin((Math.PI * dt) / 8);
  }
  return b;
};

type Sp = {p: [number, number, number]; s: number; flash: boolean};
const sphereAt = (k: number, g: number): Sp => {
  const q = PTS[k];
  const L = landFrame(k);
  const dist = Math.hypot(q.x - ENTRY[0], q.y - ENTRY[1]);
  const D = 9 + 6 * clamp01(dist / 7);
  const t = (g - (L - D)) / D;
  if (t < 0) return {p: [ENTRY[0], ENTRY[1], 0.2], s: 0, flash: false};
  if (t < 1) {
    const e = easeOutCubic(t);
    // quadratic bezier: head left along the stream lane, then peel off to the target
    const cx = q.x + 1.2, cy = ENTRY[1] + (rand(k, 3) - 0.5) * 0.3;
    const u = 1 - e;
    const x = u * u * ENTRY[0] + 2 * u * e * cx + e * e * q.x;
    const y = u * u * ENTRY[1] + 2 * u * e * cy + e * e * q.y;
    return {p: [x, y, lerp(0.2, q.z, e)], s: Math.pow(t, 0.8), flash: false};
  }
  const dl = g - L;
  const bump = dl < 1 ? 1.28 : dl < 2 ? 1.14 : dl < 3 ? 1.05 : 1;
  return {p: [q.x, q.y, q.z], s: bump, flash: dl < 1};
};

// gold orb: arcs in from the right (412..426), squash on contact at 426, settles on the tip
const ORB_T0 = POP - 14;
const orbLocal = (g: number): {p: [number, number, number]; sx: number; sy: number; vis: boolean} => {
  if (g < ORB_T0) return {p: [ORB_ENTRY[0], ORB_ENTRY[1], 0.2], sx: 1, sy: 1, vis: false};
  if (g < POP) {
    const t = (g - ORB_T0) / (POP - ORB_T0);
    const e = 1 - Math.pow(1 - t, 1.6);
    const x = lerp(ORB_ENTRY[0], ORB_LOCAL[0], e);
    const arc = Math.sin(Math.PI * e) * 0.5; // hop over the tip, then drop onto it
    const y = lerp(ORB_ENTRY[1], ORB_LOCAL[1], e) + arc;
    return {p: [x, y, 0.2], sx: 0.94, sy: 1.08, vis: true};
  }
  const dt = g - POP;
  const SQ: [number, number][] = [[1.28, 0.72], [0.9, 1.14], [1.08, 0.94], [0.97, 1.03], [1.02, 0.98]];
  const [sx, sy] = dt < SQ.length ? SQ[dt] : [1, 1];
  // keep the bottom of the orb on the tip while squashing
  return {p: [ORB_LOCAL[0], ORB_LOCAL[1] - ORB_R * (1 - sy) * 0.9, ORB_LOCAL[2]], sx, sy, vis: true};
};

const groupPos = toWorld(CAM, GC.x, GC.y);
const toW = (p: [number, number, number], g: number) => groupXform(p, groupPos, rotYAt(g), breathAt(g));
const shadowOf = (w: [number, number, number]): [number, number, number] => {
  const [sx, sy] = toScreen(CAM, w[0], w[1], w[2]);
  return toWorld(CAM, sx + 16, sy + 20, -1.4);
};
const shadowScale = (w: [number, number, number]) => (CAM.z + 1.4) / (CAM.z - w[2]);

export const CheckStage: React.FC<{g: number}> = ({g}) => {
  const navyMat = useMemo(() => makeRampMaterial({color: C.navy, roughness: 0.38, tint: '#C0D0FF', light: '#4A70B8', t: [0.3, 0.5, 0.86, 0.2], k: [0.5, 0.75, 0.42, 0.6], rim: '#2E5A8E'}), []);
  const flashMat = useMemo(() => new THREE.MeshBasicMaterial({color: C.cyan}), []);
  const outline = useMemo(() => makeOutlineMaterial('#062A22'), []);
  const shadowMat = useMemo(() => new THREE.MeshBasicMaterial({color: '#3DC79B', fog: false}), []);
  const goldMat = useMemo(() => makeRampMaterial({color: '#FFD23F', roughness: 0.42, tint: '#F8D0C0', light: '#FFF6D0', t: [0.33, 0.58, 1.05, 0.12], k: [0.55, 0.78, 0.5, 0.95], rim: '#FFB020', rimT: 0.94}), []);
  const goldOutline = useMemo(() => makeOutlineMaterial('#5A3006'), []);
  const geo = useMemo(() => new THREE.SphereGeometry(SR, 16, 12), []);
  const orbGeo = useMemo(() => new THREE.SphereGeometry(ORB_R, 40, 30), []);
  const ow = 4.2 / K;
  const sp = PTS.map((_, k) => sphereAt(k, g));
  const wp = sp.map(s => toW(s.p, g));
  const br = breathAt(g);
  const orb = orbLocal(g);
  const ow3 = toW(orb.p, g);
  const inst = (flash: boolean, scale = 1) => (i: number) => {
    const s = sp[i];
    const on = s.s > 0 && s.flash === flash;
    return {p: wp[i], s: on ? s.s * br * scale : 0};
  };
  return (
    <PixelCanvas cam={CAM} env={0.6}>
      <KeyLights dir={[-6, 7, 6]} intensity={2.6} fill={0} hemi={['#FFFFFF', '#2A3C9C', 0]} />
      {/* flat drop shadow on the mint wall (down-right of every sphere) */}
      <Instances count={CHECK_N} geometry={geo} material={shadowMat} update={i => {
        const s = sp[i];
        return {p: shadowOf(wp[i]), s: s.s > 0 ? s.s * br * shadowScale(wp[i]) * 1.08 : 0};
      }} />
      <Instances count={CHECK_N} geometry={geo} material={navyMat} update={inst(false)} />
      <Instances count={CHECK_N} geometry={geo} material={flashMat} update={inst(true)} />
      <Instances count={CHECK_N} geometry={geo} material={outline} update={i => {
        const s = sp[i];
        return {p: wp[i], s: s.s > 0 ? s.s * br * (SR + ow) / SR : 0};
      }} />
      {orb.vis && (
        <>
          <mesh geometry={orbGeo} material={shadowMat} position={shadowOf(ow3)} scale={[orb.sx * br * shadowScale(ow3), orb.sy * br * shadowScale(ow3), 1]} />
          <group position={ow3} scale={[orb.sx * br, orb.sy * br, br]}>
            <mesh geometry={orbGeo} material={goldMat} rotation={[0.2, g * 0.08, 0]} />
            <mesh material={goldOutline}><sphereGeometry args={[ORB_R + ow * 1.1, 40, 30]} /></mesh>
          </group>
        </>
      )}
    </PixelCanvas>
  );
};

// Screen position (logical px) of the orb centre and its radius, for the 2D glow/sparkles.
const orbScreen = (g: number) => {
  const o = orbLocal(g);
  const w = toW(o.p, g);
  const [sx, sy] = toScreen(CAM, w[0], w[1], w[2]);
  return {x: sx / 4, y: sy / 4, r: (ORB_R * pxPerUnit(CAM, w[2]) * breathAt(g)) / 4, vis: o.vis};
};

const OrbFx: React.FC<{g: number}> = ({g}) => {
  const o = orbScreen(g);
  if (!o.vis) return null;
  const dt = g - POP;
  let d1 = '', d2 = '';
  const glowW = dt >= 0 && dt < 3 ? 9 : 6;
  for (let y = Math.floor(o.y - o.r - 12); y <= o.y + o.r + 12; y++) for (let x = Math.floor(o.x - o.r - 12); x <= o.x + o.r + 12; x++) {
    const dd = Math.hypot(x + 0.5 - o.x, y + 0.5 - o.y) - o.r;
    if (dd < 1 || dd > glowW) continue;
    if (dd < 3.5) { if ((x + y) % 2 === 0) d1 += `M${x} ${y}h1v1h-1z`; }
    else if (x % 2 === 0 && y % 2 === 0) d2 += `M${x} ${y}h1v1h-1z`;
  }
  // sparkle burst at the pop: 8 pixel stars fly out and twinkle off (426..440)
  const stars = dt >= 0 && dt < 15 ? Array.from({length: 8}, (_, j) => {
    const a = (j / 8) * Math.PI * 2 + 0.3;
    const rr = o.r + 4 + easeOutCubic(dt / 10) * (14 + (j % 2) * 7);
    const arm = dt < 4 ? 3 : dt < 9 ? 2 : 1;
    return {x: o.x + Math.cos(a) * rr, y: o.y + Math.sin(a) * rr, arm, col: j % 2 ? '#FFFFFF' : '#FFD23F'};
  }) : [];
  // expanding pixel ring at the pop (426..432)
  let ring = '';
  if (dt >= 0 && dt < 7) {
    const rr = o.r + 3 + dt * 3.2;
    for (let j = 0; j < 90; j++) {
      const a = (j / 90) * Math.PI * 2;
      ring += `M${Math.round(o.x + Math.cos(a) * rr)} ${Math.round(o.y + Math.sin(a) * rr)}h1v1h-1z`;
    }
  }
  return (
    <PixelSvg>
      <path d={d1} fill="#FFE27A" opacity={0.95} />
      <path d={d2} fill="#FFD23F" opacity={0.8} />
      {ring && <path d={ring} fill="#FFFFFF" opacity={1 - dt / 7} />}
      {stars.map((s, j) => (
        <g key={j}>
          <path d={plusPath(s.x + 1, s.y + 1, s.arm)} fill="#0B6B50" opacity={0.6} />
          <path d={plusPath(s.x, s.y, s.arm)} fill={s.col} />
        </g>
      ))}
    </PixelSvg>
  );
};

// Faint pixel dot grid on the mint wall.
const DOTS = (() => {
  let d = '';
  for (let y = 150; y < 480; y += 10) for (let x = 5; x < 270; x += 10) d += `M${x} ${y}h1v1h-1z`;
  return d;
})();

export const Check: React.FC = () => {
  const g = useGlobalFrame('check');
  return (
    <AbsoluteFill style={{background: C.mint, overflow: 'hidden'}}>
      <PixelSvg><path d={DOTS} fill="#4FD3A6" /></PixelSvg>
      <CheckStage g={g} />
      <OrbFx g={g} />
      <ChapterTitle num="03" title="DELIVERED." at={TIMELINE.events.chapter03} segName="check" ink={C.ink} />
      {/* integration fix: pill enters 2 frames after the title (as in battle1) so the 1.3x title pop never runs under it (no drop here: the pill sits 12 px higher than in battle1) */}
      {g >= TIMELINE.events.chapter03 + 2 && (
        <div style={{position: 'absolute', left: 72, top: 468}}><Pill label="DESTINATION" value="linkedin/feed" /></div>
      )}
      <TextBox id="delivered" segName="check" />
    </AbsoluteFill>
  );
};
export const CHECK_TIP_SCREEN = (g: number) => orbScreen(g);
