// Playgama Bridge bootstrap. The production build ships the Bridge inside the bundle and loads it with a plain
// <script src="./playgama-bridge.js"> tag that vite.config.ts injects into index.html (never from a CDN, and never
// via a dynamically created script: YouTube Playables forbids external requests and demands a CSP nonce on those).
// The same build therefore runs on Playgama and on YouTube. Resolves once the SDK is ready, or after a hard timeout
// so the game always boots even if the platform never answers.

const HARD_TIMEOUT_MS = 6000;

type BridgeLike = Record<string, unknown> & { initialize?: () => Promise<void> };

export function initBridge(): Promise<void> {
  return new Promise<void>((resolve) => {
    const bridge = (window as unknown as { bridge?: BridgeLike }).bridge;
    if (!bridge || typeof bridge.initialize !== 'function') {
      console.warn('[bridge] not present - continuing without platform');
      return resolve();
    }
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    setTimeout(done, HARD_TIMEOUT_MS);
    try {
      bridge.engine = 'phaser-4';
    } catch {
      // optional field
    }
    Promise.resolve(bridge.initialize()).then(done, (err) => {
      console.warn('[bridge] initialize failed - continuing without platform:', err);
      done();
    });
  });
}
