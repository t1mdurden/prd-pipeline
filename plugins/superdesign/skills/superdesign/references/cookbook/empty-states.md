# Empty / Loading / Error States

> **Category:** `empty-states`
> **Stack:** React 19 · Tailwind CSS v4 · shadcn/ui
> **Primitives:** `Empty` · `Skeleton` · `Button` · `Alert` · `Spinner`
> **Install:** `pnpm dlx shadcn@latest add empty skeleton button alert spinner`

The three "nothing to show yet" states — **loading**, **empty**, and **error** —
are not edge cases bolted on at the end. They are the states your data surface
lives in most of the time during the first second of every visit, and on every
slow network forever. Treat them as one designed system: a small state machine
that a data-backed surface resolves into exactly one of.

## Contents

- [1. When to use it](#1-when-to-use-it) — any surface rendering remote or derived data
- [2. The state matrix](#2-the-state-matrix) — the states per scope, enumerated up front rather than discovered in production
- [3. Anatomy](#3-anatomy) — one outer wrapper, three sets of children, zero layout shift
- [4. Token-driven styling](#4-token-driven-styling) — the variables behind every branch
- [5. Timing thresholds (which loader, when)](#5-timing-thresholds-which-loader-when) — the NN/g limits that decide the treatment
- [6. Variants](#6-variants) — first-use onboarding empty · no-results (search / filter)
- [7. Responsive behavior](#7-responsive-behavior) — padding by breakpoint, width-constrained description
- [8. Complete, copy-pasteable code](#8-complete-copy-pasteable-code) — `DataState`, the anti-flicker hook, all six branches, the table-empty helper
- [9. Accessibility notes](#9-accessibility-notes) — `aria-busy`, `role="status"`, announce without hijacking
- [10. Anti-slop callout](#10-anti-slop-callout) — the blank flash of death, and the rest
- [11. Decision flow (recap)](#11-decision-flow-recap) — model, pick, then ship the sequence
- [Sources](#sources)
- [Corpus grounding — empty / loading / error (2026-07-05 research)](#corpus-grounding--empty--loading--error-2026-07-05-research) — copyable rules, defaults, preserved confidence flags

---

## 1. When to use it

Reach for this recipe on **any surface that renders remote or derived data** and
can therefore be in more than one state:

- Lists, feeds, tables, card grids, dashboards, search/filter results.
- Detail panes that fetch a record by id.
- Any panel whose contents depend on a network request, a query, or an async
  computation.

Do **not** reach for the full triad when the data is already local and
synchronous (static config, props you already hold) — there is no loading or
error state to design, and a skeleton there is theater. And do **not** skeleton a
single atomic control (one button, one input); that reads as "is this disabled or
loading?" and erodes trust.

**Rule of thumb:** if a surface can ever show a spinner, it needs all four of
loading / empty / error / populated designed together — plus the two that people
forget: **no-results** (empty because of a filter, not because it's new) and
**background refetch** (already have data, quietly updating).

---

## 2. The state matrix

A data surface resolves to exactly one state **per scope**. Enumerate them up front;
don't discover them in production. Scope is the axis most matrices omit, and it is the
one that fails in production: a collection-scoped state machine cannot express "row 14
failed to save while rows 1–13 are fine".

| Scope | State | Trigger | What renders | Blocking? |
|---|---|---|---|---|
| Collection | **Loading — first load** | Request in flight, no cached data (`isPending`) | Skeleton mirroring the final layout | Yes |
| Collection | **Loading — refetch / background** | Request in flight, stale data present (`isFetching && !isPending`) | Keep stale data + a subtle top bar. **Not a dimmed body** — undocumented, and worse than a bar mid-scan | No |
| Collection | **Showing previous page** | `isPlaceholderData` | Say the data on screen is the previous page's; disable Next until the next page is known | No |
| Collection | **Empty — suppressed during load** | Loading **and** an empty query | Render **nothing**. Raycast: the empty view "is *never* displayed if the `List`'s `isLoading` property is true and the search bar is empty" | Yes |
| Collection | **Empty — first use** | Success, 0 items, user never had data | Onboarding empty: icon + title + description + primary CTA | — |
| Collection | **Empty — no results** | Success, 0 items, due to search/filter | Terse "no results" + clear-filter action; **no** big illustration | — |
| Collection | **Empty — all done** | Success, 0 items, user completed everything | Light celebration ("All caught up") | — |
| Collection | **Partial / degraded** | Some data loaded, some failed | Render what loaded + inline error for the failed part | No |
| Collection | **Truncated by a server cap** | The server capped the response | State the cap and how to narrow (Stripe caps `limit` at 100) | No |
| Collection | **Stale, with age** | Older than `staleTime`, not refetching | Show *when* it was fetched, not a boolean — `staleTime` defaults to `0` | No |
| Collection | **Offline / reconnecting** | Connection lost | Persistent non-blocking banner; keep the last data and say it is frozen | No |
| Collection | **Reconnected** | Connection restored | Announce via a live region **without moving focus** (SC 4.1.3, AA) | No |
| Collection | **Rate-limited / retry scheduled** | 429 or backoff active | Say when the next attempt happens; `retry` defaults to 3 on the client | No |
| Collection | **Error** | Request failed | Icon + what happened + retry + escape hatch | Depends on scope |
| Collection | **Populated** | Success with data | The real UI | — |
| Item / row | **Optimistic · saving · save-failed** | A mutation on one item | Item-scoped pending, then either commit or an item-scoped error that **preserves the user's input** | No |
| Item / row | **Deleted, undo window open** | Destructive action fired | Hold the slot or swap in an undo affordance; do not reflow the list under the cursor | No |
| Item / row | **Conflicted** | Remote change collided with a local edit | Show both values and who changed it; never silently overwrite | No |
| Item / row | **Read-only, with a reason** | Permission or lifecycle | State the reason; a bare grey row is not a state | — |
| Field / cell | **Loading · invalid · masked** | Per-field async, validation, or ACL | Placeholder at the field's real width; inline `aria-invalid`; masked-with-an-explanation, never blank | No |
| Field / cell | **Empty vs zero vs null vs N/A** | Four different meanings | **Four different renderings**: `0` is data, blank is missing, "—" is not-applicable, "Unknown" is unresolved | — |

The full row- and cell-scoped matrix for dense grids — keyboard cursor vs selection,
range anchors, value-change flashes, truncation-with-inspect — lives in
`data-table.md` §5; don't duplicate it here.

Two insights from premium products (Linear / Vercel / Stripe): **errors are
designed, not stubbed**, and **a generic "no data" placeholder destroys
hierarchy** — a specific, helpful empty state builds it.

---

## 3. Anatomy

All three states share **one outer wrapper** so swapping between them causes
**zero layout shift**. The wrapper is the same box in every branch; only its
children change.

### 3.1 Empty (centered hero) — maps 1:1 to shadcn `Empty`

```
Empty                       // outer container: centers content, min-height, text-center
├── EmptyHeader
│   ├── EmptyMedia          // variant="icon" (chip) | "default"; icon / avatar / img
│   ├── EmptyTitle          // one-line heading, imperative for first-use
│   └── EmptyDescription    // 1–2 muted sentences, width-constrained
└── EmptyContent            // primary CTA (+ optional secondary), input group, or docs link
```

> **The composed first-use empty state = small monochrome illustration/icon + one
> imperative headline + ONE primary CTA — and the surrounding chrome is hidden
> when there's no data.** Filter bars, sort menus, column pickers, pagination,
> bulk toolbars operate on rows that don't exist yet; rendering them on a
> zero-data surface is dead noise that dilutes the single action. Hide them and
> let the composed empty state carry the surface — but keep the **stable
> create/import action** (in its toolbar spot) so it doesn't relocate as data
> comes and goes; the empty state *echoes* that action, it doesn't own it. Cap
> CTAs at **1 primary + ≤1 secondary**, both real semantic `Button`/`Link`s in tab
> order (→ anti-slop.md APP-UI `dead-end-filter-empty` for the copy contract).

### 3.2 Loading (skeleton)

```
<same wrapper / grid as populated>
└── Skeleton × N            // one per primary block, matching size/shape/count
```

Mirror the populated layout: same grid, same card dimensions, roughly the same
item count (3–6), realistic text widths (`w-3/4`, `w-1/2`). Skeleton only the
**primary structural blocks** — not every label, icon, or divider.

> **Skeletons are shaped to the content, never a spinner.** The skeleton IS the
> reserved layout space — reuse the *same* card/row box (same padding, radius,
> column widths, item count) so the swap to real content is zero-CLS. A centered
> spinner over a card grid conveys only "busy," previews no shape, and reflows
> when data lands. **The swap:** when the skeleton geometry matches the real box
> exactly, a **hard cut** is correct (nothing shifts, so nothing needs blending —
> see the corpus appendix); reach for a **short crossfade (~150ms opacity)** only
> to *mask a residual mismatch* you couldn't fully eliminate (a soft blend reads
> as one morph instead of two overlapping states). Break large skeletons into
> per-block pieces so a streaming payload reveals filled slots progressively while
> the rest still shimmers. (→ tokens.md §11 `skeleton geometry = real content`;
> corpus appendix below, "Skeleton mimics the final content's exact footprint".)

### 3.3 Error (scoped or full)

```
Empty (variant reuse)
├── EmptyMedia   → destructive-tinted alert icon (restrained)
├── EmptyTitle   → what happened, human language ("Couldn't load projects")
├── EmptyDescription → brief reason + reassurance; raw details behind a disclosure
└── EmptyContent
    ├── Button           → "Try again" (primary)
    └── Button variant="ghost" → escape hatch ("Go back" / "Contact support")
```

> **The error is an inline, in-layout state — never `alert()` / `window.confirm`.**
> A native `alert()` (or a bare thrown error) is a browser-chrome modal that blocks
> the thread, can't be styled or themed, carries no retry/escape, and reads as an
> unhandled crash. Render the failure **in the same wrapper the data would fill**
> (the composed `Empty` error branch, or one full-width cell for a table — §8),
> so the surface stays in-place with zero layout shift and the header/toolbar
> survive. Scope it to the blast radius: field · section-card · toast · full-page
> (→ §5, §10). Human title + reassurance up front; raw stack behind a "Technical
> details" disclosure — never in the user's face.

---

## 4. Token-driven styling

Everything below the design layer is a **CSS variable**, never a hex literal.
shadcn maps these to Tailwind v4 utilities via `@theme inline` in `globals.css`,
so `text-muted-foreground`, `bg-muted`, `text-destructive`, `border`, etc. all
resolve to tokens that flip automatically in dark mode.

| Element | Token utility | CSS var behind it |
|---|---|---|
| Description / secondary text | `text-muted-foreground` | `--muted-foreground` |
| Icon chip background | `bg-muted` | `--muted` |
| Skeleton fill | `bg-accent` (shadcn default) | `--accent` |
| Card / empty outline | `border` | `--border` |
| Error accent (icon/text) | `text-destructive` | `--destructive` |
| Error surface tint | `bg-destructive/10` | `--destructive` @ 10% |
| Primary CTA | `Button` default | `--primary` / `--primary-foreground` |
| Focus ring | `ring-ring` (via primitives) | `--ring` |

```css
/* globals.css — already present in a shadcn/Tailwind v4 project.
   Shown so the recipe is self-contained; do NOT duplicate hexes in components. */
:root {
  --muted: oklch(0.97 0 0);
  --muted-foreground: oklch(0.556 0 0);
  --destructive: oklch(0.577 0.245 27.325);
  --border: oklch(0.922 0 0);
  --ring: oklch(0.708 0 0);
  /* ...the rest of the shadcn token set... */
}
.dark {
  --muted: oklch(0.269 0 0);
  --muted-foreground: oklch(0.708 0 0);
  --destructive: oklch(0.704 0.191 22.216);
  --border: oklch(1 0 0 / 10%);
  --ring: oklch(0.556 0 0);
}
```

**Never** write `text-[#71717a]` or `bg-gray-100` in these components. If you need
a shade you don't have, add a token — don't inline it. This is what makes one
empty state look native in both themes and across every product surface.

---

## 5. Timing thresholds (which loader, when)

These NN/g response-time limits are load-bearing — they decide the treatment:

- **< ~300 ms expected** → render **nothing** (or optimistically render the
  result). A spinner here flashes and reads as broken.
- **~300 ms – 1 s, structured content** → **skeleton** mirroring final layout.
- **Short blocking action of unknown shape** (submit / save / pay) → **inline
  spinner in the button**.
- **> ~10 s** → **determinate progress** (percent / bar), let the user leave.

**Anti-flicker (do both):** *delay* showing the loader ~200–300 ms so fast
responses never flash one, and enforce a *minimum display time* ~300–500 ms so it
never flash-and-vanishes. The `useDelayedLoading` hook in §8 implements this.

**Skeleton vs spinner:** a spinner says *"the system is busy"* (no layout); a
skeleton says *"this specific content is arriving"* (layout preview). *A 500 ms
spinner feels slow; a 500 ms skeleton feels fast.* Use skeletons for
container-shaped content, spinners for short blocking actions and unknown shapes.

**Background refetch:** if you already have data, **do not drop to a skeleton** —
keep the stale data on screen and layer a subtle indicator (Linear/Vercel-style
top progress bar, a dimmed overlay, or a small inline spinner). Skeletons are for
*first* load only.

---

## 6. Variants

### Variant A — First-use onboarding empty (icon + CTA)

The high-trust moment. Imperative title, one supporting sentence, one primary
action. Small **monochrome** icon in a muted chip — not loud marketing art.

> "No projects yet" · "Create your first project to start shipping." · **[+ New project]**

### Variant B — No-results (search / filter)

Terse and neutral. **No illustration.** Echo the query back and offer the exit:
clear the filter or broaden the term.

> "No results for 'ux patterns'" · "Try a broader term or clear your filters." · **[Clear filters]**

Keep the two visually distinct: A is a welcome, B is a dead end with a door. Using
the loud onboarding treatment for a failed search is a classic slop tell.

---

## 7. Responsive behavior

- **Padding scales with breakpoint:** `py-12 sm:py-16` on the empty/error hero so
  it breathes on desktop without swallowing mobile.
- **Width-constrain the description** (`max-w-sm` / `max-w-md mx-auto`) so lines
  stay readable on wide viewports; it already fits on mobile.
- **Actions stack then row:** `flex flex-col sm:flex-row` with `w-full sm:w-auto`
  buttons — full-width tap targets on phones, inline on desktop.
- **Skeleton grid mirrors the real grid:** if the populated view is
  `grid-cols-1 md:grid-cols-2 lg:grid-cols-3`, the skeleton uses the *same*
  classes so the swap doesn't reflow at any width.
- **Tables:** the empty message is a single cell with `colSpan={columns}` so it
  spans the full width and the header row is preserved at every breakpoint.
- Media size is modest and fixed (`size-6` icon in a `size-12` chip) — it doesn't
  need to scale; the whitespace does the work.

---

## 8. Complete, copy-pasteable code

A production `DataState` renderer plus the anti-flicker hook, a projects surface
wired to all six branches, and a table-empty helper. Drop-in for a shadcn +
Tailwind v4 project.

```tsx
// hooks/use-delayed-loading.ts
"use client";

import * as React from "react";

/**
 * Kills loader flicker with two guarantees:
 *  1. delay      — don't show a loader until the request has run this long,
 *                  so fast responses (<delay) never flash one.
 *  2. minVisible — once shown, keep it up at least this long, so it never
 *                  flash-and-vanishes.
 */
export function useDelayedLoading(
  isLoading: boolean,
  { delay = 250, minVisible = 400 }: { delay?: number; minVisible?: number } = {},
) {
  const [show, setShow] = React.useState(false);
  const shownAt = React.useRef<number | null>(null);

  React.useEffect(() => {
    let showTimer: ReturnType<typeof setTimeout>;
    let hideTimer: ReturnType<typeof setTimeout>;

    if (isLoading) {
      showTimer = setTimeout(() => {
        shownAt.current = Date.now();
        setShow(true);
      }, delay);
    } else if (show && shownAt.current !== null) {
      const elapsed = Date.now() - shownAt.current;
      hideTimer = setTimeout(() => {
        shownAt.current = null;
        setShow(false);
      }, Math.max(0, minVisible - elapsed));
    }

    return () => {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
    };
  }, [isLoading, show, delay, minVisible]);

  return show;
}
```

```tsx
// components/data-state.tsx
"use client";

import * as React from "react";
import { AlertTriangleIcon, RotateCwIcon } from "lucide-react";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Button } from "@/components/ui/button";

/**
 * The async state a data surface can be in. Model every remote surface as one
 * of these — never let a "success with zero rows" masquerade as an error, and
 * never let a background refetch drop you back to a first-load skeleton.
 */
export type AsyncStatus = "loading" | "error" | "empty" | "ready";

interface DataStateProps<T> {
  status: AsyncStatus;
  data?: T;
  /** First-load skeleton. Must mirror the populated layout for zero layout shift. */
  loading: React.ReactNode;
  /** Empty branch — pass the variant you want (first-use, no-results, all-done). */
  empty: React.ReactNode;
  /** Called by the built-in error state's "Try again" button. */
  onRetry?: () => void;
  /** Human sentence: what happened + reassurance. NO raw stack traces here. */
  errorTitle?: string;
  errorDescription?: string;
  /** Optional raw detail, hidden behind a disclosure — never front-loaded. */
  errorDetails?: string;
  /** Escape hatch rendered next to Retry (e.g. "Go back", "Contact support"). */
  errorAction?: React.ReactNode;
  children: (data: T) => React.ReactNode;
}

export function DataState<T>({
  status,
  data,
  loading,
  empty,
  onRetry,
  errorTitle = "Something went wrong",
  errorDescription = "We couldn't load this right now. Please try again.",
  errorDetails,
  errorAction,
  children,
}: DataStateProps<T>) {
  if (status === "loading") return <>{loading}</>;

  if (status === "error") {
    return (
      <Empty className="py-12 sm:py-16">
        <EmptyHeader>
          <EmptyMedia
            variant="icon"
            className="bg-destructive/10 text-destructive"
          >
            <AlertTriangleIcon />
          </EmptyMedia>
          <EmptyTitle>{errorTitle}</EmptyTitle>
          <EmptyDescription>{errorDescription}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            {onRetry && (
              <Button onClick={onRetry} className="w-full sm:w-auto">
                <RotateCwIcon />
                Try again
              </Button>
            )}
            {errorAction}
          </div>
          {errorDetails && (
            <details className="mt-2 w-full text-left">
              <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                Technical details
              </summary>
              <pre className="mt-2 max-h-40 overflow-auto rounded-md bg-muted p-3 text-xs text-muted-foreground">
                {errorDetails}
              </pre>
            </details>
          )}
        </EmptyContent>
      </Empty>
    );
  }

  if (status === "empty") return <>{empty}</>;

  // status === "ready" — data is guaranteed present by the caller's reducer.
  return <>{children(data as T)}</>;
}
```

```tsx
// components/projects-surface.tsx
"use client";

import * as React from "react";
import { FolderPlusIcon, SearchXIcon, PlusIcon } from "lucide-react";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { DataState, type AsyncStatus } from "@/components/data-state";
import { useDelayedLoading } from "@/hooks/use-delayed-loading";
import { cn } from "@/lib/utils";

interface Project {
  id: string;
  name: string;
  updatedAt: string;
}

/** The populated grid — the single source of truth the skeleton must mirror. */
const GRID = "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3";

function ProjectCard({ project }: { project: Project }) {
  return (
    <div className="rounded-lg border bg-card p-4 shadow-xs transition-colors hover:bg-accent/50">
      <h3 className="truncate text-sm font-medium">{project.name}</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Updated {project.updatedAt}
      </p>
    </div>
  );
}

/** Skeleton mirrors GRID exactly (same classes, matching card box) → zero shift. */
function ProjectsSkeleton() {
  return (
    <div className={GRID} aria-hidden>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="rounded-lg border bg-card p-4">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="mt-2 h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}

interface ProjectsSurfaceProps {
  status: AsyncStatus;
  projects: Project[];
  query: string;
  isRefetching?: boolean;
  onRetry: () => void;
  onCreate: () => void;
  onClearSearch: () => void;
}

export function ProjectsSurface({
  status,
  projects,
  query,
  isRefetching = false,
  onRetry,
  onCreate,
  onClearSearch,
}: ProjectsSurfaceProps) {
  // Anti-flicker: only surface the first-load skeleton if the wait is real.
  const showSkeleton = useDelayedLoading(status === "loading");
  const effectiveStatus: AsyncStatus =
    status === "loading" && !showSkeleton ? "ready" : status;

  const isSearching = query.trim().length > 0;

  // First-use vs no-results are BOTH "empty" — the trigger picks the treatment.
  const emptyNode = isSearching ? (
    // Variant B — no-results: terse, no illustration, offer the exit.
    <Empty className="py-12 sm:py-16">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <SearchXIcon />
        </EmptyMedia>
        <EmptyTitle>No results for “{query}”</EmptyTitle>
        <EmptyDescription>
          Try a broader term or clear your filters to see all projects.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button
          variant="outline"
          onClick={onClearSearch}
          className="w-full sm:w-auto"
        >
          Clear search
        </Button>
      </EmptyContent>
    </Empty>
  ) : (
    // Variant A — first-use onboarding: welcoming, imperative, one primary CTA.
    <Empty className="py-12 sm:py-16">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <FolderPlusIcon />
        </EmptyMedia>
        <EmptyTitle>No projects yet</EmptyTitle>
        <EmptyDescription>
          Create your first project to start organizing and shipping your work.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button onClick={onCreate} className="w-full sm:w-auto">
          <PlusIcon />
          New project
        </Button>
      </EmptyContent>
    </Empty>
  );

  return (
    <section aria-label="Projects" className="relative">
      {/* Background-refetch signal: keep stale data, layer a subtle top bar +
          announce politely. Never drop back to the skeleton once we have data. */}
      {isRefetching && effectiveStatus === "ready" && (
        <div
          role="status"
          aria-label="Refreshing projects"
          className="pointer-events-none absolute inset-x-0 -top-px h-0.5 overflow-hidden rounded-full"
        >
          <div className="h-full w-1/3 animate-[loading-bar_1s_ease-in-out_infinite] bg-primary" />
        </div>
      )}

      {/* The primary "New project" action lives in the toolbar and stays put
          whether the surface is empty, full, loading, or errored. The empty
          state ECHOES it — it does not relocate it. */}
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Projects</h2>
        <Button onClick={onCreate} size="sm" variant="outline">
          <PlusIcon />
          New project
        </Button>
      </div>

      {/* aria-busy tells AT the region is updating without stealing focus. */}
      <div
        aria-busy={effectiveStatus === "loading" || isRefetching}
        className={cn(isRefetching && "opacity-70 transition-opacity")}
      >
        <DataState<Project[]>
          status={effectiveStatus}
          data={projects}
          loading={<ProjectsSkeleton />}
          empty={emptyNode}
          onRetry={onRetry}
          errorTitle="Couldn't load projects"
          errorDescription="We hit a problem reaching the server. Your data is safe — try again in a moment."
          errorAction={
            <Button variant="ghost" asChild className="w-full sm:w-auto">
              <a href="/support">Contact support</a>
            </Button>
          }
        >
          {(data) => (
            <div className={GRID}>
              {data.map((p) => (
                <ProjectCard key={p.id} project={p} />
              ))}
            </div>
          )}
        </DataState>
      </div>
    </section>
  );
}
```

```tsx
// components/table-empty-row.tsx
import { TableCell, TableRow } from "@/components/ui/table";

/**
 * Table/data-grid empties keep the header row and render ONE full-width cell.
 * Hover is disabled so it doesn't read as an interactive row.
 */
export function TableEmptyRow({
  colSpan,
  children,
}: {
  colSpan: number;
  children: React.ReactNode;
}) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell
        colSpan={colSpan}
        className="h-32 text-center text-sm text-muted-foreground"
      >
        {children}
      </TableCell>
    </TableRow>
  );
}
```

```css
/* globals.css — the refetch top-bar keyframe (token-driven color via bg-primary) */
@keyframes loading-bar {
  0%   { transform: translateX(-100%); }
  100% { transform: translateX(400%); }
}
```

**Deriving `status` from a query client (TanStack Query):**

```tsx
function toAsyncStatus<T>(q: {
  isPending: boolean;
  isError: boolean;
  data?: T[];
}): AsyncStatus {
  if (q.isPending) return "loading";
  if (q.isError) return "error";
  if (!q.data || q.data.length === 0) return "empty";
  return "ready";
}
// isRefetching (background, data already present) is passed separately so we
// keep the stale data + top bar instead of collapsing to a skeleton.
```

---

## 9. Accessibility notes

- **Announce, don't hijack.** Wrap the region in `aria-busy` while loading/
  refetching, and give the refetch indicator `role="status"` (a polite live
  region) with an `aria-label`. Screen readers hear "Refreshing projects" without
  losing their place. Never move focus on a background update.
- **Skeletons are decorative.** Mark the skeleton container `aria-hidden` — a
  screen-reader user gains nothing from N "loading" placeholders; the `aria-busy`
  on the parent already conveys the state.
- **Empty/error copy is real content.** `EmptyTitle` renders as a heading and
  `EmptyDescription` as text, so they're read normally. Keep the title a genuine
  summary ("Couldn't load projects"), not "Error 500".
- **Actionable focus order.** The primary action (Retry / New project) comes
  before the escape hatch in DOM order, so keyboard/AT users reach the recommended
  path first. Both are real `Button`s with visible `ring-ring` focus states from
  the primitive.
- **Icons are labelled by text, not alone.** The alert/empty icon is decorative
  next to a text title; don't rely on color or glyph alone to convey "error" —
  the title says it.
- **Contrast holds in both themes.** Because every color is a token,
  `text-muted-foreground` and `text-destructive` meet contrast in light and dark
  without per-theme tweaks.
- **Respect reduced motion.** Skeleton pulse, the shimmer, and the refetch bar
  should be gated by `motion-reduce:animate-none` (shadcn's `Skeleton` already
  uses `animate-pulse`; add `motion-reduce:animate-none` to custom animations).

---

## 10. Anti-slop callout

The tells that mark a data surface as "AI/boilerplate-generated" rather than
Linear/Vercel-grade — and the fix:

- **The blank flash of death.** Rendering `null` while loading, then popping in
  content, is the #1 slop tell. Always render a layout-mirroring skeleton (or
  nothing for <300 ms) — never an unstyled blank.
- **Spinner for structured content.** A centered spinner on a page that's about
  to show a card grid feels slow and generic. Skeleton the grid instead.
- **Skeleton that doesn't match.** Three gray bars that become a two-column card
  layout = a jarring reflow. The skeleton must reuse the *same* grid/box classes
  as the populated view.
- **Generic "No data."** "No data" / "Nothing here" with no next step reads as
  broken. Be specific and give one action: "No projects yet → New project."
- **One empty state for everything.** Using the loud onboarding illustration for a
  failed *search* is wrong — no-results is terse with an exit, not a welcome mat.
- **Raw errors in the user's face.** `Error: ECONNREFUSED 127.0.0.1:5432` shown
  verbatim is amateur hour. Human title + reassurance up front; stack trace behind
  a "Technical details" disclosure.
- **No escape hatch.** An error with only "Retry" traps a user whose retry keeps
  failing. Always pair it with a way out (Go back / Contact support) and escalate
  after repeated failures instead of looping silently.
- **Loud marketing art.** Full-color hero illustrations in a dense product UI
  scream template. Use small, monochrome, low-chroma icons that blend in
  (Linear/Notion style).
- **Relocating the primary action.** Putting "Create" *only* inside the empty
  state means the button jumps around as data comes and goes. Keep it in the
  toolbar; let the empty state echo it.
- **Loader jank.** No delay + no min-display = a spinner that flashes for 80 ms
  and vanishes, or one that vanishes mid-blink. Use the `useDelayedLoading` hook.
- **Hardcoded grays.** `text-gray-500` / `bg-[#f4f4f5]` break in dark mode and
  drift from the system. Use `text-muted-foreground` / `bg-muted` tokens.

---

## 11. Decision flow (recap)

1. **Model** the surface as the §2 state machine — enumerate loading / empty /
   no-results / error / partial / refetch / populated up front.
2. **Pick the loading treatment** by §5 timing: nothing (<300 ms) → button spinner
   (short blocking) → skeleton mirroring layout (structured) → progress (>10 s).
   Add delay + min-display; keep stale data on refetch.
3. **Pick the empty variant** — first-use (icon + CTA) vs no-results (terse + clear)
   vs all-done (light celebration). Keep the create action in its stable toolbar
   spot.
4. **Pick the error scope** — field / section-card / toast / banner / modal /
   full-page by blast radius; always give retry + escape hatch; hide raw details.
5. **Write the copy** — specific, 3-part errors (what → why → how forward), one
   action, tone matched to context.
6. **Lay it out** — one wrapper across all states for zero layout shift, centered
   hero with generous responsive spacing, muted media/description, token colors.
7. **Compose from shadcn primitives** — `Empty`, `Skeleton`, `Button`, `Alert` /
   `Sonner`, `Spinner` — don't hand-roll.

---

## Sources

- shadcn/ui — Empty: https://ui.shadcn.com/docs/components/empty
- Supabase Design System — Empty states: https://supabase-design-system.vercel.app/design-system/docs/ui-patterns/empty-states
- Carbon Design System — Empty states pattern: https://carbondesignsystem.com/patterns/empty-states-pattern/
- Eleken — Empty state UX: https://www.eleken.co/blog-posts/empty-state-ux
- Mantlr — How Stripe/Linear/Vercel ship premium UI: https://mantlr.com/blog/stripe-linear-vercel-premium-ui
- LogRocket — Skeleton loading screen design: https://blog.logrocket.com/ux-design/skeleton-loading-screen-design/
- Onething — Skeleton screens vs loading spinners: https://www.onething.design/post/skeleton-screens-vs-loading-spinners
- Figr — Error state design patterns: https://figr.design/blog/error-state-design-patterns
- Pencil & Paper — Error message UX: https://www.pencilandpaper.io/articles/ux-pattern-analysis-error-feedback
- NN/g — Response time limits: https://www.nngroup.com/articles/response-times-3-important-limits/

---

## Corpus grounding — empty / loading / error (2026-07-05 research)

Additive appendix grounding the recipe above in the app-UI research corpus
(the superdesign repo's research corpus (docs/research/notes/product-app-ui-patterns.md), section **"## Empty / loading /
error states"**). Winners **gate loading by duration**, make skeletons
**content-shaped** to avoid CLS, go **optimistic** on user actions, and treat
empty states as **intentional guided variants** with one named action. Values
below are copyable; each carries the corpus's confidence flag where one exists.

### Copyable rules (with values)

- **Gate loading by expected duration.** `<1s` → render **nothing**; `1–10s` →
  **skeleton** (previewable layouts) or **spinner** (short blocking non-layout
  actions — submit / auth); `>10s` → **determinate progress bar + cancel**.
  ⚠️ The NN/g skeleton-screens source is a **2016 article** — bands are still
  cited but predate the modern web; **pair it with a recent source**. ⚠️ NN/g's
  actual split is duration-based (spinner best 2–10s, skeleton <10s, progress
  >10s); the **"full-page vs single-widget" scope split is an unmarked
  interpretation** — treat it as a separate heuristic, not NN/g's wording.
- **Show-delay + minimum-visible so fast responses never flash.** Delay
  **~150–300ms** before showing the loader; keep it up **~300–500ms** minimum
  once shown. (This is the same anti-flicker discipline as §5's
  `useDelayedLoading`.) ⚠️ Sourced to Vercel guidelines [medium — the exact ms
  bands weren't confirmed on the page; standard frontend-perf convention].
- **Skeleton mimics the final content's exact footprint** — the skeleton *is* the
  reserved layout space. Use explicit per-instance dims (`h-[20px] w-[100px]
  rounded-full`); drive skeleton + real content from shared spacing vars → **zero
  CLS**.
- **Animate skeletons on compositor-only properties** (opacity / transform /
  background-position), **never** width / top / left. Tailwind `animate-pulse` =
  `pulse 2s cubic-bezier(0.4,0,0.6,1) infinite`; shimmer alt = `2.5s linear
  infinite` on background-position; cycle 1–2s; provide a reduced-motion static
  fallback.
- **Swap skeleton → content as a HARD CUT** — no cross-fade. Break large skeletons
  into independently-swappable pieces for progressive reveal. (Reconciles with §3.2:
  a hard cut is correct *because* the skeleton geometry already matches the real box,
  so nothing shifts to blend; the short crossfade there is a fallback to mask a
  *residual* geometry mismatch you couldn't fully eliminate — not the default.)
- **Spinners use LINEAR easing** — never ease-in/out on an infinite loop.
- **Optimistic CRUD.** Apply the mutation to local state **first**, sync in the
  background, **no spinner** on the action. ⚠️ Linear's "WebSocket" transport
  detail is **not confirmed** in the performance.dev source (which documents
  IndexedDB + service-worker precache + background sync) — soften to "background
  async sync via a durable local queue" [medium].
- **On optimistic failure, retry-then-revert** (don't visibly undo on a transient
  blip); pair with a **timed undo window** instead of an upfront confirm.
  ⚠️ **Superhuman archive undo is 10 seconds, not 5** (official docs) — correct any
  "5s" reference.
- **Match error surface to scope/severity.** Inline (field) · toast (low-severity
  transient / background) · full-page takeover (a core section fails). Error copy
  **guides to a fix and is non-blaming**: not "Invalid API key" but "Your API key
  is incorrect or expired. Generate a new key in your account settings." On
  validation failure, inline error + focus the first invalid field. Announce
  toasts / inline validation / async empty regions via `aria-live="polite"`.
  Trailing ellipsis on in-progress labels: "Loading…", "Saving…", "Generating…".
- **Empty states = one of 4 intentional variants**: **Blank Slate**,
  **Informational**, **Educational**, **Guide-with-starter-content**; guided
  out-activates blank. ⚠️ **The "30–40% activation lift" figure was STRIPPED** —
  no linked study; keep only the qualitative claim.
- **Title Case naming the exact absent/filtered condition; sentence-case
  description echoing the live query** in curly quotes. Title: `No Logs Match Your
  Filter`; description: `No logs match "${query}". Clear the filter…`.
- **Cap CTAs at 1 primary + at most 1 secondary.** Specific Title-Case verb+noun
  labels — **"New Issue", never "Get Started" / "OK" / "Continue"**; must be a real
  semantic `Button`/`Link` in tab order.
- **Filter-empty states always offer a next step** (clear-filters or docs link) —
  never dead-end; teach the populating mechanism ("Star your favorites to list
  them here.").
- **Toast auto-dismiss ~4s, paused on hover and on `document.hidden`.** Animate
  toasts with **interruptible CSS transitions** (translateY), **not keyframes**, so
  a rapid arrival retargets mid-flight; stacked toasts scale `1 − 0.05*index`,
  offset `gap*index` (~14px). **One consistent anchor app-wide** (of 6);
  promise-based toast **mutates in place** (loading → success/error), not three
  toasts.
- **Swipe-dismiss = velocity threshold OR distance, whichever first, + drag
  friction.** ⚠️ The `~0.11` constant is an **empirically-tuned Sonner default**
  (px-drag / ms), author-acknowledged as trial-and-error — state the unit, treat as
  directional, not a perceptual law.

### Token / motion defaults (corpus "states" block)

- Loading gate: `<1s` / `1–10s` / `>10s`
- Show-delay `150–300ms`, min-visible `300–500ms`
- Skeleton pulse `2s cubic-bezier(0.4,0,0.6,1)` or shimmer `2.5s linear`; **hard-cut** swap
- Spinner: **linear**
- Toast `4000ms` (pause on hover + `document.hidden`); enter `400ms` translateY; stack scale `1 − 0.05*i`
- General UI ceiling `<300ms`, **ease-out** for on/off-screen motion
- Optimistic: local write + **retry-then-revert** + timed undo
- Empty CTA cap **1 primary + ≤1 secondary**, semantic, in tab order
- Processing-label suffix: `…`

### AI-slop failures (corpus)

Full-page spinner/blank for every load · frame-only skeletons (no content shapes) ·
mismatched skeleton dims (CLS) · shimmer on layout props / ease-in-out spinner ·
spinner on every CRUD action · "Something went wrong" with no fix · pre-disabled
submit · lone-icon "No data" + "Get Started" · empty/error not in tab order, no
`aria-live` · dead-end filter-empty · toast overuse / varying anchors · timers
firing while hovered or backgrounded · cross-fade skeleton or restartable-keyframe
toasts · clashing stock illustrations.

### Corpus flags preserved (read before shipping any value)

1. **NN/g skeleton-screens article is 2016** — bands still cited but predate the
   modern web; pair with a recent source.
2. **"Full-page vs single-widget" scope split is an unmarked interpretation**, not
   NN/g's wording — treat as a separate heuristic.
3. **Superhuman undo is 10s, not 5s** (official docs) — correct any "5s".
4. **"30–40% activation lift" figure was STRIPPED** (unsourced) — keep only the
   qualitative guided-beats-blank claim.
5. **Swipe `~0.11` is a tuned Sonner default** (px-drag / ms, trial-and-error), not
   a perceptual constant — directional.
6. **performance.dev "WebSocket" transport is unconfirmed** (source documents
   IndexedDB + service-worker precache + background sync) — soften to "durable
   local queue".

*Source:* the superdesign repo's research corpus (docs/research/notes/product-app-ui-patterns.md) → "## Empty / loading /
error states" (per-claim citations and confidence flags live inline there).
