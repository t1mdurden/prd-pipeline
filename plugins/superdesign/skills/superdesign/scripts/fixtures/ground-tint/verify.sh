#!/usr/bin/env bash
# The separation fixture for `extract-reference.mjs --check-ours`.
#
# Two reference cards of the SAME business, labelled by the owner himself, not by us:
#   rejected.json — fastway/site measured 2026-09-08. He rejected this colour six times in three
#                   days: «мне не нравится вообще цвет», «ЧТО ЗА ХУЙНЯ ПОЧЕМУ РАДУГА»,
#                   «все равно плохо, цветов нету… цвет надо менять».
#   accepted.json — the build he calls ideal, measured with the same extractor on 2026-09-16.
#
# A cap that cannot tell these two apart is not a cap. Run this before moving any number.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
SCRIPT="$HERE/../../extract-reference.mjs"
fail=0

node "$SCRIPT" --check-ours "$HERE/rejected.json" >/tmp/gt-rejected.txt 2>&1; r=$?
node "$SCRIPT" --check-ours "$HERE/accepted.json" >/tmp/gt-accepted.txt 2>&1; a=$?

if [ "$r" -ge 1 ] && [ "$r" -le 63 ]; then echo "PASS  rejected.json exits $r (violation)"
else echo "FAIL  rejected.json exits $r — expected 1–63"; sed 's/^/        /' /tmp/gt-rejected.txt; fail=$((fail+1)); fi

if [ "$a" -eq 0 ]; then echo "PASS  accepted.json exits 0 (clean)"
else echo "FAIL  accepted.json exits $a — expected 0"; sed 's/^/        /' /tmp/gt-accepted.txt; fail=$((fail+1)); fi

[ "$fail" -eq 0 ] && echo "✓ the cap separates the owner's reject from the owner's accept" || echo "✗ $fail of 2"
exit "$fail"
