class_name LevelCompletePanel
extends Control

## The between-levels celebration, hyper-casual style: a ribbon banner over a
## cream card, a rotating sunburst behind three big stars that SLAM in one by
## one (each with a shake, sparkles and a thump), a gem reward that counts up
## and then flies into the HUD counter, and a pulsing green NEXT button.
##
## Kept non-blocking: NEXT is tappable from the first frame, and the whole
## choreography settles in about 1.5 seconds.

signal next_pressed
## Emitted once the reward count finishes, with the global position of the
## reward gem, so the game can fly gems into the HUD counter.
signal reward_burst(from_global: Vector2, amount: int)

const GROUP_SIZE := Vector2(560, 660)
const CARD_RECT := Rect2(30, 92, 500, 540)
const SUNBURST_SHADER := preload("res://shaders/sunburst.gdshader")

var _dim: ColorRect
var _group: Control
var _ribbon: Control
var _headline: Label
var _sub: Label
var _star_nodes: Array[Control] = []
var _reward_row: Control
var _gem_icon: Control
var _diamond_gain_label: Label
var _next: Button
var _sfx: Sfx
var _ribbon_color := Art.ACCENT_PINK

var _entry_tween: Tween
var _seq: Tween
var _diamond_tween: Tween
var _last_shown_diamonds := -1


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP  # swallow drags underneath
	# Above every piece layer (resting pieces sit at z 0..18, effects at 20,
	# a dragged piece at 100) and the floating headline text (200).
	z_index = 250

	_dim = ColorRect.new()
	_dim.color = Color(0.1, 0.04, 0.28, 0.62)
	_dim.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_dim.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_dim)

	# A fixed-size group, centred on screen; everything inside is placed by
	# hand so the ribbon can overlap the card edge and the stars can arc.
	var center := CenterContainer.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	center.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(center)
	_group = Control.new()
	_group.custom_minimum_size = GROUP_SIZE
	_group.mouse_filter = Control.MOUSE_FILTER_IGNORE
	center.add_child(_group)

	var burst := ColorRect.new()
	var bm := ShaderMaterial.new()
	bm.shader = SUNBURST_SHADER
	bm.set_shader_parameter("ray_color", Color(1.0, 0.92, 0.55, 0.55))
	burst.material = bm
	burst.mouse_filter = Control.MOUSE_FILTER_IGNORE
	burst.size = Vector2(900, 900)
	burst.position = Vector2(GROUP_SIZE.x * 0.5, 250) - burst.size * 0.5
	_group.add_child(burst)

	var card := Panel.new()
	var card_box := Art.box(Art.CARD, 44.0)
	card_box.border_width_bottom = 12
	card_box.border_color = Art.CARD_EDGE
	card_box.shadow_color = Color(0.05, 0.02, 0.2, 0.4)
	card_box.shadow_size = 26
	card_box.shadow_offset = Vector2(0, 14)
	card.add_theme_stylebox_override("panel", card_box)
	card.position = CARD_RECT.position
	card.size = CARD_RECT.size
	card.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_group.add_child(card)

	_ribbon = Control.new()
	_ribbon.position = Vector2(0, 40)
	_ribbon.size = Vector2(GROUP_SIZE.x, 104)
	_ribbon.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_ribbon.draw.connect(_draw_ribbon)
	_group.add_child(_ribbon)

	_headline = Label.new()
	_headline.text = "COMPLETE!"
	_headline.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_headline.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_headline.position = Vector2(60, 4)
	_headline.size = Vector2(GROUP_SIZE.x - 120, 80)
	Art.style_label(_headline, 50)
	_ribbon.add_child(_headline)

	# Three stars on a gentle arc, the middle one biggest.
	var star_specs := [
		{"c": Vector2(GROUP_SIZE.x * 0.5 - 140, 262), "r": 50.0},
		{"c": Vector2(GROUP_SIZE.x * 0.5, 236), "r": 66.0},
		{"c": Vector2(GROUP_SIZE.x * 0.5 + 140, 262), "r": 50.0},
	]
	for spec in star_specs:
		var star := _make_star(spec.r)
		star.position = spec.c - star.size * 0.5
		_group.add_child(star)
		_star_nodes.append(star)

	_sub = Label.new()
	_sub.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_sub.position = Vector2(CARD_RECT.position.x, 330)
	_sub.size = Vector2(CARD_RECT.size.x, 40)
	_sub.add_theme_font_size_override("font_size", 24)
	_sub.add_theme_color_override("font_color", Art.INK_SOFT)
	_group.add_child(_sub)

	_reward_row = PanelContainer.new()
	var rsb := Art.box(Color("#f1e8ff"), 30.0)
	rsb.content_margin_left = 22
	rsb.content_margin_right = 26
	rsb.content_margin_top = 4
	rsb.content_margin_bottom = 6
	_reward_row.add_theme_stylebox_override("panel", rsb)
	_reward_row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var reward_center := CenterContainer.new()
	reward_center.position = Vector2(CARD_RECT.position.x, 380)
	reward_center.size = Vector2(CARD_RECT.size.x, 76)
	reward_center.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_group.add_child(reward_center)
	reward_center.add_child(_reward_row)
	var rh := HBoxContainer.new()
	rh.add_theme_constant_override("separation", 10)
	_reward_row.add_child(rh)
	_gem_icon = Control.new()
	_gem_icon.custom_minimum_size = Vector2(52, 60)
	_gem_icon.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_gem_icon.draw.connect(func(): Art.draw_gem(_gem_icon, _gem_icon.size * 0.5, 22.0))
	rh.add_child(_gem_icon)
	_diamond_gain_label = Label.new()
	_diamond_gain_label.text = "+0"
	_diamond_gain_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	Art.style_label(_diamond_gain_label, 44, Art.WHITE, Art.TEXT_OUTLINE)
	rh.add_child(_diamond_gain_label)

	_next = Button.new()
	_next.text = "NEXT"
	_next.focus_mode = Control.FOCUS_NONE
	_next.position = Vector2(GROUP_SIZE.x * 0.5 - 170, 492)
	_next.size = Vector2(340, 104)
	_next.add_theme_font_size_override("font_size", 44)
	Art.style_button(_next, Art.ACCENT_PRIMARY)
	UiFx.juicy(_next)
	_next.pressed.connect(func():
		if _sfx != null:
			_sfx.play("button_tap")
		next_pressed.emit())
	_group.add_child(_next)


func _make_star(r: float) -> Control:
	var c := Control.new()
	c.size = Vector2(r, r) * 2.6
	c.mouse_filter = Control.MOUSE_FILTER_IGNORE
	c.pivot_offset = c.size * 0.5
	c.set_meta("filled", false)
	c.draw.connect(func():
		Art.draw_star_fancy(c, c.size * 0.5, r, c.get_meta("filled", false)))
	return c


func _draw_ribbon() -> void:
	var w := _ribbon.size.x
	var h := 84.0
	var col := _ribbon_color
	var dark := col.darkened(0.35)
	var ink := Art.TEXT_OUTLINE
	# Folded tails behind the main band.
	for side in [-1.0, 1.0]:
		# Swallow-tail notch: outer edge at x0, band side tucked under at x0 -/+ 72.
		var x0 := 0.0 if side < 0 else w
		var pts := PackedVector2Array([
			Vector2(x0 - side * 72.0, 22), Vector2(x0, 22),
			Vector2(x0 - side * 26.0, (22 + h + 22) * 0.5),
			Vector2(x0, h + 22), Vector2(x0 - side * 72.0, h + 22)])
		_ribbon.draw_colored_polygon(pts, dark)
		_ribbon.draw_polyline(_closed(pts), ink, 4.0, true)
	var band := Rect2(44, 0, w - 88, h)
	_ribbon.draw_style_box(Art.box(ink, 16.0), band.grow(4.0))
	_ribbon.draw_style_box(Art.box(col.darkened(0.15), 14.0), band)
	_ribbon.draw_style_box(Art.box(col, 14.0), Rect2(band.position, band.size - Vector2(0, 10)))
	_ribbon.draw_style_box(Art.box(Color(1, 1, 1, 0.3), 5.0),
		Rect2(band.position + Vector2(24, 9), Vector2(band.size.x - 48, 9)))


static func _closed(pts: PackedVector2Array) -> PackedVector2Array:
	var out := pts.duplicate()
	out.append(pts[0])
	return out


## Called by the parent once it has created its Sfx instance, same pattern as
## HUD.setup() -- this node's own _ready() (button/star construction) already
## ran by then.
func setup(sfx: Sfx) -> void:
	_sfx = sfx


func show_panel(index: int, tier_name: String, stars: int, diamonds_gained: int) -> void:
	_kill_tweens()
	_sub.text = "Level %d  ·  %s" % [index + 1, tier_name]
	_headline.text = ["COMPLETE!", "COMPLETE!", "GREAT!", "PERFECT!"][clampi(stars, 0, 3)]
	_ribbon_color = Art.tier_color(LevelGenerator.tier_for_level(index)) if stars < 3 else Art.ACCENT_PINK
	_ribbon.queue_redraw()

	for i in _star_nodes.size():
		var star := _star_nodes[i]
		star.set_meta("filled", false)
		star.scale = Vector2.ONE
		star.modulate.a = 1.0
		star.queue_redraw()
	_diamond_gain_label.text = "+0"
	_last_shown_diamonds = -1

	visible = true
	_dim.modulate.a = 0.0
	_group.pivot_offset = GROUP_SIZE * 0.5
	_group.scale = Vector2(0.4, 0.4)
	_group.modulate.a = 0.0
	_ribbon.scale = Vector2(0.2, 1.0)
	_ribbon.pivot_offset = _ribbon.size * 0.5
	_next.scale = Vector2.ZERO

	_entry_tween = create_tween().set_parallel(true)
	_entry_tween.tween_property(_dim, "modulate:a", 1.0, 0.2)
	_entry_tween.tween_property(_group, "modulate:a", 1.0, 0.12)
	_entry_tween.tween_property(_group, "scale", Vector2.ONE, 0.42) \
		.set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	_entry_tween.tween_property(_ribbon, "scale", Vector2.ONE, 0.36) \
		.set_delay(0.12).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	_entry_tween.tween_property(_next, "scale", Vector2.ONE, 0.36) \
		.set_delay(0.3).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	_entry_tween.chain().tween_callback(func(): UiFx.pulse(_next, 0.045, 1.0))

	# The rest of the celebration rides one sequential timeline so it is easy
	# to reason about and to cut short (_kill_tweens) if a new level is shown
	# mid-animation.
	_seq = create_tween()
	_seq.tween_interval(0.3)
	_seq.tween_callback(func():
		if _sfx != null:
			_sfx.play("sparkle", -4.0)
		add_child(Fx.confetti_rain(Rect2(Vector2.ZERO, size), 80)))
	for i in stars:
		var star := _star_nodes[i]
		_seq.tween_callback(func():
			star.set_meta("filled", true)
			star.queue_redraw())
		# Explicit from() values: tweeners in one parallel step start together,
		# so they must not depend on the callback having run first.
		_seq.tween_property(star, "scale", Vector2.ONE, 0.16).from(Vector2(2.6, 2.6)) \
			.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
		_seq.parallel().tween_property(star, "modulate:a", 1.0, 0.1).from(0.0)
		_seq.tween_callback(_star_landed.bind(i))
		_seq.tween_interval(0.12)
	_seq.tween_callback(_start_diamond_count.bind(diamonds_gained))


func _star_landed(i: int) -> void:
	var star: Control = _star_nodes[i]
	if _sfx != null:
		_sfx.play("star_slam", 0.0, 1.0 + i * 0.12)
	Fx.shake(_group, 9.0 + i * 3.0, 0.22)
	var centre := star.global_position + star.size * 0.5 - global_position
	add_child(Fx.star_sparkle(centre, Art.STAR, 12, 1.3))
	add_child(Fx.ring_wave(centre, star.size.x * 0.55, Color(1, 0.95, 0.6, 0.9), 10.0))
	var t := star.create_tween()
	t.tween_property(star, "scale", Vector2(1.18, 0.86), 0.06)
	t.tween_property(star, "scale", Vector2.ONE, 0.2).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)


func _start_diamond_count(total: int) -> void:
	_diamond_tween = create_tween()
	_diamond_tween.tween_method(_set_diamond_count, 0.0, float(total), 0.35)
	_diamond_tween.tween_callback(func():
		UiFx.bump(_reward_row, 0.12)
		reward_burst.emit(_gem_icon.global_position + _gem_icon.size * 0.5, total))


func _set_diamond_count(v: float) -> void:
	var shown := int(round(v))
	_diamond_gain_label.text = "+%d" % shown
	if shown != _last_shown_diamonds:
		_last_shown_diamonds = shown
		if _sfx != null:
			_sfx.play("diamond_tick", -3.0, 1.0 + shown * 0.04)


func hide_panel() -> void:
	visible = false
	_kill_tweens()


func _kill_tweens() -> void:
	for t in [_entry_tween, _seq, _diamond_tween]:
		if t != null and t.is_valid():
			t.kill()
