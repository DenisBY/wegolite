---
phase: 20-player-death-and-game-over
plan: 07
subsystem: app-session
tags: [game-over, overlay, session-wiring, death-flow, changelog]

requires:
  - phase: 20-player-death-and-game-over
    provides: "20-04: createDeathFlow, latchGameOver, the session latch; 20-05: createGameOverOverlay, buildGameOverLines, resolveCulpritName, #game-over markup"
provides:
  - "GameSessionOptions.gameOverRoot, SessionDeps.gameOverRoot and the start-session deps field: the #game-over root travels like the pause root"
  - "SessionRuntime.gameOverOverlay, created with the session and disposed beside the pause overlay"
  - "createDeathFlow shows the four game-over lines in the dispatch that latches the session"
  - "CHANGELOG Unreleased/Added entry for the game over"
affects: [20-08, 20-09, 20-10]

plan_head_before: d359bd819a4d9bcb295de6a8ced01c7a1bfa8ee4
plan_head_after: eb089c0
actuals:
  tokens: 4900
  tasks: 2
  commits: 3

tech-stack:
  added: []
  patterns:
    - "root plumbing copied hop by hop from the pause overlay (main -> options -> lifecycle deps -> create/dispose)"
    - "overlay shown through an optional runtime field, so a harness without the DOM latches and shows nothing"

key-files:
  created: []
  modified:
    - src/main.ts
    - src/app/game-session.ts
    - src/app/session/start-session.ts
    - src/app/session/context.ts
    - src/app/session/event-router.ts
    - tests/app/session/death-flow.test.ts
    - tests/app/session/start-session.test.ts
    - CHANGELOG.md

key-decisions:
  - "The overlay is shown before the scene lookup in createDeathFlow, so a death with no live scene still shows the lines"
  - "No in-session load path is added (D-12): the reload in src/ui/game-over.ts is the only exit, pinned by a source test"
  - "The dispose-order test in start-session.test.ts gained the gameOverOverlay step beside the pause overlay's"

requirements-completed: [DEATH-01, DEATH-06]

coverage:
  - id: D1
    description: "A death in the session shows the four game-over lines (cause from the compiled catalogue, live credits, rating label) in the dispatch that latches it; a second event shows nothing; no overlay or no scene does not throw"
    requirement: DEATH-01
    verification:
      - kind: unit
        ref: "tests/app/session/death-flow.test.ts#the game-over overlay is shown by the death flow (DEATH-01, D-02, D-03, D-05)"
        status: pass
    human_judgment: false
  - id: D2
    description: "The cause line reads correctly through the live tables: buoy and witchpoint rams, an unresolved culprit and the defensive traffic-off wording"
    requirement: DEATH-01
    verification:
      - kind: unit
        ref: "tests/app/session/death-flow.test.ts#the cause line reads the live tables (D-03)"
        status: pass
    human_judgment: false
  - id: D3
    description: "The game-over lines are identical for every save status (absent, corrupt, future, unreadable, unavailable)"
    requirement: DEATH-06
    verification:
      - kind: unit
        ref: "tests/app/session/death-flow.test.ts#the game-over view does not depend on the save (D-13)"
        status: pass
    human_judgment: false
  - id: D4
    description: "The overlay is created with the session and disposed beside the pause overlay; only src/ui/game-over.ts reloads the page and no in-session load function exists"
    requirement: DEATH-06
    verification:
      - kind: unit
        ref: "tests/app/session/start-session.test.ts#dispose order"
        status: pass
      - kind: unit
        ref: "tests/app/session/death-flow.test.ts#the reload is the only way forward (D-12)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Reading the four lines over the scene (centred, legible, version and system lines hidden) and the reload to the title with Continue for a loadable save, in the real page"
    verification: []
    human_judgment: true
    rationale: "Needs 20-08's data-dead mark and a real browser; the end-of-phase UAT on the phase HEAD and 20-09's browser spec prove the reload, title and Continue"

duration: 20min
completed: 2026-11-23
status: complete
---

# Phase 20 Plan 07: Game-over overlay wiring Summary

**The `#game-over` root now travels from `main.ts` to the session like the pause root, the overlay lives and dies with the session, and `createDeathFlow` shows "Game Over", the cause ("Destroyed by Krait", "Collided with Navigation Buoy"), the score and "Press Space" in the dispatch that latches the death.**

## Performance

- **Duration:** about 20 min of work (plus the full `test` run and the remote `verify`)
- **Started:** 2026-11-23T17:55Z
- **Completed:** 2026-11-23
- **Tasks:** 2 (3 commits: RED, GREEN, characterization tests plus CHANGELOG)
- **Files changed:** 8 (0 created, 8 modified)

## Accomplishments

- `gameOverRoot` plumbing: `requireElement("game-over")` in `src/main.ts`, `GameSessionOptions.gameOverRoot`, `SessionDeps.gameOverRoot` and the lifecycle deps field, destructured in `start-session.ts`.
- `SessionRuntime.gameOverOverlay` (default `undefined`), created next to the pause overlay with `createGameOverOverlay({ root: gameOverRoot })` and disposed (then cleared) right after the pause overlay in `dispose()`.
- `createDeathFlow` builds the lines with `buildGameOverLines(cause, resolveCulpritName(cause.culprit, ctx.core.npcTraffic?.catalogue, ctx.core.targetNames), ctx.core.profile.credits, ctx.core.labels?.rating[0] ?? "")` and calls `ctx.runtime.gameOverOverlay?.show(lines)` after the latch and the HUD shutdown and before the explosion's scene lookup, so a death with no scene still shows the view.
- Wording cases pinned through the live tables: buoy and witchpoint rams, an unresolvable culprit, and the traffic-off wording (marked defensive in the test's comment: with traffic off no lethal record exists today).
- D-13: identical `show` arguments for all five non-valid save statuses.
- D-12: a source test pins that only `src/ui/game-over.ts` mentions `location.reload` and that no `loadSavedGame` exists; `loadFromSave` and its F2 gating, the `main.ts` boot read and the title are untouched.
- CHANGELOG `## [Unreleased]` / `### Added`: the Game Over entry (20-08 adds its sentence on the explosion, rear view and fade).

## TDD record

- **RED (`97f3d11`):** three tests in `tests/app/session/death-flow.test.ts` (laser death shows four lines in the latching dispatch; a second event shows nothing; no scene still shows). Command: `docker compose run --rm test npx vitest run tests/app/session/death-flow.test.ts`; result: 3 failed, 12 passed. Each failed on its planned assertion (`expected [] to equal [ { title: "Game Over", ... } ]`, `expected [] to have a length of 1`), the overlay double's `show` never called. Semantic assessment: the target tests executed and failed for the intended reason (no show call yet), no import, syntax or fixture fault. Evidence was assessed by hand from the runner output; the `gsd_run check tdd-red-evidence` classifier was not run (no JSON record was built).
- **GREEN (`5220298`):** the wiring and the `show` call; the same file passes (15 tests), `typecheck` clean.
- **Task 2 (`eb089c0`):** the wording, D-13 and D-12 cases passed as soon as written, because Task 1's `createDeathFlow` already produces them (the plan says to change it only if a case shows a defect; none did). They are characterization tests, so there is no RED commit for this task and no unexpected-green investigation beyond that fact.

## Task Commits

1. **Task 1 (tracer): the #game-over root reaches the session and a death shows the four lines**
   - `97f3d11` test(20-07): failing test for the overlay shown by the death flow
   - `5220298` feat(20-07): wire the overlay into the session and show it from the death flow
2. **Task 2: the cause wording, the reload-only exit and the CHANGELOG entry** - `eb089c0` (test)

**Plan metadata:** the docs commit with this SUMMARY.

## Files Created/Modified

- `src/main.ts` - `gameOverRoot = requireElement("game-over")` passed in the session options
- `src/app/game-session.ts` - `GameSessionOptions.gameOverRoot`, passed to the lifecycle
- `src/app/session/context.ts` - `SessionDeps.gameOverRoot`, `SessionRuntime.gameOverOverlay`
- `src/app/session/start-session.ts` - the deps field, overlay creation and disposal
- `src/app/session/event-router.ts` - `createDeathFlow` shows the lines
- `tests/app/session/death-flow.test.ts` - overlay, wording, D-13 and D-12 cases
- `tests/app/session/start-session.test.ts` - the dispose-order list gained `gameOverOverlay.dispose`
- `CHANGELOG.md` - the Game Over entry

## Decisions Made

- The `show` call sits before the scene lookup rather than at the very end of the function (the plan said "at the end of the deps branch"): the explosion branch returns early when there is no scene, which would skip the overlay. The behaviour (shown once, in the latching dispatch) is the plan's.
- The dispose-order test file `tests/app/session/start-session.test.ts` is outside the plan's file list but the plan's verify command runs it and its literal teardown list needed the new step; no sibling plan touches it.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Dispose-order test and typed profile update**
- **Found during:** Task 1 and Task 2
- **Issue:** the plan's file list omits `tests/app/session/start-session.test.ts`, whose teardown order is written out literally; and `PlayerProfile.credits` is read-only, so a test could not assign it.
- **Fix:** added the `gameOverOverlay.dispose` step to the literal list (and an `undefined` check after dispose); the test replaces `ctx.core.profile` with a copy.
- **Files modified:** `tests/app/session/start-session.test.ts`, `tests/app/session/death-flow.test.ts`
- **Committed in:** `5220298`, `eb089c0`

---

**Total deviations:** 1 auto-fixed (Rule 3). **Impact on plan:** test-only; no scope creep.

## Dead-mode guard

This plan adds no `FlightMode` literal comparison; `tests/guards/dead-mode-gates.test.ts` was run (with the whole `tests/guards` folder) and passes unchanged. Nothing re-pinned.

## Deleted files

None.

## Verification record

- Targeted: `docker compose run --rm test npx vitest run tests/app/session/death-flow.test.ts tests/app/session/start-session.test.ts tests/app/dispose.test.ts tests/app/boot.test.ts tests/guards`: 25 files, 378 tests passed. `docker compose run --rm test npx vitest run tests/app/session/death-flow.test.ts tests/ui/game-over.test.ts`: 42 passed.
- `docker compose run --rm typecheck`: clean. `docker compose run --rm lint`: eslint and prettier clean.
- Acceptance greps: `requireElement("game-over")` 1 in `src/main.ts`; `createGameOverOverlay(` 1 and `gameOverOverlay?.dispose()` 1 in `start-session.ts`; `gameOverOverlay?.show(` 1 in `event-router.ts`; `gameOverRoot` 3 in `game-session.ts`; `rg -l 'location\.reload' src` prints only `src/ui/game-over.ts`; `rg -c loadSavedGame src` prints nothing; `Game Over` is in CHANGELOG.
- Plan-boundary full `docker compose run --rm test` (run twice under load from the parallel remote run and the sibling executor): 285 of 287 files passed, 7487 tests passed, 2 failed both times, both timeouts: `tools/oolite-ingest/convert/textures.test.ts` (5000 ms, the known flake) and `tests/guards/tools-determinism.test.ts` "Math.sin fails lint" (30000 ms, a spawned lint under load). Both files rerun alone pass (25 tests; 13.3 s and 3.4 s). Neither touches this plan's files.
- Remote `/home/opencode/.claude/scripts/wegolite-remote-run.sh run --rm verify`: `exit=0 elapsed=204s snapshot=eb089c0` (the last code commit; the SUMMARY commit after it changes no code); fast e2e subset 28 passed.

## Issues Encountered

None.

## Known Stubs

None.

## Threat Flags

None. No new network, auth or file surface: the overlay writes `textContent` only (20-05) and the names come from compiled tables.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

20-08 (wave 4) adds the dead camera, the `data-dead` mark, the fade and its sentence in this CHANGELOG entry. 20-09 proves the reload, the title and Continue end to end in a browser (the cause line names the buoy only with `traffic=1`, because `targetNames` loads with the traffic content).

---
*Phase: 20-player-death-and-game-over*
*Completed: 2026-11-23*
