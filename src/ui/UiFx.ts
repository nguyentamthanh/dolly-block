// Small reusable UI motion helpers (ports scripts/ui/UiFx.gd): squishy press feedback that works on touch,
// idle "breathing" for the main call to action, staggered pop-ins. Objects scale around their own position, so
// widgets are positioned by their centre (Phaser Containers / Images with a centred origin).

import type { BaseScene } from '../scenes/BaseScene';
import { EaseKind, Trans, type Tween } from './Tween';

const slots = new WeakMap<object, Record<string, Tween>>();

function run(scene: BaseScene, obj: object, key: string, build: (t: Tween) => void): Tween {
  stop(obj, key);
  const t = scene.tw.create();
  build(t);
  let m = slots.get(obj);
  if (!m) slots.set(obj, (m = {}));
  m[key] = t;
  return t;
}

export function stop(obj: object, key: string): void {
  const prev = slots.get(obj)?.[key];
  if (prev?.valid) prev.kill();
}

export function stopAll(obj: object): void {
  const m = slots.get(obj);
  if (!m) return;
  for (const t of Object.values(m)) if (t.valid) t.kill();
}

type Scalable = { setScale(x: number, y?: number): unknown };

const pulses = new WeakMap<object, { amount: number; period: number }>();

/** Press: squash down to 0.9. Release: overshoot to 1.08 and settle. A running pulse() pauses while pressed. */
export function juicyDown(scene: BaseScene, b: Scalable): void {
  stop(b, 'pulse');
  run(scene, b, 'press', (t) => {
    t.tweenProperty(b, 'scale', [0.9, 0.9], 0.07).setTrans(Trans.QUAD).setEase(EaseKind.OUT);
  });
}

export function juicyUp(scene: BaseScene, b: Scalable): void {
  run(scene, b, 'press', (t) => {
    t.tweenProperty(b, 'scale', [1.08, 1.08], 0.09).setTrans(Trans.BACK).setEase(EaseKind.OUT);
    t.tweenProperty(b, 'scale', [1, 1], 0.12).setTrans(Trans.SINE).setEase(EaseKind.IN_OUT);
    t.tweenCallback(() => {
      const p = pulses.get(b);
      if (p) pulse(scene, b, p.amount, p.period);
    });
  });
}

/** Gentle looping scale breath that draws the eye to the primary action. */
export function pulse(scene: BaseScene, c: Scalable, amount = 0.05, period = 1.1): void {
  pulses.set(c, { amount, period });
  run(scene, c, 'pulse', (t) => {
    t.setLoops();
    t.tweenProperty(c, 'scale', [1 + amount, 1 + amount], period * 0.5).setTrans(Trans.SINE).setEase(EaseKind.IN_OUT);
    t.tweenProperty(c, 'scale', [1, 1], period * 0.5).setTrans(Trans.SINE).setEase(EaseKind.IN_OUT);
  });
}

/** Scale in from nothing with an overshoot, after `delay` seconds. */
export function popIn(scene: BaseScene, c: Scalable, delay = 0, duration = 0.38): void {
  c.setScale(0, 0);
  run(scene, c, 'pop', (t) => {
    t.tweenInterval(delay);
    t.tweenProperty(c, 'scale', [1, 1], duration).setTrans(Trans.BACK).setEase(EaseKind.OUT);
  });
}

/** Slide in from an offset while fading up. */
export function slideIn(scene: BaseScene, c: Scalable & { x: number; y: number; alpha: number }, fromX: number, fromY: number, delay = 0, duration = 0.45): void {
  const tx = c.x;
  const ty = c.y;
  c.x = tx + fromX;
  c.y = ty + fromY;
  c.alpha = 0;
  run(scene, c, 'slide', (t) => {
    t.tweenInterval(delay);
    t.setParallel(true);
    t.tweenProperty(c, 'position', [tx, ty], duration).setTrans(Trans.BACK).setEase(EaseKind.OUT);
    t.tweenProperty(c, 'alpha', 1, duration * 0.6);
  });
}

/** Quick "boing" for a counter or chip that just changed. */
export function bump(scene: BaseScene, c: Scalable, amount = 0.18): void {
  run(scene, c, 'bump', (t) => {
    t.tweenProperty(c, 'scale', [1 + amount, 1 + amount], 0.06);
    t.tweenProperty(c, 'scale', [1, 1], 0.18).setTrans(Trans.BACK).setEase(EaseKind.OUT);
  });
}

/** Generic keyed tween for callers that need to cancel/replace their own animations. */
export function runKeyed(scene: BaseScene, obj: object, key: string, build: (t: Tween) => void): Tween {
  return run(scene, obj, key, build);
}
