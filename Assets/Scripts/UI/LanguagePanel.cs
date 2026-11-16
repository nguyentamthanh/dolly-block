// Language picker.
using System;
using UnityEngine;
using CozyBlocks.Core;
using CozyBlocks.Engine;
using CozyBlocks.Render;
using CozyBlocks.Audio;
using CozyBlocks.Fx;

namespace CozyBlocks.UI
{
    public sealed class LanguagePanel : Overlay
    {
        public Action<string> onChosen = _ => { };
        public Action onClosed = () => { };
        const float CARD_W = 520, CARD_H = 480, MARGIN = 28, GAP = 16;

        public LanguagePanel(Scene scene) : base(scene, Z.panel - 100, 0x1a0a47, 0.62f)
        {
            float L = -CARD_W / 2, T = -CARD_H / 2;
            var card = new Container(0, 0) { scene = scene };
            root.Add(card);
            string title = Loc.T("language");
            float titleSize = Fonts.FitFontSize(title, CARD_W - MARGIN * 2 - 40, 0, 36, 22);
            var cardView = new CanvasView(L, T, CARD_W, CARD_H, (ci, v) =>
            {
                var sb = Art.Box(Art.CARD, 44);
                sb.border = new[] { 0f, 0f, 0f, 12f };
                sb.borderColor = Art.CARD_EDGE;
                sb.shadowColor = new Col(0.05f, 0.02f, 0.2f, 0.4f);
                sb.shadowSize = 26;
                sb.shadowOffset = new[] { 0f, 14f };
                ci.DrawStyleBox(sb, 0, 0, CARD_W, CARD_H);
                Fonts.DrawLabel(ci, title, MARGIN, 30, CARD_W - MARGIN * 2 - 40, HAlign.Center, Fonts.Style(titleSize, Art.ACCENT_BLUE));
            }, 50);
            card.Add(cardView);

            float btnW = (CARD_W - MARGIN * 2 - GAP) * 0.5f;
            string current = Loc.Current();
            for (int i = 0; i < Loc.CODES.Length; i++)
            {
                string code = Loc.CODES[i];
                string name = Loc.NAMES[code];
                var b = Widgets.TextButton(scene, new TextButtonOpts
                {
                    text = name, w = btnW, h = 72, accent = code == current ? Art.ACCENT_PRIMARY : Col.TRANSPARENT, flat = true,
                    fontSize = Fonts.FitFontSize(name, btnW - 36, 0, 28, 18),
                });
                b.sfx = false;
                b.SetTopLeft(L + MARGIN + (i % 2) * (btnW + GAP), T + 104 + Mathf.Floor(i / 2) * (72 + GAP));
                b.onPress = () => Pick(code);
                card.Add(b);
            }

            var close = Widgets.IconButton(scene, "close", Art.ACCENT_PINK, 60);
            close.sfx = false;
            close.SetTopLeft(L + CARD_W - 46, T - 14);
            close.onPress = Close;
            card.Add(close);

            dim.PointerDown += _ => Close();
            onEscape = Close;
            Layout();
            SetVisible(true);
            UiFx.PopIn(scene, card, 0, 0.3f);
            dim.SetAlpha(0);
            var t = scene.tw.Create();
            t.TweenProperty(dim, "alpha", 1, 0.2).SetTrans(Trans.LINEAR).SetEase(EaseKind.IN);
        }

        void Pick(string code)
        {
            Sfx.Play("button_tap");
            Loc.SetLanguage(code);
            onChosen(code);
        }

        public void Close()
        {
            Sfx.Play("button_tap");
            onClosed();
            Destroy();
        }

        public void Destroy()
        {
            dim.Destroy();
            root.Destroy();
        }
    }
}
