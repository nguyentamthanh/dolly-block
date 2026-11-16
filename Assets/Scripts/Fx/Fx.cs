// Juice toolkit: bursts, rings, floating text, screen shake, flying gems.
using System;
using UnityEngine;
using CozyBlocks.Core;
using CozyBlocks.Engine;
using CozyBlocks.Render;
using CozyBlocks.UI;

namespace CozyBlocks.Fx
{
    public static class Z
    {
        public const float pieces = 20, fx = 40, toast = 70, drag = 120, guide = 170, text = 220, gems = 320, panel = 400;
    }

    public static class Effects
    {
        static readonly System.Random rng = new System.Random();
        static float R() => (float)rng.NextDouble();

        static ParticleBurst Burst(Scene scene, ParticleConfig cfg) => new ParticleBurst(scene, cfg);

        static Func<float, Col> FadeRamp(Col c) => t => t <= 0.7f ? c : c.WithAlpha(c.a * (1 - (t - 0.7f) / 0.3f));

        public static ParticleBurst PiecePop(Scene scene, float x, float y, Col color) => Burst(scene, new ParticleConfig
        {
            depth = Z.fx, x = x, y = y, tex = ParticleTex.Circle, amount = 14, lifetime = 0.5f, direction = -90, spread = 180, gravityY = 700,
            vMin = 160, vMax = 340, dampMin = 60, dampMax = 120, scaleMin = 0.25f, scaleMax = 0.5f, scaleCurve = ParticleBurst.SHRINK_CURVE,
            color = color.Lightened(0.1f),
        });

        public static ParticleBurst StarSparkle(Scene scene, float x, float y, Col? color = null, int amount = 9, float power = 1, float depth = Z.fx) => Burst(scene, new ParticleConfig
        {
            depth = depth, x = x, y = y, tex = ParticleTex.Sparkle, amount = amount, lifetime = 0.6f, direction = -90, spread = 180,
            vMin = 140 * power, vMax = 320 * power, dampMin = 300 * power, dampMax = 500 * power,
            angVelMin = -360, angVelMax = 360, scaleMin = 0.6f, scaleMax = 1.2f, scaleCurve = ParticleBurst.SHRINK_CURVE, color = color ?? Col.WHITE,
        });

        public static ParticleBurst HeartsUp(Scene scene, float x, float y, Col? color = null) => Burst(scene, new ParticleConfig
        {
            depth = Z.fx, x = x, y = y, tex = ParticleTex.Heart, amount = 6, lifetime = 1, explosiveness = 0.75f, direction = -90, spread = 40, gravityY = -120,
            vMin = 60, vMax = 130, scaleMin = 0.6f, scaleMax = 1, scaleCurve = ParticleBurst.SHRINK_CURVE, colorRamp = FadeRamp(color ?? Col.Hex("#ff5fa2")),
            emissionKind = "sphere", emR = 18,
        });

        public static ParticleBurst Puff(Scene scene, float x, float y, Col? color = null) => Burst(scene, new ParticleConfig
        {
            depth = Z.fx, x = x, y = y, tex = ParticleTex.Soft, amount = 10, lifetime = 0.55f, direction = -90, spread = 180, gravityY = -40,
            vMin = 50, vMax = 120, dampMin = 80, dampMax = 140, scaleMin = 1, scaleMax = 1.8f, scaleCurve = ParticleBurst.SHRINK_CURVE,
            colorRamp = FadeRamp((color ?? new Col(0.45f, 0.4f, 0.6f, 1)).WithAlpha(0.8f)),
        });

        static readonly int[] CONFETTI_HUES = { Palette.PINK, Palette.YELLOW, Palette.GREEN, Palette.BLUE, Palette.PURPLE, Palette.ORANGE };
        static Col[] ConfettiColors()
        {
            var a = new Col[CONFETTI_HUES.Length];
            for (int i = 0; i < a.Length; i++) a[i] = Art.PaletteFill(CONFETTI_HUES[i]);
            return a;
        }

        public static ParticleBurst ConfettiBurst(Scene scene, float x, float y, int amount = 70, float power = 1, float depth = Z.fx) => Burst(scene, new ParticleConfig
        {
            depth = depth, x = x, y = y, tex = ParticleTex.Confetti, amount = amount, lifetime = 1.6f, explosiveness = 0.95f, direction = -90, spread = 70, gravityY = 900,
            vMin = 500 * power, vMax = 950 * power, dampMin = 120, dampMax = 260, angleMin = -180, angleMax = 180,
            angVelMin = -720, angVelMax = 720, scaleMin = 0.8f, scaleMax = 1.5f, colorInitial = ConfettiColors(),
        });

        public static ParticleBurst ConfettiCannon(Scene scene, float x, float y, float dirX, float dirY, int amount = 60) => Burst(scene, new ParticleConfig
        {
            depth = Z.fx, x = x, y = y, tex = ParticleTex.Confetti, amount = amount, lifetime = 1.6f, explosiveness = 0.95f,
            direction = Mathf.Atan2(dirY, dirX) * 180 / Mathf.PI, spread = 22, gravityY = 900,
            vMin = 500 * 1.25f, vMax = 950 * 1.25f, dampMin = 120, dampMax = 260, angleMin = -180, angleMax = 180,
            angVelMin = -720, angVelMax = 720, scaleMin = 0.8f, scaleMax = 1.5f, colorInitial = ConfettiColors(),
        });

        public static ParticleBurst ConfettiRain(Scene scene, float x, float y, float w, int amount = 90, float depth = Z.fx) => Burst(scene, new ParticleConfig
        {
            depth = depth, x = x + w / 2, y = y - 20, tex = ParticleTex.Confetti, amount = amount, lifetime = 3.2f, explosiveness = 0, direction = 90, spread = 15, gravityY = 260,
            vMin = 80, vMax = 200, angleMin = -180, angleMax = 180, angVelMin = -400, angVelMax = 400, scaleMin = 0.7f, scaleMax = 1.3f,
            colorInitial = ConfettiColors(), emissionKind = "rect", emEx = w * 0.5f, emEy = 8,
        });

        static uint Rgb(Col c)
        {
            var q = c.Css();
            return ((uint)Js.RoundI(q.r * 255) << 16) | ((uint)Js.RoundI(q.g * 255) << 8) | (uint)Js.RoundI(q.b * 255);
        }

        public static void RingWave(Scene scene, float x, float y, float radius, Col? colorOpt = null, float width = 10, float duration = 0.45f)
        {
            var color = colorOpt ?? Col.WHITE;
            var g = scene.Add(new Graphics2D());
            g.SetDepth(Z.fx);
            var t = scene.tw.Create();
            t.TweenMethod(k =>
            {
                float e = 1 - Mathf.Pow(1 - k, 3);
                float r = radius * (0.35f + 0.85f * e);
                g.Clear();
                g.LineStyle(Mathf.Max(1, width * (1 - k)), Rgb(color), color.a * (1 - k));
                g.StrokeCircle(x, y, r);
            }, 0, 1, duration);
            t.TweenCallback(() => g.Destroy());
        }

        public static void FloatText(Scene scene, string text, float x, float y, Col? color = null, float size = 56, float rise = 90, float hold = 0.55f)
        {
            var lab = Widgets.MakeLabel(scene, text, Fonts.Style(size, color ?? Col.WHITE, Art.TEXT_OUTLINE), new LabelOpts { align = HAlign.Center, boxW = 700 });
            lab.SetTopLeft(x - 350, y - lab.ViewH / 2);
            lab.SetDepth(Z.text);
            lab.SetScale(0.3f);
            float startY = lab.y;
            var t = scene.tw.Create();
            t.TweenProperty(lab, "scale", new Vector2(1.18f, 1.18f), 0.16).SetTrans(Trans.BACK).SetEase(EaseKind.OUT);
            t.TweenProperty(lab, "scale", new Vector2(1, 1), 0.1);
            t.TweenInterval(hold);
            t.SetParallel(true);
            t.TweenProperty(lab, "y", startY - rise, 0.45).SetTrans(Trans.CUBIC).SetEase(EaseKind.IN);
            t.TweenProperty(lab, "alpha", 0, 0.45);
            t.Chain().TweenCallback(() => lab.Destroy());
        }

        static readonly System.Runtime.CompilerServices.ConditionalWeakTable<Scene, Tween> shakes = new System.Runtime.CompilerServices.ConditionalWeakTable<Scene, Tween>();

        public static void Shake(Scene scene, float strength = 8, float duration = 0.3f)
        {
            if (shakes.TryGetValue(scene, out var prev)) { prev.Kill(); shakes.Remove(scene); }
            float seed = R() * 100;
            var t = scene.tw.Create();
            t.TweenMethod(k =>
            {
                float amp = strength * (1 - k) * (1 - k);
                scene.camScrollX = -Mathf.Sin(seed + k * 55) * amp;
                scene.camScrollY = -Mathf.Cos(seed * 1.7f + k * 43) * amp;
            }, 0, 1, duration);
            t.TweenCallback(() => { scene.camScrollX = 0; scene.camScrollY = 0; });
            shakes.Add(scene, t);
        }

        public static void FlyGems(Scene scene, float fx, float fy, float tx, float ty, int count, Action onArrive, Action onDone = null)
        {
            for (int i = 0; i < count; i++)
            {
                var g = scene.Add(new CanvasView(0, 0, 40, 40, (ci, v) => Art.DrawGem(ci, 20, 20, 14), 8));
                g.SetPivot(20, 20);
                g.SetDepth(Z.gems);
                float sx = fx + (R() * 140 - 70) * 0.3f;
                float sy = fy + (R() * 80 - 50) * 0.3f;
                float cx = fx + (tx - fx) * 0.35f + (R() * 320 - 160);
                float cy = fy + (ty - fy) * 0.35f + (R() * 180 - 60);
                g.SetTopLeft(sx - 20, sy - 20);
                g.SetScale(0);
                bool last = i == count - 1;
                var t = scene.tw.Create();
                t.TweenInterval(i * 0.06);
                t.TweenProperty(g, "scale", new Vector2(1.2f, 1.2f), 0.12).SetTrans(Trans.BACK).SetEase(EaseKind.OUT);
                t.TweenMethod(k =>
                {
                    float ax = sx + (cx - sx) * k, ay = sy + (cy - sy) * k;
                    float bx = cx + (tx - cx) * k, by = cy + (ty - cy) * k;
                    g.SetPosition(ax + (bx - ax) * k, ay + (by - ay) * k);
                    g.SetScale(1.2f + (0.7f - 1.2f) * k);
                }, 0, 1, 0.5).SetTrans(Trans.SINE).SetEase(EaseKind.IN);
                t.TweenCallback(() =>
                {
                    onArrive();
                    if (last) onDone?.Invoke();
                    g.Destroy();
                });
            }
        }
    }
}
