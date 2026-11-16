#!/bin/sh
# Runs the Windows build at a window size and saves a screenshot (DevArgs.cs lists the hooks):
#   sh scripts/shot.sh out.png 540 960 -fresh -scene Game -level 0 -tut 1 -shotAt 2500
OUT="$1"; W="${2:-540}"; H="${3:-960}"; shift 3
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
"$ROOT/Builds/Windows/CozyBlocks.exe" -screen-fullscreen 0 -screen-width "$W" -screen-height "$H" -shot "$(cygpath -w "$OUT")" -quitAfterShot -logFile "$(cygpath -w "$ROOT/Logs/player.log")" "$@"
grep -iE "exception|error" "$ROOT/Logs/player.log" | head -20
