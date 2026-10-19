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
## Ghost preview: the airborne piece's silhouette drawn on the cells it would
## land on. `_ghost_can` = legal drop; highlight_ok = legal AND keeps everyone
## happy.
var _ghost_color := Color.TRANSPARENT
var _ghost_can := false
## 0..1 red flash over the last refused cells, decays in _process.
var _flash := 0.0
var _flash_cells: Array[Vector2i] = []

## Cached result of state.playable_cells() so _draw doesn't rebuild the
## Vector2i array every redraw. BoardState's playable set is immutable after
## construction (blocked_cells never change), so the cache only needs to be
## rebuilt when the state object itself is replaced.
var _playable_cache: Array[Vector2i] = []


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	resized.connect(relayout)


func set_state(s: BoardState) -> void:
	state = s
	_playable_cache = state.playable_cells() if state != null else ([] as Array[Vector2i])
	relayout()


## Fit the grid to whatever rectangle we were given, keeping cells square and
## the board centred. Called on every resize, so rotation and split-screen work
## without special cases.
func relayout() -> void:
	if state == null or state.width == 0 or state.height == 0:
		return
	# Padding scales with the board rather than being a flat 8 px: on a phone
	# the 8 px is ~3% of width and feels right, on a tablet or unfolded
	# foldable the same 8 px is < 1% and the board bleeds into the tray
	# backdrop. Capping it at a fraction of the short side + a small floor
	# keeps the breathing room proportional across aspect ratios.
	# Room for the board's chunky frame (Art.BOARD_REVEAL) plus its bevel and
	# drop shadow, which draw outside the cell grid.
	var short_side := minf(size.x, size.y)
	var pad := clampf(short_side * 0.045, 18.0, 34.0)
	# The frame overhang scales with the cells (Art.draw_board), so a flat pad
	# isn't enough on big boards: on a 16:9 desktop the reveal + shadow reached
	# past the bottom edge. Solve for the cell size with the overhang included.
	var avail := size - Vector2(pad, pad) * 2.0 - Vector2(0.0, Art.BOARD_SHADOW_REACH)
	var grid_cells := Vector2(state.width, state.height)
	var fit_frac := avail / (grid_cells + Vector2.ONE * Art.BOARD_REVEAL_FRAC * 2.0)
	var fit_min := (avail - Vector2.ONE * Art.BOARD_REVEAL * 2.0) / grid_cells
	cell_size = floorf(minf(minf(fit_frac.x, fit_min.x), minf(fit_frac.y, fit_min.y)))
	cell_size = maxf(cell_size, 8.0)
	var grid := grid_cells * cell_size
	# Centre frame + shadow as one block, so the shadow doesn't push it low.
	origin = ((size - grid - Vector2(0.0, Art.BOARD_SHADOW_REACH)) * 0.5).floor()
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
	_ghost_can = false
	set_highlight_cells([], false)


## Full drop preview for an airborne piece: `can` = the drop is legal, `happy`
## = legal and upsets nobody, `color` = the piece's fill for the ghost.
func set_preview(cells: Array[Vector2i], can: bool, happy: bool, color: Color) -> void:
	if _ghost_can != can or _ghost_color != color:
		_ghost_can = can
		_ghost_color = color
		queue_redraw()
	set_highlight_cells(cells, happy)


## Red flash over cells a piece was just refused from.
func flash_bad(cells: Array[Vector2i]) -> void:
	_flash_cells = cells.duplicate()
	_flash = 1.0
	queue_redraw()


func _process(delta: float) -> void:
	if _flash > 0.0:
		_flash = maxf(0.0, _flash - delta * 3.0)
		queue_redraw()


func _draw() -> void:
	if state == null:
		return

	Art.draw_board(self, _playable_cache, origin, cell_size)

	var hl: Array = highlight_cells
	if hl.is_empty() and highlight_cell != INVALID:
		hl = [highlight_cell]
	if not hl.is_empty() and _ghost_can and _ghost_color.a > 0.0:
		# Legal drop: show where the piece will sit as a ghost -- a pale fill with
		# a slightly deeper rim of the piece's own colour, both OPAQUE (stacked
		# translucent cell rects would show seams). Tinted red if it would upset
		# a neighbour.
		var ghost := _ghost_color.lerp(Color.WHITE, 0.45)
		var rim := _ghost_color.darkened(0.06)
		if not highlight_ok:
			ghost = ghost.lerp(Art.BAD_TINT, 0.55)
			rim = rim.lerp(Art.BAD_TINT, 0.55)
		Art.draw_ghost(self, origin, cell_size, hl, ghost, rim)
	else:
		# Illegal drop: tint only the playable cells the piece covers.
		for pos in hl:
			if state.is_playable(pos):
				var tint := Art.OK_TINT if highlight_ok else Art.BAD_TINT
				Art.draw_cell_highlight(self, cell_rect_local(pos), tint)

	if _flash > 0.0:
		var c := Art.BAD_TINT
		c.a = 0.7 * _flash
		for pos in _flash_cells:
			if state.is_playable(pos):
				draw_style_box(Art.box(c, cell_size * 0.22), cell_rect_local(pos))
