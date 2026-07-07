# CI workflow consolidation — audit + plan (roadmap H2/H3)

> **H2/H3**: "Consolidate the many CI workflows; reduce duplicated setup."
>
> Grounded in the actual `.github/workflows/` tree (38 workflows, 7,412 lines) as of this branch.
> **Headline finding: this is already ~80% done in the fork.** The remaining duplication is the
> per-job security prelude, which GitHub Actions structurally requires per job and which is the
> *least* valuable thing to DRY. Any further consolidation edits a **live** workflow and so must be
> validated on a CI runner (absent on this box) — hence a plan, not a blind edit.

## What's already consolidated (verified)

- **An orchestrator pattern is in place.** `build.yml` is a thin top-level workflow that delegates to
  **15 reusable (`workflow_call`) sub-workflows**: `backend-build`, `db-migration-test`,
  `check-openapi`, `frontend-validation`, `e2e-stubbed`, `e2e-live`, `build-enterprise`,
  `check-licence`, `docker-compose-tests`, `test-build-docker`, `tauri-build`, `ai-engine`,
  `pre_commit`, `dependency-review`, plus `_runner-pick`. So the "many duplicated build pipelines"
  problem H2/H3 targets is mostly solved — the heavy jobs each live in exactly one reusable file and
  are *called*, not copy-pasted.
- **Runner selection is centralized** in `_runner-pick.yml`, a reusable workflow consumed by **18**
  workflows — one place to change the self-hosted/GitHub-hosted routing.
- **A composite action already exists** (`.github/actions/setup-bot`), showing the composite-action
  mechanism is established in the repo and can be extended.
- **Toolchain versions are not scattered**: only one literal `java-version: 25` pin remains; the
  backend jobs flow through `backend-build.yml`, so the JDK/Gradle setup is defined once there.

## The residual duplication (and why it's low-value)

| Step | # workflows | Consolidatable? |
|---|---|---|
| `step-security/harden-runner` | 38 (all) | Only marginally — see below |
| `actions/checkout` | 34 | Per-job requirement |
| `actions/setup-java` | 16 | Mostly already via `backend-build.yml` |
| `gradle/actions/setup-gradle` | 14 | Mostly already via `backend-build.yml` |
| `actions/setup-node` | 9 | Candidate for a composite action |

`harden-runner` and `checkout` appear in (nearly) every workflow because **GitHub Actions runs each
job on a fresh runner** — `harden-runner` must be the first step *of each job*, and `checkout`
re-clones per job. A reusable *workflow* cannot remove this (the callee is itself a job needing its
own prelude); only a **composite action** can encapsulate "harden + checkout + setup toolchain" into
a single `uses:` line. That collapses ~3–5 lines per job into 1, but does not remove the runner-level
requirement — so it's a readability win, not a structural one, and it's the lowest-risk-but-also-
lowest-payoff part of H2/H3.

## Plan (if pursued — each step is CI-gated, hence staged not blind)

1. **Add composite actions** under `.github/actions/`:
   - `setup-backend` → harden-runner (audit egress) + checkout + setup-java(25) + setup-gradle.
   - `setup-frontend` → harden-runner + checkout + setup-node + dependency cache.
   - `setup-engine` → harden-runner + checkout + `astral-sh/setup-uv` + Python.
   Pin every nested action by SHA (matching the repo's existing convention).
2. **Migrate one low-traffic workflow** (e.g. `swagger.yml` or `check-openapi.yml`) to the composite
   action and confirm on a real CI run that: egress policy still applies, permissions are unchanged,
   and the job is green. This is the gate — composite-action `uses:` resolution + `harden-runner`
   ordering cannot be validated offline.
3. **Roll out** to the remaining workflows in small batches, each its own PR so a regression is
   isolated and revertible. Do **not** touch release-critical workflows (`multiOSReleases`,
   `tauri-build`, `push-docker`) until the pattern is proven on the cheap ones.
4. **Optionally fold trivially-tiny workflows** into existing reusable ones where they always run
   together — but only where it doesn't reduce the ability to re-run a single check.

## Why this is plan-only here

Every step above edits a **live** workflow whose correctness (YAML validity, action SHA resolution,
`harden-runner` egress enforcement, `permissions:` scoping, secret availability) is only observable on
a GitHub-hosted runner. There is no runner on this box, and a silently-broken security prelude is a
worse outcome than the current readable duplication. So, like E3 (additive provenance) and H4
(no-op environment gate), the safe-here deliverable is: **document that H2/H3 is largely complete,
identify the precise residual, and stage the composite-action rollout behind CI validation** rather
than restructure 38 live workflows blind.
