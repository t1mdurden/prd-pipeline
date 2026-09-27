# App surfaces — assembling from blocks

The owner's hired desk went through three builds on 2026-09-27. The first two were hand-built and
rejected («очень такой себе», «выглядит очень дешево»). The third, `dashboard-01` with its demo parts
removed — inset sidebar, site header, four metric cards, a 90-day area chart, tabbed lists — on the
preset's neutral palette with Onest for Cyrillic, is the one he accepted. Start there unless the brief
says otherwise.

## Which base for which need

| Need | Base | Note |
|---|---|---|
| the whole shell of a working tool | `dashboard-01` | sidebar (inset) + header + cards + chart + table; the default |
| shell, navigation-heavy | `sidebar-07` (collapses to icons), `sidebar-08` (inset + secondary nav), `sidebar-03` (submenus) | pair with your own content area built from the parts below |
| metric row | `dashboard-01`'s `section-cards.tsx` | copy its anatomy for every KPI |
| time series, other charts | `dashboard-01`'s `chart-area-interactive.tsx` — with `BRAND: none`, the neutral presets' `--chart-1` is a pale grey on white: draw one series at a time in `--primary` with a switcher, not three greys at once; `catalog.mjs search chart --surface app` (free `chart-card`/`chart-group` blocks); or the `chart` primitive with a Recharts type | charts use `--chart-1…5`; the brand lands on `--chart-1`. shadcn's 69 chart examples live only in the `new-york-v4` registry: installing one by URL into a 2026-style project overwrites `ui/chart.tsx` with another style's version |
| list / records | `dashboard-01`'s `data-table.tsx` (tabs, column toggle, drag rows) | tabs over tables was the accepted desk's pattern. It is `@tanstack/react-table` **v9**; shadcnblocks `data-table*` blocks are v8 code — installing one next to dashboard-01 gives ~50 type errors. Use them only in a project without dashboard-01 |
| settings / profile form | `@shadcnblocks/settings-profile1`, then shadcn `field` for more fields | |
| sign-in | `login-03`/`login-04`, `signup-0N` | |
| empty, loading, spinner | shadcn `empty`, `skeleton`, `spinner` components | fetched data has all three states; a static JSON import has only the empty one |

## The anatomy that makes dashboard-01 look finished — keep it when adapting

- **Card composition, always complete**: `CardHeader` → `CardDescription` (label) + `CardTitle` (the
  number) + `CardAction` (a `Badge variant="outline"` with a trend icon); then `CardFooter` with one
  strong line and one muted line. A card that is a bare `div` with text is the cheap version.
- **Numbers**: `tabular-nums`, `text-2xl` growing to `text-3xl` by the card's own width
  (`@[250px]/card:text-3xl`), formatted with `Intl.NumberFormat` in his locale.
- **Container queries, not viewport breakpoints**: `@container/main` on the content, `@xl/main:grid-cols-2
  @5xl/main:grid-cols-4` on the card row — the grid follows the space the sidebar leaves.
- **One spacing step per breakpoint**: `gap-4 py-4 md:gap-6 md:py-6`; gap and padding move together.
- **Colour restraint**: cards get the preset's 5% primary gradient (`from-primary/5 to-card`, flat in
  dark); status is a `Badge` variant; the brand hue appears on the primary action, the current nav item
  and `--chart-1` — nowhere as a ground.
- **Nothing decorative**: every region is a real component bound to real data.

## Adapting it

1. `node $SD/base.mjs add dashboard-01` — in Vite the CLI installs the components but not
   `app/dashboard/page.tsx`; base.mjs writes it with imports rewritten. Render it from `App.tsx` inside
   `<TooltipProvider>` (the sidebar's tooltips throw without it — blank page).
2. Replace `data.json` with a typed fetch of the real data; keep the three states per region.
3. Rename the nav to his sections; delete `nav-documents.tsx`, the "Quick Create" button, `nav-user`'s
   demo identity, "Acme Inc." — `check.mjs` fails leftovers.
4. Change what the cards count, not how the card is built.

## Traps seen in real runs

- `npx tsc -b` fails on the official `site-header.tsx` (unused `Button`) under Vite's `noUnusedLocals`;
  `vite build` does not notice. Delete the unused import in the block file.
- `SidebarInset` already renders `<main>`; a page component with its own `<main>` is a duplicate
  landmark that axe's serious/critical filter does not report.
- Radix builds ids from a tab's `value`; a value with spaces or commas makes an invalid
  `aria-controls`. Use slug values (`value="replied"`), put the words in the trigger. A `TabsList` used
  as a filter with no `TabsContent` points `aria-controls` at nothing (axe `aria-valid-attr-value`):
  render the filtered content inside `TabsContent`.
- A sidebar variant on a dashboard-01 clone: `base.mjs add sidebar-07 --overwrite` replaces the shared
  sidebar files; its page lands in `src/pages/sidebar-07.tsx` (dashboard-01 already owns
  `app/dashboard/page.tsx`) — render that page, or the variant differs only in its sidebar.
- `CONVERSION: form` on an app means "he sets values here"; `check.mjs` accepts any live control
  (select, switch, checkbox, input) — no `<form>` wrapper needed.
- Local tools with Russian UI: set `lang="ru"` on `<html>`, and give the font a Cyrillic subset
  (`base.mjs font "Onest Variable" @fontsource-variable/onest`).
