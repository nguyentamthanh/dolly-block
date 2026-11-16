// Playback of the procedural sound effects: 6 voices, clips synthesised on first use,
// gated on GameState.soundEnabled, silenced as a whole by the platform mute.
using System.Collections.Generic;
using UnityEngine;
using CozyBlocks.Core;

namespace CozyBlocks.Audio
{
    public static class Sfx
    {
        const int POOL_SIZE = 6;
        static readonly Dictionary<string, AudioClip> clips = new Dictionary<string, AudioClip>();
        static AudioSource[] voices;
        static int next;
        static bool platformMuted;
        static GameObject host;

        public static void SetPlatformMuted(bool muted)
        {
            platformMuted = muted;
            AudioListener.volume = muted ? 0 : 1;
        }

        public static void Init(GameObject owner)
        {
            if (voices != null) return;
            host = owner;
            voices = new AudioSource[POOL_SIZE];
            for (int i = 0; i < POOL_SIZE; i++)
            {
                var s = owner.AddComponent<AudioSource>();
                s.playOnAwake = false;
                s.spatialBlend = 0;
                voices[i] = s;
            }
        }

        static AudioClip ClipFor(string name)
        {
            if (clips.TryGetValue(name, out var c)) return c;
            var data = SfxSynth.Synth(name);
            var f = new float[data.Length];
            for (int i = 0; i < data.Length; i++) f[i] = data[i] / 32768f;
            c = AudioClip.Create(name, data.Length, 1, SfxSynth.MIX_RATE, false);
            c.SetData(f, 0);
            clips[name] = c;
            return c;
        }

        public static void Play(string name, float volumeDb = 0, float pitch = 1)
        {
            if (!GameState.soundEnabled || voices == null) return;
            AudioSource voice = null;
            foreach (var v in voices) if (!v.isPlaying) { voice = v; break; }
            if (voice == null) { voice = voices[next]; next = (next + 1) % POOL_SIZE; }
            voice.Stop();
            voice.clip = ClipFor(name);
            voice.pitch = Mathf.Clamp(pitch, 0.25f, 4f);
            voice.volume = Mathf.Pow(10, volumeDb / 20f);
            voice.Play();
        }
    }
}
