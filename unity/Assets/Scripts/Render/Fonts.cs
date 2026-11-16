// Fonts and text layout (port of src/render/Fonts.ts): Fredoka 600 / 400 with Noto Sans as the per-glyph fallback,
// Godot's line metrics, word wrap and outline/shadow labels, drawn through Canvas2D from real glyph outlines.
using System;
using System.Collections.Generic;
using UnityEngine;

namespace CozyBlocks.Render
{
    public enum FontKind { Bold, Thin }
    public enum HAlign { Left, Center, Right }

    public struct LabelStyle
    {
        public float size;
        public Col color;
        public FontKind kind;
        public float outlineSize;
        public Col outlineColor;
        public Col shadowColor;
        public float shadowY;
        public float shadowOutline;
    }

    public static class Fonts
    {
        const float NOTO_ASCENT = 1.069f;
        const float NOTO_DESCENT = 0.293f;
        const float OUTLINE_K = 0.25f;

        static TtfFont fredBold, fredThin, notoBold, notoRegular;
        static bool loaded;

        public static void Load()
        {
            if (loaded) return;
            loaded = true;
            fredBold = Read("Fonts/Fredoka-600");
            fredThin = Read("Fonts/Fredoka-400");
            notoBold = Read("Fonts/NotoSans-Bold");
            notoRegular = Read("Fonts/NotoSans-Regular");
        }

        static TtfFont Read(string path)
        {
            var ta = Resources.Load<TextAsset>(path);
            if (ta == null) throw new Exception("missing font " + path);
            return new TtfFont(ta.bytes);
        }

        public static TtfFont Primary(FontKind k) { Load(); return k == FontKind.Bold ? fredBold : fredThin; }
        public static TtfFont Fallback(FontKind k) { Load(); return k == FontKind.Bold ? notoBold : notoRegular; }

        public static float Ascent(float size) => Mathf.Ceil(NOTO_ASCENT * size);
        public static float Descent(float size) => Mathf.Ceil(NOTO_DESCENT * size);
        public static float LineHeight(float size) => Ascent(size) + Descent(size);

        static readonly Dictionary<string, float> widthCache = new Dictionary<string, float>();

        public static float TextWidth(string text, FontKind kind, float size)
        {
            string key = $"{(int)kind}|{size}|{text}";
            if (!widthCache.TryGetValue(key, out float w))
            {
                w = Mathf.Floor(TextLayout.Measure(Primary(kind), Fallback(kind), text, size) + 0.5f);
                if (widthCache.Count > 4000) widthCache.Clear();
                widthCache[key] = w;
            }
            return w;
        }

        /// <summary>Raw (unrounded) advance width, what fillText actually lays out.</summary>
        public static float RawWidth(string text, FontKind kind, float size) => TextLayout.Measure(Primary(kind), Fallback(kind), text, size);

        public static List<string> WrapText(string text, FontKind kind, float size, float maxW)
        {
            var o = new List<string>();
            foreach (var para in text.Split('\n'))
            {
                if (maxW <= 0 || TextWidth(para, kind, size) <= maxW) { o.Add(para); continue; }
                string line = "";
                foreach (var word in para.Split(' '))
                {
                    string trial = line.Length > 0 ? line + " " + word : word;
                    if (TextWidth(trial, kind, size) <= maxW) { line = trial; continue; }
                    if (line.Length > 0) o.Add(line);
                    if (TextWidth(word, kind, size) <= maxW) { line = word; continue; }
                    line = "";
                    foreach (char ch in word)
                    {
                        if (TextWidth(line + ch, kind, size) > maxW && line.Length > 0) { o.Add(line); line = ch.ToString(); }
                        else line += ch;
                    }
                }
                o.Add(line);
            }
            return o;
        }

        public static float FitFontSize(string text, float maxW, float maxH, float start, float minSize, bool wrap = false, FontKind kind = FontKind.Bold)
        {
            float fs = start;
            while (fs > minSize)
            {
                float w = 0, h;
                if (wrap)
                {
                    var lines = WrapText(text, kind, fs, maxW);
                    foreach (var l in lines) w = Mathf.Max(w, TextWidth(l, kind, fs));
                    h = lines.Count * LineHeight(fs);
                }
                else
                {
                    var lines = text.Split('\n');
                    foreach (var l in lines) w = Mathf.Max(w, TextWidth(l, kind, fs));
                    h = lines.Length * LineHeight(fs);
                }
                if (w <= maxW && (maxH <= 0 || h <= maxH)) break;
                fs--;
            }
            return fs;
        }

        static readonly Col TEXT_OUTLINE = Col.Hex("#2a1f5c");

        public static LabelStyle Style(float size, Col? color = null, Col? outline = null, float outlineSize = -1, FontKind kind = FontKind.Bold)
        {
            var oc = outline ?? TEXT_OUTLINE;
            float o = outlineSize >= 0 ? outlineSize : Mathf.Max(4, (float)Math.Truncate(size * 0.22f));
            bool has = o > 0;
            return new LabelStyle
            {
                size = size, color = color ?? Col.WHITE, kind = kind,
                outlineSize = has ? o : 0, outlineColor = oc,
                shadowColor = has ? oc.WithAlpha(0.55f) : Col.TRANSPARENT,
                shadowY = has ? Mathf.Max(2, (float)Math.Truncate(size * 0.08f)) : 0,
                shadowOutline = has ? o : 0,
            };
        }

        public static void DrawLabelLine(CanvasItem ci, string text, float x, float y, float boxW, HAlign align, LabelStyle st)
        {
            var ctx = ci.ctx;
            var pf = Primary(st.kind);
            var ff = Fallback(st.kind);
            ctx.Join = LineJoin.Round;
            ctx.MiterLimit = 2;
            float w = TextWidth(text, st.kind, st.size);
            float tx = align == HAlign.Center ? x + (boxW - w) / 2 : align == HAlign.Right ? x + boxW - w : x;
            float ty = y + Ascent(st.size);
            if (st.shadowColor.a > 0)
            {
                if (st.shadowOutline > 0)
                {
                    ctx.StrokeColor = st.shadowColor;
                    ctx.LineWidth = st.shadowOutline * OUTLINE_K * 2;
                    ctx.StrokeText(pf, ff, text, tx, ty + st.shadowY, st.size);
                }
                ctx.FillColor = st.shadowColor;
                ctx.FillText(pf, ff, text, tx, ty + st.shadowY, st.size);
            }
            if (st.outlineSize > 0 && st.outlineColor.a > 0)
            {
                ctx.StrokeColor = st.outlineColor;
                ctx.LineWidth = st.outlineSize * OUTLINE_K * 2;
                ctx.StrokeText(pf, ff, text, tx, ty, st.size);
            }
            ctx.FillColor = st.color;
            ctx.FillText(pf, ff, text, tx, ty, st.size);
        }

        public static float DrawLabel(CanvasItem ci, string text, float x, float y, float boxW, HAlign align, LabelStyle st, float wrapAt = 0)
        {
            var lines = wrapAt > 0 ? WrapText(text, st.kind, st.size, wrapAt) : new List<string>(text.Split('\n'));
            float lh = LineHeight(st.size);
            for (int i = 0; i < lines.Count; i++) DrawLabelLine(ci, lines[i], x, y + i * lh, boxW, align, st);
            return lines.Count * lh;
        }

        public static void DrawString(CanvasItem ci, string text, float x, float baselineY, float boxW, HAlign align, FontKind kind, float size, Col color)
        {
            var ctx = ci.ctx;
            float w = TextWidth(text, kind, size);
            float tx = align == HAlign.Center ? x + (boxW - w) / 2 : align == HAlign.Right ? x + boxW - w : x;
            ctx.FillColor = color;
            ctx.FillText(Primary(kind), Fallback(kind), text, tx, baselineY, size);
        }
    }
}
