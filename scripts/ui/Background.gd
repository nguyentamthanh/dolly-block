class_name Background
extends Control

## The warm backdrop wash. Its own node so the board and blocks never have to
## think about what is behind them.

func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	resized.connect(queue_redraw)


func _draw() -> void:
	Art.draw_background(self, Rect2(Vector2.ZERO, size))
