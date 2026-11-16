# Phase 14: NPC Flight and Steering Fidelity Gate - Research

**Researched:** 2026-11-15
**Domain:** deterministic fixed-step port of Oolite's NPC flight model and native `BEHAVIOUR_*` steering (Objective-C to TypeScript), independent source-cited oracles, a 20-seed acceptance run, and a dev-only Node harness spike over Oolite's AILib JavaScript
**Confidence:** MEDIUM-HIGH (Oolite source and repo seams read directly this session; the acceptance thresholds, the frame-rate rule and the scope cuts are recommendations that need the plan and the owner)

<user_constraints>
## User Constraints (no CONTEXT.md exists)

No `14-CONTEXT.md` exists: the owner chose to plan this phase without `/gsd-discuss-phase`. Nothing below is copied from a CONTEXT.md. The constraints are taken from `.planning/ROADMAP.md` (Phase 14 section), `.planning/REQUIREMENTS.md` and `AGENTS.md`, and the planner must treat them with the authority of locked decisions.

### Locked (ROADMAP Phase 14 success criteria, verbatim in substance)
- NPC ships move with Oolite's NPC flight model using the speed, thrust and roll and pitch limits from their ship records, and steer with each native behaviour: idle, tumble, fly to destination, face, intercept, attack, flee, escort and avoid collision. Each behaviour passes oracle tests run against synthetic `WorldView` and `ShipControl` targets with fixed seeds.
- The oracle fixtures are authored independently of the port, in a separate plan by a separate agent from the porter. Each fixture is cited to Oolite source lines, with stated numeric tolerances and tick horizons. A recorded rule converts Oolite's frame-rate-dependent constants to the 1/120 s step.
- A 20-seed acceptance run passes against thresholds stated in the phase plan before the run: no stuck ship, no tunnelling through a hull or the station, no NaN repair.
- With traffic opted in, scripted through the test hook, ships fly to the station, intercept the player and flee, are drawn within the 50 draw-call budget and shown on the scanner, and replay hash-identically at 30, 60 and 144 Hz. This completes WORLD-07.
- A time-boxed, dev-only spike runs selected AILib functions from the original Oolite JavaScript in Node against a stub host; a check of `dist` asserts it is absent from the build. A fidelity report lists each behaviour's result against its oracle and the spike's outcome. The owner selects the oracle (the differential harness by default, source-cited traces only if the owner accepts that fallback); the choice is a Key Decision; the priority-AI phase is planned only after the owner accepts the report.
- At least 90 % of new behavioural assertions are Vitest scenarios; any browser spec is an opt-in smoke or journey check with traffic off by default.
- Requirements: AI-01, WORLD-07, AI-11.

### Claude's Discretion (ROADMAP "Decisions to settle" and "Research flag")
- Which `attack` sub-behaviours are in scope (the plan must state them).
- The acceptance thresholds for stuck, tunnelling and NaN repair, stated before the run.
- The spike's time box and the stub-host scope.
- The frame-rate conversion rule (recorded).
- The oracle choice at the gate is the OWNER's, not the planner's.

### Deferred / out of scope (ROADMAP, REQUIREMENTS)
- Collect, tractored, mining and land on planet (AI-12). Not built.
- Priority AI, role phases, station queue, populator repopulation (unscheduled former Phase 18).
- Autonomous NPC fire (CBT-15), destruction and death, hull-against-hull collision response, sound, police, pirates, missiles.
- In normal play NPC ships stay inert after v2.2 (Phase 12 D-02: a ship with no AI is inert); flight is observable only through the `?test=1` hook.
- IN-02 (`aiFaulted` recorded nowhere) and IN-04 (a failed NPC model is never retried) are fold-in candidates by owner decision, not requirements.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AI-01 | NPC ships move with Oolite's NPC flight model and steer with its nine native behaviours | "Oolite source map" (update order, `applySticks`, `applyThrust`, `trackDestination`, `trackPrimaryTarget`, every in-scope `behaviour_*`), "Standard Stack" (no new packages), "Architecture Patterns" (state record, options table, dispatcher), "Common Pitfalls" |
| WORLD-07 | Player sees NPC ships flying, drawn within the budget and on the scanner | Render and scanner already consume `npcContacts`; moving ships add no draw calls (instanced layer); needs the test-hook scenario, the budget and cadence checks (see "Validation Architecture") |
| AI-11 | Time-boxed dev-only spike over AILib JS in Node with a stub host, `dist` absence check, fidelity report, owner oracle choice | "Harness spike" pattern, `node:vm` facts, `dist` check placement relative to `verify` order, "Open Questions" |
</phase_requirements>

## Project Constraints (from AGENTS.md; no ./CLAUDE.md exists)

- Everything runs in Docker; a green host run is not evidence. Commands: `docker compose run --rm test`, `docker compose run --rm test npx vitest run <file>`, `docker compose run --rm typecheck`, `docker compose run --rm lint`, `docker compose run --rm verify`; `verify`, `verify-full` and browser specs run on the remote test machine only (owner memory). Scratch files live under `/tmp` and are mounted, never added to the repo.
- `src/sim/` imports no Three.js and no DOM; pure TypeScript, fixed step, deterministic. Rendering, input and UI are downstream through commands and events.
- Content data is compiled from Oolite configs at build time; never hand-edit `src/content/generated/`. Provenance of every asset goes in `NOTICE`/`ASSETS.md`.
- Oolite reference checkout is `/home/opencode/git/oolite` (read it; never fetch Oolite files over the network, never clone). Vendored subset `third_party/oolite/` is the content-build input and `CHECKSUMS.sha256` must stay honest.
- Record significant decisions in `.planning/PROJECT.md` Key Decisions; docs in English; user-visible changes under `## [Unreleased]` in `CHANGELOG.md` in the same commit.
- Gate by change type: pure `src/sim/` work needs `test`, `lint`, `typecheck`; browser-facing code (`src/app/`, `src/render/`, `index.html`) needs `verify`; `verify-full` only for render, input, persistence or network-guard changes.
- Delegate mechanical work (renames, status rows, collecting facts) to the cheapest model tier; keep judgement, simulation code, save-format and provenance work on the main model. Every subagent prompt carries the codebase-memory instruction, the `rg` instruction, the Oolite checkout path and the Docker-only brief.
- Doing file edits requires a GSD entry point (`/gsd-execute-phase` for planned work).

## Summary

Phase 14 is a port of a closed set of Oolite internals, not a framework. The Phase 12 world step already has the seams it needs: a world update phase whose Phase 8 constant-speed integrator is explicitly a placeholder awaiting this phase (`src/sim/world/step.ts:88-103`, PROJECT.md Key Decisions row (d)), a typed `WorldView`/`ShipControl` seam, per-entity `ai` and `combat` random streams (the `combat` stream is allocated, hashed and unused, so it is free for native steering jitter), a world hash and snapshot codec, an instanced NPC draw layer fed by id-free contacts, and a `StepOptions` read-only facts channel (`shipMasses`, `hulls`, `npcWeapons`) that is the established way to give the sim compiled per-ship data without importing content. Phase 13 is complete, so the shared-file rebase concern in the ROADMAP ordering rule is moot: Phase 14 extends the schema, golden and snapshot version Phase 13 left (`WORLD_SNAPSHOT_VERSION = 2`).

The Oolite side is fully readable at the pinned commit; the checkout's `ShipEntity.m`, `ShipEntityAI.m`, `Entity.m`, `Universe.m`, `Universe.h` and `ShipEntity.h` are byte-identical to `7437f22` for the files diffed, so the ROADMAP line numbers hold. The flight model is simple and exact: per ship per frame, `processBehaviour` picks one behaviour (which mostly sets `stick_roll`/`stick_pitch` and `desired_speed`), then `applyAttitudeChanges` rotates by `flightRoll/Pitch * delta_t`, then `applyThrust` ramps `flightSpeed` toward `desired_speed` at `5 * thrust` per second and moves along the nose. The risk is in the numeric details of `trackDestination`/`trackPrimaryTarget` and in the many reachable sub-behaviours of `attack`; this research reduces that surface by reachability analysis against the nine compiled ship records (accuracy of every one of the nine is random in `[-5,5)`, so every `accuracy >= 5` branch is unreachable from stock data).

Two findings change the plan shape. First, the original AILib JavaScript is NOT in `third_party/oolite/` (the vendored subset holds Config, Models and Textures only), so the spike can read it only through the checkout (`OOLITE_SRC` bind mount, the existing precedent in `tests/contract/fidelity.test.ts`) or after a deliberate vendoring bump; the remote test machine has no checkout, so the spike's tests must skip without it and the fidelity report must carry the recorded run. Second, a `dist` absence check cannot live in the Vitest `test` step, because `verify` runs `test` before `build` (documented in `tests/compliance.test.ts`); it needs a post-build step.

**Primary recommendation:** Port the flight model and the in-scope behaviours as pure functions over one typed per-ship flight record under `src/sim/npc/`, fed per-ship constants through a new `StepOptions` table (the `shipMasses` pattern), replace the placeholder integrator in `stepWorld`, and run three independent artifacts in parallel waves: the content flight fields, a source-cited oracle suite authored by a separate agent before the port exists, and the dev-only AILib spike under `tools/`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| NPC flight model (sticks, attitude, thrust, move) | Simulation core (`src/sim/npc`) | none | Deterministic fixed-step state; no DOM, no Three.js (AGENTS.md) |
| Native steering behaviours and dispatcher | Simulation core | none | They are `ShipEntity.m` update logic, not AI decisions; they run in the world update phase |
| Behaviour assignment (which behaviour, target, destination) | AI zone through `ShipControl` | Test hook (`?test=1`) | Pitfall 19: behaviours are chosen only through the seam; no priority AI exists, so a test-only scripted pilot is the sole assigner |
| Per-ship flight constants (speed, thrust, roll, pitch limits) | Content build (`tools/oolite-ingest`) | App (`StepOptions` table) | Compiled behind strict schema, golden and drift gate; the sim receives a table, never imports content (`content-boundary` guard) |
| Proximity alert pass | Simulation core | none | Oolite derives it from the collision pass at frame end; here a pure function of positions and radii |
| NPC draw and scanner | Render and HUD (existing) | none | `npcContacts` pose snapshots feed an instanced layer already within budget; no change except the test scenario |
| Differential harness spike | Dev tooling (`tools/ai-harness`, Node `vm`) | CI/post-build check | Must never enter `src/` or `public/`; absence proven on `dist` after the build |
| Oracle fixtures and reference calculators | Test tree (`tests/oracles`) | none | Independent of `src/sim/npc`; fixtures are data plus self-contained reference maths |
| Acceptance run (20 seeds) | Vitest in the container | none | Pure sim over `World`, no browser (Pitfall 11) |

## Standard Stack

No new runtime or dev packages are needed. The phase uses what the repo already pins.

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | 6.0.2 | all new code | pinned in `package.json` [VERIFIED: package.json devDependencies] |
| Vitest | 5.0.5 | unit, scenario, oracle, acceptance tests; `tools/**/*.test.ts` is already in the `unit` project include | [VERIFIED: package.json, vitest.config.ts include list] |
| fast-check | 4.10.2 | property tests for steering invariants (finite output, unit quaternion, speed bounds) | already a devDependency [VERIFIED: package.json] |
| zod | 4.6.7 | strict schema for the new NPC flight fields and for the oracle fixture format | already used by `NpcShipSchema` [VERIFIED: package.json, src/content/schemas/ship-npc.ts] |
| Node `node:vm` | Node ^24 (image) | run Oolite AILib JS in a context for the spike | built in; `vm.createContext` makes the object the script's global, so top-level `this.x = ...` lands on it [CITED: nodejs.org/docs/latest-v24.x/api/vm.html] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Playwright | 1.64.1 | one opt-in `?test=1&traffic=1&clock=manual` smoke spec | WORLD-07 browser proof only; at most 10 % of assertions [VERIFIED: package.json] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `node:vm` stub host | a JS engine package (QuickJS, isolated-vm) | Adds an unverified dependency for a dev-only spike whose input is trusted vendored GPL code; rejected |
| Reading AILib via `OOLITE_SRC` | vendoring `Scripts/*.js` into `third_party/oolite/` | Vendoring needs `scripts/vendor-oolite.sh` (network at pinned commit, which conflicts with the AGENTS.md "never fetch" rule for agents), `ASSETS.md` rows, checksums; defer to the owner's gate decision (see Open Questions) |

**Installation:** none. `docker compose build` is not needed; do not run `npm install`.

**Version verification:** versions above are the pinned values read from `package.json` this session; no registry lookup was needed because nothing is added.

## Package Legitimacy Audit

No external package is installed or recommended in this phase, so there is nothing to run through `package-legitimacy check`.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| (none) | - | - | - | - | - | No install |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
 test hook (?test=1) / test scenario / acceptance harness
        | spawn flight-script pilots, set sim state   (taints session)
        v
 stepSim(player, world, layout, ..., options{ npcFlight table, hulls })      src/sim/sim.ts
        |
        |-- stepFlight (player, unchanged)
        |
        `-- stepWorld(world, player, layout, dt, registry, npcFlight)       src/sim/world/step.ts
              |
              | UPDATE phase, ascending id, for entities with ai != null
              |   steerShip(entity, host, stats, dt)                          src/sim/npc/dispatch.ts
              |     1. resolve accuracy once (entity.rng.combat)
              |     2. tracking-curve sample (60-tick gate)
              |     3. processBehaviour(behaviour) --> sets sticks, desired_speed,
              |           may change entity.nav.behaviour (attack -> sub-behaviour,
              |           avoidCollision -> AVOID_COLLISION, goIdle on lost target)
              |        events (target lost, range achieved, facing, frustrated)
              |           --> postAiEvent (queued, delivered next drain)
              |     4. applySticks   (roll 2*dt, pitch 4*dt, x4 on reversal)
              |     5. applyAttitudeChanges (orientation *= roll/pitch step)
              |     6. applyThrust   (speed ramps at 5*thrust; move along nose)
              |     7. escort leaders refresh follower destinations
              |
              | THINK phase: AI modules (test pilot / flight-script pilot)
              |   write ShipControl: setTarget / setDestination / setDesiredRange /
              |   setDesiredSpeed / perform(BehaviourId) / scheduleWake
              |
              | SANITIZE (flight record included), PROXIMITY pass
              |   (proximityAlert for next tick), COMMIT
              v
 hashWorld / snapshot  <---- new per-ship flight record appended, snapshot v3
        |
        v
 npcContacts(world) --> instanced NPC layer + scanner (already within 50 calls)
```

### Recommended Project Structure

```
src/sim/npc/                    # NEW, inside the sim zone (not the AI zone)
├── constants.ts                # ledger: every number with Oolite file:line (like combat/constants.ts)
├── state.ts                    # FlightComponent record, factory, sanitize, serialize
├── flight.ts                   # applySticks, applyAttitude, applyThrust (ShipEntity.m 7018-7065, 5899-5902, 5808-5854)
├── track.ts                    # trackDestination, trackPrimaryTarget, evasiveAction, setEvasiveJink
├── tracking-curve.ts           # reaction-time target prediction (5412-5489)
├── proximity.ts                # proximity pass + avoidCollision/resume (CollisionRegion.m 299-312; ShipEntity.m 5904-5958, 6098-6146)
├── dispatch.ts                 # processBehaviour switch (ShipEntity.m 2485-2638) and the orchestrating steerShip
└── behaviours/                 # one file per behaviour, Oolite line range in each header
    ├── idle.ts  tumble.ts  stop-still.ts
    ├── fly-to-destination.ts  face-destination.ts  intercept.ts
    ├── attack.ts  (dispatcher) fly-to-target.ts  fly-from-target.ts  break-off.ts
    │   slow-dogfight.ts  evasive-action.ts  fly-to-target-six-twelve.ts  sniper.ts
    ├── flee.ts  formation-form-up.ts  avoid-collision.ts
src/sim/ai/pilots/flight-script.ts   # NEW AI key: scripted behaviour assignment, ShipControl only
tools/oolite-ingest/...              # compile flight fields (maxFlightSpeed, roll, pitch, thrust)
tools/ai-harness/                    # NEW dev-only spike: stub host + loader + tests; never imported by src
tests/oracles/npc/                   # NEW independent oracle fixtures + self-contained reference maths
tests/acceptance/                    # NEW 20-seed run + thresholds file
```

### Pattern 1: Flight model order per ship per tick
**What:** Oolite's per-ship update calls `processBehaviour` and, for most behaviours, then `applyAttitudeChanges` and `applyThrust`, in that order, so the nose used for movement is the already-rotated one.
**When to use:** the body of `steerShip`, exactly this order.
**Example (verified lines):**
```typescript
// Source: ShipEntity.m:2634-2637 (processBehaviour tail) and 5808-5854, 5899-5902
// if (applyThrust) { applyAttitudeChanges(dt); applyThrust(dt); }
//   applyThrust: dt_thrust = SHIP_THRUST_FACTOR(5.0f) * thrust * dt
//     speed ramps toward min(desired_speed, max_available_speed) by dt_thrust, never past it
//     then moveForward(dt * flightSpeed); BEHAVIOUR_TUMBLE returns before the speed ramp
//   applyAttitudeChanges: applyRoll(flightRoll*dt, climb flightPitch*dt, yaw flightYaw*dt)
```
`BEHAVIOUR_TRACK_AS_TURRET` and `BEHAVIOUR_ENERGY_BOMB_COUNTDOWN` skip thrust and attitude (`ShipEntity.m:2613-2615`, `2627-2629`); both are out of scope.

### Pattern 2: Per-ship constants through a StepOptions table, dynamic state on the entity
**What:** `Entity` carries no mass: masses arrive through `StepOptions.hyperspace.shipMasses` keyed by `specKey` (`src/sim/world/ship-field.ts:51-60`), and NPC weapons through `combat.npcWeapons` (`src/app/session/step-options.ts`). Do the same for flight constants: a read-only `npcFlight` table (`specKey` to `{ maxFlightSpeed, maxFlightRoll, maxFlightPitch, thrust, forwardWeapon range }`). Only the DYNAMIC state is added to `Entity`, so hash and snapshot grow by state, not by constants.
**When to use:** all compiled per-ship numbers. `stepWorld` currently has no options parameter (`src/sim/world/step.ts:70-76`); add an optional trailing parameter and thread it from `stepSim` (`src/sim/sim.ts:105`).
**Example:**
```typescript
// Source pattern: src/sim/world/ship-field.ts (ShipMass), src/app/session/step-options.ts
export interface NpcFlightStats {
  readonly specKey: string;
  readonly maxFlightSpeed: number;  // shipdata max_flight_speed, default 160 (ShipEntity.m:263-264)
  readonly maxFlightRoll: number;   // default 2.0 (ShipEntity.m:265)
  readonly maxFlightPitch: number;  // default 1.0 (ShipEntity.m:266)
  readonly thrust: number;          // default 15.0 (ShipEntity.m:270)
}
```

### Pattern 3: One typed flight record, plain data, hashed and snapshotted
**What:** All steering state from `ShipEntity.h:192-198, 327-364, 437` that behaviours read or write, as one record next to `nav`, with a sanitizer and a snapshot parser entry (the Phase 13 energy-bank change is the template: `Entity`, `spawnEntity`, `serializeEntity`, `sanitizeEntity`, `snapshotWorld`/`parseWorldSnapshot`, the per-field `Record<keyof Entity, ...>` table in `tests/sim/world/snapshot-codec.test.ts` fails typecheck until a row exists).
**Fields (derived from the behaviours read this session):** `flightRoll`, `flightPitch` (rates), `stickRoll`, `stickPitch`, `frustration`, `successFactor`, `pitchingOver`, `jink` (Vec3), `proximityAlert` (EntityId), `previousCondition` (saved behaviour, target id, desired range, desired speed, destination, or null), `accuracy` (resolved flag), `trackingCurve` (four sample positions, four sample ticks), `escortSlot` (leader is the existing `ownerId`). `flightSpeed` stays `Entity.speed`; `desired_speed`, `desired_range`, `_destination`, `behaviour`, `primaryTarget` stay in `nav`.
**Hash policy (recommended):** follow Phase 13: append one segment, bump `WORLD_SNAPSHOT_VERSION` 2 to 3 once, regenerate `tests/golden/world/inert-lave-epoch1.json` once with `tests/helpers/write-inert-world-golden.ts`, and prove the population draws did not move by stripping the new segment and re-hashing to the previous fnv (Phase 13 did this for the `en:` segment, fnv `b23d11d8` to `ab72eedf` [VERIFIED: .planning/phases/13-views-lasers-and-shields/13-07-SUMMARY.md]). Never touch `tests/golden/world/flight-hash-pins.json`.

### Pattern 4: Native steering reads a `WorldView`-shaped host
**What:** The success criterion demands oracles run "against synthetic `WorldView` and `ShipControl` targets". Write each behaviour as a pure function `(self: SteerState, host: SteerHost, out: SteerOutput)` where `SteerHost` is `WorldView` extended additively (Pitfall 19 allows a member only when a phase needs it, and pins the member set with `Record<keyof WorldView, true>` in `tests/sim/world/view.test.ts`). The only member the steering needs that `WorldView` lacks is the collision radius of a body (`rangeToPrimaryTarget` subtracts both radii, `ShipEntity.m:9723-9733`): add `radius` to `BodyView`. `speed`, `orientation`, `position`, `targetId` (the target's own target) and `behaviour` (the target's behaviour, `ShipEntity.m:4724`) are already on `BodyView`/`ShipView` (`src/sim/world/view.ts:27-43`). Synthetic oracle hosts then implement the same interface with hand-set poses.
**Cost note:** `view-impl.ts` copies per call; at the 12-ship Lave population this is negligible, and the world is capped at `MAX_ENTITIES = 256` [VERIFIED: src/sim/world/ids.ts:53].

### Pattern 5: Behaviour assignment only through ShipControl, by a test-only AI key
**What:** `AI_KEYS` is `["test-pilot"]` [VERIFIED: src/sim/ai/types.ts:19, `export const AI_KEYS = ["test-pilot"] as const;`], a closed list that `spawnEntity`, `sanitizeEntity` and the snapshot parser all enforce. Add one test-only key (for example `"flight-script"`) whose `think` walks a small script held in `AiComponent.params` (numbers and strings only, `ParamValue`, `src/sim/ai/types.ts:40-41`) and calls `ctl.setTarget/setDestination/setDesiredRange/setDesiredSpeed/perform/scheduleWake`. The populator never spawns it, as with the test pilot (`src/sim/ai/pilots/test-pilot.ts:1-12`). The ShipControl member set is exactly `setTarget`, `setDestination`, `setDesiredRange`, `setDesiredSpeed`, `perform`, `scheduleWake`, `fire` [VERIFIED: src/sim/world/control.ts:24-42]; do not add members (the pin test `tests/sim/world/control.test.ts` would need a deliberate edit and nothing here needs one).
**Unimplemented ids:** `perform` accepts all 39 `BEHAVIOUR_IDS` [VERIFIED: src/sim/world/ids.ts:68-108 lists IDLE, TRACK_TARGET, TUMBLE, STOP_STILL, STATION_KEEPING, ATTACK_TARGET, ... SCRIPTED_ATTACK_AI]. The native dispatcher must define what the out-of-scope ids do (recommend: hold attitude, decay speed as IDLE, never throw) and a test must pin it.

### Pattern 6: Oracle plan structure (independence by construction)
**What:** Plan O (oracle author) runs in wave 1, before any `src/sim/npc` file exists, and its executor is forbidden to read or list `src/sim/npc/**`. It delivers (a) a fixture schema (`tests/oracles/npc/schema.ts`, zod strict), (b) JSON fixtures, each with `oolite: "ShipEntity.m:a-b"` citations, an initial synthetic state, a tick-indexed list of expected values with explicit tolerances and horizons, and (c) self-contained reference maths in `tests/oracles/npc/reference/` that imports nothing from `src/` (own vector and quaternion code; use `Math.fround` to emulate GLfloat where Oolite stores `GLfloat`, so the fixture can state a tolerance from the measured float32-vs-float64 difference, `ShipEntity.h:194-198, 228-235, 357-364` declare these `GLfloat`). A guard test (`tests/guards/oracle-independence.test.ts`) scans `tests/oracles/**` imports and fails on any `src/` import other than the fixture schema's type. Plan P (porter) never reads fixture expectations before its own implementation compiles. A third small plan owns the runner that loads a fixture, builds the synthetic host and compares.
**Precedent:** Phase 5 kept hand-derived reference vectors as the correctness oracle and treated generated goldens as regression snapshots only [VERIFIED: .planning/STATE.md line 275].

### Pattern 7: Harness spike layout
`tools/ai-harness/` (outside `src/`, so Vite never bundles it; it is inside the Vitest `unit` project through `tools/**/*.test.ts`): `load.ts` reads `Resources/Scripts/oolite-priorityai.js` and one role AI from `process.env.OOLITE_SRC`, wraps each in a `vm` context (`vm.createContext(sandbox)`; the library's top-level `this.PriorityAIController = ...` then lives on the sandbox, and role AIs reach it as `worldScripts["oolite-libPriorityAI"].PriorityAIController` [VERIFIED: Resources/AIs/oolite-shuttleAI.js:31-32 read this session]). `host.ts` is the stub host: `clock`, `system`, `player`, `log`, `Timer`, `Vector3D`, `worldScripts`, `oolite`, a scripted `Math.random`, and a recording `ship` whose `perform*` calls and property writes are the trace. Use `timeout` on every `runInContext` call (strictly positive integer ms; with `microtaskMode: "afterEvaluate"` if promises appear) [CITED: nodejs.org/docs/latest-v24.x/api/vm.html].

### Anti-Patterns to Avoid
- **Reusing the player's scalar flight model for NPCs.** The player's model is a different, ramped keyboard model (`src/sim/flight/attitude.ts`); NPC attitude is `applySticks` plus `applyRoll`. Only the quaternion composition convention (sign of roll and pitch, local -Z forward) is shared (PITFALLS 6).
- **Calling `Math.random`, `Date`, wall clocks or `createSeededRandom` in steering.** Lint bans them in `src/sim` (`eslint.config.js` SIM bans) and the AI zone. Draw only from `entity.rng.combat` (steering jitter) and `ctx.random` (AI think).
- **Synchronous AI messages.** Oolite calls `[shipAI message:@"DESIRED_RANGE_ACHIEVED"]` and `doScriptEvent` inline; here they become `postAiEvent` entries delivered at the next drain (Pitfall 7, `src/sim/world/world.ts:507-520`).
- **Tuning by eye.** Every number comes from the ledger with an Oolite line (Pitfall 6, `src/sim/combat/constants.ts` is the model).
- **Putting the harness or any Oolite JS under `public/`.** `public/` is copied wholesale into `dist/`.

## Oolite Source Map (pinned `7437f22`, files identical in the checkout)

Order inside one ship update (`ShipEntity.m:2083-2483`): collisions managed, weapon cooling, temperature, then the status branch: LAUNCHING ships ignore behaviour and just move (`2355-2391`), otherwise `processBehaviour:` (`2415`), energy recharge (`2418-2425`), escort destination refresh (`2427-2445`), then `[super update:]` which applies `velocity` (`Entity.m:850-876`). `Universe update:` runs every entity's update, then AI think, THEN collision and proximity detection for the next frame (`Universe.m:6532-6600` update loop with the AI think at `6569`, then `[self findCollisionsAndShadows]` at `6609`), so a proximity alert set at the end of frame N is read in frame N+1.

### Frame time in Oolite
`delta_t` is the real frame time capped at `MINIMUM_GAME_TICK 0.25` (`GameController.m:340-348`, `GameController.h:36` `#define MINIMUM_GAME_TICK 0.25`) times `timeAccelerationFactor`, which is the constant `1.0` in end-user builds (the non-debug `timeAccelerationFactor` at `Universe.m:6693`). The animation timer interval comment reads "default one two-hundredth of a second (should be a fair bit faster than expected frame rate ~60Hz ...)" (`GameController.m:372`). So Oolite's reference step is a real, variable frame time, typically near 1/60 s, and behaviours run once per frame.

### Constants (verbatim from `ShipEntity.h`, `Universe.h`)
```
ShipEntity.h:46   #define SHIP_THRUST_FACTOR 5.0f
ShipEntity.h:56   #define COMBAT_IN_RANGE_FACTOR 0.035f
ShipEntity.h:58   #define COMBAT_OUT_RANGE_FACTOR 0.500f
ShipEntity.h:60   #define COMBAT_WEAPON_RANGE_FACTOR 1.200f
ShipEntity.h:61   #define COMBAT_JINK_OFFSET 500.0f
ShipEntity.h:115  #define WEAPON_COOLING_FACTOR 6.0f
ShipEntity.h:116  #define NPC_MAX_WEAPON_TEMP 256.0f
ShipEntity.h:117  #define WEAPON_COOLING_CUTOUT 0.85f
ShipEntity.h:123  #define COMBAT_AI_CONFIDENCE_FACTOR 1250000.0f
ShipEntity.h:124  #define COMBAT_AI_ISNT_AWFUL 0.0f
ShipEntity.h:126  #define COMBAT_AI_IS_SMART 5.0f
ShipEntity.h:128  #define COMBAT_AI_FLEES_BETTER 6.0f
ShipEntity.h:130  #define COMBAT_AI_DOGFIGHTER 6.5f
ShipEntity.h:132  #define COMBAT_AI_TRACKS_CLOSER 7.5f
ShipEntity.h:133  #define COMBAT_AI_USES_SNIPING 8.5f
ShipEntity.h:135  #define COMBAT_AI_FLEES_BETTER_2 9.0f
ShipEntity.h:137  #define COMBAT_AI_STANDARD_REACTION_TIME 1.5f
ShipEntity.h:142  #define MAX_COS 0.995 // cos(5 degrees) is close enough in most cases for navigation
Universe.h:99     #define PROXIMITY_WARN_DISTANCE 4
Universe.h:101    #define PROXIMITY_AVOID_DISTANCE_FACTOR 10.0
```
[VERIFIED: opened with Read this session, ShipEntity.h:40-150, Universe.h:96-103]. Ship-setup defaults [VERIFIED: ShipEntity.m:263-270, 291-292, 553, 665-672, 717]: `max_flight_speed` default `160.0f` (0 for stations), `max_flight_roll` 2.0, `max_flight_pitch` 1.0, `thrust` 15.0, `scanner_range` default `SCANNER_MAX_RANGE`, `accuracy` default -100 then `accuracy = (randf() * 10.0) - 5.0` and negated for `CLASS_MILITARY`/`CLASS_POLICE`, `reaction_time` default 1.5. `setAccuracy:` derives `aim_tolerance = 240.0 - (18.0f * accuracy)` (`ShipEntity.m:1126-1143`).

### The flight model (all line ranges read this session)
| Piece | Oolite lines | Notes for the port |
|-------|--------------|--------------------|
| `applySticks:` | `ShipEntity.m:7018-7065` | roll rate `2*dt`, pitch and yaw rate `4*dt`, each x4 when the stick opposes the current rate, x2 more when `stick == 0` and `accuracy >= COMBAT_AI_TRACKS_CLOSER`; each axis snaps to the stick when within one rate step |
| `applyAttitudeChanges:` / `applyRoll:climb:andYaw:` | `5899-5902`, `5881-5897` | `q1 = identity; rotate_about_z(-roll); rotate_about_x(-climb); rotate_about_y(-yaw); orientation = q1 * orientation`, normalised by `orientationChanged` |
| `applyThrust:` | `5808-5854` | brakes any Newtonian `velocity` by `dt_thrust`; clamps `desired_speed` to `max_available_speed`; ramps `flightSpeed` by `dt_thrust` never overshooting; `moveForward(dt*flightSpeed)`; `BEHAVIOUR_TUMBLE` returns before the ramp |
| `increase_flight_speed:` / `decrease_flight_speed:` | `7405-7429` | decrease uses factor `MIN_HYPERSPEED_FACTOR` only above `maxFlightSpeed` (afterburner) |
| `moveForward:` | `Entity.m:796-800` | `position += forward * amount` |
| `trackDestination:retreat:` | `9450-9591` | `min_d = 0.004`; `max_cos = sqrt(1 - 0.9025 * desired_range^2 / range^2)` capped at `0.99999`; `int factor = sqrt(|d|/min_d)` capped 8; `stick_pitch = 0.01` fallback; `pitching_over` pitch-up rule; returns `d_forward` or `1.0` if no correction |
| `trackPrimaryTarget:retreat:` | `9034-9244` | uses `calculateTargetPosition` (tracking curve), jink offsets when retreating, `currentAimTolerance`, `min_d 0.004`/`0.0004`, `max_factor` rules by accuracy |
| `evasiveAction:` | `9003-9032` | rolls to `+-max_flight_roll` unless nearly aligned, pitches to `+-max_flight_pitch` |
| `setEvasiveJink:` | `8980-9001` | draws two `ranrot_rand()` values per call |
| tracking curve | `5412-5489`, `updateTrackingCurve` called each frame at `ShipEntity.m:2131` | samples target position every `reactionTime/3` of universe time; default 1.5 s so every 0.5 s, i.e. exactly 60 ticks |
| `avoidCollision` / `resumePostProximityAlert` | `5904-5958` | saves behaviour, target, range, speed, destination; sets `pitching_over = YES` |
| `setProximityAlert:` | `6098-6146` | ignores `other.mass < 2000`, stations as `self`, and ships with no `crew`; zone is `2*collision_radius + other.collision_radius` with the forward axis stretched up to 4x by `0.25*maxFlightSpeed/flightSpeed` |
| proximity trigger | `CollisionRegion.m:299-312` | for ship pairs: `dist2 < PROXIMITY_WARN_DISTANCE2 * r^2` (4x radius squared, either ship), then both ships get the alert |

### The behaviours and the dispatch
Dispatch is `processBehaviour:` `ShipEntity.m:2485-2638`. The nine requested behaviours map to Oolite behaviours as follows:

| AI-01 name | `BEHAVIOUR_*` | Function and lines | Needs (beyond the flight model) |
|------------|---------------|--------------------|---------------------------------|
| idle | `IDLE` (plus `STOP_STILL`) | `behaviour_idle` 3708-3722, `behaviour_stop_still` 3700-3706 | none; STOP_STILL is used by the existing test pilot |
| tumble | `TUMBLE` | `behaviour_tumble` 3724-3727; sticks set by `performTumble` (`ShipEntityAI.m:473-479`, two `randf()`); Newtonian drift not modelled | `entity.rng.combat` |
| fly to destination | `FLY_TO_DESTINATION` | 5049-5134 | proximity alert, `thrust`, `max_flight_pitch/roll`; docking branches are out |
| face | `FACE_DESTINATION` | 4920-4965 | `flightPitch == 0.0` exact test (4930), frustration with `15.0 / max_flight_pitch` |
| intercept | `INTERCEPT_TARGET` | 3817-3884 (the `COLLECT_TARGET` half is AI-12) | tracking curve, `trackPrimaryTarget` |
| attack | `ATTACK_TARGET` dispatcher and sub-behaviours | 4038-4185, see next table | weapon temperature fixed at 0 (no NPC fire in this milestone), `accuracy` |
| flee | `FLEE_TARGET` | 4840-4901 | jink offsets (`trackPrimaryTarget` retreat), `desired_range`, event `REACHED_SAFETY` |
| escort | `FORMATION_FORM_UP` | 5002-5047; leader refreshes escort destinations in its own update (2427-2445); positions from `coordinatesForEscortPosition` (`ShipEntity.m:12029-12040`) fed by `Script.prototype.coordinatesForEscortPosition` (`Resources/Scripts/oolite-global-prefix.js:186-193`: `spacing = collisionRadius * 3 * highPart`, pattern vectors multiplied by it; the pattern table is at `oolite-global-prefix.js:165-171`) | leader id (`ownerId`), slot index, leader orientation |
| avoid collision | `AVOID_COLLISION` | 5155-5171, entered via `avoidCollision` (5904-5936) | proximity pass |

`attack` is a dispatcher that rewrites `behaviour` into one of many sub-behaviours (`ShipEntity.m:4073-4182`). Reachability from the nine compiled records, using the values below: every one of the nine has NO `accuracy`, so `accuracy` is random in `[-5, 5)` (police: `[0, 5]`), which is always `< COMBAT_AI_IS_SMART (5.0)`. None has `aft_weapon_type`, `port_weapon_type` or `starboard_weapon_type`. The Shuttle has `forward_weapon_type = "WEAPON_NONE"`: its forward weapon type stays nil (`isWeaponNone` is true, `ShipEntity.m:443-466`) and `setWeaponDataFromType:nil` gives `weaponRange = getWeaponRangeFromType(nil) = [nil weaponRange] = 0` (`ShipEntity.m:13041-13044`), so the Shuttle's weapon range is 0, not a laser range. That decides `ATTACK_FLY_FROM_TARGET`'s exit test (`range > 0.5 * 0 + 15 * jink.x`, 4775): with a zero jink an unarmed attacker alternates ATTACK_TARGET and ATTACK_FLY_FROM_TARGET every tick.

| Sub-behaviour | Lines | Reachable from the nine records? | Recommended |
|---------------|-------|----------------------------------|-------------|
| `ATTACK_FLY_TO_TARGET` | 4611-4731 | yes (default armed branch, 4169) | IN |
| `ATTACK_FLY_FROM_TARGET` | 4733-4799 | yes (unarmed Shuttle 4099; `nearby` with `accuracy < 6`, 4154) | IN |
| `ATTACK_FLY_TO_TARGET_SIX` / `_TWELVE` | 4461-4580 | yes (`accuracy < 0`, 4164-4167); non-turret twelve is "1.25 km above the target" (4552) | IN (non-turret branch only) |
| `ATTACK_SNIPER` | 4397-4459 | yes for beam-laser ships when `range > 12500` (4160) | IN |
| `ATTACK_BREAK_OFF_TARGET` | 3886-3942 | only when `accuracy >= 6` (4151): not reachable from stock data | IN as cheap conditionals, oracle by table |
| `ATTACK_SLOW_DOGFIGHT` | 3944-3994 | only from break-off | IN with break-off |
| `EVASIVE_ACTION` / `FLEE_EVASIVE_ACTION` | 3996-4036 | yes, from stock data, through `performFlee` (`ShipEntityAI.m:383-389`): whenever `accuracy > COMBAT_AI_ISNT_AWFUL (0)` and `approachAspectToPrimaryTarget > 0.9995`, then one draw (`< 0.15` EVASIVE_ACTION, else FLEE_EVASIVE_ACTION); stock accuracy is drawn in `[-5, 5)`, so about half of stock ships qualify. The dispatcher's own EVASIVE branch (4103) needs no usable armed weapon and is unreachable under the weapon-temperature-0 cut; `ATTACK_FLY_TO_TARGET` (4721) and `ATTACK_FLY_FROM_TARGET` (4790) reach it only at `accuracy >= 9`. (Corrected by plan 14-02: the earlier "accuracy >= 5 only" claim was wrong.) | IN (shares `evasiveAction`; oracle rows in plan 14-02's flee, attack-dispatch and attack-evade fixtures) |
| `RUNNING_DEFENSE`, `ATTACK_BROADSIDE(_LEFT/_RIGHT)`, `CLOSE_TO_BROADSIDE_RANGE`, `CLOSE_WITH_TARGET` | 4187-4395, 4801-4838 | no (need aft/port/starboard weapons) | OUT, ledger row "not ported, no consumer" |
| `ATTACK_MINING_TARGET` | 4582-4609 | no | OUT (AI-12) |
| turret branches, `TRACK_AS_TURRET` | 4073-4075, 5173 | no | OUT |

Record data the nine need (values from the vendored `shipdata.plist`; the Viper rows were opened with Read, the rest by line-numbered extraction, so re-verify at compile time under the drift gate):

| Ship | `max_flight_speed` | `max_flight_roll` | `max_flight_pitch` | `thrust` | forward weapon | line refs |
|------|-------------------|-------------------|--------------------|----------|----------------|-----------|
| adder | 240 | 2.8 | 2 | 30 | pulse | plist 145-147, 155 |
| cobramk1 | 260 | 2 | 1.2 | 25 | pulse | 1544-1546, 1554 |
| gecko | 300 | 3 | 1.5 | 45 | beam | 2320-2322, 2329 |
| krait | 300 | 2.75 | 1.5 | 35 | beam, `has_fuel_injection = 0.65` | 2551-2553, 2560, 2526 |
| mamba | 320 | 2.1 | 1.4 | 32 | pulse | 2631-2633, 2640 |
| moray | 300 | 2.5 | 1.5 | 32 | pulse | 2833-2835, 2843 |
| shuttle | 80 | 2 | 0.9 | 16 | none (weapon range 0, `ShipEntity.m:443-466`, `13041-13044`) | 3533-3535, 3541 |
| sidewinder | 370 | 2.8 | 1.6 | 37 | pulse | 3589-3591, 3597 |
| viper | 320 | 2.8 | 1.8 | 32 | beam | 3878-3880, 3962 |

[CITED: third_party/oolite/Config/shipdata.plist at the lines shown; viper lines 3877-3885 and 3962-3963 [VERIFIED: Read]]. The ROADMAP's "implied work" (compile these four fields behind the strict schema, golden and drift gate) is confirmed. The existing record (`src/content/schemas/ship-npc.ts:36-76`) is `z.strictObject` with `maxEnergy`, `energyRechargeRate`, `forwardWeapon`, `forwardWeaponPosition` already added by Phase 13, so the new fields extend the same schema and golden. No `accuracy`, `reaction_time` or `scanner_range` is authored for any of the nine; add a drift-gate assertion that they stay absent, because the port relies on the defaults.

## Frame-Rate Rule (the recorded 1/120 s conversion) - recommended content

Audit of `delta_t` and per-call sites in the lines read (the oracle plan must complete and confirm this ledger):

| Site | Lines | Kind | Rule at the fixed step |
|------|-------|------|------------------------|
| `applySticks` rates `2*dt`, `4*dt`, `4*dt` | 7021-7023 | rate times dt | keep verbatim with `dt = 1/120`; the ramp is rate per second, so settled motion matches Oolite at any frame rate |
| overshoot limiters `fabs(d) < fabs(stick) * delta_t -> stick = fabs(d) / delta_t` | 9208-9213, 9533-9558 | dt on both sides, dimensionally an angle limit | keep verbatim; it limits less at smaller dt, which only makes the 1/120 s step more accurate. Record as a divergence only if the oracle shows a settled-heading difference above tolerance |
| `frustration += delta_t`, `-= 0.25*dt`, `-= 0.75*dt`, `+= 0.9*dt`, `/ 4.0` | 3869-3873, 4021, 4562, 5030-5042, 4745-4748 | accumulate seconds | keep as float seconds accumulated by exact `DT`; thresholds (`3.0`, `10.0`, `15.0`, `0.5`) compare as written |
| `frustration - floor(frustration) > fmin(1.6/max_flight_roll, aspect)` | 3921 | time-fraction of an accumulated value | verbatim |
| tracking curve sampling gate `times[0] + reactionTime/3 > now` | 5448 | universe time | integer ticks: sample when `ticksSince >= round(reactionTime/3 * 120)`; 60 ticks at the default 1.5 s |
| `randf()`/`ranrot_rand()` draws | 4102, 4751-4757, 8985-8986, `performTumble`, accuracy at setup | per-call randomness | draw from `entity.rng.combat`; keep Oolite's call structure; the draw COUNT per behaviour entry is not frame-rate dependent because each is gated by a state change or an accumulated threshold |
| `flightPitch += 0.5 * old_pitch` low-FPS hack | 4958-4960 | per-call one-shot under conditions | verbatim (conditions are state, not frame-count) |
| `qbomb_chance = 0.01 * delta_t` | 4883 | per-call probability | out of scope (cascade mine) |

Recommended statement for the plan: "Every Oolite expression that multiplies or divides by `delta_t` is evaluated with `delta_t = DT = 1/120` exactly as written; every wall-clock compare of universe time becomes a whole-tick compare with one rounding rule; no behaviour is run more than once per tick; the audit table above is pinned by a test per row." Scheduling timers (`wakeTick`, `nextThinkTick`) stay integer ticks as in `src/sim/ai/time.ts`. Continuous accumulators (`frustration`) stay float seconds, a recorded divergence from Pitfall 3's integer-timer wording: they are not scheduled timers, they are hashed through `canon` and are bit-reproducible at the fixed step (PROJECT.md Key Decisions row (f): equality is claimed within one JS engine family).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Octree line test for hull tunnelling checks | a new hull intersection routine | `isHitByLine`, `toOoliteModelSegment` (`src/sim/combat/octree.ts:435-476`) and `firstShipHit` (`src/sim/combat/hit.ts`), driven with the tick displacement segment as the ray | Phase 13 ported `Octree.m:336-471`; reuse gives the "two-stage" rule (bounding sphere then octree) for free |
| Hull data loading | a second loader | `realHullTable()` (`tests/helpers/hull-table.ts`) in tests, `ctx.core.hulls` in the app | ten hulls (Cobra plus nine NPCs) already shipped lazily |
| World setup for scenarios | hand-built entity arrays | `laveInertWorld(epoch)`, `poseNearFirstShip` (`tests/helpers/traffic-fixture.ts`), `createWorld`, `spawnEntity`, `populateInertWorld` | same geometry as the Phase 12 browser and Node proofs |
| Cross-cadence hash harness | a new frame runner | the runner in `tests/sim/world/world-cadence.test.ts` (tick-indexed log, 30/60/144 Hz frames) | cadence tests are indexed by tick, never by frame; a frame-indexed log is the classic false failure |
| Random draws | `Math.random` or any closure RNG | `rngNext` over `entity.rng.combat` (`src/sim/rng.ts:46-56`) | snapshot-able, forked per entity so spawns never shift another ship's draws (D-04) |
| Event delivery | direct calls into AI | `postAiEvent` (`src/sim/world/world.ts:507-520`) | Pitfall 7; queue is bounded and counted in the hashed `aiDropped` |
| Content compile of ship fields | a hand-written TS table | `tools/oolite-ingest` with `like_ship` resolution (`like-ship.ts`), `NpcShipSchema`, `assets:check` | strict schema, golden, drift gate |
| FIDELITY rows | free text | `FIDELITY.md` row and excerpt format checked by `tests/contract/fidelity.test.ts` (rows need `src/...:line` Wegolite cell, `src/Core/...:a-b` Oolite cell, excerpt at most 20 lines, divergences quote a PROJECT.md Key Decisions row) | contract-tested; long behaviours need several excerpts |
| JS sandbox for the spike | an ad hoc `eval` | `node:vm` `createContext`/`runInContext` with `timeout` | built in; trusted input |

**Key insight:** this phase is mostly transliteration plus independent checking. The tooling to hash, snapshot, sanitise, draw, scan, step by tick and compare across cadences already exists; the new work is state shape, constants, the behaviours and the oracles.

## Common Pitfalls

### Pitfall 1: Frame mapping between Oolite and Wegolite (forward is local -Z)
**What goes wrong:** steering reads `v_forward`, `v_right`, `v_up` dot products; a copied formula with the wrong forward axis makes ships fly backwards or roll the wrong way.
**Why it happens:** the content build negates z, so Wegolite's local forward is -Z while Oolite's is +Z; `toOoliteModelSegment` documents this and `laserFrame` uses `LOCAL_FORWARD = (0,0,-1)`, `LOCAL_RIGHT = (1,0,0)`, `LOCAL_UP = (0,1,0)` [VERIFIED: src/sim/combat/octree.ts:448-476, src/sim/combat/aim.ts:44-47 region]. The player's roll is built with `-rollRate` and pitch `+pitchRate`, "pinned by test; do not fix the minus sign" [VERIFIED: src/sim/flight/attitude.ts:9-13, 63-66].
**How to avoid:** take `d_forward = dot(rel, rotate(q, (0,0,-1)))`, `d_right = dot(rel, rotate(q, (1,0,0)))`, `d_up = dot(rel, rotate(q, (0,1,0)))`; compose attitude exactly as the player does (`mul(mul(q, roll(-flightRoll*dt)), pitch(+flightPitch*dt))`); add a sign-pinned test that a positive `flightRoll`/`flightPitch` rotates the nose the same way the player's positive input does, and a steering test that a target on the right produces the stick that turns the nose toward it. Note this resolves handedness by test, not by derivation; the oracle author must state the expected rotation direction from Oolite's own player path (`PlayerEntity.m:3408`, which calls the same `applyRoll:andClimb:` form).
**Warning signs:** ships orbit or spiral away; a mirrored scene passes a test that only checks distance.

### Pitfall 2: Frame-rate-dependent constants silently re-tune the steering
See the Frame-Rate Rule. Do not convert `delta_t`-proportional terms; do convert whole-time compares to ticks with one rounding rule. Add one oracle that runs `trackDestination` over a grid of relative positions at `dt = 1/60` and `1/120` and compares stick outputs (PITFALLS 6 prescribes this).

### Pitfall 3: Non-deterministic or sample-dependent setup draws
**What goes wrong:** `accuracy`, `hasFuelInjection` (Krait `0.65`) and `entity_personality` are drawn from Oolite's global `randf()` at spawn.
**How to avoid:** resolve `accuracy` lazily on the first steered update from `entity.rng.combat` (Oolite's own out-of-range default `-100` is the natural "unresolved" sentinel, `ShipEntity.m:665-672`), negate for `CLASS_POLICE`/`CLASS_MILITARY`; do not add a draw to `populateInertWorld` (it would move the world stream and every golden position). Record as a divergence (Oolite draws from the global stream). `behaviour_fly_to_target_six` uses `[self universalID] & 14` (`4523`): Wegolite ids are 101-based and monotonic, so the same expression gives a different but deterministic per-ship result; record it.

### Pitfall 4: NaN and degenerate geometry in steering (PITFALLS 4)
`vector_normal` of a zero vector, `sqrt` of a negative, division by `delta_t` or `range2`. Oolite guards some (`trackDestination` sets `relPos.z = 1.0` when `relPos` is zero, `9493-9496`). Port each guard literally, add guards where Oolite has none (`sqrt(1 - precision * desired_range2 / range2)` when `range2 < desired_range2` is not reached because of the `if`, but clamp `d_forward` into `[-1, 1]` before any `acos`-like use; prefer dot comparisons). Extend `sanitizeEntity` to repair the new record and count repairs; the acceptance run asserts `repairs === 0`. A repaired ship is a bug to fix, not a pass.

### Pitfall 5: Behaviour changes inside the update phase vs the AI seam
`attack`, `avoidCollision`, `noteLostTargetAndGoIdle`, `face -> idle` rewrite `behaviour` natively. That is native steering state, not an AI write, so it happens inside the update phase on `entity.nav.behaviour` and must be hashed. AI think still sees the new behaviour through `ShipView.behaviour`. Events that Oolite sends to the AI synchronously (`TARGET_LOST`, `DESIRED_RANGE_ACHIEVED`, `FACING_DESTINATION`, `REACHED_SAFETY`, `FRUSTRATED`) become queued AI events. `AI_EVENT_NAMES` has `shipTargetLost` and `shipAchievedDesiredRange` but not the facing, safety or frustration events [VERIFIED: src/sim/ai/types.ts:55-77]; adding names is additive and `isWellFormedAiEvent` validates against the list.

### Pitfall 6: Tunnelling cannot be prevented, only detected
Collisions are unscheduled and hull-against-hull queries do not exist (ROADMAP Phase 13 "implied work"). The acceptance criterion "no tunnelling through a hull or the station" is therefore a detector, not a collision response: a ship's origin path must not cross another ship's octree hull or enter the station's collision sphere. The Coriolis has no octree in the hull artifact (`ships-hulls.json` holds the Cobra and the nine NPC hulls, collision radii: cobra3-player 72.7, adder 29.0, cobramk1 39.3, gecko 31.9, krait 50.2, mamba 44.4, moray 36.2, shuttle 22.8, sidewinder 37.5, viper 35.1 [VERIFIED: ships-hulls.json read this session]); use the layout station radius (`STATION_RADIUS = 500`, `src/sim/world/layout.ts:70-72`). `avoid_collision` only reacts to ships with mass >= 2000 and a crew (assume crewed for the nine) and never to the planet or sun (not ships, `CollisionRegion.m:308`).

### Pitfall 7: Player as a steering target
Behaviours read `[target primaryTarget] == self`, `[target behaviour]` and `[target weaponTypeForFacing:]` (`4658, 4669, 4724-4725`). For the player these are ident-lock and combat state. With accuracy below 9 for the nine, the `weaponTypeForFacing` reads are unreachable; for `primaryTarget == self` recommend "the player never targets an NPC" for the gate and record it, rather than wiring the Phase 13 ident target into the steering host.

### Pitfall 8: Tests pinned to the placeholder integrator
The Phase 8 constant-speed mover moves an entity instantly at `desiredSpeed`. After this phase a test pilot accelerates at `5 * thrust`. Tests that assume instant speed or fixed positions need review: `tests/sim/ai/test-pilot.test.ts`, `tests/sim/world/step.test.ts`, `tests/sim/world/world-cadence.test.ts`, `tests/sim/world/snapshot-codec.test.ts`, `tests/sim/world/snapshot.test.ts`, `tests/sim/world/sanitize.test.ts`, `tests/sim/combat/npc-fire.test.ts`, `tests/app/session/world-lifecycle.test.ts`, `tests/app/tracer.test.ts` (grep for `createTestPilotAi` and `desiredSpeed`). A ship with `ai === null` must keep holding its placement (Phase 12 D-02).

### Pitfall 9: The `dist` check runs in the wrong place
`verify` runs `lint`, `typecheck`, `assets:check`, `test`, then `build:e2e` (`compose.yaml`); `tests/compliance.test.ts` states a `dist/` read in Vitest "would fail" because `test` precedes `build`. A Vitest test with `skipIf(!existsSync("dist"))` would be vacuous in `verify`. Put the check after the build (see Validation Architecture) and give it a non-vacuity test.

### Pitfall 10: Spike assets needing the checkout on a machine without one
The remote test machine syncs only the committed HEAD (`git archive`); it has no `/home/opencode/git/oolite`. Spike tests must `skipIf(OOLITE_SRC === "")` (as `fidelity.test.ts:287-288` does for the verbatim excerpts) and the report must embed the transcript of a run made where the checkout exists.

## Code Examples

### The update-phase hook that replaces the placeholder
```typescript
// Source: src/sim/world/step.ts:88-103 (placeholder, to be replaced) and ShipEntity.m:2485-2638
// Before: entity.speed = Math.max(0, entity.nav.desiredSpeed); entity.position += forward * speed * dt
// After (sketch; names are the plan's to finalise):
for (let i = 0; i < n; i += 1) {
  const entity = world.store.live[i];
  if (entity === undefined || entity.dead || entity.ai === null) continue;
  steerShip(entity, host, flight.statsFor(entity.specKey), dt, postAiEvent);
}
```

### An oracle fixture shape (independent of the port)
```typescript
// Source: this research (Pattern 6); the citations below were read this session
interface OracleFixture {
  readonly id: string;                       // "apply-sticks-roll-ramp"
  readonly oolite: readonly string[];        // ["src/Core/Entities/ShipEntity.m:7018-7065"]
  readonly stats: { maxFlightRoll: number; maxFlightPitch: number; thrust: number; maxFlightSpeed: number };
  readonly initial: { /* synthetic self and target poses, accuracy fixed */ };
  readonly dt: number;                       // 1/120 and, for the rule fixture, 1/60
  readonly checks: readonly {                // tick horizons and tolerances stated in the fixture
    readonly tick: number;
    readonly field: "flightRoll" | "flightSpeed" | "headingError" | "range" | "behaviour";
    readonly expected: number | string;
    readonly tolerance: number;
  }[];
}
```

### Node vm loader (spike)
```typescript
// Source: Node vm API [CITED: nodejs.org/docs/latest-v24.x/api/vm.html]; library shape read in
// Resources/Scripts/oolite-priorityai.js:1-66 and Resources/AIs/oolite-shuttleAI.js:28-32
import { createContext, runInContext } from "node:vm";
const sandbox: Record<string, unknown> = { clock, system, player, log, Timer, Vector3D, worldScripts, oolite };
createContext(sandbox);
runInContext(libSource, sandbox, { filename: "oolite-priorityai.js", timeout: 1000 });
// top-level `this.PriorityAIController = ...` is now sandbox.PriorityAIController
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Constant-speed placeholder mover for AI entities | Oolite sticks, attitude and thrust ramp | this phase | existing AI-entity tests re-pin; inert ships unchanged |
| Hash segment per new field regenerates the inert golden | same, proven by strip-and-rehash | Phase 13 plan 13-07 | repeat the pattern once |
| Hand-written steering with eyeballed tuning | ledger with Oolite lines, independent oracles | PITFALLS 6 | the point of the gate |

**Deprecated or out of scope now:** the Phase 8 "desired speed along the nose" integrator (replaced); Oolite's `OO_VARIABLE_TORUS_SPEED` injector paths (afterburner is a scope cut, see Open Questions).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Afterburner (injector), missile firing, cloaking and turret paths can be a recorded scope cut (`canBurn = false`, `missiles = 0`) because no consumer exists in v2.2 | Oolite Source Map, Open Questions | Krait (0.65 `has_fuel_injection`) and Viper/Adder/Moray (`missiles`) would fly slightly differently than Oolite |
| A2 | "Crewed" is true for all nine, so `setProximityAlert` is not skipped by `!crew` (`ShipEntity.m:6113`) | Source Map | Avoid-collision would never fire for a ship Oolite considers uncrewed |
| A3 | Recommended acceptance thresholds (below) are sensible; the plan fixes the numbers before the run and the owner may revise | Validation Architecture | A threshold too tight fails a faithful port; too loose makes the gate meaningless |
| A4 | Reading AILib from an `OOLITE_SRC` mount (skip when absent) is acceptable for the spike | Harness spike | If the owner wants the spike to run on the remote machine or in CI, `Scripts/*.js` must be vendored (network at the pinned commit via `scripts/vendor-oolite.sh`) |
| A5 | The 120 Hz tick vs 60 Hz Oolite reference rate needs no behavioural conversion beyond the table above | Frame-Rate Rule | The oracle may show ringing at 1/120 s in `trackDestination`; then one site becomes a recorded divergence |
| A6 | Float64 simulation with float32-emulated oracle references is an acceptable fidelity target for `max_cos >= 0.99999` style thresholds | Pitfalls, Pattern 6 | A grazing threshold may flip in a few ticks; tolerances must be set from the measured difference |
| A7 | Leaving NPC render poses un-interpolated (latest tick pose) is acceptable for WORLD-07 | Validation | Visible stepping at 144 Hz displays; interpolation would need previous-tick pose state |
| A8 | The existing probe-shape pin covers hook members, so a new hook member needs a fixture update (`tests/fixtures/probe-shape.json` lists `test.spawnTestShooter: "function"`) | Test hook | A missed fixture update fails `probe-shape-compare` |

## Open Questions (RESOLVED)

Every question below is settled by the phase plans (plan numbers as of plan-check revision 1); each carries a RESOLVED line naming the plan that settles it.

1. **Frame-rate rule scope (owner awareness).**
   - Known: the audit table above; Oolite's reference frame is variable and typically about 1/60 s.
   - Unclear: whether the `delta_t` overshoot limiters ring at 1/120 s.
   - Recommendation: adopt the rule text in the Frame-Rate Rule section, let the oracle's 1/60 vs 1/120 grid decide per site, and record any site that needs a divergence as a PROJECT.md row (FIDELITY divergences must quote one).
   - RESOLVED: plan 14-06 (oracle, wave 2) writes `tests/oracles/npc/frame-rate-rule.json` with the rule text, a cross-step tolerance stated before any rate fixture is replayed, one row per site and a measured-difference row for any divergence, plus the 1/60 versus 1/120 grid; plan 14-10 checks the port against that grid; plan 14-19 carries every divergence site into the grouped Key Decisions row and FIDELITY.
2. **Acceptance thresholds (must be committed before the run).**
   - Recommendation to put in the plan: 20 seeds are epochs `1..20` of the Lave world (`worldSeedFor(marketSeedForSystem("g0-s7"), epoch)`); each run populates the 12 inert ships and converts them to scripted flyers; horizon 18,000 ticks (150 simulated seconds), checked every tick. **No stuck ship:** no flyer with `desiredSpeed > 0` and an active move behaviour fails to improve its goal metric (range to destination, range to target for intercept, retreat range for flee) by at least 1 % of its starting value over any 3,600-tick (30 s) window, and no `noteFrustration` event (Oolite's own 15 s counter) fires in a scripted scenario that has open space. **No tunnelling:** zero tick segments of any ship's origin that hit another ship's octree hull (two-stage `firstShipHit` rule) or enter the 500 m station sphere, with the player parked outside both. **No NaN repair:** the sum of `entity.repairs` is 0, `aiFaulted` events 0, `aiDropped` 0, and every `hashWorld` call returns without throwing. Store the numbers in `tests/acceptance/thresholds.ts` in the commit that precedes the first run, and forbid edits in the run commit.
   - RESOLVED: plan 14-07 (wave 2, before any steering code) commits the thresholds, their metric and window definitions, the script mapping, the player parking rule and the hull-crossing classes with their pre-declared resolution in `tests/acceptance/thresholds.ts`; plan 14-17 runs the 20 seeds against them with detectors frozen first.
3. **Where the original JS comes from for AI-11.**
   - Recommendation: `OOLITE_SRC` bind mount for the spike plus a recorded transcript, and put "vendor `Scripts/*.js` or keep the mount" as an explicit owner decision at the gate, because the later differential harness (AI-07) has to run in CI. Vendoring conflicts with the AGENTS.md no-network rule for agents, so it needs a human-run `scripts/vendor-oolite.sh` bump.
   - RESOLVED: plan 14-04 reads the scripts through the `OOLITE_SRC` mount and records a transcript in 14-SPIKE.md; the mount-or-vendoring choice is an owner question at the plan 14-19 checkpoint.
4. **Spike time box and stub-host scope.**
   - Recommendation: one plan, about one working day, scope: load `oolite-priorityai.js` and one short role AI (`oolite-shuttleAI.js`, 99 lines), construct `PriorityAIController`, run `aiStarted`, three scripted world fixtures (calm, hostile in scanner, reconsider timing), record the ordered `perform*` calls and parameter writes with `Math.random` replaced by a scripted sequence, run twice and assert identical traces. Measure and report which host members were touched (the library uses `clock.adjustedSeconds` 14 times, `system.sun`/`mainPlanet`/`mainStation`/`info`/`stations`, `player.*`, and about 50 distinct `this.ship.*` members of which `performFlyToRangeFromDestination`, `performAttack`, `performFlee`, `performIdle` map straight onto the native behaviours). The outcome is a feasibility statement and a stub size, not a port.
   - RESOLVED: plan 14-04 is that spike, with this scope and an isolation guard, and writes 14-SPIKE.md.
5. **Escort representation.** Recommend the existing `ownerId` as leader plus one new integer slot, set at spawn; the leader's update writes follower destinations (as `ShipEntity.m:2430-2437`). The `ShipControl` seam gains nothing.
   - RESOLVED: `ownerId` as leader plus a fixed `escortSlot`, as recommended: the leader-refresh rule is contract item 4 (b) of plan 14-01, the escort fixtures are authored in plan 14-06, the slot field is part of the steering record of plan 14-08, and the world-step leader refresh is plan 14-15; `ShipControl` gains nothing.
6. **Scope cuts to record as Key Decisions:** afterburner and `has_fuel_injection`, missiles (`considerFiringMissile`), cloaking, turret and broadside and running-defense branches, `fireMainWeapon` (steering never fires; weapon temperature is a constant 0), Newtonian `velocity` (tumbling pods drifting), `universalID`-based decisions, "player never targets an NPC".
   - RESOLVED: plan 14-19 records them in the grouped Key Decisions row "Phase 14 NPC steering scope".
7. **Folding IN-02 and IN-04.** Neither is needed by the acceptance run (the harness reads events directly); leave to the owner.
   - RESOLVED: not folded in; the plan 14-19 owner checkpoint asks, and a request to fold either in becomes a follow-up quick task.
8. **Hash policy:** append-and-regenerate once (recommended, Phase 13 precedent) versus omit-when-pristine (keeps the inert golden untouched but adds a state-dependent branch to the hash text).
   - RESOLVED: the owner decides at the blocking checkpoint of plan 14-08 before the seam is built, and the same plan records the answer in PROJECT.md.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Docker | every test and build | yes (dev machine) | 29.8.2, Compose 5.6.0 | none (AGENTS.md) |
| Node in the image | spike, tests | yes (image `node:24-bookworm-slim` per PROJECT.md); host Node v26.10.0 is not authoritative | 24.x in image | none |
| Oolite checkout `/home/opencode/git/oolite` | reading source, spike inputs (`Resources/Scripts/oolite-priorityai.js`, `Resources/AIs/*.js`) | yes on the dev machine; NO on the remote test machine | commit `4bb1f53` HEAD, the diffed source files identical to `7437f22` | `OOLITE_SRC`-gated skip; recorded transcript in the report |
| Remote test machine `opencode@192.168.178.51` | `verify`, `verify-full`, browser specs | yes (owner memory) | Docker 29.9.3 | none; local Docker stays authoritative |
| Vendored `Scripts/*.js` | CI-runnable spike | NO (`third_party/oolite/` holds Config, Models, Textures only) | - | vendoring bump by the owner (A4) |

**Missing dependencies with no fallback:** none for the sim work.
**Missing dependencies with fallback:** the AILib source on the remote machine (skip plus transcript).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.5 (`unit` project: `src/**`, `tests/**`, `tools/**` `*.test.ts`), fast-check 4.10.2, Playwright 1.64.1 [VERIFIED: package.json, vitest.config.ts] |
| Config file | `vitest.config.ts` (coverage floors for `src/sim/**` lines 93, statements 91, functions 97, branches 86; `src/persistence/**`; `src/content/**`) |
| Quick run command | `docker compose run --rm test npx vitest run <file>` |
| Full suite command | `docker compose run --rm test` (then `lint`, `typecheck`, `assets:check` for content; `verify` once for the browser-facing hook and spec work; `verify-full` only on owner confirmation) |

New `src/sim/npc/**` code is under the `src/sim/**` coverage floors: the oracle and unit suites must keep them green (a branch-heavy port with unreachable accuracy branches will need table tests that force `accuracy`).

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AI-01 | flight primitives exact: `applySticks` ramp and reversal x4, attitude step, thrust ramp, no overshoot of desired speed, tumble holds position | oracle (closed form) | `docker compose run --rm test npx vitest run tests/oracles/npc/flight.oracle.test.ts` | Wave 0 |
| AI-01 | each of idle, tumble, fly-to-destination, face, intercept, attack(+in-scope subs), flee, escort, avoid-collision against its fixtures | oracle (trace, tolerance, horizons) | `... tests/oracles/npc/behaviours.oracle.test.ts` | Wave 0 |
| AI-01 | `trackDestination` grid at dt 1/60 vs 1/120 | oracle | `... tests/oracles/npc/rate-rule.oracle.test.ts` | Wave 0 |
| AI-01 | attack dispatcher decisions by accuracy tier (forced accuracy 6, 9) and by weapon readiness | table test | `... tests/sim/npc/attack-dispatch.test.ts` | Wave 0 |
| AI-01 | finite state under fast-check inputs; unit quaternion; speed in `[0, maxFlightSpeed]`; repairs 0 | property | `... tests/sim/npc/steering.property.test.ts` | Wave 0 |
| AI-01 | stats compile: four flight fields for nine ships, absent `accuracy`/`reaction_time`/`scanner_range` pinned | content + drift | `docker compose run --rm test npx vitest run tests/content/ships-npc.test.ts` and `docker compose run --rm assets npm run assets:check` | extend |
| AI-01 | hash, sanitise, snapshot v3 for the flight record; live equals restored over 1,000 ticks; strip-and-rehash proves population draws unchanged | unit/scenario | `... tests/sim/world/sanitize.test.ts tests/sim/world/snapshot-codec.test.ts tests/sim/world/snapshot.test.ts tests/sim/world/populate.test.ts` | extend |
| AI-01 | `ShipControl`/`WorldView` member pins updated deliberately (`radius`), `perform` of out-of-scope ids degrades safely | unit | `... tests/sim/world/control.test.ts tests/sim/world/view.test.ts` | extend |
| AI-01 | oracle independence: no `src/` imports in `tests/oracles/**` | guard | `... tests/guards/oracle-independence.test.ts` | Wave 0 |
| AI-01 | acceptance run: 20 seeds, thresholds file committed before | scenario | `... tests/acceptance/npc-flight.acceptance.test.ts` (per-test timeout set explicitly) | Wave 0 |
| WORLD-07 | traffic-on scripted flyers: station, intercept, flee; contacts move; draw calls at most 50 | opt-in e2e smoke | `docker compose run --rm e2e sh -lc "npm run build:e2e && npx playwright test tests/e2e/npc-flight.spec.ts"` (remote) | Wave 0 |
| WORLD-07 | replay hash identical at 30, 60, 144 Hz with flyers active, across a launch | cadence | `... tests/sim/world/world-cadence.test.ts` (extend) or `tests/sim/npc/npc-cadence.test.ts` | extend or Wave 0 |
| WORLD-07 | hook member pinned in the probe shape | unit | `... tests/app/probe-shape-compare.test.ts tests/app/session/probe-publisher.test.ts` | extend |
| AI-11 | stub host and loader run the library in `vm`; trace deterministic across two runs; RNG consumption counted | spike test, `skipIf(OOLITE_SRC === "")` | `docker compose run --rm -v /home/opencode/git/oolite:/oolite:ro -e OOLITE_SRC=/oolite test npx vitest run tools/ai-harness` | Wave 0 |
| AI-11 | checker unit test with a fixture `dist` that contains a marker (fails) and a clean one (passes) | unit | `... tools/ai-harness/dist-check.test.ts` | Wave 0 |
| AI-11 | `dist` is free of `oolite-priorityai`, `PriorityAIController`, `oolite-libPriorityAI` and harness file names after the build | post-build step | `npm run build:e2e && npm run check:dist` in the `verify` and `verify-full` chains | Wave 0 (needs `compose.yaml` and `package.json` edits) |
| AI-11 | no `src/**` or `public/**` file imports or contains harness paths | guard | `... tests/guards/harness-isolation.test.ts` | Wave 0 |

### Sampling Rate
- **Per task commit:** targeted `vitest run` of touched files plus `lint` and `typecheck` for pure `src/sim` and `tools` work (owner gate policy).
- **Per wave merge:** `docker compose run --rm test` (coverage floors apply), `lint`, `typecheck`, `assets:check` when content changed.
- **Phase gate:** `verify` once on the remote machine for the hook and browser spec; `verify-full` only if the owner confirms. Full suite green before `/gsd-verify-work`.

**Oracle sampling (Nyquist for the control loop).** Each behaviour fixture samples at least two points per characteristic time of the loop it checks and always at the horizon: the stick ramp time is `maxFlightRoll / (2)` seconds (rate `2*dt` per tick on the roll axis), so a Viper (`max_flight_roll 2.8`) reaches full roll in 1.4 s = 168 ticks; sample the ramp at ticks 1, 2, 4, 8, 21, 42, 84, 168, 336. The speed ramp time constant is `maxFlightSpeed / (5 * thrust)` seconds (Viper `320 / 160 = 2 s`, 240 ticks); sample at 15, 30, 60, 120, 240, 480. The tracking-curve gate is 60 ticks; sample around 59, 60, 61, 120. The think interval is 15 ticks; scenario horizons are multiples of it. State the tolerance next to each sample, derived from the oracle's own float32-versus-float64 measurement plus a margin; never copy a tolerance from the port's output.

### Wave 0 Gaps
- [ ] `tests/oracles/npc/{schema.ts, fixtures/*.json, reference/*.ts, *.oracle.test.ts}`: authored by the separate agent, first wave, no `src/sim/npc` access
- [ ] `tests/guards/oracle-independence.test.ts`, `tests/guards/harness-isolation.test.ts`
- [ ] `tests/acceptance/thresholds.ts` committed before `npc-flight.acceptance.test.ts` is run
- [ ] `tools/ai-harness/{load,host,dist-check}.ts` plus tests, `scripts/` or `package.json` entry `check:dist`, chain edit in `compose.yaml` (`verify`, `verify-full`) and the CI workflow
- [ ] `tests/e2e/npc-flight.spec.ts` (opt-in), `tests/fixtures/probe-shape.json` hook member row
- [ ] Re-pin: `tests/golden/world/inert-lave-epoch1.json` (once), `tests/sim/world/control.test.ts`, `view.test.ts`, the Phase 8 tests listed in Pitfall 8, `tests/contract/fidelity.test.ts` inputs (new FIDELITY rows with verbatim excerpts at `7437f22`)
- [ ] Framework install: none

## Security Domain

`security_enforcement` is on (ASVS level 1, block on high; `.planning/config.json`).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | no accounts |
| V3 Session Management | no | static client |
| V4 Access Control | partial | `ShipControl` methods act only on the actor id (`control-impl.ts:53-55`); the hook and any test seam stay behind `?test=1` and taint the session so no autosave can make a mutation durable |
| V5 Input Validation | yes | `ShipControl` arguments are range-checked against the shared domain (`limits.ts`, `isBounded`), `perform` membership by `includes`, closed event and AI-key vocabularies, strict-key snapshot parser for the new record, zod strict schema for the new ship fields and the oracle fixtures, bounded loops (proximity pass at most `MAX_ENTITIES`) |
| V6 Cryptography | no | none; hashes are fnv32 integrity fingerprints, not security |
| V12 Files and Resources | partial | the spike reads files named by an operator-supplied `OOLITE_SRC` env var, never a URL or request; read-only mount; `vm` runs trusted vendored GPL code with `timeout` |
| V14 Configuration | yes | `dist` must not contain Oolite AILib or the harness (post-build check), `public/` must not hold them, harness code is outside `src/` |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Hostile or corrupt snapshot with out-of-domain steering state (NaN, huge magnitudes, forged ids) | Tampering | extend `parseWorldSnapshot` strict keys and the limits in `limits.ts`; `sanitizeEntity` repairs before every hash; any limit change is a snapshot-format bump |
| AI module throws or loops inside the fixed step | Denial of service | existing `invoke` containment (FOUND-15) covers AI modules only; native steering has no try/catch by design (`step.ts:21-26`), so steering must be total (no throws on any finite state) and property-tested |
| Per-tick cost growth with entity count | Denial of service | proximity pass bounded by `MAX_ENTITIES = 256`; no allocation beyond the view copies; acceptance run measures tick counts, not milliseconds |
| Oolite JS or harness leaks into the shipped bundle | Information disclosure / licence | `dist` absence check with a non-vacuity test; harness under `tools/`; no `public/` placement |
| Path injection through `OOLITE_SRC` | Tampering | the variable is an operator-set directory used only as a read-only root; build file names from a fixed list, never from fixture or network data |
| Untrusted `vm` code escaping the sandbox | Elevation of privilege | not applicable to untrusted input here (the code is the pinned vendored source); `vm` is documented as not a security boundary, so never feed it anything but the named files |

## Sources

### Primary (HIGH confidence)
- Oolite source at the pinned commit `7437f22`, read in the checkout `/home/opencode/git/oolite` (files confirmed identical to the pinned tree by an empty `git diff --stat 7437f22 HEAD` over `ShipEntity.m`, `ShipEntity.h`, `ShipEntityAI.m`, `Entity.m`, `Universe.m`, `Universe.h`, `CollisionRegion.m`, `GameController.m/.h`, `OOQuaternion.m/.h`, `shipdata.plist`, `Resources/Scripts`, `Resources/AIs`): `ShipEntity.m` 240-310, 655-722, 1120-1143, 2083-2638, 3690-5173, 5330-5489, 5808-5958, 6085-6146, 7018-7065, 7375-7429, 8540-8830, 8980-9244, 9440-9591, 9700-9849, 11895-12040; `ShipEntityAI.m` 400-480; `Entity.m` 796-880; `Universe.m` 6415-6735; `CollisionRegion.m` 230-374; `GameController.m` 325-375; `ShipEntity.h` 40-150; `Universe.h` 96-103; `OOQuaternion.m` 25-360; `Resources/Scripts/oolite-priorityai.js` 1-135; `Resources/AIs/oolite-shuttleAI.js` 28-75; `Resources/Scripts/oolite-global-prefix.js` 170-195.
- Repo files read this session: `src/sim/world/{step,world,entity,ids,control,control-impl,view,view-impl,populate,serialize,snapshot,limits,ship-field,contacts,layout}.ts`, `src/sim/ai/{types,registry,time,test-spawn}.ts`, `src/sim/ai/pilots/test-pilot.ts`, `src/sim/{sim,step,rng}.ts`, `src/sim/combat/{octree,hit,aim,constants}.ts`, `src/sim/flight/attitude.ts`, `src/content/schemas/{ship-npc,ship-hull}.ts`, `src/render/bodies/npc-ships.ts`, `src/app/session/{probe-publisher,step-options}.ts`, `tests/sim/world/world-cadence.test.ts`, `tests/helpers/{traffic-fixture,tick-script,hull-table}.ts`, `tests/contract/fidelity.test.ts`, `compose.yaml`, `package.json`, `vitest.config.ts`, `eslint.config.js`, `third_party/oolite/{pin.json,SOURCE.md}`, `third_party/oolite/Config/shipdata.plist` (Viper block read; other blocks by line-numbered extraction), `.planning/{ROADMAP,REQUIREMENTS,STATE,PROJECT}.md`, `.planning/research/PITFALLS.md`, `.planning/phases/13-views-lasers-and-shields/{13-07-SUMMARY,13-RESEARCH}.md`.
- Context7 `/websites/nodejs_latest-v24_x_api` (Node v24 `vm`): `createContext`, `runInContext`, `timeout`, `microtaskMode`.

### Secondary (MEDIUM confidence)
- `.planning/milestones/v2.0-ROADMAP.md` Phase 14 section and review notes (oracle independence wording).

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH, nothing new is added and every pinned version was read.
- Architecture (seams, state record, options table, hash policy): HIGH for the seams (read directly), MEDIUM for the exact field list, which the porter finalises behaviour by behaviour.
- Oolite source map and reachability: HIGH for the cited lines and constants; MEDIUM for the reachability conclusions, which depend on the nine records' absence of `accuracy` and extra weapon mounts (assert them in the drift gate).
- Frame-rate rule: MEDIUM, a reasoned audit that the oracle must confirm.
- Acceptance thresholds, spike scope, scope cuts: LOW-MEDIUM, recommendations flagged for the plan and the owner.
- Pitfalls: HIGH where tied to a read file; the frame-mapping handedness is resolved by test, not derivation.

**Research date:** 2026-11-15
**Valid until:** 30 days (the pinned Oolite commit and the repo move slowly; re-check `git diff` of the cited Oolite files only if the pin is bumped)
