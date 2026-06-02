"""Tests for ContradictionDetector._empty_report.

The contradictions-free report the detector returns from its "no claims" / "no pages" early
branches. Its documented invariant is that it is ALWAYS clean=True with an empty contradictions
list, echoing back the supplied summary and pages_examined unchanged. Exercised directly on the
class — it is a @staticmethod, so no detector/agent/model construction is required.
"""

from __future__ import annotations

from stirling.agents.contradiction.detector import ContradictionDetector


def test_is_always_clean_with_no_contradictions() -> None:
    report = ContradictionDetector._empty_report(
        summary="No claims found.", pages_examined=[1, 2, 3]
    )

    assert report.clean is True
    assert report.contradictions == []


def test_summary_and_pages_are_echoed_unchanged() -> None:
    report = ContradictionDetector._empty_report(
        summary="No auditable pages.", pages_examined=[7, 9]
    )

    assert report.summary == "No auditable pages."
    assert report.pages_examined == [7, 9]


def test_empty_pages_list_is_preserved() -> None:
    report = ContradictionDetector._empty_report(summary="empty", pages_examined=[])

    assert report.pages_examined == []
    assert report.clean is True


def test_pages_examined_order_and_duplicates_preserved() -> None:
    # Multi-file audits can legitimately repeat page numbers; the helper must not sort/dedupe.
    report = ContradictionDetector._empty_report(summary="s", pages_examined=[5, 5, 1])

    assert report.pages_examined == [5, 5, 1]
