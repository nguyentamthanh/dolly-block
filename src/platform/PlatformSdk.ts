// Thin layer over the Playgama Bridge JS SDK (window.bridge). Ports scripts/platform/PlatformSdk.gd.
//
// On the web (Bridge present) it covers what Playgama moderation checks: progress goes through
// bridge.storage, audio and pausing follow the platform's audio/pause events (and stay muted + paused while
// an ad is on screen), game_ready is sent once the menu is up, interstitials run between levels, and rewarded
// ads refill diamonds on request.
//
// Everywhere else (vite dev, tests) it stays out of the way: progress lives in localStorage and interstitials
// are skipped. A rewarded ad grants at once in dev builds (so the flow can be tested off the web) and is
// unavailable in production builds when there is no platform.

import { GameState } from '../core/GameState';
import { Loc } from '../core/Loc';
import { Sfx } from '../audio/Sfx';

const STORAGE_KEY = 'progress';
const LOCAL_KEY = 'cozy-blocks/progress';

interface Emitter {
  on(event: string, cb: (v: never) => void): void;
}

interface Bridge extends Emitter {
  EVENT_NAME: Record<string, string>;
  PLATFORM_MESSAGE: Record<string, string>;
  platform: { id?: string; language?: string; isAudioEnabled?: boolean; sendMessage(msg: string): void };
  advertisement: {
    isRewardedSupported?: boolean;
    showInterstitial(placement?: string | null): void;
    showRewarded(placement?: string | null): void;
  };
  storage: {
    get(key: string, tryParseJson?: boolean): Promise<unknown>;
    set(key: string, value: string): Promise<unknown>;
  };
  setGameLoadingProgress?(percent: number): void;
}

const getBridge = (): Bridge | null => (window as unknown as { bridge?: Bridge }).bridge ?? null;

export class PlatformSdk {
  /** False only on the web while the saved progress is still being fetched. */
  static isLoaded = false;
  /** Pause / mute changes the game should honour: ads on screen, platform pause, platform audio off. */
  static onApply: (state: { muted: boolean; paused: boolean }) => void = () => {};

  private static bridge: Bridge | null = null;
  private static web = false;
  private static gameReadySent = false;
  private static platformMuted = false;
  private static platformPaused = false;
  private static adOpen = false;
  private static saving = false;
  /** Latest save that arrived while another write was in flight (storage.set drops calls made mid-write). */
  private static pendingSave = '';
  /** Called once per showRewarded() with true only if the platform reported "rewarded". */
  private static rewardedDone: ((granted: boolean) => void) | null = null;

  /** Wires GameState persistence and, when a Bridge is present, the platform events. Call once at boot. */
  static init(): void {
    GameState.persist = (text) => PlatformSdk.save(text);
    GameState.localLoader = () => {
      // On a platform the Bridge storage is the only place progress lives (YouTube Playables forbids anything else).
      if (PlatformSdk.web) return null;
      try {
        return localStorage.getItem(LOCAL_KEY);
      } catch {
        return null;
      }
    };

    const bridge = getBridge();
    PlatformSdk.bridge = bridge;
    PlatformSdk.web = bridge !== null;
    if (!bridge) {
      PlatformSdk.isLoaded = true;
      return;
    }
    const E = bridge.EVENT_NAME;
    bridge.on(E.AUDIO_STATE_CHANGED, ((enabled: boolean) => {
      PlatformSdk.platformMuted = !enabled;
      PlatformSdk.apply();
    }) as (v: never) => void);
    bridge.on(E.PAUSE_STATE_CHANGED, ((paused: boolean) => {
      PlatformSdk.platformPaused = paused;
      PlatformSdk.apply();
    }) as (v: never) => void);
    bridge.on(E.INTERSTITIAL_STATE_CHANGED, ((state: string) => {
      if (state === 'opened') PlatformSdk.adOpen = true;
      else if (state === 'closed' || state === 'failed') PlatformSdk.adOpen = false;
      PlatformSdk.apply();
    }) as (v: never) => void);
    bridge.on(E.REWARDED_STATE_CHANGED, ((state: string) => {
      if (state === 'opened') PlatformSdk.adOpen = true;
      else if (state === 'rewarded') PlatformSdk.finishRewarded(true);
      else if (state === 'closed' || state === 'failed') {
        PlatformSdk.adOpen = false;
        PlatformSdk.finishRewarded(false);
      }
      PlatformSdk.apply();
    }) as (v: never) => void);
    // Bridge falls back to the browser language when the platform has none.
    Loc.platformLang = String(bridge.platform.language ?? '');
    PlatformSdk.platformMuted = bridge.platform.isAudioEnabled === false;
    PlatformSdk.apply();
  }

  /**
   * Fetches the saved progress: the platform's storage on the web (the copy that counts), localStorage
   * elsewhere or when the platform has nothing yet. Resolves once GameState is loaded.
   */
  static async loadProgress(): Promise<void> {
    const bridge = PlatformSdk.bridge;
    if (PlatformSdk.web && bridge) {
      try {
        const data = await bridge.storage.get(STORAGE_KEY, false);
        if (typeof data === 'string' && data.length > 0) {
          GameState.loadFromText(data);
          PlatformSdk.isLoaded = true;
          return;
        }
      } catch (err) {
        console.warn('PlatformSdk: Bridge.storage.get failed', err);
      }
    }
    // Nothing saved on the platform yet: fall back to the local copy.
    GameState.ensureLoaded();
    PlatformSdk.isLoaded = true;
  }

  /** YouTube Playables asks games not to carry their own mute button: the player uses YouTube's. */
  static get hideSoundToggle(): boolean {
    return PlatformSdk.bridge?.platform.id === 'youtube';
  }

  /** Drives the Bridge's own loading splash (0..100). */
  static setLoadingProgress(percent: number): void {
    try {
      PlatformSdk.bridge?.setGameLoadingProgress?.(percent);
    } catch {
      /* ignore */
    }
  }

  /** Tells the platform the first playable frame is on screen. Sent once. */
  static sendGameReady(): void {
    if (PlatformSdk.gameReadySent) return;
    PlatformSdk.gameReadySent = true;
    const bridge = PlatformSdk.bridge;
    if (!bridge) return;
    try {
      bridge.platform.sendMessage(bridge.PLATFORM_MESSAGE.GAME_READY);
    } catch (err) {
      console.warn('PlatformSdk: game_ready failed', err);
    }
  }

  static showInterstitial(): void {
    if (PlatformSdk.web && PlatformSdk.bridge) {
      try {
        PlatformSdk.bridge.advertisement.showInterstitial();
      } catch (err) {
        console.warn('PlatformSdk: showInterstitial failed', err);
      }
    }
  }

  static isRewardedAvailable(): boolean {
    if (!PlatformSdk.web || !PlatformSdk.bridge) return import.meta.env.DEV;
    return Boolean(PlatformSdk.bridge.advertisement.isRewardedSupported);
  }

  /**
   * Shows a rewarded ad and calls `onDone(granted)` exactly once. `granted` is true only when the platform
   * confirmed the "rewarded" state: closing or a failed ad gives false, so the reward can never be claimed
   * without watching.
   */
  static showRewarded(onDone: (granted: boolean) => void): void {
    if (!PlatformSdk.isRewardedAvailable()) {
      onDone(false);
      return;
    }
    if (!PlatformSdk.web || !PlatformSdk.bridge) {
      onDone(true);
      return;
    }
    if (PlatformSdk.rewardedDone) return; // one ad at a time; the first request still gets its answer
    PlatformSdk.rewardedDone = onDone;
    try {
      PlatformSdk.bridge.advertisement.showRewarded();
    } catch (err) {
      console.warn('PlatformSdk: showRewarded failed', err);
      PlatformSdk.finishRewarded(false);
    }
  }

  private static finishRewarded(granted: boolean): void {
    const cb = PlatformSdk.rewardedDone;
    if (!cb) return;
    PlatformSdk.rewardedDone = null;
    cb(granted);
  }

  private static save(text: string): void {
    if (!PlatformSdk.web) {
      // Dev / tests only: no platform to save to, so keep a local copy.
      try {
        localStorage.setItem(LOCAL_KEY, text);
      } catch {
        /* private mode etc. */
      }
      return;
    }
    if (PlatformSdk.saving) {
      PlatformSdk.pendingSave = text;
      return;
    }
    const bridge = PlatformSdk.bridge;
    if (!bridge) return;
    PlatformSdk.saving = true;
    let result: Promise<unknown>;
    try {
      result = Promise.resolve(bridge.storage.set(STORAGE_KEY, text));
    } catch (err) {
      result = Promise.reject(err);
    }
    result
      .catch((err) => console.warn('PlatformSdk: Bridge.storage rejected a progress save', err))
      .finally(() => {
        PlatformSdk.saving = false;
        if (PlatformSdk.pendingSave) {
          const next = PlatformSdk.pendingSave;
          PlatformSdk.pendingSave = '';
          PlatformSdk.save(next);
        }
      });
  }

  private static apply(): void {
    const paused = PlatformSdk.platformPaused || PlatformSdk.adOpen;
    const muted = PlatformSdk.platformMuted || paused;
    Sfx.setPlatformMuted(muted);
    PlatformSdk.onApply({ muted, paused });
  }
}
