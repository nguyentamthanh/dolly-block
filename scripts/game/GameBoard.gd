class_name GameBoard
extends Control

## Draws the grid and owns the mapping between screen points and grid cells.
##
## It holds a reference to the BoardState but never mutates it -- placement
## decisions belong to LevelController. This class answers geometry questions
## only: "where is cell (2,3)?" and "which cell is under this finger?".

const INVALID := Vector2i(-1, -1)

var state: BoardState

var cell_size: float = 64.0
var origin := Vector2.ZERO      ## top-left of the grid, in local coordinates

## Live placement feedback, set by DragController while a block is in the air.
var highlight_cell: Vector2i = INVALID
var highlight_cells: Array[Vector2i] = []
var highlight_ok: bool = false


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	resized.connect(relayout)


func set_state(s: BoardState) -> void:
	state = s
	relayout()


## Fit the grid to whatever rectangle we were given, keeping cells square and
## the board centred. Called on every resize, so rotation and split-screen work
## without special cases.
func relayout() -> void:
	if state == null or state.width == 0 or state.height == 0:
		return
	var pad := 8.0
	var avail := size - Vector2(pad, pad) * 2.0
	cell_size = floorf(minf(avail.x / state.width, avail.y / state.height))
	cell_size = maxf(cell_size, 8.0)
	var grid := Vector2(state.width, state.height) * cell_size
	origin = ((size - grid) * 0.5).floor()
	queue_redraw()


func cell_rect_local(pos: Vector2i) -> Rect2:
	var inset := cell_size * 0.09
	return Rect2(
		origin + Vector2(pos.x, pos.y) * cell_size + Vector2(inset, inset),
		Vector2(cell_size - inset * 2.0, cell_size - inset * 2.0))


func cell_rect_global(pos: Vector2i) -> Rect2:
	var r := cell_rect_local(pos)
	return Rect2(global_position + r.position, r.size)


## Which cell contains this global point? INVALID when the point is off the
## board or over a hole.
func cell_at_global(point: Vector2) -> Vector2i:
	if state == null or cell_size <= 0.0:
		return INVALID
	var local := point - global_position - origin
	var c := Vector2i(floori(local.x / cell_size), floori(local.y / cell_size))
	if not state.is_playable(c):
		return INVALID
	return c


## Snap a global top-left position to the nearest grid cell. Unlike
## cell_at_global this never rejects: a dragged piece scaled to the grid lines
## up with whichever cell it is closest to, so the caller gets an origin to
## test even when the piece hangs off the edge.
func cell_round_at_global(top_left_global: Vector2) -> Vector2i:
	if state == null or cell_size <= 0.0:
		return INVALID
	var local := top_left_global - global_position - origin
	return Vector2i(roundi(local.x / cell_size), roundi(local.y / cell_size))


func set_highlight(c: Vector2i, ok: bool) -> void:
	set_highlight_cells([c] if c != INVALID else [], ok)


func set_highlight_cells(cells: Array[Vector2i], ok: bool) -> void:
	# Single-cell compatibility: keep highlight_cell for first cell
	var first := cells[0] if not cells.is_empty() else INVALID
	var changed := false
	if highlight_cells.size() != cells.size():
		changed = true
	else:
		for i in cells.size():
			if highlight_cells[i] != cells[i]:
				changed = true
				break
	if highlight_cell != first or highlight_ok != ok or changed:
		highlight_cell = first
		highlight_cells = cells.duplicate()
		highlight_ok = ok
		queue_redraw()


func clear_highlight() -> void:
	set_highlight_cells([], false)


func _draw() -> void:
	if state == null:
		return

	# Frame + one clean empty surface. No per-cell boxes, dots or borders --
	# empty cells stay empty. Any holes read as gaps in the frame, which is what
	# makes a non-rectangular board look deliberate.
	Art.draw_board(self, state.playable_cells(), origin, cell_size)

	# Live placement feedback: tint only the cells the airborne piece covers.
	var hl: Array = highlight_cells
	if hl.is_empty() and highlight_cell != INVALID:
		hl = [highlight_cell]
	for pos in hl:
		if state.is_playable(pos):
			var tint := Art.OK_TINT if highlight_ok else Art.BAD_TINT
			Art.draw_cell_highlight(self, cell_rect_local(pos), tint)
