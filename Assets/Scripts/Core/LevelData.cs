// One packing puzzle.
using System.Collections.Generic;

namespace CozyBlocks.Core
{
    public sealed class LevelData
    {
        public int width, height;
        public List<Vec> blockedCells = new List<Vec>();
        public List<PieceData> fixedPieces = new List<PieceData>();
        public List<PieceData> trayPieces = new List<PieceData>();
        public int turnBudget = 36;
        public int levelIndex, tier;
        public uint rngSeed;
        public int solutionCount, searchCost;

        public BoardState BuildState()
        {
            var s = new BoardState(width, height, blockedCells);
            foreach (var p in fixedPieces) s.PlacePiece(p, p.OrientToSolution());
            return s;
        }

        public List<PieceData> TrayCopy()
        {
            var l = new List<PieceData>();
            foreach (var p in trayPieces) l.Add(p.DuplicatePiece());
            return l;
        }

        public List<PieceData> AllPieces()
        {
            var l = new List<PieceData>(fixedPieces);
            l.AddRange(trayPieces);
            return l;
        }
    }
}
