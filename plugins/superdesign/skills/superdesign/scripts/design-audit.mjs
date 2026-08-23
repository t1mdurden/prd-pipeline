#!/usr/bin/env node
// design-audit — the rendered half of the Phase-5 gate. What a grep cannot see and a VLM
// cannot be trusted to see: geometry. Everything here is measured in the page, never judged.
//
//   node scripts/design-audit.mjs --url http://localhost:5173/dashboard
//   node scripts/design-audit.mjs --url <url> --theme light,dark --json
//
// Exit code = number of failed caps + serious/critical axe violations (0 = pass).
//
// Dependencies are NOT vendored: this repo ships no package.json. Each is borrowed — in order —
// from this script's directory, the cwd, then `silver`'s own install, so with silver present only
// axe has to be added. Otherwise, in the project under audit:
//   npm i -D @axe-core/playwright                              # silver supplies playwright
//   npm i -D playwright @axe-core/playwright && npx playwright install chromium   # without silver
//
// THE CAPS ARE CALIBRATED. Corpus, 2026-07-29, both themes, 1440×900:
//   good  — the five gate-clean examples in `examples/` (four static landings + the React app-ui)
//   slop  — `scripts/fixtures/slopped-geometry.html`, the negative control, deliberately undisciplined
//   wild  — linear.app · stripe.com · ui.shadcn.com, as a reality check on what real products score
// A metric earns a cap only where good and slop actually separate, and the cap sits in the gap.
// Four did; four did not and are reported instead (see REPORT below). Re-run the sweep before
// moving any number: `scripts/fixtures/slopped-geometry.html` must keep failing every cap.
//
// Contrast is WCAG 2 via axe. Do NOT substitute APCA: APCA left the WCAG 3 draft in July 2023.
//
// Alignment note, since it used to be a cap: Design2Code's fitted model puts Position at 0.7504,
// the highest weight of any automatable metric on human preference, and per BlindTest a VLM never
// sees it — so near-miss edges are worth reporting. They are not worth gating: measured, the slop
// fixture scores 2 and the good pages score up to 11, because the count tracks how many boxes a
// page has. The offending edge PAIRS are printed; act on those.

import { createRequire } from 'node:module'
import { existsSync, realpathSync } from 'node:fs'
import { delimiter, dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

const SCALE = [0, 1, 2, 4, 6, 8, 10, 12, 16, 24, 32, 48, 64, 96] // the declared ramp + the two nudge steps
const VIEWPORT = { width: 1440, height: 900 }

// CALIBRATED CAPS — set from the corpus in the header, not from taste. Each one is a metric where
// the known-good pages and the slop fixture actually separate, with the cap placed in the gap.
const CAP = {
  offGrid: 0, //  good 0 · fixture 14 · linear 8 · stripe 8. Doctrinal AND measured; no headroom needed.
  off4: 8, //     good 2–3 · shadcn 4 · stripe 14 · fixture 17 · linear 17. The true gap is 4→14.
  shadows: 3, //  good 0–3 · shadcn 3 · stripe 4 · fixture 6 · linear 12. Matches the sourced ≤3 rule.
}

// MEASURED NOT TO SEPARATE — reported every run, never capped. Each was tried as a cap and each
// scored the slop fixture at or below the known-good pages, so a threshold on it would fail real
// work and pass the fixture. Read the values, not a verdict. Do not re-add a cap here without
// re-running the corpus sweep and showing a gap.
const REPORT = {
  nearMiss: 'fixture 2 vs good 0–11 — counts how many block edges happen to land 1–3px apart, which tracks element count, not discipline. The PAIRS are actionable; the count is not.',
  fontSizes: 'fixture 12 sits inside good 7–13 — computed sizes include inherited and rem-derived values, a larger population than the CSS-declared count anti-slop.md caps at 8.',
  spacingSteps: 'fixture 18 vs good 9–17 — one step apart. anti-slop.md § Handoff gates caps the CSS-declared count at 10; this is the rendered one.',
  radii: 'fixture 8 vs good 1–7 — one step apart. tokens.md wants one --radius derived, not a step count.',
  layoutAnim: "shadcn's own Sidebar ships transition-[left,right,width] and transition-[width,height,padding], so the React reference scores 7 by using it as published. A sidebar collapse has to animate width. `all` IS capped, separately.",
}

const argv = process.argv.slice(2)
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`)
  return i === -1 ? fallback : argv[i + 1]
}
const url = arg('url')
const themes = String(arg('theme', 'light,dark')).split(',').map((s) => s.trim()).filter(Boolean)
const asJson = argv.includes('--json')

if (!url) {
  console.error('usage: node scripts/design-audit.mjs --url <url> [--theme light,dark] [--json]')
  process.exit(2)
}

/**
 * Find a dependency without asking anyone to install it. ESM resolves a bare import against THIS
 * file's directory, not the cwd, so the documented "run it from the project under audit" needs an
 * explicit createRequire. `silver` is the third place because silver IS a local headless
 * Playwright: if the machine can run silver it can already run this.
 */
function silverRoot() {
  const exts = process.platform === 'win32' ? ['.cmd', '.exe', ''] : ['']
  for (const dir of (process.env.PATH || '').split(delimiter)) {
    for (const ext of exts) {
      const bin = join(dir, `silver${ext}`)
      if (!existsSync(bin)) continue
      let p = dirname(realpathSync(bin))
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

let chromium, AxeBuilder
try {
  const pw = await need('playwright')
  chromium = pw.chromium ?? pw.default?.chromium // a cwd-resolved CJS build lands under `default`
  AxeBuilder = (await need('@axe-core/playwright')).default
  if (!chromium || !AxeBuilder) throw new Error('resolved, but the expected export is missing')
} catch (e) {
  console.error('✗ design-audit needs playwright + @axe-core/playwright, which this repo does not vendor.')
  console.error('  With silver installed:  npm i -D @axe-core/playwright')
  console.error('  Without:                npm i -D playwright @axe-core/playwright && npx playwright install chromium')
  console.error(`  (tried this script's dir, ${process.cwd()}, and silver: ${e.message.split('\n')[0]})`)
  process.exit(4)
}

// Runs inside the page. Geometry only — nothing here is an opinion.
//
// Every count below is of DISTINCT VALUES, never of elements. An element count is a function of
// page size, not of design discipline: one off-grid padding on a card that repeats forty times is
// one defect and one fix, and reporting it as 40 makes the number unreadable and the cap
// unsettable. It is also what the sourced budgets in `anti-slop.md` § Handoff gates count.
function measure(scale) {
  const px = (v) => Math.round(parseFloat(v) || 0)
  const els = [...document.querySelectorAll('body *')].filter((e) => e.getClientRects().length)
  const cs = els.map((e) => ({ el: e, r: e.getBoundingClientRect(), s: getComputedStyle(e) }))

  const spacing = [...new Set(cs.flatMap(({ s }) =>
    [s.paddingTop, s.paddingRight, s.paddingBottom, s.paddingLeft, s.gap, s.rowGap, s.columnGap]
      .map(px).filter((n) => n > 0)))].sort((a, b) => a - b)

  // Alignment is a property of BOXES, not of text. Inline spans, icons and nested wrappers sit 1–3px
  // off their parent as a matter of text metrics and sub-pixel layout, and including them buries the
  // handful of real misalignments under a hundred non-findings. So: block-ish elements at least
  // 64px wide, deduped to distinct edges, then count how many distinct edges have a neighbour
  // 1–3px away. Exactly equal edges are alignment and never count.
  const edges = [...new Set(cs
    .filter(({ el, r }) => r.width >= 64 && getComputedStyle(el).display !== 'inline')
    .map(({ r }) => Math.round(r.left)))].sort((a, b) => a - b)
  const nearMissPairs = []
  for (let i = 1; i < edges.length; i++) {
    const d = edges[i] - edges[i - 1]
    if (d >= 1 && d <= 3) nearMissPairs.push(`${edges[i - 1]}↔${edges[i]}`)
  }

  // `transition: all` is the wildcard that sweeps layout properties in, so it is a finding, not an
  // exemption — the old rule had this exactly inverted. Colour is Paint, not Layout, and
  // `motion.md` explicitly endorses keeping "opacity / transform / color in sync", so it is not
  // flagged. What is flagged is what forces LAYOUT every frame (`motion.md` §4).
  const LAYOUT_PROPS = ['width', 'height', 'top', 'left', 'right', 'bottom', 'margin', 'margin-top',
    'margin-right', 'margin-bottom', 'margin-left', 'padding', 'padding-top', 'padding-right',
    'padding-bottom', 'padding-left', 'inset', 'flex', 'flex-basis', 'grid-template-columns',
    'grid-template-rows', 'font-size', 'line-height', 'border-width', 'max-width', 'max-height',
    'min-width', 'min-height']
  const layoutAnim = new Set()
  const wildcardAnim = new Set()
  for (const { el, s } of cs) {
    // `transition-property` is `all` by DEFAULT, so it must only be read where a transition
    // actually runs. Reading it on every element reports `all` for anything that merely has a
    // keyframe animation — which is every entrance-animated heading on a well-built page.
    if (!s.transitionDuration.split(',').some((d) => parseFloat(d) > 0)) continue
    for (const p of s.transitionProperty.split(',')) {
      const prop = p.trim()
      // `all` is separated out and capped at 0 because it is a different claim: a named layout
      // property is a decision someone made (a sidebar collapse must animate width), while `all`
      // is the absence of one, and it sweeps every layout property in behind your back.
      if (prop === 'all') wildcardAnim.add(el.tagName.toLowerCase())
      else if (LAYOUT_PROPS.includes(prop)) layoutAnim.add(`${el.tagName.toLowerCase()}:${prop}`)
    }
  }
  // Keyframe animations do not expose their property list through computed style at all — the
  // Web Animations API is the only way to see what a `@keyframes` block actually moves.
  for (const a of document.getAnimations()) {
    const tag = a.effect?.target?.tagName?.toLowerCase?.() ?? '?'
    for (const frame of a.effect?.getKeyframes?.() ?? [])
      for (const prop of Object.keys(frame)) {
        const kebab = prop.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)
        if (LAYOUT_PROPS.includes(kebab)) layoutAnim.add(`${tag}:@keyframes ${kebab}`)
      }
  }

  const noFocusRing = []
  for (const el of document.querySelectorAll('a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])')) {
    // Two kinds of element match that selector and yet cannot be focused, and counting them
    // reports a ring that is missing from somewhere nobody can stand. Skip them, and only
    // them — every element a keyboard can actually reach is still checked.
    //   1. no layout box: a `hidden` Radix TabsContent panel, a display:none menu item.
    //   2. roving tabindex: a TabsList / toolbar that hands focus straight to its active child,
    //      so after .focus() the element is not the one that ended up focused.
    if (!el.getClientRects().length) continue
    el.focus()
    if (document.activeElement !== el) continue
    const s = getComputedStyle(el)
    if (s.outlineStyle === 'none' && s.boxShadow === 'none') noFocusRing.push(el.outerHTML.slice(0, 120))
  }

  // Tailwind compiles its shadow utilities to a multi-layer stack whose ring/inset layers are
  // zero-alpha no-ops. Counting the raw string makes `shadow-sm` and `shadow-sm ring-0` two
  // different recipes and puts a transparent stack at the top of the census.
  const shadowRecipes = new Set()
  for (const { s } of cs) {
    if (!s.boxShadow || s.boxShadow === 'none') continue
    const live = s.boxShadow.split(/,(?![^(]*\))/).map((l) => l.trim())
      .filter((l) => !/rgba?\([^)]*[,/]\s*0(\.0+)?\s*\)/.test(l)).join(', ')
    if (live) shadowRecipes.add(live)
  }

  // The shorthand serialises "8px" and "8px 8px 0 0" as different strings, which counts one radius
  // token applied two ways as two steps. Count the distinct corner VALUES instead, with every
  // pill/circle collapsed to one entry — a pill is one decision however many elements wear it.
  const radiusSteps = new Set()
  for (const { r, s } of cs) {
    for (const v of [s.borderTopLeftRadius, s.borderTopRightRadius, s.borderBottomLeftRadius, s.borderBottomRightRadius]) {
      if (v.includes('%')) { radiusSteps.add('pill'); continue }
      const n = px(v)
      if (n <= 0) continue
      radiusSteps.add(n >= Math.round(Math.min(r.width, r.height) / 2) ? 'pill' : n)
    }
  }

  // Two spacing signals, because the doctrinal grid and the mandated framework disagree and
  // pretending otherwise makes the gate wrong rather than strict.
  //
  //   offGrid (HARD) — values not divisible by 2. NO Tailwind step produces one, full or half, so an
  //     odd value is unambiguously hand-typed drift. This is what actually separates the classes.
  //   off4 (SOFT, reported not capped) — values off the 4px grid non-negotiable #6 names. Tailwind's
  //     `.5` steps (`px-3.5` = 14px, `py-2.5` = 10px) land here legitimately, and the skill's own
  //     gate-clean examples all use them, so capping this would fail the reference implementations.
  // A colour fingerprint, for the theme-parity check. A dark mode changes COLOUR and not
  // geometry, so a signature built from sizes can never see one — which is how the first version
  // of that check passed a page that had no dark mode at all.
  const paint = [getComputedStyle(document.body).backgroundColor,
    ...[...new Set(cs.map(({ s }) => s.color))].slice(0, 6),
    ...[...new Set(cs.map(({ s }) => s.backgroundColor))].slice(0, 6)]

  const offGrid = spacing.filter((n) => n % 2 !== 0)
  return {
    paint,
    offGrid: offGrid.length,
    offGridValues: offGrid,
    off4: spacing.filter((n) => n % 4 !== 0).length,
    off4Values: spacing.filter((n) => n % 4 !== 0),
    spacingSteps: spacing.length,
    spacingValues: spacing,
    offRamp: spacing.filter((n) => !scale.includes(n)).length,
    nearMiss: nearMissPairs.length,
    nearMissPairs,
    fontSizes: new Set(cs.map(({ s }) => s.fontSize)).size,
    fontSizeValues: [...new Set(cs.map(({ s }) => px(s.fontSize)))].sort((a, b) => a - b),
    shadows: shadowRecipes.size,
    radii: radiusSteps.size,
    radiusValues: [...radiusSteps],
    layoutAnim: [...layoutAnim],
    wildcardAnim: [...wildcardAnim],
    noFocusRing,
  }
}

const browser = await chromium.launch()
const report = { url, viewport: VIEWPORT, themes: {} }
let failures = 0

for (const theme of themes) {
  // An EXPLICIT context, not `browser.newPage()`. axe's `finishRun` opens a second page off
  // `page.context()` to assemble partial results, and on the implicit context `newPage()` creates
  // it fails with the unhelpful "Please use browser.newContext()" — which is exactly what this
  // says to do. Verified: identical page, implicit context throws, explicit context returns.
  // `reducedMotion` MUST be explicit. Left to the host, a machine that prefers reduced motion
  // activates the page's own `@media (prefers-reduced-motion: reduce)` reset — which is a
  // `* { transition-duration: .01ms }` rule whose computed `transition-property` is `all` — and the
  // animation census then reports the reset instead of the design, on every element, every run.
  const context = await browser.newContext({ viewport: VIEWPORT, reducedMotion: 'no-preference' })
  const page = await context.newPage()
  await page.emulateMedia({ colorScheme: theme })
  // A React app usually OWNS its theme: it reads a stored preference on mount and re-applies its
  // own `.dark` class, so emulating `prefers-color-scheme` alone leaves it in light and the parity
  // check below reports a missing dark mode that is right there. Seeding the conventional key
  // drives it. Touch NOTHING but storage here — an init script runs before the document exists, so
  // a stray `document.documentElement` throws and silently kills the whole script.
  await page.addInitScript((t) => {
    try { localStorage.setItem('theme', t) } catch { /* storage blocked by policy */ }
  }, theme)
  // networkidle is the right target and the wrong guarantee: analytics beacons and polling keep a
  // real marketing site permanently busy. Degrade rather than crash, and say which one was used.
  let waited = 'networkidle'
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 })
  } catch {
    waited = 'load + 3s'
    await page.goto(url, { waitUntil: 'load', timeout: 30_000 })
    await page.waitForTimeout(3000)
  }

  const m = await page.evaluate(measure, SCALE)
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()
  const serious = axe.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')

  const DETAIL = { offGrid: 'offGridValues', off4: 'off4Values', nearMiss: 'nearMissPairs', radii: 'radiusValues', fontSizes: 'fontSizeValues', spacingSteps: 'spacingValues' }
  const lines = []
  for (const [k, cap] of Object.entries(CAP)) {
    const ok = m[k] <= cap
    if (!ok) failures++
    const detail = !ok && DETAIL[k] ? `  → ${JSON.stringify(m[DETAIL[k]]).slice(0, 90)}` : ''
    lines.push([ok ? 'PASS' : 'FAIL', k, `${m[k]} (cap ${cap})${detail}`])
  }
  if (m.wildcardAnim.length) { failures++; lines.push(['FAIL', 'transition: all', `${m.wildcardAnim.length} element type(s): ${m.wildcardAnim.slice(0, 8).join(', ')} — name the properties`]) }
  else lines.push(['PASS', 'transition: all', 'no wildcard transitions'])
  if (m.noFocusRing.length) { failures++; lines.push(['FAIL', 'focus ring', `${m.noFocusRing.length} focusable elements render no outline and no box-shadow`]) }
  else lines.push(['PASS', 'focus ring', 'every focusable element renders a ring'])
  if (serious.length) { failures += serious.length; lines.push(['FAIL', 'axe wcag2.2 aa', serious.map((v) => `${v.id}×${v.nodes.length}`).join(', ')]) }
  else lines.push(['PASS', 'axe wcag2.2 aa', `0 serious/critical (${axe.violations.length} minor)`])

  // Uncapped metrics print every run. A number nobody gates on is still the number that tells you
  // where the design is drifting, and burying it because it could not be turned into a threshold
  // would throw away the measurement along with the verdict.
  const reported = Object.keys(REPORT).map((k) => [k, m[k]?.length ?? m[k]])

  report.themes[theme] = { measurements: m, reported: Object.fromEntries(reported), axe: serious.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length })), lines }

  report.themes[theme].waitedFor = waited
  if (!asJson) {
    console.log(`\ndesign-audit — ${theme} @ ${VIEWPORT.width}×${VIEWPORT.height} · ${url} · waited for ${waited}`)
    for (const [tag, label, detail] of lines) console.log(`  [${tag}] ${String(label).padEnd(18)} ${detail}`)
    console.log(`  ── uncapped (measured not to separate good from slop — read them, don't gate on them)`)
    for (const [k, v] of reported) console.log(`     ${String(k).padEnd(15)} ${v}`)
  }
  await context.close()
}

await browser.close()

// Running both themes and passing both is not the same as HAVING both. A page with no dark mode
// renders identically under either `prefers-color-scheme` and sails through twice — which is
// exactly how a missing dark mode survives a gate that was run in both themes. SKILL.md's Phase-1
// gate and quality-bar item 2 both require light AND dark to be real, so compare them.
if (themes.length > 1) {
  const sig = (t) => {
    const m = report.themes[t]?.measurements
    return m && JSON.stringify(m.paint)
  }
  const [a, b] = themes
  if (sig(a) && sig(a) === sig(b)) {
    failures++
    const line = ['FAIL', 'light ≠ dark', `${a} and ${b} paint identically — SKILL.md's Phase-1 gate requires both to exist. An app that stores its preference under a key other than \`theme\` will also land here; check that before assuming the dark mode is missing.`]
    report.themeParity = { identical: true }
    if (!asJson) console.log(`\n  [${line[0]}] ${line[1].padEnd(18)} ${line[2]}`)
  } else if (!asJson) {
    console.log(`\n  [PASS] ${'light ≠ dark'.padEnd(18)} the two themes are separately authored`)
  }
}

// axe's WCAG tags do NOT include target-size (off by default) or the landmark/heading rules
// (best-practice). Ask for those explicitly — this gate does not cover them:
//   npx --yes @axe-core/cli "$URL" --rules target-size --exit
//   npx --yes @axe-core/cli "$URL" --tags best-practice --exit
if (asJson) console.log(JSON.stringify({ ...report, failures }, null, 2))
else console.log(failures === 0 ? '\n✓ design-audit: ALL CHECKS PASS' : `\n✗ design-audit: ${failures} failed check(s)`)

process.exit(failures)
