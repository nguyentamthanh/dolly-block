// A Godot-style CanvasItem on top of a Canvas 2D context: draw_circle / draw_arc / draw_polyline /
// draw_colored_polygon / draw_style_box ... with the same argument conventions, so the `_draw()` bodies of
// the GDScript can be ported nearly line for line. Everything is in logical (720x1280-space) units; the view
// that owns the canvas applies the logical->pixel scale before painting.

import { Color } from './Color';

export type Pt = readonly [number, number];

/** StyleBoxFlat, as far as the game uses it. Corner order: top-left, top-right, bottom-right, bottom-left. */
export class StyleBoxFlat {
  bg: Color = Color.TRANSPARENT;
  radius: [number, number, number, number] = [0, 0, 0, 0];
  /** left, top, right, bottom */
  border: [number, number, number, number] = [0, 0, 0, 0];
  borderColor: Color = Color.TRANSPARENT;
  shadowColor: Color = Color.TRANSPARENT;
  shadowSize = 0;
  shadowOffset: [number, number] = [0, 0];
  /** content margins: left, top, right, bottom (layout only) */
  margin: [number, number, number, number] = [0, 0, 0, 0];

  /** Art.box(fill, radius, border, border_color) */
  static box(fill: Color, radius: number, border = 0, borderColor: Color = Color.TRANSPARENT): StyleBoxFlat {
    const sb = new StyleBoxFlat();
    sb.bg = fill;
    const r = Math.trunc(radius);
    sb.radius = [r, r, r, r];
    if (border > 0) {
      const b = Math.trunc(border);
      sb.border = [b, b, b, b];
      sb.borderColor = borderColor;
    }
    return sb;
  }

  /** Art.box_corners(fill, tl, tr, br, bl) */
  static corners(fill: Color, tl: number, tr: number, br: number, bl: number): StyleBoxFlat {
    const sb = new StyleBoxFlat();
    sb.bg = fill;
    sb.radius = [Math.trunc(tl), Math.trunc(tr), Math.trunc(br), Math.trunc(bl)];
    return sb;
  }

  duplicate(): StyleBoxFlat {
    const sb = new StyleBoxFlat();
    sb.bg = this.bg;
    sb.radius = [...this.radius];
    sb.border = [...this.border];
    sb.borderColor = this.borderColor;
    sb.shadowColor = this.shadowColor;
    sb.shadowSize = this.shadowSize;
    sb.shadowOffset = [...this.shadowOffset];
    sb.margin = [...this.margin];
    return sb;
  }
}

const shadowCache = new Map<string, HTMLCanvasElement>();

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

/** Closed rounded-rect subpath. Radii scale down together when they don't fit (same rule as CSS / Godot). */
export function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: readonly [number, number, number, number],
): void {
  let [tl, tr, br, bl] = r;
  const f = Math.min(
    1,
    tl + tr > 0 ? w / (tl + tr) : 1,
    bl + br > 0 ? w / (bl + br) : 1,
    tl + bl > 0 ? h / (tl + bl) : 1,
    tr + br > 0 ? h / (tr + br) : 1,
  );
  if (f < 1) {
    tl *= f;
    tr *= f;
    br *= f;
    bl *= f;
  }
  ctx.moveTo(x + tl, y);
  ctx.lineTo(x + w - tr, y);
  if (tr > 0) ctx.arc(x + w - tr, y + tr, tr, -Math.PI / 2, 0);
  ctx.lineTo(x + w, y + h - br);
  if (br > 0) ctx.arc(x + w - br, y + h - br, br, 0, Math.PI / 2);
  ctx.lineTo(x + bl, y + h);
  if (bl > 0) ctx.arc(x + bl, y + h - bl, bl, Math.PI / 2, Math.PI);
  ctx.lineTo(x, y + tl);
  if (tl > 0) ctx.arc(x + tl, y + tl, tl, Math.PI, Math.PI * 1.5);
  ctx.closePath();
}

export class CanvasItem {
  private baseTransform: DOMMatrix;

  /** @param pxScale pixels per logical unit of the owning view (needed only for offscreen work like shadows) */
  constructor(
    readonly ctx: CanvasRenderingContext2D,
    readonly pxScale: number,
  ) {
    this.baseTransform = ctx.getTransform();
  }

  /** Remember the current transform as the "identity" for drawSetTransform. */
  markBase(): void {
    this.baseTransform = this.ctx.getTransform();
  }

  // --- state -----------------------------------------------------------------------------------

  /** draw_set_transform(position, rotation, scale): replaces the transform for later draws. */
  drawSetTransform(x = 0, y = 0, rot = 0, sx = 1, sy = 1): void {
    const ctx = this.ctx;
    ctx.setTransform(this.baseTransform);
    ctx.translate(x, y);
    if (rot !== 0) ctx.rotate(rot);
    if (sx !== 1 || sy !== 1) ctx.scale(sx, sy);
  }

  drawResetTransform(): void {
    this.ctx.setTransform(this.baseTransform);
  }

  // --- primitives ------------------------------------------------------------------------------

  drawRect(x: number, y: number, w: number, h: number, color: Color): void {
    const ctx = this.ctx;
    ctx.fillStyle = color.css();
    ctx.fillRect(x, y, w, h);
  }

  drawCircle(cx: number, cy: number, r: number, color: Color): void {
    const ctx = this.ctx;
    ctx.fillStyle = color.css();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  /** draw_line: a butt-capped segment. */
  drawLine(ax: number, ay: number, bx: number, by: number, color: Color, width: number): void {
    const ctx = this.ctx;
    ctx.strokeStyle = color.css();
    ctx.lineWidth = width;
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
  }

  /** draw_polyline: butt caps, mitred joints like Godot's. */
  drawPolyline(pts: readonly Pt[], color: Color, width: number): void {
    if (pts.length < 2) return;
    const ctx = this.ctx;
    ctx.strokeStyle = color.css();
    ctx.lineWidth = width;
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'miter';
    ctx.miterLimit = 2;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.stroke();
  }

  /** draw_arc(center, radius, start, end, point_count, color, width): sampled exactly like Godot. */
  drawArc(cx: number, cy: number, radius: number, start: number, end: number, pointCount: number, color: Color, width: number): void {
    const pts: Pt[] = [];
    const delta = end - start;
    for (let i = 0; i < pointCount; i++) {
      const th = (i / (pointCount - 1)) * delta + start;
      pts.push([cx + Math.cos(th) * radius, cy + Math.sin(th) * radius]);
    }
    this.drawPolyline(pts, color, width);
  }

  /** Polyline with round caps and joints (Art._stroke). */
  drawStroke(pts: readonly Pt[], color: Color, width: number): void {
    this.drawPolyline(pts, color, width);
    for (const p of pts) this.drawCircle(p[0], p[1], width * 0.5, color);
  }

  drawColoredPolygon(pts: readonly Pt[], color: Color): void {
    if (pts.length < 3) return;
    const ctx = this.ctx;
    ctx.fillStyle = color.css();
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    ctx.fill();
  }

  // --- StyleBoxFlat ----------------------------------------------------------------------------

  drawStyleBox(sb: StyleBoxFlat, x: number, y: number, w: number, h: number): void {
    const ctx = this.ctx;
    if (w <= 0 || h <= 0) return;

    if (sb.shadowSize > 0 && sb.shadowColor.a > 0) this.drawShadow(sb, x, y, w, h);

    const [bl, bt, br, bb] = sb.border;
    const hasBorder = bl > 0 || bt > 0 || br > 0 || bb > 0;
    if (hasBorder && sb.borderColor.a > 0) {
      // The border is the ring between the outer shape and the inner shape; the fill covers the inner shape only,
      // so translucent colours are never counted twice.
      const [tl, tr, rr, rbl] = sb.radius;
      const inner: [number, number, number, number] = [
        Math.max(tl - Math.min(bl, bt), 0),
        Math.max(tr - Math.min(br, bt), 0),
        Math.max(rr - Math.min(br, bb), 0),
        Math.max(rbl - Math.min(bl, bb), 0),
      ];
      ctx.fillStyle = sb.borderColor.css();
      ctx.beginPath();
      roundRectPath(ctx, x, y, w, h, sb.radius);
      roundRectPath(ctx, x + bl, y + bt, w - bl - br, h - bt - bb, inner);
      ctx.fill('evenodd');
      if (sb.bg.a > 0) {
        ctx.fillStyle = sb.bg.css();
        ctx.beginPath();
        roundRectPath(ctx, x + bl, y + bt, w - bl - br, h - bt - bb, inner);
        ctx.fill();
      }
      return;
    }
    if (sb.bg.a > 0) {
      ctx.fillStyle = sb.bg.css();
      ctx.beginPath();
      roundRectPath(ctx, x, y, w, h, sb.radius);
      ctx.fill();
    }
  }

  /**
   * StyleBoxFlat shadow: the box shifted by `shadow_offset` is solid shadow colour, and a band `shadow_size`
   * wide around it fades linearly to transparent. Built once per distinct shape on an offscreen canvas.
   */
  private drawShadow(sb: StyleBoxFlat, x: number, y: number, w: number, h: number): void {
    const s = sb.shadowSize;
    const key = [w, h, sb.radius.join(','), s, sb.shadowColor.css(), this.pxScale].join('|');
    let tile = shadowCache.get(key);
    const pad = s;
    const k = this.pxScale;
    if (!tile) {
      if (shadowCache.size > 200) shadowCache.clear();
      tile = makeCanvas((w + pad * 2) * k, (h + pad * 2) * k);
      const t = tile.getContext('2d')!;
      t.scale(k, k);
      const base = sb.shadowColor;
      const steps = Math.max(2, Math.ceil(s * 2));
      for (let i = steps; i >= 1; i--) {
        const d = (i / steps) * s; // grow distance of this layer
        const dm = ((i - 0.5) / steps) * s;
        const alpha = base.a * (1 - dm / s);
        t.save();
        t.beginPath();
        roundRectPath(t, pad - d, pad - d, w + d * 2, h + d * 2, sb.radius.map((r) => r + d) as [number, number, number, number]);
        t.clip();
        t.clearRect(0, 0, w + pad * 2, h + pad * 2);
        t.fillStyle = base.withAlpha(alpha).css();
        t.fillRect(0, 0, w + pad * 2, h + pad * 2);
        t.restore();
      }
      // The solid core replaces (not adds to) the innermost ring, or its alpha would be counted twice.
      t.save();
      t.beginPath();
      roundRectPath(t, pad, pad, w, h, sb.radius);
      t.clip();
      t.clearRect(0, 0, w + pad * 2, h + pad * 2);
      t.fillStyle = base.css();
      t.fillRect(0, 0, w + pad * 2, h + pad * 2);
      t.restore();
      shadowCache.set(key, tile);
    }
    this.ctx.drawImage(tile, x + sb.shadowOffset[0] - pad, y + sb.shadowOffset[1] - pad, w + pad * 2, h + pad * 2);
  }
}
