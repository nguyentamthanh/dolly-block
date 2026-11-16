// Widget kit on top of CanvasView: outlined labels, juicy buttons, the diamond chip.
using System;
using System.Collections.Generic;
using UnityEngine;
using CozyBlocks.Core;
using CozyBlocks.Engine;
using CozyBlocks.Render;
using CozyBlocks.Audio;
using CozyBlocks.Platform;

namespace CozyBlocks.UI
{
    public struct LabelOpts
    {
        public HAlign align;
        public float? boxW;
        public float wrapW;
    }

    public sealed class LabelView : CanvasView
    {
        string text;
        readonly LabelStyle st;
        readonly LabelOpts o;

        public LabelView(string text, LabelStyle st, LabelOpts o, float w, float h)
            : base(0, 0, w, h, null, st.outlineSize + st.shadowY + st.shadowOutline + 3, true)
        {
            this.text = text;
            this.st = st;
            this.o = o;
            SetPaint((ci, v) => Fonts.DrawLabel(ci, ((LabelView)v).text ?? "", 0, 0, v.ViewW, o.align, st, o.wrapW));
            SetPivot(w / 2, h / 2);
            Repaint();
        }

        public string GetText() => text;

        public LabelView SetText(string t)
        {
            if (t == text) return this;
            text = t;
            var m = Widgets.MeasureLabel(t, st, o);
            ResizeView(m.x, m.y);
            SetPivot(m.x / 2, m.y / 2);
            Repaint();
            return this;
        }
    }

    public enum ButtonState { Normal, Hover, Pressed, Disabled }

    public delegate void ButtonPaint(CanvasItem ci, float w, float h, ButtonState state);

    /// <summary>A pressable widget positioned by its centre.</summary>
    public class UiButton : GameObj
    {
        public readonly float bw, bh;
        readonly CanvasView view;
        ButtonState btnState = ButtonState.Normal;
        bool down;
        bool enabled = true;
        public Action onPress;
        public bool sfx;
        ButtonPaint paint;

        public UiButton(Scene scene, float w, float h, ButtonPaint paint, float pad = 16, bool sfx = true)
        {
            this.scene = scene;
            bw = w;
            bh = h;
            this.sfx = sfx;
            this.paint = paint;
            view = new CanvasView(-w / 2, -h / 2, w, h, (ci, v) => this.paint(ci, w, h, btnState), pad);
            Add(view);
            SetSize(w, h);
            SetInteractive(true);
            scene.Add(this);
            PointerOver += _ => { if (enabled && !down) SetBtnState(ButtonState.Hover); };
            PointerOut += _ => { if (enabled && !down) SetBtnState(ButtonState.Normal); };
            PointerDown += _ =>
            {
                if (!enabled) return;
                down = true;
                SetBtnState(ButtonState.Pressed);
                UiFx.JuicyDown(scene, this);
            };
            PointerUp += _ =>
            {
                if (!down) return;
                down = false;
                SetBtnState(enabled ? ButtonState.Hover : ButtonState.Disabled);
                UiFx.JuicyUp(scene, this);
                if (this.sfx) Sfx.Play("button_tap");
                onPress?.Invoke();
            };
            PointerUpOutside += _ =>
            {
                if (!down) return;
                down = false;
                SetBtnState(ButtonState.Normal);
                UiFx.JuicyUp(scene, this);
            };
        }

        void SetBtnState(ButtonState s)
        {
            if (btnState == s) return;
            btnState = s;
            view.Invalidate();
        }

        public UiButton SetEnabled(bool on)
        {
            enabled = on;
            SetBtnState(on ? ButtonState.Normal : ButtonState.Disabled);
            return this;
        }

        public void Refresh() => view.Invalidate();

        public override GameObj SetTopLeft(float nx, float ny)
        {
            x = nx + bw / 2;
            y = ny + bh / 2;
            return this;
        }

        public override Vector2 GetTopLeft() => new Vector2(x - bw / 2, y - bh / 2);
    }

    public struct TextButtonOpts
    {
        public string text;
        public float w, h;
        public Col? accent;
        public float? radius;
        public bool flat;
        public float fontSize;
        public Col? ink;
        public float? outline;
        public ButtonPaint extra;
    }

    public sealed class DiamondChip : GameObj
    {
        public readonly float cw = 108;
        public readonly float ch = 52;
        readonly CanvasView view;
        string countText = "0";
        readonly LabelStyle ls;
        readonly bool light;
        public readonly float gemX = 8 + 18;
        public readonly float gemY;

        public DiamondChip(Scene scene, bool light = true)
        {
            this.scene = scene;
            this.light = light;
            if (light)
            {
                var s = Fonts.Style(26, Art.HUD_TEXT, Art.TEXT_OUTLINE, 0);
                s.shadowColor = Col.TRANSPARENT;
                ls = s;
            }
            else ls = Fonts.Style(26, Art.WHITE, Art.TEXT_OUTLINE, 6);
            gemY = ch / 2 - 1;
            view = new CanvasView(-cw / 2, -ch / 2, cw, ch, (ci, v) => PaintChip(ci), 12);
            Add(view);
            scene.Add(this);
        }

        float WidthFor(string count)
        {
            float lw = Fonts.TextWidth(count, FontKind.Bold, 26);
            return Mathf.Max(108, 8 + 36 + 6 + lw + 16);
        }

        void PaintChip(CanvasItem ci)
        {
            float w = WidthFor(countText);
            var sb = Art.Box(new Col(0.1f, 0.05f, 0.32f, 0.38f), 26);
            sb.border = new[] { 0f, 0f, 0f, 3f };
            sb.borderColor = new Col(0.05f, 0.02f, 0.2f, 0.35f);
            if (light)
            {
                sb = Art.Box(Art.WHITE, 26);
                sb.shadowColor = new Col(0.45f, 0.33f, 0.25f, 0.14f);
                sb.shadowSize = 6;
                sb.shadowOffset = new[] { 0f, 3f };
            }
            ci.DrawStyleBox(sb, 0, 0, w, ch);
            float rowTop = 4, rowH = ch - 4 - 6;
            Art.DrawGem(ci, 8 + 18, rowTop + rowH / 2, 15);
            float lh = Fonts.LineHeight(26);
            Fonts.DrawLabel(ci, countText, 8 + 36 + 6, rowTop + (rowH - lh) / 2, w, HAlign.Left, ls);
        }

        public float Width_ => WidthFor(countText);

        public void SetCount(object n)
        {
            string s = n.ToString();
            if (s == countText) return;
            countText = s;
            float w = WidthFor(s);
            view.ResizeView(w, ch);
            view.SetPosition(-w / 2, -ch / 2);
        }

        public override GameObj SetTopLeft(float nx, float ny)
        {
            x = nx + Width_ / 2;
            y = ny + ch / 2;
            return this;
        }

        public DiamondChip SetTopRight(float nx, float ny)
        {
            x = nx - Width_ / 2;
            y = ny + ch / 2;
            return this;
        }

        public Vector2 GemWorld() => new Vector2(x - Width_ / 2 + 8 + 18, y - ch / 2 + 4 + (ch - 10) / 2);
    }

    public static class Widgets
    {
        public static Vector2 MeasureLabel(string text, LabelStyle st, LabelOpts o)
        {
            var lines = o.wrapW > 0 ? Fonts.WrapText(text, st.kind, st.size, o.wrapW) : new List<string>(text.Split('\n'));
            float w;
            if (o.boxW.HasValue) w = o.boxW.Value;
            else
            {
                w = float.NegativeInfinity;
                foreach (var l in lines) w = Mathf.Max(w, Fonts.TextWidth(l, st.kind, st.size));
            }
            return new Vector2(w, lines.Count * Fonts.LineHeight(st.size));
        }

        public static LabelView MakeLabel(Scene scene, string text, LabelStyle st, LabelOpts o = default)
        {
            var m = MeasureLabel(text, st, o);
            var l = new LabelView(text, st, o, m.x, m.y);
            if (scene != null) scene.Add(l);
            return l;
        }

        static StyleBoxFlat StyleFor(ButtonStyles st, ButtonState s)
            => s == ButtonState.Pressed ? st.pressed : s == ButtonState.Hover ? st.hover : s == ButtonState.Disabled ? st.disabled : st.normal;

        public static UiButton IconButton(Scene scene, string kind, Col? accentOpt = null, float diameter = 68, Col? glyphOpt = null, bool flat = false, ButtonPaint extra = null)
        {
            var accent = accentOpt ?? Col.TRANSPARENT;
            var glyph = glyphOpt ?? Col.TRANSPARENT;
            var st = Art.StyleButton(accent, 500, flat);
            var col = glyph.a > 0 ? glyph : accent.a > 0 ? Art.WHITE : Art.INK;
            return new UiButton(scene, diameter, diameter, (ci, w, h, state) =>
            {
                ci.DrawStyleBox(StyleFor(st, state), 0, 0, w, h);
                bool dn = state == ButtonState.Pressed;
                float s = Mathf.Min(w, h);
                float cx = w * 0.5f, cy = h * 0.5f - 3 + (dn ? 4 : 0);
                if (accent.a > 0 && !flat) Art.DrawIcon(ci, kind, cx, cy + 2, s * 0.3f, accent.Darkened(0.45f));
                Art.DrawIcon(ci, kind, cx, cy, s * 0.3f, col);
                extra?.Invoke(ci, w, h, state);
            });
        }

        public static UiButton TextButton(Scene scene, TextButtonOpts o)
        {
            var st = Art.StyleButton(o.accent ?? Col.TRANSPARENT, o.radius ?? 500, o.flat);
            var ink = o.ink ?? st.ink;
            float outlineSize = o.outline ?? (st.outline.HasValue ? 8 : 0);
            var ls = new LabelStyle
            {
                size = o.fontSize, color = ink, kind = FontKind.Bold, outlineSize = outlineSize,
                outlineColor = st.outline ?? Col.TRANSPARENT, shadowColor = Col.TRANSPARENT, shadowY = 0, shadowOutline = 0,
            };
            string text = o.text;
            float fontSize = o.fontSize;
            var extra = o.extra;
            return new UiButton(scene, o.w, o.h, (ci, w, h, state) =>
            {
                var sb = StyleFor(st, state);
                ci.DrawStyleBox(sb, 0, 0, w, h);
                float mt = sb.margin[1], mb = sb.margin[3];
                float fa = Js.Round(0.974f * fontSize);
                float fd = Mathf.Ceil(0.236f * fontSize);
                float baseline = mt + (h - mt - mb) / 2 + (fa - fd) / 2;
                Fonts.DrawLabel(ci, text, 0, baseline - Fonts.Ascent(fontSize), w, HAlign.Center, ls);
                extra?.Invoke(ci, w, h, state);
            });
        }

        public static bool IsAdOffer() => GameState.diamonds < GameState.HINT_COST && PlatformSdk.IsRewardedAvailable();
    }
}
