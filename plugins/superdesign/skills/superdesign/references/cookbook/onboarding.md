# Cookbook — Onboarding / first-run

Get a new user to first value fast, without a forced tour. The best onboarding is a **great empty
state + a short setup checklist**, revealed progressively — not a modal carousel that blocks the app.

## Contents

- [When to use](#when-to-use) — first run, empty workspace, multi-step account setup
- [When NOT to use](#when-not-to-use) — never gate the product behind a mandatory tour
- [Patterns (pick by need)](#patterns-pick-by-need) — empty-first-run · setup checklist · the rest, ranked by signal
- [Code — setup checklist card (React + Tailwind v4 + shadcn/ui)](#code--setup-checklist-card-react--tailwind-v4--shadcnui) — the dismissible 3–5 task card with progress
- [States](#states) — todo · done · hover · focus-visible · locked
- [Accessibility](#accessibility) — real controls per step, `aria-current`, announced progress
- [Anti-slop](#anti-slop) — no forced tour, no routine confetti, concrete task copy
- [Corpus grounding — onboarding (2026-07-05 research)](#corpus-grounding--onboarding-2026-07-05-research) — copyable rules with values, confidence flags preserved

## When to use
- First run of an app/dashboard; a workspace with no data yet; multi-step account setup.

## When NOT to use
- Don't gate the whole product behind a mandatory multi-slide tour (a named slop/annoyance tell).
  Let people into the product; guide from inside it.
- Skip onboarding chrome entirely once the account is set up — the checklist should disappear when done.

## Patterns (pick by need)
1. **Empty-first-run** — the primary screen's empty state carries the onboarding (headline + one CTA +
   optional sample data). Cheapest, highest-signal. See `references/cookbook/empty-states.md`.
2. **Setup checklist** — a dismissible card of 3–5 concrete tasks with progress; each links into the
   real flow. Best for products needing config before value.
3. **Progressive disclosure** — reveal advanced surfaces only after the basics are done; don't dump
   everything at once.
Avoid tooltip coach-marks stacked over a busy UI (they age badly and block interaction).

## Code — setup checklist card (React + Tailwind v4 + shadcn/ui)
```tsx
import { Check, Circle, ArrowRight, X } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

type Step = { id: string; title: string; desc: string; href: string; done: boolean };

export function SetupChecklist({ steps, onDismiss }: { steps: Step[]; onDismiss?: () => void }) {
  const done = steps.filter((s) => s.done).length;
  const pct = Math.round((done / steps.length) * 100);
  const nextId = steps.find((s) => !s.done)?.id; // the single "current" step
  if (done === steps.length) return null; // vanish when complete — don't linger

  return (
    <Card className="relative">
      {onDismiss && (
        <button
          type="button" aria-label="Dismiss setup"
          onClick={onDismiss}
          className="absolute right-3 top-3 grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <X className="size-4" />
        </button>
      )}
      <CardHeader>
        <CardTitle>Finish setting up</CardTitle>
        <CardDescription>{done} of {steps.length} done — a couple minutes to first value.</CardDescription>
        <Progress value={pct} className="mt-2" aria-label={`Setup ${pct}% complete`} />
      </CardHeader>
      <CardContent className="p-0">
        <ul className="divide-y">
          {steps.map((step) => (
            <li key={step.id}>
              <a
                href={step.href}
                aria-current={step.id === nextId ? "step" : undefined}
                className="group flex items-center gap-3 px-6 py-3.5 transition-colors hover:bg-muted/50 focus-visible:outline focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring"
              >
                {step.done
                  ? <Check className="size-5 shrink-0 text-success" aria-hidden />
                  : <Circle className="size-5 shrink-0 text-muted-foreground" aria-hidden />}
                <span className="flex-1">
                  <span className={"block text-sm font-medium " + (step.done ? "text-muted-foreground line-through" : "text-foreground")}>
                    {step.title}
                  </span>
                  <span className="block text-sm text-muted-foreground">{step.desc}</span>
                </span>
                {!step.done && (
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
                )}
              </a>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
```

## States
- **Step:** todo (`Circle`, foreground title) · done (`Check` in `text-success`, muted + line-through) ·
  hover (row `bg-muted/50` + arrow fades in) · focus-visible (inset ring). Optional "locked" step:
  reduced opacity + `aria-disabled`, unlocks when its prerequisite completes.
- **Card:** hides itself at 100% complete; dismiss is available but progress persists server-side.

## Accessibility
- Real `<a>`/`<button>` per step; `aria-current` on the active/next step; icons `aria-hidden`.
- `Progress` carries an `aria-label` with the percentage; completion is announced via a live region if
  it happens in place.
- Never signal done with color only — the check icon + strike-through carry it too.

## Anti-slop
- No forced full-screen tour; no confetti on routine steps (reserve delight for the true first "aha").
- Concrete, product-specific task copy ("Connect your first repo"), not vague ("Get started",
  "Explore features").
- The checklist must be genuinely dismissible and must disappear when finished — lingering onboarding
  chrome reads as unfinished product.

## Corpus grounding — onboarding (2026-07-05 research)

Grounded from the superdesign repo's research corpus (docs/research/notes/product-app-ui-patterns.md) → "## Onboarding flows". The recipe above
stands; this appendix adds copyable rules with specific values and preserves each source's confidence flag.
Core stance of the corpus: teach by *requiring the real action*, define activation as *completing the value
loop* (not creating an object), and surface shortcuts *passively* through the palette.

**Copyable rules (with values):**
- **Teach shortcuts by PASSIVE exposure** — every palette row shows its bound key inline; repeated palette
  use trains recall (no separate shortcut tutorial). *Sources:* Superhuman help (now branded **Superhuman
  Mail** post-Grammarly acquisition), Raycast manual (primary).
- **Single-key (no-modifier) for highest-frequency actions, chords for meta**: `J`=next, `K`=prev, `O`=open,
  `E`=archive/done, `R`=reply, `C`=compose, `Z`=undo; `Cmd+K`=palette, `Cmd+/`=help. *Source:* Superhuman
  [medium].
- **Introduce `Cmd+K` before any content exists** to establish a keyboard-first mental model as the core
  model. *Source:* Supademo Linear teardown ⚠️ [secondary — a demo-tool teardown, not Linear docs; **low
  confidence**].
- **Checklist steps create REAL product-native objects**, not disposable demo items. *Source:* Supademo
  ⚠️ [low].
- **Full-screen mandatory checklist takeover** when the goal is near-total completion: Superhuman's
  completion rose **30%→98%**, feature opt-in 45%→80%. *Source:* First Round ⚠️ [secondary]. ⚠️ The
  "E/H prioritization raised shortcut usage 50%" claim was **DROPPED — fabricated/unsupported in the source.**
- **Define activation as the VALUE LOOP** (Linear: *resolving* an issue, not creating one), reachable in
  **one session**. *Source:* Supademo ⚠️ [low].
- **One-input-per-step setup** (name workspace → name team → pick theme); integrations/invites are
  **skippable** — prioritize speed-to-first-value. *Source:* Supademo ⚠️ [low].
- **Bind the global activation hotkey as the FIRST onboarding action** (Raycast `Cmd+Space`, overriding
  Spotlight); make onboarding **replayable** ("Show Onboarding"). *Source:* Raycast manual (primary for the
  shortcut; sequencing/replay rests on pageflows.com, secondary → medium).
- **Prefer contextual "pull" help over proactive "push" tutorials** — show a tip only when the user is in
  the related activity, **never at launch**; reserve for complex/non-obvious functionality. *Source:* NN/g
  onboarding (primary).
- **Hover-tooltip delays**: Radix `delayDuration=700ms` open, `skipDelayDuration=300ms` (next tooltip instant
  within 300ms). *Source:* Radix Tooltip (primary). ⚠️ The dense-dashboard "**400ms**" delay is **reconstructed
  extrapolation from the Radix prop, not an observed product value** — a starting point, not a benchmark.
- **Cap guided tours at 1–3 steps, persist a "seen" flag** (never re-surface), always an unambiguous
  dismissal. *Sources:* Appcues, UserGuiding [medium].
- **Checklist dismissible-but-not-destructive** (hides only, progress persists); low-friction re-entry until
  100%; **start with endowed progress** (~1 of 5 checked if signup already happened); **compute checked state
  from actual account state** so steps auto-check. *Sources:* Appcues, saasui.design [medium/low].
- **Empty state renders exactly one required primary action whose label matches the create button used
  elsewhere**; heading no end punctuation, description punctuated. *Source:* Cloudscape empty-states (primary).
- **3-part first-run template** (why-empty status + brief explainer + single CTA); **never render
  false-empty while loading.** *Source:* NN/g empty states (primary).
- **Pre-seed sample/demo content as an explicit EQUAL-WEIGHT parallel path** ("add your own" OR "explore with
  demo data"), not a silent substitute. *Source:* NN/g empty states (primary).
- **shadcn Empty layout scale**: root `flex flex-col items-center justify-center gap-6 rounded-lg
  border-dashed p-6 md:p-12` (gap 24px, pad 24→48px); icon badge `size-10 rounded-lg bg-muted` (40px) with a
  `size-6` (24px) icon; header/content `max-w-sm` (384px); title `text-lg font-medium tracking-tight`;
  description `text-sm/relaxed text-muted-foreground`. *Source:* shadcn empty.tsx (primary). ⚠️ **Correction:**
  the real EmptyMedia icon-variant class has **NO `mb-2`** — the "8px bottom margin" was **fabricated.**

**Token/motion defaults** (from the corpus onboarding block):
- tooltip open **700ms** / skip **300ms**; UI ceiling 300ms; micro-feedback 100–160ms, tooltip 125ms,
  dropdown 150–250ms, step-panel 200–500ms
- **progress-bar fill = LINEAR** (literal proportion, never ease-in-out)
- **step entry `scale(0.95)+opacity 0`** (never `scale(0)`); stagger 30–80ms
- empty root pad 24/48px, block gap 24px, icon 40/24px, content max-w 384px, 1px dashed border
- tour 1–3 steps; global hotkey `Cmd+Space`
- ⚠️ The named cubic-bezier easings and the **8 duration bands trace to ONE author (Emil Kowalski's skills
  repo)** — a personal skill file, not a published design-system spec; medium, cross-check his 7-tips post.

**AI-slop failures:** generic spotlight/coach-mark tour with dimmed scrim at launch · blank "No items yet"
with no matching action · false "No records" while loading · shortcuts as a static doc instead of inline
palette hints · confetti on every micro-step · dismissible checklist that deletes progress / resets to 0% ·
progress starting at literal 0% / ease-in-out progress fill · long feature tour deferring first value ·
tours re-surfacing after every login · animating layout props / `scale(0)` step panels · ignoring
`prefers-reduced-motion` · one global duration for everything · push tutorials at launch · inconsistent
empty-state icon scale.
