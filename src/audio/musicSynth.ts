// Procedural background music: a 16-bar loop in C major at 88 BPM (music-box melody over a soft marimba arpeggio,
// felt-piano chords and a round bass), rendered to one mono buffer. Nothing is downloaded and the loop is
// seamless by construction: notes and the echo tail wrap around the end of the buffer into the start.

export const MUSIC_RATE = 22050;

const TAU = Math.PI * 2;
const BPM = 88;
const EIGHTH = 30 / BPM;
const BARS = 16;
export const MUSIC_SECONDS = BARS * 8 * EIGHTH;
export const MUSIC_SAMPLES = Math.round(MUSIC_SECONDS * MUSIC_RATE);

interface Voice {
  /** [frequency multiple, amplitude] pairs. */
  partials: readonly (readonly [number, number])[];
  /** Exponential decay in 1/s. */
  decay: number;
  /** Linear attack in seconds. */
  attack: number;
  gain: number;
}

const BELL: Voice = { partials: [[1, 1], [2, 0.35], [3, 0.12], [4.2, 0.08]], decay: 3.2, attack: 0.003, gain: 0.3 };
const MARIMBA: Voice = { partials: [[1, 1], [4, 0.15]], decay: 5.5, attack: 0.004, gain: 0.15 };
const BASS: Voice = { partials: [[1, 1], [2, 0.2]], decay: 2, attack: 0.01, gain: 0.22 };
const FELT: Voice = { partials: [[1, 1], [2, 0.25], [3, 0.08]], decay: 1.1, attack: 0.012, gain: 0.07 };

interface Chord {
  bass: number;
  tones: readonly number[];
}
const C: Chord = { bass: 48, tones: [60, 64, 67, 72] };
const AM: Chord = { bass: 45, tones: [57, 60, 64, 69] };
const F: Chord = { bass: 41, tones: [53, 57, 60, 65] };
const G: Chord = { bass: 43, tones: [55, 59, 62, 67] };

const PROGRESSION: readonly Chord[] = [C, AM, F, G, C, AM, F, G, F, C, G, AM, F, C, G, C];

/** Melody per bar as [start (eighths), MIDI note, length (eighths)]. */
const MELODY: readonly (readonly (readonly [number, number, number])[])[] = [
  [[0, 76, 2], [2, 79, 1], [3, 76, 1], [4, 74, 2], [6, 72, 2]],
  [[0, 69, 2], [2, 72, 2], [4, 76, 3], [7, 74, 1]],
  [[0, 77, 2], [2, 76, 1], [3, 74, 1], [4, 72, 2], [6, 69, 2]],
  [[0, 71, 2], [2, 74, 2], [4, 79, 4]],
  [[0, 76, 1], [1, 79, 1], [2, 84, 2], [4, 79, 2], [6, 76, 2]],
  [[0, 81, 2], [2, 79, 1], [3, 76, 1], [4, 72, 2], [6, 76, 2]],
  [[0, 77, 2], [2, 81, 2], [4, 79, 1], [5, 77, 1], [6, 76, 2]],
  [[0, 74, 2], [2, 71, 2], [4, 67, 2], [6, 74, 2]],
  [[0, 72, 2], [2, 77, 2], [4, 81, 2], [6, 77, 2]],
  [[0, 79, 2], [2, 76, 2], [4, 72, 2], [6, 76, 2]],
  [[0, 74, 2], [2, 79, 2], [4, 83, 2], [6, 79, 2]],
  [[0, 81, 3], [3, 79, 1], [4, 76, 2], [6, 72, 2]],
  [[0, 77, 2], [2, 81, 2], [4, 84, 2], [6, 81, 2]],
  [[0, 79, 2], [2, 76, 1], [3, 79, 1], [4, 84, 4]],
  [[0, 83, 2], [2, 79, 2], [4, 74, 2], [6, 71, 2]],
  [[0, 79, 2], [2, 76, 2], [4, 72, 4]],
];

/** Which chord tone the marimba plays on each eighth of a bar. */
const ARP = [0, 1, 2, 3, 2, 1, 2, 1] as const;

const hz = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);

/** Adds one note into `out`, wrapping past the end so tails fold into the start of the loop. */
function note(out: Float32Array, startSec: number, midi: number, lengthSec: number, v: Voice): void {
  const n = out.length;
  const f = hz(midi);
  const s0 = Math.round(startSec * MUSIC_RATE);
  const total = Math.min(Math.trunc(MUSIC_RATE * 3), n);
  const attackN = Math.max(1, Math.round(v.attack * MUSIC_RATE));
  const lengthN = Math.round(lengthSec * MUSIC_RATE);
  const decayStep = Math.exp(-v.decay / MUSIC_RATE);
  const releaseStep = Math.exp(-8 / MUSIC_RATE);

  // Each partial is a sine from the recurrence y[i] = 2cos(w)·y[i-1] - y[i-2]: far cheaper than Math.sin per sample.
  const k = v.partials.length;
  const coef: number[] = [];
  const y1: number[] = [];
  const y2: number[] = [];
  for (const [mult] of v.partials) {
    const w = (TAU * f * mult) / MUSIC_RATE;
    coef.push(2 * Math.cos(w));
    y1.push(-Math.sin(w));
    y2.push(-Math.sin(2 * w));
  }

  let decay = 1;
  let release = 1;
  for (let i = 0; i < total; i++) {
    const level = (i < attackN ? i / attackN : 1) * decay * release;
    if (i > attackN && level < 0.0005) break;
    let s = 0;
    for (let p = 0; p < k; p++) {
      const y = coef[p] * y1[p] - y2[p];
      y2[p] = y1[p];
      y1[p] = y;
      s += v.partials[p][1] * y;
    }
    out[(s0 + i) % n] += s * level * v.gain;
    decay *= decayStep;
    if (i >= lengthN) release *= releaseStep;
  }
}

/** Renders the whole loop. Deterministic, a few hundred milliseconds of work, peak-normalised to 0.9. */
export function renderMusic(): Float32Array<ArrayBuffer> {
  const out = new Float32Array(MUSIC_SAMPLES);
  const bar = 8 * EIGHTH;
  for (let b = 0; b < BARS; b++) {
    const t0 = b * bar;
    const chord = PROGRESSION[b];
    note(out, t0, chord.bass, 4 * EIGHTH, BASS);
    note(out, t0 + 4 * EIGHTH, chord.bass + 7, 4 * EIGHTH, BASS);
    for (const tone of chord.tones) note(out, t0, tone, 8 * EIGHTH, FELT);
    for (let e = 0; e < 8; e++) note(out, t0 + e * EIGHTH, chord.tones[ARP[e]] + 12, EIGHTH, MARIMBA);
    for (const [start, midi, len] of MELODY[b]) note(out, t0 + start * EIGHTH, midi, len * EIGHTH, BELL);
  }

  // A touch of room: two circular echoes, so the loop seam stays clean.
  const dry = out.slice();
  for (const [delay, gain] of [[0.34, 0.22], [0.68, 0.1]] as const) {
    const d = Math.round(delay * MUSIC_RATE);
    for (let i = 0; i < out.length; i++) out[i] += gain * dry[(i - d + out.length) % out.length];
  }

  let peak = 0;
  for (let i = 0; i < out.length; i++) peak = Math.max(peak, Math.abs(out[i]));
  const k = peak > 0 ? 0.9 / peak : 1;
  for (let i = 0; i < out.length; i++) out[i] *= k;
  return out;
}
