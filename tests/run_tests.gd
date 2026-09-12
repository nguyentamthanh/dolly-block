extends SceneTree

## Headless test suite for the pure-logic layer.
##
##   godot --headless --script res://tests/run_tests.gd
##
## Exits non-zero on failure so CI can gate on it.

var _passed := 0
var _failed := 0

const H := Palette.Hue
const M := BlockData.Mood


func _initialize() -> void:
	print("\n=== Cozy Blocks logic tests ===\n")

	_test_board_basics()
	_test_hostile_violation()
	_test_affectionate_hope_and_despair()
	_test_solved_requires_full_board()
	_test_solver_known_boards()
	_test_solver_matches_brute_force()
	_test_generator_always_solvable()
	_test_generator_is_deterministic()

	print("\n=== %d passed, %d failed ===\n" % [_passed, _failed])
	quit(1 if _failed > 0 else 0)


# --- Assertions --------------------------------------------------------------

func _ok(cond: bool, label: String) -> void:
	if cond:
		_passed += 1
		print("  PASS  %s" % label)
	else:
		_failed += 1
		print("  FAIL  %s" % label)


func _eq(got: Variant, want: Variant, label: String) -> void:
	if got == want:
		_passed += 1
		print("  PASS  %s" % label)
	else:
		_failed += 1
		print("  FAIL  %s  (got %s, want %s)" % [label, str(got), str(want)])


# --- BoardState --------------------------------------------------------------

func _test_board_basics() -> void:
	print("BoardState: geometry")
	var b := BoardState.new(3, 2, [Vector2i(1, 1)])
	_ok(b.is_playable(Vector2i(0, 0)), "in-bounds cell is playable")
	_ok(not b.is_playable(Vector2i(1, 1)), "hole is not playable")
	_ok(not b.is_playable(Vector2i(3, 0)), "out of bounds is not playable")
	_eq(b.playable_cells().size(), 5, "3x2 minus one hole leaves 5 cells")

	# A hole is a settled wall: it never appears as a neighbour.
	var n := b.neighbours(Vector2i(1, 0))
	_ok(not n.has(Vector2i(1, 1)), "holes are excluded from neighbours")
	_eq(n.size(), 2, "(1,0) has 2 playable neighbours with a hole below")


func _test_hostile_violation() -> void:
	print("BoardState: hostile blocks")
	var b := BoardState.new(2, 1, [])
	b.place(Vector2i(0, 0), BlockData.make(H.PINK, M.HOSTILE, H.MINT))

	_ok(not b.is_violated(Vector2i(0, 0)), "hostile is fine while the neighbour is empty")

	b.place(Vector2i(1, 0), BlockData.make(H.MINT, M.NEUTRAL))
	_ok(b.is_violated(Vector2i(0, 0)), "hostile violated once the disliked color moves in")
	_ok(not b.is_satisfied(Vector2i(0, 0)), "violated hostile is also unsatisfied")

	# Swap the offender for something harmless.
	b.remove(Vector2i(1, 0))
	b.place(Vector2i(1, 0), BlockData.make(H.BLUE, M.NEUTRAL))
	_ok(not b.is_violated(Vector2i(0, 0)), "hostile is content beside a different color")
	_ok(b.is_satisfied(Vector2i(0, 0)), "hostile satisfied when the disliked color is absent")


func _test_affectionate_hope_and_despair() -> void:
	print("BoardState: affectionate blocks (the hope/despair distinction)")
	var b := BoardState.new(3, 1, [])
	var lover := BlockData.make(H.PINK, M.AFFECTIONATE, H.MINT)
	b.place(Vector2i(0, 0), lover)

	# THE key case: unsatisfied is not the same as doomed.
	_ok(not b.is_satisfied(Vector2i(0, 0)), "lonely affectionate is not yet satisfied")
	_ok(not b.is_violated(Vector2i(0, 0)), "lonely affectionate is NOT violated - a friend may still arrive")

	# Fill its only neighbour with the wrong color: now hope is gone.
	b.place(Vector2i(1, 0), BlockData.make(H.YELLOW, M.NEUTRAL))
	_ok(b.is_violated(Vector2i(0, 0)), "affectionate violated once every neighbour is settled and wrong")

	# Put the right friend there instead.
	b.remove(Vector2i(1, 0))
	b.place(Vector2i(1, 0), BlockData.make(H.MINT, M.NEUTRAL))
	_ok(b.is_satisfied(Vector2i(0, 0)), "affectionate satisfied by an orthogonal match")
	_ok(not b.is_violated(Vector2i(0, 0)), "satisfied affectionate is not violated")

	# Diagonals must not count.
	var d := BoardState.new(2, 2, [])
	d.place(Vector2i(0, 0), BlockData.make(H.PINK, M.AFFECTIONATE, H.MINT))
	d.place(Vector2i(1, 1), BlockData.make(H.MINT, M.NEUTRAL))
	_ok(not d.is_satisfied(Vector2i(0, 0)), "a diagonal match does not satisfy affection")


func _test_solved_requires_full_board() -> void:
	print("BoardState: win condition")
	var b := BoardState.new(2, 1, [])
	b.place(Vector2i(0, 0), BlockData.make(H.PINK, M.NEUTRAL))
	_ok(not b.is_solved(), "not solved while a cell is still empty")
	b.place(Vector2i(1, 0), BlockData.make(H.BLUE, M.NEUTRAL))
	_ok(b.is_solved(), "solved when full and everyone is content")


# --- Solver ------------------------------------------------------------------

func _test_solver_known_boards() -> void:
	print("Solver: hand-built boards with known answers")
	var s := Solver.new()

	# Two adjacent cells, one block loves what the other one is. Either ordering
	# works, so there are exactly two distinct configurations.
	var b1 := BoardState.new(2, 1, [])
	var tray1: Array = [
		BlockData.make(H.PINK, M.AFFECTIONATE, H.MINT),
		BlockData.make(H.MINT, M.NEUTRAL),
	]
	_eq(s.count_solutions(b1, tray1, 10), 2, "2x1 love pair has exactly 2 solutions")

	# Same shape, but hostility instead of affection: they must touch, so it can
	# never work.
	var b2 := BoardState.new(2, 1, [])
	var tray2: Array = [
		BlockData.make(H.PINK, M.HOSTILE, H.MINT),
		BlockData.make(H.MINT, M.NEUTRAL),
	]
	_eq(s.count_solutions(b2, tray2, 10), 0, "forced hostile adjacency is unsolvable")
	_ok(not s.has_solution(b2, tray2), "has_solution agrees it is impossible")

	# Tray size must match the number of holes.
	var b3 := BoardState.new(2, 1, [])
	_eq(s.count_solutions(b3, [BlockData.make(H.PINK, M.NEUTRAL)], 10), 0,
		"tray that cannot fill the board yields no solutions")

	# Pre-placed fixed blocks that already conflict are rejected up front.
	var b4 := BoardState.new(3, 1, [])
	b4.place(Vector2i(0, 0), BlockData.make(H.PINK, M.HOSTILE, H.MINT))
	b4.place(Vector2i(1, 0), BlockData.make(H.MINT, M.NEUTRAL))
	_eq(s.count_solutions(b4, [BlockData.make(H.BLUE, M.NEUTRAL)], 10), 0,
		"already-conflicting fixed blocks are unsolvable")

	# solve() should hand back a genuinely finished board.
	var b5 := BoardState.new(2, 1, [])
	var filled := s.solve(b5, tray1)
	_ok(filled != null and filled.is_solved(), "solve() returns a truly solved board")


## The multiset deduplication in Solver is the one optimisation that could
## silently change the ANSWER rather than just the speed. So check it against a
## dumb reference: enumerate every permutation of the tray, keep the distinct
## resulting boards, and compare counts.
func _test_solver_matches_brute_force() -> void:
	print("Solver: deduplication matches brute force")
	var gen := LevelGenerator.new()
	var s := Solver.new()
	var mismatches := 0
	var checked := 0

	for i in 12:
		var lv := gen.generate(i, 0)  # smallest tier keeps permutations tractable
		if lv == null:
			continue
		var tray_sz: int = 0
		if lv.tray_pieces != null and not lv.tray_pieces.is_empty():
			tray_sz = lv.tray_pieces.size()
		else:
			tray_sz = lv.tray_blocks.size()
		if tray_sz > 7:
			continue
		# Polyomino pieces with >1 cell break single-cell brute assumption; just check solver stability
		var is_poly := false
		if lv.tray_pieces != null and not lv.tray_pieces.is_empty():
			for p in lv.tray_pieces:
				if p is PieceData and (p as PieceData).base_cells.size() > 1:
					is_poly = true
					break
		if is_poly:
			var c1 := s.count_solutions(lv.build_state(), lv.tray_copy(), 100000)
			var c2 := s.count_solutions(lv.build_state(), lv.tray_copy(), 2)
			checked += 1
			if c1 >= 2 and c2 != 2:
				mismatches += 1
				print("      poly level %d: c1=%d c2=%d" % [i, c1, c2])
			elif c1 < 2 and c1 != c2:
				mismatches += 1
				print("      poly level %d: c1=%d c2=%d" % [i, c1, c2])
			continue
		var smart := s.count_solutions(lv.build_state(), lv.tray_copy(), 100000)
		var dumb := _brute_force_count(lv)
		checked += 1
		if smart != dumb:
			mismatches += 1
			print("      level %d: solver=%d brute=%d" % [i, smart, dumb])

	_ok(checked > 0, "brute-force comparison actually ran (%d levels)" % checked)
	_eq(mismatches, 0, "solver count matches brute force on every sampled level")


## Reference implementation: try every ordering, dedupe by the resulting board.
func _brute_force_count(lv: LevelData) -> int:
	var tray := lv.tray_copy()
	var cells := lv.build_state().empty_cells()
	if tray.size() != cells.size():
		return 0
	var seen := {}
	var order: Array[int] = []
	for i in tray.size():
		order.append(i)
	_permute(order, 0, tray, cells, lv, seen)
	return seen.size()


func _permute(order: Array[int], k: int, tray: Array, cells: Array,
		lv: LevelData, seen: Dictionary) -> void:
	if k == order.size():
		var st := lv.build_state()
		for i in order.size():
			st.place(cells[i], tray[order[i]])
		if st.is_solved():
			seen[_signature(st, cells)] = true
		return
	for i in range(k, order.size()):
		var tmp := order[k]
		order[k] = order[i]
		order[i] = tmp
		_permute(order, k + 1, tray, cells, lv, seen)
		tmp = order[k]
		order[k] = order[i]
		order[i] = tmp


## Two orderings that produce the same blocks in the same cells are the same
## solution, however the solver got there.
func _signature(st: BoardState, cells: Array) -> String:
	var parts: Array[String] = []
	for c in cells:
		parts.append(str(st.get_block(c).key()))
	return ",".join(parts)


# --- Generator ---------------------------------------------------------------

## The regression net that matters most: a level that ships unsolvable is the
## worst bug this game can have.
func _test_generator_always_solvable() -> void:
	print("Generator: every emitted level is solvable")
	var gen := LevelGenerator.new()
	var s := Solver.new()

	var per_tier := 50
	var total := 0
	var bad_null := 0
	var bad_unsolvable := 0
	var bad_tier := 0
	var loose := 0
	var trivial := 0

	for tier in 4:
		for i in per_tier:
			var level_index := tier * 1000 + i
			var lv := gen.generate(level_index, tier)
			total += 1
			if lv == null:
				bad_null += 1
				continue
			if not s.has_solution(lv.build_state(), lv.tray_copy()):
				bad_unsolvable += 1
				print("      UNSOLVABLE level_index=%d tier=%d" % [level_index, tier])
			var cfg: Dictionary = LevelGenerator.TIERS[tier]
			if lv.width != int(cfg.w) or lv.height != int(cfg.h):
				bad_tier += 1
			if cfg.has("max_solutions") and lv.solution_count > int(cfg.max_solutions):
				loose += 1
			# search_cost == number of nodes expanded; one node per free cell
			# means the answer fell out with zero backtracking.
			var tray_sz2: int = 0
			if lv.tray_pieces != null and not lv.tray_pieces.is_empty():
				tray_sz2 = lv.tray_pieces.size()
			elif lv.tray_blocks != null:
				tray_sz2 = lv.tray_blocks.size()
			if lv.search_cost <= tray_sz2:
				trivial += 1

	_eq(bad_null, 0, "no generation failures across %d levels" % total)
	_eq(bad_unsolvable, 0, "every generated level has a solution")
	_eq(bad_tier, 0, "every level matches its tier dimensions")
	print("      (%d/%d levels ended over the outlier ceiling)" % [loose, total])
	_ok(loose <= total / 10, "at least 90%% of levels stay under the outlier ceiling")
	# Difficulty is not asserted on solution count -- see the note in
	# LevelGenerator.TIERS. What is asserted is that levels are not degenerate:
	# a puzzle the solver finishes without ever backtracking needed no thought.
	_ok(trivial <= total / 4, "at most 25%% of levels are solvable with no search")


func _test_generator_is_deterministic() -> void:
	print("Generator: same level index gives the same puzzle")
	var a := LevelGenerator.new().generate(37)
	var b := LevelGenerator.new().generate(37)
	_ok(a != null and b != null, "level 37 generated twice")
	if a != null and b != null:
		_eq(JSON.stringify(a.to_dict()), JSON.stringify(b.to_dict()),
			"level 37 is byte-identical across runs")

	# And round-trips through save/load unchanged.
	var restored := LevelData.from_dict(a.to_dict())
	_eq(JSON.stringify(restored.to_dict()), JSON.stringify(a.to_dict()),
		"level survives a to_dict/from_dict round trip")
