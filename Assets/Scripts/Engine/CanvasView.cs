// A node whose pixels come from a Canvas2D paint callback: the equivalent of a
// Godot Control with a _draw() override. Painted at the display's pixel density (Viewport.rs) into a texture and
// repainted when the window changes or Invalidate() is called. The node's position is its pivot point.
using System;
using System.Collections.Generic;
using UnityEngine;
using CozyBlocks.Render;

namespace CozyBlocks.Engine
{
    public class CanvasView : GameObj
    {
        public delegate void PaintFn(CanvasItem ci, CanvasView view);

        static readonly HashSet<CanvasView> live = new HashSet<CanvasView>();
        static readonly HashSet<CanvasView> dirty = new HashSet<CanvasView>();
        static bool hooked;

        Canvas2D canvas;
        Texture2D tex;
        float nominalW, nominalH, pad, pivotX, pivotY;
        PaintFn paint;
        bool needsUpload;

        public float ViewW => nominalW;
        public float ViewH => nominalH;
        public float PivotX => pivotX;
        public float PivotY => pivotY;

        public static void Hook()
        {
            if (hooked) return;
            hooked = true;
            Viewport.OnChange(() => { foreach (var v in new List<CanvasView>(live)) v.Repaint(); });
        }

        /// <summary>Repaint the views that asked for it, once per frame before drawing.</summary>
        public static void FlushDirty()
        {
            if (dirty.Count == 0) return;
            var l = new List<CanvasView>(dirty);
            dirty.Clear();
            foreach (var v in l) if (!v.destroyed) v.Repaint();
        }

        public CanvasView(float x, float y, float w, float h, PaintFn paint, float pad = 0, bool deferPaint = false)
        {
            this.x = x;
            this.y = y;
            this.paint = paint;
            nominalW = w;
            nominalH = h;
            this.pad = pad;
            live.Add(this);
            if (!deferPaint) Repaint();
        }

        protected override void OnDestroy()
        {
            live.Remove(this);
            dirty.Remove(this);
            if (tex != null) UnityEngine.Object.Destroy(tex);
            tex = null;
            canvas = null;
        }

        public CanvasView ResizeView(float w, float h)
        {
            nominalW = w;
            nominalH = h;
            Repaint();
            return this;
        }

        public CanvasView SetPad(float p)
        {
            if (p == pad) return this;
            pad = p;
            Repaint();
            return this;
        }

        public CanvasView SetPivot(float px, float py)
        {
            pivotX = px;
            pivotY = py;
            return this;
        }

        public override GameObj SetTopLeft(float nx, float ny)
        {
            x = nx + pivotX;
            y = ny + pivotY;
            return this;
        }

        public override Vector2 GetTopLeft() => new Vector2(x - pivotX, y - pivotY);

        public void Invalidate() { if (!destroyed) dirty.Add(this); }

        public CanvasView SetPaint(PaintFn p)
        {
            paint = p;
            Invalidate();
            return this;
        }

        public void Repaint()
        {
            if (destroyed) return;
            float rs = Viewport.rs;
            int wpx = Math.Max(1, Mathf.CeilToInt((nominalW + pad * 2) * rs));
            int hpx = Math.Max(1, Mathf.CeilToInt((nominalH + pad * 2) * rs));
            if (canvas == null) canvas = new Canvas2D(wpx, hpx);
            else canvas.Resize(wpx, hpx);
            float sx = wpx / (nominalW + pad * 2);
            float sy = hpx / (nominalH + pad * 2);
            canvas.SetTransform(sx, 0, 0, sy, pad * sx, pad * sy);
            var ci = new CanvasItem(canvas, rs);
            ci.MarkBase();
            try { paint?.Invoke(ci, this); }
            catch (Exception e) { Debug.LogException(e); }
            needsUpload = true;
        }

        void Upload()
        {
            if (!needsUpload || canvas == null) return;
            needsUpload = false;
            if (tex == null || tex.width != canvas.width || tex.height != canvas.height)
            {
                if (tex != null) UnityEngine.Object.Destroy(tex);
                tex = new Texture2D(canvas.width, canvas.height, TextureFormat.RGBA32, false, true)
                {
                    filterMode = FilterMode.Bilinear,
                    wrapMode = TextureWrapMode.Clamp,
                };
            }
            tex.SetPixels32(canvas.px);
            tex.Apply(false);
        }

        /// <summary>The pixels of the last paint (premultiplied, top-down rows).</summary>
        public Canvas2D Pixels => canvas;

        public override void Draw(GfxRenderer r, Matrix4x4 world, float a)
        {
            Upload();
            if (tex == null) return;
            r.DrawTexture(world, tex, -(pad + pivotX), -(pad + pivotY), nominalW + pad * 2, nominalH + pad * 2, Color.white, a, true, true);
        }
    }
}
