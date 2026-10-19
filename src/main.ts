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
}

void boot();
