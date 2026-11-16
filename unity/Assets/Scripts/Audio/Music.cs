// Looping background music (port of src/audio/Music.ts): rendered a moment after the menu is up, faded in,
// gated on GameState.soundEnabled; the platform mute silences it with the sound effects.
using System.Collections;
using UnityEngine;
using CozyBlocks.Core;

namespace CozyBlocks.Audio
{
    public static class Music
    {
        const float LEVEL = 0.4f;
        const float FADE_IN = 1.5f;
        const float FADE_OUT = 0.35f;
        static AudioSource src;
        static AudioClip clip;
        static MonoBehaviour runner;
        static bool playing;
        static Coroutine fade;

        public static void Init(MonoBehaviour owner)
        {
            if (runner != null) return;
            runner = owner;
            src = owner.gameObject.AddComponent<AudioSource>();
            src.loop = true;
            src.playOnAwake = false;
            src.volume = 0;
            owner.StartCoroutine(RenderLater());
        }

        static IEnumerator RenderLater()
        {
            yield return new WaitForSeconds(1.5f);
            EnsureClip();
            Sync();
        }

        static void EnsureClip()
        {
            if (clip != null) return;
            var samples = MusicSynth.Render();
            clip = AudioClip.Create("music", samples.Length, 1, MusicSynth.MUSIC_RATE, false);
            clip.SetData(samples, 0);
            src.clip = clip;
        }

        public static void Sync()
        {
            if (src == null) return;
            if (GameState.soundEnabled) Start();
            else Stop();
        }

        static void Start()
        {
            if (playing) return;
            EnsureClip();
            playing = true;
            if (fade != null) runner.StopCoroutine(fade);
            if (!src.isPlaying) { src.volume = 0; src.Play(); }
            fade = runner.StartCoroutine(FadeTo(LEVEL, FADE_IN, false));
        }

        static void Stop()
        {
            if (!playing) return;
            playing = false;
            if (fade != null) runner.StopCoroutine(fade);
            fade = runner.StartCoroutine(FadeTo(0, FADE_OUT, true));
        }

        static IEnumerator FadeTo(float target, float dur, bool stopAfter)
        {
            float from = src.volume;
            for (float t = 0; t < dur; t += Time.unscaledDeltaTime)
            {
                src.volume = Mathf.Lerp(from, target, t / dur);
                yield return null;
            }
            src.volume = target;
            if (stopAfter) src.Stop();
        }
    }
}
