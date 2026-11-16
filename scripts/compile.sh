#!/bin/sh
# Opens the project in the batch-mode editor (imports and compiles) and prints C# errors; exit 1 when there are any.
# Needs an activated Unity licence; scripts/check.sh compiles without one.
U="${UNITY_EXE:-/c/Program Files/Unity/Hub/Editor/6000.6.9f1/Editor/Unity.exe}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG="$ROOT/Logs/batch_compile.log"
"$U" -batchmode -quit -nographics -projectPath "$(cygpath -w "$ROOT")" -logFile "$(cygpath -w "$LOG")" "$@"
code=$?
grep -E "error CS|warning CS[0-9]+: .*(unreachable|never used)" "$LOG" | sort -u | head -80
grep -q "error CS" "$LOG" && exit 1
echo "unity exit $code"
exit $code
