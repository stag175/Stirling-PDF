# Valkey cluster backplane — design (roadmap I2)

> **I2**: "Provide a distributed (Valkey) cluster backplane so multi-node deployments coordinate
> state, not just the in-process single-JVM stub."
>
> Grounded in the real `app/common/.../cluster/` SPI and the already-present Valkey configuration.
> **Headline: the architecture and config are already in place; only the `valkey` *implementations*
> are missing.** They can't be honestly verified on this box — the parts that matter
> (`RateLimitStore`, `DistributedLock`) are correct only by virtue of Redis-side atomicity / Lua
> scripts, which a mocked client cannot exercise and which need a real Valkey (Testcontainers /
> redis-server) absent here. So this is a design + verification strategy, not a blind half-feature.

## What already exists (verified)

- **A clean SPI** under `stirling.software.common.cluster`: `ClusterBackplane` (+ `backplaneType()`
  already enumerating `"inprocess" | "valkey"`), `KeyValueCache` (put/get/evict/evictNamespace),
  `RateLimitStore` (`tryConsume(bucketKey, capacity, refillPeriod) -> RateLimitDecision`),
  `DistributedLock` (`tryAcquire -> LockHandle{release, renew}`), `InstanceRegistry`
  (register/lookup/activeNodes/deregister), and a `JobStore`.
- **A complete in-process implementation** (`cluster/inprocess/`) wired by
  `InProcessClusterConfiguration` — `@Configuration` + `@ConditionalOnExpression(...)` providing all
  **6 beans**, each `@ConditionalOnMissingBean`. That last detail is the hook for I2: a Valkey config
  that registers these beans when `backplane=valkey` slots straight in, with the in-process beans as
  the fallback.
- **Config + validation already modeled.** `ApplicationProperties.Cluster` has `enabled`,
  `backplane` (`inprocess`|`valkey`), `artifactStore`, `valkey.url`, `valkey.tls.{enabled,
  skipCertVerification}`, and `node.{id,role}`. `ClusterConfig.validate()` already **requires**
  `cluster.valkey.url` when `backplane=valkey` and rejects unknown backplanes — i.e. the operator-
  facing contract for Valkey is done; only the runtime beans are absent.

## What I2 must add

A new `cluster/valkey/` package + `ValkeyClusterConfiguration` (`@ConditionalOnExpression` matching
`cluster.enabled && backplane == valkey`) providing the 6 beans backed by **Lettuce**
(`io.lettuce:lettuce-core`, Netty-based, supports TLS via `valkey.tls` and Redis/Valkey wire
protocol). One shared `RedisClient`/`StatefulRedisConnection` bean built from `valkey.url` (+ TLS
options), closed on context shutdown.

| SPI | Valkey realization | Correctness lives in… |
|---|---|---|
| `KeyValueCache` | `SETEX ns:key ttl val` / `GET` → `Optional` / `DEL` / `SCAN`+`DEL` for `evictNamespace` | key-namespacing + TTL/`Optional` mapping (**mock-testable**) |
| `RateLimitStore.tryConsume` | atomic token-bucket via a single **Lua `EVAL`** (read tokens+timestamp, refill, decrement, set TTL) returning `{allowed, remaining, waitNanos}` | the **Lua script** (NOT mock-testable) |
| `DistributedLock` | `SET key token NX PX lease`; release = compare-and-`DEL` **Lua**; renew = compare-and-`PEXPIRE` **Lua** | atomicity + the compare-delete **Lua** (NOT mock-testable) |
| `InstanceRegistry` | node hash per id with heartbeat TTL; `activeNodes` via a `SCAN`/set of live ids | TTL expiry semantics (server-dependent) |
| `JobStore` | hash/stream per job, mirroring `InProcessJobStore` semantics | TTL + cross-node visibility |
| `ClusterBackplane` | `isHealthy()` = `PING`; `backplaneType()` = `"valkey"`; `localNodeId()` = `Cluster.resolvedNodeId()` | trivial |

## Why this is design-only here (the verification gap)

The valuable, bug-prone logic is the **Lua atomicity** of `RateLimitStore` and `DistributedLock`
(token-bucket refill races; lock release deleting *someone else's* lock; renew-after-expiry). A
**mock `RedisCommands` cannot execute Lua** — a mock test would assert "we called `EVAL` with script X
and args Y", which is tautological, not a correctness proof. Honest verification needs the script run
against a **real Valkey**:
- **Testcontainers** (`valkey/valkey` image) in CI — needs Docker (absent on this box), or
- **embedded redis-server** binary — not present on this Windows box.

So shipping these impls blind would be the opposite of "verify your work." The responsible split:

1. **Design + bean wiring sketch** (this doc) — done.
2. **Implement** the 6 Valkey beans + Lua scripts behind `ValkeyClusterConfiguration`.
3. **Verify with a Testcontainers Valkey integration suite** asserting the real behaviors:
   concurrent `tryConsume` respects capacity; a second `tryAcquire` fails while held and succeeds after
   lease/expiry; `release` only deletes the holder's lock; `KeyValueCache` TTL eviction. This suite is
   the regression gate and **requires Docker/CI** — hence the implementation is gated on infra not
   present here, exactly like the C6 DB cutover and the H2/H3 CI rollout.

`KeyValueCache` alone is mock-testable for its key-construction/TTL mapping and could land first with
unit tests, but it's the least valuable third of the work; the coordination primitives — the actual
point of a distributed backplane — are the ones that need a real server.

## Net

I2 is not "no implementation possible" — it's "the implementation's correctness is in Redis-side
atomic semantics that need a real Valkey to verify, and there's no Valkey/Docker here." The fork is
already Valkey-*ready* (SPI + conditional beans + config + validation); the remaining work is the
`valkey/` impl package plus a Testcontainers integration suite as its gate.
