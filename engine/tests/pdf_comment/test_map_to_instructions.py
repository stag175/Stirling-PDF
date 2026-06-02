"""Tests for PdfCommentAgent._map_to_instructions.

This pure static helper translates the LLM's ordinal-based comments
(LlmCommentInstruction.chunk_index) into the Java-facing PdfCommentInstruction
(anchored by the opaque chunk_id), dropping any comment whose ordinal is out of
range as a defence-in-depth guard against a hallucinated/oversized index. It is a
@staticmethod, so it is exercised directly on the class with no agent/model setup.
"""

from __future__ import annotations

from stirling.agents.pdf_comment.agent import LlmCommentInstruction, PdfCommentAgent
from stirling.contracts.pdf_comments import TextChunk

_SESSION = "session-1"


def _chunk(cid: str) -> TextChunk:
    return TextChunk(id=cid, page=0, x=0.0, y=0.0, width=1.0, height=1.0, text="t")


def _comment(
    index: int,
    text: str = "c",
    author: str | None = None,
    subject: str | None = None,
) -> LlmCommentInstruction:
    return LlmCommentInstruction(
        chunk_index=index, comment_text=text, author=author, subject=subject
    )


def test_in_range_comments_are_mapped_to_their_chunk_ids() -> None:
    chunks = [_chunk("p0-c0"), _chunk("p0-c1")]
    comments = [_comment(0, "first"), _comment(1, "second")]

    result = PdfCommentAgent._map_to_instructions(chunks, comments, _SESSION)

    assert [i.chunk_id for i in result] == ["p0-c0", "p0-c1"]
    assert [i.comment_text for i in result] == ["first", "second"]


def test_out_of_range_ordinal_is_dropped() -> None:
    chunks = [_chunk("only")]
    # chunk_index 5 >= len(chunks) == 1 -> dropped (defence-in-depth).
    result = PdfCommentAgent._map_to_instructions(chunks, [_comment(5)], _SESSION)

    assert result == []


def test_mixed_keeps_in_range_drops_out_of_range_preserving_order() -> None:
    chunks = [_chunk("a"), _chunk("b")]
    comments = [_comment(0, "keep-a"), _comment(9, "drop"), _comment(1, "keep-b")]

    result = PdfCommentAgent._map_to_instructions(chunks, comments, _SESSION)

    assert [(i.chunk_id, i.comment_text) for i in result] == [
        ("a", "keep-a"),
        ("b", "keep-b"),
    ]


def test_empty_comments_returns_empty_list() -> None:
    assert PdfCommentAgent._map_to_instructions([_chunk("a")], [], _SESSION) == []


def test_author_and_subject_are_passed_through() -> None:
    chunks = [_chunk("p0-c0")]
    comments = [_comment(0, "body", author="Reviewer", subject="Topic")]

    [instruction] = PdfCommentAgent._map_to_instructions(chunks, comments, _SESSION)

    assert instruction.author == "Reviewer"
    assert instruction.subject == "Topic"
    # Defaults flow through unchanged when the LLM omits them.
    [no_meta] = PdfCommentAgent._map_to_instructions(chunks, [_comment(0)], _SESSION)
    assert no_meta.author is None
    assert no_meta.subject is None


def test_index_equal_to_length_is_out_of_range() -> None:
    # Boundary: index == len(chunks) must be dropped (valid indices are 0..len-1).
    chunks = [_chunk("a"), _chunk("b")]
    assert PdfCommentAgent._map_to_instructions(chunks, [_comment(2)], _SESSION) == []
