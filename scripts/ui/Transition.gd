class_name Transition
extends RefCounted

## Circle-wipe scene change. The wipe lives on a CanvasLayer parented to the
## tree root (not to the current scene), so it survives change_scene_to_file()
## and can open back up over the new scene. No autoload needed.

const SHADER := preload("res://shaders/transition.gdshader")

static var _busy := false


static func go(tree: SceneTree, path: String) -> void:
	if tree == null:
		return
	if _busy:
		return
	_busy = true
	var layer := CanvasLayer.new()
	layer.layer = 100
	var rect := ColorRect.new()
	rect.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	rect.mouse_filter = Control.MOUSE_FILTER_STOP
	var mat := ShaderMaterial.new()
	mat.shader = SHADER
	mat.set_shader_parameter("progress", 0.0)
	mat.set_shader_parameter("size_px", tree.root.get_visible_rect().size)
	rect.material = mat
	layer.add_child(rect)
	tree.root.add_child(layer)

	var set_p := func(v: float): mat.set_shader_parameter("progress", v)
	var t := layer.create_tween()
	t.tween_method(set_p, 0.0, 1.0, 0.32).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_IN)
	t.tween_callback(func(): tree.change_scene_to_file(path))
	t.tween_interval(0.08)
	t.tween_method(set_p, 1.0, 0.0, 0.38).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	t.tween_callback(func():
		_busy = false
		layer.queue_free())
