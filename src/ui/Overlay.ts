// A modal layer: a dim that swallows input plus a root container centred on the screen (so cards pop in from
// their middle). Concrete panels add their content to `root` using coordinates relative to the screen centre.

import * as Phaser from 'phaser';
import type { BaseScene } from '../scenes/BaseScene';
import { Viewport } from '../render/Viewport';

const live: Overlay[] = [];

/** Esc closes the topmost visible modal that opted in with `onEscape` (YouTube Playables: dialogs close on Esc). */
export function closeTopOverlay(): boolean {
  for (let i = live.length - 1; i >= 0; i--) {
    const ov = live[i];
    if (!ov.dim.active) {
      live.splice(i, 1);
      continue;
    }
    if (ov.visible && ov.onEscape) {
      ov.onEscape();
      return true;
    }
  }
  return false;
}

export class Overlay {
  /** Called when Esc is pressed while this is the topmost visible overlay; leave null for non-dismissible ones. */
  onEscape: (() => void) | null = null;
  readonly dim: Phaser.GameObjects.Rectangle;
  readonly root: Phaser.GameObjects.Container;
  private shown = false;

  constructor(
    protected scene: BaseScene,
    depth: number,
    dimColor = 0x1a0a47,
    dimAlpha = 0.62,
    blockInput = true,
  ) {
    this.dim = scene.add.rectangle(0, 0, 10, 10, dimColor, dimAlpha).setOrigin(0, 0).setDepth(depth);
    if (blockInput) this.dim.setInteractive();
    this.root = scene.add.container(0, 0).setDepth(depth + 1);
    this.setVisible(false);
    this.layout();
    live.push(this);
  }

  get visible(): boolean {
    return this.shown;
  }

  setVisible(v: boolean): void {
    this.shown = v;
    this.dim.setVisible(v);
    this.root.setVisible(v);
    if (this.dim.input) this.dim.input.enabled = v;
  }

  /** Re-centre on the (possibly resized) logical canvas. */
  layout(): void {
    const W = Viewport.w;
    const H = Viewport.h;
    this.dim.setPosition(-80, -80).setSize(W + 160, H + 160);
    if (this.dim.input) this.dim.input.hitArea.setSize(W + 160, H + 160);
    this.root.setPosition(W / 2, H / 2);
  }
}
