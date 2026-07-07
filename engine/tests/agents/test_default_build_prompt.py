"""Tests for the default extraction-prompt builder in agents.shared.chunked_mapper."""

from __future__ import annotations

from stirling.agents.shared.chunked_mapper import _default_build_prompt


def test_prompt_shape_query_then_content() -> None:
    assert (
        _default_build_prompt(content="body text", query="what is X?")
        == "User question:\nwhat is X?\n\nContent:\nbody text"
    )


def test_empty_inputs() -> None:
    assert _default_build_prompt(content="", query="") == "User question:\n\n\nContent:\n"
