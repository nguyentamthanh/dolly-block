import type * as Phaser from 'phaser';
import { GameState } from './core/GameState';

/** Dev/test hooks: ?level=N&cur=N&hi=N&tut=0|1&gems=N&lang=xx&stars=1 prepare the save before the first scene starts. */
export function applyDevParams(): void {
  if (!import.meta.env.DEV) return;
  const q = new URLSearchParams(location.search);
  if (q.has('level')) {
    GameState.currentLevel = Number(q.get('level'));
    GameState.highestUnlocked = Math.max(GameState.highestUnlocked, 60);
    GameState.run = {};
  }
  if (q.has('cur')) GameState.currentLevel = Number(q.get('cur'));
  if (q.has('tut')) GameState.tutorialDone = q.get('tut') === '1';
  if (q.has('gems')) GameState.diamonds = Number(q.get('gems'));
  if (q.has('lang')) GameState.language = q.get('lang') ?? '';
  if (q.has('hi')) GameState.highestUnlocked = Number(q.get('hi'));
  if (q.has('stars')) {
    GameState.starsAt = { 0: 3, 1: 3, 2: 3, 3: 2, 4: 2, 5: 1, 6: 3, 7: 3, 8: 2, 9: 3, 10: 3, 11: 3 };
  }
}

/** Dev only: lets tests and the screenshot scripts reach the running game as `window.__game`. */
export function exposeGame(game: Phaser.Game): void {
  if (import.meta.env.DEV) (window as unknown as { __game?: Phaser.Game }).__game = game;
}
