# Phase 22: Initial Population - Research

**Researched:** 2026-11-26
**Domain:** Port of the initial-population half of Oolite's `oolite-populator.js` (pure planner, oracle fixtures recorded from Oolite's own script through the dev-only `node:vm` harness, deterministic placement from forked streams, atomic group spawn under the 256-entity cap, live-session switch with one re-pin, draw-call proof, boxed real-Oolite spike)
**Confidence:** HIGH for the script structure, formulas, traps and in-repo seams (all read this session at the pinned checkout and the Wegolite tree); MEDIUM for the plan split and the recorder design (a recommendation, no precedent for a *recording* harness exists yet); LOW for the population-size numbers (scratch model, not the planner) and for the real-Oolite spike.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Ships are placed exactly as Oolite places them. STATION_AEGIS is `OORandomPositionInShell(station, 1.2 × collision radius, 2 × SCANNER_MAX_RANGE)`, rejected while inside 1.5 planet radii (`Universe.m:1811-1815`), and it goes through the existing samplers in `src/sim/world/placement.ts`. Initial population never launches a ship from the station. Oolite's STATION_AEGIS entries (`oolite-populator.js:671`, `:946`) are plain coordinates, so no launch or exclusion logic is added. This keeps the draw counts equal to the oracle's.
- **D-02:** Until Phase 23 an inert ship can land on the dock axis, where a launching player would hit it. The 2,048-system census (success criterion 3) also counts the ships that land inside the launch corridor (the docking corridor geometry in `src/sim/dock/corridor.ts`, extended out along the launch path). If the count is above zero, add a todo with a tripwire guard that Phase 23 closes, since its AI moves ships away from the station. Do not add an exclusion zone in this phase. — **Reversibility:** reversible.
- **D-03:** The initial populator uses no planet location in scope. Planet-orbit codes appear only for rock hermits, which are out of scope. Planet launches and landings belong to the WORLD-09 stand-in (Phase 23) and repopulation (Phase 26).
- **D-04:** The populator recorder records about 32 systems × 3 seeds under `tests/oracles/population/`. The sample is stratified: all 8 government types; rich and poor economies; low and high tech levels; at least one isolated system (no neighbours within 7 LY); at least one bottleneck system; the largest anarchy by expected population; systems from more than one galaxy. The aim is to cover the rare branches of the formulas (the neighbour terms, the bottleneck test, the anarchy tail). The oracle size affects test coverage only: the game populates all 2,048 systems with the same planner either way. Fixtures stay in the hundreds of KB. Research picks the concrete system list and records why each system is in it. — **Reversibility:** reversible.
- **D-05:** A group spawns whole or not at all. The populator may fill at most `MAX_ENTITIES` (256) minus a debris reserve. When a group does not fit, it is skipped and population continues with the next entries in the script's order, so smaller later groups (police, for example) can still fit. Each group draws from its own forked stream, so a skip moves no other group's draws. — **Reversibility:** reversible.
- **D-06:** The debris reserve is set from measured data: the worst debris of a fight, as in success criterion 5. The bound lives in `src/sim/world/limits.ts`. A test over all 2,048 systems asserts that no group is skipped in practice. Oolite has no such cap at population time, so the rule gets a `FIDELITY.md` row, and the row says that it never triggers for any committed system.
- **D-07:** One independent plan at the end of the phase, with at most two attempts per obstacle. Success means headless Oolite in the reference container (`tools/oolite-reference`, run on the remote machine through `run-remote.sh`) starts in a chosen system through a scenario save, for one anarchy and one quiet system, and dumps a census of ships by role, with a script that repeats the run. Failure is recorded as an answer: where it got stuck and why. Phase 26 then compares against the oracle only. Either outcome closes the phase; the spike never blocks it. — **Reversibility:** reversible.

### Claude's Discretion

- The plan split after the fixed first plan (the recorder and its fixtures before the port).
- How the neighbourhood facts (`systemsInRange` within 7 LY, `bottleneck`) are computed outside the planner and injected, and how they are checked against Oolite's native code.
- The exact debris-reserve number, from measurement (D-06).
- The corridor-hit measurement method (D-02).

### Folded Todos

- `2026-11-25-pod-kind-live-populator.md` (`resolves_phase: 22`): the live populator sets `cargoKind` at spawn, per Oolite's per-context `setCargoType` calls: a trader leaving the station gets PLENTIFUL_GOODS, and an arriving trader gets SCARCE_GOODS; a medical ship gets MEDICAL_GOODS (narcotics, E-198); offender opportunists and pirates get PIRATE_GOODS; couriers get ILLEGAL_GOODS; a ship whose cargo type is never set carries no cargo. Add a runtime test over sample worlds that no placed ship has `cargo > 0` with `cargoKind` 0, and that each kind matches its spawn context. Do not widen the allow-list of `tests/guards/pod-kind-fallback.test.ts`. Update the FIDELITY rows that describe the fallback (E-197 and the E-78 rewrite) so they say it applies only to the inert path.
- `2026-11-25-missiles-and-ecm.md` (roadmap-named): every NPC spawns with zero missiles. The tripwire guard lands with CBT-19 in Phase 23, not here.

### Deferred Ideas (OUT OF SCOPE)

None came up in the discussion; it stayed within the phase scope. Reviewed todos not folded: Phase 23 (`narrow-kill-time-ship-target-lost`, `player-ident-lock-in-target-targets-self`, `skip-shiphit-for-a-doomed-target`), Phase 25 (`mutual-kill-credit-symmetry`), Phase 26 (`acceptance-run-with-collisions-on`); the `npc-variant-family-instancing` todo (deferred plan 21-18) stays behind its tripwire in `tests/e2e/anarchy.spec.ts` and becomes live only if the real anarchy population exceeds 50 calls.

(Phase scope text, ROADMAP/REQUIREMENTS: repopulation (WORLD-19), launches and departures (WORLD-09) and every AI behaviour belong to later phases; scavengers, shuttles, medium and heavy hunters, assassins and trader opportunists (WORLD-08b) are recorded cuts.)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| WORLD-08 | Each system is populated with traders, pirates (independents and packs), police and light bounty hunters at Oolite's rates for its government, economy, tech level and neighbours (`oolite-populator.js`), matching recorded oracle fixtures of Oolite's own script. (Narrowed: scavengers, shuttles, medium and heavy hunters deferred.) | "Populator structure" (entry table, formulas, builders), "Recorder design" (stub host, per-site tagged draws, fixtures), "Neighbourhood facts", "Placement and spawn", "Population census", Validation Architecture |
| QUAL-09 | A full anarchy population with combat stays within the draw-call budget; a render spike measures it before the populator ships, and any budget raise is an owner decision. | "Draw-call proof" (budget 50, 39/42/<=49 measured in Phase 21, per-key instancing, the booting route `dockedSaveAt`), Validation Architecture |
| QUAL-12 (standing) | Determinism holds with full traffic; the frozen 20-seed run stays 21 of 21 after every plan touching `src/sim/npc/**`, `src/sim/world/**` or `ships-npc.json`. | "Re-pin inventory", Validation Architecture "Sampling Rate" |
| QUAL-13 (groundwork) | Traffic composition compared against headless Oolite. | "Real-Oolite census spike" |
</phase_requirements>

## Summary

The phase is a **port plus an oracle**, and the oracle is a new kind of artefact: the Phase 14 and 17 "oracles" are hand-authored TypeScript transliterations with JSON fixtures (`tests/oracles/npc/**`, guarded by `tests/guards/oracle-independence.test.ts`); nothing in the repo yet *records* the output of Oolite's own JavaScript. What exists is the dev-only AI-11 harness (`tools/ai-harness/{host,load}.ts`): `node:vm` contexts, a recording stub host, one scripted `Math.random`, a one-way isolation guard and a `check:dist` marker scan. The populator recorder extends that harness. `oolite-populator.js` is unusually friendly to it: `systemWillPopulate` is one function that first computes rates from the neighbourhood and registers about 46 `setPopulator` entries, whose `groupCount` values are drawn inline through a local `randomise()` (3 `Math.random()` calls each), and then Oolite's engine calls each entry's callback once per group. The port is therefore a pure *plan* (counts per entry) plus pure *group builders* (ships, bounties, cargo kinds, weapon levels, skill, fuel, home and destination systems, leaders, followers and escorts), and the recorder can attribute every `Math.random()` call to a site.

Three findings reshape the scope the CONTEXT assumes. (1) **Escorts are engine behaviour, not script behaviour, and they are in the population.** `_addFreighter`, `_addCourier` and `_addPiratePack` read `escortGroup.ships` right after `addShips`; the escorts are spawned by `ShipEntity.setUpEscorts` when the leader enters the universe, from the `escort_roles` that Phase 21 already compiled into 7 hulls (anaconda, boa, boa-mk2, python-trader and four pirate freighters). In an anarchy a trader Anaconda brings about 5 escorts. The stub host must model `setUpMixedEscorts`/`setUpOneEscort`, and the port must spawn them (Phase 23's roadmap text says "now that escorts spawn"; the Phase 16 record says to port `escortCheckMother` "in the first phase that spawns escorts"). (2) **Oolite has an upstream bug that dominates the population tail:** `couriers *= 1.5` (`oolite-populator.js:313`) multiplies the *accumulator*, not the rate, so a bottleneck system with 10 to 12 neighbours gets up to about 1.5^11 times its courier rate. In the scratch model the heaviest systems are bottlenecks (courier-dominated), not anarchies. The fidelity rule says to port it and record it; the 2,048-system census then measures the real peak. (3) **`systemsInRange` is used with three ranges (7, 3.5 and 25 LY), not two**: `_nearbySystem(25)` for long couriers and `distanceToSystem` for fuel, so the injected facts must offer an arbitrary-range query over the whole galaxy, not two precomputed lists.

The in-repo seams from Phase 21 are all present and unused: `Entity.{bounty, role, groupId, cargoKind, fuel, homeSystem, destinationSystem, injector, weaponTypes}`, `World.groups` (`{id, leader}`, bound 128), `World.populator` (the repopulation clock, untouched this phase), `forkSeed` purposes, `escortCoordinates`, the strict snapshot allow-list. One content gap: the record has **no `hasHyperspaceMotor`** (the script reads it at `:1714` to pick the pirate weapon level 1.75 or 1.3); it must be added to the NPC schema and `ships-npc.json` (a QUAL-12 trigger path).

**Primary recommendation:** Build, in this order, (1) the recorder (stub host with per-site draw tags, fixtures, strict schema, self-test; no `src/` change), (2) a pure neighbourhood module checked against recorded all-2,048-system tables, (3) the pure planner and group builders replayed against the fixtures, (4) placement/spawn with one forked stream per group and per concern, atomic under the cap, (5) the census and constants, (6) one plan that flips the live session and the Node twin to the new populator and re-pins every traffic-on test once, (7) the QUAL-09 browser spec on the largest galaxy-0 anarchy, (8) the boxed spike. Port the script's arithmetic exactly (including the courier bug), cut only what CONTEXT names plus asteroids, hermits, buoys, aegis raiders, Thargoids and the AI switches, and put every cut in a table the replay test checks.

## Architectural Responsibility Map

Wegolite is a static client; the tiers are code layers.

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Rates, `randomise` counts, group builders (kinds, bounty, cargo kind, weapons, skill, fuel, systems) | `src/sim/world/` (pure, no Three/DOM) | — | Deterministic, fixed-step, unit-testable (AGENTS "Conventions"); same code in browser and Node twin |
| Neighbourhood facts (`systemsInRange(r)`, bottleneck, distances) | `src/sim/` pure helper over chart data | `src/app/session` supplies the galaxy list | Needs only `chartDistance` and the system records; planner receives the derived object (CONTEXT discretion) |
| Location sampling (WITCHPOINT, lanes, STATION_AEGIS) | `src/sim/world/placement.ts` | — | Already ports `locationByCode`; WITCHPOINT is one additive case |
| Atomic group spawn, cap, `World.groups` write | `src/sim/world/` | — | `spawnEntity`, `MAX_ENTITIES`, `limits.ts` are sim |
| Record bridge (`NpcShip` to planner record, new `hyperspaceMotor`) | `src/app/session/traffic.ts` + content schema/converter | — | `traffic.ts` is the one source shared by session and Node replay |
| Live wiring (`createSystemPopulate` getters for system, galaxy, layout) | `src/app/session/` | `tests/helpers/tick-script.ts` twin | Closure reads `ctx.core` at call time like `createInertPopulate` |
| Oracle recording (vm, stub host, tagged draws) | `tools/ai-harness/` (dev-only) | `tests/oracles/population/` (committed fixtures, schema, self-test) | Harness must stay out of `src/`/`dist`; fixtures replayed in CI without the checkout |
| Draw-call proof | Browser spec (`tests/e2e/`) | render layer unchanged | One instanced call per (key, primitive); population size does not add calls |
| Real-Oolite census | `tools/oolite-reference/` + throwaway OXP outside the repo | remote machine | Spike, not a gate |

## Standard Stack

No new packages. Everything is plain TypeScript over data and tools that exist.

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript (strict) | repo-pinned | planner, builders, neighbourhood, recorder | `src/sim` rules: pure, no Three/DOM, no `Math.random`/`Date` (`sim-determinism-bans`) |
| zod | repo-pinned (4.6.7 per research SUMMARY) | strict fixture schema (`tests/oracles/population/schema.ts`), widened NPC record schema | The oracle contract style of `tests/oracles/npc/schema.ts`; oracle files may import only `zod` and `vitest` |
| Vitest + fast-check | 5.1.1 / 4.11.0 [CITED: 21-VALIDATION.md "Test Infrastructure"] | oracle replay, totality properties, census | Existing |
| Playwright | 1.65.1 [CITED: 21-VALIDATION.md] | the QUAL-09 spec | Existing |
| `node:vm` + `tsx` (`tools/ai-harness`) | built in / repo-pinned | run `oolite-populator.js` against a stub host | AI-11 precedent; `vm` is not a security boundary and is used only on pinned operator-supplied files |

### Supporting (in-repo, reuse, do not rewrite)
| Module | Purpose | Use |
|--------|---------|-----|
| `src/sim/hyperspace/jump.ts` `chartDistance` | Oolite's `distanceBetweenPlanetPositions` with C truncation | The neighbourhood module's only distance source |
| `src/sim/world/placement.ts` | `positionInCylinder`, `positionInShell`, `randomSpatial`, `locationByCode`, `randomQuaternion`, `MAX_PLACEMENT_TRIES` | Placement; add `WITCHPOINT` |
| `src/sim/world/populate.ts` `parseRoleToken`, `pickRecord`, `isScanClass` | Role weights and the `OOProbabilitySet` pick | Record pick for `addShips(role, ...)` (exports exist; do not edit the frozen file) |
| `src/sim/rng.ts` `forkSeed`, `mix32`, `createRngState`, `rngNext` | Stateless forked streams | One stream per group and concern |
| `src/sim/npc/escort.ts` `escortCoordinates` | Formation slot position | Escort spawn position (`coordinatesForEscortPosition`) |
| `tests/e2e/helpers/save-fixtures.ts` `dockedSaveAt`/`inFlightSaveAt` | Save at a named galaxy-0 system | Boot the QUAL-09 spec in the largest anarchy without a hook |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Per-site tagged draw streams | One stream per group with "burn" counts for cut sites | Burn counts need `record.missiles`, which the `npc-missiles-tripwire` forbids reading outside `src/sim/player/` and `traffic.ts` (see Pitfall 6) |
| Neighbourhood lists precomputed at 7 and 3.5 LY | A range query over the injected galaxy | The script also asks 25 LY and per-system distances |
| Id-keyed `inj`/`scoop` forks (registered in 21-03) | Group-keyed forks | Id-keyed forks move when an earlier group is skipped (ids shift), which the success criterion forbids |

**Installation:** none. **Package Legitimacy Audit:** not applicable (no external package is added or upgraded). `[VERIFIED: package.json, no change required]`

## Package Legitimacy Audit

No external packages are installed by this phase. Table omitted by design.

## Architecture Patterns

### System Architecture Diagram

```
 RECORD (dev only, once; docker run with the Oolite checkout mounted read-only)
 oolite-populator.js --vm--> stub host --> fixtures (tests/oracles/population/*.json, committed)
   (systemWillPopulate)       |  setPopulator entries (name, priority, location, groupCount)
                              |  per-callback: tagged draws, addShips/addGroup calls, ship property writes
                              |  engine model: record pick, escorts, ship defaults
 CI REPLAY (no checkout)
 fixtures --draws--> planner (pure) --> expected counts + group specs --compare--> recorded

 RUN TIME (arrival or Continue, traffic on)
 arrival -> lifecycle.begin(marketSeed) -> populate(world, {traffic})
              |
              v   facts() read at call time: system record, galaxy list, layout, records
    neighbourhood(galaxy, system)  --> {locals7, seconds, very35, veryseconds, bottleneck, inRange(r), distanceTo(id)}
              |
              v
    plan: for entry e in FROZEN_ENTRY_TABLE: count_e = randomise(rate_e, stream(worldSeed, e, "count"))
              |
              v
    for each entry in script order (priority, then insertion), group g in 0..count_e-1:
        pos     = locationByCode(stream(e, g, "loc"), code)         -- WITCHPOINT / LANE_* / STATION_AEGIS
        group   = buildGroup(entry, pos, stream(e, g, <site>) ...)  -- ships, escorts, bounty, cargoKind,
                                                                       weapons, skill, fuel, systems
        fits?   = liveCount + group.size <= MAX_ENTITIES - RESERVE and groups < MAX_WORLD_GROUPS
        yes -> spawnEntity x n (leader first), write World.groups   no -> skip whole group, no draw moves
              |
              v
    inert world (ai: null): scanner, mass lock, jump blockage, shootable; render = 1 call per (key, primitive)
```

### Recommended Project Structure
```
tools/ai-harness/
├── populator-host.ts      # stub host for the populator (system, Ship, ShipGroup, SystemInfo, engine model)
├── populator-record.ts    # driver: load script, run systemWillPopulate, run callbacks, write fixtures
├── population-systems.ts  # deterministic selector of the recorded systems (documents why each is in)
└── (host.ts, load.ts, dist-check.ts unchanged)
tests/oracles/population/
├── schema.ts              # zod strict contract (imports zod only)
├── population.self.test.ts# schema + internal invariants (no src import)
└── fixtures/              # <system>-<seed>.json (counts + groups), neighbourhood-all.json, edge-draws.json
src/sim/world/
├── neighbourhood.ts       # pure: systemsInRange(range), bottleneck, distances (uses chartDistance)
├── population/            # NEW directory beside the frozen populate.ts
│   ├── table.ts           # FROZEN_ENTRY_TABLE (append-only ordinals), cut table
│   ├── plan.ts            # rates, randomise, counts
│   ├── groups.ts          # group builders (traders, pirates, packs, hunters, police, interceptors)
│   ├── kit.ts             # setWeapons / setSkill / setFuel (+ cut: setMissiles)
│   ├── escorts.ts         # setUpMixedEscorts model
│   └── spawn.ts           # atomic spawn, cap, World.groups
src/app/session/traffic.ts # createSystemPopulate beside createInertPopulate; record bridge gains hyperspaceMotor
tests/sim/world/           # populate-system.oracle.test.ts (replay), neighbourhood.test.ts, census.test.ts, ...
```
The frozen files (`populate.ts`, `createInertPopulate`, `INERT_RECORD_KEYS`) are not edited; only additive exports elsewhere.

### Populator structure (Q1): what the script does, in order

`[VERIFIED: /home/opencode/git/oolite/Resources/Scripts/oolite-populator.js (identical at pin 7437f22 and checkout HEAD 21978c37b: `git diff --stat 7437f22 HEAD` on the file is empty)]`.

**Setup phase** (`systemWillPopulate`, `:97-1023`) runs once, in this order:

| Lines | What | Draws | Keep? |
|-------|------|-------|-------|
| 111-137 | `oolite-nav-buoy` (priority 5), `oolite-witch-buoy` (10) at `COORDINATES` | none | Cut: Wegolite's buoys are statics (Phase 18) |
| 140-186 | asteroid clusters via `scrambledPseudoRandomNumber`, entries `oolite-route1-asteroids`, `oolite-route2-asteroids` (priority 20) | none (hash-style) | Cut (asteroids deferred) |
| 189-213 | `oolite-offlane-hermit` (priority 99, `PLANET_ORBIT_HIGH`) | none | Cut (hermits; D-03) |
| 219-222 | `if (system.sun.isGoingNova) return;` | — | Never true in scope |
| 237-256 | `locals = systemsInRange()` (7), `seconds[i] = locals[i].systemsInRange()`, `verylocals = systemsInRange(3.5)`, `veryseconds[i] = verylocals[i].systemsInRange(3.5)`, `bottleneck = _systemIsBottleneck(locals, seconds)` | none | Facts (injected) |
| 275-327 | per local: freighter rate (economy match and danger terms), courier and smuggler rates, **`couriers *= 1.5` when bottleneck (`:311-314`)** | none | Keep, including the bug |
| 333-340 | `pirateAegisRaiders` (government 0 and TL < 8) | none | Cut (rate only used by repopulator and `_addAegisRaiders`) |
| 343-465 | `pindependents`, `pflight/pfmedium/pfheavy` (local), remote and returning pack rates from `verylocals` (government below own) | none | Keep |
| 472-562 | `hlight`, `hmedium`, `hheavy` (the latter two only feed cut entries) | none | Keep `hlight`; compute `hmedium/hheavy` only if cut entries are replayed |
| 568-592 | `police`, then **government <= 1: police folds into `hlight`, `police = 0`**; `interceptors` (TL >= 9) | none | Keep |
| 595-601 | `assassins = couriers*(Math.random()+Math.random())` (2 draws), bottleneck adds `couriers`, `*2/(gov+1)` | **2** | Cut (assassins), but the 2 draws exist in the recording |
| 606-608 | Thargoid rates | none | Cut |
| 613-624 | repopulator rates `/180` | none | Not initial |
| 630-639 | `l1length = |mainPlanet.position|`, `l2length = |planet - sun|`, `l3length = |sun|`, `trilength` | none | Facts |
| 644-653 | `randomise(count)`: `count*(0.25+0.75*(r1+r2))`, `floor`, then `if (Math.random() < count-r) r++` | **3 per call, always** (the third draw is taken even when `count-r` is 0) | Keep |
| 655-986 | the `setPopulator` entries (table below); each `groupCount: randomise(...)` is evaluated as an argument, in script order | 3 per entry | see table |

**Entry table** (priority 40 unless noted; locations; builder). Cuts marked. Insertion order is the replay order.

| # | Entry name (script line) | Location | Builder | Status |
|---|--------------------------|----------|---------|--------|
| 1 | `oolite-freighters` (:661) | LANE_WP | `_addFreighter` | keep |
| 2 | `oolite-freighters-docking` (:668), count `randomise(initial/10)` | STATION_AEGIS | `_addFreighter` | keep |
| 3 | `oolite-couriers-route1` (:676) | LANE_WP | `_addCourierShort` | keep |
| 4 | `oolite-couriers-route3` (:684) | LANE_WS | `_addCourierLong` | keep |
| 5 | `oolite-smugglers` (:692) | LANE_WP | `_addSmuggler` | keep |
| 6 | `oolite-hunters-triangle` (:703) | LANE_WPS | `_addLightHunter` | keep |
| 7 | `oolite-hunters-route1` (:711) | LANE_WP | `_addLightHunter` | keep |
| 8-11 | `oolite-hunters-medium-route1/-route3`, `-heavy-route1/-route3` (:719-751) | LANE_WP / LANE_WS | `_addMediumHunterRemote`, `_addHeavyHunterRemote` | **cut** (CONTEXT) |
| 12-14 | `oolite-pirate-independent-route1/2/3` (:756-778) | LANE_WP / LANE_PS / LANE_WS | `_addIndependentPirate` | keep |
| 15-17 | `oolite-pirate-light-route1` (3/4), `-light-triangle` (1/4, LANE_WPS), `-light-remote` (:782-803) | LANE_WP / LANE_WPS / LANE_WP | `_addLightPirateLocal/Remote` | keep |
| 18-20 | medium: `route1`, `triangle`, `remote` (:806-827) | same | `_addMediumPirateLocal/Remote` | keep |
| 21-23 | heavy: `route1`, `triangle`, `remote` (:830-853) | same | `_addHeavyPirateLocal/Remote` | keep |
| 24 | `oolite-assassins` (:915), `groupCount = min(randomise(assassins), maxas)` | WITCHPOINT | `_addAssassin` | **cut** (CONTEXT) |
| 25 | `oolite-police-route1` (:927) | LANE_WP | `_addPolicePatrol` | keep (zero for government <= 1) |
| 26 | `oolite-police-triangle` (:936) | LANE_WPS | `_addPolicePatrol` | keep |
| 27 | `oolite-police-stationpatrol` (:943), **no `groupCount`, engine default 1** (`Universe.m:1727`) | STATION_AEGIS | `_addPoliceStationPatrol` | keep: one police or interceptor in **every** system |
| 28 | `oolite-interceptors-route1` (:954) | LANE_WP | `_addInterceptors` | keep (assumption A1) |
| 29 | `oolite-interceptors-witchpoint` (:963) | WITCHPOINT | `_addInterceptors` | keep (assumption A1) |
| 30-31 | `oolite-thargoid-scouts` (:972), `-strike` (:980) | LANE_WPS | `_addThargoidScout/Strike` | **cut** (assumption A2; research SUMMARY defers Thargoids) |

Engine order: `[populatorSettings allValues]` sorted with `populatorPrioritySort`, an `NSArray` sort that returns `NSOrderedSame` for equal priority (`Universe.m:9990-10001`); the dictionary order of equal-priority entries is **not defined by the source**. Use script insertion order (a stable sort by priority) and record it as a divergence note in `FIDELITY.md` (assumption A5). Because every group gets its own forked stream, the order only affects ids and which group is skipped under the cap.

**Engine loop** (`Universe.m:1707-1767`): for each entry, `groupCount` times: compute `location` (a vector), call the callback with it. The callback gets a **plain vector**, so `pos.isStation` and `pos.isPlanet` are undefined: every `_addFreighter`, `_addCourier*`, `_addSmuggler`, `_addIndependentPirate` and `_addPiratePack` takes its "arriving" branch (homeSystem from `_weightedNearbyTradeSystem`/`_nearbySystem`, destination = this system, `SCARCE_GOODS`, `_setFuel`). This confirms CONTEXT D-01. The `PLENTIFUL_GOODS` branch is the station-launch branch (Phase 26).

**Group builders** (what each does; the replay test must cover every write):

| Builder (lines) | Draw sites, in order | Writes |
|-----------------|----------------------|--------|
| `_addFreighter` (:1383-1452) | `_weightedNearbyTradeSystem` (1 draw, weights by the freighter rate), `Math.random()*8 > gov` (then `_setMissiles(-1)`, cut), medical-name test (no draw), `Math.random() < 0.05` offender: `bounty = ceil(rand*20)`, `Math.random() < 0.5 && autoAI` opportunist (`_setSkill(2)`, `_setWeapons(2.5)`, `PIRATE_GOODS`), escorts `bounty \|= 3+floor(rand*12)` per escort | role `trader`; `homeSystem`, `destinationSystem = system.ID`, `fuel` (`_setFuel`), `bounty`, cargo kind (`SCARCE`, `MEDICAL` for "Moray Medical Boat", `PIRATE` for an opportunist), escort weapons |
| `_addCourierShort/Long` (:1482-1525) | `_nearbySystem(7)` or `_nearbySystem(25)` (1 draw each), `_nearbySystem(7)` for home | role `trader-courier` (falls back to `trader` if the role has no record), `bounty = 0`, `heatInsulation = 6` (cut: no field), `SCARCE_GOODS`, fuel, systems |
| `_addSmuggler` (:1528-1575) | `ceil(rand*20)`, `_nearbySystem(7)`, `_setWeapons(1.2)` | role `trader-smuggler`, `bounty = min(ceil(rand*20), 2*cargoSpaceCapacity)`, `ILLEGAL_GOODS`, `EQ_FUEL_INJECTION` (always), escort bounties `\|= 3+floor(rand*12)` |
| `_addLightHunter` (:1578-1590) | `floor(r)+floor(r)+2` size, per ship `_setWeapons(1.5)`, `_setSkill(-1)` | `addGroup("hunter", size, pos, 2000)`, `bounty 0`, home = destination = `system.ID` |
| `_addIndependentPirate` (:1696-1734) | size `floor(r*3)+floor(r*3)+2`; if `size > 8-gov`: `1+floor(r*size)`; per ship `20+gov+size+floor(r*8)`, `_setWeapons(1.75 or 1.3)` by `hasHyperspaceMotor`, `_setSkill(4-gov)`, `Math.random()*16 < gov` then `_setMissiles` (cut) | `addGroup("pirate", size, pos, 2500)`, `setBounty`, `PIRATE_GOODS` |
| `_addPiratePack` (:1796-1873) | leader record, `60+gov+floor(r*8)`, assistants `floor(k+(0.5+r1-r2))` per class (2 draws per class even when the result is <= 0), per assistant `20+gov+floor(r*12)` or `50+gov+floor(r*36)` (interceptors), weapons 1.2/1.8/2.05/2.3, leader `_setWeapons(2.8)`, `_setSkill(3)`, `_setMissiles` (cut), `_setFuel`, escorts `\|= 3+floor(r*12)`, `PIRATE_GOODS`, equipment `EQ_SHIELD_BOOSTER`, `EQ_ECM` (cut) | pack composition (below), `homeSystem`/`destinationSystem` via `_nearbyDangerousSystem` (remote) |
| `_addPolicePatrol` (:2052-2076) | `9+rand*6 < TL` role pick (`interceptor` or `police`), size `floor(r)+floor(r)+2` | `addGroup`, bounty 0, home = destination = `system.ID` |
| `_addPoliceStationPatrol` (:2079-2100) | `9+rand*6 < TL` | 1 ship, `primaryRole = "police-station-patrol"`, bounty 0, `maxEscorts = 16` (derived, no field), group = station's group |
| `_addInterceptors` (:2103-2123) | `floor(r)+floor(r)+1+ceil(TL/6)`, `_setSkill(1)` | `primaryRole = "police-witchpoint-patrol"`, bounty 0 |

**Pack composition** (`_addPiratePack`, `lead, lf, mf, hf, thug`): light `(2,1,-1,0)`, medium `(3,2,0,1)`, heavy `(4,4,2,2)` (`:1877-1950`). The count of each class is `for (i = Math.floor(k+(0.5+Math.random()-Math.random())); i > 0; i--)`. For `k = 0` the value is `floor(0.5 + t)`, `t` in (-1, 1), which is 1 with probability 1/8: **a light pack gets a pirate-interceptor 12.5 % of the time and a medium pack a heavy fighter 12.5 % of the time**, though the table says 0. For `k = -1` the loop never runs but two draws are still taken.

**Helpers** (`:2172-2345`): `_setWeapons(ship, level)`: `choice = floor(level)`, `+1` if `level-floor(level) > Math.random()` (the comparison draws exactly once per call, even for integer levels), then 1 or below pulse, 2 beam, 3 beam/aft beam, 4 military/aft beam, 5+ military/military; only if `autoWeapons`; sets `aftWeapon = null` for 1 and 2. `_setSkill(ship, bias)`: only if `autoWeapons && accuracy < 5 && bias != 0`; `|bias|` times `acc += (target-acc)*Math.random()` with target 4.99 (or -5 for a negative bias). `_setFuel`: `7 - distanceToSystem(home)` through the property setter `lround(clamp(v,0,7)*10)` (`OOJSShip.m:1315-1320`), capacity 70 (`ShipEntity.m:6996-7001`). `_nearbyDangerousSystem(gov)`/`_nearbySafeSystem(gov)`: reservoir sampling over `verylocals`, **one draw per matching system** (`Math.random() < 1/found`). `_weightedNearbyTradeSystem`: one draw, walks the cumulative freighter rates.

**Host APIs the stub must provide** (what the script touches in the kept paths; everything else may be absent): globals `system`, `player`, `galaxyNumber`, `log`, `Math.random`, `Vector3D` (`randomDirection`, `add`, `multiply`, `subtract`, `magnitude`), `ShipGroup` (constructor with name and leader, `.ships`, `addShip`), `Ship.keysForRole(role)`, `System.infoForSystem(galaxy, id)`, `expandDescription("[medical-word]")` (`"medical"`, `descriptions.plist:2050`), `worldScripts`; on `system`: `ID`, `info` (`government`, `economy`, `techlevel`, `name`, `systemsInRange(range)`, `distanceToSystem(info)`), `setPopulator(name, def)`, `populatorSettings` (the debug lines at `:989-1019` read `pset[name].groupCount` for **every** entry, cut ones included), `sun` (`position`, `isGoingNova`), `mainPlanet` (`position`, `radius`), `mainStation` (`position`, `vectorForward`, `group`), `stations`, `countShipsWithPrimaryRole`, `addShips`, `addGroup`, `scrambledPseudoRandomNumber` (asteroid code runs before the cut point, so provide the real LCG of `oolite-global-prefix.js:118-133` or stub it); on `player.ship`: `parcels` and `passengers` as empty arrays (read when `gov < 3`). Ship objects need: `name`, `primaryRole`, `bounty` (read/write), `setBounty`, `autoAI`, `autoWeapons`, `hasHyperspaceMotor`, `cargoSpaceCapacity`, `accuracy` (clamp to [-5, 10] and `Math.fround` on write, `ShipEntity.m:1126-1143`), `forwardWeapon`/`aftWeapon`, `subEntities` (empty), `missiles` (array), `fuel`, `homeSystem`, `destinationSystem`, `group`, `escortGroup` (a group whose `.ships` includes the ship itself), `setCargoType`, `awardEquipment`, `removeEquipment`, `switchAI`, `heatInsulation`, `maxEscorts`, `AIScript.oolite_intership`. The wake of every unanswered read is already counted by the harness inventory (`inventory.missing`), which is the right tool to find the exact set.

### Pattern 1: Per-site tagged draw streams (recommended recorder and port design)
**What:** The recorder wraps the script's helper methods (`_setWeapons`, `_setSkill`, `_setMissiles`, `_setFuel`, `_nearby*System`, `_weightedNearbyTradeSystem`) as they are plain properties of `this`, tags every `Math.random()` with the site it came from, and attributes the draws taken between two `setPopulator` calls to the entry registered next (the `randomise` arguments). The fixture stores, per entry: the count draws and the count; per group: draws per tag in order, the stub's engine calls and every property write. The port gives each site its own forked stream (`forkSeed`-derived), so replay feeds each site its recorded draws and the production builder draws from independent forks.
**When to use:** always here; it solves three problems at once: (a) cut sites (missiles, assassin draws) never need a burn count, so the port never reads `record.missiles` (Pitfall 6); (b) a skipped group moves no other group's draws (C4); (c) interleaving between script draws and engine-model draws stops mattering.
**Example (proposal, not in the repo):**
```typescript
// Source: proposal derived from tools/ai-harness/{host,load}.ts and oolite-populator.js:2217-2294
type Tag = "body" | "weapons" | "skill" | "missiles" | "fuel" | "system" | "pick" | "escort";
interface Draws { next(tag: Tag): number }            // production: per-tag forked streams
function setSkill(acc: number, bias: number, draws: Draws): number {
  if (bias === 0 || !(acc < 5)) return acc;
  const target = bias < 0 ? -5 : 4.99;
  let a = acc;
  for (let i = Math.abs(bias); i > 0; i -= 1) a += (target - a) * draws.next("skill");
  return Math.fround(Math.min(10, Math.max(-5, a)));  // float32 property, clamp (ShipEntity.m:1126-1143)
}
```

### Pattern 2: Two-level planner
`planCounts(facts, drawsPerEntry)` returns `{ entryIndex, count }[]` (pure arithmetic, one `count` stream per entry ordinal); `buildGroup(entry, facts, records, draws)` returns a `GroupPlan` (ordered ships with record key, role, bounty, cargoKind, weaponTypes, accuracy, fuel, homeSystem, destinationSystem, injector, group role, escort slot, owner index). Placement and spawn are a third, separate step so the cap rule can look at the *planned size* before any `spawnEntity`.

### Pattern 3: Atomic spawn
Pre-count the whole group (leader + followers + escorts) against `MAX_ENTITIES - RESERVE - live` and `World.groups.length < MAX_WORLD_GROUPS`; skip the whole group when it does not fit; spawn the leader first (so the group id equals the leader's id); never leave a hole. `spawnEntity` returning `ok: false` mid-group (a malformed record) rolls back by trial-spawning into a scratch world as `spawnTestAnarchy` does (`src/sim/ai/test-spawn.ts`, 21-16).

### Anti-Patterns to Avoid
- **Editing `populate.ts`, `INERT_POPULATION`, `createInertPopulate` or `ships-npc.json` records the nine inert keys read.** The 20-seed run and `tests/golden/world/inert-lave-epochs-1-20.json` pin them (C1). `ships-npc.json` may gain a *field* only through the strict schema and with the epoch 1-20 pin re-asserted.
- **Fixing Oolite's bugs silently.** `couriers *= 1.5`, `pos.z % 100000`, `thug = 0` extra interceptors, the third `randomise` draw: port, then record a `FIDELITY.md` row.
- **Reading `record.missiles`** anywhere (guard `npc-missiles-tripwire`), or giving the entity a missile member.
- **Id-keyed forks for per-ship rolls** (`inj`, `scoop`, `cargo` as in the inert path): ids shift when an earlier group is skipped.
- **`for..in`, `Object.keys` order, default `Array.prototype.sort`, `Math.hypot`, `Math.random`, `Date`**: banned or traps (see Pitfalls).

### Recorder design (Q2): what Phases 14 and 17 did, and what to copy

`[VERIFIED: tests/oracles/npc/schema.ts, reference.self.test.ts, tests/guards/oracle-independence.test.ts, tools/ai-harness/{host,load,spike.test}.ts, 14-01 and 17-01 SUMMARY]`

- **Phases 14 and 17 recorded nothing from Oolite.** Their fixtures (`tests/oracles/npc/fixtures/*.json`, `fire/fixtures`, `pursuit/fixtures`) were generated by an independent transliteration of the Oolite source (`reference/*.ts`, `derive.ts`) under `tests/oracles`, with a strict zod schema, closed-form or float32 expected values, tolerances stated per row, and a self-test that re-derives every value. The guard `oracle-independence` forbids any `tests/oracles/**` import except `node:*`, `zod`, `vitest` and relative paths inside `tests/oracles`. Fixture JSON was generated by a scratch script outside the repo.
- **The only thing that ran Oolite's own JavaScript is the AI-11 spike** (`tools/ai-harness`): `loadAiLibrary` builds one `node:vm` context per script, injects host globals as getters that count reads, installs `Math.random = __harnessDraw` (a scripted array, counted), runs each entry with `runInContext(..., { timeout: 2000 })`. Its tests are skipped without `OOLITE_SRC` ("the state on the remote test machine and in CI"). `tests/guards/harness-isolation.test.ts` keeps `src/`, `public/` and the root Vite configs from importing it or containing `AI_HARNESS_SENTINEL`; `npm run check:dist` scans `dist/` for the sentinel, `PriorityAIController` and `oolite-libPriorityAI`.
- **So the populator recorder is the first recording harness.** Copy: the `vm` loader pattern, `track()`-style recording proxies and the `inventory.missing` list, the scripted-draw idea, the isolation guard (add the new tool files to its scope and a sentinel), the fixture-schema-plus-self-test pattern, and "fixtures committed, CI replays without the checkout". Do not copy: hand-derived expected values (the recorded values *are* Oolite's).
- **Where the replay test lives.** `tests/oracles/population/` holds `schema.ts`, the fixtures and a self-test that imports only `zod`/`vitest` (schema strictness, draw accounting, internal consistency such as "sum of group sizes equals the recorded ship list"). The replay that imports `src/` lives outside the oracle tree (e.g. `tests/sim/world/populate-system.oracle.test.ts`), as the Phase 14 ports did.
- **How to run.** `OOLITE_SRC` must hold `Resources/Scripts/oolite-populator.js` (and, for the loader's other files, nothing else). Run in the container with the checkout mounted read-only; the `test` service already bind-mounts the working tree, so output lands in the repository: `docker compose run --rm -v /home/opencode/git/oolite:/oolite:ro -e OOLITE_SRC=/oolite test npx tsx tools/ai-harness/populator-record.ts --out tests/oracles/population/fixtures`. Record `sha256` of `oolite-populator.js` and the pin `7437f22` in a fixture header; a self-test with `OOLITE_SRC` set re-hashes it (same pattern as `tests/contract/fidelity.test.ts` "checks each excerpt when OOLITE_SRC points at a tree at commit 7437f22"). `[VERIFIED: sha256 of the checkout file begins 96a734a6cfc1ee39]`
- **What the stub models vs. what the fixture compares** (the key scoping decision):
  - *Script level, compared exactly:* per-entry counts (`randomise`), group callbacks, tagged draws, `addShips/addGroup` calls (role, count, spread), every property write the callback makes (bounty, cargo type, weapons, accuracy, fuel, home/destination, group links, `primaryRole`, equipment awards), and the position handed to the callback after the callback ran (for `pos.z % 100000`).
  - *Engine level, modelled by the stub, compared exactly against the port's model:* the weighted record pick (the existing `pickRecord` algorithm, one tagged `pick` draw per ship), `setUpMixedEscorts`/`setUpOneEscort` (draws `Ranrot() % 11 < gov+2` per slot, role picks, escort primary role `escort`, bounty inheritance), the trader's `(Ranrot() % 7) < government` escort removal, the trader's random initial cargo flag. These use the committed catalogue (`src/content/generated/ships-npc.json`, readable by a tool) for roles, `autoWeapons`, `name`, `maxCargo`, `escortRoles`.
  - *Not compared, validated by properties instead:* positions and orientations (the engine's global `Ranrot`/`randf` stream cannot be reproduced; same stance as the inert path's cargo comment "statistically equal, not stream-equal"), the `witchspaceLeavingEffects` arrival path for ships inside scanner range of the witchpoint, crew.
- **Draws are the recorder's, not Oolite's.** The recorder scripts the draws (a seeded generator stored as u32 integers; `value = u / 2^32`). Add an **edge-draw fixture** set (draws exactly at thresholds such as 0.05, 0.5, `count - floor(count)`, 0, `1 - 2^-53`) so a `<` versus `<=` port error fails; 3 seeds over 32 systems cover the common branches (the 5 % offender branch is hit about 200 times in 4,000 groups; the 12.5 % pack extras many times).
- **Size.** Script-level draws only: about 90 count draws plus about 15 per group per system and seed, roughly 1,000 u32 values, about 10 KB per fixture with structure; 96 fixtures is on the order of 1 MB. If that exceeds "hundreds of KB", store draws per tag as one string of base-36 integers, or drop the third seed for the systems whose coverage is duplicated. `[ASSUMED: size estimate]`

### Neighbourhood facts (Q3): `systemsInRange` and `bottleneck`

`[VERIFIED: oolite Resources/Scripts/oolite-global-prefix.js:80-91, src/Core/Scripting/OOJSSystemInfo.m:455-482, src/Core/legacy_random.h:154-160, oolite-populator.js:2542-2583; wegolite src/sim/hyperspace/jump.ts:33-97]`

- **Semantics.** `systemsInRange(range = 7)` returns, in **system-ID order**, every other system *in the same galaxy* with `distanceToSystem(other) <= range`; `distanceToSystem` is `distanceBetweenPlanetPositions`: `dx = x1-x2` (int), `dy = (y1-y2)/2` (C int division), `dist = (int)sqrt(dx*dx+dy*dy)` (truncation "is desired"), result `0.4 * dist`. Wegolite's `chartDistance` is the same function:
  ```ts
  const dx = from.x - to.x;
  // Math.trunc, never Math.floor: C integer division truncates toward zero.
  const dy = Math.trunc((from.y - to.y) / 2);
  const dist = Math.trunc(Math.sqrt(dx * dx + dy * dy));
  ```
  (`jump.ts:87-90`). So the 7 LY set is `dist <= 17` (`export const MAX_JUMP_DIST = 17;`, `jump.ts:43`: "17 x 0.4 = 6.8 <= 7.0; 18 x 0.4 = 7.2 > 7.0") and the 3.5 LY set is `dist <= 8` (0.4*8 = 3.2; 0.4*9 = 3.6). There is no exact-boundary case (7.0 and 3.5 would need `dist` 17.5 and 8.75), so the "inclusive vs strict at 7.0" trap in PITFALLS M7 does not occur; the trap that remains is computing with floats (`0.4 * dist <= range`) instead of the integer thresholds, and the 25 LY query (`dist <= 62`, 0.4*62 = 24.8; 0.4*63 = 25.2).
- **Three ranges, plus a distance.** The script asks 7 (`locals`, `seconds[i]`), 3.5 (`verylocals`, `veryseconds[i]`), **25** (`_nearbySystem(25)` in `_addCourierLong`, `:1512`, `:1521`) and `distanceToSystem` of the home/destination system (`_setFuel`, `_setReturnFuel`). The injected object must therefore expose `inRange(range)` over the whole galaxy and `distanceTo(id)`, not two lists. `src/app/session/context.ts:380` carries `readonly galaxy: readonly System[]` (the current galaxy, 256 systems), so the app can supply it. `[VERIFIED: context.ts:380]`
- **`bottleneck`** (`_systemIsBottleneck(locals, seconds)`, `:2542-2583`): empty `locals` is `false`; otherwise a connected-set expansion seeded with `locals[0]`, repeated while it grows: a local joins the set if any of *its own* 7 LY neighbours is already in the set; `true` when the set ends smaller than `locals`. Note it never includes the current system as a node (a "bottleneck" is a system whose neighbourhood falls apart without it). The loop is order-dependent only in speed, not in the result, but port it as written for the trace. The comment at `:2546` says "Oresrati's bottleneck status is undefined": that is the one isolated system in the data, `g7-s162` (0 neighbours), which returns `false`.
- **Isolated systems give an almost empty population.** With `locals.length == 0` every trader rate is 0, so `traders = 0`, `pirates = 0`, `hlight = min(.., 0) = 0`, `police = 0`; what remains is the station patrol (always one) and, because `verylocals` is empty too, `hmedium = hlight/3 = 0`. `outgoing smugglers = .../locals.length` is `Infinity` but is only used by the repopulator. Division by `second.length` cannot be zero (the current system is always in each local's range, `chartDistance` is symmetric).
- **Check against Oolite's native code.** (1) The recorder's stub implements `SystemInfo.systemsInRange` and `distanceToSystem` as a **separate** transliteration of `legacy_random.h:154-160` (the oracle must not share `chartDistance`); the script's own `_systemIsBottleneck` runs unmodified in the vm. (2) Record an **all-galaxies table** in one fixture: for each of the 2,048 systems the sorted ids within 7 and 3.5 LY and the script's `bottleneck` value (call `worldScript._systemIsBottleneck(locals, seconds)` from the harness; a few KB if stored as id lists for the 3.5 set and counts plus ids for the 7 set, or hashed with a stored digest plus the explicit lists for the 32 oracle systems). The port test asserts equality for all 2,048. (3) The real-Oolite spike (below) can log `system.info.systemsInRange().length` and the bottleneck value for its two systems as a native cross-check.
- **Where it lives.** `src/sim/world/neighbourhood.ts` (pure, uses `chartDistance`, no content import: the caller passes `{ id, systemIndex, x, y, government, economy, techLevelRaw }[]`; `techLevelRaw` is the plist `techlevel` with no +1, `src/content/schemas/system.ts:20`). The app builds the facts at populate time from `ctx.core.galaxy` and `ctx.core.system`. Computing `locals` plus 12 neighbours' `seconds` is about 2,000 distance evaluations per arrival; cache per `(galaxy, system)` if a profile shows it matters (it will not).

### Placement, locations and spawn (Q4)

`[VERIFIED: placement.ts (read in full), Universe.m:1783-1815, 2608-2692]`

- **Codes in scope:** `LANE_WP`, `LANE_WS`, `LANE_PS`, `LANE_WPS` and `STATION_AEGIS` exist (`export type LocationCode = "LANE_WP" | "LANE_WS" | "LANE_PS" | "LANE_WPS" | "STATION_AEGIS";`, `placement.ts:42-43`). **`WITCHPOINT` is new**: `Universe.m:1786-1788` is `OOHPVectorRandomSpatial(SCANNER_MAX_RANGE)`, i.e. `randomSpatial(rng, layout.scannerRange)`. It is used only by the interceptor entry (assassins are cut). Add it as an additive case; the existing outputs must not change (pin with a test; `src/sim/world/**` is a QUAL-12 path).
- **Per-ship scatter** (`addShipAt`, `Universe.m:2608-2692`): every ship is `pos + OOHPVectorRandomSpatial(radius)` (`radius` is the `spread` argument, **also for 0**: the draws of one accepted candidate are still taken, which `randomSpatial` already models, `placement.ts:68-92`), then a random quaternion. Escorts are placed by `coordinatesForEscortPosition` plus `dd * 6 * (randf() - 0.5)` per axis (`ShipEntity.m:1695-1700`); reuse `escortCoordinates(leaderPose, leaderRadius, slot)` (`src/sim/npc/escort.ts:46`).
- **Frame.** Oolite's planet is at `+planet_distance` on Z; Wegolite's layout negates Z (`const planet = vec(0, 0, -system.planetDistance);`, `layout.ts`). The remote-pack tweak `pos.z = pos.z % 100000` (`:1883`, `:1909`, `:1935`) uses JS `%`, which keeps the dividend's sign, so applying `%` in Wegolite's frame is the mirror image of Oolite's and is correct; a Euclidean modulo would not be. Record `posIn.z` and `posOut.z` in the fixture so the port is tested.
- **Group ids and leader order.** `Entity.groupId` is the founding leader's id and `World.groups` holds `{ id, leader }` ascending (`limits.ts:303`: `export const MAX_WORLD_GROUPS = 128;`). Spawn the leader first. Oolite has **two** group objects for a pack leader with escorts (`lead.group = pack group`, `lead.escortGroup`); Wegolite's single `groupId` merges them under one leader id, with escorts distinguished by `ownerId` and `steer.escortSlot`. Record this as a model note (assumption A10); Phase 23's AI needs `ownerId !== 0` to tell escorts from pack followers.
- **Entity fields to write at spawn** (all exist, `entity.ts`): `bounty`, `role` (the *resolved* role: `trader`, `trader-courier`, `trader-smuggler`, `pirate`, `pirate-light-fighter`, `escort`, `police`, `police-station-patrol`, ..., at most 32 characters of `[a-z0-9-]`), `groupId`, `cargo` (count) with `cargoKind`, `fuel`, `homeSystem`, `destinationSystem`, `injector` (`{ accumulator: 1 }` or null), `weaponTypes` (`aft` = `EQ_WEAPON_NONE` string for `aftWeapon = null`, distinct from `null` = "record default", `entity.ts:75-86`), `ownerId` and `escortSlot` for escorts, `steer.accuracy` (write after `spawnEntity`: `SpawnInit` has no accuracy member; the unresolved sentinel `-100` must not remain, otherwise `resolveAccuracy` would redraw from the combat stream in Phase 23; set it from the script's `_setSkill` over an initial `randf()*10-5` that is flipped positive for `CLASS_POLICE` and `CLASS_MILITARY`, `ShipEntity.m:658-676`). `ai` stays `null`.
- **Cargo.** `CARGO_KINDS = ["unset","plentiful","scarce","medical","contraband","pirate","uniform"]` (`entity.ts:105-113`). The final kind per builder (initial population, vector positions): freighter `scarce` (`medical` for the name match, `pirate` for an offender-opportunist), courier `scarce`, smuggler `contraband`, independent pirates `pirate`, pack leaders `pirate`; hunters, police, assistants and escorts set no cargo type, so they carry no cargo (CONTEXT folded todo). The count comes from `setCargoFlag` (`ShipEntity.m:7323-7373`): `num = likely_cargo > 0 ? floor(likely*(0.5+randf)) capped at maxCargo : maxCargo`, capped at 200 (`MAX_ENTITY_CARGO`), pirate kind `Ranrot() % (1 + num/2)`. **`setCargoFlag` is a no-op when the flag already equals the new one** (`:7325`), and `addShipAt` gives half of all `trader`-role ships a random initial flag first (`Universe.m:2650-2655`); only the final kind and a count from the same distribution are observable, so draw the count once at the final kind. Do not reuse `cargoCountAtSpawn` (frozen, role-keyed); add a kind-keyed sibling. Equipment weight is 0 for every populated ship (`requires_cargo_space` appears only on `EQ_PASSENGER_BERTH`, `equipment.plist:251`).
- **Injector.** `has_fuel_injection` is a probability (krait 0.65, asp 0.5, ferdelance 0.75, cobramk1-alt 0.25, viper-interceptor 1). Roll it per ship at spawn from a **group-keyed** fork (Pattern 1) and force it on where the script calls `awardEquipment("EQ_FUEL_INJECTION")` (smugglers, pirate interceptors, `:1560`, `:1766`). `has_scoop` needs no spawn-time field (no `Entity` member exists; the roll stays derivable later from `forkSeed(worldSeed, id, "scoop")`).

### Entity cap, group bound and the draw-call budget (Q5)

- **Cap.** `export const MAX_ENTITIES = 256;` (`ids.ts:61`), non-dead dynamic entities only; statics do not count. Debris spawns while at most 243 entities are live (`DEBRIS_ENTITY_LIMIT = 0.95 * MAX_ENTITIES`, `debris.ts:279`) and wrecks while at most 127 (`WRECKAGE_ENTITY_LIMIT = 0.5 * MAX_ENTITIES`, `:286`); one kill releases at most `POD_LIMIT = 15` pods (`:242`), `floor`-ish `nAlloys` plates and at most 4 wrecks (anaconda: `nAlloys = sqrt(sqrt(437686.875/6000)) = 2.92`, `wreckCount = floor(u*(2.92+2))` up to 4), about 22 pieces for the largest hull. `[VERIFIED: debris.ts:225-290, 1235-1280, ships-npc.json masses]` Pods never expire (D16-06). **A second cap exists: `MAX_WORLD_GROUPS = 128`**; every pack, independent-pirate group, hunter or police group, *and every escorted leader* writes one record, so the census must also report the peak group count. If it can exceed 128, the skip rule must apply to the group-record bound too (or the bound is raised through a recorded owner amendment, which is a snapshot-format change: do not).
- **Reserve (D-06).** Rule: `populationLimit = MAX_ENTITIES - POPULATION_DEBRIS_RESERVE` in `limits.ts`, the reserve being the measured worst debris of the fight in the QUAL-09 spec plus the headroom the owner accepts. Starting value to measure against: 22 per kill of the largest hull; a fight with a few kills needs 60 to 90. With the scratch estimate that the *expected* peak population is about 105 (below), a reserve of about 64 to 96 leaves the cap untriggered; the census decides.
- **Draw calls.** `export const DRAW_CALL_BUDGET = 50;` (`tests/e2e/helpers/budgets.ts:24`), inclusive comparison, zero fails. Measured in Phase 21: 39 calls worst case (all 29 keys, one inert ship each), 42 after a kill, at most 49 with all seven debris models (21-19 SUMMARY). The render layer costs one call per `(key, primitive)`; after fix (1) every hull is one primitive, so **population size adds no calls; only the number of distinct hull keys present does** (at most 29). The browser proof should therefore choose the system by **distinct keys in the realised population plus the fight**, not by ship count. The tripwire for the deferred instancing plan sits in `tests/e2e/anarchy.spec.ts` (asserts both counts against `DRAW_CALL_BUDGET`). `[CITED: 21-19-SUMMARY.md, 21-18-SUMMARY.md; budgets.ts read this session]`
- **Assessment with the `threejs-performance` rules (draw calls, instancing, batching, `renderer.info`).** `[VERIFIED: src/render/bodies/npc-ships.ts:1-60 (read this session): "One `InstancedMesh` per (model, primitive)... a populated scene adds at most one draw call per primitive ... however many ships there are"; `NPC_INSTANCE_CAPACITY = 256` equals `MAX_ENTITIES`; `frustumCulled = false` on every instanced mesh (npc-ships.ts:105, debris.ts:219, explosions.ts:465/489); `rg` over src/render]`
  - *Calls.* Instancing is already the lever the skill names for "one geometry drawn many times", applied per hull key, and 21-17 already merged each hull's primitives (merge-static-geometry lever) so a key is one call. The frame is `scene (10) + distinct NPC keys (<= 29) + laser shots (1) + explosion cloud and flash (2) + debris models (<= 7)`, so the **ceiling is 10 + 29 + 1 + 2 + 7 = 49, whatever the population size**, which matches the 21-19 bound; 1 call of headroom. A 100-ship anarchy with every key present draws the same 39 calls as the Phase 21 spike's 41 ships. The fight adds calls only through debris and explosion model keys, never through more pods of an already-present model. So the answer to "does the largest anarchy plus a fight and debris fit 50?" is **yes by construction, margin one call**, and the spec must prove it by reading `probe.calls` (the equivalent of `renderer.info.render.calls` read *after* `render()`), not assume it. The number to maximise when choosing the spec's system is **distinct keys**, then to add a kill whose hull brings new debris models.
  - *If it ever exceeds 50* (the tripwire in `anarchy.spec.ts`), the levers in the skill's order, cheapest first: (1) check nothing else grew (a second `render()` pass, shadow-casting lights, a transparent `DoubleSide` material drawn twice, which all appear in `calls`); (2) the deferred plan 21-18, variant families sharing one instanced mesh set (about 10 calls saved, custom shader patch, low confidence per its own SUMMARY); (3) `BatchedMesh` for hulls that share one material (here every merged hull owns its own atlas material, so batching would need one shared atlas, a content change); (4) merge the seven debris models into one `BatchedMesh` or one atlas (saves up to 6 calls, the debris layer is the cheapest to merge because pods and plates are tiny); (5) confirm a key with zero live instances costs no call (the layer sets `mesh.count = 0`, `npc-ships.ts:106`; the spike's counts suggest it does, but `[ASSUMED]` for the three.js version in use: if an empty `InstancedMesh` is still submitted, set `visible = false` when `count === 0`); (6) only then an owner-recorded budget raise (D-05 envelope: about 80 calls, fight p95 at most 16.7 ms).
  - *Triangles are the cost that does scale with the population, and the budget is 250,000* (`TRIANGLE_BUDGET`, `budgets.ts:27`). Measured in 21-16/21-19: 77,934 triangles for 29 keys plus 12 inert ships; the 29 GLBs sum to **27,019 triangles for one ship per key** (largest hull krait 1,509; anaconda 1,413; smallest 292; mean about 930; `[VERIFIED: python over public/models/*.glb accessor counts, this session]`), so the static scene (planet, sun, station, buoys, player ship) is about 40,000. Because instanced meshes are not frustum-culled (`frustumCulled = false`), **every live instance is submitted every frame**, in view or not. Estimate for the expected 105-ship peak at the mean hull: 40,000 + 105 x 930 = about 138,000 (55 percent of the budget); at a pessimistic 1,400 average and 150 ships: about 250,000, on the budget. **Recommendation:** the census records the realised NPC triangle sum per world (key counts times the GLB triangle table) next to the ship count and fails the plan if any committed system exceeds `TRIANGLE_BUDGET` minus the scene; the browser spec reads `probe.triangles` in the fight. Triangle levers if needed: (a) in `npc-ships.ts` `update`, skip contacts behind the camera or beyond a distance (the layer already rebuilds the matrices every frame; this is CPU culling per instance, the skill's "let culling skip" lever applied by hand), (b) `LOD` levels per hull as separate instanced meshes (cuts triangles, adds calls: only with headroom), (c) lowering `NPC_INSTANCE_CAPACITY` is *not* a lever (the cap is 256 by design).
  - *Per-frame CPU:* the layer rewrites one `instanceMatrix` per key per frame (`DynamicDrawUsage`, `needsUpdate`); with `ai: null` ships never move, so a "dirty only on change" flag would cut upload cost (about 105 matrices x 16 floats, trivial); not needed for QUAL-09, note for Phase 23.
  - *Memory, not calls:* 21-17's atlases cost 601 to 1,023 MiB summed texture memory (todo `2026-11-26-npc-atlas-texture-memory.md`); a populated anarchy loads up to all 29 keys' textures at once, which was already the spike's worst case. The prefetch (D-07) makes the first populated arrival draw late rather than stall; the sim never waits on models.
- **How to boot the largest anarchy in a browser spec without a new hook:** `dockedSaveAt(systemName)` writes a docked save at a **galaxy-0** system through the production `encodeSave` (`save-fixtures.ts:54-76`), then the spec launches with `?test=1&traffic=1` (or `?traffic=1` on a build whose default is traffic on). The scratch model's largest galaxy-0 anarchy is **Onisqu (g0-s219)**; the census decides, and if the best system is in another galaxy, either pick the best galaxy-0 anarchy for the spec or extend `systemByName`.

### Re-pin inventory (Q5, second half)

The live session and the Node twin share one populate source by design ("Pitfall 11 of Phase 12", `traffic.ts` header). The switch therefore changes every traffic-on test that goes through them; tests that build their own lifecycle with `createInertPopulate` do not change.

- **Stays inert (do not touch):** `tests/helpers/traffic-fixture.ts` (`laveInertWorld`, `poseNearFirstShip`), the 20-seed acceptance, `tests/golden/world/inert-lave-epochs-1-20.json`, `tests/sim/world/{populate,inert-isolation}.test.ts`, `tests/app/session/traffic.test.ts`' `createInertPopulate` cases, `tests/sim/combat/collision-traffic.scenario.test.ts`, `traffic-variants.test.ts` (they call `createInertPopulate` directly). `[VERIFIED: rg "createInertPopulate"]`
- **Switch to the new populator:** `src/app/session/start-session.ts:519` (`populate: createInertPopulate(`) and `tests/helpers/tick-script.ts:264` (the same call in the Node replay). The traffic-off path is unchanged (D-01: no draw, no id burn, hashes as the flight hash).
- **Re-pin once, with the measured cause** (21-CONTEXT D-04 standing approval for v2.4): `tests/app/session/tick-parity.test.ts` (traffic-on cases near `:502`, `:529`, `:541`, `:1380`), `tests/app/session/death-twin.test.ts`, `tests/app/session/tick-flyers.test.ts`, `tests/app/session/render-driver.test.ts` (traffic-on cases), `tests/app/session/world-lifecycle.test.ts` (the "12 ships, anchor 113" cases that go through the session tracer), `tests/e2e/{traffic,npc-flight,combat,tick-hook,death-and-reload,game-over-guard,statics}.spec.ts` (`expect(...entities).toBe(12)`, `12 + FLYERS`, anchor 113, scripted shooter geometry), `tests/e2e/anarchy.spec.ts` counts. Method for the plan: `rg -n "runTickScript|createInertPopulate|traffic=1|traffic: true" tests` then classify each hit as *own lifecycle* (no change) or *session/twin path* (re-pin); the `traffic.spec` "no NPC model before the prefetch trigger" and "first-load ceiling" assertions stay but their world is now a populated Lave (Dictatorship, about 40+ ships).
- **Browser specs stay traffic-off unless they opt in** (the e2e bundle default is off, `vite.e2e.config.ts`; a spec adds `?test=1&traffic=1`). A spec that opts in now meets pirates and a crowd; check each opt-in spec for an unrequested hostile (it cannot fire yet: `ai: null`, so the risk is only counts and collisions).
- **Probe/guards touched if a hook is added:** `tests/fixtures/probe-shape.json`, `tests/guards/dead-mode-gates.test.ts` (21-16 re-pinned it); avoid a new hook if `dockedSaveAt` suffices.

### Population census (Q5 / success criterion 3), scratch model

**This is a scratch estimate, not the planner.** `[SCRATCH MODEL, LOW-MEDIUM confidence: expected group counts = the script's own rates with E[randomise(x)] = x, ship counts from the committed role weights and `escortRoles`, bottleneck and range sets computed with the Oolite distance, layout lengths from `deriveSystemLayout`'s formulas; script at /tmp scratchpad, not committed]`

| Quantity (core ships incl. escorts, expectation per system) | Value |
|---|---|
| Systems | 2,048 (8 galaxies x 256) |
| Mean / median / p95 / max | 45.3 / 45.1 / 70.6 / 105.0 (Arazaes g0-s92, gov 6, bottleneck, 10 neighbours) |
| Mean / max by government 0..7 | 60.0/90.1, 54.0/101.9, 43.0/98.4, 44.5/83.7, 41.8/93.9, 40.1/73.1, 37.1/105.0, 41.9/81.3 |
| Largest anarchy (expected) | Onisqu g0-s219 and Reteti g2-s179 (90.1 each), Ontilain g6-s36 (87.7) |
| Largest feudal | Ausaso g6-s57 (101.9) |
| Highest courier component | Timabi g3-s239 (49 courier ships, bottleneck, 12 neighbours) |
| Isolated (no neighbour within 7 LY) | 1: Oresrati g7-s162 (gov 7, eco 7, TL 4) |
| Bottleneck systems | 322 of 2,048 |
| No neighbour within 3.5 LY | 337 (77 with government > 5, 260 with government <= 5): the two `hmedium/hheavy` branches |
| TL >= 9 / TL >= 14 | 583 / 6 |

Reading: the tail is **courier-bug driven** (bottleneck systems) and **independent-pirate driven** (Feudal/Anarchy), not "the anarchy". Realised draws add variance (`randomise` scales a group count by 0.25 to 1.75 and escort counts vary), so the realised peak will exceed the expectation; the plan's census must sample many world seeds per system (for example 20 epochs x 2,048 = 40,960 plans, cheap) and report mean, peak, p99, the anarchy tail and the peak group count. Every number above must be recomputed by the real planner before it is recorded.

**Concrete system list for the recorder (D-04).** Government x economy side x TL is **not** a full factorial (tech level is derived from economy and government in the data); the available cells (counts from the scratch pass) are: gov 0: agr-low 140, ind-low 18, ind-mid 130; gov 1: agr-low 98, agr-mid 12, ind-high 17, ind-mid 97; gov 2: agr-low 84, agr-mid 48, ind-high 61, ind-mid 95; gov 3: agr-low 42, agr-mid 78, ind-high 59, ind-mid 45; gov 4: agr-low 47, agr-mid 97, ind-high 92, ind-mid 52; gov 5: agr-high 4, agr-low 21, agr-mid 88, ind-high 89, ind-mid 22; gov 6: agr-high 7, agr-low 29, agr-mid 101, ind-high 130, ind-mid 21; gov 7: agr-high 19, agr-low 9, agr-mid 88, ind-high 105, ind-mid 3 (34 non-empty cells; "ind" = economy 0-3, "agr" = 4-7, low TL <= 4, high TL >= 9). Recommended selector (`population-systems.ts`, deterministic, one row per reason): the **median-population member of each non-empty cell** (34, trim to the cells that add a branch: all 8 governments, both economy sides, low and high TL, TL >= 9 for interceptors, one TL 14 if present), plus the named anchors below; ~32 to 40 systems, 3 seeds each.

| Anchor | Id | Why it is in the sample |
|---|---|---|
| Isolated | g7-s162 Oresrati | `locals = 0`, only the station patrol; division-by-zero traps; bottleneck `false` |
| Courier-bug peak | g3-s239 Timabi, g0-s92 Arazaes | bottleneck with 10 to 12 neighbours: `couriers *= 1.5` compounds |
| Largest anarchy | g0-s219 Onisqu (galaxy 0, bootable in the browser spec), g2-s179 Reteti | D-04 "largest anarchy by expected population"; `pindependents` halving loop, `*= 1.2` twice |
| Largest feudal | g6-s57 Ausaso | government 1: police folds into hunters, 5 neighbours within 3.5 LY (remote packs) |
| Lave | g0-s7 | the start system; continuity with every existing traffic-on test (Dictatorship, rich agricultural) |
| No near neighbours | one with `nvery == 0` and gov > 5, one with gov <= 5 | the two `hmedium/hheavy` else-branches, no remote packs |
| High tech | any TL >= 9 with gov >= 2, one TL 14 (6 exist) | `interceptor` police role (`9 + rand*6 < TL`), interceptor wings, `_setMissiles(1)` (cut) |
| Other galaxies | at least g1, g2, g3, g6, g7 members | D-04 "more than one galaxy": the neighbourhood is per galaxy |

### Real-Oolite census spike (Q6)

`[VERIFIED: tools/oolite-reference/README.md, steps/docked.steps, oolite Resources/Config/scenarios.plist, Resources/Scenarios/oolite-standard.oolite-save, PlayerEntityLoadSave.m:1079, OOJSPlayerShip.m:912-937; feasibility itself ASSUMED]`

- **What exists:** one scripted session under Xvfb and llvmpipe on the remote machine (`run-remote.sh --steps FILE --addons DIR --timeout S`), `Latest.log` fetched back, `waitlog` and `shot` steps, `--addons` mounting `*.oxp` folders read-only, an OXP being "a throwaway measurement probe kept outside the repository". `docked.steps` starts the standard scenario in about 40 s (title, Return, Return).
- **Start-system route (a scenario save):** a scenario is a `.oolite-save` plist; the standard one carries `galaxy_number`, `galaxy_seed` (`74 90 72 2 83 183` for galaxy 0), `galaxy_coordinates` (`20 173` for Lave), `current_system_name`, `docked_station_position` and `docked_station_role`. A scenario OXP (`Config/scenarios.plist` entry plus a `Scenarios/*.oolite-save` with the target system's chart coordinates, and the seed that maps to them) would appear in the scenario menu after the three built-ins; the steps file then needs `Down` presses and `Return`. The second route is a world script: `player.ship.targetSystem` is writable **only while docked** (`OOJSPlayerShip.m:912-937`), so the script could set the target and the steps could press the hyperspace keys. Neither route has been run; treat feasibility as LOW (unknowns: how an OXP scenario is selected, whether the docked start populates the system before launch, the chart-coordinates-to-seed mapping, `Latest.log` flush every 2 s, game time slower than wall time).
- **Census script:** a throwaway OXP world script, on `shipWillLaunch` or a `Timer`, enumerates `system.filteredEntities(this, fn)` and logs `role`, `primaryRole`, `bounty`, `group` size, `escortGroup` size with the two-argument `log(this.name, ...)` form, ends with a sentinel for `waitlog`. It can also log `system.info.systemsInRange().length` and `worldScripts["oolite-populator"]._systemIsBottleneck(...)` as the native cross-check of the neighbourhood facts.
- **Mandatory first step:** extract the AppImage's `Resources/Scripts/oolite-populator.js` and compare its sha256 with the checkout's (`96a734a6...`). The README records 14 commits of skew (1.93.1-255 vs 7437f22) and does not state that the populator is unchanged. `[ASSUMED: unchanged]`
- **Outputs stay outside the repository** (CC BY-NC-SA); the wrapper refuses an output directory inside it. Two attempts per obstacle (D-07), failure is a recorded answer.

### Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Chart distance and range tests | a second distance function in `src/` | `chartDistance`, integer thresholds 17 / 8 / 62 | C truncation is already ported and pinned; the oracle stub's independent copy is the cross-check |
| Weighted record pick | a new roulette | `pickRecord`, `parseRoleToken` (exported from `populate.ts`) | `OOProbabilitySet` semantics, role tokens, no prototype lookups |
| Location samplers | new shell/cylinder maths | `placement.ts` (`positionInCylinder`, `positionInShell`, `randomSpatial`) | Already ported with rejection caps and the `fallback` flag |
| Forked streams | an ad-hoc seed mix | `forkSeed`, `mix32`, `createRngState` | One-way world-seed contract, pinned literal vectors |
| Escort formation position | new formation maths | `escortCoordinates` | `ESCORT_PATTERN` is already ported and Phase 14 fixture-tested |
| Group/world serialisation | new snapshot keys | `World.groups`, strict parser, `hashWorld` pristine-omit lines | Phase 21 designed and tested them (49 hash tests, 36 codec rows) |
| Strict fixture parsing | hand validation | zod `.strict()` schemas | Same as `tests/oracles/npc/schema.ts` |
| Running Oolite's JS | any custom interpreter | `node:vm` loader of `tools/ai-harness` | AI-11 precedent with timeouts and read counting |

**Key insight:** every arithmetic step that touches a random draw has a "tidy" port that changes the count; the only defence is a mechanical replay of recorded draws per site, which is why the recorder, not a reading of the script, is the first plan.

## Common Pitfalls

### Pitfall 1: `couriers *= 1.5` multiplies the accumulator
**What goes wrong:** a port "fixes" it to `rate *= 1.5` and every bottleneck system loses most of its courier groups; or a port reproduces it and a reviewer reverts it as a bug.
**Why:** `oolite-populator.js:311-314`, inside the per-local loop, `couriers *= 1.5` precedes `couriers += rate`; with `n` neighbours the first terms are scaled by up to `1.5^(n-1)`. In the scratch model bottleneck systems average 3.6 courier ships against 0.9 otherwise, with a peak near 49.
**How to avoid:** port as written; `FIDELITY.md` row naming the line; census row reporting the effect; keep a test that pins the recorded Timabi/Arazaes counts.
**Warning signs:** courier groups in a bottleneck system equal to the non-bottleneck formula.

### Pitfall 2: Draw counts that look optional
`randomise` always takes 3 draws (`:644-653`); `_setWeapons` takes exactly one draw per call even for an integer level (the `>` comparison evaluates `Math.random()` unconditionally, `:2242`); pack class loops take 2 draws even when the result is <= 0; `_nearby*System` takes one per matching neighbour; `Math.random()*8 > gov` and `Math.random()*16 < gov` are taken before the missile branch they guard. A "skip if impossible" shortcut changes later draws **within the same site**. With per-site streams the damage is confined to the site, but the replay test still fails, which is the point.

### Pitfall 3: Packs are bigger than the table
`thug = 0` and `hf = 0` classes still produce a ship 12.5 % of the time (`floor(0.5 + r1 - r2)` is 1 for `r1 - r2 >= 0.5`). A port that reads "0" as none undercounts light packs by one interceptor in eight.

### Pitfall 4: Engine escorts, removal rule and slot arithmetic
Escorts come from `escort_roles` (the 7 hulls), each `{min, max, role}`: `desired = max`, then for `i` in `min..max-1`, `Ranrot() % 11 < government + 2` decrements it (so a *safe* government removes more), an empty role counts toward the 16-escort cap without a ship, `desired <= 0` spawns none (`ShipEntity.m:1619-1682`). `addShipAt` removes **all** escorts of a role-`trader` leader with probability `gov/7` (`Universe.m:2657-2665`; `setPendingEscortCount` clamps to `_maxEscortCount`, which is 0 for `escort_roles` hulls, `ShipEntity.m:670-686`, `:6061-6064`), so government 7 never has escorted traders and an anarchy always does. Every escort's primary role is overwritten to `escort` (`:1731`), which makes the `escort-medium`/`escort-heavy` branches of `_setEscortWeapons` dead for them. Escort bounty: clean mother gives a clean escort; an offender mother gives `1 | (ranrot & 15)`, and the script then ORs `3+floor(r*12)` (`:1439`, `:1570`, `:1858`).

### Pitfall 5: The frozen path moves through shared files
`ships-npc.json` gains a field (`hyperspaceMotor`); `placement.ts` gains a case; `limits.ts` gains constants; `rng.ts` may gain purposes. None may change an existing output. Keep `inert-isolation.test.ts` green after every commit, and rerun the 20-seed acceptance by hand on the remote machine after every plan touching `src/sim/world/**`, `src/sim/npc/**` or `ships-npc.json` (QUAL-12).

### Pitfall 6: Missiles cannot be "burned" without being read
`_setMissiles` takes one draw per `EQ_MISSILE` of the record when `autoWeapons` holds (`:2306-2308`), and its callers are guarded by their own draws. The guard `npc-missiles-tripwire` fails on any non-comment `.missiles` / `.maxMissiles` read in `src/sim/` (outside `src/sim/player/`) or in `traffic.ts` and on an entity member of that name. A single interleaved stream would need the missile count to stay aligned. Per-site streams remove the need: the missile site is a cut, its recorded draws are asserted by the oracle self-test only, and the port neither reads nor burns them.

### Pitfall 7: `World.groups` and `repairWorldFields`
21-06 recorded that `step.ts` `repairWorldFields` repairs only the older records and that "when Phase 22, 25 or 26 starts writing the records, they should join `repairWorldFields`". Phase 22 writes `World.groups` for the first time: add it (and keep the sanitizer idempotence property). A leader equal to its group id is valid; group ids ascend; at most 128.

### Pitfall 8: Float and integer traps (checklist for the replay test)
`accuracy` is a float32 property written through a clamp (`Math.fround`); `fuel` is `lround(clamp(v, 0, 7) * 10)` (use integers: `70 - 4*dist`, exact, then clamp at 0); `l1length` etc. use `Math.sqrt(x*x+y*y+z*z)`, **not** `Math.hypot`; JS `%` keeps sign; `ship.bounty |= x` is a 32-bit OR on an unsigned property (bounty bound 65535); sorts need comparators; `Object.keys` order and `for..in` are banned; `Math.floor(rand*3)+...` are unbiased draws not `% N`; `hunters` size is `floor(r)*...` of two separate draws, not `floor(r*2)*2`; `addGroup` accepts a count of 1 to 64 only (`OOJSSystem.m`, `SystemAddShipsOrGroup`): all in-scope sizes are far below.

### Pitfall 9: The 25 LY query and missing records
`_nearbySystem(25)` may return many systems; `Math.floor(Math.random()*poss.length)` is one draw regardless. Roles with no record fall back (`_roleExists`) to `trader`/`hunter`/`pirate`; all in-scope roles have records in the 29-record catalogue (verified above), so the fallback is dead code that the port may omit with a table row, but the stub must answer `Ship.keysForRole` from the catalogue so the script's branch is the real one.

### Pitfall 10: Hash twin and cadence
A populated world must hash equal at 30, 60 and 144 Hz (criterion 4). The populate step runs once at `begin`, so cadence cannot change it; the risk is a populator that reads wall time or a frame-dependent value. Add a cadence test like `tests/sim/world/v5-cadence.test.ts` over a populated Lave and the largest anarchy for 600 ticks.

## Code Examples

### Replay skeleton (proposal)
```typescript
// Source: proposal; fixture shape to be fixed by tests/oracles/population/schema.ts
for (const fixture of loadFixtures()) {
  const facts = factsFrom(fixture.system, fixture.neighbourhood);        // recorded inputs, not recomputed
  const counts = planCounts(facts, scriptedDraws(fixture.countDraws));   // per entry ordinal
  expect(counts).toEqual(fixture.entries.map((e) => e.count));           // cut entries compared in the cut table
  for (const group of fixture.groups) {
    const built = buildGroup(group.entry, facts, records, scriptedDraws(group.draws)); // per-tag arrays
    expect(describe(built)).toEqual(group.expectedShips);                // key, role, bounty, cargoKind, weapons,
  }                                                                      // accuracy (fround), fuel, systems, links
}
```

### Per-group forked streams (proposal)
```typescript
// Source: proposal over src/sim/rng.ts:161-171 (forkSeed) and :65-67 (mix32)
// entry ordinals are an append-only frozen table; adding or skipping a group never moves another stream.
const entrySeed = forkSeed(world.worldSeed, entryOrdinal, "pop");        // new purpose, code 10 (additive)
const groupSeed = mix32(entrySeed, groupIndex);
const draws = (tag: Tag): RngState => createRngState(mix32(groupSeed, TAG_CODE[tag]));
```
(`RNG_PURPOSE_CODES` today: `world: 1, ai: 2, combat: 3, cargo: 4, damage: 5, pod: 6, scoop: 7, repop: 8, inj: 9`, `rng.ts:107-118`; "adding a purpose cannot renumber another", `:103-106`. Add the literal vector to `tests/sim/rng.test.ts`.)

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 12 inert ships from a hand table (`INERT_POPULATION`, WORLD-15) | Oolite's rates and group builders | This phase | The live session and Node twin move; the inert table stays for the frozen run |
| Lazy accuracy draw at first steer (`resolveAccuracy`) | Resolved at spawn for populated ships | This phase | Phase 14's pinned trajectories belong to inert ships and are unaffected; a populated ship's accuracy comes from the script's kit helpers |
| Id-keyed per-ship forks (`cargo`) | Group-keyed forks | This phase | Ids no longer influence a ship's rolls |

**Deprecated/outdated for this phase:** `cargoCountAtSpawn(role, ...)` (role-keyed, inert only); `INERT_RECORD_KEYS`-based isolation (the new populator reads the full catalogue).

## Runtime State Inventory

Not a rename or migration phase; omitted. One persistence note (SAVE-08): a save never holds a ship; Continue and Load rebuild the world from `(marketSeed, epoch)` through `resume`, so the new populator must be a pure function of those plus the committed content, and its ids and `anchorNextEntityId` are no longer the fixed 113 (the anchor is read from `store.nextId` after populate, so it follows automatically).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Interceptor wings (`oolite-interceptors-route1/-witchpoint`) are in scope: they are police and the roster already includes the `interceptor` and `wingman` records; CONTEXT lists only five cuts | Entry table | If the owner wants them out, two entries move to the cut table; fewer ships at TL >= 9 |
| A2 | Thargoid scouts and strikes, aegis raiders, asteroids, hermits and the two buoys are cuts (research SUMMARY "Defer" list, D-03); CONTEXT names only scavengers, shuttles, medium/heavy hunters, assassins, opportunists | Entry table | A Thargoid in a system would be a population the owner does not expect; cuts must be recorded as rows |
| A3 | Engine escorts spawn in this phase (Phase 23 roadmap says "now that escorts spawn"; the 16-09 decision defers `escortCheckMother` to "the first phase that spawns escorts") | Summary, Pitfall 4 | If out of scope, population is smaller (about 5 escorts per anarchy trader), the script's escort reads see an empty group, and Phase 23 would need to add escorts later with a second re-pin |
| A4 | Trader opportunists: port the *data* effects (`PIRATE_GOODS`, `_setSkill(2)`, `_setWeapons(2.5)`) and cut only `switchAI` (the folded todo says opportunists get `PIRATE_GOODS`; CONTEXT says "trader opportunists" are cut) | Builders | Opportunists would carry `scarce` cargo instead of `pirate`, contradicting the folded todo |
| A5 | Equal-priority entries run in script insertion order (the engine's order is undefined by the source) | Entry table | Only ids and cap-skipping order differ; no draw moves |
| A6 | The AppImage's `oolite-populator.js` equals the checkout's | Spike | The real-Oolite comparison would test a different script |
| A7 | The scratch census numbers (mean 45, peak 105, 322 bottlenecks, 1 isolated) | Census | The reserve and the QUAL-09 system are chosen from the real census, not from these |
| A8 | Per-site tagged streams are acceptable to the owner as "one forked stream per group and roll" | Pattern 1 | Falls back to one stream per group with counted burns, which needs the missile count read (guard conflict) |
| A9 | Fixture size about 1 MB for 96 fixtures | Recorder design | Trim seeds or compress draws |
| A10 | One `groupId` per leader merges Oolite's pack group and escort group | Placement | Phase 23 must use `ownerId` to distinguish; recorded in FIDELITY |
| A11 | `hasHyperspaceMotor` is the only missing record field (checked against the keys of the committed record and the populator's reads) | Summary | A second missing field would be found by the stub's `inventory.missing` during the first recorder run |
| A12 | The real-Oolite scenario OXP route works | Spike | A failed spike is a recorded answer (D-07) |

## Open Questions (RESOLVED)

1. **Escorts in or out?** (A3) The CONTEXT is silent; the evidence says in. Recommend: in, with the stub modelling `setUpMixedEscorts` and the port spawning them with `ownerId` and `escortSlot`; the owner should confirm before the recorder plan, because it changes the fixtures and the census.
   **RESOLVED:** in. Owner decision D-08 (22-CONTEXT.md, 2026-11-26): the stub models the engine escorts and the fixtures record them (plan 22-01), the port spawns them with `ownerId` and `escortSlot` (plans 22-07 and 22-10), and the records land in plan 22-08.
2. **Cut table granularity for equipment awards.** `EQ_ECM` and `EQ_SHIELD_BOOSTER` awards (pack leaders, `:1831-1832`) and `heatInsulation` have no entity field. Recommend recording them as cut writes that the replay asserts in the fixture only.
   **RESOLVED:** as recommended. The recorder records them as cut writes (plan 22-01), `POPULATOR_CUTS` lists them (plan 22-06), the courier's `heatInsulation` is asserted as a cut in the trade replay (plan 22-08) and the pack leaders' shield booster and ECM awards in the whole-system replay (plan 22-09); no planned ship field carries them.
3. **Group-record bound.** If the real census shows more than 128 groups in some world, which rule? Recommend skip-whole-group under the same reserve rule, plus a test.
   **RESOLVED:** superseded by owner decision D-11 (22-CONTEXT.md): `MAX_WORLD_GROUPS` is raised to 256 (= `MAX_ENTITIES`) unconditionally with the empty-group pruning invariant, so the bound can never trigger (plan 22-03); the census records the peak group count as a measurement (plan 22-12).
4. **QUAL-09 system.** Largest galaxy-0 anarchy by distinct hull keys (Onisqu by the scratch model) or the global largest; the spec can only boot galaxy 0 through `dockedSaveAt` today.
   **RESOLVED:** the census picks it: `specSystems` in the census golden names the largest realised galaxy-0 anarchy and, if different, the galaxy-0 anarchy with the most distinct hull keys (plan 22-12); the browser spec boots both (plan 22-15).
5. **`pos.isStation` branches.** Repopulation (Phase 26) will need the station-launch branch (`PLENTIFUL_GOODS`, `fuel = 7`); keep the builder's `arriving` flag a parameter now so Phase 26 adds a branch, not a rewrite.
   **RESOLVED:** as recommended. The builders take an `arriving` option that initial population always sets (D-01), with the station-launch branch kept as a parameter for Phase 26 (plans 22-07 and 22-08).
6. **Corridor-hit method (D-02).** Count STATION_AEGIS ships whose position lies inside the docking corridor box extended out along the launch axis (`src/sim/dock/corridor.ts`); measure over the 2,048-system census with many seeds; zero hits means no todo.
   **RESOLVED:** owner decision D-02 (22-CONTEXT.md) with the method as recommended (CONTEXT discretion): `launchCorridorHits` over the census, pinned in `launch-corridor.test.ts`, and a todo with a tripwire for Phase 23 if the count is above zero (plan 22-12).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Docker | every test, the recorder | yes | 29.9.3 | none (AGENTS rule) |
| Oolite checkout | recorder, spike | yes | pin `7437f22a5` present; HEAD `21978c37b`; populator identical | none |
| Node (host) | not authoritative | yes | v26.13.1 | use the container |
| Remote test machine scripts | verify, e2e, acceptance, spike | `~/.claude/scripts/wegolite-remote-run.sh` and `wegolite-remote-mcp.sh` present | not probed over ssh | none |
| `tools/oolite-reference` image | spike | built on the remote on demand | Oolite 1.93.1-255 | spike fails as an answer |

**Missing dependencies with no fallback:** none found. (The remote machine was not contacted in this research.)

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5.1.1 + fast-check 4.11.0; Playwright 1.65.1 (browser) |
| Config file | `vitest.config.ts`, `vitest.acceptance.config.ts`, `playwright.config.ts` [CITED: 21-VALIDATION.md] |
| Quick run command | `docker compose run --rm test npx vitest run <file>` |
| Full suite command | `docker compose run --rm test` plus `lint` and `typecheck`; browser: remote `verify` / `verify-full` |

### Phase Requirements to Test Map
| Req ID | Behaviour | Test Type | Automated Command | File Exists? |
|--------|-----------|-----------|-------------------|-------------|
| WORLD-08 | Fixture schema strict, header hash, draw accounting, cut table complete | oracle self-test | `docker compose run --rm test npx vitest run tests/oracles/population` | Wave 0 |
| WORLD-08 | Recorder reproduces the committed fixtures byte for byte (skipped without `OOLITE_SRC`) | recorder test | `docker compose run --rm -v /home/opencode/git/oolite:/oolite:ro -e OOLITE_SRC=/oolite test npx vitest run tools/ai-harness/populator-record.test.ts` | Wave 0 |
| WORLD-08 | Planned counts equal recorded counts for every entry, system and seed; edge draws | oracle replay | `docker compose run --rm test npx vitest run tests/sim/world/populate-system.oracle.test.ts` | Wave 0 |
| WORLD-08 | Every group's ships (key, role, bounty, cargo kind, weapons, accuracy, fuel, systems, leader/followers, escorts) equal the recording | oracle replay | same file | Wave 0 |
| WORLD-08 | `systemsInRange(7/3.5/25)` and `bottleneck` equal the recorded table for all 2,048 systems | table test | `... vitest run tests/sim/world/neighbourhood.test.ts` | Wave 0 |
| WORLD-08 | Placement within each region; WITCHPOINT in scanner range; STATION_AEGIS outside 1.5 planet radii; same arrival gives same world | unit + property | `... vitest run tests/sim/world/populate-system.test.ts` | Wave 0 |
| WORLD-08 | Adding or skipping a group never moves another group's draws; a group spawns whole or not at all; no hole; group bound | property (fast-check) | same | Wave 0 |
| WORLD-08 | Totality: malformed facts/records never throw, never spawn partial | property | same | Wave 0 |
| WORLD-08 | No placed ship has `cargo > 0` with `cargoKind` 0; each kind matches its builder; pod-kind guard allow-list unchanged | runtime + guard | `... vitest run tests/sim/world/populate-system.test.ts tests/guards/pod-kind-fallback.test.ts` | Wave 0 / exists |
| WORLD-08 | Every NPC spawns with zero missiles (no entity member, no read) | guard (exists) | `... vitest run tests/guards/npc-missiles-tripwire.test.ts` | exists |
| WORLD-08 | 2,048-system census: mean, peak, anarchy tail, peak groups, no skipped group, corridor hits | census test (writes the recorded numbers) | `... vitest run tests/sim/world/census.test.ts` | Wave 0 |
| WORLD-08 | Populated Lave and largest anarchy hash equal at 30/60/144 Hz | cadence | `... vitest run tests/sim/world/populate-system-cadence.test.ts` | Wave 0 |
| FOUND (C1) | Inert epochs 1-20 byte-identical; `INERT_POPULATION` untouched | golden (exists) | `... vitest run tests/sim/world/inert-isolation.test.ts` | exists |
| QUAL-09 | Census: realised NPC triangle sum (key counts x GLB triangle table) plus about 40,000 scene triangles stays within `TRIANGLE_BUDGET` for every committed system | census test | `... vitest run tests/sim/world/census.test.ts` | Wave 0 |
| QUAL-09 | Largest anarchy + a fight + debris: `probe.calls` within `DRAW_CALL_BUDGET` and `probe.triangles` within `TRIANGLE_BUDGET`, both read after render, system chosen by distinct keys | e2e (remote) | `~/.claude/scripts/wegolite-remote-run.sh run --rm e2e sh -lc "npm run build:e2e && npx playwright test tests/e2e/population-anarchy.spec.ts"` | Wave 0 |
| QUAL-12 | 20-seed acceptance 21 of 21 | acceptance (remote, by hand) | `~/.claude/scripts/wegolite-remote-run.sh run --rm test npm run test:acceptance` | exists |
| QUAL-13 groundwork | Spike script repeats the run, or the failure is recorded | manual (remote) | `tools/oolite-reference/run-remote.sh --addons <dir> --steps <file>` | Wave 0 |

### Sampling Rate
- **Per task commit:** the targeted `vitest run <file>` for the touched module, plus `lint` and `typecheck` at task end.
- **Per plan:** `docker compose run --rm test`, `lint`, `typecheck`; `docker compose run --rm assets npm run assets:check` when `ships-npc.json` or the schema changed; the by-hand 20-seed acceptance run (21 of 21, remote) after every plan touching `src/sim/world/**`, `src/sim/npc/**` or `ships-npc.json`.
- **Browser-facing plans (live switch, QUAL-09 spec):** remote `verify`; `verify-full` at the phase gate (automatic, no checkpoint).
- **Pure-logic plans (planner, neighbourhood, recorder):** `test`, `lint`, `typecheck` only (gate policy, owner memory 2026-11-21).

### Wave 0 Gaps
- [ ] `tools/ai-harness/populator-host.ts`, `populator-record.ts`, `population-systems.ts` and a recorder test (skips without `OOLITE_SRC`)
- [ ] `tests/oracles/population/{schema.ts, population.self.test.ts, fixtures/}`
- [ ] `tests/sim/world/{populate-system.oracle.test.ts, neighbourhood.test.ts, populate-system.test.ts, census.test.ts, populate-system-cadence.test.ts}`
- [ ] `tests/e2e/population-anarchy.spec.ts`
- [ ] extend `tests/guards/harness-isolation.test.ts` scope and `dist-check` markers for the new tool files
- [ ] a literal vector for each new RNG purpose in `tests/sim/rng.test.ts`
- [ ] Framework install: none

## Security Domain

Security enforcement is on (ASVS level 1, block on high; `config.json`).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication / V3 Session | no | no accounts or sessions |
| V4 Access Control | no | static client |
| V5 Input Validation | yes | strict zod on fixtures and the widened NPC schema; the planner is total on malformed facts and records (fast-check property); `World.groups` goes through the strict snapshot parser and `sanitize`; every rejection loop capped (`MAX_PLACEMENT_TRIES`) |
| V6 Cryptography | no | `forkSeed`/`mix32` are not security primitives |
| V12/V14 Files, config | yes | recorder reads only `Resources/Scripts/oolite-populator.js` (fixed relative path) from an operator-supplied `OOLITE_SRC`; `vm` is not a boundary and the loader says so; `check:dist` plus `harness-isolation` keep the harness and its sentinel out of `dist`; Oolite output of the spike stays outside the repository (licence) |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Prototype-key lookups on role or key strings (`constructor`, `__proto__`) | Tampering | `===` over arrays, `Object.hasOwn`, never an object keyed by role (`populate.ts` header T-12-17) |
| Unbounded count from a corrupt rate (courier bug, `NaN`, `Infinity`) | DoS | clamp counts to the group and entity bounds before any loop; total on non-finite facts |
| Tampered `OOLITE_SRC` | Tampering | dev-only, operator's own checkout, header hash of the script recorded in the fixtures and re-checked by a self-test |
| Harness code shipped in the bundle | Information disclosure / licence | existing sentinel guard and `check:dist` |
| Throwing populator inside the arrival's synchronous install block | DoS | rule (ii) of `world-lifecycle.ts`: total, no await; build first, commit after |

## Project Constraints (from CLAUDE.md / AGENTS.md)

- Everything runs in Docker; host Node/npm/Playwright are not authoritative; a green host run is not evidence. Scratch files live under `/tmp` and are mounted with `-v`; never in the repository.
- `src/sim/` is pure TypeScript: no Three, no DOM, fixed-step, deterministic; rendering, input and UI are downstream through commands and events. Bounds live only in `src/sim/world/limits.ts`.
- Content data is compiled from Oolite configs at build time; do not hand-edit generated data (`ships-npc.json` changes go through the converter and `assets:check`).
- No database; GPL-2.0-or-later code, CC BY-NC-SA assets; never add an asset without provenance in `NOTICE`/`ASSETS.md`. Oolite scripts are never vendored and never run at runtime.
- No OXP support: the spike's OXP is a throwaway outside the repository.
- Fidelity rule: Oolite's behaviour is the default; a divergence needs a `FIDELITY.md` row and the reviewer models' agreement; never diverge silently. Phase 22 rows to add: the cap and group-bound rule (never triggers for any committed system), the cut table, equal-priority order, the reproduced upstream quirks (`couriers *= 1.5`, the third `randomise` draw, `thug = 0` extras), the merged group model, the per-site stream design, fixture draws vs engine draws; update E-197 and the E-78 rewrite to say the pod-kind fallback is inert-path only.
- All project documentation in English. `CHANGELOG.md` `## [Unreleased]` entry for the user-visible change (systems are populated in ordinary play; production bundles have traffic on).
- Record significant decisions in `.planning/PROJECT.md` Key Decisions: the live session's move to the new populator beside the WORLD-15 row (ROADMAP scope note), the escort decision, the cap rule.
- Reviews by own models when the owner is away (memory); standing approval to re-pin twin hashes with a measured cause (D-04 of 21-CONTEXT).
- Simple mechanical tasks go to the cheapest subagent (AGENTS "Delegating simple tasks"); design, simulation, save-format and licensing stay on the main model.
- Reviewer and subagent brief (tests in Docker only, scratch under `/tmp`, read-only reviewers) goes into every subagent prompt, together with the Oolite checkout path and the `rg` preference.

## Sources

### Primary (HIGH confidence, read this session)
- `/home/opencode/git/oolite/Resources/Scripts/oolite-populator.js` lines 28-1023 (setup), 1375-2736 (builders and helpers); `Resources/Scripts/oolite-global-prefix.js:77-133`
- `/home/opencode/git/oolite/src/Core/Universe.m`: 1660-1830 (populate loop, `locationByCode`), 2585-2800 (`addShipAt`, `addShipsAt`), 9990-10001 (`populatorPrioritySort`)
- `/home/opencode/git/oolite/src/Core/Entities/ShipEntity.m`: 650-692 (accuracy, escort defaults), 1368-1393, 1532-1760 (`setUpEscorts`, `setUpMixedEscorts`, `setUpOneEscort`), 1120-1150 (`setAccuracy`), 6045-6070, 6988-7002, 7190-7210, 7318-7373 (`setCargoFlag`)
- `/home/opencode/git/oolite/src/Core/Scripting/{OOJSSystem.m, OOJSSystemInfo.m:455-482, OOJSShip.m:672-673, 1305-1320, OOJSPlayerShip.m:912-937}`; `src/Core/legacy_random.h:150-170`
- `/home/opencode/git/oolite/Resources/Config/{scenarios.plist, equipment.plist:240-255, descriptions.plist:2050}`; `Resources/Scenarios/oolite-standard.oolite-save`
- Wegolite: `src/sim/world/{placement,populate,limits,ids,entity,layout,world,debris}.ts`, `src/sim/{rng,hyperspace/jump,npc/escort}.ts`, `src/app/session/{traffic,world-lifecycle,context,start-session,event-router,save-controller}.ts`, `src/content/generated/{ships-npc,ships}.json` and `systems/g0..g7.json`, `tools/ai-harness/{host,load,dist-check,spike.test}.ts`, `tools/oolite-reference/README.md`, `tests/oracles/npc/{schema,reference.self.test}.ts`, `tests/guards/{oracle-independence,harness-isolation,npc-missiles-tripwire,tools-determinism}.test.ts`, `tests/helpers/{tick-script,traffic-fixture}.ts`, `tests/e2e/{anarchy.spec.ts, helpers/{budgets,save-fixtures}.ts}`, `compose.yaml`
- Planning: `22-CONTEXT.md`, `22-DISCUSSION-LOG.md`, `ROADMAP.md` Phase 22/23 sections, `REQUIREMENTS.md`, `STATE.md`, `.planning/research/{SUMMARY,FEATURES,PITFALLS}.md`, Phase 21 summaries 21-03/05/06/08/16/17/18/19, `21-VALIDATION.md`, Phase 14 and 17 plan-01 summaries

### Secondary (MEDIUM)
- Scratch census model (expected group and ship counts over all 2,048 systems), recomputed in this session from the committed data; not committed.

### Tertiary (LOW)
- Real-Oolite spike feasibility; equality of the AppImage's scripts with the checkout; fixture size estimate.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH, no new dependency.
- Script structure, formulas, traps: HIGH, read at the pin; the entry table and builders were read line by line.
- Engine-side behaviour (escorts, `addShipAt`, cargo flag): HIGH for what is stated; the stub's model of it is a recommendation (MEDIUM).
- Architecture and plan split: MEDIUM (design judgement; the per-site stream design is new).
- Population numbers: LOW-MEDIUM (scratch model).
- Spike: LOW.

**Research date:** 2026-11-26
**Valid until:** 2026-12-26 (the Oolite pin and the Wegolite seams are stable; re-check `git diff` on `oolite-populator.js` if the pin moves)
