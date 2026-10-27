import { describe, expect, it } from 'vitest';
import { MUSIC_SAMPLES, MUSIC_SECONDS, renderMusic } from '../src/audio/musicSynth';

describe('procedural background music', () => {
  const samples = renderMusic();

  it('is one 16-bar loop of the expected length', () => {
    expect(samples.length).toBe(MUSIC_SAMPLES);
    expect(MUSIC_SECONDS).toBeGreaterThan(40);
    expect(MUSIC_SECONDS).toBeLessThan(50);
  });

  it('is finite, audible and never clips', () => {
    let peak = 0;
    let energy = 0;
    let bad = 0;
    for (const s of samples) {
      if (!Number.isFinite(s)) bad++;
      peak = Math.max(peak, Math.abs(s));
      energy += s * s;
    }
    expect(bad).toBe(0);
    expect(peak).toBeLessThanOrEqual(0.9001);
    expect(Math.sqrt(energy / samples.length)).toBeGreaterThan(0.03);
  });

  it('loops without a click at the seam', () => {
    const n = samples.length;
    // The step across the loop point must be no bigger than the steps just before it.
    let worst = 0;
    for (let i = n - 400; i < n - 1; i++) worst = Math.max(worst, Math.abs(samples[i + 1] - samples[i]));
    expect(Math.abs(samples[0] - samples[n - 1])).toBeLessThanOrEqual(worst * 1.5 + 1e-4);
  });

  it('is deterministic', () => {
    const again = renderMusic();
    let differing = 0;
    for (let i = 0; i < samples.length; i++) if (again[i] !== samples[i]) differing++;
    expect(differing).toBe(0);
  });
});
