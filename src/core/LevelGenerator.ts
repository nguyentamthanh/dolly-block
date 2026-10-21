// Builds packing puzzles backwards from a known tiling. Ports scripts/core/LevelGenerator.gd.
//
//  1. Grow random polyominoes until the grid is full. That tiling IS the answer.
//  2. Colour adjacent pieces differently so the blobs stay readable.
//  3. Give some pieces a feeling already true of that arrangement.
//  4. Lift some pieces into the tray. Putting them back is, by construction, a valid solution.
//
// Levels are seeded by index (Godot hash + PCG32), so every index always yields the same puzzle.
// Dictionaries from the GDScript are Maps here: iteration order (insertion order) feeds the RNG draws.
//
// Turning pieces is a later skill: levels before ROTATE_FROM_LEVEL are generated and solved with every piece fixed
// in its tray orientation, and from there on the tray pieces start turned, so the player really has to rotate.

import { NEIGHBOUR_OFFSETS } from './BoardState';
import { godotSortCustom } from './godotSort';
import { LevelData } from './LevelData';
import { PALETTE_COUNT, allHues } from './Palette';
import { Mood, PieceData, v, type MoodValue, type Vec } from './PieceData';
import { Pcg32, godotStringHash } from './Rng';
import { Solver } from './Solver';

/** Bump when the tiers or the generator change: any saved in-progress run from an older version is dropped. */
export const VERSION = 5;
/** Index (0-based) of the first level where pieces can be rotated: the game's "level 10". */
export const ROTATE_FROM_LEVEL = 9;
/** solution_count of a candidate whose search ran out of budget. */
export const UNKNOWN_SOLUTIONS = 99;

export interface TierConfig {
  name: string;
  w: number;
  h: number;
  min_sz: number;
  max_sz: number;
  tray: number;
  neutral: number;
  max_solutions: number;
  budget: number;
  attempts: number;
}

export const TIERS: readonly TierConfig[] = [
  { name: 'Warm-up', w: 5, h: 5, min_sz: 2, max_sz: 5, tray: 5, neutral: 0.35, max_solutions: 3, budget: 20_000, attempts: 12 },
  { name: 'Cozy', w: 6, h: 6, min_sz: 3, max_sz: 5, tray: 7, neutral: 0.25, max_solutions: 2, budget: 8_000, attempts: 10 },
  { name: 'Tricky', w: 7, h: 7, min_sz: 3, max_sz: 6, tray: 9, neutral: 0.18, max_solutions: 1, budget: 3_000, attempts: 8 },
  { name: 'Tangled', w: 7, h: 8, min_sz: 3, max_sz: 6, tray: 11, neutral: 0.12, max_solutions: 1, budget: 3_000, attempts: 8 },
  { name: 'Nightmare', w: 7, h: 9, min_sz: 3, max_sz: 6, tray: 13, neutral: 0.08, max_solutions: 1, budget: 3_000, attempts: 8 },
];

export interface Stage {
  from: number;
  len: number;
  tier: number;
  /** Board size when the stage is smaller than its tier's board (the opening levels). */
  w?: number;
  h?: number;
  min_sz: number;
  max_sz: number;
  tray_a: number;
  tray_b: number;
  neutral_a: number;
  neutral_b: number;
  max_solutions: number;
  budget: number;
  attempts: number;
}

/**
 * The difficulty ramp: tiny feeling-free boards first, then bigger boards, more pieces in the tray and fewer
 * neutral pieces. The last stage holds its final values for every level after it.
 */
export const STAGES: readonly Stage[] = [
  // Levels 1-3: a 4x4 board and one or two loose pieces, nobody has feelings yet.
  { from: 0, len: 3, tier: 0, w: 4, h: 4, min_sz: 3, max_sz: 5, tray_a: 1, tray_b: 2, neutral_a: 1, neutral_b: 1, max_solutions: 6, budget: 20_000, attempts: 3 },
  // 4-7: a taller board, three loose pieces by the end, the first pieces with a feeling.
  { from: 3, len: 4, tier: 0, w: 4, h: 5, min_sz: 3, max_sz: 5, tray_a: 2, tray_b: 3, neutral_a: 1, neutral_b: 0.8, max_solutions: 5, budget: 20_000, attempts: 4 },
  // 8-10: the 5x5 board, still mostly neutral. Level 10 is where turning pieces arrives.
  { from: 7, len: 3, tier: 0, min_sz: 3, max_sz: 5, tray_a: 3, tray_b: 3, neutral_a: 0.8, neutral_b: 0.7, max_solutions: 4, budget: 20_000, attempts: 6 },
  { from: 10, len: 6, tier: 0, min_sz: 2, max_sz: 5, tray_a: 3, tray_b: 4, neutral_a: 0.65, neutral_b: 0.5, max_solutions: 4, budget: 20_000, attempts: 12 },
  { from: 16, len: 8, tier: 0, min_sz: 2, max_sz: 5, tray_a: 4, tray_b: 5, neutral_a: 0.5, neutral_b: 0.35, max_solutions: 3, budget: 20_000, attempts: 12 },
  { from: 24, len: 8, tier: 1, min_sz: 3, max_sz: 5, tray_a: 4, tray_b: 6, neutral_a: 0.38, neutral_b: 0.3, max_solutions: 3, budget: 8_000, attempts: 10 },
  { from: 32, len: 14, tier: 1, min_sz: 3, max_sz: 5, tray_a: 6, tray_b: 8, neutral_a: 0.28, neutral_b: 0.22, max_solutions: 2, budget: 8_000, attempts: 10 },
  { from: 46, len: 20, tier: 2, min_sz: 3, max_sz: 6, tray_a: 6, tray_b: 9, neutral_a: 0.25, neutral_b: 0.18, max_solutions: 2, budget: 5_000, attempts: 8 },
  { from: 66, len: 26, tier: 3, min_sz: 3, max_sz: 6, tray_a: 8, tray_b: 11, neutral_a: 0.18, neutral_b: 0.12, max_solutions: 1, budget: 3_000, attempts: 8 },
  { from: 92, len: 36, tier: 4, min_sz: 3, max_sz: 6, tray_a: 10, tray_b: 13, neutral_a: 0.12, neutral_b: 0.08, max_solutions: 1, budget: 3_000, attempts: 8 },
];

export function stageForLevel(levelIndex: number): Stage {
  let stage = STAGES[0];
  for (const s of STAGES) if (levelIndex >= s.from) stage = s;
  return stage;
}

export function tierForLevel(levelIndex: number): number {
  return stageForLevel(levelIndex).tier;
}

/** Can the player turn pieces on this level? */
export function rotationUnlocked(levelIndex: number): boolean {
  return levelIndex >= ROTATE_FROM_LEVEL;
}

/**
 * Share of the tray that starts turned away from its answer. Zero while turning is locked; the first rotation levels
 * turn a single piece, then most of the tray, then all of it.
 */
export function scrambleShare(levelIndex: number): number {
  if (!rotationUnlocked(levelIndex)) return 0;
  const k = levelIndex - ROTATE_FROM_LEVEL;
  if (k < 3) return 0.34;
  if (k < 10) return 0.67;
  return 1;
}

const clampf = (x: number, lo: number, hi: number): number => Math.min(Math.max(x, lo), hi);
const lerpf = (a: number, b: number, t: number): number => a + (b - a) * t;
/** Godot roundi: half away from zero. */
const roundi = (x: number): number => (x < 0 ? -Math.round(-x) : Math.round(x));

/** What to build for `levelIndex`: a TIERS-shaped config. With `overrideTier` it is that tier's fixed config. */
export function configForLevel(levelIndex: number, overrideTier = -1): TierConfig {
  if (overrideTier >= 0) return TIERS[overrideTier];
  const stage = stageForLevel(levelIndex);
  const t = clampf((levelIndex - stage.from) / Math.max(stage.len - 1, 1), 0, 1);
  return {
    ...TIERS[stage.tier],
    w: stage.w ?? TIERS[stage.tier].w,
    h: stage.h ?? TIERS[stage.tier].h,
    min_sz: stage.min_sz,
    max_sz: stage.max_sz,
    tray: roundi(lerpf(stage.tray_a, stage.tray_b, t)),
    neutral: lerpf(stage.neutral_a, stage.neutral_b, t),
    max_solutions: stage.max_solutions,
    budget: stage.budget,
    attempts: stage.attempts,
  };
}

export function seedForLevel(levelIndex: number): number {
  return godotStringHash(`dolly-blocks/v${VERSION}/${levelIndex}`);
}

const cellKey = (c: Vec): number => c.y * 64 + c.x;

interface MoodRec {
  mood: MoodValue;
  target: number;
}

export class LevelGenerator {
  generate(levelIndex: number, overrideTier = -1): LevelData | null {
    const tier = overrideTier >= 0 ? overrideTier : tierForLevel(levelIndex);
    const cfg = configForLevel(levelIndex, overrideTier);
    const rng = new Pcg32(seedForLevel(levelIndex));
    // The fixed-tier levels the tests build always allow turning.
    const rotate = overrideTier >= 0 || rotationUnlocked(levelIndex);
    // Keep the candidate with the fewest solutions; stop at the first one that is hard enough. Every
    // candidate is solvable by construction, so a result always exists even when none meets max_solutions.
    let best: LevelData | null = null;
    for (let a = 0; a < cfg.attempts; a++) {
      const lv = this.attempt(rng, cfg, rotate);
      if (lv === null) continue;
      if (best === null || lv.solutionCount < best.solutionCount) best = lv;
      // A search too deep to finish is hard enough; don't pay for more tries.
      if (lv.solutionCount <= cfg.max_solutions || lv.solutionCount === UNKNOWN_SOLUTIONS) break;
    }
    if (best === null) {
      console.error(`LevelGenerator: no candidate survived for level ${levelIndex}`);
      return null;
    }
    best.levelIndex = levelIndex;
    best.tier = tier;
    best.rngSeed = seedForLevel(levelIndex);
    if (overrideTier < 0) this.scramble(best, scrambleShare(levelIndex));
    return best;
  }

  /**
   * Turn some tray pieces away from their answer, so levels with rotation really ask for it. Uses its own
   * generator: the puzzle itself is the same with or without the turns.
   */
  private scramble(lv: LevelData, share: number): void {
    if (share <= 0) return;
    const rng = new Pcg32((seedForLevel(lv.levelIndex) ^ 0x5bd1e995) >>> 0);
    const turnable = lv.trayPieces.filter((p) => p.uniqueRots().length > 1);
    const want = Math.min(turnable.length, Math.max(1, Math.round(share * lv.trayPieces.length)));
    for (let i = turnable.length - 1; i > 0; i--) {
      const j = rng.randiRange(0, i);
      [turnable[i], turnable[j]] = [turnable[j], turnable[i]];
    }
    for (const p of turnable.slice(0, want)) {
      const others = p.uniqueRots().filter((r) => r !== 0);
      p.rot = others[rng.randiRange(0, others.length - 1)];
    }
  }

  private attempt(rng: Pcg32, cfg: TierConfig, rotate: boolean): LevelData | null {
    const { w, h } = cfg;
    const groups = this.growTiling(w, h, rng, cfg.min_sz, cfg.max_sz);
    if (groups.length === 0) return null;

    const colors = this.colour(groups, rng);
    const moods = this.assignMoods(groups, colors, rng, cfg.neutral);

    const pieces: PieceData[] = groups.map((cells, i) => PieceData.fromWorld(i, colors[i], cells, moods[i].mood, moods[i].target));

    let trayN = Math.min(cfg.tray, pieces.length - 1);
    if (trayN < 1) trayN = 1;
    // Shuffle, then prefer pieces that have a feeling so the tray is where the puzzle actually lives.
    // Godot's sort_custom is not stable above 16 elements; godotSortCustom reproduces it.
    const order: number[] = pieces.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = rng.randiRange(0, i);
      const tmp = order[i];
      order[i] = order[j];
      order[j] = tmp;
    }
    godotSortCustom(order, (a, b) => Number(pieces[a].mood !== Mood.NEUTRAL) > Number(pieces[b].mood !== Mood.NEUTRAL));

    const tray: PieceData[] = [];
    const fixed: PieceData[] = [];
    order.forEach((idx, i) => (i < trayN ? tray : fixed).push(pieces[idx]));

    const lv = new LevelData();
    lv.width = w;
    lv.height = h;
    lv.fixedPieces = fixed;
    lv.trayPieces = tray;
    lv.turnBudget = 15 + tray.length * 7;

    const solver = new Solver(rotate);
    const state = lv.buildState();
    let count = solver.countSolutions(state, lv.trayCopy(), 4, cfg.budget);
    if (solver.aborted) {
      // Too big to count: the tray came from a real tiling, so it is solvable, and a search this deep
      // is hard. Rank it below any proven candidate.
      count = UNKNOWN_SOLUTIONS;
    } else if (count < 1) {
      return null;
    }
    lv.solutionCount = count;
    lv.searchCost = solver.nodes;
    return lv;
  }

  private growTiling(w: number, h: number, rng: Pcg32, minSz: number, maxSz: number): Vec[][] {
    const empty = new Map<number, Vec>();
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) empty.set(cellKey(v(x, y)), v(x, y));
    const groups: Vec[][] = [];
    while (empty.size > 0) {
      const keys = Array.from(empty.values());
      const start = keys[rng.randiRange(0, keys.length - 1)];
      const remaining = empty.size;
      let target = rng.randiRange(minSz, maxSz);
      if (remaining <= maxSz) target = remaining;
      const cells: Vec[] = [start];
      empty.delete(cellKey(start));
      while (cells.length < target) {
        const frontier: Vec[] = [];
        const seen = new Set<number>();
        for (const c of cells) {
          for (const off of NEIGHBOUR_OFFSETS) {
            const n = v(c.x + off.x, c.y + off.y);
            const k = cellKey(n);
            if (empty.has(k) && !seen.has(k)) {
              seen.add(k);
              frontier.push(n);
            }
          }
        }
        if (frontier.length === 0) break;
        const pick = frontier[rng.randiRange(0, frontier.length - 1)];
        cells.push(pick);
        empty.delete(cellKey(pick));
      }
      groups.push(cells);
    }
    return groups;
  }

  private owners(groups: readonly Vec[][]): Map<number, number> {
    const owner = new Map<number, number>();
    groups.forEach((g, i) => g.forEach((c) => owner.set(cellKey(c), i)));
    return owner;
  }

  private colour(groups: readonly Vec[][], rng: Pcg32): number[] {
    const owner = this.owners(groups);
    const adj: Set<number>[] = groups.map(() => new Set<number>());
    groups.forEach((g, i) => {
      for (const c of g) {
        for (const off of NEIGHBOUR_OFFSETS) {
          const o = owner.get(cellKey(v(c.x + off.x, c.y + off.y)));
          if (o !== undefined && o !== i) adj[i].add(o);
        }
      }
    });

    const colors: number[] = new Array<number>(groups.length).fill(0);
    for (let i = 0; i < groups.length; i++) {
      const used = new Set<number>();
      for (const nb of adj[i]) if (nb < i) used.add(colors[nb]);
      let choices: number[] = [];
      for (let hue = 0; hue < PALETTE_COUNT; hue++) if (!used.has(hue)) choices.push(hue);
      if (choices.length === 0) choices = allHues();
      colors[i] = choices[rng.randiRange(0, choices.length - 1)];
    }
    return colors;
  }

  private assignMoods(groups: readonly Vec[][], colors: readonly number[], rng: Pcg32, neutral: number): MoodRec[] {
    const owner = this.owners(groups);
    const neighbourColors: Map<number, true>[] = groups.map((g, i) => {
      const cols = new Map<number, true>();
      for (const c of g) {
        for (const off of NEIGHBOUR_OFFSETS) {
          const o = owner.get(cellKey(v(c.x + off.x, c.y + off.y)));
          if (o !== undefined && o !== i) cols.set(colors[o], true);
        }
      }
      return cols;
    });

    const used = new Map<number, true>();
    for (const c of colors) used.set(c, true);

    const out: MoodRec[] = [];
    for (let i = 0; i < groups.length; i++) {
      const rec: MoodRec = { mood: Mood.NEUTRAL, target: 0 };
      if (rng.randf() < neutral) {
        out.push(rec);
        continue;
      }
      const friends: number[] = [];
      for (const col of neighbourColors[i].keys()) if (col !== colors[i]) friends.push(col);
      const foes: number[] = [];
      for (const col of used.keys()) if (col !== colors[i] && !neighbourColors[i].has(col)) foes.push(col);
      const roll = rng.randf();
      if (roll < 0.65 && friends.length > 0) {
        rec.mood = Mood.AFFECTIONATE;
        rec.target = friends[rng.randiRange(0, friends.length - 1)];
      } else if (foes.length > 0) {
        rec.mood = Mood.HOSTILE;
        rec.target = foes[rng.randiRange(0, foes.length - 1)];
      }
      out.push(rec);
    }
    return out;
  }
}
