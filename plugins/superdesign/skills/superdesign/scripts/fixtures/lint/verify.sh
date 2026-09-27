#!/usr/bin/env bash
# lint.mjs against a known-clean project and one mutation per rule. Offline: the base is built by
# base.mjs recover from item.json, the same path a real `base.mjs add` takes for a registry page.
set -u
H="$(cd "$(dirname "$0")" && pwd)"; S="$H/../.."; T="$(mktemp -d)"; fail=0
fresh() { W="$T/$1"; cp -R "$H/project" "$W"; (cd "$W" && node "$S/base.mjs" recover "$H/item.json" >/dev/null); }
expect() { # name rule-or-clean
  (cd "$W" && node "$S/lint.mjs" > "$T/$1.txt" 2>&1); e=$?
  if [ "$2" = clean ]; then [ "$e" -eq 0 ] && echo "PASS  $1 → clean" || { echo "FAIL  $1 → exit $e"; cat "$T/$1.txt"; fail=$((fail+1)); }
  else grep -q "^FAIL $2" "$T/$1.txt" && [ "$e" -ge 1 ] && echo "PASS  $1 → $2 (exit $e)" || { echo "FAIL  $1 → expected $2, exit $e"; cat "$T/$1.txt"; fail=$((fail+1)); }; fi
}
fresh clean;      expect clean clean
grep -q '"@/components/ui/button"' "$T/clean/src/components/section-cards.tsx" && echo "PASS  recover rewrote registry imports" || { echo "FAIL  recover left @/registry imports"; fail=$((fail+1)); }
fresh uifork;     sed -i '' 's/rounded-md/rounded-none/' "$W/src/components/ui/button.tsx";                expect uifork ui-fork
fresh uinew;      printf 'export const X = 1\n' > "$W/src/components/ui/fancy.tsx";                     expect uinew ui-fork
fresh theme;      sed -i '' 's/--primary: oklch(0.205 0 0);/--primary: oklch(0.45 0.12 25);/' "$W/src/index.css"; expect theme theme
fresh radius;     sed -i '' 's/--radius: 0.625rem;/--radius: 0;/' "$W/src/index.css";                     expect radius radius-0
fresh serif;      printf '@import "@fontsource/source-serif-4";\n' >> "$W/src/index.css";               expect serif serif
fresh serif2;     sed -i '' "s/'Inter Variable', sans-serif/'Playfair Display', serif/" "$W/src/index.css"; expect serif2 serif
fresh hand;       printf 'export default function App() { return <main>hand</main> }\n' > "$W/src/App.tsx"; expect hand hand-built
fresh raw;        printf 'export const S = () => <span className="text-emerald-600">x</span>\n' > "$W/src/components/status.tsx"; expect raw raw-colour
fresh brand;      (cd "$W" && node "$S/base.mjs" brand "oklch(0.52 0.12 170)" >/dev/null);             expect brand clean
fresh brandhand;  (cd "$W" && node "$S/base.mjs" brand "oklch(0.52 0.12 170)" >/dev/null); sed -i '' 's/--ring: oklch(0.52 0.12 170);/--ring: oklch(0.6 0.2 30);/' "$W/src/index.css"; expect brandhand theme
fresh font;       (cd "$W" && node "$S/base.mjs" font "Onest" >/dev/null);                           expect font clean
fresh white;      printf 'export const T = () => <div className="bg-white">x</div>\n' > "$W/src/components/tile.tsx"; expect white raw-colour
fresh darkbrand;  (cd "$W" && node "$S/base.mjs" brand "oklch(0.41 0.10 250)" >/dev/null)
if awk '/^\.dark/,/}/' "$W/src/index.css" | grep -q -- '--primary: oklch(0.720'; then echo "PASS  brand lifts the .dark primary to L 0.72"; else echo "FAIL  .dark primary not lifted"; fail=$((fail+1)); fi
fresh fontclean;  (cd "$W" && node "$S/base.mjs" font "Onest Variable" >/dev/null)
grep -q 'fontsource-variable/inter' "$W/src/index.css" && { echo "FAIL  the replaced font's import is still there"; fail=$((fail+1)); } || echo "PASS  base.mjs font drops the unused Inter import"
fresh mkt;        printf 'SURFACE: marketing\n' > "$W/DESIGN.md"; sed -i '' "s/'Inter Variable', sans-serif/'Fraunces', serif/" "$W/src/index.css"; expect mkt theme
W="$T/nobase"; cp -R "$H/project" "$W"; (cd "$W" && node "$S/lint.mjs" >/dev/null 2>&1); e=$?
[ "$e" -eq 65 ] && echo "PASS  no base.json → exit 65" || { echo "FAIL  no base.json → exit $e"; fail=$((fail+1)); }
[ "$fail" -eq 0 ] && echo "✓ lint.mjs: all green" || echo "✗ lint.mjs: $fail failing"
exit "$fail"
