#!/usr/bin/env bash
# catalog.mjs search against the committed data/catalog.json (offline).
set -u
S="$(cd "$(dirname "$0")/../.." && pwd)/catalog.mjs"; fail=0
chk() { out="$(node "$S" search $2 2>&1)"; e=$?; if echo "$out" | head -1 | grep -q "$3" && [ "$e" -eq 0 ]; then echo "PASS  '$2' → $3 first"; else echo "FAIL  '$2' → exit $e, first: $(echo "$out" | head -1)"; fail=$((fail+1)); fi; }
chk dash "dashboard --surface app" "dashboard-01"
chk logos "logos --surface marketing" "@shadcnblocks/logos"
chk hero "hero split image --surface marketing --image" "@shadcnblocks/hero"
chk inset "sidebar inset --surface app" "sidebar-08"
node "$S" search zzqqxx >/dev/null 2>&1; e=$?; [ "$e" -eq 1 ] && echo "PASS  no match exits 1" || { echo "FAIL  no match exits $e"; fail=$((fail+1)); }
node "$S" search >/dev/null 2>&1; e=$?; [ "$e" -eq 64 ] && echo "PASS  no words exits 64" || { echo "FAIL  no words exits $e"; fail=$((fail+1)); }
node "$S" search hero --surface marketing --paid --limit 50 | grep -q PAID && echo "PASS  --paid shows Pro items, labelled" || { echo "FAIL  --paid"; fail=$((fail+1)); }
node "$S" search hero --surface marketing --limit 50 | grep -q PAID && { echo "FAIL  Pro items leak without --paid"; fail=$((fail+1)); } || echo "PASS  default search is free items only"
[ "$fail" -eq 0 ] && echo "✓ catalog.mjs: all green" || echo "✗ catalog.mjs: $fail failing"; exit "$fail"
