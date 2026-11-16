// The front door: one painted artwork in four framings that covers any window,
// pinned to the top, with the top bar and the PLAY / level / PHOTOS column.
using System.Collections.Generic;
using UnityEngine;
using CozyBlocks.Core;
using CozyBlocks.Engine;
using CozyBlocks.Render;
using CozyBlocks.UI;
using CozyBlocks.Audio;
using CozyBlocks.Platform;
using CozyBlocks.Fx;

namespace CozyBlocks.Scenes
{
    public sealed class MainMenuScene : Scene
    {
        static readonly (string key, float below)[] FRAMES = { ("home_bg", 0.6f), ("home_bg_34", 0.87f), ("home_bg_sq", 1.5f), ("home_bg_wide", 1000) };
        static readonly Dictionary<string, Texture2D> textures = new Dictionary<string, Texture2D>();

        ImageObj art;
        string artKey = "";
        UiButton soundBtn, lang, play, photos;
        DiamondChip chip;
        LabelView levelLabel;
        bool built;

        public static Texture2D ArtTexture(string key)
        {
            if (textures.TryGetValue(key, out var t) && t != null) return t;
            var ta = Resources.Load<TextAsset>("Art/" + key);
            t = new Texture2D(2, 2, TextureFormat.RGBA32, false, true) { filterMode = FilterMode.Bilinear, wrapMode = TextureWrapMode.Clamp };
            t.LoadImage(ta.bytes, false);
            textures[key] = t;
            return t;
        }

        protected override void Build(object data)
        {
            art = null;
            artKey = "";
            built = false;
            GameState.EnsureLoaded();
            backgroundColor = Col.Hex("#fad6f2").ToUnity();
            BuildTopBar();
            BuildButtons();
            DoLayout();
            FitArt(true);
            built = true;
            play.SetScale(0);
            UiFx.PopIn(this, play, 0.2f);
            var t = tw.Create();
            t.TweenInterval(0.7);
            t.TweenCallback(() => UiFx.Pulse(this, play, 0.05f, 1.1f));
            UiFx.PopIn(this, levelLabel, 0.3f);
            UiFx.PopIn(this, photos, 0.38f);
        }

        protected override void OnResize()
        {
            if (!built) return;
            DoLayout();
            FitArt(false);
        }

        void FitArt(bool fade)
        {
            float aspect = W / H;
            var frame = FRAMES[FRAMES.Length - 1];
            foreach (var f in FRAMES) if (aspect < f.below) { frame = f; break; }
            if (art != null && artKey != frame.key) { art.Destroy(); art = null; }
            var tex = ArtTexture(frame.key);
            if (art == null)
            {
                art = Add(new ImageObj(0, 0, tex));
                art.SetOrigin(0, 0);
                art.SetDepth(0);
                artKey = frame.key;
                if (fade)
                {
                    art.SetAlpha(0);
                    var t = tw.Create();
                    t.TweenProperty(art, "alpha", 1, 0.25);
                }
            }
            float tw0 = tex.width, th = tex.height;
            float s = Mathf.Max(W / tw0, H / th);
            art.SetDisplaySize(tw0 * s, th * s);
            art.SetPosition((W - tw0 * s) * 0.5f, 0);
            PlatformSdk.SetLoadingProgress(100);
            PlatformSdk.SendGameReady();
        }

        void BuildTopBar()
        {
            soundBtn = Widgets.IconButton(this, SoundKind(), Col.TRANSPARENT, 64);
            soundBtn.SetDepth(Z.pieces);
            soundBtn.sfx = false;
            soundBtn.onPress = ToggleSound;
            soundBtn.SetVisible(!PlatformSdk.HideSoundToggle);
            lang = Widgets.IconButton(this, "globe", Col.TRANSPARENT, 64);
            lang.SetDepth(Z.pieces);
            lang.sfx = false;
            lang.onPress = OpenLanguage;
            chip = new DiamondChip(this, false);
            chip.SetDepth(Z.pieces);
            chip.SetCount(GameState.diamonds);
        }

        string SoundKind() => GameState.soundEnabled ? "sound_on" : "sound_off";

        void BuildButtons()
        {
            play = Widgets.TextButton(this, new TextButtonOpts { text = Loc.T("play"), w = 380, h = 124, accent = Art.ACCENT_PRIMARY, fontSize = 60 });
            play.sfx = false;
            play.SetDepth(Z.pieces);
            play.onPress = OnPlay;

            string lvl = Loc.Fmt("level_n", GameState.highestUnlocked + 1);
            if (GameState.RunFor(GameState.highestUnlocked) != null) lvl += "  ·  " + Loc.T("in_progress");
            levelLabel = Widgets.MakeLabel(this, lvl, Fonts.Style(28), new LabelOpts { align = HAlign.Center, boxW = 400 });
            levelLabel.SetDepth(Z.pieces);

            photos = Widgets.TextButton(this, new TextButtonOpts { text = Loc.T("photos"), w = 260, h = 80, accent = Art.ACCENT_PINK, fontSize = 32 });
            photos.sfx = false;
            photos.SetDepth(Z.pieces);
            photos.onPress = OnPhotos;
        }

        void DoLayout()
        {
            float barTop = 18;
            soundBtn.SetTopLeft(18, barTop + (68 - 64) / 2f);
            lang.SetTopLeft(18 + 64 + 4, barTop + (68 - 64) / 2f);
            chip.SetTopRight(W - 18, barTop + (68 - chip.ch) / 2);
            float bottom = H - 46;
            float photosY = bottom - 80;
            float labelH = Fonts.LineHeight(28);
            float labelY = photosY - 14 - labelH;
            float playY = labelY - 14 - 124;
            photos.SetTopLeft((W - 260) / 2, photosY);
            levelLabel.SetTopLeft((W - 400) / 2, labelY);
            play.SetTopLeft((W - 380) / 2, playY);
        }

        void OnPlay()
        {
            Sfx.Play("button_tap");
            Sfx.Play("whoosh", -4);
            GameState.currentLevel = GameState.highestUnlocked;
            Go("Game");
        }

        void OnPhotos()
        {
            Sfx.Play("button_tap");
            Sfx.Play("whoosh", -4);
            Go("Timeline");
        }

        void OpenLanguage()
        {
            Sfx.Play("button_tap");
            var panel = new LanguagePanel(this);
            panel.onChosen = _ => mgr.Start(key);
        }

        void ToggleSound()
        {
            GameState.soundEnabled = !GameState.soundEnabled;
            GameState.SaveProgress();
            Music.Sync();
            Sfx.Play("button_tap");
            soundBtn.Destroy();
            soundBtn = Widgets.IconButton(this, SoundKind(), Col.TRANSPARENT, 64);
            soundBtn.SetDepth(Z.pieces);
            soundBtn.sfx = false;
            soundBtn.onPress = ToggleSound;
            DoLayout();
        }
    }
}
