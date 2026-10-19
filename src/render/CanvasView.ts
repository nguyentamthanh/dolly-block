// A Phaser game object whose pixels come from a Canvas 2D paint callback: the equivalent of a Godot Control
// with a `_draw()` override. The callback paints in logical units with the view's top-left at (0, 0); the
// canvas texture is rendered at the display's pixel density (Viewport.rs) so it stays crisp, and is repainted
// when the window changes or when `invalidate()` is called.
//
// The view is a Container around one image: the container's position/scale/rotation/alpha are free for
// animation (scale 1 is the natural size) and its origin is the pivot point set with setPivot().

import * as Phaser from 'phaser';
import { CanvasItem } from './CanvasItem';
import { Viewport } from './Viewport';

export type Paint = (ci: CanvasItem, view: CanvasView) => void;

let nextKey = 1;
const live = new Set<CanvasView>();
const dirty = new Set<CanvasView>();
let hooked = false;

/** Repaint dirty views right before each render; repaint everything when the pixel density changes. */
export function hookViews(game: Phaser.Game): void {
  if (hooked) return;
  hooked = true;
  game.events.on(Phaser.Core.Events.PRE_RENDER, () => {
    if (dirty.size === 0) return;
    for (const v of dirty) v.repaint();
    dirty.clear();
  });
  Viewport.onChange(() => {
    for (const v of live) v.repaint();
  });
}

export class CanvasView extends Phaser.GameObjects.Container {
  private readonly texKey: string;
  private tex: Phaser.Textures.CanvasTexture;
  private img: Phaser.GameObjects.Image;
  private nominalW: number;
  private nominalH: number;
  private pad: number;
  private pivotX = 0;
  private pivotY = 0;
  private paint: Paint;

  /**
   * @param w,h  nominal size in logical units (the paint area is (0,0)-(w,h))
   * @param pad  extra margin painted around the nominal rect (shadows, bubbles poking out)
   */
  constructor(scene: Phaser.Scene, x: number, y: number, w: number, h: number, paint: Paint, pad = 0) {
    super(scene, x, y);
    const key = `cv${nextKey++}`;
    const px = (n: number): number => Math.max(1, Math.ceil((n + pad * 2) * Viewport.rs));
    const tex = scene.textures.createCanvas(key, px(w), px(h));
    if (!tex) throw new Error('CanvasView: could not create a canvas texture');
    this.paint = paint;
    this.texKey = key;
    this.tex = tex;
    this.nominalW = w;
    this.nominalH = h;
    this.pad = pad;
    this.img = scene.add.image(0, 0, key).setOrigin(0, 0);
    this.add(this.img);
    scene.add.existing(this);
    this.applyLayout();
    live.add(this);
    this.repaint();
    this.once(Phaser.GameObjects.Events.DESTROY, () => {
      live.delete(this);
      dirty.delete(this);
      if (scene.textures.exists(this.texKey)) scene.textures.remove(this.texKey);
    });
  }

  get viewW(): number {
    return this.nominalW;
  }

  get viewH(): number {
    return this.nominalH;
  }

  /** Image placement inside the container so the pivot point sits at the container's origin. */
  private applyLayout(): void {
    this.img.setPosition(-(this.pad + this.pivotX), -(this.pad + this.pivotY));
    this.img.setDisplaySize(this.nominalW + this.pad * 2, this.nominalH + this.pad * 2);
  }

  /** Change the nominal size (and repaint). */
  resizeView(w: number, h: number): this {
    this.nominalW = w;
    this.nominalH = h;
    this.repaint();
    return this;
  }

  /** Change the margin painted around the nominal rect (and repaint). */
  setPad(pad: number): this {
    if (pad === this.pad) return this;
    this.pad = pad;
    this.repaint();
    return this;
  }

  /** Pivot for rotation/scale and the meaning of x/y: a point in nominal coordinates. */
  setPivot(px: number, py: number): this {
    this.pivotX = px;
    this.pivotY = py;
    this.applyLayout();
    return this;
  }

  /** Place so that the nominal top-left sits at (x, y) (assuming no rotation/scale). */
  setTopLeft(x: number, y: number): this {
    this.setPosition(x + this.pivotX, y + this.pivotY);
    return this;
  }

  getTopLeft(): [number, number] {
    return [this.x - this.pivotX, this.y - this.pivotY];
  }

  /** Queue a repaint before the next frame. */
  invalidate(): void {
    dirty.add(this);
  }

  setPaint(paint: Paint): this {
    this.paint = paint;
    this.invalidate();
    return this;
  }

  /** Repaint right now. */
  repaint(): void {
    const rs = Viewport.rs;
    const wpx = Math.max(1, Math.ceil((this.nominalW + this.pad * 2) * rs));
    const hpx = Math.max(1, Math.ceil((this.nominalH + this.pad * 2) * rs));
    const canvas = this.tex.getCanvas();
    if (canvas.width !== wpx || canvas.height !== hpx) {
      this.tex.setSize(wpx, hpx);
      this.img.setTexture(this.texKey);
    }
    this.applyLayout();
    const ctx = this.tex.getContext();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, wpx, hpx);
    // Map logical units to pixels exactly (the canvas is rounded up to whole pixels).
    const sx = wpx / (this.nominalW + this.pad * 2);
    const sy = hpx / (this.nominalH + this.pad * 2);
    ctx.setTransform(sx, 0, 0, sy, this.pad * sx, this.pad * sy);
    const ci = new CanvasItem(ctx, rs);
    ci.markBase();
    this.paint(ci, this);
    this.tex.refresh();
  }
}
