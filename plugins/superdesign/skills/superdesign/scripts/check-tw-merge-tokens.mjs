#!/usr/bin/env node
// F1 gate: every custom --text-* token in @theme must be registered with
// tailwind-merge, or cn() silently drops it whenever a text-color class
// follows it in the same call. See evals/redesign/F1-cn-token-fix.md.
//
// Usage: node .claude/skills/superdesign/scripts/check-tw-merge-tokens.mjs <theme.css> <utils.ts>
//
// EXIT-CODE CONTRACT — identical in every superdesign gate (ARCHITECTURE.md §2):
//   0        clean
//   1-63     the number of violations. A count above 63 is clamped to 63 and the line says so.
//   64-79    harness error - 64 usage . 65 missing dep . 66 navigation failed . 67 no target
// Here a violation is one custom --text-* token that cn() will silently drop.
import { readFileSync } from 'node:fs';

const clamp = (n) => {
  if (n > 63) console.error(`  (exit code clamped to 63; ${n} violation(s) found)`);
  return Math.min(n, 63);
};
const read = (p) => {
  try {
    return readFileSync(p, 'utf8');
  } catch (e) {
    console.error(`check-tw-merge-tokens: cannot read ${p} - ${e.message}`);
    process.exit(67); // 67 = no target
  }
};

const [, , themePath, utilsPath] = process.argv;
if (!themePath || !utilsPath) {
  console.error('usage: check-tw-merge-tokens.mjs <theme.css> <utils.ts>');
  process.exit(64); // 64 = usage
}

const STANDARD_SCALE = new Set([
  'xs', 'sm', 'base', 'lg', 'xl',
  '2xl', '3xl', '4xl', '5xl', '6xl', '7xl', '8xl', '9xl',
]);

const css = read(themePath);
// --text-hero: ...   but not --text-hero--line-height / --letter-spacing
const customNames = [...css.matchAll(/--text-([a-z0-9-]+?):/g)]
  .map((m) => m[1])
  .filter((name) => !name.includes('--')) // drop --line-height/--letter-spacing companions caught by a loose match
  .filter((name) => !STANDARD_SCALE.has(name));

const uniqueCustom = [...new Set(customNames)];

if (uniqueCustom.length === 0) {
  console.log('check-tw-merge-tokens: no custom --text-* size tokens found, nothing to register.');
  process.exit(0);
}

const utils = read(utilsPath);
const usesExtend = /extendTailwindMerge/.test(utils);
if (!usesExtend) {
  console.error(
    `check-tw-merge-tokens: FAIL — ${uniqueCustom.length} custom text token(s) ` +
    `(${uniqueCustom.join(', ')}) exist in ${themePath}, but ${utilsPath} calls bare ` +
    `twMerge(). Every one of these silently disappears from cn() when a text-color class ` +
    `follows it. Use extendTailwindMerge({ extend: { theme: { text: [...] } } }).`
  );
  process.exit(clamp(uniqueCustom.length));
}

const themeTextMatch = utils.match(/theme:\s*{[^}]*text:\s*\[([^\]]*)\]/s);
const registered = themeTextMatch
  ? new Set(themeTextMatch[1].match(/['"`]([a-z0-9-]+)['"`]/g)?.map((s) => s.slice(1, -1)) ?? [])
  : new Set();

const missing = uniqueCustom.filter((name) => !registered.has(name));

if (missing.length > 0) {
  console.error(
    `check-tw-merge-tokens: FAIL — ${missing.length} custom text token(s) not registered ` +
    `in extendTailwindMerge's theme.text: ${missing.join(', ')}. Add them to ${utilsPath}, ` +
    `or they silently vanish from any cn() call that also carries a text-color class.`
  );
  process.exit(clamp(missing.length));
}

console.log(`check-tw-merge-tokens: OK — ${uniqueCustom.length} custom text token(s) all registered.`);
process.exit(0);
