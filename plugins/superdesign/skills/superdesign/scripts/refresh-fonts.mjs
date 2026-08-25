#!/usr/bin/env node
// refresh-fonts — vendors fonts.google.com/metadata/fonts as data/google-fonts.min.json, and
// reads the popularity rank back out of it so the model has a number instead of a habit.
//
// This endpoint is UNDOCUMENTED and keyless. No stability contract: shape, field names, and
// ranking can change without notice. That is exactly why it is fetched deliberately and vendored,
// never called during a build (ARCHITECTURE.md §5, Phase 2 SYSTEM row). Re-run this script by
// hand to refresh the cache; nothing else on the build path touches the network for fonts.
//
//   node .claude/skills/superdesign/scripts/refresh-fonts.mjs                 # fetch + write cache
//   node .claude/skills/superdesign/scripts/refresh-fonts.mjs --avoid 20      # top-20 by popularity
//   node .claude/skills/superdesign/scripts/refresh-fonts.mjs --suggest "Sans Serif" --not-top 100
//
// EXIT-CODE CONTRACT — identical in every superdesign gate (ARCHITECTURE.md §2):
//   0        clean
//   1-63     the number of violations. A count above 63 is clamped to 63 and the line says so.
//   64-79    harness error - 64 usage . 65 missing dep . 66 navigation failed . 67 no target
// The --avoid and --suggest modes are a lookup, not a gate: they print and exit 0, or exit 67 if
// the cache has not been fetched yet. Only the bare fetch mode uses 66 (navigation failed).

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const SOURCE_URL = 'https://fonts.google.com/metadata/fonts';
const DATA_PATH = resolve(new URL('../data/google-fonts.min.json', import.meta.url).pathname);

function usage() {
  console.error('usage: refresh-fonts.mjs                        # fetch and write the cache');
  console.error('       refresh-fonts.mjs --avoid <n>             # top-n families by popularity');
  console.error('       refresh-fonts.mjs --suggest <category> [--not-top <n>]');
  process.exit(64); // 64 = usage
}

function loadCache() {
  if (!existsSync(DATA_PATH)) {
    console.error(`refresh-fonts: no cache at ${DATA_PATH} — run without flags to fetch it first.`);
    process.exit(67); // 67 = no target
  }
  const cache = JSON.parse(readFileSync(DATA_PATH, 'utf8'));
  // families are rows, not objects (cache.fields is the legend, in this order) — expand them
  // back here so every caller below reads .family / .category / .popularity like a normal record.
  cache.families = cache.families.map(([family, category, popularity, variable, subsets]) => ({
    family,
    category,
    popularity,
    variable,
    subsets,
  }));
  return cache;
}

async function fetchAndWrite() {
  let res;
  try {
    res = await fetch(SOURCE_URL);
  } catch (e) {
    console.error(`refresh-fonts: fetch failed — ${e.message}`);
    process.exit(66); // 66 = navigation failed
  }
  if (!res.ok) {
    console.error(`refresh-fonts: fetch failed — HTTP ${res.status}`);
    process.exit(66);
  }
  const bytes = await res.arrayBuffer();
  const text = Buffer.from(bytes).toString('utf8');
  console.log(`fetched ${SOURCE_URL} — ${bytes.byteLength} bytes`);

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    console.error(`refresh-fonts: response was not JSON — ${e.message}`);
    process.exit(66);
  }
  const list = parsed.familyMetadataList;
  if (!Array.isArray(list) || list.length === 0) {
    console.error('refresh-fonts: no familyMetadataList in the response — endpoint shape changed.');
    process.exit(66);
  }
  console.log(`parsed ${list.length} families`);

  // Reduced projection: only what the skill actually reads back (popularity ranking, a
  // category/subset/variable filter). Dropping designers, axis ranges, per-weight metrics etc.
  // is what keeps this under the size budget instead of re-vendoring the full 2.6 MB response.
  // Rows, not objects: at ~2000 families the five repeated key names cost more than the data
  // does. `fields` below is the legend — read it back with toFamily() rather than by hand.
  const families = list
    .map((f) => [
      f.family,
      f.category,
      f.popularity,
      Array.isArray(f.axes) && f.axes.length > 0, // variable font
      // 'menu' is a Google Fonts UI artifact present on every single family, not a real
      // subset — dropping it costs nothing and shrinks every entry.
      (f.subsets || []).filter((s) => s !== 'menu'),
    ])
    .sort((a, b) => a[2] - b[2]);

  const out = {
    fetchedAt: new Date().toISOString(),
    source: SOURCE_URL,
    note:
      'UNDOCUMENTED, keyless endpoint — no stability contract, shape may change without notice. ' +
      'Never fetched during a build; refresh by hand with refresh-fonts.mjs.',
    count: families.length,
    fields: ['family', 'category', 'popularity', 'variable', 'subsets'],
    families,
  };
  const json = JSON.stringify(out); // no pretty-print — this is a cache, not a document to read
  writeFileSync(DATA_PATH, json);
  console.log(`wrote ${DATA_PATH} — ${Buffer.byteLength(json)} bytes, fetchedAt ${out.fetchedAt}`);
}

function cmdAvoid(n) {
  const cache = loadCache();
  const top = [...cache.families].sort((a, b) => a.popularity - b.popularity).slice(0, n);
  console.log(`top ${n} by popularity (rank 1 = most popular — justify before using these):`);
  for (const f of top) console.log(`  ${f.popularity}\t${f.family}\t(${f.category})`);
}

function cmdSuggest(category, notTop) {
  const cache = loadCache();
  const wanted = category.toLowerCase();
  const matches = cache.families
    .filter((f) => f.category && f.category.toLowerCase() === wanted)
    .filter((f) => f.popularity > notTop)
    .sort((a, b) => a.popularity - b.popularity);
  console.log(`${category} families outside the top ${notTop} by popularity (${matches.length} candidates):`);
  for (const f of matches.slice(0, 30)) console.log(`  ${f.popularity}\t${f.family}\t(variable: ${f.variable})`);
}

const args = process.argv.slice(2);
if (args.includes('--avoid')) {
  const n = Number(args[args.indexOf('--avoid') + 1]);
  if (!Number.isInteger(n) || n <= 0) usage();
  cmdAvoid(n);
} else if (args.includes('--suggest')) {
  const category = args[args.indexOf('--suggest') + 1];
  if (!category) usage();
  const notTopIdx = args.indexOf('--not-top');
  const notTop = notTopIdx >= 0 ? Number(args[notTopIdx + 1]) : 0;
  if (!Number.isInteger(notTop) || notTop < 0) usage();
  cmdSuggest(category, notTop);
} else if (args.length === 0) {
  await fetchAndWrite();
} else {
  usage();
}
