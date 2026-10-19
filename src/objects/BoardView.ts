// Draws the grid and owns the mapping between screen points and grid cells. Ports scripts/game/GameBoard.gd.
//
// It holds a reference to the BoardState but never mutates it: placement decisions belong to GameScene. This
// class answers geometry questions only ("where is cell (2,3)?", "which cell is under this finger?").

import type { BaseScene } from '../scenes/BaseScene';
import * as Art from '../render/Art';
import { BoardState } from '../core/BoardState';
import { CanvasView } from '../render/CanvasView';
import { Color } from '../render/Color';
import { type Vec, v } from '../core/PieceData';
import { INVALID, isInvalid } from './PieceView';

export class BoardView {
  readonly view: CanvasView;
  state: BoardState | null = null;
  cellSize = 64;
  /** top-left of the grid, relative to the board's rect */
  originX = 0;
  originY = 0;
  x = 0;
  y = 0;
  w = 100;
  h = 100;

  highlightCells: Vec[] = [];
  highlightOk = false;
  private ghostColor = Color.TRANSPARENT;
  private ghostCan = false;
  private flash = 0;
  private flashCells: Vec[] = [];
  private playable: Vec[] = [];

  constructor(scene: BaseScene) {
    this.view = new CanvasView(scene, 0, 0, 100, 100, (ci) => this.paint(ci), 48);
    this.view.setDepth(10);
  }

  setState(s: BoardState | null): void {
    this.state = s;
    this.playable = s ? s.playableCells() : [];
    this.relayout();
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

  /**
   * Fit the grid to the rectangle we were given, keeping cells square and the board centred. The frame
   * overhang scales with the cells (Art.drawBoard), so the cell size is solved with it included.
   */
  relayout(): void {
    const s = this.state;
    if (!s || s.width === 0 || s.height === 0) return;
    const shortSide = Math.min(this.w, this.h);
    const pad = Math.min(Math.max(shortSide * 0.045, 18), 34);
    const availW = this.w - pad * 2;
    const availH = this.h - pad * 2 - Art.BOARD_SHADOW_REACH;
    const fitFracX = availW / (s.width + Art.BOARD_REVEAL_FRAC * 2);
    const fitFracY = availH / (s.height + Art.BOARD_REVEAL_FRAC * 2);
    const fitMinX = (availW - Art.BOARD_REVEAL * 2) / s.width;
    const fitMinY = (availH - Art.BOARD_REVEAL * 2) / s.height;
    this.cellSize = Math.max(Math.floor(Math.min(fitFracX, fitMinX, fitFracY, fitMinY)), 8);
    const gridW = s.width * this.cellSize;
    const gridH = s.height * this.cellSize;
    // Centre frame + shadow as one block, so the shadow doesn't push it low.
    this.originX = Math.floor((this.w - gridW) * 0.5);
    this.originY = Math.floor((this.h - gridH - Art.BOARD_SHADOW_REACH) * 0.5);
    this.view.invalidate();
  }

  cellRectLocal(c: Vec): { x: number; y: number; w: number; h: number } {
    const inset = this.cellSize * 0.09;
    return {
      x: this.originX + c.x * this.cellSize + inset,
      y: this.originY + c.y * this.cellSize + inset,
      w: this.cellSize - inset * 2,
      h: this.cellSize - inset * 2,
    };
  }

  /** Which cell contains this point? INVALID when it is off the board or over a hole. */
  cellAt(px: number, py: number): Vec {
    if (!this.state || this.cellSize <= 0) return INVALID;
    const lx = px - this.x - this.originX;
    const ly = py - this.y - this.originY;
    const c = v(Math.floor(lx / this.cellSize), Math.floor(ly / this.cellSize));
    return this.state.isPlayable(c) ? c : INVALID;
  }

  /**
   * Snap a top-left position to the nearest grid cell. Unlike cellAt this never rejects: a dragged piece scaled
   * to the grid lines up with whichever cell it is closest to.
   */
  cellRoundAt(px: number, py: number): Vec {
    if (!this.state || this.cellSize <= 0) return INVALID;
    const lx = px - this.x - this.originX;
    const ly = py - this.y - this.originY;
    // Math.round differs from Godot's roundi on exact .5 negatives; roundi rounds half away from zero.
    const r = (n: number): number => (n < 0 ? -Math.round(-n) : Math.round(n));
    return v(r(lx / this.cellSize), r(ly / this.cellSize));
  }

  setHighlightCells(cells: Vec[], ok: boolean): void {
    let changed = this.highlightCells.length !== cells.length;
    if (!changed) {
      for (let i = 0; i < cells.length; i++) {
        if (this.highlightCells[i].x !== cells[i].x || this.highlightCells[i].y !== cells[i].y) {
          changed = true;
          break;
        }
      }
    }
    if (changed || this.highlightOk !== ok) {
      this.highlightCells = cells.slice();
      this.highlightOk = ok;
      this.view.invalidate();
    }
  }

  clearHighlight(): void {
    this.ghostCan = false;
    this.setHighlightCells([], false);
    this.view.invalidate();
  }

  /** Full drop preview for an airborne piece: `can` = legal drop, `happy` = legal and upsets nobody. */
  setPreview(cells: Vec[], can: boolean, happy: boolean, color: Color): void {
    if (this.ghostCan !== can || !this.ghostColor.equals(color)) {
      this.ghostCan = can;
      this.ghostColor = color;
      this.view.invalidate();
    }
    this.setHighlightCells(cells, happy);
  }

  /** Red flash over cells a piece was just refused from. */
  flashBad(cells: Vec[]): void {
    this.flashCells = cells.slice();
    this.flash = 1;
    this.view.invalidate();
  }

  update(dt: number): void {
    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dt * 3);
      this.view.invalidate();
    }
  }

  setAlpha(a: number): void {
    this.view.setAlpha(a);
  }

  redraw(): void {
    this.view.invalidate();
  }

  private paint(ci: import('../render/CanvasItem').CanvasItem): void {
    const s = this.state;
    if (!s) return;
    Art.drawBoard(ci, this.playable, this.originX, this.originY, this.cellSize);

    const hl = this.highlightCells;
    if (hl.length > 0 && this.ghostCan && this.ghostColor.a > 0) {
      // Legal drop: show where the piece will sit as a ghost: a pale fill with a slightly deeper rim of the
      // piece's own colour, both opaque (stacked translucent cell rects would show seams).
      let ghost = this.ghostColor.lerp(Color.WHITE, 0.45);
      let rim = this.ghostColor.darkened(0.06);
      if (!this.highlightOk) {
        ghost = ghost.lerp(Art.BAD_TINT, 0.55);
        rim = rim.lerp(Art.BAD_TINT, 0.55);
      }
      Art.drawGhost(ci, this.originX, this.originY, this.cellSize, hl, ghost, rim);
    } else {
      // Illegal drop: tint only the playable cells the piece covers.
      for (const pos of hl) {
        if (s.isPlayable(pos)) {
          const r = this.cellRectLocal(pos);
          Art.drawCellHighlight(ci, r.x, r.y, r.w, this.highlightOk ? Art.OK_TINT : Art.BAD_TINT);
        }
      }
    }

    if (this.flash > 0) {
      const c = Art.BAD_TINT.withAlpha(0.7 * this.flash);
      for (const pos of this.flashCells) {
        if (s.isPlayable(pos)) {
          const r = this.cellRectLocal(pos);
          ci.drawStyleBox(Art.box(c, this.cellSize * 0.22), r.x, r.y, r.w, r.h);
        }
      }
    }
  }
}

export { isInvalid };
