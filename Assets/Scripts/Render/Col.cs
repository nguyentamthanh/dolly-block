// Godot's Color as the game uses it: float channels 0..1.
using System;
using System.Globalization;

namespace CozyBlocks.Render
{
    public readonly struct Col : IEquatable<Col>
    {
        public readonly float r, g, b, a;
        public Col(float r, float g, float b, float a = 1f) { this.r = r; this.g = g; this.b = b; this.a = a; }

        public static Col Hex(string s)
        {
            string h = s.StartsWith("#") ? s.Substring(1) : s;
            float N(int i) => int.Parse(h.Substring(i, 2), NumberStyles.HexNumber) / 255f;
            return new Col(N(0), N(2), N(4), h.Length >= 8 ? N(6) : 1f);
        }

        public static readonly Col TRANSPARENT = new Col(0, 0, 0, 0);
        public static readonly Col WHITE = new Col(1, 1, 1, 1);
        public static readonly Col BLACK = new Col(0, 0, 0, 1);

        public Col WithAlpha(float na) => new Col(r, g, b, na);
        public Col Darkened(float k) => new Col(r * (1 - k), g * (1 - k), b * (1 - k), a);
        public Col Lightened(float k) => new Col(r + (1 - r) * k, g + (1 - g) * k, b + (1 - b) * k, a);
        public Col Lerp(Col to, float t) => new Col(r + (to.r - r) * t, g + (to.g - g) * t, b + (to.b - b) * t, a + (to.a - a) * t);
        public Col Fade(float k) => new Col(r, g, b, a * k);
        public bool Equals(Col o) => r == o.r && g == o.g && b == o.b && a == o.a;
        public override bool Equals(object obj) => obj is Col o && Equals(o);
        public override int GetHashCode() => (r, g, b, a).GetHashCode();

        static float C01(float x) => x < 0 ? 0 : x > 1 ? 1 : x;
        /// <summary>Quantised like the CSS string a canvas gets (rgb to bytes, alpha kept as float).</summary>
        public Col Css() => new Col((float)Math.Round(C01(r) * 255) / 255f, (float)Math.Round(C01(g) * 255) / 255f, (float)Math.Round(C01(b) * 255) / 255f, C01(a));
        public UnityEngine.Color ToUnity() => new UnityEngine.Color(r, g, b, a);
        public string Key() => $"{r:F4},{g:F4},{b:F4},{a:F4}";
    }

    public static class C
    {
        public static Col Hex(string s) => Col.Hex(s);
        public static Col Rgba(float r, float g, float b, float a = 1f) => new Col(r, g, b, a);
    }
}
