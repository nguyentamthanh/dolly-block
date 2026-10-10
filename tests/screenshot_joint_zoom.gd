extends SceneTree

## Zoom-in screenshot of a single horizontal joint between two DIFFERENT
## polyominoes on the board. Used to verify the outline thickness is uniform
## at the joint (i.e. the same as the outer edges, not a doubled dark band).

var _frames := 0
var _out := "user://shot_joint_zoom.png"


func _initialize() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() > 0:
		_out = args[0]
	root.set_content_scale_size(Vector2i(1080, 1080))  # square so the joint
	# sits clearly across the centre.

	var packed: PackedScene = load("res://scenes/Main.tscn")
	var game := packed.instantiate() as LevelController
	root.add_child(game)
	await process_frame
	# Three pieces: a 2-cell horizontal at top, a 2-cell horizontal directly
	# below it, plus a third adjacent block to the side so we can see both
	# the joint AND a non-joint edge in the same shot.
	var pd1 := PieceData.make(201, Palette.Hue.PINK, [Vector2i(0, 0), Vector2i(1, 0)],
		PieceData.Mood.NEUTRAL, 0)
	var pd2 := PieceData.make(202, Palette.Hue.YELLOW, [Vector2i(0, 0), Vector2i(1, 0)],
		PieceData.Mood.NEUTRAL, 0)
	var pd3 := PieceData.make(203, Palette.Hue.BLUE, [Vector2i(0, 0), Vector2i(1, 0)],
		PieceData.Mood.NEUTRAL, 0)
	game.state.place_piece(pd1, Vector2i(0, 0))
	game.state.place_piece(pd2, Vector2i(0, 2))
	game.state.place_piece(pd3, Vector2i(2, 0))
	for pair in [[pd1, Vector2i(0, 0)], [pd2, Vector2i(0, 2)], [pd3, Vector2i(2, 0)]]:
		var pd: PieceData = pair[0]
		var origin: Vector2i = pair[1]
		var v := PieceView.new()
		game.pieces.add_child(v)
		v.setup(pd, false)
		v.board_state = game.state
		v.origin = origin
		v.slot = PieceView.Slot.BOARD
		game._on_board[pd.id] = v
	game.board.relayout()
	game._relayout(0.0)


func _process(_delta: float) -> bool:
	_frames += 1
	if _frames < 8:
		return false
	var img := root.get_texture().get_image()
	var err := img.save_png(_out)
	print("screenshot -> %s (err %d)" % [_out, err])
	return true
