// Builds packing puzzles backwards from a known tiling. The sequence of RNG draws and insertion-ordered iterations
// is part of the contract: level N must always be the same puzzle (saved runs depend on it). Change it only together
// with VERSION, and refresh Tests/Parity/golden.json (npm test -- --update).
using System;
using System.Collections.Generic;

namespace CozyBlocks.Core
{
    public sealed class TierConfig
    {
        public string name;
        public int w, h, min_sz, max_sz, tray;
        public double neutral;
        public int max_solutions, budget, attempts;
        public TierConfig Clone() => (TierConfig)MemberwiseClone();
    }

    public sealed class Stage
    {
        public int from, len, tier;
        public int w = -1, h = -1;
        public int min_sz, max_sz, tray_a, tray_b;
        public double neutral_a, neutral_b;
        public int max_solutions, budget, attempts;
    }

    public sealed class LevelGenerator
    {
        public const int VERSION = 5;
        public const int ROTATE_FROM_LEVEL = 9;
        public const int UNKNOWN_SOLUTIONS = 99;

        public static readonly TierConfig[] TIERS =
        {
            new TierConfig { name = "Warm-up", w = 5, h = 5, min_sz = 2, max_sz = 5, tray = 5, neutral = 0.35, max_solutions = 3, budget = 20000, attempts = 12 },
            new TierConfig { name = "Cozy", w = 6, h = 6, min_sz = 3, max_sz = 5, tray = 7, neutral = 0.25, max_solutions = 2, budget = 8000, attempts = 10 },
            new TierConfig { name = "Tricky", w = 7, h = 7, min_sz = 3, max_sz = 6, tray = 9, neutral = 0.18, max_solutions = 1, budget = 3000, attempts = 8 },
            new TierConfig { name = "Tangled", w = 7, h = 8, min_sz = 3, max_sz = 6, tray = 11, neutral = 0.12, max_solutions = 1, budget = 3000, attempts = 8 },
            new TierConfig { name = "Nightmare", w = 7, h = 9, min_sz = 3, max_sz = 6, tray = 13, neutral = 0.08, max_solutions = 1, budget = 3000, attempts = 8 },
        };

        public static readonly Stage[] STAGES =
        {
            new Stage { from = 0, len = 3, tier = 0, w = 4, h = 4, min_sz = 3, max_sz = 5, tray_a = 1, tray_b = 2, neutral_a = 1, neutral_b = 1, max_solutions = 6, budget = 20000, attempts = 3 },
            new Stage { from = 3, len = 4, tier = 0, w = 4, h = 5, min_sz = 3, max_sz = 5, tray_a = 2, tray_b = 3, neutral_a = 1, neutral_b = 0.8, max_solutions = 5, budget = 20000, attempts = 4 },
            new Stage { from = 7, len = 3, tier = 0, min_sz = 3, max_sz = 5, tray_a = 3, tray_b = 3, neutral_a = 0.8, neutral_b = 0.7, max_solutions = 4, budget = 20000, attempts = 6 },
            new Stage { from = 10, len = 6, tier = 0, min_sz = 2, max_sz = 5, tray_a = 3, tray_b = 4, neutral_a = 0.65, neutral_b = 0.5, max_solutions = 4, budget = 20000, attempts = 12 },
            new Stage { from = 16, len = 8, tier = 0, min_sz = 2, max_sz = 5, tray_a = 4, tray_b = 5, neutral_a = 0.5, neutral_b = 0.35, max_solutions = 3, budget = 20000, attempts = 12 },
            new Stage { from = 24, len = 8, tier = 1, min_sz = 3, max_sz = 5, tray_a = 4, tray_b = 6, neutral_a = 0.38, neutral_b = 0.3, max_solutions = 3, budget = 8000, attempts = 10 },
            new Stage { from = 32, len = 14, tier = 1, min_sz = 3, max_sz = 5, tray_a = 6, tray_b = 8, neutral_a = 0.28, neutral_b = 0.22, max_solutions = 2, budget = 8000, attempts = 10 },
            new Stage { from = 46, len = 20, tier = 2, min_sz = 3, max_sz = 6, tray_a = 6, tray_b = 9, neutral_a = 0.25, neutral_b = 0.18, max_solutions = 2, budget = 5000, attempts = 8 },
            new Stage { from = 66, len = 26, tier = 3, min_sz = 3, max_sz = 6, tray_a = 8, tray_b = 11, neutral_a = 0.18, neutral_b = 0.12, max_solutions = 1, budget = 3000, attempts = 8 },
            new Stage { from = 92, len = 36, tier = 4, min_sz = 3, max_sz = 6, tray_a = 10, tray_b = 13, neutral_a = 0.12, neutral_b = 0.08, max_solutions = 1, budget = 3000, attempts = 8 },
        };

        public static Stage StageForLevel(int levelIndex)
        {
            var stage = STAGES[0];
            foreach (var s in STAGES) if (levelIndex >= s.from) stage = s;
            return stage;
        }

        public static int TierForLevel(int levelIndex) => StageForLevel(levelIndex).tier;
        public static bool RotationUnlocked(int levelIndex) => levelIndex >= ROTATE_FROM_LEVEL;

        public static double ScrambleShare(int levelIndex)
        {
            if (!RotationUnlocked(levelIndex)) return 0;
            int k = levelIndex - ROTATE_FROM_LEVEL;
            if (k < 3) return 0.34;
            if (k < 10) return 0.67;
            return 1;
        }

        /// <summary>Round half toward +infinity (not banker's rounding), which the level ramp was tuned with.</summary>
        public static double JsRound(double x) => Math.Floor(x + 0.5);
        static int Roundi(double x) => (int)(x < 0 ? -JsRound(-x) : JsRound(x));

        public static TierConfig ConfigForLevel(int levelIndex, int overrideTier = -1)
        {
            if (overrideTier >= 0) return TIERS[overrideTier];
            var stage = StageForLevel(levelIndex);
            double t = Math.Min(Math.Max((levelIndex - stage.from) / (double)Math.Max(stage.len - 1, 1), 0), 1);
            var c = TIERS[stage.tier].Clone();
            if (stage.w >= 0) c.w = stage.w;
            if (stage.h >= 0) c.h = stage.h;
            c.min_sz = stage.min_sz;
            c.max_sz = stage.max_sz;
            c.tray = Roundi(stage.tray_a + (stage.tray_b - stage.tray_a) * t);
            c.neutral = stage.neutral_a + (stage.neutral_b - stage.neutral_a) * t;
            c.max_solutions = stage.max_solutions;
            c.budget = stage.budget;
            c.attempts = stage.attempts;
            return c;
        }

        public static uint SeedForLevel(int levelIndex) => GodotHash.StringHash($"dolly-blocks/v{VERSION}/{levelIndex}");

        struct MoodRec { public int mood, target; }

        public LevelData Generate(int levelIndex, int overrideTier = -1)
        {
            int tier = overrideTier >= 0 ? overrideTier : TierForLevel(levelIndex);
            var cfg = ConfigForLevel(levelIndex, overrideTier);
            var rng = new Pcg32(SeedForLevel(levelIndex));
            bool rotate = overrideTier >= 0 || RotationUnlocked(levelIndex);
            LevelData best = null;
            for (int a = 0; a < cfg.attempts; a++)
            {
                var lv = Attempt(rng, cfg, rotate);
                if (lv == null) continue;
                if (best == null || lv.solutionCount < best.solutionCount) best = lv;
                if (lv.solutionCount <= cfg.max_solutions || lv.solutionCount == UNKNOWN_SOLUTIONS) break;
            }
            if (best == null)
            {
                UnityEngine.Debug.LogError($"LevelGenerator: no candidate survived for level {levelIndex}");
                return null;
            }
            best.levelIndex = levelIndex;
            best.tier = tier;
            best.rngSeed = SeedForLevel(levelIndex);
            if (overrideTier < 0) Scramble(best, ScrambleShare(levelIndex));
            return best;
        }

        void Scramble(LevelData lv, double share)
        {
            if (share <= 0) return;
            var rng = new Pcg32(SeedForLevel(lv.levelIndex) ^ 0x5bd1e995u);
            var turnable = lv.trayPieces.FindAll(p => p.UniqueRots().Count > 1);
            int want = Math.Min(turnable.Count, Math.Max(1, (int)JsRound(share * lv.trayPieces.Count)));
            for (int i = turnable.Count - 1; i > 0; i--)
            {
                int j = rng.RandiRange(0, i);
                var tmp = turnable[i]; turnable[i] = turnable[j]; turnable[j] = tmp;
            }
            for (int i = 0; i < want && i < turnable.Count; i++)
            {
                var p = turnable[i];
                var others = p.UniqueRots().FindAll(r => r != 0);
                p.rot = others[rng.RandiRange(0, others.Count - 1)];
            }
        }

        LevelData Attempt(Pcg32 rng, TierConfig cfg, bool rotate)
        {
            int w = cfg.w, h = cfg.h;
            var groups = GrowTiling(w, h, rng, cfg.min_sz, cfg.max_sz);
            if (groups.Count == 0) return null;
            var colors = Colour(groups, rng);
            var moods = AssignMoods(groups, colors, rng, cfg.neutral);
            var pieces = new List<PieceData>();
            for (int i = 0; i < groups.Count; i++) pieces.Add(PieceData.FromWorld(i, colors[i], groups[i], moods[i].mood, moods[i].target));

            int trayN = Math.Min(cfg.tray, pieces.Count - 1);
            if (trayN < 1) trayN = 1;
            var order = new List<int>();
            for (int i = 0; i < pieces.Count; i++) order.Add(i);
            for (int i = order.Count - 1; i > 0; i--)
            {
                int j = rng.RandiRange(0, i);
                int tmp = order[i]; order[i] = order[j]; order[j] = tmp;
            }
            GodotSort.SortCustom(order, (a, b) => (pieces[a].mood != Mood.NEUTRAL ? 1 : 0) > (pieces[b].mood != Mood.NEUTRAL ? 1 : 0));

            var tray = new List<PieceData>();
            var fixd = new List<PieceData>();
            for (int i = 0; i < order.Count; i++) (i < trayN ? tray : fixd).Add(pieces[order[i]]);

            var lv = new LevelData { width = w, height = h, fixedPieces = fixd, trayPieces = tray, turnBudget = 15 + tray.Count * 7 };
            var solver = new Solver(rotate);
            var state = lv.BuildState();
            int count = solver.CountSolutions(state, lv.TrayCopy(), 4, cfg.budget);
            if (solver.aborted) count = UNKNOWN_SOLUTIONS;
            else if (count < 1) return null;
            lv.solutionCount = count;
            lv.searchCost = solver.nodes;
            return lv;
        }

        static int CellKey(Vec c) => c.y * 64 + c.x;

        List<List<Vec>> GrowTiling(int w, int h, Pcg32 rng, int minSz, int maxSz)
        {
            // Insertion-ordered "map" of empty cells.
            var empty = new List<Vec>();
            var emptySet = new HashSet<int>();
            for (int y = 0; y < h; y++) for (int x = 0; x < w; x++) { empty.Add(new Vec(x, y)); emptySet.Add(CellKey(new Vec(x, y))); }
            var groups = new List<List<Vec>>();
            while (empty.Count > 0)
            {
                var start = empty[rng.RandiRange(0, empty.Count - 1)];
                int remaining = empty.Count;
                int target = rng.RandiRange(minSz, maxSz);
                if (remaining <= maxSz) target = remaining;
                var cells = new List<Vec> { start };
                empty.Remove(start); emptySet.Remove(CellKey(start));
                while (cells.Count < target)
                {
                    var frontier = new List<Vec>();
                    var seen = new HashSet<int>();
                    foreach (var c in cells)
                        foreach (var off in BoardState.NEIGHBOUR_OFFSETS)
                        {
                            var n = new Vec(c.x + off.x, c.y + off.y);
                            int k = CellKey(n);
                            if (emptySet.Contains(k) && seen.Add(k)) frontier.Add(n);
                        }
                    if (frontier.Count == 0) break;
                    var pick = frontier[rng.RandiRange(0, frontier.Count - 1)];
                    cells.Add(pick);
                    empty.Remove(pick); emptySet.Remove(CellKey(pick));
                }
                groups.Add(cells);
            }
            return groups;
        }

        static Dictionary<int, int> Owners(List<List<Vec>> groups)
        {
            var owner = new Dictionary<int, int>();
            for (int i = 0; i < groups.Count; i++) foreach (var c in groups[i]) owner[CellKey(c)] = i;
            return owner;
        }

        int[] Colour(List<List<Vec>> groups, Pcg32 rng)
        {
            var owner = Owners(groups);
            var adj = new List<HashSet<int>>();
            for (int i = 0; i < groups.Count; i++)
            {
                var s = new HashSet<int>();
                foreach (var c in groups[i])
                    foreach (var off in BoardState.NEIGHBOUR_OFFSETS)
                        if (owner.TryGetValue(CellKey(new Vec(c.x + off.x, c.y + off.y)), out int o) && o != i) s.Add(o);
                adj.Add(s);
            }
            var colors = new int[groups.Count];
            for (int i = 0; i < groups.Count; i++)
            {
                var used = new HashSet<int>();
                foreach (var nb in adj[i]) if (nb < i) used.Add(colors[nb]);
                var choices = new List<int>();
                for (int hue = 0; hue < Palette.COUNT; hue++) if (!used.Contains(hue)) choices.Add(hue);
                if (choices.Count == 0) choices = new List<int>(Palette.AllHues());
                colors[i] = choices[rng.RandiRange(0, choices.Count - 1)];
            }
            return colors;
        }

        List<MoodRec> AssignMoods(List<List<Vec>> groups, int[] colors, Pcg32 rng, double neutral)
        {
            var owner = Owners(groups);
            var neighbourColors = new List<List<int>>();
            for (int i = 0; i < groups.Count; i++)
            {
                var cols = new List<int>();
                foreach (var c in groups[i])
                    foreach (var off in BoardState.NEIGHBOUR_OFFSETS)
                        if (owner.TryGetValue(CellKey(new Vec(c.x + off.x, c.y + off.y)), out int o) && o != i && !cols.Contains(colors[o]))
                            cols.Add(colors[o]);
                neighbourColors.Add(cols);
            }
            var used = new List<int>();
            foreach (var c in colors) if (!used.Contains(c)) used.Add(c);

            var outl = new List<MoodRec>();
            for (int i = 0; i < groups.Count; i++)
            {
                var rec = new MoodRec { mood = Mood.NEUTRAL, target = 0 };
                if (rng.Randf() < neutral) { outl.Add(rec); continue; }
                var friends = new List<int>();
                foreach (var col in neighbourColors[i]) if (col != colors[i]) friends.Add(col);
                var foes = new List<int>();
                foreach (var col in used) if (col != colors[i] && !neighbourColors[i].Contains(col)) foes.Add(col);
                float roll = rng.Randf();
                if (roll < 0.65 && friends.Count > 0)
                {
                    rec.mood = Mood.AFFECTIONATE;
                    rec.target = friends[rng.RandiRange(0, friends.Count - 1)];
                }
                else if (foes.Count > 0)
                {
                    rec.mood = Mood.HOSTILE;
                    rec.target = foes[rng.RandiRange(0, foes.Count - 1)];
                }
                outl.Add(rec);
            }
            return outl;
        }
    }
}
