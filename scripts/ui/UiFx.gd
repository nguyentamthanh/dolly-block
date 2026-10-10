class_name UiFx
extends RefCounted

## Small reusable UI motion helpers: squishy press feedback that works on touch
## (not just mouse hover), idle "breathing" for the main call-to-action, and
## staggered pop-ins for screens as they appear.


## Device safe-area insets (notch / punch-hole / home-indicator bars) in the
## node's logical canvas units: {top, bottom, left, right}. Zero on desktop and
## web, where DisplayServer's "safe area" describes the monitor (taskbar), not
## the game window.
static func safe_insets(c: Control) -> Dictionary:
	var out := {"top": 0.0, "bottom": 0.0, "left": 0.0, "right": 0.0}
	if c == null or not c.is_inside_tree() or not OS.has_feature("mobile"):
		return out
	var win := DisplayServer.window_get_size()
	if win.x <= 0 or win.y <= 0:
		return out
	var safe := DisplayServer.get_display_safe_area()
	var vis := c.get_viewport().get_visible_rect().size
	var sx := vis.x / float(win.x)
	var sy := vis.y / float(win.y)
	out.top = maxf(0.0, safe.position.y * sy)
	out.left = maxf(0.0, safe.position.x * sx)
	out.bottom = maxf(0.0, (win.y - safe.end.y) * sy)
	out.right = maxf(0.0, (win.x - safe.end.x) * sx)
	return out


## Keep a full-width bar's content inside a centred column of at most
## `max_w` (tracking `ref`'s width as the window resizes), with at least
## `min_margin` + safe-area insets at the sides.
static func cap_width(bar: Control, ref: Control, max_w: float, min_margin: float,
		safe_l := 0.0, safe_r := 0.0) -> void:
	var fit := func():
		var w := ref.size.x if ref.size.x > 1.0 else ref.get_viewport_rect().size.x
		var m := maxf(min_margin, (w - max_w) * 0.5)
		bar.offset_left = m + safe_l
		bar.offset_right = -(m + safe_r)
	fit.call()
	ref.resized.connect(fit)


## Keeps a Control's pivot at its centre through every container re-layout, so
## scale tweens grow from the middle instead of the top-left corner.
static func center_pivot(c: Control) -> void:
	c.pivot_offset = c.size * 0.5
	if not c.has_meta("pivot_centered"):
		c.set_meta("pivot_centered", true)
		c.resized.connect(_recenter.bind(c))


static func _recenter(c: Control) -> void:
	c.pivot_offset = c.size * 0.5


## Press: squash down to 0.9. Release: overshoot to 1.08 and settle. A running
## pulse() is paused while the finger is down and resumed afterwards.
static func juicy(b: BaseButton) -> void:
	center_pivot(b)
	b.button_down.connect(func():
		_stop(b, "pulse_tween")
		_run(b, "press_tween", func(t: Tween):
			t.tween_property(b, "scale", Vector2(0.9, 0.9), 0.07) \
				.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)))
	b.button_up.connect(func():
		_run(b, "press_tween", func(t: Tween):
			t.tween_property(b, "scale", Vector2(1.08, 1.08), 0.09) \
				.set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
			t.tween_property(b, "scale", Vector2.ONE, 0.12) \
				.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
			t.tween_callback(func():
				if b.has_meta("pulse_amount"):
					pulse(b, b.get_meta("pulse_amount"), b.get_meta("pulse_period")))))


## Gentle looping scale breath that draws the eye to the primary action.
static func pulse(c: Control, amount := 0.05, period := 1.1) -> void:
	center_pivot(c)
	c.set_meta("pulse_amount", amount)
	c.set_meta("pulse_period", period)
	_run(c, "pulse_tween", func(t: Tween):
		t.set_loops()
		t.tween_property(c, "scale", Vector2.ONE * (1.0 + amount), period * 0.5) \
			.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
		t.tween_property(c, "scale", Vector2.ONE, period * 0.5) \
			.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT))


## Scale in from nothing with an overshoot, after `delay` seconds.
static func pop_in(c: Control, delay := 0.0, duration := 0.38) -> void:
	center_pivot(c)
	c.scale = Vector2.ZERO
	_run(c, "pop_tween", func(t: Tween):
		t.tween_interval(delay)
		t.tween_property(c, "scale", Vector2.ONE, duration) \
			.set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT))


## Slide in from an offset while fading up.
static func slide_in(c: Control, from_offset: Vector2, delay := 0.0, duration := 0.45) -> void:
	var target := c.position
	c.position = target + from_offset
	c.modulate.a = 0.0
	_run(c, "slide_tween", func(t: Tween):
		t.tween_interval(delay)
		t.set_parallel(true)
		t.tween_property(c, "position", target, duration) \
			.set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
		t.tween_property(c, "modulate:a", 1.0, duration * 0.6))


## Quick "boing" for a counter or chip that just changed.
static func bump(c: Control, amount := 0.18) -> void:
	center_pivot(c)
	_run(c, "bump_tween", func(t: Tween):
		t.tween_property(c, "scale", Vector2.ONE * (1.0 + amount), 0.06)
		t.tween_property(c, "scale", Vector2.ONE, 0.18) \
			.set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT))


static func _run(c: Node, key: String, build: Callable) -> Tween:
	_stop(c, key)
	var t := c.create_tween()
	build.call(t)
	c.set_meta(key, t)
	return t


static func _stop(c: Node, key: String) -> void:
	if not c.has_meta(key):
		return
	var prev = c.get_meta(key)
	if prev is Tween and (prev as Tween).is_valid():
		(prev as Tween).kill()
