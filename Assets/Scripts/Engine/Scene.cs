// A scene: a display list sorted by depth, an update loop, scene-level pointer events, delayed calls
// and a shutdown event, plus the logical camera, the resize hook and the scene's tween manager.
using System;
using System.Collections.Generic;
using UnityEngine;
using CozyBlocks.Render;

namespace CozyBlocks.Engine
{
    public sealed class Pointer
    {
        public int id;
        /// <summary>Position in screen pixels, top-left origin.</summary>
        public float x, y;
        public float downX, downY;
        public bool isDown;
        public bool wasTouch;
        public float downTime;
        public Vector2 Logical => new Vector2(x / Viewport.rs, y / Viewport.rs);
    }

    public abstract class Scene
    {
        public string key;
        public SceneManager mgr;
        public readonly List<GameObj> displayList = new List<GameObj>();
        public readonly TweenRunner tw = new TweenRunner();
        public bool running;
        public bool inputEnabled = true;
        public bool updatePaused;
        /// <summary>Scene clock in ms.</summary>
        public float timeNow;
        /// <summary>Main camera scroll (screen shake) and optional clear colour.</summary>
        public float camScrollX, camScrollY;
        public Color? backgroundColor;
        public event Action Shutdown;
        public event Action<float, float> OnUpdate;

        public event Action<Pointer, List<GameObj>> InputDown;
        public event Action<Pointer> InputMove, InputUp, InputUpOutside;
        public event Action<Pointer, float, float> InputWheel;

        sealed class Timer { public float at; public Action fn; public bool cancelled; }
        readonly List<Timer> timers = new List<Timer>();
        Action unsub;

        public float W => Viewport.w;
        public float H => Viewport.h;

        public T Add<T>(T obj) where T : GameObj
        {
            if (obj.parent != null) obj.parent.children.Remove(obj);
            obj.parent = null;
            SetScene(obj, this);
            if (!displayList.Contains(obj)) displayList.Add(obj);
            return obj;
        }

        static void SetScene(GameObj o, Scene s)
        {
            o.scene = s;
            foreach (var c in o.children) SetScene(c, s);
        }

        public Container AddContainer(float x = 0, float y = 0) => Add(new Container(x, y));
        public RectObj AddRect(float x, float y, float w, float h, Color c) => Add(new RectObj(x, y, w, h, c));

        public void DelayedCall(float ms, Action fn) => timers.Add(new Timer { at = timeNow + ms, fn = fn });

        internal void Boot(object data)
        {
            running = true;
            timeNow = 0;
            unsub = Viewport.OnChange(OnResize);
            Build(data);
        }

        internal void DoShutdown()
        {
            running = false;
            tw.KillAll();
            unsub?.Invoke();
            unsub = null;
            Shutdown?.Invoke();
            Shutdown = null;
            foreach (var o in displayList.ToArray()) o.Destroy();
            displayList.Clear();
            timers.Clear();
            OnUpdate = null;
            InputDown = null;
            InputMove = null;
            InputUp = null;
            InputUpOutside = null;
            InputWheel = null;
        }

        internal void Step(float deltaMs)
        {
            if (updatePaused) return;
            timeNow += deltaMs;
            for (int i = 0; i < timers.Count; i++)
            {
                var t = timers[i];
                if (timeNow >= t.at)
                {
                    timers.RemoveAt(i--);
                    t.fn();
                    if (!running) return;
                }
            }
            Update(timeNow, deltaMs);
            OnUpdate?.Invoke(timeNow, deltaMs);
        }

        /// <summary>Build the scene's objects.</summary>
        protected abstract void Build(object data);
        /// <summary>The window changed size: recompute layout.</summary>
        protected virtual void OnResize() { }
        protected virtual void Update(float time, float deltaMs) { tw.Update(Mathf.Min(deltaMs, 100) / 1000.0); }

        public Vector2 Logical(Pointer p) => new Vector2(p.x / Viewport.rs, p.y / Viewport.rs);

        internal void FireDown(Pointer p, List<GameObj> over) => InputDown?.Invoke(p, over);
        internal void FireMove(Pointer p) => InputMove?.Invoke(p);
        internal void FireUp(Pointer p) => InputUp?.Invoke(p);
        internal void FireWheel(Pointer p, float dx, float dy) => InputWheel?.Invoke(p, dx, dy);

        /// <summary>Display list in render order: stable sort by depth.</summary>
        internal List<GameObj> Sorted()
        {
            var l = new List<GameObj>(displayList);
            l.Sort((a, b) => a.depth != b.depth ? a.depth.CompareTo(b.depth) : a.seq.CompareTo(b.seq));
            return l;
        }

        public void Go(string key, object data = null) => mgr.Go(this, key, data);
    }

    public sealed class SceneManager
    {
        readonly Dictionary<string, Func<Scene>> factories = new Dictionary<string, Func<Scene>>();
        /// <summary>Render / update order (the wipe last).</summary>
        public readonly List<string> order = new List<string>();
        public readonly Dictionary<string, Scene> live = new Dictionary<string, Scene>();
        readonly List<(string key, object data, bool stop)> queue = new List<(string, object, bool)>();

        public void Register(string key, Func<Scene> f)
        {
            factories[key] = f;
            if (!order.Contains(key)) order.Add(key);
        }

        public Scene Get(string key) => live.TryGetValue(key, out var s) ? s : null;
        public bool IsActive(string key) => live.TryGetValue(key, out var s) && s.running;

        /// <summary>Queue a (re)start, applied at the start of the next frame.</summary>
        public void Start(string key, object data = null) => queue.Add((key, data, false));
        public void Stop(string key) => queue.Add((key, null, true));

        /// <summary>Scene change through the circle wipe when it runs.</summary>
        public void Go(Scene from, string key, object data)
        {
            var tr = Get("Transition") as Scenes.TransitionScene;
            if (tr == null || !tr.running) { Start(key, data); return; }
            tr.Wipe(() => Start(key, data));
        }

        public void ProcessQueue()
        {
            if (queue.Count == 0) return;
            var q = queue.ToArray();
            queue.Clear();
            foreach (var (key, data, stop) in q)
            {
                if (live.TryGetValue(key, out var old))
                {
                    old.DoShutdown();
                    live.Remove(key);
                }
                if (stop) continue;
                // A started scene stops the other play scenes: the game only ever shows one at a time, and the wipe
                // (Transition) is the only scene that runs alongside it.
                if (key != "Transition")
                    foreach (var k in new List<string>(live.Keys))
                        if (k != "Transition" && k != key) { live[k].DoShutdown(); live.Remove(k); }
                var s = factories[key]();
                s.key = key;
                s.mgr = this;
                live[key] = s;
                s.Boot(data);
            }
        }

        public IEnumerable<Scene> InOrder()
        {
            foreach (var k in order)
                if (live.TryGetValue(k, out var s) && s.running) yield return s;
        }
    }
}
