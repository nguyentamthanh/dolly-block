// Geometry for one polyomino piece, replacing Godot's Geometry2D.merge_polygons / offset_polygon (Art._piece_polys).
//
//   1. Union of the cell squares: because the cells sit on a grid, the outline is traced directly from the
//      cells' edges (shared edges cancel) instead of running a polygon clipper.
//   2. Every free convex corner is rounded with an 8-step arc of radius CORNER * cs.
//   3. outer = shape grown by (W/2 - feather/2), body = shape shrunk by W/2, ring = body shrunk by 0.06 cs
//      (mitred joins for the first two, round for the ring), exactly the offsets Godot's version used.

import type { Pt } from './CanvasItem';

export const CORNER = 0.26;
export const OUTLINE_W = 0.06;
export const AA_FEATHER = 1.0;

export interface PieceGeometry {
  outer: Pt[][];
  body: Pt[][];
  ring: Pt[][];
}

interface Cell {
  x: number;
  y: number;
}

/** Closed outline(s) of the union of grid cells in grid units, clockwise on screen (y down), corners only. */
export function traceOutline(cells: readonly Cell[]): Pt[][] {
  const key = (x: number, y: number): string => `${x},${y}`;
  // Directed unit edges, keyed by start vertex. A shared edge appears once in each direction and cancels.
  const edges = new Map<string, { a: Pt; b: Pt }>();
  const add = (ax: number, ay: number, bx: number, by: number): void => {
    const rev = `${bx},${by}>${ax},${ay}`;
    if (edges.has(rev)) {
      edges.delete(rev);
      return;
    }
    edges.set(`${ax},${ay}>${bx},${by}`, { a: [ax, ay], b: [bx, by] });
  };
  for (const c of cells) {
    add(c.x, c.y, c.x + 1, c.y); // top, left -> right
    add(c.x + 1, c.y, c.x + 1, c.y + 1); // right, top -> bottom
    add(c.x + 1, c.y + 1, c.x, c.y + 1); // bottom, right -> left
    add(c.x, c.y + 1, c.x, c.y); // left, bottom -> top
  }
  const byStart = new Map<string, { a: Pt; b: Pt }[]>();
  for (const e of edges.values()) {
    const k = key(e.a[0], e.a[1]);
    const list = byStart.get(k);
    if (list) list.push(e);
    else byStart.set(k, [e]);
  }
  const used = new Set<{ a: Pt; b: Pt }>();
  const loops: Pt[][] = [];
  for (const start of edges.values()) {
    if (used.has(start)) continue;
    const loop: Pt[] = [];
    let e: { a: Pt; b: Pt } | undefined = start;
    while (e && !used.has(e)) {
      used.add(e);
      loop.push(e.a);
      const next: { a: Pt; b: Pt }[] | undefined = byStart.get(key(e.b[0], e.b[1]));
      e = next?.find((n) => !used.has(n));
    }
    loops.push(loop);
  }
  // Drop collinear vertices (only corners matter).
  return loops.map((loop) => {
    const n = loop.length;
    return loop.filter((p, i) => {
      const q = loop[(i - 1 + n) % n];
      const r = loop[(i + 1) % n];
      const cross = (p[0] - q[0]) * (r[1] - p[1]) - (p[1] - q[1]) * (r[0] - p[0]);
      return cross !== 0;
    });
  });
}

/** Round every convex corner of a clockwise grid-corner loop (scaled to pixels by `cs`). */
function roundConvexCorners(loop: readonly Pt[], cs: number): Pt[] {
  const r = cs * CORNER;
  const n = loop.length;
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const v: Pt = [loop[i][0] * cs, loop[i][1] * cs];
    const p = loop[(i - 1 + n) % n];
    const q = loop[(i + 1) % n];
    const toPrev: Pt = [p[0] * cs - v[0], p[1] * cs - v[1]];
    const toNext: Pt = [q[0] * cs - v[0], q[1] * cs - v[1]];
    const d1 = norm(toPrev);
    const d2 = norm(toNext);
    // Convex on screen for a clockwise loop: incoming (v - prev) x outgoing (next - v) > 0.
    const cross = -d1[0] * d2[1] + d1[1] * d2[0];
    if (cross <= 0) {
      out.push(v); // concave: keep sharp
      continue;
    }
    const cx = v[0] + (d1[0] + d2[0]) * r;
    const cy = v[1] + (d1[1] + d2[1]) * r;
    const steps = 8;
    for (let s = 0; s <= steps; s++) {
      const t = (Math.PI * 0.5 * s) / steps;
      out.push([cx - d2[0] * r * Math.cos(t) - d1[0] * r * Math.sin(t), cy - d2[1] * r * Math.cos(t) - d1[1] * r * Math.sin(t)]);
    }
  }
  return out;
}

function norm(v: Pt): Pt {
  const l = Math.hypot(v[0], v[1]) || 1;
  return [v[0] / l, v[1] / l];
}

function area(p: readonly Pt[]): number {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const b = p[(i + 1) % p.length];
    a += p[i][0] * b[1] - b[0] * p[i][1];
  }
  return a * 0.5;
}

/**
 * Offset a simple polygon by `delta` (positive grows, negative shrinks). Corners are mitred; with `round`
 * the corners that open a gap get a circular arc (Clipper's jtRound).
 */
export function offsetPolygon(poly: readonly Pt[], delta: number, round = false): Pt[] {
  const n = poly.length;
  if (n < 3) return [];
  const sign = area(poly) >= 0 ? 1 : -1; // outward normal of edge (dx, dy) is sign * (dy, -dx)
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const p = poly[(i - 1 + n) % n];
    const v = poly[i];
    const q = poly[(i + 1) % n];
    const e1 = norm([v[0] - p[0], v[1] - p[1]]);
    const e2 = norm([q[0] - v[0], q[1] - v[1]]);
    const n1: Pt = [sign * e1[1], -sign * e1[0]];
    const n2: Pt = [sign * e2[1], -sign * e2[0]];
    const dot = n1[0] * n2[0] + n1[1] * n2[1];
    // The turn opens a gap on the offset side when the offset direction is away from the polygon's bend.
    const cross = e1[0] * e2[1] - e1[1] * e2[0];
    const convex = sign * cross > 0;
    const gap = delta > 0 ? convex : !convex;
    if (round && gap && dot < 0.9999) {
      const a1 = Math.atan2(n1[1], n1[0]);
      let a2 = Math.atan2(n2[1], n2[0]);
      let da = a2 - a1;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      a2 = a1 + da;
      const steps = Math.max(2, Math.ceil(Math.abs(da) / 0.5));
      const dd = Math.abs(delta);
      const sgn = delta >= 0 ? 1 : -1;
      for (let s = 0; s <= steps; s++) {
        const a = a1 + (da * s) / steps;
        out.push([v[0] + Math.cos(a) * dd * sgn, v[1] + Math.sin(a) * dd * sgn]);
      }
      continue;
    }
    const k = delta / (1 + dot);
    out.push([v[0] + (n1[0] + n2[0]) * k, v[1] + (n1[1] + n2[1]) * k]);
  }
  return out;
}

const cache = new Map<string, PieceGeometry>();

/** The polygons one piece is drawn from, relative to its origin (see the file header). */
export function pieceGeometry(cells: readonly Cell[], cs: number): PieceGeometry {
  const key = `${cells.map((c) => `${c.x},${c.y}`).join(';')}|${(Math.round(cs * 4) / 4).toFixed(2)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  if (cache.size > 512) cache.clear();

  const loops = traceOutline(cells);
  const halfW = cs * OUTLINE_W * 0.5;
  const outer: Pt[][] = [];
  const body: Pt[][] = [];
  const ring: Pt[][] = [];
  for (const loop of loops) {
    const rounded = roundConvexCorners(loop, cs);
    outer.push(offsetPolygon(rounded, Math.max(0.5, halfW - AA_FEATHER * 0.5)));
    const b = offsetPolygon(rounded, -halfW);
    body.push(b);
    ring.push(offsetPolygon(b, -cs * 0.06, true));
  }
  const out: PieceGeometry = { outer, body, ring };
  cache.set(key, out);
  return out;
}
