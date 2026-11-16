// Level-10 coach mark: a fingertip taps a tray piece and a gold arrow sweeps round it.
using System.Collections.Generic;
using UnityEngine;
using CozyBlocks.Engine;
using CozyBlocks.Fx;
using CozyBlocks.Scenes;

namespace CozyBlocks.Objects
{
    public sealed class RotateGuide
    {
        const float PERIOD = 2.4f;
        const uint OUTLINE = 0x2b1d4e;
        const uint GOLD = 0xffc83d;
        readonly Graphics2D g;
        readonly PieceView piece;
        float t;
        bool dead;

        static float C01(float x) => Mathf.Clamp01(x);
        static float Smooth(float x) => x * x * (3 - 2 * x);

        public RotateGuide(GameScene scene, PieceView piece)
        {
            this.piece = piece;
            g = scene.Add(new Graphics2D());
            g.SetDepth(Z.guide);
        }

        public void Tick(float dt)
        {
            if (dead) return;
            t += dt;
            if (!piece.Active) { Destroy(); return; }
            Draw();
        }

        void Draw()
        {
            g.Clear();
            float cx = piece.Left + piece.BoxW / 2, cy = piece.Top + piece.BoxH / 2;
            float p = t % PERIOD;
            float fade = C01((PERIOD - p) / 0.4f) * C01(p / 0.15f);
            float radius = Mathf.Max(piece.BoxW, piece.BoxH) * 0.5f + 22;
            float pulse = 0.5f + 0.3f * Mathf.Sin(t * 6);
            g.LineStyle(5, 0xffffff, pulse * fade);
            g.StrokeCircle(cx, cy, radius);
            float sweep = Smooth(C01((p - 0.7f) / 0.9f));
            if (sweep > 0)
            {
                float a0 = -Mathf.PI * 0.75f;
                float a1 = a0 + Mathf.PI * 0.5f * sweep + 0.001f;
                g.LineStyle(9, OUTLINE, fade);
                g.BeginPath();
                g.Arc(cx, cy, radius + 14, a0, a1, false);
                g.StrokePath();
                g.LineStyle(6, GOLD, fade);
                g.BeginPath();
                g.Arc(cx, cy, radius + 14, a0, a1, false);
                g.StrokePath();
                float tx = cx + Mathf.Cos(a1) * (radius + 14), ty = cy + Mathf.Sin(a1) * (radius + 14);
                float fx = -Mathf.Sin(a1), fy = Mathf.Cos(a1), sx = Mathf.Cos(a1), sy = Mathf.Sin(a1);
                var tri = new List<Vector2>
                {
                    new Vector2(tx + fx * 18, ty + fy * 18),
                    new Vector2(tx - fx * 4 + sx * 14, ty - fy * 4 + sy * 14),
                    new Vector2(tx - fx * 4 - sx * 14, ty - fy * 4 - sy * 14),
                };
                g.FillStyle(GOLD, fade);
                g.FillPoints(tri, true);
                g.LineStyle(3, OUTLINE, fade);
                g.StrokePoints(tri, true);
            }
            float come = Smooth(C01(p / 0.5f));
            float atX = cx + 18 + (1 - come) * 70, atY = cy + 26 + (1 - come) * 70;
            bool pressed = p >= 0.5f && p < 1.0f;
            if (pressed)
            {
                float age = p - 0.5f;
                g.LineStyle(5, 0xffffff, 0.7f * fade);
                g.StrokeCircle(atX, atY, 30 + Mathf.Min(age, 0.3f) * 60);
            }
            float r = pressed ? 22 : 26;
            g.FillStyle(0x0d0533, 0.3f * fade);
            g.FillCircle(atX, atY + 5, r + 4);
            g.FillStyle(OUTLINE, fade);
            g.FillCircle(atX, atY, r + 4);
            g.FillStyle(0xffffff, fade);
            g.FillCircle(atX, atY, r);
            g.FillCircle(atX - r * 0.3f, atY - r * 0.3f, r * 0.25f);
        }

        public void Destroy()
        {
            if (dead) return;
            dead = true;
            g.Destroy();
        }
    }
}
