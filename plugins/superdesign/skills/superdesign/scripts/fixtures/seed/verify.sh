#!/usr/bin/env bash
# The fixture for seed.mjs — MUST 2's missing exit code.
#
# SKILL.md:225 says "take the least-probable direction that still clears the brief" and calls it
# "Unmeasurable — the probability here is the model's own estimate of its own prior."
# brand-to-system.md §"The seed axis" already enumerates six axes and says "roll one value on each
# axis and record it in the brief" — a prose instruction to a thing that cannot roll. Chimala's
# primary source (Lenny's Newsletter, 1 Sep 2026) reports the naive form failing outright: asking
# for "completely at random" produces output that "sounds random but isn't actually random", and
# "LLMs Are Bad Dice Players" (arXiv 2601.05414) measures it — 10 of 11 frontier models failed
# every distribution under independent requests, 7% median pass rate on batch generation.
#
# So the entropy comes from the OS and the choice is arithmetic, and this is what the script must
# separate:
#
#   determinism   same seed + same register -> byte-identical derivation      → exit 0
#   variance      32 seeds -> more than one movement, hue and radius          → exit 0
#   good/         a brief whose declared axes re-derive from its own seed     → exit 0
#   missing/      a brief with no SEED: line at all                           → exit 1
#   ignored/      a brief carrying a seed and contradicting three of its axes → exit 3
#   short/        a seed too short to carry entropy                           → exit 1
#   repeat/       the same (MOVEMENT, HUE, RADIUS) tuple as the last project  → exit 1
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
SEED="$HERE/../../seed.mjs"
fail=0

check () { # dir expected [extra-args...]
  local dir="$1"; local want="$2"; shift 2
  node "$SEED" --check "$HERE/$dir/DESIGN.md" "$@" >/tmp/seed-$dir.txt 2>&1; local c=$?
  if [ "$c" -eq "$want" ]; then echo "PASS  $dir exits $c"
  else echo "FAIL  $dir exits $c — expected $want"; sed 's/^/        /' /tmp/seed-$dir.txt | head -12; fail=$((fail+1)); fi
}

# 1. Determinism — the same seed must derive the same tuple every time, or --check is meaningless.
a=$(node "$SEED" --derive 0f1e2d3c4b5a69788796a5b4c3d2e1f00f1e2d3c4b5a69788796a5b4c3d2e1f0 --register conservative)
b=$(node "$SEED" --derive 0f1e2d3c4b5a69788796a5b4c3d2e1f00f1e2d3c4b5a69788796a5b4c3d2e1f0 --register conservative)
if [ "$a" = "$b" ] && [ -n "$a" ]; then echo "PASS  determinism — one seed, one derivation"
else echo "FAIL  determinism — the same seed derived two different tuples"; fail=$((fail+1)); fi

# 2. Variance — the axis that MUST 2 is about. A seed that always lands on the same movement is
#    theatre. 32 draws over the conservative register must reach at least 4 movements and 4 hues.
#
#    RADIUS IS DELIBERATELY NOT ASSERTED HERE, and the first version of this file got it wrong.
#    It demanded ≥4 distinct radii from the conservative register, and the script returned 3. The
#    script was right: all five conservative movements narrow radius to what their own row of
#    brand-to-system.md's movements table permits — Swiss 0, Bauhaus 0, Copeland 0, Editorial 0–2,
#    Japanese minimal 0–4 — so {0, 2, 4} is the whole legal space and a fourth value would be the
#    dice overruling the doctrine. The assertion contradicted the corpus, so the assertion moved.
#    What replaces it is stronger: the register must actually widen the space as it loosens.
v=$(node "$SEED" --variance 32 --register conservative --json)
mv=$(printf '%s' "$v" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);console.log(j.distinct.MOVEMENT,j.distinct.ACCENT_HUE,j.distinct.RADIUS_BASE)})')
set -- $mv
if [ "${1:-0}" -ge 4 ] && [ "${2:-0}" -ge 4 ]; then
  echo "PASS  variance — 32 conservative seeds reach $1 movements / $2 hues / $3 radii"
else echo "FAIL  variance — only $mv distinct over 32 seeds"; fail=$((fail+1)); fi

# 2b. The narrowing must be real in both directions: a looser register must reach radii the
#     conservative one cannot, or NARROW is decorative.
cr=$(printf '%s' "$v" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).distinct.RADIUS_BASE))')
nr=$(node "$SEED" --variance 32 --register expressive --json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).distinct.RADIUS_BASE))')
if [ "${nr:-0}" -gt "${cr:-0}" ]; then echo "PASS  narrowing — expressive reaches $nr radii against conservative's $cr"
else echo "FAIL  narrowing — expressive $nr radii, conservative $cr: the register does not widen the space"; fail=$((fail+1)); fi

# 3. The four briefs.
check good 0
check missing 1
check ignored 3
check short 1

# 4. The hard rule brand-to-system.md already states and nothing enforced: never ship the same
#    (MOVEMENT, ACCENT HUE, RADIUS BASE) tuple twice in a row.
check repeat 1 --against "$HERE/repeat/previous.md"

# 4b. A brand that already exists is a fact, and a fact beats the dice. Found on the first field
#     run: the conservative register drew ACCENT_HUE 300 — violet — for a Kazakh reefer operator
#     whose own logo is blue. `SEED-BRAND-HUE:` takes the hue axis out of the draw; the other five
#     still draw. It is not an escape hatch, and `brand-hue-drifted/` is the proof: the identical
#     brief with that one line removed fails on exactly that axis.
check brand-hue          0
check brand-hue-drifted  1
grep -q 'ACCENT_HUE' /tmp/seed-brand-hue-drifted.txt \
  && echo "PASS  removing the declaration puts the hue axis back in the draw, and it fails" \
  || { echo "FAIL  the drifted brief did not fail on the hue"; fail=$((fail+1)); }

# 5. The child fires from the dispatcher, which is the only place it can refuse a real build. The
#    three fixtures are otherwise gate-clean (ASSETS block, reduced-motion reset, no raw hex), so
#    gate.mjs's exit IS the seed child's count and nothing else.
#      good     0 — the brief re-derives
#      ignored  3 — three axes contradict the seed
#      missing  0 — no SEED: at all is REPORTED and not counted; every brief written before this
#                   child existed has none, and a gate is not a time machine.
gate () { # dir expected
  node "$HERE/../../gate.mjs" "$HERE/$1/src" >/tmp/seed-gate-$1.txt 2>&1; local c=$?
  if [ "$c" -eq "$2" ]; then echo "PASS  gate on $1 exits $c"
  else echo "FAIL  gate on $1 exits $c — expected $2"; grep -i 'seed\|violation' /tmp/seed-gate-$1.txt | sed 's/^/        /' | head -8; fail=$((fail+1)); fi
}
gate good 0
gate ignored 3
gate missing 0
grep -q 'no SEED: line' /tmp/seed-gate-missing.txt \
  && echo "PASS  gate names the absent seed instead of passing over it" \
  || { echo "FAIL  gate said nothing about the missing seed"; fail=$((fail+1)); }

[ "$fail" -eq 0 ] && echo "✓ the seed is external, the derivation is arithmetic, and a brief that ignores it is refused" || echo "✗ $fail checks failed"
exit "$fail"
