"""Tests for the pure subject-normaliser used by the contradiction claim ledger."""

from __future__ import annotations

import pytest

from stirling.agents.contradiction.validators.ledger import _normalise_subject


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("The Net Revenue", "net revenue"),  # leading article stripped + lowercased
        ("Total Assets", "total assets"),
        ("THE TOTAL", "total"),  # case-insensitive article match
        ("A Quick Brown Fox", "quick brown fox"),
        ("An Apple a Day", "apple day"),  # "an" and standalone "a" stripped, "apple"/"day" kept
        ("  Cash   Flow  ", "cash flow"),  # whitespace collapsed + trimmed
        ("Revenue, Q3", "revenue q3"),  # punctuation collapsed to a single space
        ("Net—Income;Loss", "net income loss"),  # em-dash + semicolon are noise
        ("", ""),
        ("   ", ""),
        ("the a an this that these those", ""),  # all-articles collapse to empty
    ],
)
def test_normalise_subject(raw: str, expected: str) -> None:
    assert _normalise_subject(raw) == expected


def test_articles_inside_words_are_not_stripped() -> None:
    # \b boundaries mean "a"/"an"/"the" embedded in a word are preserved.
    assert _normalise_subject("Theatre Cannot Thearea") == "theatre cannot thearea"
