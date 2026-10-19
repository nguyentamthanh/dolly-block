class_name PhotoCard
extends Control

## One polaroid: a painted scene with the solved board lying on it, a "# 064"
## chip and up to three stars underneath. Shared by the win screen (big, stars
## pop in one by one) and the timeline (small, hung from a clothes-peg).
##
## The board is rebuilt from GameState.photos[level].pieces, the snapshot taken
## the moment the level was solved, so a photo never depends on regenerating the
## level.

## Card height as a multiple of its width.
const ASPECT := 1.215
const PAD := 0.055            ## window inset, fraction of card width
const WINDOW_ASPECT := 1.08   ## window height / window width
const FOOTER := 0.15          ## footer height, fraction of card width

var level_index := 0
var snapshot: Array = []
var bg := 0
## Stars drawn gold; the rest are grey. The win screen animates this 0 -> n.
var stars := 0
## An unsolved level's placeholder: blank window, grey chip, no stars.
var empty := false


func _ready() -> void:
	pivot_offset = Vector2(size.x * 0.5, size.y * 0.08)
	resized.connect(func(): pivot_offset = Vector2(size.x * 0.5, size.y * 0.08))


static func height_for(width: float) -> float:
	return width * ASPECT


## Fill this card from a saved photo dictionary ({stars, bg, pieces}).
func setup(index: int, photo: Dictionary, shown_stars := -1) -> void:
	level_index = index
	empty = photo.is_empty()
	snapshot = photo.get("pieces", []) as Array
	bg = int(photo.get("bg", 0))
	stars = int(photo.get("stars", 0)) if shown_stars < 0 else shown_stars
	queue_redraw()


func set_bg(id: int) -> void:
	bg = id
	queue_redraw()


func set_stars(n: int) -> void:
	stars = n
	queue_redraw()


## Where the i-th star sits, in this card's local coordinates (for sparkles).
func star_position(i: int) -> Vector2:
	return _star_centre(Rect2(Vector2.ZERO, size), i)


func _draw() -> void:
	paint(self, Rect2(Vector2.ZERO, size), level_index, snapshot, bg, stars, empty)


static func paint(ci: CanvasItem, rect: Rect2, index: int, pieces: Array, scene: int,
		star_count: int, is_empty := false) -> void:
	var w := rect.size.x
	var shadow := rect
	shadow.position.y += w * 0.018
	ci.draw_style_box(Art.box(Color(0.45, 0.33, 0.25, 0.16), w * 0.04), shadow.grow(w * 0.006))
	ci.draw_style_box(Art.box(Art.WHITE, w * 0.035), rect)

	var window := _window(rect)
	if is_empty:
		ci.draw_rect(window, Color("#f1e9e1"))
		var f := Art.thin_font()
		var fs := int(w * 0.34)
		ci.draw_string(f, Vector2(window.position.x, window.get_center().y + fs * 0.34), "?",
			HORIZONTAL_ALIGNMENT_CENTER, window.size.x, fs, Color("#dccfc4"))
	else:
		Scenery.draw(ci, window, scene)
		_draw_board(ci, window, pieces)

	# Footer: level chip on the left, stars on the right.
	var fh := w * FOOTER
	var fy := window.end.y + (rect.end.y - window.end.y) * 0.5
	var chip := Rect2(window.position.x, fy - fh * 0.31, w * 0.2, fh * 0.62)
	ci.draw_style_box(Art.box(Color("#f1efed"), chip.size.y * 0.3), chip)
	var font := Art.thin_font()
	var cfs := int(chip.size.y * 0.62)
	ci.draw_string(font, Vector2(chip.position.x, chip.get_center().y + cfs * 0.34),
		"# %03d" % (index + 1), HORIZONTAL_ALIGNMENT_CENTER, chip.size.x, cfs, Color("#a8a29c"))
	if not is_empty:
		for i in 3:
			var col := Art.STAR if i < star_count else Color("#e6e1dc")
			Art.draw_star(ci, _star_centre(rect, i), fh * 0.3, col)


static func _window(rect: Rect2) -> Rect2:
	var w := rect.size.x
	var p := w * PAD
	return Rect2(rect.position + Vector2(p, p), Vector2(w - p * 2.0, (w - p * 2.0) * WINDOW_ASPECT))


static func _star_centre(rect: Rect2, i: int) -> Vector2:
	var window := _window(rect)
	var fh := rect.size.x * FOOTER
	var fy := window.end.y + (rect.end.y - window.end.y) * 0.5
	var r := fh * 0.3
	return Vector2(window.end.x - r * 1.1 - float(2 - i) * r * 2.35, fy)


## Lay the saved pieces out centred in the window at the largest cell size that
## leaves a margin. Photos always show the pieces neutral (no thought bubbles):
## at thumbnail size the bubbles are noise.
static func _draw_board(ci: CanvasItem, window: Rect2, pieces: Array) -> void:
	var recs: Array = []
	var lo := Vector2i(1 << 20, 1 << 20)
	var hi := Vector2i(-(1 << 20), -(1 << 20))
	for p in pieces:
		var cells: Array[Vector2i] = []
		for c in p.get("cells", []):
			var v := Vector2i(int(c[0]), int(c[1]))
			cells.append(v)
			lo = Vector2i(mini(lo.x, v.x), mini(lo.y, v.y))
			hi = Vector2i(maxi(hi.x, v.x), maxi(hi.y, v.y))
		if cells.is_empty():
			continue
		var eye_arr: Array = p.get("eye", [cells[0].x, cells[0].y])
		recs.append({"cells": cells, "color": int(p.get("color", 0)),
			"eye": Vector2i(int(eye_arr[0]), int(eye_arr[1]))})
	if recs.is_empty():
		return

	var span := Vector2(hi - lo + Vector2i.ONE)
	var cs := floorf(minf(window.size.x * 0.86 / span.x, window.size.y * 0.86 / span.y))
	cs = maxf(cs, 4.0)
	var origin := (window.get_center() - span * cs * 0.5).round()
	for rec in recs:
		var cells: Array[Vector2i] = rec.cells
		var mn := PieceData.bbox_min(cells)
		var local: Array[Vector2i] = []
		for c in cells:
			local.append(c - mn)
		Art.draw_polyomino(ci, origin + Vector2(mn - lo) * cs, cs, local, rec.color,
			(rec.eye as Vector2i) - mn, PieceData.Mood.NEUTRAL, 0, false)
