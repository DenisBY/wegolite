---
phase: 14-npc-flight-and-steering-fidelity-gate
plan: 05
subsystem: sim
tags: [world-view, ai-seam, collision-radius, steering-prerequisite]
status: complete

requires:
  - phase: 08-session-split-and-world-core
    provides: the WorldView / BodyView seam, createWorldView and the VIEW_MEMBERS pin
provides:
  - BodyView.radius (inherited by ShipView), the body's collision radius in metres, on every return path of the world view
  - createWorldView(world, player, layout, playerRadius = 0), the player's hull collision radius argument
  - the test-pilot bodyView() helper and the view tests carrying a radius, so later synthetic views start with radii
affects: [14-09, 14-11, 14-12, 14-13]

requirements-completed: []
requirements-advanced: [AI-01]

plan_head_before: 8c969d4a417276d2cf63a537d3456ed6faab4906
plan_head_after: 7108ad980d5e18dea595705bf265e56107ffb1c0

actuals:
  tokens: 1941
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "A field added to BodyView, not to WorldView or ShipControl, so the exhaustive VIEW_MEMBERS pin does not move (Pitfall 19)"

key-files:
  created: []
  modified:
    - src/sim/world/view.ts
    - src/sim/world/view-impl.ts
    - tests/sim/world/view.test.ts
    - tests/sim/ai/test-pilot.test.ts

key-decisions:
  - "The player's radius is an optional fourth createWorldView argument defaulting to 0; plan 14-12 passes the compiled Cobra Mk III radius from the step"
  - "A static's radius is read through layout[record.layoutKey].radius at call time, the same layout body locate already reads for its position"

patterns-established:
  - "Every BodyView path (locate, shipOf, copyBody) carries radius as a plain number, so a returned body is a fresh copy and no caller can change a world, layout or player radius"

coverage:
  - id: D1
    description: "BodyView.radius is filled from entity.radius for a dynamic ship, from the layout body for the station, planet, sun and both buoys, and from the playerRadius argument (0 when absent) for the player"
    requirement: AI-01
    verification:
      - kind: unit
        ref: "tests/sim/world/view.test.ts#BodyView.radius is the collision radius of every body kind"
        status: pass
    human_judgment: false
  - id: D2
    description: "A returned radius is a copy: writing to it changes neither the entity, the layout, the player nor a later call; the WorldView member set and ShipControl are unchanged"
    verification:
      - kind: unit
        ref: "tests/sim/world/view.test.ts#writing to a returned radius changes no world, layout, player or later result"
        status: pass
      - kind: unit
        ref: "tests/sim/world/view.test.ts#the view's member set equals the pinned VIEW_MEMBERS exactly (Pitfall 19)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Every BodyView literal in the tree compiles with the field"
    verification:
      - kind: command
        ref: "docker compose run --rm typecheck"
        status: pass
    human_judgment: false

duration: 11min
completed: 2026-11-15
---

# Phase 14 Plan 05: BodyView.radius for the steering Summary

**`BodyView.radius` (the collision radius in metres) on every body the world view returns, from the entity, the layout or a new `playerRadius` argument, copied on every path and pinned per body kind, so the steering ports of plans 14-12 and 14-13 can read it.**

## Performance

- **Duration:** about 11 minutes
- **Completed:** 2026-11-15T18:54Z
- **Tasks:** 2 of 2 (Task 1 a tracer)
- **Files modified:** 4 (`src/sim/world/view.ts`, `src/sim/world/view-impl.ts`, `tests/sim/world/view.test.ts`, `tests/sim/ai/test-pilot.test.ts`)

## Accomplishments

- `BodyView` gains `readonly radius: number` with a doc comment; `ShipView` inherits it. `WorldView` and `ShipControl` are unchanged, so the `VIEW_MEMBERS` pin holds.
- `createWorldView` takes `playerRadius = 0`. `locate` returns `playerRadius` for the player, `layout[record.layoutKey].radius` for a static and `entity.radius` for a dynamic entity; `shipOf` and `copyBody` carry it.
- Five new view cases: a dynamic ship through `body()` and `ship()`, each of the five statics against its layout body, a moved layout read by a new view, the player's argument and the default 0, and the copy guarantee (writes to a returned radius leave the entity, layout, player and a later call untouched). Expected values come from the entity and the layout the test builds.
- The tree compiles: the only other `BodyView` literal was the `bodyView()` helper of `test-pilot.test.ts`, which now carries `radius: 0`. No third literal turned up.

## Task Commits

1. **Task 1 (tracer): BodyView.radius from every source, compiled across the tree** - `4b8f6f9` (feat)
2. **Task 2: radius cases for every body kind and the copy guarantee** - `7108ad9` (test)

Tracer feedback gate: auto mode is on (`workflow.auto_advance`), so the tracer's `<verify>` (typecheck and the two targeted vitest files) was passed at the commit and the plan expanded.

## Verification

- `docker compose run --rm typecheck`: clean after Task 1 and again after Task 2.
- `docker compose run --rm test npx vitest run tests/sim/world/view.test.ts tests/sim/ai/test-pilot.test.ts`: 2 files, 50 tests passed (after Task 1). `view.test.ts` alone: 34 passed after Task 2.
- `docker compose run --rm lint` (eslint and prettier): clean.
- Full `docker compose run --rm test`: 175 files, 3829 passed, 10 skipped (the OOLITE_SRC-gated harness cases and two others), exit 0, coverage floors held.
- Acceptance greps: `rg -c 'readonly radius' src/sim/world/view.ts` is 1; `rg -c 'playerRadius' src/sim/world/view-impl.ts` is 3; `rg -c 'radius' tests/sim/ai/test-pilot.test.ts` is 2; `rg -c 'radius' tests/sim/world/view.test.ts` is 36 (at least 5).
- No `verify` or browser gate was run: the plan touches only `src/sim` and tests (gate policy).

## Decisions Made

- The default of `playerRadius` stays 0 as the plan specifies. A caller outside the world step that forgets it gets a zero player radius silently; plan 14-12 owns the call that passes the compiled Cobra Mk III radius and pins it with a grep gate.
- No CHANGELOG entry: the change is internal (a read-only field no player can see yet).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Two existing `toEqual` cases of `view.test.ts` needed the new field**
- **Found during:** Task 1 (the acceptance line "the existing view and test-pilot tests pass unchanged")
- **Issue:** `ship() answers for live dynamic entities only` and `body(dynamic) carries the stored kind...` compare a whole `ShipView` / `BodyView` with `toEqual`, which fails on the extra `radius` property, so the Task 1 verify (`view.test.ts`) could not pass without touching them. The plan lists `view.test.ts` under Task 2 only.
- **Fix:** Added `radius: 50` (the `shipInit` default) to both expected objects, in the Task 1 commit, so every commit stays green.
- **Files modified:** `tests/sim/world/view.test.ts`
- **Verification:** `view.test.ts` 29 tests passed after Task 1.
- **Committed in:** `4b8f6f9`

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** None on scope; the two expectations had to follow the field they pin.

## Issues Encountered

None.

## Known Stubs

None. `playerRadius` defaulting to 0 is the documented behaviour for callers outside the step, not a stub; plan 14-12 wires the real value.

## Threat Flags

None. T-14-20 (tampering through `BodyView.radius`) is mitigated: `radius` is a plain number on a fresh copy on every return path, and the Task 2 copy case writes to a returned radius and checks the entity, the layout, the player and a later call.

## Next Phase Readiness

- Plans 14-09, 14-12 and 14-13 can read `body.radius` for every body kind and give synthetic views a radius from the start.
- Plan 14-12 must pass the Cobra Mk III collision radius as the fourth argument of `createWorldView` on every call from the step.

## Self-Check: PASSED

- Files: `src/sim/world/view.ts`, `src/sim/world/view-impl.ts`, `tests/sim/world/view.test.ts`, `tests/sim/ai/test-pilot.test.ts` all present and modified by commits `4b8f6f9` and `7108ad9`, both ancestors of HEAD.
- Acceptance criteria of both tasks re-run and passing (see Verification).

---
*Phase: 14-npc-flight-and-steering-fidelity-gate*
*Completed: 2026-11-15*
