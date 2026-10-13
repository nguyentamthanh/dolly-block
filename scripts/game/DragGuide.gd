class_name DragGuide
extends Control

## First-level coach mark: a fingertip that presses on one tray piece and
## drags to where that piece belongs, over a pulsing ghost of it on the board.
## Loops until the player picks up any piece (LevelController frees it then).
## Positions are re-read every frame, so it follows relayouts and rotation.

const PERIOD := 2.2

var _controller: LevelController
var _piece: PieceView
var _target: Vector2i
var _cells: Array[Vector2i] = []
var _t := 0.0


func setup(controller: LevelController, piece: PieceView, target: Vector2i,
		cells: Array[Vector2i]) -> void:
	_controller = controller
	_piece = piece
	_target = target
	_cells = cells


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	z_index = 150  # over resting pieces, under the panels


func _process(delta: float) -> void:
	_t += delta
	if not is_instance_valid(_piece):
		queue_free()
		return
	queue_redraw()


func _draw() -> void:
	if not is_instance_valid(_piece):
		return
	var board := _controller.board
	var cs := board.cell_size
	var ghost_at := board.global_position + board.origin + Vector2(_target) * cs - global_position
	var bb := Vector2.ZERO
	for c in _cells:
		bb = Vector2(maxf(bb.x, c.x + 1), maxf(bb.y, c.y + 1))
	var pulse := 0.6 + 0.3 * sin(_t * 5.0)
	var tint := Palette.fill(_piece.data.color)
	Art.draw_ghost(self, ghost_at, cs, _cells, Color(tint, pulse * 0.55), Color(1, 1, 1, pulse))

	var from := _piece.global_position + _piece.size * 0.5 - global_position
	var to := ghost_at + bb * cs * 0.5
	var p := fmod(_t, PERIOD)
	# 0.0-0.35 press, 0.35-1.35 drag, 1.35-1.7 hold & release, then fade out.
	var k := clampf((p - 0.35) / 1.0, 0.0, 1.0)
	k = k * k * (3.0 - 2.0 * k)
	var at := from.lerp(to, k) + Vector2(18, 26)
	var pressed := p >= 0.2 and p < 1.5
	var alpha := clampf((PERIOD - p) / 0.4, 0.0, 1.0) * clampf(p / 0.15, 0.0, 1.0)
	# A dotted trail from the piece to its spot, so the direction reads at once.
	var steps := 9
	for i in steps:
		var q := float(i + 1) / float(steps + 1)
		draw_circle(from.lerp(to, q), 7.0, Color(1, 1, 1, 0.65 * alpha))
	if pressed:
		var age := p - 0.2
		draw_arc(at, 30.0 + minf(age, 0.3) * 40.0, 0.0, TAU, 32,
			Color(1, 1, 1, 0.7 * alpha), 5.0, true)
	var r := 22.0 if pressed else 26.0
	draw_circle(at + Vector2(0, 5), r + 4.0, Color(0.05, 0.02, 0.2, 0.3 * alpha))
	draw_circle(at, r + 4.0, Color(Art.OUTLINE, alpha))
	draw_circle(at, r, Color(1, 1, 1, alpha))
	draw_circle(at + Vector2(-r * 0.3, -r * 0.3), r * 0.25, Color(1, 1, 1, alpha))
