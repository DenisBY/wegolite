---
phase: 06-hyperspace-navigation-persistence
plan: 14
subsystem: app
tags: [scene-lifecycle, commit-point, hyperspace, save-load, gap-closure, W-1, G-7]

# Dependency graph
requires:
  - phase: 06-hyperspace-navigation-persistence
    provides: "G-7 guarded arrival build (06-11) and the scene manager swap (WORLD-04)"
provides:
  - "enterSystemById derives the destination layout before the scene switch; the post-switch block has no throwing statement"
  - "scene manager enterSystem pre-install cleanup: a failed viewport step disposes the built destination and rethrows"
  - "scene manager enterSystem commit point: a retire failure after the install is logged and enterSystem returns the destination"
  - "three commit-point unit cases with a test-only observation of the destination's disposal"
affects: [06-verification re-verifier, phase-7 test-seam work (WR-04)]

# Actuals (#2632): chars/4 over the diff of the three changed files, 694db16..HEAD
actuals:
  tokens: 3056
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Commit point: once the scene manager has installed the destination, a retire failure is logged, not thrown"
    - "Pre-install cleanup: a throw before the install disposes the destination built for that call and rethrows"
    - "Test-only vi.mock wrapper of createSystemScene that counts dispose calls, changes no behaviour"

key-files:
  created:
    - ".planning/phases/06-hyperspace-navigation-persistence/06-14-SUMMARY.md"
  modified:
    - "src/app/game-session.ts"
    - "src/app/scene-manager.ts"
    - "tests/app/dispose.test.ts"

key-decisions:
  - "The layout is derived in enterSystemById before scenes.enterSystem, and the session takes system, scene and layout in one block with no throwing statement after the switch"
  - "The scene manager's enterSystem is the commit point: the install is the point of no return, so a post-install retire failure is logged with a 'Wegolite:' prefix and the call returns the destination"
  - "A failed pre-install viewport step disposes the destination built for that call; a disposal failure there is logged so it cannot replace the original error"
  - "The throw inside GameSession.enterSystemById has no unit or browser seam; the forced throws are placed on createSceneManager (renderer getSize and renderLists.dispose), and the disposal is observed through a test-only vi.mock wrapper"

patterns-established:
  - "Commit-point helper (retireCommitted) next to retire: logs a post-install failure instead of propagating it"
  - "Disposal observation for scene lifecycle tests: vi.hoisted record array plus a vi.mock wrapper of createSystemScene that spreads the original module"

requirements-completed: [NAV-05, SAVE-05]

coverage:
  - id: D1
    description: "enterSystemById derives the destination layout before the scene switch and has no throwing statement after it, so the session and the scene manager agree after every successful switch"
    requirement: "NAV-05"
    verification:
      - kind: other
        ref: "structural grep gates in 06-14-PLAN.md Task 1 (derivation before switch: ok; throw statements after switch: 0; layout read after switch only in ?? form: 0)"
        status: pass
      - kind: e2e
        ref: "tests/e2e/hyperspace.spec.ts#chart target, countdown, abort, refusal, arrival and reload"
        status: pass
    human_judgment: true
    rationale: "The throw path inside GameSession.enterSystemById has no executable seam (no test constructs GameSession); the only check of the ordering is structural. The success path is browser-proven. The re-verifier decides whether the structural check is sufficient."
  - id: D2
    description: "A failure before the install leaves the origin scene and layout active on the scene manager, and the destination built for that call is disposed"
    requirement: "NAV-05"
    verification:
      - kind: unit
        ref: "tests/app/dispose.test.ts#the scene swap is a commit point (W-1) > a throw before the install leaves the origin active (commit point)"
        status: pass
      - kind: unit
        ref: "tests/app/dispose.test.ts#the scene swap is a commit point (W-1) > the destination built for a failed call is disposed (commit point)"
        status: pass
    human_judgment: false
  - id: D3
    description: "A retire failure after the install is logged, and enterSystem returns the destination so the session can take it"
    requirement: "SAVE-05"
    verification:
      - kind: unit
        ref: "tests/app/dispose.test.ts#the scene swap is a commit point (W-1) > a retire failure after the commit returns the destination (commit point)"
        status: pass
      - kind: e2e
        ref: "tests/e2e/dispose.spec.ts and tests/e2e/aspect.spec.ts (swap path through enterSystem)"
        status: pass
    human_judgment: false

# Metrics
duration: unmeasured
completed: 2026-11-07
status: complete
---

# Phase 6 Plan 14: Commit-point arrival and Load swap Summary

**Arrival and Load derive the destination layout before the scene switch, and the scene manager's swap is a commit point, so a failed swap leaves the origin on both sides and a post-install retire failure no longer splits the session.**

## Performance

- **Duration:** unmeasured (sequential run on the main working tree)
- **Tasks:** 2 of 2 completed
- **Files modified:** 3 source and test files, plus this SUMMARY

## Accomplishments

- `enterSystemById` derives the destination layout before `scenes.enterSystem`, and the post-switch block (`system`, `scene`, `layout`, `previousCameraWorld`) contains no throwing statement. The layout-check error and its undefined guard are removed.
- The scene manager's `enterSystem` wraps the pre-install viewport step in a try. On a throw it disposes the destination built for that call and rethrows, so the origin scene, its layout and the menu stay active.
- The scene manager's `enterSystem` treats the install as the commit point. A failure while retiring the origin is logged with a `Wegolite:` prefix and `enterSystem` returns the destination.
- Three commit-point unit cases pass, and the full dispose unit file passes (12 of 12). The existing "menu Cobra survives a system swap" case is unchanged and passes.
- The arrival and Load browser specs (`hyperspace.spec.ts`, `save-load.spec.ts`) and the dispose and aspect browser specs pass in the container.

## Task Commits

1. **Task 1: derive the arrival layout before the scene switch** - `b6c925c` (fix)
2. **Task 2: make the scene swap a commit point** - `c3c8190` (fix)

**Plan metadata:** recorded by the docs commit that adds this file (`docs(06-14): ...`).

## Files Created/Modified

- `src/app/game-session.ts` - `enterSystemById` derives the layout before the switch and has no throwing statement after it; the Load and `handleHyperspaceJumped` comments describe the actual ordering. The failure surface, the Load install block, `start()` and `performSwap()` are unchanged.
- `src/app/scene-manager.ts` - `disposeUninstalled` (disposes the destination built for a failed call, logs a disposal failure), `retireCommitted` (logs a post-install retire failure), and the pre-install try in `enterSystem`. `enterMenu`, `disposeSystem`, `dispose` and `retire` are unchanged.
- `tests/app/dispose.test.ts` - a test-only `vi.mock` wrapper of `createSystemScene` (counts each built scene's `dispose` calls, changes no behaviour) and the describe block "the scene swap is a commit point (W-1)" with Case 1, Case 1b and Case 2.

## Decisions Made

- The session's `enterSystemById` derives the same layout that the scene manager derives from the same two arguments, so the two copies have equal content. The post-switch assignment uses `scenes.layout() ?? nextLayout`, the same fallback form `performSwap` uses.
- The commit point is the scene manager's install, not the session's assignments. The session's post-switch block cannot throw, so the session and the manager agree after every successful switch.
- The throw inside `GameSession.enterSystemById` has no unit or browser seam. The forced throws are placed on `createSceneManager`, and the disposal observation is test-only. This is the tested contract, and the throw path has no browser negative control (W-2 remains deferred, see below).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Two helpers instead of one**
- **Found during:** Task 2
- **Issue:** The plan's reversibility note says "one helper". The pre-install cleanup needed a separate disposal helper so that a disposal failure is logged and cannot replace the original viewport error.
- **Fix:** Added `disposeUninstalled` next to `retireCommitted`. The try around the viewport step in `enterSystem` calls it and rethrows.
- **Files modified:** `src/app/scene-manager.ts`
- **Verification:** Case 1b (destination disposed on a pre-install throw) passes; the HEAD red run fails it as expected.
- **Committed in:** `c3c8190`

**2. [Formatting] Prettier reflow of the new test wrapper**
- **Found during:** Task 2
- **Issue:** The `vi.mock` wrapper and the new describe block exceeded Prettier's line width.
- **Fix:** Ran `prettier --write` on the two changed files in the test container. The reformat touched only the new code.
- **Files modified:** `src/app/scene-manager.ts`, `tests/app/dispose.test.ts`
- **Verification:** `docker compose run --rm lint` exits 0 (`prettier --check .` passes).
- **Committed in:** `c3c8190`

**Total deviations:** 2 (1 structural helper split, 1 formatting). No scope creep.

## Red Check (Task 2)

Run against the HEAD version of `src/app/scene-manager.ts` (temporarily restored, then my version copied back and verified byte-identical):

- "a throw before the install leaves the origin active (commit point)": passes on HEAD, as a regression guard (the origin was already retained on HEAD).
- "the destination built for a failed call is disposed (commit point)": fails on HEAD (destination disposal count 0), as the plan expects.
- "a retire failure after the commit returns the destination (commit point)": fails on HEAD (the retire error propagated), as the plan expects.

## Issues Encountered

None. Every Docker gate passed on the first run after its edit.

## Gate Results (Docker, run on the working tree after the two task commits)

| Command | Result |
| --- | --- |
| `docker compose run --rm test npx vitest run tests/app/dispose.test.ts -t "commit point"` | exit 0, 3 passed, 9 skipped |
| `docker compose run --rm test npx vitest run tests/app/dispose.test.ts` | exit 0, 12 of 12 passed |
| `docker compose run --rm test` (full Vitest) | exit 0, 89 of 89 files, 1116 of 1116 tests passed |
| `docker compose run --rm e2e sh -lc "npm run build && npx playwright test tests/e2e/hyperspace.spec.ts tests/e2e/save-load.spec.ts"` (Task 1) | exit 0, 9 passed |
| `docker compose run --rm e2e sh -lc "npm run build && npx playwright test tests/e2e/dispose.spec.ts tests/e2e/aspect.spec.ts"` (Task 2) | exit 0, 7 passed |
| `docker compose run --rm typecheck` | exit 0 (run after each task) |
| `docker compose run --rm lint` | exit 0 (run after each task; Prettier clean) |

The full `docker compose run --rm verify` gate is the re-verifier's job, per the plan. It was not run here.

## Known Stubs

None.

## Threat Flags

None. The change adds no network endpoint, auth path, file access or schema. The `console.error` calls log only error messages from local scene disposal (T-06-43, accepted in the plan).

## Deferred and Open Items

- **W-2 browser negative control (WR-04): still deferred to Phase 7, not accepted.** No browser seam exists to force a throw inside `GameSession.enterSystemById`, so the throw path has no browser negative control. This plan adds no browser seam and does not change the WR-04 row in `06-GAP-CLOSURE.md`. The re-verifier decides whether the structural grep gates and the manager-level unit cases are sufficient.
- **W-1 closure is structural for the session side.** The ordering truths in `must_haves` are marked structural: their check is the Task 1 grep gates, not an executable test. The manager-side commit point is unit-tested.
- **Tracking not updated by this run.** `.planning/STATE.md` and `.planning/ROADMAP.md` were left unchanged. The orchestrator's sequential instructions named only SUMMARY.md, and `STATE.md` already carries uncommitted orchestrator edits that this run must not stage.

## Next Phase Readiness

- W-1 is closed in code, with the session-side guarantee resting on the structural gates.
- The G-7 ledger row keeps its "closed with explicit deferral" status; the WR-04 deferral is unchanged.

---
*Phase: 06-hyperspace-navigation-persistence*
*Completed: 2026-11-07*
