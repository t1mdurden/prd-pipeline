#!/usr/bin/env node
// The only way components and themes enter a project. Every call records what it installed in
// .superdesign/base.json, so lint.mjs can tell a page assembled from blocks from one written by hand,
// and a stock component from one restyled in place.
//
//   node base.mjs add <ids...>        shadcn add, then recover any registry:page the CLI skipped
//                                     (it skips them outside Next — dashboard-01's page.tsx), snapshot
//   node base.mjs apply <preset>      shadcn apply <preset>, re-apply the brand, re-snapshot
//   node base.mjs brand <oklch>       write the brand hue into the keys a brand may own, snapshot
//   node base.mjs font "<Family>" [fontsource-pkg]   set --font-sans (e.g. "Onest" for Cyrillic), snapshot
//   node base.mjs recover <item.json> write a registry item's page files from a local JSON (offline)
//   node base.mjs status
//
// Run from the project root (where components.json is). Exit: 0 ok · 64 usage · 65 not a shadcn
// project · 66 shadcn CLI failed · 70 crashed.
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'

process.on('uncaughtException', e => { console.error(`✗ base.mjs crashed: ${e.stack || e}`); process.exit(70) })

const ROOT = process.cwd()
const SNAP = join(ROOT, '.superdesign', 'base.json')
// The keys a brand colour may occupy. Everything else stays the preset's; lint.mjs holds that line.
export const BRAND_KEYS = ['--primary', '--primary-foreground', '--ring', '--chart-1', '--sidebar-primary', '--sidebar-primary-foreground']

const [cmd, ...rest] = process.argv.slice(2)
if (!cmd) usage()
if (!existsSync(join(ROOT, 'components.json'))) {
  console.error('✗ no components.json here — scaffold first: npx shadcn@latest init -t vite -b radix -p <preset> -n <name>')
  process.exit(65)
}
const cfg = JSON.parse(readFileSync(join(ROOT, 'components.json'), 'utf8'))
const cssPath = join(ROOT, cfg.tailwind?.css || 'src/index.css')
const snap = existsSync(SNAP) ? JSON.parse(readFileSync(SNAP, 'utf8')) : { ids: [], preset: cfg.style, brand: null, files: {}, theme: {} }
// First contact: whatever `shadcn init` put in components/ui is stock, so it is the baseline.
if (!existsSync(SNAP) && cmd !== 'status')
  for (const [p, h] of Object.entries(hashTree())) if (p.includes('components/ui/') || p.endsWith('lib/utils.ts')) snap.files[p] = h

if (cmd === 'add') add(rest)
else if (cmd === 'apply') apply(rest[0])
else if (cmd === 'brand') brand(rest[0])
else if (cmd === 'font') font(rest[0], rest[1])
else if (cmd === 'recover') { const item = JSON.parse(readFileSync(rest[0], 'utf8')); recoverPages(item); snap.ids = [...new Set([...snap.ids, item.name])]; save() }
else if (cmd === 'status') status()
else usage()

function usage() { console.error('usage: base.mjs add <ids...> | apply <preset> | brand <oklch> | font "<Family>" [pkg] | recover <item.json> | status'); process.exit(64) }

function shadcn(argv) {
  const r = spawnSync('npx', ['-y', 'shadcn@latest', ...argv], { cwd: ROOT, stdio: 'inherit' })
  if (r.status !== 0) { console.error(`✗ npx shadcn ${argv.join(' ')} exited ${r.status}`); process.exit(66) }
}

function add(ids) {
  if (!ids.length) usage()
  const before = hashTree()
  shadcn(['add', ...ids, '-y'])
  for (const id of ids) {
    const item = fetchItem(id)
    if (item) recoverPages(item)
  }
  const after = hashTree()
  for (const [p, h] of Object.entries(after)) if (before[p] !== h) snap.files[p] = h
  snap.ids = [...new Set([...snap.ids, ...ids])]
  save()
  const got = Object.keys(after).filter(p => before[p] !== after[p])
  console.log(`base: ${ids.join(' ')} → ${got.length} file(s) recorded in .superdesign/base.json`)
}

// Registry JSON for an id: official ids resolve against the project's style, @ns/name against the
// URL template in components.json "registries".
function fetchItem(id) {
  let url
  const ns = id.match(/^(@[^/]+)\/(.+)$/)
  if (ns) { const tpl = cfg.registries?.[ns[1]]; url = typeof tpl === 'string' ? tpl.replace('{name}', ns[2]) : tpl?.url?.replace('{name}', ns[2]) }
  else url = `https://ui.shadcn.com/r/styles/${cfg.style}/${id}.json`
  if (!url) return null
  const r = spawnSync('curl', ['-sfL', '-m', '30', url], { encoding: 'utf8', maxBuffer: 64 << 20 })
  try { return r.status === 0 ? JSON.parse(r.stdout) : null } catch { return null }
}

// `shadcn add` writes registry:page files only in frameworks with file routing. Write the missing ones
// where their target says, with the registry-internal import paths rewritten to the project's aliases.
function recoverPages(item) {
  const src = existsSync(join(ROOT, 'src')) ? 'src' : '.'
  for (const f of item.files ?? []) {
    if (f.type !== 'registry:page' || !f.content) continue
    const target = join(ROOT, src, f.target || `pages/${item.name}.tsx`)
    if (existsSync(target)) continue
    const body = f.content
      .replace(/@\/registry\/[\w-]+\/blocks\/[\w-]+\/components\//g, '@/components/')
      .replace(/@\/registry\/[\w-]+\/ui\//g, '@/components/ui/')
      .replace(/@\/registry\/[\w-]+\/(hooks|lib|components)\//g, '@/$1/')
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, body)
    snap.files[relative(ROOT, target)] = sha(body)
    const hint = /Sidebar|Tooltip/.test(body) ? ' — it uses Sidebar/Tooltip: render it inside <TooltipProvider>' : ''
    console.log(`recovered page the CLI skipped: ${relative(ROOT, target)}${hint}`)
  }
}

function apply(preset) {
  if (!preset) usage()
  shadcn(['apply', preset, '-y'])
  snap.preset = JSON.parse(readFileSync(join(ROOT, 'components.json'), 'utf8')).style
  if (snap.brand) writeBrand(snap.brand)
  const now = hashTree()
  for (const p of Object.keys(now)) if (snap.files[p] || p.includes('components/ui/')) snap.files[p] = now[p]
  save()
  console.log(`base: preset ${preset} applied (${snap.preset})${snap.brand ? `, brand ${snap.brand} re-applied` : ''}`)
}

function brand(value) {
  if (!/^oklch\(\s*[\d.]+\s+[\d.]+\s+[\d.]+\s*\)$/.test(value || '')) { console.error('✗ brand must be oklch(L C H), e.g. "oklch(0.41 0.10 250)"'); process.exit(64) }
  snap.brand = value
  writeBrand(value)
  save()
  console.log(`base: brand ${value} → ${BRAND_KEYS.join(' ')}`)
}

function writeBrand(value) {
  const L = +value.match(/[\d.]+/)[0]
  const fg = L > 0.62 ? 'oklch(0.145 0 0)' : 'oklch(0.985 0 0)'
  const vals = { '--primary': value, '--primary-foreground': fg, '--ring': value, '--chart-1': value, '--sidebar-primary': value, '--sidebar-primary-foreground': fg }
  let css = readFileSync(cssPath, 'utf8')
  css = css.replace(/(:root|\.dark)\s*\{([^}]*)\}/g, (all, sel, body) =>
    `${sel} {${body.replace(/(--[\w-]+)\s*:\s*([^;]+);/g, (d, k) => k in vals ? `${k}: ${vals[k]};` : d)}}`)
  writeFileSync(cssPath, css)
}

// A sans family only: a serif on an app surface is what lint.mjs exists to refuse, and the preset's
// own heading/mono stacks are left alone.
function font(family, pkg) {
  if (!family) usage()
  if (pkg) {
    const r = spawnSync('npm', ['i', pkg], { cwd: ROOT, stdio: 'inherit' })
    if (r.status !== 0) { console.error(`✗ npm i ${pkg} failed`); process.exit(66) }
  }
  let css = readFileSync(cssPath, 'utf8')
  if (pkg && !css.includes(`@import "${pkg}"`)) css = css.replace(/(@import "tailwindcss";\n)/, `$1@import "${pkg}";\n`)
  css = css.replace(/(--font-sans\s*:\s*)[^;]+;/, `$1'${family}', sans-serif;`)
  writeFileSync(cssPath, css)
  snap.font = family
  save()
  console.log(`base: --font-sans → '${family}', sans-serif${pkg ? ` (${pkg} installed and imported)` : ''}`)
}

export function themeVars(css) {
  const out = {}
  for (const [, sel, body] of css.matchAll(/(:root|\.dark|@theme inline|@theme)\s*\{([^}]*)\}/g))
    for (const [, k, v] of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[`${sel} ${k}`] = v.trim()
  return out
}

function hashTree() {
  const out = {}
  const walk = d => {
    for (const n of readdirSync(d)) {
      if (n === 'node_modules' || n.startsWith('.') || n === 'dist') continue
      const p = join(d, n), s = statSync(p)
      if (s.isDirectory()) walk(p)
      else if (/\.(tsx?|jsx?|css|json)$/.test(n)) out[relative(ROOT, p)] = sha(readFileSync(p))
    }
  }
  walk(existsSync(join(ROOT, 'src')) ? join(ROOT, 'src') : ROOT)
  return out
}
function sha(b) { return createHash('sha256').update(b).digest('hex').slice(0, 16) }

function save() {
  snap.theme = themeVars(readFileSync(cssPath, 'utf8'))
  mkdirSync(dirname(SNAP), { recursive: true })
  writeFileSync(SNAP, JSON.stringify(snap, null, 1))
}

function status() {
  if (!existsSync(SNAP)) { console.log('no .superdesign/base.json — nothing has come through base.mjs yet'); return }
  console.log(`preset ${snap.preset} · brand ${snap.brand ?? 'none'} · blocks ${snap.ids.join(' ') || 'none'} · ${Object.keys(snap.files).length} files recorded`)
}
