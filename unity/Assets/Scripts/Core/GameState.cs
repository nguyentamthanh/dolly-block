// Progression, currency, photos and settings. Port of src/core/GameState.ts; the JSON save schema is unchanged.
using System;
using System.Collections.Generic;

namespace CozyBlocks.Core
{
    public sealed class PhotoRecord
    {
        public int stars;
        public int bg;
        public List<SnapshotEntry> pieces = new List<SnapshotEntry>();
    }

    /// <summary>A level in progress. placed = [piece id, rot, origin x, origin y]; rots = id -> rot in the tray.</summary>
    public sealed class RunSave
    {
        public int level;
        public int gen;
        public List<int[]> placed = new List<int[]>();
        public Dictionary<string, int> rots = new Dictionary<string, int>();
        public int hints;
        public int undos;
    }

    public static class GameState
    {
        public const int HINT_COST = 5;
        public const int CLEAR_REWARD = 5;
        public const int GIFT_AMOUNT = 10;
        public const int BG_COST = 15;
        public const int BG_COUNT = 5;
        public const int START_DIAMONDS = 20;
        public const int AD_REWARD = 10;

        public static int highestUnlocked;
        public static int currentLevel;
        public static bool soundEnabled = true;
        public static int diamonds = START_DIAMONDS;
        public static Dictionary<string, int> starsAt = new Dictionary<string, int>();
        public static Dictionary<string, PhotoRecord> photos = new Dictionary<string, PhotoRecord>();
        public static List<int> unlockedBgs = new List<int> { 0, 1 };
        public static int giftDay = -1;
        public static string language = "";
        public static bool tutorialDone;
        /// <summary>null when nothing is in progress.</summary>
        public static RunSave run;
        static bool loaded;

        public static Action<string> persist = _ => { };
        public static Func<string> localLoader = () => null;
        public static Func<int> today = () =>
        {
            var d = DateTime.Now;
            return d.Year * 10000 + d.Month * 100 + d.Day;
        };

        public static void Reset()
        {
            highestUnlocked = 0;
            currentLevel = 0;
            soundEnabled = true;
            diamonds = START_DIAMONDS;
            starsAt = new Dictionary<string, int>();
            photos = new Dictionary<string, PhotoRecord>();
            unlockedBgs = new List<int> { 0, 1 };
            giftDay = -1;
            language = "";
            tutorialDone = false;
            run = null;
            loaded = false;
        }

        public static void EnsureLoaded()
        {
            if (loaded) return;
            loaded = true;
            LoadProgress();
        }

        public static int TotalStars()
        {
            int n = 0;
            foreach (var kv in starsAt) n += kv.Value;
            return n;
        }

        public static int StarsFor(int index) => starsAt.TryGetValue(index.ToString(), out var s) ? s : 0;
        public static bool OwnsBg(int id) => unlockedBgs.Contains(id);

        public static bool BuyBg(int id)
        {
            if (OwnsBg(id)) return false;
            if (diamonds < BG_COST) return false;
            diamonds -= BG_COST;
            unlockedBgs.Add(id);
            SaveProgress();
            return true;
        }

        public static bool CanGift() => giftDay != today();

        public static int OpenGift()
        {
            if (!CanGift()) return 0;
            giftDay = today();
            diamonds += GIFT_AMOUNT;
            SaveProgress();
            return GIFT_AMOUNT;
        }

        public static bool SpendHint()
        {
            if (diamonds < HINT_COST) return false;
            diamonds -= HINT_COST;
            SaveProgress();
            return true;
        }

        public static void MarkTutorialDone()
        {
            if (tutorialDone) return;
            tutorialDone = true;
            SaveProgress();
        }

        public static int GrantAdReward()
        {
            diamonds += AD_REWARD;
            SaveProgress();
            return AD_REWARD;
        }

        public static void CompleteLevel(int index, int starCount = 3, List<SnapshotEntry> snapshot = null, int bg = 0)
        {
            string key = index.ToString();
            int prev = starsAt.TryGetValue(key, out var p) ? p : 0;
            if (starCount > prev) starsAt[key] = starCount;
            photos[key] = new PhotoRecord { stars = Math.Max(prev, starCount), bg = bg, pieces = snapshot ?? new List<SnapshotEntry>() };
            if (index >= highestUnlocked) highestUnlocked = index + 1;
            diamonds += CLEAR_REWARD;
            run = null;
            SaveProgress();
        }

        public static RunSave RunFor(int index)
        {
            if (run == null || run.level != index) return null;
            if (run.gen != LevelGenerator.VERSION) return null;
            return run;
        }

        public static bool HasRun() => run != null;

        public static void SaveRun(RunSave data)
        {
            run = data;
            SaveProgress();
        }

        public static void ClearRun()
        {
            if (!HasRun()) return;
            run = null;
            SaveProgress();
        }

        public static PhotoRecord PhotoFor(int index) => photos.TryGetValue(index.ToString(), out var r) ? r : null;

        public static void SetPhotoBg(int index, int bg)
        {
            var rec = PhotoFor(index);
            if (rec == null) return;
            rec.bg = bg;
            SaveProgress();
        }

        public static List<int> PhotoLevels()
        {
            var l = new List<int>();
            foreach (var k in photos.Keys) l.Add(Json.Int(k, 0));
            l.Sort();
            return l;
        }

        public static int BgForLevel(int index)
        {
            if (unlockedBgs.Count == 0) return 0;
            return unlockedBgs[index % unlockedBgs.Count];
        }

        // --- (de)serialisation ------------------------------------------------------------------

        static List<object> Pair(Vec v) => new List<object> { v.x, v.y };

        static Dictionary<string, object> SnapToJson(SnapshotEntry e)
        {
            var cells = new List<object>();
            foreach (var c in e.cells) cells.Add(Pair(c));
            return new Dictionary<string, object> { { "color", e.color }, { "mood", e.mood }, { "target", e.target }, { "cells", cells }, { "eye", Pair(e.eye) } };
        }

        static Vec ReadPair(object o)
        {
            var l = o as List<object>;
            if (l == null || l.Count < 2) return new Vec(0, 0);
            return new Vec(Json.Int(l[0], 0), Json.Int(l[1], 0));
        }

        static SnapshotEntry SnapFromJson(object o)
        {
            var d = o as Dictionary<string, object>;
            var e = new SnapshotEntry { cells = new List<Vec>() };
            if (d == null) return e;
            e.color = Json.Int(Json.Get(d, "color"), 0);
            e.mood = Json.Int(Json.Get(d, "mood"), 0);
            e.target = Json.Int(Json.Get(d, "target"), 0);
            if (Json.Get(d, "cells") is List<object> cl) foreach (var c in cl) e.cells.Add(ReadPair(c));
            e.eye = ReadPair(Json.Get(d, "eye"));
            return e;
        }

        static object RunToJson(RunSave r)
        {
            var d = new Dictionary<string, object>();
            if (r == null) return d;
            var placed = new List<object>();
            foreach (var p in r.placed) placed.Add(new List<object> { p[0], p[1], p[2], p[3] });
            var rots = new Dictionary<string, object>();
            foreach (var kv in r.rots) rots[kv.Key] = kv.Value;
            d["level"] = r.level;
            d["gen"] = r.gen;
            d["placed"] = placed;
            d["rots"] = rots;
            d["hints"] = r.hints;
            d["undos"] = r.undos;
            return d;
        }

        static RunSave RunFromJson(object o)
        {
            var d = o as Dictionary<string, object>;
            if (d == null || d.Count == 0) return null;
            var r = new RunSave
            {
                level = Json.Int(Json.Get(d, "level"), -1),
                gen = Json.Int(Json.Get(d, "gen"), 0),
                hints = Json.Int(Json.Get(d, "hints"), 0),
                undos = Json.Int(Json.Get(d, "undos"), 0),
            };
            if (Json.Get(d, "placed") is List<object> pl)
                foreach (var e in pl)
                    if (e is List<object> q && q.Count >= 4)
                        r.placed.Add(new[] { Json.Int(q[0], 0), Json.Int(q[1], 0), Json.Int(q[2], 0), Json.Int(q[3], 0) });
            if (Json.Get(d, "rots") is Dictionary<string, object> rd)
                foreach (var kv in rd) r.rots[kv.Key] = Json.Int(kv.Value, 0);
            return r;
        }

        public static string SaveText()
        {
            var stars = new Dictionary<string, object>();
            foreach (var kv in starsAt) stars[kv.Key] = kv.Value;
            var ph = new Dictionary<string, object>();
            foreach (var kv in photos)
            {
                var pieces = new List<object>();
                foreach (var e in kv.Value.pieces) pieces.Add(SnapToJson(e));
                ph[kv.Key] = new Dictionary<string, object> { { "stars", kv.Value.stars }, { "bg", kv.Value.bg }, { "pieces", pieces } };
            }
            var bgs = new List<object>();
            foreach (var b in unlockedBgs) bgs.Add(b);
            return Json.Write(new Dictionary<string, object>
            {
                { "highest_unlocked", highestUnlocked },
                { "sound", soundEnabled },
                { "diamonds", diamonds },
                { "stars_at", stars },
                { "photos", ph },
                { "unlocked_bgs", bgs },
                { "gift_day", giftDay },
                { "tutorial_done", tutorialDone },
                { "language", language },
                { "run", RunToJson(run) },
            });
        }

        public static void SaveProgress() => persist(SaveText());

        public static void LoadProgress()
        {
            var text = localLoader();
            if (!string.IsNullOrEmpty(text)) ApplySaveText(text);
        }

        public static void LoadFromText(string text)
        {
            loaded = true;
            ApplySaveText(text);
        }

        static void ApplySaveText(string text)
        {
            Dictionary<string, object> p;
            try { p = Json.Parse(text) as Dictionary<string, object>; }
            catch { return; }
            if (p == null) return;
            highestUnlocked = Json.Int(Json.Get(p, "highest_unlocked"), 0);
            soundEnabled = !p.ContainsKey("sound") || Json.Bool(p["sound"]);
            diamonds = Json.Int(Json.Get(p, "diamonds"), START_DIAMONDS);
            starsAt = new Dictionary<string, int>();
            if (Json.Get(p, "stars_at") is Dictionary<string, object> sa) foreach (var kv in sa) starsAt[kv.Key] = Json.Int(kv.Value, 0);
            photos = new Dictionary<string, PhotoRecord>();
            if (Json.Get(p, "photos") is Dictionary<string, object> pd)
                foreach (var kv in pd)
                {
                    var d = kv.Value as Dictionary<string, object>;
                    var rec = new PhotoRecord { stars = Json.Int(Json.Get(d, "stars"), 0), bg = Json.Int(Json.Get(d, "bg"), 0) };
                    if (Json.Get(d, "pieces") is List<object> pl) foreach (var e in pl) rec.pieces.Add(SnapFromJson(e));
                    photos[kv.Key] = rec;
                }
            unlockedBgs = new List<int>();
            if (Json.Get(p, "unlocked_bgs") is List<object> bl) foreach (var b in bl) unlockedBgs.Add(Json.Int(b, 0));
            else unlockedBgs.AddRange(new[] { 0, 1 });
            if (unlockedBgs.Count == 0) unlockedBgs.AddRange(new[] { 0, 1 });
            giftDay = Json.Int(Json.Get(p, "gift_day"), -1);
            tutorialDone = p.ContainsKey("tutorial_done") ? Json.Bool(p["tutorial_done"]) : highestUnlocked > 0;
            language = p.ContainsKey("language") && p["language"] != null ? p["language"].ToString() : "";
            run = RunFromJson(Json.Get(p, "run"));
        }
    }
}
