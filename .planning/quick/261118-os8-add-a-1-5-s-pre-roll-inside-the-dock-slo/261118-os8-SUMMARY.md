---
phase: quick
plan: 261118-os8
subsystem: launch presentation (app session, render launch camera)
tags: [launch, camera, dock-slot, pre-roll, D-10, D-17, D-09, FLGT-01]
status: complete
requires:
  - quick 261118-l26 (launch view from inside the dock slot)
  - quick 261118-mb5 (launch along the slot with Oolite's twist)
provides:
  - LAUNCH_PRE_ROLL_DURATION = 1.5 s presentation pre-roll with the sim docked
  - one-curve launch camera (launchViewAxial, preRollPose, preRollViewTime)
  - D-17 pre-launch anchor on the fixed step that ends the pre-roll
  - probe fields launch.preRolling and launch.preRollElapsed
affects:
  - src/app/session/sim-driver.ts (drain and per-step wrapper)
  - src/app/session/render-driver.ts (pre-roll branch, draw gate)
  - tests/e2e/launch.spec.ts
tech-stack:
  added: []
  patterns:
    - app-side presentation timer advanced on fixed steps, injected launch command
    - length getter read at start time (zero under the manual clock)
key-files:
  created: []
  modified:
    - src/render/launch-camera.ts
    - src/app/launch-sequence.ts
    - src/app/session/sim-driver.ts
    - src/app/session/render-driver.ts
    - src/app/session/event-router.ts
    - src/app/game-session.ts
    - src/app/session/start-session.ts
    - src/app/session/station-controller.ts
    - src/app/session/probe-publisher.ts
    - src/app/probe.ts
    - src/main.ts
    - tests/render/launch-camera.test.ts
    - tests/app/launch-sequence.test.ts
    - tests/app/session/sim-driver.test.ts
    - tests/app/session/render-driver.test.ts
    - tests/app/session/world-lifecycle.test.ts
    - tests/app/session/tick-parity.test.ts
    - tests/app/session/start-session.test.ts
    - tests/app/session/station-controller.test.ts
    - tests/app/session/probe-publisher.test.ts
    - tests/app/redraw-gate.test.ts
    - tests/e2e/launch.spec.ts
    - CHANGELOG.md
    - FIDELITY.md
    - .planning/PROJECT.md
decisions:
  - "Launch pre-roll is app-side: a fixed-step timer in launch-sequence; the sim stays docked and gets one launch command on the step that ends it (design decision 1)"
  - "Pre-roll length is zero under ?test=1&clock=manual so advanceTicks(n) stays exact and every twin hash keeps its tick-1 launch (design decision 2, reversible)"
  - "D-17 pre-launch autosave moved from the key press to the fixed step that ends the pre-roll, once, while docked, immediately before the launch step"
  - "The launched handler snaps previousPose to the launch pose so the launch twist is never drawn half applied"
metrics:
  duration: ~55 min
  completed: 2026-11-18
estimate:
  tokens: 120000
  tasks: 2
actuals:
  tokens: 31000
  tasks: 2
  commits: 3
plan_head_before: 30c637892ecd759deeadaf8c3d796705eed34cc1
plan_head_after: c8192cb
---

# Quick 261118-os8: 1.5 s launch pre-roll inside the dock slot Summary

When you press Launch in a real-time session, a 1.5 s presentation pre-roll now plays first. The camera starts at the
inner end of the Coriolis slot, with the launch twist and the station's roll, and moves toward the mouth while the
simulation stays docked. The unchanged 2 s simulated launch follows, and the camera carries on along one quartic curve,
continuous in position and velocity, to the fore cockpit pose at handover. No file under `src/sim`, `tests/golden` or
`src/content/generated` changed, and no hash or golden pin moved.

## Commits

| Task | Commit | Message |
| ---- | ------ | ------- |
| 1 | e4d0b57 | feat(quick-261118-os8): play a 1.5 s pre-roll inside the dock slot before the launch |
| 2 | 606eedf | feat(quick-261118-os8): skip and pause the launch pre-roll, hide the station nav, probe fields and records |
| 2 (follow-up) | c8192cb | test(quick-261118-os8): record launch.preRolling and launch.preRollElapsed in the probe-shape fixture |

## Decisions as implemented (design decisions 1-10)

1. **Where it lives.** `createLaunchSequence` gained `startPreRoll`, `advancePreRoll`, `skipPreRoll`, `cancelPreRoll`
   and the read-only `preRolling`, `preRollElapsed` and `preRollSkipped`. The sim driver's `drain()` turns a passing
   launch into `startPreRoll()`, drops every launch command from that frame and calls `onPreRollStart` once.
   `stepFixed` (used by `advanceFrame` and `advanceTicks`; `advanceBehind` keeps `stepOnce`) advances the timer on each
   fixed step. On the step that ends it, it calls `autosave()` and then `stepOnce([launch, ...stepCommands])`.
2. **Manual clock.** `game-session.ts` passes `() => (ctx.runtime.testFlags.manualClock ? 0 : LAUNCH_PRE_ROLL_DURATION)`.
   With length 0, `startPreRoll()` returns false and changes nothing. The drain then keeps today's path (autosave in
   the drain, launch on the first step). The tick-parity and world-lifecycle twins use
   `createLaunchSequence(() => 0)` and their expectations did not change.
3. **One view timeline.** `preRollViewTime(elapsed, alpha)` is used while pre-rolling. While launching the view time
   is `LAUNCH_PRE_ROLL_DURATION + launchViewElapsed(...)`. `LAUNCH_VIEW_DURATION = 3.5`.
4. **The axial curve.** `launchViewAxial` is the quartic from the plan, `g(u) = (4 - m) u^3 + (m - 3) u^4`. A
   non-finite tau reads as the end of the view.
5. **The camera.** `computeSlotLaunchCamera(layout, slotDepth, launchSpeed, position, orientation, tau)`. Its pullback
   is `lead + launchSpeed * max(0, tau - PRE) - launchViewAxial(...)`, with tau clamped to `[0, LAUNCH_VIEW_DURATION]`.
   A bad depth or speed gives the plain cockpit pose.
6. **The pre-roll pose.** `preRollPose` returns the dock mouth and
   `normalize(launchOrientation * axisAngle(z, launchViewStationAngle(layout, tau)))`. `launchViewStationAngle` now
   takes the view time: `rate * (tau - PRE)`.
7. **Expected values.** See the table below. No station number appears in code, and the source guard is green.
8. **Presentation.** `onPreRollStart` hides the shell, switches input to `flight` and syncs the nav. While the pre-roll
   runs:
   - the render driver draws (`shouldDraw` freezes a docked session only when it is not pre-rolling);
   - the camera follows the pre-roll pose and the station is rolled at the view time;
   - `#hud` is hidden and carries `data-launching`;
   - the Cobra stays hidden;
   - the nav state reports `launching`;
   - the probe publishes `launch.preRolling` and `launch.preRollElapsed`, and `mode` stays `docked`.
9. **Skip and pause.** In the pre-roll, `onLaunchKeyDown` calls `skipPreRoll()` (same pause, repeat, modifier and
   `canSkip` guards) and pushes nothing. The step that ends a skipped pre-roll launches and leaves `skipLaunch` on
   `pending`. Pause needs nothing new.
10. **Safety.** `stepFixed` cancels a pre-roll when the live state is no longer docked on the home screen. `reset()`
    ends it. `startPreRoll()` clears `elapsed` and `complete` and never restarts a running pre-roll.

The "launched" handler now sets `ctx.core.previousPose = poseOf(state)`, as the "docked" handler does.

## Expected versus measured curve (shipped data: depth 250 m, launch speed 175 m/s, lead 31 m)

The values come from the formula, evaluated in Python with the data read from `dock-port.json` (`port.depth`) and
`config.ts` (`0.5 * maxSpeed`). The unit tests pin the implementation to that formula: start at `-depth`, end at
`v * 2 + lead`, monotone, inside the slot at 2.0 s and outside at 2.5 s, a seamless boundary, and handover equal to the
cockpit pose within 1e-6.

| Quantity | Plan (decision 7) | Measured |
| --- | --- | --- |
| span, m | 631 m, 0.97068 | 631.0, 0.97068 |
| axial at tau 0 / 0.75 / 1.5 s | -250.0 / -233.9 / -142.7 m | -250.0 / -233.9 / -142.7 m |
| speed at 1.5 s | 185.7 m/s | 185.7 m/s |
| axial and speed at 3.5 s | +381.0 m, 175.0 m/s | +381.0 m, 175.0 m/s |
| mouth crossing | 2.111 s | 2.1112 s |
| peak speed | 304.3 m/s at 2.61 s | 304.3 m/s at 2.6124 s |
| camera 145 m from the mouth (geometric estimate of the top wall leaving) | ~1.49 s | 1.4878 s |

## Mutation evidence

- **Speed term dropped from the pullback** (`0 * launchSpeed * ...`): "meets the sim launch at the boundary ..." went
  red with a velocity jump of 176.4 m/s against the 3.5 m/s bound. "flies out through the slot ..." and "lands on the
  cockpit pose ..." went red too, the latter with a handover error of 350 m.
- **previousPose snap removed** from the "launched" handler: the render-driver test "draws the launch step at the
  launch pose with the full twist ..." went red (camera x off by 0.209 m at alpha 0.5).
- Both were restored from byte copies, and the targeted suite was green again before the Task 1 commit.

## Re-pinned or rewritten tests, with causes

- `tests/render/launch-camera.test.ts`: the l26/mb5 camera tests moved to the new signature and the view timeline.
  The "starts ... inside the mouth" test became the full-depth pre-roll start, and the station-angle invariant
  (1, 24, 120 and 239 steps) now uses the view time. New tests cover the curve, wall stillness, the boundary, the full
  view run and `preRollViewTime`. Cause: the new curve and signature (decisions 3-6).
- `tests/app/session/render-driver.test.ts`: the l26 launch-view test uses `LAUNCH_PRE_ROLL_DURATION + launchViewElapsed`
  and the new signature. Four new tests cover the pre-roll draw, the draw gate, `data-launching` and the snap. Cause:
  decisions 3, 5 and 8.
- `tests/app/session/world-lifecycle.test.ts` and `tests/app/session/tick-parity.test.ts`: the `{ advance }` fakes
  became `createLaunchSequence(() => 0)` plus `onPreRollStart`; tick-parity's probe publisher got the `launchSequence`
  dep. Every expectation and hash is unchanged.
- `tests/app/redraw-gate.test.ts`, "treats exactly docked and paused as idle": this source-text guard pinned
  `redrawGate.next(paused || state?.mode === "docked", ...)`. It is renamed and now pins the `frozenDocked` line.
  Cause: decision 8. It was found by the full local suite after the Task 1 commit and fixed in the Task 2 commit (see
  Deviations).
- `tests/e2e/launch.spec.ts`: the first-launch test now pins the pre-roll (docked, count 0, clock unchanged, save
  `attempts` unchanged, shell, nav, HUD and overlay lines hidden) and then the launch (count 1, +600 to +602 s,
  `attempts` + 1). The skip test presses during the pre-roll. The pause test is renamed "the pre-roll and the launch
  view freeze with pause" and pauses in the pre-roll first. The hints test is unchanged.
- No other real-time spec needed a fix. Remote verify-full passed (see Gates).

## `mode === "docked"` site review (`rg -n 'mode (=|!)== "docked"' src/app`)

- `mode.ts:28,38` (`advanceMode`, `screenForMode`): these are pure mode mappings on the sim mode. The pre-roll does
  not change the sim mode.
- `hints.ts:217,230`: the launch hint stays keyed to docked. It is posted to the hidden station message line during
  the pre-roll, which is harmless.
- `hud-model.ts:209`: this is the HUD condition colour, and the HUD is not drawn in the pre-roll.
- `start-session.ts:791,804` (the Launch and Refuel buttons): the shell is hidden during the pre-roll. A second Launch
  press would be absorbed by the running pre-roll anyway.
- `save-controller.ts:459,491` (Load restore): reads the restored mode. `:581` (opening F2) is unreachable because
  `saveLoad` is bound in `dockHome`/`dockScreen` only and the pre-roll runs in `flight`.
- `render-driver.ts:134,177,327,418`: these are the pre-roll cases themselves. 418 is the hint routing, as for hints
  above.
- `station-controller.ts:633,762,866,891,911`: `renderStation` while docked redraws the hidden shell. The screen
  opener, page and sort guards are not reachable in `flight`. `applyStationAction` also checks the action's context.
- `frame-loop.ts:118`: the docked message clock keeps counting wall time, which is harmless. `:173` covers station
  actions: `drainStationActions()` yields nothing in `flight`, because every `station*` action is bound only in
  dock contexts (`ACTION_CONTEXTS`, `src/input/actions.ts:359-398`) and the keyboard filters actions by context
  before queueing. No frame-loop change was needed.
- `probe-publisher.ts:149` (`station.open`): it reports `true` during the pre-roll because it follows the sim mode.
  It is left as is; `launch.preRolling` is the pre-roll signal.
- `probe-publisher.ts:393`: this is the dock outcome, unaffected.
- `sim-driver.ts`: these are the pre-roll filter and wrapper themselves.

Flight-context commands pressed during the pre-roll reach docked sim steps. The sim gates them on `modeAtStart`
(hyperspace, docking computer, skipLaunch); the exception is the ASC compass keys (`cycleCompass`, `targetStation`),
which can change `compassMode` while docked, as they already can while launching. This is accepted and not changed.

## Frames (remote, 1280x720, snapshot 606eedf; `/tmp/os8-capture/run1/`)

Run A was real time on `/?test=1&traffic=1`, held with KeyP and the pause overlay hidden. Run B used the manual clock.
Pausing after the probe threshold adds about 0.05 to 0.13 s of latency, so the actual view times are listed. For the
pre-roll frames, view time = `preRollElapsed`; for the launch frames, `1.5 + launch.elapsed`.

| Frame | Actual tau (s) | Camera axial (m) | Walls visible | Opening | Defects | HUD / Cobra / shell / nav |
| --- | --- | --- | --- | --- | --- | --- |
| a-pre0.00.png | 0.108 | -249.9 | yes, all four sides converge on the mouth | whole mouth inside the frame, wide | none seen | hidden / hidden / hidden / hidden; overlay lines hidden |
| a-pre0.75.png | 0.875 | -225.1 | yes, all four sides, wider | mouth larger, nearly frame-filling | none seen | same |
| a-pre1.50.png | 1.55 (launching 0.05) | -133.2 | thin top band only | planet fills the frame | none; no twist flash | same; launch.count 1, save attempts 1 |
| a-launch0.10.png | 1.725 | -96.7 | none | planet and stars | none | same |
| a-launch0.40.png | 1.94 | -45.4 | none | planet | none | same |
| a-handover.png | 3.5 | +381.0 | none | planet | none | HUD shown and laid out / hidden / hidden / hidden |
| b-launch0.0.png | 1.5 (manual, zero-length pre-roll) | -142.7 | thin top band, the same as a-pre1.50 | planet | none | HUD hidden |
| b-launch0.4.png | 1.9 | -55.4 | none | planet | none | HUD hidden |
| b-launch1.0.png | 2.5 | +113.3 | none | planet | none | HUD hidden |
| b-launch1.9.png | 3.4 | +362.0 | none | planet | none | HUD hidden |
| b-handover.png | 3.5 | +381.0 | none | planet | none | HUD shown |

- **Measured wall time.** The slot walls are on screen from the press to between tau 1.55 s (a thin top band) and
  1.725 s (gone), so about **1.6 s**. The camera is still 97 m inside the slot at 1.725 s, but at this field of view
  the opening fills the frame. This matches decision 7's estimate (top wall gone near 145 m, about 1.49 s; the band is
  measured still visible at 133 m).
- **Boundary.** b-launch0.0 (the manual-clock launch step, tau 1.5) and a-pre1.50 (tau 1.55) show the same view and
  the same band: no jump and no half-applied twist.
- **Compared with mb5** (`/tmp/mb5-capture/run1/`): mb5 started 200 m inside, crossed the mouth at about 0.73 s and
  showed the walls for well under 1 s. The walls now hold for about 1.6 s, with the mouth framed at rest first.
- **NPC pop-in.** No NPC hull is visible in any launch frame (traffic on). The world is created at the launch step,
  which is unchanged sim behaviour; no pop-in was seen at the boundary.
- **Owner question (decision 7).** The walls leave the frame clearly before 2 s (about 1.6 s). Should we raise
  `LAUNCH_PRE_ROLL_DURATION` (for example to 2.0 or 2.5 s; the curve and the code need no other change), or accept the
  faster exit after the walls? The curve was not changed for this.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] A source-text guard pinned the old docked draw gate**
- **Found during:** the Task 2 full local suite (`docker compose run --rm test`)
- **Issue:** `tests/app/redraw-gate.test.ts` "treats exactly docked and paused as idle" asserted the literal
  `redrawGate.next(paused || state?.mode === "docked", drawKeys())`, which Task 1 replaced. Task 1's targeted suite
  did not include that file, so the Task 1 commit (e4d0b57) went in with this guard red.
- **Fix:** the guard now pins the `frozenDocked` line and the `next(paused || frozenDocked, ...)` call, with the
  pre-roll named in the test title.
- **Files modified:** `tests/app/redraw-gate.test.ts`
- **Commit:** 606eedf

Note: the previousPose-snap render-driver test calls `createStationFlow` from `event-router.ts` with no-op
dependencies, because the snap lives in the "launched" handler. `frame-loop.ts` needed no change; see the site review above.

## Known Stubs

None.

## Threat Flags

None. The only persistence change is the moment of the existing D-17 autosave (T-261118-os8-01), which unit tests
(order, count, docked mode) and the browser spec (`save.attempts` before, during and after the pre-roll) both pin.

## Gates

| Gate | Where | Result |
| --- | --- | --- |
| Targeted Vitest (7 files, 308 tests) | local Docker | pass (before the Task 1 commit) |
| `typecheck`, `lint` | local Docker | pass (both tasks) |
| Full `docker compose run --rm test` | local Docker | 5857 passed, 10 skipped, 1 failed (the redraw-gate guard, fixed; that file then passed 20/20) |
| Fidelity contract against Oolite 7437f22 | local Docker | 9/9 pass |
| Grep gates (Task 1 and Task 2) | local | all hold; protected-path diff `30c6378..HEAD -- src/sim tests/golden src/content/generated` is empty |
| `tests/e2e/launch.spec.ts --project=chromium` | remote, snapshot 606eedf | 4 passed (36.4 s) |
| Frame capture (A real time, B manual clock) | remote, snapshot 606eedf | 2 passed; 11 PNGs reviewed |
| `verify-full` (first run) | remote, snapshot 606eedf | **FAILED (exit 1)**: 133 passed, 1 failed, 6 did not run (11.7 min). The lint, typecheck, assets:check (no differences), unit (221/221 files, the redraw-gate fix included), build:e2e and check:dist stages passed; only the e2e stage failed (probe-shape fixture, see below) |
| Probe-shape recording (`WEGOLITE_PROBE_SHAPE_WRITE=1`) | remote, snapshot c8192cb | 7 passed; the recorded fixture is JSON-identical to the hand edit, key order included (it differs only in whitespace: the writer prints raw `JSON.stringify` output and the committed file is Prettier-formatted) |
| `verify-full` (final) | remote, snapshot c8192cb | **PASS (exit 0)**: assets:check no differences, unit 221/221 files, e2e 140 passed (11.9 min), hyperspace-failure 2 passed; 849 s |

- The NPC acceptance run is not due: no file under `src/sim/npc/**`, `src/sim/world/**` or `ships-npc.json` changed.
- No scratch file is tracked. The capture spec and frames are under `/tmp/os8-capture/` only, and the remote copy was
  removed through a throwaway busybox container.

## The probe-shape fixture pin moved (stopped, then resolved with orchestrator approval)

Remote verify-full failed on one spec: `tests/e2e/probe-shape.spec.ts:234` "menu probe shape". The error was
`launch.preRollElapsed: unexpected key (shape "number")` and `launch.preRolling: unexpected key (shape "boolean")`.
The six later serial probe-shape tests did not run. The cause is the two probe fields the plan requires (Task 2,
behaviour "Probe"). The recorded fixture `tests/fixtures/probe-shape.json` pins the probe's key set, and its seven
`"launch": { count, elapsed, seen }` entries do not list the new keys.

Execution stopped and reported, as the orchestrator had instructed for any moved hash or golden pin. The
orchestrator then approved the fixture update: its stop rule was meant for hashes and goldens. **Resolution (c8192cb).** The fix was additive and mechanical: add `"preRolling": "boolean"` and
`"preRollElapsed": "number"` to all seven `launch` entries, or re-record with `WEGOLITE_PROBE_SHAPE_WRITE=1`, as
quick 261118-cyn did for `hud.lift` (b495a35). The final remote verify-full is green on c8192cb. No flight hash, twin hash or file under
`tests/golden` moved; the e2e specs that pin them (tick-hook, combat, traffic, npc-flight, laser-shots) passed in this
run.

## Self-Check: PASSED (files and commits)

- FOUND: e4d0b57, 606eedf (both ancestors of HEAD)
- FOUND: src/render/launch-camera.ts, src/app/launch-sequence.ts, tests/e2e/launch.spec.ts
- FOUND: 11 PNGs and 2 JSON records under /tmp/os8-capture/run1/
- No scratch file is tracked; the working tree is clean apart from this quick directory.
- FOUND: c8192cb (the probe-shape fixture commit); the final remote verify-full is green on it.
