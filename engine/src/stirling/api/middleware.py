from __future__ import annotations

import hmac
from collections.abc import Mapping
from uuid import uuid4

from opentelemetry.context import Context, attach, detach
from opentelemetry.propagate import extract
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from stirling.context import current_request_id
from stirling.services.tracking import current_user_id

_USER_ID_HEADER = "X-User-Id"
_API_KEY_HEADER = "X-API-Key"
_BEARER_PREFIX = "Bearer "
_REQUEST_ID_HEADER = "X-Request-Id"


def extract_trace_context(headers: Mapping[str, str]) -> Context:
    """Extract a W3C TraceContext (``traceparent``/``tracestate``) from request headers.

    Uses OpenTelemetry's globally-configured propagator so that engine spans become children of
    the trace started upstream (frontend -> Java -> engine), per roadmap G1. Returns an OTel
    Context to be ``attach``-ed for the duration of the request.
    """
    return extract(dict(headers))


class RequestContextMiddleware(BaseHTTPMiddleware):
    """Per-request observability context (roadmap G1 + G2).

    * **G2 (log correlation):** resolves a correlation id from the inbound ``X-Request-Id`` header
      (or generates one), exposes it via :data:`current_request_id` so every log line carries it,
      and echoes it back in the ``X-Request-Id`` response header.
    * **G1 (distributed tracing):** extracts the W3C TraceContext from the request headers and
      attaches it, so spans created while handling the request continue the upstream trace.

    Installed as the outermost middleware so the id/trace are set before auth and any logging.
    """

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        incoming = request.headers.get(_REQUEST_ID_HEADER)
        request_id = incoming if incoming else uuid4().hex
        rid_token = current_request_id.set(request_id)
        otel_token = attach(extract_trace_context(dict(request.headers)))
        try:
            response = await call_next(request)
            response.headers[_REQUEST_ID_HEADER] = request_id
            return response
        finally:
            detach(otel_token)
            current_request_id.reset(rid_token)


class UserIdMiddleware(BaseHTTPMiddleware):
    """Extract X-User-Id header and set it as the current user for PostHog tracking."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        user_id = request.headers.get(_USER_ID_HEADER)
        if user_id:
            token = current_user_id.set(user_id)
            try:
                return await call_next(request)
            finally:
                current_user_id.reset(token)
        return await call_next(request)


class ApiKeyAuthMiddleware(BaseHTTPMiddleware):
    """Optional shared-service-token auth for the Java<->engine hop (roadmap D3).

    The expected key is read per-request from ``request.app.state.settings.engine_api_key``
    (populated in the app lifespan), so the middleware can be installed at import time before
    settings are loaded. Behaviour:

    * key unset/blank (default)  -> auth disabled, every request passes (loopback deployments);
    * key set                    -> requests must carry ``X-API-Key: <key>`` or
                                     ``Authorization: Bearer <key>``, except the exempt liveness/
                                     docs paths; otherwise a 401 JSON response is returned.

    Comparison is constant-time (``hmac.compare_digest``) to avoid leaking the key via timing.
    """

    # Liveness + schema/docs stay open so health probes and OpenAPI tooling don't need the token.
    _EXEMPT_PREFIXES = ("/health", "/docs", "/redoc", "/openapi.json")

    def _expected_key(self, request: Request) -> str:
        settings = getattr(request.app.state, "settings", None)
        key = getattr(settings, "engine_api_key", "") if settings is not None else ""
        return key or ""

    def _is_exempt(self, path: str) -> bool:
        return any(path == p or path.startswith(p + "/") for p in self._EXEMPT_PREFIXES)

    @staticmethod
    def _presented_key(request: Request) -> str | None:
        header = request.headers.get(_API_KEY_HEADER)
        if header:
            return header
        authorization = request.headers.get("Authorization", "")
        if authorization.startswith(_BEARER_PREFIX):
            return authorization[len(_BEARER_PREFIX) :]
        return None

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        expected = self._expected_key(request)
        if not expected or self._is_exempt(request.url.path):
            return await call_next(request)
        presented = self._presented_key(request)
        if presented is None or not hmac.compare_digest(presented, expected):
            return JSONResponse({"detail": "Invalid or missing API key"}, status_code=401)
        return await call_next(request)
