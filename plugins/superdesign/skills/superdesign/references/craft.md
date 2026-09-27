# Finishing details

The difference between an assembled page and a finished one. Sources: shadcn's own agent rules
(`skills/shadcn/rules/`), Emil Kowalski's design-engineering skill, Vercel's web interface guidelines.
Probes check the rows marked ✓; the rest are yours to hold.

## Composition
- Layout with `gap-*` on flex/grid, `size-*` for square boxes, `min-w-0` on flex children that truncate.
- Colour only through tokens (`bg-primary`, `text-muted-foreground`, `border-border`); status through
  `Badge` variants ✓ (`lint.mjs raw-colour`).
- Components complete: `Card` with header/content/footer, `Field` with label/description/error, `Dialog`
  with title and description.
- Headings `text-balance`, paragraphs `text-pretty`, body line length ≤ ~70ch.

## Interaction
- Focus rings stay as shipped; every interactive element reachable by keyboard in visual order ✓ (axe
  catches the missing names, not the order — tab through once yourself).
- Hit targets ≥ 24px, ≥ 44px on touch.
- Destructive actions confirm or offer undo; forms keep their input on error and focus the first
  invalid field.

## Motion
- Animate `transform` and `opacity` only; UI transitions 150–250ms `ease-out`; enter from
  `scale(0.95)` + opacity, never from `scale(0)`.
- Respect `prefers-reduced-motion`.
- Anything revealed on scroll is visible without JavaScript and in a static capture ✓ (`check.mjs void`).

## Content and data
- Numbers `tabular-nums`, formatted with `Intl` in his locale (`ru-RU`: `1 234,5`).
- Dates relative where recent ("3 дня назад"), absolute on hover.
- Every data region has empty, loading and error states.
- Images carry `width`, `height` and a real `alt` ✓ (axe).

## Both themes, both widths
- Dark mode comes from the preset's `.dark` tokens; no `dark:` overrides on colours.
- Nothing scrolls sideways at 390px ✓ (`check.mjs overflow`); tables scroll inside their own container.
