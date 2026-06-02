"""Tests for validate_structured_output_support in stirling.services.runtime."""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any

import pytest

from stirling.services.runtime import validate_structured_output_support


def _model(*, supports: bool) -> Any:
    # The function only reads model.profile.supports_json_schema_output, so a
    # SimpleNamespace stand-in (typed Any) is sufficient and avoids importing the
    # pydantic-ai Model type just for the annotation.
    return SimpleNamespace(profile=SimpleNamespace(supports_json_schema_output=supports))


def test_supporting_model_passes() -> None:
    # no exception -> returns None
    assert validate_structured_output_support(_model(supports=True), "gpt-4o") is None


def test_test_model_name_bypasses_the_check() -> None:
    # the "test" stand-in is allowed even though it doesn't advertise json-schema output
    assert validate_structured_output_support(_model(supports=False), "test") is None


def test_non_supporting_model_raises_with_name() -> None:
    with pytest.raises(ValueError, match="bad-model"):
        validate_structured_output_support(_model(supports=False), "bad-model")
