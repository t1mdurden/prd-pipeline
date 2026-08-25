---
name: superdesign
description: >-
  Design and build top-tier, brand-specific UI with React + Tailwind v4 + shadcn/ui via a
  system-first workflow (brand → OKLCH tokens → cookbook patterns → polish → anti-slop & a11y
  gates) that defeats generic "AI-slop" output. Use for ANY UI/UX work — building or restyling a
  component, screen, page, dashboard, landing, marketing site, or design system; choosing
  colors/typography/spacing/radius/shadow/motion; theming or composing shadcn/ui; or whenever an
  interface looks generic, "AI-generated", or off-brand. Triggers include "build a landing page",
  "design a dashboard", "make this look better", "restyle this component", "pick a color palette",
  "this looks AI-generated", "set up shadcn theming". Do NOT use for backend logic, data modelling,
  build configuration, or copywriting unattached to a surface.
license: MIT
---

# superdesign

A design-system *generator*, not a fixed theme. **This file is a router:** six phases plus a
conditional polish pass, each fired by a file on disk or an exit code, never by a judgement. What a
machine can decide lives in `scripts/`; what it cannot lives in `references/`, opened only by the
phase that names it — a pointer here is a command, and where a reference opens with `## Contents`,
read that list first and pull only the section you need. **Requires** React 19, Tailwind v4
(CSS-first, no `tailwind.config.js`), shadcn/ui new-york — v3 is not supported, stop and say so.
Phases 0/4/5 need a browser: **`Skill(silver)` is the default**, a local headless Playwright every
script borrows before asking you to install one, so only axe is missing
(`npm i -g agent-silver && npm i -D @axe-core/playwright`). A product surface needs `npm create vite`
+ `shadcn init` first, outside the loop; `examples/app-ui/` is one built on the real stack, resolved
from the **repository root**, not from this skill directory.

## Project state (auto-injected — this is ground truth, do not re-derive it)

```!
test -f package.json && node -e "const p=require('./package.json');const d={...p.dependencies,...p.devDependencies};for(const k of ['tailwindcss','react','next','motion','framer-motion','lucide-react','sonner','tw-animate-css','class-variance-authority','tailwind-merge'])if(d[k])console.log(k+' '+d[k])" 2>/dev/null || echo "no package.json — static mock-up target"
test -f components.json && cat components.json || echo "no components.json — shadcn not initialised"
T=$(grep -l -r --include=globals.css --include=index.css --include=theme.css --exclude-dir=node_modules --exclude-dir=.claude --exclude-dir=.git -e '@theme' . 2>/dev/null | head -3); [ -n "$T" ] && echo "$T" || echo "no Tailwind v4 @theme block found — Phase 2 SYSTEM has not run"
```

It runs in the **target project** and excludes `.claude/`, so this skill's own `assets/theme.css` can
never be read as a host theme. The "has not run" line means **Phase 2 has not run and no markup may
be written** — that probe is how "tokens before markup" is enforced now. If it printed
`[shell command execution disabled by policy]`, read those three files by hand.

## The loop

| Phase | Fires when | BUILD | REDESIGN | COMPOSE |
|---|---|---|---|---|
| **0 RECON** | always, first | measure 3–6 refs | measure the target | measure the library's demo |
| **1 DIRECTION** | `recon.json` exists | ✓ | ✓ + differentiation target | ✓ |
| **2 SYSTEM** | `DESIGN.md` exists | ✓ | ✓ | ✓ + merge the item's `cssVars` |
| **3 COMPOSE** | tokens compile | cookbook | reuse tree, re-token | **fork: `import-gate.mjs`** |
| **3b POLISH** | markup exists, past one component | ✓ | ✓ | ✓ |
| **4 GATE** | markup exists | ✓ | ✓ | ✓ |
| **5 RANK** | the build renders | ✓ | ✓ (the point) | ✓ |

**Two forks total, both explicit: Phase 0's three modes, and `import-gate.mjs` in Phase 3.** Every
phase fires on a file, so every file has one path, one writer, one reader:

- **recon** → `recon.json`, project root, plus one `ref/<name>.{json,md}` per reference. Phase 0
  writes; Phase 1 and `--check` read.
- **Design Brief** → **`DESIGN.md`**, project root. Phase 1 writes by hand; Phases 2–5 read; it is
  also where the AS-01b accent exemption is declared.
- **theme CSS** → `app/globals.css` (Next) or `src/index.css` (Vite). Phase 2 writes it, from the
  `assets/theme.css` scaffold plus a seeded ramp; `palette.mjs --check`, `validate-chart-palette.mjs`
  and `check-tw-merge-tokens.mjs` read it.
- **forks** → `design_iterations/{surface}_{1,2,3}.tsx`, winner iterated as `{surface}_{n+1}`.
- **pulled registry item** → `.superdesign/pull/`, quarantine outside `src/`. Phase 3 writes it with
  `shadcn add -p`, `import-gate.mjs` reads it, and only a clean gate lets it into `src/`.
- **measurements** → `ref/<name>.json` (theirs), `ref/ours.json`, from `extract-reference --out`; and
  `ref/theirs.css` from
  `palette.mjs --seed '<their accent, from recon.json>' | sed '/^generated ramp/,$d' > ref/theirs.css`,
  the only reference CSS the skill can produce and so the only thing `--harmony` can compare against.
- **the served route** → `npm run dev`; its URL is every `--url` below.

**0 RECON — measure the field, and prove you measured.** One script, three modes, one schema.
```bash
node .claude/skills/superdesign/scripts/recon.mjs --refs <a,b,c> --steal "…" --steal "…" --steal "…"  # BUILD: one --steal per ref, in order
node .claude/skills/superdesign/scripts/recon.mjs --target <url> --steal "…"          # REDESIGN
node .claude/skills/superdesign/scripts/recon.mjs --registry <item> --url <demo-url>  # COMPOSE: give the demo URL — a bare name is guessed at; a page that is not there now exits 66 rather than measuring
node .claude/skills/superdesign/scripts/recon.mjs --check                             # the gate
```
No `recon.json`, no Phase 1 — `--check` exits 1. Every entry carries its own "what we take from it"
line, four distinct words minimum, no two alike; an empty one fails exactly as a missing measurement
does, because measuring three sites and taking nothing from them is recon as ritual. REDESIGN has no
offline escape — the target *is* the input and a redesign from memory is recall. BUILD without a
browser hand-writes `recon.json` flagged `measured:false`, so Phase 5 reports "no reference" rather
than a fabricated 6-of-6.

**1 DIRECTION — fires when `recon.json` exists.** The one judgement phase. Read
`references/brand-to-system.md` (and `references/reference-mining.md` for what a measured product
licenses); write ONE binding Design Brief to **`DESIGN.md`** — named aesthetic, the six spectrum
floats, all 15 fields of that file's template, the five dials (`DESIGN_VARIANCE`, `MOTION_INTENSITY`,
`VISUAL_DENSITY`, `GRID_DISCIPLINE`, `TEXTURE_LEVEL`) later phases read and never re-derive. A value
contradicting the brief is a defect, not a preference; a blank field is a blocked phase. **State the
font choice out loud here**; if two brand moods conflict, force a priority, never average them into
mush. `ultrathink` here. **Skip the brief only when** the work is backend with no surface · a minor
tweak to an already token-driven screen · the user supplied mockups or a complete spec. A preset is a
*complete design language*: retrieve it, then override its primitives to the brand seed rather than
shipping it as found. **REDESIGN also sets the differentiation target:** which of `--diff`'s six axes
MUST move away from the measured original — that contract set *before* building, rather than a check
run after, is the change. *Cold start*, a surface named and nothing else: read
`references/direction.md` and run its three-question intake, which never blocks. Discuss rather than
build on the first turn of a new surface unless the user used an action word; if one thing is
genuinely unclear ask once, then proceed on a stated assumption — never ask twice.

**2 SYSTEM — fires when `DESIGN.md` exists. Retrieval, never recall:** a recalled preset is invented
plausible OKLCH, the convergence this skill exists to defeat.
```bash
cp .claude/skills/superdesign/assets/theme.css app/globals.css                                    # the @import + @theme scaffold
node .claude/skills/superdesign/scripts/palette.mjs --seed 'oklch(0.55 0.15 265)' | sed '/^generated ramp/,$d'   # the ramp, without the census
node .claude/skills/superdesign/scripts/palette.mjs --check app/globals.css                        # AFTER the ramp is pasted in — the bare scaffold exits 2
```
`--seed` writes nothing and prints two things: the `:root` + `.dark` ramp, then a contrast census
that is a report, not CSS — hence the `sed`. The ramp is not a theme on its own, so paste its two
blocks over the copied scaffold's own `:root` and `.dark`; the scaffold is what carries
`@import "tailwindcss"` and the two `@theme` blocks the probe looks for. Seeds come from
`data/theme-seeds.json` — every row the
literal `globals.css` a real `npx shadcn@latest init -p <code>` wrote — and faces from
`data/google-fonts.min.json`; both are stamped caches, so **no phase blocks on a network call.**
`references/tokens.md` §0–§3 owns the three-tier system, the
`base = surface / -foreground = text-on-surface` pairing, the one-way
`component → semantic → primitive` chain, the `@theme` scaffold and the hard caps (**3–5 colours, ≤2
font families, 60-30-10**). Dark re-points the same semantic names under `.dark`: a second authored
ramp, never an inversion. In COMPOSE, `shadcn add` merges the item's `cssVars` into that same file —
re-run `--check` after; the item's accent does not outrank the brief's. Gate: `palette.mjs --check`
exits 0, a full fg/bg census in both modes rather than a five-row sample.

**3 COMPOSE — fires when the tokens compile.** The largest fork. **Scope-lock first:** enumerate every
screen, section, state and component and write the count into your working notes *before* markup,
then cross-check it before "done" — the missing-step class Plan-and-Solve (arXiv 2305.04091) and
DCGen (arXiv 2406.16386) both target, and one no gate can see, because a gate only reads files that
exist.
- **BUILD** — compose from `references/cookbook/`: 15 recipes, landing · app · flow, plus
  `texture.md` at `TEXTURE_LEVEL` > 0. Read the recipe first; write the real copy into `content.ts`
  before the first div. Fork exactly 3 on a **declared** axis, never on sampling noise — A = cookbook
  default at the dials, B = `DESIGN_VARIANCE` +3, C = `VISUAL_DENSITY` +2 — into `design_iterations/`;
  name the winner and the one property carried over from each loser, then iterate only the winner.
  N=3 is the ceiling (`references/verification.md`).
- **REDESIGN** — keep the component tree, replace values with tokens. The diff is the design.
- **COMPOSE** — `npx shadcn@latest add <item> -p .superdesign/pull`, then
  `node .claude/skills/superdesign/scripts/import-gate.mjs .superdesign/pull` **before the file
  enters `src/`**: retrieval is not a shortcut past the anti-slop pass. Of ten components pulled from
  three registries, 4 built at all, 0 of the 7 that could be gated passed, 15 of 15 shipped no
  reduced-motion gate. Non-zero → repair it or degrade to the cookbook.

`references/landscape.md` owns `cn` / `cva` / `asChild` / `data-slot`. Add a `cva` variant, never a
call-site override — shadcn's `outline` variant has a transparent background, so `text-white` on it
is invisible; define a variant carrying both surface and foreground. Never fork `components/ui/*`.
One primary action per screen; let content dictate card count, and prefer asymmetric/editorial to
centred-everything where the brand allows. Wire a11y while composing — `main`/`header`/`nav` over
`div`, correct roles, `sr-only`, `alt`. **Four Tailwind hygiene laws — author-side rules, nothing
downstream catches them for you:** never mix margin/padding with `gap` on one element · use `gap`,
never `space-x-*`/`space-y-*` · `text-balance` on headlines, `text-pretty` on lead paragraphs · the
page background on the root element, `<html className="bg-background">`. Run Phase 4 at the END of
this phase, to catch a defect before it is copied into nine more components.

**3b POLISH — fires when markup exists and the surface is past a single component.** What separates
designed from generated. Read in this order, each constraining the next: **`references/tokens.md` §5**
spacing rhythm (4pt ramp, `internal ≤ external`, optical nudges) · **§4** typography (three gray
levels, weight/size extremes, tracking, measure, emphasis-by-de-emphasis) · **§6–§7** elevation (one
light source by role, border-first for resting surfaces, lighter surface in dark) · **§10**
interaction states (three non-colliding axes, one on-colour overlay, all six states enumerated
*before* the component, empty states as a deliverable) · **§11** app-UI defaults on a product surface
(density tiers, 0ms ⌘K, full-opacity focus ring, tabular-nums). Motion here is MUST 7's numbers —
`--ease-out-quint` for entrances, `--ease-ios` for micro-interactions, **≤300ms**, the one carve-out a
cross-view transition (shared-element morph, route change) at **300–400ms**, `transform`/`opacity`
only. **Conditional loads:** `references/motion.md` when the surface has bespoke or interactive motion
(gestures/drag, drawers/sheets, hero or cross-view transitions, orchestrated reveals) — it owns the
animation-review ship gate each of those must clear;
`references/motion-platform.md` only when the effect needs a platform primitive (View Transitions,
`@starting-style`, `interpolate-size`, scroll-driven). Re-run Phase 4 at the end of this phase.

**4 GATE — fires when markup exists. One command, then one lens.**
```bash
node .claude/skills/superdesign/scripts/gate.mjs <dir> [--url <route>]
bash .claude/skills/superdesign/scripts/anti-slop-gate.sh --lens --exclude '(^|/)(node_modules|dist|build|\.next|\.turbo|coverage|ui)/' <dir>
```
Scope is resolved ONCE and inherited by every child, which is what ended the two halves' disagreement
about `ui/` (F7, F4). **The lens must carry the same `--exclude` or it re-opens F7:** bare, it reports
44 files where `gate.mjs` reports 21 on `examples/app-ui/src`, the extra 23 vendored
`components/ui/*`. **Do not self-assess the gate: the greps are the oracle** — a self-review with no
external signal measurably degrades output. **A failure prints the rule `id` and its `failureMode`
from `data/anti-slop-rules.json`**, SSOT for the machine-checkable half of the catalog, so never open
81 kB of prose to learn what a red line means. `--url` adds the rendered gate; without it geometry and
contrast go unchecked, and an unrun gate is not a passed gate. The lens is for what a grep cannot see,
the *absence* of a behaviour: mouse-only, no state machine, decorative colour where spacing and weight
should carry hierarchy, one fixed density, an animated ⌘K. Load `references/anti-slop.md` § APP-UI for
that pass only; past a single component run `references/critique.md`'s process (two isolated
assessments, P0–P3 severity, the Alex + Sam personas, the redesign ladder) and
`references/accessibility.md` for what axe marks *incomplete*. The one exemption: a blue-violet brand
declares its accent in `DESIGN.md` and AS-01b skips it — never widen or silence a detector.
**The tells live in `anti-slop.md` and deliberately not here**, because naming one while generating
raises its own probability. A build prompt carries only the positive form: the face named in TYPE, the
PALETTE hues in their declared roles, a content-driven layout at the brief's DIALS carrying its one
TENSION, the strings already in `content.ts`. The ban list is audit-only — read it when you review,
never when you write.

**5 RANK — fires when the build renders.** The extractor that measured the reference now measures us,
so "we changed it enough" stops being a claim and becomes a count.
```bash
node .claude/skills/superdesign/scripts/extract-reference.mjs --url <dev-url> --theme dark --out ref/ours
node .claude/skills/superdesign/scripts/extract-reference.mjs --diff ref/<reference>.json ref/ours.json
node .claude/skills/superdesign/scripts/palette.mjs --harmony ref/theirs.css app/globals.css
```
`--diff` takes exactly two files: with 3–6 BUILD refs, diff against the one `DESIGN.md` names as
primary. Three rankings, none claiming to rank two whole designs — nothing in the field can:
**differentiation** (exit 0 needs ≥3 of 6 mechanics moved, accent hue never within 10° of the
reference's), **system maturity** (how many tokens each side NAMES), **harmony** (huemint on one
literally fixed request; prints `harmony: unavailable` offline and never gates). Then look:
`Skill(silver)` at **1440×900 and 390×844**, light and dark, after `networkidle` — earlier captures an
empty shell and a false pass. Read the screenshots against `DESIGN.md`, not your memory of the code,
for what only vision catches: **horizontal overflow at 390px is a critical failure**, a clipped
popover, text colliding with a container edge, a squint-test hierarchy failure, the grayscale read.
Console errors and a failing Lighthouse accessibility score both block done. **Repair once per new
signal, then stop** — fix every P0/P1, re-run, exit 0 or stop and report; every extra loop must
introduce a signal the last lacked, and by pass 3 model critique is measurably worse than the design.

## The MUSTs

Each carries its failure mode — a rule whose cost is unstated is a rule that gets skipped.

1. **Name the aesthetic in one phrase before choosing anything** ("warm editorial", "precise fintech",
   "neobrutalist terminal"). *Fails as:* a weak brand vector defaults to SaaS-minimal, the exact
   statistical centre this skill exists to defeat. "Clean and modern" is an adjective, not a direction;
   it fails silently and looks like compliance. No script can decide whether a phrase is an aesthetic.
2. **Take the least-probable direction that still clears the brief. Never average three candidates** —
   which must differ on ALL of MOVEMENT, accent hue family, radius base and grid discipline, or "least
   probable of three" is unfalsifiable. *Fails as:* the mean of the training distribution, arrived at
   by a procedure that looks like diversity. Unmeasurable — the probability here is the model's own
   estimate of its own prior.
3. **Carry hierarchy with weight and gray level before size or colour; the screen must read in
   grayscale.** *Fails as:* colour-carried hierarchy that passes every contrast gate and still reads
   flat. A VLM judge may not assert spacing, alignment or size ratios — four SOTA VLMs average 58% on
   shape-position tasks — so gate and judge are both structurally blind to this one.
4. **Real domain copy. No lorem, no fake testimonials, no unsourced stats.** *Fails as:* a plausible
   fabricated statistic, which reads as real to every gate. AS-09 and AS-12b catch stubs and
   placeholder faces; nothing catches an invented number. Field-run F11: typecheck, build, three grep
   gates and the contrast solver green while the hero was visibly broken.

**Four more are MUSTs because the script named as their enforcer does not contain the check.** Each
goes back to an exit code when its check lands (ARCHITECTURE §2, commits 4–7); until then a MUST beats
a mapping to a green exit that decides nothing.

5. **Put the saturated brand hue in the ~10% accent role, not across surfaces** — 60-30-10: ~60%
   neutral surface, ~30% secondary, ~10% accent, which signals "act here" *because* it is scarce.
   *Fails as:* a brand wash over every surface, every gate green. `extract-reference.mjs` does
   compute `palette.accentShare` for our own build too — what no script owns is the *threshold*, so
   the number is reported and nothing refuses a 40% accent. Read it in Phase 5 and judge it.
6. **Every spacing value on the 4px grid, and card padding ≤ inter-card gap (`internal ≤ external`).**
   *Fails as:* card contents crowding their neighbours' — grouping reads inverted while no single
   value is out of range. `design-audit.mjs` computes the grid half (`off4`, cap 8); the
   `internal ≤ external` half exists in no script.
7. **Route motion through the two named curves, ≤300ms (cross-view 300–400ms), 0ms for
   keyboard-initiated surfaces, `transform`/`opacity` only.** *Fails as:* a 600ms `all` ease-in-out
   that reads as latency. `spring-tokens.mjs --check` exits 0 on a CSS file with no motion tokens at
   all and `gate.mjs` does not run it; `design-audit.mjs` catches `transition: all`, nothing else.
8. **Author colour in OKLCH; in markup use shadcn semantic names** — `bg-primary`, never `bg-zinc-900`,
   never a raw hex. *Fails as:* a screen the theme cannot restyle and a dark mode that drifts from
   light. Raw hex hard-fails and AS-01/01b/01c cover the purple family; every other palette family
   (`bg-zinc-900`, `text-gray-400`, `border-slate-700`) passes clean in BUILD mode. `import-gate.mjs`
   IG-05 catches it, and only on pulled registry files.

**The other four moved and are decided:** tokens before markup → the `@theme` probe · compose from the
cookbook → `import-gate.mjs`, in the one mode where it can be violated · the full state matrix →
AS-20 + `--lens` · `focus-visible` + 4.5:1 in both themes → `design-audit.mjs`'s focus probe + AS-11 +
axe, with one hole to cover by hand: that probe accepts any `box-shadow`, so a Tailwind `ring-*` used
as the indicator passes and is still a defect — the ring is an `outline`, 2–3px solid,
`outline-offset: 2px`. Run the gates before done → `gate.mjs`.

## The scripts

**One exit-code contract, every script:** `0` clean · `1–63` the violation count, clamped at 63 ·
`64–79` harness error (64 usage · 65 missing dep · 66 navigation failed · 67 no target). A gate that
returns 4 means four violations, never "Playwright is missing". They live in
`.claude/skills/superdesign/scripts/`; the seven older ones keep a repo-root symlink for one release.

| Script | What it decides | 1–63 means |
|---|---|---|
| `gate.mjs` | Phase 4 — every source check below, over one file list | the **max** over its children, never the sum |
| `recon.mjs` | Phase 0 fired, and its steal lines are filled | missing measurements + empty steals |
| `import-gate.mjs` | Phase 3's COMPOSE fork — a pulled item builds against our deps, is reduced-motion gated, `aria-hidden` on cloned repeats | blockers in the pulled file |
| `anti-slop-gate.sh` | 24 source rules read from `data/anti-slop-rules.json` | hard rules that fired (`note` rules print, never count) |
| `design-audit.mjs` | rendered geometry + axe; caps calibrated between the gate-clean `examples/` and `scripts/fixtures/slopped-geometry.html`, never loosened to pass a screen | failed caps + serious/critical axe violations |
| `palette.mjs` | the OKLCH ramp, and a full AA census in both modes | failing fg/bg pairs + breached hard caps |
| `validate-chart-palette.mjs` | chart-slot legality, including CVD simulation | failed checks, per mode |
| `check-tw-merge-tokens.mjs` | `cn()` silently eating custom `--text-*` tokens | tokens `twMerge` will drop |
| `spring-tokens.mjs --check` | spring `linear()` tokens against their generator | drifted tokens |
| `extract-reference.mjs --diff` | Phase 5 differentiation over six mechanics | axes that did NOT move |
| `check-pointers.mjs` | every path and anchor this package names | dead pointers |

`design-audit.mjs` also prints five **uncapped** numbers that measurably do not separate good work
from slop: read them, do not gate on them. Two pointers no phase carries: `Skill(dataviz)` for any
chart, KPI tile or sparkline — invoke it, never improvise a series palette — and
`references/performance.md` for the Core Web Vitals budgets. **Never hold `references/anti-slop.md` +
`references/critique.md` + `references/accessibility.md` in one window:** together they are 150+
simultaneous constraints, the density at which errors shift from modification to omission (IFScale,
arXiv 2507.11538). Put the two highest-stakes constraints FIRST and LAST in any prompt you write
(arXiv 2307.03172).

## Done

`recon.mjs --check`, `gate.mjs <dir> --url <route>` and `palette.mjs --check <theme.css>` exit 0, and
where a reference was measured so does `extract-reference.mjs --diff`; no P0/P1 is open; the eight
MUSTs hold — a stranger could name the aesthetic, the direction was the least probable one that
cleared the brief, the screen reads in grayscale, the copy is real, the accent is scarce,
`internal ≤ external` holds everywhere, motion is two curves under the cap, one theme drives every
screen; and it was seen at both sizes in both themes with a clean console. A gate that could not run
is named in one line, never counted as passed.
