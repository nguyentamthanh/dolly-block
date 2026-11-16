// One polyomino on screen. Owns no rules. 'move' tween = travel, 'fx' tween =
// scale/rotation juice. The node sits at the piece rect's centre; topLeft is the rect corner in logical units.
using System;
using System.Collections.Generic;
using UnityEngine;
using CozyBlocks.Core;
using CozyBlocks.Engine;
using CozyBlocks.Render;
using CozyBlocks.Fx;
using CozyBlocks.UI;

namespace CozyBlocks.Objects
{
    public enum Slot { Tray, Board }

    public sealed class PieceView : GameObj
    {
        public static readonly Vec INVALID = new Vec(-1, -1);
        public static bool IsInvalid(Vec c) => c.x == -1 && c.y == -1;
        static readonly System.Random rng = new System.Random();

        public PieceData piece;
        public Slot slot = Slot.Tray;
        public Vec origin = INVALID;
        public int trayIndex = -1;
        public bool movable = true;
        public float cellSize = 48;

        readonly Scene sc;
        readonly CanvasView bodyView, ring;
        float sizeW, sizeH, tlx, tly;
        bool dragging, unhappy, celebrating;
        float time;
        readonly float phase = (float)(rng.NextDouble() * Math.PI * 2);
        float blink;
        float nextBlink = 1 + (float)rng.NextDouble() * 3.5f;

        public PieceView(Scene scene)
        {
            sc = scene;
            bodyView = new CanvasView(0, 0, 10, 10, (ci, v) => PaintBody(ci), 8);
            ring = new CanvasView(0, 0, 10, 10, (ci, v) => PaintRing(ci), 8);
            ring.SetVisible(false);
            Add(bodyView);
            Add(ring);
            scene.Add(this);
        }

        public float BoxW => sizeW;
        public float BoxH => sizeH;

        public void Setup(PieceData d, bool isMovable)
        {
            piece = d;
            movable = isMovable;
            SyncSize();
            UpdateDepth();
        }

        float RestZ()
        {
            if (piece != null && piece.mood != Mood.NEUTRAL)
            {
                if (slot == Slot.Board && !IsInvalid(origin)) return 2 + Mathf.Clamp(origin.y, 0, 16);
                return 1;
            }
            return 0;
        }

        void UpdateDepth() => SetDepth(Z.pieces + (dragging ? 100 : RestZ()));

        void SyncSize()
        {
            if (piece == null) return;
            var bb = piece.Bbox();
            sizeW = bb.x * cellSize;
            sizeH = bb.y * cellSize;
            float pad = Mathf.Ceil(cellSize * 0.55f) + 4;
            bodyView.SetPad(pad).ResizeView(sizeW, sizeH);
            ring.SetPad(pad).ResizeView(sizeW, sizeH);
            bodyView.SetPivot(sizeW / 2, sizeH);
            ring.SetPivot(sizeW / 2, sizeH);
            bodyView.SetPosition(0, sizeH / 2);
            ring.SetPosition(0, sizeH / 2);
            ApplyTopLeft();
        }

        public void SetCellSize(float s)
        {
            cellSize = s;
            SyncSize();
        }

        public override GameObj SetTopLeft(float nx, float ny)
        {
            tlx = nx;
            tly = ny;
            ApplyTopLeft();
            return this;
        }

        public override Vector2 GetTopLeft() => new Vector2(tlx, tly);

        void ApplyTopLeft() => SetPosition(tlx + sizeW / 2, tly + sizeH / 2);

        public float Left => tlx;
        public float Top => tly;

        public Vec LocalCellAt(float px, float py)
        {
            var lc = piece.LocalCells();
            if (cellSize <= 0) return new Vec(0, 0);
            var c = new Vec(Mathf.FloorToInt((px - tlx) / cellSize), Mathf.FloorToInt((py - tly) / cellSize));
            if (lc.Contains(c)) return c;
            var best = lc[0];
            int bestD = 999999;
            foreach (var q in lc)
            {
                int d = Math.Abs(q.x - c.x) + Math.Abs(q.y - c.y);
                if (d < bestD) { bestD = d; best = q; }
            }
            return best;
        }

        public bool ContainsGlobal(float px, float py)
        {
            if (piece == null || cellSize <= 0) return false;
            var c = new Vec(Mathf.FloorToInt((px - tlx) / cellSize), Mathf.FloorToInt((py - tly) / cellSize));
            return piece.LocalCells().Contains(c);
        }

        void PaintBody(CanvasItem ci)
        {
            if (piece == null) return;
            var d = piece;
            Art.DrawPolyomino(ci, 0, 0, cellSize, d.LocalCells(), d.color, d.LocalEye(), d.mood, d.targetColor, false,
                new PolyominoOptions { blink = blink, happyEyes = celebrating });
        }

        void PaintRing(CanvasItem ci)
        {
            if (piece == null) return;
            Art.DrawUnhappyRing(ci, 0, 0, cellSize, piece.LocalCells());
        }

        public void Tick(float dt)
        {
            if (piece == null) return;
            time += dt;
            UpdateDepth();
            if (!celebrating)
            {
                nextBlink -= dt;
                if (nextBlink <= 0)
                {
                    nextBlink = 2.5f + (float)rng.NextDouble() * 3;
                    StartBlink();
                }
            }
            if (slot == Slot.Tray && !dragging)
            {
                float b = Mathf.Sin(time * 2.2f + phase) * 0.012f;
                bodyView.SetScale(1 + b, 1 - b);
            }
            else if (bodyView.scaleX != 1 || bodyView.scaleY != 1) bodyView.SetScale(1, 1);
            if (unhappy) ring.SetAlpha(0.55f + 0.45f * Mathf.Sin(time * 7));
        }

        void StartBlink()
        {
            var t = UiFx.RunKeyed(sc, this, "blink", _ => { });
            t.Kill();
            var bt = sc.tw.Create();
            bt.TweenMethod(SetBlink, 0, 1, 0.06);
            bt.TweenMethod(SetBlink, 1, 0, 0.09);
        }

        void SetBlink(float x)
        {
            blink = x;
            bodyView.Invalidate();
        }

        public void SetUnhappy(bool on)
        {
            if (unhappy == on) return;
            unhappy = on;
            ring.SetVisible(on);
            if (on) ring.SetAlpha(1);
        }

        public bool IsUnhappy() => unhappy;

        public void SetCelebrating(bool on)
        {
            celebrating = on;
            bodyView.Invalidate();
        }

        void FxT(Action<Tween> build) => UiFx.RunKeyed(sc, this, "fx", build);
        static Vector2 V(float a, float b) => new Vector2(a, b);

        public void SetDragging(bool on)
        {
            dragging = on;
            UpdateDepth();
            if (on)
            {
                UiFx.Stop(this, "fx");
                rotation = 0;
                SetScale(1, 1);
            }
            else
            {
                FxT(t =>
                {
                    t.SetParallel(true);
                    t.TweenProperty(this, "scale", V(1, 1), 0.06);
                    t.TweenProperty(this, "rotation", 0, 0.06);
                });
            }
        }

        public void Squash(float strength = 1)
        {
            FxT(t =>
            {
                t.TweenProperty(this, "rotation", 0, 0);
                t.TweenProperty(this, "scale", V(1 + 0.16f * strength, 1 - 0.14f * strength), 0.07).SetTrans(Trans.QUAD).SetEase(EaseKind.OUT);
                t.TweenProperty(this, "scale", V(1 - 0.06f * strength, 1 + 0.08f * strength), 0.08).SetTrans(Trans.QUAD).SetEase(EaseKind.IN_OUT);
                t.TweenProperty(this, "scale", V(1, 1), 0.16).SetTrans(Trans.BACK).SetEase(EaseKind.OUT);
            });
        }

        public void Hop(float delay = 0)
        {
            FxT(t =>
            {
                if (delay > 0) t.TweenInterval(delay);
                t.TweenProperty(this, "scale", V(1.18f, 0.82f), 0.07);
                t.TweenProperty(this, "scale", V(0.88f, 1.16f), 0.09).SetTrans(Trans.QUAD).SetEase(EaseKind.OUT);
                t.TweenProperty(this, "scale", V(1, 1), 0.22).SetTrans(Trans.ELASTIC).SetEase(EaseKind.OUT);
            });
        }

        public void Shiver()
        {
            FxT(t => { foreach (var a in new[] { 0.07f, -0.07f, 0.05f, -0.04f, 0f }) t.TweenProperty(this, "rotation", a, 0.045); });
        }

        public void Refuse()
        {
            FxT(t =>
            {
                t.SetParallel(true);
                t.TweenProperty(this, "scale", V(1, 1), 0.1);
                t.Chain().TweenProperty(this, "rotation", 0.16f, 0.05);
                t.Chain().TweenProperty(this, "rotation", -0.14f, 0.07);
                t.Chain().TweenProperty(this, "rotation", 0.08f, 0.06);
                t.Chain().TweenProperty(this, "rotation", 0, 0.08);
            });
        }

        public void PopIn(float delay = 0)
        {
            SetScale(0, 0);
            FxT(t =>
            {
                t.TweenInterval(delay);
                t.TweenProperty(this, "scale", V(1, 1), 0.36).SetTrans(Trans.BACK).SetEase(EaseKind.OUT);
            });
        }

        public void RotatePiece()
        {
            if (piece == null || slot != Slot.Tray) return;
            piece.RotateCw();
            SyncSize();
            bodyView.Invalidate();
            ring.Invalidate();
            rotation = -Mathf.PI * 0.5f;
            FxT(t => t.TweenProperty(this, "rotation", 0, 0.22).SetTrans(Trans.BACK).SetEase(EaseKind.OUT));
        }

        public void TravelTo(float x, float y, float duration = 0.16f)
        {
            UiFx.RunKeyed(sc, this, "move", t =>
            {
                t.SetParallel(true);
                bool snap = duration <= 0.08f;
                t.TweenProperty(this, "topLeft", V(x, y), duration).SetTrans(snap ? Trans.QUAD : Trans.BACK).SetEase(EaseKind.OUT);
            });
        }

        public void RepaintPiece()
        {
            bodyView.Invalidate();
            ring.Invalidate();
        }

        protected override void OnDestroy() => UiFx.StopAll(this);
    }
}
