---
phase: 18-stations-buoys-and-collisions
plan: 14
subsystem: sim-world
tags: [world-state, hash, snapshot, sanitizer, buoys, pristine-omit]

requires:
  - phase: 18-stations-buoys-and-collisions
    provides: "18-01 (shares PROJECT.md; no data edge)"
provides:
  - "BuoyState / BuoyStates (offset, velocity, subentityEnergy, subentityTakingDamage) and World.buoys"
  - "createBuoyStates, isPristineBuoyStates"
  - "serializeBuoyStates and the pristine-omit buoys: hash line"
  - "the optional WorldSnapshot.buoys key with bounds (still version 4)"
  - "sanitizeBuoyStates, run in repairWorldFields and inside hashWorld"
  - "BUOY_SUBENTITY_MAX_ENERGY = 200, MAX_BUOY_OFFSET = 1e6"
affects: [18-05, 18-15, 18-17, 18-07, 18-08, 18-18, 18-19, 18-21]

actuals:
  tokens: 20500
  tasks: 2
  commits: 4
plan_head_before: 4e62f600b6c1ea378894895b0742ab87d74b1115
plan_head_after: eb946ce9195537b19cade328a4b918a9ea134462

tech-stack:
  added: []
  patterns:
    - "Pristine-omit world field, as staticHealth: no hash line and no snapshot key while pristine"
    - "Repair inside hashWorld as well as before a step, so a hash taken without a step never meets a non-finite value"

key-files:
  created: []
  modified:
    - src/sim/world/entity.ts
    - src/sim/world/world.ts
    - src/sim/world/limits.ts
    - src/sim/world/serialize.ts
    - src/sim/world/snapshot.ts
    - src/sim/world/sanitize.ts
    - src/sim/world/step.ts
    - tests/sim/world/hash.test.ts
    - tests/sim/world/snapshot-codec.test.ts
    - tests/sim/world/sanitize.test.ts
    - .planning/PROJECT.md

key-decisions:
  - "Buoy state is the owner-approved amendment PD-01/PD-02 of the frozen version-4 field set: an optional World.buoys, pristine-omit in the hash and the snapshot, no WORLD_SNAPSHOT_VERSION bump, saves unchanged; recorded in the 'World snapshot version 4' Key Decisions row in the same commit as BuoyState"
  - "Hash line format: buoys:<witchpoint>|<navBuoy>, each 'offset x,y,z;velocity x,y,z;sub e;taking 0|1' through canon, printed after staticHealth: and before the combat line"
  - "sanitizeBuoyStates resets a vector with any non-finite component to zero (the buoy rests at its layout position), clamps out-of-range components, heals a non-finite subentity energy to 200 (same direction as sanitizeStaticHealth), clears the routing flag when not a boolean or when the subentity is detached; uncounted"
  - "The parser refuses subentityTakingDamage true with subentityEnergy 0 as reason 'range' (Oolite clears the flag when the subentity dies, ShipEntity.m:8187-8188)"

patterns-established:
  - "An optional pristine-omit snapshot key: written with a conditional spread, parsed only when present, absent restores the constructor's value"

requirements-completed: [CBT-17, CBT-18]

coverage:
  - id: D1
    description: "Per-world buoy state (offset, drift, subentity energy, sticky routing flag); a new world starts pristine"
    requirement: CBT-17
    verification:
      - kind: unit
        ref: "tests/sim/world/hash.test.ts#a new world holds two pristine buoys and hashes as the flight"
        status: pass
    human_judgment: false
  - id: D2
    description: "Pristine-omit buoys: hash line after staticHealth:, before combat; pinned world and flight hashes and goldens unchanged"
    requirement: CBT-18
    verification:
      - kind: unit
        ref: "tests/sim/world/hash.test.ts#the buoys line (PD-01, PD-02)"
        status: pass
      - kind: unit
        ref: "tests/sim/world/flight-hash-pins.test.ts"
        status: pass
      - kind: other
        ref: "git diff --quiet 76229f5 -- tests/golden/world"
        status: pass
    human_judgment: false
  - id: D3
    description: "Optional snapshot key buoys (still version 4): round trip, absent key restores pristine, bounds rejected with the path named"
    requirement: CBT-18
    verification:
      - kind: unit
        ref: "tests/sim/world/snapshot-codec.test.ts#the buoy states in the snapshot (PD-01, PD-02)"
        status: pass
      - kind: unit
        ref: "tests/sim/world/snapshot-codec.test.ts#buoy bounds at the snapshot boundary (T-18-39, T-18-51)"
        status: pass
    human_judgment: false
  - id: D4
    description: "sanitizeBuoyStates repairs in place, before a step and inside hashWorld"
    requirement: CBT-18
    verification:
      - kind: unit
        ref: "tests/sim/world/sanitize.test.ts#sanitizeBuoyStates (PD-01, PD-02, T-18-39, T-18-51)"
        status: pass
      - kind: unit
        ref: "tests/sim/world/hash.test.ts#repairs a NaN buoy state inside hashWorld, without a step (review L792)"
        status: pass
      - kind: integration
        ref: "remote: wegolite-remote-run.sh run --rm test npm run test:acceptance (21/21, numbers unchanged)"
        status: pass
    human_judgment: false

duration: 17min
completed: 2026-11-19
status: complete
---

# Phase 18 Plan 14: Per-World Buoy State Summary

**Each world now holds both buoys' offset from the layout position, drift velocity, subentity energy (200) and sticky subentity routing flag. A pristine world adds no hash line and no snapshot key. The snapshot stays at version 4, and the state is bounded at the snapshot boundary and repaired before every step and every hash.**

## Performance

- **Duration:** about 17 min
- **Started:** 2026-11-19T20:34:52Z
- **Completed:** 2026-11-19T20:52Z
- **Tasks:** 2 (both TDD: RED then GREEN)
- **Files modified:** 11

## Accomplishments

- `BuoyState` / `BuoyStates` in `entity.ts`, `World.buoys`, `createBuoyStates()`, `isPristineBuoyStates()`. `createWorld` starts both buoys pristine, so every arrival, launch and Load restores them (D-04).
- **Hash line format:** after the `staticHealth:` line and before the combat line, printed only when not pristine:
  `buoys:offset x,y,z;velocity x,y,z;sub e;taking 0|1|offset x,y,z;velocity x,y,z;sub e;taking 0|1`. The witchpoint comes first, then the nav buoy, separated by `|`, with every number through `canon`. Example (nav buoy moved 3 m): `buoys:offset 0.000000,0.000000,0.000000;velocity 0.000000,0.000000,0.000000;sub 200.000000;taking 0|offset 3.000000,0.000000,0.000000;velocity 0.000000,0.000000,0.000000;sub 200.000000;taking 0`.
- **Snapshot:** an optional `buoys` key, written only when not pristine (`requireFinite`, `noNegativeZero`). It is in the parser's allow-list, and an absent key restores pristine buoys. `WORLD_SNAPSHOT_VERSION` stays 4, and the version history comment records the amendment.
- **Bounds (all in `limits.ts`):**
  - offset component up to `MAX_BUOY_OFFSET` = 1e6 (reason `magnitude`)
  - velocity component up to `MAX_ENTITY_VELOCITY` = 1e4 (`magnitude`)
  - `subentityEnergy` in 0..`BUOY_SUBENTITY_MAX_ENERGY` = 200 (`range` below 0, `magnitude` above 200)
  - `subentityTakingDamage` must be a boolean (`type`), and true with energy 0 is refused (`range`)
  - a non-finite value is refused (`non-finite`); a missing buoy is refused (`not-object`); unknown keys are refused at every level (`unknown-key`)

  Each rejection names its path, for example `snapshot.buoys.navBuoy.offset.y`.
- **Repair:** `sanitizeBuoyStates` runs in `repairWorldFields` and inside `hashWorld`, right after `sanitizeStaticHealth`. It is uncounted and never throws, and it is idempotent; a property test also checks that the parser accepts its output.
- **Docs:** the `.planning/PROJECT.md` Key Decisions row "World snapshot version 4" now records the owner-approved amendment PD-01/PD-02. It landed in commit `7509656`, the same commit as `export interface BuoyState`.

## Task Commits

1. **Task 1 (tracer): buoy state through the hash, the snapshot and back**
   - `7509656` (test, RED): types, constructor, a stub serializer, the decision row
   - `4b77a9e` (feat, GREEN)
   - Tracer gate (auto mode): the task's verify was re-run on the committed GREEN state and passed (5 files, 434 tests; typecheck clean) before Task 2.
2. **Task 2: bounds and repair**
   - `33486e9` (test, RED): a stub `sanitizeBuoyStates`
   - `eb946ce` (feat, GREEN)

## TDD Gate Compliance

- **RED 1:** `docker compose run --rm test npx vitest run tests/sim/world/hash.test.ts -t "a moved nav buoy appends exactly one buoys: line" --reporter=tap-flat`, exit 1.
  - The target failed on `expected 'buoys:' to be 'buoys:offset 0.000000,…'`, because the stub serializer returned only the label.
  - Classifier result: `RED_EVIDENCE_OK / target_test_failed`.
  - Semantic check: the failure came from the planned assertion, not from a load fault.
- **RED 2:** `docker compose run --rm test npx vitest run tests/sim/world/sanitize.test.ts -t "heals a non-finite offset and velocity" --reporter=tap-flat`, exit 1.
  - The target failed on `expected false to be true`, because the stub repaired nothing.
  - Classifier result: `RED_EVIDENCE_OK / target_test_failed`.
  - Some buoy parser rows already passed at RED by design: Task 1's structural parse already refused non-finite values, wrong types, missing objects and unknown keys. The bound rows failed as planned.
- **GREEN:** each feat commit makes the whole world suite pass.

## Verification

- `docker compose run --rm test npx vitest run tests/sim/world`: 19 files, 1283 passed, 1 skipped.
- `docker compose run --rm test` (full suite with coverage): exit 0.
- `docker compose run --rm lint`: clean (eslint, and prettier "All matched files use Prettier code style!").
- `docker compose run --rm typecheck`: clean.
- **Remote acceptance (QUAL-11, AGENTS.md):** `/home/opencode/.claude/scripts/wegolite-remote-run.sh run --rm test npm run test:acceptance` gave `exit=0 elapsed=80s snapshot=eb946ce`. All 21 of 21 passed (20 epochs plus the run-minimums case) in 77.28 s.
  - Every failure counter is 0 on all 20 seeds: stuck, frozen, frustration, stationSphere, hull-crossing episodes and unexcused crossings, repairs, aiFaulted, aiDropped, hashFailures.
  - Run totals are identical to the last recorded baseline (quick 261119-i9g):
    - station / intercept / flee arrivals: 40 / 40 / 40
    - AVOID_COLLISION entries: 23
    - attack ticks near the player: 61,662
    - stuck windows: 175
    - frozen windows: 293
  - Minimum station clearance is 2,713.00 m (epochs 3, 13, 20) and minimum hull clearance is 41.41 m (epoch 10). Both are unchanged.
  - This is a frozen-worlds check only: the harness runs with no statics, collisions or buoy mass (review L660).
- **Acceptance criteria:**
  - `export interface BuoyState` (see deviation 1)
  - `createBuoyStates` and `isPristineBuoyStates` exports: 2
  - `WORLD_SNAPSHOT_VERSION = 4`: 1
  - `git diff --quiet 76229f5 -- tests/golden/world`: exit 0
  - the PROJECT.md row containing `PD-01`: 1, in the same commit as BuoyState
  - `subentityTakingDamage` in `entity.ts`: 2
  - `export function sanitizeBuoyStates`: 1
  - non-comment `sanitizeBuoyStates` lines: serialize.ts 2, step.ts 2
  - `git diff --quiet 76229f5 -- src/persistence`: exit 0

## Decisions Made

- **Vector repair:** if any component of an offset or velocity is non-finite, the sanitizer resets the whole vector to (0,0,0) rather than only that component, so a corrupt buoy comes to rest at its layout position. A finite component out of range is clamped to the bound, keeping its sign.
- **Parser composition:** the offset is parsed with `symmetricNumber` against `MAX_BUOY_OFFSET`. The velocity reuses the entity `parseVelocity` (`MAX_ENTITY_VELOCITY`). The energy uses `limitedNumber`, and the flag uses `flag`.
- **Detached-subentity flag:** the parser refuses `subentityTakingDamage` true with energy 0 as reason `range`, on the flag's own path.
- **Parsed snapshot shape:** `parseWorldSnapshot` returns the `buoys` key only when the input had one, so the parsed snapshot keeps the input's shape and `restoreWorld` falls back to `createBuoyStates()`.

## Deviations from Plan

**1. [Acceptance criterion wording] `rg -c "export interface BuoyState" src/sim/world/entity.ts` returns 2, not 1**
- **Found during:** Task 1, acceptance gate.
- **Issue:** the pattern is a substring match, so it also counts `export interface BuoyStates`. The plan's own artifacts and `<interfaces>` require that second interface.
- **Resolution:** no code change. The intended check passes with whole-word matching: `rg -cw "export interface BuoyState"` returns 1.
- **Commit:** `7509656`.

**Total deviations:** 1 (a criterion pattern quirk; no code impact). **Impact:** none.

## Issues Encountered

None.

## Next Phase Readiness

- Every buoy consumer can now read `World.buoys`: hits (18-05, 18-15), drift (18-17), blockage (18-07), compass, scanner and render (18-08), collisions (18-18) and blast (18-19). Nothing writes it yet, so no world changes.
- Plan 18-18 must clamp offsets at the same `MAX_BUOY_OFFSET` (review L794).

## Self-Check: PASSED

- All 11 modified files exist.
- Commits `7509656`, `4b77a9e`, `33486e9` and `eb946ce` are ancestors of HEAD.
- Measured commit count is 4 (`4e62f60..eb946ce`).

---
*Phase: 18-stations-buoys-and-collisions*
*Completed: 2026-11-19*
