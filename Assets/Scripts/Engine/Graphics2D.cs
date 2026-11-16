// Vector graphics as the game uses them: recorded fill/line commands, rasterised through Canvas2D over
// their bounds whenever they change, then drawn as one texture.
using System;
using System.Collections.Generic;
using UnityEngine;
using CozyBlocks.Render;

namespace CozyBlocks.Engine
{
    public class Graphics2D : GameObj
    {
        enum Op { FillStyle, LineStyle, FillRect, FillRoundedRect, FillCircle, StrokeCircle, BeginPath, MoveTo, LineTo, Arc, StrokePath, FillPath, FillPoints, StrokePoints, ClosePath }

        struct Cmd
        {
            public Op op;
            public float a, b, c, d, e, f;
            public bool flag;
            public Col col;
            public Vector2[] pts;
        }

        readonly List<Cmd> cmds = new List<Cmd>();
        bool changed = true;
        Canvas2D canvas;
        Texture2D tex;
        Rect bounds;
        float pivotX, pivotY;

        public Graphics2D Clear() { cmds.Clear(); changed = true; return this; }

        static Col Rgb(uint rgb, float alpha) => new Col(((rgb >> 16) & 255) / 255f, ((rgb >> 8) & 255) / 255f, (rgb & 255) / 255f, alpha);

        void Push(Cmd c) { cmds.Add(c); changed = true; }

        public Graphics2D FillStyle(uint rgb, float alpha = 1) { Push(new Cmd { op = Op.FillStyle, col = Rgb(rgb, alpha) }); return this; }
        public Graphics2D LineStyle(float width, uint rgb, float alpha = 1) { Push(new Cmd { op = Op.LineStyle, a = width, col = Rgb(rgb, alpha) }); return this; }
        public Graphics2D FillRect(float x, float y, float w, float h) { Push(new Cmd { op = Op.FillRect, a = x, b = y, c = w, d = h }); return this; }
        public Graphics2D FillRoundedRect(float x, float y, float w, float h, float r) { Push(new Cmd { op = Op.FillRoundedRect, a = x, b = y, c = w, d = h, e = r }); return this; }
        public Graphics2D FillCircle(float x, float y, float r) { Push(new Cmd { op = Op.FillCircle, a = x, b = y, c = r }); return this; }
        public Graphics2D StrokeCircle(float x, float y, float r) { Push(new Cmd { op = Op.StrokeCircle, a = x, b = y, c = r }); return this; }
        public Graphics2D BeginPath() { Push(new Cmd { op = Op.BeginPath }); return this; }
        public Graphics2D ClosePath() { Push(new Cmd { op = Op.ClosePath }); return this; }
        public Graphics2D MoveTo(float x, float y) { Push(new Cmd { op = Op.MoveTo, a = x, b = y }); return this; }
        public Graphics2D LineTo(float x, float y) { Push(new Cmd { op = Op.LineTo, a = x, b = y }); return this; }
        public Graphics2D Arc(float x, float y, float r, float start, float end, bool anticlockwise = false) { Push(new Cmd { op = Op.Arc, a = x, b = y, c = r, d = start, e = end, flag = anticlockwise }); return this; }
        public Graphics2D StrokePath() { Push(new Cmd { op = Op.StrokePath }); return this; }
        public Graphics2D FillPath() { Push(new Cmd { op = Op.FillPath }); return this; }
        public Graphics2D FillPoints(IList<Vector2> pts, bool close = true) { Push(new Cmd { op = Op.FillPoints, pts = new List<Vector2>(pts).ToArray(), flag = close }); return this; }
        public Graphics2D StrokePoints(IList<Vector2> pts, bool close = false) { Push(new Cmd { op = Op.StrokePoints, pts = new List<Vector2>(pts).ToArray(), flag = close }); return this; }

        public Graphics2D SetPivot(float px, float py) { pivotX = px; pivotY = py; return this; }

        public override GameObj SetTopLeft(float nx, float ny) { x = nx + pivotX; y = ny + pivotY; return this; }
        public override Vector2 GetTopLeft() => new Vector2(x - pivotX, y - pivotY);

        Rect ComputeBounds()
        {
            float minX = float.MaxValue, minY = float.MaxValue, maxX = float.MinValue, maxY = float.MinValue;
            float lw = 0;
            void Inc(float x, float y, float r)
            {
                minX = Mathf.Min(minX, x - r); minY = Mathf.Min(minY, y - r);
                maxX = Mathf.Max(maxX, x + r); maxY = Mathf.Max(maxY, y + r);
            }
            foreach (var c in cmds)
            {
                switch (c.op)
                {
                    case Op.LineStyle: lw = c.a; break;
                    case Op.FillRect: case Op.FillRoundedRect: Inc(c.a, c.b, 1); Inc(c.a + c.c, c.b + c.d, 1); break;
                    case Op.FillCircle: Inc(c.a, c.b, c.c + 1); break;
                    case Op.StrokeCircle: Inc(c.a, c.b, c.c + lw + 1); break;
                    case Op.MoveTo: case Op.LineTo: Inc(c.a, c.b, lw * 2 + 1); break;
                    case Op.Arc: Inc(c.a, c.b, c.c + lw + 1); break;
                    case Op.FillPoints: case Op.StrokePoints:
                        foreach (var p in c.pts) Inc(p.x, p.y, lw * 2 + 1);
                        break;
                }
            }
            if (minX > maxX) return new Rect(0, 0, 0, 0);
            return Rect.MinMaxRect(Mathf.Floor(minX), Mathf.Floor(minY), Mathf.Ceil(maxX), Mathf.Ceil(maxY));
        }

        void Rasterise()
        {
            changed = false;
            bounds = ComputeBounds();
            if (bounds.width <= 0 || bounds.height <= 0) { bounds = new Rect(0, 0, 0, 0); return; }
            float rs = Viewport.rs;
            int wpx = Math.Max(1, Mathf.CeilToInt(bounds.width * rs));
            int hpx = Math.Max(1, Mathf.CeilToInt(bounds.height * rs));
            if (canvas == null) canvas = new Canvas2D(wpx, hpx);
            else canvas.Resize(wpx, hpx);
            float sx = wpx / bounds.width, sy = hpx / bounds.height;
            canvas.SetTransform(sx, 0, 0, sy, -bounds.x * sx, -bounds.y * sy);
            canvas.Join = LineJoin.Miter;
            canvas.MiterLimit = 4;
            Col fill = Col.BLACK, line = Col.BLACK;
            float lw = 1;
            canvas.BeginPath();
            foreach (var c in cmds)
            {
                switch (c.op)
                {
                    case Op.FillStyle: fill = c.col; break;
                    case Op.LineStyle: lw = c.a; line = c.col; break;
                    case Op.FillRect:
                        canvas.FillColor = fill;
                        canvas.FillRect(c.a, c.b, c.c, c.d);
                        break;
                    case Op.FillRoundedRect:
                        {
                            canvas.FillColor = fill;
                            canvas.BeginPath();
                            float r = Mathf.Min(c.e, Mathf.Min(c.c, c.d) / 2);
                            CanvasItem.RoundRectPath(canvas, c.a, c.b, c.c, c.d, new[] { r, r, r, r });
                            canvas.Fill();
                            canvas.BeginPath();
                            break;
                        }
                    case Op.FillCircle:
                        canvas.FillColor = fill;
                        canvas.BeginPath();
                        canvas.Arc(c.a, c.b, c.c, 0, Mathf.PI * 2);
                        canvas.Fill();
                        canvas.BeginPath();
                        break;
                    case Op.StrokeCircle:
                        canvas.StrokeColor = line;
                        canvas.LineWidth = lw;
                        canvas.BeginPath();
                        canvas.Arc(c.a, c.b, c.c, 0, Mathf.PI * 2);
                        canvas.ClosePath();
                        canvas.Stroke();
                        canvas.BeginPath();
                        break;
                    case Op.BeginPath: canvas.BeginPath(); break;
                    case Op.ClosePath: canvas.ClosePath(); break;
                    case Op.MoveTo: canvas.MoveTo(c.a, c.b); break;
                    case Op.LineTo: canvas.LineTo(c.a, c.b); break;
                    case Op.Arc: canvas.Arc(c.a, c.b, c.c, c.d, c.e, c.flag); break;
                    case Op.StrokePath:
                        canvas.StrokeColor = line;
                        canvas.LineWidth = lw;
                        canvas.Stroke();
                        break;
                    case Op.FillPath:
                        canvas.FillColor = fill;
                        canvas.Fill();
                        break;
                    case Op.FillPoints:
                        canvas.FillColor = fill;
                        canvas.BeginPath();
                        for (int i = 0; i < c.pts.Length; i++) { if (i == 0) canvas.MoveTo(c.pts[i].x, c.pts[i].y); else canvas.LineTo(c.pts[i].x, c.pts[i].y); }
                        canvas.ClosePath();
                        canvas.Fill();
                        canvas.BeginPath();
                        break;
                    case Op.StrokePoints:
                        canvas.StrokeColor = line;
                        canvas.LineWidth = lw;
                        canvas.BeginPath();
                        for (int i = 0; i < c.pts.Length; i++) { if (i == 0) canvas.MoveTo(c.pts[i].x, c.pts[i].y); else canvas.LineTo(c.pts[i].x, c.pts[i].y); }
                        if (c.flag) canvas.ClosePath();
                        canvas.Stroke();
                        canvas.BeginPath();
                        break;
                }
            }
            if (tex == null || tex.width != canvas.width || tex.height != canvas.height)
            {
                if (tex != null) UnityEngine.Object.Destroy(tex);
                tex = new Texture2D(canvas.width, canvas.height, TextureFormat.RGBA32, false, true) { filterMode = FilterMode.Bilinear, wrapMode = TextureWrapMode.Clamp };
            }
            tex.SetPixels32(canvas.px);
            tex.Apply(false);
        }

        static float lastRs = -1;
        float paintedRs = -1;

        public override void Draw(GfxRenderer r, Matrix4x4 world, float a)
        {
            if (paintedRs != Viewport.rs) { changed = true; paintedRs = Viewport.rs; }
            if (changed) Rasterise();
            if (tex == null || bounds.width <= 0) return;
            r.DrawTexture(world, tex, bounds.x - pivotX, bounds.y - pivotY, bounds.width, bounds.height, Color.white, a, true, true);
            lastRs = Viewport.rs;
        }

        protected override void OnDestroy()
        {
            if (tex != null) UnityEngine.Object.Destroy(tex);
            tex = null;
        }
    }
}
