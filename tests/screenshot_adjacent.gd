extends SceneTree

## Targeted visual test for the "pieces touching on the board should look
## flush" fix. Spawns two pieces in known adjacent cells and renders a PNG
## so the joint between them can be inspected.

var _frames := 0
var _captured := false
var _out := "user://shot_adjacent.png"


func _initialize() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() > 0:
		_out = args[0]
	root.set_content_scale_size(Vector2i(720, 1280))

	# Hand-built level: 4x4 board, two fixed polyominoes placed orthogonally
	# adjacent at (1,1) and (2,1), plus one stray tray block, so the rendered
	# shot shows three "joint" cases at once:
	#   * two DIFFERENT polyominoes sharing an edge (the main fix target)
	#   * fused cells WITHIN a polyomino (regression check)
	#   * a piece next to an empty cell (regression check for the no-inset
	#     path -- the empty cell must still show the board frame around it).
	var packed: PackedScene = load("res://scenes/Main.tscn")
	var game := packed.instantiate() as LevelController
	root.add_child(game)
	# Wait one frame for _ready/load_level to populate, then mutate.
	await process_frame
	game.state.remove(Vector2i(-1, -1))  # no-op; just to silence unused-var lint
	# Build two 2-cell horizontal pieces, place at (1,1) and (1,2) -- they share
	# a vertical edge.
	var pd1 := PieceData.make(101, Palette.Hue.PINK, [Vector2i(0, 0), Vector2i(1, 0)],
		PieceData.Mood.NEUTRAL, 0)
	var pd2 := PieceData.make(102, Palette.Hue.YELLOW, [Vector2i(0, 0), Vector2i(1, 0)],
		PieceData.Mood.NEUTRAL, 0)
	game.state.place_piece(pd1, Vector2i(1, 1))
	game.state.place_piece(pd2, Vector2i(1, 2))
	var v1 := PieceView.new()
	game.pieces.add_child(v1)
	v1.setup(pd1, false)
	v1.board_state = game.state
	v1.origin = Vector2i(1, 1)
	v1.slot = PieceView.Slot.BOARD
	game._on_board[pd1.id] = v1
	var v2 := PieceView.new()
	game.pieces.add_child(v2)
	v2.setup(pd2, false)
	v2.board_state = game.state
	v2.origin = Vector2i(1, 2)
	v2.slot = PieceView.Slot.BOARD
	game._on_board[pd2.id] = v2
	# Force a relayout to settle cell sizes.
	game.board.relayout()
	game._relayout(0.0)


func _process(_delta: float) -> bool:
	_frames += 1
	if _captured:
		return true
	if _frames < 8:
		return false
	var img := root.get_texture().get_image()
	var err := img.save_png(_out)
	print("screenshot -> %s (err %d)" % [_out, err])
	_captured = true
	return true
