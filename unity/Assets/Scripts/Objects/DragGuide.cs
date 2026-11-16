// First-level coach mark: a fingertip dragging a tray piece onto its spot (port of src/objects/DragGuide.ts).
using System.Collections.Generic;
using UnityEngine;
using CozyBlocks.Core;
using CozyBlocks.Engine;
using CozyBlocks.Render;
using CozyBlocks.Fx;
using CozyBlocks.Scenes;

namespace CozyBlocks.Objects
{
    public sealed class DragGuide
    {
        const float PERIOD = 2.2f;
        const uint OUTLINE = 0x2b1d4e;
        readonly Graphics2D g;
        readonly GameScene scene;
        readonly PieceView piece;
        readonly Vec target;
        readonly List<Vec> cells;
        float t;
        bool dead;

        public DragGuide(GameScene scene, PieceView piece, Vec target, List<Vec> cells)
        {
            this.scene = scene;
            this.piece = piece;
            this.target = target;
            this.cells = cells;
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

        public static uint Rgb(Col c)
        {
            var q = c.Css();
            return ((uint)Js.RoundI(q.r * 255) << 16) | ((uint)Js.RoundI(q.g * 255) << 8) | (uint)Js.RoundI(q.b * 255);
        }

        void Draw()
        {
            g.Clear();
            var board = scene.board;
            float cs = board.cellSize;
            float ghostX = board.x + board.originX + target.x * cs;
            float ghostY = board.y + board.originY + target.y * cs;
            int bbx = 0, bby = 0;
            foreach (var c in cells) { bbx = Mathf.Max(bbx, c.x + 1); bby = Mathf.Max(bby, c.y + 1); }
            float pulse = 0.6f + 0.3f * Mathf.Sin(t * 5);
            var tint = Art.PaletteFill(piece.piece.color);
            var geo = PolyShape.Geometry(cells, cs);
            void FillPolys(List<List<Vector2>> polys, uint rgb, float alpha)
            {
                foreach (var p in polys)
                {
                    if (p.Count < 3) continue;
                    var pts = new List<Vector2>();
                    foreach (var q in p) pts.Add(new Vector2(q.x + ghostX, q.y + ghostY));
                    g.FillStyle(rgb, alpha);
                    g.FillPoints(pts, true);
                    g.LineStyle(1, rgb, alpha);
                    g.StrokePoints(pts, true);
                }
            }
            FillPolys(geo.outer, 0xffffff, pulse);
            FillPolys(geo.body, Rgb(tint), pulse * 0.55f);

            float fromX = piece.Left + piece.BoxW / 2, fromY = piece.Top + piece.BoxH / 2;
            float toX = ghostX + bbx * cs / 2, toY = ghostY + bby * cs / 2;
            float ph = t % PERIOD;
            float k = Mathf.Clamp01((ph - 0.35f) / 1.0f);
            k = k * k * (3 - 2 * k);
            float atX = fromX + (toX - fromX) * k + 18, atY = fromY + (toY - fromY) * k + 26;
            bool pressed = ph >= 0.2f && ph < 1.5f;
            float alpha2 = Mathf.Clamp01((PERIOD - ph) / 0.4f) * Mathf.Clamp01(ph / 0.15f);
            const int steps = 9;
            g.FillStyle(0xffffff, 0.65f * alpha2);
            for (int i = 0; i < steps; i++)
            {
                float q = (i + 1f) / (steps + 1);
                g.FillCircle(fromX + (toX - fromX) * q, fromY + (toY - fromY) * q, 7);
            }
            if (pressed)
            {
                float age = ph - 0.2f;
                g.LineStyle(5, 0xffffff, 0.7f * alpha2);
                g.StrokeCircle(atX, atY, 30 + Mathf.Min(age, 0.3f) * 40);
            }
            float r = pressed ? 22 : 26;
            g.FillStyle(0x0d0533, 0.3f * alpha2);
            g.FillCircle(atX, atY + 5, r + 4);
            g.FillStyle(OUTLINE, alpha2);
            g.FillCircle(atX, atY, r + 4);
            g.FillStyle(0xffffff, alpha2);
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
