// The win screen as a photo shoot: viewfinder, shutter, flash, the polaroid
// dropping in, stars, the reward count and the backdrop arrows.
using System;
using System.Collections.Generic;
using UnityEngine;
using CozyBlocks.Core;
using CozyBlocks.Engine;
using CozyBlocks.Render;
using CozyBlocks.Audio;
using CozyBlocks.Fx;

namespace CozyBlocks.UI
{
    public sealed class LevelCompletePanel
    {
        const float PHOTO_MAX_W = 440, PHOTO_MIN_W = 230, DEPTH = Z.panel;

        public Action onNext = () => { };
        public Action<float, float, int> onRewardBurst = (x, y, n) => { };

        readonly Scene scene;
        readonly RectObj block, cream, flash, bladeTop, bladeBottom;
        readonly Container column;
        readonly CanvasView pillBg;
        readonly LabelView pillLabel, countLabel;
        PhotoCardView photo;
        readonly UiButton prev, fwd, cont;
        readonly Graphics2D finder;
        int index;
        int lastShown = -1;
        List<Tween> tweens = new List<Tween>();
        float photoRestX, photoRestY, photoW = 300, gemX, gemY;

        static uint Rgb(Col c)
        {
            var q = c.Css();
            return ((uint)Js.RoundI(q.r * 255) << 16) | ((uint)Js.RoundI(q.g * 255) << 8) | (uint)Js.RoundI(q.b * 255);
        }

        public LevelCompletePanel(Scene s)
        {
            scene = s;
            block = s.AddRect(0, 0, 10, 10, new Color(1, 1, 1, 0.001f));
            block.SetOrigin(0, 0); block.SetDepth(DEPTH); block.SetInteractive();
            cream = s.AddRect(0, 0, 10, 10, Art.CREAM.ToUnity());
            cream.SetOrigin(0, 0); cream.SetDepth(DEPTH + 0.1f);
            column = s.AddContainer(0, 0);
            column.SetDepth(DEPTH + 0.2f);

            var thin = Fonts.Style(26, Art.HUD_TEXT, Art.TEXT_OUTLINE, 0, FontKind.Thin);
            pillBg = new CanvasView(0, 0, 200, 54, (ci, v) =>
            {
                var sb = Art.Box(Art.WHITE, 40);
                sb.shadowColor = new Col(0.45f, 0.33f, 0.25f, 0.12f);
                sb.shadowSize = 6;
                sb.shadowOffset = new[] { 0f, 3f };
                ci.DrawStyleBox(sb, 0, 0, v.ViewW, v.ViewH);
                Art.DrawGem(ci, v.ViewW - 22 - 17, v.ViewH / 2 - 1, 11);
            }, 14);
            pillLabel = Widgets.MakeLabel(s, Loc.T("well_done"), thin, new LabelOpts { align = HAlign.Left });
            countLabel = Widgets.MakeLabel(s, "0", thin, new LabelOpts { align = HAlign.Left });
            prev = Widgets.IconButton(s, "back", Art.HUD_BROWN, 52, Col.TRANSPARENT, true);
            prev.onPress = () => CycleBg(-1);
            prev.sfx = false;
            fwd = Widgets.IconButton(s, "forward", Art.HUD_BROWN, 52, Col.TRANSPARENT, true);
            fwd.onPress = () => CycleBg(1);
            fwd.sfx = false;
            cont = Widgets.TextButton(s, new TextButtonOpts { text = Loc.T("continue"), w = 250, h = 76, accent = Art.HUD_BROWN, flat = true, fontSize = 30 });
            cont.onPress = () => onNext();
            column.AddAll(pillBg, pillLabel, countLabel, prev, fwd, cont);

            finder = s.Add(new Graphics2D());
            finder.SetDepth(DEPTH + 0.3f);
            flash = s.AddRect(0, 0, 10, 10, Color.white);
            flash.SetOrigin(0, 0); flash.SetDepth(DEPTH + 0.4f); flash.SetAlpha(0);
            var blade = Col.Hex("#2e231c").ToUnity();
            bladeTop = s.AddRect(0, 0, 10, 10, blade);
            bladeTop.SetOrigin(0, 0); bladeTop.SetDepth(DEPTH + 0.5f); bladeTop.SetVisible(false);
            bladeBottom = s.AddRect(0, 0, 10, 10, blade);
            bladeBottom.SetOrigin(0, 0); bladeBottom.SetDepth(DEPTH + 0.5f); bladeBottom.SetVisible(false);
            Layout();
            HidePanel();
        }

        public void Layout()
        {
            float W = scene.W, H = scene.H;
            foreach (var r in new[] { block, cream, flash }) { r.SetPosition(0, 0); r.SetSize(W, H); }
            LayoutColumn();
        }

        Vector2 LayoutPill()
        {
            float lw = pillLabel.ViewW, cw = countLabel.ViewW;
            float w = 26 + lw + 8 + cw + 8 + 34 + 22;
            float lh = Fonts.LineHeight(26);
            float h = 8 + Mathf.Max(lh, 34) + 10;
            return new Vector2(w, h);
        }

        void LayoutColumn()
        {
            float W = scene.W, H = scene.H;
            photoW = Mathf.Clamp(Mathf.Min(W - 2 * 52 - 2 * 14 - 24, H * 0.42f), PHOTO_MIN_W, PHOTO_MAX_W);
            float photoH = PhotoCard.HeightFor(photoW);
            if (photo != null && photo.ViewW != photoW)
            {
                photo.ResizeView(photoW, photoH);
                photo.SetPad(Mathf.Ceil(photoW * 0.06f));
            }
            photo?.SetPivot(photoW / 2, photoH * 0.08f);
            var pill = LayoutPill();
            float colH = pill.y + 40 + photoH + 40 + 76;
            float top = (H - colH) / 2;
            float px = (W - pill.x) / 2;
            pillBg.ResizeView(pill.x, pill.y);
            pillBg.SetTopLeft(px, top);
            float lh = Fonts.LineHeight(26);
            float ty = top + 8 + (Mathf.Max(lh, 34) - lh) / 2;
            pillLabel.SetTopLeft(px + 26, ty);
            countLabel.SetTopLeft(px + 26 + pillLabel.ViewW + 8, ty);
            gemX = px + pill.x - 22 - 17;
            gemY = top + pill.y / 2 - 1;
            float rowW = 52 + 14 + photoW + 14 + 52;
            float rowX = (W - rowW) / 2;
            float rowY = top + pill.y + 40;
            prev.SetTopLeft(rowX, rowY + (photoH - 52) / 2);
            fwd.SetTopLeft(rowX + rowW - 52, rowY + (photoH - 52) / 2);
            photoRestX = rowX + 52 + 14;
            photoRestY = rowY;
            photo?.SetTopLeft(photoRestX, photoRestY);
            cont.SetTopLeft((W - 250) / 2, rowY + photoH + 40);
        }

        public void HidePanel()
        {
            KillTweens();
            foreach (var o in new GameObj[] { block, cream, flash }) o.SetVisible(false);
            column.SetVisible(false);
            finder.SetVisible(false);
            bladeTop.SetVisible(false);
            bladeBottom.SetVisible(false);
            block.inputEnabled = false;
        }

        public void ShowPanel(int idx, string tierName, int stars, int diamondsGained)
        {
            KillTweens();
            index = idx;
            var photoRec = GameState.PhotoFor(idx) ?? new PhotoRecord { stars = stars, bg = GameState.BgForLevel(idx) };
            photo?.Destroy();
            photo = new PhotoCardView(300, new PhotoData { index = idx, pieces = photoRec.pieces, bg = photoRec.bg, stars = 0, empty = false });
            photo.SetDepth(DEPTH + 0.2f);
            column.Add(photo);
            Layout();
            countLabel.SetText("0");
            LayoutColumn();
            lastShown = -1;

            foreach (var o in new GameObj[] { block, flash }) o.SetVisible(true);
            block.inputEnabled = true;
            cream.SetVisible(true); cream.SetAlpha(0);
            column.SetVisible(true); column.SetAlpha(0);
            flash.SetAlpha(0);
            photo.SetAlpha(0);
            cont.SetScale(0);
            SetFinder(0);
            SetShutter(0);
            finder.SetVisible(true);

            var seq = scene.tw.Create();
            tweens.Add(seq);
            seq.TweenMethod(SetFinder, 0, 1, 0.42).SetTrans(Trans.CUBIC).SetEase(EaseKind.OUT);
            seq.TweenCallback(() => Sfx.Play("focus", -4));
            seq.TweenInterval(0.16);
            seq.TweenCallback(() => Sfx.Play("shutter", -1));
            seq.TweenMethod(SetShutter, 0, 1, 0.07);
            seq.TweenCallback(() => RevealPhoto(stars, diamondsGained));
        }

        void RevealPhoto(int stars, int gained)
        {
            var ph = photo;
            finder.SetVisible(false);
            cream.SetAlpha(1);
            column.SetAlpha(1);
            ph.SetScale(0.72f, 0.72f);
            ph.rotation = -0.14f;
            float tlx = photoRestX, tly = photoRestY;
            ph.SetTopLeft(tlx, tly + 70);
            var restPos = new Vector2(tlx + ph.ViewW / 2, tly + ph.ViewH * 0.08f);
            flash.SetAlpha(1);

            var entry = scene.tw.Create().SetParallel(true);
            tweens.Add(entry);
            entry.TweenMethod(SetShutter, 1, 0, 0.12);
            entry.TweenProperty(flash, "alpha", 0, 0.5);
            entry.TweenProperty(ph, "alpha", 1, 0.1).SetDelay(0.08);
            entry.TweenProperty(ph, "scale", new Vector2(1, 1), 0.5).SetDelay(0.08).SetTrans(Trans.BACK).SetEase(EaseKind.OUT);
            entry.TweenProperty(ph, "position", restPos, 0.5).SetDelay(0.08).SetTrans(Trans.BACK).SetEase(EaseKind.OUT);
            entry.TweenProperty(ph, "rotation", 0, 0.7).SetDelay(0.08).SetTrans(Trans.ELASTIC).SetEase(EaseKind.OUT);
            entry.TweenProperty(cont, "scale", new Vector2(1, 1), 0.36).SetDelay(0.9).SetTrans(Trans.BACK).SetEase(EaseKind.OUT);
            entry.Chain().TweenCallback(() => UiFx.Pulse(scene, cont, 0.04f, 1.1f));

            var post = scene.tw.Create();
            tweens.Add(post);
            post.TweenInterval(0.62);
            post.TweenCallback(() =>
            {
                Sfx.Play("sparkle", -4);
                Effects.ConfettiRain(scene, 0, 0, scene.W, 70, DEPTH + 20);
            });
            for (int i = 0; i < stars; i++)
            {
                int k = i;
                post.TweenInterval(0.2);
                post.TweenCallback(() => StarLanded(k));
            }
            post.TweenInterval(0.2);
            post.TweenCallback(() => StartCount(gained));
        }

        void SetFinder(float k)
        {
            var g = finder;
            g.Clear();
            float W = scene.W, H = scene.H;
            var outer = new Rect(26, 26, W - 52, H - 52);
            float iw = W * 0.8f, ih = H * 0.56f;
            var inner = new Rect(W * 0.5f - iw / 2, H * 0.47f - ih / 2, iw, ih);
            float L(float a, float b) => a + (b - a) * k;
            var r = new Rect(L(outer.x, inner.x), L(outer.y, inner.y), L(outer.width, inner.width), L(outer.height, inner.height));
            uint col = Rgb(Col.Hex("#5b4739"));
            float alpha = Mathf.Clamp01(k * 6) * 0.9f;
            float arm = 52 - 14 * k;
            const float w = 6;
            var corners = new[]
            {
                (r.x, r.y, 1f, 0f, 0f, 1f), (r.x + r.width, r.y, -1f, 0f, 0f, 1f),
                (r.x + r.width, r.y + r.height, -1f, 0f, 0f, -1f), (r.x, r.y + r.height, 1f, 0f, 0f, -1f),
            };
            g.LineStyle(w, col, alpha);
            foreach (var (px, py, ax, ay, bx, by) in corners)
            {
                g.BeginPath();
                g.MoveTo(px + ax * arm, py + ay * arm);
                g.LineTo(px, py);
                g.LineTo(px + bx * arm, py + by * arm);
                g.StrokePath();
                g.FillStyle(col, alpha);
                g.FillCircle(px, py, w * 0.5f);
            }
            float mx = r.x + r.width / 2, my = r.y + r.height / 2;
            g.LineStyle(3, col, alpha);
            g.BeginPath();
            g.MoveTo(mx - 14, my);
            g.LineTo(mx + 14, my);
            g.MoveTo(mx, my - 14);
            g.LineTo(mx, my + 14);
            g.StrokePath();
            if (k > 0.85f)
            {
                var b = new Rect(mx - 44, my - 44, 88, 88);
                g.LineStyle(3, col, 0.75f);
                var bc = new[]
                {
                    (b.x, b.y, 1f, 0f, 0f, 1f), (b.x + b.width, b.y, -1f, 0f, 0f, 1f),
                    (b.x + b.width, b.y + b.height, -1f, 0f, 0f, -1f), (b.x, b.y + b.height, 1f, 0f, 0f, -1f),
                };
                foreach (var (qx, qy, ax, ay, bx, by) in bc)
                {
                    g.BeginPath();
                    g.MoveTo(qx + ax * 18, qy + ay * 18);
                    g.LineTo(qx, qy);
                    g.LineTo(qx + bx * 18, qy + by * 18);
                    g.StrokePath();
                }
            }
        }

        void SetShutter(float k)
        {
            float W = scene.W, H = scene.H;
            float half = H * 0.5f * k;
            bladeTop.SetPosition(0, 0); bladeTop.SetSize(W, half + 1);
            bladeBottom.SetPosition(0, H - half - 1); bladeBottom.SetSize(W, half + 1);
            bladeTop.SetVisible(k > 0);
            bladeBottom.SetVisible(k > 0);
        }

        void StarLanded(int i)
        {
            var ph = photo;
            ph.SetStars(i + 1);
            Sfx.Play("star_slam", -2, 1 + i * 0.12f);
            var sp = ph.StarPosition(i);
            float rot = ph.rotation;
            float cx = sp.x * Mathf.Cos(rot) - sp.y * Mathf.Sin(rot) + photoRestX;
            float cy = sp.x * Mathf.Sin(rot) + sp.y * Mathf.Cos(rot) + photoRestY;
            Effects.StarSparkle(scene, cx, cy, Art.STAR, 10, 1.1f, DEPTH + 20);
            UiFx.RunKeyed(scene, ph, "star", t =>
            {
                t.TweenProperty(ph, "scale", new Vector2(1.03f, 1.03f), 0.06);
                t.TweenProperty(ph, "scale", new Vector2(1, 1), 0.18).SetTrans(Trans.BACK).SetEase(EaseKind.OUT);
            });
        }

        void StartCount(int total)
        {
            var t = scene.tw.Create();
            tweens.Add(t);
            t.TweenMethod(SetCount, 0, total, 0.35);
            t.TweenCallback(() =>
            {
                UiFx.Bump(scene, countLabel, 0.12f);
                onRewardBurst(gemX, gemY, total);
            });
        }

        void SetCount(float v)
        {
            int shown = Js.RoundI(v);
            countLabel.SetText(shown.ToString());
            LayoutColumn();
            if (shown != lastShown)
            {
                lastShown = shown;
                Sfx.Play("diamond_tick", -3, 1 + shown * 0.04f);
            }
        }

        void CycleBg(int dir)
        {
            var ph = photo;
            var owned = GameState.unlockedBgs;
            if (ph == null || owned.Count == 0) return;
            int at = owned.IndexOf(ph.photo.bg);
            int nxt = owned[(((at + dir) % owned.Count) + owned.Count) % owned.Count];
            ph.SetBg(nxt);
            GameState.SetPhotoBg(index, nxt);
            Sfx.Play("button_tap", -4, 1 + 0.1f * dir);
            UiFx.RunKeyed(scene, ph, "cycle", t =>
            {
                t.TweenProperty(ph, "rotation", 0.03f * dir, 0.06);
                t.TweenProperty(ph, "rotation", 0, 0.2).SetTrans(Trans.BACK).SetEase(EaseKind.OUT);
            });
        }

        void KillTweens()
        {
            foreach (var t in tweens) if (t.valid) t.Kill();
            tweens = new List<Tween>();
            if (photo != null) UiFx.StopAll(photo);
        }
    }
}
