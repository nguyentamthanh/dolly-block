import { Music } from './audio/Music';
import { Sfx } from './audio/Sfx';
import { applyDevParams } from './dev';
import { createGame } from './game';
import { PlatformSdk } from './platform/PlatformSdk';
import { initBridge } from './platform/bridgeBootstrap';
import { loadFonts } from './render/Fonts';
import { Viewport } from './render/Viewport';

/** Entry point: platform first (Bridge, saved progress, fonts), then the Phaser game. */
async function boot(): Promise<void> {
  Viewport.update();
  if (!import.meta.env.DEV) await initBridge();
  PlatformSdk.setLoadingProgress(0);
  PlatformSdk.init();
  await Promise.all([loadFonts(), PlatformSdk.loadProgress()]);
  PlatformSdk.setLoadingProgress(50);
  applyDevParams();
  Sfx.hookUnlock();
  createGame();
  Music.init();
}

/** A failed boot would otherwise leave an empty page: show the reason in the notice index.html provides. */
function showBootError(err: unknown): void {
  console.error('boot failed', err);
  const notice = document.getElementById('status-notice');
  const status = document.getElementById('status');
  if (!notice || !status) return;
  notice.textContent = `The game could not start. ${err instanceof Error ? err.message : String(err)}`;
  status.style.display = 'flex';
}

boot().catch(showBootError);
