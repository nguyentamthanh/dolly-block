class_name LevelGenerator
extends RefCounted

## Builds packing puzzles backwards from a known tiling.
##
##  1. Grow random polyominoes until the grid is full. That tiling IS the
##     answer.
##  2. Colour adjacent pieces differently so the blobs stay readable.
##  3. Give some pieces a feeling already true of that arrangement.
##  4. Lift some pieces into the tray. Putting them back is, by construction,
##     a valid solution.

const TIERS := [
	{"name": "Warm-up", "w": 4, "h": 4, "min_sz": 1, "max_sz": 4,
		"tray": 3, "neutral": 0.55, "mood_fixed": 0.15, "max_solutions": 8},
	{"name": "Cozy",    "w": 5, "h": 5, "min_sz": 1, "max_sz": 5,
		"tray": 4, "neutral": 0.40, "mood_fixed": 0.25, "max_solutions": 12},
	{"name": "Tricky",  "w": 5, "h": 6, "min_sz": 2, "max_sz": 5,
		"tray": 5, "neutral": 0.30, "mood_fixed": 0.35, "max_solutions": 16},
	{"name": "Tangled", "w": 6, "h": 6, "min_sz": 2, "max_sz": 5,
		"tray": 6, "neutral": 0.22, "mood_fixed": 0.45, "max_solutions": 20},
]


static func tier_for_level(level_index: int) -> int:
	if level_index < 8:
		return 0
	if level_index < 24:
		return 1
	if level_index < 48:
		return 2
	return 3


static func seed_for_level(level_index: int) -> int:
	return hash("dolly-blocks/v2/%d" % level_index)


func generate(level_index: int, override_tier: int = -1) -> LevelData:
	var tier: int = override_tier if override_tier >= 0 else tier_for_level(level_index)
	var rng := RandomNumberGenerator.new()
	rng.seed = seed_for_level(level_index)
	for _attempt in 8:
		var lv := _attempt(rng, tier)
		if lv != null:
			lv.level_index = level_index
			lv.tier = tier
			lv.rng_seed = int(seed_for_level(level_index))
			return lv
	push_error("LevelGenerator: no candidate survived for level %d" % level_index)
	return null


func _attempt(rng: RandomNumberGenerator, tier: int) -> LevelData:
	var cfg: Dictionary = TIERS[tier]
	var w: int = cfg.w
	var h: int = cfg.h
	var groups := _grow_tiling(w, h, rng, cfg.min_sz, cfg.max_sz)
	if groups.is_empty():
		return null

	var colors := _colour(groups, w, h, rng)
	var moods := _assign_moods(groups, colors, w, h, rng, cfg.neutral)

	var pieces: Array[PieceData] = []
	for i in groups.size():
		var world: Array[Vector2i] = []
		for c in groups[i]:
			world.append(c)
		var p := PieceData.from_world(i, colors[i], world, moods[i].mood, moods[i].target)
		pieces.append(p)

	var tray_n: int = mini(int(cfg.tray), pieces.size() - 1)
	if tray_n < 1:
		tray_n = 1
	# Shuffle, then stably prefer pieces that have a feeling so the tray is
	# where the puzzle actually lives.
	var order: Array[int] = []
	for i in pieces.size():
		order.append(i)
	for i in range(order.size() - 1, 0, -1):
		var j := rng.randi_range(0, i)
		var tmp := order[i]
		order[i] = order[j]
		order[j] = tmp
	order.sort_custom(func(a: int, b: int) -> bool:
		var ma := int(pieces[a].mood != PieceData.Mood.NEUTRAL)
		var mb := int(pieces[b].mood != PieceData.Mood.NEUTRAL)
		return ma > mb)

	var tray: Array[PieceData] = []
	var fixed: Array[PieceData] = []
	for i in order.size():
		if i < tray_n:
			tray.append(pieces[order[i]])
		else:
			fixed.append(pieces[order[i]])

	var lv := LevelData.new()
	lv.width = w
	lv.height = h
	lv.fixed_pieces = fixed
	lv.tray_pieces = tray
	lv.turn_budget = 15 + tray.size() * 7

	var solver := Solver.new()
	var state := lv.build_state()
	var count := solver.count_solutions(state, lv.tray_copy(), 4)
	if solver.aborted:
		return null
	if count < 1:
		return null
	lv.solution_count = count
	lv.search_cost = solver.nodes
	return lv


func _grow_tiling(w: int, h: int, rng: RandomNumberGenerator,
		min_sz: int, max_sz: int) -> Array:
	var empty := {}
	for y in h:
		for x in w:
			empty[Vector2i(x, y)] = true
	var groups: Array = []
	while not empty.is_empty():
		var keys: Array = empty.keys()
		var start: Vector2i = keys[rng.randi_range(0, keys.size() - 1)]
		var remaining := empty.size()
		var target := rng.randi_range(min_sz, max_sz)
		if remaining <= max_sz:
			target = remaining
		var cells: Array[Vector2i] = [start]
		empty.erase(start)
		while cells.size() < target:
			var frontier: Array[Vector2i] = []
			var seen := {}
			for c in cells:
				for off in BoardState.NEIGHBOUR_OFFSETS:
					var n: Vector2i = c + off
					if empty.has(n) and not seen.has(n):
						seen[n] = true
						frontier.append(n)
			if frontier.is_empty():
				break
			var pick: Vector2i = frontier[rng.randi_range(0, frontier.size() - 1)]
			cells.append(pick)
			empty.erase(pick)
		groups.append(cells)
	return groups


func _colour(groups: Array, w: int, h: int, rng: RandomNumberGenerator) -> PackedInt32Array:
	var owner := {}
	for i in groups.size():
		for c in groups[i]:
			owner[c] = i
	var adj: Array = []
	for i in groups.size():
		adj.append({})
	for i in groups.size():
		for c in groups[i]:
			for off in BoardState.NEIGHBOUR_OFFSETS:
				var n: Vector2i = c + off
				if owner.has(n) and owner[n] != i:
					adj[i][owner[n]] = true

	var colors := PackedInt32Array()
	colors.resize(groups.size())
	for i in groups.size():
		var used := {}
		for nb in adj[i]:
			if nb < i:
				used[colors[nb]] = true
		var choices: Array[int] = []
		for hue in Palette.COUNT:
			if not used.has(hue):
				choices.append(hue)
		if choices.is_empty():
			choices = Palette.all()
		colors[i] = choices[rng.randi_range(0, choices.size() - 1)]
	return colors


func _assign_moods(groups: Array, colors: PackedInt32Array, w: int, h: int,
		rng: RandomNumberGenerator, neutral: float) -> Array:
	var owner := {}
	for i in groups.size():
		for c in groups[i]:
			owner[c] = i
	var neighbour_colors: Array = []
	for i in groups.size():
		var cols := {}
		for c in groups[i]:
			for off in BoardState.NEIGHBOUR_OFFSETS:
				var n: Vector2i = c + off
				if owner.has(n) and owner[n] != i:
					cols[colors[owner[n]]] = true
		neighbour_colors.append(cols)

	var used := {}
	for i in colors.size():
		used[colors[i]] = true

	var out: Array = []
	for i in groups.size():
		var rec := {"mood": PieceData.Mood.NEUTRAL, "target": 0}
		if rng.randf() < neutral:
			out.append(rec)
			continue
		var friends: Array[int] = []
		for col in neighbour_colors[i]:
			if col != colors[i]:
				friends.append(col)
		var foes: Array[int] = []
		for col in used:
			if col != colors[i] and not neighbour_colors[i].has(col):
				foes.append(col)
		var roll := rng.randf()
		if roll < 0.65 and not friends.is_empty():
			rec.mood = PieceData.Mood.AFFECTIONATE
			rec.target = friends[rng.randi_range(0, friends.size() - 1)]
		elif not foes.is_empty():
			rec.mood = PieceData.Mood.HOSTILE
			rec.target = foes[rng.randi_range(0, foes.size() - 1)]
		out.append(rec)
	return out
