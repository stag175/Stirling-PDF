"""Tests for the pure note-range label helper in agents.shared.chunked_reasoner.

Unlike chunked_mapper._page_range_label (which uses the first/last of the supplied page
list as-is), _note_range_label flattens the pages across a group of already-extracted
ChunkNotes, then sorts and de-duplicates them before taking the endpoints.
"""

from __future__ import annotations

from stirling.agents.shared.chunked_reasoner import ChunkNotes, _note_range_label


def _notes(pages: list[int]) -> ChunkNotes:
    # relevant_excerpts/facts default to []; only pages + summary are required.
    return ChunkNotes(pages=pages, summary="s")


def test_empty_notes_list() -> None:
    assert _note_range_label([]) == "pages=?"


def test_notes_with_no_page_numbers() -> None:
    # A note carrying an empty pages list flattens to nothing -> unknown.
    assert _note_range_label([_notes([]), _notes([])]) == "pages=?"


def test_single_page() -> None:
    assert _note_range_label([_notes([5])]) == "pages=5"


def test_single_distinct_page_across_multiple_notes() -> None:
    # Same page repeated in several notes de-duplicates down to one number.
    assert _note_range_label([_notes([4]), _notes([4])]) == "pages=4"


def test_endpoints_use_min_and_max_across_notes() -> None:
    assert _note_range_label([_notes([3]), _notes([1]), _notes([9])]) == "pages=1-9"


def test_unsorted_and_duplicate_pages_are_sorted_and_deduped() -> None:
    # {8,2,5,2} -> sorted unique {2,5,8} -> endpoints 2 and 8.
    assert _note_range_label([_notes([8, 2]), _notes([5, 2])]) == "pages=2-8"


def test_single_note_with_multiple_pages_uses_endpoints() -> None:
    assert _note_range_label([_notes([7, 8, 12])]) == "pages=7-12"
