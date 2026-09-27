#!/usr/bin/env node
// Render probe: finds DEFECTS in a running page. It is not a quality verdict — every build the owner
// called cheap would have passed it. Run it, fix what it names, then show him the screenshots.
//
//   node check.mjs <url> [--brief DESIGN.md] [--out .superdesign/shots]
//   node check.mjs --ground-card <card.json>        the ground-tint cap alone, on a measured card
//
// Per viewport (1440×900, 390×844) and scheme (light, dark):
//   runtime   page errors, console errors, and any asset that answers 4xx/5xx (a /public path the
//             build broke looks like an empty hero, not like an error)
//   void      a page that rendered nothing, or text sections left at opacity 0 (reveal-on-scroll)
//   axe       serious + critical violations
//   overflow  horizontal scroll at 390px
//   leftovers vendor demo content that survived: shadcnblocks image CDN, "Acme Inc.", m@example.com …
//   clip      at 1440, a container that scrolls sideways (a table column cut off inside overflow-x-auto)
// With --brief (the project's DESIGN.md):
//   hero      every HERO-VISUAL asset renders inside the first viewport at 1440 AND 390
//   assets    every ASSETS path renders somewhere on the page
//   form      CONVERSION: form needs a visible <form>; call needs a tel: link
// Always, at 1440 light:
//   ground    light chromatic ground ≤ 12% of painted area (see groundTint below)
//
// Before anything, the page must be THIS project: when ./index.html exists, the served <title> must match
// it — a field run once probed another app that held the port and called it clean.
//
// Exit: 0 clean · 1–63 number of defects · 64 usage · 67 page unreachable or not this project · 69 dependency missing ·
//       70 the probe itself crashed (never read that as a defect count, never as clean).
import { readFileSync, existsSync, mkdirSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { basename, dirname, join, delimiter } from 'node:path'
import { pathToFileURL } from 'node:url'

process.on('uncaughtException', e => { console.error(`✗ check.mjs crashed: ${e.stack || e}`); process.exit(70) })
process.on('unhandledRejection', e => { console.error(`✗ check.mjs crashed: ${e?.stack || e}`); process.exit(70) })

const args = process.argv.slice(2)
const opt = (f, d) => { const i = args.indexOf(f); return i < 0 ? d : args[i + 1] }

// ---------------------------------------------------------------------------------------------
// Ground tint — ported from v2 extract-reference.mjs, where it was the only gate that ever exited 1
// on a build the owner rejected. Painted area per computed background colour, top 8 colours; the
// share of those painted as LIGHT CHROMATIC ground (L ≥ 0.75, C ≥ 0.02) — a page washed in its brand
// colour. Calibrated 2026-09-16 on 18 live peers (median 0.0%, max 4.5%), his accepted build 0.0%,
// his rejected build 45.2%. The cap sits in the gap. fixtures/ground-tint must stay green before
// anyone moves it.
const GROUND_CAP = 0.12
export function groundTint(backgrounds) {
  const rows = backgrounds.map(b => ({ ...b, ...parseOklch(b.oklch) })).filter(r => r.L != null)
  const total = rows.reduce((n, r) => n + r.weight, 0) || 1
  const tinted = rows.filter(r => r.L >= 0.75 && r.C >= 0.02)
  return { share: tinted.reduce((n, r) => n + r.weight, 0) / total, tinted }
}
function parseOklch(s) {
  const m = /oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/.exec(s || '')
  return m ? { L: +m[1], C: +m[2], H: +m[3] } : {}
}

if (args[0] === '--ground-card') {
  const card = JSON.parse(readFileSync(args[1], 'utf8'))
  const { share } = groundTint(card.palette.backgrounds)
  console.log(`${share > GROUND_CAP ? 'FAIL' : 'ok  '} ground  light chromatic ground ${(share * 100).toFixed(1)}% (cap ${GROUND_CAP * 100}%)`)
  process.exit(share > GROUND_CAP ? 1 : 0)
}

const url = args.find(a => /^(https?|file):/.test(a))
if (!url) { console.error('usage: check.mjs <url> [--brief DESIGN.md] [--out dir] | --ground-card <card.json>'); process.exit(64) }
// One directory per URL, so probing a variant never overwrites the main page's shots.
const outDir = opt('--out', join('.superdesign', 'shots', url.replace(/^\w+:\/+/, '').replace(/[^\w.-]+/g, '_').replace(/_+$/, '') || 'page'))
const briefPath = opt('--brief', null)

// ---------------------------------------------------------------------------------------------
// Dependencies are the project's, not the skill's: resolve from the cwd, then beside this script,
// then from silver (a local headless Playwright). A probe that cannot load must not print clean.
function silverRoot() {
  for (const dir of (process.env.PATH || '').split(delimiter)) {
    const bin = join(dir, 'silver'); if (!existsSync(bin)) continue
    let p = dirname(realpathSync(bin))
    for (let i = 0; i < 4; i++, p = dirname(p)) if (existsSync(join(p, 'node_modules'))) return p
  }
  return null
}
async function need(name) {
  for (const base of [process.cwd(), dirname(new URL(import.meta.url).pathname), silverRoot()].filter(Boolean)) {
    try { return await import(pathToFileURL(createRequire(join(base, 'package.json')).resolve(name)).href) } catch {}
  }
  console.error(`✗ ${name} is not installed in this project. Run: npm i -D playwright axe-core && npx playwright install chromium`)
  process.exit(69)
}
const pw = await need('playwright')
const chromium = pw.chromium ?? pw.default?.chromium
const axe = await need('axe-core')
const axeSource = axe.source ?? axe.default?.source

// ---------------------------------------------------------------------------------------------
// The brief: only the lines this probe can verify.
function readBrief(p) {
  if (!p) return null
  const t = readFileSync(p, 'utf8')
  const line = k => (t.match(new RegExp(`^${k}:\\s*(.+)$`, 'm')) || [])[1]?.trim()
  const paths = s => (s || '').split(/[\s,]+/).filter(x => /\.(png|jpe?g|webp|avif|svg|gif|mp4|webm)$/i.test(x))
  const assetsBlock = (t.match(/^ASSETS:([\s\S]*?)(?=^[A-Z][A-Z-]+:|$(?![\s\S]))/m) || [])[1] || ''
  return {
    surface: line('SURFACE'),
    hero: paths(line('HERO-VISUAL')), heroNone: /^none\b/i.test(line('HERO-VISUAL') || ''),
    assets: paths(assetsBlock),
    conversion: (line('CONVERSION') || '').split(/\s/)[0]?.toLowerCase(),
  }
}
const brief = readBrief(briefPath)
const expectTitle = existsSync('index.html') && !opt('--any-title') ? (readFileSync('index.html', 'utf8').match(/<title>([^<]*)<\/title>/) || [])[1]?.trim() : null

const LEFTOVERS = [/deifkwefumgah\.cloudfront\.net/, /shadcnblocks\.com/i, /\bAcme Inc\b/, /m@example\.com/,
  /github\.com\/shadcn\.png/, /i\.pravatar\.cc/, /lorem ipsum/i]

const defects = []
const fail = (where, what) => defects.push(`${where.padEnd(16)} ${what}`)

mkdirSync(outDir, { recursive: true })
const browser = await chromium.launch()
try {
  for (const [w, h] of [[1440, 900], [390, 844]]) for (const scheme of ['light', 'dark']) {
    const where = `${w} ${scheme}`
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: scheme })
    const page = await ctx.newPage()
    const errors = []
    page.on('pageerror', e => errors.push(e.message.split('\n')[0]))
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text().split('\n')[0]) })
    page.on('response', r => { if (r.status() >= 400) errors.push(`asset ${r.status()}: ${r.url()}`) })
    page.on('requestfailed', r => { if (!/favicon/.test(r.url())) errors.push(`asset failed: ${r.url()}`) })
    try { await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 }) }
    catch (e) { console.error(`✗ cannot load ${url}: ${e.message.split('\n')[0]}`); process.exit(67) }
    await page.waitForTimeout(600)
    if (expectTitle && (await page.title()).trim() !== expectTitle) {
      console.error(`✗ ${url} serves "${await page.title()}", but ./index.html says "${expectTitle}" — that is another app on this port. Start this project with --strictPort on a free port.`)
      process.exit(67)
    }
    await page.screenshot({ path: join(outDir, `${w}-${scheme}.png`) })
    if (scheme === 'light') await page.screenshot({ path: join(outDir, `${w}-full.png`), fullPage: true })

    for (const e of [...new Set(errors)].slice(0, 4)) fail(where, `runtime: ${e.slice(0, 180)}`)

    // Scroll the whole page once so reveal-on-scroll gets its chance, then look for what stayed hidden.
    const probe = await page.evaluate(async ({ vh }) => {
      const step = Math.max(200, vh * 0.8)
      for (let y = 0; y < document.documentElement.scrollHeight; y += step) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 60)) }
      window.scrollTo(0, 0); await new Promise(r => setTimeout(r, 300))
      const text = document.body.innerText.trim().length
      const media = document.querySelectorAll('img,video,svg,canvas').length
      const hidden = [...document.querySelectorAll('section,article,div')].filter(el => {
        const s = getComputedStyle(el), r = el.getBoundingClientRect()
        return +s.opacity === 0 && r.height > 100 && el.innerText.trim().length > 40 && s.visibility !== 'hidden'
      }).length
      const clipped = [...document.querySelectorAll('*')].filter(el => {
        const st = getComputedStyle(el).overflowX
        return (st === 'auto' || st === 'scroll') && el.scrollWidth - el.clientWidth > 4 && el.clientWidth > 200
      }).map(el => el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.') : '')).slice(0, 3)
      return { text, media, hidden, clipped, overflow: document.documentElement.scrollWidth - window.innerWidth, html: document.documentElement.outerHTML }
    }, { vh: h })
    if (probe.text < 20 && probe.media === 0) fail(where, 'void: the page rendered nothing')
    if (probe.hidden) fail(where, `void: ${probe.hidden} text block(s) still at opacity 0 after a full scroll (reveal with no fallback)`)
    if (w === 390 && probe.overflow > 0) fail(where, `overflow: page scrolls ${probe.overflow}px sideways`)
    if (w === 1440) for (const c of probe.clipped) fail(where, `clip: ${c} scrolls sideways at desktop width — a column is cut off`)
    if (w === 1440 && scheme === 'light') for (const re of LEFTOVERS) if (re.test(probe.html)) fail(where, `leftovers: vendor demo content still on the page (${re.source})`)

    await page.addScriptTag({ content: axeSource })
    const ax = await page.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations
      .filter(v => v.impact === 'serious' || v.impact === 'critical')
      .map(v => `${v.id} ×${v.nodes.length} at ${v.nodes.slice(0, 2).map(n => n.target.join(' ')).join(' | ')}`))
    for (const v of ax) fail(where, `axe: ${v}`)

    if (brief && !brief.heroNone && brief.hero.length && scheme === 'light') {
      const seen = await page.evaluate(vh => [...document.querySelectorAll('*')].flatMap(el => {
        const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2 || r.top >= vh || r.bottom <= 0) return []
        const bg = getComputedStyle(el).backgroundImage
        return [el.currentSrc, el.src, el.poster, el.getAttribute?.('srcset'), bg !== 'none' ? bg : ''].filter(Boolean)
      }).join(' '), h)
      for (const a of brief.hero) if (!seen.includes(basename(a))) fail(where, `hero: ${basename(a)} is not in the first viewport`)
    }
    if (brief && w === 1440 && scheme === 'light') {
      const all = await page.evaluate(() => [...document.querySelectorAll('*')].flatMap(el => {
        const bg = getComputedStyle(el).backgroundImage
        return [el.currentSrc, el.src, el.getAttribute?.('href'), el.getAttribute?.('srcset'), bg !== 'none' ? bg : ''].filter(Boolean)
      }).join(' '))
      for (const a of brief.assets) if (!all.includes(basename(a))) fail(where, `assets: ${basename(a)} is declared but never rendered`)
      const conv = await page.evaluate(app => ({
        // On an app surface "form" means he sets values here; any live control counts. On marketing it is a lead form.
        form: app ? [...document.querySelectorAll('input,select,textarea,[role=combobox],[role=switch],[role=checkbox],[role=radio]')].some(e => e.getBoundingClientRect().height > 0 && !e.disabled)
          : [...document.querySelectorAll('form')].some(f => f.getBoundingClientRect().height > 0 && f.querySelector('input,textarea,select')),
        tel: !!document.querySelector('a[href^="tel:"]'),
      }), brief.surface?.startsWith('app'))
      if (brief.conversion === 'form' && !conv.form) fail(where, brief.surface?.startsWith('app') ? 'form: CONVERSION is form and the page has no live control he can set' : 'form: CONVERSION is form and no visible form with a field was rendered')
      if (brief.conversion === 'call' && !conv.tel) fail(where, 'form: CONVERSION is call and there is no tel: link')
    }
    if (w === 1440 && scheme === 'light') {
      const backgrounds = await page.evaluate(() => {
        const m = new Map()
        for (const el of document.querySelectorAll('*')) {
          const s = getComputedStyle(el); if (!s.backgroundColor || s.backgroundColor === 'rgba(0, 0, 0, 0)' || s.backgroundColor === 'transparent') continue
          const r = el.getBoundingClientRect(), a = Math.max(0, r.width) * Math.max(0, r.height); if (!a) continue
          m.set(s.backgroundColor, (m.get(s.backgroundColor) || 0) + a)
        }
        return [...m].map(([css, weight]) => ({ css, weight }))
      })
      const top = backgrounds.map(b => ({ ...b, oklch: toOklch(b.css) })).sort((a, b) => b.weight - a.weight).slice(0, 8)
      const { share } = groundTint(top)
      if (share > GROUND_CAP) fail(where, `ground: ${(share * 100).toFixed(1)}% of painted area is light chromatic ground (cap ${GROUND_CAP * 100}%) — the page is washed in its brand colour`)
    }
    await ctx.close()
  }
} finally { await browser.close() }

// Chromium reports computed colours as rgb()/rgba() or, for oklch sources, oklch() / color(srgb …).
function toOklch(css) {
  if (/^oklch/.test(css)) return css
  const n = (css.match(/[\d.]+/g) || []).map(Number)
  let [r, g, b] = /^color\(srgb/.test(css) ? n.slice(0, 3) : n.slice(0, 3).map(v => v / 255)
  const lin = v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  ;[r, g, b] = [r, g, b].map(lin)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  return `oklch(${L.toFixed(3)} ${Math.hypot(A, B).toFixed(3)} ${((Math.atan2(B, A) * 180 / Math.PI + 360) % 360).toFixed(1)})`
}

for (const d of defects) console.log(`FAIL ${d}`)
console.log(defects.length ? `${defects.length} defect(s) — screenshots in ${outDir}` : `clean: no defects found at 1440/390 × light/dark — screenshots in ${outDir}. This says nothing about whether it looks good; show him.`)
process.exit(Math.min(defects.length, 63))
