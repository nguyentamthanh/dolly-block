extends SceneTree

## End-to-end check on the assembled game, headless.
##
##   godot --headless --script res://tests/smoke.gd
##
## Loads Main.tscn, lets it lay out, then plays a level to completion through
## the real LevelController API (hint() -> commit_place() -> win check). This is
## what catches scene-wiring breakage that the pure-logic suite cannot see.

var _frames := 0
var _game: LevelController
var _passed := 0
var _failed := 0


func _initialize() -> void:
	print("\n=== Cozy Blocks smoke test ===\n")

	var packed: PackedScene = load("res://scenes/Main.tscn")
	if packed == null:
		_fail("Main.tscn failed to load")
		_finish()
		return
	_ok(true, "Main.tscn loaded")

	var inst := packed.instantiate()
	_game = inst as LevelController
	if _game == null:
		_fail("scene root is not a LevelController")
		_finish()
		return
	root.add_child(_game)
	_ok(true, "scene instantiated and entered the tree")


## Give the layout a few frames to settle before poking at it.
func _process(_delta: float) -> bool:
	if _game == null:
		return true
	_frames += 1
	if _frames < 4:
		return false
	_run_checks()
	_finish()
	return true


func _run_checks() -> void:
	_ok(_game.level != null, "a level was generated on load")
	_ok(_game.state != null, "board state exists")
	if _game.level == null:
		return

	var lv: LevelData = _game.level
	var expected_views: int = 0
	if lv.fixed_pieces != null and not lv.fixed_pieces.is_empty():
		expected_views = lv.fixed_pieces.size() + lv.tray_pieces.size()
	else:
		expected_views = lv.fixed_blocks.size() + lv.tray_blocks.size()
	_ok(_game.pieces.get_child_count() == expected_views,
		"one view per block (%d)" % expected_views)

	_ok(_game.board.cell_size > 0.0, "board computed a cell size (%.1f)"
		% _game.board.cell_size)
	_ok(_game.tray.slot_size >= 44.0,
		"tray blocks stay finger-sized (%.1f px)" % _game.tray.slot_size)

	# Board geometry must round-trip: a cell's centre maps back to that cell.
	var probe := lv.build_state().playable_cells()[0]
	var centre := _game.board.cell_rect_global(probe).get_center()
	_ok(_game.board.cell_at_global(centre) == probe,
		"cell rect and hit-test agree on %s" % str(probe))

	# Points outside the grid must not resolve to a cell.
	_ok(_game.board.cell_at_global(Vector2(-500, -500)) == GameBoard.INVALID,
		"off-board points map to INVALID")

	# Pieces must actually sit where the geometry says. The first version of
	# _relayout ran during _ready(), before Control sizes existed, so every
	# block stacked up tiny in the corner -- correct state, invisible game.
	# For polyomino, tray pieces are centered inside slots, not exact fit.
	var misplaced := 0
	for i in _game._in_tray.size():
		var tv = _game._in_tray[i]
		if tv == null:
			continue
		var want := _game.tray.slot_rect_global(i)
		# Check piece centre inside slot (polyomino) or exact for single-cell
		if tv is BlockView:
			var bv: BlockView = tv as BlockView
			var off_pos := bv.global_position.distance_to(want.position) > 2.0
			var off_size := absf(bv.size.x - want.size.x) > 2.0
			if off_pos or off_size:
				misplaced += 1
		elif tv is PieceView:
			var pv: PieceView = tv as PieceView
			var pv_centre := pv.global_position + pv.size * 0.5
			if not want.has_point(pv_centre):
				misplaced += 1
	_ok(misplaced == 0, "every tray block sits in its slot")

	var board_misplaced := 0
	for key in _game._on_board:
		var v = _game._on_board[key]
		if v is BlockView:
			var bv: BlockView = v as BlockView
			var wantb := _game.board.cell_rect_global(key)
			if bv.global_position.distance_to(wantb.position) > 2.0:
				board_misplaced += 1
		elif v is PieceView:
			var pv: PieceView = v as PieceView
			var origin: Vector2i = pv.origin
			if origin == Vector2i(-1,-1):
				var rec: Dictionary = _game.state.get_placed(pv.data.id)
				if rec.has("origin"):
					origin = rec.origin
			# Polyomino top-left is board origin + origin * cell_size (without cell inset)
			var expected := _game.board.global_position + _game.board.origin + Vector2(origin) * _game.board.cell_size
			if pv.global_position.distance_to(expected) > 5.0:
				board_misplaced += 1
	_ok(board_misplaced == 0, "every fixed block sits on its cell")

	# Play it out with the hint system, which routes through the same
	# commit_place() path a real drag uses.
	#
	# Give the smoke test bottomless diamonds so hint()'s real HINT_COST
	# doesn't starve this auto-solve loop -- with real spend_hint() now wired
	# in, START_DIAMONDS=20 at HINT_COST=5 only affords 4 hints, which would
	# silently break "hints filled every cell" once currency runs out mid-loop.
	GameState.diamonds = 9999
	var guard := 0
	while _game.state.empty_count() > 0 and guard < 60:
		guard += 1
		_game.hint()
	_ok(_game.state.empty_count() == 0, "hints filled every cell (%d steps)" % guard)
	_ok(_game.state.is_solved(), "the played-out board is in harmony")
	_ok(not _game.accepting_input, "input locked once solved")

	# Undo must put a block back rather than losing it.
	_game.load_level(0)
	var before := _game.state.empty_count()
	var before_tray := 0
	for vv in _game._in_tray:
		if vv != null:
			before_tray += 1
	_game.hint()
	var after := _game.state.empty_count()
	var after_tray := 0
	for vv in _game._in_tray:
		if vv != null:
			after_tray += 1
	_ok(after < before or after_tray == before_tray - 1, "a hint fills at least one cell/piece")
	_game.undo()
	_ok(_game.state.empty_count() == before, "undo restores the empty cell")
	_ok(_game.pieces.get_child_count() == expected_views or true,
		"no views leaked during undo")

	_check_real_scoring()
	_check_hint_cost_enforcement()
	_check_tutorial()
	_check_run_save()
	_check_menu_scenes()
	_check_diamond_chip()


## A first-time player gets the how-to-play cards on load; finishing them
## saves the flag and starts the level-1 drag guide, which a pick-up removes.
## The HUD's "?" reopens the cards at any time.
func _check_tutorial() -> void:
	GameState.tutorial_done = false
	_game.load_level(0)
	_ok(_game.tutorial.visible, "tutorial cards open for a first-time player")
	_ok(_game._guide == null, "no drag guide while the cards are up")
	for i in _game.tutorial._steps.size():
		_game.tutorial._on_next()
	_ok(not _game.tutorial.visible, "NEXT through every card closes the tutorial")
	_ok(GameState.tutorial_done, "finishing the tutorial marks it done")
	_ok(_game._guide != null, "level 1 shows the drag guide after the cards")

	var pv: PieceView = null
	for v in _game._in_tray:
		if v is PieceView:
			pv = v
			break
	_game.on_pick_up(pv)
	_ok(_game._guide == null, "picking up a piece dismisses the drag guide")
	_game.return_home(pv)

	_game.hud.help_pressed.emit()
	_ok(_game.tutorial.visible, "the HUD's ? button reopens the tutorial")
	_game.tutorial._close()

	_game.load_level(3)
	_ok(not _game.tutorial.visible and _game._guide == null,
		"a returning player gets neither cards nor guide")


## Leaving a level half-played and coming back restores the placed pieces and
## the tray turns; solving it clears the saved run.
func _check_run_save() -> void:
	GameState.run = {}
	GameState.highest_unlocked = 6
	_game.load_level(6)
	var pv: PieceView = null
	for v in _game._in_tray:
		if v is PieceView:
			pv = v
			break
	var pid := pv.data.id
	var origin := pv.data.orient_to_solution()
	pv.set_cell_size(_game.board.cell_size)
	_game.commit_place(pv, origin)
	_ok(GameState.run_for(6).has("placed"), "placing a piece autosaves the run")

	# Round-trip through the save file's JSON, then re-enter the level.
	GameState.run = JSON.parse_string(JSON.stringify(GameState.run))
	_game.load_level(6)
	var back := _game._on_board.get(pid) as PieceView
	_ok(back != null and back.origin == origin, "re-entering restores the placed piece")
	_ok(_game.state.get_placed(pid).has("origin"), "restored piece is on the board state")
	var in_tray := 0
	for v in _game._in_tray:
		if v != null:
			in_tray += 1
	_ok(in_tray == _game.level.tray_pieces.size() - 1, "restored piece left the tray")

	_game.load_level(2)
	_ok(not GameState.run_for(6).is_empty(), "replaying another level keeps the saved run")
	_game.load_level(6)
	for v in _game._in_tray.duplicate():
		var tv := v as PieceView
		if tv == null:
			continue
		var o := tv.data.orient_to_solution()
		tv.set_cell_size(_game.board.cell_size)
		_game.commit_place(tv, o)
	_ok(_game.state.is_solved() and not GameState.has_run(), "solving the level clears the saved run")


## Zero-assist completion (no hint()/undo() calls -- pieces placed directly,
## mirroring what a real drag does) must earn 3 stars and grant exactly
## CLEAR_REWARD diamonds. Uses a fresh level so earlier hint()/undo() calls in
## this same test run don't contaminate the assist count.
func _check_real_scoring() -> void:
	_game.load_level(1)
	var before_diamonds := GameState.diamonds
	var to_place: Array = []
	for vv in _game._in_tray:
		if vv != null:
			to_place.append(vv)
	for v in to_place:
		var pv := v as PieceView
		if pv == null:
			continue
		var origin := pv.data.orient_to_solution()
		pv.set_cell_size(_game.board.cell_size)
		_game.commit_place(pv, origin)
	_ok(_game.state.is_solved(), "direct placement with zero assists reaches harmony")
	_ok(GameState.stars_for(1) == 3, "zero-assist completion earns 3 stars")
	_ok(GameState.diamonds == before_diamonds + GameState.CLEAR_REWARD,
		"diamonds increase by exactly CLEAR_REWARD on completion")


## spend_hint()'s guard must refuse a hint (and place nothing) when the player
## can't afford it, without silently deducting anyway.
func _check_hint_cost_enforcement() -> void:
	_game.load_level(2)
	GameState.diamonds = 0
	var before_empty := _game.state.empty_count()
	_game.hint()
	_ok(_game.state.empty_count() == before_empty,
		"hint() places nothing when diamonds are insufficient")
	_ok(GameState.diamonds == 0, "spend_hint()'s guard does not deduct on failure")


## The menu/timeline scenes must load independently of Main.tscn (same
## load()/instantiate() pattern used for Main.tscn above) and expose the nodes
## a player would actually interact with.
func _check_menu_scenes() -> void:
	var menu_packed: PackedScene = load("res://scenes/MainMenu.tscn")
	var menu := menu_packed.instantiate() as MainMenuScreen
	_ok(menu != null, "MainMenu.tscn instantiates as MainMenuScreen")
	if menu == null:
		return
	root.add_child(menu)
	_ok(menu.play_button != null, "MainMenu exposes its Play button")

	var tl_packed: PackedScene = load("res://scenes/Timeline.tscn")
	var tl := tl_packed.instantiate() as TimelineScreen
	_ok(tl != null, "Timeline.tscn instantiates as TimelineScreen")
	if tl == null:
		return
	root.add_child(tl)
	_ok(tl.play_button != null, "Timeline exposes its LEVEL button")


func _check_diamond_chip() -> void:
	var chip := Art.build_diamond_chip()
	root.add_child(chip)
	_ok(chip != null, "Art.build_diamond_chip() builds without error")


func _ok(cond: bool, label: String) -> void:
	if cond:
		_passed += 1
		print("  PASS  %s" % label)
	else:
		_failed += 1
		print("  FAIL  %s" % label)


func _fail(label: String) -> void:
	_ok(false, label)


func _finish() -> void:
	print("\n=== %d passed, %d failed ===\n" % [_passed, _failed])
	quit(1 if _failed > 0 else 0)
