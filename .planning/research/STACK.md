# Stack Research

**Domain:** Browser port of Oolite, v2.4 "Pirates and Police" (system populator, priority-AI port for trader/pirate/police/hunter/escort/station, legal status and bounties, cargo scooping, combat rating and kill tally)
**Milestone type:** Subsequent. The v1 and v2.0-v2.3 stack is validated and is not re-researched (NPC flight model and steering, NPC laser fire gate, damage ledger and kill path, debris and pods, collisions, equipment damage, player death, save schema v5, the dev-only AILib harness, `tools/oolite-reference`).
**Researched:** 2026-11-25
**Confidence:** HIGH for every Oolite behaviour and for every integration point (each cited `file:line` is in `/home/opencode/git/oolite` at the pin `7437f22` or in the Wegolite tree as read today). MEDIUM for the population-size figures (a scratch run, see "Population size"). LOW only where marked.

Oolite cites below are relative to `/home/opencode/git/oolite`. Between the pin `7437f22` and the checkout HEAD only `Resources/Config/descriptions.plist` differs under `Resources/Scripts`, `Resources/AIs` and `Resources/Config` (`git diff --stat 7437f22 HEAD`: 1 file, +46/-1), so the scripts read from the checkout are the pinned scripts.

## Verdict

**Add zero runtime dependencies. Add zero dev dependencies. Do not change the Docker image, the Compose file or any pinned version.** Every v2.4 capability is plain TypeScript over data that the existing `tools/oolite-ingest` pipeline can compile from plists that are already vendored. The work is in six places, none of which is a package:

| New capability | Answer | New package |
|----------------|--------|-------------|
| Populator (traffic by economy and government) | Hand port of `oolite-populator.js` into `src/sim/world/` as a pure planner over a galaxy-neighbourhood input the app builds from the existing system chunks; repopulation on Oolite's 20 s tick | none |
| Priority AI for trader, pirate (4 variants), police, hunter (2), escort, station | Hand port into `src/sim/ai/priority/` as typed TS literals (priority lists) over the existing `AiComponent`/`WorldView`/`ShipControl` seam, widened | none |
| Legal status, bounty, fines, docking refusal | Mostly the priority AI (`responseComponent_*_offenceCommittedNearby`), plus a small engine layer (`markAsOffender`, `markForFines`, `collectBountyFor`, dock-time fine); two new profile fields | none |
| Cargo scooping | New `TRACTORED` native behaviour (id already in `BEHAVIOUR_IDS`), a scoop branch in the collision stage, `EQ_FUEL_SCOOPS` in F3 | none |
| Combat rating and kill tally | One profile counter, Oolite's threshold table, F5 already has the label arrays | none |
| Oracles for all of the above | Extend `tools/ai-harness` from "run" to "record"; commit the recorded traces as oracle fixtures; add a populator recorder; optional real-Oolite census | none |

The decisions that look attractive and are rejected are under "What NOT to Use".

## Findings the roadmap must absorb first

These change scope or ordering. Each is verified against the Oolite source.

1. **Kill bounties are paid at the moment of the kill, not on docking.** The milestone text says "bounties paid on docking". `PlayerEntity collectBountyFor:` credits `10 * [other bounty]` decicredits at once, shows `bounty-awarded` and increments `ship_kills` (`src/Core/Entities/PlayerEntity.m:6042-6092`; the message is `Resources/Config/descriptions.plist:489`). What Oolite does at docking is: `unloadCargoPods` (`PlayerEntity.m:6336`), the fine for a ship that police marked (`being_fined`, `PlayerEntity.m:6364-6369`, `getFined` at `:10448-10474`), the escape-pod and rescuee rewards (`PlayerEntityContracts.m:86-130`, deferred), and the docking-refusal check for fugitives (`StationEntity.m:412` and `:1861`). Wegolite should pay the bounty at the kill (recorded as faithful) and treat "on docking" as the fine and the refusal. If the owner really wants payment on docking it is a recorded divergence and needs `FIDELITY.md` and reviewer agreement. **Ask the owner before Phase 21 is planned.**
2. **The legal rules live in the priority AI, not in the engine.** Firing on a clean ship makes `broadcastHitByLaserFrom` post `offenceCommittedNearby` to the main station (if the victim is inside its aegis) and to police within scanner range (`ShipEntity.m:12261-12304`, called from `ShipEntity.m:11478`). The bits are then set by the AI handlers: `attacker.setBounty(attacker.bounty | 7, "seen by police")` (`Resources/Scripts/oolite-priorityai.js:5169` for police, `:6033` for the station), `| 15` for attacking police (`:5367`), `| 63` for attacking the main station (`:5371`), `| 8` "attacked innocent" (`:5987`). The engine only adds `markAsOffender:64` when the player shoots police (`PlayerEntity.m:6066-6069`, `ShipEntityAI.m:1126`, `ShipEntity.m:11530`). So legal status cannot ship before the priority-AI core, the police role and the station handler exist.
3. **The main station needs an AI.** `AuthorityPredicate` selects the main station as an authority (`ShipEntity.m:12261-12268`) and `oolite-stationAI.js` (73 lines) launches defence ships, patrols and traffic and marks offenders. Today the station is a static body (ids 1-5, never in the dynamic store, never hashed: PROJECT.md Key Decision "Static bodies are world entities with fixed ids"). Do not promote it to a dynamic entity; give the world one small hashed `station` record (alert level, `AiComponent`, defence-target ids) driven by the same priority-list evaluator. This is the largest structural decision of the milestone and needs its own plan.
4. **The populator is arithmetic over the galaxy graph, and it repopulates.** The rate tables read `system.info.systemsInRange()` (7 LY, `Resources/Scripts/oolite-global-prefix.js:80-92`) and `systemsInRange(3.5)` for each system's economy, government and tech level (`oolite-populator.js:230-330`, `:330-520`), plus the lane lengths of the layout. `systemWillRepopulate` (`oolite-populator.js:1027-1308`) adds ships every 20 s (`src/Core/Universe.h:167`, `Universe.m:6410-6432`). Without repopulation a destroyed pirate pack is never replaced and the system empties, so the acceptance "pirates attack the player unprompted" fails after the first fight. Include repopulation; it is about 280 lines of `Math.random() < rate` arrivals at the witchpoint.
5. **The NPC hull catalogue must grow from 9 records to 28.** The populator roles (`trader`, `trader-courier`, `trader-smuggler`, `hunter`, `hunter-medium`, `hunter-heavy`, `pirate`, `pirate-{light,medium,heavy}-fighter`, `pirate-interceptor`, `pirate-{light,medium,heavy}-freighter`, `police`, `interceptor`, `wingman`, `escort`, `escort-medium`, `escort-heavy`) resolve, after `like_ship`, to 28 shipdata keys on 18 distinct models (scratch resolver over `Resources/Config/shipdata.plist`, shallow merge as `tools/oolite-ingest/like-ship.ts`). The compiled catalogue has 9 (`NPC_SHIP_KEYS`, `tools/oolite-ingest/convert/npc-ships.ts`). Role selection by `randomShipKeyForRoleRespectingConditions` weights over all of them (`Universe.m:3590-3620`), so a 9-record catalogue would skew every composition figure. Details under "Content build inputs".
6. **Population size is large.** In a scratch run of the real populator script (stubbed host), mean NPC ships (traders, pirates, hunters, police, assassins; no asteroids, buoys or hermits) were: Anarchy about 65 (50 pirates), Feudal 47, Multi-government 39, Dictatorship 38, Communist 46, Confederacy 40, Democracy 38, Corporate State 48; the maximum of 320 runs per government was 79 to 111. The entity cap is 256 and kills add plates and pods. Plan for ~110 live ships and test the cap with a full anarchy.

## Recommended Stack

### Core Technologies (all unchanged; the integration each new feature needs)

| Technology | Version (pinned in repo) | v2.4 role | Integration point |
|------------|--------------------------|-----------|-------------------|
| TypeScript strict | 6.0.2 | All sim, ingest, UI code | `src/sim/**` stays under `tsconfig.sim.json` (no DOM, no Three). New AI modules live under `src/sim/ai/` and obey the AI lint zone (`tests/guards/ai-zone.test.ts`) |
| zod | 4.6.7 | Widened NPC record schema, save schema v6, new content schemas | Same strict-schema pattern as `src/content/schemas/ship-npc.ts`; widen `strictObject`s, never `passthrough` |
| Vite | 8.3.8 | Lazy chunks for the new generated JSON | `import.meta.glob(..., { query: "?raw" })` as `src/content/ships-npc.ts` does; the new catalogue stays in the traffic-only lazy set |
| Vitest + fast-check | 5.1.1 + 4.11.0 | Replay of recorded oracles; property tests for rate tables, bit-OR legal rules, threshold tables | fast-check is installed; use it for "legal status never decreases except by the three Oolite rules" and "rating monotone in kills" |
| Playwright | 1.65.1 | One journey spec (anarchy launch, pirate attacks, kill, scoop, dock, bounty visible on F5) | Browser image is pinned to the Playwright version; do not bump mid-milestone |
| tsx | 4.23.15 | Runs the new ingest converters and the oracle recorders | Same as `tools/oolite-ingest/cli.ts` |
| @gltf-transform/core | 4.5.1 | GLBs for the 9 new hull models and their texture variants | Same `tools/oolite-ingest/convert/glb.ts` path |
| Three.js | 0.187.0 | No new API. NPC drawing is already `InstancedMesh` per (model, primitive) (`src/render/bodies/npc-ships.ts:7`) | See the draw-call risk under "Risks" |

### Database

None. Saves stay one IndexedDB blob. NPCs are still never saved (PROJECT.md Key Decision "Do not save NPCs"); only the player's legal status and kill tally join the save.

### Infrastructure

No change. No new Compose service, no new env var, no new image layer. The recorder and the real-Oolite census reuse the existing `OOLITE_SRC` mount convention and `tools/oolite-reference/run-remote.sh`.

### Supporting Libraries

None. A table of what v2.4 asks of the ones already installed is not needed beyond the core table.

## New and changed modules

Paths are proposals; names follow existing conventions. "AI zone" means the lint zone that forbids imports outside the AI allow-list.

| Module | Responsibility | Talks to | Source of truth |
|--------|----------------|----------|-----------------|
| `src/sim/world/populator.ts` (new, beside `populate.ts`) | Pure planner: `planPopulation(neighbourhood, layout, records) -> PopulatorEntry[]` (name, location code, `groupCount`, group kind) and the per-group spawn recipes (`addFreighter`, `addIndependentPirate`, `addPiratePack`, `addPolicePatrol`, `addPoliceStationPatrol`, `addInterceptors`, hunters) | `placement.ts` (add `WITCHPOINT` to `LocationCode`), `spawnEntity`, entity streams | `oolite-populator.js:230-980` (rates and `setPopulator` table), `:1383-2135` (group recipes), `Universe.m:1707-1780` (execution), `:1783-1900` (location codes) |
| `src/sim/world/repopulate.ts` (new) | 20 s repopulation tick; arrival at witchpoint via `_wormholePos` (`oolite-populator.js:2348-2357`) | populator planner state (rates table, hashed as a small world record) | `oolite-populator.js:1027-1308`, `Universe.h:167` |
| `src/sim/world/neighbourhood.ts` (new, plain data types) and `src/app/session/neighbourhood.ts` (new, builds it) | `{ self, locals[], seconds[][], verylocals[], veryseconds[][] }` of `{ id, economy, government, techLevel, distance }`, derived from the current galaxy chunk with the existing integer chart distance (`src/sim/hyperspace/jump.ts` `chartDistance`, truncating as Oolite does) | `src/content/systems.ts`; sim receives data only | `oolite-global-prefix.js:80-92` |
| `src/sim/ai/priority/` (new directory: `controller.ts`, `conditions.ts`, `configurations.ts`, `behaviours.ts`, `responses.ts`, `waypoints.ts`, `roles/{trader,pirate,pirate-fighter,pirate-freighter,pirate-interceptor,police,bounty-hunter,bounty-hunter-leader,escort,station,trader-opportunist}.ts`) | The library as typed TS: priority lists as literals, one `think(ctx)` that walks them with Oolite's `condition`/`notcondition`/`configuration`/`behaviour`/`reconsider` semantics (`oolite-priorityai.js:80-255`), the event handlers table (`:4890-4960`) | `AiContext`, widened `WorldView`/`ShipControl`; AI keys added to `AI_KEYS` | `Resources/Scripts/oolite-priorityai.js` (6838 lines, 259 prototype functions), `Resources/AIs/oolite-*AI.js` |
| `src/sim/world/station.ts` (new) | The main station's AI record and the "authority" role: alert level, defence targets, `offenceCommittedNearby` receiver, launch requests for patrol, defence and salvage ships | priority controller, populator launch recipe (`launchShipWithRole`), `dock-port.json` launch pose | `oolite-stationAI.js`, `StationEntity.m:1312-1715` (`launchPolice`, `launchDefenseShip`, `launchPatrol`, `launchShipWithRole`), `ShipEntity.m:12261-12304` |
| `src/sim/combat/legal.ts` (new) | `markAsOffender` (bit-OR, no-op for police, station and cloaked), `markForFines`, NPC `bounty` field writes, `broadcastHitByLaserFrom` fan-out as `AiEvent`s `offenceCommittedNearby` | ledger hit path (`combat/step.ts`), AI event queue | `ShipEntity.m:11832-11860`, `:12434-12440`, `:12279-12304` |
| `src/sim/player/legal.ts` (new) | Player legal status: `legalStatus` int, `classify(int)` with thresholds 1 and 51, halve on jump, reset on new game, `getFined` price rule, docking-refusal predicate (> 50) | `PlayerProfile` (two new fields), `hyperspace` commit, dock controller | `PlayerEntity.m:5987-6040`, `:6887`, `:10448-10474`, `OOConstToString.m:404-420`, `StationEntity.m:412`, `:1861` |
| `src/sim/player/rating.ts` (new, 20 lines) | `ratingIndex(kills)` with thresholds `8,16,32,64,128,512,2560,6400` | F5 (`src/ui/station-model.ts:613-672`) | `OOConstToString.m:373-396` |
| `src/sim/combat/scoop.ts` (new) and `src/sim/npc/behaviours/tractored.ts` (new) | `canScoop`, tractor pull and capture, `scoopUp` (pod -> hold); the 250 m tractor range and `TRACTOR_FORCE 2500` | collision stage (`combat/collide.ts`, `combat/response.ts:17` "No scoop branch (11035-11042, PD-05)"), `cargoScooped` event, profile cargo | `ShipEntity.m:11035-11042`, `:11183-11243`, `:11244-11400`, `:3731-3800`, `ShipEntity.h:94`, `PlayerEntity.m:4430-4435` |
| `src/sim/world/cargo-roll.ts` (new) | Fill a dying ship's pods with commodities from the system market (`getContainersOfGoods` weights) and pod amounts (`getRandomAmountOfCommodity`) | debris rule (`world/debris.ts`), a world-level market table input | `Universe.m:3880-3935`, `:4000-4013`, `ShipEntity.m:7325-7365` |
| `src/ui/expand.ts` (new) | String expander subset: `[key]` recursion, `%H` (system name), `%R`, `[oolite_entityName]`, `[score\|dcr]`; the app owns wording, never the sim | `labels`/new `comms.json`, a presentation RNG that never touches the sim | `src/Core/OOStringExpander.m` (`%H` at `:848`), `descriptions.plist:489-731` |
| `src/app/session/event-router.ts` (changed) | Routes `commsMessage`, `legalStatusChanged`, `cargoScooped`, a new `bountyAwarded` event; applies profile updates (credits, kills, legal status, cargo) | `PlayerProfile`, HUD messages | existing `equipmentDamaged` and `cargoDestroyed` routes are the pattern |
| `src/sim/player/outfitting.ts` (changed) | Add `EQ_FUEL_SCOOPS` to `VISIBLE_EQUIPMENT_KEYS`, `SINGLE_INSTANCE_KEYS` and `DAMAGEABLE_EQUIPMENT_KEYS` (catalogue `damageProbability` is 1) | save allow-lists, the two equipment guards | `src/content/generated/equipment.json:146`, `equipment.plist:45-51` |
| `src/app/session/traffic.ts` (changed) | New `createPopulate` next to `createInertPopulate`; keep the inert populator for fixtures | world lifecycle | see "Do not break the frozen acceptance run" |

### Widening the seam (the part most likely to be underestimated)

The role AIs read about 80 distinct `ship.*` members (counted over the library, populator and eleven role AIs): the heavy ones are `target` (190 reads), `group` (158), `destination`, `desiredRange`, `desiredSpeed`, `escortGroup`, `alertCondition`, `defenseTargets`, `scanClass`, `fuel`, `homeSystem`, `bounty`, `primaryRole`, `energy`/`maxEnergy`, `accuracy`, `AIPrimaryAggressor`. Today `WorldView` exposes a pose, a behaviour, a target id and `scan` (`src/sim/world/view.ts:27-75`) and `ShipControl` has seven methods (`control.ts:24-41`). Add, as plain data accessors and queued commands (no object handles, ids only):

- View: `role`, `bounty`, `energyFraction`, `groupId`/`leaderId`/`groupSize`, `isPirate/isTrader/isPolice/isEscort` (by role category and, for police, scan class: `ShipEntity.m:6332-6386`), `hasScoop`, `cargoSpaceAvailable`, `fuel`, `homeSystem`, `destinationSystem`, `hasHostileTarget`, `primaryAggressor`, `threatAssessment`, `damageAssessment`.
- Control: `setBounty`, `markForFines`, `switchAi`, `joinGroup`/`leaveGroup`, `requestHelpFromGroup`, `addDefenceTarget`/`removeDefenceTarget`, `setAlert`, `communicate(key, params)` (emits `commsMessage`), `exitSystem` (remove at witchpoint), `requestDock` (remove at the station through the simple D8 queue), `dumpCargo` (trader surrender), `launchFromStation(role)`.
- Not needed in v2.4 and answered with fixed stubs recorded in `FIDELITY.md`: `missiles` (empty), `hasEquipmentProviding("EQ_ECM")` (false), `fireECM`, `launchScavenger`, `performMining`/`performCollect` for scavengers, escape pods, thargoids. The priority AI evaluates these branches to "no" cleanly, so the port keeps the lists intact and the stubs return the "none" answer (`oolite-priorityai.js:5080`, `:5257`, `:5799` are the ECM guards).

AI state must fit `AiComponent.params` (`ParamValue`: null, boolean, finite number, string, or an array of at most 64 numbers or strings; `src/sim/ai/types.ts:38-52`, `limits.ts:30`). Everything the library keeps in closures maps onto it: parameters (`setParameter`), `oolite_selectedStation`, `defenseTargets`, `lastCommSent`/`lastCommHeard`, the reconsider wake. Entity references are ids (numbers). There is no nested object, so the library's `oolite_intership` and `__cache`/`__ltcache` become flat keys or are recomputed. This is the design reason the hand port was chosen (PROJECT.md Key Decision "Port Oolite's gameplay JavaScript ... by hand").

Size of the port, measured by name-reachability from the role AIs through the library (over-approximate, a regex over `ai.x`/`this.x` calls): 184 to 193 of the 257 library functions (about 4.8k to 5.0k lines of the JS) plus 1.1k to 1.5k lines of role AIs. Conditions 60-65, responses 38, configurations 33-35, behaviours 22. That count is the planning unit for the AI phases; it is why the reachability checklist below is a tool, not a document.

## Content build inputs

Everything below is read by `tools/oolite-ingest`, written under `src/content/generated/`, validated by a strict zod schema under `src/content/schemas/`, and guarded by `docker compose run --rm assets npm run assets:check` and a golden under `tests/golden/content/`. All input plists are **already vendored** in `third_party/oolite/Config/` (checked: `shipdata.plist`, `shipdata-overrides.plist`, `autoAImap.plist`, `role-categories.plist`, `pirate-victim-roles.plist`, `descriptions.plist`, `planetinfo.plist`, `trade-goods.plist`, `equipment.plist`). Only models and textures are new vendored bytes.

| Input | Converter | Output | Consumers | Notes |
|-------|-----------|--------|-----------|-------|
| `shipdata.plist` (+ overrides), 28 keys | widen `convert/npc-ships.ts`; `NPC_SHIP_KEYS` becomes the 28 keys of the traffic roles (variant keys such as `boa-pirate`, `python-blackdog`, `mamba-escort`, `sidewinder-escort` are separate records) | `ships-npc.json` (schema `NpcShipSchema` widened) | populator role weights, spawn, AI, render | New fields: `bounty` (default 0, `ShipEntity.m:559`), `autoAi` (`auto_ai`), `autoWeapons`, `hasScoop` (fuzzy boolean 0..1, `ShipEntity.m:338`), `hasFuelInjection` (fuzzy, only to record the cut), `scoopPosition` (`ShipEntity.m:483`), `countsAsKill` (default true, `ShipEntity.m:1527`), `escorts`/`escortRole`/`escortShip`/`escortRoles[]` and `maxEscorts` (`ShipEntity.m:1532-1700`, `MAX_ESCORTS 16` `ShipEntity.h:76`), `accuracy` where authored, `missiles` count (recorded, not simulated). Probability suffixes in `roles` are already kept verbatim |
| same | lift `STEERING_ASSUMED_ABSENT_KEYS` (`npc-ships.ts:240`) for `aft_weapon_type` | per-facing weapon types and positions are already compiled (Phase 15); the refusal list must drop `aft/port/starboard_weapon_type` | spawn, fire gate | Six of the 28 author `aft_weapon_type`: `anaconda`, `anaconda-pirate`, `boa`, `boa-pirate`, `boa-mk2`, `boa-mk2-pirate`. The build refuses them today by design; lifting it needs per-facing weapon temperature (see snapshot v5) |
| `autoAImap.plist` | new `convert/auto-ai-map.ts` | `ai-map.json` (role -> AI key) | spawn (`Universe.m:3623-3668`) | 27 rows; maps `oolite-*AI.js` names to Wegolite `AiKey`s through one closed table. The populator then `switchAI`s fighters, freighters and interceptors explicitly (`oolite-populator.js:1758`, `:1777`, `:1870`) |
| `role-categories.plist` and `pirate-victim-roles.plist` (deprecated, empty list) | new `convert/role-categories.ts` | `role-categories.json` (category -> sorted role list) | `isPirate`, `isTrader`, `isEscort`, `roleIsPirateVictim` and the AI's `shipInRoleCategory` (`ShipEntity.m:6343-6386`, `Universe.m:2803-2815`) | 214-line plist. Police is by scan class, not role (`ShipEntity.m:6332-6336`) |
| `descriptions.plist` subset | extend `convert/labels.ts` or add `convert/comms.ts` | `comms.json`: the `oolite-comms-*` keys (`descriptions.plist:651-675`) and the keys they expand (`beg-for-mercy`, `distress-call`, `police-attack-warning`, `thanks-for-assist`, `bounty-awarded`, `fined-@-credits`, `station-docking-refused-to-fugitive`, `station-docking-clearance-H-clearance-refused`, `right-on-commander`, `cargo-*`) | `src/ui/expand.ts`, event router | Emit templates verbatim like the existing six label arrays; expansion is presentation (`labels.ts` header says the same). Comms key table of the library is `oolite-priorityai.js:6675-6720` (ten keys) |
| `trade-goods.plist` | none; already `commodities.json` | `legalityExport`, `unit`, `podConversion` are present | `cargo-roll.ts`, scoop pod amounts | Pods need the market stock per good as a world input, not new content |
| `planetinfo.plist` | none; already `systems/g0..g7.json` | `chartX`, `chartY`, `economy`, `government`, `techLevelRaw`, `planetDistance`, `sunDistance` present | neighbourhood builder, lane lengths | `system.scrambledPseudoRandomNumber` is used only for asteroids and hermits (`oolite-populator.js:140-146`), out of scope |
| Models and textures | extend `convert/glb.ts` (`MODEL_SOURCE_FILES`, `EMITTED_ENTRIES`) and `scripts/vendor-oolite.sh` `FILES` | 9 new GLBs: `anaconda`, `asp`, `boa`, `boa-mk2`, `ferdelance`, `python`, `python_trader`, `sidewinder_escort`, `viper_interceptor` (`cobra3` is already vendored for the player) | NPC render layer | Variants use different diffuse maps (`python-blackdog` `oolite_python_diffuse_blackdog.png`, `cobra3-pirate` `oolite_cobra3_diffuse_pirate.png`, `cobramk1-alt`, `mamba-escort`, `cobra3-alternate`, `python-trader`). The current rule "one GLB per model" (`NPC_GLB_PATH_PATTERN`) must become one GLB per record key. Every new `.dat`/`.png` needs an `ASSETS.md` row and a `CHECKSUMS.sha256` line, written only by `vendor-oolite.sh`, never by hand (AGENTS.md licensing rule; `third_party/oolite/SOURCE.md`) |
| `shipdata.plist` Cobra III player record | widen `convert/ships.ts` | `scoop_position "0.0 -5.0 -9"` (`shipdata.plist:1553`) into `ships-client.json` | scoop geometry | `has_scoop = 0.95` on the template is an NPC-style roll; the player's capability is the equipment item |
| Rating and legal thresholds | none (code constants) | pin them in `src/sim/player/rating.ts` and `legal.ts` with a test quoting `OOConstToString.m` | F5 | The `rating` (9 names) and `legal_status` (3 names) arrays are already in `labels.json` (`src/content/schemas/labels.ts:21-22`) |

Not compiled in v2.4: `missile_role`, `has_ecm`, `has_escape_pod`, `has_cloaking_device`, subentities of NPC hulls, `condition_script` filters (Oolite's `canInstantiateShip` conditions, `Universe.m:3590-3620`, only gate OXP ships and a few special ships; the 28 records carry none).

## Schema and persistence changes

### World snapshot v5 (one bump, all hashed fields together)

Precedent: Phase 15 put the milestone's hashed fields in one snapshot bump (`WORLD_SNAPSHOT_VERSION = 4`, `src/sim/world/snapshot.ts:99`; pristine-omit hashing, `entity.ts` `;vel:`, `;wpn:`, `;cargo:` segments). Do the same, in the first sim plan of v2.4, so every later plan fills fields instead of reopening the format. Candidate fields (pristine-omit each):

| Field | Why | Oolite source |
|-------|-----|---------------|
| `Entity.bounty` (uint) | NPC legal status; AI conditions read it constantly | `ShipEntity.m:559`, `:7097-7152` |
| `Entity.role` (string from a closed vocabulary) | `primaryRole` drives AI, `isPirate`, escort rules; the populator rewrites it (`police-station-patrol`, `oolite-populator.js:2089`, `:2110`) | `ShipEntity.m:6343-6386` |
| `Entity.groupId` (uint; leader is `ownerId`) | pirate packs, police patrols, `requestHelpFromGroup`; membership is derived by an ascending-id scan, never stored as a list | `ShipEntity.m:11487-11520` |
| `Entity.equipment` bit set (scoop, fuel injection) | resolved once at spawn from the fuzzy booleans (a draw each) | `ShipEntity.m:336-345` |
| `Entity.cargoFlag` (enum 0-6) and, for pods, `Entity.commodity` (index) and `Entity.amount` | the cargo rule today stores only a count (`entity.ts` `cargo`); scooping needs the pod's commodity. Roll the contents of a dying ship's pods from a forked stream (`forkSeed(worldSeed, id, "cargo")`, the Phase 15 pattern) so no per-pod list is stored | `ShipEntity.m:7325-7365`, `Universe.m:3880-3935` |
| `WeaponComponent` per-facing temperature and per-facing weapon type (aft, port, starboard) | `_setWeapons` gives aft lasers at level >= 3 (`oolite-populator.js:2217-2275`); `entity.ts:36-43` already says lifting the "forward only" limit is a snapshot change | `ShipEntity.m:2213-2218` |
| `Entity.beingScooped` (via `nav.behaviour = TRACTORED` and `ownerId`; no new field if the behaviour carries it) | tractor state | `ShipEntity.m:11213-11224` |
| `World.station` record (alert, `AiComponent`, defence target ids) | station AI | see finding 3 |
| `World.populator` record (the rate table and the 20 s countdown, ~25 numbers) | repopulation must resume deterministically after a reload at the leg anchor | `oolite-populator.js:303-520` |
| `World.cargoMarket` (17 stock values and legality flags) | a world input, copied at arrival; not entity data | `Universe.m:3880-3935` |

AI-private numbers (`homeSystem`, `destinationSystem`, `fuel`, `defenseTargets`, `primaryAggressor`, `lastCommSent`) go in `AiComponent.params`, not in new entity fields, so they cost no format change.

Golden re-pins this causes (standing approval exists, MEMORY "Twin hash re-pin standing approval": re-pin only if the cause is measured and Node equals browser): `tests/golden/world/flight-hash-pins.json`, `tests/golden/world/inert-lave-epoch1.json`, the cadence tests.

### Save schema v6 (profile)

`SAVE_VERSION` is 5 (`src/persistence/save.ts`). Add exactly two profile fields and no migration (PROJECT.md: alpha, older saves are `corrupt`; same rule as Phase 19 D-11):

| Field | Type and bound | Oolite |
|-------|----------------|--------|
| `legalStatus` | integer 0 to a generous bound (65535; the bits Oolite ORs in are 1, 2, 4, 8, 16, 32, 64 plus `setBounty` values from scripts, so 127 in practice) | saved as `legal_status` (`PlayerEntity.m:843`, `:1414`) |
| `shipKills` | integer 0 to `MAX_UINT32` | saved as `ship_kills` (`PlayerEntity.m:845`, `:1416`) |

Update the file header comment of `save.ts` (it states "No entity, combat, law or cargo cost-basis field exists in the save"; this is the first "law" field, record it in PROJECT.md Key Decisions). `beingFined` is transient (not in Oolite's save dictionary) and stays in sim state; it is applied at the next main-station dock and cleared there.

Scooped pods: **recommended, zero new save fields**. Add the pod's commodity and amount to `profile.cargo` at scoop time (via the `cargoScooped` event, the app applies it as it applies `cargoDestroyed`), using the existing pod and unit arithmetic (`src/sim/economy/cargo.ts`: `capacityPodsFor`, `holdPodsUsed`). Oolite keeps pods in `cargo[]` until docking and merges them in `unloadCargoPods` (`PlayerEntity.m:6336`), so this is a recorded divergence with no player-visible difference except in-flight F5 and a future jettison. It is also what keeps the in-flight autosave at a hyperspace arrival correct: a player who scoops and then jumps carries the pods across the arrival save. Needs `FIDELITY.md` row plus reviewer agreement per the fidelity rule. If the owner rejects it, the alternative is a saved `heldPods` array (at most the hold capacity, 35 pods) in the in-flight section of the save.

### Events (`src/sim/events.ts`)

`legalStatusChanged` exists with string states (`events.ts:39`, `:188`); give it the numeric `from`/`to` and the Oolite reason string (needed for the "seen by police" copy). `cargoScooped` exists (`:182-186`). Add `bountyAwarded { score, creditsAfter }` (the app prints `bounty-awarded`, `PlayerEntity.m:6082`) and `killTallied { kills }` or fold both into `shipDestroyed` consumers. `commsMessage` exists (`:166-172`) and is the only channel for NPC speech.

### AI registry

`AI_KEYS` is `["test-pilot", "flight-script"]` (`src/sim/ai/types.ts:19`). Add one key per ported role AI. The 23 `AI_EVENT_NAMES` already include `offenceCommittedNearby`, `distressMessageReceived`, `helpRequestReceived`, `shipScoopedOther`, `shipWasScooped`; no new event name is needed for v2.4.

## Test and oracle tooling

### Recommended: record with Oolite's own JavaScript, replay in CI

The Phase 14 spike proved the pinned library and a role AI run unmodified in `node:vm` against a stub host (`14-SPIKE.md`: `11 passed` with the tree, `3 passed, 8 skipped` without; strict-`>` wake at `ShipEntity.m:2480-2483`; scripted `Math.random`). The open decision (C) of PROJECT.md ("keep `OOLITE_SRC` or vendor the scripts, decided when the priority-AI phase is planned") is answered here:

- **Keep the `OOLITE_SRC` mount. Do not vendor `Resources/Scripts/*.js` or `Resources/AIs/*.js`.** Licence is not the blocker (the scripts are GPL-2.0-or-later like the project); the reason is that nothing needs them in CI once the traces are recorded, and vendoring adds about 9,600 lines of reference code and a `vendor-oolite.sh` bump for no gate.
- **Make the harness a recorder.** Add `tools/ai-harness/record.ts` (run by an npm script, `OOLITE_SRC` required) that executes a named fixture against the original JS and writes `tests/oracles/ai/<role>/<fixture>.json`: a header (Oolite commit `7437f22`, SHA-256 of every script read, the scripted draw sequence, the host scenario) and the ordered trace (`draw`, `set`, `call`, `wake`, `timer`, exactly the spike's entry kinds). The replay test (`tests/sim/ai/<role>.oracle.test.ts`) feeds the same scenario and the same draws to the TS port through `AiContext.random` and compares the `perform*` calls, parameter writes, draw indices and wake times. It runs everywhere, including the remote machine and CI. Independence is by construction: the fixture came from Oolite's code, and `tests/guards/oracle-independence.test.ts` already forbids oracle files from importing `src`.
- **A drift check that runs only when `OOLITE_SRC` is set**: re-record to memory and compare to the committed fixture (skips otherwise, like the spike's 8 cases). This is what makes the recorded fixtures trustworthy after a pin bump.
- **Compare wake times and decisions, not frames.** The spike's own warning: the engine wakes on a variable frame, the port on a fixed 1/120 s tick (`14-SPIKE.md`, Risks, "The clock"). Fixtures must record the written `AIScriptWakeTime`.
- **Stub growth is per role, not per library.** The spike reached one role (shuttle) with 40 read members; plan one stub session per role AI (trader, pirate, pirate fighter/freighter/interceptor, police, bounty hunter and leader, escort, station) plus one for the `Timer` callbacks (`oolite-priorityai.js:425` ECM timer, `:5586` self-destruct timer; both are in scope only as "never fires" if ECM stays deferred).

### Populator recorder (cheap, high value)

`oolite-populator.js` is pure arithmetic over `system.info`, `systemsInRange`, the lane lengths and `Math.random`. A scratch stub of about 35 lines (`system`, `Ship.keysForRole`, `ShipGroup`, `Vector3D.randomDirection`, `setPopulator` recording) ran the whole script for all eight governments of galaxy 0 (this research, `/tmp/.../scratchpad/pop.mjs`, not committed). So:

- `tools/ai-harness/populator.ts` loads the script, builds `system.info` from the compiled `systems/g*.json` (same integer chart distance), runs `systemWillPopulate`, records the `setPopulator` table (name, location code, `groupCount`) under scripted draws, then runs each callback with a recording `addShips/addGroup/launchShipWithRole` and logs (role, count, bounty, weapon level writes, `setSkill`, cargo type).
- Fixtures `tests/oracles/population/{system}.json` for one system per government plus a bottleneck system and an isolated one, three draw scripts each. The TS planner must produce the same table and the same recipes under the same draws. This is exact; it needs no statistics.
- Repopulation gets the same treatment (`systemWillRepopulate` with scripted draws and a recorded rate table).

### Reachability checklist

`tools/ai-harness/reach.ts` (static, no execution) computes, per ported role AI, the transitive set of library functions it references (the scratch version of this research did it with a regex over `ai.x` and `this.x`). Commit the result as `tests/oracles/ai/reachable.json` and add a test that every reachable function either has a TS counterpart (by a naming rule) or an explicit "deferred: missiles | ECM | escape pod | scavenger | dock" entry. This turns the 190-function port into a checklist that cannot silently shrink.

### Real Oolite as a sanity check, not an oracle

`tools/oolite-reference` runs a real 1.93.1-255 headless and logs through a throwaway measurement OXP kept outside the repository (README "Writing a measurement OXP"; Oolite's own 255 build versus the 241 pin: scripts unchanged, see the diff above). For v2.4 use it twice, sparingly:

- A census probe: a world script that on `shipLaunchedFromStation` logs, per ship, role, AI, bounty, weapon facings, group, and position. Run it for about five systems that differ in government (anarchy, feudal, dictatorship, democracy, corporate) with about 10 runs each, because the populator is random; compare mean counts per role family against the TS planner's expectation within a wide band. **LOW confidence on feasibility of choosing the start system**: the standard scenario starts at Lave (`Scenarios/oolite-standard.oolite-save`); an OXP-supplied scenario save with another `galaxy_number` and system is the likely route and needs a spike before it is promised.
- A behaviour probe for one anarchy launch: does a pirate attack the player unprompted, and how soon? Compare time-to-first-hostile in the TS port.

Commit only the numbers (`tests/oracles/population/reference-census.json` with the build id and date), never the OXP or screenshots (README: output stays outside the repository).

### Guards and fixtures that must change in the same commits as the code

| File | Why it fails or must change |
|------|------------------------------|
| `tests/guards/kill-credit-consumers.test.ts` | It is a deliberate tripwire for the first consumer of `shipDestroyed.killer`, `shipTargetDestroyed`, `shipKilledOther`. Bounty, rating and the AI reactions are that consumer. The same commit must settle `.planning/todos/pending/2026-11-18-mutual-kill-credit-symmetry.md` and edit the allowlists. Oolite pays through `noteTargetDestroyed -> collectBountyFor` (`ShipEntity.m:8805-8808`); in a mutual same-tick kill Wegolite credits the lower id (recorded, Phase 17 D-10). Recommendation: keep the asymmetry for the player's kill tally only if a test shows it cannot change a player outcome; otherwise credit both |
| `tests/guards/damageable-equipment.test.ts`, `tests/guards/damaged-equipment-in-use.test.ts` | `EQ_FUEL_SCOOPS` joins the damageable set; the in-use tripwire requires the scoop code to refuse a damaged scoop (`hasEquipmentItemProviding` ignores damaged items) |
| `tests/guards/ai-zone.test.ts`, `on-event-handlers.test.ts`, `entity-id-scope.test.ts` | New AI files obey the zone, every `onEvent` handler is registered, no entity id leaves its world (`defenseTargets` and `primaryAggressor` are ids inside params, never held outside) |
| `tests/guards/harness-isolation.test.ts`, `tools/ai-harness/dist-check.ts` | The recorder and populator harness stay under `tools/`, never imported by `src`; the sentinel check must still pass on `dist` |
| `tests/e2e/budget.spec.ts:293-294` | Vacuity guards assert exactly 9 NPC GLBs and 43 textures; they become the new counts. The first-load ceiling (9 MiB) must not move: NPC assets stay lazy |
| `tests/golden/content/ships-npc.json`, `tests/content/ships-npc.test.ts` | Re-pin with the widened schema; read the diff once, in the content phase |
| ~20 tests read `ships-npc.json` directly (`tests/helpers/*`, `tests/sim/world/populate.test.ts`, `tests/app/session/traffic.test.ts`, ...) | Several draw "any record of role X"; with 28 records every draw changes. Give them an explicit key whitelist (see below) |

### Do not break the frozen acceptance run

`tests/acceptance/thresholds.ts` is frozen (changing it needs the owner's `Detector-change-approved-by-owner` trailer, AGENTS.md) and its slot analysis assumes the inert populator's 12 draws over the nine records (`thresholds.ts:91-114`: "Only the shuttle role can draw the unarmed Shuttle", "the only two records with the `scavenger` role"). Widening the catalogue to 28 records changes every role draw and breaks that analysis silently. Therefore: keep `populateInertWorld` and `INERT_POPULATION` (`src/sim/world/populate.ts`) untouched as the fixture populator, make it take an explicit `records` argument restricted to the nine legacy keys in the acceptance run and the inert goldens, and add the new populator beside it. The milestone's "the 20-seed acceptance run holds" then means "unchanged run, unchanged result", rerun by hand on the remote machine after any change under `src/sim/npc/**`, `src/sim/world/**` or `ships-npc.json` (AGENTS.md rule).

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| AI implementation | Hand-ported typed priority lists in TS | Run Oolite's JS at runtime (QuickJS, `node:vm` in the browser) | Rejected in v2.0: closure state cannot be saved or hashed; the AI would need a SpiderMonkey-compatible facade; PROJECT.md Out of Scope |
| AI oracle | Record traces from the original JS, replay in CI | Vendor the scripts and run them in CI | Costs a vendoring bump and 9.6k reference lines; recorded traces give the same coverage and run on the remote machine without a checkout |
| AI oracle | Recorded traces | Source-cited hand traces only | Kept as the per-role fallback where a stub would grow too much (Phase 14 decision B); weaker because the expected values are typed by the porter |
| Populator verification | Exact table via the populator recorder | Statistical comparison against real Oolite only | The populator is deterministic arithmetic under scripted draws; statistics from a 40 s-per-run headless game are noisy and slow. Keep real Oolite for a handful of sanity censuses |
| Station AI | One hashed `world.station` record driven by the priority evaluator | Promote the Coriolis to a dynamic entity | Breaks fixed ids 1-5, the "statics are never hashed or stored" rule, collisions ("the station is not in the store", `collide.ts:402-420`) and the dock contact path |
| Scooped pods | Merge into `profile.cargo` at scoop time (recorded divergence) | Separate in-flight pod list saved in v6 | Needs a new save field and a hold-merge step at dock for no observable gain until jettison exists |
| Legal bounty timing | At the kill (Oolite) | On docking (milestone text) | Not what Oolite does (finding 1); would need a divergence row |
| Role-category lookups | Compiled `role-categories.json` | Hard-code role lists in TS | Two sources of truth; the plist has 214 lines and OXPs are out of scope but the file is the authority |
| Comms text | Compile templates, expand in the UI | Expand in the sim | Expansion draws random choices; the sim must stay deterministic and free of presentation RNG |

## What NOT to Use

- **No JS interpreter or `vm` in the shipped bundle**, no QuickJS or WASM runtime. `check:dist` and `harness-isolation` already enforce that harness code never reaches `dist`.
- **No AI framework**: no behaviour-tree, utility-AI, FSM (xstate) or ECS library. The priority list is a data literal walked by about 100 lines of evaluator; a library would hide the exact `reconsider` and `notcondition` semantics that the traces check.
- **No spatial-index library** (kd-tree, BVH, rbush). `WorldView.scan` is O(n) over at most about 110 live ships plus debris; at one reconsider every 1 to 60 s per ship this is not a hot path. Add an index only if `tests/diag/frame-cost.spec.ts` shows it.
- **No graph or pathfinding library.** `systemsInRange` is a filter over 256 systems by integer distance; `_nearbySafeSystem`, `_weightedNearbyTradeSystem` are loops over that list (`oolite-populator.js:2477-2640`).
- **No string-template or i18n library** for `descriptions.plist`. The used subset (`[key]`, `%H`, `%R`, a few `[x|dcr]` formats) is about 100 lines.
- **No new RNG library and no `Math.random` in `src/sim`** (`tests/guards/sim-determinism-bans.test.ts`). Every populator and AI draw comes from a world or entity stream; Oolite's one global stream is replaced by per-entity streams (statistically, not stream, equal; record it in `FIDELITY.md` as Phase 15 did for cargo).
- **No second save store, no NPC persistence, no saved population.** Only `legalStatus` and `shipKills` join the save.
- **No promotion of static bodies to dynamic entities** (finding 3).
- **No OXP-facing facade, scripting hooks or `worldScripts` emulation.** The `oolite_intership` and `AIScript` objects become flat params.
- **Do not port what is deferred**, and do not leave it half-wired: missiles, ECM, escape pods and insurance, scavengers and shuttles, rock hermits, asteroids, thargoids, assassins' contract logic, sun-skimming and fuel scooping at the sun, contraband penalties (`PlayerEntity.m:6341-6346`, `:6412-6417` stay unported and the todo `2026-11-25-cargo-legality-penalties` holds them), the docking-clearance protocol and `penaltyForUnauthorizedDocking` (`PlayerEntity.m:6358-6360`). Each stubbed answer gets one `FIDELITY.md` row naming the Oolite line.
- **Do not hand-edit anything in `src/content/generated/` or `third_party/oolite/`**; both are written by the ingest and `vendor-oolite.sh` and are checked by `assets:check` and `CHECKSUMS.sha256`.
- **Do not weaken the frozen acceptance thresholds or detectors** to make a new fight pass.

## Installation

```bash
# Nothing to install. No package.json change, no image change.
# Content (after the converters and the vendored models land):
docker compose run --rm assets
docker compose run --rm assets npm run assets:check

# Vendor the new models and textures (human-run, the only sanctioned route; edit FILES first)
docker compose run --rm assets sh scripts/vendor-oolite.sh
docker compose run --rm lint npx prettier --write ASSETS.md

# Record AI and populator oracles (dev machine with the Oolite checkout; export the pin as in 14-SPIKE.md)
rm -rf /tmp/oolite-7437f22 && mkdir -p /tmp/oolite-7437f22
git -C /home/opencode/git/oolite archive 7437f22 src Resources | tar -x -C /tmp/oolite-7437f22
docker compose run --rm -v /tmp/oolite-7437f22:/oolite:ro -e OOLITE_SRC=/oolite test \
  npx tsx tools/ai-harness/record.ts --role police     # proposed script

# Replay (any machine, CI included)
docker compose run --rm test npx vitest run tests/sim/ai tests/oracles
```

Gates by change type (AGENTS.md): pure sim work in `src/sim/` needs `test`, `lint`, `typecheck`; anything in `src/app`, `src/render`, `src/ui` and the content widening needs `verify`; `verify-full` at the end of the milestone and after the save-schema and snapshot bumps; the 20-seed acceptance run by hand on the remote machine after every change under `src/sim/npc/**`, `src/sim/world/**` or `ships-npc.json`.

## Version Compatibility and Risks

| Item | Risk | Mitigation |
|------|------|------------|
| Draw calls with 28 hull keys | The NPC layer is one `InstancedMesh` per (model, primitive) (`npc-ships.ts:7`). A busy system can show 15 or more distinct types, each with several primitives, against the 50 draw-call budget that `budget.spec.ts` enforces | Measure with a full anarchy early (a render-side plan before the populator ships). Options: merge primitives per hull at build time, share a texture array across variants, or raise the budget by an owner-recorded decision. Do not hide it by lowering traffic |
| Entity cap 256 | Up to ~110 ships plus debris from several kills | The Phase 16 cap logic already refuses and evicts; add a test with an anarchy populated and ten kills |
| Fixed-tick versus engine-frame AI wake | Decisions land on 1/120 s ticks, Oolite's on frames | Compare written wake times and decisions, as the spike advises |
| Per-ship fuzzy-boolean draws at spawn | Order of draws differs from Oolite's single stream | Not stream-equal by design; record in `FIDELITY.md` (cargo precedent) |
| `has_fuel_injection` (asp, ferdelance, krait, viper-interceptor, cobramk1-alt) | v2.2 recorded the afterburner as a scope cut (`npc-ships.ts` header). Interceptor AIs speed up with injectors (`oolite-priorityai.js:1602`, `:3582`; role AIs `// needed injectors to fix`) | Keep the cut and record the narrower pursuit speed for those hulls, or port the afterburner; decide in the AI phase, not silently |
| Equal-priority populator entries | Oolite sorts `[populatorSettings allValues]` by priority only, so equal priorities have unspecified order (`Universe.m:1707-1716`); the script gives every group priority 40 | Use insertion order (the script's `setPopulator` order) and record it |
| Real Oolite census feasibility | Choosing a start system from an OXP is unproven | One spike plan, boxed; the recorder fixtures do not depend on it |
| Recorded fixtures go stale on a pin bump | The pin moves only through `vendor-oolite.sh` | The drift check (re-record and compare when `OOLITE_SRC` is set) plus the script SHA-256 in each fixture header |

## Dependency order implied by the stack (for the roadmapper)

1. Content: widen the NPC catalogue (28 records, new models and textures, role categories, ai-map, comms, lift the aft-weapon refusal) and the single world snapshot v5 bump. Everything else depends on these.
2. Priority-AI core plus the populator planner and its recorders (the populator recorder is the cheapest oracle; build it first to prove the harness pattern on exact data).
3. Role AIs in order of dependency: trader and station (legal marking and traffic), police, pirate family, hunters and escorts. Legal status and bounty arrive with police and the station, not before.
4. Player legal status, fines, docking refusal, kill tally, rating, F5 (needs save v6).
5. Scooping (collision branch, tractor behaviour, F3 item, pod contents) can run in parallel with 3 after step 1 because it needs only pods with commodities.
6. Repopulation, the full-anarchy budget run, the Playwright journey, the real-Oolite census and the acceptance rerun close the milestone.

## Sources

- Oolite checkout at `/home/opencode/git/oolite`, pin `7437f22` (HIGH): `Resources/Scripts/oolite-populator.js`, `oolite-priorityai.js`, `oolite-global-prefix.js`; `Resources/AIs/oolite-{trader,pirate,pirateFighter,pirateFreighter,pirateInterceptor,police,bountyHunter,bountyHunterLeader,escort,station,defenseShip}AI.js`; `Resources/Config/{shipdata,autoAImap,role-categories,pirate-victim-roles,descriptions,scenarios}.plist`; `src/Core/Universe.{h,m}`; `src/Core/Entities/{ShipEntity,ShipEntityAI,PlayerEntity,PlayerEntityContracts,StationEntity}.m`; `src/Core/OOConstToString.m`; `src/Core/OOStringExpander.m`.
- Wegolite tree as read on 2026-11-25 (HIGH): `.planning/PROJECT.md` (Key Decisions on AI port, AILib harness, snapshots, saves), `AGENTS.md`, `package.json`, `src/sim/{ai,world,combat,player,events.ts}`, `src/content/{schemas,generated}`, `src/persistence/save.ts`, `src/ui/station-model.ts`, `tools/{oolite-ingest,ai-harness,oolite-reference}`, `third_party/oolite/{SOURCE.md,pin.json}`, `tests/{guards,acceptance,oracles,e2e/budget.spec.ts}`, `.planning/milestones/v2.2-phases/14-npc-flight-and-steering-fidelity-gate/14-SPIKE.md`.
- Scratch measurements (MEDIUM, not committed): a stubbed run of the real `oolite-populator.js` over the 8 governments of galaxy 0 (320 draws per government, real `planetDistance`, a synthetic sun position); a shallow-merge `like_ship` resolver over `shipdata.plist` for the role-to-key map; a regex reachability count over the priority library. Re-run properly by the recorders above before any number is quoted in a plan.
