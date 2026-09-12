class_name Art
extends RefCounted

## Procedural drawing for the Dolly Blocks look: cream room, white board,
## blob polyominoes with googly eyes, thought-bubble feelings, polaroids.

const CORNER := 0.22

const BG := Color("#f4ebe3")
const BG_TOP := Color("#f7f0e9")
const INK := Color("#5c534c")
const INK_SOFT := Color("#8a8078")
const BROWN := Color("#a08668")
const BROWN_DARK := Color("#8b7355")
const WHITE := Color("#fffdf9")
const CELL_EMPTY := Color("#f0ebe4")
const CELL_DOT := Color("#d5ccc3")
const CELL_LINE := Color("#d5ccc3")
const OK_TINT := Color("#8fd9a8")
const BAD_TINT := Color("#f09a9a")
const STAR := Color("#f0c24a")
const DIAMOND := Color("#3dcc6e")
const PILL := Color("#fffdfb")

const BG_NAMES := ["Meadow", "Dunes", "Garden", "Road", "Moon"]
const BG_COUNT := 5
const BG_BOTTOM := BG


static func box(fill: Color, radius: float, border := 0.0,
		border_color := Color.TRANSPARENT) -> StyleBoxFlat:
	var sb := StyleBoxFlat.new()
	sb.bg_color = fill
	sb.set_corner_radius_all(int(radius))
	if border > 0.0:
		sb.set_border_width_all(int(border))
		sb.border_color = border_color
	return sb


## Give a Button the cozy look: a soft pill with a drop shadow that presses
## down when tapped. Pass an accent colour for a primary action (filled, white
## text); leave it default for a plain cream button with ink text.
##
## No borders -- the shadow alone separates the button from the background, and
## a stroke on a large-radius pill is exactly where Godot's StyleBoxFlat leaves
## a 1px square nub at the tips.
static func style_button(b: Button, accent := Color.TRANSPARENT) -> void:
	var filled := accent.a > 0.0
	var base := accent if filled else WHITE
	var ink := WHITE if filled else INK

	var normal := _pill(base)
	normal.shadow_color = Color(INK.r, INK.g, INK.b, 0.22)
	normal.shadow_size = 6
	normal.shadow_offset = Vector2(0, 4)
	_btn_margins(normal, 16, 11)

	var hover := _pill(base.lerp(INK, 0.06))
	hover.shadow_color = normal.shadow_color
	hover.shadow_size = 6
	hover.shadow_offset = Vector2(0, 4)
	_btn_margins(hover, 16, 11)

	var pressed := _pill(base.lerp(INK, 0.14))
	pressed.shadow_color = Color(INK.r, INK.g, INK.b, 0.16)
	pressed.shadow_size = 2
	pressed.shadow_offset = Vector2(0, 1)
	# Nudge the label down so the whole button feels physically depressed.
	_btn_margins(pressed, 16, 11)
	pressed.content_margin_top = 13
	pressed.content_margin_bottom = 9

	var disabled := _pill(base.lerp(BG, 0.55))
	_btn_margins(disabled, 16, 11)

	b.add_theme_stylebox_override("normal", normal)
	b.add_theme_stylebox_override("hover", hover)
	b.add_theme_stylebox_override("pressed", pressed)
	b.add_theme_stylebox_override("disabled", disabled)
	b.add_theme_stylebox_override("focus", _pill(Color.TRANSPARENT))
	for state in ["font_color", "font_hover_color", "font_pressed_color",
			"font_focus_color", "font_hover_pressed_color"]:
		b.add_theme_color_override(state, ink)
	b.add_theme_color_override("font_disabled_color", ink.lerp(BG, 0.45))


static func _pill(fill: Color) -> StyleBoxFlat:
	var sb := box(fill, 500.0)
	sb.corner_detail = 12
	sb.anti_aliasing_size = 0.7
	return sb


static func _btn_margins(sb: StyleBoxFlat, h: float, v: float) -> void:
	sb.content_margin_left = h
	sb.content_margin_right = h
	sb.content_margin_top = v
	sb.content_margin_bottom = v


static func box_corners(fill: Color, tl: float, tr: float, br: float, bl: float) -> StyleBoxFlat:
	var sb := StyleBoxFlat.new()
	sb.bg_color = fill
	sb.corner_radius_top_left = int(tl)
	sb.corner_radius_top_right = int(tr)
	sb.corner_radius_bottom_right = int(br)
	sb.corner_radius_bottom_left = int(bl)
	return sb


static func draw_background(ci: CanvasItem, rect: Rect2) -> void:
	ci.draw_rect(rect, BG)


static func draw_cell(ci: CanvasItem, rect: Rect2, tint: Color = Color.TRANSPARENT) -> void:
	var fill := CELL_EMPTY if tint.a == 0.0 else CELL_EMPTY.lerp(tint, 0.55)
	ci.draw_style_box(box(fill, rect.size.x * 0.28), rect)
	# Subtle inner border so empty cells read as grid, not single blob
	var border_col := CELL_DOT.lerp(Art.INK, 0.12)
	ci.draw_style_box(box(Color.TRANSPARENT, rect.size.x * 0.28, 1.5, border_col), rect)
	var d := mini(6, int(rect.size.x * 0.11))
	if d >= 2:
		ci.draw_circle(rect.get_center(), d, CELL_DOT)
		# Tiny highlight dot
		ci.draw_circle(rect.get_center() + Vector2(1, -1), maxf(1.0, d * 0.35), Color(1,1,1,0.55))


## The frame colour behind the cells; also what a hole should read as.
static func board_frame_color() -> Color:
	return CELL_LINE.lerp(INK, 0.10)


## Frame + empty playing surface in one pass, drawn as two concentric rounded
## rects (frame radius = surface radius + reveal) so the corners nest cleanly
## with no stray slivers. The surface is one flat colour -- no per-cell boxes,
## dots or inner lines, so an empty cell just looks empty. Holes, when a level
## has them, are punched back out as softly rounded gaps.
const BOARD_REVEAL := 6.0

static func draw_board(ci: CanvasItem, cells: Array, origin_px: Vector2,
		cell_size: float) -> void:
	if cells.is_empty():
		return
	var occupied := {}
	var minc := Vector2i(1 << 30, 1 << 30)
	var maxc := Vector2i(-(1 << 30), -(1 << 30))
	for c in cells:
		occupied[c] = true
		minc.x = mini(minc.x, c.x)
		minc.y = mini(minc.y, c.y)
		maxc.x = maxi(maxc.x, c.x)
		maxc.y = maxi(maxc.y, c.y)

	var tl := (origin_px + Vector2(minc.x, minc.y) * cell_size).round()
	var span := Vector2(maxc.x - minc.x + 1, maxc.y - minc.y + 1) * cell_size
	var surface_r := roundf(cell_size * 0.2)

	var frame := Rect2(tl - Vector2(BOARD_REVEAL, BOARD_REVEAL),
		span + Vector2(BOARD_REVEAL, BOARD_REVEAL) * 2.0)
	ci.draw_style_box(box(board_frame_color(), surface_r + BOARD_REVEAL), frame)
	ci.draw_style_box(box(CELL_EMPTY, surface_r), Rect2(tl, span))

	var hole_r := roundf(cell_size * 0.12)
	for y in range(minc.y, maxc.y + 1):
		for x in range(minc.x, maxc.x + 1):
			if not occupied.has(Vector2i(x, y)):
				var hr := Rect2(tl + Vector2(x - minc.x, y - minc.y) * cell_size,
					Vector2(cell_size, cell_size))
				ci.draw_style_box(box(board_frame_color(), hole_r), hr.grow(0.5))


## A soft tint on one cell, used only while a piece hovers over it.
static func draw_cell_highlight(ci: CanvasItem, rect: Rect2, tint: Color) -> void:
	ci.draw_style_box(box(CELL_EMPTY.lerp(tint, 0.55), rect.size.x * 0.28), rect)


static func draw_board_frame(ci: CanvasItem, rect: Rect2, radius: float) -> void:
	ci.draw_style_box(box(WHITE, radius), rect)


static func draw_block(ci: CanvasItem, rect: Rect2, data: BlockData, colorblind: bool = false, alpha: float = 1.0) -> void:
	if data == null:
		return
	var body := Palette.fill(int(data.color))
	body.a = alpha
	var r := rect.size.x * CORNER
	# Soft shadow.
	var sr := rect
	sr.position.y += rect.size.y * 0.045
	ci.draw_style_box(box(Color(0, 0, 0, 0.08 * alpha), r), sr)
	ci.draw_style_box(box(body, r), rect)
	# Chin shading for solidity.
	var chin := Rect2(rect.position + Vector2(0, rect.size.y * 0.72), Vector2(rect.size.x, rect.size.y * 0.28))
	var chin_col := Palette.shade(int(data.color))
	chin_col.a = alpha * 0.18
	ci.draw_style_box(box(chin_col, r * 0.5), chin)
	draw_eyes(ci, rect, alpha)
	if int(data.mood) != int(BlockData.Mood.NEUTRAL):
		var attach := rect.position + Vector2(rect.size.x * 0.92, rect.size.y * 0.08)
		draw_thought(ci, attach, rect.size.x, int(data.mood), int(data.target_color), alpha)


static func draw_polyomino(ci: CanvasItem, origin_px: Vector2, cell_size: float,
		cells: Array[Vector2i], color_id: int, eye: Vector2i,
		mood: int, target: int, unhappy: bool, alpha: float = 1.0) -> void:
	if cells.is_empty():
		return
	var occupied := {}
	for c in cells:
		occupied[c] = true
	var body := Palette.fill(color_id)
	body.a = alpha
	var r := cell_size * CORNER
	var overlap := maxf(1.0, cell_size * 0.04)

	# Soft drop shadow.
	for c in cells:
		var sr := _cell_px(origin_px, cell_size, c, occupied, overlap)
		sr.position.y += cell_size * 0.045
		ci.draw_style_box(_cell_box(Color(0, 0, 0, 0.08 * alpha), r, c, occupied), sr)

	for c in cells:
		var rect := _cell_px(origin_px, cell_size, c, occupied, overlap)
		ci.draw_style_box(_cell_box(body, r, c, occupied), rect)

	var eye_rect := _cell_px(origin_px, cell_size, eye, occupied, 0.0)
	draw_eyes(ci, eye_rect, alpha)

	if mood != BlockData.Mood.NEUTRAL:
		var attach := _bubble_attach(origin_px, cell_size, cells)
		draw_thought(ci, attach, cell_size, mood, target, alpha)

	if unhappy:
		for c in cells:
			var rect := _cell_px(origin_px, cell_size, c, occupied, overlap)
			var ring := _cell_box(Color.TRANSPARENT, r, c, occupied)
			ring.set_border_width_all(int(maxf(2.0, cell_size * 0.06)))
			ring.border_color = Color(BAD_TINT.r, BAD_TINT.g, BAD_TINT.b, alpha)
			ring.bg_color = Color.TRANSPARENT
			ci.draw_style_box(ring, rect)


static func _cell_px(origin_px: Vector2, cs: float, c: Vector2i,
		occupied: Dictionary, overlap: float) -> Rect2:
	var p := origin_px + Vector2(c.x, c.y) * cs
	var s := Vector2(cs, cs)
	if occupied.has(c + Vector2i(-1, 0)):
		p.x -= overlap
		s.x += overlap
	if occupied.has(c + Vector2i(0, -1)):
		p.y -= overlap
		s.y += overlap
	if occupied.has(c + Vector2i(1, 0)):
		s.x += overlap
	if occupied.has(c + Vector2i(0, 1)):
		s.y += overlap
	# Keep the inset no larger than half the sibling overlap. Any bigger and an
	# L/T/S piece opens a small square gap of background at its inner (concave)
	# corner, because the two cells meeting there each pull away from it.
	var inset := cs * 0.03
	if overlap > 0.0:
		inset = minf(inset, overlap * 0.5)
	return Rect2(p + Vector2(inset, inset), s - Vector2(inset, inset) * 2.0)


static func _cell_box(fill: Color, r: float, c: Vector2i, occupied: Dictionary) -> StyleBoxFlat:
	var n := occupied.has(c + Vector2i(0, -1))
	var e := occupied.has(c + Vector2i(1, 0))
	var s := occupied.has(c + Vector2i(0, 1))
	var w := occupied.has(c + Vector2i(-1, 0))
	return box_corners(fill,
		0.0 if n or w else r,
		0.0 if n or e else r,
		0.0 if s or e else r,
		0.0 if s or w else r)


static func _bubble_attach(origin_px: Vector2, cs: float, cells: Array[Vector2i]) -> Vector2:
	var best := cells[0]
	for c in cells:
		if c.x + c.y < best.x + best.y:
			best = c
		elif c.x + c.y == best.x + best.y and c.y < best.y:
			best = c
	# Prefer a cell near the top of the piece.
	var top := cells[0]
	for c in cells:
		if c.y < top.y or (c.y == top.y and c.x > top.x):
			top = c
	return origin_px + Vector2(top.x + 0.92, top.y + 0.08) * cs


static func draw_eyes(ci: CanvasItem, rect: Rect2, alpha: float) -> void:
	var s := minf(rect.size.x, rect.size.y)
	var c := rect.get_center() + Vector2(0, s * 0.02)
	var eye_r := s * 0.22
	var sep := s * 0.26
	for side in [-1.0, 1.0]:
		var ec := c + Vector2(side * sep, 0)
		ci.draw_circle(ec, eye_r, Color(1, 1, 1, alpha))
		ci.draw_arc(ec, eye_r, 0, TAU, 24, Color(0.85, 0.82, 0.78, alpha * 0.7), 1.2, true)
		var pupil := ec + Vector2(side * eye_r * 0.06, eye_r * 0.10)
		ci.draw_circle(pupil, eye_r * 0.58, Color(0.28, 0.22, 0.18, alpha))
		ci.draw_circle(pupil + Vector2(-eye_r * 0.22, -eye_r * 0.26),
			eye_r * 0.18, Color(1, 1, 1, alpha))
		ci.draw_circle(pupil + Vector2(eye_r * 0.22, -eye_r * 0.08),
			eye_r * 0.08, Color(1, 1, 1, alpha * 0.85))


static func draw_thought(ci: CanvasItem, attach: Vector2, cell_size: float,
		mood: int, target: int, alpha: float) -> void:
	var r := cell_size * 0.20
	var bubble := attach + Vector2(r * 0.15, -r * 1.15)
	var white := Color(1, 1, 1, alpha)
	ci.draw_circle(attach + Vector2(-r * 0.15, r * 0.05), r * 0.16, white)
	ci.draw_circle(attach.lerp(bubble, 0.45), r * 0.22, white)
	ci.draw_circle(bubble, r, white)
	var icon := Palette.fill(target)
	icon.a = alpha
	if mood == BlockData.Mood.AFFECTIONATE:
		draw_heart(ci, bubble, r * 0.72, icon)
	else:
		draw_bolt(ci, bubble, r * 0.78, icon)


static func draw_heart(ci: CanvasItem, c: Vector2, s: float, color: Color) -> void:
	ci.draw_circle(c + Vector2(-s * 0.28, -s * 0.12), s * 0.32, color)
	ci.draw_circle(c + Vector2(s * 0.28, -s * 0.12), s * 0.32, color)
	var pts := PackedVector2Array([
		c + Vector2(-s * 0.55, -s * 0.02),
		c + Vector2(0, s * 0.62),
		c + Vector2(s * 0.55, -s * 0.02),
	])
	ci.draw_colored_polygon(pts, color)


static func draw_bolt(ci: CanvasItem, c: Vector2, s: float, color: Color) -> void:
	var pts := PackedVector2Array([
		c + Vector2(-s * 0.05, -s * 0.70),
		c + Vector2(s * 0.38, -s * 0.08),
		c + Vector2(s * 0.08, -s * 0.08),
		c + Vector2(s * 0.18, s * 0.70),
		c + Vector2(-s * 0.40, -s * 0.02),
		c + Vector2(-s * 0.08, -s * 0.02),
	])
	ci.draw_colored_polygon(pts, color)


static func draw_star(ci: CanvasItem, c: Vector2, r: float, fill: Color) -> void:
	var pts := PackedVector2Array()
	for i in 5:
		var a := -PI / 2.0 + float(i) * TAU / 5.0
		pts.append(c + Vector2(cos(a), sin(a)) * r)
		var b := a + TAU / 10.0
		pts.append(c + Vector2(cos(b), sin(b)) * r * 0.42)
	ci.draw_colored_polygon(pts, fill)


static func draw_diamond(ci: CanvasItem, c: Vector2, r: float, fill: Color) -> void:
	var pts := PackedVector2Array([
		c + Vector2(0, -r),
		c + Vector2(r * 0.72, 0),
		c + Vector2(0, r),
		c + Vector2(-r * 0.72, 0),
	])
	ci.draw_colored_polygon(pts, fill)


static func draw_dashed_rect(ci: CanvasItem, rect: Rect2, color: Color,
		dash: float, gap: float, width: float) -> void:
	var pts := [
		rect.position,
		rect.position + Vector2(rect.size.x, 0),
		rect.position + rect.size,
		rect.position + Vector2(0, rect.size.y),
	]
	for i in 4:
		_dash_line(ci, pts[i], pts[(i + 1) % 4], color, dash, gap, width)


static func _dash_line(ci: CanvasItem, a: Vector2, b: Vector2, color: Color,
		dash: float, gap: float, width: float) -> void:
	var v := b - a
	var len := v.length()
	if len < 1.0:
		return
	var dir := v / len
	var t := 0.0
	while t < len:
		var t2 := minf(t + dash, len)
		ci.draw_line(a + dir * t, a + dir * t2, color, width, true)
		t += dash + gap


static func draw_cloud(ci: CanvasItem, c: Vector2, s: float, color: Color = WHITE) -> void:
	ci.draw_circle(c + Vector2(-s * 0.35, 0), s * 0.38, color)
	ci.draw_circle(c + Vector2(s * 0.35, 0), s * 0.42, color)
	ci.draw_circle(c + Vector2(0, -s * 0.18), s * 0.48, color)
	ci.draw_circle(c + Vector2(0, s * 0.12), s * 0.36, color)


static func draw_clothespin(ci: CanvasItem, c: Vector2, h: float) -> void:
	var w := h * 0.38
	var wood := Color("#c4a07a")
	var dark := Color("#a08060")
	ci.draw_style_box(box(wood, 3.0), Rect2(c.x - w * 0.5, c.y, w, h))
	ci.draw_rect(Rect2(c.x - 1.5, c.y + h * 0.35, 3, h * 0.18), dark)


static func draw_string(ci: CanvasItem, a: Vector2, b: Vector2) -> void:
	ci.draw_line(a, b, Color("#c4b09a"), 6.0, true)
	ci.draw_line(a, b, Color("#d8c4a8"), 3.0, true)


static func draw_scene(ci: CanvasItem, rect: Rect2, bg_id: int) -> void:
	match bg_id % BG_COUNT:
		0:
			_scene_meadow(ci, rect)
		1:
			_scene_dunes(ci, rect)
		2:
			_scene_garden(ci, rect)
		3:
			_scene_road(ci, rect)
		_:
			_scene_moon(ci, rect)


static func _scene_meadow(ci: CanvasItem, rect: Rect2) -> void:
	ci.draw_rect(rect, Color("#b7e4ef"))
	var horizon := rect.position.y + rect.size.y * 0.42
	ci.draw_rect(Rect2(rect.position.x, horizon, rect.size.x, rect.size.y * 0.58),
		Color("#c5e38a"))
	draw_cloud(ci, Vector2(rect.position.x + rect.size.x * 0.78,
		rect.position.y + rect.size.y * 0.18), rect.size.x * 0.12, Color("#f5fbff"))
	var rng := RandomNumberGenerator.new()
	rng.seed = 5
	for i in 14:
		var p := Vector2(
			rect.position.x + rng.randf() * rect.size.x,
			horizon + rng.randf() * rect.size.y * 0.5)
		_daisy(ci, p, rect.size.x * 0.018)


static func _scene_dunes(ci: CanvasItem, rect: Rect2) -> void:
	ci.draw_rect(rect, Color("#bfe4f2"))
	draw_cloud(ci, Vector2(rect.end.x - rect.size.x * 0.22,
		rect.position.y + rect.size.y * 0.20), rect.size.x * 0.16, Color("#f7fcff"))
	var h := rect.position.y + rect.size.y * 0.48
	ci.draw_rect(Rect2(rect.position.x, h, rect.size.x, rect.size.y), Color("#f3e07a"))
	var dune := PackedVector2Array([
		Vector2(rect.position.x, rect.end.y),
		Vector2(rect.position.x, h + rect.size.y * 0.08),
		Vector2(rect.position.x + rect.size.x * 0.55, h - rect.size.y * 0.04),
		Vector2(rect.end.x, h + rect.size.y * 0.10),
		Vector2(rect.end.x, rect.end.y),
	])
	ci.draw_colored_polygon(dune, Color("#e8c56a"))


static func _scene_garden(ci: CanvasItem, rect: Rect2) -> void:
	ci.draw_rect(rect, Color("#b7e0f0"))
	var grass := rect.position.y + rect.size.y * 0.55
	ci.draw_rect(Rect2(rect.position.x, grass, rect.size.x, rect.size.y), Color("#9dcc6e"))
	# Picket fence.
	var fy := grass - rect.size.y * 0.18
	var fh := rect.size.y * 0.22
	var fw := rect.size.x * 0.07
	for i in 9:
		var x := rect.position.x + i * fw * 1.15
		var slat := PackedVector2Array([
			Vector2(x, fy + fh),
			Vector2(x, fy + fw * 0.35),
			Vector2(x + fw * 0.5, fy),
			Vector2(x + fw, fy + fw * 0.35),
			Vector2(x + fw, fy + fh),
		])
		ci.draw_colored_polygon(slat, Color("#f4f1ea"))
	ci.draw_rect(Rect2(rect.position.x, fy + fh * 0.45, rect.size.x, fh * 0.12), Color("#f4f1ea"))
	ci.draw_circle(Vector2(rect.position.x + rect.size.x * 0.3, grass + rect.size.y * 0.12),
		rect.size.x * 0.16, Color("#7eb85a"))
	ci.draw_circle(Vector2(rect.position.x + rect.size.x * 0.62, grass + rect.size.y * 0.16),
		rect.size.x * 0.20, Color("#8fc86a"))


static func _scene_road(ci: CanvasItem, rect: Rect2) -> void:
	ci.draw_rect(rect, Color("#cde6ee"))
	ci.draw_rect(Rect2(rect.position.x, rect.position.y + rect.size.y * 0.42,
		rect.size.x, rect.size.y), Color("#e6d7b0"))
	var top := Vector2(rect.get_center().x, rect.position.y + rect.size.y * 0.44)
	var road := PackedVector2Array([
		top + Vector2(-rect.size.x * 0.04, 0),
		top + Vector2(rect.size.x * 0.04, 0),
		Vector2(rect.end.x, rect.end.y),
		Vector2(rect.position.x, rect.end.y),
	])
	ci.draw_colored_polygon(road, Color("#9aa3ab"))
	for i in 5:
		var t := 0.15 + i * 0.16
		var y := lerpf(top.y, rect.end.y, t)
		var w := lerpf(rect.size.x * 0.012, rect.size.x * 0.04, t)
		var h := lerpf(rect.size.y * 0.03, rect.size.y * 0.07, t)
		ci.draw_rect(Rect2(rect.get_center().x - w * 0.5, y, w, h), Color("#f0d35a"))


static func _scene_moon(ci: CanvasItem, rect: Rect2) -> void:
	ci.draw_rect(rect, Color("#3a4654"))
	var ground := rect.position.y + rect.size.y * 0.58
	ci.draw_rect(Rect2(rect.position.x, ground, rect.size.x, rect.size.y), Color("#cfd6dc"))
	ci.draw_circle(Vector2(rect.position.x + rect.size.x * 0.28, ground + rect.size.y * 0.12),
		rect.size.x * 0.10, Color("#b8c2c8"))
	ci.draw_circle(Vector2(rect.position.x + rect.size.x * 0.62, ground + rect.size.y * 0.18),
		rect.size.x * 0.16, Color("#b8c2c8"))
	ci.draw_circle(Vector2(rect.position.x + rect.size.x * 0.78, ground + rect.size.y * 0.08),
		rect.size.x * 0.07, Color("#c5ced4"))


static func _daisy(ci: CanvasItem, p: Vector2, r: float) -> void:
	for i in 6:
		var a := float(i) * TAU / 6.0
		ci.draw_circle(p + Vector2(cos(a), sin(a)) * r, r * 0.55, Color("#fffdf8"))
	ci.draw_circle(p, r * 0.4, Color("#f0c24a"))


static func draw_polaroid(ci: CanvasItem, rect: Rect2, pieces: Array, bg_id: int,
		caption: String, stars: int) -> void:
	ci.draw_style_box(box(WHITE, 4.0), Rect2(rect.position + Vector2(3, 5), rect.size))
	ci.draw_style_box(box(WHITE, 4.0), rect)
	var photo := Rect2(
		rect.position + Vector2(rect.size.x * 0.07, rect.size.y * 0.06),
		Vector2(rect.size.x * 0.86, rect.size.y * 0.72))
	draw_scene(ci, photo, bg_id)
	if not pieces.is_empty():
		_draw_photo_pieces(ci, photo, pieces)
	var cap_y := rect.position.y + rect.size.y * 0.82
	ci.draw_style_box(box(Color("#ece8e3"), 6.0),
		Rect2(rect.position.x + rect.size.x * 0.07, cap_y,
			rect.size.x * 0.28, rect.size.y * 0.10))
	# Stars on the right of the caption row are drawn by the caller with Labels,
	# or here as shapes.
	var star_r := rect.size.x * 0.035
	var sx := rect.end.x - rect.size.x * 0.10
	for i in 3:
		var col := STAR if i < stars else Color("#e0d8ce")
		draw_star(ci, Vector2(sx - i * star_r * 2.4, cap_y + rect.size.y * 0.05), star_r, col)


static func _draw_photo_pieces(ci: CanvasItem, photo: Rect2, pieces: Array) -> void:
	var minp := Vector2i(999, 999)
	var maxp := Vector2i(-1, -1)
	for rec in pieces:
		for c in rec.cells:
			var v := Vector2i(int(c[0]), int(c[1]))
			minp.x = mini(minp.x, v.x)
			minp.y = mini(minp.y, v.y)
			maxp.x = maxi(maxp.x, v.x)
			maxp.y = maxi(maxp.y, v.y)
	var gw := maxi(1, maxp.x - minp.x + 1)
	var gh := maxi(1, maxp.y - minp.y + 1)
	var pad := photo.size.x * 0.08
	var cs := minf((photo.size.x - pad * 2.0) / gw, (photo.size.y - pad * 2.0) / gh)
	var origin := photo.position + (photo.size - Vector2(gw, gh) * cs) * 0.5
	for rec in pieces:
		var cells: Array[Vector2i] = []
		for c in rec.cells:
			cells.append(Vector2i(int(c[0]), int(c[1])) - minp)
		var eye := Vector2i(int(rec.eye[0]), int(rec.eye[1])) - minp
		draw_polyomino(ci, origin, cs, cells, int(rec.color), eye,
			int(rec.get("mood", 0)), int(rec.get("target", 0)), false, 1.0)


static func draw_gift_box(ci: CanvasItem, rect: Rect2) -> void:
	var body := Rect2(rect.position.x, rect.position.y + rect.size.y * 0.32,
		rect.size.x, rect.size.y * 0.62)
	ci.draw_style_box(box(Color("#d45a55"), 8.0), body)
	var lid := Rect2(rect.position.x - rect.size.x * 0.04, rect.position.y + rect.size.y * 0.22,
		rect.size.x * 1.08, rect.size.y * 0.16)
	ci.draw_style_box(box(Color("#c44c48"), 6.0), lid)
	var ribbon := Color("#e0b14a")
	ci.draw_rect(Rect2(rect.get_center().x - rect.size.x * 0.07, body.position.y,
		rect.size.x * 0.14, body.size.y), ribbon)
	ci.draw_rect(Rect2(lid.position.x, lid.get_center().y - lid.size.y * 0.18,
		lid.size.x, lid.size.y * 0.36), ribbon)
	# Bow.
	var top := Vector2(rect.get_center().x, rect.position.y + rect.size.y * 0.18)
	ci.draw_circle(top + Vector2(-rect.size.x * 0.16, 0), rect.size.x * 0.14, ribbon)
	ci.draw_circle(top + Vector2(rect.size.x * 0.16, 0), rect.size.x * 0.14, ribbon)
	ci.draw_circle(top, rect.size.x * 0.07, Color("#d4a43c"))


static func draw_peeking_face(ci: CanvasItem, rect: Rect2) -> void:
	ci.draw_style_box(box(Palette.fill(Palette.Hue.YELLOW), rect.size.x * 0.22), rect)
	draw_eyes(ci, Rect2(rect.position, Vector2(rect.size.x, rect.size.y * 1.15)), 1.0)


static func draw_mag_glass(ci: CanvasItem, c: Vector2, r: float, color: Color) -> void:
	ci.draw_arc(c, r, 0, TAU, 28, color, r * 0.18, true)
	var a := c + Vector2(r * 0.72, r * 0.72)
	ci.draw_line(a, a + Vector2(r * 0.7, r * 0.7), color, r * 0.22, true)


static func draw_burger(ci: CanvasItem, c: Vector2, r: float, color: Color) -> void:
	for i in 3:
		var y := c.y + float(i - 1) * r * 0.55
		ci.draw_line(Vector2(c.x - r, y), Vector2(c.x + r, y), color, r * 0.22, true)
