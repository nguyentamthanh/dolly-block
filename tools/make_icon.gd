extends SceneTree

## Renders the game icon with the game's own code-drawn art, so it always
## matches the in-game look. Needs a renderer (no --headless):
##   godot --path . --script res://tools/make_icon.gd
## Writes:
##   assets/icon/icon_full.png  1024, full-bleed square (Android adaptive / stores)
##   assets/icon/icon.png       1024, rounded-square mask, transparent corners
##   assets/icon/icon_512.png   512, same as icon.png

const SIZE := 1024
const OUT_DIR := "res://assets/icon"
const CORNER_FRAC := 0.22

var _vp: SubViewport
var _frames := 0


func _initialize() -> void:
	_vp = SubViewport.new()
	_vp.size = Vector2i(SIZE, SIZE)
	_vp.transparent_bg = true
	_vp.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	root.add_child(_vp)

	var bg := ColorRect.new()
	bg.size = Vector2(SIZE, SIZE)
	var bm := ShaderMaterial.new()
	bm.shader = load("res://shaders/bg_sky.gdshader")
	bm.set_shader_parameter("top_color", Art.SKY_TOP)
	bm.set_shader_parameter("mid_color", Art.SKY_MID)
	bm.set_shader_parameter("bottom_color", Art.SKY_BOTTOM)
	bm.set_shader_parameter("size_px", Vector2(SIZE, SIZE))
	bm.set_shader_parameter("cell", 210.0)
	bm.set_shader_parameter("speed", 0.0)
	bm.set_shader_parameter("pattern_alpha", 0.10)
	bg.material = bm
	_vp.add_child(bg)

	var burst := ColorRect.new()
	burst.size = Vector2(1500, 1500)
	burst.position = Vector2(512, 540) - burst.size * 0.5
	var sm := ShaderMaterial.new()
	sm.shader = load("res://shaders/sunburst.gdshader")
	sm.set_shader_parameter("ray_color", Color(1, 1, 1, 0.28))
	sm.set_shader_parameter("rays", 12.0)
	sm.set_shader_parameter("speed", 0.0)
	burst.material = sm
	_vp.add_child(burst)

	var art := Control.new()
	art.size = Vector2(SIZE, SIZE)
	art.draw.connect(func(): _draw_art(art))
	_vp.add_child(art)


func _draw_art(ci: Control) -> void:
	var one: Array[Vector2i] = [Vector2i.ZERO]
	# Two friends tucked behind the hero, tilted in, happy-eyed.
	_tilted_block(ci, Vector2(232, 790), 215.0, -0.26, Palette.Hue.PINK, true)
	_tilted_block(ci, Vector2(808, 812), 190.0, 0.22, Palette.Hue.BLUE, true)

	# The hero: one big glossy yellow block in love with pink.
	var cs := 470.0
	var origin := Vector2(512 - cs * 0.5, 545 - cs * 0.5)
	Art.draw_polyomino(ci, origin, cs, one, Palette.Hue.YELLOW, Vector2i.ZERO,
		PieceData.Mood.AFFECTIONATE, Palette.Hue.PINK, false, 1.0, [], 0.0, false, 1.0, true)
	# Rosy cheeks under the eyes, and a little smile between them.
	for side in [-1.0, 1.0]:
		ci.draw_circle(origin + Vector2(cs * 0.5 + side * cs * 0.37, cs * 0.81), cs * 0.06,
			Color(1.0, 0.45, 0.5, 0.5))
	ci.draw_arc(origin + Vector2(cs * 0.5, cs * 0.76), cs * 0.07, PI * 0.15, PI * 0.85, 16,
		Art.INK, cs * 0.022, true)

	# Twinkles.
	Art.draw_star_fancy(ci, Vector2(170, 250), 58.0, true)
	Art.draw_star_fancy(ci, Vector2(890, 560), 36.0, true)
	_glint(ci, Vector2(250, 470), 34.0)
	_glint(ci, Vector2(840, 400), 24.0)
	_glint(ci, Vector2(700, 930), 28.0)


func _tilted_block(ci: Control, centre: Vector2, cs: float, angle: float, hue: int, happy: bool) -> void:
	var one: Array[Vector2i] = [Vector2i.ZERO]
	ci.draw_set_transform(centre, angle, Vector2.ONE)
	Art.draw_polyomino(ci, Vector2(-cs * 0.5, -cs * 0.5), cs, one, hue, Vector2i.ZERO,
		PieceData.Mood.NEUTRAL, 0, false, 1.0, [], 0.0, happy, 1.0, true)
	ci.draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)


## Four-point white sparkle.
func _glint(ci: Control, c: Vector2, r: float) -> void:
	var pts := PackedVector2Array()
	for i in 8:
		var a := -PI * 0.5 + i * PI / 4.0
		var rr := r if i % 2 == 0 else r * 0.22
		pts.append(c + Vector2(cos(a), sin(a)) * rr)
	ci.draw_colored_polygon(pts, Color(1, 1, 1, 0.95))


func _process(_delta: float) -> bool:
	_frames += 1
	if _frames < 8:
		return false
	var img := _vp.get_texture().get_image()
	img.convert(Image.FORMAT_RGBA8)
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(OUT_DIR))
	_save(img, "icon_full.png")
	var masked := _rounded(img)
	_save(masked, "icon.png")
	var small := masked.duplicate() as Image
	small.resize(512, 512, Image.INTERPOLATE_LANCZOS)
	_save(small, "icon_512.png")
	quit()
	return true


## Rounded-square alpha mask with a 1.5px anti-aliased edge.
func _rounded(src: Image) -> Image:
	var img := src.duplicate() as Image
	var r := SIZE * CORNER_FRAC
	var half := SIZE * 0.5
	for y in SIZE:
		for x in SIZE:
			var p := Vector2(x + 0.5 - half, y + 0.5 - half)
			var q := Vector2(absf(p.x), absf(p.y)) - Vector2(half - r, half - r)
			var d := Vector2(maxf(q.x, 0.0), maxf(q.y, 0.0)).length() + minf(maxf(q.x, q.y), 0.0) - r
			var a := clampf(0.5 - d / 1.5, 0.0, 1.0)
			if a < 1.0:
				var c := img.get_pixel(x, y)
				c.a *= a
				img.set_pixel(x, y, c)
	return img


func _save(img: Image, name: String) -> void:
	var path := ProjectSettings.globalize_path(OUT_DIR.path_join(name))
	var err := img.save_png(path)
	print("icon -> %s (err %d)" % [path, err])
