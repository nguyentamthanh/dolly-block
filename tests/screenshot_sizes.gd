extends SceneTree

## Renders each screen at a range of device shapes, in an offscreen
## SubViewport (so the size isn't limited by the monitor), to check the
## responsive layout. Logical sizes follow the project's stretch rule
## (canvas_items + expand, base 720x1280): the short side never drops below
## the base, the long side grows with the device aspect.
## Usage (needs a renderer):
##   godot --path . --script res://tests/screenshot_sizes.gd -- shots/sz

const SIZES := {
	"phone_9x16": Vector2i(720, 1280),
	"phone_9x20": Vector2i(720, 1600),
	"tablet_3x4": Vector2i(960, 1280),
	"square_1x1": Vector2i(1280, 1280),
	"tablet_4x3": Vector2i(1707, 1280),
	"desktop_16x9": Vector2i(2276, 1280),
}
const SCENES := {
	"timeline": "res://scenes/Timeline.tscn",
	"game": "res://scenes/Main.tscn",
}
const SETTLE := 1.8

var _prefix := "user://sz"
var _jobs: Array = []
var _vp: SubViewport
var _t := 0.0


func _initialize() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() > 0:
		_prefix = args[0]
	GameState.ensure_loaded()
	GameState.highest_unlocked = 12
	GameState.current_level = 30
	for s in SIZES:
		for sc in SCENES:
			_jobs.append([s, sc])
	_next()


func _next() -> void:
	if _vp != null:
		_vp.queue_free()
		_vp = null
	if _jobs.is_empty():
		quit()
		return
	var job: Array = _jobs[0]
	_vp = SubViewport.new()
	_vp.size = SIZES[job[0]]
	_vp.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	root.add_child(_vp)
	_vp.add_child((load(SCENES[job[1]]) as PackedScene).instantiate())
	_t = 0.0


func _process(delta: float) -> bool:
	if _vp == null:
		return false
	_t += delta
	if _t < SETTLE:
		return false
	var job: Array = _jobs.pop_front()
	var path := "%s_%s_%s.png" % [_prefix, job[0], job[1]]
	var img := _vp.get_texture().get_image()
	# Keep files light: scale to 640px on the long side.
	var k := 640.0 / float(maxi(img.get_width(), img.get_height()))
	img.resize(int(img.get_width() * k), int(img.get_height() * k), Image.INTERPOLATE_LANCZOS)
	print("shot -> %s (err %d)" % [path, img.save_png(path)])
	_next()
	return false
