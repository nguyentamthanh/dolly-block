// Godot's Tween easing curves.
using System;

namespace CozyBlocks.Engine
{
    public enum Trans { LINEAR, SINE, QUINT, QUART, QUAD, EXPO, ELASTIC, CUBIC, CIRC, BOUNCE, BACK }
    public enum EaseKind { IN, OUT, IN_OUT, OUT_IN }

    public static class Ease
    {
        const double PI = Math.PI;
        const double BACK_S = 1.70158;
        const double EL_P = 0.3;
        const double EL_S = EL_P / 4;

        static double BounceOut(double t)
        {
            const double n1 = 7.5625, d1 = 2.75;
            if (t < 1 / d1) return n1 * t * t;
            if (t < 2 / d1) { t -= 1.5 / d1; return n1 * t * t + 0.75; }
            if (t < 2.5 / d1) { t -= 2.25 / d1; return n1 * t * t + 0.9375; }
            t -= 2.625 / d1;
            return n1 * t * t + 0.984375;
        }

        static double ElasticIn(double t) => t == 0 ? 0 : t == 1 ? 1 : -(Math.Pow(2, 10 * (t - 1)) * Math.Sin((t - 1 - EL_S) * 2 * PI / EL_P));
        static double ElasticOut(double t) => t == 0 ? 0 : t == 1 ? 1 : Math.Pow(2, -10 * t) * Math.Sin((t - EL_S) * 2 * PI / EL_P) + 1;
        static double ElasticInOut(double t)
        {
            if (t == 0) return 0;
            if (t == 1) return 1;
            double p = EL_P * 1.5, s = p / 4, u = t * 2;
            if (u < 1) return -0.5 * Math.Pow(2, 10 * (u - 1)) * Math.Sin((u - 1 - s) * 2 * PI / p);
            return Math.Pow(2, -10 * (u - 1)) * Math.Sin((u - 1 - s) * 2 * PI / p) * 0.5 + 1;
        }
        static double BackIn(double t) => t * t * ((BACK_S + 1) * t - BACK_S);
        static double BackOut(double t) { double u = t - 1; return u * u * ((BACK_S + 1) * u + BACK_S) + 1; }
        static double BackInOut(double t)
        {
            double s = BACK_S * 1.525, u = t * 2;
            if (u < 1) return 0.5 * (u * u * ((s + 1) * u - s));
            u -= 2;
            return 0.5 * (u * u * ((s + 1) * u + s) + 2);
        }

        static Func<double, double> PolyIn(int n) => t => Math.Pow(t, n);
        static Func<double, double> PolyOut(int n) => t => 1 - Math.Pow(1 - t, n);
        static Func<double, double> PolyInOut(int n) => t => t < 0.5 ? Math.Pow(2, n - 1) * Math.Pow(t, n) : 1 - Math.Pow(-2 * t + 2, n) / 2;

        public static Func<double, double> Fn(Trans trans, EaseKind ease)
        {
            Func<double, double> Pick(Func<double, double> i, Func<double, double> o, Func<double, double> io)
                => ease == EaseKind.IN ? i : ease == EaseKind.OUT ? o : ease == EaseKind.IN_OUT ? io : o;
            switch (trans)
            {
                case Trans.SINE: return Pick(t => 1 - Math.Cos(t * PI / 2), t => Math.Sin(t * PI / 2), t => -(Math.Cos(PI * t) - 1) / 2);
                case Trans.QUAD: return Pick(PolyIn(2), PolyOut(2), PolyInOut(2));
                case Trans.CUBIC: return Pick(PolyIn(3), PolyOut(3), PolyInOut(3));
                case Trans.QUART: return Pick(PolyIn(4), PolyOut(4), PolyInOut(4));
                case Trans.QUINT: return Pick(PolyIn(5), PolyOut(5), PolyInOut(5));
                case Trans.EXPO:
                    return Pick(t => t == 0 ? 0 : Math.Pow(2, 10 * t - 10), t => t == 1 ? 1 : 1 - Math.Pow(2, -10 * t),
                        t => t == 0 ? 0 : t == 1 ? 1 : t < 0.5 ? Math.Pow(2, 20 * t - 10) / 2 : (2 - Math.Pow(2, -20 * t + 10)) / 2);
                case Trans.CIRC:
                    return Pick(t => 1 - Math.Sqrt(1 - t * t), t => Math.Sqrt(1 - (t - 1) * (t - 1)),
                        t => t < 0.5 ? (1 - Math.Sqrt(1 - (2 * t) * (2 * t))) / 2 : (Math.Sqrt(1 - (-2 * t + 2) * (-2 * t + 2)) + 1) / 2);
                case Trans.ELASTIC: return Pick(ElasticIn, ElasticOut, ElasticInOut);
                case Trans.BACK: return Pick(BackIn, BackOut, BackInOut);
                case Trans.BOUNCE:
                    return Pick(t => 1 - BounceOut(1 - t), BounceOut, t => t < 0.5 ? (1 - BounceOut(1 - 2 * t)) / 2 : (1 + BounceOut(2 * t - 1)) / 2);
                default: return t => t;
            }
        }
    }
}
