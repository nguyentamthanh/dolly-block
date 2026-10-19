// UI translations. Ports scripts/core/Loc.gd. English is the default and the fallback for any missing key
// or language, as Playgama requires.
//
// The language is picked, in order, from: the player's saved choice (GameState.language), the platform's
// language (PlatformSdk hands it over via `Loc.platformLang`), then English. Callers use Loc.t("key") and
// Loc.fmt("key", n) for %d placeholders.

import { GameState } from './GameState';
import { TEXTS } from './locTexts';

/** Order of the columns in TEXTS. */
export const CODES = ['en', 'ru', 'es', 'pt', 'de', 'fr', 'tr'] as const;

/** Each language written in itself (never translated), for the picker. */
export const NAMES: Record<string, string> = {
  en: 'English',
  ru: 'Русский',
  es: 'Español',
  pt: 'Português',
  de: 'Deutsch',
  fr: 'Français',
  tr: 'Türkçe',
};

export { TEXTS };

export class Loc {
  /** What the platform reported (ISO 639-1, maybe "pt-BR"); set before the UI exists. */
  static platformLang = '';

  /** Current language code, always one of CODES. */
  static current(): string {
    return Loc.resolve();
  }

  /** Saved choice, else the platform's language, else English. */
  static resolve(): string {
    const saved = Loc.normalize(GameState.language);
    if (saved) return saved;
    const fromPlatform = Loc.normalize(Loc.platformLang);
    return fromPlatform || 'en';
  }

  /** "pt-BR" / "PT_br" -> "pt"; "" when the language isn't supported. */
  static normalize(code: string): string {
    const c = code.trim().toLowerCase().replace(/_/g, '-').split('-')[0];
    return (CODES as readonly string[]).includes(c) ? c : '';
  }

  /** The Godot version cached the language; here it is resolved on demand, so there is nothing to forget. */
  static refresh(): void {
    /* no cache */
  }

  /** Player's explicit choice: remembered in the save and used from now on. */
  static setLanguage(code: string): void {
    const c = Loc.normalize(code);
    if (!c) return;
    GameState.language = c;
    GameState.saveProgress();
  }

  static t(key: string): string {
    const row = TEXTS[key];
    if (!row) {
      console.warn(`Loc: missing key '${key}'`);
      return key;
    }
    const i = (CODES as readonly string[]).indexOf(Loc.current());
    const text = i >= 0 && i < row.length ? row[i] : '';
    return text || row[0];
  }

  /** t(key) with each %d replaced by the next argument (GDScript `Loc.t(k) % [a, b]`). */
  static fmt(key: string, ...args: number[]): string {
    let i = 0;
    return Loc.t(key).replace(/%d/g, () => String(args[i++] ?? ''));
  }

  static tierName(tier: number): string {
    return Loc.t(`tier_${tier}`);
  }
}
