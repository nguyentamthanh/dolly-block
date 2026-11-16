// UI translations. Port of src/core/Loc.ts.
using System;
using System.Collections.Generic;
using System.Text.RegularExpressions;

namespace CozyBlocks.Core
{
    public static class Loc
    {
        public static readonly string[] CODES = { "en", "ru", "es", "pt", "de", "fr", "tr" };
        public static readonly Dictionary<string, string> NAMES = new Dictionary<string, string>
        {
            { "en", "English" }, { "ru", "Русский" }, { "es", "Español" }, { "pt", "Português" },
            { "de", "Deutsch" }, { "fr", "Français" }, { "tr", "Türkçe" },
        };

        public static string platformLang = "";

        public static string Current() => Resolve();

        public static string Resolve()
        {
            string saved = Normalize(GameState.language);
            if (saved.Length > 0) return saved;
            string fromPlatform = Normalize(platformLang);
            return fromPlatform.Length > 0 ? fromPlatform : "en";
        }

        public static string Normalize(string code)
        {
            if (code == null) return "";
            string c = code.Trim().ToLowerInvariant().Replace('_', '-').Split('-')[0];
            return Array.IndexOf(CODES, c) >= 0 ? c : "";
        }

        public static void Refresh() { }

        public static void SetLanguage(string code)
        {
            string c = Normalize(code);
            if (c.Length == 0) return;
            GameState.language = c;
            GameState.SaveProgress();
        }

        public static string T(string key)
        {
            if (!LocTexts.TEXTS.TryGetValue(key, out var row))
            {
                UnityEngine.Debug.LogWarning($"Loc: missing key '{key}'");
                return key;
            }
            int i = Array.IndexOf(CODES, Current());
            string text = i >= 0 && i < row.Length ? row[i] : "";
            return string.IsNullOrEmpty(text) ? row[0] : text;
        }

        static readonly Regex PH = new Regex("%d");

        public static string Fmt(string key, params int[] args)
        {
            int i = 0;
            return PH.Replace(T(key), _ => i < args.Length ? args[i++].ToString() : "");
        }

        public static string TierName(int tier) => T("tier_" + tier);
    }
}
