class_name HUD
extends Control

## Top bar: which level you are on, how much is left, and the two player aids.
## Children are built in code so the layout has a single source of truth and
## cannot drift from the scene file.

signal undo_pressed
signal hint_pressed

## Breathing room at the very top so the title clears a phone status bar / notch.
const TOP_SAFE := 18

var _title: Label
var _sub: Label
var _toast: Label
var _toast_holder: Control
var _toast_tween: Tween


func _ready() -> void:
	custom_minimum_size.y = 84 + TOP_SAFE
	mouse_filter = Control.MOUSE_FILTER_PASS

	# A soft header card so the bar reads as its own surface on a busy board.
	var bar := PanelContainer.new()
	bar.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	bar.offset_top = TOP_SAFE
	bar.offset_left = 10
	bar.offset_right = -10
	bar.offset_bottom = -6
	bar.mouse_filter = Control.MOUSE_FILTER_PASS
	bar.add_theme_stylebox_override("panel", Art.box(Color(1, 1, 1, 0.55), 22.0))
	add_child(bar)

	var margin := MarginContainer.new()
	margin.add_theme_constant_override("margin_left", 16)
	margin.add_theme_constant_override("margin_right", 12)
	margin.add_theme_constant_override("margin_top", 8)
	margin.add_theme_constant_override("margin_bottom", 8)
	bar.add_child(margin)

	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	margin.add_child(row)

	var text := VBoxContainer.new()
	text.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	text.alignment = BoxContainer.ALIGNMENT_CENTER
	row.add_child(text)

	_title = Label.new()
	_title.add_theme_font_size_override("font_size", 32)
	_title.add_theme_color_override("font_color", Art.INK)
	text.add_child(_title)

	_sub = Label.new()
	_sub.add_theme_font_size_override("font_size", 16)
	_sub.add_theme_color_override("font_color", Art.INK.lerp(Art.BG_TOP, 0.42))
	text.add_child(_sub)

	row.add_child(_make_button("Undo", func(): undo_pressed.emit()))
	row.add_child(_make_button("Hint", func(): hint_pressed.emit(), Art.STAR))

	_build_toast()


func _build_toast() -> void:
	# Transient messages float over the bar as a readable pill hugging its text.
	_toast_holder = CenterContainer.new()
	_toast_holder.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_WIDE)
	_toast_holder.offset_top = -36
	_toast_holder.offset_bottom = 4
	_toast_holder.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_toast_holder.modulate.a = 0.0
	add_child(_toast_holder)

	var pill := PanelContainer.new()
	pill.mouse_filter = Control.MOUSE_FILTER_IGNORE
	pill.add_theme_stylebox_override("panel", Art.box(Color(1, 1, 1, 0.94), 15.0))
	_toast_holder.add_child(pill)

	var pm := MarginContainer.new()
	pm.add_theme_constant_override("margin_left", 16)
	pm.add_theme_constant_override("margin_right", 16)
	pm.add_theme_constant_override("margin_top", 7)
	pm.add_theme_constant_override("margin_bottom", 7)
	pill.add_child(pm)

	_toast = Label.new()
	_toast.add_theme_font_size_override("font_size", 15)
	_toast.add_theme_color_override("font_color", Art.INK)
	pm.add_child(_toast)


func _make_button(label: String, on_press: Callable, accent := Color.TRANSPARENT) -> Button:
	var b := Button.new()
	b.text = label
	b.focus_mode = Control.FOCUS_NONE
	b.custom_minimum_size = Vector2(82, 52)  # comfortable touch target
	b.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	b.add_theme_font_size_override("font_size", 18)
	Art.style_button(b, accent)
	b.pressed.connect(on_press)
	return b


func set_level(index: int, tier_name: String) -> void:
	_title.text = "Level %d" % (index + 1)
	_sub.text = tier_name


func set_remaining(n: int) -> void:
	if n == 0:
		_sub.text = "everyone is settled"
	else:
		_sub.text = "%d block%s left" % [n, "" if n == 1 else "s"]


func flash_message(msg: String) -> void:
	_toast.text = msg
	if _toast_tween != null and _toast_tween.is_valid():
		_toast_tween.kill()
	_toast_holder.modulate.a = 1.0
	_toast_tween = create_tween()
	_toast_tween.tween_interval(1.6)
	_toast_tween.tween_property(_toast_holder, "modulate:a", 0.0, 0.4)
