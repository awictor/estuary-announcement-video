// OWNER: hd builder. Segments: reveal (546-654), card (654-750) — see timeline.json.
// The "evolved" HD look: glossy 3D orange ALEX orb with a ring of glowing spheres, ESTUARY wordmark, role lines,
// then an HD trainer card. Both segments render the same stage as a pure function of the GLOBAL frame, so the
// cut at 654 is seamless. During pixelResolve (546-564) the whole stage (WebGL canvas + DOM text) is mosaicked
// by an SVG filter in stepped block sizes 40/24/16/8/4/2 -> 1.
import React from 'react';
import {AbsoluteFill} from 'remotion';
import {C, DISPLAY, SANS, TIMELINE} from '../theme';
import {useGlobalFrame} from '../ui';
import {Backdrop, Burst, Dust, EV, Grain, MosaicDefs, Rays, blockSize, cardP, clamp01, easeInOutCubic, easeOutCubic, lerp, ramp} from './hd_fx';
import {OrbCanvas, OrbGlow} from './hd_orb';
import {TrainerCard} from './hd_card';

type SegName = keyof typeof TIMELINE.segments;

// ---------- text stack layout (real px) ----------
const STACK_TOP = 786;          // top of the I’VE JOINED line in the reveal
const STACK_TOP_CARD = 606;     // ... after cardIn
const STACK_SCALE_CARD = 0.66;
const WORD_SIZE = 170;          // ESTUARY font size (natural width ~868 px; slam peak 1.12x = ~972 px < 1000 px)
const ROLE_TOP = 1086;

const wordFont: React.CSSProperties = {fontFamily: DISPLAY, fontSize: WORD_SIZE, lineHeight: `${WORD_SIZE + 8}px`, letterSpacing: -2, whiteSpace: 'nowrap'};

const Estuary: React.FC<{g: number}> = ({g}) => {
  const k = g - EV.estuarySlam;
  if (k < 0) return null;
  // Slam: 1.12 -> slight undershoot -> 1.0, anchored at the word's own centre.
  const slam = 1 + 0.12 * Math.exp(-k / 2.2) * Math.cos(k * 0.75);
  const hit = Math.exp(-k / 5);
  const breathe = 0.5 + 0.5 * Math.sin((g - EV.impact) * 0.09);
  const sweep = (a: number) => ramp(g, a, a + 16);
  const sw = g < 640 ? sweep(588) : sweep(EV.endHold[0] + 4);
  return (
    <div style={{position: 'relative', display: 'inline-block', transform: `scale(${slam})`, transformOrigin: '50% 50%'}}>
      <div style={{...wordFont, position: 'absolute', left: 0, top: 0, color: C.blue, filter: `blur(${26 + 20 * hit}px)`, opacity: 0.55 + 0.1 * breathe + 0.35 * hit}}>ESTUARY</div>
      <div style={{...wordFont, position: 'absolute', left: 0, top: 0, color: C.cyan, filter: 'blur(8px)', opacity: 0.18 + 0.4 * hit}}>ESTUARY</div>
      <div style={{...wordFont, position: 'relative',
        backgroundImage: `linear-gradient(180deg, #FFFFFF 0%, #EAF0FF 30%, #A9BEFF 62%, #5FB8F4 84%, ${C.cyan} 100%)`,
        WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', WebkitTextFillColor: 'transparent'}}>ESTUARY</div>
      {sw > 0 && sw < 1 && (
        <div style={{...wordFont, position: 'absolute', left: 0, top: 0,
          backgroundImage: 'linear-gradient(105deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0) 40%, rgba(255,255,255,0.95) 50%, rgba(255,255,255,0) 60%, rgba(255,255,255,0) 100%)',
          backgroundSize: '300% 100%', backgroundPosition: `${lerp(100, 0, easeOutCubic(sw))}% 0`, backgroundRepeat: 'no-repeat',
          WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', WebkitTextFillColor: 'transparent'}}>ESTUARY</div>
      )}
    </div>
  );
};

const IveJoined: React.FC<{g: number}> = ({g}) => {
  const at = EV.ivejoined;
  if (g < at) return null;
  const t = easeOutCubic(ramp(g, at, at + 10));
  return (
    <div style={{fontFamily: DISPLAY, fontSize: 60, lineHeight: '70px', color: C.ice, whiteSpace: 'nowrap',
      letterSpacing: lerp(26, 10, t), opacity: clamp01((g - at + 1) / 6), transform: `translateY(${lerp(22, 0, t)}px)`,
      textShadow: '0 0 24px rgba(78,108,242,0.45)'}}>I’VE JOINED</div>
  );
};

// Slow push-in during the reveal hold so the frame never freezes (stays well under the 1000 px width cap).
const drift = (g: number) => lerp(1, 1.022, easeInOutCubic(ramp(g, EV.pixelResolve[1], EV.cardIn[0])));
const TextStack: React.FC<{g: number}> = ({g}) => {
  const p = cardP(g);
  const top = lerp(STACK_TOP, STACK_TOP_CARD, p);
  const s = lerp(drift(g), STACK_SCALE_CARD, p);
  return (
    <div style={{position: 'absolute', left: 0, width: 1080, top, transform: `scale(${s})`, transformOrigin: '540px 0px',
      display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center'}}>
      <div style={{height: 70, display: 'flex', alignItems: 'center', justifyContent: 'center'}}><IveJoined g={g} /></div>
      <div style={{marginTop: 4, height: WORD_SIZE + 8}}><Estuary g={g} /></div>
    </div>
  );
};

// Role lines slide up out of a mask (570 / 576) and leave upward when the card arrives.
const RoleLine: React.FC<{g: number; at: number; children: React.ReactNode}> = ({g, at, children}) => {
  if (g < at) return <div style={{height: 78}} />;
  const t = easeOutCubic(ramp(g, at - 1, at + 8));
  return (
    <div style={{height: 78, overflow: 'hidden'}}>
      <div style={{transform: `translateY(${lerp(80, 0, t)}px)`, opacity: clamp01((g - at + 2) / 4),
        fontFamily: SANS, fontWeight: 700, fontSize: 60, lineHeight: '78px', color: C.white, whiteSpace: 'nowrap'}}>{children}</div>
    </div>
  );
};
const RoleLines: React.FC<{g: number}> = ({g}) => {
  const out = ramp(g, EV.cardIn[0] - 1, EV.cardIn[0] + 6);
  if (out >= 1) return null;
  const [a, b] = EV.roleLines;
  return (
    <div style={{position: 'absolute', left: 0, width: 1080, top: ROLE_TOP - 70 * easeOutCubic(out), opacity: 1 - out,
      transform: `scale(${drift(g)})`, transformOrigin: `540px ${STACK_TOP - ROLE_TOP}px`,
      display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center'}}>
      <RoleLine g={g} at={a}><span style={{fontWeight: 500, color: C.ice, opacity: 0.72}}>as a </span>GTM Engineer <span style={{color: C.orange}}>&amp;</span></RoleLine>
      <RoleLine g={g} at={b}>Forward Deployed Engineer</RoleLine>
    </div>
  );
};

const Stage: React.FC<{segName: SegName}> = ({segName}) => {
  const g = useGlobalFrame(segName);
  const b = blockSize(g);
  const mosaicId = `hdMosaic${b}`;
  const p = cardP(g);
  // text bands the dust must stay out of
  const keepOut = p < 0.5
    ? [{y0: STACK_TOP - 10, y1: ROLE_TOP + 170}]
    : [{y0: STACK_TOP_CARD - 10, y1: STACK_TOP_CARD + 180}];
  return (
    <AbsoluteFill style={{background: C.black, overflow: 'hidden'}}>
      <MosaicDefs b={b} id={mosaicId} />
      <AbsoluteFill style={{filter: b > 1 ? `url(#${mosaicId})` : undefined}}>
        <Backdrop g={g} />
        <Rays g={g} />
        <Dust g={g} keepOut={keepOut} />
        <OrbGlow g={g} />
        <OrbCanvas g={g} />
        <TextStack g={g} />
        <RoleLines g={g} />
        <TrainerCard g={g} />
        <Burst g={g} />
      </AbsoluteFill>
      {b === 1 && <Grain g={g} />}
    </AbsoluteFill>
  );
};

export const Reveal: React.FC = () => <Stage segName="reveal" />;
export const Card: React.FC = () => <Stage segName="card" />;
