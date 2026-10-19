import * as Phaser from 'phaser';
import { GalleryScene } from './scenes/GalleryScene';
import { GameScene } from './scenes/GameScene';
import { MainMenuScene } from './scenes/MainMenuScene';
import { TimelineScene } from './scenes/TimelineScene';
import { TransitionScene } from './scenes/TransitionScene';
import { Viewport } from './render/Viewport';

/** Every playable scene by its key. Gallery is a dev-only art browser. */
function sceneRegistry(): Record<string, Phaser.Types.Scenes.SceneType> {
  const all: Record<string, Phaser.Types.Scenes.SceneType> = { MainMenu: MainMenuScene, Timeline: TimelineScene, Game: GameScene };
  if (import.meta.env.DEV) all.Gallery = GalleryScene;
  return all;
}

/** Scene list in start order: the first one runs (`?scene=` picks it in dev), the wipe always sits on top. */
function sceneList(): Phaser.Types.Scenes.SceneType[] {
  const all = sceneRegistry();
  const wanted = import.meta.env.DEV ? new URLSearchParams(location.search).get('scene') : null;
  const first = (wanted && Object.keys(all).find((k) => k.toLowerCase() === wanted.toLowerCase())) || 'MainMenu';
  return [all[first], ...Object.entries(all).filter(([k]) => k !== first).map(([, s]) => s), TransitionScene];
}

/**
 * The canvas is sized to the window in device pixels (Scale.NONE) and scenes work in the 720x1280 logical space
 * through their camera zoom, see render/Viewport.ts.
 */
export function gameConfig(): Phaser.Types.Core.GameConfig {
  return {
    type: Phaser.AUTO,
    parent: 'game',
    backgroundColor: '#f9efe6',
    scale: {
      mode: Phaser.Scale.NONE,
      width: Math.round(Viewport.cssW * Viewport.dpr),
      height: Math.round(Viewport.cssH * Viewport.dpr),
    },
    scene: sceneList(),
  };
}
