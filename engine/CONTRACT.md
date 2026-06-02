# Stirling AI Engine — HTTP contract & failure modes

> Roadmap item **I3**. This documents the engine's public HTTP surface (typed in / typed out)
> and, crucially, **what happens when things go wrong** — provider outages, malformed model
> output, validation errors, and streaming failures. It is grounded in the code under
> `engine/src/stirling/api/` and `engine/src/stirling/contracts/`; keep it in sync when routes change.

The engine is a FastAPI app (`stirling.api.app:app`, title *"Stirling AI Engine"*, version `0.1.0`)
fronting a set of Pydantic-AI agents. The Java backend (`AiProxyService`) is the primary client and
forwards calls over loopback HTTP. Every request and response body is a **Pydantic model**, so the
contract is fully typed and self-describing via the generated OpenAPI schema at `/openapi.json`
(Swagger UI at `/docs`).

## Endpoints

All bodies are JSON. All endpoints are `POST` except `/health`.

| Method | Path | Request body | Success (2xx) response | Shape |
|--------|------|--------------|------------------------|-------|
| GET  | `/health` | — | `HealthResponse` (`status`, `smart_model`, `fast_model`) | single object |
| POST | `/api/v1/orchestrator` | `OrchestratorRequest` | **NDJSON event stream** (`application/x-ndjson`) | streamed frames — see below |
| POST | `/api/v1/pdf/edit` | `PdfEditRequest` | `PdfEditResponse` | union (plan / clarification / cannot-do / terminal) |
| POST | `/api/v1/pdf/questions` | `PdfQuestionRequest` | `PdfQuestionResponse` | union (answer / not-found / orchestrate / terminal) |
| POST | `/api/v1/agents/draft` | `AgentDraftRequest` | `AgentDraftWorkflowResponse` | single object |
| POST | `/api/v1/agents/revise` | `AgentRevisionRequest` | `AgentRevisionWorkflowResponse` | single object |
| POST | `/api/v1/agents/next-action` | `AgentExecutionRequest` | `NextExecutionAction` | union (tool-call / completed / cannot-continue) |
| POST | `/api/v1/documents` | `IngestDocumentRequest` | `IngestDocumentResponse` | single object; replace-ingest (clears prior content first) |
| DELETE | `/api/v1/documents/{document_id}` | — (`document_id` path param) | `DeleteDocumentResponse` (`document_id`, `deleted`) | **idempotent** — `deleted=false` if absent, no error |
| POST | `/api/v1/ai/math-auditor-agent/examine` | `FolioManifest` | `Requisition` | single object |
| POST | `/api/v1/ai/math-auditor-agent/deliberate` | `Evidence` (+ `?tolerance=` query, default `0.01`) | `Verdict` | single object |
| POST | `/api/v1/ai/pdf-comment-agent/generate` | `PdfCommentRequest` | `PdfCommentResponse` | single object |

Several response types are **discriminated unions** whose chosen variant *is* the outcome signal —
e.g. `PdfEditResponse` / `PdfQuestionResponse` / `NextExecutionAction` resolve to a *terminal*,
*needs-clarification*, or *cannot-do* member. Clients must branch on the variant, not assume one shape.
Definitions live in `engine/src/stirling/contracts/` (re-exported from `contracts/__init__.py`).

### Cross-cutting request conventions

- **`X-User-Id` header** (optional): captured by `UserIdMiddleware` and used as the PostHog
  `distinct_id` for that request. Absent → events are anonymous/"personless". It is *not* an auth
  credential; it does not gate access.
- **`X-API-Key` header** (D3, optional service token): when `STIRLING_ENGINE_API_KEY` is configured,
  every request except the exempt liveness/docs paths (`/health`, `/docs`, `/redoc`, `/openapi.json`)
  must present `X-API-Key: <key>` **or** `Authorization: Bearer <key>` (constant-time compared), else
  **401**. When the env var is unset (default), auth is disabled — loopback deployments are
  unaffected. Enforced by `ApiKeyAuthMiddleware`; the Java caller must send the header when the key is
  set.
- **Long-running calls**: every agent route makes one or more LLM calls and can take many seconds.
  Clients should use generous read timeouts. For long multi-step work use the streaming orchestrator
  (below), whose frame cadence is the liveness signal.

## The streaming orchestrator (`POST /api/v1/orchestrator`)

This is the one endpoint that does **not** follow request→response. It returns
`StreamingResponse(media_type="application/x-ndjson")` and emits **one JSON object per line**, each
with an `event` discriminator:

| `event` | Extra fields | Meaning |
|---------|--------------|---------|
| `progress` | the serialized `ProgressEvent` fields | an inner agent reported work (e.g. a chunked-reasoner slice finished) |
| `result` | `response`: `OrchestratorResponse` | the final typed result — terminal success |
| `error` | `message`: string | the run failed; surfaced **in-band**, then the stream closes |
| `heartbeat` | — | keep-alive emitted every `10s` so idle connections stay visibly alive |

Because the HTTP status is committed to **200** the instant streaming begins, **failures after that
point are delivered as an `error` frame, not an HTTP 5xx**. Callers must consume and inspect frames;
a 200 with a trailing `error` frame is a *failed* run. After `result` or `error`, the generator pushes
a sentinel and the connection closes. (See `api/routes/orchestrator.py::_OrchestratorStream`.)

## Failure modes

There is **no global exception handler** registered on the app. Failures therefore fall into four
buckets:

1. **Invalid / missing request fields → `422 Unprocessable Entity`** (automatic, FastAPI + Pydantic).
   Body is the standard `{"detail": [ {loc, msg, type}, … ]}`. Applies to every typed-body route.

1a. **Missing/invalid service token → `401 Unauthorized`** (only when `STIRLING_ENGINE_API_KEY` is
   set; D3). Body `{"detail": "Invalid or missing API key"}`. Checked by `ApiKeyAuthMiddleware` before
   routing, so it precedes validation/dependency errors.

2. **Invalid query parameter → `400 Bad Request`.** The only hand-written HTTP error mapping today:
   `deliberate`'s `tolerance` must parse as a non-negative `Decimal`, else
   `{"detail": "tolerance must be non-negative"}` / `{"detail": "Invalid tolerance value: …"}`.

3. **Agent / model-provider failures on the unary (non-streaming) routes → `500 Internal Server
   Error`.** With no global handler, anything raised inside `agent.handle()` propagates to FastAPI's
   default 500. This single status currently covers several distinct causes that a caller cannot
   distinguish from the status code alone:
   - **Provider down / network / rate-limited** → Pydantic-AI `ModelHTTPError`.
   - **Malformed or invalid structured output** — the model failed to produce output matching the
     agent's typed schema. Pydantic-AI retries internally (output validators / `ModelRetry`) up to its
     limit; when exhausted it raises `UnexpectedModelBehavior` → 500.
   - **Usage limits** → `UsageLimitExceeded`.
   - **Domain guards** raising `ValueError` (e.g. bad chunk sizes) or
     `RuntimeError("All chunked-reasoning workers failed; …")` when every worker in a fan-out failed.
   > *Known gap / improvement:* these all collapse to an opaque 500. A global exception handler that
   > maps provider/transport errors to `502`/`504`, schema failures to `422`, and usage limits to
   > `429` would let clients react correctly. Tracked as future hardening, not yet implemented.

4. **Streaming-orchestrator failures → `200` + an `error` frame** (see the orchestrator section). The
   agent task catches `Exception`, logs it, and emits `{"event":"error","message": str(exc)}`;
   `asyncio.CancelledError` is re-raised (client disconnect / shutdown).

### Startup (fail-fast)

Required configuration is read in the FastAPI **lifespan** on boot (`_load_startup_settings` →
`load_settings`). Missing required env vars (`STIRLING_SMART_MODEL`, `STIRLING_FAST_MODEL`,
`STIRLING_RAG_*`, …) raise immediately, so the process crashes **at startup** rather than on the first
request. The `documents` runtime is closed on shutdown.

## Configuration & telemetry (opt-out)

Configuration is environment-driven (`AppSettings`, `STIRLING_*` aliases — see
`engine/src/stirling/config/settings.py`). Notable:

- **RAG backend**: `STIRLING_RAG_BACKEND` selects `sqlite` (sqlite-vec, default for local/tests) or
  `pgvector` (Postgres). `pgvector`/embedding paths require their respective services.
- **Telemetry kill switch (privacy)**: PostHog tracking is fully **opt-out**. With
  `STIRLING_POSTHOG_ENABLED=false` **or** an empty `STIRLING_POSTHOG_API_KEY`,
  `setup_posthog_tracking()` returns `None` — no client is constructed and no span processor is
  registered, so **nothing is captured or sent** (verified by `tests/test_tracking.py`).

## Verifying this document

The endpoint table can be regenerated from the live app's registered routes (the package lives under
`src/`, so put it on the path — pytest does this automatically via `pythonpath` in `pyproject.toml`):

```bash
# from engine/ — bash; on PowerShell use  $env:PYTHONPATH='src'
PYTHONPATH=src .venv/Scripts/python -c "from stirling.api.app import app; [print('/'.join(sorted(m for m in r.methods if m!='HEAD')), r.path) for r in sorted(app.routes, key=lambda r: r.path) if getattr(r,'methods',None)]"
```

The full HTTP surface is also browsable at runtime via the generated OpenAPI schema (`/openapi.json`,
Swagger UI at `/docs`). Run the typed suite — which exercises the route/response contracts and the
failure paths (422 validation, the 400 tolerance guard, idempotent delete, streaming frames) — with:

```bash
task engine:test            # or: .venv/Scripts/python -m pytest tests --cov=src --cov-branch
```
