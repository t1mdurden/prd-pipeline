#!/usr/bin/env node
// seed — MUST 2's exit code. The direction is drawn from outside the model, and a brief that
// contradicts its own seed is refused.
//
//   node .claude/skills/superdesign/scripts/seed.mjs --new [--register conservative|neutral|expressive] [--brand-hue <deg>]
//   node .claude/skills/superdesign/scripts/seed.mjs --derive <seed> [--register R] [--json]
//   node .claude/skills/superdesign/scripts/seed.mjs --check <DESIGN.md> [--against <previous DESIGN.md>]
//   node .claude/skills/superdesign/scripts/seed.mjs --variance <N> [--register R] [--json]
//
// EXIT-CODE CONTRACT — identical in every superdesign gate:
//   0        clean · 1–63 the violation count, clamped · 64–79 harness error (64 usage · 67 no target)
//
// WHY THIS IS A SCRIPT AND NOT A SENTENCE
// `references/brand-to-system.md` § "The seed axis (across-run variance)" already enumerates six
// axes and instructs: "Before each new project, roll one value on each axis and record it in the
// brief." It has always been an instruction to roll dice given to a thing that cannot roll dice.
//   · Chimala (Lenny's Newsletter, 1 Sep 2026) tested the naive form and reports it failing:
//     asking for "something totally unique … completely at random" yields output that is "different
//     from before, but still not varied … It's predicting tokens that sound random but aren't
//     actually random." His conclusion: "If we want variety, we have to bring it from outside."
//   · He reaches for Sakana AI's String Seed of Thought (arXiv 2510.21150, ICLR 2026): have the
//     model emit a random string and derive the stochastic choices from it by an explicit
//     hash-and-mod. Measured: NoveltyBench Distinct 6.19 with SSoT against 4.70 plain-prompted,
//     and JSD to a PRNG floor cut 70–98% across five models.
//   · But SSoT asks the MODEL to invent the random string, and that is the one part with published
//     counter-evidence: "Large Language Models Are Bad Dice Players" (arXiv 2601.05414, 11 frontier
//     models × 15 distributions) measures "a 7% median pass rate" on batch generation and "10 of 11
//     models failed all distributions tested" one-at-a-time. Its own conclusion is the design here:
//     models "should rely on external statistical tools for applications requiring probabilistic
//     guarantees."
// So: the entropy is `crypto.randomBytes` — the OS, not the model — and the derivation is
// arithmetic a second run can reproduce and a gate can re-check. That last part is the whole point.
// A seed printed into a brief that then does what it was always going to do is decoration; --check
// re-derives every axis from the seed and counts the axes the brief contradicts.
//
// WHY A REGISTER, AND NOT JUST "LEAST PROBABLE"
// The fastway post-mortem (evals/field-runs/2026-09-16-fastway.md) recorded the counter-case
// against MUST 2 as unproven-but-not-disproven: "For a mid-market Kazakh reefer operator the
// buyer-correct direction is the MOST probable one. Nothing lets a build declare that and still
// pass Phase 5." REGISTER is that declaration. It narrows the pool the seed draws from; it never
// removes the draw. Variance within a register, not novelty for its own sake.

import { randomBytes } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'

const argv = process.argv.slice(2)
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i === -1 ? d : argv[i + 1] }
const has = (n) => argv.includes(`--${n}`)
const asJson = has('json')

// ── The option pools. Every row is a row of brand-to-system.md's own tables; nothing is invented
// here. `sourced:false` marks the rows that table marks ° (derived) or ✱ (unverified) — they stay
// reachable, but only above the conservative register, and the derivation says so out loud.
const MOVEMENTS = [
  { name: 'Swiss / International Typographic', tier: 0, sourced: true },
  { name: 'Editorial / print', tier: 0, sourced: true },
  { name: 'Brutalism (web, Copeland)', tier: 0, sourced: true },
  { name: 'Japanese minimal', tier: 0, sourced: false },
  { name: 'Bauhaus', tier: 0, sourced: false },
  { name: 'Neo-brutalism', tier: 1, sourced: true },
  { name: 'Liquid Glass', tier: 1, sourced: true },
  { name: 'Neumorphism', tier: 1, sourced: true },
  { name: 'Glassmorphism', tier: 1, sourced: false },
  { name: 'Skeuomorphism (pre-2013)', tier: 1, sourced: false },
  { name: 'Cyberpunk / terminal / CRT', tier: 2, sourced: true },
  { name: 'Memphis', tier: 2, sourced: false },
  { name: 'Claymorphism', tier: 2, sourced: false },
  { name: 'Frutiger Aero', tier: 2, sourced: false },
  { name: 'Y2K / cybercore', tier: 2, sourced: false },
  { name: 'Maximalism', tier: 2, sourced: false },
  { name: 'Anti-design (Archizoom, 1966)', tier: 2, sourced: false },
]
const HUES = [25, 65, 95, 150, 190, 259, 300, 350]
const HUE_NAME = { 25: 'red', 65: 'amber', 95: 'yellow', 150: 'green', 190: 'teal', 259: 'blue', 300: 'violet', 350: 'pink' }
const RADII = [0, 2, 4, 6, 8, 10, 12, 16, 24]
const GRID = [0, 1, 2, 3]
const TEXTURE = [0, 1, 2, 3]
const TENSION = ['asymmetry', 'colour clash', 'scale jump', 'grid violation']

// SECTION_RHYTHM is the one axis brand-to-system.md does not have, and it is here because the
// fastway post-mortem measured the defect it prevents: "distinct section shapes after the hero: 1,
// repeated 8×" for the build the owner rejected, against 8 for the build he accepted. A model
// picking the safest option at every step picks the same section shape every time; drawing the
// rhythm up front is what stops it.
const SECTION_SHAPES = [
  'split two-column with media', 'full-bleed band', 'editorial prose column',
  'card grid, three up', 'numbered process row', 'comparison table',
  'ruled fact pairs', 'stat row', 'logo cloud', 'inline form panel',
  'FAQ accordion', 'map or route diagram', 'pull-quote', 'inverted dark panel',
  'stacked list rows',
]

const REGISTERS = { conservative: 0, neutral: 1, expressive: 2 }

// Where the movements table fixes an axis, the movement wins and the draw is narrowed to the
// values that row allows. Without this the dice can hand you "Swiss, radius 24, texture 3" — a
// tuple that contradicts the doctrine it was drawn from, and a gate that then forces the build to
// ship the contradiction. Only radius and texture are narrowed, because those are the two axes
// brand-to-system.md states outright per movement; narrowing more would be inventing rules.
const NARROW = {
  'Swiss / International Typographic': { RADIUS_BASE: [0], TEXTURE_LEVEL: [0] },
  'Bauhaus': { RADIUS_BASE: [0], TEXTURE_LEVEL: [0] },
  'Brutalism (web, Copeland)': { RADIUS_BASE: [0], TEXTURE_LEVEL: [0] },
  'Neo-brutalism': { RADIUS_BASE: [0, 4, 6, 8], TEXTURE_LEVEL: [0] },
  'Editorial / print': { RADIUS_BASE: [0, 2], TEXTURE_LEVEL: [1, 2] },
  'Japanese minimal': { RADIUS_BASE: [0, 2, 4], TEXTURE_LEVEL: [1, 2] },
  'Memphis': { TEXTURE_LEVEL: [1] },
  'Cyberpunk / terminal / CRT': { RADIUS_BASE: [0], TEXTURE_LEVEL: [2, 3] },
  'Liquid Glass': { RADIUS_BASE: [12, 16, 24] },
  'Glassmorphism': { RADIUS_BASE: [12, 16, 24] },
  'Neumorphism': { RADIUS_BASE: [12, 16, 24], TEXTURE_LEVEL: [0] },
  'Claymorphism': { RADIUS_BASE: [24] },
  'Skeuomorphism (pre-2013)': { TEXTURE_LEVEL: [2, 3] },
}

// ── The derivation. Rolling hash, the second of the two algorithms SSoT reports models converging
// on: h = (h*31 + ascii) mod M. One salt per axis so the axes are independent draws, not one draw
// read six ways.
function rollingHash(str) {
  let h = 0
  for (let i = 0; i < str.length; i++) h = (Math.imul(h, 31) + str.charCodeAt(i)) >>> 0
  return h
}
const pick = (seed, salt, pool) => pool[rollingHash(`${salt}:${seed}`) % pool.length]

// A brand that already exists is a fact, and a fact beats the dice. Found on the first field run
// (2026-09-22): the conservative register drew ACCENT_HUE 300 — violet — for a Kazakh reefer
// operator whose own logo is blue and whose accepted build sits at hue 250. Shipping that would
// have been the draw overruling a measurement, and declaring the AS-01b violet exemption to let it
// through would have been abusing an exemption written for brands that really are violet.
// So: where the brand names a hue, the hue axis is not drawn. The other five still are. Same
// principle as NARROW — the dice pick among what is genuinely open.
function nearestHue(deg) {
  const d = ((Number(deg) % 360) + 360) % 360
  return HUES.reduce((best, h) => {
    const dist = (a, b) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b))
    return dist(h, d) < dist(best, d) ? h : best
  }, HUES[0])
}

function derive(seed, registerName, brandHue) {
  const tier = REGISTERS[registerName]
  if (tier === undefined) { console.error(`✗ unknown register "${registerName}" — one of ${Object.keys(REGISTERS).join(', ')}`); process.exit(64) }
  const pool = MOVEMENTS.filter((m) => m.tier <= tier)
  const movement = pick(seed, 'movement', pool)

  // The rhythm: a seeded shuffle of the shape pool, then the first N. Distinct by construction,
  // which is the property that matters — a rhythm cannot contain the same shape twice.
  const n = 5 + (rollingHash(`rhythm-len:${seed}`) % 4) // 5–8 sections after the hero
  const order = SECTION_SHAPES.map((s, i) => ({ s, k: rollingHash(`rhythm:${i}:${seed}`) }))
    .sort((a, b) => a.k - b.k).map((x) => x.s)

  const narrow = NARROW[movement.name] || {}
  const drawn = (salt, axis, pool) => pick(seed, salt, narrow[axis] || pool)

  return {
    SEED: seed,
    REGISTER: registerName,
    MOVEMENT: movement.name,
    MOVEMENT_SOURCED: movement.sourced,
    NARROWED: Object.keys(narrow),
    BRAND_HUE_FIXED: brandHue !== undefined && brandHue !== null && brandHue !== '',
    ACCENT_HUE: (brandHue !== undefined && brandHue !== null && brandHue !== '') ? nearestHue(brandHue) : pick(seed, 'hue', HUES),
    RADIUS_BASE: drawn('radius', 'RADIUS_BASE', RADII),
    GRID_DISCIPLINE: pick(seed, 'grid', GRID),
    TEXTURE_LEVEL: drawn('texture', 'TEXTURE_LEVEL', TEXTURE),
    TENSION_CAUSE: pick(seed, 'tension', TENSION),
    SECTION_RHYTHM: order.slice(0, n),
  }
}

const AXES = ['MOVEMENT', 'ACCENT_HUE', 'RADIUS_BASE', 'GRID_DISCIPLINE', 'TEXTURE_LEVEL', 'TENSION_CAUSE']

function block(d) {
  const lines = [
    `SEED: ${d.SEED}`,
    `SEED-REGISTER: ${d.REGISTER}`,
    'SEED-DERIVED:',
    `  MOVEMENT: ${d.MOVEMENT}`,
    `  ACCENT_HUE: ${d.ACCENT_HUE}${d.BRAND_HUE_FIXED ? '   # brand-fixed, not drawn' : ''}`,
    `  RADIUS_BASE: ${d.RADIUS_BASE}`,
    `  GRID_DISCIPLINE: ${d.GRID_DISCIPLINE}`,
    `  TEXTURE_LEVEL: ${d.TEXTURE_LEVEL}`,
    `  TENSION_CAUSE: ${d.TENSION_CAUSE}`,
    `  SECTION_RHYTHM: ${d.SECTION_RHYTHM.join(' · ')}`,
  ]
  return lines.join('\n')
}

// ── Parsing a brief back. Deliberately forgiving about whitespace and deliberately strict about
// the values: a gate that accepts a near-match cannot tell a brief that obeyed its seed from one
// that wrote a plausible line.
function parseBrief(path) {
  if (!existsSync(path)) { console.error(`✗ no such brief: ${path}`); process.exit(67) }
  const txt = readFileSync(path, 'utf8')
  const one = (re) => { const m = re.exec(txt); return m ? m[1].trim() : null }
  return {
    seed: one(/^\s*SEED:\s*([0-9a-fA-F]+)\s*$/m),
    register: one(/^\s*SEED-REGISTER:\s*(\S+)\s*$/m),
    brandHue: one(/^\s*SEED-BRAND-HUE:\s*(\d+(?:\.\d+)?)\s*$/m),
    hasDerived: /^\s*SEED-DERIVED:\s*$/m.test(txt),
    declared: {
      MOVEMENT: one(/^\s*MOVEMENT:\s*(.+)$/m),
      ACCENT_HUE: one(/^\s*ACCENT_HUE:\s*(\S+)/m),
      RADIUS_BASE: one(/^\s*RADIUS_BASE:\s*(\S+)/m),
      GRID_DISCIPLINE: one(/^\s*GRID_DISCIPLINE:\s*(\S+)/m),
      TEXTURE_LEVEL: one(/^\s*TEXTURE_LEVEL:\s*(\S+)/m),
      TENSION_CAUSE: one(/^\s*TENSION_CAUSE:\s*(.+)$/m),
    },
  }
}

// ── Modes
if (has('new')) {
  const reg = arg('register', 'neutral')
  const seed = randomBytes(32).toString('hex')
  const d = derive(seed, reg, arg('brand-hue'))
  if (asJson) { console.log(JSON.stringify(d, null, 2)); process.exit(0) }
  console.log('# paste this into DESIGN.md, then design WITHIN it — the seed is the constraint, not a note\n')
  console.log(block(d))
  if (!d.MOVEMENT_SOURCED) console.log(`\n# note: brand-to-system.md marks "${d.MOVEMENT}" derived or unverified — ship it as your own invention, never as canon.`)
  if (d.NARROWED.length) console.log(`# note: the movement narrowed ${d.NARROWED.join(' and ')} to the values its own table row allows.`)
  console.log('\n# re-derive at any time:  seed.mjs --derive ' + seed + ' --register ' + reg)
  process.exit(0)
}

if (has('derive')) {
  const seed = arg('derive')
  if (!seed || !/^[0-9a-fA-F]{8,}$/.test(seed)) { console.error('usage: seed.mjs --derive <hex seed> [--register R]'); process.exit(64) }
  const d = derive(seed, arg('register', 'neutral'), arg('brand-hue'))
  console.log(asJson ? JSON.stringify(d, null, 2) : block(d))
  process.exit(0)
}

if (has('variance')) {
  const n = Number(arg('variance', '32'))
  const reg = arg('register', 'neutral')
  if (!Number.isFinite(n) || n < 2) { console.error('usage: seed.mjs --variance <N>'); process.exit(64) }
  const seen = {}
  for (const a of [...AXES, 'RHYTHM_FIRST']) seen[a] = new Set()
  for (let i = 0; i < n; i++) {
    const d = derive(randomBytes(32).toString('hex'), reg, arg('brand-hue'))
    for (const a of AXES) seen[a].add(String(d[a]))
    seen.RHYTHM_FIRST.add(d.SECTION_RHYTHM[0])
  }
  const distinct = Object.fromEntries(Object.entries(seen).map(([k, v]) => [k, v.size]))
  if (asJson) { console.log(JSON.stringify({ draws: n, register: reg, distinct }, null, 2)); process.exit(0) }
  console.log(`${n} draws, register ${reg}`)
  for (const [k, v] of Object.entries(distinct)) console.log(`  ${k.padEnd(16)} ${v} distinct`)
  process.exit(0)
}

if (has('check')) {
  const path = arg('check')
  if (!path) { console.error('usage: seed.mjs --check <DESIGN.md> [--against <previous DESIGN.md>]'); process.exit(64) }
  const b = parseBrief(path)
  const problems = []

  if (!b.seed) {
    console.log('✗ no SEED: line in the brief.')
    console.log('  MUST 2 asks for the least-probable direction that still clears the brief, and a model')
    console.log('  cannot draw one — it can only predict the likeliest next token. Run:')
    console.log('    node .claude/skills/superdesign/scripts/seed.mjs --new --register <conservative|neutral|expressive>')
    process.exit(1)
  }
  if (b.seed.length < 32) {
    console.log(`✗ SEED is ${b.seed.length} hex chars — under the 32-char floor.`)
    console.log('  A short seed is a seed someone typed. The point is that nobody chose it.')
    process.exit(1)
  }

  const reg = b.register || 'neutral'
  if (!(reg in REGISTERS)) { console.log(`✗ SEED-REGISTER: ${reg} — not one of ${Object.keys(REGISTERS).join(', ')}`); process.exit(1) }
  const d = derive(b.seed, reg, b.brandHue)

  if (!b.hasDerived) {
    console.log('✗ the brief carries a SEED: but no SEED-DERIVED: block, so nothing can be checked against it.')
    console.log('  A seed nobody derived from is decoration. Paste the block:')
    console.log(block(d).split('\n').map((l) => '    ' + l).join('\n'))
    process.exit(1)
  }

  for (const axis of AXES) {
    const want = String(d[axis])
    const got = b.declared[axis]
    if (got === null) { problems.push(`${axis} is missing from SEED-DERIVED — the seed says ${want}`); continue }
    if (got !== want) problems.push(`${axis}: the brief says "${got}", the seed derives "${want}"`)
  }

  const against = arg('against')
  if (against) {
    const p = parseBrief(against)
    if (p.seed) {
      const prev = derive(p.seed, p.register || 'neutral', p.brandHue)
      if (prev.MOVEMENT === d.MOVEMENT && prev.ACCENT_HUE === d.ACCENT_HUE && prev.RADIUS_BASE === d.RADIUS_BASE) {
        problems.push(`the (MOVEMENT, ACCENT_HUE, RADIUS_BASE) tuple repeats the previous project: ${d.MOVEMENT} / ${d.ACCENT_HUE} / ${d.RADIUS_BASE}. brand-to-system.md: "never ship the same tuple twice in a row." Draw again.`)
      }
    }
  }

  if (problems.length === 0) {
    console.log(`✓ the brief re-derives from its own seed (${b.seed.slice(0, 12)}…, register ${reg})`)
    console.log(`  ${d.MOVEMENT} · hue ${d.ACCENT_HUE} ${HUE_NAME[d.ACCENT_HUE] || ''} · radius ${d.RADIUS_BASE} · grid ${d.GRID_DISCIPLINE} · texture ${d.TEXTURE_LEVEL} · tension ${d.TENSION_CAUSE}`)
    console.log(`  rhythm: ${d.SECTION_RHYTHM.join(' · ')}`)
    process.exit(0)
  }
  console.log(`✗ ${problems.length} ${problems.length === 1 ? 'axis of the brief does' : 'axes of the brief do'} not follow from its seed:`)
  for (const p of problems) console.log(`  · ${p}`)
  console.log('\n  A brief that carries a seed and then chooses freely has the worst of both: the')
  console.log('  appearance of an external draw and the statistics of the model\'s own prior.')
  process.exit(Math.min(problems.length, 63))
}

console.error('usage: seed.mjs --new | --derive <seed> | --check <DESIGN.md> | --variance <N>   [--register conservative|neutral|expressive] [--brand-hue <deg>] [--json]')
process.exit(64)
