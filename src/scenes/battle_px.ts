// OWNER: battle builder. Tiny software pixel renderer for the battle screen.
// Everything is drawn into a 270x480 RGBA buffer (1 logical px = 4 real px) and shown on a <canvas>
// upscaled 4x with image-rendering: pixelated, so every shape, dither and sprite sits on the same grid.
import {PH, PW} from '../theme';

export const LW = PW, LH = PH; // 270 x 480

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
// Ordered-dither threshold in (0,1) for a logical pixel.
export const bayer = (x: number, y: number) => (BAYER[((y & 3) << 2) | (x & 3)] + 0.5) / 16;
export const hex = (s: string) => parseInt(s.replace('#', ''), 16);
export const mixc = (a: number, b: number, t: number) => {
  const u = Math.min(1, Math.max(0, t));
  const r = ((a >> 16) & 255) + ((((b >> 16) & 255) - ((a >> 16) & 255)) * u);
  const g = ((a >> 8) & 255) + ((((b >> 8) & 255) - ((a >> 8) & 255)) * u);
  const bl = (a & 255) + (((b & 255) - (a & 255)) * u);
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
};
export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const easeOut = (t: number) => 1 - Math.pow(1 - clamp01(t), 3);
export const easeIn = (t: number) => Math.pow(clamp01(t), 2);
export const easeInOut = (t: number) => {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};

export class Pix {
  d: Uint8ClampedArray;
  w: number;
  h: number;
  constructor(d: Uint8ClampedArray, w = LW, h = LH) {
    this.d = d;
    this.w = w;
    this.h = h;
  }
  set(x: number, y: number, c: number) {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    this.d[i] = (c >> 16) & 255;
    this.d[i + 1] = (c >> 8) & 255;
    this.d[i + 2] = c & 255;
    this.d[i + 3] = 255;
  }
  // Porter-Duff "over" with coverage a (0..1).
  blend(x: number, y: number, c: number, a: number) {
    if (a <= 0) return;
    if (a >= 1) return this.set(x, y, c);
    x = Math.floor(x);
    y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    const da = this.d[i + 3] / 255;
    const oa = a + da * (1 - a);
    if (oa <= 0) return;
    const k = (da * (1 - a)) / oa, s = a / oa;
    this.d[i] = ((c >> 16) & 255) * s + this.d[i] * k;
    this.d[i + 1] = ((c >> 8) & 255) * s + this.d[i + 1] * k;
    this.d[i + 2] = (c & 255) * s + this.d[i + 2] * k;
    this.d[i + 3] = oa * 255;
  }
  rect(x: number, y: number, w: number, h: number, c: number) {
    const x0 = Math.max(0, Math.floor(x)), y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(this.w, Math.floor(x + w)), y1 = Math.min(this.h, Math.floor(y + h));
    for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) this.set(xx, yy, c);
  }
  fill(c: number) {
    this.rect(0, 0, this.w, this.h, c);
  }
  line(x0: number, y0: number, x1: number, y1: number, c: number, th = 1) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (let n = 0; n < 2000; n++) {
      if (th <= 1) this.set(x0, y0, c);
      else this.rect(x0 - (th >> 1), y0 - (th >> 1), th, th, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  // Filled ellipse. fn gets (x, y, nd) where nd = normalised distance^2 from the centre (0..1).
  ellipse(cx: number, cy: number, rx: number, ry: number, fn: (x: number, y: number, nd: number) => number | null) {
    const x0 = Math.floor(cx - rx - 1), x1 = Math.ceil(cx + rx + 1);
    const y0 = Math.floor(cy - ry - 1), y1 = Math.ceil(cy + ry + 1);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const ex = (x + 0.5 - cx) / rx, ey = (y + 0.5 - cy) / ry;
        const nd = ex * ex + ey * ey;
        if (nd > 1) continue;
        const c = fn(x, y, nd);
        if (c !== null) this.set(x, y, c);
      }
    }
  }
}

// ---------- shaded pixel orb ----------
export type OrbPal = {ol: number; dk: number; md: number; bs: number; lt: number; l2: number; hi: number; rim: number};
export const pal = (o: Record<keyof OrbPal, string>): OrbPal => ({
  ol: hex(o.ol), dk: hex(o.dk), md: hex(o.md), bs: hex(o.bs), lt: hex(o.lt), l2: hex(o.l2), hi: hex(o.hi), rim: hex(o.rim),
});
export type OrbOpts = {
  sx?: number; sy?: number; // squash / stretch along the local axes
  phi?: number; // angle of the local x axis (for stretching along a motion direction)
  rot?: number; // body rotation (moves the highlight: tilt / spin read)
  sil?: number; // solid silhouette colour
  silOl?: number; // silhouette outline colour
};
const LX = -0.48, LY = -0.58, LZ = 0.66;
export function drawOrb(P: Pix, cx: number, cy: number, r: number, p: OrbPal, o: OrbOpts = {}) {
  if (r < 0.6) return;
  const sx = o.sx ?? 1, sy = o.sy ?? 1, phi = o.phi ?? 0, rot = o.rot ?? 0;
  const cp = Math.cos(phi), sp = Math.sin(phi), cr = Math.cos(rot), sr = Math.sin(rot);
  const loc = (x: number, y: number): [number, number] => {
    const ex = x + 0.5 - cx, ey = y + 0.5 - cy;
    return [(ex * cp + ey * sp) / (r * sx), (-ex * sp + ey * cp) / (r * sy)];
  };
  const inside = (x: number, y: number) => {
    const [a, b] = loc(x, y);
    return a * a + b * b <= 1;
  };
  const R = Math.ceil(r * Math.max(sx, sy)) + 2;
  const x0 = Math.floor(cx - R), x1 = Math.ceil(cx + R), y0 = Math.floor(cy - R), y1 = Math.ceil(cy + R);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (!inside(x, y)) continue;
      const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
      if (o.sil !== undefined) {
        P.set(x, y, edge && o.silOl !== undefined ? o.silOl : o.sil);
        continue;
      }
      if (edge) { P.set(x, y, p.ol); continue; }
      // screen-space normal (undo the local frame so light stays top-left), then body rotation
      const [a, b] = loc(x, y);
      const nx = a * cp - b * sp, ny = a * sp + b * cp;
      const ux = nx * cr + ny * sr, uy = -nx * sr + ny * cr;
      const d2 = Math.min(1, ux * ux + uy * uy);
      const nz = Math.sqrt(1 - d2);
      const lam = ux * LX + uy * LY + nz * LZ;
      const v = lam + (bayer(x, y) - 0.5) * 0.16;
      const hx = ux + 0.36, hy = uy + 0.42, hd = hx * hx + hy * hy;
      const hs = r < 14 ? 1.9 : 1; // keep a readable highlight on small orbs
      let c: number;
      if (hd < 0.02 * hs) c = p.hi;
      else if (hd < 0.055 * hs) c = p.l2;
      else if (v > 0.8) c = p.lt;
      else if (v > 0.45) c = p.bs;
      else if (v > 0.1) c = p.md;
      else c = p.dk;
      if ((c === p.dk || c === p.md) && ux * 0.55 + uy * 0.83 > 0.8 && d2 > 0.72) c = p.rim;
      P.set(x, y, c);
    }
  }
}

// Stepped glow ring around a centre (distance r0..r1): three solid bands of decreasing coverage.
export function glow(P: Pix, cx: number, cy: number, r0: number, r1: number, c: number, strength: number, alpha = 0.85) {
  if (strength <= 0) return;
  const x0 = Math.floor(cx - r1), x1 = Math.ceil(cx + r1), y0 = Math.floor(cy - r1), y1 = Math.ceil(cy + r1);
  const bw = (r1 - r0) / 3;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (d < r0 || d > r1) continue;
      const band = Math.min(2, Math.floor((d - r0) / bw));
      const a = [0.62, 0.36, 0.16][band] * strength * alpha;
      P.blend(x, y, c, a);
    }
  }
}

// 4-point pixel star. size 1..3
export function star(P: Pix, x: number, y: number, size: number, c: number, core: number) {
  x = Math.round(x); y = Math.round(y);
  if (size <= 0) return;
  if (size === 1) {
    P.set(x, y, core);
    P.set(x - 1, y, c); P.set(x + 1, y, c); P.set(x, y - 1, c); P.set(x, y + 1, c);
    return;
  }
  const arm = size === 2 ? 2 : 4;
  for (let k = 1; k <= arm; k++) {
    P.set(x - k, y, c); P.set(x + k, y, c); P.set(x, y - k, c); P.set(x, y + k, c);
  }
  if (size >= 3) {
    P.set(x - 1, y - 1, c); P.set(x + 1, y - 1, c); P.set(x - 1, y + 1, c); P.set(x + 1, y + 1, c);
    P.set(x - 1, y, core); P.set(x + 1, y, core); P.set(x, y - 1, core); P.set(x, y + 1, core);
  }
  P.set(x, y, core);
}

// Blit a colour map (-1 = transparent) with nearest-neighbour scaling about an anchor.
export type Map2 = {w: number; h: number; px: Int32Array};
export function blit(P: Pix, m: Map2, x0: number, y0: number, o: {scale?: number; ax?: number; ay?: number; sil?: number; alpha?: number} = {}) {
  const s = o.scale ?? 1;
  if (s <= 0.02) return;
  const ax = o.ax ?? m.w / 2, ay = o.ay ?? m.h;
  // destination rect
  const dx0 = Math.round(x0 + ax - ax * s), dy0 = Math.round(y0 + ay - ay * s);
  const dw = Math.max(1, Math.round(m.w * s)), dh = Math.max(1, Math.round(m.h * s));
  for (let y = 0; y < dh; y++) {
    const sy = Math.min(m.h - 1, Math.floor((y + 0.5) / s));
    for (let x = 0; x < dw; x++) {
      const sx = Math.min(m.w - 1, Math.floor((x + 0.5) / s));
      const c = m.px[sy * m.w + sx];
      if (c < 0) continue;
      const cc = o.sil !== undefined ? o.sil : c;
      if (o.alpha !== undefined && o.alpha < 1) P.blend(dx0 + x, dy0 + y, cc, o.alpha);
      else P.set(dx0 + x, dy0 + y, cc);
    }
  }
}
