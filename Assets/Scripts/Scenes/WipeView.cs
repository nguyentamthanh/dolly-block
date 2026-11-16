// The wipe cover drawn by the Cozy/Wipe shader (see Resources/Shaders/CozyWipe.shader): a full-screen quad.
using UnityEngine;
using CozyBlocks.Engine;

namespace CozyBlocks.Scenes
{
    public sealed class WipeView : GameObj
    {
        static Material mat;
        public float progress;
        public float w, h;
        static readonly int ProgressId = Shader.PropertyToID("_Progress");
        static readonly int SizeId = Shader.PropertyToID("_Size");
        static readonly int AlphaId = Shader.PropertyToID("_Alpha");

        public override void Draw(GfxRenderer r, Matrix4x4 world, float a)
        {
            if (progress <= 0) return;
            if (mat == null) mat = new Material(Resources.Load<Shader>("Shaders/CozyWipe"));
            mat.SetFloat(ProgressId, progress);
            mat.SetVector(SizeId, new Vector4(w, h, 0, 0));
            mat.SetFloat(AlphaId, a);
            r.DrawMaterial(world, mat, 0, 0, w, h);
        }
    }
}
