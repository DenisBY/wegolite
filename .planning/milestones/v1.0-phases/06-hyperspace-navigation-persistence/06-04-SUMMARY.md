---
phase: 06-hyperspace-navigation-persistence
plan: 04
subsystem: app
tags: [hyperspace, chart, countdown, arrival-swap, autosave, in-flight-restore, docked-telemetry]

requires:
  - phase: 06-hyperspace-navigation-persistence
    provides: plan 06-01's integer jump math, countdown, arrival pose and chained seed
  - phase: 06-hyperspace-navigation-persistence
    provides: plan 06-02's v2 save pipeline, pose/market restore and target field
  - phase: 06-hyperspace-navigation-persistence
    provides: plan 06-03's chart view model, painter and DOM shell
  - phase: 05-docked-economy-station-screens
    provides: the station shell, F5 status model and docked autosave seam
provides:
  - F6 chart suspension and the committed-target session state
  - H countdown, zero-cost abort, refusal copy and integer fuel deduction
  - build-before-swap arrival with a chained market seed and arrival autosave
  - docked-event and pre-launch anchors with no post-launch in-flight write
  - in-flight Continue that installs the saved system, pose, market and target
  - a durable target on F5 and inside the existing HUD clock element
affects: [06-05 save/load UI, 06-06 end-to-end proof]

actuals:
  tokens: 18974
  tasks: 3
  commits: 3
  plan_head_before: 4360e60
  plan_head_after: 0fa73a1

tech-stack:
  added: []
  patterns:
    - Mutable system + validated galaxy map; every target id resolves before use
    - Frame-level chart suspension (drain, advance nothing, render nothing)
    - Live-layout step callback so a mid-frame swap cannot step the origin scene
    - One synchronous arrival install block with one seed assignment
    - Restore install block publishes the pose once and never per frame

key-files:
  created:
    - tests/e2e/hyperspace.spec.ts
    - tests/e2e/helpers/chart.ts
    - tests/ui/hud-model.test.ts
  modified:
    - src/app/game-session.ts
    - src/app/probe.ts
    - src/app/hud-model.ts
    - src/render/hud/draw.ts
    - src/ui/station-model.ts
    - src/input/actions.ts
    - src/input/bindings.ts
    - src/input/keyboard.ts
    - src/main.ts
    - tests/e2e/autosave.spec.ts
    - tests/input/bindings.test.ts
    - tests/ui/station-status.test.ts
    - tests/guards/economy-purity.test.ts

key-decisions:
  - "F6 is inert during `launching` and while paused; the chart open sink repeats the guard as defence in depth."
  - "The chart freeze consumes the pause toggle before its early return, so KeyP still pauses over the chart and no latch is stranded."
  - "F6 is an edge action (not a synchronous screen sink): the session owns open/close, selection, range and commit in the frame drain."
  - "The chart view builder is installed with the live session state, and the first view is rebuilt after `show()` because a hidden canvas measures 0x0."
  - "Every step resolves the committed target through `galaxyById`; the step callback reads the live session layout so a mid-frame swap cannot step the origin scene."
  - "The countdown line is a HUD message override, while start/cancel/refusal/arrival copy is app-owned and enqueued once per event."
  - "On arrival the fuel is deducted by the event's integer fuelCost, clamped at 0, before the market is regenerated and `marketSeed` is reassigned to the new seed."
  - "The arrival autosave passes the freshly generated market and the committed target id, so the blob is a complete in-flight v2 snapshot."
  - "A pre-launch launch command writes the anchor before `beginLaunch`; the `launched` handler no longer writes."
  - "A `docked` event writes once at the end of the handler, after the station screen/selection/pose are ready, for manual and computer docking."
  - "In-flight restore resolves and builds the saved system first, installs state/profile/market/target in one block, and hides the station overlay as the last visibility decision."
  - "The committed target is drawn as a second line inside HUD_LAYOUT.clock; HUD_ELEMENTS stays the eleven v1 ids and no rectangle changes."

requirements-completed:
  [NAV-01, NAV-02, NAV-03, NAV-04, NAV-05, NAV-06, SAVE-02, SAVE-03, SAVE-05, WORLD-06]

coverage:
  - id: D1
    description: "F6 chart suspension in flight and docked, paint-on-change accounting, single document footer"
    requirement: "NAV-01"
    verification:
      - kind: e2e
        ref: "tests/e2e/hyperspace.spec.ts#chart target, countdown, abort, refusal, arrival and reload"
        status: pass
    human_judgment: false
  - id: D2
    description: "Click selects, Enter commits, the target survives close/reopen and reload, F5 and the HUD agree"
    requirement: "NAV-02"
    verification:
      - kind: e2e
        ref: "tests/e2e/hyperspace.spec.ts#chart target, countdown, abort, refusal, arrival and reload"
        status: pass
      - kind: unit
        ref: "tests/ui/station-status.test.ts#buildStatusModel hyperspace target"
        status: pass
      - kind: unit
        ref: "tests/ui/hud-model.test.ts#buildHudModel hyperspace target"
        status: pass
      - kind: e2e
        ref: "tests/e2e/autosave.spec.ts#an untainted dock writes exactly one committed revision and reloads to that station"
        status: pass
    human_judgment: false
  - id: D3
    description: "The 15-second fixed-step countdown, exact destination/seconds line and the zero-cost abort"
    requirement: "NAV-04"
    verification:
      - kind: e2e
        ref: "tests/e2e/hyperspace.spec.ts#chart target, countdown, abort, refusal, arrival and reload"
        status: pass
    human_judgment: false
  - id: D4
    description: "Refusal reasons and app-owned copy: no target, too far, insufficient fuel; H inert while docked"
    requirement: "NAV-03"
    verification:
      - kind: e2e
        ref: "tests/e2e/hyperspace.spec.ts#chart target, countdown, abort, refusal, arrival and reload"
        status: pass
    human_judgment: false
  - id: D5
    description: "Synchronous build-before-swap arrival into the destination scene, chained market and deterministic witchpoint pose"
    requirement: "NAV-05"
    verification:
      - kind: e2e
        ref: "tests/e2e/hyperspace.spec.ts#chart target, countdown, abort, refusal, arrival and reload"
        status: pass
    human_judgment: false
  - id: D6
    description: "Arrival autosave then reload to the same system, market goods, pose and target"
    requirement: "SAVE-05"
    verification:
      - kind: e2e
        ref: "tests/e2e/hyperspace.spec.ts#chart target, countdown, abort, refusal, arrival and reload"
        status: pass
    human_judgment: false
  - id: D7
    description: "Pre-launch, docked-event and in-flight-restore anchors"
    requirement: "SAVE-03"
    verification:
      - kind: e2e
        ref: "tests/e2e/autosave.spec.ts#a pre-launch write offers Continue at exactly the docked clock"
        status: pass
      - kind: e2e
        ref: "tests/e2e/autosave.spec.ts#a launch reloads to the station at the pre-launch clock, not +600 s"
        status: pass
      - kind: e2e
        ref: "tests/e2e/autosave.spec.ts#a tainted manual dock reaches the trigger but skips the write: Continue still restores the pre-launch clock"
        status: pass
      - kind: e2e
        ref: "tests/e2e/autosave.spec.ts#an untainted dock writes exactly one committed revision and reloads to that station"
        status: pass
    human_judgment: false
  - id: D8
    description: "Chart/flight/dock input contexts cannot leak into each other; F6 reserved; Escape closes the chart without pausing; KeyP universal"
    requirement: "NAV-06"
    verification:
      - kind: unit
        ref: "tests/input/bindings.test.ts#chart and hyperspace bindings"
        status: pass
    human_judgment: false

duration: 2h
completed: 2026-11-06
status: complete
---

# Phase 6 Plan 4: Hyperspace, Navigation and Persistence Summary

**F6 target -> H countdown -> zero-cost abort -> refusal -> synchronous arrival with a chained market -> arrival autosave -> reload, plus the docked/pre-launch anchors and in-flight Continue**

## Performance

- **Duration:** ~2 h
- **Tasks:** 3
- **Files changed:** 16 (+1,446 / -47)
- **Task commits:** 3

## Accomplishments

- `src/app/game-session.ts` now owns a mutable `system` and a `galaxyById` map built from the passed `galaxy0()`. `enterSystemById` resolves the id, builds the destination `SystemScene` before the old one retires, reads the layout, and throws before any assignment when the id/layout is missing. The dock geometry is never rebuilt.
- F6 is a chart edge action scoped to `flight`, `dockHome`, `dockScreen` and `chart`. Opening captures the previous input context, switches to `chart`, and freezes the frame loop (drain commands, advance nothing, render nothing) without the pause overlay. `show()` is followed by a second `view()` built at the real viewport because a hidden canvas measures 0x0. Closing restores exactly the captured context and resets the loop. `launching` and `paused` both refuse to open.
- Click/arrows select a chart system; Enter commits it as `hyperspaceTargetId`. The committed id is session state, goes into every snapshot, is restored by Continue, and drives both the F5 Hyperspace System line and the HUD clock second line.
- H is flight-scoped. A second H while the fixed-step countdown is active is rewritten to `cancelHyperspace` on the drained command array, before the sim sees it. The countdown line is `Hyperspace to <name> in <seconds> seconds`, while start/cancel/refusal/arrival copy is app-owned. A refusal records `probe.hyperspace.lastRefusal` and never changes fuel or jump time.
- On `hyperspaceJumped` the session deducts the event's integer `fuelCost` (clamped at 0), resolves the destination through the galaxy, computes `arrivalMarketSeed(destination.id, previousSeed)`, builds the new scene, regenerates the market, reassigns `marketSeed`, applies the deterministic witchpoint pose, resets the chart/station UI and writes a complete in-flight autosave.
- The pre-launch anchor writes while the state is still docked and before `beginLaunch`; the `launched` handler no longer writes. The `docked` event writes exactly once at the end of its handler. The in-flight restore builds the saved system first, installs state/profile/market/target in one block, hides the station overlay as the last visibility decision, and publishes the installed pose once on `probe.restore`.
- `probe` gains optional `chart`, `hyperspace`, `restore`, `systemId`, `economy.marketSystemId` and `hud.hyperspaceTarget` groups; `publishFailure` still compiles. The HUD element set stays the eleven v1 ids and `HUD_LAYOUT.clock` is unchanged.

## Task Commits

Each task area was committed as one atomic change:

1. **Task 1/2/3 production wiring + tracer proof** — `f372611` (feat)
2. **Docked, pre-launch and in-flight-restore browser proofs** — `fb3ea4b` (test)
3. **F5 target, HUD clock line and chart input-isolation proofs** — `0fa73a1` (test)

**Plan metadata:** committed separately after this summary.

> The three tasks all edit the single composition root (`src/app/game-session.ts`), so its Task 1/2/3 hunks cannot be split into independently typechecking commits. The production commit therefore carries the shared wiring; the later commits add their dedicated browser and unit proofs. This is recorded as a process deviation below.

## Files Created/Modified

- `src/app/game-session.ts` — mutable system, `galaxyById`, `enterSystemById`, chart open/close/selection/range/commit, countdown mapping and copy, arrival swap and chained seed, pre-launch/docked anchors, in-flight restore, probe sync.
- `src/app/probe.ts` — optional chart/hyperspace/restore groups, optional `hud.hyperspaceTarget`, `economy.marketSystemId`, `systemId`.
- `src/app/hud-model.ts` — `hyperspaceTarget` carried from the committed name.
- `src/render/hud/draw.ts` — second `Hyperspace: <name>` line inside the existing clock rectangle.
- `src/ui/station-model.ts` — optional committed-target name for the F5 line.
- `src/input/actions.ts` — chart/hyperspace action ids, contexts, defaults, F6 reserved, Escape-exempt set.
- `src/input/bindings.ts` — Escape exemption generalised to screen Back actions.
- `src/input/keyboard.ts` — chart context, chart edge queue, H command, Escape exception.
- `src/main.ts` — passes `galaxy: galaxy0()` to the session.
- `tests/e2e/hyperspace.spec.ts` — chart paint accounting, target commit, clock freeze, refusal, cancel, arrival, autosave and reload.
- `tests/e2e/helpers/chart.ts` — fs-backed galaxy-0 reader and pure screen-point helper.
- `tests/e2e/autosave.spec.ts` — pre-launch anchor, tainted dock, untainted committed dock, in-flight Continue and F5 target.
- `tests/ui/station-status.test.ts`, `tests/ui/hud-model.test.ts`, `tests/input/bindings.test.ts` — F5/HUD target and input-context proofs.
- `tests/guards/economy-purity.test.ts` — updated for the two legitimate market producers (boot seed + chained arrival seed), still proving no dock re-seed.

## Decisions Made

- F6 is an edge action, not a synchronous sink: no same-frame key can follow it, so the frame drain owning open/close keeps the input queue model uniform.
- The chart’s first view is rebuilt after `show()` (rather than changing `chart.ts`) because the shell’s public contract is `show` + `view`; the session can force the real-viewport repaint without touching the plan-03 shell.
- The step callback reads the live `layout`/`system` on every step, which is simpler and safer than aborting the rest of a frame after a swap.
- The HUD countdown line is a render-time argument override; nothing is enqueued per step, so the 4-message queue cannot be flushed by a 15 s countdown.
- Fuel is deducted before the new market is generated, and `marketSeed` is always the seed of the market actually installed, so a repeat visit chains deterministically.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The first chart view was built from a 0x0 hidden canvas**
- **Found during:** Task 1 e2e (the first click on Diso did not select)
- **Issue:** `openChart` built `currentChartView(overlay)` while `#chart` was still `hidden`, so the projection had a zero viewport; the shell then painted that stale view after showing, and the resize observer saw no size change from its own bookkeeping.
- **Fix:** after `overlay.show(...)`, call `overlay.view(currentChartView(overlay))` again now that the canvas has its real client size, forcing the viewport-diff repaint. `chart.ts` was not modified.
- **Files modified:** `src/app/game-session.ts`
- **Verification:** `tests/e2e/hyperspace.spec.ts` click/commit/paint assertions pass.
- **Committed in:** `f372611`

**2. [Rule 2 - Missing Critical] In-flight restore published no economy/market identity**
- **Found during:** Task 1 e2e reload assertion (`probe.economy.marketSystemId` was undefined)
- **Issue:** the in-flight restore path intentionally skips `renderStation()`, which is the only caller of `syncEconomyProbe()`, so the reload proof had no durable market identity.
- **Fix:** call `syncEconomyProbe()` in the in-flight install block after the market is assigned.
- **Files modified:** `src/app/game-session.ts`
- **Verification:** the reload assertions in `tests/e2e/hyperspace.spec.ts` pass.
- **Committed in:** `f372611`

**3. [Rule 3 - Blocking] The economy purity guard expected one market producer**
- **Found during:** first full unit run
- **Issue:** `tests/guards/economy-purity.test.ts` asserted exactly one `generateMarket(` in the session; the arrival producer (D-10) is the second, legitimate one.
- **Fix:** assert two producers, pin the chained `arrivalMarketSeed(destination.id, previousSeed)` -> `nextSeed` call, and keep the docked-arm “no generation / no re-seed” checks.
- **Files modified:** `tests/guards/economy-purity.test.ts`
- **Verification:** the file passes (8 tests) and the full suite is green.
- **Committed in:** `f372611`

**4. [Rule 3 - Blocking] The untainted dock proof started inside the disarmed contact proxy**
- **Found during:** Task 2 e2e
- **Issue:** in-flight restore deliberately sets `dockArmed = false`; the manual-dock pose sits inside the mouth because a launch has already armed the latch, so a restored ship there waits forever in the proxy-overlap branch.
- **Fix:** the rewritten test pose starts outside the mouth (`+120` along port k) and flies in at speed 50, so the disarmed latch arms on a real approach.
- **Files modified:** `tests/e2e/autosave.spec.ts`
- **Verification:** the dedicated test and the whole file pass.
- **Committed in:** `fb3ea4b`

**5. [Rule 3 - Blocking] Combined e2e budget was too tight for SwiftShader**
- **Found during:** running `hyperspace.spec.ts` + `autosave.spec.ts` together
- **Issue:** the 15 s fixed-step countdown is wall-clock-independent but the headless renderer runs at a few frames per second; under two workers a 120 s wait and the plan’s 240 s per-test budget were marginal.
- **Fix:** raised the two e2e files to `test.setTimeout(360_000)` and the jump waits to 180 s. No product behaviour changed.
- **Files modified:** `tests/e2e/hyperspace.spec.ts`, `tests/e2e/autosave.spec.ts`
- **Verification:** the combined run is 20/20 green.
- **Committed in:** `f372611`, `fb3ea4b`

### Process Deviation

**6. [Task ordering] Task 1’s tracer reload needed Task 2’s restore, and all three tasks share one file**
- **Found during:** implementation planning
- **Issue:** the Task 1 browser sequence ends with a reload, which cannot return in flight until Task 2’s restore install exists; all three tasks also edit `src/app/game-session.ts`, so a per-task hunk split would not compile at every commit.
- **Resolution:** the production wiring for all three tasks landed in `f372611` (with the tracer proof), followed by the Task 2 browser proofs (`fb3ea4b`) and the Task 3 unit proofs (`0fa73a1`). Task 1’s `<verify>` was therefore re-run after Task 2’s code was in place; the plan-level verification covers both.
- **Impact:** no behavioural or scope change; commit boundaries are coarser than the task list.

---

**Total deviations:** 5 auto-fixed (1 bug, 1 missing-critical, 3 blocking) plus 1 documented process deviation.
**Impact on plan:** the product contract is unchanged; the fixes are integration correctness, a real test-scenario correction, and honest headless timing budgets.

## Issues Encountered

- The full unit suite first failed only on the economy-purity guard (deviation 3); after the update it is 88 files / 1,075 tests green.
- The combined Playwright run is slow (5.1 min) on SwiftShader; the individual files were also run separately and passed (hyperspace 1.6 min, autosave 3.7 min) before the combined 20/20 run.

## User Setup Required

None - no external service configuration required.

## Verification Evidence

- `docker compose run --rm test npx vitest run tests/ui/station-status.test.ts tests/ui/hud-model.test.ts tests/input/bindings.test.ts` -> 3 files, 50 tests passed.
- `docker compose run --rm test` -> 88 files, 1,075 tests passed.
- `docker compose run --rm typecheck` -> `tsconfig.json` and `tsconfig.sim.json` clean.
- `docker compose run --rm lint` -> ESLint clean and Prettier "All matched files use Prettier code style!".
- `docker compose run --rm e2e sh -lc "npm run build && npx playwright test tests/e2e/hyperspace.spec.ts"` -> 1 passed (1.6 min).
- `docker compose run --rm e2e sh -lc "npm run build && npx playwright test tests/e2e/autosave.spec.ts"` -> 19 passed (3.7 min).
- `docker compose run --rm e2e sh -lc "npm run build && npx playwright test tests/e2e/hyperspace.spec.ts tests/e2e/autosave.spec.ts"` -> 20 passed (5.1 min, 2 workers).
- `docker compose run --rm test npx vitest run tests/guards/economy-purity.test.ts` -> 8 passed.

## Next Phase Readiness

- Plan 06-05 can call the same `parseSave`/`restoreFromSave` pipeline through F2 Load; the in-flight install block is already the single place a loaded save becomes session state.
- Plan 06-06 can rely on `probe.restore`, `probe.systemId`, `probe.economy.marketSystemId`, `probe.hyperspace.*`, `probe.chart.*` and `probe.hud.hyperspaceTarget` for end-to-end assertions.
- The chart `show()`-then-`view()` pattern is the documented way to open the overlay at the real viewport; no change to the plan-03 shell is required.
- No blockers.

## Self-Check: PASSED

- `[ -f tests/e2e/hyperspace.spec.ts ]` -> FOUND
- `[ -f tests/e2e/helpers/chart.ts ]` -> FOUND
- `[ -f tests/ui/hud-model.test.ts ]` -> FOUND
- `git merge-base --is-ancestor f372611 HEAD` -> FOUND
- `git merge-base --is-ancestor fb3ea4b HEAD` -> FOUND
- `git merge-base --is-ancestor 0fa73a1 HEAD` -> FOUND
