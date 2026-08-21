# STATE — prd-pipeline — rewritten 2026-07-28, updated 2026-08-21

## Goal
Every skill on this machine either ships in a plugin or symlinks into a git clone, so nothing is a
hand-copy that rots. Three upstream PRs merged. No skill listed twice.

## Done
- Marketplace manifest fixed and pushed (`8e66c98`). `"source": {"source":"git"}` is not a legal
  plugin source — only `url` and `git-subdir` are. compound-v now uses `url`; silver is out until
  its manifest reaches `master` (silver#2). evidence: `claude plugin validate .` -> "Validation passed".
- Plugins now: prd-pipeline 1.0.0, compound-v 0.6.0, bad-research 0.2.2. The 0.3.0 -> 0.5.0 jump
  dropped the folded `compound-v:prd-pipeline`, so installing prd-pipeline closed the gap rather
  than duplicating it. evidence: a fresh `claude -p` skill listing shows `prd-pipeline:prd-pipeline`
  once and no `compound-v:prd-pipeline`.
- **All five loose skills are now symlinks into their source clones**, plus the four silver
  commands. Old copies moved to `~/.claude/backups/skills-pre-symlink-20260728-195748` (nothing
  deleted). Proof the copies were rotting: `~/.claude/skills/silver/skill-data/core/SKILL.md` was
  3 days behind its clone and missing the `silver.json` privilege-escalation fix.
  | link | target |
  |---|---|
  | silver | `~/Documents/GitHub/silver/silver` |
  | superdesign | `~/Documents/GitHub/prd-pipeline/plugins/superdesign/skills/superdesign` |
  | founder-distribution, handoff | `~/Documents/GitHub/compound-v/skills/*` |
  | workflow-investigation | `~/Documents/GitHub/workflow-investigation/assets/SKILL.md` (see below) |
  evidence: a fresh `claude -p` session lists all five — symlinked skill dirs load fine.
  workflow-investigation is the odd shape: a real directory whose `SKILL.md` is the symlink, because
  the clone owns a bare file rather than a skill-shaped dir. It first pointed at
  `skills/workflow-investigation/SKILL.md` — the exact path workflow-investigation#2 deletes — which
  would have made the skill vanish silently on the next pull. `update-skills.sh` now understands both
  shapes and resolves the clone from either.
- `~/.claude/scripts/update-skills.sh` — checks every symlink, pulls each source clone, updates the
  marketplaces, exits 1 on drift. evidence: run shows 9/9 links ok and names the two clones that
  cannot pull.
- Russian removed from everything the model reads: the `handoff` description and the CLAUDE.md
  config map. **Deliberately kept** in `hooks/verify-claim.sh` and `hooks/secrets-guard.sh` — those
  are grep, and grep does not translate; dropping the Russian alternatives blinds both guards.

- **founder-distribution is now grounded.** It was the only skill in compound-v dense with empirical
  claims and no `references/sources.md` entry, while its own honest-warrant section demanded three
  warrant tiers. A full-route bad-research run (10 parallel fetchers, 14 sub-questions, 164 sources,
  ~200 verbatim-grounded claims) produced a `## founder-distribution` section in
  `~/Documents/GitHub/compound-v/references/sources.md`, and the skill body was rewritten against it
  (107 -> 135 lines). Both shipped in `2613967` on the compound-v fork; PR #9 picked it up.
  evidence: `bash scripts/check.sh` -> 28 skills, 0 failures, 0 warnings.
  **Three of its nine claims do not survive as written:** "several scaled to millions with no push
  feature at all" (no supporting instance exists), "almost every company got its first thousand from
  one channel" (Traction prescribes parallel testing first and addresses a later stage entirely), and
  the gate rule's non-transferability condition (Gmail, Clubhouse and Robinhood all violate it). Two
  more are contradicted outright: "the highest-friction users drown first" and "fix retention before
  optimizing acquisition" (Ehrenberg-Bass: the belief is held "without any evidence").
  Only `brainstorming` and `handoff` now lack a sources entry, and both are pure procedure.
- Engine bug found and worked around: `bad funnel-gather` exits 0 but its search fan-out ignores the
  plan and returns junk (Google login pages, an IELTS test). `bad fetch <url>` and `bad search` are
  separately unreliable — `search` reported 15 notes while `research/notes/` held 164 files. File the
  bug in `LeventySeven/badresearch`, not here. **Fixed by 0.3.0** — a live
  `bad funnel-gather "what is the OKLCH color space" --mode light` on the 0.2.2 plugin returned three
  on-topic notes (Wikipedia Oklab, atmos.style, Init HTML), no junk. The `search` under-report was
  never re-measured.

- **workflow-investigation#2 is merged** (`3da308e`, 2026-07-29). The plugin surface is gone from
  that repo — `.claude-plugin/`, `skills/`, `scripts/sync-plugin.sh` — and `npx github:` is again its
  only install path. Its README had been advertising `/plugin install workflow-investigation@prd-pipeline`,
  an entry dropped from the marketplace back in `95fb5f4`, so main documented an install that no
  longer existed. The two real 1.2.0 fixes survived the revert: no duplicate slash command, and
  corpus paths resolved from `WI_CORPUS_ROOT` rather than hardcoded. evidence:
  `grep -c 'seventyleven\|/Users/admin' assets/SKILL.md` -> 0.

- **bad-research is on the engine upstream actually ships** (2026-08-21, `5a1aa95`, plugin 0.2.2).
  It had been vendoring 0.1.0 — a build with no `fetch` and no `assets` — for four months, so the
  skills carried a hand-written degradation path around a slim CLI, and `bin/bad` only checked
  whether the venv existed, which pinned this machine to 0.1.0 across every plugin update.
  Re-vendored from `LeventySeven/badresearch@ba04844` (0.3.0): ultrafast is folded into fast
  upstream so that skill is gone, the assumption critic is new (21 skills, 17 agents), and the
  launcher now stamps the engine version and rebuilds when it moves. `scripts/vendor-bad-research.sh`
  makes the surface a build product — engine verbatim, skills namespaced from the engine's own
  sources, agents rendered through `bad install` with the build venv's path stripped back out, and
  the two plugin-only hunks in `plugins/bad-research/patches/`. Run it twice, get the same tree.
  evidence: `git status --porcelain` empty after a fresh run; `./bin/bad --version` rebuilt
  0.1.0 -> 0.3.0; `bad doctor -j` -> ok:true, 10 active providers.

## Next
1. **silver can go back into the marketplace.** `silver#2` merged on 2026-08-06, so
   `.claude-plugin/plugin.json` is on `master` now — the reason it was dropped in `8e66c98` is gone.
   Adding it means one more entry in `.claude-plugin/marketplace.json` and deleting the
   `~/.claude/skills/silver` symlink so it doesn't list twice.
2. `compound-v#10` (fix/handoff-which-repo) is still open upstream. Fork+PR path — see Do not.

## Open decisions
- The BAD_GUIDE sweep wording in `assets/SKILL.md`. The old repo copy said "two copies, read both",
  the installed copy said "only one on this machine". Shipped compromise, now on main: read
  `guidesfm/`, also read a standalone `BAD_GUIDE.md` if present, prefer `guidesfm/` on disagreement.
  It went in with #2 without a separate review — confirm it is right or correct it directly, since
  Timmy-Lane can push to that repo.

## Verify with
```bash
bash tests/smoke.sh && bash tests/bundle-consistency.sh && claude plugin validate .
~/.claude/scripts/update-skills.sh
```

## Do not
- Do not copy a skill into `~/.claude/skills/`. Symlink the clone. Every copy here has gone stale.
- Do not `git push` to `LeventySeven/compound-v` or `LeventySeven/silver`: Timmy-Lane has
  `push: false` on both. Use the existing `fork` remote + a PR. **`LeventySeven/workflow-investigation`
  is the exception — Timmy-Lane has `push: true, triage: true` there and can merge its own PRs.**
  Check with `gh api repos/<owner>/<repo> --jq .permissions` rather than assuming; the old blanket
  "no push to any LeventySeven repo" rule in this file was wrong and cost a round trip.
- Do not put workflow-investigation in a marketplace. Private, internal repo; npx only.
- Do not re-vendor compound-v. That is what pinned it at 0.3.0 while upstream reached 0.5.0. It is
  pulled live by `url`, and it can be, because that repo carries its own `.claude-plugin/plugin.json`.
  bad-research cannot: `LeventySeven/badresearch` ships no plugin manifest and the engine is a Python
  package that has to be installed, so it is vendored — but through `scripts/vendor-bad-research.sh`,
  never by hand, and the version in `plugin.json` moves with it.
- Do not list a plugin whose source repo lacks `.claude-plugin/plugin.json` on its **default
  branch**. A manifest that only exists on an open PR branch is not installable, and
  `claude plugin validate .` will not catch it — it checks the source shape, not that it resolves.
