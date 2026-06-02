"""
Engine service-token auth (roadmap D3 — harden the Java<->engine hop).

ApiKeyAuthMiddleware enforces STIRLING_ENGINE_API_KEY when set: requests must carry
`X-API-Key: <key>` or `Authorization: Bearer <key>`, except the exempt liveness/docs paths.
When the key is blank (default), auth is disabled so loopback deployments are unaffected.

The expected key is read per-request from app.state.settings, so these tests set it directly
(save/restore) rather than running the full lifespan.
"""

from __future__ import annotations

from collections.abc import Iterator
from typing import Any

import pytest
from fastapi.testclient import TestClient

from stirling.api import app
from stirling.config import load_settings

_EXAMINE = "/api/v1/ai/math-auditor-agent/examine"
_BODY: dict[str, object] = {"sessionId": "s", "pageCount": 1, "folioTypes": ["text"], "round": 1}
_UNSET = object()


def _settings_with_key(key: str) -> Any:
    from conftest import build_app_settings

    return build_app_settings().model_copy(update={"engine_api_key": key})


@pytest.fixture
def state_guard() -> Iterator[None]:
    # Snapshot app.dependency_overrides and app.state.settings; restore on teardown so this
    # module never leaks global state into the other route-test modules.
    saved_overrides = dict(app.dependency_overrides)
    saved_settings = getattr(app.state, "settings", _UNSET)
    try:
        yield
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(saved_overrides)
        if saved_settings is _UNSET:
            try:
                delattr(app.state, "settings")
            except AttributeError:
                pass
        else:
            app.state.settings = saved_settings


def test_auth_disabled_when_key_blank(state_guard: None) -> None:
    app.state.settings = _settings_with_key("")
    client = TestClient(app, raise_server_exceptions=False)
    resp = client.post(_EXAMINE, json=_BODY)
    assert resp.status_code != 401  # disabled -> request proceeds past the middleware


def test_missing_key_rejected_with_401(state_guard: None) -> None:
    app.state.settings = _settings_with_key("secret")
    client = TestClient(app, raise_server_exceptions=False)
    resp = client.post(_EXAMINE, json=_BODY)
    assert resp.status_code == 401
    assert resp.json()["detail"] == "Invalid or missing API key"


def test_wrong_key_rejected_with_401(state_guard: None) -> None:
    app.state.settings = _settings_with_key("secret")
    client = TestClient(app, raise_server_exceptions=False)
    resp = client.post(_EXAMINE, json=_BODY, headers={"X-API-Key": "nope"})
    assert resp.status_code == 401


def test_correct_x_api_key_passes_middleware(state_guard: None) -> None:
    app.state.settings = _settings_with_key("secret")
    client = TestClient(app, raise_server_exceptions=False)
    resp = client.post(_EXAMINE, json=_BODY, headers={"X-API-Key": "secret"})
    # Past the middleware: not a 401 (it will 500 downstream because no agent/lifespan here).
    assert resp.status_code != 401


def test_correct_bearer_token_passes_middleware(state_guard: None) -> None:
    app.state.settings = _settings_with_key("secret")
    client = TestClient(app, raise_server_exceptions=False)
    resp = client.post(_EXAMINE, json=_BODY, headers={"Authorization": "Bearer secret"})
    assert resp.status_code != 401


def test_health_is_exempt_from_auth(state_guard: None) -> None:
    app.state.settings = _settings_with_key("secret")
    app.dependency_overrides[load_settings] = lambda: _settings_with_key("secret")
    client = TestClient(app, raise_server_exceptions=False)
    resp = client.get("/health")
    assert resp.status_code == 200  # liveness must not require the token
