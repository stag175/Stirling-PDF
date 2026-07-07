"""Tests for the NDJSON frame serializer in the orchestrator streaming route.

Covers the payload-free frames (`_ErrorFrame`, `_HeartbeatFrame`); the `_ProgressFrame`/`_ResultFrame`
arms wrap `model_dump(mode="json")` of their payloads and are exercised by the route-level tests.
"""

from __future__ import annotations

import json

from stirling.api.routes.orchestrator import (
    _ErrorFrame,
    _HeartbeatFrame,
    _serialize_frame,
)


def test_heartbeat_frame_is_ndjson_line() -> None:
    raw = _serialize_frame(_HeartbeatFrame())
    assert isinstance(raw, bytes)
    assert raw.endswith(b"\n")
    assert json.loads(raw.decode("utf-8")) == {"event": "heartbeat"}


def test_error_frame_carries_message() -> None:
    raw = _serialize_frame(_ErrorFrame(message="boom"))
    assert raw.endswith(b"\n")
    assert json.loads(raw.decode("utf-8")) == {"event": "error", "message": "boom"}


def test_error_message_is_json_escaped() -> None:
    raw = _serialize_frame(_ErrorFrame(message='he said "hi"\nbye'))
    # round-trips through JSON without breaking the NDJSON line
    decoded = json.loads(raw.decode("utf-8"))
    assert decoded == {"event": "error", "message": 'he said "hi"\nbye'}
    # exactly one trailing newline (the NDJSON delimiter), embedded newline is escaped
    assert raw.count(b"\n") == 1
