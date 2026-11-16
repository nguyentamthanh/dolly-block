// Grid occupancy plus the placed polyominoes. Pure logic.
using System.Collections.Generic;

namespace CozyBlocks.Core
{
    public sealed class PlacedRecord
    {
        public PieceData piece;
        public Vec origin;
        public List<Vec> cells;
    }

    public sealed class SnapshotEntry
    {
        public int color, mood, target;
        public List<Vec> cells;
        public Vec eye;
    }

    public sealed class BoardState
    {
        public static readonly Vec[] NEIGHBOUR_OFFSETS = { new Vec(1, 0), new Vec(-1, 0), new Vec(0, 1), new Vec(0, -1) };
        public const int EMPTY = -1;

        public readonly int width;
        public readonly int height;
        byte[] blocked;
        int[] occ;
        int[] colour;
        int[][] nbr;
        int[] playable;
        // Insertion-ordered: the level generator iterates it, and the order decides the puzzle.
        List<int> order = new List<int>();
        Dictionary<int, PlacedRecord> placed = new Dictionary<int, PlacedRecord>();

        public BoardState(int w = 0, int h = 0, IReadOnlyList<Vec> blockedCells = null)
        {
            width = w;
            height = h;
            int n = w * h;
            blocked = new byte[n];
            occ = new int[n];
            colour = new int[n];
            for (int i = 0; i < n; i++) { occ[i] = EMPTY; colour[i] = EMPTY; }
            if (blockedCells != null)
                foreach (var cell in blockedCells) if (IsInside(cell)) blocked[cell.y * w + cell.x] = 1;
            BuildTables();
        }

        BoardState(int w, int h, bool raw) { width = w; height = h; }

        void BuildTables()
        {
            nbr = new int[width * height][];
            var pl = new List<int>();
            var list = new List<int>(4);
            for (int y = 0; y < height; y++)
            {
                for (int x = 0; x < width; x++)
                {
                    int i = y * width + x;
                    list.Clear();
                    if (blocked[i] == 0)
                    {
                        pl.Add(i);
                        foreach (var o in NEIGHBOUR_OFFSETS)
                        {
                            int nx = x + o.x, ny = y + o.y;
                            if (nx >= 0 && ny >= 0 && nx < width && ny < height)
                            {
                                int j = ny * width + nx;
                                if (blocked[j] == 0) list.Add(j);
                            }
                        }
                    }
                    nbr[i] = list.ToArray();
                }
            }
            playable = pl.ToArray();
        }

        int Idx(Vec p) => p.y * width + p.x;
        Vec Pos(int i) => new Vec(i % width, i / width);

        public bool IsInside(Vec p) => p.x >= 0 && p.y >= 0 && p.x < width && p.y < height;
        public bool IsPlayable(Vec p) => IsInside(p) && blocked[Idx(p)] == 0;
        public bool IsEmptyAt(Vec p) => IsPlayable(p) && occ[Idx(p)] == EMPTY;
        public int ColorAt(Vec p) => IsInside(p) ? colour[Idx(p)] : EMPTY;
        public int PieceIdAt(Vec p) => IsInside(p) ? occ[Idx(p)] : EMPTY;
        public PlacedRecord GetPlaced(int id) => placed.TryGetValue(id, out var r) ? r : null;
        public bool HasPlaced(int id) => placed.ContainsKey(id);
        public List<int> PlacedIds() => new List<int>(order);

        public List<Vec> PlayableCells()
        {
            var o = new List<Vec>(playable.Length);
            foreach (var i in playable) o.Add(Pos(i));
            return o;
        }

        public List<Vec> EmptyCells()
        {
            var o = new List<Vec>();
            foreach (var i in playable) if (occ[i] == EMPTY) o.Add(Pos(i));
            return o;
        }

        public int EmptyCount()
        {
            int n = 0;
            foreach (var i in playable) if (occ[i] == EMPTY) n++;
            return n;
        }

        public bool CanPlaceCells(IReadOnlyList<Vec> cells)
        {
            foreach (var c in cells) if (!IsEmptyAt(c)) return false;
            return true;
        }

        public bool PlacePiece(PieceData piece, Vec origin)
        {
            var cells = piece.WorldCells(origin);
            if (!CanPlaceCells(cells)) return false;
            foreach (var c in cells)
            {
                int i = Idx(c);
                occ[i] = piece.id;
                colour[i] = piece.color;
            }
            if (!placed.ContainsKey(piece.id)) order.Add(piece.id);
            placed[piece.id] = new PlacedRecord { piece = piece, origin = origin, cells = cells };
            return true;
        }

        public PieceData RemovePiece(int id)
        {
            if (!placed.TryGetValue(id, out var rec)) return null;
            foreach (var c in rec.cells)
            {
                int i = Idx(c);
                occ[i] = EMPTY;
                colour[i] = EMPTY;
            }
            placed.Remove(id);
            order.Remove(id);
            return rec.piece;
        }

        public List<Vec> Neighbours(Vec p)
        {
            var o = new List<Vec>();
            if (!IsPlayable(p)) return o;
            foreach (var j in nbr[Idx(p)]) o.Add(Pos(j));
            return o;
        }

        public BoardState Clone()
        {
            var c = new BoardState(width, height, true);
            c.blocked = (byte[])blocked.Clone();
            c.occ = (int[])occ.Clone();
            c.colour = (int[])colour.Clone();
            c.nbr = nbr;
            c.playable = playable;
            foreach (var id in order)
            {
                var rec = placed[id];
                c.order.Add(id);
                c.placed[id] = new PlacedRecord { piece = rec.piece.DuplicatePiece(), origin = rec.origin, cells = new List<Vec>(rec.cells) };
            }
            return c;
        }

        int AdjColors(List<Vec> cells, int pid)
        {
            int found = 0;
            foreach (var c in cells)
            {
                if (!IsInside(c)) continue;
                foreach (var j in nbr[Idx(c)])
                {
                    int oid = occ[j];
                    if (oid != EMPTY && oid != pid) found |= 1 << colour[j];
                }
            }
            return found;
        }

        bool HasEmptyNeighbour(List<Vec> cells)
        {
            foreach (var c in cells)
            {
                if (!IsInside(c)) continue;
                foreach (var j in nbr[Idx(c)]) if (occ[j] == EMPTY) return true;
            }
            return false;
        }

        public bool PieceSatisfied(int id)
        {
            if (!placed.TryGetValue(id, out var rec)) return false;
            var piece = rec.piece;
            if (piece.mood == Mood.NEUTRAL) return true;
            bool has = (AdjColors(rec.cells, id) & (1 << piece.targetColor)) != 0;
            return piece.mood == Mood.AFFECTIONATE ? has : !has;
        }

        public bool PieceViolated(int id)
        {
            if (!placed.TryGetValue(id, out var rec)) return false;
            var piece = rec.piece;
            if (piece.mood == Mood.NEUTRAL) return false;
            bool has = (AdjColors(rec.cells, id) & (1 << piece.targetColor)) != 0;
            if (piece.mood == Mood.HOSTILE) return has;
            if (has) return false;
            if (HasEmptyNeighbour(rec.cells)) return false;
            return true;
        }

        public bool AnyViolated()
        {
            foreach (var id in order) if (PieceViolated(id)) return true;
            return false;
        }

        public List<int> ViolatedIds()
        {
            var o = new List<int>();
            foreach (var id in order) if (PieceViolated(id)) o.Add(id);
            return o;
        }

        public List<Vec> ViolatedCells()
        {
            var o = new List<Vec>();
            foreach (var id in order) if (PieceViolated(id)) o.AddRange(placed[id].cells);
            return o;
        }

        public bool PlacementViolates(PieceData piece, Vec origin)
        {
            var cells = piece.WorldCells(origin);
            if (!CanPlaceCells(cells)) return true;
            PlacePiece(piece, origin);
            bool bad = PieceViolated(piece.id);
            if (!bad)
            {
                var seen = new HashSet<int>();
                foreach (var c in cells)
                {
                    foreach (var off in NEIGHBOUR_OFFSETS)
                    {
                        int nid = PieceIdAt(new Vec(c.x + off.x, c.y + off.y));
                        if (nid == piece.id || seen.Contains(nid)) continue;
                        seen.Add(nid);
                        if (placed.ContainsKey(nid) && PieceViolated(nid)) { bad = true; break; }
                    }
                    if (bad) break;
                }
            }
            RemovePiece(piece.id);
            return bad;
        }

        public bool WouldViolate(PieceData piece, Vec origin)
        {
            var cells = piece.WorldCells(origin);
            if (!CanPlaceCells(cells)) return true;
            PlacePiece(piece, origin);
            bool bad = AnyViolated();
            RemovePiece(piece.id);
            return bad;
        }

        public bool IsFull() => EmptyCount() == 0;

        public bool IsSolved()
        {
            if (EmptyCount() != 0) return false;
            foreach (var id in order) if (!PieceSatisfied(id)) return false;
            return true;
        }

        public List<SnapshotEntry> Snapshot()
        {
            var o = new List<SnapshotEntry>();
            foreach (var id in order)
            {
                var rec = placed[id];
                var piece = rec.piece;
                var eyeLocal = piece.LocalEye();
                o.Add(new SnapshotEntry
                {
                    color = piece.color, mood = piece.mood, target = piece.targetColor,
                    cells = new List<Vec>(rec.cells),
                    eye = new Vec(rec.origin.x + eyeLocal.x, rec.origin.y + eyeLocal.y),
                });
            }
            return o;
        }
    }
}
