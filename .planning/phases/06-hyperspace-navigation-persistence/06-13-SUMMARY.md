---
phase: 06-hyperspace-navigation-persistence
plan: 13
subsystem: sim
tags: [hyperspace, countdown, docking, docking-computer, flight-step, same-frame, gap-closure]

# Dependency graph
requires:
  - phase: 06-hyperspace-navigation-persistence
    provides: 1800-step countdown, begin/cancel command drain, clearHyperspaceAttempt as the single owner of the countdown/target pair (06-01, 06-04, 06-08)
provides:
  - The hyperspace begin case in stepFlight also requires the live state.mode to be inFlight
  - Unit regression for a dock and a begin drained in the same frame (no countdown while docked, no jump after a relaunch)
  - Unit controls for the reverse drain order and for a refused same-frame dock
affects: [06-VERIFICATION re-run, NAV-04 human ratification of the D-06 amendment, 06-04 truth 3 evidence]

# Actuals (#2632) - chars/4 over the realized diff, same scale as the plan estimate
actuals:
  tokens: 1393
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Command-drain gates check both the start-of-step mode and the live state.mode when an earlier command in the same drain can end the flight"

key-files:
  created: []
  modified:
    - src/sim/flight/step.ts
    - tests/sim/hyperspace.test.ts

key-decisions:
  - "The begin gate is one extra live-mode condition; the dock owner, the countdown tick gate and the drain order are unchanged. This implements the amended D-06 row in PROJECT.md (Cancel an active hyperspace countdown when the ship docks) and does not change that row."
  - "A refused dock leaves the mode inFlight, so a begin drained after it still starts. The live-mode gate blocks only a begin that follows a dock which actually happened."

patterns-established:
  - "A start-of-step mode gate alone is not enough when a same-frame command can change the mode mid-drain: pair it with the live mode."

requirements-completed: [NAV-04]

# Metrics
duration: approx. 10min (plan start time was not recorded; estimated from the first container timestamp)
completed: 2026-11-07
status: complete
---

# Phase 6 Plan 13: Same-frame dock then H gap closure (G-2 residual) Summary

**The hyperspace begin is inert once a same-frame computer dock has ended the flight, so a relaunch can no longer commit a jump the player did not restart.**

## Performance

- **Duration:** approx. 10 min (estimate; the plan start time was not recorded)
- **Started:** not recorded
- **Completed:** 2026-11-07
- **Tasks:** 2 completed
- **Files modified:** 2

## Accomplishments

- Reproduced the defect in the unit suite first: the new same-frame case failed with an extra `hyperspaceCountdownStarted` event after `[dockingComputer, beginHyperspace]` drained in one frame (RED).
- Added the live `state.mode !== "inFlight"` condition to the `beginHyperspace` case in `stepFlight`. The case now starts a countdown only when both the start-of-step mode and the live mode are `inFlight` (GREEN).
- Pinned the reverse drain order (`[beginHyperspace, dockingComputer]`): the first frame emits `hyperspaceCountdownStarted` then `docked`, the countdown ends at 0, and no jump follows a relaunch.
- Pinned the refused-dock control: with no computer fitted, `[dockingComputer, beginHyperspace]` still emits `dockDenied` (notInstalled) and starts a countdown of exactly `HYPERSPACE_COUNTDOWN_STEPS`, and the mode stays `inFlight`.
- Left the dock owner (`dockWithComputer`, `clearHyperspaceAttempt`), the countdown tick gate, the launch/skipLaunch/dockingComputer gates and the drain order unchanged.

## Task Commits

Each task was committed atomically. Commits were made on `main` in the main working tree (sequential execution; `.planning/config.json` sets `git.allow_default_branch_commits: true`).

1. **Task 1: End-to-end same-frame dock then begin: the drained pair starts no countdown and cannot commit after a relaunch** - `413b992` (fix)
2. **Task 2: Pin the same-frame controls: reverse drain order and a refused dock still lets a begin start** - `9592a44` (test)

**Plan metadata:** recorded in the docs commit that adds this SUMMARY.md (see the completion report).

## Files Created/Modified

- `src/sim/flight/step.ts` - The `beginHyperspace` case guard is now `modeAtStart !== "inFlight" || state.mode !== "inFlight"`, with a comment naming the amended D-06 rule. Diff: 5 insertions, 1 deletion.
- `tests/sim/hyperspace.test.ts` - Three cases in the `fixed-step hyperspace countdown` block, all named with "same-frame": the regression "a same-frame dock then begin starts no countdown, and no jump follows a relaunch", the reverse-order control, and the refused-dock control.

## Decisions Made

- The fix is one condition in one command case, with no change to the dock owner or the tick gate. This implements the amended D-06 row ("Cancel an active hyperspace countdown when the ship docks") and does not change that row. Ratification of that row remains a human item in 06-VERIFICATION.
- A refused dock is not a dock: the live-mode gate must not block a begin that follows a refused dock. Control C2 pins this, so the gate does not over-block (threat T-06-40).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Prettier line wrap in the new regression case**
- **Found during:** Task 2 (the `docker compose run --rm lint` gate after the controls were added)
- **Issue:** `tests/sim/hyperspace.test.ts` failed `prettier --check`. The regression case's one-line `expect(frame).toEqual([...])` exceeded the configured print width. ESLint passed. The failure was formatting only and blocked the lint gate.
- **Fix:** Ran `npx prettier --write tests/sim/hyperspace.test.ts` inside the lint container. The only change is one wrapped `expect(...)` call; no assertion changed.
- **Files modified:** `tests/sim/hyperspace.test.ts`
- **Verification:** `docker compose run --rm lint` exits 0 ("All matched files use Prettier code style!"). Unit suite re-run on the formatted file: 1113 of 1113 passed.
- **Committed in:** `9592a44` (the Task 2 test commit; the formatting change was made before that commit and is part of it)

**Total deviations:** 1 auto-fixed (Rule 3, formatting only). **Impact on plan:** None on behaviour; the sim change and the assertions are exactly as planned.

## Issues Encountered

- The RED run failed on the first event assertion (an extra `hyperspaceCountdownStarted` after the dock), before the countdown assertion was reached. The plan's stated RED signature (countdown 1800 while docked) is therefore implied by this failure, not directly printed by it. Confirmed after the GREEN change: the countdown assertions in the same case pass.
- No auth gates, no checkpoints, no deferred items.

## Test Results (container only)

| Command | Result |
| --- | --- |
| `docker compose run --rm test npx vitest run tests/sim/hyperspace.test.ts -t "same-frame"` (RED, before the gate) | exit 1; "a same-frame dock then begin starts no countdown" failed: received extra `hyperspaceCountdownStarted` |
| same command after the gate change (GREEN) | exit 0; 1 passed |
| `docker compose run --rm test npx vitest run tests/sim/hyperspace.test.ts tests/sim/dock-computer.test.ts` | exit 0; 2 files, 50 tests passed |
| `docker compose run --rm test npx vitest run tests/sim/hyperspace.test.ts -t "same-frame"` (after controls) | exit 0; 3 passed |
| `docker compose run --rm test` (full unit suite, before the Prettier fix) | exit 0; 89 of 89 files, 1113 of 1113 tests passed |
| `docker compose run --rm typecheck` (`tsc` for `tsconfig.json` and `tsconfig.sim.json`) | exit 0 |
| `docker compose run --rm lint` (first run) | exit 1; Prettier flagged `tests/sim/hyperspace.test.ts` (fixed, see deviation 1) |
| `docker compose run --rm lint` (after Prettier fix) | exit 0 |
| `docker compose run --rm test` (full unit suite, final file state) | exit 0; 89 of 89 files, 1113 of 1113 tests passed |

The browser (Playwright) suite and `docker compose run --rm verify` were not run for this plan. The plan states that the change is in the pure sim and the browser specs exercise only the sequential path, which the unit suite covers. The full gate is the verifier's to re-run.

Grep acceptance (plan baselines at HEAD `6ba8b19`):

- live-mode check in the `beginHyperspace` case: 0 to 1
- `modeAtStart !== "inFlight"` gates in `step.ts`: 2 to 2 (unchanged)
- `a same-frame dock then begin` in the test file: 0 to 1
- `same-frame` test names: 0 to 3
- `git diff --stat 6ba8b19 HEAD -- src/`: only `src/sim/flight/step.ts`

## Known Stubs

None.

## Threat Flags

None. The change narrows an existing command gate; it adds no new endpoint, auth path, file access or schema.

## Self-Check: PASSED

- Files exist: `src/sim/flight/step.ts`, `tests/sim/hyperspace.test.ts`.
- Commits exist and are ancestors of HEAD: `413b992`, `9592a44`.

## Next Phase Readiness

- The sim-level NAV-04 same-frame defect has a unit regression. The verifier should re-run the same-frame scratch reproduction (or accept this unit case) and update the NAV-04 row and the 06-04 truth 3 evidence.
- Still open and out of scope for this plan: W-1 / G-7 (`enterSystemById` scene switch before the layout check), the D-06 ratification human item, and the NAV-05 and SAVE-03 human items in 06-VERIFICATION.md.
