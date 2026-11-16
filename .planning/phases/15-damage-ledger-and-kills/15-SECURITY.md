---
phase: "15"
slug: damage-ledger-and-kills
status: verified
threats_open: 0
asvs_level: 1
created: "2026-11-16"
---

# Phase 15 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Oolite config to generated content | `compileNpcShips` reads `shipdata.plist` and writes `src/content/generated/ships-npc.json` at build time | authored numbers and strings, validated by a strict schema |
| Snapshot input to the simulation | `parseWorldSnapshot` accepts a world snapshot (alpha: not persisted in saves) | untrusted JSON with the v4 fields (velocity, weapon, cargo, staticHealth) |
| Event handlers to world state | AI `onEvent` handlers run inside the immediate kill drain | handler writes to entity fields and fire requests |
| Sim core to app | `shipDestroyed` and `entityRemoved` stay inside `src/sim` | entity ids never leave the sim |

The project has no network surface and no database.

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-15-01 | Tampering | `compileNpcShips` new fields | medium | mitigate | typed extractors fail the build on a malformed value; strict schema and runtime re-validation (`npc-ships.ts:212-327`, `ship-npc.ts:61`) | closed |
| T-15-02 | Repudiation | generated record provenance | low | mitigate | `assets:check` drift gate, NOTICE names every derived field, golden cites plist lines | closed |
| T-15-03 | Tampering | facing mask bypass | low | mitigate | a facing's weapon is read only when its `weapon_facings` bit is set (`npc-ships.ts:298`) | closed |
| T-15-04 | Tampering | `parseEntity` / `parseWorldSnapshot` new keys | high | mitigate | closed key lists, forbidden keys, bounded numeric parsers, version check refuses 3 and 5 (`snapshot.ts:542-1162`) | closed |
| T-15-05 | Denial of service | non-finite new field reaching the hash | high | mitigate | `cleanV4Fields` and `sanitizeStaticHealth` run every tick and before hashing; snapshot refuses non-finite | closed |
| T-15-06 | Tampering | pristine-omit hiding a real difference | medium | mitigate | each segment prints when any leaf is non-pristine (`serialize.ts:157-169`), pinned per leaf | closed |
| T-15-07 | Tampering | silent hash drift of existing worlds | medium | mitigate | never-spawned world equals the old golden; strip proof back to `c1068643` | closed |
| T-15-08 | Tampering | cargo draw moving a hashed stream | high | mitigate | stateless `cargo` RNG purpose; isolation test | closed |
| T-15-09 | Denial of service | `forkSeed` throwing in `populateInertWorld` | medium | mitigate | id range checked before the fork (`populate.ts:336-345`) | closed |
| T-15-10 | Tampering | malformed `likelyCargo` / `maxCargo` from an app record | medium | mitigate | total `cargoCountAtSpawn`, cap at `MAX_ENTITY_CARGO`, spawn refuses out-of-domain cargo | closed |
| T-15-11 | Denial of service | kill-notification fan-out | medium | mitigate | queue cap 4096, drain passes and budget, drops counted | closed |
| T-15-12 | Denial of service | dead entity or queued event at the tick boundary | high | mitigate | kills, drain and second commit run every stepped tick; snapshot refuses a dirty boundary | closed |
| T-15-13 | Elevation of privilege | `onEvent` queuing a shot during the immediate drain | medium | mitigate | fire queue truncated after the drain (`world/step.ts:335-337`) | closed |
| T-15-14 | Denial of service | `applyLedger` or `killShip` throwing | high | mitigate | total on malformed input, with unit and fast-check totality tests | closed |
| T-15-15 | Tampering | station, buoy or player removed by the kill path | high | mitigate | player routed away from the lethal set; `killShip` refuses ids 1-5 and 100 | closed |
| T-15-16 | Information disclosure | entity ids leaving the sim | low | mitigate | `shipDestroyed` and `entityRemoved` unrouted outside `src/sim`; entity-id-scope guard | closed |
| T-15-17 | Denial of service | boundary invariant regressing unnoticed | high | mitigate | `boundaryHolds` property after every tick | closed |
| T-15-18 | Tampering | kill non-determinism across cadences | medium | mitigate | cross-cadence test at 30, 60 and 144 Hz | closed |
| T-15-19 | Denial of service | test-suite run time | low | accept | measured about 1 to 2 s for the property file | closed (accepted) |
| T-15-20 | Denial of service | handler writing an out-of-domain value during the drain | high | mitigate | `sanitizeEntity` over every live entity after the drain | closed |
| T-15-21 | Denial of service | survivor meeting a removed id it still holds | medium | mitigate | holders re-read through the view; 120-tick survivor test | closed |
| T-15-22 | Repudiation | vacuous random-fight property | medium | mitigate | fixed seed and non-vacuity counters | closed |
| T-15-23 | Repudiation | browser kill step ignores return fire | medium | mitigate | Vitest twin pins the kill tick and bank floor; e2e holds fire | closed |
| T-15-SC | Tampering | npm/pip/cargo installs (plans 01 to 06) | low | accept | no dependency or build-infra change in the phase | closed (accepted) |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above `high` count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-15-01 | T-15-SC | No package is installed or changed in this phase; verified by an empty diff of `package.json`, `package-lock.json`, `compose.yaml` and `Dockerfile` | plan-time disposition (the six Phase 15 plans) | 2026-11-16 |
| AR-15-02 | T-15-19 | The random-fight property (50 seeded runs) and the totality properties (about 100 runs each) take about 1 to 2 s for the file, recorded in 15-06-SUMMARY.md | plan-time disposition (plan 15-06) | 2026-11-16 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-11-16 | 29 (23 unique IDs; T-15-SC repeats in each of the six plans) | 29 | 0 | gsd-security-auditor |

Non-blocking observations from the audit:

1. T-15-09: the id guard before `forkSeed` has no test that drives `populateInertWorld` against a spent id counter. The state is unreachable on a fresh world, so the guard is defence in depth. A targeted pin is cheap to add in a later phase.
2. T-15-07: the plan text says "unchanged Lave golden"; the golden changed once, in plan 15-03 (`c1068643` to `ff6489bf`, by design, owner-acknowledged as OD-1). Drift detection still holds through the strip proof.

No unregistered threat flags: all six SUMMARY files list none, and the phase diff adds no network, storage, `eval`, `innerHTML`, DOM, `Date.now`, `Math.random`, `process.env` or file I/O surface.

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-11-16 (auditor verdict SECURED, ASVS level 1, block_on high)
