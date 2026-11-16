#!/bin/sh
# Batch build: sh scripts/build.sh [Windows|WebGL|Android|AndroidBundle] [-release|-development]
# Windows defaults to a Development build (screenshots, DevArgs); WebGL and Android to release builds.
# Needs an activated Unity licence. Output in Builds/<Target>, log in Logs/batch_build.log.
T="${1:-Windows}"
[ $# -gt 0 ] && shift
U="${UNITY_EXE:-/c/Program Files/Unity/Hub/Editor/6000.6.9f1/Editor/Unity.exe}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG="$ROOT/Logs/batch_build.log"
"$U" -batchmode -quit -nographics -projectPath "$(cygpath -w "$ROOT")" -executeMethod "CozyBlocks.EditorTools.BuildTools.Build$T" -logFile "$(cygpath -w "$LOG")" "$@"
code=$?
grep -E "error CS|\[build\]|Error building|BuildFailed|No valid Unity Editor license" "$LOG" | sort -u | head -40
exit $code
