// Procedural drawing for the soft cream look (port of src/render/Art.ts).
using System.Collections.Generic;
using UnityEngine;
using CozyBlocks.Core;

namespace CozyBlocks.Render
{
    public sealed class ButtonStyles
    {
        public StyleBoxFlat normal, hover, pressed, disabled;
        public Col ink;
        public Col? outline;
        public float pressDrop;
    }

    public struct PolyominoOptions
    {
        public float? alpha, blink, ringPulse;
        public bool happyEyes;
    }

    public static class Art
    {
        public static readonly Col CREAM = Col.Hex("#f9efe6");
        public static readonly Col TRAY_PANEL = Col.Hex("#f0e7df");
        public static readonly Col HUD_BROWN = Col.Hex("#b39580");
        public static readonly Col HUD_TEXT = Col.Hex("#8f857d");
        public static readonly Col EYE_INK = Col.Hex("#4a3228");
        public static readonly Col BUBBLE_SHADOW = new Col(0.45f, 0.33f, 0.25f, 0.16f);
        public static readonly Col CARD = Col.Hex("#fff8ef");
        public static readonly Col CARD_EDGE = Col.Hex("#e3d4ff");
        public static readonly Col BOARD_PANEL = Col.Hex("#ffffff");
        public static readonly Col BOARD_RIM = Col.Hex("#f1e8df");
        public static readonly Col CELL_EMPTY = Col.Hex("#f4f4f4");
        public static readonly Col CELL_DOT = Col.Hex("#d6d6d6");
        public static readonly Col INK = Col.Hex("#2b1d4e");
        public static readonly Col WHITE = Col.Hex("#ffffff");
        public static readonly Col TEXT_OUTLINE = Col.Hex("#2a1f5c");
        public static readonly Col OK_TINT = Col.Hex("#3ddc84");
        public static readonly Col INK_SOFT = Col.Hex("#7a6aa3");
        public static readonly Col BAD_TINT = Col.Hex("#ff4d6d");
        public static readonly Col STAR = Col.Hex("#ffd23f");
        public static readonly Col STAR_DARK = Col.Hex("#e8930c");
        public static readonly Col DIAMOND = Col.Hex("#3fe0ff");
        public static readonly Col ACCENT_PRIMARY = Col.Hex("#3ddc84");
        public static readonly Col ACCENT_BLUE = Col.Hex("#4fa8ff");
        public static readonly Col ACCENT_PINK = Col.Hex("#ff5fa2");
        public static readonly Col ACCENT_GOLD = Col.Hex("#ffc21a");
        public static readonly Col[] TIER_COLORS = { Col.Hex("#4fc3ff"), Col.Hex("#ff9d42"), Col.Hex("#ff5fa2"), Col.Hex("#b06bff"), Col.Hex("#e5334b") };

        public static Col TierColor(int tier) => TIER_COLORS[Mathf.Clamp(tier, 0, TIER_COLORS.Length - 1)];

        static Col[] fillColors;
        public static Col PaletteFill(int h)
        {
            if (fillColors == null)
            {
                fillColors = new Col[Palette.FILL.Length];
                for (int i = 0; i < fillColors.Length; i++) fillColors[i] = Col.Hex(Palette.FILL[i]);
            }
            return fillColors[h];
        }

        public static StyleBoxFlat Box(Col fill, float radius, float border = 0, Col? borderColor = null) => StyleBoxFlat.Box(fill, radius, border, borderColor);
        public static StyleBoxFlat BoxCorners(Col fill, float tl, float tr, float br, float bl) => StyleBoxFlat.Corners(fill, tl, tr, br, bl);

        static Vector2 V(float x, float y) => new Vector2(x, y);
        const float PI = Mathf.PI;

        // --- Buttons ---------------------------------------------------------------------------------

        public static ButtonStyles StyleButton(Col? accentOpt = null, float radius = 500, bool flat = false)
        {
            var accent = accentOpt ?? Col.TRANSPARENT;
            bool filled = accent.a > 0;
            var bas = filled ? accent : CARD;
            var ink = filled ? WHITE : INK;
            float bevel = flat ? 5 : 8;
            var edge = filled ? bas.Darkened(0.28f) : CARD_EDGE.Darkened(0.12f);
            if (flat && filled) edge = bas.Darkened(0.14f);
            var shadowCol = flat ? new Col(0.45f, 0.33f, 0.25f, 0.2f) : new Col(0.08f, 0.04f, 0.25f, 0.3f);

            var normal = StyleBoxFlat.Box(bas, radius);
            normal.shadowColor = shadowCol;
            normal.shadowSize = flat ? 5 : 8;
            normal.shadowOffset = new[] { 0f, flat ? 4f : 6f };
            normal.border = new[] { 0, 0, 0, bevel };
            normal.borderColor = edge;
            normal.margin = new[] { 18, 10, 18, 10 + bevel * 0.5f };

            var hover = normal.Duplicate();
            hover.bg = bas.Lightened(0.06f);

            var pressed = StyleBoxFlat.Box(bas.Darkened(0.06f), radius);
            pressed.shadowColor = shadowCol.WithAlpha(shadowCol.a * 0.7f);
            pressed.shadowSize = 3;
            pressed.shadowOffset = new[] { 0f, 2f };
            pressed.border = new[] { 0f, 0f, 0f, 2f };
            pressed.borderColor = edge;
            pressed.margin = new[] { 18, 10 + bevel - 2, 18, 10 - bevel * 0.5f + 2 };

            var disabled = StyleBoxFlat.Box(bas.Lerp(new Col(0.6f, 0.6f, 0.75f, 1), 0.55f), radius);
            disabled.border = new[] { 0, 0, 0, bevel };
            disabled.borderColor = disabled.bg.Darkened(0.2f);
            disabled.margin = new[] { 18f, 10f, 18f, 10f };

            return new ButtonStyles { normal = normal, hover = hover, pressed = pressed, disabled = disabled, ink = ink, outline = filled ? bas.Darkened(0.45f) : (Col?)null, pressDrop = bevel - 2 + 2 };
        }

        // --- Icons -----------------------------------------------------------------------------------

        public static void DrawIcon(CanvasItem ci, string kind, float cx, float cy, float r, Col col)
        {
            float w = Mathf.Max(3, r * 0.3f);
            Vector2 P(float dx, float dy) => V(cx + dx, cy + dy);
            switch (kind)
            {
                case "back":
                    ci.DrawStroke(new[] { P(r * 0.3f, -r * 0.62f), P(-r * 0.3f, 0), P(r * 0.3f, r * 0.62f) }, col, w);
                    break;
                case "forward":
                    ci.DrawStroke(new[] { P(-r * 0.3f, -r * 0.62f), P(r * 0.3f, 0), P(-r * 0.3f, r * 0.62f) }, col, w);
                    break;
                case "undo":
                    {
                        float ccx = cx + r * 0.08f, ccy = cy + r * 0.1f, rr = r * 0.62f;
                        ci.DrawArc(ccx, ccy, rr, -PI * 0.5f, PI * 0.78f, 28, col, w);
                        ci.DrawCircle(ccx + Mathf.Cos(PI * 0.78f) * rr, ccy + Mathf.Sin(PI * 0.78f) * rr, w * 0.5f, col);
                        ci.DrawColoredPolygon(new[] { V(ccx - rr * 0.75f, ccy - rr), V(ccx + rr * 0.05f, ccy - rr - rr * 0.6f), V(ccx + rr * 0.05f, ccy - rr + rr * 0.6f) }, col);
                        break;
                    }
                case "restart":
                    {
                        float rr = r * 0.62f;
                        float a1 = PI * 1.45f;
                        ci.DrawArc(cx, cy, rr, -PI * 0.2f, a1, 28, col, w);
                        float ex = cx + Mathf.Cos(a1) * rr, ey = cy + Mathf.Sin(a1) * rr;
                        float nx = Mathf.Cos(a1), ny = Mathf.Sin(a1);
                        float tx = -ny, ty = nx;
                        float half = rr * 0.55f;
                        ci.DrawColoredPolygon(new[] { V(ex + tx * rr * 0.75f, ey + ty * rr * 0.75f), V(ex + nx * half, ey + ny * half), V(ex - nx * half, ey - ny * half) }, col);
                        break;
                    }
                case "hint":
                    {
                        float bcx = cx, bcy = cy - r * 0.18f;
                        ci.DrawCircle(bcx, bcy, r * 0.58f, col);
                        ci.DrawStyleBox(Box(col, r * 0.12f), cx - r * 0.3f, cy + r * 0.26f, r * 0.6f, r * 0.34f);
                        ci.DrawStyleBox(Box(col, r * 0.1f), cx - r * 0.22f, cy + r * 0.66f, r * 0.44f, r * 0.2f);
                        ci.DrawArc(bcx - r * 0.05f, bcy + r * 0.02f, r * 0.3f, PI * 1.05f, PI * 1.55f, 8,
                            !col.Equals(WHITE) ? new Col(1, 1, 1, 0.75f) : new Col(1, 0.85f, 0.3f, 0.9f), w * 0.5f);
                        break;
                    }
                case "sound_on":
                case "sound_off":
                    {
                        ci.DrawColoredPolygon(new[] { P(-r * 0.75f, -r * 0.28f), P(-r * 0.35f, -r * 0.28f), P(r * 0.05f, -r * 0.68f), P(r * 0.05f, r * 0.68f), P(-r * 0.35f, r * 0.28f), P(-r * 0.75f, r * 0.28f) }, col);
                        if (kind == "sound_on")
                        {
                            ci.DrawArc(cx + r * 0.1f, cy, r * 0.42f, -PI * 0.3f, PI * 0.3f, 10, col, w * 0.8f);
                            ci.DrawArc(cx + r * 0.1f, cy, r * 0.78f, -PI * 0.3f, PI * 0.3f, 14, col, w * 0.8f);
                        }
                        else
                        {
                            ci.DrawStroke(new[] { P(r * 0.4f, -r * 0.3f), P(r * 0.95f, r * 0.3f) }, col, w * 0.8f);
                            ci.DrawStroke(new[] { P(r * 0.95f, -r * 0.3f), P(r * 0.4f, r * 0.3f) }, col, w * 0.8f);
                        }
                        break;
                    }
                case "play":
                    ci.DrawColoredPolygon(new[] { P(-r * 0.4f, -r * 0.62f), P(r * 0.62f, 0), P(-r * 0.4f, r * 0.62f) }, col);
                    break;
                case "grid":
                    {
                        float s = r * 0.5f;
                        for (int gy = 0; gy < 2; gy++)
                            for (int gx = 0; gx < 2; gx++)
                                ci.DrawStyleBox(Box(col, s * 0.25f), cx - r * 0.62f + gx * r * 0.7f, cy - r * 0.62f + gy * r * 0.7f, s, s);
                        break;
                    }
                case "home":
                    ci.DrawColoredPolygon(new[] { P(0, -r * 0.75f), P(r * 0.8f, 0), P(-r * 0.8f, 0) }, col);
                    ci.DrawStyleBox(Box(col, r * 0.1f), cx - r * 0.52f, cy - r * 0.1f, r * 1.04f, r * 0.75f);
                    break;
                case "lock":
                    DrawLock(ci, cx, cy, r * 1.2f, col, col.Darkened(0.5f));
                    break;
                case "help":
                    {
                        float hcx = cx, hcy = cy - r * 0.3f, hr = r * 0.38f;
                        ci.DrawArc(hcx, hcy, hr, PI * 1.05f, PI * 2.4f, 20, col, w);
                        var end = V(hcx + Mathf.Cos(PI * 2.4f) * hr, hcy + Mathf.Sin(PI * 2.4f) * hr);
                        ci.DrawStroke(new[] { P(-hr * 0.95f, -r * 0.3f), P(-hr * 0.95f, -r * 0.3f) }, col, w);
                        ci.DrawStroke(new[] { end, P(0, r * 0.25f) }, col, w);
                        ci.DrawCircle(cx, cy + r * 0.68f, w * 0.62f, col);
                        break;
                    }
                case "search":
                    {
                        float lcx = cx - r * 0.12f, lcy = cy - r * 0.14f;
                        ci.DrawArc(lcx, lcy, r * 0.52f, 0, PI * 2, 28, col, w * 1.1f);
                        ci.DrawStroke(new[] { V(lcx + r * 0.38f, lcy + r * 0.38f), P(r * 0.8f, r * 0.8f) }, col, w * 1.3f);
                        ci.DrawArc(lcx, lcy, r * 0.3f, PI * 1.1f, PI * 1.55f, 8, col.WithAlpha(col.a * 0.55f), w * 0.5f);
                        break;
                    }
                case "menu":
                    foreach (int k in new[] { -1, 0, 1 }) ci.DrawStroke(new[] { P(-r * 0.68f, k * r * 0.5f), P(r * 0.68f, k * r * 0.5f) }, col, w * 1.1f);
                    break;
                case "globe":
                    {
                        float gr = r * 0.8f;
                        ci.DrawArc(cx, cy, gr, 0, PI * 2, 32, col, w * 0.8f);
                        ci.DrawStroke(new[] { P(-gr, 0), P(gr, 0) }, col, w * 0.7f);
                        var mer = new List<Vector2>();
                        for (int k = 0; k < 25; k++)
                        {
                            float a = PI * 2 * k / 24;
                            mer.Add(P(Mathf.Cos(a) * gr * 0.42f, Mathf.Sin(a) * gr));
                        }
                        ci.DrawPolyline(mer, col, w * 0.7f);
                        break;
                    }
                case "close":
                    ci.DrawStroke(new[] { P(-r * 0.5f, -r * 0.5f), P(r * 0.5f, r * 0.5f) }, col, w);
                    ci.DrawStroke(new[] { P(r * 0.5f, -r * 0.5f), P(-r * 0.5f, r * 0.5f) }, col, w);
                    break;
                default:
                    ci.DrawCircle(cx, cy, r * 0.4f, col);
                    break;
            }
        }

        public static void DrawGem(CanvasItem ci, float cx, float cy, float r, Col? fillOpt = null)
        {
            var fill = fillOpt ?? DIAMOND;
            float o = r * 0.2f;
            Vector2 P(float dx, float dy) => V(cx + dx, cy + dy);
            ci.DrawColoredPolygon(new[] { P(0, -r - o), P(r * 0.82f + o, -r * 0.1f), P(0, r + o), P(-r * 0.82f - o, -r * 0.1f) }, TEXT_OUTLINE);
            ci.DrawColoredPolygon(new[] { P(0, -r), P(r * 0.82f, -r * 0.1f), P(0, r), P(-r * 0.82f, -r * 0.1f) }, fill.Darkened(0.12f));
            ci.DrawColoredPolygon(new[] { P(0, -r), P(r * 0.82f, -r * 0.1f), P(0, r * 0.05f), P(-r * 0.82f, -r * 0.1f) }, fill.Lightened(0.25f));
            ci.DrawCircle(cx - r * 0.22f, cy - r * 0.42f, r * 0.14f, new Col(1, 1, 1, 0.9f));
        }

        // --- Board -----------------------------------------------------------------------------------

        public const float BOARD_REVEAL = 14;
        public const float BOARD_REVEAL_FRAC = 0.3f;
        public const float BOARD_SHADOW_REACH = 14;

        public static void DrawBoard(CanvasItem ci, IReadOnlyList<Vec> cells, float originX, float originY, float cellSize)
        {
            if (cells.Count == 0) return;
            int minX = int.MaxValue, minY = int.MaxValue, maxX = int.MinValue, maxY = int.MinValue;
            foreach (var c in cells)
            {
                minX = Mathf.Min(minX, c.x); minY = Mathf.Min(minY, c.y);
                maxX = Mathf.Max(maxX, c.x); maxY = Mathf.Max(maxY, c.y);
            }
            float tlx = Js.Round(originX + minX * cellSize);
            float tly = Js.Round(originY + minY * cellSize);
            float spanW = (maxX - minX + 1) * cellSize;
            float spanH = (maxY - minY + 1) * cellSize;
            float reveal = Mathf.Max(BOARD_REVEAL, cellSize * BOARD_REVEAL_FRAC);
            float fx = tlx - reveal, fy = tly - reveal, fw = spanW + reveal * 2, fh = spanH + reveal * 2;
            float frameR = Js.Round(cellSize * 0.2f) + reveal * 0.4f;
            ci.DrawStyleBox(Box(new Col(0.45f, 0.33f, 0.25f, 0.1f), frameR + 4), fx - 4, fy + 6 - 4, fw + 8, fh + 8);
            ci.DrawStyleBox(Box(BOARD_PANEL, frameR), fx, fy, fw, fh);
            float inset = Mathf.Max(1.5f, cellSize * PolyShape.OUTLINE_W * 0.5f);
            float tileR = Js.Round(cellSize * 0.2f);
            float dotR = Mathf.Max(2, cellSize * 0.04f);
            foreach (var c in cells)
            {
                float x = originX + c.x * cellSize + inset;
                float y = originY + c.y * cellSize + inset;
                float s = cellSize - inset * 2;
                ci.DrawStyleBox(Box(CELL_EMPTY, tileR), x, y, s, s);
                ci.DrawCircle(x + s / 2, y + s / 2, dotR, CELL_DOT);
            }
        }

        public static void DrawDashedRoundRect(CanvasItem ci, float x, float y, float w, float h, float radius, Col color, float width, float dash, float gap)
        {
            float r = Mathf.Min(radius, Mathf.Min(w, h) * 0.5f);
            float ex = x + w, ey = y + h;
            var arcs = new[] { (ex - r, y + r, -PI * 0.5f), (ex - r, ey - r, 0f), (x + r, ey - r, PI * 0.5f), (x + r, y + r, PI) };
            var pts = new List<Vector2>();
            foreach (var (acx, acy, a0) in arcs)
                for (int s = 0; s < 9; s++)
                {
                    float a = a0 + PI * 0.5f * s / 8;
                    pts.Add(V(acx + Mathf.Cos(a) * r, acy + Mathf.Sin(a) * r));
                }
            pts.Add(pts[0]);
            bool drawing = true;
            float remain = dash;
            for (int i = 0; i < pts.Count - 1; i++)
            {
                var a = pts[i];
                var b = pts[i + 1];
                float seg = Js.Hypot(b.x - a.x, b.y - a.y);
                if (seg < 0.001f) continue;
                float pos = 0;
                while (pos < seg)
                {
                    float step = Mathf.Min(remain, seg - pos);
                    if (drawing)
                    {
                        float t0 = pos / seg, t1 = (pos + step) / seg;
                        ci.DrawLine(a.x + (b.x - a.x) * t0, a.y + (b.y - a.y) * t0, a.x + (b.x - a.x) * t1, a.y + (b.y - a.y) * t1, color, width);
                    }
                    pos += step;
                    remain -= step;
                    if (remain <= 0.001f)
                    {
                        drawing = !drawing;
                        remain = drawing ? dash : gap;
                    }
                }
            }
        }

        public static void DrawCellHighlight(CanvasItem ci, float x, float y, float size, Col tint)
            => ci.DrawStyleBox(Box(tint.WithAlpha(0.55f), size * 0.24f), x, y, size, size);

        // --- Pieces ----------------------------------------------------------------------------------

        static List<Vector2> Shift(List<Vector2> p, float ox, float oy)
        {
            var l = new List<Vector2>(p.Count + 1);
            foreach (var q in p) l.Add(V(q.x + ox, q.y + oy));
            return l;
        }

        static void FillPolys(CanvasItem ci, List<List<Vector2>> polys, float ox, float oy, Col col)
        {
            foreach (var p in polys)
            {
                if (p.Count < 3) continue;
                var pts = Shift(p, ox, oy);
                ci.DrawColoredPolygon(pts, col);
                var closed = new List<Vector2>(pts) { pts[0] };
                ci.DrawPolyline(closed, col, PolyShape.AA_FEATHER);
            }
        }

        public static void DrawGhost(CanvasItem ci, float ox, float oy, float cs, IReadOnlyList<Vec> cells, Col fill, Col rim)
        {
            var geo = PolyShape.Geometry(cells, cs);
            FillPolys(ci, geo.outer, ox, oy, rim);
            FillPolys(ci, geo.body, ox, oy, fill);
        }

        public static void DrawPolyomino(CanvasItem ci, float ox, float oy, float cs, IReadOnlyList<Vec> cells, int colorId, Vec eye, int mood, int target, bool unhappy, PolyominoOptions opts = default)
        {
            if (cells.Count == 0) return;
            float alpha = opts.alpha ?? 1;
            var body = PaletteFill(colorId).WithAlpha(alpha);
            var geo = PolyShape.Geometry(cells, cs);
            FillPolys(ci, geo.body, ox, oy, body);
            DrawEyes(ci, ox + eye.x * cs, oy + eye.y * cs, cs, cs, alpha, opts.blink ?? 0, opts.happyEyes);
            if (mood != Mood.NEUTRAL)
            {
                var at = BubbleAttach(ox, oy, cs, cells);
                DrawThought(ci, at.x, at.y, cs, mood, target, alpha);
            }
            if (unhappy)
            {
                float pulse = Mathf.Clamp01(opts.ringPulse ?? 1);
                var ringCol = BAD_TINT.WithAlpha(alpha * pulse);
                float ringW = Mathf.Max(3, cs * 0.07f);
                foreach (var p in geo.ring)
                {
                    if (p.Count < 2) continue;
                    var pts = Shift(p, ox, oy);
                    pts.Add(pts[0]);
                    ci.DrawPolyline(pts, ringCol, ringW);
                }
            }
        }

        public static void DrawUnhappyRing(CanvasItem ci, float ox, float oy, float cs, IReadOnlyList<Vec> cells, float alpha = 1)
        {
            var geo = PolyShape.Geometry(cells, cs);
            var ringCol = BAD_TINT.WithAlpha(alpha);
            float ringW = Mathf.Max(3, cs * 0.07f);
            foreach (var p in geo.ring)
            {
                if (p.Count < 2) continue;
                var pts = Shift(p, ox, oy);
                pts.Add(pts[0]);
                ci.DrawPolyline(pts, ringCol, ringW);
            }
        }

        static Vector2 BubbleAttach(float ox, float oy, float cs, IReadOnlyList<Vec> cells)
        {
            var top = cells[0];
            foreach (var c in cells) if (c.y < top.y || (c.y == top.y && c.x > top.x)) top = c;
            return V(ox + (top.x + 0.92f) * cs, oy + (top.y + 0.08f) * cs);
        }

        public static void DrawEyes(CanvasItem ci, float x, float y, float w, float h, float alpha, float blink = 0, bool happy = false)
        {
            float s = Mathf.Min(w, h);
            float cx = x + w / 2, cy = y + h / 2 - s * 0.02f;
            float eyeR = s * 0.165f, sep = s * 0.27f;
            var ink = EYE_INK.WithAlpha(alpha);
            foreach (int side in new[] { -1, 1 })
            {
                float ecx = cx + side * sep, ecy = cy;
                if (happy)
                {
                    ci.DrawArc(ecx, ecy + eyeR * 0.35f, eyeR * 0.62f, PI * 1.12f, PI * 1.88f, 14, ink, Mathf.Max(2, eyeR * 0.3f));
                    continue;
                }
                float sy = Mathf.Clamp(1 - blink, 0.08f, 1);
                if (sy <= 0.15f)
                {
                    ci.DrawLine(ecx - eyeR * 0.8f, ecy, ecx + eyeR * 0.8f, ecy, ink, Mathf.Max(2, eyeR * 0.22f));
                    continue;
                }
                Ellipse(ci, ecx, ecy, eyeR, eyeR * sy, new Col(1, 1, 1, alpha));
                float px = ecx + side * eyeR * 0.04f, py = ecy + eyeR * 0.06f * sy;
                Ellipse(ci, px, py, eyeR * 0.66f, eyeR * 0.66f * sy, ink);
                if (sy > 0.5f) ci.DrawCircle(px - eyeR * 0.2f, py - eyeR * 0.24f * sy, eyeR * 0.17f, new Col(1, 1, 1, alpha));
            }
        }

        static void Ellipse(CanvasItem ci, float cx, float cy, float rx, float ry, Col col)
        {
            if (Mathf.Abs(rx - ry) < 0.01f) { ci.DrawCircle(cx, cy, rx, col); return; }
            var pts = new List<Vector2>();
            const int n = 22;
            for (int i = 0; i < n; i++)
            {
                float a = PI * 2 * i / n;
                pts.Add(V(cx + Mathf.Cos(a) * rx, cy + Mathf.Sin(a) * ry));
            }
            ci.DrawColoredPolygon(pts, col);
        }

        public const float THOUGHT_R = 0.29f;
        public const float THOUGHT_DX = 0;
        public const float THOUGHT_DY = -0.55f;
        public const float THOUGHT_OUTLINE = 0;

        public static Vector2 ThoughtOverhangCells()
        {
            float reach = THOUGHT_R + THOUGHT_OUTLINE;
            float right = 0.92f + THOUGHT_R * THOUGHT_DX + reach - 1;
            float top = -(0.08f + THOUGHT_R * THOUGHT_DY - reach);
            return V(Mathf.Max(right, 0), Mathf.Max(top, 0));
        }

        public static void DrawThought(CanvasItem ci, float ax, float ay, float cs, int mood, int target, float alpha)
        {
            float r = cs * THOUGHT_R;
            float bx = ax + r * THOUGHT_DX, by = ay + r * THOUGHT_DY;
            var white = new Col(1, 1, 1, alpha);
            var shadow = BUBBLE_SHADOW.WithAlpha(BUBBLE_SHADOW.a * alpha);
            float tx = ax - r * 0.3f, ty = ay + r * 0.42f;
            float mx = ax + (bx - ax) * 0.5f - r * 0.1f, my = ay + (by - ay) * 0.5f + r * 0.3f;
            float sh = Mathf.Max(1.5f, r * 0.1f);
            ci.DrawCircle(tx, ty + sh, r * 0.14f, shadow);
            ci.DrawCircle(mx, my + sh, r * 0.2f, shadow);
            ci.DrawCircle(bx, by + sh, r * 1.02f, shadow);
            ci.DrawCircle(tx, ty, r * 0.14f, white);
            ci.DrawCircle(mx, my, r * 0.2f, white);
            ci.DrawCircle(bx, by, r, white);
            var icon = PaletteFill(target).WithAlpha(alpha);
            if (mood == Mood.AFFECTIONATE) DrawHeart(ci, bx, by - r * 0.04f, r * 0.78f, icon);
            else DrawBolt(ci, bx, by, r * 0.82f, icon);
        }

        public static void DrawHeart(CanvasItem ci, float cx, float cy, float s, Col color)
        {
            ci.DrawCircle(cx - s * 0.28f, cy - s * 0.12f, s * 0.32f, color);
            ci.DrawCircle(cx + s * 0.28f, cy - s * 0.12f, s * 0.32f, color);
            ci.DrawColoredPolygon(new[] { V(cx - s * 0.57f, cy - s * 0.02f), V(cx, cy + s * 0.62f), V(cx + s * 0.57f, cy - s * 0.02f) }, color);
        }

        public static void DrawBolt(CanvasItem ci, float cx, float cy, float s, Col color)
        {
            ci.DrawColoredPolygon(new[]
            {
                V(cx - s * 0.05f, cy - s * 0.7f), V(cx + s * 0.38f, cy - s * 0.08f), V(cx + s * 0.08f, cy - s * 0.08f),
                V(cx + s * 0.18f, cy + s * 0.7f), V(cx - s * 0.4f, cy - s * 0.02f), V(cx - s * 0.08f, cy - s * 0.02f),
            }, color);
        }

        // --- Stars, gift, lock -----------------------------------------------------------------------

        static List<Vector2> StarPoints(float cx, float cy, float r, float inner = 0.46f)
        {
            var pts = new List<Vector2>();
            for (int i = 0; i < 5; i++)
            {
                float a = -PI / 2 + i * PI * 2 / 5;
                pts.Add(V(cx + Mathf.Cos(a) * r, cy + Mathf.Sin(a) * r));
                float b = a + PI * 2 / 10;
                pts.Add(V(cx + Mathf.Cos(b) * r * inner, cy + Mathf.Sin(b) * r * inner));
            }
            return pts;
        }

        public static void DrawStar(CanvasItem ci, float cx, float cy, float r, Col fill) => ci.DrawColoredPolygon(StarPoints(cx, cy, r), fill);

        public static void DrawStarFancy(CanvasItem ci, float cx, float cy, float r, bool filled)
        {
            float o = Mathf.Max(2, r * 0.16f);
            ci.DrawColoredPolygon(StarPoints(cx, cy + o * 0.8f, r + o), TEXT_OUTLINE.WithAlpha(0.35f));
            ci.DrawColoredPolygon(StarPoints(cx, cy, r + o), TEXT_OUTLINE);
            if (!filled)
            {
                ci.DrawColoredPolygon(StarPoints(cx, cy, r), Col.Hex("#4a3f86"));
                return;
            }
            ci.DrawColoredPolygon(StarPoints(cx, cy, r), STAR_DARK);
            ci.DrawColoredPolygon(StarPoints(cx, cy - r * 0.06f, r * 0.86f), STAR);
            ci.DrawCircle(cx - r * 0.22f, cy - r * 0.3f, r * 0.12f, new Col(1, 1, 1, 0.85f));
        }

        public static void DrawGift(CanvasItem ci, float cx, float cy, float s)
        {
            var red = Col.Hex("#d65c5c");
            var redDark = Col.Hex("#bf4a4a");
            var gold = Col.Hex("#f2b84b");
            float bodyX = cx - s * 0.42f, bodyY = cy - s * 0.06f, bodyW = s * 0.84f, bodyH = s * 0.5f;
            float lidX = cx - s * 0.48f, lidY = cy - s * 0.28f, lidW = s * 0.96f, lidH = s * 0.26f;
            float g = s * 0.02f;
            ci.DrawStyleBox(Box(new Col(0.45f, 0.33f, 0.25f, 0.14f), s * 0.08f), bodyX - g, bodyY - g + s * 0.05f, bodyW + g * 2, bodyH + g * 2);
            ci.DrawStyleBox(Box(red, s * 0.07f), bodyX, bodyY, bodyW, bodyH);
            ci.DrawStyleBox(Box(redDark, s * 0.07f), bodyX, bodyY + bodyH - s * 0.1f, bodyW, s * 0.1f);
            ci.DrawStyleBox(Box(red, s * 0.07f), lidX, lidY, lidW, lidH);
            float rw = s * 0.16f;
            ci.DrawRect(cx - rw * 0.5f, bodyY, rw, bodyH, gold);
            ci.DrawRect(cx - rw * 0.5f, lidY, rw, lidH, gold);
            float bowY = cy - s * 0.3f;
            ci.DrawArc(cx - s * 0.13f, bowY - s * 0.07f, s * 0.12f, 0, PI * 2, 20, gold, Mathf.Max(2, s * 0.05f));
            ci.DrawArc(cx + s * 0.13f, bowY - s * 0.07f, s * 0.12f, 0, PI * 2, 20, gold, Mathf.Max(2, s * 0.05f));
            ci.DrawCircle(cx, bowY, s * 0.06f, gold);
        }

        public static void DrawLock(CanvasItem ci, float cx, float cy, float r, Col fill, Col outline)
        {
            float bodyR = r * 0.42f;
            float shackleY = cy - bodyR * 0.9f;
            float shackleR = bodyR * 0.55f;
            float w = Mathf.Max(2, r * 0.18f);
            ci.DrawArc(cx, shackleY, shackleR, PI, PI * 2, 12, fill, w);
            ci.DrawLine(cx - shackleR, shackleY, cx - shackleR, shackleY + bodyR * 0.6f, fill, w);
            ci.DrawLine(cx + shackleR, shackleY, cx + shackleR, shackleY + bodyR * 0.6f, fill, w);
            ci.DrawStyleBox(Box(fill, r * 0.18f), cx - bodyR, cy - bodyR * 0.4f, bodyR * 2, bodyR * 1.6f);
            ci.DrawCircle(cx, cy + bodyR * 0.3f, bodyR * 0.2f, outline);
        }
    }
}
