// One polyomino on screen. Owns no rules. Ports scripts/game/PieceView.gd.
//
// Motion is split across two tweens so effects never cancel travel:
//   'move' -- position travel (travelTo)
//   'fx'   -- scale / rotation juice (lift, squash, wobble, celebrate)
// Idle life (blink, jelly breathing, unhappy-ring throb) is purely visual: breathing scales the body image and
// the throb fades the ring image, so nothing is repainted per frame and the hit-test geometry never moves.
//
// `topLeft` is the piece's rect corner in logical units (what Godot's `position`/`global_position` meant);
// the Phaser container sits at the rect's centre so scale and rotation pivot there like pivot_offset did.

import * as Phaser from 'phaser';
import type { BaseScene } from '../scenes/BaseScene';
import * as Art from '../render/Art';
import { CanvasView } from '../render/CanvasView';
import { Mood, PieceData, type Vec, v } from '../core/PieceData';
import { Z } from '../fx/Fx';
import { EaseKind, Trans } from '../ui/Tween';
import { runKeyed, stopAll } from '../ui/UiFx';

export const INVALID: Vec = { x: -1, y: -1 };
export const isInvalid = (c: Vec | null | undefined): boolean => !c || (c.x === -1 && c.y === -1);

export type Slot = 'tray' | 'board';

export class PieceView extends Phaser.GameObjects.Container {
  piece!: PieceData;
  slot: Slot = 'tray';
  origin: Vec = INVALID;
  trayIndex = -1;
  movable = true;
  cellSize = 48;

  private sc: BaseScene;
  private bodyView: CanvasView;
  private ring: CanvasView;
  private sizeW = 0;
  private sizeH = 0;
  private tlx = 0;
  private tly = 0;

  private dragging = false;
  private unhappy = false;
  private celebrating = false;
  private time = 0;
  private phase = Math.random() * Math.PI * 2;
  private blink = 0;
  private nextBlink = 1 + Math.random() * 3.5;
  private dragDx = 0;

  constructor(scene: BaseScene) {
    super(scene, 0, 0);
    this.sc = scene;
    this.bodyView = new CanvasView(scene, 0, 0, 10, 10, (ci) => this.paintBody(ci), 8);
    this.ring = new CanvasView(scene, 0, 0, 10, 10, (ci) => this.paintRing(ci), 8);
    this.ring.setVisible(false);
    this.add([this.bodyView, this.ring]);
    scene.add.existing(this);
  }

  get boxW(): number {
    return this.sizeW;
  }
  get boxH(): number {
    return this.sizeH;
  }

  setup(d: PieceData, isMovable: boolean): void {
    this.piece = d;
    this.movable = isMovable;
    this.syncSize();
    this.updateDepth();
  }

  // --- geometry ---------------------------------------------------------------------------------------------

  /** Pieces with a thought bubble rest one layer up so a neighbour never paints over the bubble. */
  private restZ(): number {
    if (this.piece && this.piece.mood !== Mood.NEUTRAL) {
      if (this.slot === 'board' && !isInvalid(this.origin)) return 2 + Math.min(Math.max(this.origin.y, 0), 16);
      return 1;
    }
    return 0;
  }

  private updateDepth(): void {
    this.setDepth(Z.pieces + (this.dragging ? 100 : this.restZ()));
  }

  private syncSize(): void {
    if (!this.piece) return;
    const bb = this.piece.bbox();
    this.sizeW = bb.x * this.cellSize;
    this.sizeH = bb.y * this.cellSize;
    const pad = Math.ceil(this.cellSize * 0.55) + 4;
    this.bodyView.setPad(pad).resizeView(this.sizeW, this.sizeH);
    this.ring.setPad(pad).resizeView(this.sizeW, this.sizeH);
    // The body pivots at the bottom centre (jelly breathing); the ring shares it so they scale together.
    const bx = 0;
    const by = this.sizeH / 2;
    this.bodyView.setPivot(this.sizeW / 2, this.sizeH);
    this.ring.setPivot(this.sizeW / 2, this.sizeH);
    this.bodyView.setPosition(bx, by);
    this.ring.setPosition(bx, by);
    this.applyTopLeft();
  }

  setCellSize(s: number): void {
    this.cellSize = s;
    this.syncSize();
  }

  setTopLeft(x: number, y: number): void {
    this.tlx = x;
    this.tly = y;
    this.applyTopLeft();
  }

  getTopLeft(): [number, number] {
    return [this.tlx, this.tly];
  }

  private applyTopLeft(): void {
    this.setPosition(this.tlx + this.sizeW / 2, this.tly + this.sizeH / 2);
  }

  get left(): number {
    return this.tlx;
  }
  get top(): number {
    return this.tly;
  }

  localCellAt(px: number, py: number): Vec {
    const lc = this.piece.localCells();
    if (this.cellSize <= 0) return v(0, 0);
    const c = v(Math.floor((px - this.tlx) / this.cellSize), Math.floor((py - this.tly) / this.cellSize));
    if (lc.some((q) => q.x === c.x && q.y === c.y)) return c;
    // Fall back to the nearest occupied cell.
    let best = lc[0];
    let bestD = 999999;
    for (const q of lc) {
      const d = Math.abs(q.x - c.x) + Math.abs(q.y - c.y);
      if (d < bestD) {
        bestD = d;
        best = q;
      }
    }
    return best;
  }

  containsGlobal(px: number, py: number): boolean {
    if (!this.piece || this.cellSize <= 0) return false;
    const c = v(Math.floor((px - this.tlx) / this.cellSize), Math.floor((py - this.tly) / this.cellSize));
    return this.piece.localCells().some((q) => q.x === c.x && q.y === c.y);
  }

  // --- painting -----------------------------------------------------------------------------------------------

  private paintBody(ci: import('../render/CanvasItem').CanvasItem): void {
    if (!this.piece) return;
    const d = this.piece;
    Art.drawPolyomino(ci, 0, 0, this.cellSize, d.localCells(), d.color, d.localEye(), d.mood, d.targetColor, false, {
      blink: this.blink,
      happyEyes: this.celebrating,
    });
  }

  private paintRing(ci: import('../render/CanvasItem').CanvasItem): void {
    if (!this.piece) return;
    Art.drawUnhappyRing(ci, 0, 0, this.cellSize, this.piece.localCells());
  }

  // --- idle life ----------------------------------------------------------------------------------------------

  update(dt: number): void {
    if (!this.piece) return;
    this.time += dt;
    this.updateDepth();
    // Random blinks, desynced per piece.
    if (!this.celebrating) {
      this.nextBlink -= dt;
      if (this.nextBlink <= 0) {
        this.nextBlink = 2.5 + Math.random() * 3;
        this.startBlink();
      }
    }
    // Carry tilt: lean into horizontal motion, spring back when still.
    if (this.dragging) {
      this.dragDx += (0 - this.dragDx) * Math.min(1, dt * 10);
      const target = Math.min(Math.max(this.dragDx * 0.012, -0.2), 0.2);
      this.rotation += (target - this.rotation) * Math.min(1, dt * 14);
    }
    // Jelly breathing (tray only): on the board every edge must sit exactly on the grid.
    if (this.slot === 'tray' && !this.dragging) {
      const b = Math.sin(this.time * 2.2 + this.phase) * 0.012;
      this.bodyView.setScale(1 + b, 1 - b);
    } else if (this.bodyView.scaleX !== 1 || this.bodyView.scaleY !== 1) {
      this.bodyView.setScale(1, 1);
    }
    if (this.unhappy) this.ring.setAlpha(0.55 + 0.45 * Math.sin(this.time * 7));
  }

  private startBlink(): void {
    const t = runKeyed(this.sc, this, 'blink', () => {});
    t.kill();
    const bt = this.sc.tw.create();
    bt.tweenMethod((x) => this.setBlink(x), 0, 1, 0.06);
    bt.tweenMethod((x) => this.setBlink(x), 1, 0, 0.09);
  }

  private setBlink(x: number): void {
    this.blink = x;
    this.bodyView.invalidate();
  }

  feedDragMotion(dx: number): void {
    this.dragDx += (dx - this.dragDx) * 0.5;
  }

  setUnhappy(on: boolean): void {
    if (this.unhappy === on) return;
    this.unhappy = on;
    this.ring.setVisible(on);
    if (on) this.ring.setAlpha(1);
  }

  isUnhappy(): boolean {
    return this.unhappy;
  }

  /** Win-screen eyes (^ ^). */
  setCelebrating(on: boolean): void {
    this.celebrating = on;
    this.bodyView.invalidate();
  }

  // --- juice ----------------------------------------------------------------------------------------------------

  private fx(build: (t: import('../ui/Tween').Tween) => void): void {
    runKeyed(this.sc, this, 'fx', build);
  }

  setDragging(on: boolean): void {
    this.dragging = on;
    this.updateDepth();
    this.dragDx = 0;
    this.fx((t) => {
      t.setParallel(true);
      if (on) {
        t.tweenProperty(this, 'scale', [1.1, 1.1], 0.14).setTrans(Trans.BACK).setEase(EaseKind.OUT);
      } else {
        t.tweenProperty(this, 'scale', [1, 1], 0.1);
        t.tweenProperty(this, 'rotation', 0, 0.1);
      }
    });
  }

  /** Land-on-board squash and stretch. */
  squash(strength = 1): void {
    this.fx((t) => {
      t.tweenProperty(this, 'rotation', 0, 0);
      t.tweenProperty(this, 'scale', [1 + 0.16 * strength, 1 - 0.14 * strength], 0.07).setTrans(Trans.QUAD).setEase(EaseKind.OUT);
      t.tweenProperty(this, 'scale', [1 - 0.06 * strength, 1 + 0.08 * strength], 0.08).setTrans(Trans.QUAD).setEase(EaseKind.IN_OUT);
      t.tweenProperty(this, 'scale', [1, 1], 0.16).setTrans(Trans.BACK).setEase(EaseKind.OUT);
    });
  }

  /** Happy hop: a quick jump-squash, optionally delayed (win wave). */
  hop(delay = 0): void {
    this.fx((t) => {
      if (delay > 0) t.tweenInterval(delay);
      t.tweenProperty(this, 'scale', [1.18, 0.82], 0.07);
      t.tweenProperty(this, 'scale', [0.88, 1.16], 0.09).setTrans(Trans.QUAD).setEase(EaseKind.OUT);
      t.tweenProperty(this, 'scale', [1, 1], 0.22).setTrans(Trans.ELASTIC).setEase(EaseKind.OUT);
    });
  }

  /** Grumpy shiver for a piece that just became upset. */
  shiver(): void {
    this.fx((t) => {
      for (const a of [0.07, -0.07, 0.05, -0.04, 0]) t.tweenProperty(this, 'rotation', a, 0.045);
    });
  }

  /** Refused-drop wobble. Runs on the fx tween, so the home travel that follows doesn't cancel it. */
  refuse(): void {
    this.fx((t) => {
      t.setParallel(true);
      t.tweenProperty(this, 'scale', [1, 1], 0.1);
      t.chain().tweenProperty(this, 'rotation', 0.16, 0.05);
      t.chain().tweenProperty(this, 'rotation', -0.14, 0.07);
      t.chain().tweenProperty(this, 'rotation', 0.08, 0.06);
      t.chain().tweenProperty(this, 'rotation', 0, 0.08);
    });
  }

  /** Pop in from nothing (level intro). */
  popIn(delay = 0): void {
    this.setScale(0, 0);
    this.fx((t) => {
      t.tweenInterval(delay);
      t.tweenProperty(this, 'scale', [1, 1], 0.36).setTrans(Trans.BACK).setEase(EaseKind.OUT);
    });
  }

  /** Tap-to-rotate, tray-only. The caller re-fits the piece into its slot afterwards (the bbox may change). */
  rotatePiece(): void {
    if (!this.piece || this.slot !== 'tray') return;
    this.piece.rotateCw();
    this.syncSize();
    this.bodyView.invalidate();
    this.ring.invalidate();
    // Visually start a quarter-turn back and spin into place.
    this.rotation = -Math.PI * 0.5;
    this.fx((t) => {
      t.tweenProperty(this, 'rotation', 0, 0.22).setTrans(Trans.BACK).setEase(EaseKind.OUT);
    });
  }

  travelTo(x: number, y: number): void {
    runKeyed(this.sc, this, 'move', (t) => {
      t.setParallel(true);
      t.tweenProperty(this, 'topLeft', [x, y], 0.18).setTrans(Trans.BACK).setEase(EaseKind.OUT);
    });
  }

  /** Repaint the body (data changed from outside). */
  repaint(): void {
    this.bodyView.invalidate();
    this.ring.invalidate();
  }

  override destroy(fromScene?: boolean): void {
    stopAll(this);
    super.destroy(fromScene);
  }
}
