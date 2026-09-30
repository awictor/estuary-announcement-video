#!/usr/bin/env python3
"""soundtrack.py - soundtrack for the "evolution" announcement video.

An ORIGINAL GBA-era-style chiptune battle score (band-limited pulse 12.5/25/50 %, triangle bass, lowpassed
noise drums) at 150 BPM that "evolves" at frame 546 into a modern, lush re-orchestration of the same motif,
plus every SFX, all synced to src/timeline.json (GLOBAL frames, 30 fps, beat n = 54 + 12n).

numpy only, deterministic (seeded generators, no clock).  Writes soundtrack.wav (48 kHz / 16-bit / stereo / 25.000 s)
and then prints a measurement report (loudness, true peak, low-end share, mono loss, onset sync).

    python3 audio/soundtrack.py            # render + analyse
    python3 audio/soundtrack.py --no-analyze
"""
import json, math, os, re, subprocess, sys, wave
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
TL = json.load(open(os.path.join(HERE, '..', 'src', 'timeline.json')))
OUT = os.path.join(HERE, 'soundtrack.wav')
try:
    import imageio_ffmpeg
    FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
except ImportError:
    FFMPEG = 'ffmpeg'

SR = 48000
FPS = TL['fps']
TOTAL = TL['total']
SPF = SR // FPS                      # 1600 samples per video frame
N = TOTAL * SPF                      # exactly 25.000 s
G0 = TL['beatGridStart']             # 54
BF = TL['beatFrames']                # 12 frames per beat (150 BPM)
ST = BF / 4.0                        # 3 frames per 16th
EV = TL['events']
SEG = TL['segments']
assert SR % FPS == 0 and N == 1_200_000

TARGET_LUFS = -14.0
TP_CEIL_DB = -1.35                   # limiter ceiling (true peak, 4x oversampled); spec is <= -1.0 dBTP


def f16(k):   # GLOBAL frame of 16th-note step k (k = 0 at frame 54)
    return G0 + ST * k


def fbeat(n):
    return G0 + BF * n


# --------------------------------------------------------------------------------------------- pitch helpers
_PC = {'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3, 'E': 4, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7,
       'G#': 8, 'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11}


def midi(p):
    if isinstance(p, (int, float, np.integer, np.floating)):
        return float(p)
    m = re.fullmatch(r'([A-G][#b]?)(-?\d)', p)
    return 12 * (int(m.group(2)) + 1) + _PC[m.group(1)]


def hz(p):
    return 440.0 * 2 ** ((midi(p) - 69) / 12)


CHORD_PC = {'Am': 'A C E', 'F': 'F A C', 'G': 'G B D', 'E': 'E G# B', 'Dm': 'D F A', 'C': 'C E G',
            'A': 'A C# E', 'F#m': 'F# A C#', 'D': 'D F# A'}
CHORD_PC = {k: [_PC[x] for x in v.split()] for k, v in CHORD_PC.items()}
BASS_ROOT = {'Am': 'A2', 'F': 'F2', 'G': 'G2', 'E': 'E2', 'Dm': 'D3', 'C': 'C3', 'A': 'A2', 'F#m': 'F#2', 'D': 'D2'}

# Harmony plan (GLOBAL frame, chord).  Every segment cut from 150 on is a chord change on a downbeat:
# 150 E->Am, 258 G->F, 282 G->Am, 354 E->Dm, 378 E->Am, 450 E->F (deceptive, drop), 546 E->A (Picardy "evolution"),
# 654 D->E; the card walks I-IV-V and resolves on the tonic A at 714.
CHORDS = [(54, 'Am'), (102, 'F'), (126, 'G'), (138, 'E'), (150, 'Am'), (186, 'E'), (222, 'C'), (246, 'G'),
          (258, 'F'), (270, 'G'), (282, 'Am'), (306, 'F'), (330, 'G'), (342, 'E'), (354, 'Dm'), (366, 'E'),
          (378, 'Am'), (402, 'F'), (414, 'G'), (426, 'Am'), (438, 'E'), (450, 'F'), (474, 'Dm'), (486, 'E'),
          (546, 'A'), (606, 'F#m'), (630, 'D'), (654, 'E'), (666, 'A'), (690, 'D'), (702, 'E'), (714, 'A')]


def chord_at(fr):
    c = CHORDS[0][1]
    for s, name in CHORDS:
        if s <= fr + 1e-9:
            c = name
    return c


def arp_tones(ch, lo=57, n=4):
    pcs = CHORD_PC[ch]
    out = [m for m in range(lo, lo + 24) if m % 12 in pcs]
    return out[:n]


# --------------------------------------------------------------------------------------------- dsp helpers
_seed = [7000]


def rng():
    _seed[0] += 1
    return np.random.default_rng(_seed[0])


def white(n):
    return rng().standard_normal(n)


def chipnoise(n, clock=24000.0):
    """LFSR-flavoured noise: random +-1 held at `clock` Hz (the timbre knob of a handheld noise channel)."""
    m = int(n * clock / SR) + 2
    v = rng().choice([-1.0, 1.0], m)
    return v[(np.arange(n) * clock / SR).astype(int)]


def _np2(n):
    return 1 << int(math.ceil(math.log2(max(2, n))))


def band(x, lo=None, hi=None, olo=2, ohi=8, pad=8192):
    """Zero-phase Butterworth-magnitude band-limit via FFT (works on 1-D or (2, n))."""
    x = np.asarray(x, float)
    n = x.shape[-1]
    nf = _np2(n + pad)
    X = np.fft.rfft(x, nf)
    f = np.fft.rfftfreq(nf, 1 / SR)
    H = np.ones_like(f)
    if lo:
        H *= 1 / np.sqrt(1 + (lo / np.maximum(f, 1e-3)) ** (2 * olo))
    if hi:
        H *= 1 / np.sqrt(1 + (f / hi) ** (2 * ohi))
    return np.fft.irfft(X * H, nf)[..., :n]


def svf_bp(x, fc, q=1.4):
    """Time-varying TPT state-variable band-pass (per-sample cutoff). Used for whooshes and risers."""
    fc = np.broadcast_to(np.asarray(fc, float), x.shape)
    g = np.tan(np.pi * np.clip(fc, 30, SR * 0.42) / SR)
    k = 1.0 / q
    a1 = 1 / (1 + g * (g + k))
    a2 = g * a1
    a3 = g * a2
    xs, A1, A2, A3 = x.tolist(), a1.tolist(), a2.tolist(), a3.tolist()
    out = [0.0] * len(xs)
    ic1 = ic2 = 0.0
    for i in range(len(xs)):
        v3 = xs[i] - ic2
        v1 = A1[i] * ic1 + A2[i] * v3
        v2 = ic2 + A2[i] * ic1 + A3[i] * v3
        ic1 = 2 * v1 - ic1
        ic2 = 2 * v2 - ic2
        out[i] = v1
    return np.array(out) * k       # unity-ish peak gain at fc


def tt(dur):
    return np.arange(max(8, int(round(dur * SR)))) / SR


def adsr(n, a=0.002, d=0.15, s=0.6, r=0.012):
    t = np.arange(n) / SR
    e = (s + (1 - s) * np.exp(-t / d)) if d > 0 else np.ones(n)
    if a > 0:
        e = e * np.clip(t / a, 0, 1)
    nr = min(n, max(1, int(r * SR)))
    e[n - nr:] *= np.linspace(1, 0, nr)
    return e


def osc(kind, f, duty=0.5, cutoff=9000.0, ph0=0.0):
    """Band-limited additive oscillator. kind: pulse (duty), tri, saw, sine. `f` is per-sample Hz."""
    f = np.asarray(f, float)
    ph = 2 * np.pi * (np.cumsum(f) / SR + ph0)
    if kind == 'sine':
        return np.sin(ph)
    const = float(f.max() - f.min()) < 1e-6
    fmin = max(20.0, float(f.min()))
    K = int(min(160, 2.2 * cutoff / fmin))
    out = np.zeros(len(f))
    for k in range(1, K + 1):
        if kind == 'tri':
            if k % 2 == 0:
                continue
            c = 8 / np.pi ** 2 * (-1) ** ((k - 1) // 2) / k ** 2
        elif kind == 'saw':
            c = 2 / np.pi * (-1) ** (k + 1) / k
        else:
            c = 2 / (np.pi * k) * np.sin(np.pi * k * duty)
        if abs(c) < 1e-9:
            continue
        w = 1 / (1 + (k * (f[0] if const else f) / cutoff) ** 6)
        if const and w < 1e-4:
            break
        if kind == 'pulse':
            out += c * w * np.cos(k * ph - np.pi * k * duty)
        else:
            out += c * w * np.sin(k * ph)
    if kind == 'pulse':
        out *= 0.7 / np.sqrt(duty * (1 - duty))     # every duty at the same RMS
    return out


def note(p, dur, kind='pulse', duty=0.25, a=0.002, d=0.15, s=0.6, r=0.012, vib=0.0, vdel=0.12, vrate=5.6,
         cutoff=9000.0, ph0=0.0, bend=0.0, bend_t=0.02, freq=None):
    n = max(8, int(round(dur * SR)))
    t = np.arange(n) / SR
    f = np.full(n, freq if freq is not None else hz(p))
    if vib:
        f = f * 2 ** (vib / 1200 * np.sin(2 * np.pi * vrate * t) * np.clip((t - vdel) / 0.12, 0, 1))
    if bend:
        f = f * 2 ** (bend / 12 * np.exp(-t / bend_t))
    return osc(kind, f, duty, cutoff, ph0) * adsr(n, a, d, s, r)


def glide(f0, f1, dur, curve='exp'):
    t = tt(dur)
    u = t / t[-1]
    return f0 * (f1 / f0) ** u if curve == 'exp' else f0 + (f1 - f0) * u


def bell(p, dur=1.2, bright=1.0, freq=None):
    """Soft additive bell / chime (harmonic + one slightly stretched partial)."""
    f = freq if freq is not None else hz(p)
    t = tt(dur)
    x = (np.sin(2 * np.pi * f * t) * np.exp(-t / (0.55 * dur))
         + 0.45 * bright * np.sin(2 * np.pi * 2 * f * t) * np.exp(-t / (0.22 * dur))
         + 0.22 * bright * np.sin(2 * np.pi * 3.01 * f * t) * np.exp(-t / (0.12 * dur))
         + 0.12 * bright * np.sin(2 * np.pi * 4.23 * f * t) * np.exp(-t / (0.07 * dur)))
    return x * np.clip(t / 0.0015, 0, 1)


def click(dur=0.004, lo=2500, hi=8000):
    t = tt(0.012)
    return band(chipnoise(len(t), 40000) * np.exp(-t / dur) * np.clip(t / 0.0003, 0, 1), lo, hi)


# --------------------------------------------------------------------------------------------- buses
BUS_NAMES = ['lead', 'chip', 'bass', 'drums', 'sfx', 'blip', 'hdpad', 'hdbass', 'hdlead', 'hdmisc', 'hdrums', 'impact']
B = {k: np.zeros((2, N)) for k in BUS_NAMES}
SEND = {'room': np.zeros((2, N)), 'hall': np.zeros((2, N))}
LOG = []   # (frame, label) of every placed visible/audible event, for the report


def panlr(p):
    th = (np.asarray(p, float) + 1) * np.pi / 4
    return np.cos(th) * np.sqrt(2), np.sin(th) * np.sqrt(2)


def add(bus, sig, frame, pan=0.0, gain=1.0, send=None, amt=0.0, label=None):
    sig = np.asarray(sig, float) * gain
    if sig.ndim == 1:
        gl, gr = panlr(pan)
        st = np.stack([sig * gl, sig * gr])
    else:
        st = sig.copy()
    n = st.shape[1]
    nf = min(n, int(0.005 * SR))                   # 5 ms safety fade at every sound's tail
    st[:, n - nf:] *= np.linspace(1, 0, nf)
    i0 = int(round(frame * SPF))
    a0, a1 = max(0, i0), min(N, i0 + n)
    if a1 <= a0:
        return
    B[bus][:, a0:a1] += st[:, a0 - i0:a1 - i0]
    if send:
        SEND[send][:, a0:a1] += st[:, a0 - i0:a1 - i0] * amt
    if label:
        LOG.append((frame, label))


def mix_into(dst, a, off):
    a = np.asarray(a, float)
    i0 = int(round(off * SR))
    n = min(len(a), len(dst) - i0)
    if n > 0:
        dst[i0:i0 + n] += a[:n]


# ============================================================================================ CHIPTUNE KIT
def c_kick(g=1.0):
    t = tt(0.17)
    f = 70 + 190 * np.exp(-t / 0.018)
    body = np.tanh(2.0 * np.sin(2 * np.pi * np.cumsum(f) / SR)) * np.exp(-t / 0.045)
    return (body + 0.35 * band(chipnoise(len(t), 30000), 1500, 8000) * np.exp(-t / 0.004)) * g


def c_snare(g=1.0, dec=0.05):
    t = tt(0.18)
    nz = band(chipnoise(len(t), 21000), 250, 8200) * np.exp(-t / dec)
    tone = osc('tri', 175 + 70 * np.exp(-t / 0.012)) * np.exp(-t / 0.028)
    return (0.9 * nz + 0.55 * tone) * np.clip(t / 0.0008, 0, 1) * g


def c_hat(open_=False, g=1.0):
    t = tt(0.22 if open_ else 0.05)
    nz = band(chipnoise(len(t), 44000), 5200, 8500, ohi=6)
    return nz * np.exp(-t / (0.075 if open_ else 0.013)) * np.clip(t / 0.0005, 0, 1) * g


def c_tom(p, g=1.0):
    t = tt(0.2)
    f0 = hz(p)
    x = np.tanh(1.5 * osc('tri', f0 * (0.62 + 0.38 * np.exp(-t / 0.04)))) * np.exp(-t / 0.085)
    return (x + 0.2 * band(chipnoise(len(t), 26000), 1200, 7000) * np.exp(-t / 0.006)) * g


def c_crash(dur=1.4, g=1.0):
    t = tt(dur)
    e = np.exp(-t / (0.32 * dur)) * np.clip(t / 0.002, 0, 1)
    return np.stack([band(chipnoise(len(t), 38000), 2800, 8500, ohi=6) * e,
                     band(chipnoise(len(t), 37000), 2800, 8500, ohi=6) * e]) * g


def lead_note(p, s, d, gain=0.2, duty=0.25, gate=0.92, vib=16, pan=0.0, bus='lead', send='room', amt=0.10, **kw):
    dur = d * ST / FPS * gate
    add(bus, note(p, dur, 'pulse', duty, a=0.003, d=0.28, s=0.72, r=0.02, vib=vib, **kw), f16(s), pan, gain, send, amt)


# Main motif (original): A4 E5 | D5-E5 A5 | G5 . . E5 | D5 E5  -- 5th leap, turn, octave leap, stepwise fall.
# Answer phrase climbs F5 E5 F5 A5 C6 | B5 A5 | G#5 B5 (leading tone back into the tonic).
LEAD_BATTLE = [
    # intro, Am (54-102)
    (0, 2, 'A4'), (2, 2, 'E5'), (4, 1, 'D5'), (5, 1, 'E5'), (6, 2, 'A5'), (8, 3, 'G5'), (11, 1, 'E5'), (12, 2, 'D5'), (14, 2, 'E5'),
    # intro answer, F (102) G (126) E (138)
    (16, 2, 'F5'), (18, 1, 'E5'), (19, 1, 'F5'), (20, 2, 'A5'), (22, 2, 'C6'), (24, 3, 'B5'), (27, 1, 'A5'), (28, 2, 'G#5'), (30, 2, 'B5'),
    # section A, Am (150-186): motif variant, hangs on B5 into the wobbles
    (32, 2, 'A5'), (34, 2, 'E5'), (36, 1, 'G5'), (37, 1, 'A5'), (38, 2, 'C6'), (40, 4, 'B5'),
    # (186-222 wobbles: lead rests)
    # capture fanfare, C (222) G (246)
    (56, 1, 'G5'), (57, 1, 'C6'), (58, 2, 'E6'), (60, 3, 'G6'), (63, 1, 'E6'), (64, 2, 'D6'), (66, 1, 'B5'), (67, 1, 'D6'),
    # battle2, F (258) G (270)
    (68, 2, 'C6'), (70, 1, 'A5'), (71, 1, 'C6'), (72, 2, 'D6'), (74, 2, 'B5'),
    # river: motif returns, Am (282) F (306) G (330) E (342)
    (76, 2, 'A4'), (78, 2, 'E5'), (80, 1, 'D5'), (81, 1, 'E5'), (82, 2, 'A5'),
    (84, 3, 'C6'), (87, 1, 'A5'), (88, 2, 'F5'), (90, 2, 'A5'),
    (92, 2, 'B5'), (94, 1, 'A5'), (95, 1, 'B5'), (96, 2, 'G#5'), (98, 2, 'E5'),
    # battle3, Dm (354) E (366)
    (100, 2, 'F5'), (102, 1, 'E5'), (103, 1, 'F5'), (104, 2, 'G#5'), (106, 2, 'B5'),
    # check: motif an octave up, Am (378) F (402) G (414) Am (426 pop) E (438)
    (108, 2, 'A5'), (110, 2, 'E6'), (112, 1, 'D6'), (113, 1, 'E6'), (114, 2, 'A6'),
    (116, 3, 'F6'), (119, 1, 'E6'), (120, 2, 'D6'), (122, 2, 'B5'), (124, 2, 'C6'), (126, 2, 'E6'),
    (128, 2, 'G#5'), (130, 2, 'B5'),
]
FANFARE_HARM = [(56, 1, 'E5'), (57, 1, 'G5'), (58, 2, 'C6'), (60, 3, 'E6'), (63, 1, 'C6'), (64, 2, 'B5'), (66, 1, 'G5'), (67, 1, 'B5')]
RIVER_COUNTER = [(76, 6, 'C5'), (82, 2, 'B4'), (84, 6, 'A4'), (90, 2, 'C5'), (92, 4, 'D5'), (96, 4, 'B4')]


def build_title():
    # 0-40: title fanfare. The motif's head in A MAJOR (foreshadows the evolved ending), punchy and short.
    seq = [(0, 6, 'A4'), (6, 6, 'E5'), (12, 3, 'D5'), (15, 3, 'E5'), (18, 6, 'A5'), (24, 14, 'C#6')]
    for fr, d, p in seq:
        add('lead', note(p, d / FPS * (0.95 if d < 10 else 1.0), 'pulse', 0.25, a=0.003, d=0.3 if d < 10 else 0.35,
                         s=0.7 if d < 10 else 0.35, r=0.03, vib=22 if d > 10 else 0, vdel=0.1), fr, 0, 0.2, 'room', 0.12)
    for fr, d, p in [(0, 12, 'C#5'), (12, 6, 'B4'), (18, 6, 'C#5'), (24, 14, 'E5')]:
        add('chip', note(p, d / FPS * 0.95, 'pulse', 0.125, a=0.002, d=0.2, s=0.5, r=0.03), fr, -0.3, 0.075, 'room', 0.1)
    add('chip', note('A4', 14 / FPS, 'pulse', 0.5, a=0.002, d=0.25, s=0.4, r=0.04), 24, 0.3, 0.06, 'room', 0.1)
    for fr, d, p in [(0, 11, 'A2'), (12, 5, 'E2'), (18, 5, 'A2'), (24, 14, 'A2')]:
        add('bass', note(p, d / FPS, 'tri', a=0.002, d=0.3, s=0.7, r=0.03, cutoff=4000), fr, 0, 0.17)
        add('bass', band(note(p, d / FPS, 'pulse', 0.5, a=0.002, d=0.15, s=0.5, r=0.03), 180, 2200), fr, 0, 0.09)
    add('drums', c_kick(), 0, 0, 0.5)
    add('drums', c_snare(0.5), 18, 0.1, 0.25)
    add('drums', c_snare(0.7), 21, 0.1, 0.3)
    add('drums', c_kick(), 24, 0, 0.5)
    add('drums', c_crash(1.2), 24, 0, 0.09)
    LOG.append((0, 'title fanfare start'))


def build_battle():
    # ---- lead
    for s, d, p in LEAD_BATTLE:
        vol = 0.2
        if 56 <= s < 68:
            vol = 0.19
        if s >= 108:
            vol = 0.19
        lead_note(p, s, d, gain=vol)
        if s >= 108:   # check: lead doubled an octave below on a 50 % pulse (new layer)
            lead_note(midi(p) - 12, s, d, gain=0.085, duty=0.5, vib=10, pan=-0.2, bus='chip', amt=0.08)
    for s, d, p in FANFARE_HARM:
        lead_note(p, s, d, gain=0.085, duty=0.125, vib=0, pan=0.3, bus='chip')
    for s, d, p in RIVER_COUNTER:   # river layer: slow counter-line
        lead_note(p, s, d, gain=0.075, duty=0.5, vib=14, pan=0.32, bus='chip', gate=0.97, amt=0.14)

    # ---- per beat: bass, arps, drums
    for b in range(33):                      # beats 0..32 = frames 54..438 (+12)
        fr = fbeat(b)
        ch = chord_at(fr + 0.1)
        root = midi(BASS_ROOT[ch])
        tones = arp_tones(ch)
        sec = ('intro' if fr < 150 else 'A1' if fr < 186 else 'wob' if fr < 222 else 'fan' if fr < 258 else
               'b2' if fr < 282 else 'river' if fr < 354 else 'b3' if fr < 378 else 'check')
        nxt_cut = fr + 12 in (150, 258, 282, 354, 378, 450)
        s0 = 4 * b
        rel = (b - {'intro': 0, 'A1': 8, 'wob': 11, 'fan': 14, 'b2': 17, 'river': 19, 'b3': 25, 'check': 27}[sec]) % 2

        def BN(pos, d, m, g=0.3):
            dur = d * ST / FPS * 0.82
            g = g * 0.68
            add('bass', note(m, dur, 'tri', a=0.002, d=0.22, s=0.75, r=0.015, cutoff=4000), f16(s0 + pos), 0, g)
            add('bass', band(note(m, dur, 'pulse', 0.5, a=0.002, d=0.08, s=0.45, r=0.015), 180, 2200), f16(s0 + pos), 0, g * 0.42)

        # bass
        if sec == 'wob':
            BN(0, 2, root, 0.36)
            BN(2, 1, root + 12, 0.22)
        elif sec in ('river',):
            for pos, m in zip(range(4), (root, root, root + 12, root)):
                BN(pos, 1, m, 0.27)
        elif sec == 'check':
            for pos, m in zip(range(4), (root, root + 12, root, root + 12)):
                BN(pos, 1, m, 0.27)
        elif sec == 'A1':
            BN(0, 2, root)
            BN(2, 1, root + 12)
            BN(3, 1, root, 0.24)
        else:
            BN(0, 2, root)
            BN(2, 2, root + 12)

        # P2 arps (12.5 % pulse)
        def AR(pos, m, g=0.065, pan=-0.35, kind='pulse', duty=0.125):
            add('chip', note(m, ST / FPS * 0.85, kind, duty, a=0.001, d=0.05, s=0.35, r=0.01, cutoff=8000),
                f16(s0 + pos), pan, g * (1.5 if sec == 'intro' else 1.8), 'room', 0.08)

        if sec == 'intro':
            AR(2, tones[1], 0.06)
            AR(2, tones[2], 0.06, 0.35)
        elif sec in ('A1', 'b2', 'b3'):
            seq = tones if b % 2 == 0 else tones[::-1]
            for pos in range(4):
                AR(pos, seq[pos])
        elif sec == 'river':
            seq = [m + (12 if b % 2 else 0) for m in (tones if b % 2 == 0 else tones[::-1])]
            for pos in range(4):
                AR(pos, seq[pos], 0.062)
        elif sec == 'check':
            seq = tones if b % 2 == 0 else tones[::-1]
            for pos in range(4):
                AR(pos, seq[pos], 0.062)
                AR(pos, seq[pos] + 24, 0.05, 0.4, 'tri')      # wave-channel sparkle, 2 octaves up (new layer)
        elif sec == 'fan':
            pass
        elif sec == 'wob':
            # tension tremolo: fast 2-frame alternation E4/B4 swelling across the wobbles
            for k in range(6):
                sw = 0.085 + 0.04 * ((b - 11) * 6 + k) / 17
                add('chip', note('B4' if k % 2 else 'E4', 1.9 / FPS, 'pulse', 0.125, a=0.001, d=0.05, s=0.5, r=0.006),
                    fr + 2 * k, 0.25, sw, 'room', 0.1)
                add('chip', note('E4' if k % 2 else 'B3', 1.9 / FPS, 'pulse', 0.25, a=0.001, d=0.05, s=0.5, r=0.006),
                    fr + 2 * k, -0.25, sw * 0.7, 'room', 0.1)

        # drums
        K = lambda pos, g=0.5: add('drums', c_kick(), f16(s0 + pos), 0, g * 0.85)
        Sn = lambda pos, g=0.3, dec=0.05: add('drums', c_snare(1.0, dec), f16(s0 + pos), 0.08, g, 'room', 0.12)
        H = lambda pos, g=0.1, o=False, pan=0.25: add('drums', c_hat(o), f16(s0 + pos), pan, g)
        if sec == 'wob':
            K(0, 0.36)                              # heartbeat under each wobble
            H(2, 0.07, pan=-0.2)                    # tick-tock
        elif nxt_cut:
            # short fill into the cut: 16th snares + chip toms, crescendo
            K(0, 0.45)
            big = fr + 12 in (282, 378, 450)
            if big:
                for pos, (p, g) in enumerate([('A3', 0.3), ('E3', 0.33), ('C3', 0.36), ('A2', 0.4)]):
                    add('drums', c_tom(p), f16(s0 + pos), -0.3 + 0.2 * pos, g)
                    Sn(pos, 0.12 + 0.05 * pos)
            else:
                for pos in range(4):
                    Sn(pos, 0.14 + 0.05 * pos)
        else:
            if sec == 'intro':
                if rel == 0:
                    K(0)
                else:
                    Sn(0)
                    K(3, 0.33)
                H(2, 0.09)
            elif sec in ('A1', 'fan', 'b2', 'b3'):
                if rel == 0:
                    K(0)
                    if sec != 'fan':
                        K(3, 0.3)
                else:
                    Sn(0)
                H(0, 0.05)
                H(2, 0.1)
            elif sec == 'river':
                if rel == 0:
                    K(0)
                    K(3, 0.32)
                else:
                    Sn(0)
                    Sn(3, 0.08, 0.03)          # ghost
                for pos in range(4):
                    H(pos, 0.1 if pos == 2 else 0.055, pan=0.25 if pos % 2 else -0.15)
            elif sec == 'check':
                if rel == 0:
                    K(0)
                    K(3, 0.34)
                else:
                    Sn(0)
                    K(3, 0.3)
                for pos in (0, 1, 3):
                    H(pos, 0.055, pan=0.2 if pos % 2 else -0.2)
                H(2, 0.075, True, pan=0.3)     # open hat on the off-beat (new layer)
    # downbeat accents / crashes on the big cuts
    for fr, g in ((54, 0.1), (150, 0.08), (282, 0.1), (378, 0.11)):
        add('drums', c_crash(1.3), fr, 0, g)
    # capture moment: the downbeat at 222 gets a small crash
    add('drums', c_crash(1.0), 222, 0, 0.06)
    # battle downbeat stab at 54
    for p in ('A4', 'C5', 'E5'):
        add('chip', note(p, 0.3, 'pulse', 0.5, a=0.002, d=0.08, s=0.2, r=0.03), 54, 0, 0.05, 'room', 0.1)
    LOG.append((54, 'battle theme downbeat'))


def build_evolve():
    # 450: drop into tension. Chip "tremolo chord" (2-frame arpeggio) over a bass pedal; F -> Dm -> E.
    add('drums', c_tom('F2', 1.0), 450, 0, 0.42)
    add('drums', c_crash(1.6), 450, 0, 0.05)
    for fr0, fr1, ch, bassn in ((450, 474, 'F', 'F2'), (474, 486, 'Dm', 'D3'), (486, 543, 'E', 'E2')):
        dur = (fr1 - fr0) / FPS
        add('bass', note(bassn, dur, 'tri', a=0.01, d=0.0, s=1.0, r=0.03, cutoff=3000), fr0, 0, 0.1)
        add('bass', band(note(bassn, dur, 'pulse', 0.5, a=0.01, d=0.0, s=1.0, r=0.03), 180, 1500), fr0, 0, 0.075)
        tones = [m + 12 for m in arp_tones(ch, 52, 4)]
        k = 0
        fr = fr0
        while fr < fr1 - 0.5:
            u = (fr - 450) / (543 - 450)
            add('chip', note(tones[k % 4], 1.9 / FPS, 'pulse', 0.125, a=0.001, d=0.08, s=0.6, r=0.006),
                fr, 0.3 * (-1) ** k, 0.06 + 0.06 * u, 'room', 0.12)
            fr += 2
            k += 1
    # rising arpeggio that accelerates with the evolve flashes (3 notes per flash interval)
    ladder = [midi(x) for x in ('E4', 'G#4', 'B4', 'D5', 'E5', 'G#5', 'B5', 'D6', 'E6', 'G#6', 'B6', 'D7')]
    pre = [(474, 'A3'), (480, 'D4'), (486, 'B3'), (492, 'D4')]
    for fr, p in pre:
        add('lead', note(p, 5.5 / FPS, 'pulse', 0.5, a=0.002, d=0.12, s=0.5, r=0.02), fr, 0, 0.11, 'room', 0.15)
    fl = EV['evolveFlashes'] + [EV['whiteout']]
    for gi in range(len(fl) - 1):
        a, b = fl[gi], fl[gi + 1]
        for j in range(3):
            fr = a + (b - a) * j / 3
            dur = min((b - a) / 3 / FPS * 0.95, 0.12)
            add('lead', note(ladder[gi + j], dur, 'pulse', 0.25, a=0.001, d=0.1, s=0.6, r=0.006),
                fr, 0.2 * (-1) ** j, 0.1 + 0.012 * gi, 'room', 0.15)
    # one hit per flash: E-major stab climbing through inversions + noise flash + low thump
    inv = [('E4', 'G#4', 'B4'), ('G#4', 'B4', 'E5'), ('B4', 'E5', 'G#5'), ('E5', 'G#5', 'B5'),
           ('G#5', 'B5', 'E6'), ('B5', 'E6', 'G#6'), ('E6', 'G#6', 'B6'), ('G#6', 'B6', 'E7')]
    for i, fr in enumerate(EV['evolveFlashes']):
        nxt = fl[i + 1]
        dur = min((nxt - fr) / FPS * 0.98, 0.3)
        g = 0.55 + 0.06 * i
        for p in inv[i]:
            add('sfx', note(p, dur, 'pulse', 0.5, a=0.001, d=0.06, s=0.25, r=0.01, cutoff=8000), fr, 0, 0.05 * g, 'room', 0.2)
        t = tt(0.09)
        add('sfx', band(chipnoise(len(t), 40000), 2000, 8500) * np.exp(-t / 0.02), fr, 0, 0.16 * g)
        t = tt(0.12)
        add('sfx', np.tanh(2 * np.sin(2 * np.pi * np.cumsum(90 + 150 * np.exp(-t / 0.015)) / SR)) * np.exp(-t / 0.045),
            fr, 0, 0.22 * g, label=f'evolve flash {i + 1}')
    # riser 498 -> 543: band-passed noise sweeping 450 Hz -> 7 kHz + pulse glide E4 -> E6, then a 20 ms fade at 543
    a, b = EV['evolveFlashes'][0], EV['whiteout']
    t = tt((b - a) / FPS + 0.02)
    u = np.clip(t / ((b - a) / FPS), 0, 1)
    fc = 450 * (7000 / 450) ** (u ** 1.3)
    nz = band(svf_bp(chipnoise(len(t), 44000), fc, 2.2), None, 8500)
    env = u ** 2.2
    tail = np.clip(((b - a) / FPS + 0.02 - t) / 0.02, 0, 1)
    fg = hz('E4') * 4 ** (u ** 1.5)
    tone = osc('pulse', fg * 2 ** (np.sin(2 * np.pi * (6 + 10 * u) * t) * 0.4 * u / 12), 0.25, 8000)
    add('chip', (0.3 * nz + 0.06 * tone) * env * tail, a, 0, 0.75, 'room', 0.1)
    LOG.append((450, 'evolve drop (F)'))
    LOG.append((543, 'riser peak -> near-silence'))


# ============================================================================================ SFX (pixel part)
def build_sfx_pixel():
    # 40: select confirm (two-step rising blip)
    def confirm(p1, p2, fr, g=0.16, lab=None):
        a = note(p1, 0.045, 'pulse', 0.5, a=0.0008, d=0.03, s=0.45, r=0.006, cutoff=7000)
        b = note(p2, 0.11, 'pulse', 0.5, a=0.0008, d=0.05, s=0.3, r=0.02, cutoff=7000)
        x = np.zeros(len(a) + len(b))
        x[:len(a)] += a
        x[len(a):] += b
        x[:len(click())] += 0.5 * click(0.002)
        add('sfx', x, fr, 0, g, 'room', 0.1, label=lab)
    confirm('E6', 'A6', EV['pressStart'], lab='pressStart confirm')
    # 44-54: battle transition: 1-frame arpeggio A3 -> A6 + rising noise, lands on 54
    t0, t1 = EV['battleTransition']
    ladder = ['A3', 'C4', 'E4', 'A4', 'C5', 'E5', 'A5', 'C6', 'E6', 'A6']
    for i, p in enumerate(ladder):
        add('sfx', note(p, 1.0 / FPS, 'pulse', 0.5 if i % 2 else 0.25, a=0.0008, d=0.05, s=0.6, r=0.004, cutoff=8000),
            t0 + i * (t1 - t0) / len(ladder), 0.5 * (-1) ** i, 0.075 + 0.004 * i, 'room', 0.1)
    t = tt((t1 - t0) / FPS)
    u = t / t[-1]
    add('sfx', band(svf_bp(chipnoise(len(t), 44000), 600 * 11 ** u, 1.6), None, 8500) * u ** 1.5, t0, 0, 0.35)
    LOG.append((t0, 'battle transition sweep'))
    # 66: enemy appears: rising glitch chirp + 3-note data blip
    t = tt(0.07)
    x = osc('pulse', glide(600, 1800, 0.07), 0.125, 8000) * np.exp(-t / 0.04)
    for k, p in enumerate(('E5', 'A5', 'E6')):
        mix_into(x, note(p, 0.03, 'pulse', 0.25, a=0.0008, d=0.02, s=0.3, r=0.004) * 0.8, 0.07 + 0.03 * k)
    add('sfx', x, EV['enemyAppear'], 0.35, 0.11, 'room', 0.12, label='enemyAppear chirp')
    # 102: menu cursor blip ; 126: select confirm
    add('sfx', note('A6', 0.035, 'pulse', 0.5, a=0.0008, d=0.012, s=0.0, r=0.004, cutoff=7000), EV['menuOpen'], 0, 0.16,
        'room', 0.08, label='menuOpen cursor')
    confirm('D6', 'G6', EV['menuSelectCapture'], lab='menuSelect confirm')
    # 150-162: throw whoosh, left -> right (Alex -> enemy)
    a, b = EV['throw']
    d = (b - a) / FPS
    t = tt(d + 0.05)
    u = np.clip(t / d, 0, 1)
    env = np.clip(t / 0.008, 0, 1) * np.sin(np.pi * np.clip(u * 0.85 + 0.05, 0, 1)) ** 1.5 * np.clip((d + 0.05 - t) / 0.05, 0, 1)
    nz = band(svf_bp(white(len(t)), 700 * 4.5 ** u, 1.1), 300, 8500)
    tone = osc('tri', glide(320, 1150, len(t) / SR))
    add('sfx', (0.9 * nz + 0.18 * tone) * env, a, -0.5 + 1.0 * u, 0.3, 'room', 0.1, label='throw whoosh')
    # 162: absorb zap (descending wobble zap + noise crack)
    t = tt(0.24)
    fz = glide(1800, 160, 0.24) * 2 ** (np.sin(2 * np.pi * 28 * t) * 1.6 / 12)
    x = osc('pulse', fz, 0.25, 8000) * np.exp(-t / 0.11) + 1.3 * band(chipnoise(len(t), 40000), 1000, 8500) * np.exp(-t / 0.02)
    x += 0.5 * np.sin(2 * np.pi * hz('E6') * t) * np.exp(-t / 0.03)
    add('sfx', x, EV['absorb'], 0.4, 0.17, 'room', 0.15, label='absorb zap')
    # 168-176: soft falling whistle, 176: bounce
    a, b = EV['orbFall']
    t = tt((b - a) / FPS)
    add('sfx', osc('tri', glide(1400, 520, len(t) / SR)) * np.clip(t / 0.01, 0, 1) * (0.4 + 0.6 * t / t[-1]), a, 0.4, 0.05)
    t = tt(0.12)
    x = np.tanh(1.4 * osc('tri', glide(760, 250, 0.12))) * np.exp(-t / 0.05)
    mix_into(x, 0.5 * click(0.003, 1500, 7000), 0)
    add('sfx', x, b, 0.4, 0.42, 'room', 0.1, label='orb bounce')
    # 186/198/210: wobble = click + knock + small rattle
    for k, fr in enumerate(EV['wobbles']):
        t = tt(0.16)
        x = 0.45 * np.tanh(1.5 * np.sin(2 * np.pi * (300 + 30 * k) * t)) * np.exp(-t / 0.035) * np.clip(t / 0.0005, 0, 1)
        x += 0.25 * osc('pulse', np.full(len(t), 600 + 60 * k), 0.5, 6000) * np.exp(-t / 0.012) * np.clip(t / 0.0005, 0, 1)
        mix_into(x, 0.6 * click(0.003, 2000), 0)
        for j, off in enumerate((0.028, 0.052, 0.074)):
            mix_into(x, (0.4 - 0.1 * j) * click(0.002, 3000), off)
        add('sfx', x, fr, 0.3, 0.85, 'room', 0.12, label=f'wobble {k + 1}')
    # 222: capture click (latch) + sparkle
    fr = EV['captureClick']
    t = tt(0.25)
    x = 0.7 * np.pad(click(0.003, 2000), (0, len(t) - len(click())))
    x += 0.5 * osc('pulse', glide(1050, 520, 0.25), 0.5, 7000) * np.exp(-t / 0.018)
    x += 0.7 * np.tanh(2 * np.sin(2 * np.pi * np.cumsum(120 + 140 * np.exp(-t / 0.01)) / SR)) * np.exp(-t / 0.06)
    add('sfx', x, fr, 0.2, 0.55, 'room', 0.15, label='capture click')
    for k, p in enumerate(('C7', 'E7', 'G7', 'C8')):
        add('sfx', bell(p, 0.7, 0.4), fr + 1 + 1.5 * k, -0.4 + 0.27 * k, 0.05, 'room', 0.3)
    add('sfx', glitter(0.9, 26, 4200, 8000), fr, 0, 0.09, 'room', 0.3)
    # 268-280: orb zip (exits toward the river)
    a, b = EV['orbExitToStream']
    d = (b - a) / FPS
    t = tt(d + 0.04)
    u = np.clip(t / d, 0, 1)
    fz = np.where(u < 0.7, 400 * (2600 / 400) ** (u / 0.7), 2600 * (1700 / 2600) ** ((u - 0.7) / 0.3))
    env = np.clip(t / 0.006, 0, 1) * (0.5 + 0.5 * u) * np.clip((d + 0.04 - t) / 0.06, 0, 1)
    x = 0.45 * osc('pulse', fz, 0.125, 8000) + 0.8 * band(svf_bp(white(len(t)), fz * 1.5, 2.0), None, 8500)
    add('sfx', x * env, a, -0.4 + u, 0.22, 'room', 0.12, label='orb zip')
    # 282: river entry whoosh + splash
    t = tt(0.5)
    nz = band(svf_bp(white(len(t)), 5200 * (650 / 5200) ** np.clip(t / 0.4, 0, 1), 0.9), 250, 8500)
    x = nz * np.clip(t / 0.004, 0, 1) * np.exp(-t / 0.18)
    x += 0.5 * np.sin(2 * np.pi * np.cumsum(glide(280, 950, 0.5)) / SR) * np.exp(-t / 0.035)
    add('sfx', x, EV['chapter02'], 0, 0.36, 'room', 0.15, label='river entry whoosh')
    # 282-354: soft flow bed + bubbles that follow the orb downstream
    a, b = EV['riverOrbRide']
    t = tt((b - a) / FPS)
    u = t / t[-1]
    bedenv = np.clip(t / 0.15, 0, 1) * np.clip((t[-1] - t) / 0.25, 0, 1)
    for ch_pan in (-0.45, 0.45):
        bed = band(svf_bp(white(len(t)), 420 + 900 * u + 150 * np.sin(2 * np.pi * 0.9 * t + ch_pan * 3), 0.8), 250, 3000)
        add('sfx', bed * bedenv, a, ch_pan, 0.05)
    r = rng()
    fr = a + 3
    while fr < b - 4:
        t = tt(0.05)
        f0 = r.uniform(520, 1100)
        add('sfx', np.sin(2 * np.pi * np.cumsum(glide(f0, f0 * 1.9, 0.05)) / SR) * np.exp(-t / 0.014) * np.clip(t / 0.001, 0, 1),
            fr, -0.5 + (fr - a) / (b - a), r.uniform(0.025, 0.045), 'room', 0.2)
        fr += r.uniform(4, 8)
    # 300: "super effective" hit
    t = tt(0.4)
    x = 0.9 * band(chipnoise(len(t), 36000), 600, 8500) * np.exp(-t / 0.05)
    x += 0.7 * np.tanh(2.5 * osc('pulse', glide(820, 110, 0.4), 0.5, 6000)) * np.exp(-t / 0.07)
    x += 0.8 * np.tanh(2 * np.sin(2 * np.pi * np.cumsum(70 + 110 * np.exp(-t / 0.02)) / SR)) * np.exp(-t / 0.09)
    add('sfx', x * np.clip(t / 0.0008, 0, 1), 300, 0.1, 0.42, 'room', 0.15, label='super effective hit')
    # 382 + 40*j/16: 16 check-assembly ticks, rising A-minor pentatonic, sweeping left -> right
    a0, a1 = EV['checkAssemble']
    pent = TICK_PITCHES
    for j in range(16):
        fr = a0 + (a1 - a0) * j / 16
        t = tt(0.11)
        f = hz(pent[j])
        x = (np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * 2 * f * t) * np.exp(-t / 0.015)) * np.exp(-t / 0.03)
        x = x * np.clip(t / 0.0008, 0, 1)
        mix_into(x, 0.35 * click(0.0015, 3000, 8500), 0)
        add('sfx', x, fr, -0.5 + j / 15, 0.21 - 0.004 * j, 'room', 0.15, label=f'check tick {j + 1}')
    # 426: pop onto the check tip
    fr = EV['checkOrbPop']
    t = tt(0.12)
    x = np.sin(2 * np.pi * np.cumsum(glide(320, 1500, 0.12)) / SR) * np.exp(-t / 0.03) * np.clip(t / 0.0006, 0, 1)
    mix_into(x, 0.6 * click(0.002, 2000, 8500), 0)
    add('sfx', x, fr, 0.35, 0.34, 'room', 0.15, label='check orb pop')
    add('sfx', bell('A6', 0.8, 0.5), fr + 0.5, 0.35, 0.07, 'room', 0.3)
    add('sfx', glitter(0.5, 12, 4000, 8000), fr, 0.35, 0.06, 'room', 0.3)
    # 454-470: orb returns to Alex (descending whoosh right -> left) + EXP bar filling (rising glide)
    a, b = EV['orbReturnsToAlex']
    d = (b - a) / FPS
    t = tt(d)
    u = t / t[-1]
    env = np.clip(t / 0.006, 0, 1) * np.sin(np.pi * np.clip(u * 0.8 + 0.1, 0, 1)) * np.clip((t[-1] - t) / 0.03, 0, 1)
    nz = band(svf_bp(white(len(t)), 3200 * (700 / 3200) ** u, 1.2), 250, 8500)
    swish = band(white(len(t)), 2500, 8000) * np.exp(-t / 0.015) * np.clip(t / 0.0005, 0, 1)
    add('sfx', 0.8 * nz * env + 0.7 * swish, a, 0.5 - 0.9 * u, 0.22, 'room', 0.1, label='orb return whoosh')
    fx = 440 * 4 ** u
    exp_fill = osc('pulse', fx, 0.125, 8000) * (0.6 + 0.4 * u) * np.clip(t / 0.01, 0, 1) * np.clip((t[-1] - t) / 0.01, 0, 1)
    exp_fill *= 0.75 + 0.25 * np.sin(2 * np.pi * 15 * t)
    add('sfx', exp_fill, a, -0.3, 0.05, 'room', 0.1)
    fr = b
    x = note('A6', 0.09, 'pulse', 0.25, a=0.0008, d=0.05, s=0.4, r=0.01, cutoff=8000)
    add('sfx', x, fr, 0, 0.1, 'room', 0.2, label='EXP full chime')
    add('sfx', bell('A6', 1.0, 0.6), fr, -0.2, 0.09, 'room', 0.3)
    add('sfx', bell('E7', 0.9, 0.4), fr + 1.5, 0.2, 0.06, 'room', 0.3)


TICK_PITCHES = ['A4', 'C5', 'D5', 'E5', 'G5', 'A5', 'C6', 'D6', 'E6', 'G6', 'A6', 'C7', 'D7', 'E7', 'G7', 'A7']


def glitter(dur, count, lo, hi):
    """Deterministic sparkle: many tiny high sine pings, density thinning over time."""
    r = rng()
    x = np.zeros(int(dur * SR) + int(0.05 * SR))
    for i in range(count):
        at = dur * (i / count) ** 1.6 * 0.9
        f = r.uniform(lo, hi)
        t = tt(0.03)
        mix_into(x, np.sin(2 * np.pi * f * t) * np.exp(-t / 0.008) * np.clip(t / 0.0005, 0, 1) * (1 - 0.7 * i / count), at)
    return x


# ============================================================================================ dialogue blips
def blip_frames():
    """One blip every 2 revealed non-space characters, at the exact frame TextBox reveals that character."""
    out = []
    for t in TL['texts']:
        s = ''.join(t['lines'])
        k = 0
        frames = []
        for i, ch in enumerate(s):
            g = t['start'] + math.ceil((i + 1) / t['cpf'] - 1e-9)   # first frame with floor((g-start)*cpf) >= i+1
            if ch == ' ':
                continue
            if k % TL.get('textBlipEveryNChars', 2) == 0 and (not frames or frames[-1] != g):
                frames.append(g)
            k += 1
        out.append((t['id'], frames))
    return out


def build_blips():
    x = note('A6', 0.024, 'pulse', 0.5, a=0.0005, d=0.007, s=0.0, r=0.003, cutoff=6000)
    for tid, frames in blip_frames():
        for j, fr in enumerate(frames):
            add('blip', x, fr, 0, 0.3 if j % 2 == 0 else 0.28, 'room', 0.05)
        LOG.append((frames[0], f'text "{tid}" first blip ({len(frames)} blips, last {frames[-1]})'))


# ============================================================================================ HD (evolved) part
PAD_VOICING = {'A': ['A3', 'E4', 'A4', 'C#5'], 'F#m': ['F#3', 'C#4', 'F#4', 'A4'], 'D': ['A3', 'D4', 'F#4', 'A4'],
               'E': ['B3', 'E4', 'G#4', 'B4']}


def pad_note(p, dur, a=0.3, r=0.5, cutoff=2300.0):
    """Warm 3-voice detuned saw. Voices differ in pitch but are identical in L and R apart from pan gain, so the
    mono fold-down keeps (almost) all energy; the lowest notes stay centred."""
    n = int((dur + r) * SR)
    t = np.arange(n) / SR
    f0 = hz(p)
    out = np.zeros((2, n))
    spread = 0.0 if midi(p) < 60 else 0.38
    for i, (cents, pan) in enumerate(((-8, -spread), (0, 0.0), (8, spread))):
        f = f0 * 2 ** (cents / 1200) * (1 + 0.0015 * np.sin(2 * np.pi * (0.3 + 0.1 * i) * t + i))
        x = osc('saw', f, cutoff=cutoff, ph0=0.13 * i + midi(p) * 0.071)
        gl, gr = panlr(pan)
        out[0] += x * gl
        out[1] += x * gr
    e = np.clip(t / a, 0, 1) ** 1.5
    e *= np.clip((dur + r - t) / r, 0, 1) ** 1.5
    return out * e / 3


def hd_bass(p, dur):
    t = tt(dur)
    ph = 2 * np.pi * hz(p) * t
    x = np.sin(ph) + 0.6 * np.sin(2 * ph) + 0.32 * np.sin(3 * ph) + 0.16 * np.sin(4 * ph) + 0.08 * np.sin(5 * ph)
    return np.tanh(1.1 * x) * adsr(len(t), 0.012, 0.0, 1.0, 0.12)


def pluck(p, dur=0.5):
    t = tt(dur)
    f = hz(p)
    x = np.zeros(len(t))
    for k in range(1, 14):
        if k * f > 9000:
            break
        x += (1 / k) * np.sin(2 * np.pi * k * f * t) * np.exp(-t * (5 + 4.5 * k))
    return x * np.clip(t / 0.0015, 0, 1)


def h_kick():
    t = tt(0.35)
    f = 60 + 110 * np.exp(-t / 0.028)
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.13)
    x += 0.35 * np.tanh(3 * np.sin(2 * np.pi * np.cumsum(f * 2.1) / SR)) * np.exp(-t / 0.03)
    mix_into(x, 0.25 * click(0.0025, 2000, 7000), 0)
    return x


def h_clap():
    t = tt(0.4)
    base = band(white(len(t)), 900, 5500)
    e = np.zeros(len(t))
    for off in (0.0, 0.009, 0.019):
        e += np.exp(-np.clip(t - off, 0, None) / 0.006) * (t >= off)
    e = 0.6 * e + np.exp(-t / 0.09) * np.clip(t / 0.02, 0, 1)
    return base * e


def h_shaker():
    t = tt(0.07)
    return band(white(len(t)), 4500, 8500, ohi=6) * np.clip(t / 0.006, 0, 1) * np.exp(-t / 0.022)


PUMP = np.ones(N)


def h_hit(kind, fr, g, pan=0.0):
    if kind == 'k':
        add('hdrums', h_kick(), fr, 0, g)
        i0 = int(round(fr * SPF))
        t = tt(0.4)
        env = 1 - 0.38 * (1 - np.exp(-t / 0.005)) * np.exp(-t / 0.13)
        n = min(len(t), N - i0)
        PUMP[i0:i0 + n] = np.minimum(PUMP[i0:i0 + n], env[:n])
    elif kind == 'c':
        add('hdrums', h_clap(), fr, 0.05, g, 'hall', 0.35)
    else:
        add('hdrums', h_shaker(), fr, pan, g)


LEAD_HD = [
    (168, 2, 'A4'), (170, 2, 'E5'), (172, 1, 'D5'), (173, 1, 'E5'), (174, 2, 'A5'), (176, 3, 'G#5'), (179, 1, 'E5'), (180, 2, 'D5'), (182, 2, 'E5'),
    (184, 2, 'F#5'), (186, 1, 'E5'), (187, 1, 'F#5'), (188, 2, 'A5'), (190, 2, 'C#6'),
    (192, 3, 'D6'), (195, 1, 'C#6'), (196, 2, 'A5'), (198, 2, 'F#5'),
    (200, 2, 'G#5'), (202, 2, 'B5'),
    (212, 2, 'F#5'), (214, 2, 'A5'), (216, 2, 'G#5'), (218, 2, 'B5'), (220, 12, 'A5'),
]
# Level-up jingle (original): quick 2-frame run C#6 E6 F#6 A6, turn G#6, lands on A6 at 678 (typeBadges).
JINGLE = [(666, 'C#6', 2), (668, 'E6', 2), (670, 'F#6', 2), (672, 'A6', 3), (675, 'G#6', 3), (678, 'A6', 16)]


def build_hd():
    imp = EV['impact']
    # ---- impact: punchy, mid-focused (80-400 Hz body + transient), short; not a sub boom
    t = tt(1.0)
    f = 72 + 120 * np.exp(-t / 0.03)
    thump = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.16)
    ph = 2 * np.pi * t
    body = np.tanh(2.2 * (np.sin(ph * 110) + 0.7 * np.sin(ph * 220) + 0.45 * np.sin(ph * 165) + 0.3 * np.sin(ph * 330)))
    body *= np.exp(-t / 0.3) * np.clip(t / 0.002, 0, 1)
    snap = band(white(len(t)), 1200, 8500) * np.exp(-t / 0.018)
    x = 0.7 * thump + 0.5 * body + 0.5 * snap
    add('impact', x * np.clip(t / 0.0006, 0, 1), imp, 0, 0.62, 'hall', 0.2, label='impact')
    add('impact', c_crash(2.4, 1.0), imp, 0, 0.16)
    st = np.stack([band(white(int(2.6 * SR)), 3000, 11000), band(white(int(2.6 * SR)), 3000, 11000)])
    tc = np.arange(st.shape[1]) / SR
    add('impact', st * np.exp(-tc / 0.7) * np.clip(tc / 0.003, 0, 1), imp, 0, 0.05, 'hall', 0.4)
    # chiptune A-major stab that dissolves as the picture resolves (546-564) while the lush pad swells in
    res = (EV['pixelResolve'][1] - EV['pixelResolve'][0]) / FPS
    for p in ('A4', 'C#5', 'E5', 'A5'):
        add('impact', note(p, res + 0.25, 'pulse', 0.25, a=0.001, d=res * 0.45, s=0.0, r=0.1, cutoff=9000), imp, 0, 0.055, 'hall', 0.3)
    # shimmer: bell roll + glitter
    for k, p in enumerate(('A6', 'C#7', 'E7', 'A7')):
        add('hdmisc', bell(p, 1.6, 0.5), imp + 1 + k, -0.45 + 0.3 * k, 0.07, 'hall', 0.5)
    add('hdmisc', glitter(1.4, 40, 3500, 8200), imp, 0, 0.12, 'hall', 0.5)

    # ---- pad + bass through the reveal and card
    plan = [(fr, ch) for fr, ch in CHORDS if fr >= imp] + [(TOTAL, None)]
    for (fr, ch), (nx, _) in zip(plan[:-1], plan[1:]):
        dur = (nx - fr) / FPS
        voicing = PAD_VOICING[ch] + (['E5'] if fr == 714 else [])
        for p in voicing:
            add('hdpad', pad_note(p, dur, a=0.3 if fr == imp else 0.12, r=0.35 if nx < TOTAL else 0.05), fr, 0, 0.13, 'hall', 0.35)
        bn = BASS_ROOT[ch]
        add('hdbass', hd_bass(bn, dur + (0.05 if nx < TOTAL else 0)), fr, 0, 0.13)
    # ---- drums: half-time groove from 594 to 714 (kick 1 + and-of-3, clap on 3, shaker 16ths)
    for bar0 in (594, 642, 690):
        for pos in range(16):
            fr = bar0 + 3 * pos
            if fr >= 714:
                break
            if pos in (0, 10):
                h_hit('k', fr, 0.33 if pos == 0 else 0.24)
            if pos == 8:
                h_hit('c', fr, 0.2)
            h_hit('s', fr, 0.05 if pos % 2 else 0.028, 0.3 if pos % 4 == 2 else -0.25)
    for fr in (570, 576, 582, 588):   # shaker lead-in
        h_hit('s', fr, 0.025, 0.3)
    h_hit('k', 714, 0.34)
    add('hdrums', c_crash(2.0, 1.0) * 0.8, 714, 0, 0.1)
    # sidechain pump on pad + bass
    B['hdpad'] *= PUMP[None, :]
    B['hdbass'] *= PUMP[None, :]
    # ---- plucks: 8th-note arpeggio through the chords (594..714)
    fr = 594
    k = 0
    while fr < 714:
        ch = chord_at(fr)
        tones = [m for m in range(69, 94) if m % 12 in CHORD_PC[ch]][:4]
        add('hdmisc', pluck(tones[k % 4], 0.45), fr, 0.4 * (-1) ** k, 0.07, 'hall', 0.35)
        fr += 6
        k += 1
    # ---- lead: the motif returns in A major; chip pulse lead on top of a soft sine double
    for s, d, p in LEAD_HD:
        dur = d * ST / FPS * (0.95 if d < 8 else 1.0)
        add('hdlead', note(p, dur + (0.4 if d >= 8 else 0), 'pulse', 0.25, a=0.004, d=0.35, s=0.7, r=0.08, vib=18, vdel=0.14),
            f16(s), 0, 0.15, 'hall', 0.25)
        add('hdlead', note(p, dur + (0.4 if d >= 8 else 0), 'sine', a=0.02, d=0.5, s=0.8, r=0.1, vib=10), f16(s), 0, 0.11, 'hall', 0.3)
    for fr, p, d in JINGLE:
        dur = d / FPS * (0.92 if d < 10 else 1.0)
        add('hdlead', note(p, dur, 'pulse', 0.125, a=0.001, d=0.2, s=0.6, r=0.05, vib=20 if d > 10 else 0, vdel=0.08), fr, 0.1, 0.14, 'hall', 0.3)
        add('hdmisc', bell(p, 0.9 if d < 10 else 1.4, 0.6), fr, -0.25, 0.06, 'hall', 0.35)
    LOG.append((EV['levelUp'], 'level-up jingle start'))
    # ---- chimes on the reveal / card beats
    def chime(fr, notes, g=0.12, lab=None, pan=0.0):
        add('hdmisc', 0.6 * click(0.0015, 3000), fr, pan, g * 0.9)
        for j, p in enumerate(notes):
            add('hdmisc', bell(p, 1.2, 0.8), fr + 0.4 * j, pan + 0.2 * j, g, 'hall', 0.4)
        if lab:
            LOG.append((fr, lab))
    chime(EV['ivejoined'], ['E6'], 0.18, 'ivejoined chime')
    chime(EV['roleLines'][0], ['A5', 'E6'], 0.1, 'role line 1 chime', -0.2)
    chime(EV['roleLines'][1], ['C#6', 'A6'], 0.1, 'role line 2 chime', 0.2)
    chime(EV['typeBadges'], ['A6'], 0.1, 'typeBadges tick', 0.25)
    chime(EV['moves'], ['F#6', 'A6'], 0.15, 'moves chime', -0.25)
    chime(EV['url'], ['G#6', 'B6'], 0.11, 'url chime', 0.25)
    # card sweeps in (654-668)
    a, b = EV['cardIn']
    d = (b - a) / FPS
    t = tt(d)
    u = t / t[-1]
    nz = band(svf_bp(white(len(t)), 800 * 5 ** u, 1.0), 300, 9000)
    env = np.clip(t / 0.005, 0, 1) * np.sin(np.pi * np.clip(u * 0.9 + 0.05, 0, 1)) ** 1.2
    add('hdmisc', nz * env, a, -0.3 + 0.6 * u, 0.12, 'hall', 0.3, label='cardIn whoosh')
    # final resolve 714: bell roll on the tonic chord
    for k, p in enumerate(('A5', 'C#6', 'E6', 'A6')):
        add('hdmisc', bell(p, 2.2, 0.5), EV['endHold'][0] + 1.5 * k, -0.3 + 0.2 * k, 0.07, 'hall', 0.45)
    LOG.append((EV['endHold'][0], 'tonic resolve (A)'))


# ============================================================================================ reverb / delay
def make_ir(t60, lp, pre_ms, seed):
    n = int(t60 * 1.2 * SR)
    t = np.arange(n) / SR
    out = []
    for ch in range(2):
        r = np.random.default_rng(seed + ch)
        nz = band(r.standard_normal(n), 200, lp)
        ir = nz * np.exp(-6.91 * t / t60)
        ir[:int(pre_ms / 1000 * SR)] = 0
        out.append(ir / np.sqrt(np.sum(ir ** 2)))
    return np.stack(out)


def convolve(x, ir):
    n = x.shape[1] + ir.shape[1]
    nf = _np2(n)
    m = x.mean(0)
    Xm = np.fft.rfft(m, nf)
    y = np.stack([np.fft.irfft(Xm * np.fft.rfft(ir[c], nf), nf)[:x.shape[1]] for c in range(2)])
    return y


def echo(x, d1=0.3, g1=0.22, d2=0.6, g2=0.11):
    y = x.copy()
    for d, g, ch in ((d1, g1, 0), (d2, g2, 1)):
        k = int(d * SR)
        y[ch, k:] += g * x.mean(0)[:-k]
    return y


# ============================================================================================ loudness / limiter
def kweight(x):
    n = x.shape[-1]
    nf = _np2(n + SR)
    w = 2 * np.pi * np.fft.rfftfreq(nf, 1 / SR) / SR
    z = np.exp(-1j * w)
    b1, a1 = [1.53512485958697, -2.69169618940638, 1.19839281085285], [1, -1.69065929318241, 0.73248077421585]
    b2, a2 = [1.0, -2.0, 1.0], [1, -1.99004745483398, 0.99007225036621]
    H = ((b1[0] + b1[1] * z + b1[2] * z * z) / (a1[0] + a1[1] * z + a1[2] * z * z) *
         (b2[0] + b2[1] * z + b2[2] * z * z) / (a2[0] + a2[1] * z + a2[2] * z * z))
    return np.fft.irfft(np.fft.rfft(x, nf) * H, nf)[..., :n]


def block_ms(xk, blk=0.4, hop=0.1):
    L, H = int(blk * SR), int(hop * SR)
    c = np.cumsum(np.concatenate([np.zeros((xk.shape[0], 1)), xk ** 2], 1), 1)
    starts = np.arange(0, xk.shape[1] - L + 1, H)
    return ((c[:, starts + L] - c[:, starts]) / L).sum(0), starts


def lufs(x):
    z, _ = block_ms(kweight(x))
    lk = -0.691 + 10 * np.log10(z + 1e-20)
    z1 = z[lk > -70]
    rel = -0.691 + 10 * np.log10(z1.mean()) - 10
    z2 = z[(lk > -70) & (lk > rel)]
    return -0.691 + 10 * np.log10(z2.mean())


def win_lufs(x, f0, f1):
    a, b = int(f0 * SPF), int(f1 * SPF)
    xk = kweight(x)[:, a:b]
    return -0.691 + 10 * np.log10((xk ** 2).mean(1).sum() + 1e-20)


def oversample4(x):
    n = x.shape[-1]
    X = np.fft.rfft(x, n)
    Y = np.zeros(x.shape[:-1] + (2 * n + 1,), complex)
    Y[..., :X.shape[-1]] = X
    return np.fft.irfft(Y, 4 * n) * 4


def true_peak_db(x):
    return 20 * np.log10(np.abs(oversample4(x)).max())


def limiter(x, ceil_db=TP_CEIL_DB, look=96, rel=0.08):
    ceil = 10 ** (ceil_db / 20)
    up = np.abs(oversample4(x)).reshape(2, -1, 4).max(2).max(0)
    gt = np.minimum(1.0, ceil / np.maximum(up, 1e-9))
    # symmetric min filter (2*look+1) then moving average (2*look+1): gain is fully down by every peak
    pad = np.pad(gt, (look, look), constant_values=1.0)
    win = np.lib.stride_tricks.sliding_window_view(pad, 2 * look + 1)
    gm = win.min(1)
    c = np.cumsum(np.concatenate([[0], np.pad(gm, (look, look), constant_values=1.0)]))
    gs = (c[2 * look + 1:] - c[:-(2 * look + 1)]) / (2 * look + 1)
    a = 1 - math.exp(-1 / (rel * SR))
    g = gs.tolist()
    y = 1.0
    for i in range(len(g)):
        v = g[i]
        y = v if v < y else y + (1 - y) * a
        if y > v:
            y = v
        g[i] = y
    g = np.array(g)
    return x * g[None, :], g


# ============================================================================================ render
def render():
    build_title()
    build_battle()
    build_evolve()
    build_sfx_pixel()
    build_blips()
    build_hd()

    # text ducking: the chip lead dips 3 dB while a text box is typing, so the blips read
    duck = np.ones(N)
    for t in TL['texts']:
        tot = sum(len(l) for l in t['lines'])
        a, b = t['start'] * SPF, (t['start'] + tot / t['cpf'] + 3) * SPF
        idx = np.arange(N)
        ramp = np.clip(np.minimum(idx - a, b - idx) / (0.06 * SR), 0, 1)
        duck = np.minimum(duck, 1 - 0.29 * ramp)
    B['lead'] *= duck[None, :]

    # pre-impact near-silence 543 -> 546 for everything from the pixel world (20 ms raised-cosine fade, no click)
    idx = np.arange(N) / SPF
    wo, im = EV['whiteout'], EV['impact']
    fall = 0.6
    pix = np.ones(N)
    m = (idx >= wo) & (idx < wo + fall)
    pix[m] = 1 - 0.98 * (0.5 - 0.5 * np.cos(np.pi * (idx[m] - wo) / fall))
    pix[idx >= wo + fall] = 0.02
    m = idx >= im
    pix[m] = 0.02 * np.clip(1 - (idx[m] - im) / 2.0, 0, 1)
    for k in ('lead', 'chip', 'bass', 'drums', 'sfx', 'blip'):
        B[k] *= pix[None, :]

    B['lead'] = echo(B['lead'], 0.3, 0.16, 0.6, 0.08)
    B['hdlead'] = echo(B['hdlead'], 0.3, 0.2, 0.6, 0.11)

    room = convolve(SEND['room'], make_ir(0.7, 6000, 8, 11))
    rduck = np.where(idx < wo, 1.0, np.where(idx < 560, 0.0, np.clip((idx - 560) / 20, 0, 1)))
    m = (idx >= wo) & (idx < wo + fall)
    rduck[m] = 1 - (0.5 - 0.5 * np.cos(np.pi * (idx[m] - wo) / fall))
    room *= rduck[None, :]
    hall = convolve(SEND['hall'], make_ir(2.3, 7000, 22, 23))

    gains = {'lead': 0.85, 'chip': 1.0, 'bass': 1.0, 'drums': 1.0, 'sfx': 1.25, 'blip': 1.0,
             'hdpad': 1.0, 'hdbass': 1.0, 'hdlead': 1.0, 'hdmisc': 1.0, 'hdrums': 1.0, 'impact': 1.5}  # QA: impact louder than riser, SFX over lead
    mix = sum(B[k] * g for k, g in gains.items()) + 0.55 * room + 0.5 * hall
    mix = band(mix, 32, 16000, olo=4, ohi=4)
    # 5 ms fade-in; audio fade over the last 0.4 s, final sample exactly 0
    fi = int(0.005 * SR)
    mix[:, :fi] *= np.linspace(0, 1, fi)
    fo = int(0.4 * SR)
    mix[:, N - fo:] *= (0.5 + 0.5 * np.cos(np.pi * np.linspace(0, 1, fo))) ** 1.2
    return mix, room, hall


def master(mix):
    g = 10 ** ((TARGET_LUFS - lufs(mix)) / 20)
    for it in range(6):
        y, gr = limiter(mix * g)
        l = lufs(y)
        if abs(l - TARGET_LUFS) < 0.05:
            break
        g *= 10 ** ((TARGET_LUFS - l) / 20)
    tp = true_peak_db(y)
    if tp > TP_CEIL_DB + 0.05:
        y *= 10 ** ((TP_CEIL_DB - tp) / 20)
    grdb = 20 * np.log10(gr)
    print('limiter gain reduction > 1 dB at frames:',
          sorted(set(int(i // SPF) for i in np.nonzero(grdb < -1.0)[0][::400])) or 'none')
    return y, grdb.min(), g


def write_wav(y, path):
    q = np.clip(np.round(y.T * 32767), -32768, 32767).astype('<i2')
    with wave.open(path, 'wb') as wf:
        wf.setnchannels(2)
        wf.setsampwidth(2)
        wf.setframerate(SR)
        wf.writeframes(q.tobytes())


def read_wav(path):
    with wave.open(path, 'rb') as wf:
        n = wf.getnframes()
        a = np.frombuffer(wf.readframes(n), '<i2').astype(float) / 32768
        return a.reshape(-1, wf.getnchannels()).T, wf.getframerate(), n


# ============================================================================================ analysis
def onset_curve(x, lo=600, hi=9000, nfft=512, hop=48):
    if hi - lo < 800:
        nfft = 1024
    m = x.mean(0) if x.ndim == 2 else x
    w = np.hanning(nfft)
    frames = np.lib.stride_tricks.sliding_window_view(np.pad(m, (nfft // 2, nfft // 2)), nfft)[::hop]
    S = np.abs(np.fft.rfft(frames * w, axis=1))
    f = np.fft.rfftfreq(nfft, 1 / SR)
    S = np.log1p(1000 * S[:, (f >= lo) & (f <= hi)])
    flux = np.maximum(0, np.diff(S, axis=0, prepend=S[:1])).sum(1)
    times = np.arange(len(flux)) * hop / SR
    return times, flux


def event_list():
    ev = [(EV['pressStart'], 'pressStart'), (EV['battleTransition'][0], 'transition'),
          (EV['enemyAppear'], 'enemyAppear'), (EV['menuOpen'], 'menuOpen'), (EV['menuSelectCapture'], 'menuSelect'),
          (EV['throw'][0], 'throw'), (EV['absorb'], 'absorb'), (EV['orbFall'][1], 'bounce')]
    ev += [(f, f'wobble{i + 1}') for i, f in enumerate(EV['wobbles'])]
    ev += [(EV['captureClick'], 'captureClick'), (EV['orbExitToStream'][0], 'orbZip'), (EV['chapter02'], 'river'),
           (300, 'superEffective')]
    a0, a1 = EV['checkAssemble']
    ev += [(a0 + (a1 - a0) * j / 16, f'tick{j + 1}') for j in range(16)]
    ev += [(EV['checkOrbPop'], 'pop'), (EV['orbReturnsToAlex'][0], 'orbReturn'), (EV['orbReturnsToAlex'][1], 'EXPchime')]
    ev += [(f, f'flash{i + 1}') for i, f in enumerate(EV['evolveFlashes'])]
    ev = [(f, n, 'sfx') for f, n in ev]
    ev += [(EV['impact'], 'impact', 'impact'), (EV['levelUp'], 'levelUp', 'hdlead')]
    ev += [(f, n, 'hdmisc') for f, n in ((EV['ivejoined'], 'ivejoined'), (EV['roleLines'][0], 'role1'),
           (EV['roleLines'][1], 'role2'), (EV['cardIn'][0], 'cardIn'),
           (EV['typeBadges'], 'typeBadges'), (EV['moves'], 'moves'), (EV['url'], 'url'), (EV['endHold'][0], 'resolve'))]
    for tid, frames in blip_frames():
        ev += [(f, f'text:{tid}#{j}', 'blip') for j, f in enumerate(frames)]
    return sorted(ev)


def onset_peaks(x, lo=600, hi=9000):
    times, flux = onset_curve(x, lo, hi)
    k = int(0.1 * SR / 48)
    loc = np.lib.stride_tricks.sliding_window_view(np.pad(flux, (k, k), mode='edge'), 2 * k + 1)
    thr = np.maximum(0.15 * loc.max(1), 2.5 * np.median(loc, 1) + 1e-6)
    pk = (flux > np.roll(flux, 1)) & (flux >= np.roll(flux, -1)) & (flux > thr)
    return times[pk]


def detect_band(name):
    """Frequency band in which each event's own onset is detected (its fundamental / main partials)."""
    if name.startswith('text:'):
        return 1600, 1950                                # dialogue blip at 1760 Hz
    if name.startswith('tick'):
        f = hz(TICK_PITCHES[int(name[4:]) - 1])
        return f * 0.9, f * 1.1
    bells = {'ivejoined': 'E6', 'role1': 'E6', 'role2': 'A6', 'typeBadges': 'A6', 'moves': 'A6', 'url': 'B6',
             'resolve': 'A6', 'EXPchime': 'A6', 'levelUp': 'C#6', 'pressStart': 'E6', 'menuOpen': 'A6', 'menuSelect': 'D6'}
    if name in bells:
        f = hz(bells[name])
        return f * 0.93, f * 1.07
    if name == 'bounce':
        return 250, 800
    if name == 'transition':
        return 150, 600
    if name == 'orbReturn':
        return 2500, 8500
    if name.startswith('flash'):
        return 100, 300
    return 600, 9000


def measure_sync(stems, label, search=1.5):
    """For each event: nearest detected onset (spectral-flux peak, 1 ms hop) within +-search frames.
    `stems` is either one signal (the final mix) or a dict bus -> signal (each event checked on its own bus)."""
    cache = {}
    rows = []
    for fr, name, bus in event_list():
        x = stems if not isinstance(stems, dict) else stems[bus]
        lo, hi = detect_band(name)
        key = (id(x), lo, hi)
        if key not in cache:
            cache[key] = onset_peaks(x, lo, hi)
        pk = cache[key]
        t0 = fr / FPS
        d = pk - t0
        d = d[np.abs(d) <= search / FPS]
        rows.append((name, fr, None if len(d) == 0 else d[np.argmin(np.abs(d))] * 1000))
    found = [r for r in rows if r[2] is not None]
    mx = max(abs(r[2]) for r in found)
    miss = [r[0] for r in rows if r[2] is None]
    print(f'\n[sync:{label}] {len(found)}/{len(rows)} events matched, max |offset| = {mx:.1f} ms, '
          f'mean |offset| = {np.mean([abs(r[2]) for r in found]):.1f} ms; unmatched: {miss}')
    return rows, mx


def ffmpeg_ebur(path, extra=None):
    cmd = [FFMPEG, '-hide_banner', '-nostats', '-i', path]
    if extra:
        cmd += ['-af', extra + ',ebur128=peak=true']
    else:
        cmd += ['-af', 'ebur128=peak=true']
    cmd += ['-f', 'null', '-']
    err = subprocess.run(cmd, capture_output=True, text=True).stderr
    summ = err[err.rfind('Summary:'):]
    I = float(re.search(r'I:\s+(-?[\d.]+) LUFS', summ).group(1))
    LRA = float(re.search(r'LRA:\s+(-?[\d.]+) LU', summ).group(1))
    TP = float(re.search(r'Peak:\s+(-?[\d.]+|-inf) dBFS', summ).group(1))
    return I, LRA, TP


def analyze(y, stems=None):
    print('\n================ MEASUREMENTS ================')
    x, sr, n = read_wav(OUT)
    print(f'file: {OUT}  sr={sr}  frames={n}  duration={n / sr:.4f} s  channels={x.shape[0]}')
    I, LRA, TP = ffmpeg_ebur(OUT)
    print(f'ffmpeg ebur128: integrated {I:.1f} LUFS, LRA {LRA:.1f} LU, true peak {TP:.1f} dBTP')
    Im, _, TPm = ffmpeg_ebur(OUT, 'pan=stereo|c0=0.5*c0+0.5*c1|c1=0.5*c0+0.5*c1')
    print(f'mono fold-down (L+R)/2 on both channels: {Im:.1f} LUFS -> loss {I - Im:.2f} LU (true peak {TPm:.1f})')
    print(f'numpy BS.1770: stereo {lufs(x):.2f} LUFS, sample peak {20 * np.log10(np.abs(x).max()):.2f} dBFS, '
          f'4x true peak {true_peak_db(x):.2f} dBTP')
    P = (np.abs(np.fft.rfft(x, axis=1)) ** 2).sum(0)
    f = np.fft.rfftfreq(x.shape[1], 1 / SR)
    tot = P.sum()
    for lo, hi in ((0, 60), (60, 150), (150, 400), (400, 1000), (1000, 5000), (5000, 9000), (9000, 24000)):
        print(f'  energy {lo:>5}-{hi:<5} Hz: {100 * P[(f >= lo) & (f < hi)].sum() / tot:5.1f} %')
    print(f'  => below 150 Hz: {100 * P[f < 150].sum() / tot:.1f} %  | 150 Hz-5 kHz: {100 * P[(f >= 150) & (f < 5000)].sum() / tot:.1f} %')
    # phone model: mono, 4th-order HP at 300 Hz
    ph = band(x.mean(0, keepdims=True).repeat(2, 0), 300, None, olo=4)
    print(f'  phone model (mono, HP300): {lufs(ph):.1f} LUFS (loss {lufs(x) - lufs(ph):.1f} LU)')
    print('\nshort-term loudness by section (full-range | phone model):')
    for a, b, name in ((0, 40, 'title'), (54, 150, 'intro'), (150, 186, 'A: capture'), (186, 222, 'wobbles'),
                       (222, 258, 'fanfare'), (258, 282, 'battle2'), (282, 354, 'river'), (354, 378, 'battle3'),
                       (378, 450, 'check'), (450, 498, 'evolve drop'), (498, 543, 'flashes+riser'), (543, 546, 'gap'),
                       (546, 570, 'impact'), (570, 654, 'reveal'), (654, 714, 'card'), (714, 738, 'end hold')):
        print(f'  {a:>3}-{b:<3} {name:<14} {win_lufs(x, a, b):6.1f} | {win_lufs(ph, a, b):6.1f}')
    # clicks at edges: max sample-to-sample jump in the gap and at the file ends
    a, b = int(543 * SPF), int(546 * SPF)
    print(f'\npre-impact gap 543-546: peak {20 * np.log10(np.abs(x[:, a + 1200:b - 10]).max() + 1e-9):.1f} dBFS '
          f'(after the 25 ms fade); first/last sample {x[:, 0].tolist()} / {x[:, -1].tolist()}')
    # click detector: energy above 12 kHz (everything musical is band-limited below ~11 kHz) in 2 ms windows
    hf = band(x.mean(0), 12000, None, olo=6)
    w = int(0.002 * SR)
    e = np.sqrt((hf[:len(hf) // w * w].reshape(-1, w) ** 2).mean(1)) + 1e-12
    ref = np.sqrt((x.mean(0)[:len(hf) // w * w].reshape(-1, w) ** 2).mean(1)) + 1e-9
    k = int(0.1 / 0.002)
    loc = np.median(np.lib.stride_tricks.sliding_window_view(np.pad(e, (k, k), mode='edge'), 2 * k + 1), 1)
    spikes = np.nonzero((e > 8 * loc) & (20 * np.log10(e / ref) > -30))[0]
    print(f'click scan (>12 kHz bursts 18 dB over local median and within 30 dB of the signal): '
          f'{len(spikes)} -> frames {sorted(set(int(i * w // SPF) for i in spikes))[:30]}')
    rows, mx = measure_sync(x, 'final mix', 1.0)
    rows2, mx2 = measure_sync(stems, 'own stem per event')
    for (name, fr, off), (_, _, off2) in zip(rows, rows2):
        if '#' in name and not name.endswith('#0'):
            continue
        f = lambda v: '   n/a' if v is None else f'{v:+6.1f}'
        print(f'   {name:<18} frame {fr:7.2f}  mix {f(off)} ms   own stem {f(off2)} ms')
    return I, TP, I - Im


def main():
    mix, room, hall = render()
    stems = {k: B[k].copy() for k in ('sfx', 'blip', 'impact', 'hdmisc', 'hdlead')}
    y, grmin, g = master(mix)
    write_wav(y, OUT)
    print(f'wrote {OUT}: {y.shape[1] / SR:.3f} s, limiter max GR {grmin:.1f} dB, makeup {20 * np.log10(g):+.1f} dB')
    print('\nplaced events (GLOBAL frames):')
    for fr, lab in sorted(LOG):
        print(f'  {fr:7.2f}  {lab}')
    if '--no-analyze' not in sys.argv:
        balance(mix)
        analyze(y, stems)


def balance(mix):
    print('\nforeground vs bed (pre-master, K-weighted, same window):')
    def rel(bus, a, b, name):
        fg = win_lufs(B[bus], a, b)
        bed = win_lufs(mix - B[bus], a, b)
        print(f'  {name:<26} {a:>5}-{b:<5} fg {fg:6.1f}  bed {bed:6.1f}  -> {fg - bed:+5.1f} LU')
    for t in TL['texts']:
        tot = sum(len(l) for l in t['lines'])
        rel('blip', t['start'] + 1, t['start'] + tot / t['cpf'] + 1, 'blips ' + t['id'])
    rel('sfx', 382, 422, 'check ticks')
    rel('sfx', 186, 222, 'wobbles')
    for fr, nm in ((556, 'ivejoined'), (570, 'role1'), (576, 'role2'), (678, 'badges'), (690, 'moves'), (702, 'url')):
        rel('hdmisc', fr, fr + 5, 'chime ' + nm)


if __name__ == '__main__':
    main()
