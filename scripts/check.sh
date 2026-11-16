#!/bin/sh
# Checks that need no Unity licence (the editor is never started):
#   1. compiles Assets/Scripts for Windows, WebGL, Android and the Editor scripts against the installed editor's DLLs
#   2. scripts/test.mjs: the game logic and audio still produce exactly the golden output
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
fail=0
for p in Windows WebGL Android Editor; do
  out=$(dotnet build "$ROOT/Tests/CompileCheck" -p:Platform=$p --nologo -v q 2>&1)
  if echo "$out" | grep -q " error "; then
    echo "[$p] FAILED"; echo "$out" | grep " error " | sort -u | head -30; fail=1
  else
    echo "[$p] compiles"
  fi
done
(cd "$ROOT" && node scripts/test.mjs) || fail=1
exit $fail
