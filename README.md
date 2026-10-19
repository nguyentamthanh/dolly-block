# Cozy Blocks

A calm polyomino puzzle where every block has feelings about colours: place the googly-eyed pieces so that
everyone is happy at once. Built with **Phaser 4 + TypeScript + Vite** for the web (Playgama, YouTube Playables)
and ready to be wrapped for mobile.

The game was first written in Godot and ported to Phaser so it loads fast: about **0.8 MB to the playable menu**
and a **1.1 MB zip**, against ~13 MB for the Godot web export. The last Godot version is kept in git history at the
tag `godot-final`.

## Commands

```bash
npm install
npm run dev            # http://localhost:5180  (dev-only URL params below)
npm test               # unit tests: core logic, Godot-exported fixtures, sfx, tween engine
npm run build          # typecheck + production build into dist/
npm run package:web    # build + size budget + cozy-blocks-<version>.zip for the platforms
npm run assets         # regenerate public/art (WebP) and public/fonts (WOFF2) from assets-src/
node tests/e2e.mjs     # headless-Chrome end-to-end checks (needs `npm run dev` running)
```

Dev URL params (dev server only): `?scene=mainmenu|timeline|game|gallery`, `level=N` (also unlocks), `cur=N`,
`hi=N` (highest unlocked), `tut=1` (tutorial already seen) / `tut=0`, `gems=N`, `lang=xx`, `stars=1` (a few cleared levels).

## Project layout

```
index.html              page shell (canvas parent, start-up error notice)
vite.config.ts          build: Phaser in its own chunk, bundled Bridge injected into index.html
public/                 shipped as is: art/ (WebP), fonts/ (WOFF2 + licences), playgama-bridge*.js/json, favicon
assets-src/             source art and fonts (not shipped); `npm run assets` turns them into public/
src/
  main.ts               entry: platform, saved progress, fonts, then createGame()
  game.ts               creates Phaser.Game and the wiring outside scenes (resize, Esc, platform pause)
  config.ts             Phaser game config and the scene list
  dev.ts                dev-only URL params and window.__game
  scenes/               Phaser scenes: MainMenu, Timeline, Game, Transition (+ dev Gallery), BaseScene
  objects/              the play screen's game objects: BoardView, PieceView, TrayView, DragController, DragGuide, Hud
  ui/                   widgets and panels: buttons, tween engine, win panel, tutorial, language picker, ...
  core/                 pure game logic, no Phaser: BoardState, Solver, LevelGenerator, GameState, Loc, ...
  render/               Canvas 2D drawing layer: CanvasItem, Art (all procedural art), CanvasView, Fonts, Viewport
  fx/                   particles, rings, floating text, screen shake
  audio/                procedural sound effects rendered with Web Audio (no audio files)
  platform/             Playgama Bridge integration (storage, ads, pause/mute, game_ready)
tests/                  Vitest tests, Godot-exported fixtures (fixtures/), reference screenshots (baseline/), e2e.mjs
scripts/                build/packaging, asset optimisation, screenshot + pixel-diff tools
```

## Staying identical to the Godot build

* **Levels.** `LevelGenerator` uses a port of Godot's PCG32 `RandomNumberGenerator`, `hash(String)` and the
  (unstable) introsort behind `sort_custom`. `tests/levels.test.ts` compares levels 0-149 and the solver's hint
  moves byte for byte with data exported from Godot (`tests/fixtures/godot_fixtures.json`), so saves, photos
  and half-finished levels written by the Godot build keep working. If the generator ever changes, bump
  `VERSION` in `LevelGenerator.ts` (saved runs are tied to it).
* **Sounds.** `tests/sfx.test.ts` checks every synthesized sample against Godot's.
* **Pixels.** `scripts/shot.mjs` + `scripts/diff.mjs` screenshot a page and diff it against `tests/baseline/*.png`
  (captured from Godot): menu, timeline and the play screen at several window shapes differ by ~0.15-0.4 % of pixels
  (anti-aliasing).
* **Text metrics.** Godot sizes a line by the tallest font in the stack (Noto Sans, the fallback), rounds
  advances to whole pixels and strokes outlines with radius `outline_size / 4`; `render/Fonts.ts` reproduces that.

## Platforms (one build for Playgama and YouTube Playables)

The same zip runs on both: the Playgama Bridge (bundled, loaded by a static `<script>` that `vite.config.ts` injects)
talks to whichever host it is in, so game code only uses `PlatformSdk`. To satisfy YouTube Playables' rules:

* no external requests: the Bridge is never fetched from a CDN; analytics are off on `platforms.youtube` in `playgama-bridge-config.json`;
* progress only through the Bridge storage (`localStorage` is used only when there is no platform, i.e. dev / tests);
* pause and mute only from the platform's events: Phaser's Page Visibility / blur handlers are detached in `game.ts`;
* no in-game mute button on YouTube (`PlatformSdk.hideSoundToggle`), Esc closes dialogs (`ui/Overlay.ts`, never preventDefault'ed);
* any aspect ratio, and a zero-sized first viewport, are handled (`tests/e2e.mjs`, "YouTube Playables rules").

Still to do in YouTube's Developer Portal: thumbnails and title without logos or branding.

## Notes

* Everything is laid out in a logical space of 720 x 1280, expanded to the window's aspect; `render/Viewport.ts` and the
  scenes' camera zoom map it to device pixels, so canvases stay crisp on HiDPI.
* Progress goes to the platform storage (`progress` key, same JSON as the Godot build); rewarded/interstitial ads,
  `game_ready` and loading progress are in `PlatformSdk`.
* `Ports ... .gd` comments in the source name the Godot file a piece came from; look it up at tag `godot-final`.
