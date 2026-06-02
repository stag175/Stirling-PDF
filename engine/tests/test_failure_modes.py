"""
Engine HTTP failure-mode contract tests (pins engine/CONTRACT.md).

These turn the documented failure-mode taxonomy into executable assertions, using
FastAPI's TestClient with dependency overrides so no real model/provider is touched:

  * malformed request body            -> 422 (Pydantic validation)
  * invalid query parameter           -> 400 (the math-auditor `tolerance` guard)
  * agent failure on a unary route    -> 500 (there is NO global exception handler)
  * agent failure on the stream route -> 200 + an in-band `error` NDJSON frame

Following the established route-test pattern (see tests/ledger/test_routes.py and
tests/test_documents_routes.py), every ``app.state``-backed dependency the route uses
is overridden, so the tests don't depend on the FastAPI lifespan having run.

If a future change adds a global exception handler (the improvement flagged in
CONTRACT.md), the 500 test is the one to update — deliberately, with the new mapping.
"""

from __future__ import annotations

import json
from collections.abc import Iterator
from typing import Any

import pytest
from fastapi.testclient import TestClient

from stirling.api import app
from stirling.api.dependencies import get_math_auditor_agent, get_orchestrator_agent
from stirling.config import AppSettings, load_settings


class _StubSettings:
    def __call__(self) -> AppSettings:
        from conftest import build_app_settings

        return build_app_settings()


class _BenignMathAuditorAgent:
    """Default stand-in; its methods are never reached on the validation/guard paths."""

    async def examine(self, manifest: Any) -> Any:
        return None

    async def audit(self, evidence: Any, tolerance: Any = None) -> Any:
        return None


class _BenignOrchestratorAgent:
    async def handle(self, request: Any) -> Any:
        return None


class _RaisingMathAuditorAgent:
    """Simulates a provider/model failure inside the handler."""

    async def examine(self, manifest: Any) -> Any:
        raise RuntimeError("simulated model provider failure")


class _RaisingOrchestratorAgent:
    async def handle(self, request: Any) -> Any:
        raise RuntimeError("simulated orchestrator failure")


@pytest.fixture
def client() -> Iterator[TestClient]:
    # Snapshot/restore the whole override map rather than popping our own keys: other test
    # modules (e.g. test_stirling_api.py) register overrides at *module* level, and a blind
    # pop would delete theirs and break them when they run after us.
    saved = dict(app.dependency_overrides)
    app.dependency_overrides[load_settings] = _StubSettings()
    app.dependency_overrides[get_math_auditor_agent] = lambda: _BenignMathAuditorAgent()
    app.dependency_overrides[get_orchestrator_agent] = lambda: _BenignOrchestratorAgent()
    try:
        # raise_server_exceptions=False so an unhandled error yields a 500 response
        # (mirroring production) instead of propagating into the test.
        yield TestClient(app, raise_server_exceptions=False)
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(saved)


def _evidence_body(**overrides: object) -> dict[str, object]:
    base: dict[str, object] = {
        "sessionId": "s",
        "folios": [{"page": 0, "text": "Total: 120"}],
        "round": 2,
        "finalRound": False,
    }
    return {**base, **overrides}


# --------------------------------------------------------------------------------------
# 1. Malformed body -> 422 (FastAPI/Pydantic validation, automatic on every typed route).
# --------------------------------------------------------------------------------------
def test_malformed_body_returns_422(client: TestClient) -> None:
    # pageCount must be an int; a non-numeric string fails validation before the agent runs.
    body = {"sessionId": "s", "pageCount": "not-an-int", "folioTypes": ["text"], "round": 1}
    resp = client.post("/api/v1/ai/math-auditor-agent/examine", json=body)
    assert resp.status_code == 422
    assert "detail" in resp.json()


# --------------------------------------------------------------------------------------
# 2. Invalid query parameter -> 400 (the lone hand-written HTTP error mapping).
# --------------------------------------------------------------------------------------
def test_negative_tolerance_returns_400(client: TestClient) -> None:
    resp = client.post("/api/v1/ai/math-auditor-agent/deliberate?tolerance=-1", json=_evidence_body())
    assert resp.status_code == 400
    assert "non-negative" in resp.json()["detail"]


def test_unparseable_tolerance_returns_400(client: TestClient) -> None:
    resp = client.post("/api/v1/ai/math-auditor-agent/deliberate?tolerance=notanumber", json=_evidence_body())
    assert resp.status_code == 400


# --------------------------------------------------------------------------------------
# 3. Agent failure on a unary route -> 500 (no global exception handler).
# --------------------------------------------------------------------------------------
def test_unary_agent_failure_returns_500(client: TestClient) -> None:
    app.dependency_overrides[get_math_auditor_agent] = lambda: _RaisingMathAuditorAgent()
    body = {"sessionId": "s", "pageCount": 1, "folioTypes": ["text"], "round": 1}
    resp = client.post("/api/v1/ai/math-auditor-agent/examine", json=body)
    # CONTRACT.md failure mode 3: with no global handler, a raised agent error collapses to 500.
    assert resp.status_code == 500


# --------------------------------------------------------------------------------------
# 4. Agent failure on the streaming route -> 200 + an in-band error frame.
# --------------------------------------------------------------------------------------
def test_streaming_orchestrator_failure_yields_error_frame(client: TestClient) -> None:
    app.dependency_overrides[get_orchestrator_agent] = lambda: _RaisingOrchestratorAgent()
    resp = client.post("/api/v1/orchestrator", json={"userMessage": "hi"})

    # Streaming commits HTTP 200 before the agent runs, so the failure cannot change the
    # status code — it surfaces as an NDJSON {"event": "error", ...} frame instead.
    assert resp.status_code == 200
    frames = [json.loads(line) for line in resp.text.splitlines() if line.strip()]
    error_frames = [f for f in frames if f.get("event") == "error"]
    assert error_frames, f"expected an error frame, got events {[f.get('event') for f in frames]}"
    assert "simulated orchestrator failure" in error_frames[0]["message"]
