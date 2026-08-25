# Token System — OKLCH, 3-Tier, Tailwind v4 `@theme`

The complete, concrete token system the skill emits. Every value is authored in **OKLCH**
(`oklch(L C H)`), organized in **three tiers** (primitive → semantic → component), and shipped
as Tailwind v4 CSS-first tokens (`:root` / `.dark` + `@theme inline`). All numbers below are
grounded in the research notes (Tailwind v4, Radix Colors, Material 3, shadcn/ui, tweakcn,
Evil Martians, IBM Carbon, Inter Dynamic Metrics, Emil Kowalski / Rauno / M3 motion).

**The one knob that adapts everything to a brand:** the brand **hue angle `H`** (0–360). Hold `H`
constant down the brand ramp, keep the neutral ramp faintly tinted toward it, and every other
value (spacing, type, motion) is brand-agnostic. Swap `H` → the whole system re-skins.
**`--radius` is the second brand knob and it has no default** — it is a required output of the brand
step (§6).

## Contents

0. [Governing rules](#0-governing-rules-why-oklch--3-tiers) — why OKLCH, the 3-tier chain, delivery format, the anti-slop guardrail, the hard caps (3–5 colors, ≤2 families, line-height, body-size floors)
1. [Color primitives](#1-color-primitives--the-ramps) — ramp recipe, neutral / brand / semantic ramps, the per-step contract, on-color law, charts
2. [Surfaces & elevation](#2-surfaces--elevation-tone-based-both-modes) — tonal ladder both modes, sunken/fixed, dark base, light-on-dark weight compensation
3. [Semantic layer](#3-semantic-layer-shadcn-vocabulary-extended--full-theme-scaffold) — shadcn vocabulary extended, full `@theme` scaffold, slot grammar, the third (high-contrast) theme
4. [Typography scale](#4-typography-scale) — sizes, line-height laws, tracking bound to the size token, the three gray levels and emphasis-by-de-emphasis, numerics, measure, OpenType
5. [Spacing rhythm](#5-spacing-rhythm-48pt) — the 4pt ramp and why it is 4pt, nudge half-steps, negative space, `internal ≤ external`, the optical-alignment nudges
6. [Radius scale](#6-radius-scale) — Shape Lock, multiplicative derivation, nested/concentric radius
7. [Shadow / elevation scale](#7-shadow--elevation-scale) — six role-named levels, border-first for resting surfaces, resting cap, whisper elevation, dark-mode rules
8. [Motion tokens](#8-motion-tokens-durations--easing--springs) — easing set, duration ladder and the one cross-view carve-out, generated spring pairs, spatial vs effects
9. [Delivery checklist](#9-delivery-checklist-what-done-looks-like) — what "done" looks like, and the ratios it must print
10. [Interaction states](#10-interaction-states) — the three non-colliding axes, state-layer opacities, full state matrix, empty states as a deliverable
11. [App-UI product defaults](#11-app-ui-product-defaults-dense-product-surfaces) — dense product surfaces: motion ladder, density knob, focus ring, shell/palette/toast
12. [Contrast solver](#12-contrast-solver--solve-dont-assert) — `solveL()`, the checked pair list, UNREACHABLE
13. [Bound pairs](#13-bound-pairs-roles-that-must-not-collapse) — minimum ΔL between related roles, the awkward band

---

## 0. Governing rules (why OKLCH + 3 tiers)

- **OKLCH is perceptually uniform:** equal `L` steps *look* equally spaced, and `L` is decoupled
  from hue/chroma. HSL lies (yellow vs blue at `L 50%` look nothing alike). Consequence: verify
  contrast **once per L step**, then swap hues freely — contrast guarantees survive. This is the
  single biggest reason to author in OKLCH. Baseline-supported since May 2023 (~90% global); ship
  without fallbacks. Default in Tailwind v4.
- **`L` 0–1, `C` 0→~0.37 (hard ceiling for sRGB+P3 safety), `H` 0–360.** Never crank `C` past a
  hue's gamut ceiling — Chrome/Safari clip rather than gamut-map, so it renders wrong.
- **3-tier chain is strictly one-way:** `component → semantic (alias) → primitive → raw value`.
  A component token **never** points straight at a primitive. Dark mode / re-branding = re-pointing
  the **semantic** layer only; components and markup never change. Only ~10–20% of primitives get
  promoted to semantics. Promote a component token upward only at **3+ consumers** (Curtis rule).
- **Delivery format:** raw `oklch()` primitives + semantic values live in `:root` / `.dark`; a single
  `@theme inline` block maps them into Tailwind's `--color-*` / `--radius-*` / `--shadow-*` namespaces
  so `bg-primary`, `rounded-lg`, `shadow-md` resolve. `@theme inline` is **mandatory** whenever a token
  references another variable (the dark-mode case) — plain `@theme` breaks scope reactivity.
- **Anti-slop guardrail (Anthropic cookbook + slop catalog):** do **not** ship the training-data default
  accent `indigo-500 #6366F1` / `violet-500 #8B5CF6` / `purple-500 #A855F7`, nor purple→blue gradients
  on white (both flagged by the cookbook), nor a single `rgba(0,0,0,0.1)` shadow on everything, nor
  uniform `16px` radius everywhere (the latter two from the wider slop catalog).
  Purple is allowed only as a *real* brand decision. The worked example below uses a deliberate cobalt
  `H=240` — swap it for the project's actual brand hue.

**Hard caps — the counts the Phase-1 gate checks.** 60-30-10 alone does not prevent palette sprawl,
because a 9-hue palette can still be 60-30-10; these caps are separate, and hard:
- **Exactly 3–5 colors total:** 1 brand hue + 2–3 neutrals + 1–2 accents. Never exceed 5 without the
  user asking.
- **Maximum 2 font families** — one display, one text (a third only if it is mono; weights are free).
  Never a display or decorative face for body text.
- **Body line-height 1.4–1.6** (§4 gives the per-rung values and the two line-height laws).
- **Body size by register:** prose/marketing **16px floor** · product-UI **14px default** · **13px**
  legitimate for secondary and dense views · **14px hard floor on mobile** (§4).

---

## 1. Color primitives — the ramps

### 1.1 Ramp-building recipe (applies to every hue family)

1. **Hold `H` constant** down the ramp (small "hue torsion" of ±2° is fine and matches Tailwind).
2. **Descend `L` monotonically.** Canonical 11-step `L` ramp (50→950), matched across Tailwind v4 /
   Evil Martians: `0.978, 0.936, 0.881, 0.827, 0.742, 0.648, 0.573, 0.469, 0.394, 0.320, 0.238`.
3. **`C` follows a bell curve** — near-white and near-black can't hold chroma. Peak at 500–600,
   taper to the ends. Example per-step `C`: `0.011, 0.032, 0.061, 0.091, 0.140, 0.147, 0.130, 0.107,
   0.090, 0.073, 0.054`.
4. **Neutrals get tiny chroma (`C ≈ 0.005–0.015`) tinted toward the brand hue** — never pure `C=0`
   (feels dead), never high chroma. Only `L` varies meaningfully. Small enough not to consciously read
   as "tinted," strong enough for subconscious cohesion (teal brand → neutrals lean teal). The
   authored ramp below sits at the low end (`0.002–0.008`) which is fine; `0.005–0.015` is the working
   band — stay under it.
   **Tint toward the *brand* hue, never a generic warm default.** The ~60-hue warm cream/sand wash
   (`oklch(0.97 0.01 60)` and its sand neighbours) applied "for warmth" now reads as *generated*. The
   banned-hex list + machine trigger are a named tell owned by **anti-slop.md § `cream-beige-surface`**
   (single source — don't re-list the hexes here). The positive rule here: neutrals lean toward the
   brand `H`; avoid reflex-hue accents (blue `H≈250` / warm orange `H≈60`).

Verified real anchors to sanity-check generated values (Tailwind v4, authoritative):
`red-500 oklch(0.637 0.237 25.331)` · `blue-500 oklch(0.623 0.214 259.815)` ·
`green-500 oklch(0.723 0.219 149.579)` · `gray-950 oklch(0.13 0.028 261.692)`.

**Per-step contract — emit it with the ramp and hold it.** The recipe above tells you how to *make*
the ramp; the contract tells you what breaks when a step is wrong. Radix's 12-step contract,
compressed onto this system's 11 steps; Geist's 10-step in the right column.

| our step | job | Geist equivalent |
|---|---|---|
| 50 | app background | 100 default bg |
| 100 | subtle background / component bg (rest) | 200 hover bg |
| 200 | hovered component background | 300 active bg |
| 300 | active / selected component background · subtle border (non-interactive) | 400 default border |
| 400 | border on interactive components | 500 hover border |
| 500 | strong border on interactive components **and focus rings** | 600 active border |
| 600 | accent · large/bold text (3:1) · **chroma peak** | 700 high-contrast bg |
| 700 | **solid fill** (white on-text) | 800 hover high-contrast bg |
| 800 | hovered solid fill | — |
| 900 | low-contrast text on light bg | 900 secondary text/icons |
| 950 | high-contrast text | 1000 primary text/icons |

**Rule of the peak:** the step used for solid fills carries the **highest chroma** in the ramp — "the
purest step, mixed with the least white or black" (Radix). Don't let the chroma bell peak anywhere
else. Two drift checks that follow straight from the table (Radix's own numbering in brackets, since
its 12-step scale is what the rule was written against): a **focus ring resolves to step 500**
[Radix 8], never 700 [Radix 9] — 700 is a fill, not a line; a **non-interactive separator resolves to
step 300** [Radix 6], never 400 [Radix 7].

### 1.2 Neutral ramp (60% of the UI — the most important ramp)

Tinted toward the brand hue (`H=240`), chroma held ≈0.002–0.008. Does all the heavy lifting:
backgrounds, surfaces, borders, body text, disabled states.

```css
--neutral-50:  oklch(0.985 0.002 240);
--neutral-100: oklch(0.970 0.003 240);
--neutral-200: oklch(0.922 0.004 240);
--neutral-300: oklch(0.870 0.005 240);
--neutral-400: oklch(0.708 0.007 240);
--neutral-500: oklch(0.556 0.008 240);
--neutral-600: oklch(0.439 0.008 240);
--neutral-700: oklch(0.371 0.008 240);
--neutral-800: oklch(0.269 0.007 240);
--neutral-900: oklch(0.205 0.006 240);
--neutral-950: oklch(0.145 0.006 240);
```
Also ship **alpha neutrals** for compositing over color/photos (where solid grays fail) — use
`--alpha(var(--neutral-950) / 8%)` / Tailwind's `bg-neutral-950/8`, which compile to
`color-mix(in oklab, …, transparent)`. Prefer these over ad-hoc `rgba(0,0,0,.08)`.

### 1.3 Brand ramp (`H=240`, one knob to re-skin)

`L` on the canonical ramp, `C` bell-curve peaking at 600 (the primary fill). Kept under the P3
ceiling.

```css
--brand-50:  oklch(0.971 0.014 240);
--brand-100: oklch(0.936 0.032 240);
--brand-200: oklch(0.885 0.061 240);
--brand-300: oklch(0.808 0.091 240);
--brand-400: oklch(0.704 0.140 240);
--brand-500: oklch(0.637 0.170 240);  /* accent / solid rest */
--brand-600: oklch(0.573 0.180 240);  /* chroma peak → accent, large/bold text (3:1) */
--brand-700: oklch(0.505 0.155 240);  /* PRIMARY button fill (clears AA 4.5:1 on white) / solid hover */
--brand-800: oklch(0.444 0.125 240);
--brand-900: oklch(0.396 0.100 240);
--brand-950: oklch(0.258 0.065 240);
```
Brand solid **with white text on it = 700** (`L ≤ ~0.545` clears AA 4.5:1 for 14px labels); 500/600
are for accents, borders, and large/bold text only (3:1). Hover = one step darker; subtle container =
**50/100**; brand text on neutral bg = **700** (light) / **300–400** (dark). The same "≤0.545 fill for
white text" rule applies to success/info solids — hence the darkened semantic values above. Keep brand in the **10% lane** (60-30-10 rule):
buttons, active states, links, focus rings — never flood 60% of the UI with saturated brand.

### 1.4 Semantic hue ramps (success / warning / error / info)

Conventional, color-blind-distinguishable hues (always pair color with icon/label — never hue alone):
**success** green `H≈150`, **warning** amber `H≈85`, **error** red `H≈27`, **info** blue `H≈255`.
Each ships the same slot structure; the used steps:

```css
/* SUCCESS — green H150 (the binding hue for the L ≤ 0.55 rule) */
--success-100: oklch(0.950 0.040 150);   /* subtle bg   */
--success-300: oklch(0.830 0.110 150);   /* border      */
--success-500: oklch(0.723 0.190 150);   /* accent / large-bold only — far too light for white on-text */
--success-600: oklch(0.627 0.170 150);   /* accent hover — still above L 0.55 */
--success-700: oklch(0.520 0.130 150);   /* WHITE-on-text solid · text on neutral */

/* WARNING — amber H85 (⚠ DARK on-text — the exception) */
--warning-100: oklch(0.965 0.050 85);
--warning-300: oklch(0.880 0.120 85);
--warning-500: oklch(0.850 0.160 85);    /* solid — light fill  */
--warning-600: oklch(0.760 0.150 85);
--warning-700: oklch(0.560 0.110 70);    /* text on neutral */

/* ERROR / DANGER — red H27 (white on-text at 600 and darker) */
--error-100: oklch(0.945 0.030 27);
--error-300: oklch(0.808 0.110 25);
--error-500: oklch(0.637 0.237 27);
--error-600: oklch(0.577 0.245 27);      /* == shadcn --destructive */
--error-700: oklch(0.505 0.213 27);

/* INFO — blue H255 (white on-text at 700; the semantic `--info` is darkened to L 0.55) */
--info-100: oklch(0.932 0.032 255);
--info-300: oklch(0.809 0.114 256);
--info-500: oklch(0.623 0.214 259);
--info-600: oklch(0.546 0.215 262);
--info-700: oklch(0.488 0.190 262);
```

**On-color rule (computed, not estimated — bake it into the token, never leave it to component
authors):** white on-text is legal only when the fill's **`L` ≤ 0.55**; at **`L` ≥ 0.58** use dark
on-text. The WCAG crossover sits at `L` ≈ 0.57, so 0.55 is the safe side and 0.55–0.58 is a band
where you must compute the pair and print the ratio (§12). At chroma 0.15 the binding hue is
**green `H` ≈ 140–150**: `L` 0.545 → 4.63:1 (pass), `L` 0.560 → 4.35:1 (fail). **Check `--success`
first — it is the hue that breaks.** Amber/warning is the mirror case: its fill is light (`L` 0.85),
so it takes **dark** on-text — the "warning trap".
Radix's published brand-scale split, for calibration: white on-text — bronze, brown, orange, tomato,
crimson, purple, violet, indigo, green, grass; **dark on-text — yellow, amber**. Any other bright,
high-`L` step-9 fill (sky, mint, lime and friends) also needs dark on-text — verify with the
`L ≤ 0.55` rule rather than from a memorized list.

**Quantitative law — stated in the space you author in.** On **Material's tone axis (CIE L\*,
0–100)**: Δtone ≥ 40 ⇒ 3:1; Δtone ≥ 50 ⇒ ~4.5:1 (worst pair 4.48:1 — Material interpolates a
ContrastCurve rather than trusting the bare delta). On **OKLCH `L` (Oklab, 0–1) those numbers do NOT
transfer** — the two lightnesses diverge by up to 12.7 tone points in the shadows, and ΔL 0.40
computes to **2.28:1**. Worst-case-safe OKLCH thresholds: **ΔL ≥ 0.50 ⇒ 3:1** · **ΔL ≥ 0.60 ⇒
4.5:1**. Never divide a tone rule by 100 and call it `L`.

### 1.5 Chart / data-viz palette (do NOT reuse semantic hues for categories)

A separate sub-system. Categorical hues ≥30° apart, capped at 5–6, equal perceptual weight.
Slots are assigned in fixed order and never cycled. **Do not ship shadcn's default chart tokens** —
they are Tailwind's palette in OKLCH (its dark `--chart-4` *is* `purple-500`), so the one place a
theme is most likely to leak the substrate is the chart block. The palette below is the shipped one
from `assets/theme.css`; dark is **selected, not flipped** — its own steps from the same hues.

```css
/* light — validated on the light chart surface (--card, #ffffff) */
--chart-1: oklch(0.575 0.163 255.5);  /* blue   */
--chart-2: oklch(0.671 0.175 40.6);   /* orange */
--chart-3: oklch(0.669 0.141 162.1);  /* green  */
--chart-4: oklch(0.764 0.161 75.1);   /* amber  */
--chart-5: oklch(0.716 0.141 357.4);  /* pink   */

/* dark — validated on the dark chart surface (--card, #15181a) */
--chart-1: oklch(0.622 0.161 255.1);  --chart-2: oklch(0.622 0.173 40.1);
--chart-3: oklch(0.621 0.128 163.1);  --chart-4: oklch(0.670 0.143 73.2);
--chart-5: oklch(0.622 0.171 0.8);
```
Color is computable, so compute it — never eyeball whether a palette is color-blind-safe. Re-run
after **any** edit: `node scripts/validate-chart-palette.mjs` (lightness band, chroma floor,
adjacent-pair CVD ΔE under protan/deutan/tritan simulation, normal-vision ΔE, contrast vs surface;
exit 0 = pass in both modes). A slot under 3:1 on its surface is not a failure but an obligation —
it must carry relief: a direct label, a 2px surface gap, or a table view. Always double-encode with
shape/label. Sequential = single-hue monotonic `L` (or viridis); diverging = blue↔red through a
light neutral.

---

## 2. Surfaces & elevation (tone-based, both modes)

Elevation is expressed by **surface tone**, not just shadow. Light mode: higher = *slightly darker/
more contained*. **Dark mode: higher = LIGHTER surface** (light comes from above) — never darker-than-
canvas or big black shadows. **Light `L`** = Material 3's verified tonal ladder; **Dark `L`** = aligned
to this system's neutral base so surfaces equal `--background` / `--card` / etc. (both obey M3's rule:
higher = lighter in dark). M3's own dark tones sit lower (6/10/12/17/22) if you want a darker feel:

| Role | Light `L` | Dark `L` | Use |
|---|---|---|---|
| `surface-dim` | 0.87 | 0.06 | dimmest canvas |
| `surface` (canvas) | 0.98–1.0 | 0.145 | page background |
| `surface-container-low` | 0.96 | 0.205 | non-interactive cards |
| `surface-container` | 0.94 | 0.24 | default component container |
| `surface-container-high` | 0.92 | 0.28 | modal sheet / high-emphasis |
| `surface-container-highest` | 0.90 | 0.32 | dialogs, drawers, menus |

> Note: the shipped scaffold (§3) and `assets/theme.css` use a tighter 3-step container ladder —
> light `0.985 / 0.970 / 0.955`, dark `0.240 / 0.280 / 0.320` for `surface-container[-high|-highest]`.
> The fuller M3 ladder in the table above is available if you need more elevation levels.

**Three roles the ladder can't express** — a well, a mode-invariant surface, and the top light-catch:

```css
:root {
  --surface-sunken:    oklch(0.955 0.004 240);  /* Atlassian: sunken DARKENS in BOTH modes */
  --primary-fixed:     oklch(0.885 0.061 240);  /* M3 "fixed": identical in light AND dark */
  --primary-fixed-dim: oklch(0.808 0.091 240);
  --on-primary-fixed:  oklch(0.205 0.006 240);
  --shadow-inset-highlight: inset 0 1px 0 0 oklch(1 0 0 / 0.06);  /* Primer --shadow-inset */
}
.dark {
  --surface-sunken: oklch(0.110 0.006 240);     /* darker than --background, in dark too */
  /* --primary-fixed* deliberately NOT re-pointed — that is the whole point of "fixed" */
}
```
`sunken` is the one surface allowed to break "higher = lighter in dark": a well (code block, inset
panel, empty drop zone) sits *below* the canvas in both modes. `fixed` is for a role that must read
identically across modes — a brand chip inside a card that itself inverts.

Dark base = **never `#000`** — use a brand-tinted **off-black at `L 12–18%`**, e.g.
`oklch(0.145 0.006 240)` (≈`#121212`, tinted toward brand `H`). Concrete dark-elevation deltas:
- **Elevation via *lighter* surface `L`, not shadow** (shadows vanish on dark). A clean 3-step surface
  scale where higher = lighter: **`L 15% / 20% / 25%`** on the *same* brand hue + chroma, varying only
  `L` → `--card` / `--popover` / `--muted` in `.dark`. Material's overlay model caps out ~16% white at
  24dp; steps of ~+3–5% `L` read as distinct elevation, lightening caps ~`L 0.32` before "gray" stops
  reading as a surface.
- **Desaturate accents** (+L −C): full-chroma accents glare on dark — drop `C` ~0.02–0.05 and raise `L`
  one ramp step (`brand-600 → brand-400`-ish), flip on-text to dark. Ration saturated color to small
  elements.

**Light-on-dark body-weight compensation** — light text on a dark field reads *heavier* and blooms, and
also perceptually *lighter/tighter*. Two **opposing** corrections exist; **test per font, apply one — not
both blind:**
- *Bloom fix* (glyphs look chunky): drop body weight **400 → 350** — needs a variable font; set
  `font-weight: 350` on `.dark body`.
- *Perceived-lightness fix* (text looks thin/cramped): three-axis bump — line-height **+0.05–0.1**,
  letter-spacing **+0.01–0.02em**, optionally weight up one notch (400 → 500).

**Never stack a third, invisible correction on top.** `-webkit-font-smoothing: antialiased` (and
`-moz-osx-font-smoothing: grayscale`) is **non-standard and macOS-only**, and MDN's own description of
what it does is *"make light text on dark backgrounds appear lighter"* — i.e. it is a fourth thinning
correction that fires for some of your users and not others. Shipped globally alongside the 400 → 350
bloom fix, macOS gets two corrections and Windows/Linux get none. **Pick one.** If you ship
`antialiased`, don't also drop the weight; if you drop the weight, leave smoothing at `auto`. Verify
on Windows before either ships — a macOS-only property cannot be the fix for a cross-platform defect.
`assets/theme.css` therefore ships neither: smoothing stays `auto` and the weight drop is opt-in.

Name surfaces by **role** (`surface.raised`, `surface.overlay`) so components self-place across modes.
Text tiers on dark are best done as **white alpha** (`87% / 60% / 38%`) so they re-composite over any
elevated surface. One theme per page — sections don't invert; set the theme once at the layout root.

---

## 3. Semantic layer (shadcn vocabulary, extended) + full `@theme` scaffold

Adopt shadcn/ui's battle-tested semantic set verbatim, extended with `success/warning/info` and the
surface-elevation roles. **Every surface ships a `-foreground` pair**: the base token is the surface
color, `-foreground` is the text/icon color that sits on it — guarantees a legible pair in both modes
and makes automatic WCAG checking trivial.

```css
@import "tailwindcss";
@custom-variant dark (&:is(.dark *));

:root {
  /* --- radius / spacing / tracking bases (scales derived in @theme) --- */
  --radius: 0.5rem;                   /* 8px — SaaS-minimal preset. REQUIRED brand-step output: take
                                         it from the archetype table in brand-to-system.md. Never
                                         ship shadcn's 0.625rem default; see §6 */

  /* --- core surfaces --- */
  --background: oklch(1 0 0);            --foreground: oklch(0.205 0.006 240);
  --card: oklch(1 0 0);                  --card-foreground: oklch(0.205 0.006 240);
  --popover: oklch(1 0 0);              --popover-foreground: oklch(0.205 0.006 240);
  --muted: oklch(0.970 0.003 240);      --muted-foreground: oklch(0.54 0.010 240); /* AA 4.5:1 even on bg-muted */

  /* --- brand / actions --- */
  --primary: oklch(0.53 0.17 240);      --primary-foreground: oklch(0.985 0.002 240); /* darkened from brand-600 → clears AA 4.5:1 for white 14px labels */
  --secondary: oklch(0.970 0.003 240);  --secondary-foreground: oklch(0.269 0.007 240);
  --accent: oklch(0.936 0.032 240);     --accent-foreground: oklch(0.396 0.100 240);

  /* --- semantic feedback (base = solid, -foreground = on-color) --- */
  --success: oklch(0.53 0.15 150);      --success-foreground: oklch(0.985 0 0); /* darkened → AA 4.5:1 on white */
  --warning: oklch(0.850 0.160 85);     --warning-foreground: oklch(0.280 0.070 70); /* DARK */
  --destructive: oklch(0.577 0.245 27); --destructive-foreground: oklch(0.985 0 0);
  --info: oklch(0.55 0.19 259);         --info-foreground: oklch(0.985 0 0); /* darkened → AA 4.5:1 on white */

  /* --- lines --- */
  --border: oklch(0.922 0.004 240);     --input: oklch(0.922 0.004 240);
  --ring: oklch(0.53 0.17 240);         /* focus ring = brand; must hit 3:1 vs adjacent */

  /* --- elevation surfaces (tone-based) --- */
  --surface-container:        oklch(0.985 0.002 240);
  --surface-container-high:   oklch(0.970 0.003 240);
  --surface-container-highest:oklch(0.955 0.004 240);

  /* --- charts (validated; see §1.5 — never the shadcn defaults) --- */
  --chart-1: oklch(0.575 0.163 255.5); --chart-2: oklch(0.671 0.175 40.6);
  --chart-3: oklch(0.669 0.141 162.1); --chart-4: oklch(0.764 0.161 75.1);
  --chart-5: oklch(0.716 0.141 357.4);
}

.dark {
  --background: oklch(0.145 0.006 240);  --foreground: oklch(0.985 0.002 240);
  --card: oklch(0.205 0.006 240);        --card-foreground: oklch(0.985 0.002 240);
  --popover: oklch(0.205 0.006 240);    --popover-foreground: oklch(0.985 0.002 240);
  --muted: oklch(0.269 0.007 240);       --muted-foreground: oklch(0.708 0.007 240);

  /* brand LIGHTENS + DESATURATES in dark (same hue): +L, -C */
  --primary: oklch(0.704 0.140 240);     --primary-foreground: oklch(0.205 0.006 240);
  --secondary: oklch(0.269 0.007 240);   --secondary-foreground: oklch(0.985 0.002 240);
  --accent: oklch(0.320 0.070 240);      --accent-foreground: oklch(0.985 0.002 240);

  --success: oklch(0.723 0.150 150);     --success-foreground: oklch(0.205 0.006 240);
  --warning: oklch(0.860 0.140 85);      --warning-foreground: oklch(0.280 0.070 70);
  --destructive: oklch(0.704 0.191 22);  --destructive-foreground: oklch(0.205 0.006 240);
  --info: oklch(0.715 0.150 255);        --info-foreground: oklch(0.205 0.006 240);

  /* translucent-white lines on dark — softer than solid gray (steal this) */
  --border: oklch(1 0 0 / 10%);          --input: oklch(1 0 0 / 15%);
  --ring: oklch(0.556 0.008 240);

  --surface-container:        oklch(0.240 0.007 240);
  --surface-container-high:   oklch(0.280 0.007 240);
  --surface-container-highest:oklch(0.320 0.008 240);

  /* dark is SELECTED, not flipped — its own steps from the same hues */
  --chart-1: oklch(0.622 0.161 255.1); --chart-2: oklch(0.622 0.173 40.1);
  --chart-3: oklch(0.621 0.128 163.1); --chart-4: oklch(0.670 0.143 73.2);
  --chart-5: oklch(0.622 0.171 0.8);
}

@theme inline {
  --color-background: var(--background);       --color-foreground: var(--foreground);
  --color-card: var(--card);                   --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);             --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);             --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);         --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);                 --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);               --color-accent-foreground: var(--accent-foreground);
  --color-success: var(--success);             --color-success-foreground: var(--success-foreground);
  --color-warning: var(--warning);             --color-warning-foreground: var(--warning-foreground);
  --color-destructive: var(--destructive);     --color-destructive-foreground: var(--destructive-foreground);
  --color-info: var(--info);                   --color-info-foreground: var(--info-foreground);
  --color-border: var(--border);               --color-input: var(--input);  --color-ring: var(--ring);
  --color-surface-container: var(--surface-container);
  --color-surface-container-high: var(--surface-container-high);
  --color-surface-container-highest: var(--surface-container-highest);
  --color-chart-1: var(--chart-1); --color-chart-2: var(--chart-2); --color-chart-3: var(--chart-3);
  --color-chart-4: var(--chart-4); --color-chart-5: var(--chart-5);

  /* radius scale derived from ONE base token — MULTIPLICATIVE (shadcn's published
     derivation; subtraction goes negative at --radius: 0 and flattens at 16px, §6) */
  --radius-sm: calc(var(--radius) * 0.6);
  --radius-md: calc(var(--radius) * 0.8);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) * 1.4);
}

@layer base {
  * { @apply border-border; }
  /* full-opacity ring, keyboard-only — NOT shadcn's outline-ring/50 (§10, §11) */
  :focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; }
  body { @apply bg-background text-foreground; }
}
```

**Add a new semantic token = exactly 3 edits:** add to `:root`, add to `.dark`, add one line to
`@theme inline` (`--color-x: var(--x)`) → `bg-x text-x-foreground` now exists. Never half-wire it.

**Dark-mode accent rule applied above:** same hue, **+L −C** (`brand-600 → brand-400`-ish); desaturate
~15–20% relative (drop `C` ~0.02–0.05, raise `L` one ramp step). Flip on-text (dark text on the lighter
dark-mode primary). Ration saturated color to small elements. Text tiers on dark are best done as white
alpha (`87% / 60% / 38%`) so they re-composite over any elevated surface.

**Slot grammar — for anything beyond the shadcn core.** When a token needs a state or an emphasis
level, use the ordered grammar; never invent a flat name. Order (Atlassian's, verbatim):
`property → role → emphasis → state`. Our form: `--{bg|text|border|icon}-{role}-{emphasis?}-{state?}`
→ `--bg-brand-subtle-hover`, `--text-critical-on-fill-active`, `--border-brand-strong`. Two
conventions worth stealing outright: Polaris's **`fill` vs `surface` split** (same role, small solid
area vs large surface, two different values) and Polaris's **`-on-{surface}` on-color slot**
(`--p-color-text-brand-on-bg-fill`), which makes the on-color a *named token* instead of a derivation
every component re-does. Radix ships the same idea as `--accent-contrast`.

**Emit a third theme, not just light and dark.** One scalar `--contrast-level`: `0` standard ·
`0.5` medium (every text pair ≥ 3:1, borders ≥ 3:1) · `1` high (every text pair ≥ 7:1). Ship it
behind `@media (prefers-contrast: more)` **and** a `.contrast-high` class, and re-run the §12 solver
at the new target instead of hand-picking values. Precedent: Material ships `contrastLevel` −1..1
with standard / medium / high; Linear ships a `contrast` dial demonstrated at 30 vs 100, for the
stated purpose of *"automatically includ[ing] super high-contrast themes for users who need it for
accessibility reasons."*

---

## 4. Typography scale

**Ratio by product type** (encode as a switch, not a fixed default):
`1.125–1.2` dashboards/dense apps · `1.25–1.333` content sites · `1.5+` marketing/landing.

**The body floor is per register, not global.** Prose and marketing: **16px floor** (Butterick's
band is 15–25px). Product UI: **14px is the default, not a compromise** — Geist calls `text-label-14`
the *"most common text style of all"* and M3's `body-medium` is 14/20. **13px** stays legitimate for
secondary and dense text (Geist `copy-13`). **14px is the hard floor** on mobile and for anything
outside a dense data view. This skill's declared product register is a dense dashboard → 14px body,
16px only on reading surfaces (§11).

**Line-height shrinks as size grows.** Sizes/line-heights track Tailwind v4's proven scale:

```css
@theme {
  --text-xs:   0.75rem;   --text-xs--line-height:   1.333;  /* 12/16 — captions, meta */
  --text-sm:   0.875rem;  --text-sm--line-height:   1.429;  /* 14/20 — labels, UI     */
  --text-base: 1rem;      --text-base--line-height: 1.5;    /* 16/24 — body           */
  --text-lg:   1.125rem;  --text-lg--line-height:   1.556;  /* 18/28 — lead body      */
  --text-xl:   1.25rem;   --text-xl--line-height:   1.4;    /* 20/28 — h4             */
  --text-2xl:  1.5rem;    --text-2xl--line-height:  1.333;  /* 24/32 — h3             */
  --text-3xl:  1.875rem;  --text-3xl--line-height:  1.2;    /* 30/36 — h2             */
  --text-4xl:  2.25rem;   --text-4xl--line-height:  1.111;  /* 36/40 — h1             */
  --text-5xl:  3rem;      --text-5xl--line-height:  1.083;  /* 48/52 — display        */
  --text-6xl:  3.75rem;   --text-6xl--line-height:  1.133;  /* 60/68 — hero           */

  --font-weight-normal:   400;   /* body */
  --font-weight-medium:   500;   /* UI labels, emphasis */
  --font-weight-semibold: 600;   /* headings */
  --font-weight-bold:     700;   /* strong headings */
}
```

**MUST — any `--text-*` name beyond the stock scale above breaks `cn()` unless you register it.**
`text-*` is Tailwind's one overloaded namespace: it means font-size *and* text-color, and
`tailwind-merge` — which every shadcn `cn()` calls — disambiguates only by matching a fixed name
list (`xs` `sm` `base` `lg` `xl` `2xl`…`9xl`). It never looks at what your `@theme` key actually
renders. So the moment you add a semantic size — `--text-hero`, `--text-label`, `--text-h1`,
anything off that list — `tailwind-merge` cannot tell it from a color utility, and
`cn('text-hero text-primary')` silently returns `'text-primary'`. No error, no warning; the size
class never reaches the DOM. Measured on `tailwind-merge@3.6.0`, the version this skill's own
`examples/app-ui` pins:

```
twMerge('text-6xl text-primary')  -> 'text-6xl text-primary'   // stock name: safe
twMerge('text-hero text-primary') -> 'text-primary'            // custom name: size is gone
twMerge('text-hero')              -> 'text-hero'               // no colour to collide with: safe
```

That third line is why this survives review: the token works everywhere until a colour class lands
beside it. It cost a hero rendering at 16px instead of 112px while typecheck, build, three grep
gates and the contrast solver were all green (the superdesign repo's field-run log (evals/field-runs/2026-08-23-dkuvpn.md) F1, F11).

The fix ships in the same commit as the token, in `lib/utils.ts`:

```ts
import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      // every --text-* suffix in @theme that is not xs/sm/base/lg/xl/2xl…9xl
      text: ['hero', 'hero-sm', 'hero-md', 'h1', 'h2', 'h3', 'lead', 'label', 'data'],
      // every --color-* suffix that could collide with a text-/bg-/border- prefix
      color: ['rule', 'primary-hover', 'primary-quiet', 'positive', 'surface-container'],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

Both arrays are facts about the `@theme` block, not prose to maintain by hand. After any token
change run the gate, which fails non-zero on drift:

```bash
node scripts/check-tw-merge-tokens.mjs <theme.css> <lib/utils.ts>
```

**Display leading is 1.083 / 1.133, never `1`.** `line-height: 1` clips descenders — the same bug the
italic rule below guards against — and is tighter than any verifiable system: M3 `display-large` is
57/64 = 1.123, Apple's Large Title 34/41 = 1.206. 48/52 and 60/68 also keep both rungs on the 4px grid.

**Two line-height laws, held as invariants:**
- **(a) Every computed line-height lands on a multiple of 4px.** Verified: all 15 M3 line-heights do
  (16 20 24 28 32 36 40 44 52 64), and so does every rung of the scale above — hold it. Check with
  `rg -n 'leading-\[([0-9.]+)(px|rem)?\]|line-height:\s*[0-9.]+(px)?' src/`, then assert
  `size × ratio % 4 === 0` for each `--text-*` pair.
- **(b) Leading ≈ size + 5px across 13–20px**, growing to +6/+7 above 22px (derived from Apple's
  Dynamic Type table). **Additive, not multiplicative** — one ratio is wrong at both ends.

**Label vs copy leading — a 14px string is not one thing:**
```css
@theme {
  --leading-copy:  1.45;   /* multi-line prose in product UI */
  --leading-label: 1.30;   /* single-line; marries up with a 16px icon */
}
```
A 14px string in a table cell, button, or chip takes `--leading-label`; a 14px paragraph takes
`--leading-copy`. (Geist: *"Label: designed for single-lines… Copy: designed for multiple lines of
text, having a higher line height than Label."*) Where a ratio and law (a) collide — 14 × 1.45 =
20.3px — the grid wins: round to the nearest 4px rung.

**Weights:** differentiate hierarchy with **weight + color + space**, not size alone (essential in
low-ratio dense UI). **≤3–4 weights with fixed roles** — Regular `400` body / Medium `500` or Semibold
`600` labels / Bold `700` headings — "Regular, Medium, Semibold, Bold is plenty." Don't drift Bold in one
section and Semibold in another *for the same role*. Product default: body `400`, headings `600–700`. For
expressive/marketing, use **weight extremes (200 vs 800), not 400 vs 600**, and **size jumps of 3×**, not
1.5× (anti-slop). Hierarchy contrast must clear the perceptual threshold to register: size **≥3:1** (not
`<2:1`), weight **Bold vs Regular** (not Medium vs Regular).

**Three gray text levels, not five** — primary (near-black), secondary, tertiary — carried by
`--foreground` / `--muted-foreground` / a third muted step, with **mostly two weights** across the
whole screen. Two rules follow from that budget: **emphasize by de-emphasizing the neighbours**,
never by enlarging the target (a screen where everything is emphasized has no hierarchy); and on a
**colored** background the quiet tier is a **same-hue tint of that surface** — lower chroma, higher
`L`, same `H` — never a gray borrowed from the neutral ramp, which reads as dirt on a colored field.

**Tracking (letter-spacing) — bind it to the size token, not to a band.** Five hand-picked bands
under-track the 20–24px range by ~0.005em, and that is exactly where every dashboard section title
sits. Ship the Inter Dynamic-Metrics curve (`tracking = -0.0223 + 0.185·e^(-0.1745·px)`) evaluated
per rung, so a size utility carries its own optical tracking and nobody has to pair two classes:

```css
@theme {
  --text-xs--letter-spacing:   0em;        /* 12px → +0.0005, round to 0 */
  --text-sm--letter-spacing:  -0.006em;    /* 14px */
  --text-base--letter-spacing:-0.011em;    /* 16px */
  --text-lg--letter-spacing:  -0.014em;    /* 18px */
  --text-xl--letter-spacing:  -0.017em;    /* 20px */
  --text-2xl--letter-spacing: -0.019em;    /* 24px */
  --text-3xl--letter-spacing: -0.021em;    /* 30px */
  --text-4xl--letter-spacing: -0.022em;    /* 36px */
  --text-5xl--letter-spacing: -0.022em;    /* 48px */
  --text-6xl--letter-spacing: -0.022em;    /* 60px, the asymptote is -0.0223 */

  --tracking-tight: -0.022em;   /* explicit display override (== the asymptote) */
  --tracking-caps:   0.06em;    /* uppercase only (POSITIVE, +0.04–0.1em) */
}
```
⚠️ The `--text-*--letter-spacing` companion to `--text-*--line-height` is **UNVERIFIED** as a
Tailwind v4 theme key — build-test it once. If Tailwind rejects it, ship the same ten values as
`--tracking-{xs…6xl}` utilities and pair them by hand. Only `tight` and `caps` survive as named
bands (the cookbook uses both); `snug` / `normal` / `wide` are gone — the size token owns them now.

**The curve is Inter's, not "any neo-grotesque".** Use the dynmetrics values above only when the
family is Inter or a close relative (SF, Geist, Söhne-likes). For Roboto and wide-set humanists ship
`letter-spacing: 0` at every step ≥14px and `+0.03em` below 12px — M3's own values. If the foundry
publishes a tracking table, it beats both. The size of the disagreement, so nobody splits the
difference: at 16px body, M3 gives Roboto **+0.031em** where Inter's curve gives **−0.011em** — 0.042em
apart at the most-used size in any UI.

Rule: **never** let display-level negative tracking (`−0.02em`+) leak onto body/small text (the #1
amateur tell) — the `−0.011em` on 16px body above is Inter's own optical metric, not a violation;
12px stays at `0`. **ALL-CAPS / small-caps get *positive* tracking `+5–12%` (`0.05–0.12em`)** —
eyebrows, overlines, table headers, uppercase buttons; capitals crowd at default spacing. **Ban
untracked `uppercase`.** Large display headings get `-0.02–0.03em` — one of the biggest "premium" tells.

**Numerics — mandatory:** emit `font-variant-numeric: tabular-nums` on **every** number in the UI —
metric, counter, KPI value, timer, price, numeric input, and every data-table numeric cell. Non-negotiable
for a dashboard: proportional figures jitter horizontally as values change; tabular figures lock the width.
Pair it with **`lining-nums`**: `tnum` alone still lets old-style figures sit off-baseline in a serif or
brand face, which is why a "tabular" column can still look broken. Add `slashed-zero` for code/IDs.

**Measure.** `max-width: 66ch` single-column, `48ch` multi-column — a `ch` width, **never a px
width**. `ch` is **not** characters — it is
the advance width of `0`, wider than the mean lowercase advance in most UI sans, so count the rendered
characters once per font and adjust; the exact multiplier is UNVERIFIED. Both published bands, with
their author: **Bringhurst 45–75 characters, 66 ideal, 40–50 multi-column**; **Butterick 45–90
characters** ("2–3 lowercase alphabets"), practical band 60–70ch. Scales with zoom, satisfies WCAG
1.4.4. Leading scales *inversely* with measure: headings `1.1–1.2`, body `1.5–1.7`.

**Wrapping — the two values have hard limits, so scope them.**
```css
h1,h2,h3,h4,h5,h6,blockquote,figcaption,.card-title { text-wrap: balance; }
p,li,dd,.help-text                                  { text-wrap: pretty; }
```
`balance` is Chrome 114+ and **capped at six wrapped lines in Chromium** — past that it silently does
nothing (spec: a UA must not change the line count for blocks of ≤5 lines and *"may treat this value as
auto if there are more than ten lines"*). Chrome's own warning: *"It is not a good idea to apply text-wrap
balancing to your entire design… may impact page render speed."* `pretty` is Chrome 117+ and fixes
**orphans only — not widows**. `text-wrap: balance` on `body`, `*`, `:root`, or any container selector is
a finding, not a shortcut.

**Trim the half-leading instead of nudging padding.** One declarative line replaces the three hand-nudge
heuristics (button padding that "looks" uneven, an icon that won't center against the cap band, mystery
space above a card title):
```css
@supports (text-box: trim-both cap alphabetic) {
  :where(h1,h2,h3,h4,h5,h6, .btn,button,[role="button"], .badge,.kpi-value,.card-title) {
    text-box: trim-both cap alphabetic;
  }
}
```
Chrome 133+ / Edge 133+ / Safari 18.2+, so it stays behind `@supports` and the layout must be correct
without it. Shipped in `assets/theme.css`.

**Pairing two families — match x-height, not point size.**
```css
:root    { font-size-adjust: ex-height from-font; }
.display { font-family: var(--font-serif); font-size-adjust: cap-height 0.73; }
```
`u = (m / m′) × s`; Baseline since **July 2024**. Reference metrics: Verdana ex-height **0.545** /
cap-height **0.73** · Times **0.447** / **0.66** · Futura **0.482**. Match on `cap-height` for display
pairings, `ex-height` for running text, `ch-width` for a mono in a table. **Gotcha, verbatim from MDN:**
an `@font-face` `size-adjust` descriptor overrides the metrics `font-size-adjust` reads, *"making
`size-adjust` ineffective when combined with `font-size-adjust`"* — use `size-adjust` for fallback CLS,
`font-size-adjust` for pairing, never both on one family.

**OpenType features, per typeface.** A feature tag the face doesn't ship is a silent no-op that reads
like a working rule, so the table is per-family and unverified rows say so.

| Face | Verified tags | Where |
|---|---|---|
| Inter | `cv08` (uppercase I with serif) · `cv05` (l with tail) | ID / SKU / log columns — disambiguates `I` `l` `1` |
| Inter | `zero` · `tnum` | every numeric column |
| Geist / JetBrains Mono / IBM Plex | **UNVERIFIED** — read the foundry's feature list before writing a tag | — |

**Hanging punctuation is decoration, never alignment.**
```css
blockquote, .pull-quote { hanging-punctuation: first last; }
@supports not (hanging-punctuation: first) {
  blockquote, .pull-quote { text-indent: -0.38em; }   /* size to the actual quote glyph */
}
```
**Not Baseline** — "does not work in most widely-used browsers" — so nothing may depend on it. The
`-0.38em` is a craft value, not a sourced one.

**There is no Text/Display switch to encode.** Apple's HIG: the system fonts use *"dynamic optical
sizes, which merge discrete optical sizes (like Text and Display) and weights into a single, continuous
design"*, and *"in a running app, the system font dynamically adjusts tracking at every point size."*
`font-optical-sizing: auto` is already the initial value — the only reason to write it is `none`, when a
wordmark at 14px must match the same wordmark at 72px.

**Italic descender clearance:** `leading-none` clips descenders (`y g j p q`) on italic display type — use
**`leading-[1.1]` minimum + `pb-1`** for any italic heading/display run.

**Fonts (brand-adaptive, anti-slop):** do **not** default to `Inter / Roboto / Arial / system` or the
escape-hatch clichés (`Space Grotesk`, `Geist`, `Instrument Serif` italic accent word). Pick a
distinctive pairing per brand — high contrast reads as interesting (display + mono, serif + geometric
sans). Expose `--font-sans / --font-serif / --font-mono` as tokens; keep the scale above font-agnostic.
The starter's `--font-sans` carries a literal **`REPLACE-ME-FONT`** marker instead of a bare system
stack, so "we forgot to choose a typeface" is a grep hit rather than a thing you have to notice.

---

## 5. Spacing rhythm (4/8pt)

**8pt grid with a 4pt half-step; everything is a multiple of 4.** Tailwind v4's single-variable model:
`--spacing: 0.25rem` (4px) and every utility is `calc(var(--spacing) * n)`, so any integer works
(`p-4`=16px, `w-17`, `gap-2`). Canonical ramp (Carbon/Tailwind/Atlassian all resolve to these exact px):

```
0 · 2 · 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 96   (+ 128 / 160 for heroes)
      6* · 10*                                     nudge half-steps, exception-only
     -2 · -4 · -8 · -12 · -16 · -24 · -32          negative space (deliberate bleed)
```
Deliberately **skip 40/56/72/80/112** so nobody picks near-identical large gaps (≈1.5× steps at the
top). The two starred **nudges are Fluent's** — "use only where a control must sit between two grid
stops", never as general spacing; they are also the reason the on-scale check must enumerate the ramp
instead of testing `n % 4`. The **negative family is Atlassian's**, for pulling an element out of its
container on purpose. The scale is **breakpoint-invariant** — don't rescale tokens per breakpoint;
change *which* token + column count/margins.

**Why 4 and not 8** — the mechanical reason, not the aesthetic one: all 15 Material 3 line-heights are
multiples of **4px** and five of them are not multiples of 8 (20, 28, 36, 44, 52). A type scale whose
leading steps by 4 cannot sit on an 8pt grid, so the spacing grid is 4pt because **the type is already
on it**. Structure of the ramp is **additive (+4) below 16, multiplicative (≈×1.5) above it** — a
missing rung below 16 is a bug; a missing rung above 16 means you wanted a different ratio.
Counter-case, to bound the claim: iOS leading (13, 18, 21, 25, 41) is **not** 4-divisible — Apple puts
the grid on layout and leaves leading optical. If your face's natural leading isn't 4-divisible,
decouple with `text-box: trim-both` (§4) rather than forcing the type onto the grid.

**Semantic spacing families** (retheme density without touching components):
`space.inset.*` (padding inside a container) · `space.stack.*` (vertical gap) · `space.inline.*`
(horizontal gap). Component defaults: input/button vertical padding **8–12**, card inset **16–24**,
section vertical gap **48–96**.

**Highest-leverage rule — `internal ≤ external`:** the gap *around* an element must be ≥ the padding
*within* it (card padding ≤ inter-card gap), or groups blur together. **Min tap target 44×44pt.**
Grid: 12 columns; margins 16 (mobile) → 24 (tablet+); gutters 16–24.

**Optical alignment — start on the grid, then nudge.** The grid is the default and the nudge is the
exception; these are the named exceptions, each a *deliberate* off-grid move rather than a rounding
error:
- shift play/▶ triangles **right** — a triangle's visual centre is not its bounding-box centre;
- **oversize circles** against equal-box squares, so the two read the same size;
- pad text **off a rounded corner** ~proportionally to the radius, or the corner eats the first glyph;
- offset a menu by **its own padding** so its first label aligns with the trigger text, not with the
  popover edge;
- **trim a card's top padding** by the line-height overhang above the cap height of its first line.

Every nudge stays an exception with a stated reason. An unexplained off-grid value is a defect, not
a nudge — which is why the on-scale check enumerates the ramp instead of testing `n % 4`.

---

## 6. Radius scale

**Shape-consistency lock — ONE radius regime, held across the whole surface.** Pick one and hold it:
**all-sharp `0`**, **all-soft `12–16px`**, or **all-pill (`full` on interactive)**. Mixed radii are
allowed **only** with a documented rule followed everywhere ("buttons full-pill, cards 16px, inputs 8px").
Round buttons in a square layout = broken. Set `--radius` **once** and derive component radii from it;
never let a stray shadcn variant introduce a second regime. (Subtle premium upgrade: tighter inner radius,
softer outer container — the **double-bezel / Doppelrand** formula, with an equal gap all around; full
recipe with real Tailwind values in `brand-to-system.md` § 4. Dark-premium → "Signature 'expensive
object' moves". The optical nudges that pair with it are in §5 above.)

**`--radius` has no default — it is a required output of the brand step.** Shipping the framework's
own `0.625rem` is the same class of tell as shipping the framework's chart palette: it announces that
nobody chose. The archetype table in `brand-to-system.md` supplies one per brand (SaaS-minimal 8px ·
Editorial 2px · Playful 16px + pills · Dark-premium 10px · Brutalist 0px · AI-dev-tool 4–6px ·
Warm-paper 8px); the starter theme ships the SaaS-minimal `0.5rem`. **Personality dial** if you are
setting it by hand: `0px` serious/technical (finance, data, enterprise) · `4px` neutral/pro (B2B SaaS)
· `8–12px` friendly (consumer SaaS) · `16px+` playful (wellness, social).

**Derive the whole scale from that ONE base — multiplicatively** (change one number → re-skin all
corners). This is shadcn's published derivation, and it is the one that survives the edges: at
`--radius: 0` subtraction produces *negative* radii, and at 16px it flattens the small end. The two
agree at 10px (6/8/10/14) and diverge at `2xl` (18px multiplicative vs 24px subtractive):

```
--radius-sm:  calc(var(--radius) * 0.6);   /* chips, small buttons, tooltips */
--radius-md:  calc(var(--radius) * 0.8);   /* inputs, standard buttons       */
--radius-lg:  var(--radius);               /* cards, base                    */
--radius-xl:  calc(var(--radius) * 1.4);   /* modals, dialogs, popovers      */
--radius-2xl: calc(var(--radius) * 1.8);   /* large containers, sheets       */
--radius-3xl: calc(var(--radius) * 2.2);
--radius-4xl: calc(var(--radius) * 2.6);
--radius-full: 9999px;                     /* pills, avatars, status dots    */
```
`full` is the one non-proportional rung and `9999px` degrades on tall elements — prefer
`border-radius: 50%` or `calc(min(100%, 1e5px))` on anything taller than it is wide. (Spectrum models
this properly: `corner-radius-1000`, aliased `corner-radius-full`, is a **multiplier** type of 0.5,
not a pixel value.)

**Nested-radius rule (removes a top AI-generated tell):** a padded child must NOT share its parent's
radius, and the offset is **padding + border-width**, not padding:
```css
.shell { --pad: 8px; --bw: 1px; --gap: calc(var(--pad) + var(--bw)); }
.inner { border-radius: max(0px, calc(var(--radius) - var(--gap))); }
```
The rule is **per-corner** — asymmetric padding has no single correct inner radius, so either make the
padding uniform on the corners you round, or don't nest. Justification, so nobody files it under
folklore: two rounded rects with a uniform gap are concentric iff `r_inner = r_outer − gap`, because
the arcs then share a center. Published by **Material**, with a worked number (48dp − 14dp = 34dp);
the "concentric corner" attribution to Apple's Layout HIG is **unverified** — that page has no mention
of it. Map radius to the element's **shortest side**, not to component type; elements <32px shortest
side drop to 2px. Same radius on all 4 corners; don't round where elements meet a container edge;
reserve `xl/2xl` for big surfaces only; tables/dense data = `0`. `corner-shape: squircle` is
**UNVERIFIED** — no reachable document names the value — so if you use it for a hero surface or an
icon, keep it behind `@supports` and make the plain radius the correct fallback.

---

## 7. Shadow / elevation scale

**Rules:** never a single-layer shadow above "resting" (2–5 stacked layers, offset & blur ≈double per
layer). One light source (vertical offset ≈2× horizontal, or x=0). As elevation rises: **`offset↑,
blur↑, layer count↑`. Alpha is a style choice, not a law** — Primer holds it *constant* across all four
layers of `--shadow-floating-medium` (`0 8px 16px -4px #25292e14, 0 4px 32px -4px #25292e14,
0 24px 48px -12px #25292e14, 0 48px 96px -24px #25292e14`, every layer `0x14`), while Polaris *raises*
it 0.07 → 0.28 from `shadow-100` to `shadow-600`. Pick one behavior per system and hold it; "opacity
falls as elevation rises" is not a rule either way. **Tint the shadow toward the surface hue, not pure
black.** Fold a 1px ring into the shadow
token (Radix pattern) so border+shadow read as one system, never two competing effects. Cap at **6
role-named levels**; small controls (badges, chips, inputs) get **no** shadow. Ban `rgba(0,0,0,0.1)` on
everything and colored dark-mode "glows" (both documented slop tells).

**Border-first for anything that rests.** A resting card, panel or list container is elevated by a
**1px hairline**, not by a shadow; real shadows are reserved for layers that float or respond —
dropdowns, popovers, modals, and the hover/drag lift. Applied by role, one light source, so the
resting → dropdown → modal progression is legible as a sequence rather than as three unrelated
blurs. In dark mode this cue changes substance entirely: elevation is a **lighter surface** (§2),
not a shadow.

Six role-named levels (Tailwind v4 scale, hue-tinted, ring-fused). Alpha-on-neutral, first layer = hairline ring:

```css
@theme {
  /* role-named elevation — light mode */
  --shadow-xs:  0 0 0 1px oklch(0.145 0.006 240 / 0.04),
                0 1px 2px 0 oklch(0.145 0.006 240 / 0.06);              /* resting cards, inputs */
  --shadow-sm:  0 0 0 1px oklch(0.145 0.006 240 / 0.04),
                0 1px 3px 0 oklch(0.145 0.006 240 / 0.10),
                0 1px 2px -1px oklch(0.145 0.006 240 / 0.10);           /* cards */
  --shadow-md:  0 0 0 1px oklch(0.145 0.006 240 / 0.04),
                0 4px 6px -1px oklch(0.145 0.006 240 / 0.10),
                0 2px 4px -2px oklch(0.145 0.006 240 / 0.10);           /* dropdowns, selects */
  --shadow-lg:  0 0 0 1px oklch(0.145 0.006 240 / 0.04),
                0 10px 15px -3px oklch(0.145 0.006 240 / 0.10),
                0 4px 6px -4px oklch(0.145 0.006 240 / 0.10);           /* popovers, menus, tooltips */
  --shadow-xl:  0 0 0 1px oklch(0.145 0.006 240 / 0.04),
                0 20px 25px -5px oklch(0.145 0.006 240 / 0.10),
                0 8px 10px -6px oklch(0.145 0.006 240 / 0.10);          /* modals, command palette */
  --shadow-2xl: 0 25px 50px -12px oklch(0.145 0.006 240 / 0.25);       /* full dialogs (+ scrim) */
}
```
Note the **negative spread** on far layers (`-3px … -12px`) keeps big shadows tight (Tailwind pattern);
it should **grow with the layer** — Primer runs −4, −4, −12, −24 — and that is what stops a 96px blur
from turning into a gray haze. Role map: `xs`=resting → `sm`=card → `md`=dropdown → `lg`=popover →
`xl`=modal → `2xl`=dialog. One shadow per role, everywhere (uniform-by-role = system;
uniform-everywhere = slop).

**Resting elevation is capped: `xs`/`sm`/`md`/`lg` are reachable at rest; `xl` and `2xl` are reserved
for modals/dialogs and for hover/drag lift.** A card that rests at `shadow-xl` has nowhere to go on
hover. M3 does the same thing — an element's resting state may sit on levels 0…+3, levels +4 and +5
exist only for hover and drag, and two of its six dp values (8dp, 12dp) have no component assigned as
a resting level at all. *"When it comes to applying shadows, less is more. The fewer levels in your UI,
the more power they have to direct attention and action."* (M3)

**Premium "whisper" elevation (low-shadow token).** For a card that floats with **no visible dark edge**
— the opposite of the harsh default `shadow-md` — ship one wide-spread, high-blur, low-opacity token:
```css
--shadow-whisper: 0 20px 40px -15px oklch(0.145 0.006 240 / 0.05);  /* wide spread · 40px blur · -15px offset · 5% */
```
Tint the color toward the **surface/background hue**, never pure `rgba(0,0,0,·)` (the generic-black-shadow
tell). Pairs with a 1px whisper border on the calibrated-neutral / stitch bundle; use it where you want
depth without weight (the KPI cards, floating panels), not as a replacement for the resting `xs`/`sm` ring.

**Dark mode:** switch the primary depth cue to **lighter surface** (§2), keep shadows subtle, reserve
real (deeper, larger) shadows for the top 1–2 levels only, and add a faint top light-catch:
`inset 0 1px 0 oklch(1 0 0 / 0.06)`. **Never animate a multi-layer shadow** — animate
`transform: translateY(-2px)` and cross-fade to the next elevation token instead.

---

## 8. Motion tokens (durations + easing + springs)

**Canonical TOKEN DECLARATIONS only** — this section is the single source of truth for the *values*.
**→ references/motion.md for usage, gates, springs-vs-tweens, interruptibility, reduced-motion, and all
craft rules.** (Don't duplicate craft here; only declare tokens.)

**Two-curve vocabulary covers ~90%** (a small vocabulary = a coherent motion language) plus `linear` for
constant motion, a standard curve for on-screen morphs, and an iOS drawer curve. **Default everything to
`ease-out`; ban `ease-in` for UI** (sluggish start). Keep this easing set consistent with the §11 app-UI
ladder and whatever motion.md references — don't fork a second curve for the same role.

```css
@theme {
  /* easing → generates ease-* utilities */
  --ease-out-quint: cubic-bezier(0.23, 1, 0.32, 1);   /* entrances, reveals, content (default)   */
  --ease-ios:       cubic-bezier(0.32, 0.72, 0, 1);   /* micro-interactions, dropdowns, sheets   */
  --ease-drawer:    cubic-bezier(0.32, 0.72, 0, 1);   /* iOS-like drawers / bottom sheets        */
  --ease-in-out:    cubic-bezier(0.77, 0, 0.175, 1);  /* on-screen MORPH only (position change)  */
  --ease-standard:  cubic-bezier(0.2, 0, 0, 1);       /* M3 standard — on-screen move/morph      */
  /* --ease-out-quint is THE strong entrance/UI curve (above); ban bare CSS ease-out — too weak.  */
  /* linear is built-in — spinners, progress, marquees, mechanical chrome (sidebar collapse) */
}

:root {
  /* --- semantic duration ladder (kept as vars; use via duration-[var(--duration-x)] or transitions) --- */
  --duration-instant:  100ms;  /* button-press feedback (100–160ms)                 */
  --duration-press:    140ms;  /* active/press micro-feedback                       */
  --duration-fast:     150ms;  /* tooltips, small popovers                          */
  --duration-popover:  180ms;  /* popover / dropdown / menu open (perceived-instant)*/
  --duration-base:     200ms;  /* dropdowns, selects, hovers                        */
  --duration-slow:     300ms;  /* HARD CAP for interactive UI                       */
  --duration-slower:   500ms;  /* modals, drawers, large surfaces                   */

  /* --- spring tokens — GENERATED, never hand-written --- */
  /* `linear(/* comment */)` is not a valid easing: the parser drops the whole declaration and the
     animation silently falls back to `ease`. Generate the sample list instead:
         node scripts/spring-tokens.mjs        # prints the @theme block
     Each --ease-spring-* is normalised to its own --dur-spring-* — they are a PAIR. */
  --ease-spring-snappy:  linear(0, 0.0524, 0.1662, …, 1);       --dur-spring-snappy:  460ms;
  --ease-spring-default: linear(0, 0.056, 0.1869, …, 1.046, …); --dur-spring-default: 460ms;
  --ease-spring-smooth:  linear(0, 0.0201, 0.0711, …, 1);       --dur-spring-smooth:  650ms;
  --ease-spring-bouncy:  linear(0, 0.0331, 0.1215, …, 1.2536, …);--dur-spring-bouncy: 1000ms;
  /* Full values live in assets/theme.css — the ellipses above are for reading, not for pasting. */
}
```

**Spring law.** Author with `visualDuration + bounce`, never `stiffness/damping` — the closed form is
`root = 2π/(visualDuration·1.2)`, `stiffness = root²`, `damping = 2·clamp(0.05,1,1−bounce)·√stiffness`.
`bounce 0` = critical, no overshoot · `0.3` = default lively · `0.6` = playful · `≥1` rings and is
never a UI default. A spring is settled only when **both** `|target−pos| ≤ restDelta` **and**
`|velocity| ≤ restSpeed` — position alone terminates at a zero-crossing while the spring is still
moving. For interruptible, velocity-aware motion (drag, gesture) a static curve cannot work: fall
back to the `motion` runtime. The generated tokens cover the 90% enter/exit/hover/press case.
Feature-gate once — `el.animate({opacity:0},{easing:"linear(0,1)"})` in a `try/catch` — and fall back
to `300ms var(--ease-out-quint)`.

**Two motion families — never one curve for both.** **Spatial** = anything that changes shape, size,
position or bounds; it *may* overshoot. **Effects** = color, opacity, fill; it is **critically damped
and never overshoots** — a color that bounces reads as a bug, not as personality. Applied to the
tokens above: `--ease-spring-default` (peaks 1.046) and `--ease-spring-bouncy` (peaks 1.2536) are
spatial-only; an opacity or color transition takes `--ease-spring-snappy` (no overshoot) or a plain
tween.
Duration law: **larger travel / larger surface → longer duration**; interactive UI **< 300ms**
(perceived-instant ≈180ms); never one fixed duration for everything. M3 full ladder available if a
"system" feel is wanted (short 50/100/150/200 · medium 250/300/350/400 · long 450–600 · x-long 700–1000).

**The one carve-out to the 300ms cap, and its sourcing.** A **cross-view transition** — a
shared-element morph or a route change, where the travel is a full viewport rather than a popover —
may run **300–400ms**. Vercel ships 400ms for a list→detail morph, "slow enough to register but fast
enough to feel direct". Treat 300ms as a **house bias, not a universal**: M3's own `medium4` is
400ms and its `long1–long4` band is 450/500/550/600ms, as the ladder above shows. Everything that is
not a cross-view transition stays under the cap.

> **Dense product/app surfaces** → see **§11** for the app-UI motion ladder (0ms keyboard/high-freq
> surfaces, duration-by-elevation), density, focus-ring, and app-shell/palette/toast starter defaults.
> **All motion craft (composite-only, entrance scale, transform-origin, frequency gate, theme-switch
> disable, reduced-motion reset + View-Transitions caveat)** now lives in **references/motion.md**.

---

## 9. Delivery checklist (what "done" looks like)

- All color output in `oklch(L C H)`; `C ≤ 0.37`; neutrals `C ≈ 0.005–0.015` tinted to **brand** `H`
  (never a generic ~60-hue warm cream/sand wash — the AI giveaway; → §1 / anti-slop.md).
- 3-tier chain intact: components reference **semantic** tokens only (`bg-primary`, `text-muted-foreground`),
  never raw ramps or hex. Dark mode = re-pointed semantics via `.dark`, zero per-element `dark:` colors.
- Every colored surface has a `-foreground` pair, and **the ratios are printed, not asserted.**
  `theme.css` ends with a generated comment block listing every §12 pair with its computed ratio in
  **both** modes — `/* AA light: bg/fg 17.90:1 · muted/muted-fg 4.63:1 · primary/primary-fg 4.75:1 ·
  bg/border 1.26:1 (non-text, n/a) · bg/ring 4.96:1 */`. **A pair with no printed ratio counts as
  unchecked and fails the gate.** Gate on **WCAG 2** numbers (4.5:1 body · 3:1 large + UI · focus ring
  3:1 vs adjacent). APCA Lc is advisory only: the 90 / 75 / 60 thresholds this skill used to quote are
  **unsourced**, and an Lc pass may never override a WCAG 2 failure.
- Two gate greps on the emitted theme: `grep -c 'oklch(' theme.css` equals the token count, and
  `grep -nE '(^|[^-])#[0-9a-fA-F]{3,8}\b' theme.css` returns **zero** hits outside comments.
- Warning takes dark on-text; everything else white — per the `L ≤ 0.55` rule (§1.4), which must agree
  with the ramp-index rule: solid fills at step 700+ take white, 600 and lighter take dark. If the two
  disagree, the ramp's chroma peak is in the wrong place. (Spectrum states the same split: "Lighter
  static color backgrounds (100–800) use black text over the color. Darker static colors (900–1400)
  use white text.")
- Scales derived from single bases: `--radius` → radius scale (ONE regime, §6 lock; and `--radius`
  itself came from the brand step, not from shadcn), `--spacing` → all spacing, shadow primitives →
  elevation scale, the `--text-*` rungs → their own tracking.
- `tabular-nums lining-nums` on **every** number (KPIs, tables, timers, prices, numeric inputs); ALL-CAPS
  carries positive tracking `+5–12%`; prose measure `66ch` single-column / `48ch` multi-column; italic
  display gets `leading-[1.1]` descender clearance.
- Dark mode: off-black `L 12–18%` (never `#000`), elevation via lighter surface `L 15/20/25%`, accents
  desaturated (+L −C), light-on-dark body-weight compensation applied (one of bloom-fix 400→350 OR the
  three-axis lightness bump — not both).
- No slop defaults: not unmodified `#6366F1`/purple gradients, not `rgba(0,0,0,0.1)` everywhere, not
  uniform `16px` radius, not Inter/Roboto/system as the font default, no `ease-in`, no `scale(0)`.
- `@theme inline` used for every runtime-swappable var; `prefers-reduced-motion` reset shipped.

---

## 10. Interaction states

Model every interactive element on **three non-colliding axes** so states stack without clashing:
**fill** = exclusive pointer state (rest/hover/press), **ring** = focus-visible, **border/indicator**
= selected. Derive hover/press/disabled from ONE on-color overlay instead of picking colors per
component — keep the overlay math in tokens (`--overlay-hover: 0.08; --overlay-press: 0.10`) so the
whole system tunes from one place.

| State | Recipe |
|---|---|
| rest | base token (`bg-primary`, `bg-card`, …) |
| hover | +8% content-color overlay — `color-mix(in oklab, var(--x) 92%, var(--foreground))` (or `bg-primary/90`) |
| active / pressed | +10% overlay + `translateY(0.5px)`; drop one elevation step; **dim the on-color too** |
| focus-visible | `outline: 2px solid var(--ring); outline-offset: 2px` — outline, not `ring-*` |
| disabled | content `opacity: 0.38`, fill `opacity: 0.12`, `pointer-events: none`, `box-shadow: none` |
| selected | `border`/indicator on the third axis — never reuse the hover fill |
| loading | preserve width (transparent label + absolutely-centered spinner), `aria-busy`, guard double-submit |
| error | `--destructive` border + text + `aria-invalid` — never color alone |

Ship rest / hover / active / focus-visible / disabled / loading on **every** control; add
selected / error / empty where relevant. **Enumerate all of them before writing the component** —
retrofitting a state is where the matrix goes incomplete. SKILL Phase 3 is the phase that requires
this; the recipes here are the values it requires.

**Empty states are a deliverable, not an afterthought:** graphic + headline + one CTA, with the
surrounding chrome (filters, toolbars, pagination, column headers) hidden while there is no data —
an empty table under a full toolbar reads as a broken query, not as an empty state.

**State-layer opacities, published (Material 3):** hover **8%** · focus **10%** · press **10%** ·
drag **16%**. The overlay uses the element's **own content color**, not black/white — which is why one
set of numbers works in both modes — and **only one state layer is active at a time.**
```css
--overlay-hover: 0.08;     --overlay-focus: 0.10;
--overlay-press: 0.10;     --overlay-drag:  0.16;
--overlay-selected: 0.20;  --overlay-selected-hover: 0.32;   /* Carbon, on a mid neutral */
```
**Alternative, ramp-offset model (Geist):** hover = base step **+1**, active = base step **+2**, applied
independently to backgrounds (100→200→300), borders (400→500→600) and high-contrast backgrounds
(700→800). Pick one model per project; never mix the two.
**Press dims the ON-color too, not just the fill** — Polaris steps `#ffffff` → `#e3e3e3` → `#cccccc`
through rest/hover/press. A press where only the background moves reads as a hover.
**Disabled is exempt from contrast gating** — Carbon states it outright: disabled content is *"not
subject to WC3 contrast compliance standards and is intentionally de-emphasized."* Don't let the §12
solver chase it.

**Focus ring: `outline`, decided.** Not `box-shadow`, and not shadcn's `ring-*` (which compiles to
`box-shadow`). Three reasons, and they all point the same way: `outline` now follows `border-radius`
in every current engine, so the historical reason for `box-shadow` is gone; `box-shadow` is **dropped
entirely in forced-colors mode** while `outline` survives; and `contain: paint` /
`content-visibility: auto` **clip** `box-shadow` but not `outline`. One mechanism, everywhere.

> **Dense product/app surfaces** → see **§11** for product-tuned focus-ring, interaction-timing, and
> row/palette state defaults (incl. the shadcn ~50%-opacity ring override).

---

## 11. App-UI product defaults (dense product surfaces)

> **Grounded from the superdesign repo's research corpus (docs/research/notes/product-app-ui-patterns.md) (2026-07-05).** Scope: dense
> **product/app** surfaces (dashboards, tables, ⌘K palettes, settings, forms, states) — **not** marketing
> pages. **Honesty caveat, carry it forward:** these hard numbers lean on **shadcn/ui + cmdk + Radix
> source, Vercel Geist / design.md, and Emil Kowalski's motion writing** — open-source library defaults
> and one practitioner's timings, **not** flagship-published specs. The flagship products this echoes
> (Linear, Stripe, Vercel, Notion, Figma, Superhuman, Raycast) publish *philosophy* but almost never
> pixel/millisecond values. **Do NOT present these as "what Linear does."** Treat inline
> `[single-author]` / `[reconstructed]` / `[directional]` flags as starting points — verify against real
> product inspection where it matters. Complements §5–§8/§10; same craft rules, tuned tighter for density.

**Duration ladder (by surface, not one global default):**
```css
--duration-none:    0ms      /* ⌘K palettes, context menus, filters, keyboard/high-freq surfaces — animating them is a fingerprint */
--duration-instant: 100ms    /* button press / small state feedback (§8 ladder, 100–160ms) */
--duration-base:    200ms    /* dropdowns, popovers, selects (150–250ms) */
--duration-slow:    300ms    /* modals; drawers up to --duration-slower (500ms) */

/* Easing = the §8 / theme.css set — one set, never fork a second: --ease-out-quint (entrances),
   --ease-ios (micro / drawer), --ease-standard (on-screen morph), linear (chrome / progress / spinner). */
```
Rules: animate **`transform` + `opacity` only** — **never `transition: all`** (enumerate properties).
Active press `scale(0.97)`; entrances from `scale(0.95)`, never `scale(0)`. **Keyboard-initiated and
high-frequency surfaces (⌘K, context menus, filters, search) open with 0ms** — animating them is a motion
fingerprint. ⚠️ `[single-author]` the exact cubic-bezier coefficients + duration bands trace to **Emil
Kowalski** (one practitioner) — treat as medium confidence, not canonical. ⚠️ `[reconstructed]` "Linear
≤200ms micro-interaction ceiling" and Linear's control tokens are **third-party teardowns, not Linear docs**.

**Density dial → layout (`VISUAL_DENSITY > 7` ⇒ Cockpit band):** at high density **drop generic card
boxes** — separate data with 1px lines (`divide-y` / `border-t` dividers), not containers; **`tabular-nums`
+ `font-mono` mandatory on all numbers**; tight section padding. "A section should not feel like a prison
of containers." Cards **only** when elevation communicates real hierarchy — otherwise group with dividers
and negative space; **never nest cards** (a card-in-card implies an elevation layer that doesn't exist).
Anti-slop caveat: AI over-packs — even at high density the maxim is **"not always simple — always clean"**;
leave slightly more whitespace than instinct says.

**Density / type:**
- Body **14px for dense app UI** (16px only for reading surfaces); line-height tight 1.15 / base 1.5 /
  relaxed 1.625 — align **line-height (not font-size)** to the grid.
- Cell-padding-x **16px**; table **header 40px**; icon-only row action **32×32 ghost kebab → dropdown**.

**Density is ONE knob with an exempt list, not three hard-coded row heights.**
```css
--density: 1;                               /* default · 0.8 compact · 1.25 touch/mobile */
--row-h:   calc(3rem * var(--density));     /* 48px at density 1 */
--cell-py: calc(0.75rem * var(--density));  /* 12px at density 1 */
```
Substitution happens where the `calc()` is **declared**, not where it is read, so any subtree that
overrides `--density` must re-declare `--row-h` in the same block — `references/cookbook/data-table.md`
does exactly that on `[data-density="compact"]`.

Spectrum runs exactly **desktop : mobile = 1 : 1.25**, switched at the **768px** breakpoint. Scale
**padding and row height only** — Carbon does the same, and typography stays role-assigned. **Never
scale:** border width, focus-ring width, minimum touch target (Spectrum: **48×48**). **Expose named
modes publicly even though the implementation is one scalar** — MUI X `compact`/`standard`/
`comfortable`, Grafana `Small`/`Medium`/`Large`, AG Grid "padding is a multiple of `spacing`". Named
API, scalar implementation; persist the choice as a user toggle.

Published ladders and what they are actually worth: Carbon **xs 24 / sm 32 / md 40 / lg 48 / xl 64px**
with the toolbar paired to the band (**48px** toolbar with xl+lg, **32px** with sm+xs) — ⚠️
`[verify v11]`, still cited from deprecated Carbon v10. Primer's named padding densities: **condensed
8 / normal 16 / spacious 24**. Verified production row defaults are **42px (AG Grid Quartz)** and
**52px (MUI X, "matches the normal height in the Material Design guidelines")** — **n = 2**. Our
**48px default is a defensible midpoint, not a sourced value**, and the 32px compact / 52–64px
comfortable rungs are **unsourced** entirely. Say so rather than quoting them as vendor practice.

**Two invariants `--density` must satisfy at every tier** — this is what turns "how dense is too dense"
into pass/fail:
1. **24 × 24 CSS px** for every interactive target inside the row (WCAG 2.5.8 AA). At 32px rows it
   binds exactly: 32 − 2×4 = 24, zero margin left — pad the hit area, not the row.
2. **Survive the text-spacing stress test** (WCAG 1.4.12 AA): line-height 1.5×, paragraph spacing 2×,
   letter-spacing 0.12×, word-spacing 0.16× font size, **all at once**. At 14px type, 1.5× leading is
   21px; a 32px row with 4px padding has a 24px content box, so it passes with 3px to spare.

**Numerals:** `font-variant-numeric: tabular-nums` on **ALL numeric UI** (tables, timers, prices, KPI
cards, numeric inputs) — supported natively by Inter / Roboto / IBM Plex / system-ui (see also §4).

**Focus ring (overrides shadcn's default):**
```css
:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; }   /* FULL opacity */
/* On a colored nav the 2px offset gap shows the nav's own background — that IS the two-layer
   ring. Point --ring at an accent that clears 3:1 against THAT background, not against --card. */
```
Ring is **2px + 2px offset, FULL opacity, ≥3:1 contrast**, via **`outline`** — see §10 for why not
`box-shadow`/`ring-*`. ⚠️ This **explicitly OVERRIDES shadcn's default ~50%-opacity ring**
(`ring-ring/50`): at ~50% opacity it commonly **fails WCAG AA 3:1** — bump to full opacity. Touch
target 44×44 (AAA) / 24×24 (AA), expand via padding; mobile input ≥16px (iOS-zoom guard).

**Radius by tier (permanence signal):** **6px** everyday chrome (nav rows, buttons) · **12px**
menus/modals · **16px** fullscreen · **9999px** pills/CTA only (2px for kbd chips). *Source: Geist /
vercel.com/design.md (primary).* (§6 gives the derived shadcn scale; this is the product-surface tier map.)

**Dark elevation — surface lightness, not shadow:** communicate elevation via **surface LIGHTNESS, not
shadow** (shadows vanish on dark): **higher elevation = lighter surface** (Material dark: 0% @ 0dp → 16%
white overlay @ 24dp). One surface token per tier (sunken/default/raised/overlay); shadow only as a
secondary cue at higher tiers; tune lightness on a perceptually-even **OKLCH** ramp (base dark enough for
≥15.8:1 white text at the top layer, then 2–3 progressively lighter layers). **Light app surfaces =
border-first (Geist):** a 1px border carries **resting** depth; reserve box-shadow (multi-stop + inner
highlight ring) for **floating/interactive** states only. ⚠️ `[reconstructed]` no named product's actual
dark palette hex/OKLCH is sourced (this aligns with §2's tone-based elevation, stated as app-UI defaults).

**App-shell / palette / toast starter values** (full detail lives in the cookbook recipes):
```
sidebar:  16rem expanded / 3rem icon-rail / 18rem mobile sheet  (⚠️ collapsed rail 3rem vs 4rem drifts
          across shadcn releases — verify per shipped version);
          collapse = transition-[left,right,width] 200ms ease-linear (mechanical, NOT a spring);
          toggle ⌘/Ctrl+B; persist cookie sidebar_state (7-day); hover/active = neutral accent fill,
          brand hue reserved for focus ring + primary CTA
palette:  ~32px rows (px-2 py-1.5 text-sm); list max-h 300px; input h-10 in h-12 wrapper;
          selected row = 0ms attribute color swap; open 0ms (Raycast-style) or 200ms fade+zoom95
          ease-out; keep the keywords/alias field separate from the visible label
toast:    4000ms auto-dismiss (pause on hover + document.hidden); 400ms translateY, interruptible CSS
          transition (not keyframes); stacked scale 1−0.05*i, gap ~14px; one anchor app-wide;
          promise-toast mutates in place
loading:  gate <1s none / 1–10s skeleton|spinner / >10s progress+cancel; show-delay 150–300ms,
          min-visible 300–500ms; skeleton geometry = real content; spinner linear
```
⚠️ `[reconstructed]` most palette/sidebar pixel values are shadcn/cmdk library defaults, not the named
products' own numbers; Superhuman's ~50–60ms latency target traces to a single dated blog — `[directional]`.

---

## 12. Contrast solver — solve, don't assert

The largest structural gap a token system can have: asserting "WCAG AA" in a checklist while shipping
no computable check. Material ships a solver, Adobe shipped a tool, Primer runs one in CI. **Solve for
the lightness; never pick one and hope.**

```
solveL(bgL, targetRatio, direction) -> L | UNREACHABLE
  Binary-search Oklab L against WCAG relative luminance until the ratio is met.
  Return UNREACHABLE (not a clamped value) when no L in [0,1] satisfies it —
  an unreachable pair is a spec error, not a rounding problem.
  (Model: material-color-utilities Contrast.lighter/darker, which return -1.)

PAIRS = [                                          # minimum ratio, checked in BOTH modes
  (background,  foreground,             4.5),
  (card,        card-foreground,        4.5),
  (muted,       muted-foreground,       4.5),
  (primary,     primary-foreground,     4.5),
  (destructive, destructive-foreground, 4.5),
  (warning,     warning-foreground,     4.5),
  (success,     success-foreground,     4.5),
  (info,        info-foreground,        4.5),
  (background,  border,                 3.0),      # non-text: WCAG 1.4.11
  (background,  ring,                   3.0),
  (card,        ring,                   3.0),
]
DISABLED pairs are EXEMPT — Carbon and Spectrum both state this explicitly.
```

Composite any alpha token over its mode's `--background` before measuring — `--border: oklch(1 0 0 /
10%)` is not a color until it sits on something. A **decorative container edge** that misses 3:1 is
`n/a`, not a failure; the boundary of an **interactive control** is not decorative and must clear it,
which is why `--ring` and not `--input` carries that duty. The output of this section is the printed
manifest at the end of `theme.css` (§9) — **a pair with no printed ratio counts as unchecked.**

---

## 13. Bound pairs (roles that must not collapse)

A solver keeps each pair legible; bound pairs keep *related* roles distinguishable, so a re-skin can't
quietly merge two of them. Enforce a minimum ΔL:

`(primary, accent)` **ΔL ≥ 0.10**, accent lighter · `(card, background)` **ΔL ≥ 0.015 light / ≥ 0.05
dark** · `(border, background)` **ΔL ≥ 0.06** · `(surface-container-high, surface-container)`
**ΔL ≥ 0.03**.

**Awkward band:** never place a *pair* of related roles either side of **`L` 0.55–0.62**. That is where
the on-color flips (§1.4), so a pair straddling it needs two different on-colors and stops behaving
like one role in two states. (Model: Material binds primary↔primary-container at Δtone exactly 10 with
polarity `nearer`, and names T50–T59 an "awkward zone".)

One deliberate exception in the starter: its **light** theme is border-first (§11), so `--card` equals
`--background` and the container ladder steps by 0.015 — the 1px border, not tone, carries the
separation there, and `(border, background)` at ΔL 0.078 is the pair that must hold. The **dark**
ladder steps by 0.04 and separates by tone as written.
