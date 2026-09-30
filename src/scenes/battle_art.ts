// OWNER: battle builder. Pixel art + choreography for the battle screen (battle1/2/3, evolve).
// Every function here is a pure function of the GLOBAL frame g (timeline.json). Logical grid 270x480.
import {C, TIMELINE, rand} from '../theme';
import {
  LH, LW, Map2, Pix, bayer, blit, clamp01, drawOrb, easeIn, easeInOut, easeOut, glow, hex, lerp, mixc, pal, star,
} from './battle_px';

export const EV = TIMELINE.events;
const BEAT0 = TIMELINE.beatGridStart, BEAT = TIMELINE.beatFrames;
export const sinceBeat = (g: number) => (((g - BEAT0) % BEAT) + BEAT) % BEAT;

// ---------- layout (logical px; x4 for real px) ----------
export const ENEMY_PLAT = {cx: 196, cy: 216, rx: 58, ry: 13};
export const PLAYER_PLAT = {cx: 74, cy: 310, rx: 66, ry: 16};
export const ALEX_R = 24;
export const ALEX_HOME = {cx: 74, cy: PLAYER_PLAT.cy - ALEX_R + 2};
export const GOLD_R = 14;
export const GOLD_REST = {cx: ENEMY_PLAT.cx, cy: ENEMY_PLAT.cy - GOLD_R + 2};
export const CARD_W = 48, CARD_H = 56;
export const CARD_X = ENEMY_PLAT.cx - CARD_W / 2, CARD_Y = ENEMY_PLAT.cy + 2 - 3 - CARD_H; // feet (3 px) end on the platform
// Evolution target: where the HD reveal puts the evolved orb (hd_fx orbLayout: 540,572 real).
export const EVO_C = {cx: 135, cy: 143};
export const EVO_R = 60; // 2.5x ALEX_R

// ---------- palettes ----------
const ORANGE = pal({ol: '#7A2C04', dk: '#C2440A', md: '#E65E0E', bs: C.orange, lt: '#FF9C4A', l2: '#FFCB94', hi: '#FFFFFF', rim: '#F5823A'});
const GOLD = pal({ol: '#7A5200', dk: '#C68A10', md: '#E6AE24', bs: '#FFD23F', lt: '#FFE47C', l2: '#FFF3C4', hi: '#FFFFFF', rim: '#F2C04C'});
const GOLD_DIM = pal({ol: '#4E3600', dk: '#7E5A0C', md: '#9A741A', bs: '#B48E2C', lt: '#C8A448', l2: '#D8BC74', hi: '#E8D8A8', rim: '#A07C28'});
const tintPal = (p: typeof ORANGE, t: number) => ({
  ol: mixc(p.ol, 0xffffff, t * 0.9), dk: mixc(p.dk, 0xffffff, t), md: mixc(p.md, 0xffffff, t), bs: mixc(p.bs, 0xffffff, t),
  lt: mixc(p.lt, 0xffffff, t), l2: mixc(p.l2, 0xffffff, t), hi: 0xffffff, rim: mixc(p.rim, 0xffffff, t),
});
const WHITE = 0xffffff, INK = hex('#303848'), NAVY = hex('#0A1A38'), NAVY2 = hex('#0E2448');
const GOLD_GLOW = hex('#FFE680'), CYAN = hex(C.cyan);

// ---------- the NEW RECORD sprite (document card) ----------
const buildCard = (): Map2 => {
  const w = CARD_W, h = CARD_H, ear = 9, ex = w - 1 - ear;
  const px = new Int32Array(w * h).fill(-1);
  const inShape = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && !(x - ex > y);
  const PAGE = hex('#FFFAF0'), SHADE = hex('#EADFCB'), BLUE = hex(C.blue), BLUE_DK = hex('#2A3C9C'), BLUE_LT = hex('#7C94FF');
  const FLAP = hex('#C9D4FF'), MINT_DK = hex('#23A57A'), CYAN_DK = hex('#1792B4'), VIOLET = hex('#7A5CE8');
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!inShape(x, y)) continue;
      const edge = !inShape(x - 1, y) || !inShape(x + 1, y) || !inShape(x, y - 1) || !inShape(x, y + 1);
      let c: number;
      if (edge) c = INK;
      else if (x >= ex && y <= ear && x - ex <= y) c = x === ex || y === ear ? INK : FLAP; // folded corner
      else if (y <= 11) c = y === 1 ? BLUE_LT : BLUE;
      else if (y === 12) c = BLUE_DK;
      else if (x >= w - 3 || y >= h - 3) c = SHADE;
      else if (x === 1) c = WHITE;
      else c = PAGE;
      px[y * w + x] = c;
    }
  }
  const put = (x: number, y: number, c: number) => { if (x >= 0 && y >= 0 && x < w && y < h) px[y * w + x] = c; };
  const bar = (x0: number, x1: number, y: number, c: number, th = 2) => { for (let x = x0; x <= x1; x++) for (let k = 0; k < th; k++) put(x, y + k, c); };
  // header label bars
  bar(4, 17, 4, WHITE, 2);
  bar(4, 10, 8, hex('#B4C2FF'), 1);
  // braces { } (2 px strokes), 24 px tall
  const brace = (x0: number, flip: boolean, y0: number) => {
    const rows: [number, number][] = [];
    for (let r = 0; r < 24; r++) {
      let a: number;
      if (r < 2) a = 3; else if (r < 10) a = 2; else if (r === 10) a = 1; else if (r < 13) a = 0; else if (r === 13) a = 1; else if (r < 22) a = 2; else a = 3;
      rows.push([a, a + 1]);
    }
    rows.forEach(([a, b], r) => {
      for (let c = a; c <= b; c++) put(flip ? x0 + 4 - c : x0 + c, y0 + r, BLUE_DK);
    });
    // hooks
    put(flip ? x0 : x0 + 4, y0, BLUE_DK); put(flip ? x0 : x0 + 4, y0 + 23, BLUE_DK);
  };
  brace(4, false, 17);
  brace(39, true, 17);
  // three short code lines: key (blue) + value (colour)
  bar(12, 17, 21, BLUE); bar(20, 31, 21, MINT_DK);
  bar(12, 19, 28, BLUE); bar(22, 28, 28, CYAN_DK);
  bar(12, 15, 35, BLUE); bar(18, 33, 35, VIOLET);
  // footer: divider + little mint "new" tag
  bar(4, 42, 45, SHADE, 1);
  bar(4, 13, 48, hex('#5BE3B5'), 3);
  put(4, 48, INK); put(13, 48, INK); put(4, 50, INK); put(13, 50, INK);
  return {w, h, px};
};
export const CARD = buildCard();

// ---------- timing helpers ----------
const HOPS = [258, 354, 366, 450]; // "use move" hops (on beats)
const hopAt = (g: number) => {
  for (const h of HOPS) if (g >= h && g < h + 10) return g - h;
  return -1;
};
const HOP_Y = [0, -4, -7, -9, -9, -7, -4, 0, 0, 0];
const HOP_SQ: [number, number][] = [[1.1, 0.88], [0.94, 1.08], [0.96, 1.05], [1, 1], [1, 1], [1, 1], [0.97, 1.04], [1.12, 0.88], [1.05, 0.95], [1, 1]];

const beatBob = (g: number, amp: number, phase = 0) => -Math.round(amp * Math.sin((Math.PI * sinceBeat(g + phase)) / BEAT));

export const evoT = (g: number) => easeInOut((g - 474) / 20); // ALEX travel to centre 474..494
export const darkLevel = (g: number) => (g < 474 ? 0 : g < 477 ? 0.25 : g < 480 ? 0.5 : g < 483 ? 0.75 : 1);

// ---------- ALEX ----------
export type AlexState = {cx: number; cy: number; r: number; sx: number; sy: number; tint: number; sil: 'none' | 'plain' | 'evolved'; flash: boolean; hop: number};
export const alexState = (g: number): AlexState => {
  let cx = ALEX_HOME.cx, cy = ALEX_HOME.cy, sx = 1, sy = 1, r = ALEX_R, tint = 0;
  let sil: AlexState['sil'] = 'none', flash = false;
  // slide in from the right with the player platform
  if (g < 66) cx += Math.round(210 * (1 - easeOut((g - 54) / 12)));
  const hop = hopAt(g);
  if (g < 474) {
    cy += beatBob(g, 2);
    if (sinceBeat(g) === 0 && g >= 66) { sx = 1.05; sy = 0.95; }
    // throw: anticipation 144-149, release 150, recoil 151-157
    if (g >= 144 && g < 150) { cx -= 2; sx = 1.07; sy = 0.93; }
    else if (g >= 150 && g < 152) { cx += 3; sx = 0.93; sy = 1.08; }
    else if (g >= 152 && g < 158) { cx -= Math.round(3 * (1 - (g - 152) / 6)); }
    if (hop >= 0) { cy += HOP_Y[hop]; [sx, sy] = HOP_SQ[hop]; }
    // gold orb merges at 470: flash + swell
    if (g >= 470 && g < 472) flash = true;
    if (g >= 470 && g < 474) { const k = [1.12, 1.08, 1.04, 1.02][g - 470]; sx *= k; sy *= k; }
  } else {
    const t = evoT(g);
    cx = lerp(ALEX_HOME.cx, EVO_C.cx, t);
    cy = lerp(ALEX_HOME.cy, EVO_C.cy, t) + (g < 494 ? 0 : Math.round(1.5 * Math.sin((g - 494) * 0.26)));
    r = lerp(ALEX_R, EVO_R, t);
    tint = g < 488 ? 0 : g < 491 ? 0.35 : g < 494 ? 0.62 : g < 497 ? 0.85 : 1;
    if (g >= 497) sil = 'plain';
    if (g >= 498) sil = evolvedOn(g) ? 'evolved' : 'plain';
  }
  return {cx, cy, r, sx, sy, tint, sil, flash, hop};
};

// Flash frames: each shows the EVOLVED silhouette; it falls back to the plain orb halfway to the next flash.
export const FLASHES: number[] = EV.evolveFlashes;
export const evolvedOn = (g: number) => {
  for (let i = FLASHES.length - 1; i >= 0; i--) {
    if (g >= FLASHES[i]) {
      const next = i + 1 < FLASHES.length ? FLASHES[i + 1] : EV.whiteout;
      if (i === FLASHES.length - 1) return true;
      return g < FLASHES[i] + Math.ceil((next - FLASHES[i]) / 2);
    }
  }
  return false;
};
// Flash light 0..1 with index of the latest flash. Photosensitivity-safe (integration fix): the light only BUILDS —
// each flash steps it up and it holds until the next one, plus a small decaying pulse — so no large area swings
// dark -> bright -> dark several times a second (the old full-strength strobe failed a WCAG 2.3.1-style check).
export const flashAmt = (g: number): {a: number; i: number; k: number} => {
  const pulse = [0.12, 0.06, 0.02];
  for (let i = FLASHES.length - 1; i >= 0; i--) {
    const k = g - FLASHES[i];
    if (k >= 0) {
      const held = 0.3 + 0.45 * (i / (FLASHES.length - 1));
      return {a: held + (k < pulse.length ? pulse[k] : 0), i, k};
    }
  }
  return {a: 0, i: -1, k: 99};
};

// ---------- enemy card ----------
export type EnemyState = {x: number; y: number; scale: number; ax: number; ay: number; sil?: number; show: boolean; step: number};
export const enemyState = (g: number): EnemyState => {
  let x = CARD_X, y = CARD_Y;
  if (g >= 162 + 6 || g < 54) return {x, y, scale: 0, ax: 0, ay: 0, show: false, step: 0};
  if (g < 66) x -= Math.round(210 * (1 - easeOut((g - 54) / 12)));
  let sil: number | undefined;
  if (g < 66) sil = hex('#3A4660');
  else if (g === 66 || g === 67 || g === 69) sil = WHITE;
  let scale = 1, ax = CARD_W / 2, ay = CARD_H + 3;
  // idle: pops up 2 px on every beat, eases back down (beat n at 54 + 12n)
  if (g < 162 && g >= 66) { const sb = sinceBeat(g); y += sb < 4 ? -2 : sb < 7 ? -1 : 0; }
  if (g >= 150 && g < 162) {
    // brace for impact: little shiver when the orb is close
    if (g >= 158) x += (g % 2 === 0 ? 1 : -1);
  }
  if (g >= 162) {
    sil = WHITE;
    const t = (g - 162) / 6;
    scale = 1 - easeIn(t);
    ax = GOLD_HOVER.cx - CARD_X;
    ay = GOLD_HOVER.cy - CARD_Y;
  }
  // feet step alternately on each beat
  const step = Math.floor((g - BEAT0) / BEAT) % 2;
  return {x, y, scale, ax, ay, sil, show: true, step};
};

// ---------- gold orb ----------
const GOLD_HIT = {cx: ENEMY_PLAT.cx, cy: CARD_Y + 28};
const GOLD_HOVER = {cx: ENEMY_PLAT.cx, cy: CARD_Y + 13};
// Gentle arc from ALEX's shoulder to the card centre; it clears the enemy HP box (right edge x 152, bottom y 194).
const THROW = {p0: [92, 272], p1: [160, 190], p2: [GOLD_HIT.cx, GOLD_HIT.cy]};
const quad = (a: number, b: number, c: number, u: number) => (1 - u) * (1 - u) * a + 2 * (1 - u) * u * b + u * u * c;
const EXIT = {p0: [GOLD_REST.cx, GOLD_REST.cy - 14], p1: [206, 140], p2: [336, -70]};
const RETURN = {p0: [336, -70], p1: [236, 296], p2: [ALEX_HOME.cx, ALEX_HOME.cy]};

export type GoldState = {show: boolean; cx: number; cy: number; r: number; sx: number; sy: number; phi: number; rot: number; dim: boolean; glow: number; onGround: boolean};
// t may be fractional (used for motion trails)
export const goldState = (t: number): GoldState => {
  const S: GoldState = {show: false, cx: GOLD_REST.cx, cy: GOLD_REST.cy, r: GOLD_R, sx: 1, sy: 1, phi: 0, rot: 0, dim: false, glow: 0, onGround: false};
  if (t < 150) return S;
  if (t < 162) {
    const u = (t - 150) / 12;
    S.show = true;
    S.cx = quad(THROW.p0[0], THROW.p1[0], THROW.p2[0], u);
    S.cy = quad(THROW.p0[1], THROW.p1[1], THROW.p2[1], u);
    S.r = lerp(17, GOLD_R, u);
    S.rot = u * 9;
    return S;
  }
  if (t < 168) {
    S.show = true;
    const u = easeOut((t - 162) / 3);
    S.cx = GOLD_HOVER.cx;
    S.cy = lerp(GOLD_HIT.cy, GOLD_HOVER.cy, u) + (t >= 165 ? Math.round(Math.sin((t - 165) * 2.2)) : 0);
    S.glow = 1;
    if (t < 163) { S.sx = 1.2; S.sy = 0.82; }
    return S;
  }
  if (t < 176) {
    S.show = true;
    S.onGround = true;
    if (t < 173) {
      const u = (t - 168) / 5;
      S.cy = lerp(GOLD_HOVER.cy, GOLD_REST.cy, u * u);
      S.sy = 1.08; S.sx = 0.94;
    } else {
      const k = t - 173;
      S.cy = GOLD_REST.cy - Math.round(5 * Math.sin((Math.PI * k) / 3));
      if (k < 1) { S.sx = 1.22; S.sy = 0.8; }
    }
    return S;
  }
  if (t < 268) {
    S.show = true;
    S.onGround = true;
    if (t < 177) { S.sx = 1.1; S.sy = 0.9; }
    for (const w of EV.wobbles) {
      const k = t - w;
      if (k >= 0 && k < 8) {
        // +-22 deg lean, pivoting on its base: stretched along the tilted vertical axis so the tilt reads
        const th = (22 * Math.PI / 180) * Math.sin((2 * Math.PI * k) / 8);
        S.rot = th;
        S.phi = th;
        S.cx = GOLD_REST.cx + GOLD_R * Math.sin(th) * 0.9;
        S.cy = GOLD_REST.cy - GOLD_R * (1 - Math.cos(th));
        const lean = Math.abs(Math.sin((2 * Math.PI * k) / 8));
        if (k < 1) { S.sx = 1.14; S.sy = 0.84; } else { S.sx = 1 - 0.06 * lean; S.sy = 1 + 0.065 * lean; }
      }
    }
    if (t >= EV.captureClick && t < EV.captureClick + 3) S.dim = true;
    if (t >= EV.captureClick + 3) S.glow = 0.55 + 0.45 * Math.exp(-sinceBeat(Math.floor(t)) / 4);
    if (t >= EV.captureClick && t < EV.captureClick + 1) { S.sx = 1.08; S.sy = 0.92; }
    // anticipation before lift-off
    if (t >= 264) S.cx = GOLD_REST.cx + (Math.floor(t) % 2 === 0 ? 1 : -1);
    return S;
  }
  if (t < 272) {
    S.show = true;
    S.onGround = true;
    const u = easeOut((t - 268) / 4);
    S.cy = lerp(GOLD_REST.cy, EXIT.p0[1], u);
    if (t < 269) { S.sx = 1.14; S.sy = 0.84; } else if (t < 271) { S.sx = 0.9; S.sy = 1.12; }
    S.glow = 1;
    return S;
  }
  if (t < 281) {
    const u = easeIn((t - 272) / 8);
    S.show = true;
    S.cx = quad(EXIT.p0[0], EXIT.p1[0], EXIT.p2[0], u);
    S.cy = quad(EXIT.p0[1], EXIT.p1[1], EXIT.p2[1], u);
    const vx = quad(EXIT.p0[0], EXIT.p1[0], EXIT.p2[0], Math.min(1, u + 0.02)) - S.cx;
    const vy = quad(EXIT.p0[1], EXIT.p1[1], EXIT.p2[1], Math.min(1, u + 0.02)) - S.cy;
    S.phi = Math.atan2(vy, vx);
    const st = clamp01((t - 272) / 3);
    S.sx = 1 + 0.32 * st; S.sy = 1 - 0.14 * st;
    S.glow = 1;
    return S;
  }
  if (t >= 454 && t < 470) {
    const k = (t - 454) / 16;
    const u = 1 - (1 - k) * (1 - k) * (1 - 0.35 * k);
    S.show = true;
    S.cx = quad(RETURN.p0[0], RETURN.p1[0], RETURN.p2[0], u);
    S.cy = quad(RETURN.p0[1], RETURN.p1[1], RETURN.p2[1], u);
    const u2 = Math.min(1, u + 0.02);
    S.phi = Math.atan2(quad(RETURN.p0[1], RETURN.p1[1], RETURN.p2[1], u2) - S.cy, quad(RETURN.p0[0], RETURN.p1[0], RETURN.p2[0], u2) - S.cx);
    const sp = 1 - k;
    S.sx = 1 + 0.3 * sp; S.sy = 1 - 0.13 * sp;
    S.r = t < 465 ? GOLD_R : lerp(GOLD_R, 3, (t - 465) / 5);
    S.glow = 1;
    return S;
  }
  return S;
};
const inFlight = (t: number) => (t >= 150 && t < 162) || (t >= 270 && t < 281) || (t >= 454 && t < 470);

// ---------- EXP (0..1), shown in the player box ----------
const stepFill = (g: number, a: number, b: number, from: number, to: number) => from + (to - from) * clamp01(Math.floor(((g - a) / (b - a)) * 6) / 6);
export const expPct = (g: number) => {
  if (g < EV.captureClick) return 0;
  if (g < 270) return stepFill(g, EV.captureClick, EV.captureClick + 10, 0, 0.25);
  if (g < 354) return stepFill(g, 270, 281, 0.25, 0.5);
  if (g < 450) return stepFill(g, 366, 377, 0.5, 0.75);
  return stepFill(g, 458, 470, 0.75, 1);
};

// =====================================================================================
// Background layer: sky, clouds, hills, meadow, platforms, contact shadows.
// =====================================================================================
const SKY = ['#86C0EA', '#9CCCEE', '#B2D8F2', '#C8E3F2', '#DCEBEE', '#ECF0E2', C.sky].map(hex);
const SKY_Y = [0, 30, 58, 86, 112, 136, 158];
const MEADOW = ['#E8F1CB', '#DFEDBF', '#D6E7B2', '#CCE0A5', '#C2D999'].map(hex);
const MEADOW_Y = [198, 236, 284, 344, 414];
const bandColor = (y: number, x: number, cols: number[], ys: number[]) => {
  let i = 0;
  while (i + 1 < ys.length && y >= ys[i + 1]) i++;
  // 4-row dither ramp into the next band
  if (i + 1 < ys.length) {
    const d = ys[i + 1] - y; // rows until next band
    if (d <= 4) {
      const t = (5 - d) / 5;
      if (bayer(x, y) < t) return cols[i + 1];
    }
  }
  return cols[i];
};

const cloud = (P: Pix, x: number, y: number, s: number) => {
  const lumps: [number, number, number][] = [[0, 0, 7], [10, -4, 9], [21, -1, 7], [30, 2, 5]];
  const x0 = Math.floor(x - 9 * s), x1 = Math.ceil(x + 38 * s), y0 = Math.floor(y - 15 * s), y1 = Math.ceil(y + 7 * s);
  const base = y + 6 * s;
  const SH = hex('#E2EEF8'), SH2 = hex('#CFE2F2');
  for (let yy = y0; yy <= y1; yy++) {
    for (let xx = x0; xx <= x1; xx++) {
      if (yy > base) continue;
      let inside = false;
      for (const [lx, ly, lr] of lumps) {
        const dx = xx + 0.5 - (x + lx * s), dy = yy + 0.5 - (y + ly * s);
        if (dx * dx + dy * dy <= lr * lr * s * s) { inside = true; break; }
      }
      if (!inside && yy > y && xx > x - 3 * s && xx < x + 33 * s) inside = true;
      if (!inside) continue;
      const fromBase = base - yy;
      P.set(xx, yy, fromBase < 1 ? SH2 : fromBase < 3 ? SH : WHITE);
    }
  }
};

const PLAT_TOP = hex(C.platform), PLAT_EDGE = hex(C.platformEdge), PLAT_DARK = hex('#5E9444');
const PLAT_RIM = hex('#B6D78F'), PLAT_IN = hex('#D5E9AF'), PLAT_SHADOW = hex('#A2C47E'), GRASS = hex(C.grass), GRASS_DK = hex(C.grassDark);
const platform = (P: Pix, cx: number, cy: number, rx: number, ry: number, seed: number) => {
  P.ellipse(cx, cy + 4, rx, ry, (x, y) => (y > cy + 4 + ry * 0.35 ? PLAT_DARK : PLAT_EDGE));
  P.ellipse(cx, cy, rx, ry, (x, y, nd) => {
    const v = nd + (bayer(x, y) - 0.5) * 0.12;
    if (v > 0.84) return PLAT_RIM;
    if (v < 0.3) return PLAT_IN;
    return PLAT_TOP;
  });
  // grass blades along the front rim and a few on the back
  for (let k = 0; k < 26; k++) {
    const a = (k / 26) * Math.PI * 2 + rand(k, seed) * 0.2;
    const front = Math.sin(a) > 0;
    const gx = Math.round(cx + Math.cos(a) * (rx - 2)), gy = Math.round(cy + Math.sin(a) * (ry - 1) + (front ? 4 : 0));
    const hgt = 2 + Math.floor(rand(k, seed + 3) * 2);
    const col = front ? GRASS_DK : GRASS;
    for (let j = 0; j < hgt; j++) P.set(gx, gy - j, col);
    P.set(gx - 1, gy - 1, col);
    if (rand(k, seed + 5) > 0.5) P.set(gx + 1, gy - 2, GRASS);
  }
};
const shadow = (P: Pix, cx: number, cy: number, rx: number, ry: number, strength = 1) => {
  if (rx < 1 || strength <= 0) return;
  P.ellipse(cx, cy, rx, ry, (x, y, nd) => (nd < 0.55 || bayer(x, y) < (1 - nd) * 1.6 * strength ? PLAT_SHADOW : null));
};

export const drawBack = (P: Pix, g: number) => {
  // sky + meadow
  const hill = (x: number) => 176 + Math.round(4 * Math.sin(x * 0.035 + 0.7) + 3 * Math.sin(x * 0.09 + 2.1));
  const HILL = hex('#D0E5BE'), HILL_TOP = hex('#B9D7A4'), HEDGE = hex('#BADAA2'), HEDGE_TOP = hex('#A2CB8B');
  for (let y = 0; y < LH; y++) {
    for (let x = 0; x < LW; x++) {
      let c: number;
      if (y < 198) {
        c = bandColor(y, x, SKY, SKY_Y);
        const hy = hill(x);
        if (y >= hy) c = y === hy ? HILL_TOP : HILL;
        const bump = x % 12, bh = Math.round(Math.sqrt(Math.max(0, 1 - ((bump - 5.5) / 6) ** 2)) * 4);
        const hedgeTop = 195 - bh;
        if (y >= hedgeTop) c = y === hedgeTop ? HEDGE_TOP : HEDGE;
      } else {
        c = bandColor(y, x, MEADOW, MEADOW_Y);
      }
      P.set(x, y, c);
    }
  }
  // clouds (slow drift)
  const drift = Math.floor(g * 0.06);
  cloud(P, 196 + drift, 70, 1);
  cloud(P, 24 + Math.floor(drift * 0.6), 34, 0.8);
  cloud(P, 222 + Math.floor(drift * 0.8), 122, 0.55);
  // grass tufts on the meadow
  const TUFT = hex('#B4D08E');
  for (let k = 0; k < 46; k++) {
    const tx = Math.floor(rand(k, 11) * LW), ty = 206 + Math.floor(rand(k, 12) * 270);
    P.set(tx, ty, TUFT); P.set(tx - 1, ty - 1, TUFT); P.set(tx + 1, ty - 1, TUFT); P.set(tx + 1, ty - 2, TUFT);
  }
  // platforms (slide in: enemy from the left, player from the right)
  const eOff = g < 66 ? -Math.round(210 * (1 - easeOut((g - 54) / 12))) : 0;
  const pOff = g < 66 ? Math.round(210 * (1 - easeOut((g - 54) / 12))) : 0;
  platform(P, ENEMY_PLAT.cx + eOff, ENEMY_PLAT.cy, ENEMY_PLAT.rx, ENEMY_PLAT.ry, 1);
  platform(P, PLAYER_PLAT.cx + pOff, PLAYER_PLAT.cy, PLAYER_PLAT.rx, PLAYER_PLAT.ry, 2);
  // contact shadows
  const en = enemyState(g);
  if (en.show) shadow(P, en.x + CARD_W / 2, ENEMY_PLAT.cy + 2, 22 * en.scale, 4 * Math.max(0.3, en.scale));
  const go = goldState(g);
  if (go.show && go.onGround) {
    const h = clamp01((GOLD_REST.cy - go.cy) / 30);
    shadow(P, GOLD_REST.cx + (go.cx - GOLD_REST.cx) * 0.5, ENEMY_PLAT.cy + 2, 11 * (1 - 0.5 * h) * go.sx, 3.2, 1 - 0.6 * h);
  }
  const al = alexState(g);
  if (g < 474) {
    const h = clamp01((ALEX_HOME.cy - al.cy) / 12);
    shadow(P, al.cx, PLAYER_PLAT.cy + 2, (21 - 6 * h) * al.sx, 5 - h);
  }
};

// =====================================================================================
// Front layer (above the HP boxes): evolution darkness + rays, sprites, effects, flashes.
// =====================================================================================
const RAY_A = hex('#1A3A78'), RAY_B = hex('#14305F'), RAY_C = hex('#10284F'), CORE = hex('#24478E');
const evolveBackdrop = (P: Pix, g: number) => {
  const lvl = darkLevel(g);
  if (lvl <= 0) return;
  const rays = clamp01((g - 484) / 12); // rays fade in
  const rot = (g - 474) * 0.011;
  const al = alexState(g);
  const cx = al.cx, cy = al.cy;
  const N = 16;
  const fa = flashAmt(g).a;
  // flash light: every colour steps toward a brighter, saturated blue (never toward grey)
  const cNavy = mixc(NAVY, hex('#244FB0'), fa * 0.85), cNavy2 = mixc(NAVY2, hex('#2E62CC'), fa * 0.9);
  const cA = mixc(RAY_A, hex('#8CB2FF'), fa), cB = mixc(RAY_B, hex('#6A96F0'), fa), cC = mixc(RAY_C, hex('#4A7AE0'), fa);
  const cCore = mixc(CORE, hex('#BCD2FF'), fa);
  for (let y = 0; y < LH; y++) {
    for (let x = 0; x < LW; x++) {
      if (lvl < 1 && bayer(x, y) >= lvl) continue;
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      const d = Math.hypot(dx, dy);
      let c = d < 84 ? cNavy2 : cNavy;
      if (rays > 0) {
        let a = Math.atan2(dy, dx) + rot;
        a = ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        const wedge = Math.floor((a / (Math.PI * 2)) * N);
        if (wedge % 2 === 0 && bayer(x, y) < rays) c = d < 110 ? cA : d < 190 ? cB : cC;
        if (d < 76 && bayer(x, y) < rays * 0.9) c = d < 66 ? cCore : cA;
      }
      P.set(x, y, c);
    }
  }
};

// Evolved silhouette: orb + tilted ring (matches the HD reveal: ring radius 1.7R, tilt x 0.34 / z 0.2 rad).
const RING_TILT = -0.2, RING_FLAT = Math.sin(0.34);
const drawEvolvedSil = (P: Pix, cx: number, cy: number, r: number, col: number, line: number, outline: number | null) => {
  const ca = Math.cos(RING_TILT), sa = Math.sin(RING_TILT);
  const rIn = 1.48 * r, rOut = 1.92 * r;
  const ringLocal = (x: number, y: number) => {
    const ex = x + 0.5 - cx, ey = y + 0.5 - cy;
    const lx = ex * ca + ey * sa, ly = (-ex * sa + ey * ca) / RING_FLAT;
    return {d: Math.hypot(lx, ly), front: ly > 0};
  };
  const inOrb = (x: number, y: number) => Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= r;
  const inRing = (x: number, y: number) => { const q = ringLocal(x, y); return q.d >= rIn && q.d <= rOut; };
  const inAny = (x: number, y: number) => inOrb(x, y) || inRing(x, y);
  const R = Math.ceil(rOut) + 2;
  for (let y = Math.floor(cy - R); y <= cy + R; y++) {
    for (let x = Math.floor(cx - R); x <= cx + R; x++) {
      const o = inOrb(x, y), q = ringLocal(x, y), ri = q.d >= rIn && q.d <= rOut;
      if (!o && !ri) continue;
      let c = col;
      if (outline !== null && (!inAny(x - 1, y) || !inAny(x + 1, y) || !inAny(x, y - 1) || !inAny(x, y + 1))) c = outline;
      // thin separation line where the FRONT arc of the ring crosses the orb, so the ring reads
      else if (o && ri && q.front && (!inRing(x, y - 1) || !inRing(x, y + 1))) c = line;
      P.set(x, y, c);
    }
  }
};

// Flash core: a solid white burst behind ALEX that jumps bigger on every flash and HOLDS (never shrinks back), so the
// light swells toward the white-out instead of strobing (stepped blue halo, no grey). A thin 1-2 frame rim pulse keeps
// each hit punchy while touching only a few percent of the frame.
const HALO1 = hex('#DCE8FF'), HALO2 = hex('#9DBDF8');
const flashCore = (P: Pix, g: number) => {
  const {i, k} = flashAmt(g);
  if (i < 0) return;
  const al = alexState(g);
  const Rc = al.r * (1.3 + 0.25 * i) + (k === 0 ? 3 : k === 1 ? 1 : 0);
  const R2 = Rc + 6 + i;
  const x0 = Math.floor(al.cx - R2), x1 = Math.ceil(al.cx + R2), y0 = Math.floor(al.cy - R2), y1 = Math.ceil(al.cy + R2);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x + 0.5 - al.cx, y + 0.5 - al.cy);
      if (d <= Rc) P.set(x, y, WHITE);
      else if (d <= Rc + 3) P.set(x, y, HALO1);
      else if (d <= R2) P.set(x, y, HALO2);
    }
  }
};

const drawAlex = (P: Pix, g: number) => {
  const a = alexState(g);
  const cx = Math.round(a.cx), cy = Math.round(a.cy);
  if (a.sil !== 'none') {
    const fl = flashAmt(g);
    const peak = fl.k === 0; // flash peak frame: pure white, no outline
    const ol = peak ? null : hex('#7FA6F2');
    if (!peak) glow(P, cx, cy, a.r, a.r + 10, hex('#9CC0FF'), 0.8);
    if (a.sil === 'evolved') drawEvolvedSil(P, cx, cy, a.r, WHITE, peak ? WHITE : hex('#A8C4F4'), ol);
    else drawOrb(P, cx, cy, a.r, ORANGE, ol === null ? {sil: WHITE} : {sil: WHITE, silOl: ol});
    return;
  }
  if (g >= 474) glow(P, cx, cy, a.r, a.r + 10, hex('#FF9C4A'), clamp01((g - 480) / 10));
  if (a.flash) {
    drawOrb(P, cx, cy, a.r, ORANGE, {sx: a.sx, sy: a.sy, sil: WHITE, silOl: hex('#FFD9A0')});
    return;
  }
  drawOrb(P, cx, cy + Math.round((1 - a.sy) * a.r), a.r, a.tint > 0 ? tintPal(ORANGE, a.tint) : ORANGE, {sx: a.sx, sy: a.sy});
  // "use move" flash lines around ALEX
  if (a.hop >= 1 && a.hop <= 7) {
    const t = a.hop - 1;
    for (let k = 0; k < 8; k++) {
      const ang = (k / 8) * Math.PI * 2 + Math.PI / 8;
      const d0 = a.r + 4 + t * 2, d1 = a.r + 8 + t * 3;
      const col = (k + a.hop) % 2 === 0 ? WHITE : hex('#FFD9A0');
      if (t > 4 && k % 2 === 1) continue;
      P.line(cx + Math.cos(ang) * d0, cy + Math.sin(ang) * d0, cx + Math.cos(ang) * d1, cy + Math.sin(ang) * d1, col, t < 3 ? 2 : 1);
    }
  }
};

const drawEnemy = (P: Pix, g: number) => {
  const e = enemyState(g);
  if (!e.show || e.scale <= 0.02) return;
  // feet (only at full scale)
  if (e.scale >= 1) {
    const fy = e.y + CARD_H;
    const col = e.sil ?? INK;
    const lift0 = e.step === 0 ? 1 : 0, lift1 = 1 - lift0;
    P.rect(e.x + 11, fy - lift0, 6, 3, col);
    P.rect(e.x + 31, fy - lift1, 6, 3, col);
  }
  blit(P, CARD, e.x, e.y, {scale: e.scale, ax: e.ax, ay: e.ay, sil: e.sil});
  // entrance shine
  if (g >= 66 && g < 76) {
    const k = g - 66;
    star(P, e.x + CARD_W - 6, e.y + 6, k < 3 ? 3 : k < 6 ? 2 : 1, WHITE, hex('#FFF3C4'));
  }
};

const drawGold = (P: Pix, g: number) => {
  // motion trail (sub-frame samples of the same pure path)
  // comet tail: dense sub-frame samples of the same pure path, tapering, white -> gold -> (cyan for STREAM)
  if (inFlight(g) || (g >= 281 && g < 283) || (g >= 470 && g < 472)) {
    const N = 18, span = 3.2;
    const tailCol = g >= 268 && g < 290 ? CYAN : hex('#FFB020');
    for (let k = N; k >= 1; k--) {
      const t = g - (k / N) * span;
      if (!inFlight(t)) continue;
      const s = goldState(t);
      if (!s.show) continue;
      const q = k / N;
      const rr = Math.max(0.8, s.r * (0.85 - 0.7 * q));
      const col = q < 0.28 ? WHITE : q < 0.62 ? GOLD_GLOW : tailCol;
      const dens = q < 0.62 ? 1 : 1.35 - q;
      P.ellipse(s.cx, s.cy, rr, rr, (x, y) => (bayer(x, y) < dens ? col : null));
    }
  }
  const s = goldState(g);
  if (!s.show) return;
  const cx = Math.round(s.cx), cy = Math.round(s.cy);
  if (s.glow > 0) glow(P, cx, cy, s.r + 1, s.r + 8, GOLD_GLOW, s.glow);
  drawOrb(P, cx, cy + (s.onGround ? Math.round((1 - s.sy) * s.r) : 0), s.r, s.dim ? GOLD_DIM : GOLD, {sx: s.sx, sy: s.sy, phi: s.phi, rot: s.rot});
  // spinning glint during the throw
  if (g >= 150 && g < 162) {
    const a = (g - 150) * 1.3;
    star(P, cx + Math.cos(a) * (s.r + 3), cy + Math.sin(a) * (s.r + 3), 2, WHITE, WHITE);
  }
  // absorb rays 162..170
  if (g >= 162 && g < 171) {
    const k = g - 162;
    const len = k < 4 ? 10 + k * 7 : 38 - (k - 4) * 6;
    for (let i = 0; i < 12; i++) {
      const ang = (i / 12) * Math.PI * 2 + k * 0.05;
      const d0 = s.r + 3 + (k > 5 ? (k - 5) * 5 : 0), d1 = s.r + 3 + len;
      if (d1 <= d0) continue;
      const col = i % 2 === 0 ? WHITE : GOLD_GLOW;
      P.line(cx + Math.cos(ang) * d0, cy + Math.sin(ang) * d0, cx + Math.cos(ang) * d1, cy + Math.sin(ang) * d1, col, i % 2 === 0 && k < 5 ? 2 : 1);
    }
  }
  // wobble motion marks (both sides, strongest at the extremes of each lean)
  for (const w of EV.wobbles) {
    const k = g - w;
    if (k >= 1 && k < 8 && k !== 4) {
      const n = k === 2 || k === 6 ? 2 : 1;
      for (const side of [-1, 1]) {
        for (let j = 0; j < n; j++) {
          const xx = cx + side * (s.r + 5 + j * 3);
          P.line(xx, cy - 4 + j, xx, cy + 3 - j, INK);
        }
      }
    }
  }
};

// capture click: ring + star burst, then gentle twinkles while the chapter title holds
const drawClick = (P: Pix, g: number) => {
  const c0 = EV.captureClick;
  const cx = GOLD_REST.cx, cy = GOLD_REST.cy;
  if (g >= c0 && g < c0 + 8) {
    const k = g - c0;
    const rr = GOLD_R + 3 + k * 4;
    const dens = 1 - k / 8;
    for (let a = 0; a < 96; a++) {
      const ang = (a / 96) * Math.PI * 2;
      const x = Math.round(cx + Math.cos(ang) * rr), y = Math.round(cy + Math.sin(ang) * rr);
      if (bayer(x, y) < dens) P.set(x, y, WHITE);
    }
  }
  if (g >= c0 && g < c0 + 20) {
    const k = g - c0;
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2 + Math.PI / 8;
      const d = GOLD_R + 4 + 30 * easeOut(k / 16) + (i % 2) * 6;
      const size = k < 6 ? 3 : k < 12 ? 2 : 1;
      if (k > 14 && (k + i) % 2 === 0) continue;
      star(P, cx + Math.cos(ang) * d, cy + Math.sin(ang) * d, size, (i + k) % 3 === 0 ? GOLD_GLOW : WHITE, WHITE);
    }
  }
  if (g >= c0 + 16 && g < 268) {
    const spots: [number, number][] = [[-22, -14], [20, -20], [26, 6], [-26, 8]];
    spots.forEach(([dx, dy], i) => {
      const ph = (sinceBeat(g + i * 3)) ;
      if (ph < 6) star(P, cx + dx, cy + dy, ph < 2 ? 2 : 1, i % 2 ? GOLD_GLOW : WHITE, WHITE);
    });
  }
};

// Evolution: rising motes + flash light
const drawEvolveFx = (P: Pix, g: number) => {
  if (g < 486) return;
  const a = alexState(g);
  for (let k = 0; k < 44; k++) {
    const sp = 1.2 + rand(k, 21) * 1.8;
    const x = Math.round(a.cx + (rand(k, 22) - 0.5) * 250);
    const y = Math.round(LH + 20 - ((g - 486) * sp * 2 + rand(k, 23) * 520) % 520);
    const on = (g + k) % 5 !== 0;
    if (!on) continue;
    const col = k % 3 === 0 ? CYAN : k % 3 === 1 ? WHITE : hex('#9CC0FF');
    P.set(x, y, col);
    if (k % 4 === 0) P.set(x, y + 1, col);
  }
};

export const drawFront = (P: Pix, g: number) => {
  evolveBackdrop(P, g);
  flashCore(P, g);
  drawEvolveFx(P, g);
  drawEnemy(P, g);
  drawClick(P, g);
  const s = goldState(g);
  const goldOverAlex = g >= 454 && g < 470 && s.cx < ALEX_HOME.cx + ALEX_R + 4;
  if (!goldOverAlex) drawGold(P, g);
  drawAlex(P, g);
  if (goldOverAlex) drawGold(P, g);
};
