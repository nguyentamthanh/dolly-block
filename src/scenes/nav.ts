// Scene navigation. Changes go through the circle wipe (TransitionScene) when it is running.
import type * as Phaser from 'phaser';
import type { TransitionScene } from './TransitionScene';

export function go(from: Phaser.Scene, key: string, data?: object): void {
  const tr = from.scene.get('Transition') as TransitionScene | null;
  if (!tr || !tr.scene.isActive()) {
    from.scene.start(key, data);
    return;
  }
  tr.wipe(() => from.scene.start(key, data));
}
