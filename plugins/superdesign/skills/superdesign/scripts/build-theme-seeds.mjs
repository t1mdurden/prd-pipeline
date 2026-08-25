#!/usr/bin/env node
// build-theme-seeds — regenerate data/theme-seeds.json from real shadcn builds.
//
// Phase 2 must not recall token values. It reads them. This script is the offline half of
// that: it runs `npx shadcn@latest init -p <code> -t next -y` into a throwaway directory,
// reads the `app/globals.css` that command actually wrote, and records those literal values.
// Nothing here is a model's memory of what indigo looks like — every OKLCH triple in the
// output file came out of a build that ran on this machine, and the row keeps the code so
// anyone can re-run the same command and diff.
//
// WHERE THE CODES COME FROM. `npx shadcn@latest preset` has decode / resolve|info / url /
// open — there is no `encode`, and no gallery, registry endpoint or page lists valid codes
// (`r/themes.json`, `r/presets.json`, `presets.json` are all 404; `/create` computes the
// theme client-side). So codes cannot be scraped. They also must not be invented. The third
// path, used here: the `shadcn` npm package itself ships the mixed-radix packing table in
// `dist/`; this script reads that table out of the installed package, packs a chosen field
// combination with the vendor's own scheme, and then proves the result twice —
//   1. `npx shadcn@latest preset decode <code> --json` must return exactly the fields asked for,
//   2. `init -p <code>` must succeed and write a globals.css.
// A code that fails either check is dropped and recorded in `failures`, never shipped. That
// is why `resolvedBy` is `"preset"` and `codeOrigin` is `"packed"`: discovered from the
// vendor's table, not guessed at, and confirmed by the vendor's own CLI before it counts.
//
// SELECTION RULE — 24 seeds, three bands, style/font/icons fixed so the axes stay legible:
//   A  7 rows · every baseColor the registry accepts x theme=blue x radius=default
//   B  8 rows · baseColor=neutral x 8 accent themes x all 5 radii cycled
//   C  9 rows · zinc/stone/taupe/mauve/olive x 8 themes + one monochrome mist/mist row
// The CLI's own table still lists `gray` in theme and baseColor; the registry answers 400
// for it, so the domains are probed against the registry and the plan is filtered by what
// came back, not by what the table claims.
// 24 rows that each ran beats 60 where half were guessed; `init` does a real npm install per
// row (~60s), so they run serially, each with a timeout, each project deleted after its CSS
// is read, and any failure is recorded rather than retried into a stall.
//
//   node .claude/skills/superdesign/scripts/build-theme-seeds.mjs
//   node .claude/skills/superdesign/scripts/build-theme-seeds.mjs --limit 2 --scratch /tmp/x
//   node .claude/skills/superdesign/scripts/build-theme-seeds.mjs --domains-only
//
// EXIT-CODE CONTRACT — identical in every superdesign gate (ARCHITECTURE.md §2):
//   0        clean
//   1–63     the number of violations. A count above 63 is clamped to 63 and the line says so.
//   64–79    harness error — 64 usage · 65 missing dep · 66 navigation failed · 67 no target

import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir, homedir } from 'node:os'

const SKILL_ROOT = resolve(new URL('../', import.meta.url).pathname)
const DATA_DIR = join(SKILL_ROOT, 'data')
const SEEDS_OUT = join(DATA_DIR, 'theme-seeds.json')
const DOMAINS_OUT = join(DATA_DIR, 'shadcn-preset-domains.json')

// ── args ──────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2)
const flag = (name) => argv.includes(name)
const opt = (name, dflt) => { const i = argv.indexOf(name); return i === -1 ? dflt : argv[i + 1] }
const LIMIT = Number(opt('--limit', '24'))
const SCRATCH = opt('--scratch', join(tmpdir(), 'superdesign-theme-seeds'))
const DOMAINS_ONLY = flag('--domains-only')
const TIMEOUT_MS = Number(opt('--timeout', String(6 * 60_000)))
const PROBE_MS = 30_000        // the CLI-reachable probe; NOT the per-seed install budget above
if (Number.isNaN(LIMIT) || LIMIT < 1) { console.error('usage: --limit <n> must be a positive integer'); process.exit(64) }

const stamp = new Date().toISOString()
const say = (...a) => console.log(...a)

// ── locate the shadcn package that `npx shadcn@latest` would run ──────────────
// The packing table lives in the published dist, not in any documented API, so it is found
// by SHAPE (an array of {key, values, bits}) rather than by minified export name — those
// names change on every build of the CLI, the shape has not.
function shadcnDistDirs() {
  const roots = [join(homedir(), '.npm', '_npx')]
  const out = []
  for (const root of roots) {
    if (!existsSync(root)) continue
    for (const d of readdirSync(root)) {
      const p = join(root, d, 'node_modules', 'shadcn')
      if (existsSync(join(p, 'package.json'))) out.push(p)
    }
  }
  return out
}

function cmpVersion(a, b) {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0)
  return 0
}

function loadPresetSpec() {
  // Warm the npx cache; also our first proof that the CLI is reachable at all.
  try {
    // A REACHABILITY PROBE, not a build. It shared the 180s per-seed install budget, so an
    // unroutable registry made this script sit silent for three minutes before failing honestly —
    // indistinguishable, while you wait, from a hang. A probe that has not answered in 30s has
    // answered.
    execFileSync('npx', ['--yes', 'shadcn@latest', 'preset', 'decode', 'a2r6bw', '--json'],
      { encoding: 'utf8', timeout: PROBE_MS, stdio: ['ignore', 'pipe', 'pipe'] })
  } catch (e) {
    console.error('shadcn CLI not runnable — `npx shadcn@latest preset decode` failed:', e.message)
    process.exit(65)
  }
  const pkgs = shadcnDistDirs()
    .map((p) => ({ p, v: JSON.parse(readFileSync(join(p, 'package.json'), 'utf8')).version }))
    .sort((a, b) => cmpVersion(b.v, a.v))
  for (const { p, v } of pkgs) {
    const dist = join(p, 'dist')
    if (!existsSync(dist)) continue
    for (const f of readdirSync(dist)) {
      if (!f.endsWith('.js')) continue
      const full = join(dist, f)
      const src = readFileSync(full, 'utf8')
      if (!src.includes('menuAccent') || !src.includes('bits:')) continue
      const spec = parseFieldSpec(src)
      if (spec.length >= 8) return { spec, version: v, source: full }
    }
  }
  console.error('could not find the shadcn preset packing table in any installed shadcn dist')
  process.exit(65)
}

// The table is read out of the minified bundle as TEXT, not imported: the arrays and the
// spec are module-local (`export{...}` publishes only the domains and the functions under
// one-letter aliases that change every release), so there is nothing stable to import. A
// text parse of someone else's bundle is brittle by nature — which is why nothing here is
// trusted on its own: every code it produces is decoded back by the CLI and then fed to a
// real `init`, so a parse that goes wrong shows up as failures, never as a bad row.
function parseFieldSpec(src) {
  const arrays = {}
  const resolve1 = (raw) => {
    const out = []
    for (const m of raw.matchAll(/"([^"]*)"|\.\.\.([A-Za-z_$][\w$]*)/g)) {
      if (m[1] !== undefined) out.push(m[1])
      else if (arrays[m[2]]) out.push(...arrays[m[2]])
      else return null
    }
    return out
  }
  // `var p=["nova",…]`, `g=["inherit",...E]`, and plain aliases `R=f`.
  for (const m of src.matchAll(/\b([A-Za-z_$][\w$]*)\s*=\s*\[((?:\s*(?:"[^"]*"|\.\.\.[A-Za-z_$][\w$]*)\s*,?)+)\]/g)) {
    const vals = resolve1(m[2])
    if (vals && vals.length) arrays[m[1]] = vals
  }
  for (const m of src.matchAll(/\b([A-Za-z_$][\w$]*)\s*=\s*([A-Za-z_$][\w$]*)\s*[,;]/g)) {
    if (!arrays[m[1]] && arrays[m[2]]) arrays[m[1]] = arrays[m[2]]
  }
  const spec = []
  const seen = new Set()
  for (const m of src.matchAll(/\{\s*key\s*:\s*"(\w+)"\s*,\s*values\s*:\s*([A-Za-z_$][\w$]*)\s*,\s*bits\s*:\s*(\d+)\s*\}/g)) {
    if (seen.has(m[1])) continue
    const values = arrays[m[2]]
    if (!values) return []
    seen.add(m[1])
    spec.push({ key: m[1], values, bits: Number(m[3]) })
  }
  return spec
}

// ── the vendor's packing, re-stated ───────────────────────────────────────────
// Mixed-radix: each field's index occupies `bits` bits of one integer, low field first;
// the integer is written base-62 and prefixed with the version tag. Re-stated here rather
// than called through a minified export so a CLI rename cannot silently change the meaning
// of a shipped code — and every code is decoded back through the CLI before it is used.
const B62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
const VERSION = 'b'

function encode(spec, values) {
  let n = 0, shift = 0
  for (const f of spec) {
    const i = f.values.indexOf(values[f.key])
    if (i === -1) throw new Error(`${values[f.key]} is not a valid ${f.key}`)
    n += i * 2 ** shift
    shift += f.bits
  }
  if (!Number.isSafeInteger(n)) throw new Error('packed value exceeded safe integer range')
  let s = ''
  if (n === 0) s = '0'
  for (let x = n; x > 0; x = Math.floor(x / 62)) s = B62[x % 62] + s
  return VERSION + s
}

// ── the 24 seeds ──────────────────────────────────────────────────────────────
const FIXED = { style: 'nova', font: 'inter', fontHeading: 'inherit', iconLibrary: 'lucide', menuAccent: 'subtle', menuColor: 'default' }
const RADII = ['none', 'small', 'default', 'medium', 'large']

// The CLI's local table and the registry's enum disagree, and the registry has a second
// rule the table cannot express: a neutral-family theme (`stone`, `zinc`, `mist`, …) is only
// available when it EQUALS the base color — `{baseColor:neutral, theme:stone}` comes back
// 400 "Theme \"stone\" is not available for base color \"neutral\"". Rather than remember any
// of that, ask: one request per value, a second request to tell a pairing rule apart from a
// dead value, and the answers decide what gets built.
async function serverDomains(spec) {
  const dom = Object.fromEntries(spec.map((f) => [f.key, f.values]))
  const url = (o) => 'https://ui.shadcn.com/init?' + new URLSearchParams({
    base: 'base', style: 'nova', baseColor: 'neutral', theme: 'blue', iconLibrary: 'lucide',
    font: 'inter', rtl: 'false', menuAccent: 'subtle', menuColor: 'default', radius: 'default', ...o,
  })
  const ask = async (o) => {
    try {
      const r = await fetch(url(o), { signal: AbortSignal.timeout(20_000) })
      return { ok: r.ok, body: r.ok ? '' : await r.text() }
    } catch { return null }
  }
  const baseColor = { ok: [], rejected: [] }
  for (const v of dom.baseColor ?? []) {
    const r = await ask({ baseColor: v, theme: 'blue' })
    if (!r) return null
    ;(r.ok ? baseColor.ok : baseColor.rejected).push(v)
  }
  const theme = { chromatic: [], neutralOnly: [], rejected: [] }
  for (const v of dom.theme ?? []) {
    // Probe against a base color that is NOT this theme, or the pairing rule hides itself:
    // `theme=neutral` passes against `baseColor=neutral` and fails against every other base.
    const other = baseColor.ok.find((b) => b !== v) ?? 'neutral'
    const r = await ask({ theme: v, baseColor: other })
    if (!r) return null
    if (r.ok) { theme.chromatic.push(v); continue }
    // Not available against `neutral` — is it dead, or is it the pairing rule?
    const paired = baseColor.ok.includes(v) ? await ask({ theme: v, baseColor: v }) : null
    if (!paired) { theme.rejected.push(v); continue }
    ;(paired.ok ? theme.neutralOnly : theme.rejected).push(v)
  }
  return { theme, baseColor }
}

const themeAllowed = (server, r) => !server
  || server.theme.chromatic.includes(r.theme)
  || (server.theme.neutralOnly.includes(r.theme) && r.theme === r.baseColor)

function plan(spec, server) {
  const dom = Object.fromEntries(spec.map((f) => [f.key, f.values]))
  const bases = server ? server.baseColor.ok : dom.baseColor
  const rows = []
  // A — every base neutral the registry accepts, one accent held fixed. Isolates the base.
  bases.forEach((baseColor) => rows.push({ band: 'A', baseColor, theme: 'blue', radius: 'default' }))
  // B — one base neutral, the accent swept, every radius touched. Isolates the accent.
  const bandB = ['violet', 'emerald', 'rose', 'amber', 'cyan', 'red', 'teal', 'orange']
  bandB.forEach((theme, i) => rows.push({ band: 'B', baseColor: 'neutral', theme, radius: RADII[i % RADII.length] }))
  // C — the cross terms, plus one monochrome row where theme and base are the same neutral.
  const bandC = [
    { baseColor: 'zinc', theme: 'indigo', radius: 'small' },
    { baseColor: 'stone', theme: 'purple', radius: 'medium' },
    { baseColor: 'taupe', theme: 'pink', radius: 'large' },
    { baseColor: 'zinc', theme: 'lime', radius: 'none' },
    { baseColor: 'stone', theme: 'sky', radius: 'default' },
    { baseColor: 'taupe', theme: 'yellow', radius: 'small' },
    { baseColor: 'mauve', theme: 'green', radius: 'medium' },
    { baseColor: 'olive', theme: 'fuchsia', radius: 'large' },
    { baseColor: 'mist', theme: 'mist', radius: 'none' },
  ]
  bandC.forEach((r) => rows.push({ band: 'C', ...r }))
  return rows
    .filter((r) => bases.includes(r.baseColor) && themeAllowed(server, r))
    .map((r) => ({ ...FIXED, ...r, chartColor: r.theme }))
}

// ── running one seed ──────────────────────────────────────────────────────────
function run(cmd, args, cwd, timeout) {
  return execFileSync(cmd, args, { cwd, encoding: 'utf8', timeout, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, CI: '1' } })
}

function decodeCode(code) {
  const out = run('npx', ['--yes', 'shadcn@latest', 'preset', 'decode', code, '--json'], SCRATCH, 180_000)
  return JSON.parse(out)
}

// `--radius: 0.625rem` and 30-odd `oklch(...)` customs, split by the block they sit in.
function parseGlobals(css) {
  const block = (head) => {
    const i = css.indexOf(head)
    if (i === -1) return null
    const open = css.indexOf('{', i)
    let depth = 0
    for (let j = open; j < css.length; j++) {
      if (css[j] === '{') depth++
      else if (css[j] === '}' && --depth === 0) return css.slice(open + 1, j)
    }
    return null
  }
  const vars = (body) => {
    const out = {}
    if (!body) return out
    for (const m of body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) out[m[1]] = m[2].trim()
    return out
  }
  const root = vars(block('\n:root'))
  const dark = vars(block('\n.dark'))
  const only = (o, pred) => Object.fromEntries(Object.entries(o).filter(([k, v]) => pred(k, v)))
  const isColor = (k, v) => v.startsWith('oklch(')
  return {
    light: only(root, isColor),
    dark: only(dark, isColor),
    radius: root['--radius'] ?? null,
  }
}

// next/font wires the families in layout.tsx; the CSS only sees `var(--font-sans)`.
function parseFonts(layout) {
  const imports = [...layout.matchAll(/import\s*{([^}]+)}\s*from\s*"next\/font\/google"/g)]
    .flatMap((m) => m[1].split(',').map((s) => s.trim()).filter(Boolean))
  const fonts = { families: imports }
  for (const m of layout.matchAll(/(\w+)\s*\(\s*{[^}]*variable\s*:\s*['"](--font-[a-z-]+)['"]/g)) {
    fonts[m[2].replace('--font-', '')] = m[1]
  }
  return fonts
}

// ── main ──────────────────────────────────────────────────────────────────────
const { spec, version, source } = loadPresetSpec()
mkdirSync(SCRATCH, { recursive: true })
mkdirSync(DATA_DIR, { recursive: true })

const domains = Object.fromEntries(spec.map((f) => [f.key, f.values]))
const rows = []
const failures = []
let serverValid = null
const goodCodes = []

const writeSeeds = () => writeFileSync(SEEDS_OUT, JSON.stringify({
  $comment: 'Generated by scripts/build-theme-seeds.mjs — never hand-edit. Every row is the literal app/globals.css written by `npx shadcn@latest init -p <code> -t next -y`.',
  generator: 'scripts/build-theme-seeds.mjs',
  cliVersion: version,
  fetchedAt: stamp,
  count: rows.length,
  selectionRule: '24 seeds, style=nova, font=inter, fontHeading=inherit, icons=lucide, menu default/subtle held fixed. Band A (7): every baseColor the registry accepts x theme=blue x radius=default. Band B (8): baseColor=neutral x 8 accent themes x all 5 radii cycled. Band C (9): zinc/stone/taupe x 9 further themes x radii cycled. Capped at 24 because init runs a real npm install per row and an honest 24 beats 60 half-guessed.',
  codeOrigin: "packed with the shadcn package's own mixed-radix table, then round-tripped through `preset decode --json` and through a real `init` before the row was kept",
  failures,
  seeds: rows,
}, null, 2) + '\n')

const writeDomains = () => writeFileSync(DOMAINS_OUT, JSON.stringify({
  $comment: 'Generated by scripts/build-theme-seeds.mjs. Domains are read out of the shadcn package\'s own preset packing table, never from memory.',
  fetchedAt: stamp,
  cliVersion: version,
  source: source.replace(homedir(), '~'),
  encodable: false,
  note: 'The CLI exposes decode/resolve/url/open and no encode. `theme` here is the CLI-side table; the registry at ui.shadcn.com/init rejects `gray`, so serverThemeRejected records what a real request proved.',
  theme: domains.theme ?? [],
  font: domains.font ?? [],
  fontHeading: domains.fontHeading ?? [],
  iconLibrary: domains.iconLibrary ?? [],
  radius: domains.radius ?? [],
  baseColor: domains.baseColor ?? [],
  style: domains.style ?? [],
  menuAccent: domains.menuAccent ?? [],
  menuColor: domains.menuColor ?? [],
  chartColor: domains.chartColor ?? [],
  bits: Object.fromEntries(spec.map((f) => [f.key, f.bits])),
  serverValidated: serverValid ? {
    probedAt: stamp,
    endpoint: 'https://ui.shadcn.com/init?…&theme=<v>&baseColor=<v>',
    themeAnyBase: serverValid.theme.chromatic,
    themeOnlyWhenEqualToBaseColor: serverValid.theme.neutralOnly,
    themeRejected: serverValid.theme.rejected,
    baseColor: serverValid.baseColor.ok,
    baseColorRejected: serverValid.baseColor.rejected,
  } : null,
  knownGoodCodes: goodCodes,
}, null, 2) + '\n')

const server = await serverDomains(spec)
if (!server) say('registry probe unavailable — falling back to the CLI-side domain table')
serverValid = server
writeDomains()
if (DOMAINS_ONLY) { say(`wrote ${DOMAINS_OUT}`); process.exit(0) }

const wanted = plan(spec, server).slice(0, LIMIT)
say(`shadcn ${version} · ${wanted.length} seeds · scratch ${SCRATCH}`)

for (const [i, want] of wanted.entries()) {
  const { band, ...fields } = want
  let code
  try { code = encode(spec, fields) } catch (e) { failures.push({ want, stage: 'encode', error: e.message }); continue }
  const label = `${i + 1}/${wanted.length} ${code} ${want.baseColor}/${want.theme}/${want.radius}`
  // 1. the vendor's own decoder must agree the code means what we packed.
  let decoded
  try { decoded = decodeCode(code) } catch (e) { failures.push({ code, want, stage: 'decode', error: String(e.message).slice(0, 300) }); say(`✗ ${label} decode`); continue }
  const mismatch = Object.entries(fields).filter(([k, v]) => decoded.values?.[k] !== v)
  if (mismatch.length) { failures.push({ code, want, stage: 'decode', error: `round-trip mismatch: ${mismatch.map(([k]) => k).join(',')}` }); say(`✗ ${label} round-trip`); continue }
  // 2. a real build must accept it and write a real globals.css.
  const dir = mkdtempSync(join(SCRATCH, 'seed-'))
  const name = `s${i}`
  try {
    run('npx', ['--yes', 'shadcn@latest', 'init', '-p', code, '-t', 'next', '-y', '-n', name], dir, TIMEOUT_MS)
    const proj = join(dir, name)
    const css = readFileSync(join(proj, 'app', 'globals.css'), 'utf8')
    const { light, dark, radius } = parseGlobals(css)
    if (!Object.keys(light).length) throw new Error('no oklch customs in :root')
    const layoutPath = join(proj, 'app', 'layout.tsx')
    const fonts = existsSync(layoutPath) ? parseFonts(readFileSync(layoutPath, 'utf8')) : {}
    rows.push({ code, light, dark, radius, fonts, resolvedBy: 'preset', codeOrigin: 'packed', values: decoded.values, band: band ?? null, fetchedAt: new Date().toISOString() })
    goodCodes.push(code)
    say(`✓ ${label} ${Object.keys(light).length} light / ${Object.keys(dark).length} dark`)
  } catch (e) {
    failures.push({ code, want, stage: 'init', error: String(e.stderr || e.message).slice(0, 300) })
    say(`✗ ${label} init`)
  } finally {
    rmSync(dir, { recursive: true, force: true })   // 24 Next.js trees is 7 GB otherwise
    writeSeeds(); writeDomains()                    // incremental: a killed run keeps its rows
  }
}

writeSeeds(); writeDomains()
say(`\n${rows.length} seeds → ${SEEDS_OUT}`)
say(`${failures.length} failures`)
if (!rows.length) { console.error('no seed resolved — nothing was written that a build produced'); process.exit(67) }
if (failures.length) { const n = Math.min(failures.length, 63); if (failures.length > 63) say(`(${failures.length} failures, clamped to 63)`); process.exit(n) }
process.exit(0)
