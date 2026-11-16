// A modal layer (port of src/ui/Overlay.ts): a dim that swallows input plus a root container centred on screen.
using System;
using System.Collections.Generic;
using UnityEngine;
using CozyBlocks.Engine;
using CozyBlocks.Render;

namespace CozyBlocks.UI
{
    public class Overlay
    {
        static readonly List<Overlay> live = new List<Overlay>();

        public static bool CloseTopOverlay()
        {
            for (int i = live.Count - 1; i >= 0; i--)
            {
                var ov = live[i];
                if (ov.dim.destroyed) { live.RemoveAt(i); continue; }
                if (ov.Visible && ov.onEscape != null) { ov.onEscape(); return true; }
            }
            return false;
        }

        public Action onEscape;
        public readonly RectObj dim;
        public readonly Container root;
        protected readonly Scene scene;
        bool shown;

        public Overlay(Scene scene, float depth, uint dimColor = 0x1a0a47, float dimAlpha = 0.62f, bool blockInput = true)
        {
            this.scene = scene;
            var c = new Color(((dimColor >> 16) & 255) / 255f, ((dimColor >> 8) & 255) / 255f, (dimColor & 255) / 255f, dimAlpha);
            dim = scene.AddRect(0, 0, 10, 10, c);
            dim.SetOrigin(0, 0);
            dim.SetDepth(depth);
            if (blockInput) dim.SetInteractive();
            root = scene.AddContainer(0, 0);
            root.SetDepth(depth + 1);
            SetVisible(false);
            Layout();
            live.Add(this);
        }

        public bool Visible => shown;

        public virtual void SetVisible(bool v)
        {
            shown = v;
            dim.SetVisible(v);
            root.SetVisible(v);
            if (dim.interactive) dim.inputEnabled = v;
        }

        public void Layout()
        {
            float W = Viewport.w, H = Viewport.h;
            dim.SetPosition(-80, -80);
            dim.SetSize(W + 160, H + 160);
            root.SetPosition(W / 2, H / 2);
        }
    }
}
