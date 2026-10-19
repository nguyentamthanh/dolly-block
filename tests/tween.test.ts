import { describe, expect, it } from 'vitest';
import { EaseKind, Trans, TweenRunner } from '../src/ui/Tween';
import { easeFn } from '../src/ui/ease';

describe('Tween (Godot semantics)', () => {
  it('runs tweeners in sequence by default', () => {
    const runner = new TweenRunner();
    const o = { a: 0, b: 0 };
    const log: string[] = [];
    const t = runner.create();
    t.tweenProperty(o, 'a', 10, 1);
    t.tweenCallback(() => log.push('cb'));
    t.tweenProperty(o, 'b', 5, 1);
    runner.update(0.5);
    expect(o.a).toBeCloseTo(5);
    expect(o.b).toBe(0);
    runner.update(0.5);
    expect(o.a).toBe(10);
    runner.update(0.25);
    expect(log).toEqual(['cb']);
    expect(o.b).toBeCloseTo(1.25);
  });

  it('parallel then chain', () => {
    const runner = new TweenRunner();
    const o = { a: 0, b: 0, c: 0 };
    const t = runner.create().setParallel(true);
    t.tweenProperty(o, 'a', 1, 1);
    t.tweenProperty(o, 'b', 1, 2);
    t.chain().tweenProperty(o, 'c', 1, 1);
    runner.update(1);
    expect(o.a).toBe(1);
    expect(o.b).toBeCloseTo(0.5);
    expect(o.c).toBe(0);
    runner.update(1.5);
    expect(o.b).toBe(1);
    expect(o.c).toBeCloseTo(0.5);
  });

  it('loops forever and can be killed', () => {
    const runner = new TweenRunner();
    const o = { v: 0 };
    const t = runner.create().setLoops();
    t.tweenProperty(o, 'v', 1, 1);
    t.tweenProperty(o, 'v', 0, 1);
    runner.update(2.5);
    expect(o.v).toBeCloseTo(0.5);
    t.kill();
    runner.update(1);
    expect(o.v).toBeCloseTo(0.5);
  });

  it('method tweeners and ease endpoints', () => {
    const runner = new TweenRunner();
    let seen = 0;
    runner.create().tweenMethod((v) => (seen = v), 0, 100, 1).setTrans(Trans.BACK).setEase(EaseKind.OUT);
    runner.update(1);
    expect(seen).toBeCloseTo(100);
    for (const tr of Object.values(Trans)) {
      for (const e of [EaseKind.IN, EaseKind.OUT, EaseKind.IN_OUT]) {
        const f = easeFn(tr, e);
        expect(f(0), `${tr}/${e} at 0`).toBeCloseTo(0, 5);
        expect(f(1), `${tr}/${e} at 1`).toBeCloseTo(1, 5);
      }
    }
  });
});
