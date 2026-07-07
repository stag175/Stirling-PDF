from __future__ import annotations

import json
from types import SimpleNamespace
from typing import Any
from unittest.mock import MagicMock

from conftest import build_app_settings

from stirling.services import tracking
from stirling.services.tracking import (
    LRUSet,
    PostHogSpanProcessor,
    _extract_user_message,
    _parse_json_attr,
    _transform_output_choices,
    setup_posthog_tracking,
)


# --------------------------------------------------------------------------------------
# Telemetry kill switch (roadmap G3 — "single privacy-first kill switch / opt-out").
#
# setup_posthog_tracking is the engine's PostHog opt-out gate: with STIRLING_POSTHOG_ENABLED
# false (or no API key) it must return None so that NO PostHog client is constructed and NO
# span processor is registered — i.e. nothing is ever captured or sent. These tests pin that
# privacy contract against regression.
# --------------------------------------------------------------------------------------
def test_kill_switch_disabled_returns_none() -> None:
    settings = build_app_settings()  # posthog_enabled=False by default
    assert settings.posthog_enabled is False
    assert setup_posthog_tracking(settings) is None


def test_kill_switch_enabled_but_no_api_key_returns_none() -> None:
    settings = build_app_settings().model_copy(update={"posthog_enabled": True, "posthog_api_key": ""})
    assert setup_posthog_tracking(settings) is None


def test_tracking_enabled_with_key_builds_provider_without_network(monkeypatch: Any) -> None:
    # Patch the client so enabling tracking never opens a network connection / consumer thread.
    fake_client: Any = MagicMock()
    monkeypatch.setattr(tracking, "PostHogClient", lambda **kwargs: fake_client)
    settings = build_app_settings().model_copy(update={"posthog_enabled": True, "posthog_api_key": "phc_test"})

    provider = setup_posthog_tracking(settings)

    assert provider is not None
    provider.shutdown()  # cascades to the processor → fake client; verifies wiring is intact
    fake_client.shutdown.assert_called_once()


# --------------------------------------------------------------------------------------
# Pure span-translation helpers.
# --------------------------------------------------------------------------------------
def test_parse_json_attr_handles_valid_missing_and_invalid() -> None:
    assert _parse_json_attr({"k": '{"a": 1}'}, "k") == {"a": 1}
    assert _parse_json_attr({}, "missing") is None
    assert _parse_json_attr({"k": "not json"}, "k") is None


def test_transform_output_choices_maps_parts_to_tool_calls() -> None:
    choices = [{"role": "assistant", "parts": [{"type": "tool_call", "id": "1", "name": "split_pdf"}]}]
    out = _transform_output_choices(choices)
    assert out[0]["tool_calls"] == [{"type": "function", "id": "1", "function": {"name": "split_pdf"}}]
    # The original parts list is moved under "content".
    assert out[0]["content"] == [{"type": "tool_call", "id": "1", "name": "split_pdf"}]
    # A choice with no "parts" is passed through untouched.
    assert _transform_output_choices([{"role": "user"}]) == [{"role": "user"}]


def test_extract_user_message_returns_last_user_text() -> None:
    attrs = {
        tracking.GEN_AI_INPUT_MESSAGES: json.dumps(
            [
                {"role": "system", "parts": [{"type": "text", "content": "sys"}]},
                {"role": "user", "parts": [{"type": "text", "content": "hello"}]},
            ]
        )
    }
    assert _extract_user_message(attrs) == "hello"
    assert _extract_user_message({}) == ""


def test_lru_set_evicts_oldest_entry() -> None:
    s = LRUSet(max_size=2)
    s.add("a")
    s.add("b")
    assert "a" in s and "b" in s
    s.add("c")  # exceeds max_size → oldest ("a") evicted
    assert "a" not in s
    assert "b" in s and "c" in s


# --------------------------------------------------------------------------------------
# PostHogSpanProcessor.on_end behaviour (driven with lightweight duck-typed fake spans).
# --------------------------------------------------------------------------------------
def _fake_span(
    attrs: dict[Any, Any],
    *,
    trace_id: int = 0x1234,
    span_id: int = 0xABCD,
    parent_span_id: int | None = None,
    start: int | None = 1_000_000_000,
    end: int | None = 2_000_000_000,
) -> Any:
    context = SimpleNamespace(trace_id=trace_id, span_id=span_id)
    parent = SimpleNamespace(span_id=parent_span_id) if parent_span_id is not None else None
    return SimpleNamespace(attributes=attrs, context=context, parent=parent, start_time=start, end_time=end)


def test_on_end_ignores_non_chat_spans() -> None:
    client: Any = MagicMock()
    proc = PostHogSpanProcessor(client)
    proc.on_start(_fake_span({}))  # no-op, must not raise
    proc.on_end(_fake_span({tracking.GEN_AI_OPERATION_NAME: "embeddings"}))
    client.capture.assert_not_called()


def test_on_end_captures_generation_and_first_trace_event() -> None:
    client: Any = MagicMock()
    proc = PostHogSpanProcessor(client)
    attrs = {
        tracking.GEN_AI_OPERATION_NAME: tracking.GenAiOperationNameValues.CHAT.value,
        tracking.GEN_AI_SYSTEM: "openai",
        tracking.GEN_AI_RESPONSE_MODEL: "gpt-x",
        tracking.GEN_AI_USAGE_INPUT_TOKENS: 10,
        tracking.GEN_AI_USAGE_OUTPUT_TOKENS: 5,
    }
    proc.on_end(_fake_span(attrs))
    events = [c.kwargs["event"] for c in client.capture.call_args_list]
    assert "$ai_generation" in events
    assert "$ai_trace" in events  # first span for a trace id also emits an $ai_trace event


def test_on_end_emits_trace_event_only_once_per_trace_id() -> None:
    client: Any = MagicMock()
    proc = PostHogSpanProcessor(client)
    attrs = {
        tracking.GEN_AI_OPERATION_NAME: tracking.GenAiOperationNameValues.CHAT.value,
        tracking.GEN_AI_SYSTEM: "openai",
    }
    proc.on_end(_fake_span(attrs, trace_id=0x55))
    proc.on_end(_fake_span(attrs, trace_id=0x55))  # same trace id

    trace_events = [c for c in client.capture.call_args_list if c.kwargs.get("event") == "$ai_trace"]
    gen_events = [c for c in client.capture.call_args_list if c.kwargs.get("event") == "$ai_generation"]
    assert len(trace_events) == 1  # deduped by the LRUSet of seen trace ids
    assert len(gen_events) == 2  # but every span still emits its own generation event


def test_on_end_builds_rich_generation_properties() -> None:
    client: Any = MagicMock()
    proc = PostHogSpanProcessor(client)
    attrs = {
        tracking.GEN_AI_OPERATION_NAME: tracking.GenAiOperationNameValues.CHAT.value,
        tracking.GEN_AI_SYSTEM: "anthropic",
        tracking.GEN_AI_REQUEST_MODEL: "claude",
        tracking.GEN_AI_REQUEST_TEMPERATURE: 0.7,
        tracking.GEN_AI_REQUEST_MAX_TOKENS: 1024,
        tracking.GEN_AI_INPUT_MESSAGES: json.dumps([{"role": "user", "parts": [{"type": "text", "content": "hi"}]}]),
        tracking.GEN_AI_OUTPUT_MESSAGES: json.dumps(
            [{"role": "assistant", "parts": [{"type": "tool_call", "id": "1", "name": "merge"}]}]
        ),
        tracking.GEN_AI_TOOL_DEFINITIONS: json.dumps([{"name": "merge"}]),
        tracking.SERVER_ADDRESS: "api.anthropic.com",
        tracking.SERVER_PORT: 443,
    }
    proc.on_end(_fake_span(attrs, parent_span_id=0x999))

    gen = next(c for c in client.capture.call_args_list if c.kwargs["event"] == "$ai_generation")
    props = gen.kwargs["properties"]
    assert props["$ai_provider"] == "anthropic"
    assert props["$ai_model"] == "claude"
    assert props["$ai_model_parameters"] == {"temperature": 0.7, "max_tokens": 1024}
    assert props["$ai_tools"] == [{"name": "merge"}]
    assert props["$ai_base_url"] == "api.anthropic.com:443"
    assert props["$ai_parent_id"] == format(0x999, "016x")
    assert props["$ai_output_choices"][0]["tool_calls"][0]["function"]["name"] == "merge"


def test_processor_force_flush_and_shutdown_delegate_to_client() -> None:
    client: Any = MagicMock()
    proc = PostHogSpanProcessor(client)
    assert proc.force_flush() is True
    client.flush.assert_called_once()
    proc.shutdown()
    client.shutdown.assert_called_once()
