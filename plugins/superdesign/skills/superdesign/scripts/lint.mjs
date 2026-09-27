#!/usr/bin/env node
// Source lint for the shapes the owner rejected. Reads .superdesign/base.json (written by base.mjs)
// and the SURFACE line of DESIGN.md. Like check.mjs it finds defects; it cannot find "cheap".
//
//   node lint.mjs [projectDir]
//
//   ui-fork     a components/ui file differs from what base.mjs installed, or appeared from nowhere
//   theme       a theme variable differs from the preset + brand base.mjs wrote (hand re-theming)
//   serif       app surface: a serif family anywhere (the newspaper desk, 2026-09-27)
//   radius-0    app surface: --radius 0
//   hand-built  app surface: no route renders an installed block — the page was written from scratch
//   raw-colour  Tailwind palette classes (bg-blue-500) in files you wrote or edited; use tokens/Badge
//
// Exit: 0 clean · 1–63 defects · 64 usage · 65 no base.json or no SURFACE line · 70 crashed.
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, dirname, resolve } from 'node:path'

process.on('uncaughtException', e => { console.error(`✗ lint.mjs crashed: ${e.stack || e}`); process.exit(70) })

const ROOT = resolve(process.argv[2] || '.')
const SNAP = join(ROOT, '.superdesign', 'base.json')
if (!existsSync(SNAP)) { console.error('✗ no .superdesign/base.json — nothing came through base.mjs, so every component here was written by hand'); process.exit(65) }
const snap = JSON.parse(readFileSync(SNAP, 'utf8'))
const designMd = ['DESIGN.md', 'design/DESIGN.md'].map(p => join(ROOT, p)).find(existsSync)
const surfaceLine = designMd && (readFileSync(designMd, 'utf8').match(/^SURFACE:\s*(.+)$/m) || [])[1]
if (!surfaceLine) { console.error('✗ no "SURFACE: app|marketing|component" line in DESIGN.md — the surface decides which rules apply'); process.exit(65) }
const surface = surfaceLine.trim().split(/\s/)[0].toLowerCase()   // "app (restyle)" is an app
const cfg = JSON.parse(readFileSync(join(ROOT, 'components.json'), 'utf8'))
const cssPath = join(ROOT, cfg.tailwind?.css || 'src/index.css')

const sha = b => createHash('sha256').update(b).digest('hex').slice(0, 16)
const files = []
;(function walk(d) {
  for (const n of readdirSync(d)) {
    if (n === 'node_modules' || n.startsWith('.') || n === 'dist' || n === 'build') continue
    const p = join(d, n); statSync(p).isDirectory() ? walk(p) : /\.(tsx?|jsx?|css|html)$/.test(n) && files.push(p)
  }
})(existsSync(join(ROOT, 'src')) ? join(ROOT, 'src') : ROOT)
if (existsSync(join(ROOT, 'index.html'))) files.push(join(ROOT, 'index.html'))
const rel = p => relative(ROOT, p)
const untouched = p => snap.files[rel(p)] === sha(readFileSync(p))

const defects = []
const fail = (rule, what) => defects.push(`${rule.padEnd(11)} ${what}`)

// ui-fork — look changes go in the theme or in your own component, never in the vendored primitives.
for (const p of files.filter(f => rel(f).includes('components/ui/'))) {
  if (!(rel(p) in snap.files)) fail('ui-fork', `${rel(p)} was not installed by base.mjs (hand-written primitive?)`)
  else if (!untouched(p)) fail('ui-fork', `${rel(p)} was edited after install`)
}

// theme — only base.mjs writes the theme, so any drift from the snapshot is a hand edit.
const now = {}
for (const [, sel, body] of readFileSync(cssPath, 'utf8').matchAll(/(:root|\.dark|@theme inline|@theme)\s*\{([^}]*)\}/g))
  for (const [, k, v] of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) now[`${sel} ${k}`] = v.trim()
for (const k of new Set([...Object.keys(now), ...Object.keys(snap.theme)]))
  if (now[k] !== snap.theme[k]) fail('theme', `${k}: ${snap.theme[k] ?? '(absent)'} → ${now[k] ?? '(removed)'} — use base.mjs apply/brand/font, not a hand edit`)

if (surface === 'app') {
  // Normalised so "source-serif-4", "Source Serif 4" and "Noto_Serif" all read as serif, and
  // "sans-serif" never does.
  const SERIF = /\b(serif|georgia|times|playfair|merriweather|lora|baskerville|cormorant|garamond|fraunces|crimson|spectral|newsreader|literata|bodoni|didot|caslon)\b/
  for (const p of files) {
    const t = readFileSync(p, 'utf8')
    for (const line of t.split('\n')) {
      const fontish = /font-family|--font-[\w-]*\s*:|@fontsource|fonts\.googleapis|fonts\.bunny|\bfont-serif\b/.test(line)
      const norm = line.toLowerCase().replace(/sans[-_\s]serif/g, '').replace(/[-_]/g, ' ')
      if (fontish && SERIF.test(norm)) { fail('serif', `${rel(p)}: ${line.trim().slice(0, 100)}`); break }
    }
    if (/--radius\s*:\s*0(px|rem)?\s*;/.test(t)) fail('radius-0', `${rel(p)}: --radius is 0 on an app surface`)
  }
  // hand-built — what actually RENDERS must reach an installed block. Vite: everything reachable by
  // import from src/main.tsx. Next: each app/**/page.tsx on its own. An installed page nobody imports
  // does not count — that is exactly how a hand-written App.tsx hides next to a recovered block page.
  const installedBlocks = new Set(Object.keys(snap.files).filter(p => !p.includes('components/ui/') && /\.(tsx|jsx)$/.test(p)))
  const resolveSpec = (from, spec) => {
    const base = spec.startsWith('@/') ? join(ROOT, 'src', spec.slice(2)) : spec.startsWith('.') ? join(dirname(from), spec) : null
    if (!base) return null
    return ['', '.tsx', '.ts', '.jsx', '.js', '/index.tsx', '/index.ts'].map(e => base + e).find(f => existsSync(f) && statSync(f).isFile()) || null
  }
  const reaches = entry => {
    const seen = new Set(), stack = [entry]
    while (stack.length) {
      const f = stack.pop(); if (seen.has(f)) continue; seen.add(f)
      if (installedBlocks.has(rel(f))) return true
      if (!/\.(tsx?|jsx?)$/.test(f)) continue
      for (const [, spec] of readFileSync(f, 'utf8').matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)) { const r = resolveSpec(f, spec); if (r) stack.push(r) }
    }
    return false
  }
  const viteEntry = ['src/main.tsx', 'src/main.jsx'].map(p => join(ROOT, p)).find(existsSync)
  const entries = viteEntry ? [viteEntry] : files.filter(f => /(^|\/)app\/(.*\/)?page\.(tsx|jsx)$/.test(rel(f)))
  if (!installedBlocks.size) fail('hand-built', 'no block was ever installed (base.mjs add dashboard-01, sidebar-07, …)')
  else for (const e of entries) if (!reaches(e)) fail('hand-built', `${rel(e)} renders no installed block — assemble from catalog.mjs search results, do not write the layout by hand`)
  if (!entries.length) fail('hand-built', 'no entry found (src/main.tsx or app/**/page.tsx) — cannot tell what renders')
}

const RAW = /\b(?:bg|text|border|ring|fill|stroke|from|via|to|outline|divide|decoration|shadow|accent|caret)-(?:(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}|white|black)\b/
for (const p of files.filter(f => /\.(tsx|jsx)$/.test(f) && !rel(f).includes('components/ui/'))) {
  if (untouched(p)) continue   // vendor block as installed: its classes are the vendor's choice
  const m = readFileSync(p, 'utf8').match(RAW)
  if (m) fail('raw-colour', `${rel(p)}: ${m[0]} — use a semantic token (bg-primary, text-muted-foreground) or a Badge variant`)
}

for (const d of defects) console.log(`FAIL ${d}`)
console.log(defects.length ? `${defects.length} defect(s) — surface: ${surface}` : `clean (surface: ${surface}, preset ${snap.preset}, blocks: ${snap.ids.join(' ') || 'none'})`)
process.exit(Math.min(defects.length, 63))
