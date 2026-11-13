---
phase: 06-hyperspace-navigation-persistence
plan: 07
subsystem: sim
tags: [hyperspace, docking, dock-latch, arrival, save-restore, regression, playwright, vitest]

# Dependency graph
requires:
  - phase: 06-hyperspace-navigation-persistence
    provides: witchpoint arrival pose (06-01), save v2 in-flight snapshot and restore (06-02), arrival autosave and reload proof (06-04, 06-06)
provides:
  - dock clearance latch armed on witchpoint arrival and on in-flight restore (closes gap G-1)
  - every-route stepped regression over all 1,750 directed in-range galaxy-0 routes (zero displacement, zero events)
  - restored in-flight pose survives the first fixed docking tick, proven through the real writer and reader
  - browser reload proof that samples the live pose only after a resumed fixed step
affects: [06-verification re-run, phase 6 gap-closure waves, 06-08 onward]

# Actuals (#2632) - same estimateTokens scale (chars/4 over the realized diff)
actuals:
  tokens: 3578
  tasks: 3
  commits: 3

# Measured at SUMMARY write from the plan-start ledger (#3968)
commits: 3
plan_head_before: 4c0b329bf0abb6d20641cc3431028a54504c4977
plan_head_after: 7df89ef1035da8e5cd081e33b4f0a3681272bfa7

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Stepped every-route regression: one zero-dt docking tick per directed route, population asserted before the loop"
    - "Float64 clock-rounding bound for live-pose comparisons: per-step grid error times step count times speed"

key-files:
  created: []
  modified:
    - src/sim/hyperspace/arrival.ts
    - src/persistence/autosave.ts
    - tests/sim/hyperspace-arrival.test.ts
    - tests/persistence/autosave.test.ts
    - tests/e2e/hyperspace.spec.ts

key-decisions:
  - "dockArmed is true on witchpoint arrival and on in-flight restore: the saved pose lies outside the station corridor, so the disarmed tunnel-end clamp (a departure unstick) must never act on it."
  - "The tunnel-end clamp in stepDocking is unchanged; only the two producers that wrongly disarmed the latch changed."
  - "The reload proof's live-pose tolerance is the per-step clock-rounding bound, not a relative 1e-6 bound, because the clock is a float64 near 1.8e11 s (see Deviations)."

patterns-established:
  - "Route populations are asserted before a stepped loop so a content or distance-rule drift cannot shrink the regression silently."

requirements-completed: [NAV-05, SAVE-03]

coverage:
  - id: D1
    description: "Witchpoint arrival and in-flight restore leave the dock latch armed; the first stepped docking tick is stationary on every directed in-range galaxy-0 route"
    requirement: "NAV-05"
    verification:
      - kind: unit
        ref: "tests/sim/hyperspace-arrival.test.ts#arrival is stationary on every directed route > leaves every in-range galaxy-0 route undisplaced by one stepped docking tick"
        status: pass
    human_judgment: false
  - id: D2
    description: "A restored in-flight pose, written and parsed through the game's own save path, survives the first fixed docking tick with no events"
    requirement: "SAVE-03"
    verification:
      - kind: unit
        ref: "tests/persistence/autosave.test.ts#docked and in-flight round trips > keeps a restored witchpoint arrival still through the first docking step"
        status: pass
    human_judgment: false
  - id: D3
    description: "The browser reload proof samples the live pose only after a resumed fixed step and passes with the clock-rounding bound"
    requirement: "SAVE-03"
    verification:
      - kind: e2e
        ref: "tests/e2e/hyperspace.spec.ts#chart target, countdown, abort, refusal, arrival and reload"
        status: pass
    human_judgment: false
  - id: D4
    description: "Arrival offset distribution: the deterministic FNV-1a pose replaces Oolite's random offset draw"
    requirement: "NAV-05"
    verification: []
    human_judgment: true
    rationale: "The plan flags NAV-05 as unresolved. The deterministic hash and the zero-displacement contract are the chosen behaviour, and the exact Oolite offset distribution is intentionally not reproduced. A reviewer must accept this fidelity choice."

# Metrics
duration: "~23min (estimated; plan start was not timestamped)"
completed: 2026-11-07
status: complete
---

# Phase 6 Plan 07: Arm the Dock Latch on Arrival and Restore Summary

**Witchpoint arrival and in-flight restore arm the dock latch, so the first stepped docking tick no longer snaps the ship on any of the 1,750 directed galaxy-0 routes (gap G-1 closed).**

## Performance

- **Duration:** ~23 min (estimated; the executor did not record a plan-start timestamp)
- **Started:** approximately 2026-11-07T11:24Z (estimated from the first test run)
- **Completed:** 2026-11-07T11:47Z
- **Tasks:** 3 of 3
- **Files modified:** 5

## Accomplishments

- Witchpoint arrival (`applyWitchpointArrival`) sets `dockArmed = true`. The witchpoint lies outside the station corridor, so the latch is armed exactly as a fresh state and a cleared launch hand-over are.
- In-flight restore (`restoreFromSave`) sets `dockArmed = true` for the same reason, and its doc comment states it.
- Every-route regression: all 1,750 directed in-range galaxy-0 routes survive one `stepDocking(..., 0)` tick with an empty event array, deep-equal position and orientation, and `dockArmed` still true. The Lave to Diso route is in the set.
- Restore regression: a real witchpoint arrival is written and parsed through `snapshotForSave`, `queueAutosave`, `parseSave` and `restoreFromSave`, then stepped once with zero dt. Nothing moves and nothing is emitted.
- Browser reload proof: the live pose is read only after the probe clock passes the saved clock, and `elapsed > 0` is required. A resumed teleport now fails the comparison.
- The tunnel-end clamp in `stepDocking` is unchanged. No jump math or save shape changed.

## Task Commits

Each task was committed atomically on `main`, with the project hooks running and `--no-verify` not used:

1. **Task 1: Arm the dock latch and prove every route with a stepped regression** - `053712c` (fix)
2. **Task 2: Prove a restored in-flight pose survives the first docking step** - `ace104a` (test)
3. **Task 3: Gate the browser reload pose proof on a resumed fixed step** - `7df89ef` (test)

**Plan metadata:** recorded in the docs commit that follows this file (`plan_head_after` above is the head before that commit).

## Files Created/Modified

- `src/sim/hyperspace/arrival.ts` - `dockArmed = true` on arrival, with the invariant in a comment.
- `src/persistence/autosave.ts` - `dockArmed = true` on in-flight restore, and the doc comment updated to match.
- `tests/sim/hyperspace-arrival.test.ts` - checklist expectation flipped to armed; new every-route stepped regression over 1,750 directed routes, with the population asserted first.
- `tests/persistence/autosave.test.ts` - stale `dockArmed` expectation flipped to true; new restored-arrival-survives-one-step round trip.
- `tests/e2e/hyperspace.spec.ts` - resumed-step wait before the live-pose sample; `elapsed > 0`; clock-rounding bound on the live displacement; `DT` imported from `src/sim/time.ts`.

## Decisions Made

- `dockArmed` is armed on both in-flight producers (arrival and restore). The tunnel-end clamp is the deliberate disarmed-departure unstick and is kept as it was; only the two producers that wrongly disarmed the latch changed.
- The reload proof's live-pose tolerance is derived from the clock's representable resolution (see Deviations below).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The plan's live-pose tolerance cannot be met by the clock's float64 representation**
- **Found during:** Task 3 (browser reload proof run, two failing runs)
- **Issue:** The plan asks for `|liveDistance - speed * elapsed| <= max(1, expectedTravel) * 1e-6`. The sim clock is a float64 near 1.8e11 s, whose last representable step is about 3e-5 s. Each resumed `clockSeconds += DT` rounds to that grid, so elapsed time carries up to one grid step of error per fixed step. At 50 m/s that is millimetres to centimetres of apparent travel (residuals of 1.02 mm over 10 steps and 9.66 mm over about 95 steps). A temporary diagnostic showed the position itself exact: the ship moved 4.1666 m over 10 steps, matching `speed * DT * 10`, with orientation unchanged. The fault was the test bound, not the sim.
- **Fix:** The bound is now `speed * steps * (Number.EPSILON * clockMagnitude)` added to the existing relative term, where `steps = round(elapsed / DT)`. This admits exactly the per-step rounding and still fails a 240 km teleport by many orders of magnitude. The temporary diagnostic logging was removed before the commit.
- **Files modified:** `tests/e2e/hyperspace.spec.ts`
- **Verification:** `tests/e2e/hyperspace.spec.ts` passes on the committed state; the autosave and docking browser specs pass as a regression check.
- **Committed in:** `7df89ef`

**Total deviations:** 1 auto-fixed (1 test-bound bug, Rule 1). **Impact:** The gate still proves the resumed step and still fails a teleport. Only the numerical tolerance changed, and the change is explained in the test comment.

Formatting: Prettier re-wrapped the new lines in `tests/e2e/hyperspace.spec.ts` (whitespace only). The file was re-verified after the rewrap.

## Issues Encountered

- **Intermediate commit state:** `053712c` changes the autosave producer while `tests/persistence/autosave.test.ts` still asserts the old `dockArmed` false at its line 668. That single assertion fails at `053712c` alone and is fixed by `ace104a`. The plan made Task 2 the sole owner of that file, so this is the planned ordering, but `053712c` is not green on its own.
- **Pre-fix count not re-measured:** The plan's claim that the pre-fix loop displaces 1,278 of the 1,750 routes was not re-counted in this run. The pre-fix red run did fail the every-route case (`g0-s0>g0-s19` displaced about 15 km in x), so the test does discriminate beyond Lave, but the exact count is unverified here.
- **Plan assumptions flagged:** The plan marks NAV-05 and SAVE-03 as `unresolved` with `flagged: true`. Those judgments are not closed by this plan and are recorded as the D4 human-judgment item in the coverage block.
- **Working tree:** `.planning/STATE.md`, `.planning/config.json`, `.planning/state.json` and untracked review diagnostics were already dirty before this run. They were not staged or committed by this plan. `STATE.md` is updated on disk only (see the final report).

## Verification Results

| Check | Command | Result |
|-------|---------|--------|
| Arrival unit suite | `docker compose run --rm test npx vitest run tests/sim/hyperspace-arrival.test.ts` | 11/11 pass (before the producer change: 2 failed, as intended) |
| Autosave unit suite | `docker compose run --rm test npx vitest run tests/persistence/autosave.test.ts` | 21/21 pass |
| Full unit suite | `docker compose run --rm test` | 88 files, 1084 tests pass |
| Typecheck | `docker compose run --rm typecheck` | exit 0 |
| Lint (eslint and prettier) | `docker compose run --rm lint` | exit 0 |
| Reload proof | `docker compose run --rm e2e sh -lc "npm run build && npx playwright test tests/e2e/hyperspace.spec.ts"` | 1 passed (final, committed state) |
| Restore-sensitive regression | same, `tests/e2e/autosave.spec.ts tests/e2e/docking.spec.ts` | 26 passed |

## Known Stubs

None.

## Threat Flags

None. The change is confined to two latch assignments and test code. It adds no new endpoint, auth path, file access or schema.

## Self-Check: PASSED

- Files exist on disk: `src/sim/hyperspace/arrival.ts`, `src/persistence/autosave.ts`, `tests/sim/hyperspace-arrival.test.ts`, `tests/persistence/autosave.test.ts`, `tests/e2e/hyperspace.spec.ts` (all FOUND).
- Commits exist in history: `053712c`, `ace104a`, `7df89ef` (all FOUND, ordered after `4c0b329`).
- Plan acceptance criteria: the every-route case asserts exactly 1,750 directed pairs and, per route, an empty event array and deep-equal pose; the armed-latch expectation is in both unit files; typecheck and lint are clean; the browser proof passes with the live pose read after `probe.clock` advances.

## Next Phase Readiness

- G-1 is closed for every directed in-range galaxy-0 route in the unit regression, and for the restored pose in both unit and browser proofs.
- The verifier should re-run `06-VERIFICATION` truths 7 and 9 and the reload truth. It should also re-classify NAV-05 and SAVE-03, which the plan flagged as unresolved.
- Remaining gaps from the verification report (G-2 countdown survives docking, G-3 F2 overwrite dialog) are untouched by this plan.

---
*Phase: 06-hyperspace-navigation-persistence*
*Completed: 2026-11-07*
