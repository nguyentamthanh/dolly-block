// Pointer handling for PieceViews. Owns no rules: asks GameScene.
using System.Collections.Generic;
using UnityEngine;
using CozyBlocks.Core;
using CozyBlocks.Engine;
using CozyBlocks.Render;
using CozyBlocks.Audio;
using CozyBlocks.Scenes;

namespace CozyBlocks.Objects
{
    public sealed class DragController
    {
        const float TOUCH_GAP_CELLS = 1.0f;
        const float GLIDE_RATE = 28;
        const float TAP_TIME = 0.35f;
        const float TAP_SLOP = 10;
        const float TRAY_TOUCH_SHARE = 0.15f;
        const int SNAP_FORGIVE_CELLS = 1;

        enum DropKind { Tray, Place, Refuse }
        struct Drop { public DropKind kind; public Vec cell; }

        readonly GameScene scene;
        PieceView view;
        float grabOffsetX, grabOffsetY;
        string lastKey = "";
        float pressX, pressY, pressTime;
        bool moved, fromTray;
        int activePointer = -1;
        float lastPx, lastPy, glideX, glideY;
        static readonly System.Random rng = new System.Random();

        public DragController(GameScene scene)
        {
            this.scene = scene;
            scene.InputDown += (p, over) => OnDown(p);
            scene.InputMove += OnMove;
            scene.InputUp += OnUp;
        }

        public bool IsDragging() => view != null;

        public void Cancel()
        {
            if (view == null) return;
            var v0 = view;
            ReleaseState();
            scene.ReturnHome(v0);
        }

        public void Tick(float dt)
        {
            if (view == null || (glideX == 0 && glideY == 0)) return;
            float k = Mathf.Exp(-GLIDE_RATE * dt);
            glideX *= k;
            glideY *= k;
            if (Mathf.Abs(glideX) < 0.25f && Mathf.Abs(glideY) < 0.25f) { glideX = 0; glideY = 0; }
            ShowAt(lastPx, lastPy);
        }

        void OnDown(Pointer p)
        {
            if (!scene.acceptingInput || view != null) return;
            var pt = scene.Logical(p);
            Begin(p.id, pt.x, pt.y, p.wasTouch);
        }

        void OnMove(Pointer p)
        {
            if (!scene.acceptingInput || view == null || p.id != activePointer) return;
            var pt = scene.Logical(p);
            Carry(pt.x, pt.y);
        }

        void OnUp(Pointer p)
        {
            if (view == null || p.id != activePointer) return;
            var pt = scene.Logical(p);
            Finish(pt.x, pt.y);
        }

        void RotateTap(PieceView pv)
        {
            scene.SendToTray(pv);
            pv.RotatePiece();
            scene.OnRotate(pv);
            Sfx.Play("pop", -2, 1 + (float)rng.NextDouble() * 0.15f);
        }

        void Begin(int pointerId, float px, float py, bool touch)
        {
            var pv = scene.ViewAt(px, py);
            if (pv == null || !pv.movable) return;
            activePointer = pointerId;
            view = pv;
            lastKey = "";
            pressX = px;
            pressY = py;
            pressTime = Time.realtimeSinceStartup;
            moved = false;
            fromTray = pv.slot == Slot.Tray;

            float oldCs = pv.cellSize;
            var tl = pv.GetTopLeft();
            var grab = pv.LocalCellAt(px, py);
            var lc = pv.piece.LocalCells();
            if (!lc.Contains(grab)) grab = lc.Count > 0 ? lc[0] : new Vec(0, 0);
            float fx = 0.5f, fy = 0.5f;
            if (oldCs > 0)
            {
                fx = Mathf.Clamp01((px - tl.x - grab.x * oldCs) / oldCs);
                fy = Mathf.Clamp01((py - tl.y - grab.y * oldCs) / oldCs);
            }
            scene.OnPickUp(pv);
            float newCs = pv.cellSize;
            if (touch)
            {
                grabOffsetX = -pv.BoxW / 2;
                grabOffsetY = -pv.BoxH - newCs * TOUCH_GAP_CELLS;
            }
            else
            {
                grabOffsetX = -(grab.x + fx) * newCs;
                grabOffsetY = -(grab.y + fy) * newCs;
            }
            float startX = px - (grab.x + fx) * newCs;
            float startY = py - (grab.y + fy) * newCs;
            var c = TopLeftFor(px, py);
            glideX = startX - c.x;
            glideY = startY - c.y;
            pv.SetDragging(true);
            Sfx.Play("pickup", 0, 0.95f + (float)rng.NextDouble() * 0.13f);
            Carry(px, py);
        }

        Vector2 TopLeftFor(float px, float py) => new Vector2(px + grabOffsetX, py + grabOffsetY);

        void ShowAt(float px, float py)
        {
            var pv = view;
            if (pv == null) return;
            var t = TopLeftFor(px, py);
            float rs = Viewport.rs;
            pv.SetTopLeft(Js.Round((t.x + glideX) * rs) / rs, Js.Round((t.y + glideY) * rs) / rs);
        }

        List<Vec> WorldCells(PieceView pv, Vec cell) => PieceView.IsInvalid(cell) ? new List<Vec>() : pv.piece.WorldCells(cell);

        Drop Resolve(PieceView pv, float tx, float ty)
        {
            var board = scene.board;
            var snap = board.CellRoundAt(tx, ty);
            if (PieceView.IsInvalid(snap)) return new Drop { kind = DropKind.Refuse, cell = PieceView.INVALID };
            var cell = snap;
            bool can = scene.CanPlace(pv, snap);
            if (!can && SNAP_FORGIVE_CELLS > 0)
            {
                var g = board.GridPosAt(tx, ty);
                float bestD = float.PositiveInfinity;
                for (int dy = -SNAP_FORGIVE_CELLS; dy <= SNAP_FORGIVE_CELLS; dy++)
                    for (int dx = -SNAP_FORGIVE_CELLS; dx <= SNAP_FORGIVE_CELLS; dx++)
                    {
                        if (dx == 0 && dy == 0) continue;
                        var c = new Vec(snap.x + dx, snap.y + dy);
                        float d = (c.x - g.x) * (c.x - g.x) + (c.y - g.y) * (c.y - g.y);
                        if (d >= bestD || !scene.CanPlace(pv, c)) continue;
                        bestD = d;
                        cell = c;
                        can = true;
                    }
            }
            float overlap = scene.tray.OverlapShare(tx, ty, pv.BoxW, pv.BoxH);
            if (overlap >= TRAY_TOUCH_SHARE || (overlap > 0 && !can)) return new Drop { kind = DropKind.Tray, cell = snap };
            return new Drop { kind = can ? DropKind.Place : DropKind.Refuse, cell = cell };
        }

        void Carry(float px, float py)
        {
            var pv = view;
            if (pv == null) return;
            lastPx = px;
            lastPy = py;
            if (!moved && Js.Hypot(px - pressX, py - pressY) > TAP_SLOP) moved = true;
            ShowAt(px, py);
            var t = TopLeftFor(px, py);
            var board = scene.board;
            var drop = Resolve(pv, t.x, t.y);
            var world = WorldCells(pv, drop.cell);
            bool onBoard = false;
            if (drop.kind != DropKind.Tray && board.state != null)
                foreach (var c in world) if (board.state.IsPlayable(c)) { onBoard = true; break; }
            if (!onBoard)
            {
                if (board.highlightCells.Count > 0) board.ClearHighlight();
                lastKey = "";
                return;
            }
            string key = $"{drop.kind}:{drop.cell.x},{drop.cell.y}";
            if (key == lastKey) return;
            lastKey = key;
            bool can = drop.kind == DropKind.Place;
            board.SetPreview(world, can, can && scene.PlacementHappy(pv, drop.cell), Art.PaletteFill(pv.piece.color));
        }

        void Finish(float px, float py)
        {
            var pv = view;
            if (pv == null) return;
            var t = TopLeftFor(px, py);
            float held = Time.realtimeSinceStartup - pressTime;
            bool isTap = !moved && Js.Hypot(px - pressX, py - pressY) <= TAP_SLOP && held <= TAP_TIME;
            bool ft = fromTray;
            if (!(isTap && ft)) pv.SetTopLeft(t.x, t.y);
            var drop = Resolve(pv, t.x, t.y);
            ReleaseState();
            if (isTap && ft)
            {
                if (scene.rotationEnabled) RotateTap(pv);
                else scene.SendToTray(pv);
                return;
            }
            if (drop.kind == DropKind.Tray) scene.SendToTray(pv);
            else if (drop.kind == DropKind.Place) scene.CommitPlace(pv, drop.cell);
            else
            {
                scene.OnRefuse(pv, WorldCells(pv, drop.cell));
                scene.ReturnHome(pv);
            }
        }

        void ReleaseState()
        {
            view?.SetDragging(false);
            view = null;
            activePointer = -1;
            lastKey = "";
            glideX = 0;
            glideY = 0;
            scene.board.ClearHighlight();
        }
    }
}
