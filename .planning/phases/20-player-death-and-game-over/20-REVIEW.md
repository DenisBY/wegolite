---
phase: 20-player-death-and-game-over
reviewed: 2026-11-23T00:00:00Z
depth: standard
files_reviewed: 33
files_reviewed_list:
  - index.html
  - src/app/game-session.ts
  - src/app/probe.ts
  - src/app/session/chart-controller.ts
  - src/app/session/context.ts
  - src/app/session/event-router.ts
  - src/app/session/frame-loop.ts
  - src/app/session/probe-publisher.ts
  - src/app/session/render-driver.ts
  - src/app/session/save-controller.ts
  - src/app/session/settings-controller.ts
  - src/app/session/sim-driver.ts
  - src/app/session/start-session.ts
  - src/input/actions.ts
  - src/input/keyboard.ts
  - src/main.ts
  - src/persistence/autosave.ts
  - src/render/bodies/explosions.ts
  - src/sim/combat/collide.ts
  - src/sim/combat/death.ts
  - src/sim/combat/internal-damage.ts
  - src/sim/combat/ledger.ts
  - src/sim/combat/response.ts
  - src/sim/combat/shields.ts
  - src/sim/combat/step.ts
  - src/sim/events.ts
  - src/sim/flight/launch.ts
  - src/sim/flight/state.ts
  - src/sim/flight/step.ts
  - src/sim/hyperspace/arrival.ts
  - src/sim/sim.ts
  - src/sim/world/contacts.ts
  - src/ui/game-over.ts
findings:
  critical: 0
  warning: 1
  info: 6
  total: 7
  necessity: 1
status: issues_found
---

# Phase 20: Code Review Report

**Reviewed:** 2026-11-23
**Depth:** standard
**Files Reviewed:** 33
**Status:** issues_found

## Summary

I reviewed the Phase 20 diff (`d8b3716..HEAD`) for the 33 listed files, plus the
code those files call: `loop.ts`, `game-loop.ts`, `redraw-gate.ts`, the keyboard
attach path, the station controller's `renderStation`/`commitProfile`, the ident
step, and the Oolite `OOParticleSystem.m` burst code. I also traced every
`autosave()` producer and every `mode`/`gameOver` check I could find.

The death path is sound. I checked these in detail and found no defect:

- **Lethal check.** It is decided in `applyLedger` at the damage point, on the
  shield overflow. It needs `inFlight`, applies the first lethal record only,
  and skips every later player record. `killPlayer` runs once, after the kills
  and the player's blast push and before the AI drain. The cause is read before
  `killShip` removes the culprit.
- **Freeze.** `stepSim`, `stepFlight`, `resolveShots` and `stepOnce` all return
  before touching state for a dead player.
- **Loop reset.** `latchGameOver` calls `loop.reset()` from inside the step
  callback. `GameLoop.advance` handles that with its `resetGeneration` check, so
  no step runs after the lethal one and the accumulator stays at 0.
- **Save latch.** Every autosave producer goes through `saveController.autosave`
  or `manualSave`. The `docked`, `launched` and arrival handlers, the station
  purchase paths and `hyperspace-controller` all use the wrappers. The latch is
  checked before any other guard, and `queueSnapshot`, `buildSnapshotInputs`
  and `snapshotForSave` each refuse a dead state.
- **Hyperspace jump tick.** The `hyperspaceJumped` tick steps no world, so no
  player record can exist on it. A death on the docking tick is impossible
  because the mode flips to `docked` before the world step.
- **Ident.** `updateIdentTarget` cannot re-lock after the death, because it
  requires `inFlight`.
- **Redraw idle.** The dead-view redraw bound is consistent with `redraw-gate`
  (two settle draws after the idle flag flips). The frustum test in
  `isDebrisInDeadView` is correct for the side planes.
- **Explosion layer.** The burst constants match `OOParticleSystem.m:244-353`.
  The default (no `kind`) path is byte-identical to Phase 16: `startSize = speed`
  and `growth = growthRate * size`.
- **Pending write.** A write queued before the death lands as the pre-death
  anchor, by design (D-14).

There are no Critical findings. There is one Warning: the game-over exit
listeners are installed only by `overlay.show()`, which runs after fallible work,
so an exception there leaves a latched session with no way out. The Info items
are small quality issues and one necessity note. The two known items (the
T-20-41 `saveSkipReason` overwrite in `queueSnapshot`'s failure branches, and the
overlay's legibility and aria-live gaps from `20-UI-REVIEW.md`) are not
re-reported.

## Warnings

### WR-01: The game-over view's only exit is armed by `show()`, after work that can throw, with the session already latched

**File:** `src/app/session/event-router.ts:836-886`, `src/ui/game-over.ts:122-146,193-206`
**Issue:** `latchGameOver` runs first. It sets `gameOver`, resets the loop and
clears input. After that, `createDeathFlow` runs a chain of calls before the
overlay is shown: `closeChart()`, `closeSaveScreen()`, `setContext`,
`messages.clear()`, `launchSequence.reset()`, `buildGameOverLines(...)`, and only
then `gameOverOverlay.show(...)`. The Space and click listeners are registered
only inside `show()` (`game-over.ts:198-205`).

`createEventRouter.dispatch` has no error isolation, so an exception anywhere in
that chain propagates out of `stepOnce` and the rAF callback. The latch is
already set, the sim is frozen, input is cleared and the context is `gameOver`
(or still `flight`), but no listener exists to end the view. The player sees a
frozen frame with no prompt, and F5 is swallowed by `keyDown` in the `gameOver`
context (`keyboard.ts:152`) only when that context was reached.

The most plausible thrower is `buildGameOverLines`. It deliberately throws
`"formatDecicredits no longer ends with its credit sign"` (`game-over.ts:129-132`).
That is a build-time invariant, but it runs on the death path in the live
session, where a throw is unrecoverable. `closeChart` and `closeSaveScreen` call
`syncStationNav` and `updateProbe`, which also run arbitrary code.

Only a harness or a future change can trigger this today, but the cost is a soft
lock on the one screen whose purpose is to end the session.

**Fix:** Make the exit independent of the text building. Either of these works:

```ts
// ui/game-over.ts: arm the exit listeners in createGameOverOverlay (or in an
// explicit arm()), not in show(); show() then only fills text and unhides.
// event-router.ts: build the lines defensively and show before the fallible work.
const lines = (() => {
  try {
    return buildGameOverLines(/* ... */);
  } catch {
    return { title: GAME_OVER_TITLE, cause: "", score: "", prompt: GAME_OVER_PRESS_SPACE };
  }
})();
ctx.runtime.gameOverOverlay?.show(lines); // before closeChart() and the rest
```

Also replace the `throw` in `buildGameOverLines` with a fallback that keeps the
number as formatted. The invariant is already pinned by a unit test.

## Info

### IN-01: Necessity: redundant `gameOver` guards in `chart-controller` and `resume`

**File:** `src/app/session/chart-controller.ts:57-63,72-78,203-209,253-256`, `src/app/session/settings-controller.ts:108-111`
**Category:** necessity
**Issue:** These guards defend a state that cannot occur in the wired session. I
rate it Info because the latch-only router default (`createDeathFlow(ctx)` with no
`deps`) skips `closeChart`, so it is not provable for every construction path.

- `setChartCamera`, `toggleChartPreset`, `handleFind` and `selectChartSystem`
  each already return on `!ctx.chart.chartOpen`. In the production wiring
  `createDeathFlow(ctx, deps)` closes the chart in the same dispatch that latches.
  `openChart` refuses once latched (`chart-controller.ts:124-127`), so
  `chartOpen && gameOver` cannot hold.
- `resume()`'s `gameOver` guard needs `paused && gameOver`. A death needs a fixed
  step. The frame loop steps only when `!paused`, and `advanceTicks` refuses a
  paused session (`sim-driver.ts:435`). `pause()` is a no-op once latched
  (`settings-controller.ts:70-77`). So `paused` is never true when `gameOver`
  becomes true.

The save-path guards are deliberate defence in depth (DEATH-06) and are not part
of this finding.
**Fix:** Optional. Keep one guard per entry point (the `openChart` one), or leave
them and record the invariant in the comment. Do not remove them without
`dead-mode-gates.test.ts` and the chart specs.

### IN-02: The lethal frame is drawn at alpha 0, so the dead camera and the bursts use different poses for one frame

**File:** `src/app/session/frame-loop.ts:124-137`, `src/app/session/render-driver.ts:318-322`, `src/app/session/settings-controller.ts:140-146`
**Issue:** On the lethal frame `advanceFrame` returns 0, because `loop.advance`
returns 0 after a reset. `renderFrame(0, ...)` then interpolates to
`previousPose`, the pose before the lethal tick. The dead camera is built from
that pose, while the bursts were added at `event.position`, the post-tick
position. For the first dead frame the explosion origin and the camera are
therefore up to one tick (about 3 m at the 350 m/s maximum) out of step. The next
frame uses alpha 1 and snaps.

`exitContextLoss` has the same shape: `renderFrame(0)` in a dead session draws
the previous-tick pose, and a settled gate may then keep that image.
**Fix:** In `renderFrame`, use `dead ? 1 : alpha` when computing `pose`, so every
dead frame (the lethal one and the context-restore one) draws `currentPose`.

### IN-03: The exit key accepts modifier chords such as Ctrl+Space and Alt+Space

**File:** `src/ui/game-over.ts:186-192`
**Issue:** `onKeyDown` triggers on any `code === "Space"` that is not a repeat. It
ignores `ctrlKey`, `altKey` and `metaKey`. Ctrl+Space (an IME or input-method
toggle on some platforms) and Alt+Space (the Windows window menu) both deliver a
non-repeat Space keydown and would end the view early, cutting the explosion and
fade short. The game's own input already filters chords through `allowsChordKey`
(`keyboard.ts:407-415`).
**Fix:**
```ts
if (key.code !== "Space" || key.repeat) return;
if (key.ctrlKey || key.altKey || key.metaKey) return;
```

### IN-04: `game-over.ts` is the only `src/` file with extensionless relative imports

**File:** `src/ui/game-over.ts:13-15`
**Issue:** `../sim/events`, `../sim/player/profile` and `./station-model` omit the
`.js` suffix that every other `src/ui` and `src/app` import uses (42 `.js` imports
in `src/ui`, none without). It type-checks under the bundler resolution, but it
breaks the project's convention and any NodeNext-style tooling that reads these
paths.
**Fix:** Use `../sim/events.js`, `../sim/player/profile.js` and `./station-model.js`.

### IN-05: The explosion texture is first requested at the death when traffic is off

**File:** `src/app/session/event-router.ts:790-807,857-883`, `src/render/bodies/explosions.ts:490-497`
**Issue:** `PLAYER_EXPLOSION_SETTINGS` is restated as a constant specifically
"because a load started at the death would delay the explosion or lose it on a
failed fetch". The textures behind it have exactly that exposure. With traffic off
there is no earlier explosion, so the first `scene.explosions.add` calls
`loadOnce` for `oolite-particle-cloud2.png` and `oolite-particle-flash.png` at the
moment of death. Until the image decodes, the `alphaMap` has no data and the quads
are invisible. A failed or slow fetch removes part or all of the 1 to 1.5 s
bursts.
The constant also duplicates `src/content/generated/explosions.json`, guarded only
by a unit test.
**Fix:** Optional. Prefetch the two particle textures when the session first
reaches `inFlight` (the same latch as `npcModels.open()`), or accept it and record
it in FIDELITY/PROJECT as a known limit. A single generated source for the
settings would remove the drift test.

### IN-06: `probe.dock.outcome` reports a dead player as `"inFlight"`

**File:** `src/app/session/probe-publisher.ts:459`
**Issue:** `outcome: currentState.mode === "docked" ? "docked" : "inFlight"` now
also covers `"dead"`. `probe.mode` and `probe.death` carry the truth, so no spec
breaks, but the field is mislabelled for the dead mode and the closed probe shape
does not mention it.
**Fix:** Keep the field as is and note in `probe.ts` that it is `"inFlight"` for
every non-docked mode including `"dead"`, or add a `"dead"` value in the probe
shape if a spec ever needs to tell them apart.

---

_Reviewed: 2026-11-23_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
