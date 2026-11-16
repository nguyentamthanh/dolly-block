// Reusable UI motion: squishy press, idle pulse, pop-in, slide-in, bump.
using System;
using System.Collections.Generic;
using System.Runtime.CompilerServices;
using UnityEngine;
using CozyBlocks.Engine;

namespace CozyBlocks.UI
{
    public static class UiFx
    {
        sealed class Slots { public readonly Dictionary<string, Tween> m = new Dictionary<string, Tween>(); }
        sealed class PulseCfg { public float amount, period; }
        static readonly ConditionalWeakTable<object, Slots> slots = new ConditionalWeakTable<object, Slots>();
        static readonly ConditionalWeakTable<object, PulseCfg> pulses = new ConditionalWeakTable<object, PulseCfg>();

        static Tween Run(Scene scene, object obj, string key, Action<Tween> build)
        {
            Stop(obj, key);
            var t = scene.tw.Create();
            build(t);
            slots.GetOrCreateValue(obj).m[key] = t;
            return t;
        }

        public static void Stop(object obj, string key)
        {
            if (slots.TryGetValue(obj, out var s) && s.m.TryGetValue(key, out var prev) && prev.valid) prev.Kill();
        }

        public static void StopAll(object obj)
        {
            if (!slots.TryGetValue(obj, out var s)) return;
            foreach (var t in s.m.Values) if (t.valid) t.Kill();
        }

        static Vector2 S(float v) => new Vector2(v, v);

        public static void JuicyDown(Scene scene, GameObj b)
        {
            Stop(b, "pulse");
            Run(scene, b, "press", t => t.TweenProperty(b, "scale", S(0.9f), 0.07).SetTrans(Trans.QUAD).SetEase(EaseKind.OUT));
        }

        public static void JuicyUp(Scene scene, GameObj b)
        {
            Run(scene, b, "press", t =>
            {
                t.TweenProperty(b, "scale", S(1.08f), 0.09).SetTrans(Trans.BACK).SetEase(EaseKind.OUT);
                t.TweenProperty(b, "scale", S(1), 0.12).SetTrans(Trans.SINE).SetEase(EaseKind.IN_OUT);
                t.TweenCallback(() =>
                {
                    if (pulses.TryGetValue(b, out var p)) Pulse(scene, b, p.amount, p.period);
                });
            });
        }

        public static void Pulse(Scene scene, GameObj c, float amount = 0.05f, float period = 1.1f)
        {
            pulses.Remove(c);
            pulses.Add(c, new PulseCfg { amount = amount, period = period });
            Run(scene, c, "pulse", t =>
            {
                t.SetLoops();
                t.TweenProperty(c, "scale", S(1 + amount), period * 0.5).SetTrans(Trans.SINE).SetEase(EaseKind.IN_OUT);
                t.TweenProperty(c, "scale", S(1), period * 0.5).SetTrans(Trans.SINE).SetEase(EaseKind.IN_OUT);
            });
        }

        public static void PopIn(Scene scene, GameObj c, float delay = 0, float duration = 0.38f)
        {
            c.SetScale(0, 0);
            Run(scene, c, "pop", t =>
            {
                t.TweenInterval(delay);
                t.TweenProperty(c, "scale", S(1), duration).SetTrans(Trans.BACK).SetEase(EaseKind.OUT);
            });
        }

        public static void SlideIn(Scene scene, GameObj c, float fromX, float fromY, float delay = 0, float duration = 0.45f)
        {
            float tx = c.x, ty = c.y;
            c.x = tx + fromX;
            c.y = ty + fromY;
            c.alpha = 0;
            Run(scene, c, "slide", t =>
            {
                t.TweenInterval(delay);
                t.SetParallel(true);
                t.TweenProperty(c, "position", new Vector2(tx, ty), duration).SetTrans(Trans.BACK).SetEase(EaseKind.OUT);
                t.TweenProperty(c, "alpha", 1, duration * 0.6);
            });
        }

        public static void Bump(Scene scene, GameObj c, float amount = 0.18f)
        {
            Run(scene, c, "bump", t =>
            {
                t.TweenProperty(c, "scale", S(1 + amount), 0.06);
                t.TweenProperty(c, "scale", S(1), 0.18).SetTrans(Trans.BACK).SetEase(EaseKind.OUT);
            });
        }

        public static Tween RunKeyed(Scene scene, object obj, string key, Action<Tween> build) => Run(scene, obj, key, build);
    }
}
