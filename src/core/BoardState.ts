// Grid occupancy plus the placed polyominoes. Pure logic, no Phaser. Ports scripts/core/BoardState.gd
// (the legacy single-cell BlockData shims are dropped).

import { Mood, PieceData, v, type Vec } from './PieceData';

export const NEIGHBOUR_OFFSETS: readonly Vec[] = [v(1, 0), v(-1, 0), v(0, 1), v(0, -1)];
export const EMPTY = -1;

export interface PlacedRecord {
  piece: PieceData;
  origin: Vec;
  cells: Vec[];
}

export interface SnapshotEntry {
  color: number;
  mood: number;
  target: number;
  cells: [number, number][];
  eye: [number, number];
}

export class BoardState {
  readonly width: number;
  readonly height: number;

  private blocked: Uint8Array;
  private occ: Int32Array; // piece id, or EMPTY
  private colour: Int32Array;
  private nbr: Int32Array[] = []; // flat index -> neighbouring playable indices, in offset order
  private playable: Int32Array = new Int32Array(0);
  /** id -> record, in placement order (Map keeps insertion order like a GDScript Dictionary). */
  private placed = new Map<number, PlacedRecord>();

  constructor(w = 0, h = 0, blockedCells: readonly Vec[] = []) {
    this.width = w;
    this.height = h;
    const n = w * h;
    this.blocked = new Uint8Array(n);
    this.occ = new Int32Array(n).fill(EMPTY);
    this.colour = new Int32Array(n).fill(EMPTY);
    for (const cell of blockedCells) if (this.isInside(cell)) this.blocked[cell.y * w + cell.x] = 1;
    this.buildTables();
  }

  private buildTables(): void {
    const { width, height } = this;
    this.nbr = new Array<Int32Array>(width * height);
    const playable: number[] = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        const list: number[] = [];
        if (this.blocked[i] === 0) {
          playable.push(i);
          for (const o of NEIGHBOUR_OFFSETS) {
            const nx = x + o.x;
            const ny = y + o.y;
            if (nx >= 0 && ny >= 0 && nx < width && ny < height) {
              const j = ny * width + nx;
              if (this.blocked[j] === 0) list.push(j);
            }
          }
        }
        this.nbr[i] = Int32Array.from(list);
      }
    }
    this.playable = Int32Array.from(playable);
  }

  private idx(pos: Vec): number {
    return pos.y * this.width + pos.x;
  }

  private pos(i: number): Vec {
    return v(i % this.width, Math.floor(i / this.width));
  }

  isInside(pos: Vec): boolean {
    return pos.x >= 0 && pos.y >= 0 && pos.x < this.width && pos.y < this.height;
  }

  isPlayable(pos: Vec): boolean {
    return this.isInside(pos) && this.blocked[this.idx(pos)] === 0;
  }

  isEmptyAt(pos: Vec): boolean {
    return this.isPlayable(pos) && this.occ[this.idx(pos)] === EMPTY;
  }

  colorAt(pos: Vec): number {
    return this.isInside(pos) ? this.colour[this.idx(pos)] : EMPTY;
  }

  pieceIdAt(pos: Vec): number {
    return this.isInside(pos) ? this.occ[this.idx(pos)] : EMPTY;
  }

  getPlaced(id: number): PlacedRecord | undefined {
    return this.placed.get(id);
  }

  placedIds(): number[] {
    return Array.from(this.placed.keys());
  }

  playableCells(): Vec[] {
    return Array.from(this.playable, (i) => this.pos(i));
  }

  emptyCells(): Vec[] {
    const out: Vec[] = [];
    for (const i of this.playable) if (this.occ[i] === EMPTY) out.push(this.pos(i));
    return out;
  }

  emptyCount(): number {
    let n = 0;
    for (const i of this.playable) if (this.occ[i] === EMPTY) n++;
    return n;
  }

  canPlaceCells(cells: readonly Vec[]): boolean {
    for (const c of cells) if (!this.isEmptyAt(c)) return false;
    return true;
  }

  placePiece(piece: PieceData, origin: Vec): boolean {
    const cells = piece.worldCells(origin);
    if (!this.canPlaceCells(cells)) return false;
    for (const c of cells) {
      const i = this.idx(c);
      this.occ[i] = piece.id;
      this.colour[i] = piece.color;
    }
    this.placed.set(piece.id, { piece, origin, cells });
    return true;
  }

  removePiece(id: number): PieceData | null {
    const rec = this.placed.get(id);
    if (!rec) return null;
    for (const c of rec.cells) {
      const i = this.idx(c);
      this.occ[i] = EMPTY;
      this.colour[i] = EMPTY;
    }
    this.placed.delete(id);
    return rec.piece;
  }

  neighbours(pos: Vec): Vec[] {
    if (!this.isPlayable(pos)) return [];
    return Array.from(this.nbr[this.idx(pos)], (j) => this.pos(j));
  }

  clone(): BoardState {
    const c = new BoardState(this.width, this.height, []);
    c.blocked = this.blocked.slice();
    c.occ = this.occ.slice();
    c.colour = this.colour.slice();
    c.nbr = this.nbr;
    c.playable = this.playable;
    c.placed = new Map();
    for (const [id, rec] of this.placed) {
      c.placed.set(id, { piece: rec.piece.duplicatePiece(), origin: rec.origin, cells: rec.cells.slice() });
    }
    return c;
  }

  /** Bitmask of colours (0..30) orthogonally beside `cells`, ignoring piece `pid` itself. */
  private adjColors(cells: readonly Vec[], pid: number): number {
    let found = 0;
    for (const c of cells) {
      if (!this.isInside(c)) continue;
      for (const j of this.nbr[this.idx(c)]) {
        const oid = this.occ[j];
        if (oid !== EMPTY && oid !== pid) found |= 1 << this.colour[j];
      }
    }
    return found;
  }

  private hasEmptyNeighbour(cells: readonly Vec[]): boolean {
    for (const c of cells) {
      if (!this.isInside(c)) continue;
      for (const j of this.nbr[this.idx(c)]) if (this.occ[j] === EMPTY) return true;
    }
    return false;
  }

  pieceSatisfied(id: number): boolean {
    const rec = this.placed.get(id);
    if (!rec) return false;
    const { piece } = rec;
    if (piece.mood === Mood.NEUTRAL) return true;
    const adj = this.adjColors(rec.cells, id);
    const has = (adj & (1 << piece.targetColor)) !== 0;
    return piece.mood === Mood.AFFECTIONATE ? has : !has;
  }

  pieceViolated(id: number): boolean {
    const rec = this.placed.get(id);
    if (!rec) return false;
    const { piece } = rec;
    if (piece.mood === Mood.NEUTRAL) return false;
    const adj = this.adjColors(rec.cells, id);
    const has = (adj & (1 << piece.targetColor)) !== 0;
    if (piece.mood === Mood.HOSTILE) return has;
    // Affectionate: doomed only once every seat on the perimeter is taken and none is the friend.
    if (has) return false;
    if (this.hasEmptyNeighbour(rec.cells)) return false;
    return true;
  }

  anyViolated(): boolean {
    for (const id of this.placed.keys()) if (this.pieceViolated(id)) return true;
    return false;
  }

  violatedIds(): number[] {
    const out: number[] = [];
    for (const id of this.placed.keys()) if (this.pieceViolated(id)) out.push(id);
    return out;
  }

  violatedCells(): Vec[] {
    const out: Vec[] = [];
    for (const [id, rec] of this.placed) if (this.pieceViolated(id)) out.push(...rec.cells);
    return out;
  }

  /**
   * Solver-speed variant of wouldViolate: only the new piece and the pieces touching it can change
   * mood state. Pre-existing conflicts elsewhere are not reported (the solver's leaf check catches them).
   */
  placementViolates(piece: PieceData, origin: Vec): boolean {
    const cells = piece.worldCells(origin);
    if (!this.canPlaceCells(cells)) return true;
    this.placePiece(piece, origin);
    let bad = this.pieceViolated(piece.id);
    if (!bad) {
      const seen = new Set<number>();
      outer: for (const c of cells) {
        for (const off of NEIGHBOUR_OFFSETS) {
          const nid = this.pieceIdAt(v(c.x + off.x, c.y + off.y));
          if (nid === piece.id || seen.has(nid)) continue;
          seen.add(nid);
          if (this.placed.has(nid) && this.pieceViolated(nid)) {
            bad = true;
            break outer;
          }
        }
      }
    }
    this.removePiece(piece.id);
    return bad;
  }

  /** Would placing `piece` at `origin` leave any piece violated? */
  wouldViolate(piece: PieceData, origin: Vec): boolean {
    const cells = piece.worldCells(origin);
    if (!this.canPlaceCells(cells)) return true;
    this.placePiece(piece, origin);
    const bad = this.anyViolated();
    this.removePiece(piece.id);
    return bad;
  }

  isFull(): boolean {
    return this.emptyCount() === 0;
  }

  isSolved(): boolean {
    if (this.emptyCount() !== 0) return false;
    for (const id of this.placed.keys()) if (!this.pieceSatisfied(id)) return false;
    return true;
  }

  snapshot(): SnapshotEntry[] {
    const out: SnapshotEntry[] = [];
    for (const rec of this.placed.values()) {
      const { piece } = rec;
      const eyeLocal = piece.localEye();
      out.push({
        color: piece.color,
        mood: piece.mood,
        target: piece.targetColor,
        cells: rec.cells.map((c) => [c.x, c.y] as [number, number]),
        eye: [rec.origin.x + eyeLocal.x, rec.origin.y + eyeLocal.y],
      });
    }
    return out;
  }
}
