"""Shared logging utilities for the Stirling AI engine."""

from __future__ import annotations

import json
import logging

from pydantic import BaseModel

from stirling.context import current_request_id


class RequestIdLogFilter(logging.Filter):
    """Inject the current request correlation id into every log record (roadmap G2).

    Attached to the engine's log handler so ``%(request_id)s`` in the formatter always resolves —
    to the active :data:`~stirling.context.current_request_id` during a request, or ``"-"`` outside
    one (startup, background tasks). Always returns ``True`` (never filters records out).
    """

    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = current_request_id.get() or "-"
        return True


class Pretty:
    """Lazy JSON formatter — only serialises when ``str()`` is called.

    Designed for use with ``logging``'s ``%s`` formatting so that the
    JSON serialisation is skipped entirely when the log message is
    never emitted. Pydantic models (at the top level or nested) are
    dumped via ``model_dump``; anything else falls back to ``str``.
    """

    __slots__ = ("_obj",)

    def __init__(self, obj: object) -> None:
        self._obj = obj

    def __str__(self) -> str:
        if isinstance(self._obj, BaseModel):
            return self._obj.model_dump_json(indent=2)
        return json.dumps(self._obj, indent=2, default=_default, ensure_ascii=True)


def _default(value: object) -> object:
    if isinstance(value, BaseModel):
        return value.model_dump()
    return str(value)
