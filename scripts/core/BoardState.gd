class_name BoardState
extends RefCounted

## Grid occupancy plus the placed polyominoes. Pure logic, no Node.

const NEIGHBOUR_OFFSETS := [
	Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, 1), Vector2i(0, -1),
]
const EMPTY := -1

var width: int
var height: int

var _blocked: PackedByteArray
var _occ: PackedInt32Array      # piece id, or EMPTY
var _color: PackedInt32Array
var _nbr: Array                 # flat index -> PackedInt32Array
var _playable: PackedInt32Array
## id -> {piece: PieceData, origin: Vector2i, cells: Array[Vector2i]}
var _placed: Dictionary = {}


func _init(w: int = 0, h: int = 0, blocked_cells: Array = []) -> void:
	width = w
	height = h
	var n := w * h
	_blocked = PackedByteArray()
	_blocked.resize(n)
	_occ = PackedInt32Array()
	_occ.resize(n)
	_occ.fill(EMPTY)
	_color = PackedInt32Array()
	_color.resize(n)
	_color.fill(EMPTY)
	for cell in blocked_cells:
		if is_inside(cell):
			_blocked[cell.y * w + cell.x] = 1
	_build_tables()


func _build_tables() -> void:
	_nbr = []
	_nbr.resize(width * height)
	var playable: Array[int] = []
	for y in height:
		for x in width:
			var i := y * width + x
			var list: Array[int] = []
			if _blocked[i] == 0:
				playable.append(i)
				for off in NEIGHBOUR_OFFSETS:
					var o: Vector2i = off
					var nx := x + o.x
					var ny := y + o.y
					if nx >= 0 and ny >= 0 and nx < width and ny < height:
						var j := ny * width + nx
						if _blocked[j] == 0:
							list.append(j)
			_nbr[i] = PackedInt32Array(list)
	_playable = PackedInt32Array(playable)


func _idx(pos: Vector2i) -> int:
	return pos.y * width + pos.x


func _pos(i: int) -> Vector2i:
	return Vector2i(i % width, i / width)


func is_inside(pos: Vector2i) -> bool:
	return pos.x >= 0 and pos.y >= 0 and pos.x < width and pos.y < height


func is_playable(pos: Vector2i) -> bool:
	return is_inside(pos) and _blocked[_idx(pos)] == 0


func is_empty_at(pos: Vector2i) -> bool:
	return is_playable(pos) and _occ[_idx(pos)] == EMPTY


func color_at(pos: Vector2i) -> int:
	if not is_inside(pos):
		return EMPTY
	return _color[_idx(pos)]


func piece_id_at(pos: Vector2i) -> int:
	if not is_inside(pos):
		return EMPTY
	return _occ[_idx(pos)]


func get_placed(id: int) -> Dictionary:
	return _placed.get(id, {})


func placed_ids() -> Array:
	return _placed.keys()


func playable_cells() -> Array[Vector2i]:
	var out: Array[Vector2i] = []
	for i in _playable:
		out.append(_pos(i))
	return out


func empty_cells() -> Array[Vector2i]:
	var out: Array[Vector2i] = []
	for i in _playable:
		if _occ[i] == EMPTY:
			out.append(_pos(i))
	return out


func empty_count() -> int:
	var n := 0
	for i in _playable:
		if _occ[i] == EMPTY:
			n += 1
	return n


func can_place_cells(cells: Array) -> bool:
	for c in cells:
		var cc: Vector2i = c
		if not is_empty_at(cc):
			return false
	return true


func place_piece(piece: PieceData, origin: Vector2i) -> bool:
	var cells := piece.world_cells(origin)
	if not can_place_cells(cells):
		return false
	for c in cells:
		var i := _idx(c)
		_occ[i] = piece.id
		_color[i] = piece.color
	_placed[piece.id] = {
		"piece": piece,
		"origin": origin,
		"cells": cells,
	}
	return true


func remove_piece(id: int) -> PieceData:
	if not _placed.has(id):
		return null
	var rec: Dictionary = _placed[id]
	var cells: Array = rec.cells
	for c in cells:
		var cc: Vector2i = c
		var i := _idx(cc)
		_occ[i] = EMPTY
		_color[i] = EMPTY
	_placed.erase(id)
	return rec.piece

# --- Compatibility shims for single-cell callers (BlockData tests) ---
func place(pos: Vector2i, block) -> bool:
	if block is PieceData:
		return place_piece(block, pos)
	if block is BlockData:
		var bd: BlockData = block
		var pid := pos.y * width + pos.x + 10000 + (randi() % 1000)
		var pd := PieceData.make(pid, bd.color, [Vector2i.ZERO], bd.mood as PieceData.Mood, bd.target_color)
		pd.solution_world = [pos]
		if not is_empty_at(pos):
			return false
		_occ[_idx(pos)] = pd.id
		_color[_idx(pos)] = pd.color
		_placed[pd.id] = {"piece": pd, "origin": pos, "cells": [pos]}
		return true
	return false

func remove(pos: Vector2i) -> BlockData:
	# Try Vector2i key (single-cell shim) first
	if _placed.has(pos):
		var rec = _placed[pos]
		_placed.erase(pos)
		if rec is BlockData:
			return rec as BlockData
		if rec is Dictionary and rec.has("piece"):
			var p0: PieceData = rec.piece
			return BlockData.make(p0.color, p0.mood as BlockData.Mood, p0.target_color)
		return null
	# Polyomino id removal
	var id: int = _occ[_idx(pos)] if is_inside(pos) else EMPTY
	if id != EMPTY and _placed.has(id):
		var pp: PieceData = remove_piece(id)
		if pp != null:
			return BlockData.make(pp.color, pp.mood as BlockData.Mood, pp.target_color)
		return null
	# Brute find Vector2i key
	for k in _placed.keys():
		if k is Vector2i and k == pos:
			var b = _placed[k]
			_placed.erase(k)
			if b is BlockData:
				return b
			if b is Dictionary and b.has("piece"):
				var p: PieceData = b.piece
				return BlockData.make(p.color, p.mood as BlockData.Mood, p.target_color)
	return null

func get_block(pos: Vector2i) -> BlockData:
	var b = _placed.get(pos, null)
	if b is BlockData:
		return b
	if b is Dictionary and b.has("piece"):
		var p: PieceData = b.piece
		return BlockData.make(p.color, p.mood as BlockData.Mood, p.target_color)
	var id := piece_id_at(pos)
	if id != EMPTY and _placed.has(id):
		var rec: Dictionary = _placed[id]
		var p2: PieceData = rec.piece
		return BlockData.make(p2.color, p2.mood as BlockData.Mood, p2.target_color)
	return null

func neighbours(pos: Vector2i) -> Array[Vector2i]:
	var out: Array[Vector2i] = []
	if not is_playable(pos):
		return out
	for j in _nbr[_idx(pos)]:
		out.append(_pos(j))
	return out

func clone() -> BoardState:
	var c := BoardState.new(width, height, [])
	c._blocked = _blocked.duplicate()
	c._occ = _occ.duplicate()
	c._color = _color.duplicate()
	c._nbr = _nbr
	c._playable = _playable
	c._placed = {}
	for id in _placed.keys():
		var val = _placed[id]
		if val is Dictionary:
			var rec: Dictionary = val
			var piece = rec.get("piece", null)
			var piece_copy = null
			if piece is PieceData:
				piece_copy = (piece as PieceData).duplicate_piece()
			elif piece is BlockData:
				piece_copy = (piece as BlockData).duplicate_block()
			else:
				piece_copy = piece
			var cells_copy: Array = []
			if rec.has("cells"):
				cells_copy = (rec.cells as Array).duplicate()
			var origin = rec.get("origin", Vector2i.ZERO)
			c._placed[id] = {"piece": piece_copy, "origin": origin, "cells": cells_copy}
		elif val is BlockData:
			c._placed[id] = (val as BlockData).duplicate_block()
		elif val is PieceData:
			c._placed[id] = (val as PieceData).duplicate_piece()
		else:
			c._placed[id] = val
	return c


func _adj_colors(cells: Array, pid: int) -> Dictionary:
	var found := {}
	for c in cells:
		var cc: Vector2i = c
		if not is_inside(cc):
			continue
		for j in _nbr[_idx(cc)]:
			var oid := _occ[j]
			if oid != EMPTY and oid != pid:
				found[_color[j]] = true
	return found


func _has_empty_neighbour(cells: Array, pid: int) -> bool:
	for c in cells:
		var cc: Vector2i = c
		if not is_inside(cc):
			continue
		for j in _nbr[_idx(cc)]:
			if _occ[j] == EMPTY:
				return true
	return false


func piece_satisfied(id: int) -> bool:
	if not _placed.has(id):
		return false
	var rec: Dictionary = _placed[id]
	var piece: PieceData = rec.piece
	if piece.mood == PieceData.Mood.NEUTRAL:
		return true
	var adj: Dictionary = _adj_colors(rec.cells, id)
	if piece.mood == PieceData.Mood.AFFECTIONATE:
		return adj.has(piece.target_color)
	return not adj.has(piece.target_color)


func piece_violated(id: int) -> bool:
	if not _placed.has(id):
		return false
	var rec: Dictionary = _placed[id]
	var piece: PieceData = rec.piece
	if piece.mood == PieceData.Mood.NEUTRAL:
		return false
	var adj: Dictionary = _adj_colors(rec.cells, id)
	if piece.mood == PieceData.Mood.HOSTILE:
		return adj.has(piece.target_color)
	# Affectionate: doomed only once every seat on the perimeter is taken
	# and none of them is the friend.
	if adj.has(piece.target_color):
		return false
	if _has_empty_neighbour(rec.cells, id):
		return false
	return true

# Single-cell shims
func is_satisfied(pos: Vector2i) -> bool:
	# Try Vector2i key
	if _placed.has(pos):
		var b = _placed[pos]
		if b is BlockData:
			var bd: BlockData = b
			if bd.mood == BlockData.Mood.NEUTRAL:
				return true
			var has := false
			for npos in neighbours(pos):
				var nb := get_block(npos)
				if nb != null and nb.color == bd.target_color:
					has = true
					break
			if bd.mood == BlockData.Mood.AFFECTIONATE:
				return has
			return not has
		if b is Dictionary:
			var p: PieceData = b.piece
			return piece_satisfied(p.id)
	# Try id
	var id := piece_id_at(pos)
	if id != EMPTY:
		return piece_satisfied(id)
	return false

func is_violated(pos: Vector2i) -> bool:
	if _placed.has(pos):
		var b = _placed[pos]
		if b is BlockData:
			var bd: BlockData = b
			if bd.mood == BlockData.Mood.NEUTRAL:
				return false
			var has := false
			for npos in neighbours(pos):
				var nb := get_block(npos)
				if nb != null and nb.color == bd.target_color:
					has = true
					break
			if bd.mood == BlockData.Mood.HOSTILE:
				return has
			if has:
				return false
			# affectionate violated only if no empty neighbour and no friend
			for npos in neighbours(pos):
				if is_empty_at(npos):
					return false
			return true
		if b is Dictionary:
			var p: PieceData = b.piece
			return piece_violated(p.id)
	var id2 := piece_id_at(pos)
	if id2 != EMPTY:
		return piece_violated(id2)
	return false


func any_violated() -> bool:
	for id in _placed:
		if typeof(id) == TYPE_VECTOR2I:
			if is_violated(id):
				return true
		else:
			if piece_violated(id):
				return true
	return false


func violated_ids() -> Array:
	var out: Array = []
	for id in _placed:
		var is_v := false
		if typeof(id) == TYPE_VECTOR2I:
			is_v = is_violated(id)
		else:
			is_v = piece_violated(id)
		if is_v:
			out.append(id)
	return out

func violated_cells() -> Array[Vector2i]:
	var out: Array[Vector2i] = []
	for id in _placed:
		if typeof(id) == TYPE_VECTOR2I:
			if is_violated(id):
				out.append(id)
		else:
			if piece_violated(id):
				var rec: Dictionary = _placed[id]
				for c in rec.cells:
					out.append(c)
	return out


## Solver-speed variant of would_violate(piece, origin): only the new piece and
## the pieces touching it can change mood state, so only those are checked
## instead of every piece on the board. Pre-existing conflicts elsewhere are
## not reported here (the solver's leaf check, is_solved(), still catches them).
func placement_violates(piece: PieceData, origin: Vector2i) -> bool:
	var cells := piece.world_cells(origin)
	if not can_place_cells(cells):
		return true
	place_piece(piece, origin)
	var bad := piece_violated(piece.id)
	if not bad:
		var seen := {}
		for c in cells:
			for off in NEIGHBOUR_OFFSETS:
				var nid := piece_id_at(c + off)
				if nid == piece.id or seen.has(nid):
					continue
				seen[nid] = true
				if _placed.has(nid) and piece_violated(nid):
					bad = true
					break
			if bad:
				break
	remove_piece(piece.id)
	return bad


func would_violate(a, b) -> bool:
	# Support both (piece, origin) and (Vector2i, BlockData)
	if a is PieceData and b is Vector2i:
		var piece: PieceData = a
		var origin: Vector2i = b
		var cells := piece.world_cells(origin)
		if not can_place_cells(cells):
			return true
		place_piece(piece, origin)
		var bad := any_violated()
		remove_piece(piece.id)
		return bad
	if a is Vector2i and b is BlockData:
		var pos: Vector2i = a
		var blk: BlockData = b
		if not is_empty_at(pos):
			return true
		var c := clone()
		var pid2 := pos.y * width + pos.x + 20000
		var pd := PieceData.make(pid2, blk.color, [Vector2i.ZERO], blk.mood as PieceData.Mood, blk.target_color)
		pd.solution_world = [pos]
		c.place_piece(pd, pos)
		return c.any_violated()
	if a is Vector2i and b is PieceData:
		return would_violate(b, a)
	return false


func is_full() -> bool:
	return empty_count() == 0


func is_solved() -> bool:
	if empty_count() != 0:
		return false
	for id in _placed:
		if typeof(id) == TYPE_VECTOR2I:
			if not is_satisfied(id):
				return false
		else:
			if not piece_satisfied(id):
				return false
	return true


func snapshot() -> Array:
	var out: Array = []
	for id in _placed:
		if typeof(id) == TYPE_VECTOR2I:
			var b: BlockData = _placed[id]
			out.append({
				"color": b.color,
				"mood": int(b.mood),
				"target": b.target_color,
				"cells": [[id.x, id.y]],
				"eye": [id.x, id.y],
			})
		else:
			var rec: Dictionary = _placed[id]
			var piece: PieceData = rec.piece
			var cells: Array = []
			for c in rec.cells:
				cells.append([c.x, c.y])
			var eye: Vector2i = rec.origin + piece.local_eye()
			out.append({
				"color": piece.color,
				"mood": int(piece.mood),
				"target": piece.target_color,
				"cells": cells,
				"eye": [eye.x, eye.y],
			})
	return out
