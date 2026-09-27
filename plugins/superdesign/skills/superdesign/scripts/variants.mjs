#!/usr/bin/env node
// Live variants the owner flips between before any feature is built. One variant full-size at a
// time, keys 1–9 or ←/→ switch instantly (emilkowalski/skills `prototype`). He picks; nobody scores.
//
//   node variants.mjs clone <name...>          copy this project to .superdesign/variants/<name>
//                                              (node_modules linked); then change each one with
//                                              base.mjs add/apply/brand/font and its own App.tsx
//   node variants.mjs serve [--port 8850] [--shots]
//                                              build every variant, serve each on its own port (so
//                                              /public paths work) plus the picker, print the URL;
//                                              --shots writes <name>.png at 1440×900 and exits,
//                                              non-zero if any variant 404s an asset
//   node variants.mjs keep <name>              copy the picked variant's src, config and base.json back
//
// Vite projects only. Exit: 0 ok · 1 a variant failed to load an asset (--shots) · 64 usage ·
// 65 not a Vite project / no variants / port taken · 66 build failed · 69 playwright missing.
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { extname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

const ROOT = process.cwd()
const VAR = join(ROOT, '.superdesign', 'variants')
const OUT = join(ROOT, '.superdesign', 'picker')
const [cmd, ...rest] = process.argv.slice(2)
const opt = (f, d) => { const i = rest.indexOf(f); return i < 0 ? d : rest[i + 1] }
const usage = () => { console.error('usage: variants.mjs clone <name...> | serve [--port N] [--shots] | keep <name>'); process.exit(64) }
if (!['clone', 'serve', 'keep'].includes(cmd)) usage()
if (!['vite.config.ts', 'vite.config.js', 'vite.config.mts'].some(f => existsSync(join(ROOT, f)))) {
  console.error('✗ not a Vite project. For Next, run each variant\'s dev server on its own port and show him the URLs.'); process.exit(65)
}
const SKIP = new Set(['node_modules', 'dist', '.git', '.superdesign'])

if (cmd === 'clone') {
  if (!rest.length) usage()
  for (const name of rest) {
    const dst = join(VAR, name)
    if (existsSync(dst)) { console.log(`exists: ${dst}`); continue }
    mkdirSync(dst, { recursive: true })
    for (const n of readdirSync(ROOT)) if (!SKIP.has(n)) cpSync(join(ROOT, n), join(dst, n), { recursive: true })
    if (existsSync(join(ROOT, '.superdesign', 'base.json'))) cpSync(join(ROOT, '.superdesign', 'base.json'), join(dst, '.superdesign', 'base.json'))
    symlinkSync(join(ROOT, 'node_modules'), join(dst, 'node_modules'))
    console.log(`variant ${name}: ${dst}`)
  }
} else if (cmd === 'keep') {
  const src = join(VAR, rest[0] || '')
  if (!rest[0] || !existsSync(src)) { console.error(`✗ no variant "${rest[0]}" in ${VAR}`); process.exit(64) }
  for (const n of ['src', 'public', 'components.json', 'package.json', 'package-lock.json', 'index.html'])
    if (existsSync(join(src, n))) cpSync(join(src, n), join(ROOT, n), { recursive: true })
  cpSync(join(src, '.superdesign', 'base.json'), join(ROOT, '.superdesign', 'base.json'))
  spawnSync('npm', ['i'], { cwd: ROOT, stdio: 'inherit' })
  console.log(`kept ${rest[0]}: its src, config and base.json are now the project's. Record the pick in DESIGN.md (PICKED:).`)
} else {
  const names = existsSync(VAR) ? readdirSync(VAR).filter(n => !n.startsWith('.')).sort() : []
  if (names.length < 2) { console.error('✗ fewer than two variants — clone at least two first'); process.exit(65) }
  mkdirSync(OUT, { recursive: true })
  for (const n of names) {
    // Default base on purpose: each variant gets its own port, so src="/photo.jpg" resolves as it will in production.
    const r = spawnSync('npx', ['vite', 'build', '--outDir', join(OUT, n), '--emptyOutDir'], { cwd: join(VAR, n), encoding: 'utf8' })
    if (r.status !== 0) { console.error(`✗ variant ${n} does not build:\n${(r.stderr || r.stdout).slice(-1500)}`); process.exit(66) }
  }
  const port = Number(opt('--port', 8850))
  const urls = names.map((n, i) => `http://localhost:${port + 1 + i}/`)
  writeFileSync(join(OUT, 'index.html'), picker(names, urls))
  const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.woff2': 'font/woff2', '.json': 'application/json', '.mp4': 'video/mp4' }
  const serve = (dir, p) => new Promise((ok) => {
    const srv = createServer((req, res) => {
      const parts = decodeURIComponent(req.url.split('?')[0]).split('/').filter(x => x && x !== '..')
      let f = join(dir, ...parts)
      if (!existsSync(f) || statSync(f).isDirectory()) f = extname(f) && !existsSync(f) ? null : join(dir, 'index.html')
      if (!f) { res.writeHead(404); res.end(); return }
      res.writeHead(200, { 'content-type': TYPES[extname(f)] || 'application/octet-stream' })
      res.end(readFileSync(f))
    })
    // No host: bind both stacks, so a port another server already holds fails here instead of serving its pages.
    srv.on('error', e => { console.error(`✗ port ${p}: ${e.code} — pass --port <free port>`); process.exit(65) })
    srv.listen(p, () => ok(srv))
  })
  const servers = [await serve(OUT, port), ...await Promise.all(names.map((n, i) => serve(join(OUT, n), port + 1 + i)))]
  const url = `http://localhost:${port}/`
  if (rest.includes('--shots')) {
    const req = createRequire(join(ROOT, 'package.json'))
    let pw; try { pw = await import(pathToFileURL(req.resolve('playwright')).href) } catch { console.error('✗ --shots needs playwright in this project: npm i -D playwright'); process.exit(69) }
    const b = await (pw.chromium ?? pw.default.chromium).launch()
    const page = await b.newPage({ viewport: { width: 1440, height: 900 } })
    const broken = []
    page.on('response', r => { if (r.status() >= 400) broken.push(`${r.status()} ${r.url()}`) })
    page.on('requestfailed', r => broken.push(`failed ${r.url()}`))
    for (let i = 0; i < names.length; i++) {
      await page.goto(urls[i], { waitUntil: 'networkidle' }); await page.waitForTimeout(500)
      await page.screenshot({ path: join(OUT, `${names[i]}.png`) })
    }
    await b.close(); servers.forEach(s => s.close())
    console.log(`screenshots: ${names.map(n => join(OUT, `${n}.png`)).join(' ')}`)
    if (broken.length) { console.error(`✗ ${broken.length} request(s) failed — the shots are missing what these load:\n  ${[...new Set(broken)].slice(0, 10).join('\n  ')}`); process.exit(1) }
  } else console.log(`picker: ${url}  — ${names.map((n, i) => `${i + 1} ${n} (${urls[i]})`).join(' · ')}  (Ctrl-C to stop)`)
}

// The picker is chrome, not a contestant: fixed, neutral, identical for every project.
function picker(names, urls) {
  const btn = names.map((n, i) => `<button data-i="${i}">${i + 1} · ${n}</button>`).join('')
  return `<!doctype html><html><head><meta charset="utf-8"><title>variants</title><style>
html,body{margin:0;height:100%;background:#fff}iframe{border:0;width:100%;height:100%;display:block}
nav{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);display:flex;gap:4px;padding:4px;border-radius:999px;background:rgba(20,20,20,.88);font:500 13px/1 system-ui,sans-serif;z-index:9}
nav button{all:unset;cursor:pointer;color:#bbb;padding:8px 12px;border-radius:999px}nav button[aria-pressed=true]{background:#fff;color:#111}
nav button:focus-visible{outline:2px solid #fff;outline-offset:2px}</style></head><body>
<iframe id="f" title="variant"></iframe><nav aria-label="Variants">${btn}</nav><script>
const names=${JSON.stringify(names)},urls=${JSON.stringify(urls)},f=document.getElementById('f'),bs=[...document.querySelectorAll('nav button')];let cur=0
function show(i){cur=(i+names.length)%names.length;f.src=urls[cur];bs.forEach((b,j)=>b.setAttribute('aria-pressed',j===cur));history.replaceState(null,'','#'+names[cur])}
bs.forEach(b=>b.onclick=()=>show(+b.dataset.i))
addEventListener('keydown',e=>{if(e.key==='ArrowRight')show(cur+1);else if(e.key==='ArrowLeft')show(cur-1);else if(/^[1-9]$/.test(e.key)&&+e.key<=names.length)show(+e.key-1)})
show(Math.max(0,names.indexOf(location.hash.slice(1))))</script></body></html>`
}
