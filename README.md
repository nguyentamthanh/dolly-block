# Cozy Blocks

A calm polyomino puzzle where every block has feelings about colours: place the googly-eyed pieces so that
everyone is happy at once. A **Unity 6 (6000.6.9f1)** project for the web (Playgama, YouTube Playables and CrazyGames
through the Playgama Bridge), with Windows and Android builds from the same code.

Open this folder in Unity Hub (Add > Add project from disk). Earlier versions of the game live in git history:
`godot-final` (Godot) and `phaser-final` (Phaser 4 + TypeScript). Levels, sounds, texts and the save format are
unchanged since then, so players keep their progress.

## Commands

Building needs an activated Unity licence (Unity Hub > Preferences > Licenses). `npm run check` and `npm test` only
need the .NET SDK and Node.

```bash
npm install                 # Node tooling only (packaging, fonts, smoke test)
npm run check               # no licence: compile for Windows/WebGL/Android/Editor, then npm test
npm test                    # no licence: game logic + audio vs Tests/Parity/golden.json
npm run build:web           # WebGL release build -> Builds/WebGL
npm run package:web         # cozy-blocks-<version>.zip for Playgama (VERSION env overrides package.json)
npm run smoke:web           # headless Chrome, phone-sized touch screen: boot, play level 1, save, reload, pause
npm run serve:web           # http://localhost:5182 serving Builds/WebGL
npm run build:windows       # Development build (screenshots, DevArgs)
npm run build:android       # release APK (sh scripts/build.sh AndroidBundle for an .aab)
npm run compile             # open the project in the batch-mode editor and print C# errors
npm run shot -- out.png 540 960 -fresh -scene Game -level 0 -tut 1 -shotAt 2500
npm run fonts               # pin the Fredoka weights from assets-src/fonts into Assets/Resources/Fonts
```

`sh scripts/build.sh <Windows|WebGL|Android|AndroidBundle> [-release|-development]` overrides the default build kind.
`npm test` hashes the first 150 levels, the RNG, every sound effect, the music and all texts: after an intended change
accept it with `npm test -- --update`, and bump `LevelGenerator.VERSION` whenever the generator changes (saved runs are
tied to it).

Windows player hooks (`Assets/Scripts/DevArgs.cs`): `-scene MainMenu|Timeline|Game`, `-level N`, `-cur N`, `-hi N`,
`-tut 0|1`, `-gems N`, `-lang xx`, `-stars`, `-fresh`, `-shot path -shotAt ms -quitAfterShot`, `-autoHint ms`,
`-autoDrag ms`, `-go Scene -goAt ms`, `-fixedStep ms`, `-perf`.

## Project layout

Everything is built from code at start-up; the only scene is an empty `Assets/Scenes/Main.unity`.

```
Assets/Scripts/
  GameHost.cs   entry point and main loop: platform, saved progress, fonts, then the scenes
  DevArgs.cs    command-line test hooks
  Core/         pure game logic: Rng (Godot's PCG32), GodotSort, PieceData, BoardState, Solver, LevelGenerator,
                LevelData, GameState (JSON save), Loc + LocTexts (en, ru, es, pt, de, fr, tr)
  Render/       Canvas2D (software Canvas 2D: anti-aliased paths, strokes, gradients), TtfFont (glyph outlines,
                kerning), Art (all procedural art), CanvasItem, Fonts, PolyShape, Viewport
  Engine/       display tree (GameObj, Container, RectObj, ImageObj, CanvasView, Graphics2D), scenes, pointer input,
                tweens, GPU renderer (premultiplied quads in Camera.onPostRender)
  Scenes/       MainMenu, Timeline, Game, Transition (circle wipe, as a shader)
  Objects/      play screen: BoardView, PieceView, TrayView, DragController, DragGuide, RotateGuide, Hud
  UI/ Fx/       widgets, panels, tutorial, language picker; particles and screen effects
  Audio/        sound effects and music synthesised into AudioClips at start-up (no audio files)
  Platform/     PlatformSdk + PlatformBridgeReceiver
  Editor/       BuildTools: project settings and the batch build entry points
Assets/Plugins/WebGL/CozyBridge.jslib   glue to the Playgama Bridge
Assets/WebGLTemplates/CozyBlocks/       the web page, playgama-bridge.js, its config, favicon
Assets/Resources/                       fonts and menu art (.bytes), shaders
Tests/Parity/        .NET console app running Core + audio without Unity; golden.json holds the expected hashes
Tests/CompileCheck/  compiles Assets/Scripts against the editor's DLLs per platform, without a licence
assets-src/          source fonts and art
promo/, music-preview.mp3   store trailer and music preview
scripts/             build, packaging, tests, static server, smoke test
```

The layout works in a logical space of 720 x 1280 expanded to the window's aspect (`Render/Viewport.cs`); canvases are
painted at device resolution. Full-screen canvas paints every frame are too slow on the CPU: use a shader for those.

## Platforms

`Platform/PlatformSdk.cs` is the only place game code talks to a host.

* **WebGL** (one zip for Playgama, YouTube Playables and CrazyGames): the page loads `playgama-bridge.js` with a plain
  `<script>` tag (never a CDN or a dynamic script: YouTube forbids both), initialises it (6 s timeout) before Unity
  starts and drives the Bridge loading bar (download 0-49, the game 50 and 100). Progress goes only through
  `bridge.storage` (`progress` key; the game waits up to 5 s for it). The platform's audio/pause events, ads and a hidden
  page mute and freeze the game. `GAME_READY`, `GAMEPLAY_STARTED` and `GAMEPLAY_STOPPED` are sent; the language comes
  from `platform.language`; YouTube hides the sound button. No IndexedDB asset cache, gzip with a JS decompression
  fallback (Playgama 5.1.1), backing store capped at 2x the CSS size. Analytics are off on `platforms.youtube` in
  `playgama-bridge-config.json`.
* **Windows / Android**: progress in PlayerPrefs, no ads (interstitials skipped, rewarded only in development builds).
  Android: `com.cozyblocks.game`, IL2CPP ARM64 + ARMv7, API 24+, portrait, kept out of notches, Back closes the top
  dialog and leaves the app from the home screen. Release signing needs your keystore (Player Settings > Publishing).
* **iOS**: Unity on Windows can only export the Xcode project; building, signing and TestFlight need macOS + Xcode.

Known moderation risks on Playgama: the sounds are synthesised in code (3.3.2 asks for ogg/mp3), Esc closes dialogs
(1.5.2), and Unity's own file system creates an `/idbfs` IndexedDB database at start-up (the game never saves there).
