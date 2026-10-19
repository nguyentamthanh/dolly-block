// Godot's Color, as far as the game uses it: float channels 0..1 and the few helpers the art code calls.

export class Color {
  constructor(
    public r = 0,
    public g = 0,
    public b = 0,
    public a = 1,
  ) {}

  /** "#rrggbb" or "#rrggbbaa" */
  static hex(s: string): Color {
    const h = s.startsWith('#') ? s.slice(1) : s;
    const n = (i: number): number => parseInt(h.slice(i, i + 2), 16) / 255;
    return new Color(n(0), n(2), n(4), h.length >= 8 ? n(6) : 1);
  }

  static readonly TRANSPARENT = new Color(0, 0, 0, 0);
  static readonly WHITE = new Color(1, 1, 1, 1);
  static readonly BLACK = new Color(0, 0, 0, 1);

  /** Color(c, a): the colour with a different alpha. */
  withAlpha(a: number): Color {
    return new Color(this.r, this.g, this.b, a);
  }

  /** Godot Color.darkened(amount) */
  darkened(amount: number): Color {
    return new Color(this.r * (1 - amount), this.g * (1 - amount), this.b * (1 - amount), this.a);
  }

  /** Godot Color.lightened(amount) */
  lightened(amount: number): Color {
    return new Color(this.r + (1 - this.r) * amount, this.g + (1 - this.g) * amount, this.b + (1 - this.b) * amount, this.a);
  }

  /** Godot Color.lerp(to, t) */
  lerp(to: Color, t: number): Color {
    return new Color(
      this.r + (to.r - this.r) * t,
      this.g + (to.g - this.g) * t,
      this.b + (to.b - this.b) * t,
      this.a + (to.a - this.a) * t,
    );
  }

  /** The same colour with alpha multiplied (modulate-style fade). */
  fade(k: number): Color {
    return new Color(this.r, this.g, this.b, this.a * k);
  }

  equals(o: Color): boolean {
    return this.r === o.r && this.g === o.g && this.b === o.b && this.a === o.a;
  }

  /** CSS colour string for a canvas context. */
  css(): string {
    const c = (x: number): number => Math.round(Math.min(Math.max(x, 0), 1) * 255);
    return `rgba(${c(this.r)},${c(this.g)},${c(this.b)},${Math.min(Math.max(this.a, 0), 1)})`;
  }

  /** 0xRRGGBB for Phaser tints (alpha dropped). */
  toRgb(): number {
    const c = (x: number): number => Math.round(Math.min(Math.max(x, 0), 1) * 255);
    return (c(this.r) << 16) | (c(this.g) << 8) | c(this.b);
  }
}

export const hex = (s: string): Color => Color.hex(s);
export const rgba = (r: number, g: number, b: number, a = 1): Color => new Color(r, g, b, a);
