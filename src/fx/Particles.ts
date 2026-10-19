// A small CPU particle system that follows Godot's CPUParticles2D semantics closely enough to reproduce the
// game's bursts: initial direction/spread/velocity, gravity, linear damping, spin, a scale-over-life curve,
// a colour ramp over life or a per-particle colour pick, world-space emission. Particles are plain Phaser
// images; the emitter frees itself when the last particle dies.

import * as Phaser from 'phaser';
import { Color } from '../render/Color';

export type ParticleTex = 'circle' | 'soft' | 'sparkle' | 'heart' | 'ring' | 'confetti';

const TEX_KEYS: Record<ParticleTex, string> = {
  circle: 'fx_circle',
  soft: 'fx_soft',
  sparkle: 'fx_sparkle',
  heart: 'fx_heart',
  ring: 'fx_ring',
  confetti: 'fx_confetti',
};

/** Procedural 32x32 particle textures (and the 8x14 confetti chip), generated once per game. */
export function ensureParticleTextures(scene: Phaser.Scene): void {
  const tm = scene.textures;
  if (tm.exists(TEX_KEYS.circle)) return;
  const n = 32;
  const make = (key: string, fn: (px: number, py: number) => number): void => {
    const tex = tm.createCanvas(key, n, n)!;
    const ctx = tex.getContext();
    const img = ctx.createImageData(n, n);
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const px = ((x + 0.5) / n) * 2 - 1;
        const py = ((y + 0.5) / n) * 2 - 1;
        const a = Math.min(Math.max(fn(px, py), 0), 1);
        const i = (y * n + x) * 4;
        img.data[i] = 255;
        img.data[i + 1] = 255;
        img.data[i + 2] = 255;
        img.data[i + 3] = Math.round(a * 255);
      }
    }
    ctx.putImageData(img, 0, 0);
    tex.refresh();
  };
  const clamp01 = (v: number): number => Math.min(Math.max(v, 0), 1);
  make(TEX_KEYS.circle, (px, py) => clamp01((1 - Math.hypot(px, py)) * 10));
  make(TEX_KEYS.soft, (px, py) => clamp01(1 - Math.hypot(px, py)) ** 2);
  make(TEX_KEYS.sparkle, (px, py) => {
    // Four-point star: astroid-ish sqrt|x| + sqrt|y| < 1, plus a soft core glow.
    const d = Math.sqrt(Math.abs(px)) + Math.sqrt(Math.abs(py));
    return Math.max(clamp01((1 - d) * 6), clamp01(1 - Math.hypot(px, py) * 2.2));
  });
  make(TEX_KEYS.heart, (px, py) => {
    const hx = px * 1.25;
    const hy = -py * 1.25 + 0.25;
    const f = (hx * hx + hy * hy - 1) ** 3 - hx * hx * hy * hy * hy;
    return f <= 0 ? 1 : 0;
  });
  make(TEX_KEYS.ring, (px, py) => clamp01(1 - Math.abs(Math.hypot(px, py) - 0.8) * 9));
  const conf = tm.createCanvas(TEX_KEYS.confetti, 8, 14)!;
  conf.getContext().fillStyle = '#fff';
  conf.getContext().fillRect(0, 0, 8, 14);
  conf.refresh();
}

/** Godot Curve with default (zero) tangents: smooth ease between the points. */
export type Curve = readonly (readonly [number, number])[];

export function sampleCurve(c: Curve, t: number): number {
  if (t <= c[0][0]) return c[0][1];
  for (let i = 0; i < c.length - 1; i++) {
    const [x0, y0] = c[i];
    const [x1, y1] = c[i + 1];
    if (t <= x1) {
      const u = (t - x0) / (x1 - x0);
      return y0 + (y1 - y0) * (3 * u * u - 2 * u * u * u);
    }
  }
  return c[c.length - 1][1];
}

export const SHRINK_CURVE: Curve = [
  [0, 0.4],
  [0.15, 1],
  [1, 0],
];

export interface ParticleConfig {
  x: number;
  y: number;
  tex: ParticleTex;
  amount: number;
  lifetime: number;
  /** 1 = everything at once; lower spreads the spawns over the lifetime */
  explosiveness?: number;
  /** direction angle in degrees (0 = right, -90 = up) */
  direction?: number;
  /** +/- degrees around `direction` */
  spread?: number;
  gravityX?: number;
  gravityY?: number;
  vMin?: number;
  vMax?: number;
  dampMin?: number;
  dampMax?: number;
  angleMin?: number;
  angleMax?: number;
  angVelMin?: number;
  angVelMax?: number;
  scaleMin?: number;
  scaleMax?: number;
  scaleCurve?: Curve;
  color?: Color;
  /** colour multiplier over life */
  colorRamp?: (t: number) => Color;
  /** each particle picks one of these for its whole life */
  colorInitial?: readonly Color[];
  emission?: { kind: 'sphere'; r: number } | { kind: 'rect'; ex: number; ey: number };
  depth?: number;
}

interface P {
  img: Phaser.GameObjects.Image;
  born: number; // spawn time offset (s)
  alive: boolean;
  age: number;
  vx: number;
  vy: number;
  damp: number;
  ang: number;
  angVel: number;
  scale: number;
  tint: Color;
}

const rnd = (a: number, b: number): number => a + Math.random() * (b - a);

export class ParticleBurst {
  private ps: P[] = [];
  private t = 0;
  private done = false;

  constructor(
    private scene: Phaser.Scene,
    private cfg: ParticleConfig,
  ) {
    ensureParticleTextures(scene);
    const c = cfg;
    const expl = c.explosiveness ?? 1;
    const dir = ((c.direction ?? -90) * Math.PI) / 180;
    const spread = ((c.spread ?? 0) * Math.PI) / 180;
    for (let i = 0; i < c.amount; i++) {
      const a = dir + rnd(-spread, spread);
      const v = rnd(c.vMin ?? 0, c.vMax ?? 0);
      let ox = 0;
      let oy = 0;
      if (c.emission?.kind === 'sphere') {
        const ang = Math.random() * Math.PI * 2;
        const rr = Math.sqrt(Math.random()) * c.emission.r;
        ox = Math.cos(ang) * rr;
        oy = Math.sin(ang) * rr;
      } else if (c.emission?.kind === 'rect') {
        ox = rnd(-c.emission.ex, c.emission.ex);
        oy = rnd(-c.emission.ey, c.emission.ey);
      }
      const img = scene.add.image(c.x + ox, c.y + oy, TEX_KEYS[c.tex]);
      img.setDepth(c.depth ?? 40);
      img.setVisible(false);
      const tint = c.colorInitial ? c.colorInitial[Math.floor(Math.random() * c.colorInitial.length)] : (c.color ?? Color.WHITE);
      this.ps.push({
        img,
        born: (i / c.amount) * c.lifetime * (1 - expl),
        alive: false,
        age: 0,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        damp: rnd(c.dampMin ?? 0, c.dampMax ?? 0),
        ang: (rnd(c.angleMin ?? 0, c.angleMax ?? 0) * Math.PI) / 180,
        angVel: (rnd(c.angVelMin ?? 0, c.angVelMax ?? 0) * Math.PI) / 180,
        scale: rnd(c.scaleMin ?? 1, c.scaleMax ?? 1),
        tint,
      });
    }
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.update, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
  }

  private update = (_time: number, deltaMs: number): void => {
    if (this.done) return;
    const dt = deltaMs / 1000;
    this.t += dt;
    const c = this.cfg;
    let liveOrPending = false;
    for (const p of this.ps) {
      if (p.age >= c.lifetime) continue;
      if (!p.alive) {
        if (this.t < p.born) {
          liveOrPending = true;
          continue;
        }
        p.alive = true;
        p.img.setVisible(true);
      }
      p.age += dt;
      if (p.age >= c.lifetime) {
        p.img.destroy();
        continue;
      }
      liveOrPending = true;
      p.vx += (c.gravityX ?? 0) * dt;
      p.vy += (c.gravityY ?? 0) * dt;
      if (p.damp > 0) {
        const sp = Math.hypot(p.vx, p.vy);
        if (sp > 0) {
          const ns = Math.max(0, sp - p.damp * dt);
          p.vx *= ns / sp;
          p.vy *= ns / sp;
        }
      }
      p.img.x += p.vx * dt;
      p.img.y += p.vy * dt;
      p.ang += p.angVel * dt;
      const k = p.age / c.lifetime;
      const s = p.scale * (c.scaleCurve ? sampleCurve(c.scaleCurve, k) : 1);
      p.img.setScale(s);
      p.img.setRotation(p.ang);
      const ramp = c.colorRamp ? c.colorRamp(k) : Color.WHITE;
      p.img.setTint(new Color(p.tint.r * ramp.r, p.tint.g * ramp.g, p.tint.b * ramp.b, 1).toRgb());
      p.img.setAlpha(p.tint.a * ramp.a);
    }
    if (!liveOrPending) this.destroy();
  };

  destroy(): void {
    if (this.done) return;
    this.done = true;
    this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.update, this);
    for (const p of this.ps) if (p.img.scene) p.img.destroy();
    this.ps = [];
  }
}
