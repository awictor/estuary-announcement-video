// OWNER: pixel3d builder. Shared helpers for the pixelated 3D sections (boot, river, check).
// PixelCanvas renders a ThreeCanvas at the logical 270x480 grid (dpr 1, no AA) and upscales it 4x with
// nearest-neighbour sampling so every sphere reads as a pixel sprite. Materials use a "palette ramp":
// the lit PBR result (RoomEnvironment + key light) is quantised into 5 bands of a per-material palette.
import React, {useLayoutEffect, useMemo, useRef} from 'react';
import {useCurrentFrame} from 'remotion';
import {ThreeCanvas} from '@remotion/three';
import {useThree} from '@react-three/fiber';
import * as THREE from 'three';
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js';
import {H, PH, PW, PX, W} from '../theme';

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - clamp01(t), 3);
export const easeInCubic = (t: number) => Math.pow(clamp01(t), 3);
export const easeInOutSine = (t: number) => -(Math.cos(Math.PI * clamp01(t)) - 1) / 2;
export const easeOutBack = (t: number, s = 1.7) => {
  const u = clamp01(t) - 1;
  return 1 + u * u * ((s + 1) * u + s);
};
export const snap = (v: number, q = PX) => Math.round(v / q) * q;
// Beat grid (timeline.json): beat n at frame 54 + 12n. Returns frames since the most recent beat (>= 0).
export const sinceBeat = (g: number) => (((g - 54) % 12) + 12) % 12;

export type Cam = {z: number; fov: number};
// Screen (real px, 1080x1920) <-> world helpers for a camera on the +z axis looking at the origin.
export const pxPerUnit = (cam: Cam, wz = 0) => H / 2 / ((cam.z - wz) * Math.tan((cam.fov / 2) * Math.PI / 180));
export const toWorld = (cam: Cam, sx: number, sy: number, wz = 0): [number, number, number] => {
  const k = pxPerUnit(cam, wz);
  return [(sx - W / 2) / k, (H / 2 - sy) / k, wz];
};
export const toScreen = (cam: Cam, x: number, y: number, z: number): [number, number] => {
  const k = pxPerUnit(cam, z);
  return [W / 2 + x * k, H / 2 - y * k];
};
// Apply a <group position rotation-y scale> transform to a local point (matches three's T * R * S order).
export const groupXform = (p: [number, number, number], pos: [number, number, number], rotY: number, scale: number): [number, number, number] => {
  const x = p[0] * scale, y = p[1] * scale, z = p[2] * scale;
  const c = Math.cos(rotY), s = Math.sin(rotY);
  return [pos[0] + x * c + z * s, pos[1] + y, pos[2] - x * s + z * c];
};

// ---------- environment + tone mapping ----------
const GL = {antialias: false, alpha: true, powerPreference: 'high-performance' as const, toneMapping: THREE.NeutralToneMapping, toneMappingExposure: 1};

const PixelEnv: React.FC<{intensity: number}> = ({intensity}) => {
  const {gl, scene} = useThree();
  useLayoutEffect(() => {
    gl.toneMapping = THREE.NeutralToneMapping;
    const pm = new THREE.PMREMGenerator(gl);
    const env = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = intensity;
    return () => {
      scene.environment = null;
      env.dispose();
      pm.dispose();
    };
  }, [gl, scene, intensity]);
  return null;
};

// ThreeCanvas at 270x480 logical px, scaled 4x with image-rendering: pixelated (inherited by the canvas).
export const PixelCanvas: React.FC<{cam: Cam; env?: number; children?: React.ReactNode; style?: React.CSSProperties}> = ({cam, env = 0.8, children, style}) => (
  <div style={{position: 'absolute', left: 0, top: 0, width: PW, height: PH, transform: `scale(${PX})`, transformOrigin: '0 0', imageRendering: 'pixelated', ...style}}>
    <ThreeCanvas width={PW} height={PH} dpr={1} gl={GL}
      camera={{position: [0, 0, cam.z], fov: cam.fov, near: 0.1, far: 200}}>
      <PixelEnv intensity={env} />
      {children}
    </ThreeCanvas>
  </div>
);

// ---------- palette-ramp material ----------
export type RampOpts = {
  color?: string; roughness?: number; metalness?: number;
  // thresholds: [dark|mid, mid|base, base|light] on the diffuse irradiance factor, [3] = specular luma for the highlight
  t?: [number, number, number, number];
  // multipliers: dark, mid (x albedo), light (mix toward `light`), highlight (mix toward white)
  k?: [number, number, number, number];
  tint?: string; // hue shift applied to the dark/mid bands (pixel-art style shadows)
  light?: string; // colour the "light" band mixes toward
  emissive?: string; emissiveIntensity?: number;
  rim?: string; // optional reflected-light rim colour on the lower-right edge (dark bands only)
  rimDir?: [number, number, number]; rimT?: number;
};
const RAMP_GLSL = /* glsl */ `
{
  // Band on the diffuse irradiance factor (albedo independent) + a specular test for the highlight.
  vec3 baseS = sRGBTransferOETF(vec4(clamp(diffuseColor.rgb, 0.0, 1.0), 1.0)).rgb;
  vec3 lw = vec3(0.2126, 0.7152, 0.0722);
  float dl = dot(reflectedLight.directDiffuse + reflectedLight.indirectDiffuse, lw) / max(dot(diffuseColor.rgb, lw), 0.002);
  float sp = dot(reflectedLight.directSpecular + 0.35 * reflectedLight.indirectSpecular, lw);
  vec3 col;
  if (dl < uRampT.x) col = baseS * uRampK.x * uTint * uTint;
  else if (dl < uRampT.y) col = baseS * uRampK.y * uTint;
  else if (dl < uRampT.z) col = baseS;
  else col = mix(baseS, uLight, uRampK.z);
  if (sp > uRampT.w) col = mix(baseS, vec3(1.0), uRampK.w);
  if (uRim.w > 0.0 && dl < uRampT.y && dot(normalize(normal), uRimDir) > uRimT) col = mix(col, uRim.rgb, uRim.w);
  gl_FragColor.rgb = clamp(col, 0.0, 1.0);
}
`;
const srgbVec = (hex: string) => {
  const n = parseInt(hex.replace('#', ''), 16);
  return new THREE.Vector3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};
let rampId = 0;
export const makeRampMaterial = (o: RampOpts = {}) => {
  const m = new THREE.MeshStandardMaterial({color: o.color ?? '#ffffff', roughness: o.roughness ?? 0.35, metalness: o.metalness ?? 0,
    emissive: o.emissive ?? '#000000', emissiveIntensity: o.emissiveIntensity ?? 0});
  const t = o.t ?? [0.33, 0.58, 1.1, 0.2];
  const k = o.k ?? [0.55, 0.78, 0.35, 0.85];
  const tint = srgbVec(o.tint ?? '#E0E8FF');
  const light = srgbVec(o.light ?? '#FFFFFF');
  const rim = o.rim ? srgbVec(o.rim) : new THREE.Vector3();
  const rd = new THREE.Vector3(...(o.rimDir ?? [0.72, -0.62, 0.3])).normalize();
  const u = {uRampT: {value: new THREE.Vector4(...t)}, uRampK: {value: new THREE.Vector4(...k)}, uTint: {value: tint}, uLight: {value: light},
    uRim: {value: new THREE.Vector4(rim.x, rim.y, rim.z, o.rim ? 1 : 0)}, uRimDir: {value: rd}, uRimT: {value: o.rimT ?? 0.93}};
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, u);
    sh.fragmentShader = 'uniform vec4 uRampT;\nuniform vec4 uRampK;\nuniform vec3 uTint;\nuniform vec3 uLight;\nuniform vec4 uRim;\nuniform vec3 uRimDir;\nuniform float uRimT;\n' +
      sh.fragmentShader.replace('#include <fog_fragment>', RAMP_GLSL + '\n#include <fog_fragment>');
  };
  const key = 'pixel-ramp-v3-' + (rampId++);
  m.customProgramCacheKey = () => key;
  return m;
};

// ---------- instanced meshes (pure function of frame) ----------
export type InstOut = {p: [number, number, number]; s: number; c?: string; sx?: number; sy?: number; sz?: number; r?: [number, number, number]};
export type Inst = (i: number) => InstOut;
export const Instances: React.FC<{count: number; geometry: THREE.BufferGeometry; update: Inst; material: THREE.Material; renderOrder?: number}> = ({count, geometry, update, material, renderOrder}) => {
  const ref = useRef<THREE.InstancedMesh>(null);
  useCurrentFrame(); // re-render (and re-run the layout effect) every frame
  useLayoutEffect(() => {
    const m = ref.current!;
    const d = new THREE.Object3D();
    const col = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const {p, s, c, sx, sy, sz, r} = update(i);
      d.position.set(p[0], p[1], p[2]);
      const ss = Math.max(s, 0.0001);
      d.scale.set(ss * (sx ?? 1), ss * (sy ?? 1), ss * (sz ?? 1));
      if (r) d.rotation.set(r[0], r[1], r[2]); else d.rotation.set(0, 0, 0);
      d.updateMatrix();
      m.setMatrixAt(i, d.matrix);
      if (c) m.setColorAt(i, col.set(c));
    }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  });
  return <instancedMesh ref={ref} args={[geometry, material, count]} frustumCulled={false} renderOrder={renderOrder} />;
};
// Inverted-hull outline material: back faces of a slightly larger copy, flat colour (reads as a 1 px sprite outline).
export const makeOutlineMaterial = (color: string) => new THREE.MeshBasicMaterial({color, side: THREE.BackSide});
export const Spheres: React.FC<{count: number; radius: number; update: Inst; material: THREE.Material; seg?: number; renderOrder?: number;
  outline?: {material: THREE.Material; width: number}}> = ({count, radius, update, material, seg = 16, renderOrder, outline}) => {
  const geo = useMemo(() => new THREE.SphereGeometry(radius, seg, Math.max(8, Math.round(seg * 0.75))), [radius, seg]);
  const ok = outline ? (radius + outline.width) / radius : 1;
  return (
    <>
      <Instances count={count} geometry={geo} update={update} material={material} renderOrder={renderOrder} />
      {outline && <Instances count={count} geometry={geo} material={outline.material} renderOrder={renderOrder}
        update={i => { const o = update(i); return {...o, s: o.s * ok}; }} />}
    </>
  );
};
// A single outlined sphere.
export const Ball: React.FC<{p: [number, number, number]; r: number; material: THREE.Material; outline?: THREE.Material; ow?: number;
  sx?: number; sy?: number; rot?: [number, number, number]}> = ({p, r, material, outline, ow = 0.03, sx = 1, sy = 1, rot = [0, 0, 0]}) => (
  <group position={p} scale={[sx, sy, 1]}>
    <mesh material={material} rotation={rot}><sphereGeometry args={[r, 40, 30]} /></mesh>
    {outline && <mesh material={outline}><sphereGeometry args={[r + ow, 40, 30]} /></mesh>}
  </group>
);

// Stepped halo: concentric flat discs (reads as a pixel-art glow once rendered at 270x480).
export const Halo: React.FC<{p: [number, number, number]; r: number; color: string; steps?: [number, number][]; scale?: number}> = ({p, r, color, steps = [[1.3, 0.34], [1.65, 0.2], [2.1, 0.1]], scale = 1}) => (
  <group position={p} scale={scale}>
    {steps.map(([k, o], i) => (
      <mesh key={i} renderOrder={-10 + i}>
        <circleGeometry args={[r * k, 48]} />
        <meshBasicMaterial color={color} transparent opacity={o} depthWrite={false} toneMapped={false} />
      </mesh>
    ))}
  </group>
);

// Key light + soft fill. The env map does most of the shaping; the key sets the band direction.
export const KeyLights: React.FC<{dir?: [number, number, number]; intensity?: number; fill?: number; hemi?: [string, string, number]; rim?: [number, number, number, number]}> = ({dir = [-6, 8, 9], intensity = 2.6, fill = 0.12, hemi = ['#ffffff', '#6070a0', 0.35], rim}) => (
  <>
    <ambientLight intensity={fill} />
    <hemisphereLight args={[hemi[0], hemi[1], hemi[2]]} />
    <directionalLight position={dir} intensity={intensity} />
    {rim && <directionalLight position={[rim[0], rim[1], rim[2]]} intensity={rim[3]} />}
  </>
);

// Pixel-art sparkle (plus shape) in logical px, drawn into an SVG on the 270x480 grid.
export const plusPath = (x: number, y: number, arm: number) => {
  const X = Math.round(x), Y = Math.round(y);
  let d = `M${X} ${Y}h1v1h-1z`;
  for (let a = 1; a <= arm; a++) d += `M${X + a} ${Y}h1v1h-1zM${X - a} ${Y}h1v1h-1zM${X} ${Y + a}h1v1h-1zM${X} ${Y - a}h1v1h-1z`;
  return d;
};
// Full-frame SVG on the logical grid (270x480 viewBox, crisp edges) for 2D pixel overlays.
export const PixelSvg: React.FC<{children?: React.ReactNode; style?: React.CSSProperties}> = ({children, style}) => (
  <svg width={W} height={H} viewBox={`0 0 ${PW} ${PH}`} shapeRendering="crispEdges" style={{position: 'absolute', left: 0, top: 0, ...style}}>
    {children}
  </svg>
);
