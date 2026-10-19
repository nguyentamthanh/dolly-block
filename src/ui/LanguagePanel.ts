// Language picker: a dimmed page with a cream card holding one button per language, each written in its own
// language so it stays readable when the current one isn't. The current language is highlighted; the cross (or a
// tap on the dim) closes it. Ports scripts/ui/LanguagePanel.gd.

import * as Phaser from 'phaser';
import type { BaseScene } from '../scenes/BaseScene';
import * as Art from '../render/Art';
import { CanvasView } from '../render/CanvasView';
import { Color } from '../render/Color';
import { drawLabel, fitFontSize, labelStyle } from '../render/Fonts';
import { CODES, Loc, NAMES } from '../core/Loc';
import { Sfx } from '../audio/Sfx';
import { Z } from '../fx/Fx';
import { Overlay } from './Overlay';
import { Trans, EaseKind } from './Tween';
import { popIn } from './UiFx';
import { iconButton, textButton } from './widgets';

const CARD_W = 520;
const CARD_H = 480;
const MARGIN = 28;
const GAP = 16;

export class LanguagePanel extends Overlay {
  onChosen: (code: string) => void = () => {};
  onClosed: () => void = () => {};

  constructor(scene: BaseScene) {
    super(scene, Z.panel - 100, 0x1a0a47, 0.62);
    const L = -CARD_W / 2;
    const T = -CARD_H / 2;
    const card = scene.add.container(0, 0);
    this.root.add(card);

    const title = Loc.t('language');
    const titleSize = fitFontSize(title, CARD_W - MARGIN * 2 - 40, 0, 36, 22);
    const cardView = new CanvasView(scene, L, T, CARD_W, CARD_H, (ci) => {
      const sb = Art.box(Art.CARD, 44);
      sb.border = [0, 0, 0, 12];
      sb.borderColor = Art.CARD_EDGE;
      sb.shadowColor = new Color(0.05, 0.02, 0.2, 0.4);
      sb.shadowSize = 26;
      sb.shadowOffset = [0, 14];
      ci.drawStyleBox(sb, 0, 0, CARD_W, CARD_H);
      drawLabel(ci, title, MARGIN, 30, CARD_W - MARGIN * 2 - 40, 'center', labelStyle(titleSize, Art.ACCENT_BLUE));
    }, 50);
    card.add(cardView);

    const btnW = (CARD_W - MARGIN * 2 - GAP) * 0.5;
    const current = Loc.current();
    CODES.forEach((code, i) => {
      const name = NAMES[code];
      const b = textButton(scene, {
        text: name,
        w: btnW,
        h: 72,
        accent: code === current ? Art.ACCENT_PRIMARY : Color.TRANSPARENT,
        flat: true,
        fontSize: fitFontSize(name, btnW - 36, 0, 28, 18),
      });
      b.sfx = false;
      b.setTopLeft(L + MARGIN + (i % 2) * (btnW + GAP), T + 104 + Math.floor(i / 2) * (72 + GAP));
      b.onPress = () => this.pick(code);
      card.add(b);
    });

    const close = iconButton(scene, 'close', Art.ACCENT_PINK, 60);
    close.sfx = false;
    close.setTopLeft(L + CARD_W - 46, T - 14);
    close.onPress = () => this.close();
    card.add(close);

    // Tapping the dim closes it too.
    this.dim.on('pointerdown', () => this.close());
    this.onEscape = () => this.close();

    this.layout();
    this.setVisible(true);
    popIn(scene, card, 0, 0.3);
    this.dim.setAlpha(0);
    const t = scene.tw.create();
    t.tweenProperty(this.dim, 'alpha', 1, 0.2).setTrans(Trans.LINEAR).setEase(EaseKind.IN);
    void Phaser;
  }

  private pick(code: string): void {
    Sfx.play('button_tap');
    Loc.setLanguage(code);
    this.onChosen(code);
  }

  close(): void {
    Sfx.play('button_tap');
    this.onClosed();
    this.destroy();
  }

  destroy(): void {
    this.dim.destroy();
    this.root.destroy();
  }
}
