// A software subset of the HTML Canvas 2D context, enough for every paint callback of the game: paths (lines, arcs,
// rectangles), nonzero / even-odd fills with exact-area anti-aliasing, strokes (butt/round/square caps, miter/round/
// bevel joins), transforms with save/restore, globalAlpha, a few composite modes, radial gradients, drawImage and
// image data. Pixels are premultiplied RGBA bytes, blended in sRGB space exactly like a browser canvas.
//
// The rasterizer is the signed-area accumulation scheme (as in font-rs): every edge adds its exact coverage to an
// accumulation buffer, a running sum along each row gives the winding coverage of every pixel.
using System;
using System.Collections.Generic;
using UnityEngine;

namespace CozyBlocks.Render
{
    public struct Mat2D
    {
        public float a, b, c, d, e, f;
        public Mat2D(float a, float b, float c, float d, float e, float f) { this.a = a; this.b = b; this.c = c; this.d = d; this.e = e; this.f = f; }
        public static readonly Mat2D Identity = new Mat2D(1, 0, 0, 1, 0, 0);
        public Vector2 Apply(float x, float y) => new Vector2(a * x + c * y + e, b * x + d * y + f);
        /// <summary>this * m (m applied first, like ctx.transform).</summary>
        public Mat2D Mul(Mat2D m) => new Mat2D(
            a * m.a + c * m.b, b * m.a + d * m.b,
            a * m.c + c * m.d, b * m.c + d * m.d,
            a * m.e + c * m.f + e, b * m.e + d * m.f + f);
        public float Det => a * d - b * c;
        public float Scale => Mathf.Sqrt(Mathf.Abs(Det));
        public Mat2D Inverse()
        {
            float det = Det;
            if (Mathf.Abs(det) < 1e-12f) return Identity;
            float id = 1f / det;
            return new Mat2D(d * id, -b * id, -c * id, a * id, (c * f - d * e) * id, (b * e - a * f) * id);
        }
    }

    public enum LineCap { Butt, Round, Square }
    public enum LineJoin { Miter, Round, Bevel }
    public enum Composite { SourceOver, DestinationOut, DestinationIn, Copy, Lighter }

    /// <summary>A fill style: a solid colour or a radial gradient (defined in user space).</summary>
    public sealed class Paint2D
    {
        public Col color;
        public bool isGradient;
        public float x0, y0, r0, x1, y1, r1;
        public readonly List<(float t, Col c)> stops = new List<(float, Col)>();
        public Mat2D inv; // device -> user space, captured when used
        public static Paint2D Solid(Col c) => new Paint2D { color = c };
        public static Paint2D Radial(float x0, float y0, float r0, float x1, float y1, float r1)
            => new Paint2D { isGradient = true, x0 = x0, y0 = y0, r0 = r0, x1 = x1, y1 = y1, r1 = r1 };
        public Paint2D AddStop(float t, Col c) { stops.Add((t, c)); stops.Sort((p, q) => p.t.CompareTo(q.t)); return this; }

        public Col Sample(float t)
        {
            if (stops.Count == 0) return Col.TRANSPARENT;
            if (t <= stops[0].t) return stops[0].c;
            for (int i = 1; i < stops.Count; i++)
            {
                if (t <= stops[i].t)
                {
                    var p = stops[i - 1];
                    var q = stops[i];
                    float k = q.t > p.t ? (t - p.t) / (q.t - p.t) : 1;
                    // Canvas interpolates gradients in premultiplied space.
                    float pa = p.c.a, qa = q.c.a;
                    float a = pa + (qa - pa) * k;
                    if (a <= 0) return Col.TRANSPARENT;
                    float r = (p.c.r * pa + (q.c.r * qa - p.c.r * pa) * k) / a;
                    float g = (p.c.g * pa + (q.c.g * qa - p.c.g * pa) * k) / a;
                    float b = (p.c.b * pa + (q.c.b * qa - p.c.b * pa) * k) / a;
                    return new Col(r, g, b, a);
                }
            }
            return stops[stops.Count - 1].c;
        }

        /// <summary>Two-circle radial gradient parameter at a user-space point (canvas spec, r(w) >= 0, largest w).</summary>
        public float RadialT(float px, float py)
        {
            float cdx = x1 - x0, cdy = y1 - y0, dr = r1 - r0;
            float pdx = px - x0, pdy = py - y0;
            float A = cdx * cdx + cdy * cdy - dr * dr;
            float B = pdx * cdx + pdy * cdy + r0 * dr;
            float Cc = pdx * pdx + pdy * pdy - r0 * r0;
            if (Mathf.Abs(A) < 1e-6f)
            {
                if (Mathf.Abs(B) < 1e-6f) return 0;
                float tt = Cc / (2 * B);
                return r0 + dr * tt >= 0 ? tt : float.NaN;
            }
            float disc = B * B - A * Cc;
            if (disc < 0) return float.NaN;
            float sq = Mathf.Sqrt(disc);
            float t1 = (B + sq) / A, t2 = (B - sq) / A;
            float hi = Mathf.Max(t1, t2), lo = Mathf.Min(t1, t2);
            if (r0 + dr * hi >= 0) return hi;
            if (r0 + dr * lo >= 0) return lo;
            return float.NaN;
        }
    }

    public sealed class Canvas2D
    {
        public int width, height;
        public Color32[] px; // premultiplied

        struct State
        {
            public Mat2D m;
            public float alpha;
            public Paint2D fill, stroke;
            public float lineWidth, miterLimit;
            public LineCap cap;
            public LineJoin join;
            public Composite op;
        }

        State st;
        readonly Stack<State> stack = new Stack<State>();

        // Path in device space.
        readonly List<List<Vector2>> subs = new List<List<Vector2>>();
        readonly List<bool> closedFlags = new List<bool>();
        List<Vector2> cur;

        public Canvas2D(int w, int h)
        {
            width = Math.Max(1, w);
            height = Math.Max(1, h);
            px = new Color32[width * height];
            ResetState();
        }

        void ResetState()
        {
            st = new State
            {
                m = Mat2D.Identity, alpha = 1, fill = Paint2D.Solid(Col.BLACK), stroke = Paint2D.Solid(Col.BLACK),
                lineWidth = 1, miterLimit = 10, cap = LineCap.Butt, join = LineJoin.Miter, op = Render.Composite.SourceOver,
            };
            stack.Clear();
        }

        public void Resize(int w, int h)
        {
            w = Math.Max(1, w);
            h = Math.Max(1, h);
            if (w != width || h != height)
            {
                width = w;
                height = h;
                px = new Color32[w * h];
            }
            else Array.Clear(px, 0, px.Length);
            ResetState();
            BeginPath();
        }

        // --- state ---------------------------------------------------------------------------------

        public void Save() => stack.Push(st);
        public void Restore() { if (stack.Count > 0) st = stack.Pop(); }
        public Mat2D GetTransform() => st.m;
        public void SetTransform(Mat2D m) => st.m = m;
        public void SetTransform(float a, float b, float c, float d, float e, float f) => st.m = new Mat2D(a, b, c, d, e, f);
        public void Translate(float x, float y) => st.m = st.m.Mul(new Mat2D(1, 0, 0, 1, x, y));
        public void Scale(float x, float y) => st.m = st.m.Mul(new Mat2D(x, 0, 0, y, 0, 0));
        public void Rotate(float r)
        {
            float cs = Mathf.Cos(r), sn = Mathf.Sin(r);
            st.m = st.m.Mul(new Mat2D(cs, sn, -sn, cs, 0, 0));
        }

        public float GlobalAlpha { get => st.alpha; set => st.alpha = Mathf.Clamp01(value); }
        public Composite CompositeOp { get => st.op; set => st.op = value; }
        public Col FillColor { set => st.fill = Paint2D.Solid(value.Css()); }
        public Paint2D FillPaint { set => st.fill = value; }
        public Col StrokeColor { set => st.stroke = Paint2D.Solid(value.Css()); }
        public float LineWidth { get => st.lineWidth; set => st.lineWidth = value; }
        public LineCap Cap { set => st.cap = value; }
        public LineJoin Join { set => st.join = value; }
        public float MiterLimit { set => st.miterLimit = value; }

        // --- path ----------------------------------------------------------------------------------

        public void BeginPath()
        {
            subs.Clear();
            closedFlags.Clear();
            cur = null;
        }

        public void MoveTo(float x, float y)
        {
            cur = new List<Vector2> { st.m.Apply(x, y) };
            subs.Add(cur);
            closedFlags.Add(false);
        }

        public void LineTo(float x, float y)
        {
            if (cur == null) { MoveTo(x, y); return; }
            cur.Add(st.m.Apply(x, y));
        }

        public void ClosePath()
        {
            if (cur == null) return;
            closedFlags[closedFlags.Count - 1] = true;
            var start = cur[0];
            cur = new List<Vector2> { start };
            subs.Add(cur);
            closedFlags.Add(false);
        }

        public void Rect(float x, float y, float w, float h)
        {
            MoveTo(x, y);
            LineTo(x + w, y);
            LineTo(x + w, y + h);
            LineTo(x, y + h);
            ClosePath();
        }

        /// <summary>ctx.arc: a line from the current point to the arc start, then the arc.</summary>
        public void Arc(float cx, float cy, float r, float a0, float a1, bool ccw = false)
        {
            if (r < 0) r = 0;
            float tau = Mathf.PI * 2;
            float da;
            if (!ccw)
            {
                da = a1 - a0;
                if (da >= tau) da = tau;
                else { da %= tau; if (da < 0) da += tau; }
            }
            else
            {
                da = a1 - a0;
                if (da <= -tau) da = -tau;
                else { da %= tau; if (da > 0) da -= tau; }
            }
            float rd = r * st.m.Scale;
            int n = ArcSegments(rd, Mathf.Abs(da));
            for (int i = 0; i <= n; i++)
            {
                float t = a0 + da * i / n;
                float x = cx + Mathf.Cos(t) * r, y = cy + Mathf.Sin(t) * r;
                if (i == 0 && cur == null) MoveTo(x, y);
                else LineTo(x, y);
            }
        }

        static int ArcSegments(float rDevice, float sweep)
        {
            if (rDevice <= 0.01f || sweep <= 0) return 1;
            const float tol = 0.2f;
            float step = rDevice > tol ? 2f * Mathf.Acos(1f - tol / rDevice) : sweep;
            int n = Mathf.CeilToInt(sweep / Mathf.Max(step, 0.01f));
            return Mathf.Clamp(n, 1, 512);
        }

        // --- fills ----------------------------------------------------------------------------------

        public void Fill(bool evenOdd = false)
        {
            var polys = new List<List<Vector2>>();
            foreach (var s in subs) if (s.Count >= 3) polys.Add(s);
            RasterPolys(polys, evenOdd, st.fill);
        }

        public void FillRect(float x, float y, float w, float h)
        {
            var save = SavePath();
            BeginPath();
            Rect(x, y, w, h);
            Fill();
            RestorePath(save);
        }

        public void ClearRect(float x, float y, float w, float h)
        {
            var save = SavePath();
            var op = st.op;
            float al = st.alpha;
            var fill = st.fill;
            st.op = Render.Composite.DestinationOut;
            st.alpha = 1;
            st.fill = Paint2D.Solid(Col.BLACK);
            BeginPath();
            Rect(x, y, w, h);
            Fill();
            st.op = op;
            st.alpha = al;
            st.fill = fill;
            RestorePath(save);
        }

        /// <summary>Clear everything regardless of the transform.</summary>
        public void Clear() => Array.Clear(px, 0, px.Length);

        (List<List<Vector2>>, List<bool>, List<Vector2>) SavePath()
            => (new List<List<Vector2>>(subs), new List<bool>(closedFlags), cur);

        void RestorePath((List<List<Vector2>> s, List<bool> c, List<Vector2> cu) p)
        {
            subs.Clear();
            subs.AddRange(p.s);
            closedFlags.Clear();
            closedFlags.AddRange(p.c);
            cur = p.cu;
        }

        // --- strokes --------------------------------------------------------------------------------

        public void Stroke()
        {
            float hw = st.lineWidth * st.m.Scale * 0.5f;
            if (hw <= 0) return;
            var polys = new List<List<Vector2>>();
            for (int i = 0; i < subs.Count; i++) BuildStroke(subs[i], closedFlags[i], hw, polys);
            RasterPolys(polys, false, st.stroke);
        }

        void BuildStroke(List<Vector2> raw, bool closed, float hw, List<List<Vector2>> outp)
        {
            var p = new List<Vector2>(raw.Count);
            foreach (var q in raw)
                if (p.Count == 0 || (q - p[p.Count - 1]).sqrMagnitude > 1e-10f) p.Add(q);
            if (closed && p.Count > 1 && (p[0] - p[p.Count - 1]).sqrMagnitude <= 1e-10f) p.RemoveAt(p.Count - 1);
            int n = p.Count;
            if (n == 1)
            {
                if (st.cap == LineCap.Round && !closed) outp.Add(CirclePoly(p[0], hw));
                else if (st.cap == LineCap.Square && !closed) outp.Add(Oriented(new List<Vector2> { p[0] + new Vector2(-hw, -hw), p[0] + new Vector2(hw, -hw), p[0] + new Vector2(hw, hw), p[0] + new Vector2(-hw, hw) }));
                return;
            }
            if (n < 2) return;
            int segs = closed ? n : n - 1;
            for (int i = 0; i < segs; i++)
            {
                var a = p[i];
                var b = p[(i + 1) % n];
                var d = (b - a).normalized;
                var nn = new Vector2(-d.y, d.x) * hw;
                var a0 = a;
                var b0 = b;
                if (!closed && st.cap == LineCap.Square)
                {
                    if (i == 0) a0 -= d * hw;
                    if (i == segs - 1) b0 += d * hw;
                }
                outp.Add(Oriented(new List<Vector2> { a0 + nn, b0 + nn, b0 - nn, a0 - nn }));
            }
            // joins
            int jStart = closed ? 0 : 1, jEnd = closed ? n : n - 1;
            for (int i = jStart; i < jEnd; i++)
            {
                var v = p[i];
                var prev = p[(i - 1 + n) % n];
                var next = p[(i + 1) % n];
                var d1 = (v - prev).normalized;
                var d2 = (next - v).normalized;
                float cross = d1.x * d2.y - d1.y * d2.x;
                float dot = Vector2.Dot(d1, d2);
                if (Mathf.Abs(cross) < 1e-6f && dot > 0) continue;
                if (st.join == LineJoin.Round) { outp.Add(CirclePoly(v, hw)); continue; }
                var n1 = new Vector2(-d1.y, d1.x);
                var n2 = new Vector2(-d2.y, d2.x);
                if (cross > 0) { n1 = -n1; n2 = -n2; }
                var p1 = v + n1 * hw;
                var p2 = v + n2 * hw;
                if (st.join == LineJoin.Miter)
                {
                    var bis = (n1 + n2);
                    float bl = bis.magnitude;
                    if (bl > 1e-6f)
                    {
                        bis /= bl;
                        float cosHalf = Vector2.Dot(bis, n1);
                        if (cosHalf > 1e-6f && 1f / cosHalf <= st.miterLimit)
                        {
                            var tip = v + bis * (hw / cosHalf);
                            outp.Add(Oriented(new List<Vector2> { v, p1, tip, p2 }));
                            continue;
                        }
                    }
                }
                outp.Add(Oriented(new List<Vector2> { v, p1, p2 }));
            }
            if (!closed && st.cap == LineCap.Round)
            {
                outp.Add(CirclePoly(p[0], hw));
                outp.Add(CirclePoly(p[n - 1], hw));
            }
        }

        static List<Vector2> CirclePoly(Vector2 c, float r)
        {
            int n = Math.Max(8, ArcSegments(r, Mathf.PI * 2));
            var l = new List<Vector2>(n);
            for (int i = 0; i < n; i++)
            {
                float t = Mathf.PI * 2 * i / n;
                l.Add(new Vector2(c.x + Mathf.Cos(t) * r, c.y + Mathf.Sin(t) * r));
            }
            return Oriented(l);
        }

        static float SignedArea(List<Vector2> p)
        {
            float a = 0;
            for (int i = 0; i < p.Count; i++)
            {
                var q = p[(i + 1) % p.Count];
                a += p[i].x * q.y - q.x * p[i].y;
            }
            return a * 0.5f;
        }

        static List<Vector2> Oriented(List<Vector2> p)
        {
            if (SignedArea(p) < 0) p.Reverse();
            return p;
        }

        // --- rasterizer -----------------------------------------------------------------------------

        static float[] accPool = new float[0];
        static float[] covPool = new float[0];

        void RasterPolys(List<List<Vector2>> polys, bool evenOdd, Paint2D paint)
        {
            if (polys.Count == 0) return;
            float minX = float.MaxValue, minY = float.MaxValue, maxX = float.MinValue, maxY = float.MinValue;
            foreach (var poly in polys)
                foreach (var q in poly)
                {
                    if (q.x < minX) minX = q.x;
                    if (q.y < minY) minY = q.y;
                    if (q.x > maxX) maxX = q.x;
                    if (q.y > maxY) maxY = q.y;
                }
            if (float.IsNaN(minX) || float.IsInfinity(minX)) return;
            int bx0 = Math.Max(0, (int)Mathf.Floor(minX));
            int by0 = Math.Max(0, (int)Mathf.Floor(minY));
            int bx1 = Math.Min(width, (int)Mathf.Ceil(maxX) + 1);
            int by1 = Math.Min(height, (int)Mathf.Ceil(maxY) + 1);
            // Anything left of the canvas still contributes winding, so the box always starts at the left edge
            // of what is visible: clip x into [bx0, bx1].
            if (bx1 <= bx0 || by1 <= by0)
            {
                if (st.op == Render.Composite.DestinationIn || st.op == Render.Composite.Copy) ClearOutside(0, 0, 0, 0);
                return;
            }
            int bw = bx1 - bx0, bh = by1 - by0;
            int stride = bw + 2;
            int n = stride * bh;
            if (accPool.Length < n) accPool = new float[Math.Max(n, accPool.Length * 2)];
            var acc = accPool;
            Array.Clear(acc, 0, n);
            foreach (var poly in polys)
            {
                int cnt = poly.Count;
                for (int i = 0; i < cnt; i++)
                {
                    var a = poly[i];
                    var b = poly[(i + 1) % cnt];
                    ClipLine(acc, stride, bw, bh, a.x - bx0, a.y - by0, b.x - bx0, b.y - by0);
                }
            }
            Blend(acc, stride, bx0, by0, bw, bh, evenOdd, paint);
        }

        void ClearOutside(int x0, int y0, int x1, int y1)
        {
            for (int y = 0; y < height; y++)
                for (int x = 0; x < width; x++)
                    if (x < x0 || x >= x1 || y < y0 || y >= y1) px[y * width + x] = default;
        }

        /// <summary>Splits a segment at x = 0 and x = w so off-box parts become vertical edges on the box border.</summary>
        static void ClipLine(float[] acc, int stride, int w, int h, float x0, float y0, float x1, float y1)
        {
            if (y0 == y1) return;
            if ((y0 < 0 && y1 < 0) || (y0 >= h && y1 >= h)) return;
            // split by x = 0 and x = w
            float tA = float.NaN, tB = float.NaN;
            if ((x0 < 0) != (x1 < 0)) tA = (0 - x0) / (x1 - x0);
            if ((x0 > w) != (x1 > w)) tB = (w - x0) / (x1 - x0);
            if (float.IsNaN(tA) && float.IsNaN(tB))
            {
                DrawLine(acc, stride, h, Mathf.Clamp(x0, 0, w), y0, Mathf.Clamp(x1, 0, w), y1);
                return;
            }
            float t1 = float.IsNaN(tA) ? tB : float.IsNaN(tB) ? tA : Mathf.Min(tA, tB);
            float t2 = float.IsNaN(tA) || float.IsNaN(tB) ? float.NaN : Mathf.Max(tA, tB);
            float px0 = x0, py0 = y0;
            float mx = x0 + (x1 - x0) * t1, my = y0 + (y1 - y0) * t1;
            DrawLine(acc, stride, h, Mathf.Clamp(px0, 0, w), py0, Mathf.Clamp(mx, 0, w), my);
            if (!float.IsNaN(t2))
            {
                float nx = x0 + (x1 - x0) * t2, ny = y0 + (y1 - y0) * t2;
                DrawLine(acc, stride, h, Mathf.Clamp(mx, 0, w), my, Mathf.Clamp(nx, 0, w), ny);
                DrawLine(acc, stride, h, Mathf.Clamp(nx, 0, w), ny, Mathf.Clamp(x1, 0, w), y1);
            }
            else DrawLine(acc, stride, h, Mathf.Clamp(mx, 0, w), my, Mathf.Clamp(x1, 0, w), y1);
        }

        /// <summary>font-rs draw_line: exact signed-area accumulation of one edge (x already within [0, w]).</summary>
        static void DrawLine(float[] acc, int stride, int h, float x0, float y0, float x1, float y1)
        {
            if (y0 == y1) return;
            float dir;
            if (y0 < y1) dir = 1;
            else
            {
                dir = -1;
                float tx = x0; x0 = x1; x1 = tx;
                float ty = y0; y0 = y1; y1 = ty;
            }
            float dxdy = (x1 - x0) / (y1 - y0);
            float x = x0;
            if (y0 < 0) { x -= y0 * dxdy; y0 = 0; }
            int yEnd = Math.Min(h, (int)Mathf.Ceil(y1));
            int yStart = (int)Mathf.Floor(y0);
            for (int y = yStart; y < yEnd; y++)
            {
                int ls = y * stride;
                float dy = Mathf.Min(y + 1f, y1) - Mathf.Max(y, y0);
                float xnext = x + dxdy * dy;
                float d = dy * dir;
                float xa, xb;
                if (x < xnext) { xa = x; xb = xnext; } else { xa = xnext; xb = x; }
                if (xa < 0) xa = 0;
                if (xb < 0) xb = 0;
                float xaFloor = Mathf.Floor(xa);
                int xai = (int)xaFloor;
                float xbCeil = Mathf.Ceil(xb);
                int xbi = (int)xbCeil;
                if (xbi <= xai + 1)
                {
                    float xmf = 0.5f * (x + xnext) - xaFloor;
                    acc[ls + xai] += d - d * xmf;
                    acc[ls + xai + 1] += d * xmf;
                }
                else
                {
                    float s = 1f / (xb - xa);
                    float x0f = xa - xaFloor;
                    float a0 = 0.5f * s * (1 - x0f) * (1 - x0f);
                    float x1f = xb - xbCeil + 1;
                    float am = 0.5f * s * x1f * x1f;
                    acc[ls + xai] += d * a0;
                    if (xbi == xai + 2) acc[ls + xai + 1] += d * (1 - a0 - am);
                    else
                    {
                        float a1 = s * (1.5f - x0f);
                        acc[ls + xai + 1] += d * (a1 - a0);
                        for (int xi = xai + 2; xi < xbi - 1; xi++) acc[ls + xi] += d * s;
                        float a2 = a1 + (xbi - xai - 3) * s;
                        acc[ls + xbi - 1] += d * (1 - a2 - am);
                    }
                    acc[ls + xbi] += d * am;
                }
                x = xnext;
            }
        }

        void Blend(float[] acc, int stride, int bx0, int by0, int bw, int bh, bool evenOdd, Paint2D paint)
        {
            float ga = st.alpha;
            var op = st.op;
            bool grad = paint.isGradient;
            Mat2D inv = grad ? st.m.Inverse() : Mat2D.Identity;
            Col solid = paint.color;
            float sr = solid.r, sg = solid.g, sb = solid.b, sa = solid.a;
            if (op == Render.Composite.DestinationIn || op == Render.Composite.Copy)
            {
                // These replace the destination everywhere outside the shape too.
                for (int y = 0; y < height; y++)
                    for (int x = 0; x < width; x++)
                        if (x < bx0 || x >= bx0 + bw || y < by0 || y >= by0 + bh) px[y * width + x] = default;
            }
            for (int y = 0; y < bh; y++)
            {
                float sum = 0;
                int ls = y * stride;
                int row = (by0 + y) * width + bx0;
                for (int x = 0; x < bw; x++)
                {
                    sum += acc[ls + x];
                    float cov;
                    if (evenOdd)
                    {
                        float t = Mathf.Abs(sum) % 2f;
                        cov = t > 1 ? 2 - t : t;
                    }
                    else
                    {
                        cov = Mathf.Abs(sum);
                        if (cov > 1) cov = 1;
                    }
                    if (cov < 1f / 512f && op != Render.Composite.DestinationIn && op != Render.Composite.Copy) continue;
                    if (grad)
                    {
                        var u = inv.Apply(bx0 + x + 0.5f, by0 + y + 0.5f);
                        float t = paint.RadialT(u.x, u.y);
                        if (float.IsNaN(t)) { sa = 0; }
                        else
                        {
                            var c = paint.Sample(Mathf.Clamp01(t));
                            sr = c.r; sg = c.g; sb = c.b; sa = c.a;
                        }
                    }
                    float a = cov * ga * sa;
                    int idx = row + x;
                    var dst = px[idx];
                    switch (op)
                    {
                        case Render.Composite.SourceOver:
                            {
                                if (a <= 0) break;
                                float k = 1 - a;
                                px[idx] = new Color32(
                                    (byte)(sr * a * 255f + dst.r * k + 0.5f),
                                    (byte)(sg * a * 255f + dst.g * k + 0.5f),
                                    (byte)(sb * a * 255f + dst.b * k + 0.5f),
                                    (byte)(a * 255f + dst.a * k + 0.5f));
                                break;
                            }
                        case Render.Composite.Lighter:
                            {
                                px[idx] = new Color32(
                                    (byte)Mathf.Min(255, sr * a * 255f + dst.r + 0.5f),
                                    (byte)Mathf.Min(255, sg * a * 255f + dst.g + 0.5f),
                                    (byte)Mathf.Min(255, sb * a * 255f + dst.b + 0.5f),
                                    (byte)Mathf.Min(255, a * 255f + dst.a + 0.5f));
                                break;
                            }
                        case Render.Composite.DestinationOut:
                            {
                                float k = 1 - a;
                                px[idx] = new Color32((byte)(dst.r * k + 0.5f), (byte)(dst.g * k + 0.5f), (byte)(dst.b * k + 0.5f), (byte)(dst.a * k + 0.5f));
                                break;
                            }
                        case Render.Composite.DestinationIn:
                            {
                                px[idx] = new Color32((byte)(dst.r * a + 0.5f), (byte)(dst.g * a + 0.5f), (byte)(dst.b * a + 0.5f), (byte)(dst.a * a + 0.5f));
                                break;
                            }
                        case Render.Composite.Copy:
                            {
                                px[idx] = new Color32((byte)(sr * a * 255f + 0.5f), (byte)(sg * a * 255f + 0.5f), (byte)(sb * a * 255f + 0.5f), (byte)(a * 255f + 0.5f));
                                break;
                            }
                    }
                }
            }
        }

        // --- images ---------------------------------------------------------------------------------

        /// <summary>drawImage(src, dx, dy, dw, dh) with bilinear sampling, through the current transform.</summary>
        public void DrawImage(Color32[] src, int sw, int shh, float dx, float dy, float dw, float dh, bool premultiplied = true)
        {
            if (sw <= 0 || shh <= 0 || dw == 0 || dh == 0) return;
            var m = st.m;
            var p0 = m.Apply(dx, dy);
            var p1 = m.Apply(dx + dw, dy);
            var p2 = m.Apply(dx + dw, dy + dh);
            var p3 = m.Apply(dx, dy + dh);
            int x0 = Math.Max(0, (int)Mathf.Floor(Mathf.Min(Mathf.Min(p0.x, p1.x), Mathf.Min(p2.x, p3.x))));
            int y0 = Math.Max(0, (int)Mathf.Floor(Mathf.Min(Mathf.Min(p0.y, p1.y), Mathf.Min(p2.y, p3.y))));
            int x1 = Math.Min(width, (int)Mathf.Ceil(Mathf.Max(Mathf.Max(p0.x, p1.x), Mathf.Max(p2.x, p3.x))));
            int y1 = Math.Min(height, (int)Mathf.Ceil(Mathf.Max(Mathf.Max(p0.y, p1.y), Mathf.Max(p2.y, p3.y))));
            // device -> image pixel
            var toUser = m.Inverse();
            float sx = sw / dw, sy = shh / dh;
            float ga = st.alpha;
            for (int y = y0; y < y1; y++)
            {
                for (int x = x0; x < x1; x++)
                {
                    var u = toUser.Apply(x + 0.5f, y + 0.5f);
                    float ix = (u.x - dx) * sx - 0.5f, iy = (u.y - dy) * sy - 0.5f;
                    if (ix < -0.5f || iy < -0.5f || ix > sw - 0.5f || iy > shh - 0.5f) continue;
                    var c = SampleBilinear(src, sw, shh, ix, iy, premultiplied);
                    float a = c.w * ga;
                    if (a <= 0) continue;
                    int idx = y * width + x;
                    var dst = px[idx];
                    float k = 1 - a;
                    px[idx] = new Color32(
                        (byte)Mathf.Min(255, c.x * ga * 255f + dst.r * k + 0.5f),
                        (byte)Mathf.Min(255, c.y * ga * 255f + dst.g * k + 0.5f),
                        (byte)Mathf.Min(255, c.z * ga * 255f + dst.b * k + 0.5f),
                        (byte)Mathf.Min(255, a * 255f + dst.a * k + 0.5f));
                }
            }
        }

        /// <summary>Premultiplied rgba (0..1) at a pixel position.</summary>
        static Vector4 SampleBilinear(Color32[] src, int w, int h, float x, float y, bool premul)
        {
            int xi = (int)Mathf.Floor(x), yi = (int)Mathf.Floor(y);
            float fx = x - xi, fy = y - yi;
            Vector4 Get(int ix, int iy)
            {
                ix = Mathf.Clamp(ix, 0, w - 1);
                iy = Mathf.Clamp(iy, 0, h - 1);
                var c = src[iy * w + ix];
                float a = c.a / 255f;
                if (premul) return new Vector4(c.r / 255f, c.g / 255f, c.b / 255f, a);
                return new Vector4(c.r / 255f * a, c.g / 255f * a, c.b / 255f * a, a);
            }
            var c00 = Get(xi, yi);
            var c10 = Get(xi + 1, yi);
            var c01 = Get(xi, yi + 1);
            var c11 = Get(xi + 1, yi + 1);
            return Vector4.Lerp(Vector4.Lerp(c00, c10, fx), Vector4.Lerp(c01, c11, fx), fy);
        }

        public void DrawCanvas(Canvas2D src, float dx, float dy, float dw, float dh)
            => DrawImage(src.px, src.width, src.height, dx, dy, dw, dh, true);

        // --- text (fonts provide outlines) ----------------------------------------------------------

        /// <summary>Adds glyph outlines of `text` with its baseline-left at (x, y) to the current path.</summary>
        public void TextPath(TtfFont primary, TtfFont fallback, string text, float x, float y, float size)
        {
            TextLayout.ForEachGlyph(primary, fallback, text, size, (font, gid, penX) =>
            {
                font.AppendGlyphPath(this, gid, x + penX, y, size / font.unitsPerEm);
            });
        }

        public void FillText(TtfFont primary, TtfFont fallback, string text, float x, float y, float size)
        {
            BeginPath();
            TextPath(primary, fallback, text, x, y, size);
            Fill();
            BeginPath();
        }

        public void StrokeText(TtfFont primary, TtfFont fallback, string text, float x, float y, float size)
        {
            BeginPath();
            TextPath(primary, fallback, text, x, y, size);
            Stroke();
            BeginPath();
        }

        /// <summary>Quadratic Bezier, flattened in device space (used by the glyph outlines).</summary>
        public void QuadraticCurveTo(float cx, float cy, float x, float y)
        {
            if (cur == null) { MoveTo(cx, cy); }
            var p0 = cur[cur.Count - 1];
            var p1 = st.m.Apply(cx, cy);
            var p2 = st.m.Apply(x, y);
            float dd = (p0 - 2 * p1 + p2).magnitude;
            int n = Mathf.Clamp(Mathf.CeilToInt(Mathf.Sqrt(dd / 0.25f) * 0.5f), 1, 64);
            for (int i = 1; i <= n; i++)
            {
                float t = i / (float)n, u = 1 - t;
                cur.Add(u * u * p0 + 2 * u * t * p1 + t * t * p2);
            }
        }
    }
}
