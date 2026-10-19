// The game's front door. The whole look is one painted piece of art (logo, tagline and the googly blocks over a
// candy sky), painted in four framings so it can cover ANY window edge to edge with nothing but a crop: tall
// portrait, 3:4, square and wide landscape. The window's aspect picks the nearest one; it is scaled to cover and
// pinned to the TOP, so any crop falls on the empty cloud bank at the bottom and never on the logo.
// Ports scripts/ui/MainMenu.gd.

import * as Phaser from 'phaser';
import { BaseScene } from './BaseScene';
import { go } from './nav';
import * as Art from '../render/Art';
import { Color } from '../render/Color';
import { labelStyle, lineHeight } from '../render/Fonts';
import { GameState } from '../core/GameState';
import { Loc } from '../core/Loc';
import { PlatformSdk } from '../platform/PlatformSdk';
import { Sfx } from '../audio/Sfx';
import { Z } from '../fx/Fx';
import { LanguagePanel } from '../ui/LanguagePanel';
import { popIn, pulse } from '../ui/UiFx';
import { DiamondChip, iconButton, makeLabel, textButton, type LabelView, type UiButton } from '../ui/widgets';

/** {art, upper aspect bound}: the first entry whose bound exceeds the window's width / height wins. */
const FRAMES = [
  { key: 'home_bg', url: './art/home_bg.webp', below: 0.6 },
  { key: 'home_bg_34', url: './art/home_bg_34.webp', below: 0.87 },
  { key: 'home_bg_sq', url: './art/home_bg_sq.webp', below: 1.5 },
  { key: 'home_bg_wide', url: './art/home_bg_wide.webp', below: 1000 },
];

export class MainMenuScene extends BaseScene {
  private art: Phaser.GameObjects.Image | null = null;
  private artKey = '';
  private soundBtn!: UiButton;
  private lang!: UiButton;
  private chip!: DiamondChip;
  private play!: UiButton;
  private levelLabel!: LabelView;
  private photos!: UiButton;
  private built = false;

  constructor() {
    super('MainMenu');
  }

  protected build(): void {
    GameState.ensureLoaded();
    this.cameras.main.setBackgroundColor('#fad6f2');
    this.buildTopBar();
    this.buildButtons();
    this.layout();
    this.fitArt(true);
    this.built = true;

    this.play.setScale(0);
    popIn(this, this.play, 0.2);
    const t = this.tw.create();
    t.tweenInterval(0.7);
    t.tweenCallback(() => pulse(this, this.play, 0.05, 1.1));
    popIn(this, this.levelLabel, 0.3);
    popIn(this, this.photos, 0.38);
  }

  protected onResize(): void {
    if (!this.built) return;
    this.layout();
    this.fitArt(false);
  }

  // --- art -------------------------------------------------------------------------------------------------------------

  /** Pick the painting nearest the window's shape, scale it until it covers the window, pin it to the top edge. */
  private fitArt(fade: boolean): void {
    const aspect = this.W / this.H;
    const frame = FRAMES.find((f) => aspect < f.below) ?? FRAMES[FRAMES.length - 1];
    const apply = (): void => {
      if (!this.sys.isActive() && !this.scene.isActive()) return;
      if (this.art && this.artKey !== frame.key) {
        this.art.destroy();
        this.art = null;
      }
      if (!this.art) {
        this.art = this.add.image(0, 0, frame.key).setOrigin(0, 0).setDepth(0);
        this.artKey = frame.key;
        if (fade) {
          this.art.setAlpha(0);
          const t = this.tw.create();
          t.tweenProperty(this.art, 'alpha', 1, 0.25);
        }
      }
      const tex = this.textures.get(frame.key).getSourceImage();
      const tw = tex.width;
      const th = tex.height;
      const s = Math.max(this.W / tw, this.H / th);
      this.art.setDisplaySize(tw * s, th * s);
      this.art.setPosition((this.W - tw * s) * 0.5, 0);
      // The first playable frame: the painting is up and the buttons are on it.
      PlatformSdk.setLoadingProgress(100);
      PlatformSdk.sendGameReady();
    };
    if (this.textures.exists(frame.key)) {
      apply();
      return;
    }
    this.load.image(frame.key, frame.url);
    this.load.once(Phaser.Loader.Events.COMPLETE, apply);
    this.load.start();
  }

  // --- widgets ----------------------------------------------------------------------------------------------------------------

  private buildTopBar(): void {
    this.soundBtn = iconButton(this, this.soundKind(), Color.TRANSPARENT, 64);
    this.soundBtn.setDepth(Z.pieces);
    this.soundBtn.sfx = false;
    this.soundBtn.onPress = () => this.toggleSound();
    this.soundBtn.setVisible(!PlatformSdk.hideSoundToggle);
    this.lang = iconButton(this, 'globe', Color.TRANSPARENT, 64);
    this.lang.setDepth(Z.pieces);
    this.lang.sfx = false;
    this.lang.onPress = () => this.openLanguage();
    this.chip = new DiamondChip(this, false);
    this.chip.setDepth(Z.pieces);
    this.chip.setCount(GameState.diamonds);
  }

  private soundKind(): string {
    return GameState.soundEnabled ? 'sound_on' : 'sound_off';
  }

  private buildButtons(): void {
    this.play = textButton(this, { text: Loc.t('play'), w: 380, h: 124, accent: Art.ACCENT_PRIMARY, fontSize: 60 });
    this.play.sfx = false;
    this.play.setDepth(Z.pieces);
    this.play.onPress = () => this.onPlay();

    let lvl = Loc.fmt('level_n', GameState.highestUnlocked + 1);
    if (Object.keys(GameState.runFor(GameState.highestUnlocked)).length > 0) lvl += `  ·  ${Loc.t('in_progress')}`;
    this.levelLabel = makeLabel(this, lvl, labelStyle(28), { align: 'center', boxW: 400 });
    this.levelLabel.setDepth(Z.pieces);

    this.photos = textButton(this, { text: Loc.t('photos'), w: 260, h: 80, accent: Art.ACCENT_PINK, fontSize: 32 });
    this.photos.sfx = false;
    this.photos.setDepth(Z.pieces);
    this.photos.onPress = () => this.onPhotos();
  }

  private layout(): void {
    const W = this.W;
    const H = this.H;
    // Top bar: a 68px strip 18px from the top, 18px side margins, 4px between the corner buttons.
    const barTop = 18;
    this.soundBtn.setTopLeft(18, barTop + (68 - 64) / 2);
    this.lang.setTopLeft(18 + 64 + 4, barTop + (68 - 64) / 2);
    this.chip.setTopRight(W - 18, barTop + (68 - this.chip.ch) / 2);
    // Buttons column: bottom-aligned, 46px above the bottom edge, 14px apart.
    const bottom = H - 46;
    const photosY = bottom - 80;
    const labelH = lineHeight(28);
    const labelY = photosY - 14 - labelH;
    const playY = labelY - 14 - 124;
    this.photos.setTopLeft((W - 260) / 2, photosY);
    this.levelLabel.setTopLeft((W - 400) / 2, labelY);
    this.play.setTopLeft((W - 380) / 2, playY);
  }

  // --- actions -------------------------------------------------------------------------------------------------------------

  private onPlay(): void {
    Sfx.play('button_tap');
    Sfx.play('whoosh', -4);
    GameState.currentLevel = GameState.highestUnlocked;
    go(this, 'Game');
  }

  private onPhotos(): void {
    Sfx.play('button_tap');
    Sfx.play('whoosh', -4);
    go(this, 'Timeline');
  }

  private openLanguage(): void {
    Sfx.play('button_tap');
    const panel = new LanguagePanel(this);
    // Every label was built in the old language, so rebuild the whole screen.
    panel.onChosen = () => this.scene.restart();
  }

  private toggleSound(): void {
    GameState.soundEnabled = !GameState.soundEnabled;
    GameState.saveProgress();
    Sfx.play('button_tap');
    this.soundBtn.destroy();
    this.soundBtn = iconButton(this, this.soundKind(), Color.TRANSPARENT, 64);
    this.soundBtn.setDepth(Z.pieces);
    this.soundBtn.sfx = false;
    this.soundBtn.onPress = () => this.toggleSound();
    this.layout();
  }
}

