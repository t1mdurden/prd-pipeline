"""OcProvider — rung 1.5: a cheap second opinion on a page rung 1 could not read.

`oc` (only-cli, github.com/only-cli/oc) fetches a page and hands back a structured,
numbered view of it instead of raw HTML. It is a READER, not a browser: no JavaScript
rendering, no login, no clicking. That is precisely why it belongs between rung 1 and
rung 2 rather than anywhere near silver.

What it buys over rung 1's httpx GET is one thing, and it is the thing that matters
here: it talks to the server the way Chrome does. Its optional `impers` transport
presents a real browser TLS and HTTP/2 fingerprint, and even its plain-fetch fallback
sends Chrome's headers. Pages that answer httpx with an interstitial answer `oc` with
the article. Measured on x.com: silver returned HTTP 403 with no session, r.jina.ai
returned the page, and `oc` returned 491 tokens of real content against ~109,869 bytes
of page HTML.

**Its failure mode is the reason for the gate below.** On a JavaScript-only page `oc`
exits 0, renders zero content blocks, and reports "100% saved" — a miss that reads
exactly like a hit. See github.com/only-cli/oc/issues/14. The ladder is already built
for this: `_is_empty` decides whether a rung's output replaces the incumbent, so an
`oc` result that distilled nothing loses to whatever rung 1 returned and the ladder
escalates to crawl4ai/silver as if `oc` had never run. Never bypass that check.

SSRF: `oc` carries its own DNS-resolved denylist and re-validates every redirect hop
(`fetch.js`), which is stricter than this ladder's lexical `is_blocked_url`. We still
gate the entry URL and re-validate the final URL it reports, because a rung must not
depend on a third-party CLI's guard staying correct across upgrades.

`oc` is an EXTERNAL CLI, NOT a pip dep. `_resolve_cli()` returns None when it is
absent and the rung is skipped, exactly like silver and agent-browser. Resolution
order: `BAD_RESEARCH_OC_BIN`, then a vendored checkout under `vendor/oc`, then `oc` on
PATH. `scripts/vendor-oc.sh` populates the vendored copy; it is deliberately NOT
committed while github.com/only-cli/oc/issues/15 is open, because that repository
declares MIT in its README and package.json but ships no LICENSE file, and this
repository is public.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
from pathlib import Path

from bad_research.core.fetcher import is_blocked_url
from bad_research.web.base import WebResult

# ---- frozen constants ----
OC_PROGRAM = "oc"
OC_TIMEOUT_S = 45
# Keeps our session state out of the user's own `~/.only-cli`, the same way the silver
# provider keeps its sessions off the `default` namespace.
OC_NAMESPACE = "bad-research"
# A render that distils to less than this many characters is not worth returning; the
# ladder's `_is_empty` would drop it anyway, and returning None keeps the log honest
# about which rung actually produced the incumbent.
MIN_USEFUL_CHARS = 200


def _vendored_cli() -> Path | None:
    """The vendored `oc` entry point, or None when the checkout is absent.

    `vendor/` sits at the repository root, four parents up from this file
    (`src/bad_research/browse/oc.py`).
    """
    candidate = Path(__file__).resolve().parents[3] / "vendor" / "oc" / "src" / "cli.js"
    return candidate if candidate.is_file() else None


def _resolve_cli() -> list[str] | None:
    """The argv prefix that runs `oc`, or None when it is not installed.

    Never raises: an absent CLI is a skipped rung, not an error.
    """
    override = os.environ.get("BAD_RESEARCH_OC_BIN", "").strip()
    if override:
        return [override] if shutil.which(override) or Path(override).is_file() else None
    vendored = _vendored_cli()
    if vendored is not None:
        node = shutil.which("node")
        if node:
            return [node, str(vendored)]
    found = shutil.which(OC_PROGRAM)
    return [found] if found else None


# Block types that are widget scaffolding rather than content. Buttons only: a `link`
# is nav on an article page but IS the content on an aggregator — dropping links turned
# a Hacker News front page into "1. 24 points by | | 2. 231 points by | |", every
# headline gone. A few nav words at the top of an article is the cheaper mistake.
_CHROME_TYPES = frozenset({"button"})
_PROSE_TYPES = frozenset({"text", "quote", "code", "item", "link"})


def _blocks_to_markdown(blocks: list[dict]) -> str:
    """Render `oc raw --json` blocks as markdown, dropping widget scaffolding."""
    out: list[str] = []
    for b in blocks:
        kind = b.get("type")
        text = (b.get("text") or "").strip()
        if not text or kind in _CHROME_TYPES:
            continue
        if kind == "heading":
            level = b.get("level")
            level = level if isinstance(level, int) and 1 <= level <= 6 else 2
            out.append(f"{'#' * level} {text}")
        elif kind in _PROSE_TYPES:
            out.append(text)
    return "\n\n".join(out).strip()


def fetch(url: str, *, runner=None) -> WebResult | None:
    """Fetch `url` through `oc`, or None when the rung cannot or should not answer.

    Returns None for: an absent CLI, a blocked entry or final URL, a non-zero exit, a
    malformed payload, a timeout, or a render too thin to be worth carrying. The caller
    keeps its incumbent result and escalates.
    """
    if is_blocked_url(url):
        return None
    # An injected runner IS the seam: tests supply the transport, so resolving a real
    # CLI on the test machine would be the only thing standing between a hermetic suite
    # and whoever happens to have `oc` on PATH.
    argv_prefix = [OC_PROGRAM] if runner is not None else _resolve_cli()
    if argv_prefix is None:
        return None

    env = dict(os.environ)
    env["OC_HOME"] = str(
        Path(env.get("XDG_STATE_HOME") or Path.home() / ".local" / "state")
        / "bad-research"
        / "oc"
        / OC_NAMESPACE
    )
    argv = [*argv_prefix, "raw", url, "--json"]

    try:
        if runner is not None:
            code, stdout, _stderr = runner(argv, timeout=OC_TIMEOUT_S, env=env)
        else:
            proc = subprocess.run(
                argv, capture_output=True, text=True, timeout=OC_TIMEOUT_S, env=env,
                check=False,
            )
            code, stdout = proc.returncode, proc.stdout
    except Exception:
        return None
    if code != 0 or not stdout.strip():
        return None

    try:
        payload = json.loads(stdout)
        blocks = payload.get("blocks") or []
        if not isinstance(blocks, list):
            return None
    except Exception:
        return None

    # Re-validate the URL `oc` actually landed on. Its own guard checks every hop, but a
    # rung must not rest on a third-party CLI's guard staying correct across upgrades.
    final_url = payload.get("url") or url
    if not isinstance(final_url, str) or is_blocked_url(final_url):
        return None

    content = _blocks_to_markdown([b for b in blocks if isinstance(b, dict)])
    if len(content) < MIN_USEFUL_CHARS:
        return None

    return WebResult(
        url=final_url,
        title=(payload.get("title") or "").strip(),
        content=content,
        metadata={"provider": "oc", "blocks": len(blocks)},
    )


def is_available() -> bool:
    """Whether the `oc` rung can run at all on this machine."""
    return _resolve_cli() is not None
