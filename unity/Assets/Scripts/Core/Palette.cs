// Colour vocabulary. Port of src/core/Palette.ts.
namespace CozyBlocks.Core
{
    public static class Palette
    {
        public const int COUNT = 8;
        public static readonly string[] FILL = { "#f4a8bd", "#ff8f80", "#ffb07c", "#ffcb78", "#b0d4a8", "#7fabae", "#94b8e3", "#a2a8d8" };
        public static readonly string[] SHADE = { "#d98aa0", "#d9705f", "#d98f5c", "#d9ab55", "#8fb887", "#628f92", "#7499c4", "#8389ba" };
        public static readonly string[] NAMES = { "Pink", "Coral", "Orange", "Yellow", "Green", "Teal", "Blue", "Purple" };
        public const int PINK = 0, CORAL = 1, ORANGE = 2, YELLOW = 3, GREEN = 4, TEAL = 5, BLUE = 6, PURPLE = 7, MINT = 4;
        public static string Fill(int h) => FILL[h];
        public static string Shade(int h) => SHADE[h];
        public static string NameOf(int h) => NAMES[h];
        public static int[] AllHues() { var a = new int[COUNT]; for (int i = 0; i < COUNT; i++) a[i] = i; return a; }
    }
}
