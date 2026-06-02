# DB migration consolidation plan (roadmap C6)

> **C6**: "Flyway exists only in `saas`; bring the core schema under one migration tool."
>
> This is a **plan**, not a blind edit. The non-saas schema lives in a **file-based H2 database that
> holds real user data** (`spring.datasource.url=jdbc:h2:file:./configs/stirling-pdf-DB-…`), so getting
> the cutover wrong can corrupt or wipe existing installations. It must be staged + tested against
> copies of real DBs, which needs a running app — not doable on this box. Grounded in the actual config
> (`app/core/src/main/resources/application.properties`, `app/saas/.../application-saas.properties`,
> `app/saas/build.gradle`, `app/saas/.../db/migration/saas/`).

## Current state (verified)

| | Non-saas (core/common/proprietary) | saas |
|---|---|---|
| DB | H2 **file** DB (`MODE=PostgreSQL`), `org.h2.Driver`; Postgres in some deployments | Postgres |
| Schema mgmt | **`spring.jpa.hibernate.ddl-auto=update`** — Hibernate auto-creates/evolves the schema from the **18 `@Entity`** classes. **No migrations.** `defer-datasource-initialization=true`. | **Flyway** (`flyway-core` + `flyway-database-postgresql`), `spring.flyway.baseline-on-migrate=true`, `locations=classpath:db/migration,classpath:db/migration/saas`, schema `stirling_pdf`. |
| Migrations | none | `db/migration/saas/V2..V9` (**no `V1`**, `V7` skipped) — i.e. saas does **not** fully own the schema: Hibernate still creates the base tables, Flyway only layers saas-specific deltas, adopting the Hibernate-made schema via `baseline-on-migrate`. |

**Key insight:** even saas is a *hybrid* (Hibernate base + Flyway deltas via `baseline-on-migrate`), not a
pure-Flyway schema. So "consolidate" most safely means **extend that same hybrid model to the non-saas
profile** — not a risky full V1-baseline rewrite.

## Risks

1. **Existing user H2 DBs.** Millions of self-hosters have a populated `./configs/stirling-pdf-DB-*` file.
   Any approach that recreates/validates-strictly against a mismatched baseline will fail startup or drop
   data. `baseline-on-migrate=true` is the safe adoption path (Flyway stamps the *existing* schema as the
   baseline and only applies newer versioned migrations).
2. **`ddl-auto=update` → `validate`/`none` is a one-way process change.** The moment Hibernate stops
   auto-evolving, every future entity change MUST ship a migration or the app fails. This is the point of
   C6, but it changes the contributor workflow and must be documented + enforced.
3. **H2 vs Postgres dialect parity.** Shared migrations under `classpath:db/migration` must be DB-agnostic
   (or split per-vendor). H2 runs in `MODE=PostgreSQL`, which helps but isn't identical.
4. **The `saas` `V1` gap / `V7` skip** confirm the schema isn't migration-owned end-to-end today.

## Staged plan (each step gated on a green boot against a *copied* real DB + a fresh DB)

0. **Pre-work:** dump the current Hibernate-generated schema (run with
   `spring.jpa.properties.javax.persistence.schema-generation.scripts.action=create` against H2 and
   Postgres) to capture the exact baseline DDL for review/fixtures.
1. **Add `flyway-core` to the shared (`common`) runtime** (Postgres support already present for saas;
   H2 is built into flyway-core).
2. **Enable Flyway on the non-saas profile with `baseline-on-migrate=true`** + `locations=classpath:db/migration`
   (mirroring saas), **keeping `ddl-auto=update` for one release** so Flyway + Hibernate coexist exactly as
   saas does today. This is the low-risk adoption step: existing DBs get baselined, nothing is recreated.
3. **Move the next real schema change to a versioned migration** (e.g. `V1__baseline.sql` for fresh installs
   + `V10__…` for the change) instead of letting `ddl-auto` do it. Verify on both a fresh DB and a copied
   populated DB.
4. **Flip `ddl-auto` to `validate`** once a baseline migration set reproduces the entity schema, so
   Hibernate validates (never mutates). Gate on boot against fresh + populated H2 *and* Postgres.
5. **Backfill `saas` `V1`** (or document that `baseline-on-migrate` intentionally supplies it) and resolve
   the `V7` gap so the version history is contiguous and self-documenting.

## Verification (requires a runtime — staged, not done here)

- Boot with a **copy** of a populated `stirling-pdf-DB` file → Flyway baselines, app starts, data intact.
- Boot with a **fresh** DB → migrations create the full schema, `ddl-auto=validate` passes.
- Repeat against Postgres. Add a Testcontainers/H2 boot test asserting `flyway_schema_history` is populated
  and Hibernate validation passes — that test is the regression gate (needs Docker/DB, hence staged).

**Net:** C6's safe path is the saas hybrid model extended to non-saas (`baseline-on-migrate` + incremental
versioned migrations, `ddl-auto` retired to `validate`), executed step-by-step against real DB copies. The
cutover itself is runtime/DB-gated and must not be done blind on a user-data database.
