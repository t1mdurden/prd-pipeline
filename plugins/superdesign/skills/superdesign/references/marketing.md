# Marketing surfaces — sections, photography, conversion

What the owner has said about landing pages, in order of cost:
- 2026-09-23, rejecting a build every gate passed: «там фотографии нету, и без фотографий не так хорошо
  ощущается». His accepted page carried five images above the fold (a photo and client logos).
- The fastway page he called ideal was written by hand by another model: it kept the brand's hue
  family and typefaces, painted almost no colour on backgrounds, and put real photography and real
  client logos up front.

So the block path here is a **hypothesis** the next field run tests; what is enforced is only what
his verdicts back: the hero asset in the first viewport, declared assets rendered, a form when the page
converts by form, and grounds that are not washed in the brand colour.

## Page skeleton — adjust to the brief, keep the order's logic

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

## Logos, brand, copy

- Client logos only from `ASSETS: client-logos:`. None → cut the logo section; never render placeholder
  brands or names set as text.
- `node $SD/base.mjs brand "oklch(...)"` with the colour his logo already uses. The brand hue belongs to
  the primary button, links and small accents; `check.mjs` fails a page whose light backgrounds carry
  it on more than 12% of painted area (his rejected fastway build: 45%; 18 peers: at most 4.5%).
- Copy comes from the brief and from him. No invented metrics, testimonials, client names or awards —
  ask, or leave the section out.

## Conversion

`CONVERSION: form` → a real form block (`catalog.mjs search contact form`), fields labelled, wired to
where he receives leads. `call` → a visible `tel:` link. `check.mjs --brief` checks both.

## Free blocks that break in Vite

- `@shadcnblocks/logos3` (and other marquee logos): `react-fast-marquee`'s default import resolves to
  an object and white-screens the whole page. Use a static logo row (`logos8`, `logos18`) or import it as
  `import M from "react-fast-marquee"; const Marquee = (M as any).default ?? M`.
- `@shadcnblocks/hero45`: missing `import type { ElementType } from "react"` (`tsc -b` fails).
- Blocks carry `"use client"` and Next-style image URLs; in Vite both are harmless, but the images are
  the vendor's — replace every one.

Licence: shadcnblocks free blocks are for building his own sites and client sites through the CLI. The
skill never copies their source into this repo or any public repo.
