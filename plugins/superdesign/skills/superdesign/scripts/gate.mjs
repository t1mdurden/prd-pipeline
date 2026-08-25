#!/usr/bin/env node
// gate — the Phase-4/5 dispatcher. One command that runs the right gates for one target and
// decides SCOPE EXACTLY ONCE.
//
//   node .claude/skills/superdesign/scripts/gate.mjs <dir> [--url <route>] [--json]
//
// EXIT-CODE CONTRACT — identical in every superdesign gate (ARCHITECTURE.md §2):
//   0        clean
//   1–63     the number of violations. A count above 63 is clamped to 63 and the line says so.
//   64–79    harness error — 64 usage · 65 missing dep · 66 navigation failed · 67 no target
// This script's own exit is the MAX over its children's violation counts, or the highest harness
// code any child returned if one did. Max, not sum: the children overlap (an `outline-none` line
// is one defect whether the source gate or the rendered gate reports it), and summing would make
// the number a function of how many gates happen to be installed.
//
// WHY THIS EXISTS — two field-run findings that are fixed by construction, not by a fix:
//
//   F4  `anti-slop-gate.sh` is target-scoped, and nothing said so. Called once per file over the
//       dkuvpn build it reported 25 tells, 24 of them artifacts of the caller's loop. A dispatcher
//       that owns the walk cannot be called that way: it takes a DIRECTORY and runs each child
//       exactly once over it.
//   F7  Phase 4's numeric greps exclude `ui/`; `anti-slop-gate.sh` did not. The two halves of one
//       gate disagreed about what they were looking at, so a "clean" from one half and a finding
//       from the other could describe the same file. Here the exclusion set is resolved ONCE,
//       printed, and handed to every child — the source gate gets it as `--exclude`, the numeric
//       greps get it as the same expression over the same file list.
//
// THE EXCLUSION SET IS NOT LENIENCY, IT IS CORRECTNESS. `components/ui/*` is vendored shadcn:
// it ships `w-[8rem]` on dropdown content, `h-[300px]` on the command list and `w-[2px]` on the
// sidebar rail. Flagging those tells the reader to edit files that quality-bar item 7 forbids
// forking — the gate would be demanding a different rule be broken to satisfy it.
// (SKILL.md § Phase 4a, "The exclusions are not leniency, they are correctness".)
//
// NOT RUN HERE, on purpose: validate-chart-palette.mjs and spring-tokens.mjs --check. The source
// gate already hands every stylesheet that declares `--chart-1` or `--ease-spring-*` to both, and
// their exit codes fold into its count. Running them again here would double-count one defect.

import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(realpathSync(fileURLToPath(import.meta.url)))

const argv = process.argv.slice(2)
const flag = (n) => { const i = argv.indexOf(`--${n}`); return i === -1 ? undefined : argv[i + 1] }
const asJson = argv.includes('--json')
const url = flag('url')
const target = argv.find((a) => !a.startsWith('--') && argv[argv.indexOf(a) - 1] !== '--url')

if (!target) {
  console.error('usage: node .claude/skills/superdesign/scripts/gate.mjs <dir> [--url <route>] [--json]')
  process.exit(64) // 64 = usage
}
if (!existsSync(target)) {
  console.error(`✗ gate: no such target: ${target}`)
  process.exit(67) // 67 = no target
}
if (!statSync(target).isDirectory()) {
  console.error(`✗ gate: ${target} is a file. This dispatcher is DIRECTORY-scoped — that is the F4 fix.`)
  console.error('  Point it at the tree; every child gate is then run exactly once over the whole tree.')
  process.exit(64) // 64 = usage
}

/* ── SCOPE, DECIDED ONCE ──────────────────────────────────────────────────────────────────── */

// Directory names never scanned by any child. `ui` is the vendored shadcn primitives; the rest is
// build output and dependencies.
const EXCLUDED_DIRS = ['node_modules', 'dist', 'build', '.next', '.turbo', 'coverage', 'ui']
// The same decision as one ERE, so a shell child can apply it to a path list unchanged.
const EXCLUDE_RE = `(^|/)(${EXCLUDED_DIRS.map((d) => d.replace('.', '\\.')).join('|')})/`
const SOURCE_EXT = ['.tsx', '.ts', '.jsx', '.css']

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') && e.name !== '.next') continue
    if (e.isSymbolicLink()) continue
    const p = join(dir, e.name)
    if (e.isDirectory()) {
      if (EXCLUDED_DIRS.includes(e.name)) continue
      walk(p, out)
    } else if (SOURCE_EXT.some((x) => e.name.endsWith(x))) {
      out.push(p)
    }
  }
  return out
}
const files = walk(target)

/* ── CHILDREN ─────────────────────────────────────────────────────────────────────────────── */

const results = []
function record(name, code, note) { results.push({ name, code, note }) }

function run(name, cmd, args, { note } = {}) {
  try {
    const out = execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 32 << 20 })
    if (!asJson) process.stdout.write(out)
    record(name, 0, note)
  } catch (e) {
    if (e.status === undefined) { // could not spawn at all
      console.error(`✗ gate: could not run ${name}: ${e.message.split('\n')[0]}`)
      record(name, 65, 'could not spawn')
      return
    }
    if (!asJson) { process.stdout.write(e.stdout ?? ''); process.stderr.write(e.stderr ?? '') }
    record(name, e.status, note)
  }
}

// 1. The source gate. It walks the tree itself; it gets the exclusion set as an expression so its
//    file list and this one are the same list.
run('anti-slop', 'bash', [join(HERE, 'anti-slop-gate.sh'), '--exclude', EXCLUDE_RE, target])

// 2. The numeric half of the SAME Phase-4 gate (F7). Over the SAME file list, with the same
//    exclusions — that is the whole point of running it from here instead of from a prose block.
//    The value-level exemptions belong to this check, not to the scope: `ch` is mandated by
//    Phase 3 (`max-width: 66ch`), and `calc()` / `var()` are how shadcn's primitives size
//    themselves (`w-[var(--radix-select-trigger-width)]` has no token form).
{
  const ARBITRARY = /\b(p|px|py|pt|pr|pb|pl|m|mx|my|mt|mr|mb|ml|gap|w|h)-\[[^\]]+\]/g
  const HEXCLASS = /class(Name)?="[^"]*\[#[0-9a-fA-F]{3,8}\]/g
  const EXEMPT = /\[[0-9.]+ch\]|calc\(|var\(/
  const hitsArb = []
  const hitsHex = []
  for (const f of files.filter((f) => f.endsWith('.tsx') || f.endsWith('.jsx'))) {
    const body = readFileSync(f, 'utf8').split('\n')
    body.forEach((line, i) => {
      for (const m of line.matchAll(ARBITRARY)) if (!EXEMPT.test(m[0])) hitsArb.push(`${relative('.', f)}:${i + 1}: ${m[0]}`)
      for (const m of line.matchAll(HEXCLASS)) hitsHex.push(`${relative('.', f)}:${i + 1}: ${m[0].slice(0, 90)}`)
    })
  }
  // The two counts are NOT the same kind of claim, and SKILL.md § Phase 4a says both things about
  // them in ten lines: `# must be 0`, then "The count is a reading prompt."
  //   · A raw hex class is unambiguous — there is no legitimate `className="… [#3b82f6]"`, it is a
  //     colour that escaped the token layer. Counted.
  //   · An arbitrary spacing/sizing value is a READING PROMPT, not a verdict: a chart's fixed
  //     height and a data-table column width have no token because they are not spacing decisions.
  //     STATE.md carries this as a standing decision — `examples/app-ui` keeps exactly 10 of them
  //     on purpose. Counting them would leave this dispatcher permanently red on the repo's own
  //     gate-clean reference implementation, which is how a gate becomes decoration. Reported,
  //     never counted.
  if (!asJson) {
    console.log(`\narbitrary-values — the numeric half of Phase 4, same scope as the source gate`)
    if (hitsHex.length === 0) console.log(`  ✓ 0 raw hex classes (${files.length} source files)`)
    else {
      console.log(`  ✗ ${hitsHex.length} raw hex class(es) — a colour that escaped the token layer`)
      for (const h of hitsHex.slice(0, 12)) console.log(`      ${h}`)
    }
    if (hitsArb.length === 0) console.log('  ✓ 0 arbitrary spacing/sizing values')
    else {
      console.log(`  · NOTE ${hitsArb.length} arbitrary spacing/sizing value(s) — reported, NOT counted`)
      for (const h of hitsArb.slice(0, 12)) console.log(`      ${h}`)
      if (hitsArb.length > 12) console.log(`      … ${hitsArb.length - 12} more`)
      console.log('    ↳ why: read a survivor, do not just count it. An exact scale step written the long way')
      console.log('      (`h-[13rem]` is `h-52`) is a Phase-1 token defect, free to fix and invisible on screen;')
      console.log('      a one-off component dimension — a chart height, a column width — has no token because')
      console.log('      it is not a spacing decision. Four justified fixed heights is fine; forty is a token')
      console.log('      baseline nobody wrote.')
    }
  }
  record('raw-hex-classes', Math.min(hitsHex.length, 63))
  record('arbitrary-values', 0, `${hitsArb.length} reported, not counted (reading prompt)`)
}

// 3. F1: cn() silently drops custom `text-*` size tokens. Only runnable where BOTH halves of the
//    pair exist — a theme declaring `--text-*` and the `cn()` helper that would eat it.
{
  const themes = files.filter((f) => f.endsWith('.css') && /--text-[a-z0-9-]+\s*:/.test(readFileSync(f, 'utf8')))
  const utils = files.filter((f) => /(^|\/)utils\.(ts|tsx)$/.test(f) && /twMerge|extendTailwindMerge/.test(readFileSync(f, 'utf8')))
  if (themes.length && utils.length) {
    run('tw-merge-tokens', process.execPath, [join(HERE, 'check-tw-merge-tokens.mjs'), themes[0], utils[0]])
  } else if (!asJson) {
    console.log(`\ntw-merge-tokens — skipped: ${themes.length ? 'no cn()/twMerge helper found' : 'no --text-* tokens declared'} under ${target}`)
  }
}

// 4. The rendered gate. Geometry and axe need a page, so it runs only when one is named.
if (url) {
  run('design-audit', process.execPath, [join(HERE, 'design-audit.mjs'), '--url', url, '--theme', 'light,dark'])
} else if (!asJson) {
  console.log('\ndesign-audit — skipped: no --url. Geometry and contrast are NOT checked by a source gate.')
  console.log('  Every real defect on the dkuvpn run came from rendering (field-run F11): typecheck, build,')
  console.log('  three grep gates and the contrast solver were all green while the hero was visibly broken.')
}

/* ── ONE VERDICT ──────────────────────────────────────────────────────────────────────────── */

// A child can exit OUTSIDE the contract entirely — 127 when its interpreter or the file itself is
// missing, 137 when it is killed. Filtering to 64–79 and 1–63 dropped those on the floor and the
// dispatcher printed CLEAN over a gate that never ran. A gate that cannot tell "nothing was wrong"
// from "nothing executed" is the worst failure this dispatcher can have, so anything unrecognised
// is treated as a harness error and reported with its raw code.
const harness = results.filter((r) => r.code > 63 || r.code < 0)
const violations = results.filter((r) => r.code >= 1 && r.code <= 63)
// An off-contract code is surfaced as 65 (missing dep) rather than passed through, so the caller
// always sees a number inside the contract it was promised.
const worst = harness.length
  ? Math.max(...harness.map((r) => (r.code >= 64 && r.code <= 79 ? r.code : 65)))
  : Math.min(Math.max(0, ...violations.map((r) => r.code)), 63)

if (asJson) {
  console.log(JSON.stringify({ target, url: url ?? null, excludedDirs: EXCLUDED_DIRS, excludeRe: EXCLUDE_RE, files: files.length, children: results, exit: worst }, null, 2))
} else {
  console.log('\n── gate ──────────────────────────────────────────────────────────────────────')
  console.log(`  target        ${target}  (${files.length} source files)`)
  console.log(`  scope         excluded dirs: ${EXCLUDED_DIRS.join(', ')}  —  resolved once, inherited by every child`)
  for (const r of results) {
    const verdict = r.code === 0 ? 'clean'
      : r.code > 63 || r.code < 0 ? `HARNESS ERROR (${r.code}${r.code > 79 ? ' — did not run' : ''})`
      : `${r.code} violation(s)`
    console.log(`  ${r.name.padEnd(18)}${verdict}${r.note ? `  · ${r.note}` : ''}`)
  }
  console.log(
    harness.length
      ? `\n✗ gate: a child could not run — exit ${worst}. This is NOT a design verdict.`
      : worst === 0
        ? `\n✓ gate: CLEAN (${results.length} child gate(s))`
        : `\n✗ gate: ${worst} violation(s) — the max over ${results.length} child gate(s), not the sum`,
  )
}
process.exit(worst)
