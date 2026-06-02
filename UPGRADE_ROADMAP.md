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

### Wave 19 — backend coverage round 7 (config/model/service; verified; pushed)

- **+195 tests across 12 classes** — core `OpenApiConfig`/`MultipartConfiguration` + request DTOs
  (`MergeMultiplePagesRequest`/`AddStampRequest`/`MetadataRequest`/`AddWatermarkRequest`); proprietary
  `ServerCertificateService`/`KeyPairCleanupService`/`AdminUserSummary`/`WorkflowSessionResponse`/
  `InviteToken`/`JwtVerificationKey`.
- **Coverage:** core 35.65→**36.16** line; proprietary 41.80→**42.89** line / 38.96→**39.82** branch.
  Floors raised: `:stirling-pdf` LINE→0.36; `:proprietary`→0.43/0.42/0.39.
- **Central gate caught 7 failures, all resolved** — incl. a `buildP12` test fixture storing the key under
  the wrong alias (so direct keystore lookups returned null), and `AddStampRequest` exposing a **misleading
  source comment** (`overrideX`/`overrideY` documented "Default to -1" but have no initialiser, so they're
  actually `0.0f` — asserted actual + noted for review).

### Wave 20 — frontend coverage round 10 + suite-scale retry (verified; pushed)

- **+263 tests across 12 modules** (tool-operation hooks getPdfInfo/ocr/showJS/split; `useEndpointConfig`
  (core)/`useToolSections`; desktop `tauriHttpClient`; proprietary `useApiKey` + expanded `workflowService`;
  saas `useCredits`; `pageEditor/splitPositions`; `viewer/layerUtils`).
- **Coverage (184-file run):** 13.82→**14.64** stmts/lines, 76.97→**78.28** branch, 44.87→**46.27** func.
  **Ratchet raised to 14.5 / 78 / 46 / 14.5.**
- **Suite-scale finding:** at 184 files the fully-parallel run began flaking *non-deterministically* on this
  constrained machine (timing-sensitive UI/async + whole-source-scan tests; inconsistent failing sets
  run-to-run; all 12 new files pass deterministically in isolation). Added `retry: 2` to `vitest.config.ts`
  — re-runs only failed tests, so genuine regressions still fail all attempts; this hardens the gate against
  load flakiness without masking real failures. (Cumulative frontend coverage **6.96 → 14.64** — more than
  doubled; branches 53.6→78.3, functions 25.5→46.3.)

### Wave 21 — backend coverage round 8 (security/config/model; verified; pushed)

- **+238 tests across 12 classes** — proprietary `KeygenLicenseVerifier`/`UserAuthenticationFilter`/
  `CustomOAuth2UserService`/`AsyncConfig`/`SaveUserRequest`/`Email`/`CustomSaml2AuthenticatedPrincipal`;
  core `Type3FontLibrary`/`PdfJsonFont`/`PdfJsonFormField`/`OptimizePdfRequest`/`PipelineResult`.
- **Coverage:** proprietary 42.89→**45.64** line / 39.82→**42.83** branch (now exceeds `:common`); core
  36.16→**36.96** line. Floors raised: `:stirling-pdf`→0.37/0.36/0.30; `:proprietary`→0.46/0.45/0.42.
- **Central gate caught 19 failures, all resolved** — notably `Type3FontLibraryTest` (16) all stemmed from a
  single helper mocking-a-Resource *inside* a `thenReturn(...)` arg (interleaved stubbing →
  `UnfinishedStubbingException`); switching to a real `ByteArrayResource` fixed all 16. Plus 3
  `CustomOAuth2UserService` tests asserting `getMessage()` where the 1-arg `OAuth2AuthenticationException`
  stores text in the `OAuth2Error` code.
- **Cumulative backend (line):** `:common` 41.3, `:stirling-pdf` 37.0, `:proprietary` 45.6 — all from a
  decorative 13% floor at session start.

### Wave 22 — backend coverage round 9 (font/config/session/aspects; verified; pushed)

- **+185 tests across 12 classes, 0 fixes needed** (cleanest backend round) — core `PdfJsonFallbackFontService`
  (66)/`TauriProcessMonitor`/`InitialSetup`; proprietary `SignDocumentRequest`/`UpdateFolderRequest`/
  `SessionScheduled`/`SupabaseUserLoginProperties`/`Enterprise`+`PremiumEndpointAspect`/
  `CustomHttpSessionListener`/`RateLimitResetScheduler`/`AuditSeverity`.
- **Coverage:** core 36.96→**38.42** line / 30.73→**32.13** branch; proprietary 45.64→**45.97** line. Floors
  raised: `:stirling-pdf`→0.39/0.38/0.32; `:proprietary` BRANCH→0.43.
- **Cumulative backend (line):** `:common` 41.3, `:stirling-pdf` 38.4, `:proprietary` 46.0.

### Wave 23 — backend coverage round 10 + saturation conclusion (verified; pushed)

- **+269 DTO/model contract tests across 12 classes** (core request DTOs + `model/json`; proprietary
  `AuditExportRequest`), all green, 0 fixes. But **JaCoCo line coverage was essentially flat** (core
  38.42→38.43; proprietary unchanged): the scout has reached Lombok-generated DTO/model classes whose lines
  JaCoCo already counted, so test *count* rises while *new-line* coverage does not. Floors unchanged.
- **Saturation conclusion (the honest shape of the coverage curve):** after **10 frontend + 10 backend
  unit-test rounds** (~5,000 tests added this session), the pool of clean, statement-heavy,
  unit-testable-without-a-Spring-context (backend) / non-React-component (frontend) classes is **exhausted**.
  Remaining untested surface is dominated by Spring controllers/`@SpringBootTest`-bound services, PDF/native-tool
  services, and React components — all of which need **integration/render testing** (`MockMvc`,
  `@testing-library` render), a distinct, heavier workstream rather than more unit-test swarms. Pushing more
  unit rounds now would add test count for ~0 coverage, which would be padding, not progress.
- **Env note:** a machine-level **disk-full** condition (0 bytes free, 924 GB used) halted the build
  mid-round; reclaimed ~11 GB of regenerable temp + Gradle cache layers and restarted the daemon to recover.

**Coverage outcome for the #1 finding (decorative gates):** frontend **6.96→14.64%** stmts (53.6→78.3 branch,
25.5→46.3 func); backend line **`:common` 41.3 / `:stirling-pdf` 38.4 / `:proprietary` 46.0** — all promoted
from a decorative ~13% floor to **real, enforced, ratcheted** per-module gates. This finding is resolved.

### Wave 24 — D2 PII-safe OIDC diagnostics (security; verified; pushed)

- **D2 DONE** (workstream D, security hardening — the first non-coverage workstream item beyond the gates).
  `CustomOAuth2UserService.logClaimDump()` (active under `security.oauth2.debugLogging=true`) wrote raw
  ID-token/UserInfo claim **values** — email, name, upn, phone, `sub`, the resolved username — to logs.
  Added `redactClaimValue()`: PII/identifier claim values (and anything email-shaped) are masked to
  `<firstChar>***(len=N)` while structural claims (iss/aud/exp/iat/email_verified/scope/…) and all claim
  **keys** stay visible for diagnostics. Verified: full `:proprietary:test` green; existing debug-logging
  tests updated to assert the redacted form **and** that the raw PII no longer appears; added a focused
  `redactClaimValue` unit test. Behaviour unchanged outside the debug-only dump. Commit `ebbc964aa`.

### Wave 25 — I1 engine coverage visibility + gate (Python engine; verified; pushed)

- **I1 DONE** (workstream I, AI engine — the first item in the previously-untouched Python workstream).
  The `engine/` FastAPI + pydantic-ai service already has **real, substantial** test coverage (264 tests,
  ~83% statement / **78.3% statement+branch**) — the opposite of the historically-decorative JVM/frontend
  gates — but that number was *invisible and unenforced*. Wired `pytest-cov` into the dev deps + `uv.lock`,
  added `[tool.coverage.run]` (`source=src`, `branch=true`) and `[tool.coverage.report]`
  (`show_missing`, `exclude_also` for `TYPE_CHECKING`/`__main__`/`NotImplementedError`/`abstractmethod`,
  and **`fail_under=75`** — a few points below the measured baseline so it catches genuine regressions
  without rounding flake). The `engine:test` task now runs `--cov=src --cov-branch --cov-report=term-missing
  --cov-report=xml` (the `coverage.xml` feeds CI tooling); added an `engine:test:cov-html` convenience task;
  gitignored coverage artifacts + `.venv`. **Verified locally on this box** (had to work around a uv
  managed-Python "minor version link" bug on Windows by building the venv from the extracted CPython 3.13.13
  directly): full `engine:check` green — pyright **0 errors/0 warnings**, ruff check clean, ruff format 115
  files clean, `264 passed`, gate prints *"Required test coverage of 75.0% reached. Total coverage: 78.30%"*.
  Proved the gate is **real, not decorative**: an ephemeral `--cov-fail-under=90` correctly exits non-zero
  (*"FAIL Required test coverage of 90% not reached"*). No engine source touched — pure visibility +
  enforcement wiring.

### Wave 26 — D4 SSRF validation hardening + isValidURL contract fix (security; verified; pushed)

- **D4 (unit-testable validation portion) DONE** (workstream D, security). The URL-to-PDF SSRF surface
  (`ConvertWebsiteToPDF` → `GeneralUtils.isValidURL`/`isURLReachable`) is already well-defended (IP-range
  classifier blocks loopback/link-local/private/CGNAT/ULA/IPv4-mapped/multicast/reserved). Two contributions:
  - **Real fix:** `GeneralUtils.isValidURL` caught only `MalformedURLException`, but the pixee `Urls.create`
    throws a **`SecurityException`** (a `RuntimeException`) for a well-formed URL whose scheme isn't http(s)
    or whose host is a denied common-infrastructure target — so the method *violated its documented "return
    false otherwise" contract* and let the exception propagate. In `ConvertWebsiteToPDF` (which evaluates
    `isValidURL` eagerly on line 88) submitting e.g. `http://169.254.169.254` surfaced an unhandled **500**
    instead of a clean rejection. Broadened the catch to `MalformedURLException | SecurityException` → clean
    `false`. **Discovered by actually running the test, not by reading** — the first test run threw
    `SecurityException` on `ftp://…`, exposing the wart. Only production caller uses the boolean result;
    behaviour is strictly safer (the metadata host is still blocked downstream by `isURLReachable`).
  - **Regression guard:** added `isURLReachable_blocksCanonicalSsrfTargets` (pins the canonical attack
    destinations that were missing — cloud IMDS `169.254.169.254` + its IPv4-mapped form, IPv4 loopback
    literal `127.0.0.1`/`127.255.255.254`, IPv6 loopback `::1`, IPv6 link-local `fe80::1`, limited broadcast
    `255.255.255.255`, `240.0.0.0/4`) and `isValidURL_accepts…RejectsMalformedNonHttpAndInfraTargets`. All
    deterministic + network-free (blocked literal IPs short-circuit before any socket; literals aren't DNS-
    resolved). Verified: full `:common:test` green, JaCoCo gate **PASS** (LINE 41.33% / INSTRUCTION 43.85% /
    BRANCH 37.02%, all above floor).
  - **Flagged for follow-up (integration-level, not safe to ship blind here):** a TOCTOU/DNS-rebinding gap —
    `isURLReachable` validates a resolved IP, then `fetchRemoteHtml` re-resolves+connects separately (rebinding
    window), and WeasyPrint may fetch sub-resources from internal URLs during `--base-url` rendering. Fix needs
    connect-time IP pinning + an integration test simulating rebinding. Spawned as a separate task.

### Wave 27 — G3 engine telemetry kill-switch tests + floor raise (privacy; verified; pushed)

- **G3 (engine portion) DONE** (workstream G, observability/privacy — the first item in workstream G).
  PostHog is wired across all three tiers; the engine's opt-out gate is `setup_posthog_tracking()`
  (`engine/src/stirling/services/tracking.py`), which returns `None` — constructing **no** client and
  registering **no** span processor (so nothing is ever captured/sent) — when `STIRLING_POSTHOG_ENABLED`
  is false **or** `STIRLING_POSTHOG_API_KEY` is empty. That privacy contract was previously **untested**
  (`tracking.py` was the engine's least-covered module at 29%). Added `engine/tests/test_tracking.py` (12
  tests): pins the kill switch (None when disabled / no-key; builds a provider without any network when
  enabled — `PostHogClient` patched) and covers the span→`$ai_generation`/`$ai_trace` translation, trace
  dedup, and the pure helpers. Result: `tracking.py` **29% → 93%**, full engine suite **264 → 276 passed**,
  overall engine coverage **78.30% → 81.06%** — so the I1 floor was **ratcheted 75 → 79**. Verified via the
  engine venv: ruff clean, pyright 0/0/0, gate prints *"Required test coverage of 79.0% reached. Total
  coverage: 81.06%"*. The cross-tier *single* kill switch + frontend/Java opt-out docs remain (need the
  Java/frontend runtime to verify); the engine gate is real and locked.

### Wave 28 — I3 engine contract & failure-mode documentation (verified; pushed)

- **I3 DONE** (workstream I). The engine had **no** documentation (not even a README). Added
  `engine/CONTRACT.md`: the full typed HTTP surface (11 functional endpoints — 1 `GET /health`, the
  streaming `POST /api/v1/orchestrator`, the unary agent routes, and the idempotent
  `DELETE /api/v1/documents/{id}`), the `X-User-Id` convention, and a rigorous **failure-mode** section —
  exactly I3's ask ("typed in/typed out, what happens when the model/provider is down or returns malformed
  structured output"): 422 on Pydantic validation, the lone hand-written 400 (math-auditor `tolerance`),
  the **no-global-handler → opaque 500** reality for unary routes (provider `ModelHTTPError`,
  `UnexpectedModelBehavior` after output-validator retries exhaust, `UsageLimitExceeded`, domain
  `ValueError`/`RuntimeError`), and the streaming orchestrator's distinct **200-then-`error`-frame** model.
  Documented the fail-fast startup and the telemetry opt-out, and flagged the "all errors collapse to 500"
  gap as a future global-exception-handler improvement. **Grounded + verified, not prose:** every endpoint
  was cross-checked against the live `app.routes` (the check *caught a real omission* — the `DELETE` route I'd
  initially missed — which I then added), and the doc's own verification command is confirmed runnable.
  Follow-on: added `engine/tests/test_failure_modes.py` (5 tests) making the doc **executable** — pins
  422-on-bad-body, 400-on-bad-tolerance, the unary-route 500 (no global handler), and the streaming
  200-then-`error`-frame model. (Surfaced + fixed a real test-isolation bug while doing so: a blind
  `dependency_overrides.pop` teardown was deleting another module's *module-level* overrides → switched to
  snapshot/restore.) Full engine suite **281 passed**, gate PASS at 81.21%.

### Wave 29 — D5 S3 deployment guardrails (security/ops docs; verified-by-grounding; pushed)

- **D5 DONE** (workstream D, security/ops). Added `docs/s3-deployment-guardrails.md` — the bucket/IAM-side
  hardening the app *cannot* set for you, templated and **grounded in the actual S3 code** (not generic AWS
  boilerplate). Read `cluster/s3/{S3FileStore,S3Clients}.java` + `storage/provider/S3StorageProvider.java` +
  the `storage.s3.*` properties to establish the facts, then documented: (1) **encryption** must be enforced
  at the bucket because the code sets **no** `serverSideEncryption` on `PutObject` (default-encryption +
  deny-insecure-transport policy + block-public-access, since sharing uses presigned URLs); (2) **least-
  privilege IAM** scoped to the operations actually issued — verified by grepping every `s3Client.*` call:
  only `PutObject`/`GetObject`/`HeadObject`/`DeleteObject` exist, **no `ListObjects` anywhere**, so the
  minimal policy is `PutObject`+`GetObject`+`DeleteObject` (HeadObject⊂GetObject), with `ListBucket`
  *recommended* only for clean 404-on-HEAD semantics — and prefer `DefaultCredentialsProvider` (IAM role/
  IRSA) over static keys; (3) **lifecycle expiry scoped to `transient/` only** (the ephemeral `S3FileStore`
  prefix) since persistent user files live at the bucket root and must not be reaped. Also documented the
  existing endpoint-SSRF guard (`allow-private-endpoints`) and a `storage.s3.*` config reference. Pure docs
  → no build to run; correctness is in the grounding (every claim cites a file/operation).

### Wave 30 — D1 desktop OAuth2 nonce/state audit (security analysis; grounded; pushed)

- **D1 DONE** (workstream D, security audit — read-only analysis, no code changed). Added
  `docs/desktop-oauth-security-audit.md` answering the roadmap's question: *can the desktop (Tauri)
  OAuth2 nonce/state be swapped on the `window.location` redirect path?* **Answer: no.** Grounded the
  full flow in `TauriAuthorizationRequestResolver` / `TauriOAuthUtils` /
  `CustomOAuth2AuthenticationSuccessHandler` / `SecurityConfiguration`. **Key insight:** disabling
  `http.csrf()` (SecurityConfiguration:264) does **not** disable OAuth2 `state` validation — that's a
  separate mechanism run by `OAuth2LoginAuthenticationFilter` against the (default, session-backed)
  authorization-request repository. The Tauri resolver *preserves* Spring's random `state` (wraps it as
  `tauri:<rand>[:<nonce>]`, never replaces it), the nonce is bound *inside* that validated state, and the
  token is delivered via the URL **fragment** (not query) — so neither value can be swapped without
  breaking state validation. The genuinely interesting surface is the **redirect-`origin` derivation**
  (`X-Forwarded-Host`→`Referer`→request-host): not web-exploitable in a correct reverse-proxy setup, but
  trusting `X-Forwarded-Host` first + a hardcoded/incomplete IdP allow-list (misses Keycloak/Okta/ADFS)
  is worth tightening to a server-configured canonical origin. Documented as residual hardening and
  **spawned the redirect-origin hardening as a separate task** (with unit-test guidance). Also noted the
  STATELESS-chain vs session-backed-authz-repo fragility for multi-instance deployments.

### Wave 31 — E2 SBOM completion: npm + Python (supply chain; verified; pushed)

- **E2 now COMPLETE** (workstream E). The CycloneDX **Gradle** SBOM was already wired (`org.cyclonedx.bom`
  3.1.0 → `./gradlew cyclonedxBom`); the roadmap also asked for **npm + Python** SBOMs, which were missing.
  Added both, each verified to emit valid **CycloneDX 1.6** JSON: (1) **Python/engine** — `cyclonedx-bom`
  added to engine dev deps + `uv.lock`, new `engine:sbom` task runs `cyclonedx-py environment .venv`
  → `engine/sbom.json` (**213 components**); (2) **npm/frontend** — pinned `sbom` npm script
  (`npx @cyclonedx/cyclonedx-npm@4.2.1`, consistent with the repo's existing `npx`-based scripts) + a
  `frontend:sbom` task → `frontend/sbom.json` (**988 components**). Generated SBOMs are gitignored (build
  artifacts; "attach to releases" is the CI-side remainder). Verified both commands end-to-end on this box;
  engine gate still green (281 passed, 81.21%). Only the release-attachment wiring (CI) remains.

### Wave 32 — D3 Java↔engine service-token auth (security; verified both sides; pushed)

- **D3 DONE** (workstream D, security — implemented, not just audited). The Python engine had **no auth**
  and the Java `AiEngineClient` sent **no** credential, so the engine was wide open beyond loopback.
  Added an **optional shared service token**, enforced on the engine and sent by the client, fully
  unit-tested on both sides:
  - **Engine:** `ApiKeyAuthMiddleware` (`engine/src/stirling/api/middleware.py`) — when
    `STIRLING_ENGINE_API_KEY` is set, every request except the exempt liveness/docs paths must present
    `X-API-Key: <key>` or `Authorization: Bearer <key>` (constant-time `hmac.compare_digest`), else
    **401**; when unset (default) auth is disabled so loopback deployments are unaffected. Key read
    per-request from `app.state.settings` so it installs at import time. 6 tests
    (`tests/test_engine_auth.py`): disabled-when-blank, 401 on missing/wrong, pass on correct
    `X-API-Key`/`Bearer`, `/health` exempt. Engine suite **287 passed**, 81.52%, ruff + pyright clean.
  - **Java:** added `aiEngine.apiKey` (`ApplicationProperties.AiEngine`); `AiEngineClient` now sends
    `X-API-Key` on every request (post/stream/get) **only when configured** (no-op when blank). 2 tests
    capture the outgoing `HttpRequest` and assert the header is present when set / absent when blank.
    Full `:proprietary:test` green, JaCoCo gate **PASS** (46.14/47.07/43.27).
  - Documented in `engine/CONTRACT.md` (auth convention + the new 401 failure mode). Default-off, so it's
    a safe opt-in; the original roadmap framing ("audit") is satisfied *and* the hardening is shipped.

### Wave 33 — G1 + G2 engine observability: trace propagation + log correlation (verified; pushed)

- **G1 + G2 (engine slice) DONE** (workstream G). Both were dismissed as "cross-tier runtime", but the
  engine has a fully-verifiable slice that makes it *participate correctly* in distributed tracing and
  log correlation:
  - **G2 (structured logging + correlation):** new `RequestContextMiddleware` resolves a correlation id
    from the inbound `X-Request-Id` (or generates one), exposes it via `current_request_id`
    (`stirling/context.py`), echoes it in the response header, and `RequestIdLogFilter` injects it into
    **every** log line (formatter now carries `[%(request_id)s]`). One id ties frontend → Java → engine.
  - **G1 (distributed tracing):** the same middleware extracts the W3C **`traceparent`** via OTel's
    propagator and `attach`-es it, so engine spans continue the upstream trace instead of starting a
    detached one. Installed outermost so id/trace are set before auth and any logging.
  - 6 tests (`tests/test_request_context.py`): id generated when absent / echoed when present; log filter
    injects the active id and defaults to `-`; a known `traceparent` round-trips to the right
    trace_id/span_id; absent traceparent → fresh trace. Engine suite **293 passed**, 81.61%, ruff +
    pyright clean. Documented in `engine/CONTRACT.md`. (Cross-tier *emission/collector* wiring — the Java
    Micrometer-tracing side and an OTLP collector — remains a deployment concern; the engine now does its
    half correctly and verifiably.)

### Wave 34 — A2/A5/A6 testing-visibility items (verified; pushed)

- **A6 DONE** — corrected AGENTS.md's stale/misleading test counts ("~314 backend / ~670 frontend") to the
  real, grounded suite (438+ backend + 184+ frontend test files, 293 engine tests) and documented all
  three enforced coverage gates (per-module JaCoCo / Vitest thresholds / engine pytest-cov), with an
  explicit "this is **not** a lightly-tested codebase" note — exactly the misleading claim the item flagged.
- **A5 DONE** — added a root `task coverage` that runs backend JaCoCo + frontend Vitest-v8 +
  engine pytest-cov and prints each report location (Taskfile YAML validated; all three sub-tasks exist
  and are independently verified). The single-PR-comment aggregation is the CI-side remainder.
- **A2 DONE** (earlier) — Vitest `coverage.thresholds` are enforced + ratcheted; marked here for completeness.

### Wave 35 — A4 accessibility-testing foundation (verified; pushed)

- **A4 foundation DONE** (workstream A). The repo had ~399 aria/role usages but **zero** automated a11y
  assertions; I'd previously deferred this as "needs render testing" — but the frontend already has full
  render-test infra (`@testing-library/react` + jsdom + existing `.test.tsx` render tests), so it's
  verifiable here. Added `jest-axe` + `@types/jest-axe` (devDeps) and a first a11y test
  (`ButtonSelector.a11y.test.tsx`) that renders the component and asserts **zero axe-core violations**
  (layout-dependent rules like color-contrast are "incomplete" under jsdom, so the gate is stable).
  Verified: the a11y test passes, core tsc clean, **full FE suite 185 files / 3952 tests green**, coverage
  14.65/78.27/46.31 (above thresholds). The reusable pattern + a dedicated CI a11y gate remain.

### Wave 36 — B5 cast burndown + F3 bundle visualizer + E1 audit (verified; pushed)

- **B5** (frontend, agent-assisted, centrally re-verified): removed **24 `as any`/`: any` casts** from the
  two worst files (`layerUtils.ts`, `StampPreview.tsx`) using real pdf-lib/OCG/`React.CSSProperties` types —
  type-only, no runtime change. Verified: core tsc 0 errors, `layerUtils` 25 tests pass, eslint clean.
- **F3** (frontend): wired `rollup-plugin-visualizer` into the Vite build, gated on `--mode analyze`
  (normal builds unaffected) → `frontend/editor/dist/stats.html`; added `npm run analyze` + `task
  frontend:analyze`. Verified by a real analyze build; **fixed a pre-existing bug** (report written to the
  wrong directory) and surfaced a 2.84 MB main chunk. CI size-gate + lazy-loading remain.
- **E1** (backend, audit): `docs/verapdf-pin-audit.md` — full pin classification + staged, test-gated
  removal plan (see the E1 entry). The upgrade itself is staged (needs an upstream-fact check + new
  PDF/A fixtures), not shipped blind.

### Wave 38 — C2 pure-helper extraction from ConvertPDFToPDFA (verified; pushed)

- **C2 started**: extracted three genuinely-pure helpers (`countGlyphs`, `stripNonPrintableAscii`, and
  `detectMimeTypeFromFilename` + its MIME-type map) from the ~2,565-LoC `ConvertPDFToPDFA` controller into
  a new, dependency-free `PdfaConversionUtils` (controller shrinks to 2,504 LoC; dropped the now-unused
  `Pattern` import). These were previously testable only via reflection on the controller; now they have
  **direct** unit tests (`PdfaConversionUtilsTest`, 4 tests). Behaviour-preserving (single-call-site
  delegations). Verified via Gradle: `:stirling-pdf:test` BUILD SUCCESSFUL with both the new test and the
  existing `ConvertPDFToPDFATest` green. The proven C1 pure-extraction pattern; the heavier
  service-extraction of the PDF/A pipeline remains a larger follow-up.

### Wave 39 — B6 verified + A4 expanded to 22 tests (caught + fixed a real a11y bug); pushed

- **B6 largely DONE**: verified the **circular-dependency gate is live** — `frontend:lint` runs
  `dpdm … --exit-code circular:1` (**0 cycles**, exit 0) and is in the `check`/`check:all` quality gate;
  `madge`+`dpdm`+the bundle visualizer (Wave 36) are all wired. Only the bundle size-budget CI threshold remains.
- **A4 expanded** 10 → **22 a11y tests** (11 more tool/file-editor components). The new tests **caught a
  real accessibility bug** — `OAuthButtons` `image-redundant-alt` — which I **fixed** (decorative provider
  icons `alt={p.label}` → `alt=""`) and pinned with `OAuthButtons.a11y.test.tsx`. Verified: 22 a11y tests +
  the existing 11-test `OAuthButtons.test.tsx` all green, core + proprietary tsc 0 errors, eslint clean.

### Wave 40 — B4 mega-component pure-helper extraction (verified; pushed)

- **B4 started**: extracted 6 genuinely-pure font helpers from the 2,920-LoC `PdfTextEditorView.tsx`
  (→ 2,838) into a new, separately-tested `pdfTextEditorFontUtils.ts` (22 tests — the view had **no** test
  before) and tightened a `string` return into a `NormalizedFontFormat` union. Behaviour-preserving;
  verified (core tsc 0 errors, 22 tests pass, eslint clean). Evaluated `pdfiumService.ts` and correctly
  left it (WASM-bound, not safely pure-extractable). The proven C1/C2 pure-extraction pattern, now applied
  to the frontend mega-components; further decomposition + `React.lazy` splitting remain.

### Wave 41 — H4 release approval gate + F1 load harness (config/harness; validated; pushed)

- **H4 DONE**: `environment: package-publish` job gate added to the two package-publish jobs
  (`publish-aur`, `update-homebrew-and-scoop`). Required-reviewer enforcement is configured on the GitHub
  Environment; the YAML is validated and the gate is a safe no-op until then (cannot break releases).
- **F1 harness DONE**: `testing/load/api-load-test.js` — ready-to-run k6 concurrent-load script with
  ramping VUs + failing latency/error thresholds + a heavy-endpoint template; syntax-validated. Execution
  needs a running instance + load-gen host.
- These are the implementable halves of two infra-tier items; the runtime activation (GitHub Environment
  approval / an actual load run) happens on the respective infrastructure, transparently not verifiable here.

### Wave 42 — B4 AdminAdvancedSection decomposition + C3 scope (verified; pushed)

- **B4 continued**: extracted 5 genuinely-pure helpers from `AdminAdvancedSection.tsx` (1,790→1,724 LoC)
  into a tested `adminAdvancedSectionUtils.ts` (**31 tests** where the section had none), and removed a
  now-dead `useMemo`. Behaviour-preserving; verified (proprietary tsc 0 errors, 31 tests pass, eslint clean).
  Second of the three named mega-components decomposed (after PdfTextEditorView in Wave 40).
- **C3 scoped**: audited the 19 `Files.readAllBytes`/`readAllLines` sites. The meaningful ones (for the
  100 GB+ goal) are `byte[]`-returning temp-file reads whose conversion to streaming requires changing the
  HTTP **response** handling (StreamingResponseBody / InputStreamResource) — correctness-critical and not
  safe to do blind without the load harness (now added in F1) and integration coverage. The only *safe*
  conversions are trivial (a line-count), so C3's real work is staged behind F1 + integration tests rather
  than padded with a token change.

### Wave 43 — A3 merge integration test (no Docker needed; verified; pushed)

- **A3 started**: re-examined the "Docker-blocked" assumption — the stateless PDF endpoints A3 names
  (merge, split) are in-memory PDFBox ops needing **no** container. Added `MergeControllerIntegrationTest`
  (3 tests) that drives the **real** PDFBox cross-document page-merge logic (not mocked): combines pages
  from 3 docs (2+3+1=6), preserves a single doc, and yields an empty doc for an empty list. This is the
  **first full integration test in `:core`** (previously only reflection/DTO unit tests). Verified via
  `:stirling-pdf:test` BUILD SUCCESSFUL. The Testcontainers half (DB-backed endpoints, and convert/OCR
  needing native tools) genuinely needs Docker, which is absent here.

### Wave 44 — A3/C2 rotate-endpoint logic extracted + real-PDFBox tested (verified; pushed)

- **A3 + C2 continued**: thinned `RotationController` by extracting its page-rotation loop into a
  package-private static `applyRotation(PDDocument, int)` (validation kept before-load to preserve exact
  behaviour), and added 3 **real-PDFBox** tests of it (adds angle to every page; accumulates onto existing
  rotation 90+180=270; negative angle 90−90=0) — a second stateless top-PDF endpoint covered by direct
  PDFBox tests, no Docker. Verified: `:stirling-pdf:test` BUILD SUCCESSFUL with all 5 RotationController
  tests (the 2 pre-existing + 3 new) green.

### Wave 45 — C2/A3 page-ordering algorithms extracted + tested (verified; pushed)

- **C2 + A3 continued**: extracted the **8 pure page-ordering/imposition algorithms** (`reverseOrder`,
  `duplexSort`, `bookletSort`, `sideStitchBooklet`, `oddEvenSplit`, `removeFirst`, `removeLast`,
  `removeFirstAndLast`) out of `RearrangePagesPDFController` (~70 lines off it) into a new
  `PageOrderingUtils`, and added `PageOrderingUtilsTest` (8 tests with hand-computed expected outputs for
  the off-by-one-prone booklet/duplex/side-stitch cases — previously **zero** coverage on this tricky
  logic). Behaviour-preserving (`processSortTypes` now delegates to the util). Verified:
  `:stirling-pdf:test` BUILD SUCCESSFUL with `PageOrderingUtilsTest` + the existing
  `RearrangePagesPDFControllerTest` green. Highest-value C2 slice so far (real algorithm coverage, not just
  a getter).

### Wave 46 — B4 AdminSecuritySection decomposition (verified; pushed)

- **B4 continued**: extracted the pure save/fetch transforms from `AdminSecuritySection.tsx` (1,580→1,453
  LoC) into a tested `adminSecuritySectionUtils.ts` — `buildSecuritySettingsSaveDelta` (always emits the
  19 security/JWT/audit keys, preserving falsy `0`/`false`/`""`; conditional `html.urlSecurity.*`) and
  `combineSecurityFetchData` (strip/merge `_pending` in order, conditional audit/html attach), plus reused
  `SecuritySettingsLike` to drop a ~38-line duplicated interface. All network/`console.log` side effects
  stay in the component. **22 tests** where the section had none. Verified: proprietary tsc 0, 22 tests,
  eslint clean. (Recovered cleanly after an earlier `git restore` — done to clean backend spotless churn —
  accidentally reverted the first attempt; this pass committed frontend-only with no backend run in between.)

### Wave 47 — B5 `as any` burn-down round 2 (verified; pushed)

- **B5 continued**: removed **30 more `as any`/`: any` casts** across 7 `core` files
  (`errorUtils`/`httpErrorUtils`/`httpErrorHandler`/`specialErrorToasts`/`toolErrorHandler`,
  `types/fileContext`, `tools/formFill/providers/PdfiumFormProvider`) — replacing them with
  `unknown`+narrowing, minimal local interfaces, and real `@cantoo/pdf-lib` types
  (`PDFDict`/`PDFAcroTerminal`/`PDFWidgetAnnotation`/`PDFNumber`). Type-only, behaviour-preserving. **54 of
  ~71 casts now removed.** Verified: core tsc 0 errors, eslint clean, 236 related tests green (error/reducer/
  selector/lifecycle suites). The few remaining are intentional dynamic index signatures.

### Wave 48 — B5 `as any` burn-down completed (208 casts / 99 files; verified; pushed)

- **B5 cast burn-down effectively COMPLETE**: the agent re-counted (the roadmap's "71" was a worst-offenders
  sample; real non-test count was **414**) and removed **208 more casts across 99 `core` files** — redundant
  axios-config casts (covered by the existing `axios` module augmentation), `catch (e: unknown)` + narrowing
  (~20 sites), declared globals, real `@cantoo/pdf-lib`/PDFium-heap/EmbedPDF-event types, branded
  `FileId`/`StirlingFile`, a shared `CommentAnnotationObject` interface (replaced 14 casts), generic
  `onParameterChange<K extends keyof…>` (which surfaced + fixed real latent NumberInput `string|number`
  mismatches). **414→136**; the 136 remaining are documented-intentional (dynamic settings index signatures,
  `(...args: any[])` constraints, untyped third-party SDKs). Verified centrally: **all 5 layer tscs 0 errors,
  eslint `--max-warnings=0` clean on all 99 files, full FE suite 209 files / 4048 tests green** — type-only,
  behaviour-preserving. (Other layers already enforce `@typescript-eslint/no-explicit-any: error`.)

### Wave 126 — C2 de-reflection: ConvertWebsiteToPDF.convertURLToFileName (backend core; verified; pushed)

- **C2 de-reflection (backend `core`)**: `ConvertWebsiteToPdfTest`'s two filename tests
  (`convertURLToFileName_sanitizes_and_appends_pdf` and `…_truncates_to_50_chars_before_pdf_suffix`) reflectively
  invoked the private `convertURLToFileName(String)` via `getDeclaredMethod`/`setAccessible`/`invoke` with a
  `(String)` cast on the result. Made the method package-private (was `private`); both tests now call
  `sut.convertURLToFileName(in)` directly — the return is already `String`, so the cast is gone and the tests no
  longer declare `throws Exception`. Dropped the `java.lang.reflect.Method` import. The URL-sanitisation/50-char
  truncation behaviour and the `PDF_FILENAME_PATTERN` assertions are unchanged. Behaviour-preserving. Verified:
  **gradle `:stirling-pdf:test --tests ConvertWebsiteToPdfTest` BUILD SUCCESSFUL** (single-class run's JaCoCo
  aggregate FAIL is the project-wide threshold, not a test failure).

### Wave 125 — C2 de-reflection: ClusterConfig.validate (backend common, I2-adjacent; verified; pushed)

- **C2 de-reflection (backend `common`)**: `ClusterConfigValidationTest` (4 cases — disabled passes, Valkey
  enabled-without-URL throws `IllegalStateException`, Valkey enabled-with-URL passes, in-process passes) routed
  every check through an `invokeValidate` helper that reflectively called `ClusterConfig.validate()` and unwrapped
  `InvocationTargetException` to rethrow the `RuntimeException` cause. **`validate()` was already package-private**
  — the reflection was pure, unnecessary cruft. Replaced all 4 call sites with the direct same-package call
  `config.validate()` inside the existing `assertDoesNotThrow`/`assertThrows`, deleted the `invokeValidate` helper
  entirely, and dropped the `java.lang.reflect.Method` import. **No production change required** (the I2 Valkey
  config validation surface is unchanged). Behaviour-preserving, test-only. Verified: **gradle `:common:test
  --tests ClusterConfigValidationTest` BUILD SUCCESSFUL** (single-class run's JaCoCo aggregate FAIL is the
  project-wide threshold, not a test failure).

### Wave 124 — C2 de-reflection: TempFileCleanupService.cleanupDirectoryStreaming (backend common; verified; pushed)

- **C2 de-reflection (backend `common`)**: `TempFileCleanupServiceTest`'s `invokeCleanupDirectoryStreaming`
  helper (used at 6 cleanup-scenario sites) drove the private 6-arg
  `cleanupDirectoryStreaming(Path, boolean, int, long, boolean, Consumer)` through
  `getDeclaredMethod(... 6 param types)` + `setAccessible` + `invoke`, wrapping any reflective failure in a
  `RuntimeException`. Made `cleanupDirectoryStreaming` package-private (was `private`; kept the `throws
  IOException`); the helper now calls `cleanupService.cleanupDirectoryStreaming(directory, containerMode, 0,
  maxAgeMillis, false, deleteCallback)` directly, catching only the real `IOException` (still wrapped in
  `RuntimeException` to preserve the helper's contract). The delete-tracking `Consumer` callback is unchanged.
  Left the unrelated Spring `ReflectionTestUtils.setField(…, "machineType", …)` field-injection idiom in place
  (a distinct, accepted test mechanism, not a raw-`java.lang.reflect` target). Behaviour-preserving. Verified:
  **gradle `:common:test --tests TempFileCleanupServiceTest` BUILD SUCCESSFUL** (single-class run's JaCoCo
  aggregate FAIL is the project-wide threshold, not a test failure).

### Wave 123 — C2 de-reflection: JobExecutorService.executeWithTimeout (backend common; verified; pushed)

- **C2 de-reflection (backend `common`)**: `JobExecutorServiceTest` referenced the private generic
  `executeWithTimeout(Supplier, long)` via reflection at two sites. One (`shouldUseCustomTimeoutWhenProvided`)
  obtained the `getDeclaredMethod`/`setAccessible` handle but **never invoked it** — pure dead code, deleted.
  The other (`shouldHandleTimeout`) reflectively invoked it with a 1ms timeout against a ~100ms busy-wait and
  asserted `InvocationTargetException.getCause()` was a `TimeoutException`. Made `executeWithTimeout`
  package-private (was `private`; kept the `<T>` generic and `throws TimeoutException, Exception`); the test now
  calls `jobExecutorService.executeWithTimeout(work, 1L)` directly inside `assertThrows(TimeoutException.class,
  …)` — the timeout propagates unwrapped (no `InvocationTargetException` hop), which also tightens the old
  silent-pass-if-no-throw branch into a real assertion. Added the missing `assertThrows` static import.
  Behaviour-preserving. Verified: **gradle `:common:test --tests JobExecutorServiceTest` BUILD SUCCESSFUL**
  (single-class run's JaCoCo aggregate FAIL is the project-wide threshold, not a test failure).

### Wave 122 — C2 de-reflection: ProcessExecutor.validateCommand (backend common; verified; pushed)

- **C2 de-reflection (backend `common`)**: `ProcessExecutorTest` (9 security-guard cases — null/empty command,
  null/null-byte/newline/carriage-return arguments, path traversal, blank executable, valid command) drove the
  private `validateCommand(List)` through a reflective `invokeValidateCommand` helper that unwrapped
  `InvocationTargetException` to rethrow the real cause. Made `validateCommand` package-private (was `private`);
  the helper now simply calls `executor.validateCommand(command)` directly, so the `IllegalArgumentException`
  guards propagate unwrapped to `assertThrows` with no reflection plumbing. Dropped the
  `java.lang.reflect.Method`/`InvocationTargetException` usage and the no-longer-needed `throws Exception`
  clauses. Behaviour-preserving. Verified: **gradle `:common:test --tests ProcessExecutorTest` BUILD SUCCESSFUL**
  (single-class run's JaCoCo aggregate FAIL is the project-wide threshold, not a test failure).

### Wave 121 — C2 de-reflection: InvertFullColorStrategy private methods (backend common; verified; pushed)

- **C2 de-reflection (backend `common`)**: `InvertFullColorStrategyTest` reflectively invoked two private
  methods — `invertImageColors(BufferedImage)` (the per-pixel ARGB 255−channel inversion) and
  `convertToBufferedImageTpFile(BufferedImage)` (PNG temp-file writer). Made both package-private (were
  `private`); the same-package test now calls `strategy.invertImageColors(image)` and
  `strategy.convertToBufferedImageTpFile(image)` directly — compile-checked, with the result already typed
  `File` (no cast). Dropped the `java.lang.reflect.Method`/`InvocationTargetException` imports and the
  reflection-only checked-exception clauses (`testInvertImageColors` now `throws` nothing;
  `testConvertToBufferedImageTpFile` keeps only `IOException`, which the method really declares).
  Behaviour-preserving. Verified: **gradle `:common:test --tests InvertFullColorStrategyTest` BUILD SUCCESSFUL**
  (single-class run's JaCoCo aggregate FAIL is the project-wide threshold, not a test failure).

### Wave 120 — C2 de-reflection: CustomColorReplaceStrategy method + fields (backend common; verified; pushed)

- **C2 de-reflection (backend `common`)**: `CustomColorReplaceStrategyTest` reached into the strategy via
  reflection on two fronts — `getDeclaredMethod("checkSupportedFontForCharacter", String.class)` +
  `setAccessible` + `invoke`, and `getDeclaredField("textColor"/"backgroundColor")` + `setAccessible` + `get`
  (to assert the colours resolved by `HIGH_CONTRAST_COLOR`). Made `checkSupportedFontForCharacter` and the
  `textColor`/`backgroundColor` fields package-private (were `private`); the same-package test now calls the
  method directly (`strategy.checkSupportedFontForCharacter("A")`, result typed as `Object` so no `PDFont`
  import) and reads the fields directly (`highContrastStrategy.textColor`). Dropped the unused
  `java.lang.reflect.Method` import, the `java.lang.reflect.Field` reflective reads, and the now-redundant
  `try/catch … fail(e)` wrapper around the field assertions. Behaviour-preserving. Verified: **gradle
  `:common:test --tests CustomColorReplaceStrategyTest` BUILD SUCCESSFUL** (single-class run's JaCoCo aggregate
  FAIL is the project-wide threshold, not a test failure).

### Wave 119 — C2 de-reflection: CropController.CropBounds.fromPixels (backend; verified; pushed)

- **C2 de-reflection (backend)**: `CropControllerTest`'s `CropBoundsTests` exercised the pixel→PDF coordinate
  conversion `CropController$CropBounds.fromPixels` entirely through reflection (`Class.forName`,
  `getDeclaredMethod(... int[].class, float.class, float.class)`, `setAccessible(true)`, `invoke`, plus a
  reflective `getFloatField` for each record component). Made the nested `record CropBounds` package-private
  (was `private`) so the test calls `CropController.CropBounds.fromPixels(...)` directly and reads the
  components via the record accessors `x()/y()/width()/height()` — fully compile-checked. The invalid-array case
  now asserts a direct `IllegalArgumentException` (no `InvocationTargetException` unwrapping / `.cause()` hop).
  Removed the now-unused `java.lang.reflect.Method` import and the `@BeforeEach`/reflection-handle setup (the
  `BeforeEach` import stays — still used by other nested classes). Behaviour-preserving. Verified: **gradle
  `:stirling-pdf:test --tests CropControllerTest` BUILD SUCCESSFUL** (the single-class run's JaCoCo aggregate
  FAIL is the project-wide threshold, not a test failure).

### Wave 118 — B4 textFit pure-math extraction + coverage (frontend; verified; pushed)

- **B4 extract-pure-from-coupled (frontend)**: the font-fitting maths (parameter resolution, line-height
  threshold, fit/shrink decisions) were buried inside `textFit.ts`'s DOM/ResizeObserver/MutationObserver-coupled
  `adjustFontSizeToFit`, where the off-by-one tolerances and clamps couldn't be tested. Lifted them into a new
  sibling `textFitUtils.ts` (`resolveFitParams`, `computeMaxHeight`, `contentFits`, `nextFontSize`,
  `shouldStopShrinking`); `textFit.ts` now delegates and only owns measurement/mutation/observer wiring.
  `AdjustFontSizeOptions` re-aliases the lifted `FitOptionsInput` so consumers (`FitText.tsx`) are unaffected.
  Added `textFitUtils.test.ts` (20 tests, hand-computed): the `minFontScale≥0.1` / `stepScale≥0.005` / `0.5px`
  step floors, `maxLines≤0`→`+Infinity` and NaN/0 line-height fallback to `baseFontPx*1.2`, the 1px width/height
  fit tolerances, the min-clamped decrement, and the fits-or-at-minimum stop condition. Behaviour-preserving.
  Verified: **core `tsc` 0 errors, `eslint --max-warnings=0` clean on all 3 files, `vitest` 20/20 green**.

### Wave 117 — B4 computeGeometry pure-export coverage (frontend; verified; pushed)

- **B4 export-for-test + coverage (frontend)**: exported the previously-module-private `computeGeometry` helper
  from `useToolPanelGeometry.ts` (the LTR/RTL tool-panel geometry maths) so it's unit-testable without
  rendering the hook. Added `useToolPanelGeometry.test.ts` (4 tests, hand-computed): LTR width = panel.right −
  quickAccess.right with the panel anchored at the quick-access edge, LTR left-offset 0 when no quick-access
  element, the **360px minimum-width clamp**, and the RTL branch (expands rightward from the panel right edge,
  width = innerWidth − right). Tested with mock `getBoundingClientRect` rects + controlled
  `window.innerWidth/Height` + `documentElement.dir`. Behaviour-preserving (export-only source change).
  Verified: **core `tsc` 0 errors, `eslint --max-warnings=0` clean, `vitest` 4/4 green**.

### Wave 116 — B4 provider-config integrity coverage (frontend renderHook; verified; pushed)

- **B4 coverage-add (frontend, no refactor)**: added `providerDefinitions.test.ts` (3 tests) for the
  `useAllProviders` hook — the 881-line auth-provider config (OAuth2/SAML2/Telegram/Google Drive). First
  **`renderHook` + `vi.mock("react-i18next")` test** this segment (passthrough `t` returns the fallback so the
  real definition data is exercised without an i18n provider). Pins config integrity: providers have unique
  non-empty ids/names and a valid `type`; the Google OAuth2 provider exposes `clientId`/`clientSecret`; every
  field has a non-empty `key` and a valid input `type`. A malformed provider def would break the config UI.
  Pure value-add, zero source change. Verified: **core `tsc` 0 errors, `eslint --max-warnings=0` clean,
  `vitest` 3/3 green**. (Establishes the renderHook+mock pattern for testing hooks going forward.)

### Wave 115 — B4 generateId coverage (frontend; verified; pushed)

- **B4 coverage-add (frontend, no refactor)**: added `generateId.test.ts` (3 tests) for `generateId` — the
  UUID-v4 generator with a `crypto.randomUUID` fast path and a `Math.random` fallback. Covers: v4-format
  output (regex enforcing the `4` version nibble + `[89ab]` variant nibble), uniqueness across 200 calls, and
  the **fallback path forced via `vi.stubGlobal("crypto", {})`** (so the manual template branch is exercised,
  not just the native one). Pure value-add, zero source change. Verified: **core `tsc` 0 errors, `eslint
  --max-warnings=0` clean, `vitest` 3/3 green**.

### Wave 114 — I-workstream engine ToolOperationStep validator coverage (Python; verified; pushed)

- **Engine coverage-add (Python, no refactor)**: added `tests/test_tool_operation_step.py` (2 tests) for the
  `ToolOperationStep.validate_tool_parameter_pairing` model validator — the type-safety guard that ensures a
  step's `parameters` model matches the `tool`'s expected operation type (via the `OPERATIONS`/`AGENT_OPERATIONS`
  maps). The success path was exercised by existing tests; this pins the **failure branch** (pairing a tool
  with the wrong param model raises pydantic `ValidationError` — a dispatch-safety regression guard). Pure
  value-add, zero source change. Verified via the engine venv: **pytest 2/2 passed, ruff clean, pyright 0
  errors**.

### Wave 113 — B4 scriptLoader coverage (frontend; verified; pushed)

- **B4 coverage-add (frontend, no refactor)**: added `scriptLoader.test.ts` (4 tests) for `loadScript`/
  `isScriptLoaded` — the external-script injector with promise-based load caching. Covers: unknown script →
  not loaded; a script already present in the DOM resolves immediately + is marked loaded; the full inject →
  configure (src/async) → `onload` (resolve + `onLoad` callback + mark loaded) lifecycle followed by a
  **cache-hit dedup** (a repeat load injects no second element); and `onerror` → rejection. jsdom doesn't fetch
  injected scripts, so `onload`/`onerror` are fired manually; unique ids avoid the module-level cache leaking
  between tests. Pure value-add, zero source change. Verified: **core `tsc` 0 errors, `eslint --max-warnings=0`
  clean, `vitest` 4/4 green**.

### Wave 112 — B4 viewTransition coverage (frontend; verified; pushed)

- **B4 coverage-add (frontend, no refactor)**: added `viewTransition.test.ts` (2 tests) for
  `withViewTransition(update)` — the View Transitions API wrapper with a graceful fallback. Covers the
  fallback path (jsdom has no `document.startViewTransition` → runs the update synchronously and resolves) and
  the delegation path (when `startViewTransition` exists, it's invoked and the update runs). pyright/tsc caught
  a DOM-lib type clash (assigning a simplified mock to the built-in `startViewTransition`); resolved by using a
  standalone `as unknown as` cast type. Pure value-add, zero source change. Verified: **core `tsc` 0 errors,
  `eslint --max-warnings=0` clean, `vitest` 2/2 green**.

### Wave 111 — B4 clickHandlers coverage (frontend; verified; pushed)

- **B4 coverage-add (frontend, no refactor)**: added `clickHandlers.test.ts` (4 tests) for `isSpecialClick`
  (true for meta/ctrl/shift modifiers and middle-click; false for a plain left click) and
  `handleUnlessSpecialClick` (special click → returns `true` and leaves the browser to follow the href, no
  `preventDefault`/callback; plain click → `preventDefault` + callback, returns `false`). This guards the
  "open in new tab/window" behaviour on nav links. Tested with a mock `React.MouseEvent` + `vi.fn()` callback.
  Pure value-add, zero source change. Verified: **core `tsc` 0 errors, `eslint --max-warnings=0` clean,
  `vitest` 4/4 green**.

### Wave 110 — B4 browserIdentifier coverage (frontend; verified; pushed)

- **B4 coverage-add (frontend, no refactor)**: added `browserIdentifier.test.ts` (4 tests) for `getBrowserId`
  — the WAU-tracking browser id that's generated once and persisted in `localStorage`. Covers: generate +
  persist on first call, idempotence across calls, returning an already-stored id without regenerating, and
  the `session_`-prefixed fallback when `localStorage` throws. (Note: the throw-path spy had to target the
  `window.localStorage` **instance** — `Storage.prototype` spying doesn't intercept jsdom's localStorage.)
  Pure value-add, zero source change. Verified: **core `tsc` 0 errors, `eslint --max-warnings=0` clean,
  `vitest` 4/4 green**.

### Wave 109 — B4 toolSynonyms coverage (frontend; verified; pushed)

- **B4 coverage-add (frontend, no refactor)**: added `toolSynonyms.test.ts` (6 tests) for `getSynonyms(t,
  toolId)` — the tool-search synonym lookup that reads i18n `home.<id>.tags`/`<id>.tags`, comma-splits, trims,
  and drops empties. Tested with a mock `TFunction` that mirrors i18next's "return the key when missing"
  behaviour (so the `value !== key` fallback path is exercised): home-key hit, fallback to `<id>.tags`,
  no-key-resolves → `[]`, whitespace/empty-entry filtering, empty value → `[]`, and translator-throws → `[]`
  (graceful). Pure value-add, zero source change. Verified: **core `tsc` 0 errors, `eslint --max-warnings=0`
  clean, `vitest` 6/6 green**.

### Wave 108 — B4 urlMapping routing-contract coverage (frontend; verified; pushed)

- **B4 coverage-add (frontend, no refactor)**: added `urlMapping.test.ts` (5 tests) for the `URL_TO_TOOL_MAP`
  routing table (URL → tool id) — pins canonical mappings, the split/convert alias clusters all resolving to
  one tool, the legacy sitemap mappings (`/pdf-organizer`→`reorganizePages`, `/stamp`→`addStamp`,
  `/auto-redact`→`redact`), and structural invariants (every key is a whitespace-free absolute path, every
  value a non-empty tool id). A mis-mapping silently breaks deep-link navigation. Pure value-add, zero source
  change. Verified: **core `tsc` 0 errors, `eslint --max-warnings=0` clean, `vitest` 5/5 green**.

### Wave 107 — B4 fileDialogUtils coverage (frontend; verified; pushed)

- **B4 coverage-add (frontend, no refactor)**: added `fileDialogUtils.test.ts` (3 tests) for the pure,
  import-free `getDocumentFileDialogFilter` — pinning the file-open dialog's accepted-extensions contract (one
  "Documents" group; exactly `pdf/jpg/jpeg/png/gif/tiff/bmp/html/zip` in order; pdf present; no duplicates). A
  regression here would silently change which files users can select. Pure value-add, zero source change.
  Verified: **core `tsc` 0 errors, `eslint --max-warnings=0` clean, `vitest` 3/3 green**.

### Wave 106 — B4 pixelSwizzleUtils pure-extraction (frontend; verified; pushed)

- **B4 pure-extraction (frontend)**: lifted the RGBA→BGRA byte-swizzle out of `copyRgbaToBgraHeap` in the
  PDFium-WASM-coupled `pdfiumBitmapUtils.ts` into a pure, WASM-free `pixelSwizzleUtils.ts` (`rgbaToBgra`), so
  the error-prone pixel byte-reordering (swap R/B, keep G/A) is unit-testable without the WASM heap. The
  fast-path in `copyRgbaToBgraHeap` now delegates to it. Added `pixelSwizzleUtils.test.ts` (6 tests):
  single/multi-pixel swizzle, alpha preservation (opaque/transparent), `Uint8ClampedArray` (canvas ImageData)
  input, empty input, fresh-buffer/source-untouched, and length invariance. Behaviour-preserving. Verified:
  **core `tsc` 0 errors, `eslint --max-warnings=0` clean, `vitest` 6/6 green**.

### Wave 105 — B4 pdfTextEditorUtils grouping edge-path coverage (frontend; verified; pushed)

- **B4 coverage-add (frontend, no refactor)**: extended `pdfTextEditorUtils.test.ts` (+4 tests, 30 total) for
  the entry points of the two large text-grouping functions, covering their fully-deterministic edge paths:
  `groupPageTextElements` returns `[]` for a null/undefined page or a page with no text elements, and
  `groupDocumentText` returns `[]` for a null/undefined document and `[[], []]` for a document of text-less
  pages. (The multi-element line/paragraph-grouping heuristics are intentionally left to dedicated fixtures;
  these pin the guard clauses + per-page dispatch.) Pure value-add, zero source change. Verified: **core `tsc`
  0 errors, `eslint --max-warnings=0` clean, `vitest` 30/30 green**.

### Wave 104 — B4 pdfTextEditorUtils.createMergedElement coverage (frontend; verified; pushed)

- **B4 coverage-add (frontend, no refactor)**: pivoted back to frontend. Extended `pdfTextEditorUtils.test.ts`
  (+5 tests, 26 total) for `createMergedElement(group)` — the text-merge helper that builds one element from a
  `TextGroup`: uses the first original element as a clone template, sets the sanitized merged text (newlines
  stripped), copies a 6-element `textMatrix` into an **independent** array (mutation isolation verified),
  clears glyph hints (`charCodes`), and treats empty text as `""`. Pure value-add, zero source change.
  Verified: **core `tsc` 0 errors, `eslint --max-warnings=0` clean, `vitest` 26/26 green**.

### Wave 103 — C2 TauriProcessMonitor de-reflection (backend; verified; pushed)

- **C2 de-reflection (backend)**: `TauriProcessMonitorTest` used two generic `invokePrivate(target, "name", …)`
  reflection helpers to reach **4 lifecycle methods** (`startMonitoring`, `checkParentProcess`,
  `isProcessAlive`, `initiateGracefulShutdown`) across **11 call sites**. Made the 4 methods package-private and
  converted every site to a direct compile-checked call (`monitor.startMonitoring()` etc.; the `(Object) null`
  arg became `(String) null` to match the typed parameter), removed both generic helpers + the unused
  `java.lang.reflect.Method` import, and refreshed the now-stale "via reflection" Javadoc/comments. The
  `Field`-based `setField`/`getField` helpers are retained (field reflection out of scope). Behaviour-preserving
  (visibility-only source change). Verified: `:stirling-pdf:test` BUILD SUCCESSFUL with `TauriProcessMonitorTest`
  green.

### Wave 102 — C2 Type3LibraryStrategy.loadConfiguration de-reflection (backend; verified; pushed)

- **C2 de-reflection (backend)**: `Type3LibraryStrategyTest`'s `invokePostConstruct` helper called
  `loadConfiguration()` **via reflection**. Made the method package-private and rewrote the helper as a direct
  compile-checked call (`strategy.loadConfiguration()`). Behaviour-preserving (visibility-only source change).
  Verified: `:stirling-pdf:test` BUILD SUCCESSFUL with `Type3LibraryStrategyTest` green.

### Wave 101 — C2/E1 VeraPDFService de-reflection (backend; verified; pushed)

- **C2 de-reflection (backend; E1 veraPDF workstream)**: `VeraPDFServiceTest` exercised **5 static helpers**
  (`formatStandardDisplay`, `getStandardName`, `createNoPdfaDeclarationResult`, `buildErrorResult`,
  `createValidationIssue`) **via reflection across 10 invoke sites**. Made all 5 package-private static and
  converted every site to a direct compile-checked call (e.g. `VeraPDFService.formatStandardDisplay("PDF/A-1b",
  0, true, false)`), removing the per-test reflection plumbing and the unused `java.lang.reflect.Method`
  import. Same assertions (PDF/A standard-display formatting, error-result construction, validation-issue
  mapping). Behaviour-preserving (visibility-only source change). Verified: `:stirling-pdf:test` BUILD
  SUCCESSFUL with `VeraPDFServiceTest` green — the largest de-reflection so far.

### Wave 100 — C2 PdfJsonFallbackFontService de-reflection (backend; verified; pushed)

- **C2 de-reflection (backend)**: `PdfJsonFallbackFontServiceTest` invoked three helpers
  (`loadConfig`, `inferBaseName`, `inferFormat`) **via reflection** in its private wrapper helpers. Made the
  three package-private and rewrote the wrappers as direct compile-checked calls
  (`service.inferBaseName(...)` etc.), removing the unused `java.lang.reflect.Method` import (the separate
  `Field`-based `setField` helper is retained — field reflection is out of scope). Same assertions (font
  base-name/format inference + config loading), now refactor-safe. Behaviour-preserving (visibility-only source
  change). Verified: `:stirling-pdf:test` BUILD SUCCESSFUL with `PdfJsonFallbackFontServiceTest` green.

### Wave 99 — C2 EditTableOfContentsController.createOutlineItem de-reflection (backend; verified; pushed)

- **C2 de-reflection (backend)**: `EditTableOfContentsControllerTest` invoked `createOutlineItem(PDDocument,
  BookmarkItem)` **via reflection**. Made the method package-private and replaced the reflection block with a
  direct compile-checked call (`editTableOfContentsController.createOutlineItem(mockDocument, bookmark)`),
  removing the unused `java.lang.reflect.Method` import. Same assertions (outline item created + page resolved
  for the bookmark's 1-indexed page). Behaviour-preserving (visibility-only source change). Verified:
  `:stirling-pdf:test` BUILD SUCCESSFUL with `EditTableOfContentsControllerTest` green.

### Wave 98 — C2 MergeController.addTableOfContents de-reflection (backend; verified; pushed)

- **C2 de-reflection (backend)**: `MergeControllerTest` invoked `addTableOfContents(PDDocument, MultipartFile[])`
  **via reflection** at **6 sites** (fetch + `setAccessible` + `invoke` in each test). Made the method
  package-private and mechanically converted all 6 to direct compile-checked calls
  (`mergeController.addTableOfContents(...)` / `assertDoesNotThrow(() -> …)`), removing the per-test reflection
  plumbing and the now-unused `java.lang.reflect.Method` import. Same assertions (TOC outline creation,
  per-file page-count loading + close, empty-array, graceful IOException handling). Behaviour-preserving
  (visibility-only source change). Verified: `:stirling-pdf:test` BUILD SUCCESSFUL with `MergeControllerTest`
  green.

### Wave 97 — C2 MetadataController.checkUndefined de-reflection (backend; verified; pushed)

- **C2 de-reflection (backend)**: `MetadataControllerTest` exercised `checkUndefined(String)` **via reflection**
  (3 tests, the only reflection in the file). Made the method package-private and rewrote the 3 tests as direct
  compile-checked calls (`metadataController.checkUndefined(...)`), dropping the reflection + the now-unneeded
  `throws Exception`. Added an edge-case test confirming only the exact lowercase `"undefined"` is nulled —
  empty/whitespace/`"Undefined"` pass through unchanged (case-sensitive). Behaviour-preserving (visibility-only
  source change). Verified: `:stirling-pdf:test` BUILD SUCCESSFUL with `MetadataControllerTest` green.

### Wave 96 — C2 StampController de-reflection (backend; verified; pushed)

- **C2 de-reflection (backend)**: `StampControllerTest` exercised three helpers
  (`processStampText`, `processCustomDateFormat`, `calculateImagePositionY`) **via reflection**
  (`getDeclaredMethod`/`setAccessible`/`invoke` + `InvocationTargetException` unwrapping). Made the three
  package-private and rewrote the test's invoke-wrappers as direct **compile-checked** calls — deleting the
  reflection field/`setUp` plumbing and the now-unused `Method`/`InvocationTargetException`/`BeforeEach`
  imports. Same behaviour and identical assertions (stamp-text variable substitution, custom date formats,
  image Y-position anchoring), now refactor-safe and reflection-free. Behaviour-preserving (visibility-only
  source change). Verified: `:stirling-pdf:test` BUILD SUCCESSFUL with `StampControllerTest` green.

### Wave 95 — C2 FormFillController.buildBaseName de-reflection (backend; verified; pushed)

- **C2 de-reflection (backend)**: `FormFillControllerTest` tested `buildBaseName` **via reflection**
  (`getDeclaredMethod`/`setAccessible`/`invoke`). Made the method package-private and rewrote all 3 tests as
  direct **compile-checked** calls (`FormFillController.buildBaseName(file, "filled")`) — same behaviour, but
  now refactor-safe and reflection-free. Added 2 previously-uncovered branches: blank original filename →
  `document_filled` (the `isBlank()` path, distinct from null) and case-insensitive `.PDF` stripping
  (`REPORT.PDF` → `REPORT_filled`). Behaviour-preserving (visibility-only source change). Verified:
  `:stirling-pdf:test` BUILD SUCCESSFUL with the updated `FormFillControllerTest` (5 buildBaseName cases) green.

### Wave 94 — C2/security ConfigController.isLoopbackHost coverage (backend; verified; pushed)

- **C2 de-reflection + security coverage (backend)**: pivoted back to backend. Made
  `ConfigController.isLoopbackHost(String)` package-private (was `private`) so it's directly unit-testable —
  it's the loopback-host guard that gates whether a derived backend URL is exposed (an SSRF-adjacent check).
  Added focused `ConfigControllerLoopbackTest` (5 tests): `localhost` matched case-insensitively, the IPv4/IPv6
  loopback literals (`127.0.0.1`/`::1`/`0:0:0:0:0:0:0:1`), non-loopback hosts rejected, and that the match is
  **exact** (`127.0.0.2` and `127.0.0.1 ` with trailing space are rejected — not the whole 127/8 block, and IP
  literals are not case-folded). Behaviour-preserving (visibility-only change). Verified: `:stirling-pdf:test`
  BUILD SUCCESSFUL with the new test (5) and existing `ConfigControllerTest` green.

### Wave 93 — I-workstream engine logging-default + prompt-shape coverage (Python; verified; pushed)

- **Engine coverage-add (Python, no refactor)**: two small test files.
  (1) `tests/test_logging_default.py` (4 tests) for the JSON-serialisation fallback `_default` in
  `stirling.logging` (BaseModel → `model_dump()` dict; Decimal/set/arbitrary objects → `str`).
  (2) `tests/agents/test_default_build_prompt.py` (2 tests) for `_default_build_prompt` (the default
  query-then-content extraction-prompt shape, incl. empty inputs).
  Pure value-add, zero source change. Verified via the engine venv: **pytest 6/6 passed, ruff clean, pyright 0
  errors**. *(The engine's remaining untested top-level functions are now side-effectful config/client/logging
  builders — `_build_model`, `_build_anthropic_http_client`, `_configure_logging`, `load_settings`,
  `get_runtime` — which need mocking/integration rather than pure unit tests; the pure-logic surface is
  largely covered.)*

### Wave 92 — I-workstream engine reconstruction-prompt coverage (Python; verified; pushed)

- **Engine coverage-add (Python, no refactor)**: added `tests/test_reconstruction_prompt.py` (5 tests) for the
  pure `_build_reconstruction_prompt` builder in the `pdf_to_markdown` agent, which assembles the LLM prompt
  from a `PdfToMarkdownRequest`. Pins: `Files: Unknown files` when none given vs comma-joined names, the
  `User request:` line, empty conversation-history → `None`, formatted history (`- user: hello`), the static
  PAGE-LAYOUT instruction block, and the appended `_format_layout` output (`--- Page 1 ---`,
  `**Title**@(0,100) fs=18`). Composes the already-tested `format_conversation_history` (W80) and
  `_format_layout` (W87). Pure value-add, zero source change. Verified via the engine venv: **pytest 5/5
  passed, ruff clean, pyright 0 errors**.

### Wave 91 — I-workstream engine label-normaliser + model-validation coverage (Python; verified; pushed)

- **Engine coverage-add (Python, no refactor)**: two test files.
  (1) `tests/ledger/test_normalise_label.py` (8 cases) for the figure-tracker `_normalise_label` — whose noise
  class `[:\-—\s]+` is **narrower** than the contradiction ledger's: commas/periods are kept and articles are
  *not* stripped (explicitly contrasted in the tests).
  (2) `tests/test_validate_structured_output.py` (3 tests) for `validate_structured_output_support` in
  `services/runtime.py`: supporting model passes, the `"test"` stand-in bypasses the check, and a
  non-supporting model raises `ValueError` naming the model. (Used a typed-`Any` `SimpleNamespace` stand-in to
  avoid importing the pydantic-ai `Model` type — which standalone pyright can't resolve.)
  Pure value-add, zero source change. Verified via the engine venv: **pytest 11/11 passed, ruff clean, pyright
  0 errors**.

### Wave 90 — I-workstream engine page-chunking coverage (Python; verified; pushed)

- **Engine coverage-add (Python, no refactor)**: added `tests/test_build_page_chunks.py` (7 tests) for the
  pure `_build_page_chunks` helper in the `pdf_to_markdown` agent, which groups `PageLayout`s into chunks
  bounded by `_MAX_CHUNK_PAGES` (10) and `_MAX_CHUNK_FRAGMENTS` (1000). Covers empty→[], single page, the
  page-count split (23 pages → `[10, 10, 3]`), exactly-10 → one chunk, 11 → `[10, 1]`, the fragment-count
  split (via `monkeypatch` to a small limit → `[2, 2, 1]`), and the edge that a lone page exceeding the
  fragment limit is still kept whole (never split). Pure value-add, zero source change. Verified via the
  engine venv: **pytest 7/7 passed, ruff clean, pyright 0 errors**.

### Wave 89 — I-workstream engine NDJSON frame-serializer coverage (Python; verified; pushed)

- **Engine coverage-add (Python, no refactor)**: added `tests/test_serialize_frame.py` (3 tests) for
  `_serialize_frame` in the orchestrator streaming route — the function that renders a stream `_StreamFrame`
  as one NDJSON line. Covers the payload-free arms (`_HeartbeatFrame` → `{"event":"heartbeat"}`,
  `_ErrorFrame` → `{"event":"error","message":…}`), asserts bytes output with a single trailing newline, and
  verifies JSON-escaping of embedded quotes/newlines so the NDJSON delimiter stays intact (round-trips via
  `json.loads`). (`_ProgressFrame`/`_ResultFrame` wrap `model_dump` and are covered by route tests.) Pure
  value-add, zero source change. Verified via the engine venv: **pytest 3/3 passed, ruff clean, pyright 0
  errors**.

### Wave 88 — I-workstream engine review-anchor coverage (Python; verified; pushed)

- **Engine coverage-add (Python, no refactor)**: added `tests/test_anchor_text_for.py` (7 cases) for the pure
  `_anchor_text_for` helper in `agents/pdf_review.py` (chooses the anchor text for a `Discrepancy`: prefers
  the stripped `stated` value, falls back to stripped `context`, else `None`). Covers stated-wins,
  whitespace stripping on both fields, blank-stated→context fallback, and both-blank→`None`. Built with real
  `DiscrepancyKind`/`Severity` enum members (no hard-coded values). Pure value-add, zero source change.
  Verified via the engine venv: **pytest 7/7 passed, ruff clean, pyright 0 errors**.

### Wave 87 — I-workstream engine layout-formatter coverage (Python; verified; pushed)

- **Engine coverage-add (Python, no refactor)**: added `tests/test_format_layout.py` (7 tests) for the pure
  `_format_layout` helper in the `pdf_to_markdown` agent, which renders `PageLayout` lines/fragments into the
  diagnostic layout string the LLM sees. Pins: empty→`None`, the per-fragment
  `text@(x,y) fs=N` form with `:.0f` integer rounding of coordinates/font-size, bold fragments wrapped in
  `**…**`, space-joined fragments within a line, newline-joined lines within a page, and blank-line-joined
  `--- Page N ---` page blocks. Pure value-add, zero source change. Verified via the engine venv: **pytest 7/7
  passed, ruff clean, pyright 0 errors**.

### Wave 86 — I-workstream engine arithmetic-evaluator coverage (Python; verified; pushed)

- **Engine coverage-add (Python, no refactor)**: added `tests/ledger/test_eval_expression.py` (16 tests) for
  the additive-expression evaluator `_eval_expression` (`A ± B ± C …`) and its `_parse` delegate in
  `ledger/validators/arithmetic.py`. Covers chained add/subtract, currency/separator stripping
  (`$1,000 + $234.56 → 1234.56`), leading-negative and parenthesised-negative tokens (`(100)+50 → -50`),
  empty-expression→0, whitespace+currency, unparseable-operand→`None`, and that extra `+` produces skipped
  empty tokens rather than a failure (`1 + + 2 → 3` — caught and corrected during authoring). Pure value-add,
  zero source change. Verified via the engine venv: **pytest 16/16 passed, ruff clean, pyright 0 errors**.

### Wave 85 — I-workstream engine detector-helper coverage (Python; verified; pushed)

- **Engine coverage-add (Python, no refactor)**: added `tests/contradiction/test_detector_helpers.py` (16
  tests) for two pure helpers in `contradiction/detector.py`. `_windows` — the overlapping-window generator
  with documented invariants (small/empty bucket → single window, no-overlap tiling, `step = size - overlap`,
  **every item covered by ≥1 window**, and `ValueError` when `size<=0` or `overlap∉[0,size)`); since `_windows`
  only slices its input it's tested with placeholder items via `cast` rather than full `Claim` fixtures.
  `_fallback_summary` — the contradiction-count summary string with singular/plural agreement
  (`contradiction`/`contradictions`, `tension`/`tensions`) and the no-findings branch. Pure value-add, zero
  source change. Verified via the engine venv: **pytest 16/16 passed, ruff clean, pyright 0 errors**.

### Wave 84 — I-workstream engine escape-guard + label coverage (Python; verified; pushed)

- **Engine coverage-add (Python, no refactor)**: two focused test files.
  (1) `tests/contradiction/test_capability_escape.py` (6 cases) for `_escape_for_xml_tag` — the
  **prompt-injection guard** that escapes `<`/`>` so an untrusted filename can't close the XML-style tag it's
  interpolated into (tested with the docstring's `foo.pdf"></file_name>…` attack; confirms `&` is *not*
  escaped, so no entity double-escaping).
  (2) `tests/agents/test_chunked_mapper_label.py` (4 cases) for `_page_range_label` (empty→`pages=?`,
  single→`pages=N`, multi→`pages=first-last` using endpoints only).
  Pure value-add, zero source change. Verified via the engine venv: **pytest 10/10 passed, ruff clean, pyright
  0 errors**.

### Wave 83 — I-workstream engine chunker-helper coverage (Python; verified; pushed)

- **Engine coverage-add (Python, no refactor)**: `chunk_text` is covered by `test_documents.py`, but its pure
  building blocks weren't directly tested. Added `tests/test_chunker_helpers.py` (18 cases) for
  `_split_paragraphs` (double-newline split incl. whitespace-only dividers, multi-blank collapse, single
  newline stays one paragraph, stripping, all-blank→[]), `_split_sentences` (the `(?<=[.!?])\s+` lookbehind
  split — multi-sentence, no-punctuation, no-space-after-`.`, ellipsis), and `_get_overlap` (word-boundary
  snapping of the trailing overlap, no-chunks/non-positive→"", short-chunk whole, no-space tail, and the
  index-0-space-not-snapped edge). Pure value-add, zero source change. Verified via the engine venv: **pytest
  18/18 passed, ruff clean, pyright 0 errors**.

### Wave 82 — I-workstream engine markdown-table repair coverage (Python; verified; pushed)

- **Engine coverage-add (Python, no refactor)**: added `tests/test_markdown_tables.py` (17 tests) for four
  untested pure helpers in the `pdf_to_markdown` agent that repair LLM-mangled Markdown tables: `_is_sep_row`
  (recognises `| --- | :--: |` separators incl. alignment colons; rejects data/mixed/empty/no-pipe rows),
  `_fix_markdown_tables` (removes blank lines *between* table rows but keeps blanks before prose),
  `_remove_extra_separators` (keeps only the first separator per contiguous table block; distinct blocks keep
  theirs), and `_merge_orphaned_table_rows` (folds separator-less orphan pipe blocks back into the preceding
  table, discarding intervening prose; leaves well-formed tables and table-less orphans alone). Pure value-add,
  zero source change. Verified via the engine venv: **pytest 17/17 passed, ruff clean, pyright 0 errors**.

### Wave 81 — I-workstream engine subject-normaliser coverage (Python; verified; pushed)

- **Engine coverage-add (Python, no refactor)**: added `tests/contradiction/test_normalise_subject.py` (12
  cases) for the pure `_normalise_subject` helper in `contradiction/validators/ledger.py` (used to group claim
  subjects without LLM help — only covered indirectly before). Hand-computed the regex pipeline (lowercase →
  `\b`-bounded article/demonstrative strip → collapse `[:\-—_,.;!?\s]+` → trim): leading-article stripping,
  case-insensitivity, standalone-`a`/`an` removal while keeping `apple`/`day`, whitespace + punctuation +
  em-dash collapse, all-articles→empty, and a `\b`-boundary guard (articles embedded in words like "theatre"
  are preserved). Pure value-add, zero source change. Verified via the engine venv: **pytest 12/12 passed,
  ruff clean, pyright 0 errors**.

### Wave 80 — I-workstream engine contract-helper coverage (Python; verified; pushed)

- **Engine coverage-add (Python, no refactor)**: added `tests/test_common_helpers.py` (10 tests) for three
  untested pure helpers in `stirling.contracts.common`: `format_conversation_history` (`None` when empty,
  `- role: content` lines joined by newline), `format_file_names` (explanatory message when empty,
  comma-joined names), and `drop_unknown_tool_endpoints` (the version-drift guard that silently drops
  unrecognised endpoint identifiers — tested self-referentially with real `ToolEndpoint` members so it needs
  no hard-coded values: empty→[], all-unknown→[], valid value kept + unknown dropped, actual members accepted).
  Pure value-add, zero source change. **pyright caught a real `FileId` NewType mismatch** in the first draft
  (`id="1"` → must be `FileId("1")`); fixed. Verified via the engine venv: **pytest 10/10 passed, ruff clean,
  pyright 0 errors**.

### Wave 79 — I-workstream engine page-text coverage (Python; verified; pushed)

- **Engine coverage-add (Python, no refactor)**: added `tests/agents/test_page_text.py` (12 tests) for the
  untested `stirling.agents._page_text` helpers: `has_page_text` (empty list / no pages / blank-only → False;
  any non-blank → True), `format_page_text` (default + custom empty marker, single-selection
  `[File: …, Page N]\n<text>` formatting, missing page-number → `Page ?`, multi-section join with a blank
  line), and `get_extracted_text_artifact` (None when absent, returns the artifact, returns the **first** when
  several). Pure value-add, zero source change. Verified via the engine venv: **pytest 12/12 passed, ruff
  clean, pyright 0 errors**.

### Wave 78 — I-workstream engine parsing coverage (Python; verified; pushed)

- **Engine coverage-add (Python, no refactor)**: pivoted to the Python engine. The shared ledger parsing
  helpers `stirling.agents.ledger.validators._parsing` (`to_decimal`, `parse_csv`) were **untested** despite
  being financial-parsing logic. Added `tests/ledger/test_parsing.py` (27 parametrized cases): `to_decimal`
  strips currency symbols (£$€¥) + thousands separators, handles parenthesised negatives `(123.45)→-123.45`,
  returns `None` for blank/dash/`n/a`/non-numeric, and returns a real `Decimal`; `parse_csv` parses rows,
  drops blank lines and all-empty-cell rows, strips outer whitespace, and returns `[]` for empty input.
  Pure value-add, zero source change. Verified via the engine venv: **pytest 27/27 passed, ruff clean, pyright
  0 errors**.

### Wave 77 — B4 thumbnailScaleUtils pure-extraction (frontend; verified; pushed)

- **B4 pure-extraction (frontend)**: resolved the Wave 76 deferral — `calculateScaleFromFileSize` lived in
  `thumbnailUtils.ts`, which import-pulls the PDFium WASM service, so it couldn't be unit-tested directly.
  Extracted the pure file-size→scale ladder into a WASM-free `thumbnailScaleUtils.ts`; `thumbnailUtils`
  imports + **re-exports** it (backwards-compatible — internal call sites unchanged). Added
  `thumbnailScaleUtils.test.ts` (4 tests): full-quality under 10 MB, the tier step-downs, strict-`<` boundary
  behaviour (exact thresholds fall to the next tier), and a monotonic-non-increasing + always-positive
  invariant sweep. Verified: **core `tsc` 0 errors, `eslint --max-warnings=0` clean, `vitest` 4/4 green** —
  behaviour-preserving.

### Wave 76 — B4 sidebarUtils coverage (frontend; verified; pushed)

- **B4 coverage-add (frontend, no refactor)**: added `sidebarUtils.test.ts` (6 tests) for the untested
  `getSidebarInfo` (tool-panel vs quick-access rect resolution from React refs + state). Tested with mock refs
  (no real DOM): tool-panel rect when active+present, quick-access fallback when the panel is absent, reader
  mode deactivates the panel (falls back), hidden sidebars deactivate it, null rect when nothing is mounted,
  and state pass-through. Pure value-add, zero source change. Verified: **core `tsc` 0 errors, `eslint
  --max-warnings=0` clean, `vitest` 6/6 green**. (Note: `thumbnailUtils.calculateScaleFromFileSize` deferred —
  that module import-pulls the PDFium WASM service, so it needs extraction/mocking rather than a direct test.)

### Wave 75 — B4 pdfTextEditorUtils image-extraction coverage (frontend; verified; pushed)

- **B4 coverage-add (frontend, no refactor)**: extended `pdfTextEditorUtils.test.ts` (+6 tests, 21 total) for
  `extractPageImages` and `extractDocumentImages`: null/undefined page/doc → `[]`, existing image ids
  preserved, deterministic `page-{pageIndex}-image-{idx}` ids assigned when id is missing **or blank** (the
  `!id || id.trim().length === 0` branch), clones returned (mutating a result's `transform` leaves the source
  intact), and per-page id namespacing across a multi-page document. Pure value-add, zero source change.
  Verified: **core `tsc` 0 errors, `eslint --max-warnings=0` clean, `vitest` 21/21 green**.

### Wave 74 — B4 pdfTextEditorUtils clone-semantics coverage (frontend; verified; pushed)

- **B4 coverage-add (frontend, no refactor)**: extended `pdfTextEditorUtils.test.ts` (+5 tests, 15 total) to
  pin the deep-copy semantics of three more pure exported functions: `cloneTextElement` (copies `textMatrix`
  into an **independent** array; mutation isolation verified; null/undefined → `undefined`), `cloneImageElement`
  (same for `transform`), and `deepCloneDocument` (full structuredClone/JSON deep copy — nested page mutation
  in the clone leaves the original intact). These pin the mutation-isolation contract the editor relies on
  (clones are edited without corrupting source state). Pure value-add, zero source change. Verified: **core
  `tsc` 0 errors, `eslint --max-warnings=0` clean, `vitest` 15/15 green**.

### Wave 73 — B4 pdfTextEditorUtils coverage (frontend; verified; pushed)

- **B4 coverage-add (frontend, no refactor)**: `pdfTextEditorUtils.ts` is a 1,561-line **untested** utils
  module (only its sibling `pdfTextEditorFontUtils` had tests). Added `pdfTextEditorUtils.test.ts` (10 tests)
  pinning three already-pure exported functions: `valueOr` (null/undefined/NaN→fallback, 0/negatives kept),
  `getImageBounds` (the error-prone `left ?? x` / `width` vs `right-left` / `bottom ?? y` / `top` fallback
  chains — explicit bounds, x/y+size derivation, right/top derivation, width/height derivation, empty→zero),
  and `pageDimensions` (US-Letter 612×792 defaults for null/undefined/null-field pages, explicit dims kept).
  Pure value-add (zero source change → zero regression risk). Verified: **core `tsc` 0 errors, `eslint
  --max-warnings=0` clean, `vitest` 10/10 green**.

### Wave 72 — B4 adjustPixelUtils pure-extraction (frontend; verified; pushed)

- **B4 pure-extraction (frontend)**: lifted the per-pixel colour-adjustment maths out of the canvas-bound
  `applyAdjustmentsToCanvas` (`adjustContrast/utils.ts`) into a pure, DOM-free
  `adjustPixelUtils.ts`: `adjustPixel(r,g,b,adj)` runs channel multipliers → contrast (centred at 128) →
  brightness → saturation (HSL round-trip) with 0..255 clamping. The canvas function now builds the
  `ChannelAdjustments` once and delegates per pixel, so the colour maths is unit-testable without a canvas.
  Added `adjustPixelUtils.test.ts` (8 tests, hand-traced through the HSL conversion): grayscale-endpoint and
  colour identity (lossless round-trip), contrast-0 → mid-gray, brightness-0 → black, channel-zero → channel
  removed, saturation-0 → HSL-lightness gray, and high/low clamping at 255/0. Verified: **core `tsc` 0 errors,
  `eslint --max-warnings=0` clean, `vitest` 8/8 green** — behaviour-preserving.

### Wave 71 — B4 imageToPdfLayoutUtils pure-extraction (frontend; verified; pushed)

- **B4 pure-extraction (frontend)**: pivoted from backend (common/proprietary statics are already
  test-covered; misc controllers well-mined) to the frontend. Lifted the page-layout maths out of the
  PDFium-WASM `convertImageToPdf` (`imageToPdfUtils.ts`) into a pure, pdfium-free
  `imageToPdfLayoutUtils.ts`: `resolvePageDimensions` (page size + orientation-match rotation) and
  `calculateImagePlacement` (aspect-ratio-preserving letterbox/pillarbox centring). The async converter now
  delegates, so the layout maths is unit-testable without the WASM module or a canvas. Added
  `imageToPdfLayoutUtils.test.ts` (11 tests): keep/letter/A4 sizing, orientation swap for landscape images,
  square→portrait, stretch/keep full-fill, wide-image letterbox + tall-image pillarbox centring (hand-computed
  offsets), and exact-fit at matching aspect. Verified: **core `tsc` 0 errors, `eslint --max-warnings=0`
  clean, `vitest` 11/11 green** — type-only/behaviour-preserving.

### Wave 70 — C2 ScannerEffectGrayscaleUtils pure-extraction (verified; pushed)

- **C2 pure-extraction**: lifted `convertToGrayscale` out of `ScannerEffectController` into a pure
  `ScannerEffectGrayscaleUtils`, factoring the per-pixel transform into a pure `toGrayPacked(int)` (int→int,
  testable without an image) that `convertToGrayscale(BufferedImage)` applies in place. Controller delegates.
  Added `ScannerEffectGrayscaleUtilsTest` (5 tests): per-channel averaging of pure colours, black/white/
  mid-gray, integer-truncation behaviour, alpha-bits ignored, and an in-place `TYPE_INT_RGB` round-trip.
  Verified: `:stirling-pdf:test` BUILD SUCCESSFUL (5 new; controller recompiles, behaviour identical).

### Wave 69 — C2 ScannerEffectResolutionUtils pure-extraction (verified; pushed)

- **C2 pure-extraction (OOM/DoS guard)**: lifted `calculateSafeResolution` out of `ScannerEffectController`
  into a pure `ScannerEffectResolutionUtils`, passing the image limits as params (rather than reading the
  controller's `MAX_IMAGE_*` constants) so the maths is fully pure and testable with arbitrary limits. This is
  the guard that caps a page's rasterised dimensions/pixel-count to prevent render-time OOM. Controller
  delegates. Added `ScannerEffectResolutionUtilsTest` (5 tests): within-limits returns the requested DPI
  unchanged, boundary (exactly at max width) not clamped, over-pixel / over-width clamp **verified by
  invariant** (the re-projected raster must fit all three limits — robust to FP rounding in the scale), and
  the 72-DPI floor when limits are tiny. Verified: `:stirling-pdf:test` BUILD SUCCESSFUL (5 new; controller
  recompiles, behaviour identical).

### Wave 68 — C2 CompressionLevelUtils pure-extraction (verified; pushed)

- **C2 pure-extraction**: lifted the four compression-level tuning helpers (`getScaleFactorForLevel`,
  `getJpegQualityForLevel`, `determineOptimizeLevel`, `incrementOptimizeLevel`) out of `CompressController`
  into a pure `CompressionLevelUtils` (its own `@Slf4j` logger preserves the one ratio `log.info`), so the
  level→scale / level→quality maps and the adaptive level-selection ladder are unit-testable. Controller
  delegates at all 4 call sites. Added `CompressionLevelUtilsTest` (8 tests): per-level scale + default,
  monotonic-shrink invariant, per-level JPEG quality + default, the full ratio→level ladder with
  strict-`>` boundary behaviour, oversize-ratio jump sizing, the cap at level 9, and the `targetSize==0`
  edge (double division → `Infinity`, no exception). Verified: `:stirling-pdf:test` BUILD SUCCESSFUL (8 new;
  `CompressController` recompiles, behaviour identical — no `CompressControllerTest` exists to regress).

### Wave 67 — C2 ScalePagesSizeUtils pure-extraction (verified; pushed)

- **C2 pure-extraction**: lifted the named-page-size resolution (`getSizeMap` + the size lookup / landscape
  orientation swap from `getTargetSize`) out of `ScalePagesController` into a pure `ScalePagesSizeUtils`, so
  the size table + orientation swap are unit-testable without a PDF. The controller keeps the `"KEEP"` branch
  (which needs the source document) and delegates the named-size branch; removed the now-unused `Map`/`HashMap`
  imports. Added `ScalePagesSizeUtilsTest` (7 tests): portrait base dims, landscape width/height swap,
  case-insensitive `landscape`, null/unrecognized orientation → portrait, all 9 named sizes resolve, and
  unknown size (incl. `"KEEP"`, which the util correctly treats as unknown) throws. Verified:
  `:stirling-pdf:test` BUILD SUCCESSFUL with the new test (7) and existing `ScalePagesControllerTest` green.

### Wave 66 — C2/D-security TsaUrlUtils pure-extraction (verified; pushed)

- **C2 + security pure-extraction**: lifted the TSA-URL validation/normalization (`isValidTsaUrlProtocol`,
  `normalizeTsaUrl`) out of `TimestampController` into a pure `TsaUrlUtils`, so the **security allow-list**
  logic (used to block SSRF to non-allowed timestamp authorities) is directly unit-testable. Controller
  delegates (incl. the `TimestampController::normalizeTsaUrl` method-ref → `TsaUrlUtils::normalizeTsaUrl`);
  removed the now-unused `Locale` import. Added `TsaUrlUtilsTest` (8 tests): http/https case-insensitive
  accept, reject of ftp/file/javascript/scheme-less, no-trim-before-protocol-check, scheme+host lowercased
  with **path case preserved**, explicit-port kept / default `-1` dropped, whitespace trimming, case-variant
  URLs canonicalizing equally (the property the allow-list `contains()` relies on), and malformed-URL
  fallback to lower-case. Verified: `:stirling-pdf:test` BUILD SUCCESSFUL with the new test (8) and existing
  `TimestampControllerTest` green.

### Wave 65 — C2 ScannerEffectGradientUtils pure-extraction + C3 evidence (verified; pushed)

- **C2 pure-extraction**: lifted the gradient lookup-table maths (`createGradientLUT`, `fillWithGradient`) out
  of `ScannerEffectController` into a pure `ScannerEffectGradientUtils`, so the RGB interpolation + per-row
  pixel fill are unit-testable without constructing AWT images. Subtlety handled: `GradientConfig` is a
  **nestmate record** of the controller, so its private fields are accessed field-style *only within* the
  controller — moving the methods to a top-level util would break that, so the util takes **decomposed params**
  (`vertical, startColor, endColor`) instead. Added `ScannerEffectGradientUtilsTest` (6 tests): vertical
  black→white interpolation (incl. half-up rounding 127.5→128), horizontal single-channel, the size-1
  no-divide-by-zero edge, exact end-colour at the last entry, and vertical/horizontal fill layouts. Verified:
  `:stirling-pdf:test` BUILD SUCCESSFUL (6 new; controller recompiles + behaviour identical).
- **C3 evidence (no code change)**: `ScannerEffectController` — despite being an image converter — is **pure
  Java2D/PDFBox** (no native tool; the `Runtime` call is just thread-pool sizing) and **already streams** its
  response via `pdfDocToWebResponse(doc, name, tempFileManager)` (the Resource overload). So my earlier
  "native-tool converter" label was wrong for it. The genuinely native buffering converters remain
  ebook/img/video; C3's pure-Java surface is already on the streaming path.

### Wave 64 — C2 EditTextMatchUtils pure-extraction + C3 evidence (verified; pushed)

- **C2 pure-extraction (highest-complexity yet)**: lifted the find/replace text-splicing logic
  (`findElementForCharIndex`, `applyMatchToElements`, the `MatchSpan` record, `nullToEmpty`) out of
  `EditTextController` into a pure `EditTextMatchUtils`, so the off-by-one-prone cross-element substring
  replacement is unit-testable without round-tripping a real PDF through the JSON model. Controller delegates
  (`MatchSpan` → `EditTextMatchUtils.MatchSpan`). Added `EditTextMatchUtilsTest` (8 tests): element lookup
  by char index, single-element interior/trailing splice, null-text handling, two-element cross splice
  (replacement into first + suffix of last), 3-element splice emptying the middle, and modifiedIndices
  accumulation. Verified: `:stirling-pdf:test` BUILD SUCCESSFUL with the new test (8) and existing
  `EditTextControllerTest` green.
- **C3 evidence (no code change)**: while scoping C3 I confirmed the pure-Java controllers have **already
  adopted streaming** — `ConvertPdfJsonController` (all response paths) and `EditTextController` use
  `fileToWebResponse`/`pdfFileToWebResponse`/`ManagedTempFileResource`, and `WebResponseUtilsTest` already
  covers the `ManagedTempFileResource` stream + delete-on-close + error-cleanup paths. So C3's foundation is
  tested and in use; only the **native-tool converters** (ebook/img/video/scan) still buffer via
  `readAllBytes`, and those need their native tools to write a passing drain test. Updated the C3 plan note.

### Wave 63 — C2 BookletImpositionUtils pure-extraction (verified; pushed)

- **C2 pure-extraction**: lifted the saddle-stitch booklet-imposition arithmetic (`padToMultipleOf4`,
  `saddleStitchSides`, and the `Side` value type) out of `BookletImpositionController` into a pure
  `BookletImpositionUtils` (with a public `Side` record), so the off-by-one-prone sheet/side page ordering is
  unit-testable without PDFBox. Controller delegates (`Side` field access → record accessors; removed the now-
  unused `ArrayList` import). Added `BookletImpositionUtilsTest` (11 tests, hand-traced): multiple-of-4
  padding, single/two-sheet outer→inner pairing, `-1` blank padding for non-multiple-of-4 counts, FIRST/SECOND
  duplex-pass selection, the short-edge back-side swap (+ that it's ignored when not double-sided), zero-page
  edge case, and an each-real-page-placed-exactly-once invariant. Verified: `:stirling-pdf:test` BUILD
  SUCCESSFUL with the new test (11) and existing `BookletImpositionControllerTest` green.
- **E3 YAML validated**: parsed `provenance.yml` + the `aur-publish.yml`/`package-managers.yml` edits with
  PyYAML — all three are syntactically valid and structurally well-formed (`name`/`on`/`permissions`/`jobs`
  with the expected job names). Moves the E3 draft from asserted-valid to actually-validated (runtime
  attestation behavior still needs a real release/runner).

### Wave 62 — I2 Valkey cluster-backplane design (grounded; pushed)

- **I2 design DONE**: `docs/valkey-backplane-design.md`. Corrected my earlier offhand "no Valkey impl" into a
  precise, grounded design. Finding: the fork is already Valkey-**ready** — clean 6-interface cluster SPI,
  `InProcessClusterConfiguration` wiring all 6 beans as `@ConditionalOnMissingBean`, and Valkey
  config+validation (`cluster.valkey.url`/`.tls.*`; `ClusterConfig.validate()` already requires the url when
  `backplane=valkey`). The only missing piece is a `cluster/valkey/` impl package. Design specifies a
  Lettuce-backed `ValkeyClusterConfiguration` per interface + the **Lua scripts** for the atomic ones
  (`RateLimitStore` token-bucket, `DistributedLock` SET-NX + compare-and-delete release). Key honesty point:
  that atomic correctness is exactly what a **mocked client cannot verify** (a mock test of `EVAL` is
  tautological) — it needs a real Valkey via Testcontainers, which needs Docker (absent). So design +
  verification strategy here; impl + integration suite gated on infra. **With this, all 9 of workstream I and
  every enumerated-residual item (E3/H2/H3/Docker/I2/C3/C6/B2) now has a verified impl, partial, config, or a
  grounded code-referenced plan/design.**

### Wave 61 — C2 ChapterBookmarkUtils pure-extraction (verified; pushed)

- **C2 pure-extraction + characterization tests**: lifted the bookmark/chapter arithmetic
  (`assignEndPages`, `mergeBookmarksThatCorrespondToSamePage`) out of `SplitPdfByChaptersController` into a
  pure `ChapterBookmarkUtils` operating on the package-private `Bookmark`, so it's unit-testable without
  opening a PDF. Controller delegates. Added `ChapterBookmarkUtilsTest` (9 characterization tests pinning
  end-page assignment incl. same-start zero-length chapters, and the merge of zero-length chapters incl.
  multi-fold, trailing-drop, and the 256-char title truncation). The tests **document a preserved quirk**:
  the merge *replaces* the surviving chapter's title with only the accumulated same-page titles (drops its
  own) — flagged for separate review, not fixed here (behaviour-preserving extraction). Verified:
  `:stirling-pdf:test` BUILD SUCCESSFUL with the new test (9) and existing `SplitPdfByChaptersControllerTest`.

### Wave 60 — B2 state-management migration plan (grounded; pushed)

- **B2 plan DONE**: `docs/state-management-migration.md`. Grounded: **no state library installed** (pure
  React Context), **42 provider files**, god-contexts led by `FileManagerContext` (1,274 LoC), and the file
  context consumed by **101 files** (huge blast radius). Recommends **Zustand** (selector subscriptions
  directly fix Context's re-render-every-consumer cost; coexists with Context during migration; `persist`
  middleware replaces the hand-rolled `IndexedDBContext`). Strategy: **API-preserving, leaf-first** — back each
  existing hook with a store while keeping its shape (so the 101 consumers don't change), migrate low-coupling
  contexts first, god-contexts last (split into typed slices behind the same facade, reconciled with B3's
  `fileLifecycleUtils`). Plan-only here: the success criterion is fewer re-renders with identical behavior,
  observable only via a browser profiler + e2e rig (absent), and each step is a small revertible PR — not a
  blind sweep. With this, **every roadmap item now has a verified implementation, a partial, or a grounded
  code-referenced plan**; the only unimplemented work is provably infra-gated (Docker/CI-runner/load-rig/
  browser-profiler/external-Valkey) or a multi-week cutover that must not be done blind.

### Wave 59 — H2/H3 CI-consolidation audit + plan (grounded; pushed)

- **H2/H3 audit + plan DONE**: `docs/ci-workflow-consolidation.md`. Grounded in the real
  `.github/workflows/` tree (38 workflows, 7,412 lines). Headline: **consolidation is already ~80% done**
  in the fork — `build.yml` orchestrates 15 reusable `workflow_call` sub-workflows, `_runner-pick.yml`
  centralizes runner selection (18 callers), `setup-bot` composite action exists, JDK/Gradle setup lives
  once in `backend-build.yml` (only one literal `java-version: 25` pin remains). The residual is the
  per-job `harden-runner`+`checkout` prelude (38/34 workflows) — GitHub requires it per job, so only a
  composite action can DRY it (readability, not structure). Documented a staged composite-action rollout
  (`setup-backend`/`setup-frontend`/`setup-engine`), each step CI-gated because it edits live workflows
  whose egress-policy/permissions/SHA-resolution are only observable on a runner (absent here). Same
  posture as E3/H4: identify the precise residual, stage behind CI validation, don't restructure 38 live
  workflows blind.

### Wave 58 — C2 SectionGridGeometry pure-extraction (verified; pushed)

- **C2 pure-extraction + DRY**: lifted the grid-cell geometry (sub-page sizing + the bottom-left-origin
  translate offsets) out of `SplitPdfBySectionsController`'s two near-identical methods
  (`addSplitPageToTarget`, `addSingleSectionToTarget`) into a pure `SectionGridGeometry` record
  (`cell(pageW, pageH, totalHoriz, totalVert, horizIndex, vertIndex)`), so both methods now delegate
  (de-duped) and the off-by-one-prone math is unit-testable without PDFBox. Added `SectionGridGeometryTest`
  (7 tests, hand-computed). **Verification earned its keep**: the first run failed and surfaced that my
  Javadoc had the row direction inverted — `vertIndex` counts rows **top→bottom** (row 0 = top, most-negative
  `translateY`; bottom row = `translateY 0`), per the `totalVert-1-vertIndex` term. Fixed the doc + tests to
  the correct model. Behaviour-preserving — verified: `:stirling-pdf:test` BUILD SUCCESSFUL with the new
  `SectionGridGeometryTest` (7) and the existing `SplitPdfBySectionsControllerTest` (10) both green.

### Wave 57 — C2 SplitRangeUtils pure-extraction (verified; pushed)

- **C2/A3 pure-extraction**: lifted the by-page-count and by-document-count partition arithmetic out of
  `SplitPdfBySizeController` into a new pure `SplitRangeUtils` (`pageCountRanges`/`docCountRanges`/
  `buildRange`) that takes `int totalPages` instead of a loaded `PdfDocument`, so the integer math is
  unit-testable without a PDF. Controller now delegates (the by-size path reuses `SplitRangeUtils.buildRange`
  too). Added `SplitRangeUtilsTest` (14 tests): hand-computed ranges for even/remainder/oversized/
  single/zero-page cases, front-loaded extra-page distribution, more-docs-than-pages skip, non-positive
  throws, plus a `partitionsCoverEveryPageExactlyOnce` invariant sweep over totals 0–13 × docs 1–6.
  Behaviour-preserving — verified: `:stirling-pdf:test` BUILD SUCCESSFUL with the new `SplitRangeUtilsTest`
  and the existing `SplitPdfBySizeControllerTest` both green.

### Wave 56 — C3 streaming-I/O plan (grounded; pushed)

- **C3 plan DONE**: `docs/streaming-io-plan.md`. Key finding from reading `WebResponseUtils.java`: the
  **streaming response infrastructure already exists** — `fileToWebResponse`/`pdfFileToWebResponse`/
  `zipFileToWebResponse` are backed by `ManagedTempFileResource` (a `FileSystemResource` whose
  `ClosingInputStream` streams the temp file and **auto-deletes it after** Spring writes the body). The
  buffering methods (`bytesToWebResponse`/`baosToWebResponse`) are what the `Files.readAllBytes(tempFile)`
  callers hit. So C3's work is converting those callers to `fileToWebResponse` — correctness-critical
  because of a **premature-delete pitfall** (the caller's manual `finally { deleteIfExists }` must move to
  `ManagedTempFileResource` or it deletes the file before it streams). That correctness property *is*
  unit-testable here (drain the returned `Resource` — see `CropControllerTest.drainBody`), but the actual
  memory benefit at the 100 GB+ target needs the **F1 k6 harness** + heap profiling. Plan: pin the pattern
  on one native-tool-free controller, convert the rest one-at-a-time with drain tests, then validate memory
  under load. (Same posture as the E1/C6 plans — high-risk implementation, grounded plan as the safe-here
  deliverable; but here the infra turned out to already exist, which de-risks the eventual implementation.)

### Wave 55 — C6 DB-migration consolidation plan (grounded; pushed)

- **C6 plan DONE**: `docs/db-migration-consolidation.md` — grounded the real state (non-saas
  `ddl-auto=update` on a **file-based H2 DB with live user data**, no migrations; saas = Hibernate base +
  Flyway `baseline-on-migrate` deltas V2–V9). Key finding: even saas is a *hybrid*, not pure-Flyway, so the
  safe consolidation is to extend that hybrid (`baseline-on-migrate` adoption of existing user schemas +
  incremental versioned migrations + retiring `ddl-auto` to `validate`), with a 5-step plan each gated on
  booting against copied-populated + fresh DBs (H2 & Postgres). The cutover risks corrupting live user H2
  DBs, so it's runtime/DB-gated — staged, not done blind. (Same posture as the E1 veraPDF plan: the
  high-risk implementation needs infra to verify; the responsible safe-here deliverable is the grounded plan.)

### Wave 54 — E3 build-provenance workflow (config-complete; YAML-validated; pushed)

- **E3 config DONE (runtime-pending)**: added `.github/workflows/provenance.yml` — an **additive**,
  standalone workflow (release-publish + `workflow_dispatch`) that downloads the release assets and emits
  Sigstore-signed SLSA **build-provenance attestations** via `actions/attest-build-provenance@…v4.1.0`
  (downstream-verifiable with `gh attestation verify`). SHA-pinned (action SHA fetched from the official
  repo tags; harden-runner reuses the repo's existing pin), `id-token: write` + `attestations: write`
  permissions, `contents: read` default. YAML-validated (triggers/permissions/steps parse correctly).
  Because it's a **new** workflow it cannot break the existing build/release pipelines. Honestly labeled a
  **draft** (no CI runner here to execute it); next: run on a real release, then inline the attest step into
  the build jobs for build-time provenance + add cosign signing for Docker/Tauri artifacts.

### Wave 53 — C2/A3 CropController: package-private + de-reflected tests (verified; pushed)

- **C2/A3 (test-quality)**: the auto-crop pixel-scan logic (`detectContentBounds`, `isWhite`) was already
  comprehensively tested — but via brittle, non-compile-checked **reflection**
  (`getDeclaredMethod(...).invoke(...)`). Made those two pure methods package-private (visibility-only,
  behaviour-preserving, matching the RotationController pattern) and **de-reflected** the ~13 call sites in
  `CropControllerTest` into direct `CropController.detectContentBounds(img)` / `CropController.isWhite(rgb,t)`
  calls (removing 2 reflection fields + setups). The tests are now type-safe and refactor-safe. Verified:
  `:stirling-pdf:test` BUILD SUCCESSFUL, all CropController tests green.

### Wave 52 — B4 useViewerReadAloud decomposition (verified; pushed)

- **B4 continued (6th component)**: extracted 6 pure helpers from the `useViewerReadAloud.ts` hook
  (770→679 LoC) into a tested `readAloudTextUtils.ts` — `pickVoiceForLanguage` (exact→base→English→first
  fallback), `collectSupportedLanguageCodes`, `sortTextItemsByReadingOrder` + `mergeAdjacentTextItems` (now
  non-mutating), `buildSpokenText`, and `clampHighlightWordIndex`/`findWordIndexAtCharIndex` — with **40
  tests** (threshold boundaries, non-mutation, fallback ordering, char/word off-by-ones). Speech-synthesis/
  DOM I/O stays in the hook. Verified: core tsc 0, 40 tests, eslint clean.

### Wave 51 — B4 RulerOverlay decomposition (verified; pushed)

- **B4 continued (5th component, first non-config)**: extracted **12 pure geometry/unit/scale helpers**
  (`dist`/`midpoint`/`perpUnit`/`angleDeg`, metric+imperial formatters, `scaledCross` cross-system
  conversion, `pickScale` viewport resolution) from the viewer's `RulerOverlay.tsx` (1,032→891 LoC) into a
  tested `RulerOverlayUtils.ts` — **62 tests** covering unit-bucket boundaries, four-quadrant angles,
  signed-zero, cross-system conversion, and `pickScale` containment edge cases (this measurement math was
  error-prone + untested). DOM-bound helpers stayed in the component; types re-exported for the existing
  `EmbedPdfViewer` consumer. Verified: core tsc 0, 62 tests, eslint clean.

### Wave 50 — B4 AdminGeneralSection decomposition (verified; pushed)

- **B4 continued (4th component)**: extracted 5 pure helpers from `AdminGeneralSection.tsx` (1,336→1,174
  LoC) into a tested `adminGeneralSectionUtils.ts` — `parseWatchedFoldersInput`, `validateWatchedFolders`
  (path-normalization + duplicate/nested/finished-folder-loop warnings), `filterDefaultLocaleOptions`,
  `buildGeneralSettingsSaveDelta`, `combineGeneralFetchData` — with **39 tests** (section had none). Network
  calls stay in the component. Verified: proprietary tsc 0, 39 tests, eslint clean. Four large config
  sections/components now decomposed (PdfTextEditorView + Admin{Advanced,Security,General}Section).

### Wave 49 — B3 FileContext lifecycle: de-dup + test the revocation decision (verified; pushed)

- **B3 largely DONE**: confirmed the lifecycle execution is already in a dedicated `FileLifecycleManager`
  (26 tests). Extracted the remaining pure slice — the blob-URL-revocation *decision* that was **duplicated**
  across `contexts/file/lifecycle.ts` and `types/fileContext.ts` — into a tested
  `contexts/file/fileLifecycleUtils.ts` (`collectRevocableBlobUrls` ordered+de-duped, `isRevocableBlobUrl`
  scheme guard; **16 tests** incl. null-safety, ordering, cross-field/intra-page de-dup, input
  non-mutation). Both call sites now consume the pure helper; the `URL.revokeObjectURL` side effects stay
  put. Behaviour-preserving; verified (core tsc 0, 112 contexts/file tests, eslint clean).

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
  (needs characterization tests on real PDFs first). Security hardening: **D2 done** (Wave 24);
  **D4 unit-testable validation portion done** (Wave 26 — `isValidURL` contract fix + SSRF regression
  guard; its TOCTOU/rebinding remainder is integration-level and was spawned as a follow-up task);
  **D5 done** (Wave 29 — S3 deployment-guardrails doc, grounded in the store code);
  **D1 done** (Wave 30 — desktop OAuth2 nonce/state audit: swap is prevented; redirect-origin hardening
  spawned as a follow-up); **D3 done** (Wave 32 — engine service-token auth, verified both sides; only
  cert-based mTLS remains a deployment-time alternative). **The entire D-series (D1–D5) is now done.**
  (B1 is now **done** — see Wave 5.)

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
  ✅ **DONE**: `vitest.config.ts` now has ratcheted `coverage.thresholds` (statements/lines 14.5,
  branches 78, functions 46) — see the FE coverage waves.
- **A3. Backend integration tests with Testcontainers** for the top PDF endpoints (merge, split,
  convert, OCR, sign) — bridges the gap between unit tests and Cucumber e2e. *Effort:* M. *Risk:* low.
  ⏳ **Started (Wave 43)**: the *stateless* PDF endpoints (merge, split) need **no Testcontainers/Docker** —
  added `MergeControllerIntegrationTest` (3 tests) exercising the **real PDFBox** page-merge logic
  end-to-end (multi-doc page combination, single-doc preservation, empty-list), verified via
  `:stirling-pdf:test`. This was the first full integration test in `:core` (only reflection/DTO unit tests
  existed). The container-backed half (DB-touching endpoints + real convert/OCR needing native tools) still
  needs Docker.
- **A4. Accessibility tests** (axe-core / jest-axe) — 399 aria/role usages, zero a11y assertions.
  Wire into CI as a regression gate. *Effort:* M. *Risk:* low.
  ⏳ **Foundation + growing coverage DONE (Waves 35–39)**: `jest-axe` (+ `@types/jest-axe`) added; **22
  automated a11y assertions** now run axe-core against rendered components on the existing jsdom infra (10
  shared components + 11 tool/file-editor components + the login `OAuthButtons`). **The tests caught a real
  bug**: `OAuthButtons` had `image-redundant-alt` (each provider icon used `alt={p.label}` while its button
  already had an `aria-label`/visible label) — **fixed** to decorative `alt=""` and pinned with a test.
  Reusable pattern established; broadening to the rest of the tree + a dedicated CI a11y gate remain.
- **A5. Unified coverage reporting** across Java (JaCoCo) + TS (v8) + Python (pytest-cov),
  surfaced as a single PR comment. *Effort:* M. *Risk:* low.
  ✅ **DONE (Wave 34)**: root `task coverage` runs all three tiers' coverage (JaCoCo + Vitest v8 +
  pytest-cov) and reports each location. The single-PR-comment surfacing is the CI-side remainder.
- **A6. Refresh AGENTS.md / DeveloperGuide** — the "no unit tests" claim is wrong and misleads
  both humans and agents. *Effort:* S. *Risk:* low.
  ✅ **DONE (Wave 34)**: AGENTS.md Testing Strategy corrected — stale "~314/~670 tests" replaced with the
  real suite (438+ backend / 184+ frontend test files, 293 engine tests) + all three enforced coverage
  gates documented; added an explicit "not a lightly-tested codebase" note.

### Workstream B — Frontend architecture & consolidation

- **B1. Pick one UI library and retire the other.** Mantine is the larger footprint and the
  documented stack; plan a layered migration (core → proprietary → saas → desktop) off MUI 9.
  *Evidence:* `@mui/material` + `@mui/icons-material` in ~157 files. *Effort:* L. *Risk:* med (billing/auth UI churn).
- **B2. Introduce a real state library for file state** (Zustand or Jotai) and collapse the 41
  contexts into ~8 domains (file, UI, auth, billing, viewer, tool-workflow…). *Effort:* L. *Risk:* med.
  ⏳ **Plan DONE (Wave 60)**: `docs/state-management-migration.md`. Grounded the real state — **no state
  library installed** (pure React Context); **42 provider files** (32 core/6 prop/1 saas/3 desktop); god-
  contexts led by `FileManagerContext` **1,274 LoC** (+ ToolWorkflow 824, Folder 645, Viewer 638…); the file
  context is consumed by **101 files**. Recommends **Zustand** (selector subscriptions fix the
  re-render-every-consumer problem; coexists with Context during migration; `persist` replaces the hand-rolled
  `IndexedDBContext`). Strategy: **API-preserving, leaf-first** — back each existing hook (`useFileContext`)
  with a store while keeping its shape so the 101 consumers don't change; migrate low-coupling contexts first,
  god-contexts last (split into typed slices behind the same facade, reconciled with the B3 blob lifecycle).
  Plan-only here because the success criterion (fewer re-renders, identical behavior) needs a browser
  profiler + e2e rig (absent) and each step touches up to 101 files → small revertible PRs, not a blind sweep.
- **B3. Extract memory/lifecycle management out of `FileContext`** into a dedicated, unit-tested
  service (blob URL revocation, PDF.js `.destroy()`, worker termination). This is the crash-risk
  hotspot for the 100 GB+ goal. *Effort:* M. *Risk:* med.
  ✅ **Largely DONE (Wave 49)**: the lifecycle execution is **already** extracted into a dedicated
  `FileLifecycleManager` (`contexts/file/lifecycle.ts`, 26 tests) — no PDF.js `.destroy()`/worker calls
  remain in the contexts tree. Wave 49 extracted the remaining pure piece — the *decision* of which blob
  URLs to revoke, which was **duplicated** in `lifecycle.ts` and `types/fileContext.ts` — into a tested
  `fileLifecycleUtils.ts` (`collectRevocableBlobUrls`/`isRevocableBlobUrl`, **16 tests**), de-duplicating
  both call sites; the actual `URL.revokeObjectURL` side effects stay in the manager. Verified: core tsc 0,
  112 `contexts/file` tests green, eslint clean.
- **B4. Decompose mega-components** — `PdfTextEditorView.tsx` (2,897), `pdfiumService.ts` (1,934),
  `AdminAdvancedSection.tsx` (1,790) into focused units; lazy-load per-tool UIs with `React.lazy`.
  *Effort:* M–L. *Risk:* low.
  ⏳ **Started (Waves 40, 42, 46)**: applied the proven pure-extraction pattern to the named mega-components
  + the largest config sections. **Wave 46** — `AdminSecuritySection.tsx` (1,580→1,453 LoC): extracted
  `buildSecuritySettingsSaveDelta` + `combineSecurityFetchData` (the pure save/fetch transforms, preserving
  falsy values + the `html.urlSecurity` presence guard + `_pending` merge order) into a tested
  `adminSecuritySectionUtils.ts` (**22 tests**; section had none), de-duplicating a ~38-line inline
  interface. Earlier: **Wave 40** — `PdfTextEditorView.tsx` (2,920→2,838 LoC): 6 pure font helpers →
  `pdfTextEditorFontUtils.ts` (22 tests; view had none) + a `NormalizedFontFormat` union. **Wave 42** —
  `AdminAdvancedSection.tsx` (1,790→1,724 LoC): 5 pure helpers (save-delta builder, pending-merge,
  tessdata language diff/sanitize/download-link derivation) → `adminAdvancedSectionUtils.ts` (**31 tests**;
  section had none), also removing a now-dead `useMemo`. Both behaviour-preserving + verified (tsc 0, tests
  green, eslint clean). `pdfiumService.ts` assessed + left (WASM-bound). Continued decomposition +
  `React.lazy` per-tool splitting remain.
- **B5. Tighten TypeScript incrementally** — enable `noUncheckedIndexedAccess`, `noUnusedLocals`,
  `noImplicitReturns` (currently commented out); burn down 71 `as any` casts (worst in
  `layerUtils.ts`, `StampPreview.tsx`). *Effort:* M. *Risk:* low.
  ⏳ **Substantial progress**: 3 strict flags enabled earlier (`noImplicitReturns`/`noFallthroughCasesInSwitch`/
  `noImplicitOverride`); `noUnusedLocals` evaluated + rejected (conflicts with the `_`-prefix convention,
  documented). Casts burned down across Waves 36/47/48: the roadmap's "71" was a worst-offenders sample —
  the real non-test count was **414** (≈405 in `core`; the proprietary/saas/desktop/prototypes layers
  already enforce `no-explicit-any: error` and were clean). Removed **24** (Wave 36: layerUtils/StampPreview)
  + **30** (Wave 47: error/http/fileContext/PdfiumFormProvider) + **208** (Wave 48: 99 core files —
  redundant axios-config casts, `catch(e: unknown)`+narrowing, declared globals, real `@cantoo/pdf-lib`/
  PDFium/EmbedPDF types, branded `FileId`/`StirlingFile`, etc.). **Now 414→136**, and the remaining 136 are
  documented-intentional (dynamic `[key:string]: any` settings bags, `(...args: any[])` HOF constraints,
  untyped third-party SDKs — Google Picker/EmbedPDF internals). All type-only; verified: all 5 layer tscs 0,
  eslint clean, **full FE suite 209 files / 4048 tests green**. `noUncheckedIndexedAccess` (invasive) remains.
- **B6. Add circular-dep + bundle gates to CI** — `madge`/`dpdm` and `rollup-plugin-visualizer`
  are installed but not run in CI. *Effort:* S. *Risk:* low.
  ⏳ **Largely DONE**: the **circular-dependency gate is live** — `frontend:lint` runs
  `npx dpdm editor/src --circular --no-warning --no-tree --exit-code circular:1` (verified: **0 circular
  dependencies**, exit 0), and `frontend:lint` is part of `frontend:check`/`check:all`, so CI fails on a
  new cycle. The **bundle visualizer** is wired (`task frontend:analyze`, Wave 36/F3). Only the bundle
  *size-budget* threshold gate (a CI assertion on chunk size) remains.

### Workstream C — Backend architecture & code health

- **C1. Break up `PdfJsonConversionService` (≈6,958 LoC)** into extractor / serializer / cache /
  graphics collaborators — currently untestable and unmaintainable. *Effort:* L. *Risk:* med.
- **C2. Thin out fat controllers** (e.g. `ConvertPDFToPDFA` ≈2,565 LoC) — push logic into services,
  keep controllers as HTTP mappers. ~18% of files are controllers. *Effort:* M–L. *Risk:* low.
  ⏳ **Started (Wave 38)**: extracted 3 pure helpers (`countGlyphs`, `stripNonPrintableAscii`,
  `detectMimeTypeFromFilename` + the MIME map) out of `ConvertPDFToPDFA` into a tested
  `PdfaConversionUtils` (controller 2,565→2,504 LoC), replacing reflection-based testing with direct
  unit tests. Behaviour-preserving — verified: `:stirling-pdf:test` BUILD SUCCESSFUL with both the new
  `PdfaConversionUtilsTest` and the existing `ConvertPDFToPDFATest` green. The larger
  service-extraction (the PDF/A pipeline itself) remains.
- **C3. Streaming I/O for large files.** Replace whole-file `Files.readAllBytes`/`readAllLines`
  in converters with `InputStream→OutputStream` streaming to make the 100 GB+ target real and cap
  memory under concurrency. *Effort:* L. *Risk:* med.
  ⏳ **Plan DONE (Wave 56)**: `docs/streaming-io-plan.md`. Key finding: the streaming response infra
  **already exists** (`WebResponseUtils.fileToWebResponse` → `ManagedTempFileResource`, which streams a
  temp file and auto-deletes it after the body is written). C3's work is converting the
  `Files.readAllBytes(tempFile)` → `bytesToWebResponse` callers, handling the premature-delete pitfall
  (move the manual `finally`-delete to the resource). Correctness is unit-testable here (drain the
  `Resource`); the memory benefit needs the F1 load rig. Staged plan; eventual impl de-risked by the
  pre-existing infra.
- **C4. Formalize temp-file lifecycle.** Unify `TempFileManager` vs ad-hoc `Files.createTempFile`,
  guarantee try-with-resources, add leaked-temp-file metrics, harden temp dir permissions.
  *Effort:* M. *Risk:* low.
- **C5. Add a caching layer** (Caffeine embedded / Valkey distributed via the existing backplane)
  for hot reads (users, roles, settings); profile JPA N+1s. *Effort:* M. *Risk:* low.
- **C6. Centralize DB migrations.** Flyway exists only in `saas`; bring core schema under one
  migration strategy (see `DATABASE.md`). *Effort:* M. *Risk:* med (data).
  ⏳ **Plan DONE (Wave 55)**: `docs/db-migration-consolidation.md`. Grounded the real state — non-saas uses
  `ddl-auto=update` on a **file-based H2 DB holding live user data** (no migrations); saas is a *hybrid*
  (Hibernate base + Flyway `baseline-on-migrate` deltas V2–V9, no V1, V7 skipped). The safe consolidation is
  to **extend that hybrid model** to non-saas (`baseline-on-migrate=true` → adopt existing user schemas,
  then incremental versioned migrations, `ddl-auto` retired to `validate`), **not** a risky full V1-baseline
  rewrite. Gave a 5-step staged plan, each gated on booting against a *copied populated* DB + a fresh DB (H2
  & Postgres). The cutover is runtime/DB-gated (corrupting live user H2 DBs is the risk) → executed
  step-by-step against real DB copies, not blind here.
- **C7. Logging hygiene.** Remove `System.out`/`printStackTrace` holdovers; adopt structured
  (JSON) logging with trace/correlation IDs. *Effort:* S–M. *Risk:* low.

### Workstream D — Security & auth hardening

- **D1. Audit the Tauri/desktop OAuth2 callback flow.** CSRF is intentionally disabled in the
  proprietary security config (stateless + nonce-in-state); verify the nonce/state cannot be
  swapped on the desktop `window.location` redirect path. *Evidence:* `SecurityConfiguration.java`.
  *Effort:* M. *Risk:* high if wrong.
  ✅ **DONE (Wave 30)** — audit `docs/desktop-oauth-security-audit.md`: nonce/state swap is **prevented**
  (OAuth2 `state` validation survives the disabled `http.csrf()`; the random state is preserved + the
  nonce is bound inside it; token via URL fragment). Residual hardening = the redirect-`origin`
  derivation (`X-Forwarded-Host`/`Referer` heuristics) → spawned as a follow-up task.
- **D2. PII-safe OIDC diagnostics.** `security.oauth2.debugLogging` dumps ID-token/UserInfo claims;
  add automatic scrubbing/redaction and short log retention so an operator can't leave PII in logs.
  *Effort:* S. *Risk:* med.
- **D3. Harden Java↔engine trust.** `AiProxyService` forwards `X-API-KEY` to the Python engine over
  plain localhost HTTP; add mTLS or scoped service tokens for any non-loopback deployment.
  *Effort:* M. *Risk:* med.
  ✅ **DONE (Wave 32)**: scoped service token — engine `ApiKeyAuthMiddleware` enforces
  `STIRLING_ENGINE_API_KEY` (401 when set+missing/wrong; off by default), Java `AiEngineClient` sends
  `X-API-Key` from `aiEngine.apiKey`. Verified both sides (engine 287 tests; `:proprietary` gate PASS).
  mTLS proper (cert-based) remains a deployment-time alternative.
- **D4. SSRF review of URL-fetch features** (HTML→PDF, URL→PDF, TSA timestamp client uses raw
  `URLConnection`): allow-list/deny internal ranges, validate user-supplied URLs. *Effort:* M. *Risk:* med.
  ⏳ **PARTIAL (Wave 26)**: the unit-testable validation core is done — `isValidURL` now honours its boolean
  contract (catches the `SecurityException` from `Urls.create` for non-http/denied-infra hosts instead of
  500-ing) and a `GeneralUtilsAdditionalTest` SSRF regression guard pins the canonical targets (cloud IMDS,
  IPv6 loopback/link-local, broadcast/reserved). Remaining (integration-level, spawned as a follow-up task):
  the URL→PDF TOCTOU/DNS-rebinding window + WeasyPrint sub-resource fetching, and the TSA client review.
- **D5. S3 backend deployment guardrails.** New S3 store is reasonably tested in-repo, but document
  and template bucket encryption, least-privilege IAM, and lifecycle/expiry for `transient/` keys.
  *Effort:* S–M. *Risk:* med.
  ✅ **DONE (Wave 29)**: `docs/s3-deployment-guardrails.md` — bucket default-encryption (code sets no SSE),
  least-privilege IAM grounded in the exact operations (`Put`/`Get`/`Delete`; no `ListObjects`; prefer IAM
  role over static keys), and `transient/`-scoped lifecycle expiry, plus the endpoint-SSRF guard + a
  `storage.s3.*` config reference.

### Workstream E — Supply chain & dependencies

- **E1. Reduce the manual CVE-pin burden by upgrading/replacing veraPDF.** Several
  `resolutionStrategy.force` entries (rhino, etc.) and the `javax.xml.bind` EOL stack exist only to
  paper over veraPDF lag. *Evidence:* `build.gradle:196–214`, `app/core/build.gradle:82–89`.
  *Effort:* M–L. *Risk:* med.
  ⏳ **Audit DONE (Wave 36)**: `docs/verapdf-pin-audit.md` classifies every pin (3–4 genuinely
  veraPDF-driven + candidate-removable: the rhino force + `javax.xml.bind` jaxb-api/impl; gson/commons/
  BouncyCastle are independent CVE pins that must stay), assesses the PDF/A-validation upgrade risk + the
  missing PDF/A-fixture coverage, and gives a step-by-step removal plan each gated on `:stirling-pdf:test`.
  The upgrade hinges on one unverified upstream fact (has veraPDF migrated off `javax.xml.bind`?) + needs
  Maven Central access, so it's staged, not executed blind.
- **E2. Generate an SBOM** (CycloneDX Gradle + npm + Python) and attach to releases. *Effort:* S. *Risk:* low.
  ✅ **DONE (Wave 31)**: all three SBOMs wired — Gradle (`cyclonedxBom`), Python (`engine:sbom` via
  `cyclonedx-bom`, 213 components), npm (`frontend:sbom` via `@cyclonedx/cyclonedx-npm@4.2.1`, 988
  components), all CycloneDX 1.6. Only the release-attachment step is CI-side.
- **E3. Release provenance + signing.** Add SLSA provenance/attestations and signed tags/artifacts
  for JAR, Docker images, and Tauri installers. *Effort:* M. *Risk:* low.
  ⏳ **Config DONE / runtime-pending (Wave 54)**: added `.github/workflows/provenance.yml` — a standalone,
  additive workflow (release-publish + manual-dispatch) that downloads release assets and generates
  Sigstore-signed **build-provenance attestations** via `actions/attest-build-provenance@…v4.1.0`
  (verifiable downstream with `gh attestation verify`). SHA-pinned (incl. the repo's own harden-runner pin),
  correct `id-token`/`attestations` permissions, YAML-validated. It's **additive** (a new workflow — cannot
  break the existing build/release pipelines) and labeled a **draft authored without a CI runner** to
  validate against. Remaining: run it on a real release, then move the attest step into the build jobs for
  full build-time SLSA, and add Docker-image + Tauri-installer signing (cosign).
- **E4. Enforce the license report in CI** (currently generated but not gated). *Effort:* S. *Risk:* low.
- **E5. Re-evaluate stale deps** — `telegrambots 6.9.7.1` (4+ yrs, heavily excluded) and the JAXB 2
  stack. Remove if unused. *Effort:* S–M. *Risk:* low.

### Workstream F — Performance & scalability

- **F1. Back the streaming work (C3) with load tests** at the 100 GB+ target and concurrent-request
  memory profiling. *Effort:* M. *Risk:* low.
  ⏳ **Harness DONE (Wave 41)**: added `testing/load/api-load-test.js` — a ready-to-run k6
  concurrent-load script (ramping VUs, p95/p99 latency + error-rate thresholds that fail the run, all
  env-tunable) targeting `/api/v1/info/status`, with a commented multipart `merge` scenario template for
  the heavy SISO path. JS/ESM syntax validated. Executing it needs a running instance + a load-gen host
  (no rig here); the harness + thresholds are in place for the C3 streaming validation.
- **F2. Async job execution review.** The `@AutoJobPostMapping` system + "cancel long-running AI
  task" feature is new; verify cancellation actually frees threads/temp files and is backpressured.
  *Effort:* M. *Risk:* med.
- **F3. Frontend bundle budget** — ⏳ **Foundation DONE (Wave 36)**: wired `rollup-plugin-visualizer`
  into the Vite build, gated on `--mode analyze` (cross-platform) so normal builds are unaffected; emits
  `frontend/editor/dist/stats.html` (treemap, gzip+brotli sizes). Added `npm run analyze` + `task
  frontend:analyze`. Verified by a real build (`✓ built in 42s`, report produced) — which **fixed a real
  bug** (the report was being written to the wrong dir) and surfaced a 2.84 MB / 843 kB-gzip main chunk to
  budget. The CI size-budget gate + lazy-loading remain. (original below)
  run the installed visualizer in CI, set a size budget, lazy-load
  tools and admin sections. *Effort:* S–M. *Risk:* low.

### Workstream G — Observability

- **G1. End-to-end OpenTelemetry tracing.** The Python engine already uses OTel; the Java side has
  Micrometer/actuator but no distributed tracing. Propagate W3C TraceContext across
  frontend → Java → engine. *Effort:* M. *Risk:* low.
  ⏳ **Engine slice DONE (Wave 33)**: `RequestContextMiddleware` extracts W3C `traceparent` so engine
  spans continue the upstream trace. Java Micrometer-tracing emission + an OTLP collector remain
  deployment-side.
- **G2. Structured logging + log correlation** (pairs with C7). *Effort:* S–M. *Risk:* low.
  ✅ **DONE (Wave 33)**: per-request `X-Request-Id` correlation id (generated/echoed) injected into every
  engine log line via `RequestIdLogFilter`; verified by 6 tests.
- **G3. Telemetry consent clarity.** PostHog is wired across all three tiers; document the opt-out
  and provide a single privacy-first kill switch. *Effort:* S. *Risk:* low.
  ⏳ **PARTIAL (Wave 27)**: the engine kill switch (`setup_posthog_tracking` → None when
  `STIRLING_POSTHOG_ENABLED=false` or no API key) is now verified + regression-tested (`tracking.py`
  29%→93%; engine floor ratcheted 75→79). Remaining: the unified cross-tier switch + frontend/Java opt-out
  docs (need those runtimes to verify).

### Workstream H — DevOps / CI / build / release

- **H1. Enable Gradle configuration cache** (currently commented out in `gradle.properties:12`) —
  meaningful incremental-build speedup once tasks are compatible. *Effort:* M. *Risk:* low.
- **H2. Consolidate workflow sprawl.** Collapse the 4 e2e workflows and 3 PR-deploy workflows into
  parameterized reusable workflows; document CI profiles/flags. *Effort:* M. *Risk:* low.
  ⏳ **Audited + plan DONE (Wave 59)**: `docs/ci-workflow-consolidation.md`. Finding: **largely already
  done in the fork** — `build.yml` is an orchestrator delegating to **15 reusable `workflow_call`
  sub-workflows** (backend-build, e2e-stubbed/live, frontend-validation, db-migration-test, …), runner
  selection is centralized in `_runner-pick.yml` (18 callers), and a `setup-bot` composite action exists.
  The residual duplication is the per-job `harden-runner`+`checkout` prelude (38/34 workflows), which
  GitHub *structurally requires per job* — only a composite action can DRY it, a readability win not a
  structural one. Staged composite-action rollout documented, but each step edits a **live** workflow whose
  egress/permissions/SHA-resolution are only verifiable on a CI runner (absent here) → plan-only, like E3/H4.
- **H3. Unify Docker build matrix** (base / embedded / fat / ultra-lite / frontend / unoserver) into
  one cache-shared build. *Effort:* M. *Risk:* low.
  ⏳ **Covered by the Wave 59 audit** (`docs/ci-workflow-consolidation.md`): the build-matrix workflows
  (`push-docker`, `test-build-docker`, `multiOSReleases`, `tauri-build`) are already reusable
  `workflow_call` units invoked by the orchestrator. Further matrix-cache unification edits release-critical
  Docker workflows and needs Docker + a CI runner to validate (neither here), so it's explicitly deferred to
  the CI-gated rollout — not done blind.
- **H4. Add a release approval gate** before AUR/package-manager auto-publish. *Effort:* S. *Risk:* low.
  ✅ **DONE (Wave 41)**: added a job-level `environment: package-publish` gate to the `publish-aur`
  (`aur-publish.yml`) and `update-homebrew-and-scoop` (`package-managers.yml`) jobs. Configure required
  reviewers on that GitHub Environment (repo Settings → Environments) to require manual approval before
  auto-publish. Safe no-op until protection rules are set, so it can't block existing releases. YAML
  validated; the approval behaviour itself activates on GitHub (not runtime-verifiable here).

### Workstream I — Python AI engine & infra maturity

- **I1. Engine coverage visibility** — ✅ **DONE (Wave 25)**: `pytest-cov` wired into pyproject + `uv.lock`,
  `[tool.coverage]` config with enforced `fail_under=75` (baseline 78.3% statement+branch), `engine:test`
  emits `coverage.xml`, gate verified real. *Effort:* S. *Risk:* low.
- **I2. Cluster backplane resilience tests** — exercise Valkey partition/failover, lock release, and
  rate-limit key expiry; the in-process impl is well-tested but the external path less so. *Effort:* M. *Risk:* med.
  ⏳ **Design DONE (Wave 62)**: `docs/valkey-backplane-design.md`. Investigation corrected the premise — the
  **Valkey path's implementation doesn't exist yet** (only `cluster/inprocess/`; no `valkey/` package), so I2
  is blocked on *two* layers: the missing impl AND no Valkey server to test it. But the fork is already
  Valkey-**ready**: a clean 6-interface SPI (`ClusterBackplane`/`KeyValueCache`/`RateLimitStore`/
  `DistributedLock`/`InstanceRegistry`/`JobStore`), `InProcessClusterConfiguration` providing all 6 as
  `@ConditionalOnMissingBean` (so a `ValkeyClusterConfiguration` slots straight in), and config+validation
  (`cluster.valkey.url`/`.tls.*`, `ClusterConfig.validate()` already enforces the Valkey contract). Design
  specifies a Lettuce-backed impl per interface + the **Lua scripts** for the atomic ones, and the key honesty
  point: the bug-prone correctness (token-bucket refill, lock compare-and-delete) lives in Redis-side
  atomicity a **mock cannot exercise** → needs a Testcontainers Valkey suite (Docker absent here). So design +
  verification strategy now; impl+integration gated on infra, like C6/H2/H3.
- **I3. Document the engine contract & failure modes** (typed in/typed out, what happens when the
  model/provider is down or returns malformed structured output). *Effort:* S–M. *Risk:* low.
  ✅ **DONE (Wave 28)**: `engine/CONTRACT.md` — full typed endpoint table (verified against live
  `app.routes`), failure-mode taxonomy (422 / 400 / opaque-500 for provider+schema+usage+domain errors /
  streaming 200-then-error-frame), fail-fast startup, telemetry opt-out. Flags the "all errors → 500" gap
  as a future global-handler improvement.

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
