// Geometry for one polyomino piece.
using System.Collections.Generic;
using UnityEngine;
using CozyBlocks.Core;

namespace CozyBlocks.Render
{
    public sealed class PieceGeometry
    {
        public List<List<Vector2>> outer = new List<List<Vector2>>();
        public List<List<Vector2>> body = new List<List<Vector2>>();
        public List<List<Vector2>> ring = new List<List<Vector2>>();
    }

    public static class PolyShape
    {
        public const float CORNER = 0.26f;
        public const float OUTLINE_W = 0.06f;
        public const float AA_FEATHER = 1.0f;

        struct Edge { public Vector2Int a, b; }

        public static List<List<Vector2>> TraceOutline(IReadOnlyList<Vec> cells)
        {
            // Insertion-ordered directed edges; a shared edge appears in both directions and cancels.
            var order = new List<(Vector2Int a, Vector2Int b)>();
            var live = new Dictionary<(int, int, int, int), int>();
            void Add(int ax, int ay, int bx, int by)
            {
                var rev = (bx, by, ax, ay);
                if (live.TryGetValue(rev, out int ri)) { live.Remove(rev); order[ri] = (new Vector2Int(int.MinValue, 0), default); return; }
                live[(ax, ay, bx, by)] = order.Count;
                order.Add((new Vector2Int(ax, ay), new Vector2Int(bx, by)));
            }
            foreach (var c in cells)
            {
                Add(c.x, c.y, c.x + 1, c.y);
                Add(c.x + 1, c.y, c.x + 1, c.y + 1);
                Add(c.x + 1, c.y + 1, c.x, c.y + 1);
                Add(c.x, c.y + 1, c.x, c.y);
            }
            var edges = new List<(Vector2Int a, Vector2Int b)>();
            foreach (var e in order) if (e.a.x != int.MinValue) edges.Add(e);
            var byStart = new Dictionary<Vector2Int, List<int>>();
            for (int i = 0; i < edges.Count; i++)
            {
                if (!byStart.TryGetValue(edges[i].a, out var l)) byStart[edges[i].a] = l = new List<int>();
                l.Add(i);
            }
            var used = new bool[edges.Count];
            var loops = new List<List<Vector2>>();
            for (int s = 0; s < edges.Count; s++)
            {
                if (used[s]) continue;
                var loop = new List<Vector2>();
                int e = s;
                while (e >= 0 && !used[e])
                {
                    used[e] = true;
                    loop.Add(edges[e].a);
                    int nx = -1;
                    if (byStart.TryGetValue(edges[e].b, out var next))
                        foreach (var n in next) if (!used[n]) { nx = n; break; }
                    e = nx;
                }
                loops.Add(loop);
            }
            var outl = new List<List<Vector2>>();
            foreach (var loop in loops)
            {
                int n = loop.Count;
                var f = new List<Vector2>();
                for (int i = 0; i < n; i++)
                {
                    var p = loop[i];
                    var q = loop[(i - 1 + n) % n];
                    var r = loop[(i + 1) % n];
                    float cross = (p.x - q.x) * (r.y - p.y) - (p.y - q.y) * (r.x - p.x);
                    if (cross != 0) f.Add(p);
                }
                outl.Add(f);
            }
            return outl;
        }

        static Vector2 Norm(Vector2 v)
        {
            float l = Mathf.Sqrt(v.x * v.x + v.y * v.y);
            if (l == 0) l = 1;
            return new Vector2(v.x / l, v.y / l);
        }

        static List<Vector2> RoundConvexCorners(List<Vector2> loop, float cs)
        {
            float r = cs * CORNER;
            int n = loop.Count;
            var o = new List<Vector2>();
            for (int i = 0; i < n; i++)
            {
                var v = loop[i] * cs;
                var p = loop[(i - 1 + n) % n];
                var q = loop[(i + 1) % n];
                var d1 = Norm(p * cs - v);
                var d2 = Norm(q * cs - v);
                float cross = -d1.x * d2.y + d1.y * d2.x;
                if (cross <= 0) { o.Add(v); continue; }
                float cx = v.x + (d1.x + d2.x) * r;
                float cy = v.y + (d1.y + d2.y) * r;
                const int steps = 8;
                for (int s = 0; s <= steps; s++)
                {
                    float t = Mathf.PI * 0.5f * s / steps;
                    o.Add(new Vector2(cx - d2.x * r * Mathf.Cos(t) - d1.x * r * Mathf.Sin(t), cy - d2.y * r * Mathf.Cos(t) - d1.y * r * Mathf.Sin(t)));
                }
            }
            return o;
        }

        static float Area(List<Vector2> p)
        {
            float a = 0;
            for (int i = 0; i < p.Count; i++)
            {
                var b = p[(i + 1) % p.Count];
                a += p[i].x * b.y - b.x * p[i].y;
            }
            return a * 0.5f;
        }

        public static List<Vector2> OffsetPolygon(List<Vector2> poly, float delta, bool round = false)
        {
            int n = poly.Count;
            var o = new List<Vector2>();
            if (n < 3) return o;
            float sign = Area(poly) >= 0 ? 1 : -1;
            for (int i = 0; i < n; i++)
            {
                var p = poly[(i - 1 + n) % n];
                var v = poly[i];
                var q = poly[(i + 1) % n];
                var e1 = Norm(v - p);
                var e2 = Norm(q - v);
                var n1 = new Vector2(sign * e1.y, -sign * e1.x);
                var n2 = new Vector2(sign * e2.y, -sign * e2.x);
                float dot = n1.x * n2.x + n1.y * n2.y;
                float cross = e1.x * e2.y - e1.y * e2.x;
                bool convex = sign * cross > 0;
                bool gap = delta > 0 ? convex : !convex;
                if (round && gap && dot < 0.9999f)
                {
                    float a1 = Mathf.Atan2(n1.y, n1.x);
                    float a2 = Mathf.Atan2(n2.y, n2.x);
                    float da = a2 - a1;
                    while (da > Mathf.PI) da -= Mathf.PI * 2;
                    while (da < -Mathf.PI) da += Mathf.PI * 2;
                    int steps = Mathf.Max(2, Mathf.CeilToInt(Mathf.Abs(da) / 0.5f));
                    float dd = Mathf.Abs(delta);
                    float sg = delta >= 0 ? 1 : -1;
                    for (int s = 0; s <= steps; s++)
                    {
                        float a = a1 + da * s / steps;
                        o.Add(new Vector2(v.x + Mathf.Cos(a) * dd * sg, v.y + Mathf.Sin(a) * dd * sg));
                    }
                    continue;
                }
                float k = delta / (1 + dot);
                o.Add(new Vector2(v.x + (n1.x + n2.x) * k, v.y + (n1.y + n2.y) * k));
            }
            return o;
        }

        static readonly Dictionary<string, PieceGeometry> cache = new Dictionary<string, PieceGeometry>();

        public static PieceGeometry Geometry(IReadOnlyList<Vec> cells, float cs)
        {
            var sb = new System.Text.StringBuilder();
            foreach (var c in cells) sb.Append(c.x).Append(',').Append(c.y).Append(';');
            sb.Append('|').Append((Mathf.Round(cs * 4) / 4).ToString("F2"));
            string key = sb.ToString();
            if (cache.TryGetValue(key, out var hit)) return hit;
            if (cache.Count > 512) cache.Clear();
            var loops = TraceOutline(cells);
            float halfW = cs * OUTLINE_W * 0.5f;
            var g = new PieceGeometry();
            foreach (var loop in loops)
            {
                var rounded = RoundConvexCorners(loop, cs);
                g.outer.Add(OffsetPolygon(rounded, Mathf.Max(0.5f, halfW - AA_FEATHER * 0.5f)));
                var b = OffsetPolygon(rounded, -halfW);
                g.body.Add(b);
                g.ring.Add(OffsetPolygon(b, -cs * 0.06f, true));
            }
            cache[key] = g;
            return g;
        }
    }
}
