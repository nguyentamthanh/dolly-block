// One polyomino: a connected shape, a colour and an optional feeling about another colour.
using System;
using System.Collections.Generic;
using System.Text;

namespace CozyBlocks.Core
{
    [Serializable]
    public struct Vec : IEquatable<Vec>
    {
        public int x, y;
        public Vec(int x, int y) { this.x = x; this.y = y; }
        public bool Equals(Vec o) => x == o.x && y == o.y;
        public override bool Equals(object obj) => obj is Vec o && Equals(o);
        public override int GetHashCode() => y * 1024 + x;
        public static bool operator ==(Vec a, Vec b) => a.x == b.x && a.y == b.y;
        public static bool operator !=(Vec a, Vec b) => !(a == b);
        public override string ToString() => $"({x},{y})";
    }

    public static class Mood
    {
        public const int NEUTRAL = 0, AFFECTIONATE = 1, HOSTILE = 2;
    }

    public sealed class PieceData
    {
        static readonly Vec[] NEIGHBOURS = { new Vec(1, 0), new Vec(-1, 0), new Vec(0, 1), new Vec(0, -1) };

        public int id;
        public int color;
        public int mood = Mood.NEUTRAL;
        public int targetColor;
        public List<Vec> baseCells = new List<Vec>();
        public Vec eyeBase;
        public int rot;
        public List<Vec> solutionWorld = new List<Vec>();

        public static Vec BboxMin(IReadOnlyList<Vec> cells)
        {
            int mx = 999, my = 999;
            foreach (var c in cells)
            {
                if (c.x < mx) mx = c.x;
                if (c.y < my) my = c.y;
            }
            return new Vec(mx, my);
        }

        static Vec Rotate90(Vec c) => new Vec(-c.y, c.x);

        static List<Vec> Orient(IReadOnlyList<Vec> cells, int r)
        {
            var o = new List<Vec>(cells.Count);
            foreach (var c in cells)
            {
                var p = c;
                for (int i = 0; i < r; i++) p = Rotate90(p);
                o.Add(p);
            }
            var origin = BboxMin(o);
            for (int i = 0; i < o.Count; i++) o[i] = new Vec(o[i].x - origin.x, o[i].y - origin.y);
            o.Sort((a, b) => a.y != b.y ? a.y - b.y : a.x - b.x);
            return o;
        }

        static Vec OrientPoint(IReadOnlyList<Vec> cells, Vec point, int r)
        {
            var rotated = new List<Vec>(cells.Count);
            foreach (var c in cells)
            {
                var q = c;
                for (int i = 0; i < r; i++) q = Rotate90(q);
                rotated.Add(q);
            }
            var p = point;
            for (int i = 0; i < r; i++) p = Rotate90(p);
            var m = BboxMin(rotated);
            return new Vec(p.x - m.x, p.y - m.y);
        }

        static Vec PickEye(IReadOnlyList<Vec> cells)
        {
            var set = new HashSet<Vec>(cells);
            var best = cells[0];
            int bestN = 99;
            foreach (var c in cells)
            {
                int n = 0;
                foreach (var off in NEIGHBOURS) if (set.Contains(new Vec(c.x + off.x, c.y + off.y))) n++;
                if (n < bestN) { bestN = n; best = c; }
            }
            return best;
        }

        static string CellsKey(IReadOnlyList<Vec> cells)
        {
            var sb = new StringBuilder();
            for (int i = 0; i < cells.Count; i++)
            {
                if (i > 0) sb.Append(',');
                sb.Append(cells[i].x).Append(',').Append(cells[i].y);
            }
            return sb.ToString();
        }

        public static PieceData Make(int pid, int c, IReadOnlyList<Vec> cells, int m = Mood.NEUTRAL, int t = 0)
        {
            var p = new PieceData { id = pid, color = c, mood = m, targetColor = t };
            var oriented = Orient(cells, 0);
            p.baseCells = oriented;
            p.eyeBase = PickEye(oriented);
            p.rot = 0;
            return p;
        }

        public static PieceData FromWorld(int pid, int c, IReadOnlyList<Vec> world, int m = Mood.NEUTRAL, int t = 0)
        {
            var origin = BboxMin(world);
            var local = new List<Vec>(world.Count);
            foreach (var cell in world) local.Add(new Vec(cell.x - origin.x, cell.y - origin.y));
            var p = Make(pid, c, local, m, t);
            p.solutionWorld = new List<Vec>(world);
            return p;
        }

        public PieceData DuplicatePiece()
        {
            return new PieceData
            {
                id = id, color = color, mood = mood, targetColor = targetColor,
                baseCells = new List<Vec>(baseCells), eyeBase = eyeBase, rot = rot,
                solutionWorld = new List<Vec>(solutionWorld),
            };
        }

        public List<Vec> LocalCells() => Orient(baseCells, rot);
        public Vec LocalEye() => OrientPoint(baseCells, eyeBase, rot);

        public List<Vec> WorldCells(Vec origin)
        {
            var l = LocalCells();
            for (int i = 0; i < l.Count; i++) l[i] = new Vec(origin.x + l[i].x, origin.y + l[i].y);
            return l;
        }

        public Vec Bbox()
        {
            int mx = 0, my = 0;
            foreach (var c in LocalCells())
            {
                if (c.x > mx) mx = c.x;
                if (c.y > my) my = c.y;
            }
            return new Vec(mx + 1, my + 1);
        }

        public void RotateCw() { rot = (rot + 1) & 3; }

        public List<int> UniqueRots()
        {
            var seen = new HashSet<string>();
            var o = new List<int>();
            for (int r = 0; r < 4; r++)
            {
                if (seen.Add(CellsKey(Orient(baseCells, r)))) o.Add(r);
            }
            return o;
        }

        public Vec OrientToSolution()
        {
            var origin = BboxMin(solutionWorld);
            var want = new List<Vec>();
            foreach (var c in solutionWorld) want.Add(new Vec(c.x - origin.x, c.y - origin.y));
            string wantKey = CellsKey(Orient(want, 0));
            for (int r = 0; r < 4; r++)
            {
                if (CellsKey(Orient(baseCells, r)) == wantKey) { rot = r; return origin; }
            }
            rot = 0;
            return origin;
        }

        public string Describe()
        {
            string shape = baseCells.Count + "-omino";
            if (mood == Mood.AFFECTIONATE) return $"{Palette.NameOf(color)} {shape} loves {Palette.NameOf(targetColor)}";
            if (mood == Mood.HOSTILE) return $"{Palette.NameOf(color)} {shape} avoids {Palette.NameOf(targetColor)}";
            return $"{Palette.NameOf(color)} {shape}";
        }
    }
}
