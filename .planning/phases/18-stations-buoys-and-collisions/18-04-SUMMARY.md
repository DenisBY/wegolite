---
phase: 18-stations-buoys-and-collisions
plan: 04
subsystem: combat
tags: [laser-hit, subentity, octree, station, static-targets, oracle, CBT-17]

requires:
  - phase: 18-02
    provides: "dock-mouth.json: 20 independent beam fixtures with up-front tolerances and depths"
  - phase: 18-13
    provides: "HullData.subentities, the merged hull table, fullHullTable()"
  - phase: 18-20
    provides: "real-Oolite confirmation of the edge: false dock-mouth fixtures (no MISMATCH)"
provides:
  - "src/sim/world/statics.ts: StaticTarget, STATIC_TARGETS (the station row), staticTargetById, stationPose"
  - "HitPart and firstShipHit(...).part: Oolite's subentity rule (ShipEntity.m:1323-1357)"
  - "the main station as a laser candidate (id 3, first in ascending id) that only absorbs hits"
  - "tests/sim/combat/dock-mouth.oracle.test.ts: the port against every 18-02 fixture"
affects: [18-05, 18-06, 18-09, 18-11, 18-15, 18-22, 18-12]

actuals:
  tokens: 22963
  tasks: 3
  commits: 6
plan_head_before: 3d796f069c73a1cf6bf1f56da4e9487fab9052a0
plan_head_after: e08c4c783542695a9be99442dec24a8c459bf9b1

tech-stack:
  added: []
  patterns:
    - "Static laser targets come from one ascending row table (statics.ts) and join the candidates only when the hull table holds their key"
    - "A static record in the ledger posts shipHit and writes nothing (absorb), checked before the store lookup"

key-files:
  created:
    - src/sim/world/statics.ts
    - tests/sim/world/statics.test.ts
    - tests/sim/combat/dock-mouth.oracle.test.ts
  modified:
    - src/sim/combat/hit.ts
    - src/sim/combat/step.ts
    - src/sim/combat/ledger.ts
    - tests/sim/combat/hit.test.ts
    - tests/sim/combat/step.test.ts
    - tests/sim/combat/ledger.test.ts
    - tests/helpers/tick-script.ts
    - .planning/PROJECT.md
    - FIDELITY.md
    - CHANGELOG.md

key-decisions:
  - "Statics are laser targets through Oolite's subentity rule (Phase 18, CBT-17): the station joins the candidates first with its hull and three subentity octrees and only absorbs hits (A6); supersedes the laser half of 'Statics are neither laser nor ident targets'"
  - "FIDELITY E-48 now quotes the subentity loop ShipEntity.m:1337-1354 (the full 1323-1357 exceeds the 20-line excerpt cap); the two-stage excerpt Universe.m:5615-5628 moved to the new row E-118"
  - "The Node tick replay builds the merged hull table (ten ships plus the statics), as the traffic-on session does"

patterns-established:
  - "Static candidate rows: ascending id, gated on the hull key and a stepped world; the pose comes from the function docking and the renderer share"

requirements-completed: [CBT-17]

coverage:
  - id: D1
    description: "A shot at a ship behind the station ends on the station's back face; the station takes one shipHit with shield false and the ship takes nothing; with realHullTable the shot hits the ship as before"
    requirement: CBT-17
    verification:
      - kind: unit
        ref: "tests/sim/combat/step.test.ts#a laser stops at the station (tracer, CBT-17)"
        status: pass
    human_judgment: false
  - id: D2
    description: "The station only absorbs: 1,000 hits and a 1e12 hit change no hashed state and are never lethal; NaN, Infinity, 0 and negative amounts emit nothing"
    requirement: CBT-17
    verification:
      - kind: unit
        ref: "tests/sim/combat/step.test.ts#the station only absorbs (A6, StationEntity.m:1110-1160)"
        status: pass
    human_judgment: false
  - id: D3
    description: "An NPC shot that ends on the station counts as a hit for missedShots; every queued target is the player, a static target or a live store id; an unstepped tick has no station candidate"
    requirement: CBT-17
    verification:
      - kind: unit
        ref: "tests/sim/combat/step.test.ts#an NPC shot that ends on the station is a hit (ShipEntity.m:10396)"
        status: pass
      - kind: unit
        ref: "tests/sim/combat/step.test.ts#the hit-record target invariant (assumption delta, plan 18-04)"
        status: pass
    human_judgment: false
  - id: D4
    description: "The subentity rule (ShipEntity.m:1323-1357) with HitPart: nearer part wins, a tie keeps the hull, the offset rotates with the target, a non-finite subentity never throws"
    requirement: CBT-17
    verification:
      - kind: unit
        ref: "tests/sim/combat/hit.test.ts#firstShipHit: the subentity rule (ShipEntity.m:1323-1357)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Every one of the 20 dock-mouth fixtures of plan 18-02 passes against the port: same part, distance within the fixture tolerance; depths checked against the emitted octrees"
    requirement: CBT-17
    verification:
      - kind: unit
        ref: "tests/sim/combat/dock-mouth.oracle.test.ts"
        status: pass
    human_judgment: false
  - id: D6
    description: "Frozen worlds and the browser routes hold at the committed HEAD: remote acceptance 21/21 with unchanged totals, combat.spec, verify and the three tick-replay specs"
    verification:
      - kind: other
        ref: "remote: run --rm test npm run test:acceptance at e08c4c7 (exit=0)"
        status: pass
      - kind: e2e
        ref: "remote: e2e combat.spec.ts at e08c4c7 (exit=0)"
        status: pass
      - kind: other
        ref: "remote: run --rm verify at e08c4c7 (exit=0)"
        status: pass
      - kind: e2e
        ref: "remote: e2e tick-hook, traffic, npc-flight specs at e08c4c7 (exit=0)"
        status: pass
    human_judgment: false

duration: 28min
completed: 2026-11-19
status: complete
---

# Phase 18 Plan 04: The station as a laser target Summary

**A laser now stops at the Coriolis station through a port of Oolite's subentity hit rule (`ShipEntity.m:1323-1357`). The station only absorbs the hit. All 20 independent dock-mouth fixtures name the same part as Oolite, at a distance within tolerance.**

## Performance

- **Duration:** 28 min (2026-11-19T22:02:09Z to 22:30:27Z)
- **Tasks:** 3 (Task 1 tracer with TDD, Task 2 with TDD, Task 3 docs and remote checks)
- **Files:** 13 changed (3 created)

## Accomplishments

- `src/sim/world/statics.ts`: `StaticTarget`, `STATIC_TARGETS` (one row for the station: id 3, layout `station`, hull and ident key `coriolis-station`, health `station`), `staticTargetById` (a linear scan that handles any number) and `stationPose` (the station centre and `portQuaternion(layout, stationAngle)`).
- `resolveShotHits` puts the station first in the candidate list, in ascending id before the player (100) and the store ships. It does so only when the hull table holds `coriolis-station` and the world was stepped. A shot that ends on the station counts as a hit for the NPC `missedShots` counter. Both comments that said statics are "never candidates" were rewritten.
- `applyLedger` handles a static record on a stepped world: it posts `shipHit` with `shield: false` and writes nothing (A6). A station hit is therefore never lethal and changes no hashed state.
- `firstShipHit` ports the subentity loop. Each subentity's octree is tested with the model segment shifted by minus its authored position. The comparison is strict, so the hull keeps an exact tie. The winning `HitPart` is returned next to `id` and `distance`.
- `dock-mouth.oracle.test.ts` runs exactly the 20 fixtures of `dock-mouth.json`. Before it fires any ray, it checks each part's depth, root half-width and subentity position against the emitted octrees.

## Dock-mouth results (port against the 18-02 oracle)

Before any fixture ran, the depth the tolerance assumes was checked against the emitted octree for every mesh. Every depth matched: hull 6 / 500.5, faceplate 6 / 534.798, tris 6 / 500.5, dock 5 / 250.5, buoy 5 / 58.228, buoy subentity 5 / 24.348. There was no dispute.

| Fixture | Oracle winner | Port part | Oracle distance | Port distance | Error | Tolerance |
|---------|---------------|-----------|-----------------|---------------|-------|-----------|
| dock-slot-through-dock-back-wall | dock | subentity 2 (dock) | 2749.7439 | 2742.4213 | -7.32 | 29.215 |
| dock-slot-lower-left-dock-back-wall | dock | dock | 2749.7439 | 2742.4229 | -7.32 | 29.215 |
| dock-slot-edge-plus-x-dock | dock | dock | 2749.7439 | 2742.4288 | -7.32 | 29.215 |
| dock-slot-edge-minus-x-dock | dock | dock | 2749.7439 | 2742.4288 | -7.32 | 29.215 |
| dock-slot-edge-plus-y-dock | dock | dock | 2749.7439 | 2742.4234 | -7.32 | 29.215 |
| dock-slot-edge-minus-y-dock | dock | dock | 2749.7439 | 2742.4234 | -7.32 | 29.215 |
| dock-faceplate-edge-plus-x-beside-slot | faceplate | subentity 0 (faceplate) | 2478.7990 | 2473.5724 | -5.23 | 31.186 |
| dock-faceplate-edge-minus-x-beside-slot | faceplate | faceplate | 2478.7990 | 2473.5724 | -5.23 | 31.186 |
| dock-faceplate-edge-outer-diagonal | faceplate | faceplate | 2500.0000 | 2506.9862 | +6.99 | 31.186 |
| dock-faceplate-beside-slot-x | faceplate | faceplate | 2487.9803 | 2490.2891 | +2.31 | 31.198 |
| dock-faceplate-beside-slot-y | faceplate | faceplate | 2503.3400 | 2490.2739 | -13.07 | 31.186 |
| dock-tris-corner-oblique | tris | subentity 1 (tris) | 2599.9994 | 2569.9269 | -30.07 | 40.636 |
| dock-hull-alone-from-minus-x | hull | hull | 2500.0000 | 2507.3312 | +7.33 | 29.186 |
| dock-hull-alone-from-plus-y | hull | hull | 2500.0000 | 2507.3222 | +7.32 | 29.186 |
| dock-hull-back-face-before-dock | hull | hull | 2500.0000 | 2507.3318 | +7.33 | 29.215 |
| dock-near-miss-at-clearance | none | none | - | - | - | 0 |
| dock-far-miss | none | none | - | - | - | 0 |
| dock-buoy-hull-front-before-subentity | hull | hull | 2948.0326 | 2947.2316 | -0.80 | 7.787 |
| dock-buoy-hull-back-face | hull | hull | 2955.9680 | 2954.5100 | -1.46 | 6.791 |
| dock-buoy-hull-alone-from-minus-x | hull | hull | 2952.2532 | 2950.8705 | -1.38 | 7.362 |

All 20 fixtures pass and there are no disputes. The largest error relative to its tolerance is `dock-tris-corner-oblique`, at 30.07 of 40.64. The buoy targets are built by hand in the oracle test, because buoys become candidates only in plan 18-05.

## Twin values

`tick-parity`, `sim-driver` and `probe-publisher` passed unchanged after each task, and so did `flight-hash-pins`, `world-cadence` and `tick-flyers`. No value moved, so nothing was re-pinned.

## Remote runs (committed HEAD)

| Run | Snapshot | Exit | Elapsed |
|-----|----------|------|---------|
| `run --rm test npm run test:acceptance` | e08c4c7 | exit=0 | elapsed=78s |
| `run --rm e2e … playwright test tests/e2e/combat.spec.ts` | e08c4c7 | exit=0 | elapsed=15s (1 passed) |
| `run --rm verify` | e08c4c7 | exit=0 | elapsed=193s (252 files, 6,838 passed, 10 skipped; e2e smoke 27 passed) |
| `run --rm e2e … tick-hook.spec.ts traffic.spec.ts npc-flight.spec.ts` (extra) | e08c4c7 | exit=0 | elapsed=62s (9 passed) |

- The acceptance run passed 21 of 21. Every failure counter is 0 on all 20 seeds. The totals equal those of 18-17: arrivals 40 / 40 / 40, AVOID_COLLISION entries 23, attack ticks near the player 61,662, stuck windows 175, frozen windows 293. Minimum station clearance is 2,713.00 m (epochs 3, 13, 20) and minimum hull clearance is 41.41 m (epoch 10). This only shows that the frozen worlds still match: the harness runs `realHullTable()`, so it is no evidence for the new paths (review L660).
- The extra run covers the three specs that compare the browser with the Node tick replay, since `tests/helpers/tick-script.ts` changed.
- `tests/acceptance` and `tests/e2e` have no diff since `76229f5`.

## Task Commits

1. **Task 1 (tracer):** `f3da8bb` (test, RED, with the statics skeleton), `7ffe762` (feat, GREEN)
2. **Task 2:** `3b029f9` (test, RED, with the `HitPart` type only), `c3a5f78` (feat, GREEN)
3. **Citation fix:** `9a16345` (docs, the strict comparison is at `ShipEntity.m:1348`)
4. **Task 3:** `e08c4c7` (docs: PROJECT.md, FIDELITY.md, CHANGELOG.md, and the tick replay table)

## TDD Gate Compliance

- **Task 1 RED.** The target `step.test.ts > a laser stops at the station (tracer, CBT-17) > a shot at a ship behind the station ends on the station's back face; the ship takes nothing` failed with `expected 1991.63 to be less than or equal to 29.19`: the beam ran on to the Adder. The classifier returned RED_EVIDENCE_OK. Semantic check: the skeleton `statics.ts` compiled, the table was empty, and the target failed on the planned beam-length assertion. Eight other new cases failed on their own assertions.
- **Task 2 RED.** The target `hit.test.ts > firstShipHit: the subentity rule > a beam that misses the hull and meets the subentity hits the subentity` failed with `expected undefined to be 11`. The classifier returned RED_EVIDENCE_OK. Semantic check: the code at HEAD tests the hull octree only.
- **Tracer gate (auto mode).** After Task 1 GREEN, the Task 1 verify (4 files, 96 tests) and typecheck were rerun. Both were green, so Task 2 went ahead.
- **TAP capture.** The vitest TAP reporter writes multi-line `actual`/`expected` YAML that the classifier rejects as malformed. Each RED record was therefore captured with `-t` filtered to the target test only.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `tests/sim/combat/ledger.test.ts` pinned the old static skip**
- **Found during:** Task 1 GREEN.
- **Issue:** "skips a missing, dead, static or non-ship target" expected no event for a record on `MAIN_STATION_ID`. The file is not in the plan's file list, but it is in its verify list.
- **Fix:** The case now expects one `shipHit` on the station, with no write. The buoy records are still skipped until plan 18-05.
- **Commit:** `7ffe762`

**2. [Rule 3 - Blocking] The Node tick replay used the ten-hull table (orchestrator note from 18-13)**
- **Issue:** `committedHullTable()` in `tests/helpers/tick-script.ts` built the ten-hull table. Now that the station is a candidate, the browser and the replay could diverge.
- **Fix:** The replay now builds `hullTable(ships, StaticHullArtifactSchema.parse(...).hulls)`, the merged table the session builds. The twins and the three replay specs pass.
- **Commit:** `e08c4c7`

**3. [Rule 1 - Bug] Wrong Oolite line for the strict comparison**
- **Issue:** The plan cites `ShipEntity.m:1350`. At the pin `7437f22` the comparison is line 1348, and the `hitEntity` writes span 1332-1353.
- **Fix:** The code and test comments cite 1348.
- **Commit:** `9a16345`

**4. [Rule 3 - Blocking] FIDELITY excerpt cap**
- **Issue:** The FIDELITY contract caps an excerpt at 20 lines, and `ShipEntity.m:1323-1357` is 35 lines.
- **Fix:** E-48 quotes the subentity loop, 1337-1354. The open-items bullet cites the full 1323-1357. The two-stage excerpt `Universe.m:5615-5628` moved to a new row, E-118, so no quoted evidence was lost. The new row is a divergence until 18-05: the buoys are not candidates yet. With `OOLITE_SRC` set to a `git archive 7437f22` tree, every excerpt reproduces verbatim.
- **Commit:** `e08c4c7`

**5. [Rule 1 - Test literals] Existing hit literals gained `part`**
- **Issue:** `firstShipHit` now returns `part`, so the five `toEqual({ id, distance })` literals in `hit.test.ts` had to change. The plan's wording was "every existing hit test passes unchanged".
- **Fix:** Each literal gained `part: { kind: "hull" }`. Ids and distances are unchanged.
- **Commit:** `3b029f9`

**Total deviations:** 5 auto-fixed (3 blocking, 2 bug or literal). **Impact:** no scope change, no tolerance changed, no frozen threshold or detector touched.

## Issues Encountered

- A scratch distance listing (`/tmp/wego-1804/dist.ts`, mounted at `/scratch`) ran through `npx vite-node`. npx fetched `vite-node@6.0.0` into the throwaway container. Nothing in the repository or the image changed. The table above comes from that listing; the committed oracle test is the evidence.

## Known Stubs

- `src/sim/combat/step.ts`: in the static candidate loop, a row whose `layoutKey` is not `"station"` is skipped. `STATIC_TARGETS` holds only the station, so nothing is skipped today. Plan 18-05 appends the buoy rows and their pose (`staticPose`).

## Threat Model

- T-18-08: a NaN subentity position falls back to the hull's answer, or to null. It never throws (hand case).
- T-18-09: `staticTargetById` is checked before the store lookup, and the station branch writes nothing. After 1,000 hits plus one 1e12 hit, the hash equals a world that was never hit.
- T-18-10: statics are candidates only when their hull key is in the table. The acceptance run (on `realHullTable()`) is unchanged at 21 of 21.

## Verification

- Targeted: the Task 1 and Task 2 verify sets pass. `tests/sim/combat` with `fire-route` and `hot-weapon` gave 24 files and 501 tests.
- `docker compose run --rm test`: 252 files, 6,838 passed, 10 skipped, exit 0, no coverage-threshold error.
- `lint`: clean. `typecheck`: clean.
- `tests/contract/fidelity.test.ts` with `OOLITE_SRC` set to a `7437f22` tree: 9 passed.
- Acceptance greps: `export const STATIC_TARGETS` 1. Non-comment `STATIC_TARGETS` in `step.ts`: 2. Non-comment `staticTargetById` in `ledger.ts`: 2. "never candidates in this milestone": absent. `killer|shipHit` in `statics.ts`: absent. `export type HitPart` 1. "Not ported|ignores it until plan 18-04": absent. `1323-1357` in `hit.ts`: 1. `dock-mouth.json` in the oracle test: 3. The PROJECT.md row: 1. The CHANGELOG line: 1. `StationEntity.m:1128-1141` in FIDELITY.md: 3. `git diff --quiet 76229f5 -- tests/acceptance tests/e2e`: exit 0.

## Next Phase Readiness

- Plan 18-05 appends the buoy rows to `STATIC_TARGETS`, replaces the station-only pose branch in `resolveShotHits` with `staticPose`, and routes buoy records in `applyLedger`.
- Plan 18-06 completes the PROJECT.md row with the ident half, and E-52.
- Plan 18-15 maps a buoy `HitPart` `{ kind: "subentity", index: 0 }` to the subentity's fixed id.

## Self-Check: PASSED

- Files exist: src/sim/world/statics.ts, tests/sim/world/statics.test.ts, tests/sim/combat/dock-mouth.oracle.test.ts.
- Commits on HEAD: f3da8bb, 7ffe762, 3b029f9, c3a5f78, 9a16345, e08c4c7.
