// "Out of diamonds" popup: offers a rewarded ad for GameState.AD_REWARD diamonds. Opt-in by design (Playgama
// checklist): the button says an ad is coming and what it gives, the cross closes it with no penalty, and the
// reward is granted only on the platform's "rewarded" state. Ports scripts/ui/AdRewardPanel.gd.

import type { BaseScene } from '../scenes/BaseScene';
import * as Art from '../render/Art';
import { CanvasView } from '../render/CanvasView';
import { Color } from '../render/Color';
import { drawLabel, fitFontSize, labelStyle, type LabelStyle } from '../render/Fonts';
import { GameState } from '../core/GameState';
import { Loc } from '../core/Loc';
import { PlatformSdk } from '../platform/PlatformSdk';
import { Sfx } from '../audio/Sfx';
import { Z } from '../fx/Fx';
import { Overlay } from './Overlay';
import { popIn } from './UiFx';
import { iconButton, textButton, type UiButton } from './widgets';

const CARD_W = 500;
const CARD_H = 420;

export class AdRewardPanel extends Overlay {
  /** `granted` is true when the ad was watched to the end (diamonds already added); fromX/fromY = where the gem sat. */
  onFinished: (granted: boolean, fromX: number, fromY: number) => void = () => {};
  onClosed: () => void = () => {};

  private card: import('phaser').GameObjects.Container;
  private watch: UiButton;
  private waiting = false;

  constructor(scene: BaseScene) {
    super(scene, Z.panel + 60, 0x1a0a47, 0.62);
    const s = scene;
    this.card = s.add.container(0, 0);
    this.root.add(this.card);
    const L = -CARD_W / 2;
    const T = -CARD_H / 2;

    const title = Loc.t('ad_title');
    const titleSize = fitFontSize(title, CARD_W - 40 - 10, 0, 38, 22);
    const body = Loc.fmt('ad_body', GameState.AD_REWARD);
    const bodySize = fitFontSize(body, CARD_W - 40, 70, 26, 16, true);
    const watchText = Loc.t('watch_ad');
    // The play triangle takes the left ~70px of the button.
    const watchSize = fitFontSize(watchText, 320 - 100, 0, 36, 20);

    const bodyStyle: LabelStyle = {
      size: bodySize, color: Art.hexInkSoft, kind: 'bold', outlineSize: 0, outlineColor: Color.TRANSPARENT,
      shadowColor: Color.TRANSPARENT, shadowY: 0, shadowOutline: 0,
    };
    const cardView = new CanvasView(s, L, T, CARD_W, CARD_H, (ci) => {
      const sb = Art.box(Art.CARD, 44);
      sb.border = [0, 0, 0, 12];
      sb.borderColor = Art.CARD_EDGE;
      sb.shadowColor = new Color(0.05, 0.02, 0.2, 0.4);
      sb.shadowSize = 26;
      sb.shadowOffset = [0, 14];
      ci.drawStyleBox(sb, 0, 0, CARD_W, CARD_H);
      drawLabel(ci, title, 20, 34, CARD_W - 40, 'center', labelStyle(titleSize, Art.ACCENT_PINK));
      Art.drawGem(ci, CARD_W * 0.5, 108 + 45, 36);
      drawLabel(ci, body, 20, 206, CARD_W - 40, 'center', bodyStyle, CARD_W - 40);
    }, 50);
    this.card.add(cardView);

    this.watch = textButton(s, {
      text: watchText, w: 320, h: 96, accent: Art.ACCENT_PRIMARY, fontSize: watchSize,
      extra: (ci, _w, h, state) => {
        const down = state === 'pressed';
        const cx = 42;
        const cy = h * 0.5 - 3 + (down ? 4 : 0);
        Art.drawIcon(ci, 'play', cx, cy + 2, 18, Art.ACCENT_PRIMARY.darkened(0.45));
        Art.drawIcon(ci, 'play', cx, cy, 18, Art.WHITE);
      },
    });
    this.watch.sfx = false;
    this.watch.setTopLeft(L + CARD_W * 0.5 - 160, T + 292);
    this.watch.onPress = () => this.onWatch();
    this.card.add(this.watch);

    const close = iconButton(s, 'close', Art.ACCENT_PINK, 60);
    close.setTopLeft(L + CARD_W - 46, T - 14);
    close.onPress = () => {
      this.hide();
      this.onClosed();
    };
    this.card.add(close);
    this.onEscape = () => {
      if (this.waiting) return;
      this.hide();
      this.onClosed();
    };
  }

  show(): void {
    this.layout();
    this.waiting = false;
    this.watch.setEnabled(true);
    this.setVisible(true);
    popIn(this.scene, this.card, 0, 0.3);
  }

  hide(): void {
    this.setVisible(false);
  }

  private onWatch(): void {
    if (this.waiting) return;
    Sfx.play('button_tap');
    this.waiting = true;
    this.watch.setEnabled(false);
    PlatformSdk.showRewarded((granted) => this.onRewarded(granted));
  }

  private onRewarded(granted: boolean): void {
    this.waiting = false;
    this.watch.setEnabled(true);
    const fromX = this.root.x - CARD_W / 2 + CARD_W * 0.5;
    const fromY = this.root.y - CARD_H / 2 + 153;
    if (granted) GameState.grantAdReward();
    // Closed either way: on a cancel or failure the HUD toast explains, and it would sit hidden under this panel.
    this.hide();
    this.onFinished(granted, fromX, fromY);
  }
}

