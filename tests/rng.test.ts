import { describe, expect, it } from 'vitest';
import fixtures from './fixtures/godot_fixtures.json';
import { godotStringHash, Pcg32 } from '../src/core/Rng';
import { godotSortCustom } from '../src/core/godotSort';

describe('Godot hash(String)', () => {
  it('matches djb2 fixtures', () => {
    for (const { s, h } of fixtures.hash) expect(godotStringHash(s), s).toBe(h);
  });
});

describe('Godot RandomNumberGenerator (PCG32)', () => {
  it('randi()', () => {
    for (const rec of fixtures.rng) {
      const r = new Pcg32(rec.seed);
      expect(rec.randi.map(() => r.nextU32()), `seed ${rec.seed}`).toEqual(rec.randi);
    }
  });

  it('randf()', () => {
    for (const rec of fixtures.rng) {
      const r = new Pcg32(rec.seed);
      const got = rec.randf.map(() => r.randf());
      got.forEach((v, i) => expect(v, `seed ${rec.seed} #${i}`).toBeCloseTo(rec.randf[i], 12));
    }
  });

  it('randi_range()', () => {
    for (const rec of fixtures.rng) {
      let r = new Pcg32(rec.seed);
      expect(rec.range_0_9.map(() => r.randiRange(0, 9)), `0..9 seed ${rec.seed}`).toEqual(rec.range_0_9);
      r = new Pcg32(rec.seed);
      expect(rec.range_2_6.map(() => r.randiRange(2, 6)), `2..6 seed ${rec.seed}`).toEqual(rec.range_2_6);
    }
  });

  it('interleaved draws like the generator', () => {
    for (const rec of fixtures.rng) {
      const r = new Pcg32(rec.seed);
      const got: number[] = [];
      for (let i = 0; i < 50; i++) {
        got.push(r.randiRange(0, 62 - (i % 40)));
        got.push(r.randf());
        got.push(r.randiRange(3, 5));
        got.push(r.randiRange(0, 0));
      }
      got.forEach((v, i) => expect(v, `seed ${rec.seed} #${i}`).toBeCloseTo(rec.mixed[i], 12));
    }
  });
});

describe('Godot sort_custom', () => {
  it('reproduces the (unstable above 16) ordering', () => {
    for (const t of fixtures.sort) {
      const order = [...t.input];
      godotSortCustom(order, (a, b) => Number(t.moods[a] !== 0) > Number(t.moods[b] !== 0));
      expect(order).toEqual(t.output);
    }
  });
});
