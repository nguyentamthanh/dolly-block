// How-to-play cards with looping code-drawn animations (port of src/ui/TutorialOverlay.ts).
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
    public sealed class TutorialOverlay : Overlay
    {
        const float CARD_W = 580, CARD_H = 790;
        static readonly Rect STAGE = new Rect(30, 108, 520, 300);
        static readonly Col[] STEP_COLORS = { Art.ACCENT_BLUE, Art.ACCENT_GOLD, Art.ACCENT_PINK, Art.BAD_TINT, Art.ACCENT_PRIMARY };
        const int ROTATE_STEP = 1;
        const float TITLE_SIZE = 42, BODY_SIZE = 26;

        static float Smooth(float x) => x * x * (3 - 2 * x);
        static float C01(float x) => Mathf.Clamp01(x);
        static float Fmod(float a, float b) => a - b * Mathf.Floor(a / b);
        static Vec V(int x, int y) => new Vec(x, y);
        static Vector2 P(float x, float y) => new Vector2(x, y);

        public Action onFinished = () => { };
        readonly Container card;
        readonly CanvasView cardView, stage;
        readonly Container stageHolder;
        UiButton next;
        int step;
        List<int> steps = new List<int> { 0, 1, 2, 3, 4 };
        float t;
        bool active;

        public TutorialOverlay(Scene scene) : base(scene, Z.panel + 40, 0x1a0a47, 0.66f)
        {
            card = new Container(0, 0) { scene = scene };
            root.Add(card);
            float L = -CARD_W / 2, T = -CARD_H / 2;
            cardView = new CanvasView(L, T, CARD_W, CARD_H, (ci, v) => PaintCard(ci), 50);
            card.Add(cardView);
            stageHolder = new Container(L + STAGE.x, T + STAGE.y);
            stage = new CanvasView(0, 0, STAGE.width, STAGE.height, (ci, v) => PaintStage(ci), 0);
            stageHolder.Add(stage);
            card.Add(stageHolder);
            var close = Widgets.IconButton(scene, "close", Art.ACCENT_PINK, 60);
            close.SetTopLeft(L + CARD_W - 46, T - 14);
            close.sfx = false;
            close.onPress = () =>
            {
                Sfx.Play("button_tap");
                Close();
            };
            card.Add(close);
            onEscape = Close;
            SetVisible(false);
        }

        public void Tick(float dt)
        {
            if (!active) return;
            t += dt;
            stage.Invalidate();
        }

        public void ShowTutorial(bool withRotate = true)
        {
            steps = new List<int>();
            for (int i = 0; i < STEP_COLORS.Length; i++) if (withRotate || i != ROTATE_STEP) steps.Add(i);
            Layout();
            active = true;
            SetVisible(true);
            ShowStep(0);
            UiFx.PopIn(scene, card, 0, 0.32f);
        }

        void Close()
        {
            active = false;
            SetVisible(false);
            onFinished();
        }

        void ShowStep(int i)
        {
            step = i;
            t = 0;
            cardView.Invalidate();
            stage.Invalidate();
            float L = -CARD_W / 2, T = -CARD_H / 2;
            stageHolder.SetPosition(L + STAGE.x, T + STAGE.y);
            stageHolder.SetAlpha(1);
            if (i > 0)
            {
                float tx = L + STAGE.x;
                stageHolder.SetPosition(tx + 60, T + STAGE.y);
                stageHolder.SetAlpha(0);
                UiFx.RunKeyed(scene, stageHolder, "slide", tt =>
                {
                    tt.SetParallel(true);
                    tt.TweenProperty(stageHolder, "position", new Vector2(tx, T + STAGE.y), 0.3).SetTrans(Trans.BACK).SetEase(EaseKind.OUT);
                    tt.TweenProperty(stageHolder, "alpha", 1, 0.18);
                });
            }
            next?.Destroy();
            bool last = i == steps.Count - 1;
            string text = last ? Loc.T("lets_play") : Loc.T("next");
            next = Widgets.TextButton(scene, new TextButtonOpts { text = text, w = 340, h = 100, accent = Art.ACCENT_PRIMARY, fontSize = Fonts.FitFontSize(text, 340 - 44, 0, 40, 22) });
            next.sfx = false;
            next.SetTopLeft(L + CARD_W * 0.5f - 170, T + 640);
            next.onPress = OnNext;
            card.Add(next);
        }

        void OnNext()
        {
            Sfx.Play("button_tap");
            if (step < steps.Count - 1) ShowStep(step + 1);
            else Close();
        }

        static LabelStyle Plain(float size, Col color) => new LabelStyle
        {
            size = size, color = color, kind = FontKind.Bold, outlineSize = 0, outlineColor = Col.TRANSPARENT, shadowColor = Col.TRANSPARENT, shadowY = 0, shadowOutline = 0,
        };

        void PaintCard(CanvasItem ci)
        {
            var sb = Art.Box(Art.CARD, 44);
            sb.border = new[] { 0f, 0f, 0f, 12f };
            sb.borderColor = Art.CARD_EDGE;
            sb.shadowColor = new Col(0.05f, 0.02f, 0.2f, 0.4f);
            sb.shadowSize = 26;
            sb.shadowOffset = new[] { 0f, 14f };
            ci.DrawStyleBox(sb, 0, 0, CARD_W, CARD_H);
            Fonts.DrawLabel(ci, Loc.T("how_to_play"), 0, 18, CARD_W, HAlign.Center, Plain(20, Art.INK_SOFT));
            int i = steps[step];
            string title = Loc.T($"t{i + 1}_title");
            string body = Loc.T($"t{i + 1}_body");
            if (i == STEP_COLORS.Length - 1)
            {
                int at = body.IndexOf("%d", StringComparison.Ordinal);
                if (at >= 0) body = body.Substring(0, at) + GameState.HINT_COST + body.Substring(at + 2);
            }
            float titleSize = Fonts.FitFontSize(title, CARD_W - 40, 0, TITLE_SIZE, 22);
            Fonts.DrawLabel(ci, title, 20, 44, CARD_W - 40, HAlign.Center, Fonts.Style(titleSize, STEP_COLORS[i]));
            float bw = CARD_W - 60, bh = 150;
            float bodySize = Fonts.FitFontSize(body, bw, bh, BODY_SIZE, 16, true);
            var st = Plain(bodySize, Art.INK);
            var lines = Wrapped(body, bodySize, bw);
            float lh = Fonts.LineHeight(bodySize);
            float top = 420 + (bh - lines.Count * lh) / 2;
            for (int k = 0; k < lines.Count; k++) Fonts.DrawLabel(ci, lines[k], 30, top + k * lh, bw, HAlign.Center, st);
            const float gap = 30;
            float x0 = CARD_W * 0.5f - gap * (steps.Count - 1) * 0.5f;
            for (int k = 0; k < steps.Count; k++)
            {
                float cx = x0 + k * gap, cy = 584 + 12;
                if (k == step) ci.DrawStyleBox(Art.Box(Art.ACCENT_PINK, 8), cx - 16, cy - 8, 32, 16);
                else ci.DrawCircle(cx, cy, 7, Art.CARD_EDGE.Darkened(0.15f));
            }
        }

        List<string> Wrapped(string text, float size, float w)
        {
            var lines = new List<string>();
            foreach (var para in text.Split('\n'))
            {
                string line = "";
                foreach (var word in para.Split(' '))
                {
                    string trial = line.Length > 0 ? line + " " + word : word;
                    if (Fonts.TextWidth(trial, FontKind.Bold, size) <= w || line.Length == 0) line = trial;
                    else
                    {
                        lines.Add(line);
                        line = word;
                    }
                }
                lines.Add(line);
            }
            return lines;
        }

        void PaintStage(CanvasItem ci)
        {
            switch (steps[step])
            {
                case 0: DrawFill(ci); break;
                case 1: DrawRotate(ci); break;
                case 2: DrawLove(ci); break;
                case 3: DrawHate(ci); break;
                default: DrawWin(ci); break;
            }
        }

        void DrawFill(CanvasItem ci)
        {
            const float cs = 66;
            var cells = new List<Vec>();
            for (int y = 0; y < 2; y++) for (int x = 0; x < 3; x++) cells.Add(V(x, y));
            float ox = (STAGE.width - cs * 3) * 0.5f, oy = 34;
            Art.DrawBoard(ci, cells, ox, oy, cs);
            var row = new List<Vec> { V(0, 0), V(1, 0), V(2, 0) };
            const float period = 2.8f;
            float p = Fmod(t, period);
            float move = Smooth(C01((p - 0.5f) / 0.9f));
            bool placed = p >= 1.4f;
            float sx = ox, sy = oy + cs * 2 + 38, tx = ox, ty = oy + cs;
            float px = sx + (tx - sx) * move, py = sy + (ty - sy) * move;
            Art.DrawPolyomino(ci, ox, oy, cs, row, Palette.TEAL, V(0, 0), Mood.NEUTRAL, 0, false, new PolyominoOptions { happyEyes = placed });
            if (!placed)
            {
                float pulse = 0.35f + 0.25f * Mathf.Sin(t * 6);
                Art.DrawGhost(ci, tx, ty, cs, row, new Col(1, 1, 1, pulse * 0.5f), new Col(1, 1, 1, pulse));
            }
            float hop = placed && p < 1.75f ? -Mathf.Abs(Mathf.Sin((p - 1.4f) * 9)) * 8 : 0;
            Art.DrawPolyomino(ci, px, py + hop, cs, row, Palette.ORANGE, V(2, 0), Mood.NEUTRAL, 0, false, new PolyominoOptions { happyEyes = placed });
            if (!placed) DrawFinger(ci, px + cs * 1.5f, py + cs * 0.6f, p > 0.35f);
        }

        void DrawRotate(CanvasItem ci)
        {
            const float cs = 62, beat = 1.1f;
            var piece = PieceData.Make(0, Palette.PURPLE, new List<Vec> { V(0, 0), V(0, 1), V(0, 2), V(1, 2) });
            piece.rot = (int)Mathf.Floor(t / beat) % 4;
            var cells = piece.LocalCells();
            var bb = piece.Bbox();
            float bw = bb.x * cs, bh = bb.y * cs;
            float ox = (STAGE.width - bw) * 0.5f, oy = (STAGE.height - bh) * 0.5f + 8;
            float since = Fmod(t, beat);
            float squash = 1 - 0.08f * Mathf.Max(0, 1 - since / 0.15f);
            float cx = ox + bw / 2, cy = oy + bh / 2;
            ci.DrawSetTransform(cx, cy, 0, squash, squash);
            Art.DrawPolyomino(ci, -bw / 2, -bh / 2, cs, cells, Palette.PURPLE, piece.LocalEye(), Mood.NEUTRAL, 0, false);
            ci.DrawResetTransform();
            float r = Mathf.Max(bw, bh) * 0.5f + 34;
            float a0 = -Mathf.PI * 0.5f + t * 0.8f;
            ci.DrawArc(cx, cy, r, a0, a0 + Mathf.PI * 1.4f, 40, Art.ACCENT_GOLD.WithAlpha(0.9f), 7);
            float tipA = a0 + Mathf.PI * 1.4f;
            float tx = cx + Mathf.Cos(tipA) * r, ty = cy + Mathf.Sin(tipA) * r;
            float fx = -Mathf.Sin(tipA), fy = Mathf.Cos(tipA), sx = Mathf.Cos(tipA), sy = Mathf.Sin(tipA);
            ci.DrawColoredPolygon(new[] { P(tx + fx * 16, ty + fy * 16), P(tx - fx * 4 + sx * 13, ty - fy * 4 + sy * 13), P(tx - fx * 4 - sx * 13, ty - fy * 4 - sy * 13) }, Art.ACCENT_GOLD);
            DrawFinger(ci, cx + cs * 0.2f, cy + cs * 0.3f, since < 0.2f, since);
        }

        void DrawLove(CanvasItem ci)
        {
            const float cs = 66;
            var pair = new List<Vec> { V(0, 0), V(1, 0) };
            const float period = 2.6f;
            float p = Fmod(t, period);
            float slide = Smooth(C01((p - 0.4f) / 0.7f));
            bool touching = p >= 1.1f;
            const float y = 128;
            float loverX = STAGE.width * 0.5f - cs * 2;
            float friendFrom = STAGE.width + 10, friendTo = loverX + cs * 2;
            float friendX = friendFrom + (friendTo - friendFrom) * slide;
            float hop = touching && p < 1.45f ? -Mathf.Abs(Mathf.Sin((p - 1.1f) * 9)) * 10 : 0;
            Art.DrawPolyomino(ci, loverX, y + hop, cs, pair, Palette.YELLOW, V(0, 0), Mood.AFFECTIONATE, Palette.BLUE, false, new PolyominoOptions { happyEyes = touching });
            Art.DrawPolyomino(ci, friendX, y, cs, pair, Palette.BLUE, V(1, 0), Mood.NEUTRAL, 0, false);
            if (touching)
            {
                DrawVerdict(ci, STAGE.width * 0.5f, 54, true);
                DrawHeartBurst(ci, loverX + cs, y - 6, p - 1.1f);
            }
        }

        void DrawHate(CanvasItem ci)
        {
            const float cs = 66;
            var pair = new List<Vec> { V(0, 0), V(1, 0) };
            const float period = 3.4f;
            float p = Fmod(t, period);
            const float y = 128;
            float haterX = STAGE.width * 0.5f - cs * 2;
            float nearX = haterX + cs * 2, farX = STAGE.width + 10;
            float tIn = C01((p - 0.3f) / 0.6f), tOut = C01((p - 2.3f) / 0.6f);
            float k = Smooth(tIn - tOut);
            float otherX = farX + (nearX - farX) * k;
            bool touching = p >= 0.9f && p < 2.3f;
            float shiver = touching ? Mathf.Sin(t * 48) * 3 : 0;
            Art.DrawPolyomino(ci, haterX + shiver, y, cs, pair, Palette.PURPLE, V(0, 0), Mood.HOSTILE, Palette.GREEN, touching, new PolyominoOptions { ringPulse = 0.75f + 0.25f * Mathf.Sin(t * 8) });
            Art.DrawPolyomino(ci, otherX, y, cs, pair, Palette.GREEN, V(1, 0), Mood.NEUTRAL, 0, false);
            if (touching) DrawVerdict(ci, STAGE.width * 0.5f, 54, false);
            else if (p >= 2.9f || p < 0.3f) DrawVerdict(ci, STAGE.width * 0.5f, 54, true);
        }

        void DrawWin(CanvasItem ci)
        {
            const float period = 2.4f;
            float p = Fmod(t, period);
            float cx = STAGE.width * 0.5f;
            for (int i = 0; i < 3; i++)
            {
                float appear = C01((p - i * 0.25f) / 0.2f);
                float r = (i == 1 ? 34 : 28) * (0.6f + 0.4f * appear);
                Art.DrawStarFancy(ci, cx + (i - 1) * 92, i == 1 ? 70 : 84, r, appear >= 1);
            }
            var specs = new (string kind, Col col, string label, float x)[]
            {
                ("undo", Art.ACCENT_BLUE, Loc.T("undo"), cx - 90),
                ("hint", Art.ACCENT_GOLD, Loc.T("hint"), cx + 90),
            };
            foreach (var s in specs)
            {
                ci.DrawCircle(s.x, 206, 38, s.col.Darkened(0.28f));
                ci.DrawCircle(s.x, 200, 38, s.col);
                Art.DrawIcon(ci, s.kind, s.x, 202, 12, s.col.Darkened(0.45f));
                Art.DrawIcon(ci, s.kind, s.x, 200, 12, Art.WHITE);
                Fonts.DrawString(ci, s.label, s.x - 60, 274, 120, HAlign.Center, FontKind.Bold, 24, Art.INK);
            }
        }

        void DrawFinger(CanvasItem ci, float x, float y, bool pressed, float age = 0)
        {
            if (pressed)
            {
                float rr = 30 + age * 90;
                float a = age > 0 ? C01(1 - age / 0.4f) * 0.8f : 0.6f;
                ci.DrawArc(x, y, rr, 0, Mathf.PI * 2, 32, new Col(1, 1, 1, a), 5);
            }
            float r = pressed ? 22 : 25;
            ci.DrawCircle(x, y + 4, r + 4, new Col(0.05f, 0.02f, 0.2f, 0.25f));
            ci.DrawCircle(x, y, r + 4, Art.INK);
            ci.DrawCircle(x, y, r, Art.WHITE);
            ci.DrawCircle(x - r * 0.3f, y - r * 0.3f, r * 0.25f, new Col(1, 1, 1, 0.9f));
        }

        void DrawVerdict(CanvasItem ci, float x, float y, bool good)
        {
            var col = good ? Art.OK_TINT : Art.BAD_TINT;
            ci.DrawCircle(x, y + 4, 30, col.Darkened(0.3f));
            ci.DrawCircle(x, y, 30, col);
            const float w = 8;
            if (good) ci.DrawPolyline(new[] { P(x - 13, y), P(x - 3, y + 10), P(x + 14, y - 10) }, Art.WHITE, w);
            else
            {
                ci.DrawLine(x - 11, y - 11, x + 11, y + 11, Art.WHITE, w);
                ci.DrawLine(x + 11, y - 11, x - 11, y + 11, Art.WHITE, w);
            }
        }

        void DrawHeartBurst(CanvasItem ci, float x, float y, float age)
        {
            if (age > 1.2f) return;
            float a = C01(1 - age / 1.2f);
            for (int i = 0; i < 3; i++)
                Art.DrawHeart(ci, x + (i - 1) * 34, y - age * 70 - Mathf.Abs(i - 1) * 8, 22, Art.ACCENT_PINK.WithAlpha(a));
        }
    }
}
