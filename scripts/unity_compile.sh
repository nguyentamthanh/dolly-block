#!/bin/sh
# Compile the Unity port in batch mode and print C# errors (exit 1 when there are any).
U="/c/Program Files/Unity/Hub/Editor/6000.6.9f1/Editor/Unity.exe"
LOG="$(cd "$(dirname "$0")/.." && pwd)/unity/Logs/batch_compile.log"
"$U" -batchmode -quit -nographics -projectPath "$(cd "$(dirname "$0")/.." && pwd -W)/unity" -logFile "$(cygpath -w "$LOG" 2>/dev/null || echo "$LOG")" "$@"
code=$?
grep -E "error CS|warning CS[0-9]+: .*(unreachable|never used)" "$LOG" | sort -u | head -80
grep -q "error CS" "$LOG" && exit 1
echo "unity exit $code"
exit $code
