#!/usr/bin/env node
// validate-chart-palette — the chart palette half of the Phase-5 gate, as a command.
//
// Reads --chart-1..N and the chart surface (--card) straight out of the skill's theme,
// for BOTH modes, and runs the six computable checks. Colour is computable, so it is
// computed: never eyeball whether a palette is colourblind-safe.
//
//   node .claude/skills/superdesign/scripts/validate-chart-palette.mjs                   # shipped theme
//   node .claude/skills/superdesign/scripts/validate-chart-palette.mjs path/to/theme.css # a generated one
//
// EXIT-CODE CONTRACT — identical in every superdesign gate (ARCHITECTURE.md §2):
//   0        clean
//   1–63     the number of violations. A count above 63 is clamped to 63 and the line says so.
//   64–79    harness error — 64 usage · 65 missing dep · 66 navigation failed · 67 no target
// Here a violation is one failed check in one mode.
// A WARN is not a failure but it is an obligation: a slot under 3:1 must carry relief
// (a direct label, a 2px surface gap, or a table view). Never colour alone.
//
// CVD simulation: Machado, Oliveira & Fernandes (2009) severity-1.0 transforms in linear
// RGB. Thresholds are calibrated to that simulation — swapping in Viénot-1999 moves
// borderline pairs and would require recalibrating them.

import { readFileSync } from 'node:fs'

const BAND = { light: [0.43, 0.77], dark: [0.48, 0.67] } // OKLCH L
const CHROMA_FLOOR = 0.1
const CVD_TARGET = 8.0 // OKLab ΔE×100, min(protan, deutan), adjacent pairs
const NORMAL_FLOOR = 15.0 // full-colour readers must tell adjacent slots apart
const CONTRAST_MIN = 3.0

const CVD = {
  protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]],
  tritan: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.303900]],
}

const lin = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
const gam = (v) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055)
const clamp01 = (v) => Math.min(1, Math.max(0, v))

/** OKLCH → linear sRGB triplet (may be out of gamut; callers clamp). */
function oklchToLinear(L, C, H) {
  const h = (H * Math.PI) / 180
  const a = C * Math.cos(h)
  const b = C * Math.sin(h)
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
}

/** linear sRGB → OKLab. */
function linearToOklab([r, g, b]) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

const toHex = (linRGB) =>
  '#' + linRGB.map((v) => Math.round(clamp01(gam(clamp01(v))) * 255).toString(16).padStart(2, '0')).join('')

const relLum = (linRGB) => {
  const [r, g, b] = linRGB.map(clamp01)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a, b) => {
  const [hi, lo] = [relLum(a), relLum(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

const simulate = (linRGB, kind) => CVD[kind].map((row) => row.reduce((sum, k, i) => sum + k * clamp01(linRGB[i]), 0))

function deltaE(a, b, kind) {
  const [A, B] = kind ? [simulate(a, kind), simulate(b, kind)] : [a, b]
  const [l1, a1, b1] = linearToOklab(A)
  const [l2, a2, b2] = linearToOklab(B)
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2) * 100
}

/** Pull `--name: oklch(L C H)` out of one CSS block. */
function readTokens(css, blockRe) {
  const block = css.match(blockRe)
  if (!block) return null
  const out = {}
  for (const m of block[0].matchAll(/--([\w-]+)\s*:\s*oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/g)) {
    out[m[1]] = [+m[2], +m[3], +m[4]]
  }
  return out
}

function checkMode(mode, tokens) {
  const slots = Object.keys(tokens)
    .filter((k) => /^chart-\d+$/.test(k))
    .sort((a, b) => +a.split('-')[1] - +b.split('-')[1])
  if (!slots.length) return { mode, fails: 1, lines: [['FAIL', 'Tokens', 'no --chart-N tokens found']] }
  if (!tokens.card) return { mode, fails: 1, lines: [['FAIL', 'Surface', 'no --card token to validate against']] }

  const surface = oklchToLinear(...tokens.card)
  const cols = slots.map((k) => ({ name: k, ok: tokens[k], lin: oklchToLinear(...tokens[k]) }))
  const lines = []
  let fails = 0
  const push = (ok, label, detail) => {
    lines.push([ok ? 'PASS' : 'FAIL', label, detail])
    if (!ok) fails++
  }

  const [lo, hi] = BAND[mode]
  const outside = cols.filter((c) => c.ok[0] < lo || c.ok[0] > hi)
  push(!outside.length, 'Lightness band', outside.length
    ? `outside L ${lo}–${hi}: ${outside.map((c) => `${c.name} ${c.ok[0]}`).join(', ')}`
    : `all ${cols.length} inside L ${lo}–${hi}`)

  const grayish = cols.filter((c) => c.ok[1] < CHROMA_FLOOR)
  push(!grayish.length, 'Chroma floor', grayish.length
    ? `reads gray: ${grayish.map((c) => `${c.name} C=${c.ok[1]}`).join(', ')}`
    : `all ${cols.length} C >= ${CHROMA_FLOOR}`)

  const adjacent = cols.slice(0, -1).map((c, i) => [c, cols[i + 1]])
  let worstCvd = { d: Infinity }
  for (const [a, b] of adjacent) {
    for (const kind of ['protan', 'deutan']) {
      const d = deltaE(a.lin, b.lin, kind)
      if (d < worstCvd.d) worstCvd = { d, kind, a: a.name, b: b.name }
    }
  }
  const tritan = Math.min(...adjacent.map(([a, b]) => deltaE(a.lin, b.lin, 'tritan')))
  push(worstCvd.d >= CVD_TARGET, 'CVD separation',
    `worst adjacent ${worstCvd.a}↔${worstCvd.b} ΔE ${worstCvd.d.toFixed(1)} (${worstCvd.kind}) · tritan ${tritan.toFixed(1)}`)

  let worstNormal = { d: Infinity }
  for (const [a, b] of adjacent) {
    const d = deltaE(a.lin, b.lin, null)
    if (d < worstNormal.d) worstNormal = { d, a: a.name, b: b.name }
  }
  push(worstNormal.d >= NORMAL_FLOOR, 'Normal-vision floor',
    `worst adjacent ${worstNormal.a}↔${worstNormal.b} ΔE ${worstNormal.d.toFixed(1)}`)

  const low = cols
    .map((c) => [c.name, contrast(c.lin, surface)])
    .filter(([, r]) => r < CONTRAST_MIN)
  lines.push(low.length
    ? ['WARN', 'Contrast vs surface', `below ${CONTRAST_MIN}:1 — relief required (label, gap, or table view): ${low.map(([n, r]) => `${n} ${r.toFixed(2)}`).join(', ')}`]
    : ['PASS', 'Contrast vs surface', `all ${cols.length} >= ${CONTRAST_MIN}:1`])

  return { mode, fails, lines, hexes: cols.map((c) => toHex(c.lin)), surfaceHex: toHex(surface) }
}

// The script lives inside the skill package now, so the shipped theme is one level up, not four.
const file = process.argv[2] || new URL('../assets/theme.css', import.meta.url).pathname
let css
try {
  css = readFileSync(file, 'utf8')
} catch (e) {
  console.error(`✗ chart palette: cannot read ${file} — ${e.message}`)
  process.exit(67) // 67 = no target
}

// Non-greedy to the first `}`: a token block never nests, and requiring a newline
// before the brace made single-line blocks invisible to the parser.
const modes = [
  ['light', readTokens(css, /:root\s*\{[^{}]*\}/)],
  ['dark', readTokens(css, /\.dark\s*\{[^{}]*\}/)],
]

let total = 0
let checked = 0
for (const [mode, tokens] of modes) {
  if (!tokens) {
    // A block the parser could not find is a failure, not a pass. Silently skipping
    // both modes and then printing "ALL CHECKS PASS" is how a gate becomes decoration.
    console.log(`\n[FAIL] ${mode}: no \`${mode === 'light' ? ':root' : '.dark'} { … }\` block found in ${file}`)
    total++
    continue
  }
  checked++
  const r = checkMode(mode, tokens)
  total += r.fails
  console.log(`\nChart palette — ${mode} on ${r.surfaceHex ?? '?'}${r.hexes ? ` (${r.hexes.join(' ')})` : ''}`)
  for (const [tag, label, detail] of r.lines) console.log(`  [${tag}] ${label.padEnd(22)} ${detail}`)
}

console.log(total === 0
  ? `\n✓ chart palette: ALL CHECKS PASS (${checked} mode${checked === 1 ? '' : 's'})`
  : `\n✗ chart palette: ${total} failed check(s)`)
// Contract: 1–63 is the violation count; clamp so a count can never be read as a harness code.
if (total > 63) console.log(`  (exit code clamped to 63; ${total} failed check(s) found)`)
process.exit(Math.min(total, 63))
