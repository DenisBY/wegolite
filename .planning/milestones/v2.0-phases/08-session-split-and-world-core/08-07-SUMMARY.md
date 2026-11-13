---
phase: 08-session-split-and-world-core
plan: 07
subsystem: simulation
tags: [ai-seam, world-view, ship-control, determinism, scan, shared-limits]

requires:
  - phase: 08-session-split-and-world-core
    provides: plan 08-05 world core (ids, limits, entity, store, world with frozen statics, layoutKey records)
provides:
  - src/sim/world/view.ts (BodyView, ShipView, ScanFilter, WorldView; types only)
  - src/sim/world/control.ts (ShipControl; types only)
  - src/sim/world/view-impl.ts (createWorldView(world, player, layout))
  - src/sim/world/control-impl.ts (createShipControl(world, actorId, tick))
affects: [08-09, 08-11, 08-12, 08-13, 08-15, 08-16]

plan_head_before: c2c0236f9bfb9ea0e24d5ac277cbda5f94b84f27
plan_head_after: 6644124ef2713cd912fb6a61a53c1b60677188ab

actuals:
  tokens: 12000
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "type-only seam modules (imports: ids and math only, as import type) so the AI lint zone can allow them and nothing else"
    - "static bodies resolved at call time through staticEntity(world, id) and layout[record.layoutKey]; the world copies no geometry"
    - "every returned vector and quaternion made by the private copyVec and copyQuat; an internal locate() holds the only live references and never leaves the module"
    - "ShipControl ignores (never clamps, never throws) any argument outside the shared limits.ts domain"
    - "member sets pinned by Record<keyof WorldView, true> and Record<keyof ShipControl, true> literals plus a runtime Object.keys comparison"

key-files:
  created:
    - src/sim/world/view.ts
    - src/sim/world/control.ts
    - src/sim/world/view-impl.ts
    - src/sim/world/control-impl.ts
    - tests/sim/world/view.test.ts
    - tests/sim/world/control.test.ts
  modified: []

key-decisions:
  - "WorldView.scan treats the player and the five statics as ordinary candidates; a kinds filter of [] keeps nothing (not 'no filter')"
  - "ShipControl.scheduleWake requires the actor to hold an AI component and ticks to be a safe integer >= 1 with tick + ticks <= MAX_UINT32; a pending wake of 0 means none"
  - "ShipControl.setTarget checks only the uint32 domain, not that the target id is live in the world (the plan specified the domain, and a target may legitimately die between ticks)"

patterns-established:
  - "Pattern: seam modules are type-only; implementations live in sibling -impl files that the AI zone does not import"
  - "Pattern: an exhaustive Record<keyof Interface, true> literal in the test pins an interface's member set at typecheck (Pitfall 19)"

requirements-completed: [FOUND-13, FOUND-11]

coverage:
  - id: D1
    description: "WorldView resolves ids 1-5 through the world's stored records and the layout at call time, id 100 from the live FlightState, and live dynamic ids from the store; ids 6-99, NO_ENTITY, killed and malformed ids are undefined and invalid"
    requirement: FOUND-13
    verification:
      - kind: unit
        ref: "tests/sim/world/view.test.ts#isValid, body and ship across id classes"
        status: pass
      - kind: unit
        ref: "tests/sim/world/view.test.ts#static entities resolve through the layout (D-06, D-07)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Every vector and quaternion a view returns is a fresh copy: mutating body, ship and scan results changes neither the world, the layout nor the FlightState"
    requirement: FOUND-13
    verification:
      - kind: unit
        ref: "tests/sim/world/view.test.ts#returned objects are copies (T-08-13)"
        status: pass
    human_judgment: false
  - id: D3
    description: "The station view orientation is stationBaseQuat rolled about local +Z by stationAngle and matches an independent three.js computation within 1e-12 at angles 0, 0.5, pi and -1.2"
    requirement: FOUND-13
    verification:
      - kind: unit
        ref: "tests/sim/world/view.test.ts#the station's roll equals the renderer's composition (review 10b4108 L184)"
        status: pass
    human_judgment: false
  - id: D4
    description: "scan orders by squared distance then ascending id, includes exactly-at-range and excludes range plus 1e-6, returns [] for NaN, Infinity, negative range and invalid self, never lists self or killed entities, and honours a kinds filter"
    requirement: FOUND-13
    verification:
      - kind: unit
        ref: "tests/sim/world/view.test.ts#scan ordering and bounds (FOUND-12/13 edge)"
        status: pass
    human_judgment: false
  - id: D5
    description: "ShipControl writes only the actor's nav fields, ignores every other id, and ignores out-of-domain arguments (1e13, 2 ** 32, NaN, prototype-name behaviours, a wake past 0xffffffff) without throwing; scheduleWake keeps the earlier wake"
    requirement: FOUND-13
    verification:
      - kind: unit
        ref: "tests/sim/world/control.test.ts#actor-only writes (T-08-12)"
        status: pass
      - kind: unit
        ref: "tests/sim/world/control.test.ts#the shared serialised domain (Round 4 consensus 12, T-08-51)"
        status: pass
    human_judgment: false
  - id: D6
    description: "The member sets of WorldView and ShipControl are pinned by exhaustive Record literals (typecheck) and equal the implementations' runtime keys"
    requirement: FOUND-13
    verification:
      - kind: unit
        ref: "tests/sim/world/view.test.ts#the view's member set"
        status: pass
      - kind: unit
        ref: "tests/sim/world/control.test.ts#ShipControl member set"
        status: pass
    human_judgment: false
  - id: D7
    description: "Ids are world-scoped and the world holds no player: a fresh world's view does not see another world's id 101 and a control over it cannot write there; a view created before a FlightState replacement keeps its object, one created after reads the new one"
    requirement: FOUND-11
    verification:
      - kind: unit
        ref: "tests/sim/world/view.test.ts#per-world ids (CONTEXT D-06 as amended 2026-11-12)"
        status: pass
      - kind: unit
        ref: "tests/sim/world/view.test.ts#the world holds no player (G-8)"
        status: pass
    human_judgment: false

duration: 20min
completed: 2026-11-13
status: complete
---

# Phase 8 Plan 07: WorldView and ShipControl Seam Summary

**A type-only read-only WorldView (statics through the layout at call time, the live player, copy-on-read, deterministic distance-then-id scan) and a write-only actor-only ShipControl that ignores anything outside the shared limits.ts domain, with a never-later wake rule and member sets pinned at typecheck.**

## Performance

- **Duration:** about 20 min
- **Started:** about 2026-11-13T11:28Z (not recorded to the second)
- **Completed:** 2026-11-13T11:48Z
- **Tasks:** 2 (Task 1 tracer, Task 2 TDD)
- **Files:** 6 created, 0 modified (about 12000 tokens at chars/4)

## Accomplishments

- Task 1 (tracer): the four modules and a three-case tracer test (layout bodies and player pose through body(), scan returning the nearer entity first, an actor's setDesiredSpeed visible through ship()). The tracer verify (view test plus typecheck, then lint) passed before Task 2, so expansion went ahead (`Tracer verified end-to-end -- expanding`).
- Task 2: 46 tests across the two files covering every behaviour row of the plan, plus the exhaustive `Record<keyof ...>` member pins.
- `src/sim/world/view-impl.ts` and `control-impl.ts` reach 98.24 and 100 percent statement coverage (100 percent functions); `src/sim/world` stays at 98.59 lines and 97.74 branches. The src/sim coverage floors hold; no floor was lowered.
- No file outside `src/sim/world` and `tests/sim/world` changed; nothing under `src/app` was touched (D-14). No CHANGELOG entry (internal).

## Task Commits

1. **Task 1: the seam end to end** - `4d8e923c788947bc98a8e79bb41b2ab5b9c83008` (feat), tree `7f02985203cb5acf8780ef2e6b907d30ee3ba867`
2. **Task 2: the seam contract tests** - `6644124ef2713cd912fb6a61a53c1b60677188ab` (test), tree `5f050daa4efb99dbecef16e637c5d0ed84e1d38d`

**Plan metadata:** the docs commit that carries this SUMMARY, STATE.md and ROADMAP.md.

## Files Created/Modified

- `src/sim/world/view.ts` - BodyView, ShipView, ScanFilter, WorldView (type-only; per-world id scope in the doc comment)
- `src/sim/world/control.ts` - ShipControl (type-only; per-world id scope in the doc comment)
- `src/sim/world/view-impl.ts` - createWorldView; private copyVec, copyQuat, copyBody; an internal locate() with live references
- `src/sim/world/control-impl.ts` - createShipControl over the shared limits (isUint32, isBounded, BEHAVIOUR_IDS includes)
- `tests/sim/world/view.test.ts` - 29 tests, VIEW_MEMBERS, independent three.js station composition, per-world ids
- `tests/sim/world/control.test.ts` - 17 tests, CONTROL_MEMBERS, actor-only, domain and never-later rows

## Decisions Made

- `scan` candidates are the five statics, the player and live non-dead dynamic entities, resolved through the same `locate` as `body`, so scan and body can never disagree about where a body is. A `kinds: []` filter keeps nothing, the literal reading of "keeps only those kinds".
- `setTarget` validates the uint32 domain only. The plan specified the domain and did not ask for a liveness check; a stale target is the AI's concern and clamping or refusing it here would hide a real behaviour question for the Phase 12 AI work.
- Expected values in the station roll test come from three.js (`Quaternion.multiply` with `setFromAxisAngle`), not from view-impl helpers. The angle-0 case compares numerically (1e-12) because `mul` prints +0 where the layout base holds -0, which `toEqual` distinguishes.

## Gate evidence and attribution

All gates ran in the main tree (no detached worktree). Before the Task 2 gates `git status --porcelain --untracked-files=all` listed only this plan's two test files (plus untracked review-diagnostics directories under `.planning/`). The only wegolite compose container running was `wegolite-preview-1` (the production preview, up 40 hours, which only serves an existing `dist/` and writes nothing during a unit run); the other running containers belong to unrelated projects. As in plans 08-02 and 08-05, the isolation condition is therefore met in substance rather than literally (`docker ps` filtered by the compose project label was not empty).

| Gate | Result | Commit / tree it ran on |
|------|--------|-------------------------|
| view test and `typecheck` (Task 1 verify), then `lint` | 3 passed; both exit 0 | content of 4d8e923 (run before the commit, after one Prettier rewrite of view.ts), main tree |
| view and control tests | 2 files, 46 passed | tests of 6644124 plus the one-line `mutable()` lint fix, main tree |
| `docker compose run --rm test` (full unit run, src/sim coverage floors) | exit 0, 119 files, 1748 passed, 2 skipped; src/sim/world 98.59 lines, 97.74 branches, 100 functions | 6644124 content except the one-line `mutable()` type tweak (made after this run, test-only); tree of 6644124 is `5f050daa4efb99dbecef16e637c5d0ed84e1d38d` |
| `docker compose run --rm lint` and `typecheck` | both exit 0 | the committed tree 6644124 content (rerun after the tweak) |

The flaky `tools/oolite-ingest/convert/textures.test.ts` timeout did not occur. `verify` and `verify-full` were not run: the plan is pure src/sim logic and the gate policy for this plan excluded them.

Non-vacuity was spot-checked with four mutations of the committed sources, each caught by exactly the expected test and restored with `git checkout`: dropping the `id === actorId` guard, replacing `Math.min(pending, wake)` with `wake`, returning the live `nav.destination` from `ship()`, and ignoring the `kinds` filter.

## Acceptance criteria re-run

- Task 1: view.ts and control.ts import only `../math.js` and `./ids.js`, both as `import type`; no `export function|const|class` in either; `FlightState` appears in world.ts only inside a doc comment (the world never holds the player) and not in store.ts; view test and typecheck pass. PASS.
- Task 2: `1e-12` matches 9 lines and `setFromAxisAngle` 1 in view.test.ts; `Record<keyof WorldView, true>` 1 and `Record<keyof ShipControl, true>` 1; `per-world ids` 1 in view.test.ts and `own world|per-world|per world` in view.ts (1) and control.ts (2); `function copyVec|function copyQuat` 2; `./limits.js` imported once and `.includes(` used once in control-impl.ts; no second definition of a shared limit under src/sim/world or src/sim/ai (rg exit 1); `1e13|2 \*\* 32` 7 lines in control.test.ts. PASS.

## Deviations from Plan

None - plan executed exactly as written. (The plan's acceptance criterion for `rg -n "FlightState" src/sim/world/world.ts src/sim/world/store.ts printing nothing` literally matches one doc-comment line in world.ts that plan 08-05 already wrote ("`FlightState` stays its only authority"); the intent, that the world never holds a FlightState, is met: there is no import, field or parameter of that type.)

## Issues Encountered

- Prettier rewrote `scan(...)` in view.ts onto one line and the control/view tests once; applied through the lint container before the Task 1 commit.
- One ESLint error in view.test.ts (`no-unnecessary-type-assertion` on the `mutable` helper) after the first full lint run; fixed by returning the value directly. One test failure on first run (angle-0 station orientation compared with `toEqual`, -0 versus +0), fixed in the test by comparing numerically.

## Known Stubs

None. Broken-windows ledger: nothing to record.

## Threat Flags

None. T-08-12 (actor-only writes), T-08-13 (copies of every returned vector and quaternion) and T-08-51 (shared limits domain with ignore-not-clamp) are implemented and unit-proven as planned.

## Next Phase Readiness

Plans 08-09 (AI zone lint and registry), 08-11 (sanitize and step) and 08-12 onward can import `createWorldView` and `createShipControl` and the type-only `view.ts` and `control.ts`. The AI zone should allow only `view.ts`, `control.ts`, `ids.ts` and `../math.js`. `scan` is a linear pass that rebuilds the candidate id list per call; a spatial broadphase is Phase 10 scope (Round 2 R2-01, rejected for Phase 8).

## Self-Check: PASSED

- Files present: src/sim/world/view.ts, control.ts, view-impl.ts, control-impl.ts, tests/sim/world/view.test.ts, control.test.ts.
- Commits present on HEAD: 4d8e923, 6644124 (checked with `git merge-base --is-ancestor`).
