// Top of the game screen. Two rows float straight on the cream backdrop:
//   row 1: round back + "?" (how to play) buttons | "LEVEL N" pill + tier pill | gem chip
//   row 2: round Undo button | "placed / total" progress bar | round Hint button with a gem-cost badge
// Ports scripts/ui/HUD.gd; the Godot containers become explicit positions (same constants).

import type { BaseScene } from '../scenes/BaseScene';
import * as Art from '../render/Art';
import { CanvasItem, StyleBoxFlat } from '../render/CanvasItem';
import { CanvasView } from '../render/CanvasView';
import { Color } from '../render/Color';
import { ascent, drawLabel, labelStyle, lineHeight } from '../render/Fonts';
import { GameState } from '../core/GameState';
import { tierForLevel } from '../core/LevelGenerator';
import { Loc } from '../core/Loc';
import { Hue } from '../core/Palette';
import { PlatformSdk } from '../platform/PlatformSdk';
import { Z } from '../fx/Fx';
import { EaseKind, Trans } from '../ui/Tween';
import { bump, popIn, runKeyed } from '../ui/UiFx';
import { DiamondChip, iconButton, makeLabel, type LabelView, type UiButton } from '../ui/widgets';

/** Breathing room at the very top so the title clears a phone status bar / notch. */
const TOP_SAFE = 16;
const ROW1_H = 84;
const ROW2_H = 72;
const MAX_CONTENT_W = 900;
const BTN = 64;
const HUD_DEPTH = 12;

export class Hud {
  onUndo: () => void = () => {};
  onHint: () => void = () => {};
  onMenu: () => void = () => {};
  onHelp: () => void = () => {};

  private back: UiButton;
  private help: UiButton;
  private undo: UiButton;
  private hint: UiButton;
  private chip: DiamondChip;
  private titlePill: CanvasView;
  private title: LabelView;
  private tierPill: CanvasView;
  private tierLabel: LabelView;
  private progress: CanvasView;
  private progressLabel: LabelView;
  private toastView: CanvasView;
  private toastLabel: LabelView;

  private safeTop = 0;
  private W = 720;
  private titleText = '';
  private tierText = '';
  private tierColor = Art.tierColor(0);
  private total = 0;
  private remaining = 0;
  private progressValue = 0;
  private shownDiamonds = -1;
  private toastY = 0;
  private toastX = 0;

  constructor(private scene: BaseScene) {
    GameState.ensureLoaded();
    const mk = (kind: string, cb: () => void): UiButton => {
      const b = iconButton(scene, kind, Art.HUD_BROWN, BTN, Color.TRANSPARENT, true);
      b.setDepth(HUD_DEPTH);
      b.onPress = cb;
      return b;
    };
    this.back = mk('back', () => this.onMenu());
    this.help = mk('help', () => this.onHelp());
    this.undo = mk('undo', () => this.onUndo());
    this.hint = iconButton(scene, 'search', Art.HUD_BROWN, BTN, Color.TRANSPARENT, true, (ci) => this.drawBadge(ci));
    this.hint.setDepth(HUD_DEPTH);
    this.hint.onPress = () => this.onHint();

    this.chip = new DiamondChip(scene, true);
    this.chip.setDepth(HUD_DEPTH);

    const thin = labelStyle(34, Art.HUD_TEXT, Art.TEXT_OUTLINE, 0, 'thin');
    this.titlePill = new CanvasView(scene, 0, 0, 100, 48, (ci, v) => this.paintTitlePill(ci, v.viewW, v.viewH), 14);
    this.titlePill.setDepth(HUD_DEPTH);
    this.title = makeLabel(scene, ' ', thin, { align: 'center' });
    this.title.setDepth(HUD_DEPTH + 1);

    this.tierPill = new CanvasView(scene, 0, 0, 80, 25, (ci, v) => this.paintTierPill(ci, v.viewW, v.viewH), 4);
    this.tierPill.setDepth(HUD_DEPTH);
    this.tierLabel = makeLabel(scene, ' ', labelStyle(17, Art.WHITE, Art.TEXT_OUTLINE, 0), { align: 'center' });
    this.tierLabel.setDepth(HUD_DEPTH + 1);

    this.progress = new CanvasView(scene, 0, 0, 400, 40, (ci, v) => this.paintProgress(ci, v.viewW, v.viewH), 14);
    this.progress.setDepth(HUD_DEPTH);
    this.progressLabel = makeLabel(scene, ' ', labelStyle(22, Art.HUD_TEXT, Art.TEXT_OUTLINE, 0, 'thin'), { align: 'center' });
    this.progressLabel.setDepth(HUD_DEPTH + 1);

    // Transient messages pop over the board top as a dark pill hugging its text.
    this.toastView = new CanvasView(scene, 0, 0, 100, 42, (ci, v) => this.paintToast(ci, v.viewW, v.viewH), 4);
    this.toastView.setDepth(Z.toast);
    this.toastLabel = makeLabel(scene, ' ', labelStyle(20, Art.WHITE, Art.TEXT_OUTLINE, 0), { align: 'center' });
    this.toastLabel.setDepth(Z.toast + 1);
    this.toastView.setAlpha(0);
    this.toastLabel.setAlpha(0);

    this.setDiamonds(GameState.diamonds);
  }

  /** Cost badge: a little gem + number pinned to the hint button's corner; "AD" in green when unaffordable. */
  private drawBadge(ci: CanvasItem): void {
    const x = 34;
    const y = -8;
    const w = 40;
    const h = 26;
    const st = { ...labelStyle(17, Art.WHITE, Art.TEXT_OUTLINE, 0), shadowColor: Color.TRANSPARENT };
    // Godot draws the string with its baseline 20px below the badge top.
    const top = y + 20 - ascent(17);
    if (GameState.diamonds < GameState.HINT_COST && PlatformSdk.isRewardedAvailable()) {
      ci.drawStyleBox(Art.box(Art.ACCENT_PRIMARY, 13, 2, Art.WHITE), x, y, w, h);
      drawLabel(ci, 'AD', x, top, w, 'center', st);
      return;
    }
    ci.drawStyleBox(Art.box(Art.ACCENT_PINK, 13, 2, Art.WHITE), x, y, w, h);
    Art.drawGem(ci, x + 11, y + 13, 6.5);
    drawLabel(ci, String(GameState.HINT_COST), x + 19, top, 30, 'left', st);
  }

  // --- layout ---------------------------------------------------------------------------------------------------

  /** Total height the HUD reserves at the top of the screen. */
  height(): number {
    return TOP_SAFE + this.safeTop + ROW1_H + ROW2_H + 8;
  }

  setSafeTop(px: number): void {
    this.safeTop = px;
  }

  layout(W: number): void {
    this.W = W;
    const m = Math.max(14, (W - MAX_CONTENT_W) * 0.5);
    const top = TOP_SAFE + this.safeTop;
    const r1 = top;
    const r2 = top + ROW1_H + 4;

    this.back.setTopLeft(m, r1 + (ROW1_H - BTN) / 2);
    this.help.setTopLeft(m + BTN + 4, r1 + (ROW1_H - BTN) / 2);
    this.chip.setTopRight(W - m, r1 + (ROW1_H - this.chip.ch) / 2);

    // Title column: centred on the full width, content centred vertically in the row.
    const titleH = lineHeight(34) + 2 + 4;
    const tierH = lineHeight(17) + 1 + 3;
    const colH = titleH - 6 + tierH;
    const colTop = r1 + (ROW1_H - colH) / 2;
    this.layoutTitle(colTop, titleH);
    this.layoutTier(colTop + titleH - 6, tierH);

    this.undo.setTopLeft(m, r2 + (ROW2_H - BTN) / 2);
    this.hint.setTopLeft(W - m - BTN, r2 + (ROW2_H - BTN) / 2);
    const px = m + BTN + 14;
    const pw = W - m - BTN - 14 - px;
    this.progress.resizeView(pw, 40);
    this.progress.setPosition(px, r2 + (ROW2_H - 40) / 2);
    this.layoutProgressLabel(px, r2 + (ROW2_H - 40) / 2, pw, 40);

    this.toastY = this.height() + (56 - (8 + lineHeight(20) + 10)) / 2;
    this.layoutToast();
  }

  private layoutTitle(top: number, h: number): void {
    const lw = this.title.viewW;
    const w = lw + 44;
    this.titlePill.resizeView(w, h);
    this.titlePill.setPosition((this.W - w) / 2, top);
    this.title.setTopLeft((this.W - lw) / 2, top + 2);
  }

  private layoutTier(top: number, h: number): void {
    const lw = this.tierLabel.viewW;
    const w = lw + 24;
    this.tierPill.resizeView(w, h);
    this.tierPill.setPosition((this.W - w) / 2, top);
    this.tierLabel.setTopLeft((this.W - lw) / 2, top + 1);
  }

  private layoutProgressLabel(x: number, y: number, w: number, h: number): void {
    const lh = this.progressLabel.viewH;
    this.progressLabel.setTopLeft(x + (w - this.progressLabel.viewW) / 2, y + (h - lh) / 2);
  }

  private layoutToast(): void {
    const lw = this.toastLabel.viewW;
    const w = lw + 40;
    this.toastView.resizeView(w, 42);
    this.toastView.setPosition((this.W - w) / 2, this.toastY);
    this.toastLabel.setTopLeft((this.W - lw) / 2, this.toastY + 8);
    this.toastX = (this.W - w) / 2;
  }

  // --- painting -----------------------------------------------------------------------------------------------

  private whitePill(radius: number): StyleBoxFlat {
    const sb = Art.box(Art.WHITE, radius);
    sb.shadowColor = new Color(0.45, 0.33, 0.25, 0.14);
    sb.shadowSize = 6;
    sb.shadowOffset = [0, 3];
    return sb;
  }

  private paintTitlePill(ci: CanvasItem, w: number, h: number): void {
    ci.drawStyleBox(this.whitePill(34), 0, 0, w, h);
  }

  private paintTierPill(ci: CanvasItem, w: number, h: number): void {
    const c = this.tierColor;
    const sb = Art.box(c, 12);
    sb.border = [0, 0, 0, 3];
    sb.borderColor = c.darkened(0.3);
    ci.drawStyleBox(sb, 0, 0, w, h);
  }

  private paintProgress(ci: CanvasItem, w: number, h: number): void {
    const rad = h * 0.5;
    // Trough: a white pill with a faint warm shadow.
    const trough = Art.box(Art.WHITE, rad);
    trough.shadowColor = new Color(0.45, 0.33, 0.25, 0.12);
    trough.shadowSize = 5;
    trough.shadowOffset = [0, 3];
    ci.drawStyleBox(trough, 0, 0, w, h);
    if (this.progressValue <= 0.001) return;
    const ix = 5;
    const iy = 5;
    const iw = w - 10;
    const ih = h - 10;
    const fw = Math.max(ih, iw * Math.min(Math.max(this.progressValue, 0), 1));
    ci.drawStyleBox(Art.box(Art.paletteFill(Hue.GREEN), ih * 0.5), ix, iy, fw, ih);
  }

  private paintToast(ci: CanvasItem, w: number, h: number): void {
    ci.drawStyleBox(Art.box(new Color(0.12, 0.06, 0.32, 0.88), 22), 0, 0, w, h);
  }

  // --- API ------------------------------------------------------------------------------------------------------

  setLevel(index: number, juice = true): void {
    this.titleText = Loc.fmt('level_caps', index + 1);
    this.tierText = Loc.tierName(tierForLevel(index)).toLocaleUpperCase();
    this.tierColor = Art.tierColor(tierForLevel(index));
    this.title.setText(this.titleText);
    this.tierLabel.setText(this.tierText);
    this.tierPill.invalidate();
    this.layout(this.W);
    this.total = 0;
    this.progressValue = 0;
    this.progress.invalidate();
    if (juice) popIn(this.scene, this.title, 0.05);
  }

  /** World position of the gem icon, where reward gems fly to. */
  diamondTarget(): { x: number; y: number } {
    return this.chip.gemWorld();
  }

  setDiamonds(n: number): void {
    this.hint.refresh();
    if (this.shownDiamonds < 0) {
      this.shownDiamonds = n;
      this.chip.setCount(n);
      this.layout(this.W);
      return;
    }
    if (n === this.shownDiamonds) return;
    const from = this.shownDiamonds;
    this.shownDiamonds = n;
    runKeyed(this.scene, this.chip, 'count', (t) => {
      t.tweenMethod((v) => {
        this.chip.setCount(Math.round(v));
        this.layout(this.W);
      }, from, n, 0.25);
    });
    bump(this.scene, this.chip, 0.15);
  }

  setRemaining(n: number): void {
    this.remaining = n;
    if (n > this.total) this.total = n;
    const placed = this.total - n;
    const target = this.total <= 0 ? 0 : placed / this.total;
    this.progressLabel.setText(n === 0 ? Loc.t('all_settled') : `${placed} / ${this.total}`);
    const px = this.progress.x;
    this.layoutProgressLabel(px, this.progress.y, this.progress.viewW, 40);
    runKeyed(this.scene, this.progress, 'bar', (t) => {
      t.tweenMethod((v) => {
        this.progressValue = v;
        this.progress.invalidate();
      }, this.progressValue, target, 0.3).setTrans(Trans.CUBIC).setEase(EaseKind.OUT);
    });
  }

  flashMessage(msg: string, hold = 1.6): void {
    this.toastLabel.setText(msg);
    this.layoutToast();
    this.toastView.setAlpha(1);
    this.toastLabel.setAlpha(1);
    popIn(this.scene, this.toastLabel, 0, 0.25);
    this.toastView.setScale(1, 1);
    runKeyed(this.scene, this.toastView, 'toast', (t) => {
      t.tweenInterval(hold);
      t.setParallel(true);
      t.tweenProperty(this.toastView, 'alpha', 0, 0.4);
      t.tweenProperty(this.toastLabel, 'alpha', 0, 0.4);
    });
    // The pill pops with its label.
    this.toastView.setScale(0, 0);
    popIn(this.scene, this.toastView, 0, 0.25);
  }

  /** Remaining pieces / total (for tests and the win flow). */
  get left(): number {
    return this.remaining;
  }

  get toastLeft(): number {
    return this.toastX;
  }
}

