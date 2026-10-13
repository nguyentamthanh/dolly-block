class_name AdRewardPanel
extends Control

## "Out of diamonds" popup: offers a rewarded ad for GameState.AD_REWARD
## diamonds. Opt-in by design (Playgama checklist): the button says an ad is
## coming and what it gives, the cross closes it with no penalty, and the
## reward is granted only on the platform's "rewarded" state.

## `granted` is true when the ad was watched to the end (and the diamonds are
## already added to GameState); false when it was unavailable or cancelled.
signal ad_finished(granted: bool, from_global: Vector2)
signal closed

const CARD_SIZE := Vector2(500, 420)

var _watch: Button
var _card: Panel
var _sfx: Sfx
var _waiting := false


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP  # swallow drags underneath
	z_index = 260  # above the win panel and every piece layer
	visible = false

	var dim := ColorRect.new()
	dim.color = Color(0.1, 0.04, 0.28, 0.62)
	dim.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	dim.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(dim)

	var center := CenterContainer.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	center.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(center)

	_card = Panel.new()
	_card.custom_minimum_size = CARD_SIZE
	var sb := Art.box(Art.CARD, 44.0)
	sb.border_width_bottom = 12
	sb.border_color = Art.CARD_EDGE
	sb.shadow_color = Color(0.05, 0.02, 0.2, 0.4)
	sb.shadow_size = 26
	sb.shadow_offset = Vector2(0, 14)
	_card.add_theme_stylebox_override("panel", sb)
	center.add_child(_card)

	var title := Label.new()
	title.text = "OUT OF DIAMONDS"
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.position = Vector2(20, 34)
	title.size = Vector2(CARD_SIZE.x - 40, 60)
	Art.style_label(title, 38, Art.ACCENT_PINK)
	_card.add_child(title)

	var gem := Control.new()
	gem.position = Vector2(CARD_SIZE.x * 0.5 - 40, 108)
	gem.size = Vector2(80, 90)
	gem.mouse_filter = Control.MOUSE_FILTER_IGNORE
	gem.draw.connect(func(): Art.draw_gem(gem, gem.size * 0.5, 36.0))
	_card.add_child(gem)

	var body := Label.new()
	body.text = "Watch a short ad to get\n+%d diamonds" % GameState.AD_REWARD
	body.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	body.position = Vector2(20, 206)
	body.size = Vector2(CARD_SIZE.x - 40, 70)
	body.add_theme_font_size_override("font_size", 26)
	body.add_theme_color_override("font_color", Art.INK_SOFT)
	_card.add_child(body)

	_watch = Button.new()
	_watch.text = "WATCH AD"
	_watch.focus_mode = Control.FOCUS_NONE
	_watch.position = Vector2(CARD_SIZE.x * 0.5 - 160, 292)
	_watch.size = Vector2(320, 96)
	_watch.add_theme_font_size_override("font_size", 36)
	Art.style_button(_watch, Art.ACCENT_PRIMARY)
	# A play triangle on the left marks it as a video before it is tapped.
	_watch.draw.connect(func():
		var down := _watch.get_draw_mode() == BaseButton.DRAW_PRESSED \
			or _watch.get_draw_mode() == BaseButton.DRAW_HOVER_PRESSED
		var c := Vector2(42, _watch.size.y * 0.5 - 3.0 + (4.0 if down else 0.0))
		Art.draw_icon(_watch, "play", c + Vector2(0, 2), 18.0, Art.ACCENT_PRIMARY.darkened(0.45))
		Art.draw_icon(_watch, "play", c, 18.0, Art.WHITE))
	UiFx.juicy(_watch)
	_watch.pressed.connect(_on_watch)
	_card.add_child(_watch)

	var close := Art.icon_button("close", Art.ACCENT_PINK, 60.0)
	close.position = Vector2(CARD_SIZE.x - 46, -14)
	UiFx.juicy(close)
	close.pressed.connect(func():
		if _sfx != null:
			_sfx.play("button_tap")
		hide_panel()
		closed.emit())
	_card.add_child(close)


func setup(sfx: Sfx) -> void:
	_sfx = sfx


func show_panel() -> void:
	_waiting = false
	_watch.disabled = false
	visible = true
	UiFx.pop_in(_card, 0.0, 0.3)


func hide_panel() -> void:
	visible = false


func _on_watch() -> void:
	if _waiting:
		return
	if _sfx != null:
		_sfx.play("button_tap")
	_waiting = true
	_watch.disabled = true
	PlatformSdk.show_rewarded(_on_rewarded)


func _on_rewarded(granted: bool) -> void:
	_waiting = false
	_watch.disabled = false
	var from := _card.global_position + Vector2(CARD_SIZE.x * 0.5, 153)
	if granted:
		GameState.grant_ad_reward()
	# Closed either way: on a cancel or failure the HUD toast explains, and it
	# would sit hidden under this panel otherwise.
	hide_panel()
	ad_finished.emit(granted, from)
