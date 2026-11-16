// A small TrueType reader: cmap (4/12), hmtx, glyf/loca outlines (simple + composite) and GPOS pair kerning
// (lookup types 2 and 9), so text is drawn from real glyph outlines through Canvas2D, with the same advances and
// kerning a browser canvas applies.
using System;
using System.Collections.Generic;
using UnityEngine;

namespace CozyBlocks.Render
{
    public sealed class TtfFont
    {
        readonly byte[] d;
        readonly Dictionary<string, int> tables = new Dictionary<string, int>();
        public int unitsPerEm = 1000;
        int numGlyphs, numHMetrics, locFormat;
        int locaOff, glyfOff, hmtxOff;
        readonly Dictionary<int, int> cmap = new Dictionary<int, int>();
        readonly Dictionary<long, short> kern = new Dictionary<long, short>();
        // class-based kerning subtables
        readonly List<ClassKern> classKerns = new List<ClassKern>();
        readonly Dictionary<int, List<(Vector2[] pts, bool[] on, int[] ends)>> glyphCache = new Dictionary<int, List<(Vector2[], bool[], int[])>>();

        sealed class ClassKern
        {
            public HashSet<int> coverage;
            public Dictionary<int, int> class1, class2;
            public int class2Count;
            public short[] values;
        }

        int U8(int o) => d[o];
        int U16(int o) => (d[o] << 8) | d[o + 1];
        short S16(int o) => (short)((d[o] << 8) | d[o + 1]);
        int U32(int o) => (d[o] << 24) | (d[o + 1] << 16) | (d[o + 2] << 8) | d[o + 3];

        public TtfFont(byte[] data)
        {
            d = data;
            int n = U16(4);
            for (int i = 0; i < n; i++)
            {
                int rec = 12 + i * 16;
                string tag = System.Text.Encoding.ASCII.GetString(d, rec, 4);
                tables[tag] = U32(rec + 8);
            }
            int head = tables["head"];
            unitsPerEm = U16(head + 18);
            locFormat = S16(head + 50);
            numGlyphs = U16(tables["maxp"] + 4);
            numHMetrics = U16(tables["hhea"] + 34);
            hmtxOff = tables["hmtx"];
            locaOff = tables["loca"];
            glyfOff = tables["glyf"];
            ReadCmap(tables["cmap"]);
            if (tables.TryGetValue("GPOS", out int gpos)) { try { ReadGpos(gpos); } catch (Exception e) { Debug.LogWarning("GPOS: " + e.Message); } }
        }

        void ReadCmap(int off)
        {
            int n = U16(off + 2);
            int best = -1, bestFmt = 0;
            for (int i = 0; i < n; i++)
            {
                int pid = U16(off + 4 + i * 8), eid = U16(off + 6 + i * 8);
                int sub = off + U32(off + 8 + i * 8);
                int fmt = U16(sub);
                bool unicode = pid == 0 || (pid == 3 && (eid == 1 || eid == 10));
                if (!unicode) continue;
                if (fmt == 12 && bestFmt != 12) { best = sub; bestFmt = 12; }
                else if (fmt == 4 && best < 0) { best = sub; bestFmt = 4; }
            }
            if (best < 0) return;
            if (bestFmt == 4)
            {
                int segX2 = U16(best + 6);
                int ends = best + 14, starts = ends + segX2 + 2, deltas = starts + segX2, ranges = deltas + segX2;
                for (int s = 0; s < segX2 / 2; s++)
                {
                    int end = U16(ends + s * 2), start = U16(starts + s * 2);
                    int delta = S16(deltas + s * 2), ro = U16(ranges + s * 2);
                    for (int c = start; c <= end && c != 0xFFFF; c++)
                    {
                        int g;
                        if (ro == 0) g = (c + delta) & 0xFFFF;
                        else
                        {
                            int gi = ranges + s * 2 + ro + (c - start) * 2;
                            g = U16(gi);
                            if (g != 0) g = (g + delta) & 0xFFFF;
                        }
                        if (g != 0) cmap[c] = g;
                    }
                }
            }
            else
            {
                int groups = U32(best + 12);
                for (int i = 0; i < groups; i++)
                {
                    int g = best + 16 + i * 12;
                    int sc = U32(g), ec = U32(g + 4), sg = U32(g + 8);
                    for (int c = sc; c <= ec; c++) cmap[c] = sg + (c - sc);
                }
            }
        }

        public int GlyphIndex(int codepoint) => cmap.TryGetValue(codepoint, out int g) ? g : 0;
        public bool Has(int codepoint) => cmap.ContainsKey(codepoint);

        public int Advance(int gid)
        {
            if (gid < numHMetrics) return U16(hmtxOff + gid * 4);
            return U16(hmtxOff + (numHMetrics - 1) * 4);
        }

        public int Kerning(int left, int right)
        {
            if (kern.TryGetValue(((long)left << 16) | (uint)right, out short v)) return v;
            foreach (var ck in classKerns)
            {
                if (!ck.coverage.Contains(left)) continue;
                int c1 = ck.class1.TryGetValue(left, out int a) ? a : 0;
                int c2 = ck.class2.TryGetValue(right, out int b) ? b : 0;
                int idx = c1 * ck.class2Count + c2;
                if (idx < ck.values.Length) return ck.values[idx];
                return 0;
            }
            return 0;
        }

        // --- GPOS pair kerning --------------------------------------------------------------------------

        void ReadGpos(int off)
        {
            int featList = off + U16(off + 6);
            int lookupList = off + U16(off + 8);
            // Lookups referenced by the 'kern' feature.
            var kernLookups = new HashSet<int>();
            int fc = U16(featList);
            for (int i = 0; i < fc; i++)
            {
                string tag = System.Text.Encoding.ASCII.GetString(d, featList + 2 + i * 6, 4);
                int fo = featList + U16(featList + 6 + i * 6);
                if (tag != "kern") continue;
                int lc = U16(fo + 2);
                for (int k = 0; k < lc; k++) kernLookups.Add(U16(fo + 4 + k * 2));
            }
            int nl = U16(lookupList);
            for (int li = 0; li < nl; li++)
            {
                if (!kernLookups.Contains(li)) continue;
                int lo = lookupList + U16(lookupList + 2 + li * 2);
                int type = U16(lo);
                int sc = U16(lo + 4);
                for (int s = 0; s < sc; s++)
                {
                    int so = lo + U16(lo + 6 + s * 2);
                    int t = type;
                    if (t == 9)
                    {
                        t = U16(so + 2);
                        so = so + U32(so + 4);
                    }
                    if (t == 2) ReadPairPos(so);
                }
            }
        }

        HashSet<int> ReadCoverage(int o)
        {
            var set = new HashSet<int>();
            int fmt = U16(o);
            if (fmt == 1)
            {
                int c = U16(o + 2);
                for (int i = 0; i < c; i++) set.Add(U16(o + 4 + i * 2));
            }
            else if (fmt == 2)
            {
                int c = U16(o + 2);
                for (int i = 0; i < c; i++)
                {
                    int r = o + 4 + i * 6;
                    for (int g = U16(r); g <= U16(r + 2); g++) set.Add(g);
                }
            }
            return set;
        }

        List<int> CoverageList(int o)
        {
            var list = new List<int>();
            int fmt = U16(o);
            if (fmt == 1)
            {
                int c = U16(o + 2);
                for (int i = 0; i < c; i++) list.Add(U16(o + 4 + i * 2));
            }
            else if (fmt == 2)
            {
                int c = U16(o + 2);
                for (int i = 0; i < c; i++)
                {
                    int r = o + 4 + i * 6;
                    for (int g = U16(r); g <= U16(r + 2); g++) list.Add(g);
                }
            }
            return list;
        }

        Dictionary<int, int> ReadClassDef(int o)
        {
            var m = new Dictionary<int, int>();
            int fmt = U16(o);
            if (fmt == 1)
            {
                int start = U16(o + 2), c = U16(o + 4);
                for (int i = 0; i < c; i++) m[start + i] = U16(o + 6 + i * 2);
            }
            else if (fmt == 2)
            {
                int c = U16(o + 2);
                for (int i = 0; i < c; i++)
                {
                    int r = o + 4 + i * 6;
                    int cls = U16(r + 4);
                    for (int g = U16(r); g <= U16(r + 2); g++) m[g] = cls;
                }
            }
            return m;
        }

        static int ValueSize(int vf)
        {
            int n = 0;
            for (int i = 0; i < 8; i++) if ((vf & (1 << i)) != 0) n++;
            return n * 2;
        }

        /// <summary>XAdvance of a value record (only that matters for horizontal kerning).</summary>
        short XAdvance(int o, int vf)
        {
            int p = o;
            if ((vf & 1) != 0) p += 2;
            if ((vf & 2) != 0) p += 2;
            if ((vf & 4) != 0) return S16(p);
            return 0;
        }

        void ReadPairPos(int o)
        {
            int fmt = U16(o);
            int cov = o + U16(o + 2);
            int vf1 = U16(o + 4), vf2 = U16(o + 6);
            int s1 = ValueSize(vf1), s2 = ValueSize(vf2);
            if ((vf1 & 4) == 0) return;
            if (fmt == 1)
            {
                var firsts = CoverageList(cov);
                int setCount = U16(o + 8);
                for (int i = 0; i < setCount && i < firsts.Count; i++)
                {
                    int ps = o + U16(o + 10 + i * 2);
                    int pc = U16(ps);
                    int rec = 2 + s1 + s2;
                    for (int k = 0; k < pc; k++)
                    {
                        int r = ps + 2 + k * rec;
                        int second = U16(r);
                        short v = XAdvance(r + 2, vf1);
                        long key = ((long)firsts[i] << 16) | (uint)second;
                        if (!kern.ContainsKey(key)) kern[key] = v;
                    }
                }
            }
            else if (fmt == 2)
            {
                var ck = new ClassKern
                {
                    coverage = ReadCoverage(cov),
                    class1 = ReadClassDef(o + U16(o + 8)),
                    class2 = ReadClassDef(o + U16(o + 10)),
                };
                int c1n = U16(o + 12), c2n = U16(o + 14);
                ck.class2Count = c2n;
                ck.values = new short[c1n * c2n];
                int rec = s1 + s2;
                for (int a = 0; a < c1n; a++)
                    for (int b = 0; b < c2n; b++)
                        ck.values[a * c2n + b] = XAdvance(o + 16 + (a * c2n + b) * rec, vf1);
                classKerns.Add(ck);
            }
        }

        // --- outlines ------------------------------------------------------------------------------------

        int GlyphOffset(int gid, out int len)
        {
            int a, b;
            if (locFormat == 0) { a = U16(locaOff + gid * 2) * 2; b = U16(locaOff + gid * 2 + 2) * 2; }
            else { a = U32(locaOff + gid * 4); b = U32(locaOff + gid * 4 + 4); }
            len = b - a;
            return glyfOff + a;
        }

        List<(Vector2[] pts, bool[] on, int[] ends)> Contours(int gid, int depth = 0)
        {
            if (glyphCache.TryGetValue(gid, out var hit)) return hit;
            var result = new List<(Vector2[], bool[], int[])>();
            if (gid < 0 || gid >= numGlyphs || depth > 8) return result;
            int o = GlyphOffset(gid, out int len);
            if (len <= 0) { glyphCache[gid] = result; return result; }
            int nc = S16(o);
            if (nc >= 0)
            {
                var ends = new int[nc];
                for (int i = 0; i < nc; i++) ends[i] = U16(o + 10 + i * 2);
                int np = nc > 0 ? ends[nc - 1] + 1 : 0;
                int insLen = U16(o + 10 + nc * 2);
                int p = o + 12 + nc * 2 + insLen;
                var flags = new byte[np];
                for (int i = 0; i < np;)
                {
                    byte f = d[p++];
                    flags[i++] = f;
                    if ((f & 8) != 0)
                    {
                        int rep = d[p++];
                        for (int r = 0; r < rep && i < np; r++) flags[i++] = f;
                    }
                }
                var pts = new Vector2[np];
                var on = new bool[np];
                int x = 0;
                for (int i = 0; i < np; i++)
                {
                    byte f = flags[i];
                    if ((f & 2) != 0) { int dx = d[p++]; x += (f & 16) != 0 ? dx : -dx; }
                    else if ((f & 16) == 0) { x += S16(p); p += 2; }
                    pts[i].x = x;
                    on[i] = (f & 1) != 0;
                }
                int y = 0;
                for (int i = 0; i < np; i++)
                {
                    byte f = flags[i];
                    if ((f & 4) != 0) { int dy = d[p++]; y += (f & 32) != 0 ? dy : -dy; }
                    else if ((f & 32) == 0) { y += S16(p); p += 2; }
                    pts[i].y = y;
                }
                result.Add((pts, on, ends));
            }
            else
            {
                int p = o + 10;
                for (;;)
                {
                    int flags = U16(p), glyph = U16(p + 2);
                    p += 4;
                    float dx, dy;
                    if ((flags & 1) != 0) { dx = S16(p); dy = S16(p + 2); p += 4; }
                    else { dx = (sbyte)d[p]; dy = (sbyte)d[p + 1]; p += 2; }
                    float a = 1, b = 0, c = 0, e = 1;
                    if ((flags & 8) != 0) { a = e = S16(p) / 16384f; p += 2; }
                    else if ((flags & 0x40) != 0) { a = S16(p) / 16384f; e = S16(p + 2) / 16384f; p += 4; }
                    else if ((flags & 0x80) != 0) { a = S16(p) / 16384f; b = S16(p + 2) / 16384f; c = S16(p + 4) / 16384f; e = S16(p + 6) / 16384f; p += 8; }
                    foreach (var (pts, on, ends) in Contours(glyph, depth + 1))
                    {
                        var np = new Vector2[pts.Length];
                        for (int i = 0; i < pts.Length; i++)
                            np[i] = new Vector2(pts[i].x * a + pts[i].y * c + dx, pts[i].x * b + pts[i].y * e + dy);
                        result.Add((np, on, ends));
                    }
                    if ((flags & 0x20) == 0) break;
                }
            }
            glyphCache[gid] = result;
            return result;
        }

        /// <summary>Appends the glyph outline at baseline (x, y), scaled by k (px per font unit), to the canvas path.</summary>
        public void AppendGlyphPath(Canvas2D cv, int gid, float x, float y, float k)
        {
            foreach (var (pts, on, ends) in Contours(gid))
            {
                int start = 0;
                foreach (int end in ends)
                {
                    int n = end - start + 1;
                    if (n >= 2) EmitContour(cv, pts, on, start, n, x, y, k);
                    start = end + 1;
                }
            }
        }

        static void EmitContour(Canvas2D cv, Vector2[] pts, bool[] on, int s, int n, float x, float y, float k)
        {
            Vector2 P(int i) { var q = pts[s + ((i % n) + n) % n]; return new Vector2(x + q.x * k, y - q.y * k); }
            bool On(int i) => on[s + ((i % n) + n) % n];
            // Start at an on-curve point (or the midpoint of two off-curve points).
            int first = -1;
            for (int i = 0; i < n; i++) if (On(i)) { first = i; break; }
            Vector2 startPt;
            if (first < 0) { startPt = (P(0) + P(1)) * 0.5f; first = 0; }
            else startPt = P(first);
            cv.MoveTo(startPt.x, startPt.y);
            for (int j = 1; j <= n; j++)
            {
                int i = first + j;
                if (On(i))
                {
                    var q = P(i);
                    cv.LineTo(q.x, q.y);
                }
                else
                {
                    var ctrl = P(i);
                    Vector2 end;
                    if (On(i + 1)) { end = P(i + 1); j++; }
                    else end = (ctrl + P(i + 1)) * 0.5f;
                    cv.QuadraticCurveTo(ctrl.x, ctrl.y, end.x, end.y);
                }
            }
            cv.ClosePath();
        }
    }

    /// <summary>Glyph runs over a primary font with a per-glyph fallback (Fredoka, then Noto Sans).</summary>
    public static class TextLayout
    {
        public static void ForEachGlyph(TtfFont primary, TtfFont fallback, string text, float size, Action<TtfFont, int, float> fn)
        {
            float pen = 0;
            TtfFont prevFont = null;
            int prevGid = -1;
            for (int i = 0; i < text.Length; i++)
            {
                int cp = text[i];
                if (char.IsHighSurrogate(text[i]) && i + 1 < text.Length) { cp = char.ConvertToUtf32(text[i], text[i + 1]); i++; }
                TtfFont f = primary.Has(cp) || fallback == null || !fallback.Has(cp) ? primary : fallback;
                int gid = f.GlyphIndex(cp);
                float k = size / f.unitsPerEm;
                if (prevFont == f && prevGid >= 0) pen += f.Kerning(prevGid, gid) * k;
                fn?.Invoke(f, gid, pen);
                pen += f.Advance(gid) * k;
                prevFont = f;
                prevGid = gid;
            }
        }

        public static float Measure(TtfFont primary, TtfFont fallback, string text, float size)
        {
            float pen = 0;
            TtfFont prevFont = null;
            int prevGid = -1;
            for (int i = 0; i < text.Length; i++)
            {
                int cp = text[i];
                if (char.IsHighSurrogate(text[i]) && i + 1 < text.Length) { cp = char.ConvertToUtf32(text[i], text[i + 1]); i++; }
                TtfFont f = primary.Has(cp) || fallback == null || !fallback.Has(cp) ? primary : fallback;
                int gid = f.GlyphIndex(cp);
                float k = size / f.unitsPerEm;
                if (prevFont == f && prevGid >= 0) pen += f.Kerning(prevGid, gid) * k;
                pen += f.Advance(gid) * k;
                prevFont = f;
                prevGid = gid;
            }
            return pen;
        }
    }
}
