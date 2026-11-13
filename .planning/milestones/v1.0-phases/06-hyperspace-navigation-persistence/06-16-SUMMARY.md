---
phase: 06-hyperspace-navigation-persistence
plan: 16
subsystem: hyperspace
tags: [hyperspace, blockage, coriolis, oolite-parity, witchspace, gap-closure]

# Dependency graph
requires:
  - phase: 06-hyperspace-navigation-persistence
    provides: fixed-step countdown, completion branch, refusal events and probe.hyperspace.lastRefusal
provides:
  - witchspaceBlockedAt / isWitchspaceBlocked: Oolite's strict mass-blockage predicate with the scanner-range boundary
  - witchspaceStationMass(kind): the recorded Coriolis mass (455,223,200), undefined for every other station kind
  - hyperspace.stationMass read-only step fact, checked at countdown completion only
  - hyperspaceRefused with reason blocked, which clears the countdown and target and spends no fuel or jump time
affects: [hyperspace countdown, refusal copy, probe lastRefusal, NAV-04 verification]

# Actuals (#2632)
actuals:
  tokens: 8962
  tasks: 3
  commits: 5

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Blockage evaluated once at countdown completion, never at the H press or during the countdown (Oolite checklist guard, PlayerEntity.m line 6547)"
    - "Per-step read-only station-mass fact supplied by the app only for station kinds with a recorded mass"

key-files:
  created:
    - tests/sim/hyperspace-blockage.test.ts
  modified:
    - src/sim/hyperspace/countdown.ts
    - src/sim/flight/step.ts
    - src/app/game-session.ts
    - src/app/probe.ts
    - tests/e2e/hyperspace.spec.ts
    - tests/e2e/autosave.spec.ts
    - .planning/PROJECT.md
    - .planning/phases/06-hyperspace-navigation-persistence/06-CONTEXT.md

key-decisions:
  - "The Coriolis mass 455,223,200 is a recorded constant with its citation (ShipEntity.m line 12504), not a vendored config value: shipdata.plist has no mass key, and Oolite computes mass at runtime from density and octree volume"
  - "The predicate takes no docked parameter: a docked ship never reaches completion because a dock cancels the countdown, and a docked begin is inert"
  - "The begin is never refused for blockage, so a ship beside the station can start a countdown and fly out during it, as Oolite allows"
  - "The navigation buoy is non-blocking for lack of recorded data (density defaults to 1.0; octree volume needs the unvendored model oolite_buoy.dat). The 224 dodecahedron and icosahedron systems are non-blocking by owner decision 2026-11-07, option (a)"
  - "PROJECT.md row 136 is marked superseded and keeps its Decision and Rationale cells; the Coriolis blockage row sits directly beneath it"

patterns-established:
  - "A blocked completion is a refusal, not a jump: the ordinary per-step time advances, and no fuel or jump time is applied"

requirements-completed: [NAV-04]

# Metrics
duration: not recorded (start timestamp was not captured)
completed: 2026-11-07
status: complete
---

# Phase 6 Plan 16: Coriolis Mass Blockage at Countdown Completion Summary

**A witchspace countdown that completes within Oolite's blockage radius (about 6,747 m) of a Coriolis station is refused as blocked, with no fuel spent and no jump time added; a begin beside the station is never refused and a ship can fly out during the countdown**

## Performance

- **Duration:** not recorded
- **Started:** not recorded
- **Completed:** 2026-11-07
- **Tasks:** 3 planned (5 commits, including one copy fix and one docs split)
- **Files modified:** 9 (plus one new test file)

## Accomplishments

- `countdown.ts` gains `WITCH_BLOCK_K = 0.1`, `CORIOLIS_STATION_MASS = 455_223_200`, `witchspaceStationMass(kind)` (Coriolis only), `isWitchspaceBlocked` (strict mass threshold and strict scanner-range boundary), and `witchspaceBlockedAt` (position form, no docked parameter). The `HyperspaceRefusal` union gains `blocked`.
- `step.ts` gains the optional `hyperspace.stationMass` fact. The check runs in the countdown completion branch before the route and fuel validation. On a blocked completion it emits `hyperspaceRefused` with reason `blocked`, clears the target, and leaves the countdown at 0. It sets no terminal transition, so the ordinary step time advances as for any refusal. The begin case gains a comment and no logic change.
- `game-session.ts` supplies `stationMass` per step only when `system.station` is `coriolis`, and maps `blocked` to the Witchspace jump aborted copy. `probe.ts` widens the `lastRefusal` reason union.
- Unit file `tests/sim/hyperspace-blockage.test.ts` (9 cases): mass mapping, strict threshold on both sides, exact scanner boundary with a synthetic mass, 6,700 m blocked and 6,800 m not blocked, docked begin inert, begin at 6,700 m not refused, completion at 6,700 m refused as blocked with no jump and no target, leave-before-completion commits, and the default path unchanged without a station mass.
- Browser: the two committed Diso jumps in `hyperspace.spec.ts` and the arrival in `autosave.spec.ts` fly clear with real `KeyW` input (the bound `speedUp` action) to 7,500 m from the recorded docked pose before the commit. No test hook is used in either edited case. A new case launches with no throttle, presses H, and expects `lastRefusal` reason `blocked`, `lastJump` null, fuel unchanged, the countdown at 0, the ship within 6,000 m of the dock, and the HUD line.
- Documentation: PROJECT.md row 136's Outcome is marked superseded (Decision and Rationale kept), and the Coriolis blockage row sits directly beneath it, naming the buoy and the 224-system data gaps. CONTEXT.md D-07 carries the amendment.

## Task Commits

1. **Task 1: sim, app copy and probe, unit file** - `86e1988` (feat)
2. **Task 2 docs split: PROJECT.md row and CONTEXT D-07 (plan hunks only)** - `c75948f` (docs)
3. **Copy fix for the HUD line** - `bb99f0b` (fix)
4. **Task 2: browser fly-away and blocked case** - `1024dcc` (test)
5. **Task 3: autosave arrival fly-away** - `790e69a` (test)

**Plan metadata:** `docs(06-16): complete the Coriolis blockage plan` (this SUMMARY only)

## Files Created/Modified

- `src/sim/hyperspace/countdown.ts` - blocked reason, Coriolis mass constant with citation, station-kind lookup, blockage predicates
- `src/sim/flight/step.ts` - `StepOptions.hyperspace.stationMass` and the completion-time blockage branch
- `src/app/game-session.ts` - per-step Coriolis station mass fact, and the blocked refusal copy
- `src/app/probe.ts` - `lastRefusal` reason union includes `blocked`
- `tests/sim/hyperspace-blockage.test.ts` (new) - the unit boundaries and completion path
- `tests/e2e/hyperspace.spec.ts` - throttle fly-away before the Diso commit, and the blocked browser case
- `tests/e2e/autosave.spec.ts` - throttle fly-away before the arrival commit
- `.planning/PROJECT.md` - row 136 superseded marker and the Coriolis blockage row beneath it
- `.planning/phases/06-hyperspace-navigation-persistence/06-CONTEXT.md` - D-07 amendment

## Decisions Made

- The Coriolis mass is recorded from the Oolite source comment, because no vendored config carries a mass value. The citation is ShipEntity.m line 12504.
- The buoy and the dodecahedron and icosahedron kinds are non-blocking. The buoy is a data gap (no octree volume). The 224 systems follow owner decision 2026-11-07, option (a).
- No H-press check is added. Oolite checks the blockage only at countdown completion, so the begin never consults it.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The blocked copy was wider than the HUD message line**
- **Found during:** first browser run of the blocked case
- **Issue:** The plan's copy "Witchspace jump aborted (too close to Coriolis Station)." is 56 characters. The HUD clamps every message to `MAX_MESSAGE_CHARS = 54` with an ellipsis (`src/render/hud/format.ts`, `src/app/hud-model.ts`). The displayed line would have cut the station name, and the probe check for the full string could never pass.
- **Fix:** The copy is now "Witchspace jump aborted: too close to Coriolis Station" (54 characters). It keeps the required wording and the station name, and the browser assertion checks the full string.
- **Files modified:** `src/app/game-session.ts`
- **Commit:** `bb99f0b`

### Timing Adjustments (for orchestrator review)

**2. [Rule 3 - Blocking] The fly-away wait and the per-test budgets were too short for the measured sim rate**
- **Found during:** first browser run (`hyperspace.spec.ts` failed at the fly-away wait after 90 s)
- **Measured:** under headless SwiftShader the sim advanced 10.5 simulated seconds in 44 wall seconds with the throttle held (about 0.24 of real time), and about 0.15 when two workers ran. The plan's 21 s of simulated throttle therefore takes roughly 90 to 130 s of wall time.
- **Change:** the fly-away wait is 240 s in both specs, and the file budget is 600 s in `hyperspace.spec.ts` and `autosave.spec.ts` (was 360 s). Only waits and budgets changed. No `expect` was edited or retried.
- **Commits:** `1024dcc`, `790e69a`
- **Decision for the orchestrator:** if the 360 s budget must hold, the fly-away needs a different mechanism. The plan's numbers do not fit this environment as written.

**3. [Plan text] Countdown completion wait**
- The plan asked for the countdown to return to 0 within 30 s. The completion wait is 180 s, the same bound the existing commit wait uses for the same 15 s countdown, because the countdown runs at the same measured sim rate. The 30 s wait for the countdown to start is unchanged.

**4. [Test expectation] Unit cases adjusted to the real event set**
- At 6,700 m the begin also emits `massLockChanged`, which is existing J-drive behaviour and is unrelated to this plan. The begin case therefore asserts that `hyperspaceCountdownStarted` is present and `hyperspaceRefused` is absent, and does not assert an exact event list.
- The clock delta across the 1,800 steps is 14.9963 s, not 15.0000 s. The clock is float64 near 1.8e11 s, so the case uses `toBeCloseTo(15, 1)` and a bound below 100 s, which still excludes the 46,656 s jump time.

### Shared-tree staging (not a code deviation)

PROJECT.md and 06-CONTEXT.md had uncommitted orchestrator hunks when the plan started (the superseded outcomes on rows 129 and 137, the D-06 line, and similar). Commit `c75948f` contains only this plan's hunks. It was built by writing the `HEAD` version with the new row and the D-07 note into the index as blobs. The orchestrator hunks remain uncommitted in the working tree, and `git show --stat c75948f` reports 3 insertions and 2 deletions across the two files.

Total deviations: 4 (1 Rule 1 fix, 1 Rule 3 timing adjustment, 2 plan-text or test-expectation adjustments). The timing adjustment is flagged for review (item 2).

## Issues Encountered

- The first browser run of `hyperspace.spec.ts` had two failures, both explained above (items 1 and 2). Its log is preserved in the test output for this run, not in the repo.
- A diagnostic spec was run from a scratch directory outside the repo to measure the sim rate and the HUD message path. It was not committed.

## Verification

Docker only, in the container:

| Command | Result |
|---|---|
| `docker compose run --rm test npx vitest run tests/sim/hyperspace-blockage.test.ts` | 9 passed |
| `docker compose run --rm test npx vitest run tests/sim/hyperspace.test.ts tests/sim/mass-lock.test.ts` | 51 passed, no existing case edited |
| `docker compose run --rm typecheck` | exit 0 |
| `docker compose run --rm lint` | exit 0 (eslint and prettier --check) |
| `docker compose run --rm test` (full suite) | exit 0, 90 files and 1,132 tests passed |
| `docker compose run --rm e2e sh -lc "npm run build && npx playwright test tests/e2e/hyperspace.spec.ts"` | exit 0, 3 passed (the chart/countdown/arrival case, the chart arrow case, and the blocked case) |
| `docker compose run --rm e2e sh -lc "npm run build && npx playwright test tests/e2e/autosave.spec.ts"` | exit 0, 19 passed (the trigger matrix passes in 3.4 min) |

The full `docker compose run --rm verify` is the phase gate and was not run per plan.

Grep acceptance (after the change):
- `CORIOLIS_STATION_MASS` in countdown.ts: 2 (baseline 0)
- `| "blocked"` in countdown.ts: 1 (baseline 0)
- `stationMass` in step.ts: 4 (baseline 0)
- `witchspaceBlockedAt` in step.ts: 2 (baseline 0)
- `witchspaceStationMass` and `Witchspace jump aborted` in game-session.ts: at least 1 each (baseline 0)
- `"blocked"` in probe.ts: at least 1 (baseline 0)
- `ship = "buoy"` in shiplibrary.plist: 1, unchanged
- `keyboard.down("KeyW")` in hyperspace.spec.ts: 1 (baseline 0)
- `setSpeed` or `setPosition` in hyperspace.spec.ts: 0
- Superseded marker in PROJECT.md: 1 (baseline 0), with the Rationale cell of row 136 unchanged
- D-07 amendment in CONTEXT.md: 1 (baseline 0)

Oolite citations spot-checked against `/home/opencode/git/oolite`: ShipEntity.m lines 12504 (mass comment), 12511 (`k = 0.1`), 12520 (loop over every ship except self), 12527 to 12528 (docked-player clause and the strict comparisons); PlayerEntity.m lines 6547 (countdown-status guard), 6557 (`blocked` failure) and 6772 to 6775 (`enterWitchspace` calling the checklist).

Data check: the generated systems contain 1,824 `coriolis`, 167 `dodecahedron` and 57 `icosahedron` station kinds (224 non-Coriolis), matching the PROJECT.md row.

## Self-Check: PASSED

- Commits `86e1988`, `c75948f`, `bb99f0b`, `1024dcc` and `790e69a` exist on `main`.
- Files listed above carry the stated changes, and the new unit file exists.
- Unit, typecheck, lint, and both browser specs pass in the container (see Verification).

## Known Stubs

None.

## Threat Flags

None. The station mass is a read-only fact derived from the loaded system record (T-06-45 mitigated). No new network endpoint, auth path, file access or save-format change was introduced.

## Next Phase Readiness

- NAV-04 gains the completion-time Coriolis blockage. The re-verifier should check the blocked case in `06-VERIFICATION.md`.
- STATE.md and ROADMAP.md were not updated by this executor, because the orchestrator owns those files in this sequential run.
- Open for the orchestrator: the fly-away timing adjustment (item 2 above) and the copy change (item 1).
