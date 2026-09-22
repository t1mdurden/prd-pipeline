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
import { existsSync, readdirSync, readFileSync, realpathSync, statSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
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

// 0. The brief. F14: the fastway run shipped five client logos as uppercase TEXT
//    (`src/content/thermo.ts:196-201`, `logo: null`) because DESIGN.md has fifteen fields and not
//    one of them obliges Phase 1 to ASK for the files the business already owns. The build the
//    owner accepted put those three logos in its second section. Asking is now mechanical.
//
//    This is a PRESENCE check, not a taste check: each required row must name something that is on
//    disk, or say UNAVAILABLE with the date it was asked for. "UNAVAILABLE — asked 2026-09-16" is a
//    passing answer; silence is not. A brief that never mentions logos cannot be said to have
//    considered them, and that is the only thing a script can decide here.
let BRIEF = null
{
  const REQUIRED = ['logo', 'client-logos', 'photography']
  let briefDir = resolve(target); let brief = null
  for (let up = 0; up < 4 && !brief; up++, briefDir = dirname(briefDir)) {
    const c = join(briefDir, 'DESIGN.md')
    if (existsSync(c)) brief = c
  }
  BRIEF = brief
  if (!brief) {
    if (!asJson) console.log(`\nbrief-assets — skipped: no DESIGN.md at or above ${target}. Phase 1 has not run, or this gate is pointed at a sub-tree.`)
  } else {
    const dir = dirname(brief)
    const lines = readFileSync(brief, 'utf8').split('\n')
    const start = lines.findIndex((l) => /^ASSETS:/.test(l))
    const problems = []
    if (start === -1) {
      problems.push(`no ASSETS: block in ${relative(process.cwd(), brief)} — Phase 1 never asked what the business already owns`)
    } else {
      // The block is the ASSETS: line plus every indented continuation until the next FIELD: header,
      // which is how every other block in this brief format is written.
      const rows = new Map()
      for (let i = start; i < lines.length; i++) {
        const l = lines[i]
        if (i > start && (/^[A-Z][A-Z0-9 _-]*:/.test(l) || l.trim() === '')) break
        const body = i === start ? l.replace(/^ASSETS:\s*/, '') : l.trim()
        const m = /^([a-z][a-z0-9-]*)\s*:\s*(.+)$/.exec(body.trim())
        if (m) rows.set(m[1], m[2].trim())
      }
      for (const k of REQUIRED) {
        const v = rows.get(k)
        if (v === undefined) { problems.push(`ASSETS has no \`${k}\` row — say where it is, or say UNAVAILABLE and the date you asked`); continue }
        if (/UNAVAILABLE/i.test(v)) {
          if (!/\d{4}-\d{2}-\d{2}/.test(v)) problems.push(`\`${k}: ${v}\` — UNAVAILABLE needs the date it was asked for, e.g. "UNAVAILABLE — asked 2026-09-16"`)
          continue
        }
        const first = v.split(/[,\s]+/)[0]
        if (!existsSync(join(dir, first))) problems.push(`\`${k}: ${v}\` — ${first} is not on disk, relative to ${relative(process.cwd(), dir) || '.'}`)
      }
    }
    if (!asJson) {
      console.log(`\nbrief-assets — ${relative(process.cwd(), brief)}`)
      if (!problems.length) console.log('  ✓ every required asset is on disk or honestly marked UNAVAILABLE with a date')
      else for (const p of problems) console.log(`  ✗ ${p}`)
    }
    record('brief-assets', Math.min(problems.length, 63))
  }
}

// 0b. The seed. MUST 2 — "take the least-probable direction that still clears the brief" — is the
//     one MUST whose own entry in SKILL.md admits it is "Unmeasurable — the probability here is the
//     model's own estimate of its own prior." brand-to-system.md § "The seed axis" has always
//     enumerated the axes and instructed the model to "roll one value on each"; a model cannot roll.
//     `seed.mjs --check` re-derives every axis from the brief's own seed and counts the axes the
//     brief contradicts, which turns a sentence into a count. Absent seed and absent block are one
//     violation each, not a skip — but a brief with no SEED at all is reported and NOT counted,
//     because every brief written before this child existed has none and the gate is not a time
//     machine. Say what is missing; refuse only a seed that was written and then ignored.
if (BRIEF) {
  const seeded = /^\s*SEED:\s*[0-9a-fA-F]{32,}\s*$/m.test(readFileSync(BRIEF, 'utf8'))
  if (!seeded) {
    if (!asJson) {
      console.log(`\nbrief-seed — ${relative(process.cwd(), BRIEF)}`)
      console.log('  · no SEED: line — MUST 2 is unenforced on this build. Draw one with')
      console.log('    node .claude/skills/superdesign/scripts/seed.mjs --new --register <conservative|neutral|expressive>')
    }
    record('brief-seed', 0, 'no SEED: line — reported, not counted')
  } else {
    run('brief-seed', 'node', [join(HERE, 'seed.mjs'), '--check', BRIEF])
  }
}

// 0c. How the page converts. The fastway build shipped a lead-generation landing page with
//     `grep -c '<form\|<input\|<select\|<textarea' Landing.tsx` = 0 while `cookbook/forms.md` sat
//     unread on disk; the build the owner accepted carries six fields. On 2026-09-22 a blind
//     screenshot critic scored the two builds three times each on twenty binary criteria, and
//     "there is at least one thing the visitor can fill in or choose on the page itself, not only
//     links" was one of only three criteria that separated them perfectly — 3/3 against 0/3.
//
//     It is NOT a blanket cap, and the corpus is why: four of the five pages in `examples/` carry
//     zero form controls and are not wrong to. So this is a brief-versus-build check, the same
//     shape as brief-assets. Phase 1 declares how the surface converts; the build has to match it.
//       CONVERSION: form   → the tree must contain a form control
//       CONVERSION: call | link | none → nothing to check, the decision is recorded and that is the point
if (BRIEF) {
  const txt = readFileSync(BRIEF, 'utf8')
  const m = /^\s*CONVERSION:\s*(form|call|link|none)\b/im.exec(txt)
  if (!m) {
    if (!asJson) {
      console.log(`\nbrief-conversion — ${relative(process.cwd(), BRIEF)}`)
      console.log('  ✗ no CONVERSION: row. Phase 1 never decided how this surface converts, so nothing can')
      console.log('    check that it does. One of: form · call · link · none.')
    }
    record('brief-conversion', 1)
  } else if (m[1].toLowerCase() === 'form') {
    // A verifier defeated the first version of this on 2026-09-22 three ways, all reproduced: a
    // `<form` inside a `// TODO` comment, inside a string literal, and inside a CSS comment — the
    // last because `.css` is in SOURCE_EXT and a stylesheet cannot contain a JSX control at all.
    // So: markup files only, comments and string literals removed first, and the tag has to look
    // like a tag rather than like the word.
    const CONTROL = /<(form|input|select|textarea)(\s|\/?>)/i
    const strip = (src) => src
      .replace(/\/\*[\s\S]*?\*\//g, ' ')            // block comments
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')          // line comments, sparing `https://`
      .replace(/'(?:\\.|[^'\\])*'/g, "''")            // single-quoted strings
      .replace(/"(?:\\.|[^"\\])*"/g, '""')            // double-quoted strings
      .replace(/`(?:\\.|[^`\\])*`/g, '``')            // template literals
    const MARKUP = /\.(tsx|jsx|ts|js)$/i
    const hits = files.filter((f) => MARKUP.test(f) && CONTROL.test(strip(readFileSync(f, 'utf8'))))
    if (!asJson) {
      console.log(`\nbrief-conversion — ${relative(process.cwd(), BRIEF)} declares CONVERSION: form`)
      if (hits.length) console.log(`  ✓ ${hits.length} file(s) carry a form control`)
      else {
        console.log('  ✗ the brief says this surface converts through a form and the tree has no form control.')
        console.log('    cookbook/forms.md owns the layout, the validation timing and the error surfaces.')
      }
    }
    record('brief-conversion', hits.length ? 0 : 1)
  } else if (!asJson) {
    console.log(`\nbrief-conversion — ${relative(process.cwd(), BRIEF)} declares CONVERSION: ${m[1]} · nothing to check`)
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

  // 4b. The ground-tint gate — MUST 5's missing threshold. It reads a reference card, so the page
  //     has to be measured first. The card is an intermediate, not a deliverable: it goes to the
  //     temp dir, because this dispatcher is pointed at a SOURCE directory and must not write into
  //     it. A project that wants to keep the card runs `extract-reference.mjs --url … --out ref/ours`
  //     itself; that is Phase 0's job, not this one's.
  const card = join(tmpdir(), `superdesign-gate-ours-${process.pid}.json`)
  let captured = true
  try {
    execFileSync(process.execPath, [join(HERE, 'extract-reference.mjs'), '--url', url, '--out', card.replace(/\.json$/, '')],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 32 << 20 })
  } catch (e) {
    captured = false
    // Capture is harness work, not a design verdict. Surface its code, never count it as violations.
    const code = e.status >= 64 && e.status <= 79 ? e.status : 65
    if (!asJson) console.error(`✗ gate: could not measure ${url} for the ground-tint gate — exit ${code}`)
    record('ground-tint', code, 'the card could not be captured')
  }
  if (captured && existsSync(card)) {
    run('ground-tint', process.execPath, [join(HERE, 'extract-reference.mjs'), '--check-ours', card])
    try { unlinkSync(card); unlinkSync(card.replace(/\.json$/, '.md')) } catch { /* best effort */ }
  }
} else if (!asJson) {
  console.log('\ndesign-audit + ground-tint — skipped: no --url. Geometry, contrast and how much of the')
  console.log('  page is painted a tinted ground are NOT checked by a source gate.')
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
