class_name TimelineScreen
extends Control

## The home screen: a rope running down a cream page with one polaroid hung from
## it per solved level, oldest at the top, and a big "LEVEL N" button at the
## bottom that plays the next one. Every win adds a photo to the rope.
##
## Top bar: star and gem counts, and a menu button (home, sound). A gift
## box floats on the right edge for the daily gem gift.

const GAP := 78.0             ## rope showing between two photos
const TOP_SPACE := 132.0      ## clears the top bar
const BOTTOM_SPACE := 178.0   ## clears the LEVEL button
const CLICK_SLOP := 12.0      ## a drag longer than this is a scroll, not a tap

var play_button: Button

var _sfx: Sfx
var _scroll: ScrollContainer
var _strip: Control
var _pins: Control
var _photos: Array[PhotoCard] = []
var _gem_count: Label
var _star_count: Label
var _gift_button: Button
var _overlay: Control
var _toast_label: Label
var _toast_holder: Control
var _toast_tween: Tween
var _press_at := Vector2.ZERO
var _rope_end := 0.0
var _photo_w := 300.0
var _photo_h := 364.0


func _ready() -> void:
	# On the web, progress comes from the platform's storage asynchronously;
	# build the screen only once it's in so the photos and counts are right.
	var sdk := PlatformSdk.get_instance()
	if sdk != null and not sdk.is_loaded:
		await sdk.progress_loaded
	GameState.ensure_loaded()
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)

	var bg := Background.new()
	bg.flat_color = Art.CREAM
	bg.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(bg)

	_sfx = Sfx.new()
	add_child(_sfx)

	_build_scroll()
	_build_top_bar()
	_build_gift()
	_build_play_button()
	_build_toast()

	_strip.resized.connect(_relayout)
	_relayout()
	_scroll_to_bottom.call_deferred()

	if Fx.juice_enabled():
		UiFx.pop_in(play_button, 0.2)
		var t := create_tween()
		t.tween_interval(0.8)
		t.tween_callback(func(): UiFx.pulse(play_button, 0.035, 1.2))


# --- Building ---------------------------------------------------------------

func _build_scroll() -> void:
	_scroll = ScrollContainer.new()
	_scroll.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_AUTO
	add_child(_scroll)

	_strip = Control.new()
	_strip.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_strip.size_flags_vertical = Control.SIZE_EXPAND_FILL   # a short rope still reaches the button
	_strip.mouse_filter = Control.MOUSE_FILTER_PASS
	_strip.draw.connect(_draw_strip)
	_scroll.add_child(_strip)

	# Every solved level, oldest first. A cleared level with no saved photo (an
	# older save) still gets a bare scene so the rope is never missing a rung.
	var levels := {}
	for i in GameState.photo_levels():
		levels[i] = true
	for k in GameState.stars_at:
		levels[int(k)] = true
	var ordered: Array = levels.keys()
	ordered.sort()
	for idx in ordered:
		var photo := GameState.photo_for(idx)
		if photo.is_empty():
			photo = {"stars": GameState.stars_for(idx), "bg": GameState.bg_for_level(idx), "pieces": []}
		_add_photo(idx, photo)
	if _photos.is_empty():
		# A new player: one blank frame so the rope has something on it.
		_add_photo(0, {})

	_pins = Control.new()
	_pins.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_pins.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_pins.draw.connect(_draw_pins)
	_strip.add_child(_pins)


func _add_photo(index: int, photo: Dictionary) -> void:
	var card := PhotoCard.new()
	card.setup(index, photo)
	card.mouse_filter = Control.MOUSE_FILTER_PASS
	if not photo.is_empty():
		card.gui_input.connect(_on_photo_input.bind(card))
	_strip.add_child(card)
	_photos.append(card)


func _build_top_bar() -> void:
	var bar := HBoxContainer.new()
	bar.set_anchors_and_offsets_preset(Control.PRESET_TOP_WIDE)
	bar.add_theme_constant_override("separation", 10)
	bar.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(bar)
	var safe := UiFx.safe_insets(self)
	bar.offset_top = 22 + safe.top
	bar.offset_bottom = 22 + 64 + safe.top
	UiFx.cap_width(bar, self, 900.0, 18.0, safe.left, safe.right)

	bar.add_child(_build_star_chip())

	var gems := Art.build_diamond_chip(true)
	gems.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	bar.add_child(gems)
	_gem_count = gems.find_child("Count", true, false) as Label
	_gem_count.text = str(GameState.diamonds)

	var spacer := Control.new()
	spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	spacer.mouse_filter = Control.MOUSE_FILTER_IGNORE
	bar.add_child(spacer)

	var menu := Art.icon_button("menu", Art.HUD_BROWN, 64.0, Color.TRANSPARENT, true)
	UiFx.juicy(menu)
	menu.pressed.connect(func():
		_sfx.play("button_tap")
		_open_menu())
	bar.add_child(menu)


## Same white pill as the gem chip, with a star in place of the gem.
func _build_star_chip() -> Control:
	var chip := PanelContainer.new()
	var sb := Art.box(Art.WHITE, 26.0)
	sb.shadow_color = Color(0.45, 0.33, 0.25, 0.14)
	sb.shadow_size = 6
	sb.shadow_offset = Vector2(0, 3)
	chip.add_theme_stylebox_override("panel", sb)
	chip.mouse_filter = Control.MOUSE_FILTER_IGNORE
	chip.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	chip.custom_minimum_size = Vector2(96, 52)

	var margin := MarginContainer.new()
	margin.add_theme_constant_override("margin_left", 12)
	margin.add_theme_constant_override("margin_right", 16)
	margin.add_theme_constant_override("margin_top", 4)
	margin.add_theme_constant_override("margin_bottom", 6)
	chip.add_child(margin)

	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	margin.add_child(row)

	var icon := Control.new()
	icon.custom_minimum_size = Vector2(30, 36)
	icon.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	icon.mouse_filter = Control.MOUSE_FILTER_IGNORE
	icon.draw.connect(func(): Art.draw_star(icon, icon.size * 0.5, 14.0, Art.STAR))
	row.add_child(icon)

	_star_count = Label.new()
	_star_count.text = str(GameState.total_stars())
	_star_count.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	Art.style_label(_star_count, 26, Art.HUD_TEXT, Art.TEXT_OUTLINE, 0)
	row.add_child(_star_count)
	return chip


func _build_gift() -> void:
	_gift_button = Button.new()
	_gift_button.focus_mode = Control.FOCUS_NONE
	_gift_button.flat = true
	_gift_button.custom_minimum_size = Vector2(76, 76)
	_gift_button.anchor_left = 1.0
	_gift_button.anchor_right = 1.0
	_gift_button.anchor_top = 0.5
	_gift_button.anchor_bottom = 0.5
	_gift_button.offset_left = -96
	_gift_button.offset_right = -20
	_gift_button.offset_top = 40
	_gift_button.offset_bottom = 116
	_gift_button.draw.connect(func():
		var b := _gift_button
		var dim := 1.0 if GameState.can_gift() else 0.45
		var c := b.size * 0.5
		Art.draw_gift(b, c, 52.0)
		if dim < 1.0:
			b.draw_rect(Rect2(Vector2.ZERO, b.size), Color(Art.CREAM, 0.55))
		else:
			# A red dot: there is a gift waiting.
			b.draw_circle(c + Vector2(24, -24), 9.0, Color.WHITE)
			b.draw_circle(c + Vector2(24, -24), 6.5, Color("#e5534b")))
	UiFx.juicy(_gift_button)
	_gift_button.pressed.connect(_on_gift)
	add_child(_gift_button)


func _build_play_button() -> void:
	play_button = Button.new()
	play_button.text = Loc.t("level_caps") % (GameState.highest_unlocked + 1)
	play_button.focus_mode = Control.FOCUS_NONE
	play_button.anchor_left = 0.5
	play_button.anchor_right = 0.5
	play_button.anchor_top = 1.0
	play_button.anchor_bottom = 1.0
	play_button.offset_left = -150
	play_button.offset_right = 150
	var safe := UiFx.safe_insets(self)
	play_button.offset_bottom = -(44 + safe.bottom)
	play_button.offset_top = play_button.offset_bottom - 84
	play_button.add_theme_font_size_override("font_size", 36)
	Art.style_button(play_button, Art.HUD_BROWN, 500.0, true)
	UiFx.juicy(play_button)
	play_button.pressed.connect(_on_play)
	add_child(play_button)


func _build_toast() -> void:
	_toast_holder = CenterContainer.new()
	_toast_holder.set_anchors_and_offsets_preset(Control.PRESET_TOP_WIDE)
	_toast_holder.offset_top = 110
	_toast_holder.offset_bottom = 170
	_toast_holder.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_toast_holder.modulate.a = 0.0
	_toast_holder.z_index = 50
	add_child(_toast_holder)
	var pill := PanelContainer.new()
	pill.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var sb := Art.box(Color(0.36, 0.28, 0.24, 0.92), 22.0)
	sb.content_margin_left = 20
	sb.content_margin_right = 20
	sb.content_margin_top = 8
	sb.content_margin_bottom = 10
	pill.add_theme_stylebox_override("panel", sb)
	_toast_holder.add_child(pill)
	_toast_label = Label.new()
	Art.style_label(_toast_label, 20, Art.WHITE, Art.TEXT_OUTLINE, 0)
	pill.add_child(_toast_label)


# --- Layout and drawing -----------------------------------------------------

func _relayout() -> void:
	var w := _strip.size.x if _strip.size.x > 1.0 else get_viewport_rect().size.x
	_photo_w = clampf(w * 0.56, 220.0, 400.0)
	_photo_h = PhotoCard.height_for(_photo_w)
	var y := TOP_SPACE
	for i in _photos.size():
		var card := _photos[i]
		card.size = Vector2(_photo_w, _photo_h)
		card.position = Vector2((w - _photo_w) * 0.5, y)
		card.pivot_offset = Vector2(_photo_w * 0.5, 10.0)
		# Each photo hangs a hair off level, like real pegged prints.
		card.rotation = float((i * 7) % 5 - 2) * 0.007
		y += _photo_h + GAP
	_rope_end = y
	_strip.custom_minimum_size.y = y + BOTTOM_SPACE - GAP
	_strip.queue_redraw()
	_pins.queue_redraw()


func _draw_strip() -> void:
	var w := _strip.size.x
	var cx := w * 0.5
	var rope_end := maxf(_rope_end, _strip.size.y)
	# Clouds first, so the rope and photos overlap them.
	var space := (w - _photo_w) * 0.5
	if space > 46.0:
		for k in _photos.size() + 1:
			var s := minf(_photo_w * 0.4, space * 1.5)
			var side := k % 2
			var x := space * 0.5 if side == 0 else w - space * 0.5
			var y := TOP_SPACE + float(k) * (_photo_h + GAP) + _photo_h * (0.28 if side == 0 else 0.7) - GAP * 0.4
			Scenery.cloud(_strip, Vector2(x, y + 5.0), s, Color("#efe2d6"))
			Scenery.cloud(_strip, Vector2(x, y), s, Color.WHITE)

	# The rope: a tan cord with a light edge and slanted twist marks.
	_strip.draw_line(Vector2(cx, -4), Vector2(cx, rope_end), Color("#cda47d"), 9.0, true)
	_strip.draw_line(Vector2(cx - 3.0, -4), Vector2(cx - 3.0, rope_end), Color("#dfbc99"), 2.0, true)
	var y := 0.0
	while y < rope_end:
		_strip.draw_line(Vector2(cx - 4.5, y + 1.0), Vector2(cx + 4.5, y + 6.0), Color("#a9805a"), 2.0, true)
		y += 10.0


## The wooden pegs, drawn over the photos (this layer is the last child).
func _draw_pins() -> void:
	for card in _photos:
		var c := Vector2(card.position.x + card.size.x * 0.5, card.position.y + 8.0)
		var body := Rect2(c.x - 13.0, c.y - 28.0, 26.0, 70.0)
		_pins.draw_style_box(Art.box(Color(0.35, 0.25, 0.18, 0.18), 7.0), Rect2(body.position + Vector2(2, 3), body.size))
		_pins.draw_style_box(Art.box(Color("#e5b487"), 7.0), body)
		_pins.draw_line(Vector2(c.x, body.position.y + 6.0), Vector2(c.x, body.end.y - 6.0), Color("#c98f5e"), 2.0, true)
		_pins.draw_style_box(Art.box(Color("#a97a50"), 3.0), Rect2(c.x - 15.0, c.y + 4.0, 30.0, 9.0))
		_pins.draw_circle(Vector2(c.x, c.y + 8.5), 2.2, Color("#7d5733"))


func _scroll_to_bottom() -> void:
	var t := create_tween()
	t.tween_interval(0.0)
	t.tween_callback(func():
		if is_instance_valid(_scroll):
			_scroll.scroll_vertical = int(_scroll.get_v_scroll_bar().max_value))


# --- Actions ----------------------------------------------------------------

func _on_play() -> void:
	_sfx.play("button_tap")
	_sfx.play("whoosh", -4.0)
	GameState.current_level = GameState.highest_unlocked
	Transition.go(get_tree(), "res://scenes/Main.tscn")


## Tapping a photo replays that level (a drag that moved is a scroll instead).
func _on_photo_input(event: InputEvent, card: PhotoCard) -> void:
	if not event is InputEventMouseButton:
		return
	var mb := event as InputEventMouseButton
	if mb.button_index != MOUSE_BUTTON_LEFT:
		return
	if mb.pressed:
		_press_at = mb.global_position
		return
	if mb.global_position.distance_to(_press_at) > CLICK_SLOP or _overlay != null:
		return
	_sfx.play("button_tap")
	_sfx.play("whoosh", -4.0)
	GameState.current_level = card.level_index
	Transition.go(get_tree(), "res://scenes/Main.tscn")


func _on_gift() -> void:
	_sfx.play("button_tap")
	if not GameState.can_gift():
		_flash(Loc.t("gift_wait"))
		return
	_open_gift()


func _flash(msg: String, hold := 1.8) -> void:
	_toast_label.text = msg
	if _toast_tween != null and _toast_tween.is_valid():
		_toast_tween.kill()
	_toast_holder.modulate.a = 1.0
	UiFx.pop_in(_toast_holder, 0.0, 0.25)
	_toast_tween = create_tween()
	_toast_tween.tween_interval(hold)
	_toast_tween.tween_property(_toast_holder, "modulate:a", 0.0, 0.4)


# --- Popups -----------------------------------------------------------------

## A dimmed page with a cream card in the middle; returns the card's content
## column. Tapping the dim closes it. Only one is open at a time.
func _open_popup(card_size: Vector2) -> VBoxContainer:
	_close_overlay()
	_overlay = Control.new()
	_overlay.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_overlay.z_index = 100
	add_child(_overlay)

	var dim := ColorRect.new()
	dim.color = Color(0.3, 0.22, 0.18, 0.5)
	dim.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_overlay.add_child(dim)
	dim.gui_input.connect(func(ev: InputEvent):
		if ev is InputEventMouseButton and (ev as InputEventMouseButton).pressed:
			_close_overlay())

	var center := CenterContainer.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	center.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_overlay.add_child(center)

	var card := PanelContainer.new()
	card.custom_minimum_size = card_size
	var sb := Art.box(Art.CREAM, 40.0)
	sb.content_margin_left = 28
	sb.content_margin_right = 28
	sb.content_margin_top = 24
	sb.content_margin_bottom = 28
	card.add_theme_stylebox_override("panel", sb)
	center.add_child(card)

	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 22)
	card.add_child(col)

	if Fx.juice_enabled():
		UiFx.pop_in(card, 0.0, 0.3)
		dim.modulate.a = 0.0
		create_tween().tween_property(dim, "modulate:a", 1.0, 0.2)
	return col


func _close_overlay() -> void:
	if _overlay != null and is_instance_valid(_overlay):
		_overlay.queue_free()
	_overlay = null


func _popup_button(text: String, on_press: Callable, width := 280.0) -> Button:
	var b := Button.new()
	b.text = text
	b.focus_mode = Control.FOCUS_NONE
	b.custom_minimum_size = Vector2(width, 68)
	b.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	b.add_theme_font_size_override("font_size", 28)
	Art.style_button(b, Art.HUD_BROWN, 500.0, true)
	UiFx.juicy(b)
	# A button built without a handler is wired by the caller.
	if on_press.is_valid():
		b.pressed.connect(func():
			_sfx.play("button_tap")
			on_press.call())
	return b


func _open_menu() -> void:
	var col := _open_popup(Vector2(360, 0))
	var title := Label.new()
	title.text = Loc.t("menu")
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	Art.style_label(title, 34, Art.HUD_TEXT, Art.TEXT_OUTLINE, 0)
	col.add_child(title)

	col.add_child(_popup_button(Loc.t("home"), func():
		_sfx.play("whoosh", -4.0)
		Transition.go(get_tree(), "res://scenes/MainMenu.tscn")))

	var sound := _popup_button("", Callable())
	var refresh := func(): sound.text = Loc.t("sound_on") if GameState.sound_enabled else Loc.t("sound_off")
	refresh.call()
	sound.pressed.connect(func():
		_sfx.play("button_tap")
		GameState.sound_enabled = not GameState.sound_enabled
		GameState.save_progress()
		refresh.call())
	col.add_child(sound)

	col.add_child(_popup_button(Loc.t("close"), _close_overlay))


func _open_gift() -> void:
	var col := _open_popup(Vector2(420, 0))

	var top := HBoxContainer.new()
	col.add_child(top)
	var chip := Art.build_diamond_chip(true)
	chip.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	top.add_child(chip)
	var count := chip.find_child("Count", true, false) as Label
	count.text = str(GameState.diamonds)
	var spacer := Control.new()
	spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	top.add_child(spacer)
	var close := Art.icon_button("close", Art.HUD_BROWN, 56.0, Color.TRANSPARENT, true)
	UiFx.juicy(close)
	close.pressed.connect(func():
		_sfx.play("button_tap")
		_close_overlay())
	top.add_child(close)

	var stage := Control.new()
	stage.custom_minimum_size = Vector2(0, 220)
	stage.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var opened := [false]
	stage.draw.connect(func():
		var bob := sin(Time.get_ticks_msec() * 0.004) * 5.0
		if not opened[0]:
			Art.draw_gift(stage, stage.size * 0.5 + Vector2(0, bob), 190.0)
		else:
			Art.draw_gem(stage, stage.size * 0.5 + Vector2(0, -6), 48.0))
	col.add_child(stage)
	var redraw := stage.create_tween().set_loops()
	redraw.tween_callback(stage.queue_redraw)
	redraw.tween_interval(0.03)

	var note := Label.new()
	note.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	note.text = ""
	Art.style_label(note, 28, Art.HUD_TEXT, Art.TEXT_OUTLINE, 0)
	col.add_child(note)

	var button := _popup_button(Loc.t("open"), Callable(), 240.0)
	col.add_child(button)
	var state := [false]
	# First press opens the gift, the second closes the popup.
	button.pressed.connect(func():
		_sfx.play("button_tap")
		if state[0]:
			_close_overlay()
			return
		state[0] = true
		var amount := GameState.open_gift()
		opened[0] = true
		note.text = Loc.t("gems_plus") % amount
		count.text = str(GameState.diamonds)
		_gem_count.text = str(GameState.diamonds)
		UiFx.bump(chip, 0.15)
		_sfx.play("sparkle", -3.0)
		_overlay.add_child(Fx.confetti_burst(_overlay.size * 0.5, 60))
		button.text = Loc.t("nice_btn")
		_gift_button.queue_redraw())
