// The win screen is a photo shoot. The camera flashes, a polaroid of the solved board drops in over a painted scene
// ("# 064", three stars popping in one by one), a pill reads "Well done! You've earned N gems", and the arrows swap
// the photo's backdrop for any scene the player owns. CONTINUE hangs the photo on the timeline and moves on.
// Kept non-blocking: CONTINUE is tappable from the first frame, and the choreography settles in about 1.5 seconds.
// Ports scripts/ui/LevelCompletePanel.gd.

import * as Phaser from 'phaser';
import type { BaseScene } from '../scenes/BaseScene';
import * as Art from '../render/Art';
import { CanvasView } from '../render/CanvasView';
import { Color, hex } from '../render/Color';
import { labelStyle, lineHeight } from '../render/Fonts';
import { GameState } from '../core/GameState';
import { Loc } from '../core/Loc';
import { Sfx } from '../audio/Sfx';
import * as Fx from '../fx/Fx';
import { Z } from '../fx/Fx';
import { PhotoCardView, heightFor } from './PhotoCard';
import { EaseKind, Trans, type Tween } from './Tween';
import { bump, popIn, pulse, runKeyed, stopAll } from './UiFx';
import { iconButton, makeLabel, textButton, type LabelView, type UiButton } from './widgets';

const PHOTO_MAX_W = 440;
const PHOTO_MIN_W = 230;
const DEPTH = Z.panel;

export class LevelCompletePanel {
  onNext: () => void = () => {};
  /** Emitted once the reward count finishes, with the position of the reward gem. */
  onRewardBurst: (fromX: number, fromY: number, amount: number) => void = () => {};

  private block: Phaser.GameObjects.Rectangle;
  private cream: Phaser.GameObjects.Rectangle;
  private column: Phaser.GameObjects.Container;
  private pillBg: CanvasView;
  private pillLabel: LabelView;
  private countLabel: LabelView;
  private photo: PhotoCardView | null = null;
  private prev: UiButton;
  private fwd: UiButton;
  private cont: UiButton;
  private finder: Phaser.GameObjects.Graphics;
  private flash: Phaser.GameObjects.Rectangle;
  private bladeTop: Phaser.GameObjects.Rectangle;
  private bladeBottom: Phaser.GameObjects.Rectangle;

  private index = 0;
  private lastShown = -1;
  private tweens: Tween[] = [];
  // layout results
  private photoRestX = 0;
  private photoRestY = 0;
  private photoW = 300;
  private gemX = 0;
  private gemY = 0;

  constructor(private scene: BaseScene) {
    const s = scene;
    this.block = s.add.rectangle(0, 0, 10, 10, 0xffffff, 0.001).setOrigin(0, 0).setDepth(DEPTH).setInteractive();
    this.cream = s.add.rectangle(0, 0, 10, 10, Art.CREAM.toRgb(), 1).setOrigin(0, 0).setDepth(DEPTH + 0.1);
    this.column = s.add.container(0, 0).setDepth(DEPTH + 0.2);

    // pill
    const thin = labelStyle(26, Art.HUD_TEXT, Art.TEXT_OUTLINE, 0, 'thin');
    this.pillBg = new CanvasView(s, 0, 0, 200, 54, (ci, v) => {
      const sb = Art.box(Art.WHITE, 40);
      sb.shadowColor = new Color(0.45, 0.33, 0.25, 0.12);
      sb.shadowSize = 6;
      sb.shadowOffset = [0, 3];
      ci.drawStyleBox(sb, 0, 0, v.viewW, v.viewH);
      // gem icon at the right end of the row (34x34 cell, margin right 22)
      Art.drawGem(ci, v.viewW - 22 - 17, v.viewH / 2 - 1, 11);
    }, 14);
    this.pillLabel = makeLabel(s, Loc.t('well_done'), thin, { align: 'left' });
    this.countLabel = makeLabel(s, '0', thin, { align: 'left' });
    this.prev = iconButton(s, 'back', Art.HUD_BROWN, 52, Color.TRANSPARENT, true);
    this.prev.onPress = () => this.cycleBg(-1);
    this.prev.sfx = false;
    this.fwd = iconButton(s, 'forward', Art.HUD_BROWN, 52, Color.TRANSPARENT, true);
    this.fwd.onPress = () => this.cycleBg(1);
    this.fwd.sfx = false;
    this.cont = textButton(s, { text: Loc.t('continue'), w: 250, h: 76, accent: Art.HUD_BROWN, flat: true, fontSize: 30 });
    this.cont.onPress = () => this.onNext();
    this.column.add([this.pillBg, this.pillLabel, this.countLabel, this.prev, this.fwd, this.cont]);

    this.finder = s.add.graphics().setDepth(DEPTH + 0.3);
    this.flash = s.add.rectangle(0, 0, 10, 10, 0xffffff, 1).setOrigin(0, 0).setDepth(DEPTH + 0.4).setAlpha(0);
    this.bladeTop = s.add.rectangle(0, 0, 10, 10, hex('#2e231c').toRgb(), 1).setOrigin(0, 0).setDepth(DEPTH + 0.5).setVisible(false);
    this.bladeBottom = s.add.rectangle(0, 0, 10, 10, hex('#2e231c').toRgb(), 1).setOrigin(0, 0).setDepth(DEPTH + 0.5).setVisible(false);
    this.layout();
    this.hidePanel();
  }

  // --- layout ----------------------------------------------------------------------------------------------------------

  layout(): void {
    const W = this.scene.W;
    const H = this.scene.H;
    for (const r of [this.block, this.cream, this.flash]) r.setPosition(0, 0).setSize(W, H);
    this.block.input?.hitArea.setSize(W, H);
    this.layoutColumn();
  }

  private layoutPill(): { w: number; h: number } {
    const lw = this.pillLabel.viewW;
    const cw = this.countLabel.viewW;
    const w = 26 + lw + 8 + cw + 8 + 34 + 22;
    const lh = lineHeight(26);
    const h = 8 + Math.max(lh, 34) + 10;
    return { w, h };
  }

  private layoutColumn(): void {
    const W = this.scene.W;
    const H = this.scene.H;
    this.photoW = Math.min(Math.max(Math.min(W - 2 * 52 - 2 * 14 - 24, H * 0.42), PHOTO_MIN_W), PHOTO_MAX_W);
    const photoH = heightFor(this.photoW);
    if (this.photo && this.photo.viewW !== this.photoW) {
      this.photo.resizeView(this.photoW, photoH);
      this.photo.setPad(Math.ceil(this.photoW * 0.06));
    }
    this.photo?.setPivot(this.photoW / 2, photoH * 0.08);
    const pill = this.layoutPill();
    const colH = pill.h + 40 + photoH + 40 + 76;
    const top = (H - colH) / 2;
    // pill
    const px = (W - pill.w) / 2;
    this.pillBg.resizeView(pill.w, pill.h);
    this.pillBg.setTopLeft(px, top);
    const lh = lineHeight(26);
    const ty = top + 8 + (Math.max(lh, 34) - lh) / 2;
    this.pillLabel.setTopLeft(px + 26, ty);
    this.countLabel.setTopLeft(px + 26 + this.pillLabel.viewW + 8, ty);
    this.gemX = px + pill.w - 22 - 17;
    this.gemY = top + pill.h / 2 - 1;
    // photo row
    const rowW = 52 + 14 + this.photoW + 14 + 52;
    const rowX = (W - rowW) / 2;
    const rowY = top + pill.h + 40;
    this.prev.setTopLeft(rowX, rowY + (photoH - 52) / 2);
    this.fwd.setTopLeft(rowX + rowW - 52, rowY + (photoH - 52) / 2);
    this.photoRestX = rowX + 52 + 14;
    this.photoRestY = rowY;
    this.photo?.setTopLeft(this.photoRestX, this.photoRestY);
    this.cont.setTopLeft((W - 250) / 2, rowY + photoH + 40);
  }

  // --- show / hide --------------------------------------------------------------------------------------------------------

  hidePanel(): void {
    this.killTweens();
    for (const o of [this.block, this.cream, this.flash]) o.setVisible(false);
    this.column.setVisible(false);
    this.finder.setVisible(false);
    this.bladeTop.setVisible(false);
    this.bladeBottom.setVisible(false);
    if (this.block.input) this.block.input.enabled = false;
  }

  showPanel(index: number, _tierName: string, stars: number, diamondsGained: number): void {
    this.killTweens();
    this.index = index;
    let photoRec = GameState.photoFor(index);
    if (!photoRec) photoRec = { stars, bg: GameState.bgForLevel(index), pieces: [] };

    this.photo?.destroy();
    const pw = 300;
    this.photo = new PhotoCardView(this.scene, pw, { index, pieces: photoRec.pieces, bg: Math.trunc(Number(photoRec.bg ?? 0)), stars: 0, empty: false });
    this.photo.setDepth(DEPTH + 0.2);
    this.column.add(this.photo);
    this.layout();
    this.countLabel.setText('0');
    this.layoutColumn();
    this.lastShown = -1;

    for (const o of [this.block, this.flash]) o.setVisible(true);
    if (this.block.input) this.block.input.enabled = true;
    this.cream.setVisible(true).setAlpha(0);
    this.column.setVisible(true).setAlpha(0);
    this.flash.setAlpha(0);
    this.photo.setAlpha(0);
    this.cont.setScale(0);
    this.setFinder(0);
    this.setShutter(0);
    this.finder.setVisible(true);

    // Act 1: the camera lines up on the solved board: brackets close in, the autofocus beeps, the shutter slams
    // shut with its two clicks. One sequential timeline, so it is easy to cut short if a new level is shown.
    const seq = this.scene.tw.create();
    this.tweens.push(seq);
    seq.tweenMethod((k) => this.setFinder(k), 0, 1, 0.42).setTrans(Trans.CUBIC).setEase(EaseKind.OUT);
    seq.tweenCallback(() => Sfx.play('focus', -4));
    seq.tweenInterval(0.16);
    seq.tweenCallback(() => Sfx.play('shutter', -1));
    seq.tweenMethod((k) => this.setShutter(k), 0, 1, 0.07);
    // Act 2: behind the closed shutter the page swaps to the photo.
    seq.tweenCallback(() => this.revealPhoto(stars, diamondsGained));
  }

  /** Shutter closed: swap to the cream page, open the blades with a white flash and let the photo pop out. */
  private revealPhoto(stars: number, gained: number): void {
    const photo = this.photo!;
    this.finder.setVisible(false);
    this.cream.setAlpha(1);
    this.column.setAlpha(1);
    photo.setScale(0.72, 0.72);
    photo.rotation = -0.14;
    const rest = { x: this.photoRestX + photo.viewW * 0, y: this.photoRestY };
    const [tlx, tly] = [rest.x, rest.y];
    photo.setTopLeft(tlx, tly + 70);
    const restPos: [number, number] = [tlx + photo.viewW / 2, tly + photo.viewH * 0.08];
    this.flash.setAlpha(1);

    const entry = this.scene.tw.create().setParallel(true);
    this.tweens.push(entry);
    entry.tweenMethod((k) => this.setShutter(k), 1, 0, 0.12);
    entry.tweenProperty(this.flash, 'alpha', 0, 0.5);
    entry.tweenProperty(photo, 'alpha', 1, 0.1).setDelay(0.08);
    entry.tweenProperty(photo, 'scale', [1, 1], 0.5).setDelay(0.08).setTrans(Trans.BACK).setEase(EaseKind.OUT);
    entry.tweenProperty(photo, 'position', restPos, 0.5).setDelay(0.08).setTrans(Trans.BACK).setEase(EaseKind.OUT);
    entry.tweenProperty(photo, 'rotation', 0, 0.7).setDelay(0.08).setTrans(Trans.ELASTIC).setEase(EaseKind.OUT);
    entry.tweenProperty(this.cont, 'scale', [1, 1], 0.36).setDelay(0.9).setTrans(Trans.BACK).setEase(EaseKind.OUT);
    entry.chain().tweenCallback(() => pulse(this.scene, this.cont, 0.04, 1.1));

    // Act 3: the stars pop in one by one on the finished photo.
    const post = this.scene.tw.create();
    this.tweens.push(post);
    post.tweenInterval(0.62);
    post.tweenCallback(() => {
      Sfx.play('sparkle', -4);
      Fx.confettiRain(this.scene, 0, 0, this.scene.W, 70, DEPTH + 20);
    });
    for (let i = 0; i < stars; i++) {
      post.tweenInterval(0.2);
      post.tweenCallback(() => this.starLanded(i));
    }
    post.tweenInterval(0.2);
    post.tweenCallback(() => this.startCount(gained));
  }

  // --- viewfinder ----------------------------------------------------------------------------------------------------------

  /** 0 = brackets wide at the screen edges, 1 = locked tight on the board. */
  private setFinder(k: number): void {
    const g = this.finder;
    g.clear();
    const W = this.scene.W;
    const H = this.scene.H;
    const outer = { x: 26, y: 26, w: W - 52, h: H - 52 };
    const iw = W * 0.8;
    const ih = H * 0.56;
    const inner = { x: W * 0.5 - iw / 2, y: H * 0.47 - ih / 2, w: iw, h: ih };
    const lerp = (a: number, b: number): number => a + (b - a) * k;
    const r = { x: lerp(outer.x, inner.x), y: lerp(outer.y, inner.y), w: lerp(outer.w, inner.w), h: lerp(outer.h, inner.h) };
    const col = hex('#5b4739');
    const alpha = Math.min(Math.max(k * 6, 0), 1) * 0.9;
    const arm = 52 - 14 * k;
    const w = 6;
    const corners: [number, number, number, number, number, number][] = [
      [r.x, r.y, 1, 0, 0, 1],
      [r.x + r.w, r.y, -1, 0, 0, 1],
      [r.x + r.w, r.y + r.h, -1, 0, 0, -1],
      [r.x, r.y + r.h, 1, 0, 0, -1],
    ];
    g.lineStyle(w, col.toRgb(), alpha);
    for (const [px, py, ax, ay, bx, by] of corners) {
      g.beginPath();
      g.moveTo(px + ax * arm, py + ay * arm);
      g.lineTo(px, py);
      g.lineTo(px + bx * arm, py + by * arm);
      g.strokePath();
      g.fillStyle(col.toRgb(), alpha);
      g.fillCircle(px, py, w * 0.5);
    }
    // Centre cross, with a focus box that appears once the frame is nearly tight.
    const mx = r.x + r.w / 2;
    const my = r.y + r.h / 2;
    g.lineStyle(3, col.toRgb(), alpha);
    g.beginPath();
    g.moveTo(mx - 14, my);
    g.lineTo(mx + 14, my);
    g.moveTo(mx, my - 14);
    g.lineTo(mx, my + 14);
    g.strokePath();
    if (k > 0.85) {
      const b = { x: mx - 44, y: my - 44, w: 88, h: 88 };
      g.lineStyle(3, col.toRgb(), 0.75);
      const bc: [number, number, number, number, number, number][] = [
        [b.x, b.y, 1, 0, 0, 1],
        [b.x + b.w, b.y, -1, 0, 0, 1],
        [b.x + b.w, b.y + b.h, -1, 0, 0, -1],
        [b.x, b.y + b.h, 1, 0, 0, -1],
      ];
      for (const [qx, qy, ax, ay, bx, by] of bc) {
        g.beginPath();
        g.moveTo(qx + ax * 18, qy + ay * 18);
        g.lineTo(qx, qy);
        g.lineTo(qx + bx * 18, qy + by * 18);
        g.strokePath();
      }
    }
  }

  /** 0 = open, 1 = the two blades meet in the middle. */
  private setShutter(k: number): void {
    const W = this.scene.W;
    const H = this.scene.H;
    const half = H * 0.5 * k;
    this.bladeTop.setPosition(0, 0).setSize(W, half + 1);
    this.bladeBottom.setPosition(0, H - half - 1).setSize(W, half + 1);
    this.bladeTop.setVisible(k > 0);
    this.bladeBottom.setVisible(k > 0);
  }

  // --- stars / reward -------------------------------------------------------------------------------------------------------

  private starLanded(i: number): void {
    const photo = this.photo!;
    photo.setStars(i + 1);
    Sfx.play('star_slam', -2, 1 + i * 0.12);
    const sp = photo.starPosition(i);
    const rot = photo.rotation;
    const cx = sp.x * Math.cos(rot) - sp.y * Math.sin(rot) + this.photoRestX;
    const cy = sp.x * Math.sin(rot) + sp.y * Math.cos(rot) + this.photoRestY;
    Fx.starSparkle(this.scene, cx, cy, Art.STAR, 10, 1.1, DEPTH + 20);
    runKeyed(this.scene, photo, 'star', (t) => {
      t.tweenProperty(photo, 'scale', [1.03, 1.03], 0.06);
      t.tweenProperty(photo, 'scale', [1, 1], 0.18).setTrans(Trans.BACK).setEase(EaseKind.OUT);
    });
  }

  private startCount(total: number): void {
    const t = this.scene.tw.create();
    this.tweens.push(t);
    t.tweenMethod((v) => this.setCount(v), 0, total, 0.35);
    t.tweenCallback(() => {
      bump(this.scene, this.countLabel, 0.12);
      this.onRewardBurst(this.gemX, this.gemY, total);
    });
  }

  private setCount(v: number): void {
    const shown = Math.round(v);
    this.countLabel.setText(String(shown));
    this.layoutColumn();
    if (shown !== this.lastShown) {
      this.lastShown = shown;
      Sfx.play('diamond_tick', -3, 1 + shown * 0.04);
    }
  }

  /** Step the photo's backdrop through the scenes the player owns, and remember it. */
  private cycleBg(dir: number): void {
    const photo = this.photo;
    const owned = GameState.unlockedBgs;
    if (!photo || owned.length === 0) return;
    const at = owned.indexOf(photo.photo.bg);
    const next = owned[(((at + dir) % owned.length) + owned.length) % owned.length];
    photo.setBg(next);
    GameState.setPhotoBg(this.index, next);
    Sfx.play('button_tap', -4, 1 + 0.1 * dir);
    runKeyed(this.scene, photo, 'cycle', (t) => {
      t.tweenProperty(photo, 'rotation', 0.03 * dir, 0.06);
      t.tweenProperty(photo, 'rotation', 0, 0.2).setTrans(Trans.BACK).setEase(EaseKind.OUT);
    });
  }

  private killTweens(): void {
    for (const t of this.tweens) if (t.valid) t.kill();
    this.tweens = [];
    if (this.photo) stopAll(this.photo);
    void popIn;
  }
}
