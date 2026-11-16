// Godot's `canvas_items` stretch with `expand` aspect and a 720x1280 base (port of src/render/Viewport.ts).
//   scale = min(winW / 720, winH / 1280); logical w, h = window / scale; rs = texture pixels per logical unit.
using System;
using System.Collections.Generic;

namespace CozyBlocks.Render
{
    public static class Viewport
    {
        public const float BASE_W = 720;
        public const float BASE_H = 1280;
        public static float cssW = BASE_W, cssH = BASE_H, dpr = 1, scale = 1, w = BASE_W, h = BASE_H, rs = 1;
        static readonly List<Action> listeners = new List<Action>();

        public static bool Update(float winW, float winH, float pixelRatio = 1)
        {
            if (!(winW > 0 && winH > 0)) return false;
            float d = Math.Min(Math.Max(pixelRatio, 1), 3);
            float s = Math.Min(winW / BASE_W, winH / BASE_H);
            bool changed = winW != cssW || winH != cssH || d != dpr;
            cssW = winW;
            cssH = winH;
            dpr = d;
            scale = s;
            w = winW / s;
            h = winH / s;
            rs = s * d;
            if (changed) foreach (var l in listeners.ToArray()) l();
            return changed;
        }

        public static Action OnChange(Action l)
        {
            listeners.Add(l);
            return () => listeners.Remove(l);
        }

        public static float Short => Math.Min(w, h);
    }
}
