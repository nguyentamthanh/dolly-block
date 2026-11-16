// The photo rope: one polaroid per solved level hung from a rope, drag / wheel
// scrolling with inertia, star and gem chips, the menu, the daily gift and the LEVEL N button.
using System;
using System.Collections.Generic;
using UnityEngine;
using CozyBlocks.Core;
using CozyBlocks.Engine;
using CozyBlocks.Render;
using CozyBlocks.Audio;
using CozyBlocks.Platform;
using CozyBlocks.Fx;
using CozyBlocks.UI;

namespace CozyBlocks.Scenes
{
    public sealed class TimelineScene : Scene
    {
        const float GAP = 78, TOP_SPACE = 132, BOTTOM_SPACE = 178, CLICK_SLOP = 12, CHUNK = 1000;

        sealed class Card
        {
            public int index;
            public PhotoCardView view;
            public CanvasView pin;
            public float x, y;
            public bool hasPhoto;
        }

        Container strip;
        List<CanvasView> chunks = new List<CanvasView>();
        List<Card> cards = new List<Card>();
        Graphics2D scrollbar;
        RectObj bgRect;
        float scrollY, contentH, ropeEnd, photoW = 300, photoH = 364;
        CanvasView starChip;
        string starCount = "0";
        DiamondChip gemChip;
        UiButton menuBtn, giftBtn, playBtn;
        CanvasView toastView;
        LabelView toastLabel;
        Overlay overlay;
        bool built;
        int pressId = -1;
        float pressX, pressY, pressScroll;
        bool dragging;
        float velocity, lastMoveY, lastMoveT;
        float starChipW = 96, stripW = 720;

        static float Now() => Time.realtimeSinceStartup * 1000f;

        protected override void Build(object data)
        {
            GameState.EnsureLoaded();
            backgroundColor = Col.Hex("#f9efe6").ToUnity();
            bgRect = AddRect(-40, -40, 10, 10, Art.CREAM.ToUnity());
            bgRect.SetOrigin(0, 0);
            bgRect.SetDepth(-10);
            strip = AddContainer(0, 0);
            strip.SetDepth(2);
            BuildPhotos();
            scrollbar = Add(new Graphics2D());
            scrollbar.SetDepth(Z.pieces + 5);
            BuildTopBar();
            BuildGift();
            BuildPlay();
            BuildToast();
            Relayout();
            scrollY = MaxScroll();
            ApplyScroll();
            InputDown += OnDown;
            InputMove += OnMove;
            InputUp += OnUp;
            InputWheel += (p, dx, dy) =>
            {
                if (overlay != null) return;
                velocity = 0;
                scrollY = ClampScroll(scrollY + dy * 1.2f);
                ApplyScroll();
            };
            playBtn.SetScale(0);
            UiFx.PopIn(this, playBtn, 0.2f);
            var t = tw.Create();
            t.TweenInterval(0.8);
            t.TweenCallback(() => UiFx.Pulse(this, playBtn, 0.035f, 1.2f));
            built = true;
        }

        protected override void OnResize()
        {
            if (!built) return;
            bool atBottom = scrollY >= MaxScroll() - 1;
            Relayout();
            scrollY = atBottom ? MaxScroll() : ClampScroll(scrollY);
            ApplyScroll();
            overlay?.Layout();
        }

        protected override void Update(float time, float deltaMs)
        {
            base.Update(time, deltaMs);
            if (!dragging && Mathf.Abs(velocity) > 5)
            {
                float dt = Mathf.Min(deltaMs, 100) / 1000f;
                scrollY = ClampScroll(scrollY + velocity * dt);
                velocity *= Mathf.Exp(-dt * 4.5f);
                if (scrollY <= 0 || scrollY >= MaxScroll()) velocity = 0;
                ApplyScroll();
            }
            else if (!dragging) velocity = 0;
        }

        // --- building ---

        void BuildPhotos()
        {
            var levels = new SortedSet<int>();
            foreach (var i in GameState.PhotoLevels()) levels.Add(i);
            foreach (var k in GameState.starsAt.Keys) levels.Add(Json.Int(k, 0));
            foreach (var idx in levels)
            {
                var photo = GameState.PhotoFor(idx) ?? new PhotoRecord { stars = GameState.StarsFor(idx), bg = GameState.BgForLevel(idx) };
                AddPhoto(idx, photo, true);
            }
            if (cards.Count == 0) AddPhoto(0, null, false);
        }

        void AddPhoto(int index, PhotoRecord photo, bool hasPhoto)
        {
            var view = new PhotoCardView(300, new PhotoData
            {
                index = index, pieces = photo?.pieces ?? new List<SnapshotEntry>(), bg = photo?.bg ?? 0, stars = photo?.stars ?? 0, empty = photo == null,
            });
            var pin = Add(new CanvasView(0, 0, 30, 70, (ci, v) => PaintPin(ci), 12));
            pin.SetPivot(15, 28);
            strip.Add(view);
            cards.Add(new Card { index = index, view = view, pin = pin, hasPhoto = hasPhoto });
        }

        void PaintPin(CanvasItem ci)
        {
            const float bx = 2, by = 0;
            ci.DrawStyleBox(Art.Box(new Col(0.35f, 0.25f, 0.18f, 0.18f), 7), bx + 2, by + 3, 26, 70);
            ci.DrawStyleBox(Art.Box(Col.Hex("#e5b487"), 7), bx, by, 26, 70);
            ci.DrawLine(15, by + 6, 15, by + 70 - 6, Col.Hex("#c98f5e"), 2);
            ci.DrawStyleBox(Art.Box(Col.Hex("#a97a50"), 3), 0, 28 + 4, 30, 9);
            ci.DrawCircle(15, 28 + 8.5f, 2.2f, Col.Hex("#7d5733"));
        }

        void BuildTopBar()
        {
            starChip = Add(new CanvasView(0, 0, 96, 52, (ci, v) => PaintStarChip(ci, v.ViewW, v.ViewH), 12));
            starChip.SetDepth(Z.pieces + 6);
            SetStarCount(GameState.TotalStars());
            gemChip = new DiamondChip(this, true);
            gemChip.SetDepth(Z.pieces + 6);
            gemChip.SetCount(GameState.diamonds);
            menuBtn = Widgets.IconButton(this, "menu", Art.HUD_BROWN, 64, Col.TRANSPARENT, true);
            menuBtn.SetDepth(Z.pieces + 6);
            menuBtn.onPress = OpenMenu;
        }

        void PaintStarChip(CanvasItem ci, float w, float h)
        {
            var sb = Art.Box(Art.WHITE, 26);
            sb.shadowColor = new Col(0.45f, 0.33f, 0.25f, 0.14f);
            sb.shadowSize = 6;
            sb.shadowOffset = new[] { 0f, 3f };
            ci.DrawStyleBox(sb, 0, 0, w, h);
            const float rowTop = 4;
            float rowH = h - 4 - 6;
            Art.DrawStar(ci, 12 + 15, rowTop + rowH / 2, 14, Art.STAR);
            var st = Fonts.Style(26, Art.HUD_TEXT, Art.TEXT_OUTLINE, 0);
            st.shadowColor = Col.TRANSPARENT;
            Fonts.DrawLabel(ci, starCount, 12 + 30 + 8, rowTop + (rowH - Fonts.LineHeight(26)) / 2, w, HAlign.Left, st);
        }

        void SetStarCount(int n)
        {
            starCount = n.ToString();
            starChipW = Mathf.Max(96, 12 + 30 + 8 + Fonts.TextWidth(starCount, FontKind.Bold, 26) + 16);
            starChip.ResizeView(starChipW, 52);
        }

        void BuildGift()
        {
            giftBtn = new UiButton(this, 76, 76, (ci, w, h, s) =>
            {
                float c = w * 0.5f;
                Art.DrawGift(ci, c, h * 0.5f, 52);
                if (!GameState.CanGift()) ci.DrawRect(0, 0, w, h, Art.CREAM.WithAlpha(0.55f));
                else
                {
                    ci.DrawCircle(c + 24, h * 0.5f - 24, 9, Col.WHITE);
                    ci.DrawCircle(c + 24, h * 0.5f - 24, 6.5f, Col.Hex("#e5534b"));
                }
            }, 8, false);
            giftBtn.SetDepth(Z.pieces + 6);
            giftBtn.onPress = OnGift;
        }

        void BuildPlay()
        {
            playBtn = Widgets.TextButton(this, new TextButtonOpts
            {
                text = Loc.Fmt("level_caps", GameState.highestUnlocked + 1), w = 300, h = 84, accent = Art.HUD_BROWN, flat = true, fontSize = 36,
            });
            playBtn.sfx = false;
            playBtn.SetDepth(Z.pieces + 6);
            playBtn.onPress = OnPlay;
        }

        void BuildToast()
        {
            toastView = Add(new CanvasView(0, 0, 100, 42, (ci, v) => ci.DrawStyleBox(Art.Box(new Col(0.36f, 0.28f, 0.24f, 0.92f), 22), 0, 0, v.ViewW, v.ViewH), 4));
            toastView.SetDepth(Z.toast);
            toastView.SetAlpha(0);
            toastLabel = Widgets.MakeLabel(this, " ", Fonts.Style(20, Art.WHITE, Art.TEXT_OUTLINE, 0), new LabelOpts { align = HAlign.Center });
            toastLabel.SetDepth(Z.toast + 1);
            toastLabel.SetAlpha(0);
        }

        // --- layout / scrolling ---

        float MaxScroll() => Mathf.Max(0, contentH - H);
        float ClampScroll(float y) => Mathf.Clamp(y, 0, MaxScroll());

        void ApplyScroll()
        {
            strip.SetPosition(0, -scrollY);
            foreach (var c in cards) c.pin.SetPosition(c.x + photoW / 2, c.y + 8 - scrollY);
            DrawScrollbar();
        }

        void DrawScrollbar()
        {
            var g = scrollbar;
            g.Clear();
            float max = MaxScroll();
            if (max <= 0) return;
            g.FillStyle(0x736f6b, 1);
            g.FillRect(W - 8, 0, 8, H);
            float grabH = Mathf.Max(24, H * H / contentH);
            float grabY = scrollY / max * (H - grabH);
            g.FillStyle(0xaba9a6, 1);
            g.FillRect(W - 8, grabY, 8, grabH);
        }

        float StripWidth()
        {
            float Probe(float w)
            {
                float pw = Mathf.Clamp(w * 0.56f, 220, 400);
                return Mathf.Max(H, TOP_SPACE + cards.Count * (PhotoCard.HeightFor(pw) + GAP) + BOTTOM_SPACE - GAP);
            }
            return Probe(W) > H ? W - 8 : W;
        }

        void Relayout()
        {
            float sw = StripWidth();
            bgRect.SetPosition(-40, -40);
            bgRect.SetSize(W + 80, H + 80);
            photoW = Mathf.Clamp(sw * 0.56f, 220, 400);
            photoH = PhotoCard.HeightFor(photoW);
            float y = TOP_SPACE;
            for (int i = 0; i < cards.Count; i++)
            {
                var c = cards[i];
                c.view.SetScale(1);
                if (c.view.ViewW != photoW) c.view.ResizeView(photoW, photoH);
                c.view.SetPad(Mathf.Ceil(photoW * 0.06f));
                c.view.SetPivot(photoW / 2, 10);
                c.x = (sw - photoW) / 2;
                c.y = y;
                c.view.SetTopLeft(c.x, c.y);
                c.view.rotation = ((i * 7) % 5 - 2) * 0.007f;
                c.pin.SetDepth(Z.pieces + 1);
                y += photoH + GAP;
            }
            ropeEnd = y;
            contentH = Mathf.Max(H, y + BOTTOM_SPACE - GAP);
            stripW = sw;
            RebuildChunks();
            float FW = W;
            float m = Mathf.Max(18, (FW - 900) * 0.5f);
            starChip.SetPosition(m, 22 + (64 - 52) / 2f);
            gemChip.SetTopLeft(m + starChipW + 10, 22 + (64 - 52) / 2f);
            menuBtn.SetTopLeft(FW - m - 64, 22);
            giftBtn.SetTopLeft(W - 96, H * 0.5f + 40);
            playBtn.SetTopLeft((FW - 300) / 2, H - 44 - 84);
            LayoutToast();
            DrawScrollbar();
        }

        void LayoutToast()
        {
            float lw = toastLabel.ViewW, w = lw + 40;
            toastView.ResizeView(w, 42);
            float y = 110 + (60 - 42) / 2f;
            toastView.SetPosition((W - w) / 2, y);
            toastLabel.SetTopLeft((W - lw) / 2, y + 8);
        }

        void RebuildChunks()
        {
            foreach (var c in chunks) c.Destroy();
            chunks = new List<CanvasView>();
            float w = stripW, total = contentH;
            for (float y0 = 0; y0 < total; y0 += CHUNK)
            {
                float h = Mathf.Min(CHUNK, total - y0);
                float yy = y0;
                var v = new CanvasView(0, y0, w, h, (ci, vv) => PaintStrip(ci, yy, w), 0);
                v.SetDepth(0);
                strip.Add(v);
                chunks.Add(v);
            }
            for (int i = chunks.Count - 1; i >= 0; i--) strip.SendToBack(chunks[i]);
        }

        void PaintStrip(CanvasItem ci, float y0, float w)
        {
            ci.ctx.Save();
            ci.ctx.Translate(0, -y0);
            float cx = w * 0.5f;
            float re = Mathf.Max(ropeEnd, contentH);
            float space = (w - photoW) * 0.5f;
            if (space > 46)
            {
                for (int k = 0; k < cards.Count + 1; k++)
                {
                    float s = Mathf.Min(photoW * 0.4f, space * 1.5f);
                    int side = k % 2;
                    float x = side == 0 ? space * 0.5f : w - space * 0.5f;
                    float y = TOP_SPACE + k * (photoH + GAP) + photoH * (side == 0 ? 0.28f : 0.7f) - GAP * 0.4f;
                    Scenery.Cloud(ci, x, y + 5, s, Col.Hex("#efe2d6"));
                    Scenery.Cloud(ci, x, y, s, Col.WHITE);
                }
            }
            ci.DrawLine(cx, -4, cx, re, Col.Hex("#cda47d"), 9);
            ci.DrawLine(cx - 3, -4, cx - 3, re, Col.Hex("#dfbc99"), 2);
            for (float y = 0; y < re; y += 10)
            {
                if (y + 6 < y0 - 20 || y > y0 + CHUNK + 20) continue;
                ci.DrawLine(cx - 4.5f, y + 1, cx + 4.5f, y + 6, Col.Hex("#a9805a"), 2);
            }
            ci.ctx.Restore();
        }

        // --- pointer ---

        void OnDown(Pointer p, List<GameObj> over)
        {
            if (overlay != null || over.Count > 0 || pressId != -1) return;
            var pt = Logical(p);
            pressId = p.id;
            pressX = pt.x;
            pressY = pt.y;
            pressScroll = scrollY;
            dragging = false;
            velocity = 0;
            lastMoveY = pt.y;
            lastMoveT = Now();
        }

        void OnMove(Pointer p)
        {
            if (p.id != pressId) return;
            var pt = Logical(p);
            if (!dragging && Js.Hypot(pt.x - pressX, pt.y - pressY) > CLICK_SLOP) dragging = true;
            if (!dragging) return;
            scrollY = ClampScroll(pressScroll - (pt.y - pressY));
            float now = Now();
            float dt = (now - lastMoveT) / 1000;
            if (dt > 0.001f)
            {
                float v = -(pt.y - lastMoveY) / dt;
                velocity = velocity * 0.6f + v * 0.4f;
            }
            lastMoveY = pt.y;
            lastMoveT = now;
            ApplyScroll();
        }

        void OnUp(Pointer p)
        {
            if (p.id != pressId) return;
            pressId = -1;
            var pt = Logical(p);
            if (dragging)
            {
                dragging = false;
                if (Now() - lastMoveT > 80) velocity = 0;
                return;
            }
            if (Js.Hypot(pt.x - pressX, pt.y - pressY) > CLICK_SLOP || overlay != null) return;
            float sy = pt.y + scrollY;
            foreach (var c in cards)
            {
                if (!c.hasPhoto) continue;
                if (pt.x >= c.x && pt.x <= c.x + photoW && sy >= c.y && sy <= c.y + photoH)
                {
                    Sfx.Play("button_tap");
                    Sfx.Play("whoosh", -4);
                    GameState.currentLevel = c.index;
                    Go("Game");
                    return;
                }
            }
        }

        // --- actions ---

        void OnPlay()
        {
            Sfx.Play("button_tap");
            Sfx.Play("whoosh", -4);
            GameState.currentLevel = GameState.highestUnlocked;
            Go("Game");
        }

        void OnGift()
        {
            Sfx.Play("button_tap");
            if (!GameState.CanGift())
            {
                Flash(Loc.T("gift_wait"));
                return;
            }
            OpenGift();
        }

        void Flash(string msg, float hold = 1.8f)
        {
            toastLabel.SetText(msg);
            LayoutToast();
            toastView.SetAlpha(1);
            toastLabel.SetAlpha(1);
            UiFx.PopIn(this, toastLabel, 0, 0.25f);
            UiFx.PopIn(this, toastView, 0, 0.25f);
            var t = tw.Create();
            t.TweenInterval(hold);
            t.SetParallel(true);
            t.TweenProperty(toastView, "alpha", 0, 0.4);
            t.TweenProperty(toastLabel, "alpha", 0, 0.4);
        }

        // --- popups ---

        Container OpenPopup(float cardW, float cardH)
        {
            CloseOverlay();
            var ov = new Overlay(this, Z.panel - 200, 0x4d3830, 0.5f);
            overlay = ov;
            ov.dim.PointerDown += _ => CloseOverlay();
            ov.onEscape = CloseOverlay;
            var card = new Container(0, 0) { scene = this };
            ov.root.Add(card);
            var view = new CanvasView(-cardW / 2, -cardH / 2, cardW, cardH, (ci, v) => ci.DrawStyleBox(Art.Box(Art.CREAM, 40), 0, 0, cardW, cardH), 20);
            card.Add(view);
            ov.Layout();
            ov.SetVisible(true);
            UiFx.PopIn(this, card, 0, 0.3f);
            ov.dim.SetAlpha(0);
            var t = tw.Create();
            t.TweenProperty(ov.dim, "alpha", 1, 0.2);
            return card;
        }

        void CloseOverlay()
        {
            if (overlay == null) return;
            overlay.dim.Destroy();
            overlay.root.Destroy();
            overlay = null;
        }

        UiButton PopupButton(string text, float w, Action cb)
        {
            var b = Widgets.TextButton(this, new TextButtonOpts { text = text, w = w, h = 68, accent = Art.HUD_BROWN, flat = true, fontSize = 28 });
            b.sfx = true;
            b.onPress = cb;
            return b;
        }

        void OpenMenu()
        {
            const float cw = 360;
            float titleH = Fonts.LineHeight(34);
            int buttons = PlatformSdk.HideSoundToggle ? 2 : 3;
            float ch = 24 + titleH + 22 + 68 * buttons + 22 * (buttons - 1) + 28;
            var card = OpenPopup(cw, ch);
            float L = -cw / 2, T = -ch / 2;
            var title = Widgets.MakeLabel(this, Loc.T("menu"), Fonts.Style(34, Art.HUD_TEXT, Art.TEXT_OUTLINE, 0), new LabelOpts { align = HAlign.Center, boxW = cw - 56 });
            title.SetTopLeft(L + 28, T + 24);
            card.Add(title);
            float y = T + 24 + titleH + 22;
            var home = PopupButton(Loc.T("home"), 280, () =>
            {
                Sfx.Play("whoosh", -4);
                Go("MainMenu");
            });
            home.SetTopLeft(L + (cw - 280) / 2, y);
            card.Add(home);
            y += 68 + 22;
            if (!PlatformSdk.HideSoundToggle)
            {
                string SoundText() => GameState.soundEnabled ? Loc.T("sound_on") : Loc.T("sound_off");
                float sy = y;
                UiButton soundBtn = PopupButton(SoundText(), 280, () => { });
                void Place()
                {
                    soundBtn.SetTopLeft(L + (cw - 280) / 2, sy);
                    card.Add(soundBtn);
                    soundBtn.onPress = () =>
                    {
                        GameState.soundEnabled = !GameState.soundEnabled;
                        GameState.SaveProgress();
                        Music.Sync();
                        var old = soundBtn;
                        soundBtn = PopupButton(SoundText(), 280, () => { });
                        old.Destroy();
                        Place();
                    };
                }
                Place();
                y += 68 + 22;
            }
            var close = PopupButton(Loc.T("close"), 280, CloseOverlay);
            close.SetTopLeft(L + (cw - 280) / 2, y);
            card.Add(close);
        }

        void OpenGift()
        {
            const float cw = 420;
            float noteH = Fonts.LineHeight(28);
            float ch = 24 + 56 + 22 + 220 + 22 + noteH + 22 + 68 + 28;
            var card = OpenPopup(cw, ch);
            float L = -cw / 2, T = -ch / 2;
            var chip = new DiamondChip(this, true);
            chip.SetCount(GameState.diamonds);
            chip.SetTopLeft(L + 28, T + 24 + (56 - 52) / 2f);
            card.Add(chip);
            var close = Widgets.IconButton(this, "close", Art.HUD_BROWN, 56, Col.TRANSPARENT, true);
            close.SetTopLeft(L + cw - 28 - 56, T + 24);
            close.onPress = CloseOverlay;
            card.Add(close);

            bool opened = false;
            var stage = new CanvasView(L + 28, T + 24 + 56 + 22, cw - 56, 220, (ci, v) =>
            {
                float bob = Mathf.Sin(Now() * 0.004f) * 5;
                if (!opened) Art.DrawGift(ci, v.ViewW / 2, 110 + bob, 190);
                else Art.DrawGem(ci, v.ViewW / 2, 110 - 6, 48);
            }, 10);
            card.Add(stage);
            var redraw = tw.Create().SetLoops();
            redraw.TweenCallback(() => stage.Invalidate());
            redraw.TweenInterval(0.03);

            var note = Widgets.MakeLabel(this, " ", Fonts.Style(28, Art.HUD_TEXT, Art.TEXT_OUTLINE, 0), new LabelOpts { align = HAlign.Center, boxW = cw - 56 });
            note.SetTopLeft(L + 28, T + 24 + 56 + 22 + 220 + 22);
            card.Add(note);

            bool state = false;
            UiButton button = null;
            void MakeButton(string text)
            {
                button?.Destroy();
                button = PopupButton(text, 240, () =>
                {
                    if (state) { CloseOverlay(); return; }
                    state = true;
                    int amount = GameState.OpenGift();
                    opened = true;
                    note.SetText(Loc.Fmt("gems_plus", amount));
                    note.SetTopLeft(L + 28 + (cw - 56 - note.ViewW) / 2, note.GetTopLeft().y);
                    chip.SetCount(GameState.diamonds);
                    gemChip.SetCount(GameState.diamonds);
                    Relayout();
                    UiFx.Bump(this, chip, 0.15f);
                    Sfx.Play("sparkle", -3);
                    Effects.ConfettiBurst(this, W / 2, H / 2, 60);
                    MakeButton(Loc.T("nice_btn"));
                    giftBtn.Refresh();
                });
                button.SetTopLeft(L + (cw - 240) / 2, T + 24 + 56 + 22 + 220 + 22 + noteH + 22);
                card.Add(button);
            }
            MakeButton(Loc.T("open"));
        }
    }
}
