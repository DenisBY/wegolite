# Phase 15: Damage Ledger and Kills - Research

**Researched:** 2026-11-16
**Domain:** Deterministic fixed-step simulation (TypeScript, `src/sim/`), snapshot/hash format, content build pipeline (`tools/oolite-ingest`), Oolite fidelity of kills
**Confidence:** HIGH for the in-tree integration points and the Oolite rules (every one read this session); MEDIUM for two design choices that CONTEXT.md leaves open (cargo formula by role, killer credit in a mutual kill); one gap in the locked field set is flagged (Open Question 1).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Debris motion and lifetime (decided in the first plan's field design, so no later bump)**
- **D-01:** Debris (cargo, wreckage) moves by a **velocity vector** held on the entity, independent of its orientation, as in Oolite (drift is separate from tumble). The vector is a new hashed field, pristine-omit (absent for every entity that has none). Bounds live in `limits.ts` only. — **Reversibility:** one-way — a hashed field in snapshot v4; changing it later is a second bump and golden regeneration.
- **D-02:** Wreckage and pod lifetime is held in the existing `Entity.energy` (it decreases per tick; at zero the entity leaves through the same kill path), as in Oolite. No separate lifetime field. — **Reversibility:** one-way — same reason; the field set is frozen by v4.
- **D-03:** Tumble stays a render-side cosmetic derived from entity id and flight time unless a later phase needs it in the sim; the orientation field is free for it.

**Events and AI notification**
- **D-04:** On a kill, the killer gets `shipTargetDestroyed` (plus `shipKilledOther` when the killer is an NPC), and every ship that had the victim as its target gets `shipTargetLost`. Nobody else is notified. All are delivered by the immediate drain before the tick ends (`drainAiEventsNow`); the queue is empty at the boundary. A dead or missing killer is tolerated (`killer = NO_ENTITY`).
- **D-05:** The payloads stay as they are: `shipDestroyed { id, position, radius, specKey, killer }` unchanged, `identLost` without a payload (same message as leaving scanner range), `entityRemoved { id }` one per committed removal. No `cause`/`reason` fields now; Phase 20 adds `cause` to `playerDestroyed` when it needs it. The closed sets (event router table, probe shape) still change by design for the new emissions; amend them and say why.

**Entity fields and NPC record (one v4 bump)**
- **D-06:** Cargo on an NPC is a **capsule count only** (one number, chosen at spawn from `likely_cargo`/`max_cargo`). The commodity of each capsule is drawn at the moment of the explosion from the ship's own `combat` stream (Phase 16).
- **D-07:** The weapon field holds **weapon temperature and the integer tick of the last shot** (the whole Oolite fire-gate state; `shot_time` is quantised to ticks, never frame time). It does not live in Phase 14's frozen steering record. Everything else the gate needs is derived from the current tick.
- **D-08:** Static health is a per-world `staticHealth` for the station and the buoys (buoy 250 energy, station 25000 that only absorbs), hashed only when non-pristine. Phase 15 introduces the field and its hash segment; Phase 18 consumes it.
- **D-09:** Worlds that never fire, carry cargo or take damage hash as before (pristine-omit). Proof: strip the new segment and the new golden re-hashes to the old one; the hash replays equal at 30, 60 and 144 Hz. Phase 14's frozen steering record gets its third owner-chosen regeneration, recorded in PROJECT.md Key Decisions.
- **D-10:** The NPC record gains weapon facings (forward, aft, port, starboard weapon and position, extending the existing `forwardWeapon`/`forwardWeaponPosition`), `likely_cargo`, `max_cargo`, `fragment_chance` and `explosion_type`, compiled from Oolite's `shipdata.plist` with `like_ship` resolved and with provenance, behind the strict schema, the golden and the content drift gate. Do not hand-edit generated data.

**Existing tests that encode "nothing is destroyed"**
- **D-11:** The first plan lists every test and golden that encodes the old rule (energy floors at zero and the ship stays; known sites: `tests/sim/combat/{step,weapons,npc-fire,shields}.test.ts`, `tests/ui/hud-model.test.ts`, probe-shape fixtures, world step/cadence tests) with the reason for each amendment. Each is amended in the plan that changes the behaviour. No piecemeal fixing by red runs.

**Fixed by the roadmap and owner decisions (not re-asked)**
- **D-12:** One damage ledger applied after the world step; second `commitWorld`; idempotent `killShip`; a property test over random fights proves a kill on the spawn tick, a mutual kill and a repeated kill request each leave a round-tripping snapshot.
- **D-13:** The player's energy still floors at zero until Phase 20; the station and the player are never removed by this path.
- **D-14:** NPC fire comes only from the engine and test pilots; the phase is verified with the player's laser and the test shooter.
- **D-15:** New code is total (outside AI fault containment): no function may throw on any world state.

### Claude's Discretion
- Exact field names, segment labels and bounds in `limits.ts`.
- Plan split, the exact ledger record shape and the order of ascending-id resolution.
- How the player's-target `shipTargetLost` interacts with the ident lock message wording (app owns wording).

### Deferred Ideas (OUT OF SCOPE)
- Explosion, alloy plates, pods, wreckage, entity-cap policy, debris models: Phase 16.
- NPC fire gate, hits on the player: Phase 17.
- Station and buoy hits, collisions: Phase 18.
- `cause` on `playerDestroyed`: Phase 20.
- Reviewed todos not folded: `2026-11-15-lasers-and-ident-hit-stations-and-buoys`, `2026-11-14-make-buoys-block-hyperspace-like-oolite` (Phase 18); `2026-11-16-phase-14-review-followups` (acceptance-in-CI and detector changes need the owner's trailer; not this phase); `2026-11-10-add-planet-and-sun-collision`, terminal palette, cost-basis, CI timeout margins, measure-oolite-in-docker (unrelated or later).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FOUND-18 | All new hashed entity fields (weapon state, cargo, static health, debris motion) arrive in one snapshot v4 bump with one golden regeneration and a strip-and-rehash proof; existing worlds hash pristine-omit. | "Recommended design: the one v4 field set" (fields, labelled segments, parser keys, bounds), "Common Pitfalls" 1-3, "Validation Architecture" (strip proof, 30/60/144). |
| FOUND-19 | All damage goes through one ledger applied after the world step; the tick boundary never holds a dead entity or a queued AI event (second commit, idempotent `killShip`). | "Recommended design: ledger, kill path, second commit, immediate drain", tick order, pitfalls 4-8, property test spec. |
| DATA-14 | The NPC record carries weapon facings, `likely_cargo`, `max_cargo`, `fragment_chance` and `explosion_type`, compiled from Oolite with provenance. | "Content pipeline" section: exact values for the nine records with `shipdata.plist` line numbers, defaults, schema/compiler/golden/drift-gate change list. |
| QUAL-11 (standing gate) | Kills deterministic: hash equal at 30/60/144 Hz; frozen 20-seed acceptance stays 21 of 21 after every plan touching `src/sim/npc/**`, `src/sim/world/**` or `ships-npc.json`. | "Validation Architecture", plan-split advice (which plans trigger the by-hand run). |
</phase_requirements>

## Summary

The tree is ready for this phase and no new technology is needed. The shape of the work is: (1) widen `Entity` by three always-present, pristine-omitted fields plus one world-level record, with labelled hash segments appended after `;steer:`, one `WORLD_SNAPSHOT_VERSION` 3 to 4 bump, parser keys and `limits.ts` bounds; (2) compile the five new NPC record families from the already-resolved `extras` of `shipdata.plist`; (3) turn `resolveShotHits` into a record producer, add a ledger that applies records and finds lethal ones, one idempotent kill function, an exported `drainAiEventsNow`, and a second `commitWorld` before `updateIdentTarget`.

Three findings change how the plans should be cut. First, because pristine-omit makes every entity without cargo hash exactly as before, the Lave golden moves **only** because the populator now gives some ships a capsule count; the cargo count must therefore be derived statelessly (not from `world.rng` or the entity's `combat` stream) or the strip-and-rehash proof to `c1068643` fails. Second, the closed sets D-05 expects to change do **not** need to change for the emissions Phase 15 produces: `identLost` is already routed to `hudMessages` and prints "Target lost.", and `shipDestroyed`/`entityRemoved` are reserved kinds that are unrouted by design until Phase 16, so the router table and probe shape can stay as they are (say so in the Key Decisions row rather than editing them). Third, the field set locked by D-07 omits Oolite's `_missed_shots` counter, which feeds the NPC aim tolerance for every ship whose accuracy is at least 0 (most of them); Phase 17 cannot port `onTarget` faithfully without it, and a later field means a fourth bump (Open Question 1, needs an owner decision before plan 1 is written).

**Primary recommendation:** Cut four plans in this order: (A) content record, DATA-14 (schema, compiler, hand-written golden, regenerated JSON, NOTICE); (B) the one entity-field design with the single Lave golden regeneration (needs A for cargo); (C) ledger + `killShip` + `drainAiEventsNow` + second commit + the amended old pins; (D) the random-fight property test, the kill cadence scenario and the Key Decisions/CHANGELOG record. Plans A, B and C each end with the by-hand 20-seed acceptance run (21 of 21) recorded in their SUMMARY; the router table and probe shape stay unchanged.

## Project Constraints (from AGENTS.md)

No `./CLAUDE.md` exists in the repository; the equivalent is `AGENTS.md` (read this session). Directives the plans must honour:
- Tests and builds run in Docker only; a green host run is not evidence. Commands: `docker compose run --rm test`, `docker compose run --rm test npx vitest run <file>`, `docker compose run --rm typecheck`, `docker compose run --rm lint`, `docker compose run --rm assets npm run assets:check`, `docker compose run --rm verify`. Scratch scripts live under `/tmp` and are mounted with `-v /tmp/<dir>:/scratch`, never added to the repository.
- Gate by change type: pure `src/sim/` plans need `test`, `lint`, `typecheck`; any edit under `src/app/` (for example `src/app/session/traffic.ts` when `InertShipRecord` gains cargo fields) needs `verify`. The owner runs `verify` on the remote test machine (memory: `reference-remote-test-machine`).
- The sim never imports Three.js or the DOM; deterministic, fixed-step. Content data is compiled, never hand-edited. Bounds in `limits.ts` only.
- 20-seed acceptance run by hand after any change under `src/sim/npc/**`, `src/sim/world/**` or `ships-npc.json`; thresholds and detectors frozen (owner trailer `Detector-change-approved-by-owner`).
- Record significant decisions in `.planning/PROJECT.md` Key Decisions; user-visible change goes under `## [Unreleased]` in `CHANGELOG.md` in the same commit; all documentation in English.
- Do not add dependencies. No database. Licensing: no new asset is added in this phase (provenance is the NOTICE paragraph for `ships-npc.json`).
- GSD workflow enforcement: file changes start through a GSD command.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Damage ledger, lethal detection, kill path | Simulation (`src/sim/combat/`, `src/sim/world/`) | none | Pure, deterministic, id-scoped; the app never sees ids. |
| Entity fields, hash segments, snapshot v4, sanitiser, bounds | Simulation (`src/sim/world/`) | none | Hash and snapshot are sim-owned; bounds single-sited in `limits.ts`. |
| Cargo count at spawn | Simulation (populator) | Content build (supplies `likelyCargo`, `maxCargo`) | Count is hashed state; the content only supplies the two inputs. |
| NPC record compile (facings, cargo, fragment, explosion) | Content build (`tools/oolite-ingest`) | Schema in `src/content/schemas` | Compiled at build time; sim only sees a type. |
| Record to populator mapping | App (`src/app/session/traffic.ts`) | none | Existing seam (the sim cannot import content); a one-line map per new field. |
| "Target lost." message on a destroyed lock | App (`hudMessages`, already routed) | Simulation emits `identLost` | App owns wording; no change needed. |
| Entity removal from 3D view and scanner | Render/HUD read `npcContacts` each frame | Simulation commit | Contacts are rebuilt per frame from live non-dead ships; removal is automatic. |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | 6.0.2 | Sim code | [VERIFIED: package.json] pinned; no change. |
| Vitest | 5.0.5 | Unit, property, cadence tests | [VERIFIED: package.json] existing runner; coverage thresholds on `src/sim/**`. |
| fast-check | 4.10.2 | Property test over random fights; sanitiser/parser agreement | [VERIFIED: package.json] already used by `snapshot-codec.test.ts`. |
| zod | 4.6.7 | Strict NPC record schema | [VERIFIED: package.json] `z.strictObject` already in `ship-npc.ts`. |

### Supporting
None. No new package, no Docker image change, no `docker compose down --volumes` needed (no `package.json` change).

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Stateless cargo-count derivation via a new `forkSeed` purpose `"cargo"` | `mix32(forkSeed(..., "combat"), SALT)` | Same effect without touching `RNG_PURPOSE_CODES`; the existing comment in `rng.ts` anticipates new purposes, so adding code 4 is the sanctioned route, and `tests/sim/rng.test.ts:195` pin is amended. |
| One `Entity.weapon` object | Three flat fields | Object keeps one hash segment and one parser sub-record; flat fields add three parser keys. |

**Installation:** none.

## Package Legitimacy Audit

No external package is installed or changed in this phase, so no `package-legitimacy check` was run.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| (none) | - | - | - | - | - | No install |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram (tick, new order)

```
stepSim(player, world, layout, config, intent, commands, dt, options, combat)
 |
 1 stepFlight ........................ flight events (docked, launched, hyperspaceJumped...)
 2 stepPlayerCombat (if combat) ...... fire key -> ShotRequest[], cooling, ident commands
 3 stepWorld (launching|inFlight, no hyperspaceJumped)
 |    update(steer) -> drain(AI) -> think -> drain(AI) -> tracking -> proximity -> sanitize
 |    -> commitWorld #1  --> entityRemoved events (externally killed, e.g. sanitiser)
 |    (queue empty, no dead entity here)
 4 resolveShots  (becomes the combat resolution tail; NOT gated on `combat`)
 |    a. drainFireQueue + rechargeShips (N1)            [unchanged, before any damage]
 |    b. firstShipHit per shot -> laserFired events + HitRecord[]   (resolveShotHits no longer applies)
 |    c. LEDGER apply: records in queue order (ascending shooter id)
 |         player target -> routeDamage (shield then energy, floor 0, D-13)   [also when world not stepped]
 |         NPC target    -> energy -= amount (local arithmetic), shipHit event per record
 |         then, after ALL records: lethal set = NPC with energy <= 0, killer = first lethal record's source
 |    d. killShip per victim, ascending id: store.kill, shipDestroyed, post AI events
 |         (shipTargetLost to holders of nav.targetId === victim; shipTargetDestroyed + shipKilledOther to a live NPC killer)
 |    e. drainAiEventsNow(world, player, layout, tick, events)  -> aiQueue empty; then fireQueue.length = 0
 |    f. commitWorld #2 -> entityRemoved events (ascending)
 |    g. updateIdentTarget (after the commit) -> identLost / identLocked
 v
events: flight, combat pre-world, world, laserFired*, shipHit*, shipDestroyed*, entityRemoved*, ident*
```
Jump step (`hyperspaceJumped`): the world is not stepped, so steps 4c (NPC part) to 4f are skipped exactly as `resolveShotHits` skips NPC targets today (`worldStepped` guard); the player-target branch keeps its current conditions.

### Verified current shape (read this session)

**Entity** (`src/sim/world/entity.ts:35-67`): `readonly id`, `readonly kind`, `dead`, `position`, `orientation`, `radius`, `speed`, `scanClass`, `specKey`, `ownerId`, `spawnTick`, `rng: EntityStreams`, `nav`, `ai`, `repairs`, `energy`, `maxEnergy`, `energyRechargeRate`, `steer`. [VERIFIED: entity.ts:35-67]. Entities are built in exactly two places: `spawnEntity`'s `make` callback (`world.ts:448-491`, ends `steer: createSteerComponent(init.escortSlot ?? 0),`) and `restoreWorld` (`snapshot.ts:1111-1131`, ends `steer: e.steer,`) [VERIFIED].

**Hash** (`serialize.ts:127-151`): the entity line is `[...].join(";")` ending with the two lines
`` `en:${canon(entity.energy)},${canon(entity.maxEnergy)},${canon(entity.energyRechargeRate)}`, `` and `` `steer:${serializeSteer(entity.steer)}`, `` [VERIFIED]. `serializeSteer` text contains no `;` (comment at `serialize.ts:102`: "The text holds no `;`, so the segment ends at the next line.") [VERIFIED]. `hashWorld` (`serialize.ts:197-210`) is `serializeFlight(player)` + `\n` + world section when present, then the combat line when non-pristine [VERIFIED]. `serializeWorldSection` returns `""` while `isNeverSpawned(world)` (`serialize.ts:160`) [VERIFIED].

**The `;steer:` strip pattern** (the template for the new proof): `tests/sim/world/populate.test.ts:507` is `golden.section.replace(/;steer:[^;\n]*/g, "")` and `:509` expects `"ab72eedf"`; `:518-522` strips `;steer:` and `/;en:[0-9.,]+/g` and expects `"b23d11d8"` [VERIFIED]. The current golden is `"fnv": "c1068643"`, 12 ships, `nextId=113` [VERIFIED: tests/golden/world/inert-lave-epoch1.json, populate.test.ts:487-498].

**Snapshot** (`snapshot.ts`): `export const WORLD_SNAPSHOT_VERSION = 3;` (line 80); `EntitySnapshot` lines 141-160; `snapshotWorld` refuses with `"uncommitted"` (439-445) and `"queue-not-empty"` for `aiQueue` (446-451) and `fireQueue` (452-457); `parseEntity` (930-1021) lists the allowed keys (`"id"` ... `"steer"`) and `parseWorldSnapshot` (1028-1098) lists the root keys (`"format","version","worldSeed","nextId","rng","aiDropped","entities"`); `restoreWorld` (1109-1140) [VERIFIED]. World snapshots are used only by tests today (`rg` over `src` finds no app caller); saves store the world anchor, not a snapshot, so the bump has no save consequence [VERIFIED: rg this session].

**Bounds** (`limits.ts`): single definition site; pattern "far above every Oolite value, only keeps a corrupt value out of the hash; changing it is a snapshot-format change" (for example `MAX_STEER_RATE = 1e3`, `MAX_FRUSTRATION = 1e6`, `MAX_ESCORT_SLOT = 15`) [VERIFIED: limits.ts:56-118].

**Sanitiser** (`sanitize.ts:559-666`): counts `repairs` per call that repaired anything; `cleanEnergy` turns a negative energy into 0 **as a repair**; pristine in-domain values must never count (the acceptance run requires `repairs 0`) [VERIFIED].

**Store** (`store.ts:108-128`): `kill(id)` returns false for missing or already-dead (idempotent), `commit()` removes dead and returns ascending ids [VERIFIED]. `store.get` returns undefined for dead entities (`store.ts:92-97`) [VERIFIED].

**World** (`world.ts:102-126`): `aiQueue`, `fireQueue`, `aiDropped`; `postAiEvent` ignores malformed events and drops when the queue holds `MAX_AI_QUEUE_LENGTH` (4096) [VERIFIED].

**World step** (`world/step.ts`): ends with `for (const id of commitWorld(world)) events.push({ kind: "entityRemoved", id });` (162-165). `drainAiEvents` (258-279) is private: passes of at most `MAX_AI_EVENT_PASSES` (8) and `MAX_AI_EVENTS_PER_DRAIN` (4096), then drops the rest into `aiDropped`; `deliverAiEvent` (282-297) returns early when `world.store.get(event.to)` is undefined, i.e. events to a dead or missing entity are skipped [VERIFIED]. The `invoke` containment point is the only try/catch.

**sim.ts** (`stepSim`, 59-124): `resolveShots(world, worldStepped, player, combat, shots, options, dt)` is the last call (line 121); `layout` and `AI_REGISTRY` are already in scope there [VERIFIED]. `resolveShots` has exactly one production caller and one test caller (`tests/sim/combat/ident.test.ts:473`) [VERIFIED: rg].

**Combat** (`combat/step.ts`): the floor that D-11 supersedes is `entity.energy = Math.max(0, before - hit.amount);` (line 344). The shot records already exist as `HitRecord { target, source, amount, sourcePosition }` (75-81), applied "in queue order" after every shot is resolved (322-352); queue order is ascending shooter id via `all.sort(byShooter)` (298). `rechargeShips` runs before hits apply (268) [VERIFIED]. NPC hit targets are only `entity.kind === "ship"` (286-287), so the station, buoys and non-ship kinds are never ledger targets [VERIFIED].

**Ident** (`combat/ident.ts:188-215`): `updateIdentTarget` drops a lock whose `world.store.get` fails and emits `identLost` only `if (combat.identEngaged)`; it runs only when `combat !== undefined` and the world stepped (`step.ts:382-384`) [VERIFIED]. Run after the second commit, a destroyed target is dropped on the same tick with no ident change.

**Events** (`events.ts`): `shipDestroyed { id, position, radius, specKey, killer }` with comment "`NO_ENTITY` when nothing is credited" (138-146), `entityRemoved { id }`, `identLost` with no payload (131); `RESERVED_EVENT_KINDS` pins 15 kinds including `shipDestroyed` and `entityRemoved` (205-221) [VERIFIED]. AI event names `shipTargetLost`, `shipTargetDestroyed`, `shipKilledOther` already exist in `AI_EVENT_NAMES` (`ai/types.ts:60-62`) [VERIFIED]. `AiEvent` is `{ to, name, a?, b?, n? }` (`ai/types.ts:83-89`).

**Router** (`event-router.ts`): `ROUTED_EVENT_KINDS` has 21 kinds including `"identLost"` (line 85) mapped to `["hudMessages"]` (118); the handler is `throttled("identLost", () => "Target lost.");` (385-386). `shipDestroyed` and `entityRemoved` are not routed; `tests/app/session-order.test.ts:870-949` ("reserved kinds pass through") asserts they are ignored without throwing [VERIFIED]. **Consequence: no router-table, subscriber-order or probe-shape edit is required by Phase 15's emissions.** Record this in the Key Decisions row (D-05 anticipated a change; the tree shows none is needed). Phase 16 routes `shipDestroyed` for the explosion effect.

**Who holds a target:** steering keeps the target as `entity.nav.targetId` and treats an id the view no longer returns as a lost target (`npc/target.ts:11-17`, `targetBody`, and `noteLostTargetAndGoIdle` at 148-166 posting `{ name: "shipTargetLost" }` with no `a` for a gone target) [VERIFIED]. The test pilot has no `onEvent`; the flight-script `onEvent` handles `shipTargetLost` by `finish(ctx)` (`flight-script.ts:271-283`) [VERIFIED].

**Tick numbering:** `state.tick += 1;` is the last statement of `stepFlight` (`flight/step.ts:390`) and the world step reads `player.tick` afterwards, so the first world tick is 1 and a `lastShotTick` of 0 can mean "never fired" [VERIFIED: flight/step.ts:390, world/step.ts:85].

### Recommended design

#### 1. The one v4 field set (names are proposals; discretion per CONTEXT)

| Field | Where | Default (pristine) | Hash text when non-pristine | Bound (in `limits.ts`) |
|-------|-------|--------------------|------------------------------|------------------------|
| `Entity.velocity: Vec3` (D-01) | entity | `{0,0,0}` | `;vel:x,y,z` (canon each) | per-component magnitude, proposal `1e4` m/s (fastest authored hull `max_flight_speed` is 1000, see below) |
| `Entity.weapon: { temperature, lastShotTick }` (D-07) | entity | `0, 0` (0 = never fired) | `;wpn:<canon(temperature)>,<int(lastShotTick)>` | temperature proposal `1e3` (Oolite `NPC_MAX_WEAPON_TEMP` is 256; no laser adds more than 10 per shot); tick uint32 |
| `Entity.cargo: number` (D-06) | entity | `0` | `;cargo:<int>` | integer `0..200` (Oolite caps a spawned hold at 200: `if (num > 200) {`, ShipEntity.m:7337) |
| `World.staticHealth` (D-08) | world | each static at its maximum | one extra line `statics:...` appended by `hashWorld` after the world section, before the combat line | `0..MAX_STATIC_ENERGY` |

Rules that make this safe:
- **Always-present on the typed `Entity`**, pristine-omit only in the hash text. Sanitiser and parser then need no existence branches (totality, D-15). The snapshot keeps the keys always present (canonical form, exact round trip); only `hashWorld` omits.
- **Segment order after `;steer:`:** `;vel:`, `;wpn:`, `;cargo:`. Every segment is labelled and `;`-free, so each is strippable by `/;(?:vel|wpn|cargo):[^;\n]*/g`. A pristine entity line is byte-identical to today's, which is why `tests/sim/world/sanitize.test.ts:1094-1101` ("the steering segment is the last ... segment") still holds for a fresh entity (rename its title to say "of a pristine entity").
- **`staticHealth` is printed by `hashWorld`, not `serializeWorldSection`.** Statics are not in the store, so `isNeverSpawned` stays true in a traffic-off world and the world section would be empty while a buoy is damaged (Phase 18). A separate appended line keeps the golden `section` text untouched. Store remaining energy per static keyed `station`, `witchpoint`, `navBuoy` (the `StaticLayoutKey` names that matter), with maxima 25000, 250 and 250 as named sim constants citing `shipdata.plist` (station `max_energy = 25000` at line 1732 with `energy_recharge_rate = 100` at 1695; buoy template `energy_recharge_rate = 2`, `max_energy = 250`) [VERIFIED: shipdata.plist lines 1011-1021 and 1695/1732 via rg and Read this session]. Pristine = all at maximum; Phase 18 adds recharge and damage.
- **Snapshot v4:** `WORLD_SNAPSHOT_VERSION = 4`; add `velocity`, `weapon`, `cargo` to the `parseEntity` allowed-key list and `staticHealth` to the root list; refuse any version other than 4 (a v3 snapshot is refused, as v2 is today, `snapshot-codec.test.ts:1011-1015`).
- **Sanitiser:** add the three entity fields beside `cleanEnergy`; an in-domain value must never count as a repair. Do not leave a survivor with negative energy (see Pitfall 7).
- **Snapshot and sanitiser agreement:** the existing property `"sanitizer and parser agree across every entity leaf"` (`snapshot-codec.test.ts:1940-2105`, `numRuns: 300`) needs the new leaves in `fieldsArb` and `applyFields`.

**D-02 is already satisfied by existing machinery:** `cleanEnergy` allows `0..maxEnergy` and `maxEnergy <= MAX_ENTITY_ENERGY` (1e6); a wreck with lifetime L spawns with `maxEnergy = energy = L`. Note `rechargeShips` only touches `kind === "ship"` (`combat/step.ts:225`), so debris energy never recharges [VERIFIED].

#### 2. Cargo count at spawn (D-06) and the golden

- `InertShipRecord` (`populate.ts:61-70`) gains `likelyCargo` and `maxCargo`; `PlannedShip` already carries `role` (`populate.ts:189-199`). The count is computed in `populateInertWorld` after the plan and passed to `spawnEntity` through a new optional `SpawnInit.cargo`.
- **The draw must not advance any hashed stream.** If it came from `world.rng`, the `rng=` header line and every later placement move; from `entity.rng.combat`, the `rng:` segment moves. Either breaks "strip the new segments and re-hash to `c1068643`". Derive it statelessly: `createRngState(forkSeed(world.worldSeed, world.store.nextId, "cargo"))` evaluated before `spawnEntity` (id is `nextId`), with `"cargo"` added to `RNG_PURPOSE_CODES` as code 4 and `ENTITY_RNG_PURPOSES` left as `["ai","combat"]` (it lists stored streams only). Pin test `tests/sim/rng.test.ts:195` (`{ world: 1, ai: 2, combat: 3 }`) is amended; the file's own comment says new purposes cannot renumber others.
- **Formula (a faithful port, recommended):** Oolite's `setCargoFlag:` computes `num = likely_cargo * (0.5 + randf())` when `likely_cargo > 0`, capped at `maxAvailableCargoSpace`, else `maxAvailableCargoSpace` (= `max_cargo - equipment_weight`, equipment weight 0 for these ships: `equipment.plist` has no `required_cargo_space` key), then caps at 200 [VERIFIED: ShipEntity.m:7328-7343, 7198-7201; rg of equipment.plist]. The flag is role-driven: trader `CARGO_FLAG_FULL_SCARCE` (`Universe.m:2538`), pirate `CARGO_FLAG_PIRATE` (`:2554`) which draws `Ranrot() % (1 + num / 2)` (`ShipEntity.m:7362`), shuttle launched from a station `CARGO_FLAG_FULL_SCARCE` (`StationEntity.m:1629`); other populator roles (hunter, police, scavenger) set no flag, so 0. Port: trader and shuttle `= num`; pirate `= floor(draw * (1 + floor(num / 2)))`; others 0. Sidewinder and Viper author neither key, so `num = max_cargo = 0` and they carry 0. With the Lave golden's roles (traders 101-103, pirates 106-108, shuttle 111) roughly half the ships carry cargo, which gives a mixed golden (some `;cargo:` segments, some pristine) and so a real test of pristine-omit.
- `Entity.cargo` is created at spawn only; nothing in Phase 15 reads it (Phase 16 does).
- Content-to-sim map: `src/app/session/traffic.ts:70-77` builds `InertShipRecord` from `NpcShip`; add the two fields there (this is an `src/app` edit, so that plan needs `verify`). The six test-side builders to update are `tests/helpers/inert-world.ts`, `tests/helpers/flyer-records.ts`, `tests/app/session/traffic.test.ts:48`, `tests/app/session/probe-publisher.test.ts:299`, `tests/sim/ai/test-spawn.test.ts:104`; making the two `InertShipRecord` fields optional (default 0) keeps the churn small but is not required.

#### 3. The ledger and the kill path (FOUND-19)

- **Ledger record = the existing `HitRecord`** (`combat/step.ts:75-81`). Do not add a `kind` discriminant now (Phase 18 adds scrape; owner preference is the technical minimum). `resolveShotHits` stops applying and returns `{ events, records }`; `laserFired` events keep their place.
- **Apply all records first, decide lethality after.** For an NPC target: compute `after = before - amount` in a local, write `entity.energy = Math.max(0, after)` once, emit `shipHit` for **every** record (the beam connected), and collect the victim the first time `after <= 0` with that record's `source` as credited killer. Do not call `store.get` per record after a victim is marked, and do not mark anything dead until every record has applied; this keeps "no record sees another record's effect" and gives two shooters on one victim a deterministic first-lethal credit. Never re-read `entity.energy` after the write inside the tick: `tests/sim/combat/step.test.ts:560-585` wraps `energy` in a getter/setter and asserts the final access is `write:70` (see Pitfall 6).
- **Player records** keep today's branch (`routeDamage`, floor at 0, D-13, `shipHit` with `shield`), including the existing condition that they apply even when the world was not stepped. The player and statics are never kill candidates.
- **`killShip(world, victim, killer, events): boolean`** lives in a new `src/sim/world/kill.ts` (not `combat/`), so Phase 16's debris expiry inside `stepWorld` can call it without a combat import cycle. It returns false when `store.kill` returns false (idempotent: one `shipDestroyed`, one removal). For `kind === "ship"` it emits `shipDestroyed { id, position, radius, specKey, killer }` with copies of the vectors and posts the AI events; for any other kind it only marks dead (so wreckage that reaches energy 0 leaves through the same function without a `shipDestroyed`, D-02) and the second commit reports it as `entityRemoved`.
- **Killer credit must be symmetric.** Resolve the credit **before the first kill of the pass**: `killer` is the source id when it is `PLAYER_ID` or a live ship at that moment, else `NO_ENTITY` (D-04's "dead or missing killer is tolerated"). Evaluating it lazily after earlier kills of the same pass would credit the lower-id victim's killer and not the other's in a mutual kill. Events to a killer that is itself a victim this tick are skipped by delivery (`store.get` is undefined for dead) but the `shipDestroyed.killer` payload still names it.
- **AI events (D-04), posted per victim in ascending id, via `postAiEvent`:** first `shipTargetLost` (no `a`, matching `noteLostTargetAndGoIdle` for a gone target) to every live non-victim ship whose `nav.targetId === victim`, ascending; then, when the killer is a live dynamic ship, `shipTargetDestroyed { a: victim }` and `shipKilledOther { a: victim }`; nothing is posted to the player (id 100) because it has no AI. Oolite order for the killer is `removeTarget` (lost) then `shipTargetDestroyed` (`ShipEntity.m:8806-8812`), so lost-first matches it.
- **`drainAiEventsNow(world, player, layout, tick, events, registry = AI_REGISTRY)`** is exported from `world/step.ts`; it builds the view lazily exactly as `stepWorld` does (`createWorldView(world, player, layout, PLAYER_COLLISION_RADIUS_M)`) and calls the existing private `drainAiEvents`, so the pass and budget caps and `aiDropped` accounting are inherited. After it, set `world.fireQueue.length = 0`: an `onEvent` handler may call `ctl.fire` (`control-impl.ts:122-130` pushes onto `world.fireQueue`), and the first-drain placement inside `stepWorld` relies on `resolveShots` to drain it; here nothing would, and `snapshotWorld` refuses a non-empty fire queue (`snapshot.ts:452-457`).
- **Second commit and ident:** inside `resolveShots`, after the drain: `for (const id of commitWorld(world)) events.push({ kind: "entityRemoved", id })`, then `updateIdentTarget`. Gate the NPC part and the commit on `world !== undefined && worldStepped`, **not** on `combat` (acceptance flyers and test pilots fire with `combat` undefined; `drainFireQueue` and the NPC shot path do not need it). `resolveShots` needs `layout` (and `tick`, available as `player.tick`); pass `layout` and `AI_REGISTRY` from `stepSim`. Update the one direct test caller (`ident.test.ts:473`).
- **Event order pinned for tests:** `laserFired*`, `shipHit*` (record order), `shipDestroyed*` (ascending victim), `entityRemoved*` (ascending), then `identLost`/`identLocked`.

#### 4. The kill notifications relative to Oolite (record as a divergence)

Oolite sends the killer `noteTargetDestroyed`, which acts only `if ([self primaryTarget] == target)` (`ShipEntity.m:8806-8812`); other ships that targeted the victim find out in their own next update through `noteLostTargetAndGoIdle`. D-04 is broader and earlier on both counts: the killer is told regardless of its own target, and third parties are told at kill time. Follow D-04 (locked); note in FIDELITY/Key Decisions that Oolite gates the killer's event on its primary target and tells third parties one update later. Because steering also posts `shipTargetLost` the next time a behaviour sees its target gone (`target.ts:148-166`), a holder can receive the event twice (kill time, then its next behaviour tick); Oolite's killer does too (`removeTarget` then the next `noteLostTargetAndGoIdle`). Pin that sequence in a test rather than clearing `nav.targetId` in the kill path (the kill path should not write another ship's steering state).

The player's lock needs nothing new: Oolite prints the same message for any invalid target, `[UNIVERSE addMessage:DESC(@"target-lost") forCount:3.0];` (`PlayerEntity.m:3708`), so a destroyed target reusing `identLost` is faithful.

### Recommended Project Structure
```
src/sim/world/kill.ts        # killShip (new)
src/sim/world/step.ts        # + export drainAiEventsNow
src/sim/world/{entity,world,serialize,snapshot,sanitize,limits,populate}.ts   # field set
src/sim/combat/ledger.ts     # applyLedger (new): apply records, return lethal set
src/sim/combat/step.ts       # resolveShotHits -> producer; resolveShots composes ledger, kills, drain, commit, ident
src/sim/sim.ts               # pass layout to resolveShots
src/sim/rng.ts               # + "cargo" purpose (code 4)
tools/oolite-ingest/convert/npc-ships.ts, src/content/schemas/ship-npc.ts   # DATA-14
tests/sim/combat/{ledger,kill.property}.test.ts, tests/sim/world/kill.test.ts  # new
```

### Anti-Patterns to Avoid
- **Drawing cargo from `world.rng` or `entity.rng.combat` at spawn:** moves hashed streams and defeats the strip proof.
- **Marking dead inside the apply loop and then calling `store.get`:** a second lethal record on the same victim silently loses its `shipHit` and its credit becomes order-dependent.
- **Re-reading `entity.energy` after writing it:** breaks the existing write-log test and invites a hidden second source of truth.
- **Gating the second commit on `combat`:** leaves a dead entity at the boundary for acceptance-style worlds.
- **Writing another ship's `nav`/`steer` from the kill path:** steering owns it; `refreshEscorts` is the only precedent and it is leader-to-follower.
- **Putting `killShip` in `src/sim/combat/`:** Phase 16's world-step debris expiry would import combat from world.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Marking and removing entities | A second dead flag or list | `store.kill` / `commitWorld` | Idempotent, ascending removal, already tested. |
| Event delivery | A new queue or direct handler calls | `postAiEvent` + `drainAiEvents` (via `drainAiEventsNow`) | Caps, `aiDropped` accounting, fault containment. |
| Deterministic draws | A closure generator or `Math.random` | `forkSeed` + `createRngState`/`rngNext` | FOUND-12 source scan forbids others; streams are plain data. |
| Player damage | A new shield/energy routine | `routeDamage` | Phase 13 kernel; death stays out (D-13). |
| `like_ship` resolution | A new resolver | `resolveAll` / existing `entry.extras` | Already resolves and strips; the nine records' keys are in `extras`. |
| Record validation | Hand-written checks | `z.strictObject` in `ship-npc.ts` | Rejects extra fields; the golden and drift gate depend on it. |
| Hash number formatting | `toFixed` in new code | `canon` / `int` | Banned in the sim zone except `canon`. |
| Property tests | Hand loops over seeds | `fast-check` | Shrinking; already the codec test's pattern. |

**Key insight:** every piece of machinery this phase needs exists; the work is wiring them in a fixed order and widening three data records without moving any existing text.

## Content pipeline (DATA-14)

Everything needed is already in the resolved `extras` of each of the nine entries (`like_ship` is resolved by `tools/oolite-ingest/like-ship.ts:92-109`, a shallow `{...parent, ...child}` merge) [VERIFIED]. Change list:
1. `src/content/schemas/ship-npc.ts` (strict object): add `aftWeapon`, `portWeapon`, `starboardWeapon` (the same closed enum as `forwardWeapon`), `aftWeaponPosition`, `portWeaponPosition`, `starboardWeaponPosition` (tuples of three finite numbers), `likelyCargo`, `maxCargo` (non-negative integers), `fragmentChance` (number in `0..1`), `explosionType` (`z.array(z.string().min(1)).nullable()`). Update the header comment (it states no other stat is compiled).
2. `tools/oolite-ingest/convert/npc-ships.ts`: generalise `positionExtra` to take the key name; compile each facing's type as `(weapon_facings & bit) ? read("<facing>_weapon_type", default "EQ_WEAPON_NONE") : "EQ_WEAPON_NONE"` using `FORWARD_WEAPON_KEYS`; read `likely_cargo` and `max_cargo` as unsigned ints defaulting 0 (`ShipEntity.m:566`, `:378`); `fragmentChance` default 0.9 (`ShipEntity.m:372`); `explosionType` `null` when absent. **Keep `STEERING_ASSUMED_ABSENT_KEYS`** (`npc-ships.ts:132-139`): it still guards that none of the nine authors an aft, port or starboard weapon, so all three compile to `EQ_WEAPON_NONE`.
3. `tests/golden/content/ships-npc.json` is hand-written (the converter test header says "written by hand from `shipdata.plist` and is never generated"): add the new names to `fields`, the defaults to `defaults`, the nine `examples`, and `sources` lines with `shipdata.plist` line numbers. Update `tools/oolite-ingest/convert/npc-ships.test.ts` (it compares compiled records, the golden, the resolved template parents and the committed generated file) and `tests/content/ships-npc.test.ts` ("carries the five combat fields", extra-field rejection list).
4. Regenerate `src/content/generated/ships-npc.json` and `manifest.json` through `docker compose run --rm assets`; gate with `docker compose run --rm assets npm run assets:check`. Update the `NOTICE` paragraph at lines 74-84 (it lists the fields the record derives from `shipdata.plist`); no `ASSETS.md` row exists for this file and no file is vendored (the pinned `shipdata.plist` is byte-identical to the checkout: `sha256 f4910d79...2166` for both) [VERIFIED].

Traps found while reading Oolite:
- **`explosion_type` absent is `nil`, which is not an empty array.** `explosionType = [[shipDict oo_arrayForKey:@"explosion_type" defaultValue:nil] retain];` (`ShipEntity.m:491`); in `becomeExplosion`, `if (explosionType == nil)` spawns the default cloud and flash, while an empty array spawns nothing (`ShipEntity.m:7960-7981`). None of the nine authors the key, so compile `null`, never `[]`.
- **`fragment_chance` is a probability resolved at spawn in Oolite** (`canFragment = [shipDict oo_fuzzyBooleanForKey:@"fragment_chance" defaultValue:0.9];`, `ShipEntity.m:372`; `OOFuzzyBooleanFromObject` returns `randf() < probability`, `OOCollectionExtractors.m:1143-1170`). Wegolite stores the probability in the record and Phase 16 draws it at explosion time from the ship's `combat` stream; no entity field is needed. Record this as a divergence (statistically equal, not stream-equal).
- The authored `weapon_facings` mask gates which facing types are read (`ShipEntity.m:298-306`): shuttle has 0, cobramk1 3, moray 15, the rest 1.

Values for the nine records [VERIFIED: `src/content/generated/ships.json` extras read by script; line numbers from `third_party/oolite/Config/shipdata.plist` by script this session]. Facing positions (x y z) are `weapon_position_forward`, `_aft`, `_port`, `_starboard`; none authors `aft_weapon_type`, `port_weapon_type`, `starboard_weapon_type`, `explosion_type` or `fragment_chance`:

| key | likely_cargo (line) | max_cargo (line) | weapon_facings (line) | aft | port | starboard |
|-----|---------------------|------------------|------------------------|-----|------|-----------|
| adder | 2 (125) | 5 (143) | 1 (160) | 0.0 0.0 -22.5 | -15.0 0.0 -14.5 | 15.0 0.0 -14.5 |
| cobramk1 | 10 (1524) | 10 (1542) | 3 (1559) | 0.0 0.0 -27.5 | -35.0 -1.0 0.5 | 35.0 -1.0 0.5 |
| gecko | 3 (2291) | 3 (2318) | 1 (2330) | 0.0 5.54957 -12.1558 | -13.75 -2.0625 -1.875 | 13.75 -2.0625 -1.875 |
| krait | 2 (2531) | 2 (2549) | 1 (2561) | 0.0 0.0 -34.6 | -45.0 0.0 -13.5 | 45.0 0.0 -13.5 |
| mamba | 3 (2603) | 4 (2629) | 1 (2641) | 0.0 1.5184 -30.3193 | -16.5 -3.0 0.0 | 16.5 -3.0 0.0 |
| moray | 5 (2800) | 7 (2831) | 15 (2848) | 0.0 -2.554795 -27.78225 | -30.0 -2.0 6.25 | 30.0 -2.0 6.25 |
| shuttle | absent (0) | 30 (3531) | 0 (3542) | 0.0 0.0 -17.5 | -9.0 0.0 11.5 | 9.0 0.0 11.5 |
| sidewinder | absent (0) | absent (0) | 1 (3598) | 0.0 -6.5 -17.5 | -24.25 0.0 0.0 | 24.25 0.0 0.0 |
| viper | absent (0) | absent (0) | 1 (3963) | 0.0 0.0 -27.5 | -12.5 0.0 0.0 | 12.5 0.0 0.0 |

Template line numbers for the position keys follow the `weapon_facings` line (aft first, then forward, port, starboard: for adder 161-164, cobramk1 1560-1563, gecko 2331-2334, krait 2562-2565, mamba 2642-2645, moray 2849-2852, shuttle 3543-3546, sidewinder 3599-3602, viper 3964-3967). `weapon_position_forward` values already compiled in the record are unchanged; the shuttle's forward value is authored `"-0.0 -1.67 27.4"` and the existing converter normalises negative zero.

Debris constants needed later (do not compile now): the largest `max_flight_speed` in the catalogue is 1000 (`rg` over `shipdata.plist`), which is the basis of the proposed `1e4` velocity bound.

## Common Pitfalls

### Pitfall 1: The strip proof moves because the cargo draw touched a hashed stream
**What goes wrong:** the new golden does not re-hash to `c1068643` after stripping `;vel:`, `;wpn:`, `;cargo:`; the diff shows `rng=` or an `rng:` field changed.
**Why:** the populator and `spawnEntity` thread `world.rng` and per-entity streams, all hashed.
**How to avoid:** stateless derivation (section 2). **Warning signs:** `golden.section` header line differs from the committed one, not only the segments.

### Pitfall 2: Existing "strip" tests no longer strip enough
**What goes wrong:** `populate.test.ts:507-509` (`/;steer:[^;\n]*/g` then `"ab72eedf"`) and `:518-522` (`"b23d11d8"`) fail because `;cargo:N` survives the regex.
**How to avoid:** add the new labels to both regexes in the same plan that regenerates the golden, and add the third chain link (strip new, expect `"c1068643"`). Do not regenerate to make a test pass (`write-inert-world-golden.ts` header says so).

### Pitfall 3: The typecheck-driven field table and the version rows
**What goes wrong:** `tests/sim/world/snapshot-codec.test.ts:1403` is `Record<keyof Entity, readonly Mutation[]>`; adding `velocity`, `weapon`, `cargo` fails typecheck until rows exist, and the `has a mutation for every field` test (`:1738-1745`) expects only `["dead","id"]` to be empty. The rejection row `["version 4", set("version", 4), "version"]` (`:259`) becomes the accepted version; the "writes version 3" test (`:879-881`) flips.
**How to avoid:** list these in the plan's amendment table; add rows for the new fields and a refusal row for versions 3 and 5.

### Pitfall 4: Dead killer credit depends on kill order
See "Killer credit must be symmetric". **Warning sign:** the mutual-kill test passes for (A kills B) but not for the mirror.

### Pitfall 5: An `onEvent` handler calls `ctl.fire` during the immediate drain
**What goes wrong:** `world.fireQueue` is non-empty at the boundary; `snapshotWorld` throws `queue-not-empty`.
**How to avoid:** clear `fireQueue` after `drainAiEventsNow` (documented: fire is a think-time action), and test it with a module whose `onEvent` calls `fire`.

### Pitfall 6: The write-log test
`tests/sim/combat/step.test.ts:560-585` defines a getter/setter on `entity.energy` and asserts `log.at(-1)` is `write:70` and every earlier entry is `read:85` or `write:85`. Compute lethality from the local `after`; any later `entity.energy` read in the tick (for example in the ledger's lethal scan or in the kill path) breaks it. If the design needs a later read, amend the test deliberately and say why.

### Pitfall 7: A survivor with negative energy
`cleanEnergy` turns negative energy into 0 **and counts a repair** (`sanitize.ts:137-142`), and the acceptance run requires `repairs 0`. The ledger floors with `Math.max(0, after)` on write; dead victims leave at the second commit before the next sanitise, but a victim that is only marked (idempotency tests that call `killShip` and snapshot before commit) must also hold a legal value.

### Pitfall 8: Second commit hidden behind `combat`
`updateIdentTarget` is gated on `combat !== undefined` (`step.ts:382`); the commit must not be. Also keep the existing `worldStepped` guards so the jump step touches nothing.

### Pitfall 9: `shipTargetLost` duplicates
Documented above; pin with a test, do not "fix" by writing steering state.

### Pitfall 10: Coverage thresholds
`vitest.config.ts` fails `docker compose run --rm test` below `src/sim/**` lines 93, statements 91, functions 97, branches 86 (measured floors). New sim files (`kill.ts`, `ledger.ts`) need direct unit tests, not only the property test.

### Pitfall 11: Acceptance run cadence and the `src/app` gate
Plans A, B and C each touch `ships-npc.json` or `src/sim/world/**` (C exports `drainAiEventsNow` from `world/step.ts`), so each needs the by-hand `npm run test:acceptance` (21 of 21) on the remote machine, recorded in its SUMMARY. The plan that edits `src/app/session/traffic.ts` needs `verify`. Frozen worlds stay byte-identical because nothing fires in them and the new fields are pristine; confirm `aiFaulted 0`, `aiDropped 0`, `repairs 0` before claiming it.

### Pitfall 12: Documentation drift in comments
`combat/step.ts` header (lines 4-21) and the `resolveShotHits` doc (247-255, "N2: nothing is destroyed this milestone"), `events.ts:181-189` (which lists Phase 15 for "destruction and scooping" and a stale phase map), `npc/state.ts:15` ("`WORLD_SNAPSHOT_VERSION` 3"), `limits.ts` header and `src/content/schemas/ship-npc.ts` header all state rules this phase supersedes.

## Code Examples

Design sketches only. Names, labels and bounds are proposals and stay `[ASSUMED]` until the plan fixes them; the existing identifiers they call are quoted above.

```typescript
// serialize.ts, appended after the steer segment (labelled, ';'-free, pristine-omit).
// Source pattern: serializeEntity builds `[...].join(";")` (serialize.ts:134-150).
const segments = [/* ... existing fields ..., */ `steer:${serializeSteer(entity.steer)}`];
if (!isZeroVec(entity.velocity)) segments.push(`vel:${vecText(entity.velocity)}`);
if (entity.weapon.temperature !== 0 || entity.weapon.lastShotTick !== 0)
  segments.push(`wpn:${canon(entity.weapon.temperature)},${int(entity.weapon.lastShotTick)}`);
if (entity.cargo !== 0) segments.push(`cargo:${int(entity.cargo)}`);
return segments.join(";");
```

```typescript
// The three-link strip proof (extends populate.test.ts:500-523).
const NEW = /;(?:vel|wpn|cargo):[^;\n]*/g;
const withoutNew = golden.section.replace(NEW, "");
expect(fnv1a32(withoutNew)).toBe("c1068643"); // the golden before this phase
expect(fnv1a32(withoutNew.replace(/;steer:[^;\n]*/g, ""))).toBe("ab72eedf");
```

```typescript
// killShip: idempotent, ship-only events, total.
export function killShip(world: World, id: EntityId, killer: EntityId, events: SimEvent[]): boolean {
  const entity = world.store.get(id);
  if (entity === undefined || !world.store.kill(id)) return false;
  if (entity.kind !== "ship") return true;
  events.push({ kind: "shipDestroyed", id, position: copyVec(entity.position),
    radius: entity.radius, specKey: entity.specKey, killer });
  notifyKill(world, id, killer);
  return true;
}
```

## State of the Art

| Old approach (this repo) | New approach | When changed | Impact |
|--------------------------|--------------|--------------|--------|
| N2: an NPC at energy 0 stays alive (`step.ts:344` floor) | Energy `<= 0` destroys it through the ledger and one kill path | Phase 15 | `tests/sim/combat/step.test.ts:622` flips; cadence scenario gains a kill. |
| `;steer:` is the last segment, always present | New segments appended after it, pristine-omit | Phase 15 | Pristine entity lines are byte-identical; populated worlds with cargo change once. |
| World ends at one commit | Second commit before the ident update | Phase 15 | `entityRemoved` can appear in two groups per tick. |

**Deprecated/outdated:** the stated rule "the steering record's field set is FROZEN" (PROJECT.md row for the steering record) is superseded for this one bump; the row must say so.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Per-component velocity bound `1e4` m/s and weapon temperature bound `1e3` are adequate guards | Field set | A legitimate value would be repaired or refused; bounds are single-sited so a plan can adjust before the bump freezes them. |
| A2 | Role rule for the cargo count (trader and shuttle full, pirate fraction, others 0) is the intended reading of D-06 | Cargo count | If the owner wants a simpler rule (any ship with `likely_cargo` carries `likely_cargo`), the golden's `;cargo:` pattern changes; harmless before the golden is written. |
| A3 | Adding a purpose code 4 to `RNG_PURPOSE_CODES` is acceptable under the "one-way contract" comment | Cargo count | The alternative `mix32` derivation avoids the file; same behaviour. |
| A4 | Phase 18's collision rebound will not need a per-entity "recently collided" field | Open question 2 | If it does, the freeze forces an owner-approved amendment later. PITFALLS.md Pitfall 9 asks for such a guard; I did not verify Oolite's behaviour here. |
| A5 | Wreckage lifetime in seconds is about `energy / 1000` | Fidelity | Phase 16 detail, outside this phase; read from `ShipEntity.m:2271-2272`, `11678-11691`, `Universe.m:5506-5516`, `ShipEntity.m:8063-8064` but not measured in a running Oolite. |
| A6 | No test outside the ones listed pins an NPC at floor energy | D-11 list | A late red run; mitigated by the grep recipe in Validation Architecture. I did not run the suite (host runs are not evidence and the remote machine is the owner's). |

## Open Questions

1. **Is `missedShots` in the field set? (needs the owner before plan B is written)**
   - What we know: Oolite keeps `_missed_shots` per ship, `+1` on a missed laser shot and `-1` on a hit, floored at 0 (`ShipEntity.m:10196`, `:10218`, `:10396`, `:10425`, `:10468-10477`). It feeds the aim tolerance `basic_aim /= 1.0 + ((GLfloat)[self missedShots] / 4.0);` (`ShipEntity.m:9769`) when `accuracy >= COMBAT_AI_ISNT_AWFUL`, and the dead zone in `trackPrimaryTarget` (`:9136`). Wegolite's `COMBAT_AI_ISNT_AWFUL` is 0 (`npc/constants.ts:235`) and accuracy resolves into `MIN_ACCURACY..MAX_ACCURACY` (-5..10), so most NPCs are affected. Phase 14 cut it explicitly ("`missedShots` is 0 because NPCs do not fire in v2.2 (CBT-15)", `npc/target.ts:122`, `npc/track.ts:285`). D-07 fixes the weapon field at temperature plus last shot tick.
   - What is unclear: whether the owner counts it as part of `onTarget` (then it belongs in this bump) or accepts the scope cut for Phase 17.
   - Recommendation: add `missedShots` (uint, pristine 0, a third token of `;wpn:`) to the weapon record in this bump; it costs one integer and no extra segment. Otherwise record a Phase-14-style scope cut for Phase 17 in the Key Decisions row. Plan B should open with this as a decision checkpoint.

2. **Phase 18 contact state.** Collision rebounds may need a guard against repeated damage every tick (PITFALLS.md 9) and the NPC model has no velocity for ships, only `speed`. If a per-entity contact field is required it must be in this bump. Recommendation: ask the owner in the same checkpoint whether Phase 18 will use a position nudge only (no new field) as ARCHITECTURE.md 4.5 proposes.

3. **Cargo rule by role** (A2) and whether shuttle and scavenger carry cargo. Recommendation: the Oolite role rule above; the shuttle role follows the station launch (`StationEntity.m:1629`), the scavenger none.

4. **Plan order.** The golden regeneration needs the compiled cargo inputs, so content plan A precedes field plan B (ROADMAP says the field design comes first "before any behaviour exists"; plan A adds no behaviour). Alternative: one combined plan; larger and mixes a provenance-sensitive compile with a one-way hash change.

5. **Statics maxima.** Put 25000 / 250 / 250 as sim constants citing `shipdata.plist`, or let Phase 18 pass them from content? Recommendation: constants now (pristine detection needs the maximum), Phase 18 may add content wiring.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Docker | every test and the `assets` container | yes (local) | 29.8.2 | owner's remote test machine for `verify`, acceptance run |
| Node (host) | none authoritative | yes | v26.10.0 | not used for evidence |
| Oolite checkout | reference reads | yes | `/home/opencode/git/oolite` at `21978c37b`; `shipdata.plist` byte-identical to the vendored copy | none needed |
| Remote test machine | `verify`, `test:acceptance` (by hand) | not probed (owner-operated, memory `reference-remote-test-machine`) | - | blocks the QUAL-11 evidence if unavailable |

**Missing dependencies with no fallback:** none for planning. The acceptance run needs the remote machine (about 137 s per run per PITFALLS.md).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.5, fast-check 4.10.2 |
| Config file | `vitest.config.ts` (coverage thresholds on `src/sim/**`), `vitest.acceptance.config.ts` |
| Quick run command | `docker compose run --rm test npx vitest run <file>` |
| Full suite command | `docker compose run --rm test` (plus `lint`, `typecheck`; `assets:check` for the content plan) |

### Phase Requirements to Test Map
| Req ID | Behaviour | Test Type | Automated Command | File Exists? |
|--------|-----------|-----------|-------------------|-------------|
| FOUND-18 | Strip-and-rehash: new golden minus `;vel:/;wpn:/;cargo:` is `c1068643`; minus `;steer:` is `ab72eedf`; minus `;en:` is `b23d11d8` | unit (golden) | `docker compose run --rm test npx vitest run tests/sim/world/populate.test.ts` | amend |
| FOUND-18 | Pristine entity line unchanged; each non-pristine field adds exactly its labelled segment, in order; `statics:` line only when non-pristine | unit | `... vitest run tests/sim/world/hash.test.ts` | amend |
| FOUND-18 | Snapshot v4 round trip; v3 and v5 refused; rows for `velocity`, `weapon`, `cargo`, root `staticHealth`; sanitiser/parser agreement over the new leaves | unit + property | `... vitest run tests/sim/world/snapshot-codec.test.ts tests/sim/world/sanitize.test.ts` | amend |
| FOUND-18 | Hash equal at 30, 60 and 144 Hz over a world containing kills, cargo and a non-pristine weapon | cadence | `... vitest run tests/sim/world/world-cadence.test.ts` | amend (new kill scenario) |
| FOUND-18 | Snapshot-resume equality for 1,000 ticks with a mid-run kill | unit | `... vitest run tests/sim/world/snapshot.test.ts` | amend |
| FOUND-19 | Ledger: order, no record sees another, first-lethal credit, two shooters on one victim, floor, player branch unchanged | unit | `... vitest run tests/sim/combat/ledger.test.ts` | Wave 0 |
| FOUND-19 | `killShip`: idempotent, one `shipDestroyed`, non-ship kind emits none, AI events and order, killer dead or missing, handler calling `fire` leaves `fireQueue` empty | unit | `... vitest run tests/sim/world/kill.test.ts` | Wave 0 |
| FOUND-19 | Random fights: at every tick boundary no dead entity, empty `aiQueue` and `fireQueue`, `snapshotWorld` -> JSON -> `parseWorldSnapshot` -> `restoreWorld` equal by hash and JSON; each id gets at most one `shipDestroyed` and exactly one `entityRemoved`, `shipDestroyed` first; directed cases: kill on the spawn step, mutual kill, repeated kill request | property | `... vitest run tests/sim/combat/kill.property.test.ts` | Wave 0 |
| FOUND-19 | N2 test flipped: lethal hit gives one `shipHit`, one `shipDestroyed`, one `entityRemoved`, `store.get` undefined, `identLost` same step when locked and engaged, silent when not engaged | unit | `... vitest run tests/sim/combat/step.test.ts tests/sim/combat/ident.test.ts` | amend |
| DATA-14 | Nine records carry the new fields equal to the hand-written golden; extra field refused; `null` explosion type; absent facing types are `EQ_WEAPON_NONE`; drift gate | unit + drift | `... vitest run tests/content/ships-npc.test.ts tools/oolite-ingest/convert/npc-ships.test.ts` and `docker compose run --rm assets npm run assets:check` | amend |
| QUAL-11 | Frozen acceptance run 21 of 21 | by hand, remote | `npm run test:acceptance` (remote machine) | exists |

### Property test design (random fights)
Generate: 1 to 6 ships with `maxEnergy` in 1 to 60, positions along the player's nose at 500 to 3000 m, each inert or a test pilot (`createTestPilotAi(tick, { fire: true, holdRange })` with `ai.params.phase = "hold"` and `ai.params.targetId` set to the player or to another generated ship, as `spawnTestShooter` does at `test-spawn.ts:83-84`), a random spawn tick offset (including "spawned this step"), and a script of 20 to 60 ticks with the player's fire key on or off per tick. Drive with `stepSim` and a combat state. After every tick assert the boundary invariants above; also assert `hashWorld` equal between a live run and the replay from a snapshot taken at a random tick. Keep `numRuns` near 100 so the file runs in seconds. Total-function check: feed `killShip` and the ledger arbitrary ids, non-finite amounts and killers (`NO_ENTITY`, 100, a missing id, the victim itself) and assert no throw and no state change when refused.

### Sampling Rate
- **Per task commit:** the targeted `npx vitest run <file>` above.
- **Per wave merge:** `docker compose run --rm test`, `lint`, `typecheck` (and `assets:check` in plan A).
- **Phase gate:** full suite green; `verify` once for the plan that edits `src/app/session/traffic.ts`; the by-hand 20-seed run recorded for plans A, B and C.

### Wave 0 Gaps
- [ ] `tests/sim/combat/ledger.test.ts`, `tests/sim/world/kill.test.ts`, `tests/sim/combat/kill.property.test.ts`: new.
- [ ] No new framework or fixtures: `tests/helpers/lave.ts`, `tests/helpers/hull-table.ts`, `tests/helpers/npc-weapons.ts`, `tests/helpers/npc-flight.ts` already supply them.

### D-11: tests and pins that encode the old rule or move with the bump
Verified by reading this session (not by running the suite).

| Site | Why it changes |
|------|----------------|
| `tests/sim/combat/step.test.ts:622-634` "floors a target's energy at 0 and never destroys it (N2)" | The rule is superseded: a 10-energy Adder hit by a pulse laser (15) is destroyed on that tick. Becomes the lethal-hit test. |
| `tests/sim/combat/step.test.ts:560-585` write-log test | Still valid if the ledger writes once and never re-reads (Pitfall 6); otherwise amend with a stated reason. |
| `tests/sim/world/world-cadence.test.ts:397-525` (and its header comments) | The Adder (85 energy) held under the player's pulse laser for 720 ticks (15 per shot, recharge 2/s) now dies partway; samples are compared across cadences only, so no literal moves, but `adderHits` and the "both sides shoot" comment change and a kill assertion should be added. |
| `tests/sim/world/populate.test.ts:500-523` | Strip regexes must also strip the new labels; add the `c1068643` link (Pitfall 2). |
| `tests/sim/world/sanitize.test.ts:1094-1101` | "last segment" still true for a fresh entity; retitle. |
| `tests/sim/world/snapshot-codec.test.ts` `:256-259`, `:873-881`, `:1011-1015`, `:1403-1420`, `:1725-1745`, `:1940-2105` | Version rows, `ENTITY_FIELDS` rows, `fieldsArb`/`applyFields` (Pitfall 3). |
| `tests/sim/rng.test.ts:195` | Purpose-code pin if `"cargo"` is added. |
| `tests/sim/combat/ident.test.ts:473` | Direct `resolveShots` call: new signature (layout). |
| `tests/content/ships-npc.test.ts`, `tools/oolite-ingest/convert/npc-ships.test.ts`, `tests/golden/content/ships-npc.json` | DATA-14. |
| Record builders: `tests/helpers/inert-world.ts`, `tests/helpers/flyer-records.ts`, `tests/app/session/traffic.test.ts:48`, `tests/app/session/probe-publisher.test.ts:299`, `tests/sim/ai/test-spawn.test.ts:104` | `InertShipRecord` gains fields (or stays valid if optional). |
| **No change needed (read and checked):** `tests/ui/hud-model.test.ts` (lines 328-391 test the **player's** banks, which still floor, D-13); `tests/sim/combat/shields.test.ts:175` (player floor); `tests/sim/combat/weapons.test.ts` (player laser heat); `tests/sim/combat/npc-fire.test.ts` (its lethal-adjacent cases leave the Adder at 79 or 70; line 395 kills with `killEntity` directly); `tests/sim/world/step.test.ts:1037-1062` (reserved kinds and payloads unchanged, D-05); `tests/app/session-order.test.ts` (21 routed kinds and the unrouted pass-through are unchanged); `tests/e2e/combat.spec.ts` (the player's fire is released before the shooter spawns). Probe shape: no field added, so `probe-shape` fixtures stay. |

Grep recipe for stragglers: `rg -n "never destroys|N2|energyOf\(|\.energy\)\.toBe\(0\)|liveEntityCount" tests`, then check any scenario whose cumulative hit damage reaches the target's `maxEnergy` (pulse 15, beam 6, mining 50, military 12 per hit: `combat/constants.ts` `LASER_STATS`).

## Security Domain

`security_enforcement` is on (ASVS level 1, block on high).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | none (static client) |
| V3 Session Management | no | none |
| V4 Access Control | no | none |
| V5 Input Validation | yes | `parseWorldSnapshot` strict key lists and bounds; `z.strictObject` for the NPC record; `sanitizeEntity` before every hash |
| V6 Cryptography | no | none (FNV-1a is a state hash, not a security control) |
| V7 Error Handling | yes | new functions total (D-15); no throw on any world state |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Crafted or corrupt snapshot (prototype keys, non-finite numbers, oversize counts) | Tampering | `FORBIDDEN_KEYS`, closed key lists, `limitedNumber`/`uint32` parsers; every new field gets a parser branch and a refusal row |
| Non-finite value reaching `canon` (throws in the frame loop) | Denial of service | `sanitizeEntity` on every live entity before a hash; new fields cleaned there |
| AI event fan-out from kill notifications | Denial of service | existing caps (4096 queue, 8 passes, 4096 per drain) via `drainAiEvents`; overflow counted in `aiDropped` |
| Out-of-domain content record compiled in | Tampering | strict schema; bounds restated and pinned equal to the sim's (as `MAX_FLIGHT_*_BOUND` is) |
| Entity-id leakage out of the world | Information disclosure | guard `tests/guards/entity-id-scope.test.ts`; events keep their existing id payloads, no new export |

No dependency, network access, storage or secret is added.

## Sources

### Primary (HIGH confidence, read this session)
- Wegolite tree at `main` (`bdee06a`): `src/sim/world/{entity,serialize,snapshot,sanitize,limits,store,world,step,control-impl,contacts,populate,ids,view-impl}.ts`, `src/sim/{sim,events,rng}.ts`, `src/sim/combat/{step,ident,constants}.ts`, `src/sim/ai/{types,test-spawn}.ts`, `src/sim/ai/pilots/{test-pilot,flight-script}.ts`, `src/sim/npc/target.ts`, `src/app/session/{event-router,traffic}.ts`, `src/content/schemas/ship-npc.ts`, `src/content/ships-npc.ts`, `tools/oolite-ingest/convert/{npc-ships,ships}.ts`, `tools/oolite-ingest/like-ship.ts`, `package.json`, `vitest.config.ts`, `NOTICE`, `CHANGELOG.md`.
- Tests read: `tests/sim/combat/step.test.ts`, `tests/sim/world/{world-cadence,populate,sanitize,snapshot,snapshot-codec,step}.test.ts`, `tests/app/session-order.test.ts`, `tests/app/session/sim-driver.test.ts`, `tests/ui/hud-model.test.ts`, `tests/e2e/combat.spec.ts`, `tests/content/ships-npc.test.ts`, `tools/oolite-ingest/convert/npc-ships.test.ts`, `tests/helpers/{inert-world,write-inert-world-golden}.ts`, golden files under `tests/golden/`.
- Oolite checkout `/home/opencode/git/oolite` (`21978c37b`; `shipdata.plist` byte-identical to `third_party/oolite`): `ShipEntity.m` lines 291-306, 372-378, 474-491, 566-625, 2271-2272, 7198-7201, 7323-7373, 7743-7766, 7814-7879, 7891-8143, 8774-8819, 9761-9770, 9912-10007, 10190-10218, 10385-10430, 10468-10485, 11418-11574, 11678-11700; `Universe.m` 2520-2564, 2640-2680, 5497-5526; `StationEntity.m` 1250-1266, 1620-1632; `PlayerEntity.m` 3695-3752; `OOCollectionExtractors.m` 1143-1170; `Resources/Config/shipdata.plist`.
- Planning: `15-CONTEXT.md`, `REQUIREMENTS.md`, `ROADMAP.md` (Phase 15 and ordering rules), `research/{ARCHITECTURE,SUMMARY,PITFALLS}.md`, `AGENTS.md`, `PROJECT.md` Key Decisions rows 280 and 291.

### Secondary / Tertiary
- None. No web or Context7 lookup was needed: the phase uses no external library behaviour beyond what the tree and the pinned Oolite checkout state directly.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH, no change.
- Architecture (tick order, ledger, kill path, drain, commit): HIGH, every integration point read; the mutual-kill and fire-queue hazards are derived from the read code and not yet exercised.
- Field set and hash: HIGH for mechanics, MEDIUM for the choice of whether `missedShots` joins it (Open Question 1).
- Content record values: HIGH (read from the generated file and `shipdata.plist` by script).
- Pitfalls: HIGH for those tied to read lines; the D-11 list is a static reading, not a test run.

**Research date:** 2026-11-16
**Valid until:** the next change under `src/sim/world/**`, `src/sim/combat/**` or `third_party/oolite/Config/shipdata.plist` (stable otherwise, 30 days).
