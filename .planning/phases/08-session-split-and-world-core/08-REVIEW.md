---
phase: 08-session-split-and-world-core
reviewed: 2026-11-13T00:00:00Z
depth: standard
files_reviewed: 38
files_reviewed_list:
  - src/app/game-session.ts
  - src/app/probe.ts
  - src/app/session/chart-controller.ts
  - src/app/session/context.ts
  - src/app/session/event-router.ts
  - src/app/session/frame-loop.ts
  - src/app/session/hyperspace-controller.ts
  - src/app/session/probe-publisher.ts
  - src/app/session/render-driver.ts
  - src/app/session/save-controller.ts
  - src/app/session/settings-controller.ts
  - src/app/session/sim-driver.ts
  - src/app/session/start-session.ts
  - src/app/session/station-controller.ts
  - src/app/session/step-options.ts
  - src/app/session/test-flags.ts
  - src/app/session/world-lifecycle.ts
  - src/sim/ai/pilots/test-pilot.ts
  - src/sim/ai/registry.ts
  - src/sim/ai/time.ts
  - src/sim/ai/types.ts
  - src/sim/events.ts
  - src/sim/math.ts
  - src/sim/rng.ts
  - src/sim/sim.ts
  - src/sim/world/control-impl.ts
  - src/sim/world/control.ts
  - src/sim/world/entity.ts
  - src/sim/world/ids.ts
  - src/sim/world/limits.ts
  - src/sim/world/sanitize.ts
  - src/sim/world/serialize.ts
  - src/sim/world/snapshot.ts
  - src/sim/world/step.ts
  - src/sim/world/store.ts
  - src/sim/world/view-impl.ts
  - src/sim/world/view.ts
  - src/sim/world/world.ts
findings:
  critical: 0
  warning: 2
  info: 8
  total: 10
  necessity: 1
status: issues_found
---

# Phase 8: Code Review Report

**Reviewed:** 2026-11-13
**Depth:** standard
**Files Reviewed:** 38
**Status:** issues_found

## Summary

I read every file in scope in full and compared the moved session code against the pre-split
`game-session.ts` (commit `03cb780`) for the frame loop, `handleEvent`, `handleHyperspaceJumped`, `queueSnapshot`,
`dispose` and `swapSystem`. I checked the closed vocabularies in `ids.ts` against Oolite's
`OOBehaviour.tbl` and `OOScanClass.tbl` (all 38 behaviours and 16 scan classes match, in table order).
I also checked `AI_THINK_INTERVAL = 0.125` (`AI.h:31`) and the station roll composition in `view-impl.ts`
against `render/bodies/station.ts:212`.

No BLOCKER-class defect was found. Specifically verified and found sound:

- The split is behaviour-preserving apart from the documented deviations (`swapSystem` settlement frame,
  disposed guards in `queueSnapshot` and `clearSaveForNewGame`, and the new world lifecycle hooks).
  Frame order, drain order and the single step call site are unchanged.
- World lifecycle ordering holds: `launched` begins the world after the launch step, so it is first stepped
  on the next tick. `docked` ends it after the station side effects. An arrival begins a new world inside
  the install block. A cold boot Continue and a warm Load both re-anchor to epoch 0 and resume only for an
  in-flight save (the save format can only carry `docked` or `inFlight`).
- Determinism: stream forks are per entity and per purpose. The AI stream is a local copy written back after
  the call. Entity iteration is by index over a length snapshot. The store is a binary-searched array with no
  Map or Set. The hash text is ASCII with type-tagged params and sorted keys. `-0` is normalised in sanitize,
  snapshot and canon.
- Snapshot round trip: the parser enforces the same limits as spawn and sanitize, builds a fresh tree, rejects
  forbidden keys by own-enumerable scan, and `restoreWorld` re-validates.
- Dispose path: `uiController` aborts both window listeners, both rAF ids are cancelled, the pending swap wait
  is settled, and every async continuation re-checks `disposed`.

The two warnings are an uncontained AI-module exception path that drops already-applied flight events, and one
provably dead guard (necessity). The remainder are robustness and maintainability notes.

## Warnings

### WR-01: A throwing AI module aborts `stepSim` after `stepFlight` has already mutated state, losing the flight events

**File:** `src/sim/world/step.ts:115` (also `:209`), `src/sim/sim.ts:46-61`, `src/app/session/sim-driver.ts:124-134`
**Issue:** `invoke()` calls `module.think` and `module.onEvent` with no containment. `control-impl.ts` promises that a
malformed AI write "must not crash the frame loop", but that only covers `ShipControl` arguments, not an
exception thrown by the module itself. If a module throws:

1. `stepWorld` unwinds through `stepSim`. The `events` array returned by `stepFlight` is a local at `sim.ts:46`,
   so every event the flight step produced this tick (`docked`, `launchComplete`, `hyperspaceCountdown*`, `bounce`)
   is dropped. The flight state has already moved, so the session never reacts to a transition that happened
   (no station overlay on `docked`, no `launchSequence.advance`, no world end).
2. `stepOnce` aborts before `ctx.core.currentPose = poseOf(liveState)`.
3. The entity's `rng.ai` is not written back (`step.ts:164` is skipped) and `nextThinkTick` may not advance. The
   same entity is due again next tick, so the throw repeats every fixed step. `frame()` has already re-armed
   `requestAnimationFrame` (`frame-loop.ts:77`), so the loop keeps running and keeps throwing.

The only registered module today (test-pilot) cannot throw, but Phases 12, 13 and 22 add real AI to this exact seam.
**Fix:** Contain the call deterministically inside `invoke` so one bad module cannot take down the step. For example,
catch the error, drop the entity's AI and count it as a repair so the hash records it:

```ts
function invoke(world, entity, view, tick, call): void {
  if (entity.ai === null) return;
  const stream = createRngState(entity.rng.ai);
  try {
    call({ /* ...context as before... */ });
  } catch {
    entity.ai = null; // a throwing module is retired for this entity
    entity.repairs = Math.min(MAX_UINT32, entity.repairs + 1);
    return;
  }
  entity.rng.ai = stream.s;
}
```

Alternatively wrap the `stepWorld` call in `stepSim` in `try/finally` so the flight events are always returned.

### WR-02: Impossible-state guard on the private `epoch` in `begin` and `resume`

**File:** `src/app/session/world-lifecycle.ts:127-133` and `:141-147`
**Category:** necessity
**Issue:** `begin` tests `!Number.isSafeInteger(epoch) || epoch < 0`, and `resume` tests
`!Number.isSafeInteger(epoch) || epoch < 0 || epoch > MAX_EPOCH`. `epoch` is a closure-private `let` with exactly
three writers, all in this file: the initial `0` (line 110), `epoch = next` where `next = epoch + 1` after the
`epoch < MAX_EPOCH` check (lines 136-138), and `resetForRestore`, which assigns only a value that passed
`isSafeInteger && >= 0 && < MAX_EPOCH` (lines 156-165). No export, getter or caller can write it, so a
non-integer, negative or over-range epoch cannot occur. Only the `epoch >= MAX_EPOCH` clause in `begin` and the
`!Number.isFinite(marketSeed)` clauses (a value crossing from saved data) guard reachable states.
**Fix:** Drop the unreachable `epoch` clauses and keep the reachable ones:

```ts
begin(marketSeed) {
  if (!Number.isFinite(marketSeed) || epoch >= MAX_EPOCH) return;
  ...
}
resume(marketSeed) {
  if (!Number.isFinite(marketSeed)) return;
  ...
}
```

## Info

### IN-01: `createEntityStore(init)` does not validate `nextId` against the dynamic-id range

**File:** `src/sim/world/store.ts:67-83`
**Issue:** The restore path checks only `nextId > highest stored id` and strict ascent. A `nextId` below
`FIRST_DYNAMIC_ID` (for example 5 with no entities) is accepted and the next `allocate` would issue an id that
collides with a static entity (ids 1-5) or the player (100). `restoreWorld` pre-validates through
`parseWorldSnapshot` (`nextId >= 101`), so this is unreachable on the production path. The export is public, so the
invariant should live with the store.
**Fix:** Add `if (!Number.isSafeInteger(next) || next < FIRST_DYNAMIC_ID) throw new RangeError(...)` beside the
existing checks.

### IN-02: `spawnEntity` throws a TypeError instead of refusing on malformed `ai.params`

**File:** `src/sim/world/world.ts:234` (called from `isLegalSpawn`, `:263`)
**Issue:** The contract (doc at `:283`) is "refuses, returning undefined". `isLegalAi` calls `Object.keys(ai.params)`,
which throws for `null` or `undefined` params. `isLegalSpawn` likewise dereferences `init.position` and
`init.orientation` without a guard. The types forbid these today, but the module is written as a defensive
validation boundary (`typeof init.specKey !== "string"` is checked), so the three accessors are inconsistent with it.
**Fix:** Guard first, for example `if (typeof ai.params !== "object" || ai.params === null) return false;`, and
check `init.position`/`init.orientation` for object-ness.

### IN-03: `swapSystem` tracks one settlement frame in a single slot

**File:** `src/app/session/start-session.ts:729-745`
**Issue:** `settleSwap` and `ctx.runtime.swapRafId` are single-slot. If the `?test=1` hook calls `swapSystem()` twice
before the first frame fires, the second call overwrites both. The first callback then zeroes `swapRafId` and
`settleSwap`, so `dispose()` can no longer cancel the second frame or release its waiter. The continuation still
re-checks `disposed`, so nothing draws into a torn-down session; the only effect is a leaked pending frame and a
promise that settles late. Test-only reachability.
**Fix:** Serialise swaps (return the in-flight promise from a second call), or keep a `Set` of pending frame ids.

### IN-04: Stale "until split step N" comments after the split completed

**File:** `src/app/session/sim-driver.ts:19-21`, `src/app/session/chart-controller.ts:13-15`,
`src/app/session/settings-controller.ts:12-14`
**Issue:** These headers still say the frame shell, system entry and the sub-panel `keydown` listener "stay in the
facade until split step 9" or "step 7 moves them". `frame-loop.ts`, `hyperspace-controller.ts` and `start-session.ts`
now own them, and `game-session.ts` registers no listener. The comments describe a state that no longer exists.
**Fix:** Update or delete the three sentences.

### IN-05: `SessionDeps` is declared and exported but never used

**File:** `src/app/session/context.ts:231-257`
**Issue:** The interface has no importer in `src` or `tests` (confirmed with `rg`). Its own header comment (`:13-16`)
presents it as the immutable-wiring contract, but `createGameSession` passes each controller an ad-hoc deps object.
Dead code that implies a structure the code does not follow.
**Fix:** Remove it and the paragraph that refers to it.

### IN-06: In-flight predicate differs between cold boot and warm Load

**File:** `src/app/session/save-controller.ts:441` versus `src/app/session/start-session.ts:425`
**Issue:** The warm Load resumes a world for `restored.state.mode !== "docked"`; the cold boot uses
`flightState.mode === "inFlight"`. `restoreFromSave` can only produce `docked` or `inFlight`
(`persistence/autosave.ts:237-268`), so they agree today. If a `launching` restore is ever introduced, the two paths
would diverge on whether a world exists, which the lifecycle contract (same seed and epoch warm or cold) forbids.
**Fix:** Use one shared predicate (`mode === "inFlight"`) in both places.

### IN-07: `save-controller` imports `toTuple` from `probe-publisher`

**File:** `src/app/session/save-controller.ts:52`
**Issue:** A controller takes a value import from the probe publisher solely for a three-line helper. The publisher
imports `render/sync.js` and `probe.js`, so the controller's Node-testable import graph (its header stresses this)
now carries render code. It also creates a controller-to-publisher dependency the facade's call-time wrappers were
designed to avoid.
**Fix:** Move `toTuple` to a small shared module (or inline it) and import it from there in both files.

### IN-08: `begin()` refusing on a saturated epoch leaves the previous world alive across an arrival

**File:** `src/app/session/hyperspace-controller.ts:225`, `src/app/session/world-lifecycle.ts:127-134`
**Issue:** The arrival comment says `begin` "cannot throw", which is true, but `begin` also returns silently without
`end()`-ing the existing world when `epoch >= 0xffffffff`. The old system's world (and any ids in it) would then be
stepped in the new system, violating the per-world id scope. It needs about 4.29 billion launches or arrivals, or a
hostile `resetForRestore(0xfffffffe)` once Phase 11 persists the epoch, so it is not reachable in Phase 8.
**Fix:** In `begin`'s refusal branch call `world = undefined`, so a refused begin leaves no world rather than a stale one.

---

_Reviewed: 2026-11-13_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
