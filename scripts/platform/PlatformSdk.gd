class_name PlatformSdk
extends Node

## Thin layer over the Playgama Bridge autoload (addons/playgama_bridge),
## registered as the `Platform` autoload right after `Bridge`. On the web it
## covers what Playgama moderation checks: progress goes through
## Bridge.storage, audio and the tree follow the platform's audio/pause
## signals (and stay muted + paused while an ad is on screen), game_ready is
## sent once the menu is up, interstitials run between levels, and rewarded
## ads refill diamonds on request.
##
## Everywhere else (desktop runs, headless `--script` tests) it stays out of
## the way: progress keeps living in GameState's user:// file and interstitials
## are skipped. A rewarded ad grants at once in debug builds (so the flow can be
## tested off the web) and is unavailable in release builds. Call sites use the
## static helpers, which are safe no-ops when the autoload isn't in the tree.

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
## Called once per show_rewarded() with true only if the platform reported the
## "rewarded" state; cleared as soon as it fires.
var _rewarded_done := Callable()


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


static func is_rewarded_available() -> bool:
	var sdk := get_instance()
	if sdk == null:
		return false
	if not sdk._web:
		return OS.is_debug_build()
	return bool(sdk._bridge.advertisement.is_rewarded_supported)


## Shows a rewarded ad and calls `on_done(granted)` exactly once. `granted` is
## true only when the platform confirmed the "rewarded" state -- closing or a
## failed ad gives false, so the reward can never be claimed without watching.
static func show_rewarded(on_done: Callable) -> void:
	var sdk := get_instance()
	if sdk == null or not is_rewarded_available():
		on_done.call(false)
		return
	if not sdk._web:
		on_done.call(true)
		return
	if sdk._rewarded_done.is_valid():
		return  # one ad at a time; the first request still gets its answer
	sdk._rewarded_done = on_done
	sdk._bridge.advertisement.show_rewarded()


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
	_bridge.advertisement.rewarded_state_changed.connect(_on_rewarded_state_changed)
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


func _on_rewarded_state_changed(state: String) -> void:
	match state:
		"opened":
			_ad_open = true
		"rewarded":
			_finish_rewarded(true)
		"closed", "failed":
			_ad_open = false
			_finish_rewarded(false)
	_apply_audio_and_pause()


func _finish_rewarded(granted: bool) -> void:
	if not _rewarded_done.is_valid():
		return
	var cb := _rewarded_done
	_rewarded_done = Callable()
	cb.call(granted)


func _apply_audio_and_pause() -> void:
	var paused := _platform_paused or _ad_open
	AudioServer.set_bus_mute(0, _platform_muted or paused)
	get_tree().paused = paused
