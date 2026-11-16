// Dumps what the Unity port computes without an engine (level generator, RNG, hashes, sound and music samples,
// texts) as JSON on stdout. tests/unity_parity.test.ts produces the same dump from src/ and compares them.
//   dotnet run --project unity/Tests/Parity -c Release -- <levelCount> <sfx names...>
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;
using CozyBlocks.Audio;
using CozyBlocks.Core;

static class Program
{
    static readonly StringBuilder sb = new StringBuilder();

    static void Num(double d) => sb.Append(d.ToString("R", CultureInfo.InvariantCulture));

    static void Str(string s)
    {
        sb.Append('"');
        foreach (char c in s)
        {
            if (c == '"' || c == '\\') sb.Append('\\').Append(c);
            else if (c < 0x20) sb.Append("\\u").Append(((int)c).ToString("x4"));
            else sb.Append(c);
        }
        sb.Append('"');
    }

    static void Cells(IReadOnlyList<Vec> cells)
    {
        sb.Append('[');
        for (int i = 0; i < cells.Count; i++)
        {
            if (i > 0) sb.Append(',');
            sb.Append('[').Append(cells[i].x).Append(',').Append(cells[i].y).Append(']');
        }
        sb.Append(']');
    }

    static void Piece(PieceData p)
    {
        sb.Append("{\"id\":").Append(p.id).Append(",\"color\":").Append(p.color).Append(",\"mood\":").Append(p.mood)
          .Append(",\"target\":").Append(p.targetColor).Append(",\"rot\":").Append(p.rot).Append(",\"eye\":[")
          .Append(p.eyeBase.x).Append(',').Append(p.eyeBase.y).Append("],\"cells\":");
        Cells(p.baseCells);
        sb.Append(",\"solution\":");
        Cells(p.solutionWorld);
        sb.Append('}');
    }

    static void Pieces(List<PieceData> list)
    {
        sb.Append('[');
        for (int i = 0; i < list.Count; i++)
        {
            if (i > 0) sb.Append(',');
            Piece(list[i]);
        }
        sb.Append(']');
    }

    static int Main(string[] args)
    {
        int levelCount = args.Length > 0 ? int.Parse(args[0], CultureInfo.InvariantCulture) : 60;
        sb.Append("{\"version\":").Append(LevelGenerator.VERSION);

        // Level generator: every field the game reads.
        sb.Append(",\"levels\":[");
        var gen = new LevelGenerator();
        for (int i = 0; i < levelCount; i++)
        {
            if (i > 0) sb.Append(',');
            var lv = gen.Generate(i);
            if (lv == null) { sb.Append("null"); continue; }
            sb.Append("{\"w\":").Append(lv.width).Append(",\"h\":").Append(lv.height).Append(",\"tier\":").Append(lv.tier)
              .Append(",\"seed\":").Append(lv.rngSeed).Append(",\"turnBudget\":").Append(lv.turnBudget)
              .Append(",\"solutions\":").Append(lv.solutionCount).Append(",\"cost\":").Append(lv.searchCost)
              .Append(",\"blocked\":");
            Cells(lv.blockedCells);
            sb.Append(",\"fixed\":");
            Pieces(lv.fixedPieces);
            sb.Append(",\"tray\":");
            Pieces(lv.trayPieces);
            sb.Append('}');
        }
        sb.Append(']');

        // PCG32: a few seeds, a few draws of each kind.
        sb.Append(",\"rng\":[");
        ulong[] seeds = { 0, 1, 42, 4246357516, 18446744073709551615 };
        for (int s = 0; s < seeds.Length; s++)
        {
            if (s > 0) sb.Append(',');
            var r = new Pcg32(seeds[s]);
            sb.Append('[');
            for (int k = 0; k < 8; k++)
            {
                if (k > 0) sb.Append(',');
                if (k % 3 == 0) sb.Append(r.NextU32());
                else if (k % 3 == 1) sb.Append(r.RandiRange(-5, 17));
                else Num(r.Randf());
            }
            sb.Append(']');
        }
        sb.Append(']');

        sb.Append(",\"hash\":[");
        string[] words = { "", "a", "dolly-blocks/v5/0", "dolly-blocks/v5/199", "Привет", "Zażółć gęślą jaźń" };
        for (int i = 0; i < words.Length; i++)
        {
            if (i > 0) sb.Append(',');
            sb.Append(GodotHash.StringHash(words[i]));
        }
        sb.Append(']');

        // Sound effects: every sample.
        sb.Append(",\"sfx\":{");
        for (int a = 1; a < args.Length; a++)
        {
            if (a > 1) sb.Append(',');
            Str(args[a]);
            sb.Append(":[");
            var data = SfxSynth.Synth(args[a]);
            for (int i = 0; i < data.Length; i++)
            {
                if (i > 0) sb.Append(',');
                sb.Append(data[i]);
            }
            sb.Append(']');
        }
        sb.Append('}');

        // Music: length plus every 997th sample (the whole loop is ~1M samples).
        var music = MusicSynth.Render();
        sb.Append(",\"music\":{\"length\":").Append(music.Length).Append(",\"probe\":[");
        for (int i = 0, n = 0; i < music.Length; i += 997, n++)
        {
            if (n > 0) sb.Append(',');
            Num(music[i]);
        }
        sb.Append("]}");

        // Texts: every key with every language column.
        sb.Append(",\"texts\":{");
        bool first = true;
        foreach (var kv in LocTexts.TEXTS)
        {
            if (!first) sb.Append(',');
            first = false;
            Str(kv.Key);
            sb.Append(":[");
            for (int i = 0; i < kv.Value.Length; i++)
            {
                if (i > 0) sb.Append(',');
                Str(kv.Value[i]);
            }
            sb.Append(']');
        }
        sb.Append("}}");

        var stdout = Console.OpenStandardOutput();
        var bytes = new UTF8Encoding(false).GetBytes(sb.ToString());
        stdout.Write(bytes, 0, bytes.Length);
        return 0;
    }
}
