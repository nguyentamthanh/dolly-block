class_name LevelData
extends Resource

## One packing puzzle: board size, pieces already on the board, pieces in the
## tray, and the turn budget used for star rating.

@export var width: int = 0
@export var height: int = 0
@export var blocked_cells: Array[Vector2i] = []
@export var fixed_pieces: Array[PieceData] = []
@export var tray_pieces: Array[PieceData] = []
@export var turn_budget: int = 36

@export var level_index: int = 0
@export var tier: int = 0
@export var rng_seed: int = 0
@export var solution_count: int = 0
@export var search_cost: int = 0

# Single-cell aliases for compatibility with BlockData tests
var fixed_blocks: Dictionary = {}
var tray_blocks: Array[BlockData] = []


func build_state() -> BoardState:
	var s := BoardState.new(width, height, blocked_cells)
	# Prefer polyomino path if populated
	if fixed_pieces != null and not fixed_pieces.is_empty():
		for p in fixed_pieces:
			s.place_piece(p, p.orient_to_solution())
		return s
	# Fallback single-cell Dictionary path
	for pos in fixed_blocks.keys():
		var b: BlockData = fixed_blocks[pos]
		if b != null:
			var ppos: Vector2i = pos
			var pid2: int = int(ppos.x + ppos.y * width + 5000)
			var pd := PieceData.make(pid2, b.color, [Vector2i.ZERO], b.mood as PieceData.Mood, b.target_color)
			pd.solution_world = [ppos]
			s.place_piece(pd, ppos)
	return s


func tray_copy() -> Array:
	if tray_pieces != null and not tray_pieces.is_empty():
		var out: Array[PieceData] = []
		for p in tray_pieces:
			out.append(p.duplicate_piece())
		return out
	if tray_blocks != null and not tray_blocks.is_empty():
		var out2: Array[BlockData] = []
		for b in tray_blocks:
			out2.append(b.duplicate_block())
		return out2
	return [] as Array[PieceData]


func all_pieces() -> Array:
	var out: Array = []
	if fixed_pieces != null:
		out.append_array(fixed_pieces)
	if tray_pieces != null:
		out.append_array(tray_pieces)
	if out.is_empty():
		for pos in fixed_blocks.keys():
			var b: BlockData = fixed_blocks[pos]
			out.append(BlockData.make(b.color, b.mood as BlockData.Mood, b.target_color))
		for b in tray_blocks:
			out.append(b.duplicate_block())
	return out

func to_dict() -> Dictionary:
	var blocked: Array = []
	for c in blocked_cells:
		blocked.append([c.x, c.y])
	var fixed_arr: Array = []
	if fixed_pieces != null and not fixed_pieces.is_empty():
		for p in fixed_pieces:
			var cells: Array = []
			for c in p.solution_world:
				cells.append([c.x, c.y])
			fixed_arr.append({"id": p.id, "color": p.color, "mood": int(p.mood), "target": p.target_color, "cells": cells})
	else:
		var keys: Array = fixed_blocks.keys().duplicate()
		keys.sort_custom(func(a: Vector2i, b: Vector2i) -> bool: return a.y < b.y or (a.y == b.y and a.x < b.x))
		for k in keys:
			var b: BlockData = fixed_blocks[k]
			fixed_arr.append({"id": int(k.x + k.y*1000), "color": b.color, "mood": int(b.mood), "target": b.target_color, "cells": [[k.x, k.y]]})
	var tray_arr: Array = []
	if tray_pieces != null and not tray_pieces.is_empty():
		for p in tray_pieces:
			var cells2: Array = []
			for c in p.solution_world:
				cells2.append([c.x, c.y])
			tray_arr.append({"id": p.id, "color": p.color, "mood": int(p.mood), "target": p.target_color, "cells": cells2})
	else:
		for b in tray_blocks:
			tray_arr.append({"id": 0, "color": b.color, "mood": int(b.mood), "target": b.target_color, "cells": [[0,0]]})
	return {"width": width, "height": height, "blocked_cells": blocked, "fixed_pieces": fixed_arr, "tray_pieces": tray_arr, "level_index": level_index, "tier": tier, "rng_seed": rng_seed, "solution_count": solution_count, "search_cost": search_cost, "turn_budget": turn_budget}

static func from_dict(d: Dictionary) -> LevelData:
	var lv := LevelData.new()
	lv.width = int(d.get("width", 0))
	lv.height = int(d.get("height", 0))
	var br: Variant = d.get("blocked_cells", [])
	lv.blocked_cells = []
	if br is Array:
		for e in br as Array:
			if e is Array and (e as Array).size() >=2:
				lv.blocked_cells.append(Vector2i(int(e[0]), int(e[1])))
	var fr: Variant = d.get("fixed_pieces", d.get("fixed_blocks", []))
	lv.fixed_pieces = []
	if fr is Array:
		for e in fr as Array:
			if e is Dictionary:
				var col: int = int(e.get("color",0))
				var mood: int = int(e.get("mood",0))
				var tgt: int = int(e.get("target",0))
				var id: int = int(e.get("id",0))
				var cells_raw: Variant = e.get("cells", [])
				var world: Array[Vector2i] = []
				if cells_raw is Array:
					for ce in cells_raw as Array:
						if ce is Array and (ce as Array).size()>=2:
							world.append(Vector2i(int(ce[0]), int(ce[1])))
				var p: PieceData
				if not world.is_empty():
					p = PieceData.from_world(id, col, world, mood as PieceData.Mood, tgt)
				else:
					p = PieceData.make(id, col, [Vector2i.ZERO], mood as PieceData.Mood, tgt)
				lv.fixed_pieces.append(p)
	var tr: Variant = d.get("tray_pieces", d.get("tray_blocks", []))
	lv.tray_pieces = []
	if tr is Array:
		for e in tr as Array:
			if e is Dictionary:
				var col2: int = int(e.get("color",0))
				var mood2: int = int(e.get("mood",0))
				var tgt2: int = int(e.get("target",0))
				var id2: int = int(e.get("id",0))
				var cells_raw2: Variant = e.get("cells", [])
				var world2: Array[Vector2i] = []
				if cells_raw2 is Array:
					for ce in cells_raw2 as Array:
						if ce is Array and (ce as Array).size()>=2:
							world2.append(Vector2i(int(ce[0]), int(ce[1])))
				var p2: PieceData
				if not world2.is_empty():
					p2 = PieceData.from_world(id2, col2, world2, mood2 as PieceData.Mood, tgt2)
				else:
					p2 = PieceData.make(id2, col2, [Vector2i.ZERO], mood2 as PieceData.Mood, tgt2)
				lv.tray_pieces.append(p2)
			elif e is BlockData:
				var b: BlockData = e
				var pp := PieceData.make(9999, b.color, [Vector2i.ZERO], b.mood as PieceData.Mood, b.target_color)
				lv.tray_pieces.append(pp)
	lv.level_index = int(d.get("level_index",0))
	lv.tier = int(d.get("tier",0))
	lv.rng_seed = int(d.get("rng_seed",0))
	lv.solution_count = int(d.get("solution_count",0))
	lv.search_cost = int(d.get("search_cost",0))
	lv.turn_budget = int(d.get("turn_budget",36))
	return lv
