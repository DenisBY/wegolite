---
phase: 11-minimal-save-schema-v3
plan: 01
subsystem: persistence
tags: [world-lifecycle, save-schema, leg-anchor, seed-derivation, golden]

requires:
  - phase: 08-session-split-and-world-core
    provides: WorldLifecycle, per-world id counter, mix32 world-seed derivation
provides:
  - WorldLifecycle.anchorNextEntityId, the leg-anchor counter (D-01, D-05)
  - The D-07 world-seed cross-check vector pinned in tests/persistence before any v3 write
  - A canonical v2 in-flight golden captured from the real v2 writer (D-03 migration input)
affects: [11-02, 11-03, 11-04]

actuals:
  tokens: 5057
  tasks: 2
  commits: 2
plan_head_before: 597bd5d854f721752842d7ebce259182718805d2
plan_head_after: 9ff46b7ff9b1413740d6db4bc2f8de1966ad3963

tech-stack:
  added: []
  patterns:
    - "The leg-anchor counter is captured once after populate in begin and resume, never read mid-leg"

key-files:
  created:
    - tests/persistence/save-v3.test.ts
    - tests/golden/save/v2-phase10-inflight.json
  modified:
    - src/app/session/world-lifecycle.ts
    - tests/app/session/world-lifecycle.test.ts
    - tests/app/session-order.test.ts
    - tests/persistence/save-golden.test.ts

key-decisions:
  - "anchorNextEntityId is a plain number read from World.store.nextId; the lifecycle still imports no id module, so the per-world id-scope guard stays green"

requirements-completed: [SAVE-07]

coverage:
  - id: D1
    description: "WorldLifecycle.anchorNextEntityId: post-populate store.nextId of the world built by begin or resume, unmoved by later spawns, cleared by end and resetForRestore"
    requirement: SAVE-07
    verification:
      - kind: unit
        ref: "tests/app/session/world-lifecycle.test.ts#leg-anchor counter (Phase 11, D-01, D-05)"
        status: pass
      - kind: integration
        ref: "tests/app/session/world-lifecycle.test.ts#launch creates a world that steps through stepSim; docking drops it (tracer)"
        status: pass
      - kind: integration
        ref: "tests/app/session/world-lifecycle.test.ts#arrival"
        status: pass
    human_judgment: false
  - id: D2
    description: "D-07 cross-check vector pinned (3545325333, 0x2b4e037c) before the first v3 write"
    requirement: SAVE-07
    verification:
      - kind: unit
        ref: "tests/persistence/save-v3.test.ts#world-seed cross-check vector (D-07), pinned before the first v3 write"
        status: pass
    human_judgment: false
  - id: D3
    description: "Canonical v2 in-flight golden captured from the real v2 writer and pinned equal to encodeSave output"
    requirement: SAVE-07
    verification:
      - kind: unit
        ref: "tests/persistence/save-golden.test.ts#canonical v2 writer golden (captured in plan 11-01, before the v3 bump)"
        status: pass
    human_judgment: false

duration: 4min
completed: 2026-11-14
status: complete
---

# Phase 11 Plan 01: Leg-anchor counter and pre-v3 pins Summary

**`WorldLifecycle.anchorNextEntityId` exposes the post-populate id counter of the leg's world, and the mix32 cross-check vector plus a real v2 writer golden are pinned before the first v3 write.**

## Performance

- **Duration:** about 4 min
- **Tasks:** 2 (1 tracer, 1 auto)
- **Files:** 6 (2 created, 4 modified)

## Accomplishments

- Anchor counter semantics as implemented: `begin` and `resume` build the world, then assign `world`, `epoch` (begin only) and `anchorNextEntityId = created.store.nextId` after `populate`. The value is 101 with the default populator and 104 with a three-ship test populator; a later spawn moves the live counter to 105 and leaves the anchor at 104. It is undefined before the first creation, after `end` and after `resetForRestore` (both branches). A refused `begin` or `resume` (non-finite seed, saturated epoch) and a `begin` whose populator throws leave epoch, world and anchor unchanged.
- Through the real event router the launch sets the anchor to 101, the dock clears it, and the next launch sets it again. A successful hyperspace arrival leaves the anchor at the arrival world's counter (101), set by the `begin` that runs before the arrival autosave; a failed arrival leaves it unchanged. The D-05 traffic on/off sequence records `[101, undefined, 101, 101, 101]` in both modes.
- D-07: `tests/persistence/save-v3.test.ts` pins `marketSeedForSystem("g0-s7") = 3545325333`, `worldSeedFor(3545325333, 1) = 0x2b4e037c` and a fresh lifecycle's first `begin` at Lave building a world with seed `0x2b4e037c`.
- D-03: `tests/golden/save/v2-phase10-inflight.json` (1638 bytes) is the v2 `encodeSave` output for an in-flight save (market snapshot, flight pose, committed target `g0-s1`, cargo). The golden equals the v2 writer's output at commit `9ff46b7` (and at `e5ba7be`, since the v2 writer is untouched until plan 11-02); `parseSave` accepts it with version 2 and mode inFlight.
- The structural lifecycle doubles gained the new member: `disposeHarness` and `logged()` in the lifecycle test, `withLifecycle` in session-order.

## Task Commits

1. **Task 1: leg-anchor counter end to end** - `e5ba7be` (feat)
2. **Task 2: D-07 vector and v2 writer golden** - `9ff46b7` (test)

## Verification

- `docker compose run --rm test npx vitest run tests/app/session/world-lifecycle.test.ts tests/app/session-order.test.ts tests/app/session/tick-parity.test.ts tests/guards/entity-id-scope.test.ts`: 4 files, 95 tests passed (red first: 12 failures before the implementation).
- `docker compose run --rm test npx vitest run tests/persistence/save-v3.test.ts tests/persistence/save-golden.test.ts tests/sim/rng.test.ts tests/app tests/persistence`: 31 files, 534 tests passed.
- `docker compose run --rm lint` and `docker compose run --rm typecheck`: clean.
- All acceptance criteria of both tasks pass (rg counts: lifecycle 9 and 2, lifecycle test 26, session-order 1, `leg-anchor counter` 1, no `world/ids` import; golden version 2, mode inFlight, 17 goods, no epoch/nextEntityId/marketSeed keys; no `console.log`). No `verify` was run, per the gate policy.

## Deviations from Plan

None - plan executed exactly as written. The golden was captured with a temporary file write to a `/tmp` mount instead of a stdout print; the temporary line and the scratch directory were removed, and the golden was not edited after capture beyond Prettier formatting.

## Known Stubs

None.

## Threat Flags

None.

## Issues Encountered

None.

## Self-Check: PASSED

- FOUND: src/app/session/world-lifecycle.ts, tests/persistence/save-v3.test.ts, tests/golden/save/v2-phase10-inflight.json, tests/app/session/world-lifecycle.test.ts, tests/app/session-order.test.ts, tests/persistence/save-golden.test.ts
- FOUND commits: e5ba7be, 9ff46b7
