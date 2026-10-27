// Looping background music. The track is synthesized (see musicSynth.ts) into one buffer and played through a
// looping buffer source on the same context and master gain as Sfx, so the platform's mute / ad pause
// (Sfx.setPlatformMuted) silences it too. It is rendered in idle time after the menu is up and started on the
// first user gesture; GameState.soundEnabled gates it, and the toggles call Music.sync() after flipping it.

import { GameState } from '../core/GameState';
import { Sfx } from './Sfx';
import { MUSIC_RATE, renderMusic } from './musicSynth';

const LEVEL = 0.4; // below the sound effects, which sit at unit gain
const FADE_IN = 1.5;
const FADE_OUT = 0.35;
const RENDER_DELAY_MS = 1500;

export class Music {
  private static samples: Float32Array<ArrayBuffer> | null = null;
  private static buffer: AudioBuffer | null = null;
  private static src: AudioBufferSourceNode | null = null;
  private static gain: GainNode | null = null;
  private static failed = false;
  private static hooked = false;

  /** Arms the first-gesture start and renders the track in the background. Call once, after the game is created. */
  static init(target: EventTarget = window): void {
    if (Music.hooked) return;
    Music.hooked = true;
    setTimeout(() => Music.render(), RENDER_DELAY_MS);
    const go = (): void => Music.sync();
    for (const ev of ['pointerdown', 'touchstart', 'keydown']) target.addEventListener(ev, go, { passive: true });
  }

  /** Brings playback in line with GameState.soundEnabled. Safe to call at any time and as often as you like. */
  static sync(): void {
    if (GameState.soundEnabled) Music.start();
    else Music.stop();
  }

  private static render(): Float32Array<ArrayBuffer> {
    Music.samples ??= renderMusic();
    return Music.samples;
  }

  private static start(): void {
    if (Music.src || Music.failed) return;
    try {
      const graph = Sfx.graph();
      if (!graph) return;
      const { ctx, master } = graph;
      if (!Music.buffer) {
        const samples = Music.render();
        Music.buffer = ctx.createBuffer(1, samples.length, MUSIC_RATE);
        Music.buffer.copyToChannel(samples, 0);
      }
      if (ctx.state === 'suspended') void ctx.resume();
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(LEVEL, ctx.currentTime + FADE_IN);
      gain.connect(master);
      const src = ctx.createBufferSource();
      src.buffer = Music.buffer;
      src.loop = true;
      src.connect(gain);
      src.start();
      Music.src = src;
      Music.gain = gain;
    } catch (err) {
      Music.failed = true;
      console.warn('Music: could not start the background track', err);
    }
  }

  private static stop(): void {
    const { src, gain } = Music;
    if (!src || !gain) return;
    Music.src = null;
    Music.gain = null;
    const ctx = gain.context;
    gain.gain.cancelScheduledValues(ctx.currentTime);
    gain.gain.setValueAtTime(gain.gain.value, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + FADE_OUT);
    src.stop(ctx.currentTime + FADE_OUT + 0.05);
    src.onended = () => gain.disconnect();
  }
}
