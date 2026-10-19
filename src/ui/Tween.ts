// A small tween engine that mirrors Godot's `Tween`: tweeners run one after another by default;
// set_parallel(true) makes them run together until chain(). Driven by TweenRunner.update(dt seconds)
// from the owning scene, so a paused scene pauses its tweens too (like get_tree().paused in Godot).

import { easeFn, EaseKind, Trans, type EaseFn, type EaseKindValue, type TransKind } from './ease';

type Num2 = [number, number];

interface Tweener {
  /** Called when its group starts. */
  begin(): void;
  /** Advance by dt; returns the unused dt once finished, or -1 while still running. */
  step(dt: number): number;
}

/** Targets the tweener can drive: numeric properties, plus the "scale" / "position" pairs of a Phaser object. */
export interface TweenTarget {
  [k: string]: unknown;
}

function readProp(obj: TweenTarget, prop: string): number | Num2 {
  if (prop === 'scale') return [obj.scaleX as number, obj.scaleY as number];
  if (prop === 'position') return [obj.x as number, obj.y as number];
  if (prop === 'topLeft') return (obj.getTopLeft as () => Num2).call(obj);
  if (prop.includes(':')) {
    const [base, sub] = prop.split(':');
    if (base === 'modulate' && sub === 'a') return obj.alpha as number;
    return (obj[base] as TweenTarget)[sub] as number;
  }
  return obj[prop] as number;
}

function writeProp(obj: TweenTarget, prop: string, v: number | Num2): void {
  if (prop === 'scale') {
    const [sx, sy] = v as Num2;
    (obj.setScale as (x: number, y: number) => void).call(obj, sx, sy);
  } else if (prop === 'topLeft') {
    const [x, y] = v as Num2;
    (obj.setTopLeft as (x: number, y: number) => void).call(obj, x, y);
  } else if (prop === 'position') {
    const [x, y] = v as Num2;
    (obj.setPosition as (x: number, y: number) => void).call(obj, x, y);
  } else if (prop.includes(':')) {
    const [base, sub] = prop.split(':');
    if (base === 'modulate' && sub === 'a') obj.alpha = v as number;
    else (obj[base] as TweenTarget)[sub] = v as number;
  } else {
    obj[prop] = v as number;
  }
}

export class PropTweener implements Tweener {
  private ease: EaseFn = easeFn(Trans.LINEAR, EaseKind.IN);
  private delay = 0;
  private t = 0;
  private from: number | Num2 = 0;
  private fixedFrom: number | Num2 | null = null;

  constructor(
    private obj: TweenTarget,
    private prop: string,
    private to: number | Num2,
    private dur: number,
  ) {}

  setTrans(trans: TransKind): this {
    this.transKind = trans;
    this.ease = easeFn(trans, this.easeKind);
    return this;
  }
  setEase(e: EaseKindValue): this {
    this.easeKind = e;
    this.ease = easeFn(this.transKind, e);
    return this;
  }
  setDelay(d: number): this {
    this.delay = d;
    return this;
  }
  from_(v: number | Num2): this {
    this.fixedFrom = v;
    return this;
  }
  private transKind: TransKind = Trans.LINEAR;
  private easeKind: EaseKindValue = EaseKind.IN;

  begin(): void {
    this.t = 0;
    this.from = this.fixedFrom ?? readProp(this.obj, this.prop);
  }

  step(dt: number): number {
    this.t += dt;
    const local = this.t - this.delay;
    if (local < 0) return -1;
    const k = this.dur <= 0 ? 1 : Math.min(local / this.dur, 1);
    const e = this.ease(k);
    if (Array.isArray(this.to)) {
      const f = this.from as Num2;
      writeProp(this.obj, this.prop, [f[0] + (this.to[0] - f[0]) * e, f[1] + (this.to[1] - f[1]) * e]);
    } else {
      const f = this.from as number;
      writeProp(this.obj, this.prop, f + (this.to - f) * e);
    }
    if (k >= 1) return Math.max(0, local - this.dur);
    return -1;
  }
}

export class MethodTweener implements Tweener {
  private ease: EaseFn = easeFn(Trans.LINEAR, EaseKind.IN);
  private t = 0;
  private transKind: TransKind = Trans.LINEAR;
  private easeKind: EaseKindValue = EaseKind.IN;

  constructor(
    private fn: (v: number) => void,
    private from: number,
    private to: number,
    private dur: number,
  ) {}

  setTrans(trans: TransKind): this {
    this.transKind = trans;
    this.ease = easeFn(trans, this.easeKind);
    return this;
  }
  setEase(e: EaseKindValue): this {
    this.easeKind = e;
    this.ease = easeFn(this.transKind, e);
    return this;
  }
  begin(): void {
    this.t = 0;
  }
  step(dt: number): number {
    this.t += dt;
    const k = this.dur <= 0 ? 1 : Math.min(this.t / this.dur, 1);
    this.fn(this.from + (this.to - this.from) * this.ease(k));
    if (k >= 1) return Math.max(0, this.t - this.dur);
    return -1;
  }
}

class IntervalTweener implements Tweener {
  private t = 0;
  constructor(private dur: number) {}
  begin(): void {
    this.t = 0;
  }
  step(dt: number): number {
    this.t += dt;
    return this.t >= this.dur ? this.t - this.dur : -1;
  }
}

class CallbackTweener implements Tweener {
  constructor(private fn: () => void) {}
  begin(): void {}
  step(dt: number): number {
    this.fn();
    return dt;
  }
}

export class Tween {
  private groups: Tweener[][] = [];
  private parallel = false;
  private chainNext = false;
  private loops = 1;
  private loopsDone = 0;
  private gi = 0;
  private started = false;
  /** false once finished or killed */
  valid = true;

  constructor(private runner: TweenRunner) {}

  private add<T extends Tweener>(t: T): T {
    if (!this.parallel || this.chainNext || this.groups.length === 0) {
      this.groups.push([t]);
      this.chainNext = false;
    } else {
      this.groups[this.groups.length - 1].push(t);
    }
    return t;
  }

  setParallel(p = true): this {
    this.parallel = p;
    return this;
  }
  chain(): this {
    this.chainNext = true;
    return this;
  }
  /** 0 = loop forever */
  setLoops(n = 0): this {
    this.loops = n;
    return this;
  }

  tweenProperty(obj: object, prop: string, to: number | Num2, dur: number): PropTweener {
    return this.add(new PropTweener(obj as TweenTarget, prop, to, dur));
  }
  tweenMethod(fn: (v: number) => void, from: number, to: number, dur: number): MethodTweener {
    return this.add(new MethodTweener(fn, from, to, dur));
  }
  tweenInterval(dur: number): this {
    this.add(new IntervalTweener(dur));
    return this;
  }
  tweenCallback(fn: () => void): this {
    this.add(new CallbackTweener(fn));
    return this;
  }

  kill(): void {
    this.valid = false;
    this.runner.remove(this);
  }

  /** Advance by dt seconds; returns false once finished. */
  update(dt: number): boolean {
    if (!this.valid) return false;
    if (this.groups.length === 0) {
      this.valid = false;
      return false;
    }
    if (!this.started) {
      this.started = true;
      this.beginGroup();
    }
    let left = dt;
    for (let guard = 0; guard < 64 && this.valid; guard++) {
      const group = this.groups[this.gi];
      let leftover = Infinity;
      let allDone = true;
      for (const tw of group) {
        const r = tw.step(left);
        if (r < 0) allDone = false;
        else leftover = Math.min(leftover, r);
      }
      if (!allDone) return true;
      // The group finished; carry the unused time into the next one.
      left = leftover === Infinity ? 0 : leftover;
      this.gi++;
      if (this.gi >= this.groups.length) {
        this.loopsDone++;
        if (this.loops !== 0 && this.loopsDone >= this.loops) {
          this.valid = false;
          return false;
        }
        this.gi = 0;
      }
      this.beginGroup();
      if (left <= 0) return true;
    }
    return this.valid;
  }

  private beginGroup(): void {
    for (const t of this.groups[this.gi]) t.begin();
  }
}

export class TweenRunner {
  private tweens = new Set<Tween>();

  create(): Tween {
    const t = new Tween(this);
    this.tweens.add(t);
    return t;
  }

  remove(t: Tween): void {
    this.tweens.delete(t);
  }

  update(dt: number): void {
    for (const t of [...this.tweens]) {
      if (!t.update(dt)) this.tweens.delete(t);
    }
  }

  killAll(): void {
    for (const t of this.tweens) t.valid = false;
    this.tweens.clear();
  }
}

export { Trans, EaseKind };
