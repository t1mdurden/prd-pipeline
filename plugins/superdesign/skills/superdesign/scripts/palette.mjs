#!/usr/bin/env node
// palette — author an OKLCH ramp from one seed, then prove it with a FULL AA contrast census.
//
// The discipline is ui-ux-pro-max.md §2: their table passes 1152 of 1152 fg/bg pairs because the
// pairs were COMPUTED, not asserted — a full census, not a five-row sample. Ours is a census too:
// every semantic pair the theme actually defines, in light AND dark, measured. The dkuvpn field run
// credits exactly this check with catching three real AA failures at token-authoring time, two of
// which no amount of looking at the file would have found.
//
//   node .claude/skills/superdesign/scripts/palette.mjs --seed oklch(0.55 0.15 265)   # both ramps
//   node .claude/skills/superdesign/scripts/palette.mjs --seed '#2563eb' --dark        # dark only
//   node .claude/skills/superdesign/scripts/palette.mjs --check examples/app-ui/src/index.css
//   node .claude/skills/superdesign/scripts/palette.mjs --check theme.css --verbose    # every pair
//   node .claude/skills/superdesign/scripts/palette.mjs --harmony a.css b.css          # never gates
//
// EXIT-CODE CONTRACT — identical in every superdesign gate (ARCHITECTURE.md §2):
//   0        clean
//   1–63     the number of violations. A count above 63 is clamped to 63 and the line says so.
//   64–79    harness error — 64 usage · 65 missing dep · 66 navigation failed · 67 no target
// Here a violation is one failing fg/bg pair in one mode, plus one per breached hard cap.
// --harmony NEVER changes the exit code: on any network failure it prints `harmony: unavailable`
// and the run continues (ARCHITECTURE.md §5 — no phase may block on a network call). Set
// SUPERDESIGN_HUEMINT_URL to point that call somewhere else; that is how the offline path is
// tested rather than asserted (`SUPERDESIGN_HUEMINT_URL=http://127.0.0.1:9 … --harmony`).

import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { createHash } from 'node:crypto'

/* ── colour maths ────────────────────────────────────────────────────────────────────────────
   Both directions already exist in this package and are copied here rather than re-derived:
   OKLCH → linear sRGB from `validate-chart-palette.mjs`, linear sRGB → OKLCH and the colour-string
   parser from `extract-reference.mjs` (§"colour: whatever the browser serialised → OKLCH", itself
   the pair of Björn Ottosson matrices). Three copies of the same matrices would be three chances
   to typo one; these two are the same numbers as those files, verbatim. */

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

/** linear sRGB → OKLCH [L, C, H]. */
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

/** Any authored colour string → {L,C,H,a} or null. Narrower than extract-reference's parser
 *  (that one reads what a BROWSER serialised; this one reads what a human TYPED in theme.css). */
function parseColor(str) {
  if (!str) return null
  const s = str.trim()
  if (s === 'transparent' || s === 'none') return null
  let m = s.match(/^oklch\(\s*([\d.]+%?)\s+([\d.]+%?)\s+([\d.]+)(?:deg)?(?:\s*\/\s*([\d.]+%?))?\s*\)/i)
  if (m) {
    const pc = (v, sc) => (v.endsWith('%') ? (parseFloat(v) / 100) * sc : parseFloat(v))
    return { L: pc(m[1], 1), C: pc(m[2], 0.4), H: parseFloat(m[3]), a: m[4] === undefined ? 1 : pc(m[4], 1) }
  }
  m = s.match(/^#([0-9a-f]{3,8})$/i)
  if (m) {
    const h = m[1]
    const ex = h.length <= 4 ? h.split('').map((c) => c + c).join('') : h
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(ex.slice(i, i + 2), 16) / 255)
    const a = ex.length === 8 ? parseInt(ex.slice(6, 8), 16) / 255 : 1
    const [L, C, H] = linearToOklch(lin(r), lin(g), lin(b))
    return { L, C, H, a }
  }
  m = s.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,/\s]+([\d.]+%?))?/i)
  if (m) {
    const a = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4])
    const [L, C, H] = linearToOklch(lin(+m[1] / 255), lin(+m[2] / 255), lin(+m[3] / 255))
    return { L, C, H, a }
  }
  return null
}

const srgb = (c) => oklchToLinear(c.L, c.C, c.H).map(clamp01)
const toHex = (c) => '#' + srgb(c).map((v) => Math.round(clamp01(gam(v)) * 255).toString(16).padStart(2, '0')).join('')
// The alpha belongs INSIDE the parens: `oklch(1 0 0 / 10%)`. extract-reference's `fmt` puts it
// outside because it is writing a report; this one is writing CSS a browser has to parse.
const fmt = (c) => `oklch(${c.L.toFixed(3)} ${c.C.toFixed(3)} ${c.H.toFixed(1)}${c.a < 1 ? ` / ${(c.a * 100).toFixed(0)}%` : ''})`

/** CSS alpha compositing happens on gamma-encoded sRGB, not linear — compositing in linear space
 *  makes a 10%-white hairline measure lighter than the browser paints it, which is the direction
 *  that hides a failure. `--border: oklch(1 0 0 / 10%)` in dark mode is exactly this case. */
function over(fg, bg) {
  if (fg.a >= 1) return fg
  const f = srgb(fg).map((v) => clamp01(gam(v)))
  const b = srgb(bg).map((v) => clamp01(gam(v)))
  const out = f.map((v, i) => fg.a * v + (1 - fg.a) * b[i])
  const [L, C, H] = linearToOklch(...out.map(lin))
  return { L, C, H, a: 1 }
}

const relLum = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b
/** WCAG 2.1 relative-luminance contrast — the same formula ui-ux-pro-max ran over its 1152 pairs. */
function contrast(fg, bg) {
  const [hi, lo] = [relLum(srgb(over(fg, bg))), relLum(srgb(bg))].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/* ── the census ──────────────────────────────────────────────────────────────────────────────
   [foreground token, background token, floor, what it is on screen].
   4.5 is AA body text (WCAG 1.4.3). 3.0 is a non-text UI indicator (1.4.11) — the focus ring is
   the only one of those that is gate-worthy, because a ring nobody can see is a keyboard user
   locked out. A pair whose tokens the theme does not define is not evaluated and not counted;
   themes carry different vocabularies and a missing `--info` is a choice, not a failure. */
const PAIRS = [
  ['foreground', 'background', 4.5, 'body text on the canvas'],
  ['foreground', 'card', 4.5, 'body text inside a card'],
  ['foreground', 'muted', 4.5, 'body text on a muted fill'],
  ['card-foreground', 'card', 4.5, 'card text'],
  ['popover-foreground', 'popover', 4.5, 'menu / dropdown text'],
  ['primary-foreground', 'primary', 4.5, 'label on the primary button'],
  ['primary', 'background', 4.5, 'text-primary link on the canvas'],
  ['primary', 'card', 4.5, 'text-primary link inside a card'],
  ['secondary-foreground', 'secondary', 4.5, 'label on the secondary button'],
  ['muted-foreground', 'muted', 4.5, 'secondary text on a muted fill'],
  ['muted-foreground', 'background', 4.5, 'secondary text on the canvas'],
  ['muted-foreground', 'card', 4.5, 'secondary text inside a card'],
  ['accent-foreground', 'accent', 4.5, 'text on a hovered / selected row'],
  ['destructive-foreground', 'destructive', 4.5, 'label on the destructive button'],
  ['destructive', 'background', 4.5, 'text-destructive on the canvas'],
  ['destructive', 'card', 4.5, 'text-destructive inside a card'],
  ['destructive', 'muted', 4.5, 'text-destructive on a muted fill'],
  ['success-foreground', 'success', 4.5, 'label on a success fill'],
  ['warning-foreground', 'warning', 4.5, 'label on a warning fill'],
  ['info-foreground', 'info', 4.5, 'label on an info fill'],
  ['sidebar-foreground', 'sidebar', 4.5, 'sidebar nav label'],
  ['sidebar-primary-foreground', 'sidebar-primary', 4.5, 'label on the sidebar CTA'],
  ['sidebar-accent-foreground', 'sidebar-accent', 4.5, 'label on the active sidebar row'],
  ['ring', 'background', 3.0, 'focus ring against the canvas (WCAG 1.4.11)'],
  ['ring', 'card', 3.0, 'focus ring against a card'],
  ['sidebar-ring', 'sidebar', 3.0, 'focus ring inside the sidebar'],
]

/** Reported with a measured ratio, never counted. WCAG 1.4.11 exempts a purely decorative
 *  boundary, and every shipped shadcn theme puts its hairline far under 3:1 on purpose. Gating it
 *  would fail every real theme, which is the failure mode where a gate becomes decoration. The
 *  author still has to decide: if that hairline is the ONLY thing marking an input, it owes 3:1. */
const ADVISORY = [
  ['border', 'background', 3.0, 'hairline on the canvas'],
  ['border', 'card', 3.0, 'hairline inside a card'],
  ['input', 'background', 3.0, 'input boundary on the canvas'],
  ['input', 'card', 3.0, 'input boundary inside a card'],
  ['sidebar-border', 'sidebar', 3.0, 'sidebar hairline'],
  ['chart-1', 'card', 3.0, 'chart slot 1 on its surface'],
  ['chart-2', 'card', 3.0, 'chart slot 2 on its surface'],
  ['chart-3', 'card', 3.0, 'chart slot 3 on its surface'],
  ['chart-4', 'card', 3.0, 'chart slot 4 on its surface'],
  ['chart-5', 'card', 3.0, 'chart slot 5 on its surface'],
]

/* ── the two neutral ceilings ────────────────────────────────────────────────────────────────
   `brand-to-system.md` states ONE hard ceiling: C ≤ 0.012 on any neutral. `refero-harvest.md`
   measured 203 real shipped tokens tagged `neutral` and found 41 of them (20%) above it, some by
   3–5×. A cap a fifth of shipped systems break is not a cap; silently widening it is not a fix
   either. So there are two named ceilings and the census reports which one the theme is under.
   Only `neutral-natural` gates — that is the line "tinted neutral" stops meaning anything past. */
const NEUTRAL_PURE = 0.012      // Linear/M3 territory: neutral chroma ≈ 6 HCT
const NEUTRAL_NATURAL = 0.025   // the measured upper edge of real "natural pairing" neutrals
const CHROMATIC = 0.04          // above this a token is a deliberate colour, not a tinted neutral

// Roles that are STRUCTURALLY neutral — the canvas, the text on it, the surfaces and the
// hairlines. These are always judged against a neutral ceiling; there is no chroma high enough to
// turn `--background` into "a colour I chose", and letting one exist is how the ceiling stops
// binding on the exact tokens it was written for.
const NEUTRAL_STRICT = ['background', 'foreground', 'card', 'card-foreground', 'popover', 'popover-foreground',
  'muted', 'muted-foreground', 'border', 'input', 'sidebar', 'sidebar-foreground', 'sidebar-border',
  'surface-container', 'surface-container-high', 'surface-container-highest']
// Roles that are neutral in most systems but legitimately chromatic in some — a brand-tinted row
// hover, a coloured secondary button. Measured, not assumed: past CHROMATIC they are counted as a
// hue against the 3–5 cap instead of against a neutral ceiling.
const NEUTRAL_ELECTIVE = ['secondary', 'secondary-foreground', 'accent', 'accent-foreground',
  'sidebar-accent', 'sidebar-accent-foreground']
const NEUTRAL_ROLES = [...NEUTRAL_STRICT, ...NEUTRAL_ELECTIVE]

// Charts are their own sub-system (tokens.md) and the four status roles are function, not brand.
// Counting either against the 3–5 brand-colour cap invents violations no designer would accept.
const OFF_BRAND_HUE = (name) => /^chart-\d+$/.test(name) || /^(destructive|success|warning|info)(-foreground)?$/.test(name)

/* ── reading a theme ─────────────────────────────────────────────────────────────────────────*/

/** Pull every `--name: <value>` out of one CSS block. Non-greedy to the first `}` — a token block
 *  never nests, and this is the same parse `validate-chart-palette.mjs` uses. */
function readBlock(css, re) {
  const block = css.match(re)
  if (!block) return null
  const out = {}
  for (const m of block[0].matchAll(/--([\w-]+)\s*:\s*([^;}]+)/g)) out[m[1]] = m[2].trim()
  return out
}

/** `--sidebar-ring: var(--ring)` is one token, not two. Resolve aliases before parsing colours;
 *  `.dark` inherits from `:root` for anything it does not re-point. */
function resolveTokens(raw, base) {
  const out = {}
  for (const [k, v0] of Object.entries(raw)) {
    let v = v0
    for (let i = 0; i < 5; i++) {
      const m = v.match(/^var\(\s*--([\w-]+)\s*\)$/)
      if (!m) break
      v = raw[m[1]] ?? base?.[m[1]] ?? v
      if (v === v0) break
    }
    const c = parseColor(v)
    if (c) out[k] = c
  }
  return out
}

function parseTheme(css) {
  const rootRaw = readBlock(css, /:root\s*\{[^{}]*\}/)
  const darkRaw = readBlock(css, /\.dark\s*\{[^{}]*\}/)
  if (!rootRaw) return null
  const light = resolveTokens(rootRaw, null)
  // Dark is a re-point of the same names: anything it does not restate keeps the light value.
  const dark = darkRaw ? { ...light, ...resolveTokens({ ...rootRaw, ...darkRaw }, rootRaw) } : null
  return { light, dark, hasDark: !!darkRaw }
}

/* ── the checks ──────────────────────────────────────────────────────────────────────────────*/

function censusMode(mode, tokens) {
  const rows = []
  let evaluated = 0
  let failed = 0
  for (const [fg, bg, floor, why] of PAIRS) {
    if (!tokens[fg] || !tokens[bg]) continue
    evaluated++
    const r = contrast(tokens[fg], tokens[bg])
    const ok = r >= floor - 1e-9
    if (!ok) failed++
    rows.push({ ok, fg, bg, r, floor, why })
  }
  const advisory = []
  for (const [fg, bg, floor, why] of ADVISORY) {
    if (!tokens[fg] || !tokens[bg]) continue
    advisory.push({ fg, bg, r: contrast(tokens[fg], tokens[bg]), floor, why })
  }
  return { mode, evaluated, failed, rows, advisory }
}

function neutralCeiling(mode, tokens) {
  const measured = NEUTRAL_ROLES.filter((n) => tokens[n]).map((n) => ({ n, C: tokens[n].C, H: tokens[n].H }))
  const neutrals = measured.filter((t) => NEUTRAL_STRICT.includes(t.n) || t.C < CHROMATIC)
  const overPure = neutrals.filter((t) => t.C > NEUTRAL_PURE)
  const overNatural = neutrals.filter((t) => t.C > NEUTRAL_NATURAL)
  const tier = overNatural.length ? 'over-ceiling' : overPure.length ? 'neutral-natural' : 'neutral-pure'
  return { mode, count: neutrals.length, tier, overPure, overNatural,
    chromaticNeutralRoles: measured.filter((t) => !NEUTRAL_STRICT.includes(t.n) && t.C >= CHROMATIC) }
}

/** Distinct brand hue families. Two chromatic tokens within ±HUE_BUCKET° are one colour. */
const HUE_BUCKET = 20
function hueCensus(tokens) {
  const brand = []
  const offBrand = []
  for (const [n, c] of Object.entries(tokens)) {
    if (c.C < CHROMATIC) continue
    // A strict neutral over the ceiling is a neutral-chroma violation, already counted there.
    // Counting it a second time as a brand hue would inflate the colour count off one edit.
    if (NEUTRAL_STRICT.includes(n)) continue
    ;(OFF_BRAND_HUE(n) ? offBrand : brand).push({ n, H: c.H, C: c.C })
  }
  const families = []
  for (const t of brand.sort((a, b) => a.H - b.H)) {
    const f = families.find((x) => Math.min(Math.abs(x.H - t.H), 360 - Math.abs(x.H - t.H)) <= HUE_BUCKET)
    if (f) f.members.push(t.n)
    else families.push({ H: t.H, members: [t.n] })
  }
  const offFamilies = []
  for (const t of offBrand.sort((a, b) => a.H - b.H)) {
    const f = offFamilies.find((x) => Math.min(Math.abs(x.H - t.H), 360 - Math.abs(x.H - t.H)) <= HUE_BUCKET)
    if (f) f.members.push(t.n)
    else offFamilies.push({ H: t.H, members: [t.n] })
  }
  return { families, offFamilies }
}

const GENERIC_FAMILY = /^(ui-)?(sans-serif|serif|monospace|system-ui|inherit|initial|unset|var\()/i
function fontCensus(css) {
  const seen = new Map()
  // Only the tokens that actually name a FAMILY. `--font[\w-]*` also swallows `--font-weight-medium`
  // and then reports "500" as a fifth typeface, which is how a cap check starts crying wolf.
  const FAMILY_DECL = /(?:--font(?:-(?:family|sans|serif|mono|display|heading|body|text|brand))?|font-family)\s*:\s*([^;}]+)/g
  for (const m of css.matchAll(FAMILY_DECL)) {
    const first = m[1].split(',')[0].trim().replace(/^["']|["']$/g, '')
    if (!first || /^[\d.]+$/.test(first) || GENERIC_FAMILY.test(first)) continue
    const mono = /mono/i.test(first)
    if (!seen.has(first)) seen.set(first, mono)
  }
  const all = [...seen.keys()]
  const mono = all.filter((f) => seen.get(f))
  const text = all.filter((f) => !seen.get(f))
  // tokens.md §0: "Maximum 2 font families — one display, one text (a third only if it is mono)".
  return { all, text, mono, over: Math.max(0, text.length - 2) + Math.max(0, mono.length - 1) }
}

/* ── the ramp ────────────────────────────────────────────────────────────────────────────────
   Two authored tables, not one table and its inverse. `references/tokens.md` and
   `brand-to-system.md` both say it outright: dark mode is a second art direction — keep the
   semantic names, re-point the aliases, AUTHOR the second ramp. So the dark table below has its
   own lightness steps (elevation goes UP in dark, not down), its own neutral chroma, its own
   brand chroma (lifted L, dropped C), and translucent-white hairlines. Nothing here is 1−L of
   anything above it.

   What is NOT authored is the handful of lightnesses that owe a contrast floor. Those are solved
   numerically against the census that is about to judge them, so a generated ramp cannot ship a
   failing pair for any seed. That is the whole point: the census is the spec, the generator
   solves to it. */

/** Walk L until every constraint clears its floor. Returns the first L that does, or the best
 *  reached — a generator that silently gives up looks identical to one that succeeded. */
function fitL(seed, dir, constraints) {
  const step = dir === 'darker' ? -0.004 : 0.004
  let best = { L: seed.L, worst: -1 }
  for (let i = 0; i <= 175; i++) {
    const L = clamp01(seed.L + step * i)
    const c = { ...seed, L }
    const worst = Math.min(...constraints.map(({ on, floor }) => contrast(c, on) / floor))
    if (worst > best.worst) best = { L, worst }
    if (worst >= 1) return { ...seed, L }
    if (L === 0 || L === 1) break
  }
  return { ...seed, L: best.L, unsolved: best.worst < 1 }
}

const ok = (L, C, H) => ({ L, C, H, a: 1 })
const CHART_OFFSETS = [0, 215, 70, 290, 145] // adjacent gaps 215/145/220/215 — separation, not tidiness
const rot = (h, d) => (h + d + 360) % 360

function buildRamp(seed) {
  const H = seed.H              // brand hue
  const Cb = Math.min(Math.max(seed.C, 0.06), 0.19) // brand chroma, clamped to a usable band
  const Hn = H                  // neutrals tinted toward the accent hue ("natural pairing")
  const Cn = 0.010              // inside neutral-pure; --border/--muted sit lower still
  // A destructive hue is PLACED, not inherited: pushed off the brand hue so an alert can never
  // read as brand. 25 is the red band; if the brand IS red, the alert moves to 15 and the brand
  // keeps its own place.
  const Hd = Math.min(Math.abs(rot(H, -25)), 360 - Math.abs(rot(H, -25))) < 30 ? 15 : 25

  const out = {}
  for (const mode of ['light', 'dark']) {
    const t = {}
    const D = mode === 'dark'
    // ── authored surfaces ──────────────────────────────────────────────────────────────────
    t.background = D ? ok(0.165, 0.010, Hn) : ok(1, 0, 0)
    t.card = D ? ok(0.215, 0.010, Hn) : ok(1, 0, 0)          // dark elevation = LIGHTER surface
    t.popover = D ? ok(0.215, 0.010, Hn) : ok(1, 0, 0)
    t.muted = D ? ok(0.275, 0.011, Hn) : ok(0.968, 0.004, Hn)
    t.secondary = { ...t.muted }
    t.accent = D ? ok(0.310, 0.012, Hn) : ok(0.958, 0.006, Hn) // neutral: brand is not a row hover
    t.sidebar = D ? ok(0.185, 0.010, Hn) : ok(0.985, 0.004, Hn)
    t['sidebar-accent'] = D ? ok(0.275, 0.011, Hn) : ok(0.955, 0.006, Hn)
    t.border = D ? { L: 1, C: 0, H: 0, a: 0.10 } : ok(0.922, 0.005, Hn)
    t.input = D ? { L: 1, C: 0, H: 0, a: 0.15 } : ok(0.922, 0.005, Hn)
    t['sidebar-border'] = { ...t.border }
    t['surface-container'] = D ? ok(0.240, 0.010, Hn) : ok(0.985, 0.004, Hn)
    t['surface-container-high'] = D ? ok(0.280, 0.011, Hn) : ok(0.970, 0.005, Hn)
    t['surface-container-highest'] = D ? ok(0.320, 0.012, Hn) : ok(0.955, 0.006, Hn)

    const darkest = D ? t.background : t.accent  // the least forgiving backdrop in this mode
    const lightest = D ? t.accent : t.background

    // ── solved text ────────────────────────────────────────────────────────────────────────
    t.foreground = fitL(D ? ok(0.97, 0.004, Hn) : ok(0.30, Cn, Hn), D ? 'lighter' : 'darker',
      [{ on: t.background, floor: 4.6 }, { on: t.card, floor: 4.6 }, { on: t.muted, floor: 4.6 }, { on: t.accent, floor: 4.6 }])
    t['card-foreground'] = { ...t.foreground }
    t['popover-foreground'] = { ...t.foreground }
    t['secondary-foreground'] = { ...t.foreground }
    t['accent-foreground'] = { ...t.foreground }
    t['sidebar-foreground'] = { ...t.foreground }
    t['sidebar-accent-foreground'] = { ...t.foreground }
    t['muted-foreground'] = fitL(D ? ok(0.68, 0.012, Hn) : ok(0.55, 0.018, Hn), D ? 'lighter' : 'darker',
      [{ on: t.background, floor: 4.6 }, { on: t.card, floor: 4.6 }, { on: t.muted, floor: 4.6 }])

    // ── brand ──────────────────────────────────────────────────────────────────────────────
    // Light: white sits on the brand fill and the brand also has to survive as link text on the
    // canvas, so it is solved DOWN. Dark: the on-text flips to near-black and the fill is solved
    // UP — the same three constraints, a different direction, a different authored start.
    t['primary-foreground'] = D ? ok(0.20, 0.010, Hn) : ok(0.985, 0.002, H)
    t.primary = fitL(D ? ok(0.70, Math.min(Cb, 0.12), H) : ok(0.58, Cb, H), D ? 'lighter' : 'darker',
      [{ on: t['primary-foreground'], floor: 4.6 }, { on: t.background, floor: 4.6 }, { on: t.card, floor: 4.6 }])
    t.ring = { ...t.primary }
    t['sidebar-primary'] = { ...t.primary }
    t['sidebar-primary-foreground'] = { ...t['primary-foreground'] }
    t['sidebar-ring'] = { ...t.primary }

    // ── semantic status: fills that must carry white/black AND read as text on three surfaces ──
    const status = (hue, chroma, lightSeed, darkSeed) => {
      const fgTok = D ? ok(0.205, 0.006, Hn) : ok(0.985, 0, 0)
      const fill = fitL(D ? ok(darkSeed, chroma * 0.85, hue) : ok(lightSeed, chroma, hue), D ? 'lighter' : 'darker',
        [{ on: fgTok, floor: 4.6 }, { on: t.background, floor: 4.6 }, { on: t.card, floor: 4.6 }, { on: t.muted, floor: 4.6 }])
      return [fill, fgTok]
    }
    ;[t.destructive, t['destructive-foreground']] = status(Hd, 0.19, 0.55, 0.70)

    // ── charts: their own sub-system, ordered for adjacent hue separation ───────────────────
    const chartL = D ? [0.62, 0.65, 0.60, 0.66, 0.63] : [0.62, 0.66, 0.58, 0.75, 0.68]
    const chartC = D ? [0.128, 0.150, 0.140, 0.135, 0.145] : [0.140, 0.160, 0.150, 0.150, 0.140]
    CHART_OFFSETS.forEach((d, i) => { t[`chart-${i + 1}`] = ok(chartL[i], chartC[i], rot(H, d)) })

    void darkest; void lightest
    out[mode] = t
  }
  return out
}

const RAMP_ORDER = [
  ['background', 'foreground'], ['card', 'card-foreground'], ['popover', 'popover-foreground'],
  ['muted', 'muted-foreground'], ['primary', 'primary-foreground'], ['secondary', 'secondary-foreground'],
  ['accent', 'accent-foreground'], ['destructive', 'destructive-foreground'], ['border', 'input'],
  ['ring', null], ['sidebar', 'sidebar-foreground'], ['sidebar-primary', 'sidebar-primary-foreground'],
  ['sidebar-accent', 'sidebar-accent-foreground'], ['sidebar-border', 'sidebar-ring'],
  ['surface-container', 'surface-container-high'], ['surface-container-highest', null],
  ['chart-1', 'chart-2'], ['chart-3', 'chart-4'], ['chart-5', null],
]

function emitBlock(selector, t) {
  const lines = [`${selector} {`]
  for (const [a, b] of RAMP_ORDER) {
    const one = (n) => `--${n}: ${fmt(t[n])};`
    lines.push(b ? `  ${one(a).padEnd(50)}${one(b)}` : `  ${one(a)}`)
  }
  lines.push('}')
  return lines.join('\n')
}

/* ── harmony (never blocks, never gates) ─────────────────────────────────────────────────────
   `ranking-mechanisms.md` and ARCHITECTURE.md §5: huemint is a GENERATOR when any palette slot is
   "-", and a deterministic SCORER when every slot is pinned. The scorer is only comparable if the
   entire request is held constant — the same palette on a different adjacency matrix scores
   differently, and on one matrix all ten returned results were identical across three calls while
   on another two of ten diverged. So the two calls below differ in exactly one field, `palette`,
   and the tool proves that by hashing the request with `palette` removed and printing the digest
   for both. Same digest, or the comparison is not a comparison. */
const HUEMINT_URL = process.env.SUPERDESIGN_HUEMINT_URL || 'https://api.huemint.com/color'
const HARMONY_ROLES = ['background', 'card', 'primary', 'foreground']
// 4×4, symmetric, zero diagonal. Frozen: changing one number invalidates every score ever printed.
const ADJACENCY = ['0', '65', '45', '35', '65', '0', '35', '65', '45', '35', '0', '35', '35', '65', '35', '0']
const FIXED_REQUEST = { mode: 'transformer', num_colors: '4', temperature: '1.2', num_results: '1', adjacency: ADJACENCY }

async function score(hexes) {
  // num_results is pinned but the endpoint ignores it and returns 10 near-duplicate evaluations
  // (measured, 5 calls). Aggregate them; a single slot is not the score.
  const body = { ...FIXED_REQUEST, palette: hexes }
  const digest = createHash('sha256').update(JSON.stringify({ ...body, palette: undefined })).digest('hex').slice(0, 12)
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), 8000)
  try {
    const res = await fetch(HUEMINT_URL, {
      method: 'POST', signal: ctl.signal,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = await res.json()
    const scores = (json.results || []).map((r) => r.score).filter((s) => typeof s === 'number').sort((a, b) => a - b)
    if (!scores.length) throw new Error('no scored results')
    // MEDIAN is the headline, not the mean. `ranking-mechanisms.md` measured 8 of 10 slots landing
    // on one identical value with 2 outliers an order of magnitude away; a mean is those two
    // outliers' to move, a median is not.
    const mid = scores.length % 2 ? scores[(scores.length - 1) / 2] : (scores[scores.length / 2 - 1] + scores[scores.length / 2]) / 2
    return { digest, n: scores.length, median: mid, mean: scores.reduce((a, b) => a + b, 0) / scores.length, min: scores[0], max: scores[scores.length - 1] }
  } catch (e) {
    return { digest, error: e.name === 'AbortError' ? 'timeout' : e.message }
  } finally {
    clearTimeout(timer)
  }
}

function harmonyPalette(tokens) {
  return HARMONY_ROLES.map((r) => (tokens[r] ? toHex(over(tokens[r], tokens.background || tokens[r])) : '#808080'))
}

const HARMONY_CAVEAT = [
  'What this number is: colour harmony under one model\'s objective, on one literally fixed request.',
  'What it is not: a verdict on the design. It cannot see layout, type, spacing or hierarchy, and',
  'scores are not comparable across a change of mode, temperature or adjacency.',
]

async function runHarmony(entries) {
  console.log('\nHarmony — huemint, fully pinned palette (scorer, not generator)')
  const results = []
  for (const { label, tokens } of entries) {
    const hexes = harmonyPalette(tokens)
    const s = await score(hexes)
    results.push({ label, hexes, s })
  }
  const failed = results.filter((r) => r.s.error)
  if (failed.length) {
    console.log(`  harmony: unavailable (${failed.map((r) => `${r.label}: ${r.s.error}`).join(' · ')})`)
    console.log('  the exit code is unchanged — no phase blocks on a network call (ARCHITECTURE.md §5)')
    return
  }
  const digests = new Set(results.map((r) => r.s.digest))
  console.log(`  request (palette removed) sha256/12: ${[...digests].join(' vs ')}  → ${digests.size === 1 ? 'IDENTICAL — the two calls differ only in `palette`' : 'DIFFERENT — not comparable'}`)
  console.log(`  frozen: mode=${FIXED_REQUEST.mode} num_colors=${FIXED_REQUEST.num_colors} temperature=${FIXED_REQUEST.temperature} adjacency=[${ADJACENCY.join(',')}]`)
  console.log(`  roles pinned, in order: ${HARMONY_ROLES.join(', ')}`)
  for (const r of results) {
    console.log(`  ${r.label.padEnd(24)} ${r.hexes.join(' ')}  median ${r.s.median.toFixed(6)}  mean ${r.s.mean.toFixed(6)}  (${r.s.n} results, ${r.s.min.toFixed(3)} to ${r.s.max.toFixed(3)})`)
  }
  if (results.length === 2 && digests.size === 1) {
    const [a, b] = results
    const d = b.s.median - a.s.median
    console.log(`  Δmedian ${d.toFixed(6)} (${b.label} − ${a.label})`)
    // Direction, measured rather than recalled: on this exact request a deliberately clashing
    // palette (#ff0000 #00ff00 #0000ff #ffff00) scored HIGHER than a calm one, so the LOWER (more
    // negative) score is the more harmonious of a pair. n=2, one request — an observed direction,
    // not a documented contract.
    console.log(`  lower is more harmonious on this request → ${d === 0 ? 'tie' : (d < 0 ? b.label : a.label)}`)
  }
  for (const line of HARMONY_CAVEAT) console.log(`  ${line}`)
}

/* ── output ──────────────────────────────────────────────────────────────────────────────────*/

function reportTheme(label, tokens, mode, verbose) {
  const c = censusMode(mode, tokens)
  console.log(`\n${label} — ${mode}: ${c.evaluated} semantic pair(s) measured, ${c.failed} failing`)
  for (const r of c.rows) {
    if (!r.ok) console.log(`  [FAIL] --${r.fg} on --${r.bg}`.padEnd(52) + `${r.r.toFixed(2)}:1  needs ${r.floor.toFixed(1)}:1  — ${r.why}`)
    else if (verbose) console.log(`  [PASS] --${r.fg} on --${r.bg}`.padEnd(52) + `${r.r.toFixed(2)}:1  needs ${r.floor.toFixed(1)}:1`)
  }
  for (const r of c.advisory) {
    const under = r.r < r.floor
    if (under || verbose) console.log(`  [${under ? 'ADVISORY' : 'PASS'}] --${r.fg} on --${r.bg}`.padEnd(52) + `${r.r.toFixed(2)}:1  ref ${r.floor.toFixed(1)}:1  — ${r.why}`)
  }
  const n = neutralCeiling(mode, tokens)
  const tierLine = n.tier === 'neutral-pure'
    ? `neutral-pure (all ${n.count} neutrals C ≤ ${NEUTRAL_PURE})`
    : n.tier === 'neutral-natural'
      ? `neutral-natural (${n.overPure.length} of ${n.count} above ${NEUTRAL_PURE}, none above ${NEUTRAL_NATURAL}) — a named, legal tier`
      : `OVER CEILING — ${n.overNatural.length} neutral(s) above ${NEUTRAL_NATURAL}: ${n.overNatural.map((t) => `--${t.n} C=${t.C.toFixed(3)}`).join(', ')}`
  console.log(`  [${n.tier === 'over-ceiling' ? 'FAIL' : 'PASS'}] neutral chroma`.padEnd(52) + tierLine)
  if (n.chromaticNeutralRoles.length) {
    console.log(`  [note ] chromatic by choice`.padEnd(52) + n.chromaticNeutralRoles.map((t) => `--${t.n} C=${t.C.toFixed(3)}`).join(', ') + ' — judged as hues, not neutrals')
  }
  return c.failed + n.overNatural.length
}

function reportCaps(tokens, css) {
  let v = 0
  const h = hueCensus(tokens)
  const total = h.families.length + 1 // + the neutral family
  const list = h.families.map((f) => `H${f.H.toFixed(0)} (${f.members.join(', ')})`).join(' · ') || 'none'
  const over = total > 5
  if (over) v++
  console.log(`  [${over ? 'FAIL' : 'PASS'}] colour count`.padEnd(52) +
    `${total} (neutrals + ${h.families.length} brand hue${h.families.length === 1 ? '' : 's'}) vs the 3–5 cap — ${list}`)
  if (total < 3) console.log('  [note ] under 3 colours is not a violation; the cap is an upper bound (tokens.md §0)')
  if (h.offFamilies.length) {
    console.log(`  [note ] outside the cap`.padEnd(52) + h.offFamilies.map((f) => `H${f.H.toFixed(0)} (${f.members.join(', ')})`).join(' · '))
    console.log('         charts are their own sub-system and status hues are function, not brand — both excluded by design')
  }
  const f = fontCensus(css)
  if (f.all.length) {
    if (f.over) v += f.over
    console.log(`  [${f.over ? 'FAIL' : 'PASS'}] font families`.padEnd(52) +
      `${f.text.length} text/display + ${f.mono.length} mono vs the ≤2 (+1 mono) cap — ${f.all.join(', ')}`)
  } else {
    console.log('  [n/a  ] font families'.padEnd(52) + 'no font family declared in this file')
  }
  return v
}

function usage(msg) {
  if (msg) console.error(`✗ palette: ${msg}`)
  console.error(`usage:
  palette.mjs --seed <oklch(L C H)|#hex> [--dark] [--harmony]
  palette.mjs --check <theme.css> [--verbose] [--harmony]
  palette.mjs --harmony <a.css> <b.css>`)
  process.exit(64) // 64 = usage
}

function readTheme(path) {
  let css
  try { css = readFileSync(path, 'utf8') } catch (e) {
    console.error(`✗ palette: cannot read ${path} — ${e.message}`)
    process.exit(67) // 67 = no target
  }
  const parsed = parseTheme(css)
  if (!parsed) {
    console.error(`✗ palette: no \`:root { … }\` token block in ${path}`)
    process.exit(67)
  }
  return { css, ...parsed }
}

/* ── main ────────────────────────────────────────────────────────────────────────────────────*/

const argv = process.argv.slice(2)
const flag = (n) => argv.includes(n)
const val = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined }
const wantHarmony = flag('--harmony')
const verbose = flag('--verbose')

let violations = 0
let harmonyEntries = null
let harmonyOnly = false

if (flag('--seed')) {
  const seed = parseColor(val('--seed') || '')
  if (!seed) usage(`--seed needs an oklch() or #hex colour, got ${JSON.stringify(val('--seed'))}`)
  const ramp = buildRamp(seed)
  const onlyDark = flag('--dark')
  console.log(`/* superdesign palette — seed ${fmt(seed)} → ${toHex(seed)}
   Light and dark are two AUTHORED ramps. Dark is not an inversion of light: its own lightness
   steps, its own neutral chroma, elevation that goes UP, translucent hairlines (tokens.md,
   brand-to-system.md). The lightnesses that owe a contrast floor were solved against the census
   below, so every pair here is computed, not asserted. */`)
  if (!onlyDark) console.log('\n' + emitBlock(':root', ramp.light))
  console.log('\n' + emitBlock('.dark', ramp.dark))
  for (const mode of onlyDark ? ['dark'] : ['light', 'dark']) violations += reportTheme('generated ramp', ramp[mode], mode, verbose)
  console.log('')
  violations += reportCaps(ramp.light, '')
  harmonyEntries = [{ label: 'generated (light)', tokens: ramp.light }]
} else if (flag('--check')) {
  const path = val('--check')
  if (!path) usage('--check needs a path to a theme .css')
  const th = readTheme(path)
  violations += reportTheme(path, th.light, 'light', verbose)
  if (th.dark) violations += reportTheme(path, th.dark, 'dark', verbose)
  else console.log('\n[FAIL] no `.dark { … }` block — dark is a second authored ramp, not an option')
  if (!th.dark) violations++
  console.log('')
  violations += reportCaps(th.light, th.css)
  harmonyEntries = [{ label: 'light', tokens: th.light }]
} else if (wantHarmony && argv.filter((a) => !a.startsWith('--')).length === 2) {
  const [a, b] = argv.filter((x) => !x.startsWith('--'))
  harmonyEntries = [{ label: basename(a), tokens: readTheme(a).light }, { label: basename(b), tokens: readTheme(b).light }]
  harmonyOnly = true
} else {
  usage(argv.length ? `unrecognised arguments: ${argv.join(' ')}` : null)
}

if (wantHarmony && harmonyEntries) await runHarmony(harmonyEntries)

// A harmony-only run measured no pairs, so it does not get to claim a clean census.
if (!harmonyOnly) {
  console.log(violations === 0
    ? `\n✓ palette: contrast census clean, hard caps clear`
    : `\n✗ palette: ${violations} violation(s)`)
}
// Contract: 1–63 is the violation count; clamp so a count can never be read as a harness code.
if (violations > 63) console.log(`  (exit code clamped to 63; ${violations} violation(s) found)`)
process.exit(Math.min(violations, 63))
