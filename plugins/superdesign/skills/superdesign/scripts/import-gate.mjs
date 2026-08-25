#!/usr/bin/env node
// import-gate — a component pulled from a registry must clear this before its file lands.
//
// This is not defensive pessimism, it is the measured result. Ten components were pulled from
// three registries and rendered (evals/redesign/mine/COMPOSE-VERDICT.md §1):
//   · 4 of 10 built at all — every failure was a dependency the registry assumes and we do not carry
//   · 0 of 7 that could be gated passed `anti-slop-gate.sh`
//   · 15 of 15 retrieved source files shipped no `prefers-reduced-motion` / `motion-safe:` gate,
//     the one tell that fired universally and is not a false positive
//   · 13 of 14 of one vendor's flagship blocks violate a named bullet of our own cookbook §8
// So composing from a registry is not a shortcut past the anti-slop pass. The gate runs on
// retrieved code exactly as on authored code, and it runs AFTER retrieval, BEFORE composition.
//
//   node .claude/skills/superdesign/scripts/import-gate.mjs <file-or-dir>
//   node .claude/skills/superdesign/scripts/import-gate.mjs <file> --json
//
// EXIT-CODE CONTRACT — identical in every superdesign gate (ARCHITECTURE.md §2):
//   0        clean
//   1–63     the number of violations. A count above 63 is clamped to 63 and the line says so.
//   64–79    harness error — 64 usage · 65 missing dep · 66 navigation failed · 67 no target

import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs'
import { join, resolve, extname, relative } from 'node:path'

const SKILL_ROOT = resolve(new URL('../', import.meta.url).pathname)
const argv = process.argv.slice(2)
const asJson = argv.includes('--json')
const targets = argv.filter((a) => !a.startsWith('--'))

if (!targets.length) {
  console.error('usage: import-gate.mjs <file-or-dir> [--json]')
  console.error('  Runs on code pulled from a registry, before it is composed into the project.')
  process.exit(64)
}

// The harness's dependency surface. A registry component importing anything else does not build
// here, and a component that does not build is not a component we have. This is read from the
// example app rather than hardcoded so it cannot drift from what actually installs.
function harnessDeps() {
  const pkg = join(SKILL_ROOT, '..', '..', '..', 'examples', 'app-ui', 'package.json')
  if (!existsSync(pkg)) return null
  const p = JSON.parse(readFileSync(pkg, 'utf8'))
  return new Set([...Object.keys(p.dependencies || {}), ...Object.keys(p.devDependencies || {})])
}

// A bare import specifier's package name: `motion/react` → `motion`, `@radix-ui/x` → `@radix-ui/x`.
const pkgOf = (spec) => (spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0])

const CHECKS = [
  {
    id: 'IG-01',
    title: 'animates without a reduced-motion gate',
    failureMode:
      'A viewer who has asked their OS to reduce motion gets the full animation anyway. It fired on ' +
      '15 of 15 retrieved files across three independent registries, including a repo whose own docs ' +
      'have a section on prefers-reduced-motion and whose 8 examples all ignore it.',
    run(src) {
      const animates = /\b(motion|AnimatePresence|useAnimate|animate=|whileHover|whileInView|transition-|animate-)/.test(src)
      if (!animates) return []
      const gated = /prefers-reduced-motion|motion-safe:|motion-reduce:|useReducedMotion/.test(src)
      return gated ? [] : ['animates but never mentions reduced motion']
    },
  },
  {
    id: 'IG-02',
    title: 'imports a dependency the harness does not carry',
    failureMode:
      'The build fails, and it fails at composition time rather than at pull time. Six of ten pulled ' +
      'components died this way — motion/react and @tabler/icons-react, the second undeclared in its ' +
      "own registry entry's dependency list.",
    run(src, deps) {
      if (!deps) return []
      const out = []
      for (const m of src.matchAll(/^\s*import\s[^'"]*from\s*['"]([^'"]+)['"]/gm)) {
        const spec = m[1]
        if (spec.startsWith('.') || spec.startsWith('@/') || spec.startsWith('node:')) continue
        const name = pkgOf(spec)
        if (!deps.has(name)) out.push(`imports \`${name}\` (as \`${spec}\`), which the harness does not carry`)
      }
      return [...new Set(out)]
    },
  },
  {
    id: 'IG-03',
    title: 'clones repeated content without hiding the copies from assistive tech',
    failureMode:
      "A marquee or infinite-scroll strip duplicates its children to make the loop seamless. Unless the " +
      'copies are aria-hidden, a screen reader reads every testimonial twice. One registry component ' +
      'does the duplication with cloneNode in useEffect and hides nothing.',
    run(src) {
      const clones = /cloneNode|\[\.\.\.\w+,\s*\.\.\.\w+\]|duplicate|\.concat\(\s*\w+\s*\)/.test(src)
      const marquee = /marquee|infinite|scroller|ticker/i.test(src)
      if (!(clones && marquee)) return []
      return /aria-hidden/.test(src) ? [] : ['duplicates content for a loop with no aria-hidden on the copies']
    },
  },
  {
    id: 'IG-04',
    title: 'animates a property that forces layout every frame',
    failureMode:
      'width/height/top/left/margin animate on the main thread and force a reflow per frame. Fourteen ' +
      "of one registry's 117 fetchable items do it. `transform` and `opacity` are the two that do not.",
    run(src) {
      const out = []
      for (const m of src.matchAll(/transition-(?:all|\[?(width|height|top|left|right|bottom|margin|padding)\]?)/g)) {
        out.push(m[0] === 'transition-all' ? 'transition-all (animates every property, layout included)' : `transitions \`${m[1]}\``)
      }
      for (const m of src.matchAll(/animate=\{\{[^}]*\b(width|height|top|left|margin)\s*:/g)) {
        out.push(`animates \`${m[1]}\` in a motion prop`)
      }
      return [...new Set(out)]
    },
  },
  {
    id: 'IG-05',
    title: 'ships a raw colour instead of a token',
    failureMode:
      "A registry component carries its own palette. Dropped into a themed project it is the one element " +
      'that does not change with the theme, and it is invisible until dark mode.',
    run(src) {
      const out = []
      for (const m of src.matchAll(/(?:bg|text|border|from|to|via|ring|fill|stroke)-\[(#[0-9a-fA-F]{3,8}|rgb[^\]]*|hsl[^\]]*)\]/g)) {
        out.push(`hard-coded colour \`${m[1]}\``)
      }
      for (const m of src.matchAll(/\b(?:bg|text|border)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/g)) {
        out.push(`framework palette class \`${m[0]}\` instead of a semantic token`)
      }
      return [...new Set(out)].slice(0, 8)
    },
  },
  {
    id: 'IG-06',
    title: 'image with no intrinsic size',
    failureMode:
      'An <img> with no width/height reserves no space, so the page reflows when it loads. That is a ' +
      'CLS hit the design never sees in a screenshot, and one pulled card component does it.',
    run(src) {
      const out = []
      for (const m of src.matchAll(/<img\b[^>]*>/g)) {
        const tag = m[0]
        if (!/\bwidth\b/.test(tag) || !/\bheight\b/.test(tag)) out.push('an <img> with no width/height')
      }
      return [...new Set(out)]
    },
  },
]

function filesUnder(p) {
  const abs = resolve(p)
  if (!existsSync(abs)) {
    console.error(`✗ import-gate: no such path — ${p}`)
    process.exit(67) // 67 = no target
  }
  if (statSync(abs).isFile()) return [abs]
  const out = []
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue
      const f = join(d, e.name)
      e.isDirectory() ? walk(f) : ['.tsx', '.ts', '.jsx', '.js'].includes(extname(e.name)) && out.push(f)
    }
  }
  walk(abs)
  return out
}

const deps = harnessDeps()
const files = targets.flatMap(filesUnder)
if (!files.length) {
  console.error(`✗ import-gate: nothing to check under ${targets.join(', ')}`)
  process.exit(67)
}

const findings = []
for (const f of files) {
  const src = readFileSync(f, 'utf8')
  for (const c of CHECKS) {
    for (const what of c.run(src, deps)) findings.push({ id: c.id, file: f, what, check: c })
  }
}

if (asJson) {
  console.log(JSON.stringify({
    files: files.length,
    findings: findings.map((f) => ({ id: f.id, file: relative(process.cwd(), f.file), what: f.what, failureMode: f.check.failureMode })),
  }, null, 2))
} else {
  console.log(`import-gate: ${files.length} file(s)${deps ? '' : '  (harness package.json not found — IG-02 skipped)'}`)
  const byId = new Map()
  for (const f of findings) {
    if (!byId.has(f.id)) byId.set(f.id, { check: f.check, hits: [] })
    byId.get(f.id).hits.push(`${relative(process.cwd(), f.file)} — ${f.what}`)
  }
  for (const [id, { check, hits }] of byId) {
    console.log(`\n✗ BLOCKED [${id}]: ${check.title}`)
    for (const h of hits) console.log(`    ${h}`)
    console.log(`    why: ${check.failureMode}`)
  }
  console.log(findings.length
    ? `\n✗ import-gate: ${findings.length} blocker(s). Fix them in the pulled file, or author the component instead — ` +
      'on the two surfaces where a fair comparison existed, our own cookbook recipe beat the pulled one.'
    : '\n✓ import-gate: clean — this component may be composed in.')
}

if (findings.length > 63) console.error(`  (exit code clamped to 63; ${findings.length} blocker(s) found)`)
process.exit(Math.min(findings.length, 63))
