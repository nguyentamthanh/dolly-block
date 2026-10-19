class_name MainMenuScreen
extends Control

## The game's front door. The whole look is one painted piece of art (logo,
## tagline and the googly blocks over a candy sky), painted in four framings so
## it can cover ANY window edge to edge with nothing but a crop: tall portrait,
## 3:4, square and wide landscape. The window's aspect picks the nearest one,
## and it is scaled to cover and pinned to the TOP, so any crop falls on the
## empty cloud bank at the bottom and never on the logo. Every painting keeps
## its blocks off the centre column, where the buttons sit.
##
## The art and the controls live in separate nodes ("Art" and "Ui") so the store
## cover tool can hide the controls and keep the picture.

## {art, upper aspect bound}: the first entry whose bound exceeds the window's
## width / height wins, so the list must stay sorted ascending.
const FRAMES := [
	{"art": preload("res://assets/home/home_bg.png"), "below": 0.6},
	{"art": preload("res://assets/home/home_bg_34.png"), "below": 0.87},
	{"art": preload("res://assets/home/home_bg_sq.png"), "below": 1.5},
	{"art": preload("res://assets/home/home_bg_wide.png"), "below": 1000.0},
]

var play_button: Button

var _sound_button: Button
var _sfx: Sfx
var _art: TextureRect


func _ready() -> void:
	# On the web, progress comes from the platform's storage asynchronously;
	# build the menu only once it's in so the level/gem counts are right.
	var sdk := PlatformSdk.get_instance()
	if sdk != null and not sdk.is_loaded:
		await sdk.progress_loaded
	# The very first screen the app shows, so this is where progress actually
	# gets loaded from disk.
	GameState.ensure_loaded()
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)

	# Sized and placed by hand in _fit_art (cover, pinned to the top).
	_art = TextureRect.new()
	_art.name = "Art"
	_art.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_art.stretch_mode = TextureRect.STRETCH_SCALE
	_art.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_art)
	resized.connect(_fit_art)
	_fit_art()
	var art := _art

	_sfx = Sfx.new()
	add_child(_sfx)

	var ui := Control.new()
	ui.name = "Ui"
	ui.mouse_filter = Control.MOUSE_FILTER_IGNORE
	ui.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(ui)

	_build_top_bar(ui)
	_build_buttons(ui)

	if Fx.juice_enabled():
		art.modulate.a = 0.0
		create_tween().tween_property(art, "modulate:a", 1.0, 0.25)
		UiFx.pop_in(play_button, 0.2)
		var t := create_tween()
		t.tween_interval(0.7)
		t.tween_callback(func(): UiFx.pulse(play_button, 0.05, 1.1))


## Pick the painting nearest the window's shape, scale it until it covers the
## window, centre it sideways and pin it to the top edge.
func _fit_art() -> void:
	if _art == null or size.x <= 0.0 or size.y <= 0.0:
		return
	var aspect := size.x / size.y
	var tex: Texture2D = FRAMES[FRAMES.size() - 1].art
	for f in FRAMES:
		if aspect < float(f.below):
			tex = f.art
			break
	_art.texture = tex
	var tw := float(tex.get_width())
	var th := float(tex.get_height())
	var s := maxf(size.x / tw, size.y / th)
	_art.size = Vector2(tw, th) * s
	_art.position = Vector2((size.x - _art.size.x) * 0.5, 0.0)


func _build_top_bar(parent: Control) -> void:
	var bar := HBoxContainer.new()
	bar.set_anchors_and_offsets_preset(Control.PRESET_TOP_WIDE)
	bar.mouse_filter = Control.MOUSE_FILTER_IGNORE
	parent.add_child(bar)
	var safe := UiFx.safe_insets(self)
	bar.offset_top = 18 + safe.top
	bar.offset_bottom = 18 + 68 + safe.top
	# Uncapped: on a landscape window the corner controls belong at the corners,
	# where the landscape painting keeps its top corners clear.
	UiFx.cap_width(bar, self, 4000.0, 18.0, safe.left, safe.right)

	_sound_button = Art.icon_button("sound_on", Color.TRANSPARENT, 64.0)
	UiFx.juicy(_sound_button)
	_sound_button.pressed.connect(_on_toggle_sound)
	bar.add_child(_sound_button)
	_refresh_sound_label()

	var lang_button := Art.icon_button("globe", Color.TRANSPARENT, 64.0)
	UiFx.juicy(lang_button)
	lang_button.pressed.connect(_on_language)
	bar.add_child(lang_button)

	var spacer := Control.new()
	spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	spacer.mouse_filter = Control.MOUSE_FILTER_IGNORE
	bar.add_child(spacer)

	var chip := Art.build_diamond_chip()
	chip.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	bar.add_child(chip)
	(chip.find_child("Count", true, false) as Label).text = str(GameState.diamonds)


## PLAY, the level it will open, and PHOTOS, stacked in the bottom cloud bank.
func _build_buttons(parent: Control) -> void:
	var safe := UiFx.safe_insets(self)
	var col := VBoxContainer.new()
	col.name = "Buttons"
	col.alignment = BoxContainer.ALIGNMENT_END
	col.add_theme_constant_override("separation", 14)
	col.mouse_filter = Control.MOUSE_FILTER_IGNORE
	col.anchor_left = 0.5
	col.anchor_right = 0.5
	col.anchor_top = 1.0
	col.anchor_bottom = 1.0
	col.offset_left = -200
	col.offset_right = 200
	col.offset_bottom = -(46 + safe.bottom)
	col.offset_top = col.offset_bottom - 330
	parent.add_child(col)

	play_button = Button.new()
	play_button.text = Loc.t("play")
	play_button.focus_mode = Control.FOCUS_NONE
	play_button.custom_minimum_size = Vector2(380, 124)
	play_button.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	play_button.add_theme_font_size_override("font_size", 60)
	Art.style_button(play_button, Art.ACCENT_PRIMARY)
	UiFx.juicy(play_button)
	play_button.pressed.connect(_on_play)
	col.add_child(play_button)

	var level_label := Label.new()
	level_label.text = Loc.t("level_n") % (GameState.highest_unlocked + 1)
	if not GameState.run_for(GameState.highest_unlocked).is_empty():
		level_label.text += "  ·  " + Loc.t("in_progress")
	level_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	Art.style_label(level_label, 28)
	col.add_child(level_label)

	var photos := Button.new()
	photos.text = Loc.t("photos")
	photos.focus_mode = Control.FOCUS_NONE
	photos.custom_minimum_size = Vector2(260, 80)
	photos.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	photos.add_theme_font_size_override("font_size", 32)
	Art.style_button(photos, Art.ACCENT_PINK)
	UiFx.juicy(photos)
	photos.pressed.connect(_on_photos)
	col.add_child(photos)

	if Fx.juice_enabled():
		UiFx.pop_in(level_label, 0.3)
		UiFx.pop_in(photos, 0.38)


func _on_play() -> void:
	_sfx.play("button_tap")
	_sfx.play("whoosh", -4.0)
	GameState.current_level = GameState.highest_unlocked
	Transition.go(get_tree(), "res://scenes/Main.tscn")


func _on_photos() -> void:
	_sfx.play("button_tap")
	_sfx.play("whoosh", -4.0)
	Transition.go(get_tree(), "res://scenes/Timeline.tscn")


func _on_language() -> void:
	_sfx.play("button_tap")
	var panel := LanguagePanel.new()
	panel.setup(_sfx)
	# Every label was built in the old language, so rebuild the whole screen.
	panel.chosen.connect(func(_code: String): get_tree().reload_current_scene())
	add_child(panel)


func _on_toggle_sound() -> void:
	GameState.sound_enabled = not GameState.sound_enabled
	GameState.save_progress()
	_sfx.play("button_tap")
	_refresh_sound_label()


func _refresh_sound_label() -> void:
	_sound_button.set_meta("icon_kind", "sound_on" if GameState.sound_enabled else "sound_off")
	_sound_button.queue_redraw()
