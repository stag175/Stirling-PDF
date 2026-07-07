# veraPDF dependency-pin audit (roadmap E1)

> **E1**: "Reduce the manual CVE-pin burden by upgrading/replacing veraPDF. Several
> `resolutionStrategy.force` entries (rhino, etc.) and the `javax.xml.bind` EOL stack exist only to
> paper over veraPDF lag."
>
> This is a **read-only audit + ordered removal plan**. The actual upgrade is a behaviour-critical,
> staged change (PDF/A validation path) that must be done step-by-step behind a green
> `:stirling-pdf:test`; it is **not** a blind bulk edit. Line numbers below are the real current
> locations (the roadmap's `build.gradle:196–214` is now `212–234`; `app/core/build.gradle:82–89` is
> accurate). There is no `gradle/libs.versions.toml`; versions live inline.

## veraPDF in use

- `org.verapdf:validation-model:1.28.2` (`app/core/build.gradle:82`); all transitive veraPDF modules
  resolve at 1.28.2 (no skew). Used by exactly one service — `VeraPDFService`
  (`app/core/.../service/VeraPDFService.java`) — consumed by `VerifyPDFController` and `GetInfoOnPDF`.
  `ConvertPDFToPDFA` converts via Ghostscript/PDFBox-preflight and only calls veraPDF for advisory
  post-conversion warnings (it does **not** gate output bytes).

## Pin classification

**(a) veraPDF-driven, candidate-removable IF veraPDF is upgraded (verify against Maven Central first):**
| Pin | Location | Note |
|-----|----------|------|
| `org.mozilla:rhino:1.9.1` force | `build.gradle:225` + `app/core/build.gradle:84` | overrides veraPDF's old rhino (CVE-2025-66453). Removable iff a newer veraPDF brings rhino ≥ the fixed line. |
| `javax.xml.bind:jaxb-api:2.3.1` | `app/core/build.gradle:87` | EOL `javax` namespace, present only because "veraPDF still uses javax.xml.bind". **Linchpin: must confirm whether any released veraPDF has migrated to `jakarta.xml.bind`.** |
| `com.sun.xml.bind:jaxb-impl:2.3.9` | `app/core/build.gradle:88` | runtime impl for the javax JAXB above; removable in lockstep with the api. |

**(b) Ambiguous — attribute before touching:**
- `com.sun.xml.bind:jaxb-core:4.0.7` (`app/core/build.gradle:89`) is the *jakarta-era* 4.x line, grouped
  under the javax comment but **likely pulled by the mail stack (simple-java-mail/angus), not veraPDF**.
  Run `dependencyInsight` to confirm owner before removing.

**(c) NOT veraPDF-related — must stay regardless (independent CVE mitigations):**
- `com.google.code.gson:gson:2.13.2` (`build.gradle:224` + `app/core:93`) — **tabula**-driven (CVE-2022-25647).
- `org.apache.commons:commons-lang3:3.20.0` (`build.gradle:227`) — CVE-2025-48924.
- `commons-io` (`build.gradle:229`) — CVE-2024-47554. *(Note an inconsistency: forced to 2.21.0 globally
  but declared 2.22.0 directly in `app/core:70` — the force downgrades the direct dep; worth reconciling,
  out of E1 scope.)*
- BouncyCastle `bcprov/bcpkix/bcutil-jdk18on:1.84` alignment (`build.gradle:231–233`).

## Risk + required coverage before upgrading

veraPDF sits on a user-facing **validation verdict** path. The highest-risk coupling: `VeraPDFService`
hard-codes PDF/A clause strings `"6.7.2"`/test 1 and `"6.7.11"`/test 1 (VeraPDFService.java:232,241) to
detect "no PDF/A declaration" — a veraPDF major bump could renumber these and silently break the logic.

**Existing gate:** `VeraPDFServiceTest` exercises the real library but only on *non*-PDF/A inputs (asserts
"not-pdfa"); `VerifyPDFControllerTest` and `ConvertPDFToPDFATest` mock or bypass veraPDF. **Coverage gap to
close before upgrading:** add real PDF/A-1b and PDF/A-2b fixtures that must validate **compliant**, plus a
declared-but-broken PDF/A to lock the `6.7.2`/`6.7.11` branch, plus a PDF/UA fixture. `:stirling-pdf` floor
must hold (INSTRUCTION 0.39 / LINE 0.38 / BRANCH 0.32).

## Ordered plan (each step gated on a green `:stirling-pdf:test`)

0. **Pre-work (no dep change):** `./gradlew :stirling-pdf:dependencyInsight --dependency org.verapdf:validation-model`
   (and for `org.mozilla:rhino`, `javax.xml.bind:jaxb-api`, `com.sun.xml.bind:jaxb-core`) to attribute
   each pin's owner and resolve the `jaxb-core:4.0.7` ambiguity. Add the missing PDF/A-compliant fixture tests.
1. **Verify upstream (no code change):** inspect the target `validation-model` POM on Maven Central — does
   it still depend on `javax.xml.bind` or has it moved to `jakarta.xml.bind`, and what rhino does it bring?
   **No pin can be removed until this is answered.**
2. **Upgrade veraPDF** (`app/core/build.gradle:82`); fix any moved clause strings in `VeraPDFService`. Gate.
3. **Drop the rhino force** (only if Step 1 confirms safe rhino); re-check `dependencyInsight`; gate. Revert if it falls back to a vulnerable version.
4. **Drop the javax JAXB stack** (`:87`,`:88`) **only if** Step 1 confirms veraPDF migrated to jakarta; smoke the PDF/A endpoint at runtime (JAXB binding fails at class-init, not always in unit tests). Otherwise these stay — they are the load-bearing reason E1 exists.
5. **Resolve `jaxb-core:4.0.7`** per Step 0 attribution: fix the misleading comment if it belongs to the mail stack, else drop with veraPDF.

**Net:** of the pins blamed on veraPDF, **3–4 are genuinely veraPDF-driven** and candidate-removable, all
contingent on the single unverified fact — *whether a released veraPDF has migrated off `javax.xml.bind`*.
The gson/commons/BouncyCastle pins are independent and must remain. This audit gives the safe path; the
upgrade itself needs Maven Central access + the new PDF/A fixtures and should be executed step-by-step.
