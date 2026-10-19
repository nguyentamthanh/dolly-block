// Small widget kit on top of CanvasView: outlined labels, juicy buttons (text and icon), the diamond chip.
// Layout is explicit (screens compute positions from the logical canvas size), so there is no container system.

import * as Phaser from 'phaser';
import type { BaseScene } from '../scenes/BaseScene';
import * as Art from '../render/Art';
import { CanvasItem, StyleBoxFlat } from '../render/CanvasItem';
import { CanvasView } from '../render/CanvasView';
import { Color } from '../render/Color';
import { ascent, drawLabel, labelStyle, lineHeight, textWidth, wrapText, type HAlign, type LabelStyle } from '../render/Fonts';
import { juicyDown, juicyUp } from './UiFx';
import { Sfx } from '../audio/Sfx';
import { PlatformSdk } from '../platform/PlatformSdk';
import { GameState } from '../core/GameState';

// --- Labels ------------------------------------------------------------------------------------------------

export interface LabelOpts {
  align?: HAlign;
  /** fixed box width (text is aligned inside it); defaults to the text width */
  boxW?: number;
  /** wrap at this width */
  wrapW?: number;
}

export function measureLabel(text: string, st: LabelStyle, o: LabelOpts = {}): { w: number; h: number } {
  const lines = o.wrapW && o.wrapW > 0 ? wrapText(text, st.kind, st.size, o.wrapW) : text.split('\n');
  const w = o.boxW ?? Math.max(...lines.map((l) => textWidth(l, st.kind, st.size)));
  return { w, h: lines.length * lineHeight(st.size) };
}

/** An outlined text label. Position it with setTopLeft(); its pivot is its centre. */
export class LabelView extends CanvasView {
  private text: string;
  private readonly st: LabelStyle;
  private readonly o: LabelOpts;

  constructor(scene: Phaser.Scene, text: string, st: LabelStyle, o: LabelOpts, w: number, h: number) {
    const pad = st.outlineSize + st.shadowY + st.shadowOutline + 3;
    super(scene, 0, 0, w, h, (ci, v) => drawLabel(ci, (v as LabelView).text ?? '', 0, 0, v.viewW, o.align ?? 'left', st, o.wrapW ?? 0), pad);
    this.text = text;
    this.st = st;
    this.o = o;
    this.setPivot(w / 2, h / 2);
    this.repaint();
  }

  getText(): string {
    return this.text;
  }

  setText(text: string): this {
    if (text === this.text) return this;
    this.text = text;
    const m = measureLabel(text, this.st, { ...this.o, boxW: this.o.boxW });
    this.resizeView(m.w, m.h);
    this.setPivot(m.w / 2, m.h / 2);
    this.repaint();
    return this;
  }
}

export function makeLabel(scene: Phaser.Scene, text: string, st: LabelStyle, o: LabelOpts = {}): LabelView {
  const m = measureLabel(text, st, o);
  return new LabelView(scene, text, st, o, m.w, m.h);
}

export { labelStyle };

// --- Buttons -----------------------------------------------------------------------------------------------

export type ButtonState = 'normal' | 'hover' | 'pressed' | 'disabled';
export type ButtonPaint = (ci: CanvasItem, w: number, h: number, state: ButtonState) => void;

/**
 * A pressable widget: paints itself for each state, squashes on press and overshoots on release (UiFx.juicy),
 * fires `onPress` when released over it. Positioned by its centre.
 */
export class UiButton extends Phaser.GameObjects.Container {
  readonly bw: number;
  readonly bh: number;
  private view: CanvasView;
  private btnState: ButtonState = 'normal';
  private down = false;
  private enabled = true;
  onPress: (() => void) | null = null;
  sfx: boolean;

  constructor(
    scene: BaseScene,
    w: number,
    h: number,
    private paint: ButtonPaint,
    opts: { pad?: number; sfx?: boolean } = {},
  ) {
    super(scene, 0, 0);
    this.bw = w;
    this.bh = h;
    this.sfx = opts.sfx ?? true;
    this.view = new CanvasView(scene, -w / 2, -h / 2, w, h, (ci) => this.paint(ci, w, h, this.btnState), opts.pad ?? 16);
    this.add(this.view);
    this.setSize(w, h);
    this.setInteractive({ useHandCursor: true });
    scene.add.existing(this);

    this.on('pointerover', () => {
      if (this.enabled && !this.down) this.setBtnState('hover');
    });
    this.on('pointerout', () => {
      if (this.enabled && !this.down) this.setBtnState('normal');
    });
    this.on('pointerdown', () => {
      if (!this.enabled) return;
      this.down = true;
      this.setBtnState('pressed');
      juicyDown(scene, this);
    });
    this.on('pointerup', () => {
      if (!this.down) return;
      this.down = false;
      this.setBtnState(this.enabled ? 'hover' : 'disabled');
      juicyUp(scene, this);
      if (this.sfx) Sfx.play('button_tap');
      this.onPress?.();
    });
    this.on('pointerupoutside', () => {
      if (!this.down) return;
      this.down = false;
      this.setBtnState('normal');
      juicyUp(scene, this);
    });
  }

  private setBtnState(s: ButtonState): void {
    if (this.btnState === s) return;
    this.btnState = s;
    this.view.invalidate();
  }

  setEnabled(on: boolean): this {
    this.enabled = on;
    this.setBtnState(on ? 'normal' : 'disabled');
    return this;
  }

  /** Repaint after external state (e.g. a badge's contents) changed. */
  refresh(): void {
    this.view.invalidate();
  }

  /** Place by top-left corner of the nominal rect. */
  setTopLeft(x: number, y: number): this {
    this.setPosition(x + this.bw / 2, y + this.bh / 2);
    return this;
  }

  getTopLeft(): { x: number; y: number } {
    return { x: this.x - this.bw / 2, y: this.y - this.bh / 2 };
  }
}

function styleFor(st: Art.ButtonStyles, s: ButtonState): StyleBoxFlat {
  return s === 'pressed' ? st.pressed : s === 'hover' ? st.hover : s === 'disabled' ? st.disabled : st.normal;
}

/** Art.icon_button: a round candy button carrying a code-drawn glyph (see Art.drawIcon). */
export function iconButton(
  scene: BaseScene,
  kind: string,
  accent: Color = Color.TRANSPARENT,
  diameter = 68,
  glyphColor: Color = Color.TRANSPARENT,
  flat = false,
  extra?: (ci: CanvasItem, w: number, h: number, state: ButtonState) => void,
): UiButton {
  const st = Art.styleButton(accent, 500, flat);
  const col = glyphColor.a > 0 ? glyphColor : accent.a > 0 ? Art.WHITE : Art.INK;
  return new UiButton(scene, diameter, diameter, (ci, w, h, state) => {
    ci.drawStyleBox(styleFor(st, state), 0, 0, w, h);
    const down = state === 'pressed';
    const s = Math.min(w, h);
    const cx = w * 0.5;
    const cy = h * 0.5 - 3 + (down ? 4 : 0);
    // A soft outline-coloured offset copy reads as the glyph's "ink" edge.
    if (accent.a > 0 && !flat) Art.drawIcon(ci, kind, cx, cy + 2, s * 0.3, accent.darkened(0.45));
    Art.drawIcon(ci, kind, cx, cy, s * 0.3, col);
    extra?.(ci, w, h, state);
  });
}

export interface TextButtonOpts {
  text: string;
  w: number;
  h: number;
  accent?: Color;
  radius?: number;
  flat?: boolean;
  fontSize: number;
  /** override the label colour */
  ink?: Color;
  /** outline size override; filled buttons default to 8 */
  outline?: number;
  /** extra paint over the label (badges, icons) */
  extra?: (ci: CanvasItem, w: number, h: number, state: ButtonState) => void;
}

/** A pill Button with a centred label, styled like Art.style_button. */
export function textButton(scene: BaseScene, o: TextButtonOpts): UiButton {
  const st = Art.styleButton(o.accent ?? Color.TRANSPARENT, o.radius ?? 500, o.flat ?? false);
  const ink = o.ink ?? st.ink;
  const outlineSize = o.outline ?? (st.outline ? 8 : 0);
  const ls: LabelStyle = {
    size: o.fontSize,
    color: ink,
    kind: 'bold',
    outlineSize,
    outlineColor: st.outline ?? Color.TRANSPARENT,
    shadowColor: Color.TRANSPARENT,
    shadowY: 0,
    shadowOutline: 0,
  };
  return new UiButton(scene, o.w, o.h, (ci, w, h, state) => {
    const sb = styleFor(st, state);
    ci.drawStyleBox(sb, 0, 0, w, h);
    const [, mt, , mb] = sb.margin;
    // A Button centres its text by the line metrics of the font that actually draws it (Fredoka), unlike a Label,
    // which is as tall as the whole font stack: so the baseline sits (ascent - descent) / 2 below the content centre.
    const fa = Math.round(0.974 * o.fontSize);
    const fd = Math.ceil(0.236 * o.fontSize);
    const baseline = mt + (h - mt - mb) / 2 + (fa - fd) / 2;
    drawLabel(ci, o.text, 0, baseline - ascent(o.fontSize), w, 'center', ls);
    o.extra?.(ci, w, h, state);
  });
}

// --- Diamond chip --------------------------------------------------------------------------------------------

/** Art.build_diamond_chip(light=true): a white pill with a gem icon and the diamond count. */
export class DiamondChip extends Phaser.GameObjects.Container {
  readonly cw: number;
  readonly ch = 52;
  private view: CanvasView;
  private countText = '0';
  private readonly ls: LabelStyle;
  private readonly light: boolean;
  /** centre of the gem icon relative to the chip's top-left (fly-in target) */
  readonly gemX = 8 + 18;
  readonly gemY: number;

  constructor(scene: BaseScene, light = true) {
    super(scene, 0, 0);
    this.light = light;
    this.ls = light
      ? { ...labelStyle(26, Art.HUD_TEXT, Art.TEXT_OUTLINE, 0), shadowColor: Color.TRANSPARENT }
      : labelStyle(26, Art.WHITE, Art.TEXT_OUTLINE, 6);
    this.cw = 108;
    this.gemY = this.ch / 2 - 1;
    // Chip sizes to its widest plausible count so the pill doesn't change width as the number ticks.
    this.view = new CanvasView(scene, -this.cw / 2, -this.ch / 2, this.cw, this.ch, (ci) => this.paintChip(ci), 12);
    this.add(this.view);
    scene.add.existing(this);
  }

  private widthFor(count: string): number {
    const lw = textWidth(count, 'bold', 26);
    return Math.max(108, 8 + 36 + 6 + lw + 16);
  }

  private paintChip(ci: CanvasItem): void {
    const w = this.widthFor(this.countText);
    let sb = Art.box(new Color(0.1, 0.05, 0.32, 0.38), 26);
    sb.border = [0, 0, 0, 3];
    sb.borderColor = new Color(0.05, 0.02, 0.2, 0.35);
    if (this.light) {
      sb = Art.box(Art.WHITE, 26);
      sb.shadowColor = new Color(0.45, 0.33, 0.25, 0.14);
      sb.shadowSize = 6;
      sb.shadowOffset = [0, 3];
    }
    ci.drawStyleBox(sb, 0, 0, w, this.ch);
    // margin (8, 4, 16, 6): icon 36x36 centred vertically in the row, then the count.
    const rowTop = 4;
    const rowH = this.ch - 4 - 6;
    Art.drawGem(ci, 8 + 18, rowTop + rowH / 2, 15);
    const lh = lineHeight(26);
    drawLabel(ci, this.countText, 8 + 36 + 6, rowTop + (rowH - lh) / 2, w, 'left', this.ls);
  }

  /** Pill width for the current count. */
  get width_(): number {
    return this.widthFor(this.countText);
  }

  setCount(n: number | string): void {
    const s = String(n);
    if (s === this.countText) return;
    this.countText = s;
    const w = this.widthFor(s);
    this.view.resizeView(w, this.ch);
    this.view.setPosition(-w / 2, -this.ch / 2);
  }

  /** Place so the chip's top-left sits at (x, y). */
  setTopLeft(x: number, y: number): this {
    this.setPosition(x + this.width_ / 2, y + this.ch / 2);
    return this;
  }

  /** Place so the chip's top-right corner sits at (x, y). */
  setTopRight(x: number, y: number): this {
    this.setPosition(x - this.width_ / 2, y + this.ch / 2);
    return this;
  }

  /** World position of the gem icon centre. */
  gemWorld(): { x: number; y: number } {
    return { x: this.x - this.width_ / 2 + 8 + 18, y: this.y - this.ch / 2 + 4 + (this.ch - 10) / 2 };
  }
}

// --- Misc helpers ----------------------------------------------------------------------------------------------

export function isAdOffer(): boolean {
  return GameState.diamonds < GameState.HINT_COST && PlatformSdk.isRewardedAvailable();
}
