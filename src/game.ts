import * as Phaser from 'phaser';
import { gameConfig } from './config';
import { exposeGame } from './dev';
import { PlatformSdk } from './platform/PlatformSdk';
import { hookViews } from './render/CanvasView';
import { Viewport } from './render/Viewport';
import { closeTopOverlay } from './ui/Overlay';

/** Keep the Phaser canvas at the window's size in device pixels; scenes work in logical units via the camera zoom. */
function fitCanvas(game: Phaser.Game): void {
  Viewport.update();
  const w = Math.round(Viewport.cssW * Viewport.dpr);
  const h = Math.round(Viewport.cssH * Viewport.dpr);
  game.scale.resize(w, h);
  const canvas = game.canvas;
  canvas.style.width = `${Viewport.cssW}px`;
  canvas.style.height = `${Viewport.cssH}px`;
  game.scale.updateBounds();
}

/**
 * YouTube Playables: pause/resume only from the platform (PlatformSdk.onApply), never from the Page Visibility API or
 * window blur/focus, which Phaser would otherwise wire to its loop. Phaser attaches those handlers when it starts, right
 * before the first step, so they are detached on that first step.
 */
function detachVisibilityPause(game: Phaser.Game): void {
  const ev = game.events;
  const g = game as unknown as Record<'onHidden' | 'onVisible' | 'onBlur' | 'onFocus', () => void>;
  ev.once(Phaser.Core.Events.PRE_STEP, () => {
    ev.off(Phaser.Core.Events.HIDDEN, g.onHidden, game);
    ev.off(Phaser.Core.Events.VISIBLE, g.onVisible, game);
    ev.off(Phaser.Core.Events.BLUR, g.onBlur, game);
    ev.off(Phaser.Core.Events.FOCUS, g.onFocus, game);
  });
}

/** Creates the Phaser game and wires everything that lives outside a scene: resizing, Esc, platform pause, wipe scene. */
export function createGame(): Phaser.Game {
  const game = new Phaser.Game(gameConfig());
  hookViews(game);
  detachVisibilityPause(game);
  // Esc closes the topmost dialog (and is never preventDefault()ed).
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeTopOverlay();
  });
  fitCanvas(game);
  // The wipe lives above every other scene for the whole session.
  game.events.once(Phaser.Core.Events.READY, () => game.scene.start('Transition'));
  // Safety net: never leave the platform's loading screen up if the first scene is not the menu.
  window.setTimeout(() => PlatformSdk.sendGameReady(), 6000);
  // The wipe, the camera zoom and every canvas texture depend on the window: settle first, then refit once.
  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => fitCanvas(game), 90);
  });
  // Ads and the platform's pause freeze the whole game (audio is muted by PlatformSdk itself).
  PlatformSdk.onApply = ({ paused }) => {
    if (paused) game.loop.sleep();
    else game.loop.wake();
  };
  exposeGame(game);
  return game;
}
