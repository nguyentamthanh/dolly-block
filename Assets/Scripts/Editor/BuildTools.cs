// Batch-mode build entry points (scripts/build.sh, npm run build:web / build:windows / build:android):
//   Unity -batchmode -quit -projectPath . -executeMethod CozyBlocks.EditorTools.BuildTools.BuildWindows
//   ... BuildWebGL (Playgama Bridge page, for Playgama / YouTube Playables / CrazyGames)
//   ... BuildAndroid (APK) / BuildAndroidBundle (AAB for Google Play)
// Windows builds are Development builds by default (screenshots, DevArgs); WebGL and Android are release builds.
// Pass -development or -release after the method name to override.
using System;
using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace CozyBlocks.EditorTools
{
    public static class BuildTools
    {
        const string ScenePath = "Assets/Scenes/Main.unity";
        const string AndroidId = "com.cozyblocks.game";

        [MenuItem("Cozy Blocks/Setup project")]
        public static void Setup()
        {
            if (!File.Exists(ScenePath))
            {
                Directory.CreateDirectory("Assets/Scenes");
                var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
                var camGo = new GameObject("Main Camera") { tag = "MainCamera" };
                var cam = camGo.AddComponent<Camera>();
                cam.clearFlags = CameraClearFlags.SolidColor;
                cam.backgroundColor = new Color(0xf9 / 255f, 0xef / 255f, 0xe6 / 255f);
                cam.orthographic = true;
                cam.cullingMask = 0;
                EditorSceneManager.SaveScene(scene, ScenePath);
            }
            EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(ScenePath, true) };
            PlayerSettings.colorSpace = ColorSpace.Gamma;
            PlayerSettings.companyName = "Cozy Blocks";
            PlayerSettings.productName = "Cozy Blocks";
            PlayerSettings.bundleVersion = PackageVersion();
            PlayerSettings.defaultScreenWidth = 540;
            PlayerSettings.defaultScreenHeight = 960;
            PlayerSettings.fullScreenMode = FullScreenMode.Windowed;
            PlayerSettings.resizableWindow = true;
            PlayerSettings.runInBackground = true;
            PlayerSettings.defaultInterfaceOrientation = UIOrientation.Portrait;
            PlayerSettings.SplashScreen.show = false;
            PlayerSettings.visibleInBackground = true;
            SetupWebGL();
            SetupAndroid();
            AssetDatabase.SaveAssets();
        }

        /// <summary>The version from package.json at the project root, so every build and zip carries the same number.</summary>
        static string PackageVersion()
        {
            try
            {
                var text = File.ReadAllText("package.json");
                var m = System.Text.RegularExpressions.Regex.Match(text, "\"version\"\\s*:\\s*\"([^\"]+)\"");
                if (m.Success) return m.Groups[1].Value;
            }
            catch (Exception) { }
            return "1.0.0";
        }

        static void SetupWebGL()
        {
            PlayerSettings.WebGL.template = "PROJECT:CozyBlocks";
            // Gzip with a JS fallback runs on any static host (no Content-Encoding headers needed).
            PlayerSettings.WebGL.compressionFormat = WebGLCompressionFormat.Gzip;
            PlayerSettings.WebGL.decompressionFallback = true;
            // YouTube Playables allows no storage besides the SDK's: no IndexedDB asset cache.
            PlayerSettings.WebGL.dataCaching = false;
            PlayerSettings.WebGL.nameFilesAsHashes = false;
            PlayerSettings.WebGL.exceptionSupport = WebGLExceptionSupport.ExplicitlyThrownExceptionsOnly;
            PlayerSettings.WebGL.showDiagnostics = false;
        }

        static void SetupAndroid()
        {
            PlayerSettings.SetApplicationIdentifier(UnityEditor.Build.NamedBuildTarget.Android, AndroidId);
            PlayerSettings.SetScriptingBackend(UnityEditor.Build.NamedBuildTarget.Android, ScriptingImplementation.IL2CPP);
            PlayerSettings.Android.targetArchitectures = AndroidArchitecture.ARM64 | AndroidArchitecture.ARMv7;
            PlayerSettings.Android.minSdkVersion = AndroidSdkVersions.AndroidApiLevel24;
            PlayerSettings.Android.targetSdkVersion = AndroidSdkVersions.AndroidApiLevelAuto;
            // Keep the game out of notches and punch-holes: the system letterboxes the cutout.
            PlayerSettings.Android.renderOutsideSafeArea = false;
            PlayerSettings.Android.startInFullscreen = true;
            PlayerSettings.allowedAutorotateToPortrait = true;
            PlayerSettings.allowedAutorotateToPortraitUpsideDown = false;
            PlayerSettings.allowedAutorotateToLandscapeLeft = false;
            PlayerSettings.allowedAutorotateToLandscapeRight = false;
            // Play needs a rising integer per upload: derive it from the version (2.3.2 -> 20302).
            var parts = PackageVersion().Split('-')[0].Split('.');
            int code = 0;
            for (int i = 0; i < 3; i++) code = code * 100 + (i < parts.Length && int.TryParse(parts[i], out var n) ? n : 0);
            PlayerSettings.Android.bundleVersionCode = Math.Max(1, code);
        }

        static bool Development(bool byDefault)
        {
            var args = Environment.GetCommandLineArgs();
            if (Array.IndexOf(args, "-release") >= 0) return false;
            if (Array.IndexOf(args, "-development") >= 0) return true;
            return byDefault;
        }

        static void Build(BuildTarget target, string path, bool development)
        {
            Setup();
            var opts = new BuildPlayerOptions
            {
                scenes = new[] { ScenePath },
                locationPathName = path,
                target = target,
                options = development ? BuildOptions.Development : BuildOptions.None,
            };
            var report = BuildPipeline.BuildPlayer(opts);
            Debug.Log("[build] " + report.summary.result + " " + report.summary.totalSize + " bytes -> " + path
                + (development ? " (development)" : " (release)"));
            if (report.summary.result != UnityEditor.Build.Reporting.BuildResult.Succeeded) EditorApplication.Exit(1);
        }

        public static void BuildWindows() => Build(BuildTarget.StandaloneWindows64, "Builds/Windows/CozyBlocks.exe", Development(true));

        public static void BuildWebGL()
        {
            const string outDir = "Builds/WebGL";
            Build(BuildTarget.WebGL, outDir, Development(false));
            // The template folder ships the Bridge SDK, its config and the icon next to index.html.
            foreach (var name in new[] { "playgama-bridge.js", "playgama-bridge-config.json", "favicon.png" })
                if (!File.Exists(Path.Combine(outDir, name))) Debug.LogError("[build] the page is missing " + name);
        }

        public static void BuildAndroid()
        {
            EditorUserBuildSettings.buildAppBundle = false;
            Build(BuildTarget.Android, "Builds/Android/CozyBlocks.apk", Development(false));
        }

        public static void BuildAndroidBundle()
        {
            EditorUserBuildSettings.buildAppBundle = true;
            Build(BuildTarget.Android, "Builds/Android/CozyBlocks.aab", Development(false));
        }
    }
}
