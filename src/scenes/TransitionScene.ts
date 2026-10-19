// Circle-wipe scene change. Ports scripts/ui/Transition.gd + shaders/transition.gdshader.
//
// The cover is the splash/banner sky: a soft blue -> lavender -> pink gradient with floating light dots and a pink
// cloud bank at the bottom, and a white glow rides the edge of the hole. The cover is computed once per wipe with
// the shader's own formulas (on a half-resolution canvas: it is all soft gradients), then each frame punches the
// round hole and adds the rim glow with Canvas 2D. The scene lives above every other scene and survives scene
// changes, like the CanvasLayer on the tree root did in Godot.

import * as Phaser from 'phaser';
import { BaseScene } from './BaseScene';
import { CanvasView } from '../render/CanvasView';
import { Viewport } from '../render/Viewport';
import { EaseKind, Trans } from '../ui/Tween';

const SKY_TOP = [0.62, 0.8, 0.98];
const SKY_MID = [0.8, 0.72, 0.97];
const SKY_BOTTOM = [0.98, 0.76, 0.88];
const CLOUD = [1, 0.9, 0.95];

const fract = (x: number): number => x - Math.floor(x);
const smoothstep = (a: number, b: number, x: number): number => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};
const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

function hash21(px: number, py: number): number {
  let x = fract(px * 123.34);
  let y = fract(py * 456.21);
  const d = x * (x + 45.32) + y * (y + 45.32);
  x += d;
  y += d;
  return fract(x * y);
}

/** The wipe's sky, evaluated like the fragment shader (UV in 0..1, aspect = width / height). */
function renderCover(w: number, h: number, aspect: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    const t = (y + 0.5) / h;
    for (let x = 0; x < w; x++) {
      const u = (x + 0.5) / w;
      const col = [0, 0, 0];
      const m1 = smoothstep(0, 0.6, t);
      const m2 = smoothstep(0.5, 1, t);
      for (let k = 0; k < 3; k++) {
        let v = mix(SKY_TOP[k], SKY_MID[k], m1);
        v = mix(v, SKY_BOTTOM[k], m2);
        col[k] = v;
      }
      // Floating light dots on a loose grid, each with its own size and glow.
      const gx = u * aspect * 9;
      const gy = t * 9;
      const cx = Math.floor(gx);
      const cy = Math.floor(gy);
      const fx = fract(gx) - 0.5;
      const fy = fract(gy) - 0.5;
      const hh = hash21(cx, cy);
      const ox = (hash21(cx + 7.1, cy + 7.1) - 0.5) * 0.5;
      const oy = (hash21(cx + 3.7, cy + 3.7) - 0.5) * 0.5;
      const dd = Math.hypot(fx - ox, fy - oy);
      const dotR = 0.05 + hh * 0.1;
      const spark = (1 - smoothstep(dotR * 0.6, dotR, dd)) * (hh >= 0.35 ? 1 : 0);
      for (let k = 0; k < 3; k++) col[k] = mix(col[k], 1, spark * 0.45);
      // A scalloped pink cloud bank along the bottom edge.
      const bank = 0.88 + Math.sin(u * aspect * 14) * 0.012 + Math.sin(u * aspect * 31 + 1.3) * 0.006;
      const cm = smoothstep(bank - 0.004, bank + 0.004, t);
      for (let k = 0; k < 3; k++) col[k] = mix(col[k], CLOUD[k], cm);
      const i = (y * w + x) * 4;
      d[i] = Math.round(col[0] * 255);
      d[i + 1] = Math.round(col[1] * 255);
      d[i + 2] = Math.round(col[2] * 255);
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

export class TransitionScene extends BaseScene {
  private view!: CanvasView;
  private blocker!: Phaser.GameObjects.Zone;
  private cover: HTMLCanvasElement | null = null;
  private progress = 0;
  private busy = false;

  constructor() {
    super('Transition');
  }

  protected build(): void {
    this.view = new CanvasView(this, 0, 0, this.W, this.H, (ci, v) => this.paintWipe(ci, v.viewW, v.viewH), 0);
    this.view.setDepth(10).setVisible(false);
    this.blocker = this.add.zone(0, 0, this.W, this.H).setOrigin(0, 0).setInteractive();
    this.blocker.input!.enabled = false;
  }

  protected onResize(): void {
    this.view.resizeView(this.W, this.H);
    this.blocker.setSize(this.W, this.H);
    this.blocker.input?.hitArea.setSize(this.W, this.H);
  }

  private paintWipe(ci: import('../render/CanvasItem').CanvasItem, w: number, h: number): void {
    const p = this.progress;
    if (p <= 0 || !this.cover) return;
    const ctx = ci.ctx;
    ctx.drawImage(this.cover, 0, 0, w, h);
    if (p >= 0.999) return;
    const aspect = w / h;
    const maxR = Math.hypot(aspect, 1) * 0.5 + 0.06;
    const r = (1 - p) * maxR * h; // the shader works in units of the screen height
    const cx = w / 2;
    const cy = h / 2;
    // The hole, with a ~3px soft edge.
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    const g = ctx.createRadialGradient(cx, cy, Math.max(r - 1.5, 0), cx, cy, r + 1.5);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
    // A soft white glow hugging the hole's edge (peak 8px outside it, 16px wide each way).
    if (p > 0.001) {
      const inner = Math.max(r - 8, 0);
      const outer = r + 24;
      const rg = ctx.createRadialGradient(cx, cy, inner, cx, cy, outer);
      const at = (rad: number): number => Math.min(Math.max((rad - inner) / (outer - inner), 0), 1);
      const stops: [number, number][] = [[-8, 0], [-4, 0.156], [0, 0.5], [4, 0.84], [8, 1], [12, 0.84], [16, 0.5], [20, 0.156], [24, 0]];
      for (const [off, a] of stops) rg.addColorStop(at(r + off), `rgba(255,255,255,${a * 0.9})`);
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, w, h);
    }
  }

  /** Cover the screen, run `onCovered` (switch scenes), then open the hole again over the new scene. */
  wipe(onCovered: () => void): void {
    if (this.busy) return;
    this.busy = true;
    this.scene.bringToTop();
    const W = this.W;
    const H = this.H;
    const scale = Math.min(1, Math.sqrt(900_000 / (W * H * Viewport.rs * Viewport.rs)));
    this.cover = renderCover(Math.max(64, Math.round(W * Viewport.rs * scale)), Math.max(64, Math.round(H * Viewport.rs * scale)), W / H);
    this.progress = 0;
    this.view.setVisible(true);
    if (this.blocker.input) this.blocker.input.enabled = true;
    const t = this.tw.create();
    t.tweenMethod((v) => this.setProgress(v), 0, 1, 0.32).setTrans(Trans.CUBIC).setEase(EaseKind.IN);
    t.tweenCallback(() => {
      onCovered();
      this.scene.bringToTop();
    });
    t.tweenInterval(0.08);
    t.tweenMethod((v) => this.setProgress(v), 1, 0, 0.38).setTrans(Trans.CUBIC).setEase(EaseKind.OUT);
    t.tweenCallback(() => {
      this.busy = false;
      this.view.setVisible(false);
      this.cover = null;
      if (this.blocker.input) this.blocker.input.enabled = false;
    });
  }

  private setProgress(v: number): void {
    this.progress = v;
    this.view.invalidate();
  }
}
