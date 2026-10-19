// Base class for every scene: puts the main camera in "logical canvas" units (720x1280 base, expanded to the
// window's aspect, see Viewport) so scenes position everything in the same units the Godot project used, and
// calls onResize() whenever the window changes so layouts can be recomputed.

import * as Phaser from 'phaser';
import { Viewport } from '../render/Viewport';
import { TweenRunner } from '../ui/Tween';

export abstract class BaseScene extends Phaser.Scene {
  private unsub: (() => void) | null = null;
  /** Godot-style tweens owned by this scene (they stop when the scene is paused or shut down). */
  readonly tw = new TweenRunner();

  /** Logical canvas size. */
  get W(): number {
    return Viewport.w;
  }
  get H(): number {
    return Viewport.h;
  }

  create(data?: object): void {
    this.applyCamera();
    this.unsub = Viewport.onChange(() => {
      this.applyCamera();
      this.onResize();
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.tw.killAll();
      this.unsub?.();
      this.unsub = null;
    });
    this.build(data);
  }

  private applyCamera(): void {
    const cam = this.cameras.main;
    cam.setOrigin(0, 0);
    cam.setScroll(0, 0);
    cam.setZoom(Viewport.rs);
    cam.setViewport(0, 0, this.scale.width, this.scale.height);
  }

  update(_time: number, deltaMs: number): void {
    this.tw.update(Math.min(deltaMs, 100) / 1000);
  }

  /** Build the scene's objects (called once, camera already set up). */
  protected abstract build(data?: object): void;

  /** The window changed size: recompute layout. */
  protected onResize(): void {}

  /** Pointer position in logical units. */
  logical(p: Phaser.Input.Pointer): { x: number; y: number } {
    return { x: p.x / Viewport.rs, y: p.y / Viewport.rs };
  }
}
