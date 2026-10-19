// Godot's Tween easing curves (core/math/easing_equations.h), so animations feel the same as the Godot build.

export type EaseFn = (t: number) => number;

export const Trans = { LINEAR: 0, SINE: 1, QUINT: 2, QUART: 3, QUAD: 4, EXPO: 5, ELASTIC: 6, CUBIC: 7, CIRC: 8, BOUNCE: 9, BACK: 10 } as const;
export type TransKind = (typeof Trans)[keyof typeof Trans];

export const EaseKind = { IN: 0, OUT: 1, IN_OUT: 2, OUT_IN: 3 } as const;
export type EaseKindValue = (typeof EaseKind)[keyof typeof EaseKind];

const PI = Math.PI;

const poly = (n: number): { in: EaseFn; out: EaseFn; inOut: EaseFn } => ({
  in: (t) => t ** n,
  out: (t) => 1 - (1 - t) ** n,
  inOut: (t) => (t < 0.5 ? 2 ** (n - 1) * t ** n : 1 - (-2 * t + 2) ** n / 2),
});

const BACK_S = 1.70158;

function bounceOut(t: number): number {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (t < 1 / d1) return n1 * t * t;
  if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
  if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
  return n1 * (t -= 2.625 / d1) * t + 0.984375;
}

// Penner elastic with amplitude 1 and period 0.3, as Godot ships it.
const EL_P = 0.3;
const EL_S = EL_P / 4;
const elasticIn: EaseFn = (t) => (t === 0 ? 0 : t === 1 ? 1 : -(2 ** (10 * (t - 1)) * Math.sin(((t - 1 - EL_S) * 2 * PI) / EL_P)));
const elasticOut: EaseFn = (t) => (t === 0 ? 0 : t === 1 ? 1 : 2 ** (-10 * t) * Math.sin(((t - EL_S) * 2 * PI) / EL_P) + 1);
const elasticInOut: EaseFn = (t) => {
  if (t === 0) return 0;
  if (t === 1) return 1;
  const p = EL_P * 1.5;
  const s = p / 4;
  const u = t * 2;
  if (u < 1) return -0.5 * 2 ** (10 * (u - 1)) * Math.sin(((u - 1 - s) * 2 * PI) / p);
  return 2 ** (-10 * (u - 1)) * Math.sin(((u - 1 - s) * 2 * PI) / p) * 0.5 + 1;
};

const backIn: EaseFn = (t) => t * t * ((BACK_S + 1) * t - BACK_S);
const backOut: EaseFn = (t) => {
  const u = t - 1;
  return u * u * ((BACK_S + 1) * u + BACK_S) + 1;
};
const backInOut: EaseFn = (t) => {
  const s = BACK_S * 1.525;
  let u = t * 2;
  if (u < 1) return 0.5 * (u * u * ((s + 1) * u - s));
  u -= 2;
  return 0.5 * (u * u * ((s + 1) * u + s) + 2);
};

export function easeFn(trans: TransKind, ease: EaseKindValue): EaseFn {
  const pick = (i: EaseFn, o: EaseFn, io: EaseFn): EaseFn => (ease === EaseKind.IN ? i : ease === EaseKind.OUT ? o : ease === EaseKind.IN_OUT ? io : o);
  switch (trans) {
    case Trans.SINE:
      return pick(
        (t) => 1 - Math.cos((t * PI) / 2),
        (t) => Math.sin((t * PI) / 2),
        (t) => -(Math.cos(PI * t) - 1) / 2,
      );
    case Trans.QUAD: {
      const p = poly(2);
      return pick(p.in, p.out, p.inOut);
    }
    case Trans.CUBIC: {
      const p = poly(3);
      return pick(p.in, p.out, p.inOut);
    }
    case Trans.QUART: {
      const p = poly(4);
      return pick(p.in, p.out, p.inOut);
    }
    case Trans.QUINT: {
      const p = poly(5);
      return pick(p.in, p.out, p.inOut);
    }
    case Trans.EXPO:
      return pick(
        (t) => (t === 0 ? 0 : 2 ** (10 * t - 10)),
        (t) => (t === 1 ? 1 : 1 - 2 ** (-10 * t)),
        (t) => (t === 0 ? 0 : t === 1 ? 1 : t < 0.5 ? 2 ** (20 * t - 10) / 2 : (2 - 2 ** (-20 * t + 10)) / 2),
      );
    case Trans.CIRC:
      return pick(
        (t) => 1 - Math.sqrt(1 - t * t),
        (t) => Math.sqrt(1 - (t - 1) ** 2),
        (t) => (t < 0.5 ? (1 - Math.sqrt(1 - (2 * t) ** 2)) / 2 : (Math.sqrt(1 - (-2 * t + 2) ** 2) + 1) / 2),
      );
    case Trans.ELASTIC:
      return pick(elasticIn, elasticOut, elasticInOut);
    case Trans.BACK:
      return pick(backIn, backOut, backInOut);
    case Trans.BOUNCE:
      return pick(
        (t) => 1 - bounceOut(1 - t),
        bounceOut,
        (t) => (t < 0.5 ? (1 - bounceOut(1 - 2 * t)) / 2 : (1 + bounceOut(2 * t - 1)) / 2),
      );
    default:
      return (t) => t;
  }
}
