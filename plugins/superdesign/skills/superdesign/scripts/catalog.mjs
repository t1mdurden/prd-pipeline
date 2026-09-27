#!/usr/bin/env node
// The block catalog: every page region starts from an installed block, never from blank JSX.
//
//   node catalog.mjs search <words...> [--surface app|marketing] [--image] [--paid] [--limit N]
//   node catalog.mjs refresh [--concurrency N]      rebuild data/catalog.json from the live registries
//
// Sources: the official shadcn registry (free, MIT) and shadcnblocks' public registry, where an item
// counts as free only if its /r/<name> endpoint serves source without a key (Pro items answer
// "Authentication failed"). Search is plain word overlap on name + title + description — the
// registries describe their own blocks well enough that nothing cleverer has been needed.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const DATA = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'catalog.json')
const OFFICIAL = 'https://ui.shadcn.com/r/styles/radix-vega/registry.json'
const SB = 'https://www.shadcnblocks.com/r'

// shadcnblocks name prefix → surface. Anything not listed (single-component demos such as
// avatar-avatar-standard-3) is not a page region and stays out of the catalog.
const MARKETING = ['hero', 'feature', 'features', 'pricing', 'cta', 'logos', 'testimonial', 'footer', 'navbar',
  'faq', 'about', 'contact', 'stats', 'team', 'gallery', 'blog', 'blogpost', 'bento', 'integration', 'banner',
  'compare', 'services', 'case-studies', 'careers', 'download', 'timeline', 'projects', 'reviews', 'community',
  'changelog', 'waitlist', 'product-card', 'product-list', 'product-detail', 'resource']
const APP = ['application-shell', 'dashboard', 'data-table', 'sidebar', 'chart-card', 'chart-group', 'stats-card',
  'settings-integrations', 'settings-profile', 'settings-account', 'settings-notifications', 'settings-billing',
  'settings-security', 'settings-team', 'user-profile', 'todo', 'signup', 'login', 'kanban', 'calendar', 'inbox',
  'file-upload', 'empty-state', 'onboarding', 'checkout', 'shopping-cart']

const prefix = n => n.replace(/\d+$/, '')
const surfaceOf = n => APP.includes(prefix(n)) ? 'app' : MARKETING.includes(prefix(n)) ? 'marketing' : null
const IMAGE = /(src|image|photo|background)\s*[:=]\s*["'`]https?:\/\/[^"'`]+\.(png|jpe?g|webp|avif)|<img\b|<Image\b|<video\b/i

const args = process.argv.slice(2)
const flag = (f, d) => { const i = args.indexOf(f); return i < 0 ? d : args[i + 1] }
const has = f => args.includes(f)

async function getJson(url) {
  const r = await fetch(url, { headers: { accept: 'application/json' } })
  if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`)
  return r.json()
}

async function refresh() {
  const out = []
  const official = await getJson(OFFICIAL)
  for (const it of official.items.filter(i => i.type === 'registry:block')) {
    const cats = it.categories ?? []
    out.push({
      src: 'shadcn', name: it.name, title: it.title ?? it.name, description: it.description ?? '',
      surface: cats.some(c => /login|signup|sidebar|dashboard|chart|authentication/.test(c)) ? 'app' : 'marketing',
      free: true, image: false, add: it.name,
    })
  }
  const index = await getJson(`${SB}/registry.json`)
  const todo = index.items.filter(i => i.type === 'registry:block' && surfaceOf(i.name))
  const conc = Number(flag('--concurrency', 6))
  let done = 0, failed = 0
  async function worker() {
    while (todo.length) {
      const it = todo.shift()
      let item = null
      try {
        const r = await fetch(`${SB}/${it.name}`, { headers: { accept: 'application/json' } })
        if (r.ok) item = await r.json()
        else if (r.status !== 401 && r.status !== 403) failed++   // 401/403 = Pro item, not a failure
      } catch { failed++ }
      const src = (item?.files ?? []).map(f => f.content ?? '').join('\n')
      out.push({
        src: 'shadcnblocks', name: it.name, title: it.title ?? it.name, description: it.description ?? '',
        surface: surfaceOf(it.name), free: src.length > 0, image: IMAGE.test(src),
        add: `@shadcnblocks/${it.name}`,
        deps: item?.dependencies ?? it.dependencies ?? [],
      })
      if (++done % 100 === 0) process.stderr.write(`  ${done} fetched\n`)
    }
  }
  await Promise.all(Array.from({ length: conc }, worker))
  // A refresh that could not reach most items must not overwrite a good catalog with an empty one.
  if (failed > done / 4) { console.error(`refresh aborted: ${failed}/${done} item fetches failed; catalog left untouched`); process.exit(2) }
  out.sort((a, b) => a.src.localeCompare(b.src) || prefix(a.name).localeCompare(prefix(b.name)) ||
    (Number(a.name.match(/\d+$/)?.[0] ?? 0) - Number(b.name.match(/\d+$/)?.[0] ?? 0)))
  const meta = { fetched: new Date().toISOString().slice(0, 10), official: OFFICIAL, shadcnblocks: `${SB}/registry.json` }
  writeFileSync(DATA, JSON.stringify({ meta, items: out }, null, 0).replace(/},{/g, '},\n{'))
  const free = out.filter(i => i.free)
  console.log(`catalog: ${out.length} items, ${free.length} free (${free.filter(i => i.surface === 'app').length} app, ` +
    `${free.filter(i => i.surface === 'marketing').length} marketing, ${free.filter(i => i.image).length} with imagery)`)
}

function search() {
  const words = []
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--surface' || args[i] === '--limit') i++
    else if (!args[i].startsWith('--')) words.push(...args[i].toLowerCase().split(/\s+/).filter(Boolean))   // "contact form" quoted = two words
  }
  if (!words.length) { console.error('usage: catalog.mjs search <words...> [--surface app|marketing] [--image] [--paid] [--limit N]'); process.exit(64) }
  const { meta, items } = JSON.parse(readFileSync(DATA, 'utf8'))
  const surface = flag('--surface', null), limit = Number(flag('--limit', 12))
  const hits = items
    .filter(i => (has('--paid') || i.free) && (!surface || i.surface === surface) && (!has('--image') || i.image))
    .map(i => {
      // A word naming the block's kind (logos, hero, sidebar) outranks one found in the title, which
      // outranks one only in the description.
      const kind = prefix(i.name).replace(/-$/, ''), title = i.title.toLowerCase(), desc = i.description.toLowerCase()
      const score = words.reduce((s, w) => s + (kind.startsWith(w.replace(/s$/, '')) ? 3 : title.includes(w) ? 1.5 : desc.includes(w) ? 0.75 : 0), 0)
      return { i, score: score ? score + (i.src === 'shadcn' ? 0.25 : 0) : 0 }
    })
    .filter(h => h.score > 0).sort((a, b) => b.score - a.score).slice(0, limit)
  if (!hits.length) { console.log(`no free block matches "${words.join(' ')}" (catalog ${meta.fetched}) — widen the words before writing a region by hand`); process.exit(1) }
  for (const { i } of hits)
    console.log(`${i.add.padEnd(30)} ${i.surface.padEnd(9)} ${i.image ? 'img ' : '    '}${i.free ? '' : 'PAID '}${i.title}${i.description ? ' — ' + i.description.slice(0, 110) : ''}`)
}

if (args[0] === 'refresh') await refresh()
else if (args[0] === 'search') search()
else { console.error('usage: catalog.mjs search <words...> | refresh'); process.exit(64) }
