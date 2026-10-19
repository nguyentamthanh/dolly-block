class_name Scenery
extends RefCounted

## The painted backdrops that sit behind a solved board inside a photo. Pure
## flat shapes in the cream theme's pastel set, drawn into whatever rect the
## caller gives (a thumbnail on the timeline, the big photo on the win screen).
## Ids wrap, so any int is a valid scene.

const COUNT := 5
const NAMES := ["Meadow", "Desert", "Road", "Snow", "Beach"]


static func draw(ci: CanvasItem, r: Rect2, id: int) -> void:
	match posmod(id, COUNT):
		0:
			_meadow(ci, r)
		1:
			_desert(ci, r)
		2:
			_road(ci, r)
		3:
			_snow(ci, r)
		_:
			_beach(ci, r)


## A soft three-lobed cloud centred on `c`, `s` px wide.
static func cloud(ci: CanvasItem, c: Vector2, s: float, col := Color.WHITE) -> void:
	ci.draw_circle(c + Vector2(-s * 0.24, s * 0.04), s * 0.17, col)
	ci.draw_circle(c + Vector2(s * 0.02, -s * 0.06), s * 0.23, col)
	ci.draw_circle(c + Vector2(s * 0.27, s * 0.04), s * 0.16, col)
	ci.draw_rect(Rect2(c + Vector2(-s * 0.24, s * 0.04), Vector2(s * 0.51, s * 0.16)), col)
	ci.draw_circle(c + Vector2(-s * 0.24, s * 0.12), s * 0.08, col)
	ci.draw_circle(c + Vector2(s * 0.27, s * 0.12), s * 0.08, col)


static func _meadow(ci: CanvasItem, r: Rect2) -> void:
	ci.draw_rect(r, Color("#cfe9f6"))
	cloud(ci, r.position + r.size * Vector2(0.72, 0.16), r.size.x * 0.34)
	var grass := Rect2(r.position + Vector2(0, r.size.y * 0.42), Vector2(r.size.x, r.size.y * 0.58))
	ci.draw_rect(grass, Color("#bddba6"))
	# Daisies: a fixed scatter, so a photo never changes between redraws.
	for i in 34:
		var fx := fposmod(sin(float(i) * 12.9898) * 43758.5453, 1.0)
		var fy := fposmod(sin(float(i) * 78.233) * 24634.6345, 1.0)
		var p := grass.position + Vector2(fx * grass.size.x, (0.04 + fy * 0.92) * grass.size.y)
		var pr := maxf(1.5, r.size.x * 0.012)
		ci.draw_circle(p, pr, Color.WHITE)
		ci.draw_circle(p, pr * 0.4, Color("#f4d37a"))


static func _desert(ci: CanvasItem, r: Rect2) -> void:
	ci.draw_rect(r, Color("#d4ecf4"))
	cloud(ci, r.position + r.size * Vector2(0.3, 0.2), r.size.x * 0.34)
	ci.draw_circle(r.position + r.size * Vector2(0.8, 0.16), r.size.x * 0.07, Color("#fff1c4"))
	var sand := Rect2(r.position + Vector2(0, r.size.y * 0.46), Vector2(r.size.x, r.size.y * 0.54))
	ci.draw_rect(sand, Color("#ffd98c"))
	_hill(ci, r, 0.62, 0.07, 0.0, Color("#f7c874"))
	_hill(ci, r, 0.84, 0.06, 1.6, Color("#f2bd68"))


static func _road(ci: CanvasItem, r: Rect2) -> void:
	ci.draw_rect(r, Color("#d5e9f1"))
	cloud(ci, r.position + r.size * Vector2(0.25, 0.18), r.size.x * 0.3)
	var horizon := r.position.y + r.size.y * 0.42
	ci.draw_rect(Rect2(r.position.x, horizon, r.size.x, r.end.y - horizon), Color("#bddba8"))
	var cx := r.position.x + r.size.x * 0.5
	ci.draw_colored_polygon(PackedVector2Array([
		Vector2(cx - r.size.x * 0.05, horizon), Vector2(cx + r.size.x * 0.05, horizon),
		Vector2(r.end.x - r.size.x * 0.04, r.end.y), Vector2(r.position.x + r.size.x * 0.04, r.end.y)]),
		Color("#a9b0b8"))
	# Centre dashes get longer and wider toward the viewer.
	for i in 5:
		var t0 := 0.12 + float(i) * 0.19
		var t1 := t0 + 0.09 + float(i) * 0.02
		var y0 := horizon + (r.end.y - horizon) * t0
		var y1 := horizon + (r.end.y - horizon) * minf(t1, 1.0)
		var w0 := r.size.x * (0.006 + 0.012 * t0)
		var w1 := r.size.x * (0.006 + 0.012 * t1)
		ci.draw_colored_polygon(PackedVector2Array([
			Vector2(cx - w0, y0), Vector2(cx + w0, y0), Vector2(cx + w1, y1), Vector2(cx - w1, y1)]),
			Color("#f4f6f8"))


static func _snow(ci: CanvasItem, r: Rect2) -> void:
	ci.draw_rect(r, Color("#4e5b66"))
	var snow := Rect2(r.position + Vector2(0, r.size.y * 0.5), Vector2(r.size.x, r.size.y * 0.5))
	ci.draw_rect(snow, Color("#dfe9ef"))
	_hill(ci, r, 0.54, 0.05, 0.8, Color("#cfdbe3"))
	for i in 26:
		var fx := fposmod(sin(float(i) * 31.7) * 9731.1, 1.0)
		var fy := fposmod(sin(float(i) * 17.3) * 5113.7, 1.0)
		ci.draw_circle(r.position + Vector2(fx, fy * 0.9) * r.size,
			maxf(1.2, r.size.x * 0.009), Color(1, 1, 1, 0.75))


static func _beach(ci: CanvasItem, r: Rect2) -> void:
	ci.draw_rect(r, Color("#ffe3d0"))
	ci.draw_circle(r.position + r.size * Vector2(0.3, 0.3), r.size.x * 0.1, Color("#ffbf99"))
	var sea := Rect2(r.position + Vector2(0, r.size.y * 0.46), Vector2(r.size.x, r.size.y * 0.2))
	ci.draw_rect(sea, Color("#93c9d5"))
	var sand := Rect2(r.position + Vector2(0, r.size.y * 0.64), Vector2(r.size.x, r.size.y * 0.36))
	ci.draw_rect(sand, Color("#f8e1b4"))
	_hill(ci, r, 0.64, 0.025, 2.4, Color("#e8f5f4"))


## A gently rolling band: everything below a sine edge at `base` (fraction of
## the rect height) is filled with `col`.
static func _hill(ci: CanvasItem, r: Rect2, base: float, amp: float, phase: float, col: Color) -> void:
	var pts := PackedVector2Array()
	var n := 16
	for i in n + 1:
		var t := float(i) / float(n)
		var y := r.position.y + r.size.y * (base + sin(t * TAU * 0.8 + phase) * amp)
		pts.append(Vector2(r.position.x + r.size.x * t, y))
	pts.append(Vector2(r.end.x, r.end.y))
	pts.append(Vector2(r.position.x, r.end.y))
	ci.draw_colored_polygon(pts, col)
