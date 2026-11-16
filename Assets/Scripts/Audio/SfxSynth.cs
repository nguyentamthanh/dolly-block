// Procedural sound effects: every clip is synthesised from code into 16-bit samples (no audio files).
using System;
using System.Collections.Generic;
using CozyBlocks.Core;

namespace CozyBlocks.Audio
{
    public static class SfxSynth
    {
        public const int MIX_RATE = 22050;
        const double TAU = Math.PI * 2;

        static double Lerp(double a, double b, double t) => a + (b - a) * t;
        static double Clamp(double x, double lo, double hi) => Math.Min(Math.Max(x, lo), hi);

        static double EnvelopeAt(double[,] env, double frac)
        {
            int n = env.GetLength(0);
            if (n == 0) return 1;
            if (frac <= env[0, 0]) return env[0, 1];
            for (int i = 0; i < n - 1; i++)
            {
                double ax = env[i, 0], ay = env[i, 1], bx = env[i + 1, 0], by = env[i + 1, 1];
                if (frac >= ax && frac <= bx)
                {
                    double span = bx - ax;
                    double t = span <= 0 ? 0 : (frac - ax) / span;
                    return Lerp(ay, by, t);
                }
            }
            return env[n - 1, 1];
        }

        static double WaveAt(bool square, double phase) => square ? (Math.Sin(phase) >= 0 ? 1 : -1) : Math.Sin(phase);
        static short ToSample(double v) => (short)Math.Truncate(Clamp(v * 0.8, -1, 1) * 32767);
        static int CountFor(double dur) => Math.Max(1, (int)Math.Truncate(dur * MIX_RATE));

        static short[] Tone(double freq, double dur, bool sq, double[,] env)
        {
            int n = CountFor(dur);
            var o = new short[n];
            for (int i = 0; i < n; i++)
            {
                double t = (double)i / MIX_RATE;
                o[i] = ToSample(EnvelopeAt(env, (double)i / n) * WaveAt(sq, TAU * freq * t));
            }
            return o;
        }

        static short[] Sweep(double f0, double f1, double dur, bool sq, double[,] env)
        {
            int n = CountFor(dur);
            var o = new short[n];
            double phase = 0;
            for (int i = 0; i < n; i++)
            {
                double frac = (double)i / n;
                phase += TAU * Lerp(f0, f1, frac) / MIX_RATE;
                o[i] = ToSample(EnvelopeAt(env, frac) * WaveAt(sq, phase));
            }
            return o;
        }

        static short[] Noise(double dur, double[,] env)
        {
            int n = CountFor(dur);
            var o = new short[n];
            var rng = new Pcg32(7);
            double y = 0;
            for (int i = 0; i < n; i++)
            {
                double frac = (double)i / n;
                double k = Lerp(0.05, 0.35, Math.Sin(frac * Math.PI));
                float r = (float)((float)(rng.Randf() * 2f) - 1f);
                y += (r - y) * k;
                o[i] = ToSample(y * 1.6 * EnvelopeAt(env, frac));
            }
            return o;
        }

        static short[] Silence(double dur) => new short[CountFor(dur)];

        static short[] Concat(params short[][] parts)
        {
            int len = 0;
            foreach (var p in parts) len += p.Length;
            var o = new short[len];
            int off = 0;
            foreach (var p in parts) { Array.Copy(p, 0, o, off, p.Length); off += p.Length; }
            return o;
        }

        static short[] Mix(short[] a, short[] b)
        {
            var o = new short[Math.Max(a.Length, b.Length)];
            for (int i = 0; i < o.Length; i++)
                o[i] = (short)Clamp((i < a.Length ? a[i] : 0) + (i < b.Length ? b[i] : 0), -32768, 32767);
            return o;
        }

        static double[,] E(params double[] p)
        {
            var e = new double[p.Length / 2, 2];
            for (int i = 0; i < p.Length / 2; i++) { e[i, 0] = p[i * 2]; e[i, 1] = p[i * 2 + 1]; }
            return e;
        }

        public static short[] Synth(string name)
        {
            switch (name)
            {
                case "pickup": return Sweep(440, 660, 0.06, false, E(0, 0, 0.15, 0.7, 1, 0));
                case "place": return Mix(Tone(523, 0.09, false, E(0, 0, 0.05, 1, 1, 0)), Tone(1046, 0.09, false, E(0, 0, 0.05, 0.3, 1, 0)));
                case "refuse": return Sweep(180, 140, 0.12, true, E(0, 0.8, 1, 0));
                case "undo": return Sweep(660, 440, 0.08, false, E(0, 0, 0.15, 0.7, 1, 0));
                case "hint_deny": return Concat(Tone(160, 0.06, true, E(0, 0.8, 1, 0)), Silence(0.03), Tone(160, 0.06, true, E(0, 0.8, 1, 0)));
                case "hint_use": return Concat(Tone(660, 0.09, false, E(0, 0, 0.1, 1, 1, 0)), Tone(880, 0.09, false, E(0, 0, 0.1, 1, 1, 0)));
                case "button_tap": return Tone(700, 0.04, false, E(0, 1, 1, 0));
                case "star_pop": return Tone(659, 0.07, false, E(0, 0, 0.1, 1, 1, 0));
                case "diamond_tick": return Tone(1200, 0.03, false, E(0, 1, 1, 0));
                case "win_fanfare":
                    {
                        int[] notes = { 523, 659, 784, 1046 };
                        var parts = new List<short[]>();
                        for (int i = 0; i < notes.Length; i++) parts.Add(Tone(notes[i], i < notes.Length - 1 ? 0.12 : 0.28, false, E(0, 0, 0.08, 1, 0.8, 0.6, 1, 0)));
                        return Concat(parts.ToArray());
                    }
                case "tick": return Tone(1500, 0.018, false, E(0, 0.7, 1, 0));
                case "pop": return Sweep(900, 300, 0.07, false, E(0, 0, 0.1, 1, 1, 0));
                case "sparkle": return Mix(Tone(1568, 0.12, false, E(0, 0, 0.05, 0.6, 1, 0)), Tone(2349, 0.12, false, E(0, 0, 0.05, 0.35, 1, 0)));
                case "happy": return Concat(Tone(784, 0.07, false, E(0, 0, 0.1, 0.9, 1, 0)), Tone(1175, 0.11, false, E(0, 0, 0.1, 0.9, 1, 0)));
                case "upset": return Sweep(240, 150, 0.16, true, E(0, 0, 0.1, 0.4, 1, 0));
                case "whoosh": return Noise(0.3, E(0, 0, 0.45, 0.55, 1, 0));
                case "focus": return Tone(1900, 0.05, false, E(0, 0, 0.1, 0.7, 1, 0));
                case "shutter":
                    {
                        var c1 = Mix(Noise(0.03, E(0, 1, 1, 0)), Tone(170, 0.03, true, E(0, 0.7, 1, 0)));
                        var c2 = Mix(Noise(0.025, E(0, 0.7, 1, 0)), Tone(230, 0.025, true, E(0, 0.5, 1, 0)));
                        return Concat(c1, Silence(0.07), c2);
                    }
                case "star_slam": return Mix(Sweep(220, 70, 0.14, false, E(0, 1, 1, 0)), Tone(1319, 0.18, false, E(0, 0, 0.04, 0.6, 1, 0)));
                default: return Tone(440, 0.05, false, E(0, 1, 1, 0));
            }
        }
    }
}
