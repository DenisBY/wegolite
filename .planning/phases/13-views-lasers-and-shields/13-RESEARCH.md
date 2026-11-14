# Phase 13: Views, Lasers and Shields - Research

**Researched:** 2026-11-14
**Domain:** deterministic TypeScript combat core (laser fire, shield/energy/heat model, octree ray hits), HUD wiring, input/binding migration, save v3 to v4, Oolite fidelity port
**Confidence:** HIGH for Oolite constants and algorithms (read from the checkout; the files cited are byte-identical between the pinned commit `7437f22` and the checkout HEAD except `PlayerEntityControls.m`, `descriptions.plist` and `HeadUpDisplay.m`, whose pinned line numbers are used below), MEDIUM for integration design (a recommendation, not a locked decision)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Octree hit data (CBT-07)**
- **D-01:** Octree data for the Cobra and the nine NPC hulls ships as a separate lazily loaded file, not in the first-load set. The 9,437,184-byte ceiling stays untouched (D11); traffic-on cold start is 8,839,791 bytes. The planner must define the "data not loaded yet" state: a shot fired before the load completes cannot hit, and a Vitest scenario pins that.
- **D-02:** The ray test is two-stage, as in Oolite: a cheap bounding-sphere check first, then a descent into the octree only on a sphere hit. A shot inside the sphere but outside the hull misses (success criterion 3).

**Ident lock (INPUT-01)**
- **D-03:** With no missiles in this milestone, R (ident) shows a frame around the locked target in the 3D view plus one message-line entry with the target's name and class. The message goes through the existing message-line throttle (pitfall 26). The frame is the only new HUD drawing; the planner decides whether it fits inside the pinned eleven-element set (as the hyperspace target did, PROJECT.md Key Decisions) or needs a recorded revision (pitfall 21).
- **D-04:** Lock lifecycle follows Oolite: pressing R again clears the lock, and the target leaving range clears it. The researcher confirms the exact rule against `/home/opencode/git/oolite/src/Core/Entities/PlayerEntity*.m`.

**Cabin temperature (CBT-06)**
- **D-05:** The only heat input in this phase is energy damage (`PlayerEntity.m:5673`). Sun and atmosphere heating stay out (DEATH-03, DEATH-05, unscheduled).
- **D-06:** The `CT` gauge is already drawn as a static placeholder; this phase wires it to live data and it stays always visible, as CBT-06 states. It cools at Oolite's rate; the researcher reads the cooling constant from source into the constants ledger (pitfall 14). Docking resets it (DOCK-10).

**HUD gauges are wired, not added**
- **D-07:** `src/render/hud/draw.ts` (`drawLeftGauges`, `drawRightGauges`, lines ~489-550) already draws placeholders for `FWD`/`AFT` shields, `CT`, `LT`, the energy banks `E1`..`E4` and the `MISS` pylons, with fixed fill values (shields 1, CT 0.22, LT 0). The work is feeding these from `HudModel` (`model.bars`), not new layout. The eleven-element contract (`HUD_ELEMENTS`, `tests/ui/hud-model.test.ts`, `tests/e2e/hud.spec.ts`) and every `HUD_LAYOUT` rectangle stay untouched. `MISS` stays a placeholder (no missiles in this milestone).

### Claude's Discretion
- IN-01 of the WR-01 todo (torus message wording when mass lock stops a running drive): not discussed. Default: fold it into the FOUND-17 plan if the change is one line, otherwise leave it as a todo.
- The free key for target-station (R moves to ident): not discussed. Pick Oolite's own binding if one exists, else the nearest free key, and list it in the controls panel.
- Port and starboard view cameras, HUD layout beyond the ident frame, and the combat constants ledger values: research and plan-phase decide, sourcing from the Oolite checkout.

### Deferred Ideas (OUT OF SCOPE)
- Sun and atmosphere cabin heating: DEATH-03, DEATH-05 (unscheduled)
- Autonomous NPC fire: CBT-15 (unscheduled)
- Reviewed todos not folded: terminal color palette switcher, cargo cost basis, planet/sun/buoy collision, buoys blocking hyperspace, Oolite-in-Docker measurement (keyword matches only, outside Phase 13 scope).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FOUND-17 | A refused `begin()` at arrival does not leave the origin world installed (WR-01) | `world-lifecycle.ts` `begin` refuses silently; fix at the lifecycle plus a controller-level test (section "FOUND-17 and IN-01") |
| INPUT-01 | Escape (double press) ejects, P pauses, R is ident; target-station moves to a free key; rebindable; controls panel lists them; migration lands first | Oolite key table and ident/untarget/eject rules (Constants ledger K-rows); persisted-settings migration trap (Pitfall 1); `KeyQ` recommended for target-station |
| CBT-04 | Fore/aft/port/starboard views and firing the laser on the current facing | View keys and `switchToThisView` weapon-facing rule; view and weapon offsets already compiled in `ships-client.json`; camera derivation (Architecture Pattern 5) |
| CBT-05 | Buy pulse/beam/military/mining lasers per facing at F3; Oolite damage, range, recharge, heat; cut-out when overheated | Laser constants ledger (L-rows) already compiled in `equipment.json` `conditions.weapon_info`; purchase and trade-in rule; save v4 `laserMounts` |
| CBT-06 | Shields and energy banks absorb and recharge at Oolite's rates; HUD shows shields, energy, laser temp, cabin temp | Recharge algorithm (S-rows), damage routing, cabin cooling formula, gauge semantics (H-rows) |
| CBT-07 | Lasers hit ships by Oolite octree hull; same hit and damage rule for any ship firing through `ShipControl` | Two-stage ray port (O-rows), measured octree sizes, delivery design, shared `fire` command |
| DOCK-10 | Docking restores shields and energy, resets laser and cabin temperature | `docked()` and launch reset behaviour (D-rows) |
</phase_requirements>

## Summary

Phase 13 is mostly a port of five small, well-bounded Oolite algorithms into the pure simulation, plus the plumbing that connects them to the existing input, HUD, save and F3 layers. The Oolite source is unambiguous for every number this phase needs, and the laser numbers are already compiled into `src/content/generated/equipment.json` (`conditions.weapon_info`). No new package is needed. The riskiest parts are not the arithmetic but (a) the persisted-settings binding trap, (b) the exact octree ray port (Oolite returns the distance to the centre of the first solid leaf it finds in a fixed traversal order, not the nearest surface), (c) where player combat state lives without disturbing the pinned flight hashes, and (d) the entity-record change that moves the inert-world golden and the world snapshot format.

Three owner decisions in CONTEXT.md are sharpened by the source and need the planner's attention (details in "Findings that sharpen locked decisions"): D-04's wording ("R again clears") is not what Oolite does (R again clears and immediately re-acquires; **U** clears); D-03's message text in Oolite carries the ship's name only, and Oolite draws a target reticle only with an optional equipment item that Wegolite does not sell; and D-01 is cheap to satisfy because all ten hull octrees measure about 12 KB compact (88 KB as nested JSON), against 597,393 bytes of first-load headroom.

**Primary recommendation:** Build a small pure `src/sim/combat/` module family (constants ledger, weapon gating and heat, shield and energy step, damage function, octree ray test, two-stage hit rule), drive it from one `stepCombat` phase in `stepSim` with the player's combat state held outside `FlightState`, deliver hull octrees through a new generated lazy artifact that reaches the sim as step options (the `shipMasses` pattern), and land FOUND-17 and the binding migration first.

## Findings that sharpen locked decisions (read before planning)

| # | Finding | Evidence | Planner action |
|---|---------|----------|----------------|
| F1 | **D-04**: in Oolite, pressing R while ident is already engaged does not leave the lock cleared. `handleButtonIdent` calls `noteLostTarget` (clears the target) and sets `ident_engaged = YES`; the next `updateTargeting` pass locks whatever is in the sights again. The lock is dropped by **U** (`key_untarget_missile`, message "Ident system deactivated.") or by `isValidTarget` failing (beyond scanner range, cloaked, entering witchspace, docked or scooped; message "Target lost."). | `PlayerEntityControls.m:1255-1258`, `:1404-1418`, `:4758-4766` (pinned commit); `PlayerEntity.m:3595-3628`, `:3699-3750` | Present to the owner as an Open Question (OQ1). Recommended: implement Oolite exactly (R = clear and re-acquire) and add an `untarget` action (default `KeyU`) so the player can switch ident off; otherwise the lock can never be dropped except by leaving range. |
| F2 | **D-03**: Oolite's lock message is `"Ident system locked onto [target]."` with `[target]` = the ship's `displayName` (no class). Oolite draws a target reticle only when `EQ_SCANNER_SHOW_MISSILE_TARGET` is fitted (`hud.plist` dial `drawTargetReticle:` has `equipment_required`). The frame in the 3D view is therefore a Wegolite addition (allowed by D-03). | `descriptions.plist:527`; `ShipEntity.m:6254-6260`; `PlayerEntity.m:10911-10919`; `hud.plist:5-12` | Keep D-03. "Name and class" is the owner's wording; Oolite prints the name only. Ask whether "class" is wanted (OQ2). |
| F3 | **D-01** octree size: measured with the project's own build-time `buildOctree` over the vendored `.dat` files: Cobra 842 bytes, nine NPC hulls 614-1,366 bytes each, 9,246 bytes total compact (12,332 bytes base64), 88 KB as nested-array JSON. Headroom to the ceiling is 597,393 bytes (9,437,184 minus 8,839,791). | scratch measurement run in the `test` container this session (script under the scratchpad, nothing added to the repo) | D-01 holds and is cheap. Choose the encoding (compact string vs nested arrays) and the load trigger (with the NPC catalogue in the boot `Promise.all`, or behind the first in-flight latch) in the plan; either leaves the ceiling untouched. |
| F4 | **Persisted bindings defeat a default change.** `saveSettings` writes the whole binding map (`bindings: normalized.bindings`), so every existing player already stores `pause: ["KeyP","Escape"]` and `targetStation: ["KeyR"]`. New defaults never reach them, and `createBindingMap` then silently drops the later-listed action on the shared key. | `src/settings/store.ts:104-108`, `src/settings/schema.ts` (`mergeDefaults`, `createBindingMap`), `src/input/bindings.ts:49-77` | The binding plan needs a settings migration (Pitfall 1). |
| F5 | **Oolite eject needs an escape pod**: the Escape handler is guarded by `[self hasEscapePod]`, and the double press uses `KEY_REPEAT_INTERVAL 0.20` s. Without a pod nothing happens, not even double-press tracking. | `PlayerEntityControls.m:1439-1470`; `PlayerEntity.h:311` | A bound-but-inert `eject` action is faithful. |
| F6 | **Combat bookkeeping runs whenever the player is not docked**: `doBookkeeping` is called for in-flight, autopilot, witchspace countdown, witchspace exit and launching. Weapon cooling, shot timers, energy and shield recharge and cabin cooling all live there. | `PlayerEntity.m:2430-2432`, `:3226`, `:3427`, `:3513`, `:3523` | Run the combat step in Wegolite's `launching` and `inFlight` modes, never `docked`. |
| F7 | **Docking resets** shields, energy, `weapon_temp` and cabin temperature in `docked`; the four per-facing laser temperatures and the shields are reset again in the launch routine. Because bookkeeping does not run while docked, both routes give the same net result. | `PlayerEntity.m:6321-6325`, `:6442-6448` | Reset all four per-facing temperatures at dock; pin it with one test (DOCK-10). |
| F8 | **Octree hit distance quirk**: `isHitByLine` returns the distance from the ray start to the centre of the first solid leaf reached in a fixed octant visiting order, not the nearest surface. `firstShipHitByLaserFromShip` compares these distances between ships. A faithful port must keep the visiting order and the leaf-centre distance. | `Octree.m:345-455` | Port line by line (Pitfall 4). |
| F9 | The plist comment for `shield_charge_energybank_threshold` says "Default: 0.0"; the code default is `0.25`. The code decides. | `global-settings.plist:20-26`; `PlayerEntity.m:2606` | Ledger row S6 records 0.25 with this note. |
| F10 | Lasers cannot hit the Coriolis, the buoys or any static body in this milestone: the roadmap fixes the octree set at the Cobra and nine NPC hulls, and statics are not world entities. Oolite stops a laser at a station hull. | ROADMAP Phase 13 implied work; `src/sim/world/world.ts` `STATIC_ENTITIES` | Record as a FIDELITY divergence with a Key Decisions row. |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Laser fire gating, heat, energy cost, shield/energy recharge, damage routing, cabin cooling | Simulation core (`src/sim/combat/`) | - | Pure, fixed-step, deterministic; reads constants, never Three or the DOM (AGENTS.md convention) |
| Octree ray test and two-stage hit rule | Simulation core | Content build (octree data) | Pure maths over data handed in as step options; data compiled at build time |
| Hull octree and Cobra radius data | Content build (`tools/oolite-ingest`) | App loader (lazy chunk), sim (consumes via options) | Compiled from the vendored `.dat`; strict schema, golden, drift gate; the sim never imports `src/content` |
| NPC energy fields | Content build, then `Entity` record in the sim | - | Minimum of DATA-15; copied at spawn so the sim and the snapshot are self-contained |
| Fire as a command shared by player and NPC | Simulation core (`ShipControl.fire`, `InputFrame`) | Input layer (key to action) | Pitfall 19: one `fire` intent, resolved at one fixed point |
| View selection and weapon facing | Simulation core (player combat state, `setView` command) | Render (camera pose), input | The facing decides which mount fires, so it must be deterministic sim state |
| Key bindings, settings migration, controls panel | Input layer and settings store | UI (controls panel, README) | `ACTION_IDS` is the single table; the panel is generic over it |
| Laser purchase per facing, trade-in | Sim player module (`outfitting.ts` extension) | UI station model and controller | Money path stays pure and allow-listed |
| Save v4 `laserMounts` | Persistence (`save.ts` chain) | Session snapshot builder | Ordered v3 to v4 bump, strict schema, shared semantic validator |
| HUD gauges, ident frame, laser shot drawing | Render and app (`hud-model.ts`, `draw.ts`, a shot layer) | - | Presentation only; reads the model |
| Messages (overheat, no energy, ident) | App event router | - | Sim emits payload-free events; the app owns wording and throttling |

## Standard Stack

No package is added or upgraded in this phase. Every tool below is already installed and pinned.

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | 6.0.2 | sim, app, tools | project language `[VERIFIED: package.json]` |
| Vitest | 5.0.5 | unit and scenario tests (at least 90 % of new assertions) | project test runner `[VERIFIED: package.json]` |
| fast-check | 4.10.2 | property tests for the ray test and damage routing | already a devDependency `[VERIFIED: package.json]` |
| zod | 4.6.7 | strict schemas for the hull artifact, NPC record, save v4 | project validator `[VERIFIED: package.json]` |
| three | 0.187.0 | laser shot and camera presentation only | project renderer `[VERIFIED: package.json]` |
| @playwright/test | 1.64.1 | the one opt-in smoke or journey spec | project browser runner `[VERIFIED: package.json]` |
| tsx | 4.23.15 | content build (`assets:build`, `assets:check`) | project tool `[VERIFIED: package.json]` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Nested-array JSON octrees (88 KB) | Compact base64 mask string (12 KB) | Compact is 7 times smaller but needs a decoder and its own round-trip test; nested arrays reuse the build-time `OctreeNode` type unchanged. Both stay far under the ceiling. |
| Player combat fields on `FlightState` | A separate `PlayerCombatState` | `FlightState` fields enter `serializeFlight` and move every pinned golden (Pitfall 9). Use the separate state. |
| Per-ship energy in a side table | Fields on `Entity` | A side table escapes the world hash and snapshot. Entity fields are the established home (`nav`, `ai`, `rng`). |

**Installation:** none. **Version verification:** versions read from `package.json` this session; no registry lookup is needed because nothing is installed.

## Package Legitimacy Audit

No external package is installed by this phase. The audit table is empty by construction.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| (none) | - | - | - | - | - | - |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
 keys ──> InputState (actions, context) ──> Command edges + InputFrame { pitch, roll, speed, precision, fire? }
                                                 │
                                                 ▼
 sim-driver.stepOnce ──> stepSim(player, world, layout, config, intent, commands, dt, options)
     │                       options += { combat: CombatOptions (weapon table, hulls, laser mounts, equipment) }
     ├─ 1 stepFlight (unchanged; commands, attitude, torus, docking)  ──> flight events (docked, launched, ...)
     ├─ 2 stepCombat(playerCombat, flight events)
     │       dock/launch reset ─> bookkeeping: weapon cooling, shot timers, energy += rate*dt,
     │       shield recharge (bank-aware), cabin cooling ─> player fire request (held `fire`, current facing)
     ├─ 3 stepWorld (unchanged order)  update ─> think (AI may call ShipControl.fire) ─> NPC energy recharge ─> commit
     ├─ 4 resolveFire (one fixed point, id order)
     │       for each request: gate (heat cutout, energy, recharge) ─> ray from mount ─> two-stage hit
     │       stage A sphere test ─> stage B octree descent (hull data present?) ─> nearest hit < range
     │       emits laserFired, queues HitRecord { target, source, amount }
     └─ 5 applyDamage (end of tick, no handlers, no cascades)
             target = player: facing shield first ─> energy ─> heat    target = NPC: energy floor at 0
             emits shipHit (+ energyLow optional)
                                                 │
                                                 ▼
 SimEvent[] ──> EventRouter ──> hudMessages (throttled), shot layer (laserFired), dock-feedback flash (hit on player)
 HudModel.bars { shieldFwd, shieldAft, energy, laserTemp, cabinTemp } + identFrame ──> drawHud (existing gauge rects)
 StepOptions.combat.hulls <── lazy hull-octree chunk (strict zod) <── tools/oolite-ingest (buildOctree, hullRadius)
```

### Recommended Project Structure
```
src/sim/combat/
├── constants.ts      # the ledger as typed constants, each with its Oolite file:line comment
├── weapons.ts        # LaserKind table lookup, canFire(), fire cost and heat, per-facing cooling
├── shields.ts        # damage routing, shield and energy recharge step, cabin cooling
├── octree.ts         # HullOctree type, port of Octree.m isHitByLine and OOVoxel.m line-cube tests
├── hit.ts            # firstShipHit(): sphere stage then octree stage, nearest rule
├── state.ts          # PlayerCombatState, create/reset/sanitize, serializeCombat, dock reset
└── step.ts           # stepCombat and resolveFire orchestration
src/content/
├── hulls.ts          # lazy loader, same shape as ships-npc.ts (`?raw` glob, strict schema)
└── schemas/hull.ts   # strict schema, depth and node caps
tools/oolite-ingest/convert/hulls.ts   # emit the artifact, reuse buildOctree and hullRadius
```

### Pattern 1: Data crosses the sim boundary as step options, never as imports
**What:** `src/sim` cannot import `src/content`. Masses reach the sim as `StepOptions.hyperspace.shipMasses`, supplied each step by the session. Hull octrees, laser stats and the player's laser mounts follow the same route (`StepOptions.combat`), built by one pure function shared by the session and the Node tick replay (`buildStepOptions`, `tests/helpers/tick-script.ts`).
**When to use:** every new content-derived input of this phase.
**Example (design sketch, not source):**
```typescript
// [ASSUMED: design sketch] shape only; names are the planner's to settle
interface CombatOptions {
  readonly hulls?: ReadonlyMap<string, HullOctree>; // absent or missing key = "not loaded": no hit
  readonly mounts: LaserMounts;                      // from PlayerProfile
}
```
**"Not loaded" rule (D-01):** `firstShipHit` returns no hit for a target whose `specKey` has no hull entry. Pin with a scenario that fires with `hulls` undefined, then with the entry present, and asserts one miss and one hit.

### Pattern 2: One damage function, one hit rule, queued application
**What:** a single pure `routeDamage(target, amount, attackerBearing)` used for the player and for NPCs; fire requests are collected during the tick and resolved at one fixed point in ascending shooter id; damage is applied after resolution with no handlers (Pitfall 7). NPCs have no shields: `energy -= amount` floored at 0. The player routes to the forward shield when the attacker is in front or exactly abeam, else to the aft shield, then to energy (`d_forward >= 0`, `PlayerEntity.m:5646`).
**Example (verbatim source):**
```objc
    if (d_forward >= 0) {
        forward_shield -= amount;
        if (forward_shield < 0.0) {
            amount = -forward_shield;
            forward_shield = 0.0f;
        } else {
            amount = 0.0;
        }
    } else {
```
`PlayerEntity.m:5646-5656` (the aft branch mirrors it). Heat is added only for the residual `amount > 0.0` and never past `SHIP_MAX_CABIN_TEMP` (`PlayerEntity.m:5669-5676`).

### Pattern 3: Player combat state beside, not inside, the flight state
**What:** `PlayerCombatState { view, fwdShield, aftShield, energy, cabinTemp, laserTemp[4], sinceShotTicks[4], ident }` is created with `FlightState`, stepped by `stepCombat`, reset by the `docked` event, and appended to `hashWorld`'s text only when it differs from the pristine docked state (the same device `isNeverSpawned` uses), so the three pinned flight hashes and the traffic-off hashes do not move.
**Why:** `FlightState` fields enter `serializeFlight`, which every golden hashes (`src/sim/flight/state.ts:147-179`).

### Pattern 4: Ray test as a line-by-line port, in the ship's Oolite-handed local frame
**What:** transform the segment into the target's local frame, then negate local z to reach Oolite's left-handed model space (Wegolite local forward is -Z; the content build maps Oolite to glTF by negating z: `glb.ts:247` "glTF coordinates: Oolite's position with Z negated" and `glb.ts:717`). Run the two stages of `firstShipHitByLaserFromShip` (`Universe.m:5549-5640`) and the octree descent of `Octree.m:336-471` with the helpers of `OOVoxel.m:29-260`.

### Pattern 5: View cameras from the compiled view offsets
**What:** `view_position_forward/aft/port/starboard` are compiled in `ships-client.json` `extras` for the Cobra (`"0.0 7.25 31.0"`, `"0.0 6.0 -35.5"`, `"-35.5 7.5 0.0"`, `"35.5 7.5 0.0"`; source `shipdata.plist:1344-1347`). The forward offset is already in the code as `COCKPIT_OFFSET = vec(0, 7.25, -31)` (`launch-camera.ts:41`), so the conversion is (x, y, -z). Camera orientation is the ship orientation rotated about the ship's local Y: aft 180 degrees, port +90, starboard -90 (port looks toward local -X; derived, see A1, pin with a unit test that the port camera's forward equals the ship's negative right axis). Weapon facing follows the view (`switchToThisView:andProcessWeaponFacing:`, `PlayerEntityControls.m` pinned `:4608-4640`); a view may be selected with no laser fitted, in which case firing does nothing (`isWeaponNone` returns NO, `PlayerEntity.m:5466-5468`).

### Anti-Patterns to Avoid
- **Adding combat fields to `FlightState`:** moves every flight golden. Use `PlayerCombatState`.
- **Synchronous damage inside the fire call:** results then depend on update order. Queue hits and apply at the fixed point.
- **A second hit rule for NPCs:** CBT-07 requires the same rule. The scripted pilot calls `ShipControl.fire`, nothing else.
- **Feel tuning:** an Oolite number that plays badly is a finding for the owner, not a tweak (Pitfall 14).
- **Float comparisons for timers:** use integer ticks for the recharge gate (see ledger note on quantisation).

## Combat Constants Ledger (Pitfall 14)

All Oolite lines below are from the pinned commit `7437f22`; the files are identical in the checkout except where noted. Values are quoted verbatim.

### Lasers (`Resources/Config/equipment.plist`, vendored at `third_party/oolite/Config/equipment.plist`; already in `equipment.json` as `conditions.weapon_info`)

| Laser | Tech level | Price (dc) | range (m) | energy | damage | recharge_rate (s) | shot_temperature | Lines |
|-------|-----------|-----------|-----------|--------|--------|-------------------|------------------|-------|
| Pulse | 3 | 4000 | 12500 | 0.8 | 15.0 | 0.5 | 7.0 | `equipment.plist:125-136` |
| Beam | 4 | 10000 | 15000 | 0.5 | 6.0 | 0.1 | 3.2 | `:143-154` |
| Mining | 10 | 8000 | 12500 | 1.4 | 50.0 | 2.5 | 10.0 | `:163-174` |
| Military | 10 | 60000 | 30000 | 1.1 | 12.0 | 0.1 | 4.25 | `:184-195` |
| None (removal) | 3 | 0 | 32000 | 0.0 | 0.0 | 100.0 | 0.0 | `:108-119` |

`[VERIFIED: equipment.plist:131-136]` quote: `range = 12500; energy = 0.8; damage = 15.0; recharge_rate = 0.5; shot_temperature = 7.0;`. The mapping of keys to roles is `OOEquipmentType.m:655-678`: `range`, `energy` (energy use per shot), `damage`, `recharge_rate`, `shot_temperature`. Colours: `redColor`, `yellowColor`, `blueColor`, `magentaColor` for pulse, beam, mining, military. Shot lifetime `kLaserDuration (0.09)` seconds (`OOLaserShotEntity.m:36`).

### Fire, heat and energy (player)

| ID | Rule | Verbatim source | Lines |
|----|------|-----------------|-------|
| W1 | Fire gate by temperature | `if (weapon_temp / PLAYER_MAX_WEAPON_TEMP >= WEAPON_COOLING_CUTOUT) {` then message "Weapon system overheated." and return NO | `PlayerEntity.m:5460-5464` |
| W2 | Fire gate by energy (strict) | `if (energy <= weapon_energy_use * multiplier) {` then "Weapon system inactive (no energy left)." | `:5478-5481` |
| W3 | Cost | `energy -= weapon_energy_use * multiplier;` and `forward_weapon_temp += weapon_shot_temperature * multiplier;` (per facing) and `forward_shot_time = 0.0;` | `:5485-5494` |
| W4 | Recharge gate (strict) | `&& (shot_time > weapon_recharge_rate)` in the key poll; `shot_time` is the current facing's | `PlayerEntityControls.m:1185` (pinned) |
| W5 | Constants | `#define WEAPON_COOLING_FACTOR 6.0f` (per second), `#define PLAYER_MAX_WEAPON_TEMP 256.0f`, `#define WEAPON_COOLING_CUTOUT 0.85f`, `#define INITIAL_SHOT_TIME 100.0` | `ShipEntity.h:115,117,102`; `PlayerEntity.h:277` |
| W6 | Cooling per step | `float coolAmount = WEAPON_COOLING_FACTOR * delta_t;` then `forward_weapon_temp = fdim(forward_weapon_temp, coolAmount);` (floor at 0) | `PlayerEntity.m:2481-2485` |
| W7 | Shot reach and hit acceptance | ray length `weaponRange`; accepted only if `hit_at_range * hit_at_range < range_limit2`; damage `effective_damage = weapon_damage` | `ShipEntity.m:10362-10419`; `Universe.m:5570` |
| W8 | LT gauge | `weapon_temp / PLAYER_MAX_WEAPON_TEMP` clamped 0..1, of the current facing | `PlayerEntity.m:4300-4303` |

Worked example for the pinning test (derived arithmetic, not an Oolite output): pulse, cooling 6/s, +7 per shot every exact 0.5 s gives a net +4 per shot, so the temperature seen at attempt k+1 is 4k and the cut-out (0.85 x 256 = 217.6) first blocks the attempt after shot 55. With the 61-tick period below the net per shot is 7 - 6 x 61/120 = 3.95, so the first blocked attempt follows shot 56. Let the test recompute both by simulation and pin the tick version. Quantisation (recorded divergence): Oolite compares float seconds with `>`; use integer ticks, so a pulse period is 61 ticks (60 ticks equal 0.5 s exactly, and `>` needs one more) and a beam period 13 ticks. Keep the `>` and the tick count together in the ledger.

### Shields, energy and recharge (player; NPCs below)

| ID | Rule | Verbatim source | Lines |
|----|------|-----------------|-------|
| S1 | Max shield with no boosters | `#define BASELINE_SHIELD_LEVEL 128.0f // Max shield level with no boosters.` | `ShipEntity.h:101` |
| S2 | Shield recharge rate | `forward_shield_recharge_rate = 2.0;` and `aft_shield_recharge_rate = 2.0;` (units per second each) | `PlayerEntity.m:1536-1537`, `:1949-1950` |
| S3 | Cobra energy | `max_energy = 256;` and `energy_recharge_rate = 4;` | `shipdata.plist:1333`, `:1296` (already in `ships-client.json` extras) |
| S4 | Bank recharge first | `energy += [self energyRechargeRate] * delta_t;` | `PlayerEntity.m:2581` |
| S5 | Per-shield recharge capped by room | `float rechargeFwd = MIN(shieldRechargeFwd, fwdMax - forward_shield);` (same for aft) | `:2596` |
| S6 | Energy available to shields | `float energyForShields = energy;` then, when both shields are above a quarter: `energyForShields = MAX(0.0, energy - 0.1 - (maxEnergy * minEnergyBankLevel));` with `defaultValue:0.25` | `:2603-2608` |
| S7 | Allocation order | the lower shield is served first: `if (forward_shield < aft_shield) { rechargeFwd = MIN(rechargeFwd, energyForShields); rechargeAft = MIN(rechargeAft, energyForShields - rechargeFwd); } else { ...aft first... }` (tie goes to aft first) | `:2610-2617` |
| S8 | Apply and clamp | `forward_shield += rechargeFwd; aft_shield += rechargeAft; energy -= rechargeFwd + rechargeAft;` then clamp shields to `0..max` and `energy = OOClamp_0_max_f(energy, maxEnergy);` | `:2619-2625` |
| S9 | Hit routing | forward shield when `d_forward >= 0` (attacker position relative to the player), else aft; residual to energy; no negative shields | `:5646-5668` |
| S10 | Dials | shield dial is `shield / maxShield` clamped; energy dial `energy / maxEnergy` clamped; energy gauge has `maxEnergy / 64` = 4 banks, bank 4 (bottom) fills first, bank 1 (top) last | `PlayerEntity.m:4268-4276`; `HeadUpDisplay.m:1984-1985, 2032-2041` (pinned numbering) |
| N1 | NPC energy recharge | `if (energy < maxEnergy) { energy += energy_recharge_rate * delta_t; if (energy > maxEnergy) { energy = maxEnergy;` | `ShipEntity.m:2417-2420` |
| N2 | NPC hit | `energy -= amount;` (no shields) | `ShipEntity.m:11431` |
| N3 | NPC energy fields | `max_energy` and `energy_recharge_rate` read from the record, defaults 200 and 1.0 | `ShipEntity.m:291-292` |

Compiled NPC values (from `src/content/generated/ships.json`, like_ship resolved, read this session): adder 85/2, cobramk1 150/2.5, gecko 250/4, krait 250/2.5, mamba 240/3, moray 240/3, shuttle 120/1, sidewinder 240/2, viper 180/4 (max_energy / energy_recharge_rate). `forward_weapon_type` of the same nine: adder PULSE, cobramk1 PULSE, gecko BEAM, krait BEAM, mamba PULSE, moray PULSE, shuttle NONE, sidewinder PULSE, viper BEAM; `weapon_position_forward` is compiled for all nine.

Out of scope here, do not implement: shield boosters (`BASELINE_SHIELD_LEVEL * shieldBoostFactor`), the energy unit multiplier (`oolite_energy_recharge_multiplier` stays a carried condition), ECM drain, cloaking drain, internal damage (`PLAYER_INTERNAL_DAMAGE_FACTOR`), the 1% bleed-through to subentities, the weapons-online toggle.

### Cabin temperature (CBT-06, D-05, D-06)

| ID | Rule | Verbatim source | Lines |
|----|------|-----------------|-------|
| C1 | Constants | `#define SHIP_COOLING_FACTOR 0.1f`, `#define SHIP_MAX_CABIN_TEMP 256.0f`, `#define SHIP_MIN_CABIN_TEMP 60.0f` | `ShipEntity.h:63,69,70` |
| C2 | Start value | `ship_temperature = 60.0f;` (new game and on every dock) | `PlayerEntity.m:1803`, `:6325` |
| C3 | Cooling (space, no sun input) | `if (ship_temperature > SHIP_MIN_CABIN_TEMP) ship_temperature += (float)((external_temp - heatThreshold - ship_temperature) * SHIP_COOLING_FACTOR * deltaInsulation);` with `heatThreshold = heatInsulation * 100.0f` and `deltaInsulation = delta_t / heatInsulation`; the player's `heatInsulation` is 1.0 (`[self setHeatInsulation:1.0]`, `PlayerEntity.m:1531`) | `PlayerEntity.m:2663-2671` |
| C4 | Heat from energy damage | `ship_temperature += amount * SHIP_ENERGY_DAMAGE_TO_HEAT_FACTOR / [self heatInsulation];` where `#define SHIP_ENERGY_DAMAGE_TO_HEAT_FACTOR (mass > 400000 ? 200000 / mass : 0.5)`; the Cobra mass is 214,737.6875 so the factor is 0.5; capped at 256 and only applied while below 256 | `PlayerEntity.m:5669-5676`; `ShipEntity.h:67` |
| C5 | Gauge | `ship_temperature / SHIP_MAX_CABIN_TEMP` clamped 0..1 | `ShipEntity.m:8399-8403` |

With `external_temp = 0` (D-05: sun input out, recorded divergence; Oolite's value is a small positive number far from the sun) the pull target is -100, so a 256 reading falls to the 60 floor in about 8.0 s continuous time (`ln(356/160) / 0.1`). There is no clamp at 60: the step that crosses it can leave a value just under 60 and cooling then stops. Port exactly and pin both facts. The new-game gauge reads 60/256 = 0.234, not the 0.22 placeholder.

### Dock and launch resets (DOCK-10)

`docked`: `forward_shield = [self maxForwardShieldLevel]; aft_shield = [self maxAftShieldLevel]; energy = maxEnergy; weapon_temp = 0.0f; ship_temperature = 60.0f;` (`PlayerEntity.m:6321-6325`). Launch: `currentWeaponFacing = WEAPON_FACING_FORWARD;` and the four per-facing temperatures set to 0 and both shields refilled (`:6439-6448`). `shot_time` is not reset (it only advances in bookkeeping, `:2487-2491`). Start-of-game values: `energy = 256`, temperatures 0, `*_shot_time = INITIAL_SHOT_TIME` so the first shot is never gated (`:1792-1803`).

### Keys (INPUT-01; pinned `keyconfig2.plist`, vendored identical)

| Action | Oolite default | Notes |
|--------|----------------|-------|
| view fore/aft/port/starboard | `1`/`f1`, `2`/`f2`, `3`/`f3`, `4`/`f4` | `keyconfig2.plist:24-42`; in flight these collide with `launch` (`Digit1`/`F1`, contexts `flight` and `dockHome`) |
| fire lasers | `a` | `keyconfig2.plist:142`; held key, gated by W4 |
| ident | `r` | `keyconfig2.plist:193` |
| untarget / ident off | `u` | `:190`; message "Ident system deactivated." |
| pause | `p` | `:309` |
| eject | `esc`, double press within 0.20 s, only with a pod | `:205`; F5 |
| target station | none in Oolite | recommend `KeyQ`: the only letter the default block never binds (checked the `default` block by listing its single-letter keys), so it cannot collide with a later Oolite-faithful binding |

### Ray test and hit rule (CBT-07)

| ID | Rule | Source |
|----|------|--------|
| O1 | Stage A: `v_off.z > 0.0 && v_off.z < nearest + cr && v_off.x < cr && v_off.x > -cr && v_off.y < cr && v_off.y > -cr && v_off.x * v_off.x + v_off.y * v_off.y < cr * cr` | `Universe.m:5615-5619` |
| O2 | Stage B and nearest rule: `GLfloat hit = [(ShipEntity*)e2 doesHitLine:p0 v1:p1 hitEntity:&entHit]; if (hit > 0.0 && hit < nearest) {` then shrink `p1` | `Universe.m:5621-5628` |
| O3 | Ray origin is the ship position plus the mount offset rotated into the world; direction is the facing; length is `weaponRange`; port = rotate about up by +pi/2, starboard by -pi/2, aft by pi | `Universe.m:5555-5611` (the player's `q1.w = -q1.w` quirk applies to subentity lasers only) |
| O4 | `doesHitLine` for a ship: line endpoints into the ship's right/up/forward frame, then `[octree isHitByLine:w0 v1:w1]` | `ShipEntity.m:1314-1321` (the player override adds subentities and a shield flag, `PlayerEntity.m:5558-5597`; neither of the ten hulls has a solid subentity, verified in `ships.json`) |
| O5 | Octree descent returns `hit_dist = sqrt(u0.x * u0.x + u0.y * u0.y + u0.z * u0.z)` at the first solid leaf, in the visiting order oct0, three neighbours, three back neighbours, diagonal (`oct1 = oct0 ^ 0x01` ...) | `Octree.m:347-455` |
| O6 | Line against cube helpers (`checkFace`, `checkBevel`, `checkCorner`, `lineCubeIntersection`, `lineIntersectionWithFace`, `checkLine`) | `OOVoxel.m:29-260` |
| O7 | Octree encoding in Wegolite already matches: `0` empty, `-1` solid, eight children in order `x * 4 + y * 2 + z` with plus = 1; root cube centred on the model origin with half-width 0.5 plus the largest coordinate | `tools/oolite-ingest/convert/octree.ts:78-86, 449-460` |
| O8 | Collision radius of a hull: largest vertex distance from the model origin | `tools/oolite-ingest/convert/ship-radius.ts` (nine NPC hulls compiled; **the Cobra's radius is not compiled** and must be added) |

Also verified: `SCANNER_MAX_RANGE 25600.0` and `SCANNER_MAX_RANGE2 655360000.0` (`Entity.h:49-50`); ident target search is sphere-based with `nearest2 = SCANNER_MAX_RANGE - 100` squared (`Universe.m:5649-5710`) and uses the view direction, not the weapon facing.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Octree construction | A runtime voxeliser | The existing build-time `buildOctree` and `octreeDepthFor`, emitted to a generated artifact | Already a float32 line-by-line port with golden masses |
| Hull collision radius | An ad hoc bounding sphere | `hullRadius` from `ship-radius.ts`, extended to the Cobra key | Same rule Oolite uses for the sphere stage |
| Laser numbers | Hard-coded literals scattered in code | One `constants.ts` ledger pinned by a test against `equipment.json` `weapon_info` | Pitfall 14; drift is then a test failure |
| Deterministic randomness | `Math.random` | Per-entity `rng.combat` stream (already forked at spawn) | Sim bans `Math.random`; accuracy randomness belongs to CBT-15, not this phase |
| Key conflict handling | A new resolver | `createBindingMap`/`detectConflict`/`ACTION_CONTEXTS` | Already enforces context overlap |
| Strict untrusted JSON | Manual parsing | zod strict schemas like `NpcShipCatalogueSchema` | Same trust boundary as every other generated file |
| Message flooding | Per-call `enqueue` | A per-kind interval gate in the style of `shouldEmitScrapeMessage` | Pitfall 26 |

**Key insight:** every novel algorithm here already has a near twin in the repo (mass octree, mass lock field, scrape throttle, strict artifact loader). Reuse the twin's shape so goldens, drift gates and guards keep working.

## Common Pitfalls

### Pitfall 1: Persisted bindings hide the new defaults (INPUT-01)
**What goes wrong:** existing players keep `pause: ["KeyP","Escape"]` and `targetStation: ["KeyR"]`; the new `ident` default on `KeyR` and `eject` on `Escape` then lose the key in `createBindingMap`'s conflict pass, or `Escape` keeps pausing.
**Why:** `saveSettings` persists the full map (`store.ts:104-108`) and `mergeDefaults` treats stored actions as authoritative.
**How to avoid:** a load-time settings migration that rewrites a stored table only when it exactly equals the old default (`pause` equal to `["KeyP","Escape"]` becomes `["KeyP"]`; `targetStation` equal to `["KeyR"]` becomes the new key) and runs before `createBindingMap`. No version bump needed (a bump would make older builds treat the blob as newer and ignore it). Test with a stored legacy blob, and with a stored customised blob that must survive untouched.
**Warning signs:** a stored blob test where R still sets compass target; `eject` empty in the controls panel.

### Pitfall 2: Digit1/F1 are both launch and fore view in flight
**What goes wrong:** `launch` is in contexts `flight` and `dockHome` (`actions.ts` `ACTION_CONTEXTS`); `viewFore` on the same codes in `flight` would be dropped by conflict resolution.
**How to avoid:** the sim gates `launch` on `docked` mode already (`step.ts:134`), and the home screen is `dockHome`, so removing `flight` from `launch` contexts is safe; confirm the in-flight launch-skip path (`start-session.ts:227` pushes `skipLaunch`, not `launch`). Pin with a conflict test over the default table.

### Pitfall 3: The Escape pair machinery is now dead or wrong
**What goes wrong:** `ESCAPE_SCREEN_CONTEXTS`, `ESCAPE_SCREEN_ACTIONS`, `isExemptPair` and the `keyDown` special case exist only because `pause` shared Escape. After the change `pause` is `P` only, `eject` is `flight`-only and the screens keep Escape as Back. A paused game then no longer resumes on Escape.
**How to avoid:** delete or neutralise the exemption deliberately, update `tests/input/bindings.test.ts:44,85-95,185-188,238,303,416-436,510`, `tests/input/station-actions.test.ts:37-53,147-149`, `tests/settings/schema.test.ts:84`, README (`README.md:52,112,178`, pinned by `tests/contract/readme.test.ts`), and keep `settings-controller.ts` Escape routing out of sub-panels (it is its own listener). The controls panel's capture mode treats Escape as cancel, so Escape cannot be re-captured for `eject` after a rebind except through Reset; note it, do not fix it here.
**Migration inventory:** no e2e spec presses R (searched); e2e Escape presses are Back inside screens or the chart (`station.spec.ts:266,610,799,892`, `docking.spec.ts:485`, etc.) and stay valid; the pause paths in e2e already use `KeyP`.

### Pitfall 4: Octree port drift
**What goes wrong:** a "cleaner" nearest-surface test returns a different distance than Oolite's leaf-centre distance and changes which ship is hit first or whether `hit_at_range` passes the range gate.
**How to avoid:** port `isHitByLine` including the visiting order and the leaf-centre `hit_dist`; add a differential property test against a brute-force "does the segment touch any solid cell" oracle only for hit/miss, and hand-computed fixtures for the distance. Guard divisions: every `lineIntersectionWithFace` call is reached only when `checkLine` has proven the relevant axis differs, but add a finite check on all outputs (Pitfall 4 NaN).

### Pitfall 5: NaN or negative values under damage
**What goes wrong:** a non-finite amount or a corrupt energy makes `canon` throw inside the frame loop.
**How to avoid:** `sanitizeCombat` and the new Entity fields in `sanitizeEntity`, clamp energy to `0..max`, reject non-finite damage in `routeDamage`; add them to the snapshot parser caps (`limits.ts`).

### Pitfall 6: Entity record change moves goldens and the snapshot format
**What goes wrong:** new `Entity` fields change `serializeEntity` text, so `tests/golden/world/inert-lave-epoch1.json` and every world-hash assertion change, and `parseWorldSnapshot` (strict keys, `WORLD_SNAPSHOT_VERSION = 1`) rejects the new shape.
**How to avoid:** do it once, deliberately: bump `WORLD_SNAPSHOT_VERSION`, regenerate the inert-world golden through `tests/helpers/write-inert-world-golden.ts`, never regenerate `flight-hash-pins.json`, and record the decision in Key Decisions. The flight hash pins hold because the player's combat text is appended only when non-pristine.

### Pitfall 7: Save v4 ordering
**What goes wrong:** bumping `SAVE_VERSION` without freezing v3 as `z.literal(3)` breaks the ordered chain and the future-version test (`version > SAVE_VERSION` is what makes older builds treat v4 as inert).
**How to avoid:** copy the v2-to-v3 pattern: `SaveV3Schema` keeps `version: z.literal(3)`, add `SaveV4Schema`, `migrateV3ToV4` writing the default mounts (fore pulse, others none), extend `parseSave`, `validateSaveSemantics`, `isEncodedSaveValid`, `encodeSave`, new golden `v4-from-v3-*.json`, extend the worst-case size test (`tests/persistence/save-v3.test.ts` pattern). The new field is about 90 characters; the 65,536 cap is not at risk. Reject laser keys inside `equipment` (double encoding), as the berth and missile aliases are handled.

### Pitfall 8: F3 money-path boundary
**What goes wrong:** `checkFit`/`applyFit` refuse any key outside `VISIBLE_EQUIPMENT_KEYS`; a test pins lasers as `notOffered` (`tests/sim/player/outfitting.test.ts:118,724`), and a Key Decisions row (PROJECT.md:167) says lasers are never installable.
**How to avoid:** add a separate allow-listed laser path (`LASER_FIT_KEYS` x `FACINGS`) with its own `checkLaserFit`/`applyLaserFit`, keep every other record `notOffered`, and amend the Key Decisions row. Rules from Oolite: price is the catalogue price (station factor 1 at the Coriolis; `equipment_price_factor` appears only on one unrelated record, `shipdata.plist:3246`), refusal when credits are short, trade-in refund is the full catalogue price of the laser being replaced on that facing, "Remove Laser" costs 0 and refunds the same (`PlayerEntity.m:9139-9217`, `doTradeIn` `:9431-9438`). Row keys in the F3 model are plain strings, so a composite key such as `EQ_WEAPON_PULSE_LASER@fore` works with the existing `confirmFit` flow if parsed through the two allow-lists.

### Pitfall 9: Message flood in a fight
**What goes wrong:** Oolite re-posts "Weapon system overheated." on every held-fire attempt.
**How to avoid:** one gate per message kind at one per simulated second, driven by `flightTime`, like `shouldEmitScrapeMessage` (`dock-feedback.ts:43-50`). The ident message needs the same gate.

### Pitfall 10: Probe shape and HUD model are pinned
**What goes wrong:** new probe keys fail `tests/e2e/probe-shape.spec.ts`; new required `HudBars` fields break every literal `HudModel` in tests; `buildHudModel` is already an eight-positional-argument function.
**How to avoid:** add the combat HUD data as one optional trailing parameter or an options object, update the probe-shape fixture deliberately, keep `HUD_ELEMENTS` at eleven and every `HUD_LAYOUT` rectangle, and record the ident frame as a deliberate non-element drawing (a `HudModel.identFrame` field) in Key Decisions, as the hyperspace target line was.

### Pitfall 11: Hits on the player need the player's hull
**What goes wrong:** the scripted pilot's shots at the player cannot hit if the Cobra octree and radius are missing (`ships-client.json` has no radius for the Cobra).
**How to avoid:** the new hull artifact includes the Cobra key (`oolite_template_cobra3-player`, model `oolite_cobra3.dat`).

### Pitfall 12: Station and buoys do not stop lasers (F10)
Record it. Do not widen scope to statics.

## Code Examples

Verified patterns only. Design sketches elsewhere in this document are tagged `[ASSUMED]`.

### Octree node encoding already in the build (reuse, do not redefine)
```typescript
// Source: tools/oolite-ingest/convert/octree.ts:78-86 [VERIFIED: read this session]
export type OctreeNode = 0 | -1 | readonly OctreeNode[];

export interface Octree {
  /** The root half-width: the cube is centred on the model origin. */
  readonly radius: number;
  readonly depth: number;
  readonly root: OctreeNode;
}
```

### The step-options route for content the sim may not import
```typescript
// Source: src/sim/flight/step.ts:75-81 [VERIFIED: read this session]
    /**
     * The read-only compiled masses of the NPC ship kinds (WORLD-10), supplied
     * by the app each step from the compiled NPC records, exactly as
     * `stationMass` is. A ship blocks a completing jump only when its `specKey`
     * has an entry here; absent means no ship blocks.
     */
    readonly shipMasses?: readonly ShipMass[];
```

### The lazy strict loader shape to copy for hulls
```typescript
// Source: src/content/ships-npc.ts:36-39, 45-52 [VERIFIED: read this session]
const lazyNpcShips = import.meta.glob("./generated/ships-npc.json", {
  query: "?raw",
  import: "default",
});
let cachedCatalogue: Promise<NpcShipCatalogue> | undefined;
export function loadNpcCatalogue(): Promise<NpcShipCatalogue> {
  cachedCatalogue ??= (async () => {
    const load = lazyNpcShips[NPC_SHIPS_PATH];
```

### FOUND-17 fix site
```typescript
// Source: src/app/session/world-lifecycle.ts:158-172 [VERIFIED: read this session]
    begin(marketSeed) {
      if (
        !Number.isFinite(marketSeed) ||
        !Number.isSafeInteger(epoch) ||
        epoch < 0 ||
        epoch >= MAX_LIVE_EPOCH
      ) {
        return;
      }
```
The refusal `return;` is the bug: the origin `world` and `anchorNextEntityId` survive. Recommended: clear both on every refusal inside `begin` (the one owner), and call it from `handleHyperspaceJumped` unchanged (`hyperspace-controller.ts:239`, `ctx.core.worldLifecycle?.begin(nextSeed);`). Controller-level scenario: `harness()` from `tests/app/session/hyperspace-controller.test.ts`, lifecycle restored to epoch 4,294,967,294 with a populated world, `handleHyperspaceJumped`, assert `lifecycle.world === undefined`, `npcContacts(...)` empty and `anchorNextEntityId === undefined`.

### IN-01 (one-line fold-in)
`src/app/session/event-router.ts:258-260` prints `"Torus disengaged"` for every `torusDisengaged`, and the event already carries `reason: "massLock"` (`src/sim/events.ts:21`). One conditional prints `"Hyperspeed mass-locked."` for `reason === "massLock"` (the pinned Oolite string, `descriptions.plist:521`; see `PlayerEntity.m:2755-2758`). Update `tests/app/session-order.test.ts:531` and the CHANGELOG wording (`CHANGELOG.md:30`). This meets the "one line" test for folding into the FOUND-17 plan.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Octrees only at build time (mass) | Runtime ray test from delivered hull data | this phase | New generated artifact, strict schema, golden, drift gate |
| Static HUD gauge placeholders | Gauges fed from `HudModel` | this phase | Same rectangles; new data only |
| `pause` on P and Escape; R targets the station | `pause` on P; Escape ejects (inert); R ident; target-station on a free key | this phase | Settings migration and README table |
| Save v3 (epoch, nextEntityId) | Save v4 adds `laserMounts` | this phase | Ordered bump, golden, size test |

**Deprecated or superseded:** the Key Decisions row "Make the D-11 peaceful set the money-path boundary" is narrowed (lasers become installable through their own allow-list); amend it, do not delete it.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Port camera = ship orientation rotated +90 degrees about local Y, starboard -90, aft 180, in Wegolite's right-handed -Z-forward frame | Pattern 5 | Mirrored side views; a unit test on camera forward vs ship right axis catches it |
| A2 | Octree math in float64 gives the same hit/miss as Oolite's float32 except on cell-boundary rays | Pitfall 4 | A rare boundary difference; acceptable and recordable |
| A3 | `KeyQ` is the right free key for target-station | Keys table | Owner preference; any free key works, the panel lists it |
| A4 | Rendering a shot as a thin quad for 0.09 s of simulated time, coloured from `weapon_info.color`, satisfies "a drawn shot" | Architecture | Visual only; Oolite's beam width constants are in `OOLaserShotEntity.m:49-51` if fidelity is wanted |
| A5 | The `energyLow` reserved event need not be emitted this phase (Oolite prints "Energy low." only through an AI message path, `PlayerEntity.m:5169-5171`) | Ledger | If the owner wants the message, add one throttled line |
| A6 | Applying damage at the end of the same tick (no handlers) satisfies "queued, never synchronous" without a one-tick delay | Pattern 2 | If the planner wants the one-tick latency of PITFALLS 7, move application to the next tick; record the choice |
| A7 | Entity gets `energy`, `maxEnergy`, `rechargeRate` plus laser temperature and shot timer, so the scripted pilot obeys the same fire rule | Architecture | If the planner wants the smaller minimum (energy only), the pilot is rate-limited by its own think interval and the "same rule" claim must be narrowed in the plan |

## Open Questions (RESOLVED)

1. **OQ1 (owner, before planning the ident plan): what should R do when a lock exists?**
   - What we know: Oolite clears and re-acquires; U drops the lock (F1).
   - What's unclear: D-04 says "R again clears".
   - Recommendation: follow Oolite and add `untarget` on `KeyU`; if the owner prefers D-04 literally, record it as a deviation in Key Decisions and FIDELITY.
   - RESOLVED (advisor-resolved, owner confirmation pending): R while a lock exists clears it and re-acquires whatever is in the sights, as Oolite's `handleButtonIdent`; a new `untarget` action on `KeyU` drops the lock. Keys in plan 13-02, the rule in plan 13-15 (one branch of `stepIdent`), recorded by plan 13-15 in Key Decisions and 13-CONTEXT.md as PENDING OWNER CONFIRMATION with the literal D-04 alternative.
2. **OQ2: should the ident message include the ship class?** Oolite prints the name only. Recommendation: name only; add the class only if the owner confirms.
   - RESOLVED (advisor-resolved, owner confirmation pending): name only, "Ident system locked onto [name]." held in the single constant `IDENT_LOCKED_TEMPLATE` (plan 13-12); D-03 literally ("name and class") is a one-line change of that constant to render the compiled `scanClass`. No class field is compiled (plan 13-16). Recorded by plan 13-15 as PENDING OWNER CONFIRMATION.
3. **OQ3: load trigger for hull data.** With the NPC catalogue in boot (about 12 KB added to the traffic-on cold start if compact, about 88 KB as nested JSON) or behind the first in-flight latch (zero). Recommendation: compact encoding loaded with the catalogue; measure with `tests/e2e/traffic.spec.ts` and record the new figure beside 8,839,791.
   - RESOLVED (advisor-resolved): nested-array JSON reusing the build-time `OctreeNode` shape, with no decoder, loaded with the NPC catalogue in the boot `Promise.all` only when traffic is on (plans 13-04 and 13-11). This deviates from the compact-encoding recommendation above: about 88 KB keeps the traffic-on cold start under the 9,437,184-byte ceiling with margin. Plan 13-04's size gate (200,000 bytes) guards it; if the gate fails, 13-04 switches to the compact encoding rather than raising the ceiling, and plan 13-11 records the measured figure.
4. **OQ4: station and buoys do not block shots** (F10). Confirm as an accepted divergence.
   - RESOLVED (advisor-resolved, owner confirmation pending): confirmed as a divergence for this milestone; only dynamic world ships are laser and ident candidates, so the station and buoys neither block nor take shots (plans 13-08 and 13-15). Plan 13-14 records it in Key Decisions and FIDELITY.
5. **OQ5: when a shot is refused (overheat, no energy), which messages appear?** Oolite shows two fixed strings; recommendation is both, throttled one per second per kind.
   - RESOLVED: both Oolite strings, "Weapon system overheated." and "Weapon system inactive (no energy left).", each at most once per simulated second per kind through the generalised throttle (plan 13-12).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Docker + Compose | every test, build and measurement (AGENTS.md) | yes | Docker 29.8.2 | none, mandatory |
| `wegolite-ci` image | `docker compose run --rm test` etc. | yes | built, Node v24.22.2 inside | `docker compose build` |
| Oolite checkout | reading upstream behaviour | yes | `/home/opencode/git/oolite` (HEAD `4bb1f53`; pin `7437f22` present as an object) | none needed |
| Vendored snapshot | content build input | yes | `third_party/oolite/` (`pin.json`: release 1.93.1-241, commit `7437f22`) | none |
| Real Oolite binary for differential checks | octree ray oracle | no | - | hand-computed fixtures plus a brute-force cell oracle (the Oolite-in-Docker measurement is a deferred todo, out of scope) |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** an executable Oolite oracle; use fixtures and property tests.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.5 (Node project `unit`), fast-check 4.10.2, Playwright 1.64.1 |
| Config file | `vitest.config.ts` (coverage floors: `src/sim/**` lines 93, statements 91, functions 97, branches 86; `src/persistence/**` lines 88; `src/content/**` lines 66) |
| Quick run command | `docker compose run --rm test npx vitest run <file>` |
| Full suite command | `docker compose run --rm test` (then `lint`, `typecheck`; `verify` for browser-facing changes; `verify-full` only for render, input, persistence or network-guard changes before release) |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FOUND-17 | refused `begin` at max epoch leaves no origin entity, no contact, no jump block, no stale anchor | controller scenario | `docker compose run --rm test npx vitest run tests/app/session/hyperspace-controller.test.ts` | extend (file exists) |
| FOUND-17 | lifecycle refusal clears world and anchor | unit | `... tests/app/session/world-lifecycle.test.ts` | extend |
| INPUT-01 | new defaults, no key conflict in any context, Escape Back in screens, pause P only | unit | `... tests/input/bindings.test.ts tests/input/station-actions.test.ts` | extend |
| INPUT-01 | legacy stored settings migrate; customised stored bindings survive | unit | `... tests/settings/schema.test.ts` | extend |
| INPUT-01 | README controls table matches defaults | contract | `... tests/contract/readme.test.ts` | extend |
| INPUT-01 | eject double press within 0.20 s changes nothing | unit | `... tests/input/bindings.test.ts` (or new `tests/input/eject.test.ts`) | Wave 0 |
| CBT-04 | view switch sets facing; camera forward per view; port forward equals -right | unit | `... tests/render/launch-camera.test.ts` | extend |
| CBT-05 | ledger equals `equipment.json weapon_info` for all four lasers | unit | `... tests/sim/combat/constants.test.ts` | Wave 0 |
| CBT-05 | fire gates: heat cut-out, energy, recharge (61 and 13 ticks), cooling 6/s, 1 s simulation checks | scenario | `... tests/sim/combat/weapons.test.ts` | Wave 0 |
| CBT-05 | F3 laser purchase per facing, refusal reasons, trade-in, removal, forged keys refused | unit | `... tests/sim/player/outfitting.test.ts tests/ui/station-model.test.ts` | extend |
| CBT-05 | save v4 chain, defaults, worst-case size, v4 inert for older readers, golden | unit | `... tests/persistence/save-v4.test.ts` | Wave 0 |
| CBT-06 | damage routing: front/back shield, spill to energy, heat 0.5 per point, caps | unit | `... tests/sim/combat/shields.test.ts` | Wave 0 |
| CBT-06 | recharge algorithm worked examples (S4-S8), bank threshold 0.25, tie order | unit | same file | Wave 0 |
| CBT-06 | cabin cooling: 256 to 60 in about 8 s, undershoot, start 60 | unit | same file | Wave 0 |
| CBT-06 | HUD model bars (shield, energy banks bottom-up, LT, CT) | unit | `... tests/ui/hud-model.test.ts` | extend |
| CBT-07 | octree ray test: hand fixtures, visiting order, leaf-centre distance, hit/miss property vs brute-force cells | unit + property | `... tests/sim/combat/octree.test.ts` | Wave 0 |
| CBT-07 | two-stage rule: sphere hit but hull miss; nearest ship wins; data not loaded means miss | scenario | `... tests/sim/combat/hit.test.ts` | Wave 0 |
| CBT-07 | scripted pilot via `ShipControl.fire` hits player and NPC by the same rule; world step order; `control.test.ts` member pin updated | scenario | `... tests/sim/world/control.test.ts tests/sim/ai/test-pilot.test.ts tests/sim/world/step.test.ts` | extend |
| CBT-07 | NPC energy fields: compile, schema, golden, drift | unit + gate | `docker compose run --rm assets npm run assets:check`; `... tests/content/ships-npc.test.ts` | extend |
| CBT-07 | hull artifact strict schema, depth and node caps, golden, drift | unit + gate | `... tests/content/hulls.test.ts`; `assets:check` | Wave 0 |
| DOCK-10 | dock restores shields, energy; resets four laser temps and cabin; launch resets facing | scenario | `... tests/sim/combat/dock-reset.test.ts` | Wave 0 |
| all | replay determinism: cross-cadence hash equality with combat active; flight hash pins unchanged; world golden regenerated once | integration | `... tests/sim/world/flight-hash-pins.test.ts tests/sim/world/world-cadence.test.ts` | extend |
| all | opt-in browser smoke: `?test=1&traffic=1&clock=manual`, fire, see LT rise and a hit message; no console error | e2e (at most 10 % of assertions) | `docker compose run --rm e2e sh -lc "npm run build:e2e && npx playwright test tests/e2e/combat.spec.ts"` | Wave 0 |

### Sampling Rate
- **Per task commit:** targeted `vitest run` of the touched files, plus `lint` and `typecheck` for pure `src/sim` work (AGENTS.md gate choice; the owner's note: skip `verify` for pure-logic plans).
- **Per wave merge:** `docker compose run --rm test` (coverage floors apply), `lint`, `typecheck`, `assets:check` when content changed.
- **Phase gate:** `verify` green (browser-facing code is touched); `verify-full` only if the owner confirms the step-6/9 decision recorded in memory. Full suite green before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `tests/sim/combat/{constants,weapons,shields,octree,hit,dock-reset}.test.ts`: new
- [ ] `tests/content/hulls.test.ts` and `tests/golden/content/hulls.json`: new artifact and golden
- [ ] `tests/persistence/save-v4.test.ts`, goldens `tests/golden/save/v4-from-v3-*.json`
- [ ] `tests/e2e/combat.spec.ts`: opt-in smoke, traffic off by default
- [ ] regenerate `tests/golden/world/inert-lave-epoch1.json` and the NPC record golden once, deliberately; never `flight-hash-pins.json`
- [ ] update pinned tests: `tests/sim/world/control.test.ts` (ShipControl member set), `tests/e2e/probe-shape.spec.ts` fixture, `tests/ui/hud-model.test.ts`, `tests/contract/fidelity.test.ts` (new FIDELITY rows with verbatim excerpts at the pinned commit)
- [ ] Framework install: none

## Security Domain

`security_enforcement` is on (ASVS level 1, block on high).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | no accounts |
| V3 Session Management | no | static client |
| V4 Access Control | no | single local player |
| V5 Input Validation | yes | zod strict schemas for the hull artifact and save v4; action-id and key allow-lists for settings; `LASER_FIT_KEYS` x `FACINGS` allow-list for purchases |
| V6 Cryptography | no | none used |
| V12 Files and Resources | yes | depth and node-count caps on the octree JSON; same-origin lazy chunk via `import.meta.glob`, as `ships-npc.ts`, so the existing CSP and content-boundary guards apply unchanged |
| V14 Configuration | yes | no new network surface; no new package |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Tampered localStorage settings (unknown action, huge arrays) | Tampering | existing strict `parseSettings`; the migration only rewrites exact legacy defaults |
| Tampered save carrying a forged laser mount or laser key in `equipment` | Tampering | v4 strict enum for mounts; reject laser keys in `equipment`; shared semantic validator on read and write |
| Oversized or deeply nested octree JSON causing stack exhaustion or slow load | Denial of service | schema caps depth at 7 and nodes per hull, parse once, validate before use |
| NaN or Infinity damage or energy corrupting the hash | Tampering | `sanitizeCombat`, `sanitizeEntity` extension, finite checks in `routeDamage` |
| Test hook granting weapons or energy that becomes durable | Elevation of privilege | any hook mutation must set `testTainted` (existing rule); autosave already refuses a tainted session |
| Fire command forged by an AI for another actor | Spoofing | `createShipControl.actor(id)` already ignores calls not addressed to the actor; `fire` follows the same guard |

## Project Constraints (from CLAUDE.md and AGENTS.md)

- Everything runs in Docker; a green host run is not evidence. Use `docker compose run --rm test`, targeted `... test npx vitest run <file>`, `e2e`, `typecheck`, `lint`, `verify`, `verify-full` as listed in AGENTS.md; scratch files live under `/tmp` and are mounted, never added to the repo.
- Simulation under `src/sim/` is pure TypeScript: no Three.js, no DOM, no `Date`, no `Math.random`, no `for..in`, no bare `.sort()` (lint bans); fixed-step, deterministic.
- Content is compiled from Oolite configs at build time; never hand-edit generated files; run `docker compose run --rm assets` and `assets:check`; new data keeps the strict schema, golden and drift gate.
- GPL-2.0-or-later code; Oolite-derived data stays CC BY-NC-SA 3.0; the hull octrees are derived from vendored `.dat` files already in `ASSETS.md`/`NOTICE`, so no new asset provenance row beyond noting the derived artifact. Read behaviour from the Oolite checkout, consume data from `third_party/oolite/` and keep `CHECKSUMS.sha256` honest.
- No database; saves stay in IndexedDB; no OXP support.
- Record significant decisions in `PROJECT.md` Key Decisions; all documentation in English; `CHANGELOG.md` `[Unreleased]` entries in the same commit as each user-visible change.
- Subagent prompts must carry the codebase-memory instruction, the `rg` preference, the Oolite checkout path and the Docker-only brief.
- Work starts through a GSD command; this research is read-only except this file.

## Sources

### Primary (HIGH confidence)
- Oolite checkout `/home/opencode/git/oolite`, pinned commit `7437f22`: `src/Core/Entities/PlayerEntity.m`, `ShipEntity.m`, `ShipEntity.h`, `PlayerEntity.h`, `Entity.h`, `OOLaserShotEntity.m`, `src/Core/Universe.m`, `src/Core/Octree.m`, `src/Core/OOVoxel.m`, `src/Core/HeadUpDisplay.m`, `src/Core/OOEquipmentType.m`, `Resources/Config/equipment.plist`, `shipdata.plist`, `shipyard.plist`, `keyconfig2.plist`, `descriptions.plist`, `hud.plist`, `global-settings.plist`; `PlayerEntityControls.m` read at the pinned commit through `git show`
- Repository files read this session: `src/sim/{sim,commands,events,state,time}.ts`, `src/sim/flight/{state,step,controller}.ts`, `src/sim/world/{world,entity,control,control-impl,step,serialize,ship-field,sanitize,limits,ids,view}.ts`, `src/sim/ai/{types,pilots/test-pilot}.ts`, `src/sim/player/{profile,outfitting}.ts`, `src/persistence/save.ts`, `src/input/{actions,bindings,keyboard}.ts`, `src/settings/{schema,store}.ts`, `src/app/session/{sim-driver,step-options,world-lifecycle,hyperspace-controller,event-router,render-driver,traffic,probe-publisher,context}.ts`, `src/app/hud-model.ts`, `src/render/hud/{draw,hud,messages}.ts`, `src/render/launch-camera.ts`, `src/content/{ships-npc,equipment}.ts`, `src/content/schemas/{equipment,ship-npc}.ts`, `tools/oolite-ingest/{generate.ts,convert/octree.ts,convert/ship-mass.ts,convert/npc-ships.ts,convert/glb.ts}`, `package.json`, `vitest.config.ts`, `eslint.config.js`, `.planning/{PROJECT,REQUIREMENTS,STATE,ROADMAP}.md`, `.planning/research/PITFALLS.md`, the WR-01 todo
- Measurement run in the `test` container this session: octree node counts and encoded sizes for the ten hulls (scratch script under the session scratchpad, not in the repo)

### Secondary (MEDIUM confidence)
- none; no web source was needed, the phase is a port from a local checkout

### Tertiary (LOW confidence)
- none

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH, nothing new is installed.
- Oolite constants and algorithms: HIGH, read from source with line numbers; line numbers verified against the pinned commit.
- Architecture (where combat state lives, damage timing, entity fields): MEDIUM, recommendations with stated alternatives (A6, A7).
- Pitfalls: HIGH for the repo-specific ones (settings persistence, Escape machinery, goldens, save chain), read directly from code.

**Research date:** 2026-11-14
**Valid until:** 2026-12-14 (stable; the pin is fixed, the repo moves only through Phase 14 in parallel)
