class_name GameState
extends RefCounted

## Progression, currency, photos, and settings. Static class (not an autoload)
## so headless `--script` tests can touch it.

const SAVE_PATH := "user://progress.json"
const HINT_COST := 5
const CLEAR_REWARD := 5
const GIFT_AMOUNT := 10
const BG_COST := 15
const BG_COUNT := 5
const START_DIAMONDS := 20
## Diamonds granted for watching one rewarded ad: two hints' worth.
const AD_REWARD := 10

static var highest_unlocked: int = 0
static var current_level: int = 0
static var sound_enabled: bool = true
static var diamonds: int = START_DIAMONDS
## level index (as string) -> 1..3
static var stars_at: Dictionary = {}
## level index (as string) -> {stars, bg, pieces}
static var photos: Dictionary = {}
## background ids the player owns. 0 meadow, 1 desert start unlocked.
static var unlocked_bgs: Array = [0, 1]
static var gift_day: int = -1
static var colorblind_tokens: bool = false
## Language the player picked by hand ("" = follow the platform). See Loc.
static var language: String = ""
## True once the how-to-play cards were shown (finished or skipped).
static var tutorial_done: bool = false

## The level being played right now, so quitting mid-level loses nothing.
## Levels are generated from a fixed seed, so only what the player did is kept:
## {level, placed: [[piece id, rot, origin x, origin y]], rots: {id: rot} for
## pieces still in the tray, hints, undos}. Empty when nothing is in progress.
static var run: Dictionary = {}

static var _loaded: bool = false


static func ensure_loaded() -> void:
	if _loaded:
		return
	_loaded = true
	load_progress()


static func total_stars() -> int:
	var n := 0
	for k in stars_at:
		n += int(stars_at[k])
	return n


static func stars_for(index: int) -> int:
	return int(stars_at.get(str(index), 0))


static func owns_bg(id: int) -> bool:
	return unlocked_bgs.has(id)


static func buy_bg(id: int) -> bool:
	if owns_bg(id):
		return false
	if diamonds < BG_COST:
		return false
	diamonds -= BG_COST
	unlocked_bgs.append(id)
	save_progress()
	return true


static func can_gift() -> bool:
	return gift_day != _today()


static func open_gift() -> int:
	if not can_gift():
		return 0
	gift_day = _today()
	diamonds += GIFT_AMOUNT
	save_progress()
	return GIFT_AMOUNT


static func spend_hint() -> bool:
	if diamonds < HINT_COST:
		return false
	diamonds -= HINT_COST
	save_progress()
	return true


static func mark_tutorial_done() -> void:
	if tutorial_done:
		return
	tutorial_done = true
	save_progress()


## Call only after the platform confirmed the rewarded ad was watched.
static func grant_ad_reward() -> int:
	diamonds += AD_REWARD
	save_progress()
	return AD_REWARD


static func complete_level(index: int, star_count: int = 3, snapshot: Array = [], bg: int = 0) -> void:
	var key := str(index)
	var prev := int(stars_at.get(key, 0))
	if star_count > prev:
		stars_at[key] = star_count
	photos[key] = {"stars": maxi(prev, star_count), "bg": bg, "pieces": snapshot}
	if index >= highest_unlocked:
		highest_unlocked = index + 1
	diamonds += CLEAR_REWARD
	run = {}
	save_progress()


static func run_for(index: int) -> Dictionary:
	if run.is_empty() or int(run.get("level", -1)) != index:
		return {}
	# Saved under an older generator: that level is a different puzzle now.
	if int(run.get("gen", 0)) != LevelGenerator.VERSION:
		return {}
	return run


static func has_run() -> bool:
	return not run.is_empty()


static func save_run(data: Dictionary) -> void:
	run = data
	save_progress()


static func clear_run() -> void:
	if run.is_empty():
		return
	run = {}
	save_progress()


static func photo_for(index: int) -> Dictionary:
	return photos.get(str(index), {})


## Swap the backdrop of an already-taken photo (the win screen's arrows).
static func set_photo_bg(index: int, bg: int) -> void:
	var key := str(index)
	if not photos.has(key):
		return
	var rec: Dictionary = photos[key]
	rec["bg"] = bg
	photos[key] = rec
	save_progress()


## Indices of every level that has a photo, ascending.
static func photo_levels() -> Array[int]:
	var out: Array[int] = []
	for k in photos:
		out.append(int(k))
	out.sort()
	return out


static func bg_for_level(index: int) -> int:
	if unlocked_bgs.is_empty():
		return 0
	return int(unlocked_bgs[index % unlocked_bgs.size()])


static func _today() -> int:
	var d := Time.get_date_dict_from_system()
	return d.year * 10000 + d.month * 100 + d.day


static func save_progress() -> void:
	var text := JSON.stringify({
		"highest_unlocked": highest_unlocked,
		"sound": sound_enabled,
		"diamonds": diamonds,
		"stars_at": stars_at,
		"photos": photos,
		"unlocked_bgs": unlocked_bgs,
		"gift_day": gift_day,
		"tutorial_done": tutorial_done,
		"language": language,
		"run": run,
	})
	# On the web the platform's storage is the copy that counts (Playgama
	# requires it); the local file stays as a fallback everywhere.
	PlatformSdk.save_progress_text(text)
	var f := FileAccess.open(SAVE_PATH, FileAccess.WRITE)
	if f == null:
		push_warning("GameState: could not write %s" % SAVE_PATH)
		return
	f.store_string(text)
	f.close()


static func load_progress() -> void:
	if not FileAccess.file_exists(SAVE_PATH):
		return
	var f := FileAccess.open(SAVE_PATH, FileAccess.READ)
	if f == null:
		return
	var text := f.get_as_text()
	f.close()
	_apply_save_text(text)


## Loads progress fetched from somewhere other than the local file (the web
## platform's storage) and marks it loaded so ensure_loaded() won't override it.
static func load_from_text(text: String) -> void:
	_loaded = true
	_apply_save_text(text)


static func _apply_save_text(text: String) -> void:
	var parsed: Variant = JSON.parse_string(text)
	if typeof(parsed) != TYPE_DICTIONARY:
		return
	highest_unlocked = int(parsed.get("highest_unlocked", 0))
	sound_enabled = bool(parsed.get("sound", true))
	diamonds = int(parsed.get("diamonds", START_DIAMONDS))
	stars_at = parsed.get("stars_at", {})
	photos = parsed.get("photos", {})
	var bgs: Variant = parsed.get("unlocked_bgs", [0, 1])
	unlocked_bgs = []
	for b in bgs:
		unlocked_bgs.append(int(b))
	if unlocked_bgs.is_empty():
		unlocked_bgs = [0, 1]
	gift_day = int(parsed.get("gift_day", -1))
	# Saves from before the tutorial existed: a player already past level 1
	# knows the game, so don't ambush them with it.
	tutorial_done = bool(parsed.get("tutorial_done", highest_unlocked > 0))
	language = str(parsed.get("language", ""))
	Loc.refresh()
	var saved_run: Variant = parsed.get("run", {})
	run = saved_run if typeof(saved_run) == TYPE_DICTIONARY else {}
