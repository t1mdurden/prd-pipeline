#!/usr/bin/env bash
# The negative control for design-audit's mobile-overflow check.
#
# Document-level horizontal overflow at 390px is the one thing SKILL.md calls "a critical failure"
# by name (Phase 5), and nothing checked it until 2026-09-16 — design-audit opened one viewport.
# The corpus sweep: six known-good pages score 0px, `slopped-geometry.html` scores 12px, and this
# fixture scores 402px. Good and slop do separate; this page exists so a regression cannot hide in
# a 12px margin — it is a three-column grid at `min-width: 768px` with no mobile rule, the common
# cause, failing by two orders of magnitude.
#
# Usage: verify.sh <url-of-this-fixture> <url-of-a-clean-page>
#   e.g. verify.sh http://127.0.0.1:8803/overflow-390/overflows.html http://127.0.0.1:8801/
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
AUDIT="$HERE/../../design-audit.mjs"
BAD="${1:-}"; GOOD="${2:-}"
if [ -z "$BAD" ] || [ -z "$GOOD" ]; then
  echo "usage: verify.sh <url-that-overflows> <url-that-does-not>"; exit 64
fi
fail=0
node "$AUDIT" --url "$BAD"  --theme light >/tmp/of-bad.txt  2>&1; bad_code=$?
node "$AUDIT" --url "$GOOD" --theme light >/tmp/of-good.txt 2>&1; good_code=$?

# A fixture that greps for a line and finds nothing cannot tell "the check passed" from "the check
# never ran" — the exact failure class every bug in the 2026-08-25 rebuild belonged to. The
# exit-code contract already separates them: 64-79 is a harness error, and this script must say so
# rather than report two confident FAILs. Seen 2026-09-22 running the suite with cwd=$HOME, where
# @axe-core/playwright is not resolvable and design-audit exits 65.
for c in "$bad_code" "$good_code"; do
  if [ "$c" -ge 64 ] && [ "$c" -le 79 ]; then
    echo "SKIP  design-audit could not run (exit $c — harness, not a violation). This fixture proves"
    echo "      nothing until it can. Run it from a directory where playwright and @axe-core/playwright"
    echo "      resolve — the superdesign repo root does."
    head -4 /tmp/of-bad.txt | sed 's/^/      /'
    exit 65
  fi
done

if grep -q '\[FAIL\] mobileOverflow' /tmp/of-bad.txt; then echo "PASS  the control page FAILS mobileOverflow"
else echo "FAIL  the control page did not fail mobileOverflow"; grep -i 'overflow' /tmp/of-bad.txt | sed 's/^/        /'; fail=$((fail+1)); fi

if grep -q '\[PASS\] mobileOverflow' /tmp/of-good.txt; then echo "PASS  the clean page PASSES mobileOverflow"
else echo "FAIL  the clean page did not pass mobileOverflow"; grep -i 'overflow' /tmp/of-good.txt | sed 's/^/        /'; fail=$((fail+1)); fi

[ "$fail" -eq 0 ] && echo "✓ the mobile-overflow check fires on the control and only on the control" || echo "✗ $fail of 2"
exit "$fail"
