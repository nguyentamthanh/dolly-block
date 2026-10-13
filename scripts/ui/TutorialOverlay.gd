class_name TutorialOverlay
extends Control

## How-to-play cards: five short steps, each with a looping code-drawn
## animation of the rule it teaches (fill the board, rotate, hearts, bolts,
## winning). Shown automatically on a player's first level and again from the
## HUD's "?" button. NEXT walks through the steps; the cross skips them all.

signal finished

const CARD_SIZE := Vector2(580, 790)
const STAGE_RECT := Rect2(30, 108, 520, 300)

var _steps := [
	{"title": "FILL THE BOARD", "color": Art.ACCENT_BLUE,
		"body": "Drag pieces from the tray onto the board.\nFill every empty cell!"},
	{"title": "TAP TO ROTATE", "color": Art.ACCENT_GOLD,
		"body": "Tap a piece to turn it,\nthen drag it into place."},
	{"title": "HEARTS = LOVE", "color": Art.ACCENT_PINK,
		"body": "A heart means the block LOVES that color.\nPut it next to a block of that color."},
	{"title": "BOLTS = DISLIKE", "color": Art.BAD_TINT,
		"body": "A bolt means the block HATES that color.\nKeep them apart, or it gets upset\n(red ring)."},
	{"title": "MAKE THEM HAPPY", "color": Art.ACCENT_PRIMARY,
		"body": "Fill the board with every block happy to win!\nStuck? Undo a move, or use a Hint\nfor %d diamonds." % GameState.HINT_COST},
]

var _card: Panel
var _stage: Control
var _title: Label
var _body: Label
var _dots: Control
var _next: Button
var _sfx: Sfx
var _step := 0
var _t := 0.0


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP  # the board waits underneath
	z_index = 255  # over the win panel, under the rewarded-ad popup
	visible = false
	set_process(false)

	var dim := ColorRect.new()
	dim.color = Color(0.1, 0.04, 0.28, 0.66)
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

	var how := Label.new()
	how.text = "HOW TO PLAY"
	how.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	how.position = Vector2(0, 18)
	how.size = Vector2(CARD_SIZE.x, 30)
	how.add_theme_font_size_override("font_size", 20)
	how.add_theme_color_override("font_color", Art.INK_SOFT)
	_card.add_child(how)

	_title = Label.new()
	_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_title.position = Vector2(20, 44)
	_title.size = Vector2(CARD_SIZE.x - 40, 60)
	_card.add_child(_title)

	_stage = Control.new()
	_stage.position = STAGE_RECT.position
	_stage.size = STAGE_RECT.size
	_stage.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_stage.clip_contents = true
	_stage.draw.connect(_draw_stage)
	_card.add_child(_stage)

	_body = Label.new()
	_body.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_body.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_body.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_body.position = Vector2(30, 420)
	_body.size = Vector2(CARD_SIZE.x - 60, 150)
	_body.add_theme_font_size_override("font_size", 26)
	_body.add_theme_color_override("font_color", Art.INK)
	_card.add_child(_body)

	_dots = Control.new()
	_dots.position = Vector2(0, 584)
	_dots.size = Vector2(CARD_SIZE.x, 24)
	_dots.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_dots.draw.connect(_draw_dots)
	_card.add_child(_dots)

	_next = Button.new()
	_next.focus_mode = Control.FOCUS_NONE
	_next.position = Vector2(CARD_SIZE.x * 0.5 - 170, 640)
	_next.size = Vector2(340, 100)
	_next.add_theme_font_size_override("font_size", 40)
	Art.style_button(_next, Art.ACCENT_PRIMARY)
	UiFx.juicy(_next)
	_next.pressed.connect(_on_next)
	_card.add_child(_next)

	var close := Art.icon_button("close", Art.ACCENT_PINK, 60.0)
	close.position = Vector2(CARD_SIZE.x - 46, -14)
	UiFx.juicy(close)
	close.pressed.connect(func():
		_tap()
		_close())
	_card.add_child(close)


func setup(sfx: Sfx) -> void:
	_sfx = sfx


func show_tutorial() -> void:
	visible = true
	set_process(true)
	_show_step(0)
	UiFx.pop_in(_card, 0.0, 0.32)


func _show_step(i: int) -> void:
	_step = i
	_t = 0.0
	var s: Dictionary = _steps[i]
	_title.text = s.title
	Art.style_label(_title, 42, s.color)
	_body.text = s.body
	_next.text = "LET'S PLAY!" if i == _steps.size() - 1 else "NEXT"
	_dots.queue_redraw()
	_stage.queue_redraw()
	_stage.position = STAGE_RECT.position  # slide_in reads it as the target
	_stage.modulate.a = 1.0
	if i > 0 and Fx.juice_enabled():
		UiFx.slide_in(_stage, Vector2(60, 0), 0.0, 0.3)


func _on_next() -> void:
	_tap()
	if _step < _steps.size() - 1:
		_show_step(_step + 1)
	else:
		_close()


func _close() -> void:
	visible = false
	set_process(false)
	finished.emit()


func _tap() -> void:
	if _sfx != null:
		_sfx.play("button_tap")


func _process(delta: float) -> void:
	_t += delta
	_stage.queue_redraw()


func _draw_dots() -> void:
	var gap := 30.0
	var x0 := CARD_SIZE.x * 0.5 - gap * (_steps.size() - 1) * 0.5
	for i in _steps.size():
		var c := Vector2(x0 + i * gap, 12)
		if i == _step:
			_dots.draw_style_box(Art.box(Art.ACCENT_PINK, 8.0), Rect2(c - Vector2(16, 8), Vector2(32, 16)))
		else:
			_dots.draw_circle(c, 7.0, Art.CARD_EDGE.darkened(0.15))


# --- Stage animations ---------------------------------------------------------
# Each loops on its own period, driven by _t (seconds since the step opened).

func _draw_stage() -> void:
	match _step:
		0:
			_draw_fill()
		1:
			_draw_rotate()
		2:
			_draw_love()
		3:
			_draw_hate()
		4:
			_draw_win()


## A 3x2 board with the top row filled; an orange bar slides up from the tray
## into the empty bottom row, finger and all, then everyone cheers.
func _draw_fill() -> void:
	var cs := 66.0
	var board_cells: Array = []
	for y in 2:
		for x in 3:
			board_cells.append(Vector2i(x, y))
	var origin := Vector2((STAGE_RECT.size.x - cs * 3) * 0.5, 34)
	Art.draw_board(_stage, board_cells, origin, cs)
	var top: Array[Vector2i] = [Vector2i(0, 0), Vector2i(1, 0), Vector2i(2, 0)]
	var bar: Array[Vector2i] = [Vector2i(0, 0), Vector2i(1, 0), Vector2i(2, 0)]
	var period := 2.8
	var p := fmod(_t, period)
	var move := clampf((p - 0.5) / 0.9, 0.0, 1.0)
	move = move * move * (3.0 - 2.0 * move)  # smoothstep
	var placed := p >= 1.4
	var start := origin + Vector2(0, cs * 2 + 38)
	var target := origin + Vector2(0, cs)
	var pos := start.lerp(target, move)
	# Board neighbours are in each piece's own cell coordinates: once the bar
	# lands, the two rows fuse along their shared edge.
	var below: Array = [Vector2i(0, 1), Vector2i(1, 1), Vector2i(2, 1)]
	var above: Array = [Vector2i(0, -1), Vector2i(1, -1), Vector2i(2, -1)]
	Art.draw_polyomino(_stage, origin, cs, top, Palette.Hue.TEAL, Vector2i(0, 0),
		PieceData.Mood.NEUTRAL, 0, false, 1.0, below if placed else [], 0.0, placed)
	if not placed:
		var pulse := 0.35 + 0.25 * sin(_t * 6.0)
		Art.draw_ghost(_stage, target, cs, bar, Color(1, 1, 1, pulse * 0.5), Color(1, 1, 1, pulse))
	var hop := -absf(sin((p - 1.4) * 9.0)) * 8.0 if placed and p < 1.75 else 0.0
	Art.draw_polyomino(_stage, pos + Vector2(0, hop), cs, bar, Palette.Hue.ORANGE, Vector2i(2, 0),
		PieceData.Mood.NEUTRAL, 0, false, 1.0, above if placed else [], 0.0, placed)
	if not placed:
		_draw_finger(pos + Vector2(cs * 1.5, cs * 0.6), p > 0.35)


## An L piece that turns a quarter every beat, with a tap ripple on each turn.
func _draw_rotate() -> void:
	var cs := 62.0
	var beat := 1.1
	var piece := PieceData.make(0, Palette.Hue.PURPLE,
		[Vector2i(0, 0), Vector2i(0, 1), Vector2i(0, 2), Vector2i(1, 2)])
	piece.rot = int(_t / beat) % 4
	var cells := piece.local_cells()
	var bb := Vector2(piece.bbox()) * cs
	var origin := (STAGE_RECT.size - bb) * 0.5 + Vector2(0, 8)
	var since := fmod(_t, beat)
	var squash := 1.0 - 0.08 * maxf(0.0, 1.0 - since / 0.15)
	var c := origin + bb * 0.5
	_stage.draw_set_transform(c, 0.0, Vector2(squash, squash))
	Art.draw_polyomino(_stage, -bb * 0.5, cs, cells, Palette.Hue.PURPLE, piece.local_eye(),
		PieceData.Mood.NEUTRAL, 0, false)
	_stage.draw_set_transform(Vector2.ZERO)
	# Circular "turn" arrow around the piece.
	var r := maxf(bb.x, bb.y) * 0.5 + 34.0
	var a0 := -PI * 0.5 + _t * 0.8
	_stage.draw_arc(c, r, a0, a0 + PI * 1.4, 40, Color(Art.ACCENT_GOLD, 0.9), 7.0, true)
	var tip_a := a0 + PI * 1.4
	var tip := c + Vector2(cos(tip_a), sin(tip_a)) * r
	var fwd := Vector2(-sin(tip_a), cos(tip_a))
	var side := Vector2(cos(tip_a), sin(tip_a))
	_stage.draw_colored_polygon(PackedVector2Array([
		tip + fwd * 16.0, tip - fwd * 4.0 + side * 13.0, tip - fwd * 4.0 - side * 13.0]), Art.ACCENT_GOLD)
	_draw_finger(c + Vector2(cs * 0.2, cs * 0.3), since < 0.2, since)


## A yellow bar that loves blue: alone it waits, then a blue bar slides in
## beside it and it lights up with ^ ^ eyes and a green tick.
func _draw_love() -> void:
	var cs := 66.0
	var pair: Array[Vector2i] = [Vector2i(0, 0), Vector2i(1, 0)]
	var period := 2.6
	var p := fmod(_t, period)
	var slide := clampf((p - 0.4) / 0.7, 0.0, 1.0)
	slide = slide * slide * (3.0 - 2.0 * slide)
	var touching := p >= 1.1
	var y := 128.0
	var lover := Vector2(STAGE_RECT.size.x * 0.5 - cs * 2, y)
	var friend := Vector2(STAGE_RECT.size.x + 10, y).lerp(lover + Vector2(cs * 2, 0), slide)
	var hop := -absf(sin((p - 1.1) * 9.0)) * 10.0 if touching and p < 1.45 else 0.0
	Art.draw_polyomino(_stage, lover + Vector2(0, hop), cs, pair, Palette.Hue.YELLOW, Vector2i(0, 0),
		PieceData.Mood.AFFECTIONATE, Palette.Hue.BLUE, false, 1.0,
		[Vector2i(2, 0)] if touching else [], 0.0, touching)
	Art.draw_polyomino(_stage, friend, cs, pair, Palette.Hue.BLUE, Vector2i(1, 0),
		PieceData.Mood.NEUTRAL, 0, false, 1.0, [Vector2i(-1, 0)] if touching else [])
	if touching:
		_draw_verdict(Vector2(STAGE_RECT.size.x * 0.5, 54), true)
		_draw_heart_burst(lover + Vector2(cs, -6), p - 1.1)


## A purple bar that hates green: a green bar slides in, it turns upset (red
## ring, shiver, red cross), then the green bar leaves and it calms down.
## Purple, not pink: the red ring has to stand out against the body.
func _draw_hate() -> void:
	var cs := 66.0
	var pair: Array[Vector2i] = [Vector2i(0, 0), Vector2i(1, 0)]
	var period := 3.4
	var p := fmod(_t, period)
	var y := 128.0
	var hater := Vector2(STAGE_RECT.size.x * 0.5 - cs * 2, y)
	var near := hater + Vector2(cs * 2, 0)
	var far := Vector2(STAGE_RECT.size.x + 10, y)
	var t_in := clampf((p - 0.3) / 0.6, 0.0, 1.0)
	var t_out := clampf((p - 2.3) / 0.6, 0.0, 1.0)
	var k := t_in - t_out
	k = k * k * (3.0 - 2.0 * k)
	var other := far.lerp(near, k)
	var touching := p >= 0.9 and p < 2.3
	var shiver := Vector2(sin(_t * 48.0) * 3.0, 0) if touching else Vector2.ZERO
	Art.draw_polyomino(_stage, hater + shiver, cs, pair, Palette.Hue.PURPLE, Vector2i(0, 0),
		PieceData.Mood.HOSTILE, Palette.Hue.GREEN, touching, 1.0,
		[Vector2i(2, 0)] if touching else [], 0.0, false, 0.75 + 0.25 * sin(_t * 8.0))
	Art.draw_polyomino(_stage, other, cs, pair, Palette.Hue.GREEN, Vector2i(1, 0),
		PieceData.Mood.NEUTRAL, 0, false, 1.0, [Vector2i(-1, 0)] if touching else [])
	if touching:
		_draw_verdict(Vector2(STAGE_RECT.size.x * 0.5, 54), false)
	elif p >= 2.9 or p < 0.3:
		_draw_verdict(Vector2(STAGE_RECT.size.x * 0.5, 54), true)


## Three stars popping in turn above the Undo and Hint buttons.
func _draw_win() -> void:
	var period := 2.4
	var p := fmod(_t, period)
	var cx := STAGE_RECT.size.x * 0.5
	for i in 3:
		var appear := clampf((p - i * 0.25) / 0.2, 0.0, 1.0)
		var r := (34.0 if i == 1 else 28.0) * (0.6 + 0.4 * appear)
		var c := Vector2(cx + (i - 1) * 92.0, 70.0 if i == 1 else 84.0)
		Art.draw_star_fancy(_stage, c, r, appear >= 1.0)
	var f := _stage.get_theme_default_font()
	var specs := [
		{"kind": "undo", "col": Art.ACCENT_BLUE, "label": "Undo", "x": cx - 90.0},
		{"kind": "hint", "col": Art.ACCENT_GOLD, "label": "Hint", "x": cx + 90.0},
	]
	for s in specs:
		var c2 := Vector2(s.x, 200)
		_stage.draw_circle(c2 + Vector2(0, 6), 38.0, s.col.darkened(0.28))
		_stage.draw_circle(c2, 38.0, s.col)
		Art.draw_icon(_stage, s.kind, c2 + Vector2(0, 2), 12.0, s.col.darkened(0.45))
		Art.draw_icon(_stage, s.kind, c2, 12.0, Art.WHITE)
		_stage.draw_string(f, Vector2(s.x - 60, 274), s.label, HORIZONTAL_ALIGNMENT_CENTER, 120, 24, Art.INK)


## A cartoon fingertip: white disc with the sticker outline. `pressed` adds a
## ripple ring that grows over `age` seconds.
func _draw_finger(at: Vector2, pressed: bool, age := 0.0) -> void:
	if pressed:
		var rr := 30.0 + age * 90.0
		var a := clampf(1.0 - age / 0.4, 0.0, 1.0) * 0.8 if age > 0.0 else 0.6
		_stage.draw_arc(at, rr, 0.0, TAU, 32, Color(1, 1, 1, a), 5.0, true)
	var r := 22.0 if pressed else 25.0
	_stage.draw_circle(at + Vector2(0, 4), r + 4.0, Color(0.05, 0.02, 0.2, 0.25))
	_stage.draw_circle(at, r + 4.0, Art.OUTLINE)
	_stage.draw_circle(at, r, Art.WHITE)
	_stage.draw_circle(at + Vector2(-r * 0.3, -r * 0.3), r * 0.25, Color(1, 1, 1, 0.9))


## Green tick (good) or red cross (bad) in a round badge.
func _draw_verdict(c: Vector2, good: bool) -> void:
	var col := Art.OK_TINT if good else Art.BAD_TINT
	_stage.draw_circle(c + Vector2(0, 4), 30.0, col.darkened(0.3))
	_stage.draw_circle(c, 30.0, col)
	var w := 8.0
	if good:
		_stage.draw_polyline(PackedVector2Array([c + Vector2(-13, 0), c + Vector2(-3, 10), c + Vector2(14, -10)]),
			Art.WHITE, w, true)
	else:
		_stage.draw_line(c + Vector2(-11, -11), c + Vector2(11, 11), Art.WHITE, w, true)
		_stage.draw_line(c + Vector2(11, -11), c + Vector2(-11, 11), Art.WHITE, w, true)


## Little hearts drifting up from `c` for `age` seconds after the match.
func _draw_heart_burst(c: Vector2, age: float) -> void:
	if age > 1.2:
		return
	var a := clampf(1.0 - age / 1.2, 0.0, 1.0)
	for i in 3:
		var off := Vector2((i - 1) * 34.0, -age * 70.0 - absf(i - 1) * 8.0)
		Art.draw_heart(_stage, c + off, 22.0, Color(Art.ACCENT_PINK, a))
