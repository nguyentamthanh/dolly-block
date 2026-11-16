// A small CPU particle system with Godot CPUParticles2D semantics (port of src/fx/Particles.ts).
using System;
using System.Collections.Generic;
using UnityEngine;
using CozyBlocks.Engine;
using CozyBlocks.Render;

namespace CozyBlocks.Fx
{
    public enum ParticleTex { Circle, Soft, Sparkle, Heart, Ring, Confetti }

    public sealed class ParticleConfig
    {
        public float x, y;
        public ParticleTex tex;
        public int amount;
        public float lifetime;
        public float explosiveness = 1;
        public float direction = -90;
        public float spread;
        public float gravityX, gravityY;
        public float vMin, vMax, dampMin, dampMax, angleMin, angleMax, angVelMin, angVelMax;
        public float scaleMin = 1, scaleMax = 1;
        public float[,] scaleCurve;
        public Col? color;
        public Func<float, Col> colorRamp;
        public Col[] colorInitial;
        public string emissionKind; // "sphere" | "rect" | null
        public float emR, emEx, emEy;
        public float depth = 40;
    }

    public static class ParticleTextures
    {
        static readonly Dictionary<ParticleTex, Texture2D> tex = new Dictionary<ParticleTex, Texture2D>();

        static Texture2D Make(int w, int h, Func<float, float, float> fn)
        {
            var t = new Texture2D(w, h, TextureFormat.RGBA32, false, true) { filterMode = FilterMode.Bilinear, wrapMode = TextureWrapMode.Clamp };
            var px = new Color32[w * h];
            for (int y = 0; y < h; y++)
                for (int x = 0; x < w; x++)
                {
                    float pxv = (x + 0.5f) / w * 2 - 1, pyv = (y + 0.5f) / h * 2 - 1;
                    float a = Mathf.Clamp01(fn(pxv, pyv));
                    byte b = (byte)Js.RoundI(a * 255);
                    px[y * w + x] = new Color32(b, b, b, b); // premultiplied white
                }
            t.SetPixels32(px);
            t.Apply(false);
            return t;
        }

        static float C01(float v) => Mathf.Clamp01(v);

        public static Texture2D Get(ParticleTex k)
        {
            if (tex.Count == 0)
            {
                const int n = 32;
                tex[ParticleTex.Circle] = Make(n, n, (x, y) => C01((1 - Js.Hypot(x, y)) * 10));
                tex[ParticleTex.Soft] = Make(n, n, (x, y) => Mathf.Pow(C01(1 - Js.Hypot(x, y)), 2));
                tex[ParticleTex.Sparkle] = Make(n, n, (x, y) =>
                {
                    float d = Mathf.Sqrt(Mathf.Abs(x)) + Mathf.Sqrt(Mathf.Abs(y));
                    return Mathf.Max(C01((1 - d) * 6), C01(1 - Js.Hypot(x, y) * 2.2f));
                });
                tex[ParticleTex.Heart] = Make(n, n, (x, y) =>
                {
                    float hx = x * 1.25f, hy = -y * 1.25f + 0.25f;
                    float f = Mathf.Pow(hx * hx + hy * hy - 1, 3) - hx * hx * hy * hy * hy;
                    return f <= 0 ? 1 : 0;
                });
                tex[ParticleTex.Ring] = Make(n, n, (x, y) => C01(1 - Mathf.Abs(Js.Hypot(x, y) - 0.8f) * 9));
                tex[ParticleTex.Confetti] = Make(8, 14, (x, y) => 1);
            }
            return tex[k];
        }
    }

    public sealed class ParticleBurst
    {
        public static readonly float[,] SHRINK_CURVE = { { 0, 0.4f }, { 0.15f, 1 }, { 1, 0 } };

        public static float SampleCurve(float[,] c, float t)
        {
            int n = c.GetLength(0);
            if (t <= c[0, 0]) return c[0, 1];
            for (int i = 0; i < n - 1; i++)
            {
                float x0 = c[i, 0], y0 = c[i, 1], x1 = c[i + 1, 0], y1 = c[i + 1, 1];
                if (t <= x1)
                {
                    float u = (t - x0) / (x1 - x0);
                    return y0 + (y1 - y0) * (3 * u * u - 2 * u * u * u);
                }
            }
            return c[n - 1, 1];
        }

        sealed class P
        {
            public ImageObj img;
            public float born, age, vx, vy, damp, ang, angVel, scale;
            public bool alive;
            public Col tint;
        }

        readonly List<P> ps = new List<P>();
        readonly Scene scene;
        readonly ParticleConfig cfg;
        float t;
        bool done;
        static readonly System.Random rng = new System.Random();
        static float Rnd(float a, float b) => a + (float)rng.NextDouble() * (b - a);
        static float R01() => (float)rng.NextDouble();

        public ParticleBurst(Scene scene, ParticleConfig c)
        {
            this.scene = scene;
            cfg = c;
            float dir = c.direction * Mathf.PI / 180;
            float spread = c.spread * Mathf.PI / 180;
            var texture = ParticleTextures.Get(c.tex);
            for (int i = 0; i < c.amount; i++)
            {
                float a = dir + Rnd(-spread, spread);
                float v = Rnd(c.vMin, c.vMax);
                float ox = 0, oy = 0;
                if (c.emissionKind == "sphere")
                {
                    float ang = R01() * Mathf.PI * 2;
                    float rr = Mathf.Sqrt(R01()) * c.emR;
                    ox = Mathf.Cos(ang) * rr;
                    oy = Mathf.Sin(ang) * rr;
                }
                else if (c.emissionKind == "rect")
                {
                    ox = Rnd(-c.emEx, c.emEx);
                    oy = Rnd(-c.emEy, c.emEy);
                }
                var img = scene.Add(new ImageObj(c.x + ox, c.y + oy, texture) { canvasOrientation = true });
                img.SetDepth(c.depth);
                img.SetVisible(false);
                var tint = c.colorInitial != null ? c.colorInitial[(int)Mathf.Floor(R01() * c.colorInitial.Length) % c.colorInitial.Length] : (c.color ?? Col.WHITE);
                ps.Add(new P
                {
                    img = img,
                    born = (float)i / c.amount * c.lifetime * (1 - c.explosiveness),
                    vx = Mathf.Cos(a) * v,
                    vy = Mathf.Sin(a) * v,
                    damp = Rnd(c.dampMin, c.dampMax),
                    ang = Rnd(c.angleMin, c.angleMax) * Mathf.PI / 180,
                    angVel = Rnd(c.angVelMin, c.angVelMax) * Mathf.PI / 180,
                    scale = Rnd(c.scaleMin, c.scaleMax),
                    tint = tint,
                });
            }
            scene.OnUpdate += Update;
            scene.Shutdown += Destroy;
        }

        void Update(float time, float deltaMs)
        {
            if (done) return;
            float dt = deltaMs / 1000;
            t += dt;
            var c = cfg;
            bool liveOrPending = false;
            foreach (var p in ps)
            {
                if (p.age >= c.lifetime) continue;
                if (!p.alive)
                {
                    if (t < p.born) { liveOrPending = true; continue; }
                    p.alive = true;
                    p.img.SetVisible(true);
                }
                p.age += dt;
                if (p.age >= c.lifetime) { p.img.Destroy(); continue; }
                liveOrPending = true;
                p.vx += c.gravityX * dt;
                p.vy += c.gravityY * dt;
                if (p.damp > 0)
                {
                    float sp = Js.Hypot(p.vx, p.vy);
                    if (sp > 0)
                    {
                        float ns = Mathf.Max(0, sp - p.damp * dt);
                        p.vx *= ns / sp;
                        p.vy *= ns / sp;
                    }
                }
                p.img.x += p.vx * dt;
                p.img.y += p.vy * dt;
                p.ang += p.angVel * dt;
                float k = p.age / c.lifetime;
                float s = p.scale * (c.scaleCurve != null ? SampleCurve(c.scaleCurve, k) : 1);
                p.img.SetScale(s);
                p.img.SetRotation(p.ang);
                var ramp = c.colorRamp != null ? c.colorRamp(k) : Col.WHITE;
                // Phaser tints drop alpha and quantise to bytes.
                var tc = new Col(p.tint.r * ramp.r, p.tint.g * ramp.g, p.tint.b * ramp.b, 1).Css();
                p.img.SetTint(new Color(tc.r, tc.g, tc.b, 1));
                p.img.SetAlpha(p.tint.a * ramp.a);
            }
            if (!liveOrPending) Destroy();
        }

        public void Destroy()
        {
            if (done) return;
            done = true;
            scene.OnUpdate -= Update;
            foreach (var p in ps) if (!p.img.destroyed) p.img.Destroy();
            ps.Clear();
        }
    }
}
