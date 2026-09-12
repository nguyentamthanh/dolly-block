class_name LevelCompletePanel
extends Control

## The between-levels celebration. Kept deliberately small: a cozy game should
## get you back into the next puzzle quickly rather than making you sit through
## a fanfare.

signal next_pressed

var _card: PanelContainer
var _headline: Label
var _sub: Label


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP  # swallow drags underneath

	var dim := ColorRect.new()
	dim.color = Color(0.18, 0.14, 0.12, 0.34)
	dim.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	dim.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(dim)

	_card = PanelContainer.new()
	var card_box := Art.box(Art.BG_TOP, 30.0)
	card_box.shadow_color = Color(0.18, 0.14, 0.12, 0.28)
	card_box.shadow_size = 24
	card_box.shadow_offset = Vector2(0, 10)
	_card.add_theme_stylebox_override("panel", card_box)
	_card.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	_card.custom_minimum_size = Vector2(320, 0)
	add_child(_card)

	# PanelContainer takes exactly one child, so the margin wraps the column
	# rather than sitting beside it.
	var margin := MarginContainer.new()
	for side in ["left", "right", "top", "bottom"]:
		margin.add_theme_constant_override("margin_" + side, 26)
	_card.add_child(margin)

	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 14)
	margin.add_child(col)

	_headline = Label.new()
	_headline.text = "Harmony!"
	_headline.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_headline.add_theme_font_size_override("font_size", 36)
	_headline.add_theme_color_override("font_color", Art.INK)
	col.add_child(_headline)

	_sub = Label.new()
	_sub.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_sub.add_theme_font_size_override("font_size", 17)
	_sub.add_theme_color_override("font_color", Art.INK.lerp(Art.BG_BOTTOM, 0.45))
	col.add_child(_sub)

	var next := Button.new()
	next.text = "Next level"
	next.focus_mode = Control.FOCUS_NONE
	next.custom_minimum_size = Vector2(0, 60)
	next.size_flags_horizontal = Control.SIZE_FILL
	next.add_theme_font_size_override("font_size", 20)
	Art.style_button(next, Art.OK_TINT.lerp(Art.INK, 0.08))
	next.pressed.connect(func(): next_pressed.emit())
	col.add_child(next)


func show_panel(index: int, tier_name: String) -> void:
	_sub.text = "Level %d  -  %s" % [index + 1, tier_name]
	visible = true
	modulate.a = 0.0
	_card.scale = Vector2(0.9, 0.9)
	_card.pivot_offset = _card.size * 0.5
	var t := create_tween().set_parallel(true)
	t.tween_property(self, "modulate:a", 1.0, 0.18)
	t.tween_property(_card, "scale", Vector2.ONE, 0.26) \
		.set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)


func hide_panel() -> void:
	visible = false
