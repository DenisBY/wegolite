---
phase: 21-roster-state-shape-and-seams
plan: 16
subsystem: testing
tags: [draw-calls, render-spike, test-hook, probe, playwright, fast-check, QUAL-09, D-05]
requires:
  - phase: 21-08
    provides: "29-record catalogue, 39 GLBs, NPC model keys"
  - phase: 21-11
    provides: "NPC model prefetch (every GLB downloads in the background)"
  - phase: 21-12
    provides: "aft-weapon tripwire the anarchy hook must keep green"
  - phase: 21-14
    provides: "hook shooter cargo kind (TEST_SHOOTER_CARGO_KIND), pod contents"
provides:
  - "spawnTestAnarchy (sim seam + ?test=1 probe hook member) and ANARCHY_RING_RADIUS_M / ANARCHY_RING_AHEAD_M"
  - "tests/e2e/anarchy.spec.ts: the full-anarchy draw-call and triangle spike, before and after a kill"
  - "the first measured calls and triangles of a 29-key anarchy (baseline for 21-17, 21-18, 21-19)"
affects: [21-17, 21-18, 21-19, 22]
tech-stack:
  added: []
  patterns:
    - "all-or-nothing test seam: trial-spawn every init into a scratch world (spawnEntity's own rules), then spawn for real"
    - "model readiness by key from the network (GLB + NPC-owned textures finished) plus settled draw counters, no probe key"
key-files:
  created:
    - tests/e2e/anarchy.spec.ts
  modified:
    - src/sim/ai/test-spawn.ts
    - src/app/probe.ts
    - src/app/session/probe-publisher.ts
    - tests/fixtures/probe-shape.json
    - tests/app/probe-shape-compare.test.ts
    - tests/app/session/probe-publisher.test.ts
    - tests/sim/ai/test-spawn.test.ts
    - tests/guards/dead-mode-gates.test.ts
key-decisions:
  - "Ring slot = record index over records.length, so skipping a refused record never moves the others (the plan's 'without changing the placement of the valid ones')"
  - "Ring radius 1,200 m, centre 2,500 m ahead: 260 m chord (largest hull radius 86 m), nose axis free for the cargo shooter and the player's lasers"
  - "All-or-nothing by trial-spawning each init into a fresh scratch world instead of duplicating spawnEntity's domain rules"
requirements-completed: [DATA-18]
duration: 80min
completed: 2026-11-26
status: complete
commits: 2
plan_head_before: bc3bf2f2ee681315ae8719e63f34bd85f7cbf244
plan_head_after: a949ff466c3daf50a2333607b7f2ee4552bd18b8
actuals:
  tokens: 12500
  tasks: 2
  commits: 2
---

# Phase 21 Plan 16: the full-anarchy draw-call spike Summary

**A `?test=1` hook spawns one inert ship of every one of the 29 catalogue keys on a ring ahead of the player, and a browser spec measured the first full-anarchy numbers: 65 draw calls and 77,934 triangles with every hull drawn, 68 calls and 78,598 triangles with a kill's debris and explosion live.**

## Measured counts (remote e2e, the first measurement, before the D-05 fixes)

Remote Chromium run of `tests/e2e/anarchy.spec.ts` (commit 07eb0454, `anarchy-counts` line, exit 0):

| Moment | `probe.calls` | `probe.triangles` |
| --- | --- | --- |
| Worst case: 29 keys drawn (plus the 12 populated inert ships, same keys), before the kill | 65 | 77,934 |
| After the kill: debris (5 debris entities) and explosion live, kill + 60 ticks, settled | 68 | 78,598 |

Against the current budgets: 65 and 68 calls both exceed the 50-call budget (RESEARCH 8.1 estimated about 73); the triangles are far under the 250,000 budget (about 31 percent). Plans 21-17 (hull primitives merged at build time) and 21-18 (variant hulls share one mesh set) re-measure on this spec; plan 21-19 compares and decides the draw-call budget from these numbers. The spec asserts no budget.

The NPC layer costs one call per (key, primitive) mesh set; the rest of the 65 is the scene (starfield, planet, sun, station, buoy, the player's ship and the other layers). The assertion `calls >= 29` proves every key's model is drawn.

## What was built

- `spawnTestAnarchy(world, player, records, tick)` in `src/sim/ai/test-spawn.ts`: one inert ship (no AI, speed 0, the player's orientation, its record's radius and energy) per valid record on a ring of `ANARCHY_RING_RADIUS_M` (1,200 m) in the plane square to the player's nose, centred `ANARCHY_RING_AHEAD_M` (2,500 m) ahead. Total and all or nothing: a record the world would refuse is found by trial-spawning the same init into a scratch `createWorld(0)` and is skipped; the call returns false and leaves the world untouched when no record is valid, when the world lacks room for every valid ship, or when the id counter could not number them all.
- The probe hook member `spawnTestAnarchy()` (`src/app/probe.ts`, `src/app/session/probe-publisher.ts`): `?test=1` only, in flight only, refuses without a world or traffic content, taints the session before touching the world, returns a boolean and exposes no id. Pinned in `tests/fixtures/probe-shape.json` (both `?test=1` states) and `tests/app/probe-shape-compare.test.ts`.
- `tests/e2e/anarchy.spec.ts`: boots `/?test=1&traffic=1&clock=manual`, launches, calls the hook, waits until every key's GLB and its NPC-owned textures finished downloading (by key, never a sleep), waits for the draw counters to settle (three equal reads), reads `calls` and `triangles`, spawns the cargo shooter with the fire key held, steps until the scanner loses it, steps 60 ticks, waits for the particle textures and settles again. It asserts 29 keys, one entity per key added, `calls >= 29`, debris entities after the kill, and more calls after the kill than before; the four counts go to the report (annotations, an attached JSON, and an `anarchy-counts:` console line).
- Tests: unit cases for placement, inertness (the six aft-armed hulls included), determinism, slot stability, duplicates, room, id exhaustion, bad pose and tick; two fast-check properties (totality over arbitrary record lists and near-full worlds with vacuity guards on both outcomes, and a non-finite pose); hook cases in the probe-publisher test.

## Task Commits

1. **Task 1 (tracer): the anarchy hook and spec end to end** - `07eb0454` (feat)
2. **Task 2: totality property, refusal cases, gates** - `a949ff46` (test)

## Verification

- Targeted Vitest (test-spawn, probe-publisher, probe-shape-compare, aft-weapon-tripwire, fire-decision-source): 137 passed (Task 1), 53 passed with dead-mode-gates (Task 2).
- Remote e2e `anarchy.spec.ts` plus `probe-shape.spec.ts`: 8 passed (exit 0, snapshot 07eb0454, 32 s).
- Local `lint`, `typecheck`: clean. Local full `test`: 305 of 306 files passed on the second run; the one failure was `dead-mode-gates` (re-pinned, see Deviations) and a first full run showed three timeouts under machine load (the new property test at 5 s, since given a 60 s per-test bound and 150 runs; two guard tests that spawn eslint, which pass on the remote).
- Remote `verify`: exit 0, snapshot a949ff46, elapsed 216 s, 306 of 306 unit files, 28 e2e tests passed.
- The 20-seed acceptance run was not run: `src/sim/ai/test-spawn.ts` is not a QUAL-12 path (plan 21-19's gate runs it).

## Decisions Made

- Ring placement by record index over `records.length` (not over the valid count), so the valid ships keep their slots when a record is skipped.
- Trial-spawn validation instead of re-implementing `domainRefusal`, so the seam follows `spawnEntity`'s rules by construction.
- Readiness by key without a new probe key: the probe shape stays frozen; the spec reads the network (GLB and NPC-owned textures per key) and the settled counters.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `dead-mode-gates` guard pinned three negative mode comparisons in `probe-publisher.ts`**
- **Found during:** Task 2 (full local `test`)
- **Issue:** the new hook's `liveState.mode !== "inFlight"` gate made four; the guard demands a review of the file's gates for every flight mode, `"dead"` included, then a re-pin.
- **Fix:** reviewed: like the shooter, attacker and flyers hooks, the anarchy hook refuses unless the mode is `"inFlight"`, so `"dead"` and `"launching"` fail closed. Re-pinned 3 to 4 with a comment.
- **Files modified:** tests/guards/dead-mode-gates.test.ts
- **Commit:** a949ff46

**2. [Rule 1 - Bug in my own test] property test timed out at 5 s under a loaded machine**
- **Found during:** Task 2 (first full local `test`, 608 s because of parallel worktrees)
- **Fix:** 150 runs and an explicit 60 s per-test bound on that one test (about 1.5 s alone). No global timeout changed.
- **Commit:** a949ff46

### Plan wording that did not match the tree

- `src/app/session/sim-driver.ts` is in the plan's file list but was not changed: the hook bodies live in `probe-publisher.ts` (the spawn hooks never pass through the sim driver), so the wiring is probe.ts, probe-publisher.ts and test-spawn.ts.
- The acceptance criterion `rg -c "spawnTestAnarchy" tests/fixtures/probe-shape.json == 1` counts two: the fixture pins the hook in both `?test=1` states (`testHookDocked`, `testHookManualDocked`), as it does `spawnTestAttacker`.
- The brief's hand-off said `TEST_SHOOTER_KEY` lives in `src/app/session/test-spawn.ts`; it lives in `src/sim/ai/test-spawn.ts`.
- No CHANGELOG entry: a test-only hook and spec, no user-visible change.

## Aft-tripwire hand-off (21-12)

The anarchy ships have no AI (`ai` is null for all 29, asserted per ship and for the six aft-armed keys explicitly), so no attacking AI reaches an aft-armed hull. `AFT_ATTACK_BRANCHES_PORTED` stays false, the guard and its key list are untouched, and `aft-weapon-tripwire` and `fire-decision-source` pass.

## Known Stubs

None.

## Threat Flags

None. The hook is T-21-30 (gated on `?test=1`, taints, pinned by the probe shape) and T-21-31 (all or nothing under the entity cap, totality property).

## Self-Check: PASSED

- Created and modified files exist (anarchy.spec.ts, the seven source and test files, dead-mode-gates).
- Commits `07eb0454` and `a949ff46` are ancestors of HEAD.
- `rg -c spawnTestAnarchy src/app/probe.ts` is 3 (at least 1); `fc.assert|fc.property` appears in tests/sim/ai/test-spawn.test.ts.
