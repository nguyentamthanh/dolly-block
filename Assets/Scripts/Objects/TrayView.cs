// The shelf of blocks still waiting for a home. Geometry only.
using UnityEngine;
using CozyBlocks.Engine;
using CozyBlocks.Render;

namespace CozyBlocks.Objects
{
    public sealed class TrayView
    {
        public const float SIDE_INSET = 14;
        public const float BOTTOM_INSET = 14;
        const float MIN_READABLE = 44;

        public readonly CanvasView view;
        public int slotCount;
        public float slotSize = 64;
        public float x, y, w = 100, h = 100;
        public float safeBottom;
        int cols = 1, rows = 1;
        float originX, originY, gap = 8;

        public TrayView(Scene scene)
        {
            view = scene.Add(new CanvasView(0, 0, 100, 100, (ci, v) => Paint(ci), 12));
            view.SetDepth(10);
        }

        public void SetRect(float nx, float ny, float nw, float nh)
        {
            x = nx; y = ny; w = nw; h = nh;
            view.SetPosition(nx, ny);
            view.ResizeView(nw, nh);
            Relayout();
        }

        public void SetSlotCount(int n)
        {
            slotCount = n;
            Relayout();
        }

        Rect Inner() => new Rect(SIDE_INSET, 4, w - SIDE_INSET * 2, h - (4 + BOTTOM_INSET + safeBottom));

        public void Relayout()
        {
            if (slotCount <= 0) { view.Invalidate(); return; }
            if (w < 1 || h < 1) return;
            var area = Inner();
            float shortSide = Mathf.Min(area.width, area.height);
            gap = Mathf.Clamp(shortSide * 0.04f, 6, 18);
            int bestRows = 1;
            float bestSize = 0;
            for (int r = 1; r <= slotCount; r++)
            {
                int c = Mathf.CeilToInt((float)slotCount / r);
                float ww = (area.width - gap * (c + 1)) / c;
                float hh = (area.height - gap * (r + 1)) / r;
                float sz = Mathf.Min(ww, hh);
                if (sz > bestSize) { bestSize = sz; bestRows = r; }
            }
            rows = bestRows;
            cols = Mathf.CeilToInt((float)slotCount / rows);
            slotSize = Mathf.Max(Mathf.Floor(bestSize), 16);
            if (slotSize < MIN_READABLE) Debug.LogWarning($"Tray: blocks are {slotSize} px, below the {MIN_READABLE} px readable floor");
            float usedW = cols * slotSize + gap * (cols - 1);
            float usedH = rows * slotSize + gap * (rows - 1);
            originX = Mathf.Floor(area.x + (area.width - usedW) * 0.5f);
            originY = Mathf.Floor(area.y + (area.height - usedH) * 0.5f);
            view.Invalidate();
        }

        public Rect SlotRect(int i)
        {
            int col = i % cols, row = i / cols;
            return new Rect(x + originX + col * (slotSize + gap), y + originY + row * (slotSize + gap), slotSize, slotSize);
        }

        public bool ContainsGlobal(float px, float py) => px >= x && py >= y && px < x + w && py < y + h;

        public float OverlapShare(float left, float top, float ww, float hh)
        {
            if (ww <= 0 || hh <= 0) return 0;
            float ox = Mathf.Min(left + ww, x + w) - Mathf.Max(left, x);
            float oy = Mathf.Min(top + hh, y + h) - Mathf.Max(top, y);
            return ox > 0 && oy > 0 ? ox * oy / (ww * hh) : 0;
        }

        void Paint(CanvasItem ci)
        {
            var s = Inner();
            if (s.width <= 0 || s.height <= 0) return;
            const float r = 26;
            ci.DrawStyleBox(Art.Box(Art.TRAY_PANEL, r), s.x, s.y, s.width, s.height);
            const float inset = 10;
            Art.DrawDashedRoundRect(ci, s.x + inset, s.y + inset, s.width - inset * 2, s.height - inset * 2, r - inset * 0.5f, Art.WHITE, 3.5f, 11, 8);
        }
    }
}
