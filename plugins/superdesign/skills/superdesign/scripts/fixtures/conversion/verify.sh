#!/usr/bin/env bash
# The fixture for gate.mjs's brief-conversion child.
#
# The fastway build shipped a lead-generation landing page with zero input fields —
# `grep -c '<form\|<input\|<select\|<textarea' Landing.tsx` = 0 — while `cookbook/forms.md` sat
# unread on disk. The build the owner accepted carries seven. On 2026-09-22 a blind screenshot
# critic scored both builds three times each on twenty binary criteria, and "there is at least one
# thing the visitor can fill in or choose on the page itself" was one of only three criteria that
# separated them perfectly: 3/3 against 0/3.
#
# It is NOT a blanket rule, because four of the five pages in `examples/` carry zero form controls
# and are not wrong to. It is brief-versus-build: Phase 1 says how the surface converts, and the
# build has to match.
#
#   declared-and-built/    CONVERSION: form  + a real <form>   → exit 0
#   declared-and-missing/  CONVERSION: form  + a WhatsApp link → exit 1   ← the fastway defect
#   declared-call/         CONVERSION: call  + a WhatsApp link → exit 0   ← a legitimate answer
#   undeclared/            no CONVERSION: row at all           → exit 1
#   evade-{comment,string,css}/  a `<form` that is not a form  → exit 1
#
# Every fixture is otherwise gate-clean — seed, ASSETS block, reduced-motion reset — so the
# dispatcher's exit IS this child's count.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
GATE="$HERE/../../gate.mjs"
fail=0
check () { # dir expected
  node "$GATE" "$HERE/$1/src" >/tmp/cv-$1.txt 2>&1; local c=$?
  if [ "$c" -eq "$2" ]; then echo "PASS  $1 exits $c"
  else echo "FAIL  $1 exits $c — expected $2"; grep -A3 -i 'conversion' /tmp/cv-$1.txt | sed 's/^/        /' | head -8; fail=$((fail+1)); fi
}
check declared-and-built   0
check declared-and-missing 1
check declared-call        0
check undeclared           1

# The three evasions a verifier reproduced on 2026-09-22 against the first version of this child,
# which matched a bare /<(form|input|select|textarea)\b/ over every file in SOURCE_EXT:
#   a `<form` inside a `// TODO` comment      → passed
#   a `<form` inside a string literal         → passed
#   a `<form` inside a CSS comment            → passed, and `.css` cannot hold a JSX control at all
# Now: markup files only, comments and string literals stripped first, and the tag has to look
# like a tag rather than like the word.
check evade-comment        1
check evade-string         1
check evade-css            1

grep -q 'no form control' /tmp/cv-declared-and-missing.txt \
  && echo "PASS  the failure names the gap between the brief and the tree" \
  || { echo "FAIL  the failure did not say what was missing"; fail=$((fail+1)); }

[ "$fail" -eq 0 ] && echo "✓ a surface that says it converts through a form has to contain one" || echo "✗ $fail checks failed"
exit "$fail"
