// Pointer handling for polyomino PieceViews. Owns no rules: it asks GameScene whether a drop is allowed.
// Ports scripts/game/DragController.gd.
//
// Feel rules (modelled on Block Blast):
//  1. What you see is what you get. One function (`resolve`) decides where a release would land; the ghost preview
//     and the actual drop both use it, so the highlighted cells are exactly the cells the piece ends up on.
//  2. On a touch screen the piece rides ABOVE the finger, horizontally centred on it, so the thumb never hides it.
//     With a mouse the piece stays under the cursor at the spot that was grabbed.
//  3. Picking up never teleports: the piece grows to board size at once, but its on-screen position glides from
//     where it was grabbed to the carry position over ~0.1 s. The logical position (ghost, drop) is never delayed.

import * as Phaser from 'phaser';
import type { GameScene } from '../scenes/GameScene';
import { Sfx } from '../audio/Sfx';
import { paletteFill } from '../render/Art';
import { Viewport } from '../render/Viewport';
import { type Vec, v } from '../core/PieceData';
import { INVALID, PieceView, isInvalid } from './PieceView';

/** Touch only: gap (in board cells) between the finger and the bottom edge of the carried piece. */
const TOUCH_GAP_CELLS = 1.0;
/** Pickup glide: the leftover offset decays like exp(-GLIDE_RATE * t). 28 -> ~94% gone after 0.1 s. */
const GLIDE_RATE = 28;
/** A press on a tray piece released within TAP_TIME without moving more than TAP_SLOP px is a TAP (rotate, once unlocked). */
const TAP_TIME = 0.35;
const TAP_SLOP = 10;
/** A dragged piece with this share of it over the tray is dropped into the tray, wherever the finger is. */
const TRAY_TOUCH_SHARE = 0.15;
/**
 * Flick tolerance in cells. If the cell the piece is over won't take it, the nearest cell that will (within this
 * many cells, by true distance) is used instead, in the preview and on release alike. 0 disables it.
 */
const SNAP_FORGIVE_CELLS = 1;

type DropKind = 'tray' | 'place' | 'refuse';
interface Drop {
  kind: DropKind;
  /** The cell the piece would occupy: the landing cell for 'place', the cell it is hovering for 'refuse'. */
  cell: Vec;
}

export class DragController {
  private view: PieceView | null = null;
  private grabOffsetX = 0;
  private grabOffsetY = 0;
  private lastKey = '';
  private pressX = 0;
  private pressY = 0;
  private pressTime = 0;
  private moved = false;
  private fromTray = false;
  private activePointer = -1;
  private lastPx = 0;
  private lastPy = 0;
  /** Pickup glide: how far the shown piece still trails behind its carry position. */
  private glideX = 0;
  private glideY = 0;

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

  /** Per frame: lets the pickup glide settle while the finger is held still. */
  update(dt: number): void {
    if (!this.view || (this.glideX === 0 && this.glideY === 0)) return;
    const k = Math.exp(-GLIDE_RATE * dt);
    this.glideX *= k;
    this.glideY *= k;
    if (Math.abs(this.glideX) < 0.25 && Math.abs(this.glideY) < 0.25) {
      this.glideX = 0;
      this.glideY = 0;
    }
    this.showAt(this.lastPx, this.lastPy);
  }

  private pos(p: Phaser.Input.Pointer): { x: number; y: number } {
    return this.scene.logical(p);
  }

  private onDown(p: Phaser.Input.Pointer): void {
    if (!this.scene.acceptingInput || this.view) return;
    const pt = this.pos(p);
    this.begin(p.id, pt.x, pt.y, p.wasTouch);
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

  private begin(pointerId: number, px: number, py: number, touch: boolean): void {
    const pv = this.scene.viewAt(px, py);
    if (!pv || !pv.movable) return;
    this.activePointer = pointerId;
    this.view = pv;
    this.lastKey = '';
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
    const newCs = pv.cellSize;

    // Where the piece sits relative to the pointer for the whole drag.
    if (touch) {
      // Centred on the finger, bottom edge a fixed gap above it: the finger never covers the piece.
      this.grabOffsetX = -pv.boxW / 2;
      this.grabOffsetY = -pv.boxH - newCs * TOUCH_GAP_CELLS;
    } else {
      // Keep the exact spot the cursor grabbed under the cursor, at the new size.
      this.grabOffsetX = -(grab.x + fx) * newCs;
      this.grabOffsetY = -(grab.y + fy) * newCs;
    }

    // Glide: start from where the grabbed spot would be at the new size (no visual jump from the rescale),
    // then ease to the carry position.
    const startX = px - (grab.x + fx) * newCs;
    const startY = py - (grab.y + fy) * newCs;
    const [cx, cy] = this.topLeftFor(px, py);
    this.glideX = startX - cx;
    this.glideY = startY - cy;

    pv.setDragging(true);
    Sfx.play('pickup', 0, 0.95 + Math.random() * 0.13);
    this.carry(px, py);
  }

  /** Where the piece's (unscaled, unrotated) top-left should be for this pointer. */
  private topLeftFor(px: number, py: number): [number, number] {
    return [px + this.grabOffsetX, py + this.grabOffsetY];
  }

  /** Move the shown piece: carry position plus whatever pickup glide is left, snapped to device pixels. */
  private showAt(px: number, py: number): void {
    const pv = this.view;
    if (!pv) return;
    const [tx, ty] = this.topLeftFor(px, py);
    const rs = Viewport.rs;
    pv.setTopLeft(Math.round((tx + this.glideX) * rs) / rs, Math.round((ty + this.glideY) * rs) / rs);
  }

  private worldCells(pv: PieceView, cell: Vec): Vec[] {
    if (isInvalid(cell)) return [];
    return pv.piece.worldCells(cell);
  }

  /**
   * THE one decision about where a release at this pointer position lands. `tx, ty` is the piece's carry top-left
   * (no glide). Used by the live preview and by the release, so they can never disagree.
   */
  private resolve(pv: PieceView, tx: number, ty: number): Drop {
    const board = this.scene.board;
    const snap = board.cellRoundAt(tx, ty);
    if (isInvalid(snap)) return { kind: 'refuse', cell: INVALID };

    let cell = snap;
    let can = this.scene.canPlace(pv, snap);
    if (!can && SNAP_FORGIVE_CELLS > 0) {
      const g = board.gridPosAt(tx, ty);
      let bestD = Infinity;
      for (let dy = -SNAP_FORGIVE_CELLS; dy <= SNAP_FORGIVE_CELLS; dy++) {
        for (let dx = -SNAP_FORGIVE_CELLS; dx <= SNAP_FORGIVE_CELLS; dx++) {
          if (dx === 0 && dy === 0) continue;
          const c = v(snap.x + dx, snap.y + dy);
          const d = (c.x - g.x) * (c.x - g.x) + (c.y - g.y) * (c.y - g.y);
          if (d >= bestD || !this.scene.canPlace(pv, c)) continue;
          bestD = d;
          cell = c;
          can = true;
        }
      }
    }

    // A piece that is mostly over the tray goes back to it. Judged by the piece, not the finger: on a touch
    // screen the finger sits below the piece, and a green ghost on the board must never be thrown away.
    const overlap = this.scene.tray.overlapShare(tx, ty, pv.boxW, pv.boxH);
    if (overlap >= TRAY_TOUCH_SHARE || (overlap > 0 && !can)) return { kind: 'tray', cell: snap };
    return { kind: can ? 'place' : 'refuse', cell };
  }

  private carry(px: number, py: number): void {
    const pv = this.view;
    if (!pv) return;
    this.lastPx = px;
    this.lastPy = py;
    if (!this.moved && Math.hypot(px - this.pressX, py - this.pressY) > TAP_SLOP) this.moved = true;
    this.showAt(px, py);

    const [tx, ty] = this.topLeftFor(px, py);
    const board = this.scene.board;
    const drop = this.resolve(pv, tx, ty);
    const world = this.worldCells(pv, drop.cell);

    let onBoard = false;
    if (drop.kind !== 'tray' && board.state) {
      for (const c of world) {
        if (board.state.isPlayable(c)) {
          onBoard = true;
          break;
        }
      }
    }
    if (!onBoard) {
      if (board.highlightCells.length > 0) board.clearHighlight();
      this.lastKey = '';
      return;
    }

    const key = `${drop.kind}:${drop.cell.x},${drop.cell.y}`;
    if (key === this.lastKey) return;
    this.lastKey = key;
    const can = drop.kind === 'place';
    board.setPreview(world, can, can && this.scene.placementHappy(pv, drop.cell), paletteFill(pv.piece.color));
  }

  private finish(px: number, py: number): void {
    const pv = this.view;
    if (!pv) return;
    const [tx, ty] = this.topLeftFor(px, py);
    const held = performance.now() / 1000 - this.pressTime;
    const isTap = !this.moved && Math.hypot(px - this.pressX, py - this.pressY) <= TAP_SLOP && held <= TAP_TIME;
    const fromTray = this.fromTray;
    // A tap leaves the piece where it is shown (no lurch up to the carry position before it goes back).
    if (!(isTap && fromTray)) pv.setTopLeft(tx, ty);
    const drop = this.resolve(pv, tx, ty);
    this.releaseState();

    if (isTap && fromTray) {
      // Turning pieces unlocks at level 10; before that a tap just puts the piece back.
      if (this.scene.rotationEnabled) this.rotateTap(pv);
      else this.scene.sendToTray(pv);
      return;
    }

    // Dropped on the tray shelf -> always park it there, even if it came from the board. This is the only way
    // to take a placed piece back off.
    if (drop.kind === 'tray') {
      this.scene.sendToTray(pv);
    } else if (drop.kind === 'place') {
      this.scene.commitPlace(pv, drop.cell);
    } else {
      this.scene.onRefuse(pv, this.worldCells(pv, drop.cell));
      this.scene.returnHome(pv);
    }
  }

  private releaseState(): void {
    this.view?.setDragging(false);
    this.view = null;
    this.activePointer = -1;
    this.lastKey = '';
    this.glideX = 0;
    this.glideY = 0;
    this.scene.board.clearHighlight();
  }
}
