class_name PieceView
extends Control

## One polyomino on screen. Owns no rules.
##
## Motion is split across two tweens so effects never cancel travel:
##   _move_tween -- position / cell-size travel (travel_to)
##   _fx_tween   -- scale / rotation juice (lift, squash, wobble, celebrate)
## Idle life (blink, jelly breathing, unhappy-ring throb) is purely visual and
## applied inside _draw, so it never moves the hit-test geometry.

enum Slot { TRAY, BOARD }

const INVALID := Vector2i(-1, -1)

var data: PieceData
var slot: Slot = Slot.TRAY
var origin: Vector2i = Vector2i(-1, -1)
var tray_index: int = -1
var movable: bool = true
var grab_local: Vector2i = Vector2i.ZERO
var cell_size: float = 48.0
## Set by the LevelController after spawn so _draw() can ask the live board
## which neighbours this piece's cells touch, and pass them to Art.draw_polyomino
## so its sticker outline runs continuously across piece boundaries.
var board_state: BoardState = null

var _dragging := false
var _unhappy := false
var _celebrating := false
var _move_tween: Tween
var _fx_tween: Tween
var _home_pos := Vector2.ZERO
var _home_size := 48.0

# Idle life.
var _time := 0.0
var _phase := 0.0
var _blink := 0.0
var _next_blink := 0.0
var _blink_tween: Tween
## Horizontal drag velocity fed by DragController; drives the carry tilt.
var _drag_dx := 0.0


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	resized.connect(_on_resized)
	_phase = randf() * TAU
	_next_blink = randf_range(1.0, 4.5)


func _on_resized() -> void:
	pivot_offset = size * 0.5


func setup(d: PieceData, is_movable: bool) -> void:
	data = d
	movable = is_movable
	z_index = _rest_z()
	_sync_size()
	queue_redraw()


## Pieces with a thought bubble rest one layer up: the bubble pokes out above
## the piece's own cells, and must not be painted over by a neighbour that
## happens to be drawn later.
## On the board, bubble pieces lower down rest higher still, since bubbles
## point UP into the row above.
func _rest_z() -> int:
	if data != null and int(data.mood) != int(PieceData.Mood.NEUTRAL):
		if slot == Slot.BOARD and origin != INVALID:
			return 2 + clampi(origin.y, 0, 16)
		return 1
	return 0


func _sync_size() -> void:
	if data == null:
		return
	var bb := data.bbox()
	size = Vector2(bb) * cell_size
	pivot_offset = size * 0.5


func set_cell_size(s: float) -> void:
	cell_size = s
	_sync_size()
	queue_redraw()


func remember_home() -> void:
	_home_pos = position
	_home_size = cell_size


func home_pos() -> Vector2:
	return _home_pos


func local_cell_at(global_point: Vector2) -> Vector2i:
	var local := global_point - global_position
	if cell_size <= 0.0:
		return Vector2i.ZERO
	var c := Vector2i(floori(local.x / cell_size), floori(local.y / cell_size))
	for cell in data.local_cells():
		if cell == c:
			return c
	# Fall back to nearest occupied cell.
	var best := data.local_cells()[0]
	var best_d := 999999
	for cell in data.local_cells():
		var d: int = absi(cell.x - c.x) + absi(cell.y - c.y)
		if d < best_d:
			best_d = d
			best = cell
	return best


func contains_global(point: Vector2) -> bool:
	if data == null:
		return false
	var local := point - global_position
	if cell_size <= 0.0:
		return false
	var c := Vector2i(floori(local.x / cell_size), floori(local.y / cell_size))
	return data.local_cells().has(c)


func _process(delta: float) -> void:
	_time += delta
	# Slot/origin change in several places (place, undo, return-home); just
	# keep the resting layer in sync here.
	z_index = 100 if _dragging else _rest_z()
	var redraw := false
	# Random blinks, desynced per piece.
	if not _celebrating:
		_next_blink -= delta
		if _next_blink <= 0.0:
			_next_blink = randf_range(2.5, 5.5)
			_start_blink()
	# Carry tilt: lean into horizontal motion, spring back when still.
	if _dragging:
		_drag_dx = lerpf(_drag_dx, 0.0, minf(1.0, delta * 10.0))
		var target := clampf(_drag_dx * 0.012, -0.2, 0.2)
		rotation = lerpf(rotation, target, minf(1.0, delta * 14.0))
	# Jelly breathing (tray only) + unhappy throb are drawn, so redraw
	# continuously -- but only for pieces that actually show them.
	if _unhappy or (slot == Slot.TRAY and not _dragging):
		redraw = true
	if redraw:
		queue_redraw()


func _start_blink() -> void:
	if _blink_tween != null and _blink_tween.is_valid():
		_blink_tween.kill()
	_blink_tween = create_tween()
	_blink_tween.tween_method(_set_blink, 0.0, 1.0, 0.06)
	_blink_tween.tween_method(_set_blink, 1.0, 0.0, 0.09)


func _set_blink(v: float) -> void:
	_blink = v
	queue_redraw()


## Called by DragController with the pointer's horizontal motion.
func feed_drag_motion(dx: float) -> void:
	_drag_dx = lerpf(_drag_dx, dx, 0.5)


func _draw() -> void:
	if data == null:
		return
	# Flat style: no shadow under the piece, even while it is carried (the
	# scale-up in set_dragging is the "lifted" cue).
	# Jelly breathing, anchored at the bottom centre. Visual-only transform,
	# and ONLY for pieces waiting in the tray: on the board every edge must sit
	# exactly on the grid, or neighbouring outlines drift apart.
	var breathe := 0.0
	if slot == Slot.TRAY and not _dragging:
		breathe = sin(_time * 2.2 + _phase) * 0.012
	var s := Vector2(1.0 + breathe, 1.0 - breathe)
	var anchor := Vector2(size.x * 0.5, size.y)
	draw_set_transform(anchor * (Vector2.ONE - s), 0.0, s)
	var pulse := 0.55 + 0.45 * sin(_time * 7.0) if _unhappy else 1.0
	Art.draw_polyomino(self, Vector2.ZERO, cell_size, data.local_cells(),
		data.color, data.local_eye(), int(data.mood), data.target_color,
		_unhappy, 1.0, _compute_board_neighbors(), _blink, _celebrating, pulse)
	draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)


## Board-local neighbours of this piece's cells, used by Art.draw_polyomino
## so its outline corner-suppression treats adjacent pieces as fused. Empty
## when the piece is in the tray (no board adjacency) or when no board state
## has been wired in yet.
func _compute_board_neighbors() -> Array[Vector2i]:
	if board_state == null or slot != Slot.BOARD or origin == INVALID or data == null:
		return ([] as Array[Vector2i])
	var out: Array[Vector2i] = []
	for c in data.local_cells():
		for off in BoardState.NEIGHBOUR_OFFSETS:
			var nbr: Vector2i = c + off
			if out.has(nbr):
				continue
			var world_nbr: Vector2i = origin + nbr
			if not board_state.is_playable(world_nbr):
				continue
			var pid: int = board_state.piece_id_at(world_nbr)
			if pid == BoardState.EMPTY or pid == data.id:
				continue
			out.append(nbr)
	return out


func set_unhappy(v: bool) -> void:
	if _unhappy != v:
		_unhappy = v
		queue_redraw()


func is_unhappy() -> bool:
	return _unhappy


## Win-screen eyes (^ ^).
func set_celebrating(v: bool) -> void:
	_celebrating = v
	queue_redraw()


func set_dragging(v: bool) -> void:
	_dragging = v
	z_index = 100 if v else _rest_z()
	_drag_dx = 0.0
	var t := _new_fx()
	if v:
		t.set_parallel(true)
		t.tween_property(self, "scale", Vector2(1.1, 1.1), 0.14) \
			.set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	else:
		t.set_parallel(true)
		t.tween_property(self, "scale", Vector2.ONE, 0.1)
		t.tween_property(self, "rotation", 0.0, 0.1)
	queue_redraw()


## Land-on-board squash and stretch.
func squash(strength := 1.0) -> void:
	var t := _new_fx()
	t.tween_property(self, "rotation", 0.0, 0.0)
	t.tween_property(self, "scale", Vector2(1.0 + 0.16 * strength, 1.0 - 0.14 * strength), 0.07) \
		.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	t.tween_property(self, "scale", Vector2(1.0 - 0.06 * strength, 1.0 + 0.08 * strength), 0.08) \
		.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN_OUT)
	t.tween_property(self, "scale", Vector2.ONE, 0.16) \
		.set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)


## Happy hop: a quick jump-squash, optionally delayed (win wave).
func hop(delay := 0.0) -> void:
	var t := _new_fx()
	if delay > 0.0:
		t.tween_interval(delay)
	t.tween_property(self, "scale", Vector2(1.18, 0.82), 0.07)
	t.tween_property(self, "scale", Vector2(0.88, 1.16), 0.09) \
		.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	t.tween_property(self, "scale", Vector2.ONE, 0.22) \
		.set_trans(Tween.TRANS_ELASTIC).set_ease(Tween.EASE_OUT)


## Grumpy shiver for a piece that just became upset.
func shiver() -> void:
	var t := _new_fx()
	for a in [0.07, -0.07, 0.05, -0.04, 0.0]:
		t.tween_property(self, "rotation", a, 0.045)


## Refused-drop wobble. Runs on the fx tween, so the home-travel that follows
## (travel_to, on the move tween) no longer cancels it.
func refuse() -> void:
	var t := _new_fx()
	t.set_parallel(true)
	t.tween_property(self, "scale", Vector2.ONE, 0.1)
	t.chain().tween_property(self, "rotation", 0.16, 0.05)
	t.chain().tween_property(self, "rotation", -0.14, 0.07)
	t.chain().tween_property(self, "rotation", 0.08, 0.06)
	t.chain().tween_property(self, "rotation", 0.0, 0.08)


## Pop in from nothing (level intro).
func pop_in(delay := 0.0) -> void:
	scale = Vector2.ZERO
	var t := _new_fx()
	t.tween_interval(delay)
	t.tween_property(self, "scale", Vector2.ONE, 0.36) \
		.set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)


## Double-tap-to-rotate, tray-only (see DragController). bbox() can change for
## non-square pieces, so the caller (LevelController.on_rotate) still needs to
## re-fit this into its tray slot afterward -- this method only handles the
## piece's own data/redraw/feedback.
func rotate_piece() -> void:
	if data == null or slot != Slot.TRAY:
		return
	data.rotate_cw()
	_sync_size()
	queue_redraw()
	# Visually start a quarter-turn back and spin into place.
	rotation = -PI * 0.5
	var t := _new_fx()
	t.tween_property(self, "rotation", 0.0, 0.22).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)


func travel_to(pos: Vector2, new_cell_size: float = -1.0) -> void:
	if _move_tween != null and _move_tween.is_valid():
		_move_tween.kill()
	var t := create_tween().set_parallel(true)
	t.tween_property(self, "position", pos, 0.18).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	if new_cell_size > 0.0 and absf(new_cell_size - cell_size) > 0.5:
		t.tween_method(_lerp_cell_size, cell_size, new_cell_size, 0.18)
	_move_tween = t


func _lerp_cell_size(s: float) -> void:
	set_cell_size(s)


func _new_fx() -> Tween:
	if _fx_tween != null and _fx_tween.is_valid():
		_fx_tween.kill()
	_fx_tween = create_tween()
	return _fx_tween
