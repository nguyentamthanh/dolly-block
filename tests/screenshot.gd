extends SceneTree

## Renders the real game to a PNG so the art can be inspected without a human
## sitting in front of it. Must NOT be run with --headless (no rendering there).
##
##   godot --script res://tests/screenshot.gd -- <out.png> [level]

var _frames := 0
var _game: LevelController
var _out := "user://shot.png"
var _level := 0


func _initialize() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() > 0:
		_out = args[0]
	if args.size() > 1:
		_level = int(args[1])

	root.set_content_scale_size(Vector2i(720, 1280))
	GameState.current_level = _level

	var packed: PackedScene = load("res://scenes/Main.tscn")
	_game = packed.instantiate() as LevelController
	root.add_child(_game)


func _process(_delta: float) -> bool:
	_frames += 1
	# Let layout settle and the entry tweens finish before capturing.
	if _frames < 30:
		return false
	var img := root.get_texture().get_image()
	var err := img.save_png(_out)
	print("screenshot -> %s (err %d, %dx%d)" % [_out, err, img.get_width(), img.get_height()])
	return true
