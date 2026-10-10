class_name PlatformSdk
extends Node

## Thin layer over the Playgama Bridge autoload (addons/playgama_bridge),
## registered as the `Platform` autoload right after `Bridge`. On the web it
## covers what Playgama moderation checks: progress goes through
## Bridge.storage, audio and the tree follow the platform's audio/pause
## signals (and stay muted + paused while an ad is on screen), game_ready is
## sent once the menu is up, and interstitials run between levels.
##
## Everywhere else (desktop runs, headless `--script` tests) it stays out of
## the way: progress keeps living in GameState's user:// file and ads are
## skipped. Call sites use the static helpers, which are safe no-ops when the
## autoload isn't in the tree.

signal progress_loaded

const AUTOLOAD_NAME := "Platform"
const STORAGE_KEY := "progress"

## False only on the web while the saved progress is still being fetched.
var is_loaded := false

var _bridge: Node
var _web := false
var _game_ready_sent := false
var _platform_muted := false
var _platform_paused := false
var _ad_open := false
var _saving := false
## Latest save that arrived while another write was in flight. Bridge's
## storage.set() drops calls made mid-write, so we keep only the newest
## snapshot and flush it when the current write lands.
var _pending_save := ""


static func get_instance() -> PlatformSdk:
	var tree := Engine.get_main_loop() as SceneTree
	if tree == null or tree.root == null:
		return null
	return tree.root.get_node_or_null(AUTOLOAD_NAME) as PlatformSdk


static func save_progress_text(text: String) -> void:
	var sdk := get_instance()
	if sdk != null:
		sdk._save(text)


static func show_interstitial() -> void:
	var sdk := get_instance()
	if sdk != null and sdk._web:
		sdk._bridge.advertisement.show_interstitial()


func _ready() -> void:
	# Keeps listening for the platform's "resume" while the tree is paused.
	process_mode = Node.PROCESS_MODE_ALWAYS
	_bridge = get_node_or_null("/root/Bridge")
	_web = OS.has_feature("web") and _bridge != null
	if not _web:
		is_loaded = true
		return
	_bridge.platform.audio_state_changed.connect(_on_audio_state_changed)
	_bridge.platform.pause_state_changed.connect(_on_pause_state_changed)
	_bridge.advertisement.interstitial_state_changed.connect(_on_interstitial_state_changed)
	_platform_muted = not bool(_bridge.platform.is_audio_enabled)
	_apply_audio_and_pause()
	_bridge.storage.get(STORAGE_KEY, _on_progress_fetched)


func _on_progress_fetched(success: bool, data) -> void:
	if success and typeof(data) == TYPE_STRING and not (data as String).is_empty():
		GameState.load_from_text(data)
	else:
		# Nothing saved on the platform yet: fall back to the local file.
		GameState.ensure_loaded()
	is_loaded = true
	progress_loaded.emit()
	# MainMenu builds itself synchronously on progress_loaded, so the first
	# playable frame is the next one.
	await get_tree().process_frame
	_send_game_ready()


func _send_game_ready() -> void:
	if _game_ready_sent:
		return
	_game_ready_sent = true
	_bridge.platform.send_message(Bridge.PlatformMessage.GAME_READY)


func _save(text: String) -> void:
	if not _web:
		return
	if _saving:
		_pending_save = text
		return
	_saving = true
	_bridge.storage.set(STORAGE_KEY, text, _on_progress_saved)


func _on_progress_saved(success: bool) -> void:
	_saving = false
	if not success:
		push_warning("PlatformSdk: Bridge.storage rejected a progress save")
	if not _pending_save.is_empty():
		var next := _pending_save
		_pending_save = ""
		_save(next)


func _on_audio_state_changed(is_enabled: bool) -> void:
	_platform_muted = not is_enabled
	_apply_audio_and_pause()


func _on_pause_state_changed(is_paused: bool) -> void:
	_platform_paused = is_paused
	_apply_audio_and_pause()


func _on_interstitial_state_changed(state: String) -> void:
	# Literals, not Bridge.InterstitialState.*: match patterns must be constant
	# and an autoload's members aren't, as far as the parser is concerned.
	match state:
		"opened":
			_ad_open = true
		"closed", "failed":
			_ad_open = false
	_apply_audio_and_pause()


func _apply_audio_and_pause() -> void:
	var paused := _platform_paused or _ad_open
	AudioServer.set_bus_mute(0, _platform_muted or paused)
	get_tree().paused = paused
