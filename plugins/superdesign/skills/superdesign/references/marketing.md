# Marketing surfaces — sections, photography, conversion

What the owner has said about landing pages, in order of cost:
- 2026-09-23, rejecting a build every gate passed: «там фотографии нету, и без фотографий не так хорошо
  ощущается». His accepted page carried five images above the fold (a photo and client logos).
- The fastway page he called ideal was written by hand by another model: it kept the brand's hue
  family and typefaces, painted almost no colour on backgrounds, and put real photography and real
  client logos up front.

**Measured twice now: blocks lose to his page.** The block-built reefer landing was rejected
(2026-09-27, «оригинал лучше»), then rejected again after the brand-tint fix («все равно fastway лучше
на оригинале»). The rule this skill committed to in advance (`evals/redesign/2026-09-27/DESIGN.md`):
marketing starts from **a page he already approves**, not from a block catalog.

## Start from his reference page

1. Ask which existing page is the reference: his live site, a page he built before, or a URL he names.
   Unattended with none → say so in DESIGN.md (`REFERENCE: none — unattended`) and end UNPROVEN.
2. Screenshot it at 1440 and 390 (`check.mjs <url> --any-title --out .superdesign/ref`) and read it:
   its ground and ink colours, the header, how the hero frames the photo, card style, spacing, footer.
   Write those into DESIGN.md under `REFERENCE:` as concrete values, not adjectives.
3. Build the new page as the same system: same tokens, same header and footer, same hero framing, same
   card anatomy. Blocks from the catalog are allowed only for a section the reference does not have,
   and are then restyled to the reference's anatomy.
4. Before showing him, put the reference and the build side by side (`variants.mjs` with the reference
   as variant 1). The question he answers is "does this belong to the same site", not "is it good".

## Page skeleton — only when there is no reference

navbar → hero with a real visual → client logos → 2–3 feature sections → proof (testimonial, stats or
case study) → pricing if he sells plans → CTA or contact form → footer. Every section:
`catalog.mjs search <kind> --surface marketing`; heroes with `--image`.

## Photography — the hero is built around it

1. His own files first (`ASSETS: photography:`). Copy them into `public/`, give each `width`/`height`
   and a real `alt`.
2. None, and he agreed to stock → Unsplash API with `UNSPLASH_ACCESS_KEY` from the environment:
   ```bash
   curl -s "https://api.unsplash.com/search/photos?query=<words>&orientation=landscape&per_page=10" \
     -H "Authorization: Client-ID $UNSPLASH_ACCESS_KEY"
   ```
   Download the chosen `urls.regular` into `public/`, credit the photographer in the footer or
   caption, and hit the photo's `links.download_location` once (Unsplash's terms ask for it). No key →
   ask him; the vendor's demo image is never the answer (`check.mjs` fails it as a leftover).
3. Put the file names in `HERO-VISUAL:` — `check.mjs --brief` fails the page if they are not inside
   the first viewport at both 1440 and 390 wide.

## Colour and the photo belong together

His verdict on the first v3 landing (2026-09-27): «оригинал лучше, цвета не подходят и картинка не
сливается с background… только блоки относительно не плохо». The blocks were right; the paint was not.
What his accepted page does, and what `base.mjs brand` now does on a marketing surface:
- the ground carries the brand's hue at low chroma (`--background` oklch 0.962 0.012 H), cards stay white
  on it, ink is the brand's navy (L 0.24, C 0.06) — so a photo with sky and brand livery sits *in* the
  page instead of on it. All grounds stay under C 0.02, below the ground-tint cap.
- the hero photo is framed, not dropped in: a large radius (`rounded-2xl`), `object-cover` at 4:3, and
  a bottom scrim from the brand's dark (`from-[oklch(0.22_0.06_H/0.85)]`) carrying the wordmark and one
  short label in `text-primary-foreground`.
Pick a photo whose dominant tone shares the brand's hue family where he has the choice.

## Logos, brand, copy

- Client logos only from `ASSETS: client-logos:`, and only after you looked at each file: in the first
  field run two of four "logos" were page screenshots and one a 40px Instagram icon. Crop a clean mark
  if the file allows, otherwise ask. None → cut the logo section; never placeholder brands or names
  set as text.
- `node $SD/base.mjs brand "oklch(...)"` with the colour his logo already uses. The brand hue belongs to
  the primary button, links and small accents; `check.mjs` fails a page whose light backgrounds carry
  it on more than 12% of painted area (his rejected fastway build: 45%; 18 peers: at most 4.5%).
- Copy comes from the brief and from him. No invented metrics, testimonials, client names, awards or
  certifications (GDP, ATP, "logger on every truck") — a claim the business has not confirmed stays off
  the page; ask, or leave it out.

## Conversion

`CONVERSION: form` → a real form block (`catalog.mjs search contact form`), fields labelled, wired to
where he receives leads. Free contact blocks ship a demo submit (`contact2`: `console.log`, a 1 s wait,
a fake "sent") — replace it with his endpoint, or a `mailto:` fallback, and write which one into the
`CONVERSION:` line. The probe only sees that a form exists. `call` → a visible `tel:` link.

## Free blocks that break in Vite and Tailwind v4

- Their sections use `container` the v3 way (centred, padded); `base.mjs add` appends the `@utility
  container` that restores it the first time an `@shadcnblocks/` block arrives.
- `timeline9` puts a `Separator` inside its `<ol>` (axe `list`) and draws its line at zero height.

- `@shadcnblocks/logos3` (and other marquee logos): `react-fast-marquee`'s default import resolves to
  an object and white-screens the whole page. Use a static logo row (`logos8`, `logos18`) or import it as
  `import M from "react-fast-marquee"; const Marquee = (M as any).default ?? M`.
- `@shadcnblocks/hero45`: missing `import type { ElementType } from "react"` (`tsc -b` fails).
- Blocks carry `"use client"` and Next-style image URLs; in Vite both are harmless, but the images are
  the vendor's — replace every one.

Licence: shadcnblocks free blocks are for building his own sites and client sites through the CLI. The
skill never copies their source into this repo or any public repo.
