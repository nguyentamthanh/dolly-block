class_name BlockData
extends Resource

## One block: a color, plus how it feels about some other color.
##
## Blocks are immutable value objects. The solver treats two blocks with the same
## (color, mood, target) as fully interchangeable, which is what makes the
## deduplication in Solver correct.

enum Mood {
	NEUTRAL,       ## Content anywhere. No constraint.
	AFFECTIONATE,  ## Needs at least one orthogonal neighbour of `target_color`.
	HOSTILE,       ## Must have NO orthogonal neighbour of `target_color`.
}

@export var color: Palette.Hue = Palette.Hue.PINK
@export var mood: Mood = Mood.NEUTRAL
## Only meaningful when mood != NEUTRAL.
@export var target_color: Palette.Hue = Palette.Hue.PINK


static func make(c: int, m: Mood = Mood.NEUTRAL, t: int = 0) -> BlockData:
	var b := BlockData.new()
	b.color = c
	b.mood = m
	b.target_color = t
	return b


## Stable identity used to group interchangeable blocks. Packs three small
## enums into one int so it can key a Dictionary cheaply.
func key() -> int:
	return (color << 8) | (int(mood) << 4) | target_color


func same_as(other: BlockData) -> bool:
	return other != null and key() == other.key()


func duplicate_block() -> BlockData:
	return BlockData.make(color, mood, target_color)


func describe() -> String:
	match mood:
		Mood.AFFECTIONATE:
			return "%s loves %s" % [Palette.name_of(color), Palette.name_of(target_color)]
		Mood.HOSTILE:
			return "%s avoids %s" % [Palette.name_of(color), Palette.name_of(target_color)]
		_:
			return "%s (calm)" % Palette.name_of(color)


func _to_string() -> String:
	return "<%s>" % describe()
