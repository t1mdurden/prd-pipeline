#!/usr/bin/env node
// pin — one command that turns a running dev server into a surface you can point at.
//
//   node scripts/pin.mjs --dir ~/Documents/GitHub/foji
//
// It finds the dev server, puts itself in front of it, and injects the overlay into every HTML
// response it proxies. Nothing is installed into the project: no plugin, no script tag, no
// dependency, no change that could ever reach a production build. Open the URL it prints instead
// of the app's own and alt-click something.
//
// That indirection is the whole reason this file exists. The overlay has always worked; getting it
// ONTO the page was the part every project had to solve for itself, and it solved it by editing
// vite.config.ts — a build-tool coupling in a tool whose entire claim is that it has none.
//
// Pins append to <dir>/.superdesign/pins.jsonl, one JSON object per line. Read them with
// scripts/pin-report.mjs. Binds 127.0.0.1 only — it is a dev sink, never a service.
//
// That file is an append-only LOG, not a list: an edit and a delete arrive as new records carrying
// the same `id`, so the current set of pins is a fold over it. GET /__sd_pins serves that fold, so
// nothing but this file and pin-report.mjs ever has to know the difference.
//
// It accepts JSON from any localhost origin, because the proxy is not the only way in — a project
// that already injects the overlay itself posts cross-origin from :1420 to :7332. It therefore
// treats every field as untrusted: the body is size-capped, the parse is guarded, and the
// destination path is fixed at startup — nothing in a request can influence where a byte lands.
//
//   --dir <path>    where .superdesign/pins.jsonl goes            (default: cwd)
//   --app <url>     the dev server to front                       (default: probe the usual ports)
//   --port <n>      the port to serve on                          (default: 7332)
//   --no-proxy      serve the overlay and catch pins, front nothing
//   --no-open       do not open a browser

import { createServer, request as httpRequest } from 'node:http'
import { connect } from 'node:net'
import { spawn } from 'node:child_process'
import { appendFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const MAX_BODY = 512 * 1024 // a pin is ~2-6 KB; 512 KB is 100x headroom and still bounded

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : fallback
}
const has = (name) => process.argv.includes(`--${name}`)

const port = Number(arg('port', 7332))
const targetDir = resolve(arg('dir', process.cwd()).replace(/^~/, process.env.HOME ?? '~'))
const outDir = join(targetDir, '.superdesign')
const outFile = join(outDir, 'pins.jsonl')
const overlayPath = join(HERE, 'pin-overlay.js')

if (!existsSync(overlayPath)) {
  console.error(`pin: cannot find ${overlayPath}`)
  process.exit(1)
}
mkdirSync(outDir, { recursive: true })

// ── the app we sit in front of ───────────────────────────────────────────────────────────────

// The ports a dev server actually listens on, most-likely first. Probing beats asking: the one
// thing the user reliably does not want to type is the port of a server he already has running.
const DEFAULTS = [5173, 3000, 1420, 4321, 5174, 4200, 8080, 3001, 8000, 5000]

// But probing the defaults ALONE fronts whichever project answers first, which on a machine with
// two dev servers up is a coin toss — run from foji, whose Vite is pinned to 1420, and the sweep
// hands you the Next app on 3000 with foji's name on the pins file. So ask the project first: the
// port is almost always written down in it, and a config that says `port: 1420` outranks any
// guess. Deliberately a grep and not a parser — these files are TypeScript, JSON and shell, and
// the only thing wanted from them is a number.
const PORT_PATTERNS = [/\bport\s*[:=]\s*["']?(\d{2,5})/gi, /--port[= ](\d{2,5})/g, /(?:localhost|127\.0\.0\.1):(\d{2,5})/g]
const CONFIGS = [
  'vite.config.ts', 'vite.config.js', 'vite.config.mjs', 'vite.config.mts',
  'astro.config.ts', 'astro.config.mjs', 'svelte.config.js', 'nuxt.config.ts',
  'src-tauri/tauri.conf.json', 'package.json', '.env', '.env.local', '.env.development',
]
const declaredPorts = () => {
  const found = []
  for (const f of CONFIGS) {
    let text = ''
    try {
      text = readFileSync(join(targetDir, f), 'utf8')
    } catch {
      continue
    }
    for (const re of PORT_PATTERNS) {
      for (const m of text.matchAll(re)) {
        const n = Number(m[1])
        // 1024 up, and never our own: a config naming 7332 would have us proxy ourselves.
        if (n > 1023 && n < 65536 && n !== port && !found.includes(n)) found.push(n)
      }
    }
  }
  return found
}

const DECLARED = declaredPorts()
const CANDIDATES = [...DECLARED, ...DEFAULTS.filter((p) => !DECLARED.includes(p))]

// Named from what the HTML admits to. Only ever printed — nothing branches on it — so a wrong
// guess costs a word, not a behaviour.
const flavour = (html) =>
  /\/@vite\/client/.test(html)
    ? 'vite'
    : /__NEXT_DATA__|\/_next\//.test(html)
      ? 'next'
      : /astro-island|\/_astro\//.test(html)
        ? 'astro'
        : /<script[^>]+src="\/@fs\//.test(html)
          ? 'vite'
          : 'http'

// `localhost`, never the 127.0.0.1 literal: Vite binds ::1 only, so half the dev servers this is
// meant to find answer on IPv6 and nothing else. Node resolves both families off the name.
//
// The timeout is generous on purpose and costs nothing: a port with nothing on it refuses the
// connection immediately, so this only ever waits on a server that ACCEPTED and is thinking. A
// Vite that has just been started is exactly that — its first request pays for dependency
// optimisation and can take well over a second — and 400ms here meant that starting the dev server
// and running this in the same breath reported "no dev server answered" about a server that was
// right there.
const probe = (p) =>
  new Promise((done) => {
    const req = httpRequest({ host: 'localhost', port: p, path: '/', method: 'GET', timeout: 2500 }, (res) => {
      const ct = res.headers['content-type'] ?? ''
      if (!ct.includes('text/html')) {
        res.resume()
        done(null)
        return
      }
      let head = ''
      res.on('data', (c) => {
        head += c
        if (head.length > 8192) res.destroy()
      })
      const answer = () => done({ port: p, flavour: flavour(head) })
      res.on('close', answer)
      res.on('end', answer)
    })
    req.on('timeout', () => {
      req.destroy()
      done(null)
    })
    req.on('error', () => done(null))
    req.end()
  })

// Sequential, not raced: the FIRST candidate that answers is the answer, and Promise.all would
// resolve them in whatever order the loopback felt like.
const findApp = async () => {
  const explicit = arg('app', null)
  if (explicit) {
    const u = new URL(explicit.includes('://') ? explicit : `http://${explicit}`)
    return { port: Number(u.port || 80), flavour: 'http', host: u.hostname, why: 'as given' }
  }
  for (const p of CANDIDATES) {
    if (p === port) continue // never front ourselves
    const hit = await probe(p)
    if (hit) return { ...hit, host: 'localhost', why: DECLARED.includes(p) ? 'from this project' : 'found by probe' }
  }
  return null
}

// ── the log ──────────────────────────────────────────────────────────────────────────────────

// Replay the log. A record with no `id` predates the log format and folds through unchanged, so
// every pins.jsonl written before today still reads. The same fold lives in pin-report.mjs — two
// consumers, ~14 lines each; a third is when it becomes a module.
const fold = (lines) => {
  const order = []
  const byId = new Map()
  let legacy = 0
  for (const raw of lines) {
    let r
    try {
      r = JSON.parse(raw)
    } catch {
      continue
    }
    if (!r.id) {
      // A key no UUID can collide with, so a legacy pin keeps its slot in document order — and it
      // is STAMPED onto the record, not just used to file it. Every verb in the inventory addresses
      // a row by `p.id`; a pin served without one renders four buttons that all return before they
      // post, so the queue holds rows the UI that shows them cannot edit, close or remove. The key
      // has to round-trip for a `delete` op to have something to name.
      const k = `legacy-${legacy++}`
      order.push(k)
      byId.set(k, { ...r, id: k })
      continue
    }
    const op = r.op ?? 'pin'
    if (op === 'pin') {
      if (!byId.has(r.id)) order.push(r.id)
      byId.set(r.id, r)
    } else if (op === 'edit') {
      const p = byId.get(r.id)
      if (p) {
        p.said = r.said
        p.editedAt = r.at
      }
    } else if (op === 'reanchor') {
      // Everything about WHERE, replaced; the sentence and the slot in document order, kept. `op`
      // is dropped so the folded record still reads as a pin to anything downstream that only ever
      // knew about pins.
      const p = byId.get(r.id)
      if (p) {
        const { op: _op, id: _id, at, ...rest } = r
        Object.assign(p, rest, { reanchoredAt: at })
      }
    } else if (op === 'done' || op === 'undone') {
      const p = byId.get(r.id)
      if (p) p.doneAt = op === 'done' ? r.at : null
    } else if (op === 'delete') {
      byId.delete(r.id)
    }
  }
  return order.map((k) => byId.get(k)).filter(Boolean)
}

// Any localhost port is a legitimate dev origin; anything else is not. Under the proxy every
// request is same-origin and carries no Origin header at all, which is the `'*'` branch.
const allowOrigin = (origin) => {
  if (!origin) return '*'
  try {
    const u = new URL(origin)
    return ['localhost', '127.0.0.1', '[::1]', 'tauri.localhost'].includes(u.hostname) ? origin : null
  } catch {
    return null
  }
}

const cors = (res, origin) => {
  const allowed = allowOrigin(origin)
  if (!allowed) return false
  res.setHeader('access-control-allow-origin', allowed)
  res.setHeader('access-control-allow-headers', 'content-type')
  res.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS')
  return true
}

let n = 0
let app = null

// ── the proxy ────────────────────────────────────────────────────────────────────────────────

const TAG = `<script src="/pin-overlay.js"></script>`

// Before </head> if there is one, because the overlay's own script is deferred by nothing and an
// app that paints on DOMContentLoaded should find the host already appended. </body> is the
// fallback for a document that has no head, and a bare append is the fallback for one that is not
// a document at all — a fragment returned to a client-side router, say, which still has to get the
// tag or a full reload would be the only way to arm the overlay again.
const inject = (html) => {
  // Any mention at all, not just our own tag: a project that already arms the overlay from its own
  // build config gets a second copy otherwise, and the overlay's re-entry guard reads a second load
  // as the toggle keystroke — so injecting twice turns the tool OFF.
  if (html.includes('pin-overlay.js')) return html
  for (const close of ['</head>', '</body>']) {
    const i = html.lastIndexOf(close)
    if (i > -1) return html.slice(0, i) + TAG + html.slice(i)
  }
  return html + TAG
}

const proxy = (req, res) => {
  const headers = { ...req.headers, host: `${app.host}:${app.port}` }
  // The one header that must not survive. We cannot know a response is HTML until it arrives, and
  // by then a gzip stream is not something this file is going to inflate to insert one tag. On
  // loopback the compression bought nothing anyway.
  delete headers['accept-encoding']
  const up = httpRequest({ host: app.host, port: app.port, path: req.url, method: req.method, headers }, (ur) => {
    const out = { ...ur.headers }
    // A dev server that redirects names its OWN origin, which would walk the user straight off the
    // proxy and back onto the un-instrumented app. Both spellings of loopback, because which one a
    // server puts in a Location header has nothing to do with which one we dialled.
    if (out.location) {
      for (const h of new Set([app.host, 'localhost', '127.0.0.1', '[::1]'])) {
        out.location = out.location.replaceAll(`${h}:${app.port}`, `127.0.0.1:${port}`)
      }
    }
    if (!(out['content-type'] ?? '').includes('text/html')) {
      res.writeHead(ur.statusCode, out)
      ur.pipe(res)
      return
    }
    const chunks = []
    ur.on('data', (c) => chunks.push(c))
    ur.on('end', () => {
      const html = inject(Buffer.concat(chunks).toString('utf8'))
      out['content-length'] = Buffer.byteLength(html)
      delete out['content-encoding']
      res.writeHead(ur.statusCode, out)
      res.end(html)
    })
  })
  up.on('error', () => {
    if (res.headersSent) return
    res.writeHead(502, { 'content-type': 'text/plain' })
    res.end(`pin: nothing answered at http://${app.host}:${app.port} — is the dev server still up?\n`)
  })
  req.pipe(up)
}

const server = createServer((req, res) => {
  const origin = req.headers.origin
  const ours = req.url === '/' || req.url.startsWith('/pin-overlay.js') || req.url.startsWith('/__sd_pin')

  // Only OUR routes answer for their own CORS. Proxied responses carry the app's headers, and
  // stamping an allow-origin onto them would be this file rewriting the app's security posture.
  if (ours) {
    if (!cors(res, origin)) {
      res.writeHead(403).end('bad origin')
      return
    }
    if (req.method === 'OPTIONS') {
      res.writeHead(204).end()
      return
    }
  }

  if (req.method === 'GET' && req.url.startsWith('/pin-overlay.js')) {
    res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' })
    // Where to post. Under the proxy the page and the sink share an origin, so the empty string is
    // both correct and immune to which hostname the user typed; injected into a page on the app's
    // own port there is no such luck and the literal has to carry the port this run chose.
    res.end(
      `window.__sdPinSink=location.port===${JSON.stringify(String(port))}?'':'http://127.0.0.1:${port}';\n` +
        readFileSync(overlayPath),
    )
    return
  }

  // The inventory the overlay hydrates from on every page load. `resolved` is stripped: the list
  // shows a sentence and an element, never a resolution, and it is ~4 KB of the ~4.5 KB a pin
  // weighs — 200 unstripped pins would be most of a megabyte on every reload. No path, query or
  // body field reaches the filesystem here; outFile is still the one fixed at startup.
  if (req.method === 'GET' && req.url === '/__sd_pins') {
    let lines = []
    try {
      lines = readFileSync(outFile, 'utf8').split('\n').filter(Boolean)
    } catch {
      /* nothing pinned yet — an empty inventory, not an error */
    }
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
    res.end(JSON.stringify(fold(lines).map(({ resolved, ...rest }) => rest)))
    return
  }

  if (req.method === 'POST' && req.url.startsWith('/__sd_pin')) {
    let body = ''
    let over = false
    req.on('data', (c) => {
      body += c
      if (body.length > MAX_BODY) {
        over = true
        req.destroy()
      }
    })
    req.on('end', () => {
      if (over) return
      let pin
      try {
        pin = JSON.parse(body)
      } catch {
        res.writeHead(400).end('bad json')
        return
      }
      appendFileSync(outFile, `${JSON.stringify(pin)}\n`)
      n++
      // An edit and a delete carry no identity and no resolution, so the pin line would print them
      // as `[?] "" · no token resolved` — three fields of nothing that read like a broken pin.
      const op = pin?.op ?? 'pin'
      if (op === 'pin' || op === 'reanchor') {
        const t = pin?.identity?.slot ?? pin?.identity?.tag ?? '?'
        const first = Object.entries(pin?.resolved ?? {}).find(([, r]) => r.tokens?.length)
        const tok = first ? `${first[0]} → ${first[1].tokens[0].token}` : 'no token resolved'
        const verb = op === 'reanchor' ? `re-aim ${String(pin?.id ?? '?').slice(0, 6)} → ` : ''
        console.log(`  ${String(n).padStart(3)}  ${verb}[${t}] ${JSON.stringify(pin?.said ?? '')}  ·  ${tok}`)
      } else {
        const said = op === 'edit' ? `  →  ${JSON.stringify(pin?.said ?? '')}` : ''
        console.log(`  ${String(n).padStart(3)}  ${op} ${String(pin?.id ?? '?').slice(0, 6)}${said}`)
      }
      res.writeHead(204).end()
    })
    return
  }

  if (req.url === '/' && !app) {
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end(`pin\npins → ${outFile}\ncaught: ${n}\nno app in front — started with --no-proxy, or nothing was listening\n`)
    return
  }

  if (app) {
    proxy(req, res)
    return
  }
  res.writeHead(404).end('nope')
})

// HMR is a websocket, and a proxy that drops it leaves the user editing a file and watching a page
// that never updates — which reads as the pin tool having broken the dev server. Raw socket splice
// rather than a ws library, because this file has no dependencies and an upgrade is just bytes.
server.on('upgrade', (req, socket, head) => {
  if (!app) {
    socket.destroy()
    return
  }
  const up = connect(app.port, app.host, () => {
    const lines = [`${req.method} ${req.url} HTTP/1.1`]
    for (let i = 0; i < req.rawHeaders.length; i += 2) {
      const k = req.rawHeaders[i]
      lines.push(`${k}: ${k.toLowerCase() === 'host' ? `${app.host}:${app.port}` : req.rawHeaders[i + 1]}`)
    }
    up.write(`${lines.join('\r\n')}\r\n\r\n`)
    if (head?.length) up.write(head)
    up.pipe(socket)
    socket.pipe(up)
  })
  up.on('error', () => socket.destroy())
  socket.on('error', () => up.destroy())
})

const openBrowser = (url) => {
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open'
  try {
    spawn(cmd, [url], { stdio: 'ignore', detached: true }).unref()
  } catch {
    /* no browser to open is not a reason to not serve */
  }
}

app = has('no-proxy') ? null : await findApp()

// A pin left running by an earlier session is the most likely thing on this port, and an unhandled
// EADDRINUSE prints a Node stack trace at somebody whose only crime was starting the tool twice.
server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`\n  pin: something is already listening on 127.0.0.1:${port}.`)
    console.error(`  It is probably a pin from an earlier session. Stop it:\n`)
    console.error(`      pkill -f pin.mjs\n`)
    console.error(`  or run this one somewhere else with --port <n>.\n`)
    process.exit(1)
  }
  console.error(`pin: ${e.message}`)
  process.exit(1)
})

server.listen(port, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${port}`
  console.log(`\n  superdesign pin\n`)
  if (app) {
    // Say WHY this one. A port the project itself declares is a fact; a port that merely answered
    // is a guess, and the user is the only one who can tell which app is his.
    console.log(`  app     http://${app.host}:${app.port}  (${app.flavour}, ${app.why})`)
    console.log(`  open →  ${url}`)
  } else if (has('no-proxy')) {
    console.log(`  overlay ${url}/pin-overlay.js  —  add it to the dev page yourself`)
  } else {
    console.log(`  no dev server answered on ${CANDIDATES.join(', ')}.`)
    console.log(`  start one and restart this, or pass --app http://127.0.0.1:<port>.`)
    console.log(`  serving the overlay at ${url}/pin-overlay.js meanwhile.`)
  }
  console.log(`  pins    ${outFile}`)
  console.log(`\n  alt-click an element · alt+shift+drag where one is missing · alt+shift+P toggles\n`)
  if (app && !has('no-open')) openBrowser(url)
})
