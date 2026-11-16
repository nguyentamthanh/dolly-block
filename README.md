# Cozy Blocks

A calm polyomino puzzle where every block has feelings about colours: place the googly-eyed pieces so that
everyone is happy at once. Built with **Unity 6 (6000.6.9f1)** for the web (Playgama, YouTube Playables, CrazyGames
through the Playgama Bridge), with Windows and Android builds from the same code.

History: the game was first written in Godot (tag `godot-final`), then ported to Phaser 4 + TypeScript (tag
`phaser-final`), then to Unity. Levels, sounds, texts and saves are bit-identical to the Phaser build, so players keep
their progress.

## Commands

Unity work needs an activated Unity licence (Unity Hub > Preferences > Licenses). The checks marked *no licence* only
need the .NET SDK and Node.

```bash
npm install                         # Node tooling only (packaging, fonts, smoke test)
npm run check                       # no licence: compile for Windows/WebGL/Android/Editor + npm test
npm test                            # no licence: C# Core/audio regression (150 levels, RNG, every sound, music, texts)
npm run build:web                   # WebGL release build -> unity/Builds/WebGL
npm run package:web                 # cozy-blocks-unity-<version>.zip for Playgama (VERSION env overrides)
npm run smoke:web                   # headless Chrome on a phone-sized touch screen: boot, play level 1, save, reload, pause
npm run serve:web                   # http://localhost:5182 serving the WebGL build
npm run build:windows               # Development build (screenshots, DevArgs)
npm run build:android               # release APK (sh scripts/unity_build.sh AndroidBundle for an .aab)
npm run fonts                       # regenerate the pinned Fredoka weights from assets-src/fonts
sh scripts/unity_compile.sh         # batch-mode compile in the real editor, prints C# errors
sh scripts/unity_shot.sh out.png 540 960 -fresh -scene game -level 0 -tut 1 -shotAt 2500
```

`scripts/unity_build.sh <Target> [-release|-development]` overrides the default build kind. After an intended change to
levels, sounds or texts, accept the new output with `npm test -- --update`; bump `LevelGenerator.VERSION` whenever the
generator changes (saved runs are tied to it).

Windows player command-line hooks (`DevArgs.cs`): `-scene MainMenu|Timeline|Game`, `-level N`, `-cur N`, `-hi N`,
`-tut 0|1`, `-gems N`, `-lang xx`, `-stars`, `-fresh`, `-shot path -shotAt ms -quitAfterShot`, `-autoHint ms`,
`-autoDrag ms`, `-go Scene -goAt ms`, `-fixedStep ms`, `-perf`.

## Project layout

Everything is built from code at start-up: the only scene is an empty `Main.unity` that `BuildTools.Setup` creates.

```
unity/Assets/Scripts/
  GameHost.cs   entry point and main loop: platform, saved progress, fonts, then the scenes
  DevArgs.cs    command-line test hooks
  Core/         pure game logic: Rng (Godot PCG32), GodotSort, PieceData, BoardState, Solver, LevelGenerator,
                LevelData, GameState (JSON save), Loc + LocTexts (all texts: en, ru, es, pt, de, fr, tr)
  Render/       Canvas2D.cs: a software Canvas 2D (exact-area anti-aliasing, strokes, gradients); TtfFont.cs reads glyph
                outlines and GPOS kerning; Art (all procedural art), CanvasItem, Fonts, PolyShape, Viewport
  Engine/       display tree (GameObj, Container, RectObj, ImageObj, CanvasView, Graphics2D), scenes, pointer input,
                Godot-style tweens, GPU renderer (premultiplied quads in Camera.onPostRender)
  Scenes/       MainMenu, Timeline, Game, Transition (circle wipe, as a shader)
  Objects/      play screen: BoardView, PieceView, TrayView, DragController, DragGuide, RotateGuide, Hud
  UI/ Fx/       widgets, panels, tutorial, language picker; particles and screen effects
  Audio/        procedural sound effects and music rendered into AudioClips at start-up (no audio files)
  Platform/     PlatformSdk (+ PlatformBridgeReceiver)
  Editor/       BuildTools: project settings and the batch build entry points
unity/Assets/Plugins/WebGL/CozyBridge.jslib     glue to the Playgama Bridge
unity/Assets/WebGLTemplates/CozyBlocks/         the web page + playgama-bridge.js, its config, favicon
unity/Assets/Resources/                         fonts and menu art (.bytes), shaders
unity/Tests/Parity/       .NET console app running Core + audio without Unity; golden.json holds the expected hashes
unity/Tests/CompileCheck/ compiles Assets/Scripts against the editor's DLLs per platform, without a licence
assets-src/               source fonts and art (fonts are pinned into Resources by npm run fonts)
promo/, music-preview.mp3 store trailer and music preview
scripts/                  build, packaging, tests, static server, smoke test
```

The layout works in a logical space of 720 x 1280 expanded to the window's aspect (`Render/Viewport.cs`); canvases are
painted at device resolution. Per-frame full-screen canvas paints are too slow on the CPU: use a shader for those.

## Platforms

`Platform/PlatformSdk.cs` is the only place game code talks to a host.

* **WebGL** (one zip for Playgama, YouTube Playables and CrazyGames): the page loads `playgama-bridge.js` with a plain
  `<script>` tag (never a CDN or a dynamic script: YouTube forbids both), initialises it (6 s timeout) before Unity
  starts and drives the Bridge loading bar (download 0-49, the game 50 and 100). Progress goes only through
  `bridge.storage` (`progress` key, the JSON the Phaser and Godot builds used; the game waits up to 5 s for it).
  The platform's audio/pause events, ads and a hidden page mute and freeze the game. `GAME_READY`,
  `GAMEPLAY_STARTED` and `GAMEPLAY_STOPPED` are sent; the language comes from `platform.language`; YouTube hides the
  sound button. No IndexedDB asset cache, gzip with a JS decompression fallback (Playgama 5.1.1), backing store capped
  at 2x the CSS size. Analytics are off on `platforms.youtube` in `playgama-bridge-config.json`.
* **Windows / Android**: progress in PlayerPrefs, no ads (interstitials skipped, rewarded only in development builds).
  Android: `com.cozyblocks.game`, IL2CPP ARM64 + ARMv7, API 24+, portrait, kept out of notches, Back closes the top
  dialog and leaves the app from the home screen. Release signing needs your keystore (Player Settings > Publishing).
* **iOS**: Unity on Windows can only export the Xcode project; building, signing and TestFlight need macOS + Xcode.

Known moderation risks on Playgama: the sounds are synthesised in code (3.3.2 asks for ogg/mp3), Esc closes dialogs
(1.5.2), and Unity's own file system creates an `/idbfs` IndexedDB database at start-up (the game never saves there).
