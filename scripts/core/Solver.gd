class_name Solver
extends RefCounted

## Backtracking packer: which tray polyomino goes where, in which rotation.
##
## MRV on pieces (fewest legal placements first) plus pruning on hostile
## violations keeps 5x5–6x6 searches inside generation budgets.

const DEFAULT_NODE_BUDGET := 80_000

var nodes: int = 0
var aborted: bool = false

var _budget: int = DEFAULT_NODE_BUDGET
var _cap: int = 2


func count_solutions(state: BoardState, tray: Array, cap: int = 2, budget: int = DEFAULT_NODE_BUDGET) -> int:
	nodes = 0
	aborted = false
	_budget = budget
	_cap = cap
	# Compatible with both PieceData and BlockData trays
	var remaining: Array = []
	for p in tray:
		if p == null:
			continue
		if p is PieceData:
			remaining.append((p as PieceData).duplicate_piece())
		elif p is BlockData:
			remaining.append((p as BlockData).duplicate_block())
		elif p.has_method("duplicate_piece"):
			remaining.append(p.call("duplicate_piece"))
		elif p.has_method("duplicate_block"):
			remaining.append(p.call("duplicate_block"))
		else:
			remaining.append(p)
	return _search(state, remaining)


func is_solvable(state: BoardState, tray: Array, budget: int = DEFAULT_NODE_BUDGET) -> bool:
	return count_solutions(state, tray, 1, budget) >= 1

func has_solution(state: BoardState, tray: Array, budget: int = DEFAULT_NODE_BUDGET) -> bool:
	return is_solvable(state, tray, budget)


func solve(state: BoardState, tray: Array, budget: int = DEFAULT_NODE_BUDGET) -> BoardState:
	nodes = 0
	aborted = false
	_budget = budget
	_cap = 1
	var remaining: Array = []
	for p in tray:
		if p == null:
			continue
		if p is PieceData:
			remaining.append((p as PieceData).duplicate_piece())
		elif p is BlockData:
			remaining.append((p as BlockData).duplicate_block())
		elif p.has_method("duplicate_piece"):
			remaining.append(p.call("duplicate_piece"))
		elif p.has_method("duplicate_block"):
			remaining.append(p.call("duplicate_block"))
		else:
			remaining.append(p)
	var cloned := state.clone()
	var found := _solve_search(cloned, remaining)
	return found


func _search(state: BoardState, remaining: Array) -> int:
	if aborted:
		return 0
	nodes += 1
	if nodes > _budget:
		aborted = true
		return 0

	if remaining.is_empty():
		return 1 if state.is_solved() else 0

	# Polyomino path: remaining are PieceData
	var is_poly := false
	if not remaining.is_empty() and remaining[0] is PieceData:
		is_poly = true
	if is_poly:
		var best_i := 0
		var best_opts: Array = []
		var best_n := 1000000
		for i in remaining.size():
			var opts := _placements(state, remaining[i] as PieceData)
			if opts.size() < best_n:
				best_n = opts.size()
				best_i = i
				best_opts = opts
				if best_n == 0:
					return 0

		var piece: PieceData = remaining[best_i]
		var rest: Array = []
		for i in remaining.size():
			if i != best_i:
				rest.append(remaining[i])

		var found := 0
		var saved_rot := piece.rot
		for opt in best_opts:
			piece.rot = opt.rot
			state.place_piece(piece, opt.origin)
			found += _search(state, rest)
			state.remove_piece(piece.id)
			if found >= _cap:
				piece.rot = saved_rot
				return found
		piece.rot = saved_rot
		return found
	else:
		# Single-cell BlockData path
		if remaining.size() != state.empty_count():
			return 0
		if state.any_violated():
			return 0
		var distinct := {}
		for b in remaining:
			var k: int = (b as BlockData).key() if b is BlockData else 0
			if not distinct.has(k):
				distinct[k] = b
		var empty := state.empty_cells()
		var best_cell: Vector2i
		var best_cands: Array = []
		var best_n2 := 1000000
		var found_best := false
		for cell in empty:
			var cands: Array = []
			for k in distinct.keys():
				var blk: BlockData = distinct[k] as BlockData
				if state.would_violate(cell, blk):
					continue
				cands.append(blk)
			if cands.is_empty():
				return 0
			if cands.size() < best_n2:
				best_n2 = cands.size()
				best_cell = cell
				best_cands = cands
				found_best = true
				if best_n2 == 1:
					break
		if not found_best:
			return 0
		var found2 := 0
		for cand in best_cands:
			var cand_key: int = (cand as BlockData).key() if cand is BlockData else 0
			var rem_idx := -1
			for i in remaining.size():
				var k2: int = (remaining[i] as BlockData).key() if remaining[i] is BlockData else 0
				if k2 == cand_key:
					rem_idx = i
					break
			if rem_idx == -1:
				continue
			var rest2: Array = []
			for i in remaining.size():
				if i != rem_idx:
					rest2.append(remaining[i])
			state.place(best_cell, cand as BlockData)
			var add := 0
			if not state.any_violated():
				add = _search(state, rest2)
			state.remove(best_cell)
			found2 += add
			if found2 >= _cap:
				return found2
			if aborted:
				return found2
		return found2


func _solve_search(state: BoardState, remaining: Array) -> BoardState:
	if aborted:
		return null
	nodes += 1
	if nodes > _budget:
		aborted = true
		return null
	if remaining.is_empty():
		return state.clone() if state.is_solved() else null
	if state.any_violated():
		return null
	var is_poly := false
	if not remaining.is_empty() and remaining[0] is PieceData:
		is_poly = true
	if is_poly:
		var best_i := 0
		var best_opts: Array = []
		var best_n := 1000000
		for i in remaining.size():
			var opts := _placements(state, remaining[i] as PieceData)
			if opts.size() < best_n:
				best_n = opts.size()
				best_i = i
				best_opts = opts
				if best_n == 0:
					return null
		var piece: PieceData = remaining[best_i]
		var rest: Array = []
		for i in remaining.size():
			if i != best_i:
				rest.append(remaining[i])
		var saved_rot := piece.rot
		for opt in best_opts:
			piece.rot = opt.rot
			state.place_piece(piece, opt.origin)
			var res := _solve_search(state, rest)
			state.remove_piece(piece.id)
			if res != null:
				piece.rot = saved_rot
				return res
			if aborted:
				piece.rot = saved_rot
				return null
		piece.rot = saved_rot
		return null
	else:
		if remaining.size() != state.empty_count():
			return null
		var distinct := {}
		for b in remaining:
			var k: int = (b as BlockData).key() if b is BlockData else 0
			if not distinct.has(k):
				distinct[k] = b
		var empty := state.empty_cells()
		var best_cell: Vector2i
		var best_cands: Array = []
		var best_n2 := 1000000
		var found_best := false
		for cell in empty:
			var cands: Array = []
			for k in distinct.keys():
				var blk: BlockData = distinct[k] as BlockData
				if state.would_violate(cell, blk):
					continue
				cands.append(blk)
			if cands.is_empty():
				return null
			if cands.size() < best_n2:
				best_n2 = cands.size()
				best_cell = cell
				best_cands = cands
				found_best = true
				if best_n2 == 1:
					break
		if not found_best:
			return null
		for cand in best_cands:
			var cand_key: int = (cand as BlockData).key() if cand is BlockData else 0
			var rem_idx := -1
			for i in remaining.size():
				var k2: int = (remaining[i] as BlockData).key() if remaining[i] is BlockData else 0
				if k2 == cand_key:
					rem_idx = i
					break
			if rem_idx == -1:
				continue
			var rest2: Array = []
			for i in remaining.size():
				if i != rem_idx:
					rest2.append(remaining[i])
			state.place(best_cell, cand as BlockData)
			var res2: BoardState = null
			if not state.any_violated():
				res2 = _solve_search(state, rest2)
			state.remove(best_cell)
			if res2 != null:
				return res2
			if aborted:
				return null
		return null


func _placements(state: BoardState, piece: PieceData) -> Array:
	var out: Array = []
	for r in piece.unique_rots():
		piece.rot = r
		var local := piece.local_cells()
		for y in state.height:
			for x in state.width:
				var origin := Vector2i(x, y)
				var world: Array[Vector2i] = []
				var ok := true
				for c in local:
					var w: Vector2i = origin + c
					if not state.is_empty_at(w):
						ok = false
						break
					world.append(w)
				if not ok:
					continue
				if state.would_violate(piece, origin):
					continue
				out.append({"rot": r, "origin": origin})
	return out
