class_name Art
extends RefCounted

## Procedural drawing for the vibrant hyper-casual look: glossy candy
## polyominoes with a deep sticker outline, an inset dark-indigo board, chunky
## bevelled buttons and outlined display text over a bright sky.

const CORNER := 0.26          ## chunky "sticker" corner, as a fraction of cell_size
const OUTLINE := Color("#2b1d4e")   ## deep plum, the sticker outline pass
const OUTLINE_W := 0.06       ## full outline stroke width, as a fraction of cell_size
const BEVEL := 0.13           ## candy "chin" depth, as a fraction of cell_size

# --- Sky / surfaces -------------------------------------------------------
const SKY_TOP := Color("#5cc9ff")
const SKY_MID := Color("#6b8cff")
const SKY_BOTTOM := Color("#8f6bff")
const CARD := Color("#fff8ef")        ## cream card surface (win panel, toasts)
const CARD_EDGE := Color("#e3d4ff")   ## card bottom bevel
const BOARD_PANEL := Color("#2f2a85")
const BOARD_RIM := Color("#5048c9")
const BOARD_SHADE := Color("#1d1957")
const CELL_EMPTY := Color("#3a35a3")
const CELL_LIP := Color("#221e6b")
const CELL_LINE := BOARD_RIM

# Kept for callers that still talk about the old cream backdrop: "BG" now means
# the cream card surface every light UI element sits on.
const BG := CARD
const BG_TOP := CARD
const BG_BOTTOM := CARD

# --- Ink / accents --------------------------------------------------------
const INK := Color("#2b1d4e")
const INK_SOFT := Color("#7a6aa3")
const WHITE := Color("#ffffff")
const TEXT_OUTLINE := Color("#2a1f5c")
const OK_TINT := Color("#3ddc84")
const BAD_TINT := Color("#ff4d6d")
const STAR := Color("#ffd23f")
const STAR_DARK := Color("#e8930c")
const DIAMOND := Color("#3fe0ff")
const ACCENT_PRIMARY := Color("#3ddc84")  ## green "go" CTA (Play / Next)
const ACCENT_BLUE := Color("#4fa8ff")
const ACCENT_PINK := Color("#ff5fa2")
const ACCENT_GOLD := Color("#ffc21a")


static func box(fill: Color, radius: float, border := 0.0,
		border_color := Color.TRANSPARENT) -> StyleBoxFlat:
	var sb := StyleBoxFlat.new()
	sb.bg_color = fill
	sb.set_corner_radius_all(int(radius))
	sb.corner_detail = 10
	sb.anti_aliasing_size = 0.8
	if border > 0.0:
		sb.set_border_width_all(int(border))
		sb.border_color = border_color
	return sb


static func box_corners(fill: Color, tl: float, tr: float, br: float, bl: float) -> StyleBoxFlat:
	var sb := StyleBoxFlat.new()
	sb.bg_color = fill
	sb.corner_radius_top_left = int(tl)
	sb.corner_radius_top_right = int(tr)
	sb.corner_radius_bottom_right = int(br)
	sb.corner_radius_bottom_left = int(bl)
	return sb


## Outlined display text, the hyper-casual signature: white (or coloured) fill,
## a thick dark outline and a hard drop shadow.
static func style_label(l: Label, font_size: int, color := WHITE,
		outline := TEXT_OUTLINE, outline_size := -1) -> void:
	l.add_theme_font_size_override("font_size", font_size)
	l.add_theme_color_override("font_color", color)
	var o := outline_size if outline_size >= 0 else maxi(4, int(font_size * 0.22))
	if o > 0:
		l.add_theme_constant_override("outline_size", o)
		l.add_theme_color_override("font_outline_color", outline)
		l.add_theme_color_override("font_shadow_color", Color(outline.r, outline.g, outline.b, 0.55))
		l.add_theme_constant_override("shadow_offset_x", 0)
		l.add_theme_constant_override("shadow_offset_y", maxi(2, int(font_size * 0.08)))
		l.add_theme_constant_override("shadow_outline_size", o)


## Give a Button the hyper-casual "candy button" look: a chunky pill with a deep
## bottom-only bevel band plus a drop shadow, that flattens and drops when
## tapped. Pass an accent colour for a primary action (filled, white outlined
## text); leave it default for a cream button with ink text.
##
## No all-around border -- a stroke on a large-radius pill is exactly where
## Godot's StyleBoxFlat leaves a 1px corner nub. A BOTTOM-ONLY border avoids
## that (the nub needs two different-width borders meeting at a rounded
## corner) while still reading as a chunky 3D bevel.
static func style_button(b: Button, accent := Color.TRANSPARENT, radius := 500.0) -> void:
	var filled := accent.a > 0.0
	var base := accent if filled else CARD
	var ink := WHITE if filled else INK
	var bevel := 8
	var edge := base.darkened(0.28) if filled else CARD_EDGE.darkened(0.12)

	var normal := _pill(base, radius)
	normal.shadow_color = Color(0.08, 0.04, 0.25, 0.30)
	normal.shadow_size = 8
	normal.shadow_offset = Vector2(0, 6)
	normal.border_width_bottom = bevel
	normal.border_color = edge
	_btn_margins(normal, 18, 10)
	normal.content_margin_bottom = 10 + bevel * 0.5

	var hover := normal.duplicate() as StyleBoxFlat
	hover.bg_color = base.lightened(0.06)

	var pressed := _pill(base.darkened(0.06), radius)
	pressed.shadow_color = Color(0.08, 0.04, 0.25, 0.22)
	pressed.shadow_size = 3
	pressed.shadow_offset = Vector2(0, 2)
	# The bevel nearly flattens on press and the label drops with it, so the
	# button reads as physically pushed in.
	pressed.border_width_bottom = 2
	pressed.border_color = edge
	_btn_margins(pressed, 18, 10)
	pressed.content_margin_top = 10 + bevel - 2
	pressed.content_margin_bottom = 10 - bevel * 0.5 + 2

	var disabled := _pill(base.lerp(Color(0.6, 0.6, 0.75), 0.55), radius)
	disabled.border_width_bottom = bevel
	disabled.border_color = disabled.bg_color.darkened(0.2)
	_btn_margins(disabled, 18, 10)

	b.add_theme_stylebox_override("normal", normal)
	b.add_theme_stylebox_override("hover", hover)
	b.add_theme_stylebox_override("pressed", pressed)
	b.add_theme_stylebox_override("hover_pressed", pressed)
	b.add_theme_stylebox_override("disabled", disabled)
	b.add_theme_stylebox_override("focus", StyleBoxEmpty.new())
	for state in ["font_color", "font_hover_color", "font_pressed_color",
			"font_focus_color", "font_hover_pressed_color"]:
		b.add_theme_color_override(state, ink)
	b.add_theme_color_override("font_disabled_color", Color(1, 1, 1, 0.7))
	if filled:
		b.add_theme_constant_override("outline_size", 8)
		b.add_theme_color_override("font_outline_color", base.darkened(0.45))


static func _pill(fill: Color, radius := 500.0) -> StyleBoxFlat:
	var sb := box(fill, radius)
	sb.corner_detail = 12
	sb.anti_aliasing_size = 0.8
	return sb


static func _btn_margins(sb: StyleBoxFlat, h: float, v: float) -> void:
	sb.content_margin_left = h
	sb.content_margin_right = h
	sb.content_margin_top = v
	sb.content_margin_bottom = v


## A round candy button carrying a code-drawn glyph (see draw_icon). The glyph
## rides the button's own draw signal, so it drops with the pressed bevel.
static func icon_button(kind: String, accent := Color.TRANSPARENT, diameter := 68.0,
		glyph_color := Color.TRANSPARENT) -> Button:
	var b := Button.new()
	b.focus_mode = Control.FOCUS_NONE
	b.custom_minimum_size = Vector2(diameter, diameter)
	b.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	style_button(b, accent)
	var col := glyph_color
	if col.a <= 0.0:
		col = WHITE if accent.a > 0.0 else INK
	b.set_meta("icon_kind", kind)
	b.draw.connect(func():
		var down := b.get_draw_mode() == BaseButton.DRAW_PRESSED \
			or b.get_draw_mode() == BaseButton.DRAW_HOVER_PRESSED
		var s := minf(b.size.x, b.size.y)
		var c := Vector2(b.size.x * 0.5, b.size.y * 0.5 - 3.0 + (4.0 if down else 0.0))
		var k: String = b.get_meta("icon_kind", kind)
		if accent.a > 0.0:
			# A soft outline-coloured offset copy reads as the glyph's "ink" edge.
			draw_icon(b, k, c + Vector2(0, 2), s * 0.30, accent.darkened(0.45))
		draw_icon(b, k, c, s * 0.30, col))
	return b


## Code-drawn UI glyphs with a uniform rounded stroke. `r` is the glyph's
## half-extent.
static func draw_icon(ci: CanvasItem, kind: String, c: Vector2, r: float, col: Color) -> void:
	var w := maxf(3.0, r * 0.3)
	match kind:
		"back":
			_stroke(ci, [c + Vector2(r * 0.3, -r * 0.62), c + Vector2(-r * 0.3, 0),
				c + Vector2(r * 0.3, r * 0.62)], col, w)
		"undo":
			var cc := c + Vector2(r * 0.08, r * 0.1)
			var rr := r * 0.62
			ci.draw_arc(cc, rr, -PI * 0.5, PI * 0.78, 28, col, w, true)
			ci.draw_circle(cc + Vector2(cos(PI * 0.78), sin(PI * 0.78)) * rr, w * 0.5, col)
			var tip := cc + Vector2(-rr * 0.75, -rr)
			ci.draw_colored_polygon(PackedVector2Array([
				tip, cc + Vector2(rr * 0.05, -rr - rr * 0.6), cc + Vector2(rr * 0.05, -rr + rr * 0.6)]), col)
		"hint":
			var bc := c + Vector2(0, -r * 0.18)
			ci.draw_circle(bc, r * 0.58, col)
			ci.draw_style_box(box(col, r * 0.12), Rect2(c.x - r * 0.3, c.y + r * 0.26, r * 0.6, r * 0.34))
			ci.draw_style_box(box(col, r * 0.1), Rect2(c.x - r * 0.22, c.y + r * 0.66, r * 0.44, r * 0.2))
			ci.draw_arc(bc + Vector2(-r * 0.05, r * 0.02), r * 0.3, PI * 1.05, PI * 1.55, 8,
				Color(1, 1, 1, 0.75) if col != WHITE else Color(1, 0.85, 0.3, 0.9), w * 0.5, true)
		"sound_on", "sound_off":
			var sp := PackedVector2Array([
				c + Vector2(-r * 0.75, -r * 0.28), c + Vector2(-r * 0.35, -r * 0.28),
				c + Vector2(r * 0.05, -r * 0.68), c + Vector2(r * 0.05, r * 0.68),
				c + Vector2(-r * 0.35, r * 0.28), c + Vector2(-r * 0.75, r * 0.28)])
			ci.draw_colored_polygon(sp, col)
			if kind == "sound_on":
				ci.draw_arc(c + Vector2(r * 0.1, 0), r * 0.42, -PI * 0.3, PI * 0.3, 10, col, w * 0.8, true)
				ci.draw_arc(c + Vector2(r * 0.1, 0), r * 0.78, -PI * 0.3, PI * 0.3, 14, col, w * 0.8, true)
			else:
				_stroke(ci, [c + Vector2(r * 0.4, -r * 0.3), c + Vector2(r * 0.95, r * 0.3)], col, w * 0.8)
				_stroke(ci, [c + Vector2(r * 0.95, -r * 0.3), c + Vector2(r * 0.4, r * 0.3)], col, w * 0.8)
		"play":
			ci.draw_colored_polygon(PackedVector2Array([
				c + Vector2(-r * 0.4, -r * 0.62), c + Vector2(r * 0.62, 0),
				c + Vector2(-r * 0.4, r * 0.62)]), col)
		"grid":
			var s := r * 0.5
			for gy in 2:
				for gx in 2:
					ci.draw_style_box(box(col, s * 0.25), Rect2(
						c + Vector2(-r * 0.62 + gx * r * 0.7, -r * 0.62 + gy * r * 0.7), Vector2(s, s)))
		"home":
			ci.draw_colored_polygon(PackedVector2Array([
				c + Vector2(0, -r * 0.75), c + Vector2(r * 0.8, 0), c + Vector2(-r * 0.8, 0)]), col)
			ci.draw_style_box(box(col, r * 0.1), Rect2(c.x - r * 0.52, c.y - r * 0.1, r * 1.04, r * 0.75))
		"lock":
			draw_lock(ci, c, r * 1.2, col, col.darkened(0.5))
		_:
			ci.draw_circle(c, r * 0.4, col)


## Polyline with round caps and joints (draw_polyline's own joints are mitred).
static func _stroke(ci: CanvasItem, pts: Array, col: Color, w: float) -> void:
	var arr := PackedVector2Array(pts)
	ci.draw_polyline(arr, col, w, true)
	for p in pts:
		ci.draw_circle(p, w * 0.5, col)


## A "diamond icon + count" pill, shared by HUD/MainMenu/LevelSelect so the
## widget is built once and stays visually identical everywhere. The count
## Label is named "Count", nested a couple of levels inside the chip's
## margin/row wrappers -- callers update it via a recursive lookup:
##   (chip.find_child("Count", true, false) as Label).text = str(n)
static func build_diamond_chip() -> Control:
	var chip := PanelContainer.new()
	var sb := box(Color(0.10, 0.05, 0.32, 0.38), 26.0)
	sb.border_width_bottom = 3
	sb.border_color = Color(0.05, 0.02, 0.2, 0.35)
	chip.add_theme_stylebox_override("panel", sb)
	chip.mouse_filter = Control.MOUSE_FILTER_IGNORE
	chip.custom_minimum_size = Vector2(108, 52)

	var margin := MarginContainer.new()
	margin.add_theme_constant_override("margin_left", 8)
	margin.add_theme_constant_override("margin_right", 16)
	margin.add_theme_constant_override("margin_top", 4)
	margin.add_theme_constant_override("margin_bottom", 6)
	chip.add_child(margin)

	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 6)
	margin.add_child(row)

	var icon := Control.new()
	icon.name = "Icon"
	icon.custom_minimum_size = Vector2(36, 36)
	icon.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	icon.mouse_filter = Control.MOUSE_FILTER_IGNORE
	icon.draw.connect(func(): draw_gem(icon, icon.size * 0.5, 15.0))
	row.add_child(icon)

	var label := Label.new()
	label.name = "Count"
	label.text = "0"
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	style_label(label, 26, WHITE, TEXT_OUTLINE, 6)
	row.add_child(label)

	return chip


## A faceted gem: outlined diamond with a lighter top facet and a glint.
static func draw_gem(ci: CanvasItem, c: Vector2, r: float, fill := DIAMOND) -> void:
	var o := r * 0.2
	var outer := PackedVector2Array([
		c + Vector2(0, -r - o), c + Vector2(r * 0.82 + o, -r * 0.1),
		c + Vector2(0, r + o), c + Vector2(-r * 0.82 - o, -r * 0.1)])
	ci.draw_colored_polygon(outer, TEXT_OUTLINE)
	var body := PackedVector2Array([
		c + Vector2(0, -r), c + Vector2(r * 0.82, -r * 0.1),
		c + Vector2(0, r), c + Vector2(-r * 0.82, -r * 0.1)])
	ci.draw_colored_polygon(body, fill.darkened(0.12))
	var top := PackedVector2Array([
		c + Vector2(0, -r), c + Vector2(r * 0.82, -r * 0.1),
		c + Vector2(0, r * 0.05), c + Vector2(-r * 0.82, -r * 0.1)])
	ci.draw_colored_polygon(top, fill.lightened(0.25))
	ci.draw_circle(c + Vector2(-r * 0.22, -r * 0.42), r * 0.14, Color(1, 1, 1, 0.9))


## Legacy flat diamond, kept for callers that want an unadorned glyph.
static func draw_diamond(ci: CanvasItem, c: Vector2, r: float, fill: Color) -> void:
	var pts := PackedVector2Array([
		c + Vector2(0, -r),
		c + Vector2(r * 0.72, 0),
		c + Vector2(0, r),
		c + Vector2(-r * 0.72, 0),
	])
	ci.draw_colored_polygon(pts, fill)


static func draw_background(ci: CanvasItem, rect: Rect2) -> void:
	ci.draw_rect(rect, SKY_MID)


## The panel colour behind the cells; also what a hole should read as.
static func board_frame_color() -> Color:
	return BOARD_PANEL


## Board panel + inset empty cells. The panel is a chunky rounded slab with a
## dark bevel and a soft drop shadow; every playable cell is a rounded well
## with a darker top lip, the classic block-puzzle grid. Holes simply get no
## well, so they read as solid panel.
const BOARD_REVEAL := 12.0
## The frame's reveal grows with the cells (never below BOARD_REVEAL).
const BOARD_REVEAL_FRAC := 0.12
## How far the board's drop shadow reaches below the frame (offset + grow).
const BOARD_SHADOW_REACH := 18.0

static func draw_board(ci: CanvasItem, cells: Array, origin_px: Vector2,
		cell_size: float) -> void:
	if cells.is_empty():
		return
	var minc := Vector2i(1 << 30, 1 << 30)
	var maxc := Vector2i(-(1 << 30), -(1 << 30))
	for c in cells:
		minc.x = mini(minc.x, c.x)
		minc.y = mini(minc.y, c.y)
		maxc.x = maxi(maxc.x, c.x)
		maxc.y = maxi(maxc.y, c.y)

	var tl := (origin_px + Vector2(minc.x, minc.y) * cell_size).round()
	var span := Vector2(maxc.x - minc.x + 1, maxc.y - minc.y + 1) * cell_size
	var reveal := maxf(BOARD_REVEAL, cell_size * BOARD_REVEAL_FRAC)
	var frame := Rect2(tl - Vector2(reveal, reveal), span + Vector2(reveal, reveal) * 2.0)
	var frame_r := roundf(cell_size * 0.28) + reveal * 0.6

	# Soft drop shadow, then the bevel slab, then the face with a lighter rim.
	var shadow := frame
	shadow.position.y += BOARD_SHADOW_REACH - 4.0
	ci.draw_style_box(box(Color(0.06, 0.02, 0.22, 0.30), frame_r + 4.0), shadow.grow(4.0))
	var bevel := frame
	bevel.position.y += 9.0
	ci.draw_style_box(box(BOARD_SHADE, frame_r), bevel)
	ci.draw_style_box(box(BOARD_PANEL, frame_r, 3.0, BOARD_RIM), frame)

	var inset := maxf(1.5, cell_size * 0.045)
	var lip := maxf(2.0, cell_size * 0.07)
	var well_r := roundf(cell_size * 0.2)
	for c in cells:
		var cr := Rect2(origin_px + Vector2(c.x, c.y) * cell_size, Vector2(cell_size, cell_size)).grow(-inset)
		ci.draw_style_box(box(CELL_LIP, well_r), cr)
		var face := Rect2(cr.position + Vector2(0, lip), cr.size - Vector2(0, lip))
		ci.draw_style_box(box(CELL_EMPTY, well_r), face)


## A soft tint on one cell, used while a piece hovers over it.
static func draw_cell_highlight(ci: CanvasItem, rect: Rect2, tint: Color) -> void:
	var t := tint
	t.a = 0.55
	ci.draw_style_box(box(t, rect.size.x * 0.24), rect)


## Drop-target ghost: exactly the piece's own silhouette (same polygon the
## piece is drawn from), with `rim` where the outline would be and `fill`
## inside it.
static func draw_ghost(ci: CanvasItem, origin_px: Vector2, cs: float, cells: Array,
		fill: Color, rim: Color) -> void:
	var polys := _piece_polys(cells, [], cs)
	var xf := Transform2D(0.0, origin_px)
	_fill_polys(ci, polys.outer, xf, rim)
	_fill_polys(ci, polys.body, xf, fill)


## A fused, flat silhouette of a set of cells (per-cell rounded rects). Cells are in grid units relative to origin_px. A
## negative `inset` grows it outward the same way the sticker outline pass
## does (every cell rect grown, so concave corners fill cleanly).
static func draw_silhouette(ci: CanvasItem, origin_px: Vector2, cell_size: float,
		cells: Array, color: Color, inset := 0.0) -> void:
	var occupied := {}
	for c in cells:
		occupied[c] = true
	var r := cell_size * CORNER
	var overlap := maxf(1.0, cell_size * 0.04)
	var grow := maxf(0.0, -inset)
	for c in cells:
		var rect := _cell_px_grown(origin_px, cell_size, c, occupied, overlap, grow)
		ci.draw_style_box(_cell_box(color, r + grow, c, occupied), rect)


## Drop shadow for a set of cells, offset straight down by `offset` px.
##
## Built from ONE rounded band per horizontal run of bottom-edge cells (cells
## with nothing below them), spanning from just under the cells' bottom edge to
## the shadow's bottom. For a straight-down offset smaller than a cell that is
## exactly the visible part of a shifted silhouette -- and because the bands
## never overlap each other, a translucent shadow has no darker seams where
## per-cell rects used to double up. Concave corners stay square; outer
## corners get the same radius as the sticker outline.
static func draw_drop_shadow(ci: CanvasItem, origin_px: Vector2, cs: float,
		cells: Array, color: Color, offset: float) -> void:
	var occupied := {}
	for c in cells:
		occupied[c] = true
	var grow := cs * OUTLINE_W * 0.5   # the outline's outer edge
	var r := cs * CORNER + grow
	var rows := {}
	for c in cells:
		if occupied.has(c + Vector2i(0, 1)):
			continue
		if not rows.has(c.y):
			rows[c.y] = []
		rows[c.y].append(c.x)
	for row in rows:
		var y: int = row
		var xs: Array = rows[row]
		xs.sort()
		var start: int = xs[0]
		for i in xs.size():
			var x: int = xs[i]
			var last := i == xs.size() - 1
			if not last and xs[i + 1] == x + 1:
				continue
			# Run [start, x] on row y. An end with an in-shape horizontal
			# neighbour is a concave corner: no grow, no rounding.
			var open_w := not occupied.has(Vector2i(start - 1, y))
			var open_e := not occupied.has(Vector2i(x + 1, y))
			var x0 := origin_px.x + start * cs - (grow if open_w else 0.0)
			var x1 := origin_px.x + (x + 1) * cs + (grow if open_e else 0.0)
			var bottom := origin_px.y + (y + 1) * cs + grow
			var band := Rect2(x0, bottom - r, x1 - x0, r + offset)
			var sb := box_corners(color, 0.0, 0.0, r if open_e else 0.0, r if open_w else 0.0)
			sb.corner_detail = 10
			ci.draw_style_box(sb, band)
			if not last:
				start = xs[i + 1]


static func draw_block(ci: CanvasItem, rect: Rect2, data: BlockData, colorblind: bool = false, alpha: float = 1.0,
		board_neighbors: Array = []) -> void:
	if data == null:
		return
	var cells: Array[Vector2i] = [Vector2i.ZERO]
	draw_polyomino(ci, rect.position, rect.size.x, cells, int(data.color), Vector2i.ZERO,
		int(data.mood), int(data.target_color), false, alpha, board_neighbors)


## The main piece renderer. Pass order: soft shadow -> sticker outline ->
## candy body with a darker bevel "chin" along every bottom edge -> glossy top
## highlight -> eyes -> mood bubble -> unhappy ring.
##
## `blink` (0..1) squashes the eyes shut, `happy_eyes` swaps them for ^ ^ arcs,
## `ring_pulse` scales the unhappy ring's opacity so callers can throb it.
static func draw_polyomino(ci: CanvasItem, origin_px: Vector2, cell_size: float,
		cells: Array[Vector2i], color_id: int, eye: Vector2i,
		mood: int, target: int, unhappy: bool, alpha: float = 1.0,
		board_neighbors: Array = [], blink: float = 0.0, happy_eyes: bool = false,
		ring_pulse: float = 1.0, with_shadow: bool = true) -> void:
	if cells.is_empty():
		return
	var body := Palette.fill(color_id)
	body.a = alpha
	var shade := Palette.shade(color_id).darkened(0.08)
	shade.a = alpha
	var outline_col := Color(OUTLINE.r, OUTLINE.g, OUTLINE.b, alpha)

	# Soft drop shadow. Pieces sitting on the board pass with_shadow = false:
	# the board draws one ground shadow under ALL placed pieces instead, so a
	# piece's shadow can never be painted on top of the piece below it.
	if with_shadow:
		draw_drop_shadow(ci, origin_px, cell_size, cells,
			Color(0.05, 0.02, 0.2, 0.25 * alpha), cell_size * 0.07)

	# Outline, body and bevel chin all come from ONE polygon per piece (see
	# _piece_polys): the stroke is the shape grown by W/2 and the body the shape
	# shrunk by W/2, so the outline is exactly W wide on every edge, and two
	# pieces sharing an edge overlap into a single stroke of that same W.
	var polys := _piece_polys(cells, board_neighbors, cell_size)
	var xf := Transform2D(0.0, origin_px)
	_fill_polys(ci, polys.outer, xf, outline_col)
	_fill_polys(ci, polys.body, xf, shade)
	_fill_polys(ci, polys.top, xf, body)

	# Gloss: one rounded white strip per horizontal run of exposed top edges
	# (no piece cell AND no board neighbour above), so a wide piece gets a
	# single continuous highlight and edges tucked under a neighbour get none.
	var occupied := {}
	for c in cells:
		occupied[c] = true
	for c in board_neighbors:
		occupied[c] = true
	var half_w := cell_size * OUTLINE_W * 0.5
	var gloss := Color(1, 1, 1, 0.38 * alpha)
	var gh := cell_size * 0.1
	var rows := {}
	for c in cells:
		if occupied.has(c + Vector2i(0, -1)):
			continue
		if not rows.has(c.y):
			rows[c.y] = []
		rows[c.y].append(c.x)
	for row in rows:
		var y: int = row
		var xs: Array = rows[row]
		xs.sort()
		var start: int = xs[0]
		for i in xs.size():
			var x: int = xs[i]
			var last := i == xs.size() - 1
			if last or xs[i + 1] != x + 1:
				var x0 := origin_px.x + start * cell_size + cell_size * 0.2
				var x1 := origin_px.x + (x + 1) * cell_size - cell_size * 0.2
				var gr := Rect2(x0, origin_px.y + y * cell_size + half_w + cell_size * 0.07, x1 - x0, gh)
				ci.draw_style_box(box(gloss, gh * 0.5), gr)
				if not last:
					start = xs[i + 1]
	# A little specular dot at the top-left-most cell.
	var tl_cell := cells[0]
	for c in cells:
		if c.y < tl_cell.y or (c.y == tl_cell.y and c.x < tl_cell.x):
			tl_cell = c
	var tl_px := origin_px + Vector2(tl_cell.x, tl_cell.y) * cell_size
	ci.draw_circle(tl_px + Vector2(cell_size * 0.15, cell_size * 0.28), cell_size * 0.045,
		Color(1, 1, 1, 0.55 * alpha))

	var eye_rect := Rect2(origin_px + Vector2(eye) * cell_size, Vector2(cell_size, cell_size))
	draw_eyes(ci, eye_rect, alpha, blink, happy_eyes)

	if mood != BlockData.Mood.NEUTRAL:
		var attach := _bubble_attach(origin_px, cell_size, cells)
		draw_thought(ci, attach, cell_size, mood, target, alpha)

	if unhappy:
		# One continuous ring just inside the body edge -- no per-cell borders,
		# so no red lines across the inside of the piece.
		var ring_col := Color(BAD_TINT.r, BAD_TINT.g, BAD_TINT.b, alpha * clampf(ring_pulse, 0.0, 1.0))
		var ring_w := maxf(3.0, cell_size * 0.07)
		for p in polys.ring:
			ci.draw_polyline(_closed(xf * (p as PackedVector2Array)), ring_col, ring_w, true)


## Geometry cache for _piece_polys. Keyed by shape + neighbours + size, so
## pieces that redraw every frame (tray breathing, blinking) don't re-run the
## polygon clipper each time.
static var _poly_cache: Dictionary = {}

## Width of the anti-aliased stroke that softens each filled polygon's edge.
const AA_FEATHER := 1.0


## The polygons one piece is drawn from, relative to its origin:
##   outer -- the shape grown by W/2 (filled with the outline colour)
##   body  -- the shape shrunk by W/2 (filled with the shade colour)
##   top   -- body ∩ body-shifted-up-by-BEVEL (body colour; leaves the chin)
##   ring  -- body shrunk further (the unhappy ring's path)
## `shape` is the union of the piece's cells with every free convex corner
## rounded. A corner stays sharp when another piece shares either edge that
## meets there, so neighbours always butt flush against each other.
static func _piece_polys(cells: Array, neighbors: Array, cs: float) -> Dictionary:
	var key := "%s|%s|%.2f" % [str(cells), str(neighbors), snappedf(cs, 0.25)]
	if _poly_cache.has(key):
		return _poly_cache[key]
	if _poly_cache.size() > 512:
		_poly_cache.clear()

	var mine := {}
	for c in cells:
		mine[c] = true
	var others := {}
	for c in neighbors:
		if not mine.has(c):
			others[c] = true

	# 1. Union of the cell squares (pixels, origin at 0). Cells can arrive in
	# any order, so a square is only absorbed once it touches the shape grown
	# so far -- merging two disjoint polygons returns both, and keeping just
	# one of them would silently drop cells.
	var pending: Array[PackedVector2Array] = []
	for c in cells:
		var p := Vector2(c) * cs
		pending.append(PackedVector2Array([p, p + Vector2(cs, 0), p + Vector2(cs, cs), p + Vector2(0, cs)]))
	var shape: PackedVector2Array = pending.pop_front()
	var progressed := true
	while not pending.is_empty() and progressed:
		progressed = false
		for i in pending.size():
			var merged := Geometry2D.merge_polygons(shape, pending[i])
			if merged.size() == 1:
				shape = merged[0]
				pending.remove_at(i)
				progressed = true
				break

	# 2. Round each free convex corner.
	var r := cs * CORNER
	var rounded := PackedVector2Array()
	var n := shape.size()
	for i in n:
		var v := shape[i]
		var g := Vector2i(roundi(v.x / cs), roundi(v.y / cs))
		# The 2x2 cells around this grid vertex: NW, NE, SW, SE.
		var around := [g + Vector2i(-1, -1), g + Vector2i(0, -1), g + Vector2i(-1, 0), g]
		var inside := 0
		var owner := -1
		for k in 4:
			if mine.has(around[k]):
				inside += 1
				owner = k
		if inside != 1:
			rounded.append(v)   # concave (or degenerate): keep sharp
			continue
		# The owner's two edge-sharing neighbours inside this 2x2 block are the
		# cells that differ from it in exactly one axis (index ^1 and ^2).
		if others.has(around[owner ^ 1]) or others.has(around[owner ^ 2]):
			rounded.append(v)   # a neighbour piece sits on this corner's edge
			continue
		var d1 := (shape[(i - 1 + n) % n] - v).normalized()
		var d2 := (shape[(i + 1) % n] - v).normalized()
		var centre := v + (d1 + d2) * r
		var steps := 8
		for s in steps + 1:
			var t := PI * 0.5 * float(s) / float(steps)
			rounded.append(centre - d2 * r * cos(t) - d1 * r * sin(t))

	# 3. Offsets and the chin intersection.
	# The outer fill is pulled in by half the AA feather (see _fill_polys) so its
	# feathered edge ends exactly at +W/2 -- otherwise a piece drawn after its
	# neighbour would smear ~1px of outline onto the neighbour's body.
	var half_w := cs * OUTLINE_W * 0.5
	var outer := Geometry2D.offset_polygon(rounded, maxf(0.5, half_w - AA_FEATHER * 0.5), Geometry2D.JOIN_MITER)
	var body := Geometry2D.offset_polygon(rounded, -half_w, Geometry2D.JOIN_MITER)
	var top: Array = []
	var ring: Array = []
	var bev := cs * BEVEL
	for b in body:
		var up := Transform2D(0.0, Vector2(0, -bev)) * (b as PackedVector2Array)
		top.append_array(Geometry2D.intersect_polygons(b, up))
		ring.append_array(Geometry2D.offset_polygon(b, -cs * 0.06, Geometry2D.JOIN_ROUND))
	var out := {"outer": outer, "body": body, "top": top, "ring": ring}
	_poly_cache[key] = out
	return out


## Fill polygons (no built-in AA) and feather their edges with a thin
## anti-aliased stroke of the same colour.
static func _fill_polys(ci: CanvasItem, polys: Array, xf: Transform2D, col: Color) -> void:
	for p in polys:
		var pts: PackedVector2Array = xf * (p as PackedVector2Array)
		if pts.size() < 3:
			continue
		ci.draw_colored_polygon(pts, col)
		ci.draw_polyline(_closed(pts), col, AA_FEATHER, true)


static func _closed(pts: PackedVector2Array) -> PackedVector2Array:
	var out := pts.duplicate()
	if out.size() > 0:
		out.append(out[0])
	return out


static func _poly_area(p: PackedVector2Array) -> float:
	var a := 0.0
	for i in p.size():
		var b := p[(i + 1) % p.size()]
		a += p[i].x * b.y - b.x * p[i].y
	return a * 0.5


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
	# Inset is zero on purpose: any inset leaves a thin gap wherever two pieces
	# touch on the board, and the concave corner of an L/T/S is already owned
	# by the bend cell's overlap-grown rect.
	return Rect2(p, s)


## Same as _cell_px but grown outward by `grow` on every side, for the outline
## pass -- a larger, same-shape rect drawn underneath the fill so a uniform
## outline ring shows through around it.
static func _cell_px_grown(origin_px: Vector2, cs: float, c: Vector2i,
		occupied: Dictionary, overlap: float, grow: float) -> Rect2:
	var rect := _cell_px(origin_px, cs, c, occupied, overlap)
	return Rect2(rect.position - Vector2(grow, grow), rect.size + Vector2(grow, grow) * 2.0)


static func _cell_box(fill: Color, r: float, c: Vector2i, occupied: Dictionary) -> StyleBoxFlat:
	var n := occupied.has(c + Vector2i(0, -1))
	var e := occupied.has(c + Vector2i(1, 0))
	var s := occupied.has(c + Vector2i(0, 1))
	var w := occupied.has(c + Vector2i(-1, 0))
	var sb := box_corners(fill,
		0.0 if n or w else r,
		0.0 if n or e else r,
		0.0 if s or e else r,
		0.0 if s or w else r)
	sb.corner_detail = 10
	return sb


static func _bubble_attach(origin_px: Vector2, cs: float, cells: Array[Vector2i]) -> Vector2:
	# Prefer the top-right cell of the piece.
	var top := cells[0]
	for c in cells:
		if c.y < top.y or (c.y == top.y and c.x > top.x):
			top = c
	return origin_px + Vector2(top.x + 0.92, top.y + 0.08) * cs


## Big googly eyes. `blink` 0..1 squashes them vertically into a lid line;
## `happy` draws closed ^ ^ arcs instead. Ellipses are built as polygons so
## this never touches the canvas transform (callers may have one set).
static func draw_eyes(ci: CanvasItem, rect: Rect2, alpha: float, blink: float = 0.0,
		happy: bool = false) -> void:
	var s := minf(rect.size.x, rect.size.y)
	var c := rect.get_center() + Vector2(0, s * 0.04)
	var eye_r := s * 0.22
	var sep := s * 0.26
	var ink := Color(INK.r, INK.g, INK.b, alpha)
	for side in [-1.0, 1.0]:
		var ec := c + Vector2(side * sep, 0)
		if happy:
			ci.draw_arc(ec + Vector2(0, eye_r * 0.35), eye_r * 0.62, PI * 1.12, PI * 1.88, 14,
				ink, maxf(2.0, eye_r * 0.3), true)
			continue
		var sy := clampf(1.0 - blink, 0.08, 1.0)
		if sy <= 0.15:
			ci.draw_line(ec + Vector2(-eye_r * 0.8, 0), ec + Vector2(eye_r * 0.8, 0), ink,
				maxf(2.0, eye_r * 0.22), true)
			continue
		_ellipse(ci, ec, eye_r + maxf(1.0, eye_r * 0.1), (eye_r + maxf(1.0, eye_r * 0.1)) * sy, ink)
		_ellipse(ci, ec, eye_r, eye_r * sy, Color(1, 1, 1, alpha))
		var pupil := ec + Vector2(side * eye_r * 0.06, eye_r * 0.10 * sy)
		_ellipse(ci, pupil, eye_r * 0.58, eye_r * 0.58 * sy, ink)
		if sy > 0.5:
			ci.draw_circle(pupil + Vector2(-eye_r * 0.22, -eye_r * 0.26 * sy),
				eye_r * 0.18, Color(1, 1, 1, alpha))
			ci.draw_circle(pupil + Vector2(eye_r * 0.22, -eye_r * 0.06 * sy),
				eye_r * 0.08, Color(1, 1, 1, alpha * 0.85))


static func _ellipse(ci: CanvasItem, c: Vector2, rx: float, ry: float, col: Color) -> void:
	if absf(rx - ry) < 0.01:
		ci.draw_circle(c, rx, col)
		return
	var pts := PackedVector2Array()
	var n := 22
	for i in n:
		var a := TAU * float(i) / float(n)
		pts.append(c + Vector2(cos(a) * rx, sin(a) * ry))
	ci.draw_colored_polygon(pts, col)


## Thought-bubble geometry, in cells: radius, centre offset from the attach
## point, and outline width. Shared with thought_overhang_cells() so layout
## code reserves exactly the room the bubble draws into.
const THOUGHT_R := 0.21
const THOUGHT_DX := 0.15   ## x offset of the bubble centre, in radii
const THOUGHT_DY := -1.15  ## y offset of the bubble centre, in radii
const THOUGHT_OUTLINE := 0.03


## How far a mood piece's thought bubble pokes outside the piece's own bbox,
## in cells: x = past the right edge, y = above the top edge. The bubble hangs
## off the top-right cell (_bubble_attach), so this is the worst case.
static func thought_overhang_cells() -> Vector2:
	var reach := THOUGHT_R + THOUGHT_OUTLINE
	var right := 0.92 + THOUGHT_R * THOUGHT_DX + reach - 1.0
	var top := -(0.08 + THOUGHT_R * THOUGHT_DY - reach)
	return Vector2(maxf(right, 0.0), maxf(top, 0.0))


static func draw_thought(ci: CanvasItem, attach: Vector2, cell_size: float,
		mood: int, target: int, alpha: float) -> void:
	var r := cell_size * THOUGHT_R
	var bubble := attach + Vector2(r * THOUGHT_DX, r * THOUGHT_DY)
	var white := Color(1, 1, 1, alpha)
	var outline_col := Color(OUTLINE.r, OUTLINE.g, OUTLINE.b, alpha)
	var trail := attach + Vector2(-r * 0.15, r * 0.05)
	var mid := attach.lerp(bubble, 0.45)
	var ow := maxf(2.0, cell_size * THOUGHT_OUTLINE)
	# Outline discs first, then white fills: a solid sticker edge with no
	# hairline arcs.
	ci.draw_circle(trail, r * 0.16 + ow, outline_col)
	ci.draw_circle(mid, r * 0.22 + ow, outline_col)
	ci.draw_circle(bubble, r + ow, outline_col)
	ci.draw_circle(trail, r * 0.16, white)
	ci.draw_circle(mid, r * 0.22, white)
	ci.draw_circle(bubble, r, white)
	var icon := Palette.fill(target)
	icon.a = alpha
	if mood == BlockData.Mood.AFFECTIONATE:
		draw_heart(ci, bubble + Vector2(0, -r * 0.04), r * 0.78, icon)
	else:
		draw_bolt(ci, bubble, r * 0.82, icon)


static func draw_heart(ci: CanvasItem, c: Vector2, s: float, color: Color) -> void:
	ci.draw_circle(c + Vector2(-s * 0.28, -s * 0.12), s * 0.32, color)
	ci.draw_circle(c + Vector2(s * 0.28, -s * 0.12), s * 0.32, color)
	var pts := PackedVector2Array([
		c + Vector2(-s * 0.57, -s * 0.02),
		c + Vector2(0, s * 0.62),
		c + Vector2(s * 0.57, -s * 0.02),
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


static func _star_points(c: Vector2, r: float, inner := 0.46) -> PackedVector2Array:
	var pts := PackedVector2Array()
	for i in 5:
		var a := -PI / 2.0 + float(i) * TAU / 5.0
		pts.append(c + Vector2(cos(a), sin(a)) * r)
		var b := a + TAU / 10.0
		pts.append(c + Vector2(cos(b), sin(b)) * r * inner)
	return pts


static func draw_star(ci: CanvasItem, c: Vector2, r: float, fill: Color) -> void:
	ci.draw_colored_polygon(_star_points(c, r), fill)


## Chunky outlined star with a lighter upper half and a glint -- the win screen
## and level tiles use this one.
static func draw_star_fancy(ci: CanvasItem, c: Vector2, r: float, filled: bool) -> void:
	var o := maxf(2.0, r * 0.16)
	ci.draw_colored_polygon(_star_points(c + Vector2(0, o * 0.8), r + o), Color(TEXT_OUTLINE, 0.35))
	ci.draw_colored_polygon(_star_points(c, r + o), TEXT_OUTLINE)
	if not filled:
		ci.draw_colored_polygon(_star_points(c, r), Color("#4a3f86"))
		return
	ci.draw_colored_polygon(_star_points(c, r), STAR_DARK)
	ci.draw_colored_polygon(_star_points(c + Vector2(0, -r * 0.06), r * 0.86), STAR)
	ci.draw_circle(c + Vector2(-r * 0.22, -r * 0.3), r * 0.12, Color(1, 1, 1, 0.85))


## A tiny padlock glyph used on locked level tiles. `c` is the centre of the
## lock body; total bounding box ~ 2r wide.
static func draw_lock(ci: CanvasItem, c: Vector2, r: float,
		fill: Color, outline: Color) -> void:
	var body_r := r * 0.42
	var body := Rect2(c.x - body_r, c.y - body_r * 0.4, body_r * 2.0, body_r * 1.6)
	var shackle_centre := Vector2(c.x, c.y - body_r * 0.9)
	var shackle_r := body_r * 0.55
	ci.draw_arc(shackle_centre, shackle_r, PI, TAU, 12,
		fill, maxf(2.0, r * 0.18), true)
	ci.draw_line(shackle_centre + Vector2(-shackle_r, 0), shackle_centre + Vector2(-shackle_r, body_r * 0.6),
		fill, maxf(2.0, r * 0.18), true)
	ci.draw_line(shackle_centre + Vector2(shackle_r, 0), shackle_centre + Vector2(shackle_r, body_r * 0.6),
		fill, maxf(2.0, r * 0.18), true)
	ci.draw_style_box(box(fill, r * 0.18), body)
	ci.draw_circle(Vector2(c.x, c.y + body_r * 0.3), body_r * 0.2, outline)


## Accent colours for the four difficulty tiers in LevelSelect.
const TIER_COLORS := [
	Color("#4fc3ff"),   # Tier 0 - Warm-up (sky blue)
	Color("#ff9d42"),   # Tier 1 - Cozy (orange)
	Color("#ff5fa2"),   # Tier 2 - Tricky (pink)
	Color("#b06bff"),   # Tier 3 - Tangled (violet)
]


static func tier_color(tier: int) -> Color:
	return TIER_COLORS[clampi(tier, 0, TIER_COLORS.size() - 1)]
