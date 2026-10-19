// Dev-only: renders the art primitives so they can be compared with Godot screenshots (open /?scene=gallery).

import * as Phaser from 'phaser';
import { BaseScene } from './BaseScene';
import * as Art from '../render/Art';
import { CanvasView } from '../render/CanvasView';
import { Color } from '../render/Color';
import { drawLabel, labelStyle } from '../render/Fonts';
import { Mood } from '../core/PieceData';

interface Demo {
  cells: [number, number][];
  color: number;
  eye: [number, number];
  mood: number;
  target: number;
  unhappy?: boolean;
}

// Level 41 (index 40) look-alike: 5-wide board, mixed moods.
const DEMOS: Demo[] = [
  { cells: [[4, 1], [4, 2], [4, 3], [4, 4], [4, 5]], color: 2, eye: [4, 1], mood: Mood.HOSTILE, target: 6 },
  { cells: [[0, 2], [0, 3]], color: 2, eye: [0, 2], mood: Mood.NEUTRAL, target: 0 },
  { cells: [[1, 3], [2, 3], [3, 3], [1, 4], [0, 4]], color: 7, eye: [3, 3], mood: Mood.NEUTRAL, target: 0 },
  { cells: [[2, 5], [3, 5], [1, 5], [0, 5], [2, 4]], color: 3, eye: [2, 4], mood: Mood.AFFECTIONATE, target: 4, unhappy: true },
];

export class GalleryScene extends BaseScene {
  constructor() {
    super('Gallery');
  }

  protected build(): void {
    const W = this.W;
    this.cameras.main.setBackgroundColor('#f9efe6');

    // Board card + pieces.
    const cs = 72;
    const cells: { x: number; y: number }[] = [];
    for (let y = 0; y < 6; y++) for (let x = 0; x < 5; x++) cells.push({ x, y });
    const bx = (W - cs * 5) / 2;
    const by = 160;
    new CanvasView(this, 0, 0, W, 800, (ci) => {
      Art.drawBoard(ci, cells, bx, by, cs);
      for (const d of DEMOS) {
        Art.drawPolyomino(
          ci,
          bx,
          by,
          cs,
          d.cells.map(([x, y]) => ({ x, y })),
          d.color,
          { x: d.eye[0], y: d.eye[1] },
          d.mood,
          d.target,
          !!d.unhappy,
        );
      }
    }, 40);

    // Buttons, icons, text.
    new CanvasView(this, 0, 780, W, 480, (ci) => {
      const sb = Art.styleButton(Art.HUD_BROWN, 500, true);
      ci.drawStyleBox(sb.normal, 40, 20, 80, 80);
      Art.drawIcon(ci, 'back', 80, 56, 24, Art.WHITE);
      ci.drawStyleBox(sb.normal, 140, 20, 80, 80);
      Art.drawIcon(ci, 'help', 180, 56, 24, Art.WHITE);
      ci.drawStyleBox(sb.pressed, 240, 20, 80, 80);
      Art.drawIcon(ci, 'undo', 280, 56, 24, Art.WHITE);
      const play = Art.styleButton(Art.ACCENT_PRIMARY, 500, false);
      ci.drawStyleBox(play.normal, 360, 20, 300, 90);
      const lbl = labelStyle(44, Art.WHITE, play.outline!, 8);
      drawLabel(ci, 'PLAY', 360, 36, 300, 'center', lbl);
      Art.drawGem(ci, 80, 170, 15);
      Art.drawStarFancy(ci, 160, 170, 22, true);
      Art.drawStarFancy(ci, 230, 170, 22, false);
      Art.drawGift(ci, 320, 170, 70);
      Art.drawLock(ci, 420, 170, 40, Art.HUD_TEXT, Art.HUD_TEXT.darkened(0.5));
      const big = labelStyle(54, Art.WHITE, Art.TEXT_OUTLINE);
      drawLabel(ci, 'Level 41 Ăn Đẹp', 40, 230, 640, 'left', big);
      drawLabel(ci, 'Привет Türkçe İ', 40, 310, 640, 'left', labelStyle(40, Art.HUD_TEXT, Color.TRANSPARENT, 0, 'thin'));
    }, 40);

    this.add.rectangle(0, 0, 4, 4, 0xff0000).setOrigin(0, 0);
    void Phaser;
  }
}
