// OWNER: hd builder. The evolved ALEX: glossy HD orange orb (physical material, clearcoat, RoomEnvironment PMREM)
// with a tilted, gently rotating ring of small glowing spheres (radius ~1.7x the orb). Pure function of GLOBAL frame g.
import React, {useLayoutEffect, useMemo, useRef} from 'react';
import {ThreeCanvas} from '@remotion/three';
import {useThree} from '@react-three/fiber';
import {spring} from 'remotion';
import * as THREE from 'three';
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js';
import {C, FPS, H, W, rand} from '../theme';
import {EV, clamp01, orbLayout, sinceBeat} from './hd_fx';

export const CAM_Z = 20, FOV = 30;
// Screen px per world unit on the z=0 plane.
export const KPX = H / 2 / (CAM_Z * Math.tan((FOV / 2) * Math.PI / 180));
export const ORB_R_PX = 150;
const ORB_R = ORB_R_PX / KPX;
const RING_R = ORB_R * 1.7;
const TILT_X = 0.34, TILT_Z = 0.2;
const CX = Math.cos(TILT_X), SX = Math.sin(TILT_X), CZ = Math.cos(TILT_Z), SZ = Math.sin(TILT_Z);
// Ring-local point (in the ring's XZ plane) -> orb-local, tilted (X first, then Z).
const tilt = (x: number, y: number, z: number): [number, number, number] => {
  const y1 = y * CX - z * SX, z1 = y * SX + z * CX;
  return [x * CZ - y1 * SZ, x * SZ + y1 * CZ, z1];
};

const Env: React.FC = () => {
  const {gl, scene} = useThree();
  useLayoutEffect(() => {
    gl.toneMapping = THREE.NeutralToneMapping;
    gl.toneMappingExposure = 1;
    const pm = new THREE.PMREMGenerator(gl);
    const rt = pm.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = rt.texture;
    scene.environmentIntensity = 0.5;
    return () => {
      scene.environment = null;
      rt.dispose();
      pm.dispose();
    };
  }, [gl, scene]);
  return null;
};

const makeGlowTexture = () => {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d')!;
  const gr = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.14, 'rgba(255,255,255,0.7)');
  gr.addColorStop(0.38, 'rgba(255,255,255,0.18)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gr;
  x.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
};

// Ring particles: a bright lane of glowing beads + a faint dusty band.
type P = {a: number; r: number; y: number; s: number; col: string; d: number; bead: boolean};
const BEADS = 34, DUSTP = 150;
const PARTS: P[] = (() => {
  const out: P[] = [];
  const beadCols = ['#FFE7CC', '#FFFFFF', '#FFC48A', '#BFD4FF', '#FFE7CC', C.cyan, '#FFFFFF', '#FFB066'];
  for (let i = 0; i < BEADS; i++) {
    out.push({a: (i / BEADS) * Math.PI * 2 + (rand(i, 11) - 0.5) * 0.12, r: RING_R * (1 + (rand(i, 12) - 0.5) * 0.05),
      y: (rand(i, 13) - 0.5) * 0.02, s: (rand(i, 14) < 0.2 ? 0.075 : 0.05) + rand(i, 15) * 0.015,
      col: beadCols[i % beadCols.length], d: rand(i, 16) * 5, bead: true});
  }
  for (let i = 0; i < DUSTP; i++) {
    const k = rand(i, 21);
    out.push({a: rand(i, 22) * Math.PI * 2, r: RING_R * (0.86 + 0.3 * Math.pow(rand(i, 23), 1.3)), y: (rand(i, 24) - 0.5) * 0.05,
      s: 0.012 + rand(i, 25) * 0.014, col: k < 0.6 ? '#FFD9B5' : k < 0.85 ? '#AFC6FF' : C.cyan, d: 2 + rand(i, 26) * 7, bead: false});
  }
  return out;
})();

const RingParticles: React.FC<{g: number}> = ({g}) => {
  const sph = useRef<THREE.InstancedMesh>(null);
  const halo = useRef<THREE.InstancedMesh>(null);
  const geo = useMemo(() => new THREE.SphereGeometry(1, 20, 14), []);
  const plane = useMemo(() => new THREE.PlaneGeometry(1, 1), []);
  const tex = useMemo(() => makeGlowTexture(), []);
  const sphMat = useMemo(() => new THREE.MeshBasicMaterial({color: '#ffffff', toneMapped: false}), []);
  const haloMat = useMemo(() => new THREE.MeshBasicMaterial({map: tex, color: '#ffffff', transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, toneMapped: false}), [tex]);
  useLayoutEffect(() => {
    const m = sph.current!, h = halo.current!;
    const o = new THREE.Object3D();
    const col = new THREE.Color();
    const t = g - EV.impact;
    const spin = t * 0.011;
    PARTS.forEach((q, i) => {
      const lt = t - q.d;
      const e = lt <= 0 ? 0 : spring({frame: lt, fps: FPS, config: {damping: 11, stiffness: 110, mass: 0.7}});
      const grow = clamp01(lt / 7);
      const rr = q.r * (0.3 + 0.7 * e);
      const a = q.a + spin * (q.bead ? 1 : 0.85) + (1 - e) * 0.9;
      const [x, y, z] = tilt(rr * Math.cos(a), q.y, rr * Math.sin(a));
      // beads twinkle gently; front beads a touch brighter
      const tw = q.bead ? 0.85 + 0.15 * Math.sin(t * 0.21 + i * 1.7) : 0.7 + 0.3 * Math.sin(t * 0.13 + i);
      const s = q.s * grow * (q.bead ? 1 + 0.08 * Math.exp(-sinceBeat(g) / 4) : 1);
      o.position.set(x, y, z);
      o.scale.setScalar(Math.max(s, 1e-5));
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
      col.set(q.col);
      m.setColorAt(i, col);
      o.scale.setScalar(Math.max(s * (q.bead ? 7.5 : 6) , 1e-5));
      o.position.set(x, y, z + 0.001);
      o.updateMatrix();
      h.setMatrixAt(i, o.matrix);
      col.set(q.col).multiplyScalar((q.bead ? 0.7 : 0.45) * tw);
      h.setColorAt(i, col);
    });
    m.instanceMatrix.needsUpdate = true;
    h.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    if (h.instanceColor) h.instanceColor.needsUpdate = true;
  });
  return (
    <>
      <instancedMesh ref={sph} args={[geo, sphMat, PARTS.length]} frustumCulled={false} />
      <instancedMesh ref={halo} args={[plane, haloMat, PARTS.length]} frustumCulled={false} renderOrder={5} />
    </>
  );
};

// Thin luminous guide ring under the beads.
const GuideRing: React.FC<{g: number}> = ({g}) => {
  const t = g - EV.impact;
  const e = t <= 1 ? 0 : spring({frame: t - 1, fps: FPS, config: {damping: 12, stiffness: 100, mass: 0.7}});
  return (
    <group rotation={new THREE.Euler(TILT_X - Math.PI / 2, 0, TILT_Z, 'ZYX')} scale={Math.max(0.3 + 0.7 * e, 1e-4)}>
      <mesh renderOrder={4}>
        <torusGeometry args={[RING_R, 0.0075, 8, 220]} />
        <meshBasicMaterial color="#FFD2A8" transparent opacity={0.5 * clamp01(t / 8)} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh renderOrder={4}>
        <torusGeometry args={[RING_R * 1.12, 0.004, 6, 220]} />
        <meshBasicMaterial color="#9FB8FF" transparent opacity={0.28 * clamp01((t - 4) / 10)} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
};

const Orb: React.FC<{g: number}> = ({g}) => {
  const t = g - EV.impact;
  const enter = t < 0 ? 0 : spring({frame: t, fps: FPS, config: {damping: 9, stiffness: 150, mass: 0.6}});
  const breath = 1 + 0.012 * Math.sin((t / 64) * Math.PI * 2) + 0.022 * Math.exp(-sinceBeat(g) / 3.5) * clamp01((t - 12) / 6);
  const s = Math.max((0.45 + 0.55 * enter) * breath, 1e-4);
  const glow = 0.06 + 0.94 * Math.exp(-Math.max(t, 0) / 5);
  return (
    <mesh scale={s} rotation={[0.25, t * 0.01, 0]}>
      <sphereGeometry args={[ORB_R, 128, 96]} />
      <meshPhysicalMaterial color={C.orange} roughness={0.34} metalness={0} clearcoat={1} clearcoatRoughness={0.04}
        emissive="#FF5A00" emissiveIntensity={glow * 0.55} envMapIntensity={0.8} />
    </mesh>
  );
};

export const OrbCanvas: React.FC<{g: number}> = ({g}) => {
  const {cx, cy, s} = orbLayout(g);
  const wx = (cx - W / 2) / KPX, wy = (H / 2 - cy) / KPX;
  return (
    <div style={{position: 'absolute', left: 0, top: 0, width: W, height: H}}>
      <ThreeCanvas width={W} height={H} gl={{antialias: true, alpha: true, powerPreference: 'high-performance'}}
        camera={{position: [0, 0, CAM_Z], fov: FOV, near: 0.1, far: 100}}>
        <Env />
        <ambientLight intensity={0.02} />
        <directionalLight position={[-5, 7, 9]} intensity={1.35} color="#FFF3E6" />
        <directionalLight position={[6, 2.5, -7]} intensity={2.6} color="#7FA6FF" />
        <directionalLight position={[2, -6, 4]} intensity={0.08} color="#FFB27A" />
        <group position={[wx, wy, 0]} scale={s}>
          <Orb g={g} />
          <GuideRing g={g} />
          <RingParticles g={g} />
        </group>
      </ThreeCanvas>
    </div>
  );
};

// DOM halo behind the canvas (soft warm bloom around the orb).
export const OrbGlow: React.FC<{g: number}> = ({g}) => {
  const {cx, cy, s} = orbLayout(g);
  const t = g - EV.impact;
  const beat = Math.exp(-sinceBeat(g) / 4) * clamp01((t - 12) / 6);
  const R = ORB_R_PX * s;
  const a = 0.5 + 0.12 * beat;
  return (
    <div style={{position: 'absolute', inset: 0,
      background: `radial-gradient(circle at ${cx}px ${cy}px, rgba(255,150,70,${a}) ${R * 0.9}px, rgba(255,122,26,${a * 0.45}) ${R * 1.25}px, rgba(255,122,26,${a * 0.12}) ${R * 1.9}px, rgba(255,122,26,0) ${R * 2.6}px)`}} />
  );
};
