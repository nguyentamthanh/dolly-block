class_name Loc
extends RefCounted

## UI translations. Static class (not an autoload) so headless `--script` tests
## can use it, like GameState. English is the default and the fallback for any
## missing key or language, as Playgama requires.
##
## The language is picked, in order, from: the player's saved choice
## (GameState.language), the platform's language (PlatformSdk hands it over via
## `platform_lang`), then English. Callers use t("key") and format placeholders
## themselves: Loc.t("level_n") % 5.

## Order of the columns in TEXTS below.
const CODES := ["en", "ru", "es", "pt", "de", "fr", "tr"]
## Each language written in itself (never translated), for the picker.
const NAMES := {
	"en": "English", "ru": "Русский", "es": "Español",
	"pt": "Português", "de": "Deutsch", "fr": "Français", "tr": "Türkçe",
}

## What the platform reported (ISO 639-1, maybe "pt-BR"); set before the UI exists.
static var platform_lang := ""

static var _lang := ""

const TEXTS := {
	"play": ["PLAY", "ИГРАТЬ", "JUGAR", "JOGAR", "SPIELEN", "JOUER", "OYNA"],
	"photos": ["PHOTOS", "ФОТО", "FOTOS", "FOTOS", "FOTOS", "PHOTOS", "FOTOĞRAFLAR"],
	"level_n": ["Level %d", "Уровень %d", "Nivel %d", "Nível %d", "Level %d", "Niveau %d", "Seviye %d"],
	"in_progress": ["in progress", "в процессе", "en curso", "em andamento", "läuft", "en cours", "devam ediyor"],
	"level_caps": ["LEVEL %d", "УРОВЕНЬ %d", "NIVEL %d", "NÍVEL %d", "LEVEL %d", "NIVEAU %d", "SEVİYE %d"],
	"tier_0": ["Warm-up", "Разминка", "Calentamiento", "Aquecimento", "Aufwärmen", "Échauffement", "Isınma"],
	"tier_1": ["Cozy", "Уютный", "Acogedor", "Aconchegante", "Gemütlich", "Douillet", "Rahat"],
	"tier_2": ["Tricky", "Хитрый", "Complicado", "Complicado", "Knifflig", "Délicat", "Zorlu"],
	"tier_3": ["Tangled", "Запутанный", "Enredado", "Embaraçado", "Verworren", "Emmêlé", "Karışık"],
	"tier_4": ["Nightmare", "Кошмар", "Pesadilla", "Pesadelo", "Albtraum", "Cauchemar", "Kâbus"],
	"continue": ["CONTINUE", "ДАЛЕЕ", "CONTINUAR", "CONTINUAR", "WEITER", "CONTINUER", "DEVAM"],
	"well_done": ["Well done! You've earned", "Отлично! Вы получили", "¡Bien hecho! Has ganado", "Muito bem! Você ganhou",
		"Gut gemacht! Du erhältst", "Bravo ! Tu as gagné", "Aferin! Kazandın:"],
	"all_settled": ["ALL SETTLED!", "ВСЁ НА МЕСТАХ!", "¡TODO EN SU SITIO!", "TUDO NO LUGAR!", "ALLES AM PLATZ!",
		"TOUT EST EN PLACE !", "HEPSİ YERLEŞTİ!"],
	"gift_wait": ["Come back tomorrow for another gift!", "Приходи завтра за новым подарком!",
		"¡Vuelve mañana para otro regalo!", "Volte amanhã para ganhar outro presente!",
		"Komm morgen für ein neues Geschenk wieder!", "Reviens demain pour un autre cadeau !",
		"Yeni bir hediye için yarın tekrar gel!"],
	"menu": ["MENU", "МЕНЮ", "MENÚ", "MENU", "MENÜ", "MENU", "MENÜ"],
	"home": ["HOME", "ГЛАВНАЯ", "INICIO", "INÍCIO", "START", "ACCUEIL", "ANA SAYFA"],
	"sound_on": ["SOUND: ON", "ЗВУК: ВКЛ", "SONIDO: SÍ", "SOM: LIGADO", "TON: AN", "SON : ACTIVÉ", "SES: AÇIK"],
	"sound_off": ["SOUND: OFF", "ЗВУК: ВЫКЛ", "SONIDO: NO", "SOM: DESLIGADO", "TON: AUS", "SON : COUPÉ", "SES: KAPALI"],
	"close": ["CLOSE", "ЗАКРЫТЬ", "CERRAR", "FECHAR", "SCHLIESSEN", "FERMER", "KAPAT"],
	"open": ["OPEN", "ОТКРЫТЬ", "ABRIR", "ABRIR", "ÖFFNEN", "OUVRIR", "AÇ"],
	"nice_btn": ["NICE!", "КЛАСС!", "¡GENIAL!", "LEGAL!", "SUPER!", "GÉNIAL !", "HARİKA!"],
	"gems_plus": ["+%d gems!", "+%d кристаллов!", "¡+%d gemas!", "+%d gemas!", "+%d Edelsteine!", "+%d gemmes !",
		"+%d mücevher!"],
	"language": ["LANGUAGE", "ЯЗЫК", "IDIOMA", "IDIOMA", "SPRACHE", "LANGUE", "DİL"],
	"ad_title": ["OUT OF DIAMONDS", "НЕТ АЛМАЗОВ", "SIN DIAMANTES", "SEM DIAMANTES", "KEINE DIAMANTEN",
		"PLUS DE DIAMANTS", "ELMAS BİTTİ"],
	"ad_body": ["Watch a short ad to get\n+%d diamonds", "Посмотри короткую рекламу и получи\n+%d алмазов",
		"Mira un anuncio corto y gana\n+%d diamantes", "Assista a um anúncio curto e ganhe\n+%d diamantes",
		"Sieh dir eine kurze Werbung an\nund erhalte +%d Diamanten", "Regarde une courte pub pour gagner\n+%d diamants",
		"Kısa bir reklam izle,\n+%d elmas kazan"],
	"watch_ad": ["WATCH AD", "СМОТРЕТЬ", "VER ANUNCIO", "VER ANÚNCIO", "WERBUNG ANSEHEN", "VOIR UNE PUB", "REKLAM İZLE"],
	"how_to_play": ["HOW TO PLAY", "КАК ИГРАТЬ", "CÓMO JUGAR", "COMO JOGAR", "SO WIRD GESPIELT", "COMMENT JOUER",
		"NASIL OYNANIR"],
	"t1_title": ["FILL THE BOARD", "ЗАПОЛНИ ПОЛЕ", "LLENA EL TABLERO", "PREENCHA O TABULEIRO", "FÜLLE DAS BRETT",
		"REMPLIS LA GRILLE", "TAHTAYI DOLDUR"],
	"t1_body": ["Drag pieces from the tray onto the board.\nFill every empty cell!",
		"Перетаскивай фигуры из лотка на поле.\nЗаполни все пустые клетки!",
		"Arrastra las piezas de la bandeja al tablero.\n¡Llena todas las casillas vacías!",
		"Arraste as peças da bandeja para o tabuleiro.\nPreencha todas as células vazias!",
		"Ziehe die Teile aus der Ablage aufs Brett.\nFülle jedes leere Feld!",
		"Glisse les pièces vers la grille.\nRemplis toutes les cases vides !",
		"Parçaları tepsiden tahtaya sürükle.\nTüm boş kareleri doldur!"],
	"t2_title": ["TAP TO ROTATE", "КОСНИСЬ — ПОВЕРНИ", "TOCA PARA GIRAR", "TOQUE PARA GIRAR", "TIPPEN ZUM DREHEN",
		"TOUCHE POUR TOURNER", "DÖNDÜRMEK İÇİN DOKUN"],
	"t2_body": ["Tap a piece to turn it,\nthen drag it into place.",
		"Коснись фигуры, чтобы повернуть,\nзатем перетащи на место.",
		"Toca una pieza para girarla\ny arrástrala a su sitio.", "Toque em uma peça para girá-la\ne arraste-a para o lugar.",
		"Tippe ein Teil an, um es zu drehen,\nund zieh es dann an seinen Platz.",
		"Touche une pièce pour la tourner,\npuis glisse-la en place.",
		"Parçayı döndürmek için dokun,\nsonra yerine sürükle."],
	"t3_title": ["HEARTS = LOVE", "СЕРДЦЕ = ЛЮБОВЬ", "CORAZÓN = AMOR", "CORAÇÃO = AMOR", "HERZ = LIEBE", "CŒUR = AMOUR",
		"KALP = SEVGİ"],
	"t3_body": ["A heart means the block LOVES that color.\nPut it next to a block of that color.",
		"Сердце значит: блок ЛЮБИТ этот цвет.\nПоставь его рядом с блоком такого цвета.",
		"Un corazón significa que al bloque le ENCANTA ese color.\nPonlo junto a un bloque de ese color.",
		"Um coração significa que o bloco ADORA aquela cor.\nColoque-o ao lado de um bloco dessa cor.",
		"Ein Herz heißt: Der Block LIEBT diese Farbe.\nLege ihn neben einen Block dieser Farbe.",
		"Un cœur signifie que le bloc ADORE cette couleur.\nPlace-le à côté d'un bloc de cette couleur.",
		"Kalp, bloğun o rengi SEVDİĞİ anlamına gelir.\nOnu o renkteki bir bloğun yanına koy."],
	"t4_title": ["BOLTS = DISLIKE", "МОЛНИЯ = НЕ ЛЮБИТ", "RAYO = RECHAZO", "RAIO = NÃO GOSTA", "BLITZ = ABNEIGUNG",
		"ÉCLAIR = DÉTESTE", "ŞİMŞEK = SEVMEZ"],
	"t4_body": ["A bolt means the block HATES that color.\nKeep them apart, or it gets upset\n(red ring).",
		"Молния значит: блок НЕ ВЫНОСИТ этот цвет.\nДержи их подальше, иначе он расстроится\n(красное кольцо).",
		"Un rayo significa que el bloque ODIA ese color.\nSepáralos o se enfadará\n(aro rojo).",
		"Um raio significa que o bloco ODEIA aquela cor.\nMantenha-os afastados ou ele fica chateado\n(anel vermelho).",
		"Ein Blitz heißt: Der Block HASST diese Farbe.\nHalte sie auseinander, sonst ist er sauer\n(roter Ring).",
		"Un éclair signifie que le bloc DÉTESTE cette couleur.\nGarde-les éloignés, sinon il se fâche\n(anneau rouge).",
		"Şimşek, bloğun o renkten NEFRET ettiği anlamına gelir.\nOnları ayır, yoksa üzülür\n(kırmızı halka)."],
	"t5_title": ["MAKE THEM HAPPY", "СДЕЛАЙ ИХ СЧАСТЛИВЫМИ", "HAZLOS FELICES", "DEIXE-OS FELIZES", "MACH SIE GLÜCKLICH",
		"RENDS-LES HEUREUX", "ONLARI MUTLU ET"],
	"t5_body": ["Fill the board with every block happy to win!\nStuck? Undo a move, or use a Hint\nfor %d diamonds.",
		"Заполни поле так, чтобы все блоки были счастливы!\nЗастрял? Отмени ход или возьми подсказку\nза %d алмазов.",
		"¡Llena el tablero con todos los bloques felices para ganar!\n¿Atascado? Deshaz un movimiento o usa una pista\npor %d diamantes.",
		"Preencha o tabuleiro com todos os blocos felizes para vencer!\nPreso? Desfaça uma jogada ou use uma dica\npor %d diamantes.",
		"Fülle das Brett mit lauter glücklichen Blöcken, um zu gewinnen!\nSteckst du fest? Mach einen Zug rückgängig\noder nutze einen Tipp für %d Diamanten.",
		"Remplis la grille avec des blocs tous heureux pour gagner !\nBloqué ? Annule un coup ou utilise un indice\npour %d diamants.",
		"Kazanmak için tahtayı mutlu bloklarla doldur!\nTakıldın mı? Hamleyi geri al ya da\n%d elmasa ipucu kullan."],
	"undo": ["Undo", "Отмена", "Deshacer", "Desfazer", "Zurück", "Annuler", "Geri al"],
	"hint": ["Hint", "Подсказка", "Pista", "Dica", "Tipp", "Indice", "İpucu"],
	"next": ["NEXT", "ДАЛЕЕ", "SIGUIENTE", "PRÓXIMO", "WEITER", "SUIVANT", "İLERİ"],
	"lets_play": ["LET'S PLAY!", "ИГРАЕМ!", "¡A JUGAR!", "VAMOS JOGAR!", "LOS GEHT'S!", "JOUONS !", "HADİ OYNAYALIM!"],
	"hud_drag_hint": ["Drag pieces onto the board  ·  Tap one to rotate it",
		"Перетащи фигуры на поле  ·  Коснись, чтобы повернуть", "Arrastra piezas al tablero  ·  Toca para girar",
		"Arraste peças ao tabuleiro  ·  Toque para girar", "Teile aufs Brett ziehen  ·  Antippen zum Drehen",
		"Glisse les pièces sur la grille  ·  Touche pour tourner", "Parçaları tahtaya sürükle  ·  Döndürmek için dokun"],
	"hud_red_ring": ["Red ring = upset! Check the bubble above it", "Красное кольцо = расстроен! Смотри пузырь над ним",
		"Aro rojo = enfadado. Mira la burbuja de arriba", "Anel vermelho = chateado! Veja o balão acima",
		"Roter Ring = sauer! Sieh dir die Blase darüber an", "Anneau rouge = fâché ! Regarde la bulle au-dessus",
		"Kırmızı halka = üzgün! Üstündeki balona bak"],
	"ad_reward_toast": ["+%d diamonds!", "+%d алмазов!", "¡+%d diamantes!", "+%d diamantes!", "+%d Diamanten!",
		"+%d diamants !", "+%d elmas!"],
	"ad_failed": ["Ad not finished - no diamonds this time", "Реклама не досмотрена — алмазов нет",
		"Anuncio sin terminar: esta vez no hay diamantes", "Anúncio não concluído - sem diamantes desta vez",
		"Werbung nicht beendet – diesmal keine Diamanten", "Pub non terminée - pas de diamants cette fois",
		"Reklam bitmedi - bu sefer elmas yok"],
	"no_diamonds_hint": ["Not enough diamonds for a hint", "Не хватает алмазов для подсказки",
		"No hay diamantes suficientes para una pista", "Diamantes insuficientes para uma dica",
		"Nicht genug Diamanten für einen Tipp", "Pas assez de diamants pour un indice", "İpucu için yeterli elmas yok"],
	"no_way_home": ["No way home from here - try undoing a move", "Отсюда выхода нет — попробуй отменить ход",
		"Sin salida desde aquí: prueba a deshacer un movimiento", "Sem saída daqui - tente desfazer uma jogada",
		"Von hier gibt es keinen Weg – mach einen Zug rückgängig", "Plus d'issue ici - essaie d'annuler un coup",
		"Buradan çıkış yok - bir hamleyi geri almayı dene"],
	"praise_nice": ["Nice!", "Неплохо!", "¡Bien!", "Legal!", "Nett!", "Sympa !", "Güzel!"],
	"praise_great": ["Great!", "Отлично!", "¡Genial!", "Ótimo!", "Super!", "Super !", "Harika!"],
	"praise_awesome": ["Awesome!", "Круто!", "¡Increíble!", "Incrível!", "Toll!", "Génial !", "Muhteşem!"],
	"praise_amazing": ["Amazing!", "Потрясающе!", "¡Asombroso!", "Impressionante!", "Fantastisch!", "Incroyable !",
		"İnanılmaz!"],
	"praise_perfect": ["Perfect!", "Идеально!", "¡Perfecto!", "Perfeito!", "Perfekt!", "Parfait !", "Mükemmel!"],
}


## Current language code, always one of CODES.
static func current() -> String:
	if _lang.is_empty():
		_lang = resolve()
	return _lang


## Saved choice, else the platform's language, else English.
static func resolve() -> String:
	var saved := normalize(GameState.language)
	if not saved.is_empty():
		return saved
	var from_platform := normalize(platform_lang)
	return from_platform if not from_platform.is_empty() else "en"


## "pt-BR" / "PT_br" -> "pt"; "" when the language isn't supported.
static func normalize(code: String) -> String:
	var c := code.strip_edges().to_lower().replace("_", "-").get_slice("-", 0)
	return c if CODES.has(c) else ""


## Forget the cached language so the next t() resolves it again (after the
## platform's language or the saved progress arrived).
static func refresh() -> void:
	_lang = ""


## Player's explicit choice: remembered in the save and used from now on.
static func set_language(code: String) -> void:
	var c := normalize(code)
	if c.is_empty():
		return
	GameState.language = c
	_lang = c
	GameState.save_progress()


static func t(key: String) -> String:
	var row: Variant = TEXTS.get(key)
	if row == null:
		push_warning("Loc: missing key '%s'" % key)
		return key
	var i := CODES.find(current())
	var text: String = row[i] if i >= 0 and i < row.size() else ""
	return text if not text.is_empty() else row[0]


static func tier_name(tier: int) -> String:
	return t("tier_%d" % tier)
