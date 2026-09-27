---
name: superdesign
description: >-
  Build or restyle web UI in React + Tailwind v4 + shadcn/ui by assembling installed blocks and
  letting the owner pick between live variants, never by inventing a design system. Use for any
  screen, dashboard, admin or internal tool, landing page or marketing site, restyle of an existing
  app, and for choosing a theme, font or brand colour on a shadcn project; also when a UI looks
  cheap, generic or AI-made. Russian triggers: «сделай дизайн», «сверстай лендинг», «переделай
  интерфейс», «выглядит дешево». Not for backend logic or copy with no surface.
---

# superdesign

Finished-looking UI is **selected, then adapted** — a shipped block, a shipped preset — not invented
per project. Every build the owner rejected was hand-authored: a random style draw put a newspaper
look on his work tool, and a hand-built "clean app" read as cheap with every gate green. The build he
accepted was shadcn's `dashboard-01` with his data in it. So this skill does four things: finds a
**base** for every region of the page, lets **him** choose between live variants, assembles, and
**probes** for defects. It never grades taste — nothing automated here can, and a model judge measured
on his own labelled builds picked by screen position, not by quality.

Scripts live in `~/.claude/skills/superdesign/scripts/`; run them from the project root.
`SD=~/.claude/skills/superdesign/scripts` below.

## Surface

Decide it first; it picks the catalog and the rules.

| Surface | What it is | Base comes from | Extra rules |
|---|---|---|---|
| `app` | internal tool, dashboard, admin, settings, CRUD, anything used daily | official shadcn blocks (dashboard-01, sidebar-01…16, login/signup) + free shadcnblocks app items (data tables, settings, chart cards) | sans only, radius > 0, a route must render an installed block — `lint.mjs` enforces all three · [app.md](references/app.md) |
| `marketing` | landing page, company site, product page | free shadcnblocks marketing sections (hero, logos, feature, pricing, cta, contact, footer…) | photography placed in the hero, real logos, a form if it converts by form — `check.mjs --brief` enforces · [marketing.md](references/marketing.md) |
| `component` | one piece inside an existing product | the product's own components | match the product; no picker |

**Restyle** is a mode, not a surface: an existing codebase keeps its components and routes, gets a
preset and a composition change, and follows its surface's rules (`SURFACE: app (restyle)`).

## The run

### 1. Project

No shadcn project yet → `npx shadcn@latest init -t vite -b radix -p <preset> -n <name> --no-monorepo`
(app default preset `vega`, marketing `nova`), then `npm i -D playwright axe-core && npx playwright install chromium`.
An existing project → `npx shadcn@latest info` tells you style, base and aliases.

### 2. Brief → `DESIGN.md` at the project root

```
SURFACE:      app | marketing | component   [(restyle)]
FOR:          who uses it, how often, on what screen
BASE:         region → block id, one line per region (filled in step 3)
PRESET:       vega | nova | mira | …      BRAND: oklch(L C H) or none      FONT: family or preset's
HERO-VISUAL:  public/hero.jpg [public/…]  |  none — owner, <date>          (marketing only)
ASSETS:
  logo:         public/logo.svg  |  UNAVAILABLE — asked <date>
  client-logos: public/clients/*.svg  |  UNAVAILABLE — asked <date>
  photography:  public/photos/…  |  unsplash:<query>  |  UNAVAILABLE — asked <date>
CONVERSION:   form | call | link | none
PICKED:       variant name, who picked, date   |   unattended default
```

Ask him for what the brief cannot know: the logo and brand colour the business already owns, the
photos, who converts how. Then **open every asset you were given** (Read the image): a "logo" that is a
page screenshot or a 40px icon, or a hero photo of the wrong service, is a question for him, not a file
to place — no probe can see what a picture shows. **Done when** every line has a value, every asset was
looked at, and every `UNAVAILABLE`/`none` names who said so. Only the owner may say `HERO-VISUAL: none`.

### 3. Bases

For each region of the page, search before writing a line of JSX:

```bash
node $SD/catalog.mjs search sidebar inset --surface app
node $SD/catalog.mjs search hero split image --surface marketing --image
```

Free items print their install id (`dashboard-01`, `@shadcnblocks/hero1`). shadcnblocks ids need
`"registries": { "@shadcnblocks": "https://www.shadcnblocks.com/r/{name}" }` in `components.json`.
Nothing fits → widen the words, then `npx shadcn@latest search -q <word>`; that search does not mark
paid items, so check a shadcnblocks hit first (`curl -s -o /dev/null -w '%{http_code}'
https://www.shadcnblocks.com/r/<name>` → 401 is Pro).
**Done when** every region in `BASE:` names an id, or says `no block — searched: <words>`; only those
regions may be written by hand.

### 4. Picker — he chooses before features exist

First a thin pass of his content into the default base — his nav labels, his real numbers or sample
data in his language, his photos — so he compares his product, not a revenue demo. Then:

```bash
node $SD/variants.mjs clone shell table          # 2–3 copies of that first pass
cd .superdesign/variants/table && node $SD/base.mjs add sidebar-07 --overwrite && …   # make each one different
node $SD/variants.mjs serve                      # each variant on its own port, keys 1–3 flip
```

Variants differ where it shows. **App**: composition — dashboard-01's inset shell · a sidebar-NN shell ·
a table-first layout — under one preset; presets alone are near-identical greys, and his "cheap" build
was already his own pick of a direction. **Marketing**: the hero block and the preset. Give each a
one-line "wins when / costs" and send him the URL plus `serve --shots` screenshots. His pick →
`variants.mjs keep <name>`, `PICKED:` in DESIGN.md.

**Unattended** (nobody to ask): build on `vega` + `dashboard-01` with the `sidebar-07` sidebar (app) or `nova` + the first `--image`
hero (marketing) and write `PICKED: unattended default`; still leave `serve --shots` screenshots of 2–3
variants for him to choose from later. The run ends UNPROVEN.

Presets: `vega` clean neutral · `nova` tighter padding · `mira` compact · `maia` rounded, generous ·
`luma` soft · `rhea` luma-compact — all fine for `app`. `lyra` (boxy, mono) and `sera` (editorial,
serif) are content-site styles: marketing only, and only when he picks them.

### 5. Assemble

Everything arrives through `base.mjs`, which records it for lint:

```bash
node $SD/base.mjs add dashboard-01 @shadcnblocks/data-table1   # also recovers pages the CLI skips in Vite
node $SD/base.mjs apply nova                                    # switch preset
node $SD/base.mjs brand "oklch(0.52 0.12 170)"                  # brand → primary/ring/chart-1/sidebar-primary; on marketing also tints the greys to its hue
node $SD/base.mjs font "Onest Variable" @fontsource-variable/onest   # Cyrillic-first sans
```

Then make it his: real data in place of `data.json`, his copy, his images and logos; delete the demo
parts he has no use for (nav-documents, "Quick Create", "Acme Inc."). Block files are yours after
install — adapt them inside their anatomy. `components/ui/*` stays as installed; a look change goes
through `base.mjs` or into your own component. The surface's reference file carries the anatomy and
the traps: [app.md](references/app.md), [marketing.md](references/marketing.md); finishing details for
both in [craft.md](references/craft.md).

### 6. Probe

```bash
npx vite --port <free port> --strictPort &               # other projects hold 5173; use the URL it prints
node $SD/lint.mjs                                        # ui-fork · theme · serif · radius-0 · hand-built · raw-colour
node $SD/check.mjs http://localhost:<port>/ --brief DESIGN.md   # runtime · void · clip · axe · overflow · leftovers · hero · assets · form · ground
npx tsc -b                                               # blocks ship unused imports that vite build ignores
```

Every route gets a `check.mjs` run; each URL writes its own `.superdesign/shots/<url>/`, viewport and
full-page. **Done when** all three exit 0. Exit codes: `1–63` defects to fix · `64` usage · `65` no base
or no SURFACE · `67` unreachable, or the port serves another app (its `<title>` ≠ `./index.html`'s) ·
`69` a dependency is missing · `70` the script crashed — never read 67/69/70 as a count or as clean.
Then read the full-page shots yourself: clipped labels, wrapping numbers, a chart you cannot read — the
probes do not see those. A defect you judge wrong is fixed or argued in DESIGN.md, never silenced by
editing the script.

### 7. Show him

Send the screenshots `check.mjs` wrote under `.superdesign/shots/` (full-page at 1440 and 390, and
the dark viewports) plus the picker shots, and the running URL. **Done means he said yes.** Probes at 0 mean "no defects found", nothing more. Unattended
or not yet seen: report UNPROVEN and what he needs to look at.

In the superdesign repo itself, every real run gets an entry in `evals/field-runs/` the same day.
