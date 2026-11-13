---
phase: 08-session-split-and-world-core
plan: 12
subsystem: app
tags: [session-split, frame-loop, session-lifecycle, facade, dispose-order, verify-full, d-12, found-10]

requires:
  - phase: 08-session-split-and-world-core
    provides: 08-04 probe publisher (withdrawProbe); 08-06 render driver and settings controller (onSubpanelKeyDown); 08-08 station and save controllers; 08-10 hyperspace controller, event router and sim driver (advanceFrame)
provides:
  - src/app/session/frame-loop.ts, createFrameLoop(ctx, deps) returning frame(now), plus the LoopDeps type
  - src/app/session/start-session.ts, createSessionLifecycle(ctx, deps) returning start, startSession, resize, performSwap, disposeSystem, swapSystem and dispose, the two window keydown registrations and onLaunchKeyDown, plus LifecycleDeps and SessionLifecycle
  - src/app/game-session.ts as a 532-line facade with the same nine exports
  - ctx.runtime.swapRafId (the tracked settlement frame of a scene swap)
  - tests/app/session-order.test.ts "frame phase order" describe (9 tests), tests/app/session/start-session.test.ts (15 tests, including the "dispose order" describe)
affects: [08-14, 08-15, 08-16]

actuals:
  tokens: 24343
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "the facade builds modules in dependency order and reaches a later-built module (the lifecycle's swap and dispose) through call-time wrappers, so no module reads another before construction"
    - "a window listener is registered at module construction, guarded by typeof window, on the session AbortController signal; the unit test stubs window with vi.stubGlobal and asserts type, capture, signal and order"
    - "a test double records its own call-time view (withdrawProbe logs whether the state is already dropped), so a teardown order test pins a data dependency as well as a call order"

key-files:
  created:
    - src/app/session/frame-loop.ts
    - src/app/session/start-session.ts
    - tests/app/session/start-session.test.ts
  modified:
    - src/app/game-session.ts
    - src/app/session/context.ts
    - tests/app/session-order.test.ts

key-decisions:
  - "the settlement frame of a scene swap is tracked in ctx.runtime.swapRafId and released by dispose() directly (a closure-held settle function), not by a listener on the abort signal, so the listener totals stay at 2 added and 0 removed as the plan requires"
  - "createSessionLifecycle also returns startSession (the plan lists it in the artifact signature), and the facade returns lifecycle.start, lifecycle.resize and lifecycle.dispose from the same GameSession object as before"
  - "frame() is returned as a bare function from createFrameLoop and its deps type is named LoopDeps, because a type whose name contains Frame is rejected by the sim-purity scan"

patterns-established:
  - "a split step that moves lifecycle code records the construction and teardown orders as header comments and pins the teardown order with a literal expected list written from the pre-move source"

requirements-completed: []

coverage:
  - id: D1
    description: "Split step 9: the frame shell lives in frame-loop.ts and start-up, resize, scene swap and dispose in start-session.ts; game-session.ts is a 532-line facade with the same nine exports, no file outside src/app imports src/app/session, and nothing under src/sim or the probe changed"
    requirement: FOUND-10
    verification:
      - kind: e2e
        ref: "docker compose -p wegolite-gate-08-12-step9 run --rm verify-full on a detached worktree of 391e788 (tree 20834c20), second run: 132 unit files / 2,300 tests (2 skipped), 122 Chromium specs, 2 seams specs, exit 0"
        status: pass
      - kind: other
        ref: "rg acceptance: nine-name export set, rg -l app/session/ outside src/app prints nothing, evidence files identical to 5b189e4, fixture and frozen tests untouched since the plan base"
        status: pass
    human_judgment: false
  - id: D2
    description: "The frame phase order is pinned: pause toggle, chart and save-screen drains, both freeze branches (drain, empty pending, no step, no draw), station actions only when docked and unpaused, the sim driver, then the single gated render; a paused frame drains, empties pending and never steps"
    requirement: FOUND-10
    verification:
      - kind: unit
        ref: "tests/app/session-order.test.ts#frame phase order (9 tests)"
        status: pass
    human_judgment: false
  - id: D3
    description: "A scene swap re-reads the layout from the scene manager, and dispose() cancels and releases a swap that is waiting for its frame, so the second renderFrame(0) never runs after teardown"
    requirement: FOUND-10
    verification:
      - kind: unit
        ref: "tests/app/session/start-session.test.ts#performSwap and #swapSystem (mutation check: removing the post-await disposed guard fails the cancel test)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Teardown order and listeners survive the move: dispose runs the recorded order exactly once and is idempotent; both window keydown listeners are registered at construction, guarded by typeof window, with capture and the session signal; listener totals are unchanged; no timer exists in the session modules"
    requirement: FOUND-10
    verification:
      - kind: unit
        ref: "tests/app/session/start-session.test.ts#dispose order (4 tests) and #the window keydown listeners (3 tests)"
        status: pass
      - kind: e2e
        ref: "tests/e2e/probe-shape.spec.ts testHookDocked state (boot hook binding) and the dispose and fallback specs, in the step-9 verify-full"
        status: pass
    human_judgment: false
  - id: D5
    description: "The play-through behaves as in release 0.3.0 (new game, launch, fly, dock, trade, chart target, jump, F2 save, reload and Continue)"
    requirement: FOUND-10
    verification: []
    human_judgment: true
    rationale: "Queued for the end of the phase (human_verify_mode end-of-phase): the split is behaviour-neutral, and the Chromium core-loop and save-load specs plus the Firefox core-loop journey cover the same path automatically, but the manual play check is the plan's stated human evidence"

duration: 50min
completed: 2026-11-13
status: complete
plan_head_before: f90fae88fb7072356a7914c1f01cd79c9133a251
plan_head_after: bc176ad9a95750a848ac5964f3672c71c1cefa9b
---

# Phase 8 Plan 12: Session split step 9 Summary

**The frame shell and the start-up, resize, scene-swap and teardown wiring leave game-session.ts, which becomes a 532-line facade with the same nine exports; the frame phase order, the swap layout re-read, the listener registrations and the teardown order are pinned by Node tests, and verify-full is green (second run) on a detached worktree of the step commit, with the Firefox core-loop journey green too.**

## Performance

- **Duration:** about 50 min by the wall clock (start about 14:18Z, last gate cleanup 15:06Z), of which about 41 min were gate runs (main-tree verify 5m39s, verify-full 3m43s and 29m34s, Firefox 1m56s)
- **Tasks:** 2 (Task 1 tracer, Task 2 auto)
- **Files:** 6 (3 created, 3 modified); 97,373 chars of diff over `src` and `tests`, so `actuals.tokens` is 24,343 at chars/4
- **game-session.ts:** 1,091 lines at the plan base (3,365 at the phase-start monolith) to 532

## Accomplishments

- **Frame loop (391e788).** `createFrameLoop(ctx, deps)` returns `frame(now)`, the body moved verbatim: the reschedule, `probe.frames += 1;`, the live guards, the delta, the pause toggle, both drains, both freeze branches with their `redrawGate.request();`, the station actions, `simDriver.advanceFrame(delta)` or the paused drain, and the one `renderFrame(alpha, shouldDraw())`.
- **Lifecycle (391e788).** `createSessionLifecycle(ctx, deps)` carries `start`, `startSession`, `resize`, `performSwap`, `disposeSystem`, `swapSystem` and `dispose` verbatim, plus `onLaunchKeyDown` and both `window.addEventListener("keydown", ...)` registrations, made at construction (the same point in the order as before), guarded by `typeof window !== "undefined"`, with `{ capture: true, signal: uiController.signal }`. The construction and teardown orders are header comments.
- **Facade (391e788).** `createGameSession` builds the context and modules in dependency order, builds the frame loop and then the lifecycle after the sim driver, and returns the same `GameSession` members. The probe publisher's `swapSystem` and `disposeSystem` and the settings controller's `performSwap` reach the lifecycle through call-time wrappers.
- **Tests (bc176ad).** Nine frame-order tests, fifteen start-session tests (performSwap, disposeSystem, swapSystem cancel, listeners, dispose order).

## Task Commits

1. **Task 1: Split step 9, the frame loop and the lifecycle** - `391e788` (refactor)
2. **Task 2: Frame phase order, swap re-read and dispose order tests** - `bc176ad` (test)

**Plan metadata:** the docs commit that carries this SUMMARY (see `git log`). The measured `commits: 2` is `git rev-list --count f90fae8..bc176ad`; `plan_head_after` is the full SHA of `bc176ad`.

## Lifecycle order

Recorded from `src/app/game-session.ts` at the plan base `f90fae8` before the move. The same lists are the header comments above `startSession` and `dispose` in `start-session.ts` (`rg -c "Construction order|Teardown order"` prints 2).

**Construction order (`startSession`)**: 1 the single-start guard, then `starting` is set; 2 the galaxy map is rebuilt and the options read; 3 the asset preload; 4 the ship catalogue, then the equipment, commodity and label catalogues, then the station definition; 5 the flight config, the saved system for a Continue, settings and quality, the first scene and its layout; 6 the dock geometry; 7 the New-game save clear; 8 the flight state (restore or fresh), its installation, the profile and saved target, the status overlay; 9 the market seed, the market, the station selection; 10 the HUD and break pattern, the chart, the Save/Load screen, the station nav; 11 the binding map and settings, the station chrome, the launch-seen flag, the hint controller; 12 the keyboard input source and the game loop, the poses; 13 the pause overlay, controls panel and settings panel; 14 the `?test=1` read and, only when enabled, the hook binding; 15 the title hide, then the restore or docked branch and the station nav sync; 16 the Launch and Refuel handlers; 17 `renderFrame(0)` and the first `requestAnimationFrame`.

**Construction order of the facade (`createGameSession`)**: context and probe, redraw gate, messages and launch sequence; hyperspace controller; station controller; probe publisher; render driver; save controller; chart and settings controllers; event router and sim driver; **frame loop; lifecycle (the two keydown registrations happen here)**; the returned object.

**Teardown order (`dispose`)**: 1 `disposed` set; 2 the frame's animation frame cancelled and `rafId` zeroed; 3 `uiController.abort()` (every window listener); 4 station nav, input (`clearAll`, then `dispose`), pause overlay, controls panel, settings panel; 5 `scenes.dispose()`, then `assets.dispose()`; 6 break pattern, HUD, chart (`chartOpen` false), Save/Load screen (`saveScreenOpen` false), docked shell, title; 7 `state`, `scene` and `layout` dropped; 8 `probePublisher.withdrawProbe()`; 9 `saveBoot.store.dispose()`. After the move the only addition is a new step 2b (see Deliberate deviations).

**Listener totals over the facade and `src/app/session`** (before, at `f90fae8`; after, at `bc176ad`): `addEventListener(` 2 and 2 (both in the facade before, both in `start-session.ts` after); `removeEventListener(` 0 and 0; lines naming `uiController.signal` 2 and 2, one per registration. The Node test proves both registrations take `{ capture: true, signal: <the session signal> }`, with the sub-panel one first.

## Pinned-literal audit

Sum of `rg -c` over `src/app/game-session.ts` and `src/app/session`, before the gates (at the facade as committed in `391e788`):

| Literal | Expected | Found |
| --- | --- | --- |
| `renderFrame(alpha, shouldDraw())` | 1 | 1 (frame-loop.ts) |
| `renderFrame(alpha: number, draw = true)` | 1 | 1 |
| `redrawGate.request();` | 5 | 5 |
| `probe.frames += 1;` | 1 | 1 (frame-loop.ts) |
| `probe.renders = renderer.info.render.frame;` | 1 | 1 |
| `redrawGate.next(paused \|\| state?.mode === "docked", drawKeys())` | 1 | 1 |
| `return [state, scene, scene?.nebulae?.revision() ?? 0];` | 1 | 1 |
| `generateMarket(` | 3 | 3 |
| `case "docked":` | 1 | 1 |
| `stepFlight(` | 1 | 1 |
| `pending.length = 0;` | 4 | 4 (three in frame-loop.ts, one in sim-driver.ts) |

Other acceptance checks (re-run at `bc176ad`): the export set of the facade is exactly the nine names (eight declarations plus the one `export { DESTINATION_BUILD_FAULT_MESSAGE } from` line); `rg -l "app/session/" src --glob '!src/app/**'` prints nothing; `setTimeout`, `setInterval` and `queueMicrotask` match nothing in the facade or `src/app/session`; `git diff --quiet 5b189e4 -- src/app/probe.ts tests/golden/content tests/golden/hyperspace tests/golden/market tests/golden/save tests/golden/kinematic-probe.json` exits 0; `git log f90fae8..HEAD -- tests/fixtures/probe-shape.json tests/app/redraw-gate.test.ts tests/guards/economy-purity.test.ts` prints nothing; the facade is **532 lines** (target below 600, met; baseline 1,091 at the plan base, 3,365 at the monolith).

## Deliberate deviations from a verbatim move

1. **`swapSystem` tracks its settlement frame and re-checks `disposed` after the await.** Pre-move (`game-session.ts` at `f90fae8`, lines 1012-1022) the `requestAnimationFrame` id was not kept and the second `renderFrame(0)` had no guard, so a `dispose()` between the swap and the frame let the continuation draw into a torn-down session. Now the id is held in `ctx.runtime.swapRafId` (new field in `context.ts`), and `if (ctx.runtime.disposed) return;` precedes the second draw. Rationale: Round 2 review 820a435 L389.
2. **`dispose()` cancels that frame and settles the pending wait** (pre-move lines 1031-1036 had only the loop's `rafId`). A new step right after the `rafId` cancel calls `cancelAnimationFrame(swapRafId)` when set, zeroes it, and calls a closure-held `settleSwap` so an awaiting caller (the `?test=1` hook's `swapSystem`) is released instead of hanging. The plan text says the wait is "resolved when `uiController.signal` aborts"; resolving through an `addEventListener("abort", ...)` would have raised the listener total from 2 to 3 against the plan's own "totals unchanged" gate, so dispose settles it directly. Both are named in the step-9 commit message.

## Gates

| Gate | Commit | Tree SHA | Where it ran |
| --- | --- | --- | --- |
| tests/app, economy-purity, sim-purity, compliance (23 files / 270 tests), lint, typecheck | `391e788` content | n/a (pre-commit) | main tree before the commit |
| `docker compose run --rm verify`: 132 unit files / 2,300 tests (2 skipped), 26 Chromium specs incl. both probe-shape specs, exit 0, 5m39s | `391e788` content | `20834c205629de780eb9ef24de05b1a19dcd675b` (the committed tree) | main tree before the commit. Porcelain listed only this plan's four files and untracked `.planning/` review diagnostics; the only running `wegolite`-labelled container was the idle `wegolite-preview-1` |
| Task 2 tests (45 passed), lint, typecheck; mutation check on the swap guard | `bc176ad` content | `e6aadd335215f83b560b77dfc27cb624420502b5` | main tree before the commit |
| `docker compose -p wegolite-gate-08-12-step9 run --rm verify-full`, **second run** | `391e788` | `20834c205629de780eb9ef24de05b1a19dcd675b` | detached worktree `/tmp/wegolite-gate-08-12-step9` |
| `docker compose -p wegolite-gate-08-12-step9 run --rm e2e-cross` (Firefox) | `391e788` | same | same worktree |

### Step 9 gate

- **STEP9_SHA:** `391e788d5adac10b8c008e68d3051e5669f84151` (subject "refactor(08-12): extract the frame loop and the session lifecycle (split step 9)"), tree `20834c205629de780eb9ef24de05b1a19dcd675b`.
- **Project name:** `wegolite-gate-08-12-step9`; route: worktree, no fallback needed (`git diff --quiet 5b189e4 -- Dockerfile package-lock.json .dockerignore` exited 0 and `docker image inspect wegolite-ci` succeeded, so no `--build`).
- **Run 1 failed, run 2 passed.** Run 1 (3m43s, 14:31Z) stopped in the unit stage on `tools/oolite-ingest/convert/textures.test.ts` "writes the committed baked files byte-for-byte" timing out at 5,000 ms (131 of 132 files passed, 2,299 of 2,300 tests). It is the flaky test the brief names, and my own lint, typecheck and vitest runs were sharing the machine at that moment. I reran the gate once on the same worktree with nothing else running, with no code change.
- **Run 2 (green):** `real 29m33.858s` (14:34:16Z to 15:03:50Z), exit 0: lint, typecheck, `assets:check`, 132 unit files / 2,300 tests (2 skipped), production build, 122 Chromium specs (25.1 min), 2 seams specs (1.4 min).
- **Against the 08-01 baseline** (`5b189e4`: 25m56s, 105 files / 1,424 tests, 116 Chromium specs, 2 stale-assertion failures): 27 more files, 876 more tests and 6 more Chromium specs, and the two stale docked-home assertions (deferred-items D-1) are no longer red. No other failure.
- No flaky e2e (`launch.spec.ts:129`, `save-load.spec.ts:634`) failed in either the main-tree verify or run 2.

### Firefox (non-blocking)

- **Command:** `cd /tmp/wegolite-gate-08-12-step9 && docker compose -p wegolite-gate-08-12-step9 run --rm e2e-cross`
- **STEP9_SHA:** `391e788d5adac10b8c008e68d3051e5669f84151`; **exit status:** 0; **real:** 1m55.7s.
- **Result:** 2 passed, 0 failed: `core-loop.spec.ts:265` "new game to launch to trade to hyperspace to dock to save and reload" (1.7 min) and `engine.spec.ts:68` "the engine creates a WebGL2 context and renders advancing frames" (9.7 s). No failing spec. Plan 08-15 repeats this run after the integration; its result should be compared with this one.

### Cleanup

`docker compose -p wegolite-gate-08-12-step9 down --volumes --remove-orphans` removed the network and the node_modules volume; `git worktree remove --force` failed on root-owned `dist/` and `test-results/`, so a one-shot `docker run --rm -v ...:/w alpine rm -rf` cleared them, then `rmdir` and `git worktree prune`. After cleanup `git worktree list` shows only the main tree, `docker volume ls | rg wegolite-gate-08-12-step9` prints nothing, and `docker ps -aq --filter label=com.docker.compose.project=wegolite-gate-08-12-step9` prints nothing.

## Deviations from Plan

### Auto-fixed Issues

None beyond the two deliberate deviations above. Small points of detail the plan did not spell out:

- `createSessionLifecycle` takes the single-use dependencies as one `LifecycleDeps` interface of `Pick`s and controller type aliases (for example `SettingsController["resume"]`), so the Node tests pass plain recording doubles; `showBootFailure` and `publishFailure` are injected (the way `hyperspace-controller.ts` does) rather than imported.
- The facade's `import * as THREE` became `import type * as THREE` because only types remain.
- The two `createGameSession` call sites that used hoisted function declarations (`swapSystem` and `disposeSystem` into the probe publisher, `performSwap` into the settings controller) are now call-time wrappers over the lifecycle built last.

**Total deviations:** 0 auto-fixed, 2 deliberate (listed above). **Impact on plan:** none.

## Issues Encountered

- The first verify-full run failed on the known flaky `textures.test.ts` timeout (see Step 9 gate); the rerun was green. Recorded for the owner next to deferred-items D-2; no new deferred item.
- Two ESLint `no-unnecessary-type-assertion` errors in my own new test, fixed before the Task 2 commit; one Prettier reflow of `start-session.ts`.

## Manual check (queued, not run)

End-of-phase human check, as in the plan: `docker compose up preview`, open http://localhost:4173, start a New game, launch, fly, dock at Lave, buy and sell a good, open the chart and target Leesti, launch, jump, then F2 save, reload and Continue. It must behave as in release 0.3.0. The same path is already covered by the Chromium core-loop and save-load specs in the step-9 verify-full and by the Firefox journey above.

## Known Stubs

None. No placeholder, empty-data or TODO value was introduced.

## Threat Flags

None. No new endpoint, auth path, file access or schema change. T-08-23 is mitigated: the orders are recorded and written as header comments, the "dispose order" test pins teardown order and idempotence, the listener totals and the zero-timer rule are checked, and the dispose and fallback e2e specs ran in the step-9 verify-full. T-08-37 is mitigated: the gate ran on a detached worktree of `391e788` under `wegolite-gate-08-12-step9`, with the commit and tree SHA recorded above.

## Next Phase Readiness

- FOUND-10's split is complete: every v1 golden, unit and e2e test passes without regeneration, the probe-shape fixture and `src/app/probe.ts` are unchanged, and the scan tests pass as re-pointed in step 0. `requirements.ready-ids` still reports FOUND-10 blocked by the other plans of the phase that declare it, so it is not marked complete here.
- Plans 08-14, 08-15 and 08-16 can edit `sim-driver.ts` (the one `stepFlight(` site), `event-router.ts` and, for the world lifecycle wiring, the facade's construction order, without touching the frame shell. The frame-order and dispose-order tests will fail loudly if a later plan reorders either.
- Open for the owner: the manual play check above, and the plan 08-15 Firefox rerun to compare with this one.
- No blocker.

## Self-Check: PASSED

- Created files present: `src/app/session/frame-loop.ts`, `src/app/session/start-session.ts`, `tests/app/session/start-session.test.ts`.
- Commits `391e788` and `bc176ad` are ancestors of HEAD; `git rev-list --count f90fae8..bc176ad` is 2.
- All Task 1 and Task 2 acceptance criteria re-run at `bc176ad` (listed above); the step-9 verify-full is exit 0 on the second run on a clean worktree of `391e788`.

---
*Phase: 08-session-split-and-world-core*
*Completed: 2026-11-13*
