// One polaroid of a solved board.
using System;
using System.Collections.Generic;
using UnityEngine;
using CozyBlocks.Core;
using CozyBlocks.Engine;
using CozyBlocks.Render;

namespace CozyBlocks.UI
{
    public sealed class PhotoData
    {
        public int index;
        public List<SnapshotEntry> pieces = new List<SnapshotEntry>();
        public int bg;
        public int stars;
        public bool empty;
    }

    public static class PhotoCard
    {
        public const float ASPECT = 1.215f;
        const float PAD = 0.055f, WINDOW_ASPECT = 1.08f, FOOTER = 0.15f;

        public static float HeightFor(float width) => width * ASPECT;

        public static Rect PhotoWindow(Rect rect)
        {
            float w = rect.width, p = w * PAD;
            return new Rect(rect.x + p, rect.y + p, w - p * 2, (w - p * 2) * WINDOW_ASPECT);
        }

        public static Vector2 StarCentre(Rect rect, int i)
        {
            var win = PhotoWindow(rect);
            float fh = rect.width * FOOTER;
            float endY = win.y + win.height;
            float fy = endY + (rect.y + rect.height - endY) * 0.5f;
            float r = fh * 0.3f;
            return new Vector2(win.x + win.width - r * 1.1f - (2 - i) * r * 2.35f, fy);
        }

        public static void Paint(CanvasItem ci, Rect rect, PhotoData p)
        {
            float w = rect.width, g = w * 0.006f;
            ci.DrawStyleBox(Art.Box(new Col(0.45f, 0.33f, 0.25f, 0.16f), w * 0.04f), rect.x - g, rect.y + w * 0.018f - g, rect.width + g * 2, rect.height + g * 2);
            ci.DrawStyleBox(Art.Box(Art.WHITE, w * 0.035f), rect.x, rect.y, rect.width, rect.height);
            var win = PhotoWindow(rect);
            if (p.empty)
            {
                ci.DrawRect(win.x, win.y, win.width, win.height, Col.Hex("#f1e9e1"));
                float fs = Js.Trunc(w * 0.34f);
                Fonts.DrawString(ci, "?", win.x, win.y + win.height / 2 + fs * 0.34f, win.width, HAlign.Center, FontKind.Thin, fs, Col.Hex("#dccfc4"));
            }
            else
            {
                Scenery.Draw(ci, win, p.bg);
                DrawBoard(ci, win, p.pieces);
            }
            float fh = w * FOOTER;
            float endY = win.y + win.height;
            float fy = endY + (rect.y + rect.height - endY) * 0.5f;
            var chip = new Rect(win.x, fy - fh * 0.31f, w * 0.2f, fh * 0.62f);
            ci.DrawStyleBox(Art.Box(Col.Hex("#f1efed"), chip.height * 0.3f), chip.x, chip.y, chip.width, chip.height);
            float cfs = Js.Trunc(chip.height * 0.62f);
            string label = "# " + (p.index + 1).ToString().PadLeft(3, '0');
            Fonts.DrawString(ci, label, chip.x, chip.y + chip.height / 2 + cfs * 0.34f, chip.width, HAlign.Center, FontKind.Thin, cfs, Col.Hex("#a8a29c"));
            if (!p.empty)
            {
                for (int i = 0; i < 3; i++)
                {
                    var col = i < p.stars ? Art.STAR : Col.Hex("#e6e1dc");
                    var c = StarCentre(rect, i);
                    Art.DrawStar(ci, c.x, c.y, fh * 0.3f, col);
                }
            }
        }

        static void DrawBoard(CanvasItem ci, Rect win, List<SnapshotEntry> pieces)
        {
            var recs = new List<(List<Vec> cells, int color, Vec eye)>();
            int loX = 1 << 20, loY = 1 << 20, hiX = -(1 << 20), hiY = -(1 << 20);
            if (pieces != null)
                foreach (var p in pieces)
                {
                    var cells = p.cells ?? new List<Vec>();
                    foreach (var c in cells)
                    {
                        loX = Math.Min(loX, c.x); loY = Math.Min(loY, c.y);
                        hiX = Math.Max(hiX, c.x); hiY = Math.Max(hiY, c.y);
                    }
                    if (cells.Count == 0) continue;
                    recs.Add((cells, p.color, p.eye));
                }
            if (recs.Count == 0) return;
            int spanX = hiX - loX + 1, spanY = hiY - loY + 1;
            float cs = Mathf.Floor(Mathf.Min(win.width * 0.86f / spanX, win.height * 0.86f / spanY));
            cs = Mathf.Max(cs, 4);
            float RH(float n) => n < 0 ? -Js.Round(-n) : Js.Round(n);
            float ox = RH(win.x + win.width / 2 - spanX * cs / 2);
            float oy = RH(win.y + win.height / 2 - spanY * cs / 2);
            foreach (var rec in recs)
            {
                var mn = PieceData.BboxMin(rec.cells);
                var local = new List<Vec>();
                foreach (var c in rec.cells) local.Add(new Vec(c.x - mn.x, c.y - mn.y));
                Art.DrawPolyomino(ci, ox + (mn.x - loX) * cs, oy + (mn.y - loY) * cs, cs, local, rec.color, new Vec(rec.eye.x - mn.x, rec.eye.y - mn.y), Mood.NEUTRAL, 0, false);
            }
        }
    }

    /// <summary>A polaroid as a view, pivoted at (w/2, 10) so a tilt hangs from the peg.</summary>
    public sealed class PhotoCardView : CanvasView
    {
        public PhotoData photo;
        public readonly float cw, ch;

        public PhotoCardView(float w, PhotoData data) : base(0, 0, w, PhotoCard.HeightFor(w), null, Mathf.Ceil(w * 0.06f), true)
        {
            photo = data;
            cw = w;
            ch = PhotoCard.HeightFor(w);
            SetPaint((ci, view) => { if (photo != null) PhotoCard.Paint(ci, new Rect(0, 0, view.ViewW, view.ViewH), photo); });
            SetPivot(w / 2, 10);
            Repaint();
        }

        public void SetStars(int n)
        {
            photo.stars = n;
            Invalidate();
        }

        public void SetBg(int id)
        {
            photo.bg = id;
            Invalidate();
        }

        public Vector2 StarPosition(int i) => PhotoCard.StarCentre(new Rect(0, 0, cw, ch), i);
    }
}
