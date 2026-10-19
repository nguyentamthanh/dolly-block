class_name LevelCompletePanel
extends Control

## The win screen is a photo shoot. The camera flashes, a polaroid of the solved
## board drops in over a painted scene ("# 064", three stars popping in one by
## one), a pill reads "Well done! You've earned N gems", and the arrows swap the
## photo's backdrop for any scene the player owns. CONTINUE hangs the photo on
## the timeline and moves on.
##
## Kept non-blocking: CONTINUE is tappable from the first frame, and the whole
## choreography settles in about 1.5 seconds.

signal next_pressed
## Emitted once the reward count finishes, with the global position of the
## reward gem, so the game can fly gems into the HUD counter.
signal reward_burst(from_global: Vector2, amount: int)

const PHOTO_MAX_W := 440.0
const PHOTO_MIN_W := 230.0

var _cream: ColorRect
var _flash: ColorRect
var _column: VBoxContainer
var _pill_label: Label
var _count_label: Label
var _gem_icon: Control
var _holder: Control
var _photo: PhotoCard
var _prev: Button
var _forward: Button
var _continue: Button
var _sfx: Sfx

var _index := 0
var _stars := 0
var _finder: Control
var _finder_k := 0.0
var _blade_top: ColorRect
var _blade_bottom: ColorRect

var _entry_tween: Tween
var _post: Tween
var _seq: Tween
var _count_tween: Tween
var _last_shown := -1


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP  # swallow drags underneath
	# Above every piece layer (resting pieces sit at z 0..18, effects at 20,
	# a dragged piece at 100) and the floating headline text (200).
	z_index = 250

	_cream = ColorRect.new()
	_cream.color = Art.CREAM
	_cream.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_cream.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_cream)

	var center := CenterContainer.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	center.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(center)

	_column = VBoxContainer.new()
	_column.add_theme_constant_override("separation", 40)
	_column.alignment = BoxContainer.ALIGNMENT_CENTER
	_column.mouse_filter = Control.MOUSE_FILTER_IGNORE
	center.add_child(_column)

	_column.add_child(_build_pill())
	_column.add_child(_build_photo_row())

	_continue = Button.new()
	_continue.text = Loc.t("continue")
	_continue.focus_mode = Control.FOCUS_NONE
	_continue.custom_minimum_size = Vector2(250, 76)
	_continue.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	_continue.add_theme_font_size_override("font_size", 30)
	Art.style_button(_continue, Art.HUD_BROWN, 500.0, true)
	UiFx.juicy(_continue)
	_continue.pressed.connect(func():
		if _sfx != null:
			_sfx.play("button_tap")
		next_pressed.emit())
	_column.add_child(_continue)

	# The viewfinder brackets, drawn over the still-visible game board.
	_finder = Control.new()
	_finder.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_finder.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_finder.draw.connect(_draw_finder)
	add_child(_finder)

	# The camera flash, over the page.
	_flash = ColorRect.new()
	_flash.color = Color.WHITE
	_flash.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_flash.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_flash.modulate.a = 0.0
	add_child(_flash)

	# Shutter blades: two dark bars that slam together from the top and bottom
	# edges. Positioned by _set_shutter, never by anchors.
	_blade_top = ColorRect.new()
	_blade_bottom = ColorRect.new()
	for blade in [_blade_top, _blade_bottom]:
		blade.color = Color("#2e231c")
		blade.mouse_filter = Control.MOUSE_FILTER_IGNORE
		blade.visible = false
		add_child(blade)


func _build_pill() -> Control:
	var holder := CenterContainer.new()
	holder.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var pill := PanelContainer.new()
	pill.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var sb := Art.box(Art.WHITE, 40.0)
	sb.shadow_color = Color(0.45, 0.33, 0.25, 0.12)
	sb.shadow_size = 6
	sb.shadow_offset = Vector2(0, 3)
	sb.content_margin_left = 26
	sb.content_margin_right = 22
	sb.content_margin_top = 8
	sb.content_margin_bottom = 10
	pill.add_theme_stylebox_override("panel", sb)
	holder.add_child(pill)

	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	pill.add_child(row)

	_pill_label = Label.new()
	_pill_label.text = Loc.t("well_done")
	_pill_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	Art.style_label(_pill_label, 26, Art.HUD_TEXT, Art.TEXT_OUTLINE, 0)
	_pill_label.add_theme_font_override("font", Art.thin_font())
	row.add_child(_pill_label)

	_count_label = Label.new()
	_count_label.text = "0"
	_count_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	Art.style_label(_count_label, 26, Art.HUD_TEXT, Art.TEXT_OUTLINE, 0)
	_count_label.add_theme_font_override("font", Art.thin_font())
	row.add_child(_count_label)

	_gem_icon = Control.new()
	_gem_icon.custom_minimum_size = Vector2(34, 34)
	_gem_icon.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	_gem_icon.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_gem_icon.draw.connect(func(): Art.draw_gem(_gem_icon, _gem_icon.size * 0.5, 11.0))
	row.add_child(_gem_icon)
	return holder


func _build_photo_row() -> Control:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 14)
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE

	_prev = Art.icon_button("back", Art.HUD_BROWN, 52.0, Color.TRANSPARENT, true)
	_prev.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	UiFx.juicy(_prev)
	_prev.pressed.connect(_cycle_bg.bind(-1))
	row.add_child(_prev)

	# The photo lives in a plain holder so its drop-in can animate `position`
	# without fighting the container layout.
	_holder = Control.new()
	_holder.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_child(_holder)
	_photo = PhotoCard.new()
	_photo.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_holder.add_child(_photo)

	_forward = Art.icon_button("forward", Art.HUD_BROWN, 52.0, Color.TRANSPARENT, true)
	_forward.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	UiFx.juicy(_forward)
	_forward.pressed.connect(_cycle_bg.bind(1))
	row.add_child(_forward)
	return row


## Called by the parent once it has created its Sfx instance, same pattern as
## HUD.setup() -- this node's own _ready() (button/star construction) already
## ran by then.
func setup(sfx: Sfx) -> void:
	_sfx = sfx


func show_panel(index: int, _tier_name: String, stars: int, diamonds_gained: int) -> void:
	_kill_tweens()
	_index = index
	_stars = stars

	var photo := GameState.photo_for(index)
	if photo.is_empty():
		photo = {"stars": stars, "bg": GameState.bg_for_level(index), "pieces": []}
	_photo.setup(index, photo, 0)
	_layout_photo()
	_count_label.text = "0"
	_last_shown = -1

	visible = true
	_cream.modulate.a = 0.0
	_column.modulate.a = 0.0
	_flash.modulate.a = 0.0
	_photo.position = Vector2.ZERO
	_photo.modulate.a = 0.0
	_continue.scale = Vector2.ZERO
	_set_finder(0.0)
	_set_shutter(0.0)
	_finder.visible = true

	# Act 1 -- the camera lines up on the solved board: brackets close in, the
	# autofocus beeps, the shutter slams shut with its two clicks. Everything is
	# one sequential timeline so it is easy to cut short (_kill_tweens) if a new
	# level is shown mid-animation.
	_seq = create_tween()
	_seq.tween_method(_set_finder, 0.0, 1.0, 0.42) \
		.set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	_seq.tween_callback(func():
		if _sfx != null:
			_sfx.play("focus", -4.0))
	_seq.tween_interval(0.16)
	_seq.tween_callback(func():
		if _sfx != null:
			_sfx.play("shutter", -1.0))
	_seq.tween_method(_set_shutter, 0.0, 1.0, 0.07)
	# Act 2 -- behind the closed shutter the page swaps to the photo.
	_seq.tween_callback(_reveal_photo.bind(stars, diamonds_gained))


## Shutter closed: swap to the cream page, open the blades with a white flash
## and let the photo pop out of the camera, then land the stars and the reward.
func _reveal_photo(stars: int, diamonds_gained: int) -> void:
	_finder.visible = false
	_cream.modulate.a = 1.0
	_column.modulate.a = 1.0
	_photo.scale = Vector2(0.72, 0.72)
	_photo.rotation = -0.14
	_photo.position = Vector2(0, 70)
	_flash.modulate.a = 1.0

	_entry_tween = create_tween().set_parallel(true)
	_entry_tween.tween_method(_set_shutter, 1.0, 0.0, 0.12)
	_entry_tween.tween_property(_flash, "modulate:a", 0.0, 0.5).set_ease(Tween.EASE_OUT)
	_entry_tween.tween_property(_photo, "modulate:a", 1.0, 0.1).set_delay(0.08)
	_entry_tween.tween_property(_photo, "scale", Vector2.ONE, 0.5) \
		.set_delay(0.08).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	_entry_tween.tween_property(_photo, "position", Vector2.ZERO, 0.5) \
		.set_delay(0.08).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	_entry_tween.tween_property(_photo, "rotation", 0.0, 0.7) \
		.set_delay(0.08).set_trans(Tween.TRANS_ELASTIC).set_ease(Tween.EASE_OUT)
	_entry_tween.tween_property(_continue, "scale", Vector2.ONE, 0.36) \
		.set_delay(0.9).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	_entry_tween.chain().tween_callback(func(): UiFx.pulse(_continue, 0.04, 1.1))

	# Act 3 -- the stars pop in one by one on the finished photo.
	_post = create_tween()
	_post.tween_interval(0.62)
	_post.tween_callback(func():
		if _sfx != null:
			_sfx.play("sparkle", -4.0)
		add_child(Fx.confetti_rain(Rect2(Vector2.ZERO, size), 70)))
	for i in stars:
		_post.tween_interval(0.2)
		_post.tween_callback(_star_landed.bind(i))
	_post.tween_interval(0.2)
	_post.tween_callback(_start_count.bind(diamonds_gained))


## 0 = brackets wide at the screen edges, 1 = locked tight on the board.
func _set_finder(k: float) -> void:
	_finder_k = k
	_finder.queue_redraw()


func _draw_finder() -> void:
	var vp := _finder.size
	var outer := Rect2(Vector2(26, 26), vp - Vector2(52, 52))
	var inner_size := Vector2(vp.x * 0.8, vp.y * 0.56)
	var inner := Rect2(vp * Vector2(0.5, 0.47) - inner_size * 0.5, inner_size)
	var k := _finder_k
	var r := Rect2(outer.position.lerp(inner.position, k), outer.size.lerp(inner.size, k))
	var col := Color("#5b4739")
	col.a = clampf(k * 6.0, 0.0, 1.0) * 0.9
	var arm := 52.0 - 14.0 * k
	var w := 6.0
	var corners := [
		[r.position, Vector2(1, 0), Vector2(0, 1)],
		[Vector2(r.end.x, r.position.y), Vector2(-1, 0), Vector2(0, 1)],
		[r.end, Vector2(-1, 0), Vector2(0, -1)],
		[Vector2(r.position.x, r.end.y), Vector2(1, 0), Vector2(0, -1)],
	]
	for c in corners:
		var p: Vector2 = c[0]
		var a: Vector2 = c[1]
		var b: Vector2 = c[2]
		_finder.draw_polyline(PackedVector2Array([p + a * arm, p, p + b * arm]), col, w, true)
		_finder.draw_circle(p, w * 0.5, col)
	# Centre cross, with a focus box that appears once the frame is nearly tight.
	var m := r.get_center()
	_finder.draw_line(m + Vector2(-14, 0), m + Vector2(14, 0), col, 3.0, true)
	_finder.draw_line(m + Vector2(0, -14), m + Vector2(0, 14), col, 3.0, true)
	if k > 0.85:
		var box := Rect2(m - Vector2(44, 44), Vector2(88, 88))
		var fc := Color("#5b4739", 0.75)
		for c in [[box.position, Vector2(1, 0), Vector2(0, 1)], [Vector2(box.end.x, box.position.y), Vector2(-1, 0), Vector2(0, 1)],
				[box.end, Vector2(-1, 0), Vector2(0, -1)], [Vector2(box.position.x, box.end.y), Vector2(1, 0), Vector2(0, -1)]]:
			var q: Vector2 = c[0]
			_finder.draw_polyline(PackedVector2Array([q + (c[1] as Vector2) * 18.0, q, q + (c[2] as Vector2) * 18.0]), fc, 3.0, true)


## 0 = open, 1 = the two blades meet in the middle.
func _set_shutter(k: float) -> void:
	var half := size.y * 0.5 * k
	_blade_top.position = Vector2(0, 0)
	_blade_top.size = Vector2(size.x, half + 1.0)
	_blade_bottom.size = Vector2(size.x, half + 1.0)
	_blade_bottom.position = Vector2(0, size.y - half - 1.0)
	_blade_top.visible = k > 0.0
	_blade_bottom.visible = k > 0.0


func _layout_photo() -> void:
	var w := clampf(minf(size.x - 2.0 * 52.0 - 2.0 * 14.0 - 24.0, size.y * 0.42), PHOTO_MIN_W, PHOTO_MAX_W)
	var h := PhotoCard.height_for(w)
	_holder.custom_minimum_size = Vector2(w, h)
	_photo.size = Vector2(w, h)
	_photo.pivot_offset = Vector2(w * 0.5, h * 0.08)


func _star_landed(i: int) -> void:
	_photo.set_stars(i + 1)
	if _sfx != null:
		_sfx.play("star_slam", -2.0, 1.0 + i * 0.12)
	var centre := _photo.star_position(i).rotated(_photo.rotation) + _photo.global_position - global_position
	add_child(Fx.star_sparkle(centre, Art.STAR, 10, 1.1))
	var t := _photo.create_tween()
	t.tween_property(_photo, "scale", Vector2(1.03, 1.03), 0.06)
	t.tween_property(_photo, "scale", Vector2.ONE, 0.18).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)


func _start_count(total: int) -> void:
	_count_tween = create_tween()
	_count_tween.tween_method(_set_count, 0.0, float(total), 0.35)
	_count_tween.tween_callback(func():
		UiFx.bump(_count_label, 0.12)
		reward_burst.emit(_gem_icon.global_position + _gem_icon.size * 0.5, total))


func _set_count(v: float) -> void:
	var shown := int(round(v))
	_count_label.text = str(shown)
	if shown != _last_shown:
		_last_shown = shown
		if _sfx != null:
			_sfx.play("diamond_tick", -3.0, 1.0 + shown * 0.04)


## Step the photo's backdrop through the scenes the player owns, and remember it.
func _cycle_bg(dir: int) -> void:
	var owned: Array = GameState.unlocked_bgs
	if owned.is_empty():
		return
	var at := owned.find(_photo.bg)
	var next: int = owned[posmod(at + dir, owned.size())]
	_photo.set_bg(next)
	GameState.set_photo_bg(_index, next)
	if _sfx != null:
		_sfx.play("button_tap", -4.0, 1.0 + 0.1 * dir)
	var t := _photo.create_tween()
	t.tween_property(_photo, "rotation", 0.03 * dir, 0.06)
	t.tween_property(_photo, "rotation", 0.0, 0.2).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)


func hide_panel() -> void:
	visible = false
	_kill_tweens()


func _kill_tweens() -> void:
	for t in [_entry_tween, _post, _seq, _count_tween]:
		if t != null and t.is_valid():
			t.kill()
