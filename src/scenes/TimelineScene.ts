// The home screen: a rope running down a cream page with one polaroid hung from it per solved level, oldest at the
// top, and a big "LEVEL N" button at the bottom that plays the next one. Every win adds a photo to the rope.
// Top bar: star and gem counts, and a menu button (home, sound). A gift box floats on the right edge for the daily
// gem gift. Ports scripts/ui/Timeline.gd (the Godot ScrollContainer becomes drag + wheel scrolling with inertia).

import * as Phaser from 'phaser';
import { BaseScene } from './BaseScene';
import { go } from './nav';
import * as Art from '../render/Art';
import { CanvasItem } from '../render/CanvasItem';
import { CanvasView } from '../render/CanvasView';
import { Color, hex } from '../render/Color';
import { drawLabel, labelStyle, lineHeight, textWidth } from '../render/Fonts';
import { GameState, type PhotoRecord } from '../core/GameState';
import { Loc } from '../core/Loc';
import { Sfx } from '../audio/Sfx';
import * as Fx from '../fx/Fx';
import { Z } from '../fx/Fx';
import { PlatformSdk } from '../platform/PlatformSdk';
import { Overlay } from '../ui/Overlay';
import { PhotoCardView, heightFor } from '../ui/PhotoCard';
import { cloud } from '../ui/Scenery';
import { bump, popIn, pulse } from '../ui/UiFx';
import { DiamondChip, UiButton, iconButton, makeLabel, textButton, type LabelView } from '../ui/widgets';

const GAP = 78; // rope showing between two photos
const TOP_SPACE = 132; // clears the top bar
const BOTTOM_SPACE = 178; // clears the LEVEL button
const CLICK_SLOP = 12; // a drag longer than this is a scroll, not a tap
const CHUNK = 1000; // height of one rope/cloud canvas

interface Card {
  index: number;
  view: PhotoCardView;
  pin: CanvasView;
  x: number;
  y: number;
  hasPhoto: boolean;
}

export class TimelineScene extends BaseScene {
  private strip!: Phaser.GameObjects.Container;
  private chunks: CanvasView[] = [];
  private cards: Card[] = [];
  private scrollbar!: Phaser.GameObjects.Graphics;
  private scrollY = 0;
  private contentH = 0;
  private ropeEnd = 0;
  private photoW = 300;
  private photoH = 364;

  private starChip!: CanvasView;
  private starCount = '0';
  private gemChip!: DiamondChip;
  private menuBtn!: UiButton;
  private giftBtn!: UiButton;
  private playBtn!: UiButton;
  private toastView!: CanvasView;
  private toastLabel!: LabelView;
  private overlay: Overlay | null = null;
  private overlayParts: Phaser.GameObjects.GameObject[] = [];
  private built = false;

  // pointer / scroll state
  private pressId = -1;
  private pressX = 0;
  private pressY = 0;
  private pressScroll = 0;
  private dragging = false;
  private velocity = 0;
  private lastMoveY = 0;
  private lastMoveT = 0;
  private starChipW = 96;
  private stripW = 720;

  constructor() {
    super('Timeline');
  }

  protected build(): void {
    GameState.ensureLoaded();
    this.cameras.main.setBackgroundColor('#f9efe6');
    this.add.rectangle(-40, -40, 10, 10, Art.CREAM.toRgb()).setOrigin(0, 0).setDepth(-10).setName('bg');

    this.strip = this.add.container(0, 0).setDepth(2);
    this.buildPhotos();
    this.scrollbar = this.add.graphics().setDepth(Z.pieces + 5);
    this.buildTopBar();
    this.buildGift();
    this.buildPlay();
    this.buildToast();

    this.relayout();
    this.scrollY = this.maxScroll();
    this.applyScroll();

    this.input.on('pointerdown', (p: Phaser.Input.Pointer, over: unknown[]) => this.onDown(p, over));
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.onMove(p));
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => this.onUp(p));
    this.input.on('pointerupoutside', (p: Phaser.Input.Pointer) => this.onUp(p));
    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => {
      if (this.overlay) return;
      this.velocity = 0;
      this.scrollY = this.clampScroll(this.scrollY + dy * 1.2);
      this.applyScroll();
    });

    this.playBtn.setScale(0);
    popIn(this, this.playBtn, 0.2);
    const t = this.tw.create();
    t.tweenInterval(0.8);
    t.tweenCallback(() => pulse(this, this.playBtn, 0.035, 1.2));
    this.built = true;
  }

  protected onResize(): void {
    if (!this.built) return;
    const atBottom = this.scrollY >= this.maxScroll() - 1;
    this.relayout();
    this.scrollY = atBottom ? this.maxScroll() : this.clampScroll(this.scrollY);
    this.applyScroll();
    this.overlay?.layout();
  }

  update(time: number, deltaMs: number): void {
    super.update(time, deltaMs);
    // inertia
    if (!this.dragging && Math.abs(this.velocity) > 5) {
      const dt = Math.min(deltaMs, 100) / 1000;
      this.scrollY = this.clampScroll(this.scrollY + this.velocity * dt);
      this.velocity *= Math.exp(-dt * 4.5);
      if (this.scrollY <= 0 || this.scrollY >= this.maxScroll()) this.velocity = 0;
      this.applyScroll();
    } else if (!this.dragging) {
      this.velocity = 0;
    }
  }

  // --- building -------------------------------------------------------------------------------------------------------

  private buildPhotos(): void {
    // Every solved level, oldest first. A cleared level with no saved photo (an older save) still gets a bare scene
    // so the rope is never missing a rung.
    const levels = new Set<number>();
    for (const i of GameState.photoLevels()) levels.add(i);
    for (const k of Object.keys(GameState.starsAt)) levels.add(Math.trunc(Number(k)));
    const ordered = [...levels].sort((a, b) => a - b);
    for (const idx of ordered) {
      let photo: PhotoRecord | undefined = GameState.photoFor(idx);
      if (!photo) photo = { stars: GameState.starsFor(idx), bg: GameState.bgForLevel(idx), pieces: [] };
      this.addPhoto(idx, photo, true);
    }
    if (this.cards.length === 0) this.addPhoto(0, null, false); // a new player: one blank frame
  }

  private addPhoto(index: number, photo: PhotoRecord | null, hasPhoto: boolean): void {
    const w = 300;
    const view = new PhotoCardView(this, w, {
      index,
      pieces: photo?.pieces ?? [],
      bg: Math.trunc(Number(photo?.bg ?? 0)),
      stars: Math.trunc(Number(photo?.stars ?? 0)),
      empty: !photo,
    });
    const pin = new CanvasView(this, 0, 0, 30, 70, (ci) => this.paintPin(ci), 12);
    pin.setPivot(15, 28);
    this.strip.add([view]);
    this.cards.push({ index, view, pin, x: 0, y: 0, hasPhoto });
  }

  /** The wooden peg, drawn over the photo. Origin (15, 28) is the peg's clip point (c.x, c.y - 28 + ...). */
  private paintPin(ci: CanvasItem): void {
    // In Godot: c = card top-centre + (0, 8); body = (c.x-13, c.y-28, 26, 70).
    const bx = 2;
    const by = 0;
    ci.drawStyleBox(Art.box(new Color(0.35, 0.25, 0.18, 0.18), 7), bx + 2, by + 3, 26 - 0, 70);
    ci.drawStyleBox(Art.box(hex('#e5b487'), 7), bx, by, 26, 70);
    ci.drawLine(15, by + 6, 15, by + 70 - 6, hex('#c98f5e'), 2);
    ci.drawStyleBox(Art.box(hex('#a97a50'), 3), 0, 28 + 4, 30, 9);
    ci.drawCircle(15, 28 + 8.5, 2.2, hex('#7d5733'));
  }

  private buildTopBar(): void {
    this.starChip = new CanvasView(this, 0, 0, 96, 52, (ci, v) => this.paintStarChip(ci, v.viewW, v.viewH), 12);
    this.starChip.setDepth(Z.pieces + 6);
    this.setStarCount(GameState.totalStars());

    this.gemChip = new DiamondChip(this, true);
    this.gemChip.setDepth(Z.pieces + 6);
    this.gemChip.setCount(GameState.diamonds);

    this.menuBtn = iconButton(this, 'menu', Art.HUD_BROWN, 64, Color.TRANSPARENT, true);
    this.menuBtn.setDepth(Z.pieces + 6);
    this.menuBtn.onPress = () => this.openMenu();
  }

  private paintStarChip(ci: CanvasItem, w: number, h: number): void {
    const sb = Art.box(Art.WHITE, 26);
    sb.shadowColor = new Color(0.45, 0.33, 0.25, 0.14);
    sb.shadowSize = 6;
    sb.shadowOffset = [0, 3];
    ci.drawStyleBox(sb, 0, 0, w, h);
    const rowTop = 4;
    const rowH = h - 4 - 6;
    Art.drawStar(ci, 12 + 15, rowTop + rowH / 2, 14, Art.STAR);
    const st = { ...labelStyle(26, Art.HUD_TEXT, Art.TEXT_OUTLINE, 0), shadowColor: Color.TRANSPARENT };
    drawLabel(ci, this.starCount, 12 + 30 + 8, rowTop + (rowH - lineHeight(26)) / 2, w, 'left', st);
  }

  private setStarCount(n: number): void {
    this.starCount = String(n);
    this.starChipW = Math.max(96, 12 + 30 + 8 + textWidth(this.starCount, 'bold', 26) + 16);
    this.starChip.resizeView(this.starChipW, 52);
  }

  private buildGift(): void {
    this.giftBtn = new UiButton(this, 76, 76, (ci, w, h) => {
      const c = w * 0.5;
      Art.drawGift(ci, c, h * 0.5, 52);
      if (!GameState.canGift()) {
        ci.drawRect(0, 0, w, h, Art.CREAM.withAlpha(0.55));
      } else {
        // A red dot: there is a gift waiting.
        ci.drawCircle(c + 24, h * 0.5 - 24, 9, Color.WHITE);
        ci.drawCircle(c + 24, h * 0.5 - 24, 6.5, hex('#e5534b'));
      }
    }, { pad: 8, sfx: false });
    this.giftBtn.setDepth(Z.pieces + 6);
    this.giftBtn.onPress = () => this.onGift();
  }

  private buildPlay(): void {
    this.playBtn = textButton(this, {
      text: Loc.fmt('level_caps', GameState.highestUnlocked + 1),
      w: 300,
      h: 84,
      accent: Art.HUD_BROWN,
      flat: true,
      fontSize: 36,
    });
    this.playBtn.sfx = false;
    this.playBtn.setDepth(Z.pieces + 6);
    this.playBtn.onPress = () => this.onPlay();
  }

  private buildToast(): void {
    this.toastView = new CanvasView(this, 0, 0, 100, 42, (ci, v) => ci.drawStyleBox(Art.box(new Color(0.36, 0.28, 0.24, 0.92), 22), 0, 0, v.viewW, v.viewH), 4);
    this.toastView.setDepth(Z.toast).setAlpha(0);
    this.toastLabel = makeLabel(this, ' ', labelStyle(20, Art.WHITE, Art.TEXT_OUTLINE, 0), { align: 'center' });
    this.toastLabel.setDepth(Z.toast + 1).setAlpha(0);
  }

  // --- layout / scrolling -------------------------------------------------------------------------------------------------

  private maxScroll(): number {
    return Math.max(0, this.contentH - this.H);
  }

  private clampScroll(y: number): number {
    return Math.min(Math.max(y, 0), this.maxScroll());
  }

  private applyScroll(): void {
    this.strip.setPosition(0, -this.scrollY);
    for (const c of this.cards) c.pin.setPosition(c.x + this.photoW / 2, c.y + 8 - this.scrollY);
    this.drawScrollbar();
  }

  private drawScrollbar(): void {
    const g = this.scrollbar;
    g.clear();
    const max = this.maxScroll();
    if (max <= 0) return;
    const W = this.W;
    const H = this.H;
    // Godot's default scrollbar: an 8px column at the right edge with a lighter grabber.
    g.fillStyle(0x736f6b, 1);
    g.fillRect(W - 8, 0, 8, H);
    const grabH = Math.max(24, (H * H) / this.contentH);
    const grabY = (this.scrollY / max) * (H - grabH);
    g.fillStyle(0xaba9a6, 1);
    g.fillRect(W - 8, grabY, 8, grabH);
  }

  /** Width of the scrolling content: the scrollbar takes 8px of the page when there is something to scroll. */
  private stripWidth(): number {
    const H = this.H;
    const probe = (w: number): number => {
      const pw = Math.min(Math.max(w * 0.56, 220), 400);
      return Math.max(H, TOP_SPACE + this.cards.length * (heightFor(pw) + GAP) + BOTTOM_SPACE - GAP);
    };
    return probe(this.W) > H ? this.W - 8 : this.W;
  }

  private relayout(): void {
    const W = this.stripWidth();
    const H = this.H;
    (this.children.getByName('bg') as Phaser.GameObjects.Rectangle).setPosition(-40, -40).setSize(this.W + 80, H + 80);
    this.photoW = Math.min(Math.max(W * 0.56, 220), 400);
    this.photoH = heightFor(this.photoW);
    let y = TOP_SPACE;
    this.cards.forEach((c, i) => {
      c.view.setScale(1);
      if (c.view.viewW !== this.photoW) c.view.resizeView(this.photoW, this.photoH);
      c.view.setPad(Math.ceil(this.photoW * 0.06));
      c.view.setPivot(this.photoW / 2, 10);
      c.x = (W - this.photoW) / 2;
      c.y = y;
      c.view.setTopLeft(c.x, c.y);
      // Each photo hangs a hair off level, like real pegged prints.
      c.view.rotation = ((i * 7) % 5 - 2) * 0.007;
      c.pin.setDepth(Z.pieces + 1);
      y += this.photoH + GAP;
    });
    this.ropeEnd = y;
    this.contentH = Math.max(H, y + BOTTOM_SPACE - GAP);
    this.stripW = W;
    this.rebuildChunks();

    // top bar (full page width: it floats over the scroll area)
    const FW = this.W;
    const m = Math.max(18, (FW - 900) * 0.5);
    this.starChip.setPosition(m, 22 + (64 - 52) / 2);
    this.gemChip.setTopLeft(m + this.starChipW + 10, 22 + (64 - 52) / 2);
    this.menuBtn.setTopLeft(FW - m - 64, 22);
    this.giftBtnLayout();
    this.playBtn.setTopLeft((FW - 300) / 2, H - 44 - 84);
    this.layoutToast();
    this.drawScrollbar();
  }

  private giftBtnLayout(): void {
    const W = this.W;
    const H = this.H;
    this.giftBtn.setTopLeft(W - 96, H * 0.5 + 40);
  }

  private layoutToast(): void {
    const lw = this.toastLabel.viewW;
    const w = lw + 40;
    this.toastView.resizeView(w, 42);
    const y = 110 + (60 - 42) / 2;
    this.toastView.setPosition((this.W - w) / 2, y);
    this.toastLabel.setTopLeft((this.W - lw) / 2, y + 8);
  }

  /** The rope and clouds, painted in tall chunks so no canvas gets near the GPU texture size limit. */
  private rebuildChunks(): void {
    for (const c of this.chunks) c.destroy();
    this.chunks = [];
    const W = this.stripW;
    const total = this.contentH;
    for (let y0 = 0; y0 < total; y0 += CHUNK) {
      const h = Math.min(CHUNK, total - y0);
      const v = new CanvasView(this, 0, y0, W, h, (ci) => this.paintStrip(ci, y0, W), 0);
      v.setDepth(0);
      this.strip.add(v);
      this.chunks.push(v);
    }
    this.strip.sendToBack(this.chunks[0] ?? this.strip);
    for (const c of this.chunks) this.strip.sendToBack(c);
  }

  private paintStrip(ci: CanvasItem, y0: number, w: number): void {
    ci.ctx.save();
    ci.ctx.translate(0, -y0);
    const cx = w * 0.5;
    const ropeEnd = Math.max(this.ropeEnd, this.contentH);
    // Clouds first, so the rope and photos overlap them.
    const space = (w - this.photoW) * 0.5;
    if (space > 46) {
      for (let k = 0; k < this.cards.length + 1; k++) {
        const s = Math.min(this.photoW * 0.4, space * 1.5);
        const side = k % 2;
        const x = side === 0 ? space * 0.5 : w - space * 0.5;
        const y = TOP_SPACE + k * (this.photoH + GAP) + this.photoH * (side === 0 ? 0.28 : 0.7) - GAP * 0.4;
        cloud(ci, x, y + 5, s, hex('#efe2d6'));
        cloud(ci, x, y, s, Color.WHITE);
      }
    }
    // The rope: a tan cord with a light edge and slanted twist marks.
    ci.drawLine(cx, -4, cx, ropeEnd, hex('#cda47d'), 9);
    ci.drawLine(cx - 3, -4, cx - 3, ropeEnd, hex('#dfbc99'), 2);
    for (let y = 0; y < ropeEnd; y += 10) {
      if (y + 6 < y0 - 20 || y > y0 + CHUNK + 20) continue;
      ci.drawLine(cx - 4.5, y + 1, cx + 4.5, y + 6, hex('#a9805a'), 2);
    }
    ci.ctx.restore();
  }

  // --- pointer ------------------------------------------------------------------------------------------------------------

  private onDown(p: Phaser.Input.Pointer, over: unknown[]): void {
    if (this.overlay || over.length > 0 || this.pressId !== -1) return;
    const pt = this.logical(p);
    this.pressId = p.id;
    this.pressX = pt.x;
    this.pressY = pt.y;
    this.pressScroll = this.scrollY;
    this.dragging = false;
    this.velocity = 0;
    this.lastMoveY = pt.y;
    this.lastMoveT = performance.now();
  }

  private onMove(p: Phaser.Input.Pointer): void {
    if (p.id !== this.pressId) return;
    const pt = this.logical(p);
    if (!this.dragging && Math.hypot(pt.x - this.pressX, pt.y - this.pressY) > CLICK_SLOP) this.dragging = true;
    if (!this.dragging) return;
    this.scrollY = this.clampScroll(this.pressScroll - (pt.y - this.pressY));
    const now = performance.now();
    const dt = (now - this.lastMoveT) / 1000;
    if (dt > 0.001) {
      const v = -(pt.y - this.lastMoveY) / dt;
      this.velocity = this.velocity * 0.6 + v * 0.4;
    }
    this.lastMoveY = pt.y;
    this.lastMoveT = now;
    this.applyScroll();
  }

  private onUp(p: Phaser.Input.Pointer): void {
    if (p.id !== this.pressId) return;
    this.pressId = -1;
    const pt = this.logical(p);
    if (this.dragging) {
      this.dragging = false;
      if (performance.now() - this.lastMoveT > 80) this.velocity = 0;
      return;
    }
    if (Math.hypot(pt.x - this.pressX, pt.y - this.pressY) > CLICK_SLOP || this.overlay) return;
    // A tap: which photo is under the finger?
    const sy = pt.y + this.scrollY;
    for (const c of this.cards) {
      if (!c.hasPhoto) continue;
      if (pt.x >= c.x && pt.x <= c.x + this.photoW && sy >= c.y && sy <= c.y + this.photoH) {
        Sfx.play('button_tap');
        Sfx.play('whoosh', -4);
        GameState.currentLevel = c.index;
        go(this, 'Game');
        return;
      }
    }
  }

  // --- actions --------------------------------------------------------------------------------------------------------------

  private onPlay(): void {
    Sfx.play('button_tap');
    Sfx.play('whoosh', -4);
    GameState.currentLevel = GameState.highestUnlocked;
    go(this, 'Game');
  }

  private onGift(): void {
    Sfx.play('button_tap');
    if (!GameState.canGift()) {
      this.flash(Loc.t('gift_wait'));
      return;
    }
    this.openGift();
  }

  private flash(msg: string, hold = 1.8): void {
    this.toastLabel.setText(msg);
    this.layoutToast();
    this.toastView.setAlpha(1);
    this.toastLabel.setAlpha(1);
    popIn(this, this.toastLabel, 0, 0.25);
    popIn(this, this.toastView, 0, 0.25);
    const t = this.tw.create();
    t.tweenInterval(hold);
    t.setParallel(true);
    t.tweenProperty(this.toastView, 'alpha', 0, 0.4);
    t.tweenProperty(this.toastLabel, 'alpha', 0, 0.4);
  }

  // --- popups ------------------------------------------------------------------------------------------------------------------

  /** A dimmed page with a cream card in the middle; returns the card's container (centre origin). */
  private openPopup(cardW: number, cardH: number): Phaser.GameObjects.Container {
    this.closeOverlay();
    const ov = new Overlay(this, Z.panel - 200, 0x4d3830, 0.5);
    this.overlay = ov;
    ov.dim.on('pointerdown', () => this.closeOverlay());
    ov.onEscape = () => this.closeOverlay();
    const card = this.add.container(0, 0);
    ov.root.add(card);
    const view = new CanvasView(this, -cardW / 2, -cardH / 2, cardW, cardH, (ci) => ci.drawStyleBox(Art.box(Art.CREAM, 40), 0, 0, cardW, cardH), 20);
    card.add(view);
    ov.layout();
    ov.setVisible(true);
    popIn(this, card, 0, 0.3);
    ov.dim.setAlpha(0);
    const t = this.tw.create();
    t.tweenProperty(ov.dim, 'alpha', 1, 0.2);
    return card;
  }

  private closeOverlay(): void {
    if (!this.overlay) return;
    this.overlay.dim.destroy();
    this.overlay.root.destroy();
    for (const o of this.overlayParts) o.destroy();
    this.overlayParts = [];
    this.overlay = null;
  }

  private popupButton(text: string, w: number, cb: () => void): UiButton {
    const b = textButton(this, { text, w, h: 68, accent: Art.HUD_BROWN, flat: true, fontSize: 28 });
    b.sfx = true;
    b.onPress = cb;
    return b;
  }

  private openMenu(): void {
    const cw = 360;
    const titleH = lineHeight(34);
    const buttons = PlatformSdk.hideSoundToggle ? 2 : 3;
    const ch = 24 + titleH + 22 + 68 * buttons + 22 * (buttons - 1) + 28;
    const card = this.openPopup(cw, ch);
    const L = -cw / 2;
    const T = -ch / 2;
    const title = makeLabel(this, Loc.t('menu'), labelStyle(34, Art.HUD_TEXT, Art.TEXT_OUTLINE, 0), { align: 'center', boxW: cw - 56 });
    title.setTopLeft(L + 28, T + 24);
    card.add(title);
    let y = T + 24 + titleH + 22;
    const home = this.popupButton(Loc.t('home'), 280, () => {
      Sfx.play('whoosh', -4);
      go(this, 'MainMenu');
    });
    home.sfx = true;
    home.setTopLeft(L + (cw - 280) / 2, y);
    card.add(home);
    y += 68 + 22;
    if (!PlatformSdk.hideSoundToggle) {
      const soundText = (): string => (GameState.soundEnabled ? Loc.t('sound_on') : Loc.t('sound_off'));
      let soundBtn = this.popupButton(soundText(), 280, () => {});
      const place = (): void => {
        soundBtn.setTopLeft(L + (cw - 280) / 2, y);
        card.add(soundBtn);
        soundBtn.onPress = () => {
          GameState.soundEnabled = !GameState.soundEnabled;
          GameState.saveProgress();
          const old = soundBtn;
          soundBtn = this.popupButton(soundText(), 280, () => {});
          old.destroy();
          place();
        };
      };
      place();
      y += 68 + 22;
    }
    const close = this.popupButton(Loc.t('close'), 280, () => this.closeOverlay());
    close.setTopLeft(L + (cw - 280) / 2, y);
    card.add(close);
  }

  private openGift(): void {
    const cw = 420;
    const noteH = lineHeight(28);
    const ch = 24 + 56 + 22 + 220 + 22 + noteH + 22 + 68 + 28;
    const card = this.openPopup(cw, ch);
    const L = -cw / 2;
    const T = -ch / 2;
    const chip = new DiamondChip(this, true);
    chip.setCount(GameState.diamonds);
    chip.setTopLeft(L + 28, T + 24 + (56 - 52) / 2);
    card.add(chip);
    const close = iconButton(this, 'close', Art.HUD_BROWN, 56, Color.TRANSPARENT, true);
    close.setTopLeft(L + cw - 28 - 56, T + 24);
    close.onPress = () => this.closeOverlay();
    card.add(close);

    let opened = false;
    const stage = new CanvasView(this, L + 28, T + 24 + 56 + 22, cw - 56, 220, (ci, v) => {
      const bob = Math.sin(performance.now() * 0.004) * 5;
      if (!opened) Art.drawGift(ci, v.viewW / 2, 110 + bob, 190);
      else Art.drawGem(ci, v.viewW / 2, 110 - 6, 48);
    }, 10);
    card.add(stage);
    const redraw = this.tw.create().setLoops();
    redraw.tweenCallback(() => stage.invalidate());
    redraw.tweenInterval(0.03);

    const note = makeLabel(this, ' ', labelStyle(28, Art.HUD_TEXT, Art.TEXT_OUTLINE, 0), { align: 'center', boxW: cw - 56 });
    note.setTopLeft(L + 28, T + 24 + 56 + 22 + 220 + 22);
    card.add(note);

    let state = false;
    let button!: UiButton;
    const makeButton = (text: string): void => {
      button?.destroy();
      button = this.popupButton(text, 240, () => {
        if (state) {
          this.closeOverlay();
          return;
        }
        state = true;
        const amount = GameState.openGift();
        opened = true;
        note.setText(Loc.fmt('gems_plus', amount));
        note.setTopLeft(L + 28 + (cw - 56 - note.viewW) / 2, note.getTopLeft()[1]);
        chip.setCount(GameState.diamonds);
        this.gemChip.setCount(GameState.diamonds);
        this.relayout();
        bump(this, chip, 0.15);
        Sfx.play('sparkle', -3);
        Fx.confettiBurst(this, this.W / 2, this.H / 2, 60);
        makeButton(Loc.t('nice_btn'));
        this.giftBtn.refresh();
      });
      button.setTopLeft(L + (cw - 240) / 2, T + 24 + 56 + 22 + 220 + 22 + noteH + 22);
      card.add(button);
    };
    makeButton(Loc.t('open'));
  }
}
