---
phase: 08-session-split-and-world-core
plan: 08
subsystem: app
tags: [session-split, station-controller, save-controller, refactor, g-8, load-order, persistence]

requires:
  - phase: 08-session-split-and-world-core
    provides: 08-04 typed SessionState, SessionDeps and the probe publisher; 08-06 render driver and the controller-factory pattern (createX(ctx, deps), dependency functions, no listener on construction)
provides:
  - src/app/session/station-controller.ts, createStationController(ctx, deps) returning the 29 station functions, plus StationControllerDeps and StationController (ReturnType)
  - src/app/session/save-controller.ts, createSaveController(ctx, deps) returning the 15 save functions, the module-level pure helpers canOverwrite, canClear, statusSkipReason and isStoreUnavailable, plus SaveControllerDeps and SaveController (ReturnType)
  - tests/app/session/station-controller.test.ts (10 tests) and tests/app/session/save-controller.test.ts (21 tests, including the "loadFromSave order" describe), fake context, Node only
affects: [08-10, 08-12, 08-14, 08-15, 08-16]

actuals:
  tokens: 35877
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "a controller that must exist before the owner of one of its dependencies is built reaches that owner through a call-time wrapper (`openChart: () => { chartController.openChart(); }`), so construction order never hits a temporal-dead-zone read"
    - "the pure save-status helpers are module-level exports of the save controller, so the facade can use statusSkipReason before the context exists"
    - "every collaborator of an async session function (store, scene entry, message queue, probe functions, station refresh) arrives through the deps interface, so a Node test records one shared call log and asserts the pre-move order"

key-files:
  created:
    - src/app/session/station-controller.ts
    - src/app/session/save-controller.ts
    - tests/app/session/station-controller.test.ts
    - tests/app/session/save-controller.test.ts
  modified:
    - src/app/game-session.ts

key-decisions:
  - "the station controller is built before the probe publisher, render driver and the other controllers, because they take its functions (commitProfile, renderStation, syncStationNav, refreshStationChrome); the owners built later (probe publisher, chart controller, save controller) reach it through call-time wrappers in its deps"
  - "canOverwrite stays a station-controller dependency function rather than an import of the save module, so the two controllers do not depend on each other; the facade passes the save controller's exported helper"
  - "enterSystemById, syncStatusOverlay and targetSystem stay in the facade (step 7 owns them); the save controller reaches the first two through SaveControllerDeps"

patterns-established:
  - "a split step that touches persistence is verified with verify-full on a detached worktree of its own commit, under its own Compose project, and cleaned up (containers, volume, worktree)"

requirements-completed: []

coverage:
  - id: D1
    description: "Split step 5: trading, fitting, selection, station rendering, station actions and the station navigation tabs live in station-controller.ts; every moved function keeps its call-site count"
    requirement: FOUND-10
    verification:
      - kind: unit
        ref: "tests/app/session/station-controller.test.ts (10 tests: selection, refused trade keeps the profile object, accepted buy changes credits by exactly the plan's cost and the hold by one unit, cancelTrade, Node-safe syncHeaderCredits, renderStation, action and navigation guards)"
        status: pass
      - kind: e2e
        ref: "tests/e2e/station.spec.ts and station-tabs.spec.ts on the step-5 tree: 24 passed"
        status: pass
      - kind: other
        ref: "Station call sites table below: 14 functions, counts identical before (dd656bc) and after"
        status: pass
    human_judgment: false
  - id: D2
    description: "Split step 6: autosave, manual save, load, the New-game clear and the F2 Save/Load screen live in save-controller.ts; the guard order, triggers and bytes are unchanged and src/persistence is untouched"
    requirement: FOUND-10
    verification:
      - kind: unit
        ref: "tests/app/session/save-controller.test.ts (guard order recovering before tainted, attempt counter first, buildSnapshotInputs docked and in flight, closeSaveScreen in Node, clearSaveForNewGame)"
        status: pass
      - kind: e2e
        ref: "docker compose -p wegolite-gate-08-08-step6 run --rm verify-full on a detached worktree of b9c8f76 (tree 9489b2a): 121 unit files / 1779 tests, 122 Chromium specs, 2 seams specs, exit 0"
        status: pass
      - kind: other
        ref: "git diff --quiet dd656bc -- src/persistence src/app/probe.ts tests/fixtures/probe-shape.json tests/app/redraw-gate.test.ts tests/guards/economy-purity.test.ts tests/golden (exit 0)"
        status: pass
    human_judgment: false
  - id: D3
    description: "loadFromSave keeps its pre-move order (read, scene entry, six installs, status overlay, message clear, dock-feedback replacement, hook rebind with the restored object only when enabled, F2 teardown, shell, probe restore, loop reset, one frame); a closed F2, a failed parse and a disposed session change nothing"
    requirement: FOUND-10
    verification:
      - kind: unit
        ref: "tests/app/session/save-controller.test.ts#loadFromSave order (docked and in-flight sequences, hook rebind identity and condition, post-await F2 re-check, failed parse, disposed during read, clear and write)"
        status: pass
    human_judgment: false
  - id: D4
    description: "The post-dispose guards (clear await, queueSnapshot completion) and the typeof document guards (syncHeaderCredits, closeSaveScreen) are in place, and the frozen files are untouched with createGameSession still the only public entry (9 exports)"
    requirement: FOUND-10
    verification:
      - kind: unit
        ref: "save-controller.test.ts (e) cases; mutating either disposed guard away fails exactly the two matching tests"
        status: pass
      - kind: other
        ref: "rg -c \"^export\" src/app/game-session.ts (9); frozen-file git diff at dd656bc (exit 0)"
        status: pass
    human_judgment: false

duration: 49min
completed: 2026-11-13
status: complete
plan_head_before: dd656bc393f67ed56fda772c1ea310c71e1ae0f4
plan_head_after: b9c8f762b9c5c900c3603d6ac3b12807482a7b64
---

# Phase 8 Plan 08: Session split steps 5 and 6 Summary

**The station controller (trade, fitting, selection, render, tabs, actions) and the save controller (autosave, manual save, in-session Load, New-game clear, F2 screen) are extracted from game-session.ts, with fake-context proofs of the trade refusal and acceptance rules, the save guard order and the real loadFromSave call order, and verify-full green on a detached worktree of the step-6 commit; two commits, no save byte, probe field or persistence module changed.**

## Performance

- **Duration:** about 49 min of active work (started 11:51Z, last task commit about 12:12Z, then a 28-minute verify-full on a worktree plus this close-out)
- **Tasks:** 2 (Task 1 tracer, Task 2 auto)
- **Files modified:** 5 (4 created, 1 modified)
- **Diff size:** 2,581 insertions and 1,293 deletions over `src` and `tests` (143,506 chars, `actuals.tokens` is chars/4)
- **game-session.ts:** 2,633 lines to 1,433

## Accomplishments

- **Step 5, the station controller (053fdb6).** `createStationController(ctx, deps)` carries the bodies of isSelectableGood through commitProfile plus openStationScreen, backToHome, navigateStation, setStationPage and applyStationAction, reading every live field through `ctx` at call time. Profile updates keep the spread form. The facade builds it first and destructures the 11 names it still calls.
- **Step 6, the save controller (b9c8f76).** `createSaveController(ctx, deps)` carries setSaveNotice through clearSaveForNewGame and saveSlotText through handleSaveScreenActions. The pure helpers (`canOverwrite`, `canClear`, `statusSkipReason`, `isStoreUnavailable`) are module-level exports. `loadFromSave` keeps its exact sequence and the `generateMarket(savedSystem, catalogue, nextSeed)` producer text; the hook rebind (`bindTestHook`) stays conditional on `testHookEnabled`.
- **Station proofs (10 tests).** A buy refused by the plan (credits 0) and a pending plan gone stale leave `ctx.core.profile` the same object, the market untouched and no autosave; an accepted buy of one unit of the first tradeable good lowers credits by exactly the shelf price and raises the hold by one unit, with one autosave after the commit render; `cancelTrade` clears the pending plan.
- **Save proofs (21 tests).** recovering wins over a read-only status and a taint, tainted wins over the build step, and every trigger counts an attempt first; `buildSnapshotInputs` is checked for a docked and an in-flight fake against values written from the fakes' own fields; the "loadFromSave order" describe drives the real function through recording doubles (see below).

## Task Commits

1. **Task 1: Split step 5, the station controller** - `053fdb6` (refactor)
2. **Task 2: Split step 6, the save controller** - `b9c8f76` (refactor)

**Plan metadata:** the docs commit that carries this SUMMARY (see `git log`). The measured `commits: 2` is `git rev-list --count dd656bc..b9c8f76`.

## Station call sites

Call expressions of `<name>(` (comment lines excluded, the one `function <name>(` declaration subtracted) over `src/app/game-session.ts` and `src/app/session/*.ts`, counted at the plan base `dd656bc` and at `053fdb6`/`b9c8f76`:

| Function | Before | After |
| --- | --- | --- |
| commitProfile | 5 | 5 |
| ensureSelection | 4 | 4 |
| renderStation | 29 | 29 |
| syncStationNav | 13 | 13 |
| syncHeaderCredits | 1 | 1 |
| refreshStationChrome | 3 | 3 |
| applyStationAction | 1 | 1 |
| openStationScreen | 2 | 2 |
| backToHome | 2 | 2 |
| navigateStation | 1 | 1 |
| setStationPage | 1 | 1 |
| confirmTrade | 1 | 1 |
| confirmFit | 1 | 1 |
| cancelTrade | 1 | 1 |

The station and station-tabs browser specs (24 tests) passed on the step-5 tree, and again inside the step-6 verify-full.

## loadFromSave sequence

The pre-move order of observable steps, recorded from `game-session.ts` at `dd656bc` before the move and asserted by `tests/app/session/save-controller.test.ts` ("loadFromSave order"). The guards before the read (`loadingSave`, `saveScreenOpen`, input, station def and catalogue present) return silently and set `loadingSave` only after they pass.

1. `await saveBoot.store.read()` (collaborator: the save store).
2. Post-await re-check: if `ctx.runtime.disposed` or `!ctx.save.saveScreenOpen`, return with no failure notice and no install (the `finally` clears `loadingSave`).
3. `read.kind !== "ok"`: `failLoad` once (notice then probe update), return. A blob that fails `parseSave`: `failLoad(loadFailureCopy(reason))` once, return. An unknown saved system, or a throw in layout, restore or market generation: `failLoad`, return. No live field has moved up to here.
4. `enterSystemById(saved.system.id)` (collaborator: the scene entry; a throw is `failLoad`, return).
5. One synchronous install block, in this order: `ctx.core.state`, `layout`, `profile`, `market`, `marketSeed`, `hyperspaceTargetId`.
6. `syncStatusOverlay()`.
7. `messages.clear()`, `lastScrapeMessageTime = null`, `ctx.core.dockFeedback = createDockFeedback()` (a fresh instance).
8. If `ctx.runtime.testHookEnabled`: `bindTestHook(restored.state)` (G-8), the very object now in `ctx.core.state`.
9. Pose reset, station fields reset, chart closed, then `saveLoad.cancelOverwrite()` and `saveLoad.hide()`, status and clock bookkeeping.
10. `input.setContext("dockHome")` for a docked save, `"flight"` otherwise.
11. Docked: `docked.show(system name)`, `hudCanvas.hidden = true`, `ensureSelection()`, `renderStation()`. In flight: `docked.hide()`, `hudCanvas.hidden = false`, `syncEconomyProbe()`.
12. `syncStationNav()`, then `probe.restore` is written once, then `syncSaveProbe()`.
13. `loop.reset()`, `lastMs = 0`, `renderFrame(0)`; the `finally` clears `loadingSave`.

The test asserts the docked sequence and the in-flight sequence as full ordered call logs, the hook rebind (once, after the state install, with the identity of `ctx.core.state`; not called when the hook is off), a read that resolves after F2 was closed (log is only `store.read`, nothing installed), a failed parse (one failure notice, `ctx.core.state`, layout, profile, market and marketSeed the same objects), and a session disposed during the read, the clear and the write.

## Deliberate deviations from a verbatim move

Each is inert in normal play (it acts only after dispose or without a document) and is named in the commit message of the step that adds it.

| Deviation | Step commit | Pre-move site | Rationale |
| --- | --- | --- | --- |
| `if (typeof document === "undefined") return;` at the top of `syncHeaderCredits` | 053fdb6 | `game-session.ts:755` (no guard; `openStationScreen` at `:825` already guarded) | `confirmTrade`, `cancelTrade`, `stepAmount` and `commitProfile` reach it through `renderStation` and `syncStationNav`, and run under Node in Vitest |
| `typeof document !== "undefined"` around `document.getElementById("station-screen")` in `closeSaveScreen` | b9c8f76 | `game-session.ts:1524` (no guard) | a Node test of `closeSaveScreen` must not throw `ReferenceError` |
| `if (ctx.runtime.disposed) return;` right after `await saveBoot.store.clear(...)` in `clearSaveForNewGame` | b9c8f76 | `game-session.ts:1308` (no post-await check) | a dispose during the clear must not write save status, skip reason or the probe (T-08-42) |
| `if (ctx.runtime.disposed) return;` at the top of `queueSnapshot`'s completion callback | b9c8f76 | `game-session.ts:981` (no check at the top; only the trailing render was guarded) | a dispose during the write must not update counters, notices or the probe (T-08-42) |

The post-read check in `loadFromSave` (`ctx.runtime.disposed || !ctx.save.saveScreenOpen`) already existed and moved verbatim. Mutating either of the two disposed guards away fails exactly the two matching (e) tests, so they are not decorative.

## Step 6 gate

| Item | Value |
| --- | --- |
| STEP6_SHA | `b9c8f762b9c5c900c3603d6ac3b12807482a7b64` |
| Tree SHA (`git rev-parse "$STEP6_SHA^{tree}"`) | `9489b2ac2c2bf95640e507c41e5907d3a96f5332` |
| Subject | `refactor(08-08): extract the save controller (split step 6)` |
| Route | detached worktree `/tmp/wegolite-gate-08-08-step6`, Compose project `wegolite-gate-08-08-step6`, no `--build` (the existing `wegolite-ci` image served) |
| Result | `docker compose -p wegolite-gate-08-08-step6 run --rm verify-full` exit 0 on the first run: lint, typecheck, assets:check, 121 unit files / 1,779 tests (2 skipped), build, 122 Chromium specs (24.5 min), 2 seams specs; wall time 28 min 19 s |
| Cleanup | `down --volumes --remove-orphans`, root-owned `dist/`, `test-results/`, `coverage/` cleared with a one-shot `docker run` first, worktree removed; `git worktree list` shows only the main tree; no container and no volume of the project remain |

Other gates:

| Gate | Commit | Tree SHA | Where it ran |
| --- | --- | --- | --- |
| `tests/app/session` + redraw-gate + economy-purity + compliance, 103 passed; station and station-tabs specs, 24 passed; `docker compose run --rm verify` green (120 unit files / 1,758 tests, 26 e2e incl. probe-shape specs) | `053fdb6` | `f377b90a89d029a2c4509a816f387b85632a7341` | main tree, before the commit; porcelain listed only this plan's files and untracked `.planning/` review diagnostics; the only running `wegolite`-labelled container was the idle `wegolite-preview-1`, which writes nothing |
| `tests/app/session` + `tests/persistence` + economy-purity + redraw-gate + compliance, 259 passed; `docker compose run --rm verify` green (121 unit files / 1,779 tests, 26 e2e incl. probe-shape specs) | `b9c8f76` | `9489b2ac2c2bf95640e507c41e5907d3a96f5332` | main tree, before the commit, same condition |

## Files Created/Modified

- `src/app/session/station-controller.ts` - `createStationController`, `StationControllerDeps`, `StationController`
- `src/app/session/save-controller.ts` - `createSaveController`, `SaveControllerDeps`, `SaveController`, `canOverwrite`, `canClear`, `statusSkipReason`, `isStoreUnavailable`
- `tests/app/session/station-controller.test.ts`, `tests/app/session/save-controller.test.ts` - the fake-context proofs
- `src/app/game-session.ts` - the moved bodies removed, the two factories wired and destructured, unused imports dropped

## Decisions Made

See `key-decisions` in the frontmatter: construction order and the call-time wrappers, `canOverwrite` as a station dependency, and `enterSystemById` plus `syncStatusOverlay` staying in the facade.

## Deviations from Plan

### Auto-fixed Issues

None. The plan's four deliberate non-verbatim changes are recorded above and were specified by the plan itself (Round 2 and Round 4 reviews).

### Plan adjustments

- The plan names `docker compose run --rm test npx vitest run tests/app/session tests/app/redraw-gate.test.ts tests/guards/economy-purity.test.ts` for Task 1; I also ran `tests/compliance.test.ts` (SPDX headers) and, for Task 2, `tests/persistence`, as the plan's Task 2 verify line says.
- The plan says the save-controller `docked` and `hudCanvas` collaborators arrive through deps; I typed them as `Pick<StationShell, "show" | "hide">` and `Pick<HTMLCanvasElement, "hidden">` so Node doubles need no cast to the full DOM type.

**Total deviations:** 0 auto-fixed.
**Impact on plan:** none.

## Issues Encountered

- A test-authoring slip, fixed before the step-6 commit: the "failed parse" case expected "Save is corrupt - cannot load", but `parseSave("not a save")` returns reason `unreadable`, whose copy is "Save could not be read". The expectation now follows `loadFailureCopy("unreadable")`; no production code changed.
- No flaky test from deferred-items D-2 (`launch.spec.ts:129`, `save-load.spec.ts:634`) failed in any run of this plan, including the step-6 verify-full, so no rerun was needed.
- Gate attribution: no plan 08-09 file was in the main tree at any gate (porcelain was clean of non-plan files), and the verify-full ran on the committed tree in a worktree.

## Known Stubs

None. No placeholder, empty-data or TODO value was introduced; the two factories hold no state of their own.

## Threat Flags

None. No new endpoint, auth path, file access or schema change. T-08-14 is mitigated: the guards moved verbatim, the unit test proves the recovering and tainted skips and the attempt counter, `src/persistence` is unchanged, and the step-6 verify-full ran the save-load, autosave and core-loop specs. T-08-15 is mitigated by the "loadFromSave order" test (rebind after the state install, with the restored object, only when enabled). T-08-36 is mitigated: the step-6 verify-full ran on a detached worktree of b9c8f76 with its commit and tree SHA recorded above. T-08-42 is mitigated by the two added disposed guards and the three disposed tests.

## Next Phase Readiness

- Plan 08-10 and the later split steps can reach `renderStation`, `commitProfile`, `autosave`, `loadFromSave` and `clearSaveForNewGame` through the two controllers. `enterSystemById` and `targetSystem` are still in the facade for step 7; `bounceMessage` stays with the event handling for step 8.
- Plan 08-12 (step 9) still has the two window `keydown` registrations to move.
- `FOUND-10` is not marked complete: `requirements.ready-ids` reports it blocked by the other plans of the phase that declare it.
- No blocker.

## Self-Check: PASSED

- Created files present on disk: `src/app/session/station-controller.ts`, `src/app/session/save-controller.ts`, `tests/app/session/station-controller.test.ts`, `tests/app/session/save-controller.test.ts`.
- Commits `053fdb6` and `b9c8f76` are ancestors of HEAD; `git rev-list --count dd656bc..b9c8f76` is 2.
- Acceptance checks re-run at HEAD: 3 of `function confirmTrade|renderStation|applyStationAction` in the station controller and none in the facade; 3 of `async function loadFromSave|function autosave|function buildSnapshotInputs` in the save controller and none in the facade; one `generateMarket(savedSystem, catalogue, nextSeed)` in the save controller (3 `generateMarket(` in total under `src/app`); one `loadFromSave order`; 9 exports of the facade; the frozen files and `src/persistence` identical to dd656bc; one `case "docked":`; no `/tmp/wegolite-gate-08-08-step6` worktree, container or volume left.

---
*Phase: 08-session-split-and-world-core*
*Completed: 2026-11-13*
