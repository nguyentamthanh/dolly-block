// Progression, currency, photos and settings. Ports scripts/core/GameState.gd. Static members, no Phaser,
// so tests can drive it. Persistence is injected: `persist` writes the JSON save (Playgama storage +
// localStorage in the game), `localLoader` reads the local copy. The JSON schema is unchanged from the
// Godot build, so existing Playgama cloud saves keep working.

import { VERSION as GENERATOR_VERSION } from './LevelGenerator';
import type { SnapshotEntry } from './BoardState';

export interface PhotoRecord {
  stars: number;
  bg: number;
  pieces: SnapshotEntry[];
}

export interface RunSave {
  level: number;
  gen: number;
  /** [piece id, rot, origin x, origin y] */
  placed: [number, number, number, number][];
  /** id -> rot for pieces still in the tray */
  rots: Record<string, number>;
  hints: number;
  undos: number;
}

const START_DIAMONDS = 20;

export class GameState {
  static readonly HINT_COST = 5;
  static readonly CLEAR_REWARD = 5;
  static readonly GIFT_AMOUNT = 10;
  static readonly BG_COST = 15;
  static readonly BG_COUNT = 5;
  static readonly START_DIAMONDS = START_DIAMONDS;
  /** Diamonds granted for watching one rewarded ad: two hints' worth. */
  static readonly AD_REWARD = 10;

  static highestUnlocked = 0;
  static currentLevel = 0;
  static soundEnabled = true;
  static diamonds = START_DIAMONDS;
  /** level index (as string) -> 1..3 */
  static starsAt: Record<string, number> = {};
  /** level index (as string) -> {stars, bg, pieces} */
  static photos: Record<string, PhotoRecord> = {};
  /** background ids the player owns. 0 meadow, 1 desert start unlocked. */
  static unlockedBgs: number[] = [0, 1];
  static giftDay = -1;
  /** Language the player picked by hand ("" = follow the platform). See Loc. */
  static language = '';
  /** True once the how-to-play cards were shown (finished or skipped). */
  static tutorialDone = false;
  /** The level being played right now, so quitting mid-level loses nothing. Empty when nothing is in progress. */
  static run: Partial<RunSave> = {};

  private static loaded = false;

  /** Writes the JSON save somewhere durable. */
  static persist: (text: string) => void = () => {};
  /** Reads the locally stored save, if any. */
  static localLoader: () => string | null = () => null;
  /** yyyymmdd of the local date. */
  static today: () => number = () => {
    const d = new Date();
    return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  };

  /** Back to a fresh install (tests). */
  static reset(): void {
    GameState.highestUnlocked = 0;
    GameState.currentLevel = 0;
    GameState.soundEnabled = true;
    GameState.diamonds = START_DIAMONDS;
    GameState.starsAt = {};
    GameState.photos = {};
    GameState.unlockedBgs = [0, 1];
    GameState.giftDay = -1;
    GameState.language = '';
    GameState.tutorialDone = false;
    GameState.run = {};
    GameState.loaded = false;
  }

  static ensureLoaded(): void {
    if (GameState.loaded) return;
    GameState.loaded = true;
    GameState.loadProgress();
  }

  static totalStars(): number {
    let n = 0;
    for (const k of Object.keys(GameState.starsAt)) n += Math.trunc(Number(GameState.starsAt[k]));
    return n;
  }

  static starsFor(index: number): number {
    return Math.trunc(Number(GameState.starsAt[String(index)] ?? 0));
  }

  static ownsBg(id: number): boolean {
    return GameState.unlockedBgs.includes(id);
  }

  static buyBg(id: number): boolean {
    if (GameState.ownsBg(id)) return false;
    if (GameState.diamonds < GameState.BG_COST) return false;
    GameState.diamonds -= GameState.BG_COST;
    GameState.unlockedBgs.push(id);
    GameState.saveProgress();
    return true;
  }

  static canGift(): boolean {
    return GameState.giftDay !== GameState.today();
  }

  static openGift(): number {
    if (!GameState.canGift()) return 0;
    GameState.giftDay = GameState.today();
    GameState.diamonds += GameState.GIFT_AMOUNT;
    GameState.saveProgress();
    return GameState.GIFT_AMOUNT;
  }

  static spendHint(): boolean {
    if (GameState.diamonds < GameState.HINT_COST) return false;
    GameState.diamonds -= GameState.HINT_COST;
    GameState.saveProgress();
    return true;
  }

  static markTutorialDone(): void {
    if (GameState.tutorialDone) return;
    GameState.tutorialDone = true;
    GameState.saveProgress();
  }

  /** Call only after the platform confirmed the rewarded ad was watched. */
  static grantAdReward(): number {
    GameState.diamonds += GameState.AD_REWARD;
    GameState.saveProgress();
    return GameState.AD_REWARD;
  }

  static completeLevel(index: number, starCount = 3, snapshot: SnapshotEntry[] = [], bg = 0): void {
    const key = String(index);
    const prev = Math.trunc(Number(GameState.starsAt[key] ?? 0));
    if (starCount > prev) GameState.starsAt[key] = starCount;
    GameState.photos[key] = { stars: Math.max(prev, starCount), bg, pieces: snapshot };
    if (index >= GameState.highestUnlocked) GameState.highestUnlocked = index + 1;
    GameState.diamonds += GameState.CLEAR_REWARD;
    GameState.run = {};
    GameState.saveProgress();
  }

  static runFor(index: number): Partial<RunSave> {
    const run = GameState.run;
    if (Object.keys(run).length === 0 || Math.trunc(Number(run.level ?? -1)) !== index) return {};
    // Saved under an older generator: that level is a different puzzle now.
    if (Math.trunc(Number(run.gen ?? 0)) !== GENERATOR_VERSION) return {};
    return run;
  }

  static hasRun(): boolean {
    return Object.keys(GameState.run).length > 0;
  }

  static saveRun(data: Partial<RunSave>): void {
    GameState.run = data;
    GameState.saveProgress();
  }

  static clearRun(): void {
    if (!GameState.hasRun()) return;
    GameState.run = {};
    GameState.saveProgress();
  }

  static photoFor(index: number): PhotoRecord | undefined {
    return GameState.photos[String(index)];
  }

  /** Swap the backdrop of an already-taken photo (the win screen's arrows). */
  static setPhotoBg(index: number, bg: number): void {
    const rec = GameState.photos[String(index)];
    if (!rec) return;
    rec.bg = bg;
    GameState.saveProgress();
  }

  /** Indices of every level that has a photo, ascending. */
  static photoLevels(): number[] {
    return Object.keys(GameState.photos)
      .map((k) => Math.trunc(Number(k)))
      .sort((a, b) => a - b);
  }

  static bgForLevel(index: number): number {
    const bgs = GameState.unlockedBgs;
    if (bgs.length === 0) return 0;
    return Math.trunc(Number(bgs[index % bgs.length]));
  }

  static saveText(): string {
    return JSON.stringify({
      highest_unlocked: GameState.highestUnlocked,
      sound: GameState.soundEnabled,
      diamonds: GameState.diamonds,
      stars_at: GameState.starsAt,
      photos: GameState.photos,
      unlocked_bgs: GameState.unlockedBgs,
      gift_day: GameState.giftDay,
      tutorial_done: GameState.tutorialDone,
      language: GameState.language,
      run: GameState.run,
    });
  }

  static saveProgress(): void {
    GameState.persist(GameState.saveText());
  }

  static loadProgress(): void {
    const text = GameState.localLoader();
    if (text) GameState.applySaveText(text);
  }

  /**
   * Loads progress fetched from somewhere other than the local copy (the web platform's storage) and
   * marks it loaded so ensureLoaded() won't override it.
   */
  static loadFromText(text: string): void {
    GameState.loaded = true;
    GameState.applySaveText(text);
  }

  private static applySaveText(text: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return;
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return;
    const p = parsed as Record<string, unknown>;
    const num = (x: unknown, dflt: number): number => (x === undefined || x === null ? dflt : Math.trunc(Number(x)) || 0);

    GameState.highestUnlocked = num(p.highest_unlocked, 0);
    GameState.soundEnabled = p.sound === undefined ? true : Boolean(p.sound);
    GameState.diamonds = num(p.diamonds, START_DIAMONDS);
    GameState.starsAt = (p.stars_at as Record<string, number>) ?? {};
    GameState.photos = (p.photos as Record<string, PhotoRecord>) ?? {};
    const bgs = Array.isArray(p.unlocked_bgs) ? (p.unlocked_bgs as unknown[]) : [0, 1];
    GameState.unlockedBgs = bgs.map((b) => Math.trunc(Number(b)) || 0);
    if (GameState.unlockedBgs.length === 0) GameState.unlockedBgs = [0, 1];
    GameState.giftDay = num(p.gift_day, -1);
    // Saves from before the tutorial existed: a player already past level 1 knows the game.
    GameState.tutorialDone = p.tutorial_done === undefined ? GameState.highestUnlocked > 0 : Boolean(p.tutorial_done);
    GameState.language = p.language === undefined ? '' : String(p.language);
    const savedRun = p.run;
    GameState.run = typeof savedRun === 'object' && savedRun !== null && !Array.isArray(savedRun) ? (savedRun as Partial<RunSave>) : {};
  }
}
