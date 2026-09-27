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
for cls in runtime: void: clip: overflow: leftovers: axe: hero: form: ground:; do
  grep -q "$cls" "$T/broken.txt" && ok "broken page reports $cls" || no "broken page does not report $cls"
done

node "$S" "file://$H/broken-asset.html" --out "$T/a" > "$T/asset.txt" 2>&1
grep -q "runtime: asset" "$T/asset.txt" && ok "a missing image is a defect" || { no "a missing image went unreported"; cat "$T/asset.txt"; }
node "$S" "file://$H/app.html" --brief "$H/app.md" --out "$T/app" > "$T/app.txt" 2>&1; e=$?
[ "$e" -eq 0 ] && ok "app surface: a live select satisfies CONVERSION form" || { no "app surface with a select exits $e"; cat "$T/app.txt"; }
(cd "$H/other" && node "$S" "file://$H/clean.html" --out "$T/o" > "$T/other.txt" 2>&1); e=$?
[ "$e" -eq 67 ] && ok "a page whose title is not this project's exits 67" || { no "foreign page exits $e"; cat "$T/other.txt"; }
# An SPA server that answers every path with index.html, as vite and vite preview do.
node -e "require('http').createServer((q,s)=>{s.writeHead(200,{'content-type':'text/html'});s.end(require('fs').readFileSync('$H/spa/index.html'))}).listen(0,function(){require('fs').writeFileSync('$T/port',String(this.address().port))})" & SPA=$!
for i in 1 2 3 4 5 6 7 8 9 10; do [ -s "$T/port" ] && break; sleep 0.3; done
(cd "$H/spa" && node "$S" "http://localhost:$(cat "$T/port")/" --out "$T/spa" > "$T/spa.txt" 2>&1)
grep -q "asset missing (served index.html instead)" "$T/spa.txt" && ok "a missing image behind an SPA fallback is a defect" || { no "SPA fallback hid a missing image"; cat "$T/spa.txt"; }
(cd "$H/scaffold" && node "$S" "http://localhost:$(cat "$T/port")/" > "$T/scaf.txt" 2>&1); e=$?
[ "$e" -eq 64 ] && ok "a scaffold-default title is refused (exit 64)" || { no "scaffold title exits $e"; cat "$T/scaf.txt"; }
kill $SPA 2>/dev/null
node "$S" "http://127.0.0.1:9/" > "$T/dead.txt" 2>&1; d=$?
[ "$d" -eq 67 ] && ok "unreachable page exits 67, not clean" || no "unreachable page exits $d"

node "$S" --ground-card "$H/../ground-tint/rejected.json" > /dev/null; r=$?
node "$S" --ground-card "$H/../ground-tint/accepted.json" > /dev/null; a=$?
[ "$r" -eq 1 ] && ok "ground cap fails the owner-rejected card" || no "rejected card exits $r"
[ "$a" -eq 0 ] && ok "ground cap passes the owner-accepted card" || no "accepted card exits $a"

[ "$fail" -eq 0 ] && echo "✓ check.mjs: all green" || echo "✗ check.mjs: $fail failing"
exit "$fail"
