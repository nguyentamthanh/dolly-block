extends SceneTree

## Captures the in-game effects that only exist mid-play:
##   <prefix>_ghost.png -- a tray piece hovering over a legal spot (drop ghost)
##   <prefix>_win.png   -- the level-complete panel after the star sequence
## Usage (needs a renderer, so no --headless):
##   godot --path . --script res://tests/screenshot_win.gd -- shots/hc <level>

var _out_prefix := "user://shot_win"
var _level := 0
var _game: LevelController
var _elapsed := 0.0
var _stage := 0


func _initialize() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() > 0:
		_out_prefix = args[0]
	if args.size() > 1:
		_level = int(args[1])
	root.set_content_scale_size(Vector2i(720, 1280))
	GameState.ensure_loaded()
	GameState.current_level = _level
	GameState.diamonds = 9999
	_game = (load("res://scenes/Main.tscn") as PackedScene).instantiate()
	root.add_child(_game)


func _process(delta: float) -> bool:
	_elapsed += delta
	match _stage:
		0:
			if _elapsed > 1.6:
				_show_ghost()
				_stage = 1
				_elapsed = 0.0
		1:
			if _elapsed > 0.3:
				_save("ghost")
				_game.board.clear_highlight()
				_solve()
				_stage = 2
				_elapsed = 0.0
		2:
			# Win wave (1.0s) + panel entry + three star slams + gem count.
			if _elapsed > 3.4:
				_save("win")
				quit()
	return false


## Hover the first tray piece over its solution spot, the way a drag would.
func _show_ghost() -> void:
	for v in _game._in_tray:
		var pv := v as PieceView
		if pv == null:
			continue
		var origin := pv.data.orient_to_solution()
		var world := pv.data.world_cells(origin)
		_game.board.set_preview(world, true, true, Palette.fill(pv.data.color))
		return


func _solve() -> void:
	var guard := 0
	while _game.state.empty_count() > 0 and guard < 60:
		guard += 1
		_game.hint()


func _save(label: String) -> void:
	var path := "%s_%s.png" % [_out_prefix, label]
	var err := root.get_texture().get_image().save_png(path)
	print("screenshot -> %s (err %d)" % [path, err])
