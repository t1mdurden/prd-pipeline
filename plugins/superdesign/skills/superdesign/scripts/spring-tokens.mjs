#!/usr/bin/env node
// spring-tokens — compile springs to CSS `linear()` easings at build time.
//
// Why this exists: a real spring cannot be expressed as a cubic-bezier, and running one at
// runtime costs a JS animation library and a main-thread frame loop. Sampling the spring's
// normalised position and emitting `linear(p0, …, pN)` gets the exact physics onto the
// compositor with zero runtime JS.
//
// The closed form is Motion's "mode B" (visualDuration + bounce), read from its source and
// documented in design-research/reverse-engineering/motion-2-springs-easing-generators.md §4.
// Do NOT hand-tune the emitted numbers — regenerate.
//
//   node .claude/skills/superdesign/scripts/spring-tokens.mjs            # print the @theme block
//   node .claude/skills/superdesign/scripts/spring-tokens.mjs --json     # machine-readable
//   node .claude/skills/superdesign/scripts/spring-tokens.mjs --check F  # F's --ease/--dur-spring-*
//
// EXIT-CODE CONTRACT — identical in every superdesign gate (ARCHITECTURE.md §2):
//   0        clean
//   1–63     the number of violations. A count above 63 is clamped to 63 and the line says so.
//   64–79    harness error — 64 usage · 65 missing dep · 66 navigation failed · 67 no target
// Here a violation is one token that drifted from the generator.
//
// A `linear()` curve is normalised to its own settle duration: the emitted --ease-* and
// --dur-* tokens are a PAIR. Using one with a different duration distorts the physics.

import { readFileSync } from 'node:fs'

/** @param {{visualDuration:number, bounce:number, resolution:number}} opts */
function springLinear({ visualDuration, bounce, resolution = 20 }) {
  const root = (2 * Math.PI) / (visualDuration * 1.2)
  const stiffness = root * root
  const zeta = Math.min(1, Math.max(0.05, 1 - bounce))
  const mass = 1
  const w0 = Math.sqrt(stiffness / mass) / 1000 // rad per ms

  let pos, vel
  if (zeta < 1) {
    const wd = w0 * Math.sqrt(1 - zeta * zeta)
    const A = (zeta * w0) / wd // delta = 1, v0 = 0
    pos = (t) => 1 - Math.exp(-zeta * w0 * t) * (A * Math.sin(wd * t) + Math.cos(wd * t))
    vel = (t) =>
      Math.exp(-zeta * w0 * t) *
      (zeta * w0 * (A * Math.sin(wd * t) + Math.cos(wd * t)) - (A * wd * Math.cos(wd * t) - wd * Math.sin(wd * t)))
  } else {
    pos = (t) => 1 - Math.exp(-w0 * t) * (1 + w0 * t)
    vel = (t) => w0 * w0 * t * Math.exp(-w0 * t)
  }

  // Settle = BOTH conditions, never one: |target − pos| ≤ restDelta AND |velocity| ≤ restSpeed.
  // Position alone terminates at a zero-crossing while the spring is still moving fast.
  const restDelta = 0.005
  const restSpeed = 0.05 / 1000 // units per ms
  let dur = 0
  while (dur < 20000) {
    dur += 10
    if (Math.abs(1 - pos(dur)) <= restDelta && Math.abs(vel(dur)) <= restSpeed) break
  }

  const n = Math.max(Math.round(dur / resolution), 2)
  const pts = Array.from({ length: n }, (_, i) => Math.round(pos((i / (n - 1)) * dur) * 10000) / 10000)
  pts[0] = 0
  pts[pts.length - 1] = 1
  return { css: `linear(${pts.join(', ')})`, durationMs: Math.round(dur), overshoot: Math.max(...pts) }
}

// The ladder. bounce 0 = critical, no overshoot · 0.3 = default lively · 0.6 = playful.
// ≥1 rings and is never a UI default.
const LADDER = [
  { name: 'snappy', visualDuration: 0.3, bounce: 0, use: 'buttons, toggles, checkboxes — crisp, no overshoot' },
  { name: 'default', visualDuration: 0.3, bounce: 0.3, use: 'dialogs, popovers, dropdowns — lively' },
  { name: 'smooth', visualDuration: 0.5, bounce: 0.15, use: 'sheets, drawers — calm, barely overshoots' },
  { name: 'bouncy', visualDuration: 0.4, bounce: 0.6, use: 'drag-release, playful surfaces only' },
]

const rows = LADDER.map((s) => ({ ...s, ...springLinear(s) }))

const checkIdx = process.argv.indexOf('--check')

if (checkIdx !== -1) {
  // Drift gate. "Do not hand-edit" is only a rule if something re-derives the numbers.
  const file = process.argv[checkIdx + 1]
  if (!file) {
    console.error('usage: spring-tokens.mjs --check <css-file>')
    process.exit(64) // 64 = usage
  }
  let css
  try {
    css = readFileSync(file, 'utf8')
  } catch (e) {
    console.error(`✗ spring tokens: cannot read ${file} — ${e.message}`)
    process.exit(67) // 67 = no target
  }
  const norm = (s) => s.replace(/\s+/g, ' ').trim()
  const drift = []
  for (const r of rows) {
    for (const [prop, want] of [[`--ease-spring-${r.name}`, r.css], [`--dur-spring-${r.name}`, `${r.durationMs}ms`]]) {
      const m = css.match(new RegExp(`${prop}\\s*:([^;]*);`))
      if (!m) continue // absent is not drift — a theme may ship a subset of the ladder
      if (norm(m[1]) !== norm(want)) drift.push(`${prop}: shipped ${norm(m[1]).slice(0, 60)}… want ${norm(want).slice(0, 60)}…`)
    }
  }
  for (const d of drift) console.log(`  [DRIFT] ${d}`)
  console.log(drift.length === 0
    ? `✓ spring tokens match the generator (${file})`
    : `✗ ${drift.length} spring token(s) hand-edited — regenerate with \`node scripts/spring-tokens.mjs\``)
  // Contract: 1–63 is the violation count; clamp so a count can never be read as a harness code.
  if (drift.length > 63) console.log(`  (exit code clamped to 63; ${drift.length} drifted token(s) found)`)
  process.exit(Math.min(drift.length, 63))
} else if (process.argv.includes('--json')) {
  console.log(JSON.stringify(rows, null, 2))
} else {
  console.log('/* Generated by scripts/spring-tokens.mjs — do not hand-edit. Regenerate instead. */')
  console.log('@theme {')
  for (const r of rows) {
    console.log(`  /* ${r.use}${r.overshoot > 1 ? ` · peaks at ${r.overshoot}` : ''} */`)
    console.log(`  --ease-spring-${r.name}: ${r.css};`)
    console.log(`  --dur-spring-${r.name}: ${r.durationMs}ms;`)
  }
  console.log('}')
}
