class_name MainMenuScreen
extends Control

## The game's front door, hyper-casual style: a bouncing two-line logo over a
## rotating sunburst with googly pieces orbiting it, one huge pulsing PLAY
## button that jumps straight into your next level, a secondary LEVELS button,
## and the sound toggle / gem counter tucked into the top corners.

const SUNBURST_SHADER := preload("res://shaders/sunburst.gdshader")

var play_button: Button

var _sound_button: Button
var _sfx: Sfx
var _logo: Control
var _time := 0.0

## Decorative googly pieces floating around the logo: cells, hue, mood, target,
## anchor (fraction of the logo box), cell size and bob phase.
const DECOR := [
	{"cells": [Vector2i(0, 0), Vector2i(1, 0)], "hue": Palette.Hue.YELLOW,
		"mood": PieceData.Mood.AFFECTIONATE, "target": Palette.Hue.GREEN,
		"at": Vector2(0.03, 0.02), "cs": 62.0, "phase": 0.0},
	{"cells": [Vector2i(0, 0), Vector2i(0, 1)], "hue": Palette.Hue.BLUE,
		"mood": PieceData.Mood.HOSTILE, "target": Palette.Hue.PINK,
		"at": Vector2(0.84, 0.0), "cs": 58.0, "phase": 1.3},
	{"cells": [Vector2i(0, 0)], "hue": Palette.Hue.PINK,
		"mood": PieceData.Mood.NEUTRAL, "target": 0,
		"at": Vector2(0.05, 0.78), "cs": 64.0, "phase": 2.4},
	{"cells": [Vector2i(0, 0), Vector2i(1, 0), Vector2i(1, 1)], "hue": Palette.Hue.GREEN,
		"mood": PieceData.Mood.NEUTRAL, "target": 0,
		"at": Vector2(0.72, 0.8), "cs": 54.0, "phase": 3.6},
]


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

	var bg := Background.new()
	bg.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(bg)

	_sfx = Sfx.new()
	add_child(_sfx)

	_build_top_bar()

	var center := CenterContainer.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	center.offset_top = 60
	add_child(center)

	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 26)
	col.alignment = BoxContainer.ALIGNMENT_CENTER
	center.add_child(col)

	_build_logo(col)

	var gap := Control.new()
	gap.custom_minimum_size = Vector2(0, 40)
	col.add_child(gap)

	play_button = Button.new()
	play_button.text = "PLAY"
	play_button.focus_mode = Control.FOCUS_NONE
	play_button.custom_minimum_size = Vector2(380, 128)
	play_button.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	play_button.add_theme_font_size_override("font_size", 60)
	Art.style_button(play_button, Art.ACCENT_PRIMARY)
	UiFx.juicy(play_button)
	play_button.pressed.connect(_on_play)
	col.add_child(play_button)

	var level_label := Label.new()
	level_label.text = "Level %d" % (GameState.highest_unlocked + 1)
	level_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	Art.style_label(level_label, 28)
	col.add_child(level_label)

	var levels := Button.new()
	levels.text = "LEVELS"
	levels.focus_mode = Control.FOCUS_NONE
	levels.custom_minimum_size = Vector2(260, 84)
	levels.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	levels.add_theme_font_size_override("font_size", 34)
	Art.style_button(levels, Art.ACCENT_BLUE)
	UiFx.juicy(levels)
	levels.pressed.connect(_on_levels)
	col.add_child(levels)

	if Fx.juice_enabled():
		UiFx.pop_in(_logo, 0.05, 0.5)
		UiFx.pop_in(play_button, 0.25)
		UiFx.pop_in(level_label, 0.35)
		UiFx.pop_in(levels, 0.42)
		var t := create_tween()
		t.tween_interval(0.7)
		t.tween_callback(func(): UiFx.pulse(play_button, 0.05, 1.1))


func _build_top_bar() -> void:
	var bar := HBoxContainer.new()
	bar.set_anchors_and_offsets_preset(Control.PRESET_TOP_WIDE)
	add_child(bar)
	var safe := UiFx.safe_insets(self)
	bar.offset_top = 22 + safe.top
	bar.offset_bottom = 22 + 68 + safe.top
	UiFx.cap_width(bar, self, 900.0, 18.0, safe.left, safe.right)

	_sound_button = Art.icon_button("sound_on", Color.TRANSPARENT, 64.0)
	UiFx.juicy(_sound_button)
	_sound_button.pressed.connect(_on_toggle_sound)
	bar.add_child(_sound_button)
	_refresh_sound_label()

	var spacer := Control.new()
	spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	bar.add_child(spacer)

	var chip := Art.build_diamond_chip()
	chip.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	bar.add_child(chip)
	(chip.find_child("Count", true, false) as Label).text = str(GameState.diamonds)


func _build_logo(parent: Control) -> void:
	_logo = Control.new()
	_logo.custom_minimum_size = Vector2(640, 380)
	_logo.mouse_filter = Control.MOUSE_FILTER_IGNORE
	parent.add_child(_logo)

	var burst := ColorRect.new()
	var bm := ShaderMaterial.new()
	bm.shader = SUNBURST_SHADER
	bm.set_shader_parameter("ray_color", Color(1, 1, 1, 0.22))
	bm.set_shader_parameter("speed", 0.12)
	burst.material = bm
	burst.mouse_filter = Control.MOUSE_FILTER_IGNORE
	burst.size = Vector2(900, 900)
	burst.position = Vector2(320, 190) - burst.size * 0.5
	_logo.add_child(burst)

	var art := Control.new()
	art.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	art.mouse_filter = Control.MOUSE_FILTER_IGNORE
	art.draw.connect(func(): _draw_logo(art))
	_logo.add_child(art)
	_logo.set_meta("art", art)


func _process(delta: float) -> void:
	if not is_visible_in_tree() or _logo == null:
		return
	_time += delta
	# Redraw the logo art node itself -- it is what carries the draw callback.
	var art: Control = _logo.get_meta("art")
	art.queue_redraw()


func _draw_logo(ci: Control) -> void:
	# Floating googly pieces first, so the title sits on top of them.
	for d in DECOR:
		var cells: Array[Vector2i] = []
		for c in d.cells:
			cells.append(c)
		var bob := sin(_time * 1.6 + d.phase) * 8.0
		var at: Vector2 = d.at
		var pos := Vector2(at.x * ci.size.x, at.y * ci.size.y + bob)
		var blink := 1.0 if fmod(_time + d.phase * 1.7, 4.0) < 0.12 else 0.0
		Art.draw_polyomino(ci, pos, d.cs, cells, d.hue, cells[0], d.mood, d.target,
			false, 1.0, [], blink)

	var font := ci.get_theme_default_font()
	_draw_word(ci, font, "COZY", Vector2(ci.size.x * 0.5, 165), 112,
		[Palette.Hue.CORAL, Palette.Hue.ORANGE, Palette.Hue.YELLOW, Palette.Hue.GREEN], 0.0)
	_draw_word(ci, font, "BLOCKS", Vector2(ci.size.x * 0.5, 285), 96,
		[Palette.Hue.TEAL, Palette.Hue.BLUE, Palette.Hue.PURPLE, Palette.Hue.PINK,
			Palette.Hue.CORAL, Palette.Hue.ORANGE], 1.5)


## One word, letter by letter: each glyph gets its own palette colour, a fat
## dark outline, a hard drop shadow, a gloss stripe, and its own bob phase.
func _draw_word(ci: Control, font: Font, word: String, centre: Vector2, fs: int,
		hues: Array, phase0: float) -> void:
	var widths: Array[float] = []
	var total := 0.0
	var spacing := -2.0
	for ch in word:
		var w := font.get_string_size(ch, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x
		widths.append(w)
		total += w + spacing
	total -= spacing
	var x := centre.x - total * 0.5
	var outline := int(fs * 0.2)
	for i in word.length():
		var ch := word[i]
		var bob := sin(_time * 3.0 + phase0 + i * 0.55) * 5.0
		var p := Vector2(x, centre.y + bob)
		var col := Palette.fill(hues[i % hues.size()])
		ci.draw_string_outline(font, p + Vector2(0, fs * 0.09), ch, HORIZONTAL_ALIGNMENT_LEFT, -1, fs,
			outline, Art.TEXT_OUTLINE)
		ci.draw_string(font, p + Vector2(0, fs * 0.09), ch, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, Art.TEXT_OUTLINE)
		ci.draw_string_outline(font, p, ch, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, outline, Art.TEXT_OUTLINE)
		ci.draw_string(font, p, ch, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, col)
		# A small highlight dot per letter reads as candy shine at this size.
		ci.draw_circle(p + Vector2(widths[i] * 0.3, -fs * 0.52), fs * 0.045, Color(1, 1, 1, 0.75))
		x += widths[i] + spacing


func _on_play() -> void:
	_sfx.play("button_tap")
	_sfx.play("whoosh", -4.0)
	GameState.current_level = GameState.highest_unlocked
	Transition.go(get_tree(), "res://scenes/Main.tscn")


func _on_levels() -> void:
	_sfx.play("button_tap")
	_sfx.play("whoosh", -4.0)
	Transition.go(get_tree(), "res://scenes/LevelSelect.tscn")


func _on_toggle_sound() -> void:
	GameState.sound_enabled = not GameState.sound_enabled
	GameState.save_progress()
	_sfx.play("button_tap")
	_refresh_sound_label()


func _refresh_sound_label() -> void:
	_sound_button.set_meta("icon_kind", "sound_on" if GameState.sound_enabled else "sound_off")
	_sound_button.queue_redraw()
