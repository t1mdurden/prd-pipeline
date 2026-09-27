#!/usr/bin/env bash
# check.mjs must say clean on a clean page, name every defect class on a broken one, and never let
# a crash look like a result. Run from anywhere; needs playwright + axe-core resolvable.
set -u
H="$(cd "$(dirname "$0")" && pwd)"; S="$H/../../check.mjs"; T="$(mktemp -d)"; fail=0
ok() { echo "PASS  $1"; }; no() { echo "FAIL  $1"; fail=$((fail+1)); }

node "$S" "file://$H/clean.html" --brief "$H/clean.md" --out "$T/c" > "$T/clean.txt" 2>&1; c=$?
if [ "$c" -eq 69 ]; then echo "BLOCKED  playwright/axe-core not resolvable from $PWD — run from a project that has them"; cat "$T/clean.txt"; exit 2; fi
[ "$c" -eq 0 ] && ok "clean page exits 0" || { no "clean page exits $c"; cat "$T/clean.txt"; }

node "$S" "file://$H/broken.html" --brief "$H/broken.md" --out "$T/b" > "$T/broken.txt" 2>&1; b=$?
[ "$b" -ge 1 ] && [ "$b" -le 63 ] && ok "broken page exits $b (defects)" || no "broken page exits $b — expected 1–63"
for cls in runtime: void: overflow: leftovers: axe: hero: form: ground:; do
  grep -q "$cls" "$T/broken.txt" && ok "broken page reports $cls" || no "broken page does not report $cls"
done

node "$S" "http://127.0.0.1:9/" > "$T/dead.txt" 2>&1; d=$?
[ "$d" -eq 67 ] && ok "unreachable page exits 67, not clean" || no "unreachable page exits $d"

node "$S" --ground-card "$H/../ground-tint/rejected.json" > /dev/null; r=$?
node "$S" --ground-card "$H/../ground-tint/accepted.json" > /dev/null; a=$?
[ "$r" -eq 1 ] && ok "ground cap fails the owner-rejected card" || no "rejected card exits $r"
[ "$a" -eq 0 ] && ok "ground cap passes the owner-accepted card" || no "accepted card exits $a"

[ "$fail" -eq 0 ] && echo "✓ check.mjs: all green" || echo "✗ check.mjs: $fail failing"
exit "$fail"
