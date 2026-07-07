"""Tests for the pure page-range label helper in agents.shared.chunked_mapper."""

from __future__ import annotations

from stirling.agents.shared.chunked_mapper import _page_range_label
from stirling.contracts import Page


def _page(n: int) -> Page:
    return Page(page_number=n, text="x", char_count=1)


def test_empty_pages() -> None:
    assert _page_range_label([]) == "pages=?"


def test_single_page() -> None:
    assert _page_range_label([_page(5)]) == "pages=5"


def test_contiguous_range_uses_first_and_last() -> None:
    assert _page_range_label([_page(1), _page(2), _page(3)]) == "pages=1-3"


def test_range_uses_endpoints_only() -> None:
    # only the first and last page numbers are used, regardless of the middle
    assert _page_range_label([_page(7), _page(8), _page(12)]) == "pages=7-12"
