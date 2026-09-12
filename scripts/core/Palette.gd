class_name Palette
extends RefCounted

## Color vocabulary matching the live Dolly Blocks palette.

enum Hue { PINK, CORAL, ORANGE, YELLOW, GREEN, TEAL, BLUE, PURPLE, MINT = GREEN }

const COUNT := 8

const FILL := [
	Color("#f2a39a"), # PINK
	Color("#e87b7b"), # CORAL
	Color("#f09a62"), # ORANGE
	Color("#f0c24a"), # YELLOW
	Color("#8bcf88"), # GREEN
	Color("#6aa8a4"), # TEAL
	Color("#6ba3e0"), # BLUE
	Color("#9b8fd4"), # PURPLE
]

const SHADE := [
	Color("#d88880"),
	Color("#c86868"),
	Color("#d08050"),
	Color("#d0a438"),
	Color("#70b070"),
	Color("#588e8a"),
	Color("#588cc4"),
	Color("#8478b8"),
]

const NAMES := ["Pink", "Coral", "Orange", "Yellow", "Green", "Teal", "Blue", "Purple"]


static func fill(h: int) -> Color:
	return FILL[h]


static func shade(h: int) -> Color:
	return SHADE[h]


static func name_of(h: int) -> String:
	return NAMES[h]


static func all() -> Array[int]:
	var out: Array[int] = []
	for i in COUNT:
		out.append(i)
	return out
