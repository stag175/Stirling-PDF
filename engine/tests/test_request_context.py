"""
Request-context observability tests (roadmap G1 + G2).

G2 (log correlation): RequestContextMiddleware resolves/echoes an X-Request-Id and exposes it via
``current_request_id``; RequestIdLogFilter injects it into log records.
G1 (distributed tracing): ``extract_trace_context`` continues an upstream W3C trace.
"""

from __future__ import annotations

import logging
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from opentelemetry import trace

from stirling.api import app
from stirling.api.middleware import extract_trace_context
from stirling.config import load_settings
from stirling.context import current_request_id
from stirling.logging import RequestIdLogFilter


@pytest.fixture
def client() -> Iterator[TestClient]:
    from conftest import build_app_settings

    saved = dict(app.dependency_overrides)
    app.dependency_overrides[load_settings] = build_app_settings
    try:
        yield TestClient(app, raise_server_exceptions=False)
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(saved)


# --------------------------------------------------------------------------------------
# G2 — correlation id
# --------------------------------------------------------------------------------------
def test_generates_request_id_when_absent(client: TestClient) -> None:
    resp = client.get("/health")
    assert resp.status_code == 200
    request_id = resp.headers.get("X-Request-Id")
    assert request_id is not None and len(request_id) >= 8


def test_echoes_incoming_request_id(client: TestClient) -> None:
    resp = client.get("/health", headers={"X-Request-Id": "abc-123"})
    assert resp.headers.get("X-Request-Id") == "abc-123"


def test_log_filter_injects_active_request_id() -> None:
    log_filter = RequestIdLogFilter()
    record = logging.LogRecord("n", logging.INFO, "p", 1, "msg", None, None)
    token = current_request_id.set("rid-xyz")
    try:
        assert log_filter.filter(record) is True
        assert record.request_id == "rid-xyz"  # type: ignore[attr-defined]
    finally:
        current_request_id.reset(token)


def test_log_filter_defaults_to_dash_without_request_id() -> None:
    log_filter = RequestIdLogFilter()
    record = logging.LogRecord("n", logging.INFO, "p", 1, "msg", None, None)
    assert log_filter.filter(record) is True
    assert record.request_id == "-"  # type: ignore[attr-defined]


# --------------------------------------------------------------------------------------
# G1 — W3C TraceContext propagation
# --------------------------------------------------------------------------------------
def test_extracts_upstream_w3c_traceparent() -> None:
    trace_id = "0af7651916cd43dd8448eb211c80319c"
    span_id = "b7ad6b7169203331"
    ctx = extract_trace_context({"traceparent": f"00-{trace_id}-{span_id}-01"})
    span_context = trace.get_current_span(ctx).get_span_context()
    assert format(span_context.trace_id, "032x") == trace_id
    assert format(span_context.span_id, "016x") == span_id


def test_missing_traceparent_yields_no_upstream_span() -> None:
    ctx = extract_trace_context({})
    span_context = trace.get_current_span(ctx).get_span_context()
    assert not span_context.is_valid  # engine starts a fresh trace when none is propagated
