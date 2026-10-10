class_name BlockView
extends Control

## One block on screen. Owns no rules -- it renders a BlockData and animates
## between positions. All decisions about legality live in BoardState.

signal picked_up(view: BlockView)

enum Slot { TRAY, BOARD }

const INVALID := Vector2i(-1, -1)

var data: BlockData
## Where this block currently lives, so the drag code knows what it is doing.
var slot: Slot = Slot.TRAY
## Board cell when slot == BOARD, otherwise tray index.
var cell: Vector2i = Vector2i(-1, -1)
var tray_index: int = -1
## Fixed blocks are part of the puzzle statement and cannot be picked up.
var movable: bool = true
## Live board state, set by the LevelController after spawn. Used so the
## renderer's outline can join with adjacent blocks instead of leaving a
## cream gap at the seam (see Art.draw_block's `board_neighbors` parameter).
var board_state: BoardState = null

var _dragging := false
var _unhappy := false
var _tween: Tween


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE  # DragController does the hit-testing
	pivot_offset = size * 0.5


func setup(d: BlockData, is_movable: bool) -> void:
	data = d
	movable = is_movable
	queue_redraw()


func _draw() -> void:
	if data == null:
		return
	var rect := Rect2(Vector2.ZERO, size)
	Art.draw_block(self, rect, data, GameState.colorblind_tokens, 1.0,
		_compute_board_neighbors())

	# A violated block gets a red ring. Note this uses BoardState.is_violated,
	# never "unsatisfied" -- an affectionate block still waiting for a friend
	# must not be scolded for it.
	if _unhappy:
		var r := size.x * Art.CORNER
		draw_style_box(Art.box(Color.TRANSPARENT, r, maxf(2.0, size.x * 0.045),
			Art.BAD_TINT), rect)


## Board-local neighbours of this block's cell, in the same coordinates Art
## expects (Vector2i.ZERO is the block itself, +/-1 on each axis are the
## orthogonal neighbours). Empty when not on the board yet.
func _compute_board_neighbors() -> Array[Vector2i]:
	if board_state == null or slot != Slot.BOARD or cell == INVALID:
		return ([] as Array[Vector2i])
	var out: Array[Vector2i] = []
	for off in BoardState.NEIGHBOUR_OFFSETS:
		var world_nbr: Vector2i = cell + off
		if not board_state.is_playable(world_nbr):
			continue
		# Single-cell block: any occupied neighbour is by definition another
		# piece (this block's own cell is `cell`, not `world_nbr`), so an
		# `EMPTY`-only check is enough.
		if board_state.piece_id_at(world_nbr) == BoardState.EMPTY:
			continue
		out.append(off)
	return out


func set_unhappy(v: bool) -> void:
	if _unhappy != v:
		_unhappy = v
		queue_redraw()


func set_dragging(v: bool) -> void:
	_dragging = v
	z_index = 100 if v else 0
	_kill_tween()
	var t := create_tween().set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	t.tween_property(self, "scale", Vector2.ONE * (1.12 if v else 1.0), 0.12)
	_tween = t


## Animate into a rect. Blocks always travel; teleporting reads as a glitch.
func move_to(rect: Rect2, duration: float = 0.16) -> void:
	_kill_tween()
	pivot_offset = rect.size * 0.5
	if duration <= 0.0:
		position = rect.position
		size = rect.size
		queue_redraw()
		return
	var t := create_tween().set_parallel(true)
	t.set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	t.tween_property(self, "position", rect.position, duration)
	t.tween_property(self, "size", rect.size, duration)
	_tween = t


## Land-on-board squash. Pure juice, but it is most of what makes placement feel
## good rather than merely correct.
func pop() -> void:
	_kill_tween()
	var t := create_tween()
	t.tween_property(self, "scale", Vector2(1.14, 0.88), 0.07)
	t.tween_property(self, "scale", Vector2(0.96, 1.06), 0.07)
	t.tween_property(self, "scale", Vector2.ONE, 0.09)
	_tween = t


## Refused-placement shake.
func refuse() -> void:
	_kill_tween()
	var x := position.x
	var t := create_tween()
	for d in [-1.0, 1.0, -0.6, 0.6, 0.0]:
		t.tween_property(self, "position:x", x + d * size.x * 0.12, 0.045)
	_tween = t


func _kill_tween() -> void:
	if _tween != null and _tween.is_valid():
		_tween.kill()
