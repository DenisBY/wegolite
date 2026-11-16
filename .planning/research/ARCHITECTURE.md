# Architecture Research: v2.3 Combat and Death

**Domain:** NPC laser fire, ship destruction, collisions and player death, added to an existing deterministic fixed-step simulation (Wegolite, a browser reimplementation of Oolite)
**Researched:** 2026-11-16 (supersedes the v2.0 architecture file; only the v2.3 integration is covered)
**Confidence:** HIGH for the integration points (every claim below was read in the repository at `main`, `9419f1c`, or in the Oolite checkout `/home/opencode/git/oolite`); MEDIUM for Oolite fidelity details of cargo, internal damage and static hulls that need phase-level research (marked "research flag").

Scope: only how the new features plug into what exists. Out of scope here: missiles, ECM, mines, escape pod, bounties, scooping, planet/sun/heat, slot-scrape damage, audio, police/pirates, priority AI.

---

## 1. Decisions in one table

| # | Question | Recommendation | Confidence |
|---|----------|----------------|------------|
| 1 | Where does damage get applied? | One **damage ledger** resolved at one fixed point of `stepSim`, after `stepWorld`. Lasers and collisions both append `DamageRecord`s; one `applyDamage` pass applies them in a stable order; one `destroyShips` pass reads the result. Extends the existing "resolve in the same tick, ascending shooter id" rule (Key Decisions A6). | HIGH |
| 2 | Where do ships die? | Inside the combat resolution, not in `stepWorld`. Dead ships are committed by a **second `commitWorld`** at the end of `stepSim` (`snapshotWorld` refuses an uncommitted dead entity, so the tick boundary must be clean). | HIGH |
| 3 | AI events raised during resolution | `world.aiQueue` must be empty at every tick boundary. Resolution therefore ends with an **immediate AI drain** (new exported `drainAiEventsNow` in `world/step.ts`), never by leaving events for the next tick. | HIGH |
| 4 | NPC weapon state (temp, shot timer, cargo count) | New `Entity` fields, **one** snapshot bump (`WORLD_SNAPSHOT_VERSION` 3 to 4) and **one** regeneration of `tests/golden/world/inert-lave-epoch1.json`, taken in the first plan of the milestone. The `;steer:` record is FROZEN by Phase 14; this is the report that rule asks for. Do not smuggle the state into `ai.params`. | HIGH |
| 5 | Who decides an NPC fires | Firing moves **into the steering** (`fireMainWeapon:` is called from the attack behaviours in Oolite). `SteerContext` gains `fire(range)`; the Oolite gate (temperature cut-out, energy, recharge, range roll, on-target) lives in `src/sim/npc/`. `ShipControl.fire` stays as the AI-module path. | HIGH |
| 6 | Who makes an NPC hostile | Nothing does in shipped play today: the populator spawns `ai: null` ships, and priority AI is out of scope. Recommend a tiny **retaliation reflex** AI module attached on first hit (wake-on-hit), so a hit inert ship becomes a combatant without changing the populator golden. Needs an owner decision (section 11, Q1). | MEDIUM |
| 7 | Player death representation | `FlightMode` gains `"dead"`, set by one function, fail-closed for every existing `mode === ...` check. `stepSim` returns `[]` on a dead player. `snapshotForSave` currently encodes every non-`inFlight` mode as `docked`; it must refuse `dead` (hazard, section 7). | HIGH |
| 8 | Death flow in the app | One `deathFlow` subscriber plus one `GameOver` overlay plus a generalised in-session load (`loadSavedGame`) that does not need the F2 screen. Autosave, manual save, pause, focus loss, chart and context recovery all test the dead mode first. | HIGH |
| 9 | Stations and buoys as hit targets | Needs their hulls in the lazy hull artifact and a sim-side pose function (station orientation from `stationAngle`, buoy tumble from `flightTime`). The Coriolis has solid subentities; the current hit rule ports no subentity branch. Biggest content/fidelity risk of the milestone. | MEDIUM |
| 10 | Buoy damage | A buoy has 250 energy in Oolite and can be destroyed. Statics hold no state today. Add per-world `staticHealth` (buoys only; the station absorbs hits and is never destroyed). Pristine state is not hashed. | MEDIUM |
| 11 | Ship-ship collision | Port `Octree.m isHitByOctree` (octree against octree) behind a sphere prefilter; apply `collideWithShip`'s damage and response rule. Player response goes through the existing `FlightState.impulse` mechanism. | HIGH |
| 12 | Equipment/cargo damage from internal hits | The sim draws the outcome and emits events; the **app** commits the profile (the profile is not sim state). Persisting damaged equipment needs save v5 (see section 6). | MEDIUM |

---

## 2. Current tick order and the new one

### 2.1 Today (`src/sim/sim.ts` `stepSim`)

```
stepSim(player, world, layout, config, intent, commands, dt, options, combat)
  1. ships = createShipField(world)                    // read-only mass lock / jump blockage field
  2. stepFlight(...)                                   // flight events (docked, launched, hyperspaceJumped, ...)
  3. stepPlayerCombat(...)   [only with combat]        // dock/launch reset, views, fire key -> ShotRequest[], recharge, cooling
  4. stepWorld(...)          [world && launching|inFlight && no hyperspaceJumped]
        update (steerShip per AI entity) -> refreshEscorts -> drainAiEvents -> think -> drainAiEvents
        -> startPendingTrackingCurves -> runProximityPass -> sanitize -> commitWorld (entityRemoved)
  5. resolveShots(...)                                 // NPC fireQueue drained, hits applied (NPC energy floored at 0, "N2: nothing is destroyed"),
                                                       // player hit through routeDamage (energy floored at 0), then updateIdentTarget
```

Facts the new design depends on (all verified):

- `stepWorld` never touches `FlightState`; `resolveShots` receives `player: FlightState` and `combat` but writes only `combat` and the world.
- `world.fireQueue` is drained and cleared by `resolveShots`; `world.aiQueue` is drained inside `stepWorld` and is **empty at every tick boundary**; `snapshotWorld` refuses a non-empty queue and an uncommitted dead entity (`snapshot.ts:439`).
- `MAX_ENTITIES = 256` non-dead dynamic entities; `spawnEntity` refuses with `storeFull`. `ENTITY_KINDS` already lists `cargo` and `wreckage`; `SCAN_CLASSES` has `CLASS_CARGO`; the mass-lock exempt list already contains `CLASS_CARGO`.
- The router (`event-router.ts`) is table-driven: `ROUTED_EVENT_KINDS`, `EVENT_KIND_SUBSCRIBER`, `EVENT_SUBSCRIBER_ORDER` (pinned by `tests/app/session-order.test.ts`). An unrouted kind is ignored. `shipDestroyed`, `playerDestroyed`, `shipSpawned`, `entityRemoved` are reserved SimEvent kinds that nothing routes yet.
- Combat state (`PlayerCombatState`) is outside `FlightState`, outside the save, and appended to the world hash only while non-pristine (`isPristineCombat`).

### 2.2 New order

```
stepSim(...)
  0. if player.mode === "dead" -> return []            // NEW: the sim is frozen once the player is dead
  1-3. unchanged (ship field, stepFlight, stepPlayerCombat)
  4. stepWorld(...)                                    // MODIFIED inside npc/: steering may call ctx.fire(range) (queues world.fireQueue)
  5. resolveCombat(...)                                // NEW composition replacing the tail of resolveShots:
       a. resolveCollisions(...)    -> DamageRecord[]  // NEW (worldStepped && player inFlight): sphere prefilter + octree-octree + collideWithShip maths
       b. resolveShotHits(...)      -> DamageRecord[]  // MODIFIED: stops applying; returns records (laserFired events still emitted here)
       c. applyDamage(records)                         // NEW: ascending order; player via routeDamage/scrape; NPC energy; internal-damage rolls
       d. destroyShips(...)                            // NEW: energy <= 0 -> kill, debris, shipDestroyed, AI events
       e. checkPlayerDeath(...)                        // NEW: energy <= 0 -> mode "dead", playerDestroyed
       f. drainAiEventsNow(world)                      // NEW: reactions delivered now, queue empty at the boundary
       g. commitWorld(world) -> entityRemoved events   // NEW second commit
       h. updateIdentTarget(...)                       // MOVED to last (after the second commit, so a destroyed target is dropped this tick)
```

Jump-step rule (Key Decisions row (h)) is unchanged and extended: on the step that emits `hyperspaceJumped` the world is not stepped, so `resolveCollisions`, NPC shots, `destroyShips` and the AI drain all skip; only the player's own queued shot draws its beam.

Order within `applyDamage` (deterministic, no container iteration order): laser records in ascending shooter id (existing rule), then collision records in ascending `(idA, idB)` pair order, where the player is id 100. No record sees another record's effect (Pitfall 7, Key Decisions A6).

---

## 3. Components: new versus modified

### 3.1 New

| Component (path) | Responsibility | Talks to |
|---|---|---|
| `src/sim/combat/ledger.ts` | `DamageRecord { target, source, amount, kind: "laser" \| "scrape", sourcePosition }`, ordering, `applyDamage`. Single place that lowers energy. | `shields.ts` (`routeDamage`), `world.ts`, `destroy.ts` |
| `src/sim/combat/destroy.ts` | `destroyShips`: kill, `shipDestroyed`, debris spawn (wreckage, alloys, cargo pods), the entity-cap policy, AI events to killer and neighbours. Draws only from the dying ship's own `combat` stream. | `world.spawnEntity`, `store.kill`, `postAiEvent` |
| `src/sim/combat/debris.ts` | The Oolite cargo and wreckage rules as pure functions: `cargoChance` (70, minus 30 per success for an NPC), jetsam limit 15, pod speed `0.1 * ((r % 200) - 100)` per axis plus the parent's velocity, `n_alloys = sqrt(sqrt(mass / 6000))`, wreckage count, lifetimes. | `destroy.ts` |
| `src/sim/combat/collision.ts` | `resolveCollisions`: pair enumeration (ascending id), sphere prefilter (`dist^2 < (r1 + r2)^2`), octree test, then `collideWithShip` (below). Writes velocity responses and returns `DamageRecord`s. | `octree.ts`, `hit.ts` hull table, `FlightState.impulse` |
| `src/sim/combat/octree.ts` (modified) + `isHitByOctree` | Port of `Octree.m:473-570` (octree against octree). Float64, bounded depth, never throws, as `isHitByLine`. | content hulls |
| `src/sim/combat/internal-damage.ts` | `PLAYER_INTERNAL_DAMAGE_FACTOR` 31 loop and `takeInternalDamage` (cargo pod, then damageable equipment, then cosmetic). Pure: inputs are the facts in `StepOptions.combat` and one uint stream; output is events. | `applyDamage` |
| `src/sim/combat/death.ts` | `checkPlayerDeath(combat, player, events)`: the one death path. Sets `player.mode = "dead"`, clears countdown and torus, emits `playerDestroyed`. Called from the one place after `applyDamage`. | `flight/state.ts` |
| `src/sim/npc/fire.ts` | The NPC fire gate (a port of `fireWeapon:direction:range:`, `ShipEntity.m:9912-10007`): temp cut-out 0.85 of max, `energy > weapon_energy_use`, `shot_time >= recharge`, `range <= randf() * weaponRange * (accuracy + 7.5)`, `range <= weaponRange`, `onTarget`. Also the per-tick cooling and shot timer (`ShipEntity.m:2214-2221`). | `SteerContext`, `Entity.weapon` |
| `src/sim/ai/pilots/reflex.ts` (if Q1 = yes) | A registered AI key `"reflex"`: on `shipAttacked` target the attacker and `perform ATTACK_TARGET` (or `FLEE_TARGET` when the hull has no forward weapon); on `shipTargetDestroyed` or `shipTargetLost` go idle. Plain-data state in its `AiComponent`. | `ShipControl`, `WorldView` |
| `src/sim/world/static-hulls.ts` | Pure poses for the statics as hit/collision targets: station orientation `stationBaseQuat * axisAngle(z, player.stationAngle)` (same formula as `dock/port-frame.ts`), buoy tumble as a function of `flightTime`. `staticHealth` accessors. | `layout.ts`, `hit.ts`, `collision.ts`, `ident.ts` |
| `src/app/session/death-flow.ts` | The `deathFlow` subscriber (`playerDestroyed`), the `GameOver` overlay wiring, the dead-mode guards. | `save-controller`, `chart-controller`, `settings-controller`, `input` |
| `src/app/session/damage-flow.ts` | Subscriber for `equipmentDamaged` and `cargoDestroyed`: commits the profile through a new in-flight `commitDamage` (no autosave, no `renderStation`), prints Oolite's "[x] damaged." and "[x] destroyed." lines. | `ctx.core.profile`, `messages` |
| `src/ui/game-over.ts` + DOM node in `index.html` | Game over overlay: Oolite's text, a primary "Load last save" button, a fallback "New game" (page reload) when no loadable save exists. Focus trap like `pause.ts`. | `death-flow.ts` |
| `src/render/bodies/debris.ts` | Instanced layer for `cargo` and `wreckage` contacts (id-free), with a cosmetic tumble derived from contact index and flight time. | `system-scene.ts`, `npc-models.ts` |
| `src/render/bodies/explosions.ts` | Pooled additive billboards/sparks fed by `shipDestroyed` (position, radius only). Render-only, bounded pool like `laser-shots.ts`. | `event-router.ts` dock-feedback-style subscriber |
| `src/content/convert/` rows + `generated/` records | Debris models (cargo pod `oolite_barrel.dat`, `wreck1.dat`, alloy), hulls for the Coriolis and the buoy in `ships-hulls.json`, `damageProbability` typed on the equipment record, NPC `likely_cargo`/energy-use/shot-temperature fields. | content build, `ASSETS.md`, `NOTICE` |

### 3.2 Modified

| File | Change | Risk |
|---|---|---|
| `src/sim/sim.ts` | Dead early-out; the new step 5 composition; second commit; event order. | Event order is pinned by tests (`tests/sim/...`, `tests/app/session-order.test.ts`). |
| `src/sim/combat/step.ts` | `resolveShotHits` returns records instead of applying; removes the "floor at 0, nothing destroyed" branch for NPC targets; `drainFireQueue` unchanged. | Re-pins `tests/sim/combat/step.test.ts`. |
| `src/sim/combat/shields.ts` | `routeDamage` stays the shield-then-energy kernel (also used for scrape: Oolite's `takeScrapeDamage` has the same facing shield rule, `PlayerEntity.m:5726-5742`). Energy still floors at 0; **death is `energy <= 0`**. | The Phase 13 row "Floor the player's energy at 0 until a death phase exists" is superseded; the floor stays, the check is added. |
| `src/sim/combat/state.ts` | No new field needed for death (mode carries it). `isPristineCombat` unchanged. | none |
| `src/sim/combat/hit.ts`, `ident.ts` | Candidate lists gain the static hull targets (station, two buoys); stage A/B rule unchanged. Station and buoys are never "dead" while their health allows. | Supersedes Key Decisions row "Statics are neither laser nor ident targets (OQ4, F10)" and two FIDELITY.md rows. |
| `src/sim/flight/state.ts` | `FlightMode` += `"dead"`. `serializeFlight` already prints `mode`; pinned goldens never contain it. | 48 mode references in `src/app`, `src/ui`, `src/input`; fail-closed review needed (section 7). |
| `src/sim/flight/step.ts` | Nothing for a dead player (the early-out in `stepSim` keeps it from running). The `impulse` mechanism receives collision responses. | low |
| `src/sim/world/entity.ts`, `world.ts`, `serialize.ts`, `sanitize.ts`, `snapshot.ts`, `limits.ts` | `Entity.weapon { tempTicks.. }` and `Entity.cargo`; `World.staticHealth`; hash segment `;wpn:` after `;steer:` (always present, as the owner chose for `;steer:`); hash segment for non-pristine static health; snapshot v4; new bounds in `limits.ts`. | Third deliberate golden regeneration; bundle all fields in one plan. |
| `src/sim/world/step.ts` | Export `drainAiEventsNow`; a kind-aware update phase: `cargo` and `wreckage` fly ballistically (position += forward * speed * dt) and lose lifetime from `energy`; they never think. | `stepWorld` today skips every entity with `ai === null` (inert), so the debris branch is a new, separate loop. |
| `src/sim/world/contacts.ts` | Keep `npcContacts` ships-only (scanner); add `debrisContacts` (kind, specKey, pose, radius, id-free). | scanner must not show wreckage unless Oolite does (research flag). |
| `src/sim/npc/dispatch.ts` + attack behaviours | `SteerContext.fire`; the hot-weapon branches Phase 14 cut (`weapon_temp > COMBAT_AI_WEAPON_TEMP_USABLE`, lines 4288, 4456, 4577, 4713, 4830) become live. | Changes attacker trajectories: oracle fixtures and the frozen 20-seed acceptance run are affected (section 5.3). |
| `src/sim/ai/types.ts`, `registry.ts` | Add `"reflex"` to `AI_KEYS` and the registry (if Q1 = yes). | `AI_KEYS` is a closed vocabulary in the snapshot parser. |
| `src/sim/events.ts` | New non-reserved kinds: `equipmentDamaged { key }`, `cargoDestroyed`, `shipCollided { speed }`. `playerDestroyed` gains `cause`; its current payload is only `position`. | Payload change to a reserved kind needs a Key Decisions row (row (g) says so). |
| `src/app/session/step-options.ts`, `sim-driver.ts` | `StepOptions.combat` gains the facts the sim cannot read from the profile: `damageable` (equipment keys with `damageProbability > 0`), `cargoPods`, `maxCargo`, `damaged` set. Built per step like `mounts`. | `equipmentSet()` already excludes keys the profile marks damaged if built that way (section 6). |
| `src/app/session/event-router.ts` | Route `playerDestroyed` (new subscriber `deathFlow`), `equipmentDamaged`, `cargoDestroyed` (`damageFlow`), `shipDestroyed` and `shipCollided` (dock-feedback style effect hand-off), `shipHit` for the "hit" feedback. | `EVENT_SUBSCRIBER_ORDER` is pinned: add `deathFlow` last; update `session-order.test.ts`. |
| `src/app/session/save-controller.ts` | `autosave()` and `manualSave()` refuse in dead mode, before every other check; `loadFromSave` becomes `loadSavedGame({ source })` (section 7). | `loadFromSave` has hard preconditions on the F2 screen being open. |
| `src/app/session/settings-controller.ts`, `frame-loop.ts`, `render-driver.ts`, `probe-publisher.ts` | `pause()`, `focusLost`, the pause toggle and `enterContextLoss` ignore the dead mode (`enterContextLoss` still sets `contextLost`); the frame loop skips `advanceFrame`; `shouldDraw` treats dead as an idle frame after settle; the probe publishes `probe.death`. | The frame-order test pins phase order. |
| `src/input/actions.ts`, `keyboard.ts` | New `InputContext` `"gameOver"` with `gameOverLoad` and `gameOverNew` actions (rebindable, listed in the controls panel). | Settings migration rule: new actions go after the existing ones in `ACTION_IDS`. |
| `src/render/system-scene.ts`, `bodies/buoy.ts` | Scene owns the debris and explosion layers; the buoy tumble formula moves to `src/sim/world/static-hulls.ts` and the render imports it (sim never imports render). A destroyed buoy is hidden. | buoy tumble is a function of the flight clock today, so moving it is a pure refactor. |
| `src/app/hud-model.ts` | No new element (`HUD_ELEMENTS` stays eleven). Destroyed-buoy scanner contacts drop. | pinned layout |
| `src/persistence/save.ts`, `autosave.ts`, profile | Only if damage persists: save v5, `damagedEquipment`; `snapshotForSave` refuses `dead`. | Section 6. |

---

## 4. The damage ledger in detail

### 4.1 Why a ledger

Today two code paths lower energy: `routeDamage` for the player and a direct `entity.energy = max(0, ...)` for NPCs, both inside `resolveShotHits`. Collisions add a third source and death/destruction must read the result of all of them. Applying inside each source breaks the "a hit never sees another hit of the same tick" property and makes the kill order depend on code order. The ledger keeps that property.

```ts
// src/sim/combat/ledger.ts (sketch)
export interface DamageRecord {
  readonly target: EntityId;          // PLAYER_ID or a dynamic ship
  readonly source: EntityId;          // shooter or the other ship
  readonly amount: number;            // finite, > 0 (never queued otherwise: T-13-15)
  readonly kind: "laser" | "scrape";
  readonly sourcePosition: Vec3;      // decides the player's shield facing
}

export function applyDamage(
  records: readonly DamageRecord[],      // already in the deterministic order
  world: World | undefined,
  player: FlightState,
  combat: PlayerCombatState | undefined,
  internal: InternalDamageFacts | undefined,
  events: SimEvent[],
): { killed: KillRecord[] } { /* shields -> energy -> internal damage; NPC: energy -= amount */ }
```

### 4.2 Player damage

- Laser: unchanged kernel (`routeDamage`, `PlayerEntity.m:5646-5662`). Scrape: same shield facing test (`:5726-5742`); the remainder is `energy -= amount`.
- After the shield, `while (amount > 0) { if ((rand & 31) < amount) takeInternalDamage; amount -= 32 }` (`PlayerEntity.m:5691-5697` for lasers when the player survives, `:5746-5752` for scrape). Randomness: the **world stream** (`world.rng`, already hashed) because the player owns no per-entity stream; draws happen in ledger order, so they are deterministic. Do not add a closure-held generator (FOUND-12 forbids it; a source-scan test enforces it).
- `takeInternalDamage` needs `n_considered = (maxCargo + mass/10000) * tradeInFactor/100`; the Cobra's compiled mass is in `ships-client.json`; `ship_trade_in_factor` is not modelled (use 100; record the divergence). The sim returns the outcome as events; the app owns the profile.

### 4.3 NPC damage and destruction

- NPC: `energy -= amount` (Oolite `ShipEntity.m:11431`); no shields. `energy <= 0` queues a `KillRecord { id, killer }`.
- The player's `routeDamage` heats the cabin; NPC energy damage also heats an NPC in Oolite (`:11435`) but nothing in Wegolite reads NPC temperature, so it is not ported.
- Scrape on an NPC: `takeScrapeDamage` (`:11641-11676`), same `energy <= 0` rule, plus the fragment chance `frag_chance = other.mass * 10 / mass` (research flag; it only affects `being_mined` debris of asteroids, which are out of scope).

### 4.4 `destroyShips` (Oolite `becomeExplosion`, `ShipEntity.m:7891-8143`, and `releaseCargoPodsDebris`, `:7814-7879`)

Per killed ship, ascending id, all randomness from that ship's own `rng.combat` (written back like `steerEntity` does):

1. `store.kill(id)` (it leaves `live` at the second commit).
2. Emit `shipDestroyed { id, position, radius, specKey, killer }` (already reserved), then AI events: `shipTargetDestroyed` to the killer's AI and `shipKilledOther` if it is an NPC (`AI_EVENT_NAMES` already has both).
3. Debris, **only if the entity count allows**: Oolite adds debris only below 95 % of `UNIVERSE_MAX_ENTITIES` and wreckage only below 50 %. Wegolite's `MAX_ENTITIES` is 256, so the same ratios give 243 and 128. A `spawnEntity` refusal (`storeFull`) is skipped, as `populateInertWorld` does. That is the "entity cap" of the milestone target: it needs no new cap constant, only the two thresholds and a test that the world never exceeds `MAX_ENTITIES`.
4. Cargo pods: `n_jetsam` is the ship's cargo count; each pod survives with probability `cargo_chance` (starts 70; minus 30 per success for an NPC), at most 15; position random in the bounding box plus `(r % 7) - 3`; velocity `parent + 0.1 * ((r % 200) - 100)` per axis; random orientation. A pod is an `Entity { kind: "cargo", scanClass: "CLASS_CARGO", specKey: "cargopod" }`.
5. Wreckage: with `n_alloys = sqrt(sqrt(mass / 6000))`, `n_wreckage = floor(rand * (n_alloys + 2))` capped at 3; each wreck is `Entity { kind: "wreckage" }` whose `energy` is its lifetime in seconds (Oolite sets `energy = lifetime` and applies 1000 heat damage per second; Wegolite drains the energy field by `dt` per tick and removes it at 0). Then `floor(rand * n_alloys)` alloy plates as `CLASS_CARGO` pods.
6. Debris motion without a velocity vector: an `Entity` holds `position`, `orientation`, `speed` (scalar along its nose). Make the debris orientation its **heading** and `speed` its speed; tumble is cosmetic and render-only. This avoids adding a velocity vector to the record (the one record bump already carries `weapon` and `cargo`).

`cargo` on an NPC: the populator never fills cargo today, so "Oolite's cargo rule" needs a source for the count. Recommended: compile `likely_cargo` (and `max_cargo`) into `ships-npc.json` and draw the count at spawn from the ship's `combat` stream into `Entity.cargo`. Research flag: the exact Oolite derivation per role (`setUpCargo`, `cargo_carried`) before planning.

### 4.5 Collisions (`ShipEntity.m:11020-11149`, `CollisionRegion.m:226-374`)

Oolite: for each pair within `(r1 + r2)`, `checkCloseCollisionWith` runs `doOctreesCollide` (`ShipEntity.m:1878-1942`); then `collideWithShip`:

```
loc  = unit line of centres (other - self)
v2b  = dot(vSelf - vOther, loc)            // closing speed along the line of centres
if v2b < 0 and v2b < -1: return            // already separating faster than 1 m/s: no damage
dam1 = m2 * v2b^2 / 50_000_000             // damage to self
dam2 = m1 * v2b^2 / 50_000_000             // damage to other
if dam1 > 0.05: self.takeScrapeDamage(dam1)
if dam2 > 0.05: other.takeScrapeDamage(dam2)   // not the station: it cannot be destroyed
```

Integration points:

- **Positions at collision time** are the post-`stepWorld` positions, so the pass sits after step 4 and before `applyDamage`. Pairs: every ascending-id pair of live ships, the player (only while `inFlight`: Oolite ignores collisions while launching, `ShipEntity.m:11646`), and the two buoys. Complexity at 256 entities is 32k sphere tests worst case; a one-axis sweep (sort by x) is the Oolite approach and also keeps the order deterministic. Skip kinds `wreckage` (`isWreckage` cannot collide, `ShipEntity.m:1865`) and keep pods out of this milestone's collision (scooping is out of scope; pods only drift).
- **Player response**: the flight model has no velocity vector, but `FlightState.impulse` (world m/s, decays, integrated by the flight tick; Key Decisions D-07) is exactly the "transient contact velocity". Apply `vel1a` there and nudge `position` by `t * loc * v1a` as Oolite does. This keeps `stepWorld` read-only on `FlightState` because the write happens in the collision module, in `stepSim`'s own composition layer, the same layer that already passes `player` to `resolveShots`.
- **NPC response**: `speed` is a scalar along the nose; project the response onto the nose and displace position. Record this as a divergence (Phase 14 already cut Newtonian velocity).
- **Not in scope**: ship against the station body (the dock bounce stays), against planet and sun (todo `2026-11-10-add-planet-and-sun-collision`).

### 4.6 Station and buoy hull targets

- The 10 hull octrees (Cobra and nine NPC) are the only entries of `ships-hulls.json`. The build already computes octrees for the Coriolis and the buoy to derive their mass (Key Decisions rows "Coriolis blockage mass" and "Navigation buoy mass"), so the data exists at build time; it has to be emitted.
- The Coriolis mass is the hull plus three solid subentities (faceplate, tris, dock; `ShipEntity.m:2034-2041`). Oolite's hit rule has a subentity branch (`Universe.m:5560-5568`, `:5623-5636`) that `hit.ts` explicitly does not port ("none of the ten hulls has a solid subentity"). The Coriolis and the buoy (hull plus the core subentity) do. Research flag: decide between porting the branch and baking the subentity cells into one octree. This is the largest unknown of the milestone; schedule it before anything that depends on it.
- The station rotates: its orientation is `stationBaseQuat * axisAngle(0,0,1, player.stationAngle)` (`dock/port-frame.ts:32-37`, `flight/step.ts:368`). `hit.ts` receives `HitTarget { position, orientation }`, so the new `static-hulls.ts` supplies those two for the station from `player.stationAngle` and for the buoys from the flight clock.
- The buoy's simulation radius stays 10 m (Key Decisions row "Draw Oolite's navigation buoy") while the model is ~100 m. A laser or collision test must use the octree and the hull radius, not the 10 m body radius. The row's "simulation radius of both bodies stays 10 m (mass lock, scanner)" remains true for those two uses.
- The station absorbs hits: the beam stops at its hull and `shipHit` is emitted, with no destruction and no retaliation (police and station AI are out of scope). Buoys take damage against `staticHealth` (250 energy, recharge 2/s in `shipdata.plist:1018-1021`); a destroyed buoy is removed from the scene, scanner and hit candidates for the life of that world. The next `begin` or `resume` builds a fresh world, so it is restored at every launch, arrival and Load, which fits the leg-anchor save model.

---

## 5. NPC fire in detail

### 5.1 What exists

- `ShipControl.fire(id)` queues the actor in `world.fireQueue` (one per actor per tick); `resolveShots` drains it, builds the ray from the hull's `forward_weapon_position`, and applies the **same** hit and damage rule as the player's shot. Phase 13 deliberately gave NPC shots "no heat, no timer, no energy cost" (Key Decisions row "NPC fire shares only the hit and damage rule"; CBT-15 was the follow-up).
- No steering behaviour calls anything that fires. Phase 14 cut it in its scope row ("no weapon fire from steering (weapon temperature 0 and `missedShots` 0)") and in the header comments of `attack-close.ts`, `attack-evade.ts`, `evasive.ts`, `flee.ts`.
- In shipped play every populated ship is `ai: null`. `AI_REGISTRY` holds only the test pilot and the flight-script pilot; both are test-only. So **nothing in the shipped game ever enters ATTACK_TARGET**.

### 5.2 Design

1. `SteerContext` gains `fire(rangeToTarget: number): boolean`. `steerShip` stays free of world writes: the context closure (built in `steerEntity` in `world/step.ts`, next to `emit`) pushes the entity id to `world.fireQueue` through the same bounded, deduplicated path `createShipControl.fire` uses.
2. The gate (`npc/fire.ts`) runs in the steering before queueing, on the entity's own `weapon` record and `ctx.draw()` (its own `combat` stream): temperature cut-out, energy, shot timer, range roll `range > randf() * weaponRange * (accuracy + 7.5)`, `range > weaponRange`, `onTarget`. On success: energy `-= weapon_energy_use`, temperature `+= weapon_shot_temperature`, shot timer reset. Cooling and the timer advance once per tick.
3. The attack behaviours call it at the lines Oolite does (4035, 4454, 4575, 4607, 4711, 4821, 4891 of `ShipEntity.m`) and their `weapon_temp > USABLE` branches become reachable.
4. `resolveShots` keeps draining `fireQueue`; the queued shot is therefore already gated, so `drainFireQueue` stays "no gate here" and the shared hit rule is untouched. `StepOptions.combat.npcWeapons` must also carry `energyUse`, `shotTemperature`, `rechargeTicks` (compiled from `weapon_info`/`OOWeaponType`), or the gate cannot be a pure function of its inputs.
5. Hostility (Q1 in section 11): a `reflex` module posted `shipAttacked` events. `applyDamage` posts `shipAttacked { to: target, a: source }` and `shipAttackedOther { to: source, a: target }` for NPC targets; the AI drain at the end of the tick delivers them. For an `ai: null` target the resolution attaches the reflex AI (wake-on-hit) before posting. The populator golden is unchanged because the ship becomes an AI ship only after a hit.

### 5.3 Consequences for tests and gates

- The 139 oracle fixtures and the frozen 20-seed acceptance run were recorded with weapon temperature 0 and no fire. Enabling the hot-weapon branches changes attacker trajectories. New oracle fixtures (written without reading `src/sim/npc`, per the independence rule) are needed for the hot-weapon branches; the acceptance run must be rerun by hand on the remote machine after any change under `src/sim/npc/**` (AGENTS.md). The frozen detectors may not be edited without the owner trailer.
- `tests/acceptance/**` calls `stepSim` (verified), so the fire queue drains there; with no `npcWeapons` in that harness nothing is queued and no shot lands.

---

## 6. Determinism, hash, snapshot and save

### 6.1 Streams (no new generator)

| Draw | Stream | Why |
|---|---|---|
| NPC fire roll, accuracy, tumble | the ship's own `rng.combat` (existing) | `steerEntity` already copies and writes it back |
| Debris counts, positions, velocities, cargo chance | the dying ship's own `rng.combat` | independent of other ships (D-04); debris forks its own streams at spawn |
| Player internal damage, any draw without an entity | `world.rng` | already hashed; the player has no entity stream |
| Cargo count at spawn | the populator's `world.rng` order | change only with the golden regeneration |

The Key Decisions row on `forkSeed` warns that per-entity streams are shifted copies of one Weyl cycle: do not treat them as independent for statistics. Debris draws are few per death, so the bound there is small; do not use `rng.combat` for a high-rate draw.

### 6.2 Hash

- One new entity segment, always present, appended after `;steer:`: `;wpn:` carrying the forward weapon temperature, shot timer ticks and the cargo count. Same device and same owner-chosen policy as `;steer:` (uniform, injective text; no pristine-only variant). A test strips it and re-hashes to the pre-milestone text, as Phase 14 did.
- `staticHealth` is appended only when non-pristine (the combat-line device), so a run that never damages a buoy keeps its hash.
- The player's `mode: "dead"` is already printed by `serializeFlight`; no pinned flight golden contains it.
- Debris is part of the entity store: it hashes like any entity and counts for `MAX_ENTITIES`, `liveEntityCount` and the probe's `entities`.

### 6.3 Snapshot

`WORLD_SNAPSHOT_VERSION` 3 to 4 once, with `weapon`, `cargo`, the debris kinds and the static health. The parser must keep "non-empty `aiQueue` and `fireQueue` refused" and "uncommitted dead refused"; both now hold at the tick boundary because of the second commit and the AI drain. Bounds go in `limits.ts` (single definition site); changing one later is another bump.

### 6.4 Save

- The combat state is not saved; death is not saved; NPCs are never saved. A death returns the player to the last anchor save, whose world is regenerated deterministically from `mix32(marketSeed, epoch)`. A repeat death at the same place is therefore reproducible (Oolite behaves the same way on reload).
- **Equipment and cargo damage** is a profile change, and the profile is saved at the next dock, launch or arrival anchor. A damaged `EQ_DOCK_COMP` must not silently come back at the next dock. Options, in order of cost:
  1. Persist it: `damagedEquipment: string[]` (save v5, optional additive field, ordered migration v4 to v5, validated against the equipment allow-list; `*_DAMAGED` pseudo-keys are rejected as unknown by `allow.equipment`, so do not store them in `equipment`). `equipmentSet()` (the single source of `StepOptions.equipment`) excludes damaged keys, which makes every existing consumer treat them as absent with no further change. This is the recommendation.
  2. Not persisted, repaired on dock: cheapest, but it diverges from Oolite, where damaged equipment stays until repaired at 50 % price (`PlayerEntity.m:9025-9038`, `:9113-9118`). A repair row in F3 is a station-UI plan of its own; keep it out of this milestone unless the owner wants it (Q4).
- Cargo destruction removes cargo from `profile.cargo` (commodity quantities, not individual pods; mapping is a research flag).
- `snapshotForSave` currently maps every non-`inFlight` mode to `docked` (`autosave.ts:114`). A dead state would be written as a docked save. The dead guard in `autosave()` is not enough on its own: make `snapshotForSave` return `undefined` for `dead`, and add a unit test that pins it.

---

## 7. App flow: the single death path

### 7.1 The path

```
sim: checkPlayerDeath  --> mode = "dead", hyperspace attempt cleared, "playerDestroyed" event (cause)
router.dispatch(playerDestroyed) --> deathFlow
   1. close the chart (chartController.closeChart) -- the sim runs behind the chart in flight
   2. clear messages, input.clearAll(), input.setContext("gameOver")
   3. launchSequence.reset(); hide the HUD canvas? (keep: energy gauge shows empty) -- decision: keep, add overlay
   4. gameOver.show({ canLoad }) where canLoad comes from ctx.save.saveStatus === "valid"
   5. redrawGate.request(); probe.death published
Player action:
   Load  --> loadSavedGame({ source: "gameOver" })   // same pipeline as boot Continue and warm Load
   New   --> window.location.reload()                // the title flow: the title offers Continue/New game from the boot read
```

### 7.2 Guards that must test the dead mode first

| Place | Guard |
|---|---|
| `save-controller.autosave`, `manualSave` | record the attempt (`saveAttempts += 1`), set `saveSkipReason = "dead"` and return, ahead of every other check, as the `contextLost` guard does. |
| `snapshotForSave` | refuse dead (section 6.4). |
| `settings-controller.pause`, `focusLost`, `frame-loop` pause toggle | no pause overlay over the game over screen; focus loss only clears input. |
| `enterContextLoss` | still sets `contextLost` and blocks Load until `exitContextLoss`; it must not open the pause overlay over the game over screen. |
| `frame-loop` chart branch | dead state never steps behind the chart; `handleChartActions` ignores `chart` while dead. |
| `station-controller`, `openSaveScreen` | already require `mode === "docked"`; dead fails closed. |
| `sim-driver.advanceTicks` | returns the tick unchanged when dead (like paused) so a manual-clock spec cannot step a dead world. |
| `redraw-gate` | `shouldDraw`: dead is idle after the settle draws. |

### 7.3 The load pipeline

`loadFromSave` has hard preconditions (`saveScreenOpen`, a F2 notice surface) and closes the F2 screen on success. Refactor to `loadSavedGame(options: { source: "saveScreen" | "gameOver" })` sharing the read, `parseSave`, `restoreFromSave`, `enterSystemById`, the synchronous install block and the world re-anchor (`restoreWorldAnchor`), and differing only in its guard, its failure surface (F2 notice versus the overlay's own line) and its tail (hide F2 versus hide the overlay and set the input context). The install block already resets the combat state to pristine, clears the message queue, the dock feedback and the combat message gates, and the chart. Add: hide the game over overlay, drop any live explosion effect, and clear `ctx.core.lastRefusal`.

Edge cases to test:

- A save write still in flight when the player dies: `store.read()` must observe the queued write (the writer serialises by revision; confirm the read waits or document the race).
- `saveStatus` is `future`, `unreadable`, `unavailable` or `corrupt`, or the session is `testTainted` (`?test=1` mutation): no loadable save is guaranteed. The overlay then offers only New game. The tainted case still has a boot-time blob; Load reads it, which is fine.
- Death in `launching`: Oolite lets lasers hurt a launching player but ignores scrape. Allow laser death while launching only if the owner wants it (Q6); the simplest rule is "death requires `inFlight`", and then `launching` clamps energy at 1.
- Death on the tick that docks: `docked` comes from `stepFlight` and `dockReset` refills energy before the combat step, so no death; assert it.
- Death on the tick of a `hyperspaceJumped`: the world is not stepped, nothing damages the player; the arrival autosave runs from the earlier event as usual.

### 7.4 Title flow

There is no route back to the title in a live session: `start()` is single-shot (`starting` guard) and `title.dispose()` runs only at teardown. The boot `bootSave` and `title.setContinueVisible` are computed once in `main.ts`. The fallback that respects the title flow without building a second session lifecycle is a page reload: it re-reads the store and shows Continue exactly when a loadable save exists. This is also what Oolite does after game over (it re-initialises to the start screen). If the owner wants a true in-page return to the title, that is a separate, larger change to `main.ts` and `start-session.ts` (Q5).

---

## 8. Render, HUD and probe

- **Debris**: a second instanced layer fed by `debrisContacts` (id-free, rebuilt each rendered frame like `npcContacts`). Models arrive through the existing `NpcModelLoader` path (loaded only after the first in-flight frame, so the cold-start ceiling of 9,437,184 bytes in DATA-13 is untouched), so their records belong in `ships-npc.json` or a sibling debris record list. Three small models (cargo pod, wreck, alloy) are vendored: `ASSETS.md`, `NOTICE` and `third_party/oolite/CHECKSUMS.sha256` change, and AGENTS.md's rule against fetching Oolite files over the network applies; the vendor script is the sanctioned route and a new network fetch needs a new decision (Key Decisions row "Network vendoring exception"). Reading from the local checkout, with a checksum entry, is the cheaper path; confirm with the owner.
- **Explosions**: render-only, driven by `shipDestroyed` (position and radius, no id), a fixed pool, `flightTime` for age. No simulation feedback.
- **Laser beams**: `laserFired.to` already ends at the hit distance, so a beam that now stops at a station or a buoy needs no render change.
- **Scanner**: ships only (unchanged). Destroyed ships vanish with the next frame's contacts. A destroyed buoy drops from `scannerTargets`.
- **HUD**: no new element. The energy gauge reads 0 at death; messages "[x] damaged." and "[x] destroyed." come from `damageFlow` through `MessageQueue.enqueuePriority` (descriptions.plist `@-damaged`, `@-destroyed`); the existing one-second gate table (`CombatMessageKind`) gains `equipmentDamaged` and `cargoDestroyed`.
- **Probe**: `probe.death { dead, cause }`; `probe.sim.entities` already counts debris through `liveEntityCount`; a `probe.combat.destroyedShips` counter helps browser specs. No entity id leaves the sim (the guard `tests/guards/entity-id-scope.test.ts` stays unchanged).

---

## 9. Patterns to follow

### Pattern 1: Sim decides, app commits (equipment and cargo damage)

**What:** the sim emits `equipmentDamaged { key }` or `cargoDestroyed`, the app subscriber commits a new immutable `PlayerProfile` (`commitDamage`), with no autosave and no station render.
**Why:** `PlayerProfile` is app-owned and immutable; the sim never imports it (`StepOptions` carries only read-only facts). It mirrors how a purchase and the dock clock delta reach the profile today.
**Detail:** the facts the sim needs (which equipment keys are damageable and with what probability, how many cargo pods) are built per step in `buildStepOptions` from the profile, like `mounts`.

### Pattern 2: Fixed resolution point with a clean tick boundary

**What:** everything the tick's combat produces (events, spawns, kills, queued AI events) is resolved and committed before `stepSim` returns.
**Why:** the snapshot, the hash and `advanceTicks` all assume no pending queue and no dead entity at a boundary. Verified in `snapshot.ts` and `world.ts`.

### Pattern 3: Pristine-skipped hash segments

**What:** state that exists only after a fight (buoy health, a dead mode) appears in the hash only when non-default, so a run that never fights hashes exactly as before.
**Why:** keeps `tests/golden/flight-hash-pins.json` untouched, as `isPristineCombat` does.

### Pattern 4: Ballistic debris without new record fields

Use `speed` and `orientation` as heading and speed; the render adds a cosmetic tumble from contact index and `flightTime`. No velocity vector in `Entity`.

### Pattern 5: Fail-closed modes

A new mode must make every existing `mode === "inFlight"` gate false and every `mode === "docked"` gate false, so unreviewed code does nothing. Review the 48 mode references once and pin them with a test that sets `dead` and asserts no station action, no fire, no hyperspace, no autosave.

---

## 10. Anti-patterns to avoid

1. **Applying damage inside each source.** Gives order-dependent kills and breaks the "no hit sees another hit of its tick" property. Use the ledger.
2. **Leaving AI events for the next tick.** `world.aiQueue` must be empty at the boundary; the snapshot refuses it. Drain at the end of resolution.
3. **Checking death anywhere but one place.** Oolite checks `energy <= 0` in three `take*Damage` methods. Wegolite has one function, called once per tick after the ledger.
4. **Writing the save from a dead state.** `snapshotForSave` would encode `dead` as `docked`.
5. **Storing weapon state in `ai.params`.** It would work without a record bump, but a faulted AI (nullAI) loses it, and it hides state from the typed sanitiser and parser.
6. **Adding a velocity vector to `Entity` for debris.** Costs a snapshot field for a cosmetic effect.
7. **Mutating `FlightState` from `stepWorld`.** The collision module in `stepSim`'s composition layer does it; the world step keeps its read-only contract.
8. **A new random generator or a clock.** Every draw uses an existing seeded stream; the FOUND-12 source scan fails otherwise.
9. **Holding an entity id outside the world** (explosion layer, game over summary, killer name). Pass spec keys and positions only.
10. **Making buoys or the station dynamic entities.** They are `world.statics` referencing the layout; keep that, add health beside them.

---

## 11. Open decisions the roadmap must settle (owner questions, in order of impact)

| Q | Question | Recommendation |
|---|---|---|
| Q1 | What makes an NPC hostile in shipped play? (priority AI is out of scope.) | Wake-on-hit `reflex` AI: a hit ship retaliates, flees if unarmed. Without it, NPC fire exists only for test pilots and scripts, and "NPC fire at the player" is unreachable in the shipped game. |
| Q2 | Persist equipment damage (save v5) or lose it at the next dock? | Persist; exclude damaged keys from `equipmentSet()`. |
| Q3 | Can internal damage hit lasers (`laserMounts`)? In Oolite weapons are ordinary equipment with default `damage_probability` 1. | Not this milestone; record the divergence. A damaged laser needs the repair UI. |
| Q4 | Is a repair row in F3 in scope? | No; out of this milestone's target list. Damaged stays damaged until a later repair phase. This is a harsh default; confirm. |
| Q5 | Game over's "title flow": page reload, or a real in-page return to the title? | Reload (re-reads the save, shows Continue when valid). |
| Q6 | May the player die while `launching`? | Require `inFlight`; clamp energy at 1 while launching. |
| Q7 | Does the station take scrape/laser damage state (it cannot be destroyed in Oolite but can be damaged)? | Absorb only. No station state. |
| Q8 | Static hull data: bake subentities into one octree or port the subentity branch? | Research flag; decide in the first plan of the statics phase. |

Decisions this milestone supersedes and must record in `PROJECT.md` Key Decisions and `FIDELITY.md`: "Statics are neither laser nor ident targets (OQ4, F10)"; "Floor the player's energy at 0 until a death phase exists" (the floor stays, the check is added); "NPC fire shares only the hit and damage rule with the player's laser" (gate added in steering); Phase 14's "no weapon fire from steering"; `RESERVED_EVENT_KINDS` payload for `playerDestroyed`; Phase 14's "snapshot record is FROZEN" (third regeneration, owner-chosen, once).

---

## 12. Suggested build order (dependencies first)

Phase numbers continue at 15. Each item lists what it needs and what it unblocks.

1. **Phase 15 plan 1: the one record bump (foundation, no behaviour).** `Entity.weapon`, `Entity.cargo`, `World.staticHealth`, hash segments, snapshot v4, bounds in `limits.ts`, the regenerated `inert-lave-epoch1.json` (strip-and-rehash proof), compiled NPC fields (`likely_cargo`, `weapon_energy`, shot temperature, recharge), `damageProbability` on the equipment record. Needs nothing. Unblocks everything, and it is the only plan allowed to move the golden.
2. **Phase 15: damage ledger and destruction.** `ledger.ts`, `destroy.ts`, `debris.ts`, second commit, `drainAiEventsNow`, new events, the kind-aware world update for debris, the entity-cap thresholds, `debrisContacts`, the debris and explosion render layers, debris content. Needs 1. Unblocks NPC kills, player death and collisions. Test with the existing test shooter (`spawnTestShooter`) before any NPC AI fires on its own.
3. **Phase 16: NPC fire.** `npc/fire.ts`, `SteerContext.fire`, the attack behaviours' fire calls and hot-weapon branches, the reflex AI, `shipAttacked` posting, new oracle fixtures, the by-hand acceptance rerun and its recorded result. Needs 1 and 2 (a shot must be able to kill). Research flag: Oolite fire gates and `onTarget` per behaviour, plus how the hot-weapon branches change trajectories.
4. **Phase 17: statics as targets, and collisions.** Hull artifact additions (Coriolis, buoy), `static-hulls.ts` poses, the subentity decision (Q8), laser and ident candidates, buoy health, `isHitByOctree` port, `collision.ts`, the player `impulse` response, scrape damage through the ledger, `shipCollided`. Needs 2 (ledger). Research flag: Coriolis subentity rule, octree-octree oracle fixtures (write them independently of the port, as in Phase 14).
5. **Phase 18: player death, game over, internal damage.** `death.ts`, `FlightMode "dead"`, the dead-mode review and its test, `deathFlow`, `GameOver` overlay, `loadSavedGame`, input context, probe, `internal-damage.ts`, `damageFlow`, save v5 if Q2 = persist. Needs 2 and 4 (any cause: lasers, collisions). The save work is last because it is the only format change outside the sim and must reuse the ordered migration chain.

Why this order: the hash/snapshot change is the single most expensive thing to repeat (three goldens already moved in this repository), so it goes first and once. Destruction before NPC fire because fire is only meaningful when it can kill, and the harness for it already exists. Collisions with the statics work because both need the same hull table (the open todo says the same: "decide with the damage work so the hull table and the hit rules are built once"). Player death last because it consumes every damage source and carries the only persistence change.

Gate choice (AGENTS.md): plans touching only `src/sim/` need `test`, `lint`, `typecheck`; the death flow, input, render layers and `index.html` need `verify`; the save v5 and the dead-mode guards touch persistence and input, so run `verify-full` once at the end of Phase 18 (persistence trigger), as Phase 11 did. The 20-seed acceptance run is by hand after Phase 16 and after any later change under `src/sim/npc/**` or `src/sim/world/**`.

---

## 13. Scaling considerations (entities and cost)

| Concern | Today | v2.3 |
|---|---|---|
| Entity count | 12 inert ships (traffic on) | up to 256 including debris; wreckage self-expires from `energy`; debris thresholds at 50 % and 95 % of the cap |
| Collision cost | none (proximity pass only) | one sweep over live ships plus 3 statics; sphere test first, octree test only inside `(r1 + r2)`; worst case below a few thousand sphere tests per tick |
| Draw calls | 13 NPC primitives + shots | + 3 debris model primitives + 1 explosion pool; the 50-call budget (`budget.spec.ts`) needs one new measurement |
| First load | ceiling 9,437,184 bytes, headroom ~580 KB | debris models load after the first in-flight frame (DATA-13); the hull artifact grows with two large octrees (gate 200,000 bytes compact; `MAX_HULL_NODES` 16,384 may need a measured raise or a separate lazy file) |
| Snapshot size | bounded by `MAX_ENTITIES` | same bound; static health adds two numbers |

---

## 14. Integration points summary

### Internal boundaries

| Boundary | Communication | Notes |
|---|---|---|
| steering to world | `SteerContext.fire`, `emit` | steering writes only its own entity and the fire queue |
| world step to combat resolution | `world.fireQueue`, `aiQueue`, store | ledger sees the world as stepped |
| combat resolution to app | `SimEvent`s only | payloads id-free except the same-tick ids already allowed |
| sim to profile | events + per-step facts in `StepOptions.combat` | the profile is never imported by the sim |
| app to save | `snapshotForSave` refuses dead; autosave guard order | `contextLost`, then `dead`, then status, then taint |
| app to render | contacts, `shipDestroyed` effect hand-off | no entity id, no store handle |
| content build to sim | generated JSON only | no parsing at runtime; `assets:check` drift gate |

### External

None. The client stays static; no backend or database is touched (AGENTS.md constraint 3).

---

## Sources

Repository (read at `main`, `9419f1c`): `src/sim/sim.ts`, `src/sim/world/{world,step,store,entity,ids,limits,view,control,control-impl,contacts,ship-field,serialize,snapshot,layout}.ts`, `src/sim/combat/{step,hit,aim,octree,shields,state,constants,ident}.ts`, `src/sim/npc/{dispatch,state,stats}.ts` and `behaviours/*`, `src/sim/ai/{types,registry}.ts` and `pilots/*`, `src/sim/events.ts`, `src/sim/flight/{state,step}.ts`, `src/app/session/{sim-driver,event-router,world-lifecycle,step-options,save-controller,settings-controller,start-session,frame-loop,render-driver,context,traffic}.ts`, `src/app/game-session.ts`, `src/main.ts`, `src/persistence/autosave.ts`, `src/render/bodies/{npc-ships,laser-shots}.ts`, `.planning/PROJECT.md` (Key Decisions), `.planning/todos/pending/2026-11-15-lasers-and-ident-hit-stations-and-buoys.md`, `.planning/milestones/v2.0-REQUIREMENTS.md` (CBT-08, CBT-15, DEATH-01), `.planning/research/PITFALLS.md` (Pitfall 18, previous research, still valid for the pause and autosave interaction).

Oolite checkout `/home/opencode/git/oolite/src/Core`:
- `Entities/ShipEntity.m`: `takeEnergyDamage` 11418-11574, `takeScrapeDamage` 11641-11676, `collideWithShip` 11020-11149, `manageCollisions` 10991-11018, `doOctreesCollide` 1878-1942, `checkCloseCollisionWith` 1944-2000, `becomeExplosion` 7891-8143, `releaseCargoPodsDebris` 7814-7879, `fireWeapon:direction:range:` 9912-10007, `fireLaserShotInDirection` 10360-10466, cooling and shot timer 2214-2221.
- `Entities/PlayerEntity.m`: `takeEnergyDamage` 5599-5699, `takeScrapeDamage` 5701-5753, `takeInternalDamage` 6097-6184, `getDestroyedBy` 6187-6223, `showGameOver` 3630-3644, equipment repair 8270, 9025-9118.
- `CollisionRegion.m` `findCollisions` 226-374; `Universe.m` `addWreckageFrom` 5497-5526, `cargoPodFromTemplate` 3863-3878, `UNIVERSE_MAX_ENTITIES` `OOTypes.h:168`; `Resources/Config/shipdata.plist` buoy 1011-1028 (`max_energy` 250, recharge 2), cargo pod 625-639, wreckage 4236-4246; `Resources/Config/equipment.plist` `damage_probability` rows (lines 23, 32, 239, 252, 286, 383, 486) and `OOEquipmentType.m:247`.

Confidence notes: the tick order, record shapes, event table, router, save and load pipeline are HIGH (read directly). The cargo count source per role, the exact `onTarget` and hot-weapon behaviour per attack mode, the Coriolis subentity hit rule and the mapping of Oolite's per-pod cargo to Wegolite's commodity quantities are MEDIUM and are flagged as phase-level research above.

---
*Architecture research for: v2.3 Combat and Death (Wegolite)*
*Researched: 2026-11-16*
