"""Tests for the pure _anchor_text_for helper in the pdf_review agent."""

from __future__ import annotations

import pytest

from stirling.agents.pdf_review import _anchor_text_for
from stirling.contracts import Discrepancy, DiscrepancyKind, Severity

_KIND = next(iter(DiscrepancyKind))
_SEVERITY = next(iter(Severity))


def _disc(stated: str = "", context: str = "") -> Discrepancy:
    return Discrepancy(
        page=1,
        kind=_KIND,
        severity=_SEVERITY,
        description="d",
        stated=stated,
        expected="e",
        context=context,
    )


@pytest.mark.parametrize(
    ("stated", "context", "expected"),
    [
        ("value", "ctx", "value"),  # stated wins
        ("  spaced  ", "ctx", "spaced"),  # stated stripped
        ("", "ctx", "ctx"),  # falls back to context
        ("   ", "ctx", "ctx"),  # blank stated -> context
        ("", "  trimmed  ", "trimmed"),  # context stripped
        ("", "", None),  # nothing -> None
        ("   ", "   ", None),  # both blank -> None
    ],
)
def test_anchor_text_for(stated: str, context: str, expected: str | None) -> None:
    assert _anchor_text_for(_disc(stated=stated, context=context)) == expected
