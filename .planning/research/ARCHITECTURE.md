# Architecture Patterns: v2.0 Foundation & Combat

**Domain:** Multi-entity, deterministic space-combat simulation added to an existing single-ship TypeScript/Three.js game
**Researched:** 2026-11-11 (supersedes the v1 architecture file of 2026-11-02)
**Overall confidence:** HIGH for the integration points, session split, entity store, collision and save format (all read directly from the repository and the Oolite checkout at `/home/opencode/git/oolite`); MEDIUM for the AI port volume, render batching limits and the audio layer (sound design and exact behaviour formulas need phase-level research).

Evidence basis: the Wegolite tree at `master` (`4bb1f53de`) and the Oolite source (`src/Core/Universe.m`, `CollisionRegion.m`, `Octree.m`, `OOMesh.m`, `Entities/ShipEntity.m`, `Entities/ShipEntityAI.m`, `Scripting/OOJSEntity.m`, `Resources/Scripts/oolite-priorityai.js`, `Resources/Scripts/oolite-populator.js`, `Resources/AIs/*.js`). Line numbers cited below are from that checkout.

---

## 1. Decisions in one table

| # | Question | Recommendation | Confidence |
|---|----------|----------------|------------|
| 1 | Split `game-session.ts` | Keep `createGameSession` as a thin facade; extract 10 controllers into `src/app/session/` around one explicit `SessionContext` (no closure `let`s). Order: re-point the two source-scanning tests first, then leaf controllers, then the sim-driver/event-router seam, then the frame loop and composition root. | HIGH |
| 2a | Entity ids | Monotonic integers, never reused, `0 = none`, player = `1`. Dead ids are simply invalid forever. | HIGH |
| 2b | Store layout | Plain-object "ECS-lite": one dense array in id order, `kind` discriminant, optional component bags. No SoA, no ECS library (cap 256 entities). | HIGH |
| 2c | Iteration | Id-ascending array; iterate a length snapshot taken at phase start; `kill` sets `dead`, physical removal in `commit()` at end of tick. Never iterate a `Map`/`Set` for a sim decision. | HIGH |
| 2d | Player | Hybrid: the player is a first-class id and a uniform `Body` view, but its storage stays `FlightState`. Combat state of the player lives in the world. Do not fold `FlightState` into the NPC ship component in v2.0. | HIGH |
| 3 | Collision | Sweep-and-prune on one axis plus a static-sphere list (planet, sun); sphere test, then narrowphase tiers (sphere, OBB SAT, octree-vs-octree). Output is contacts **and** proximity alerts. Octrees are emitted at build time. Generalise `dock/hull.ts` into a shared SAT kernel; keep the dock proxy for player-vs-main-station. | HIGH |
| 4 | AI | `AiState` plain data on each ship (role id, params bag, behaviour id, `wakeTick`, `nextThinkTick`, cache ids). Static priority trees as typed literals referencing string ids in registries. Events are queued and drained FIFO between phases. Timers are integer ticks. Per-ship PRNG state. | HIGH |
| 5 | Save | Bump to **v3** once, up front, with all new fields; migrate v2 to v3 in order. Anchor saves carry only a world epoch (the world is regenerated from the seed). A strict, size-bounded world snapshot codec exists for hashing and tests, and is reserved in the schema but not written. | HIGH |
| 6 | Render | `EntitySync` in `src/render/entities/`: per-model-key `InstancedMesh` batches, camera-relative matrices, JS-side distance culling with Oolite's `no_draw_distance` rule, one batched effects layer. Hard cap on batches per frame so the 50-call budget holds by construction. | MEDIUM |
| 7 | Audio | `src/audio/` is an `EventRouter` subscriber. The sim emits semantic events; a table maps them to `customsounds.plist` keys. `AudioContext` is created and resumed inside the title-screen click. Audio never feeds back into the sim. | MEDIUM |

---

## 2. Baseline: what exists and what constrains the design

### 2.1 Shape of the current code

```
src/sim/            pure TS, ESLint-fenced (no three/DOM/Math.random/Date; imports only src/sim + content/types)
  flight/state.ts   FlightState (25 fields, player only) + canonical serializeFlight/hashFlight
  flight/step.ts    stepFlight(state, layout, config, intent, commands, dt, options) -> SimEvent[]
  world/layout.ts   SystemLayout: one station, planet, sun, nav buoy, witchpoint (static bodies, not entities)
  dock/*            corridor + 15-axis SAT (hull.ts) against a port-frame contact proxy; Cobra-only extents
  commands.ts       Command union (edge commands);   events.ts  SimEvent union (no UI copy)
  state.ts          InputFrame (the single input seam), probe SimState;  loop.ts / step.ts  probe replay harness
  math.ts           Vec3/Quat helpers; createSeededRandom(seed) -> closure (mulberry32)
  hash.ts           fnv1a32 + canon(n, digits)
src/app/game-session.ts   3,365 lines, one closure from line 335: ~100 `let` fields (356-487), ~120 inner functions
src/app/game-loop.ts      real-time accumulator (DT = 1/120, <= 5 steps/frame, commands go to the first step only)
src/render/               camera-relative sync (sync.ts), SystemScene with one `ship` group, 10 draw calls in flight
src/persistence/save.ts   zod strict v2, MAX_SAVE_CHARS = 65,536 (v2 worst case ~38.9 KB), ordered v1->v2 migration
```

### 2.2 Constraints that decide things

1. **Determinism is the product.** Cross-cadence hash equality (30/60/144 Hz) and golden fixtures. Flight hashes are asserted for equality across cadences, not pinned to constants (`tests/sim/*-cadence.test.ts`), so adding fields to `serializeFlight` is safe. Only `tests/golden/kinematic-probe.json` (the Phase 1 `SimState`) is frozen: do not touch `src/sim/state.ts` `serialize`.
2. **The PRNG is not serialisable.** `createSeededRandom` (`src/sim/math.ts:227`) hides its 32-bit state in a closure. The new world needs an object-state variant with the identical bit sequence (see 5.6). Existing callers (`drawWitchpointExit`, market) stay on the closure form.
3. **The sim may not import the ship catalogue** (ESLint rule `**/content/ships*`). The world receives plain derived data (`ShipSpec`, `HullData`, populator tables) from the app, exactly as `FlightConfig` is derived today.
4. **Two source-scanning tests read `game-session.ts` as text** and will break the moment code moves (see 4.3):
   `tests/app/redraw-gate.test.ts:113-155` (exactly one `renderFrame(alpha, shouldDraw())`, exactly five `redrawGate.request();`, `probe.frames += 1;`) and `tests/guards/economy-purity.test.ts:312-352` (exactly three `generateMarket(` producers, no `Date.now`/`performance.now`, the `docked` switch arm contains no market generation).
5. **Draw-call budget 50 / 250 000 triangles** (`docs/PERFORMANCE.md`, `tests/e2e/budget.spec.ts`). In-flight today: 10 calls (13 docked). The Cobra GLB is 1 mesh and **2 primitives = 2 draw calls per ship**, so 20 naive NPC clones already blow the budget.
6. **Content gap.** Only `oolite_cobra3`, the four Coriolis parts and the buoy `.dat` files are vendored (`third_party/oolite/Models/`). Every NPC model, its textures, shipdata stats, sounds and the populator tables must be vendored with provenance in `ASSETS.md` / `NOTICE` before the world can show anything. `ships-client.json` is 15 KB (2 entries); `ships.json` is 194 entries.
7. **Anchored autosave.** Saves are leg anchors (dock, pre-launch, post-arrival), never a position log (Key Decisions D-17, "Restore in-flight saves to the witchpoint"). This is what makes the world regenerable from a seed (section 8).

### 2.3 Integration points (file paths)

| Concern | Existing file | Change |
|---------|---------------|--------|
| Per-tick player step | `src/sim/flight/step.ts` `stepFlight` | **Unchanged signature.** Called first in the new `stepSim`. New commands/events are handled by `stepWorld`, not by extending the giant switch. |
| Player state | `src/sim/flight/state.ts` | **Modified (additive):** `FlightMode` gains `"dying"`, `"escapePod"`, `"dead"`; add `cabinTemperature`; `serializeFlight` appends lines. |
| Input frame | `src/sim/state.ts` `InputFrame` | **Modified:** add optional `fire?: boolean` (precedent: `thrust?`). Still the only input-frame shape. |
| Commands | `src/sim/commands.ts` | **Modified:** add `fireMissile`, `armMissile`, `cycleMissile`, `untargetMissile`, `ecm`, `targetNext`/`identify`, `jettison`, `ejectPod`. |
| Events | `src/sim/events.ts` | **Modified:** add world/combat events (section 7.6). Still copy-free. |
| Dock SAT | `src/sim/dock/hull.ts` | **Modified:** extract the generic 15-axis OBB SAT into `src/sim/collision/sat.ts`; `hull.ts` keeps its API and delegates (dock tests unchanged). |
| Dock corridor | `src/sim/dock/corridor.ts` `dockSnapshot(layout, state, geometry, angle)` | **Modified:** accept `{position, orientation}` plus a ship box instead of a `FlightState`; keep a thin `FlightState` overload. Needed for NPC docking with per-ship extents. |
| Layout | `src/sim/world/layout.ts` | **Unchanged.** `createWorld` reads it to build planet/sun/station entities. |
| Aegis/compass | `src/sim/world/aegis.ts` | Unchanged; reused by AI conditions (`conditionInAegis...`). |
| Arrival | `src/sim/hyperspace/arrival.ts` | Unchanged; the arrival pose still comes from `drawWitchpointExit`. Population is triggered after it. |
| HUD scanner | `src/app/hud-model.ts` `scannerTargets(layout)` | **Modified:** read contacts from `WorldView.scan(player, range)`; add colour/kind per scan class; keep the 11-element HUD set. |
| Scene | `src/render/system-scene.ts`, `sync.ts` | **Modified:** add `entities: EntityLayer` to `SystemScene`; `applyFrame` calls `EntitySync`. Station/planet/sun/buoy placement stays as is. |
| Assets | `src/render/asset-cache.ts` | **Modified:** add `loadShipModel(key)` (lazy, memoised, ownership rule unchanged) beside `loadCobra/Coriolis/Buoy`. |
| Save | `src/persistence/save.ts`, `autosave.ts` | **Modified:** v3 (section 8). |
| Settings | `src/settings/schema.ts` | **Modified:** audio volumes/mute (note the existing downgrade caveat). |
| Probe | `src/app/probe.ts` | **Modified (additive):** `probe.world` gains entity counts, `probe.combat`, `probe.audio`. |
| Content build | `tools/oolite-ingest/convert/*` | **New converters:** `ship-specs.ts`, `octree.ts`, `sounds.ts`; **extended:** `ships.ts`, `glb.ts` for NPC models. Must obey the generator determinism zone (no `Math.sin/cos/pow`). |

---

## 3. Recommended architecture

### 3.1 Layers (dependency direction is unchanged and enforced)

```
content (generated JSON + GLB + octree/hull blobs, read-only)
   ^ types only
src/sim  (pure)        player: FlightState + stepFlight (existing)
   |                   world:  EntityStore, ships, collision, AI, populator, combat   [NEW]
   |                   stepSim(sim, frameInput, commands, dt) -> SimEvent[]          [NEW]
   v   events + read-only views
src/app/session/*      SimDriver -> EventRouter -> { HudMessages, StationFlow, Autosave, DockFeedback,
                                                    HyperspaceFlow, AudioDirector [NEW], Probe }
   |                   RenderDriver -> render/*  (EntitySync, EffectsSync [NEW])
   v
render | ui | input | persistence | audio [NEW]   (consumers; never mutate sim state)
```

New ESLint zone: `src/audio/**` may import `src/sim` **types** and `src/app` event types only, and may not import `sim` runtime modules. `src/sim/ai/**`, `src/sim/ship/**`, `src/sim/collision/**`, `src/sim/populator/**` fall inside the existing `src/sim/**` fence (no `Math.random`, no `Date`, no DOM) and therefore inherit the determinism rules for free.

### 3.2 One simulation tick

`stepSim` is the only entry point the app calls per fixed step. The existing `stepFlight` runs first and untouched; the world runs after it so every world phase sees the player's final pose for the tick.

```
stepSim(sim, frame, commands, dt):
  1. events  = stepFlight(player, layout, config, intent, commands, dt, options)   [existing]
  2. if world is live (mode launching | inFlight | dying | escapePod):
       events += stepWorld(world, player, frame, commands, dt)
     else: nothing (docked: the world does not exist, see 8.2)

stepWorld (all phases deterministic, ids ascending):
  W0  tick++ ; apply world commands (fire, missile, ECM, target, jettison, eject)        -> events
  W1  UPDATE   for each ship in the length-snapshot: timers, energy/shield recharge,
               weapon cooling, heat, steering (BEHAVIOUR_*), motion, lifespan/fuse
               (Oolite ShipEntity.update:, processBehaviour:)
  W2  AI       drain the AI event queue FIFO (handlers); then for each ship in id order:
               if wakeTick > 0 and tick > wakeTick: dispatch aiAwoken (reconsider)
               if plist AI and tick >= nextThinkTick: think; repeat the drain (cap 8 passes)
  W3  COLLIDE  broadphase -> narrowphase -> proximity alerts -> resolve contacts in (idA,idB) order
  W4  SPAWN    populator timers (repopulate), scoop/dock completions, player-outcome hooks
  W5  COMMIT   physical removal of dead entities, make pending spawns iterable, clear scan caches,
               emit entityRemoved events
  return events in emission order
```

Why this differs from Oolite on purpose (record each in `FIDELITY.md`):

1. Oolite runs `[thing update:]` then immediately that ship's AI think, and delivers script events synchronously, re-entrantly (`Universe.m:6533-6583`; `ShipEntity.m:12854` `doScriptEvent:andReactToAIMessage:`). We run **update-all, then AI-all**, and queue events. A handler can then never mutate another ship halfway through that ship's update. Almost every handler only sets state or schedules a reconsider (minimum 0.1 s), so a within-tick delay is unobservable.
2. Oolite queues collisions into `collidingEntities` during `findCollisions` and processes them at the start of the *next* update (`manageCollisions`, `ShipEntity.m:10991`). We resolve in W3 of the same tick, so no pending-contact state needs saving or hashing. At most one tick (8.3 ms) earlier.
3. Oolite orders updates by distance from the player (`sortedEntities`, `zero_distance`), a scanner/draw optimisation. We order by id. The order is a determinism device, not gameplay.

### 3.3 Data flow per rendered frame

```
input.frame() + drained commands
  -> SimDriver.advance(delta)           (GameLoop: <= 5 steps; commands to the first step only)
       per step: PoseTracker.capture(world)   (previous := current for every live id; render-only data)
                 stepSim(...)
                 EventRouter.dispatch(events) (synchronous, ordered, subscribers never mutate sim)
  -> RenderDriver.renderFrame(alpha)
       interpolate player pose + every entity pose by alpha (PoseTracker)
       applyFrame(bodies)  +  EntitySync.update(world, poses, cameraWorld)  +  EffectsSync.update(events)
       HUD model from WorldView.scan(player, scannerRange)
       probe.publish()
```

---

## 4. Question 1: splitting `game-session.ts` without breaking tests

### 4.1 Module boundaries

`createGameSession(options): GameSession` stays the only public export (plus `DESTINATION_BUILD_FAULT_MESSAGE`, `SessionFaults`, `StartOptions`, `GameSessionOptions`), so `src/main.ts` and `tests/e2e/*` are untouched. Inside, state moves from closure `let`s to one typed record read through getters. **Modules must read live fields through the context, never capture them**: `state`, `layout`, `scene`, `system`, `market`, `profile` are all reassigned by a jump or a Load, and `drawKeys()` compares the *identity* of `state` for the redraw gate.

| New module (`src/app/session/`) | Owns (current line range in `game-session.ts`) | Reads from context | Notes |
|---|---|---|---|
| `context.ts` | the ~100 `let`s (356-487) as `SessionState { core, station, chart, save, runtime }` | n/a | One object; groups mirror the current clusters. |
| `probe-publisher.ts` | `updateProbe` (2412-2550), `bindTestHook`, `applyTestCredits/Equipment`, `syncEconomyProbe`, `syncSaveProbe` | everything, read-only | Probe field names frozen (e2e relies on them). Additive fields only. |
| `settings-controller.ts` | pause/resume/focus/context-loss, settings and controls panels, quality (1500-1630, 2237-2294) | `runtime`, `settings` | Keeps `redrawGate.request()` calls (see 4.3). |
| `station-controller.ts` | trade, fit, selection, `renderStation`, `applyStationAction`, nav tabs (492-1020, 1628-1760, 2171-2237) | `station`, `profile`, `market` | Largest pure-UI block; no sim coupling beyond `profile` commits. |
| `chart-controller.ts` | chart open/close/camera/selection/arrows (1746-2043, 2044-2060) | `chart`, `galaxy` | |
| `save-controller.ts` | autosave, manual save, `loadFromSave`, save screen (1021-1500, 1863-1970) | `core`, `profile`, `market` | `loadFromSave` re-installs `state`/`layout`/`scene` through context setters. |
| `hyperspace-controller.ts` | `handleHyperspaceJumped`, `enterSystemById`, refusal copy (1768-1800, 2061-2160) | `core`, `market`, `profile` | **Move as one unit.** The "one synchronous install block" (G-7) must stay atomic; world teardown/populate hooks join it. |
| `event-router.ts` | `handleEvent` (2294-2410) split into ordered subscribers | subscribers get a narrow facade | Subscribers: `hudMessages`, `stationFlow` (docked/launched), `dockFeedback`, `hyperspaceFlow`, `autosaveTriggers`, later `audio`. Order is fixed and tested. |
| `sim-driver.ts` | the body of `frame()` that drains commands and calls `loop.advance`, previous/current pose, `stepFlight` call (2763-2855) | `core`, `input`, `loop` | **The seam where `stepSim` and the world plug in.** Node-testable: no THREE, no DOM beyond the injected input source. First session-level unit tests become possible. |
| `render-driver.ts` | `renderFrame`, `showHint`, `shouldDraw`, `drawKeys` (2552-2697) | `core`, `scene`, `hud` | Houses the only gated `renderFrame(alpha, shouldDraw())` call site. |
| `frame-loop.ts` | `frame()` shell: pause toggle, chart/save-screen freeze branches, then sim-driver and render-driver | all controllers | Order inside `frame()` is load-bearing (chart/save drains before the freeze branch; launch autosave before the step). |
| `start-session.ts` | `startSession` wiring (2884-3250), `swapSystem`, `dispose` | all | Composition root; owns construction order and teardown order. |

### 4.2 Order of extraction (each step is one commit, `verify` green; steps 1-9 touch render/input/persistence code, so run `verify-full` at 3, 6 and 9)

| Step | Extraction | Why here | Risk |
|---|---|---|---|
| 0 | Re-point the two source-scanning tests at a helper (`tests/helpers/session-source.ts`) that concatenates `game-session.ts` and `src/app/session/**/*.ts`; assertions stay structural (counts across the concatenation). Green against the unmodified monolith. | Removes the only hard test coupling before any code moves. | Low |
| 1 | `context.ts`: introduce `SessionState`, keep every function in place but read `ctx.x` instead of `x`. Pure mechanical rewrite. | Makes later moves a cut-and-paste. | Medium (typo-class bugs; typecheck catches them) |
| 2 | `probe-publisher.ts` | Read-only consumer; no behaviour. | Low |
| 3 | `render-driver.ts` | Read-only on sim state; nothing else calls into it but `frame()`/`start`. Keep `renderFrame` signature so the scan holds. | Low |
| 4 | `chart-controller.ts`, `settings-controller.ts` | Self-contained overlays. | Low |
| 5 | `station-controller.ts` | Large but UI-only. | Low |
| 6 | `save-controller.ts` | Clear boundary (`SaveInputs` builder + store). `loadFromSave` is the delicate part. | Medium |
| 7 | `hyperspace-controller.ts` | Atomic install block moves whole. | Medium |
| 8 | `event-router.ts` + `sim-driver.ts` | The seam. After this, `stepSim` replaces the `stepFlight` call in one place. | Medium |
| 9 | `frame-loop.ts` + `start-session.ts`; `game-session.ts` shrinks to the facade. | Last, because it touches everything. | Medium |

### 4.3 Test impact and how to keep it green

- Steps 0 and 9 are the only ones that must edit a test. Everything else must leave `tests/app/redraw-gate.test.ts` and `tests/guards/economy-purity.test.ts` passing with the helper from step 0: the five `redrawGate.request();` calls, the single gated `renderFrame`, `probe.frames += 1;`, `probe.renders = renderer.info.render.frame;`, the three `generateMarket(` producers and the `docked` arm free of market generation must all still exist **somewhere** in the concatenated sources. Moving the `docked` arm into `station-flow` keeps the `switchCaseBody` scan valid if the helper exposes that file too.
- The e2e suite drives the shipped bundle and `window.__wegolite`; nothing there imports session internals (`hyperspace-failure.spec.ts` deliberately does not import it). The probe must stay field-for-field compatible: add, never rename.
- Add during the split: one Node-level test per extracted controller that constructs it with a fake context (first unit tests of session logic), and a `session-order.test.ts` pinning `EventRouter` subscriber order and the `frame()` phase order (chart drain, save-screen drain, freeze, station actions, commands, launch autosave, step, render).
- Hazards found while reading the closure: `performSwap` re-reads `layout` from the scene manager; the `docked` arm calls `autosave()` only after the station screen, selection and pose are ready; `frame()` takes the pre-launch autosave **before** `loop.advance`; `handleHyperspaceJumped` sets `paused = true` on a failed arrival to freeze the sim behind the failure surface. Each needs a regression assertion at the point it moves.

---

## 5. Question 2: entity store

### 5.1 Ids

```ts
export type EntityId = number;           // integer >= 1; 0 = NO_ENTITY (Oolite NO_TARGET)
export const NO_ENTITY = 0;
export const PLAYER_ID = 1;              // Oolite fixes the player at UID 100; any fixed id works
```

- Allocation is a saved counter, `nextId++`, never reused within a world. Oolite scans for free slots in `entity_for_uid[]` and wraps `next_universal_id` (`Universe.m:5014-5029`), which makes stale-id aliasing possible; a monotonic counter makes "dead reference" decidable (`store.get(id) === undefined`) with no generation bits.
- Reserved ids after `createWorld`: `1` player, then planet, sun, main station get the next three ids in a fixed order. All three exist as real entities (static pose from `SystemLayout`) so AI `destination`/`target`, scanner, compass and collision pairs treat them uniformly. `SystemLayout` stays the source of their numbers.
- Cap: `MAX_ENTITIES = 256` (Oolite: 2048 ids, `UNIVERSE_MAX_ENTITIES`; initial array 200). `spawn` returns `undefined` when full, as `addEntity:` returns `NO` (`Universe.m:5004`). Populator and AI must handle failure.

### 5.2 Component layout (ECS-lite, plain objects)

```ts
export type EntityKind = "player" | "ship" | "station" | "cargo" | "missile" | "planet" | "sun";

export interface EntityBase {
  readonly id: EntityId;
  readonly kind: EntityKind;
  dead: boolean;                    // Oolite STATUS_DEAD; set by kill(), removed in commit()
  position: Vec3; orientation: Quat;
  radius: number;                   // collision_radius
  scanClass: ScanClass;             // CLASS_NEUTRAL | POLICE | CARGO | MISSILE | STATION | ...
  specKey: string;                  // key into the ShipSpec table; the only content reference stored
  ownerId: EntityId;                // 0 = none
  spawnTick: number;
}
export interface ShipComponent {    // stats are derived from the spec; only mutable state is stored
  speed: number; velocity: Vec3;    // flight speed + Newtonian remainder (Oolite flightSpeed/velocity)
  flightPitch: number; flightRoll: number; flightYaw: number;
  energy: number; shieldFore: number; shieldAft: number;
  bounty: number; fuel: number; temperature: number;
  weaponTemp: number; shotTick: number; missiles: number; ecmCooldownTick: number;
  cargo: { commodity: string; amount: number }[];
  rng: number;                      // per-ship mulberry32 state (u32)
}
export interface NavComponent {     // the native ShipEntity steering fields the AI writes
  behaviour: BehaviourId; targetId: EntityId; destination: Vec3;
  desiredRange: number; desiredSpeed: number; frustration: number;
  proximityId: EntityId;            // Oolite proximityAlert
  groupId: number;                  // 0 = none
}
export interface AiComponent { /* section 7.2 */ }
export interface LifeComponent { expireTick: number }        // debris, pods, fuses
export type Entity = EntityBase & {
  ship?: ShipComponent; nav?: NavComponent; ai?: AiComponent; life?: LifeComponent;
  cargoItem?: { commodity: string; amount: number };        // scoopable
};
```

Why plain objects and not SoA: the cap is 256 and a tick touches tens of entities. Array-of-objects serialises trivially, hashes in canonical key order, and keeps the ported Oolite code readable (`ship.nav.targetId`). SoA would add machinery with no measurable gain (see Scalability).

Groups (`OOShipGroup`: leader, members, escorts) become first-class records in the world, `groups: {id, leaderId, memberIds[]}[]` sorted by id, referenced by `nav.groupId`. Never store object references between entities.

### 5.3 Store API and iteration rules

```ts
interface EntityStore {
  get(id: EntityId): Entity | undefined;   // undefined if missing OR dead (== Oolite entityForUniversalID nil / JS isValid false)
  spawn(init: SpawnInit): Entity | undefined;   // allocates id now; entity usable immediately by the spawner
  kill(id: EntityId, cause: KillCause): void;   // sets dead; the entity stays in the array until commit()
  commit(): EntityId[];                         // end of tick: compact in order, rebuild index, return removed ids
  readonly live: readonly Entity[];             // id-ascending; includes entities spawned this tick
  readonly nextId: number;
}
```

Rules, each with a test:

1. **`live` is id-ascending by construction.** Ids are monotonic and spawns append; `commit()` filters in place. No re-sort is ever needed, and there is nothing to depend on hash order.
2. **Snapshot semantics for update.** W1 captures `const n = store.live.length` and iterates `0..n-1`. An entity spawned during the tick exists immediately (the spawner must be able to set its position and AI, as `system.addShips` callers do) but is first *updated* next tick. This is Oolite's `my_entities[ent_count]` retained copy (`Universe.m:6432-6439`).
3. **Dead entities are skipped, not updated.** Oolite still updates entities that died earlier in the same update (`entitiesDeadThisUpdate`, `Universe.m:6540`); we skip them. `get(id)` already returns `undefined` for them.
4. **Dead-reference semantics (Oolite `isValid`).** `JS isValid` is `status != STATUS_DEAD` and stale (deallocated) weak references report invalid (`OOJSEntity.m:228`, `OOIsStaleEntity`). Here both collapse into `store.get(id) === undefined`. AI and nav code stores **ids only**, and every use goes through `view.ship(id)`; a dead target therefore behaves as "target lost" through the same distributed checks Oolite uses in its behaviours (`noteLostTarget`), not through a global sweep.
5. **Never iterate a `Map` or `Set` for a sim decision.** A `Map` index exists for lookup only. After a snapshot restore the insertion order differs from the live run, so any Map-ordered decision would diverge. This is the single most likely determinism bug and is caught by the snapshot-resume equality test (section 8.4).
6. **Hash/serialise in `live` order**, canonical key order, numbers through `canon` (existing Pattern C). `hashWorld = fnv1a32("player=" + hashFlight(player) + "\n" + entityLines + "\n" + groups + "\n" + world scalars)`.

### 5.4 The player: entity or special case?

**Recommendation: both, at different levels.** The player has a first-class `EntityId` and implements the uniform read interface; its storage remains `FlightState`.

```ts
interface Body { readonly id: EntityId; readonly kind: EntityKind; readonly position: Vec3;
                 readonly orientation: Quat; readonly radius: number; readonly scanClass: ScanClass;
                 velocity(): Vec3; }
```

`PlayerBody` is an adapter reading `FlightState` (position, orientation, scalar speed plus `impulse`). Contact responses on the player write through the same fields the dock bounce already uses (`impulse`, `speed`), so the existing `advanceImpulse` integration handles them.

Evidence for not unifying storage in v2.0:

1. `FlightState` is 25 fields, almost all player-session concerns (hyperspace countdown, dock latch, launch cinematic, `impulse`, torus), under ~1,370 unit tests and the dock/hyperspace golden behaviour.
2. The motion models differ in Oolite and must differ here: the player slews attitude from an intent (`stepAttitude`, `slew`) with torus and mass lock; NPCs set `flightPitch/Roll/Yaw` directly and integrate rates immediately (`applyAttitudeChanges:` is `applyRoll:flightRoll*dt climb:flightPitch*dt andYaw:flightYaw*dt`, `ShipEntity.m:5899`), with `applyThrust:` handling thrust factor, Newtonian velocity braking and afterburner (`ShipEntity.m:5808`). Forcing one record means two motion models behind one flag.
3. Oolite itself keeps `PlayerEntity` as a `ShipEntity` subclass with its own update and a `PLAYER` global, while the universe addresses it uniformly through `Entity` (`entityForUniversalID:100` returns it, `Universe.m:4843`). Uniform *interface*, specialised *implementation* is the faithful shape.
4. Unifying storage rewrites `stepFlight`, dock, hyperspace and save for zero player-visible value.

What does move into the world: the player's **combat state** (energy banks, shields, weapon temperature, selected missile, target lock, ECM state, legal status/bounty). It is hashed and snapshot-able, lives in `world.playerCombat`, and is reset to "full" at anchors. What is added to `FlightState`: `cabinTemperature` (shared heat model in `src/sim/ship/heat.ts` used by both player and NPCs).

Migration path for `FlightState` (strangler, no flag day): step B1 adds `PlayerBody` and leaves `FlightState` alone; B2 extends it additively (new modes, temperature); nothing is removed. If a later milestone wants player and NPC unification (for example, player piloting a second ship), the `Body` interface is already the seam.

---

## 6. Question 3: collision

### 6.1 Oolite's structure (what to map)

`[Universe update:]` ends with `updateLinkedLists`, `filterSortedLists`, `findCollisionsAndShadows` (`Universe.m:6597-6611`, `6038`).

1. **Sorted x/y/z linked lists** (`x_list_start`...) maintained by bubble sort from frame to frame. `filterSortedLists` (`Universe.m:6713`) marks entities that cannot overlap anything along each axis (bounds `position ± 2*radius`, "2x this size" so proximity alerts work) and clears `collision_chain`.
2. **`CollisionRegion`** tree (`CollisionRegion.m`): a universe region plus subregions around large bodies, 32 km border (`COLLISION_REGION_BORDER_RADIUS 32000`), arrays initially 128 (`COLLISION_MAX_ENTITIES`).
3. **`findCollisions`** (`CollisionRegion.m:~250-380`): for each entity, walk its `collision_chain`; reject by sphere (`dist2 < PROXIMITY_WARN_DISTANCE2 * (r1+r2)^2`, factor 4); for ship pairs set **proximity alerts** when within 4 radii of either; stations get a `shipIsInDockingCorridor:` veto; real contacts are `dist2 < (r1+r2)^2` followed by `checkCloseCollisionWith:`.
4. **Narrowphase** `checkCloseCollisionWith:` (`ShipEntity.m:1944`): `canScoop` quick accept; track close contacts (`shipCloseContact`, traverse events); then `doOctreesCollide` (`ShipEntity.m:1878`): hull octree vs hull octree, then subentities. Planet and sun: always a hit inside the radius unless the ship is `BEHAVIOUR_LAND_ON_PLANET` (`PlanetEntity.m:606`). Planet/sun contact kills the ship (`getDestroyedBy:... kOODamageTypeHitAPlanet/HitASun`, `ShipEntity.m:11007`).
5. **Octrees** are built **at runtime** from the mesh (`OOMesh.m:625-650`, `OOMeshToOctreeConverter`), depth 5 (32x32x32) and deeper for large models (`kBaseOctreeDepth 5`, size threshold 900), cached by `OOCacheManager`. Hence "octrees from `.dat` at build time" is a faithful move of that step into `tools/oolite-ingest`.

### 6.2 Wegolite design

Scale reasoning: 256 entities is 32,640 pairs; a sphere test is a handful of flops, so even all-pairs is ~0.3 ms per tick. Oolite's regions exist for 2048 entities and 4-8 km-scale scenes. We still want a broadphase (the AI proximity pass needs neighbour lists, and the cost is one function) but not the region tree.

```ts
// src/sim/collision/world.ts
export interface Contact   { readonly a: EntityId; readonly b: EntityId; readonly depth?: number; readonly normal?: Vec3 }
export interface Proximity { readonly a: EntityId; readonly b: EntityId }   // within PROXIMITY_WARN_DISTANCE (4) radii
export function findContacts(entities: readonly Entity[], statics: readonly StaticSphere[],
                             hulls: HullTable, layout: SystemLayout): { contacts: Contact[]; proximity: Proximity[] };
```

**Broadphase:** sweep-and-prune on the **x axis** over dynamic collidables, using an insertion-sorted array kept between ticks (temporal coherence, the same trick as Oolite's bubble-sorted lists), interval `[x - 4r, x + 4r]`, ties broken by id. The static spheres (planet, sun) are tested directly per ship (two tests), not inserted: a 40 km planet interval would overlap everyone. The all-pairs brute force is kept as an **oracle**: a property test asserts the SAP result set equals brute force for random scenes. Swap-in of a grid/regions later is a one-function change.

**Narrowphase tiers**, selected per pair by `kind` and available hull data:

| Tier | Test | Used for | Ships in |
|------|------|----------|----------|
| 0 | sphere vs sphere (`r1 + r2`) | proximity, planet/sun, missiles, pods vs ship (with `canScoop`) | stage C |
| 1 | OBB vs OBB, 15-axis SAT (extracted from `dock/hull.ts`) | interim ship-vs-ship until octrees exist; wrecks; small fixed models | stage C |
| 2 | octree vs octree (port of `Octree.m:isHitByOctree`, lines 473-600) | ship-vs-ship, ship-vs-station (outside the dock corridor) | stage H |

**Reuse of the dock code:**

- `hull.ts` `minimumTranslation` is already a general 15-axis OBB SAT; it is specialised only by taking the box as the port-frame AABB. Extract `satObb(a: Obb, b: Obb): { axis, depth } | null` where `Obb = { centre, axes[3], half }` into `src/sim/collision/sat.ts`. `hullContact`/`obbsIntersect` keep their signatures and call it with the contact box expressed as an identity-axis `Obb`, so `tests/sim/dock-hull.test.ts` and `dock-no-trap.test.ts` are unchanged.
- **Keep the dock proxy for player-vs-main-station.** It is a deliberately conservative union box (hull + tris + faceplate) with a corridor veto and the tested latch (`dockArmed`), and Oolite itself vetoes octree collision inside the corridor (`CollisionRegion.m` calls `shipIsInDockingCorridor:` before `checkCloseCollisionWith:`). The world collision pass must therefore **skip the pair (player, main station)** and let `stepDocking` own it. For NPC-vs-station use tier 2, and for NPC docking use the generalised `dockSnapshot` + `classifyCorridor` (signature change in 2.3).
- The Cobra is the only ship with committed extents (`tests/golden/content/ship-bounds.json`); per-ship extents come from the same build step for every vendored model.

**Build-time octrees.** New `tools/oolite-ingest/convert/octree.ts` ports `OOMeshToOctreeConverter` (`findOctreeToDepth:`, `BuildSubOctree`) using only `+ - * /` and `sqrt` (the generator determinism zone forbids `sin/cos/pow`). Output per model: `{ radius, depth, nodes: Int32Array }` in Oolite's encoding (0 empty, -1 solid, positive = offset to the 8 children). Size estimate: a few thousand ints per ship (about 10-40 KB raw, about 5-15 KB gzipped). Ship them as separate lazy files beside the GLB (`public/models/<key>.hull.bin`), **not** in the JS bundle, and pass them to the world as `HullTable` data (the sim cannot import loaders). `assets:check` drift gate covers them like `dock-port.json`.

**Outputs beyond contacts** (do not drop these): `proximity` pairs set `nav.proximityId` and drive `BEHAVIOUR_AVOID_COLLISION` (`ShipEntity.m:5904`, `avoidCollision` saves and restores the previous behaviour); close-contact tracking drives `shipCloseContact` and traverse events used by docking AIs; `collisionExceptedFor:` (`ShipEntity.m:9646`, group members/launch immunity) must be an explicit predicate in the broadphase filter.

**Resolution** (`src/sim/collision/resolve.ts`, in W3, pair order `(a,b)` ascending): scoop, ship-ship momentum exchange and damage (`collideWithShip:`, `ShipEntity.m:11020`), planet/sun destruction, wormholes later. Player contacts write `impulse`/`speed` through `PlayerBody`.

**Planet/sun and temperature.** The player currently has only torus mass lock against bodies (`flight/torus.ts`). Add `src/sim/ship/heat.ts` (port of the temperature block in `ShipEntity.update:`, lines 2230-2272: `SUN_TEMPERATURE * (sunRadius^2 / dist^2)`, insulation, cooling, `takeHeatDamage` above `SHIP_MAX_CABIN_TEMP`) applied to the player in `stepFlight`'s tail and to every ship in W1. Planet/sun *contact* is a W3 result for all ships.

---

## 7. Question 4: AI runtime

### 7.1 What Oolite actually does (the port's source of truth)

- `PriorityAIController` (`oolite-priorityai.js`, 6,838 lines) holds closures and caches: `this.__cache`, `__ltcache`, private `parameters`, `activeHandlers`, `handlerCache`, and `Timer`s (two uses in the library). Role AIs (22 files, 2,427 lines) call `ai.setPriorities([...])` with entries `{ preconfiguration?, condition|notcondition?, configuration?, behaviour?, reconsider?, truebranch?, falsebranch? }` (`_reconsiderList`, lines 74-150). The library exposes about 84 condition, 44 configuration, 39 behaviour and 7 template functions, plus `responseComponent_*` handler sets.
- Reconsideration is **event/timer driven through `aiScriptWakeTime`**: `_resetReconsideration(delay)` sets `wake = now + delay` only if it makes it **earlier** (or none set) (lines 232-240); `reconsiderNow` uses `0.1 + (10 - accuracy)/10` seconds (0.1-1.6 s); the engine fires `aiAwoken` when `aiScriptWakeTime > 0 && clockTimeAdjusted > aiScriptWakeTime` at the end of `ShipEntity update:` (`ShipEntity.m:2479-2482`). Plist state-machine AIs use `AI.m` `thinkTimeInterval = AI_THINK_INTERVAL = 0.125 s` against `universal_time` (`Universe.m:6576-6580`).
- Each behaviour function installs a **handler set** (`responsesAddStandard`, `...Docking`, `...Escort`, `...Scooping`, `...Station`, lines 4886-4960) and calls native `perform*` methods. Handlers react to script events: `shipBeingAttacked`, `shipAttackedOther`, `shipAttackedWithMissile`, `shipTargetLost`, `shipFiredMissile`, `shipKilledOther`, `cascadeWeaponDetected`, `shipAchievedDesiredRange`, `shipLaunchedEscapePod`, and so on (the engine emits about 50 distinct `OOJSID("ship...")` events).
- Parameters hold entities and arrays (`oolite_selectedStation`, `oolite_waypoint`, `oolite_scanResults`, `oolite_rememberedTarget`, `oolite_distressSender`), flags (`oolite_flag_*`) and one timer (`oolite_internal_ecmtimer`). Randomness is `Math.random()` (38 call sites in the library).

### 7.2 Data model (plain, serialisable, no closures)

```ts
export type ParamValue = null | boolean | number | string | Vec3 | readonly (number | string)[];
// entity references are stored as EntityId numbers under keys ending in "Id" / "Ids"

export interface AiComponent {
  roleAi: string;                    // e.g. "oolite-traderAI"; selects the static definition
  variant: string;                   // e.g. "trader-smuggler" (what traderAI reads from ship.primaryRole)
  params: Record<string, ParamValue>;// oolite_flag_*, oolite_friendlyRoles, oolite_waypoint ...
  behaviour: BehaviourId | null;     // last chosen behaviour; determines the handler set (static lookup)
  wakeTick: number;                  // 0 = none; replaces AIScriptWakeTime; integer sim ticks
  nextThinkTick: number;             // plist AIs only (0.125 s = 15 ticks)
  ltCache: { nearestStationId: EntityId; expiresTick: number };  // the 60 s long-term cache, as data
  ecmFireTick: number;               // replaces oolite_internal_ecmtimer; 0 = none
  lastCommTick: number; lastHeardTick: number;
}
```

- The **tree is static code, never state.** A role AI is a pure function `(variant) => { params, priorities }` memoised in a module-level cache keyed `roleAi|variant`. The cache is a pure memo (never iterated, never serialised), so it cannot desync a restore. Conditions, configurations, behaviours and response handlers live in registries keyed by string id.

```ts
export interface PriorityEntry {
  label?: string;
  preconfiguration?: ConfigId;
  condition?: ConditionId; notCondition?: ConditionId;
  configuration?: ConfigId;
  behaviour?: BehaviourId; reconsider?: number;              // seconds -> ticks via round(s * 120)
  trueBranch?: readonly PriorityEntry[]; falseBranch?: readonly PriorityEntry[];
}
export interface AiContext { self: EntityId; now: number; view: WorldView; ctl: ShipControl;
                             ai: AiComponent; rng: () => number /* per-ship stream */ }
type Condition     = (c: AiContext) => boolean;
type Configuration = (c: AiContext) => void;
type Behaviour     = (c: AiContext) => void;            // sets nav fields via ctl, then installs the handler set id
type Handler       = (c: AiContext, ev: AiEvent) => void;
```

- The "short-term cache" (`__cache`) is a per-think memo created inside `reconsider` and discarded; it must be semantically transparent. The long-term cache is the only one that changes behaviour (it deliberately goes stale for 60 s), so it is stored as data (`ltCache`).
- **Timers become ticks on the sim clock.** `wake = nowTick + round(delay * 120)`, "never later" rule preserved. Using the world tick, not `FlightState.clockSeconds`, avoids the +600 s launch jump and the hyperspace clock advance expiring every wake at once (Oolite compares against `PLAYER clockTimeAdjusted`, which also jumps, but its universe is rebuilt at those moments).
- **Randomness:** each ship owns a `u32` mulberry32 state (`ShipComponent.rng`) seeded from `(worldSeed, spawn order)`; the populator and world-level choices use `world.rng`. Per-ship streams isolate golden fixtures from unrelated AI edits (a shared stream shifts every later draw whenever any handler adds a `random()` call).

### 7.3 Interfaces between AI and sim

```ts
export interface WorldView {                       // read-only; every id lookup can fail
  readonly tick: number; readonly playerId: EntityId;
  isValid(id: EntityId): boolean;
  ship(id: EntityId): ShipView | undefined;        // position, velocity, scanClass, roleKeys, energy%, bounty, targetId ...
  scan(self: EntityId, range: number, filter?: ScanFilter): readonly EntityId[]; // ascending distance, ties by id
  mainStation(): EntityId; mainPlanet(): EntityId; sun(): EntityId; nearestStation(self: EntityId): EntityId;
  countWithRole(role: string): number;
}
export interface ShipControl {                     // typed write surface; all effects immediate and id-addressed
  setTarget(id: EntityId, target: EntityId): void;        setDestination(id: EntityId, p: Vec3): void;
  setDesiredRange(id: EntityId, r: number): void;         setDesiredSpeed(id: EntityId, s: number): void;
  perform(id: EntityId, b: BehaviourId): void;            // performAttack/Flee/Intercept/... map to behaviour ids
  fireMissile(id: EntityId): boolean;  fireECM(id: EntityId): void;  launchPod(id: EntityId): void;
  dumpCargo(id: EntityId): void;       setBounty(id: EntityId, n: number, why: BountyReason): void;
  scheduleWake(id: EntityId, ticks: number): void;        // the "never later" rule lives here
  say(id: EntityId, commsKey: string, params?: Record<string, string>): void;  // emits a comms event
}
```

Handlers need immediate read-after-write (`this.ship.target = x; this.ship.performAttack(); ... this.ship.target`), so `ShipControl` applies writes immediately but **only through the typed interface**. A recording implementation of `ShipControl` plus a fake `WorldView` makes every condition/behaviour/handler a pure, individually testable function, which is the testability goal of the decision. The same two interfaces are the seam a later JS facade (OXP) would bind to.

### 7.4 Event dispatch and ordering

```ts
type AiEvent = { to: EntityId; name: AiEventName; a?: EntityId; b?: EntityId; n?: number };
```

- Sim code (collisions, combat, spawn, docking, behaviours) **appends** `AiEvent`s to `world.aiQueue`; nothing runs a handler inline.
- W2 drains FIFO: for each event, resolve `to` (skip if `!isValid`), look up `HANDLERS[handlerSetOf(ai.behaviour)][name]`, run it. Handlers that emit more events append to the same queue; the drain loops until empty with a pass cap of 8 (log and drop beyond it; Oolite has no cap but also no cycles in practice).
- Emission order is the ordering contract: it follows W0, W1 in id order, then W3 pair order. The queue is empty at every tick boundary, so it never needs saving or hashing.
- `aiAwoken` is dispatched by W2 after the drain, in id order, then the queue is drained again.
- Event names to port first (combat milestone): `shipAttacked(by)`, `shipAttackedOther`, `shipAttackedWithMissile`, `shipBeingAttackedUnsuccessfully`, `shipTargetLost`, `shipTargetDestroyed`, `shipKilledOther`, `shipFiredMissile`, `cascadeWeaponDetected`, `shipAchievedDesiredRange`, `shipCloseContact`, `shipLaunchedEscapePod`, `shipScoopedOther`, `shipWasScooped`, `shipDockedWithStation`, `shipLaunchedFromStation`, `shipEnteredPlanetaryVicinity`, `shipEnteredStationAegis`, `offenceCommittedNearby`, `distressMessageReceived`, `helpRequestReceived`.

### 7.5 Behaviours (`perform*` to per-tick steering)

In Oolite a role AI calls `ship.performAttack()`, `performFlee()`, `performIntercept()`, `performFlyToRangeFromDestination()`... which set `behaviour`, `desired_range`, `desired_speed`, `_destination`, and the **native** `processBehaviour:` (`ShipEntity.m:2485`, a switch over `BEHAVIOUR_*`, table in `Tables/OOBehaviour.tbl`, ~35 values; implementations `ShipEntity.m:3700-5136`, 2.5k lines) steers every frame.

Mapping:

- `BehaviourId` is a string-literal union mirroring `OOBehaviour.tbl` (`IDLE`, `TRACK_TARGET`, `INTERCEPT_TARGET`, `ATTACK_TARGET`, `FLEE_TARGET`, `AVOID_COLLISION`, `FLY_RANGE_FROM_DESTINATION`, `LAND_ON_PLANET`, `FORMATION_FORM_UP`, `TRACTORED`, ...).
- `src/sim/ship/steer.ts`: `const STEER: Record<BehaviourId, (s: Entity, w: World, dt: number) => void>`. Each function sets `flightPitch/Roll/Yaw` and `desiredSpeed` from `nav.targetId/destination/desiredRange` exactly as the Objective-C does, then `motion.ts` runs `applyThrust` and `applyAttitude`.
- Fixed dt: Oolite passes a variable `delta_t`; we pass `DT = 1/120`. Port with `dt` as a parameter and re-check any frame-rate-dependent shortcut (for example per-call corrections) as the dock work did ("apply once per fixed tick").
- `perform*` are `ShipControl.perform` calls that set `nav.behaviour` plus the associated fields and **reset `frustration`**.
- Higher-level state that Oolite keeps in `previousCondition` (saved by `avoidCollision`) becomes `nav.saved?: { behaviour, targetId, destination, desiredRange, desiredSpeed }` plain data.

### 7.6 Events to the presentation layer (extend `src/sim/events.ts`)

`laserFired {shooter, from, to, kind}`, `shipHit {target, source, amount, shield}`, `shipDestroyed {id, position, radius, specKey, killer}`, `missileLaunched`, `missileDetonated`, `ecmFired`, `cargoScooped`, `entityRemoved {id}`, `legalStatusChanged`, `playerDestroyed`, `podEjected`, `commsMessage {from, key, params}`, `shipSpawned`, `proximityWarning`, `energyLow`. Payloads are self-contained (positions and sizes) because the entity may be gone by the time a consumer runs. No UI copy.

### 7.7 Volume warning

The port is large: library 6.8k JS lines, role AIs 2.4k, native behaviours 2.5k, populator 2.7k. Split `oolite-priorityai.js` by concern into `src/sim/ai/components/{conditions,configurations,behaviours,responses,templates}.ts` and port role-by-role, each with a scenario test (see 10). Plist-based AIs are out of scope except `nullAI.plist` and `dumbAI.plist` (a trivial interpreter keyed by the ship's `ai_type`).

---

## 8. Question 5: save format v3

### 8.1 Principle

The save is a **leg anchor**, and the world is a deterministic function of `(system, worldSeed)`. So persisting the NPC world is unnecessary for the v2.0 anchors, and persisting it would make the blob 5x larger and invent mid-leg save semantics the game does not have.

### 8.2 World lifecycle

- **Docked:** no world exists. `docked` tears the world down (scene meshes disposed, ids discarded). The docked autosave is the existing shape. This matches Oolite, which removes everything except the player and the station on launch and re-populates (`Universe.m:1100-1135`, `populateNormalSpace`).
- **Launch:** `world = createWorld(layout, specs, worldSeed(epoch)); populate(world)` on the `launched` event, before the cinematic runs. NPCs exist during `launching`.
- **Arrival:** the same, after `applyWitchpointArrival`, before the arrival autosave.
- `worldSeed = mix32(marketSeed, epoch)` where `epoch` is a saved counter incremented at each populate. Reloading a docked anchor and launching reproduces that populate (consistent with the existing "stable market across reload" decision); an explicit owner choice is recorded in section 13.

### 8.3 Schema v3 (one bump, all new fields up front)

An additive field on a strict v2 object would make an older build call the save `corrupt` (Key Decision "Accept the forward-compatibility cost of extending v1 in place"). A version bump makes an older build classify it as `future-version`: inert, never rewritten (existing, tested behaviour). So bump once and declare every field the milestone needs.

```ts
export const SAVE_VERSION = 3 as const;
SaveV3 = v2 fields (mode: "docked" | "inFlight", flight pose, market, ...) plus:
  world:   { epoch: int >= 0 }                                // required
  legal:   { bounty: int 0..255; kills: int >= 0 }            // Oolite legal status score; clean 0, offender 1-50, fugitive > 50
  pylons:  string[] (max 4, each an equipment key)            // replaces `missiles: int`; v2 n -> n x "EQ_MISSILE"
  mounts:  { fore?: key, aft?: key, port?: key, starboard?: key }   // laser equipment keys per mount
  worldSnapshot?: WorldSnapshot                               // reserved; the writer never sets it in v2.0
```

- `migrateV2ToV3(v2)`: `world.epoch = 0`, `legal = {0,0}`, `pylons` from `missiles` (count of `EQ_MISSILE`), `mounts` from the equipment list (pulse laser fore if present). Chain `parseSave`: v1 -> v2 -> v3 as today. Add goldens `tests/golden/save/v3-from-v2-*.json` and keep the v1/v2 inputs.
- Validators stay shared (`validateSaveSemantics` used by reader and writer). New semantic checks: pylon/mount keys in the equipment allow-list; at most 4 pylons; `legal.bounty` bounded; if `worldSnapshot` is present then every `specKey` is in the ship allow-list, ids unique and bounded, references resolve or are nulled, `ai.roleAi` in the registry, `behaviour` in the enum, `params` keys in a per-role allow-list, entity count <= `MAX_ENTITIES`, all numbers finite and bounded (same discipline as the pose bounds).
- Player combat state, cabin temperature and shields are **not** persisted; anchors restore them to defaults. Death is never autosaved (the anchor before it is the reload point).

### 8.4 World snapshot codec (built now, written later)

Needed anyway for hashing and for the strongest determinism test: **snapshot-resume equality** (run N+M ticks continuously == run N ticks, `serialize`, `parse`, restore, run M ticks; hashes equal at every cadence). It proves the AI state really is plain data and catches Map-order and closure bugs. The codec also unlocks mid-leg saves later without a format change.

Size budget (compact JSON arrays, exact doubles, which round-trip exactly):

| Item | Per entity | 40 ships | 256 (cap) |
|------|-----------:|---------:|----------:|
| pose (3 + 4 doubles), speed, rates | ~330 chars | 13 KB | 85 KB |
| nav (behaviour, target, destination, range, speed) | ~110 | 4.4 KB | 28 KB |
| ai (role, params, ticks, cache) | ~190 | 7.6 KB | 49 KB |
| misc (energy, shields, bounty, rng, cargo) | ~80 | 3.2 KB | 20 KB |
| **Total** | **~700** | **~28 KB** | **~180 KB** |

Current v2 worst case is ~38.9 KB of the 65,536 limit (`save.ts` header comment). A snapshot of a normal 40-ship world fits on top; the 256 cap does not. When `worldSnapshot` is first written, raise `MAX_SAVE_CHARS` to 262,144 and update the worst-case derivation comment, `isEncodedSaveValid`, and the corrupt-backup bound. An older v3 build then sees an oversize blob as `unreadable` (inert), which is safe. Until then 65,536 stays (v3 anchors are about 40 KB worst case).

---

## 9. Question 6: render sync within the 50-draw-call budget

### 9.1 Baseline arithmetic

In flight: 10 calls measured (planet, sun and corona, starfield, station, buoys, dust; 13 when docked, per `docs/PERFORMANCE.md`); the budget leaves about 40 for everything new. A cloned NPC with Cobra-like geometry costs 2 calls. Twenty NPCs plus effects exceed the budget.

### 9.2 Design: `src/render/entities/`

- `EntityLayer` (child of `SystemScene`, disposed with it): one `ModelBatch` per **model key** in view. A batch owns, per primitive of the cached GLB, an `InstancedMesh` with capacity `MAX_INSTANCES_PER_MODEL` (32). Calls per frame = primitives x **distinct models in view**, not entities.
- `EntitySync.update(world, poses, cameraWorld, alpha)`: for each live entity with a model and within draw distance, compute the **camera-relative** matrix in JS float64 (reuse `placeRelative`/`cameraRelative`; instance matrices are uploaded float32 after subtraction, preserving the existing precision decision), write it into the batch, then `instanceCount = n` and `instanceMatrix.needsUpdate`. `frustumCulled = false`; cull in JS.
- **Draw distance = Oolite's rule:** `no_draw_distance = profileRadius^2 * NO_DRAW_DISTANCE_FACTOR^2 * 2` with factor 1024 (`ShipEntity.m:815`, `Entity.h:45`), i.e. draw while `dist <= profileRadius * 1024 * sqrt(2)`. Beyond it the ship is under a pixel; it exists only on the scanner. This is faithful and also the main cost control.
- **Hard batch cap:** at most `MAX_MODEL_BATCHES` (default 12) models drawn per frame, nearest first by distance of the nearest instance; the remainder falls back to `FarMarks`, one `Points` object for all remaining ships (1 call). With 12 batches x 2 primitives = 24, plus `FarMarks` 1, plus `EffectsSync` 3, plus the 10 base, the worst case is **38**, under 50 by construction, and a spec asserts it with a fixture that spawns every vendored model around the player.
- **Effects, batched:** laser beams as a single `LineSegments` (or instanced quads) with a ring buffer fed by `laserFired` events (lifetime ~0.1 s, render-only timers from `flightTime`); explosions/sparks as one `Points` object with per-vertex age; exhaust/flashers reuse the buoy flasher billboard approach in one instanced draw. Effects are derived from **events**, never from sim state, so they cost nothing in the hash and survive entity removal.
- **Materials and lifetime:** the AssetCache ownership rule is unchanged: batches reference the cached geometry/material, the layer owns only its `InstancedMesh` objects and instance buffers. Add `AssetCache.loadShipModel(key)` (memoised, path-named errors). Populate-time model keys are known before the first draw, so the app awaits `Promise.all(keys.map(loadShipModel))` before showing the world, like the destination scene build in `handleHyperspaceJumped`; later repopulate spawns draw from the already-loaded role set or skip drawing until the batch is ready (never block the sim).
- **Interpolation:** `PoseTracker` (app layer, render-only data, **not hashed**) records `previous := current` for every live id once per fixed step and holds the current pose. `EntitySync` interpolates with the same `alpha` as the player pose. Spawned-this-step entities start with `previous = current`; removed ids drop out on `entityRemoved`.
- **Scene objects that are not entities** (planet, sun, station mesh, buoys) keep their current code path and `applyStationRoll`; the station entity's orientation is `stationBaseQuat` rolled by `stationAngle` and the render continues to take that from `FlightState`/layout.
- **Gates:** extend `tests/e2e/budget.spec.ts` with "Lave in flight with traffic" (populated) and "worst-case batch" scenes; update `docs/PERFORMANCE.md` rows. Cold-start transfer will rise (NPC GLBs + WebP textures, hulls): lazy-load per role set and raise `FIRST_LOAD_BYTES_CEILING` deliberately with a recorded measurement, as the repo has done before.
- **Risk:** the NPC ships' emissive/specular materials were authored for the Cobra/Coriolis pipeline; instancing requires the shared material to be instancing-safe. Validate on the first vendored batch (this is the main MEDIUM-confidence item).

### 9.3 HUD

`buildHudModel` reads scanner contacts from `WorldView.scan(player, scannerRange)` instead of `scannerTargets(layout)`; blip colour/shape comes from `scanClass` (Oolite's scan classes), with the same projection code (`projectToScanner`). The 11-element HUD set and the probe's `hud.elements.length === 11` assertion are unchanged; new combat gauges (energy banks, shields, missiles, ECM, target box) draw inside existing HUD elements or are added as an explicit, test-pinned layout change.

---

## 10. Question 7: audio as a downstream event consumer

- `src/audio/` exposes `AudioDirector { unlock(): Promise<void>; onEvent(e: SimEvent): void; setListener(pos, quat): void; setVolumes(...); suspend(); resume(); dispose() }`. It is the `audio` subscriber on the `EventRouter` and **never** calls into `src/sim` or enqueues sim commands.
- **Autoplay-safe start:** construct the `AudioContext` lazily; call `unlock()` (which `resume()`s it) **synchronously inside the title-screen "New game"/"Continue" click handler**, before any `await` in `start()`, because the MDN autoplay guide ties audible output to user interaction and Firefox blocks Web Audio until sticky activation (`media.autoplay.block-webaudio`). Check `audioCtx.state` after `unlock()` and show a one-line "Click to enable sound" hint if still `suspended`. Pause (`P`/Escape/context loss) calls `suspend()`.
- **Event mapping is data, not sim vocabulary:** `src/audio/sound-map.ts` maps semantic events to `customsounds.plist` keys (`laserFired -> "[player-laser]"` or `"[npc-laser]"` by shooter, `shipHit -> "[player-hit]"`, `missileLaunched -> "[missile-launched]"`, `shipDestroyed -> "[target-destroyed]"`, ...). Key resolution (alias chains such as `"[@switch-on]" = "[@beep]"`, arrays of alternatives chosen with a presentation-side random) is done **at build time** by a new `tools/oolite-ingest/convert/sounds.ts` into `generated/sounds.json` (key -> file or list of files); `customsounds.plist` is already vendored, the `.ogg` files (`Resources/Sounds`, `Resources/Music`) are not and need `ASSETS.md` entries (CC BY-NC-SA 3.0).
- **Spatialisation:** one `PannerNode` per voice, listener fixed at the origin with orientation from the player pose, source position = event position minus the player position (camera-relative again); `distanceModel: "inverse"` with `refDistance` near the cockpit scale and a hard range cut at the scanner range. Non-positional UI sounds bypass the panner.
- **Decoding:** Ogg Vorbis through `decodeAudioData` in Chrome and Firefox (Safari is not claimed). Decode at unlock into a `Map<key, AudioBuffer>`; budget the memory and prefetch only the keys the current role set can emit. Music (`OoliteTheme.ogg`, `BlueDanube.ogg`) streams through a media element routed into the graph with its own gain; docked/flight/combat transitions are driven by mode events.
- **Settings:** master/effects/music volume and mute in `SettingsV1` (note the recorded settings-downgrade caveat; write the keys only when non-default, like `quality`).
- **Determinism:** audio randomness may use `Math.random` (it lives outside `src/sim`), and nothing the audio layer does is observable by the sim, so replays and hashes are unaffected. The probe gains `probe.audio = { state, queued, played }` so e2e can assert without listening.

---

## 11. Oolite structure mapped to Wegolite

| Oolite (file:line) | Role | Wegolite |
|---|---|---|
| `Universe.m` `entities` + `sortedEntities` + `entity_for_uid[]` (`:796`, `:5090`, `:4851`) | Entity registry; UID reuse via `next_universal_id`; cap `UNIVERSE_MAX_ENTITIES` 2048 | `EntityStore.live` (id-ascending) + lookup `Map`; monotonic ids; cap 256 |
| `entityForUniversalID:` returns nil for `STATUS_DEAD`/`DOCKED` (`:4860`); JS `isValid` (`OOJSEntity.m:228`) | Dead-reference semantics | `store.get(id) === undefined`; `WorldView.isValid` |
| `addEntity:` / `removeEntity:` / `entitiesDeadThisUpdate` (`:4990`, `:5128`) | Spawn/despawn, retained until end of update | `spawn` (immediate id) / `kill` (flag) / `commit()` (W5) |
| `update:` retained `my_entities` copy (`:6432`) | Stable iteration set | length snapshot in W1 |
| `ShipEntity update:` (`:2083`), `processBehaviour:` (`:2485`) | Per-ship tick | `updateShip`, `STEER[behaviour]`, `motion.ts` |
| `applyThrust:` / `applyAttitudeChanges:` (`:5808`, `:5899`) | NPC motion | `src/sim/ship/motion.ts` (not the player's `stepAttitude`) |
| x/y/z lists, `filterSortedLists` (`:6713`) | Broadphase | SAP on x, insertion-sorted, brute-force oracle |
| `CollisionRegion` (`:findCollisions`) | Regions, proximity alerts, corridor veto | one SAP pass; `proximity` output; corridor skip for (player, main station) |
| `checkCloseCollisionWith:` / `doOctreesCollide` (`ShipEntity.m:1944`, `:1878`) | Narrowphase | tiers 0/1/2; build-time octrees |
| `manageCollisions` / `collideWithShip:` (`:10991`, `:11020`) | Response | `collision/resolve.ts` in W3 |
| `PlanetEntity checkCloseCollisionWith:` (`:606`) | Planet/sun kill | static spheres; `heat.ts`; destroyed-by-body |
| `AI.m` `thinkTimeInterval` 0.125 s | plist AI cadence | `nextThinkTick` (15 ticks) |
| `aiScriptWakeTime` (`ShipEntity.m:2479`) | JS AI reconsider timer | `AiComponent.wakeTick` + "never later" rule |
| `doScriptEvent:` synchronous | Event delivery | FIFO `aiQueue`, drained in W2 |
| `PriorityAIController` closures/caches | AI framework | `AiComponent` + registries + static role literals |
| `oolite-populator.js` `systemWillPopulate/Repopulate`, `SYSTEM_REPOPULATION_INTERVAL 20 s` | Population | `src/sim/populator/*`, `world.nextRepopTick`, `world.rng` |
| `Universe` `removeAllEntitiesExceptPlayer` on launch (`:1119`) | Rebuild at launch | world teardown on `docked`, build on `launched` |
| `OOMesh octree` depth 5 adaptive (`OOMesh.m:625`) | Hull octree | `tools/.../octree.ts` at build time |
| `Entity no_draw_distance` (`ShipEntity.m:815`) | LoD cull | `EntitySync` distance rule |
| `customsounds.plist` + `OOSoundSource` | Sound keys | `generated/sounds.json` + `AudioDirector` |

---

## 12. Suggested build order with dependencies

Each stage ends in a demonstrable, test-gated state. Letters are stage ids, not a prescription for phase numbers.

| Stage | Content | Depends on | Gate / output |
|---|---|---|---|
| **A. Session split (no behaviour change)** | Section 4.2 steps 0-9 | none | `verify-full` green; session unit tests exist; `stepFlight` is called from exactly one place (`SimDriver`) |
| **B. World core** | `ids/entity/store/world/view/serialize` in `src/sim/world/`; `Rng` object state in `math.ts`; `hashWorld`; `PlayerBody`; `stepSim`; replay harness `runWorld` mirroring `sim/loop.ts`; world property tests (cadence hash equality, snapshot-resume equality, SAP vs brute force, id/commit invariants) | A (needs the seam) | World hashes equal at 30/60/144 Hz; no render change |
| **C. Content pipeline for NPCs** (parallel with B) | Vendor NPC `.dat`/textures/sounds with provenance; `ship-specs.ts` (derive `ShipSpec`: speed, thrust, pitch/roll, energy, lasers, missiles, cargo, bounty, scan class, roles, AI); `octree.ts`; `sounds.ts`; `AssetCache.loadShipModel`; extend `ShipDefSchema` | none (build time) | `assets:check` drift green; new goldens in `tests/golden/content/` |
| **D. Save v3** | Schema, `migrateV2ToV3`, new fields, goldens, validators, `world.epoch` plumbing | A (save-controller), B (epoch use) | v1/v2 fixtures migrate; v3 round-trip; future/corrupt rules unchanged |
| **E. Inert world on screen (vertical slice)** | `populator` v0 (hand-placed or simplest locations) spawning `nullAI` ships; `EntitySync` + `FarMarks`; HUD scanner from `WorldView`; planet/sun contact + `heat.ts`; tier-0/1 collisions | A, B, C | Space is not empty; budget spec with populated scene; player dies on planet/sun contact (event only, outcome in G) |
| **F. NPC motion and AI runtime** | `motion.ts`, `steer.ts` (behaviours in dependency order: idle, fly-to-destination, face, intercept, flee, attack variants, avoid-collision, land-on-planet, formation); AI interpreter + registries; AI event queue; role AIs: shuttle, trader (traffic first), then scavenger | B, E | Scenario tests per role (scripted world, fixed seed, expected event sequence/hash) |
| **G. Combat** | Energy/shields/damage, lasers (player + NPC), destruction, wreckage and cargo pods, scooping, missiles + missile AI + ECM, pirate and police AI, station AI (Viper launches), legal status/bounty and police response, player death -> escape pod -> insurance outcome (`FlightMode` additions), HUD gauges | F | Combat scenarios; death/pod flow; `legal` persisted |
| **H. Octree narrowphase** (parallel after C) | Runtime octree test, swap tier 1 -> 2 for ship-ship/station, hull data loading | C, E | Oracle tests vs OBB; no tunnelling at 5-step catch-up |
| **I. Audio** (parallel after A's `EventRouter` + C) | `AudioDirector`, sound map, unlock flow, settings, probe | A, C (events grow with G) | Autoplay-safe e2e (state transitions), no console errors |
| **J. Performance gate** | Budget scenes with traffic, batch-cap fixture, reference-desktop run (QUAL-01) | E-G | `docs/PERFORMANCE.md` updated; 60 fps evidence on the reference desktop |

Critical path: A -> B -> E -> F -> G. C and D can run beside B; H and I beside F and G. **Do not start F before E**: the first time ships are visible is when the render and budget assumptions get tested, and that should happen with inert ships.

Suggested research flags for later phases:

- **Octree port and hull data (H):** needs a small spike to verify the build-time octree reproduces Oolite's collision results on Cobra/Coriolis/Viper; precision of float32 vs float64.
- **Native behaviours (F):** each `behaviour_*` in `ShipEntity.m:3700-5136` needs a read-through; several use frame-rate-dependent constants and random jitter.
- **Populator (E/F):** location generators (`LANE_WP`, `LANE_PS`, `PLANET_ORBIT_*`, `deterministic` RANROT streams) are the least documented part.
- **Legal status and police response (G):** `bounty` bit-flag semantics (`bounty | 15`, `| 63`), scan-class interplay, and `offenceCommittedNearby` fan-out.
- **Instancing safety of NPC materials (E):** verify the Cobra material path under `InstancedMesh` early.
- **Audio spatialisation parameters (I):** Oolite's OpenAL distance model; not worth cloning exactly.

---

## 13. Open decisions for the owner

1. **World seed policy.** Recommended `mix32(marketSeed, epoch)` with `epoch` saved. Alternative: no epoch, seed from `(marketSeed, clockSeconds)`. Either keeps "reload cannot re-roll" consistent with the persisted market seed; the epoch variant lets repeated launches from the same save differ after the first.
2. **Mid-leg saves.** Not required by the anchored-save design. If the owner wants a save while paused in flight, that triggers `worldSnapshot` writing and the `MAX_SAVE_CHARS` raise.
3. **Player/NPC storage unification.** Deferred; revisit only if a milestone needs the player to pilot a different ship mid-session.
4. **Event latency divergences** (AI events queued within the tick, contacts resolved in the same tick, update order by id): record each in `FIDELITY.md` as deliberate divergences with the Oolite reference.
5. **Cold-start budget.** NPC models will grow the first load beyond the 9 MiB ceiling unless loaded per role set; the ceiling should be raised on measurement, not guessed.

---

## 14. Patterns to follow

### Pattern 1: ids at the boundary, objects inside

**What:** AI, nav, groups and events store `EntityId` numbers and resolve them through `WorldView` on use.
**When:** always; it is what makes dead references decidable and snapshots possible.

```ts
const target = c.view.ship(nav.targetId);
if (target === undefined) { c.ctl.setTarget(c.self, NO_ENTITY); c.ctl.perform(c.self, "IDLE"); return; }
```

### Pattern 2: spawn now, update next tick

```ts
const n = store.live.length;               // snapshot at phase start
for (let i = 0; i < n; i += 1) {
  const e = store.live[i];
  if (e === undefined || e.dead) continue;
  updateShip(e, world, DT);                // may spawn (append) or kill (flag); both are safe
}
const removed = store.commit();            // W5: compact, rebuild index, emit entityRemoved
```

### Pattern 3: timers are integer ticks

```ts
const ticks = (seconds: number): number => Math.max(1, Math.round(seconds * 120));
export function resetReconsideration(ai: AiComponent, now: number, seconds: number): void {
  const wake = now + ticks(seconds);
  if (ai.wakeTick === 0 || ai.wakeTick > wake) ai.wakeTick = wake;   // never later
}
```

### Pattern 4: serialisable PRNG

Keep `createSeededRandom` for existing call sites; add the object-state twin with the same algorithm and a test that both produce identical sequences.

```ts
export interface RngState { s: number }            // u32, plain data
export function rngNext(r: RngState): number {
  r.s = (r.s + 0x6d2b79f5) >>> 0;
  let t = r.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
}
```

### Pattern 5: event router with narrow subscribers

Subscribers receive a facade (`HudMessages.enqueue`, `Autosave.request`, `AudioDirector.onEvent`), never the context. Order is part of the contract and is pinned in a test.

## 15. Anti-patterns to avoid

| Anti-pattern | Why bad | Instead |
|---|---|---|
| Putting NPC state in closures or `Timer`-style callbacks (a literal transliteration of `PriorityAIController`) | Cannot be hashed or saved; the exact reason the TS port was chosen | `AiComponent` plain data, registries, tick timers |
| Iterating a `Map`/`Set` for a sim decision | Restore changes insertion order; silent divergence | Iterate `live` or a sorted array |
| Handlers run inline from inside another ship's update | Re-entrancy, order-dependent mutation | FIFO `aiQueue` drained between phases |
| `Math.random()`, `Date.now()`, `performance.now()` in `src/sim` | Already lint-banned; breaks replay | `RngState`, tick counters |
| One shared PRNG stream for all AI | Any new draw reshuffles every later outcome and churns goldens | Per-ship stream, separate world stream |
| Folding `FlightState` into NPC components now | Two motion models behind a flag; rewrites ~1,370 tests' subject | `PlayerBody` view over `FlightState` |
| Cloning one `THREE.Group` per NPC | 2+ calls per ship; blows the 50 budget | Per-model `InstancedMesh` batches with a hard cap |
| Inferring effects from sim state each frame | Cannot show an explosion after the entity is gone | Render effects from events carrying position and size |
| Persisting the NPC world in anchor saves | 5x blob size, invents mid-leg save semantics | Seed + epoch; codec exists for tests and later |
| Letting the sim import the ship catalogue or loaders | Violates the lint fence | App derives `ShipSpec`/`HullData` and injects them |

## 16. Scalability considerations

| Concern | 30 entities (typical system) | 100 | 256 (cap) |
|---|---|---|---|
| Collision | SAP trivial; ~0.01 ms/tick | ~0.05 ms | ~0.3 ms even brute force; SAP keeps it near linear |
| AI | ~60 reconsiders/s, each one scan; negligible | ~200/s | scans O(n): cache scan results per think; still < 1 ms/tick |
| Catch-up worst case (5 steps/frame) | 5 x per-tick cost | 5 x | keep per-tick under ~1.5 ms so the frame stays under 8 ms |
| Render | 12 batches x 2 prims + effects + base <= 38 calls | batch cap holds it | batch cap and `FarMarks` hold it |
| Save | anchor ~40 KB worst case | snapshot ~70 KB | snapshot ~180 KB (needs limit raise) |
| Hash/serialise | ~28 KB text | ~70 KB | ~180 KB; hash only in tests and debug |

## 17. Sources

- Wegolite tree at `master` `4bb1f53de`: `src/app/game-session.ts`, `src/sim/**`, `src/persistence/save.ts`, `src/render/{system-scene,sync,asset-cache}.ts`, `src/app/hud-model.ts`, `tests/app/redraw-gate.test.ts`, `tests/guards/economy-purity.test.ts`, `docs/PERFORMANCE.md`, `.planning/PROJECT.md` (HIGH).
- Oolite checkout `/home/opencode/git/oolite` (pin `7437f22`): `src/Core/Universe.m` (`:796`, `:1100-1135`, `:4841-5155`, `:6038`, `:6421-6677`, `:6713`), `CollisionRegion.m`, `Octree.m` (`:473-600`), `OOMesh.m` (`:585-650`), `Entities/ShipEntity.m` (`:815`, `:1878`, `:1944`, `:2083-2560`, `:3700-5136`, `:5808`, `:5899`, `:10991`, `:11020`, `:12766-12870`), `Entities/PlanetEntity.m:606`, `Scripting/OOJSEntity.m:228`, `Tables/OOBehaviour.tbl`, `AI.h:31`, `Universe.h:99,167`, `Resources/Scripts/oolite-priorityai.js`, `Resources/Scripts/oolite-populator.js`, `Resources/AIs/oolite-traderAI.js` (HIGH).
- MDN, "Autoplay guide for media and Web Audio APIs" (`developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay`): audible Web Audio output requires user interaction; Firefox `media.autoplay.block-webaudio` waits for sticky activation (MEDIUM-HIGH; `resume()` inside a gesture handler is the standard pattern but is not spelled out on that page).
