// Procedural sound effects: every blip is synthesized in code (short sine/square tone bursts shaped by a
// small hand-rolled envelope), no audio files. Ports the synthesis half of scripts/audio/Sfx.gd and
// reproduces its 16-bit samples (verified against tests/fixtures/godot_audio.json).

import { Pcg32 } from '../core/Rng';

export const MIX_RATE = 22050;
const TAU = Math.PI * 2;

/** (time fraction, amplitude) control points, linearly interpolated across a tone's duration. */
type Env = readonly (readonly [number, number])[];
type Wave = 'sine' | 'square';

const lerpf = (a: number, b: number, t: number): number => a + (b - a) * t;
const clamp = (x: number, lo: number, hi: number): number => Math.min(Math.max(x, lo), hi);

function envelopeAt(env: Env, frac: number): number {
  if (env.length === 0) return 1;
  if (frac <= env[0][0]) return env[0][1];
  for (let i = 0; i < env.length - 1; i++) {
    const [ax, ay] = env[i];
    const [bx, by] = env[i + 1];
    if (frac >= ax && frac <= bx) {
      const span = bx - ax;
      const t = span <= 0 ? 0 : (frac - ax) / span;
      return lerpf(ay, by, t);
    }
  }
  return env[env.length - 1][1];
}

const waveAt = (wave: Wave, phase: number): number => (wave === 'square' ? (Math.sin(phase) >= 0 ? 1 : -1) : Math.sin(phase));

const toSample = (v: number): number => Math.trunc(clamp(v * 0.8, -1, 1) * 32767);

const countFor = (dur: number): number => Math.max(1, Math.trunc(dur * MIX_RATE));

/** A fixed-frequency tone burst. */
function tone(freq: number, dur: number, wave: Wave, env: Env): Int16Array {
  const n = countFor(dur);
  const out = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / MIX_RATE;
    out[i] = toSample(envelopeAt(env, i / n) * waveAt(wave, TAU * freq * t));
  }
  return out;
}

/** A tone that linearly sweeps f0 -> f1. Phase accumulates so the sweep has no clicks. */
function sweep(f0: number, f1: number, dur: number, wave: Wave, env: Env): Int16Array {
  const n = countFor(dur);
  const out = new Int16Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const frac = i / n;
    phase += (TAU * lerpf(f0, f1, frac)) / MIX_RATE;
    out[i] = toSample(envelopeAt(env, frac) * waveAt(wave, phase));
  }
  return out;
}

/** Soft low-passed noise (one-pole filter over white noise) for whooshes and shutter clicks. */
function noise(dur: number, env: Env): Int16Array {
  const n = countFor(dur);
  const out = new Int16Array(n);
  const rng = new Pcg32(7);
  let y = 0;
  for (let i = 0; i < n; i++) {
    const frac = i / n;
    // Sweep the filter open then closed so it "passes by".
    const k = lerpf(0.05, 0.35, Math.sin(frac * Math.PI));
    const r = Math.fround(Math.fround(rng.randf() * 2) - 1); // randf_range(-1, 1) is float32
    y += (r - y) * k;
    out[i] = toSample(y * 1.6 * envelopeAt(env, frac));
  }
  return out;
}

const silence = (dur: number): Int16Array => new Int16Array(countFor(dur));

function concat(parts: readonly Int16Array[]): Int16Array {
  const out = new Int16Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** Sample-wise sum of two buffers (layering), clamped to 16 bits. */
function mix(a: Int16Array, b: Int16Array): Int16Array {
  const out = new Int16Array(Math.max(a.length, b.length));
  for (let i = 0; i < out.length; i++) {
    out[i] = clamp((i < a.length ? a[i] : 0) + (i < b.length ? b[i] : 0), -32768, 32767);
  }
  return out;
}

export const SFX_NAMES = [
  'pickup', 'place', 'refuse', 'undo', 'hint_deny', 'hint_use', 'button_tap', 'star_pop', 'diamond_tick',
  'win_fanfare', 'tick', 'pop', 'sparkle', 'happy', 'upset', 'whoosh', 'focus', 'shutter', 'star_slam',
] as const;
export type SfxName = (typeof SFX_NAMES)[number];

export function synth(name: string): Int16Array {
  switch (name) {
    case 'pickup':
      return sweep(440, 660, 0.06, 'sine', [[0, 0], [0.15, 0.7], [1, 0]]);
    case 'place': {
      // A sharp fundamental plus a quiet octave-up layer for a "clink".
      const main = tone(523, 0.09, 'sine', [[0, 0], [0.05, 1], [1, 0]]);
      const clink = tone(1046, 0.09, 'sine', [[0, 0], [0.05, 0.3], [1, 0]]);
      return mix(main, clink);
    }
    case 'refuse':
      return sweep(180, 140, 0.12, 'square', [[0, 0.8], [1, 0]]);
    case 'undo':
      return sweep(660, 440, 0.08, 'sine', [[0, 0], [0.15, 0.7], [1, 0]]);
    case 'hint_deny': {
      // Two short buzzes: a firm "no" distinct from the softer refuse.
      const p1 = tone(160, 0.06, 'square', [[0, 0.8], [1, 0]]);
      const p2 = tone(160, 0.06, 'square', [[0, 0.8], [1, 0]]);
      return concat([p1, silence(0.03), p2]);
    }
    case 'hint_use': {
      const n1 = tone(660, 0.09, 'sine', [[0, 0], [0.1, 1], [1, 0]]);
      const n2 = tone(880, 0.09, 'sine', [[0, 0], [0.1, 1], [1, 0]]);
      return concat([n1, n2]);
    }
    case 'button_tap':
      return tone(700, 0.04, 'sine', [[0, 1], [1, 0]]);
    case 'star_pop':
      return tone(659, 0.07, 'sine', [[0, 0], [0.1, 1], [1, 0]]);
    case 'diamond_tick':
      return tone(1200, 0.03, 'sine', [[0, 1], [1, 0]]);
    case 'win_fanfare': {
      const notes = [523, 659, 784, 1046];
      return concat(
        notes.map((f, i) => tone(f, i < notes.length - 1 ? 0.12 : 0.28, 'sine', [[0, 0], [0.08, 1], [0.8, 0.6], [1, 0]])),
      );
    }
    case 'tick':
      // Tiny wooden tick as a ghost snaps onto a new legal spot.
      return tone(1500, 0.018, 'sine', [[0, 0.7], [1, 0]]);
    case 'pop':
      return sweep(900, 300, 0.07, 'sine', [[0, 0], [0.1, 1], [1, 0]]);
    case 'sparkle': {
      const a = tone(1568, 0.12, 'sine', [[0, 0], [0.05, 0.6], [1, 0]]);
      const b = tone(2349, 0.12, 'sine', [[0, 0], [0.05, 0.35], [1, 0]]);
      return mix(a, b);
    }
    case 'happy': {
      const h1 = tone(784, 0.07, 'sine', [[0, 0], [0.1, 0.9], [1, 0]]);
      const h2 = tone(1175, 0.11, 'sine', [[0, 0], [0.1, 0.9], [1, 0]]);
      return concat([h1, h2]);
    }
    case 'upset':
      return sweep(240, 150, 0.16, 'square', [[0, 0], [0.1, 0.4], [1, 0]]);
    case 'whoosh':
      return noise(0.3, [[0, 0], [0.45, 0.55], [1, 0]]);
    case 'focus':
      // The camera's autofocus beep.
      return tone(1900, 0.05, 'sine', [[0, 0], [0.1, 0.7], [1, 0]]);
    case 'shutter': {
      // Two mechanical clicks: the blades closing, then opening.
      const c1 = mix(noise(0.03, [[0, 1], [1, 0]]), tone(170, 0.03, 'square', [[0, 0.7], [1, 0]]));
      const c2 = mix(noise(0.025, [[0, 0.7], [1, 0]]), tone(230, 0.025, 'square', [[0, 0.5], [1, 0]]));
      return concat([c1, silence(0.07), c2]);
    }
    case 'star_slam': {
      const thump = sweep(220, 70, 0.14, 'sine', [[0, 1], [1, 0]]);
      const ding = tone(1319, 0.18, 'sine', [[0, 0], [0.04, 0.6], [1, 0]]);
      return mix(thump, ding);
    }
    default:
      return tone(440, 0.05, 'sine', [[0, 1], [1, 0]]);
  }
}
