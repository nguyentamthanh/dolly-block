// Godot's RandomNumberGenerator (PCG32) and String.hash (djb2), reproduced exactly so a level index yields the
// same puzzle as the Phaser (and Godot) build. Port of src/core/Rng.ts.
namespace CozyBlocks.Core
{
    public sealed class Pcg32
    {
        const ulong MULT = 6364136223846793005UL;
        const ulong DEFAULT_INC = 1442695040888963407UL;
        ulong state;
        readonly ulong inc;

        public Pcg32(ulong seed = 0)
        {
            unchecked { inc = (DEFAULT_INC << 1) | 1UL; }
            Seed(seed);
        }

        /// <summary>RandomNumberGenerator.seed = x</summary>
        public void Seed(ulong seed)
        {
            unchecked
            {
                state = 0;
                NextU32();
                state += seed;
                NextU32();
            }
        }

        public uint NextU32()
        {
            unchecked
            {
                ulong old = state;
                state = old * MULT + inc;
                uint xorshifted = (uint)(((old >> 18) ^ old) >> 27);
                int rot = (int)(old >> 59);
                return (xorshifted >> rot) | (xorshifted << ((-rot) & 31));
            }
        }

        uint Bounded(uint bound)
        {
            uint threshold = (uint)((4294967296UL - bound) % bound);
            for (;;)
            {
                uint r = NextU32();
                if (r >= threshold) return r % bound;
            }
        }

        /// <summary>randi_range(from, to), inclusive</summary>
        public int RandiRange(int from, int to)
        {
            if (from == to) return from;
            int lo = System.Math.Min(from, to);
            int hi = System.Math.Max(from, to);
            return (int)Bounded((uint)(hi - lo + 1)) + lo;
        }

        /// <summary>randf(): float32 in [0, 1]</summary>
        public float Randf()
        {
            uint protoExp = NextU32();
            if (protoExp == 0) return 0f;
            uint m = NextU32() | 0x80000001u;
            double scale = System.Math.Pow(2, -32 - Clz32(protoExp));
            return (float)((double)(float)m * scale);
        }

        public static int Clz32(uint x)
        {
            if (x == 0) return 32;
            int n = 0;
            while ((x & 0x80000000u) == 0) { n++; x <<= 1; }
            return n;
        }
    }

    public static class GodotHash
    {
        /// <summary>GDScript hash(String): unsigned 32-bit djb2 over code points.</summary>
        public static uint StringHash(string s)
        {
            uint h = 5381;
            unchecked
            {
                for (int i = 0; i < s.Length; i++)
                {
                    int cp;
                    if (char.IsHighSurrogate(s[i]) && i + 1 < s.Length && char.IsLowSurrogate(s[i + 1]))
                    {
                        cp = char.ConvertToUtf32(s[i], s[i + 1]);
                        i++;
                    }
                    else cp = s[i];
                    h = h * 33 + (uint)cp;
                }
            }
            return h;
        }
    }
}
