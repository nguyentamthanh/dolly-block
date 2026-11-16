// Circle-wipe scene change: a gradient sky cover with light dots and a pink
// cloud bank, a round hole with a soft edge and a white glow riding it. The sky and the hole are
// computed per pixel in a shader (Resources/Shaders/CozyWipe.shader): painting a full-screen canvas on the CPU every
// frame is far too slow. Lives above every other scene.
using System;
using CozyBlocks.Engine;

namespace CozyBlocks.Scenes
{
    public sealed class TransitionScene : Scene
    {
        WipeView view;
        ZoneObj blocker;
        bool busy;

        protected override void Build(object data)
        {
            view = Add(new WipeView { w = W, h = H });
            view.SetDepth(10);
            view.SetVisible(false);
            blocker = Add(new ZoneObj(0, 0, W, H));
            blocker.SetOrigin(0, 0);
            blocker.SetInteractive();
            blocker.inputEnabled = false;
        }

        protected override void OnResize()
        {
            view.w = W;
            view.h = H;
            blocker.SetSize(W, H);
        }

        /// <summary>Cover the screen, run onCovered (switch scenes), then open the hole again over the new scene.</summary>
        public void Wipe(Action onCovered)
        {
            if (busy) return;
            busy = true;
            view.w = W;
            view.h = H;
            view.progress = 0;
            view.SetVisible(true);
            blocker.inputEnabled = true;
            var t = tw.Create();
            t.TweenMethod(v => view.progress = v, 0, 1, 0.32).SetTrans(Trans.CUBIC).SetEase(EaseKind.IN);
            t.TweenCallback(() => onCovered());
            t.TweenInterval(0.08);
            t.TweenMethod(v => view.progress = v, 1, 0, 0.38).SetTrans(Trans.CUBIC).SetEase(EaseKind.OUT);
            t.TweenCallback(() =>
            {
                busy = false;
                view.SetVisible(false);
                blocker.inputEnabled = false;
            });
        }
    }
}
