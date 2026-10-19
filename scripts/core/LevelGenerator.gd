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

## Bump when the tiers or the generator change: levels are seeded by index, so
## a new version means every index yields a different puzzle, and any saved
## in-progress run (GameState.run) from the old one must be dropped.
const VERSION := 4
## solution_count of a candidate whose search ran out of budget.
const UNKNOWN_SOLUTIONS := 99

## Per-tier base config: name, board size and a fixed difficulty. The game itself
## plays the STAGES ramp below, which reuses each tier's board and overrides the
## rest per level; these fixed values are what `generate(i, tier)` builds.
## "w"/"h" board size, "min_sz".."max_sz" piece size, "tray" pieces the player
## must place, "neutral" share of pieces with no feeling (the rest add
## love/hate constraints), "max_solutions" how few valid solutions a candidate
## may have (1 = unique; the search stops counting at 4), "budget" solver node
## budget, "attempts" candidates tried to meet max_solutions.
const TIERS := [
	{"name": "Warm-up", "w": 5, "h": 5, "min_sz": 2, "max_sz": 5,
		"tray": 5, "neutral": 0.35, "max_solutions": 3, "budget": 20_000, "attempts": 12},
	{"name": "Cozy",    "w": 6, "h": 6, "min_sz": 3, "max_sz": 5,
		"tray": 7, "neutral": 0.25, "max_solutions": 2, "budget": 8_000, "attempts": 10},
	{"name": "Tricky",  "w": 7, "h": 7, "min_sz": 3, "max_sz": 6,
		"tray": 9, "neutral": 0.18, "max_solutions": 1, "budget": 3_000, "attempts": 8},
	{"name": "Tangled", "w": 7, "h": 8, "min_sz": 3, "max_sz": 6,
		"tray": 11, "neutral": 0.12, "max_solutions": 1, "budget": 3_000, "attempts": 8},
	{"name": "Nightmare", "w": 7, "h": 9, "min_sz": 3, "max_sz": 6,
		"tray": 13, "neutral": 0.08, "max_solutions": 1, "budget": 3_000, "attempts": 8},
]


## The difficulty ramp. Each stage covers `len` levels from `from` on, on the
## board of its `tier`, and eases `tray` ("a".."b") and `neutral` from the first
## level of the stage to the last, so difficulty creeps up level by level instead
## of jumping when the tier changes. The first stage is a gentle intro (few
## pieces to place, mostly feeling-free, many valid answers); the last one holds
## its final values for every level after it. A stage's tier must keep the
## board size of TIERS[tier].
const STAGES := [
	{"from": 0,  "len": 3,  "tier": 0, "min_sz": 3, "max_sz": 5,
		"tray_a": 2,  "tray_b": 3,  "neutral_a": 0.70, "neutral_b": 0.55,
		"max_solutions": 4, "budget": 20_000, "attempts": 4},
	{"from": 3,  "len": 5,  "tier": 0, "min_sz": 2, "max_sz": 5,
		"tray_a": 3,  "tray_b": 5,  "neutral_a": 0.50, "neutral_b": 0.35,
		"max_solutions": 3, "budget": 20_000, "attempts": 12},
	{"from": 8,  "len": 6,  "tier": 1, "min_sz": 3, "max_sz": 5,
		"tray_a": 4,  "tray_b": 6,  "neutral_a": 0.35, "neutral_b": 0.28,
		"max_solutions": 3, "budget": 8_000, "attempts": 10},
	{"from": 14, "len": 10, "tier": 1, "min_sz": 3, "max_sz": 5,
		"tray_a": 6,  "tray_b": 8,  "neutral_a": 0.28, "neutral_b": 0.22,
		"max_solutions": 2, "budget": 8_000, "attempts": 10},
	{"from": 24, "len": 16, "tier": 2, "min_sz": 3, "max_sz": 6,
		"tray_a": 6,  "tray_b": 9,  "neutral_a": 0.25, "neutral_b": 0.18,
		"max_solutions": 2, "budget": 5_000, "attempts": 8},
	{"from": 40, "len": 20, "tier": 3, "min_sz": 3, "max_sz": 6,
		"tray_a": 8,  "tray_b": 11, "neutral_a": 0.18, "neutral_b": 0.12,
		"max_solutions": 1, "budget": 3_000, "attempts": 8},
	{"from": 60, "len": 30, "tier": 4, "min_sz": 3, "max_sz": 6,
		"tray_a": 10, "tray_b": 13, "neutral_a": 0.12, "neutral_b": 0.08,
		"max_solutions": 1, "budget": 3_000, "attempts": 8},
]


static func stage_for_level(level_index: int) -> Dictionary:
	var stage: Dictionary = STAGES[0]
	for s in STAGES:
		if level_index >= int(s["from"]):
			stage = s
	return stage


static func tier_for_level(level_index: int) -> int:
	return int(stage_for_level(level_index)["tier"])


## What to build for `level_index`: a TIERS-shaped config (w, h, min_sz, max_sz,
## tray, neutral, max_solutions, budget, attempts). With `override_tier` it is
## that tier's fixed config (tests and tools); otherwise the level's place on the
## STAGES ramp.
static func config_for_level(level_index: int, override_tier: int = -1) -> Dictionary:
	if override_tier >= 0:
		return TIERS[override_tier]
	var stage := stage_for_level(level_index)
	var tier: int = stage["tier"]
	var t := clampf(float(level_index - int(stage["from"])) / float(maxi(int(stage["len"]) - 1, 1)), 0.0, 1.0)
	var cfg: Dictionary = TIERS[tier].duplicate()
	cfg["min_sz"] = stage["min_sz"]
	cfg["max_sz"] = stage["max_sz"]
	cfg["tray"] = roundi(lerpf(float(stage["tray_a"]), float(stage["tray_b"]), t))
	cfg["neutral"] = lerpf(float(stage["neutral_a"]), float(stage["neutral_b"]), t)
	cfg["max_solutions"] = stage["max_solutions"]
	cfg["budget"] = stage["budget"]
	cfg["attempts"] = stage["attempts"]
	return cfg


static func seed_for_level(level_index: int) -> int:
	return hash("dolly-blocks/v%d/%d" % [VERSION, level_index])


func generate(level_index: int, override_tier: int = -1) -> LevelData:
	var tier: int = override_tier if override_tier >= 0 else tier_for_level(level_index)
	var cfg: Dictionary = config_for_level(level_index, override_tier)
	var rng := RandomNumberGenerator.new()
	rng.seed = seed_for_level(level_index)
	# Keep the candidate with the fewest solutions; stop at the first one that
	# is hard enough. Every candidate is solvable by construction, so a result
	# always exists even when none meets max_solutions.
	var best: LevelData = null
	for _attempt in int(cfg.attempts):
		var lv := _attempt(rng, cfg)
		if lv == null:
			continue
		if best == null or lv.solution_count < best.solution_count:
			best = lv
		# A search too deep to finish is hard enough; don't pay for more tries.
		if lv.solution_count <= int(cfg.max_solutions) or lv.solution_count == UNKNOWN_SOLUTIONS:
			break
	if best == null:
		push_error("LevelGenerator: no candidate survived for level %d" % level_index)
		return null
	best.level_index = level_index
	best.tier = tier
	best.rng_seed = int(seed_for_level(level_index))
	return best


func _attempt(rng: RandomNumberGenerator, cfg: Dictionary) -> LevelData:
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
	var count := solver.count_solutions(state, lv.tray_copy(), 4, int(cfg.budget))
	if solver.aborted:
		# Too big to count: the tray came from a real tiling, so it is solvable,
		# and a search this deep is hard. Rank it below any proven candidate.
		count = UNKNOWN_SOLUTIONS
	elif count < 1:
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
