# Pitfalls Research — Milestone v2.0 Foundation & Combat

**Domain:** Adding a multi-entity world, hand-ported Oolite priority AI and traffic, combat, death/insurance, planet/sun collisions and Web Audio to an existing deterministic, golden-hashed, Docker-tested browser port of Oolite (TypeScript, Three.js, IndexedDB saves).
**Researched:** 2026-11-11
**Confidence:** HIGH for facts read from this repository and the Oolite checkout (cited by file and line or by count); MEDIUM for browser audio behaviour and performance projections (not measured here); LOW only where flagged.

> Scope: this file replaces the v1 pitfalls file (which assumed no combat, NPCs or audio; its licensing and data-fidelity findings still hold and remain in git history). It covers only the mistakes specific to *adding* the v2.0 features to the system as it stands. Every pitfall names the phase that should prevent it.
>
> Oolite reference: `/home/opencode/git/oolite` (never the network). Wegolite facts were checked against the tree at commit `3c6c2ef`.

## Phase key used in this file

The roadmap does not exist yet. These labels are a *proposed* decomposition so every pitfall can point at a phase; the roadmapper may rename or merge them, but the ordering constraints in "Phase-Specific Warnings" should survive.

| Label | Scope |
|-------|-------|
| **P-A Foundation** | Split `game-session.ts`; entity world model (ids, broadphase, serialisation, hashing); `ShipControl`/`WorldView`; PRNG and clock contracts; test-runtime strategy |
| **P-B AI core** | `PriorityAIController` port, native `BEHAVIOUR_*` steering, plist `nullAI`/`dumbAI`, scanner |
| **P-C Roles and traffic** | Role AIs, populator, station launch/dock queue, NPC models and assets |
| **P-D Combat** | Lasers, shields, energy, missiles, ECM, damage, wreckage, pods, scooping |
| **P-E Death and law** | Bounty, legal status, police response, escape pod, insurance, save v3 |
| **P-F Collisions** | Planet, sun, buoys, cabin and hull temperature |
| **P-G Audio** | Web Audio, `customsounds.plist`, music |
| **P-H Hardening** | QUAL-01 on real hardware, performance, test budget, release gates |

---

## Critical Pitfalls

### Pitfall 1: Iteration order silently differs between the live world and a restored or replayed world

**What goes wrong:**
Two runs of the "same" simulation diverge because a `Map`/`Set`/object is iterated in a different order, or because ids are reused. Typical forms: the live world iterates in spawn order (with holes from deletions) while a world rebuilt from a save iterates in serialised order; a `Record` keyed by numeric-looking ids iterates ascending (integer keys are sorted by the engine) but string ids iterate in insertion order; a free-list reuses an id so id order no longer equals age order; `Array.sort` without a total-order comparator is used on distances (ties between ships at equal range); collision pairs come out of a spatial hash in bucket order.

**Why it happens:**
v1 had one entity, so no code path ever depended on order. `src/sim/**` has ESLint rules against `Math.random`, `Date` and `performance.now`, but nothing against order-dependent constructs. Oolite itself is order-dependent in ways that are *not* reproducible: scan results come out in z-list order (`ShipEntity.m` `checkScanner`, walking `z_previous` then `z_next`, capped by `MAX_SCAN_NUMBER 32`), and the update loop walks `entities` with a mid-loop bubble sort by `zero_distance` (`Universe.m` ~6540-6590). A literal port inherits an order that depends on the player's position.

**How to avoid:**
- Define one canonical order and write it in the world model's header comment: **ascending entity id**. Ids are monotonic integers from a persisted `nextId`, **never reused**, never derived from an array index.
- Store entities in a dense array plus an `id -> index` lookup, or a `Map<number, Entity>` whose insertion order is ascending by construction (spawn always appends the next id). Serialise in ascending id; on restore rebuild in that order. Add a unit test: *a live world after N spawns and M deaths* and *a world restored from its own serialisation* must produce the same per-tick hash for 1,000 ticks.
- Every query that returns "several entities" (`scan`, `shipsWithRole`, broadphase pairs, nearest-X) returns them sorted by `(distanceSquared, id)` or by `id`; ties are broken by id, never by engine order. Never call `.sort()` without a comparator. Never iterate `Object.keys`/`for..in` over data that can come from JSON.
- Add ESLint `no-restricted-syntax` rules for `ForInStatement` and for zero-argument `.sort()` inside `src/sim/**` (the `tests/guards/` tests already prove zone rules with probe files; add two probes).
- Deaths are *marked* during a tick and *swept* at the end of the tick in id order (Oolite does the same with `entitiesDeadThisUpdate`). Never delete from the collection being iterated.
- Record the deviation from Oolite's order once in `PROJECT.md` Key Decisions, like the fixed 1/120 s step.

**Warning signs:**
- A hash test passes on a fresh run but fails after save/restore or after the world "warms up".
- A golden changes when one NPC is added *later* in the list.
- A fix that "sorts to make it stable" in one query and not in the others.

**Phase to address:** P-A Foundation (contract and lint rules); re-verified in P-B and P-C when scanning and populating arrive.

---

### Pitfall 2: PRNG call-order shifts, and RNG state that cannot be hashed or saved

**What goes wrong:**
Adding one ship, one damage roll or one wreckage spawn changes every later random number in the world, so every golden hash and every "same seed, same fight" expectation breaks. Worse, `createSeededRandom` (`src/sim/math.ts`) returns a closure: its 32-bit state is invisible, so it can be neither hashed nor serialised. A world hash that omits RNG state lets two diverged worlds hash equal until the divergence surfaces much later.

**Why it happens:**
Oolite draws from global, unseeded streams: `Math.random()` in JS (counts in the reference: 36 in `oolite-priorityai.js`, 95 in `oolite-populator.js`, 4 across the role AIs) and `randf()`/`ranrot_rand()` in `ShipEntity.m` (about 78 call sites). Destruction alone draws a data-dependent number of values: wreck counts `randf() * (n_alloys + 2)`, per-wreck velocities, lifetimes `750 * randf() + 250 * i + 100`, `ranrot_rand() % 7` jitter (`ShipEntity.m` 8013-8099). With one shared stream the draw count depends on branch history. Even `checkScannerWithPredicate` (`oolite-priorityai.js:705`) draws a number per scan only to pick a start offset, so *how often AIs scan* shifts everyone else's randomness.

**How to avoid:**
- Replace the closure with an explicit state object (`{ state: uint32 }`) and pure functions, so state is hashed and serialised. Keep `createSeededRandom` for render-only uses (starfield, nebulae, break pattern) untouched.
- **Fork streams, do not share one.** Each entity owns a stream seeded from `hash32(worldSeed, entityId, "ai")`; damage and accuracy draws use `hash32(worldSeed, entityId, "dmg")`; the populator uses `hash32(worldSeed, systemId, arrivalCount)`; destruction and wreckage use a stream keyed by the dying entity's id. Spawning ship N+1, or a ship dying, can then never shift anyone else's numbers, and a ship's behaviour is reproducible in isolation (unit-testable without the world).
- Do not try to reproduce RANROT sequences for combat (the market does, `src/sim/economy/ranrot.ts`, because prices are seed-defined; combat is not).
- Roll at the same *logical* point every time: when the decision is made, not lazily inside a cached or conditional path.
- Extend the `src/sim/**` Math.random ban explicitly to the new AI/world directories (add a guard probe for `src/sim/ai/`).
- Include every stream's `state` in the world serialisation and the hash.

**Warning signs:**
- A golden changes when the populator adds a bystander far from the action.
- Two fights with the same seed differ after one ship was added.
- Code reaches for `Math.random()` "temporarily" while porting a function that has it in Oolite.

**Phase to address:** P-A Foundation (RNG object, fork scheme, hash); enforced in every later phase.

---

### Pitfall 3: Time bases, float accumulation and time-sliced AI

**What goes wrong:**
(a) AI timers keyed to the player's *game clock* fire in bursts: `FlightState.clockSeconds` jumps by 600 s at launch and by hours at hyperspace arrival, so a timer written as `clock + 60` expires at once, caches clear, distress and wormhole expiries trip. (b) Timers decremented by `dt` accumulate float error and drift against tick counts. (c) "Spreading the AI cost" by thinking every N-th frame or by wall clock reintroduces frame-rate dependence and breaks the 30/60/120/144 Hz cross-cadence hash test. (d) Sound or render code reads sim time and feeds something back.

**Why it happens:**
Oolite's AI uses `clock.adjustedSeconds` (the player clock) for `__ltcachestart`, `AIScriptWakeTime`, distress timestamps and wormhole expiry (`oolite-priorityai.js` 205-208, 234, 348-393, 2015). Oolite's `delta_t` is variable (capped only at `MINIMUM_GAME_TICK 0.25`); the legacy plist AI thinks every `AI_THINK_INTERVAL 0.125` s (`AI.h:31`, `Universe.m:6576`), and the JS AI wakes when the player clock passes `AIScriptWakeTime` (`ShipEntity.m:2479`). Wegolite has a fixed `DT = 1/120`, and a clock that is not monotonic in flight terms.

**How to avoid:**
- Use the monotonic integer sim tick (`FlightState.tick`) as the only AI time base: `wakeTick = simTick + Math.ceil(delaySeconds * 120)`; the legacy think interval is exactly 15 ticks. Timers are integer tick counters (`ticksRemaining -= 1`), never `seconds -= dt`. Convert Oolite seconds to ticks in one function with one rounding rule and unit-test it.
- Never use `clockSeconds` in AI, populator or combat timers. Use it only where Oolite semantics really mean the in-universe date.
- AI work may be staggered only if the slot is a pure function of `(simTick, entityId)` *and* Oolite's own wake/think times are honoured (so the stagger is invisible). Never skip AI work by frame count. Prefer making each think cheap (one cached scan per think) over staggering.
- Extend the `tests/sim/flight-cadence.test.ts` style to the world: the same tick-indexed input log at 30, 60, 120 and 144 Hz frame deltas must give identical world hashes, including a scenario that crosses a launch (+600 s) and a hyperspace arrival.
- Several behaviours use `delta_t` inside formulas (see Pitfall 6); record each such site.

**Warning signs:**
- Any `clockSeconds`, `Date`, `performance.now` or `dt`-subtraction timer in a new `src/sim/ai` file.
- A cadence test that covers the player only.
- AI behaviour that changes when the launch autosave (+600 s) happens.

**Phase to address:** P-A Foundation (tick-based scheduler contract); P-B uses it.

---

### Pitfall 4: One NaN, one `canon` throw, one engine-specific transcendental

**What goes wrong:**
`canon()` (`src/sim/hash.ts`) *throws* on a non-finite number. That was a deliberate trap for the single-entity probe, but with dozens of AI ships one degenerate geometry (target at exactly the same position, `normalize` of a zero vector, `acos` of 1.0000000002, division by `desired_range = 0`) becomes an uncaught exception inside the frame loop and the game dies. The player already has `sanitizeFlightState`; NPCs do not.

**Why it happens:**
Oolite tolerates NaN and guards only some cases (`trackDestination` sets `relPos.z = 1.0` when `relPos` is zero). Ports replicate the formula and skip the guard. Also, `src/sim/math.ts` documents that `Math.sin/cos` replay is bit-identical *within one JS engine only*; NPC steering adds `acos`, `atan2` and `pow`, which can differ by an ULP between V8 and SpiderMonkey and diverge chaotically.

**How to avoid:**
- A per-entity `sanitizeShip` (finite check, clamp speed and position, renormalise orientation, count repairs like the player's `repairCount`) runs once per tick *before* hashing, and the repair count is published to the probe. A repaired ship is a bug to fix: tests assert zero repairs over the golden scenarios.
- Port each `ShipEntity.m` guard literally and add guards Oolite lacks where an input can be zero (distance, normalisation, `acos` argument clamped to [-1, 1]).
- Keep the hash claim narrow: golden fixtures are generated and replayed inside the same container engine only (already documented). Never compare NPC hashes between Chromium and Firefox. Saves must not depend on NPC bit-reproduction (Pitfall 10).
- Prefer dot-product comparisons over angles in hot steering code.

**Warning signs:**
- `non-finite value in state` in a browser console after a dogfight.
- A "fix" that wraps the hash in try/catch.

**Phase to address:** P-A Foundation (sanitiser, soak scenario), P-B (guards in steering).

---

### Pitfall 5: Hand-port drift of the AILib framework, and no way to see it

**What goes wrong:**
The TS port compiles and each function "looks like" the JS, yet ships behave differently: traders never flee, police never reconsider, pirates stay attached to a dead target, a role works until the first save/restore. Drift is invisible because no test compares against the original and about 12k lines are involved (`oolite-priorityai.js` 6,838 lines with about 266 function definitions, `Resources/AIs/*.js` 2,427, `oolite-populator.js` 2,736).

**Why it happens (mechanics a port loses):**
1. **Closure caches.** `__cache` is cleared on every `_reconsider`; `__ltcache` only when the player clock passes `__ltcachestart` (60 s) and holds `oolite_nearestStation`, `oolite_homeStation`, `oolite_cruiseSpeed`, `oolite_sentDistressMessage`, `oolite_fineThreshold`, `oolite_shipInRoleCategory` (`oolite-priorityai.js` 48-50, 203-212, 676-680, 731-775, 843-947, 1318). Some conditions consume randomness *and* are cached: dropping the cache re-rolls the condition inside one priority walk; adding a cache where Oolite has none freezes a roll for too long.
2. **`this` dispatch.** Conditions, configurations and behaviours are plain functions stored in the priority table (`condition: ai.conditionLosingCombat`, `behaviour: ai.behaviourFleeCombat`) and invoked with `.call(this, ...)`; role scripts choose variants at `aiStarted` by `primaryRole` (`oolite-traderAI.js`: `cautionscan` differs for `trader-smuggler`). Binding to the wrong object, or resolving the variant at module load, runs the wrong function for subroles.
3. **Condition side effects and short-circuit order.** `_reconsiderList` walks the tree and stops at the first usable entry. Conditions have side effects: `checkScannerWithPredicate` sets `oolite_scanResultSpecific`, may call `reconsiderIn(5)` and draws a random offset; `preconfiguration`/`configuration` entries mutate parameters. Evaluating all conditions eagerly (for logging, "pure function" refactors, memoisation) changes parameters and RNG consumption.
4. **Reconsideration timing.** `setPriorities` resets reconsideration to `Math.random()` seconds when no delay is given (`:578`); `_resetReconsideration` only ever makes the wake *earlier*, never later (`:229-239`); every priority entry carries its own `reconsider: n`. "Reconsider every n seconds" loses both the stagger and the earlier-only rule.
5. **Handler sets per behaviour.** `applyHandlers` installs a different set of event handlers for each behaviour and deletes the old ones. An event (`shipBeingAttacked`, `shipTargetLost`, `shipAchievedDesiredRange`, `entityDestroyed`) arriving while the current behaviour registered no handler is *dropped* in Oolite. A port with one global handler set reacts in states where Oolite is deaf.
6. **Dead and stale references.** Oolite holds weak references and tests `isValid`/`isInSpace` constantly (`_reconsider` returns early if the ship is not in space, `:195-199`). A port that stores objects in AI parameters (`oolite_scanResults`, `oolite_selectedPlanet`, home station) keeps dead ships alive, breaks hashing and cannot be saved.
7. **Parameters as an untyped bag.** `setParameter("oolite_...")` accepts anything, including entities and functions; a straight port is an untyped map that cannot be validated, hashed or serialised.

**How to avoid:**
- Model AI state as an explicit typed record per ship: `{ treeId, behaviourId, params, cache, ltCache, wakeTick, handlers }`, with every entity reference an `EntityId | null` resolved through `WorldView` at use time (an `undefined` result is a dead target, handled as Oolite handles `!isValid`). No closures, object references or functions in state. Priority trees are immutable typed literals (as already decided); state stores the tree id.
- Port `_reconsiderList` once as a generic interpreter with the *exact* short-circuit semantics. Keep every condition/configuration/behaviour a separate function with the same name as the original so a reviewer can grep one against the other. Do not "clean up" conditions into a different shape in this milestone.
- Implement `__cache`/`__ltcache` as explicit objects cleared at the same points (each reconsider; every 60 simulated seconds counted in ticks, Pitfall 3) with a test per cached key.
- Model `applyHandlers` as a set of event names set at behaviour entry; the event dispatcher checks it.
- **Detect drift mechanically (in P-B, before any role):**
  1. *Coverage manifest.* A script lists every `PriorityAIController.prototype.*` and `this.*` name from the JS and checks the TS port has a same-named entry or an explicit `notPorted: <reason>` row (thargoid, mission, contract, OXP hooks). CI fails on an unclassified name.
  2. *Priority-tree structural diff.* A dev-only script extracts the ordered `condition`/`behaviour`/`reconsider` identifiers from each role AI's `setPriorities` literal and compares them with the TS literal, catching omitted branches.
  3. *Differential trace harness (dev/test only, never shipped).* Load the original `oolite-priorityai.js` plus one role AI in Node `vm` with a small mocked host (`ship`, `system`, `clock`, `Timer`, `Vector3D`, `log`, `worldScripts`, and `Math.random` replaced by a scripted sequence); drive it and the TS port with the same scripted world fixtures and compare the *sequence of chosen behaviours and parameter writes*. The originals are plain ES5-style code, so the mock surface is the cost to budget. It is the only check that proves the port and it is cheaper than finding drift in play.
  4. *Scenario goldens.* For each role, 5-10 hand-built fixtures ("trader, hostile in scanner, no friendly station" -> flee-combat behaviour) whose expected values come from the harness, committed as data.
- Record the pinned Oolite commit and the original line range in each ported file's header.

**Warning signs:**
- A role "mostly works" but never exercises half its tree.
- Any `any`, `unknown` bag, `Map<string, unknown>` or entity object inside AI state.
- Behaviour changes when conditions are reordered "for readability".
- A handler present in a state where the original removed it.

**Phase to address:** P-B AI core (framework, manifest, harness); P-C re-uses the harness per role.

---

### Pitfall 6: The native `BEHAVIOUR_*` steering is the real fidelity risk

**What goes wrong:**
The AI chooses the right behaviour and the ship still does not look or fight like Oolite: dogfights orbit instead of circling, ships overshoot stations, escorts never form up, fleeing traders wobble, collision avoidance jitters. AILib decisions are a thin layer over about 30 native behaviours in `ShipEntity.m` (from `behaviour_stop_still` at line 3700 onward, dispatched at 2490-2624) plus their helpers (`trackDestination`, `trackPrimaryTarget`, `applySticks`, `applyAttitudeChanges`, `avoidCollision`, `hasProximityAlertIgnoringTarget`).

**Why it happens:**
- The behaviours are emergent: they match only when the *flight model underneath* matches. NPC `max_flight_pitch/roll`, `thrust` (`SHIP_THRUST_FACTOR 5.0`), speed approach and stick smoothing must be Oolite's ship physics, not the player's Wegolite flight model from Phase 3 (a scalar-speed Aristotelian model with its own constants).
- Numeric details are load-bearing: in `trackDestination` (`ShipEntity.m` 9450+) `int factor = sqrt(fabs(d_right)/fabs(min_d))` truncates to an int and caps at 8; `MAX_COS 0.995`; `precision` 0.9025 vs 0.25 when docking; the `stick_pitch = 0.01` "turn anyway" fallback; the `frustration` counters that trigger `noteFrustration`; the `COMBAT_*_FACTOR` ranges; `COMBAT_JINK_OFFSET 500`. Wrong rounding or a missing fallback shifts behaviour.
- **Variable vs fixed `delta_t`.** Oolite computes with the real frame time (typically 1/30-1/60 s); formulas divide by it, for example the overshoot limiter `fabs(d_right) / delta_t`. At 120 Hz the thresholds are reached at different angles, so steering critically damped at 1/60 s can ring at 1/120 s. The docking auto-centre already needed a recorded divergence for the same reason ("apply once per fixed tick").
- Oolite stores orientation and velocity as `GLfloat` and position as a double `HPVector`; thresholds like `max_cos >= 0.99999` are float-tuned.
- Behaviours read state not in the first design: `dockingInstructions`, `docking_match_rotation`, `pitching_over`, `success_factor`, `frustration`, jink, `weaponTemperature`, `accuracy`, group and escort leader positions.

**How to avoid:**
- Port each behaviour as its own function with the Oolite line range in a header, in dependency order: stop/idle/tumble -> track_target -> fly_to_destination / fly_range_from_destination -> intercept -> attack_target (+ break_off, slow_dogfight, fly_to/from_target) -> evasive/flee -> avoid_collision -> formation -> broadside/sniper -> navpoints/land/tractored. Ship a behaviour only with its tests.
- Keep all per-ship steering state (`stick_pitch/roll`, `desired_speed`, `desired_range`, `frustration`, `pitching_over`, flags) in one typed record that is serialised and hashed.
- Take per-ship constants from `shipdata.plist` through the content pipeline; never tune by eye.
- Oracle tests: implement the Oolite formula for `trackDestination` as a standalone reference over a grid of relative positions and compare stick outputs with the port at 1/60 s and 1/120 s. For each `delta_t` site decide whether to keep Oolite's form (accepting different oscillation) or adapt it, and record the decision as for the auto-centre.
- Write behavioural acceptance tests, not "looks": "a pirate 4 km away reaches firing range within X s and fires", "a trader at cruise speed docks at Lave without collision", "an escort holds formation within Y m for 60 s", over 20 seeds, with bounds taken from Oolite where possible.
- Budget this honestly: it is the largest single risk of the milestone and should not share a phase with the framework.

**Warning signs:**
- Fights end instantly or never; NPCs spiral toward a target indefinitely.
- "Looks wrong" feedback with no test that can say why.
- Constants in AI files that are in neither `shipdata.plist` nor an Oolite header (invented tuning).

**Phase to address:** P-B AI core (own phase, or first half of it); P-D re-checks combat steering with weapons.

---

### Pitfall 7: Synchronous cross-entity events and re-entrancy

**What goes wrong:**
Damage to ship A triggers messages to its group, to police, to its AI and to the player's legal status in the middle of the tick, mutating entities that have or have not been updated yet this tick. Results depend on update order and can recurse (A hits B, B's handler hits A).

**Why it happens:**
Oolite delivers these synchronously: `takeEnergyDamage` calls `broadcastHitByLaserFrom` and `respondToAttackFrom`, sets `foundTarget`/`primaryAggressor` on group members, with `randf() < 0.5` for pirate groups (`ShipEntity.m` 11418-11520), and `doScriptEvent:andReactToAIMessage:` runs script handlers immediately.

**How to avoid:**
- Decide the pattern in P-A and encode it in the `WorldView`/`ShipControl` types: during a tick, updates *emit* typed events into a per-tick queue; the queue is delivered at one fixed point (after movement and combat resolution, ordered by `(sourceId, sequence)`); events caused by handlers go to the *next* tick's queue. The cost is one tick (8.3 ms) of latency; record it as a deliberate deviation.
- Handlers may mutate only the receiving entity and enqueue events; they never call into other entities' state.
- Write the per-tick order down and pin it with an ordering test: commands -> player step -> AI thinks (by id) -> behaviours (by id) -> movement -> broadphase and collisions -> weapon resolution -> deliver events -> sweep dead -> sanitise -> hash.

**Warning signs:**
- A handler imports another entity's module and calls it.
- Results change when entity creation order changes.
- Stack depth or infinite loops in a dogfight with groups.

**Phase to address:** P-A Foundation (queue and tick order); P-D Combat uses it.

---

### Pitfall 8: Refactoring `game-session.ts` (3,365 lines) while 121 e2e tests read its probe

**What goes wrong:**
The split breaks e2e tests for reasons unrelated to behaviour, or silently changes behaviour, because the probe, the `?test=1` hook, the redraw gate and the frame order are all entangled in one closure. Concrete traps in this file:
- `probe.test = createTestHook(activeState, ...)` captures the `FlightState` *object*. The code already re-runs `bindTestHook` after every Load because "a hook never mutates a replaced state object (G-8)". Any new owner of `state` (a world object holding the player) that reassigns it reopens that bug.
- `updateProbe()` (about lines 2413-2550) runs every frame and is read by 25 specs (`probe.frames`, `probe.renders`, `probe.position`, `probe.hud.*`, `probe.station`, `probe.save`). `probe.renders` stopped advancing while idle after the redraw-gate change and tests were burned once by exactly that kind of semantic shift.
- Frame order is load-bearing: the chart and save-screen branches drain commands and return before the fixed step; autosave is taken "before `beginLaunch`" and "on the docked event"; pause resets the accumulator; commands apply on the first step of a frame only.
- `handleEvent` is a 100-line switch mixing UI, autosave and sim concerns, and audio will be added to it.

**Why it happens:**
The file is a closure over about 100 local functions and many `let`s (`state`, `layout`, `paused`, `chartOpen`, `profile`); extraction changes capture semantics.

**How to avoid:**
- **Split first, add features second, in separate commits.** The refactor must be behaviour-preserving, proven by (a) all goldens unchanged, (b) `docker compose run --rm verify-full` green at each step, and (c) a new **probe-shape snapshot test**: record the keys and value types of `window.__wegolite` at menu, docked, in-flight, paused, chart-open and after-save states as a committed fixture and require the refactor not to change it. (`tests/guards/probe-lock.ts` serialises lint probes; it is not a probe-shape check.)
- Extract along seams the code already has: the `handleEvent` router, the autosave policy, the station screen controller, the pause/context wiring (partly out already: `context-recovery.ts`, `redraw-gate.ts`, `launch-sequence.ts`), and the frame orchestration *last*. Give each extracted module explicit dependencies and unit-test it with fakes, as `tests/app/*` does.
- Keep `window.__wegolite` publication in one module with the same field names. New world data goes into *new* probe sub-objects (counts plus an on-demand query function), not per-frame rebuilt arrays (Pitfall 12; review item P5 already flagged `updateProbe` cost).
- One object owns "the live simulation state" and its *fields* are mutated in place, never replaced; the test hook binds to that instance.
- Keep `?test=1` semantics (taint, autosave skip, `probe.save.skipReason`) intact.
- Do not bundle unrelated behaviour changes (chart pauses flight, torus refusal message) into the refactor commits; fold in only the P7 per-step `Set` allocation fix the review suggested "when the file is split".

**Warning signs:**
- An e2e failure that disappears with a longer timeout.
- A diff touching probe field names in a "pure refactor".
- Two sources of truth for `paused`, `mode` or `state`.

**Phase to address:** P-A Foundation (first plan, before the world model lands).

---

### Pitfall 9: Putting the world into `hashFlight` invalidates every existing golden at once

**What goes wrong:**
Adding world state to `serializeFlight`/`hashFlight` changes the canonical text, so `flight-cadence`, `dock-cadence`, `replay-integrity`, `hyperspace` and the kinematic golden fail together; the "fix" is regenerating them, which destroys their value as regression evidence for player-only behaviour.

**Why it happens:**
`serializeFlight` is one fixed key list with no slot for a variable-size section.

**How to avoid:**
- Compose, do not extend: `hashWorld = fnv1a32(serializeFlight(player) + "\n" + serializeWorld(entities))`, with `serializeWorld(empty) = ""` defined so that an empty world hashes byte-for-byte like today's `hashFlight`. Existing goldens then stay untouched and prove the refactor.
- Populated-world goldens are additive files under `tests/golden/world/`.
- `serializeWorld` follows the existing rules: fixed key order, `canon` for every number, never `JSON.stringify`, explicit ascending-id order (Pitfall 1), RNG states and AI state included (Pitfalls 2 and 5), integers for tick counters.
- Hash per entity and combine, so a failing test can name the first diverging entity id.

**Warning signs:**
- A PR that regenerates existing golden files "to add world state".
- A golden diff touching unrelated tests.

**Phase to address:** P-A Foundation.

---

### Pitfall 10: Save-format growth, migration and the scope of "serialise the world"

**What goes wrong:**
(a) Serialising live NPC state into the single IndexedDB slot overflows `MAX_SAVE_CHARS = 65,536`. The constant's own comment derives a worst case of about 38.9 KB for the v2 profile; 30-60 ships with AI state, parameters, caches and RNG states at 400-800 JSON bytes each add roughly 12-48 KB, plus pods and wreckage. The bound is checked before `JSON.parse` and the semantic validator is shared by reader and writer, so an oversized world is rejected and the writer refuses to replace the last good blob: the player silently stops saving. (b) A v3 save opened by a v2 build is read as corrupt (strict zod object); the cost is known and accepted for v1/v2 but a world section enlarges it. (c) Restoring mid-fight state exposes every non-serialisable AI detail (Pitfall 5) as a save bug. (d) Combat adds profile fields (legal status, bounty, kills, laser mounts, shield and energy equipment, insurance, escape pod) that do not fit the uniqueness-keyed `equipment` list (four laser mounts; the validator asserts allow-lists and caps).

**Why it happens:**
PROJECT.md's active requirement says "serialised into saves and determinism hashes". The current save is a *leg anchor* (docked, or witchpoint arrival), written on launch, docking, purchase and arrival; at those moments the world is empty (docked) or freshly populated (arrival). Oolite itself saves no NPC state; it re-populates on load.

**How to avoid:**
- Interpret "world serialisation into saves" narrowly and record it in `PROJECT.md`: **the save carries the world seed, the arrival counter and `nextEntityId` (plus the profile), not the entities.** Re-populating from the seed at the anchor reproduces the same arrival world (Pitfall 2's forked populator stream makes this exact). Full-entity serialisation is needed only for the *hash* and for tests (round-trip, replay), where the size cap does not apply.
- Keep autosave triggers as they are; do not add "save in the middle of a fight". If a mid-leg save is ever required, make it a separate decision with a bounded entity count, a rewritten `MAX_SAVE_CHARS` derivation and a test that fills the world to its cap and asserts the encoded size.
- Profile additions ship as **save v3 with an ordered migration** (v2 -> v3 defaults: clean legal status, zero bounty, standard shield state, laser mounts derived from existing equipment), using the strict-schema and shared-validator pattern (`validateSaveSemantics`, allow-lists, caps on every new field) and new golden blobs next to `tests/golden/save/v2-from-v1-*.json`. Record the forward-compatibility cost in Key Decisions as the v1 -> v2 step did.
- Dying in space is a profile change at a save anchor: write the post-death profile (insurance payout, equipment lost, legal status) atomically in one snapshot, as `snapshotForSave` does for credits and cargo, or a reload re-offers the same death.
- Any new test-hook mutation must taint the profile so a granted weapon never becomes durable (existing rule).

**Warning signs:**
- `isEncodedSaveValid` fails for a normal mid-game profile after a combat change.
- The save probe shows an `invalid-save` or unreadable status after a fight.
- A save blob above about 40 KB.

**Phase to address:** P-A Foundation (decision, ids and seed fields); P-E Death and law (profile v3 and migration).

---

### Pitfall 11: Test-suite runtime explosion under SwiftShader (the sim runs at about 0.1x real time in the browser)

**What goes wrong:**
Every e2e wait on *simulated* time becomes minutes. This is already measured: a loaded in-flight frame is 369 ms (2.71 fps) on SwiftShader, and `MAX_STEPS_PER_FRAME = 5` allows at most 5 x 1/120 s = 41.7 ms of simulation per rendered frame, so the game advances about 13.5 steps (0.11 s) per wall second. The message-expiry spec needed a 300 s ceiling and still took 152-160 s. NPC traffic and combat make frames costlier (more draw calls, more fill) and push that ratio lower; every spec that waits for a pirate to arrive, fire, die, be scooped or a pod to expire multiplies. The suite is already 121 browser tests in 25 specs plus about 1,366 unit tests (`npm test` about 66 s), and CI runs `verify-full`.

**Why it happens:**
The natural style for AI features is "set up, wait, observe", and the existing `?test=1` hook can move, rotate and set speed but cannot advance the sim.

**How to avoid:**
- **Prove combat, AI and traffic in Vitest, not in the browser.** The world is pure TypeScript with no DOM, so scenario tests run thousands of ticks in milliseconds. Target at least 90 % of new behavioural assertions in unit and scenario tests; browser specs prove wiring only (the HUD scanner shows a hostile, a hit changes the shield bar, the death screen appears, the audio-start counter increments).
- Add a **test-only fast-forward** to the `?test=1` hook: `advanceTicks(n)` runs sim steps directly (bypassing the render loop), taints the profile and returns. Browser waits then count ticks, not seconds. Keep it behind the same gate as the existing hook; the fault-seam build pattern is the precedent for anything stricter.
- Add a **test-only world preset** (`spawnShip(role, position, ...)`, `setWorld(fixture)`) and keep the populator **off by default in e2e**, so docking, hyperspace, HUD and chart specs do not suddenly share Lave with traders. The default e2e world stays empty, exactly as today. This single decision protects the 121 existing tests.
- Set a wall-clock budget in each plan (for example at most 60 s per new browser spec, at most about 10 new browser tests in the milestone), measured under the pinned `workers: 2`. Put new browser specs in the `verify-full` chain and at most one or two in the fast `verify` subset.
- Do not tune the shipped planet or scene to fit the test (the project rejected that in G-03-3).
- Fix the pending Shift+C docking timeout first and keep its lesson: a probe read racing a loop frame. Never raise a timeout; wait on `probe.frames` or ticks.

**Warning signs:**
- A new spec using `waitForFunction` with a timeout above 30 s.
- `verify-full` wall time growing by minutes in one phase.
- A timeout raised to make a new test pass.

**Phase to address:** P-A Foundation (hook, empty-world default, budget rule); every phase obeys it.

---

### Pitfall 12: Performance: per-tick allocation, O(n^2) scanning, draw calls and load size

**What goes wrong:**
At 120 Hz with up to 5 catch-up steps, 30-60 AI ships and an entity list that also holds wreckage, pods, missiles and asteroids, cost per rendered frame grows by orders of magnitude.

Known numbers: `Vec3`/`Quat` are immutable object literals created by `vec()`/`quat()`/`mul()` (`src/sim/math.ts`); every operation allocates. Steering at 50-100 vector operations per ship per tick is 60 x 100 x 120 = 720k short-lived objects per second at 60 fps (more during catch-up): minor-GC pressure and hitches. Oolite scans are O(n) per ship through a z-sorted list capped at 32 results, but proximity checks and `entitiesWithinRange` run per tick; a naive all-pairs scan is O(n^2) per tick. Rendering: the in-flight scene draws 10 calls against a gate of 50, and each multi-material NPC ship can cost 2-6 calls. Assets: cold-start transfer is 8,814,224 bytes against a gate (`FIRST_LOAD_BYTES_CEILING`) of 9,437,184, only 623 KB of headroom, while Oolite's `Resources/Music` is about 7.9 MB, `Resources/Sounds` about 412 KB, and each NPC model brings textures.

**How to avoid:**
- Hot-path entity data uses **struct-of-arrays or mutable scratch fields** (`Float64Array` pools for position, velocity and orientation; preallocated scratch vectors in steering). Keep the immutable `Vec3` API for cold paths and tests; add an in-place `math-mut.ts` rather than rewriting `math.ts`.
- Run AI *thinks* at Oolite's cadence (every 15 ticks) and steering per tick; cache one scan per ship per think; cap results at 32 like Oolite (the cap is also a fidelity constant).
- Broadphase: a uniform grid or one-axis sweep (like Oolite's z-list) with **deterministic pair order** `(idA, idB)`, rebuilt per tick into reused arrays. Test pair-order stability against shuffled spawn order (Pitfall 1).
- A sim cost test in Vitest: 64 ships for 10 simulated seconds under a generous bound (use `performance.now` in the *test*, not in `src/sim`), and pool-size growth checks. It is an early-warning, not proof of 60 fps (the project already separates container evidence from the reference-desktop run for QUAL-01).
- Render: **instance** NPC meshes by model (`InstancedMesh`), share geometry and materials across ships of one model (today's per-ship `cloneMaterials` is right for the single player mesh and wrong for traffic), cull beyond scanner range and by distance, and add a populated-scene row to `budget.spec.ts` inside the existing 50-call / 250,000-triangle gates.
- Do not publish entity arrays through `updateProbe` every frame; expose counts and an on-demand snapshot function.
- Assets: load NPC models, sounds and music **lazily after first flight** and only for roles present in the system; keep the cold-start gate meaningful (empty-population default). Re-encode textures with the existing `cwebp` pipeline. Update `docs/PERFORMANCE.md` rows and any ceiling *deliberately*, as a recorded decision.
- The planet fragment shader dominates SwiftShader frame cost (about 281 of 369 ms); more ships do not change that, but more *test frames* do (Pitfall 11).

**Warning signs:**
- `probe.frames` falls while `probe.renders` is stable.
- Visible 20-40 ms hitches (GC) in the QUAL-01 sampler p99.
- `budget.spec.ts` ceilings edited in a feature commit.

**Phase to address:** P-A (pools, broadphase contract), P-C (instancing, lazy assets), P-H (QUAL-01 measurement with traffic).

---

### Pitfall 13: Audio autoplay, context resume and the hidden-tab / pause interplay

**What goes wrong:**
(a) An `AudioContext` created at module load or game start is `suspended`; the first sounds are lost and Chrome logs "The AudioContext was not allowed to start". (b) Music and engine loops keep playing while the game is paused, the tab is hidden or the WebGL context is lost, because audio is not coupled to the pause machinery. (c) With `pauseOnFocusLoss` off, the sim stops anyway because rAF stops in a hidden tab, but sounds continue. (d) Resume after pause floods queued sounds. (e) Sim events at 120 Hz (a laser every few ticks; 5-step catch-up in one frame) produce bursts and overlapping voices. (f) Headless Chromium in the test container has no audio device, so assertions on `currentTime` or audible output are impossible or flaky. (g) Eagerly loaded music (about 7.9 MB) and sounds break the first-load gate. (h) The CSP is `default-src 'self'; connect-src 'self'` with no `media-src` or `blob:` allowance.

**Why it happens:**
Audio is output-only and easy to bolt on late, but pause, focus-loss, visibility and context-recovery logic in `game-session.ts` (`pause`, `focusLost`, `resume`, `enterContextLoss`) was written without it.

**How to avoid:**
- Create the `AudioContext` lazily inside the first user gesture that already exists (New game / Continue click, or first key) and call `resume()` there; guard on `ctx.state`. Never construct at import. Chrome's autoplay policy keys on sticky user activation, so create and resume at the click and load buffers afterwards, even on the Continue path that awaits IndexedDB.
- Make audio a **subscriber to existing state**: `pause()`, `enterContextLoss()` and `document.visibilitychange` (independent of `pauseOnFocusLoss`, because a hidden tab must be quiet regardless) call `ctx.suspend()`; `resume()` calls `ctx.resume()` only after a player action and with the same `contextLost` refusal as the sim resume. One owner function, like `clearHyperspaceAttempt`.
- Sound is **derived from `SimEvent`s** (new typed events: laser fired, hit, explosion, scooped, missile launched, ECM...) and **never feeds back into the sim or the hash**. Coalesce per rendered frame; enforce a voice limit and a per-sound retrigger interval. Keep the mapping data-driven from the vendored `customsounds.plist`.
- Load with `fetch` + `decodeAudioData` (allowed by `connect-src 'self'`), not `<audio src=blob:>`. Keep the CSP unchanged unless a decision records why.
- Staged loading: UI blips and the laser/explosion/hit set after first flight begins (about 412 KB for all `Resources/Sounds`); music after the first gesture and after the first in-flight frame. The cold-start gate in `budget.spec.ts` must keep measuring "to first in-flight frame" with audio deferred; record music bytes on a separate `docs/PERFORMANCE.md` line.
- Test through a **probe**, not the speaker: `probe.audio = { state, started, suspendedBy, voices }`, plus a fake `AudioContext` in unit tests recording `start` calls. Add one e2e checking `state` is `running` after a click and `suspended` while paused and after a stubbed `visibilitychange`. Whether headless Chromium reaches `running` in the container without an audio device or without `--autoplay-policy=no-user-gesture-required` is **unverified** (MEDIUM/LOW): confirm it in the first audio plan and keep the e2e assertion only if it is stable.
- Provenance: the vendored sounds carry mixed licences (v1 research found CC0 and CC BY exceptions); add `ASSETS.md` and `NOTICE` rows per sound and for music before shipping.
- Add a volume/mute setting as an additive settings field (default on), mindful of the recorded `parseSettings` downgrade caveat.

**Warning signs:**
- A console warning that an audio context was not allowed to start.
- Sound continuing in a backgrounded tab.
- Sound code importing `src/sim` internals, or `src/sim` importing audio.
- `budget.spec.ts` first-load gate edited.

**Phase to address:** P-G Audio (with the event types reserved in P-A so combat does not change the event union twice).

---

### Pitfall 14: Combat balance drift from Oolite's numbers

**What goes wrong:**
Combat feels too easy, too hard or unfair because a number came from the wrong place: a plist value used but a hard-coded engine constant invented; a unit mismatch (decicredits vs credits, energy units vs per second); a macro ported with the wrong precedence; a per-second rule applied per tick.

**Why it happens:**
Fidelity data sits in three places: plists (`shipdata.plist` `weapon_energy`, `energy_recharge_rate`, `max_energy`; `equipment.plist`), header macros and literals inside methods. Verified in the checkout: `BASELINE_SHIELD_LEVEL 128` (`ShipEntity.h:101`), `SHIP_MAX_CABIN_TEMP 256`, `SHIP_COOLING_FACTOR 0.1`, `NPC_MAX_WEAPON_TEMP 256`, `WEAPON_COOLING_CUTOUT 0.85`, `SHIP_ENERGY_DAMAGE_TO_HEAT_FACTOR (mass > 400000 ? 200000 / mass : 0.5)` (depends on instance mass), `COMBAT_AI_CONFIDENCE_FACTOR 1250000`, and *unparenthesised* macros such as `COMBAT_AI_WEAPON_TEMP_USABLE WEAPON_COOLING_CUTOUT* NPC_MAX_WEAPON_TEMP` and `COMBAT_AI_WEAPON_TEMP_READY 0.25f * NPC_MAX_WEAPON_TEMP`. The naval energy unit multiplies recharge by 1.5 (`ShipEntity.m:3248`), energy damage also adds heat (`ShipEntity.m:11418+`), and blast damage has a distance falloff (`ShipEntity.m` ~7666-7674). The project rule "numbers come from config" does not cover header macros.

**How to avoid:**
- Keep a **constants ledger** (typed `combat-constants.ts` plus a doc table): value, unit, Oolite file:line, pinning test. Extend `FIDELITY.md` with combat rows; each divergence (fixed step, one-tick event latency, scan order) cites its Key Decisions row, as the existing contract test already requires for the 26 mechanics.
- Port macros by *expansion*, then parenthesise explicitly and test against a value hand-computed from Oolite's expansion.
- Write combat arithmetic as small pure functions with table-driven tests built from worked examples taken from Oolite's code (damage of a given laser into a given shield, recharge per second, heat per hit, kill thresholds). Time-based quantities use ticks (Pitfall 3); verify each per-second rate by simulating 1 s.
- One damage function shared by player and NPC; test the same hit on a trader and on the player.
- No feel-tuning in this milestone. An Oolite number that plays badly is a finding, recorded as an owner-approved deviation.
- Put accuracy and break-off randomness (`randf() < 0.75`, `0.3`, `qbomb_chance`) in the per-entity combat stream (Pitfall 2) so fights reproduce.

**Warning signs:**
- A constant in combat code without a source comment.
- Test fixtures with values that appear in no Oolite file.
- Commits titled "balance".

**Phase to address:** P-D Combat (ledger and tests); P-F reuses it for collision and heat damage.

---

### Pitfall 15: Scope creep into missions, contracts, thargoids and the rest of the populator

**What goes wrong:**
AILib and the populator are shared code, so porting "the whole file" drags in mission, contract, thargoid, nova, hermit, constrictor and OXP-facing code and stretches the milestone. In the reference, `oolite-populator.js` has 89 lines mentioning thargoid, contract, mission, assassin, hermit, nova or interstellar; `oolite-priorityai.js` has 58 lines mentioning thargoid, contract, mission, passenger or parcel, and `oolite_entityContracts` reads `worldScripts["oolite-contracts-helpers"]` (line 2800). The populator also registers interstellar thargoid populators, a nova mission cancellation path and rock hermits (a station role), and the AILib has comms personalities (`_getCommunication...`) and 18 `worldScripts`/`player.`/`mission.` references.

**How to avoid:**
- Use the Pitfall 5 coverage manifest as the scope control: every JS symbol is `port`, `stub` (inert, returns Oolite's default) or `notPorted: <milestone>`; reviewers reject unlisted additions.
- State the v2.0 role list explicitly: trader (with courier and smuggler variants only where the populator weights need them), pirate (fighter, freighter, interceptor), police, bounty hunter only if the populator's hunter packs are in, scavenger, shuttle, station, missile, escort, buoy, null, dumb. Thargoid, thargon, constrictor, contract assassin, rock hermit, miner, qbomb, tutorial and defense ship are recorded non-goals with reasons.
- Populator: port the default-system populator and the repopulate frequency tables; omit interstellar, nova and mission hooks and any special-case spawn of an out-of-scope role. Document each skipped branch in the manifest rather than in comments.
- Comms and chatter are cosmetic: stub as "no message" and list it, unless a plan wants a few distress or pay-off strings for the HUD message line.
- Scoop and bounty only far enough to make combat coherent (pods and contents from Oolite's tables, bounty from `shipdata.plist`, fines and legal status per Oolite rules); contracts, passengers and parcels stay in the next milestone (already Out of Scope).

**Warning signs:**
- A new file named after a mission, contract or thargoid role.
- The manifest has more `stub` than `port` entries.
- A task starting "to support the XYZ OXP".

**Phase to address:** P-C Roles and traffic (manifest and role list); restate Out of Scope in the milestone requirements.

---

### Pitfall 16: The populator and the AIs assume a station that launches and accepts ships

**What goes wrong:**
Traders and police "fly to the station and dock" and "launch from the station", but Wegolite's docking code is player-specific: port frame, corridor, hull contact proxy, SAT, auto-centre, docking computer. Populator callbacks call `_launchReady(station)`, which reads `docks[i].launchingQueueLength` (`oolite-populator.js` ~2640), and `behaviourDockWithStation` relies on `dockingInstructions`, station-side queues and `fly_thru_navpoints` (`StationEntity.m` 2,192 lines, `DockEntity.m` 1,176, `ShipEntityAI.m` 2,558). The milestone lists the `ShipEntity` behaviours and a station AI role but not the native station docking-queue machinery.

**How to avoid:**
- Make an explicit P-C decision before role work: (a) port the station docking queue and `dockingInstructions` faithfully (large, medium-high risk), or (b) deliberately simplify NPC docking to "approach the port mouth, then remove" and NPC launching to "spawn at the launch point under Oolite's launch-queue limit", recorded as a deviation. Either way NPCs must not trap the player or touch the player's corridor logic (the existing `no-trap` property tests stay green).
- Reuse `DockGeometry`/`PortFrame`; do not duplicate geometry.
- Treat NPCs near the slot as obstacles in a limited way (queue or hold position), not through the hull-contact proxy meant for the station.

**Warning signs:**
- NPCs fly through the station hull or the slot.
- NPCs spawn inside the player during launch.
- Dock proof tests start failing once traffic is enabled.

**Phase to address:** P-C Roles and traffic (decision before role work); P-D re-checks launch safety.

---

### Pitfall 17: Moving static bodies into the world, collision shapes, and the deferred collision todo

**What goes wrong:**
(a) The planet, sun, station and two buoys live in `SystemLayout` (`src/sim/world/layout.ts`) and are consumed by aegis, compass, mass lock, docking and rendering. Making them world entities *as well* creates duplicates (two buoys; wrong compass order: the populator comment says the buoys "need to be added first, in this order" for the compass) or a second source of truth. (b) Oolite collides ships through per-model octrees and `collisionRadius` (`Universe.m` collision regions, `Octree.m`); Wegolite's station contact is already a conservative OBB/AABB SAT proxy. Spheres for all ships give different fights; octrees are a large port. (c) The pending todo (planet, sun, buoys) is deliberately deferred until shields exist, and the buoy sim radius is 10 m while the drawn model is about 100 m across, so a collision radius decision is open. (d) The sun needs to be queryable for cabin temperature and for NPC sun avoidance (24 `system.sun` references in `oolite-priorityai.js`). (e) Player death can arise from several causes (energy, heat, collision) with different messages and consequences.

**How to avoid:**
- Keep `SystemLayout` as the authority for static bodies; the world exposes them through `WorldView` as read-only static entities with **fixed ids** (for example 1 planet, 2 sun, 3 main station, 4-5 buoys, player 100, dynamic ids above) so AI conditions can query "nearest station/planet/sun" without duplication. Aegis and compass keep reading the layout.
- Decide the collision shape once. Recommended: sphere or OBB proxies per ship derived from the compiled ship bounds (`tests/golden/content/ship-bounds.json` exists), recorded as a deviation from octrees; keep the existing station SAT for the station; do not mix.
- Implement the collision todo in P-F only after shields and energy exist (P-D), as the owner decided, using the shared damage function (Pitfall 14), and decide the buoy collision radius against the drawn model in the same plan.
- Planet and sun contact use float64 world coordinates like the camera-relative decision.
- A single `die(cause, ...)` path for energy, heat, collision and ejection so insurance and legal consequences are computed once.

**Warning signs:**
- The compass cycles to a buoy that is not the nav buoy.
- Two physical buoys in the scene, or a scene/world mismatch.
- Collision tests that need a `?test=1` hack to reach the planet.

**Phase to address:** P-A (static-body ids and read-only views), P-F Collisions.

---

### Pitfall 18: Player death, escape pod and insurance interact with autosave, pause and the title flow

**What goes wrong:**
The player dies in the middle of a tick after an autosave anchor and the flow has no defined state: autosave writes a dead profile; the pod launches into a world full of hostile AIs; "Continue" reloads the pre-fight anchor and undoes the death (arguably authentic, but a design decision with Wegolite's leg anchors); the death screen is not covered by the pause and context-recovery guards; pods and wreckage survive hyperspace.

**How to avoid:**
- Add modes (`dead`, `pod`/`ejected`) to the flight state machine in the style of `docked | launching | inFlight`, with a single transition owner and explicit autosave rules (never autosave in those modes; autosave once on the post-death dock, like the existing docked-event anchor).
- Insurance and legal effects are applied in one atomic profile update (Pitfall 10), covered by golden save fixtures.
- Re-check pause, context-loss, chart and save-screen guards for the new modes, and route the new screen through the same `ACTION_CONTEXTS` filters.
- On hyperspace, clear every non-static entity at jump commit and repopulate on arrival from a forked seed; assert `probe.memory` does not grow across jumps.

**Warning signs:**
- A reload puts the player back into a fight.
- The pause menu opens over the death screen.

**Phase to address:** P-E Death and law.

---

## Moderate Pitfalls

### Pitfall 19: `ShipControl`/`WorldView` interfaces that leak the sim or become the old JS API

**What goes wrong:** `WorldView` exposes mutable entities so AI mutates other ships; or it mirrors Oolite's JS object model (`ship.target.position.distanceTo`) with allocation-heavy objects; or it grows one method per condition.
**Prevention:** `WorldView` is read-only, id-based and returns plain data; `ShipControl` is an intent set (`setTarget`, `setBehaviour`, `setDesiredSpeed`, `fire`, `dock`, `message`) applied by the sim at a fixed point. Add methods only when a ported condition needs them, with the Oolite JS name in a comment. The existing zone rule (sim imports only sim and `content/types`) must cover `src/sim/ai`.
**Phase:** P-A Foundation.

### Pitfall 20: Ship data not yet in the client catalogue

**What goes wrong:** the client ship catalogue was trimmed to 15,196 bytes (quick task 261109-s8k) for the Cobra and station; NPC roles need `shipdata.plist` fields (speed, pitch/roll, `roles`, `weapon_energy`, `bounty`, `likely_cargo`, `ai_type`, `escorts`, `scan_class`) and many models. Ad hoc additions bypass the content drift gate.
**Prevention:** extend the content compiler and `tests/golden/content/ships.json` with an explicit field list, regenerate with `docker compose run --rm assets`, never hand-edit generated files, and vendor only models for roles on the v2.0 list (provenance in `ASSETS.md`/`NOTICE`).
**Phase:** P-C.

### Pitfall 21: HUD element growth

**What goes wrong:** the HUD is a fixed eleven-element set with pinned rectangles; scanner contacts, shields, energy banks, missile state, ECM and legal status need elements, and adding them shifts layout assertions.
**Prevention:** reuse existing elements where Oolite does (the scanner exists); add elements deliberately with new layout fixtures; do not renumber existing ones (the hyperspace target went on a second line inside the clock element for this reason).
**Phase:** P-D.

### Pitfall 22: The chart freezes the simulation

**What goes wrong:** the chart and save screen stop the sim (the `chartOpen` branch returns before the step). With NPCs and combat that is an exploit (open the chart to pause a fight) and a fidelity gap, because Oolite keeps running behind its chart. The pending todo becomes a combat rule.
**Prevention:** decide with the owner in P-A or P-D: keep stepping behind the opaque chart, or keep the freeze with a visible "Paused" notice. Update the hyperspace e2e tests that depend on it.
**Phase:** P-D (decision), P-A (note).

### Pitfall 23: Below-24-fps slow motion with heavier frames

**What goes wrong:** heavier frames hit the `MAX_STEPS_PER_FRAME` cap and the game runs in slow motion (known todo); the player can be killed in slow motion by AI whose cost caused the slowdown.
**Prevention:** bound AI cost per tick (Pitfall 12) and decide the low-fps behaviour with the todo (graphics level, pixel-ratio cap or notice) before enabling traffic by default.
**Phase:** decision in P-C, verified in P-H.

### Pitfall 24: Hyperspace blockage and mass lock now have real blockers

**What goes wrong:** blockage and mass lock treat the Coriolis station as the only blocker; the 06-12 decision said "revisit when a later phase adds ships". With traffic, Oolite's checks include ships (`checkShipsInVicinityForWitchJumpExit`), and a countdown can be cancelled by damage.
**Prevention:** extend blockage and mass lock to world ships with Oolite's rules, add in/out-of-radius tests, and update the Key Decisions note.
**Phase:** P-C or P-D (with the first mass-lockable NPC).

### Pitfall 25: Torus, launch and docking regress under traffic

**What goes wrong:** torus disengage on mass lock, the launch queue and dock capture interact with NPCs; the pending torus message bug (a refused attempt reported as "Torus disengaged") becomes more visible.
**Prevention:** keep the existing suites as regression suites with an *empty world*, add traffic variants as unit tests only, and fix the refusal message as a small decoupled task early.
**Phase:** P-A / P-C.

## Minor Pitfalls

### Pitfall 26: Message line flood
**What goes wrong:** combat produces many messages per second; the single HUD message queue grows and collides with hints.
**Prevention:** rate-limit per message kind (as scrape messages already are, one per simulated second) and cap the queue.

### Pitfall 27: Test hook becomes a god object
**What goes wrong:** `createTestHook` gains spawn, kill, set-shield and set-legal until tests bypass real flows.
**Prevention:** hooks only for setup and fast-forward; every mutation taints the profile; keep one e2e per feature that uses real input.

### Pitfall 28: Gating on SwiftShader timing
**What goes wrong:** a millisecond assertion in a browser test fails on a loaded CI runner (CI already recorded five Chromium timeouts under load).
**Prevention:** assert counts (draw calls, triangles, entities, pool sizes) in e2e, never milliseconds; time assertions only in unit cost tests with generous bounds.

### Pitfall 29: Licence and provenance of new assets
**What goes wrong:** NPC models, textures, sounds and music added without `NOTICE`/`ASSETS.md` rows; sound licence exceptions overlooked.
**Prevention:** the compliance tests (`compliance-assets.test.ts`) must cover new files; add rows with each asset.

### Pitfall 30: Changelog and version discipline
**What goes wrong:** a multi-phase milestone with no `CHANGELOG.md` entries (AGENTS.md rule); save v3 ships without calling out the forward-compatibility cost in a `0.y.z` release.
**Prevention:** add an `Unreleased` line in the same commit as each user-visible change and call out the save version bump explicitly.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| One shared PRNG stream for the whole world | Minimal code | Every golden changes with any spawn; AI not reproducible in isolation | Never |
| AI state as an untyped parameter map mirroring `setParameter` | Fast literal port | Cannot validate, hash or save; leaks object references | Never (typed record) |
| Entity references stored as objects | Simple | Dead-target bugs, no serialisation | Never (ids) |
| Skipping the differential trace harness | Saves days | Drift found by players; endless "feels off" debugging | Only if AI scope is cut to a few roles covered by scenario goldens |
| Populating the default e2e world with traffic | Realism everywhere | Breaks and slows 121 tests | Never |
| Serialising all NPCs into the autosave | "Complete" save | Size cap overflow, migration burden | Only with a bounded-count design decision |
| Raising `MAX_SAVE_CHARS` without re-deriving the bound | Quick fix | The "true upper bound" guarantee becomes false | Never |
| Editing budget ceilings to pass | Green CI | QUAL-01 evidence meaningless | Only as a recorded decision |
| Tuning combat by feel | Fun sooner | Loses the fidelity premise | Only as an owner-approved, recorded deviation |
| Per-tick `vec()` allocation everywhere | Readable code | GC hitches under traffic | Cold paths only |
| Silently stubbing comms and contract hooks | Fewer lines | Hidden behaviour gaps | Only if listed in the manifest |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| World model and `stepFlight` | Growing `stepFlight`'s signature again (layout, config, intent, commands, dt, options) | A `World` step that composes `stepFlight` for the player then NPCs; keep `stepFlight` unit tests intact |
| World and `SystemLayout` | Duplicating planet, sun, station, buoys | Static entities with fixed ids that reference layout data (Pitfall 17) |
| AI and content | Hard-coding numeric role data in TS | Priority trees as typed literals (decided); numeric data from the content pipeline |
| Events and UI/audio/autosave | One growing `handleEvent` switch | A router with subscriber modules; sim events stay in `src/sim/events.ts` and are hash-irrelevant |
| Save and world | Persisting entities | Persist seed, counters and ids; re-populate (Pitfall 10) |
| Render and world | Rebuilding scene objects per ship per frame | Pool and instance by model, sync by id, dispose on removal; extend `dispose.spec.ts` and `probe.memory` to NPC meshes |
| Test hook and world | Hook holds a stale state reference | Bind to a stable world instance (Pitfall 8) |
| Redraw gate and NPCs | Idle redraw skipped while NPCs move | In-flight always draws; any visible-NPC change requests a redraw; assert `probe.renders` |
| Hyperspace and world | World not cleared or rebuilt on jump | Clear non-static entities at jump commit, repopulate on arrival from a forked seed |
| Autosave and `?test=1` | A spawn hook that does not taint | Every hook mutation taints (existing rule) |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Immutable `Vec3` allocation in steering | p99 spikes, GC | Mutable scratch and typed arrays | About 30+ active ships at 120 Hz with catch-up |
| All-pairs proximity and collision | Sim ms/tick grows quadratically | Grid or sweep, scan cap 32, think every 15 ticks | About 40+ entities including pods and wreckage |
| One draw call per ship part | `budget.spec.ts` calls above 50 | Instancing, shared geometry and materials, culling, scanner dots | About 10+ visible NPCs |
| Per-frame probe arrays | Test-only cost in production | Counts plus on-demand snapshot | Any size, constant waste |
| Eager music, sound or model loading | First-load ceiling (623 KB headroom) | Lazy staged loading | Immediately when music is added |
| Pods and wreckage never removed | Entity count grows (Oolite wreck lifetimes `750*randf()+250*i+100` s) | Lifetimes in ticks, hard cap, oldest-first removal by id | Long fights |
| SwiftShader frame cost | Sim at about 0.1x in e2e | Unit-level sim tests, `advanceTicks` hook | Every browser wait on game time |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Trusting a forged world or entity count from a save | Resource exhaustion, id collisions | Saves carry seed and counters only; validate and cap every new field; allow-list roles and equipment keys |
| `?test=1` spawn or advance hook reachable in production | Cheating, fault injection | Keep it behind the existing gate; test-build-only for fault seams |
| Audio loaded from a URL or blob | CSP violation or injection | Same-origin `fetch` + `decodeAudioData` only |
| Unbounded message or event queues from many NPCs | Memory growth | Caps per tick and per kind |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Death with no explanation or recovery path | Feels like lost progress | A death/pod screen showing the insurance result and Oolite's landing semantics |
| Sound at full volume on first interaction | Startle | Sensible default gain, mute/volume setting, music ducking |
| Police firing without warning | Confusing legal status | Oolite warning messages and the offender/fugitive status on F5 |
| Hostile ships invisible on the scanner | Cannot fight | Scanner contacts with Oolite colours, tested through a pure projection test |
| Autosave during a fight | Reload into death | Leg-anchor autosave only |

## "Looks Done But Isn't" Checklist

- [ ] **World model:** save, restore, then 1,000 ticks gives the same hash as the uninterrupted run (live order vs restored order).
- [ ] **PRNG:** adding a bystander ship does not change another ship's trace; RNG state is in the hash and serialisation.
- [ ] **Cadence:** 30/60/120/144 Hz replays of a populated, fighting world hash equal, including across launch (+600 s) and arrival.
- [ ] **No `clockSeconds`** in AI or combat timers (grep gate or lint).
- [ ] **AI manifest:** every Oolite AILib, role and populator symbol is `port`, `stub` or `notPorted` with a reason; CI fails on unclassified.
- [ ] **Differential or scenario goldens** exist for the first three priority branches of every shipped role.
- [ ] **Dead target:** every AI parameter holding an entity holds an id; killing the target mid-pursuit does not throw and the AI reconsiders within its Oolite delay.
- [ ] **Sanitiser:** `repairCount === 0` for NPCs over all golden scenarios; no `non-finite` throw over a 10-minute simulated soak with 40 ships.
- [ ] **Probe-shape snapshot** unchanged by the `game-session.ts` split; `verify-full` green after each step.
- [ ] **Existing goldens untouched** (empty-world hash equals `hashFlight`).
- [ ] **Save:** v2 -> v3 migration golden; worst-case profile encoded size under the bound; death and insurance profile update atomic; `?test=1` taint verified.
- [ ] **Browser suite wall time** within the phase budget; no new wait over 30 s; populated-world specs opt in.
- [ ] **Budget gates:** draw calls, triangles and first-load bytes inside the documented ceilings with traffic present and audio deferred; any ceiling change is a recorded decision.
- [ ] **Audio:** context created in a gesture; suspended on pause, on `visibilitychange` and on context loss; silent in a hidden tab; `probe.audio` exists; no console error in the e2e console guard.
- [ ] **Combat numbers:** every constant in the ledger has an Oolite file:line and a test; macros parenthesised.
- [ ] **NPC docking and launching** decision recorded; the player's dock and launch tests pass with traffic enabled in unit scenarios.
- [ ] **Scope:** no thargoid, mission, contract, hermit or OXP code in `src/`.
- [ ] **Compliance:** every new model, texture, sound and music file has `ASSETS.md`/`NOTICE` rows and passes the compliance tests.
- [ ] **CHANGELOG** entries and an explicit save-version bump call-out.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Shared RNG already in goldens | HIGH | Introduce forked streams, regenerate world goldens only (player-only goldens unchanged), record why |
| Order-dependent hashing found late | MEDIUM | Introduce canonical id order, add the restore-equivalence test, regenerate world goldens |
| AI drift found in play | MEDIUM-HIGH | Build the trace harness then; diff role by role; fix from the first diverging decision |
| Save overflow | MEDIUM | Revert to seed-only world persistence; do not raise the cap without re-deriving the bound |
| Refactor broke e2e semantics | MEDIUM | Bisect with the probe-shape snapshot; restore field semantics, not the tests |
| Test runtime explosion | MEDIUM | Move assertions to Vitest scenarios; add `advanceTicks`; make the populator opt-in |
| Draw-call blow-up | MEDIUM | Instancing and culling retrofit; render side only, sim unaffected |
| Audio policy failure | LOW | Move context creation into the gesture handler; add visibility and pause hooks |
| Scope creep | MEDIUM | Re-run the manifest; delete unlisted code; record a decision before re-adding |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| 1 Iteration order and ids | P-A | Restore-equivalence hash test; lint probes for `for..in` and bare `.sort()` |
| 2 PRNG shifts, unserialisable RNG | P-A | Bystander-independence test; RNG state in hash |
| 3 Time bases, time slicing | P-A (contract), P-B | Cadence test with world; grep for `clockSeconds` in `src/sim/ai` |
| 4 NaN and transcendentals | P-A, P-B | Zero-repair soak; no `non-finite` throw |
| 5 AILib drift | P-B | Manifest, structural diff, trace harness, scenario goldens |
| 6 BEHAVIOUR_* steering | P-B | Per-behaviour oracle tests; behavioural acceptance over 20 seeds |
| 7 Event ordering and re-entrancy | P-A, P-D | Ordering test; no handler calls into other entities |
| 8 `game-session.ts` split | P-A (first) | Probe-shape snapshot; goldens unchanged; `verify-full` per step |
| 9 Hash and golden invalidation | P-A | Empty-world hash equals `hashFlight` |
| 10 Save size and migration | P-A (decision), P-E | v3 migration golden; worst-case size test |
| 11 Test runtime under SwiftShader | P-A (hook, defaults), all | Spec wall-time budget; no waits above 30 s; populator opt-in |
| 12 Performance | P-A, P-C, P-H | Sim cost test; populated `budget.spec.ts` row; reference-desktop run |
| 13 Audio | P-G (events reserved in P-A) | `probe.audio`; fake context unit tests; gesture and visibility tests |
| 14 Combat balance drift | P-D, P-F | Constants ledger; worked-example tests; FIDELITY rows |
| 15 Scope creep | P-C | Manifest `notPorted` list; reviewer rejection rule |
| 16 NPC docking and launching | P-C | Recorded decision; dock and launch regression tests with traffic |
| 17 Static bodies, collisions | P-A, P-F | Fixed ids; no duplicate buoys; collision tests after shields |
| 18 Death, pod, insurance flow | P-E | Mode transition tests; atomic profile update golden |
| 19 Leaky interfaces | P-A | Zone lint; read-only types |
| 20 Ship catalogue growth | P-C | Content golden and drift gate |
| 21 HUD element growth | P-D | Layout fixtures |
| 22 Chart freezes sim | P-A / P-D | Decision recorded; hyperspace e2e updated |
| 23 Low-fps slow motion | P-C / P-H | Decision with the todo; AI cost bound test |
| 24 Mass lock and blockage with ships | P-C / P-D | Tests with ships in and out of the radius |
| 25 Torus, launch, docking under traffic | P-A / P-C | Empty-world regression suites; unit traffic variants |

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| P-A split | Probe and hook semantics change | Probe-shape snapshot first; behaviour-preserving commits |
| P-A world model | Order, ids, RNG, hash composition | Canonical id order; forked RNG objects; empty-world hash identity |
| P-B AI framework | Cache, `this`, handler drift | Typed state, generic interpreter, manifest, trace harness |
| P-B steering | Variable vs fixed `delta_t`, float32 | Per-behaviour oracle tests; record each deviation |
| P-C roles and populator | Scope creep, docking queue, assets | Manifest, explicit docking decision, lazy assets |
| P-C performance | Draw calls and GC | Instancing, scratch buffers, grid broadphase |
| P-D combat | Constants, macros, synchronous events | Ledger, parenthesised macros, deferred event queue |
| P-E law and death | Save v3, atomic profile update, flow modes | Ordered migration, single `die()` path |
| P-F collisions | Duplicated static bodies, shapes | Fixed ids, one collision-shape decision, after shields |
| P-G audio | Autoplay, pause coupling, load size | Gesture-created context, one suspend owner, lazy loading, `probe.audio` |
| P-H hardening | QUAL-01 with traffic | Reference-desktop pass with populated rows; record ceilings deliberately |

**Ordering constraints that follow from the above:** P-A (split first, then world model) before everything; the AI framework and the steering port (P-B) before roles (P-C); shields and the damage function (P-D) before collisions (P-F); the save v3 profile fields land with P-E, not earlier; audio event types are reserved in P-A but the audio subsystem can follow combat.

## Sources

Repository (HIGH confidence, read directly):
- `/home/opencode/git/wegolite/.planning/PROJECT.md` (milestone goal; Key Decisions including the AI port, save schema, SwiftShader, load and budget decisions)
- `/home/opencode/git/wegolite/AGENTS.md` (Docker-only gates, conventions)
- `/home/opencode/git/wegolite/.planning/todos/pending/*.md` (collision deferral, chart pause, torus message, below-24-fps, docking test flake)
- `/home/opencode/git/wegolite/src/app/game-session.ts` (3,365 lines; `bindTestHook`, `frame`, `updateProbe`, `pause`/`resume`/`focusLost`, `handleEvent`)
- `/home/opencode/git/wegolite/src/sim/{math,hash,loop,step,time}.ts`, `src/sim/flight/state.ts`, `src/app/game-loop.ts`, `src/app/probe.ts`, `src/persistence/save.ts` (`MAX_SAVE_CHARS` and its worst-case derivation)
- `/home/opencode/git/wegolite/eslint.config.js` (sim zone rules), `playwright.config.ts`, `vitest.config.ts`, `docs/PERFORMANCE.md`, `.planning/reviews/2026-11-09-logic-security-review.md` (P5, P7), `index.html` (CSP), `.planning/STATE.md` (G-03-3 SwiftShader measurements)

Oolite checkout (HIGH confidence, read directly from `/home/opencode/git/oolite`):
- `Resources/Scripts/oolite-priorityai.js` (caches 48-50 and 203-212; `_reconsider`; `_resetReconsideration` 229-239; `applyHandlers` ~250-300; `setPriorities` 570-580; `checkScannerWithPredicate` 689-725; `Math.random` call sites)
- `Resources/Scripts/oolite-populator.js` (priority populators with `deterministic`, `scrambledPseudoRandomNumber`, repopulate frequency tables, station selection and `launchingQueueLength` ~2640)
- `Resources/AIs/oolite-traderAI.js` (priority tree structure, subrole overrides) and the `Resources/AIs/` listing
- `src/Core/Entities/ShipEntity.m` (`update:` 2380-2485; behaviour dispatch 2490-2624; `behaviour_intercept_target` 3817+; `checkScanner` 8448+; `trackDestination` 9450+; `takeEnergyDamage` 11418+; destruction randomness 8013-8099), `ShipEntity.h` (constants and macros), `AI.h:31`, `Universe.m` (update loop 6540-6590), `GameController.h:36`, `Entity.h:49`
- `Resources/Sounds`, `Resources/Music` (sizes), `Resources/Config/customsounds.plist` (vendored copy in `third_party/oolite/Config/`)

External (MEDIUM/LOW, not decisive):
- [Web Audio, Autoplay Policy and Games (Chrome Developers)](https://developer.chrome.com/blog/web-audio-autoplay) — contexts start suspended unless autoplay is allowed; resume after a user gesture (MEDIUM).
- [Autoplay media in headless / devtools protocol (chromium headless-dev)](https://groups.google.com/a/chromium.org/g/headless-dev/c/zxPyN5f8MAQ) — `--autoplay-policy=no-user-gesture-required` switch for headless; behaviour with no audio device not confirmed (LOW; verify in the container).
