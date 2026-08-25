#!/usr/bin/env bash
# anti-slop-gate — the automatable half of the superdesign Phase-4 gate.
#
# THE RULES ARE DATA. Every detector below is read at run time from
# `data/anti-slop-rules.json`, which is the single source of truth for the machine-checkable
# half of the catalog. `references/anti-slop.md` used to CLAIM that role and never held it —
# the detectors were hardcoded greps in this file, so retuning one was a two-place edit and the
# two places drifted. The prose file keeps the catalog, the reasoning, the class D/S/P rules and
# the judge-only lens; the patterns live in JSON and this script executes them.
# A failure prints the rule `id` and its `failureMode`, so a caller never has to open 81 kB
# of prose to find out what a red line means.
#
# THIS GATE IS TARGET-SCOPED (field-run F4). It walks the whole tree under <dir> once. Calling
# it once per file re-reports every tree-level rule once per file: on the dkuvpn run that
# turned 1 real tell into 25, 24 of them artifacts of the caller's loop. Call it ONCE over the
# directory, or let `gate.mjs` call it — that is what the dispatcher is for.
#
# Judge-only tells (mouse-only, missing states, decorative-color-over-hierarchy,
# one-fixed-density, animated ⌘K) can't be grepped — run `--lens` to print that checklist.
# Colour and spring physics are not greppable either: any stylesheet in the target that declares
# chart slots or spring easings is handed to validate-chart-palette.mjs and
# spring-tokens.mjs --check, whose exit codes fold into this one.
# Geometry needs a rendered page: that is design-audit.mjs, run separately.
#
# Usage:
#   anti-slop-gate.sh <dir-or-file>              # exit 0 = clean, non-zero = tells found
#   anti-slop-gate.sh --lens <dir>               # also print the judge-only lens checklist
#   anti-slop-gate.sh --exclude <ERE> <dir>      # drop paths matching ERE from the file set
#                                                # (gate.mjs passes the ONE resolved exclusion
#                                                #  set here, so both halves of the Phase-4 gate
#                                                #  agree on `ui/` — field-run F7)
#
# EXIT-CODE CONTRACT — identical in every superdesign gate (ARCHITECTURE.md §2):
#   0        clean
#   1-63     the number of violations. A count above 63 is clamped to 63 and the line says so.
#   64-79    harness error - 64 usage . 65 missing dep . 66 navigation failed . 67 no target
# Here a violation is one distinct HARD rule that fired. `note` rules are printed and never
# counted - they are investigate-not-fail signals (class P, which may not block a ship).
set -uo pipefail

# Resolve through the repo-root compatibility symlink: `data/` sits next to this script's REAL
# directory, inside the skill package, not next to the link at the repo root.
SELF="${BASH_SOURCE[0]}"
while [[ -L "$SELF" ]]; do
  _d="$(cd -P "$(dirname "$SELF")" && pwd)"
  SELF="$(readlink "$SELF")"
  [[ "$SELF" != /* ]] && SELF="$_d/$SELF"
done
HERE="$(cd -P "$(dirname "$SELF")" && pwd)"
RULES="$HERE/../data/anti-slop-rules.json"

LENS=0
EXCLUDE=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --lens) LENS=1; shift ;;
    --exclude) EXCLUDE="${2:-}"; shift 2 ;;
    *) break ;;
  esac
done
TARGET="${1:-}"
if [[ -z "$TARGET" ]]; then
  echo "usage: $0 [--lens] [--exclude <ERE>] <dir-or-file>" >&2; exit 64
fi
if [[ ! -e "$TARGET" ]]; then
  echo "✗ anti-slop-gate: no such target: $TARGET" >&2; exit 67
fi
if ! command -v node >/dev/null; then
  echo "✗ anti-slop-gate: node is required — the rules live in $RULES and must be parsed." >&2
  echo "  (Greps alone also cannot check colour or spring physics; a run without node would be" >&2
  echo "   a gate that reports CLEAN without having checked. It exits 65 instead.)" >&2
  exit 65
fi
if [[ ! -f "$RULES" ]]; then
  echo "✗ anti-slop-gate: rules file missing: $RULES" >&2; exit 65
fi

US=$'\x1f'  # field separator
RS=$'\x1e'  # list separator inside a field

RULE_ROWS="$(node -e '
const fs = require("fs")
const doc = JSON.parse(fs.readFileSync(process.argv[1], "utf8"))
const US = "\x1f", RS = "\x1e"
for (const r of doc.rules) {
  process.stdout.write([
    r.id, r.severity, r.engine, r.label,
    r.pattern ?? "", r.perlExpr ?? "", r.requiresPattern ?? "",
    (r.excludeMatch ?? []).join(RS),
    r.threshold ?? "", (r.scale ?? []).join(" "),
    r.selectPattern ?? "", (r.requireAll ?? []).join(RS),
    r.limit ?? "", r.failureMode,
  ].join(US) + "\n")
}
' "$RULES")" || { echo "✗ anti-slop-gate: could not read $RULES" >&2; exit 65; }

# Only scan source; never node_modules/dist/build. Strip comment lines to avoid
# flagging a descriptive mention (e.g. "deliberately NOT indigo").
FILES=$(grep -rIl --include='*.tsx' --include='*.ts' --include='*.jsx' --include='*.css' \
        --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=build -e '' "$TARGET" 2>/dev/null)
[[ -z "$FILES" ]] && FILES="$TARGET"
if [[ -n "$EXCLUDE" ]]; then
  FILES=$(printf '%s\n' $FILES | grep -vE "$EXCLUDE" || true)
fi
FILE_COUNT=$(printf '%s\n' $FILES | grep -c . || true)

# shellcheck disable=SC2086
scan() { grep -nHE "$1" $FILES 2>/dev/null | grep -vE '^\s*[^:]*:[0-9]+:\s*(//|/\*|\*)' ; }
# shellcheck disable=SC2086
scan_raw() { grep -nHE "$1" $FILES 2>/dev/null ; }
nonblank() { grep -vE '^[[:space:]]*$' || true; }

hits=0
report() { # <id> <severity> <label> <failureMode> <matches>
  local id="$1" sev="$2" label="$3" why="$4" body="$5"
  [[ -z "$body" ]] && return 0
  if [[ "$sev" == "note" ]]; then
    echo "· NOTE [$id]: $label"
  else
    hits=$((hits+1))
    echo "✗ SLOP [$id]: $label"
  fi
  echo "$body" | sed 's/^/    /' | head -6
  echo "    ↳ why: $why" | fold -s -w 110 | sed '2,$s/^/      /'
}

echo "anti-slop-gate — target-scoped, ONE run over the whole tree."
echo "  target: $TARGET  ·  files: $FILE_COUNT  ·  rules: $(printf '%s\n' "$RULE_ROWS" | grep -c .) from data/anti-slop-rules.json"
[[ -n "$EXCLUDE" ]] && echo "  exclusion set (from the caller): $EXCLUDE"
echo ""

while IFS="$US" read -r id sev engine label pattern perlexpr requires excl threshold scale selectpat requireall limit why; do
  [[ -z "$id" ]] && continue

  # A rule that only applies to a certain kind of project (AS-08: Tailwind v4).
  if [[ -n "$requires" ]] && ! grep -rqE -- "$requires" "$TARGET" 2>/dev/null; then continue; fi

  out=""
  case "$engine" in
    grep)     out="$(scan "$pattern")" ;;
    grep-raw) out="$(scan_raw "$pattern")" ;;

    perl)
      # BSD grep lacks \x{} PCRE ranges. `close ARGV if eof` resets $. per file.
      expr="${perlexpr:-/$pattern/}"
      # shellcheck disable=SC2086
      out="$(perl -CSD -ne "print \"\$ARGV:\$.: \$_\" if $expr; close ARGV if eof;" $FILES 2>/dev/null)"
      ;;

    absent)
      # Fires when the pattern appears NOWHERE in the target.
      # shellcheck disable=SC2086
      grep -rq -- "$pattern" $FILES 2>/dev/null || out="(none found under $TARGET)"
      ;;

    count-threshold)
      cand="$(scan "$pattern" | head -20)"
      if [[ $(printf '%s\n' "$cand" | grep -c .) -ge ${threshold:-1} ]]; then out="$cand"; fi
      ;;

    offscale)
      # Enumerated ramp, not `n % 4`: modulo passes 20/28/36/40/44 — every value the ramp
      # deliberately omits — and false-flags the two Fluent "Nudge" half-steps (6, 10).
      SCALE=" $scale "
      while IFS= read -r line; do
        [[ -z "$line" ]] && continue
        n=$(sed -E 's/.*[pmg][xytrbl]?-\[([0-9]+)px\].*/\1/' <<<"$line")
        [[ "$n" =~ ^[0-9]+$ ]] && [[ "$SCALE" != *" $n "* ]] && out+="$line"$'\n'
      done < <(scan "$pattern")
      out="$(printf '%s' "$out" | nonblank)"
      ;;

    purple-oklch)
      out="$(scan "$pattern")"
      if [[ -n "$out" ]]; then
        designmd=""
        for c in "$TARGET/DESIGN.md" "$(dirname "$TARGET")/DESIGN.md" "$HERE/../DESIGN.md"; do
          [[ -f "$c" ]] && { designmd="$c"; break; }
        done
        if [[ -n "$designmd" ]]; then
          declared="$(grep -oE -- '--[a-z0-9-]+' "$designmd" | sort -u | paste -sd'|' -)"
          [[ -n "$declared" ]] && out="$(printf '%s\n' "$out" | grep -vE -- "($declared)[[:space:]]*:" | nonblank)"
        fi
        for f in $(printf '%s\n' "$out" | cut -d: -f1 | sort -u); do
          grep -qE -- '--chart-1[[:space:]]*:' "$f" 2>/dev/null || continue
          if node "$HERE/validate-chart-palette.mjs" "$f" >/dev/null 2>&1; then
            out="$(printf '%s\n' "$out" | grep -vE -- "^$f:[0-9]+:.*--chart-[0-9]" | nonblank)"
          fi
        done
      fi
      ;;

    state-coverage)
      # F5: selection is the whole rule. A `.map()` over a hardcoded array is NOT a data
      # component, and asking a static marketing section for loading/error/empty made this
      # detector unpassable on any marketing surface. Require a real async/data signal.
      # shellcheck disable=SC2086
      data_files=$(grep -rlE -- "$selectpat" $FILES 2>/dev/null)
      missing=""; total=0
      for f in $data_files; do
        total=$((total+1))
        ok=1
        while IFS= read -r need; do
          [[ -z "$need" ]] && continue
          grep -qE -- "$need" "$f" || ok=0
        done < <(printf '%s\n' "$requireall" | tr "$RS" '\n')
        (( ok == 0 )) && missing+="$f"$'\n'
      done
      if (( total > 0 )) && [[ -n "$missing" ]]; then
        label="$label ($(printf '%s' "$missing" | grep -c .)/$total)"
        out="$missing"
      fi
      ;;

    *) echo "· SKIP [$id]: unknown engine '$engine' in $RULES" ;;
  esac

  # Per-rule exclusions, applied to the matched LINES.
  if [[ -n "$out" && -n "$excl" ]]; then
    while IFS= read -r ex; do
      [[ -z "$ex" ]] && continue
      out="$(printf '%s\n' "$out" | grep -vE -- "$ex" | nonblank)"
    done < <(printf '%s\n' "$excl" | tr "$RS" '\n')
  fi
  [[ -n "$limit" && -n "$out" ]] && out="$(printf '%s\n' "$out" | head -"$limit")"

  report "$id" "$sev" "$label" "$why" "$out"
done <<< "$RULE_ROWS"

# Theme-level checks are computed, not grepped: hand off any stylesheet that declares chart
# slots or spring easings to the two generators/validators that own those numbers. This is a
# HANDOFF, not a rule — the numbers live in those scripts, so they are not in the JSON.
# shellcheck disable=SC2086
for t in $(grep -rlE -- '--chart-1[[:space:]]*:|--ease-spring-' $FILES 2>/dev/null); do
  grep -qE -- '--chart-1[[:space:]]*:' "$t" && {
    out="$(node "$HERE/validate-chart-palette.mjs" "$t" 2>&1)" \
      || report "AS-H1" "hard" "chart palette fails its computed checks ($t)" \
           "Colour is computable, so it is computed: never eyeball whether a palette is colourblind-safe. validate-chart-palette.mjs owns these numbers." "$out"
  }
  grep -qE -- '--ease-spring-' "$t" && {
    out="$(node "$HERE/spring-tokens.mjs" --check "$t" 2>&1)" \
      || report "AS-H2" "hard" "spring tokens drifted from the generator ($t)" \
           "A linear() curve is normalised to its own settle duration; the --ease-* and --dur-* tokens are a PAIR. A hand-edited one distorts the physics. Regenerate, never hand-tune." "$out"
  }
done

echo ""
if (( hits == 0 )); then echo "✓ anti-slop gate: CLEAN ($TARGET)"; else echo "✗ anti-slop gate: $hits tell(s) found in $TARGET"; fi

if (( LENS == 1 )); then
  cat <<'LENS'

── product-taste judge-lens (judge-only tells greps CANNOT see — review manually / with a blind judge) ──
  [ ] Keyboard-first? global ⌘K, single-letter/ G-letter actions, keyboard row nav — NOT mouse-only.
  [ ] Full state machine present? default/hover/focus-visible/active/disabled/loading/empty/error.
  [ ] Hierarchy from spacing + weight, NOT decorative color? (no colored chips carrying meaning color alone).
  [ ] Density is a choice? at least compact/comfortable tiers, not one fixed airy height.
  [ ] ⌘K / high-frequency surfaces open at 0ms? (an animated command palette is a motion fingerprint).
  [ ] Focus ring: 3:1 vs BOTH adjacent colors, in every state, on light AND dark surfaces?
      Inset rings (outline-offset negative / inset box-shadow / border) must be >= 3px, not 2px.
  [ ] Dialog: initial focus on a static element or the LEAST destructive button — never autofocus destroy?
      Focus restored to the invoker on close?
  [ ] Every drag has a single-POINTER (tap/click) alternative — keyboard support does not satisfy 2.5.7?
  [ ] Auth: paste allowed, password managers not blocked, OTP is one input with autocomplete="one-time-code"?
  A screen that passes every grep above and still reads generic has FAILED this lens.
LENS
fi

# Contract: 1-63 is the violation count; clamp so a count can never be read as a harness code.
if (( hits > 63 )); then
  echo "  (exit code clamped to 63; $hits tell(s) found)"
  exit 63
fi
exit "$hits"
