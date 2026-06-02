"""Tests for runtime.build_model_settings.

Pure helper that builds a pydantic-ai ModelSettings dict from an optional max-token budget. The
distinction that matters: it uses ``is not None`` (not truthiness), so an explicit 0 is included
while ``None`` omits the key entirely (letting the provider default apply).
"""

from __future__ import annotations

from stirling.services.runtime import build_model_settings


def test_includes_max_tokens_when_provided() -> None:
    assert build_model_settings(100) == {"max_tokens": 100}


def test_omits_max_tokens_entirely_when_none() -> None:
    # None -> empty dict, so the provider's own default budget applies.
    assert build_model_settings(None) == {}


def test_zero_is_included_not_treated_as_absent() -> None:
    # `is not None` (not truthiness) means an explicit 0 is set, not dropped.
    assert build_model_settings(0) == {"max_tokens": 0}
