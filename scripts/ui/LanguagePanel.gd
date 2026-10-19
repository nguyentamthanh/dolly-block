class_name LanguagePanel
extends Control

## Language picker: a dimmed page with a cream card holding one button per
## language, each written in its own language so it stays readable when the
## current one isn't. The current language is highlighted; the cross (or a tap
## on the dim) closes it. Picking a language saves it through Loc and emits
## `chosen`; the caller rebuilds its screen.

signal chosen(code: String)
signal closed

const CARD_SIZE := Vector2(520, 480)
const MARGIN := 28.0
const GAP := 16.0

var _sfx: Sfx


func setup(sfx: Sfx) -> void:
	_sfx = sfx


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	z_index = 200

	var dim := ColorRect.new()
	dim.color = Color(0.1, 0.04, 0.28, 0.62)
	dim.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(dim)
	dim.gui_input.connect(func(ev: InputEvent):
		if ev is InputEventMouseButton and (ev as InputEventMouseButton).pressed:
			_close())

	var center := CenterContainer.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	center.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(center)

	var card := Panel.new()
	card.custom_minimum_size = CARD_SIZE
	var sb := Art.box(Art.CARD, 44.0)
	sb.border_width_bottom = 12
	sb.border_color = Art.CARD_EDGE
	sb.shadow_color = Color(0.05, 0.02, 0.2, 0.4)
	sb.shadow_size = 26
	sb.shadow_offset = Vector2(0, 14)
	card.add_theme_stylebox_override("panel", sb)
	center.add_child(card)

	var title := Label.new()
	title.text = Loc.t("language")
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.position = Vector2(MARGIN, 30)
	title.size = Vector2(CARD_SIZE.x - MARGIN * 2.0 - 40.0, 56)
	Art.style_label(title, Art.fit_font_size(title, title.text, title.size.x, 0.0, 36, 22), Art.ACCENT_BLUE)
	card.add_child(title)

	var btn_w := (CARD_SIZE.x - MARGIN * 2.0 - GAP) * 0.5
	var current := Loc.current()
	for i in Loc.CODES.size():
		var code: String = Loc.CODES[i]
		var b := Button.new()
		b.text = Loc.NAMES[code]
		b.focus_mode = Control.FOCUS_NONE
		b.position = Vector2(MARGIN + (i % 2) * (btn_w + GAP), 104 + (i / 2) * (72 + GAP))
		b.size = Vector2(btn_w, 72)
		b.add_theme_font_size_override("font_size", Art.fit_font_size(b, b.text, btn_w - 36.0, 0.0, 28, 18))
		Art.style_button(b, Art.ACCENT_PRIMARY if code == current else Color.TRANSPARENT, 500.0, true)
		UiFx.juicy(b)
		b.pressed.connect(_on_pick.bind(code))
		card.add_child(b)

	var close := Art.icon_button("close", Art.ACCENT_PINK, 60.0)
	close.position = Vector2(CARD_SIZE.x - 46, -14)
	UiFx.juicy(close)
	close.pressed.connect(_close)
	card.add_child(close)

	if Fx.juice_enabled():
		UiFx.pop_in(card, 0.0, 0.3)
		dim.modulate.a = 0.0
		create_tween().tween_property(dim, "modulate:a", 1.0, 0.2)


func _tap() -> void:
	if _sfx != null:
		_sfx.play("button_tap")


func _on_pick(code: String) -> void:
	_tap()
	Loc.set_language(code)
	chosen.emit(code)


func _close() -> void:
	_tap()
	closed.emit()
	queue_free()
