// Pointer handling for polyomino PieceViews. Owns no rules: it asks GameScene whether a drop is allowed.
// Ports scripts/game/DragController.gd.
//
// Alignment rule: while a piece is in the air its cells are scaled to the board grid, and the target cell is
// read from the piece's own top-left, rounded to the nearest grid cell. So the highlighted cells are always
// exactly the cells the piece is covering, and the drop lands where it looks like it will.

import * as Phaser from 'phaser';
import type { GameScene } from '../scenes/GameScene';
import { Sfx } from '../audio/Sfx';
import { paletteFill } from '../render/Art';
import { type Vec, v } from '../core/PieceData';
import { INVALID, PieceView, isInvalid } from './PieceView';

const FINGER_LIFT = 0.9;
/** A press on a tray piece released within TAP_TIME without moving more than TAP_SLOP px is a TAP (rotate, once unlocked). */
const TAP_TIME = 0.35;
const TAP_SLOP = 14;
/** A dragged piece with this share of it over the tray is dropped into the tray, wherever the finger is. */
const TRAY_TOUCH_SHARE = 0.15;

const touchscreen = (): boolean => 'ontouchstart' in window || navigator.maxTouchPoints > 0;

export class DragController {
  private view: PieceView | null = null;
  private grabOffsetX = 0;
  private grabOffsetY = 0;
  private lift = 0;
  private lastCell: Vec = INVALID;
  private lastPx = 0;
  private pressX = 0;
  private pressY = 0;
  private pressTime = 0;
  private moved = false;
  private fromTray = false;
  private activePointer = -1;

  constructor(private scene: GameScene) {
    const input = scene.input;
    input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onDown(p));
    input.on('pointermove', (p: Phaser.Input.Pointer) => this.onMove(p));
    input.on('pointerup', (p: Phaser.Input.Pointer) => this.onUp(p));
    input.on('pointerupoutside', (p: Phaser.Input.Pointer) => this.onUp(p));
  }

  isDragging(): boolean {
    return this.view !== null;
  }

  cancel(): void {
    if (!this.view) return;
    const v0 = this.view;
    this.releaseState();
    this.scene.returnHome(v0);
  }

  private pos(p: Phaser.Input.Pointer): { x: number; y: number } {
    return this.scene.logical(p);
  }

  private onDown(p: Phaser.Input.Pointer): void {
    if (!this.scene.acceptingInput || this.view) return;
    const pt = this.pos(p);
    this.begin(p.id, pt.x, pt.y);
  }

  private onMove(p: Phaser.Input.Pointer): void {
    if (!this.scene.acceptingInput || !this.view || p.id !== this.activePointer) return;
    const pt = this.pos(p);
    this.carry(pt.x, pt.y);
  }

  private onUp(p: Phaser.Input.Pointer): void {
    if (!this.view || p.id !== this.activePointer) return;
    const pt = this.pos(p);
    this.finish(pt.x, pt.y);
  }

  /** Tapping a tray piece rotates it (see finish). */
  private rotateTap(pv: PieceView): void {
    this.scene.sendToTray(pv);
    pv.rotatePiece();
    this.scene.onRotate(pv);
    Sfx.play('pop', -2, 1 + Math.random() * 0.15);
  }

  private begin(pointerId: number, px: number, py: number): void {
    const pv = this.scene.viewAt(px, py);
    if (!pv || !pv.movable) return;
    this.activePointer = pointerId;
    this.view = pv;
    this.lastCell = INVALID;
    this.pressX = px;
    this.pressY = py;
    this.pressTime = performance.now() / 1000;
    this.moved = false;
    this.fromTray = pv.slot === 'tray';

    // Which cell the finger landed on, and where inside it (0..1 per axis), while the piece is still at tray size.
    const oldCs = pv.cellSize;
    const [tlx, tly] = pv.getTopLeft();
    let grab = pv.localCellAt(px, py);
    const lc = pv.piece.localCells();
    if (!lc.some((c) => c.x === grab.x && c.y === grab.y)) grab = lc.length > 0 ? lc[0] : v(0, 0);
    let fx = 0.5;
    let fy = 0.5;
    if (oldCs > 0) {
      fx = Math.min(Math.max((px - tlx - grab.x * oldCs) / oldCs, 0), 1);
      fy = Math.min(Math.max((py - tly - grab.y * oldCs) / oldCs, 0), 1);
    }

    // GameScene rescales the piece to the board grid here.
    this.scene.onPickUp(pv);

    // Re-anchor so the exact spot the finger grabbed stays under the finger at the new size. Without this the
    // piece jumps by the size difference and every drop is off by a cell.
    const newCs = pv.cellSize;
    this.grabOffsetX = -(grab.x + fx) * newCs;
    this.grabOffsetY = -(grab.y + fy) * newCs;
    this.lift = touchscreen() ? newCs * FINGER_LIFT : 0;

    pv.setDragging(true);
    Sfx.play('pickup', 0, 0.95 + Math.random() * 0.13);
    this.lastPx = px;
    this.carry(px, py);
  }

  /** Where the piece's (unscaled, unrotated) top-left should be for this pointer. */
  private topLeftFor(px: number, py: number): [number, number] {
    return [px + this.grabOffsetX, py + this.grabOffsetY - this.lift];
  }

  private carry(px: number, py: number): void {
    const pv = this.view;
    if (!pv) return;
    if (!this.moved && Math.hypot(px - this.pressX, py - this.pressY) > TAP_SLOP) this.moved = true;
    const [tx, ty] = this.topLeftFor(px, py);
    pv.setTopLeft(tx, ty);
    pv.feedDragMotion(px - this.lastPx);
    this.lastPx = px;

    const board = this.scene.board;
    const snap = board.cellRoundAt(tx, ty);
    const world = this.worldCells(pv, snap);

    let onBoard = false;
    for (const c of world) {
      if (board.state && board.state.isPlayable(c)) {
        onBoard = true;
        break;
      }
    }
    if (!onBoard) {
      if (board.highlightCells.length > 0) board.clearHighlight();
      this.lastCell = INVALID;
      return;
    }

    if (snap.x === this.lastCell.x && snap.y === this.lastCell.y) return;
    this.lastCell = snap;
    const happy = this.scene.placementHappy(pv, snap);
    const can = this.scene.canPlace(pv, snap);
    board.setPreview(world, can, happy, paletteFill(pv.piece.color));
    if (can) Sfx.play('tick', -8, 1 + Math.random() * 0.1);
  }

  private finish(px: number, py: number): void {
    const pv = this.view;
    if (!pv) return;
    const [tx, ty] = this.topLeftFor(px, py);
    pv.setTopLeft(tx, ty);
    const snap = this.scene.board.cellRoundAt(tx, ty);
    const held = performance.now() / 1000 - this.pressTime;
    const isTap = !this.moved && Math.hypot(px - this.pressX, py - this.pressY) <= TAP_SLOP && held <= TAP_TIME;
    const fromTray = this.fromTray;
    this.releaseState();

    if (isTap && fromTray) {
      // Turning pieces unlocks at level 10; before that a tap just puts the piece back.
      if (this.scene.rotationEnabled) this.rotateTap(pv);
      else this.scene.sendToTray(pv);
      return;
    }

    // Dropped on the tray shelf -> always park it there, even if it came from the board. This is the only way
    // to take a placed piece back off.
    // Sensitive on purpose: the finger over the tray, or the piece merely touching it (it rides above the finger on
    // touch screens), sends it home. Only a piece that lands cleanly on the board and barely brushes the tray stays.
    const overlap = this.scene.tray.overlapShare(pv.left, pv.top, pv.boxW, pv.boxH);
    const canPlace = this.scene.canPlace(pv, snap);
    if (this.scene.tray.containsGlobal(px, py) || overlap >= TRAY_TOUCH_SHARE || (overlap > 0 && !canPlace)) {
      this.scene.sendToTray(pv);
      return;
    }
    if (canPlace) {
      this.scene.commitPlace(pv, snap);
    } else {
      this.scene.onRefuse(pv, this.worldCells(pv, snap));
      this.scene.returnHome(pv);
    }
  }

  private worldCells(pv: PieceView, snap: Vec): Vec[] {
    if (isInvalid(snap)) return [];
    return pv.piece.worldCells(snap);
  }

  private releaseState(): void {
    this.view?.setDragging(false);
    this.view = null;
    this.activePointer = -1;
    this.lastCell = INVALID;
    this.scene.board.clearHighlight();
  }
}
