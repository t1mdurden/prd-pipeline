#!/usr/bin/env bash
# Every script's fixture suite, plus every path SKILL.md and the references name. Exit = failing suites.
set -u
H="$(cd "$(dirname "$0")" && pwd)"; R="$H/.."; bad=0
for s in "$H"/fixtures/*/verify.sh; do n="$(basename "$(dirname "$s")")"
  if bash "$s" > "/tmp/sd-verify-$n.txt" 2>&1; then echo "✓ $n"; else echo "✗ $n — /tmp/sd-verify-$n.txt"; bad=$((bad+1)); fi; done
miss=0
for p in $(grep -ohE '\((references/[a-z-]+\.md)\)|\$SD/[a-z-]+\.mjs' "$R/SKILL.md" "$R"/references/*.md | sed -E 's/[()]//g; s#\$SD/#scripts/#' | sort -u); do
  [ -f "$R/$p" ] || { echo "✗ pointer to missing $p"; miss=$((miss+1)); }; done
[ "$miss" -eq 0 ] && echo "✓ pointers" || bad=$((bad+1))
exit "$bad"
