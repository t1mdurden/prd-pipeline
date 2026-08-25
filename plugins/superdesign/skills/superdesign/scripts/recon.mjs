#!/usr/bin/env node
// recon — Phase 0's gate. Measure the field before you decide anything, and prove you measured.
//
//   node .claude/skills/superdesign/scripts/recon.mjs --refs <url,url,url>   # BUILD    3–6 comparables
//   node .claude/skills/superdesign/scripts/recon.mjs --target <url>         # REDESIGN the thing being replaced
//   node .claude/skills/superdesign/scripts/recon.mjs --registry <item>      # COMPOSE  the library's own demo
//   node .claude/skills/superdesign/scripts/recon.mjs --check                # the gate a phase calls
//
//   [--dir <d>]  where recon.json and ref/ live (default: cwd)
//   [--viewport 1440x900] [--theme light|dark] [--steal "…"]…  [--fresh]  [--json]
//
// EXIT-CODE CONTRACT — identical in every superdesign gate (ARCHITECTURE.md §2):
//   0        clean
//   1–63     the number of violations. A count above 63 is clamped to 63 and the line says so.
//   64–79    harness error — 64 usage · 65 missing dep · 66 navigation failed · 67 no target
//
// WHY THIS EXISTS. auteur's SKILL.md says the commit sheet cannot be filled until refscout has
// measured 3–6 references. `auteur-scripts.md` §4 grepped their whole repo: nothing reads
// COMMIT-SHEET.md, nothing checks REFERENCES.md exists, and the gate itself is one paragraph of
// instruction text ending "no playwright / no network → skip". A gate the gated agent can waive is
// prose, not enforcement. This one exits 1.
//
// THE STEAL LINE IS THE POINT. Measuring three sites and taking nothing from them is recon as
// ritual — the failure mode this file exists to stop. Every entry carries one "what we take from
// it" line, written by the caller, and an empty one fails the gate exactly as a missing
// measurement does. It is the only field in the schema a machine cannot fill.
//
// NO PHASE MAY BLOCK ON A NETWORK CALL (ARCHITECTURE.md §5), with one stated exception rather than
// a hidden one: BUILD accepts a hand-written recon.json flagged `measured:false` when no browser
// is available, and that flag survives into the JSON so Phase 5 reports "no reference" instead of
// a fabricated 6-of-6 differentiation score. REDESIGN has no escape hatch — the target IS the
// input, and a redesign from memory is recall, which is the defect this rebuild exists to fix.
//
// It re-implements no measurement. extract-reference.mjs owns that (source pass first, then the
// rendered DOM); recon orchestrates it, caches it, aggregates it, and gates on it.

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(realpathSync(fileURLToPath(import.meta.url)))
const EXTRACT = join(HERE, 'extract-reference.mjs')
const TTL_DAYS = 30          // ARCHITECTURE.md §5: ref/<name>.json keyed by url+viewport+theme
const BAND = [3, 6]          // auteur's band, and the reason: one reference is a copy target,
                             // three is a spectrum. Six is where a "spectrum" becomes a mood board.
const MIN_STEAL = 8            // a one-character steal line is the same dodge as an empty one
const MIN_STEAL_WORDS = 4      // a steal line names what you take; four distinct words is the floor

const argv = process.argv.slice(2)
const flag = (n) => { const i = argv.indexOf(`--${n}`); return i === -1 ? undefined : argv[i + 1] }
const has = (n) => argv.includes(`--${n}`)
const every = (n) => argv.flatMap((v, i) => (v === `--${n}` && argv[i + 1] && !argv[i + 1].startsWith('--') ? [argv[i + 1]] : []))

const USAGE = `usage:
  node .claude/skills/superdesign/scripts/recon.mjs --refs <url,url,url>  [--steal "…"]… [--dir .]   # BUILD
  node .claude/skills/superdesign/scripts/recon.mjs --target <url>        [--steal "…"]  [--dir .]   # REDESIGN
  node .claude/skills/superdesign/scripts/recon.mjs --registry <item> [--url <demo>]     [--dir .]   # COMPOSE
  node .claude/skills/superdesign/scripts/recon.mjs --check [--dir .]                                # the gate`

const dir = resolve(flag('dir') || '.')
const RECON = join(dir, 'recon.json')
const viewport = flag('viewport') || '1440x900'
const theme = flag('theme') || 'light'
const asJson = has('json')
const rel = (p) => relative(process.cwd(), p) || '.'

/* ── the gate ─────────────────────────────────────────────────────────────────────────────── */

// A length check alone lets `TBD TBD TBD` and `........` through, and nothing stopped the same
// sentence being pasted under all three references — which is recon as ritual, the exact failure
// this file's header claims to prevent. So: real words, and each reference must yield a DIFFERENT
// answer. Three identical steal lines mean one reference was measured and two were decoration.
const SENTINEL = /^(tbd|todo|n\/?a|none|nothing|same|idem|-+|\?+|\.+)$/i
const words = (t) => [...new Set(t.toLowerCase().match(/[a-z\u0400-\u04ff]{2,}/g) || [])]
const norm = (t) => t.toLowerCase().replace(/[^a-z0-9\u0400-\u04ff]+/g, ' ').trim()

function stealVerdict(s) {
  const t = String(s ?? '').trim()
  if (!t) return 'empty'
  if (/^_.*_$/.test(t) || /^<.*>$/.test(t)) return 'still the placeholder'
  if (SENTINEL.test(t)) return `"${t}" is a placeholder, not something taken`
  if (t.length < MIN_STEAL) return `${t.length} characters — under the ${MIN_STEAL} the gate asks for`
  const w = words(t)
  if (w.length < MIN_STEAL_WORDS) {
    return `${w.length} distinct word(s) — a steal line names what you take, in at least ${MIN_STEAL_WORDS}`
  }
  return null
}

// Cross-entry: run AFTER every line passes on its own. Returns a list of messages, empty when clean.
function stealCollisions(lines) {
  const seen = new Map()
  const out = []
  lines.forEach(({ name, steal }, i) => {
    const k = norm(String(steal ?? ''))
    if (!k) return
    if (seen.has(k)) {
      out.push(`references ${seen.get(k)} and ${name || `#${i + 1}`} take the same thing — "${String(steal).trim().slice(0, 60)}". Three references are a spectrum; one answer repeated is one reference.`)
    } else {
      seen.set(k, name || `#${i + 1}`)
    }
  })
  return out
}

function check() {
  if (!existsSync(RECON)) {
    console.error(`✗ recon: no recon.json in ${rel(dir)} — Phase 0 has not run, so Phase 1 may not start.`)
    console.error(`  BUILD needs --refs <url,url,url> (${BAND[0]}–${BAND[1]}) · REDESIGN needs --target <url> · COMPOSE needs --registry <item>`)
    return 1
  }
  let r
  try { r = JSON.parse(readFileSync(RECON, 'utf8')) } catch (e) {
    console.error(`✗ recon: ${rel(RECON)} is not parseable JSON — ${e.message.split('\n')[0]}`)
    return 1
  }
  const mode = r.mode
  if (!['build', 'redesign', 'compose'].includes(mode)) {
    console.error(`✗ recon: ${rel(RECON)} names no mode — it must be one of build · redesign · compose.`)
    return 1
  }
  const refs = Array.isArray(r.references) ? r.references : []
  let v = 0

  // Count first, because the band is the difference between a spectrum and a copy target.
  if (mode === 'build' && (refs.length < BAND[0] || refs.length > BAND[1])) {
    v++
    console.error(refs.length < BAND[0]
      ? `✗ recon: BUILD measured ${refs.length} reference(s); the band is ${BAND[0]}–${BAND[1]}. One reference is a copy target, ${BAND[0]} is a spectrum.`
      : `✗ recon: BUILD measured ${refs.length} references; the band is ${BAND[0]}–${BAND[1]}. Past ${BAND[1]} it is a mood board, not a read on the field.`)
  }
  if (mode === 'redesign' && refs.length !== 1) {
    v++
    console.error(`✗ recon: REDESIGN carries ${refs.length} entries; it takes exactly one — the target.`)
  }
  if (mode === 'compose' && refs.length < 1) { v++; console.error('✗ recon: COMPOSE measured no demo page.') }

  // The escape hatch, and the one place it does not exist.
  if (r.measured === false) {
    if (mode === 'redesign') {
      v++
      console.error('✗ recon: REDESIGN is flagged measured:false. There is no escape hatch here — the target IS the input,')
      console.error('    and a redesign from memory is recall. Install a browser (npm i -g agent-silver) and re-run --target.')
    } else {
      console.error('⚠ recon: measured:false — this file was hand-written, no browser ran. It passes, and Phase 5 must')
      console.error('    report "no reference" rather than a differentiation score computed against nothing.')
    }
  }

  for (const [i, e] of refs.entries()) {
    const name = e.name || e.url || `#${i + 1}`
    const bad = stealVerdict(e.steal)
    if (bad) {
      v++
      console.error(`✗ recon: ${name} — "what we take from it" is ${bad}. Fill \`steal\` in ${rel(RECON)}.`)
    }
    // An entry that claims a measurement must have one on disk. This is the anti-fabrication check:
    // a written-out recon.json is trivial to invent, a ref/<name>.json is not.
    if (e.measured !== false) {
      const f = e.file && (e.file.startsWith('/') ? e.file : join(dir, e.file))
      if (!f || !existsSync(f)) {
        v++
        console.error(`✗ recon: ${name} claims measured:true but ${e.file ? rel(f) : 'no measurement file'} is not on disk.`)
      } else if (e.fetchedAt && ageDays(e.fetchedAt) > TTL_DAYS) {
        console.error(`⚠ recon: ${name} was measured ${Math.round(ageDays(e.fetchedAt))} days ago — past the ${TTL_DAYS}-day TTL. Re-run with --fresh.`)
      }
    }
    if (!bad) console.log(`  [ok] ${String(name).padEnd(28)} ${e.measured === false ? 'unmeasured' : 'measured'} · steal: ${String(e.steal).trim()}`)
  }

  // Cross-entry, run after each line has passed on its own: three copies of one sentence are one
  // reference wearing three names.
  for (const msg of stealCollisions(refs.map((e, i) => ({ name: e.name || e.url || `#${i + 1}`, steal: e.steal })))) {
    v++
    console.error(`✗ recon: ${msg}`)
  }

  if (v === 0) console.log(`✓ recon: ${mode.toUpperCase()}, ${refs.length} reference(s), every steal line filled and distinct — Phase 1 may start.`)
  if (v > 63) console.error(`  (exit code clamped to 63; ${v} violation(s) found)`)
  return Math.min(v, 63)
}

const ageDays = (iso) => (Date.now() - Date.parse(iso)) / 86_400_000

/* ── measurement, via extract-reference.mjs, cached ───────────────────────────────────────── */

const slug = (url) => {
  try { const u = new URL(url); return `${u.hostname}${u.pathname}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') }
  catch { return String(url).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') }
}

/**
 * The cache key is url + viewport + theme, all three read back OUT of the stored report rather than
 * kept in a sidecar — a sidecar can disagree with the file it describes, a self-describing report
 * cannot. `reconFetchedAt` is stamped by us because extract-reference does not date its own output.
 * A hit is always printed: a silent cache is indistinguishable from a measurement that never ran.
 */
function cached(url) {
  const path = join(dir, 'ref', `${slug(url)}.json`)
  if (has('fresh') || !existsSync(path)) return null
  let r
  try { r = JSON.parse(readFileSync(path, 'utf8')) } catch { return null }
  if (r.url !== url || r.viewport !== viewport || r.theme !== theme) return null
  const age = r.reconFetchedAt ? ageDays(r.reconFetchedAt) : Infinity
  if (age > TTL_DAYS) { console.log(`  ↻ ${rel(path)} is ${Math.round(age)} days old (TTL ${TTL_DAYS}) — re-measuring`); return null }
  console.log(`  ↺ cache hit  ${rel(path)}  ${age.toFixed(1)} days old · key ${url} + ${viewport} + ${theme}`)
  return { report: r, path }
}

function measure(url) {
  const hit = cached(url)
  if (hit) return { ...hit, fromCache: true }
  const out = join(dir, 'ref', slug(url))
  mkdirSync(join(dir, 'ref'), { recursive: true })
  console.log(`  → measuring ${url}  (${viewport}, ${theme})`)
  try {
    execFileSync(process.execPath, [EXTRACT, '--url', url, '--viewport', viewport, '--theme', theme, '--out', out], { stdio: 'inherit' })
  } catch (e) {
    // Harness codes travel: 65 no browser, 66 navigation failed, 67 no target. They are NOT
    // violation counts and must never be reported as "1 reference short".
    const code = typeof e.status === 'number' ? e.status : 66
    return { harness: code >= 64 && code <= 79 ? code : 66 }
  }
  const path = `${out}.json`
  if (!existsSync(path)) return { harness: 66 }
  const report = JSON.parse(readFileSync(path, 'utf8'))
  report.reconFetchedAt = new Date().toISOString()
  writeFileSync(path, JSON.stringify(report, null, 2))
  return { report, path, fromCache: false }
}

/* ── aggregation — the reason 3 references beat 1 ─────────────────────────────────────────── */

const hue = (s) => { const m = /oklch\(([\d.]+) ([\d.]+) ([\d.]+)/.exec(s || ''); return m ? +m[3] : null }
const family = (r) => (r.type?.stacks?.[0]?.[0] || '').split(',')[0].replace(/["']/g, '').trim() || null
const shadowMode = (r) => (!r.shadow ? null : r.shadow.length <= 1 ? 'border-first' : r.shadow.length <= 3 ? 'restrained' : 'layered')

const digest = (r) => ({
  title: r.title, isDark: r.isDark,
  typeFamily: family(r), accent: r.palette?.accent || null, accentHue: hue(r.palette?.accent),
  accentShare: r.palette?.accentShare == null ? null : +r.palette.accentShare.toFixed(4),
  radiusBase: r.radius?.base ?? null, shadowMode: shadowMode(r),
  spacingUnit: r.spacing?.unit ?? null, measureCh: r.type?.measureCh ?? null,
  medianUiMs: r.motion?.medianUiMs ?? null,
  namedTokens: r.sourceTokens?.ok ? { names: r.sourceTokens.names, brand: r.sourceTokens.brandNames, themed: r.sourceTokens.themed } : null,
})

/**
 * Convergence, not averages. An axis every reference agrees on is the CATEGORY DEFAULT — it is
 * what Phase 1 must move away from, and it is invisible with one reference, which is the whole
 * argument for the band. Averaging the field would instead produce the most generic point in it.
 */
function spectrum(ds) {
  const axis = (k, fmt = (x) => x) => {
    const vals = ds.map((d) => d[k]).filter((x) => x !== null && x !== undefined)
    const uniq = [...new Set(vals.map(fmt))]
    return { values: vals.map(fmt), converged: vals.length >= 2 && uniq.length === 1 ? uniq[0] : null }
  }
  const hues = ds.map((d) => d.accentHue).filter((x) => x != null)
  const spread = hues.length >= 2 ? Math.max(...hues) - Math.min(...hues) : null
  return {
    typeFamily: axis('typeFamily'), radiusBase: axis('radiusBase'), shadowMode: axis('shadowMode'),
    spacingUnit: axis('spacingUnit'), medianUiMs: axis('medianUiMs'),
    // 30° is the same threshold extract-reference --diff calls the clone tell. A field that sits
    // inside it has one accent, not three, and Phase 1's differentiation target is exactly that arc.
    accentHue: { values: hues.map((h) => +h.toFixed(0)), spreadDeg: spread == null ? null : +spread.toFixed(0), converged: spread != null && spread < 30 ? +((Math.max(...hues) + Math.min(...hues)) / 2).toFixed(0) : null },
  }
}

/* ── modes ────────────────────────────────────────────────────────────────────────────────── */

function run(mode, urls, names) {
  const steals = every('steal')
  const entries = []
  for (const [i, url] of urls.entries()) {
    const m = measure(url)
    if (m.harness) {
      if (m.harness === 65 && mode === 'build') {
        console.error('✗ recon: no browser. BUILD may proceed on a hand-written recon.json — write it to')
        console.error(`    ${rel(RECON)} with "mode":"build", "measured":false, and ${BAND[0]}–${BAND[1]} entries that each carry a filled`)
        console.error('    "steal" line. It is accepted, it is flagged, and Phase 5 reports "no reference" instead of a score.')
      } else if (mode === 'redesign') {
        console.error(`✗ recon: could not measure the target ${url}.`)
        console.error('    REDESIGN has no offline path: the target IS the input, and a redesign from memory is recall.')
      }
      return { harness: m.harness }
    }
    entries.push({
      name: names?.[i] || slug(url), url, role: mode === 'redesign' ? 'target' : mode === 'compose' ? 'registry-demo' : 'reference',
      measured: true, cached: m.fromCache, fetchedAt: m.report.reconFetchedAt,
      file: relative(dir, m.path), steal: steals[i] ? String(steals[i]).trim() : '',
      digest: digest(m.report),
    })
  }
  const doc = {
    schema: 'superdesign/recon@1', mode, generatedAt: new Date().toISOString(),
    measured: true, viewport, theme, references: entries,
    spectrum: spectrum(entries.map((e) => e.digest)),
  }
  mkdirSync(dir, { recursive: true })
  writeFileSync(RECON, JSON.stringify(doc, null, 2))
  console.log(`\n✓ wrote ${rel(RECON)} — ${entries.length} entry/entries, ${entries.filter((e) => e.cached).length} from cache`)
  for (const [k, a] of Object.entries(doc.spectrum)) {
    if (a.converged !== null) console.log(`  ⇢ every reference agrees on ${k} = ${a.converged}${a.spreadDeg != null ? ` (spread ${a.spreadDeg}°, under the 30° clone tell)` : ''} — that is the category default, so Phase 1 must move it`)
  }
  const blanks = entries.filter((e) => stealVerdict(e.steal)).length
  if (blanks) {
    console.error(`\n✗ recon: ${blanks} of ${entries.length} entries have no "what we take from it" line.`)
    console.error(`    Open ${rel(RECON)}, fill each \`steal\`, then \`recon.mjs --check\`. Measuring and taking nothing is the failure mode.`)
  }
  if (asJson) console.log(JSON.stringify(doc, null, 2))
  return { violations: blanks }
}

/* ── dispatch ─────────────────────────────────────────────────────────────────────────────── */

if (has('check')) process.exit(check())

const refs = flag('refs'); const target = flag('target'); const registry = flag('registry')
const chosen = [refs && 'refs', target && 'target', registry && 'registry'].filter(Boolean)
if (chosen.length !== 1) {
  console.error(chosen.length ? `✗ recon: --refs, --target and --registry are three different jobs; you gave ${chosen.map((c) => '--' + c).join(' and ')}. Pick one.` : USAGE)
  process.exit(64) // 64 = usage
}
if (!existsSync(EXTRACT)) { console.error(`✗ recon: ${rel(EXTRACT)} is missing — recon measures nothing itself.`); process.exit(65) }

let r
if (refs) {
  const urls = refs.split(',').map((s) => s.trim()).filter(Boolean)
  if (urls.length < BAND[0] || urls.length > BAND[1]) {
    console.error(`✗ recon: ${urls.length} reference(s) given; BUILD takes ${BAND[0]}–${BAND[1]}. One reference is a copy target, ${BAND[0]} is a spectrum.`)
    process.exit(1)
  }
  r = run('build', urls)
} else if (target) {
  r = run('redesign', [target])
} else {
  // COMPOSE measures the library's own demo page — the registry item as its author renders it.
  const url = flag('url') || `https://ui.shadcn.com/docs/components/${registry}`
  r = run('compose', [url], [registry])
}

if (r.harness) process.exit(r.harness)
process.exit(Math.min(r.violations, 63))
