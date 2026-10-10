class_name LevelSelectScreen
extends Control

## A scrollable, centred grid of chunky candy level tiles. Locked/unlocked via
## GameState.highest_unlocked; cleared tiles show their earned stars, the next
## level to play pulses gold with a bouncing marker, and the grid scrolls to it
## on open. A pragmatic fixed cap rather than infinite scroll -- 60 covers all
## four difficulty tiers with headroom.

## Minimum number of tiles shown. Levels are generated on demand, so the grid
## also grows to always show a few rows beyond the player's progress.
const MAX_LEVELS := 60
const COLS := 5
const MIN_COLS := 4
const MAX_COLS := 10
const TILE := 108.0
const GAP := 16

var grid: GridContainer

var _sfx: Sfx
var _scroll: ScrollContainer
var _current_tile: Button


func _ready() -> void:
	GameState.ensure_loaded()
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)

	var bg := Background.new()
	bg.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(bg)

	_sfx = Sfx.new()
	add_child(_sfx)

	var layout := VBoxContainer.new()
	layout.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	layout.add_theme_constant_override("separation", 0)
	add_child(layout)

	_build_top_bar(layout)
	_build_legend(layout)

	_scroll = ScrollContainer.new()
	_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	layout.add_child(_scroll)

	# The scroll child must EXPAND horizontally, or the grid hugs the left edge
	# (the old layout bug); the grid itself then centres inside it.
	var margin := MarginContainer.new()
	margin.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	margin.add_theme_constant_override("margin_top", 18)
	margin.add_theme_constant_override("margin_bottom", 40)
	_scroll.add_child(margin)

	grid = GridContainer.new()
	grid.columns = COLS
	grid.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	grid.add_theme_constant_override("h_separation", GAP)
	grid.add_theme_constant_override("v_separation", GAP + 6)
	margin.add_child(grid)

	_build_tiles()
	resized.connect(_fit_columns)
	_fit_columns()
	_scroll_to_current.call_deferred()


## As many columns as fit (4..10): 5 on a phone, more on tablets/desktop.
func _fit_columns() -> void:
	var w := size.x if size.x > 1.0 else get_viewport_rect().size.x
	var cols := int((w - 40.0 + GAP) / (TILE + GAP))
	grid.columns = clampi(cols, MIN_COLS, MAX_COLS)


func _level_count() -> int:
	return maxi(MAX_LEVELS, GameState.highest_unlocked + 1 + MAX_COLS * 2)


func _build_top_bar(parent: Control) -> void:
	var bar := Control.new()
	bar.custom_minimum_size = Vector2(0, 110)
	parent.add_child(bar)

	var title := Label.new()
	title.text = "LEVELS"
	title.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	title.offset_top = 16
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	Art.style_label(title, 52)
	bar.add_child(title)

	var row := HBoxContainer.new()
	row.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	UiFx.cap_width(row, self, 900.0, 18.0)
	row.offset_top = 22
	row.offset_bottom = -6
	bar.add_child(row)

	var back := Art.icon_button("back", Color.TRANSPARENT, 64.0)
	UiFx.juicy(back)
	back.pressed.connect(func():
		_sfx.play("button_tap")
		_sfx.play("whoosh", -4.0)
		Transition.go(get_tree(), "res://scenes/MainMenu.tscn"))
	row.add_child(back)

	var spacer := Control.new()
	spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(spacer)

	var chip := Art.build_diamond_chip()
	chip.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	row.add_child(chip)
	(chip.find_child("Count", true, false) as Label).text = str(GameState.diamonds)

	# Below a phone notch; the bar's children are anchored to its full rect.
	var top: float = UiFx.safe_insets(bar).top
	if top > 0.0:
		bar.custom_minimum_size.y += top
		title.offset_top += top
		row.offset_top += top


## One row of tier pills so the tile colours explain themselves.
func _build_legend(parent: Control) -> void:
	var center := CenterContainer.new()
	center.custom_minimum_size = Vector2(0, 44)
	parent.add_child(center)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	center.add_child(row)
	for i in LevelGenerator.TIERS.size():
		var pill := PanelContainer.new()
		var c := Art.tier_color(i)
		var sb := Art.box(c, 14.0)
		sb.border_width_bottom = 3
		sb.border_color = c.darkened(0.3)
		sb.content_margin_left = 12
		sb.content_margin_right = 12
		sb.content_margin_top = 2
		sb.content_margin_bottom = 4
		pill.add_theme_stylebox_override("panel", sb)
		var l := Label.new()
		l.text = String(LevelGenerator.TIERS[i].name)
		Art.style_label(l, 17, Art.WHITE, c.darkened(0.5), 5)
		pill.add_child(l)
		row.add_child(pill)


func _build_tiles() -> void:
	for c in grid.get_children():
		c.queue_free()
	for i in _level_count():
		var tile := _make_tile(i)
		grid.add_child(tile)
		if Fx.juice_enabled():
			UiFx.pop_in(tile, 0.05 + minf(i, 30) * 0.018, 0.32)


func _make_tile(index: int) -> Button:
	var b := Button.new()
	b.focus_mode = Control.FOCUS_NONE
	# PASS, not STOP: a finger drag that starts on a tile must still reach the
	# ScrollContainer, or the list can only be scrolled from the gaps.
	b.mouse_filter = Control.MOUSE_FILTER_PASS
	b.custom_minimum_size = Vector2(TILE, TILE)
	b.add_theme_font_size_override("font_size", 40)

	var unlocked := index <= GameState.highest_unlocked
	var stars := GameState.stars_for(index)
	var tier := LevelGenerator.tier_for_level(index)
	var is_current := index == GameState.highest_unlocked

	if not unlocked:
		# Locked: a dark frosted tile with a lock, clearly "not yet" rather than
		# a missing asset. Disabled so taps do nothing.
		b.disabled = true
		var sb := Art.box(Color(0.12, 0.06, 0.38, 0.32), 30.0)
		sb.border_width_bottom = 6
		sb.border_color = Color(0.08, 0.03, 0.28, 0.35)
		for s in ["normal", "hover", "pressed", "disabled"]:
			b.add_theme_stylebox_override(s, sb)
		b.add_theme_stylebox_override("focus", StyleBoxEmpty.new())
		var lock_layer := Control.new()
		lock_layer.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		lock_layer.mouse_filter = Control.MOUSE_FILTER_IGNORE
		lock_layer.draw.connect(func():
			Art.draw_lock(lock_layer, lock_layer.size * 0.5 + Vector2(0, 2), 26.0,
				Color(1, 1, 1, 0.55), Color(0.12, 0.06, 0.38, 0.9)))
		b.add_child(lock_layer)
		return b

	b.text = str(index + 1)
	# Cleared > current > tier colour.
	var accent: Color
	if stars > 0:
		accent = Art.OK_TINT
	elif is_current:
		accent = Art.ACCENT_GOLD
	else:
		accent = Art.tier_color(tier)
	Art.style_button(b, accent, 32.0)
	b.add_theme_constant_override("outline_size", 10)
	UiFx.juicy(b)
	b.pressed.connect(_on_pick.bind(index))

	if stars > 0:
		var star_row := Control.new()
		star_row.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_WIDE)
		star_row.offset_top = -10
		star_row.offset_bottom = 14
		star_row.mouse_filter = Control.MOUSE_FILTER_IGNORE
		star_row.draw.connect(func(): _draw_tile_stars(star_row, stars))
		b.add_child(star_row)

	if is_current:
		# The next level to play: gold, breathing, with a little "play" badge
		# tucked into its corner.
		_current_tile = b
		var badge := Control.new()
		badge.mouse_filter = Control.MOUSE_FILTER_IGNORE
		badge.size = Vector2(38, 38)
		badge.position = Vector2(TILE - 30, -10)
		badge.draw.connect(func():
			var c := badge.size * 0.5
			badge.draw_circle(c, 19.0, Art.TEXT_OUTLINE)
			badge.draw_circle(c, 16.0, Art.ACCENT_PINK)
			Art.draw_icon(badge, "play", c + Vector2(1, 0), 11.0, Art.WHITE))
		b.add_child(badge)
		if Fx.juice_enabled():
			var pt := b.create_tween()
			pt.tween_interval(0.9)
			pt.tween_callback(func(): UiFx.pulse(b, 0.06, 1.0))

	return b


func _draw_tile_stars(ci: Control, stars: int) -> void:
	var r := 11.0
	var gap := 25.0
	var start_x := ci.size.x * 0.5 - gap
	for s in 3:
		Art.draw_star_fancy(ci, Vector2(start_x + s * gap, ci.size.y * 0.5 + (0.0 if s == 1 else 2.0)),
			r if s == 1 else r * 0.85, s < stars)


func _scroll_to_current() -> void:
	if _current_tile == null or _scroll == null:
		return
	# Wait one frame for the grid to lay out -- via a tween bound to this node,
	# so leaving the screen first can't resume a coroutine on a freed instance.
	var t := create_tween()
	t.tween_interval(0.0)
	t.tween_callback(func():
		if not is_instance_valid(_current_tile):
			return
		var y := _current_tile.position.y + TILE * 0.5 - _scroll.size.y * 0.5
		_scroll.scroll_vertical = int(maxf(0.0, y)))


func _on_pick(index: int) -> void:
	_sfx.play("button_tap")
	_sfx.play("whoosh", -4.0)
	GameState.current_level = index
	Transition.go(get_tree(), "res://scenes/Main.tscn")
