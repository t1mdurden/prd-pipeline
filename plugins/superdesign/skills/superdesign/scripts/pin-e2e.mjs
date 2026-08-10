#!/usr/bin/env node
// pin-e2e — take a real pin, in a real browser, against a running dev server.
//
// Not a feature: this is the gate. Every claim the pin loop makes — the overlay loaded, the
// alt-click resolved a rule, the panel opened, the POST landed a line in pins.jsonl — is a claim
// about a rendered page talking to a live socket, and nothing short of a rendered page talking to
// a live socket can check it. So each step of the pin work is proved by running this and counting
// lines, never by reading the diff.
//
//   node scripts/pin-e2e.mjs --click 'aside button:nth-of-type(3)' --say 'this is too loud'
//   node scripts/pin-e2e.mjs --click 'aside' --say 'a kanban goes here' --mods Alt,Shift
//   node scripts/pin-e2e.mjs --scenario inventory
//
// Playwright is not a dependency of this repo and is not going to become one — it is borrowed
// from whichever project is being pinned. PW_ROOT names that node_modules. A static import cannot
// take a computed path, so the import is dynamic.
//
// Exit 0 = the pin landed. 1 = it did not, and the message says why. 2 = the scenario name is
// real but the feature it exercises has not been built yet.

const PW_ROOT = process.env.PW_ROOT ?? '/Users/admin/Documents/GitHub/foji/.ds-sync/node_modules'

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : fallback
}

const die = (msg, code = 1) => {
  console.error(`pin-e2e: ${msg}`)
  process.exit(code)
}

const url = arg('url', 'http://localhost:1420')
const clickSel = arg('click', null)
const said = arg('say', null)
const mods = arg('mods', 'Alt')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

// Awaiting the POST is not politeness: the caller's next act is a line count, and an append that
// has not happened yet is indistinguishable from a write that never happened at all. Every write
// the overlay makes — a pin, an edit, a delete — goes through this.
const clickAndPost = async (page, locator, what) => {
  const posted = page
    .waitForResponse((r) => r.url().includes('/__sd_pin') && r.request().method() === 'POST', { timeout: 10000 })
    .catch(() => null)
  await locator.click()
  const res = await posted
  if (!res) throw new Error(`${what}: the sink never answered POST /__sd_pin — is pin.mjs still running?`)
  if (res.status() >= 300) throw new Error(`${what}: the sink rejected it — HTTP ${res.status()}`)
  return res
}

// One pin, end to end.
const takePin = async (page, sel, text, modifiers = ['Alt']) => {
  // Playwright's own timeout message does not name the selector, and a gate whose failure line
  // does not say what it was pointing at costs the reader a re-run to find out.
  await page.click(sel, { modifiers }).catch((e) => {
    throw new Error(`alt-click ${JSON.stringify(sel)}: ${String(e?.message ?? e).split('\n')[0]}`)
  })
  // page.locator's CSS engine pierces open shadow roots, so both of these reach inside the
  // overlay's without an escape hatch. The literals are the ones in pin-overlay.js:279-280 — read
  // them there before changing either, because a rename in the markup silently turns this gate
  // into a 30-second timeout that looks like a broken overlay.
  const box = page.locator('textarea[placeholder^="what is wrong"]')
  try {
    await box.waitFor({ state: 'visible', timeout: 5000 })
  } catch {
    throw new Error(`alt-click on ${JSON.stringify(sel)} never opened the panel`)
  }
  await box.fill(text)

  // The button, not Enter — a keystroke aimed at the textarea is retargeted at the shadow boundary
  // and whether it reaches the window-level capture listener depends on how it was dispatched;
  // some drivers never get there. The button does not care. pin-overlay.js says the same.
  const res = await clickAndPost(page, page.locator('button.commit'), `pin ${JSON.stringify(text)}`)

  // Read the record the overlay itself kept. A 204 proves a byte left the page; this proves the
  // page built something worth sending.
  const rec = await page.evaluate(() => {
    const p = window.__sdPins.at(-1)
    return {
      // The id, not the sentence, is how the caller names this pin again later: two runs of this
      // gate put two pins saying "one" in the same file, and only one of them is the one just taken.
      id: p?.id ?? null,
      said: p?.said ?? null,
      tag: p?.identity?.slot ?? p?.identity?.tag ?? (p?.anchor ? `+${p.anchor.parent?.tag}` : '?'),
      tokened: Object.values(p?.resolved ?? {}).filter((r) => r.tokens?.length).length,
    }
  })
  if (rec.said !== text) throw new Error(`the overlay recorded ${JSON.stringify(rec.said)}, not ${JSON.stringify(text)}`)
  console.log(
    `  pin  [${rec.tag}] ${JSON.stringify(rec.said)}  ·  ${rec.tokened} tokened propert${rec.tokened === 1 ? 'y' : 'ies'}  ·  sink ${res.status()}`,
  )
  return rec
}

// A row's verbs are absolutely positioned and pointer-events:none until the row is hovered, so an
// invisible button can never eat a click. A driver that jumps straight to the button therefore
// fails the actionability check — correctly. Hover first, which is the only way a hand can reach
// one anyway.
const rowButton = async (page, id, cls) => {
  const row = page.locator(`#sd-pin-overlay li.row[data-id="${id}"]`)
  await row.hover()
  return row.locator(`button.${cls}`)
}

// Uncaught exceptions out of the page, which a scenario reads to prove the overlay left the host
// alone. Not a blanket assertion: foji throws `transformCallback` at load all by itself, its Tauri
// event streams being un-mocked in a browser. A scenario empties this immediately before the act it
// means to hold responsible.
const pageErrors = []

// The scenario table. A NUMBER instead of a function is a scenario whose feature does not exist
// yet, and the number is the commit that builds it; that step replaces the number with the
// function. Registering them now rather than later means a caller walking the plan gets "not built
// yet" (exit 2) instead of "unknown scenario", which is the difference between being early and
// being wrong.
const scenarios = {
  // The default. One pin is the whole gate for the resolver work: it proves the overlay loaded,
  // the click resolved, the panel opened, and the sink appended a line.
  single: (page) => takePin(page, clickSel, said, mods),

  // The inventory, and the only claim in it that matters: a pin the user edited and a pin the user
  // deleted still read that way after the tab is thrown away. Two pins go in, one sentence is
  // rewritten through the panel, the other pin is tombstoned, and then the page is reloaded and
  // asked what it knows — which by then can only have come back from the sink.
  inventory: async (page) => {
    const one = (await takePin(page, 'aside button >> nth=2', 'one')).id
    const two = (await takePin(page, 'aside button >> nth=3', 'two')).id
    if (!one || !two) throw new Error('the overlay minted no id for a pin — nothing can be edited or deleted')

    // #sd-pin-overlay scopes every one of these to the overlay's own shadow root, so a host page
    // with its own .chip or .row cannot answer for it. Playwright's CSS engine pierces open roots.
    await page.locator('#sd-pin-overlay .chip').click()
    // Every pin the overlay holds gets a row — the two just taken plus whatever hydration brought
    // back from earlier sessions, which is the point of the list.
    const shown = await page.locator('#sd-pin-overlay li.row').count()
    // The OPEN ones. A pin marked done is still held and still in the file; the list is where it
    // stops being carried, so counting rows against every pin would fail the moment one is closed.
    const held = await page.evaluate(() => window.__sdPinOverlay.pins.filter((p) => !p.doneAt).length)
    if (shown !== held) throw new Error(`the list shows ${shown} rows for ${held} open pins`)
    console.log(`  list  ${shown} rows`)

    await (await rowButton(page, one, 'ed')).click()
    const boxEl = page.locator('textarea[placeholder^="what is wrong"]')
    await boxEl.waitFor({ state: 'visible', timeout: 5000 })
    if ((await boxEl.inputValue()) !== 'one') throw new Error('edit opened the panel without the sentence in it')
    await boxEl.fill('one edited')
    await clickAndPost(page, page.locator('button.commit'), 'edit')
    console.log('  edit  "one" → "one edited"')

    await clickAndPost(page, await rowButton(page, two, 'rm'), 'delete')
    console.log('  del   "two"')

    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => window.__sdPinOverlay, null, { timeout: 15000 })
    await page.evaluate(() => window.__sdPinOverlay.hydrated)
    const after = await page.evaluate(async () => {
      const base = window.__sdPinSink ?? 'http://127.0.0.1:7332'
      const folded = await (await fetch(`${base}/__sd_pins`)).json()
      return { inPage: window.__sdPinOverlay.pins.length, folded: folded.map((p) => ({ id: p.id, said: p.said })) }
    })
    const survivor = after.folded.find((p) => p.id === one)
    console.log(
      `  reload  in-page ${after.inPage} · folded ${after.folded.length} · ${one.slice(0, 6)} says ${JSON.stringify(survivor?.said ?? null)}` +
        ` · ${two.slice(0, 6)} ${after.folded.some((p) => p.id === two) ? 'STILL THERE' : 'gone'}`,
    )
    if (after.inPage !== after.folded.length) {
      throw new Error(`after reload the overlay holds ${after.inPage} pins, the sink folds to ${after.folded.length}`)
    }
    if (survivor?.said !== 'one edited') throw new Error(`the edit did not survive: ${JSON.stringify(survivor?.said ?? null)}`)
    if (after.folded.some((p) => p.id === two)) throw new Error('the deleted pin came back')
  },

  // The pins that predate `id`. `fold` already invents a stable key for a record written before the
  // overlay minted one — and keeps it, so the row is served with no id at all. Every inventory verb
  // addresses a row BY id (`row.dataset.id = p.id ?? ''`), so on such a row all four look alive and
  // all four return before they post: the queue holds pins the UI that shows them cannot remove.
  // Two claims, and the first is the whole bug: a legacy pin arrives WITH an id, and `del` on it
  // survives a reload.
  legacy: async (page) => {
    const mark = `legacy fixture ${Date.now()}`
    // Straight into the sink, shaped the way pins were shaped before ids: no `id`, no `op`.
    await page.evaluate(async (s) => {
      const base = window.__sdPinSink ?? 'http://127.0.0.1:7332'
      await fetch(`${base}/__sd_pin`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          said: s,
          at: new Date().toISOString(),
          url: location.href,
          route: location.pathname,
          identity: { tag: 'div', path: 'body > div' },
          classes: '',
          box: { x: 0, y: 0, width: 10, height: 10 },
          resolved: {},
        }),
      })
    }, mark)

    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => window.__sdPinOverlay, null, { timeout: 15000 })
    await page.evaluate(() => window.__sdPinOverlay.hydrated)
    const seen = await page.evaluate((s) => window.__sdPinOverlay.pins.find((p) => p.said === s) ?? null, mark)
    if (!seen) throw new Error('the legacy pin never reached the overlay')
    if (!seen.id) throw new Error('a legacy pin arrived with no id — every verb keys by id, so nothing can address it')
    console.log(`  legacy  id ${JSON.stringify(seen.id)}`)

    await page.locator('#sd-pin-overlay .chip').click()
    await clickAndPost(page, await rowButton(page, seen.id, 'rm'), 'delete')
    console.log(`  del     ${JSON.stringify(mark)}`)

    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => window.__sdPinOverlay, null, { timeout: 15000 })
    await page.evaluate(() => window.__sdPinOverlay.hydrated)
    const folded = await page.evaluate(async () => {
      const base = window.__sdPinSink ?? 'http://127.0.0.1:7332'
      return await (await fetch(`${base}/__sd_pins`)).json()
    })
    console.log(`  reload  folded ${folded.length}`)
    if (folded.some((p) => p.said === mark)) throw new Error('the deleted legacy pin came back')
  },

  // The rail. A popover that shuts on every reload is a popover you reopen once per pin, which is
  // the whole of "I have to keep clicking": the dev server reloads the page under you and the list
  // you were working in is gone. Three claims — it docks to the edge at full height, acting on a
  // row leaves it open, and it is still open after a reload it did not ask for.
  rail: async (page) => {
    const mark = `rail fixture ${Date.now()}`
    await takePin(page, 'aside button >> nth=2', mark)

    const shadow = '#sd-pin-overlay'
    await page.locator(`${shadow} .chip`).click()
    const geom = await page.evaluate(() => {
      const sr = document.querySelector('#sd-pin-overlay').shadowRoot
      const r = sr.querySelector('.rail').getBoundingClientRect()
      return { top: r.top, right: Math.round(r.right), h: Math.round(r.height), vw: innerWidth, vh: innerHeight }
    })
    if (geom.top !== 0 || geom.right !== geom.vw || geom.h !== geom.vh) {
      throw new Error(`the rail is not docked: top ${geom.top}, right ${geom.right}/${geom.vw}, height ${geom.h}/${geom.vh}`)
    }
    console.log(`  dock    right edge, ${geom.h}px tall`)

    // The act that used to cost the list. `done` rather than `del`, so the pin is still there to
    // be counted afterwards.
    const id = await page.evaluate((s) => window.__sdPinOverlay.pins.find((p) => p.said === s)?.id, mark)
    await clickAndPost(page, await rowButton(page, id, 'dn'), 'done')
    if (!(await page.locator(`${shadow} .rail`).isVisible())) throw new Error('acting on a row closed the rail')
    console.log('  act     done, rail still open')

    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => window.__sdPinOverlay, null, { timeout: 15000 })
    await page.evaluate(() => window.__sdPinOverlay.hydrated)
    await page.waitForTimeout(300)
    if (!(await page.locator(`${shadow} .rail`).isVisible())) throw new Error('the rail did not survive a reload')
    console.log('  reload  rail still open')

    // Leave the queue as it was found. A done pin is behind the doneline, which is where the list
    // stops carrying it — so open that first, or there is no row to delete.
    await page.locator(`${shadow} .doneline`).click().catch(() => {})
    await clickAndPost(page, await rowButton(page, id, 'rm'), 'delete')
    console.log('  clean   fixture deleted')
  },

  // Navigation, on an app that has none to speak of. foji's URL is `/` on every screen, so a screen
  // change is invisible to `location` and visible only in the DOM — which makes it the honest test:
  // if the overlay can tell these two screens apart it can tell any two apart. Three claims, in
  // order: an alt-click never reaches the host's own mousedown handler, a half-typed panel does not
  // outlive the element it is about, and the two pins land under two different view keys.
  nav: async (page) => {
    // The title strip drags the window on mousedown (foji lib/drag.ts:22) and throws in a browser,
    // where __TAURI_INTERNALS__ is undefined. Pinning it must open the panel and cost the host
    // nothing. Escape, so this costs the file no line either.
    pageErrors.length = 0
    await page.keyboard.down('Alt')
    await page.mouse.click(700, 18)
    await page.keyboard.up('Alt')
    const panel = page.locator('#sd-pin-overlay .panel')
    await panel.waitFor({ state: 'visible', timeout: 5000 })
    if (pageErrors.length) throw new Error(`alt-clicking the title strip threw into the host: ${pageErrors[0]}`)
    console.log('  chrome  alt-click on the title strip pinned it, host saw nothing')
    await page.keyboard.press('Escape')

    const before = await page.evaluate(() => ({ view: window.__sdPinOverlay.view(), route: location.pathname }))
    const first = await takePin(page, 'h1', 'the wordmark is too big')

    // A frozen panel, deliberately left half-typed on an element the coming screen change unmounts.
    // The LAST card, not the first: foji's three cards now share one rect, so nth=0 is covered by
    // its own siblings and Playwright waits ten seconds for a click that can never land. Any of the
    // three proves the claim — the one on top is the only one that can be clicked at all.
    await page.click('button.card >> nth=-1', { modifiers: ['Alt'] })
    await page.locator('textarea[placeholder^="what is wrong"]').waitFor({ state: 'visible', timeout: 5000 })

    // A plain click on the sidebar's Kanban row. No pushState, no popstate, no hashchange, no
    // URL: React swaps the main pane and the MutationObserver is the only thing that ever hears.
    //
    // The label is foji's, and foji renames its sidebar — this row was Workspaces until it wasn't,
    // and a row that no longer exists fails as a ten-second click timeout that reads like the
    // overlay having broken. When that happens, re-derive it rather than guessing: click each
    // `aside button` on a fresh load and keep the one after which `__sdPinOverlay.view()` differs.
    await page.locator('aside button').filter({ hasText: 'Kanban' }).first().click()
    try {
      await panel.waitFor({ state: 'hidden', timeout: 5000 })
    } catch {
      throw new Error('the screen changed and the panel stayed open over an unmounted element')
    }
    const after = await page.evaluate(() => ({ view: window.__sdPinOverlay.view(), route: location.pathname }))
    if (after.route !== before.route) throw new Error(`the URL moved (${before.route} → ${after.route}) — this is not the case being tested`)
    if (after.view === before.view) throw new Error(`the screen changed and the view key did not: still ${JSON.stringify(after.view)}`)
    console.log(`  nav   route ${after.route} unchanged · view ${before.view} → ${after.view} · frozen panel cleared`)

    const second = await takePin(page, 'h2', 'this heading is lonely')
    const got = await page.evaluate(
      (ids) => ids.map((id) => window.__sdPinOverlay.pins.find((p) => p.id === id) ?? {}),
      [first.id, second.id],
    )
    if (got[0].view !== before.view || got[1].view !== after.view) {
      throw new Error(`the pins recorded ${JSON.stringify(got.map((p) => p.view))}, not the views they were taken on`)
    }
    if (got[0].route !== got[1].route) throw new Error('two routes on an app that has one')
    console.log(`  pins  ${got[0].route} · ${new Set(got.map((p) => p.view)).size} views`)
  },

  // Add pins. The claim is not that a box was drawn — it is that a point between two elements came
  // back as a parent, an index, and the two siblings either side of it. That is the whole
  // difference between "instead create kanban here" alt-clicked onto the nearest button and a
  // brief someone can build from without asking which of three things was meant.
  add: async (page) => {
    const geo = await page.evaluate(() => {
      // The sidebar: a real flex column, present on every foji screen, whose children are six
      // siblings rather than one blob — so an index into it can be right or wrong, which is what
      // makes it worth asserting.
      const aside = document.querySelector('aside')
      const kids = [...(aside?.children ?? [])]
      if (kids.length < 2) return null
      const [a, b] = [kids[0].getBoundingClientRect(), kids[1].getBoundingClientRect()]
      return {
        childCount: kids.length,
        from: { x: Math.round(a.left + 12), y: Math.round(a.top + 6) },
        gap: { x: Math.round(a.left + a.width / 2), y: Math.round((a.bottom + b.top) / 2) },
      }
    })
    if (!geo) throw new Error('no <aside> with two children to draw between — has foji\'s sidebar changed?')

    // A modifier click with no drag is the same gesture with a zero-size box. Proving that costs
    // pins.jsonl no line: the panel opens, the anchor line is in it, and Escape throws it away.
    await page.keyboard.down('Alt')
    await page.keyboard.down('Shift')
    await page.mouse.click(geo.gap.x, geo.gap.y)
    await page.keyboard.up('Shift')
    await page.keyboard.up('Alt')
    const anchorLine = page.locator('#sd-pin-overlay .why .anchor')
    try {
      await anchorLine.waitFor({ state: 'visible', timeout: 5000 })
    } catch {
      throw new Error('alt+shift+click with no drag resolved no anchor')
    }
    console.log(`  point ${JSON.stringify(await anchorLine.textContent())}`)
    await page.keyboard.press('Escape')

    // And now the drag: down on the first sidebar child, up in the gap below it. The anchor must
    // come from where the mouse went UP, not from where it started, or a drag that begins on a
    // button can only ever mean that button.
    await page.keyboard.down('Alt')
    await page.keyboard.down('Shift')
    await page.mouse.move(geo.from.x, geo.from.y)
    await page.mouse.down()
    await page.mouse.move(geo.gap.x, geo.gap.y, { steps: 8 })
    await page.mouse.up()
    await page.keyboard.up('Shift')
    await page.keyboard.up('Alt')

    const box = page.locator('textarea[placeholder^="what is wrong"]')
    try {
      await box.waitFor({ state: 'visible', timeout: 5000 })
    } catch {
      throw new Error('alt+shift+drag in the sidebar never opened the panel')
    }
    await box.fill('a kanban board goes here')
    const res = await clickAndPost(page, page.locator('button.commit'), 'add pin')

    const rec = await page.evaluate(() => {
      const p = window.__sdPinOverlay.pins.at(-1)
      return { kind: p?.kind ?? null, identity: p?.identity ?? null, anchor: p?.anchor ?? null, resolved: Object.keys(p?.resolved ?? {}).length }
    })
    const a = rec.anchor
    if (rec.kind !== 'add') throw new Error(`the pin came back as kind ${JSON.stringify(rec.kind)}, not "add"`)
    if (rec.identity) throw new Error('an add pin identified an element — the point of it is that there is not one')
    if (!a) throw new Error('the add pin carries no anchor')
    if (a.type !== 'index') throw new Error(`the sidebar resolved to ${JSON.stringify(a.type)} — is it still a flex column?`)
    if (!a.parent?.unique) throw new Error(`the parent path ${JSON.stringify(a.parent?.path)} matches more than one node`)
    if (!a.before?.text || !a.after?.text) {
      throw new Error(`the anchor named no siblings: ${JSON.stringify([a.before?.text, a.after?.text])}`)
    }
    if (a.index !== 1) throw new Error(`the gap under the first child resolved to index ${a.index}, not 1`)
    console.log(
      `  add   ${a.type} ${a.index} of ${a.childCount} · axis ${a.axis} · into ${a.parent.tag} (unique) · ` +
        `${JSON.stringify([a.before.text, a.after.text])} · drawn ${a.drawn.width}×${a.drawn.height} · ` +
        `${rec.resolved} parent properties · sink ${res.status()}`,
    )
  },

  // Closing the loop. Two claims, and both are about what the log says after the tab is gone:
  // a pin can be re-pointed at a different element without losing its sentence, and a pin can be
  // marked done, which takes it out of the list without taking it out of the file. Until these
  // existed a pin could only be edited or destroyed — so a fixed one was either clutter or lost
  // context, and one whose element had moved could only be mourned.
  close: async (page) => {
    const aimed = (await takePin(page, 'h1', 'the wordmark is too big')).id
    const fixed = (await takePin(page, 'aside button >> nth=2', 'this row is too quiet')).id
    if (!aimed || !fixed) throw new Error('the overlay minted no id for a pin')
    const wasPath = await page.evaluate(
      (id) => window.__sdPinOverlay.pins.find((p) => p.id === id)?.identity?.path ?? null,
      aimed,
    )

    await page.locator('#sd-pin-overlay .chip').click()

    // Re-aim. The row's own button arms it; the next alt-click is the new element; commit writes
    // one `reanchor` record naming the same id.
    await (await rowButton(page, aimed, 'aim')).click()
    const boxEl = page.locator('textarea[placeholder^="what is wrong"]')
    await boxEl.waitFor({ state: 'visible', timeout: 5000 })
    if ((await boxEl.inputValue()) !== 'the wordmark is too big') {
      throw new Error('re-aim opened the panel without the sentence it is re-aiming')
    }
    // The sidebar, not another heading: what is asserted is that the pin MOVED, and moving it onto
    // something of the same tag would prove nothing. Which node in the row the pointer lands on is
    // the app's business — alt-click takes the topmost, so a button whose label is a span pins the
    // span — so the claim is about the path, not the tag.
    await page.click('aside button >> nth=3', { modifiers: ['Alt'] })
    await clickAndPost(page, page.locator('button.commit'), 're-aim')
    const moved = await page.evaluate(
      (id) => {
        const p = window.__sdPinOverlay.pins.find((x) => x.id === id)
        return { tag: p?.identity?.tag ?? null, path: p?.identity?.path ?? null, said: p?.said ?? null }
      },
      aimed,
    )
    if (moved.tag === 'h1') throw new Error('re-aim left the pin on the h1 it was pointed away from')
    if (moved.path === wasPath) throw new Error(`re-aim recorded the same path it started with: ${JSON.stringify(wasPath)}`)
    if (moved.said !== 'the wordmark is too big') throw new Error(`re-aim ate the sentence: ${JSON.stringify(moved.said)}`)
    console.log(`  aim   ${aimed.slice(0, 6)} h1 → ${moved.tag} in the sidebar, sentence kept`)

    // Done. The row leaves the list and the count moves to the filter; nothing is deleted.
    // Relative, never absolute: two runs of this gate append to one pins.jsonl, so the box already
    // holds whatever the last run closed. What is being asserted is the delta.
    const rows = () => page.locator('#sd-pin-overlay li.row').count()
    const doneCount = () => page.evaluate(() => window.__sdPinOverlay.pins.filter((p) => p.doneAt).length)
    const before = await rows()
    const wasDone = await doneCount()
    await clickAndPost(page, await rowButton(page, fixed, 'dn'), 'done')
    const after = await rows()
    if (after !== before - 1) throw new Error(`marking one pin done left ${after} rows, not ${before - 1}`)
    await page.locator('#sd-pin-overlay .doneline').click()
    const shown = await page.locator('#sd-pin-overlay li.row.done').count()
    if (shown !== wasDone + 1) throw new Error(`the filter showed ${shown} done rows, not ${wasDone + 1}`)
    console.log(`  done  ${before} rows → ${after}, filter brings ${shown} back`)

    // The only claim that matters: both survive the tab being thrown away.
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => window.__sdPinOverlay, null, { timeout: 15000 })
    await page.evaluate(() => window.__sdPinOverlay.hydrated)
    const folded = await page.evaluate(
      async ([a, f]) => {
        const base = window.__sdPinSink ?? 'http://127.0.0.1:7332'
        const all = await (await fetch(`${base}/__sd_pins`)).json()
        const A = all.find((p) => p.id === a)
        const F = all.find((p) => p.id === f)
        return {
          aimedTag: A?.identity?.tag ?? null,
          aimedPath: A?.identity?.path ?? null,
          aimedSaid: A?.said ?? null,
          aimedText: A?.identity?.text ?? null,
          fixedDone: !!F?.doneAt,
          fixedSaid: F?.said ?? null,
        }
      },
      [aimed, fixed],
    )
    if (folded.aimedTag === 'h1' || folded.aimedPath === wasPath) {
      throw new Error(`after reload the re-aimed pin is back at ${JSON.stringify(folded.aimedPath)}`)
    }
    if (folded.aimedSaid !== 'the wordmark is too big') throw new Error(`re-aim ate the sentence: ${JSON.stringify(folded.aimedSaid)}`)
    if (!folded.fixedDone) throw new Error('after reload the done pin is not done')
    if (folded.fixedSaid !== 'this row is too quiet') throw new Error('done ate the sentence')
    console.log(`  fold  re-aimed → <${folded.aimedTag}> ${JSON.stringify(folded.aimedText)} · done pin still says ${JSON.stringify(folded.fixedSaid)}`)
  },
}

const name = arg('scenario', 'single')
const scenario = scenarios[name]
if (!scenario) die(`unknown scenario ${JSON.stringify(name)} — one of: ${Object.keys(scenarios).join(', ')}`)
if (typeof scenario === 'number') die(`scenario '${name}' needs commit ${scenario}`, 2)
if (name === 'single' && !(clickSel && said)) die('single-pin mode needs --click <selector> and --say <text>')

const { chromium } = await import(`${PW_ROOT}/playwright/index.mjs`).catch(() =>
  die(`no playwright under ${PW_ROOT} — set PW_ROOT to a node_modules that has it`),
)

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1512, height: 739 } })
page.setDefaultTimeout(10000)
page.on('pageerror', (e) => pageErrors.push(String(e?.message ?? e).split('\n')[0]))
try {
  // Not networkidle: a vite dev server holds an HMR connection open, and the overlay arrives on
  // its own fetch after load anyway. The wait below is the real gate.
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  try {
    await page.waitForFunction(() => window.__sdPinOverlay, null, { timeout: 15000 })
  } catch {
    throw new Error(
      `window.__sdPinOverlay never appeared at ${url}. The page fetches the overlay from the sink, ` +
        'so this is almost always the sink being down: node scripts/pin.mjs --dir <project>',
    )
  }
  const version = await page.evaluate(() => window.__sdPinOverlay.version)
  console.log(`pin-e2e: ${url} · overlay v${version} · scenario '${name}'`)
  await scenario(page)
} catch (e) {
  await browser.close()
  die(String(e?.message ?? e).split('\n')[0])
}
await browser.close()
console.log('pin-e2e: ok')
