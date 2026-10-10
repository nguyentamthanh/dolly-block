class_name Sfx
extends Node

## Procedural sound effects -- every blip is synthesized in code (short
## sine/square tone bursts shaped by a small hand-rolled envelope), no
## external audio files. Matches the project's "everything is code-drawn"
## constraint, applied to audio.
##
## Godot's --headless mode uses a dummy audio driver, so AudioStreamPlayer
## calls are expected to be a safe no-op there -- both test suites instantiate
## Sfx and call play() as part of normal play, and staying green after that is
## exactly what confirms this holds.

const MIX_RATE := 22050
const POOL_SIZE := 6

## Cached per sound name so repeat play() calls (and repeat Sfx instances
## across scenes) don't re-synthesize.
static var _cache: Dictionary = {}   # String -> AudioStreamWAV

var _players: Array[AudioStreamPlayer] = []


## Built in _init(), not _ready() -- callers create an Sfx and use it
## immediately (`_sfx = Sfx.new(); add_child(_sfx); _sfx.play(...)`), and
## _ready() only fires once the node has actually entered the tree, which is
## deferred past the current call. _init() runs synchronously, and Godot
## allows add_child() before the parent itself is in any tree -- children just
## enter together with it later.
func _init() -> void:
	for i in POOL_SIZE:
		var p := AudioStreamPlayer.new()
		p.bus = "Master"
		add_child(p)
		_players.append(p)


## Plays a named sound, gated on GameState.sound_enabled. Synthesizes and
## caches the buffer on first use, then just triggers playback. `pitch` lets
## callers vary repeats (combo ladders, random detune) so nothing sounds canned.
func play(name: String, volume_db: float = 0.0, pitch: float = 1.0) -> void:
	if not GameState.sound_enabled:
		return
	var stream: AudioStreamWAV = _cache.get(name)
	if stream == null:
		stream = _synth(name)
		_cache[name] = stream
	var p := _next_free_player()
	p.stream = stream
	p.volume_db = volume_db
	p.pitch_scale = clampf(pitch, 0.25, 4.0)
	p.play()


func _next_free_player() -> AudioStreamPlayer:
	for p in _players:
		if not p.playing:
			return p
	# Every player is busy -- blips are short and rarely collide this much;
	# stealing the oldest is unnoticeable and simpler than a priority queue.
	return _players[0]


# --- Synthesis -----------------------------------------------------------
#
# One named sound per case, built from short tone bursts. `vol_env` is a tiny
# hand-rolled ADSR: an Array[Vector2] of (time_fraction, amplitude) control
# points, linearly interpolated across the tone's duration.

static func _synth(name: String) -> AudioStreamWAV:
	match name:
		"pickup":
			return _wav(_sweep(440.0, 660.0, 0.06, "sine",
				[Vector2(0, 0), Vector2(0.15, 0.7), Vector2(1, 0)]))
		"place":
			# A sharp fundamental plus a quiet octave-up layer for a "clink".
			var main := _tone(523.0, 0.09, "sine",
				[Vector2(0, 0), Vector2(0.05, 1.0), Vector2(1, 0)])
			var clink := _tone(1046.0, 0.09, "sine",
				[Vector2(0, 0), Vector2(0.05, 0.3), Vector2(1, 0)])
			return _wav(_mix(main, clink))
		"refuse":
			return _wav(_sweep(180.0, 140.0, 0.12, "square",
				[Vector2(0, 0.8), Vector2(1, 0)]))
		"undo":
			return _wav(_sweep(660.0, 440.0, 0.08, "sine",
				[Vector2(0, 0), Vector2(0.15, 0.7), Vector2(1, 0)]))
		"hint_deny":
			# Two short buzzes -- a firm "no" distinct from the softer refuse.
			var p1 := _tone(160.0, 0.06, "square", [Vector2(0, 0.8), Vector2(1, 0)])
			var gap := _silence(0.03)
			var p2 := _tone(160.0, 0.06, "square", [Vector2(0, 0.8), Vector2(1, 0)])
			return _wav(_concat([p1, gap, p2]))
		"hint_use":
			var n1 := _tone(660.0, 0.09, "sine", [Vector2(0, 0), Vector2(0.1, 1), Vector2(1, 0)])
			var n2 := _tone(880.0, 0.09, "sine", [Vector2(0, 0), Vector2(0.1, 1), Vector2(1, 0)])
			return _wav(_concat([n1, n2]))
		"button_tap":
			return _wav(_tone(700.0, 0.04, "sine", [Vector2(0, 1), Vector2(1, 0)]))
		"star_pop":
			return _wav(_tone(659.0, 0.07, "sine", [Vector2(0, 0), Vector2(0.1, 1), Vector2(1, 0)]))
		"diamond_tick":
			return _wav(_tone(1200.0, 0.03, "sine", [Vector2(0, 1), Vector2(1, 0)]))
		"win_fanfare":
			var notes := [523.0, 659.0, 784.0, 1046.0]
			var parts: Array = []
			for i in notes.size():
				var d := 0.12 if i < notes.size() - 1 else 0.28
				parts.append(_tone(notes[i], d, "sine",
					[Vector2(0, 0), Vector2(0.08, 1.0), Vector2(0.8, 0.6), Vector2(1, 0)]))
			return _wav(_concat(parts))
		"tick":
			# Tiny wooden tick as a ghost snaps onto a new legal spot.
			return _wav(_tone(1500.0, 0.018, "sine", [Vector2(0, 0.7), Vector2(1, 0)]))
		"pop":
			return _wav(_sweep(900.0, 300.0, 0.07, "sine",
				[Vector2(0, 0), Vector2(0.1, 1.0), Vector2(1, 0)]))
		"sparkle":
			var a := _tone(1568.0, 0.12, "sine", [Vector2(0, 0), Vector2(0.05, 0.6), Vector2(1, 0)])
			var b := _tone(2349.0, 0.12, "sine", [Vector2(0, 0), Vector2(0.05, 0.35), Vector2(1, 0)])
			return _wav(_mix(a, b))
		"happy":
			var h1 := _tone(784.0, 0.07, "sine", [Vector2(0, 0), Vector2(0.1, 0.9), Vector2(1, 0)])
			var h2 := _tone(1175.0, 0.11, "sine", [Vector2(0, 0), Vector2(0.1, 0.9), Vector2(1, 0)])
			return _wav(_concat([h1, h2]))
		"upset":
			return _wav(_sweep(240.0, 150.0, 0.16, "square",
				[Vector2(0, 0), Vector2(0.1, 0.4), Vector2(1, 0)]))
		"whoosh":
			return _wav(_noise(0.3, [Vector2(0, 0), Vector2(0.45, 0.55), Vector2(1, 0)]))
		"star_slam":
			var thump := _sweep(220.0, 70.0, 0.14, "sine", [Vector2(0, 1.0), Vector2(1, 0)])
			var ding := _tone(1319.0, 0.18, "sine", [Vector2(0, 0), Vector2(0.04, 0.6), Vector2(1, 0)])
			return _wav(_mix(thump, ding))
		_:
			return _wav(_tone(440.0, 0.05, "sine", [Vector2(0, 1), Vector2(1, 0)]))


## A fixed-frequency tone burst.
static func _tone(freq: float, dur: float, wave: String, vol_env: Array) -> PackedByteArray:
	var n := maxi(1, int(dur * MIX_RATE))
	var data := PackedByteArray()
	data.resize(n * 2)
	for i in n:
		var t := float(i) / float(MIX_RATE)
		var frac := float(i) / float(n)
		var amp := _envelope_at(vol_env, frac)
		var wv := _wave_at(wave, TAU * freq * t)
		data.encode_s16(i * 2, _to_sample(amp * wv))
	return data


## A tone that linearly sweeps frequency from f0 to f1 over its duration.
## Phase is accumulated incrementally (not recomputed from t each sample) so
## the sweep has no discontinuities/clicks.
static func _sweep(f0: float, f1: float, dur: float, wave: String, vol_env: Array) -> PackedByteArray:
	var n := maxi(1, int(dur * MIX_RATE))
	var data := PackedByteArray()
	data.resize(n * 2)
	var phase := 0.0
	for i in n:
		var frac := float(i) / float(n)
		var freq := lerpf(f0, f1, frac)
		var amp := _envelope_at(vol_env, frac)
		phase += TAU * freq / float(MIX_RATE)
		var wv := _wave_at(wave, phase)
		data.encode_s16(i * 2, _to_sample(amp * wv))
	return data


static func _wave_at(wave: String, phase: float) -> float:
	match wave:
		"square":
			return 1.0 if sin(phase) >= 0.0 else -1.0
		_:
			return sin(phase)


static func _to_sample(v: float) -> int:
	return int(clampf(v * 0.8, -1.0, 1.0) * 32767.0)


static func _envelope_at(env: Array, frac: float) -> float:
	if env.is_empty():
		return 1.0
	var first: Vector2 = env[0]
	if frac <= first.x:
		return first.y
	for i in range(env.size() - 1):
		var a: Vector2 = env[i]
		var b: Vector2 = env[i + 1]
		if frac >= a.x and frac <= b.x:
			var span := b.x - a.x
			var t := 0.0 if span <= 0.0 else (frac - a.x) / span
			return lerpf(a.y, b.y, t)
	var last: Vector2 = env[env.size() - 1]
	return last.y


## Soft low-passed noise (a one-pole filter over white noise) for whooshes.
static func _noise(dur: float, vol_env: Array) -> PackedByteArray:
	var n := maxi(1, int(dur * MIX_RATE))
	var data := PackedByteArray()
	data.resize(n * 2)
	var rng := RandomNumberGenerator.new()
	rng.seed = 7
	var y := 0.0
	for i in n:
		var frac := float(i) / float(n)
		# Sweep the filter open then closed so it "passes by".
		var k := lerpf(0.05, 0.35, sin(frac * PI))
		y += (rng.randf_range(-1.0, 1.0) - y) * k
		data.encode_s16(i * 2, _to_sample(y * 1.6 * _envelope_at(vol_env, frac)))
	return data


static func _silence(dur: float) -> PackedByteArray:
	var n := maxi(1, int(dur * MIX_RATE))
	var data := PackedByteArray()
	data.resize(n * 2)  # zero-filled by default
	return data


static func _concat(parts: Array) -> PackedByteArray:
	var out := PackedByteArray()
	for p in parts:
		out.append_array(p)
	return out


## Sample-wise sum of two buffers (for layering, not sequencing), clamped to
## the 16-bit range so two loud tones can't wrap around into noise.
static func _mix(a: PackedByteArray, b: PackedByteArray) -> PackedByteArray:
	var samples := maxi(a.size(), b.size()) / 2
	var out := PackedByteArray()
	out.resize(samples * 2)
	var na := a.size() / 2
	var nb := b.size() / 2
	for i in samples:
		var sa := a.decode_s16(i * 2) if i < na else 0
		var sb := b.decode_s16(i * 2) if i < nb else 0
		out.encode_s16(i * 2, clampi(sa + sb, -32768, 32767))
	return out


static func _wav(data: PackedByteArray) -> AudioStreamWAV:
	var w := AudioStreamWAV.new()
	w.format = AudioStreamWAV.FORMAT_16_BITS
	w.mix_rate = MIX_RATE
	w.stereo = false
	w.data = data
	return w
