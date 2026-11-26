---
phase: 22-initial-population
verified: 2026-11-26T20:55:00Z
status: passed
score: 5/5 must-haves verified
covered_files:
  - ".planning/phases/22-initial-population/22-01-PLAN.md"
  - ".planning/phases/22-initial-population/22-01-SUMMARY.md"
  - ".planning/phases/22-initial-population/22-02-PLAN.md"
  - ".planning/phases/22-initial-population/22-02-SUMMARY.md"
  - ".planning/phases/22-initial-population/22-03-PLAN.md"
  - ".planning/phases/22-initial-population/22-03-SUMMARY.md"
  - ".planning/phases/22-initial-population/22-04-PLAN.md"
  - ".planning/phases/22-initial-population/22-04-SUMMARY.md"
  - ".planning/phases/22-initial-population/22-05-PLAN.md"
  - ".planning/phases/22-initial-population/22-05-SUMMARY.md"
  - ".planning/phases/22-initial-population/22-06-PLAN.md"
  - ".planning/phases/22-initial-population/22-06-SUMMARY.md"
  - ".planning/phases/22-initial-population/22-07-PLAN.md"
  - ".planning/phases/22-initial-population/22-07-SUMMARY.md"
  - ".planning/phases/22-initial-population/22-08-PLAN.md"
  - ".planning/phases/22-initial-population/22-08-SUMMARY.md"
  - ".planning/phases/22-initial-population/22-09-PLAN.md"
  - ".planning/phases/22-initial-population/22-09-SUMMARY.md"
  - ".planning/phases/22-initial-population/22-10-PLAN.md"
  - ".planning/phases/22-initial-population/22-10-SUMMARY.md"
  - ".planning/phases/22-initial-population/22-11-PLAN.md"
  - ".planning/phases/22-initial-population/22-11-SUMMARY.md"
  - ".planning/phases/22-initial-population/22-12-PLAN.md"
  - ".planning/phases/22-initial-population/22-12-SUMMARY.md"
  - ".planning/phases/22-initial-population/22-13-PLAN.md"
  - ".planning/phases/22-initial-population/22-13-SUMMARY.md"
  - ".planning/phases/22-initial-population/22-14-PLAN.md"
  - ".planning/phases/22-initial-population/22-14-SUMMARY.md"
  - ".planning/phases/22-initial-population/22-15-PLAN.md"
  - ".planning/phases/22-initial-population/22-15-SUMMARY.md"
  - ".planning/phases/22-initial-population/22-16-PLAN.md"
  - ".planning/phases/22-initial-population/22-16-SUMMARY.md"
  - "docs/PERFORMANCE.md"
  - "src/app/session/start-session.ts"
  - "src/app/session/traffic.ts"
  - "src/sim/world/limits.ts"
  - "src/sim/world/neighbourhood.ts"
  - "src/sim/world/placement.ts"
  - "src/sim/world/population/escorts.ts"
  - "src/sim/world/population/groups.ts"
  - "src/sim/world/population/kit.ts"
  - "src/sim/world/population/pirates.ts"
  - "src/sim/world/population/plan.ts"
  - "src/sim/world/population/police.ts"
  - "src/sim/world/population/spawn.ts"
  - "src/sim/world/population/streams.ts"
  - "src/sim/world/population/table.ts"
  - "src/sim/world/population/traders.ts"
  - "tests/e2e/population-anarchy.spec.ts"
  - "tests/golden/world/population-census.json"
covered_digest: "v4:sha256:2673420401cb5bbb4a4538f695ec419bb0e577c1af2fed988dd30415048910db"
behavior_unverified: 0
overrides_applied: 0
warnings:
  - id: WR-01
    summary: "buildNeighbourhood is not total for extreme integer chart coordinates (open code-review finding, shipped content unaffected)"
  - id: WR-02
    summary: "The forked per-entry/per-group/per-site population RNG streams (assumption A8) have a PROJECT.md Key Decisions row but no FIDELITY.md row"
---

# Phase 22: Initial Population Verification Report

**Phase Goal:** Each system the player arrives in with traffic on is populated as Oolite's populator populates it: traders, pirates (independents and packs), police and light bounty hunters at the rates its government, economy, tech level and neighbours give, as whole groups at Oolite's locations, drawn within the draw-call budget; the ships are still inert.
**Verified:** 2026-11-26
**Status:** passed (with two open code-review warnings, neither a goal failure)
**Re-verification:** No, initial verification

SUMMARY claims were not taken as evidence. I read the source, the oracle fixtures, the census golden and the browser spec, and re-ran the relevant targeted Vitest files in the `test` container (details below). The remote phase-gate runs (`verify-full` at 2d7dee83: 322 unit files and 10,453 tests, 168 Chromium specs and 2 seam specs, all green; the frozen 20-seed acceptance run 21/21) were supplied by the orchestrator. After 2d7dee83 only `tools/oolite-reference/**` and `.planning/**` changed (confirmed with `git diff 2d7dee83 --stat -- src tests tools`), so those runs still cover the shipped code.

## Goal Achievement

### Observable Truths (ROADMAP success criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | For every recorded system, the ported planner fed the recorded draws produces exactly the groups Oolite's own script produced (kinds, counts, records, leaders and followers, bounties, cargo kinds, weapons, skill, fuel injection); the cuts are absent; opportunists keep their data effects | VERIFIED | The oracle is 35 systems x 2 seeds (72 files, 1.1 MB) under `tests/oracles/population/fixtures/`, recorded from `oolite-populator.js` in the dev-only vm harness. It covers governments 0 to 7, economies 0 to 7 and tech levels 0 to 14. `groups.oracle.test.ts`, `traders.oracle.test.ts`, `plan.oracle.test.ts` and `population.self.test.ts` (1801 tests in the first targeted run) pass. They feed the recorded facts and draws to `planSystemGroups` and compare each ship projection and the per-tag draw counts. `POPULATOR_CUTS` and the FIDELITY rows (lines 231-243) record the cuts and the opportunist data-effect retention. `neighbourhood.test.ts` shows `systemsInRange` and `bottleneck` equal the recorded table for all 2,048 systems. |
| 2 | Arrival with traffic on places the planned ships at Oolite's locations (witchpoint, lanes, station aegis; no planet location) from the world seed through forked streams; the same arrival builds the same world; a group spawns whole or not at all under the 256 cap; no NPC carries a missile | VERIFIED | `placement.ts` adds `WITCHPOINT` to `LANE_*` and `STATION_AEGIS`; `table.ts:86` records "no planet location is in scope". `spawnPlannedGroups` (`spawn.ts:~415-489`) computes `fits`, builds the group, runs a scratch-world `trialSpawns`, and spawns the group whole or skips it. It checks the group-record bound and the entity limit and takes every draw from `populationDraws(worldSeed, ordinal, groupIndex)`. `spawn.test.ts`, `placement.test.ts`, `debris-reserve.test.ts` (reserve 104, limit 152) and `npc-missiles-tripwire.test.ts` pass. `PopulationRecord` has no missile member. |
| 3 | The initial population size of all 2,048 systems is computed and recorded (mean, peak, anarchy tail) and the largest world stays under the cap with room for debris | VERIFIED | `tests/golden/world/population-census.json`: 8 galaxies x 2,048 systems x 20 epochs = 40,960 worlds, mean 45.31, median 44, p95 78, p99 94, peak 134 ships (g0-s166, epoch 2), anarchy tail listed, `skippedGroups` 0, `fallbacks` 0, headroom 18 under the 152 limit. `census.test.ts` recomputes it through the production path and passes all eight galaxies at epochs 1 to 4. |
| 4 | The frozen 20-seed run, `INERT_POPULATION` and the inert Lave goldens are untouched; browser specs stay traffic-off unless they opt in; a populated traffic-on world hashes equal at 30, 60 and 144 Hz | VERIFIED | `git diff 7da2d9e4 HEAD` shows `src/sim/world/populate.ts`, `inert-lave-epochs-1-20.json`, `inert-records-nine.json`, `inert-lave-epoch1.json` and `tests/acceptance/**` unchanged since Phase 21. `inert-isolation.test.ts` passes (39 tests). `cadence.test.ts` passes, with a non-vacuity check that the populated entities are in the hash. `createSystemPopulate` returns early when traffic is off (no draws, no id burned). Remote: 20-seed run 21/21 and `verify-full` green. |
| 5 | The largest anarchy population with a fight and its debris draws within the 50-call budget in a browser spec (QUAL-09) | VERIFIED | `tests/e2e/population-anarchy.spec.ts` boots the census's largest galaxy-0 anarchy (Qudira g0-s116, 96 ships, 22 hull keys) through save, Continue and launch, with no spawn hook, and reads settled counters through `withinBudget`. Measured: 32 calls and 132,468 triangles before a kill, 35 and 132,976 after (explosion, pods and debris live). The budgets stay at 50 and 250,000. The census bounds every one of the 40,960 worlds analytically (10 scene + keys + 10 fight layers): peak 45 calls and 162,014 triangles. The remote `verify-full` ran the spec green. |

**Score:** 5/5 roadmap truths verified (0 present, behavior-unverified).

The plan-level must-haves I sampled also hold:
- Totality and fast-check properties: `plan.oracle`, `groups.oracle` and `neighbourhood` totality properties pass.
- The pod-kind runtime check (`cargo-kind.test.ts`) and its guard pass.
- Groups are pruned when empty (`groups-prune.test.ts` passes).
- The `pop` RNG purpose has a literal vector in `tests/sim/rng.test.ts`.
- The inert path is isolated (`INERT_RECORD_KEYS`).

### Required Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `src/sim/world/population/{table,plan,streams,kit,escorts,traders,pirates,police,groups,spawn}.ts` | VERIFIED | Substantive (4,411 lines with neighbourhood and traffic), exercised by the oracle replays, wired through `createSystemPopulate` to `populateSystemWorld` |
| `src/sim/world/neighbourhood.ts` | VERIFIED | Equal to the recorded 2,048-system table |
| `src/sim/world/placement.ts` | VERIFIED | `WITCHPOINT` added; the inert-path codes unchanged |
| `src/app/session/traffic.ts` `createSystemPopulate` | VERIFIED | Reads the content, layout, system and galaxy at call time; no-ops with traffic off |
| `src/app/session/start-session.ts` | VERIFIED | `createWorldLifecycle({ populate: createSystemPopulate(...) })` at line ~522; `createInertPopulate` has no `src` caller (tests and the frozen Node path only) |
| `tests/oracles/population/**` (fixtures, schema, codec, self-test) | VERIFIED | 72 fixture files, 1.1 MB, under the 1,000,000-byte-class acceptance rule recorded in 22-02 |
| `tests/golden/world/population-census.json` | VERIFIED | Matches the production-path recompute |
| `tests/e2e/population-anarchy.spec.ts`, `docs/PERFORMANCE.md` section | VERIFIED | The spec and the measurement table exist and agree with the SUMMARY |
| `tools/ai-harness/populator-{host,record}.ts` | VERIFIED | Dev-only; harness-isolation guard in place (T-22-01, T-22-02 closed in 22-SECURITY.md) |
| `tools/oolite-reference/{README.md,steps/census-*.steps}` | VERIFIED | The boxed spike (D-07, QUAL-13 groundwork) records a "yes" answer with a result table; not a blocker by design |

### Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| `start-session.ts` | `createSystemPopulate` | `createWorldLifecycle({ populate })` | WIRED |
| `createSystemPopulate` | `buildNeighbourhood`, `systemFactsFrom`, `populateSystemWorld` | direct calls | WIRED |
| `populateSystemWorld` | `planSystemGroups` then `spawnPlannedGroups` | forked `populationDraws` and `countDrawSource` | WIRED |
| Node twin (`tests/helpers/tick-script.ts`, `traffic-fixture.ts`) | the same populator | re-pinned in 22-13 and 22-14, Node equal to the browser | WIRED (remote `verify-full` green) |

### Data-Flow Trace (Level 4)

| Artifact | Data | Source | Real data | Status |
|----------|------|--------|-----------|--------|
| spawned NPCs | catalogue records, cargo, bounty, fuel, weapons | compiled `ships-npc.json` via `loaded.populationRecords`, planner output | Yes, census `fallbacks` 0 and the pod-kind check | FLOWING |
| browser draw counts | `probe.calls`, `probe.triangles` | `renderer.info` after rendered frames, the real populator world | Yes, 96 entities equal the golden | FLOWING |

### Behavioral Spot-Checks (targeted Vitest in the `test` container)

| Check | Result |
|-------|--------|
| `plan.oracle`, `traders.oracle`, `groups.oracle`, `neighbourhood`, `oracles/population`, `inert-isolation`, `cadence`, `npc-missiles-tripwire` | 8 files, 1801 tests passed |
| `tests/sim/world/population/*`, `placement`, `pod-kind-fallback`, `traffic`, `world-lifecycle`, `tick-parity`, `groups-prune`, `fidelity` contract | 17 files, 652 passed, 2 skipped (the skips are the `OOLITE_SRC` verbatim cases), 0 failed |
| Full suite, `verify-full`, 20-seed run | Not re-run locally by instruction; orchestrator evidence at 2d7dee83: all green, 21/21 |

### Probe Execution

No `scripts/*/tests/probe-*.sh` probes are declared for this phase. Skipped.

### Requirements Coverage

| Requirement | Source plans | Description | Status | Evidence |
|-------------|--------------|-------------|--------|----------|
| WORLD-08 | 22-01 to 22-14, 22-16 | Systems populated with traders, pirates, police and light hunters at Oolite's rates, matching recorded oracle fixtures | SATISFIED | Criteria 1 to 4; REQUIREMENTS.md line 18 `[x]`, traceability row "Complete" |
| QUAL-09 | 22-12, 22-15 | Full anarchy population with combat within the draw-call budget; spike before the populator ships; any raise is an owner decision | SATISFIED | Criterion 5; spike taken in Phase 21 (plan 21-19), browser proof here; budget unchanged at 50; REQUIREMENTS.md line 21 `[x]`, traceability "Complete" |

Cross-reference: the PLAN frontmatter `requirements:` fields across the 16 plans contain only WORLD-08 and QUAL-09. Both exist in REQUIREMENTS.md and map to Phase 22. No requirement mapped to Phase 22 is orphaned. WORLD-08b (scavengers, shuttles, medium and heavy hunters, assassins) is deferred by REQUIREMENTS.md and recorded in `POPULATOR_CUTS` and FIDELITY. QUAL-13 groundwork (22-16) is staged and completes in Phase 26.

### Anti-Patterns Found

No `TBD`, `FIXME`, `XXX`, `TODO`, `HACK` or `PLACEHOLDER` marker in the population modules, `neighbourhood.ts`, `traffic.ts`, the new tests or the new spec. Populated ships carry `ai: null` and `speed: 0` (`spawn.ts` init), as the goal's "still inert" requires.

### Code Review Findings (22-REVIEW.md: 0 critical, 2 warnings, 5 info; all disposition "open")

I checked the two warnings against the code. Neither fails a must-have truth.

| ID | Assessment | Severity here |
|----|------------|---------------|
| WR-01 | Confirmed as a robustness gap. `isChartCoordinate` accepts any integer-valued double, and `chartDistance` can throw a `RangeError` on huge magnitudes. The content schema (`chartX: z.number().int()`) has no bounds. The shipped chart data is byte-ranged, so it is unreachable with real content. The T-22-04 claim "never throws" is true for valid content but not for adversarial integers. Recommended fix: clamp the coordinate to 0..255 in `isChartCoordinate` and in the schema, and add a property case. | WARNING |
| WR-02 | Confirmed. FIDELITY.md rows 231-243 do not cover the forked per-entry, per-group and per-site streams (assumption A8). The divergence is recorded in PROJECT.md Key Decisions (not silent) and in the `streams.ts` header, but AGENTS.md's fidelity rule asks for a FIDELITY.md row. Recommended fix: add one row. | WARNING |
| IN-01 to IN-05 | Stale comments, duplicated helpers, a latent galaxy-mismatch trap, impossible-state guards and uncalled branches. None changes behaviour. | Info |

## Human Verification Required

None. Every success criterion has automated evidence: Vitest oracle replays, golden and census tests, and a Playwright spec run on the remote test machine. The 22-VALIDATION.md "manual-only" items (the real-Oolite census spike and the 20-seed run) were performed and recorded.

## Gaps Summary

No gaps block the phase goal. Populated, inert, whole-group arrivals match Oolite's own script on the recorded sample, the census proves the cap and budget bounds for all 40,960 sampled worlds, the frozen path is byte-identical, and the browser proof sits at 35 of 50 calls in the worst case measured.

Before phase close (not blocking):
1. WR-02: add the `FIDELITY.md` row for the forked population streams.
2. WR-01: bound chart coordinates (`neighbourhood.ts` and the system schema) and add the property case.
3. The remaining open review items (IN-01 to IN-05) are hygiene, and could be triaged to `fixed`, `skipped` or `deferred` in 22-REVIEW-DISPOSITION.md.

---

_Verified: 2026-11-26T20:55:00Z_
_Verifier: Claude (gsd-verifier)_
