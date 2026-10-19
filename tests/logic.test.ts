// Port of tests/run_tests.gd (pure-logic suite). The legacy single-cell BlockData tests use 1-cell
// PieceData here; the fixture tests (levels.test.ts) pin the generator and solver to Godot's output.

import { beforeEach, describe, expect, it } from 'vitest';
import { BoardState } from '../src/core/BoardState';
import { GameState } from '../src/core/GameState';
import { LevelData } from '../src/core/LevelData';
import { LevelGenerator, STAGES, TIERS, tierForLevel } from '../src/core/LevelGenerator';
import { CODES, Loc, NAMES, TEXTS } from '../src/core/Loc';
import { Hue as H } from '../src/core/Palette';
import { Mood as M, PieceData, v, type MoodValue } from '../src/core/PieceData';
import { Solver } from '../src/core/Solver';

let nextId = 1;
const block = (color: number, mood: MoodValue = M.NEUTRAL, target = 0): PieceData =>
  PieceData.make(nextId++, color, [v(0, 0)], mood, target);
const put = (b: BoardState, x: number, y: number, p: PieceData): boolean => b.placePiece(p, v(x, y));

beforeEach(() => {
  GameState.reset();
  Loc.platformLang = '';
});

describe('Loc', () => {
  it('every key is translated into every language', () => {
    for (const [key, row] of Object.entries(TEXTS)) {
      expect(row.length, key).toBe(CODES.length);
      row.forEach((text, i) => {
        expect(text.trim().length, `${key} [${CODES[i]}]`).toBeGreaterThan(0);
        expect((text.match(/%d/g) ?? []).length, `${key} [${CODES[i]}] placeholders`).toBe((row[0].match(/%d/g) ?? []).length);
      });
    }
    expect(Object.keys(NAMES).length).toBe(CODES.length);
  });

  it('normalizes and resolves languages', () => {
    expect(Loc.normalize('pt-BR')).toBe('pt');
    expect(Loc.normalize('RU')).toBe('ru');
    expect(Loc.normalize('zh')).toBe('');
    expect(Loc.normalize('')).toBe('');
    Loc.platformLang = 'ru';
    expect(Loc.current()).toBe('ru');
    expect(Loc.t('play')).toBe('ИГРАТЬ');
    Loc.platformLang = 'vi';
    expect(Loc.current()).toBe('en');
    GameState.language = 'de';
    expect(Loc.current()).toBe('de');
    GameState.language = '';
    Loc.platformLang = '';
    expect(Loc.current()).toBe('en');
    expect(Loc.t('play')).toBe('PLAY');
  });

  it('formats %d placeholders', () => {
    expect(Loc.fmt('level_n', 5)).toBe('Level 5');
    expect(Loc.fmt('gems_plus', 10)).toBe('+10 gems!');
  });
});

describe('BoardState', () => {
  it('geometry', () => {
    const b = new BoardState(3, 2, [v(1, 1)]);
    expect(b.isPlayable(v(0, 0))).toBe(true);
    expect(b.isPlayable(v(1, 1))).toBe(false);
    expect(b.isPlayable(v(3, 0))).toBe(false);
    expect(b.playableCells().length).toBe(5);
    const n = b.neighbours(v(1, 0));
    expect(n.some((c) => c.x === 1 && c.y === 1)).toBe(false);
    expect(n.length).toBe(2);
  });

  it('hostile blocks', () => {
    const b = new BoardState(2, 1, []);
    const hostile = block(H.PINK, M.HOSTILE, H.MINT);
    put(b, 0, 0, hostile);
    expect(b.pieceViolated(hostile.id)).toBe(false);
    const mint = block(H.MINT);
    put(b, 1, 0, mint);
    expect(b.pieceViolated(hostile.id)).toBe(true);
    expect(b.pieceSatisfied(hostile.id)).toBe(false);
    b.removePiece(mint.id);
    put(b, 1, 0, block(H.BLUE));
    expect(b.pieceViolated(hostile.id)).toBe(false);
    expect(b.pieceSatisfied(hostile.id)).toBe(true);
  });

  it('affectionate blocks: hope vs despair', () => {
    const b = new BoardState(3, 1, []);
    const lover = block(H.PINK, M.AFFECTIONATE, H.MINT);
    put(b, 0, 0, lover);
    expect(b.pieceSatisfied(lover.id)).toBe(false);
    expect(b.pieceViolated(lover.id)).toBe(false); // a friend may still arrive
    const wrong = block(H.YELLOW);
    put(b, 1, 0, wrong);
    expect(b.pieceViolated(lover.id)).toBe(true);
    b.removePiece(wrong.id);
    put(b, 1, 0, block(H.MINT));
    expect(b.pieceSatisfied(lover.id)).toBe(true);
    expect(b.pieceViolated(lover.id)).toBe(false);

    const d = new BoardState(2, 2, []);
    const dl = block(H.PINK, M.AFFECTIONATE, H.MINT);
    put(d, 0, 0, dl);
    put(d, 1, 1, block(H.MINT));
    expect(d.pieceSatisfied(dl.id)).toBe(false); // diagonals do not count
  });

  it('win condition needs a full board', () => {
    const b = new BoardState(2, 1, []);
    put(b, 0, 0, block(H.PINK));
    expect(b.isSolved()).toBe(false);
    put(b, 1, 0, block(H.BLUE));
    expect(b.isSolved()).toBe(true);
  });
});

describe('Solver', () => {
  it('hand-built boards with known answers', () => {
    const s = new Solver();
    const tray1 = () => [block(H.PINK, M.AFFECTIONATE, H.MINT), block(H.MINT)];
    expect(s.countSolutions(new BoardState(2, 1, []), tray1(), 10)).toBe(2);

    const tray2 = [block(H.PINK, M.HOSTILE, H.MINT), block(H.MINT)];
    expect(s.countSolutions(new BoardState(2, 1, []), tray2, 10)).toBe(0);
    expect(s.hasSolution(new BoardState(2, 1, []), tray2)).toBe(false);

    expect(s.countSolutions(new BoardState(2, 1, []), [block(H.PINK)], 10)).toBe(0);

    const b4 = new BoardState(3, 1, []);
    put(b4, 0, 0, block(H.PINK, M.HOSTILE, H.MINT));
    put(b4, 1, 0, block(H.MINT));
    expect(s.countSolutions(b4, [block(H.BLUE)], 10)).toBe(0);

    const filled = s.solve(new BoardState(2, 1, []), tray1());
    expect(filled !== null && filled.isSolved()).toBe(true);
  });

  it('count with a big cap agrees with cap 2 (deduplication sanity)', () => {
    const gen = new LevelGenerator();
    const s = new Solver();
    let checked = 0;
    for (let i = 0; i < 12; i++) {
      const lv = gen.generate(i, 0)!;
      if (lv.trayPieces.length > 7) continue;
      const c1 = s.countSolutions(lv.buildState(), lv.trayCopy(), 100000);
      const c2 = s.countSolutions(lv.buildState(), lv.trayCopy(), 2);
      checked++;
      if (c1 >= 2) expect(c2, `level ${i}`).toBe(2);
      else expect(c2, `level ${i}`).toBe(c1);
    }
    expect(checked).toBeGreaterThan(0);
  });
});

describe('LevelGenerator', () => {
  it('every emitted level is solvable', () => {
    const gen = new LevelGenerator();
    const s = new Solver();
    let total = 0;
    let counted = 0;
    let loose = 0;
    let trivial = 0;
    for (let tier = 0; tier < TIERS.length; tier++) {
      const perTier = tier <= 1 ? 40 : 5;
      for (let i = 0; i < perTier; i++) {
        const idx = tier * 1000 + i;
        const lv = gen.generate(idx, tier)!;
        total++;
        expect(lv, `level ${idx}`).not.toBeNull();
        const st = lv.buildState();
        for (const p of lv.trayCopy()) st.placePiece(p, p.orientToSolution());
        expect(st.isSolved(), `level ${idx} tier ${tier} solved by construction`).toBe(true);
        if (tier <= 1) expect(s.hasSolution(lv.buildState(), lv.trayCopy()), `level ${idx}`).toBe(true);
        expect([lv.width, lv.height]).toEqual([TIERS[tier].w, TIERS[tier].h]);
        if (tier <= 1) {
          counted++;
          if (lv.solutionCount > TIERS[tier].max_solutions) loose++;
        }
        if (lv.searchCost <= lv.trayPieces.length) trivial++;
      }
    }
    expect(loose).toBeLessThanOrEqual(counted / 10);
    expect(trivial).toBeLessThanOrEqual(total / 4);
  });

  it('difficulty eases up level by level', () => {
    const gen = new LevelGenerator();
    const s = new Solver();
    let prevTray = 0;
    let drops = 0;
    for (let i = 0; i < 90; i++) {
      const lv = gen.generate(i)!;
      expect(lv, `level ${i}`).not.toBeNull();
      const st = lv.buildState();
      for (const p of lv.trayCopy()) st.placePiece(p, p.orientToSolution());
      expect(st.isSolved(), `level ${i}`).toBe(true);
      if (i < 3) {
        expect(lv.trayPieces.length, `level ${i} intro tray`).toBeLessThanOrEqual(3);
        expect(lv.width).toBe(5);
      }
      if (i < 8) expect(s.hasSolution(lv.buildState(), lv.trayCopy()), `level ${i}`).toBe(true);
      if (lv.trayPieces.length < prevTray) drops++;
      prevTray = lv.trayPieces.length;
    }
    expect(drops).toBeLessThanOrEqual(STAGES.length - 1);
    expect(tierForLevel(0)).toBe(0);
    expect(tierForLevel(200)).toBe(4);
  });

  it('is deterministic and survives a to_dict/from_dict round trip', () => {
    const a = new LevelGenerator().generate(37)!;
    const b = new LevelGenerator().generate(37)!;
    expect(JSON.stringify(a.toDict())).toBe(JSON.stringify(b.toDict()));
    const restored = LevelData.fromDict(a.toDict());
    expect(JSON.stringify(restored.toDict())).toBe(JSON.stringify(a.toDict()));
  });
});

describe('GameState', () => {
  it('round-trips the save JSON and keeps the Godot schema', () => {
    let saved = '';
    GameState.persist = (t) => (saved = t);
    GameState.completeLevel(0, 3, [{ color: 1, mood: 0, target: 0, cells: [[0, 0]], eye: [0, 0] }], 1);
    expect(GameState.highestUnlocked).toBe(1);
    expect(GameState.diamonds).toBe(GameState.START_DIAMONDS + GameState.CLEAR_REWARD);
    const parsed = JSON.parse(saved);
    expect(Object.keys(parsed).sort()).toEqual(
      ['diamonds', 'gift_day', 'highest_unlocked', 'language', 'photos', 'run', 'sound', 'stars_at', 'tutorial_done', 'unlocked_bgs'].sort(),
    );
    GameState.reset();
    GameState.loadFromText(saved);
    expect(GameState.highestUnlocked).toBe(1);
    expect(GameState.starsFor(0)).toBe(3);
    expect(GameState.photoFor(0)?.bg).toBe(1);
    expect(GameState.tutorialDone).toBe(false); // explicit value in the save is kept

    // Saves from before the tutorial existed have no key: a player past level 1 skips it.
    const legacy = JSON.parse(saved);
    delete legacy.tutorial_done;
    GameState.reset();
    GameState.loadFromText(JSON.stringify(legacy));
    expect(GameState.tutorialDone).toBe(true);
  });

  it('hints cost diamonds, gifts are daily, runs are tied to the generator version', () => {
    GameState.persist = () => {};
    expect(GameState.spendHint()).toBe(true);
    expect(GameState.diamonds).toBe(GameState.START_DIAMONDS - GameState.HINT_COST);
    GameState.today = () => 20260101;
    expect(GameState.openGift()).toBe(GameState.GIFT_AMOUNT);
    expect(GameState.openGift()).toBe(0);
    GameState.today = () => 20260102;
    expect(GameState.canGift()).toBe(true);
    GameState.saveRun({ level: 6, gen: 4, placed: [[1, 0, 0, 0]], rots: {}, hints: 0, undos: 0 });
    expect(GameState.runFor(6).level).toBe(6);
    expect(GameState.runFor(5)).toEqual({});
    GameState.saveRun({ level: 6, gen: 3 });
    expect(GameState.runFor(6)).toEqual({});
  });
});
