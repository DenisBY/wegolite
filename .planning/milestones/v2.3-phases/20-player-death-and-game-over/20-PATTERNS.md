# Phase 20: Player Death and Game Over - Pattern Map

**Mapped:** 2026-11-22
**Files analyzed:** 27 (6 new, 21 modified)
**Analogs found:** 27 / 27 (all in tracked `src/` and `tests/`; no gitignored mirror paths)

Line numbers below were read this session at `main` (a5a03ce). The full per-file inventory of every `FlightMode` and `paused` site is in 20-RESEARCH.md "Inventory 1" and "Inventory 2". This file only adds the code to copy.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `src/sim/combat/death.ts` (NEW) | service (sim) | event-driven | `src/sim/combat/ledger.ts` (event push + state mutation) | role-match |
| `src/sim/combat/ledger.ts` | service | transform | itself, player branch lines 192-229 | exact |
| `src/sim/combat/step.ts` (`resolveShots`) | service | batch | itself, lines 769-838 | exact |
| `src/sim/combat/collide.ts` | service | transform | itself, lines 440-455 (`destroyable`) | exact |
| `src/sim/flight/state.ts`, `flight/step.ts`, `sim.ts` | model / service | request-response | themselves (early return) | exact |
| `src/sim/events.ts` | model | event-driven | `playerDestroyed` at line 179 | exact |
| `src/persistence/autosave.ts` | service | file-I/O | itself, `snapshotForSave` line 114 | exact |
| `src/input/actions.ts` | config | event-driven | `InputContext` at lines 71-72 | exact |
| `src/ui/game-over.ts` (NEW) | component | request-response | `src/ui/pause.ts` | exact |
| `src/app/session/event-router.ts` (`deathFlow`) | provider (subscriber) | event-driven | `createDamageFlow` line 646 (Phase 19) | exact |
| `src/app/session/context.ts` | config | CRUD | `SessionRuntime` (`paused`, `contextLost`) | exact |
| `src/app/session/save-controller.ts` | controller | file-I/O | itself, `autosave()` lines 240-271 | exact |
| `src/app/session/settings-controller.ts` | controller | event-driven | itself, `pause()` lines 66-84 | exact |
| `src/app/session/chart-controller.ts`, `sim-driver.ts`, `frame-loop.ts`, `render-driver.ts`, `probe-publisher.ts`, `start-session.ts`, `game-session.ts` | controller | event-driven | themselves; sites are in RESEARCH Inventory 1/2 | exact |
| `src/render/bodies/explosions.ts` (reused, unchanged) | component | event-driven | itself | exact |
| `index.html` | config | request-response | existing `#pause` overlay markup | role-match |
| `src/main.ts`, `src/app/game-session.ts`, `src/app/session/start-session.ts`, `context.ts` (the game-over root and overlay, 20-07) | wiring | request-response | the `#pause` root and `createPauseOverlay` wiring (section below) | exact |
| `tests/sim/world/death-cadence.test.ts` (NEW) | test | batch | `tests/sim/world/collision-cadence.test.ts` | exact |
| `tests/sim/combat/death.test.ts` (NEW) | test | event-driven | `tests/sim/combat/ledger.test.ts` | role-match |
| `tests/ui/game-over.test.ts` (NEW) | test | request-response | `tests/ui/pause*.test.ts` and the injected-root pattern | role-match |
| `tests/e2e/death-and-reload.spec.ts` (NEW) | test | request-response | `tests/e2e/save-load.spec.ts` | exact |
| `tests/e2e/game-over-guard.spec.ts` (NEW) | test | request-response | `tests/e2e/save-load.spec.ts`, `autosave.spec.ts` | role-match |
| `tests/guards/collision-player-death.test.ts` | test | n/a | DELETE (retired tripwire) | n/a |
| Pinned tests (ledger, npc-fire, collision-stage, collision-buoy, session-order, step.test.ts:1058) | test | n/a | edit list in RESEARCH "Existing pins" | n/a |

## Pattern Assignments

### `src/sim/combat/ledger.ts` (service, transform): lethal check

**Analog:** itself (the player branch, lines 192-229). Insert the check right after `route()` and keep both internal-damage gates untouched.

```typescript
for (const record of records) {
  if (!Number.isFinite(record.amount) || !(record.amount > 0)) continue;
  if (record.target === PLAYER_ID) {
    if (combat === undefined) continue;
    const route = record.kind === "scrape" ? routeScrapeDamage : routeDamage;
    const result = route(
      combat,
      record.amount,
      sub(record.sourcePosition, player.position),
      rotate(player.orientation, LOCAL_FORWARD),
    );
    events.push({ kind: "shipHit", target: PLAYER_ID, source: record.source,
      amount: record.amount, shield: result.shieldAbsorbed });
    if (internalDamage !== undefined && world !== undefined &&
        (record.kind === "scrape" || combat.energy > 0)) {   // KEEP both gates
      ...rollInternalDamage(result.applied, damageWork, () => rngNext(rng), events);
    }
    continue;
  }
```

To add: read `const energyBefore = combat.energy` before `route()`; skip later player records once `outcome.playerDeath` is set; set `outcome.playerDeath = { damage: record.kind, culprit }` when `mode === "inFlight" && result.applied > 0 && energyBefore - result.applied <= 0`. Add `outcome?` as an optional trailing parameter (about 20 test call sites compare the return array with `toEqual`). The word `killer` and reads of `shipHit` are forbidden outside the guard allowlists, so name the field `culprit` (a spec key string from `world.store.get(record.source)?.specKey` or `staticTargetById(record.source)?.identKey`).

### `src/sim/combat/collide.ts` (service, transform): D-11

**Analog:** itself, lines 440-455. Replace the flag and delete the marker constant and its comments (lines 225-240, 557).

```typescript
colliders.push({
  id: PLAYER_ID,
  hull: playerHull,
  mass: PLAYER_MASS_KG,
  destroyable: !PLAYER_NOT_DESTROYABLE_UNTIL_PHASE_20,   // becomes: destroyable: true
  entity: undefined, buoy: undefined, detached: undefined,
});
```

Keep `energyOf` reading the bank only (`collide.ts:635-637`, `response.ts:282`: `selfDestroyed = self.destroyable && dam1 > self.energy`). Do not add shields.

### `src/sim/combat/death.ts` (NEW, service, event-driven)

**Analog:** the sim state-mutator style of `src/sim/flight/launch.ts` (mode check, mutate, return) and the event-push style of `ledger.ts`. Use the RESEARCH "Code Examples" sketch. Core rules to copy: `if (player.mode !== "inFlight") return;` as the single-death guard, set `player.mode = "dead"`, call `clearHyperspaceAttempt` (from `flight/state.js`), `combat.energy = 0`, and push `{ kind: "playerDestroyed", position, cause }` after every `shipDestroyed` of the tick. Call site is `resolveShots` in `step.ts` after `applyPlayerPush` and before `drainAiEventsNow`. Pin in a test whether the push is applied or skipped on the lethal tick, since `drift` appears in the hash.

### `src/sim/flight/step.ts`, `src/sim/sim.ts` (freeze, fail closed)

**Analog:** the existing mode gate `sim.ts:117`. `step.ts:442` (`modeAtStart !== "docked"`) is the negative gate that is not fail closed. Add as the first statement of both `stepFlight` (before `sanitizeFlightState`) and `stepSim`:

```typescript
if (state.mode === "dead") return [];
```

### `src/sim/events.ts` (model)

Widen line 179 from `{ kind: "playerDestroyed"; position: Vec3 }` to add `cause: { damage: "laser" | "scrape"; culprit?: string }` (omit `culprit`, never set it to `undefined`: `exactOptionalPropertyTypes`). `RESERVED_EVENT_KINDS` (line 241) keeps the 15-kind pin.

### `src/persistence/autosave.ts` (service, file-I/O)

**Analog:** line 114, `const mode = state.mode === "inFlight" ? "inFlight" : "docked";` writes a dead state as docked. Throw for `"dead"` before it ("a dead player is never saved"). The save schema (`save.ts`, `z.enum(["docked","inFlight"])`) already cannot hold `"dead"`.

### `src/app/session/save-controller.ts` (controller, file-I/O): the latch

**Analog:** `autosave()` lines 240-271. Put the latch first, before the `contextLost` check, in both `autosave()` and `manualSave()`; repeat at `queueSnapshot` and `buildSnapshotInputs` (`writeManualSave()` is also called directly from `start-session.ts:719`).

```typescript
function autosave(): void {
  ctx.save.saveAttempts += 1;
  // NEW, first:
  if (ctx.runtime.gameOver) {
    ctx.save.saveSkipReason = "dead";
    syncSaveProbe();
    return;
  }
  if (ctx.runtime.contextLost) {
    ctx.save.saveSkipReason = "recovering";
    syncSaveProbe();
    return;
  }
  ...
```

### `src/app/session/settings-controller.ts` (controller, event-driven): pause refusal

**Analog:** `pause()` lines 66-84; copy the shape of the existing `currentState === undefined` branch.

```typescript
function pause(): void {
  const currentState = ctx.core.state;
  if (currentState === undefined) {
    ctx.runtime.input?.clearAll();
    return;
  }
  // NEW: if (ctx.runtime.gameOver) { ctx.runtime.input?.clearAll(); return; }
  if (ctx.runtime.paused) { ctx.runtime.input?.clearAll(); return; }
  ctx.runtime.paused = true; ...
```

Also add `if (ctx.runtime.gameOver) return;` to `resume()` (line 101+). The same refusal goes into `chart-controller.ts` (`setChartCamera`, `toggleChartPreset`, `openChart` line ~126, `handleFind`) and the `advanceTicks` refusal and break condition in `sim-driver.ts` (~430, 450-457); `stepOnce` gets `if (liveState.mode === "dead") return;` at its top.

### `src/app/session/event-router.ts` (provider, event-driven): `deathFlow`

**Analog:** `createDamageFlow` (line 646), added by Phase 19 as the sixth subscriber.

```typescript
export function createDamageFlow(ctx: SessionState, deps: DamageFlowDeps): EventSubscriber {
  const { commitProfile, messages } = deps;
  return (event) => {
    switch (event.kind) {
      case "equipmentDamaged": { ... messages.clearPrevious(); messages.enqueue(..., 4.5); break; }
```

Copy this factory shape: injected `deps` interface (like `StationFlowDeps`, line ~159, with `closeChart`, `launchSequence.reset`, `hudCanvas`, `messages`), a `switch (event.kind)`, and an idempotence guard (`if (ctx.runtime.gameOver) return;`). Edit the closed tables together: add `playerDestroyed: ["deathFlow"]` to `EVENT_KIND_SUBSCRIBER` (the 24-entry table at lines ~120-146 becomes 25), append `deathFlow` to `EVENT_SUBSCRIBER_ORDER` (seventh), and update `tests/app/session-order.test.ts` (:134 order, :144-173 table and count, :742, :1186, :1219). Resolve display names with the existing `identName(specKey, catalogue, targetNames)` in this file; do not read `shipHit`.

### `src/ui/game-over.ts` (NEW, component, request-response)

**Analog:** `src/ui/pause.ts` (Node-testable factory with an injected `root`, a `requireButton`-style lookup that throws a clear message, an `AbortController` for listeners, `dispose()`).

```typescript
export interface PauseOverlayOptions {
  readonly root: HTMLElement;
  readonly gameRoot: HTMLElement;   // receives focus on close
  ...
}
export function createPauseOverlay(options: PauseOverlayOptions): PauseOverlay {
  const controller = new AbortController();
  let open = false;
  ...
}
```

Shape: `createGameOverOverlay({ root, gameRoot, reload })` with `reload` defaulting to `() => window.location.reload()` and injected in tests. Put the pure `buildGameOverLines(cause, credits, rating, names)` in the same file (Vitest asserts the strings). Space handler: `window` keydown with `event.code === "Space" && !event.repeat`, then `preventDefault()` and `reload()`. Click handler on `#game-over`. Use `formatRating` (`src/ui/station-model.ts:537`) with `labels.rating[0] ?? ""` and kills `0`; format credits without the trailing `₢` (`profile.ts:137-142` appends it and the Oolite template ends in `₢`). Inline the plist strings with their citation like `EQUIPMENT_DAMAGED_TEMPLATE`.

### `src/main.ts` -> `src/app/game-session.ts` -> `src/app/session/start-session.ts` (wiring): the game-over root and overlay (20-07)

**Analog:** the `#pause` root and `createPauseOverlay`, the overlay that travels this exact path today (read at a5a03ce). Copy each hop and put the game-over root and overlay next to the pause ones at every hop.

1. `src/main.ts`: `requireElement` (lines 79-85) throws `Wegolite: expected an element with id "<id>", but it is missing.` for a missing root. The root is looked up at line 161 and passed in the options object of `createGameSession` (call at line 312, `pauseRoot` at 322):

```typescript
const pauseRoot = requireElement("pause");            // :161
const controlsRoot = requireElement("controls");
...
const session = createGameSession({                   // :312
  renderer, assets, scenes, title, docked: station, hudCanvas, probe,
  system: lave,
  galaxy: galaxy0(),
  pauseRoot,                                           // :322
  controlsRoot,
  settingsRoot,
  fpsRoot,
  gameRoot: canvas,
  save: { ... },
```

2. `src/app/game-session.ts`: `GameSessionOptions` declares `readonly pauseRoot: HTMLElement;` (line 122, no doc comment); `createGameSession` destructures it from `options` (line 195) and passes it on in the object literal of `createSessionLifecycle(ctx, { ... })` (call at line 511, `pauseRoot` at 527, between `probe` and `controlsRoot`).

3. `src/app/session/start-session.ts`: `LifecycleDeps` (lines 104-120) declares `readonly pauseRoot: HTMLElement;` (line 114). This is the load-bearing deps interface: `createSessionLifecycle(ctx, deps: LifecycleDeps)` (line 325) destructures `pauseRoot` at line 333. `SessionDeps` in `src/app/session/context.ts:340-352` also lists `pauseRoot` (line 348), but it is declared and never used (Phase 8 review IN-05, `.planning/milestones/v2.0-phases/08-session-split-and-world-core/08-REVIEW.md:196`): a field added only there wires nothing.

4. Runtime field: `SessionRuntime` declares `pauseOverlay: PauseOverlay | undefined;` (`context.ts:289`), defaulted to `pauseOverlay: undefined` in `createSessionState` (`context.ts:473`).

5. Creation, once per `startSession` (`start-session.ts:470`), right after the input source is attached and the loop created:

```typescript
ctx.runtime.input.attach();
ctx.runtime.loop = createGameLoop();
...
ctx.runtime.pauseOverlay = createPauseOverlay({       // :769
  root: pauseRoot,
  gameRoot,
  onResume: () => {
    resume();
  },
  onControls: () => {
    openControls();
  },
  onSettings: () => {
    openSettings();
  },
});
```

6. Teardown: `dispose()` (`start-session.ts:993`, documented order at lines 968-992, step 4 "the station nav, then the input source (cleared, then disposed), the pause overlay, the controls panel, the settings panel and the FPS counter") disposes it after the input source. It is disposed, not reset to `undefined`:

```typescript
ctx.runtime.input?.clearAll();
ctx.runtime.input?.dispose();
ctx.runtime.pauseOverlay?.dispose();                   // :1015
ctx.runtime.controlsPanel?.dispose();
ctx.runtime.settingsPanel?.dispose();
ctx.runtime.fpsCounter?.dispose();
```

7. Tests: the lifecycle harnesses build `LifecycleDeps` with `as unknown as LifecycleDeps` and pass no `pauseRoot` (`tests/app/session/start-session.test.ts:105-153`, `tests/app/session/world-lifecycle.test.ts:795-819`), so a new required root does not break them at typecheck. The teardown-order pin `TEARDOWN` (`start-session.test.ts:462`, doubles at lines 440-458) lists `"pauseOverlay.dispose"` right after `"input.dispose"`: if a game-over overlay double is installed there, add its entry next to the pause overlay's and name it in the `dispose()` doc's step 4 in the same commit. `tests/app/session/settings-controller.test.ts:69` assigns a `ctx.runtime.pauseOverlay` double directly, the shape for a `ctx.runtime.gameOverOverlay` double in `tests/app/session/death-flow.test.ts`. The `#pause` markup is `index.html:2098`; 20-05 adds `#game-over` beside it.

### `src/input/actions.ts` (config)

Lines 71-72: add `"gameOver"` to `InputContext`. No action lists it, so `keyboard.ts:164` (`if (contextual.length === 0) return RESERVED_F_KEYS.has(code)`) swallows F1-F8 and `frame()` (`:237-239`) returns the zero frame. Update `tests/input/station-actions.test.ts:236-237` and `tests/input/bindings.test.ts`.

### `src/app/session/frame-loop.ts`, `render-driver.ts`

New top-of-frame branch (after the pause-toggle consumption and state guards, before `handleChartActions`): drain every input queue, `ctx.runtime.gameOverSeconds += clampFrameDelta(delta)`, `renderFrame(1, shouldDraw())`, `updateProbe()`, `return`. In `render-driver.ts`: add a `mode === "dead"` camera branch next to the `inFlight` one (~245) using `computeViewCamera` (`src/render/launch-camera.ts:129-145`) with the position moved 100 m along local -Z; include dead in `hudHidden` (~368); pass `flightTime + gameOverSeconds` to explosions, shots and debris updates; set `#view` `style.filter = "saturate(...)"` per frame and clear it on dispose; add a settled idle rule to `shouldDraw`.

### `tests/sim/world/death-cadence.test.ts` (NEW, test, batch)

**Analog:** `tests/sim/world/collision-cadence.test.ts` (header and imports lines 1-60 read above). Copy the `replay(hz)` runner over `CADENCES = [30, 60, 144]`, `clampFrameDelta`, `MAX_STEPS_PER_FRAME`, `laveFixture`, `fullHullTable`, `realNpcFlightTable`, and sample `hashWorld`/`hashFlight` by tick. Change the termination: count `step()` calls and stop N steps after the death, because `state.tick` stops advancing when dead (the original `state.tick >= END_TICK` loop would run to its `frame > 200_000` throw). Add non-vacuity asserts for the three kills (NPC vs NPC, collision kill, player death) and equal death tick and cause.

### `tests/e2e/death-and-reload.spec.ts`, `game-over-guard.spec.ts` (NEW)

**Analog:** `tests/e2e/save-load.spec.ts` (imports: `getProbe`, `waitForReady`, `writeRaw`, `readRaw`, `AUTOSAVE_KEY`, `dockedSaveAt` from `./helpers/*`; per-file `test.setTimeout(...)`; no pixel assertions; correctness waits on the probe). Seed IndexedDB with `writeRaw` before the first load (a `?test=1` session is tainted and never writes). Extend `inFlightSaveAt` in `helpers/save-fixtures.ts` to accept `damagedEquipment` like `dockedSaveAt`. Boot `?test=1&traffic=1&clock=manual` from the seeded in-flight save (no launch) and give each test an explicit timeout; apply the 60 % rule from the CI-margins todo. Add a row for `probe.death` in the optional-key audit table of `tests/e2e/probe-shape.spec.ts`.

## Shared Patterns

### Fail closed on a new mode
**Source:** RESEARCH Inventory 1. Positive gates (`=== "docked"`, `=== "inFlight"`) already refuse `"dead"`. Fix only the negative sites: `flight/step.ts:442`, `autosave.ts:114`, `chart-controller.ts:126`, `render-driver.ts:245/368`, `sim-driver.ts` `stepOnce` and `advanceTicks`.

### Closed sets edited together with their pins
**Source:** `event-router.ts` tables and `tests/app/session-order.test.ts`, `tests/sim/world/step.test.ts:1058`. Edit the table and the pin in one commit (Phase 19 `damageFlow` precedent).

### Guard allowlists
**Source:** `tests/guards/kill-credit-consumers.test.ts:47-52` (`killer` only in `world/kill.ts`, `combat/ledger.ts`, `combat/step.ts`, `events.ts`) and `tests/guards/ship-hit-consumers.test.ts:30-33` (`shipHit` only in `events.ts`, `ledger.ts`). New code uses `culprit`, never `killer` or `shipHit`. Keep `killPlayer` in `src/sim/combat/` (not `src/sim/world/**`, a QUAL-11 trigger path).

### Presentation clock
Frozen `flightTime` while dead: the render side adds `ctx.runtime.gameOverSeconds` (wall time) to the effect clock.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| CSS `saturate()` fade on `#view` | render | transform | No existing per-frame CSS filter on the canvas; follow RESEARCH "Render" (assumption A1: confirm it applies to a WebGL canvas in UAT or `e2e-cross`). |
| `#game-over` markup in `index.html` | config | n/a | Copy the `#pause` overlay markup shape; also set `data-launching` (or a `data-dead` rule) so the `#title`/`#status` overlay lines stay hidden (index.html:58-61). |

## Metadata

**Analog search scope:** `src/sim/combat`, `src/app/session`, `src/ui`, `src/input`, `src/persistence`, `src/render`, `tests/sim/world`, `tests/e2e`, `tests/guards`.
**Files read for excerpts:** `ledger.ts`, `collide.ts`, `event-router.ts`, `save-controller.ts`, `settings-controller.ts`, `pause.ts`, `collision-cadence.test.ts`, `save-load.spec.ts`, and (revision 2026-11-22, for 20-07) `src/main.ts`, `src/app/game-session.ts`, `src/app/session/start-session.ts`, `src/app/session/context.ts`, `tests/app/session/start-session.test.ts`, `tests/app/session/world-lifecycle.test.ts`, plus 20-CONTEXT.md and 20-RESEARCH.md (first 480 lines of 655; the Code Examples tail and the validation sections were not re-read).
**Pattern extraction date:** 2026-11-22 (revised the same day: the pause-overlay wiring section for 20-07)
