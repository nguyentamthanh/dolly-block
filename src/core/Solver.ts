// Backtracking packer: which tray polyomino goes where, in which rotation. Ports scripts/core/Solver.gd, plus a
// no-rotation mode for the first levels, where the player can't turn pieces.
//
// MRV on pieces (fewest legal placements first) plus pruning on hostile violations. The node accounting,
// budget and tie-breaking mirror the GDScript exactly, because LevelGenerator accepts or rejects candidate
// puzzles based on `nodes` / `aborted`.
//
// Bitboard speed-up (boards of up to 63 cells): every (rotation, origin) of every tray piece becomes a
// cell mask once. Masks are two 32-bit words (lo = cells 0..31, hi = cells 32..62), no BigInt in the hot loop.

import { BoardState } from './BoardState';
import { PieceData, v, type Vec } from './PieceData';

export const DEFAULT_NODE_BUDGET = 40_000;

interface MaskCache {
  lo: Int32Array;
  hi: Int32Array;
  rots: Int32Array;
  ox: Int32Array;
  oy: Int32Array;
}

interface Option {
  rot: number;
  origin: Vec;
  lo: number;
  hi: number;
}

const DEAD: [number, Option[]] = [-1, []];

export class Solver {
  nodes = 0;
  aborted = false;

  private budget = DEFAULT_NODE_BUDGET;
  /** False on levels where the player can't turn pieces: each piece then keeps the rotation it comes with. */
  private rotate: boolean;
  private cap = 2;
  /** Solutions found so far; the search stops at `cap` total. */
  private total = 0;

  private cache = new Map<number, MaskCache>();
  private occLo = 0;
  private occHi = 0;
  private boardLo = 0;
  private boardHi = 0;
  private useMasks = false;

  constructor(rotate = true) {
    this.rotate = rotate;
  }

  /** The rotations worth trying for `piece`: all distinct shapes, or just the one it currently has. */
  private rotationsOf(piece: PieceData): number[] {
    return this.rotate ? piece.uniqueRots() : [piece.rot];
  }

  countSolutions(state: BoardState, tray: readonly PieceData[], cap = 2, budget = DEFAULT_NODE_BUDGET): number {
    this.nodes = 0;
    this.aborted = false;
    this.budget = budget;
    this.cap = cap;
    this.total = 0;
    const remaining = tray.map((p) => p.duplicatePiece());
    this.prepare(state, remaining);
    return this.search(state, remaining);
  }

  isSolvable(state: BoardState, tray: readonly PieceData[], budget = DEFAULT_NODE_BUDGET): boolean {
    return this.countSolutions(state, tray, 1, budget) >= 1;
  }

  hasSolution(state: BoardState, tray: readonly PieceData[], budget = DEFAULT_NODE_BUDGET): boolean {
    return this.isSolvable(state, tray, budget);
  }

  /** First solved board (a clone), or null when there is none or the budget ran out. */
  solve(state: BoardState, tray: readonly PieceData[], budget = DEFAULT_NODE_BUDGET): BoardState | null {
    this.nodes = 0;
    this.aborted = false;
    this.budget = budget;
    this.cap = 1;
    const remaining = tray.map((p) => p.duplicatePiece());
    const cloned = state.clone();
    this.prepare(cloned, remaining);
    return this.solveSearch(cloned, remaining);
  }

  /** Builds the placement masks for a search (see `cache`). */
  private prepare(state: BoardState, remaining: PieceData[]): void {
    this.cache.clear();
    this.occLo = 0;
    this.occHi = 0;
    this.useMasks = false;
    if (remaining.length === 0 || state.width * state.height > 63) return;
    this.useMasks = true;
    this.boardLo = 0;
    this.boardHi = 0;
    const { width, height } = state;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const b = y * width + x;
        if (b < 32) this.boardLo |= 1 << b;
        else this.boardHi |= 1 << (b - 32);
        if (!state.isEmptyAt(v(x, y))) {
          if (b < 32) this.occLo |= 1 << b;
          else this.occHi |= 1 << (b - 32);
        }
      }
    }
    for (const piece of remaining) {
      const lo: number[] = [];
      const hi: number[] = [];
      const rots: number[] = [];
      const ox: number[] = [];
      const oy: number[] = [];
      const savedRot = piece.rot;
      for (const r of this.rotationsOf(piece)) {
        piece.rot = r;
        const local = piece.localCells();
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            let mlo = 0;
            let mhi = 0;
            let inside = true;
            for (const c of local) {
              const cx = x + c.x;
              const cy = y + c.y;
              if (cx < 0 || cy < 0 || cx >= width || cy >= height) {
                inside = false;
                break;
              }
              const b = cy * width + cx;
              if (b < 32) mlo |= 1 << b;
              else mhi |= 1 << (b - 32);
            }
            if (inside) {
              lo.push(mlo);
              hi.push(mhi);
              rots.push(r);
              ox.push(x);
              oy.push(y);
            }
          }
        }
      }
      piece.rot = savedRot;
      this.cache.set(piece.id, {
        lo: Int32Array.from(lo),
        hi: Int32Array.from(hi),
        rots: Int32Array.from(rots),
        ox: Int32Array.from(ox),
        oy: Int32Array.from(oy),
      });
    }
  }

  /**
   * Which remaining piece to branch on, and its legal placements: [index, options], or [-1, []] when
   * this position is a dead end. With masks it is MRV on the cheap grid-only counts, so the costly mood
   * check runs for one piece per node, plus a dead-end test: every empty cell must still be reachable by
   * some fitting placement.
   */
  private pick(state: BoardState, remaining: PieceData[]): [number, Option[]] {
    if (!this.useMasks) {
      let bestI = 0;
      let bestOpts: Option[] = [];
      let bestN = 1_000_000;
      for (let i = 0; i < remaining.length; i++) {
        const opts = this.placements(state, remaining[i]);
        if (opts.length < bestN) {
          bestN = opts.length;
          bestI = i;
          bestOpts = opts;
          if (bestN === 0) return DEAD;
        }
      }
      return [bestI, bestOpts];
    }

    const emLo = this.boardLo & ~this.occLo;
    const emHi = this.boardHi & ~this.occHi;
    let coverLo = 0;
    let coverHi = 0;
    let bestPiece = -1;
    let bestFit = 1_000_000;
    let bestIdx: number[] = [];
    for (let i = 0; i < remaining.length; i++) {
      const e = this.cache.get(remaining[i].id)!;
      const idx: number[] = [];
      for (let k = 0; k < e.lo.length; k++) {
        if ((e.lo[k] & this.occLo) === 0 && (e.hi[k] & this.occHi) === 0) {
          idx.push(k);
          coverLo |= e.lo[k];
          coverHi |= e.hi[k];
        }
      }
      if (idx.length === 0) return DEAD;
      if (idx.length < bestFit) {
        bestFit = idx.length;
        bestPiece = i;
        bestIdx = idx;
      }
    }
    if ((coverLo & emLo) !== emLo || (coverHi & emHi) !== emHi) return DEAD;

    const chosen = remaining[bestPiece];
    const e = this.cache.get(chosen.id)!;
    const savedRot = chosen.rot;
    const out: Option[] = [];
    for (const k of bestIdx) {
      chosen.rot = e.rots[k];
      const origin = v(e.ox[k], e.oy[k]);
      if (state.placementViolates(chosen, origin)) continue;
      out.push({ rot: e.rots[k], origin, lo: e.lo[k], hi: e.hi[k] });
    }
    chosen.rot = savedRot;
    if (out.length === 0) return DEAD;
    return [bestPiece, out];
  }

  private search(state: BoardState, remaining: PieceData[]): number {
    if (this.aborted) return 0;
    this.nodes++;
    if (this.nodes > this.budget) {
      this.aborted = true;
      return 0;
    }

    if (remaining.length === 0) {
      if (!state.isSolved()) return 0;
      this.total++;
      return 1;
    }

    const [bestI, bestOpts] = this.pick(state, remaining);
    if (bestI < 0) return 0;

    const piece = remaining[bestI];
    const rest = remaining.filter((_, i) => i !== bestI);

    let found = 0;
    const savedRot = piece.rot;
    for (const opt of bestOpts) {
      piece.rot = opt.rot;
      state.placePiece(piece, opt.origin);
      if (this.useMasks) {
        this.occLo |= opt.lo;
        this.occHi |= opt.hi;
      }
      found += this.search(state, rest);
      if (this.useMasks) {
        this.occLo &= ~opt.lo;
        this.occHi &= ~opt.hi;
      }
      state.removePiece(piece.id);
      if (this.total >= this.cap) {
        piece.rot = savedRot;
        return found;
      }
    }
    piece.rot = savedRot;
    return found;
  }

  private solveSearch(state: BoardState, remaining: PieceData[]): BoardState | null {
    if (this.aborted) return null;
    this.nodes++;
    if (this.nodes > this.budget) {
      this.aborted = true;
      return null;
    }
    if (remaining.length === 0) return state.isSolved() ? state.clone() : null;
    // Only the player's starting position can already be in conflict; every placement made below is
    // checked as it is made (see pick).
    if (this.nodes === 1 && state.anyViolated()) return null;

    const [bestI, bestOpts] = this.pick(state, remaining);
    if (bestI < 0) return null;
    const piece = remaining[bestI];
    const rest = remaining.filter((_, i) => i !== bestI);
    const savedRot = piece.rot;
    for (const opt of bestOpts) {
      piece.rot = opt.rot;
      state.placePiece(piece, opt.origin);
      if (this.useMasks) {
        this.occLo |= opt.lo;
        this.occHi |= opt.hi;
      }
      const res = this.solveSearch(state, rest);
      if (this.useMasks) {
        this.occLo &= ~opt.lo;
        this.occHi &= ~opt.hi;
      }
      state.removePiece(piece.id);
      if (res !== null) {
        piece.rot = savedRot;
        return res;
      }
      if (this.aborted) {
        piece.rot = savedRot;
        return null;
      }
    }
    piece.rot = savedRot;
    return null;
  }

  /** Slow path for boards over 63 cells: every legal (rotation, origin) with the mood check. */
  private placements(state: BoardState, piece: PieceData): Option[] {
    const out: Option[] = [];
    const savedRot = piece.rot;
    for (const r of this.rotationsOf(piece)) {
      piece.rot = r;
      const local = piece.localCells();
      for (let y = 0; y < state.height; y++) {
        for (let x = 0; x < state.width; x++) {
          const origin = v(x, y);
          let ok = true;
          for (const c of local) {
            if (!state.isEmptyAt(v(x + c.x, y + c.y))) {
              ok = false;
              break;
            }
          }
          if (!ok) continue;
          if (state.wouldViolate(piece, origin)) continue;
          out.push({ rot: r, origin, lo: 0, hi: 0 });
        }
      }
    }
    piece.rot = savedRot;
    return out;
  }
}
