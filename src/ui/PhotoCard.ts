// One polaroid: a painted scene with the solved board lying on it, a "# 064" chip and up to three stars underneath.
// Shared by the win screen (big, stars pop in one by one) and the timeline (small, hung from a clothes-peg).
// The board is rebuilt from GameState.photos[level].pieces, the snapshot taken the moment the level was solved, so a
// photo never depends on regenerating the level. Ports scripts/ui/PhotoCard.gd.

import type * as Phaser from 'phaser';
import * as Art from '../render/Art';
import type { CanvasItem } from '../render/CanvasItem';
import { CanvasView } from '../render/CanvasView';
import { Color, hex } from '../render/Color';
import { drawString } from '../render/Fonts';
import type { PhotoRecord } from '../core/GameState';
import { Mood, bboxMin, v } from '../core/PieceData';
import { drawScenery, type R } from './Scenery';

/** Card height as a multiple of its width. */
export const ASPECT = 1.215;
const PAD = 0.055; // window inset, fraction of card width
const WINDOW_ASPECT = 1.08; // window height / window width
const FOOTER = 0.15; // footer height, fraction of card width

export const heightFor = (width: number): number => width * ASPECT;

export function photoWindow(rect: R): R {
  const w = rect.w;
  const p = w * PAD;
  return { x: rect.x + p, y: rect.y + p, w: w - p * 2, h: (w - p * 2) * WINDOW_ASPECT };
}

export function starCentre(rect: R, i: number): { x: number; y: number } {
  const win = photoWindow(rect);
  const fh = rect.w * FOOTER;
  const endY = win.y + win.h;
  const fy = endY + (rect.y + rect.h - endY) * 0.5;
  const r = fh * 0.3;
  return { x: win.x + win.w - r * 1.1 - (2 - i) * r * 2.35, y: fy };
}

export interface PhotoData {
  index: number;
  pieces: PhotoRecord['pieces'];
  bg: number;
  stars: number;
  empty: boolean;
}

export function paintPhoto(ci: CanvasItem, rect: R, p: PhotoData): void {
  const w = rect.w;
  const g = w * 0.006;
  ci.drawStyleBox(Art.box(new Color(0.45, 0.33, 0.25, 0.16), w * 0.04), rect.x - g, rect.y + w * 0.018 - g, rect.w + g * 2, rect.h + g * 2);
  ci.drawStyleBox(Art.box(Art.WHITE, w * 0.035), rect.x, rect.y, rect.w, rect.h);

  const win = photoWindow(rect);
  if (p.empty) {
    ci.drawRect(win.x, win.y, win.w, win.h, hex('#f1e9e1'));
    const fs = Math.trunc(w * 0.34);
    drawString(ci, '?', win.x, win.y + win.h / 2 + fs * 0.34, win.w, 'center', 'thin', fs, hex('#dccfc4'));
  } else {
    drawScenery(ci, win, p.bg);
    drawBoard(ci, win, p.pieces);
  }

  // Footer: level chip on the left, stars on the right.
  const fh = w * FOOTER;
  const endY = win.y + win.h;
  const fy = endY + (rect.y + rect.h - endY) * 0.5;
  const chip: R = { x: win.x, y: fy - fh * 0.31, w: w * 0.2, h: fh * 0.62 };
  ci.drawStyleBox(Art.box(hex('#f1efed'), chip.h * 0.3), chip.x, chip.y, chip.w, chip.h);
  const cfs = Math.trunc(chip.h * 0.62);
  const label = `# ${String(p.index + 1).padStart(3, '0')}`;
  drawString(ci, label, chip.x, chip.y + chip.h / 2 + cfs * 0.34, chip.w, 'center', 'thin', cfs, hex('#a8a29c'));
  if (!p.empty) {
    for (let i = 0; i < 3; i++) {
      const col = i < p.stars ? Art.STAR : hex('#e6e1dc');
      const c = starCentre(rect, i);
      Art.drawStar(ci, c.x, c.y, fh * 0.3, col);
    }
  }
}

/**
 * Lay the saved pieces out centred in the window at the largest cell size that leaves a margin. Photos always show
 * the pieces neutral (no thought bubbles): at thumbnail size the bubbles are noise.
 */
function drawBoard(ci: CanvasItem, win: R, pieces: PhotoRecord['pieces']): void {
  const recs: { cells: { x: number; y: number }[]; color: number; eye: { x: number; y: number } }[] = [];
  let loX = 1 << 20;
  let loY = 1 << 20;
  let hiX = -(1 << 20);
  let hiY = -(1 << 20);
  for (const p of pieces ?? []) {
    const cells = (p.cells ?? []).map((c) => v(Math.trunc(Number(c[0])), Math.trunc(Number(c[1]))));
    for (const c of cells) {
      loX = Math.min(loX, c.x);
      loY = Math.min(loY, c.y);
      hiX = Math.max(hiX, c.x);
      hiY = Math.max(hiY, c.y);
    }
    if (cells.length === 0) continue;
    const eyeArr = p.eye ?? [cells[0].x, cells[0].y];
    recs.push({ cells, color: Math.trunc(Number(p.color ?? 0)), eye: v(Math.trunc(Number(eyeArr[0])), Math.trunc(Number(eyeArr[1]))) });
  }
  if (recs.length === 0) return;
  const spanX = hiX - loX + 1;
  const spanY = hiY - loY + 1;
  let cs = Math.floor(Math.min((win.w * 0.86) / spanX, (win.h * 0.86) / spanY));
  cs = Math.max(cs, 4);
  const roundHalfAway = (n: number): number => (n < 0 ? -Math.round(-n) : Math.round(n));
  const ox = roundHalfAway(win.x + win.w / 2 - (spanX * cs) / 2);
  const oy = roundHalfAway(win.y + win.h / 2 - (spanY * cs) / 2);
  for (const rec of recs) {
    const mn = bboxMin(rec.cells);
    const local = rec.cells.map((c) => v(c.x - mn.x, c.y - mn.y));
    Art.drawPolyomino(ci, ox + (mn.x - loX) * cs, oy + (mn.y - loY) * cs, cs, local, rec.color, v(rec.eye.x - mn.x, rec.eye.y - mn.y), Mood.NEUTRAL, 0, false);
  }
}

/** A polaroid as a view: setPivot is at (w/2, 10) like the Godot card, so a slight tilt hangs from the peg. */
export class PhotoCardView extends CanvasView {
  photo: PhotoData;
  readonly cw: number;
  readonly ch: number;

  constructor(scene: Phaser.Scene, w: number, data: PhotoData) {
    const h = heightFor(w);
    super(scene, 0, 0, w, h, (ci, view) => {
      const photo = (view as unknown as PhotoCardView).photo; // not assigned yet during the first paint from super()
      if (photo) paintPhoto(ci, { x: 0, y: 0, w: view.viewW, h: view.viewH }, photo);
    }, Math.ceil(w * 0.06));
    this.photo = data;
    this.cw = w;
    this.ch = h;
    this.setPivot(w / 2, 10);
    this.repaint();
  }

  setStars(n: number): void {
    this.photo.stars = n;
    this.invalidate();
  }

  setBg(id: number): void {
    this.photo.bg = id;
    this.invalidate();
  }

  /** Where the i-th star sits, relative to the card's top-left (for sparkles). */
  starPosition(i: number): { x: number; y: number } {
    return starCentre({ x: 0, y: 0, w: this.cw, h: this.ch }, i);
  }
}

