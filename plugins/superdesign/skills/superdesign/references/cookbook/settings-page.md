# Settings Page Layout

> Pattern recipe · React + Tailwind v4 + shadcn/ui
> Slug: `settings-page` · Category: `settings-page`

A settings surface is a **two-tier navigation problem wrapped around forms**: a persistent
left nav (category list) plus a single scrollable column of grouped "setting sections."
Each section is a self-contained unit — title, one-line description, controls, and a save
affordance. The recipe below is the shape Linear, Vercel, and Stripe ship: grouped rail,
stacked `Card` sections, explicit save via a sticky dirty-state bar, and an isolated danger
zone.

## Contents

- [When to use it](#when-to-use-it) — more than ~5 configuration buckets, switched between often
- [Anatomy](#anatomy) — page header, persistent nav rail, stacked section cards, danger zone
- [Token-driven styling](#token-driven-styling) — the semantic variables the page consumes
- [Variants](#variants) — sidebar + stacked sections (default) · tabs + sections · two-column section
- [Interaction / state matrix](#interaction--state-matrix) — every section state, dirty and saving included
- [Responsive behavior](#responsive-behavior) — the rail collapses into a Sheet below `md`
- [Accessibility notes](#accessibility-notes) — landmarks, `aria-current`, per-section labelling
- [Anti-slop callout](#anti-slop-callout) — the "Misc" catch-all bucket and the other ship-blockers
- [Complete example (copy-pasteable)](#complete-example-copy-pasteable) — grouped rail, rhf + zod, sticky dirty bar, auto-save row, danger zone
- [Corpus grounding — settings (2026-07-05 research)](#corpus-grounding--settings-2026-07-05-research) — copyable rules with values, honesty flags preserved

---

## When to use it

Use this pattern when:

- You have **more than ~5 buckets** of configuration (Profile, Account, Appearance,
  Notifications, Billing, Members, API keys, …) and users switch between them frequently.
- Settings are **long-lived declarative state** edited occasionally, not a one-shot wizard.
- You need a **stable home** for account/workspace/org configuration in a B2B or prosumer
  product.

Reach for something else when:

- **≤ 3 buckets** and no growth expected → a horizontal `Tabs` layout (see Variant B) is
  lighter. Below ~2 buckets, skip the rail entirely and render one column of sections.
- **Per-object settings** (a single project, a single channel) → prefer a Dialog or
  Sheet with the same section pattern, condensed.
- **First-run configuration** → that's an onboarding wizard, not settings.

---

## Anatomy

```
Settings surface
├── Page header                     H1 "Settings" + optional description / search
├── Nav rail (LEFT, persistent)     grouped category list; admin items separated
│     • ~240px expanded, 40px rows, icon + label, active highlight
│     • small uppercase muted group labels (General / Workspace / Admin)
│     • collapses to a Sheet on mobile
└── Content column                  single column, max-w ~640–768px, generous whitespace
      └── Setting Section  (Card, repeated)          ← the atomic unit
      │     ├── CardHeader:  CardTitle + CardDescription (1 line, muted)
      │     ├── CardContent: fields, OR a 2-col grid (desc left / controls right)
      │     │     └── Field = FormLabel + FormControl + FormDescription + FormMessage
      │     └── (optional) CardFooter: per-card save
      ├── Auto-save rows            standalone Switch rows, saved on change (no save bar)
      ├── Sticky save bar           appears only when dirty: "Discard" (ghost) + "Save"
      └── Danger Zone (LAST)        destructive border/tint + AlertDialog confirm
```

**shadcn field order — memorize this, it is the core of the recipe:**

```
Form > FormField > FormItem (space-y-2)
  ├── FormLabel
  ├── FormControl        (wraps Input / Switch / Select / Textarea …)
  ├── FormDescription    (muted helper, below control)
  └── FormMessage        (validation error; replaces the description when present)
```

Rhythm: form root `space-y-8` · between sections `space-y-6`–`space-y-8` · within a field
`space-y-2` · card padding `p-6` · section header `space-y-1.5`.

---

## Token-driven styling

Every color comes from a **semantic CSS variable**, never a hardcoded hex. This is what
makes the page theme-able and dark-mode-correct for free. shadcn defines the tokens; you
consume them through Tailwind's `bg-*/text-*/border-*` utilities, which in v4 map to
`var(--color-*)`.

```css
/* app.css — shadcn tokens under Tailwind v4. Values are examples; theme freely. */
@import "tailwindcss";

:root {
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.145 0 0);
  --muted: oklch(0.97 0 0);
  --muted-foreground: oklch(0.556 0 0);
  --primary: oklch(0.205 0 0);
  --primary-foreground: oklch(0.985 0 0);
  --accent: oklch(0.97 0 0);          /* nav hover / active row */
  --accent-foreground: oklch(0.205 0 0);
  --destructive: oklch(0.577 0.245 27.325);
  --border: oklch(0.922 0 0);
  --input: oklch(0.922 0 0);
  --ring: oklch(0.708 0 0);
  --radius: 0.5rem;   /* 8px — required brand-step output, never a default (→ tokens.md §6) */
}

.dark {
  --background: oklch(0.145 0 0);
  --foreground: oklch(0.985 0 0);
  --card: oklch(0.205 0 0);
  --card-foreground: oklch(0.985 0 0);
  --muted: oklch(0.269 0 0);
  --muted-foreground: oklch(0.708 0 0);
  --primary: oklch(0.985 0 0);
  --primary-foreground: oklch(0.205 0 0);
  --accent: oklch(0.269 0 0);
  --accent-foreground: oklch(0.985 0 0);
  --destructive: oklch(0.704 0.191 22.216);
  --border: oklch(1 0 0 / 10%);
  --input: oklch(1 0 0 / 15%);
  --ring: oklch(0.556 0 0);
}

/* v4 bridge: expose the tokens to Tailwind's color utilities */
@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --radius-lg: var(--radius);
}
```

**Rules of the road:**

- Backgrounds: `bg-background` (page), `bg-card` (sections), `bg-muted/50` (subtle fills).
- Text: `text-foreground` (primary), `text-muted-foreground` (descriptions, group labels,
  helper text). Never `text-gray-500`.
- Borders/dividers: `border-border`; focus ring: `ring-ring`.
- Destructive: `text-destructive`, `border-destructive/50`, `bg-destructive/5`. The danger
  zone tints with an **alpha of the token** (`/50`, `/5`) so it tracks the theme.
- Radii: `rounded-lg` → `var(--radius)`. Keep one radius system.

If you ever type a `#hex` in a settings component, that's the smell — stop and reach for a
token.

---

## Variants

### Variant A — Sidebar + stacked sections (default)

Persistent left rail, single content column of `Card` sections, explicit save via sticky
dirty bar. This is the recipe's main body below. Best for complex B2B products with many
categories and frequent cross-section switching (Linear / Vercel shape).

### Variant B — Tabs + sections (small surfaces)

Swap the rail for horizontal `Tabs`; render the same stacked sections under the active tab.

```tsx
<Tabs defaultValue="general" className="space-y-6">
  <TabsList>
    <TabsTrigger value="general">General</TabsTrigger>
    <TabsTrigger value="notifications">Notifications</TabsTrigger>
    <TabsTrigger value="danger">Advanced</TabsTrigger>
  </TabsList>
  <TabsContent value="general" className="space-y-6">{/* sections */}</TabsContent>
  {/* … */}
</Tabs>
```

Use only for **≤ 5 top-level areas** and when you don't need helper text on the nav
itself. Tabs scale poorly and force an arbitrary default-selected tab, so don't push this
past a handful of categories.

### Variant C — Two-column section (marketing-grade account pages)

Within a section, put the title + description on the left and controls on the right. Reads
as spacious and editorial (Stripe / Tailwind Plus). Collapses to one column on mobile.

```tsx
<section className="grid grid-cols-1 gap-x-8 gap-y-6 md:grid-cols-3">
  <div className="md:col-span-1">
    <h3 className="text-base font-medium text-foreground">Profile</h3>
    <p className="mt-1 text-sm text-muted-foreground">
      This information is displayed publicly.
    </p>
  </div>
  <div className="md:col-span-2 space-y-6">{/* fields */}</div>
</section>
```

---

## Interaction / state matrix

Design **every** section for all of these. This is the part people get wrong.

| State | Trigger | Treatment |
|---|---|---|
| **At rest (pristine)** | Loaded, no edits | Static values; save bar hidden; auto-save rows idle |
| **Focused / editing** | Field focused | `focus-visible:ring-2 ring-ring`; description visible |
| **Dirty / unsaved** | `formState.isDirty` | Sticky bar slides up: "You have unsaved changes" + Discard + Save |
| **Validating / invalid** | Submit with bad input | `FormMessage` inline under field; save button **stays enabled**, shows error |
| **Saving** | Submit in flight | Button spinner + "Saving…"; block double-submit via `isSubmitting`, not disabled-until-dirty |
| **Saved / success** | Save resolves | Inline "Saved" text/badge or `Alert` banner; bar collapses; `form.reset(values)` to clear dirty |
| **Save error** | Save rejects | **Preserve input**; inline/banner error with retry; never clear fields |
| **Loading (initial)** | Data fetching | `Skeleton` per field/card — not a full-page spinner |
| **Empty** | No members / no API keys | Section-level empty state with a primary CTA |
| **Read-only / no permission** | Insufficient role | Disable controls **with an explanation** (tooltip / helper), never silently |
| **Destructive** | Danger-zone action | Red-tinted section → `AlertDialog` confirm; type-to-confirm + re-auth for the worst |

**Save-model rules (Primer / GitHub):**

- **Pick ONE save model per form.** Never mix auto-save and explicit save in the same form.
- **Auto-save** only for imperative, standalone controls: toggles, segmented controls,
  single-selects. Show inline "Saved"/spinner at the control.
- **Explicit save** is the default for declarative controls: text, textarea, checkbox,
  radio, multi-select. Keyboard/AT users can change these accidentally, so require a commit.
- **Do not disable or hide the save button** when unchanged/invalid — disabled buttons
  can't be focused and break keyboard/AT. Validate on submit and surface errors instead.
- One save button per form. Action-verb labels ("Save changes"), never "Done"/"OK".
- Prefer inline/banner confirmation over toast-only (toasts are a11y-fragile).

---

## Responsive behavior

- **Desktop (`md` and up):** persistent rail + content column side by side; two-column
  sections use `md:grid-cols-3`.
- **Mobile (< `md`):** rail collapses into a `Sheet` triggered from the header; content is
  a single column; two-column sections drop to `grid-cols-1`.
- **Sticky bottom actions** stay reachable while scrolling on mobile — the same dirty bar
  works on both.
- Mobile-first utilities: unprefixed classes apply everywhere; `md:` restores the two-pane
  layout and multi-column grids. Touch targets ≥ 44px on mobile rows.

---

## Accessibility notes

- **Landmarks:** rail is `<nav aria-label="Settings">`; content is `<main>`. Each section
  is a `<section aria-labelledby={id}>` whose `CardTitle` carries that `id`.
- **Active nav item:** set `aria-current="page"` on the active link, not color alone.
- **Labels:** every control has a real `FormLabel` (shadcn wires `htmlFor`/`id` via
  `FormField`). Descriptions and errors are associated through `aria-describedby` /
  `FormMessage` automatically.
- **Errors:** `FormMessage` renders `role="alert"`-adjacent messaging tied to the field;
  never rely on red border alone. Move focus to the first invalid field on failed submit.
- **Save button:** keep it enabled so keyboard/AT users can trigger validation. Announce
  save success via an inline live region (`aria-live="polite"`), not a transient toast.
- **Disabled controls:** pair with a visible explanation; a bare disabled control is
  invisible to the "why can't I edit this?" question.
- **Danger zone:** the `AlertDialog` traps focus, restores it on close, and the confirm
  button is labeled with the concrete action ("Delete workspace"), not "Yes".
- **Focus rings:** never remove them — `focus-visible:ring-2 ring-ring` on every
  interactive element.

---

## Anti-slop callout

Ship-blockers that mark a settings page as generic AI output — avoid all of these:

1. **A "Misc/Other" catch-all bucket.** Every setting belongs to a real category. If you
   can't name the bucket, the IA is wrong.
2. **Wall of toggles** — a dense single column with no groups, no headers, no descriptions.
   Group them, add section titles, and give **every** toggle a one-line description of what
   it does.
3. **Mixing save models** in one form (some fields auto-save, others need a button).
4. **Disabling the save button** until the form is dirty/valid. Keep it enabled; validate
   on submit.
5. **Toast-only save confirmation.** Use an inline "Saved" indicator or banner.
6. **Vague buttons** ("Done", "OK", "Submit") instead of "Save changes" / "Update email".
7. **Tabs for a large surface** — no room for helper text, poor scaling.
8. **Losing user input on save error.** Preserve the form; show a retry.
9. **Silent read-only controls** — disabled with no explanation.
10. **Destructive actions inline and unconfirmed.** Isolate them in a red danger zone with
    an `AlertDialog` (and type-to-confirm for the irreversible ones).
11. **Full-page spinner** on load instead of skeletons.
12. **Hardcoded hex colors** instead of semantic tokens — breaks theming and dark mode.

The tell of a good settings page: you can hand it to a colorblind user in dark mode with a
keyboard and every state is legible, reachable, and labeled.

---

## Complete example (copy-pasteable)

Variant A: grouped rail + stacked `Card` sections, `react-hook-form` + `zod`, sticky
dirty-state save bar, one standalone auto-save toggle row, skeleton loading, and an
isolated danger zone with `AlertDialog`. All color via tokens; all spacing via the rhythm
above.

**Install the primitives:**

```bash
npx shadcn@latest add button card input textarea switch select label separator \
  sheet skeleton alert alert-dialog form badge
npm i react-hook-form zod @hookform/resolvers lucide-react
```

```tsx
// app/settings/page.tsx
"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Bell,
  Loader2,
  Menu,
  ShieldAlert,
  User,
  Building2,
  Check,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

/* ---------------------------------- Nav ---------------------------------- */

type NavItem = { id: string; label: string; icon: React.ElementType };
type NavGroup = { label: string; items: NavItem[] };

const NAV: NavGroup[] = [
  {
    label: "General",
    items: [
      { id: "profile", label: "Profile", icon: User },
      { id: "notifications", label: "Notifications", icon: Bell },
    ],
  },
  {
    label: "Workspace",
    items: [{ id: "workspace", label: "Workspace", icon: Building2 }],
  },
  {
    label: "Admin",
    items: [{ id: "danger", label: "Advanced", icon: ShieldAlert }],
  },
];

function SettingsNav({
  active,
  onSelect,
}: {
  active: string;
  onSelect: (id: string) => void;
}) {
  return (
    <nav aria-label="Settings" className="flex flex-col gap-6">
      {NAV.map((group) => (
        <div key={group.label} className="flex flex-col gap-1">
          <p className="px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {group.label}
          </p>
          {group.items.map((item) => {
            const isActive = item.id === active;
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelect(item.id)}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium",
                  "transition-colors outline-none",
                  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  isActive
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                )}
              >
                <Icon className="size-4 shrink-0" aria-hidden />
                {item.label}
              </button>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

/* ------------------------------- Profile form ------------------------------ */

const profileSchema = z.object({
  name: z.string().min(1, "Name is required").max(64, "Keep it under 64 characters"),
  email: z.string().email("Enter a valid email address"),
  bio: z.string().max(240, "Bio must be 240 characters or fewer").optional(),
});
type ProfileValues = z.infer<typeof profileSchema>;

async function saveProfile(values: ProfileValues) {
  // Replace with your mutation. Throw to exercise the error state.
  await new Promise((r) => setTimeout(r, 900));
  return values;
}

function ProfileSection() {
  const [saved, setSaved] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const form = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    // In production, seed from fetched data (see LoadingSection for the fetch shape).
    defaultValues: { name: "Ada Lovelace", email: "ada@example.com", bio: "" },
    mode: "onSubmit",
  });

  const { isDirty, isSubmitting } = form.formState;

  async function onSubmit(values: ProfileValues) {
    setError(null);
    setSaved(false);
    try {
      const next = await saveProfile(values);
      form.reset(next); // clears `isDirty` and hides the save bar
      setSaved(true);
    } catch {
      // Preserve input; surface a retryable error.
      setError("Couldn't save your changes. Please try again.");
    }
  }

  return (
    <Form {...form}>
      {/* pb leaves room for the sticky save bar */}
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 pb-24">
        <Card>
          <CardHeader className="space-y-1.5">
            <CardTitle>Profile</CardTitle>
            <CardDescription>
              This information may be displayed to other members of your workspace.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem className="space-y-2">
                  <FormLabel>Display name</FormLabel>
                  <FormControl>
                    <Input placeholder="Your name" {...field} />
                  </FormControl>
                  <FormDescription>Shown on your profile and in mentions.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem className="space-y-2">
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input type="email" autoComplete="email" {...field} />
                  </FormControl>
                  <FormDescription>Used for sign-in and notifications.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="bio"
              render={({ field }) => (
                <FormItem className="space-y-2">
                  <FormLabel>Bio</FormLabel>
                  <FormControl>
                    <Textarea rows={3} placeholder="A short introduction" {...field} />
                  </FormControl>
                  <FormDescription>Max 240 characters.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Inline, accessible save feedback — not a toast */}
        {error ? (
          <p role="alert" className="text-sm font-medium text-destructive">
            {error}
          </p>
        ) : null}

        {/* Sticky dirty-state save bar: appears only when the form is dirty */}
        <SaveBar
          visible={isDirty}
          saving={isSubmitting}
          saved={saved && !isDirty}
          onDiscard={() => {
            form.reset();
            setSaved(false);
            setError(null);
          }}
        />
      </form>
    </Form>
  );
}

/* -------------------------------- Save bar -------------------------------- */

function SaveBar({
  visible,
  saving,
  saved,
  onDiscard,
}: {
  visible: boolean;
  saving: boolean;
  saved: boolean;
  onDiscard: () => void;
}) {
  // Keep the "Saved" confirmation briefly after the bar would otherwise hide.
  const show = visible || saved;
  if (!show) return null;

  return (
    <div
      className={cn(
        "sticky bottom-4 z-10 mx-auto flex max-w-2xl items-center justify-between gap-4",
        "rounded-lg border border-border bg-card/95 px-4 py-3 shadow-lg backdrop-blur",
        "supports-[backdrop-filter]:bg-card/80",
        "motion-safe:animate-in motion-safe:slide-in-from-bottom-2 motion-safe:fade-in",
      )}
    >
      <p className="flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
        {saved && !visible ? (
          <>
            <Check className="size-4 text-foreground" aria-hidden />
            <span className="text-foreground">All changes saved</span>
          </>
        ) : (
          "You have unsaved changes"
        )}
      </p>
      <div className="flex items-center gap-2">
        <Button type="button" variant="ghost" onClick={onDiscard} disabled={saving}>
          Discard
        </Button>
        {/* Never disabled-until-dirty: only blocked while a save is in flight. */}
        <Button type="submit" disabled={saving}>
          {saving ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Saving…
            </>
          ) : (
            "Save changes"
          )}
        </Button>
      </div>
    </div>
  );
}

/* --------------------------- Auto-save toggle row -------------------------- */

function NotificationsSection() {
  const [emailDigest, setEmailDigest] = React.useState(true);
  const [pending, setPending] = React.useState<string | null>(null);

  async function toggle(key: string, next: boolean, set: (v: boolean) => void) {
    set(next); // optimistic
    setPending(key);
    try {
      await new Promise((r) => setTimeout(r, 600)); // replace with mutation
    } catch {
      set(!next); // roll back on failure
    } finally {
      setPending(null);
    }
  }

  return (
    <Card>
      <CardHeader className="space-y-1.5">
        <CardTitle>Notifications</CardTitle>
        <CardDescription>
          Toggles save immediately — no separate save button.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <Label htmlFor="email-digest" className="text-sm font-medium">
              Weekly email digest
            </Label>
            <p className="text-sm text-muted-foreground">
              A Monday summary of activity across your workspace.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {pending === "email-digest" ? (
              <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />
            ) : null}
            <Switch
              id="email-digest"
              checked={emailDigest}
              onCheckedChange={(v) => toggle("email-digest", v, setEmailDigest)}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------- Danger zone ------------------------------ */

function DangerZone() {
  const [confirmText, setConfirmText] = React.useState("");
  const [deleting, setDeleting] = React.useState(false);
  const CONFIRM = "delete my workspace";

  return (
    <Card className="border-destructive/50 bg-destructive/5">
      <CardHeader className="space-y-1.5">
        <CardTitle className="text-destructive">Danger zone</CardTitle>
        <CardDescription>
          These actions are permanent and cannot be undone.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-0.5">
            <p className="text-sm font-medium text-foreground">Delete workspace</p>
            <p className="text-sm text-muted-foreground">
              Removes all projects, members, and data.
            </p>
          </div>
          <AlertDialog onOpenChange={() => setConfirmText("")}>
            <AlertDialogTrigger asChild>
              <Button variant="destructive">Delete workspace</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this workspace?</AlertDialogTitle>
                <AlertDialogDescription>
                  This permanently deletes the workspace and all of its data. To confirm,
                  type <span className="font-medium text-foreground">{CONFIRM}</span> below.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="space-y-2">
                <Label htmlFor="confirm" className="sr-only">
                  Type “{CONFIRM}” to confirm
                </Label>
                <Input
                  id="confirm"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder={CONFIRM}
                  autoComplete="off"
                />
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  disabled={confirmText !== CONFIRM || deleting}
                  onClick={async (e) => {
                    e.preventDefault();
                    setDeleting(true);
                    await new Promise((r) => setTimeout(r, 800)); // replace with mutation
                    setDeleting(false);
                  }}
                  className="bg-destructive text-white hover:bg-destructive/90"
                >
                  {deleting ? (
                    <>
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                      Deleting…
                    </>
                  ) : (
                    "Delete workspace"
                  )}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------- Loading state ----------------------------- */

function LoadingSection() {
  return (
    <Card>
      <CardHeader className="space-y-1.5">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-4 w-64" />
      </CardHeader>
      <CardContent className="space-y-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-9 w-full" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/* -------------------------------- Read-only ------------------------------- */

function WorkspaceSection({ canEdit = false }: { canEdit?: boolean }) {
  return (
    <Card>
      <CardHeader className="space-y-1.5">
        <CardTitle>Workspace</CardTitle>
        <CardDescription>Organization-wide settings.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <Label htmlFor="ws-name">Workspace name</Label>
        <Input id="ws-name" defaultValue="Acme Inc." disabled={!canEdit} />
        {!canEdit ? (
          // Read-only WITH an explanation — never silent.
          <p className="text-sm text-muted-foreground">
            Only workspace admins can change this. Ask an admin to update it.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

/* ---------------------------------- Page ---------------------------------- */

export default function SettingsPage() {
  const [active, setActive] = React.useState("profile");
  const [loading, setLoading] = React.useState(false); // flip to true to preview skeletons

  const section = React.useMemo(() => {
    if (loading) return <LoadingSection />;
    switch (active) {
      case "profile":
        return <ProfileSection />;
      case "notifications":
        return <NotificationsSection />;
      case "workspace":
        return <WorkspaceSection canEdit={false} />;
      case "danger":
        return <DangerZone />;
      default:
        return null;
    }
  }, [active, loading]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-8 md:flex-row md:gap-12 md:py-12">
        {/* Header + mobile nav trigger */}
        <div className="md:hidden">
          <div className="mb-4 flex items-center justify-between">
            <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon" aria-label="Open settings menu">
                  <Menu className="size-4" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-64 p-6">
                <SheetTitle className="mb-6 text-lg font-semibold">Settings</SheetTitle>
                <SettingsNav active={active} onSelect={setActive} />
              </SheetContent>
            </Sheet>
          </div>
          <Separator />
        </div>

        {/* Persistent rail (desktop) */}
        <aside className="hidden w-56 shrink-0 md:block">
          <h1 className="mb-6 text-2xl font-semibold tracking-tight">Settings</h1>
          <SettingsNav active={active} onSelect={setActive} />
        </aside>

        {/* Content column */}
        <main className="w-full max-w-2xl flex-1">{section}</main>
      </div>
    </div>
  );
}
```

**What this reference gets right (the checklist to keep when you adapt it):**

- Tokens only — `bg-background`, `text-muted-foreground`, `border-destructive/50`; zero hex.
- Explicit save via a **dirty-state sticky bar** driven by RHF `isDirty`; the save button
  is only disabled while `isSubmitting`, never disabled-until-dirty.
- Save success is **inline + `aria-live`**, not a toast; `form.reset(next)` clears dirty.
- Exactly one auto-save surface (the toggle row), kept in its own section — save models are
  never mixed within a form.
- Danger zone is isolated, tinted with token alpha, and gated by an `AlertDialog` with
  type-to-confirm.
- Skeletons for load, read-only-with-explanation, `aria-current` nav, real `<nav>`/`<main>`
  landmarks, visible focus rings, and a `Sheet` rail on mobile.

---

## Corpus grounding — settings (2026-07-05 research)

Grounds the recipe above with copyable rules + concrete values from the app-UI research
corpus. Source note: the superdesign repo's research corpus (docs/research/notes/product-app-ui-patterns.md) → **"## Settings
pages."** This is additive; it doesn't replace the recipe. Honesty flags from the corpus
are preserved verbatim — do **not** launder reconstructed/directional numbers as verified
product specs.

**Corpus framing:** settings are IA, not a design failure
([Linear](https://linear.app/now/settings-are-not-a-design-failure)). The craft: pick
**one** save paradigm per view, give functional settings strong defaults (reserve toggles
for taste), and match destructive-action friction to blast radius.

### Copyable rules (with values)

- **Choose the surface by task weight.** Default to the lightest in-context panel; escalate
  to a full-width blocking view only for focused, start-to-finish tasks. Roots:
  ContextView (default) / FocusView (full-width blocking) / SettingsView.
  ⚠️ This taxonomy is specific to the **Stripe Apps extension platform**, *generalized
  here* — **not** Stripe's own Dashboard settings IA. *Source:*
  [docs.stripe.com/stripe-apps/design](https://docs.stripe.com/stripe-apps/design)
  (primary).
- **Full navigable settings page with its OWN left sub-nav, split Workspace/org vs
  personal/account**, opened via `Cmd+,`. *Sources:* Linear (primary),
  [Notion workspace settings](https://www.notion.com/help/workspace-settings) (primary; a
  modal is acceptable for shallow settings). ⚠️ Linear added a **team-level** tier (team
  owners, Dec 2025) for Business/Enterprise — the split can now be up to three tiers, not
  strictly two.
- **Strong opinionated defaults for functional settings; expose only taste as toggles**
  (e.g. "show pointer cursor over links"). *Source:* Linear (primary).
- **Pick ONE save paradigm per view** — never mix autosave and explicit-save on the same
  page. *Source:* [GitLab Pajamas](https://design.gitlab.com/patterns/saving-and-feedback/)
  (primary).
- **Field-level autosave.** Click-type controls (toggle/select/checkbox) save immediately;
  typed text saves on blur OR after an idle debounce. *Source:* GitLab (primary).
  ⚠️ The specific **3000ms text debounce could not be independently confirmed** on the
  cited page (which documents 250/500ms *validation* debounce) — verify before shipping;
  keep the qualitative "blur-or-pause" rule regardless.
- **Persistent autosave status with a relative timestamp**: "Saving…" (spinner) → "Saved
  just now" → "Saved 1 min ago". *Source:* GitLab (primary).
- **Autosave toasts differentiate singular vs batched, always carry inline Undo, and
  persist failures**: "Change saved" / "x changes saved" / "Failed to save x changes"
  (persistent + retry). Toast auto-dismiss pauses when the tab is hidden. *Sources:*
  GitLab, [Sonner](https://sonner.emilkowal.ski/toast) (primary).
- **Explicit-save dirty-state.** Save disabled by default; on the first change it enables
  AND a "Discard changes" control appears; the label mirrors state ("Save" vs "Saved").
  Guard navigation-away with a blocking modal (save-then-leave / discard-then-leave).
  *Source:* GitLab (primary). (Note: this recipe's own SaveBar keeps Save enabled and only
  disables while `isSubmitting`, per Primer/GitHub a11y — corpus GitLab guidance differs on
  the disabled-until-dirty detail; reconcile per your a11y bar, keep exactly one paradigm.)
- **Never autosave sensitive fields** (passwords, billing, privacy/visibility) — require
  explicit confirmation. *Source:* GitLab (primary).
- **Optimistic toggle.** Flip instantly at **50% opacity** in-flight → **100%** on confirm,
  roll back on failure. *Sources:* GitLab,
  [Vercel guidelines](https://vercel.com/design/guidelines) (primary).
- **Match destructive friction to blast radius** (GitLab 3 tiers): **Low** (undoable) = no
  confirm; **Medium** (recoverable) = one extra step / min 2 clicks; **High** (irreversible)
  = full modal + danger button + type-to-confirm when it cascades. *Source:*
  [GitLab destructive-actions](https://design.gitlab.com/patterns/destructive-actions/)
  (primary).
- **Irreversible actions use a non-dismissible AlertDialog** (no X, no outside-click,
  announced as alert) — distinct from Dialog. *Source:*
  [shadcn AlertDialog](https://ui.shadcn.com/docs/components/radix/alert-dialog) (primary).
- **Type-to-confirm for the highest-blast-radius deletes; prefer the literal object NAME**
  over a generic keyword (doubles as an identity check). GitHub repo delete = type the full
  repo name; real keywords: Resend "DELETE", ConvertKit "DO IT". *Sources:*
  [GitHub docs](https://docs.github.com/en/repositories/creating-and-managing-repositories/deleting-a-repository),
  [Smashing Magazine](https://www.smashingmagazine.com/2024/09/how-manage-dangerous-actions-user-interfaces/)
  (secondary).
- **Destructive = dedicated red (not brand) + a non-color icon** on both trigger and
  confirm; **button copy names the consequence** ("Delete Project", never "Yes"/"OK").
  Isolate in a red-bordered "Danger Zone" placed **last**. *Sources:* shadcn, GitHub,
  GitLab (primary/secondary).
- **Build rows on a single Field primitive** (shadcn Field: vertical / horizontal /
  responsive via `@container/field-group`) so the label-control-help rhythm stays
  consistent. *Source:* [shadcn Field](https://ui.shadcn.com/docs/components/base/field)
  (primary).
- **Spacing hierarchy**: between-field `gap-6` (**24px**) noticeably larger than
  within-field `space-y-2` (**8px**), ~**3:1**. ⚠️ shadcn has a known drift (8px in
  `FormItem` vs 6px in a bare label+input) — pick one; **8px is the documented value**.
  *Sources:* shadcn Field,
  [GH issue #2305](https://github.com/shadcn-ui/ui/issues/2305) (primary).
- **Don't pre-disable submit on incomplete forms**; surface validation on attempt, and
  disable + spinner only in-flight. *Source:* Vercel (primary).
- **Programmatically associate label+control; share one generous hit target**: ≥24px
  desktop (expand if the visual is smaller), ≥44px mobile; **mobile input font-size ≥16px**
  to prevent iOS auto-zoom. *Source:* Vercel (primary).
- **Inline multi-tier role select on the member row** (Notion: Member / Membership admin /
  Workspace owner), not a boolean or a separate page. *Source:* Notion (primary).

### Token / motion defaults (corpus settings block)

- between-field **24px** / within-field **8px**; save show-delay **150–300ms** /
  min-visible **300–500ms**; mutation target **<500ms**
- validation debounce: low-cost **250ms** / high-cost **500ms**; optimistic in-flight
  opacity **50%**
- focus: `:focus-visible`, **2px** ring, **full opacity (≥3:1)**; hit target ≥24px desktop
  / ≥44px mobile; input ≥16px mobile. ⚠️ The ring detail "2px @ ~50% opacity" is
  **Linear-reconstructed** — the *requirement* is Vercel-primary, the *number* is
  reconstructed; shadcn's default ~50%-opacity ring commonly fails WCAG AA 3:1, so bump to
  full opacity.
- destructive: red / `destructive` variant + non-color icon
- transition ceiling **<300ms**, ease-out `cubic-bezier(0.23,1,0.32,1)`, entry
  `scale(0.95)/opacity:0`, stagger **30–80ms**; **never animate `Cmd+S` saves**
- ⚠️ **Linear-reconstructed control tokens** (radius 8/12/16px, input padding 8×12, button
  8×14, base 4px) are from a **third-party token dump, not Linear docs** —
  `[reconstructed]`, low confidence. The **shadcn spacing values are the verifiable ones.**

### AI-slop failures (settings)

Mixing autosave and explicit-save · no dirty-state / no nav guard (silent data loss) · bare
"Are you sure? Yes" instead of an AlertDialog · destructive buttons in brand color beside
benign ones · generic-keyword type-to-confirm on cascade deletes · autosaving sensitive
fields · toasts with no Undo (or timers running while the tab is hidden) · pre-disabled
submit · blocking paste in validated fields · spinners with no show-delay/min-visible ·
`:focus` or no ring · dead label zones on toggle rows · no relative-time save status · flat
ungrouped nav with no Workspace/Personal split · over-boxing every section in a card · mixed
6/8px gaps · sub-16px mobile inputs · animating keyboard saves · every option an
equal-weight toggle.
