class_name LevelController
extends Control

## Polyomino packing controller: pieces of any shape ghép thành hình hoàn chỉnh.

signal level_solved(index: int)

const INVALID := Vector2i(-1, -1)
## Share of a tray slot a piece (plus its thought bubble) may fill.
const TRAY_FIT := 0.9
## Largest tray cell size, as a share of the slot: keeps a 1-cell piece from
## dwarfing the longer pieces beside it.
const TRAY_MAX_CELL_FRAC := 0.5

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
## Public (not _sfx) so DragController/HUD can reach it directly, the same
## way they already reach `board`/`tray`.
var sfx: Sfx

## piece id -> PieceView for board
var _on_board := {}
## tray slot index -> PieceView or null
var _in_tray: Array = []
var _pick_origin := {}
var _undo: Array = []

## Assistance counters for this level, feeding the real star score. Reset in
## load_level().
var _hints_used := 0
var _undos_used := 0

## Juice state: consecutive successful drops (raises the place sfx pitch),
## each board piece's last known upset flag (to fire happy/upset effects only
## on CHANGE), and a load counter so a stale win coroutine can tell the level
## moved on underneath it.
var _combo := 0
var _prev_violated := {}
var _quiet_refresh := false
var _load_serial := 0


## Board + tray live in one BoxContainer whose direction follows the screen:
## stacked on portrait phones/tablets, side by side on landscape screens
## (desktop, web, landscape tablets).
var _body: BoxContainer
## Wider than this (width / height) => landscape layout.
const LANDSCAPE_ASPECT := 1.0


func _ready() -> void:
	GameState.ensure_loaded()
	_build_body()
	_apply_screen_shape()
	sfx = Sfx.new()
	add_child(sfx)
	_drag = DragController.new()
	add_child(_drag)
	_drag.setup(self, board, tray)
	hud.setup(sfx)
	win_panel.setup(sfx)
	win_panel.next_pressed.connect(_on_next)
	win_panel.reward_burst.connect(_on_reward_burst)
	win_panel.hide_panel()
	hud.undo_pressed.connect(undo)
	hud.hint_pressed.connect(hint)
	hud.menu_pressed.connect(_on_menu_pressed)
	resized.connect(_apply_screen_shape)
	resized.connect(_queue_relayout)
	board.resized.connect(_queue_relayout)
	tray.resized.connect(_queue_relayout)
	load_level(GameState.current_level)


## Wrap BoardArea + TrayArea (siblings under Layout in Main.tscn) in a
## BoxContainer so their arrangement can flip with the screen's shape.
func _build_body() -> void:
	var layout := board.get_parent()
	_body = BoxContainer.new()
	_body.name = "Body"
	_body.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_body.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_body.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_body.add_theme_constant_override("separation", 6)
	layout.add_child(_body)
	layout.move_child(_body, board.get_index())
	board.reparent(_body, false)
	tray.reparent(_body, false)
	board.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	board.size_flags_vertical = Control.SIZE_EXPAND_FILL


## Portrait: board on top, tray shelf below (taller on tall phones). Landscape:
## tray becomes a column on the right. Both respect the device safe area.
func _apply_screen_shape() -> void:
	if _body == null:
		return
	var s := size
	if s.x < 1.0 or s.y < 1.0:
		s = get_viewport_rect().size
	var safe := UiFx.safe_insets(self)
	hud.set_safe_top(safe.top)
	var landscape := s.x > s.y * LANDSCAPE_ASPECT
	_body.vertical = not landscape
	tray.safe_bottom = 0.0 if landscape else safe.bottom
	if landscape:
		tray.custom_minimum_size = Vector2(clampf(s.x * 0.3, 320.0, 560.0), 0.0)
		tray.size_flags_vertical = Control.SIZE_FILL
	else:
		tray.custom_minimum_size = Vector2(0.0, clampf(s.y * 0.15, 190.0, 300.0) + safe.bottom)
		tray.size_flags_vertical = Control.SIZE_FILL
	$Layout.offset_left = safe.left
	$Layout.offset_right = -safe.right
	$Layout.offset_bottom = -(safe.bottom if landscape else 0.0)


func load_level(index: int) -> void:
	_drag.cancel()
	for c in pieces.get_children():
		c.queue_free()
	_on_board.clear()
	_in_tray.clear()
	_undo.clear()
	_hints_used = 0
	_undos_used = 0
	_combo = 0
	_prev_violated.clear()
	_load_serial += 1
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
	_quiet_refresh = true
	_refresh_unhappy()
	_quiet_refresh = false
	_play_intro()
	# First levels: teach the two gestures (rotation is otherwise invisible).
	if index < 3:
		hud.flash_message("Drag pieces onto the board  ·  Tap one to rotate it", 3.5)


## Level-start choreography: the board fades up while every piece pops in, the
## fixed ones first in a diagonal wave, then the tray pieces left to right.
## Scale-only, so final positions (what the tests inspect) are exact from
## frame one; skipped entirely headless.
func _play_intro() -> void:
	if not Fx.juice_enabled():
		return
	board.modulate.a = 0.0
	var bt := board.create_tween()
	bt.tween_property(board, "modulate:a", 1.0, 0.25)
	var fixed: Array = []
	for id in _on_board:
		if _on_board[id] is PieceView:
			fixed.append(_on_board[id])
	fixed.sort_custom(func(a: PieceView, b: PieceView): return a.origin.x + a.origin.y < b.origin.x + b.origin.y)
	for i in fixed.size():
		(fixed[i] as PieceView).pop_in(0.08 + i * 0.05)
	var base := 0.12 + fixed.size() * 0.05
	for i in _in_tray.size():
		var v = _in_tray[i]
		if v is PieceView:
			(v as PieceView).pop_in(base + i * 0.07)
	sfx.play("whoosh", -6.0)


func _spawn_piece(data: PieceData, movable: bool) -> PieceView:
	var v := PieceView.new()
	pieces.add_child(v)
	v.setup(data, movable)
	v.board_state = state
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
		var v2 = _in_tray[i]
		if v2 is PieceView:
			_fit_in_tray_slot(v2 as PieceView, duration)
		elif v2 is BlockView:
			_move(v2, tray.slot_rect_global(i), duration)


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
	# DragController hits this every pointer move while a finger is down -- a
	# bad per-frame O(n) on top of every block's per-frame _draw. A whole-frame
	# reject keeps it cheap: if the point is outside the piece layer's bbox,
	# none of the children can contain it. Inside the bbox, the fallback
	# per-piece contains_global() check still gives exact shape hits (polyomino
	# pieces are not rectangular), so this only prunes the unreachable cases.
	if not Rect2(pieces.global_position, pieces.size).has_point(point):
		return null
	var found: Control = null
	# Tray pieces are grabbed by their whole slot: small, oddly shaped pieces
	# (an L in a big slot) are otherwise fiddly to hit with a thumb.
	for i in _in_tray.size():
		var tv = _in_tray[i]
		if tv is PieceView and (tv as PieceView).movable \
				and tray.slot_rect_global(i).has_point(point):
			return tv
	# Check PieceView first (polyomino)
	for c in pieces.get_children():
		if c is PieceView:
			var pv: PieceView = c as PieceView
			if not pv.movable:
				continue
			# Cheap bbox pre-check; contains_global() does the per-cell test.
			if Rect2(pv.global_position, pv.size).has_point(point) and pv.contains_global(point):
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
		pv.squash()
		_place_juice(pv, pos + Vector2(pv.size) * 0.5)
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
		sfx.play("place")
		pieces.add_child(Fx.piece_pop(bv.position + bv.size * 0.5, Palette.fill(bv.data.color)))
		_push_undo(bv)
		_refresh_unhappy()
		_check_win()


## The landing bundle for a successful drop (medium tier): squash is done by
## the caller; this adds the sound (pitch climbs with the combo), a shockwave
## ring, candy bits, sparkles and a tiny screen nudge. `board_local` is the
## piece's landing centre in board coordinates.
func _place_juice(pv: PieceView, board_local: Vector2) -> void:
	_combo += 1
	var pitch := 1.0 + minf(_combo - 1, 8) * 0.06
	sfx.play("place", 0.0, pitch)
	var centre := board.global_position + board_local - pieces.global_position
	var col := Palette.fill(pv.data.color)
	pieces.add_child(Fx.ring_wave(centre, maxf(pv.size.x, pv.size.y) * 0.62,
		Color(1, 1, 1, 0.85), maxf(6.0, pv.cell_size * 0.1)))
	pieces.add_child(Fx.piece_pop(centre, col))
	pieces.add_child(Fx.star_sparkle(centre, Color(1, 1, 0.85), 6, 0.9))
	Fx.shake(self, 3.0 + minf(_combo, 5) * 0.6, 0.16)
	if _combo >= 3 and _combo % 3 == 0:
		var words := ["Nice!", "Great!", "Awesome!", "Amazing!"]
		var word: String = words[mini(_combo / 3 - 1, words.size() - 1)]
		add_child(Fx.float_text(word, centre + pieces.global_position - global_position - Vector2(0, pv.size.y * 0.6),
			Art.STAR, 48, 70.0, 0.3))
		sfx.play("sparkle", -4.0)


## A drop that can't go there: wobble the piece, flash the cells it tried to
## cover, break the combo.
func on_refuse(v, tried_cells: Array[Vector2i] = []) -> void:
	_combo = 0
	if v.has_method("refuse"):
		v.refuse()
	sfx.play("refuse")
	if not tried_cells.is_empty():
		board.flash_bad(tried_cells)
	Fx.shake(self, 4.0, 0.18)


func return_home(v) -> void:
	if v is PieceView:
		var pv: PieceView = v as PieceView
		var from_slot: int = _pick_origin.get("slot", PieceView.Slot.TRAY)
		var from_origin: Vector2i = _pick_origin.get("origin", INVALID)
		var from_id: int = _pick_origin.get("id", -1)
		if from_slot == PieceView.Slot.BOARD and from_origin != INVALID and state.can_place_cells(pv.data.world_cells(from_origin)):
			# Undo of a board -> tray move lands here with the piece still in
			# the tray array; drop that entry so no slot points at a board piece.
			_detach_from_tray(pv)
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
			_detach_from_tray(bv)
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
	# A piece picked up from the tray still holds its slot while it is dragged
	# (or tapped to rotate). Release it first, so it reclaims its own slot
	# below instead of seeing it "taken" by itself and growing the tray.
	_detach_from_tray(v)
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
		_fit_in_tray_slot(pv)
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


## Fit a tray piece's on-screen size/position to its slot, given its CURRENT
## bbox. Shared by _to_tray() (placing a piece into a slot) and on_rotate()
## (a piece already in its slot just changed shape).
##
## The fit covers the piece AND its thought bubble (which pokes out above and
## to the right), so neighbours in the tray never overlap; and the cell size is
## capped so a lone 1-cell piece doesn't balloon next to longer ones.
func _fit_in_tray_slot(pv: PieceView, duration: float = 0.13) -> void:
	var slot_rect := tray.slot_rect_global(pv.tray_index)
	var bbox := Vector2(maxi(pv.data.bbox().x, 1), maxi(pv.data.bbox().y, 1))
	var overhang := Vector2.ZERO
	if int(pv.data.mood) != int(PieceData.Mood.NEUTRAL):
		overhang = Art.thought_overhang_cells()
	var ext := bbox + overhang
	var fit_cell := minf(slot_rect.size.x / ext.x, slot_rect.size.y / ext.y) * TRAY_FIT
	fit_cell = clampf(fit_cell, 12.0, maxf(12.0, tray.slot_size * TRAY_MAX_CELL_FRAC))
	pv.set_cell_size(fit_cell)
	# Centre piece + bubble as one block: the bubble's room sits above and to
	# the right, so the piece itself lands that much lower and further left.
	var global_pos := slot_rect.get_center() - ext * fit_cell * 0.5 \
		+ Vector2(0.0, overhang.y * fit_cell)
	_move(pv, Rect2(global_pos, pv.size), duration)


## Called by DragController after a tray piece rotates -- re-fits it into its
## own slot now that rotate_cw() may have changed its bbox (a non-square
## piece's width/height swap on a 90-degree turn).
func on_rotate(pv: PieceView) -> void:
	_fit_in_tray_slot(pv)


func _detach_from_tray(v) -> void:
	var i := _in_tray.find(v)
	if i != -1:
		_in_tray[i] = null


func _refresh_unhappy() -> void:
	# Check each board piece, and react to CHANGES in mood: a piece that just
	# turned upset puffs and shivers, one that just cheered up hops and hearts.
	var seen := {}
	for id in _on_board:
		var v = _on_board[id]
		if v is PieceView:
			var pv: PieceView = v as PieceView
			var upset := state.piece_violated(pv.data.id)
			pv.set_unhappy(upset)
			seen[id] = true
			if not _quiet_refresh and _prev_violated.get(id, false) != upset:
				_mood_juice(pv, upset)
			_prev_violated[id] = upset
		elif v is BlockView:
			var bv: BlockView = v as BlockView
			bv.set_unhappy(state.is_violated(bv.cell))
	# Also check for single-cell dict keys
	for cell in _on_board:
		if cell is Vector2i:
			var bv2 = _on_board[cell]
			if bv2 is BlockView:
				(bv2 as BlockView).set_unhappy(state.is_violated(cell))
	# Forget pieces that left the board, so re-placing them reacts afresh.
	for id in _prev_violated.keys():
		if not seen.has(id):
			_prev_violated.erase(id)
	# The board occupancy just changed: refresh the ground shadow, and every
	# placed piece's outline fusion (it depends on who its neighbours are).
	board.queue_redraw()
	for id in _on_board:
		var bp = _on_board[id]
		if bp is CanvasItem:
			(bp as CanvasItem).queue_redraw()
	# For polyomino, show remaining PIECES, not empty cells
	var remaining_pieces := 0
	for vv in _in_tray:
		if vv != null:
			remaining_pieces += 1
	# Fallback to empty cells if tray is somehow empty (single-cell shim)
	if remaining_pieces == 0:
		remaining_pieces = state.empty_count()
	hud.set_remaining(remaining_pieces)
	hud.set_diamonds(GameState.diamonds)


func _mood_juice(pv: PieceView, upset: bool) -> void:
	var centre := pv.position + pv.size * 0.5
	if upset:
		pv.shiver()
		pieces.add_child(Fx.puff(centre, Color(0.35, 0.3, 0.55)))
		sfx.play("upset", -3.0)
	else:
		pv.hop()
		pieces.add_child(Fx.hearts_up(centre - Vector2(0, pv.size.y * 0.25)))
		sfx.play("happy", -2.0)


## 0 assists = flawless = 3 stars; 1-2 = 2; 3+ = 1 (never 0 -- finishing at
## all is always rewarded, matching complete_level()'s unconditional diamond
## grant).
func _score_stars() -> int:
	var assists := _hints_used + _undos_used
	if assists == 0:
		return 3
	elif assists <= 2:
		return 2
	else:
		return 1


func _check_win() -> void:
	if not state.is_solved():
		return
	accepting_input = false
	var stars := _score_stars()
	GameState.complete_level(level.level_index, stars, state.snapshot(), GameState.bg_for_level(level.level_index))
	level_solved.emit(level.level_index)
	# Large-tier celebration: a diagonal "happy wave" hops across the board with
	# ^ ^ eyes and sparkles, a headline word pops over the board, confetti
	# cannons fire from both bottom corners, and the screen gives one big shake.
	var board_pieces: Array = []
	for id in _on_board:
		var v = _on_board[id]
		if v is PieceView:
			board_pieces.append(v)
		elif v is BlockView:
			(v as BlockView).pop()
	board_pieces.sort_custom(func(a: PieceView, b: PieceView):
		return a.origin.x + a.origin.y < b.origin.x + b.origin.y)
	for i in board_pieces.size():
		var pv: PieceView = board_pieces[i]
		pv.set_celebrating(true)
		pv.hop(0.15 + i * 0.06)
		var spark_at := pv.position + pv.size * 0.5
		var spark_t := pv.create_tween()
		spark_t.tween_interval(0.15 + i * 0.06)
		spark_t.tween_callback(func():
			if is_instance_valid(pv):
				pieces.add_child(Fx.star_sparkle(spark_at, Color(1, 0.95, 0.6), 7)))
	sfx.play("win_fanfare")
	var headline: String = ["", "Nice!", "Great!", "Perfect!"][clampi(stars, 0, 3)]
	var board_centre := board.global_position + board.origin + \
		Vector2(state.width, state.height) * board.cell_size * 0.5 - global_position
	add_child(Fx.float_text(headline, board_centre, Art.STAR, 92, 60.0, 0.5))
	var vp := get_viewport_rect().size
	add_child(Fx.confetti_cannon(Vector2(-10, vp.y + 10), Vector2(0.45, -1.0)))
	add_child(Fx.confetti_cannon(Vector2(vp.x + 10, vp.y + 10), Vector2(-0.45, -1.0)))
	Fx.shake(self, 10.0, 0.35)
	# A tween bound to this node (not `await create_timer`): if the player leaves
	# the scene during the celebration, the tween dies with the node instead of
	# resuming a coroutine on a freed instance.
	var serial := _load_serial
	var t := create_tween()
	t.tween_interval(1.0)
	t.tween_callback(func():
		# The player (or a test) may have loaded another level while we waited.
		if serial != _load_serial:
			return
		win_panel.show_panel(level.level_index, LevelGenerator.TIERS[level.tier].name,
			stars, GameState.CLEAR_REWARD))


## The win panel's reward count finished: fly gems from it into the HUD chip,
## counting the HUD up as they land.
func _on_reward_burst(from_global: Vector2, amount: int) -> void:
	var target := hud.diamond_target_global()
	var start_value := GameState.diamonds - amount
	var landed := [0]
	var n := clampi(amount, 1, 8)
	Fx.fly_gems(self, from_global, target, n, func():
		landed[0] += 1
		hud.set_diamonds(start_value + int(round(float(amount) * landed[0] / n)))
		sfx.play("diamond_tick", -2.0, 1.0 + landed[0] * 0.05))


func _on_next() -> void:
	# A level transition is the natural break Playgama wants interstitials at;
	# the platform enforces its own minimum gap between them.
	PlatformSdk.show_interstitial()
	load_level(level.level_index + 1)


func _on_menu_pressed() -> void:
	sfx.play("whoosh", -4.0)
	Transition.go(get_tree(), "res://scenes/MainMenu.tscn")


func undo() -> void:
	if _undo.is_empty() or not accepting_input:
		return
	sfx.play("undo")
	_undos_used += 1
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


## A golden double ring where a hint just dropped its piece.
func _hint_flash(pv: PieceView) -> void:
	var pos := board.origin + Vector2(pv.origin) * board.cell_size
	var centre := board.global_position + pos + pv.size * 0.5 - pieces.global_position
	var r := maxf(pv.size.x, pv.size.y) * 0.7
	pieces.add_child(Fx.ring_wave(centre, r, Art.STAR, 12.0))
	var late := Fx.ring_wave(centre, r * 1.3, Color(Art.STAR, 0.7), 8.0)
	late.set("duration", 0.6)
	pieces.add_child(late)
	pieces.add_child(Fx.star_sparkle(centre, Art.STAR, 10, 1.2))


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
	# Check affordability before running the (expensive) solver -- no point
	# solving if the player can't pay for the answer anyway.
	if not GameState.spend_hint():
		hud.flash_message("Not enough diamonds for a hint")
		sfx.play("hint_deny")
		return
	var answer := Solver.new().solve(state, remaining)
	if answer == null:
		# Refund: the player paid for a hint from an already-unsolvable
		# position and got nothing for it. That's a punishing edge case the
		# existing "no way home" toast already surfaces -- the currency
		# shouldn't vanish along with it.
		GameState.diamonds += GameState.HINT_COST
		GameState.save_progress()
		hud.flash_message("No way home from here - try undoing a move")
		return
	sfx.play("hint_use")
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
					_hint_flash(pv)
					_hints_used += 1
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
					_hint_flash(pv2)
					_hints_used += 1
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
					_hints_used += 1
					return
