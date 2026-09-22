#!/usr/bin/env bash
# The fixture for critic.mjs — the blind screenshot critic as a protocol rather than a score.
#
# Every JSON under this directory is a REAL verdict, written by a blind opus subagent on
# 2026-09-22 that was given one or two PNGs and no other file. Nothing here is hand-authored to
# make a test pass; the fixtures are the measurement, kept.
#
#   agree-win/       the desktop pair, ours = the build the owner ACCEPTED   → exit 0
#   agree-loss/      the same two verdicts, ours = the build he REJECTED     → exit 1
#   order-split/     the real mobile pair, which picked position A twice     → exit 1 (discarded)
#   rubric-accepted/ three blind runs over the accepted build, 16/17/18      → exit 0
#   rubric-rejected/ three blind runs over the rejected build, 13/14/14      → exit 1
#
# The last two are the calibration: the floor is 15 because the labelled sides do not overlap and
# 15 is the gap. Read `critic.mjs`'s header for why the score itself is never a /10.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
C="$HERE/../../critic.mjs"
fail=0

check () { # mode dir expected
  node "$C" "--$1" "$HERE/$2" >/tmp/critic-$2.txt 2>&1; local c=$?
  if [ "$c" -eq "$3" ]; then echo "PASS  --$1 $2 exits $c"
  else echo "FAIL  --$1 $2 exits $c — expected $3"; sed 's/^/        /' /tmp/critic-$2.txt | head -10; fail=$((fail+1)); fi
}

check verdict agree-win   0
check verdict agree-loss  1
check verdict order-split 1
check rubric  rubric-accepted 0
check rubric  rubric-rejected 1

# The separation, stated as the numbers rather than as a pass: the floor must sit strictly between
# the two labelled sides, or it is a threshold somebody liked rather than one the data placed.
acc=$(grep -o 'criteria held: [0-9, ]*' /tmp/critic-rubric-accepted.txt | head -1)
rej=$(grep -o 'criteria held: [0-9, ]*' /tmp/critic-rubric-rejected.txt | head -1)
echo "      accepted $acc"
echo "      rejected $rej"
lo_acc=$(printf '%s' "$acc" | grep -oE '[0-9]+' | sort -n | head -1)
hi_rej=$(printf '%s' "$rej" | grep -oE '[0-9]+' | sort -n | tail -1)
if [ "${lo_acc:-0}" -gt "${hi_rej:-99}" ]; then echo "PASS  no overlap — worst accepted $lo_acc > best rejected $hi_rej"
else echo "FAIL  the labelled sides overlap: worst accepted $lo_acc, best rejected $hi_rej — no floor is legal here"; fail=$((fail+1)); fi

# A single blind run spreads ±2 on this rubric, so one run may not decide anything.
mkdir -p /tmp/critic-one && cp "$HERE/rubric-accepted/run-1.json" /tmp/critic-one/
node "$C" --rubric /tmp/critic-one >/tmp/critic-one.txt 2>&1
[ $? -eq 67 ] && echo "PASS  one run is refused as a verdict (exit 67)" || { echo "FAIL  a single run was accepted as a verdict"; fail=$((fail+1)); }

# Two images, never a gallery.
node "$C" --prompts --ours "$HERE/agree-win/manifest.json" --against "$HERE/agree-win/manifest.json" --out /tmp/critic-prompts >/dev/null 2>&1
[ $? -eq 67 ] && echo "PASS  --prompts refuses a path that is not an image on disk" || { echo "FAIL  --prompts accepted a non-image"; fail=$((fail+1)); }

[ "$fail" -eq 0 ] && echo "✓ the swap check discards what it cannot trust, and the floor sits in the labelled gap" || echo "✗ $fail checks failed"
exit "$fail"
