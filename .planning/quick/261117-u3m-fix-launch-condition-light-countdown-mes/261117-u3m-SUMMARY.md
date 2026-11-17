---
phase: quick
plan: 261117-u3m
subsystem: hud
tags: [hud, condition-light, messages, hyperspace-countdown, fidelity]
status: complete
requires: [quick-261117-pij]
provides:
  - condition light from Oolite's alert flags in every non-docked mode, body mass-lock read live
  - countdown start that clears the last message and scrolls nothing; cancel that clears it before the abort
  - message rows that count down on every frame, docked screens included
affects: [src/app/hud-model.ts, src/app/session/event-router.ts, src/app/session/frame-loop.ts, src/app/session/render-driver.ts]
tech-stack:
  added: []
  patterns:
    - HUD-side live read of a pure sim rule instead of refreshing a hashed sim field
    - session message clock = flight time + docked wall time
key-files:
  created: []
  modified:
    - src/app/hud-model.ts
    - src/app/session/event-router.ts
    - src/app/game-session.ts
    - src/app/session/context.ts
    - src/app/session/frame-loop.ts
    - src/app/session/render-driver.ts
    - src/render/hud/messages.ts
    - tests/ui/hud-model.test.ts
    - tests/app/session-order.test.ts
    - tests/app/session/render-driver.test.ts
    - tests/app/session/sim-driver.test.ts
    - tests/app/session/tick-parity.test.ts
    - CHANGELOG.md
    - FIDELITY.md
    - .planning/PROJECT.md
    - .planning/todos/pending/2026-11-17-ui-station-screen-differences-from-oolite.md
    - .planning/todos/pending/2026-11-17-ui-flight-hud-differences-from-oolite.md
decisions:
  - The HUD ORs the sim mass-lock flag with the live body rule in every non-docked mode; src/sim is untouched
  - The countdown keeps the per-frame in-place overlay (owner instruction); Oolite's message-row countdown is recorded in the flight-HUD todo
  - The docked message clock is wall time added by the frame loop while docked, not paused and not under the manual clock, chart and save screen included
metrics:
  duration: approx. 21 min (20:52-21:13 UTC, including two remote gate runs)
  completed: 2026-11-17
actuals:
  tokens: 18500
  tasks: 2
  commits: 2
plan_head_before: cc71297ed2034ce92b20807562ee19df6c072a8f
plan_head_after: 73b4be4ef47df28bc68ec8fe38442be8b12c5535
---

# Quick 261117-u3m: Condition light from the launch, countdown start and cancel, docked message clock Summary

This fixes the three findings from the Fable review of 261117-pij, each checked against Oolite's source at the pin `7437f22`. The condition light is yellow beside the station from the launch on. Only the docked mode is green. The HUD reads Oolite's body mass-lock rule live, so nothing under `src/sim` changes. Starting the hyperspace countdown clears the last message and scrolls nothing. Cancelling it clears the last message before the 3 s abort. The HUD message rows now count down on every frame, docked screens included, on the flight time plus the wall time spent docked.

## Tasks

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 (tracer) | Condition light from the launch; countdown start and cancel as in Oolite | 232f1c9 | src/app/hud-model.ts, src/app/session/event-router.ts, src/app/game-session.ts, tests (hud-model, session-order, render-driver, tick-parity), CHANGELOG.md, FIDELITY.md, .planning/PROJECT.md |
| 2 | Message rows count down every frame, docked included; two todo items; gates | 73b4be4 | src/app/session/{context,frame-loop,render-driver}.ts, src/render/hud/messages.ts, tests (sim-driver, render-driver), CHANGELOG.md, FIDELITY.md, .planning/PROJECT.md, both UI todos |

## What changed

- **Condition light (COND-L).** In `src/app/hud-model.ts`, `conditionOf` returns green only for `docked`. In every other mode it computes Oolite's flags with `massLocked: state.torus.massLocked || bodyMassLocked(state.position, layout)`. `bodyMassLocked` is `massLocked` from `src/sim/flight/torus.ts`, imported under an alias. The Oolite sources are `Entity.m:1033-1048`, `PlayerEntity.m:2893-2899`, `3053-3060` and `5122-5138`. Tests cover: launching at the dock mouth is yellow, and red with hostiles; the first in-flight frame with the stale sim flag is yellow; docked with hostiles and energy 63 is green. The old "green outside flight" test is gone.
- **Countdown start and cancel (CD-1, CD-2).**
  - `hyperspaceCountdownStarted` calls `messages.clearPrevious()` and posts nothing (`PlayerEntityControls.m:834-839`, `Universe.m:6258-6267`).
  - `hyperspaceCountdownCancelled` calls `clearPrevious()` before the 3 s abort (`PlayerEntityControls.m:853-861`, `1520-1528`).
  - `HudMessagesDeps` is now `{ messages: Pick<MessageQueue, "enqueue" | "clearPrevious"> }`. `galaxyById` was removed, along with its now-unused imports.
  - The render driver's per-frame overlay is unchanged.
  - Tests on the real queue check three things: the start leaves the rows and the size unchanged; the cancel puts the abort on the bottom row with no "Hyperspace to" row; start, cancel, start, cancel shows the abort both times.
- **Jump (CD-2, no code change).** When the countdown ends, `hyperspaceCountdown` drops to 0 and `hyperspaceTarget` is cleared, so the overlay branch in `render-driver.ts` is not taken. Only "Arrived at X" is posted (`hyperspace-controller.ts`), so no countdown row remains. A render-driver test pins "countdown back at 0 → no row starts with Hyperspace to".
- **Docked message clock (MSG-D).**
  - `SessionRuntime.dockedMessageSeconds` starts at 0.
  - The frame loop adds the frame delta to it right after the pause toggle, before the chart drain. It does so only while docked, not paused, not under the manual clock, and when the delta is finite and positive.
  - Each frame, before the docked check, the render driver computes `messageClock = flightTime + dockedMessageSeconds` and calls `messages.advance(messageClock)`. It passes the same clock to `rows` and `current`.
  - The Oolite sources are `Universe.m:4735-4736`, `4810-4827` and `GuiDisplayGen.m:1308-1312`, `1327-1336`. Oolite clears the message area only for a docking report or a mission screen (`PlayerEntity.m:11318-11337`), so Wegolite does not clear it at docking either.
  - `messages.ts`: only doc comments changed, plus the implementation parameter `flightTime` renamed to `now`. The queue behaves the same.

## Discretion choices

- The HUD ORs the sim's mass-lock flag with the live body rule in every non-docked mode, not only while launching. This also covers the frame right after the launch step that completes. In flight the two can differ for at most one fixed step at a boundary. The sim flag keeps the locks caused by other ships, and the torus behaviour still reads only the sim flag.
- The countdown keeps the per-frame in-place overlay (owner instruction). The four differences from Oolite's message-row countdown are recorded in the flight-HUD todo.
- The docked message clock is wall time. It keeps running while the chart or the Save/Load screen is open while docked, because Oolite draws the message area on every screen. Because it only ever grows, the queue's clock never goes backwards across a dock and a launch.

## Observed consequence

Since the rows now advance on every frame, a message posted at launch ("Launching — stand by", 4 s, a Wegolite-only message) starts counting during the 2 s launch, which the break pattern hides. It is visible for about 2 s after the launch. Oolite also counts rows down during the launch, because its message area is drawn on every screen. The e2e message-expiry spec (`hud.spec.ts:207`) still passes.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `tests/app/session/tick-parity.test.ts` passed `galaxyById` to `createHudMessages`**
- **Found during:** Task 1
- **Issue:** Removing `galaxyById` from `HudMessagesDeps` would have broken typecheck for this third call site, which the plan did not list.
- **Fix:** It now passes `{ messages }`. Its other `galaxyById` uses, for the hyperspace controller, are unchanged.
- **Commit:** 232f1c9

**2. [Rule 1 - Wording] Flight-HUD todo, difference (2)**
- The plan's objective did not say what happens to a message posted during the countdown. It takes the bottom row, which the overlay hides, and pushes the older row up into view. The todo states this as observed in the code.

Otherwise the plan was executed as written.

## Gate results

- Local Docker:
  - Task 1 targeted Vitest (hud-model, session-order, render-driver, hud/messages, contract/fidelity, tick-parity): 6 files, 176 passed, 1 skipped.
  - Task 2 targeted Vitest (sim-driver, render-driver, hud/messages, contract/fidelity): 4 files, 116 passed, 1 skipped.
  - `npm run test:fast`: 220 files, 5680 passed, 10 skipped.
  - `typecheck` and `lint` (ESLint and Prettier) are clean.
  - All grep gates in both tasks pass.
- TDD: both tasks went red first. Task 1 had 7 failures: hud-model yellow cases, the session-order countdown logs and the real-queue cases. Task 2 had 6 failures: the frame-loop docked-clock and render-driver docked cases. Both went green after the implementation.
- Remote verify: `wegolite-remote-run.sh run --rm verify` gave `exit=0 elapsed=168s snapshot=73b4be4`. Vitest passed 220 files (5680 passed, 10 skipped) and the e2e smoke subset 27 passed.
- Remote targeted e2e: `wegolite-remote-run.sh run --rm e2e sh -lc "npm run build:e2e && npx playwright test --project=chromium tests/e2e/hud.spec.ts tests/e2e/hyperspace.spec.ts"` gave `exit=0 elapsed=120s snapshot=73b4be4`, 6 passed. This includes `hyperspace.spec.ts:194` (chart target, countdown, abort, refusal, arrival and reload) and `hud.spec.ts:207` (message expiry).
- No known flake occurred and nothing was rerun.
- No file under `src/sim` or `src/content/generated/ships-npc.json` changed since `cc71297` (`git diff --name-only` is empty). No flight hash, golden or recorded flight moved. The NPC acceptance run is not due.

## Known Stubs

None.

## Threat Flags

None. T-u3m-01 is mitigated: only a finite, positive delta is added, and only while docked, not paused and not under the manual clock, and tests pin each case. T-u3m-02 is mitigated: `src/sim` is unchanged.

## Self-Check: PASSED

- Commits 232f1c9 and 73b4be4 are ancestors of HEAD.
- All modified files listed above exist.
