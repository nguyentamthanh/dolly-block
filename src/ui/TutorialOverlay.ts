// How-to-play cards: five short steps, each with a looping code-drawn animation of the rule it teaches (fill the
// board, rotate, hearts, bolts, winning). Shown automatically on a player's first level and again from the HUD's
// "?" button. NEXT walks through the steps; the cross skips them all. Ports scripts/ui/TutorialOverlay.gd.

import * as Phaser from 'phaser';
import type { BaseScene } from '../scenes/BaseScene';
import * as Art from '../render/Art';
import type { CanvasItem, Pt } from '../render/CanvasItem';
import { CanvasView } from '../render/CanvasView';
import { Color } from '../render/Color';
import { drawLabel, drawString, fitFontSize, labelStyle, lineHeight, type LabelStyle } from '../render/Fonts';
import { GameState } from '../core/GameState';
import { Loc } from '../core/Loc';
import { Hue } from '../core/Palette';
import { Mood, PieceData, v } from '../core/PieceData';
import { Sfx } from '../audio/Sfx';
import { Z } from '../fx/Fx';
import { Overlay } from './Overlay';
import { EaseKind, Trans } from './Tween';
import { popIn, runKeyed } from './UiFx';
import { iconButton, textButton, type UiButton } from './widgets';

const CARD_W = 580;
const CARD_H = 790;
const STAGE = { x: 30, y: 108, w: 520, h: 300 };
const STEP_COLORS = [Art.ACCENT_BLUE, Art.ACCENT_GOLD, Art.ACCENT_PINK, Art.BAD_TINT, Art.ACCENT_PRIMARY];
const TITLE_SIZE = 42;
const BODY_SIZE = 26;

const smooth = (x: number): number => x * x * (3 - 2 * x);
const clamp01 = (x: number): number => Math.min(Math.max(x, 0), 1);
const fmod = (a: number, b: number): number => a - b * Math.floor(a / b);

export class TutorialOverlay extends Overlay {
  onFinished: () => void = () => {};

  private card: Phaser.GameObjects.Container;
  private cardView: CanvasView;
  private stage: CanvasView;
  private stageHolder: Phaser.GameObjects.Container;
  private next: UiButton | null = null;
  private step = 0;
  private t = 0;
  private active = false;

  constructor(scene: BaseScene) {
    super(scene, Z.panel + 40, 0x1a0a47, 0.66);
    this.card = scene.add.container(0, 0);
    this.root.add(this.card);
    const L = -CARD_W / 2;
    const T = -CARD_H / 2;

    this.cardView = new CanvasView(scene, L, T, CARD_W, CARD_H, (ci) => this.paintCard(ci), 50);
    this.card.add(this.cardView);

    this.stageHolder = scene.add.container(L + STAGE.x, T + STAGE.y);
    this.stage = new CanvasView(scene, 0, 0, STAGE.w, STAGE.h, (ci) => this.paintStage(ci), 0);
    this.stageHolder.add(this.stage);
    this.card.add(this.stageHolder);

    const close = iconButton(scene, 'close', Art.ACCENT_PINK, 60);
    close.setTopLeft(L + CARD_W - 46, T - 14);
    close.sfx = false;
    close.onPress = () => {
      Sfx.play('button_tap');
      this.close();
    };
    this.card.add(close);
    this.onEscape = () => this.close();
    this.setVisible(false);
  }

  update(dt: number): void {
    if (!this.active) return;
    this.t += dt;
    this.stage.invalidate();
  }

  showTutorial(): void {
    this.layout();
    this.active = true;
    this.setVisible(true);
    this.showStep(0);
    popIn(this.scene, this.card, 0, 0.32);
  }

  private close(): void {
    this.active = false;
    this.setVisible(false);
    this.onFinished();
  }

  // --- steps -----------------------------------------------------------------------------------------------------------

  private showStep(i: number): void {
    this.step = i;
    this.t = 0;
    this.cardView.invalidate();
    this.stage.invalidate();
    const L = -CARD_W / 2;
    const T = -CARD_H / 2;
    this.stageHolder.setPosition(L + STAGE.x, T + STAGE.y);
    this.stageHolder.setAlpha(1);
    if (i > 0) {
      const tx = L + STAGE.x;
      this.stageHolder.setPosition(tx + 60, T + STAGE.y);
      this.stageHolder.setAlpha(0);
      runKeyed(this.scene, this.stageHolder, 'slide', (t) => {
        t.setParallel(true);
        t.tweenProperty(this.stageHolder, 'position', [tx, T + STAGE.y], 0.3).setTrans(Trans.BACK).setEase(EaseKind.OUT);
        t.tweenProperty(this.stageHolder, 'alpha', 1, 0.18);
      });
    }
    // The NEXT button's text changes per step: rebuild it.
    this.next?.destroy();
    const last = i === STEP_COLORS.length - 1;
    const text = last ? Loc.t('lets_play') : Loc.t('next');
    this.next = textButton(this.scene, { text, w: 340, h: 100, accent: Art.ACCENT_PRIMARY, fontSize: fitFontSize(text, 340 - 44, 0, 40, 22) });
    this.next.sfx = false;
    this.next.setTopLeft(L + CARD_W * 0.5 - 170, T + 640);
    this.next.onPress = () => this.onNext();
    this.card.add(this.next);
  }

  private onNext(): void {
    Sfx.play('button_tap');
    if (this.step < STEP_COLORS.length - 1) this.showStep(this.step + 1);
    else this.close();
  }

  // --- painting ----------------------------------------------------------------------------------------------------------

  private paintCard(ci: CanvasItem): void {
    const sb = Art.box(Art.CARD, 44);
    sb.border = [0, 0, 0, 12];
    sb.borderColor = Art.CARD_EDGE;
    sb.shadowColor = new Color(0.05, 0.02, 0.2, 0.4);
    sb.shadowSize = 26;
    sb.shadowOffset = [0, 14];
    ci.drawStyleBox(sb, 0, 0, CARD_W, CARD_H);

    const plain = (size: number, color: Color): LabelStyle => ({
      size, color, kind: 'bold', outlineSize: 0, outlineColor: Color.TRANSPARENT, shadowColor: Color.TRANSPARENT, shadowY: 0, shadowOutline: 0,
    });
    drawLabel(ci, Loc.t('how_to_play'), 0, 18, CARD_W, 'center', plain(20, Art.INK_SOFT));

    const i = this.step;
    const title = Loc.t(`t${i + 1}_title`);
    let body = Loc.t(`t${i + 1}_body`);
    if (i === STEP_COLORS.length - 1) body = body.replace('%d', String(GameState.HINT_COST));
    const titleSize = fitFontSize(title, CARD_W - 40, 0, TITLE_SIZE, 22);
    drawLabel(ci, title, 20, 44, CARD_W - 40, 'center', labelStyle(titleSize, STEP_COLORS[i]));

    // Body: wrapped, centred horizontally and vertically in its 520x150 box.
    const bw = CARD_W - 60;
    const bh = 150;
    const bodySize = fitFontSize(body, bw, bh, BODY_SIZE, 16, true);
    const st = plain(bodySize, Art.INK);
    const lines = this.wrapped(body, bodySize, bw);
    const lh = lineHeight(bodySize);
    const top = 420 + (bh - lines.length * lh) / 2;
    lines.forEach((l, k) => drawLabel(ci, l, 30, top + k * lh, bw, 'center', st));

    // Dots.
    const gap = 30;
    const x0 = CARD_W * 0.5 - gap * (STEP_COLORS.length - 1) * 0.5;
    for (let k = 0; k < STEP_COLORS.length; k++) {
      const cx = x0 + k * gap;
      const cy = 584 + 12;
      if (k === this.step) ci.drawStyleBox(Art.box(Art.ACCENT_PINK, 8), cx - 16, cy - 8, 32, 16);
      else ci.drawCircle(cx, cy, 7, Art.CARD_EDGE.darkened(0.15));
    }
  }

  private wrapped(text: string, size: number, w: number): string[] {
    // Re-use the label wrapper through a throwaway style (width measuring only).
    const lines: string[] = [];
    for (const para of text.split('\n')) {
      let line = '';
      for (const word of para.split(' ')) {
        const trial = line ? `${line} ${word}` : word;
        if (this.measure(trial, size) <= w || !line) line = trial;
        else {
          lines.push(line);
          line = word;
        }
      }
      lines.push(line);
    }
    return lines;
  }

  private measure(s: string, size: number): number {
    const c = document.createElement('canvas').getContext('2d')!;
    c.font = `600 ${size}px Fredoka, "Noto Sans UI", sans-serif`;
    return Math.round(c.measureText(s).width);
  }

  // --- stage animations ----------------------------------------------------------------------------------------------------
  // Each loops on its own period, driven by t (seconds since the step opened).

  private paintStage(ci: CanvasItem): void {
    switch (this.step) {
      case 0:
        return this.drawFill(ci);
      case 1:
        return this.drawRotate(ci);
      case 2:
        return this.drawLove(ci);
      case 3:
        return this.drawHate(ci);
      default:
        return this.drawWin(ci);
    }
  }

  /** A 3x2 board with the top row filled; an orange bar slides up from the tray into the empty bottom row. */
  private drawFill(ci: CanvasItem): void {
    const cs = 66;
    const cells: { x: number; y: number }[] = [];
    for (let y = 0; y < 2; y++) for (let x = 0; x < 3; x++) cells.push({ x, y });
    const ox = (STAGE.w - cs * 3) * 0.5;
    const oy = 34;
    Art.drawBoard(ci, cells, ox, oy, cs);
    const row = [v(0, 0), v(1, 0), v(2, 0)];
    const period = 2.8;
    const p = fmod(this.t, period);
    const move = smooth(clamp01((p - 0.5) / 0.9));
    const placed = p >= 1.4;
    const sx = ox;
    const sy = oy + cs * 2 + 38;
    const tx = ox;
    const ty = oy + cs;
    const px = sx + (tx - sx) * move;
    const py = sy + (ty - sy) * move;
    Art.drawPolyomino(ci, ox, oy, cs, row, Hue.TEAL, v(0, 0), Mood.NEUTRAL, 0, false, { happyEyes: placed });
    if (!placed) {
      const pulse = 0.35 + 0.25 * Math.sin(this.t * 6);
      Art.drawGhost(ci, tx, ty, cs, row, new Color(1, 1, 1, pulse * 0.5), new Color(1, 1, 1, pulse));
    }
    const hop = placed && p < 1.75 ? -Math.abs(Math.sin((p - 1.4) * 9)) * 8 : 0;
    Art.drawPolyomino(ci, px, py + hop, cs, row, Hue.ORANGE, v(2, 0), Mood.NEUTRAL, 0, false, { happyEyes: placed });
    if (!placed) this.drawFinger(ci, px + cs * 1.5, py + cs * 0.6, p > 0.35);
  }

  /** An L piece that turns a quarter every beat, with a tap ripple on each turn. */
  private drawRotate(ci: CanvasItem): void {
    const cs = 62;
    const beat = 1.1;
    const piece = PieceData.make(0, Hue.PURPLE, [v(0, 0), v(0, 1), v(0, 2), v(1, 2)]);
    piece.rot = Math.trunc(this.t / beat) % 4;
    const cells = piece.localCells();
    const bb = piece.bbox();
    const bw = bb.x * cs;
    const bh = bb.y * cs;
    const ox = (STAGE.w - bw) * 0.5;
    const oy = (STAGE.h - bh) * 0.5 + 8;
    const since = fmod(this.t, beat);
    const squash = 1 - 0.08 * Math.max(0, 1 - since / 0.15);
    const cx = ox + bw / 2;
    const cy = oy + bh / 2;
    ci.drawSetTransform(cx, cy, 0, squash, squash);
    Art.drawPolyomino(ci, -bw / 2, -bh / 2, cs, cells, Hue.PURPLE, piece.localEye(), Mood.NEUTRAL, 0, false);
    ci.drawResetTransform();
    // Circular "turn" arrow around the piece.
    const r = Math.max(bw, bh) * 0.5 + 34;
    const a0 = -Math.PI * 0.5 + this.t * 0.8;
    ci.drawArc(cx, cy, r, a0, a0 + Math.PI * 1.4, 40, Art.ACCENT_GOLD.withAlpha(0.9), 7);
    const tipA = a0 + Math.PI * 1.4;
    const tx = cx + Math.cos(tipA) * r;
    const ty = cy + Math.sin(tipA) * r;
    const fx = -Math.sin(tipA);
    const fy = Math.cos(tipA);
    const sx = Math.cos(tipA);
    const sy = Math.sin(tipA);
    const tri: Pt[] = [
      [tx + fx * 16, ty + fy * 16],
      [tx - fx * 4 + sx * 13, ty - fy * 4 + sy * 13],
      [tx - fx * 4 - sx * 13, ty - fy * 4 - sy * 13],
    ];
    ci.drawColoredPolygon(tri, Art.ACCENT_GOLD);
    this.drawFinger(ci, cx + cs * 0.2, cy + cs * 0.3, since < 0.2, since);
  }

  /** A yellow bar that loves blue: alone it waits, then a blue bar slides in and it lights up with ^ ^ eyes. */
  private drawLove(ci: CanvasItem): void {
    const cs = 66;
    const pair = [v(0, 0), v(1, 0)];
    const period = 2.6;
    const p = fmod(this.t, period);
    const slide = smooth(clamp01((p - 0.4) / 0.7));
    const touching = p >= 1.1;
    const y = 128;
    const loverX = STAGE.w * 0.5 - cs * 2;
    const friendFrom = STAGE.w + 10;
    const friendTo = loverX + cs * 2;
    const friendX = friendFrom + (friendTo - friendFrom) * slide;
    const hop = touching && p < 1.45 ? -Math.abs(Math.sin((p - 1.1) * 9)) * 10 : 0;
    Art.drawPolyomino(ci, loverX, y + hop, cs, pair, Hue.YELLOW, v(0, 0), Mood.AFFECTIONATE, Hue.BLUE, false, { happyEyes: touching });
    Art.drawPolyomino(ci, friendX, y, cs, pair, Hue.BLUE, v(1, 0), Mood.NEUTRAL, 0, false);
    if (touching) {
      this.drawVerdict(ci, STAGE.w * 0.5, 54, true);
      this.drawHeartBurst(ci, loverX + cs, y - 6, p - 1.1);
    }
  }

  /** A purple bar that hates green: a green bar slides in, it turns upset (red ring, shiver, red cross), then calms. */
  private drawHate(ci: CanvasItem): void {
    const cs = 66;
    const pair = [v(0, 0), v(1, 0)];
    const period = 3.4;
    const p = fmod(this.t, period);
    const y = 128;
    const haterX = STAGE.w * 0.5 - cs * 2;
    const nearX = haterX + cs * 2;
    const farX = STAGE.w + 10;
    const tIn = clamp01((p - 0.3) / 0.6);
    const tOut = clamp01((p - 2.3) / 0.6);
    const k = smooth(tIn - tOut);
    const otherX = farX + (nearX - farX) * k;
    const touching = p >= 0.9 && p < 2.3;
    const shiver = touching ? Math.sin(this.t * 48) * 3 : 0;
    Art.drawPolyomino(ci, haterX + shiver, y, cs, pair, Hue.PURPLE, v(0, 0), Mood.HOSTILE, Hue.GREEN, touching, { ringPulse: 0.75 + 0.25 * Math.sin(this.t * 8) });
    Art.drawPolyomino(ci, otherX, y, cs, pair, Hue.GREEN, v(1, 0), Mood.NEUTRAL, 0, false);
    if (touching) this.drawVerdict(ci, STAGE.w * 0.5, 54, false);
    else if (p >= 2.9 || p < 0.3) this.drawVerdict(ci, STAGE.w * 0.5, 54, true);
  }

  /** Three stars popping in turn above the Undo and Hint buttons. */
  private drawWin(ci: CanvasItem): void {
    const period = 2.4;
    const p = fmod(this.t, period);
    const cx = STAGE.w * 0.5;
    for (let i = 0; i < 3; i++) {
      const appear = clamp01((p - i * 0.25) / 0.2);
      const r = (i === 1 ? 34 : 28) * (0.6 + 0.4 * appear);
      Art.drawStarFancy(ci, cx + (i - 1) * 92, i === 1 ? 70 : 84, r, appear >= 1);
    }
    const specs = [
      { kind: 'undo', col: Art.ACCENT_BLUE, label: Loc.t('undo'), x: cx - 90 },
      { kind: 'hint', col: Art.ACCENT_GOLD, label: Loc.t('hint'), x: cx + 90 },
    ];
    for (const s of specs) {
      ci.drawCircle(s.x, 206, 38, s.col.darkened(0.28));
      ci.drawCircle(s.x, 200, 38, s.col);
      Art.drawIcon(ci, s.kind, s.x, 202, 12, s.col.darkened(0.45));
      Art.drawIcon(ci, s.kind, s.x, 200, 12, Art.WHITE);
      drawString(ci, s.label, s.x - 60, 274, 120, 'center', 'bold', 24, Art.INK);
    }
  }

  /** A cartoon fingertip: white disc with the sticker outline. `pressed` adds a ripple that grows over `age`. */
  private drawFinger(ci: CanvasItem, x: number, y: number, pressed: boolean, age = 0): void {
    if (pressed) {
      const rr = 30 + age * 90;
      const a = age > 0 ? clamp01(1 - age / 0.4) * 0.8 : 0.6;
      ci.drawArc(x, y, rr, 0, Math.PI * 2, 32, new Color(1, 1, 1, a), 5);
    }
    const r = pressed ? 22 : 25;
    ci.drawCircle(x, y + 4, r + 4, new Color(0.05, 0.02, 0.2, 0.25));
    ci.drawCircle(x, y, r + 4, Art.INK);
    ci.drawCircle(x, y, r, Art.WHITE);
    ci.drawCircle(x - r * 0.3, y - r * 0.3, r * 0.25, new Color(1, 1, 1, 0.9));
  }

  /** Green tick (good) or red cross (bad) in a round badge. */
  private drawVerdict(ci: CanvasItem, x: number, y: number, good: boolean): void {
    const col = good ? Art.OK_TINT : Art.BAD_TINT;
    ci.drawCircle(x, y + 4, 30, col.darkened(0.3));
    ci.drawCircle(x, y, 30, col);
    const w = 8;
    if (good) {
      ci.drawPolyline([[x - 13, y], [x - 3, y + 10], [x + 14, y - 10]], Art.WHITE, w);
    } else {
      ci.drawLine(x - 11, y - 11, x + 11, y + 11, Art.WHITE, w);
      ci.drawLine(x + 11, y - 11, x - 11, y + 11, Art.WHITE, w);
    }
  }

  /** Little hearts drifting up from (x, y) for `age` seconds after the match. */
  private drawHeartBurst(ci: CanvasItem, x: number, y: number, age: number): void {
    if (age > 1.2) return;
    const a = clamp01(1 - age / 1.2);
    for (let i = 0; i < 3; i++) {
      Art.drawHeart(ci, x + (i - 1) * 34, y - age * 70 - Math.abs(i - 1) * 8, 22, Art.ACCENT_PINK.withAlpha(a));
    }
  }
}
