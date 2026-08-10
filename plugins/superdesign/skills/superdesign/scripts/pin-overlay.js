// pin-overlay — point at a rendered element, get back the TOKEN that owns it.
//
// The problem this solves is not "let the user click things". It is that a design complaint
// arrives as a sentence about a screen ("this is too loud") and gets fixed as a className patch
// on one node — which SKILL.md:278-281 calls a defect, not a preference. The fix almost always
// belongs one or two layers up: in the token, or in the cva variant. Nothing in a screenshot
// tells you which. The CSSOM does.
//
//   getComputedStyle CANNOT name the token: the computed value is the specified value with
//   var() already substituted, so `oklch(0.53 0.17 240)` arrives with `--primary` erased
//   (drafts.csswg.org/css-variables-1). The DECLARED value survives in CSSOM and names it
//   exactly. So: walk the sheets, find the winning rule per property, pull the var() names out
//   of the declared text, read them off :root. Measured at 1.3ms over 14 matched rules.
//
// Zero dependencies, zero build step, no framework coupling — it never asks what rendered the
// page. That is deliberate: React 19 deleted the fiber source path (facebook/react#28265), so
// every click-to-source tool built on `_debugSource` broke and React shipped no replacement.
// This one never needed it.
//
//   Delivery A (nothing at all):   paste into devtools, or have the agent inject it.
//   Delivery B (one command):      node scripts/pin.mjs --dir <project>. It finds the dev server,
//                                  proxies it, and injects this file into every page it serves —
//                                  so a project gets pinning without a plugin, a script tag, or a
//                                  single line of its own changed.
//
// Alt-click an element. Type one sentence. Enter. Pins land in window.__sdPins and, when the
// sink is up, in .superdesign/pins.jsonl. Read them with scripts/pin-report.mjs.
//
// A pin taken leaves a numbered marker on the element, the way a comment does in Figma or in
// Vercel's toolbar: the question a second pass actually asks is "what have I already said about
// this screen", and a tool whose only answer is a file cannot be asked it while looking at the
// screen. Hover a marker for the sentence; click it to rewrite it.
//
// Click the corner chip for everything pinned so far, grouped by the screen it was taken on: hover
// a row to light its element up again, edit the sentence, delete it. That list is hydrated from
// the sink on every load, so it survives a reload. With no sink the chip says `offline` and the
// list holds only what this tab has taken — same as it always did, but now it admits it.
//
// "The screen it was taken on" is observed, not asked for: most apps worth pinning route in React
// state and never move the URL, so a pin records a view key read off the DOM alongside the route.
// When the app changes screens — by any route it has, or by none — the highlight and the panel go
// with it rather than hanging over an element that has been unmounted.
//
// Alt+SHIFT+drag draws a box where an element is MISSING instead. That pin names no element —
// there is not one yet — it names the parent that would hold it, which index between which two
// siblings, and the box that was drawn. Nothing is written to the app: what comes back is a brief
// precise enough to build from, which is the one thing "instead create kanban here" alt-clicked
// onto the nearest button never was.
//
// Esc cancels · Alt+↑/↓ walks the occlusion stack (label → button → card) · Alt+Shift+P toggles.

;(() => {
  if (window.__sdPinOverlay) {
    window.__sdPinOverlay.toggle()
    return
  }

  // The sink is wherever the overlay was served from — pin.mjs stamps `__sdPinSink` on the copy it
  // hands out (empty when the page is coming through its own proxy, so the two share an origin and
  // CORS never enters into it), which is what keeps a non-default `--port` from leaving the page
  // posting into a dead one. The literal is only the fallback for Delivery A, where nobody served
  // anything.
  const SINK = `${window.__sdPinSink ?? 'http://127.0.0.1:7332'}/__sd_pin`
  // The same sink, read side. It answers with the FOLD over pins.jsonl — deletes applied, edits
  // applied, resolutions stripped — so the overlay never has to know the file is a log.
  const SINK_LIST = `${window.__sdPinSink ?? 'http://127.0.0.1:7332'}/__sd_pins`
  const ACCENT = '#ff2d55'

  // Properties worth resolving. Everything a design complaint is ever actually about; anything
  // outside this set is noise that would triple the pin size for no decision value.
  const INTERESTING = new Set([
    'color', 'background-color', 'background-image', 'border-color', 'border-top-color',
    'border-bottom-color', 'border-left-color', 'border-right-color', 'border-width',
    'border-radius', 'border-top-left-radius', 'outline-color', 'outline-width',
    'box-shadow', 'opacity', 'font-family', 'font-size', 'font-weight', 'line-height',
    'letter-spacing', 'text-transform', 'padding', 'padding-top', 'padding-bottom',
    'padding-left', 'padding-right', 'margin', 'margin-top', 'margin-bottom', 'gap',
    'width', 'height', 'min-height', 'max-width', 'transition-duration',
    'transition-timing-function', 'animation-duration', 'backdrop-filter', 'filter',
  ])

  // ── CSSOM walk ─────────────────────────────────────────────────────────────────────────
  // One pass collects both halves: the rules matching THIS element, and every custom-property
  // declaration in the document. The second half is what makes the sibling-token scan possible
  // in-page — four tokens can carry a byte-identical value, and editing one silently leaves the
  // other three behind (assets/theme.css: --primary, --ring, --sidebar-primary, --sidebar-ring).

  let blockedSheets = 0

  function collect(el) {
    const hits = []
    const tokens = new Map() // "--name @ :root" -> {token, value, declaredAt}

    const walk = (rules, ctx, parentSel) => {
      for (const r of rules) {
        // CSSStyleRule ALSO carries .cssRules now that CSS Nesting shipped. A naive
        // `if (r.cssRules) recurse` therefore short-circuits every style rule and matches
        // NOTHING. Test selectorText first, recurse into the nested block second.
        if (r.selectorText) {
          harvestTokens(r)
          // A nested rule's selectorText is relative: `&` means "the parent compound", and the
          // parent is only known here, on the way down. Substituting :is(parent) is the one form
          // that survives a comma-separated parent. With no parent to substitute there is nothing
          // to test this element against — and Chromium answers el.matches('&') with true, which
          // is how all 104 of foji's nested rules matched every element on the page.
          const abs = /&/.test(r.selectorText)
            ? parentSel
              ? r.selectorText.replace(/&/g, `:is(${parentSel})`)
              : null
            : r.selectorText
          let m = false
          if (abs) {
            try {
              m = el.matches(stripPseudoState(abs))
            } catch {
              m = false
            }
          }
          if (m) hits.push({ sel: abs, ctx, style: r.style, state: stateOf(r.selectorText) })
          if (r.cssRules?.length) walk(r.cssRules, m ? [...ctx, abs] : ctx, abs ?? parentSel)
          continue
        }
        // CSSNestedDeclarations — a bare declaration block inside a nested @media or @supports.
        // It has no selector and no children, so both branches around it skip it, and Tailwind v4
        // puts the payload of every `hover:` utility exactly there, behind @media (hover: hover).
        // The declarations belong to the enclosing selector, which is what parentSel holds.
        if (!r.cssRules && r.style?.length && parentSel) {
          let m = false
          try {
            m = el.matches(stripPseudoState(parentSel))
          } catch {
            m = false
          }
          if (m) hits.push({ sel: parentSel, ctx, style: r.style, state: stateOf(parentSel) })
          continue
        }
        if (r.cssRules) {
          walk(r.cssRules, [...ctx, r.conditionText ?? r.name ?? String(r.constructor.name)], parentSel)
        }
      }
    }

    const harvestTokens = (r) => {
      const s = r.style
      for (let i = 0; i < s.length; i++) {
        const p = s[i]
        if (!p.startsWith('--')) continue
        tokens.set(`${p} @ ${r.selectorText}`, {
          token: p,
          value: s.getPropertyValue(p).trim(),
          declaredAt: r.selectorText,
        })
      }
    }

    blockedSheets = 0
    for (const sheet of document.styleSheets) {
      // Cross-origin and file:// sheets are not origin-clean; .cssRules throws SecurityError
      // (drafts.csswg.org/cssom). Silently returning nothing here would look identical to
      // "this element has no styles", so it is counted and surfaced instead.
      try {
        walk(sheet.cssRules, [], null)
      } catch {
        blockedSheets++
      }
    }
    // Inline style wins over everything the sheets said.
    if (el.getAttribute('style')) hits.push({ sel: '[style]', ctx: ['inline'], style: el.style, state: null })

    return { hits, tokens: [...tokens.values()] }
  }

  // The interaction pseudo-classes, as one list because two things need it and they must agree
  // about what counts. Order matters: `focus` ahead of `focus-visible` strips `:focus` out of
  // `:focus-visible` and leaves `-visible` behind as a class name that matches nothing.
  const STATES = 'hover|focus-visible|focus-within|focus|active|visited|target'
  const ANY_STATE = new RegExp(`:(?:${STATES})\\b`, 'g')
  const FIRST_STATE = new RegExp(`:(${STATES})\\b`)

  // querySelectorAll cannot take :hover/:focus-visible and el.matches() would be false for them
  // anyway. Strip the interaction pseudo-classes so a `hover:` utility still resolves to its rule.
  const stripPseudoState = (sel) => sel.replace(ANY_STATE, '')

  // ...and then name what was stripped, so the rule can be filed under its state rather than let
  // into the race for the resting value. The walk reads it off the RAW selector text of a nested
  // rule — `&:active` says `active` — and off the absolutised parent for a bare declaration block,
  // which has no selector of its own to read.
  const stateOf = (sel) => sel.match(FIRST_STATE)?.[1] ?? null

  // ── resolution ─────────────────────────────────────────────────────────────────────────

  function resolve(el) {
    if (!el || el.nodeType !== 1) return { resolved: {}, blockedSheets: 0, matchedRules: 0, tokenCount: 0 }
    const { hits, tokens } = collect(el)
    const root = getComputedStyle(document.documentElement)
    const comp = getComputedStyle(el)
    const byValue = new Map()
    for (const t of tokens) {
      if (!t.value) continue
      if (!byValue.has(t.value)) byValue.set(t.value, [])
      byValue.get(t.value).push(t)
    }

    // Winner per property = the LAST matching rule that declares it. Cascade order within one
    // element is document order for equal specificity, and Tailwind emits utilities in one layer,
    // so last-wins is right far more often than a hand-rolled specificity sort would be.
    //
    // A rule that only applies while the element is hovered, focused or held down is not a
    // candidate in that race — its value is not on screen. Being last in the document it used to
    // win every time, which is how `&:active` came to be the answer to "what owns this button's
    // background". It is kept, per property, under `states`: the user did point at this element,
    // and "the pressed state is the loud one" is a complaint the pin must still be able to carry.
    const winners = new Map()
    const states = new Map()
    for (const h of hits) {
      for (let i = 0; i < h.style.length; i++) {
        const p = h.style[i]
        if (!INTERESTING.has(p)) continue
        const declared = h.style.getPropertyValue(p)
        if (h.state) {
          if (!states.has(p)) states.set(p, [])
          states.get(p).push({ state: h.state, sel: h.sel, declared: declared.trim() })
          continue
        }
        winners.set(p, { prop: p, sel: h.sel, ctx: h.ctx, declared })
      }
    }

    const resolved = {}
    for (const w of winners.values()) {
      const names = [...w.declared.matchAll(/var\(\s*(--[\w-]+)/g)].map((m) => m[1])
      const toks = names.map((n) => {
        const value = root.getPropertyValue(n).trim()
        const decl = tokens.filter((t) => t.token === n).map((t) => t.declaredAt)
        // The sibling set: other tokens carrying a byte-identical value. Editing one and not
        // these is a half-applied change that looks fixed on this screen and is broken two
        // routes away.
        const siblings = (byValue.get(value) ?? [])
          .filter((t) => t.token !== n)
          .map((t) => t.token)
        return { token: n, value, declaredAt: [...new Set(decl)], siblings: [...new Set(siblings)] }
      })
      resolved[w.prop] = {
        sel: w.sel,
        ctx: w.ctx,
        declared: w.declared.trim(),
        computed: comp.getPropertyValue(w.prop).trim(),
        tokens: toks.filter((t) => !isPlumbing(t)),
        plumbing: toks.filter(isPlumbing).map((t) => t.token),
        states: states.get(w.prop) ?? [],
        blast: blastRadius(w.sel),
      }
    }
    return { resolved, blockedSheets, matchedRules: hits.length, tokenCount: tokens.length }
  }

  // `--tw-*` are Tailwind's internal composition slots, not the project's design system. A ring or
  // shadow utility declares five of them at once, almost always empty or `0 0 #0000`, and left in
  // they crowd every real token off the panel — measured on foji, where a card's entire readout was
  // three `--tw-*-shadow = 0 0 #0000` rows and nothing else. They are kept, under `plumbing`, so a
  // pin never silently drops a property; they just stop competing for the eye.
  const NOOP = /^(0 0 #0+|none|normal|auto|initial)$/i
  const isPlumbing = (t) => t.token.startsWith('--tw-') || !t.value || NOOP.test(t.value)

  // How many nodes, and how many DISTINCT components, this rule reaches. This one number decides
  // which layer the fix belongs in — see references/critique.md § The pointed-at defect.
  function blastRadius(sel) {
    if (sel === '[style]') return { nodes: 1, slots: [], scope: 'inline' }
    // A `&` that reached this far is one the walk could not absolutise. querySelectorAll answers
    // it with [HTML] rather than throwing, so the catch below never fires and the rule looks like
    // it reaches exactly one node — which the reader then calls a call-site override. Refuse.
    if (/&/.test(sel)) return { nodes: -1, slots: [], scope: 'unqueryable' }
    let nodes = []
    try {
      nodes = [...document.querySelectorAll(stripPseudoState(sel))]
    } catch {
      return { nodes: -1, slots: [], scope: 'unqueryable' }
    }
    const slots = [...new Set(nodes.map((n) => n.closest('[data-slot]')?.dataset.slot).filter(Boolean))]
    return {
      nodes: nodes.length,
      slots,
      scope: slots.length > 1 ? 'token' : slots.length === 1 ? 'variant' : 'node',
    }
  }

  // ── identity ───────────────────────────────────────────────────────────────────────────
  // What the model needs to find the source. data-slot is shipped by every shadcn primitive;
  // where it is absent (foji has no shadcn) the class list plus the DOM path is enough for one
  // grep, and data-sd-loc fills in if a build plugin is ever added.

  function identify(el) {
    const owner = el.closest('[data-slot]')
    return {
      tag: el.tagName.toLowerCase(),
      slot: el.dataset.slot ?? null,
      ownerSlot: owner && owner !== el ? owner.dataset.slot : null,
      variant: el.dataset.variant ?? owner?.dataset.variant ?? null,
      size: el.dataset.size ?? owner?.dataset.size ?? null,
      loc: el.dataset.sdLoc ?? null,
      testid: el.dataset.testid ?? null,
      id: el.id || null,
      role: el.getAttribute('role'),
      ariaLabel: el.getAttribute('aria-label'),
      text: (el.textContent ?? '').trim().slice(0, 80) || null,
      path: domPath(el),
      paths: candidates(el),
    }
  }

  // One selector is one bet. `domPath` is positional — six tags and nth-of-type — so a card moving
  // from third to second child breaks it, and every pin taken before that edit reads `could not
  // locate` forever. Vercel's toolbar stores FOUR validated selectors per comment for exactly this
  // reason. These are ordered by how much a re-render can move them: an id or a test id survives a
  // reorder, a class list survives a reorder but not a restyle, the path survives a restyle but not
  // a reorder. locateRow takes the first that resolves to exactly one node.
  const esc = (s) => (typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(s) : s)
  const candidates = (el) => {
    const tag = el.tagName.toLowerCase()
    const out = []
    if (el.id) out.push(`#${esc(el.id)}`)
    if (el.dataset.testid) out.push(`[data-testid="${esc(el.dataset.testid)}"]`)
    if (el.dataset.sdLoc) out.push(`[data-sd-loc="${esc(el.dataset.sdLoc)}"]`)
    const aria = el.getAttribute('aria-label')
    if (aria) out.push(`${tag}[aria-label="${aria.replace(/["\\]/g, '\\$&')}"]`)
    out.push(domPath(el))
    const cls = (typeof el.className === 'string' ? el.className : '').trim().split(/\s+/).filter(Boolean)
    // Tailwind class names are full of `:`, `/` and `[]`, none of which are legal bare in a
    // selector — CSS.escape is the only correct way to spell one back.
    if (cls.length) out.push(tag + cls.map((c) => `.${esc(c)}`).join(''))
    return [...new Set(out)]
  }

  function domPath(el) {
    const parts = []
    for (let n = el; n && n.nodeType === 1 && parts.length < 6; n = n.parentElement) {
      let s = n.tagName.toLowerCase()
      if (n.id) {
        parts.unshift(`${s}#${n.id}`)
        break
      }
      if (n.dataset.slot) s += `[data-slot=${n.dataset.slot}]`
      const sibs = n.parentElement ? [...n.parentElement.children].filter((c) => c.tagName === n.tagName) : []
      if (sibs.length > 1) s += `:nth-of-type(${sibs.indexOf(n) + 1})`
      parts.unshift(s)
    }
    return parts.join(' > ')
  }

  // ── UI ─────────────────────────────────────────────────────────────────────────────────

  const host = document.createElement('div')
  // Identity, not just a handle for the e2e driver: elementsFromPoint and elementFromPoint both
  // have to exclude this subtree, and an id is the one way to say "that thing" from outside it.
  host.id = 'sd-pin-overlay'
  host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none'
  const shadow = host.attachShadow({ mode: 'open' })
  shadow.innerHTML = `
    <style>
      /* Every colour, radius, duration and font in this file is one of these. A literal below this
         block is a bug: onlook ships two reds, two purples and two type scales because its tokens
         live in three files, and a single-file overlay has no excuse for the same. */
      :host {
        all: initial;
        --a: ${ACCENT};                    /* the accent. It means "the pin tool", nothing else */
        --a-soft: rgba(255,45,85,.18);
        --warn: #f5a524;                   /* a pixel no token owns — see paint() */
        --s0: rgba(15,15,18,.84);          /* the floating surface, over its own blur */
        --s1: rgba(255,255,255,.055);      /* a row under the pointer */
        --line: rgba(255,255,255,.10);     /* hairline. 1px reads as a frame; .5px reads as an edge */
        --t0: #f5f5f7; --t1: #a3a3ad; --t2: #66666f;
        --r: 11px; --r-sm: 6px;
        --ui: system-ui,-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;
        --mono: ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
        /* Two rings, then the shadow. A single hairline can only be right against one kind of app:
           the light one vanishes on a white page and the dark one vanishes on a black one, and this
           overlay is injected into whatever the user happens to be building. Vercel's toolbar draws
           both for the same reason. */
        --shadow: 0 0 0 .5px rgba(0,0,0,.55), 0 18px 44px -14px rgba(0,0,0,.7),
                  0 3px 10px -3px rgba(0,0,0,.45);
        --fast: 150ms cubic-bezier(.4,0,.2,1);   /* a state changed */
        --move: 300ms cubic-bezier(.4,0,.2,1);   /* something moved */
      }

      /* Every count in this file is tabular, so a badge does not jitter as it counts up — the one
         thing that makes a number in a chip look hand-built. */
      .mark, .list .n, .list .cnt, .panel .count { font-variant-numeric:tabular-nums }

      /* One surface recipe, three users. The blur is what stops a dark slab over a light app from
         reading as a modal — it stays a thing ON the page rather than a thing INSTEAD of it. */
      .panel, .rail, .chip {
        background:var(--s0); border:.5px solid var(--line); border-radius:var(--r);
        box-shadow:var(--shadow); color:var(--t0); font-family:var(--ui);
        -webkit-backdrop-filter:blur(20px) saturate(1.6); backdrop-filter:blur(20px) saturate(1.6);
      }

      /* The ring. An outline, not a border: a border is laid out INSIDE the width we just measured,
         so a 2px one shrinks the rect it is supposed to be describing by 4px. And no scrim — the
         old box-shadow:0 0 0 9999px dimmed the entire app to point at one element, which is the
         single thing that made this tool read as a debug tool. onlook never dims anything. */
      .box { position:fixed; display:none; pointer-events:none; border-radius:1px;
             outline:1px solid var(--a); transition:outline-color var(--fast) }
      .box.sel { outline-width:2px }
      .box.untokened { outline-color:var(--warn) }
      .box.draw { outline:1.5px dashed var(--a); background:var(--a-soft) }

      .tag { position:fixed; display:none; pointer-events:none; white-space:nowrap;
             font:500 11px/1 var(--ui); color:#fff; background:var(--a);
             padding:4px 7px; border-radius:var(--r-sm);
             box-shadow:0 2px 8px -2px rgba(0,0,0,.5) }
      .tag .dim { font:400 10px var(--mono); opacity:.66; margin-left:6px }
      .tag.untokened { background:var(--warn); color:#1c1400 }

      /* Above the list: the list is a place to look, the panel is a place to type, and the one
         you are typing into is never the one that gets covered. */
      .panel { position:fixed; z-index:3; pointer-events:auto; display:none; width:322px;
               overflow:hidden }
      .panel header { display:flex; align-items:center; gap:8px; padding:10px 12px 9px }
      .panel header .dot { flex:none; width:7px; height:7px; border-radius:99px; background:var(--a) }
      .panel header .ttl { font:600 12px/1 var(--ui); color:var(--t0) }
      .panel header .sub { margin-left:auto; font:400 10px var(--mono); color:var(--t2) }

      /* The resolved half. Wonder sets its property panel in the UI sans and reserves mono for the
         value — the label is prose, the value is code — and that one split is most of why a panel
         of numbers reads as designed rather than dumped. */
      .panel .why { padding:0 12px 2px; max-height:184px; overflow:auto }
      .panel .why .tk { display:grid; grid-template-columns:auto 1fr; gap:1px 10px;
                        padding:7px 0; border-top:.5px solid var(--line) }
      .panel .why .tk:first-child { border-top:0 }
      .panel .why .p { font:400 11px/1.4 var(--ui); color:var(--t2); white-space:nowrap }
      .panel .why .v { font:500 11px/1.4 var(--mono); color:var(--t0);
                       overflow:hidden; text-overflow:ellipsis }
      .panel .why .v b { color:var(--a); font-weight:600 }
      .panel .why .b { grid-column:2; font:400 10px/1.4 var(--ui); color:var(--t2) }
      .panel .why .sib { grid-column:2; font:400 10px/1.4 var(--mono); color:var(--warn) }
      .panel .why .note { padding:7px 0; border-top:.5px solid var(--line);
                          font:400 11px/1.45 var(--ui); color:var(--t2) }
      .panel .why .anchor { padding:8px 0 7px; font:500 12px/1.4 var(--ui); color:var(--t0) }
      .panel .why .warn { color:var(--warn) }

      .panel textarea { display:block; width:100%; box-sizing:border-box; border:0;
                        border-top:.5px solid var(--line); background:transparent; color:var(--t0);
                        font:13px/1.5 var(--ui); padding:11px 12px; resize:none; outline:none;
                        caret-color:var(--a) }
      .panel textarea::placeholder { color:var(--t2) }
      .panel textarea::selection { background:var(--a-soft); color:#fff }

      .panel footer { display:flex; align-items:center; gap:10px; padding:9px 12px 10px;
                      border-top:.5px solid var(--line) }
      .panel footer .count { font:400 10px var(--mono); color:var(--t2) }
      .panel footer .kb { margin-left:auto; font:400 10px var(--ui); color:var(--t2) }
      .panel footer button { flex:none; font:600 11px var(--ui); color:#fff; background:var(--a);
                             border:0; padding:6px 11px; border-radius:var(--r-sm); cursor:pointer;
                             opacity:.32; transition:opacity var(--fast), transform var(--fast) }
      /* Quiet until there is a sentence to send. onlook dissolves the button out of the DOM at four
         characters; keeping it present and merely dim is the same signal without a layout jump — and
         without a driver having to know the threshold before it can click. */
      .panel footer button.ready { opacity:1 }
      .panel footer button:active { transform:scale(.97) }

      /* The launcher. It is the only part of this tool visible when nothing is happening, so it is
         the whole first impression: a status pill, not a debug badge. */
      .chip { position:fixed; right:14px; bottom:14px; z-index:2; pointer-events:auto; display:none;
              align-items:center; gap:8px; padding:7px 12px 7px 10px; border-radius:999px;
              cursor:pointer; user-select:none; font:500 12px/1 var(--ui);
              transition:transform var(--fast), border-color var(--fast), right var(--fast) }
      /* Out from under the rail it toggles. Same corner, same gap, measured off the rail's edge. */
      :host(.railed) .chip { right:340px }
      .chip:hover { transform:translateY(-1px); border-color:rgba(255,255,255,.2) }
      .chip .dot { flex:none; width:7px; height:7px; border-radius:99px; background:var(--a);
                   box-shadow:0 0 0 3px var(--a-soft) }
      .chip .hint { color:var(--t2); font-size:11px }
      .chip .off { color:var(--warn) }
      /* Off is a state, not an absence. Hiding the chip on toggle-off left the only way back a
         keystroke the user had to have memorised — the tool disappeared and took its own handle
         with it. */
      .chip.dim { color:var(--t1) }
      .chip.dim .dot { background:var(--t2); box-shadow:none }

      /* Where a pin already is. Nothing in the old overlay survived the commit — the sentence went
         to a file and the page forgot it, so the one question a reviewer actually asks ("what have
         I already said about this screen?") could only be answered by opening a list. Every tool
         that does this well leaves a marker on the thing. */
      .marks { position:fixed; inset:0; z-index:1; pointer-events:none }
      /* Three round corners and one sharp one, and the sharp one is the anchor — a comment pin has
         read that way since Figma, and it costs a border-radius instead of an SVG. The body hangs
         up and left of the corner it names, so it points at the element without covering it, and
         the transform-origin keeps that point nailed while the rest of it grows on hover. */
      .mark { position:absolute; pointer-events:auto; width:22px; height:22px;
              border-radius:50% 50% 2px 50%; transform-origin:bottom right;
              background:var(--a); color:#fff; font:700 11px/22px var(--ui); text-align:center;
              cursor:pointer;
              /* a white hairline, not a dark one: the marker has to survive a dark app too, and
                 Vercel's toolbar rings every bubble in white for exactly that reason */
              box-shadow:0 2px 10px -2px rgba(0,0,0,.5), 0 0 0 1.5px rgba(255,255,255,.92);
              transition:transform var(--fast) }
      .mark:hover { transform:scale(1.14) }
      .mark.add { background:var(--s0); color:var(--a);
                  -webkit-backdrop-filter:blur(12px); backdrop-filter:blur(12px);
                  box-shadow:0 2px 10px -2px rgba(0,0,0,.5), 0 0 0 1.5px var(--a) }
      /* Done is greyscale, never struck through and never smaller. Figma's rule, and the reason is
         that a resolved comment is still the record of why the screen looks the way it does. */
      .mark.done { background:var(--t2); color:var(--s0) }
      /* Only the pin just taken, and only once. Committing used to be silent — the sentence went to
         a file and the page said nothing back. Half a second of overshoot is the receipt. */
      .mark.new { animation:sd-drop .5s forwards }
      @keyframes sd-drop {
        0%   { opacity:0; transform:scale(.4) }
        30%  { opacity:1; transform:scale(1.16) }
        45%  { transform:scale(.94) }
        60%,100% { opacity:1; transform:scale(1) }
      }

      /* What the marker says when you point at it. A native title= takes a second to appear and is
         drawn by the OS in a font nothing here chose; this is the sentence, immediately. */
      .tip { position:fixed; z-index:4; display:none; pointer-events:none; max-width:264px;
             padding:8px 10px; border-radius:var(--r-sm); background:var(--s0);
             border:.5px solid var(--line); box-shadow:var(--shadow);
             -webkit-backdrop-filter:blur(20px) saturate(1.6);
             backdrop-filter:blur(20px) saturate(1.6);
             font:12px/1.45 var(--ui); color:var(--t0) }

      /* Scrolling is the one thing a fixed overlay cannot follow without a frame loop. onlook does
         not try: it drops every rect the instant a wheel moves and fades them back once the page
         settles. A tracking loop that is 16ms behind looks broken; a deliberate blink does not. */
      :host(.scrolling) .box, :host(.scrolling) .tag, :host(.scrolling) .marks {
        opacity:0; transition:none }
      .box, .tag, .marks { transition:opacity var(--fast) }

      /* The rail. It was a popover anchored to the chip, which is the right shape for a thing you
         open to check something and the wrong one for a thing you WORK in: 56vh of it scrolled,
         it closed on every screen change, and a triage pass of ten pins is ten reopenings. Figma
         and onlook both dock the comment list to the edge for the same reason. It floats ABOVE the
         page rather than pushing it: reflowing the host to make room would change the layout being
         judged, and the width of the thing under review is most of what is under review. */
      .rail { position:fixed; top:0; right:0; z-index:2; width:326px; height:100vh;
              display:none; flex-direction:column; pointer-events:auto;
              border-radius:0; border-width:0 0 0 .5px }
      .railhead { flex:none; display:flex; gap:8px; align-items:center; padding:13px 12px 10px;
                  border-bottom:.5px solid var(--line) }
      .railhead .rt { flex:none; font:600 11px var(--ui); letter-spacing:.07em;
                      text-transform:uppercase; color:var(--t1) }
      .railhead .rn { flex:1; font:400 11px var(--mono); color:var(--t2) }
      .railhead .rx { flex:none; border:0; background:transparent; padding:2px 5px; cursor:pointer;
                      border-radius:4px; font:400 12px/1 var(--ui); color:var(--t2);
                      transition:background var(--fast), color var(--fast) }
      .railhead .rx:hover { background:var(--s1); color:var(--t0) }
      /* Inside the rail now, so it carries none of the surface itself — one border, one blur, one
         shadow, on the rail. */
      .list { flex:1; min-height:0; overflow:auto; margin:0; padding:0 0 5px; list-style:none }
      .list .grp { position:sticky; top:0; z-index:1; display:flex; gap:8px; align-items:center;
                   padding:9px 12px 6px; background:var(--s0);
                   font:600 10px var(--ui); letter-spacing:.07em; text-transform:uppercase;
                   color:var(--t2) }
      .list .grp .vk { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
                       text-transform:none; letter-spacing:0; font:400 10px var(--mono) }
      .list .grp.now .rt { color:var(--a) }
      .list .grp .cnt { font:400 10px var(--mono) }
      .list .grp .go { border:0; background:transparent; padding:0; cursor:pointer;
                       font:600 10px var(--ui); letter-spacing:.07em; color:var(--a) }
      .list .row { position:relative; display:flex; gap:9px; align-items:center; margin:0 5px;
                   padding:7px 7px; border-radius:var(--r-sm); font:13px/1.4 var(--ui);
                   transition:background var(--fast) }
      .list .row:hover { background:var(--s1) }
      .list .row .n { flex:none; width:18px; height:18px; border-radius:999px 999px 999px 3px;
                      background:var(--a); color:#fff; font:700 10px/18px var(--ui);
                      text-align:center }
      .list .row.cold .n { background:var(--t2) }
      .list .said { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
                    color:var(--t0) }
      .list .row.cold .said { color:var(--t1) }
      .list .where { flex:none; max-width:40%; overflow:hidden; text-overflow:ellipsis;
                     white-space:nowrap; font:10px var(--mono); color:var(--t2) }
      /* Out of the flow, not merely transparent. Four buttons at opacity 0 still hold their width,
         and every one added squeezed the sentence — which is the content — a little further, until
         a row read "t.." beside a full selector. Absolute keeps the cost at zero until hover. */
      .list .acts { position:absolute; right:7px; top:50%; transform:translateY(-50%);
                    display:flex; gap:2px; opacity:0; pointer-events:none;
                    transition:opacity var(--fast) }
      .list .row:hover .acts { opacity:1; pointer-events:auto }
      /* The two live in the same slot, so a row never grows on hover and the list never reflows
         under the pointer that is about to click it. */
      .list .row:hover .where { display:none }
      .list .acts button { border:0; background:transparent; padding:3px 6px; border-radius:4px;
                           cursor:pointer; font:500 11px var(--ui); color:var(--t1) }
      .list .acts button:hover { background:rgba(255,255,255,.09); color:var(--t0) }
      .list .acts button.rm:hover { color:var(--a) }
      /* The way back to what has been dealt with. One row, at the top, and it is the only place a
         done pin is countable — the chip counts what is still open. */
      .list .doneline { display:flex; gap:8px; align-items:center; margin:5px 5px 0; padding:6px 7px;
                        border-radius:var(--r-sm); cursor:pointer; user-select:none;
                        font:500 12px/1 var(--ui); color:var(--t1);
                        transition:background var(--fast) }
      .list .doneline:hover { background:var(--s1) }
      .list .doneline .tick { flex:none; width:18px; height:18px; border-radius:999px;
                              background:var(--t2); color:var(--s0);
                              font:700 10px/18px var(--ui); text-align:center }
      .list .doneline .lbl { flex:1 }
      .list .doneline .act { font:500 11px var(--ui); color:var(--t2) }
      .list .doneline.open .act { color:var(--a) }
      .list .row.done .said { color:var(--t2) }
      .list .row.done .n { background:var(--t2); color:var(--s0) }
      .list .empty { padding:14px 14px 15px; font:12px/1.6 var(--ui); color:var(--t1) }
      .list .empty span { color:var(--t2) }
      kbd { font:500 10px var(--mono); color:var(--t0); background:rgba(255,255,255,.08);
            border:.5px solid var(--line); border-radius:4px; padding:2px 5px }
    </style>
    <div class="marks"></div>
    <div class="box"></div><div class="tag"></div><div class="tip"></div>
    <div class="panel">
      <header><span class="dot"></span><span class="ttl">pin</span><span class="sub"></span></header>
      <div class="why"></div>
      <textarea rows="2" placeholder="what is wrong with this?"></textarea>
      <footer><span class="count"></span><span class="kb">⏎ to pin · esc</span><button class="commit">pin it</button></footer>
    </div>
    <aside class="rail">
      <header class="railhead"><span class="rt">pins</span><span class="rn"></span><button class="rx" title="close the rail (the chip reopens it)">✕</button></header>
      <ol class="list"></ol>
    </aside>
    <div class="chip"></div>`

  const $ = (s) => shadow.querySelector(s)
  const box = $('.box')
  const tag = $('.tag')
  const panel = $('.panel')
  const head = $('.panel .ttl')
  const sub = $('.panel .sub')
  const why = $('.why')
  const input = $('textarea')
  const commitBtn = $('.commit')
  const list = $('.list')
  const rail = $('.rail')
  const railN = $('.railhead .rn')
  const chip = $('.chip')
  const marks = $('.marks')
  const tip = $('.tip')

  let on = false
  let stack = []
  let depth = 0
  let target = null
  let frozen = false
  let editing = null // the id of the pin whose sentence the panel is currently rewriting, or null
  let reaiming = null // the id of the pin the next commit re-points, or null
  let showDone = false // whether the list is showing the pins already marked done
  // Whether the rail is docked open. Persisted, because a rail that shuts on every reload is the
  // popover this stopped being: an HMR update, a route change or a restarted dev server would each
  // cost the user the click that reopens it, in the middle of the triage pass it exists for.
  // Storage can throw (a host that blocks it, an origin with no storage at all) — closed is the
  // safe answer, never a broken overlay.
  const RAIL_KEY = 'sd-pin-rail'
  const remember = (v) => {
    try {
      localStorage.setItem(RAIL_KEY, v ? '1' : '0')
    } catch {
      /* no storage on this origin — the rail is simply per-load */
    }
  }
  let listOpen = (() => {
    try {
      return localStorage.getItem(RAIL_KEY) === '1'
    } catch {
      return false
    }
  })()
  let offline = false
  let lastView = '' // the view key as of the last settled screen change — see onNav
  let justPinned = null // the id whose marker still owes the user an animation, or null
  let navT = 0
  let anchor = null // where an element the user drew is missing FROM, or null — see resolveAnchor
  let drawStart = null // the viewport point an alt+shift drag began at, while one is in flight
  const pins = (window.__sdPins = window.__sdPins || [])

  // A "view" is the coarsest thing that changes when the user changes screens. We do not know the
  // app's router — foji does not have one, its URL is `/` on every screen — so we ask the DOM
  // instead: what element under the centre of the viewport is big enough to BE the screen? Its tag
  // plus class list is the key. Measured on foji: five screens, five distinct keys, one URL.
  const viewKey = () => {
    const A = innerWidth * innerHeight
    // elementsFromPoint, not elementFromPoint: anything inside a shadow root is reported as its
    // HOST, so an open compose panel over the middle of the screen made the single-element form
    // return our own host — and climbing to its parent lands on <html>, which is 100% of the
    // viewport and therefore always wins. Two pins taken seconds apart then filed under two
    // different screens. The stack has the app's element underneath; take that one.
    let n = document.elementsFromPoint(innerWidth >> 1, innerHeight >> 1).find((e) => e !== host && !host.contains(e))
    for (; n && n.nodeType === 1; n = n.parentElement) {
      const r = n.getBoundingClientRect()
      if (r.width * r.height >= A * 0.6) {
        const cls = (typeof n.className === 'string' ? n.className : '').trim().split(/\s+/).filter(Boolean)
        return n.tagName.toLowerCase() + (cls.length ? `.${cls.slice(0, 6).join('.')}` : '')
      }
    }
    return 'none'
  }

  // What to call the thing being pointed at. onlook's rule, which is better than printing the tag
  // forever: a heading or a paragraph IS its text, so the tag name says nothing a reader wanted.
  const nameOf = (el, id) => {
    if (id.slot) return `[${id.slot}]`
    if (/^(h[1-6]|p|li|label|button|a)$/.test(id.tag)) {
      const t = (el.textContent ?? '').trim().replace(/\s+/g, ' ')
      if (t) return t.length > 26 ? `${t.slice(0, 26)}…` : t
    }
    return id.tag
  }

  // `sel` is the committed state — the element the panel is about — where a bare paint is the
  // pointer passing over. One number apart on purpose: two visual languages for hover and select
  // would say they are two different things, and they are the same thing a moment later.
  const paint = (el, { sel = false, untokened = false } = {}) => {
    const r = el.getBoundingClientRect()
    box.style.cssText += `;display:block;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px`
    box.classList.toggle('sel', sel)
    box.classList.toggle('untokened', untokened)
    box.classList.remove('draw')
    tag.classList.toggle('untokened', untokened)
    const id = identify(el)
    tag.textContent = ''
    tag.append(nameOf(el, id) + (id.variant ? ` ${id.variant}` : ''), mk('span', 'dim', `${Math.round(r.width)}×${Math.round(r.height)}`))
    // Show, then measure: the label is as wide as whatever it ended up saying, and a guessed width
    // is what puts it off the right edge on the one element whose name is long.
    tag.style.display = 'block'
    const tr = tag.getBoundingClientRect()
    tag.style.left = `${Math.min(Math.max(2, r.left), Math.max(2, innerWidth - tr.width - 2))}px`
    // Above by default, below when there is no room above — the same flip the panel makes, for the
    // same reason: the label of the topmost element on a page is exactly the one that needs it.
    tag.style.top = `${r.top - tr.height - 4 >= 2 ? r.top - tr.height - 4 : r.bottom + 4}px`
  }

  const clear = () => {
    box.style.display = 'none'
    box.className = 'box'
    tag.style.display = 'none'
    tag.className = 'tag'
    panel.style.display = 'none'
    frozen = false
    target = null
    editing = null
    reaiming = null
    anchor = null
    drawStart = null
    head.textContent = 'pin'
    sub.textContent = ''
    commitBtn.textContent = 'pin it'
    commitBtn.classList.remove('ready')
  }

  // Hovering a list row lights up the element that row names. Letting go has to put back whatever
  // was on screen before it, because a frozen panel is a sentence the user is halfway through and
  // moving its box out from under him is the tool getting in the way.
  const restore = () => {
    if (frozen && target) paint(target, { sel: true, untokened: !target.__sdRes?.tokenCount })
    else {
      box.style.display = 'none'
      tag.style.display = 'none'
    }
  }

  // One row per resolved property: the property name set as prose, the token and its value set as
  // code. Wonder's properties panel is the reference — a label column in the UI sans and a value
  // column in mono is most of the difference between a panel of numbers that reads as designed and
  // one that reads as a console dump.
  const summarize = (res) => {
    const rows = []
    for (const [prop, r] of Object.entries(res.resolved)) {
      if (!r.tokens.length) continue
      for (const t of r.tokens) {
        rows.push(
          `<div class="tk"><span class="p">${prop}</span>` +
            `<span class="v"><b>${t.token}</b> ${t.value || '?'}</span>` +
            `<span class="b">${r.blast.scope} · ${r.blast.nodes} node${r.blast.nodes === 1 ? '' : 's'}</span>` +
            (t.siblings.length ? `<span class="sib">same value: ${t.siblings.join(', ')}</span>` : '') +
            `</div>`,
        )
      }
    }
    const untokened = Object.entries(res.resolved)
      .filter(([, r]) => !r.tokens.length && !r.plumbing?.length)
      .map(([p]) => p)
    if (untokened.length) rows.push(`<div class="note warn">no token owns ${untokened.join(', ')} — this pin is a one-off unless the system grows one</div>`)
    const plumbed = Object.entries(res.resolved).filter(([, r]) => !r.tokens.length && r.plumbing?.length)
    if (plumbed.length) {
      rows.push(
        `<div class="note">${plumbed.length} propert${plumbed.length === 1 ? 'y' : 'ies'} carry only Tailwind's internal --tw-* slots (${plumbed.map(([p]) => p).join(', ')}) — plumbing, not design</div>`,
      )
    }
    if (res.blockedSheets) {
      rows.unshift(
        `<div class="note warn">${res.blockedSheets} stylesheet(s) unreadable — cross-origin or file://. Serve over http://localhost.</div>`,
      )
    }
    return rows.join('') || '<div class="note warn">nothing resolved</div>'
  }

  // Put the panel beside a rectangle — the element being critiqued, or the parent an add pin is
  // going into. Show, THEN measure: the why-block is variable height, so any guessed constant
  // clips the textarea off the bottom of the viewport exactly when the thing pinned sits low.
  const openPanel = (r) => {
    panel.style.display = 'block'
    panel.style.left = `${Math.min(Math.max(8, r.left), Math.max(8, innerWidth - 330))}px`
    panel.style.top = '0px'
    const h = panel.getBoundingClientRect().height
    const below = r.bottom + 8
    const top = below + h <= innerHeight - 8 ? below : r.top - h - 8 >= 8 ? r.top - h - 8 : innerHeight - h - 8
    panel.style.top = `${Math.max(8, top)}px`
    input.focus()
  }

  const select = (el) => {
    target = el
    // Pointing at an element that exists retires an anchor for one that does not. Two answers to
    // "what is this pin about" cannot both be live, and the later gesture is the one meant.
    anchor = null
    const res = resolve(el)
    // Resolve before painting, because the ring's colour is the answer. onlook spends hue on
    // "component instance or plain DOM"; the only distinction that changes what happens next here
    // is whether a token owns the pixel — accent means the fix has a layer, amber means it does not
    // and the pin is asking for a system that is not there yet.
    paint(el, { sel: true, untokened: !res.tokenCount })
    why.innerHTML = summarize(res)
    target.__sdRes = res
    $('.count').textContent = `${res.matchedRules} rules · ${res.tokenCount} tokens`
    openPanel(el.getBoundingClientRect())
  }

  // ── add-element anchors ────────────────────────────────────────────────────────────────
  // The other half of a design complaint: not "this is wrong" but "something is missing here". A
  // pin saying that cannot name an element, because the element does not exist. So it names the
  // parent that would hold it and the gap it goes in — which is what a brief has to say before
  // anyone can write the JSX, and what alt-clicking the nearest button can never say.

  // Tags that can only hold inline content. Drawing on top of a button means "next to this button",
  // never "inside it", so the resolution climbs out of every one of these before it starts asking
  // about children. Onlook's INLINE_ONLY_CONTAINERS, verbatim (packages/constants/src/dom.ts:2-60).
  const INLINE_ONLY = new Set(
    (
      'a abbr area audio b bdi bdo br button canvas cite code data datalist del dfn em embed h1 h2 ' +
      'h3 h4 h5 h6 i iframe img input ins kbd label li map mark meter noscript object output p ' +
      'picture progress q ruby s samp script select slot small span strong sub sup svg template ' +
      'textarea time u var video wbr'
    ).split(' '),
  )

  // Explicitly null past either end of the child list rather than undefined: a record whose shape
  // changes depending on where in the list the gap fell is a record every reader has to guess at.
  const brief = (el) =>
    el
      ? {
          tag: el.tagName.toLowerCase(),
          slot: el.dataset.slot ?? null,
          text: (el.textContent ?? '').trim().slice(0, 40) || null,
          classes: typeof el.className === 'string' ? el.className : el.getAttribute('class'),
        }
      : null

  // A point becomes a parent and an index. Onlook stops there and throws the rectangle away at the
  // iframe boundary (insert-element.md:158-160); it can afford to, because it writes the JSX
  // itself. A brief cannot: `index: 1` is unactionable in a file whose JSX children include
  // whitespace nodes, so the two siblings either side of the gap are named by their text as well.
  const resolveAnchor = (x, y, drawn) => {
    let t = document.elementsFromPoint(x, y).find((n) => n !== host && !host.contains(n))
    while (t && INLINE_ONLY.has(t.tagName.toLowerCase())) t = t.parentElement
    if (!t || t.nodeType !== 1) return null
    const cs = getComputedStyle(t)
    const kids = [...t.children]
    const rects = kids.map((k) => k.getBoundingClientRect())
    // Onlook measures the distance to each child's VERTICAL midpoint and nothing else
    // (insert.ts:24-42), so in a flex row every child shares one midpoint, the strict `<` never
    // beats the first of them, and the index collapses to 0 or 1 — horizontal position is never
    // resolved at all. The axis is not a constant. A flex container names it outright; a grid has
    // no such property (grid-auto-flow describes fill order, not geometry) so its own children's
    // spread answers for it.
    const span = (f) => (rects.length ? Math.max(...rects.map(f)) - Math.min(...rects.map(f)) : 0)
    const axis = cs.display.includes('flex')
      ? cs.flexDirection.startsWith('row')
        ? 'x'
        : 'y'
      : span((r) => r.left) > span((r) => r.top)
        ? 'x'
        : 'y'
    const mid = (r) => (axis === 'x' ? r.left + r.width / 2 : r.top + r.height / 2)
    const at = axis === 'x' ? x : y
    let best = 0
    let min = Infinity
    rects.forEach((r, i) => {
      const d = Math.abs(at - mid(r))
      if (d < min) {
        min = d
        best = i
      }
    })
    // A container that stacks its children has a place BETWEEN two of them. Anything else — a block
    // whose children are laid out by the flow, an empty container — has only an end to append to,
    // and claiming an index into it would be inventing a precision the layout does not have.
    const stacked = /flex|grid/.test(cs.display) && rects.length > 0
    const index = stacked ? (at > mid(rects[best]) ? best + 1 : best) : null
    const path = domPath(t)
    let unique = false
    try {
      unique = document.querySelectorAll(path).length === 1
    } catch {
      unique = false
    }
    return {
      type: stacked ? 'index' : 'append',
      index,
      childCount: kids.length,
      axis,
      parent: {
        tag: t.tagName.toLowerCase(),
        slot: t.dataset.slot ?? null,
        classes: typeof t.className === 'string' ? t.className : t.getAttribute('class'),
        display: cs.display,
        flexDirection: cs.flexDirection,
        path,
        // The same refusal locateRow makes, for the same reason: when the path matches more than
        // one node, the brief describes a shape rather than a place. Pointing at the first
        // document-order match would be a guess, and a guess reads exactly like a fact.
        unique,
      },
      // The SIBLINGS either side of the gap, not instructions: the new element goes after `before`
      // and ahead of `after`. Named by their text because that is what names the pattern to copy.
      before: stacked ? brief(kids[index - 1]) : brief(kids[kids.length - 1]),
      after: stacked ? brief(kids[index]) : null,
      drawn,
      // `res` and `el` are the live half and never reach the record — commit() lifts the parent's
      // resolution to the pin's top level, where a critique pin keeps the resolution of its own
      // element, and drops the node. It is the parent's because that is the gap, padding and
      // colour system whatever gets built has to join.
      res: resolve(t),
      el: t,
    }
  }

  const onMove = (e) => {
    // A drag in flight owns the box, and it is the only thing on screen that follows the pointer
    // without asking what is under it — the whole point is that nothing is there yet.
    if (drawStart) {
      const l = Math.min(drawStart.x, e.clientX)
      const t = Math.min(drawStart.y, e.clientY)
      box.style.cssText += `;display:block;left:${l}px;top:${t}px;width:${Math.abs(e.clientX - drawStart.x)}px;height:${Math.abs(e.clientY - drawStart.y)}px`
      // Dashed and filled while it is being drawn, because what is inside it is not an element yet
      // — a solid ring around empty space claims something is there.
      box.className = 'box draw'
      tag.style.display = 'none'
      return
    }
    if (!on || frozen) return
    // A mousemove inside the shadow root is retargeted to the host, so this one test covers the
    // list and the panel both. Without it, sweeping the mouse down the inventory repaints whatever
    // sits UNDER the list on each step and fights the row's own hover for the box.
    if (host.contains(e.target)) return
    stack = document.elementsFromPoint(e.clientX, e.clientY).filter((n) => n !== host && !host.contains(n))
    depth = 0
    if (stack[0]) paint(stack[0])
  }

  // The host app must never see the mousedown half of an alt-click. foji's title strip starts a
  // Tauri window drag from its own mousedown handler (lib/drag.ts:22), so alt-clicking it drags the
  // window out from under the pin in the desktop app and throws `undefined (reading 'metadata')` in
  // a plain browser, where __TAURI_INTERNALS__ does not exist. Capture phase, because React's root
  // listener and every other delegated handler live below it. The click still arrives at onClick:
  // preventDefault on mousedown suppresses focus and text selection, not the click event.
  const onDown = (e) => {
    if (!on || !e.altKey || host.contains(e.target)) return
    e.preventDefault()
    e.stopPropagation()
    // Alt+SHIFT is the add gesture, and everything from here draws the box the user means to fill.
    // It cannot collide with Alt+Shift+P: that branch tests e.key, and a mousedown carries no key.
    if (!e.shiftKey) return
    clear()
    frozen = true
    drawStart = { x: e.clientX, y: e.clientY }
  }

  const onUp = (e) => {
    if (!drawStart) return
    const s = drawStart
    drawStart = null
    const drawn = {
      x: Math.min(s.x, e.clientX),
      y: Math.min(s.y, e.clientY),
      width: Math.abs(e.clientX - s.x),
      height: Math.abs(e.clientY - s.y),
    }
    // The mouse-UP point, which is onlook's choice too (insert-element.md:72-81): a drag that
    // started on a button and ended in the gap below it means the gap, not the button. A modifier
    // click with no drag is the same gesture with a zero-size box, so pointing works as well as
    // drawing. onDown already preventDefaulted this sequence for the host's sake — nothing here
    // has to repeat that.
    anchor = resolveAnchor(e.clientX, e.clientY, drawn)
    if (!anchor) {
      clear()
      return
    }
    // The box moves onto the PARENT rather than staying on what was drawn. The drawn rectangle is
    // already in the record; the one thing the user cannot otherwise see is which container the
    // resolution decided to put the element in, and that is the half he can still correct.
    paint(anchor.el, { sel: true })
    tag.textContent = ''
    tag.append(`+ into ${anchor.parent.tag}`, mk('span', 'dim', anchor.index == null ? 'append' : `${anchor.index}/${anchor.childCount}`))
    why.innerHTML = summarize(anchor.res)
    // mk, so the neighbours' text is set as text. It comes off the host page, and the why-block is
    // the one place in this file that assigns innerHTML.
    why.prepend(
      mk(
        'div',
        'anchor',
        `add into <${anchor.parent.tag}>` +
          (anchor.index == null
            ? ` — appended after ${anchor.childCount} children`
            : ` at ${anchor.index} of ${anchor.childCount}` +
              (anchor.before?.text ? ` · after "${anchor.before.text}"` : '') +
              (anchor.after?.text ? ` · before "${anchor.after.text}"` : '')),
      ),
    )
    $('.count').textContent = `${anchor.res.matchedRules} rules · ${anchor.res.tokenCount} tokens`
    head.textContent = 'add'
    sub.textContent = `<${anchor.parent.tag}>`
    commitBtn.textContent = 'add it'
    openPanel(anchor.el.getBoundingClientRect())
  }

  const onClick = (e) => {
    if (!on || !e.altKey) return
    e.preventDefault()
    e.stopPropagation()
    // onUp already answered this one. A modifier click with no drag is still the add gesture, and
    // letting the critique path run here would replace its anchor with a plain selection of
    // whatever happened to be under the pointer.
    if (e.shiftKey) return
    stack = document.elementsFromPoint(e.clientX, e.clientY).filter((n) => n !== host && !host.contains(n))
    depth = 0
    frozen = true
    if (stack[0]) select(stack[0])
  }

  const onKey = (e) => {
    // This handler is bound twice on purpose — window capture, and the shadow root, because a
    // keystroke aimed at the textarea only reaches the first of those depending on how it was
    // dispatched. The same event object arrives at both, so anything that STEPS rather than sets
    // ran twice: one Escape used to clear the pin AND then turn the whole tool off.
    if (e.__sd) return
    e.__sd = true
    if (e.altKey && e.shiftKey && (e.key === 'P' || e.key === 'p')) {
      e.preventDefault()
      api.toggle()
      return
    }
    if (!on) return
    // One key, walked outward: throw away the pin being taken, then the list, then the tool. Figma
    // makes Escape leave comment mode and so does this — but not before it has undone the thing the
    // user was most likely trying to undo.
    if (e.key === 'Escape') {
      if (frozen || target || anchor || editing) clear()
      else if (listOpen) {
        listOpen = false
        remember(false)
        render()
      } else api.toggle()
      return
    }
    if (frozen && e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault()
      depth = Math.min(stack.length - 1, Math.max(0, depth + (e.key === 'ArrowDown' ? 1 : -1)))
      select(stack[depth])
      return
    }
    if (frozen && e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      commit()
    }
  }

  // Every write is one appended record and the same failure question: did it land? The old bare
  // `.catch(() => {})` answered "who knows" and the pin died on the next reload with nothing on
  // screen having said so. Now a rejected POST flags the record it came from and lights the chip.
  const post = (body, local) => {
    fetch(SINK, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      mode: 'cors',
      keepalive: true,
    })
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status))
      })
      .catch(() => {
        offline = true
        if (local) local.unsynced = true
        render()
      })
  }

  // crypto.randomUUID is missing outside a secure context, and Delivery A is a devtools paste into
  // whatever page the user has open. An id that is merely unique within one pins.jsonl is enough.
  const newId = () =>
    crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

  function commit() {
    if (!target && !editing && !anchor) return
    const said = input.value.trim()
    if (!said) return
    if (editing) {
      const rec = pins.find((p) => p.id === editing)
      const at = new Date().toISOString()
      if (rec) {
        rec.said = said
        rec.editedAt = at
      }
      post({ op: 'edit', id: editing, said, at }, rec)
      input.value = ''
      clear()
      render()
      return
    }
    const r = target?.getBoundingClientRect()
    // `el` is a live node and `res` belongs at the pin's top level beside a critique pin's own
    // resolution, so neither is part of the anchor as recorded.
    const { el, res, ...where } = anchor ?? {}
    const pin = {
      // op and id are what make the file a log rather than a list: an edit or a delete is another
      // record naming this same id, never a rewrite of this line. kind defaults to critique for a
      // consumer that has never heard of it, and the two shapes differ exactly here: an add pin
      // has no element to identify — that absence IS what it says — so it carries an anchor and
      // the parent's resolution where a critique pin carries an identity and its own.
      //
      // A re-aim is this same record under a different op and an id that already exists: every
      // field a pin has about WHERE it is gets recomputed, and the fold keeps the rest. That is
      // deliberately not a narrower `{id, identity}` patch — the resolution, the box, the screen
      // and the theme all describe the old element, and a record that updated the selector and
      // left them would be worse than one that never moved at all.
      op: reaiming ? 'reanchor' : 'pin',
      id: reaiming ?? newId(),
      kind: anchor ? 'add' : 'critique',
      said,
      at: new Date().toISOString(),
      url: location.href,
      route: location.pathname,
      view: viewKey(),
      viewport: { w: innerWidth, h: innerHeight, dpr: devicePixelRatio },
      theme:
        document.documentElement.classList.contains('dark') ||
        document.documentElement.dataset.theme === 'dark'
          ? 'dark'
          : matchMedia('(prefers-color-scheme: dark)').matches
            ? 'dark(system)'
            : 'light',
      scrollY: scrollY,
      identity: target ? identify(target) : null,
      classes: target ? (typeof target.className === 'string' ? target.className : target.getAttribute('class')) : null,
      box: r ? { x: +r.x.toFixed(1), y: +r.y.toFixed(1), width: +r.width.toFixed(1), height: +r.height.toFixed(1) } : null,
      ...(anchor ? { anchor: where, ...res } : target.__sdRes),
    }
    // The local array is folded the same way the file is: a re-aim replaces the record in place and
    // keeps its slot, so the number on the marker does not change under a user who was only
    // correcting where it pointed.
    const at = pins.findIndex((p) => p.id === pin.id)
    if (at > -1) pins[at] = { ...pins[at], ...pin, op: 'pin', reanchoredAt: pin.at }
    else pins.push(pin)
    post(pin, pin)
    input.value = ''
    clear()
    // One animation, on the one marker that just appeared. Consumed by the render it triggers, so a
    // later re-render — a scroll settling, a screen change — does not replay it.
    justPinned = pin.id
    render()
    justPinned = null
  }

  // Done is a filter, never a delete — the one thing both Figma and Vercel do with a resolved
  // comment, and for the same reason: the sentence is the only record of why the screen looks the
  // way it does now, so destroying it on the day it stops being a complaint is destroying it at
  // exactly the wrong moment. `doneAt` rather than `resolved`, because `resolved` in this file is
  // already the map of properties to the tokens that own them.
  const setDone = (id, done) => {
    const rec = pins.find((p) => p.id === id)
    if (!rec) return
    const at = new Date().toISOString()
    rec.doneAt = done ? at : null
    post({ op: done ? 'done' : 'undone', id, at }, rec)
    render()
  }

  // ── the inventory ──────────────────────────────────────────────────────────────────────

  // Jumping back to a pinned element, and refusing to. domPath caps at six segments and two of the
  // four pins in the real corpus carry no #id anchor, so a stale path resolves to a live WRONG
  // element as readily as the right one. One node or nothing — never highlight on a maybe.
  const locateRow = (pin, here = viewKey()) => {
    if (pin.view && pin.view !== here) return null
    const want = (pin.identity?.text ?? '').trim()
    // Every candidate in turn, each still held to one-node-or-nothing. A pin taken before this
    // existed carries only `path`, and that is the whole of its list.
    for (const sel of pin.identity?.paths ?? [pin.identity?.path]) {
      if (!sel) continue
      let n = []
      try {
        n = [...document.querySelectorAll(sel)]
      } catch {
        continue
      }
      if (n.length === 1) return n[0]
      // Several matches is not a maybe when the pin recorded what the element said. Four cards
      // sharing one class list are told apart by their text, and the text is already in the record.
      if (n.length > 1 && want) {
        const byText = n.filter((e) => (e.textContent ?? '').trim().slice(0, 80) === want)
        if (byText.length === 1) return byText[0]
      }
    }
    return null
  }

  // The same refusal, for the container an add pin was filed against. `unique` was already decided
  // when the pin was taken (resolveAnchor); re-checking it here is what keeps a path that has since
  // come to match three nodes from lighting up the first of them as if it were the one.
  const locateParent = (pin, here = viewKey()) => {
    if (pin.view && pin.view !== here) return null
    if (!pin.anchor?.parent?.unique) return null
    let n = []
    try {
      n = [...document.querySelectorAll(pin.anchor.parent.path ?? '')]
    } catch {
      return null
    }
    return n.length === 1 ? n[0] : null
  }

  // textContent, never innerHTML: a pin's sentence is whatever the user typed, and the panel next
  // to it is already showing markup this file built.
  const mk = (t, cls, text) => {
    const n = document.createElement(t)
    if (cls) n.className = cls
    if (text != null) n.textContent = text
    return n
  }

  // One group per screen a pin was taken on. The route is there for an app that has a router; the
  // view key is what tells two screens apart in the far more common case where the URL never moves.
  const groupKey = (p) => `${p.route ?? location.pathname} ${p.view ?? ''}`

  const whereLabel = (pin) => {
    if (pin.anchor) return `+ into ${pin.anchor.parent?.tag ?? '?'}`
    const id = pin.identity ?? {}
    return `${id.slot ? `[${id.slot}]` : (id.tag ?? '?')}${id.text ? ` "${id.text.slice(0, 24)}"` : ''}`
  }

  // ── the markers ────────────────────────────────────────────────────────────────────────
  // A pin that leaves nothing behind on the page is a pin the user has to remember taking. Every
  // tool that does this well — Figma, Vercel's toolbar — drops a marker on the thing and leaves it
  // there, and the question it answers is the one actually asked on a second pass: what have I
  // already said about this screen? Only pins whose element can still be found get one; the rest
  // are in the list, where "not on this screen" is a sentence rather than a dot in the wrong place.
  const placeMarks = () => {
    marks.textContent = ''
    if (!on) return
    const here = viewKey()
    pins.forEach((p, i) => {
      // A done pin comes off the screen with the same keystroke it comes out of the list — the
      // whole value of marking one done is that the page stops carrying it.
      if (p.doneAt && !showDone) return
      // An add pin has no element — that absence is what it says — but it does name the parent the
      // thing goes into, and that parent is on screen. Marking it is the difference between an add
      // pin existing on the page and existing only in a file. It is drawn hollow, because the one
      // thing it must not claim is that something is already there.
      const node = p.anchor ? locateParent(p, here) : locateRow(p, here)
      if (!node) return
      const r = node.getBoundingClientRect()
      if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) return
      const m = mk(
        'div',
        `mark${p.anchor ? ' add' : ''}${p.doneAt ? ' done' : ''}${p.id && p.id === justPinned ? ' new' : ''}`,
        p.doneAt ? '✓' : String(i + 1),
      )
      m.dataset.id = p.id ?? ''
      // The sharp corner lands on the element's top-left and the body hangs off it, so the marker
      // points at the thing without sitting on top of it. Clamped, because the element at the top
      // of a page is exactly the one whose marker would otherwise be off-screen.
      m.style.left = `${Math.max(2, Math.min(r.left - 22, innerWidth - 24))}px`
      m.style.top = `${Math.max(2, r.top - 22)}px`
      m.onmouseenter = () => {
        paint(node)
        tip.textContent = p.said ?? ''
        tip.style.display = 'block'
        const tr = tip.getBoundingClientRect()
        tip.style.left = `${Math.min(Math.max(6, r.left - 22), innerWidth - tr.width - 6)}px`
        tip.style.top = `${r.top - 22 - tr.height - 6 >= 6 ? r.top - 22 - tr.height - 6 : r.top + 6}px`
      }
      m.onmouseleave = () => {
        tip.style.display = 'none'
        restore()
      }
      marks.append(m)
    })
  }

  // Grouped by the screen the pin was taken on, because a sentence about a screen means nothing
  // beside a screen it is not about, and on a state-routed app half the rows always are.
  const renderList = () => {
    list.textContent = ''
    if (!pins.length) {
      const e = mk('li', 'empty')
      e.append(
        mk('kbd', null, 'alt'),
        ' + click an element to say what is wrong with it.',
        mk('br'),
        mk('kbd', null, 'alt'),
        ' + ',
        mk('kbd', null, 'shift'),
        ' + drag where one is missing.',
      )
      list.append(e)
      return
    }
    const here = viewKey()
    // Done pins leave the list, not the file. The line that says how many is the only way back to
    // them, and it is at the top rather than the bottom because a list of six open pins that used
    // to be nine is a different thing to read than one that was always six.
    const done = pins.filter((p) => p.doneAt)
    if (done.length) {
      const dl = mk('li', `doneline${showDone ? ' open' : ''}`)
      dl.append(mk('span', 'tick', '✓'), mk('span', 'lbl', `${done.length} done`), mk('span', 'act', showDone ? 'hide' : 'show'))
      list.append(dl)
    }
    const groups = new Map()
    for (const p of pins) {
      if (p.doneAt && !showDone) continue
      const key = groupKey(p)
      if (!groups.has(key)) groups.set(key, { route: p.route ?? location.pathname, view: p.view, rows: [] })
      groups.get(key).rows.push(p)
    }
    if (!groups.size) {
      list.append(mk('li', 'empty', 'every pin on this project is done.'))
      return
    }
    for (const g of groups.values()) {
      const now = g.route === location.pathname && g.view === here
      const h = mk('li', `grp${now ? ' now' : ''}`)
      h.title = `${g.route} · ${g.view ?? 'view not recorded'}`
      // The route is the wrong headline for an app that has one. What a reader wants first is
      // whether these rows are about what he is looking at; the route only earns the slot when it
      // is the thing that differs. The view key stays, in mono, as the detail that proves it.
      h.append(
        mk('span', 'rt', now ? 'this screen' : g.route !== location.pathname ? g.route : 'another screen'),
        mk('span', 'vk', g.view ?? 'view not recorded'),
        mk('span', 'cnt', String(g.rows.length)),
      )
      // The one screen change the overlay can actually make, and only ever to a route a pin was
      // already taken on — this is not a route list, it is the pins' own. A hard navigation rather
      // than pushState, deliberately: the overlay knows nothing about the app's router and a tool
      // with no framework knowledge has no business synthesising a history entry. When the route
      // already matches and only the view differs there is no handle at all, and the rows say so.
      if (g.route !== location.pathname) {
        const go = mk('button', 'go', 'go')
        go.dataset.route = g.route
        h.append(go)
      }
      list.append(h)
      for (const p of g.rows) {
        // An add pin has no element to find and never will — it is about a gap. Running the lookup
        // on it would report `could not locate`, which reads as the lookup failing rather than as
        // the point of the pin.
        const node = now && !p.anchor ? locateRow(p, here) : null
        const row = mk('li', `row${node ? '' : ' cold'}${p.doneAt ? ' done' : ''}`)
        row.dataset.id = p.id ?? ''
        row.title = whereLabel(p)
        row.append(
          // The same number as the marker on the page, which is the whole point of numbering them:
          // a row and a dot that say `3` are one pin seen from two places.
          mk('span', 'n', p.doneAt ? '✓' : String(pins.indexOf(p) + 1)),
          mk('span', 'said', p.said ?? ''),
          // Three distinct refusals, and conflating them is what makes a tool look broken. `could
          // not locate` means we are on the right screen and the path found nothing or found
          // several. `no screen recorded` means the pin predates view keys, so there is nothing to
          // compare and the path alone would happily light the wrong element — this app reuses
          // `aside > button:nth-of-type(3)` on every screen it has.
          mk(
            'span',
            'where',
            node || p.anchor
              ? whereLabel(p)
              : now
                ? 'could not locate'
                : g.view === undefined
                  ? 'no screen recorded'
                  : 'not on this screen',
          ),
        )
        const acts = mk('span', 'acts')
        // `aim` on every row, not only the cold ones. A pin the tool CAN find is still a pin that
        // may be on the wrong element — that is the ordinary way to mis-take one — and a verb that
        // appears only after something has broken is a verb nobody learns.
        acts.append(
          mk('button', 'aim', 'aim'),
          mk('button', 'dn', p.doneAt ? 'undo' : 'done'),
          mk('button', 'ed', 'edit'),
          mk('button', 'rm', 'del'),
        )
        row.append(acts)
        if (node) {
          row.onmouseenter = () => paint(node)
          row.onmouseleave = restore
        }
        list.append(row)
      }
    }
  }

  const beginEdit = (id) => {
    const pin = pins.find((p) => p.id === id)
    if (!pin) return
    editing = id
    frozen = true
    head.textContent = 'edit'
    commitBtn.textContent = 'save'
    const node = locateRow(pin)
    if (node) {
      // The full selection, resolution included: the panel is about to ask what is wrong with this
      // element, and the answer to that question is the same one it gives on a fresh pin.
      select(node)
    } else {
      // Nothing on this screen to point the panel at, so it goes beside the list rather than
      // hovering over an element that is not the one being talked about.
      why.innerHTML = '<div class="note">not on this screen — editing the sentence only</div>'
      panel.style.display = 'block'
      panel.style.left = `${Math.max(8, innerWidth - 340)}px`
      panel.style.top = '80px'
      input.focus()
    }
    sub.textContent = id.slice(0, 6)
    input.value = pin.said ?? ''
    input.dispatchEvent(new Event('input'))
  }

  // Point an existing pin somewhere else. Until this existed a pin whose element had moved could
  // only be mourned: the row said `could not locate` and the only verbs were rewrite the sentence
  // or destroy it, so the sentence — the expensive half — died with the selector. The panel arms
  // itself and then waits; the next alt-click (or alt+shift+drag, if the pin is an add pin) is the
  // new target, and committing writes one `reanchor` record naming the same id.
  const beginReaim = (id) => {
    const pin = pins.find((p) => p.id === id)
    if (!pin) return
    clear()
    reaiming = id
    head.textContent = 're-aim'
    sub.textContent = id.slice(0, 6)
    commitBtn.textContent = 'move it'
    why.innerHTML = `<div class="note">${
      pin.anchor ? 'alt+shift+drag where it belongs now' : 'alt-click the element this is about now'
    }</div>`
    panel.style.display = 'block'
    panel.style.left = `${Math.max(8, innerWidth - 340)}px`
    panel.style.top = '80px'
    input.value = pin.said ?? ''
    input.dispatchEvent(new Event('input'))
    input.focus()
  }

  // A delete is an appended tombstone, so a mis-delete is a `grep -v` away in pins.jsonl. With the
  // sink down there is nowhere to append it: the row goes from this tab and comes back on reload,
  // which is what `offline` on the chip is there to warn about.
  const del = (id) => {
    const i = pins.findIndex((p) => p.id === id)
    if (i < 0) return
    if (editing === id || reaiming === id) clear()
    pins.splice(i, 1)
    post({ op: 'delete', id, at: new Date().toISOString() })
    render()
  }

  // The sink is the record; window.__sdPins is this tab's copy of it. Anything the sink has not
  // heard of — a pin whose POST was rejected, or one taken while this GET was in flight — is kept.
  const hydrate = async () => {
    let served = null
    try {
      const r = await fetch(SINK_LIST, { mode: 'cors' })
      if (r.ok) served = await r.json()
    } catch {
      /* no sink running — the chip says so */
    }
    offline = !Array.isArray(served)
    if (!offline) {
      const known = new Set(served.map((p) => p.id))
      const mine = pins.filter((p) => p.id && !known.has(p.id))
      pins.length = 0
      pins.push(...served, ...mine)
    }
    render()
  }

  const render = () => {
    // The view count is §2.2 in one glance: more views than routes means the tool can tell two
    // screens apart that location.pathname insists are the same screen.
    const views = new Set(pins.map(groupKey)).size
    // The count is of pins still open. A number that never goes down is a number nobody reads.
    const open = pins.filter((p) => !p.doneAt).length
    chip.textContent = ''
    chip.classList.toggle('dim', !on)
    chip.append(
      mk('span', 'dot'),
      mk('span', 'n', open ? `${open} pin${open === 1 ? '' : 's'}` : 'pin'),
      // The hint is the keyboard model, shown where a static count used to be. Nobody reads a
      // console line about a modifier key; the one affordance that is always on screen is the
      // only place the gesture can be taught.
      mk('span', 'hint', on ? (open ? (views > 1 ? `${views} screens` : 'alt-click') : 'alt-click an element') : 'off'),
    )
    if (on && offline) chip.append(mk('span', 'off', 'offline'))
    chip.title = on ? 'the pins so far · alt-click an element to add one' : 'pinning is off · click to turn it back on'
    chip.style.display = 'flex'
    if (!on) listOpen = false
    const railed = on && listOpen
    rail.style.display = railed ? 'flex' : 'none'
    host.classList.toggle('railed', railed)
    if (railed) {
      const done = pins.length - open
      railN.textContent = `${open} open${done ? ` · ${done} done` : ''}`
      renderList()
    }
    placeMarks()
  }

  // Every navigation signal converges here. A screen change is a burst, not an event — measured on
  // foji, three screen changes produced 6 MutationObserver batches over 28 records — and the view
  // key costs a forced layout at ~1ms, so they coalesce on a trailing timer instead of each paying
  // for it. Re-rendering only when the key actually moved is what keeps that affordable with the
  // list open, where a render is one querySelectorAll per row.
  const onNav = () => {
    clearTimeout(navT)
    navT = setTimeout(() => {
      // onlook's validateAndCleanSelections, minus the RPC. This is the whole of the liveness fix:
      // the one thing that must never survive a screen change is a highlight box, or a half-typed
      // sentence, still pointing at a node the app has already thrown away.
      if (target && !target.isConnected) clear()
      const v = viewKey()
      if (v === lastView) return
      lastView = v
      // An anchor holds no live node — it is already a path, a class list and two sibling texts —
      // so nothing detaches to catch it. What goes stale is the screen it describes, and a commit
      // after the app has moved on would file that brief under the view key of another screen.
      if (anchor) clear()
      render()
    }, 120)
  }

  const api = {
    toggle() {
      on = !on
      if (!on) clear()
      document.body.style.cursor = on ? 'crosshair' : ''
      render()
      return on
    },
    pins,
    resolve: (el) => resolve(el),
    // The wire format gained op, id, kind and view at v2, identity.paths at v3, and the reanchor /
    // done / undone ops with the doneAt they fold to at v4. superdesign-pin-contract.md:112
    // requires the bump on any schema change.
    version: 4,
    view: () => viewKey(),
  }

  // Scroll and resize are the two things a fixed overlay cannot follow without a frame loop, and a
  // rect that is one frame behind the page reads as the tool being broken. onlook does not chase:
  // it drops every rect the instant a wheel turns and fades them back once the page settles. A
  // deliberate blink is legible; lag is not. Passive, because none of this ever cancels a scroll.
  let settle = 0
  const onScroll = () => {
    host.classList.add('scrolling')
    clearTimeout(settle)
    settle = setTimeout(() => {
      host.classList.remove('scrolling')
      if (frozen && target?.isConnected) paint(target, { sel: true, untokened: !target.__sdRes?.tokenCount })
      else if (!frozen) {
        box.style.display = 'none'
        tag.style.display = 'none'
      }
      placeMarks()
    }, 150)
  }
  addEventListener('scroll', onScroll, { capture: true, passive: true })
  addEventListener('wheel', onScroll, { passive: true })
  addEventListener('resize', onScroll, { passive: true })

  marks.addEventListener('click', (e) => {
    const m = e.target.closest?.('.mark')
    if (!m) return
    e.preventDefault()
    e.stopPropagation()
    beginEdit(m.dataset.id)
  })

  // The button is dim until there is a sentence to send. Toggling a class on input rather than
  // computing it at open time is what makes it right after a paste, an undo, or a driver's fill.
  input.addEventListener('input', () => commitBtn.classList.toggle('ready', input.value.trim().length > 0))

  addEventListener('mousemove', onMove, true)
  addEventListener('mousedown', onDown, true)
  addEventListener('mouseup', onUp, true)
  addEventListener('click', onClick, true)
  addEventListener('keydown', onKey, true)
  // Also on the shadow root. A keystroke aimed at the textarea is retargeted at the boundary, and
  // whether it reaches a window-level capture listener depends on how it was dispatched — a real
  // keyboard does, some automation drivers do not. Committing is the one action that must never
  // depend on that, so it has two paths that do not share a failure mode: this, and the button.
  shadow.addEventListener('keydown', onKey, true)
  commitBtn.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    commit()
  })
  chip.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (!on) {
      api.toggle()
      return
    }
    listOpen = !listOpen
    remember(listOpen)
    render()
  })
  rail.querySelector('.rx').addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    listOpen = false
    remember(false)
    render()
  })
  // Delegated, so a re-render does not have to re-bind two buttons per row. Inside the shadow root
  // the event is not retargeted, so e.target really is the button that was pressed.
  list.addEventListener('click', (e) => {
    if (e.target.classList?.contains('go')) {
      location.href = e.target.dataset.route
      return
    }
    if (e.target.closest?.('.doneline')) {
      e.preventDefault()
      e.stopPropagation()
      showDone = !showDone
      render()
      return
    }
    const row = e.target.closest?.('.row')
    if (!row) return
    e.preventDefault()
    e.stopPropagation()
    const cls = e.target.classList
    if (cls.contains('ed')) beginEdit(row.dataset.id)
    else if (cls.contains('rm')) del(row.dataset.id)
    else if (cls.contains('aim')) beginReaim(row.dataset.id)
    else if (cls.contains('dn')) setDone(row.dataset.id, !row.classList.contains('done'))
  })
  // Four free signals and one that costs. The free four cover every navigation that moves the URL;
  // the observer is the only one that fires at all on an app like foji, whose screens are React
  // state and whose URL is `/` on all five of them. history.pushState is deliberately NOT patched:
  // the Navigation API covers Chromium and the observer covers the rest, so the patch would buy a
  // mutated host global and nothing else — and a router that captured the original reference before
  // injection would silently defeat it anyway.
  addEventListener('popstate', onNav)
  addEventListener('hashchange', onNav)
  addEventListener('pageshow', onNav)
  if (typeof navigation === 'object') navigation?.addEventListener?.('navigate', onNav)
  new MutationObserver(onNav).observe(document.documentElement, { childList: true, subtree: true })

  document.documentElement.appendChild(host)
  // Seeded once the host has landed and still ahead of the observer's trailing timer, because that
  // append is itself a mutation and its batch would otherwise report a screen change that was us.
  lastView = viewKey()
  window.__sdPinOverlay = api
  api.toggle()
  // Kept on the api because hydration is the one thing about this overlay that is asynchronous:
  // without a handle, a driver that pins immediately after load races the fetch that is about to
  // replace the array it just pushed into.
  api.hydrated = hydrate()

  console.log(
    '%c pin %c alt-click an element · alt+shift+drag where one is missing · alt+shift+P toggles',
    `background:${ACCENT};color:#fff;padding:2px 7px;border-radius:999px;font-weight:700`,
    'color:#8a8a94',
  )
})()
