---
phase: 08-session-split-and-world-core
plan: 06
subsystem: app
tags: [session-split, render-driver, chart-controller, settings-controller, refactor, g-8, redraw-gate]

requires:
  - phase: 08-session-split-and-world-core
    provides: 08-04 typed SessionState, SessionDeps and the probe publisher (the context and deps shapes these modules take)
provides:
  - src/app/session/render-driver.ts, createRenderDriver(ctx, deps) returning renderFrame, shouldDraw, drawKeys and showHint, plus RenderDriverDeps and RenderDriver (ReturnType)
  - src/app/session/chart-controller.ts, createChartController(ctx, deps) returning the ten chart functions, plus ChartControllerDeps and ChartController
  - src/app/session/settings-controller.ts, createSettingsController(ctx, deps) returning pause, resume, focus loss, context loss, the two sub-panels, quality and persistSettings, plus SettingsControllerDeps and SettingsController
  - tests/app/session/render-driver.test.ts, chart-controller.test.ts and settings-controller.test.ts (fake context, Node only)
affects: [08-08, 08-10, 08-12, 08-14, 08-15, 08-16]

actuals:
  tokens: 18345
  tasks: 2
  commits: 3

tech-stack:
  added: []
  patterns:
    - "a session module that the facade needs by name is built once with createX(ctx, deps) and destructured into the same names the old function declarations had, so every call site in game-session.ts is untouched"
    - "a controller factory registers nothing on construction; the two window keydown registrations stay in the facade, and the settings controller only supplies the handler"
    - "a driver type is derived with ReturnType so no interface spells a second two-parameter renderFrame"

key-files:
  created:
    - src/app/session/render-driver.ts
    - src/app/session/chart-controller.ts
    - src/app/session/settings-controller.ts
    - tests/app/session/render-driver.test.ts
    - tests/app/session/chart-controller.test.ts
    - tests/app/session/settings-controller.test.ts
  modified:
    - src/app/game-session.ts
    - .planning/phases/08-session-split-and-world-core/deferred-items.md

key-decisions:
  - "the render driver takes updateProbe as a function (probePublisher.updateProbe) and calls it as updateProbe(), so the 15-site call count of 08-04 is unchanged and the driver does not hold the whole publisher"
  - "the controllers take renderFrame, syncStationNav, refreshStationChrome, performSwap and updateProbe as dependency functions (the plan said accessors for the owners that move later), so split steps 7 and 9 can move those owners without touching the controllers"
  - "enterSystemById and targetSystem stay in game-session.ts; targetSystem reaches only the render driver, and the chart controller needs neither"
  - "closeChart does not call redrawGate.request() and was not changed to: the chart-open branch of frame() requests a redraw on every frame while the chart is open, and a sixth request would break the pinned total of five"

patterns-established:
  - "a split step that touches render code is verified with verify-full on a detached worktree of its own commit, under its own Compose project, and cleaned up (containers, volume, worktree) afterwards"

requirements-completed: [FOUND-10]

coverage:
  - id: D1
    description: "Split step 3: renderFrame, showHint, shouldDraw and drawKeys live in render-driver.ts; the single gated call renderFrame(alpha, shouldDraw()) stays in frame(); the redraw gate keys on the identity of the live state, scene and nebula revision, all read at call time"
    requirement: FOUND-10
    verification:
      - kind: unit
        ref: "tests/app/session/render-driver.test.ts (9 tests: settle frames, state replacement, scene replacement, nebula revision, request(), pause, inFlight, drawKeys, not-loaded renderFrame)"
        status: pass
      - kind: unit
        ref: "tests/app/redraw-gate.test.ts (the pinned-literal scans over the facade and src/app/session/**)"
        status: pass
      - kind: e2e
        ref: "docker compose -p wegolite-gate-08-06-step3 run --rm verify-full on a detached worktree of 5c34578 (tree 040ad6fd), second run: 115 unit files / 1674 tests, 122 Chromium specs, 2 seams specs, exit 0"
        status: pass
    human_judgment: false
  - id: D2
    description: "Split step 4: the chart overlay logic lives in chart-controller.ts; pause, resume, focus loss, context loss, the controls and settings panels and graphics quality live in settings-controller.ts; neither factory registers a listener; listener totals and registration sites are unchanged"
    requirement: FOUND-10
    verification:
      - kind: unit
        ref: "tests/app/session/chart-controller.test.ts (11 tests) and tests/app/session/settings-controller.test.ts (17 tests)"
        status: pass
      - kind: e2e
        ref: "chart-gestures, settings and context-loss browser specs on the step-4 tree: 16 passed"
        status: pass
      - kind: other
        ref: "git grep -c -F addEventListener( at 5c34578 and at 5f31b0f: both src/app/game-session.ts:2; removeEventListener( prints nothing at both"
        status: pass
    human_judgment: false
  - id: D3
    description: "A resume while the WebGL context is lost is refused and leaves the session paused (T-08-11); focus loss clears input always and pauses only when pauseOnFocusLoss is on"
    requirement: FOUND-10
    verification:
      - kind: unit
        ref: "tests/app/session/settings-controller.test.ts#resume is refused while the WebGL context is lost (QUAL-05)"
        status: pass
      - kind: e2e
        ref: "tests/e2e/context-loss.spec.ts (3 specs) in the step-3 verify-full and the step-4 targeted run"
        status: pass
    human_judgment: false
  - id: D4
    description: "The frozen files (probe.ts, probe-shape.json, redraw-gate and economy-purity tests, goldens) are untouched and createGameSession is still the only public entry (9 exports); verify is green on both commits including the probe-shape spec"
    requirement: FOUND-10
    verification:
      - kind: other
        ref: "git diff --quiet cc3f527 -- src/app/probe.ts tests/fixtures/probe-shape.json tests/app/redraw-gate.test.ts tests/guards/economy-purity.test.ts tests/golden (exit 0); rg -c \"^export\" src/app/game-session.ts (9)"
        status: pass
      - kind: e2e
        ref: "docker compose run --rm verify, Task 1 (second run) and Task 2: 26 e2e passed incl. 6 probe-shape specs"
        status: pass
    human_judgment: false

duration: 110min
completed: 2026-11-13
status: complete
plan_head_before: cc3f527468d6717f44aabcc9bb6e170ea2777763
plan_head_after: 5f31b0f81539fd6e9345b213ba095c2070059a6f
---

# Phase 8 Plan 06: Session split steps 3 and 4 Summary

**The render driver (renderFrame, shouldDraw, drawKeys, showHint) is extracted with the redraw gate's contract intact and verify-full green on a detached worktree of its commit; the chart and settings logic follow as two controllers that register no listener, with fake-context proofs of the redraw identity keys, the resume refusal during context loss, focus-loss pausing and the chart preset toggle; two commits, each with verify green.**

## Performance

- **Duration:** about 110 min (the start time was not captured at spawn; estimated from tool timestamps, first work about 09:50Z, last task commit 11:36Z, most of it waiting on two 5-minute fast gates and a 29-minute verify-full)
- **Tasks:** 2 (Task 1 tracer, Task 2 auto)
- **Files modified:** 8 (6 created, 2 modified)
- **Diff size:** 1409 insertions, 537 deletions over `src` and `tests`; `actuals.tokens` is chars/4 over that diff (73,379 chars)
- **game-session.ts:** 3,108 lines to 2,633

## Accomplishments

- **Step 3, the render driver (5c34578).** `createRenderDriver(ctx, deps)` returns `renderFrame`, `shouldDraw`, `drawKeys` and `showHint`; the four bodies moved verbatim, reading every live field through `ctx` inside the function that needs it. The declaration is still `function renderFrame(alpha: number, draw = true): void`, the driver type is `ReturnType<typeof createRenderDriver>` (no interface spells the two-parameter signature), and `frame()` keeps the one gated call `renderFrame(alpha, shouldDraw())` through `const { renderFrame, shouldDraw } = renderDriver;`. Every other caller (`startSession`, `swapSystem`, `exitContextLoss`, `applyQuality`) still passes one argument.
- **Step 4, the chart and settings controllers (5f31b0f).** `createChartController` returns setChartCamera, toggleChartPreset, currentChartView, refreshChart, openChart, closeChart, selectChartSystem, moveChartSelection, applyChartAction and handleChartActions; `createSettingsController` returns persistSettings, pause, focusLost, resume, enterContextLoss, exitContextLoss, backToPause, openControls, syncPauseOnFocusLossToggle, syncQualityToggle, applyQuality, openSettings, resetAllSettings and onSubpanelKeyDown. The facade destructures the names it still calls, so no call site changed. `game-session.ts` lost 343 lines in step 4 and 175 in step 3, and its unused imports went with them.
- **Fake-context proofs (37 tests, Node only).** The render-driver test drives a real `createRedrawGate`: a docked session draws exactly `IDLE_SETTLE_DRAWS` frames and stops; replacing the flight state with a structurally equal copy, replacing the scene, advancing the live scene's nebula revision and `request()` each make the next frames draw; an inFlight session always draws; a pause goes quiet and a resume wakes. The settings test proves the resume refusal while `contextLost`, focus loss (always clears input, pauses only when `pauseOnFocusLoss`), pause then resume resetting the loop, the context-loss notices and the quality rollback on a failed rebuild. The chart test proves the local and galaxy toggle with the matching camera, the inert cases, open and close, and the confirm commit.

## Task Commits

1. **Task 1: Split step 3, the render driver** - `5c34578` (refactor)
2. **Task 2: Split step 4, the chart and settings controllers** - `5f31b0f` (refactor)

**Plan metadata:** the docs commit that carries this SUMMARY (see `git log`). The measured `commits: 3` in the frontmatter is `git rev-list --count cc3f527..5f31b0f`; one of the three is `d8f7eb6` ("docs: add backlog item 999.1", not part of this plan), which landed on main between the two task commits.

## Step 3 gate

| Item | Value |
| --- | --- |
| STEP3_SHA | `5c3457846760525408f89fa6cd1d9eca52bbc9e7` |
| Tree SHA (`git rev-parse "$STEP3_SHA^{tree}"`) | `040ad6fdc6f88fc5effdcc0873888a75f40fb15d` |
| Subject | `refactor(08-06): extract the render driver (split step 3)` |
| Route | detached worktree `/tmp/wegolite-gate-08-06-step3`, Compose project `wegolite-gate-08-06-step3` (08-01's worktree route works; no fallback used; no `--build`) |
| Result | `docker compose -p wegolite-gate-08-06-step3 run --rm verify-full` exit 0 on the second run: lint, typecheck, assets:check, 115 unit files / 1,674 tests (2 skipped), build, 122 Chromium specs, 2 seams specs; wall time 29 min 6 s |
| First run | exit 1 after 28 min: 121 of 122 Chromium specs passed, `launch.spec.ts:129` ("hints stay on the message line") timed out at the "Torus drive" wait. It is a pre-existing flake (see Issues Encountered), so the same commit was gated again rather than amended; the second run on the same SHA and tree is the evidence recorded here |
| Cleanup | `docker compose -p wegolite-gate-08-06-step3 down --volumes --remove-orphans`, worktree removed (root-owned `dist/`, `test-results/`, `coverage/` cleared with a one-shot `docker run` first, as in 08-01), `git worktree list` shows only the main tree; `docker ps -aq --filter label=com.docker.compose.project=wegolite-gate-08-06-step3` and `docker volume ls` for the project print nothing |

Other gates:

| Gate | Commit | Tree SHA | Where it ran |
| --- | --- | --- | --- |
| scan tests plus render-driver test, 52 passed; `docker compose run --rm verify` green on the second run (115 unit files / 1,674 tests, 26 e2e incl. 6 probe-shape specs) | `5c34578` | `040ad6fdc6f88fc5effdcc0873888a75f40fb15d` | main tree, before the commit, on the content the commit recorded (porcelain listed only this plan's files and untracked `.planning/` review diagnostics; the only running `wegolite`-labelled container was the idle `wegolite-preview-1`, which writes nothing) |
| `tests/app/session` + redraw-gate + economy-purity, 77 passed; chart-gestures, settings and context-loss specs, 16 passed; `docker compose run --rm verify` green (117 unit files / 1,702 tests, 26 e2e incl. 6 probe-shape specs) | `5f31b0f` | `3dd47808276ecb8e5448c3873288fac4450337e5` | main tree, before the commit, same condition |

## Listener counts

Reproducible from git (the step-3 commit is the tree step 4 starts from):

```
git grep -c -F "addEventListener(" 5c34578... -- src/app/game-session.ts src/app/session
  5c34578...:src/app/game-session.ts:2
git grep -c -F "removeEventListener(" 5c34578... -- src/app/game-session.ts src/app/session
  (no output)
git grep -c -F "addEventListener(" 5f31b0f -- src/app/game-session.ts src/app/session
  5f31b0f:src/app/game-session.ts:2        (HEAD after step 4)
git grep -c -F "removeEventListener(" 5f31b0f -- src/app/game-session.ts src/app/session
  (no output)
```

Totals before and after: `addEventListener(` 2 and 2, `removeEventListener(` 0 and 0. Registration sites, unchanged and still in `createGameSession` at construction time: `window.addEventListener("keydown", onSubpanelKeyDown, { capture: true, signal: uiController.signal })` (the handler now comes from `settingsController`) and `window.addEventListener("keydown", onLaunchKeyDown, ...)`. The pause overlay, controls panel and settings panel register their own DOM handlers inside `src/ui/*` and are wired from `startSession`, which this plan does not edit. Neither controller factory touches `window` or `document` (`rg -n "window|document"` over the two files matches only comments), so Node unit tests construct them freely. `frame()`'s chart-open and save-screen freeze branches are not edited.

## Files Created/Modified

- `src/app/session/render-driver.ts` - `createRenderDriver`, `RenderDriverDeps`, `RenderDriver`
- `src/app/session/chart-controller.ts` - `createChartController`, `ChartControllerDeps`, `ChartController`
- `src/app/session/settings-controller.ts` - `createSettingsController`, `SettingsControllerDeps`, `SettingsController`
- `tests/app/session/render-driver.test.ts`, `chart-controller.test.ts`, `settings-controller.test.ts` - the fake-context proofs
- `src/app/game-session.ts` - the moved function bodies removed, the three factories wired and destructured, unused imports dropped
- `.planning/phases/08-session-split-and-world-core/deferred-items.md` - D-2, the intermittent e2e flakes

## Decisions Made

See `key-decisions` in the frontmatter: `updateProbe` and the later-moving owners reach the modules as dependency functions; `enterSystemById` and `targetSystem` stay in the facade; `closeChart` keeps not requesting a redraw itself.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Plan premise vs code] The plan's chart test asserted a redraw request that closeChart never makes**
- **Found during:** Task 2 (writing chart-controller.test.ts)
- **Issue:** the plan says closeChart "calls redrawGate.request (observable as the next gate decision being true)". `closeChart` has no `redrawGate.request()`; it is `frame()`'s chart-open branch that requests a redraw on every frame while the chart is open, so the gate is already owed when the chart closes. Adding a request to `closeChart` would be a behaviour change and a sixth `redrawGate.request();`, against the pinned total of five and the "no behaviour change" goal.
- **Fix:** the test asserts what `closeChart` does (chartOpen false, overlay hidden, input context restored, loop reset, station nav synced, probe updated, and no-op when closed). The redraw side of the chart is covered by the frame() branch and `tests/e2e/chart-gestures.spec.ts`.
- **Files modified:** `tests/app/session/chart-controller.test.ts`
- **Committed in:** `5f31b0f`

**2. [Rule 3 - Blocking] A comment of mine matched the pinned-literal scan**
- **Found during:** Task 1 (targeted scan run)
- **Issue:** a comment in `game-session.ts` spelled `renderFrame(alpha, shouldDraw())`, which made the scan count two occurrences instead of one.
- **Fix:** reworded the comment before the commit.
- **Files modified:** `src/app/game-session.ts`
- **Committed in:** `5c34578`

---

**Total deviations:** 2 auto-fixed (1 plan premise corrected, 1 blocking)
**Impact on plan:** none on scope; the first keeps the split behaviour-neutral, the second is a comment.

## Issues Encountered

- **Intermittent e2e failures, not caused by this plan (logged as D-2 in `deferred-items.md`).** `tests/e2e/save-load.spec.ts:634` timed out once waiting for `#docked` in `startNewGame` on the first fast gate of Task 1 (green on the immediate rerun and 4 of 4 repeats; the fast gate was rerun once, as the brief says). `tests/e2e/launch.spec.ts:129` failed in the first step-3 verify-full and in some repeats: the "Torus drive" hint is on `probe.hint` for one frame only, so the poll can miss it on a loaded host. An alternating A/B run (load average about 10) failed 1/8, 1/8 and 0/8 on the base cc3f527 and 2/8, 0/8 and 1/8 on the step-3 commit, so the flake pre-exists the split; verify-full on the same commit passed on rerun. The tools/oolite-ingest texture timeout seen in 08-04 did not recur.
- Gate attribution: during the A/B runs and the step-3 verify-full I did not run other Docker work in the main tree. No plan 08-07 file was in the main tree at any gate (porcelain was clean of them); a docs commit (`d8f7eb6`) from another source landed between the task commits.

## Known Stubs

None. No placeholder, empty-data or TODO value was introduced; the three factories hold no state of their own.

## Threat Flags

None. No new endpoint, auth path, file access or schema change. T-08-11 is mitigated: the resume refusal while `contextLost` moved verbatim, is unit-proven, and the context-loss e2e spec ran in the step-3 verify-full and the step-4 targeted run. T-08-35 is mitigated: the step-3 verify-full ran on a detached worktree of 5c34578, with its commit and tree SHA recorded above.

## Next Phase Readiness

- Plan 08-08 (split step 5) can move the save and persistence orchestration; it will reach the controllers' siblings through `ctx` and the same dependency-function pattern. `enterSystemById` and `targetSystem` are still in the facade for step 7.
- Plan 08-12 (step 9) moves the two window `keydown` registrations (`onSubpanelKeyDown` from `settingsController`, `onLaunchKeyDown`) into `createSessionLifecycle` and runs `e2e-cross`.
- No blocker.

## Self-Check: PASSED

- Created files present on disk: `src/app/session/render-driver.ts`, `chart-controller.ts`, `settings-controller.ts` and the three tests under `tests/app/session/`.
- Commits `5c34578` and `5f31b0f` are ancestors of HEAD; `git rev-list --count cc3f527..5f31b0f` is 3 (two plan commits plus the unrelated `d8f7eb6`).
- Acceptance greps re-run after Task 2: one `function renderFrame(alpha: number, draw = true)` in the driver and none in the facade; one `renderFrame(alpha, shouldDraw())` across the session sources; no `^  (const|let) [^=]*= ctx\.` line in the facade, the driver or the controllers; one `function toggleChartPreset` and one `function resume` in the controllers and neither in the facade; five `redrawGate.request();` (four facade, one publisher); 9 exports; the frozen files identical to cc3f527; no `/tmp/wegolite-gate-08-06-step3` worktree, container or volume left.

---
*Phase: 08-session-split-and-world-core*
*Completed: 2026-11-13*
