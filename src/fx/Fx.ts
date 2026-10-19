// Juice toolkit: particle bursts, rings, floating text, screen shake and "fly to counter" collectibles.
// Ports scripts/game/Fx.gd. Particle textures are generated in code (see Particles.ts).

import * as Phaser from 'phaser';
import type { BaseScene } from '../scenes/BaseScene';
import * as Art from '../render/Art';
import { CanvasView } from '../render/CanvasView';
import { Color, hex } from '../render/Color';
import { labelStyle } from '../render/Fonts';
import { paletteFill } from '../render/Art';
import { Hue } from '../core/Palette';
import { EaseKind, Trans } from '../ui/Tween';
import { makeLabel } from '../ui/widgets';
import { ParticleBurst, SHRINK_CURVE, type ParticleConfig } from './Particles';

/** Depths, mirroring the Godot z_index stack: resting pieces < fx < toast < dragged piece < guide < text < gems. */
export const Z = { pieces: 20, fx: 40, toast: 70, drag: 120, guide: 170, text: 220, gems: 320, panel: 400 } as const;

const burst = (scene: Phaser.Scene, cfg: ParticleConfig): ParticleBurst => new ParticleBurst(scene, { depth: Z.fx, ...cfg });

const fadeRamp = (c: Color) => (t: number): Color => (t <= 0.7 ? c : c.withAlpha(c.a * (1 - (t - 0.7) / 0.3)));

/** Small one-shot burst of candy bits at a placed piece's centre. */
export function piecePop(scene: Phaser.Scene, x: number, y: number, color: Color): ParticleBurst {
  return burst(scene, {
    x, y, tex: 'circle', amount: 14, lifetime: 0.5, direction: -90, spread: 180, gravityY: 700,
    vMin: 160, vMax: 340, dampMin: 60, dampMax: 120, scaleMin: 0.25, scaleMax: 0.5, scaleCurve: SHRINK_CURVE,
    color: color.lightened(0.1),
  });
}

/** Twinkling four-point stars flung outward. */
export function starSparkle(scene: Phaser.Scene, x: number, y: number, color: Color = Color.WHITE, amount = 9, power = 1, depth: number = Z.fx): ParticleBurst {
  return burst(scene, {
    depth,
    x, y, tex: 'sparkle', amount, lifetime: 0.6, direction: -90, spread: 180,
    vMin: 140 * power, vMax: 320 * power, dampMin: 300 * power, dampMax: 500 * power,
    angVelMin: -360, angVelMax: 360, scaleMin: 0.6, scaleMax: 1.2, scaleCurve: SHRINK_CURVE, color,
  });
}

/** A few hearts that float up: a piece just became happy. */
export function heartsUp(scene: Phaser.Scene, x: number, y: number, color: Color = hex('#ff5fa2')): ParticleBurst {
  return burst(scene, {
    x, y, tex: 'heart', amount: 6, lifetime: 1, explosiveness: 0.75, direction: -90, spread: 40, gravityY: -120,
    vMin: 60, vMax: 130, scaleMin: 0.6, scaleMax: 1, scaleCurve: SHRINK_CURVE, colorRamp: fadeRamp(color),
    emission: { kind: 'sphere', r: 18 },
  });
}

/** A grumpy smoke puff: a piece just became upset. */
export function puff(scene: Phaser.Scene, x: number, y: number, color: Color = new Color(0.45, 0.4, 0.6, 1)): ParticleBurst {
  return burst(scene, {
    x, y, tex: 'soft', amount: 10, lifetime: 0.55, direction: -90, spread: 180, gravityY: -40,
    vMin: 50, vMax: 120, dampMin: 80, dampMax: 140, scaleMin: 1, scaleMax: 1.8, scaleCurve: SHRINK_CURVE,
    colorRamp: fadeRamp(color.withAlpha(0.8)),
  });
}

const CONFETTI_HUES = [Hue.PINK, Hue.YELLOW, Hue.GREEN, Hue.BLUE, Hue.PURPLE, Hue.ORANGE];
const confettiColors = (): Color[] => CONFETTI_HUES.map((h) => paletteFill(h));

/** Big multi-colour burst: every particle keeps one palette hue for its whole life. */
export function confettiBurst(scene: Phaser.Scene, x: number, y: number, amount = 70, power = 1, depth: number = Z.fx): ParticleBurst {
  return burst(scene, {
    depth,
    x, y, tex: 'confetti', amount, lifetime: 1.6, explosiveness: 0.95, direction: -90, spread: 70, gravityY: 900,
    vMin: 500 * power, vMax: 950 * power, dampMin: 120, dampMax: 260, angleMin: -180, angleMax: 180,
    angVelMin: -720, angVelMax: 720, scaleMin: 0.8, scaleMax: 1.5, colorInitial: confettiColors(),
  });
}

/** Confetti cannon from a screen corner, angled inward. dir is a vector. */
export function confettiCannon(scene: Phaser.Scene, x: number, y: number, dirX: number, dirY: number, amount = 60): ParticleBurst {
  return burst(scene, {
    x, y, tex: 'confetti', amount, lifetime: 1.6, explosiveness: 0.95,
    direction: (Math.atan2(dirY, dirX) * 180) / Math.PI, spread: 22, gravityY: 900,
    vMin: 500 * 1.25, vMax: 950 * 1.25, dampMin: 120, dampMax: 260, angleMin: -180, angleMax: 180,
    angVelMin: -720, angVelMax: 720, scaleMin: 0.8, scaleMax: 1.5, colorInitial: confettiColors(),
  });
}

/** Gentle full-width confetti rain from above the given rect. */
export function confettiRain(scene: Phaser.Scene, x: number, y: number, w: number, amount = 90, depth: number = Z.fx): ParticleBurst {
  return burst(scene, {
    depth,
    x: x + w / 2, y: y - 20, tex: 'confetti', amount, lifetime: 3.2, explosiveness: 0, direction: 90, spread: 15, gravityY: 260,
    vMin: 80, vMax: 200, angleMin: -180, angleMax: 180, angVelMin: -400, angVelMax: 400, scaleMin: 0.7, scaleMax: 1.3,
    colorInitial: confettiColors(), emission: { kind: 'rect', ex: w * 0.5, ey: 8 },
  });
}

/** Expanding, fading shockwave ring. */
export function ringWave(scene: BaseScene, x: number, y: number, radius: number, color: Color = Color.WHITE, width = 10, duration = 0.45): void {
  const g = scene.add.graphics();
  g.setDepth(Z.fx);
  const t = scene.tw.create();
  t.tweenMethod((k) => {
    // k runs 0..1 linearly; the radius eases out (cubic) like the Godot Ring node.
    const e = 1 - (1 - k) ** 3;
    const r = radius * (0.35 + 0.85 * e);
    g.clear();
    g.lineStyle(Math.max(1, width * (1 - k)), color.toRgb(), color.a * (1 - k));
    g.strokeCircle(x, y, r);
  }, 0, 1, duration);
  t.tweenCallback(() => g.destroy());
}

/** Outlined text that pops in, drifts up and fades. */
export function floatText(scene: BaseScene, text: string, x: number, y: number, color: Color = Color.WHITE, size = 56, rise = 90, hold = 0.55): void {
  const lab = makeLabel(scene, text, labelStyle(size, color, Art.TEXT_OUTLINE), { align: 'center', boxW: 700 });
  lab.setTopLeft(x - 350, y - lab.viewH / 2);
  lab.setDepth(Z.text);
  lab.setScale(0.3);
  const startY = lab.y;
  const t = scene.tw.create();
  t.tweenProperty(lab, 'scale', [1.18, 1.18], 0.16).setTrans(Trans.BACK).setEase(EaseKind.OUT);
  t.tweenProperty(lab, 'scale', [1, 1], 0.1);
  t.tweenInterval(hold);
  t.setParallel(true);
  t.tweenProperty(lab, 'y', startY - rise, 0.45).setTrans(Trans.CUBIC).setEase(EaseKind.IN);
  t.tweenProperty(lab, 'alpha', 0, 0.45);
  t.chain().tweenCallback(() => lab.destroy());
}

/** Decaying, smooth (sin-driven) positional shake of the whole screen. */
export function shake(scene: BaseScene, strength = 8, duration = 0.3): void {
  const cam = scene.cameras.main;
  const prev = (scene as unknown as { __shake?: { kill(): void } }).__shake;
  prev?.kill();
  const seed = Math.random() * 100;
  const t = scene.tw.create();
  t.tweenMethod((k) => {
    const amp = strength * (1 - k) * (1 - k);
    cam.setScroll(-Math.sin(seed + k * 55) * amp, -Math.cos(seed * 1.7 + k * 43) * amp);
  }, 0, 1, duration);
  t.tweenCallback(() => cam.setScroll(0, 0));
  (scene as unknown as { __shake?: unknown }).__shake = t;
}

/**
 * Little gems that arc from (fx,fy) to (tx,ty), one by one, calling `onArrive` as each lands: the classic
 * "reward flies into the counter".
 */
export function flyGems(scene: BaseScene, fx: number, fy: number, tx: number, ty: number, count: number, onArrive: () => void, onDone?: () => void): void {
  for (let i = 0; i < count; i++) {
    const g = new CanvasView(scene, 0, 0, 40, 40, (ci) => Art.drawGem(ci, 20, 20, 14), 8);
    g.setPivot(20, 20);
    g.setDepth(Z.gems);
    const sx = fx + (Math.random() * 140 - 70) * 0.3;
    const sy = fy + (Math.random() * 80 - 50) * 0.3;
    const cx = fx + (tx - fx) * 0.35 + (Math.random() * 320 - 160);
    const cy = fy + (ty - fy) * 0.35 + (Math.random() * 180 - 60);
    g.setTopLeft(sx - 20, sy - 20);
    g.setScale(0);
    const last = i === count - 1;
    const t = scene.tw.create();
    t.tweenInterval(i * 0.06);
    t.tweenProperty(g, 'scale', [1.2, 1.2], 0.12).setTrans(Trans.BACK).setEase(EaseKind.OUT);
    t.tweenMethod((k) => {
      const ax = sx + (cx - sx) * k;
      const ay = sy + (cy - sy) * k;
      const bx = cx + (tx - cx) * k;
      const by = cy + (ty - cy) * k;
      g.setPosition(ax + (bx - ax) * k, ay + (by - ay) * k);
      g.setScale(1.2 + (0.7 - 1.2) * k);
    }, 0, 1, 0.5).setTrans(Trans.SINE).setEase(EaseKind.IN);
    t.tweenCallback(() => {
      onArrive();
      if (last) onDone?.();
      g.destroy();
    });
  }
}
