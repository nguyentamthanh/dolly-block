// Level-10 coach mark: a fingertip taps a tray piece that is facing the wrong way, and a gold arrow sweeps round it to
// say "this turns it". Loops until the player touches any piece (GameScene frees it then). Positions are re-read
// every frame, so it follows relayouts. Sibling of DragGuide, for the tap-to-rotate skill that unlocks here.

import * as Phaser from 'phaser';
import type { GameScene } from '../scenes/GameScene';
import { Z } from '../fx/Fx';
import type { PieceView } from './PieceView';

const PERIOD = 2.4;
const OUTLINE = 0x2b1d4e;
const GOLD = 0xffc83d;

const clamp01 = (x: number): number => Math.min(Math.max(x, 0), 1);
const smooth = (x: number): number => x * x * (3 - 2 * x);

export class RotateGuide {
  private g: Phaser.GameObjects.Graphics;
  private t = 0;
  private dead = false;

  constructor(
    scene: GameScene,
    private piece: PieceView,
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
    const cx = this.piece.left + this.piece.boxW / 2;
    const cy = this.piece.top + this.piece.boxH / 2;
    const p = this.t % PERIOD;
    // 0.0-0.5 finger comes in, 0.5-0.7 press, 0.7-1.7 piece "turns" (arrow sweeps), then fade out.
    const fade = clamp01((PERIOD - p) / 0.4) * clamp01(p / 0.15);
    const radius = Math.max(this.piece.boxW, this.piece.boxH) * 0.5 + 22;

    // Soft ring that marks which piece to tap.
    const pulse = 0.5 + 0.3 * Math.sin(this.t * 6);
    g.lineStyle(5, 0xffffff, pulse * fade);
    g.strokeCircle(cx, cy, radius);

    // Quarter-turn arrow around the piece, drawn over the press.
    const sweep = smooth(clamp01((p - 0.7) / 0.9));
    if (sweep > 0) {
      const a0 = -Math.PI * 0.75;
      const a1 = a0 + Math.PI * 0.5 * sweep + 0.001;
      g.lineStyle(9, OUTLINE, fade);
      g.beginPath();
      g.arc(cx, cy, radius + 14, a0, a1, false);
      g.strokePath();
      g.lineStyle(6, GOLD, fade);
      g.beginPath();
      g.arc(cx, cy, radius + 14, a0, a1, false);
      g.strokePath();
      const tx = cx + Math.cos(a1) * (radius + 14);
      const ty = cy + Math.sin(a1) * (radius + 14);
      const fx = -Math.sin(a1);
      const fy = Math.cos(a1);
      const sx = Math.cos(a1);
      const sy = Math.sin(a1);
      const tri = [
        new Phaser.Math.Vector2(tx + fx * 18, ty + fy * 18),
        new Phaser.Math.Vector2(tx - fx * 4 + sx * 14, ty - fy * 4 + sy * 14),
        new Phaser.Math.Vector2(tx - fx * 4 - sx * 14, ty - fy * 4 - sy * 14),
      ];
      g.fillStyle(GOLD, fade);
      g.fillPoints(tri, true);
      g.lineStyle(3, OUTLINE, fade);
      g.strokePoints(tri, true);
    }

    // Fingertip: slides in from below-right, presses, then lifts.
    const come = smooth(clamp01(p / 0.5));
    const atX = cx + 18 + (1 - come) * 70;
    const atY = cy + 26 + (1 - come) * 70;
    const pressed = p >= 0.5 && p < 1.0;
    if (pressed) {
      const age = p - 0.5;
      g.lineStyle(5, 0xffffff, 0.7 * fade);
      g.strokeCircle(atX, atY, 30 + Math.min(age, 0.3) * 60);
    }
    const r = pressed ? 22 : 26;
    g.fillStyle(0x0d0533, 0.3 * fade);
    g.fillCircle(atX, atY + 5, r + 4);
    g.fillStyle(OUTLINE, fade);
    g.fillCircle(atX, atY, r + 4);
    g.fillStyle(0xffffff, fade);
    g.fillCircle(atX, atY, r);
    g.fillCircle(atX - r * 0.3, atY - r * 0.3, r * 0.25);
  }

  destroy(): void {
    if (this.dead) return;
    this.dead = true;
    this.g.destroy();
  }
}
