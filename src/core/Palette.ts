// Colour vocabulary (ports scripts/core/Palette.gd). Soft pastel set for the cream gameplay look.

export const PALETTE_COUNT = 8;

export const FILL: readonly string[] = [
  '#f4a8bd', // PINK
  '#ff8f80', // CORAL
  '#ffb07c', // ORANGE
  '#ffcb78', // YELLOW
  '#b0d4a8', // GREEN
  '#7fabae', // TEAL
  '#94b8e3', // BLUE
  '#a2a8d8', // PURPLE
];

/** Each FILL darkened ~15%. */
export const SHADE: readonly string[] = [
  '#d98aa0',
  '#d9705f',
  '#d98f5c',
  '#d9ab55',
  '#8fb887',
  '#628f92',
  '#7499c4',
  '#8389ba',
];

export const NAMES: readonly string[] = ['Pink', 'Coral', 'Orange', 'Yellow', 'Green', 'Teal', 'Blue', 'Purple'];

export const Hue = { PINK: 0, CORAL: 1, ORANGE: 2, YELLOW: 3, GREEN: 4, TEAL: 5, BLUE: 6, PURPLE: 7, MINT: 4 } as const;

export const fill = (h: number): string => FILL[h];
export const shade = (h: number): string => SHADE[h];
export const nameOf = (h: number): string => NAMES[h];
export const allHues = (): number[] => Array.from({ length: PALETTE_COUNT }, (_, i) => i);
