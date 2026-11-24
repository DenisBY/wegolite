---
phase: 18-stations-buoys-and-collisions
plan: 22
subsystem: testing
tags: [e2e, playwright, statics, buoys, ident, chunk-load, CBT-17, DATA-15]

requires:
  - phase: 18-08
    provides: HudModelOptions.buoys (a destroyed nav buoy has no scanner contact)
  - phase: 18-06
    provides: ident locks the station by its compiled name ("Coriolis Station")
  - phase: 18-13
    provides: the traffic-on static-hull chunk load and its boot-failure rule
  - phase: 18-05
    provides: buoys as laser targets (250 energy, 2/s recharge, destruction at 0)
provides:
  - tests/e2e/statics.spec.ts, the traffic-on browser proof of the statics (five tests)
affects: [18-12]

actuals:
  tokens: 4100
  tasks: 2
  commits: 2
plan_head_before: f5c8b5bba680ac1bd845cff1b5e3bbf3e45d266a
plan_head_after: 6bae6ac9f49c69a064e9ceb911a4d9a7ed6036ce

tech-stack:
  added: []
  patterns:
    - "A browser spec checks its layout literals against the probe's published world positions before aiming with them"
    - "A firing loop is bounded by a tick count derived from the laser period and the target's energy, and fails with the last contacts and ticks"

key-files:
  created:
    - tests/e2e/statics.spec.ts
  modified:
    - .planning/phases/18-stations-buoys-and-collisions/deferred-items.md

key-decisions:
  - "The load-path case runs as two tests (traffic on, traffic off), each in Playwright's fresh per-test context, so the spec has five tests for the plan's four cases"
  - "Both load-path URLs add clock=manual so the launch is stepped the same way; the traffic flag alone decides whether the chunk loads"
  - "The ident case also waits for the message 'Ident system locked onto Coriolis Station.' (an existing probe field), so the lock is shown to be the station and not a passing NPC"

patterns-established:
  - "Static-chunk request check: /\\/assets\\/ships-static-hulls-[^/]+\\.js$/ with the ships-hulls chunk as the traffic-on vacuity guard"

requirements-completed: [DATA-15, CBT-17]

coverage:
  - id: D1
    description: "In a traffic-on browser session the player's fore pulse laser destroys the Lave nav buoy from 2,000 m and navBuoy leaves the scanner contacts; the station contact stays"
    requirement: CBT-17
    verification:
      - kind: e2e
        ref: "tests/e2e/statics.spec.ts#the player's lasers destroy the nav buoy and it leaves the scanner"
        status: pass
    human_judgment: false
  - id: D2
    description: "A traffic-on start requests /assets/ships-static-hulls-*.js exactly once before the first in-flight frame; a traffic-off start never requests it"
    requirement: DATA-15
    verification:
      - kind: e2e
        ref: "tests/e2e/statics.spec.ts#a traffic-on start requests the static-hull chunk once before the first in-flight frame"
        status: pass
      - kind: e2e
        ref: "tests/e2e/statics.spec.ts#a traffic-off start never requests the static-hull chunk"
        status: pass
    human_judgment: false
  - id: D3
    description: "An aborted static-hull chunk ends the traffic-on boot on the #failure surface with a reason; the probe is not ready, in menu mode, with a non-empty error"
    requirement: DATA-15
    verification:
      - kind: e2e
        ref: "tests/e2e/statics.spec.ts#an aborted static-hull chunk ends the traffic-on boot on the failure surface"
        status: pass
    human_judgment: false
  - id: D4
    description: "Ident (R) locks the Coriolis station from 5,000 m on its dock axis in a traffic-on session"
    requirement: CBT-17
    verification:
      - kind: e2e
        ref: "tests/e2e/statics.spec.ts#ident locks the Coriolis station in a traffic-on session"
        status: pass
    human_judgment: false

duration: 16min
completed: 2026-11-20
status: complete
---

# Phase 18 Plan 22: The statics in a traffic-on browser session Summary

**A new spec, `tests/e2e/statics.spec.ts`, gives the phase its browser-level proof in a traffic-on session. The player's laser destroys the Lave nav buoy, which leaves the scanner after 960 to 1,080 manual ticks of fire. Ident locks the Coriolis station. The `ships-static-hulls-DYtUl-Fn.js` chunk loads once with traffic on and never with traffic off, and an aborted chunk ends the boot on `#failure`. No existing spec, probe field or test hook was changed.**

## Performance

- **Duration:** 16 min
- **Started:** 2026-11-20T12:34:21Z
- **Completed:** 2026-11-20T12:50Z
- **Tasks:** 2 of 2
- **Files:** 1 created (the spec), plus the phase's `deferred-items.md` entry

## Accomplishments

- **Destroyed buoy leaves the scanner (Task 1, tracer).**
  - Setup: boot `/?test=1&traffic=1&clock=manual`, start a new game, launch and fly the 300-tick handover. The spec then checks plan 18-07's Lave literals against `probe.world` (within 1 m) and parks the player 2,000 m from the nav buoy on the buoy-to-station line, at rest, facing the buoy's centre. The orientation is `quatFromUnitVectors((0,0,-1), dir)`.
  - Firing: the spec asserts `navBuoy` is in `hud.contacts`, holds `KeyA` and advances 120-tick chunks until the contact drops or the bound passes.
  - The bound is `2 x ceil((250 + 200) / 15) x 61` = 3,660 ticks.
  - The drop is the only destruction signal, and the spec header records that limitation (review L905).
- **Load path (Task 2).**
  - Traffic on: exactly one `/assets/ships-static-hulls-*.js` request before the first in-flight frame. The vacuity guard is exactly one `ships-hulls-*.js` request.
  - Traffic off: no such request. The vacuity guard is that the `cobra3.glb` request was logged.
- **Load failure (Task 2).** `page.route` aborts the static chunk. The boot ends on `#failure` (`role="alert"`, non-empty text, `#view` hidden). The probe shows `ready: false`, mode `menu` and a non-empty `error`, and exactly one chunk request was aborted.
- **Ident (Task 2).** The player is parked 5,000 m from the station on its dock axis, facing its centre. The spec asserts no lock before the key. After `KeyR`, the HUD shows "Ident system locked onto Coriolis Station." and `combat.identLocked` is true.

## Measured values

| Item | Value |
|------|-------|
| Ticks of fire until `navBuoy` left the scanner | 960 < t <= 1,080 (the 9th 120-tick chunk), identical in all 4 remote runs |
| Static chunk filename (browser-test bundle) | `/assets/ships-static-hulls-DYtUl-Fn.js` (build output: 205.62 kB, gzip 9.48 kB) |

The kill fits about 18 pulses, which matches hull hits alone: `15n - 2 x 61n/120 >= 250` gives n = 18, and the 18th pulse lands near tick 1,038. From this pose the beam did not reach the subentity first, so sticky routing did not engage. The bound already covers the routed case (30+ hits).

## Remote runs (committed HEAD)

| Run | snapshot | Result | exit | elapsed |
|-----|----------|--------|------|---------|
| Task 1 spec (`npm run build:e2e && npx playwright test tests/e2e/statics.spec.ts --reporter=list`) | fb72c9f | 1 passed | exit=0 | elapsed=10s |
| Task 2 spec, run 1 | 6bae6ac | 5 passed | exit=0 | elapsed=17s |
| Task 2 spec, run 2 (flakiness) | 6bae6ac | 5 passed | exit=0 | elapsed=17s |
| Task 2 spec, run 3 (flakiness) | 6bae6ac | 5 passed | exit=0 | elapsed=17s |
| `run --rm verify` | 6bae6ac | 1 failed / 6,975 passed: `dist-check.test.ts` ENOENT race, unrelated (see Issues) | exit=1 | elapsed=115s |
| `run --rm verify` (rerun) | 6bae6ac | 257 files, 6,976 passed, 10 skipped; e2e smoke 27 passed | exit=0 | elapsed=194s |

Flakiness: 3 of 3 runs at `6bae6ac` passed all 5 tests, plus the Task 1 run. The kill-tick window and the chunk name were the same in every run. Local Docker: `lint` exit 0 (eslint clean, Prettier clean) and `typecheck` exit 0 after each task.

## Task Commits

1. **Task 1: the player shoots the nav buoy until it leaves the scanner (tracer).** `fb72c9f` (test). Tracer gate: auto mode is on, and the `<verify>` passed at `fb72c9f` (lint, typecheck, remote 1 passed). Expansion went ahead.
2. **Task 2: the chunk load path, its failure and the station ident.** `6bae6ac` (test).

## Files Created/Modified

- `tests/e2e/statics.spec.ts` (new): five tests and the helpers `launchInto`, `expectLaveLayout`, `park` and `recordRequests`.
- `.planning/phases/18-stations-buoys-and-collisions/deferred-items.md`: the dist-check/purity-guard race (out of scope).

## Decisions Made

See `key-decisions`. None needed the owner.

## Deviations from Plan

**1. [Rule 3 - Acceptance-check wording] The "no existing spec edited" diff also lists `combat.spec.ts`.**
- **Found during:** the Task 1 acceptance re-run.
- **Issue:** `git diff --name-only --diff-filter=M 76229f5 -- tests/e2e` prints `tests/e2e/combat.spec.ts` as well as `hyperspace-failure.spec.ts`. Plans 18-05 (`8b7f54b`) and 18-06 (`f3d04bc`) changed it earlier with owner-approved twin-hash re-pins, before this plan.
- **What this plan touched:** `git diff --name-only f5c8b5b HEAD` (the plan's own range) prints only `tests/e2e/statics.spec.ts`. No existing spec was edited here, which is what the criterion guards. `git diff --quiet 76229f5 -- src/app/probe.ts` exits 0.

**2. [Planner detail] The load-path case is two tests, and both URLs carry `clock=manual`.** Each test gets Playwright's fresh context, so the remote count is 5 passed, not 4. The criterion was "at least 4", and the plan-level text "three passing tests" predates Task 2. The traffic flag alone decides the chunk load.

**Total deviations:** 2. Neither changes scope; no source, probe or existing spec changed.

## Issues Encountered

- The first remote `verify` at `6bae6ac` failed one unit test, `tools/ai-harness/dist-check.test.ts`, with `ENOENT ... 'src/sim/__purity_ban_queue_microtask.ts'`. This is a pre-existing race. The purity guards (`tests/guards/sim-probe.ts`) write and remove probe files under `src/sim`, while the dist-check lists the tree and then reads each file. This plan changed only an e2e spec. The rerun passed (257 of 257 files). The race is logged in `deferred-items.md` for a tooling quick task.

## Known Stubs

None.

## User Setup Required

None.

## Next Phase Readiness

- Plan 18-12's `verify-full` runs this spec with the full Chromium suite after collisions (18-18), PD-06 (18-21) and the blast (18-19). If buoy collisions or blasts reach the parked player, the 2,000 m and 5,000 m poses may need a look. Today nothing is within contact range.
- DATA-15 and CBT-17 stay Pending in REQUIREMENTS.md while sibling plans still declare them.

---
*Phase: 18-stations-buoys-and-collisions*
*Completed: 2026-11-20*

## Self-Check: PASSED

- `tests/e2e/statics.spec.ts` exists. Commits `fb72c9f` and `6bae6ac` are ancestors of HEAD, and the measured count is 2 (`f5c8b5b..6bae6ac`).
- Acceptance re-run:
  - `traffic=1`: 2
  - `ships-static-hulls`: 3
  - `identLocked`: 2
  - `#failure`: 2
  - `route`: 4
  - The probe.ts diff against `76229f5` exits 0.
  - The plan's own range touches only the new spec (see deviation 1).
  - The remote run reports 5 passed at `6bae6ac`.
