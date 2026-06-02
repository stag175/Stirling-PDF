"""Tests for the progress-emission plumbing in services.progress.

`emit_progress` is the robustness boundary for streaming progress: it must (1) be a no-op when no
emitter is bound to the ContextVar, (2) forward the event to a bound emitter, (3) swallow ordinary
emitter exceptions so progress emission can never break the work it reports on, and (4) still let
``asyncio.CancelledError`` propagate so task cancellation is honoured. The set/reset helpers follow
ContextVar Token semantics (reset restores the previous emitter).
"""

from __future__ import annotations

import asyncio

import pytest

from stirling.contracts.progress import WholeDocReadStarted
from stirling.services.progress import (
    emit_progress,
    reset_progress_emitter,
    set_progress_emitter,
)

_EVENT = WholeDocReadStarted(question="q", pages=3, slices=2)


@pytest.mark.anyio
async def test_no_op_when_no_emitter_is_bound() -> None:
    calls: list[object] = []

    async def emitter(event: object) -> None:
        calls.append(event)

    token = set_progress_emitter(emitter)
    reset_progress_emitter(token)  # unbind again

    await emit_progress(_EVENT)  # must not raise, must not call the (unbound) emitter
    assert calls == []


@pytest.mark.anyio
async def test_forwards_event_to_a_bound_emitter() -> None:
    calls: list[object] = []

    async def emitter(event: object) -> None:
        calls.append(event)

    token = set_progress_emitter(emitter)
    try:
        await emit_progress(_EVENT)
    finally:
        reset_progress_emitter(token)

    assert calls == [_EVENT]


@pytest.mark.anyio
async def test_swallows_ordinary_emitter_exceptions() -> None:
    async def boom(_event: object) -> None:
        raise RuntimeError("emitter failure")

    token = set_progress_emitter(boom)
    try:
        # Must NOT propagate — progress emission can never break the reported work.
        await emit_progress(_EVENT)
    finally:
        reset_progress_emitter(token)


@pytest.mark.anyio
async def test_reraises_cancelled_error() -> None:
    async def cancel(_event: object) -> None:
        raise asyncio.CancelledError

    token = set_progress_emitter(cancel)
    try:
        with pytest.raises(asyncio.CancelledError):
            await emit_progress(_EVENT)
    finally:
        reset_progress_emitter(token)


@pytest.mark.anyio
async def test_reset_restores_the_previous_emitter() -> None:
    outer: list[object] = []
    inner: list[object] = []

    async def outer_emitter(event: object) -> None:
        outer.append(event)

    async def inner_emitter(event: object) -> None:
        inner.append(event)

    token_outer = set_progress_emitter(outer_emitter)
    token_inner = set_progress_emitter(inner_emitter)
    try:
        await emit_progress(_EVENT)  # -> inner
        reset_progress_emitter(token_inner)  # restore outer
        await emit_progress(_EVENT)  # -> outer
    finally:
        reset_progress_emitter(token_outer)

    assert len(inner) == 1
    assert len(outer) == 1
