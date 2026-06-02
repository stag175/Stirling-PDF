"""Tests for the pure auth helpers on ApiKeyAuthMiddleware.

`_is_exempt` decides which paths bypass the shared-service-token check (liveness/docs only) — a
security-relevant predicate, so it must NOT exempt look-alike paths like ``/healthz``. `_presented_key`
extracts the caller's key from either ``X-API-Key`` or ``Authorization: Bearer <key>``. Both are
pure over their inputs and exercised without standing up the ASGI stack.
"""

from __future__ import annotations

import pytest
from starlette.requests import Request

from stirling.api.middleware import ApiKeyAuthMiddleware


def _request(headers: dict[str, str]) -> Request:
    raw = [(k.lower().encode(), v.encode()) for k, v in headers.items()]
    return Request({"type": "http", "headers": raw})


# _is_exempt only reads the class-level _EXEMPT_PREFIXES, so a bare instance suffices.
_mw = object.__new__(ApiKeyAuthMiddleware)


class TestIsExempt:
    @pytest.mark.parametrize(
        "path",
        ["/health", "/health/live", "/docs", "/docs/", "/redoc", "/openapi.json"],
    )
    def test_exempt_paths(self, path: str) -> None:
        assert _mw._is_exempt(path) is True

    @pytest.mark.parametrize(
        "path",
        [
            "/api/v1/orchestrator",
            "/healthz",  # look-alike: NOT /health and not /health/...
            "/health-check",  # look-alike
            "/docsy",  # look-alike
            "/",
            "",
        ],
    )
    def test_non_exempt_paths(self, path: str) -> None:
        assert _mw._is_exempt(path) is False


class TestPresentedKey:
    def test_reads_x_api_key_header(self) -> None:
        req = _request({"X-API-Key": "secret-123"})
        assert ApiKeyAuthMiddleware._presented_key(req) == "secret-123"

    def test_reads_bearer_authorization(self) -> None:
        req = _request({"Authorization": "Bearer tok-abc"})
        assert ApiKeyAuthMiddleware._presented_key(req) == "tok-abc"

    def test_x_api_key_takes_precedence_over_bearer(self) -> None:
        req = _request({"X-API-Key": "from-header", "Authorization": "Bearer from-bearer"})
        assert ApiKeyAuthMiddleware._presented_key(req) == "from-header"

    def test_non_bearer_authorization_is_ignored(self) -> None:
        req = _request({"Authorization": "Basic dXNlcjpwYXNz"})
        assert ApiKeyAuthMiddleware._presented_key(req) is None

    def test_no_credentials_returns_none(self) -> None:
        assert ApiKeyAuthMiddleware._presented_key(_request({})) is None
