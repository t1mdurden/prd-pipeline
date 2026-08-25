# Data table (sortable, filterable, dense)

> A keyboard-first, dense-but-calm data table built on the industry-standard
> **headless engine + presentational shell** architecture: [TanStack Table v8]
> owns the logic (sort, filter, facet, select, paginate), [shadcn/ui] `Table`
> primitives render semantic `<table>` markup, and Radix popovers/menus drive the
> toolbar. This is the pattern Linear, Stripe, and Vercel ship.

- **Stack:** React 19 + Tailwind v4 + shadcn/ui (new-york) + TanStack Table v8
- **Slug:** `data-table`
- **Complexity:** High — but the 3-file split keeps each file small and reusable.

## Contents

- [1. When to use it](#1-when-to-use-it) — when a table beats a list, cards, or a chart
- [2. Anatomy](#2-anatomy) — the five regions: toolbar, header, body, bulk bar, pagination
- [3. Token-driven styling](#3-token-driven-styling) — the variable layer, plus what every unsized column silently gets
- [4. Variants](#4-variants) — client-side faceted (default) · server-side, URL-synced
- [5. Interaction / state matrix](#5-interaction--state-matrix) — loading, inline edit, live values, multi-sort, selection scope
- [6. Responsive behavior](#6-responsive-behavior) — one bounded scroll box, frozen identity + action columns
- [7. Accessibility](#7-accessibility) — semantic `<table>`, the grid keyboard model, what virtualization costs
- [8. Anti-slop callout](#8-anti-slop-callout) — the tells a reviewer should reject on
- [9. Complete, copy-pasteable code](#9-complete-copy-pasteable-code) — the 3-file split plus column header, facets, toolbar, pagination, bulk bar
- [10. Production checklist](#10-production-checklist) — the pre-ship boxes
- [Sources](#sources)
- [Corpus grounding — dense tables & lists (2026-07-05 research)](#corpus-grounding--dense-tables--lists-2026-07-05-research) — copyable rules with values, token/motion defaults, slop failures

---

## 1. When to use it

Reach for this recipe when users need to **scan, compare, sort, and act on many
structured records** — issues, invoices, users, deployments, transactions.

| Use a data table when… | Use something else when… |
|---|---|
| Rows share a schema and columns are comparable across rows | Each record is a rich document → use cards or a detail page |
| Users sort/filter/select/bulk-act | You show ≤ a handful of key/value pairs → use a description list |
| Density and scan-ability matter (finance, ops, admin) | The data is a hierarchy or nested tree → use a tree/outline view |
| Rows are auditable and referenceable ("row 42", "invoice #INV-203") | The primary interaction is a single continuous feed → use a virtualized list |

**Sizing the engine to the data — budget DOM nodes, not rows.** No grid library publishes a
row-count threshold for "start virtualizing"; the citable budget belongs to the browser.
Lighthouse "[w]arns when the body element has more than ~800 nodes" and "[e]rrors when the body
element has more than ~1,400 nodes" ([Lighthouse DOM size]). A 7-column row with badges + a
checkbox + a kebab is ~8–15 nodes, so **~100–120 rendered rows already reaches the error
ceiling** — before the rest of the page counts.

- **Paginate. That is the default for this recipe.** `pageSize: 25` keeps rendered rows in the
  low hundreds for free, and NN/g's independent "View All" ceiling lands on the same number
  (~100 items). Two unrelated budgets converge on **~100 rendered rows**; treat that as the cap.
- **Virtualize when you refuse to paginate** — one continuous list, not a row count. Add
  [TanStack Virtual] (windowed body, sticky header) and read §7.2 first: virtualization has real
  accessibility costs. Do **not** make the table engine the scroll container.
- **Go server-side when the payload is too big to ship.** That is AG Grid's own criterion —
  move to Infinite/Server-Side when "the amount of data is too large to shift over the network"
  ([AG Grid row models]). Flip on `manualSorting / manualFiltering / manualPagination`, sync
  state to the URL, and refetch: same components, different data source.

---

## 2. Anatomy

Five canonical regions, top → bottom:

```
┌─────────────────────────────────────────────────────────────────────┐
│  TOOLBAR                                                             │  ← global search · faceted filters · active-filter chips + Reset
│  [ Search… ]  [Status ▾] [Priority ▾]  ·  Reset ✕      [View ▾] [+]  │    · View (column visibility) · density · primary action
├───┬──────────────┬────────────┬──────────┬────────────┬─────────────┤
│ ☐ │ TASK ▲       │ TITLE      │ STATUS   │ PRIORITY   │        [⋯]   │  ← HEADER: select-all · sort chevron · aria-sort
├───┼──────────────┼────────────┼──────────┼────────────┼─────────────┤
│ ☐ │ TASK-8782    │ Convert…   │ ● In prog│ ↑ High     │        [⋯]   │  ← BODY rows: checkbox (hover/focus-revealed) ·
│ ☐ │ TASK-7878    │ Try to…    │ ○ Backlog│ → Medium   │        [⋯]   │    typed cells · row actions kebab
├───┴──────────────┴────────────┴──────────┴────────────┴─────────────┤
│  0 of 100 row(s) selected.        Rows/page [25 ▾]  ‹ Page 1/4 › »   │  ← FOOTER: selection count · rows-per-page · page controls
└─────────────────────────────────────────────────────────────────────┘
    ▲ sticky header on vertical scroll · freeze identity (first) + actions (last) column on horizontal scroll
    ▲ on selection: a bottom-fixed BULK-ACTION BAR slides in
```

1. **Toolbar** — global search (debounced), faceted filter popovers, active-filter chips + "Reset", column-visibility ("View") menu, optional density switcher, primary action (Add/Import/Export).
2. **Header row** — column titles, sort affordance (chevron that never shifts text alignment), select-all checkbox, optional resize handles on separator hover.
3. **Body** — rows → cells. Row-level: checkbox (revealed on hover/focus), typed cells, hover/focus-revealed `⋯` actions menu, optional expand chevron.
4. **Footer / pagination** — "X of Y selected", rows-per-page selector, page controls.
5. **Sticky/frozen** — header pins on vertical scroll; first (identity) + last (actions) columns can freeze on horizontal scroll.

**Cell building blocks:** text, numeric (tabular + right-aligned), badge/status, avatar+name, date, truncated-with-tooltip, editable.

---

## 3. Token-driven styling

Every color comes from a **shadcn CSS variable** (`--background`, `--muted`,
`--border`, `--ring`, `--primary`…), consumed through Tailwind utilities
(`bg-background`, `text-muted-foreground`, `border-border`, `ring-ring`). No
hardcoded hex anywhere — the table inherits light/dark and any rebrand for free.

```css
/* app/globals.css — Tailwind v4, @theme inline maps tokens to utilities.
   These are the shadcn defaults you already have; shown for reference. */
:root {
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  --muted: oklch(0.97 0 0);
  --muted-foreground: oklch(0.556 0 0);
  --border: oklch(0.922 0 0);
  --ring: oklch(0.708 0 0);
  --primary: oklch(0.205 0 0);
  --primary-foreground: oklch(0.985 0 0);
  --radius: 0.5rem;   /* 8px — required brand-step output, never a default (→ tokens.md §6) */
}
.dark {
  --background: oklch(0.145 0 0);
  --foreground: oklch(0.985 0 0);
  --muted: oklch(0.269 0 0);
  --muted-foreground: oklch(0.708 0 0);
  --border: oklch(1 0 0 / 10%);
  --ring: oklch(0.556 0 0);
}
```

**The whole visual system in tokens** (this is what makes it read as "calm dense"):

| Concern | Token / utility | Rationale |
|---|---|---|
| Row separator | `border-b border-border` (1px) | One subtle divider, not borders-everywhere |
| Hover row | `hover:bg-muted/50` | ~50% muted so it never fights selection |
| Selected row | `data-[state=selected]:bg-muted` | Persistent, stronger than hover |
| Keyboard focus | `focus-visible:ring-2 ring-ring ring-offset-2 ring-offset-background` | Never rely on hover alone |
| Header text | `text-muted-foreground font-medium` | Recedes; content leads |
| Muted/secondary text | `text-muted-foreground` | IDs, timestamps, counts |
| Numeric cells | `tabular-nums text-right` | Aligned digits; scan for outliers |

> **`tabular-nums` is mandatory on every numeric cell + KPI, not a nicety.**
> Proportional figures are different widths, so a live-updating or re-sorted
> column visibly jitters horizontally and digits stop aligning down the column —
> the single most common table slop tell (→ anti-slop.md APP-UI
> `proportional-numerals`). At `VISUAL_DENSITY > 7`, go further: **`font-mono` on
> numeric columns** and drop card boxes for `divide-y` hairlines — this table's
> `rounded-md border` wrapper already does the latter (→ tokens.md §11
> density cascade). Applies to the faceted-filter counts and pagination
> counters too — every digit the user reads.

> **Density is not a hardcoded pixel value — it's ONE multiplier.** Don't
> hand-edit a full row-height/padding pair per tier — that drifts the moment you
> restyle. Drive every spacing value off a single `--density` scalar through
> `calc()`, so each tier changes **one number** and the geometry follows
> (→ tokens.md §11 named row-height tiers: compact 32 / default 48 / comfortable
> 52–64px; → tokens.md §5 spacing-through-`calc()` one-base pattern):

```css
@layer components {
  /* One knob per tier. calc() derives row-h + cell-py from the base + scalar. */
  [data-density]               { --density: 1;    } /* base = default (~48px)  */
  [data-density="compact"]     { --density: 0.72; } /* ~32px, Carbon "Short"   */
  [data-density="comfortable"] { --density: 1.15; } /* ~52–64px, touch-friendly */

  [data-density] {
    --row-h:   calc(3rem   * var(--density)); /* 48px base row height  */
    --cell-py: calc(0.75rem * var(--density)); /* 12px base cell padding */
  }
}
```

Cells then use `style={{ paddingBlock: 'var(--cell-py)' }}` and rows
`style={{ height: 'var(--row-h)' }}`, so density is one attribute on the wrapper
and one scalar in CSS. **Change PADDING/height, never font-size** — dense tiers
that shrink the type stop being scannable (→ anti-slop.md APP-UI
`single-density-lock`).

### 3.1 Column sizing — what every unsized column silently gets

```ts
// https://tanstack.com/table/latest/docs/guide/column-sizing
export const defaultColumnSizing = { size: 150, minSize: 20, maxSize: Number.MAX_SAFE_INTEGER }
```

`minSize: 20` is the dangerous one: it lets a user drag any column down to unreadability, and
well below the WCAG 24×24 floor for anything interactive inside it. Override per table:

```ts
const table = useReactTable({
  defaultColumn: { minSize: 64, size: 150 }, // 64px floor: a 24px target + padding
  columnResizeMode: "onEnd",                 // TanStack's own default, for a reason
  // …
})
```

- **`columnResizeMode` defaults to `'onEnd'`** — "By default, the column resize mode is set to
  `'onEnd'`", because "achieving 60 fps column resizing renders can be difficult … the `'onEnd'`
  column resize mode can be a good default option to avoid stuttering or lagging".
- **If you go `'onChange'`, the docs give you the whole recipe:** "Don't use `column.getSize()`
  on every header and every data cell. Instead, calculate all column widths once upfront,
  memoized!"; "Memoize your Table Body while resizing is in progress"; "Use CSS variables to
  communicate column widths to your table cells."
- **Double-click the header edge to autofit** is a real convention — AG Grid: "Each column can
  also be auto-resized by double clicking the right side of the header rather than dragging it."
- Resize-handle hit area: no library publishes one. Use **24px** (WCAG 2.5.8 AA) as the floor.
- Persist widths with the other view prefs, and offer a reset.

---

## 4. Variants

### Variant A — Client-side faceted table (this recipe's default)

Everything in memory. TanStack does sort/filter/paginate/facet. Toolbar has global
search + faceted multi-select popovers (Status, Priority) with **live counts** from
`getFacetedUniqueValues()`. Best while the whole set fits in memory and one page
stays under ~100 rendered rows. This is the shadcn "tasks" pattern and what the
code below implements.

### Variant B — Server-side, URL-synced table

Same components, but state lives in the URL query string and drives a fetch:

```tsx
// The only structural change: manual flags + state from the URL, data from a query.
const table = useReactTable({
  data,                       // ← from useQuery(['tasks', sorting, filters, page])
  columns,
  rowCount: totalCount,       // ← total from the server, not data.length
  manualSorting: true,
  manualFiltering: true,
  manualPagination: true,
  state: { sorting, columnFilters, pagination },
  onSortingChange: setSorting,        // setters write to URL (nuqs / searchParams)
  onColumnFiltersChange: setColumnFilters,
  onPaginationChange: setPagination,
  getCoreRowModel: getCoreRowModel(), // ← no getSorted/Filtered/Pagination row models
})
```

URL-synced state is what every best-in-class fork (openstatus, tablecn,
shadcn-admin) does: views become shareable, refresh-safe, and back-button-safe.
For very large or real-time sets, swap offset pagination for **cursor/keyset**
(Stripe's `starting_after` / `ending_before`) to avoid page-number drift.

---

## 5. Interaction / state matrix

Design **every** one of these — the empty and error states are where slop shows. A
table-scoped state machine cannot express "row 14 failed to save while rows 1–13 are fine",
so **scope is the first column**: table, row, or cell.

| Scope | State | Treatment |
|---|---|---|
| Table | **First load** (`isPending`) | Skeleton the **first ~5 rows**, keep the header + sort icons visible. Never a full-table centered spinner. |
| Table | **Background refetch** (`isFetching && !isPending`) | Keep the old rows, add a 2px top progress bar. **Do not dim the body** — dimming a table mid-scan is worse than a bar. |
| Table | **Showing previous page** (`isPlaceholderData`) | Say the rows on screen are the previous page's; disable Next "until we know a next page is available". |
| Table | **Empty — suppressed during load** | Loading *and* an empty query → render **nothing**. The empty state must not appear. |
| Table | **Empty — first run** | Illustration/message + primary CTA ("Create your first task"). |
| Table | **Empty — no results** | "No results found." + "Clear filters" (copy distinct from first-run). |
| Table | **Error — whole collection** | Inline "There was an error loading the data." + Retry; keep the header. |
| Table | **Error — partial page** | Render what loaded; scope the error to the failed part, never blank the table. |
| Table | **Truncated by a server cap** | State the cap and how to narrow. Stripe caps `limit` at **100**. |
| Table | **Stale with age** | Show *when* it was fetched, not a boolean — TanStack Query's `staleTime` default is `0`, so everything is stale immediately. |
| Table | **Offline / reconnecting** | Persistent, non-blocking banner; keep the last data on screen and say it is frozen. |
| Table | **Reconnected / resynced** | Announce via a live region **without moving focus** (SC 4.1.3, AA). |
| Table | **Rate-limited / retry scheduled** | Say when the next attempt happens; `retry` defaults to **3** on the client. |
| Table | **Sorted** | Active chevron (▲/▼) + `aria-sort`. Chevron must not shift header text alignment. |
| Table | **Multi-sorted** | Order-index badge per column (`tabular-nums`) + a "Clear sort" item. Multi-sort is **on by default** and Shift-triggered (§5.4). |
| Table | **Filtered** | Active-filter chips + Reset. |
| Table | **Virtualized — count unknown to AT** | `aria-rowcount`/`aria-colcount` on the container, `aria-rowindex`/`aria-colindex` per cell (§7.2). |
| Table | **Selection scope ambiguous** | State the scope: this page vs the filtered set vs everything (§5.5). |
| Row | **Default** | Quiet 1px bottom border (`border-b`), no fill. |
| Row | **Hover** | `hover:bg-muted/50`; reveals checkbox + `⋯` actions. |
| Row | **Focus (keyboard)** | Visible focus ring (`focus-visible:ring-2 ring-ring`). Never hover-only. |
| Row | **Keyboard cursor ≠ selection** | Two visually distinct states. The cursor moves with `J`/`K`/arrows; `X`/Shift+Space marks. Never merge them. |
| Row | **Selected** | Persistent tint (`data-[state=selected]:bg-muted`) + checked box; footer count updates. |
| Row | **Selected but scrolled out of view** | Selection survives scroll and unmount; the count stays accurate. |
| Row | **Range-extension anchor** | The anchor must be visible — shift-selection without one is unpredictable (§5.5). |
| Row | **Read-only, with a reason** | `aria-readonly` is conditional in the APG; pair it with a visible reason, never a bare grey row. |
| Row | **Disabled** | `text-muted-foreground`, `pointer-events-none`, no hover. |
| Row | **Optimistically inserted** | Pending affordance; roll back from the snapshot on error, never silently. |
| Row | **Saving** | Row-scoped pending state; the row stays readable and interactive where safe. |
| Row | **Save failed** | Row-scoped error + retry, **preserving the user's input**. |
| Row | **Deleted, undo window open** | Hold the row in place or swap it for an undo affordance; do not reflow the list under the cursor. |
| Row | **Conflicted** | Show both values and who changed it. Never silently overwrite. |
| Cell | **Focused (grid mode)** | Roving tabindex: `tabindex="0"` on the focused cell, `-1` on the rest, then `element.focus()` (§7.1). |
| Cell | **Editing / committed / cancelled** | Fixed-height input, no layout jump. Enter commits, Escape discards, Tab commits **and** moves (§5.2). |
| Cell | **Invalid in place** | Inline, cell-scoped, `aria-invalid`; keep the typed value. |
| Cell | **Value changed (live)** | 500ms hold, 1,000ms fade — a class toggle, not a keyframe (§5.3). |
| Cell | **Truncated** | A real inspect affordance, not only `title=` — see below. |
| Cell | **Empty vs zero vs null vs N/A** | Four meanings, **four renderings**: `0` is data, blank is missing, "—" is not-applicable, "Unknown" is unresolved. |
| Cell | **Cell-level loading** | Placeholder at the cell's real width; never collapse the column. |
| Cell | **Cell-level permission** | Masked with an explanation, not blank. |

> **Truncated cells need a real inspect affordance, not just `title=`.** A native `title` is
> invisible to touch and unreliable for AT as a substitute for content. Grafana ships an explicit
> one: an inspect icon opening an "Inspect value" drawer with **Plain text** and **Code editor**
> tabs. Minimum viable: a keyboard-reachable Radix `Tooltip` plus click-to-expand for anything
> that can exceed the column.

> Skeleton the first ~5 rows, not the whole set, and **keep the header live**. Shape them to the
> real row geometry (see §5.1) — a spinner or mismatched bar reflows on swap. Gate by duration
> (→ tokens.md §11 loading ladder): <1s show nothing · 1–10s skeleton · >10s progress + cancel;
> show-delay 150–300ms, min-visible 300–500ms. **Never render an empty state while a first load
> is in flight** — Raycast's List makes this a hard rule: the empty view "is *never* displayed if
> the `List`'s `isLoading` property is true and the search bar is empty".

> **Sort / reorder motion must be interruptible — transitions or springs, never
> `@keyframes`.** When a user re-sorts or drags a row, the rows are moving to new
> positions *while the user may fire the next sort*. CSS transitions and springs
> **retarget from the current position**; `@keyframes` restart from frame 0 and
> snap, so a rapid second sort visibly jumps (→ motion.md §8 interruptibility +
> spring-on-interrupt rule). Drive row travel with `transform` on the moving node (FLIP or a
> layout animation), keep it `≤ --duration-base` (200ms), and **never block the
> table** — rows stay clickable mid-animation. High-frequency re-sorts on a
> constantly-scanned grid stay calm: no bounce, no stagger.

### 5.1 Loading — skeleton shaped to the row, then crossfade

Skeleton the first ~5 rows using the **same cell geometry** (same `--cell-py`,
same column widths) so the swap is zero-layout-shift — a spinner or generic bars
reflow when data lands. Keep the header + sort icons live throughout. On arrival,
**crossfade skeleton → content** (opacity, ~150ms) so rows don't pop; break the
skeleton into per-row pieces if the payload streams, so filled rows reveal
progressively while the tail still shimmers.

**Three flags, three treatments.** TanStack Query gives you three, and generated tables
routinely collapse them into one `isLoading` prop:

| Flag | Meaning (verbatim) | Treatment |
|---|---|---|
| `isPending` | "there's no cached data and no query attempt was finished yet" | skeleton first ~5 rows |
| `isFetching && !isPending` | "if the query is fetching at any time (including background refetching)" | keep rows, 2px top bar. **Do not dim.** |
| `isPlaceholderData` | the rows on screen are the previous page's | say so; disable Next until the next page is known |

`isLoading` is "the same as `isFetching && isPending`", so a skeleton gated on a hand-rolled
`isLoading` prop **fires on every page change and destroys keep-previous-data** — which is why
the `DataTable` below takes an `isPending` prop, not an `isLoading` one. Gate the skeleton on
`isPending` only. Default `staleTime` is
`0`, so if you show a staleness indicator, show the fetch **time**, not the boolean.

### 5.2 Inline edit — the key contract

| Key | Result |
|---|---|
| Enter, F2, or any printable character | enter edit mode; a printable key **seeds the field** with that character |
| Double-click | enter edit mode (single-click edit is opt-in — AG Grid's `singleClickEdit` defaults to `false`) |
| Enter | **commit** |
| Escape | **discard** — "Unlike ↵ Enter, the ⎋ Esc action will discard changes"; the APG adds that Esc "restores grid navigation" |
| Tab / Shift+Tab | commit **and** move — "Editing will stop, accepting changes, and editing will move to the next cell, or the previous cell if ⇧ Shift is also pressed" |
| F2 again | "A subsequent press of F2 restores grid navigation functions." |

- Fixed-height input, no layout jump. Validate **in the cell**, and keep the typed value on failure.
- Write optimistically with a rollback snapshot, not a blocking spinner. `cancelQueries` first —
  without it an in-flight refetch can land *after* the optimistic write and silently revert it.
- Disabled editing: the APG says `aria-readonly` "**may** be set true on cells where editing is
  disabled" — it is conditional. Pair it with a visible reason, never a bare grey cell.

### 5.3 Live values — flash on change

AG Grid's published defaults are the copyable spec: on change it "adds the CSS class
`ag-cell-data-changed` for **500ms** by default … and then the CSS class
`ag-cell-data-changed-animation` for **1,000ms** by default." So **500ms hold, 1,000ms fade** —
a class/token toggle, never a `@keyframes` animation, because it must retarget when the next
tick lands mid-fade.

```css
@layer components {
  .cell-flash     { background-color: var(--flash); }                                  /* 500ms hold */
  .cell-flash-out { transition: background-color 1000ms linear; background-color: transparent; }
}
```

**Two hard limits, both WCAG SC 2.3.1 (Level A).** The general flash threshold is "[a] pair of
opposing changes in relative luminance of 10% or more of the maximum relative luminance (1.0)",
and nothing may flash "more than three times in any one second period". One cell on a 1.5s cycle
is 0.67 flashes/second and fine; **40 cells flashing independently is a page-level flash rate** —
batch the tick. Keep the flash tint's luminance delta under 10% and it is not a "flash" by the
spec's measure at all.

`prefers-reduced-motion` does **not** require removing it. MDN's own remedy for motion is to
"replace motion-based animations" with a "dissolve/opacity change" — a colour fade is already the
compliant form. What must go under `reduce` is any scale, slide, or pulse on the row.

### 5.4 Sorting — multi-sort is on by default and invisible

"Sorting by multiple columns at once is enabled by default if using the
`column.getToggleSortingHandler` API", it is **Shift**-triggered, and "[b]y default, there is no
limit to the number of columns that can be sorted at once." A user who shift-clicks gets a
silently multi-sorted table with no way to see or clear the secondary key. Ship all three:

- an **order-index badge** per sorted column (`tabular-nums`) — see `DataTableColumnHeader` in §9;
- a **"Clear sort"** item in the header dropdown;
- the explicit **Asc / Desc** menu items, kept rather than relying on click-cycling — because
  "the first sorting direction … is ascending for string columns and descending for number
  columns", which no user can predict.

### 5.5 Selection — scope and range are both yours to state

**Select-all has three possible scopes and the UI must name the one that is active.** TanStack
ships two distinct APIs precisely because they differ: `toggleAllPageRowsSelected`
"[s]elects/deselects all rows on the current page"; `toggleAllRowsSelected`
"[s]elects/deselects all rows in the table." On a filtered view "select all" can plausibly mean
this page (25), everything matching the filter (3,400), or everything (91,000) — three different
destructive blast radii. Ship the scope-escalation banner in §9.

> **Range selection is yours to build.** TanStack Table documents no shift-click or shift-arrow
> range selection (checked guide + API reference). You need an explicit **anchor row in state**:
> shift-click / Shift+↓ selects from the anchor to the current row; a plain click resets the
> anchor. The APG's vocabulary for the keyboard half is "Shift + Down Arrow — Extends selection
> one cell down" and "Shift + Space — Selects the row that contains the focus"; AG Grid adds an
> edge jump — Ctrl+Shift+arrow extends "to the last cell in the direction of the Arrow pressed".
> Without a visible anchor, shift-selection is unpredictable and users stop trusting it.

---

## 6. Responsive behavior

- **Wrap the table in one bounded scroll box** (`max-h-[70svh] overflow-auto`) with a `min-w`
  so columns never crush below legibility. One box, both axes — see the trap below.
- **Freeze identity (first) + actions (last) columns** on horizontal scroll via
  column pinning (`position: sticky; left/right: 0` on pinned cells) so users keep
  context while scrolling wide tables. TanStack "offers state and APIs helpful for
  implementing column pinning" and expects you to "use sticky CSS" yourself —
  `column.getIsPinned()`, `getStart()`, `getAfter()` give you the offsets. Copy AG Grid's
  guardrails while you're there: pinned sections capped at "the size of the `grid - 50px`",
  with automatic unpinning when they would hide the centre viewport.

> **The sticky-header trap — the single most common reason a sticky header silently does
> nothing.** `overflow-x-auto` (and
> `overflow-hidden`) on a wrapper makes *that wrapper* the sticky container: a sticky element
> "sticks" to its nearest ancestor with a "scrolling mechanism" (created when `overflow` is
> `hidden`, `scroll`, `auto`, or `overlay`), "even if that ancestor isn't the nearest actually
> scrolling ancestor". So the header pins to the wrapper, not the page — and if the wrapper
> never scrolls vertically, it never pins at all. Either bound the wrapper's height so it owns
> vertical scroll (`max-h-[70svh] overflow-auto`) and pin inside it, or hoist the sticky header
> out of the horizontal-scroll box. Two more mechanics from the same MDN page: a sticky cell
> needs a **non-`auto` inset on the axis it sticks on** — "[i]f both inset properties for an axis
> are set to `auto`, on that axis the `sticky` value will behave as `relative`" — and every
> sticky cell "always creates a new stacking context", which is *why* the z-order must be
> explicit (corner **4** / header **3** / pinned col **2** / body auto). With
> `border-collapse: collapse` a sticky header's borders can drop out; use
> `border-collapse: separate; border-spacing: 0` and draw the seam with `box-shadow`
> (**UNVERIFIED** against a bug report — treat as engineering practice, not a cited fact).
- **Toolbar collapses:** on narrow viewports, faceted filters fold into a single
  "Filters" popover/sheet; the "View" and density menus stay in an overflow menu.
- **Row height bumps to Spacious on touch** so hit targets clear the 24×24 CSS px
  WCAG 2.2 floor (aim for ~44–48px). Hover-revealed affordances must have a
  persistent equivalent on touch — never hover-only.
- **Below ~640px**, consider swapping the table for a **stacked card list** (label:
  value pairs per record). Tables are fundamentally 2-D; don't force one into a
  phone.
- **Pagination** stacks: rows-per-page selector above page controls.

---

## 7. Accessibility

- **Semantic markup.** shadcn `Table` renders a real `<table>`/`<thead>`/`<tbody>`.
  Keep it. Never rebuild it as `<div role="grid">` — but once rows carry 2+ controls,
  **add `role="grid"` to the real `<table>`** and implement the keyboard model (§7.1).
- **`aria-sort`** on the active sortable `<th>` (`ascending` / `descending` /
  `none`), toggled with the sort state. Sort control is a real `<button>` inside
  the header with an accessible label ("Sort by Status").
- **Selection.** Checkboxes are real inputs with labels ("Select row",
  "Select all"). Selected count is announced via an `aria-live="polite"` region.
- **Focus & keyboard.** Every actionable element (sort buttons, checkboxes, kebab
  menus, pagination) is tab-reachable with a visible `focus-visible` ring. Radix
  menus/popovers bring roving focus + Esc-to-close for free.
- **Touch targets** ≥ 24×24 CSS px (WCAG 2.2 Target Size, Minimum). Compact rows
  must still give checkboxes/actions a ≥24px hit area — pad the hit area, not the
  row.
- **State is not color-only.** Status/priority cells pair a color dot/badge with an
  **icon + text label** so meaning survives color-blindness and greyscale.
- **Loading/empty/error** live in an `aria-live` region so async changes are
  announced, not silently swapped.

> **Single-letter shortcuts are WCAG SC 2.1.4 (Level A)** — the strictest tier. "If a keyboard
> shortcut is implemented in content using only letter … punctuation, number, or symbol
> characters, then at least one of the following is true: **Turn off** … **Remap** … **Active
> only on focus: The keyboard shortcut for a user interface component is only active when that
> component has focus**." Take the third option: bind `J` / `K` / `X` on the **grid container's**
> `onKeyDown`, never on `document`. That satisfies 2.1.4 and fixes the "typing in the filter
> field fires an action" bug in the same line of code. Keep `⌘K` / `⌘B` on `document` — they
> carry a modifier and are out of scope for this SC.

### 7.1 The grid keyboard model (when rows carry 2+ controls)

Count focusable elements per row. At 3+ — checkbox + link + kebab, which is this recipe's
default — a plain `<table>` puts every one of them in the page tab sequence: **25 rows × 3 = 75
tab stops to cross one table.** The APG grid pattern exists to fix exactly that, and says so:
grid grouping "can dramatically reduce the number of tab stops on a page."

**Keep the semantic `<table>`; add `role="grid"`.** The APG permits this explicitly: "If the
element with the grid role is an HTML table element, then it is not necessary to use ARIA roles
for rows and cells because the HTML elements have implied ARIA semantics." Stay with a plain
table only when rows carry ≤1 focusable element.

**Focus management: roving tabindex, not `aria-activedescendant`.** The APG names exactly one
comparative benefit and it decides it here: "One benefit of using roving `tabindex` rather than
`aria-activedescendant` to manage focus is that the user agent will scroll the newly focused
element into view." Real DOM focus also keeps `focus-visible` and this recipe's `focus-within`
row reveals working unmodified, and `aria-activedescendant` requires the active element to be a
live DOM descendant — hostile to virtualization. Verbatim implementation: `tabindex="0"` on the
one focusable element, `tabindex="-1"` on the rest; on an arrow key, "set `tabindex="-1"` on the
element that has `tabindex="0"`. Set `tabindex="0"` on the element that will become focused as a
result of the key event. Set focus, `element.focus()`, on the element that has `tabindex="0"`."

| Key | Behaviour (verbatim, APG data grid) |
|---|---|
| ← / → | "Moves focus one cell to the left / right. If focus is on the left-most/right-most cell in the row, focus does not move." |
| ↑ / ↓ | "Moves focus one cell up / down. If focus is on the top/bottom cell in the column, focus does not move." |
| Home / End | "moves focus to the first / last cell in the row that contains focus." |
| Ctrl+Home / Ctrl+End | "moves focus to the first cell in the first row" / "the last cell in the last row." |
| Page Up / Page Down | "Moves focus up / down an author-determined number of rows" |
| Shift+Space | "Selects the row that contains the focus." |
| Ctrl+Space | "selects the column that contains the focus." |
| Ctrl+A | "Selects all cells." |
| Shift+← ↑ → ↓ | "Extends selection one cell to the left / up / right / down." |
| Enter | "Disables grid navigation and: If the cell contains editable content, places focus in an input field. If the cell contains one or more widgets, places focus on the first widget." |
| F2 | enters edit; "A subsequent press of F2 restores grid navigation functions." |
| Escape | "restores grid navigation. If content was being edited, it may also undo edits." |
| Tab (while editing) | "moves focus to the next widget in the grid." |

⚠️ **AG Grid diverges** — it binds Home/End to the first/last **rows** and Ctrl+←/→ to
start/end of line. Follow the APG: it is the spec and it matches spreadsheet Ctrl+Home semantics.

**Where focus lands depends on cell content** — the APG's two documented optimal patterns: "A
cell contains one widget whose operation does not require arrow keys and grid navigation keys set
focus on that widget" / "A cell contains text or a single graphic and grid navigation keys set
focus on the cell."

**When virtualized, the count must come from ARIA:** set `aria-rowcount`/`aria-colcount` on the
container and `aria-rowindex`/`aria-colindex` per cell — the APG conditions these precisely on
"conditions where some rows or columns are hidden or not present in the DOM."

### 7.2 What virtualization costs, and the required mitigations

- **Assistive tech loses the set size and position.** The ARIA above is not optional; it is the
  mitigation.
- **Server-side data can't be counted at all.** AG Grid documents the limit: "Announcing the row
  count in the grid when using server-side row model (SSRM) is not supported." Same page:
  "Screen readers won't detect changes to focused elements; users must move focus away and back."
- **`aria-activedescendant` is not an option.** The active element must be a live DOM descendant
  of the focused container (or `aria-owns`-ed in) — an unmounted row cannot be referenced. Use
  roving tabindex.
- **Ctrl+F, print and export miss unmounted rows** (**UNVERIFIED** against a primary source, but
  a direct consequence of not rendering them). Provide an export path and a server-side search.
- **Canvas grids trade accessibility away, by their authors' own admission.** Glide Data Grid
  "scales to millions of rows" because "[o]nce you need to load/unload hundreds of DOM elements
  per frame nothing can save you" — and its README states "none of the primary developers are
  accessibility users so there are likely flaws in the implementation we are not aware of."
  **Never choose a canvas grid for a surface with an accessibility obligation.**

---

## 8. Anti-slop callout

> These are the tells that separate a shipped-by-Linear table from a generated one.
> Reviewers should reject on any of these:

- ❌ **Hover-only actions/checkboxes** with no keyboard/focus/touch equivalent. The
  single most common a11y failure. Mirror every hover affordance on `focus-within`.
- ❌ **Center-aligned text or numbers.** Kills scan-ability and hides outliers.
  Text left, numbers right + `tabular-nums`, headers match their cells.
- ❌ **Proportional numerals for money/metrics** — `$1,111.11` looks smaller than
  `$999.99`. Always `tabular-nums`.
- ❌ **Zebra striping in an interactive table.** It fights hover/selected/disabled/
  focus tints — you end up with 5 competing greys. Use one subtle divider.
- ❌ **Borders everywhere.** Noise. Let whitespace + a single 1px row divider carry
  structure.
- ❌ **Full-table centered spinner** on load. Skeleton the first ~5 rows, keep the
  header.
- ❌ **One generic empty state** for both first-run and no-results. They need
  different copy and different CTAs ("Create your first…" vs "Clear filters").
- ⚠️ **Choose the paging model by surface class, not by reflex** (NN/g, Jakob Nielsen,
  2013-04-28 — https://www.nngroup.com/articles/item-list-view-all/):
  - **≤ ~100 items → render them all.** "View All is usually better than the annoying
    infinitely scrolling web pages"; NN/g's View-All ceiling is ~100 items. A pagination
    control over 40 rows is pure friction.
  - **Bounded, auditable, referenceable set → paginate.** "pagination is usually better than
    infinite scroll if there are too many items." Cursor-paginate when the set mutates under
    the user — Stripe's `starting_after` / `ending_before`, `limit` default **10**, max
    **100** — because offset pages drift when rows are inserted.
  - **Unbounded reverse-chronological feed → an explicit "Load more" button**, never
    automatic-on-scroll: it keeps the footer reachable and leaves a keyboard-focusable control
    at the end of the list. Automatic-on-scroll loading is the pattern to refuse, not
    "everything that isn't pagination".
  - **Rows-per-page control:** prefer one sensible default + "View All" over a 10/20/30/40
    menu; if you must offer numbers, "the choice between two numbers, say 10 and 50, where the
    second number is substantially bigger than the default." And **persist the choice** — "the
    computer should almost always respect the user's stated preference and employ it as the
    default the next time around."
- ❌ **A select-all whose scope the UI never states.** Page vs filtered vs everything are three
  different destructive blast radii (§5.5).
- ❌ **Sort chevrons that shift header alignment** — jitter on every click. Reserve
  space for the icon.
- ❌ **More than ~100 rendered rows in the DOM** with no pagination, virtualization, or server
  paging. Lighthouse errors above ~1,400 body nodes; a 7-column row is ~8–15 of them.
- ❌ **Non-persistent density/column/filter prefs** and **no "reset to default"** —
  erodes trust; users re-configure every visit.
- ❌ **Cramming a button into every row.** Reveal actions opportunistically in a
  `⋯` menu.

---

## 9. Complete, copy-pasteable code

The canonical **3-file split** (`columns` / `data-table` / `page`) plus the shared
toolbar, pagination, and column-header sub-components. Uses only shadcn primitives
+ Tailwind + TanStack Table.

### Setup

```bash
npx shadcn@latest add table button checkbox badge input \
  dropdown-menu popover command separator skeleton select
npm i @tanstack/react-table
```

### `types.ts` — the row model

```tsx
export type TaskStatus = "backlog" | "todo" | "in_progress" | "done" | "canceled"
export type TaskPriority = "low" | "medium" | "high"

export type Task = {
  id: string          // "TASK-8782"
  title: string
  status: TaskStatus
  priority: TaskPriority
  estimate: number    // story points — a numeric column
  updatedAt: string   // ISO date
}
```

### `data-table-column-header.tsx` — sortable header with `aria-sort`

```tsx
"use client"

import type { Column, Table } from "@tanstack/react-table"
import { ArrowDown, ArrowUp, ChevronsUpDown, EyeOff, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface DataTableColumnHeaderProps<TData, TValue>
  extends React.HTMLAttributes<HTMLDivElement> {
  column: Column<TData, TValue>
  table: Table<TData>
  title: string
}

export function DataTableColumnHeader<TData, TValue>({
  column,
  table,
  title,
  className,
}: DataTableColumnHeaderProps<TData, TValue>) {
  // Non-sortable column: plain label, no interactive chrome.
  if (!column.getCanSort()) {
    return <div className={cn(className)}>{title}</div>
  }

  const sorted = column.getIsSorted() // "asc" | "desc" | false
  const sorting = table.getState().sorting

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Sort by ${title}`}
            // -ml-2 so the ghost hit-area aligns the label with static headers.
            className="-ml-2 h-8 data-[state=open]:bg-accent"
          >
            <span>{title}</span>
            {/* Fixed-size icon slot: never shifts the label alignment. */}
            {sorted === "desc" ? (
              <ArrowDown className="ml-1 size-3.5" />
            ) : sorted === "asc" ? (
              <ArrowUp className="ml-1 size-3.5" />
            ) : (
              <ChevronsUpDown className="ml-1 size-3.5 opacity-50" />
            )}
            {/* Multi-sort is ON by default and Shift-triggered. Show the order
                index or the user cannot see — let alone undo — the secondary key. */}
            {sorted && sorting.length > 1 && (
              <span className="ml-1 rounded bg-muted px-1 text-[10px] tabular-nums text-muted-foreground">
                {sorting.findIndex((s) => s.id === column.id) + 1}
              </span>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {/* Explicit Asc/Desc, not click-cycling: the first direction is
              ascending for string columns and descending for number columns. */}
          <DropdownMenuItem onClick={() => column.toggleSorting(false)}>
            <ArrowUp className="size-3.5 text-muted-foreground" /> Asc
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => column.toggleSorting(true)}>
            <ArrowDown className="size-3.5 text-muted-foreground" /> Desc
          </DropdownMenuItem>
          {sorted && (
            <DropdownMenuItem onClick={() => column.clearSorting()}>
              <X className="size-3.5 text-muted-foreground" /> Clear sort
            </DropdownMenuItem>
          )}
          {column.getCanHide() && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => column.toggleVisibility(false)}>
                <EyeOff className="size-3.5 text-muted-foreground" /> Hide
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
```

### `columns.tsx` — the `ColumnDef<Task>[]`

```tsx
"use client"

import type { ColumnDef } from "@tanstack/react-table"
import {
  ArrowRight,
  ArrowUp,
  ArrowDown,
  CheckCircle2,
  Circle,
  CircleOff,
  MoreHorizontal,
  Timer,
} from "lucide-react"

import type { Task, TaskPriority, TaskStatus } from "./types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { DataTableColumnHeader } from "./data-table-column-header"

// Icon + label pairs: meaning never rides on color alone (a11y).
export const STATUSES: Record<
  TaskStatus,
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  backlog: { label: "Backlog", icon: CircleOff },
  todo: { label: "Todo", icon: Circle },
  in_progress: { label: "In progress", icon: Timer },
  done: { label: "Done", icon: CheckCircle2 },
  canceled: { label: "Canceled", icon: CircleOff },
}

export const PRIORITIES: Record<
  TaskPriority,
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  low: { label: "Low", icon: ArrowDown },
  medium: { label: "Medium", icon: ArrowRight },
  high: { label: "High", icon: ArrowUp },
}

export const columns: ColumnDef<Task>[] = [
  {
    id: "select",
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected() ||
          (table.getIsSomePageRowsSelected() && "indeterminate")
        }
        onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)}
        aria-label="Select all rows"
        // Larger tap target than the visual box (WCAG 2.2 target size).
        className="translate-y-[2px]"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(v) => row.toggleSelected(!!v)}
        aria-label="Select row"
        className="translate-y-[2px]"
      />
    ),
    enableSorting: false,
    enableHiding: false,
    size: 32,
  },
  {
    accessorKey: "id",
    header: ({ column, table }) => (
      <DataTableColumnHeader column={column} table={table} title="Task" />
    ),
    cell: ({ row }) => (
      <span className="font-mono text-xs text-muted-foreground">
        {row.getValue("id")}
      </span>
    ),
    enableHiding: false,
  },
  {
    accessorKey: "title",
    header: ({ column, table }) => (
      <DataTableColumnHeader column={column} table={table} title="Title" />
    ),
    cell: ({ row }) => (
      // Truncate long titles. `title=` is the floor, not the answer: it is invisible on
      // touch and unreliable for AT. Wrap this in a keyboard-reachable Radix Tooltip plus
      // click-to-expand before shipping (§5, "Truncated cells").
      <span
        className="block max-w-[420px] truncate font-medium"
        title={row.getValue("title")}
      >
        {row.getValue("title")}
      </span>
    ),
  },
  {
    accessorKey: "status",
    header: ({ column, table }) => (
      <DataTableColumnHeader column={column} table={table} title="Status" />
    ),
    cell: ({ row }) => {
      const s = STATUSES[row.getValue("status") as TaskStatus]
      const Icon = s.icon
      return (
        <div className="flex items-center gap-2">
          <Icon className="size-4 text-muted-foreground" />
          <span>{s.label}</span>
        </div>
      )
    },
    // Enables faceted filtering + counts for this column.
    filterFn: (row, id, value: string[]) =>
      value.includes(row.getValue(id)),
  },
  {
    accessorKey: "priority",
    header: ({ column, table }) => (
      <DataTableColumnHeader column={column} table={table} title="Priority" />
    ),
    cell: ({ row }) => {
      const p = PRIORITIES[row.getValue("priority") as TaskPriority]
      const Icon = p.icon
      return (
        <Badge variant="outline" className="gap-1 font-normal">
          <Icon className="size-3 text-muted-foreground" />
          {p.label}
        </Badge>
      )
    },
    filterFn: (row, id, value: string[]) =>
      value.includes(row.getValue(id)),
  },
  {
    accessorKey: "estimate",
    // Numeric column: right-align header AND cell, tabular figures.
    header: ({ column, table }) => (
      <DataTableColumnHeader
        column={column}
        table={table}
        title="Estimate"
        className="justify-end"
      />
    ),
    cell: ({ row }) => (
      <div className="text-right tabular-nums">{row.getValue("estimate")}</div>
    ),
  },
  {
    id: "actions",
    enableSorting: false,
    enableHiding: false,
    size: 40,
    cell: ({ row }) => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Open actions for ${row.getValue("id")}`}
            // Revealed on row hover/focus, but always reachable by keyboard.
            className="size-8 opacity-0 focus-visible:opacity-100 group-hover/row:opacity-100 data-[state=open]:opacity-100"
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem>Edit</DropdownMenuItem>
          <DropdownMenuItem>Make a copy</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => {
              /* delete(row.original.id) */
            }}
          >
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
  },
]
```

### `data-table-faceted-filter.tsx` — multi-select popover with live counts

```tsx
"use client"

import type { Column } from "@tanstack/react-table"
import { Check, PlusCircle } from "lucide-react"

import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"

interface Option {
  label: string
  value: string
  icon?: React.ComponentType<{ className?: string }>
}

interface DataTableFacetedFilterProps<TData, TValue> {
  column?: Column<TData, TValue>
  title: string
  options: Option[]
}

export function DataTableFacetedFilter<TData, TValue>({
  column,
  title,
  options,
}: DataTableFacetedFilterProps<TData, TValue>) {
  const facets = column?.getFacetedUniqueValues()
  const selected = new Set(column?.getFilterValue() as string[] | undefined)

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 border-dashed">
          <PlusCircle className="size-3.5" />
          {title}
          {selected.size > 0 && (
            <>
              <Separator orientation="vertical" className="mx-1 h-4" />
              <Badge
                variant="secondary"
                className="rounded-sm px-1 font-normal lg:hidden"
              >
                {selected.size}
              </Badge>
              <div className="hidden gap-1 lg:flex">
                {selected.size > 2 ? (
                  <Badge variant="secondary" className="rounded-sm px-1 font-normal">
                    {selected.size} selected
                  </Badge>
                ) : (
                  options
                    .filter((o) => selected.has(o.value))
                    .map((o) => (
                      <Badge
                        key={o.value}
                        variant="secondary"
                        className="rounded-sm px-1 font-normal"
                      >
                        {o.label}
                      </Badge>
                    ))
                )}
              </div>
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-52 p-0" align="start">
        <Command>
          <CommandInput placeholder={title} />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup>
              {options.map((option) => {
                const isSelected = selected.has(option.value)
                const Icon = option.icon
                return (
                  <CommandItem
                    key={option.value}
                    onSelect={() => {
                      if (isSelected) selected.delete(option.value)
                      else selected.add(option.value)
                      const values = Array.from(selected)
                      column?.setFilterValue(values.length ? values : undefined)
                    }}
                  >
                    <div
                      className={cn(
                        "flex size-4 items-center justify-center rounded-[4px] border border-primary",
                        isSelected
                          ? "bg-primary text-primary-foreground"
                          : "opacity-50 [&_svg]:invisible",
                      )}
                    >
                      <Check className="size-3" />
                    </div>
                    {Icon && <Icon className="size-4 text-muted-foreground" />}
                    <span>{option.label}</span>
                    {/* Live count from the faceted row model. */}
                    {facets?.get(option.value) != null && (
                      <span className="ml-auto flex size-4 items-center justify-center font-mono text-xs tabular-nums">
                        {facets.get(option.value)}
                      </span>
                    )}
                  </CommandItem>
                )
              })}
            </CommandGroup>
            {selected.size > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem
                    onSelect={() => column?.setFilterValue(undefined)}
                    className="justify-center text-center"
                  >
                    Clear filters
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
```

### `data-table-toolbar.tsx` — search + facets + reset + view

```tsx
"use client"

import type { Table } from "@tanstack/react-table"
import { Settings2, X } from "lucide-react"

import { PRIORITIES, STATUSES } from "./columns"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { DataTableFacetedFilter } from "./data-table-faceted-filter"

const toOptions = (
  record: Record<string, { label: string; icon?: React.ComponentType<{ className?: string }> }>,
) =>
  Object.entries(record).map(([value, { label, icon }]) => ({ value, label, icon }))

export function DataTableToolbar<TData>({ table }: { table: Table<TData> }) {
  const isFiltered = table.getState().columnFilters.length > 0

  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex flex-1 flex-wrap items-center gap-2">
        <Input
          placeholder="Filter tasks…"
          value={(table.getColumn("title")?.getFilterValue() as string) ?? ""}
          onChange={(e) =>
            table.getColumn("title")?.setFilterValue(e.target.value)
          }
          className="h-8 w-40 lg:w-64"
          aria-label="Filter tasks by title"
        />
        {table.getColumn("status") && (
          <DataTableFacetedFilter
            column={table.getColumn("status")}
            title="Status"
            options={toOptions(STATUSES)}
          />
        )}
        {table.getColumn("priority") && (
          <DataTableFacetedFilter
            column={table.getColumn("priority")}
            title="Priority"
            options={toOptions(PRIORITIES)}
          />
        )}
        {isFiltered && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => table.resetColumnFilters()}
            className="h-8 px-2 lg:px-3"
          >
            Reset
            <X className="size-3.5" />
          </Button>
        )}
      </div>

      {/* View: column visibility. Persist this to localStorage/URL in prod. */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="ml-auto h-8">
            <Settings2 className="size-3.5" />
            <span className="hidden lg:inline">View</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {table
            .getAllColumns()
            .filter((c) => c.getCanHide())
            .map((column) => (
              <DropdownMenuCheckboxItem
                key={column.id}
                className="capitalize"
                checked={column.getIsVisible()}
                onCheckedChange={(v) => column.toggleVisibility(!!v)}
              >
                {column.id}
              </DropdownMenuCheckboxItem>
            ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
```

### `data-table-pagination.tsx` — count + rows-per-page + page controls

```tsx
"use client"

import type { Table } from "@tanstack/react-table"
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export function DataTablePagination<TData>({ table }: { table: Table<TData> }) {
  const { pageIndex, pageSize } = table.getState().pagination
  const selectedCount = table.getFilteredSelectedRowModel().rows.length
  const totalCount = table.getFilteredRowModel().rows.length

  return (
    <div className="flex flex-col-reverse items-center gap-3 px-1 sm:flex-row sm:justify-between">
      {/* Selection count — announced politely for screen readers. */}
      <div
        className="text-sm text-muted-foreground tabular-nums"
        aria-live="polite"
      >
        {selectedCount} of {totalCount} row(s) selected.
      </div>

      <div className="flex items-center gap-4 sm:gap-6">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium">Rows per page</p>
          <Select
            value={`${pageSize}`}
            onValueChange={(v) => table.setPageSize(Number(v))}
          >
            <SelectTrigger className="h-8 w-[70px]">
              <SelectValue placeholder={pageSize} />
            </SelectTrigger>
            <SelectContent side="top">
              {[10, 25, 50, 100].map((n) => (
                <SelectItem key={n} value={`${n}`}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-1 text-sm font-medium tabular-nums">
          Page {pageIndex + 1} of {table.getPageCount()}
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="hidden size-8 lg:flex"
            onClick={() => table.setPageIndex(0)}
            disabled={!table.getCanPreviousPage()}
            aria-label="Go to first page"
          >
            <ChevronsLeft className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            aria-label="Go to previous page"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            aria-label="Go to next page"
          >
            <ChevronRight className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="hidden size-8 lg:flex"
            onClick={() => table.setPageIndex(table.getPageCount() - 1)}
            disabled={!table.getCanNextPage()}
            aria-label="Go to last page"
          >
            <ChevronsRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
```

### `data-table-bulk-bar.tsx` — count **and scope**, Esc to clear, undo not confirm

The ASCII anatomy promises a bulk-action bar; without one, selection has no destination.

```tsx
"use client"

import * as React from "react"
import type { Row, Table } from "@tanstack/react-table"

import { Button } from "@/components/ui/button"

export function DataTableBulkBar<TData>({
  table,
  onDelete,
}: {
  table: Table<TData>
  onDelete: (rows: Row<TData>[]) => void
}) {
  const selected = table.getFilteredSelectedRowModel().rows
  const count = selected.length

  // Esc clears the selection. Esc is not a printable character, so document scope is
  // fine — WCAG 2.1.4 covers letter/number/punctuation/symbol keys only.
  React.useEffect(() => {
    if (!count) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") table.resetRowSelection()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [count, table])

  if (!count) return null

  const scope = table.getIsAllRowsSelected()
    ? "all rows"
    : table.getIsAllPageRowsSelected()
      ? "this page"
      : "selected"

  return (
    // role="status" so the count reaches AT without stealing focus (WCAG 4.1.3).
    <div
      role="status"
      className="sticky bottom-0 z-20 flex items-center gap-3 border-t bg-background px-3 py-2 shadow-[0_-1px_0_0_var(--border)]"
    >
      <span className="text-sm tabular-nums">
        {count} of {table.getFilteredRowModel().rows.length} · {scope}
      </span>
      <div className="ml-auto flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => table.resetRowSelection()}>
          Clear
          <kbd className="ml-1 rounded border bg-muted px-1 text-[10px]">esc</kbd>
        </Button>
        {/* Destructive bulk actions resolve to an undo window, not a confirm dialog:
            a confirm on 40 rows is a speed bump; undo is a real safety net. And on
            partial failure, report per-row outcomes — one "Done" toast hides the 3
            that failed. */}
        <Button variant="destructive" size="sm" onClick={() => onDelete(selected)}>
          Delete {count}
        </Button>
      </div>
    </div>
  )
}
```

### `data-table.tsx` — the reusable engine + shell + states

```tsx
"use client"

import * as React from "react"
import {
  type ColumnDef,
  type ColumnFiltersState,
  type Row,
  type SortingState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { DataTableBulkBar } from "./data-table-bulk-bar"
import { DataTablePagination } from "./data-table-pagination"
import { DataTableToolbar } from "./data-table-toolbar"

type Density = "compact" | "comfortable" | "spacious"

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  /** Gate this on TanStack Query's `isPending` ONLY — never on `isLoading`, which is
   *  `isFetching && isPending` and so re-skeletons the table on every page change. */
  isPending?: boolean
  isError?: boolean
  onRetry?: () => void
  onCreate?: () => void
  onBulkDelete?: (rows: Row<TData>[]) => void
  density?: Density
}

export function DataTable<TData, TValue>({
  columns,
  data,
  isPending = false,
  isError = false,
  onRetry,
  onCreate,
  onBulkDelete,
  density = "compact",
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({})
  const [rowSelection, setRowSelection] = React.useState({})

  const table = useReactTable({
    data,
    columns,
    state: { sorting, columnFilters, columnVisibility, rowSelection },
    // 25: one screenful at 42–52px rows; NN/g's View-All ceiling is ~100.
    initialState: { pagination: { pageSize: 25 } },
    // TanStack's defaults are size 150 / minSize 20 — a 20px floor lets a user drag any
    // column below the WCAG 24×24 target size. 64px fits a 24px target plus padding.
    defaultColumn: { minSize: 64, size: 150 },
    columnResizeMode: "onEnd", // TanStack's own default: 60fps onChange resizing is hard
    enableRowSelection: true,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
  })

  const isFiltered = table.getState().columnFilters.length > 0
  const colSpan = table.getVisibleFlatColumns().length

  return (
    <div className="space-y-3" data-density={density}>
      <DataTableToolbar table={table} />

      {/* Scope escalation: the header checkbox selects the PAGE. Say so, then offer
          the filtered set explicitly — page vs filtered vs all are three blast radii. */}
      {table.getIsAllPageRowsSelected() &&
        table.getFilteredRowModel().rows.length >
          table.getRowModel().rows.length && (
          <div
            role="status"
            className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm"
          >
            <span className="tabular-nums">
              All {table.getRowModel().rows.length} on this page selected.
            </span>
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0"
              onClick={() => table.toggleAllRowsSelected(true)}
            >
              Select all {table.getFilteredRowModel().rows.length} matching rows
            </Button>
          </div>
        )}

      {/* ONE box owns both scroll axes, so `sticky top-0` on the header pins to it.
          An unbounded overflow-x-auto wrapper is the sticky-header trap (§6). */}
      <div className="max-h-[70svh] overflow-auto rounded-md border">
        <Table>
          {/* z-stack: corner 4 / header 3 / pinned col 2 / body auto. */}
          <TableHeader className="sticky top-0 z-30 bg-muted/40">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent">
                {headerGroup.headers.map((header) => {
                  const sortDir = header.column.getIsSorted()
                  return (
                    <TableHead
                      key={header.id}
                      // aria-sort reflects the live sort direction.
                      aria-sort={
                        sortDir === "asc"
                          ? "ascending"
                          : sortDir === "desc"
                            ? "descending"
                            : header.column.getCanSort()
                              ? "none"
                              : undefined
                      }
                      style={{ width: header.getSize() }}
                      className="text-muted-foreground"
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>

          <TableBody aria-live="polite" aria-busy={isPending}>
            {/* LOADING: skeleton the first ~5 rows, header stays live. */}
            {isPending ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={`skeleton-${i}`} className="hover:bg-transparent">
                  {table.getVisibleFlatColumns().map((col) => (
                    <TableCell
                      key={col.id}
                      style={{ paddingBlock: "var(--cell-py)" }}
                    >
                      <Skeleton className="h-4 w-full max-w-[160px]" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : isError ? (
              /* ERROR: inline message + retry, header preserved. */
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={colSpan} className="h-40 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <p className="text-sm text-muted-foreground">
                      There was an error loading the data.
                    </p>
                    {onRetry && (
                      <Button variant="outline" size="sm" onClick={onRetry}>
                        Retry
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                  // group/row → children can reveal on hover; focus-within keeps
                  // keyboard users covered (never hover-only).
                  className="group/row focus-within:bg-muted/50"
                  style={{ height: "var(--row-h)" }}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      style={{ paddingBlock: "var(--cell-py)" }}
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : isFiltered ? (
              /* EMPTY — no results (distinct copy + clear action). */
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={colSpan} className="h-40 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <p className="text-sm text-muted-foreground">
                      No results found.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => table.resetColumnFilters()}
                    >
                      Clear filters
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              /* EMPTY — first run (illustration/CTA). */
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={colSpan} className="h-40 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <p className="text-sm font-medium">No tasks yet</p>
                    <p className="text-sm text-muted-foreground">
                      Create your first task to get started.
                    </p>
                    {onCreate && (
                      <Button size="sm" onClick={onCreate}>
                        Create task
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {onBulkDelete && <DataTableBulkBar table={table} onDelete={onBulkDelete} />}
      <DataTablePagination table={table} />
    </div>
  )
}
```

**Optional: derive `pageSize` from the container height.** Grafana does — "[w]hen switched on,
the page size automatically adjusts to the height of the table" — and it beats a fixed 25 across
a 1080p→4K range, removing both the half-empty last page and the 25-rows-in-a-600px-box squeeze.

```tsx
const [pageSize, setPageSize] = React.useState(25)
React.useEffect(() => {
  const el = scrollRef.current
  if (!el) return
  const ro = new ResizeObserver(() => {
    const rowH = parseFloat(getComputedStyle(el).getPropertyValue("--row-h")) || 48
    setPageSize(Math.max(10, Math.floor((el.clientHeight - 40 /* header */) / rowH)))
  })
  ro.observe(el)
  return () => ro.disconnect()
}, [])
```

Keep the manual selector as an override and **persist the user's explicit choice over the
derived value** — NN/g: "the computer should almost always respect the user's stated preference
and employ it as the default the next time around."

### `page.tsx` — server component that fetches and mounts

```tsx
import { columns } from "./columns"
import { DataTable } from "./data-table"
import type { Task } from "./types"

async function getTasks(): Promise<Task[]> {
  // Replace with your ORM/API call. Server component → data fetched on the server.
  return [
    { id: "TASK-8782", title: "Convert cross-platform interface bytes", status: "in_progress", priority: "high", estimate: 8, updatedAt: "2026-06-30" },
    { id: "TASK-7878", title: "Try to calculate the EXE feed", status: "backlog", priority: "medium", estimate: 5, updatedAt: "2026-06-29" },
    { id: "TASK-7839", title: "Bypass the neural TCP card", status: "todo", priority: "high", estimate: 13, updatedAt: "2026-06-28" },
    { id: "TASK-5562", title: "Generate the auxiliary bus", status: "done", priority: "low", estimate: 3, updatedAt: "2026-06-25" },
    // …
  ]
}

export default async function TasksPage() {
  const data = await getTasks()

  return (
    <div className="container mx-auto py-8">
      <div className="mb-4">
        <h1 className="text-xl font-semibold tracking-tight">Tasks</h1>
        <p className="text-sm text-muted-foreground">
          Manage your team's work. Sort, filter, and select in bulk.
        </p>
      </div>
      <DataTable columns={columns} data={data} density="compact" />
    </div>
  )
}
```

---

## 10. Production checklist

- [ ] Numbers right-aligned + `tabular-nums`; text left-aligned; headers match cells.
- [ ] Every hover affordance mirrored on `focus-within` / `focus-visible`.
- [ ] `aria-sort` on the active header; sort control is a real `<button>` with a label.
- [ ] Distinct **first-run** vs **no-results** empty states; **error + retry**; **skeleton (first ~5 rows, live header)** on load — and **no empty state at all while the first load is in flight**.
- [ ] Skeleton gated on `isPending`, not `isLoading`; background refetch keeps rows + a 2px bar (never a dim).
- [ ] Status/priority carry **icon + text**, not color alone.
- [ ] Checkboxes/actions have ≥24px hit areas even in compact density; `defaultColumn.minSize` ≥ 64.
- [ ] Rows with 2+ controls: `role="grid"` on the real `<table>` + the APG key map on roving tabindex (§7.1).
- [ ] Single-letter shortcuts bound to the **grid container**, not `document` (WCAG 2.1.4, Level A).
- [ ] Multi-sort shows an order index and offers "Clear sort"; select-all states its **scope**.
- [ ] The bulk bar states count **and** scope, clears on Esc, and resolves destructive actions to an **undo window**, reporting per-row outcomes on partial failure.
- [ ] Sort/filter/page (and, ideally, column-visibility + density) **persisted** — URL for shareable state, localStorage for prefs — with a **reset to default**.
- [ ] Rendered rows stay ≤ ~100; beyond that paginate, virtualize, or go server-side. Virtualized → `aria-rowcount`/`aria-rowindex` are mandatory.
- [ ] No zebra striping; one 1px divider; no borders-everywhere; no full-table spinner; no infinite scroll.

---

## Sources

- [shadcn/ui — Data Table](https://ui.shadcn.com/docs/components/data-table) · [Table primitive](https://ui.shadcn.com/docs/components/table)
- [TanStack Table v8 — Features](https://tanstack.com/table/v8/docs/guide/features) · [Sorting](https://tanstack.com/table/v8/docs/guide/sorting) · [Column Sizing](https://tanstack.com/table/v8/docs/guide/column-sizing) · [Virtualization](https://tanstack.com/table/v8/docs/guide/virtualization) · [TanStack Virtual]
- [Pencil & Paper — Enterprise data tables UX](https://www.pencilandpaper.io/articles/ux-pattern-analysis-enterprise-data-tables)
- [Setproduct — Data table UI 2026](https://www.setproduct.com/blog/data-table-ui-design) · [Pagination UI](https://www.setproduct.com/blog/pagination-ui-design)
- [Stripe — cursor-based pagination](https://docs.stripe.com/stripe-apps/components/table) · [Linear UI patterns](https://www.saasui.design/application/linear)
- [Carbon — Loading/skeleton](https://carbondesignsystem.com/patterns/loading-pattern/) · [WCAG 2.2 — Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)
- [W3C ARIA APG — Grid pattern](https://www.w3.org/WAI/ARIA/apg/patterns/grid/) · [Developing a Keyboard Interface](https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/)
- [WCAG 2.2 — 2.1.4 Character Key Shortcuts](https://www.w3.org/WAI/WCAG22/Understanding/character-key-shortcuts.html) · [2.3.1 Three Flashes](https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html) · [4.1.3 Status Messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html)
- [TanStack Query — Queries](https://tanstack.com/query/latest/docs/framework/react/guides/queries) · [Paginated Queries](https://tanstack.com/query/latest/docs/framework/react/guides/paginated-queries) · [Optimistic Updates](https://tanstack.com/query/latest/docs/framework/react/guides/optimistic-updates)
- AG Grid — [DOM Virtualisation](https://www.ag-grid.com/react-data-grid/dom-virtualisation/) · [Row Models][AG Grid row models] · [Flashing Cells](https://www.ag-grid.com/react-data-grid/flashing-cells/) · [Cell Editing Start/Stop](https://www.ag-grid.com/react-data-grid/cell-editing-start-stop/) · [Column Pinning](https://www.ag-grid.com/react-data-grid/column-pinning/) · [Accessibility](https://www.ag-grid.com/react-data-grid/accessibility/)
- [Chrome Lighthouse — DOM size][Lighthouse DOM size] · [MDN — position](https://developer.mozilla.org/en-US/docs/Web/CSS/position) · [MDN — prefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion)
- [Grafana — Table panel](https://grafana.com/docs/grafana/latest/panels-visualizations/visualizations/table/) · [Glide Data Grid](https://github.com/glideapps/glide-data-grid) · [Raycast — List API](https://developers.raycast.com/api-reference/user-interface/list)
- [NN/g — Item List: How Many Items to Show](https://www.nngroup.com/articles/item-list-view-all/) (Jakob Nielsen, 2013-04-28) · [Stripe — API pagination](https://docs.stripe.com/api/pagination)

> **Provenance rule.** Flagship products publish *philosophy*; libraries, design systems,
> browser vendors and W3C publish *numbers*. Never attribute a px or ms value to Linear,
> Superhuman, Figma or Arc unless the value appears in their own page text. Specifically:
> `linear.app/blog/scaling-the-linear-sync-engine` is a **video wrapper** — its only prose is
> "In this video we cover the challenges we've had scaling the sync engine…" — so cite it for
> the *architecture* (local store, optimistic mutation, background sync) and never for a
> number. The `G`+letter navigation map is **third-party-observed**, not from Linear's docs.

[TanStack Table v8]: https://tanstack.com/table/v8
[TanStack Virtual]: https://tanstack.com/virtual/latest
[shadcn/ui]: https://ui.shadcn.com
[Lighthouse DOM size]: https://developer.chrome.com/docs/lighthouse/performance/dom-size/
[AG Grid row models]: https://www.ag-grid.com/react-data-grid/row-models/

---

## Corpus grounding — dense tables & lists (2026-07-05 research)

> Copyable rules with specific values, pulled from the app-UI research corpus
> (the superdesign repo's research corpus (docs/research/notes/product-app-ui-patterns.md) → **"Data tables & dense
> lists"**). Additive to the recipe above (which already encodes most of these).
> Every source flag from the corpus is preserved verbatim, including the ones
> that weaken a claim.

> **Honesty note.** The named flagship products (Linear, Stripe, Vercel) publish
> *philosophy*, not pixel/millisecond specs. The row-height and padding numbers
> below are **Carbon / MUI DataGrid proxies** standing in for products that don't
> publish theirs — calibrated starting points, not ground truth.

### Copyable rules (with values)

- **Density = named tiers that change PADDING, never font-size**; persist as a
  user toggle. Carbon: Compact **24** / Short **32** / Default(Medium) **48** /
  Tall **64px**. MUI DataGrid: compact ~**32** / standard **52px** (primary).
  Practical map: compact 32 / default 48 / comfortable **52–64px**.
  ⚠️ The Carbon citation is **v10, deprecated EOL Sept 2024** — verify against
  **v11** at carbondesignsystem.com before shipping; the tier px likely hold but
  token names changed. ⚠️ The "cross-source range" (dense 28–36 / comfortable
  44–56 / spacious 60–72px) is **synthesized, not sourced** — an estimate only.
- **Cell padding symmetric, on the scale**: Carbon **16px L/R**; shadcn header
  cell `h-10 px-2` (40px tall, 8px horizontal), body cell `p-2`. *Sources:*
  Carbon, shadcn `table.tsx` (primary).
- **Header matches body density; hierarchy by weight not size**: Carbon header
  **14px/600**, body **14px/400**. *Source:* Carbon.
- **Tabular figures on every numeric column**:
  `font-variant-numeric: tabular-nums` (fallback
  `font-feature-settings:"tnum","zero"`). The single most common table slop tell
  when omitted. *Source:* loke.dev.
- **Distinct token per row state; hover + selected is additive, focus uses
  border not fill.** shadcn `hover:bg-muted/50` + `data-[state=selected]:bg-muted`
  (two opacity levels of one token, no border/shadow change). Carbon focus =
  border-color → `$focus`, not background. *Sources:* shadcn `table.tsx`, Carbon.
- **Row-state transition = ~150ms, color only, no transform/shadow.** shadcn's
  bare `transition-colors` = Tailwind default 150ms `cubic-bezier(0.4,0,0.2,1)`.
  *Source:* shadcn `table.tsx`.
- **Row controls hidden at rest, revealed on hover; once selection is active, all
  checkboxes persist.** *Sources:* Linear select-issues, Notion tables (primary).
- **Thin 1px low-contrast dividers + hover highlight; prefer over zebra
  striping** once you need hover/selected/focus/disabled (striping consumes the
  light-grey value range; no scan-speed gain). *Sources:* pencilandpaper.io,
  A List Apart [directional].
- **Icon-only row action = exactly 32×32px, `p-0`, ghost, kebab → dropdown** —
  not multiple inline buttons. *Source:* shadcn data-table.
- **Navigation (highlight cursor) and selection (bulk-marking) are ORTHOGONAL
  states with separate keys.** Linear: `J/K` or arrows move highlight; `X`
  selects; `Shift+↑/↓` or Shift-click extends; `Cmd/Ctrl+A` select-all (applies
  current filters); `Esc` clears. *Source:* Linear select-issues (primary).
  ⚠️ Split sourcing: `X`/`Shift`/`Cmd+A`/`Esc` are on select-issues; the
  single-letter inline field edits `C`=create, `A`=assign, `I`=assign-self,
  `L`=label, `P`=priority, `F`=filter come from Linear's *general* keyboard-
  shortcuts reference, **not** select-issues — medium confidence.
- **Reuse the ⌘K palette as the bulk-action surface** once rows are selected,
  with the same field pickers as single-row inline edits — **not** a separate
  bulk-edit modal. *Source:* Linear select-issues (primary).
- **Sticky header/first-column z-stack**: corner **4** / header **3** /
  sticky-col **2** / body auto. *Source:* MDN `position` (every sticky element "always
  creates a new stacking context") (primary).
- **Virtualization overscan: TanStack Virtual's `overscan` default is `1`** ("The default value
  is `1`" — https://tanstack.com/virtual/latest/docs/api/virtualizer). The commonly-quoted
  "10" is **AG Grid's `rowBuffer`**, which renders "10 rows before the first visible row and 10
  rows after the last visible row, thus 20 additional rows"
  (https://www.ag-grid.com/react-data-grid/dom-virtualisation/). Pick deliberately: 1 is
  cheapest and can show blank rows on fast scroll; 5–10 buys smoothness at ~2× the rendered
  nodes. ⚠️ **Do not cite 10 to TanStack** — the earlier note in this file did, and it was
  wrong on both the number and the attribution.
- **Encode status via distinct icon *shape* per state, not color alone**
  (colorblind-safe, faster scan). ⚠️ The Vercel deployments example
  (queued/building/error/ready) describes the browser **tab/favicon** status,
  **not** dense-list row glyphs — scope the claim to a generic per-status
  row-icon pattern (Linear / GitHub Actions render per-status row icons).
  *Source:* Vercel blog (mis-scoped; use with care).
- **Cursor safe-area (clip-path triangle), not a timer**, for diagonal travel to
  row/submenus. *Source:* Linear "Invisible details". ⚠️ Keep the *technique*;
  the "saves ~1–2s per interaction" figure is **dropped** (unsourced fabricated
  precision).

### Token / motion defaults (corpus data-table block)

- row-height: dense **32px** (Carbon "Short") / default **48px**;
  cell-padding-x **16px**; header **40px**
- row-state transition: **150ms** `cubic-bezier(0.4,0,0.2,1)`, color only
- divider: **1px** low-contrast grey
- row action button: **32×32px** ghost kebab → dropdown
- checkbox: **Material 3 minimum touch target 48×48dp**, containing a visual
  glyph as small as 24×24dp via ~12dp padding per side (⚠️ do *not* state
  "24×24px target" — that's the glyph, not the target)
- numeric cells: `tabular-nums`; virtualization overscan **1** (TanStack's default; 5–10 is
  AG Grid's `rowBuffer` territory); sticky z-stack corner4/header3/col2
- live-value flash: **500ms** hold + **1,000ms** fade (AG Grid defaults), class toggle not keyframe

### AI-slop failures (corpus)

One fixed height, no toggle · proportional figures · reusing one color for
hover/selected/focus · persistent row action buttons/checkboxes/handles ·
bouncy/>200ms hover transitions · heavy full-grid borders · zebra stacked on
state colors · separate bulk-edit modal instead of ⌘K reuse · merged
nav+selection state · mouse-only tables · timer-based submenu dismissal ·
status-by-color-swatch alone · non-virtualized polling lists · fast-pulsing
skeletons on sub-second loads.

*Corpus note:* the superdesign repo's research corpus (docs/research/notes/product-app-ui-patterns.md) → **"Data tables
& dense lists"** (2024–2026 app-UI grounding corpus).
