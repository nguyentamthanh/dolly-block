extends SceneTree

## Verifies a piece can go tray -> board -> tray -> board again, exercising the
## same LevelController entry points DragController calls. Regression guard for
## "once placed, a piece can't be dragged back out".
##
##   godot --headless --script res://tests/drag_roundtrip.gd

var _game: LevelController
var _passed := 0
var _failed := 0
var _step := 0
var _wait := 0
var _pv: PieceView
var _pid := 0
var _target := GameBoard.INVALID


func _initialize() -> void:
	print("\n=== drag round-trip ===\n")
	var packed: PackedScene = load("res://scenes/Main.tscn")
	_game = packed.instantiate() as LevelController
	root.add_child(_game)


## A tiny state machine: each step acts, then waits a few frames so position /
## size tweens settle before the next assertion -- exactly the gap a human
## leaves between releasing a piece and grabbing it again.
func _process(_delta: float) -> bool:
	if _wait > 0:
		_wait -= 1
		return false
	match _step:
		0:
			_wait = 4
		1:
			for v in _game._in_tray:
				if v is PieceView:
					_pv = v
					break
			_ok(_pv != null, "found a movable tray piece")
			if _pv == null:
				return _done()
			_pid = _pv.data.id
			for cell in _game.state.playable_cells():
				if _game.can_place(_pv, cell):
					_target = cell
					break
			_ok(_target != GameBoard.INVALID, "a legal cell exists for it")
			_game.on_pick_up(_pv)
			_game.commit_place(_pv, _target)
			_wait = 12
		2:
			_ok(_pv.slot == PieceView.Slot.BOARD, "piece reports BOARD after placing")
			_ok(_game._on_board.has(_pid), "piece is tracked on the board")
			var probe := _game.board.cell_rect_global(_target).get_center()
			_ok(_game.view_at(probe) == _pv, "placed piece is found by view_at (re-pickable)")
			# board -> tray, the reported-broken path
			_game.on_pick_up(_pv)
			_ok(not _game._on_board.has(_pid), "pick-up removes it from the board")
			_game.send_to_tray(_pv)
			_wait = 12
		3:
			_ok(_pv.slot == PieceView.Slot.TRAY, "piece reports TRAY after send_to_tray")
			_ok(_pv in _game._in_tray, "piece is back in the tray array")
			_ok(_game.state.get_placed(_pid).is_empty(), "board state no longer has it")
			var probe2 := _game.tray.slot_rect_global(_pv.tray_index).get_center()
			_ok(_game.view_at(probe2) == _pv, "tray piece is found by view_at again")
			_game.on_pick_up(_pv)
			_game.commit_place(_pv, _target)
			_wait = 12
		4:
			_ok(_pv.slot == PieceView.Slot.BOARD and _game._on_board.has(_pid),
				"piece can be placed again after the round trip")
			_game.undo()
			_ok(true, "undo did not crash after the round trip")
			return _done()
	_step += 1
	return false


func _done() -> bool:
	print("\n=== %d passed, %d failed ===\n" % [_passed, _failed])
	quit(1 if _failed > 0 else 0)
	return true


func _ok(cond: bool, label: String) -> void:
	if cond:
		_passed += 1
		print("  PASS  %s" % label)
	else:
		_failed += 1
		print("  FAIL  %s" % label)
