"""Tests for chunker._split_long_paragraph.

chunk_text (covered by tests/test_documents.py) delegates an over-long paragraph to this
helper, which re-splits on sentence boundaries and — for a single sentence that still
exceeds chunk_size — force-slices it with a stride of ``chunk_size - overlap``. The
force-split arithmetic and the sentence-grouping/flush behaviour are pinned here directly
with small, hand-computed inputs (the building-block splitters are pinned in
tests/test_chunker_helpers.py).
"""

from __future__ import annotations

from stirling.documents.chunker import _split_long_paragraph


def test_sentences_all_fit_join_into_one_chunk() -> None:
    # Three short sentences well under chunk_size accumulate into a single space-joined chunk.
    assert _split_long_paragraph("Aa. Bb. Cc.", chunk_size=100, overlap=0) == ["Aa. Bb. Cc."]


def test_force_split_oversize_single_sentence_no_overlap() -> None:
    # No sentence terminator => one "sentence" of length 8 > chunk_size 4; overlap 0 => stride 4
    # => contiguous, non-overlapping 4-char slices.
    assert _split_long_paragraph("abcdefgh", chunk_size=4, overlap=0) == ["abcd", "efgh"]


def test_force_split_oversize_single_sentence_with_overlap() -> None:
    # length 10 > chunk_size 4, overlap 1 => stride 3 => slices at offsets 0,3,6,9.
    # [0:4]=abcd, [3:7]=defg, [6:10]=ghij, [9:13]=j (trailing short slice).
    assert _split_long_paragraph("abcdefghij", chunk_size=4, overlap=1) == [
        "abcd",
        "defg",
        "ghij",
        "j",
    ]


def test_multiple_fitting_sentences_flush_into_separate_chunks() -> None:
    # lens: "One."=4, "Two."=4, "Three."=6, "Four."=5; chunk_size=9, overlap=0.
    # "One."+"Two." fit (len budget 9) -> "One. Two."; "Three." starts a new chunk;
    # "Four." exceeds the running budget and starts its own.
    assert _split_long_paragraph("One. Two. Three. Four.", chunk_size=9, overlap=0) == [
        "One. Two.",
        "Three.",
        "Four.",
    ]


def test_empty_paragraph_returns_empty() -> None:
    assert _split_long_paragraph("", chunk_size=10, overlap=0) == []
