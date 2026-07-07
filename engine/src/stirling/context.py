"""Per-request context shared across the engine (correlation id for log correlation).

Kept at the top level (not under ``api``) so the logging layer can read it without importing
the API package, avoiding an import cycle.
"""

from __future__ import annotations

from contextvars import ContextVar

# Correlation id for the current request (roadmap G2). Set by RequestContextMiddleware from the
# inbound ``X-Request-Id`` header, or a freshly generated id when the caller sends none. Surfaced in
# every log line via RequestIdLogFilter and echoed back in the ``X-Request-Id`` response header so a
# single id ties together the frontend -> Java -> engine hop.
current_request_id: ContextVar[str | None] = ContextVar("stirling_request_id", default=None)
