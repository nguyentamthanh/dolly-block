class_name LevelController
extends Control

## Polyomino packing controller: pieces of any shape ghép thành hình hoàn chỉnh.

signal level_solved(index: int)

const INVALID := Vector2i(-1, -1)

@onready var board: GameBoard = $Layout/BoardArea
@onready var tray: Tray = $Layout/TrayArea
@onready var pieces: Control = $PieceLayer
@onready var hud: HUD = $Layout/HUD
@onready var win_panel: LevelCompletePanel = $WinPanel

var level: LevelData
var state: BoardState
var accepting_input := true

var _drag: DragController
var _generator := LevelGenerator.new()

## piece id -> PieceView for board
var _on_board := {}
## tray slot index -> PieceView or null
var _in_tray: Array = []
var _pick_origin := {}
var _undo: Array = []


func _ready() -> void:
	GameState.ensure_loaded()
	_drag = DragController.new()
	add_child(_drag)
	_drag.setup(self, board, tray)
	win_panel.next_pressed.connect(_on_next)
	win_panel.hide_panel()
	hud.undo_pressed.connect(undo)
	hud.hint_pressed.connect(hint)
	resized.connect(_queue_relayout)
	board.resized.connect(_queue_relayout)
	tray.resized.connect(_queue_relayout)
	load_level(GameState.current_level)


func load_level(index: int) -> void:
	_drag.cancel()
	for c in pieces.get_children():
		c.queue_free()
	_on_board.clear()
	_in_tray.clear()
	_undo.clear()
	win_panel.hide_panel()
	accepting_input = true
	GameState.current_level = index
	level = _generator.generate(index)
	if level == null:
		push_error("LevelController: could not generate level %d" % index)
		return
	state = level.build_state()
	board.set_state(state)
	# Tray count is number of polyomino pieces, not cells
	var tray_n := 0
	if level.tray_pieces != null and not level.tray_pieces.is_empty():
		tray_n = level.tray_pieces.size()
	elif level.tray_blocks != null:
		tray_n = level.tray_blocks.size()
	tray.set_slot_count(tray_n)
	hud.set_level(index, LevelGenerator.TIERS[level.tier].name)
	# Fixed pieces: not movable
	if level.fixed_pieces != null and not level.fixed_pieces.is_empty():
		for p in level.fixed_pieces:
			var v := _spawn_piece(p, false)
			var origin := p.orient_to_solution()
			# Store origin for view
			v.origin = origin
			v.slot = PieceView.Slot.BOARD
			_on_board[p.id] = v
	elif not level.fixed_blocks.is_empty():
		for cell in level.fixed_blocks:
			var bd: BlockData = level.fixed_blocks[cell]
			var pd := PieceData.make(cell.x + cell.y*1000, bd.color, [Vector2i.ZERO], bd.mood as PieceData.Mood, bd.target_color)
			pd.solution_world = [cell]
			var v2 := _spawn_piece(pd, false)
			v2.origin = cell
			v2.slot = PieceView.Slot.BOARD
			_on_board[pd.id] = v2
	# Tray pieces
	if level.tray_pieces != null and not level.tray_pieces.is_empty():
		for i in level.tray_pieces.size():
			var p2: PieceData = level.tray_pieces[i]
			# Reset rot to 0 for tray (player can rotate)
			p2.rot = 0
			var v := _spawn_piece(p2, true)
			v.slot = PieceView.Slot.TRAY
			v.tray_index = i
			_in_tray.append(v)
	elif level.tray_blocks != null:
		for i in level.tray_blocks.size():
			var bd2: BlockData = level.tray_blocks[i]
			var pd2 := PieceData.make(9999+i, bd2.color, [Vector2i.ZERO], bd2.mood as PieceData.Mood, bd2.target_color)
			var v3 := _spawn_piece(pd2, true)
			v3.slot = PieceView.Slot.TRAY
			v3.tray_index = i
			_in_tray.append(v3)
	_relayout(0.0)
	_refresh_unhappy()


func _spawn_piece(data: PieceData, movable: bool) -> PieceView:
	var v := PieceView.new()
	pieces.add_child(v)
	v.setup(data, movable)
	return v

# Alias for single-cell callers
func _spawn(data, movable: bool):
	if data is PieceData:
		return _spawn_piece(data, movable)
	if data is BlockData:
		var bd: BlockData = data
		var pd := PieceData.make(bd.color, bd.color, [Vector2i.ZERO], bd.mood as PieceData.Mood, bd.target_color)
		return _spawn_piece(pd, movable)
	return null


func _queue_relayout() -> void:
	if state == null:
		return
	_relayout.call_deferred(0.0)


func _relayout(duration: float = 0.14) -> void:
	if state == null:
		return
	board.relayout()
	tray.relayout()
	# Board pieces: position = board.origin + origin * board.cell_size
	for id in _on_board:
		var v: PieceView = _on_board[id]
		if v == null:
			continue
		var origin: Vector2i = v.origin
		if origin == INVALID:
			# Fallback: try to get from state
			var rec: Dictionary = state.get_placed(v.data.id)
			if rec.has("origin"):
				origin = rec.origin
				v.origin = origin
		v.set_cell_size(board.cell_size)
		var pos := board.origin + Vector2(origin) * board.cell_size
		var global_rect := Rect2(board.global_position + pos, v.size)
		_move(v, global_rect, duration)
	for i in _in_tray.size():
		var v2: PieceView = _in_tray[i]
		if v2 == null:
			continue
		# Fit polyomino inside tray slot
		var slot_rect := tray.slot_rect_global(i)
		# Compute cell_size to fit bbox inside slot
		var bbox: Vector2i = v2.data.bbox()
		var max_dim := maxi(bbox.x, bbox.y)
		if max_dim == 0:
			max_dim = 1
		var fit_cell := minf(slot_rect.size.x / float(bbox.x), slot_rect.size.y / float(bbox.y)) * 0.92
		# Clamp to reasonable
		fit_cell = clampf(fit_cell, 12.0, tray.slot_size)
		v2.set_cell_size(fit_cell)
		# Center inside slot
		var slot_center := slot_rect.get_center()
		var piece_size := v2.size
		var global_pos := slot_center - piece_size * 0.5
		var global_rect2 := Rect2(global_pos, piece_size)
		_move(v2, global_rect2, duration)


func _move(v: Control, global_rect: Rect2, duration: float) -> void:
	if v is PieceView:
		var pv: PieceView = v as PieceView
		var local_pos := global_rect.position - pieces.global_position
		# PieceView uses position + size via travel_to
		if duration <= 0.0:
			pv.position = local_pos
			# size already set via set_cell_size
		else:
			pv.travel_to(local_pos, -1.0)
	elif v is BlockView:
		(v as BlockView).move_to(Rect2(global_rect.position - pieces.global_position, global_rect.size), duration)


func view_at(point: Vector2):
	var found: Control = null
	# Check PieceView first (polyomino)
	for c in pieces.get_children():
		if c is PieceView:
			var pv: PieceView = c as PieceView
			if not pv.movable:
				continue
			if pv.contains_global(point):
				found = pv
		elif c is BlockView:
			var bv: BlockView = c as BlockView
			if not bv.movable:
				continue
			if Rect2(bv.global_position, bv.size).has_point(point):
				found = bv
	return found


func can_place(piece_view, cell: Vector2i) -> bool:
	if cell == INVALID:
		return false
	if piece_view is PieceView:
		var pv: PieceView = piece_view as PieceView
		var world := pv.data.world_cells(cell)
		return state.can_place_cells(world)
	elif piece_view is BlockView:
		var bv: BlockView = piece_view as BlockView
		return state.is_empty_at(cell)
	return false


func placement_happy(piece_view, cell: Vector2i) -> bool:
	if not can_place(piece_view, cell):
		return false
	if piece_view is PieceView:
		var pv: PieceView = piece_view as PieceView
		return not state.would_violate(pv.data, cell)
	elif piece_view is BlockView:
		var bv: BlockView = piece_view as BlockView
		return not state.would_violate(cell, bv.data)
	return false


func on_pick_up(v) -> void:
	if v is PieceView:
		var pv: PieceView = v as PieceView
		_pick_origin = {"slot": pv.slot, "origin": pv.origin, "tray": pv.tray_index, "id": pv.data.id}
		if pv.slot == PieceView.Slot.BOARD and pv.origin != INVALID:
			state.remove_piece(pv.data.id)
			_on_board.erase(pv.data.id)
			pv.origin = INVALID
		# Scale to board size so dragged shape matches grid exactly
		pv.set_cell_size(board.cell_size)
		_refresh_unhappy()
	elif v is BlockView:
		var bv: BlockView = v as BlockView
		_pick_origin = {"slot": bv.slot, "cell": bv.cell, "tray": bv.tray_index}
		if bv.slot == BlockView.Slot.BOARD and bv.cell != INVALID:
			state.remove(bv.cell)
			_on_board.erase(bv.cell)
			bv.cell = INVALID
		_refresh_unhappy()


func commit_place(v, cell: Vector2i) -> void:
	if v is PieceView:
		var pv: PieceView = v as PieceView
		_detach_from_tray(pv)
		state.place_piece(pv.data, cell)
		_on_board[pv.data.id] = pv
		pv.slot = PieceView.Slot.BOARD
		pv.origin = cell
		# Update view position
		pv.set_cell_size(board.cell_size)
		var pos := board.origin + Vector2(cell) * board.cell_size
		var global_rect := Rect2(board.global_position + pos, pv.size)
		_move(pv, global_rect, 0.13)
		pv.set_dragging(false)
		# Pop effect via scale
		var t := pv.create_tween()
		t.tween_property(pv, "scale", Vector2(1.14, 0.88), 0.07)
		t.tween_property(pv, "scale", Vector2(0.96, 1.06), 0.07)
		t.tween_property(pv, "scale", Vector2.ONE, 0.09)
		_push_undo(pv)
		_refresh_unhappy()
		_check_win()
	elif v is BlockView:
		var bv: BlockView = v as BlockView
		_detach_from_tray(bv)
		state.place(bv.cell if false else cell, bv.data) # shim
		# For BlockView, use state.place
		state.place(cell, bv.data)
		_on_board[cell] = bv
		bv.slot = BlockView.Slot.BOARD
		bv.cell = cell
		_move(bv, board.cell_rect_global(cell), 0.13)
		bv.pop()
		_push_undo(bv)
		_refresh_unhappy()
		_check_win()


func return_home(v) -> void:
	if v is PieceView:
		var pv: PieceView = v as PieceView
		var from_slot: int = _pick_origin.get("slot", PieceView.Slot.TRAY)
		var from_origin: Vector2i = _pick_origin.get("origin", INVALID)
		var from_id: int = _pick_origin.get("id", -1)
		if from_slot == PieceView.Slot.BOARD and from_origin != INVALID and state.can_place_cells(pv.data.world_cells(from_origin)):
			state.place_piece(pv.data, from_origin)
			_on_board[pv.data.id] = pv
			pv.slot = PieceView.Slot.BOARD
			pv.origin = from_origin
			pv.set_cell_size(board.cell_size)
			var pos := board.origin + Vector2(from_origin) * board.cell_size
			var global_rect := Rect2(board.global_position + pos, pv.size)
			_move(pv, global_rect, 0.13)
		else:
			_to_tray(pv)
		_refresh_unhappy()
	elif v is BlockView:
		var bv: BlockView = v as BlockView
		var from_slot2: int = _pick_origin.get("slot", BlockView.Slot.TRAY)
		var from_cell: Vector2i = _pick_origin.get("cell", INVALID)
		if from_slot2 == BlockView.Slot.BOARD and from_cell != INVALID and state.is_empty_at(from_cell):
			state.place(from_cell, bv.data)
			_on_board[from_cell] = bv
			bv.slot = BlockView.Slot.BOARD
			bv.cell = from_cell
			_move(bv, board.cell_rect_global(from_cell), 0.13)
		else:
			_to_tray(bv)
		_refresh_unhappy()


## Explicit "put it back in the tray" -- used when a piece is dropped onto the
## tray shelf. Unlike return_home this never bounces a board piece back onto the
## board; dropping on the tray always means "take this off the board".
func send_to_tray(v) -> void:
	var from_board: bool = _pick_origin.get("slot", PieceView.Slot.TRAY) == PieceView.Slot.BOARD
	if v is PieceView:
		_to_tray(v as PieceView)
	elif v is BlockView:
		_to_tray(v as BlockView)
	if from_board:
		_push_undo(v)  # so Undo can drop it back where it was
	_refresh_unhappy()


func _to_tray(v) -> void:
	if v is PieceView:
		var pv: PieceView = v as PieceView
		var idx := pv.tray_index
		if idx < 0 or idx >= _in_tray.size() or _in_tray[idx] != null:
			idx = _in_tray.find(null)
		if idx == -1:
			_in_tray.append(pv)
			idx = _in_tray.size() - 1
			tray.set_slot_count(_in_tray.size())
		_in_tray[idx] = pv
		pv.slot = PieceView.Slot.TRAY
		pv.tray_index = idx
		pv.origin = INVALID
		var slot_rect := tray.slot_rect_global(idx)
		var bbox: Vector2i = pv.data.bbox()
		var fit_cell := minf(slot_rect.size.x / float(maxi(bbox.x,1)), slot_rect.size.y / float(maxi(bbox.y,1))) * 0.92
		pv.set_cell_size(clampf(fit_cell, 12.0, tray.slot_size))
		var slot_center := slot_rect.get_center()
		var global_pos := slot_center - pv.size * 0.5
		var global_rect := Rect2(global_pos, pv.size)
		_move(pv, global_rect, 0.13)
	elif v is BlockView:
		var bv: BlockView = v as BlockView
		var idx2 := bv.tray_index
		if idx2 < 0 or idx2 >= _in_tray.size() or _in_tray[idx2] != null:
			idx2 = _in_tray.find(null)
		if idx2 == -1:
			_in_tray.append(bv)
			idx2 = _in_tray.size() - 1
			tray.set_slot_count(_in_tray.size())
		_in_tray[idx2] = bv
		bv.slot = BlockView.Slot.TRAY
		bv.tray_index = idx2
		bv.cell = INVALID
		_move(bv, tray.slot_rect_global(idx2), 0.13)


func _detach_from_tray(v) -> void:
	var i := _in_tray.find(v)
	if i != -1:
		_in_tray[i] = null


func _refresh_unhappy() -> void:
	# Check each board piece
	for id in _on_board:
		var v = _on_board[id]
		if v is PieceView:
			var pv: PieceView = v as PieceView
			pv.set_unhappy(state.piece_violated(pv.data.id))
		elif v is BlockView:
			var bv: BlockView = v as BlockView
			bv.set_unhappy(state.is_violated(bv.cell))
	# Also check for single-cell dict keys
	for cell in _on_board:
		if cell is Vector2i:
			var bv2 = _on_board[cell]
			if bv2 is BlockView:
				(bv2 as BlockView).set_unhappy(state.is_violated(cell))
	# For polyomino, show remaining PIECES, not empty cells
	var remaining_pieces := 0
	for vv in _in_tray:
		if vv != null:
			remaining_pieces += 1
	# Fallback to empty cells if tray is somehow empty (single-cell shim)
	if remaining_pieces == 0:
		remaining_pieces = state.empty_count()
	hud.set_remaining(remaining_pieces)


func _check_win() -> void:
	if not state.is_solved():
		return
	accepting_input = false
	GameState.complete_level(level.level_index, 3, state.snapshot(), GameState.bg_for_level(level.level_index))
	level_solved.emit(level.level_index)
	for id in _on_board:
		var v = _on_board[id]
		if v is PieceView:
			var pv: PieceView = v as PieceView
			var t := pv.create_tween()
			t.tween_property(pv, "scale", Vector2(1.14, 0.88), 0.07)
			t.tween_property(pv, "scale", Vector2(0.96, 1.06), 0.07)
			t.tween_property(pv, "scale", Vector2.ONE, 0.09)
		elif v is BlockView:
			(v as BlockView).pop()
	await get_tree().create_timer(0.45).timeout
	win_panel.show_panel(level.level_index, LevelGenerator.TIERS[level.tier].name)


func _on_next() -> void:
	load_level(level.level_index + 1)


func undo() -> void:
	if _undo.is_empty() or not accepting_input:
		return
	var e: Dictionary = _undo.pop_back()
	var v = e.view
	if v is PieceView:
		var pv: PieceView = v as PieceView
		if pv.slot == PieceView.Slot.BOARD and pv.origin != INVALID:
			state.remove_piece(pv.data.id)
			_on_board.erase(pv.data.id)
			pv.origin = INVALID
		_pick_origin = {"slot": e.slot, "origin": e.origin, "tray": e.tray, "id": e.id}
		return_home(pv)
	elif v is BlockView:
		var bv: BlockView = v as BlockView
		if bv.slot == BlockView.Slot.BOARD and bv.cell != INVALID:
			state.remove(bv.cell)
			_on_board.erase(bv.cell)
			bv.cell = INVALID
		_pick_origin = {"slot": e.slot, "cell": e.cell, "tray": e.tray}
		return_home(bv)


func _push_undo(v) -> void:
	if v is PieceView:
		var pv: PieceView = v as PieceView
		_undo.append({
			"view": pv,
			"slot": _pick_origin.get("slot", PieceView.Slot.TRAY),
			"origin": _pick_origin.get("origin", INVALID),
			"tray": _pick_origin.get("tray", -1),
			"id": pv.data.id,
		})
	elif v is BlockView:
		var bv: BlockView = v as BlockView
		_undo.append({
			"view": bv,
			"slot": _pick_origin.get("slot", BlockView.Slot.TRAY),
			"cell": _pick_origin.get("cell", INVALID),
			"tray": _pick_origin.get("tray", -1),
		})


func hint() -> void:
	if not accepting_input or state == null:
		return
	var remaining: Array = []
	for v in _in_tray:
		if v == null:
			continue
		if v is PieceView:
			remaining.append((v as PieceView).data)
		elif v is BlockView:
			remaining.append((v as BlockView).data)
	if remaining.is_empty():
		return
	var answer := Solver.new().solve(state, remaining)
	if answer == null:
		hud.flash_message("No way home from here - try undoing a move")
		return
	# For polyomino, find a piece that solver placed
	if remaining[0] is PieceData:
		# Find an empty piece that matches solver's placement
		# Solver's answer has all pieces placed; we need to place one.
		# Simple: find first empty origin that matches a tray piece
		# Check all placed ids vs original fixed
		var solver_ids := answer.placed_ids()
		for id in solver_ids:
			if _on_board.has(id):
				continue
			# This id is a tray piece placed by solver
			var rec: Dictionary = answer.get_placed(id)
			var piece: PieceData = rec.piece
			var origin: Vector2i = rec.origin
			for v in _in_tray:
				if v == null:
					continue
				var pv: PieceView = v as PieceView
				if pv.data.id == piece.id:
					_pick_origin = {"slot": PieceView.Slot.TRAY, "origin": INVALID, "tray": pv.tray_index, "id": pv.data.id}
					# Need to ensure piece rot matches solver's rot
					pv.data.rot = piece.rot
					pv.set_cell_size(board.cell_size)
					commit_place(pv, origin)
					return
			# Also try matching by key if id mismatch due to duplicate
			for v in _in_tray:
				if v == null:
					continue
				var pv2: PieceView = v as PieceView
				if pv2.data.color == piece.color and pv2.data.mood == piece.mood and pv2.data.target_color == piece.target_color and pv2.data.base_cells.size() == piece.base_cells.size():
					_pick_origin = {"slot": PieceView.Slot.TRAY, "origin": INVALID, "tray": pv2.tray_index, "id": pv2.data.id}
					pv2.data.rot = piece.rot
					pv2.set_cell_size(board.cell_size)
					commit_place(pv2, origin)
					return
	else:
		# Single-cell hint
		for cell in state.empty_cells():
			var want: BlockData = answer.get_block(cell)
			if want == null:
				continue
			for v in _in_tray:
				var bv := v as BlockView
				if bv != null and bv.data.same_as(want):
					_pick_origin = {"slot": BlockView.Slot.TRAY, "cell": INVALID, "tray": bv.tray_index}
					commit_place(bv, cell)
					return
