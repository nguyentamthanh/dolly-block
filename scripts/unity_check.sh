#!/bin/sh
# Licence-free checks (no Unity editor start):
#   1. compiles Assets/Scripts for Windows, WebGL, Android and the Editor scripts against the installed Unity DLLs
#   2. npm test: the C# Core + audio still give exactly what players got (levels, RNG, sounds, music, texts)
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
fail=0
for p in Windows WebGL Android Editor; do
  out=$(dotnet build "$ROOT/unity/Tests/CompileCheck" -p:Platform=$p --nologo -v q 2>&1)
  if echo "$out" | grep -q " error "; then
    echo "[$p] FAILED"; echo "$out" | grep " error " | sort -u | head -30; fail=1
  else
    echo "[$p] compiles"
  fi
done
(cd "$ROOT" && node scripts/unity_test.mjs) || fail=1
exit $fail
