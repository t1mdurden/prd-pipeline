"""Chunker: stable-ID chunks with verbatim-slice provenance.

- Code notes (content_type == "code"): tree-sitter AST split + NIA-style
  header prepended to embed_text (Task 5 extends this).
- Prose: markdown heading-aware split; oversized sections re-split at the
  best boundary available (paragraph, then line, then sentence). Whole note
  if body < CHUNK_BYTE_MIN.
- chunk_id = sha1(url + "#" + heading)  (NIA §3.5 stable-id pattern).
- char_start/char_end index into note.body (provenance for grounding, Plan 06).
"""
from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass

from bad_research.models.note import Note
from bad_research.retrieval.base import Chunk
from bad_research.retrieval.constants import CHUNK_BYTE_MIN, CHUNK_BYTE_TARGET

_H_RE = re.compile(r"^(#{1,3})[ \t]+(.+?)[ \t]*$", re.MULTILINE)


def make_chunk_id(url: str, heading: str) -> str:
    return hashlib.sha1(f"{url}#{heading}".encode()).hexdigest()


@dataclass
class _Span:
    heading: str
    start: int
    end: int


def _heading_spans(body: str) -> list[_Span]:
    """Byte spans between markdown H1-H3 headings. Each span starts at the
    heading line and ends just before the next heading (or EOF)."""
    matches = list(_H_RE.finditer(body))
    if not matches:
        return [_Span("", 0, len(body))]
    spans: list[_Span] = []
    # Preamble before the first heading (if any non-empty content).
    if matches[0].start() > 0:
        spans.append(_Span("", 0, matches[0].start()))
    for i, m in enumerate(matches):
        start = m.start()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(body)
        spans.append(_Span(m.group(2).strip(), start, end))
    return spans


_HARD_CAP = CHUNK_BYTE_TARGET * 2


def _boundaries(text: str) -> list[int]:
    """Candidate cut offsets inside `text`, relative to its start, ascending.

    Paragraph breaks first. A fetched page usually has none — trafilatura emits
    one line per paragraph, no blank lines (803 of 1113 notes in a real vault),
    which left a 20 KB page as a single 20 KB "chunk" — so fall back to line
    breaks, then to sentence ends.
    """
    for pat in (r"\n\s*\n", r"\n", r"(?<=[.!?])\s+"):
        offs = [m.end() for m in re.finditer(pat, text)]
        if len(offs) >= 2:
            return offs
    return []


def _split_oversized(span: _Span, body: str) -> list[_Span]:
    """Split a too-large span at the best available boundary, keeping each piece
    near CHUNK_BYTE_TARGET. Offsets stay absolute and every piece stays a
    verbatim slice of `body`."""
    text = body[span.start:span.end]
    if len(text.encode()) <= CHUNK_BYTE_TARGET:
        return [span]
    cuts = [span.start + o for o in _boundaries(text)]
    pieces: list[_Span] = []
    buf_start = span.start
    for nxt in [*cuts, span.end]:
        if nxt <= buf_start:
            continue
        if len(body[buf_start:nxt].encode()) >= CHUNK_BYTE_TARGET:
            pieces.append(_Span(span.heading, buf_start, nxt))
            buf_start = nxt
    if buf_start < span.end:
        pieces.append(_Span(span.heading, buf_start, span.end))
    # Last resort: one unbroken run with no boundary at all. Cut on characters
    # (the cap is bytes; chars <= bytes, so this always advances and terminates).
    out: list[_Span] = []
    for p in pieces:
        while len(body[p.start:p.end].encode()) > _HARD_CAP:
            cut = p.start + CHUNK_BYTE_TARGET
            out.append(_Span(p.heading, p.start, cut))
            p = _Span(p.heading, cut, p.end)
        out.append(p)
    return out or [span]


def _prose_chunks(note: Note) -> list[Chunk]:
    body = note.body
    url = note.meta.source or note.path
    note_id = note.meta.id
    if len(body.encode()) < CHUNK_BYTE_MIN:
        return [Chunk(
            chunk_id=make_chunk_id(url, note.meta.title or "_"),
            note_id=note_id, text=body, char_start=0, char_end=len(body),
            score=0.0, source_id="")]
    chunks: list[Chunk] = []
    idx = 0
    for span in _heading_spans(body):
        for piece in _split_oversized(span, body):
            text = body[piece.start:piece.end]
            if not text.strip():
                continue
            heading = piece.heading or f"_{idx}"
            # Disambiguate repeated headings after oversize-split with an index suffix.
            cid = make_chunk_id(url, f"{heading}#{idx}" if idx else heading)
            chunks.append(Chunk(chunk_id=cid, note_id=note_id, text=text,
                                char_start=piece.start, char_end=piece.end,
                                score=0.0, source_id=""))
            idx += 1
    return chunks


def chunk_note(note: Note) -> list[Chunk]:
    """Dispatch on content_type. Code → AST (Task 5); else prose."""
    ct = getattr(note.meta, "content_type", None)
    if ct == "code":
        from bad_research.retrieval.chunker_code import chunk_code_note  # Task 5
        return chunk_code_note(note)
    return _prose_chunks(note)
