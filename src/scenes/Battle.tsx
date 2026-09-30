// OWNER: battle builder. Segments: battle1, battle2, battle3, evolve (see timeline.json).
// One battle screen, driven entirely by the GLOBAL frame. Pixel art is rendered in software into two
// 270x480 canvases (upscaled 4x, nearest neighbour); HP boxes, menu and dialogue are DOM on the 4 px grid.
import React, {useLayoutEffect, useRef} from 'react';
import {AbsoluteFill} from 'remotion';
import {C, H, PH, PIXEL_BODY, PIXEL_TITLE, PW, TIMELINE, W} from '../theme';
import {BOX, ChapterTitle, DialogFrame, Pill, TextBox, useGlobalFrame} from '../ui';
import {Pix} from './battle_px';
import {EV, drawBack, drawFront, expPct, sinceBeat} from './battle_art';

type SegName = keyof typeof TIMELINE.segments;

// ---------- pixel canvas ----------
const PixelCanvas: React.FC<{g: number; draw: (P: Pix, g: number) => void}> = ({g, draw}) => {
  const ref = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const img = ctx.createImageData(PW, PH);
    draw(new Pix(img.data), g);
    ctx.putImageData(img, 0, 0);
  }, [g, draw]);
  return <canvas ref={ref} width={PW} height={PH} style={{position: 'absolute', left: 0, top: 0, width: W, height: H, imageRendering: 'pixelated'}} />;
};

// ---------- HP boxes ----------
const INK = '#303848';
const snap4 = (v: number) => Math.round(v / 4) * 4;
const stepCorners = 'polygon(8px 0, calc(100% - 8px) 0, calc(100% - 8px) 4px, calc(100% - 4px) 4px, calc(100% - 4px) 8px, 100% 8px, 100% calc(100% - 8px), calc(100% - 4px) calc(100% - 8px), calc(100% - 4px) calc(100% - 4px), calc(100% - 8px) calc(100% - 4px), calc(100% - 8px) 100%, 8px 100%, 8px calc(100% - 4px), 4px calc(100% - 4px), 4px calc(100% - 8px), 0 calc(100% - 8px), 0 8px, 4px 8px, 4px 4px, 8px 4px)';

const Panel: React.FC<{x: number; y: number; w: number; h: number; accent: string; children: React.ReactNode}> = ({x, y, w, h, accent, children}) => (
  <div style={{position: 'absolute', left: x, top: y, width: w, height: h}}>
    <div style={{position: 'absolute', left: 8, top: 8, width: w, height: h, background: 'rgba(48,56,72,0.30)', clipPath: stepCorners}} />
    <div style={{position: 'absolute', inset: 0, background: INK, clipPath: stepCorners}} />
    <div style={{position: 'absolute', left: 8, top: 8, right: 8, bottom: 8, background: '#FBF8EE', clipPath: stepCorners}}>
      <div style={{position: 'absolute', left: 0, top: 0, bottom: 0, width: 16, background: accent}} />
      <div style={{position: 'absolute', left: 16, top: 0, bottom: 0, width: 4, background: 'rgba(48,56,72,0.18)'}} />
    </div>
    <div style={{position: 'absolute', left: 44, top: 16, right: 28, bottom: 16}}>{children}</div>
  </div>
);

const Bar: React.FC<{label: string; pct: number; color: string; hi: string; w: number; h: number; flash?: boolean}> = ({label, pct, color, hi, w, h, flash}) => {
  const fill = snap4((w - 8) * Math.max(0, Math.min(1, pct)));
  return (
    <div style={{display: 'flex', alignItems: 'center', gap: 12}}>
      <span style={{fontFamily: PIXEL_TITLE, fontSize: 32, lineHeight: '32px', color: INK, width: label.length * 32}}>{label}</span>
      <div style={{position: 'relative', width: w, height: h, background: INK}}>
        <div style={{position: 'absolute', left: 4, top: 4, width: w - 8, height: h - 8, background: '#DAD6C8'}} />
        <div style={{position: 'absolute', left: 4, top: 4, width: fill, height: h - 8, background: flash ? '#FFD23F' : color}} />
        {!flash && fill > 0 && <div style={{position: 'absolute', left: 4, top: 4, width: fill, height: 4, background: hi}} />}
      </div>
    </div>
  );
};

// Small pixel gold-orb icon for the captured state (10x10 logical, drawn as 4 px blocks).
const ORB_ICON = [
  '...oooo...', '..obbbbo..', '.obwwbbbo.', 'obwbbbbbbo', 'obbbbbbbdo', 'obbbbbbbdo', 'obbbbbbddo', '.obbbbddo.', '..oddddo..', '...oooo...',
];
const OrbIcon: React.FC<{size?: number}> = ({size = 4}) => {
  const col: Record<string, string> = {o: '#7A5200', b: '#FFD23F', w: '#FFFFFF', d: '#E0A020'};
  return (
    <svg width={10 * size} height={10 * size} viewBox="0 0 10 10" shapeRendering="crispEdges" style={{display: 'block'}}>
      {ORB_ICON.flatMap((row, y) => row.split('').map((ch, x) => (ch === '.' ? null : <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={col[ch]} />)))}
    </svg>
  );
};

const slide = (g: number, a: number, b: number, from: number) => {
  if (g < a) return from;
  if (g >= b) return 0;
  const t = (g - a) / (b - a);
  return snap4(from * Math.pow(1 - t, 3));
};

const EnemyBox: React.FC<{g: number}> = ({g}) => {
  if (g < 72) return null;
  const dx = slide(g, 72, 78, -640);
  const cap = g >= EV.captureClick;
  const capFlash = g >= EV.captureClick && g < EV.captureClick + 2;
  return (
    <div style={{position: 'absolute', left: 0, top: 0, transform: `translateX(${dx}px)`}}>
      <Panel x={56} y={588} w={552} h={188} accent={C.blue}>
        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', height: 60}}>
          <span style={{fontFamily: PIXEL_BODY, fontWeight: 400, fontSize: 64, lineHeight: '64px', color: INK}}>NEW RECORD</span>
          <span style={{fontFamily: PIXEL_TITLE, fontSize: 40, lineHeight: '40px', color: INK}}>Lv.1</span>
        </div>
        <div style={{fontFamily: PIXEL_BODY, fontWeight: 400, fontSize: 46, lineHeight: '48px', color: '#4A5470', marginTop: 4}}>estuary/team/members</div>
        <div style={{marginTop: 12, height: 40, display: 'flex', alignItems: 'center'}}>
          {!cap ? (
            <Bar label="HP" pct={1} color={C.hpGreen} hi="#9AF0A4" w={372} h={28} />
          ) : (
            <div style={{display: 'flex', alignItems: 'center', gap: 16, padding: '0 8px', background: capFlash ? '#FFD23F' : 'transparent'}}>
              <OrbIcon size={4} />
              <span style={{fontFamily: PIXEL_TITLE, fontSize: 40, lineHeight: '40px', color: capFlash ? INK : '#8A5A00'}}>CAPTURED</span>
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
};

const PlayerBox: React.FC<{g: number}> = ({g}) => {
  if (g < 84) return null;
  const dx = slide(g, 84, 90, 520);
  const exp = expPct(g);
  const expFlash = g >= 470 && g < 478 && Math.floor((g - 470) / 2) % 2 === 0; // gold blink when EXP tops out
  return (
    <div style={{position: 'absolute', left: 0, top: 0, transform: `translateX(${dx}px)`}}>
      <Panel x={572} y={1108} w={452} h={212} accent={C.orange}>
        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', height: 64}}>
          <span style={{fontFamily: PIXEL_BODY, fontWeight: 400, fontSize: 72, lineHeight: '72px', color: INK}}>ALEX</span>
          <span style={{fontFamily: PIXEL_TITLE, fontSize: 40, lineHeight: '40px', color: INK}}>Lv.1</span>
        </div>
        <div style={{marginTop: 12}}>
          <Bar label="HP" pct={1} color={C.hpGreen} hi="#9AF0A4" w={276} h={28} />
        </div>
        <div style={{marginTop: 16}}>
          <Bar label="EXP" pct={exp} color={C.expBlue} hi="#A8D8FF" w={244} h={24} flash={expFlash} />
        </div>
      </Panel>
    </div>
  );
};

// ---------- move menu (right part of the dialogue area) ----------
const MOVES = ['CAPTURE', 'STREAM', 'DELIVER', 'PUBLISH'];
const Cursor: React.FC<{color: string}> = ({color}) => (
  <svg width={28} height={40} viewBox="0 0 7 10" shapeRendering="crispEdges" style={{display: 'block'}}>
    <path d="M0 0h2v1h1v1h1v1h1v1h1v2h-1v1h-1v1h-1v1h-1v1h-2z" fill={color} />
  </svg>
);
const MoveMenu: React.FC<{g: number}> = ({g}) => {
  if (g < EV.menuOpen || g >= 130) return null;
  const sel = g >= EV.menuSelectCapture;
  const selOn = sel && [0, 1, 3].includes(g - EV.menuSelectCapture);
  const cursorOn = sel || sinceBeat(g) < 8;
  const open = g - EV.menuOpen;
  const hh = open === 0 ? 144 : 288; // two-step pop open
  return (
    <DialogFrame x={444} y={BOX.y + (288 - hh)} w={604} h={hh} pad={36}>
      {open > 0 && (
        <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', rowGap: 20, columnGap: 8, marginTop: 8}}>
          {MOVES.map((m, i) => {
            const active = i === 0;
            const hl = active && selOn;
            return (
              <div key={m} style={{display: 'flex', alignItems: 'center', gap: 12, height: 88}}>
                <div style={{width: 28}}>{active && cursorOn && <Cursor color={C.orange} />}</div>
                <span style={{fontFamily: PIXEL_BODY, fontWeight: 400, fontSize: 56, lineHeight: '64px', padding: '0 8px',
                  color: hl ? C.white : C.boxInk, background: hl ? C.blue : 'transparent'}}>{m}</span>
              </div>
            );
          })}
        </div>
      )}
    </DialogFrame>
  );
};

// ---------- dialogue schedule (GLOBAL frames from timeline.json) ----------
const SCHEDULE: {id: string; to: number}[] = [
  {id: 'wild', to: 102}, {id: 'what', to: 130}, {id: 'useCap', to: 224}, {id: 'captured', to: 258},
  {id: 'useStream', to: 282}, {id: 'useDeliver', to: 378}, {id: 'usePublish', to: 478}, {id: 'evolving', to: 512},
];
const Dialogue: React.FC<{g: number; seg: SegName}> = ({g, seg}) => {
  if (g >= 512) return null; // evolution flashes (box held to 512 so the line is readable): the stage belongs to ALEX
  const cur = SCHEDULE.find(s => {
    const t = TIMELINE.texts.find(x => x.id === s.id)!;
    return g >= t.start && g < s.to;
  });
  if (!cur) return <DialogFrame />;
  return <TextBox id={cur.id} segName={seg} hideAfter={cur.to} />;
};

// ---------- the scene ----------
const BattleScene: React.FC<{seg: SegName}> = ({seg}) => {
  const g = useGlobalFrame(seg);
  const white = g >= EV.whiteout;
  return (
    <AbsoluteFill style={{background: C.sky, overflow: 'hidden'}}>
      <PixelCanvas g={g} draw={drawBack} />
      <EnemyBox g={g} />
      <PlayerBox g={g} />
      <PixelCanvas g={g} draw={drawFront} />
      {seg === 'battle1' && (
        <>
          <ChapterTitle num="01" title="CAPTURED." at={EV.chapter01} segName={seg} />
          {g >= EV.chapter01 + 2 && (
            <div style={{position: 'absolute', left: 72, top: 480, transform: g < EV.chapter01 + 4 ? 'translateY(-8px)' : undefined}}>
              <Pill label="SOURCE" value="hr/new-hires" />
            </div>
          )}
        </>
      )}
      <Dialogue g={g} seg={seg} />
      <MoveMenu g={g} />
      {white && <AbsoluteFill style={{background: '#FFFFFF'}} />}
    </AbsoluteFill>
  );
};

export const Battle1: React.FC = () => <BattleScene seg="battle1" />;
export const Battle2: React.FC = () => <BattleScene seg="battle2" />;
export const Battle3: React.FC = () => <BattleScene seg="battle3" />;
export const Evolve: React.FC = () => <BattleScene seg="evolve" />;
