"""Tests for the pure _normalise_label helper in the ledger figure tracker.

Note: this normaliser's noise class is ``[:\\-—\\s]+`` — narrower than the contradiction
ledger's ``_normalise_subject`` (commas/periods are *kept* here, and articles are not stripped).
"""

from __future__ import annotations

import pytest

from stirling.agents.ledger.validators.figures import _normalise_label


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("Total Assets", "total assets"),  # lowercased
        ("Revenue: Net", "revenue net"),  # colon + space collapse
        ("A—B-C", "a b c"),  # em-dash and hyphen collapse
        ("Multi   Space", "multi space"),  # whitespace run collapses
        ("Keep,Comma.Dot", "keep,comma.dot"),  # commas/periods are NOT noise here
        ("THE TOTAL", "the total"),  # articles are NOT stripped here
        ("  Padded  ", "padded"),  # outer whitespace trimmed
        ("", ""),
    ],
)
def test_normalise_label(raw: str, expected: str) -> None:
    assert _normalise_label(raw) == expected
