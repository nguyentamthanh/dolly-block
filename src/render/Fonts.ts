// Fonts and text layout. The Godot build uses Fredoka (a variable font) at weight 600 as the theme font and
// weight 400 for the thin counter text, with Noto Sans as the per-glyph fallback (Fredoka only has basic
// Latin). The same stack is registered here as web fonts and used through Canvas 2D text.

import { CanvasItem } from './CanvasItem';
import { Color } from './Color';

export type FontKind = 'bold' | 'thin';

/**
 * Godot sizes a line by the tallest font in the stack, and Noto Sans (the fallback) is taller than Fredoka, so a
 * line is ceil(1.069 em) above the baseline and ceil(0.293 em) below it (measured against the Godot build).
 */
const NOTO_ASCENT = 1.069;
const NOTO_DESCENT = 0.293;

const STACK = 'Fredoka, "Noto Sans UI", sans-serif';

let loading: Promise<void> | null = null;

/** Registers Fredoka + Noto Sans and waits until they can be measured. Safe to call repeatedly. */
export function loadFonts(base = './fonts/'): Promise<void> {
  if (loading) return loading;
  const faces = [
    new FontFace('Fredoka', `url(${base}Fredoka.woff2)`, { weight: '400 600' }),
    new FontFace('Noto Sans UI', `url(${base}NotoSans-Regular.woff2)`, { weight: '400' }),
    new FontFace('Noto Sans UI', `url(${base}NotoSans-Bold.woff2)`, { weight: '700' }),
  ];
  loading = Promise.all(
    faces.map(async (f) => {
      try {
        await f.load();
        document.fonts.add(f);
      } catch (err) {
        console.warn('font failed to load', f.family, err);
      }
    }),
  ).then(() => undefined);
  return loading;
}

export const cssFont = (kind: FontKind, size: number): string => `${kind === 'bold' ? 600 : 400} ${size}px ${STACK}`;

/** Godot's font.get_height(size): the height of one line. */
export const ascent = (size: number): number => Math.ceil(NOTO_ASCENT * size);
export const descent = (size: number): number => Math.ceil(NOTO_DESCENT * size);
export const lineHeight = (size: number): number => ascent(size) + descent(size);

let measureCtx: CanvasRenderingContext2D | null = null;
const widthCache = new Map<string, number>();

function mctx(): CanvasRenderingContext2D {
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d')!;
  return measureCtx;
}

/** font.get_string_size(text, size).x */
export function textWidth(text: string, kind: FontKind, size: number): number {
  const key = `${kind}|${size}|${text}`;
  let w = widthCache.get(key);
  if (w === undefined) {
    const ctx = mctx();
    ctx.font = cssFont(kind, size);
    // Godot advances glyphs in whole pixels, so its widths are integers within +-1 of the canvas measure.
    w = Math.round(ctx.measureText(text).width);
    if (widthCache.size > 4000) widthCache.clear();
    widthCache.set(key, w);
  }
  return w;
}

/** Word wrap like Label's AUTOWRAP_WORD_SMART: break at spaces, hard-break a word that cannot fit. */
export function wrapText(text: string, kind: FontKind, size: number, maxW: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    if (maxW <= 0 || textWidth(para, kind, size) <= maxW) {
      out.push(para);
      continue;
    }
    let line = '';
    for (const word of para.split(' ')) {
      const trial = line ? `${line} ${word}` : word;
      if (textWidth(trial, kind, size) <= maxW) {
        line = trial;
        continue;
      }
      if (line) out.push(line);
      if (textWidth(word, kind, size) <= maxW) {
        line = word;
        continue;
      }
      // A single word wider than the box: break it by characters.
      line = '';
      for (const ch of word) {
        if (textWidth(line + ch, kind, size) > maxW && line) {
          out.push(line);
          line = ch;
        } else {
          line += ch;
        }
      }
    }
    out.push(line);
  }
  return out;
}

/**
 * Largest font size from `start` down to `minSize` at which `text` fits `maxW` wide (and `maxH` tall when
 * wrapping and maxH > 0). Longer translations shrink instead of spilling out of fixed-size cards.
 */
export function fitFontSize(
  text: string,
  maxW: number,
  maxH: number,
  start: number,
  minSize: number,
  wrap = false,
  kind: FontKind = 'bold',
): number {
  let fs = start;
  while (fs > minSize) {
    let w: number;
    let h: number;
    if (wrap) {
      const lines = wrapText(text, kind, fs, maxW);
      w = Math.max(...lines.map((l) => textWidth(l, kind, fs)));
      h = lines.length * lineHeight(fs);
    } else {
      w = Math.max(...text.split('\n').map((l) => textWidth(l, kind, fs)));
      h = text.split('\n').length * lineHeight(fs);
    }
    if (w <= maxW && (maxH <= 0 || h <= maxH)) break;
    fs--;
  }
  return fs;
}

export interface LabelStyle {
  size: number;
  color: Color;
  kind: FontKind;
  /** outline radius in px; 0 = none */
  outlineSize: number;
  outlineColor: Color;
  /** hard drop shadow (Godot font_shadow_*): colour, y offset, outline radius */
  shadowColor: Color;
  shadowY: number;
  shadowOutline: number;
}

const WHITE = new Color(1, 1, 1, 1);
const TEXT_OUTLINE = Color.hex('#2a1f5c');

/** Art.style_label(l, font_size, color, outline, outline_size) */
export function labelStyle(
  size: number,
  color: Color = WHITE,
  outline: Color = TEXT_OUTLINE,
  outlineSize = -1,
  kind: FontKind = 'bold',
): LabelStyle {
  const o = outlineSize >= 0 ? outlineSize : Math.max(4, Math.trunc(size * 0.22));
  const hasOutline = o > 0;
  return {
    size,
    color,
    kind,
    outlineSize: hasOutline ? o : 0,
    outlineColor: outline,
    shadowColor: hasOutline ? outline.withAlpha(0.55) : Color.TRANSPARENT,
    shadowY: hasOutline ? Math.max(2, Math.trunc(size * 0.08)) : 0,
    shadowOutline: hasOutline ? o : 0,
  };
}

/** Godot strokes glyph outlines with a radius of outline_size/4 px (FT_Stroker_Set(outline * 16 in 26.6 units)). */
const OUTLINE_K = 0.25;

export type HAlign = 'left' | 'center' | 'right';

/**
 * Draws one line of text with its box's top-left at (x, y); the line occupies lineHeight(size) vertically,
 * matching a Godot Label. `align` positions it within `boxW`.
 */
export function drawLabelLine(ci: CanvasItem, text: string, x: number, y: number, boxW: number, align: HAlign, st: LabelStyle): void {
  const ctx = ci.ctx;
  ctx.font = cssFont(st.kind, st.size);
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  const w = textWidth(text, st.kind, st.size);
  const tx = align === 'center' ? x + (boxW - w) / 2 : align === 'right' ? x + boxW - w : x;
  const ty = y + ascent(st.size);

  if (st.shadowColor.a > 0) {
    if (st.shadowOutline > 0) {
      ctx.strokeStyle = st.shadowColor.css();
      ctx.lineWidth = st.shadowOutline * OUTLINE_K * 2;
      ctx.strokeText(text, tx, ty + st.shadowY);
    }
    ctx.fillStyle = st.shadowColor.css();
    ctx.fillText(text, tx, ty + st.shadowY);
  }
  if (st.outlineSize > 0 && st.outlineColor.a > 0) {
    ctx.strokeStyle = st.outlineColor.css();
    ctx.lineWidth = st.outlineSize * OUTLINE_K * 2;
    ctx.strokeText(text, tx, ty);
  }
  ctx.fillStyle = st.color.css();
  ctx.fillText(text, tx, ty);
}

/** Multi-line text (explicit \n and/or wrapping at maxW > 0); returns the total height drawn. */
export function drawLabel(
  ci: CanvasItem,
  text: string,
  x: number,
  y: number,
  boxW: number,
  align: HAlign,
  st: LabelStyle,
  wrapAt = 0,
): number {
  const lines = wrapAt > 0 ? wrapText(text, st.kind, st.size, wrapAt) : text.split('\n');
  const lh = lineHeight(st.size);
  lines.forEach((l, i) => drawLabelLine(ci, l, x, y + i * lh, boxW, align, st));
  return lines.length * lh;
}

/** CanvasItem.draw_string(font, baseline_pos, text, align, width, size, color): no outline; y is the BASELINE. */
export function drawString(
  ci: CanvasItem,
  text: string,
  x: number,
  baselineY: number,
  boxW: number,
  align: HAlign,
  kind: FontKind,
  size: number,
  color: Color,
): void {
  const ctx = ci.ctx;
  ctx.font = cssFont(kind, size);
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  const w = textWidth(text, kind, size);
  const tx = align === 'center' ? x + (boxW - w) / 2 : align === 'right' ? x + boxW - w : x;
  ctx.fillStyle = color.css();
  ctx.fillText(text, tx, baselineY);
}
