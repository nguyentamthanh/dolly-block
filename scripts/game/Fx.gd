class_name Fx
extends RefCounted

## Juice toolkit: particle bursts, rings, floating text, screen shake and
## "fly to counter" collectibles. Every texture is generated in code (cached
## statically), keeping the project's "no image assets" art direction.
##
## Particle factories self-free via a child Timer rather than
## `get_tree().create_timer()`, since the latter requires the node already be
## inside the scene tree; a Timer child with `autostart = true` is safe to
## configure before the particle node itself is added to the live scene.

static var _tex_cache: Dictionary = {}


## Motion-heavy intros are skipped in headless runs: the tests inspect layout a
## few frames after load and must see pieces at rest.
static func juice_enabled() -> bool:
	return DisplayServer.get_name() != "headless"


# --- Procedural textures ---------------------------------------------------

static func _tex(kind: String) -> Texture2D:
	if _tex_cache.has(kind):
		return _tex_cache[kind]
	var n := 32
	if kind == "confetti":
		var img_c := Image.create(8, 14, false, Image.FORMAT_RGBA8)
		img_c.fill(Color.WHITE)
		var tc := ImageTexture.create_from_image(img_c)
		_tex_cache[kind] = tc
		return tc
	var img := Image.create(n, n, false, Image.FORMAT_RGBA8)
	for y in n:
		for x in n:
			var p := (Vector2(x, y) + Vector2(0.5, 0.5)) / float(n) * 2.0 - Vector2.ONE
			var a := 0.0
			match kind:
				"circle":
					a = clampf((1.0 - p.length()) * 10.0, 0.0, 1.0)
				"soft":
					a = clampf(1.0 - p.length(), 0.0, 1.0)
					a = a * a
				"sparkle":
					# Four-point star: astroid-ish |x|^0.5 + |y|^0.5 < 1, plus a
					# soft core glow.
					var d := sqrt(absf(p.x)) + sqrt(absf(p.y))
					a = clampf((1.0 - d) * 6.0, 0.0, 1.0)
					a = maxf(a, clampf(1.0 - p.length() * 2.2, 0.0, 1.0))
				"heart":
					var hx := p.x * 1.25
					var hy := -p.y * 1.25 + 0.25
					var f := pow(hx * hx + hy * hy - 1.0, 3.0) - hx * hx * hy * hy * hy
					a = 1.0 if f <= 0.0 else 0.0
				"ring":
					a = clampf(1.0 - absf(p.length() - 0.8) * 9.0, 0.0, 1.0)
			img.set_pixel(x, y, Color(1, 1, 1, a))
	var t := ImageTexture.create_from_image(img)
	_tex_cache[kind] = t
	return t


static func _fade_ramp(c: Color) -> Gradient:
	var g := Gradient.new()
	g.offsets = PackedFloat32Array([0.0, 0.7, 1.0])
	g.colors = PackedColorArray([c, c, Color(c.r, c.g, c.b, 0.0)])
	return g


static func _shrink_curve() -> Curve:
	var cv := Curve.new()
	cv.add_point(Vector2(0.0, 0.4))
	cv.add_point(Vector2(0.15, 1.0))
	cv.add_point(Vector2(1.0, 0.0))
	return cv


static func _burst(pos: Vector2, tex: String, amount: int, lifetime: float) -> CPUParticles2D:
	var p := CPUParticles2D.new()
	p.position = pos
	p.emitting = false
	p.one_shot = true
	p.explosiveness = 1.0
	p.amount = amount
	p.lifetime = lifetime
	p.texture = _tex(tex)
	p.local_coords = false
	p.z_index = 20  # above resting pieces (z 0/1); below a dragged one (100)
	return p


static func _go(p: CPUParticles2D) -> CPUParticles2D:
	p.emitting = true
	_autofree(p, p.lifetime + 0.15)
	return p


# --- Particle factories ----------------------------------------------------

## Small one-shot burst of candy bits at a placed piece's centre.
static func piece_pop(pos: Vector2, color: Color) -> CPUParticles2D:
	var p := _burst(pos, "circle", 14, 0.5)
	p.direction = Vector2.UP
	p.spread = 180.0
	p.gravity = Vector2(0, 700)
	p.initial_velocity_min = 160.0
	p.initial_velocity_max = 340.0
	p.damping_min = 60.0
	p.damping_max = 120.0
	p.scale_amount_min = 0.25
	p.scale_amount_max = 0.5
	p.scale_amount_curve = _shrink_curve()
	p.color = color.lightened(0.1)
	return _go(p)


## Twinkling four-point stars flung outward.
static func star_sparkle(pos: Vector2, color := Color.WHITE, amount := 9, power := 1.0) -> CPUParticles2D:
	var p := _burst(pos, "sparkle", amount, 0.6)
	p.spread = 180.0
	p.gravity = Vector2.ZERO
	p.initial_velocity_min = 140.0 * power
	p.initial_velocity_max = 320.0 * power
	p.damping_min = 300.0 * power
	p.damping_max = 500.0 * power
	p.angular_velocity_min = -360.0
	p.angular_velocity_max = 360.0
	p.scale_amount_min = 0.6
	p.scale_amount_max = 1.2
	p.scale_amount_curve = _shrink_curve()
	p.color = color
	return _go(p)


## A few hearts that float up -- a piece just became happy.
static func hearts_up(pos: Vector2, color := Color("#ff5fa2")) -> CPUParticles2D:
	var p := _burst(pos, "heart", 6, 1.0)
	p.explosiveness = 0.75
	p.direction = Vector2.UP
	p.spread = 40.0
	p.gravity = Vector2(0, -120)
	p.initial_velocity_min = 60.0
	p.initial_velocity_max = 130.0
	p.scale_amount_min = 0.6
	p.scale_amount_max = 1.0
	p.scale_amount_curve = _shrink_curve()
	p.color_ramp = _fade_ramp(color)
	p.emission_shape = CPUParticles2D.EMISSION_SHAPE_SPHERE
	p.emission_sphere_radius = 18.0
	return _go(p)


## A grumpy smoke puff -- a piece just became upset.
static func puff(pos: Vector2, color := Color(0.45, 0.4, 0.6)) -> CPUParticles2D:
	var p := _burst(pos, "soft", 10, 0.55)
	p.spread = 180.0
	p.gravity = Vector2(0, -40)
	p.initial_velocity_min = 50.0
	p.initial_velocity_max = 120.0
	p.damping_min = 80.0
	p.damping_max = 140.0
	p.scale_amount_min = 1.0
	p.scale_amount_max = 1.8
	p.scale_amount_curve = _shrink_curve()
	p.color_ramp = _fade_ramp(Color(color, 0.8))
	return _go(p)


## Big multi-colour burst. Uses color_initial_ramp with CONSTANT interpolation
## so each particle picks ONE palette hue for its whole life (color_ramp would
## fade every particle through all of them).
static func confetti_burst(pos: Vector2, amount := 70, power := 1.0) -> CPUParticles2D:
	var p := _burst(pos, "confetti", amount, 1.6)
	p.explosiveness = 0.95
	p.direction = Vector2.UP
	p.spread = 70.0
	p.gravity = Vector2(0, 900)
	p.initial_velocity_min = 500.0 * power
	p.initial_velocity_max = 950.0 * power
	p.damping_min = 120.0
	p.damping_max = 260.0
	p.angle_min = -180.0
	p.angle_max = 180.0
	p.angular_velocity_min = -720.0
	p.angular_velocity_max = 720.0
	p.scale_amount_min = 0.8
	p.scale_amount_max = 1.5
	p.color_initial_ramp = _confetti_gradient()
	return _go(p)


## Confetti cannon from a screen corner, angled inward.
static func confetti_cannon(pos: Vector2, dir: Vector2, amount := 60) -> CPUParticles2D:
	var p := confetti_burst(pos, amount, 1.25)
	p.direction = dir.normalized()
	p.spread = 22.0
	return p


## Gentle full-width confetti rain from above the given rect.
static func confetti_rain(rect: Rect2, amount := 90) -> CPUParticles2D:
	var p := _burst(Vector2(rect.get_center().x, rect.position.y - 20.0), "confetti", amount, 3.2)
	p.explosiveness = 0.0
	p.emission_shape = CPUParticles2D.EMISSION_SHAPE_RECTANGLE
	p.emission_rect_extents = Vector2(rect.size.x * 0.5, 8.0)
	p.direction = Vector2.DOWN
	p.spread = 15.0
	p.gravity = Vector2(0, 260)
	p.initial_velocity_min = 80.0
	p.initial_velocity_max = 200.0
	p.angle_min = -180.0
	p.angle_max = 180.0
	p.angular_velocity_min = -400.0
	p.angular_velocity_max = 400.0
	p.scale_amount_min = 0.7
	p.scale_amount_max = 1.3
	p.color_initial_ramp = _confetti_gradient()
	p.emitting = true
	_autofree(p, p.lifetime * 2.0 + 0.2)
	return p


static func _confetti_gradient() -> Gradient:
	var grad := Gradient.new()
	grad.interpolation_mode = Gradient.GRADIENT_INTERPOLATE_CONSTANT
	var hues := [Palette.Hue.PINK, Palette.Hue.YELLOW, Palette.Hue.GREEN,
		Palette.Hue.BLUE, Palette.Hue.PURPLE, Palette.Hue.ORANGE]
	var offs := PackedFloat32Array()
	var cols := PackedColorArray()
	for i in hues.size():
		offs.append(float(i) / float(hues.size()))
		cols.append(Palette.fill(hues[i]))
	grad.offsets = offs
	grad.colors = cols
	return grad


static func _autofree(p: Node, delay: float) -> void:
	var timer := Timer.new()
	timer.wait_time = delay
	timer.one_shot = true
	timer.autostart = true
	p.add_child(timer)
	timer.timeout.connect(p.queue_free)


# --- Drawn effects ---------------------------------------------------------

## Expanding, fading shockwave ring.
class Ring extends Node2D:
	var radius := 60.0
	var color := Color.WHITE
	var width := 10.0
	var t := 0.0
	var duration := 0.45

	func _process(delta: float) -> void:
		t += delta / duration
		if t >= 1.0:
			queue_free()
			return
		queue_redraw()

	func _draw() -> void:
		var k := 1.0 - pow(1.0 - t, 3.0)
		var r := radius * (0.35 + 0.85 * k)
		var c := color
		c.a *= 1.0 - t
		draw_arc(Vector2.ZERO, r, 0.0, TAU, 48, c, maxf(1.0, width * (1.0 - t)), true)


static func ring_wave(pos: Vector2, radius: float, color := Color.WHITE, width := 10.0) -> Node2D:
	var r := Ring.new()
	r.position = pos
	r.radius = radius
	r.color = color
	r.width = width
	r.z_index = 20
	return r


## Outlined text that pops in, drifts up and fades. Returned already
## configured; the caller adds it to a Control parent.
static func float_text(text: String, pos: Vector2, color := Color.WHITE, size := 56,
		rise := 90.0, hold := 0.55) -> Label:
	var l := Label.new()
	l.text = text
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	l.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	Art.style_label(l, size, color, Art.TEXT_OUTLINE)
	var w := 700.0
	var h := size * 1.6
	l.size = Vector2(w, h)
	l.position = pos - Vector2(w, h) * 0.5
	l.pivot_offset = Vector2(w, h) * 0.5
	l.scale = Vector2(0.3, 0.3)
	l.z_index = 200
	l.ready.connect(func():
		var t := l.create_tween()
		t.tween_property(l, "scale", Vector2(1.18, 1.18), 0.16) \
			.set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
		t.tween_property(l, "scale", Vector2.ONE, 0.1)
		t.tween_interval(hold)
		t.set_parallel(true)
		t.tween_property(l, "position:y", l.position.y - rise, 0.45) \
			.set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_IN)
		t.tween_property(l, "modulate:a", 0.0, 0.45)
		t.chain().tween_callback(l.queue_free))
	return l


## Decaying, smooth (sin-driven, not per-frame random) positional shake. Only
## ever applied to a visual container whose children all compute their
## positions relative to each other, so gameplay maths is unaffected.
static func shake(node: Node, strength := 8.0, duration := 0.3) -> void:
	# Node2D and Control both have `position`, CanvasItem does not -- hence the
	# untyped get/set.
	if node == null or not node.is_inside_tree():
		return
	if not node.has_meta("shake_base"):
		node.set_meta("shake_base", node.get("position"))
	var base: Vector2 = node.get_meta("shake_base")
	var prev = node.get_meta("shake_tween") if node.has_meta("shake_tween") else null
	if prev is Tween and (prev as Tween).is_valid():
		(prev as Tween).kill()
	var seed := randf() * 100.0
	var t := node.create_tween()
	t.tween_method(func(k: float):
		var amp := strength * (1.0 - k) * (1.0 - k)
		node.set("position", base + Vector2(sin(seed + k * 55.0), cos(seed * 1.7 + k * 43.0)) * amp),
		0.0, 1.0, duration)
	t.tween_callback(func():
		node.set("position", base)
		node.remove_meta("shake_base"))
	node.set_meta("shake_tween", t)


## Little gems that arc from `from` to `to` (both global), one by one, calling
## `on_arrive` as each lands -- the classic "reward flies into the counter".
static func fly_gems(parent: Node, from: Vector2, to: Vector2, count: int,
		on_arrive: Callable, on_done: Callable = Callable()) -> void:
	if parent == null or not parent.is_inside_tree():
		return
	for i in count:
		var g := Control.new()
		g.top_level = true
		g.mouse_filter = Control.MOUSE_FILTER_IGNORE
		g.size = Vector2(40, 40)
		g.pivot_offset = g.size * 0.5
		g.z_index = 300
		g.draw.connect(func(): Art.draw_gem(g, g.size * 0.5, 14.0))
		parent.add_child(g)
		var spread := Vector2(randf_range(-70, 70), randf_range(-50, 30))
		var start := from + spread * 0.3
		var ctrl := from.lerp(to, 0.35) + Vector2(randf_range(-160, 160), randf_range(-60, 120))
		g.global_position = start - g.size * 0.5
		g.scale = Vector2.ZERO
		var t := g.create_tween()
		t.tween_interval(i * 0.06)
		t.tween_property(g, "scale", Vector2(1.2, 1.2), 0.12) \
			.set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
		t.tween_method(func(k: float):
			var a := start.lerp(ctrl, k)
			var b := ctrl.lerp(to, k)
			g.global_position = a.lerp(b, k) - g.size * 0.5
			g.scale = Vector2.ONE * lerpf(1.2, 0.7, k),
			0.0, 1.0, 0.5).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN)
		var last := i == count - 1
		t.tween_callback(func():
			if on_arrive.is_valid():
				on_arrive.call()
			if last and on_done.is_valid():
				on_done.call()
			g.queue_free())
