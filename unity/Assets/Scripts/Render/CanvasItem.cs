// A Godot-style CanvasItem on top of Canvas2D (port of src/render/CanvasItem.ts): draw_circle / draw_arc /
// draw_polyline / draw_colored_polygon / draw_style_box with the same argument conventions. Logical units.
using System;
using System.Collections.Generic;
using UnityEngine;

namespace CozyBlocks.Render
{
    /// <summary>StyleBoxFlat as far as the game uses it. Corner order: top-left, top-right, bottom-right, bottom-left.</summary>
    public sealed class StyleBoxFlat
    {
        public Col bg = Col.TRANSPARENT;
        public float[] radius = { 0, 0, 0, 0 };
        /// <summary>left, top, right, bottom</summary>
        public float[] border = { 0, 0, 0, 0 };
        public Col borderColor = Col.TRANSPARENT;
        public Col shadowColor = Col.TRANSPARENT;
        public float shadowSize;
        public float[] shadowOffset = { 0, 0 };
        public float[] margin = { 0, 0, 0, 0 };

        public static StyleBoxFlat Box(Col fill, float radius, float border = 0, Col? borderColor = null)
        {
            var sb = new StyleBoxFlat { bg = fill };
            float r = (float)Math.Truncate(radius);
            sb.radius = new[] { r, r, r, r };
            if (border > 0)
            {
                float b = (float)Math.Truncate(border);
                sb.border = new[] { b, b, b, b };
                sb.borderColor = borderColor ?? Col.TRANSPARENT;
            }
            return sb;
        }

        public static StyleBoxFlat Corners(Col fill, float tl, float tr, float br, float bl)
        {
            return new StyleBoxFlat
            {
                bg = fill,
                radius = new[] { (float)Math.Truncate(tl), (float)Math.Truncate(tr), (float)Math.Truncate(br), (float)Math.Truncate(bl) },
            };
        }

        public StyleBoxFlat Duplicate()
        {
            return new StyleBoxFlat
            {
                bg = bg, radius = (float[])radius.Clone(), border = (float[])border.Clone(), borderColor = borderColor,
                shadowColor = shadowColor, shadowSize = shadowSize, shadowOffset = (float[])shadowOffset.Clone(), margin = (float[])margin.Clone(),
            };
        }
    }

    public sealed class CanvasItem
    {
        public readonly Canvas2D ctx;
        public readonly float pxScale;
        Mat2D baseTransform;
        static readonly Dictionary<string, Canvas2D> shadowCache = new Dictionary<string, Canvas2D>();

        public CanvasItem(Canvas2D ctx, float pxScale)
        {
            this.ctx = ctx;
            this.pxScale = pxScale;
            baseTransform = ctx.GetTransform();
        }

        public void MarkBase() => baseTransform = ctx.GetTransform();

        public void DrawSetTransform(float x = 0, float y = 0, float rot = 0, float sx = 1, float sy = 1)
        {
            ctx.SetTransform(baseTransform);
            ctx.Translate(x, y);
            if (rot != 0) ctx.Rotate(rot);
            if (sx != 1 || sy != 1) ctx.Scale(sx, sy);
        }

        public void DrawResetTransform() => ctx.SetTransform(baseTransform);

        /// <summary>Closed rounded-rect subpath; radii scale down together when they don't fit.</summary>
        public static void RoundRectPath(Canvas2D ctx, float x, float y, float w, float h, float[] r, bool reverse = false)
        {
            float tl = r[0], tr = r[1], br = r[2], bl = r[3];
            float f = Mathf.Min(1,
                Mathf.Min(tl + tr > 0 ? w / (tl + tr) : 1, bl + br > 0 ? w / (bl + br) : 1),
                Mathf.Min(tl + bl > 0 ? h / (tl + bl) : 1, tr + br > 0 ? h / (tr + br) : 1));
            if (f < 1) { tl *= f; tr *= f; br *= f; bl *= f; }
            float P = Mathf.PI;
            if (!reverse)
            {
                ctx.MoveTo(x + tl, y);
                ctx.LineTo(x + w - tr, y);
                if (tr > 0) ctx.Arc(x + w - tr, y + tr, tr, -P / 2, 0);
                ctx.LineTo(x + w, y + h - br);
                if (br > 0) ctx.Arc(x + w - br, y + h - br, br, 0, P / 2);
                ctx.LineTo(x + bl, y + h);
                if (bl > 0) ctx.Arc(x + bl, y + h - bl, bl, P / 2, P);
                ctx.LineTo(x, y + tl);
                if (tl > 0) ctx.Arc(x + tl, y + tl, tl, P, P * 1.5f);
                ctx.ClosePath();
            }
            else
            {
                // Same outline, counter-clockwise (the hole of a ring under nonzero winding).
                ctx.MoveTo(x + tl, y);
                if (tl > 0) ctx.Arc(x + tl, y + tl, tl, P * 1.5f, P, true);
                ctx.LineTo(x, y + h - bl);
                if (bl > 0) ctx.Arc(x + bl, y + h - bl, bl, P, P / 2, true);
                ctx.LineTo(x + w - br, y + h);
                if (br > 0) ctx.Arc(x + w - br, y + h - br, br, P / 2, 0, true);
                ctx.LineTo(x + w, y + tr);
                if (tr > 0) ctx.Arc(x + w - tr, y + tr, tr, 0, -P / 2, true);
                ctx.ClosePath();
            }
        }

        // --- primitives ----------------------------------------------------------------------------------

        public void DrawRect(float x, float y, float w, float h, Col color)
        {
            ctx.FillColor = color;
            ctx.FillRect(x, y, w, h);
        }

        public void DrawCircle(float cx, float cy, float r, Col color)
        {
            ctx.FillColor = color;
            ctx.BeginPath();
            ctx.Arc(cx, cy, r, 0, Mathf.PI * 2);
            ctx.Fill();
        }

        public void DrawLine(float ax, float ay, float bx, float by, Col color, float width)
        {
            ctx.StrokeColor = color;
            ctx.LineWidth = width;
            ctx.Cap = LineCap.Butt;
            ctx.BeginPath();
            ctx.MoveTo(ax, ay);
            ctx.LineTo(bx, by);
            ctx.Stroke();
        }

        public void DrawPolyline(IReadOnlyList<Vector2> pts, Col color, float width)
        {
            if (pts.Count < 2) return;
            ctx.StrokeColor = color;
            ctx.LineWidth = width;
            ctx.Cap = LineCap.Butt;
            ctx.Join = LineJoin.Miter;
            ctx.MiterLimit = 2;
            ctx.BeginPath();
            ctx.MoveTo(pts[0].x, pts[0].y);
            for (int i = 1; i < pts.Count; i++) ctx.LineTo(pts[i].x, pts[i].y);
            ctx.Stroke();
        }

        public void DrawArc(float cx, float cy, float radius, float start, float end, int pointCount, Col color, float width)
        {
            var pts = new List<Vector2>(pointCount);
            float delta = end - start;
            for (int i = 0; i < pointCount; i++)
            {
                float th = (float)i / (pointCount - 1) * delta + start;
                pts.Add(new Vector2(cx + Mathf.Cos(th) * radius, cy + Mathf.Sin(th) * radius));
            }
            DrawPolyline(pts, color, width);
        }

        /// <summary>Polyline with round caps and joints (Art._stroke).</summary>
        public void DrawStroke(IReadOnlyList<Vector2> pts, Col color, float width)
        {
            DrawPolyline(pts, color, width);
            foreach (var p in pts) DrawCircle(p.x, p.y, width * 0.5f, color);
        }

        public void DrawColoredPolygon(IReadOnlyList<Vector2> pts, Col color)
        {
            if (pts.Count < 3) return;
            ctx.FillColor = color;
            ctx.BeginPath();
            ctx.MoveTo(pts[0].x, pts[0].y);
            for (int i = 1; i < pts.Count; i++) ctx.LineTo(pts[i].x, pts[i].y);
            ctx.ClosePath();
            ctx.Fill();
        }

        // --- StyleBoxFlat ---------------------------------------------------------------------------------

        public void DrawStyleBox(StyleBoxFlat sb, float x, float y, float w, float h)
        {
            if (w <= 0 || h <= 0) return;
            if (sb.shadowSize > 0 && sb.shadowColor.a > 0) DrawShadow(sb, x, y, w, h);
            float bl = sb.border[0], bt = sb.border[1], br = sb.border[2], bb = sb.border[3];
            bool hasBorder = bl > 0 || bt > 0 || br > 0 || bb > 0;
            if (hasBorder && sb.borderColor.a > 0)
            {
                var r = sb.radius;
                var inner = new[]
                {
                    Mathf.Max(r[0] - Mathf.Min(bl, bt), 0), Mathf.Max(r[1] - Mathf.Min(br, bt), 0),
                    Mathf.Max(r[2] - Mathf.Min(br, bb), 0), Mathf.Max(r[3] - Mathf.Min(bl, bb), 0),
                };
                ctx.FillColor = sb.borderColor;
                ctx.BeginPath();
                RoundRectPath(ctx, x, y, w, h, sb.radius);
                RoundRectPath(ctx, x + bl, y + bt, w - bl - br, h - bt - bb, inner, true);
                ctx.Fill();
                if (sb.bg.a > 0)
                {
                    ctx.FillColor = sb.bg;
                    ctx.BeginPath();
                    RoundRectPath(ctx, x + bl, y + bt, w - bl - br, h - bt - bb, inner);
                    ctx.Fill();
                }
                return;
            }
            if (sb.bg.a > 0)
            {
                ctx.FillColor = sb.bg;
                ctx.BeginPath();
                RoundRectPath(ctx, x, y, w, h, sb.radius);
                ctx.Fill();
            }
        }

        static float[] Grow(float[] r, float d) => new[] { r[0] + d, r[1] + d, r[2] + d, r[3] + d };

        /// <summary>Solid shadow box shifted by shadow_offset plus a band shadow_size wide fading linearly to clear.</summary>
        void DrawShadow(StyleBoxFlat sb, float x, float y, float w, float h)
        {
            float s = sb.shadowSize;
            string key = $"{w}|{h}|{string.Join(",", sb.radius)}|{s}|{sb.shadowColor.Key()}|{pxScale}";
            float pad = s;
            float k = pxScale;
            if (!shadowCache.TryGetValue(key, out var tile))
            {
                if (shadowCache.Count > 200) shadowCache.Clear();
                tile = new Canvas2D(Mathf.CeilToInt((w + pad * 2) * k), Mathf.CeilToInt((h + pad * 2) * k));
                tile.Scale(k, k);
                var bc = sb.shadowColor;
                int steps = Mathf.Max(2, Mathf.CeilToInt(s * 2));
                for (int i = steps; i >= 1; i--)
                {
                    float dd = (float)i / steps * s;
                    float din = (float)(i - 1) / steps * s;
                    float dm = (i - 0.5f) / steps * s;
                    float alpha = bc.a * (1 - dm / s);
                    tile.FillColor = bc.WithAlpha(alpha);
                    tile.BeginPath();
                    RoundRectPath(tile, pad - dd, pad - dd, w + dd * 2, h + dd * 2, Grow(sb.radius, dd));
                    if (i > 1) RoundRectPath(tile, pad - din, pad - din, w + din * 2, h + din * 2, Grow(sb.radius, din), true);
                    else RoundRectPath(tile, pad, pad, w, h, sb.radius, true);
                    tile.Fill();
                }
                tile.FillColor = bc;
                tile.BeginPath();
                RoundRectPath(tile, pad, pad, w, h, sb.radius);
                tile.Fill();
                shadowCache[key] = tile;
            }
            ctx.DrawCanvas(tile, x + sb.shadowOffset[0] - pad, y + sb.shadowOffset[1] - pad, w + pad * 2, h + pad * 2);
        }
    }
}
