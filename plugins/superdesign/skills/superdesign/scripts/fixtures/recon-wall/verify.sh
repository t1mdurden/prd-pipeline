#!/usr/bin/env bash
# The fixture for recon.mjs's "did we actually reach the page" guard — field-run finding F17.
#
# 2026-09-22: `recon --refs https://www.stef.com/corporate/en,...` exited 0, wrote
# `"measured": true`, and `--check` printed `[ok] www-stef-com-corporate-en measured` — for a
# 37-node page titled "Radware Captcha Page". Its digest then went into the convergence read that
# Phase 1 uses to decide what the category default is. The same 37-node card has been sitting in
# the fastway peer corpus since 2026-09-16.
#
# This is the 2026-08-25 verifier's own finding ("recon --registry measured a page returning HTTP
# 404 and wrote measured:true beside it") on the --refs path, which was never fixed.
#
# The floor is calibrated: across the 18 peer cards on disk the smallest REAL page is einride at
# 262 nodes, the next thermoking at 352; the captcha is 37. 120 sits in the gap.
#
#   reached/  three real cards                       → exit 0
#   wall/     one card is the captcha, the other two real → exit 1
#
# The guard reads the CARD, not the recon.json flag, because every recon.json written before it
# existed has no flag at all.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
R="$HERE/../../recon.mjs"
fail=0
check () { # dir expected
  ( cd "$HERE/$1" && node "$R" --check ) >/tmp/recon-wall-$1.txt 2>&1; local c=$?
  if [ "$c" -eq "$2" ]; then echo "PASS  $1 exits $c"
  else echo "FAIL  $1 exits $c — expected $2"; sed 's/^/        /' /tmp/recon-wall-$1.txt | head -10; fail=$((fail+1)); fi
}
check reached 0
check wall    1
grep -q 'never reached' /tmp/recon-wall-wall.txt \
  && echo "PASS  the failure says the page was never reached, not that a number was wrong" \
  || { echo "FAIL  the failure did not name the wall"; fail=$((fail+1)); }
grep -q 'ref-a' /tmp/recon-wall-wall.txt \
  && echo "PASS  the two real references still report [ok] beside the bad one" \
  || { echo "FAIL  one bad card suppressed the good ones"; fail=$((fail+1)); }

# The title pattern is the thin second layer under the node floor, and the first version of it
# caught 1 of the 14 real interstitial titles a verifier threw at it — the one page that caused the
# finding. Widened, it must catch all fourteen and fire on none of the seven real peer titles on
# disk, or it is trading a hole for a worse one.
node -e '
const fs=require("fs");
const titles=["Radware Captcha Page","Security Check - Please Wait","Bot Verification","Cloudflare","DDoS protection by Cloudflare","Pardon Our Interruption","Error 1015","Access to this page has been denied","Human Verification Required","Подождите, идёт проверка","Just a moment...","Attention Required! | Cloudflare","Checking your browser before accessing","One more step"];
const good=["Global Transport and Logistics | DSV","Maersk | Integrated Container Logistics","Home - Nagel-Group","Thermo King | North America","Europes Largest Asset-Based Logistics Company","Decision Intelligence Platform | project44","Digital Freight Forwarder | sennder"];
const src=fs.readFileSync(process.argv[1],"utf8");
const m=/const WALL_TITLE = new RegExp\(\[([\s\S]*?)\]\.join\(.\|.\), .i.\)/.exec(src);
if(!m){console.log("SHAPE");process.exit(2)}
const re=new RegExp(eval("["+m[1]+"]").join("|"),"i");
const caught=titles.filter(t=>re.test(t)).length;
const fp=good.filter(t=>re.test(t));
console.log(caught+"/"+titles.length+" "+fp.length);
' "$HERE/../../recon.mjs" > /tmp/recon-title.txt 2>&1
read -r res fp < /tmp/recon-title.txt
if [ "$res" = "14/14" ] && [ "${fp:-9}" = "0" ]; then echo "PASS  the title pattern catches 14/14 interstitials and 0/7 real peer titles"
else echo "FAIL  title pattern: $res caught, $fp false positive(s) — see /tmp/recon-title.txt"; fail=$((fail+1)); fi

[ "$fail" -eq 0 ] && echo "✓ a reference the browser never reached is not a measurement" || echo "✗ $fail checks failed"
exit "$fail"
