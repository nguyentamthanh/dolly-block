// Pointer input: the topmost interactive node under the pointer gets pointerdown/up/over/out,
// a scene whose interactive node was hit captures the event from the scenes below it, scene-level handlers get
// every event of their scene. Mouse and touch (first finger) both drive pointer 0.
using System;
using System.Collections.Generic;
using UnityEngine;

namespace CozyBlocks.Engine
{
    public sealed class InputRouter
    {
        readonly Pointer pointer = new Pointer();
        GameObj over, upTarget;
        readonly List<GameObj> downTargets = new List<GameObj>();
        bool wasDown;
        Vector2 lastPos = new Vector2(float.NaN, float.NaN);

        /// <summary>Topmost interactive node under the pointer in one scene.</summary>
        static GameObj TopHit(Scene s, Vector2 logical, List<GameObj> all)
        {
            GameObj best = null;
            foreach (var o in s.displayList) Collect(o, logical, all);
            foreach (var o in all) if (best == null || o.renderIndex > best.renderIndex) best = o;
            return best;
        }

        static void Collect(GameObj o, Vector2 p, List<GameObj> outl)
        {
            if (o.destroyed) return;
            if (o.interactive && o.inputEnabled && o.WillRenderChain())
            {
                var inv = o.worldMatrix.inverse;
                var l = inv.MultiplyPoint3x4(new Vector3(p.x, p.y, 0));
                if (o.HitTest(new Vector2(l.x, l.y))) outl.Add(o);
            }
            foreach (var c in o.children) Collect(c, p, outl);
        }

        /// <summary>Dev automation: when set, replaces the real pointer (down, screen position with a bottom-left origin).</summary>
        public static Func<(bool down, Vector2 screen)?> injected;

        public void Process(SceneManager sm, float timeMs)
        {
            bool down;
            // A press that started and ended between two frames (a quick tap, or a hitch on a slow phone): Unity only
            // reports the release, so play the press first or the tap is lost.
            bool tapWithinFrame = false;
            Vector2 screen;
            var inj = injected?.Invoke();
            if (inj.HasValue)
            {
                down = inj.Value.down;
                screen = inj.Value.screen;
                pointer.wasTouch = false;
            }
            else if (Input.touchCount > 0)
            {
                var t = Input.GetTouch(0);
                down = t.phase != TouchPhase.Ended && t.phase != TouchPhase.Canceled;
                tapWithinFrame = t.phase == TouchPhase.Ended && !wasDown;
                screen = t.position;
                pointer.wasTouch = true;
            }
            else
            {
                down = Input.GetMouseButton(0);
                tapWithinFrame = !down && !wasDown && Input.GetMouseButtonDown(0) && Input.GetMouseButtonUp(0);
                screen = Input.mousePosition;
                if (Input.GetMouseButtonDown(0)) pointer.wasTouch = false;
            }
            if (tapWithinFrame)
            {
                ProcessState(sm, timeMs, true, screen);
                ProcessState(sm, timeMs, false, screen);
                return;
            }
            ProcessState(sm, timeMs, down, screen);
        }

        void ProcessState(SceneManager sm, float timeMs, bool down, Vector2 screen)
        {
            pointer.x = screen.x;
            pointer.y = Screen.height - screen.y;
            var logical = pointer.Logical;
            bool moved = logical != lastPos;
            lastPos = logical;
            float wheel = Input.mouseScrollDelta.y;

            if (down && !wasDown)
            {
                pointer.isDown = true;
                pointer.downX = pointer.x;
                pointer.downY = pointer.y;
                pointer.downTime = timeMs;
                Dispatch(sm, logical, Kind.Down);
            }
            else if (moved)
            {
                Dispatch(sm, logical, Kind.Move);
            }
            if (!down && wasDown)
            {
                pointer.isDown = false;
                Dispatch(sm, logical, Kind.Up);
            }
            if (wheel != 0) Dispatch(sm, logical, Kind.Wheel, -wheel * 100f);
            wasDown = down;
        }

        enum Kind { Down, Move, Up, Wheel }

        void Dispatch(SceneManager sm, Vector2 logical, Kind kind, float wheelDy = 0)
        {
            var scenes = new List<Scene>(sm.InOrder());
            GameObj newOver = null;
            for (int i = scenes.Count - 1; i >= 0; i--)
            {
                var s = scenes[i];
                if (!s.inputEnabled || !s.running) continue;
                var hits = new List<GameObj>();
                var top = TopHit(s, logical, hits);
                var overList = top != null ? new List<GameObj> { top } : new List<GameObj>();
                if (top != null) newOver = top;
                switch (kind)
                {
                    case Kind.Down:
                        if (top != null) { downTargets.Add(top); top.EmitDown(pointer); }
                        if (s.running) s.FireDown(pointer, overList);
                        break;
                    case Kind.Move:
                        s.FireMove(pointer);
                        break;
                    case Kind.Up:
                        if (top != null) { upTarget = top; top.EmitUp(pointer); }
                        if (s.running) s.FireUp(pointer);
                        break;
                    case Kind.Wheel:
                        s.FireWheel(pointer, 0, wheelDy);
                        break;
                }
                if (top != null) break; // the scene captured the pointer
            }
            if (kind == Kind.Up)
            {
                foreach (var d in downTargets.ToArray()) if (d != upTarget && !d.destroyed) d.EmitUpOutside(pointer);
                downTargets.Clear();
                upTarget = null;
            }
            if (newOver != over)
            {
                var old = over;
                over = newOver;
                if (old != null && !old.destroyed) old.EmitOut(pointer);
                if (newOver != null) newOver.EmitOver(pointer);
            }
        }
    }
}
