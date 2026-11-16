// Top of the game screen (port of src/objects/Hud.ts): back / help | LEVEL N + tier | gems,
// undo / restart | progress bar | hint with its cost badge, plus the toast pill.
using System;
using UnityEngine;
using CozyBlocks.Core;
using CozyBlocks.Engine;
using CozyBlocks.Render;
using CozyBlocks.Platform;
using CozyBlocks.Fx;
using CozyBlocks.UI;

namespace CozyBlocks.Objects
{
    public sealed class Hud
    {
        const float TOP_SAFE = 16, ROW1_H = 84, ROW2_H = 72, MAX_CONTENT_W = 900, BTN = 64, HUD_DEPTH = 12;

        public Action onUndo = () => { }, onHint = () => { }, onRestart = () => { }, onMenu = () => { }, onHelp = () => { };
        readonly Scene scene;
        readonly UiButton back, help, undo, restart, hint;
        readonly DiamondChip chip;
        readonly CanvasView titlePill, tierPill, progress, toastView;
        readonly LabelView title, tierLabel, progressLabel, toastLabel;
        float safeTop, W = 720;
        string titleText = "", tierText = "";
        Col tierColor = Art.TierColor(0);
        int total, remaining;
        float progressValue;
        int shownDiamonds = -1;
        float toastY, toastX;

        public Hud(Scene scene)
        {
            this.scene = scene;
            GameState.EnsureLoaded();
            UiButton Mk(string kind, Action cb)
            {
                var b = Widgets.IconButton(scene, kind, Art.HUD_BROWN, BTN, Col.TRANSPARENT, true);
                b.SetDepth(HUD_DEPTH);
                b.onPress = cb;
                return b;
            }
            back = Mk("back", () => onMenu());
            help = Mk("help", () => onHelp());
            undo = Mk("undo", () => onUndo());
            restart = Mk("restart", () => onRestart());
            hint = Widgets.IconButton(scene, "search", Art.HUD_BROWN, BTN, Col.TRANSPARENT, true, (ci, w, h, s) => DrawBadge(ci));
            hint.SetDepth(HUD_DEPTH);
            hint.onPress = () => onHint();

            chip = new DiamondChip(scene, true);
            chip.SetDepth(HUD_DEPTH);

            var thin = Fonts.Style(34, Art.HUD_TEXT, Art.TEXT_OUTLINE, 0, FontKind.Thin);
            titlePill = scene.Add(new CanvasView(0, 0, 100, 48, (ci, v) => PaintTitlePill(ci, v.ViewW, v.ViewH), 14));
            titlePill.SetDepth(HUD_DEPTH);
            title = Widgets.MakeLabel(scene, " ", thin, new LabelOpts { align = HAlign.Center });
            title.SetDepth(HUD_DEPTH + 1);

            tierPill = scene.Add(new CanvasView(0, 0, 80, 25, (ci, v) => PaintTierPill(ci, v.ViewW, v.ViewH), 4));
            tierPill.SetDepth(HUD_DEPTH);
            tierLabel = Widgets.MakeLabel(scene, " ", Fonts.Style(17, Art.WHITE, Art.TEXT_OUTLINE, 0), new LabelOpts { align = HAlign.Center });
            tierLabel.SetDepth(HUD_DEPTH + 1);

            progress = scene.Add(new CanvasView(0, 0, 400, 40, (ci, v) => PaintProgress(ci, v.ViewW, v.ViewH), 14));
            progress.SetDepth(HUD_DEPTH);
            progressLabel = Widgets.MakeLabel(scene, " ", Fonts.Style(22, Art.HUD_TEXT, Art.TEXT_OUTLINE, 0, FontKind.Thin), new LabelOpts { align = HAlign.Center });
            progressLabel.SetDepth(HUD_DEPTH + 1);

            toastView = scene.Add(new CanvasView(0, 0, 100, 42, (ci, v) => PaintToast(ci, v.ViewW, v.ViewH), 4));
            toastView.SetDepth(Z.toast);
            toastLabel = Widgets.MakeLabel(scene, " ", Fonts.Style(20, Art.WHITE, Art.TEXT_OUTLINE, 0), new LabelOpts { align = HAlign.Center });
            toastLabel.SetDepth(Z.toast + 1);
            toastView.SetAlpha(0);
            toastLabel.SetAlpha(0);
            SetDiamonds(GameState.diamonds);
        }

        void DrawBadge(CanvasItem ci)
        {
            const float x = 34, y = -8, w = 40, h = 26;
            var st = Fonts.Style(17, Art.WHITE, Art.TEXT_OUTLINE, 0);
            st.shadowColor = Col.TRANSPARENT;
            float top = y + 20 - Fonts.Ascent(17);
            if (GameState.diamonds < GameState.HINT_COST && PlatformSdk.IsRewardedAvailable())
            {
                ci.DrawStyleBox(Art.Box(Art.ACCENT_PRIMARY, 13, 2, Art.WHITE), x, y, w, h);
                Fonts.DrawLabel(ci, "AD", x, top, w, HAlign.Center, st);
                return;
            }
            ci.DrawStyleBox(Art.Box(Art.ACCENT_PINK, 13, 2, Art.WHITE), x, y, w, h);
            Art.DrawGem(ci, x + 11, y + 13, 6.5f);
            Fonts.DrawLabel(ci, GameState.HINT_COST.ToString(), x + 19, top, 30, HAlign.Left, st);
        }

        public float Height() => TOP_SAFE + safeTop + ROW1_H + ROW2_H + 8;
        public void SetSafeTop(float px) => safeTop = px;

        public void Layout(float w)
        {
            W = w;
            float m = Mathf.Max(14, (W - MAX_CONTENT_W) * 0.5f);
            float top = TOP_SAFE + safeTop;
            float r1 = top, r2 = top + ROW1_H + 4;
            back.SetTopLeft(m, r1 + (ROW1_H - BTN) / 2);
            help.SetTopLeft(m + BTN + 4, r1 + (ROW1_H - BTN) / 2);
            chip.SetTopRight(W - m, r1 + (ROW1_H - chip.ch) / 2);
            float titleH = Fonts.LineHeight(34) + 2 + 4;
            float tierH = Fonts.LineHeight(17) + 1 + 3;
            float colH = titleH - 6 + tierH;
            float colTop = r1 + (ROW1_H - colH) / 2;
            LayoutTitle(colTop, titleH);
            LayoutTier(colTop + titleH - 6, tierH);
            undo.SetTopLeft(m, r2 + (ROW2_H - BTN) / 2);
            restart.SetTopLeft(m + BTN + 4, r2 + (ROW2_H - BTN) / 2);
            hint.SetTopLeft(W - m - BTN, r2 + (ROW2_H - BTN) / 2);
            float px = m + 2 * BTN + 4 + 14;
            float pw = W - m - BTN - 14 - px;
            progress.ResizeView(pw, 40);
            progress.SetPosition(px, r2 + (ROW2_H - 40) / 2);
            LayoutProgressLabel(px, r2 + (ROW2_H - 40) / 2, pw, 40);
            toastY = Height() + (56 - (8 + Fonts.LineHeight(20) + 10)) / 2;
            LayoutToast();
        }

        void LayoutTitle(float top, float h)
        {
            float lw = title.ViewW, w = lw + 44;
            titlePill.ResizeView(w, h);
            titlePill.SetPosition((W - w) / 2, top);
            title.SetTopLeft((W - lw) / 2, top + 2);
        }

        void LayoutTier(float top, float h)
        {
            float lw = tierLabel.ViewW, w = lw + 24;
            tierPill.ResizeView(w, h);
            tierPill.SetPosition((W - w) / 2, top);
            tierLabel.SetTopLeft((W - lw) / 2, top + 1);
        }

        void LayoutProgressLabel(float x, float y, float w, float h)
        {
            float lh = progressLabel.ViewH;
            progressLabel.SetTopLeft(x + (w - progressLabel.ViewW) / 2, y + (h - lh) / 2);
        }

        void LayoutToast()
        {
            float lw = toastLabel.ViewW, w = lw + 40;
            toastView.ResizeView(w, 42);
            toastView.SetPosition((W - w) / 2, toastY);
            toastLabel.SetTopLeft((W - lw) / 2, toastY + 8);
            toastX = (W - w) / 2;
        }

        StyleBoxFlat WhitePill(float radius)
        {
            var sb = Art.Box(Art.WHITE, radius);
            sb.shadowColor = new Col(0.45f, 0.33f, 0.25f, 0.14f);
            sb.shadowSize = 6;
            sb.shadowOffset = new[] { 0f, 3f };
            return sb;
        }

        void PaintTitlePill(CanvasItem ci, float w, float h) => ci.DrawStyleBox(WhitePill(34), 0, 0, w, h);

        void PaintTierPill(CanvasItem ci, float w, float h)
        {
            var sb = Art.Box(tierColor, 12);
            sb.border = new[] { 0f, 0f, 0f, 3f };
            sb.borderColor = tierColor.Darkened(0.3f);
            ci.DrawStyleBox(sb, 0, 0, w, h);
        }

        void PaintProgress(CanvasItem ci, float w, float h)
        {
            float rad = h * 0.5f;
            var trough = Art.Box(Art.WHITE, rad);
            trough.shadowColor = new Col(0.45f, 0.33f, 0.25f, 0.12f);
            trough.shadowSize = 5;
            trough.shadowOffset = new[] { 0f, 3f };
            ci.DrawStyleBox(trough, 0, 0, w, h);
            if (progressValue <= 0.001f) return;
            float ix = 5, iy = 5, iw = w - 10, ih = h - 10;
            float fw = Mathf.Max(ih, iw * Mathf.Clamp01(progressValue));
            ci.DrawStyleBox(Art.Box(Art.PaletteFill(Palette.GREEN), ih * 0.5f), ix, iy, fw, ih);
        }

        void PaintToast(CanvasItem ci, float w, float h) => ci.DrawStyleBox(Art.Box(new Col(0.12f, 0.06f, 0.32f, 0.88f), 22), 0, 0, w, h);

        public void SetLevel(int index, bool juice = true)
        {
            titleText = Loc.Fmt("level_caps", index + 1);
            tierText = Loc.TierName(LevelGenerator.TierForLevel(index)).ToUpperInvariant();
            tierColor = Art.TierColor(LevelGenerator.TierForLevel(index));
            title.SetText(titleText);
            tierLabel.SetText(tierText);
            tierPill.Invalidate();
            Layout(W);
            total = 0;
            progressValue = 0;
            progress.Invalidate();
            if (juice) UiFx.PopIn(scene, title, 0.05f);
        }

        public Vector2 DiamondTarget() => chip.GemWorld();

        public void SetDiamonds(int n)
        {
            hint.Refresh();
            if (shownDiamonds < 0)
            {
                shownDiamonds = n;
                chip.SetCount(n);
                Layout(W);
                return;
            }
            if (n == shownDiamonds) return;
            int from = shownDiamonds;
            shownDiamonds = n;
            UiFx.RunKeyed(scene, chip, "count", t =>
            {
                t.TweenMethod(v =>
                {
                    chip.SetCount(Js.RoundI(v));
                    Layout(W);
                }, from, n, 0.25);
            });
            UiFx.Bump(scene, chip, 0.15f);
        }

        public void SetRemaining(int n)
        {
            remaining = n;
            if (n > total) total = n;
            int placed = total - n;
            float target = total <= 0 ? 0 : (float)placed / total;
            progressLabel.SetText(n == 0 ? Loc.T("all_settled") : $"{placed} / {total}");
            LayoutProgressLabel(progress.x, progress.y, progress.ViewW, 40);
            float from = progressValue;
            UiFx.RunKeyed(scene, progress, "bar", t =>
            {
                t.TweenMethod(v =>
                {
                    progressValue = v;
                    progress.Invalidate();
                }, from, target, 0.3).SetTrans(Trans.CUBIC).SetEase(EaseKind.OUT);
            });
        }

        public void FlashMessage(string msg, float hold = 1.6f)
        {
            toastLabel.SetText(msg);
            LayoutToast();
            toastView.SetAlpha(1);
            toastLabel.SetAlpha(1);
            UiFx.PopIn(scene, toastLabel, 0, 0.25f);
            toastView.SetScale(1, 1);
            UiFx.RunKeyed(scene, toastView, "toast", t =>
            {
                t.TweenInterval(hold);
                t.SetParallel(true);
                t.Chain();
                t.TweenProperty(toastView, "alpha", 0, 0.4);
                t.TweenProperty(toastLabel, "alpha", 0, 0.4);
            });
            toastView.SetScale(0, 0);
            UiFx.PopIn(scene, toastView, 0, 0.25f);
        }

        public int Left => remaining;
        public float ToastLeft => toastX;
    }
}
