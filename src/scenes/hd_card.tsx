// OWNER: hd builder. HD "trainer card" end screen: premium dark glass card with a stepped pixel-art border.
// Timing (GLOBAL frames): slide 654-668, levelUp 666, typeBadges 678 (+2), moves 690/692/694/696, url 702-707.
import React from 'react';
import {C, DISPLAY, MONO, PIXEL_TITLE, SANS} from '../theme';
import {EV, clamp01, easeOutBack, easeOutCubic, lerp, pop, ramp, sinceBeat} from './hd_fx';

export const CARD = {x: 64, y: 816, w: 952, h: 772};
const PAD = 56;
const STEP = 8; // pixel step of the card's notched corners (2 logical px of the pixel sections' 4 px grid)

const stepped = (s: number) => {
  const a = `${s}px`, b = `${2 * s}px`, c = `${3 * s}px`;
  const R = (v: string) => `calc(100% - ${v})`;
  return `polygon(${c} 0, ${R(c)} 0, ${R(c)} ${a}, ${R(b)} ${a}, ${R(b)} ${b}, ${R(a)} ${b}, ${R(a)} ${c}, 100% ${c}, 100% ${R(c)}, ${R(a)} ${R(c)}, ${R(a)} ${R(b)}, ${R(b)} ${R(b)}, ${R(b)} ${R(a)}, ${R(c)} ${R(a)}, ${R(c)} 100%, ${c} 100%, ${c} ${R(a)}, ${b} ${R(a)}, ${b} ${R(b)}, ${a} ${R(b)}, ${a} ${R(c)}, 0 ${R(c)}, 0 ${c}, ${a} ${c}, ${a} ${b}, ${b} ${b}, ${b} ${a}, ${c} ${a})`;
};
const steppedPath = (w: number, h: number, s: number, i: number) => {
  // outline of the stepped rectangle, inset by i
  const L = i, T = i, Rr = w - i, B = h - i;
  const p = [
    [L + 3 * s, T], [Rr - 3 * s, T], [Rr - 3 * s, T + s], [Rr - 2 * s, T + s], [Rr - 2 * s, T + 2 * s], [Rr - s, T + 2 * s], [Rr - s, T + 3 * s], [Rr, T + 3 * s],
    [Rr, B - 3 * s], [Rr - s, B - 3 * s], [Rr - s, B - 2 * s], [Rr - 2 * s, B - 2 * s], [Rr - 2 * s, B - s], [Rr - 3 * s, B - s], [Rr - 3 * s, B],
    [L + 3 * s, B], [L + 3 * s, B - s], [L + 2 * s, B - s], [L + 2 * s, B - 2 * s], [L + s, B - 2 * s], [L + s, B - 3 * s], [L, B - 3 * s],
    [L, T + 3 * s], [L + s, T + 3 * s], [L + s, T + 2 * s], [L + 2 * s, T + 2 * s], [L + 2 * s, T + s], [L + 3 * s, T + s],
  ];
  return 'M' + p.map(q => q.join(' ')).join('L') + 'Z';
};

// ---------- pixel-art bits (original designs, crisp 4-5 px grid) ----------
const Pix: React.FC<{rows: string[]; px: number; colors: Record<string, string>; style?: React.CSSProperties}> = ({rows, px, colors, style}) => (
  <svg width={rows[0].length * px} height={rows.length * px} viewBox={`0 0 ${rows[0].length} ${rows.length}`} shapeRendering="crispEdges" style={style}>
    {rows.flatMap((r, y) => r.split('').map((ch, x) => (colors[ch] ? <rect key={`${x}-${y}`} x={x} y={y} width={1.02} height={1.02} fill={colors[ch]} /> : null)))}
  </svg>
);
// The pre-evolution ALEX orb as a pixel sprite (16x16, generated: outline, 3-band shading, highlight).
const ORB_SPRITE = (() => {
  const n = 16, rows: string[] = [];
  for (let y = 0; y < n; y++) {
    let r = '';
    for (let x = 0; x < n; x++) {
      const nx = (x + 0.5 - n / 2) / (n / 2), ny = (y + 0.5 - n / 2) / (n / 2);
      const d = Math.hypot(nx, ny);
      if (d > 1.0) { r += '.'; continue; }
      if (d > 0.84) { r += 'k'; continue; }
      const sh = nx * 0.62 + ny * 0.78;
      const hl = Math.hypot(nx + 0.36, ny + 0.4);
      r += hl < 0.2 ? 'w' : hl < 0.34 ? 'x' : sh > 0.42 ? 'd' : 'o';
    }
    rows.push(r);
  }
  return rows;
})();
const ORB_COL = {k: '#3A1A08', o: C.orange, w: '#FFE9D2', d: '#C9500A', x: '#FFB070'};
// GTM: signal bars (routing signals). FDE: a terminal prompt.
const SIGNAL = ['......ww', '......ww', '......ww', '...ww.ww', '...ww.ww', 'ww.ww.ww', 'ww.ww.ww', 'ww.ww.ww'];
const PROMPT = ['w.......', 'ww......', '.ww.....', '..ww....', '.ww.....', 'ww......', 'w..wwwww', '...wwwww'];
const POINTER = ['w....', 'ww...', 'www..', 'wwww.', 'wwwww', 'wwww.', 'www..', 'ww...', 'w....'];
const sparkle = (size: 0 | 1 | 2) => size === 2
  ? ['....w....', '....w....', '...www...', '..wwwww..', 'wwwwwwwww', '..wwwww..', '...www...', '....w....', '....w....']
  : size === 1
    ? ['.........', '.........', '....w....', '...www...', '..wwwww..', '...www...', '....w....', '.........', '.........']
    : ['.........', '.........', '.........', '....w....', '...www...', '....w....', '.........', '.........', '.........'];

const Sparkle: React.FC<{g: number; at: number; x: number; y: number; px?: number}> = ({g, at, x, y, px = 8}) => {
  const k = g - at;
  if (k < 0 || k > 12) return null;
  const size = ([1, 2, 2, 2, 1, 2, 2, 1, 1, 0, 0, 1, 0][k] ?? 0) as 0 | 1 | 2;
  return <Pix rows={sparkle(size)} px={px} colors={{w: '#FFF6DA'}} style={{position: 'absolute', left: x, top: y, filter: 'drop-shadow(0 0 10px rgba(255,210,63,0.9))'}} />;
};

// ---------- pieces ----------
const Badge: React.FC<{g: number; at: number; label: string; bg: string; hi: string; dark: string; icon: string[]}> = ({g, at, label, bg, hi, dark, icon}) => {
  const on = g >= at;
  const s = on ? pop(g, at, 0.3, 2.6, 1.1) : 1;
  const flash = on ? Math.exp(-(g - at) / 2.5) : 0;
  const clip = `polygon(6px 0, calc(100% - 6px) 0, calc(100% - 6px) 6px, 100% 6px, 100% calc(100% - 6px), calc(100% - 6px) calc(100% - 6px), calc(100% - 6px) 100%, 6px 100%, 6px calc(100% - 6px), 0 calc(100% - 6px), 0 6px, 6px 6px)`;
  if (!on) {
    return <div style={{width: 196, height: 70, boxSizing: 'border-box', border: '2px dashed rgba(220,230,255,0.16)', borderRadius: 6}} />;
  }
  return (
    <div style={{transform: `scale(${s})`, transformOrigin: '50% 60%', filter: `drop-shadow(0 8px 18px ${bg}66)`}}>
      <div style={{position: 'relative', display: 'flex', alignItems: 'center', gap: 16, height: 70, width: 196, boxSizing: 'border-box', padding: '0 22px 4px',
        clipPath: clip, background: `linear-gradient(180deg, ${hi} 0%, ${bg} 55%)`, boxShadow: `inset 0 -6px 0 ${dark}, inset 0 4px 0 rgba(255,255,255,0.25)`}}>
        <Pix rows={icon} px={4} colors={{w: '#FFFFFF'}} style={{filter: `drop-shadow(3px 3px 0 ${dark})`}} />
        <span style={{fontFamily: PIXEL_TITLE, fontSize: 34, lineHeight: '34px', color: '#FFFFFF', textShadow: `4px 4px 0 ${dark}`}}>{label}</span>
        <div style={{position: 'absolute', inset: 0, background: '#FFFFFF', opacity: flash * 0.85}} />
      </div>
    </div>
  );
};

const MOVES: [string, string][] = [['CAPTURE', '#FFD23F'], ['STREAM', C.cyan], ['DELIVER', C.mint], ['PUBLISH', C.orange]];
const Move: React.FC<{g: number; at: number; name: string; color: string}> = ({g, at, name, color}) => {
  if (g < at) {
    return <div style={{flex: 1, height: 64, boxSizing: 'border-box', border: '2px dashed rgba(220,230,255,0.14)', borderRadius: 12}} />;
  }
  const k = g - at;
  const y = lerp(18, 0, easeOutBack(k / 7, 2));
  const o = clamp01((k + 1.5) / 3.5);
  const glow = Math.exp(-k / 4);
  return (
    <div style={{flex: 1, height: 64, boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
      borderRadius: 12, background: `linear-gradient(180deg, rgba(255,255,255,${0.1 + 0.2 * glow}), rgba(255,255,255,0.04))`,
      border: `2px solid rgba(255,255,255,${0.16 + 0.4 * glow})`, transform: `translateY(${y}px)`, opacity: o,
      fontFamily: MONO, fontWeight: 700, fontSize: 36, color: '#FFFFFF', boxShadow: glow > 0.05 ? `0 0 ${30 * glow}px ${color}` : undefined}}>
      <span style={{width: 12, height: 12, background: color, boxShadow: `0 0 10px ${color}`, flex: 'none'}} />
      {name}
    </div>
  );
};

const Divider: React.FC<{mt: number}> = ({mt}) => (
  <div style={{marginTop: mt, height: 4, width: '100%',
    background: 'repeating-linear-gradient(90deg, rgba(220,230,255,0.22) 0 12px, rgba(220,230,255,0) 12px 20px)'}} />
);

const Label: React.FC<{children: React.ReactNode; style?: React.CSSProperties}> = ({children, style}) => (
  <div style={{fontFamily: MONO, fontWeight: 700, fontSize: 36, lineHeight: '40px', letterSpacing: 4, color: '#8EA2D8', ...style}}>{children}</div>
);

export const TrainerCard: React.FC<{g: number}> = ({g}) => {
  const [c0, c1] = EV.cardIn;
  if (g < c0) return null;
  // enters on the 654 beat (already peeking in at the bottom edge), lands 667 with a small (<30 px) overshoot
  const e = easeOutBack(ramp(g, c0 - 1, c1 - 1), 0.45);
  const ty = lerp(1180, 0, e);
  const tilt = lerp(14, 0, easeOutCubic(ramp(g, c0 - 1, c1 - 1)));
  const lvAt = EV.levelUp, badgeAt = EV.typeBadges, movesAt = EV.moves, urlAt = EV.url;
  // level line
  const lvOn = g >= lvAt;
  const lvPop = lvOn ? pop(g, lvAt, 0.55, 3, 0.9) : 0;
  const lvGlow = lvOn ? Math.exp(-(g - lvAt) / 6) : 0;
  const restO = clamp01((g - lvAt - 2) / 5);
  // url typing, 2 chars per frame
  const URL = 'estuary.dev';
  const nUrl = g < urlAt ? 0 : Math.min(URL.length, (g - urlAt + 1) * 2);
  const urlDone = nUrl >= URL.length;
  const urlGlow = urlDone ? Math.exp(-(g - (urlAt + 5)) / 6) : 0;
  const cursorOn = g >= movesAt + 4 && g < EV.endHold[0] && Math.floor(g / 5) % 2 === 0;
  // sheen sweeps across the glass after it lands and at the start of the end hold
  const sheen = (a: number) => ramp(g, a, a + 18);
  const sh = g < 700 ? sheen(c1) : sheen(EV.endHold[0]);
  const bob = sinceBeat(g) < 6 ? -4 : 0;
  return (
    <div style={{position: 'absolute', left: CARD.x, top: CARD.y, width: CARD.w, height: CARD.h, transform: `perspective(1600px) translateY(${ty}px) rotateX(${tilt}deg)`, transformOrigin: '50% 100%'}}>
      {/* soft shadow + coloured under-glow (siblings, so the glass keeps its backdrop) */}
      <div style={{position: 'absolute', left: 30, right: 30, top: 60, bottom: -40, background: 'rgba(0,0,0,0.7)', filter: 'blur(40px)', borderRadius: 40}} />
      <div style={{position: 'absolute', left: -20, right: -20, top: -24, height: 200, filter: 'blur(50px)', opacity: 0.35,
        background: `linear-gradient(90deg, ${C.orange}, rgba(255,122,26,0) 45%, rgba(78,108,242,0) 55%, ${C.blue})`}} />
      <div style={{position: 'absolute', inset: 0, clipPath: stepped(STEP), overflow: 'hidden',
        background: 'linear-gradient(165deg, rgba(40,50,84,0.82) 0%, rgba(18,23,40,0.9) 45%, rgba(12,15,28,0.94) 100%)',
        backdropFilter: 'blur(18px) saturate(140%)', WebkitBackdropFilter: 'blur(18px) saturate(140%)'}}>
        {/* faint pixel grid texture inside the glass */}
        <div style={{position: 'absolute', inset: 0, opacity: 0.06,
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)', backgroundSize: '20px 20px'}} />
        <div style={{position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 700px 380px at 20% 0%, rgba(255,122,26,0.16), rgba(255,122,26,0) 70%)'}} />
        <div style={{position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 700px 420px at 100% 100%, rgba(78,108,242,0.2), rgba(78,108,242,0) 70%)'}} />
        {sh > 0 && sh < 1 && (
          <div style={{position: 'absolute', top: -200, bottom: -200, width: 260, left: lerp(-400, CARD.w + 200, easeOutCubic(sh)), transform: 'rotate(18deg)',
            background: 'linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,0.10) 50%, rgba(255,255,255,0))'}} />
        )}
        {/* content */}
        <div style={{position: 'absolute', left: PAD, right: PAD, top: 46, display: 'flex', flexDirection: 'column'}}>
          <div style={{position: 'relative', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
            <div style={{position: 'relative', display: 'flex', alignItems: 'baseline', fontFamily: MONO, fontWeight: 700, fontSize: 40, whiteSpace: 'pre'}}>
              {lvOn ? (
                <span style={{display: 'inline-block', color: C.orange, transform: `scale(${lvPop})`, transformOrigin: '0% 70%',
                  textShadow: `0 0 ${10 + 30 * lvGlow}px rgba(255,122,26,${0.5 + 0.5 * lvGlow})`}}>Lv. 1</span>
              ) : <span style={{opacity: 0}}>Lv. 1</span>}
              <span style={{color: C.ice, opacity: restO}}>{' · DAY 1 · SEPT 2026'}</span>
              <Sparkle g={g} at={lvAt} x={100} y={-48} />
              <Sparkle g={g} at={lvAt + 5} x={-34} y={20} px={4} />
            </div>
            <Pix rows={ORB_SPRITE} px={4} colors={ORB_COL} style={{transform: `translateY(${bob}px)`, filter: 'drop-shadow(0 0 12px rgba(255,122,26,0.55))'}} />
          </div>
          <div style={{marginTop: 22, fontFamily: DISPLAY, fontSize: 96, lineHeight: '104px', color: C.white, letterSpacing: 1, whiteSpace: 'nowrap'}}>ALEX WICTOR</div>
          <div style={{marginTop: 10, fontFamily: SANS, fontWeight: 500, fontSize: 44, lineHeight: '56px', color: '#E4EBFF'}}>
            GTM Engineer <span style={{color: C.orange}}>&amp;</span><br />Forward Deployed Engineer
          </div>
          <Divider mt={30} />
          <div style={{marginTop: 28, display: 'flex', alignItems: 'center', gap: 22}}>
            <Label style={{width: 120}}>TYPE</Label>
            <Badge g={g} at={badgeAt} label="GTM" bg={C.orange} hi="#FFA158" dark="#A2430A" icon={SIGNAL} />
            <Badge g={g} at={badgeAt + 2} label="FDE" bg={C.blue} hi="#7D93FF" dark="#26399A" icon={PROMPT} />
          </div>
          <Label style={{marginTop: 30}}>MOVES</Label>
          <div style={{marginTop: 12, display: 'flex', gap: 12}}>
            {MOVES.map(([n, col], i) => <Move key={n} g={g} at={movesAt + i * 2} name={n} color={col} />)}
          </div>
          <Divider mt={32} />
          <div style={{marginTop: 26, height: 64, display: 'flex', alignItems: 'center', gap: 20}}>
            <Pix rows={POINTER} px={4} colors={{w: C.orange}} style={{opacity: g >= urlAt ? 1 : 0.25}} />
            <div style={{position: 'relative', fontFamily: MONO, fontWeight: 700, fontSize: 52, lineHeight: '64px', color: C.cyan, whiteSpace: 'pre',
              textShadow: `0 0 ${14 + 30 * urlGlow}px rgba(63,214,240,${0.45 + 0.5 * urlGlow})`}}>
              {URL.slice(0, nUrl)}
              {cursorOn && <span style={{display: 'inline-block', width: 28, height: 50, marginLeft: 4, verticalAlign: '-6px', background: C.cyan}} />}
            </div>
          </div>
        </div>
      </div>
      {/* stepped pixel-art border: orange -> gold -> cyan -> blue */}
      <svg width={CARD.w} height={CARD.h} style={{position: 'absolute', left: 0, top: 0, overflow: 'visible'}} shapeRendering="crispEdges">
        <defs>
          <linearGradient id="hdCardEdge" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={C.orange} />
            <stop offset="0.35" stopColor="#FFD23F" />
            <stop offset="0.7" stopColor={C.cyan} />
            <stop offset="1" stopColor={C.blue} />
          </linearGradient>
        </defs>
        <path d={steppedPath(CARD.w, CARD.h, STEP, 2)} fill="none" stroke="url(#hdCardEdge)" strokeWidth={4} opacity={0.95} />
        <path d={steppedPath(CARD.w, CARD.h, STEP, 10)} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={2} />
      </svg>
    </div>
  );
};
