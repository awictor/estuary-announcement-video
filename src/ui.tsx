// Shared pixel-RPG UI kit (text box, chapter title, pills). Shared contract: builders import, do not edit.
// All components take GLOBAL frame numbers for timing and need `segName` to convert from the Sequence-local frame.
import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {C, PIXEL_BODY, PIXEL_TITLE, TIMELINE, text as textById} from './theme';

type SegName = keyof typeof TIMELINE.segments;
export const useGlobalFrame = (segName: SegName) => useCurrentFrame() + TIMELINE.segments[segName].start;

// Safe area for key content on a phone in the LinkedIn feed (real pixels).
export const SAFE = {top: 200, bottom: 1650, left: 56, right: 1024};

// Bottom dialogue box: framed, typewriter text from timeline.json, blinking ▼ once complete.
// Box occupies y 1362..1650 (real px), x 32..1048.
export const BOX = {x: 32, y: 1362, w: 1016, h: 288};
export const TextBox: React.FC<{id: string; segName: SegName; hideAfter?: number; showFrom?: number}> = ({id, segName, hideAfter, showFrom}) => {
  const g = useGlobalFrame(segName);
  const t = textById(id);
  if (!t) return null;
  if (hideAfter !== undefined && g >= hideAfter) return null;
  const from = showFrom ?? t.start;
  if (g < from) return null;
  let n = Math.max(0, Math.floor((g - t.start) * t.cpf));
  const total = t.lines.reduce((a, l) => a + l.length, 0);
  const done = n >= total;
  const shown = t.lines.map(line => {
    const s = line.slice(0, Math.max(0, Math.min(line.length, n)));
    n -= line.length;
    return s;
  });
  const arrowOn = done && Math.floor(g / 8) % 2 === 0;
  return (
    <DialogFrame>
      <div style={{fontFamily: PIXEL_BODY, fontWeight: 400, fontSize: 72, lineHeight: '84px', color: C.boxInk, whiteSpace: 'pre'}}>
        {shown.map((s, i) => <div key={i} style={{height: 84}}>{s}</div>)}
      </div>
      {arrowOn && (
        <svg style={{position: 'absolute', right: 44, bottom: 34}} width="36" height="24" viewBox="0 0 9 6" shapeRendering="crispEdges">
          <path d="M0 0h9v2h-1v1h-1v1h-1v1h-1v1h-1v-1h-1v-1h-1v-1h-1v-1h-1z" fill={C.orange} />
        </svg>
      )}
    </DialogFrame>
  );
};

// The framed box on its own (for menus etc.). Children are laid out inside the padding.
export const DialogFrame: React.FC<{children?: React.ReactNode; x?: number; y?: number; w?: number; h?: number; pad?: number}> = ({children, x = BOX.x, y = BOX.y, w = BOX.w, h = BOX.h, pad = 52}) => (
  <div style={{position: 'absolute', left: x, top: y, width: w, height: h, boxSizing: 'border-box',
    background: C.boxFill, borderRadius: 16,
    border: `12px solid ${C.boxFrame}`, boxShadow: `inset 0 0 0 6px ${C.white}, inset 0 0 0 10px ${C.boxFrameDark}, 0 8px 0 ${C.boxFrameDark}`,
    padding: `${pad - 16}px ${pad}px`, imageRendering: 'pixelated'}}>
    {children}
  </div>
);

// Chapter title for pixel sections, top-left inside the safe area. `at` is a GLOBAL frame.
// Keep-out zone for 3D content: x 56..1024, y 200..560 while visible.
export const CHAPTER_KEEPOUT = {x0: 56, y0: 200, x1: 1024, y1: 560};
export const ChapterTitle: React.FC<{num: string; title: string; at: number; segName: SegName; ink?: string; shadow?: string}> = ({num, title, at, segName, ink = C.ink, shadow = 'rgba(0,0,0,0.18)'}) => {
  const g = useGlobalFrame(segName);
  if (g < at) return null;
  const k = g - at;
  const scale = k < 2 ? 1.3 : k < 4 ? 1.1 : 1; // stepped, pixel-style pop
  return (
    <AbsoluteFill style={{padding: `${SAFE.top}px 72px`, color: ink, pointerEvents: 'none'}}>
      <div style={{transform: `scale(${scale})`, transformOrigin: 'left top'}}>
        <div style={{fontFamily: PIXEL_TITLE, fontSize: 128, lineHeight: '140px', textShadow: `8px 8px 0 ${shadow}`}}>{num}</div>
        <div style={{fontFamily: PIXEL_TITLE, fontSize: 72, lineHeight: '96px', marginTop: 12, textShadow: `6px 6px 0 ${shadow}`}}>{title}</div>
      </div>
    </AbsoluteFill>
  );
};

// Pipeline pill (SOURCE / COLLECTION / DESTINATION). Place it under the chapter title (y ~ 470).
export const Pill: React.FC<{label: string; value: string; dark?: boolean; style?: React.CSSProperties}> = ({label, value, dark = true, style}) => (
  <div style={{display: 'inline-flex', alignItems: 'baseline', gap: 18, padding: '12px 24px', borderRadius: 10,
    background: dark ? C.ink : C.white, color: dark ? C.white : C.ink, boxShadow: `6px 6px 0 rgba(0,0,0,0.25)`, ...style}}>
    <span style={{fontFamily: PIXEL_TITLE, fontSize: 26, opacity: 0.6}}>{label}</span>
    <span style={{fontFamily: PIXEL_BODY, fontWeight: 400, fontSize: 52}}>{value}</span>
  </div>
);
