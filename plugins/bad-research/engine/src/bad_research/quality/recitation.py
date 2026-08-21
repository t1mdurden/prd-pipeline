"""Stage-16 recitation gate — RECITATION's *output* guarantee (Gemini §R3.9)
without its decoder machinery. Deterministic, $0, no LLM. Flags any report
sentence that reproduces a cited note's body too closely (a long verbatim run
or >50% of the sentence lifted contiguously). A `major` finding routes to the
patcher to paraphrase — it does NOT block ship (copying is a quality/legal smell,
not a correctness failure). dossier 16 §5."""

from __future__ import annotations

import re

from bad_research.grounding.gate import Finding, split_sentences, strip_sources_section

# dossier 16 §5.1 — IDEA defaults; tune on real reports (dossier §11 honest gap).
RECITATION_MAX_NGRAM = 12     # a verbatim run > 12 words = copying
RECITATION_MAX_OVERLAP = 0.50  # >50% of a sentence's tokens are one contiguous source run
# The >50%-of-sentence branch degenerates for ultra-short sentences: a 1-word
# sentence ("Cut.") trivially has a 1-word run that is 100% of its tokens, and a
# list fragment ("**1.") or "First reason" (a 2-word run) likewise. A run that short
# is not recitation. Gate the density branch behind a minimum run length so only a
# substantive contiguous lift (>= this many words) can trip it (issue #19). The
# floor sits just below the shortest run a real recitation test asserts (a 6-word
# verbatim sentence), so genuine short-sentence copying still flags while 1-4-word
# fragments no longer do. The absolute RECITATION_MAX_NGRAM (>12-word) branch is
# unaffected — a long verbatim run flags regardless of sentence length.
RECITATION_MIN_RUN_FOR_PCT = 5

_WORD = re.compile(r"[\w']+", re.UNICODE)
_CITE_TOKEN = re.compile(r"\[\[[^\]]+\]\]|\[\d+\]")
# Carve-out (Gemini's direct-quote-with-attribution rule, dossier §5.1): a verbatim
# run is exempt ONLY when that run lies INSIDE an explicit "..." quotation AND the
# sentence carries a [N] citation — i.e. it IS an attributed direct quote. The
# exemption is per-RUN, not per-sentence: a sentence that copies a source verbatim
# OUTSIDE its quotes cannot launder the copy by appending an unrelated "quote" [1].
# Matches a straight ("...") OR a curly ("...") quotation span. The exemption
# detector must see both: a draft written with smart-quotes ("...") was being flagged
# even when the verbatim run was an attributed direct quote sitting next to its cite
# (issue #19, straight-vs-curly mismatch).
_QUOTED_SPAN = re.compile(r'"[^"]+"|“[^”]+”')

# A-9 carve-out (sibling to the attributed-quote rule): reference / metadata lines
# inherently repeat source strings (a URL, a title, a citation-list entry) and are
# NOT prose copying. Exempt a line that is a labelled metadata field (`**URL:**`,
# `URL:`, `Source:`, `Title:`, `Author:`, `Published:`, `Accessed:`), a numbered
# reference-list entry (`[1]:` / `1.` + a URL), or a bare URL. Prose sentences are
# untouched — a verbatim prose lift still flags (the exemption keys on line SHAPE).
_BARE_URL = re.compile(r"https?://|www\.", re.IGNORECASE)
_REF_LABEL = re.compile(
    r"^\s*(?:\*\*\s*)?(?:url|source|sources|title|author|authors|published|"
    r"publisher|date|accessed|retrieved|doi|isbn|citation|reference|ref|link)\s*\**\s*:",
    re.IGNORECASE,
)
# `[1]:` or `[note-id]:` style reference-list line head.
_REF_ENTRY = re.compile(r"^\s*\[[^\]]+\]\s*:")


def words(text: str) -> list[str]:
    """Lowercased word tokens with citation markup stripped."""
    return _WORD.findall(_CITE_TOKEN.sub("", text).lower())


def longest_common_contiguous_run(a: list[str], b: list[str]) -> list[str]:
    """The longest run of words that appears contiguously in BOTH sequences
    (word-level longest-common-substring via the classic DP table). Cheap over
    the small per-run corpus — not a character suffix-array."""
    if not a or not b:
        return []
    # prev/cur rows of the LCS-substring DP; track the best end+length.
    prev = [0] * (len(b) + 1)
    best_len = 0
    best_end = 0  # index in `a` (exclusive) where the best run ends
    for i in range(1, len(a) + 1):
        cur = [0] * (len(b) + 1)
        ai = a[i - 1]
        for j in range(1, len(b) + 1):
            if ai == b[j - 1]:
                cur[j] = prev[j - 1] + 1
                if cur[j] > best_len:
                    best_len = cur[j]
                    best_end = i
        prev = cur
    return a[best_end - best_len:best_end]


def _is_contiguous_sublist(needle: list[str], haystack: list[str]) -> bool:
    """True iff `needle` appears as a contiguous run inside `haystack`."""
    n = len(needle)
    if n == 0 or n > len(haystack):
        return False
    return any(haystack[i:i + n] == needle for i in range(len(haystack) - n + 1))


def _is_reference_line(sent: str) -> bool:
    """True iff the sentence is a reference / metadata line rather than prose:
    a labelled field (`**URL:**`, `Source:`, ...), a `[ref]:`-style reference-list
    entry, or a line that begins with a bare URL. These inherently echo the source
    string, so verbatim overlap on them is expected, not recitation (A-9)."""
    s = sent.strip()
    if _REF_LABEL.match(s) or _REF_ENTRY.match(s):
        return True
    # A line whose first token is a URL is a bare-URL / citation line.
    first = s.split(maxsplit=1)[0] if s else ""
    return bool(_BARE_URL.match(first))


def _run_is_attributed_quote(run: list[str], sent: str) -> bool:
    """True iff the verbatim `run` lies entirely within one of the sentence's
    explicit "..." quoted spans AND the sentence carries a citation token — an
    attributed direct quote, which is allowed to be verbatim (Gemini §5.1).

    A run OUTSIDE every quoted span is recitation even if the sentence happens to
    contain some other (unrelated) quote — closing the "append a stray quote to
    escape the gate" false-negative."""
    if not _CITE_TOKEN.search(sent):
        return False
    return any(_is_contiguous_sublist(run, words(span)) for span in _QUOTED_SPAN.findall(sent))


def recitation_findings(report_md: str, note_bodies: dict[str, str]) -> list[Finding]:
    """For each prose sentence (Sources section excluded), flag a `major`
    recitation Finding if its longest contiguous verbatim run against any cited
    note body exceeds RECITATION_MAX_NGRAM words OR > RECITATION_MAX_OVERLAP of
    the sentence's tokens. One finding per sentence (first offending body wins)."""
    findings: list[Finding] = []
    body_words = {nid: words(body) for nid, body in note_bodies.items()}
    for sent in split_sentences(strip_sources_section(report_md)):
        # A-9: reference/metadata lines (URLs, `**URL:**`/`Source:` labels,
        # `[ref]:` entries) inherently repeat the source string — skip them so they
        # don't fire as recitation. Prose sentences fall through unchanged.
        if _is_reference_line(sent):
            continue
        toks = words(sent)
        if not toks:
            continue
        for bw in body_words.values():
            run = longest_common_contiguous_run(toks, bw)
            too_long = len(run) > RECITATION_MAX_NGRAM
            # The density branch only fires for a substantive run — a 1-3 word run that
            # happens to be >50% of a tiny sentence is not recitation (issue #19).
            too_dense = (
                len(run) >= RECITATION_MIN_RUN_FOR_PCT
                and len(run) / len(toks) > RECITATION_MAX_OVERLAP
            )
            if (too_long or too_dense) and not _run_is_attributed_quote(run, sent):
                findings.append(
                    Finding(
                        failure_mode="recitation",
                        severity="major",
                        location=sent,
                        recommendation=(
                            "Sentence reproduces a source span verbatim "
                            f"(longest run {len(run)} words) — paraphrase and keep "
                            "the [N] citation."
                        ),
                    )
                )
                break
    return findings


__all__ = [
    "RECITATION_MAX_NGRAM",
    "RECITATION_MAX_OVERLAP",
    "RECITATION_MIN_RUN_FOR_PCT",
    "longest_common_contiguous_run",
    "recitation_findings",
    "words",
]
