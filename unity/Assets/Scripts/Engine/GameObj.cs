// The display tree that replaces Phaser's game objects: every node is a container with position, scale, rotation,
// alpha, visibility and depth; leaves draw a textured or solid quad. Input follows Phaser: interactive nodes with
// a hit area receive pointerdown/up/over/out, the topmost one only.
using System;
using System.Collections.Generic;
using UnityEngine;

namespace CozyBlocks.Engine
{
    public class GameObj : ITweenTarget
    {
        public Scene scene;
        public GameObj parent;
        public readonly List<GameObj> children = new List<GameObj>();
        public string name = "";
        public float x, y, scaleX = 1, scaleY = 1, rotation, alpha = 1;
        public bool visible = true;
        public float depth;
        internal int seq;
        static int nextSeq;
        public bool destroyed;
        public bool Active => !destroyed;

        // --- input ---
        public bool interactive;
        public bool inputEnabled = true;
        public bool handCursor;
        /// <summary>Hit rectangle in local coordinates (already relative to the node's origin).</summary>
        public Rect hitRect;
        public float width, height;
        public event Action<Pointer> PointerDown, PointerUp, PointerUpOutside, PointerOver, PointerOut;
        public event Action Destroyed;
        internal int renderIndex = -1;
        internal Matrix4x4 worldMatrix = Matrix4x4.identity;

        public GameObj() { seq = nextSeq++; }

        public GameObj SetPosition(float nx, float ny) { x = nx; y = ny; return this; }
        public GameObj SetScale(float sx) { scaleX = sx; scaleY = sx; return this; }
        public GameObj SetScale(float sx, float sy) { scaleX = sx; scaleY = sy; return this; }
        public GameObj SetAlpha(float a) { alpha = a; return this; }
        public GameObj SetVisible(bool v) { visible = v; return this; }
        public GameObj SetDepth(float d) { depth = d; return this; }
        public GameObj SetRotation(float r) { rotation = r; return this; }
        public GameObj SetName(string n) { name = n; return this; }

        public virtual GameObj SetSize(float w, float h)
        {
            width = w;
            height = h;
            hitRect = new Rect(-w / 2, -h / 2, w, h);
            return this;
        }

        public GameObj SetInteractive(bool hand = false)
        {
            interactive = true;
            inputEnabled = true;
            handCursor = hand;
            return this;
        }

        public void DisableInteractive() => inputEnabled = false;

        public void Add(GameObj c)
        {
            if (c.parent != null) c.parent.children.Remove(c);
            else c.scene?.displayList.Remove(c);
            c.parent = this;
            c.scene = scene;
            children.Add(c);
        }

        public void AddAll(params GameObj[] cs) { foreach (var c in cs) Add(c); }

        public void Remove(GameObj c, bool destroyChild = false)
        {
            if (children.Remove(c)) c.parent = null;
            if (destroyChild) c.Destroy();
        }

        public void RemoveAll(bool destroyChildren = false)
        {
            foreach (var c in children.ToArray()) Remove(c, destroyChildren);
        }

        public void SendToBack(GameObj c)
        {
            if (children.Remove(c)) children.Insert(0, c);
        }

        public void BringToTop(GameObj c)
        {
            if (children.Remove(c)) children.Add(c);
        }

        public virtual void Destroy()
        {
            if (destroyed) return;
            destroyed = true;
            foreach (var c in children.ToArray()) c.Destroy();
            children.Clear();
            if (parent != null) parent.children.Remove(this);
            else scene?.displayList.Remove(this);
            parent = null;
            OnDestroy();
            Destroyed?.Invoke();
        }

        protected virtual void OnDestroy() { }

        // --- transforms ---

        public Matrix4x4 LocalMatrix()
            => Matrix4x4.TRS(new Vector3(x, y, 0), Quaternion.Euler(0, 0, rotation * Mathf.Rad2Deg), new Vector3(scaleX, scaleY, 1));

        /// <summary>World (logical) matrix from the scene root, computed on demand.</summary>
        public Matrix4x4 WorldMatrix()
        {
            var m = LocalMatrix();
            for (var p = parent; p != null; p = p.parent) m = p.LocalMatrix() * m;
            return m;
        }

        public Vector2 ToLocal(Vector2 world)
        {
            var inv = WorldMatrix().inverse;
            var v = inv.MultiplyPoint3x4(new Vector3(world.x, world.y, 0));
            return new Vector2(v.x, v.y);
        }

        /// <summary>Phaser's willRender for input: visible, not transparent, not zero-scaled, all the way up.</summary>
        public bool WillRenderChain()
        {
            for (var n = this; n != null; n = n.parent)
                if (!n.visible || n.alpha <= 0 || n.scaleX == 0 || n.scaleY == 0 || n.destroyed) return false;
            return true;
        }

        public virtual bool HitTest(Vector2 local) => hitRect.Contains(local);

        internal void EmitDown(Pointer p) => PointerDown?.Invoke(p);
        internal void EmitUp(Pointer p) => PointerUp?.Invoke(p);
        internal void EmitUpOutside(Pointer p) => PointerUpOutside?.Invoke(p);
        internal void EmitOver(Pointer p) => PointerOver?.Invoke(p);
        internal void EmitOut(Pointer p) => PointerOut?.Invoke(p);

        // --- rendering ---

        /// <summary>Draw this node's own content (children are drawn by the renderer afterwards).</summary>
        public virtual void Draw(GfxRenderer r, Matrix4x4 world, float a) { }

        // --- tween targets ---

        public virtual float GetProp(string prop)
        {
            switch (prop)
            {
                case "alpha": case "modulate:a": return alpha;
                case "rotation": return rotation;
                case "x": return x;
                case "y": return y;
                case "scaleX": return scaleX;
                case "scaleY": return scaleY;
            }
            throw new ArgumentException("unknown tween property " + prop);
        }

        public virtual void SetProp(string prop, float v)
        {
            switch (prop)
            {
                case "alpha": case "modulate:a": alpha = v; return;
                case "rotation": rotation = v; return;
                case "x": x = v; return;
                case "y": y = v; return;
                case "scaleX": scaleX = v; return;
                case "scaleY": scaleY = v; return;
            }
            throw new ArgumentException("unknown tween property " + prop);
        }

        public virtual Vector2 GetProp2(string prop)
        {
            switch (prop)
            {
                case "scale": return new Vector2(scaleX, scaleY);
                case "position": return new Vector2(x, y);
                case "topLeft": return GetTopLeft();
            }
            throw new ArgumentException("unknown tween property " + prop);
        }

        public virtual void SetProp2(string prop, Vector2 v)
        {
            switch (prop)
            {
                case "scale": scaleX = v.x; scaleY = v.y; return;
                case "position": x = v.x; y = v.y; return;
                case "topLeft": SetTopLeft(v.x, v.y); return;
            }
            throw new ArgumentException("unknown tween property " + prop);
        }

        public virtual Vector2 GetTopLeft() => new Vector2(x, y);
        public virtual GameObj SetTopLeft(float nx, float ny) { x = nx; y = ny; return this; }
    }

    /// <summary>A plain container (Phaser.GameObjects.Container).</summary>
    public class Container : GameObj
    {
        public Container(float x = 0, float y = 0) { this.x = x; this.y = y; }
    }

    /// <summary>Phaser.GameObjects.Rectangle: a solid quad with an origin.</summary>
    public class RectObj : GameObj
    {
        public Color color;
        public float originX = 0.5f, originY = 0.5f;

        public RectObj(float x, float y, float w, float h, Color c)
        {
            this.x = x;
            this.y = y;
            color = c;
            SetSize(w, h);
        }

        public RectObj SetOrigin(float ox, float oy)
        {
            originX = ox;
            originY = oy;
            SetSize(width, height);
            return this;
        }

        public override GameObj SetSize(float w, float h)
        {
            width = w;
            height = h;
            hitRect = new Rect(-originX * w, -originY * h, w, h);
            return this;
        }

        public void SetFill(Color c) => color = c;

        public override void Draw(GfxRenderer r, Matrix4x4 world, float a)
        {
            if (color.a <= 0) return;
            r.DrawSolid(world, -originX * width, -originY * height, width, height, color, a);
        }
    }

    /// <summary>Phaser.GameObjects.Zone: an invisible interactive rectangle.</summary>
    public class ZoneObj : RectObj
    {
        public ZoneObj(float x, float y, float w, float h) : base(x, y, w, h, new Color(0, 0, 0, 0)) { }
        public override void Draw(GfxRenderer r, Matrix4x4 world, float a) { }
    }

    /// <summary>Phaser.GameObjects.Image over a Unity texture (straight-alpha source, drawn premultiplied).</summary>
    public class ImageObj : GameObj
    {
        public Texture2D tex;
        public float originX = 0.5f, originY = 0.5f;
        public float displayW, displayH;
        public Color tint = Color.white;
        public bool canvasOrientation; // texture rows are top-down (a Canvas2D upload)

        public ImageObj(float x, float y, Texture2D t)
        {
            this.x = x;
            this.y = y;
            tex = t;
            displayW = t != null ? t.width : 1;
            displayH = t != null ? t.height : 1;
            SetSize(displayW, displayH);
        }

        public ImageObj SetOrigin(float ox, float oy) { originX = ox; originY = oy; SetSize(displayW, displayH); return this; }

        public ImageObj SetDisplaySize(float w, float h)
        {
            displayW = w;
            displayH = h;
            SetSize(w, h);
            return this;
        }

        public override GameObj SetSize(float w, float h)
        {
            width = w;
            height = h;
            hitRect = new Rect(-originX * w, -originY * h, w, h);
            return this;
        }

        public ImageObj SetTint(Color c) { tint = c; return this; }

        public override void Draw(GfxRenderer r, Matrix4x4 world, float a)
        {
            if (tex == null) return;
            r.DrawTexture(world, tex, -originX * displayW, -originY * displayH, displayW, displayH, tint, a, canvasOrientation);
        }
    }
}
