// "Out of diamonds" popup offering a rewarded ad (port of src/ui/AdRewardPanel.ts).
using System;
using CozyBlocks.Core;
using CozyBlocks.Engine;
using CozyBlocks.Render;
using CozyBlocks.Audio;
using CozyBlocks.Platform;
using CozyBlocks.Fx;

namespace CozyBlocks.UI
{
    public sealed class AdRewardPanel : Overlay
    {
        const float CARD_W = 500, CARD_H = 420;
        public Action<bool, float, float> onFinished = (g, x, y) => { };
        public Action onClosed = () => { };
        readonly Container card;
        readonly UiButton watch;
        bool waiting;

        public AdRewardPanel(Scene s) : base(s, Z.panel + 60, 0x1a0a47, 0.62f)
        {
            card = new Container(0, 0) { scene = s };
            root.Add(card);
            float L = -CARD_W / 2, T = -CARD_H / 2;
            string title = Loc.T("ad_title");
            float titleSize = Fonts.FitFontSize(title, CARD_W - 40 - 10, 0, 38, 22);
            string body = Loc.Fmt("ad_body", GameState.AD_REWARD);
            float bodySize = Fonts.FitFontSize(body, CARD_W - 40, 70, 26, 16, true);
            string watchText = Loc.T("watch_ad");
            float watchSize = Fonts.FitFontSize(watchText, 320 - 100, 0, 36, 20);
            var bodyStyle = new LabelStyle
            {
                size = bodySize, color = Art.INK_SOFT, kind = FontKind.Bold, outlineSize = 0, outlineColor = Col.TRANSPARENT,
                shadowColor = Col.TRANSPARENT, shadowY = 0, shadowOutline = 0,
            };
            var cardView = new CanvasView(L, T, CARD_W, CARD_H, (ci, v) =>
            {
                var sb = Art.Box(Art.CARD, 44);
                sb.border = new[] { 0f, 0f, 0f, 12f };
                sb.borderColor = Art.CARD_EDGE;
                sb.shadowColor = new Col(0.05f, 0.02f, 0.2f, 0.4f);
                sb.shadowSize = 26;
                sb.shadowOffset = new[] { 0f, 14f };
                ci.DrawStyleBox(sb, 0, 0, CARD_W, CARD_H);
                Fonts.DrawLabel(ci, title, 20, 34, CARD_W - 40, HAlign.Center, Fonts.Style(titleSize, Art.ACCENT_PINK));
                Art.DrawGem(ci, CARD_W * 0.5f, 108 + 45, 36);
                Fonts.DrawLabel(ci, body, 20, 206, CARD_W - 40, HAlign.Center, bodyStyle, CARD_W - 40);
            }, 50);
            card.Add(cardView);

            watch = Widgets.TextButton(s, new TextButtonOpts
            {
                text = watchText, w = 320, h = 96, accent = Art.ACCENT_PRIMARY, fontSize = watchSize,
                extra = (ci, w, h, state) =>
                {
                    bool down = state == ButtonState.Pressed;
                    float cx = 42, cy = h * 0.5f - 3 + (down ? 4 : 0);
                    Art.DrawIcon(ci, "play", cx, cy + 2, 18, Art.ACCENT_PRIMARY.Darkened(0.45f));
                    Art.DrawIcon(ci, "play", cx, cy, 18, Art.WHITE);
                },
            });
            watch.sfx = false;
            watch.SetTopLeft(L + CARD_W * 0.5f - 160, T + 292);
            watch.onPress = OnWatch;
            card.Add(watch);

            var close = Widgets.IconButton(s, "close", Art.ACCENT_PINK, 60);
            close.SetTopLeft(L + CARD_W - 46, T - 14);
            close.onPress = () => { Hide(); onClosed(); };
            card.Add(close);
            onEscape = () =>
            {
                if (waiting) return;
                Hide();
                onClosed();
            };
        }

        public void Show()
        {
            Layout();
            waiting = false;
            watch.SetEnabled(true);
            SetVisible(true);
            UiFx.PopIn(scene, card, 0, 0.3f);
        }

        public void Hide() => SetVisible(false);

        void OnWatch()
        {
            if (waiting) return;
            Sfx.Play("button_tap");
            waiting = true;
            watch.SetEnabled(false);
            PlatformSdk.ShowRewarded(OnRewarded);
        }

        void OnRewarded(bool granted)
        {
            waiting = false;
            watch.SetEnabled(true);
            float fromX = root.x - CARD_W / 2 + CARD_W * 0.5f;
            float fromY = root.y - CARD_H / 2 + 153;
            if (granted) GameState.GrantAdReward();
            Hide();
            onFinished(granted, fromX, fromY);
        }
    }
}
