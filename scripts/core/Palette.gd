class_name Palette
extends RefCounted

## Color vocabulary matching the live Dolly Blocks palette.
##
## Hyper-casual pass: pushed to ~0.55-0.70 saturation / ~0.85-0.95 value
## ("candy-glossy") while keeping each hue's angle roughly fixed, so the game
## still reads as itself, just punchier. SHADE is each FILL darkened ~20% for
## the piece "chin" shading band -- kept as literal hex (matching this file's
## existing convention) since a GDScript const array can't call .darkened() at
## parse time.

enum Hue { PINK, CORAL, ORANGE, YELLOW, GREEN, TEAL, BLUE, PURPLE, MINT = GREEN }

const COUNT := 8

const FILL := [
	Color("#ff8a80"), # PINK
	Color("#ff5252"), # CORAL
	Color("#ff9d42"), # ORANGE
	Color("#ffd93b"), # YELLOW
	Color("#5be089"), # GREEN
	Color("#26c6b0"), # TEAL
	Color("#4fa8ff"), # BLUE
	Color("#b388ff"), # PURPLE
]

const SHADE := [
	Color("#d96b62"),
	Color("#d93f3f"),
	Color("#d97f34"),
	Color("#d9ae2f"),
	Color("#48b06c"),
	Color("#1c9a8c"),
	Color("#3f86cc"),
	Color("#8f6fcc"),
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
