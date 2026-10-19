// First-level coach mark: a fingertip that presses on one tray piece and drags to where that piece belongs,
// over a pulsing ghost of it on the board. Loops until the player picks up any piece (GameScene frees it
// then). Positions are re-read every frame, so it follows relayouts. Ports scripts/game/DragGuide.gd.

import * as Phaser from 'phaser';
import type { GameScene } from '../scenes/GameScene';
import { paletteFill } from '../render/Art';
import { pieceGeometry } from '../render/polyShape';
import { Z } from '../fx/Fx';
import { type Vec } from '../core/PieceData';
import type { PieceView } from './PieceView';

const PERIOD = 2.2;
const OUTLINE = 0x2b1d4e;

export class DragGuide {
  private g: Phaser.GameObjects.Graphics;
  private t = 0;
  private dead = false;

  constructor(
    private scene: GameScene,
    private piece: PieceView,
    private target: Vec,
    private cells: Vec[],
  ) {
    this.g = scene.add.graphics();
    this.g.setDepth(Z.guide);
  }

  update(dt: number): void {
    if (this.dead) return;
    this.t += dt;
    if (!this.piece.active) {
      this.destroy();
      return;
    }
    this.draw();
  }

  private draw(): void {
    const g = this.g;
    g.clear();
    const board = this.scene.board;
    const cs = board.cellSize;
    const ghostX = board.x + board.originX + this.target.x * cs;
    const ghostY = board.y + board.originY + this.target.y * cs;
    let bbx = 0;
    let bby = 0;
    for (const c of this.cells) {
      bbx = Math.max(bbx, c.x + 1);
      bby = Math.max(bby, c.y + 1);
    }
    const pulse = 0.6 + 0.3 * Math.sin(this.t * 5);
    const tint = paletteFill(this.piece.piece.color);
    const geo = pieceGeometry(this.cells, cs);
    const fillPolys = (polys: readonly (readonly (readonly [number, number])[])[], rgb: number, alpha: number): void => {
      for (const p of polys) {
        if (p.length < 3) continue;
        const pts = p.map((q) => new Phaser.Math.Vector2(q[0] + ghostX, q[1] + ghostY));
        g.fillStyle(rgb, alpha);
        g.fillPoints(pts, true);
        g.lineStyle(1, rgb, alpha);
        g.strokePoints(pts, true);
      }
    };
    fillPolys(geo.outer, 0xffffff, pulse);
    fillPolys(geo.body, tint.toRgb(), pulse * 0.55);

    const fromX = this.piece.left + this.piece.boxW / 2;
    const fromY = this.piece.top + this.piece.boxH / 2;
    const toX = ghostX + (bbx * cs) / 2;
    const toY = ghostY + (bby * cs) / 2;
    const p = this.t % PERIOD;
    // 0.0-0.35 press, 0.35-1.35 drag, 1.35-1.7 hold & release, then fade out.
    let k = Math.min(Math.max((p - 0.35) / 1.0, 0), 1);
    k = k * k * (3 - 2 * k);
    const atX = fromX + (toX - fromX) * k + 18;
    const atY = fromY + (toY - fromY) * k + 26;
    const pressed = p >= 0.2 && p < 1.5;
    const alpha = Math.min(Math.max((PERIOD - p) / 0.4, 0), 1) * Math.min(Math.max(p / 0.15, 0), 1);
    // A dotted trail from the piece to its spot, so the direction reads at once.
    const steps = 9;
    g.fillStyle(0xffffff, 0.65 * alpha);
    for (let i = 0; i < steps; i++) {
      const q = (i + 1) / (steps + 1);
      g.fillCircle(fromX + (toX - fromX) * q, fromY + (toY - fromY) * q, 7);
    }
    if (pressed) {
      const age = p - 0.2;
      g.lineStyle(5, 0xffffff, 0.7 * alpha);
      g.strokeCircle(atX, atY, 30 + Math.min(age, 0.3) * 40);
    }
    const r = pressed ? 22 : 26;
    g.fillStyle(0x0d0533, 0.3 * alpha);
    g.fillCircle(atX, atY + 5, r + 4);
    g.fillStyle(OUTLINE, alpha);
    g.fillCircle(atX, atY, r + 4);
    g.fillStyle(0xffffff, alpha);
    g.fillCircle(atX, atY, r);
    g.fillCircle(atX - r * 0.3, atY - r * 0.3, r * 0.25);
  }

  destroy(): void {
    if (this.dead) return;
    this.dead = true;
    this.g.destroy();
  }
}
