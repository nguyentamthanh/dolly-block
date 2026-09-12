class_name PieceData
extends Resource

## One polyomino: a connected shape, a color, and an optional feeling about
## another color. Feelings apply to the whole piece: an affectionate piece
## needs the target color orthogonally beside ANY of its cells; a hostile
## piece must not touch that color at all.

enum Mood {
	NEUTRAL,
	AFFECTIONATE,
	HOSTILE,
}

@export var id: int = 0
@export var color: int = 0
@export var mood: Mood = Mood.NEUTRAL
@export var target_color: int = 0
## Canonical (rotation 0) cells, already normalised so min x/y is 0.
@export var base_cells: Array[Vector2i] = []
@export var eye_base: Vector2i = Vector2i.ZERO
@export var rot: int = 0
## World cells of the generator's answer, used by hints.
@export var solution_world: Array[Vector2i] = []


static func make(pid: int, c: int, cells: Array[Vector2i],
		m: Mood = Mood.NEUTRAL, t: int = 0) -> PieceData:
	var p := PieceData.new()
	p.id = pid
	p.color = c
	p.mood = m
	p.target_color = t
	var oriented := _orient(cells, 0)
	p.base_cells = oriented
	p.eye_base = _pick_eye(oriented)
	p.rot = 0
	return p


static func from_world(pid: int, c: int, world: Array[Vector2i],
		m: Mood = Mood.NEUTRAL, t: int = 0) -> PieceData:
	var origin := bbox_min(world)
	var local: Array[Vector2i] = []
	for cell in world:
		local.append(cell - origin)
	var p := make(pid, c, local, m, t)
	p.solution_world = world.duplicate()
	return p


func duplicate_piece() -> PieceData:
	var p := PieceData.new()
	p.id = id
	p.color = color
	p.mood = mood
	p.target_color = target_color
	p.base_cells = base_cells.duplicate()
	p.eye_base = eye_base
	p.rot = rot
	p.solution_world = solution_world.duplicate()
	return p


func local_cells() -> Array[Vector2i]:
	return _orient(base_cells, rot)


func local_eye() -> Vector2i:
	return _orient_point(base_cells, eye_base, rot)


func world_cells(origin: Vector2i) -> Array[Vector2i]:
	var out: Array[Vector2i] = []
	for c in local_cells():
		out.append(origin + c)
	return out


func bbox() -> Vector2i:
	var cells := local_cells()
	var mx := 0
	var my := 0
	for c in cells:
		if c.x > mx:
			mx = c.x
		if c.y > my:
			my = c.y
	return Vector2i(mx + 1, my + 1)


func rotate_cw() -> void:
	rot = (rot + 1) & 3


func unique_rots() -> Array[int]:
	var seen := {}
	var out: Array[int] = []
	for r in 4:
		var key := _key(_orient(base_cells, r))
		if not seen.has(key):
			seen[key] = true
			out.append(r)
	return out


## Rotate this piece so its local cells match the solution, and return the
## world origin (bbox min) the solution occupies.
func orient_to_solution() -> Vector2i:
	var origin := bbox_min(solution_world)
	var want: Array[Vector2i] = []
	for c in solution_world:
		want.append(c - origin)
	var want_key := _key(_orient(want, 0))
	for r in 4:
		if _key(_orient(base_cells, r)) == want_key:
			rot = r
			return origin
	rot = 0
	return origin


static func bbox_min(cells: Array[Vector2i]) -> Vector2i:
	var mx := 999
	var my := 999
	for c in cells:
		if c.x < mx:
			mx = c.x
		if c.y < my:
			my = c.y
	return Vector2i(mx, my)


static func _rotate90(c: Vector2i) -> Vector2i:
	return Vector2i(-c.y, c.x)


static func _orient(cells: Array[Vector2i], r: int) -> Array[Vector2i]:
	var out: Array[Vector2i] = []
	for c in cells:
		var v := c
		for _i in r:
			v = _rotate90(v)
		out.append(v)
	var origin := bbox_min(out)
	for i in out.size():
		out[i] = out[i] - origin
	out.sort_custom(func(a: Vector2i, b: Vector2i) -> bool:
		return a.y < b.y or (a.y == b.y and a.x < b.x))
	return out


static func _orient_point(cells: Array[Vector2i], point: Vector2i, r: int) -> Vector2i:
	var rotated: Array[Vector2i] = []
	for c in cells:
		var v := c
		for _i in r:
			v = _rotate90(v)
		rotated.append(v)
	var p := point
	for _i in r:
		p = _rotate90(p)
	return p - bbox_min(rotated)


static func _pick_eye(cells: Array[Vector2i]) -> Vector2i:
	# Prefer an extremity (fewest orthogonal siblings) so the face sits on a
	# "head" rather than in the middle of a long bar.
	var set := {}
	for c in cells:
		set[c] = true
	var best := cells[0]
	var best_n := 99
	for c in cells:
		var n := 0
		for off in [Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, 1), Vector2i(0, -1)]:
			if set.has(c + off):
				n += 1
		if n < best_n:
			best_n = n
			best = c
	return best


static func _key(cells: Array[Vector2i]) -> String:
	var parts: PackedStringArray = []
	for c in cells:
		parts.append("%d,%d" % [c.x, c.y])
	return ",".join(parts)


func describe() -> String:
	var shape := "%d-omino" % base_cells.size()
	match mood:
		Mood.AFFECTIONATE:
			return "%s %s loves %s" % [Palette.name_of(color), shape,
				Palette.name_of(target_color)]
		Mood.HOSTILE:
			return "%s %s avoids %s" % [Palette.name_of(color), shape,
				Palette.name_of(target_color)]
		_:
			return "%s %s" % [Palette.name_of(color), shape]


func _to_string() -> String:
	return "<%s>" % describe()
