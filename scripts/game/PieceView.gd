class_name PieceView
extends Control

## One polyomino on screen. Owns no rules.

enum Slot { TRAY, BOARD }

var data: PieceData
var slot: Slot = Slot.TRAY
var origin: Vector2i = Vector2i(-1, -1)
var tray_index: int = -1
var movable: bool = true
var grab_local: Vector2i = Vector2i.ZERO
var cell_size: float = 48.0

var _dragging := false
var _unhappy := false
var _tween: Tween
var _home_pos := Vector2.ZERO
var _home_size := 48.0


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	resized.connect(_on_resized)


func _on_resized() -> void:
	pivot_offset = size * 0.5


func setup(d: PieceData, is_movable: bool) -> void:
	data = d
	movable = is_movable
	_sync_size()
	queue_redraw()


func _sync_size() -> void:
	if data == null:
		return
	var bb := data.bbox()
	size = Vector2(bb) * cell_size
	pivot_offset = size * 0.5


func set_cell_size(s: float) -> void:
	cell_size = s
	_sync_size()
	queue_redraw()


func remember_home() -> void:
	_home_pos = position
	_home_size = cell_size


func home_pos() -> Vector2:
	return _home_pos


func local_cell_at(global_point: Vector2) -> Vector2i:
	var local := global_point - global_position
	if cell_size <= 0.0:
		return Vector2i.ZERO
	var c := Vector2i(floori(local.x / cell_size), floori(local.y / cell_size))
	for cell in data.local_cells():
		if cell == c:
			return c
	# Fall back to nearest occupied cell.
	var best := data.local_cells()[0]
	var best_d := 999999
	for cell in data.local_cells():
		var d: int = absi(cell.x - c.x) + absi(cell.y - c.y)
		if d < best_d:
			best_d = d
			best = cell
	return best


func contains_global(point: Vector2) -> bool:
	if data == null:
		return false
	var local := point - global_position
	if cell_size <= 0.0:
		return false
	var c := Vector2i(floori(local.x / cell_size), floori(local.y / cell_size))
	return data.local_cells().has(c)


func _draw() -> void:
	if data == null:
		return
	Art.draw_polyomino(self, Vector2.ZERO, cell_size, data.local_cells(),
		data.color, data.local_eye(), int(data.mood), data.target_color,
		_unhappy, 1.0)


func set_unhappy(v: bool) -> void:
	if _unhappy != v:
		_unhappy = v
		queue_redraw()


func set_dragging(v: bool) -> void:
	_dragging = v
	z_index = 100 if v else 0
	_kill_tween()
	if v:
		var t := create_tween()
		t.tween_property(self, "scale", Vector2(1.08, 1.08), 0.08)


func refuse() -> void:
	_kill_tween()
	var t := create_tween()
	t.tween_property(self, "rotation", 0.12, 0.04)
	t.tween_property(self, "rotation", -0.12, 0.06)
	t.tween_property(self, "rotation", 0.0, 0.06)


func travel_to(pos: Vector2, new_cell_size: float = -1.0) -> void:
	_kill_tween()
	scale = Vector2.ONE
	rotation = 0.0
	var t := create_tween().set_parallel(true)
	t.tween_property(self, "position", pos, 0.16).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	if new_cell_size > 0.0 and absf(new_cell_size - cell_size) > 0.5:
		t.tween_method(_lerp_cell_size, cell_size, new_cell_size, 0.16)


func _lerp_cell_size(s: float) -> void:
	set_cell_size(s)


func _kill_tween() -> void:
	if _tween != null and _tween.is_valid():
		_tween.kill()
	_tween = null
	rotation = 0.0
