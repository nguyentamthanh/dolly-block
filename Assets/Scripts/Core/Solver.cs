// Backtracking packer (masks are one ulong instead of two
// 32-bit words, which is bit-for-bit the same set).
using System.Collections.Generic;

namespace CozyBlocks.Core
{
    public sealed class Solver
    {
        public const int DEFAULT_NODE_BUDGET = 40000;

        sealed class MaskCache
        {
            public ulong[] m;
            public int[] rots, ox, oy;
        }

        struct Option
        {
            public int rot;
            public Vec origin;
            public ulong m;
        }

        public int nodes;
        public bool aborted;
        int budget = DEFAULT_NODE_BUDGET;
        readonly bool rotate;
        int cap = 2;
        int total;
        readonly Dictionary<int, MaskCache> cache = new Dictionary<int, MaskCache>();
        ulong occ;
        ulong board;
        bool useMasks;

        public Solver(bool rotate = true) { this.rotate = rotate; }

        List<int> RotationsOf(PieceData p) => rotate ? p.UniqueRots() : new List<int> { p.rot };

        static List<PieceData> Dup(IReadOnlyList<PieceData> tray)
        {
            var l = new List<PieceData>(tray.Count);
            foreach (var p in tray) l.Add(p.DuplicatePiece());
            return l;
        }

        public int CountSolutions(BoardState state, IReadOnlyList<PieceData> tray, int cap = 2, int budget = DEFAULT_NODE_BUDGET)
        {
            nodes = 0;
            aborted = false;
            this.budget = budget;
            this.cap = cap;
            total = 0;
            var remaining = Dup(tray);
            Prepare(state, remaining);
            return Search(state, remaining);
        }

        public bool IsSolvable(BoardState state, IReadOnlyList<PieceData> tray, int budget = DEFAULT_NODE_BUDGET)
            => CountSolutions(state, tray, 1, budget) >= 1;

        public bool HasSolution(BoardState state, IReadOnlyList<PieceData> tray, int budget = DEFAULT_NODE_BUDGET)
            => IsSolvable(state, tray, budget);

        public BoardState Solve(BoardState state, IReadOnlyList<PieceData> tray, int budget = DEFAULT_NODE_BUDGET)
        {
            nodes = 0;
            aborted = false;
            this.budget = budget;
            cap = 1;
            var remaining = Dup(tray);
            var cloned = state.Clone();
            Prepare(cloned, remaining);
            return SolveSearch(cloned, remaining);
        }

        void Prepare(BoardState state, List<PieceData> remaining)
        {
            cache.Clear();
            occ = 0;
            useMasks = false;
            if (remaining.Count == 0 || state.width * state.height > 63) return;
            useMasks = true;
            board = 0;
            int width = state.width, height = state.height;
            for (int y = 0; y < height; y++)
                for (int x = 0; x < width; x++)
                {
                    int b = y * width + x;
                    board |= 1UL << b;
                    if (!state.IsEmptyAt(new Vec(x, y))) occ |= 1UL << b;
                }
            foreach (var piece in remaining)
            {
                var m = new List<ulong>();
                var rots = new List<int>();
                var ox = new List<int>();
                var oy = new List<int>();
                int savedRot = piece.rot;
                foreach (var r in RotationsOf(piece))
                {
                    piece.rot = r;
                    var local = piece.LocalCells();
                    for (int y = 0; y < height; y++)
                        for (int x = 0; x < width; x++)
                        {
                            ulong mm = 0;
                            bool inside = true;
                            foreach (var c in local)
                            {
                                int cx = x + c.x, cy = y + c.y;
                                if (cx < 0 || cy < 0 || cx >= width || cy >= height) { inside = false; break; }
                                mm |= 1UL << (cy * width + cx);
                            }
                            if (inside) { m.Add(mm); rots.Add(r); ox.Add(x); oy.Add(y); }
                        }
                }
                piece.rot = savedRot;
                cache[piece.id] = new MaskCache { m = m.ToArray(), rots = rots.ToArray(), ox = ox.ToArray(), oy = oy.ToArray() };
            }
        }

        int Pick(BoardState state, List<PieceData> remaining, out List<Option> options)
        {
            options = null;
            if (!useMasks)
            {
                int bestI = 0;
                List<Option> bestOpts = new List<Option>();
                int bestN = 1000000;
                for (int i = 0; i < remaining.Count; i++)
                {
                    var opts = Placements(state, remaining[i]);
                    if (opts.Count < bestN)
                    {
                        bestN = opts.Count;
                        bestI = i;
                        bestOpts = opts;
                        if (bestN == 0) return -1;
                    }
                }
                options = bestOpts;
                return bestI;
            }

            ulong em = board & ~occ;
            ulong cover = 0;
            int bestPiece = -1;
            int bestFit = 1000000;
            List<int> bestIdx = null;
            for (int i = 0; i < remaining.Count; i++)
            {
                var e = cache[remaining[i].id];
                var idx = new List<int>();
                for (int k = 0; k < e.m.Length; k++)
                {
                    if ((e.m[k] & occ) == 0)
                    {
                        idx.Add(k);
                        cover |= e.m[k];
                    }
                }
                if (idx.Count == 0) return -1;
                if (idx.Count < bestFit)
                {
                    bestFit = idx.Count;
                    bestPiece = i;
                    bestIdx = idx;
                }
            }
            if ((cover & em) != em) return -1;

            var chosen = remaining[bestPiece];
            var ce = cache[chosen.id];
            int saved = chosen.rot;
            var outl = new List<Option>();
            foreach (var k in bestIdx)
            {
                chosen.rot = ce.rots[k];
                var origin = new Vec(ce.ox[k], ce.oy[k]);
                if (state.PlacementViolates(chosen, origin)) continue;
                outl.Add(new Option { rot = ce.rots[k], origin = origin, m = ce.m[k] });
            }
            chosen.rot = saved;
            if (outl.Count == 0) return -1;
            options = outl;
            return bestPiece;
        }

        static List<PieceData> Without(List<PieceData> l, int skip)
        {
            var r = new List<PieceData>(l.Count - 1);
            for (int i = 0; i < l.Count; i++) if (i != skip) r.Add(l[i]);
            return r;
        }

        int Search(BoardState state, List<PieceData> remaining)
        {
            if (aborted) return 0;
            nodes++;
            if (nodes > budget) { aborted = true; return 0; }
            if (remaining.Count == 0)
            {
                if (!state.IsSolved()) return 0;
                total++;
                return 1;
            }
            int bestI = Pick(state, remaining, out var bestOpts);
            if (bestI < 0) return 0;
            var piece = remaining[bestI];
            var rest = Without(remaining, bestI);
            int found = 0;
            int savedRot = piece.rot;
            foreach (var opt in bestOpts)
            {
                piece.rot = opt.rot;
                state.PlacePiece(piece, opt.origin);
                if (useMasks) occ |= opt.m;
                found += Search(state, rest);
                if (useMasks) occ &= ~opt.m;
                state.RemovePiece(piece.id);
                if (total >= cap) { piece.rot = savedRot; return found; }
            }
            piece.rot = savedRot;
            return found;
        }

        BoardState SolveSearch(BoardState state, List<PieceData> remaining)
        {
            if (aborted) return null;
            nodes++;
            if (nodes > budget) { aborted = true; return null; }
            if (remaining.Count == 0) return state.IsSolved() ? state.Clone() : null;
            if (nodes == 1 && state.AnyViolated()) return null;
            int bestI = Pick(state, remaining, out var bestOpts);
            if (bestI < 0) return null;
            var piece = remaining[bestI];
            var rest = Without(remaining, bestI);
            int savedRot = piece.rot;
            foreach (var opt in bestOpts)
            {
                piece.rot = opt.rot;
                state.PlacePiece(piece, opt.origin);
                if (useMasks) occ |= opt.m;
                var res = SolveSearch(state, rest);
                if (useMasks) occ &= ~opt.m;
                state.RemovePiece(piece.id);
                if (res != null) { piece.rot = savedRot; return res; }
                if (aborted) { piece.rot = savedRot; return null; }
            }
            piece.rot = savedRot;
            return null;
        }

        List<Option> Placements(BoardState state, PieceData piece)
        {
            var o = new List<Option>();
            int savedRot = piece.rot;
            foreach (var r in RotationsOf(piece))
            {
                piece.rot = r;
                var local = piece.LocalCells();
                for (int y = 0; y < state.height; y++)
                    for (int x = 0; x < state.width; x++)
                    {
                        var origin = new Vec(x, y);
                        bool ok = true;
                        foreach (var c in local)
                            if (!state.IsEmptyAt(new Vec(x + c.x, y + c.y))) { ok = false; break; }
                        if (!ok) continue;
                        if (state.WouldViolate(piece, origin)) continue;
                        o.Add(new Option { rot = r, origin = origin, m = 0 });
                    }
            }
            piece.rot = savedRot;
            return o;
        }
    }
}
