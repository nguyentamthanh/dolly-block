import { describe, expect, it } from 'vitest';
import { BoardState } from '../src/core/BoardState';
import { LevelGenerator, ROTATE_FROM_LEVEL, VERSION, rotationUnlocked, scrambleShare, seedForLevel } from '../src/core/LevelGenerator';
import { PieceData, v } from '../src/core/PieceData';
import { Solver } from '../src/core/Solver';

describe('level seeds', () => {
  it('are stable per index and change with the generator version', () => {
    expect(seedForLevel(5)).toBe(seedForLevel(5));
    expect(seedForLevel(5)).not.toBe(seedForLevel(6));
    expect(VERSION).toBeGreaterThanOrEqual(5);
  });
});

describe('levels before rotation unlocks', () => {
  it('start every tray piece in its answer orientation and solve without turning', () => {
    const gen = new LevelGenerator();
    for (let i = 0; i < ROTATE_FROM_LEVEL; i++) {
      const lv = gen.generate(i)!;
      expect(lv.trayPieces.every((p) => p.rot === 0), `level ${i} rots`).toBe(true);
      const found = new Solver(false).solve(lv.buildState(), lv.trayCopy());
      expect(found?.isSolved(), `level ${i} solvable without rotating`).toBe(true);
    }
  });

  it('the no-rotation solver refuses what needs a turn', () => {
    const bar = (id: number): PieceData => PieceData.make(id, 0, [v(0, 0), v(0, 1), v(0, 2)]); // vertical 1x3
    const flat = new BoardState(3, 1, []);
    expect(new Solver(false).countSolutions(flat, [bar(1)], 4)).toBe(0);
    expect(new Solver(true).countSolutions(flat, [bar(1)], 4)).toBe(1);
    const tall = new BoardState(1, 3, []);
    expect(new Solver(false).countSolutions(tall, [bar(1)], 4)).toBe(1);
  });
});

describe('levels with rotation', () => {
  it('unlock at level 10 (index 9) and start with turned pieces', () => {
    expect(ROTATE_FROM_LEVEL).toBe(9);
    expect(rotationUnlocked(8)).toBe(false);
    expect(rotationUnlocked(9)).toBe(true);
    expect(scrambleShare(8)).toBe(0);
    expect(scrambleShare(9)).toBeGreaterThan(0);
    expect(scrambleShare(60)).toBe(1);
    const gen = new LevelGenerator();
    for (let i = ROTATE_FROM_LEVEL; i < ROTATE_FROM_LEVEL + 30; i++) {
      const lv = gen.generate(i)!;
      const turnable = lv.trayPieces.filter((p) => p.uniqueRots().length > 1);
      if (turnable.length === 0) continue;
      const turned = lv.trayPieces.filter((p) => p.rot !== 0).length;
      expect(turned, `level ${i} turned`).toBeGreaterThanOrEqual(1);
      // The first rotation levels turn a single piece; the tray is a puzzle, not a chore.
      if (i === ROTATE_FROM_LEVEL) expect(turned).toBe(1);
      // Still winnable, from the turned start.
      expect(new Solver(true).hasSolution(lv.buildState(), lv.trayCopy()), `level ${i}`).toBe(true);
    }
  });

  it('turning does not change the puzzle itself', () => {
    const lv = new LevelGenerator().generate(ROTATE_FROM_LEVEL + 4)!;
    const st = lv.buildState();
    for (const p of lv.trayCopy()) st.placePiece(p, p.orientToSolution());
    expect(st.isSolved()).toBe(true);
  });
});
