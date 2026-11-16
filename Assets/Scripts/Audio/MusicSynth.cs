// Procedural background music: a 16-bar C major loop at 88 BPM.
using System;

namespace CozyBlocks.Audio
{
    public static class MusicSynth
    {
        public const int MUSIC_RATE = 22050;
        const double TAU = Math.PI * 2;
        const double BPM = 88;
        const double EIGHTH = 30 / BPM;
        const int BARS = 16;
        public static readonly double MUSIC_SECONDS = BARS * 8 * EIGHTH;
        public static readonly int MUSIC_SAMPLES = (int)Math.Floor(MUSIC_SECONDS * MUSIC_RATE + 0.5);

        sealed class Voice { public double[,] partials; public double decay, attack, gain; }

        static readonly Voice BELL = new Voice { partials = new double[,] { { 1, 1 }, { 2, 0.35 }, { 3, 0.12 }, { 4.2, 0.08 } }, decay = 3.2, attack = 0.003, gain = 0.3 };
        static readonly Voice MARIMBA = new Voice { partials = new double[,] { { 1, 1 }, { 4, 0.15 } }, decay = 5.5, attack = 0.004, gain = 0.15 };
        static readonly Voice BASS = new Voice { partials = new double[,] { { 1, 1 }, { 2, 0.2 } }, decay = 2, attack = 0.01, gain = 0.22 };
        static readonly Voice FELT = new Voice { partials = new double[,] { { 1, 1 }, { 2, 0.25 }, { 3, 0.08 } }, decay = 1.1, attack = 0.012, gain = 0.07 };

        sealed class Chord { public int bass; public int[] tones; }
        static readonly Chord C = new Chord { bass = 48, tones = new[] { 60, 64, 67, 72 } };
        static readonly Chord AM = new Chord { bass = 45, tones = new[] { 57, 60, 64, 69 } };
        static readonly Chord F = new Chord { bass = 41, tones = new[] { 53, 57, 60, 65 } };
        static readonly Chord G = new Chord { bass = 43, tones = new[] { 55, 59, 62, 67 } };
        static readonly Chord[] PROGRESSION = { C, AM, F, G, C, AM, F, G, F, C, G, AM, F, C, G, C };

        static readonly int[][,] MELODY =
        {
            new[,] { { 0, 76, 2 }, { 2, 79, 1 }, { 3, 76, 1 }, { 4, 74, 2 }, { 6, 72, 2 } },
            new[,] { { 0, 69, 2 }, { 2, 72, 2 }, { 4, 76, 3 }, { 7, 74, 1 } },
            new[,] { { 0, 77, 2 }, { 2, 76, 1 }, { 3, 74, 1 }, { 4, 72, 2 }, { 6, 69, 2 } },
            new[,] { { 0, 71, 2 }, { 2, 74, 2 }, { 4, 79, 4 } },
            new[,] { { 0, 76, 1 }, { 1, 79, 1 }, { 2, 84, 2 }, { 4, 79, 2 }, { 6, 76, 2 } },
            new[,] { { 0, 81, 2 }, { 2, 79, 1 }, { 3, 76, 1 }, { 4, 72, 2 }, { 6, 76, 2 } },
            new[,] { { 0, 77, 2 }, { 2, 81, 2 }, { 4, 79, 1 }, { 5, 77, 1 }, { 6, 76, 2 } },
            new[,] { { 0, 74, 2 }, { 2, 71, 2 }, { 4, 67, 2 }, { 6, 74, 2 } },
            new[,] { { 0, 72, 2 }, { 2, 77, 2 }, { 4, 81, 2 }, { 6, 77, 2 } },
            new[,] { { 0, 79, 2 }, { 2, 76, 2 }, { 4, 72, 2 }, { 6, 76, 2 } },
            new[,] { { 0, 74, 2 }, { 2, 79, 2 }, { 4, 83, 2 }, { 6, 79, 2 } },
            new[,] { { 0, 81, 3 }, { 3, 79, 1 }, { 4, 76, 2 }, { 6, 72, 2 } },
            new[,] { { 0, 77, 2 }, { 2, 81, 2 }, { 4, 84, 2 }, { 6, 81, 2 } },
            new[,] { { 0, 79, 2 }, { 2, 76, 1 }, { 3, 79, 1 }, { 4, 84, 4 } },
            new[,] { { 0, 83, 2 }, { 2, 79, 2 }, { 4, 74, 2 }, { 6, 71, 2 } },
            new[,] { { 0, 79, 2 }, { 2, 76, 2 }, { 4, 72, 4 } },
        };

        static readonly int[] ARP = { 0, 1, 2, 3, 2, 1, 2, 1 };

        static double Hz(int midi) => 440 * Math.Pow(2, (midi - 69) / 12.0);
        static int JsRound(double x) => (int)Math.Floor(x + 0.5);

        static void Note(float[] o, double startSec, int midi, double lengthSec, Voice v)
        {
            int n = o.Length;
            double f = Hz(midi);
            int s0 = JsRound(startSec * MUSIC_RATE);
            int total = Math.Min((int)Math.Truncate(MUSIC_RATE * 3.0), n);
            int attackN = Math.Max(1, JsRound(v.attack * MUSIC_RATE));
            int lengthN = JsRound(lengthSec * MUSIC_RATE);
            double decayStep = Math.Exp(-v.decay / MUSIC_RATE);
            double releaseStep = Math.Exp(-8.0 / MUSIC_RATE);
            int k = v.partials.GetLength(0);
            var coef = new double[k];
            var y1 = new double[k];
            var y2 = new double[k];
            for (int p = 0; p < k; p++)
            {
                double w = TAU * f * v.partials[p, 0] / MUSIC_RATE;
                coef[p] = 2 * Math.Cos(w);
                y1[p] = -Math.Sin(w);
                y2[p] = -Math.Sin(2 * w);
            }
            double decay = 1, release = 1;
            for (int i = 0; i < total; i++)
            {
                double level = (i < attackN ? (double)i / attackN : 1) * decay * release;
                if (i > attackN && level < 0.0005) break;
                double s = 0;
                for (int p = 0; p < k; p++)
                {
                    double y = coef[p] * y1[p] - y2[p];
                    y2[p] = y1[p];
                    y1[p] = y;
                    s += v.partials[p, 1] * y;
                }
                // Sum in double and round once per sample: Tests/Parity/golden.json pins these exact bits.
                int at = (s0 + i) % n;
                o[at] = (float)(o[at] + s * level * v.gain);
                decay *= decayStep;
                if (i >= lengthN) release *= releaseStep;
            }
        }

        public static float[] Render()
        {
            var o = new float[MUSIC_SAMPLES];
            double bar = 8 * EIGHTH;
            for (int b = 0; b < BARS; b++)
            {
                double t0 = b * bar;
                var chord = PROGRESSION[b];
                Note(o, t0, chord.bass, 4 * EIGHTH, BASS);
                Note(o, t0 + 4 * EIGHTH, chord.bass + 7, 4 * EIGHTH, BASS);
                foreach (var tone in chord.tones) Note(o, t0, tone, 8 * EIGHTH, FELT);
                for (int e = 0; e < 8; e++) Note(o, t0 + e * EIGHTH, chord.tones[ARP[e]] + 12, EIGHTH, MARIMBA);
                var mel = MELODY[b];
                for (int m = 0; m < mel.GetLength(0); m++) Note(o, t0 + mel[m, 0] * EIGHTH, mel[m, 1], mel[m, 2] * EIGHTH, BELL);
            }
            var dry = (float[])o.Clone();
            foreach (var (delay, gain) in new[] { (0.34, 0.22), (0.68, 0.1) })
            {
                int d = JsRound(delay * MUSIC_RATE);
                for (int i = 0; i < o.Length; i++) o[i] = (float)(o[i] + gain * dry[(i - d + o.Length) % o.Length]);
            }
            float peak = 0;
            for (int i = 0; i < o.Length; i++) peak = Math.Max(peak, Math.Abs(o[i]));
            double kk = peak > 0 ? 0.9 / peak : 1;
            for (int i = 0; i < o.Length; i++) o[i] = (float)(o[i] * kk);
            return o;
        }
    }
}
