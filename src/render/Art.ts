// Procedural drawing for the soft cream look: flat pastel polyominoes with googly eyes on a white card,
// chunky beveled buttons and outlined display text. Ports scripts/game/Art.gd (dead helpers dropped).
// Every function takes a CanvasItem `ci` first, like the GDScript took a CanvasItem.

import { CanvasItem, StyleBoxFlat, type Pt } from './CanvasItem';
import { Color, hex } from './Color';
import { FILL } from '../core/Palette';
import { Mood } from '../core/PieceData';
import { AA_FEATHER, OUTLINE_W, pieceGeometry } from './polyShape';

// --- Soft cream gameplay look (flat pastel pieces on a white card) -----------------------------------
export const CREAM = hex('#f9efe6'); // gameplay backdrop
export const TRAY_PANEL = hex('#f0e7df'); // tray slab, a step darker than the backdrop
export const HUD_BROWN = hex('#b39580'); // round HUD buttons
export const HUD_TEXT = hex('#8f857d'); // thin counter text on white pills
export const EYE_INK = hex('#4a3228'); // pupils
export const BUBBLE_SHADOW = new Color(0.45, 0.33, 0.25, 0.16);

// --- Surfaces -----------------------------------------------------------------------------------------
export const CARD = hex('#fff8ef'); // cream card surface (win panel, toasts)
export const CARD_EDGE = hex('#e3d4ff'); // card bottom bevel
export const BOARD_PANEL = hex('#ffffff');
export const BOARD_RIM = hex('#f1e8df');
export const CELL_EMPTY = hex('#f4f4f4');
export const CELL_DOT = hex('#d6d6d6');

// --- Ink / accents ------------------------------------------------------------------------------------
export const INK = hex('#2b1d4e');
export const WHITE = hex('#ffffff');
export const TEXT_OUTLINE = hex('#2a1f5c');
export const OK_TINT = hex('#3ddc84');
export const INK_SOFT = hex('#7a6aa3');
export const hexInkSoft = INK_SOFT;
export const BAD_TINT = hex('#ff4d6d');
export const STAR = hex('#ffd23f');
export const STAR_DARK = hex('#e8930c');
export const DIAMOND = hex('#3fe0ff');
export const ACCENT_PRIMARY = hex('#3ddc84'); // green "go" CTA
export const ACCENT_BLUE = hex('#4fa8ff');
export const ACCENT_PINK = hex('#ff5fa2');
export const ACCENT_GOLD = hex('#ffc21a');

export const TIER_COLORS: readonly Color[] = [hex('#4fc3ff'), hex('#ff9d42'), hex('#ff5fa2'), hex('#b06bff'), hex('#e5334b')];

export const tierColor = (tier: number): Color => TIER_COLORS[Math.min(Math.max(tier, 0), TIER_COLORS.length - 1)];

const FILL_COLORS = FILL.map((h) => hex(h));
export const paletteFill = (h: number): Color => FILL_COLORS[h];

export const box = StyleBoxFlat.box;
export const boxCorners = StyleBoxFlat.corners;

// --- Buttons ------------------------------------------------------------------------------------------

export interface ButtonStyles {
  normal: StyleBoxFlat;
  hover: StyleBoxFlat;
  pressed: StyleBoxFlat;
  disabled: StyleBoxFlat;
  /** label colour */
  ink: Color;
  /** label outline (filled buttons only, size 8) */
  outline: Color | null;
  /** how far the label drops when pressed, in px */
  pressDrop: number;
}

/**
 * Art.style_button: a chunky pill with a deep bottom-only bevel band plus a drop shadow, that flattens and
 * drops when tapped. Pass an accent colour for a primary action; leave it transparent for a cream button.
 * No all-around border (a stroke on a large-radius pill leaves a 1px corner nub in Godot); the bottom-only
 * border still reads as a chunky 3D bevel.
 */
export function styleButton(accent: Color = Color.TRANSPARENT, radius = 500, flat = false): ButtonStyles {
  const filled = accent.a > 0;
  const base = filled ? accent : CARD;
  const ink = filled ? WHITE : INK;
  const bevel = flat ? 5 : 8;
  let edge = filled ? base.darkened(0.28) : CARD_EDGE.darkened(0.12);
  if (flat && filled) edge = base.darkened(0.14);
  const shadowCol = flat ? new Color(0.45, 0.33, 0.25, 0.2) : new Color(0.08, 0.04, 0.25, 0.3);

  const pill = (fill: Color): StyleBoxFlat => StyleBoxFlat.box(fill, radius);

  const normal = pill(base);
  normal.shadowColor = shadowCol;
  normal.shadowSize = flat ? 5 : 8;
  normal.shadowOffset = [0, flat ? 4 : 6];
  normal.border = [0, 0, 0, bevel];
  normal.borderColor = edge;
  normal.margin = [18, 10, 18, 10 + bevel * 0.5];

  const hover = normal.duplicate();
  hover.bg = base.lightened(0.06);

  const pressed = pill(base.darkened(0.06));
  pressed.shadowColor = shadowCol.withAlpha(shadowCol.a * 0.7);
  pressed.shadowSize = 3;
  pressed.shadowOffset = [0, 2];
  // The bevel nearly flattens on press and the label drops with it.
  pressed.border = [0, 0, 0, 2];
  pressed.borderColor = edge;
  pressed.margin = [18, 10 + bevel - 2, 18, 10 - bevel * 0.5 + 2];

  const disabled = pill(base.lerp(new Color(0.6, 0.6, 0.75, 1), 0.55));
  disabled.border = [0, 0, 0, bevel];
  disabled.borderColor = disabled.bg.darkened(0.2);
  disabled.margin = [18, 10, 18, 10];

  return { normal, hover, pressed, disabled, ink, outline: filled ? base.darkened(0.45) : null, pressDrop: bevel - 2 + 2 };
}

// --- Icons --------------------------------------------------------------------------------------------

/** Code-drawn UI glyphs with a uniform rounded stroke. `r` is the glyph's half-extent. */
export function drawIcon(ci: CanvasItem, kind: string, cx: number, cy: number, r: number, col: Color): void {
  const w = Math.max(3, r * 0.3);
  const P = (dx: number, dy: number): Pt => [cx + dx, cy + dy];
  switch (kind) {
    case 'back':
      ci.drawStroke([P(r * 0.3, -r * 0.62), P(-r * 0.3, 0), P(r * 0.3, r * 0.62)], col, w);
      break;
    case 'forward':
      ci.drawStroke([P(-r * 0.3, -r * 0.62), P(r * 0.3, 0), P(-r * 0.3, r * 0.62)], col, w);
      break;
    case 'undo': {
      const ccx = cx + r * 0.08;
      const ccy = cy + r * 0.1;
      const rr = r * 0.62;
      ci.drawArc(ccx, ccy, rr, -Math.PI * 0.5, Math.PI * 0.78, 28, col, w);
      ci.drawCircle(ccx + Math.cos(Math.PI * 0.78) * rr, ccy + Math.sin(Math.PI * 0.78) * rr, w * 0.5, col);
      ci.drawColoredPolygon(
        [
          [ccx - rr * 0.75, ccy - rr],
          [ccx + rr * 0.05, ccy - rr - rr * 0.6],
          [ccx + rr * 0.05, ccy - rr + rr * 0.6],
        ],
        col,
      );
      break;
    }
    case 'hint': {
      const bcx = cx;
      const bcy = cy - r * 0.18;
      ci.drawCircle(bcx, bcy, r * 0.58, col);
      ci.drawStyleBox(box(col, r * 0.12), cx - r * 0.3, cy + r * 0.26, r * 0.6, r * 0.34);
      ci.drawStyleBox(box(col, r * 0.1), cx - r * 0.22, cy + r * 0.66, r * 0.44, r * 0.2);
      ci.drawArc(
        bcx - r * 0.05,
        bcy + r * 0.02,
        r * 0.3,
        Math.PI * 1.05,
        Math.PI * 1.55,
        8,
        !col.equals(WHITE) ? new Color(1, 1, 1, 0.75) : new Color(1, 0.85, 0.3, 0.9),
        w * 0.5,
      );
      break;
    }
    case 'sound_on':
    case 'sound_off': {
      ci.drawColoredPolygon(
        [P(-r * 0.75, -r * 0.28), P(-r * 0.35, -r * 0.28), P(r * 0.05, -r * 0.68), P(r * 0.05, r * 0.68), P(-r * 0.35, r * 0.28), P(-r * 0.75, r * 0.28)],
        col,
      );
      if (kind === 'sound_on') {
        ci.drawArc(cx + r * 0.1, cy, r * 0.42, -Math.PI * 0.3, Math.PI * 0.3, 10, col, w * 0.8);
        ci.drawArc(cx + r * 0.1, cy, r * 0.78, -Math.PI * 0.3, Math.PI * 0.3, 14, col, w * 0.8);
      } else {
        ci.drawStroke([P(r * 0.4, -r * 0.3), P(r * 0.95, r * 0.3)], col, w * 0.8);
        ci.drawStroke([P(r * 0.95, -r * 0.3), P(r * 0.4, r * 0.3)], col, w * 0.8);
      }
      break;
    }
    case 'play':
      ci.drawColoredPolygon([P(-r * 0.4, -r * 0.62), P(r * 0.62, 0), P(-r * 0.4, r * 0.62)], col);
      break;
    case 'grid': {
      const s = r * 0.5;
      for (let gy = 0; gy < 2; gy++) {
        for (let gx = 0; gx < 2; gx++) {
          ci.drawStyleBox(box(col, s * 0.25), cx - r * 0.62 + gx * r * 0.7, cy - r * 0.62 + gy * r * 0.7, s, s);
        }
      }
      break;
    }
    case 'home':
      ci.drawColoredPolygon([P(0, -r * 0.75), P(r * 0.8, 0), P(-r * 0.8, 0)], col);
      ci.drawStyleBox(box(col, r * 0.1), cx - r * 0.52, cy - r * 0.1, r * 1.04, r * 0.75);
      break;
    case 'lock':
      drawLock(ci, cx, cy, r * 1.2, col, col.darkened(0.5));
      break;
    case 'help': {
      // A question mark: hook arc, short stem, dot.
      const hcx = cx;
      const hcy = cy - r * 0.3;
      const hr = r * 0.38;
      ci.drawArc(hcx, hcy, hr, Math.PI * 1.05, Math.PI * 2.4, 20, col, w);
      const end: Pt = [hcx + Math.cos(Math.PI * 2.4) * hr, hcy + Math.sin(Math.PI * 2.4) * hr];
      ci.drawStroke([P(-hr * 0.95, -r * 0.3), P(-hr * 0.95, -r * 0.3)], col, w);
      ci.drawStroke([end, P(0, r * 0.25)], col, w);
      ci.drawCircle(cx, cy + r * 0.68, w * 0.62, col);
      break;
    }
    case 'search': {
      // Magnifier: lens ring plus a short rounded handle.
      const lcx = cx - r * 0.12;
      const lcy = cy - r * 0.14;
      ci.drawArc(lcx, lcy, r * 0.52, 0, Math.PI * 2, 28, col, w * 1.1);
      ci.drawStroke([[lcx + r * 0.38, lcy + r * 0.38], P(r * 0.8, r * 0.8)], col, w * 1.3);
      ci.drawArc(lcx, lcy, r * 0.3, Math.PI * 1.1, Math.PI * 1.55, 8, col.withAlpha(col.a * 0.55), w * 0.5);
      break;
    }
    case 'menu':
      for (const k of [-1, 0, 1]) ci.drawStroke([P(-r * 0.68, k * r * 0.5), P(r * 0.68, k * r * 0.5)], col, w * 1.1);
      break;
    case 'globe': {
      // Ring, equator and one meridian.
      const gr = r * 0.8;
      ci.drawArc(cx, cy, gr, 0, Math.PI * 2, 32, col, w * 0.8);
      ci.drawStroke([P(-gr, 0), P(gr, 0)], col, w * 0.7);
      const mer: Pt[] = [];
      for (let k = 0; k < 25; k++) {
        const a = (Math.PI * 2 * k) / 24;
        mer.push(P(Math.cos(a) * gr * 0.42, Math.sin(a) * gr));
      }
      ci.drawPolyline(mer, col, w * 0.7);
      break;
    }
    case 'close':
      ci.drawStroke([P(-r * 0.5, -r * 0.5), P(r * 0.5, r * 0.5)], col, w);
      ci.drawStroke([P(r * 0.5, -r * 0.5), P(-r * 0.5, r * 0.5)], col, w);
      break;
    default:
      ci.drawCircle(cx, cy, r * 0.4, col);
  }
}

/** A faceted gem: outlined diamond with a lighter top facet and a glint. */
export function drawGem(ci: CanvasItem, cx: number, cy: number, r: number, fill: Color = DIAMOND): void {
  const o = r * 0.2;
  const P = (dx: number, dy: number): Pt => [cx + dx, cy + dy];
  ci.drawColoredPolygon([P(0, -r - o), P(r * 0.82 + o, -r * 0.1), P(0, r + o), P(-r * 0.82 - o, -r * 0.1)], TEXT_OUTLINE);
  ci.drawColoredPolygon([P(0, -r), P(r * 0.82, -r * 0.1), P(0, r), P(-r * 0.82, -r * 0.1)], fill.darkened(0.12));
  ci.drawColoredPolygon([P(0, -r), P(r * 0.82, -r * 0.1), P(0, r * 0.05), P(-r * 0.82, -r * 0.1)], fill.lightened(0.25));
  ci.drawCircle(cx - r * 0.22, cy - r * 0.42, r * 0.14, new Color(1, 1, 1, 0.9));
}

// --- Board --------------------------------------------------------------------------------------------

/** The frame's reveal grows with the cells (never below BOARD_REVEAL). */
export const BOARD_REVEAL = 14;
export const BOARD_REVEAL_FRAC = 0.3;
/** How far the board's drop shadow reaches below the frame (offset + grow). */
export const BOARD_SHADOW_REACH = 14;

export interface GridCell {
  x: number;
  y: number;
}

/**
 * Board card + empty cells. The card is a white rounded slab with a faint warm shadow; every playable cell is
 * a light-grey rounded tile with a small dot in its middle. Holes get no tile, so they read as bare card.
 */
export function drawBoard(ci: CanvasItem, cells: readonly GridCell[], originX: number, originY: number, cellSize: number): void {
  if (cells.length === 0) return;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const c of cells) {
    minX = Math.min(minX, c.x);
    minY = Math.min(minY, c.y);
    maxX = Math.max(maxX, c.x);
    maxY = Math.max(maxY, c.y);
  }
  const tlx = Math.round(originX + minX * cellSize);
  const tly = Math.round(originY + minY * cellSize);
  const spanW = (maxX - minX + 1) * cellSize;
  const spanH = (maxY - minY + 1) * cellSize;
  const reveal = Math.max(BOARD_REVEAL, cellSize * BOARD_REVEAL_FRAC);
  const fx = tlx - reveal;
  const fy = tly - reveal;
  const fw = spanW + reveal * 2;
  const fh = spanH + reveal * 2;
  const frameR = Math.round(cellSize * 0.2) + reveal * 0.4;

  // A faint warm drop shadow, then the white card.
  ci.drawStyleBox(box(new Color(0.45, 0.33, 0.25, 0.1), frameR + 4), fx - 4, fy + 6 - 4, fw + 8, fh + 8);
  ci.drawStyleBox(box(BOARD_PANEL, frameR), fx, fy, fw, fh);

  const inset = Math.max(1.5, cellSize * OUTLINE_W * 0.5);
  const tileR = Math.round(cellSize * 0.2);
  const dotR = Math.max(2, cellSize * 0.04);
  for (const c of cells) {
    const x = originX + c.x * cellSize + inset;
    const y = originY + c.y * cellSize + inset;
    const s = cellSize - inset * 2;
    ci.drawStyleBox(box(CELL_EMPTY, tileR), x, y, s, s);
    ci.drawCircle(x + s / 2, y + s / 2, dotR, CELL_DOT);
  }
}

/**
 * A dashed rounded-rectangle outline, walked along its perimeter (the tray's "drop zone" border). Straight
 * edges are the implicit chords between the four sampled corner arcs.
 */
export function drawDashedRoundRect(
  ci: CanvasItem,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
  color: Color,
  width: number,
  dash: number,
  gap: number,
): void {
  const r = Math.min(radius, Math.min(w, h) * 0.5);
  const ex = x + w;
  const ey = y + h;
  const arcs: [number, number, number][] = [
    [ex - r, y + r, -Math.PI * 0.5],
    [ex - r, ey - r, 0],
    [x + r, ey - r, Math.PI * 0.5],
    [x + r, y + r, Math.PI],
  ];
  const pts: Pt[] = [];
  for (const [acx, acy, a0] of arcs) {
    for (let s = 0; s < 9; s++) {
      const a = a0 + (Math.PI * 0.5 * s) / 8;
      pts.push([acx + Math.cos(a) * r, acy + Math.sin(a) * r]);
    }
  }
  pts.push(pts[0]);

  let drawing = true;
  let remain = dash;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (seg < 0.001) continue;
    let pos = 0;
    while (pos < seg) {
      const step = Math.min(remain, seg - pos);
      if (drawing) {
        const t0 = pos / seg;
        const t1 = (pos + step) / seg;
        ci.drawLine(a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0, a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1, color, width);
      }
      pos += step;
      remain -= step;
      if (remain <= 0.001) {
        drawing = !drawing;
        remain = drawing ? dash : gap;
      }
    }
  }
}

/** A soft tint on one cell, used while a piece hovers over it. */
export function drawCellHighlight(ci: CanvasItem, x: number, y: number, size: number, tint: Color): void {
  ci.drawStyleBox(box(tint.withAlpha(0.55), size * 0.24), x, y, size, size);
}

// --- Pieces -------------------------------------------------------------------------------------------

function fillPolys(ci: CanvasItem, polys: readonly (readonly Pt[])[], ox: number, oy: number, col: Color): void {
  for (const p of polys) {
    if (p.length < 3) continue;
    const pts = p.map((q) => [q[0] + ox, q[1] + oy] as Pt);
    ci.drawColoredPolygon(pts, col);
    ci.drawPolyline([...pts, pts[0]], col, AA_FEATHER);
  }
}

/** Drop-target ghost: exactly the piece's own silhouette, `rim` where the outline would be, `fill` inside. */
export function drawGhost(ci: CanvasItem, ox: number, oy: number, cs: number, cells: readonly GridCell[], fill: Color, rim: Color): void {
  const geo = pieceGeometry(cells, cs);
  fillPolys(ci, geo.outer, ox, oy, rim);
  fillPolys(ci, geo.body, ox, oy, fill);
}

export interface PolyominoOptions {
  alpha?: number;
  blink?: number;
  happyEyes?: boolean;
  ringPulse?: number;
}

/**
 * The main piece renderer, flat pastel style: one fused rounded silhouette in the piece's colour (no outline,
 * no gloss, no shadow), then eyes -> mood bubble -> unhappy ring. Neighbouring pieces keep a thin gap.
 *
 * `blink` (0..1) squashes the eyes shut, `happyEyes` swaps them for ^ ^ arcs, `ringPulse` scales the unhappy
 * ring's opacity so callers can throb it.
 */
export function drawPolyomino(
  ci: CanvasItem,
  ox: number,
  oy: number,
  cs: number,
  cells: readonly GridCell[],
  colorId: number,
  eye: GridCell,
  mood: number,
  target: number,
  unhappy: boolean,
  opts: PolyominoOptions = {},
): void {
  if (cells.length === 0) return;
  const alpha = opts.alpha ?? 1;
  const body = paletteFill(colorId).withAlpha(alpha);

  const geo = pieceGeometry(cells, cs);
  fillPolys(ci, geo.body, ox, oy, body);

  drawEyes(ci, ox + eye.x * cs, oy + eye.y * cs, cs, cs, alpha, opts.blink ?? 0, opts.happyEyes ?? false);

  if (mood !== Mood.NEUTRAL) {
    const [ax, ay] = bubbleAttach(ox, oy, cs, cells);
    drawThought(ci, ax, ay, cs, mood, target, alpha);
  }

  if (unhappy) {
    // One continuous ring just inside the body edge -- no per-cell borders.
    const pulse = Math.min(Math.max(opts.ringPulse ?? 1, 0), 1);
    const ringCol = BAD_TINT.withAlpha(alpha * pulse);
    const ringW = Math.max(3, cs * 0.07);
    for (const p of geo.ring) {
      if (p.length < 2) continue;
      const pts = p.map((q) => [q[0] + ox, q[1] + oy] as Pt);
      ci.drawPolyline([...pts, pts[0]], ringCol, ringW);
    }
  }
}

/** The unhappy ring alone (for pieces that throb it as a separate layer): one continuous outline just inside the body edge. */
export function drawUnhappyRing(ci: CanvasItem, ox: number, oy: number, cs: number, cells: readonly GridCell[], alpha = 1): void {
  const geo = pieceGeometry(cells, cs);
  const ringCol = BAD_TINT.withAlpha(alpha);
  const ringW = Math.max(3, cs * 0.07);
  for (const p of geo.ring) {
    if (p.length < 2) continue;
    const pts = p.map((q) => [q[0] + ox, q[1] + oy] as Pt);
    ci.drawPolyline([...pts, pts[0]], ringCol, ringW);
  }
}

function bubbleAttach(ox: number, oy: number, cs: number, cells: readonly GridCell[]): Pt {
  // Prefer the top-right cell of the piece.
  let top = cells[0];
  for (const c of cells) if (c.y < top.y || (c.y === top.y && c.x > top.x)) top = c;
  return [ox + (top.x + 0.92) * cs, oy + (top.y + 0.08) * cs];
}

/**
 * Big googly eyes in the cell rect (x, y, w, h). `blink` 0..1 squashes them vertically into a lid line;
 * `happy` draws closed ^ ^ arcs instead.
 */
export function drawEyes(ci: CanvasItem, x: number, y: number, w: number, h: number, alpha: number, blink = 0, happy = false): void {
  const s = Math.min(w, h);
  const cx = x + w / 2;
  const cy = y + h / 2 - s * 0.02;
  const eyeR = s * 0.165;
  const sep = s * 0.27;
  const ink = EYE_INK.withAlpha(alpha);
  for (const side of [-1, 1]) {
    const ecx = cx + side * sep;
    const ecy = cy;
    if (happy) {
      ci.drawArc(ecx, ecy + eyeR * 0.35, eyeR * 0.62, Math.PI * 1.12, Math.PI * 1.88, 14, ink, Math.max(2, eyeR * 0.3));
      continue;
    }
    const sy = Math.min(Math.max(1 - blink, 0.08), 1);
    if (sy <= 0.15) {
      ci.drawLine(ecx - eyeR * 0.8, ecy, ecx + eyeR * 0.8, ecy, ink, Math.max(2, eyeR * 0.22));
      continue;
    }
    // Soft white eye with a big brown pupil and one catch-light, no outline.
    ellipse(ci, ecx, ecy, eyeR, eyeR * sy, new Color(1, 1, 1, alpha));
    const px = ecx + side * eyeR * 0.04;
    const py = ecy + eyeR * 0.06 * sy;
    ellipse(ci, px, py, eyeR * 0.66, eyeR * 0.66 * sy, ink);
    if (sy > 0.5) ci.drawCircle(px - eyeR * 0.2, py - eyeR * 0.24 * sy, eyeR * 0.17, new Color(1, 1, 1, alpha));
  }
}

function ellipse(ci: CanvasItem, cx: number, cy: number, rx: number, ry: number, col: Color): void {
  if (Math.abs(rx - ry) < 0.01) {
    ci.drawCircle(cx, cy, rx, col);
    return;
  }
  const pts: Pt[] = [];
  const n = 22;
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * 2 * i) / n;
    pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  ci.drawColoredPolygon(pts, col);
}

// Thought-bubble geometry, in cells: radius, centre offset from the attach point (in radii).
export const THOUGHT_R = 0.29;
export const THOUGHT_DX = 0;
export const THOUGHT_DY = -0.55;
export const THOUGHT_OUTLINE = 0;

/**
 * How far a mood piece's thought bubble pokes outside the piece's own bbox, in cells: x = past the right
 * edge, y = above the top edge. The bubble hangs off the top-right cell, so this is the worst case.
 */
export function thoughtOverhangCells(): { x: number; y: number } {
  const reach = THOUGHT_R + THOUGHT_OUTLINE;
  const right = 0.92 + THOUGHT_R * THOUGHT_DX + reach - 1;
  const top = -(0.08 + THOUGHT_R * THOUGHT_DY - reach);
  return { x: Math.max(right, 0), y: Math.max(top, 0) };
}

export function drawThought(ci: CanvasItem, ax: number, ay: number, cs: number, mood: number, target: number, alpha: number): void {
  const r = cs * THOUGHT_R;
  const bx = ax + r * THOUGHT_DX;
  const by = ay + r * THOUGHT_DY;
  const white = new Color(1, 1, 1, alpha);
  const shadow = BUBBLE_SHADOW.withAlpha(BUBBLE_SHADOW.a * alpha);
  const tx = ax - r * 0.3;
  const ty = ay + r * 0.42;
  const mx = ax + (bx - ax) * 0.5 - r * 0.1;
  const my = ay + (by - ay) * 0.5 + r * 0.3;
  const sh = Math.max(1.5, r * 0.1);
  // A faint offset disc under each white one gives the soft lift of the reference, with no hard outline.
  ci.drawCircle(tx, ty + sh, r * 0.14, shadow);
  ci.drawCircle(mx, my + sh, r * 0.2, shadow);
  ci.drawCircle(bx, by + sh, r * 1.02, shadow);
  ci.drawCircle(tx, ty, r * 0.14, white);
  ci.drawCircle(mx, my, r * 0.2, white);
  ci.drawCircle(bx, by, r, white);
  const icon = paletteFill(target).withAlpha(alpha);
  if (mood === Mood.AFFECTIONATE) drawHeart(ci, bx, by - r * 0.04, r * 0.78, icon);
  else drawBolt(ci, bx, by, r * 0.82, icon);
}

export function drawHeart(ci: CanvasItem, cx: number, cy: number, s: number, color: Color): void {
  ci.drawCircle(cx - s * 0.28, cy - s * 0.12, s * 0.32, color);
  ci.drawCircle(cx + s * 0.28, cy - s * 0.12, s * 0.32, color);
  ci.drawColoredPolygon(
    [
      [cx - s * 0.57, cy - s * 0.02],
      [cx, cy + s * 0.62],
      [cx + s * 0.57, cy - s * 0.02],
    ],
    color,
  );
}

export function drawBolt(ci: CanvasItem, cx: number, cy: number, s: number, color: Color): void {
  ci.drawColoredPolygon(
    [
      [cx - s * 0.05, cy - s * 0.7],
      [cx + s * 0.38, cy - s * 0.08],
      [cx + s * 0.08, cy - s * 0.08],
      [cx + s * 0.18, cy + s * 0.7],
      [cx - s * 0.4, cy - s * 0.02],
      [cx - s * 0.08, cy - s * 0.02],
    ],
    color,
  );
}

// --- Stars, gift, lock ---------------------------------------------------------------------------------

function starPoints(cx: number, cy: number, r: number, inner = 0.46): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i * Math.PI * 2) / 5;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    const b = a + (Math.PI * 2) / 10;
    pts.push([cx + Math.cos(b) * r * inner, cy + Math.sin(b) * r * inner]);
  }
  return pts;
}

export function drawStar(ci: CanvasItem, cx: number, cy: number, r: number, fill: Color): void {
  ci.drawColoredPolygon(starPoints(cx, cy, r), fill);
}

/** Chunky outlined star with a lighter upper half and a glint -- the win screen and level tiles use this one. */
export function drawStarFancy(ci: CanvasItem, cx: number, cy: number, r: number, filled: boolean): void {
  const o = Math.max(2, r * 0.16);
  ci.drawColoredPolygon(starPoints(cx, cy + o * 0.8, r + o), TEXT_OUTLINE.withAlpha(0.35));
  ci.drawColoredPolygon(starPoints(cx, cy, r + o), TEXT_OUTLINE);
  if (!filled) {
    ci.drawColoredPolygon(starPoints(cx, cy, r), hex('#4a3f86'));
    return;
  }
  ci.drawColoredPolygon(starPoints(cx, cy, r), STAR_DARK);
  ci.drawColoredPolygon(starPoints(cx, cy - r * 0.06, r * 0.86), STAR);
  ci.drawCircle(cx - r * 0.22, cy - r * 0.3, r * 0.12, new Color(1, 1, 1, 0.85));
}

/** A flat gift box: red body and lid, gold ribbon and a bow. (cx, cy) is the centre, `s` the box's width. */
export function drawGift(ci: CanvasItem, cx: number, cy: number, s: number): void {
  const red = hex('#d65c5c');
  const redDark = hex('#bf4a4a');
  const gold = hex('#f2b84b');
  const bodyX = cx - s * 0.42;
  const bodyY = cy - s * 0.06;
  const bodyW = s * 0.84;
  const bodyH = s * 0.5;
  const lidX = cx - s * 0.48;
  const lidY = cy - s * 0.28;
  const lidW = s * 0.96;
  const lidH = s * 0.26;
  const g = s * 0.02;
  ci.drawStyleBox(box(new Color(0.45, 0.33, 0.25, 0.14), s * 0.08), bodyX - g, bodyY - g + s * 0.05, bodyW + g * 2, bodyH + g * 2);
  ci.drawStyleBox(box(red, s * 0.07), bodyX, bodyY, bodyW, bodyH);
  ci.drawStyleBox(box(redDark, s * 0.07), bodyX, bodyY + bodyH - s * 0.1, bodyW, s * 0.1);
  ci.drawStyleBox(box(red, s * 0.07), lidX, lidY, lidW, lidH);
  const rw = s * 0.16;
  ci.drawRect(cx - rw * 0.5, bodyY, rw, bodyH, gold);
  ci.drawRect(cx - rw * 0.5, lidY, rw, lidH, gold);
  // Bow: two loops and a knot.
  const bowY = cy - s * 0.3;
  ci.drawArc(cx - s * 0.13, bowY - s * 0.07, s * 0.12, 0, Math.PI * 2, 20, gold, Math.max(2, s * 0.05));
  ci.drawArc(cx + s * 0.13, bowY - s * 0.07, s * 0.12, 0, Math.PI * 2, 20, gold, Math.max(2, s * 0.05));
  ci.drawCircle(cx, bowY, s * 0.06, gold);
}

/** A tiny padlock glyph used on locked level tiles. (cx, cy) is the centre of the lock body. */
export function drawLock(ci: CanvasItem, cx: number, cy: number, r: number, fill: Color, outline: Color): void {
  const bodyR = r * 0.42;
  const shackleY = cy - bodyR * 0.9;
  const shackleR = bodyR * 0.55;
  const w = Math.max(2, r * 0.18);
  ci.drawArc(cx, shackleY, shackleR, Math.PI, Math.PI * 2, 12, fill, w);
  ci.drawLine(cx - shackleR, shackleY, cx - shackleR, shackleY + bodyR * 0.6, fill, w);
  ci.drawLine(cx + shackleR, shackleY, cx + shackleR, shackleY + bodyR * 0.6, fill, w);
  ci.drawStyleBox(box(fill, r * 0.18), cx - bodyR, cy - bodyR * 0.4, bodyR * 2, bodyR * 1.6);
  ci.drawCircle(cx, cy + bodyR * 0.3, bodyR * 0.2, outline);
}
