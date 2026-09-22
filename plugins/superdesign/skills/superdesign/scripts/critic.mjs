#!/usr/bin/env node
// critic — the blind screenshot critic, as a protocol with an exit code rather than a score.
//
//   node .../critic.mjs --prompts --ours <ours.png> --against <reference.png> --out <dir>
//   node .../critic.mjs --verdict <dir>            # after the two subagents have written their JSON
//   node .../critic.mjs --rubric-prompt --image <page.png> --out <file.json>
//   node .../critic.mjs --rubric <dir>             # after the rubric subagents have written theirs
//
// EXIT-CODE CONTRACT — identical in every superdesign gate:
//   0 clean · 1–63 the violation count · 64–79 harness (64 usage · 67 no target)
//
// ── WHY THE PROTOCOL IS NOT "SCORE IT OUT OF TEN"
//
// The technique comes from Anshu Chimala (Lenny's Newsletter, 1 Sep 2026, "How to turn your AI
// into a world-class designer"), and his diagnosis is exactly right: "the agent isn't objective:
// it reviews its own code, past decisions, and previous rationale." His fix — a critic invoked in
// a fresh context "with just the screenshot, not the code, implementation details, or earlier
// iterations/critiques" — is the mechanism this file implements.
//
// His SCORING is the part we do not copy, and we measured why. On 2026-09-22 the same model was
// shown the owner-labelled fastway pair — the build he rejected and the build he accepted — under
// three protocols:
//
//   absolute score /10, one image per agent      accepted 4-5   rejected 6      ← INVERTED
//   forced-choice pairwise, both orders, n=4     accepted 4 / 4, order-independent
//   twenty binary criteria, n=3 per side         accepted 16-18  rejected 13-14, no overlap
//
// The absolute score ranked the artefact its owner threw away ABOVE the one he shipped. That is
// not a quirk of this pair: "Seeing Isn't Believing" (arXiv 2604.21523) measures evaluator VLMs
// failing to catch a degraded output 24–54% of the time under single-answer scoring against 11–36%
// under pairwise, and concludes "pairwise comparison emerges as the most reliable evaluation
// paradigm, while single-answer scoring is the weakest." UI-Bench (arXiv 2508.20410) reaches the
// same conclusion from the other side — 4,000+ professional-designer judgements collected as
// "forced-choice, blinded pairwise comparison" because absolute ratings are "inherently noisy".
//
// Chimala's own prompt ladder agrees with the measurement even though his threshold does not. He
// grades "judge if our design looks beautiful" as Bad, an aesthetic-framework score as OK, and
// this as GREAT: "Here are 5 designs: 4 professional examples and 1 screenshot of our product.
// Rank them by polish and taste level." That is a ranking against references. This file ships the
// ranking and drops the 9/10.
//
// ── THE FOUR RULES THE PROTOCOL ENFORCES
//
//   1. BLIND. The critic gets a PNG path and nothing else — no source tree, no DESIGN.md, no
//      previous critique. Chimala's fresh context, and the repo's own verifier discipline.
//   2. BOTH ORDERS, AND A SWAP THAT DISAGREES IS DISCARDED. Not averaged — discarded. Measured
//      here: the desktop pair was order-independent 4/4; the mobile pair picked position A in both
//      orders and was thrown away. Protocol from arXiv 2606.20364, which reports a judge shown
//      seven images answering "purely by position (100% order flips)".
//   3. TWO IMAGES, NEVER A GALLERY. Same source, same reason. --prompts refuses a third.
//   4. NO PIXEL CLAIMS. Four SOTA VLMs average 58.07% on shape-position tasks (arXiv 2407.06581);
//      design-audit.mjs owns geometry. The prompt forbids it and --verdict greps the returned
//      findings for pixel assertions.
//
// The prompt text lives HERE, as one string, because Chimala's other load-bearing instruction is
// "Use the same critic prompt each time" — a prompt retyped per iteration is a prompt that drifts,
// and then the score moves for reasons that are not the design.

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'

const argv = process.argv.slice(2)
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i === -1 ? d : argv[i + 1] }
const has = (n) => argv.includes(`--${n}`)

const PROHIBITION = `HARD RULES on what you may claim:
- You may NOT assert any pixel measurement, spacing value, alignment error or size ratio. Four
  state-of-the-art vision-language models average 58% on shape-position tasks, and a separate
  script measures geometry in the page. No "24px gap", no "misaligned by 3px", no ratios. If a
  claim needs a number to be true, do not make it.
- You may NOT guess at the code, the framework, or how it was built. You are looking at pixels.
- You MAY judge: what the page is trying to be, whether it repeats itself, whether hierarchy
  survives in grayscale, whether the imagery is real or decorative, whether the copy is specific
  or generic, whether it reads as a template, and whether a studio would sign it.`

const STANDARD = `The standard is one thing only: which page would a top independent design studio —
Pentagram, Koto, Instrument, Metalab, or the in-house teams at Linear, Stripe, Vercel — be willing
to put its name on for a paying client. Not which is prettier. Not which took more effort. Treat
the reference as a baseline to clear, never as a thing to copy.`

const pairPrompt = (a, b, outFile) => `You are a design critic. Below are two screenshots of two
different web pages. You have no code, no design brief, no build history, and no idea who made
either one. Judge the pixels.

Page A: ${a}
Page B: ${b}

Read BOTH images with the Read tool, properly, before you write anything. These are full-page
captures, so they are tall — look at the whole thing, not just the top.

${PROHIBITION}

This is a FORCED CHOICE. One of them is better work. There is no tie.

${STANDARD}

Write STRICT JSON, nothing else, to ${outFile}:

{
  "winner": "A" | "B",
  "margin": "decisive" | "clear" | "narrow",
  "why": "<three sentences naming the specific visible differences that decide it>",
  "loser_fatal_flaw": "<the one thing that most costs the loser>",
  "winner_worst_flaw": "<the one thing still wrong with the winner>",
  "which_reads_more_ai_generated": "A" | "B" | "neither",
  "ai_evidence": ["<specific visible thing>"],
  "repeats_itself": {"A": <true|false>, "B": <true|false>},
  "real_imagery": {"A": <true|false>, "B": <true|false>}
}
`

// The twenty criteria. Binary, because WebVR (arXiv 2603.13391) is the one rubric in this
// literature with a strong human-agreement number and its mechanism is many yes/no checks averaged
// — "without the rubric, agreement dropped to 59.3-66.7%". Measured here: accepted 16/17/18,
// rejected 13/14/14, no overlap.
const ITEMS = [
  'A stranger could name this page\'s aesthetic in one phrase that is NOT "clean and modern" or "minimal".',
  'Hierarchy survives in grayscale — weight, size and gray level carry it, not colour.',
  'Consecutive sections do not repeat one layout shape down the page.',
  'The hero does something other than a centred headline over a flat or gradient ground.',
  'Real photography or real brand marks appear where a human designer would have put them.',
  'Partner or client names, if the page claims any, are rendered as logo images rather than typeset words.',
  'There is at least one thing the visitor can fill in or choose on the page itself, not only links.',
  'The typography carries at least one deliberate extreme — something genuinely large or genuinely small.',
  'There is no purple or violet-blue gradient wash anywhere.',
  'There is no blurred blob, glow, or abstract 3D shape standing in for real art.',
  'Emoji are not used as icons.',
  'The accent colour is scarce — it marks actions rather than tinting whole sections.',
  'Section grounds are decided, not every section sitting on its own tinted band.',
  'Cards are not the only compositional device the page owns.',
  'The copy is specific to this business — names, routes, numbers — not generic category prose.',
  'There is no visible placeholder, lorem, or obviously invented statistic.',
  'The page ends on a real next step rather than a repeat of the header button.',
  'The whitespace looks decided rather than default.',
  'Nothing here reads as a bought template with the colours changed.',
  'A studio could put this in a case study without editing it first.',
]

const rubricPrompt = (img, outFile) => `You are a design critic looking at ONE screenshot of a
rendered web page. You have no code, no design brief, no build history, and no idea who made it. It
is a full-page capture and it is tall — look at all of it before you write anything.

The screenshot: ${img}

${PROHIBITION}

Answer each of the twenty criteria below with true or false and one short sentence naming what you
actually saw. "true" means the criterion HOLDS — it is the good outcome. If a criterion cannot
apply to this page at all, answer true and say "not applicable" in the evidence. Do not be
generous: where you are unsure, answer false.

${ITEMS.map((q, i) => `${i + 1}. ${q}`).join('\n')}

Then list the defects you would raise: P0 (broken or unusable), P1 (a client would reject this),
P2 (a studio would fix it before shipping), P3 (a nit).

Write STRICT JSON, nothing else, to ${outFile}:

{
  "criteria": [{"n": 1, "holds": <true|false>, "evidence": "<what you saw>"}, ... all twenty ...],
  "defects": [{"severity": "P0|P1|P2|P3", "what": "...", "where": "..."}],
  "aesthetic_in_one_phrase": "...",
  "would_a_studio_sign_it": <true|false>
}
`

// CALIBRATED on the owner-labelled fastway pair plus the package's own examples, 2026-09-22.
// The doctrine design-audit.mjs states in its own header applies: a metric earns a cap only where
// good and bad actually separate, and the cap sits in the gap.
const RUBRIC_FLOOR = 15 // accepted 16/17/18 · rejected 13/14/14 · the gap is 15, with no overlap

function readJson(p) { try { return JSON.parse(readFileSync(p, 'utf8')) } catch { return null } }

if (has('prompts')) {
  const ours = arg('ours'); const ref = arg('against'); const out = arg('out')
  if (!ours || !ref || !out) { console.error('usage: critic.mjs --prompts --ours <ours.png> --against <reference.png> --out <dir>'); process.exit(64) }
  // Rule 1 is blindness, and the cheapest way to break it is to hand the critic a source path.
  // Both arguments must be an image file that exists; anything else and the dispatch is not blind.
  for (const p of [ours, ref]) {
    if (!existsSync(p)) { console.error(`✗ no such image: ${p}`); process.exit(67) }
    if (!/\.(png|jpe?g|webp)$/i.test(p)) { console.error(`✗ ${p} is not an image. The critic sees pixels and nothing else — a source path here is how the blindness quietly stops being blindness.`); process.exit(67) }
  }
  const extra = argv.filter((a) => /\.png$/i.test(a) && a !== ours && a !== ref)
  if (extra.length) { console.error(`✗ ${2 + extra.length} images. The protocol is two. A judge shown seven answered purely by position (arXiv 2606.20364, 100% order flips).`); process.exit(64) }
  mkdirSync(out, { recursive: true })
  const A = resolve(ours), B = resolve(ref)
  writeFileSync(join(out, 'prompt-ab.txt'), pairPrompt(A, B, join(resolve(out), 'verdict-ab.json')))
  writeFileSync(join(out, 'prompt-ba.txt'), pairPrompt(B, A, join(resolve(out), 'verdict-ba.json')))
  writeFileSync(join(out, 'manifest.json'), JSON.stringify({ ours: A, reference: B, orders: { ab: { A: A, B: B }, ba: { A: B, B: A } } }, null, 2))
  console.log(`two prompts written to ${out}`)
  console.log('  Dispatch each as its OWN subagent, fresh context, with no other file in scope.')
  console.log('  The subagent may Read the two PNGs and write its JSON. Nothing else.')
  console.log(`    ${join(out, 'prompt-ab.txt')}  →  verdict-ab.json`)
  console.log(`    ${join(out, 'prompt-ba.txt')}  →  verdict-ba.json`)
  console.log(`  Then: node ${basename(process.argv[1])} --verdict ${out}`)
  process.exit(0)
}

if (has('rubric-prompt')) {
  const img = arg('image'); const out = arg('out')
  if (!img || !out) { console.error('usage: critic.mjs --rubric-prompt --image <page.png> --out <verdict.json>'); process.exit(64) }
  if (!existsSync(img)) { console.error(`✗ no such image: ${img}`); process.exit(67) }
  console.log(rubricPrompt(resolve(img), resolve(out)))
  process.exit(0)
}

if (has('verdict')) {
  const dir = arg('verdict')
  if (!dir) { console.error('usage: critic.mjs --verdict <dir>'); process.exit(64) }
  const man = readJson(join(dir, 'manifest.json'))
  const ab = readJson(join(dir, 'verdict-ab.json'))
  const ba = readJson(join(dir, 'verdict-ba.json'))
  if (!man) { console.error(`✗ no manifest.json in ${dir} — run --prompts first`); process.exit(67) }
  if (!ab || !ba) { console.error(`✗ both verdict-ab.json and verdict-ba.json must exist in ${dir}; the swap check is the protocol, not an option`); process.exit(67) }

  const winnerOf = (v, order) => (v.winner === 'A' ? man.orders[order].A : man.orders[order].B)
  const wAB = winnerOf(ab, 'ab'), wBA = winnerOf(ba, 'ba')

  console.log(`ours      ${man.ours}`)
  console.log(`reference ${man.reference}`)
  console.log(`order A,B → ${basename(wAB)}   (${ab.margin})`)
  console.log(`order B,A → ${basename(wBA)}   (${ba.margin})`)

  // Rule 4, checked rather than trusted: a critic that asserted a pixel number broke the one rule
  // that keeps it out of design-audit.mjs's territory.
  const prose = JSON.stringify(ab) + JSON.stringify(ba)
  const pixels = prose.match(/\b\d+\s?px\b/g) || []
  if (pixels.length) console.log(`  ! the critic asserted ${pixels.length} pixel value(s) (${[...new Set(pixels)].join(', ')}) — it may not see those. Ignore those findings; design-audit.mjs owns geometry.`)

  if (wAB !== wBA) {
    console.log('\n✗ the two orders disagree. The verdict is position-biased and is DISCARDED, not averaged.')
    console.log('  arXiv 2606.20364: "order-dependent verdicts are discarded as position-biased."')
    console.log('  Measured here 2026-09-22: the desktop pair was order-independent 4/4; the mobile pair')
    console.log('  picked position A in both orders and was thrown away. This is that case.')
    console.log('  Re-run on a different viewport or a different reference before reading anything into it.')
    process.exit(1)
  }
  if (wAB === man.ours) {
    console.log(`\n✓ ours wins in both orders. The reference still gets the last word: "${ab.winner_worst_flaw}"`)
    process.exit(0)
  }
  console.log('\n✗ the reference beats us in both orders — the one result this gate exists to refuse.')
  console.log(`  what costs us most: ${ab.loser_fatal_flaw}`)
  console.log(`  and: ${ba.loser_fatal_flaw}`)
  process.exit(1)
}

if (has('rubric')) {
  const dir = arg('rubric')
  if (!dir) { console.error('usage: critic.mjs --rubric <dir>'); process.exit(64) }
  if (!existsSync(dir)) { console.error(`✗ no such directory: ${dir}`); process.exit(67) }
  const files = readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'manifest.json')
  const runs = files.map((f) => ({ f, j: readJson(join(dir, f)) })).filter((x) => x.j && Array.isArray(x.j.criteria))
  if (!runs.length) { console.error(`✗ no rubric JSON in ${dir}`); process.exit(67) }
  // One run is not a verdict. Measured 2026-09-22, three blind runs over the same PNG spread two
  // points on each side of the labelled pair (16/17/18 and 13/14/14). A single draw of 14 could
  // have been a 16; the median of three could not.
  if (runs.length < 3) { console.error(`✗ ${runs.length} run(s) in ${dir}. The floor is a median and needs at least 3 — a single blind run spreads ±2 on this rubric.`); process.exit(67) }

  const held = runs.map((r) => r.j.criteria.filter((c) => c.holds).length).sort((a, b) => a - b)
  const median = held[Math.floor(held.length / 2)]
  const p0 = runs.flatMap((r) => r.j.defects || []).filter((d) => d.severity === 'P0')
  // Which criteria failed in a MAJORITY of runs — one run's false is noise, a majority is a finding.
  const fails = []
  for (let n = 1; n <= ITEMS.length; n++) {
    const no = runs.filter((r) => r.j.criteria.some((c) => c.n === n && !c.holds)).length
    if (no > runs.length / 2) fails.push({ n, no, item: ITEMS[n - 1] })
  }

  console.log(`rubric — ${runs.length} blind run(s) over ${dir}`)
  console.log(`  criteria held: ${held.join(', ')}  · median ${median}/20  · floor ${RUBRIC_FLOOR}`)
  for (const f of fails) console.log(`  ✗ (${f.no}/${runs.length}) ${f.n}. ${f.item}`)
  for (const d of p0) console.log(`  ✗ P0 — ${d.what} (${d.where})`)

  let violations = p0.length
  if (median < RUBRIC_FLOOR) {
    violations += 1
    console.log(`\n✗ median ${median}/20 is under the floor of ${RUBRIC_FLOOR}.`)
    console.log('  Calibrated 2026-09-22 on the owner-labelled fastway pair: the build he accepted scored')
    console.log('  16, 17 and 18; the build he rejected scored 13, 14 and 14. The floor sits in the gap.')
  }
  if (!violations) { console.log(`\n✓ median ${median}/20, no P0`); process.exit(0) }
  console.log(`\n✗ ${violations} violation(s)`)
  process.exit(Math.min(violations, 63))
}

console.error('usage: critic.mjs --prompts --ours <a.png> --against <b.png> --out <dir> | --verdict <dir> | --rubric-prompt --image <p.png> --out <f.json> | --rubric <dir>')
process.exit(64)
