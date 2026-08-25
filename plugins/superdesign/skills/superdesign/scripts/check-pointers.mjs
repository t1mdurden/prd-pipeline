#!/usr/bin/env node
// check-pointers — every path and every in-file anchor the skill mentions must resolve.
//
// A skill is a graph of pointers. One dead edge and the model either opens nothing or
// invents the contents; this repo has already shipped one dead `examples/` pointer and
// one comment claiming a grep that did not exist. Cheap to check, so check it.
//
//   node .claude/skills/superdesign/scripts/check-pointers.mjs      # skill + scripts + evals
//   node .claude/skills/superdesign/scripts/check-pointers.mjs <dir…>
//
// EXIT-CODE CONTRACT — identical in every superdesign gate (ARCHITECTURE.md §2):
//   0        clean
//   1–63     the number of violations. A count above 63 is clamped to 63 and the line says so.
//   64–79    harness error — 64 usage · 65 missing dep · 66 navigation failed · 67 no target

import { readFileSync, existsSync, statSync } from 'node:fs'
import { readdirSync } from 'node:fs'
import { join, dirname, resolve, extname } from 'node:path'

// The script now lives INSIDE the skill package, so `..` is the skill root, not the repo root.
// Walk up to the nearest directory holding a `.git` and use that; fall back to the skill root so
// the script still works where the package is deployed standalone (the plugin checkout).
const SKILL_ROOT = resolve(new URL('../', import.meta.url).pathname)
// A `.git` alone is not enough: the plugin checkout lives inside ANOTHER repo (prd-pipeline), and
// walking up to that one made the exit code depend on where the package was deployed — 0 from the
// source repo, 9 from the plugin, for byte-identical files. The owning repo is the one that
// actually holds this skill at `.claude/skills/superdesign`; anything else is a host, and inside a
// host the package must be judged as self-contained.
function repoRootFrom(start) {
  let d = start
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(d, '.git')) && existsSync(join(d, '.claude', 'skills', 'superdesign'))) return d
    const up = dirname(d)
    if (up === d) break
    d = up
  }
  return start
}
const ROOT = repoRootFrom(SKILL_ROOT)
// Default roots are ABSOLUTE, so they resolve in both layouts: this repo (skill under
// `.claude/skills/`, plus the repo-only `scripts/` and `evals/`) and the deployed plugin, where
// the package stands alone and the other two simply do not exist. `files` filters by existence.
const EXPLICIT_ROOTS = process.argv.slice(2).length > 0
const ROOTS = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [SKILL_ROOT, join(ROOT, 'scripts'), join(ROOT, 'evals')]

// Transient workspace: generated render output and in-flight analysis notes. These are written
// FROM the repo root but quote paths relative to the SKILL root (`references/tokens.md`), so every
// one reads as dead and buries the real findings. They are deleted when the work they belong to
// lands; a pointer in them is a note to a human, never a shipped instruction.
const WORKSPACE = new Set(['render-tmp', 'render-out', 'render-selftest', 'render-discovery', 'redesign'])

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.git')) continue
    // Skip symlinks: the repo-root `scripts/` compatibility links point back into this package,
    // and following them reports every pointer in those seven files twice.
    if (e.isSymbolicLink()) continue
    if (e.isDirectory() && WORKSPACE.has(e.name)) continue
    const p = join(dir, e.name)
    e.isDirectory() ? walk(p, out) : out.push(p)
  }
  return out
}

const files = ROOTS.flatMap((r) => {
  const abs = resolve(ROOT, r)
  // A DEFAULT root that is absent is normal — the deployed package has no sibling `evals/`. A root
  // the caller typed and that does not exist is a typo, and returning "all clear" for it turns a
  // mistyped flag into a passing gate. That is the same class of lie as a child that never ran.
  if (!existsSync(abs)) {
    if (EXPLICIT_ROOTS) {
      console.error(`✗ check-pointers: no such path to scan — ${r}`)
      process.exit(64) // 64 = usage
    }
    return []
  }
  return statSync(abs).isDirectory() ? walk(abs) : [abs]
}).filter((f) => ['.md', '.mjs', '.js', '.sh', '.css'].includes(extname(f)))

// Only count a path when it is written AS a pointer — inside backticks or as a
// markdown link target. Free prose and regex fragments produce path-shaped noise
// (`src/`, `s/`, `tokens.md/theme.css`) that would drown the real findings.
const BACKTICKED = /`([^`\n]+)`/g
const MDLINK = /\]\(([^)#\s]+)\)/g
const KNOWN_EXT = /\.(md|mjs|js|ts|tsx|css|sh|json)$/
const DOMAINISH = /^[\w-]+(\.[\w-]+)+\//   // vercel.com/design.md — a URL missing its scheme
// Paths that live in the CONSUMER's project, not in this repo. A cookbook recipe saying
// "put this in `app/globals.css`" is a correct instruction, not a dead pointer. `ref/` and
// `design_iterations/` are the same class: the router names them as the place a phase WRITES
// its measurement and its three forks, in the target project, so they exist only after a run.
const CONSUMER = /^(app|src|components|lib|styles|public|pages|hooks|ref|design_iterations)\//

function pointerCandidates(body, isCode) {
  // Strip fenced code blocks: they hold regexes, shell fragments and example paths
  // that are illustrations, not references.
  const prose = body.replace(/```[\s\S]*?```/g, '')
  const src = isCode
    ? prose.split('\n').filter((l) => !/^\s*(\/\/|#)/.test(l)).join('\n')
    : prose
  const out = new Set()
  for (const m of src.matchAll(BACKTICKED)) out.add(m[1])
  for (const m of src.matchAll(MDLINK)) out.add(m[1])
  return [...out]
}

// Slug a heading the way GitHub does. The one non-obvious rule: whitespace runs are
// NOT collapsed. Dropping a `—`, `&`, `/` or `+` from between two words leaves two
// spaces, which become two hyphens — `## 1. Color primitives — the ramps` is
// `#1-color-primitives--the-ramps`. Collapsing them marks every such anchor dead.
const slug = (h) =>
  h.toLowerCase().trim()
    .replace(/[`*_~]/g, '')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/ /g, '-')

const anchorsOf = (body) =>
  new Set(body.split('\n').filter((l) => /^#{1,6}\s/.test(l)).map((l) => slug(l.replace(/^#+\s*/, ''))))

const dead = []
let checkedPaths = 0
let checkedAnchors = 0

for (const f of files) {
  const body = readFileSync(f, 'utf8')
  const here = dirname(f)
  const anchors = anchorsOf(body)

  // 1. In-file anchors: [text](#anchor). Same filter as paths — a `//` line in a
  //    script is documentation about the syntax, not a link that has to resolve.
  const isCodeFile = ['.mjs', '.js', '.sh', '.css'].includes(extname(f))
  const linkSrc = isCodeFile
    ? body.split('\n').filter((l) => !/^\s*(\/\/|#)/.test(l)).join('\n')
    : body
  for (const m of linkSrc.matchAll(/\]\(#([^)]+)\)/g)) {
    checkedAnchors++
    if (!anchors.has(m[1].toLowerCase())) {
      dead.push([f, `anchor #${m[1]} — no heading slugs to it`])
    }
  }

  // 2. Paths. Resolve against the file's dir, the skill root, and the repo root —
  //    a reference legitimately writes `references/tokens.md` from inside references/.
  const isCode = ['.mjs', '.js', '.sh', '.css'].includes(extname(f))
  for (const cand of pointerCandidates(body, isCode)) {
    const raw = cand.trim().replace(/[.,;:)\]]+$/, '')
    if (!raw.includes('/')) continue
    if (!KNOWN_EXT.test(raw)) continue          // only extension-bearing pointers
    if (/^(https?:|\/\/|\w+:)/.test(raw)) continue
    if (DOMAINISH.test(raw) || CONSUMER.test(raw)) continue
    if (/[ *?<>|$(){}]/.test(raw)) continue     // globs, shell expansions, prose
    if (raw.startsWith('node_modules/') || raw.startsWith('@')) continue
    const skillRoot = f.includes('/skills/superdesign/')
      ? f.slice(0, f.indexOf('/skills/superdesign/') + '/skills/superdesign'.length)
      : ROOT
    const candidates = [resolve(here, raw), resolve(skillRoot, raw), resolve(ROOT, raw)]
    checkedPaths++
    if (candidates.some(existsSync)) continue
    // An artifact the operator creates from a committed template is not a dead pointer:
    // evals/calibration.json ships as evals/calibration.template.json.
    if (candidates.some((c) => existsSync(c.replace(/\.([^.]+)$/, '.template.$1')))) continue
    dead.push([f, `path ${raw}`])
  }
}

for (const [f, what] of dead) console.log(`  [DEAD] ${f.replace(ROOT + '/', '')} → ${what}`)
console.log(
  dead.length === 0
    ? `\n✓ pointers: all resolve (${checkedPaths} paths, ${checkedAnchors} anchors, ${files.length} files)`
    : `\n✗ pointers: ${dead.length} dead of ${checkedPaths + checkedAnchors} checked`,
)
// Contract: 1–63 is the violation count; clamp above that so a count can never be read as a
// harness code.
if (dead.length > 63) console.log(`  (exit code clamped to 63; ${dead.length} dead pointers found)`)
process.exit(Math.min(dead.length, 63))
