// Platform layer: the only place the game talks to its host.
//
// WebGL (the Playgama / YouTube Playables / CrazyGames build): talks to the Playgama Bridge through
// Plugins/WebGL/CozyBridge.jslib. Progress goes through bridge.storage, audio and pausing follow the platform's
// events (and stay muted + paused while an ad is on screen), game_ready is sent once the menu is up, interstitials
// run between levels and rewarded ads refill diamonds.
//
// Everywhere else (Windows, Android, the editor): progress lives in PlayerPrefs, interstitials are skipped and a
// rewarded ad grants at once in development builds only (so the flow can be tested) and is unavailable in release.
using System;
using System.Runtime.InteropServices;
using UnityEngine;
using CozyBlocks.Core;
using CozyBlocks.Audio;

namespace CozyBlocks.Platform
{
    public static class PlatformSdk
    {
        const string STORAGE_KEY = "progress";
        const string LOCAL_KEY = "cozy-blocks/progress";
        const int STORAGE_TIMEOUT_MS = 5000;

        /// <summary>False only on the web while the saved progress is still being fetched.</summary>
        public static bool isLoaded;
        /// <summary>Pause / mute changes the game should honour: (muted, paused).</summary>
        public static Action<bool, bool> onApply = (muted, paused) => { };

        static bool web;
        static string platformId = "";
        static bool gameReadySent, gameplayActive, platformMuted, platformPaused, hostPaused, adOpen;
        static Action<bool> rewardedDone;
        static Action loadDone;

#if UNITY_WEBGL && !UNITY_EDITOR
        [DllImport("__Internal")] static extern int CozyBridge_Init();
        [DllImport("__Internal")] static extern string CozyBridge_PlatformId();
        [DllImport("__Internal")] static extern string CozyBridge_Language();
        [DllImport("__Internal")] static extern int CozyBridge_AudioEnabled();
        [DllImport("__Internal")] static extern int CozyBridge_RewardedSupported();
        [DllImport("__Internal")] static extern void CozyBridge_SetLoadingProgress(int percent);
        [DllImport("__Internal")] static extern void CozyBridge_SendMessage(string name);
        [DllImport("__Internal")] static extern void CozyBridge_ShowInterstitial();
        [DllImport("__Internal")] static extern int CozyBridge_ShowRewarded();
        [DllImport("__Internal")] static extern void CozyBridge_StorageGet(string key, int timeoutMs);
        [DllImport("__Internal")] static extern void CozyBridge_StorageSet(string key, string text);
#else
        static int CozyBridge_Init() => 0;
        static string CozyBridge_PlatformId() => "";
        static string CozyBridge_Language() => "";
        static int CozyBridge_AudioEnabled() => -1;
        static int CozyBridge_RewardedSupported() => 0;
        static void CozyBridge_SetLoadingProgress(int percent) { }
        static void CozyBridge_SendMessage(string name) { }
        static void CozyBridge_ShowInterstitial() { }
        static int CozyBridge_ShowRewarded() => 0;
        static void CozyBridge_StorageGet(string key, int timeoutMs) { }
        static void CozyBridge_StorageSet(string key, string text) { }
#endif

        /// <summary>Wires GameState persistence and, when a Bridge is present, the platform events. Call once at boot,
        /// after the receiver component exists on the "CozyBlocks" GameObject.</summary>
        public static void Init()
        {
            GameState.persist = Save;
            // On a platform the Bridge storage is the only place progress lives (YouTube Playables forbids anything else).
            GameState.localLoader = () => web ? null : (PlayerPrefs.HasKey(LOCAL_KEY) ? PlayerPrefs.GetString(LOCAL_KEY) : null);

            web = Safe(() => CozyBridge_Init() == 1, false);
            if (!web)
            {
                Loc.platformLang = SystemLanguageCode();
                isLoaded = true;
                return;
            }
            platformId = Safe(CozyBridge_PlatformId, "") ?? "";
            // Bridge falls back to the browser language when the platform has none.
            Loc.platformLang = Safe(CozyBridge_Language, "") ?? "";
            platformMuted = Safe(CozyBridge_AudioEnabled, -1) == 0;
            Apply();
        }

        static T Safe<T>(Func<T> f, T fallback)
        {
            try { return f(); }
            catch (Exception e) { Debug.LogWarning("PlatformSdk: " + e.Message); return fallback; }
        }

        static string SystemLanguageCode()
        {
            switch (Application.systemLanguage)
            {
                case SystemLanguage.Russian: return "ru";
                case SystemLanguage.Spanish: return "es";
                case SystemLanguage.Portuguese: return "pt";
                case SystemLanguage.German: return "de";
                case SystemLanguage.French: return "fr";
                case SystemLanguage.Turkish: return "tr";
                default: return "en";
            }
        }

        /// <summary>Fetches the saved progress (the platform's storage on the web, PlayerPrefs elsewhere or when the
        /// platform has nothing yet) and calls <paramref name="done"/> once GameState is loaded.</summary>
        public static void LoadProgress(Action done)
        {
            if (!web)
            {
                GameState.EnsureLoaded();
                isLoaded = true;
                done();
                return;
            }
            isLoaded = false;
            loadDone = done;
            CozyBridge_StorageGet(STORAGE_KEY, STORAGE_TIMEOUT_MS);
        }

        /// <summary>Answer to CozyBridge_StorageGet: "1" + data, or "0" for nothing / failure / timeout.</summary>
        internal static void OnStorage(string payload)
        {
            var done = loadDone;
            if (done == null) return;
            loadDone = null;
            bool loaded = false;
            if (!string.IsNullOrEmpty(payload) && payload[0] == '1' && payload.Length > 1)
            {
                try
                {
                    GameState.LoadFromText(payload.Substring(1));
                    loaded = true;
                }
                catch (Exception e) { Debug.LogWarning("PlatformSdk: saved progress unreadable " + e.Message); }
            }
            // Nothing saved on the platform yet: fresh progress (the local loader is off on a platform).
            if (!loaded) GameState.EnsureLoaded();
            isLoaded = true;
            done();
        }

        /// <summary>YouTube Playables asks games not to carry their own mute button: the player uses YouTube's.</summary>
        public static bool HideSoundToggle => platformId == "youtube";

        /// <summary>Drives the Bridge's own loading splash (0..100).</summary>
        public static void SetLoadingProgress(int percent)
        {
            if (web) Safe(() => { CozyBridge_SetLoadingProgress(percent); return 0; }, 0);
        }

        /// <summary>Tells the platform the first playable frame is on screen. Sent once.</summary>
        public static void SendGameReady()
        {
            if (gameReadySent) return;
            gameReadySent = true;
            SendPlatformMessage("GAME_READY");
        }

        /// <summary>The player is actively solving a level (CrazyGames' gameplayStart). Idempotent.</summary>
        public static void GameplayStart()
        {
            if (gameplayActive) return;
            gameplayActive = true;
            SendPlatformMessage("GAMEPLAY_STARTED");
        }

        /// <summary>Back in a menu, a win panel or a transition (CrazyGames' gameplayStop). Idempotent.</summary>
        public static void GameplayStop()
        {
            if (!gameplayActive) return;
            gameplayActive = false;
            SendPlatformMessage("GAMEPLAY_STOPPED");
        }

        static void SendPlatformMessage(string name)
        {
            if (web) Safe(() => { CozyBridge_SendMessage(name); return 0; }, 0);
        }

        public static void ShowInterstitial()
        {
            if (web) Safe(() => { CozyBridge_ShowInterstitial(); return 0; }, 0);
        }

        public static bool IsRewardedAvailable()
        {
            if (!web) return Debug.isDebugBuild;
            return Safe(CozyBridge_RewardedSupported, 0) == 1;
        }

        /// <summary>Shows a rewarded ad and calls <paramref name="onDone"/>(granted) exactly once. granted is true only
        /// when the platform confirmed the "rewarded" state: closing or a failed ad gives false.</summary>
        public static void ShowRewarded(Action<bool> onDone)
        {
            if (!IsRewardedAvailable()) { onDone(false); return; }
            if (!web) { onDone(true); return; }
            if (rewardedDone != null) return; // one ad at a time; the first request still gets its answer
            rewardedDone = onDone;
            if (Safe(CozyBridge_ShowRewarded, 0) != 1) FinishRewarded(false);
        }

        static void FinishRewarded(bool granted)
        {
            var cb = rewardedDone;
            if (cb == null) return;
            rewardedDone = null;
            cb(granted);
        }

        // ---- Bridge events (PlatformBridgeReceiver forwards them here) ----

        internal static void OnAudio(bool enabled)
        {
            platformMuted = !enabled;
            Apply();
        }

        internal static void OnPause(bool paused)
        {
            platformPaused = paused;
            Apply();
        }

        internal static void OnInterstitial(string state)
        {
            if (state == "opened") adOpen = true;
            else if (state == "closed" || state == "failed") adOpen = false;
            Apply();
        }

        internal static void OnRewarded(string state)
        {
            if (state == "opened") adOpen = true;
            else if (state == "rewarded") FinishRewarded(true);
            else if (state == "closed" || state == "failed")
            {
                adOpen = false;
                FinishRewarded(false);
            }
            Apply();
        }

        static void Save(string text)
        {
            if (web)
            {
                Safe(() => { CozyBridge_StorageSet(STORAGE_KEY, text); return 0; }, 0);
                return;
            }
            try
            {
                PlayerPrefs.SetString(LOCAL_KEY, text);
                PlayerPrefs.Save();
            }
            catch (Exception e) { Debug.LogWarning("PlatformSdk: save failed " + e.Message); }
        }

        /// <summary>Pause / mute from the host: the web page hidden, the app in the background on mobile. Kept apart from
        /// the platform's own pause so neither can lift the other.</summary>
        public static void SetPaused(bool paused)
        {
            hostPaused = paused;
            Apply();
        }

        static void Apply()
        {
            bool paused = platformPaused || hostPaused || adOpen;
            bool muted = platformMuted || paused;
            Sfx.SetPlatformMuted(muted);
            onApply(muted, paused);
        }
    }
}
