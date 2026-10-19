// The shelf of blocks still waiting for a home. Ports scripts/game/Tray.gd.
// Like BoardView, this is geometry only: it hands out slot rectangles and does not decide what goes where.

import type { BaseScene } from '../scenes/BaseScene';
import * as Art from '../render/Art';
import { CanvasView } from '../render/CanvasView';

export const SIDE_INSET = 14;
export const BOTTOM_INSET = 14;
const MIN_READABLE = 44;

export class TrayView {
  readonly view: CanvasView;
  slotCount = 0;
  slotSize = 64;
  x = 0;
  y = 0;
  w = 100;
  h = 100;
  /** Extra bottom room for a phone's home-indicator bar. */
  safeBottom = 0;

  private cols = 1;
  private rows = 1;
  private originX = 0;
  private originY = 0;
  private gap = 8;

  constructor(scene: BaseScene) {
    this.view = new CanvasView(scene, 0, 0, 100, 100, (ci) => this.paint(ci), 12);
    this.view.setDepth(10);
  }

  setRect(x: number, y: number, w: number, h: number): void {
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
    this.view.setPosition(x, y);
    this.view.resizeView(w, h);
    this.relayout();
  }

  setSlotCount(n: number): void {
    this.slotCount = n;
    this.relayout();
  }

  /** The glass shelf's own rect (local), inset from the control's edges. */
  private inner(): { x: number; y: number; w: number; h: number } {
    return { x: SIDE_INSET, y: 4, w: this.w - SIDE_INSET * 2, h: this.h - (4 + BOTTOM_INSET + this.safeBottom) };
  }

  /**
   * Lay the slots out at the largest size the shelf allows. Fewest-rows is the wrong objective (ten blocks in
   * one row are limited by width), so try every row count and keep whichever makes the blocks largest.
   */
  relayout(): void {
    if (this.slotCount <= 0) {
      this.view.invalidate();
      return;
    }
    if (this.w < 1 || this.h < 1) return;
    const area = this.inner();
    const shortSide = Math.min(area.w, area.h);
    this.gap = Math.min(Math.max(shortSide * 0.04, 6), 18);

    let bestRows = 1;
    let bestSize = 0;
    for (let rows = 1; rows <= this.slotCount; rows++) {
      const cols = Math.ceil(this.slotCount / rows);
      const w = (area.w - this.gap * (cols + 1)) / cols;
      const h = (area.h - this.gap * (rows + 1)) / rows;
      const sz = Math.min(w, h);
      if (sz > bestSize) {
        bestSize = sz;
        bestRows = rows;
      }
    }
    this.rows = bestRows;
    this.cols = Math.ceil(this.slotCount / this.rows);
    this.slotSize = Math.max(Math.floor(bestSize), 16);
    if (this.slotSize < MIN_READABLE) console.warn(`Tray: blocks are ${this.slotSize} px, below the ${MIN_READABLE} px readable floor`);

    const usedW = this.cols * this.slotSize + this.gap * (this.cols - 1);
    const usedH = this.rows * this.slotSize + this.gap * (this.rows - 1);
    this.originX = Math.floor(area.x + (area.w - usedW) * 0.5);
    this.originY = Math.floor(area.y + (area.h - usedH) * 0.5);
    this.view.invalidate();
  }

  /** Slot rectangle in global (logical canvas) coordinates. */
  slotRect(i: number): { x: number; y: number; w: number; h: number } {
    const col = i % this.cols;
    const row = Math.floor(i / this.cols);
    return {
      x: this.x + this.originX + col * (this.slotSize + this.gap),
      y: this.y + this.originY + row * (this.slotSize + this.gap),
      w: this.slotSize,
      h: this.slotSize,
    };
  }

  /** True when a point is over the tray area at all: a dropped block should go home rather than onto the board. */
  containsGlobal(px: number, py: number): boolean {
    return px >= this.x && py >= this.y && px < this.x + this.w && py < this.y + this.h;
  }

  private paint(ci: import('../render/CanvasItem').CanvasItem): void {
    // A soft beige slab with a white dashed "drop zone" border inset from its edge. Pieces sit straight on it.
    const s = this.inner();
    if (s.w <= 0 || s.h <= 0) return;
    const r = 26;
    ci.drawStyleBox(Art.box(Art.TRAY_PANEL, r), s.x, s.y, s.w, s.h);
    const inset = 10;
    Art.drawDashedRoundRect(ci, s.x + inset, s.y + inset, s.w - inset * 2, s.h - inset * 2, r - inset * 0.5, Art.WHITE, 3.5, 11, 8);
  }
}
