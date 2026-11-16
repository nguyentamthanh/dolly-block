// Entry point and main loop: platform and saved progress first, then the
// scenes; every frame: scene queue, pointer input, scene updates, dirty canvas repaints, then the draw.
using System;
using UnityEngine;
using CozyBlocks.Core;
using CozyBlocks.Engine;
using CozyBlocks.Render;
using CozyBlocks.Audio;
using CozyBlocks.Platform;
using CozyBlocks.Scenes;
using CozyBlocks.UI;

namespace CozyBlocks
{
    public sealed class GameHost : MonoBehaviour
    {
        public static GameHost Instance { get; private set; }
        public SceneManager scenes;
        GfxRenderer gfx;
        InputRouter input;
        Camera cam;
        bool paused;
        float clockMs;
        /// <summary>Command-line driven automation for screenshots (see DevArgs).</summary>
        DevArgs dev;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void Boot()
        {
            if (Instance != null) return;
            var go = new GameObject("CozyBlocks");
            DontDestroyOnLoad(go);
            go.AddComponent<GameHost>();
        }

        void Awake()
        {
            Instance = this;
            Application.targetFrameRate = 60;
            QualitySettings.vSyncCount = 0;
            Input.multiTouchEnabled = false;
            cam = Camera.main;
            if (cam == null)
            {
                cam = gameObject.AddComponent<Camera>();
            }
            cam.clearFlags = CameraClearFlags.SolidColor;
            cam.backgroundColor = Col.Hex("#f9efe6").ToUnity();
            cam.orthographic = true;
            cam.cullingMask = 0;
            Camera.onPostRender += OnCamPostRender;

            Viewport.Update(Screen.width, Screen.height);
            gameObject.AddComponent<PlatformBridgeReceiver>();
            // (Loading progress 0..49 is the download, reported by the WebGL page itself.)
            PlatformSdk.Init();
            Fonts.Load();
            // On the web the saved progress arrives asynchronously from the platform's storage: start once it is in.
            PlatformSdk.LoadProgress(StartGame);
        }

        void StartGame()
        {
            PlatformSdk.SetLoadingProgress(50);
            dev = DevArgs.Parse();
            dev.ApplyToSave();
            Sfx.Init(gameObject);

            gfx = new GfxRenderer();
            input = new InputRouter();
            CanvasView.Hook();
            scenes = new SceneManager();
            scenes.Register("MainMenu", () => new MainMenuScene());
            scenes.Register("Timeline", () => new TimelineScene());
            scenes.Register("Game", () => new GameScene());
            scenes.Register("Transition", () => new TransitionScene());
            scenes.Start(dev.scene ?? "MainMenu");
            scenes.Start("Transition");
            // Ads and the platform's pause freeze the whole game (audio is muted by PlatformSdk itself).
            PlatformSdk.onApply = (muted, p) => paused = p;
            Music.Init(this);
            // Safety net: never leave the platform's loading screen up if the first scene is not the menu.
            Invoke(nameof(SendGameReadyFallback), 6f);
        }

        void SendGameReadyFallback() => PlatformSdk.SendGameReady();

        void OnDestroy()
        {
            Camera.onPostRender -= OnCamPostRender;
        }

        void OnApplicationPause(bool p) => PlatformSdk.SetPaused(p);

        void Update()
        {
            if (scenes == null) return; // still waiting for the saved progress
            Viewport.Update(Screen.width, Screen.height);
            // Esc (Android: the system Back button) closes the topmost dialog; on Android, Back on the bare home
            // screen leaves the app like any other.
            if (Input.GetKeyDown(KeyCode.Escape) && !Overlay.CloseTopOverlay()
                && Application.platform == RuntimePlatform.Android && scenes.IsActive("MainMenu") && !scenes.IsActive("Game")
                && !scenes.IsActive("Timeline"))
                Application.Quit();
            scenes.ProcessQueue();
            if (paused) return;
            float frameStart = Time.realtimeSinceStartup;
            float dtMs = Mathf.Min(Time.unscaledDeltaTime * 1000f, 250f);
            if (dev.fixedStepMs > 0) dtMs = dev.fixedStepMs;
            clockMs += dtMs;
            gfx.StampAll(scenes);
            input.Process(scenes, clockMs);
            foreach (var s in new System.Collections.Generic.List<Scene>(scenes.InOrder())) if (s.running) s.Step(dtMs);
            float stepEnd = Time.realtimeSinceStartup;
            dev.Tick(this, clockMs);
            CanvasView.FlushDirty();
            dev.Spike(frameStart, stepEnd, Time.realtimeSinceStartup, clockMs);
            dev.Perf((Time.realtimeSinceStartup - frameStart) * 1000f, clockMs);
        }

        void OnCamPostRender(Camera c)
        {
            if (c != cam || gfx == null) return;
            gfx.RenderAll(scenes);
        }
    }
}
