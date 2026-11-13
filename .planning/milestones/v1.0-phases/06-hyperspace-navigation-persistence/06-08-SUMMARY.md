---
phase: 06-hyperspace-navigation-persistence
plan: 08
subsystem: sim
tags: [hyperspace, countdown, docking, docking-computer, flight-step, gap-closure]

# Dependency graph
requires:
  - phase: 06-hyperspace-navigation-persistence
    provides: 1800-step countdown, committed hyperspace target snapshot, manual capture and docking-computer transitions (06-01, 06-04)
provides:
  - clearHyperspaceAttempt, the single owner of the countdown/target pair in the flight state
  - Manual capture and the docking computer end a live jump attempt at no fuel or clock cost
  - Countdown tick gated on the live mode as well as the start-of-step mode
  - D-06 amendment row in PROJECT.md with the Oolite source
affects: [06-11, 06-12, verify-work]

# Actuals (#2632) - chars/4 over the realized diff, same scale as the plan estimate
actuals:
  tokens: 3458
  tasks: 3
  commits: 4

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "One owner clears a paired invariant (countdown and target) so no dock path can clear one without the other"
    - "A tick gate checks the mode at both the start of the step and the live mode, so a command-phase transition cannot be followed by the tick"

key-files:
  created: []
  modified:
    - src/sim/flight/state.ts
    - src/sim/dock/step.ts
    - src/sim/dock/computer.ts
    - src/sim/flight/step.ts
    - tests/sim/hyperspace.test.ts
    - tests/sim/dock-computer.test.ts
    - .planning/PROJECT.md

key-decisions:
  - "A dock cancels an active hyperspace countdown at no fuel or clock cost; this amends D-06's 'only the hyperspace key cancels' wording"
  - "clearHyperspaceAttempt in src/sim/flight/state.ts is the one owner of the countdown/target pair; a refused dock, a bounce, a scrape and an ordinary tick leave it alone"
  - "The countdown tick requires modeAtStart === inFlight AND state.mode === inFlight, so a command-phase dock cannot be followed by a commit"

patterns-established:
  - "Paired sim invariants get one clearing helper; callers read any id they need for an event before clearing"

requirements-completed: [NAV-04]  # Copied verbatim from PLAN frontmatter. NAV-04 stays Pending: 06-11 also declares it and closes the same-frame double-press half (G-6); the shared-ID gate blocked mark-complete.

coverage:
  - id: D1
    description: "A computer dock during a live countdown ends the attempt; a relaunch emits no hyperspaceJumped over 1800 steps and advances the clock by about 15 s"
    requirement: "NAV-04"
    verification:
      - kind: unit
        ref: "tests/sim/hyperspace.test.ts#a computer dock ends the attempt: 1800 steps after a relaunch emit no jump"
        status: pass
      - kind: e2e
        ref: "tests/e2e/docking.spec.ts#Shift+C with the computer granted docks instantly with exactly 1200 s"
        status: pass
    human_judgment: false
  - id: D2
    description: "A computer dock on the timer-at-1 tick emits exactly one docked event with a +1200 s clock delta, never hyperspaceJumped"
    requirement: "NAV-04"
    verification:
      - kind: unit
        ref: "tests/sim/hyperspace.test.ts#a computer dock on the timer-at-1 tick emits docked only, with +1200 s"
        status: pass
    human_judgment: false
  - id: D3
    description: "A successful computer dock clears an armed attempt; a refused dock leaves it untouched"
    requirement: "NAV-04"
    verification:
      - kind: unit
        ref: "tests/sim/dock-computer.test.ts#docks on the same tick with exactly +1200 s and no flight-time advance"
        status: pass
      - kind: unit
        ref: "tests/sim/dock-computer.test.ts#leaves an armed attempt untouched when the dock is refused"
        status: pass
    human_judgment: false
  - id: D4
    description: "Manual capture clears an armed attempt through the same owner (threat T-06-23); the hyperspace and docking browser specs stay green"
    requirement: "NAV-04"
    verification:
      - kind: unit
        ref: "tests/sim/hyperspace.test.ts#a manual capture ends an armed attempt through the same owner"
        status: pass
      - kind: e2e
        ref: "tests/e2e/hyperspace.spec.ts#chart target, countdown, abort, refusal, arrival and reload"
        status: pass
      - kind: e2e
        ref: "tests/e2e/docking.spec.ts#an independently derived aligned pose docks through the visible opening"
        status: pass
    human_judgment: false
  - id: D5
    description: "PROJECT.md records the countdown-on-dock amendment to D-06 with the Oolite source, and no other decision row changed"
    requirement: "NAV-04"
    verification:
      - kind: other
        ref: "docker compose run --rm test sh -lc grep for 'Cancel an active hyperspace countdown when the ship docks', 'amends D-06' and 'PlayerEntity.m:3296'"
        status: pass
    human_judgment: false

# Metrics
duration: "approximately 9 min (wall clock; a start timestamp was not captured before the first edit)"
completed: 2026-11-07
status: complete

# Commit ledger (#3968): measured from the persisted base, not narrated
commits: 4
plan_head_before: d79c8090758db934dbb563e09c947eee5fe22f45
plan_head_after: e460955
---

# Phase 6 Plan 08: A dock ends the jump attempt, and a relaunch cannot resume it

**Both dock paths clear the hyperspace countdown and target through one owner, and the countdown tick requires a live `inFlight` mode, so a dock always ends the attempt (gap G-2 closed).**

## Performance

- **Duration:** approximately 9 min (wall clock; first test run at 11:48:52Z, SUMMARY written at about 11:56Z)
- **Started:** approximately 2026-11-07T11:47Z (not captured as an exact stamp)
- **Completed:** 2026-11-07T11:56Z
- **Tasks:** 3 of 3
- **Files modified:** 7

## Accomplishments

- `clearHyperspaceAttempt(state)` in `src/sim/flight/state.ts` is the single function that clears the countdown and target pair. Its doc comment says a caller needing the destination id must read it first.
- The manual capture branch in `src/sim/dock/step.ts` and `dockWithComputer` in `src/sim/dock/computer.ts` both clear the attempt on a successful dock. A refused dock (`dockDenied`) returns before the clear and leaves an armed attempt untouched.
- The `cancelHyperspace` branch and the different-target cancel in `src/sim/flight/step.ts` now use the same owner. Each still names the destination in its event.
- The countdown tick in `src/sim/flight/step.ts` now requires `modeAtStart === "inFlight" && state.mode === "inFlight"` (with `!startedThisStep` kept). A command-phase dock cannot be followed by a commit.
- Regression evidence: before the fix, the new assertions failed. The dock-then-relaunch case left the countdown at 1797. The timer-at-1 case emitted `["docked", "hyperspaceJumped"]`. The successful computer dock left the countdown at 499. After the fix all 51 targeted tests pass, and the full unit suite passes (88 files, 1087 tests; run before the manual-capture case was added, and the targeted suites were re-run after it).
- PROJECT.md gained one Key Decisions row amending D-06, citing `PlayerEntity.m:3296-3297` and `PlayerEntityControls.m:855-864`. The Oolite citations were checked against `/home/opencode/git/oolite`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Own the attempt-clearing invariant and apply it on both dock paths** - `ff038a1` (fix)
2. **Task 2: Add the dock-then-1800-steps and timer-at-1 computer-dock cases** - `20dad48` (test)
3. **Task 3: Record the D-06 amendment** - `1a4d9e1` (docs)
4. **Follow-up to Task 2: pin the manual capture clearing the attempt** - `e460955` (test)

**Plan metadata:** the `docs(06-08)` commit that adds this SUMMARY.md and ROADMAP.md (hash reported in the completion message).

_Note: the RED evidence came before Task 1's fix. The new test cases were written and run against the pre-fix code, then the fix was committed, then the tests were committed. The commit order is fix then test; the RED run is documented above._

## Files Created/Modified

- `src/sim/flight/state.ts` - adds `clearHyperspaceAttempt`, the single owner of the countdown/target pair
- `src/sim/dock/step.ts` - manual capture clears the attempt before returning `docked`
- `src/sim/dock/computer.ts` - `dockWithComputer` clears the attempt after a successful dock, not on a refusal
- `src/sim/flight/step.ts` - cancel and different-target branches use the owner; tick gate requires the live mode
- `tests/sim/hyperspace.test.ts` - dock-then-relaunch 1800-step case and timer-at-1 computer-dock case
- `tests/sim/dock-computer.test.ts` - successful dock clears an armed attempt; refused dock leaves it untouched
- `.planning/PROJECT.md` - one Key Decisions row amending D-06

## Decisions Made

- A dock cancels an active countdown at no fuel or clock cost. This amends D-06's "only the hyperspace key cancels" wording, and the amendment is recorded in PROJECT.md rather than by rewriting `06-CONTEXT.md`.
- `clearHyperspaceAttempt` is the one place both fields are assigned their cleared values. Refusals and the commit still clear the target alone, because the countdown is already 0 at those points.
- The tick gate checks the live mode in addition to `modeAtStart`. This is defence in depth; the command-phase dock already clears the attempt.

## Deviations from Plan

**1. [Plan-consistency - Scope] Different-target cancel in `flight/step.ts` also routed through the owner**
- **Found during:** Task 1
- **Issue:** The plan named only the `cancelHyperspace` branch, but its acceptance criterion says `clearHyperspaceAttempt` is the only function that assigns both fields to their cleared values. The different-target branch (step 1b) also assigned both directly.
- **Fix:** Replaced the two assignments in step 1b with `clearHyperspaceAttempt(state)`, keeping the destination read before the clear.
- **Files modified:** `src/sim/flight/step.ts`
- **Verification:** typecheck, lint, and the existing "cancels the countdown when a different target is committed" case pass.
- **Committed in:** `ff038a1`

**2. [Rule 2 - Missing Critical] Manual-capture unit case added**
- **Found during:** Task 2 (test review against the threat register)
- **Issue:** Threat T-06-23 mitigates manual capture and the plan's acceptance criteria require both dock paths to clear the attempt, but the plan's test list covered only the computer dock. A manual capture with an armed countdown had no unit assertion.
- **Fix:** Added "a manual capture ends an armed attempt through the same owner" to `tests/sim/hyperspace.test.ts`, using the capture pose already used by `tests/sim/dock-transitions.test.ts`.
- **Files modified:** `tests/sim/hyperspace.test.ts`
- **Verification:** the case fails with `expected 899 to be +0` when the clear is removed from `dock/step.ts` (mutation check, file then restored to HEAD); it passes with the fix.
- **Committed in:** `e460955`

**Total deviations:** 2 (one plan-consistency edit, one added test for a mitigated path; no bugs or architectural changes).
**Impact on plan:** None on behaviour. Both changes stay inside files the plan already lists, and neither alters the chosen countdown contract.

## Issues Encountered

- **NAV-04 stays Pending.** The `requirements.mark-complete` step is blocked by the shared-ID gate, which is correct. Plan 06-11 also declares NAV-04 and has no SUMMARY yet. The same-frame double-press half of NAV-04 (gap G-6) is closed by 06-11, not here. Verification of the full requirement belongs to 06-12.
- **STATE.md was already dirty before this run** (listed as an uncommitted change in the run's git status). It was not staged or committed by this plan; see Final commit.
- The verification report's G-2 reproduction ran in a scratch sim. The new unit cases reproduce that path directly, so no scratch script was needed in the repo.

## User Setup Required

None - no external service configuration required.

## Known Stubs

None. The new code paths have no placeholder values or unwired data.

## Threat Flags

None. The change tightens the countdown lifecycle inside the sim and adds no endpoint, auth path, file access, or schema change.

## Next Phase Readiness

- G-2 is closed: a dock ends the attempt, a relaunch cannot resume it, and the commit-tick computer dock emits only `docked`.
- G-1 (arrival and restore latch) belongs to 06-07, already committed. G-3 and the other warnings belong to 06-09 to 06-11.
- NAV-04 needs 06-11 (G-6 same-frame double press) before the requirement can be marked complete.

## Self-Check: PASSED

- Files: all seven modified files exist on disk.
- Commits: `ff038a1`, `20dad48`, `1a4d9e1`, and `e460955` are ancestors of HEAD.
- `clearHyperspaceAttempt` is referenced at all four call sites (state.ts definition, dock/step.ts, dock/computer.ts, flight/step.ts).
- Gates run in Docker: `typecheck` exit 0; `lint` (eslint and prettier) pass; targeted `tests/sim/hyperspace.test.ts`, `tests/sim/dock-computer.test.ts`, `tests/sim/dock-transitions.test.ts` pass (51 tests, re-run after the manual-capture case); lint re-run after that case passes; full unit suite `docker compose run --rm test` passes (88 files, 1087 tests); browser `tests/e2e/hyperspace.spec.ts` and `tests/e2e/docking.spec.ts` pass (8 tests, exit 0); PROJECT.md grep gate passes.

---
*Phase: 06-hyperspace-navigation-persistence*
*Completed: 2026-11-07*
