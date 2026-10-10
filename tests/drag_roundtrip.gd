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
var _slots := 0
var _home_index := -1


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
			_slots = _game.tray.slot_count
			_home_index = _pv.tray_index
			_target = _legal_cell()
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
			_wait = 12
		5:
			_assert_tray_intact("after the round trip + undo")
			# Tap-to-rotate in the tray, exactly as DragController._rotate_tap
			# does it. Each tap used to append a phantom slot to the tray.
			for i in 3:
				_game.on_pick_up(_pv)
				_game.send_to_tray(_pv)
				_pv.rotate_piece()
				_game.on_rotate(_pv)
			_wait = 12
		6:
			_assert_tray_intact("after 3 rotate taps")
			# A refused drop from the tray bounces it home.
			_game.on_pick_up(_pv)
			_game.return_home(_pv)
			_wait = 12
		7:
			_assert_tray_intact("after a refused drop")
			# board -> tray, then Undo puts it back on the board: the tray must
			# let go of it rather than keep a slot pointing at a board piece.
			_target = _legal_cell()
			_game.on_pick_up(_pv)
			_game.commit_place(_pv, _target)
			_game.on_pick_up(_pv)
			_game.send_to_tray(_pv)
			_game.undo()
			_wait = 12
		8:
			_ok(_pv.slot == PieceView.Slot.BOARD and _game._on_board.has(_pid),
				"undo of board -> tray puts the piece back on the board")
			_ok(not (_pv in _game._in_tray), "the tray no longer holds the undone piece")
			_ok(_game.tray.slot_count == _slots, "tray slot count unchanged after undo")
			_assert_no_tray_overlap()
			return _done()
	_step += 1
	return false


func _legal_cell() -> Vector2i:
	for cell in _game.state.playable_cells():
		if _game.can_place(_pv, cell):
			return cell
	return GameBoard.INVALID


func _assert_tray_intact(when: String) -> void:
	_ok(_game.tray.slot_count == _slots, "tray slot count unchanged %s" % when)
	_ok(_game._in_tray.size() == _slots, "tray array size unchanged %s" % when)
	_ok(_game._in_tray.count(_pv) == 1, "piece is in the tray exactly once %s" % when)
	_ok(_pv.tray_index == _home_index, "piece is back in its own slot %s" % when)


## Every tray piece -- including its thought bubble -- stays inside its own
## slot, so no two waiting pieces can overlap.
func _assert_no_tray_overlap() -> void:
	var rects: Array[Rect2] = []
	var inside := true
	for i in _game._in_tray.size():
		var v = _game._in_tray[i]
		if not (v is PieceView):
			continue
		var pv := v as PieceView
		var over := Vector2.ZERO
		if int(pv.data.mood) != int(PieceData.Mood.NEUTRAL):
			over = Art.thought_overhang_cells() * pv.cell_size
		var r := Rect2(pv.global_position - Vector2(0.0, over.y), pv.size + over)
		if not _game.tray.slot_rect_global(i).grow(1.0).encloses(r):
			inside = false
		rects.append(r)
	_ok(inside, "every tray piece + bubble fits inside its own slot")
	var overlap := false
	for a in rects.size():
		for b in range(a + 1, rects.size()):
			if rects[a].grow(-0.5).intersects(rects[b].grow(-0.5)):
				overlap = true
	_ok(not overlap, "no two tray pieces overlap")


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
