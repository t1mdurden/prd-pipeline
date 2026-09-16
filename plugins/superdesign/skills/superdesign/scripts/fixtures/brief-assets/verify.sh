#!/usr/bin/env bash
# The fixture for gate.mjs's brief-assets child (F14).
#
# The fastway field run shipped five client logos as uppercase TEXT because the brief has fifteen
# fields and not one of them obliges Phase 1 to ask for the files the business already owns
# (`thermo.ts:196-201`, `logo: null`). This child makes the asking mechanical: an ASSETS block must
# exist, and every row must name a file that is on disk or say UNAVAILABLE with the date it was asked.
#
#   good/        a real path + an honest dated UNAVAILABLE  → exit 0
#   missing/     no ASSETS block at all                     → exit 1
#   unresolved/  a path not on disk + an undated UNAVAILABLE → exit 2
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
GATE="$HERE/../../gate.mjs"
fail=0
check () { # name expected
  node "$GATE" "$HERE/$1/src" >/tmp/ba-$1.txt 2>&1; local c=$?
  if [ "$c" -eq "$2" ]; then echo "PASS  $1 exits $c"
  else echo "FAIL  $1 exits $c — expected $2"; grep -i 'brief-assets\|ASSETS' /tmp/ba-$1.txt | sed 's/^/        /'; fail=$((fail+1)); fi
}
check good 0
check missing 1
check unresolved 2
[ "$fail" -eq 0 ] && echo "✓ the brief-assets child separates a settled brief from an unsettled one" || echo "✗ $fail of 3"
exit "$fail"
