// Draws the grid and owns the mapping between screen points and grid cells. Ports scripts/game/GameBoard.gd.
//
// It holds a reference to the BoardState but never mutates it: placement decisions belong to GameScene. This
// class answers geometry questions only ("where is cell (2,3)?", "which cell is under this finger?").

import * as Phaser from 'phaser';
import type { BaseScene } from '../scenes/BaseScene';
import * as Art from '../render/Art';
import { BoardState } from '../core/BoardState';
import { CanvasView } from '../render/CanvasView';
import { Color } from '../render/Color';
import { type Vec, v } from '../core/PieceData';
import { INVALID, isInvalid } from './PieceView';

export class BoardView {
  readonly view: CanvasView;
  /** Drag preview, drawn apart from the board texture so a fast drag never repaints the whole grid. */
  private readonly ghost: Phaser.GameObjects.Graphics;
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
    this.ghost = scene.add.graphics().setDepth(15);
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
    this.ghost.setPosition(x, y);
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
    this.syncGhost();
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
    this.highlightCells = cells;
    this.highlightOk = ok;
    this.syncGhost();
  }

  clearHighlight(): void {
    this.ghostCan = false;
    this.highlightCells = [];
    this.highlightOk = false;
    this.syncGhost();
  }

  /** Full drop preview for an airborne piece: `can` = legal drop, `happy` = legal and upsets nobody. */
  setPreview(cells: Vec[], can: boolean, happy: boolean, color: Color): void {
    this.ghostCan = can;
    this.ghostColor = color;
    this.highlightCells = cells;
    this.highlightOk = happy;
    this.syncGhost();
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

  /** Cell preview while dragging. Graphics only — the board canvas stays cached. */
  private syncGhost(): void {
    const g = this.ghost;
    g.clear();
    const s = this.state;
    const hl = this.highlightCells;
    if (!s || hl.length === 0) return;
    const cs = this.cellSize;
    const inset = cs * 0.08;
    let col: Color;
    if (this.ghostCan && this.ghostColor.a > 0) {
      col = this.ghostColor.lerp(Color.WHITE, 0.45);
      if (!this.highlightOk) col = col.lerp(Art.BAD_TINT, 0.55);
      col = col.withAlpha(0.55);
    } else {
      col = (this.highlightOk ? Art.OK_TINT : Art.BAD_TINT).withAlpha(0.45);
    }
    g.fillStyle(col.toRgb(), col.a);
    const r = cs * 0.18;
    for (const c of hl) {
      if (!s.isPlayable(c)) continue;
      g.fillRoundedRect(this.originX + c.x * cs + inset, this.originY + c.y * cs + inset, cs - inset * 2, cs - inset * 2, r);
    }
  }
}

export { isInvalid };
