import { describe, expect, it } from 'vitest';
import audio from './fixtures/godot_audio.json';
import { synth } from '../src/audio/sfxSynth';

describe('procedural sfx', () => {
  for (const [name, expected] of Object.entries(audio as Record<string, number[]>)) {
    it(`${name} matches Godot's samples`, () => {
      const got = synth(name);
      expect(got.length).toBe(expected.length);
      let maxDiff = 0;
      for (let i = 0; i < got.length; i++) maxDiff = Math.max(maxDiff, Math.abs(got[i] - expected[i]));
      // float32 randf_range in the noise filter is the only place doubles could drift by an LSB or two.
      expect(maxDiff).toBeLessThanOrEqual(2);
    });
  }
});
