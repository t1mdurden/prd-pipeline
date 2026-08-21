#!/usr/bin/env bash
# Re-vendor plugins/bad-research from a badresearch checkout.
#
# The plugin is a build product of the upstream engine, not a hand-copy:
#   engine/  <- the Python package, verbatim
#   skills/  <- engine/src/bad_research/skills/*.md, namespaced for the plugin,
#               plus the hunks in patches/ that only make sense inside a plugin
#   agents/  <- whatever `bad install` emits (the agent bodies live in hooks.py)
#
# Usage: scripts/vendor-bad-research.sh [path-to-badresearch-checkout]
set -euo pipefail

SRC="${1:-${HOME}/Documents/GitHub/badresearch}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PLUGIN="${ROOT}/plugins/bad-research"
ENGINE="${PLUGIN}/engine"

[ -f "${SRC}/pyproject.toml" ] || { echo "not a badresearch checkout: ${SRC}" >&2; exit 1; }
grep -q '^name = "bad-research"' "${SRC}/pyproject.toml" || { echo "not bad-research: ${SRC}" >&2; exit 1; }
[ -z "$(git -C "${SRC}" status --porcelain)" ] || { echo "checkout is dirty: ${SRC}" >&2; exit 1; }

VERSION="$(sed -n 's/^version = "\(.*\)"/\1/p' "${SRC}/pyproject.toml" | head -1)"
SHA="$(git -C "${SRC}" rev-parse --short HEAD)"
echo "vendoring bad-research ${VERSION} (${SHA}) from ${SRC}"

# --- engine ------------------------------------------------------------------
rm -rf "${ENGINE}/src"
rsync -a --exclude '__pycache__' --exclude '*.pyc' \
  "${SRC}/src/" "${ENGINE}/src/"
cp "${SRC}/pyproject.toml" "${SRC}/uv.lock" "${SRC}/README.md" "${SRC}/LICENSE" "${ENGINE}/"

# --- skills ------------------------------------------------------------------
# A step skill calls its successor by id. Inside a plugin every id is namespaced,
# so `Skill(skill: "bad-research-N")` has to become `bad-research:bad-research-N`.
for f in "${ENGINE}"/src/bad_research/skills/*.md; do
  n="$(basename "$f" .md)"
  mkdir -p "${PLUGIN}/skills/${n}"
  sed -E 's/Skill\(skill: "bad-research/Skill(skill: "bad-research:bad-research/g' \
    "$f" > "${PLUGIN}/skills/${n}/SKILL.md"
done
# Drop skill dirs the engine no longer ships (upstream folds routes together).
for d in "${PLUGIN}"/skills/*/; do
  n="$(basename "$d")"
  [ -f "${ENGINE}/src/bad_research/skills/${n}.md" ] || { echo "  dropping retired skill ${n}"; rm -rf "$d"; }
done
# The plugin-only hunks: bundled step skills, self-bootstrapping engine, bug tracker.
for p in "${PLUGIN}"/patches/*.patch; do
  [ -e "$p" ] || break
  git -C "${ROOT}" apply "$p" || { echo "patch failed: $p — reconcile it against the new skill" >&2; exit 1; }
done

# --- agents ------------------------------------------------------------------
# Agent bodies are Python string constants; `bad install` is the only renderer.
TMP="$(mktemp -d)"
trap 'rm -rf "${TMP}"' EXIT
uv venv --python 3.13 "${TMP}/venv" >/dev/null
uv pip install --python "${TMP}/venv/bin/python" "${ENGINE}" >/dev/null
mkdir -p "${TMP}/proj"
"${TMP}/venv/bin/bad" install --project "${TMP}/proj" --json >/dev/null
rm -f "${PLUGIN}"/agents/*.md
cp "${TMP}/proj/.claude/agents/"*.md "${PLUGIN}/agents/"

echo "done: $(ls "${PLUGIN}"/skills | wc -l | tr -d ' ') skills, $(ls "${PLUGIN}"/agents | wc -l | tr -d ' ') agents, engine ${VERSION}"
echo "remember to bump ${PLUGIN}/.claude-plugin/plugin.json"
