class_name Background
extends Control

## The animated sky backdrop shared by every screen: a vertical sky gradient
## with a slowly drifting pattern of soft shapes and a light vignette, all in
## shaders/bg_sky.gdshader. Its own node so the board and blocks never have to
## think about what is behind them.

const SHADER := preload("res://shaders/bg_sky.gdshader")

## Bleed past the screen edge so a screen-shake never reveals the clear colour.
const BLEED := 40.0

var _rect: ColorRect
var _mat: ShaderMaterial


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	_mat = ShaderMaterial.new()
	_mat.shader = SHADER
	_mat.set_shader_parameter("top_color", Art.SKY_TOP)
	_mat.set_shader_parameter("mid_color", Art.SKY_MID)
	_mat.set_shader_parameter("bottom_color", Art.SKY_BOTTOM)
	_rect = ColorRect.new()
	_rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_rect.material = _mat
	_rect.set_anchors_preset(Control.PRESET_FULL_RECT)
	_rect.offset_left = -BLEED
	_rect.offset_top = -BLEED
	_rect.offset_right = BLEED
	_rect.offset_bottom = BLEED
	add_child(_rect)
	_rect.resized.connect(_sync_size)
	_sync_size()


func _sync_size() -> void:
	_mat.set_shader_parameter("size_px", _rect.size)
