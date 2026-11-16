// Number helpers with JavaScript-style rounding and integer wrap-around: the generator, the art and the
// tweens were tuned with these semantics, and Tests/Parity/golden.json pins the results.
using System;

namespace CozyBlocks.Render
{
    public static class Js
    {
        /// <summary>Math.round: half toward +infinity.</summary>
        public static float Round(float x) => (float)Math.Floor(x + 0.5);
        public static int RoundI(float x) => (int)Math.Floor(x + 0.5);
        public static float Trunc(float x) => (float)Math.Truncate(x);
        public static float Clamp(float x, float lo, float hi) => x < lo ? lo : x > hi ? hi : x;
        public static float Hypot(float a, float b) => (float)Math.Sqrt(a * a + b * b);
        public static float Sign(float x) => x > 0 ? 1 : x < 0 ? -1 : 0;
    }
}
