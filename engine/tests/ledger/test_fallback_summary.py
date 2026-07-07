"""Tests for MathAuditorAgent._fallback_summary.

The deterministic, model-free summary string the math-ledger auditor falls back to. Pure: it
assembles space-joined segments with correct singular/plural wording, an all-clear sentence when
there are zero errors and zero warnings, and a 1-indexed list of pages that could not be audited.
Distinct from contradiction.detector._fallback_summary (different signature/wording). Exercised
directly on the class — it is a @staticmethod, so no agent/model setup is needed.
"""

from __future__ import annotations

from stirling.agents.ledger.agent import MathAuditorAgent

_summary = MathAuditorAgent._fallback_summary


def test_all_clear_when_no_errors_or_warnings() -> None:
    assert _summary(0, 0, [0, 1, 2], []) == "No mathematical errors found across 3 pages."


def test_single_error_is_singular() -> None:
    assert _summary(1, 0, [0], []) == "Found 1 error."


def test_multiple_errors_are_plural() -> None:
    assert _summary(2, 0, [0, 1], []) == "Found 2 errors."


def test_single_warning_only_skips_the_all_clear_and_error_segments() -> None:
    # warning_count != 0 -> not the all-clear branch; error_count 0 is falsy -> no error segment.
    assert _summary(0, 1, [0], []) == "Found 1 warning."


def test_errors_and_warnings_are_space_joined() -> None:
    assert _summary(2, 3, [0, 1], []) == "Found 2 errors. Found 3 warnings."


def test_unauditable_pages_are_appended_one_indexed() -> None:
    assert _summary(0, 0, [0, 1], [2, 4]) == (
        "No mathematical errors found across 2 pages. "
        "Pages 3, 5 could not be audited (OCR unavailable)."
    )


def test_errors_plus_unauditable_combine() -> None:
    assert _summary(1, 0, [0], [0]) == (
        "Found 1 error. Pages 1 could not be audited (OCR unavailable)."
    )
