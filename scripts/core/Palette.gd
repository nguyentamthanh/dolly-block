class_name Palette
extends RefCounted

## Color vocabulary matching the live Dolly Blocks palette.
##
## Soft pastel pass (flat pieces on a cream backdrop). SHADE is each FILL
## darkened ~15%, kept as literal hex since a GDScript const array can't call
## .darkened() at parse time.

enum Hue { PINK, CORAL, ORANGE, YELLOW, GREEN, TEAL, BLUE, PURPLE, MINT = GREEN }

const COUNT := 8

## Soft pastel set for the cream gameplay look. PINK / CORAL / ORANGE stay far
## enough apart in hue to tell apart in a thought-bubble heart.
const FILL := [
	Color("#f4a8bd"), # PINK
	Color("#ff8f80"), # CORAL
	Color("#ffb07c"), # ORANGE
	Color("#ffcb78"), # YELLOW
	Color("#b0d4a8"), # GREEN
	Color("#7fabae"), # TEAL
	Color("#94b8e3"), # BLUE
	Color("#a2a8d8"), # PURPLE
]

const SHADE := [
	Color("#d98aa0"),
	Color("#d9705f"),
	Color("#d98f5c"),
	Color("#d9ab55"),
	Color("#8fb887"),
	Color("#628f92"),
	Color("#7499c4"),
	Color("#8389ba"),
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
