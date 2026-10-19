// One packing puzzle: board size, pieces already on the board, pieces in the tray and the scoring
// budget. Ports scripts/core/LevelData.gd (polyomino path only).

import { BoardState } from './BoardState';
import { Mood, PieceData, v, type MoodValue, type Vec } from './PieceData';

export interface PieceDict {
  id: number;
  color: number;
  mood: number;
  target: number;
  cells: [number, number][];
}

export interface LevelDict {
  width: number;
  height: number;
  blocked_cells: [number, number][];
  fixed_pieces: PieceDict[];
  tray_pieces: PieceDict[];
  level_index: number;
  tier: number;
  rng_seed: number;
  solution_count: number;
  search_cost: number;
  turn_budget: number;
}

export class LevelData {
  width = 0;
  height = 0;
  blockedCells: Vec[] = [];
  fixedPieces: PieceData[] = [];
  trayPieces: PieceData[] = [];
  turnBudget = 36;

  levelIndex = 0;
  tier = 0;
  rngSeed = 0;
  solutionCount = 0;
  searchCost = 0;

  buildState(): BoardState {
    const s = new BoardState(this.width, this.height, this.blockedCells);
    for (const p of this.fixedPieces) s.placePiece(p, p.orientToSolution());
    return s;
  }

  trayCopy(): PieceData[] {
    return this.trayPieces.map((p) => p.duplicatePiece());
  }

  allPieces(): PieceData[] {
    return [...this.fixedPieces, ...this.trayPieces];
  }

  toDict(): LevelDict {
    const piece = (p: PieceData): PieceDict => ({
      id: p.id,
      color: p.color,
      mood: p.mood,
      target: p.targetColor,
      cells: p.solutionWorld.map((c) => [c.x, c.y] as [number, number]),
    });
    return {
      width: this.width,
      height: this.height,
      blocked_cells: this.blockedCells.map((c) => [c.x, c.y] as [number, number]),
      fixed_pieces: this.fixedPieces.map(piece),
      tray_pieces: this.trayPieces.map(piece),
      level_index: this.levelIndex,
      tier: this.tier,
      rng_seed: this.rngSeed,
      solution_count: this.solutionCount,
      search_cost: this.searchCost,
      turn_budget: this.turnBudget,
    };
  }

  static fromDict(d: Partial<LevelDict>): LevelData {
    const lv = new LevelData();
    lv.width = Math.trunc(d.width ?? 0);
    lv.height = Math.trunc(d.height ?? 0);
    lv.blockedCells = (d.blocked_cells ?? []).filter((e) => e.length >= 2).map((e) => v(Math.trunc(e[0]), Math.trunc(e[1])));
    const readPieces = (arr: PieceDict[] | undefined): PieceData[] =>
      (arr ?? []).map((e) => {
        const color = Math.trunc(e.color ?? 0);
        const mood = Math.trunc(e.mood ?? 0) as MoodValue;
        const target = Math.trunc(e.target ?? 0);
        const id = Math.trunc(e.id ?? 0);
        const world = (e.cells ?? []).filter((ce) => ce.length >= 2).map((ce) => v(Math.trunc(ce[0]), Math.trunc(ce[1])));
        return world.length > 0
          ? PieceData.fromWorld(id, color, world, mood, target)
          : PieceData.make(id, color, [v(0, 0)], mood ?? Mood.NEUTRAL, target);
      });
    lv.fixedPieces = readPieces(d.fixed_pieces);
    lv.trayPieces = readPieces(d.tray_pieces);
    lv.levelIndex = Math.trunc(d.level_index ?? 0);
    lv.tier = Math.trunc(d.tier ?? 0);
    lv.rngSeed = Math.trunc(d.rng_seed ?? 0);
    lv.solutionCount = Math.trunc(d.solution_count ?? 0);
    lv.searchCost = Math.trunc(d.search_cost ?? 0);
    lv.turnBudget = Math.trunc(d.turn_budget ?? 36);
    return lv;
  }
}
