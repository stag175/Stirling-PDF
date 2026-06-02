# Frontend state-management migration — plan (roadmap B2)

> **B2**: "Adopt a dedicated state library to tame the React-Context sprawl and its re-render cost."
>
> Grounded in the real `frontend/editor/src` tree. This is a genuine **multi-week** migration with a
> large blast radius, and its whole *point* (re-render behavior) is only observable at runtime in a
> browser — so the responsible deliverable here is a staged, API-preserving plan, not a blind rewrite.

## Current state (verified)

- **No state library is installed.** `editor/package.json` has none of zustand / jotai / redux /
  recoil / valtio / mobx / xstate. State is **pure React Context + `useState`/`useReducer`**.
- **42 context-provider files**: 32 in `core`, 6 in `proprietary`, 1 in `saas`, 3 in `desktop`
  (70 `createContext` call sites in core alone — several files declare multiple contexts).
- **God-contexts** (LoC): `FileManagerContext` **1,274**, `ToolWorkflowContext` 824, `FolderContext`
  645, `ViewerContext` 638, `FilesPageContext` 562, `PageEditorContext` 549, `FormFillContext` 543,
  `NavigationContext` 509, `FilesModalContext` 485, `IndexedDBContext` 346, `RedactionContext` 282.
- **Blast radius**: the file context (`FileContext`/`useFileContext`/`FileManagerContext`) is
  referenced by **101 files**. A signature change there touches a fifth of the app.

## Why a library helps (the motivation B2 encodes)

React Context re-renders **every consumer** whenever the provider value changes, regardless of which
slice each consumer reads. A 1,274-LoC `FileManagerContext` holding files + selection + thumbnails +
IndexedDB sync means any file mutation re-renders every one of its 101 consumers. A selector-based
store (Zustand) or atom graph (Jotai) lets a consumer subscribe to just the slice it reads, so a
thumbnail update doesn't re-render the toolbar. That is the real win — and the real risk, because
effect timing and render order change subtly.

## Library choice

**Recommend Zustand** for this codebase:
- Minimal API, no provider tree required, works *alongside* existing Context during migration (a store
  can be created and consumed without ripping out the provider on day one).
- Selector subscriptions (`useStore(s => s.slice)`) solve the re-render problem directly.
- Middleware for `persist` (replaces the hand-rolled `IndexedDBContext` sync) and `devtools`.

Jotai (atoms) is the alternative if the team prefers bottom-up derived state; it's a bigger mental
shift for 42 existing top-down providers, so Zustand is the lower-risk first step.

## Staged plan (API-preserving, leaf-first — each step gated on the vitest suite + manual/e2e)

1. **Add `zustand`**; establish the store conventions (one slice file per domain, typed selectors,
   colocated tests). No behavior change yet.
2. **Migrate a low-coupling leaf context first** (e.g. `RedactionContext`, 282 LoC, or
   `FilesModalContext`) by moving its state into a store **while keeping the existing hook name and
   shape** (`useRedaction()` returns the same object, now backed by the store). Consumers don't change
   — this is the key to bounding the blast radius. Verify the vitest suite + the component's existing
   tests stay green and re-render counts drop (React DevTools profiler).
3. **Work up the dependency order** to the medium contexts (`ViewerContext`, `PageEditorContext`,
   `FormFillContext`), each as its own PR with its hook surface preserved.
4. **Tackle the god-contexts last** (`FileManagerContext`, `ToolWorkflowContext`): split each into
   typed slices (files / selection / thumbnails / persistence) behind the *same* `useFileContext`
   facade, so the 101 consumers keep compiling unchanged while the internals become selector-driven.
   Move IndexedDB persistence to the `persist` middleware, reconciling with the B3 blob-URL lifecycle
   (`fileLifecycleUtils`) so revocation timing is preserved.
5. **Remove now-empty Context providers** only after their consumers read from the store, and delete
   `IndexedDBContext` once `persist` covers it.

## Verification (why this is plan-only here)

The migration's success criterion is **fewer re-renders with identical behavior** — observable only by
running the app in a browser (React DevTools profiler, interaction tests, Playwright e2e). The vitest
unit suite catches API regressions but not render-cost or effect-timing regressions, and there's no
browser/e2e rig wired on this box. Each step also touches widely-consumed code (up to 101 files), so it
must land in small, individually-revertible PRs behind the test suite — not as one blind sweep. Hence:
grounded plan + library recommendation now; the staged, profiler-gated execution is the multi-week work.
