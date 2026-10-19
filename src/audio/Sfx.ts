// Web Audio playback of the procedural sound effects (see sfxSynth.ts). Ports the player half of
// scripts/audio/Sfx.gd: a pool of 6 voices on one master gain, buffers synthesized on first use and cached,
// playback gated on GameState.soundEnabled. Plain Web Audio rather than Phaser's sound manager, so there is
// nothing to decode and nothing to download.

import { GameState } from '../core/GameState';
import { MIX_RATE, synth } from './sfxSynth';

const POOL_SIZE = 6;

interface Voice {
  src: AudioBufferSourceNode | null;
  gain: GainNode;
  busy: boolean;
}

export class Sfx {
  private static ctx: AudioContext | null = null;
  private static master: GainNode | null = null;
  private static buffers = new Map<string, AudioBuffer>();
  private static voices: Voice[] = [];
  private static platformMuted = false;
  private static unlockHooked = false;

  /** Playgama audio state / ad playback: silences everything without touching the player's own toggle. */
  static setPlatformMuted(muted: boolean): void {
    Sfx.platformMuted = muted;
    if (Sfx.master) Sfx.master.gain.value = muted ? 0 : 1;
  }

  /** Create the context and resume it on the first user gesture (browsers keep it suspended until then). */
  static hookUnlock(target: EventTarget = window): void {
    if (Sfx.unlockHooked) return;
    Sfx.unlockHooked = true;
    const unlock = (): void => {
      const ctx = Sfx.ensureContext();
      if (ctx && ctx.state === 'suspended') void ctx.resume();
    };
    for (const ev of ['pointerdown', 'touchstart', 'keydown']) target.addEventListener(ev, unlock, { passive: true });
  }

  private static ensureContext(): AudioContext | null {
    if (Sfx.ctx) return Sfx.ctx;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    const ctx = new Ctor();
    const master = ctx.createGain();
    master.gain.value = Sfx.platformMuted ? 0 : 1;
    master.connect(ctx.destination);
    Sfx.ctx = ctx;
    Sfx.master = master;
    Sfx.voices = Array.from({ length: POOL_SIZE }, () => {
      const gain = ctx.createGain();
      gain.connect(master);
      return { src: null, gain, busy: false };
    });
    return ctx;
  }

  private static bufferFor(ctx: AudioContext, name: string): AudioBuffer {
    let buf = Sfx.buffers.get(name);
    if (!buf) {
      const data = synth(name);
      buf = ctx.createBuffer(1, data.length, MIX_RATE);
      const ch = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) ch[i] = data[i] / 32768;
      Sfx.buffers.set(name, buf);
    }
    return buf;
  }

  /** Plays a named sound, gated on GameState.soundEnabled. `pitch` varies repeats so nothing sounds canned. */
  static play(name: string, volumeDb = 0, pitch = 1): void {
    if (!GameState.soundEnabled) return;
    const ctx = Sfx.ensureContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') void ctx.resume();

    // Every voice busy: blips are short and rarely collide this much; stealing the oldest is unnoticeable.
    const voice = Sfx.voices.find((v) => !v.busy) ?? Sfx.voices[0];
    if (voice.src) {
      voice.src.onended = null;
      try {
        voice.src.stop();
      } catch {
        /* already stopped */
      }
    }
    const src = ctx.createBufferSource();
    src.buffer = Sfx.bufferFor(ctx, name);
    src.playbackRate.value = Math.min(Math.max(pitch, 0.25), 4);
    voice.gain.gain.value = 10 ** (volumeDb / 20);
    src.connect(voice.gain);
    voice.src = src;
    voice.busy = true;
    src.onended = () => {
      if (voice.src === src) {
        voice.busy = false;
        voice.src = null;
      }
    };
    src.start();
  }
}
