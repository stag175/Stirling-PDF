"""Tests for the pure page-chunking helper _build_page_chunks in the pdf_to_markdown agent."""

from __future__ import annotations

import pytest

from stirling.agents.pdf_to_markdown import agent as md_agent
from stirling.contracts.pdf_to_markdown import LayoutFragment, LayoutLine, PageLayout


def _page(page_number: int, n_frags: int) -> PageLayout:
    frags = [
        LayoutFragment(text="x", x=0.0, y=0.0, width=1.0, font_size=10.0, bold=False)
        for _ in range(n_frags)
    ]
    lines = [LayoutLine(y=0.0, fragments=frags)] if frags else []
    return PageLayout(page_number=page_number, lines=lines)


def _sizes(chunks: list[list[PageLayout]]) -> list[int]:
    return [len(chunk) for chunk in chunks]


def test_empty_input() -> None:
    assert md_agent._build_page_chunks([]) == []


def test_single_page() -> None:
    assert _sizes(md_agent._build_page_chunks([_page(1, 3)])) == [1]


def test_page_count_limit_splits_into_groups_of_ten() -> None:
    pages = [_page(i, 1) for i in range(23)]
    assert _sizes(md_agent._build_page_chunks(pages)) == [10, 10, 3]


def test_exactly_max_pages_is_one_chunk() -> None:
    pages = [_page(i, 1) for i in range(10)]
    assert _sizes(md_agent._build_page_chunks(pages)) == [10]


def test_one_over_max_pages_splits() -> None:
    pages = [_page(i, 1) for i in range(11)]
    assert _sizes(md_agent._build_page_chunks(pages)) == [10, 1]


def test_fragment_limit_splits(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(md_agent, "_MAX_CHUNK_FRAGMENTS", 5)
    # 2 fragments per page, limit 5: pairs fit (4) but a 3rd (6) overflows
    pages = [_page(i, 2) for i in range(5)]
    assert _sizes(md_agent._build_page_chunks(pages)) == [2, 2, 1]


def test_single_oversized_page_is_kept_whole(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(md_agent, "_MAX_CHUNK_FRAGMENTS", 5)
    # a lone page exceeding the fragment limit still forms its own chunk (never split)
    assert _sizes(md_agent._build_page_chunks([_page(1, 8)])) == [1]
