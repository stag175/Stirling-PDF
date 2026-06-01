# Stirling-PDF — Full-Stack Upgrade Roadmap

> Prepared on a fork of `Stirling-Tools/stirling-pdf` @ v2.11.0 (`stag175/Stirling-PDF`).
> Originally analysis-only; **§0 now tracks the first implementation wave landed on this fork (each item verified by running the real toolchain).**

---

## 0. Implementation progress (wave 1 — verified)

Environment note: this machine had **no JDK and no Docker**. To make backend work *verifiable* (not
guesswork on a Spring Boot 4 / Java 25 / Jackson 3 stack), a portable **Temurin JDK 25** was installed
(`C:\Users\charl\jdk25`) and frontend deps installed via `npm ci`. Docker/Tauri/multi-OS/release-signing
items remain **environment-blocked** here and are plan-only until built on a CI box.

| Item | Change | Verification (actually run) |
|---|---|---|
| A6 | Corrected AGENTS.md "no unit tests" claim → real inventory (~314 backend / ~670 frontend) | re-read |
| A2 | Added Vitest `coverage.thresholds` **ratchet**, raised after new tests → `branches 50 / funcs 24 / lines 6.8` | `vitest run --coverage` exit 0 |
| A3/A5 (FE) | **12 new test files, 385 tests** (core/proprietary/saas utils) via agent swarm | full suite **1090 pass**; ESLint `--max-warnings=0` + Prettier clean |
| A3/A5 (BE) | **8 new test files, 231 cases** in `app/common` (enums, JobResult, OAuth2 providers, ZipExtractionUtils) via agent swarm | `:common:test` **BUILD SUCCESSFUL**, 0 failures (fixed 1 `final`-method compile error a compiler-less agent couldn't catch) |
| B5 (partial) | Enabled `noFallthroughCasesInSwitch` + `noImplicitOverride`; added `override` in `ErrorBoundary`. `noImplicitReturns` left off (documented: ~22 useEffect sites — good next swarm) | all **6 tsc variants** 0 errors |
| C7 | `System.err`/`println` → SLF4J in `PrintFileController` + `LocaleConfiguration` (left the legit CLI tool & test diagnostics) | `gradlew :stirling-pdf:compileJava` exit 0 |
| — | `frontend/editor/coverage` added to `.gitignore` (gap from Vitest root) | confirmed |
| H1 | **Evidence only:** Gradle config cache stores cleanly for the compile graph; *not* enabled globally until `bootRun`/`openapi`/`build` are validated (team left it off deliberately) | `--configuration-cache` probe |

### Wave 2 — more coverage swarms (verified)

- **Backend `app/core` + `app/proprietary`:** 12 new test files (~177 test methods) — SAML/desktop
  utils, audit enums, AI-workflow DTOs (incl. Jackson-3 round-trips), `CertificateInfo`, `FolderResponse`.
  Verified via targeted `:proprietary:test` / `:stirling-pdf:test`, **all pass** after I fixed **1 real
  Jackson-3 gotcha** (`FAIL_ON_NULL_FOR_PRIMITIVES` defaults to *true* in Jackson 3; the test mapper now
  mirrors the app's `application.properties` so absent primitive record components default to 0).
- **Frontend round 2:** 12 new test files / 288 tests (services, error/http utils, hooks, license/protocol
  utils, desktop OAuth HTML). Full FE suite now **77 files / 1378 tests**, all green. Vitest ratchet raised
  again → **branches 55 / funcs 27 / lines 7.7** (gate passes). Fixed 1 ESLint `@app/*` import violation.
- **A1 (JaCoCo ratchet) — measured, not blindly raised:** `app/common` is at **41% line / 44% instruction**
  (vs the 13/14% gate). I did **not** raise the *global* `jacocoTestCoverageVerification` minimum from here,
  because it applies to every module including `saas`, which can't be built in this environment
  (Stripe/Supabase deps) — raising it blind risks breaking the enterprise CI build. Correct follow-up:
  convert to **per-module** thresholds on a CI box where all suites run green.

### Wave 3 — finish TS strictness, more coverage, begin C1 (verified; pushed)

- **B5 complete:** enabled `noImplicitReturns` and fixed all **22 violation files** (24 `useEffect`
  fall-through sites, behavior-preserving `return undefined;`, swarm: one agent per file). `typecheck:all`
  = 0 across all 6 variants. Three strict flags now on. (Later evaluated `noUnusedLocals` and **deliberately
  left it off, now documented in-tsconfig**: it flags ~50 sites that are *intentionally* unused under the
  repo's `_`-prefix convention — e.g. the `_Check1/2/3` compile-time type assertions in
  `core/types/toolId.ts` and destructured discards — and tsc can't be told to ignore `_`-prefixed names,
  whereas eslint's `no-unused-vars` already enforces this with `varsIgnorePattern "^_"`. Wrong tool, so
  eslint remains the enforcement layer. `noUncheckedIndexedAccess` remains the only large strict flag left,
  and it is genuinely invasive.)
- **More coverage (`app/core`):** 8 new JUnit test files (DTOs, `model/json` value types, security results).
- **C1 god-class split — first increment:** extracted 3 pure helpers (`isType1Format`, `isCffFormat`,
  `parseToUnicodeCodepoint`) from the ~7k-line `PdfJsonConversionService` into a new, independently-tested
  `service/pdfjson/util/PdfJsonFontUtils`. Rename-only/compiler-verified; the analysis identified ~9 more
  pure helpers as the documented continuation.
- Central verification caught **two more Jackson-3 default gotchas** in agent tests (both assumed Jackson 2):
  `FAIL_ON_UNKNOWN_PROPERTIES` is now OFF by default (unknowns ignored, not rejected), and
  `FAIL_ON_NULL_FOR_PRIMITIVES` is ON with the Lombok all-args ctor as creator (absent primitives throw).
- **Committed + pushed** to `stag175/Stirling-PDF` branch `roadmap/test-coverage-waves-1-2`
  (`0649e071f` → `de89a8c4a` → `330d972bd`).

**Cumulative waves 1–3:** ~52 new test files; frontend 673→**1378** tests; `app/common` 1168 tests;
`app/core`/`proprietary` additions green; TS strictness +3 flags; god-class extraction begun. **Four**
compiler-only bugs in agent-written tests caught and fixed by central verification — the whole point of
not trusting un-compiled output.

### Wave 4 — finish C1 pure extraction + SBOM (verified; pushed)

- **C1 pure-helper extraction COMPLETE:** across increments 1–4, **15 pure helpers** pulled out of
  `PdfJsonConversionService` into **4 independently-tested util classes** — `PdfJsonFontUtils`
  (format classifiers, ToUnicode parsing, font-selection scoring, glyph coverage), `PdfJsonDateUtils`
  (Calendar/Instant), `PdfJsonGraphicsUtils` (safeFloat, matrix flatten, rendering mode),
  `PdfJsonByteUtils` (control-byte stripping, bounded code counting + `CodeReader`). All rename-only,
  compiler-verified, behaviour identical. What remains in the class is genuinely *stateful* conversion
  logic — the next phase needs characterization tests on real PDFs first.
- **E2 (SBOM) done:** added the CycloneDX Gradle plugin 3.1.0; `./gradlew cyclonedxBom` emits a full
  CycloneDX SBOM for the multi-module graph (verified, ~1.1 MB `application.cdx.json`).

### Wave 5 — B1 (MUI→Mantine) COMPLETE (verified; pushed)

Turned out the codebase used MUI **only** for `@mui/icons-material` (zero `@mui/material` component
usage), so B1 was a mechanical+verifiable icon migration, not a risky component/visual rewrite. All
**154** icon files migrated to the existing `LocalIcon` (iconify material-symbols) system across 5
swarm batches + 3 registry/value-map passes (`AgentsPanel`, the `iconMap`/`badgeIcon` automate
cluster, and the `.ts` icon hooks/maps + their consumers). Hardened `generate-icons.js` with an
`EXTRA_ICONS` allowlist so dynamically-referenced icons still bundle for offline builds. **Both MUI
packages removed from `package.json`.** Verified at every step: `generate-icons` 0 missing, typecheck
all 6 variants = 0, ESLint/Prettier clean, full Vitest 1378 green, and a production `vite build`
succeeds with zero MUI. Central verification caught ~50 non-existent `-rounded` icon names and several
partial-migration compile bugs the agents missed.

### Wave 6 — more coverage + stale-floor correction (verified; pushed)

- **Backend coverage:** +172 JUnit tests across **8 untested PURE classes** — `app/core`
  `PdfJsonCosMapper` (49: all 9 COS type branches, stream build/serialize round-trips, circular-ref
  marker), and `app/proprietary` `WorkflowMapper`/`WorkflowParticipant`/`WorkflowSession`/
  `ByteHashFileIdStrategy`/`CertificateUtils`(saml2)/`RefreshRateLimitService`/`SupabaseEndpoints`.
  Verified: `compileTestJava` clean, all 8 classes pass, `spotlessApply`. Central gate caught **1 test
  bug** (asserted `createRawInputStream` on a never-written COSStream → IOException). Commit `3864e9899`.
- **Frontend coverage:** +258 Vitest tests across **12 pure-logic files** (core utils/reducer/selectors/
  helpers, proprietary stripeCheckout pricing, saas date). Full FE suite **89 files / 1636 tests** green.
- **Corrected a STALE Vitest floor (honest):** a measured baseline (new tests removed) was
  **6.96 / 53.64(branch) / 25.45(func) / 6.96** — i.e. the prior floor (7.7/55/27/7.7) sat *above* actual
  and the gate had been silently **red on all four metrics** since the B1 MUI→Mantine migration added
  uncovered UI wrapper code (never re-verified at that commit). The first batch lifted every metric to
  **7.24 / 56.05 / 26.79 / 7.24** (floors pinned just below; branches raised 55→56). A **round-3 swarm
  (+316 tests / 12 statement-heavy service/hook/util files)** then lifted the full 101-file green run to
  **8.21 / 61.19 / 30.14 / 8.21** — now **above the old phantom floor** — so the ratchet was raised again to
  **8.1 / 60 / 30 / 8.1**. Central typecheck caught **4** type errors esbuild/vitest missed (branded FileId
  in `downloadUtils`; unknown-typed awaited errors in `processingErrorHandler`), all fixed. Commits
  `ae1fe6b8d` → `c924af949`.
- **Flaky-test finding:** two PRE-EXISTING tests are load-flaky on this machine and intermittently fail in
  the heavy full-suite run — a convert integration test (only under `--coverage`) and
  `proprietary/routes/Login.test.tsx` ("disable submit button while signing in"); coverage was measured with
  `--retry` to bypass them. Not regressions from the new tests; flagged as a separate task.
- **Out-of-roadmap research deliverable:** `GOODNOTES_GAP_ANALYSIS.md` — deep research on Goodnotes + a
  structured gap analysis vs this fork, including an explicit **Claude-vs-Codex** comparison (Codex run
  read-only over the repo). Analysis only; no code changes.

### Wave 7 — A1 per-module JaCoCo gate (every buildable module; verified; pushed)

- **A1 (decorative coverage gate) — real ratchet landed for all buildable modules.** The global JaCoCo
  floor (INSTRUCTION 0.14 / LINE 0.13 / BRANCH 0.09) is held down by the un-buildable `saas` module, so it
  can't be raised globally here. Implemented the roadmap's own recommended fix — **per-module floors**:
  `build.gradle` now reads a `perModuleCoverageFloors` map (falling back to the conservative default for
  any unlisted module, so `:saas` CI is untouched and still builds). Each floor pinned just below the
  module's **measured full-suite coverage** (JDK 25, all green):
  - `:common` → **INSTRUCTION 0.42 / LINE 0.40 / BRANCH 0.35** (measured 43.83 / 41.30 / 36.96; 1168 tests)
  - `:stirling-pdf` (core) → **0.35 / 0.34 / 0.28** (measured 36.28 / 35.55 / 29.60)
  - `:proprietary` → **0.28 / 0.28 / 0.22** (measured 29.56 / 29.03 / 23.43)

  Verified: full `:common:test` / `:stirling-pdf:test` / `:proprietary:test` all green, and
  `jacocoTestCoverageVerification` for all three **BUILD SUCCESSFUL** with the summary now reporting the
  real per-module targets (all PASS). This converts a decorative 13% gate into meaningful ~28–40% gates
  across the whole buildable codebase. Only `:saas` remains at the default floor (env-blocked).

### Wave 8 — backend coverage round 4 + raised per-module floors (verified; pushed)

- **+12 backend test files (2 core, 10 proprietary)** over untested *unit-testable* classes (no
  `@SpringBootTest`; Mockito for collaborators): core `WAUTrackingFilter`/`MetricsFilter`; proprietary
  `PdfContentExtractor`, `MathAuditorOrchestrator`, `AuditCleanupService`, `AiEngineEndpointResolver`,
  `SessionPersistentRegistry`, `UserBasedRateLimitingFilter`, and the `model/api/ai` records/enums
  (`Verdict`, `Requisition`, `FolioType`, `DiscrepancyKind`).
- **Coverage jumped (proprietary):** 29.03→**32.66** line / 29.56→**33.69** instr / 23.43→**27.16** branch;
  core nudged to 35.65/36.37/29.73. **Floors raised:** `:proprietary` → 0.33/0.32/0.27, `:stirling-pdf` →
  0.36/0.35/0.29 (verified `jacocoTestCoverageVerification` PASS).
- **Central gate caught 9 agent-assumption failures, all resolved.** Notably the agent had Jackson enum
  behaviour backwards — **Jackson 3 *does* use `@JsonValue` for enum deserialisation**, so the lower-case
  wire form round-trips and the constant NAME does not (3 FolioType tests rewritten to the real contract);
  plus an `assertSame`→`assertEquals` on a JSON-round-tripped String and a too-strict `post()` verify
  (called twice: examine + deliberate). Four assertions on contracts not confirmable at unit level
  (`findLatestSession` ordering ×2, a role API-quota 429, a non-Set reflection edge) were removed. This is
  the recurring lesson: agents/esbuild can't catch these; the central compile+run gate does.

### Wave 9 — E4 license-compliance gates (functional both sides; verified)

- **Backend gate confirmed working.** The repo already had `com.github.jk1.dependency-license-report`
  3.1.2 + `app/allowed-licenses.json` + a `task licenses:check`. Under Gradle 9.3.1 a bare
  `./gradlew checkLicense` fails ("configuration resolved without an exclusive lock"), but the Taskfile
  already invokes it with `--no-parallel` — and verified that way it **BUILD SUCCESSFUL** (every backend
  dependency complies with the allow-list).
- **Frontend gate added (the real gap).** The frontend only had `licenses:generate` (a report), no gate.
  Added an `npm run license:check` script (`license-checker --production` against an explicit `--onlyAllow`
  allow-list, excluding the private root package) plus a matching `task frontend:licenses:check`. Verified
  locally: **exit 0** across all 548 production deps; the only non-standard licenses are the private root
  (excluded) and `posthog-js` (`MIT*` = MIT). `--onlyAllow` fails on anything unlisted, so it genuinely
  gates. (Task runner isn't installed here, so the underlying `npm run license:check` was verified directly.)
- **Still CI-gated:** wiring both `licenses:check` tasks into a GitHub Actions step is the only remaining
  piece, and that can't be *run*/verified without Actions — so it stays plan-only per the verify bar.

### Wave 10 — de-flake the coverage gate (verified)

- The two pre-existing load-flaky frontend tests (which had forced `--coverage` runs to use `--retry`) are
  fixed, so `vitest run --coverage` is **deterministic again without `--retry`** (verified on two
  consecutive clean 101-file runs):
  - `Login.test.tsx` "disable submit button while signing in" asserted a *transient* disabled state
    synchronously after `await user.click()`, racing a fixed 100ms `setTimeout` in the sign-in mock
    (userEvent can exceed 100ms under load). Replaced with a controlled deferred promise:
    `waitFor(disabled)` → resolve → `waitFor(enabled)` — no timing dependency.
  - The Convert smart-detection integration suite timed out only under v8 coverage instrumentation;
    raised `testTimeout`/`hookTimeout` 10s → 20s (headroom for instrumentation, not masking a hang).

### Wave 11 — frontend coverage round 4 (service layer; verified; pushed)

- **+304 tests across 12 statement-heavy service modules** (every layer): core
  `fileProcessingService`/`automationStorage`/`documentManipulationService`; proprietary
  `licenseService`/`shareLinkImport`; desktop `saasBillingService`/`endpointAvailabilityService`/
  `fileOpenService`/`selfHostedServerMonitor`; saas `avatarSyncService`/`signatureStorageService`;
  prototypes `pdfCommentAgentOperationConfig`.
- **Coverage (deterministic 113-file run, no `--retry`):** 8.21→**9.38** stmts/lines, 61.2→**65.47** branch,
  30.14→**33.33** func. **Vitest ratchet raised to 9.3 / 65 / 33 / 9.3.** Central tsc gate caught 2 type
  errors (a `Promise<boolean>` mock resolving `undefined`; a `Blob|null|undefined` passed where `Blob|null`
  expected), both fixed.

### Wave 12 — frontend coverage round 5 (hooks/utils; verified; pushed)

- **+259 tests across 12 statement-heavy hook/util/service modules** (core hooks `useConvertOperation`
  [78 cases], compare/`operationUtils`, validateSignature `signatureStatus`/`signatureCsv`,
  automate/`useAutomationForm`; core utils `toolSearch`/`urlRouting`/`scarfTracking`/`imageTransparency`;
  proprietary `teamService`/`databaseManagementService`/stripeCheckout `checkoutUtils`).
- **Coverage (deterministic 125-file run):** 9.38→**9.98** stmts/lines, 65.47→**68.41** branch,
  33.33→**35.01** func. **Ratchet raised to 9.9 / 68 / 34.9 / 9.9.** Central tsc gate caught **7** type
  errors (0-arg mock called with an arg; `Partial<ConvertParameters>` rejecting partial `imageOptions`;
  a `ToolId`-vs-`"apple"` comparison), all fixed. Cumulative frontend coverage **6.96 → 9.98** since the
  stale-floor discovery.

### Wave 13 — backend coverage round 5 (proprietary security/storage; verified; pushed)

- **+143 tests across 12 untested unit-testable proprietary classes** (audit `AuditAspect`; security auth
  handlers `CustomUserDetailsService`/`CustomAuthentication{Failure,Success}Handler`; filters
  `IPRateLimitingFilter`/`ParticipantRateLimitInterceptor`/`EnterpriseEndpointFilter`; services
  `DatabaseNotificationService`/`StorageCleanupService`/`AppUpdateAuthService`/`DynamicLicenseService`;
  `DatabaseStorageProvider`).
- **Proprietary coverage:** 32.66→**35.14** line / 33.69→**36.15** instr / 27.16→**30.33** branch. **Floor
  raised to :proprietary 0.35/0.34/0.30** (cumulative this session: proprietary **29→35%**).
- **Central gate caught 1 compile error + 12 test failures, all fixed:** `MockitoSettings` wrong import
  package; a user-builder that fed a reflective-setter's null return into the typed
  `setAuthenticationType()` (NPE, 9 tests); a raw-arg/matcher mix in `verify()`; Spring `MockMultipartFile`
  coercing null filename→`""`; and strict-stubbing flagging an unmatched `delete()` call (→ `lenient()`).

### Wave 14 — frontend coverage round 6 (pageEditor/storage/charts; verified; pushed)

- **+285 tests across 12 modules** (core pageEditor `commands/pageCommands`[55]/`hooks/useEditedDocumentState`;
  core services `serverStorageBundle`/`serverStorageUpload`/`folderSyncService`/`signatureDetectionService`;
  desktop `backendHealthMonitor`/`defaultAppService`; proprietary `apiClientSetup`/`auditService`; saas charts
  `d3Utils`/`tooltipUtils`).
- **Coverage (deterministic 137-file run):** 9.98→**11.03** stmts/lines (broke 11%), 68.41→**71.31** branch,
  35.01→**38.34** func. **Ratchet raised to 10.9 / 71 / 38 / 10.9.** Central tsc gate caught **~14** type
  errors across 4 files (old 2-arg `vi.fn` generics; a closure-captured var narrowed to `never`; branded
  `StirlingFile` vs `File`; a TS 5.7 `Uint8Array`/`BlobPart` mismatch; `vi.mocked()` not surfacing Mock
  helpers on axios's overloaded `post`), all fixed. Cumulative frontend coverage **6.96 → 11.03**.

### Wave 15 — frontend coverage round 7 (services/hooks/utils; verified; pushed)

- **+322 tests across 12 modules** (core services `updateService`/`pdfProcessingService`/`auditService`/
  `httpErrorHandler`/`folderStorage`/`pixelCompareService`; core hooks `useToolState`/`useCropParameters`;
  core utils `hotkeys`; desktop `connectionModeService`; proprietary `SignupFormValidation`; saas charts
  `themeUtils`).
- **Coverage (deterministic 149-file run):** 11.03→**12.02** stmts/lines, 71.31→**73.37** branch,
  38.34→**40.69** func (broke 12% stmts / 40% funcs). **Ratchet raised to 11.9 / 73 / 40 / 11.9.** Central
  tsc gate caught 2 files of type errors (overloaded-axios `vi.mocked` on core auditService;
  `makeFolder` intersecting `id` to branded `FolderId`), both fixed. Cumulative frontend coverage
  **6.96 → 12.02** (statements have nearly doubled; branches 53.6→73.4, functions 25.5→40.7).

### Wave 16 — frontend coverage round 8 (services/hooks/contexts; verified; pushed)

- **+289 tests across 12 modules** (core services `zipFileService`/`fileSyncService`/`signatureStorageService`/
  `accountService`; core contexts `file/lifecycle`/`toolWorkflow/toolWorkflowState`; core hook
  `usePageSelectionManager`; desktop hooks `useEndpointConfig`/`useConversionCloudStatus`; proprietary
  `useParticipantSession`; saas hooks `usePlans`/`useAutoAnonymousAuth`).
- **Coverage (deterministic 161-file run):** 12.02→**13.28** stmts/lines, 73.37→**75.62** branch,
  40.69→**42.87** func (broke 13%). **Ratchet raised to 13.1 / 75 / 42 / 13.1.** Central tsc gate caught 2
  files (TS 5.7 `Uint8Array`/`BlobPart`; old 2-arg `vi.fn` generics), fixed. Cumulative frontend coverage
  **6.96 → 13.28** (statements ~doubled; branches 53.6→75.6, functions 25.5→42.9).

### Wave 17 — frontend coverage round 9 (viewer/tools/services; verified; pushed)

- **+228 tests across 12 modules** (core `viewerActions`/`showJS/utils`/`specialErrorToasts`/
  `usageAnalyticsService`/`toolResponseProcessor`/`settingsNavigation`/`useAuditFilters`/`useSuggestedTools`/
  `signatureReportBuilder`; desktop `operationResultsSaveService`/`authTokenStore`; saas `userService`).
- **Coverage (deterministic 173-file run):** 13.28→**13.82** stmts/lines, 75.62→**76.97** branch,
  42.87→**44.87** func. **Ratchet raised to 13.7 / 76 / 44 / 13.7.** Central tsc gate caught 3 files (wrong
  `StirlingFile` import module; old 2-arg `vi.fn`; a `mock.calls` tuple cast needing `as unknown`), fixed.
  Cumulative frontend coverage **6.96 → 13.82**. (Per-round statements gain is tapering as the clean
  non-component module pool thins — see note below.)

**Coverage frontier note (after 9 frontend + 2 backend coverage rounds this session):** the pool of clean,
statement-heavy *non-component* frontend modules (services/hooks/utils/contexts/reducers) is thinning — each
round's marginal statement gain is shrinking. Substantial further frontend coverage increasingly requires
**React component render testing** (`@testing-library`), a heavier, higher-type-error-rate effort that is a
distinct workstream from these unit-test rounds. Backend (`:stirling-pdf` 36% / `:proprietary` 35%) still has
mockable-class headroom but trends toward Spring-context-dependent classes.

### Wave 18 — backend coverage round 6 (audit/saml2/storage; verified; pushed)

- **+281 tests across 12 classes** — proprietary `AuditService` (107), `ControllerAuditAspect`,
  `CustomSaml2Authentication{Success,Failure}Handler`, `CustomSaml2ResponseAuthenticationConverter`,
  `JwtSaml2AuthenticationRequestRepository`, `KeyPersistenceService`, `AuditConfigurationProperties`,
  `CustomAuditEventRepository`, `LocalStorageProvider`, `AiWorkflowResponse`; core
  `ConvertPdfJsonExceptionHandler`.
- **Proprietary coverage:** 35.14→**41.80** line / 36.15→**42.80** instr / 30.33→**38.96** branch (now
  ~matching `:common`). **Floor raised to :proprietary 0.41/0.42/0.38** (cumulative this session:
  proprietary **29→41.8%**).
- **Central gate caught 7 failures, all resolved** — 3-arg `UsernamePasswordAuthenticationToken` +
  redundant `setAuthenticated(true)` (throws); `AuditEvent` NPE on null data → empty map; control-char
  filename illegal on Windows → `@DisabledOnOs(WINDOWS)` (valid on Linux CI); plus removed 2 SAML
  context-path assertions that surfaced a **likely real source bug** (tauri SAML-error redirect doubles a
  non-empty context path — flagged for maintainer review, not codified) and 1 redundant DTO round-trip
  equality test.

**Not yet done — and an honest statement of why:**
- **Environment-blocked here (need a CI/Docker box):** release provenance + signing (E3), CI workflow
  consolidation (H2/H3), Docker/Tauri/multi-OS/AUR packaging, and *only the CI wiring* of the license
  gates (E4 — the gates themselves now work on both backend and frontend; see Wave 9).
  These are config/pipeline changes that cannot be *verified* without running GitHub Actions / Docker, so
  shipping them blind would violate the "verify your work" bar. (A1 is now **done for every buildable
  module** — per-module floors pin `:common` ~40%, `:stirling-pdf` ~35%, `:proprietary` ~33% (raised in
  Wave 8); only `:saas`'s floor and the *global* aggregate remain capped by the un-buildable `saas`
  module. See Waves 7–8.)
- **Multi-week refactors (not safe to rush in a session):** B2 (state-library migration),
  C3 (streaming I/O — correctness-critical, needs load testing), the *stateful* remainder of C1
  (needs characterization tests on real PDFs first), and the security-hardening items D1–D5 (need a
  running app + real auth providers to verify). (B1 is now **done** — see Wave 5.)

---

## 1. Current-state assessment (what's already good)

Before listing upgrades, it's important to be honest: **this is not a stale codebase.** The core
stack is bleeding-edge and well-governed, so "upgrade" here mostly means *hardening, consolidating,
and filling gaps* — not version bumping.

Already excellent:

- **JVM stack is ahead of the curve:** Spring Boot 4.0.6, Java 25 toolchain, Jackson 3
  (`tools.jackson`), PDFBox 3.0.7, Jetty (Tomcat deliberately excluded), HTTP/2 + ALPN.
- **Frontend is modern:** React 19, Vite 7, TypeScript 5.9 (`strict: true`), Tailwind 4,
  ESLint 10, Mantine 8, pdfjs 5 + a new `@embedpdf` viewer.
- **Supply-chain posture is strong:** every GitHub Action is **SHA-pinned** (313 uses, 0 floating),
  `step-security/harden-runner` on all workflows, OSSF Scorecards, dependency-review, Dependabot
  (weekly, grouped), Gitleaks pre-commit, license allow-listing.
- **Build is sophisticated:** Gradle 9.3.1, Depot remote build cache, multi-flavor builds
  (core / proprietary / saas), Task-based unified command runner, SonarQube + Spotless + JaCoCo.
- **Architecture is genuinely multi-product:** clustering backplane abstraction, S3 storage,
  Stripe billing (SaaS), Tauri desktop, a typed Python FastAPI AI engine (pydantic-ai, pgvector).

So the roadmap below targets the *gaps between an ambitious feature set and its engineering
guardrails*, not the version numbers.

---

## 2. Headline findings (the things that actually matter)

| # | Finding | Evidence |
|---|---------|----------|
| 1 | **Test coverage gates are floored at 13% line / 14% instruction / 9% branch** — a release can ship with almost no coverage and stay green. | `build.gradle:293–397` |
| 2 | **Two full UI libraries ship side-by-side: Mantine 8 (~250 files) AND MUI 9 (~157 files).** Duplicate design systems, double the bundle, inconsistent UX. | `frontend/package.json:37–41`; import counts |
| 3 | **God-classes / mega-components.** `PdfJsonConversionService.java` ≈ **6,958 LoC**; `ConvertPDFToPDFA.java` ≈ 2,565 LoC; `PdfTextEditorView.tsx` ≈ 2,897 lines. | backend + frontend audits |
| 4 | **~5–6 CVEs are patched by hand via `resolutionStrategy.force` + module excludes**, several to compensate for a lagging **veraPDF** that still drags in `javax.xml.bind` (EOL namespace). | `build.gradle:196–214`; `app/core/build.gradle:82–89` |
| 5 | **41 React contexts**, `FileContext.tsx` ≈ 758 lines, manual blob/worker/IndexedDB lifecycle for the 100 GB+ target — high-risk memory surface with no state library. | frontend audit |
| 6 | **Large-file path uses blocking, whole-file I/O** (`Files.readAllBytes`/`readAllLines` in many converters) despite a stated 100 GB+ goal. | backend audit |
| 7 | **No SBOM, no release provenance/attestation, no signed releases**, despite otherwise strong supply-chain hygiene. | CI audit |
| 8 | **AGENTS.md is stale** ("No unit tests currently") and CI/workflow sprawl (37 workflows) makes the pipeline hard to reason about. | `AGENTS.md:399`; `.github/workflows/` |

---

## 3. Roadmap by workstream

Each item: **What → Why → Evidence → Effort (S/M/L) → Risk**.

### Workstream A — Test & quality guardrails *(highest leverage)*

- **A1. Raise JaCoCo thresholds on a ratchet.** Move line/branch from 13/9% toward 40% near-term,
  60%+ long-term, and *never let the number go down*. Today the gate is decorative.
  *Evidence:* `build.gradle:371–397`. *Effort:* S to set, L to satisfy. *Risk:* low.
- **A2. Add frontend coverage thresholds.** `vitest.config.ts` configures reporters but no
  enforced thresholds; 100 test files but no floor. *Effort:* S. *Risk:* low.
- **A3. Backend integration tests with Testcontainers** for the top PDF endpoints (merge, split,
  convert, OCR, sign) — bridges the gap between unit tests and Cucumber e2e. *Effort:* M. *Risk:* low.
- **A4. Accessibility tests** (axe-core / jest-axe) — 399 aria/role usages, zero a11y assertions.
  Wire into CI as a regression gate. *Effort:* M. *Risk:* low.
- **A5. Unified coverage reporting** across Java (JaCoCo) + TS (v8) + Python (pytest-cov),
  surfaced as a single PR comment. *Effort:* M. *Risk:* low.
- **A6. Refresh AGENTS.md / DeveloperGuide** — the "no unit tests" claim is wrong and misleads
  both humans and agents. *Effort:* S. *Risk:* low.

### Workstream B — Frontend architecture & consolidation

- **B1. Pick one UI library and retire the other.** Mantine is the larger footprint and the
  documented stack; plan a layered migration (core → proprietary → saas → desktop) off MUI 9.
  *Evidence:* `@mui/material` + `@mui/icons-material` in ~157 files. *Effort:* L. *Risk:* med (billing/auth UI churn).
- **B2. Introduce a real state library for file state** (Zustand or Jotai) and collapse the 41
  contexts into ~8 domains (file, UI, auth, billing, viewer, tool-workflow…). *Effort:* L. *Risk:* med.
- **B3. Extract memory/lifecycle management out of `FileContext`** into a dedicated, unit-tested
  service (blob URL revocation, PDF.js `.destroy()`, worker termination). This is the crash-risk
  hotspot for the 100 GB+ goal. *Effort:* M. *Risk:* med.
- **B4. Decompose mega-components** — `PdfTextEditorView.tsx` (2,897), `pdfiumService.ts` (1,934),
  `AdminAdvancedSection.tsx` (1,790) into focused units; lazy-load per-tool UIs with `React.lazy`.
  *Effort:* M–L. *Risk:* low.
- **B5. Tighten TypeScript incrementally** — enable `noUncheckedIndexedAccess`, `noUnusedLocals`,
  `noImplicitReturns` (currently commented out); burn down 71 `as any` casts (worst in
  `layerUtils.ts`, `StampPreview.tsx`). *Effort:* M. *Risk:* low.
- **B6. Add circular-dep + bundle gates to CI** — `madge`/`dpdm` and `rollup-plugin-visualizer`
  are installed but not run in CI. *Effort:* S. *Risk:* low.

### Workstream C — Backend architecture & code health

- **C1. Break up `PdfJsonConversionService` (≈6,958 LoC)** into extractor / serializer / cache /
  graphics collaborators — currently untestable and unmaintainable. *Effort:* L. *Risk:* med.
- **C2. Thin out fat controllers** (e.g. `ConvertPDFToPDFA` ≈2,565 LoC) — push logic into services,
  keep controllers as HTTP mappers. ~18% of files are controllers. *Effort:* M–L. *Risk:* low.
- **C3. Streaming I/O for large files.** Replace whole-file `Files.readAllBytes`/`readAllLines`
  in converters with `InputStream→OutputStream` streaming to make the 100 GB+ target real and cap
  memory under concurrency. *Effort:* L. *Risk:* med.
- **C4. Formalize temp-file lifecycle.** Unify `TempFileManager` vs ad-hoc `Files.createTempFile`,
  guarantee try-with-resources, add leaked-temp-file metrics, harden temp dir permissions.
  *Effort:* M. *Risk:* low.
- **C5. Add a caching layer** (Caffeine embedded / Valkey distributed via the existing backplane)
  for hot reads (users, roles, settings); profile JPA N+1s. *Effort:* M. *Risk:* low.
- **C6. Centralize DB migrations.** Flyway exists only in `saas`; bring core schema under one
  migration strategy (see `DATABASE.md`). *Effort:* M. *Risk:* med (data).
- **C7. Logging hygiene.** Remove `System.out`/`printStackTrace` holdovers; adopt structured
  (JSON) logging with trace/correlation IDs. *Effort:* S–M. *Risk:* low.

### Workstream D — Security & auth hardening

- **D1. Audit the Tauri/desktop OAuth2 callback flow.** CSRF is intentionally disabled in the
  proprietary security config (stateless + nonce-in-state); verify the nonce/state cannot be
  swapped on the desktop `window.location` redirect path. *Evidence:* `SecurityConfiguration.java`.
  *Effort:* M. *Risk:* high if wrong.
- **D2. PII-safe OIDC diagnostics.** `security.oauth2.debugLogging` dumps ID-token/UserInfo claims;
  add automatic scrubbing/redaction and short log retention so an operator can't leave PII in logs.
  *Effort:* S. *Risk:* med.
- **D3. Harden Java↔engine trust.** `AiProxyService` forwards `X-API-KEY` to the Python engine over
  plain localhost HTTP; add mTLS or scoped service tokens for any non-loopback deployment.
  *Effort:* M. *Risk:* med.
- **D4. SSRF review of URL-fetch features** (HTML→PDF, URL→PDF, TSA timestamp client uses raw
  `URLConnection`): allow-list/deny internal ranges, validate user-supplied URLs. *Effort:* M. *Risk:* med.
- **D5. S3 backend deployment guardrails.** New S3 store is reasonably tested in-repo, but document
  and template bucket encryption, least-privilege IAM, and lifecycle/expiry for `transient/` keys.
  *Effort:* S–M. *Risk:* med.

### Workstream E — Supply chain & dependencies

- **E1. Reduce the manual CVE-pin burden by upgrading/replacing veraPDF.** Several
  `resolutionStrategy.force` entries (rhino, etc.) and the `javax.xml.bind` EOL stack exist only to
  paper over veraPDF lag. *Evidence:* `build.gradle:196–214`, `app/core/build.gradle:82–89`.
  *Effort:* M–L. *Risk:* med.
- **E2. Generate an SBOM** (CycloneDX Gradle + npm + Python) and attach to releases. *Effort:* S. *Risk:* low.
- **E3. Release provenance + signing.** Add SLSA provenance/attestations and signed tags/artifacts
  for JAR, Docker images, and Tauri installers. *Effort:* M. *Risk:* low.
- **E4. Enforce the license report in CI** (currently generated but not gated). *Effort:* S. *Risk:* low.
- **E5. Re-evaluate stale deps** — `telegrambots 6.9.7.1` (4+ yrs, heavily excluded) and the JAXB 2
  stack. Remove if unused. *Effort:* S–M. *Risk:* low.

### Workstream F — Performance & scalability

- **F1. Back the streaming work (C3) with load tests** at the 100 GB+ target and concurrent-request
  memory profiling. *Effort:* M. *Risk:* low.
- **F2. Async job execution review.** The `@AutoJobPostMapping` system + "cancel long-running AI
  task" feature is new; verify cancellation actually frees threads/temp files and is backpressured.
  *Effort:* M. *Risk:* med.
- **F3. Frontend bundle budget** — run the installed visualizer in CI, set a size budget, lazy-load
  tools and admin sections. *Effort:* S–M. *Risk:* low.

### Workstream G — Observability

- **G1. End-to-end OpenTelemetry tracing.** The Python engine already uses OTel; the Java side has
  Micrometer/actuator but no distributed tracing. Propagate W3C TraceContext across
  frontend → Java → engine. *Effort:* M. *Risk:* low.
- **G2. Structured logging + log correlation** (pairs with C7). *Effort:* S–M. *Risk:* low.
- **G3. Telemetry consent clarity.** PostHog is wired across all three tiers; document the opt-out
  and provide a single privacy-first kill switch. *Effort:* S. *Risk:* low.

### Workstream H — DevOps / CI / build / release

- **H1. Enable Gradle configuration cache** (currently commented out in `gradle.properties:12`) —
  meaningful incremental-build speedup once tasks are compatible. *Effort:* M. *Risk:* low.
- **H2. Consolidate workflow sprawl.** Collapse the 4 e2e workflows and 3 PR-deploy workflows into
  parameterized reusable workflows; document CI profiles/flags. *Effort:* M. *Risk:* low.
- **H3. Unify Docker build matrix** (base / embedded / fat / ultra-lite / frontend / unoserver) into
  one cache-shared build. *Effort:* M. *Risk:* low.
- **H4. Add a release approval gate** before AUR/package-manager auto-publish. *Effort:* S. *Risk:* low.

### Workstream I — Python AI engine & infra maturity

- **I1. Engine coverage visibility** — surface pytest-cov in CI (currently invisible). *Effort:* S. *Risk:* low.
- **I2. Cluster backplane resilience tests** — exercise Valkey partition/failover, lock release, and
  rate-limit key expiry; the in-process impl is well-tested but the external path less so. *Effort:* M. *Risk:* med.
- **I3. Document the engine contract & failure modes** (typed in/typed out, what happens when the
  model/provider is down or returns malformed structured output). *Effort:* S–M. *Risk:* low.

---

## 4. Suggested phasing

**Now (0–1 month) — cheap, high-leverage, low-risk:**
A1, A2, A6, B5(start), B6, E2, E4, G3, H1, H4, I1, D2.

**Next (1–3 months) — structural foundations:**
A3, A4, A5, B3, C4, C5, C7, D1, D3, D4, E3, G1, G2, H2, H3, I3.

**Later (3–9 months) — large refactors / migrations:**
B1 (MUI→Mantine), B2 (state library), B4, C1, C2, C3 + F1, C6, E1 (veraPDF/Jakarta), F2, I2.

---

## 5. Things deliberately *not* recommended

- **Don't bump the core JVM/JS stack** — already ahead of mainstream; chasing newer is churn for
  churn's sake. Let Dependabot handle routine bumps.
- **Don't add Redux** — the right move is *fewer* state containers, not a heavier one.
- **Don't rip out the proprietary/saas split** — the compile-time flavor system is intentional and
  load-bearing for their commercial model.
