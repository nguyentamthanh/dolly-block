extends SceneTree

## Renders store cover images (Playgama asks for 1:1, 9:16 and 16:9) from the
## main menu's own art: sky, sunburst, bouncing logo and googly pieces, with
## the buttons and top bar hidden. Needs a renderer (no --headless):
##   godot --path . --script res://tools/make_covers.gd -- <out_dir>
## Writes cover_square.png (800x800), cover_portrait.png (1080x1920) and
## cover_landscape.png (1920x1080) into <out_dir> (default user://).

## size: output pixels; logical: the canvas the menu lays itself out in,
## scaled up to `size` (keeps the logo the same share of the frame as in-game).
const JOBS := [
	{"name": "cover_square", "size": Vector2i(800, 800), "logical": Vector2i(720, 720)},
	{"name": "cover_portrait", "size": Vector2i(1080, 1920), "logical": Vector2i(720, 1280)},
	{"name": "cover_landscape", "size": Vector2i(1920, 1080), "logical": Vector2i(1280, 720)},
]
## Long enough for the logo's pop-in to settle.
const SETTLE_SECONDS := 1.6

var _out_dir := "user://"
var _job_index := 0
var _vp: SubViewport
var _elapsed := 0.0
var _frames := 0


func _initialize() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() > 0:
		_out_dir = args[0]
	_start_job()


func _start_job() -> void:
	if _vp != null:
		_vp.queue_free()
		_vp = null
	if _job_index >= JOBS.size():
		quit()
		return
	var job: Dictionary = JOBS[_job_index]
	_vp = SubViewport.new()
	_vp.size = job.size
	_vp.size_2d_override = job.logical
	_vp.size_2d_override_stretch = true
	_vp.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	root.add_child(_vp)
	_vp.add_child(load("res://scenes/MainMenu.tscn").instantiate())
	_elapsed = 0.0
	_frames = 0


## Keeps only the painted art: hides the "Ui" layer (top bar, PLAY, PHOTOS) so
## the cover carries no tappable-looking UI.
func _strip_ui(menu: MainMenuScreen) -> void:
	var ui := menu.get_node_or_null("Ui")
	if ui != null:
		(ui as CanvasItem).visible = false


func _process(delta: float) -> bool:
	if _vp == null:
		return false
	_frames += 1
	_elapsed += delta
	# The menu builds its UI in _ready(), which hasn't run yet when
	# _start_job() is called from _initialize().
	if _frames == 1:
		_strip_ui(_vp.get_child(0) as MainMenuScreen)
	if _frames < 6 or _elapsed < SETTLE_SECONDS:
		return false
	var job: Dictionary = JOBS[_job_index]
	var path := _out_dir.path_join(job.name + ".png")
	var err := _vp.get_texture().get_image().save_png(path)
	print("cover -> %s (err %d)" % [path, err])
	_job_index += 1
	_start_job()
	return false
