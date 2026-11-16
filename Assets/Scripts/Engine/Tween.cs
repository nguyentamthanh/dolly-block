// A tween engine mirroring Godot's Tween: tweeners run one after another, set_parallel
// groups them until chain(). Driven by TweenRunner.Update(dt) from the owning scene.
using System;
using System.Collections.Generic;
using UnityEngine;

namespace CozyBlocks.Engine
{
    /// <summary>Anything a PropTweener can drive by name (alpha, rotation, x, y, scale, position, topLeft).</summary>
    public interface ITweenTarget
    {
        float GetProp(string prop);
        void SetProp(string prop, float v);
        Vector2 GetProp2(string prop);
        void SetProp2(string prop, Vector2 v);
    }

    interface ITweener
    {
        void Begin();
        double Step(double dt);
    }

    public sealed class PropTweener : ITweener
    {
        Func<double, double> ease = Ease.Fn(Trans.LINEAR, EaseKind.IN);
        Trans trans = Trans.LINEAR;
        EaseKind ek = EaseKind.IN;
        double delay, t;
        readonly ITweenTarget obj;
        readonly string prop;
        readonly bool pair;
        readonly float to1;
        readonly Vector2 to2;
        readonly double dur;
        float from1;
        Vector2 from2;
        bool hasFixedFrom;
        float fixed1;
        Vector2 fixed2;

        public PropTweener(ITweenTarget o, string p, float to, double d) { obj = o; prop = p; to1 = to; dur = d; }
        public PropTweener(ITweenTarget o, string p, Vector2 to, double d) { obj = o; prop = p; to2 = to; pair = true; dur = d; }

        public PropTweener SetTrans(Trans tr) { trans = tr; ease = Ease.Fn(trans, ek); return this; }
        public PropTweener SetEase(EaseKind e) { ek = e; ease = Ease.Fn(trans, ek); return this; }
        public PropTweener SetDelay(double d) { delay = d; return this; }
        public PropTweener From(float v) { hasFixedFrom = true; fixed1 = v; return this; }
        public PropTweener From(Vector2 v) { hasFixedFrom = true; fixed2 = v; return this; }

        public void Begin()
        {
            t = 0;
            if (pair) from2 = hasFixedFrom ? fixed2 : obj.GetProp2(prop);
            else from1 = hasFixedFrom ? fixed1 : obj.GetProp(prop);
        }

        public double Step(double dt)
        {
            t += dt;
            double local = t - delay;
            if (local < 0) return -1;
            double k = dur <= 0 ? 1 : Math.Min(local / dur, 1);
            float e = (float)ease(k);
            if (pair) obj.SetProp2(prop, new Vector2(from2.x + (to2.x - from2.x) * e, from2.y + (to2.y - from2.y) * e));
            else obj.SetProp(prop, from1 + (to1 - from1) * e);
            if (k >= 1) return Math.Max(0, local - dur);
            return -1;
        }
    }

    public sealed class MethodTweener : ITweener
    {
        Func<double, double> ease = Ease.Fn(Trans.LINEAR, EaseKind.IN);
        Trans trans = Trans.LINEAR;
        EaseKind ek = EaseKind.IN;
        double t;
        readonly Action<float> fn;
        readonly float from, to;
        readonly double dur;

        public MethodTweener(Action<float> f, float a, float b, double d) { fn = f; from = a; to = b; dur = d; }
        public MethodTweener SetTrans(Trans tr) { trans = tr; ease = Ease.Fn(trans, ek); return this; }
        public MethodTweener SetEase(EaseKind e) { ek = e; ease = Ease.Fn(trans, ek); return this; }
        public void Begin() { t = 0; }
        public double Step(double dt)
        {
            t += dt;
            double k = dur <= 0 ? 1 : Math.Min(t / dur, 1);
            fn(from + (to - from) * (float)ease(k));
            if (k >= 1) return Math.Max(0, t - dur);
            return -1;
        }
    }

    sealed class IntervalTweener : ITweener
    {
        double t;
        readonly double dur;
        public IntervalTweener(double d) { dur = d; }
        public void Begin() { t = 0; }
        public double Step(double dt) { t += dt; return t >= dur ? t - dur : -1; }
    }

    sealed class CallbackTweener : ITweener
    {
        readonly Action fn;
        public CallbackTweener(Action f) { fn = f; }
        public void Begin() { }
        public double Step(double dt) { fn(); return dt; }
    }

    public sealed class Tween
    {
        readonly List<List<ITweener>> groups = new List<List<ITweener>>();
        bool parallel, chainNext, started;
        int loops = 1, loopsDone, gi;
        public bool valid = true;
        readonly TweenRunner runner;

        public Tween(TweenRunner r) { runner = r; }

        T Add<T>(T t) where T : ITweener
        {
            if (!parallel || chainNext || groups.Count == 0)
            {
                groups.Add(new List<ITweener> { t });
                chainNext = false;
            }
            else groups[groups.Count - 1].Add(t);
            return t;
        }

        public Tween SetParallel(bool p = true) { parallel = p; return this; }
        public Tween Chain() { chainNext = true; return this; }
        public Tween SetLoops(int n = 0) { loops = n; return this; }

        public PropTweener TweenProperty(ITweenTarget obj, string prop, float to, double dur) => Add(new PropTweener(obj, prop, to, dur));
        public PropTweener TweenProperty(ITweenTarget obj, string prop, Vector2 to, double dur) => Add(new PropTweener(obj, prop, to, dur));
        public MethodTweener TweenMethod(Action<float> fn, float from, float to, double dur) => Add(new MethodTweener(fn, from, to, dur));
        public Tween TweenInterval(double dur) { Add(new IntervalTweener(dur)); return this; }
        public Tween TweenCallback(Action fn) { Add(new CallbackTweener(fn)); return this; }

        public void Kill()
        {
            valid = false;
            runner.Remove(this);
        }

        public bool Update(double dt)
        {
            if (!valid) return false;
            if (groups.Count == 0) { valid = false; return false; }
            if (!started) { started = true; BeginGroup(); }
            double left = dt;
            for (int guard = 0; guard < 64 && valid; guard++)
            {
                var group = groups[gi];
                double leftover = double.PositiveInfinity;
                bool allDone = true;
                for (int i = 0; i < group.Count; i++)
                {
                    double r = group[i].Step(left);
                    if (r < 0) allDone = false;
                    else leftover = Math.Min(leftover, r);
                }
                if (!allDone) return true;
                left = double.IsPositiveInfinity(leftover) ? 0 : leftover;
                gi++;
                if (gi >= groups.Count)
                {
                    loopsDone++;
                    if (loops != 0 && loopsDone >= loops) { valid = false; return false; }
                    gi = 0;
                }
                BeginGroup();
                if (left <= 0) return true;
            }
            return valid;
        }

        void BeginGroup() { foreach (var t in groups[gi]) t.Begin(); }
    }

    public sealed class TweenRunner
    {
        readonly List<Tween> tweens = new List<Tween>();
        public Tween Create()
        {
            var t = new Tween(this);
            tweens.Add(t);
            return t;
        }
        public void Remove(Tween t) => tweens.Remove(t);
        public void Update(double dt)
        {
            foreach (var t in tweens.ToArray())
                if (!t.Update(dt)) tweens.Remove(t);
        }
        public void KillAll()
        {
            foreach (var t in tweens) t.valid = false;
            tweens.Clear();
        }
    }
}
