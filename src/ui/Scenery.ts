// The painted backdrops that sit behind a solved board inside a photo. Pure flat shapes in the cream theme's pastel
// set, drawn into whatever rect the caller gives (a thumbnail on the timeline, the big photo on the win screen).
// Ids wrap, so any int is a valid scene. Ports scripts/ui/Scenery.gd.

import type { CanvasItem, Pt } from '../render/CanvasItem';
import { Color, hex } from '../render/Color';

export const SCENERY_COUNT = 5;

export interface R {
  x: number;
  y: number;
  w: number;
  h: number;
}

const posmod = (a: number, b: number): number => ((a % b) + b) % b;
const fposmod1 = (x: number): number => x - Math.floor(x);

export function drawScenery(ci: CanvasItem, r: R, id: number): void {
  switch (posmod(id, SCENERY_COUNT)) {
    case 0:
      return meadow(ci, r);
    case 1:
      return desert(ci, r);
    case 2:
      return road(ci, r);
    case 3:
      return snow(ci, r);
    default:
      return beach(ci, r);
  }
}

/** A soft three-lobed cloud centred on (cx, cy), s px wide. */
export function cloud(ci: CanvasItem, cx: number, cy: number, s: number, col: Color = Color.WHITE): void {
  ci.drawCircle(cx - s * 0.24, cy + s * 0.04, s * 0.17, col);
  ci.drawCircle(cx + s * 0.02, cy - s * 0.06, s * 0.23, col);
  ci.drawCircle(cx + s * 0.27, cy + s * 0.04, s * 0.16, col);
  ci.drawRect(cx - s * 0.24, cy + s * 0.04, s * 0.51, s * 0.16, col);
  ci.drawCircle(cx - s * 0.24, cy + s * 0.12, s * 0.08, col);
  ci.drawCircle(cx + s * 0.27, cy + s * 0.12, s * 0.08, col);
}

const fill = (ci: CanvasItem, r: R, c: string): void => ci.drawRect(r.x, r.y, r.w, r.h, hex(c));

function meadow(ci: CanvasItem, r: R): void {
  fill(ci, r, '#cfe9f6');
  cloud(ci, r.x + r.w * 0.72, r.y + r.h * 0.16, r.w * 0.34);
  const gy = r.y + r.h * 0.42;
  const gh = r.h * 0.58;
  ci.drawRect(r.x, gy, r.w, gh, hex('#bddba6'));
  // Daisies: a fixed scatter, so a photo never changes between redraws.
  for (let i = 0; i < 34; i++) {
    const fx = fposmod1(Math.sin(i * 12.9898) * 43758.5453);
    const fy = fposmod1(Math.sin(i * 78.233) * 24634.6345);
    const px = r.x + fx * r.w;
    const py = gy + (0.04 + fy * 0.92) * gh;
    const pr = Math.max(1.5, r.w * 0.012);
    ci.drawCircle(px, py, pr, Color.WHITE);
    ci.drawCircle(px, py, pr * 0.4, hex('#f4d37a'));
  }
}

function desert(ci: CanvasItem, r: R): void {
  fill(ci, r, '#d4ecf4');
  cloud(ci, r.x + r.w * 0.3, r.y + r.h * 0.2, r.w * 0.34);
  ci.drawCircle(r.x + r.w * 0.8, r.y + r.h * 0.16, r.w * 0.07, hex('#fff1c4'));
  ci.drawRect(r.x, r.y + r.h * 0.46, r.w, r.h * 0.54, hex('#ffd98c'));
  hill(ci, r, 0.62, 0.07, 0, hex('#f7c874'));
  hill(ci, r, 0.84, 0.06, 1.6, hex('#f2bd68'));
}

function road(ci: CanvasItem, r: R): void {
  fill(ci, r, '#d5e9f1');
  cloud(ci, r.x + r.w * 0.25, r.y + r.h * 0.18, r.w * 0.3);
  const horizon = r.y + r.h * 0.42;
  const endY = r.y + r.h;
  const endX = r.x + r.w;
  ci.drawRect(r.x, horizon, r.w, endY - horizon, hex('#bddba8'));
  const cx = r.x + r.w * 0.5;
  ci.drawColoredPolygon(
    [
      [cx - r.w * 0.05, horizon],
      [cx + r.w * 0.05, horizon],
      [endX - r.w * 0.04, endY],
      [r.x + r.w * 0.04, endY],
    ],
    hex('#a9b0b8'),
  );
  // Centre dashes get longer and wider toward the viewer.
  for (let i = 0; i < 5; i++) {
    const t0 = 0.12 + i * 0.19;
    const t1 = t0 + 0.09 + i * 0.02;
    const y0 = horizon + (endY - horizon) * t0;
    const y1 = horizon + (endY - horizon) * Math.min(t1, 1);
    const w0 = r.w * (0.006 + 0.012 * t0);
    const w1 = r.w * (0.006 + 0.012 * t1);
    ci.drawColoredPolygon(
      [
        [cx - w0, y0],
        [cx + w0, y0],
        [cx + w1, y1],
        [cx - w1, y1],
      ],
      hex('#f4f6f8'),
    );
  }
}

function snow(ci: CanvasItem, r: R): void {
  fill(ci, r, '#4e5b66');
  ci.drawRect(r.x, r.y + r.h * 0.5, r.w, r.h * 0.5, hex('#dfe9ef'));
  hill(ci, r, 0.54, 0.05, 0.8, hex('#cfdbe3'));
  for (let i = 0; i < 26; i++) {
    const fx = fposmod1(Math.sin(i * 31.7) * 9731.1);
    const fy = fposmod1(Math.sin(i * 17.3) * 5113.7);
    ci.drawCircle(r.x + fx * r.w, r.y + fy * 0.9 * r.h, Math.max(1.2, r.w * 0.009), new Color(1, 1, 1, 0.75));
  }
}

function beach(ci: CanvasItem, r: R): void {
  fill(ci, r, '#ffe3d0');
  ci.drawCircle(r.x + r.w * 0.3, r.y + r.h * 0.3, r.w * 0.1, hex('#ffbf99'));
  ci.drawRect(r.x, r.y + r.h * 0.46, r.w, r.h * 0.2, hex('#93c9d5'));
  ci.drawRect(r.x, r.y + r.h * 0.64, r.w, r.h * 0.36, hex('#f8e1b4'));
  hill(ci, r, 0.64, 0.025, 2.4, hex('#e8f5f4'));
}

/** A gently rolling band: everything below a sine edge at `base` (fraction of the rect height) is filled. */
function hill(ci: CanvasItem, r: R, base: number, amp: number, phase: number, col: Color): void {
  const pts: Pt[] = [];
  const n = 16;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push([r.x + r.w * t, r.y + r.h * (base + Math.sin(t * Math.PI * 2 * 0.8 + phase) * amp)]);
  }
  pts.push([r.x + r.w, r.y + r.h]);
  pts.push([r.x, r.y + r.h]);
  ci.drawColoredPolygon(pts, col);
}
