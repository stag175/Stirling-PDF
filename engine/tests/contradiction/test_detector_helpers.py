"""Tests for the pure helpers in the contradiction detector.

`_windows` only ever slices its input list (it never reads ``Claim`` attributes), so the windowing
behaviour is exercised with placeholder items via ``cast`` rather than building full ``Claim`` objects.
"""

from __future__ import annotations

from typing import cast

import pytest

from stirling.agents.contradiction.detector import _fallback_summary, _windows
from stirling.contracts.contradiction import Claim


def _items(n: int) -> list[Claim]:
    return cast("list[Claim]", list(range(n)))


def _shape(items: list[Claim], size: int, overlap: int) -> list[tuple[int, int]]:
    """Return (start_index, window_length) pairs for the produced windows."""
    return [(start, len(window)) for start, window in _windows(items, size, overlap)]


def _covered(items: list[Claim], size: int, overlap: int) -> set[int]:
    covered: set[int] = set()
    for start, window in _windows(items, size, overlap):
        covered.update(range(start, start + len(window)))
    return covered


class TestWindows:
    def test_small_bucket_yields_single_full_window(self) -> None:
        assert _shape(_items(3), 5, 0) == [(0, 3)]

    def test_empty_bucket_yields_one_empty_window(self) -> None:
        assert _shape(_items(0), 5, 0) == [(0, 0)]

    def test_no_overlap_tiles_the_list(self) -> None:
        assert _shape(_items(10), 4, 0) == [(0, 4), (4, 4), (8, 2)]

    def test_overlap_steps_by_size_minus_overlap(self) -> None:
        assert _shape(_items(10), 4, 2) == [(0, 4), (2, 4), (4, 4), (6, 4)]

    def test_every_item_is_covered_by_at_least_one_window(self) -> None:
        for size, overlap in [(4, 0), (4, 2), (3, 1), (5, 4)]:
            assert _covered(_items(13), size, overlap) == set(range(13))

    @pytest.mark.parametrize(
        ("size", "overlap"),
        [(0, 0), (-1, 0), (4, 4), (4, 5), (4, -1)],
    )
    def test_invalid_parameters_raise(self, size: int, overlap: int) -> None:
        with pytest.raises(ValueError):
            list(_windows(_items(10), size, overlap))


class TestFallbackSummary:
    def test_no_findings(self) -> None:
        assert (
            _fallback_summary(0, 0, [1, 2, 3])
            == "No contradictions found across 3 page(s)."
        )

    def test_no_findings_zero_pages(self) -> None:
        assert _fallback_summary(0, 0, []) == "No contradictions found across 0 page(s)."

    def test_single_contradiction_singular(self) -> None:
        assert (
            _fallback_summary(1, 0, [1]) == "Found 1 contradiction. Pages examined: 1."
        )

    def test_multiple_contradictions_plural(self) -> None:
        assert (
            _fallback_summary(2, 0, [1, 2])
            == "Found 2 contradictions. Pages examined: 2."
        )

    def test_single_tension_singular(self) -> None:
        assert (
            _fallback_summary(0, 1, [1]) == "Found 1 possible tension. Pages examined: 1."
        )

    def test_both_kinds_combined(self) -> None:
        assert (
            _fallback_summary(1, 2, [1, 2, 3])
            == "Found 1 contradiction. Found 2 possible tensions. Pages examined: 3."
        )
