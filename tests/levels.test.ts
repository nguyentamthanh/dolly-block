import { describe, expect, it } from 'vitest';
import fixtures from './fixtures/godot_fixtures.json';
import { LevelGenerator, seedForLevel } from '../src/core/LevelGenerator';
import { Solver } from '../src/core/Solver';

describe('LevelGenerator reproduces the Godot levels', () => {
  it('seed_for_level matches', () => {
    fixtures.hash
      .filter((h) => h.s.startsWith('dolly-blocks/v4/'))
      .forEach((h) => expect(seedForLevel(Number(h.s.split('/')[2]))).toBe(h.h));
  });

  it('levels 0..149 are identical to Godot (byte-for-byte after to_dict)', () => {
    fixtures.levels.forEach((expected, i) => {
      const lv = new LevelGenerator().generate(i);
      expect(lv, `level ${i}`).not.toBeNull();
      expect(lv!.toDict(), `level ${i}`).toEqual(expected);
    });
  }, 120_000);

  it('tier-override levels match', () => {
    for (const { override_tier, ...expected } of fixtures.tier_levels) {
      const lv = new LevelGenerator().generate(expected.level_index, override_tier);
      expect(lv!.toDict(), `tier ${override_tier} level ${expected.level_index}`).toEqual(expected);
    }
  }, 120_000);
});

describe('Solver matches Godot', () => {
  it('first solution (hint) and solution counts', () => {
    for (const rec of fixtures.solves) {
      const lv = new LevelGenerator().generate(rec.level)!;
      const solver = new Solver();
      const found = solver.solve(lv.buildState(), lv.trayCopy());
      expect(found !== null, `level ${rec.level} found`).toBe(rec.found);
      expect(solver.nodes, `level ${rec.level} nodes`).toBe(rec.nodes);
      expect(solver.aborted, `level ${rec.level} aborted`).toBe(rec.aborted);
      if (found && rec.placed) {
        const placed = found.placedIds().map((id) => {
          const p = found.getPlaced(id)!;
          return { id, rot: p.piece.rot, ox: p.origin.x, oy: p.origin.y };
        });
        expect(placed, `level ${rec.level} placed`).toEqual(rec.placed);
        expect(found.snapshot(), `level ${rec.level} snapshot`).toEqual(rec.snapshot);
      }
      const s2 = new Solver();
      const count = s2.countSolutions(lv.buildState(), lv.trayCopy(), 4, 20000);
      expect(count, `level ${rec.level} count4`).toBe(rec.count4);
      expect(s2.nodes, `level ${rec.level} count nodes`).toBe(rec.count_nodes);
      expect(s2.aborted, `level ${rec.level} count aborted`).toBe(rec.count_aborted);
    }
  }, 120_000);
});
