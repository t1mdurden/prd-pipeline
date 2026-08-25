# Command Menu (⌘K)

> A keyboard-first modal palette that overlays the app, opens on ⌘K / Ctrl+K, and pairs a
> search input with grouped, filterable, keyboard-navigable results. The universal launcher
> pattern popularized by Linear, Vercel, and Raycast.

**Stack:** React 19 · Tailwind v4 · shadcn/ui (`Command` + `CommandDialog`, built on [`cmdk`](https://github.com/pacocoursey/cmdk))

**Install the primitives first — do not hand-roll the combobox/focus logic:**

```bash
npx shadcn@latest add command dialog
# icons used below
npm i lucide-react
```

## Contents

- [When to use it](#when-to-use-it) — when a palette earns its place, and what to ship instead
- [Anatomy](#anatomy) — `CommandDialog` → `cmdk` root → input, list, groups, items
- [Token-driven styling](#token-driven-styling) — the CSS-variable layer the palette consumes
- [Variants](#variants) — universal launcher (ship this) · nested pages
- [Interaction & state matrix](#interaction--state-matrix) — every state, including loading, empty, and error on real data
- [Responsive behavior](#responsive-behavior) — centered dialog on desktop; the mandatory visible trigger on mobile
- [Accessibility](#accessibility) — what Radix and cmdk give you free, and what they don't
- [Anti-slop callout](#anti-slop-callout) — the states and details that separate Linear-grade from filler
- [Complete example](#complete-example) — `command.tsx`, the production component, and where to mount it
- [Notes & extensions](#notes--extensions) — context awareness, ranking as a score not a boolean
- [Corpus grounding — command palette (2026-07-05 research)](#corpus-grounding--command-palette-2026-07-05-research) — copyable rules, token/motion defaults, slop failures

---

## When to use it

| Use it when… | Reach for something else when… |
|---|---|
| Your app has many destinations **and** actions (navigate, create, toggle, search) that power users hit repeatedly. | You have one primary action — use a plain button. |
| You want to expose keyboard shortcuts and make them discoverable in one place. | You only need to filter a single list on a page — use an inline combobox / `<Command>` without the dialog. |
| Speed-of-repeat matters more than visual browsing (Linear/Vercel/Raycast territory). | Your users are mobile-first and rarely use a keyboard — lead with visible nav; the palette is a secondary affordance. |
| You need a *contextual* action surface ("do X to the thing I'm looking at"). | The task needs a multi-field form — open a real dialog/sheet instead of cramming it into the palette. |

**Rule of thumb:** one palette, one shortcut. Don't scatter ⌘K / ⌘P / ⌘/ across different command
sets — it fragments the user's mental model and defeats the "one place for everything" value.

---

## Anatomy

```
CommandDialog                     ← Radix Dialog: overlay, focus trap, scroll lock, Esc-to-close
└── Command                       ← cmdk root: owns query, filtering, ranking, selection
    ├── (header / breadcrumb)     ← optional: current "page" when nested
    ├── CommandInput              ← search field, auto-focused, leading search icon
    ├── (loading bar)             ← a thin bar UNDER the input — never a spinner in the list
    └── CommandList               ← scroll container, max-h ~300–400px
        ├── CommandEmpty          ← "No results found." — gated on status, not on count alone
        ├── CommandGroup "Recent" ← grouped results under a muted heading
        │   ├── CommandItem       ← [leading icon] label [trailing CommandShortcut]
        │   └── CommandItem
        ├── CommandSeparator
        └── CommandGroup "Navigation" / "Actions" / "Settings"
            └── CommandItem
    └── (footer legend)           ← optional: ↑↓ navigate · ↵ select · esc close
```

**Five required parts:** trigger (global shortcut + a visible affordance), search input, grouped
results, result item, empty state. **Three you'll want in a polished build:** loading state,
nested pages (a selection pushes a sub-menu), and a footer key legend.

---

## Token-driven styling

Everything below rides the shadcn CSS-variable layer — **no hardcoded hex, ever.** These tokens
are what make the palette theme-correct in light/dark and re-skinnable per brand. They live in
your `globals.css` under Tailwind v4's `@theme inline`:

```css
/* globals.css — the tokens the palette consumes */
@import "tailwindcss";

@theme inline {
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-muted-foreground: var(--muted-foreground);
  --color-border: var(--border);
  --color-ring: var(--ring);
  --radius-lg: var(--radius);
}

:root {
  --radius: 0.5rem;   /* 8px — required brand-step output, never a default (→ tokens.md §6) */
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.145 0 0);
  --accent: oklch(0.97 0 0);
  --accent-foreground: oklch(0.205 0 0);
  --muted-foreground: oklch(0.556 0 0);
  --border: oklch(0.922 0 0);
  --ring: oklch(0.708 0 0);
}

.dark {
  --popover: oklch(0.205 0 0);
  --popover-foreground: oklch(0.985 0 0);
  --accent: oklch(0.269 0 0);
  --accent-foreground: oklch(0.985 0 0);
  --muted-foreground: oklch(0.708 0 0);
  --border: oklch(1 0 0 / 10%);
  --ring: oklch(0.556 0 0);
}
```

| Surface | Token classes | Notes |
|---|---|---|
| Dialog panel | `bg-popover text-popover-foreground border rounded-lg shadow-lg` | Width `max-w-lg` (~512px) to `max-w-xl`; positioned slightly **above** dead-center. |
| Overlay scrim | `bg-black/50` (shadcn default) | Radix `DialogOverlay` handles it. Fades with `data-[state]` animations. |
| Group heading | `px-2 py-1.5 text-xs font-medium text-muted-foreground` | Quiet, sentence-case. |
| Item (base) | `px-2 py-1.5 rounded-sm text-sm gap-2 cursor-default select-none` | 44px min height on touch. |
| Item (selected) | `data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground` | Drives **both** hover and keyboard selection — one visual truth. |
| Item (disabled) | `data-[disabled=true]:opacity-50 data-[disabled=true]:pointer-events-none` | Dimmed, not focusable. |
| Leading icon | `[&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground` | 16px, non-interactive, decorative. |
| Trailing shortcut | `ml-auto text-xs tracking-widest text-muted-foreground` | The `CommandShortcut` slot. |
| List | `max-h-[300px] overflow-y-auto overflow-x-hidden` | Show ~5 rows and let the last one clip to signal scroll. |
| Focus ring | `focus-visible:ring-2 ring-ring` | Never delete the ring without a visible replacement. |

---

## Variants

### 1. Universal launcher (default — ship this)

Navigation + create-actions + settings + entity search in a single palette, split into groups
("Recent", "Navigation", "Actions", "Settings"). This is the Linear/Vercel baseline and what the
code below implements. Empty query shows a **Recent** group; typing collapses empty groups
automatically (cmdk hides them via the `hidden` attribute, it doesn't unmount).

### 2. Nested pages (theme / assign-to / move-to)

Some actions have sub-choices. Selecting a parent item **pushes a page** of sub-options; the input
placeholder and an optional breadcrumb update; **Escape or Backspace-on-empty pops back** (only
close the whole dialog once you're at the root page). The code below demonstrates this with a
"Change theme…" → Light / Dark / System sub-page. Keep nesting shallow — one level covers 95% of
real cases; deep trees turn a fast palette into a file browser.

---

## Interaction & state matrix

Design **all** of these, not just the happy path — this is where cheap palettes fall apart on real data.

| State | Trigger | What to render |
|---|---|---|
| **Closed** | default | Visible trigger only (search-styled button + `⌘K` kbd hint). |
| **Open / idle** | ⌘K, empty query | Default suggestions + **Recent** group; input focused; **first item pre-selected**. |
| **Typing / filtering** | user types | Live-ranked results; keep first result selected; empty groups auto-hide. |
| **No results** | query matches nothing **and** nothing is in flight | `CommandEmpty`: "No results found." Optionally a fallback row ("Search the web for _X_"). Gate it on `status !== "loading"`, **not on result count alone** — Raycast's rule is that the empty view "is *never* displayed if the `List`'s `isLoading` property is true and the search bar is empty". |
| **Loading (async)** | fetching | A thin **bar under the search input** — Raycast's `isLoading` "indicates whether a loading bar should be shown or hidden below the search bar." **Keep already-loaded rows visible**; never a spinner in the list, never a flash to blank. |
| **Error** | async failed | Inline error row **with a Retry action** — never a blank list, never a silent failure. |
| **Item hover / kbd-selected** | pointer or ↑↓ | Single `[data-selected]` highlight. Pointer and keyboard must not fight (see anti-slop). |
| **Item disabled** | unavailable action | `[data-disabled]`, dimmed, skipped by arrow keys. |
| **Nested page** | select a parent | Sub-options + back affordance; Esc/Backspace-on-empty pops one level, not the whole dialog. |
| **Close** | Esc / select / ⌘K again / click scrim | Dialog closes; **focus returns to the trigger element**; page state resets to root. |

**Keyboard contract:** `⌘K`/`Ctrl+K` toggle open (same key opens *and* closes) · type immediately
(no click needed) · `↑`/`↓` navigate with `loop` wrap · `↵` run selected · `Esc` close (or pop a
page) · `Backspace` on empty query pops a nested page.

**Open/close at 0ms — the palette does not animate.** A ⌘K surface is a keyboard-initiated,
100+×/day action, and **keyboard-initiated actions never animate** (canonical rule → motion.md §1).
Raycast and Vercel's ⌘K ship with *zero* open/close transition on purpose — an entrance the user
pays for on every one of hundreds of daily opens is pure friction, not polish. The shadcn
`CommandDialog` inherits Radix's default 200ms fade+`zoom-in-95`; **strip it** so the panel appears
instantly (override in the primitive below). The selected-row highlight is likewise an instant
(`0ms`) `data-[selected]` token swap — no transition — so the highlight keeps pace with fast arrow
nav. If you keep *any* motion here at all, it's an opacity-only fade with a **<100ms** ceiling and
never a scale/blur; but instant is correct.

---

## Responsive behavior

- **Desktop:** centered dialog, `max-w-lg`, offset slightly above center. Shortcut-driven.
- **Mobile:** there is no keyboard shortcut, so the **visible trigger is mandatory**. Present as a
  full-screen or bottom-sheet layout rather than a tiny floating card. Single-column list, row
  targets ≥44px, input pinned to the top so the soft keyboard doesn't cover it, list scrolls beneath.
- Toggle the trigger's label responsively: full "Search…" bar on `sm+`, an icon button on `xs`.
- Opening must feel instant — palette visible in **<100ms**. Keep local filtering synchronous;
  debounce only the *async* fetch, never the open animation.

---

## Accessibility

- `CommandDialog` is Radix Dialog → you get `role="dialog"` + `aria-modal`, focus trap, scroll lock,
  and Esc-to-close for free. `cmdk` supplies combobox/listbox semantics (`role="listbox"` /
  `role="option"`, `aria-selected`), tested with VoiceOver.
- **Auto-focus** the input on open; **restore focus** to the trigger on close (Radix does this when
  the dialog is opened from a focusable trigger; if you open via the global shortcut, stash
  `document.activeElement` and restore it yourself).
- Give the dialog an accessible name even when the title is visually hidden — use `DialogTitle`
  inside a `VisuallyHidden`, or shadcn's `title`/`description` props on `CommandDialog`.
- Announce **loading / error / empty** transitions with `aria-live="polite"` so screen-reader users
  aren't left in silence.
- Keep the focus ring visible and readable at 200% zoom; never signal state with color alone.
- Respect `prefers-reduced-motion` — drop the scale/fade on the panel for those users.
- Don't assume pointer == keyboard == touch; all three paths must reach every command.

---

## Anti-slop callout

> The markup is the easy 20%. What separates a Linear-grade palette from AI-generated filler:

- **Ship every state.** An empty/loading/error-less palette looks perfect in the demo and collapses
  the instant real, slow, failing data hits it. The `CommandEmpty` + `CommandLoading` + error row
  are not optional polish — they *are* the feature.
- **`e.preventDefault()` on the ⌘K handler is mandatory.** Without it you're fighting the browser's
  native ⌘K (address-bar focus). This is the single most common broken implementation.
- **Don't let pointer and keyboard fight.** A stray mouse hover must not yank the keyboard selection
  while someone is typing + arrowing. cmdk handles this if you drive *both* hover and keyboard off
  the single `data-[selected]` state instead of adding your own `:hover` background. Do not add a
  competing `hover:bg-*` class.
- **Be context-aware.** On a person record, "Send email" should pre-target that person — not open a
  blank composer. Global-only, context-blind commands are the tell of a bolted-on palette.
- **Rank, don't just alphabetize.** Baseline importance + recency + context beats a raw A–Z dump.
  Surface a **Recent** group on empty query; give each item an icon for fast visual scanning; expose
  the keyboard shortcut on the row so the palette *teaches* shortcuts.
- **Give items real `keywords`.** "opn" should find "Open", "logout" should find "Sign out". Fuzzy,
  case-insensitive, alias-aware — cmdk does this if you feed it `keywords`.
- **Don't rebuild the combobox.** Hand-rolled focus management, roving tabindex, and filtering will
  be worse and less accessible than `cmdk`. Compose, don't reinvent.
- **Nested Esc semantics:** on a sub-page, Esc/Backspace pops **one level** — it should not nuke the
  whole dialog from three pages deep. Track page state explicitly.

---

## Complete example

Three files. `command.tsx` is the shadcn primitive (shown for completeness — you get it from
`npx shadcn@latest add command`). `command-menu.tsx` is the real, production-shaped component:
provider + global shortcut + visible trigger + grouped commands + a nested theme sub-page +
loading/error/empty states + recency. Everything is token-driven.

### `components/ui/command.tsx` (from shadcn — reference)

```tsx
"use client"

import * as React from "react"
import { Command as CommandPrimitive } from "cmdk"
import { SearchIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

function Command({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive>) {
  return (
    <CommandPrimitive
      data-slot="command"
      className={cn(
        "bg-popover text-popover-foreground flex h-full w-full flex-col overflow-hidden rounded-md",
        className
      )}
      {...props}
    />
  )
}

function CommandDialog({
  title = "Command Menu",
  description = "Search for a command to run...",
  children,
  className,
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof Dialog> & {
  title?: string
  description?: string
  className?: string
  showCloseButton?: boolean
}) {
  return (
    <Dialog {...props}>
      {/* Accessible name/description even though they're visually hidden */}
      <DialogHeader className="sr-only">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <DialogContent
        // Keyboard-initiated 100+×/day surface → NO enter/exit animation
        // (motion.md §1). Neutralize Radix's default fade+zoom so the palette
        // appears instantly; keep the overlay's opacity fade only.
        className={cn(
          "overflow-hidden p-0",
          "data-[state=open]:animate-none data-[state=closed]:animate-none",
          "data-[state=open]:zoom-in-100 data-[state=closed]:zoom-out-100",
          "duration-0",
          className
        )}
        showCloseButton={showCloseButton}
      >
        <Command
          className={cn(
            "[&_[cmdk-group-heading]]:text-muted-foreground",
            "[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium",
            "[&_[cmdk-group]]:px-2 [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0",
            "[&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5",
            "[&_[cmdk-input]]:h-12",
            "[&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3",
            "[&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5"
          )}
        >
          {children}
        </Command>
      </DialogContent>
    </Dialog>
  )
}

function CommandInput({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Input>) {
  return (
    <div
      data-slot="command-input-wrapper"
      className="flex h-9 items-center gap-2 border-b px-3"
    >
      <SearchIcon className="size-4 shrink-0 text-muted-foreground opacity-70" />
      <CommandPrimitive.Input
        data-slot="command-input"
        className={cn(
          "placeholder:text-muted-foreground flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-hidden",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        {...props}
      />
    </div>
  )
}

function CommandList({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.List>) {
  return (
    <CommandPrimitive.List
      data-slot="command-list"
      className={cn(
        "max-h-[300px] scroll-py-1 overflow-x-hidden overflow-y-auto",
        className
      )}
      {...props}
    />
  )
}

function CommandEmpty(
  props: React.ComponentProps<typeof CommandPrimitive.Empty>
) {
  return (
    <CommandPrimitive.Empty
      data-slot="command-empty"
      className="py-6 text-center text-sm text-muted-foreground"
      {...props}
    />
  )
}

function CommandLoading(
  props: React.ComponentProps<typeof CommandPrimitive.Loading>
) {
  return <CommandPrimitive.Loading data-slot="command-loading" {...props} />
}

function CommandGroup({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Group>) {
  return (
    <CommandPrimitive.Group
      data-slot="command-group"
      className={cn(
        "text-foreground overflow-hidden p-1",
        "[&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium",
        className
      )}
      {...props}
    />
  )
}

function CommandSeparator({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Separator>) {
  return (
    <CommandPrimitive.Separator
      data-slot="command-separator"
      className={cn("bg-border -mx-1 h-px", className)}
      {...props}
    />
  )
}

function CommandItem({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Item>) {
  return (
    <CommandPrimitive.Item
      data-slot="command-item"
      className={cn(
        // one visual truth for hover AND keyboard selection — do NOT add a competing hover:*
        "data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground",
        "data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50",
        "relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none",
        "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 [&_svg:not([class*='text-'])]:text-muted-foreground",
        className
      )}
      {...props}
    />
  )
}

function CommandShortcut({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="command-shortcut"
      className={cn(
        "text-muted-foreground ml-auto text-xs tracking-widest",
        className
      )}
      {...props}
    />
  )
}

export {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandLoading,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  CommandSeparator,
}
```

### `components/command-menu.tsx` (the real component)

```tsx
"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import {
  Calendar,
  FilePlus,
  Home,
  Inbox,
  Laptop,
  Loader2,
  Moon,
  RotateCw,
  Search,
  Settings,
  Sun,
  User,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandLoading,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command"
import { cn } from "@/lib/utils"

/* -------------------------------------------------------------------------- */
/*  Context — one provider, one shortcut, opened from anywhere in the tree.    */
/* -------------------------------------------------------------------------- */

type CommandMenuContextValue = {
  open: boolean
  setOpen: (open: boolean) => void
  toggle: () => void
}

const CommandMenuContext = React.createContext<CommandMenuContextValue | null>(
  null
)

export function useCommandMenu() {
  const ctx = React.useContext(CommandMenuContext)
  if (!ctx) {
    throw new Error("useCommandMenu must be used within <CommandMenuProvider>")
  }
  return ctx
}

export function CommandMenuProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [open, setOpen] = React.useState(false)
  // Stash the element that had focus so we can restore it on close.
  const triggerRef = React.useRef<HTMLElement | null>(null)

  const setOpenTracked = React.useCallback((next: boolean) => {
    if (next) {
      triggerRef.current = document.activeElement as HTMLElement | null
    }
    setOpen(next)
  }, [])

  const toggle = React.useCallback(() => {
    setOpenTracked(!open)
  }, [open, setOpenTracked])

  // Global ⌘K / Ctrl+K listener — mounted once at the app root.
  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        // MANDATORY: stop the browser's native ⌘K (focus address bar).
        e.preventDefault()
        toggle()
      }
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [toggle])

  // Restore focus to the triggering element when the dialog closes.
  const handleOpenChange = React.useCallback(
    (next: boolean) => {
      setOpen(next)
      if (!next && triggerRef.current) {
        triggerRef.current.focus?.()
        triggerRef.current = null
      }
    },
    []
  )

  const value = React.useMemo(
    () => ({ open, setOpen: setOpenTracked, toggle }),
    [open, setOpenTracked, toggle]
  )

  return (
    <CommandMenuContext.Provider value={value}>
      {children}
      <CommandMenu open={open} onOpenChange={handleOpenChange} />
    </CommandMenuContext.Provider>
  )
}

/* -------------------------------------------------------------------------- */
/*  Visible trigger — discoverability. Renders a search-styled button.        */
/* -------------------------------------------------------------------------- */

export function CommandMenuTrigger({ className }: { className?: string }) {
  const { setOpen } = useCommandMenu()

  return (
    <Button
      variant="outline"
      onClick={() => setOpen(true)}
      className={cn(
        "text-muted-foreground relative h-9 w-full justify-start gap-2 rounded-md pr-2 pl-3 text-sm sm:w-64",
        className
      )}
    >
      <Search className="size-4 shrink-0" />
      <span className="hidden sm:inline-flex">Search…</span>
      <span className="inline-flex sm:hidden">Search</span>
      <kbd className="bg-muted pointer-events-none ml-auto hidden h-5 items-center gap-1 rounded border px-1.5 font-mono text-[10px] font-medium select-none sm:inline-flex">
        <span className="text-xs">⌘</span>K
      </kbd>
    </Button>
  )
}

/* -------------------------------------------------------------------------- */
/*  Recency — lightweight, persisted. Surfaces a "Recent" group on empty query.*/
/* -------------------------------------------------------------------------- */

const RECENTS_KEY = "command-menu:recents"
const MAX_RECENTS = 4

function useRecents() {
  const [recents, setRecents] = React.useState<string[]>([])

  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(RECENTS_KEY)
      if (raw) setRecents(JSON.parse(raw))
    } catch {
      /* ignore malformed storage */
    }
  }, [])

  const push = React.useCallback((id: string) => {
    setRecents((prev) => {
      const next = [id, ...prev.filter((x) => x !== id)].slice(0, MAX_RECENTS)
      try {
        localStorage.setItem(RECENTS_KEY, JSON.stringify(next))
      } catch {
        /* ignore quota errors */
      }
      return next
    })
  }, [])

  return { recents, push }
}

/* -------------------------------------------------------------------------- */
/*  Async search — demonstrates loading / error / empty. Swap for your API.    */
/* -------------------------------------------------------------------------- */

type Doc = { id: string; title: string }

function useDocSearch(query: string) {
  const [state, setState] = React.useState<{
    status: "idle" | "loading" | "error" | "success"
    results: Doc[]
  }>({ status: "idle", results: [] })

  const run = React.useCallback((q: string) => {
    if (!q) {
      setState({ status: "idle", results: [] })
      return
    }
    setState((s) => ({ status: "loading", results: s.results })) // keep old rows visible
    // Replace with your real fetch. AbortController-guarded, debounced below.
    const controller = new AbortController()
    fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error("Search failed")
        return r.json() as Promise<Doc[]>
      })
      .then((results) => setState({ status: "success", results }))
      .catch((err) => {
        if (err.name === "AbortError") return
        setState((s) => ({ status: "error", results: s.results }))
      })
    return () => controller.abort()
  }, [])

  // Debounce the async fetch (never the open animation / local filtering).
  React.useEffect(() => {
    const id = setTimeout(() => run(query), 200)
    return () => clearTimeout(id)
  }, [query, run])

  return { ...state, retry: () => run(query) }
}

/* -------------------------------------------------------------------------- */
/*  The palette itself.                                                        */
/* -------------------------------------------------------------------------- */

type Page = "root" | "theme"

// Static commands: id, label, icon, optional shortcut + keywords (aliases).
const NAV_COMMANDS = [
  { id: "nav:home", label: "Go to Dashboard", icon: Home, href: "/", shortcut: "G H", keywords: ["overview"] },
  { id: "nav:inbox", label: "Go to Inbox", icon: Inbox, href: "/inbox", shortcut: "G I", keywords: ["notifications"] },
  { id: "nav:calendar", label: "Go to Calendar", icon: Calendar, href: "/calendar", shortcut: "G C", keywords: ["schedule", "events"] },
] as const

const ACTION_COMMANDS = [
  { id: "action:new-doc", label: "Create new document", icon: FilePlus, shortcut: "⌘N", keywords: ["add", "file"] },
  { id: "action:profile", label: "Open profile", icon: User, keywords: ["account", "me"] },
  { id: "action:settings", label: "Open settings", icon: Settings, shortcut: "⌘,", keywords: ["preferences", "config"] },
] as const

function CommandMenu({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const { setTheme } = useTheme()
  const { recents, push } = useRecents()
  const [page, setPage] = React.useState<Page>("root")
  const [query, setQuery] = React.useState("")
  const search = useDocSearch(query)

  // Reset transient state whenever the dialog closes.
  React.useEffect(() => {
    if (!open) {
      // let the close animation finish before resetting
      const id = setTimeout(() => {
        setPage("root")
        setQuery("")
      }, 150)
      return () => clearTimeout(id)
    }
  }, [open])

  // Backspace on empty query pops a nested page instead of doing nothing.
  const onKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      if (page !== "root" && e.key === "Backspace" && query === "") {
        e.preventDefault()
        setPage("root")
      }
      // Esc on a sub-page pops one level; Esc at root closes (Radix default).
      if (page !== "root" && e.key === "Escape") {
        e.preventDefault()
        setPage("root")
      }
    },
    [page, query]
  )

  const runCommand = React.useCallback(
    (id: string, fn: () => void) => {
      push(id)
      fn()
      onOpenChange(false)
    },
    [push, onOpenChange]
  )

  const allStatic = [...NAV_COMMANDS, ...ACTION_COMMANDS]
  const recentCommands = recents
    .map((id) => allStatic.find((c) => c.id === id))
    .filter(Boolean) as (typeof allStatic)[number][]

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Command Menu"
      description="Search for a command to run"
    >
      <CommandInput
        placeholder={
          page === "theme" ? "Select a theme…" : "Type a command or search…"
        }
        value={query}
        onValueChange={setQuery}
        onKeyDown={onKeyDown}
      />

      <CommandList>
        {/* aria-live so SR users hear the empty transition */}
        <CommandEmpty>
          <span aria-live="polite">No results found.</span>
        </CommandEmpty>

        {/* ---- Nested sub-page: theme ---------------------------------- */}
        {page === "theme" ? (
          <CommandGroup heading="Theme">
            <CommandItem onSelect={() => runCommand("theme:light", () => setTheme("light"))}>
              <Sun />
              Light
            </CommandItem>
            <CommandItem onSelect={() => runCommand("theme:dark", () => setTheme("dark"))}>
              <Moon />
              Dark
            </CommandItem>
            <CommandItem onSelect={() => runCommand("theme:system", () => setTheme("system"))}>
              <Laptop />
              System
            </CommandItem>
          </CommandGroup>
        ) : (
          <>
            {/* ---- Recent (empty query only) --------------------------- */}
            {query === "" && recentCommands.length > 0 && (
              <>
                <CommandGroup heading="Recent">
                  {recentCommands.map((c) => (
                    <CommandItem
                      key={`recent-${c.id}`}
                      value={`recent ${c.label}`}
                      keywords={[...(c.keywords ?? [])]}
                      onSelect={() =>
                        runCommand(c.id, () =>
                          "href" in c ? router.push(c.href) : undefined
                        )
                      }
                    >
                      <c.icon />
                      {c.label}
                    </CommandItem>
                  ))}
                </CommandGroup>
                <CommandSeparator />
              </>
            )}

            {/* ---- Navigation ------------------------------------------ */}
            <CommandGroup heading="Navigation">
              {NAV_COMMANDS.map((c) => (
                <CommandItem
                  key={c.id}
                  value={c.label}
                  keywords={[...c.keywords]}
                  onSelect={() => runCommand(c.id, () => router.push(c.href))}
                >
                  <c.icon />
                  {c.label}
                  {c.shortcut && <CommandShortcut>{c.shortcut}</CommandShortcut>}
                </CommandItem>
              ))}
            </CommandGroup>

            <CommandSeparator />

            {/* ---- Actions -------------------------------------------- */}
            <CommandGroup heading="Actions">
              {ACTION_COMMANDS.map((c) => (
                <CommandItem
                  key={c.id}
                  value={c.label}
                  keywords={[...c.keywords]}
                  onSelect={() =>
                    runCommand(c.id, () => {
                      if (c.id === "action:settings") router.push("/settings")
                      if (c.id === "action:profile") router.push("/profile")
                      if (c.id === "action:new-doc") router.push("/new")
                    })
                  }
                >
                  <c.icon />
                  {c.label}
                  {c.shortcut && <CommandShortcut>{c.shortcut}</CommandShortcut>}
                </CommandItem>
              ))}
              {/* Nested-page entry point */}
              <CommandItem
                value="Change theme appearance"
                keywords={["dark", "light", "appearance", "mode"]}
                onSelect={() => {
                  setQuery("")
                  setPage("theme")
                }}
              >
                <Sun />
                Change theme…
              </CommandItem>
            </CommandGroup>

            {/* ---- Async search results (loading / error / success) ---- */}
            {query !== "" && (
              <>
                <CommandSeparator />
                {search.status === "loading" && (
                  <CommandLoading>
                    <div
                      className="flex items-center gap-2 px-2 py-3 text-sm text-muted-foreground"
                      aria-live="polite"
                    >
                      <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
                      Searching…
                    </div>
                  </CommandLoading>
                )}

                {search.status === "error" && (
                  <div
                    className="flex items-center justify-between px-2 py-3 text-sm"
                    role="alert"
                  >
                    <span className="text-muted-foreground">
                      Something went wrong.
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 gap-1.5"
                      onClick={search.retry}
                    >
                      <RotateCw className="size-3.5" />
                      Retry
                    </Button>
                  </div>
                )}

                {search.status === "success" && search.results.length > 0 && (
                  <CommandGroup heading="Documents">
                    {search.results.map((doc) => (
                      <CommandItem
                        key={doc.id}
                        value={doc.title}
                        onSelect={() =>
                          runCommand(`doc:${doc.id}`, () =>
                            router.push(`/docs/${doc.id}`)
                          )
                        }
                      >
                        <Search />
                        {doc.title}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
              </>
            )}
          </>
        )}
      </CommandList>

      {/* ---- Footer legend (discoverability) ------------------------- */}
      <div className="text-muted-foreground flex items-center gap-3 border-t px-3 py-2 text-xs">
        <span className="flex items-center gap-1">
          <kbd className="bg-muted rounded border px-1 font-mono">↑↓</kbd>
          navigate
        </span>
        <span className="flex items-center gap-1">
          <kbd className="bg-muted rounded border px-1 font-mono">↵</kbd>
          select
        </span>
        <span className="ml-auto flex items-center gap-1">
          <kbd className="bg-muted rounded border px-1 font-mono">esc</kbd>
          {page === "root" ? "close" : "back"}
        </span>
      </div>
    </CommandDialog>
  )
}
```

### Mount it once at the root

```tsx
// app/layout.tsx (Next.js App Router)
import { CommandMenuProvider } from "@/components/command-menu"
import { ThemeProvider } from "@/components/theme-provider" // next-themes

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <CommandMenuProvider>{children}</CommandMenuProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
```

```tsx
// Anywhere in your header:
import { CommandMenuTrigger } from "@/components/command-menu"

export function Header() {
  return (
    <header className="flex items-center gap-4 border-b px-4 py-2">
      {/* …logo… */}
      <CommandMenuTrigger className="ml-auto" />
    </header>
  )
}
```

---

## Notes & extensions

- **Context awareness:** pass the current route/entity into `CommandMenuProvider` and prepend a
  "On this page" group whose actions pre-target the current object ("Assign _this issue_ to…").
- **Ranking:** `filter` is a **score, not a boolean**. cmdk's signature is
  `filter(value, search, keywords)` returning a number where `0` means no match, and "Keywords act
  as aliases for the item value, and **can also affect the rank of the item**"
  ([cmdk](https://github.com/pacocoursey/cmdk)). For custom importance/recency weighting, set
  `shouldFilter={false}` on `<Command>` and supply pre-sorted, pre-filtered items yourself (this is
  also how you drive fully server-side search).
- **Scale ceiling:** cmdk gives **"Good performance up to 2,000-3,000 items"** without
  virtualization (same source). Past that, `shouldFilter={false}` + your own virtualized list
  (e.g. `@tanstack/react-virtual`).
- **Aliases:** because keywords feed the *rank*, the `keywords` prop is not just a synonym list —
  it is a ranking input. Invest in it; it's the difference between "typo-tolerant magic" and "why
  can't it find anything".
- **Row anatomy, from Raycast's own API:** `title` (required) · `subtitle` · `icon` ·
  `accessories` ("[a]n optional array of List.Item.Accessory items displayed on the right side")
  · `keywords` ("additional indexable strings for search")
  ([Raycast List](https://developers.raycast.com/api-reference/user-interface/list)). And their
  detail-view rule: "when shown, it is recommended not to show any accessories on the
  `List.Item` and instead bring those additional information in the `List.Item.Detail` view."
  **One accessory slot, right-aligned** — not metadata crammed into the title.
- **Tooltip skip-delay on the surrounding toolbar (not the palette itself).** The palette has no
  hover delay to tune, but the icon actions *around* it (the header toolbar the ⌘K trigger sits in)
  should share one `TooltipProvider` with `delayDuration={700} skipDelayDuration={300}`: the first
  tooltip waits (guards against accidental activation), but once one is open, adjacent tooltips open
  **instantly with no animation** while you sweep the toolbar — which makes the whole bar feel faster
  (canonical rule → motion.md §6). Per-tooltip delays and per-tooltip fades are the slow, generated
  default.

---

## Corpus grounding — command palette (2026-07-05 research)

Sourced from the superdesign repo's research corpus (docs/research/notes/product-app-ui-patterns.md) → **## Command menus (Cmd-K palettes)**.
This section grounds the recipe above with copyable rules + concrete values from the corpus, and
carries its source flags forward. The recipe's guidance stands; this is additive. Primary sources
behind these values: **shadcn/ui `command.tsx` / `dialog.tsx` + cmdk + Raycast/Superhuman/VS Code
docs + Emil Kowalski's motion writing**. The through-line: *dense ~32px rows, forgiving fuzzy match,
instant highlight, inline shortcut hints, and **minimal-to-zero entrance animation**.*

> **Provenance rule.** Flagship products publish *philosophy*; libraries, design systems,
> browser vendors and W3C publish *numbers*. Never attribute a px or ms value to Linear,
> Superhuman, Figma or Arc unless the value appears in their own page text. Specifically:
> `linear.app/blog/scaling-the-linear-sync-engine` is a **video wrapper** — cite it for the
> *architecture* (local store, optimistic mutation, background sync) and never for a number.
> The `G`+letter navigation map is **third-party-observed**, not from Linear's docs.

### Copyable rules (with values)

- **One global toggle — `⌘K` / `Ctrl+K` — and the *same key closes it*.** `⌘⇧P` is an optional alt.
  Don't fragment across ⌘K/⌘P/⌘/. *Sources:* Superhuman blog, VS Code (primary). ⚠️ **Stripe diverges**
  (`/`=search, `?`=shortcuts). ⚠️ **Figma:** `⌘K` was **reassigned to the Figma Make AI prompt bar in
  2026** — cite **`⌘/` (Quick Actions) as the durable binding**; treat `⌘K`-for-Actions as stale.
- **Snapshot the previously-focused element on open; restore it on dismiss** so `Esc` never strands
  editing context. When you open via the global shortcut (not a focusable trigger), stash
  `document.activeElement` yourself and restore it. *Sources:* Superhuman blog, cmdk (primary).
- **Enter fires exactly ONE implicit primary action** (no panel); **`⌘K` opens the full action panel**
  on the focused row. Action tiers: primary `↵`, secondary `⌘↵`, tertiary `⌘⇧↵`. In forms the primary
  is `⌘↵` (Enter reserved for text fields). *Source:* Raycast action-panel (primary).
- **Inline, right-aligned shortcut hint per row** — a real accessory slot, not inline text and not a
  footer legend — so mouse users learn shortcuts passively. shadcn `<CommandShortcut>`:
  `ml-auto text-xs tracking-widest`. *Sources:* Raycast, shadcn command.tsx (primary).
- **Forgiving fuzzy match with a *scored threshold*, run against a HIDDEN `keywords`/alias field kept
  separate from the visible label.** cmdk exposes `filter(value, search, keywords) => number`.
  Superhuman ships `command-score > 0.0015`. *Sources:* Superhuman blog, cmdk (primary). ⚠️ The **0.0015
  threshold is one implementation's tuned value, not a universal default** — tune your own.
- **Titled groups; keep filtered-out groups MOUNTED via the `hidden` attribute, do not unmount them.**
  cmdk comfortably handles ~2000–3000 items without virtualization. *Source:* cmdk (primary).
- **Loading = a thin bar under the search input**, and **suppress the empty state while an empty query
  is loading** (no false "no results" flash while streaming). *Source:* Raycast list (primary).
- **Empty state = a plain centered text row** ("No results found."), *not* an illustration. shadcn
  `CommandEmpty`: `py-6 text-center text-sm`. *Sources:* shadcn command, Raycast (primary).
- **MINIMAL-TO-ZERO entrance animation.** ⚠️ **Corpus CORRECTION:** Emil Kowalski's *Great Animations*
  praises **Raycast for shipping NO open/close animation** on its palette — the earlier
  "~500ms Raycast enter" claim was **fabricated/inverted**. If you must animate, shadcn `CommandDialog`
  uses **200ms fade + zoom 95→100% ease-out**, overlay **`bg-black/50` opacity-only** (no blur, no
  scale), ceiling **<300ms**. *Sources:* emilkowal.ski, shadcn dialog.tsx (primary).
- **Selected row = INSTANT (0ms) background+foreground token swap on a data-attribute — no border, no
  shadow, no transition** — so the highlight keeps pace with fast arrow nav.
  `data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground`; disabled
  `data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50`; panel rides
  `bg-popover` / `text-popover-foreground`. *Source:* shadcn command.tsx (primary).
- **Fixed small rows (~32px), not auto-sizing:** item `px-2 py-1.5 text-sm rounded-sm`; list
  `max-h-[300px] overflow-y-auto` (`p-1`); dialog input `h-10` inside an `h-12` wrapper; icons
  `size-4` (16px), `size-5` in the dialog input row. *Source:* shadcn command.tsx (primary).
- **Nested "pages" push a stack:** Backspace on empty input pops one level, `Esc` pops/closes (exit the
  sub-view first, then the dialog). *Sources:* cmdk, Raycast (primary).
- **Persist an MRU / recent list surfaced from the empty-query state.** VS Code cycles history with
  `↑/↓`. ⚠️ Sourced **partly to a course site (stevekinney.com)** — secondary; prefer VS Code's own
  docs.

### Token / motion defaults (corpus ⌘K block)

- **open/close:** 200ms fade + zoom 95→100% ease-out — **or 0ms, Raycast-style, on this high-frequency surface (preferred)**
- **overlay:** `bg-black/50`, opacity-only, `z-50`
- **selected-row transition:** `0ms` (instant attribute color swap)
- **rows:** ~32px (`px-2 py-1.5 text-sm rounded-sm`); list `max-h-[300px] p-1`; input `h-10` in `h-12` wrapper
- **icons:** `size-4` / `size-5 shrink-0`; separator `h-px`, visible only when the query is empty
- **surface:** `bg-popover` / `text-popover-foreground`, `rounded-md`
- **latency:** target **<100ms** end-to-end. ⚠️ Superhuman's **"50–60ms internal target" traces to a
  single dated blog post** — cite as **reconstructed**, not a verified current cross-product benchmark.

### AI-slop failures (don't ship these)

Tall airy 56px+ rows with big icons · **any decorative entrance animation on a `⌘K` surface** ·
**animating the selected-row highlight** · exact-substring-only filtering with no alias field ·
metadata crammed into the title string · full-list spinner/skeleton or a false "no results" while
streaming · no inline shortcut hints · Enter opening a menu instead of firing the primary action ·
`Esc` nuking the whole palette from a nested page · one overloaded box for search+find+insert ·
illustrated oversized empty state · hard-coded white/black instead of `popover`/`accent` tokens ·
unmounting filtered items.
