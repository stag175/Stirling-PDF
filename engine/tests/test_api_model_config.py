"""Tests for the shared ApiModel cross-boundary serialization contract.

Every contract model crossing the Java<->Python boundary inherits ApiModel, whose model_config sets:
camelCase aliases (to_camel), extra='forbid', validate_by_name + validate_by_alias, and
serialize_by_alias. This pins that shared contract via a tiny representative subclass so a config
regression (e.g. dropping serialize_by_alias or extra='forbid') is caught centrally rather than
silently breaking the wire with Java.
"""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from stirling.models import ApiModel


class _Sample(ApiModel):
    file_name: str
    page_count: int


def test_serializes_with_camelcase_aliases_by_default() -> None:
    dumped = _Sample(file_name="report.pdf", page_count=3).model_dump()
    assert dumped == {"fileName": "report.pdf", "pageCount": 3}


def test_json_serialization_uses_camelcase() -> None:
    js = _Sample(file_name="x", page_count=1).model_dump_json()
    assert '"fileName"' in js
    assert '"pageCount"' in js
    assert "file_name" not in js


def test_accepts_camelcase_input_by_alias() -> None:
    s = _Sample.model_validate({"fileName": "x", "pageCount": 2})
    assert s.file_name == "x"
    assert s.page_count == 2


def test_accepts_snakecase_input_by_name() -> None:
    s = _Sample.model_validate({"file_name": "y", "page_count": 5})
    assert s.file_name == "y"
    assert s.page_count == 5


def test_rejects_unknown_fields() -> None:
    with pytest.raises(ValidationError):
        _Sample.model_validate({"fileName": "x", "pageCount": 1, "surprise": True})


def test_round_trips_through_dump_and_validate() -> None:
    original = _Sample(file_name="a.pdf", page_count=9)
    restored = _Sample.model_validate(original.model_dump())
    assert restored == original


def test_python_attributes_remain_snake_case() -> None:
    s = _Sample(file_name="z", page_count=0)
    # Attribute access is snake_case regardless of the camelCase wire alias.
    assert s.file_name == "z"
    assert s.page_count == 0
