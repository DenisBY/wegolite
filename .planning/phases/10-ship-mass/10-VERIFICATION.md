---
phase: 10-ship-mass
verified: 2026-11-14T12:00:00Z
status: passed
score: 4/4 must-haves verified
covered_files:
  - .planning/PROJECT.md
  - .planning/phases/10-ship-mass/10-01-PLAN.md
  - .planning/phases/10-ship-mass/10-01-SUMMARY.md
  - .planning/phases/10-ship-mass/10-02-PLAN.md
  - .planning/phases/10-ship-mass/10-02-SUMMARY.md
  - .planning/phases/10-ship-mass/10-03-PLAN.md
  - .planning/phases/10-ship-mass/10-03-SUMMARY.md
  - .planning/phases/10-ship-mass/10-04-PLAN.md
  - .planning/phases/10-ship-mass/10-04-SUMMARY.md
  - FIDELITY.md
  - src/content/generated/ships-client.json
  - src/content/generated/ships-npc.json
  - src/content/schemas/ship-npc.ts
  - src/content/schemas/ship.ts
  - src/sim/hyperspace/countdown.ts
  - tests/golden/content/ships-npc.json
  - tests/sim/hyperspace-blockage.test.ts
  - tools/oolite-ingest/convert/npc-ships.ts
  - tools/oolite-ingest/convert/octree.ts
  - tools/oolite-ingest/convert/ship-mass.ts
  - tools/oolite-ingest/convert/ships.ts
  - tools/oolite-ingest/generate.ts
covered_digest: "v4:sha256:29c18227c0e9ca638520816867eccb58852c08b2c129a9461db26ffe269ca8e9"
behavior_unverified: 0
overrides_applied: 1
overrides:
  - must_have: "Worked examples for the Cobra Mk III, the Coriolis station and the Viper reproduce Oolite's mass within a stated tolerance"
    reason: "No Oolite runtime exists in this environment to observe ship.mass. The criterion is read as Oolite's algorithm run on the pinned meshes, re-derived independently in float64 within a relative 1e-6, plus the community VariableMasslock table to the whole tonne. A real-Oolite check is a deferred follow-up; if it disagrees only CORIOLIS_STATION_MASS, its test pins and the FIDELITY.md ledger paragraph change."
    accepted_by: "owner (answer criterion2-accept, plan 10-03 checkpoint)"
    accepted_at: "2026-11-14"
---

# Phase 10: Ship Mass Verification Report

**Phase Goal:** Every ship the inert world uses has Oolite's mass, computed at build time from an Oolite octree of its hull, and jump blockage uses one recorded Coriolis mass.
**Verified:** 2026-11-14
**Status:** passed
**Re-verification:** No, initial verification

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                                                                                                                                                         | Status                | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | The content build builds an octree per hull from the vendored `.dat` mesh and computes mass as `density * 20 * volume`; the nine role ships, Cobra Mk III and Coriolis carry it in compiled records                           | VERIFIED              | `tools/oolite-ingest/convert/octree.ts` (487 lines) and `ship-mass.ts` (188 lines) read against `Octree.m:634-690` and `ShipEntity.m:417-419`, `2034-2041`: float32 `fround` per operation, volume limit 5, `r*r*r` per terminal node, `fround(fround(density)*20)*volume`, plus ordered non-flasher subentity sum. `src/content/generated/ships-npc.json` has 9 records each with a positive float32 `mass` (viper 34040.6796875 ... krait 93291.40625); `ships-client.json` has `coriolis-station` 515483904, `oolite_template_cobra3-player` 214737.6875 and `buoy` 698691.1875; `ships.json` is mass-free. `NpcShipSchema` requires `mass`.        |
| 2   | Worked examples for Cobra Mk III, Coriolis and Viper reproduce Oolite's mass within a stated tolerance, cite the Oolite lines, and the three masses are entered in the constants ledger                                       | PASSED (override)     | Override: no Oolite runtime available, criterion read as algorithm-faithful port plus independent float64 re-derivation (relative 1e-6) plus VariableMasslock tonne table; accepted by owner on 2026-11-14 (criterion2-accept, revisable). Ledger exists at FIDELITY.md `## Constants ledger` (lines 393-410) with Cobra 214,737.6875, Viper 34,040.6796875, Coriolis 515,483,904, buoy, each with Oolite line citations and pinning tests. `ship-mass.test.ts` has float64 worked examples (lines 307, 321) and the community check; the targeted run passed.                                                                |
| 3   | Coriolis octree mass compared with 455,223,200; blockage uses one recorded value chosen by the owner, recorded as a Key Decision; blockage tests pass after re-pinning                                                        | VERIFIED              | `CORIOLIS_STATION_MASS = 515_483_904` at `src/sim/hyperspace/countdown.ts:59`, the only value used by `witchspaceStationMass`. PROJECT.md line 245 is the "Coriolis blockage mass:" Key Decision with both numbers, the +13.2 % difference, the owner choice and the radius change 6,747.0 m to 7,179.7 m. `tests/sim/hyperspace-blockage.test.ts` pins the constant to the compiled `coriolis-station` mass and re-pins to 7,100 m and 7,300 m; passes in the container. ROADMAP criterion 3 was amended to "after re-pinning", as the criterion itself allows.                                                                       |
| 4   | The octree exists only at build time: no octree data in the bundle, `src/sim` reads only the compiled mass, a changed mesh or octree rule fails `assets:check` through the mass golden; runtime ray and hull queries not built | VERIFIED              | `rg -i octree src` matches only two comments (`countdown.ts:48`, `schemas/ship-npc.ts:11`); no `src` import of `convert/octree` or `convert/ship-mass`; `src/sim` has no import of content or tools. No generated file or non-map file in `dist/assets` mentions an octree. `tests/golden/content/ships-npc.json` pins five masses and `docker compose run --rm assets npm run assets:check` reports "no differences". No DATA-16 hull or ray code exists.                                                                                                                                                                  |

**Score:** 4/4 truths verified (1 by owner override)

### Required Artifacts

| Artifact                                                               | Expected                                | Status   | Details                                                                  |
| ---------------------------------------------------------------------- | --------------------------------------- | -------- | ------------------------------------------------------------------------ |
| `tools/oolite-ingest/convert/octree.ts`                                | Float32 octree port, depth, volume      | VERIFIED | Substantive and faithful to `OOMeshToOctreeConverter.m` and `Octree.m`   |
| `tools/oolite-ingest/convert/ship-mass.ts`                             | Hull plus subentity mass                | VERIFIED | Imported by `generate.ts`; build-time only                               |
| `src/content/generated/ships-npc.json`                                 | Nine records with `mass`                | VERIFIED | Generated, drift-gated                                                   |
| `src/content/generated/ships-client.json`                              | Coriolis, Cobra, buoy masses            | VERIFIED | Three entries, masses match ledger                                       |
| `src/content/schemas/ship-npc.ts`, `ship.ts`                           | Required NPC mass, optional client mass | VERIFIED | Strict schema                                                            |
| `src/sim/hyperspace/countdown.ts`                                      | `CORIOLIS_STATION_MASS` computed value  | VERIFIED | 515_483_904, pinned to the compiled record by a test                     |
| `tests/golden/content/ships-npc.json`                                  | Hand-written mass golden                | VERIFIED | Five worked-example masses                                               |
| FIDELITY.md ledger and rows E-27 to E-30, PROJECT.md Key Decision rows | Ledger and decisions                    | VERIFIED | Both Key Decision rows ("Coriolis blockage mass:", "Navigation buoy mass:") present |

### Key Link Verification

| From                          | To                                           | Via                                       | Status | Details                                                                              |
| ----------------------------- | -------------------------------------------- | ----------------------------------------- | ------ | ------------------------------------------------------------------------------------ |
| `generate.ts`                 | `computeShipMasses`                          | one call feeds NPC and client emitters    | WIRED  | Missing key fails the build                                                          |
| `ships-client.json` mass      | `CORIOLIS_STATION_MASS`                      | `hyperspace-blockage.test.ts` pin         | WIRED  | `src/sim` keeps a literal because it may not import content                         |
| Mesh or octree rule           | `assets:check`                               | regeneration drift                        | WIRED  | `assets:check` passes with no differences                                            |

### Data-Flow Trace (Level 4)

| Artifact                | Data Variable | Source                        | Produces Real Data | Status  |
| ----------------------- | ------------- | ----------------------------- | ------------------ | ------- |
| `ships-npc.json` `mass` | `mass`        | octree volume of parsed `.dat` | Yes                | FLOWING |
| `ships-client.json`     | `mass`        | same                          | Yes                | FLOWING |

### Behavioral Spot-Checks (Docker)

| Behavior                                                                                                                                                                       | Command                                                                  | Result                                    | Status |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ | ----------------------------------------- | ------ |
| octree, ship-mass, npc-ships, tests/content, hyperspace-blockage, fidelity and compliance tests                                                                               | `docker compose run --rm test npx vitest run <those files>`              | 10 files passed, 198 tests passed, 1 skipped | PASS   |
| Drift gate                                                                                                                                                                     | `docker compose run --rm assets npm run assets:check`                    | "no differences"                          | PASS   |
| Typecheck                                                                                                                                                                      | `docker compose run --rm typecheck`                                      | clean                                     | PASS   |
| Lint and format                                                                                                                                                                | `docker compose run --rm lint`                                           | clean                                     | PASS   |

The one skipped test is the FIDELITY excerpt verbatim check, which needs `OOLITE_SRC`.

### Probe Execution

Step 7c: no probes declared. SKIPPED.

### Requirements Coverage

| Requirement | Source Plan      | Description                                                    | Status    | Evidence                                                                 |
| ----------- | ---------------- | -------------------------------------------------------------- | --------- | ------------------------------------------------------------------------ |
| DATA-11     | 10-01 to 10-04   | Record fields plus octree mass for each ship, Coriolis compared | SATISFIED | Truths 1 to 3; Phase 9 supplied the other six fields, and the mass completes it |

No orphaned requirements for Phase 10.

### Anti-Patterns Found

None. No TBD, FIXME or XXX markers in the phase's modified source files; no stubs.

### Advisory and Warnings (non-blocking)

- **Criterion 2 rests on an owner override, not an observed Oolite value.** The Coriolis (515,483,904) and buoy composites are derived from source, not observed. The deferred real-Oolite check (log `ship.mass` from a scratch script) is the way to confirm them. If it disagrees, only the constant, its test pins and the ledger paragraph change.
- **`10-VALIDATION.md` frontmatter is stale:** `status: draft`, `nyquist_compliant: false`, `wave_0_complete: false`, approval pending. This is bookkeeping and does not affect the goal.
- **Browser specs were not re-run by this verifier.** The summary reports `budget.spec.ts` (3 passed) and `hyperspace.spec.ts` (3 passed) under the 7,179.7 m radius. Only comments changed in the e2e files in plan 10-04, and the owner gate policy excludes `verify` and `verify-full`.
- **Octree depth and subentity mass are not independently observable** here; the port matches the source at the lines cited, and the community tonne table gives an external cross-check for nine hull masses.

### Human Verification Required

None. The deferred real-Oolite mass check is an owner-accepted follow-up, not a gate for this phase.

### Gaps Summary

No gaps. All four roadmap criteria are met in the codebase, criterion 2 by recorded owner override.

---

_Verified: 2026-11-14_
_Verifier: Claude (gsd-verifier)_
