class_name Tray
extends Control

## The shelf of blocks still waiting for a home.
##
## Like GameBoard, this is geometry only: it hands out slot rectangles and does
## not decide what goes where. Slots are addressed by index, and LevelController
## keeps a parallel array of the views occupying them.

var slot_count: int = 0
var slot_size: float = 64.0
var _cols: int = 1
var _rows: int = 1
var _origin := Vector2.ZERO
var _gap: float = 8.0


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	resized.connect(relayout)


func set_slot_count(n: int) -> void:
	slot_count = n
	relayout()


## Lay the slots out at the largest size the shelf allows.
##
## Fewest-rows is the wrong objective. Ten blocks in one row across a phone are
## limited by WIDTH (about 63 px each) while the shelf is 174 px tall, so most
## of the shelf goes to waste and the badges shrink past reading. Two rows of
## five are limited by height instead and come out around 83 px. So try every
## row count and keep whichever makes the blocks largest.
##
## Readability matters here beyond looking nice: an unreadable badge makes a
## level unsolvable, because "loves pink" is meaningless if you cannot see the
## swatch.
const MIN_READABLE := 44.0

func relayout() -> void:
	if slot_count <= 0:
		queue_redraw()
		return

	# Godot runs a layout pass before Control sizes are known, so this is called
	# once with a near-zero rect. Bail out rather than computing nonsense --
	# otherwise the readability warning below fires on every launch for a shelf
	# that is about to be resized anyway, and a warning that cries wolf is worse
	# than no warning.
	if size.x < 1.0 or size.y < 1.0:
		return

	var best_rows := 1
	var best_size := 0.0
	for rows in range(1, slot_count + 1):
		var cols := int(ceil(float(slot_count) / float(rows)))
		var w := (size.x - _gap * (cols + 1)) / float(cols)
		var h := (size.y - _gap * (rows + 1)) / float(rows)
		var sz := minf(w, h)
		if sz > best_size:
			best_size = sz
			best_rows = rows

	_rows = best_rows
	_cols = int(ceil(float(slot_count) / float(_rows)))
	slot_size = maxf(floorf(best_size), 16.0)
	if slot_size < MIN_READABLE:
		push_warning("Tray: blocks are %.0f px, below the %.0f px readable floor"
			% [slot_size, MIN_READABLE])

	var used := Vector2(
		_cols * slot_size + _gap * (_cols - 1),
		_rows * slot_size + _gap * (_rows - 1))
	_origin = ((size - used) * 0.5).floor()
	queue_redraw()


func slot_rect_local(i: int) -> Rect2:
	var col := i % _cols
	var row := i / _cols
	return Rect2(
		_origin + Vector2(col * (slot_size + _gap), row * (slot_size + _gap)),
		Vector2(slot_size, slot_size))


func slot_rect_global(i: int) -> Rect2:
	var r := slot_rect_local(i)
	return Rect2(global_position + r.position, r.size)


## True when a global point is over the tray area at all -- used to decide that
## a dropped block should go home rather than onto the board.
func contains_global(point: Vector2) -> bool:
	return Rect2(global_position, size).has_point(point)


func _draw() -> void:
	# Just the shelf. Empty slots are left empty -- no little boxes to make the
	# waiting pieces look like they are already on a grid.
	var shelf := Rect2(Vector2.ZERO, size)
	draw_style_box(Art.box(Color(1, 1, 1, 0.45), 18.0), shelf)
