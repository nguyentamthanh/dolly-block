class_name DragController
extends Node

## Pointer handling for both single-cell BlockView and polyomino PieceView.
## Owns no rules — asks LevelController whether a drop is allowed.
##
## Alignment rule: while a piece is in the air its cells are scaled to the board
## grid, and the target cell is read from the piece's own top-left, rounded to
## the nearest grid cell. So the highlighted cells are always exactly the cells
## the piece is covering, and the drop lands where it looks like it will.

const FINGER_LIFT := 0.9
## A press on a tray piece that is released within TAP_TIME seconds without
## travelling more than TAP_SLOP px is a TAP: it rotates the piece instead of
## being treated as a (zero-length) drag.
const TAP_TIME := 0.35
const TAP_SLOP := 14.0

var board: GameBoard
var tray: Tray
var controller: LevelController

var _view: Control = null
var _grab_offset := Vector2.ZERO
var _grab_local := Vector2i.ZERO # for polyomino: local cell grabbed
var _lift := 0.0
var _last_cell := GameBoard.INVALID
var _last_point := Vector2.ZERO

var _press_point := Vector2.ZERO
var _press_time := 0.0
var _moved := false
var _from_tray := false


func setup(c: LevelController, b: GameBoard, t: Tray) -> void:
	controller = c
	board = b
	tray = t


func is_dragging() -> bool:
	return _view != null


func cancel() -> void:
	if _view == null:
		return
	var v := _view
	_release_state()
	controller.return_home(v)


func _input(event: InputEvent) -> void:
	if controller == null or not controller.accepting_input:
		return
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
		if event.pressed:
			_begin(event.position)
		else:
			_finish(event.position)
	elif event is InputEventMouseMotion and _view != null:
		_carry(event.position)


## Tapping a tray piece rotates it (see _finish). Scoped to tray-only pieces:
## rotating a placed board piece would mean touching placement/collision
## logic -- a rotated tray piece is just re-fit into its slot with a new bbox,
## zero interaction with BoardState.
func _rotate_tap(pv: PieceView) -> void:
	controller.send_to_tray(pv)
	pv.rotate_piece()
	controller.on_rotate(pv)
	controller.sfx.play("pop", -2.0, randf_range(1.0, 1.15))


func _begin(point: Vector2) -> void:
	var v = controller.view_at(point)
	if v == null or not v.get("movable"):
		return
	_view = v
	_last_cell = GameBoard.INVALID
	_press_point = point
	_press_time = Time.get_ticks_msec() / 1000.0
	_moved = false
	_from_tray = v is PieceView and (v as PieceView).slot == PieceView.Slot.TRAY

	# Work out which cell the finger landed on, and where inside that cell
	# (0..1 on each axis), while the piece is still at its tray size.
	var old_cs := _cell_size_of(v)
	var local: Vector2 = point - v.global_position
	if v is PieceView:
		var pv: PieceView = v as PieceView
		_grab_local = pv.local_cell_at(point)
		if not pv.data.local_cells().has(_grab_local):
			var lc := pv.data.local_cells()
			_grab_local = lc[0] if not lc.is_empty() else Vector2i.ZERO
	else:
		_grab_local = Vector2i.ZERO
	var frac := Vector2(0.5, 0.5)
	if old_cs > 0.0:
		frac = (local - Vector2(_grab_local) * old_cs) / old_cs
		frac = frac.clamp(Vector2.ZERO, Vector2.ONE)

	# LevelController rescales the piece to the board grid here.
	controller.on_pick_up(v)

	# Re-anchor so the exact spot the finger grabbed stays under the finger at
	# the new size. Without this the piece jumps by the size difference and
	# every drop is off by a cell.
	var new_cs := _cell_size_of(v)
	_grab_offset = -(Vector2(_grab_local) + frac) * new_cs
	_lift = new_cs * FINGER_LIFT if DisplayServer.is_touchscreen_available() else 0.0

	if v.has_method("set_dragging"):
		v.set_dragging(true)
	controller.sfx.play("pickup", 0.0, randf_range(0.95, 1.08))
	_last_point = point
	_carry(point)


## Where the piece's (unscaled, unrotated) top-left should be for this pointer.
## Snapping reads THIS rather than _view.global_position, because the getter
## folds in the lift scale / carry tilt around the pivot and would drift.
func _top_left_for(point: Vector2) -> Vector2:
	return point + _grab_offset - Vector2(0, _lift)


func _carry(point: Vector2) -> void:
	if _view == null:
		return
	if not _moved and point.distance_to(_press_point) > TAP_SLOP:
		_moved = true
	var top_left := _top_left_for(point)
	_view.global_position = top_left
	if _view is PieceView:
		(_view as PieceView).feed_drag_motion(point.x - _last_point.x)
	_last_point = point

	var snap_cell := board.cell_round_at_global(top_left)
	var world := _world_cells(snap_cell)

	var on_board := false
	for c in world:
		if board.state != null and board.state.is_playable(c):
			on_board = true
			break
	if not on_board:
		if not board.highlight_cells.is_empty() or board.highlight_cell != GameBoard.INVALID:
			board.clear_highlight()
		_last_cell = GameBoard.INVALID
		return

	if snap_cell == _last_cell:
		return
	_last_cell = snap_cell
	var happy := controller.placement_happy(_view, snap_cell)
	if _view is PieceView:
		var can := controller.can_place(_view, snap_cell)
		board.set_preview(world, can, happy, Palette.fill((_view as PieceView).data.color))
		if can:
			controller.sfx.play("tick", -8.0, 1.0 + randf() * 0.1)
	else:
		board.set_highlight(snap_cell, happy)


func _finish(point: Vector2) -> void:
	if _view == null:
		return
	var v := _view
	var top_left := _top_left_for(point)
	_view.global_position = top_left
	var snap_cell := board.cell_round_at_global(top_left)
	var held := Time.get_ticks_msec() / 1000.0 - _press_time
	var is_tap := not _moved and point.distance_to(_press_point) <= TAP_SLOP and held <= TAP_TIME
	_release_state()

	if is_tap and _from_tray and v is PieceView:
		_rotate_tap(v as PieceView)
		return

	# Dropped on the tray shelf -> always park it there, even if it came from the
	# board. This is the only way to take a placed piece back off.
	if tray.contains_global(point):
		controller.send_to_tray(v)
		return
	if controller.can_place(v, snap_cell):
		controller.commit_place(v, snap_cell)
	else:
		controller.on_refuse(v, _world_cells_for(v, snap_cell))
		controller.return_home(v)


func _world_cells(snap_cell: Vector2i) -> Array[Vector2i]:
	return _world_cells_for(_view, snap_cell)


func _world_cells_for(v: Control, snap_cell: Vector2i) -> Array[Vector2i]:
	if snap_cell == GameBoard.INVALID or v == null:
		return []
	if v is PieceView:
		return (v as PieceView).data.world_cells(snap_cell)
	return [snap_cell]


func _cell_size_of(v: Control) -> float:
	if v is PieceView:
		return (v as PieceView).cell_size
	return v.size.x


func _release_state() -> void:
	if _view != null and _view.has_method("set_dragging"):
		_view.set_dragging(false)
	_view = null
	_last_cell = GameBoard.INVALID
	board.clear_highlight()
