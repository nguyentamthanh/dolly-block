#!/bin/sh
# Run the Windows build at a window size and save a screenshot: sh scripts/unity_shot.sh out.png 540 960 [extra args]
OUT="$1"; W="${2:-540}"; H="${3:-960}"; shift 3
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
"$ROOT/unity/Builds/Windows/CozyBlocks.exe" -screen-fullscreen 0 -screen-width "$W" -screen-height "$H" -shot "$(cygpath -w "$OUT")" -quitAfterShot -logFile "$(cygpath -w "$ROOT/unity/Logs/player.log")" "$@"
grep -iE "exception|error" "$ROOT/unity/Logs/player.log" | head -20
