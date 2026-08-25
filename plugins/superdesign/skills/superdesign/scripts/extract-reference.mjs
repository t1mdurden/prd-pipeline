#!/usr/bin/env node
// extract-reference — measure a live page's design system so a reference becomes six numbers
// instead of an adjective. Phase 0 of the loop (SKILL.md → "Reference mining"), never Phase 2.
//
//   node scripts/extract-reference.mjs --url https://example.com
//   node scripts/extract-reference.mjs --url <url> --viewport 1440x900 --theme dark --json
//   node scripts/extract-reference.mjs --url <url> --out ref/example    # writes .md + .json
//   node scripts/extract-reference.mjs --diff ref/example.json ref/ours.json   # the clone gate
//                                       ↑ also prints the system-maturity line: how many tokens
//                                         each side NAMES, which the six mechanics cannot express
//
// Emits the SIX MECHANICS that `brand-to-system.md` § "Capturing a named product reference"
// demands — type pairing and weights, palette with roles, radius, elevation recipe,
// grid/measure, motion — plus the five design dials, measured rather than guessed.
//
// TWO PASSES, and they answer different questions. The SOURCE pass runs first, over plain HTTP,
// before any browser exists: it fetches the document, resolves every stylesheet, and reads the
// custom-property DECLARATIONS with their selector context — that is the only route to a token's
// NAME and to the theme that was not on screen. The BROWSER pass then measures what the page
// actually painted. Neither overwrites the other: `radius: 8px` and `--radius-lg: 8px` are the
// same number and different facts, and a declared token no element uses is a third fact again.
// Section 7 of the card is the parity check between them.
//
// Needs Playwright, which this repo does not vendor. It is borrowed — in order — from this
// script's directory, the cwd, then `silver`'s own install. silver IS a local headless Playwright,
// so on a machine that can run silver there is nothing to install. Otherwise, in any project:
//   npm i -g agent-silver          # preferred; also gives you the driving/QA loop
//   npm i -D playwright && npx playwright install chromium     # or just the engine
//
// This measures PUBLIC RENDERED OUTPUT — the same computed styles any visitor's devtools show.
// It does not defeat auth, and it does not copy: the output is an input to a *differentiation*
// step (→ references/reference-mining.md § "The differentiation rule"), never a theme to ship.
//
// EXIT-CODE CONTRACT — identical in every superdesign gate (ARCHITECTURE.md §2):
//   0        clean
//   1–63     the number of violations. A count above 63 is clamped to 63 and the line says so.
//   64–79    harness error — 64 usage · 65 missing dep · 66 navigation failed · 67 no target
// A measurement run only ever exits 0 or a harness code; --diff is the mode with violations,
// and there a violation is one of the six mechanics that did not move (plus the accent-hue tell).

import { createRequire } from 'node:module'
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { delimiter, dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

const argv = process.argv.slice(2)
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i === -1 ? d : argv[i + 1] }
const url = arg('url')
const out = arg('out')
const theme = arg('theme', 'light')
const asJson = argv.includes('--json')
const [vw, vh] = String(arg('viewport', '1440x900')).split('x').map(Number)
const diffPair = argv.indexOf('--diff')

const USAGE = `usage:
  node scripts/extract-reference.mjs --url <url> [--viewport 1440x900] [--theme light|dark] [--out path] [--json]
  node scripts/extract-reference.mjs --diff <reference.json> <ours.json>`

if (diffPair !== -1) { await differentiationGate(argv[diffPair + 1], argv[diffPair + 2]); process.exit(0) }
if (!url) { console.error(USAGE); process.exit(64) } // 64 = usage

/**
 * Find Playwright without asking anyone to install it. Three places, in order:
 *   1. next to this script — a checkout that vendored it;
 *   2. the cwd — the project under audit (ESM resolves a BARE import against the script's own
 *      directory, not the cwd, so this needs an explicit createRequire and is not the default it
 *      looks like);
 *   3. `silver`'s own install — silver IS a local headless Playwright, so if the machine can run
 *      silver it can already run this, and the "npm i -D playwright" step is noise.
 */
function silverRoot() {
  const exts = process.platform === 'win32' ? ['.cmd', '.exe', ''] : ['']
  for (const dir of (process.env.PATH || '').split(delimiter)) {
    for (const ext of exts) {
      const bin = join(dir, `silver${ext}`)
      if (!existsSync(bin)) continue
      let p = dirname(realpathSync(bin)) // dist/cli.js → dist → the package root
      for (let up = 0; up < 4; up++, p = dirname(p)) if (existsSync(join(p, 'node_modules'))) return p
    }
  }
  return null
}

async function need(name) {
  try { return await import(name) } catch { /* not next to the script */ }
  for (const base of [process.cwd(), silverRoot()].filter(Boolean)) {
    try {
      const req = createRequire(pathToFileURL(join(base, 'package.json')))
      return await import(pathToFileURL(req.resolve(name)).href)
    } catch { /* not there either */ }
  }
  throw new Error(`${name} is not resolvable from this script, from ${process.cwd()}, or from silver`)
}

/**
 * The differentiation gate. Mining a reference is legitimate; shipping it is not, and "we changed
 * it enough" is exactly the claim a model will make about a clone. So make it a count: of the six
 * mechanics, at least THREE must differ, and the accent hue may never land within 10° of the
 * reference's — a matching accent is the single tell a viewer reads as "this is that product".
 * Exit code = the number of failures. This is the measurable half of § The differentiation rule.
 */
async function differentiationGate(refPath, oursPath) {
  if (!refPath || !oursPath) { console.error(USAGE); process.exit(64) } // 64 = usage
  let R, O
  try { R = JSON.parse(readFileSync(refPath, 'utf8')); O = JSON.parse(readFileSync(oursPath, 'utf8')) } catch (e) {
    console.error(`✗ ${e.message.split('\n')[0]}`)
    console.error('  Both arguments are the .json written by --out. Capture your own build first:')
    console.error('    node scripts/extract-reference.mjs --url <your dev-server url> --out ref/ours')
    process.exit(67) // 67 = no target — the .json to compare against is missing or unparseable
  }
  const hue = (s) => { const m = /oklch\(([\d.]+) ([\d.]+) ([\d.]+)/.exec(s || ''); return m ? { L: +m[1], C: +m[2], H: +m[3] } : null }
  const fam = (r) => (r.type.stacks?.[0]?.[0] || '').split(',')[0].replace(/["']/g, '').trim().toLowerCase()
  const rh = hue(R.palette.accent); const oh = hue(O.palette.accent)
  const dH = rh && oh ? Math.min(Math.abs(rh.H - oh.H), 360 - Math.abs(rh.H - oh.H)) : 180
  const shadowMode = (r) => (r.shadow.length <= 1 ? 'border-first' : r.shadow.length <= 3 ? 'restrained' : 'layered')

  const axes = [
    ['type family', fam(R) !== fam(O), `${fam(R) || '—'} → ${fam(O) || '—'}`],
    ['accent hue', dH >= 30, `${rh ? rh.H.toFixed(0) : '—'}° → ${oh ? oh.H.toFixed(0) : '—'}° (Δ${dH.toFixed(0)}°)`],
    ['radius base', R.radius.base !== O.radius.base, `${R.radius.base}px → ${O.radius.base}px`],
    ['elevation', shadowMode(R) !== shadowMode(O), `${shadowMode(R)} → ${shadowMode(O)}`],
    ['grid / measure', R.spacing.unit !== O.spacing.unit || Math.abs((R.type.measureCh || 0) - (O.type.measureCh || 0)) >= 8,
      `${R.spacing.unit}px·${R.type.measureCh ?? '—'}ch → ${O.spacing.unit}px·${O.type.measureCh ?? '—'}ch`],
    ['motion', Math.abs((R.motion.medianUiMs || 0) - (O.motion.medianUiMs || 0)) >= 40 ||
      (R.motion.easings?.[0]?.[0] || '') !== (O.motion.easings?.[0]?.[0] || ''),
      `${R.motion.medianUiMs ?? '—'}ms → ${O.motion.medianUiMs ?? '—'}ms`],
  ]
  const moved = axes.filter(([, d]) => d).length
  console.log(`differentiation — ${R.title || refPath}  vs  ${O.title || oursPath}\n`)
  for (const [name, differs, detail] of axes) console.log(`  [${differs ? 'MOVED' : 'SAME '}] ${name.padEnd(15)} ${detail}`)


  // SYSTEM MATURITY — not a seventh mechanic and deliberately not part of the exit code. The six
  // axes above ask "did we move far enough from the reference"; this one asks "does our system
  // have as much system in it". A build that matched all six and names 4 tokens against the
  // reference's 47 has not been differentiated, it has been under-built, and the six axes cannot
  // see the difference. Absent on any .json captured before the source pass existed.
  const mat = (r) => (r.sourceTokens && r.sourceTokens.ok ? r.sourceTokens : null)
  const RT = mat(R); const OT = mat(O)
  const matLine = (t, r) => (t
    ? `${String(t.names).padStart(4)} names · ${t.brandNames} after framework scales · ${t.themed} re-pointed for dark at the root (+${t.themedScoped || 0} scoped) · ${t.scopedOnly} component-scoped only`
    : r.sourceTokens ? `   — no token layer reached (${r.sourceTokens.reason})` : '   — captured before the source pass existed; re-run --url to add it')
  console.log('\n  system maturity (not scored — the six axes cannot express it)')
  console.log(`    reference  ${matLine(RT, R)}`)
  console.log(`    ours       ${matLine(OT, O)}`)
  if (RT && OT) {
    const d = RT.brandNames - OT.brandNames
    console.log(d > 0
      ? `    → the reference names ${d} more tokens than we do (${RT.brandNames} vs ${OT.brandNames}). Every value we did not name is a value nobody can re-theme.`
      : d < 0 ? `    → we name ${-d} more tokens than the reference (${OT.brandNames} vs ${RT.brandNames}) — check they are used, not just declared.`
        : `    → both name ${OT.brandNames} tokens.`)
    if (RT.themed + (RT.themedScoped || 0) > 0 && OT.themed + (OT.themedScoped || 0) === 0) console.log('    → the reference re-points tokens for dark; we re-point none. Our build is single-theme.')
  }

  let failures = 0
  if (moved < 3) { failures += 3 - moved; console.log(`\n✗ only ${moved} of 6 mechanics moved — 3 is the floor`) }
  if (dH < 10) { failures++; console.log(`✗ accent hue is within ${dH.toFixed(0)}° of the reference — that is the clone tell, move it`) }
  console.log(failures === 0 ? `\n✓ differentiated: ${moved}/6 mechanics moved, accent Δ${dH.toFixed(0)}°` : '')
  // Contract: 1–63 is the violation count. This one maxes out at 4, but clamp for uniformity.
  if (failures > 63) console.log(`  (exit code clamped to 63; ${failures} failure(s) found)`)
  process.exit(Math.min(failures, 63))
}

let chromium
try {
  const pw = await need('playwright')
  chromium = pw.chromium ?? pw.default?.chromium // a cwd-resolved CJS build lands under `default`
  if (!chromium) throw new Error('playwright resolved but exports no `chromium`')
} catch (e) {
  console.error('✗ extract-reference needs playwright, which this repo does not vendor.')
  console.error('  npm i -g agent-silver          # preferred — silver ships one, and drives pages too')
  console.error('  npm i -D playwright && npx playwright install chromium   # or just the engine')
  console.error(`  (tried this script's dir, ${process.cwd()}, and silver: ${e.message.split('\n')[0]})`)
  process.exit(65) // 65 = missing dep
}

/* ── colour: whatever the browser serialised → OKLCH ─────────────────────────────────────── */

const lin = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)

/** linear sRGB → OKLCH [L, C, H]. Björn Ottosson's matrices, same pair as validate-chart-palette. */
function linearToOklch(r, g, b) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  const C = Math.hypot(A, B)
  let H = (Math.atan2(B, A) * 180) / Math.PI
  if (H < 0) H += 360
  return [L, C, C < 0.0015 ? 0 : H] // hue is meaningless at neutral chroma; report 0, not noise
}

/** Any computed colour string → {L,C,H,a} or null. Chrome serialises modern spaces verbatim. */
function parseColor(str) {
  if (!str || str === 'transparent' || str === 'none') return null
  let m = str.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,/\s]+([\d.%]+))?/i)
  if (m) {
    const a = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4])
    if (a === 0) return null
    const [L, C, H] = linearToOklch(lin(+m[1] / 255), lin(+m[2] / 255), lin(+m[3] / 255))
    return { L, C, H, a }
  }
  m = str.match(/^oklch\(\s*([\d.]+%?)\s+([\d.]+%?)\s+([\d.]+)(?:deg)?(?:\s*\/\s*([\d.%]+))?/i)
  if (m) {
    const pc = (v, s) => (v.endsWith('%') ? (parseFloat(v) / 100) * s : parseFloat(v))
    const a = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4])
    if (a === 0) return null
    return { L: pc(m[1], 1), C: pc(m[2], 0.4), H: parseFloat(m[3]), a }
  }
  m = str.match(/^color\(\s*srgb\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)(?:\s*\/\s*([\d.%]+))?/i)
  if (m) {
    const a = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4])
    if (a === 0) return null
    const [L, C, H] = linearToOklch(lin(+m[1]), lin(+m[2]), lin(+m[3]))
    return { L, C, H, a }
  }
  // Tailwind v4 is this skill's own target stack, and Chrome serialises its `color-mix()` results
  // and non-sRGB authored colours as `oklab()` / `lab()` — not as rgb(). Without these two, every
  // border and every mixed surface on a v4 site parses to null and the card reports "borderless".
  m = str.match(/^oklab\(\s*([\d.]+%?)\s+([\d.eE+-]+)\s+([\d.eE+-]+)(?:\s*\/\s*([\d.%]+))?/i)
  if (m) {
    const a = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4])
    if (a === 0) return null
    const L = m[1].endsWith('%') ? parseFloat(m[1]) / 100 : parseFloat(m[1])
    const A = +m[2]; const B = +m[3]
    const C = Math.hypot(A, B); let H = (Math.atan2(B, A) * 180) / Math.PI
    if (H < 0) H += 360
    return { L, C, H: C < 0.0015 ? 0 : H, a }
  }
  m = str.match(/^lab\(\s*([\d.]+%?)\s+([\d.eE+-]+)\s+([\d.eE+-]+)(?:\s*\/\s*([\d.%]+))?/i)
  if (m) {
    const a = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4])
    if (a === 0) return null
    // CIE Lab is D50-referred per CSS Color 4; sRGB is D65. Skipping the Bradford adaptation puts
    // neutrals off by a visible amount of yellow, which would then read as brand chroma.
    const L = m[1].endsWith('%') ? parseFloat(m[1]) : parseFloat(m[1])
    const fy = (L + 16) / 116; const fx = fy + +m[2] / 500; const fz = fy - +m[3] / 200
    const f = (t) => (t ** 3 > 216 / 24389 ? t ** 3 : (116 * t - 16) / 903.3)
    const D50 = [0.3457 / 0.3585, 1, (1 - 0.3457 - 0.3585) / 0.3585]
    const [X, Y, Z] = [f(fx) * D50[0], (L > 8 ? fy ** 3 : L / 903.3) * D50[1], f(fz) * D50[2]]
    const BRAD = [[0.9554734527042182, -0.023098536874261423, 0.0632593086610217],
      [-0.028369706963208136, 1.0099954580058226, 0.021041398966943008],
      [0.012314001688319899, -0.020507696433477912, 1.3303659366080753]] // D50 → D65
    const [x, y, z] = BRAD.map((r) => r[0] * X + r[1] * Y + r[2] * Z)
    const XYZ2RGB = [[3.2409699419045226, -1.537383177570094, -0.4986107602930034],
      [-0.9692436362808796, 1.8759675015077202, 0.04155505740717559],
      [0.05563007969699366, -0.20397695888897652, 1.0569715142428786]]
    const [r, g, b] = XYZ2RGB.map((row) => row[0] * x + row[1] * y + row[2] * z)
    const [Lo, Co, Ho] = linearToOklch(r, g, b)
    return { L: Lo, C: Co, H: Ho, a }
  }
  return null
}

const fmt = (c) => `oklch(${c.L.toFixed(3)} ${c.C.toFixed(3)} ${c.H.toFixed(1)})${c.a < 1 ? ` / ${c.a.toFixed(2)}` : ''}`
const key = (c) => `${c.L.toFixed(2)}|${c.C.toFixed(2)}|${(c.C < 0.02 ? 0 : Math.round(c.H / 4) * 4)}|${c.a.toFixed(2)}`


/* ── the SOURCE pass: named tokens, read from the stylesheets before the browser starts ───── */

// `getComputedStyle` answers "what did this element end up as". It cannot answer "what is this
// value called", and it only ever sees the one theme and the one set of states that happened to be
// on screen. The source pass answers both: fetch the document, resolve every stylesheet it links,
// and read the custom-property DECLARATIONS *with their selector context*. `--radius: 8px` under
// `:root` and the same name re-pointed under `.dark` are two facts the rendered page shows as one
// number, and a token no element on this page uses is invisible to the browser pass entirely.
//
// Strictly ADDITIVE. Nothing here overwrites a measured value: a declared token with no rendered
// use and a measured value with no name are different findings, and the card prints both.
// Adapted from researchfms `framer/tools/extract_tokens.py`, which recovered 864 light+dark
// `--framer-fresco-*` tokens from Framer's editor CSS by exactly this route.

const SRC = { sheets: 40, bytesPerSheet: 3_000_000, bytesTotal: 12_000_000, perFetchMs: 12_000, totalMs: 30_000 }
const SRC_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

// A selector that IS the document root, once theme markers are stripped off it. `:root`, `html`,
// `body`, `:host`, `:where(:root)` and `:root.dark` all declare a token for the whole page; a
// `.btn` does not. Getting this wrong is the difference between a design system and a component.
const ROOTISH = /^(?::root|html|body|\*|:host(?:\([^)]*\))?|::?backdrop)(?::{1,2}[a-z-]+(?:\([^)]*\))?)*$/i
// Theme markers, in three tiers of authority. The tiers exist because of one real site: GitHub
// ships `[data-color-mode=dark][data-dark-theme=light]` — "the OS is dark and the user chose the
// LIGHT palette for it". Reading the mode attribute there files every light value under `dark` and
// inverts the whole census. An attribute whose NAME contains `theme` is the theme; `color-mode`,
// `mode` and `scheme` are only the switch, and a class marker is the last resort.
const THEME_ATTR = /\[data-[\w-]*theme[\w-]*[~^|$*]?=\s*["']?(dark|light)/gi
const MODE_ATTR = /\[data-[\w-]*(?:color-?mode|mode|scheme|bs-theme)[\w-]*[~^|$*]?=\s*["']?(dark|light)/gi
const CLASS_MARK = /[.#](?:theme-|mode-)?(dark|light)(?:-mode|-theme)?(?![\w-])/gi

/** One compound selector → 'dark' | 'light' | null. `null` also means "the markers disagree". */
function themeOfSelector(sel) {
  for (const re of [THEME_ATTR, MODE_ATTR, CLASS_MARK]) {
    const hits = [...sel.matchAll(re)].map((m) => m[1].toLowerCase())
    if (!hits.length) continue
    return hits.every((h) => h === hits[0]) ? hits[0] : null
  }
  return null
}

/** A whole selector list plus its at-rule context → the theme it declares for, or null. */
function classifyTheme(selText, atText) {
  // The SELECTOR outranks the media query, and that order is not cosmetic. GitHub's light bundle
  // contains `@media (prefers-color-scheme:dark){[data-color-mode=auto][data-dark-theme=light]{…}}`
  // — the LIGHT palette, served to a dark OS because the user asked for it. Reading the media
  // query first files all 700 of those under `dark` and the census reports light == dark.
  const themes = selText.split(',').map((x) => x.trim()).filter(Boolean).map(themeOfSelector).filter(Boolean)
  if (themes.length) return themes.every((t) => t === themes[0]) ? themes[0] : null
  if (/prefers-color-scheme\s*:\s*dark/i.test(atText)) return 'dark'
  if (/prefers-color-scheme\s*:\s*light/i.test(atText)) return 'light'
  return null
}
// Only the two things that are genuinely somebody else's defaults: Tailwind's internal `--tw-*`
// plumbing and a wholesale colour-scale dump. A `--radius-md` is NOT filtered even though Tailwind
// v4 ships one — if a site kept it, it is that site's radius scale.
const FRAMEWORK_SCALE = /^--tw-|^--(?:colors?)-(?:slate|gray|grey|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}$|^--(?:colors?)-(?:transparent|current|black|white|inherit)$/i

const TOKEN_CATEGORY = [
  [/(?:^|-)(?:radius|rounded|corner)(?:$|-)/i, 'radius'],
  [/(?:^|-)(?:shadow|elevation|depth)(?:$|-)/i, 'shadow'],
  [/(?:^|-)(?:duration|dur|ease|easing|timing|transition|motion|animate|animation|spring)(?:$|-)/i, 'motion'],
  [/(?:^|-)(?:font|text|type|leading|tracking|weight|letter|line-height)(?:$|-)/i, 'type'],
  [/(?:^|-)(?:space|spacing|gap|gutter|pad|padding|margin|inset|size|width|height)(?:$|-)/i, 'space'],
  [/(?:^|-)(?:colou?r|bg|background|fg|foreground|surface|border|ring|outline|accent|brand|primary|secondary|tertiary|muted|subtle|destructive|danger|success|warning|error|info|chart|sidebar|card|popover|overlay|input|link|on)(?:$|-)/i, 'color'],
  [/(?:^|-)(?:z|layer|opacity|alpha|blur|breakpoint|screen|container|aspect|grid|column)(?:$|-)/i, 'layout'],
]

/** Split a selector list and ask whether EVERY part declares at document-root level. */
function rootLevel(sel) {
  const parts = sel.split(',').map((s) => s.trim()).filter(Boolean)
  if (!parts.length) return false
  return parts.every((p) => {
    let s = p.replace(/^&\s*/, '').trim()
    for (let i = 0; i < 3; i++) s = s.replace(/^:(?:where|is)\(([^()]*)\)$/i, '$1').trim()
    // strip the theme marker itself — `:root.dark` still declares for the whole document
    s = s.replace(/[.#](?:dark|light|theme-dark|theme-light|dark-mode|light-mode|dark-theme|light-theme)\b/gi, '')
      .replace(/\[[^\]]*\]/g, '').trim()
    return s === '' || ROOTISH.test(s)
  })
}

/**
 * Walk CSS text and hand every custom-property declaration to `emit(name, value, stack)`, where
 * `stack` is the live nest of selectors and at-rules above it. Quote- and paren-aware, because a
 * `;` inside `url(data:image/svg+xml;…)` and a `}` inside `content: "}"` both otherwise end a rule
 * that has not ended. Minified CSS drops the final `;`, so `}` flushes a pending declaration too.
 */
function scanDeclarations(css, emit) {
  css = css.replace(/\/\*[\s\S]*?\*\//g, ' ')
  const stack = []
  let start = 0; let paren = 0; let quote = ''
  const flush = (end) => {
    const decl = css.slice(start, end)
    const k = decl.indexOf(':')
    if (k > 0) {
      const name = decl.slice(0, k).trim()
      if (/^--[\w-]+$/.test(name)) emit(name, decl.slice(k + 1).trim(), stack)
    }
  }
  for (let i = 0; i < css.length; i++) {
    const c = css[i]
    if (quote) { if (c === '\\') i++; else if (c === quote) quote = ''; continue }
    // A CSS escape outside a string, which is not exotic: Tailwind v4 emits arbitrary variants as
    // literal class identifiers — `.\[\&_svg\:not\(\[class\*\=\'size-\'\]\)\]\:size-3`.
    // Without this line the `\'` opens a string that never closes, the scanner desyncs 80 kB into
    // the file, and every token after that point vanishes: app-ui reported 0 of its 36 `:root`
    // tokens and 0 of its 24 `.dark` re-points, with no error anywhere.
    if (c === '\\') { i++; continue }
    if (c === '"' || c === "'") { quote = c; continue }
    if (c === '(') { paren++; continue }
    if (c === ')') { if (paren) paren--; continue }
    if (paren) continue
    if (c === '{') { stack.push(css.slice(start, i).replace(/\s+/g, ' ').trim()); start = i + 1; continue }
    if (c === '}') { flush(i); stack.pop(); start = i + 1; continue }
    if (c === ';') { flush(i); start = i + 1 }
  }
}

/**
 * The census. One entry per NAME, carrying its base value, its light and dark re-points, and how
 * many component scopes redeclare it. First write wins inside each slot — a stylesheet's own order
 * is its specificity story, and a later `.dark` block must not overwrite the `:root` base.
 */
function buildCensus(chunks) {
  const tokens = new Map()
  let declarations = 0
  for (const css of chunks) {
    scanDeclarations(css, (name, value, stack) => {
      declarations++
      const at = stack.filter((s) => s.startsWith('@'))
      const sels = stack.filter((s) => !s.startsWith('@'))
      const atText = at.join(' ')
      const selText = sels.join(' ')
      const theme = classifyTheme(selText, atText)
      // `@theme` / `@theme inline` is Tailwind v4's token block and has no selector at all.
      const atRoot = sels.length === 0 ? /@(?:theme|property)\b/.test(atText) : sels.every(rootLevel)
      let t = tokens.get(name)
      if (!t) { t = { base: null, light: null, dark: null, scopes: new Map(), darkScoped: false, n: 0 }; tokens.set(name, t) }
      t.n++
      // A dark re-point that is NOT at the root is still theming — Tailwind v4 sites do almost all
      // of it this way (`:is(:where(.prose):is(.dark,.dark *))`). Counting it as untheme would
      // report "single-theme" about a site with 811 dark rules.
      if (theme === 'dark' && !atRoot) t.darkScoped = true
      if (atRoot && theme === null) { if (t.base === null) t.base = value }
      else if (atRoot && theme === 'dark') { if (t.dark === null) t.dark = value }
      else if (atRoot && theme === 'light') { if (t.light === null) t.light = value }
      else if (!t.scopes.has(selText || atText)) t.scopes.set(selText || atText, value)
    })
  }
  return { tokens, declarations }
}

function tokenCategory(name, value) {
  for (const [re, cat] of TOKEN_CATEGORY) if (re.test(name)) return cat
  return parseDeclaredColor(value) ? 'color' : 'other'
}

const CSS_NAMED = { white: '#ffffff', black: '#000000', red: '#ff0000', blue: '#0000ff', green: '#008000', gray: '#808080', grey: '#808080' }

/**
 * A DECLARED value → OKLCH. `parseColor` reads what a browser serialises (always rgb/oklch/lab);
 * a stylesheet is written by a human and ships hex, `hsl()`, or shadcn's bare `222 47% 11%` triplet
 * that only becomes a colour inside `hsl(var(--x))`. Without those three the parity check finds
 * nothing on precisely the sites that have the best token layers.
 */
function parseDeclaredColor(raw) {
  if (!raw) return null
  let v = String(raw).trim().replace(/\s*!important$/i, '').replace(/;$/, '')
  if (/var\(|calc\(|currentcolor|inherit|initial|unset|none|transparent/i.test(v) && !/^#|^rgb|^hsl|^oklch|^oklab|^lab|^color\(/i.test(v)) return null
  if (CSS_NAMED[v.toLowerCase()]) v = CSS_NAMED[v.toLowerCase()]
  let m = /^#([0-9a-f]{3,8})$/i.exec(v)
  if (m) {
    let h = m[1]
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('')
    if (h.length !== 6 && h.length !== 8) return null
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1
    if (a === 0) return null
    const [L, C, H] = linearToOklch(lin(r), lin(g), lin(b))
    return { L, C, H, a }
  }
  m = /^hsla?\(\s*([\d.-]+)(?:deg)?[,\s]+([\d.]+)%[,\s]+([\d.]+)%(?:[,/\s]+([\d.%]+))?/i.exec(v)
  if (!m) m = /^([\d.-]+)(?:deg)?\s+([\d.]+)%\s+([\d.]+)%$/.exec(v) // shadcn's bare hsl triplet
  if (m) {
    const a = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4])
    if (a === 0) return null
    const [h, s, l] = [((+m[1] % 360) + 360) % 360, +m[2] / 100, +m[3] / 100]
    const f = (n) => { const k = (n + h / 30) % 12; const x = s * Math.min(l, 1 - l); return l - x * Math.max(-1, Math.min(k - 3, 9 - k, 1)) }
    const [L, C, H] = linearToOklch(lin(f(0)), lin(f(8)), lin(f(4)))
    return { L, C, H, a }
  }
  return parseColor(v)
}

/** A declared length → px, so a declared radius can be compared with a measured one. */
function parseDeclaredPx(raw) {
  const m = /^(-?[\d.]+)(px|rem|em)?$/.exec(String(raw || '').trim())
  if (!m) return null
  const n = parseFloat(m[1])
  return m[2] === 'rem' || m[2] === 'em' ? n * 16 : m[2] === 'px' || n === 0 ? n : null
}

/**
 * Fetch the document and every stylesheet it names, before Playwright exists. Never throws and
 * never blocks the browser pass: a 403, a CDN that hates a bare fetch, or a site that injects its
 * CSS from JS all return `ok:false` with a reason, and the run continues to measurement.
 */
async function sourcePass(pageUrl) {
  const t0 = Date.now()
  const notes = []
  const get = async (u, kind) => {
    if (Date.now() - t0 > SRC.totalMs) { notes.push('budget exhausted'); return null }
    try {
      const res = await fetch(u, {
        redirect: 'follow',
        signal: AbortSignal.timeout(SRC.perFetchMs),
        headers: { 'user-agent': SRC_UA, accept: kind === 'css' ? 'text/css,*/*;q=0.1' : 'text/html,application/xhtml+xml' },
      })
      if (!res.ok) { notes.push(`HTTP ${res.status} — ${u.slice(0, 110)}`); return null }
      const text = await res.text()
      return text.length > SRC.bytesPerSheet ? text.slice(0, SRC.bytesPerSheet) : text
    } catch (e) { notes.push(`${String(e.message || e).split('\n')[0]} — ${u.slice(0, 110)}`); return null }
  }

  const html = await get(pageUrl, 'html')
  if (html == null) return { ok: false, reason: 'the document did not fetch', notes, stylesheets: [], inlineBlocks: 0, bytes: 0 }

  const baseTag = /<base\b[^>]*\bhref\s*=\s*["']?([^"'\s>]+)/i.exec(html)
  const baseUrl = (() => { try { return baseTag ? new URL(baseTag[1], pageUrl).href : pageUrl } catch { return pageUrl } })()
  const abs = (href) => { try { return new URL(href.replace(/&amp;/g, '&').trim(), baseUrl).href } catch { return null } }

  const chunks = []
  let inlineBlocks = 0
  for (const m of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
    if (!m[1].includes('--')) continue
    chunks.push(m[1]); inlineBlocks++
  }

  const hrefs = []
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0]
    const rel = (/\brel\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(tag) || []).slice(1).find(Boolean) || ''
    const as = (/\bas\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(tag) || []).slice(1).find(Boolean) || ''
    if (!/stylesheet/i.test(rel) && !(/preload/i.test(rel) && /^style$/i.test(as))) continue
    const href = (/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(tag) || []).slice(1).find(Boolean)
    const u = href && abs(href)
    if (u && /^https?:/.test(u) && !hrefs.includes(u)) hrefs.push(u)
  }

  const stylesheets = []
  let bytes = chunks.reduce((n, c) => n + c.length, 0)
  const seen = new Set(hrefs)
  for (let i = 0; i < hrefs.length && stylesheets.length < SRC.sheets && bytes < SRC.bytesTotal; i++) {
    const css = await get(hrefs[i], 'css')
    if (css == null) continue
    chunks.push(css); bytes += css.length
    stylesheets.push({ url: hrefs[i], bytes: css.length })
    // one level of @import, which is how a token layer is usually split out of the app bundle
    if (i < SRC.sheets / 2) {
      for (const im of css.matchAll(/@import\s+(?:url\(\s*)?["']?([^"')\s;]+)/g)) {
        const u = (() => { try { return new URL(im[1], hrefs[i]).href } catch { return null } })()
        if (u && /^https?:/.test(u) && !seen.has(u)) { seen.add(u); hrefs.push(u) }
      }
    }
  }

  const { tokens, declarations } = buildCensus(chunks)
  return {
    ok: tokens.size > 0,
    reason: tokens.size > 0 ? null : 'no custom-property declaration in any stylesheet this pass could reach',
    via: 'source fetch (before the browser)',
    stylesheets, inlineBlocks, bytes, declarations, tokens, notes,
  }
}

/**
 * Turn the raw census into the report field, and run the PARITY CHECK — the point of the whole
 * pass. For each value the browser measured, is there a declared name for it? A hit turns
 * "oklch(0.55 0.22 264) on 0.4% of painted area" into `--primary`. A miss is equally a finding:
 * a declared colour that appears nowhere in the measured census is a token for a theme or a state
 * this run never rendered. Measured values are never overwritten — only annotated.
 */
function summarizeCensus(src, measured) {
  const base = { ok: false, reason: src?.reason || 'source pass did not run', via: src?.via || null,
    stylesheets: (src?.stylesheets || []).length, inlineBlocks: src?.inlineBlocks || 0, bytes: src?.bytes || 0,
    names: 0, brandNames: 0, declarations: src?.declarations || 0, themed: 0, themedScoped: 0, scopedOnly: 0,
    namedBackgrounds: 0, topBackgrounds: (measured?.topBackgrounds || []).length, radiusNames: [], radiusBaseNamed: null, declaredUnseenTotal: 0,
    byCategory: {}, tokens: {}, namesFor: {}, declaredUnseen: [], notes: (src?.notes || []).slice(0, 8) }
  if (!src || !src.tokens || src.tokens.size === 0) return base

  const entries = [...src.tokens.entries()]
  const value = (t) => t.base ?? t.light ?? t.dark ?? [...t.scopes.values()][0] ?? null
  const byCategory = {}
  const tokensOut = {}
  let themed = 0; let themedScoped = 0; let scopedOnly = 0; let brandNames = 0
  for (const [name, t] of entries) {
    const v = value(t)
    const cat = tokenCategory(name, v)
    byCategory[cat] = (byCategory[cat] || 0) + 1
    if (t.dark !== null || (t.light !== null && t.light !== t.base)) themed++
    else if (t.darkScoped) themedScoped++
    if (t.base === null && t.light === null && t.dark === null) scopedOnly++
    if (!FRAMEWORK_SCALE.test(name)) brandNames++
    if (Object.keys(tokensOut).length < 400) {
      tokensOut[name] = { category: cat, base: t.base, light: t.light, dark: t.dark, scopes: t.scopes.size, declarations: t.n }
    }
  }

  // parity: declared colour → the OKLCH bucket the browser painted
  const declaredByKey = new Map()
  for (const [name, t] of entries) {
    for (const v of [t.base, t.light, t.dark]) {
      const c = v && parseDeclaredColor(v)
      if (!c) continue
      const k = key(c)
      if (!declaredByKey.has(k)) declaredByKey.set(k, [])
      if (!declaredByKey.get(k).includes(name)) declaredByKey.get(k).push(name)
    }
  }
  const namesFor = {}
  for (const [role, colour] of Object.entries(measured.colours)) {
    if (!colour) continue
    const hit = declaredByKey.get(key(colour.c))
    if (hit) namesFor[role] = hit.slice(0, 3)
  }
  // Count against `declaredByKey`, never against the capped `tokens` map — a 2,297-token layer
  // truncates at 400 and the answer silently becomes zero.
  const namedBackgrounds = (measured.topBackgrounds || []).filter((x) => declaredByKey.has(key(x.c))).length
  const measuredKeys = new Set(measured.allColours.map((x) => key(x.c)))
  const declaredUnseen = []
  for (const [name, t] of entries) {
    if (FRAMEWORK_SCALE.test(name)) continue
    const c = parseDeclaredColor(value(t))
    if (c && !measuredKeys.has(key(c))) declaredUnseen.push(name)
  }
  // radius: a declared step the page never rendered is the same kind of finding, in geometry
  const radiusNames = entries.filter(([n, t]) => tokenCategory(n, value(t)) === 'radius')
    .map(([n, t]) => ({ name: n, px: parseDeclaredPx(value(t)) })).filter((x) => x.px !== null)
  const radiusHit = radiusNames.find((x) => x.px === measured.radiusBase)

  return { ...base, ok: true, reason: null,
    names: entries.length, brandNames, declarations: src.declarations, themed, themedScoped, scopedOnly,
    byCategory, tokens: tokensOut, namesFor,
    namedBackgrounds, topBackgrounds: (measured.topBackgrounds || []).length,
    radiusNames: radiusNames.slice(0, 12), radiusBaseNamed: radiusHit ? radiusHit.name : null,
    declaredColours: declaredByKey.size,
    declaredUnseen: declaredUnseen.slice(0, 40), declaredUnseenTotal: declaredUnseen.length }
}

/* ── the in-page pass. Geometry and computed style only — nothing here is an opinion. ─────── */

function measure() {
  const px = (v) => Math.round(parseFloat(v) || 0)
  const bump = (map, k, n = 1) => k && map.set(k, (map.get(k) || 0) + n)
  const top = (map, n) => [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n)

  const nodes = [...document.querySelectorAll('body *')]
    .filter((e) => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden')
    .map((e) => ({ e, r: e.getBoundingClientRect(), s: getComputedStyle(e) }))

  // COLOUR — two independent signals, because neither alone finds the brand.
  //   AREA answers "what is the surface": the page background is 60% of the paint.
  //   BRAND INTENT answers "what is the accent": a colour on an element whose class/id/data
  //   attributes say logo/brand/cta/button carries intent that frequency cannot see. Ranking by
  //   frequency finds a border; ranking by area finds a section fill; only the CTA background
  //   finds the actual brand colour. Weights and the ancestor-lift rule follow dembrandt's
  //   `color-heuristics.ts`, whose ANCESTOR_LIFT_MAX exists so a wrapper called `hero` cannot
  //   promote every colour inside it.
  const CONTEXT = { logo: 5, brand: 5, primary: 4, cta: 4, hero: 3, button: 3, card: 2, section: 2, feature: 2, panel: 2, input: 2, badge: 2, chip: 2, footer: 2, link: 2, header: 2, nav: 1 }
  const LIFT_MAX = 2
  const bg = new Map(); const fg = new Map(); const bd = new Map()
  const intent = new Map(); const ctaBg = new Map()
  for (const { e, r, s } of nodes) {
    const area = Math.max(0, r.width) * Math.max(0, r.height)
    if (area > 0) bump(bg, s.backgroundColor, area)
    const chars = [...e.childNodes].filter((n) => n.nodeType === 3).reduce((n, t) => n + t.textContent.trim().length, 0)
    if (chars > 0) bump(fg, s.color, chars)
    for (const [w, side] of [[s.borderTopWidth, s.borderTopColor], [s.borderRightWidth, s.borderRightColor],
      [s.borderBottomWidth, s.borderBottomColor], [s.borderLeftWidth, s.borderLeftColor]])
      if (px(w) > 0) bump(bd, side, Math.max(r.width, r.height))

    // `className` is an SVGAnimatedString on SVG elements and stringifies to "[object …]".
    const cls = (el) => el.getAttribute?.('class') || ''
    const ctx = `${cls(e)} ${e.id || ''} ${e.getAttribute('data-component') || ''} ${e.getAttribute('data-cta') || ''} ${e.tagName}`.toLowerCase()
    let score = 1
    for (const [k, w] of Object.entries(CONTEXT)) if (ctx.includes(k)) score = Math.max(score, w)
    if (e.tagName === 'A') score = Math.max(score, CONTEXT.link)
    if (e.tagName === 'BUTTON' || e.getAttribute('role') === 'button') score = Math.max(score, CONTEXT.button)
    if (score <= LIFT_MAX) { // only weak keywords may be inherited, and only 4 hops up
      let lift = 0, node = e.parentElement
      for (let hop = 0; hop < 4 && node && lift < LIFT_MAX; hop++) {
        const a = `${cls(node)} ${node.id || ''}`.toLowerCase()
        for (const [k, w] of Object.entries(CONTEXT)) if (w <= LIFT_MAX && a.includes(k)) lift = Math.max(lift, w)
        node = node.parentElement
      }
      score = Math.max(score, lift)
    }
    // A solid, non-monochrome fill on something that calls itself a button IS the primary. Two
    // sightings required — one "Sign up" pill is a page, a repeated pill is a system. The α≥0.7
    // floor is what makes it work on a site that ghost-buttons everything: a 5%-white hover fill
    // is chrome, not a CTA, and without the floor it wins by sheer repetition.
    const alpha = (s.backgroundColor.match(/rgba?\([^)]*[,/]\s*([\d.]+)\s*\)/) || [, '1'])[1]
    const solidFill = s.backgroundColor && +alpha >= 0.7 &&
      !['rgb(255, 255, 255)', 'rgb(0, 0, 0)', 'transparent'].includes(s.backgroundColor)
    if (/button|btn|cta/.test(ctx) && solidFill) { score = Math.max(score, 25); bump(ctaBg, s.backgroundColor) }
    if (score > 1) {
      if (solidFill) bump(intent, s.backgroundColor, score)
      if (chars > 0) bump(intent, s.color, score)
    }
  }

  // TYPE — the ramp as authored, not as guessed. Sample text proves which role each row is.
  const ramp = new Map(); const families = new Map()
  for (const { e, s } of nodes) {
    const text = [...e.childNodes].filter((n) => n.nodeType === 3).map((t) => t.textContent.trim()).join(' ').trim()
    if (!text) continue
    bump(families, s.fontFamily, text.length)
    const k = [px(s.fontSize), s.fontWeight, s.lineHeight === 'normal' ? 'normal' : px(s.lineHeight),
      s.letterSpacing === 'normal' ? '0' : parseFloat(s.letterSpacing).toFixed(2), s.textTransform].join('/')
    const cur = ramp.get(k) || { n: 0, chars: 0, sample: '' }
    cur.n++; cur.chars += text.length
    if (text.length > cur.sample.length) cur.sample = text.slice(0, 60)
    ramp.set(k, cur)
  }

  // MEASURE — line length of the longest real paragraph, in approximate characters.
  const paras = nodes.filter(({ e, r }) => /^(P|LI|BLOCKQUOTE)$/.test(e.tagName) && e.textContent.trim().length > 120 && r.width > 200)
  const measures = paras.map(({ r, s }) => Math.round(r.width / (parseFloat(s.fontSize) * 0.5)))

  // SPACING · RADIUS · ELEVATION
  const space = new Map(); const radius = new Map(); const shadow = new Map()
  for (const { r, s } of nodes) {
    for (const v of [s.paddingTop, s.paddingRight, s.paddingBottom, s.paddingLeft, s.gap, s.rowGap, s.columnGap]) {
      const n = px(v); if (n > 0 && n <= 200) bump(space, n)
    }
    for (const v of [s.borderTopLeftRadius, s.borderTopRightRadius, s.borderBottomLeftRadius, s.borderBottomRightRadius]) {
      if (v.includes('%')) { bump(radius, 'pill/circle'); continue }
      const n = px(v); if (n > 0) bump(radius, Math.min(n, Math.round(Math.min(r.width, r.height) / 2)) >= Math.round(Math.min(r.width, r.height) / 2) ? 'pill/circle' : n)
    }
    // Tailwind's shadow utilities compile to a six-layer stack of mostly zero-alpha no-ops, so a
    // naive census reports `rgba(0,0,0,0) 0px 0px 0px 0px, …` as the site's top elevation recipe.
    // Split on top-level commas and keep only layers that actually paint.
    if (s.boxShadow && s.boxShadow !== 'none') {
      const live = s.boxShadow.split(/,(?![^(]*\))/).map((l) => l.trim())
        .filter((l) => !/rgba?\([^)]*[,/]\s*0(\.0+)?\s*\)/.test(l)).join(', ')
      if (live) bump(shadow, live.replace(/\s+/g, ' ').slice(0, 120))
    }
  }

  // TEXTURE — the material layer, split by kind so TEXTURE_LEVEL is read, not guessed.
  const tex = { gradient: 0, image: 0, svgNoise: 0, backdropBlur: 0, blend: 0, filter: 0 }
  for (const { s } of nodes) {
    const bi = s.backgroundImage
    if (bi && bi !== 'none') {
      if (/gradient\(/.test(bi)) tex.gradient++
      if (/url\(/.test(bi)) (/data:image\/svg|noise|grain|texture/i.test(bi) ? tex.svgNoise++ : tex.image++)
    }
    if (s.backdropFilter && s.backdropFilter !== 'none') tex.backdropBlur++
    if (s.mixBlendMode && s.mixBlendMode !== 'normal') tex.blend++
    if (s.filter && s.filter !== 'none') tex.filter++
  }

  // GRID — the container widths the layout actually snaps to, and how symmetric it is.
  const widths = new Map()
  for (const { r } of nodes) if (r.width >= 480 && r.height > 40) bump(widths, Math.round(r.width / 8) * 8)
  const centred = nodes.filter(({ s }) => s.textAlign === 'center').length

  return {
    bg: top(bg, 14), fg: top(fg, 10), bd: top(bd, 8), intent: top(intent, 12), ctaBg: top(ctaBg, 6),
    ramp: [...ramp.entries()].sort((a, b) => b[1].chars - a[1].chars).slice(0, 14).map(([k, v]) => ({ k, ...v })),
    families: top(families, 6),
    // `status` matters: an `unloaded` face is declared but never actually used on this page, so it
    // belongs in the reference card as noise, not as part of the type pairing.
    fontFaces: [...document.fonts].map((f) => `${f.family} ${f.weight} ${f.style}${f.status === 'loaded' ? '' : ` (${f.status})`}`)
      .filter((v, i, a) => a.indexOf(v) === i).slice(0, 24),
    measures, space: top(space, 14), radius: top(radius, 8), shadow: top(shadow, 8),
    tex, widths: top(widths, 6), centred, nodeCount: nodes.length,
    viewportBg: getComputedStyle(document.documentElement).backgroundColor,
    title: document.title,
  }
}

/** Motion, read BEFORE the animation freeze — the freeze overwrites every property below. */
function readMotion() {
  const bump = (map, k, n = 1) => k && map.set(k, (map.get(k) || 0) + n)
  const top = (map, n) => [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n)
  const dur = new Map(); const ease = new Map(); const prop = new Map(); let animated = 0
  for (const e of document.querySelectorAll('body *')) {
    if (!e.getClientRects().length) continue
    const s = getComputedStyle(e)
    const ds = s.transitionDuration.split(',').map((d) => Math.round(parseFloat(d) * 1000))
    const es = s.transitionTimingFunction.split(/,(?![^(]*\))/).map((x) => x.trim())
    const ps = s.transitionProperty.split(',').map((x) => x.trim())
    ds.forEach((d, i) => { if (d > 0) { bump(dur, d); bump(ease, es[i % es.length]); bump(prop, ps[i % ps.length]) } })
    if (s.animationName !== 'none') { animated++; for (const d of s.animationDuration.split(',')) { const n = Math.round(parseFloat(d) * 1000); if (n > 0) bump(dur, n) } }
  }
  return { dur: top(dur, 10), ease: top(ease, 6), prop: top(prop, 8), animated }
}

/** Click through a cookie/consent wall in any frame, piercing open shadow roots. */
async function dismissConsent(page) {
  const SELECTORS = ['#onetrust-accept-btn-handler', '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
    '#CybotCookiebotDialogBodyButtonAccept', '#truste-consent-button', '#sp-cc-accept', '#uc-btn-accept-banner',
    '.optanon-allow-all', '.osano-cm-accept-all', '.cky-btn-accept', '.cc-btn.cc-allow', '.sp_choice_type_11',
    '[data-testid="uc-accept-all-button"]', 'button[id*="accept" i]', 'button[class*="accept" i]',
    'button[id*="agree" i]', 'button[class*="agree" i]', '[aria-label*="Accept" i]']
  const AFFIRM = /^(accept|allow|agree|i agree|got it|ok|okay|understood)\b/i
  const REJECT = /\b(reject|decline|deny|manage|settings|preferences|customi[sz]e|necessary only)\b/i
  for (const frame of page.frames()) {
    try {
      const hit = await frame.evaluate(({ SELECTORS, AFFIRM, REJECT }) => {
        // Only act on a surface that says it is about consent — otherwise a plain "OK" or
        // "Continue" button somewhere on the page gets clicked and the page navigates away.
        if (!/cookie|consent|gdpr|privacy|tracking/i.test((document.body?.innerText || '').slice(0, 4000))) return null
        const roots = [document]; let budget = 4000
        for (let i = 0; i < roots.length && budget > 0; i++) {
          let all = []; try { all = [...roots[i].querySelectorAll('*')] } catch { continue }
          for (const el of all) { if (budget-- <= 0) break; if (el.shadowRoot) roots.push(el.shadowRoot) }
        }
        for (const root of roots) for (const sel of SELECTORS) {
          let el; try { el = root.querySelector(sel) } catch { continue }
          if (el && el.getClientRects().length) { el.click(); return sel }
        }
        const aff = new RegExp(AFFIRM.source, AFFIRM.flags); const rej = new RegExp(REJECT.source, REJECT.flags)
        for (const root of roots) for (const el of root.querySelectorAll('button,a[role="button"]')) {
          const t = (el.textContent || '').trim()
          if (t && aff.test(t) && !rej.test(t) && el.getClientRects().length) { el.click(); return `text:${t.slice(0, 24)}` }
        }
        return null
      }, { SELECTORS, AFFIRM: { source: AFFIRM.source, flags: AFFIRM.flags }, REJECT: { source: REJECT.source, flags: REJECT.flags } })
      if (hit) return hit
    } catch { /* detached frame, cross-origin without access, or navigation mid-evaluate */ }
  }
  return null
}

/* ── drive the page ───────────────────────────────────────────────────────────────────────── */

// SOURCE PASS FIRST — no browser yet. It costs one HTTP round trip per stylesheet and it is the
// only pass that can return a token's NAME. It must never be able to stop the measurement, so it
// is fully self-contained: any failure comes back as `ok:false` and the browser pass proceeds.
const src = await sourcePass(url).catch((e) => ({ ok: false, reason: String(e.message || e).split('\n')[0], notes: [], stylesheets: [], inlineBlocks: 0, bytes: 0 }))

const browser = await chromium.launch()
// `reducedMotion` MUST be explicit. Left to the host, a machine that prefers reduced motion makes
// every duration collapse — dembrandt reports `0.001s ×950` for a page whose real transitions are
// 150ms, and the number looks perfectly plausible.
const page = await browser.newPage({ viewport: { width: vw, height: vh }, colorScheme: theme, reducedMotion: 'no-preference', deviceScaleFactor: 1 })

// The authored token layer, straight out of the stylesheets. A site with a real design system
// leaks it here — this is the highest-yield single signal on the page, and it needs no DOM walk.
const cssText = []
page.on('response', async (res) => {
  const ct = res.headers()['content-type'] || ''
  if (!ct.includes('text/css')) return
  try { cssText.push(await res.text()) } catch { /* redirect or aborted body */ }
})

// networkidle is the right target and the wrong guarantee: analytics beacons, polling and video
// keep a real marketing site permanently busy. Degrade to `load` + a settle window rather than
// reporting nothing, and say which one produced the numbers.
let waited = 'networkidle'
let navResponse = null
try {
  navResponse = await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 })
} catch {
  waited = 'load + 3s settle'
  try {
    navResponse = await page.goto(url, { waitUntil: 'load', timeout: 30_000 })
    await page.waitForTimeout(3000)
  } catch (e) {
    console.error(`✗ ${url} never loaded: ${e.message.split('\n')[0]}`)
    await browser.close(); process.exit(66) // 66 = navigation failed
  }
}

// A page that is not there still renders. `ui.shadcn.com/docs/components/pricing-table` returns
// 404 and Playwright reports it loaded; the extractor happily measured the error page and recon
// wrote `measured: true` beside it, so Phase 1 would have designed against the digest of a 404.
// Two independent guards, because either alone misses a real case:
//   · the HTTP status — catches a hard 404/410/500 that still paints something;
//   · an unstyled document — catches a soft 404, a bot wall, or an SSR shell that never hydrated.
//     A page whose body font is a browser default AND which loaded no @font-face and almost no CSS
//     is not a design; it is the absence of one. `auteur-scripts.md` §1 is where this guard comes
//     from — the one thing worth taking out of refscout.
const httpStatus = navResponse ? navResponse.status() : null
const thin = await page.evaluate(() => {
  const body = getComputedStyle(document.body).fontFamily || ''
  const stylesheetBytes = [...document.styleSheets].reduce((n, s) => {
    try { return n + [...s.cssRules].length } catch { return n }   // cross-origin: unreadable, still counted below
  }, 0)
  return {
    bodyFont: body,
    defaultFont: /^"?(Times New Roman|Times|serif)"?$/i.test(body.split(',')[0].trim()),
    fontFaces: [...document.fonts].length,
    cssRules: stylesheetBytes,
    crossOriginSheets: [...document.styleSheets].filter((s) => { try { void s.cssRules; return false } catch { return true } }).length,
    textChars: (document.body.innerText || '').trim().length,
    title: document.title || '',
  }
})
const unstyled = thin.defaultFont && thin.fontFaces === 0 && thin.cssRules < 20 && thin.crossOriginSheets === 0
const looksLikeError = /^(4\d\d|5\d\d)$/.test(String(httpStatus)) || /\b(404|not found|page not found)\b/i.test(thin.title)
if (looksLikeError || unstyled) {
  console.error(`✗ ${url} is not a page worth measuring — ${
    looksLikeError ? `HTTP ${httpStatus}${thin.title ? ` · title "${thin.title}"` : ''}` : ''
  }${looksLikeError && unstyled ? ' and ' : ''}${
    unstyled ? `unstyled (body font ${thin.bodyFont.split(',')[0]}, ${thin.fontFaces} webfonts, ${thin.cssRules} CSS rules)` : ''
  }.`)
  console.error('  Measuring it would report the browser\'s defaults as this product\'s design system.')
  console.error('  Pass --allow-thin to measure it anyway (a deliberately minimal site is a real case).')
  if (!argv.includes('--allow-thin')) { await browser.close(); process.exit(66) } // 66 = navigation failed
  console.error('  --allow-thin given: measuring anyway.')
}
// A cookie wall is a full-viewport surface with its own palette and its own type. Leave it up and
// the report describes the consent vendor's design, not the site's. Sweep every frame — CMPs are
// routinely iframed (Sourcepoint, TrustArc, Quantcast) — and only click affirmative labels.
const consent = await dismissConsent(page)
if (consent) await page.waitForTimeout(800)

// A stepped scroll to the bottom and back, not one jump: without it the census sees only the hero
// and the type ramp collapses to three sizes, because everything below the fold is lazy-mounted or
// still hidden behind a scroll-reveal.
for (const f of [0.25, 0.5, 0.75, 1, 0]) {
  await page.evaluate((frac) => window.scrollTo(0, document.body.scrollHeight * frac), f)
  await page.waitForTimeout(400)
}
await page.waitForTimeout(800)
try { await page.evaluate(() => document.fonts.ready) } catch { /* no font loading API */ }
// `unloaded` is the resting state of a declared-but-unused face, not a problem. Only `loading`
// and `error` mean the type table might be reporting a fallback instead of the brand face.
const fontsReady = await page.evaluate(() => !document.fonts ? true
  : ![...document.fonts].some((f) => f.status === 'loading' || f.status === 'error'))

const inline = await page.evaluate(() => [...document.querySelectorAll('style')].map((s) => s.textContent).join('\n'))

// PASS 1 — motion, read live. It must happen before the freeze below, which rewrites exactly the
// properties this pass reads.
const motion = await page.evaluate(readMotion)

// PASS 2 — everything else, read frozen. A hero that cross-fades or a swatch that cycles reports a
// different computed colour on every run; driving animations to their final frame and holding it
// makes the palette reproducible. (The technique is dembrandt's; the reason to split the passes is
// that it destroys the motion numbers.)
await page.addStyleTag({ content: `*, *::before, *::after { animation-duration: 1ms !important; animation-delay: 0ms !important; animation-iteration-count: 1 !important; animation-fill-mode: forwards !important; transition-duration: 1ms !important; transition-delay: 0ms !important; }` })
await page.waitForTimeout(300)
const m = { ...(await page.evaluate(measure)), ...motion }
await browser.close()

/* ── the authored layer: custom properties + @font-face, mined out of the CSS text ────────── */

const allCss = cssText.join('\n') + '\n' + inline
const customProps = new Map()
for (const [, name, value] of allCss.matchAll(/(--[\w-]+)\s*:\s*([^;{}]{1,120});/g))
  if (!customProps.has(name)) customProps.set(name, value.trim())
// `var(--space-3, 12px)` declares a value that may appear in no rule anywhere: the fallback at the
// call site is often the only place a build leaves its geometry scale in plain text. Framer's
// dimension scale is recoverable this way and by no other CSS route.
for (const [, name, fallback] of allCss.matchAll(/var\(\s*(--[\w-]+)\s*,\s*([^),;]{1,60})\)/g))
  if (!customProps.has(name)) customProps.set(name, `${fallback.trim()}   /* from a var() fallback */`)
// A site that ships Tailwind's or Panda's whole default palette as custom properties leaks 250
// tokens that say nothing about its brand. Brand-named tokens (`--accent-*`, `--brand-*`) do not
// match this and survive. Regex from dembrandt's custom-property filter.
const FRAMEWORK_DUMP = /^--(?:tw-)?colors?-(?:slate|gray|grey|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(?:50|\d00|950)$|^--(?:tw-)?colors?-(?:transparent|current|black|white|inherit)$/
const designProps = [...customProps.entries()].filter(([n]) => !FRAMEWORK_DUMP.test(n) &&
  /color|bg|background|surface|fg|foreground|text|border|accent|brand|primary|secondary|muted|radius|shadow|space|spacing|gap|font|size|weight|leading|tracking|ease|duration|transition/i.test(n))
const dumped = [...customProps.keys()].filter((n) => FRAMEWORK_DUMP.test(n)).length
const faceSrc = [...allCss.matchAll(/@font-face\s*{[^}]*?font-family\s*:\s*['"]?([^;'"]+)['"]?[^}]*?}/gi)]
  .map((x) => x[1].trim()).filter((v, i, a) => a.indexOf(v) === i)

/* ── derive: the six mechanics + the five dials ───────────────────────────────────────────── */

const srcUsedNames = src?.ok && src.tokens ? new Set(src.tokens.keys()) : null
const runtimeOnly = [...customProps.keys()].filter((n) => !FRAMEWORK_DUMP.test(n) && !(srcUsedNames && srcUsedNames.has(n)))

const colours = (rows) => rows.map(([str, w]) => ({ raw: str, w, c: parseColor(str) })).filter((x) => x.c)
const dedupe = (rows) => {
  const seen = new Map()
  for (const r of rows) { const k = key(r.c); const cur = seen.get(k); if (cur) cur.w += r.w; else seen.set(k, { ...r }) }
  return [...seen.values()].sort((a, b) => b.w - a.w)
}
const bgc = dedupe(colours(m.bg)); const fgc = dedupe(colours(m.fg)); const bdc = dedupe(colours(m.bd))

const surface = bgc[0]
const isDark = surface && surface.c.L < 0.5
// An accent is the MOST SATURATED colour, not the most painted one — 60-30-10 makes scarcity its
// defining property. Ranking chromatic backgrounds by area finds a brand *surface* (Stripe's navy
// section) and misses the actual accent (Stripe's blurple, 0.2% of the page).
// Alpha under 0.5 is a status tint or a wash over the surface, never the accent itself — and it
// carries the *tinted* hue at full chroma, so it outranks the real accent unless excluded.
const solid = (rows) => rows.filter((x) => x.c.a >= 0.5)
// The accent, in three falling tiers of evidence: a repeated CTA fill (the site said so), then
// the highest-intent chromatic colour (the markup said so), then the most saturated one (a guess).
const ctaAccent = dedupe(colours(m.ctaBg.filter(([, n]) => n >= 2))).map((x) => bgc.find((b) => key(b.c) === key(x.c)) || x)
  .filter((x) => x.c.C >= 0.05 && x.c.a >= 0.5)[0]
const intentAccent = dedupe(colours(m.intent)).filter((x) => x.c.C >= 0.06 && x.c.a >= 0.5)
  .sort((a, b) => b.w - a.w)[0]
const byChroma = (rows) => solid(rows).filter((x) => x.c.C >= 0.06).sort((a, b) => b.c.C - a.c.C || b.w - a.w)
const accentBasis = ctaAccent ? 'repeated CTA fill' : intentAccent ? 'brand-intent markup' : 'highest chroma (weakest evidence)'
const accentRaw = ctaAccent || intentAccent || byChroma(bgc)[0] || byChroma(fgc)[0] || null
const accent = accentRaw && (bgc.find((x) => key(x.c) === key(accentRaw.c)) || accentRaw)
const brandSurface = solid(bgc).find((x) => x.c.C >= 0.03 && (!accent || key(x.c) !== key(accent.c))) || null
const tints = bgc.filter((x) => x.c.a < 0.5 && x.c.C >= 0.04).slice(0, 4)
const neutrals = bgc.filter((x) => x.c.C < 0.04).slice(0, 5)

// Weight every histogram by USE COUNT, never by distinct value: a design system is what the page
// paints a thousand times, and a long tail of one-off values would otherwise outvote it.
const spaceTotal = m.space.reduce((n, [, c]) => n + c, 0)
const onGrid = (u) => m.space.filter(([v]) => v % u === 0).reduce((n, [, c]) => n + c, 0) / Math.max(1, spaceTotal)
const unit = [8, 6, 5, 4, 3, 2].find((u) => onGrid(u) >= 0.8) || 1
const gridShare = onGrid(unit)
const radiusNumeric = m.radius.filter(([r]) => r !== 'pill/circle')
const radiusMode = radiusNumeric[0]?.[0] ?? 0
const pillCount = m.radius.find(([r]) => r === 'pill/circle')?.[1] ?? 0
const weighted = (rows) => rows.flatMap(([v, n]) => Array(Math.min(n, 500)).fill(v)).sort((a, b) => a - b)
const durAll = weighted(m.dur)
const durMedian = durAll.length ? durAll[Math.floor(durAll.length / 2)] : null
// UI feedback and ambient/decorative loops are different budgets; the skill caps only the first.
const durUi = weighted(m.dur.filter(([d]) => d <= 1000))
const durUiMedian = durUi.length ? durUi[Math.floor(durUi.length / 2)] : null
const measureMed = m.measures.length ? m.measures.sort((a, b) => a - b)[Math.floor(m.measures.length / 2)] : null
const bodyRow = m.ramp.find((r) => +r.k.split('/')[0] >= 13 && +r.k.split('/')[0] <= 20) || m.ramp[0]
const bodySize = bodyRow ? +bodyRow.k.split('/')[0] : null

// THE SOURCE-PASS MERGE. Declared names on one side, measured values on the other, and the two
// are never allowed to overwrite each other — that separation IS the finding. If a plain fetch
// could not reach the stylesheets (Cloudflare, a JS-injected <link>, an origin that 403s a bare
// UA), fall back to the CSS the browser itself downloaded: same parser, weaker claim, and the card
// says which one produced the numbers.
let srcUsed = src
if (!src?.ok) {
  const fb = buildCensus([allCss])
  if (fb.tokens.size) srcUsed = { ...src, ok: true, via: `browser-observed CSS (the source fetch reached nothing: ${src?.reason || 'no run'})`, tokens: fb.tokens, declarations: fb.declarations, bytes: allCss.length }
}
const sourceTokens = summarizeCensus(srcUsed, {
  colours: { surface, accent, brandSurface },
  allColours: [...bgc, ...fgc, ...bdc],
  topBackgrounds: bgc.slice(0, 8),
  radiusBase: radiusMode,
})

const texScore = m.tex.svgNoise + m.tex.image ? 2 : m.tex.gradient + m.tex.backdropBlur + m.tex.blend + m.tex.filter > 6 ? 1 : 0
const dials = {
  TEXTURE_LEVEL: texScore,
  VISUAL_DENSITY: bodySize === null ? '?' : bodySize <= 14 ? 'compact' : bodySize >= 17 ? 'spacious' : 'comfortable',
  GRID_DISCIPLINE: m.centred / Math.max(1, m.nodeCount) > 0.12 ? 'centred / symmetric' : 'asymmetric or left-anchored',
  MOTION_INTENSITY: durUiMedian === null ? 'none measured' : durUiMedian <= 150 ? 'snappy' : durUiMedian <= 300 ? 'moderate' : 'slow',
  DESIGN_VARIANCE: `${m.radius.length}+ radius steps · ${m.shadow.length}+ shadow recipes · ${m.ramp.length}+ type rows (each list is truncated — read the tables)`,
}

/* ── report ───────────────────────────────────────────────────────────────────────────────── */

const censusRow = (n, t) => `| \`${n}\` | \`${(t.base ?? t.light ?? '—')}\` | \`${t.dark ?? '—'}\` |`
const themedRows = Object.entries(sourceTokens.tokens).filter(([, t]) => t.dark !== null).slice(0, 14)
const roleName = (role) => (sourceTokens.namesFor[role] || []).map((n) => '`' + n + '`').join(' ')
const censusMd = !sourceTokens.ok
  ? `_No custom-property declaration reached this pass — ${sourceTokens.reason}._
_That is a finding, not a failure: this page has no reachable token layer, so every value in sections 1-6 above is unnamed by construction and a redesign of it cannot preserve names it does not have._
${sourceTokens.notes.length ? '\nWhat the fetch hit:\n' + sourceTokens.notes.map((x) => `- \`${x}\``).join('\n') : ''}`
  : `Read **before the browser launched**, from ${sourceTokens.stylesheets} stylesheet${sourceTokens.stylesheets === 1 ? '' : 's'} + ${sourceTokens.inlineBlocks} inline \`<style>\` block${sourceTokens.inlineBlocks === 1 ? '' : 's'} (${(sourceTokens.bytes / 1024).toFixed(0)} kB) · via ${sourceTokens.via}

**${sourceTokens.names} names** declared in ${sourceTokens.declarations} declarations · **${sourceTokens.brandNames}** after dropping framework colour scales · **${sourceTokens.themed}** re-pointed for dark at the root${sourceTokens.themedScoped ? ` · **${sourceTokens.themedScoped}** re-pointed for dark inside a component scope only` : ''} · ${sourceTokens.scopedOnly} declared only inside a component scope, never at the root
By category: ${Object.entries(sourceTokens.byCategory).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · ') || '—'}
${sourceTokens.radiusNames.length ? `Declared radius steps: ${sourceTokens.radiusNames.map((r) => `\`${r.name}\`=${r.px}px`).join(' · ')}` : ''}

${themedRows.length ? `The light/dark pairs the rendered page shows as one number — the browser pass can never see both:

| token | base / light | dark |
|---|---|---|
${themedRows.map(([n, t]) => censusRow(n, t)).join('\n')}
${sourceTokens.themed > themedRows.length ? `\n…and ${sourceTokens.themed - themedRows.length} more re-pointed names (full map in the \`.json\`).` : ''}` : sourceTokens.themedScoped ? `No token is re-pointed for dark **at the root**, but ${sourceTokens.themedScoped} are re-pointed inside component scopes — this system themes per-component, not from one root switch.` : '_No token is re-pointed for dark anywhere: this token layer is single-theme, or the theme switch is done in JS._'}

### Parity — declared names against measured values

Neither side overrides the other. A measured value with a name is a recovered token; a measured
value without one is a hard-coded effect; a declared name with no measured value is a theme or a
state this run never rendered. All three are different facts about the same system.

- surface ${surface ? fmt(surface.c) : '—'} → ${roleName('surface') || '**no declared name** — hard-coded, or built at runtime'}
- accent ${accent ? fmt(accent.c) : '—'} → ${roleName('accent') || '**no declared name** — hard-coded, or built at runtime'}
- brand surface ${brandSurface ? fmt(brandSurface.c) : '—'} → ${roleName('brandSurface') || '—'}
- radius base ${radiusMode ? radiusMode + 'px' : 'square'} → ${sourceTokens.radiusBaseNamed ? '`' + sourceTokens.radiusBaseNamed + '`' : '**no declared name**'}
- **${sourceTokens.namedBackgrounds} of the ${sourceTokens.topBackgrounds} most-painted backgrounds carry a declared name**; ${sourceTokens.topBackgrounds - sourceTokens.namedBackgrounds} are values with no name anywhere in the CSS
- **${sourceTokens.declaredUnseenTotal} declared colour token${sourceTokens.declaredUnseenTotal === 1 ? '' : 's'} never appeared in the measured census**${sourceTokens.declaredUnseen.length ? ` — ${sourceTokens.declaredUnseen.slice(0, 10).map((n) => '`' + n + '`').join(' · ')}${sourceTokens.declaredUnseenTotal > 10 ? ` … +${sourceTokens.declaredUnseenTotal - 10}` : ''}` : ''}
`

const table = (rows) => rows.map((r) => `| ${r.join(' | ')} |`).join('\n')
const pct = (w, tot) => `${((w / Math.max(1, tot)) * 100).toFixed(1)}%`
const bgTotal = bgc.reduce((n, x) => n + x.w, 0)

const md = `# Reference card — ${m.title || url}

\`${url}\` · ${vw}×${vh} · \`prefers-color-scheme: ${theme}\` · ${m.nodeCount} visible elements
Waited for ${waited}${consent ? ` · dismissed a consent wall (\`${consent}\`)` : ''}${fontsReady ? '' : ' · **fonts were still loading — the type table may name fallbacks**'}
Measured, not judged. **This is an input to differentiation, not a theme to ship**
(→ \`references/reference-mining.md\` § The differentiation rule).

## 1. Palette with roles

Rendered as **${isDark ? 'DARK' : 'LIGHT'}**; surface L = ${surface ? surface.c.L.toFixed(3) : '?'}.

| role | OKLCH | share of painted area | as served |
|---|---|---|---|
${table([...new Set([surface, accent, brandSurface, ...bgc.slice(0, 8)])].filter(Boolean).slice(0, 9)
  .map((x, i) => [x === surface ? '**surface**' : x === accent ? '**accent**' : x === brandSurface ? '**brand surface**' : `bg ${i}`, fmt(x.c), pct(x.w, bgTotal), '`' + x.raw + '`']))}

Text: ${fgc.slice(0, 4).map((x) => fmt(x.c)).join(' · ') || '—'}
Border: ${bdc.slice(0, 3).map((x) => fmt(x.c)).join(' · ') || '— (borderless)'}
Accent hue: ${accent ? `**${accent.c.H.toFixed(0)}°** at C ${accent.c.C.toFixed(3)}, on ${pct(accent.w, bgTotal)} of painted area — identified by ${accentBasis}` : 'none above C 0.06 — this palette is achromatic'}
Brand surface (the 30% band): ${brandSurface ? `${fmt(brandSurface.c)} at ${pct(brandSurface.w, bgTotal)}` : '— none; neutral surfaces only'}
Chromatic backgrounds: ${bgc.filter((x) => x.c.C >= 0.06).length} of ${bgc.length} distinct · neutral steps: ${neutrals.length}
Tints (α<0.5 washes — status/hover layers, not palette entries): ${tints.length ? tints.map((x) => fmt(x.c)).join(' · ') : '— none'}

## 2. Type pairing and weights

Loaded faces: ${m.fontFaces.length ? m.fontFaces.map((f) => '`' + f + '`').join(' · ') : '— none (system stack)'}
\`@font-face\` families in CSS: ${faceSrc.length ? faceSrc.slice(0, 12).map((f) => '`' + f + '`').join(' · ') + (faceSrc.length > 12 ? ` … +${faceSrc.length - 12} more (a font *gallery*, not a type system — read the "stacks in use" line instead)` : '') : '—'}
Stacks in use: ${m.families.map(([f, n]) => `\`${f.split(',')[0].replace(/["']/g, '')}\` (${n} chars)`).join(' · ')}

| size/weight/line-height/tracking/transform | uses | sample |
|---|---|---|
${table(m.ramp.map((r) => ['`' + r.k + '`', r.n, r.sample.replace(/\|/g, '\\|') || '—']))}

Measure: ${measureMed ? `${measureMed}ch median across ${m.measures.length} paragraphs` : 'no paragraph over 120 chars found'}

## 3. Radius

${m.radius.map(([r, n]) => `\`${r === 'pill/circle' ? r : r + 'px'}\` ×${n}`).join(' · ') || 'all square'}
Base **${radiusMode ? radiusMode + 'px' : 'square'}** (most-used numeric step) · pill/circle on ${pillCount} corners

## 4. Elevation recipe

${m.shadow.length ? m.shadow.map(([s, n]) => `- ×${n} \`${s}\``).join('\n') : '- none — this design is border-first'}
Borders present on ${bdc.length} distinct colours.

## 5. Grid / spacing / measure

Inferred base unit: **${unit}px** (${(gridShare * 100).toFixed(0)}% of uses) · on a 4px grid: ${(onGrid(4) * 100).toFixed(0)}% · 8px: ${(onGrid(8) * 100).toFixed(0)}%${onGrid(4) < 0.8 ? '\nThis reference is off the 4px grid the skill mandates — read the histogram for which values escaped, and do not carry them over.' : ''}
${m.space.filter(([v]) => v % 4 !== 0).length ? `Off-4px values: ${m.space.filter(([v]) => v % 4 !== 0).map(([v, n]) => `${v}px×${n}`).join(' · ')}` : 'Every measured spacing value is on the 4px grid.'}
Spacing histogram: ${m.space.map(([v, n]) => `${v}px×${n}`).join(' · ')}
Container widths: ${m.widths.map(([w, n]) => `${w}px×${n}`).join(' · ')}
Centred text nodes: ${m.centred} / ${m.nodeCount}

## 6. Motion

Durations: ${m.dur.map(([d, n]) => `${d}ms×${n}`).join(' · ') || '— none'}
Median: **${durUiMedian ?? '—'}ms** across UI transitions ≤1s${durMedian !== durUiMedian ? ` · ${durMedian}ms including ambient loops` : ''}
Curves: ${m.ease.map(([e, n]) => `\`${e}\`×${n}`).join(' · ') || '—'}
Animated properties: ${m.prop.map(([p, n]) => `${p}×${n}`).join(' · ') || '—'}
Keyframe animations running: ${m.animated}

## 7. Named token census — the source pass

${censusMd}

## Dials, measured

${Object.entries(dials).map(([k, v]) => `- **${k}** — ${v}`).join('\n')}
Texture counts: ${Object.entries(m.tex).map(([k, v]) => `${k} ${v}`).join(' · ')}

## Authored token layer, as the browser saw it (${designProps.length} design-relevant custom properties of ${customProps.size} total${dumped ? `; ${dumped} framework-default palette entries dropped` : ''})

This is the values-only view kept for continuity with the JSON: names the *browser run* pulled, in
first-seen order, with no selector context. Section 7 is the same territory read properly.
${sourceTokens.ok ? `Names here that section 7's source pass did not see (injected at runtime, or in CSS only this page load requested): **${runtimeOnly.length}**${runtimeOnly.length ? ` — ${runtimeOnly.slice(0, 12).map((n) => '`' + n + '`').join(' · ')}${runtimeOnly.length > 12 ? ` … +${runtimeOnly.length - 12}` : ''}` : ''}` : ''}

${designProps.length
  ? '```css\n' + designProps.slice(0, 60).map(([n, v]) => `${n}: ${v};`).join('\n') + '\n```'
  : '_No CSS custom properties reached — the site inlines values, ships no design system, or serves CSS this run did not see._'}
`

const report = { url, viewport: `${vw}x${vh}`, theme, title: m.title, isDark,
  captured: { waitedFor: waited, consentDismissed: consent, fontsReady },
  palette: { surface: surface && fmt(surface.c), accent: accent && fmt(accent.c), accentBasis, accentShare: accent && accent.w / Math.max(1, bgTotal), brandSurface: brandSurface && fmt(brandSurface.c), backgrounds: bgc.slice(0, 8).map((x) => ({ oklch: fmt(x.c), weight: x.w, raw: x.raw })), text: fgc.slice(0, 4).map((x) => fmt(x.c)), border: bdc.slice(0, 3).map((x) => fmt(x.c)) },
  type: { faces: m.fontFaces, fontFaceFamilies: faceSrc, stacks: m.families, ramp: m.ramp, measureCh: measureMed },
  radius: { histogram: m.radius, base: radiusMode, pillCorners: pillCount },
  shadow: m.shadow, spacing: { unit, gridShare, histogram: m.space, containers: m.widths, centred: m.centred },
  motion: { durations: m.dur, easings: m.ease, properties: m.prop, keyframes: m.animated, medianUiMs: durUiMedian, medianAllMs: durMedian },
  texture: m.tex, dials, customProperties: Object.fromEntries(designProps.slice(0, 200)),
  sourceTokens, runtimeOnlyProperties: runtimeOnly.slice(0, 60), nodeCount: m.nodeCount }

if (out) {
  mkdirSync(dirname(`${out}.md`), { recursive: true })
  writeFileSync(`${out}.md`, md)
  writeFileSync(`${out}.json`, JSON.stringify(report, null, 2))
  console.log(`✓ wrote ${out}.md and ${out}.json`)
} else if (asJson) {
  console.log(JSON.stringify(report, null, 2))
} else {
  console.log(md)
}
