class_name HUD
extends Control

## Top of the game screen, hyper-casual style. Two rows float straight on the
## sky:
##   row 1 -- round back button | big outlined "LEVEL N" + tier pill | gem chip
##   row 2 -- round Undo button | "placed / total" progress bar | round Hint
##            button with a gem-cost badge
## Children are built in code so the layout has a single source of truth and
## cannot drift from the scene file.

signal undo_pressed
signal hint_pressed
signal menu_pressed

## Breathing room at the very top so the title clears a phone status bar / notch.
const TOP_SAFE := 16
const ROW1_H := 84
const ROW2_H := 72
const MAX_CONTENT_W := 900.0

var _col: VBoxContainer
var _safe_top := 0.0

var _title: Label
var _sub: Label
var _tier_pill: PanelContainer
var _toast: Label
var _toast_holder: Control
var _toast_tween: Tween
var _diamond_chip: Control
var _progress: Control
var _progress_label: Label
var _hint_button: Button
## Set via setup(), which the parent calls AFTER _ready() (HUD is a child, so
## its own _ready() -- where buttons are built -- runs before the parent's).
var _sfx: Sfx

var _total := 0
var _remaining := 0
var _progress_value := 0.0
var _progress_tween: Tween
var _shown_diamonds := -1
var _diamond_tween: Tween


func _ready() -> void:
	# HUD is a child, so its own _ready() runs before the parent
	# LevelController's -- which is where GameState.ensure_loaded() normally
	# happens. Calling it here too (it's idempotent) means the diamond chip
	# always starts from the real saved count, not GameState's static default.
	GameState.ensure_loaded()
	mouse_filter = Control.MOUSE_FILTER_PASS

	var col := VBoxContainer.new()
	_col = col
	col.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	col.add_theme_constant_override("separation", 4)
	col.mouse_filter = Control.MOUSE_FILTER_PASS
	add_child(col)
	set_safe_top(0.0)
	resized.connect(_fit_width)

	_build_row1(col)
	_build_row2(col)
	_build_toast()
	set_diamonds(GameState.diamonds)


## Push the bars below a phone's notch / status bar.
func set_safe_top(px: float) -> void:
	_safe_top = px
	custom_minimum_size.y = TOP_SAFE + px + ROW1_H + ROW2_H + 8
	_col.offset_top = TOP_SAFE + px


## On wide screens (tablets, desktop, landscape) keep the controls in a
## centred column instead of flinging them to the far edges.
func _fit_width() -> void:
	var m := maxf(14.0, (size.x - MAX_CONTENT_W) * 0.5)
	_col.offset_left = m
	_col.offset_right = -m


func _build_row1(parent: Control) -> void:
	var row1 := Control.new()
	row1.custom_minimum_size = Vector2(0, ROW1_H)
	row1.mouse_filter = Control.MOUSE_FILTER_PASS
	parent.add_child(row1)

	# Title column is centred on the full width (not between the side buttons,
	# which have different widths), so it sits dead-centre on screen.
	var title_box := VBoxContainer.new()
	title_box.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	title_box.alignment = BoxContainer.ALIGNMENT_CENTER
	title_box.add_theme_constant_override("separation", -6)
	title_box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row1.add_child(title_box)

	_title = Label.new()
	_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	Art.style_label(_title, 46)
	title_box.add_child(_title)

	_tier_pill = PanelContainer.new()
	_tier_pill.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	_tier_pill.mouse_filter = Control.MOUSE_FILTER_IGNORE
	title_box.add_child(_tier_pill)
	_sub = Label.new()
	_sub.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	Art.style_label(_sub, 17, Art.WHITE, Art.TEXT_OUTLINE, 0)
	_tier_pill.add_child(_sub)
	_set_tier_color(Art.tier_color(0))

	var bar := HBoxContainer.new()
	bar.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	bar.mouse_filter = Control.MOUSE_FILTER_PASS
	row1.add_child(bar)

	var back := Art.icon_button("back", Color.TRANSPARENT, 64.0)
	_wire(back, func(): menu_pressed.emit())
	bar.add_child(back)

	var spacer := Control.new()
	spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	spacer.mouse_filter = Control.MOUSE_FILTER_IGNORE
	bar.add_child(spacer)

	_diamond_chip = Art.build_diamond_chip()
	_diamond_chip.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	bar.add_child(_diamond_chip)


func _build_row2(parent: Control) -> void:
	var row2 := HBoxContainer.new()
	row2.custom_minimum_size = Vector2(0, ROW2_H)
	row2.add_theme_constant_override("separation", 14)
	row2.mouse_filter = Control.MOUSE_FILTER_PASS
	parent.add_child(row2)

	var undo := Art.icon_button("undo", Art.ACCENT_BLUE, 64.0)
	_wire(undo, func(): undo_pressed.emit())
	row2.add_child(undo)

	_progress = Control.new()
	_progress.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_progress.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	_progress.custom_minimum_size = Vector2(0, 40)
	_progress.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_progress.draw.connect(_draw_progress)
	row2.add_child(_progress)
	_progress_label = Label.new()
	_progress_label.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_progress_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_progress_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	Art.style_label(_progress_label, 20, Art.WHITE, Art.TEXT_OUTLINE, 6)
	_progress.add_child(_progress_label)

	_hint_button = Art.icon_button("hint", Art.ACCENT_GOLD, 64.0)
	_wire(_hint_button, func(): hint_pressed.emit())
	# Cost badge: a little gem + number pinned to the button's corner.
	var badge := Control.new()
	badge.mouse_filter = Control.MOUSE_FILTER_IGNORE
	badge.position = Vector2(34, -8)
	badge.size = Vector2(40, 26)
	badge.draw.connect(func():
		badge.draw_style_box(Art.box(Art.ACCENT_PINK, 13.0, 2.0, Art.TEXT_OUTLINE), Rect2(Vector2.ZERO, badge.size))
		Art.draw_gem(badge, Vector2(11, 13), 6.5)
		var f := badge.get_theme_default_font()
		badge.draw_string(f, Vector2(19, 20), str(GameState.HINT_COST), HORIZONTAL_ALIGNMENT_LEFT, -1, 17, Art.WHITE))
	_hint_button.add_child(badge)
	row2.add_child(_hint_button)


func _set_tier_color(c: Color) -> void:
	var sb := Art.box(c, 12.0)
	sb.border_width_bottom = 3
	sb.border_color = c.darkened(0.3)
	sb.content_margin_left = 12
	sb.content_margin_right = 12
	sb.content_margin_top = 1
	sb.content_margin_bottom = 3
	_tier_pill.add_theme_stylebox_override("panel", sb)


func _wire(b: Button, on_press: Callable) -> void:
	UiFx.juicy(b)
	b.pressed.connect(func():
		if _sfx != null:
			_sfx.play("button_tap")
		on_press.call())


func _build_toast() -> void:
	# Transient messages pop over the board top as a dark pill hugging its text.
	_toast_holder = CenterContainer.new()
	_toast_holder.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_WIDE)
	_toast_holder.offset_top = 0
	_toast_holder.offset_bottom = 56
	_toast_holder.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_toast_holder.modulate.a = 0.0
	_toast_holder.z_index = 50
	add_child(_toast_holder)

	var pill := PanelContainer.new()
	pill.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var sb := Art.box(Color(0.12, 0.06, 0.32, 0.88), 22.0)
	sb.content_margin_left = 20
	sb.content_margin_right = 20
	sb.content_margin_top = 8
	sb.content_margin_bottom = 10
	pill.add_theme_stylebox_override("panel", sb)
	_toast_holder.add_child(pill)

	_toast = Label.new()
	Art.style_label(_toast, 20, Art.WHITE, Art.TEXT_OUTLINE, 0)
	pill.add_child(_toast)


## Called by the parent once it has created its Sfx instance -- HUD's own
## _ready() (where buttons are built) already ran by then, which is why this
## is a separate setup step rather than a constructor argument.
func setup(sfx: Sfx) -> void:
	_sfx = sfx


func set_level(index: int, tier_name: String) -> void:
	_title.text = "LEVEL %d" % (index + 1)
	_sub.text = tier_name.to_upper()
	_set_tier_color(Art.tier_color(LevelGenerator.tier_for_level(index)))
	_total = 0
	_progress_value = 0.0
	if Fx.juice_enabled():
		UiFx.pop_in(_title, 0.05)


## Global centre of the gem icon, where reward gems fly to.
func diamond_target_global() -> Vector2:
	var icon := _diamond_chip.find_child("Icon", true, false) as Control
	if icon != null:
		return icon.global_position + icon.size * 0.5
	return _diamond_chip.global_position + _diamond_chip.size * 0.5


func set_diamonds(n: int) -> void:
	# "Count" sits two levels deep inside the chip (margin -> row -> label),
	# so find_child (recursive) is needed rather than get_node (direct-child-only).
	var count := _diamond_chip.find_child("Count", true, false) as Label
	if _shown_diamonds < 0 or not is_inside_tree() or not Fx.juice_enabled():
		_shown_diamonds = n
		count.text = str(n)
		return
	if n == _shown_diamonds:
		return
	var from := _shown_diamonds
	_shown_diamonds = n
	if _diamond_tween != null and _diamond_tween.is_valid():
		_diamond_tween.kill()
	_diamond_tween = create_tween()
	_diamond_tween.tween_method(func(v: float): count.text = str(int(round(v))),
		float(from), float(n), 0.25)
	UiFx.bump(_diamond_chip, 0.15)


func set_remaining(n: int) -> void:
	_remaining = n
	if n > _total:
		_total = n
	var placed := _total - n
	var target := 0.0 if _total <= 0 else float(placed) / float(_total)
	if n == 0:
		_progress_label.text = "ALL SETTLED!"
	else:
		_progress_label.text = "%d / %d" % [placed, _total]
	if _progress_tween != null and _progress_tween.is_valid():
		_progress_tween.kill()
	if not is_inside_tree() or not Fx.juice_enabled():
		_progress_value = target
		_progress.queue_redraw()
		return
	_progress_tween = create_tween()
	_progress_tween.tween_method(func(v: float):
		_progress_value = v
		_progress.queue_redraw(), _progress_value, target, 0.3) \
		.set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)


func _draw_progress() -> void:
	var r := Rect2(Vector2.ZERO, _progress.size)
	var rad := r.size.y * 0.5
	# Trough: dark glass with a lighter rim.
	_progress.draw_style_box(Art.box(Color(0.1, 0.05, 0.32, 0.38), rad, 3.0, Color(1, 1, 1, 0.28)), r)
	if _progress_value <= 0.001:
		return
	var inner := r.grow(-5.0)
	var w := maxf(inner.size.y, inner.size.x * clampf(_progress_value, 0.0, 1.0))
	var fill := Rect2(inner.position, Vector2(w, inner.size.y))
	var g := Art.OK_TINT
	_progress.draw_style_box(Art.box(g.darkened(0.2), inner.size.y * 0.5), fill)
	var top := Rect2(fill.position, Vector2(fill.size.x, fill.size.y - 4.0))
	_progress.draw_style_box(Art.box(g, inner.size.y * 0.5), top)
	if fill.size.x > 24.0:
		var gl := Rect2(fill.position + Vector2(10, 4), Vector2(fill.size.x - 20, 5))
		_progress.draw_style_box(Art.box(Color(1, 1, 1, 0.45), 2.5), gl)


func flash_message(msg: String, hold := 1.6) -> void:
	_toast.text = msg
	if _toast_tween != null and _toast_tween.is_valid():
		_toast_tween.kill()
	_toast_holder.modulate.a = 1.0
	UiFx.pop_in(_toast_holder, 0.0, 0.25)
	_toast_tween = create_tween()
	_toast_tween.tween_interval(hold)
	_toast_tween.tween_property(_toast_holder, "modulate:a", 0.0, 0.4)
