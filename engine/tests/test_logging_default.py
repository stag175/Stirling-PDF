"""Tests for the JSON-serialisation fallback _default in stirling.logging."""

from __future__ import annotations

from decimal import Decimal

from stirling.contracts import ConversationMessage
from stirling.logging import _default


def test_basemodel_is_dumped_to_dict() -> None:
    msg = ConversationMessage(role="user", content="hi")
    assert _default(msg) == {"role": "user", "content": "hi"}


def test_decimal_falls_back_to_str() -> None:
    assert _default(Decimal("1.50")) == "1.50"


def test_set_falls_back_to_str() -> None:
    assert _default({1}) == "{1}"


def test_arbitrary_object_falls_back_to_str() -> None:
    class Thing:
        def __str__(self) -> str:
            return "a-thing"

    assert _default(Thing()) == "a-thing"
