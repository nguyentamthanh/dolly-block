// Command-line hooks for testing and screenshots (the Unity counterpart of src/dev.ts' URL params):
//   -scene MainMenu|Timeline|Game  -level N  -cur N  -hi N  -tut 0|1  -gems N  -lang xx  -stars
//   -shot path.png  -shotAt ms (game clock)  -quitAfterShot  -fixedStep ms  -fresh (ignore the saved progress)
//   -autoHint [ms]  (use a hint every ms on the play screen: plays a level through to the win screen)
using System;
using UnityEngine;
using CozyBlocks.Core;

namespace CozyBlocks
{
    public sealed class DevArgs
    {
        public string scene;
        public float fixedStepMs;
        string shot;
        float shotAt = 1500;
        bool quitAfter;
        bool shotDone;
        readonly System.Collections.Generic.Dictionary<string, string> a = new System.Collections.Generic.Dictionary<string, string>();

        public static DevArgs Parse()
        {
            var d = new DevArgs();
            var args = Environment.GetCommandLineArgs();
            for (int i = 0; i < args.Length; i++)
            {
                if (!args[i].StartsWith("-")) continue;
                string k = args[i].Substring(1);
                string v = i + 1 < args.Length && !args[i + 1].StartsWith("-") ? args[i + 1] : "";
                d.a[k] = v;
            }
            if (d.a.TryGetValue("scene", out var s) && s.Length > 0)
            {
                foreach (var name in new[] { "MainMenu", "Timeline", "Game" })
                    if (string.Equals(name, s, StringComparison.OrdinalIgnoreCase)) d.scene = name;
            }
            if (d.a.TryGetValue("shot", out var sh)) d.shot = sh;
            if (d.a.TryGetValue("shotAt", out var sa)) float.TryParse(sa, System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out d.shotAt);
            if (d.a.TryGetValue("fixedStep", out var fs)) float.TryParse(fs, System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out d.fixedStepMs);
            d.quitAfter = d.a.ContainsKey("quitAfterShot");
            return d;
        }

        static int I(string v) => int.TryParse(v, out int n) ? n : 0;

        public void ApplyToSave()
        {
            if (a.ContainsKey("fresh")) { GameState.Reset(); GameState.LoadFromText("{}"); }
            if (a.TryGetValue("level", out var lv))
            {
                GameState.currentLevel = I(lv);
                GameState.highestUnlocked = Math.Max(GameState.highestUnlocked, 60);
                GameState.run = null;
            }
            if (a.TryGetValue("cur", out var cur)) GameState.currentLevel = I(cur);
            if (a.TryGetValue("tut", out var tut)) GameState.tutorialDone = tut == "1";
            if (a.TryGetValue("gems", out var g)) GameState.diamonds = I(g);
            if (a.TryGetValue("lang", out var l)) GameState.language = l;
            if (a.TryGetValue("hi", out var hi)) GameState.highestUnlocked = I(hi);
            if (a.ContainsKey("stars"))
            {
                GameState.starsAt.Clear();
                int[] st = { 3, 3, 3, 2, 2, 1, 3, 3, 2, 3, 3, 3 };
                for (int i = 0; i < st.Length; i++) GameState.starsAt[i.ToString()] = st[i];
            }
        }

        float nextHint = -1;
        bool wentTo;
        bool dragStarted;
        float perfAcc, perfMax, perfT;
        int perfN;

        /// <summary>-perf: log the average and worst frame time (update + repaint) once a second.</summary>
        public void Spike(float start, float stepEnd, float end, float clockMs)
        {
            if (a.ContainsKey("perf") && (end - start) * 1000 > 30)
                Debug.Log($"[perf] spike at {clockMs:F0} ms: update {(stepEnd - start) * 1000:F1} ms, repaint {(end - stepEnd) * 1000:F1} ms, gc {System.GC.CollectionCount(0)}");
        }

        public void Perf(float frameMs, float clockMs)
        {
            if (!a.ContainsKey("perf")) return;
            perfAcc += frameMs; perfN++; perfMax = Mathf.Max(perfMax, frameMs);
            if (clockMs - perfT >= 1000)
            {
                Debug.Log($"[perf] avg {perfAcc / Mathf.Max(1, perfN):F2} ms, max {perfMax:F2} ms, frames {perfN}");
                perfAcc = 0; perfMax = 0; perfN = 0; perfT = clockMs;
            }
        }

        public void Tick(MonoBehaviour host, float clockMs)
        {
            if (a.TryGetValue("autoDrag", out var adAt) && !dragStarted && float.TryParse(adAt, out var adMs) && clockMs >= adMs)
            {
                var gs = GameHost.Instance.scenes.Get("Game") as Scenes.GameScene;
                if (gs != null && gs.DevDragPlan(out var f, out var t))
                {
                    dragStarted = true;
                    float rs = Render.Viewport.rs;
                    int frame = 0;
                    Engine.InputRouter.injected = () =>
                    {
                        frame++;
                        if (frame > 40) { Engine.InputRouter.injected = null; return null; }
                        float k = Mathf.Clamp01((frame - 5) / 30f);
                        var p = Vector2.Lerp(f, t, k) * rs;
                        return (frame <= 36, new Vector2(p.x, Screen.height - p.y));
                    };
                    Debug.Log($"[dev] autoDrag {f} -> {t}");
                }
            }
            if (!wentTo && a.TryGetValue("go", out var goKey) && a.TryGetValue("goAt", out var goAt) && float.TryParse(goAt, out var goMs) && clockMs >= goMs)
            {
                wentTo = true;
                var from = GameHost.Instance.scenes.Get("MainMenu") ?? GameHost.Instance.scenes.Get("Timeline") ?? GameHost.Instance.scenes.Get("Game");
                from?.Go(goKey);
            }
            if (a.TryGetValue("autoHint", out var ah))
            {
                float every = 700;
                float.TryParse(ah, System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out every);
                if (every <= 0) every = 700;
                if (nextHint < 0) nextHint = clockMs + 1500;
                if (clockMs >= nextHint)
                {
                    nextHint = clockMs + every;
                    (GameHost.Instance.scenes.Get("Game") as Scenes.GameScene)?.Hint();
                }
            }
            if (shot == null || shotDone || clockMs < shotAt) return;
            shotDone = true;
            host.StartCoroutine(Capture());
        }

        System.Collections.IEnumerator Capture()
        {
            yield return new WaitForEndOfFrame();
            var tex = ScreenCapture.CaptureScreenshotAsTexture();
            System.IO.File.WriteAllBytes(shot, tex.EncodeToPNG());
            UnityEngine.Object.Destroy(tex);
            Debug.Log("[dev] screenshot " + shot);
            if (quitAfter) Application.Quit();
        }
    }
}
