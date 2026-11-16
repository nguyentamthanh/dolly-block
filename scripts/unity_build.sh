#!/bin/sh
# Build the Unity port: sh scripts/unity_build.sh [Windows|WebGL|Android|AndroidBundle] [-release|-development]
# Windows defaults to a Development build (screenshots); WebGL and Android default to release builds.
T="${1:-Windows}"
[ $# -gt 0 ] && shift
U="/c/Program Files/Unity/Hub/Editor/6000.6.9f1/Editor/Unity.exe"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG="$ROOT/unity/Logs/batch_build.log"
"$U" -batchmode -quit -nographics -projectPath "$(cygpath -w "$ROOT/unity")" -executeMethod "CozyBlocks.EditorTools.BuildTools.Build$T" -logFile "$(cygpath -w "$LOG")" "$@"
code=$?
grep -E "error CS|\[build\]|Error building|BuildFailed|No valid Unity Editor license" "$LOG" | sort -u | head -40
exit $code
