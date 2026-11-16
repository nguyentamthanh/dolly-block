// Draws the grid and maps screen points to grid cells (port of src/objects/BoardView.ts). Never mutates the state.
using System.Collections.Generic;
using UnityEngine;
using CozyBlocks.Core;
using CozyBlocks.Engine;
using CozyBlocks.Render;

namespace CozyBlocks.Objects
{
    public sealed class BoardView
    {
        public readonly CanvasView view;
        readonly Graphics2D ghost;
        public BoardState state;
        public float cellSize = 64;
        public float originX, originY;
        public float x, y, w = 100, h = 100;
        public List<Vec> highlightCells = new List<Vec>();
        public bool highlightOk;
        Col ghostColor = Col.TRANSPARENT;
        bool ghostCan;
        float flash;
        List<Vec> flashCells = new List<Vec>();
        List<Vec> playable = new List<Vec>();

        public BoardView(Scene scene)
        {
            view = scene.Add(new CanvasView(0, 0, 100, 100, (ci, v) => Paint(ci), 48));
            view.SetDepth(10);
            ghost = scene.Add(new Graphics2D());
            ghost.SetDepth(15);
        }

        public void SetState(BoardState s)
        {
            state = s;
            playable = s != null ? s.PlayableCells() : new List<Vec>();
            Relayout();
        }

        public void SetRect(float nx, float ny, float nw, float nh)
        {
            x = nx; y = ny; w = nw; h = nh;
            view.SetPosition(nx, ny);
            ghost.SetPosition(nx, ny);
            view.ResizeView(nw, nh);
            Relayout();
        }

        public void Relayout()
        {
            var s = state;
            if (s == null || s.width == 0 || s.height == 0) return;
            float shortSide = Mathf.Min(w, h);
            float pad = Mathf.Clamp(shortSide * 0.045f, 18, 34);
            float availW = w - pad * 2;
            float availH = h - pad * 2 - Art.BOARD_SHADOW_REACH;
            float fitFracX = availW / (s.width + Art.BOARD_REVEAL_FRAC * 2);
            float fitFracY = availH / (s.height + Art.BOARD_REVEAL_FRAC * 2);
            float fitMinX = (availW - Art.BOARD_REVEAL * 2) / s.width;
            float fitMinY = (availH - Art.BOARD_REVEAL * 2) / s.height;
            cellSize = Mathf.Max(Mathf.Floor(Mathf.Min(Mathf.Min(fitFracX, fitMinX), Mathf.Min(fitFracY, fitMinY))), 8);
            float gridW = s.width * cellSize, gridH = s.height * cellSize;
            originX = Mathf.Floor((w - gridW) * 0.5f);
            originY = Mathf.Floor((h - gridH - Art.BOARD_SHADOW_REACH) * 0.5f);
            view.Invalidate();
            SyncGhost();
        }

        public Rect CellRectLocal(Vec c)
        {
            float inset = cellSize * 0.09f;
            return new Rect(originX + c.x * cellSize + inset, originY + c.y * cellSize + inset, cellSize - inset * 2, cellSize - inset * 2);
        }

        public Vec CellAt(float px, float py)
        {
            if (state == null || cellSize <= 0) return PieceView.INVALID;
            float lx = px - x - originX, ly = py - y - originY;
            var c = new Vec(Mathf.FloorToInt(lx / cellSize), Mathf.FloorToInt(ly / cellSize));
            return state.IsPlayable(c) ? c : PieceView.INVALID;
        }

        public Vec CellRoundAt(float px, float py)
        {
            if (state == null || cellSize <= 0) return PieceView.INVALID;
            float lx = px - x - originX, ly = py - y - originY;
            int R(float n) => n < 0 ? -Js.RoundI(-n) : Js.RoundI(n);
            return new Vec(R(lx / cellSize), R(ly / cellSize));
        }

        public Vector2 GridPosAt(float px, float py) => new Vector2((px - x - originX) / cellSize, (py - y - originY) / cellSize);

        public void SetHighlightCells(List<Vec> cells, bool ok)
        {
            highlightCells = cells;
            highlightOk = ok;
            SyncGhost();
        }

        public void ClearHighlight()
        {
            ghostCan = false;
            highlightCells = new List<Vec>();
            highlightOk = false;
            SyncGhost();
        }

        public void SetPreview(List<Vec> cells, bool can, bool happy, Col color)
        {
            ghostCan = can;
            ghostColor = color;
            highlightCells = cells;
            highlightOk = happy;
            SyncGhost();
        }

        public void FlashBad(List<Vec> cells)
        {
            flashCells = new List<Vec>(cells);
            flash = 1;
            view.Invalidate();
        }

        public void Tick(float dt)
        {
            if (flash > 0)
            {
                flash = Mathf.Max(0, flash - dt * 3);
                view.Invalidate();
            }
        }

        public void SetAlpha(float a) => view.SetAlpha(a);
        public void Redraw() => view.Invalidate();

        void Paint(CanvasItem ci)
        {
            var s = state;
            if (s == null) return;
            Art.DrawBoard(ci, playable, originX, originY, cellSize);
            if (flash > 0)
            {
                var c = Art.BAD_TINT.WithAlpha(0.7f * flash);
                foreach (var pos in flashCells)
                    if (s.IsPlayable(pos))
                    {
                        var r = CellRectLocal(pos);
                        ci.DrawStyleBox(Art.Box(c, cellSize * 0.22f), r.x, r.y, r.width, r.height);
                    }
            }
        }

        static uint Rgb(Col c)
        {
            var q = c.Css();
            return ((uint)Js.RoundI(q.r * 255) << 16) | ((uint)Js.RoundI(q.g * 255) << 8) | (uint)Js.RoundI(q.b * 255);
        }

        void SyncGhost()
        {
            var g = ghost;
            g.Clear();
            var s = state;
            var hl = highlightCells;
            if (s == null || hl.Count == 0) return;
            float cs = cellSize, inset = cs * 0.08f;
            Col col;
            if (ghostCan && ghostColor.a > 0)
            {
                col = ghostColor.Lerp(Col.WHITE, 0.45f);
                if (!highlightOk) col = col.Lerp(Art.BAD_TINT, 0.55f);
                col = col.WithAlpha(0.55f);
            }
            else col = (highlightOk ? Art.OK_TINT : Art.BAD_TINT).WithAlpha(0.45f);
            g.FillStyle(Rgb(col), col.a);
            float r = cs * 0.18f;
            foreach (var c in hl)
            {
                if (!s.IsPlayable(c)) continue;
                g.FillRoundedRect(originX + c.x * cs + inset, originY + c.y * cs + inset, cs - inset * 2, cs - inset * 2, r);
            }
        }
    }
}
