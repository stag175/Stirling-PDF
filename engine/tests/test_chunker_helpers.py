"""Direct tests for the pure splitting/overlap helpers in stirling.documents.chunker.

`chunk_text` itself is covered by tests/test_documents.py; these pin the building blocks.
"""

from __future__ import annotations

import pytest

from stirling.documents.chunker import (
    _get_overlap,
    _split_paragraphs,
    _split_sentences,
)


class TestSplitParagraphs:
    @pytest.mark.parametrize(
        ("text", "expected"),
        [
            ("a\n\nb", ["a", "b"]),
            ("a\n  \nb", ["a", "b"]),  # whitespace-only divider line
            ("a\n\n\n\nb", ["a", "b"]),  # multiple blank lines collapse
            ("single", ["single"]),
            ("a\nb", ["a\nb"]),  # single newline stays one paragraph
            ("  spaced  \n\n  para  ", ["spaced", "para"]),  # stripped
            ("  \n\n  ", []),  # all blank
        ],
    )
    def test_split_paragraphs(self, text: str, expected: list[str]) -> None:
        assert _split_paragraphs(text) == expected


class TestSplitSentences:
    @pytest.mark.parametrize(
        ("text", "expected"),
        [
            (
                "Hello world. How are you? Fine!",
                ["Hello world.", "How are you?", "Fine!"],
            ),
            ("No punctuation here", ["No punctuation here"]),
            ("A.B", ["A.B"]),  # no whitespace after '.' -> no split
            ("One.  Two.", ["One.", "Two."]),  # collapse multiple spaces
            ("Wait... really?", ["Wait...", "really?"]),
            ("", []),
        ],
    )
    def test_split_sentences(self, text: str, expected: list[str]) -> None:
        assert _split_sentences(text) == expected


class TestGetOverlap:
    def test_returns_empty_for_no_chunks_or_nonpositive_overlap(self) -> None:
        assert _get_overlap([], 5) == ""
        assert _get_overlap(["x"], 0) == ""
        assert _get_overlap(["x"], -3) == ""

    def test_snaps_tail_to_word_boundary(self) -> None:
        # last 8 chars of "hello world foobar" = "d foobar" -> snap past the space -> "foobar"
        assert _get_overlap(["hello world foobar"], 8) == "foobar"

    def test_short_chunk_returned_whole(self) -> None:
        assert _get_overlap(["hi"], 10) == "hi"

    def test_tail_without_space_returned_as_is(self) -> None:
        assert _get_overlap(["abcdefgh"], 4) == "efgh"

    def test_leading_space_at_index_zero_is_not_snapped(self) -> None:
        # last 7 chars of "foo barbaz" = " barbaz"; space is at index 0 (not > 0) -> kept
        assert _get_overlap(["foo barbaz"], 7) == " barbaz"
