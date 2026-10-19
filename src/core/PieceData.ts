// One polyomino: a connected shape, a colour and an optional feeling about another colour.
// Ports scripts/core/PieceData.gd. Feelings apply to the whole piece: an affectionate piece needs
// the target colour orthogonally beside ANY of its cells; a hostile piece must not touch it.

import { nameOf } from './Palette';

export interface Vec {
  x: number;
  y: number;
}

export const v = (x: number, y: number): Vec => ({ x, y });

export const Mood = { NEUTRAL: 0, AFFECTIONATE: 1, HOSTILE: 2 } as const;
export type MoodValue = (typeof Mood)[keyof typeof Mood];

const NEIGHBOURS: Vec[] = [v(1, 0), v(-1, 0), v(0, 1), v(0, -1)];

export function bboxMin(cells: readonly Vec[]): Vec {
  let mx = 999;
  let my = 999;
  for (const c of cells) {
    if (c.x < mx) mx = c.x;
    if (c.y < my) my = c.y;
  }
  return v(mx, my);
}

const rotate90 = (c: Vec): Vec => v(-c.y, c.x);

/** Rotate `cells` r quarter turns clockwise, shift to min (0,0), sort row-major. */
function orient(cells: readonly Vec[], r: number): Vec[] {
  const out: Vec[] = cells.map((c) => {
    let p = c;
    for (let i = 0; i < r; i++) p = rotate90(p);
    return p;
  });
  const origin = bboxMin(out);
  for (let i = 0; i < out.length; i++) out[i] = v(out[i].x - origin.x, out[i].y - origin.y);
  out.sort((a, b) => a.y - b.y || a.x - b.x);
  return out;
}

function orientPoint(cells: readonly Vec[], point: Vec, r: number): Vec {
  const rotated = cells.map((c) => {
    let p = c;
    for (let i = 0; i < r; i++) p = rotate90(p);
    return p;
  });
  let p = point;
  for (let i = 0; i < r; i++) p = rotate90(p);
  const m = bboxMin(rotated);
  return v(p.x - m.x, p.y - m.y);
}

/** Prefer an extremity (fewest orthogonal siblings) so the face sits on a "head". */
function pickEye(cells: readonly Vec[]): Vec {
  const set = new Set<number>();
  const key = (c: Vec): number => c.y * 1024 + c.x;
  for (const c of cells) set.add(key(c));
  let best = cells[0];
  let bestN = 99;
  for (const c of cells) {
    let n = 0;
    for (const off of NEIGHBOURS) if (set.has(key(v(c.x + off.x, c.y + off.y)))) n++;
    if (n < bestN) {
      bestN = n;
      best = c;
    }
  }
  return best;
}

const cellsKey = (cells: readonly Vec[]): string => cells.map((c) => `${c.x},${c.y}`).join(',');

export class PieceData {
  id = 0;
  color = 0;
  mood: MoodValue = Mood.NEUTRAL;
  targetColor = 0;
  /** Canonical (rotation 0) cells, normalised so min x/y is 0, sorted row-major. */
  baseCells: Vec[] = [];
  eyeBase: Vec = v(0, 0);
  rot = 0;
  /** World cells of the generator's answer, used by hints. */
  solutionWorld: Vec[] = [];

  static make(pid: number, c: number, cells: readonly Vec[], m: MoodValue = Mood.NEUTRAL, t = 0): PieceData {
    const p = new PieceData();
    p.id = pid;
    p.color = c;
    p.mood = m;
    p.targetColor = t;
    const oriented = orient(cells, 0);
    p.baseCells = oriented;
    p.eyeBase = pickEye(oriented);
    p.rot = 0;
    return p;
  }

  static fromWorld(pid: number, c: number, world: readonly Vec[], m: MoodValue = Mood.NEUTRAL, t = 0): PieceData {
    const origin = bboxMin(world);
    const local = world.map((cell) => v(cell.x - origin.x, cell.y - origin.y));
    const p = PieceData.make(pid, c, local, m, t);
    p.solutionWorld = world.map((c2) => v(c2.x, c2.y));
    return p;
  }

  duplicatePiece(): PieceData {
    const p = new PieceData();
    p.id = this.id;
    p.color = this.color;
    p.mood = this.mood;
    p.targetColor = this.targetColor;
    p.baseCells = this.baseCells.slice();
    p.eyeBase = this.eyeBase;
    p.rot = this.rot;
    p.solutionWorld = this.solutionWorld.slice();
    return p;
  }

  localCells(): Vec[] {
    return orient(this.baseCells, this.rot);
  }

  localEye(): Vec {
    return orientPoint(this.baseCells, this.eyeBase, this.rot);
  }

  worldCells(origin: Vec): Vec[] {
    return this.localCells().map((c) => v(origin.x + c.x, origin.y + c.y));
  }

  /** Width/height of the current rotation's bounding box, in cells. */
  bbox(): Vec {
    let mx = 0;
    let my = 0;
    for (const c of this.localCells()) {
      if (c.x > mx) mx = c.x;
      if (c.y > my) my = c.y;
    }
    return v(mx + 1, my + 1);
  }

  rotateCw(): void {
    this.rot = (this.rot + 1) & 3;
  }

  /** Rotations (ascending) that produce distinct shapes; a 2x2 yields [0]. */
  uniqueRots(): number[] {
    const seen = new Set<string>();
    const out: number[] = [];
    for (let r = 0; r < 4; r++) {
      const key = cellsKey(orient(this.baseCells, r));
      if (!seen.has(key)) {
        seen.add(key);
        out.push(r);
      }
    }
    return out;
  }

  /** Rotate so the local cells match the solution; returns the world origin it occupies. */
  orientToSolution(): Vec {
    const origin = bboxMin(this.solutionWorld);
    const want = this.solutionWorld.map((c) => v(c.x - origin.x, c.y - origin.y));
    const wantKey = cellsKey(orient(want, 0));
    for (let r = 0; r < 4; r++) {
      if (cellsKey(orient(this.baseCells, r)) === wantKey) {
        this.rot = r;
        return origin;
      }
    }
    this.rot = 0;
    return origin;
  }

  describe(): string {
    const shape = `${this.baseCells.length}-omino`;
    if (this.mood === Mood.AFFECTIONATE) return `${nameOf(this.color)} ${shape} loves ${nameOf(this.targetColor)}`;
    if (this.mood === Mood.HOSTILE) return `${nameOf(this.color)} ${shape} avoids ${nameOf(this.targetColor)}`;
    return `${nameOf(this.color)} ${shape}`;
  }
}
