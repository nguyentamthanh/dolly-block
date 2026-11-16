// Painted photo backdrops. Scatter maths in double so the scenery stays the same as in earlier releases.
using System;
using System.Collections.Generic;
using UnityEngine;
using CozyBlocks.Render;

namespace CozyBlocks.UI
{
    public static class Scenery
    {
        public const int COUNT = 5;

        static int Posmod(int a, int b) => ((a % b) + b) % b;
        static double Fpos1(double x) => x - Math.Floor(x);

        public static void Draw(CanvasItem ci, Rect r, int id)
        {
            switch (Posmod(id, COUNT))
            {
                case 0: Meadow(ci, r); break;
                case 1: Desert(ci, r); break;
                case 2: Road(ci, r); break;
                case 3: Snow(ci, r); break;
                default: Beach(ci, r); break;
            }
        }

        public static void Cloud(CanvasItem ci, float cx, float cy, float s, Col? colOpt = null)
        {
            var col = colOpt ?? Col.WHITE;
            ci.DrawCircle(cx - s * 0.24f, cy + s * 0.04f, s * 0.17f, col);
            ci.DrawCircle(cx + s * 0.02f, cy - s * 0.06f, s * 0.23f, col);
            ci.DrawCircle(cx + s * 0.27f, cy + s * 0.04f, s * 0.16f, col);
            ci.DrawRect(cx - s * 0.24f, cy + s * 0.04f, s * 0.51f, s * 0.16f, col);
            ci.DrawCircle(cx - s * 0.24f, cy + s * 0.12f, s * 0.08f, col);
            ci.DrawCircle(cx + s * 0.27f, cy + s * 0.12f, s * 0.08f, col);
        }

        static void Fill(CanvasItem ci, Rect r, string c) => ci.DrawRect(r.x, r.y, r.width, r.height, Col.Hex(c));

        static void Meadow(CanvasItem ci, Rect r)
        {
            Fill(ci, r, "#cfe9f6");
            Cloud(ci, r.x + r.width * 0.72f, r.y + r.height * 0.16f, r.width * 0.34f);
            float gy = r.y + r.height * 0.42f, gh = r.height * 0.58f;
            ci.DrawRect(r.x, gy, r.width, gh, Col.Hex("#bddba6"));
            for (int i = 0; i < 34; i++)
            {
                float fx = (float)Fpos1(Math.Sin(i * 12.9898) * 43758.5453);
                float fy = (float)Fpos1(Math.Sin(i * 78.233) * 24634.6345);
                float px = r.x + fx * r.width, py = gy + (0.04f + fy * 0.92f) * gh;
                float pr = Mathf.Max(1.5f, r.width * 0.012f);
                ci.DrawCircle(px, py, pr, Col.WHITE);
                ci.DrawCircle(px, py, pr * 0.4f, Col.Hex("#f4d37a"));
            }
        }

        static void Desert(CanvasItem ci, Rect r)
        {
            Fill(ci, r, "#d4ecf4");
            Cloud(ci, r.x + r.width * 0.3f, r.y + r.height * 0.2f, r.width * 0.34f);
            ci.DrawCircle(r.x + r.width * 0.8f, r.y + r.height * 0.16f, r.width * 0.07f, Col.Hex("#fff1c4"));
            ci.DrawRect(r.x, r.y + r.height * 0.46f, r.width, r.height * 0.54f, Col.Hex("#ffd98c"));
            Hill(ci, r, 0.62f, 0.07f, 0, Col.Hex("#f7c874"));
            Hill(ci, r, 0.84f, 0.06f, 1.6f, Col.Hex("#f2bd68"));
        }

        static Vector2 P(float x, float y) => new Vector2(x, y);

        static void Road(CanvasItem ci, Rect r)
        {
            Fill(ci, r, "#d5e9f1");
            Cloud(ci, r.x + r.width * 0.25f, r.y + r.height * 0.18f, r.width * 0.3f);
            float horizon = r.y + r.height * 0.42f, endY = r.y + r.height, endX = r.x + r.width;
            ci.DrawRect(r.x, horizon, r.width, endY - horizon, Col.Hex("#bddba8"));
            float cx = r.x + r.width * 0.5f;
            ci.DrawColoredPolygon(new[] { P(cx - r.width * 0.05f, horizon), P(cx + r.width * 0.05f, horizon), P(endX - r.width * 0.04f, endY), P(r.x + r.width * 0.04f, endY) }, Col.Hex("#a9b0b8"));
            for (int i = 0; i < 5; i++)
            {
                float t0 = 0.12f + i * 0.19f, t1 = t0 + 0.09f + i * 0.02f;
                float y0 = horizon + (endY - horizon) * t0, y1 = horizon + (endY - horizon) * Mathf.Min(t1, 1);
                float w0 = r.width * (0.006f + 0.012f * t0), w1 = r.width * (0.006f + 0.012f * t1);
                ci.DrawColoredPolygon(new[] { P(cx - w0, y0), P(cx + w0, y0), P(cx + w1, y1), P(cx - w1, y1) }, Col.Hex("#f4f6f8"));
            }
        }

        static void Snow(CanvasItem ci, Rect r)
        {
            Fill(ci, r, "#4e5b66");
            ci.DrawRect(r.x, r.y + r.height * 0.5f, r.width, r.height * 0.5f, Col.Hex("#dfe9ef"));
            Hill(ci, r, 0.54f, 0.05f, 0.8f, Col.Hex("#cfdbe3"));
            for (int i = 0; i < 26; i++)
            {
                float fx = (float)Fpos1(Math.Sin(i * 31.7) * 9731.1);
                float fy = (float)Fpos1(Math.Sin(i * 17.3) * 5113.7);
                ci.DrawCircle(r.x + fx * r.width, r.y + fy * 0.9f * r.height, Mathf.Max(1.2f, r.width * 0.009f), new Col(1, 1, 1, 0.75f));
            }
        }

        static void Beach(CanvasItem ci, Rect r)
        {
            Fill(ci, r, "#ffe3d0");
            ci.DrawCircle(r.x + r.width * 0.3f, r.y + r.height * 0.3f, r.width * 0.1f, Col.Hex("#ffbf99"));
            ci.DrawRect(r.x, r.y + r.height * 0.46f, r.width, r.height * 0.2f, Col.Hex("#93c9d5"));
            ci.DrawRect(r.x, r.y + r.height * 0.64f, r.width, r.height * 0.36f, Col.Hex("#f8e1b4"));
            Hill(ci, r, 0.64f, 0.025f, 2.4f, Col.Hex("#e8f5f4"));
        }

        static void Hill(CanvasItem ci, Rect r, float bas, float amp, float phase, Col col)
        {
            var pts = new List<Vector2>();
            const int n = 16;
            for (int i = 0; i <= n; i++)
            {
                float t = (float)i / n;
                pts.Add(P(r.x + r.width * t, r.y + r.height * (bas + Mathf.Sin(t * Mathf.PI * 2 * 0.8f + phase) * amp)));
            }
            pts.Add(P(r.x + r.width, r.y + r.height));
            pts.Add(P(r.x, r.y + r.height));
            ci.DrawColoredPolygon(pts, col);
        }
    }
}
