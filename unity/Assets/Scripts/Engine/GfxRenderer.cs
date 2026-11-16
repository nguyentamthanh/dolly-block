// Draws every running scene's display tree after the camera renders (immediate GL, in logical units scaled to
// pixels), in Phaser's order: scenes in list order, each scene's top level sorted by depth, containers in child order.
using System.Collections.Generic;
using UnityEngine;
using CozyBlocks.Render;

namespace CozyBlocks.Engine
{
    public sealed class GfxRenderer
    {
        Material mat;
        Mesh quadCanvas, quadImage;
        Texture2D white;
        int counter;
        Matrix4x4 pixel;
        static readonly int MainTex = Shader.PropertyToID("_MainTex");
        static readonly int ColorId = Shader.PropertyToID("_Color");

        public GfxRenderer()
        {
            var sh = Resources.Load<Shader>("Shaders/CozyPremul");
            mat = new Material(sh);
            white = new Texture2D(2, 2, TextureFormat.RGBA32, false, true);
            white.SetPixels32(new[] { new Color32(255, 255, 255, 255), new Color32(255, 255, 255, 255), new Color32(255, 255, 255, 255), new Color32(255, 255, 255, 255) });
            white.Apply();
            quadCanvas = MakeQuad(false);
            quadImage = MakeQuad(true);
        }

        static Mesh MakeQuad(bool imageUv)
        {
            var m = new Mesh();
            m.vertices = new[] { new Vector3(0, 0, 0), new Vector3(1, 0, 0), new Vector3(1, 1, 0), new Vector3(0, 1, 0) };
            float top = imageUv ? 1 : 0, bot = imageUv ? 0 : 1;
            m.uv = new[] { new Vector2(0, top), new Vector2(1, top), new Vector2(1, bot), new Vector2(0, bot) };
            m.triangles = new[] { 0, 1, 2, 0, 2, 3 };
            m.UploadMeshData(true);
            return m;
        }

        /// <summary>Render all scenes; also stamps every node's render index and world matrix for hit testing.</summary>
        public void RenderAll(SceneManager sm)
        {
            counter = 0;
            GL.PushMatrix();
            GL.LoadPixelMatrix(0, Screen.width, Screen.height, 0);
            pixel = Matrix4x4.Scale(new Vector3(Viewport.rs, Viewport.rs, 1));
            foreach (var s in sm.InOrder())
            {
                if (s.backgroundColor.HasValue) DrawSolid(Matrix4x4.identity, 0, 0, Screen.width, Screen.height, s.backgroundColor.Value, 1);
                var cam = pixel * Matrix4x4.Translate(new Vector3(-s.camScrollX, -s.camScrollY, 0));
                foreach (var o in s.Sorted()) Walk(o, cam, 1f);
            }
            GL.PopMatrix();
        }

        /// <summary>Stamp render order and world matrices without drawing (used before input when nothing rendered yet).</summary>
        public void StampAll(SceneManager sm)
        {
            counter = 0;
            var root = Matrix4x4.identity;
            foreach (var s in sm.InOrder())
            {
                var cam = Matrix4x4.Translate(new Vector3(-s.camScrollX, -s.camScrollY, 0));
                foreach (var o in s.Sorted()) Stamp(o, cam);
            }
        }

        void Stamp(GameObj o, Matrix4x4 parentM)
        {
            if (o.destroyed) return;
            var m = parentM * o.LocalMatrix();
            o.worldMatrix = m;
            o.renderIndex = counter++;
            if (!o.visible) return;
            foreach (var c in o.children.ToArray()) Stamp(c, m);
        }

        void Walk(GameObj o, Matrix4x4 parentM, float parentA)
        {
            if (o.destroyed) return;
            var local = o.LocalMatrix();
            var m = parentM * local;
            o.worldMatrix = pixelInv * m;
            o.renderIndex = counter++;
            if (!o.visible) return;
            float a = parentA * o.alpha;
            if (a > 0) o.Draw(this, m, a);
            if (o.children.Count == 0) return;
            foreach (var c in o.children.ToArray()) Walk(c, m, a);
        }

        Matrix4x4 pixelInv => Matrix4x4.Scale(new Vector3(1 / Viewport.rs, 1 / Viewport.rs, 1));

        public void DrawSolid(Matrix4x4 world, float x, float y, float w, float h, Color c, float a)
        {
            float al = c.a * a;
            if (al <= 0) return;
            mat.SetTexture(MainTex, white);
            mat.SetColor(ColorId, new Color(c.r * al, c.g * al, c.b * al, al));
            mat.SetPass(0);
            Graphics.DrawMeshNow(quadImage, world * Matrix4x4.TRS(new Vector3(x, y, 0), Quaternion.identity, new Vector3(w, h, 1)));
        }

        /// <summary>A quad with its own material (top-left uv origin), for shader-drawn nodes.</summary>
        public void DrawMaterial(Matrix4x4 world, Material m, float x, float y, float w, float h)
        {
            m.SetPass(0);
            Graphics.DrawMeshNow(quadCanvas, world * Matrix4x4.TRS(new Vector3(x, y, 0), Quaternion.identity, new Vector3(w, h, 1)));
        }

        public void DrawTexture(Matrix4x4 world, Texture tex, float x, float y, float w, float h, Color tint, float a, bool canvasRows, bool premultiplied = false)
        {
            if (a <= 0) return;
            mat.SetTexture(MainTex, tex);
            mat.SetColor(ColorId, new Color(tint.r * a, tint.g * a, tint.b * a, a));
            mat.SetPass(0);
            Graphics.DrawMeshNow(canvasRows ? quadCanvas : quadImage, world * Matrix4x4.TRS(new Vector3(x, y, 0), Quaternion.identity, new Vector3(w, h, 1)));
        }
    }
}
