extends SceneTree

## Captures one PNG per UI screen (menu, level-select, game) so the redesign
## can be inspected without booting the game in the editor.
## Usage:
##   godot --script res://tests/screenshot_ui.gd -- <out_prefix>

## Scene capture jobs: {label, scene_path, setup_fn_name_or_null}.
## A job's setup_fn runs after instantiate() and before the capture, so we
## can poke GameState per scene (e.g. unlock a few levels for level-select)
## without leaking state between captures.
var _jobs := [
	{"label": "menu", "path": "res://scenes/MainMenu.tscn"},
	{"label": "levelselect", "path": "res://scenes/LevelSelect.tscn",
		"setup": "_setup_levelselect"},
	{"label": "game", "path": "res://scenes/Main.tscn",
		"setup": "_setup_game"},
]
var _job_index := 0
var _out_prefix := "user://shot_ui"
var _frames := 0
var _elapsed := 0.0
## Long enough for each screen's pop-in / intro choreography to settle.
const SETTLE_SECONDS := 1.8


func _initialize() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() > 0:
		_out_prefix = args[0]
	root.set_content_scale_size(Vector2i(720, 1280))
	_load_next_job()


func _load_next_job() -> void:
	# Tear down the previous scene before loading the next, otherwise they
	# stack on top of each other in the root and the later one wins the
	# viewport -- which is what caused every shot to look like "game" in the
	# first version of this script.
	for c in root.get_children():
		c.queue_free()
	_frames = 0
	_elapsed = 0.0
	if _job_index >= _jobs.size():
		quit()
		return
	var job: Dictionary = _jobs[_job_index]
	var setup_name: String = job.get("setup", "")
	if setup_name != "":
		call(setup_name)
	var packed: PackedScene = load(job.path)
	if packed == null:
		print("missing scene: ", job.path)
		_job_index += 1
		_load_next_job()
		return
	var node := packed.instantiate()
	root.add_child(node)


func _setup_levelselect() -> void:
	# Unlock the first 7 levels with mixed stars so the screenshot shows
	# locked/unlocked/cleared states -- the full visual taxonomy.
	GameState.highest_unlocked = 6
	GameState.stars_at = {"0": 3, "1": 3, "2": 3, "3": 2, "4": 2, "5": 1}
	GameState.diamonds = 47


func _setup_game() -> void:
	GameState.current_level = 0
	GameState.highest_unlocked = 6
	GameState.stars_at = {"0": 3, "1": 3, "2": 3, "3": 2, "4": 2, "5": 1}
	GameState.diamonds = 47


func _process(delta: float) -> bool:
	_frames += 1
	_elapsed += delta
	# Wait for layout + draw passes AND the screen's intro animation to settle.
	if _frames < 6 or _elapsed < SETTLE_SECONDS:
		return false
	var job: Dictionary = _jobs[_job_index]
	var path := "%s_%s.png" % [_out_prefix, job.label]
	var img := root.get_texture().get_image()
	var err := img.save_png(path)
	print("screenshot -> %s (err %d)" % [path, err])
	_job_index += 1
	_load_next_job()
	return false
