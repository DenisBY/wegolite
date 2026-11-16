# Pitfalls Research — Milestone v2.3 Combat and Death

**Domain:** Adding NPC laser fire, ship destruction (wreckage, cargo pods, entity cap, equipment damage), laser/ident hits on stations and buoys, ship-ship and ship-buoy collisions, and player death with game over to an existing deterministic, golden-hashed, Docker-tested browser port of Oolite (TypeScript, Three.js, IndexedDB saves, Phase 14 frozen acceptance run).
**Researched:** 2026-11-16
**Confidence:** HIGH for facts read from this repository and the Oolite checkout (cited by file and line); MEDIUM for performance projections and for two Oolite behaviours flagged below (wreckage lifetime, cargo contents at spawn); no external sources were needed. The research-plan/research-store seam was not used: every finding is from the local source trees, so there is nothing to cache.
**Supersedes:** the v2.0 pitfalls file of 2026-11-11. Its pitfalls 14 (combat constants ledger) and 18 (death, autosave, pause) still apply and are restated here where v2.3 changes them.

How to read this: every pitfall says what breaks, why it is likely *here*, how to prevent it, the warning sign, and the phase that must own it. Phase names are suggestions for the roadmapper (numbering continues at 15):

- **P-Hit** — shared hit/damage/kill funnel and statics (stations, buoys) as laser and ident targets.
- **P-Destroy** — kill path, wreckage, cargo pods, entity cap, equipment damage (CBT-08).
- **P-Fire** — NPC laser fire (decision source, gating, hashed weapon state, acceptance rerun).
- **P-Collide** — ship-ship and ship-buoy collisions.
- **P-Death** — player death, game over, last-save load, autosave/pause/title rules.
- **P-Gate** — verification, acceptance rerun, changelog, FIDELITY and provenance close-out.

---

## Critical Pitfalls

### Pitfall 1: Nobody pulls the trigger — production NPCs have no AI, so "NPC fire" has no decision source

**What goes wrong:**
The milestone says NPCs fire at the player and at each other, but in the shipped game every NPC is `ai: null`. `populate.ts:264` spawns all 12 ships with `ai: null` (Oolite's nullAI), `AI_REGISTRY` holds only `test-pilot` and `flight-script` (`src/sim/ai/registry.ts`), and `stepWorld` skips every entity whose `ai` is null (`step.ts:114`), so the ships do not even steer. The native attack behaviours are ported but call no weapon: `attack.ts` documents that every sub-behaviour "skips Oolite's `fireMainWeapon:`" with the weapon temperature fixed at `NPC_WEAPON_TEMP` (0). The only thing that ever calls `ShipControl.fire` is the test pilot created with `fire: true`. A team that builds hit resolution, damage and destruction and then asks "who fires?" discovers the answer is a scripted test pilot, and the milestone's headline feature is unreachable in a real session.

**Why it happens:**
Phase 13 deliberately built only the shared hit rule (decision A7) and Phase 14 only the steering. The decision layer (priority AI, pirates, police, bounty hunters) is explicitly out of scope ("police, law and pirates; priority AI and traffic" are in the out-of-milestone list). The milestone text reads as if the decision layer exists.

**How to avoid:**
- Make this the first roadmap question, answered with the owner before P-Fire is planned. The honest options are: (a) fire is reachable in production only through a minimal, owner-approved response path (a ship that is hit retaliates, via the native attack behaviour, which is what `respondToAttackFrom:` does in `ShipEntity.m:11482`); (b) fire is proven only in the test world and via the `?test=1` spawn hook, and the milestone says so; (c) a first slice of a role AI is pulled in from the backlog. Do not invent a "shoot on sight" AI to make the feature visible: PROJECT.md says Oolite is the behavioural source of truth and that scope is "the necessary technical minimum, not player visibility".
- Whatever is chosen, record it as a Key Decisions row and a FIDELITY.md divergence; the research default is (a) or (b), not (c).
- Test NPC-versus-NPC and NPC-versus-player fire through the existing hook spawn (`probe-publisher.ts`, T-13-27 taints the session so no save can make a spawned ship durable) rather than only unit tests, so the whole route (steering, fire, resolve, damage, kill, event, HUD) is exercised once end to end.

**Warning signs:**
- A requirement ticked "complete" with evidence that only names `createTestPilotAi`.
- A plan that adds `ai:` to the populator without a Key Decisions row.
- Phase text that says "NPC fire" but no task touches `populate.ts`, `AI_REGISTRY` or the attack behaviours.

**Phase to address:** Roadmap/discuss step, then P-Fire.

---

### Pitfall 2: The Phase 13 "no gate" shortcut becomes 120 Hz laser spam the moment steering calls fire

**What goes wrong:**
Key Decisions row "NPC fire shares only the hit and damage rule" records that an NPC shot has no laser heat, no shot timer, no energy cost and no `auto_weapons`; the only limit on rate is the AI's think interval (15 ticks for the test pilot). That is safe while a think-driven pilot calls `fire`. Oolite's native attack behaviours call `fireMainWeapon:` on *every update* (`ShipEntity.m:4454`, `4575`, `4607`, `4711`, `4821`, `4891`, `5391`), and the rate limit lives in `fireWeapon:direction:range:` (`ShipEntity.m:9930-10010`): `weapon_temp / NPC_MAX_WEAPON_TEMP >= WEAPON_COOLING_CUTOUT` refuses; `energy <= weapon_energy_use * multiplier` refuses; `shot_time < weapon_recharge_rate` refuses; `range > randf() * weaponRange * (accuracy + 7.5)` refuses; `range > weaponRange` refuses; `onTarget:` must pass; a fired shot then spends `energy -= weapon_energy_use` and adds `weapon_shot_temperature` to the facing's temperature, and every shot or miss adjusts `missedShots` (`10360-10440`). Wire `fire` into the ported behaviours without these and every attacker fires at 120 shots per second, kills everything in a few ticks, and drains the player faster than any test will anticipate.

**Why it happens:**
The gate state is exactly what Phase 14 cut (`NPC_WEAPON_TEMP`, `missedShots` fixed at 0 in `attack.ts`, `target.ts:122`, `track.ts:285`). Adding it is not a small change: weapon temperature changes which attack branches are taken (the heating branch at `ShipEntity.m:4122`, `EVASIVE_ACTION`, `RUNNING_DEFENSE` reachability, `COMBAT_AI_WEAPON_TEMP_USABLE` at 4288/4333/4456), and `missedShots` feeds `min_d` in `trackPrimaryTarget:` (`track.ts:399-400`). Those branches are covered by oracle fixtures only at temperature 0.

**How to avoid:**
- Port the gate as Oolite has it, with its state in the entity: `shotTicks`, forward weapon temperature, `missedShots`, and the per-shot energy cost. The Phase 13 A7 row says explicitly that "heat and recharge gates can be added to the NPC path without touching the shared hit rule" — use that, and amend the A7 row.
- Quantise `shot_time` to integer ticks exactly as the player's gate does (`rechargeTicks`, strict `>`; Key Decisions row "Quantise the laser recharge gate"), so the NPC and the player share one gate function.
- Per-shot randomness (`range > randf() * weaponRange * (accuracy + 7.5)`) draws from the shooter's own `combat` stream (D-04), after the cheap deterministic refusals, so the draw count does not depend on other ships.
- Extend the oracle first: new fixtures for every branch that temperature, `missedShots` and energy now reach, written by an agent that has not read `src/sim/npc` (the oracle-independence guard `tests/guards/oracle-independence.test.ts` exists for this). A gate with no oracle is the Phase 14 failure mode.
- NPC energy is also its health (Pitfall 6): a shot costing `weapon_energy_use` makes an attacker weaker with every shot. That is Oolite and must not be skipped to "keep NPCs alive".

**Warning signs:**
- `ctl.fire` called from a behaviour with no `shotTicks` test next to it.
- A fight where a single NPC kills a ship in under a second of simulated time.
- `NPC_WEAPON_TEMP` still a constant after P-Fire.

**Phase to address:** P-Fire (needs P-Hit's single damage funnel first).

---

### Pitfall 3: New hashed entity state forces a third snapshot bump and golden regeneration, and the steering record is frozen

**What goes wrong:**
Every field the milestone needs on an entity is hashed, snapshotted and bounded: weapon temperature and shot timer (Pitfall 2), `missedShots`, cargo contents for pods, a velocity or drift vector for debris and rebounds (Pitfall 9), buoy damage (Pitfall 12). The Phase 14 row on the steering record states the field set is **frozen**: "a later plan that needs another field stops and reports it, because the snapshot shape and the golden would move a third time." Two regenerations already happened (Phase 13: `b23d11d8` to `ab72eedf`; Phase 14: `ab72eedf` to `c1068643`). Adding fields one plan at a time means a bump and a regenerated `tests/golden/world/inert-lave-epoch1.json` per plan, each one a chance to hide a real behaviour change inside "regenerated golden".

**Why it happens:**
`serializeEntity` appends the steering record always (owner decision "option-append"); `WORLD_SNAPSHOT_VERSION` is 3 (`snapshot.ts:80`); `sanitizeEntity`, the parser limits (`limits.ts`) and the snapshot parser all enumerate fields, so each addition touches five files and the version.

**How to avoid:**
- Design every new entity field in one pass at the start of the milestone and ship **one** `WORLD_SNAPSHOT_VERSION` 4 bump with one deliberate golden regeneration, using the Phase 13/14 proof: with the new segments stripped, the section must re-hash to the previous golden (`c1068643`), so no population draw moved.
- Better: hash new state with the "pristine-omit" rule already used twice — `isPristineCombat` appends the player combat line only when non-pristine, and the test pilot adds its `fire` param only when asked. A field that is default for every inert and Phase 14 ship adds no bytes, so `inert-lave-epoch1.json`, `flight-hash-pins.json` and every acceptance world hash unchanged. Use pristine-omit for weapon state and use a single appended segment only for entity kinds that did not exist before (pods, wreckage).
- Reuse existing fields where Oolite does: wreckage lifetime is the wreck's `energy` (`Universe.m:5516`, `[wreck setEnergy:lifetime]`), which Wegolite's `Entity.energy` already holds. Do not add a `lifetime` field.
- Every new bound goes in `src/sim/world/limits.ts` only (single definition site rule) and `sanitizeEntity` must repair it without a `repairs` increment on legitimate values (the acceptance run fails on any repair).

**Warning signs:**
- A second plan in the milestone touching `serialize.ts` or `snapshot.ts`.
- A regenerated golden whose strip-and-rehash does not return the previous hash.
- `MAX_*` constants declared outside `limits.ts`.

**Phase to address:** P-Hit (design the field set), implemented once in P-Destroy/P-Fire.

---

### Pitfall 4: The frozen Phase 14 acceptance run throws on any flyer death and only runs by hand

**What goes wrong:**
`tests/acceptance/detectors.ts:541-545` throws `flyer <id> is gone` when a flyer is dead or missing. The run calls the real `stepSim` with the real hull table, NPC weapons and masses (`runStepOptions`, line 1144) and `combat: undefined`. Any v2.3 path that can destroy or even remove a flyer in those 20 worlds — a collision pass using sphere radii instead of hulls, NPC fire from the ported attack behaviours (the flight-script flyers use `ATTACK_*` behaviours), explosion blast, energy drain from a fire cost — turns "behaviour change" into a thrown exception at tick N of a 21-case, 137-second run. The thresholds (`thresholds.ts`, commit `b33e72f`) and detectors are frozen: changing them needs the `Detector-change-approved-by-owner` trailer. The run is in no gate (`AGENTS.md`; Phase 14 review IN-04) and must be rerun **by hand on the remote test machine** after any change under `src/sim/npc/**`, `src/sim/world/**` or `ships-npc.json`, with the result recorded in the plan SUMMARY. v2.3 touches all three.

**Why it happens:**
The harness assumes immortal flyers and fixes its geometry: all 20 seeds fly near-identical paths, minimum hull clearance 41.41 m (epoch 10), the designed near pass at 83 m, 61,662 attack ticks within 1,000 m of the player. A collision rule that fires on collision-radius spheres (Oolite's cheap first stage) would report contact where hulls are 41 m apart.

**How to avoid:**
- Make the new behaviour inert for the frozen worlds, not the thresholds flexible: gate fire and collision damage on state the harness never sets (an `ai.params.fire` style opt-in like the test pilot's, or "an entity has a laser and `auto_weapons`" read from the compiled record plus an explicit flag on the entity). Then every acceptance world hashes and flies byte-identically, and the rerun is a confirmation, not a negotiation.
- Port collisions as Oolite does — sphere prefilter, then octree against octree (`doOctreesCollide`, `ShipEntity.m:1878-1900`) using the hull table the harness already loads (`realHullTable()`); never sphere-only.
- Rerun `npm run test:acceptance` on the remote machine after every plan that touches the listed paths, and again at P-Gate, and write the 21-of-21 result into each SUMMARY. Do not wait for the milestone end: a failure found at plan 5 of 5 costs a redesign.
- If the harness must change (it should not), bundle the trailer commit with strengthening the waived WINDOWS.md entry 3 (`detectors.test.ts:164-177` asserts only `typeof result === "boolean"`), which its own waiver text says to do "when the acceptance harness is next opened", and rerun all 20 epochs.
- Before regenerating the milestone's own golden, confirm the harness still reports `aiFaulted 0`, `aiDropped 0`, `repairs 0` and the run minimums (40/40/40 arrivals, 23 AVOID_COLLISION entries).

**Warning signs:**
- "flyer … is gone" in a run.
- Any acceptance number moving (`minHullClearance`, attack ticks) with the thresholds untouched — a sign steering changed even if the run still passes.
- A plan summary for a `src/sim/world/**` change with no acceptance line.

**Phase to address:** P-Fire and P-Collide (rerun per plan); P-Gate (final run).

---

### Pitfall 5: Kills made after the commit leave an uncommitted dead entity at the tick boundary

**What goes wrong:**
`stepWorld` ends with `commitWorld`, then `stepSim` calls `resolveShots`, which is where damage lands (`step.ts:162-165`, `sim.ts:120-122`). A kill made while applying hits in `resolveShotHits` marks the entity `dead` but nothing commits until the **next** tick's `stepWorld`. Consequences: `entityRemoved` is emitted one tick late; `snapshotWorld` throws `SnapshotError` "is dead but not committed" (`snapshot.ts:439-443`) for any snapshot taken between ticks, which is how the restorable test snapshots and `advanceTicks` parity tests work; `hashWorld` silently skips the dead entity (`serialize.ts:168`) so the hash and the snapshot disagree; debris spawned from the death and the dead entity coexist in `live` until the next step. Hits that land in the same tick after the first lethal one will also hit a dead entity unless the apply loop checks `dead`.

**Why it happens:**
Until now nothing was ever destroyed (decision N2, "nothing is destroyed this milestone"), so the post-commit position of damage was harmless.

**How to avoid:**
- Commit once more at the end of the combat resolution (a second `commitWorld` inside `stepSim` after `resolveShots`, emitting `entityRemoved` there) so the world is always committed at the tick boundary, or move damage application before the world's commit. Pick one and pin the invariant "no dead entity survives a returned `stepSim`" with a property test over random fights.
- The kill funnel is one function, `killShip(world, victim, killer, cause)`, idempotent on an already-dead entity, emitting exactly one `shipDestroyed`; apply hits in a deterministic order (the existing queue is ascending shooter id) and have each apply check `dead` first.
- Debris is spawned *inside* that function with `spawnEntity` (never throws; it refuses with a closed reason on `storeFull`), so a refused spawn leaves `nextId` and the live array untouched — but it must still consume the same random draws, or the stream position would depend on whether the cap was hit (Pitfall 8).

**Warning signs:**
- A `SnapshotError` in a tick-hash or restore test after combat code lands.
- `entityRemoved` count lagging `shipDestroyed` count by one tick.
- Two `shipDestroyed` events for one id.

**Phase to address:** P-Destroy.

---

### Pitfall 6: Existing tests and goldens encode "nothing is destroyed" and "the player cannot die"

**What goes wrong:**
Two recorded decisions pin the old world: N2 (an NPC at energy 0 stays alive; `resolveShotHits` does `entity.energy = Math.max(0, before - hit.amount)`, `step.ts:343-344`) and "Floor the player's energy at 0 until a death phase exists" (`routeDamage` does `Math.max(0, state.energy - remaining)`, `shields.ts:153`). Tests that fire repeatedly at a pilot, a parked hull or a spawned target, and assert an energy of 0 and `liveEntities` unchanged, will fail or — worse — keep passing while the target silently vanishes. The player floor is documented as "removing the floor is the whole change", but the player death check is **not** a check of `energy <= 0` on the next tick: `rechargeEnergyAndShields` runs at the start of the next tick and lifts energy from 0 to `rate * dt` > 0, so a deferred check would let a dead player live.

**Why it happens:**
Oolite decides death inside the damage function: `PlayerEntity.m:5683-5689` runs `getDestroyedBy:` right after `energy -= amount` when `energy <= 0.0`; `ShipEntity.m:11556-11562` does the same for NPCs.

**How to avoid:**
- Decide the lethal outcome at the moment damage is applied, in the damage funnel, not by polling energy later. Compute `after = energy - remaining` **before** flooring and latch death on `after <= 0`; floor afterwards only for display.
- Make a single `applyDamage(target, amount, source, kind)` for lasers, collisions and (later) heat and blast, so every path shares one death and one internal-damage roll (Oolite's `takeScrapeDamage` also runs the internal-damage loop, `PlayerEntity.m:5747`).
- Grep first: list every test and golden that pins `energy === 0`, `energy 0` after hits, or `liveEntities` after hits, and update them in the same plan that changes the rule, with the Key Decisions rows (N2, the floor, A7) amended in the same commit.

**Warning signs:**
- `Math.max(0, …)` still wrapping an energy decrement after the milestone.
- A death test that steps two ticks after the lethal hit before asserting.
- A fight test whose expected output did not change when kills were introduced.

**Phase to address:** P-Hit (funnel), P-Destroy and P-Death (rule changes).

---

### Pitfall 7: Autosave races a death, and a dead player must not be saved as "docked"

**What goes wrong:**
Four things collide.
1. `snapshotForSave` encodes any non-`inFlight` mode as `docked` (`autosave.ts`: `const mode = state.mode === "inFlight" ? "inFlight" : "docked"`). If death is modelled by a new flight mode, or by a flag with the mode left alone, any autosave after the lethal tick writes a state that does not describe the leg anchor and replaces the one save the player is about to be sent back to. The existing triggers are pre-launch, the docked event, a hyperspace arrival and a purchase; each runs the async `queueAutosave` and none checks for death.
2. The write is asynchronous (`store.write` resolves on transaction commit) while the death path reads. IndexedDB orders a readonly transaction after an earlier readwrite one on the same store, but only if the write's transaction was *created* first; `queueAutosave` awaits an encode and a validator before `store.write`, so a read issued in the same frame can precede the write's transaction and return the previous blob.
3. A dock and a death on the same step. Docking is decided in `stepFlight`; damage in `resolveShots`; the player is a hit target only while `launching` or `inFlight` (`step.ts:273-276`), so a step that docks cannot kill. But a death at tick N followed by steps N+1..N+4 in the same frame (up to `MAX_STEPS_PER_FRAME` 5) could still emit `docked`, which triggers `autosave()` and the station UI (`event-router.ts:215-245`).
4. `?test=1` taint skips every write (`testTainted`), so a death-and-reload browser test with no seeded IDB blob has no "last save" at all.

**How to avoid:**
- One session-level latch (for example `ctx.runtime.playerDead` or a `gameOver` state) set by the death handler **synchronously inside the step that emits `playerDestroyed`**, checked first by `autosave()`, `manualSave()` and `queueSnapshot`, with a probe skip reason (the existing `saveSkipReason` vocabulary: `recovering`, `tainted`, `not-ready`; add `dead`). Same rule as the context-loss guard (QUAL-05, T-07-05): "before any other guard, never a queued snapshot".
- Stop the frame's remaining steps from inside the callback with the existing seam: `ctx.runtime.loop.reset()` called in a step callback makes `advance` stop stepping and return 0 (`game-loop.ts:33-64`, used by `pause()`). Also stop `advanceBehind` (chart open) and `advanceTicks` (its break condition already lists paused/disposed/chart/save-screen; add the death latch).
- Order the read behind pending writes: have the death-load await the last queued write promise (keep it in `ctx.save`), or read through the same serialised revision queue, so "last save" means "last *committed* save, including the arrival anchor that was queued a frame ago".
- Test with an arrival autosave queued, then death in the next frame; and with a seeded IDB blob and no taint (the browser journey pattern `tests/e2e/core-loop.spec.ts` uses IndexedDB fixtures, never the hook).
- Never write on death. The leg anchor is the last save; do not "autosave the death" (Pitfall 18 of the v2.0 file said "autosave once on the post-death dock"; that applies to the later escape-pod milestone, not here).

**Warning signs:**
- `saveWrites` or `saveRevision` increasing between the lethal hit and the reload.
- A reload that restores the pre-fight leg but with the post-death clock.
- A death test that passes only under `?test=1` because nothing is written.

**Phase to address:** P-Death.

---

### Pitfall 8: Debris determinism — draws, ordering, the cap, and Oolite's frame-rate gates

**What goes wrong:**
Oolite's destruction is full of nondeterminism a port must not copy: `add_debris = (UNIVERSE->n_entities < 0.95 * UNIVERSE_MAX_ENTITIES) && ([UNIVERSE getTimeDelta] < 0.125)` (`ShipEntity.m:7939`) depends on the frame time; wreckage needs `n_entities < 0.50 * UNIVERSE_MAX_ENTITIES` (`:8047`); the whole debris block runs only `if (!suppressExplosion && ([self isVisible] || HPdistance2(position, PLAYER position) < SCANNER_MAX_RANGE2))` (`:7930`), so a far-away kill spawns nothing; the random calls use the global RANROT. A port that copies the frame-time gate makes the world depend on the rendering rate (the hash must be equal at 30, 60 and 144 Hz — Key Decisions "Determinism proven by 1/120 s fixed steps"). Wegolite's cap is `MAX_ENTITIES` 256 non-dead dynamic entities (`ids.ts:53`), eight times smaller than Oolite's 2048, and a dozen kills can exceed it: a Cobra Mk III has `n_alloys = sqrt(sqrt(mass / 6000))` (`:7916`) plates, up to 3 wrecks and up to 15 pods.

**How to avoid:**
- Drop the `getTimeDelta` term, port the entity-count terms (they are deterministic) with the Wegolite cap as the scale (record it as a divergence, with the 0.95 and 0.50 fractions kept), and keep the scanner-range-of-the-player condition: it is a function of positions only and it is what keeps far fights cheap.
- Draw everything from the **dying ship's own `combat` stream** (D-04), in a fixed documented order, and draw even when `spawnEntity` refuses with `storeFull`, so the stream position never depends on the cap.
- Spawn order = fixed order inside the kill function (pods in `cargo` index order, then wrecks, then plates); the killer order is ascending shooter id already; ids are monotonic and never reused (Key Decisions), so cross-cadence hash equality holds. Pin it with the existing cadence test at 30/60/144 Hz over a world with kills.
- Do not seed debris from the world stream `world.rng`: it also drives the populator, so a kill would perturb the next arrival's population only if streams were shared; keep them apart. The overlap bound in the v2.0 seed row (`M^2 * D / 2^32`) still applies when many ships draw many values: a 12-ship fight with 30 draws each is far under it, but do not use `forkSeed` streams for Monte-Carlo-style statistics.
- Never call `Math.random`, `Date.now` or `performance.now` anywhere under `src/sim`; the existing guards enforce it.

**Warning signs:**
- A hash difference between cadences only in worlds that contain a kill.
- A cap test where `nextId` differs between "cap hit" and "cap not hit" runs of the same draws.
- A `getTimeDelta`-like parameter appearing in `src/sim`.

**Phase to address:** P-Destroy.

---

### Pitfall 9: Debris and rebounds need a motion model the world does not have

**What goes wrong:**
Entities carry only `speed` along their facing (`entity.ts`: no velocity vector), and an entity with `ai === null` holds its placement (`step.ts:112-114`; row (d): "an entity with no AI is skipped by the integrator and holds its placement and its speed field"). Oolite debris is thrown with a random velocity (`0.1 * ((ranrot % 200) - 100)` per axis plus the parent's velocity, `ShipEntity.m:7857-7862`, `8102-8106`), tumbles (`performTumble`) and is `nullAI`. Spawn it as an inert `ai: null` entity and every pod and wreck is frozen in space exactly where the ship died. Collision rebounds have the same hole: Oolite resolves a collision by changing `velocity` (`adjustVelocity:`) and nudging positions by `t * v` (`ShipEntity.m:11140-11165`); without a per-entity velocity a ship that has been "collided" keeps flying along the same line into the same overlap next tick and takes damage again, every tick.

**How to avoid:**
- Decide the motion model once, alongside the single field-set design of Pitfall 3: either a bounded `velocity` vector on `Entity` (pristine-omit when zero) integrated by the world step for all kinds, or "debris is a tumbling entity with a non-null AI". The first matches Oolite's model (`velocity` plus thrust vector) and also gives rebounds a home. The player already has `FlightState.impulse` (`restoreFromSave` resets it), so the player side exists.
- Collision damage must be applied **once per overlapping pair per contact**: after the rebound the pair separates (Oolite's `v2b < -1` early return when already moving apart, and the position nudge), and a "recently collided" guard prevents a deep overlap from draining a bank at 120 Hz.
- Wreckage "won't collide" and cargo pods do (`canCollide`, `ShipEntity.m:1857-1875`): model that, or ramming debris costs nothing and shooting it does nothing.

**Warning signs:**
- A pod that does not move after a kill.
- Two ships touching for a second and one dying from "scrape" damage.
- Energy dropping every tick while two ships overlap.

**Phase to address:** P-Destroy (debris), P-Collide (rebound).

---

### Pitfall 10: One death path, and everything that has to stop when it fires

**What goes wrong:**
Player death is a session event, not just a simulation event. Things that must all change on the same step, and currently do not know about death: the fixed-step loop (`sim-driver.ts` has no abort besides `loop.reset()`), the chart (`advanceBehind` runs the sim behind the opaque chart and `ctx.chart.chartOpen` must close), the Save/Load screen, a running hyperspace countdown and torus (state in `FlightState`), the ident lock and held keys (a held fire key survives into the loaded game: the warm Load in `save-controller.ts:361-480` never calls `input.clearAll()` because it runs from F2 while docked; `pause`/`resume` and the docked event do), the HUD message queue, the pause menu (`pause()` shows the overlay over a dead scene; `resume()` would restart stepping), focus-loss auto-pause (`pauseOnFocusLoss` defaults on), and WebGL context loss (`enterContextLoss` pauses and `resume` is refused until the context returns).

**Why it happens:**
There are many entry points that act on `ctx.core.state`: `advanceFrame`, `advanceBehind`, `advanceTicks`, the hyperspace controller, the station controller (guards on `ctx.runtime.paused`), the chart controller (`paused` guard at three places), `frame-loop.ts`, and the router. A new flag read in only some of them leaves one that keeps simulating or accepting input.

**How to avoid:**
- Single owner: a `deathController` (or an extension of the session context) with one `onPlayerDestroyed()` and one `gameOver` state that every step entry and every action guard reads, in the same style as the `paused` guard. Enumerate the guards by `rg 'ctx.runtime.paused'` (about 15 sites across `chart-controller`, `station-controller`, `save-controller`, `settings-controller`, `start-session`) and decide for each: ignored, or reads `gameOver` too.
- The state is "frozen, not paused": the pause overlay is not shown over the game-over screen, Escape/P are inert or return to the game-over choices, focus loss does nothing visible, and `resume` cannot restart a dead session. Context loss during game over keeps its existing "resume only by player action" rule.
- Death-load calls the existing warm-Load install block (not a copy): `restoreWorldAnchor`, `createPlayerCombatState()`, messages cleared, dock feedback reset, scene switched, `probe.restore` published — and adds the missing `input.clearAll()` and `loop.reset()`; it must also `end()` the live world when the loaded save is docked.
- Refactor `loadFromSave` out of its F2 gating (`!ctx.save.saveScreenOpen` returns early) into a function the F2 button and the death screen both call; do not duplicate it.
- Handle every saved status: `valid` offers Load last save; `absent`, `corrupt`, `future`, `unreadable`, `unavailable` offer New game and the title only (Key Decisions: a future or corrupt blob stays byte-identical; `canClear` rules; New game asks before deleting a committed save).
- The read is asynchronous. While it is in flight the screen shows "loading", input is ignored, `ctx.save.loadingSave` blocks re-entry, and a disposed session touches nothing (the existing `ctx.runtime.disposed` guards).
- Add a probe field additively (the probe shape is frozen, 121+ e2e specs read it; the shape spec requires every `probe.test` member to be a function): `probe.death` or `probe.gameOver`, and update `probe-shape.spec.ts` under the same sanction as plan 08-16.

**Warning signs:**
- The pause menu or a station key reachable on the game-over screen.
- `probe.paused` true and `probe.mode` still `inFlight` after death.
- A second `playerDestroyed` event after the first.

**Phase to address:** P-Death.

---

### Pitfall 11: Statics are not world entities, so "laser hits the station" and "buoy damaged" have nowhere to live

**What goes wrong:**
The Coriolis and the two buoys are `StaticEntity` records with fixed ids 3, 4 and 5 that "reference `SystemLayout` by key and copy no geometry" and are "never hashed or stored in the dynamic store" (Key Decisions rows D-06/D-07). They have no `energy`, no `dead` flag, no octree, and no hull-table key. The open todo (`2026-11-15-lasers-and-ident-hit-stations-and-buoys.md`) and decision OQ4 say the same. Meanwhile the milestone wants lasers and ident to hit them, ship-buoy collisions to damage both, and Oolite's rule that a buoy can be destroyed. The buoy's drawn model is about 100 m across while its simulation radius is 10 m (`NAV_BUOY_RADIUS`/`WITCHPOINT_RADIUS`), and the old planet/sun/buoy todo calls the buoy collision radius "an owner item".

**How to avoid:**
- Hit and ident targets are added by key, not by entity: extend `HitTarget` (id, specKey, position, orientation) with the three statics, with an octree per static hull in the hull artifact (the content build already computes mass from the hull plus the faceplate, tris and dock subentities, `ShipEntity.m:2034-2041`; the **laser** octree in Oolite also tests subentities at their offsets, which Phase 13's hit rule explicitly did not port, `hit.ts` header "Not ported: the subentity branch"). Decide whether the dock slot is hollow for lasers (it is in the model) before choosing the hull parts.
- The station's pose is not static: it rotates with the clock (`FlightState.stationAngle`, `stationRollRadPerSec`). Use the same pose the renderer and the docking SAT use; do not re-derive it from time with a different epoch.
- Minimum viable and faithful enough: a laser **stops at a static hull** (blocks the beam; nearest-hit comparison against ships) with no damage bookkeeping for the station (Oolite never destroys the main station, `ShipEntity.m:11559`, and law/defence responses are out of scope), and a hit buoy is the only static with state. Per-world buoy damage state goes in the world (hashed pristine-omit) and the static record gets a derived `destroyed` flag read from it; on a new world (launch, arrival, Load) it is gone, which matches "no id outlives its world".
- The compile step owns the numbers: buoy `collision_radius` from the model exactly as Phase 12 plan 12-06 computed NPC radii (float32 square root of the largest squared vertex distance), added to `ships-client.json` beside the mass; never a hand-picked 100. Update the PROJECT.md statics row, the two FIDELITY divergence rows and the layout comment when it changes.
- Ident on statics needs a lock record: the lock event carries the spec key (not an id), the message looks the name up in the compiled records (`IDENT_LOCKED_TEMPLATE`), and the HUD frame reads `identTargetSnapshot` (position and radius). Give statics keys that cannot collide with NPC spec keys, and clear the lock at the usual three boundaries.
- Hit candidates must keep the id of a static distinct from dynamic ids; the target loop currently relies on `target.id !== shot.shooter`, which is safe, but the source-scan guard `tests/guards/entity-id-scope.test.ts` is the proof that no id leaves `src/sim`; keep it green.

**Warning signs:**
- A laser that ends at the station's centre or at a 10 m sphere.
- A buoy that "dies" and is back after a dock with no world change.
- `statics` entries given hashed fields.

**Phase to address:** P-Hit (targets and ident), P-Collide (buoy damage).

---

### Pitfall 12: Ship-ship collision damage ported from the wrong half of the Oolite rule

**What goes wrong:**
Oolite's rule is not "mass and closing speed" in the abstract; it is a specific sequence (`ShipEntity.m:11050-11145`, `collideWithShip`): the relative velocity is projected along `loc`, the unit vector between the entities (`v2b = dot(vel1 - vel2, loc)`); if the pair is already separating faster than 1 m/s it returns with no damage; otherwise `dam1 = m2 * v2b² / 50,000,000` hurts *self* and `dam2 = m1 * v2b² / 50,000,000` hurts the other; damage below 0.05 is ignored; `selfDestroyed = dam1 > energy`; `otherIsStation` shields the station; velocities are exchanged along `loc`; and a still-alive pair is nudged apart by `t * v`. `takeScrapeDamage:` returns early when either side is `STATUS_LAUNCHING` ("no collisions during launches please", `ShipEntity.m:11646`). The player's version applies shields by the side the *other entity* is on, then `energy -= amount`, then the internal-damage loop (`PlayerEntity.m:5707-5748`).

Typical port mistakes: using the speed of the faster ship instead of the relative velocity along the contact normal; applying damage to the wrong side (`m2` into self); dropping the 0.05 floor and the 1 m/s separating rule; colliding launching ships (the player is `launching` for ~6 s inside the launch tunnel with the world already stepping, `sim.ts:102-105`); using the total mass table for stations; sphere-only contact; and double-processing a pair (each pair must be visited once; Oolite removes self from the other's collision list).

**How to avoid:**
- Port `collideWithShip` as a pure function over two bodies (mass, position, velocity, energy) with worked examples computed by hand from the C, in the style of the combat constants ledger (`src/sim/combat/constants.ts`: source line next to every number, a pinning test). Masses come from the compiled `ships-npc.json`/`ships-client.json` records (Phase 10), already tested equal to Oolite's octree masses.
- Candidates: ordered pairs in ascending id, one visit per pair per tick, wreckage excluded, launching excluded, dead excluded, and the stage-one prefilter followed by the octree-against-octree test using the hull table (Phase 14's acceptance detectors use the same two stages, `detectors.ts` stage A and B).
- The existing `Phase 14` AVOID_COLLISION behaviour exists to prevent exactly these contacts; a world where the near-pass (83 m) or the minimum hull clearance (41.41 m) now registers a collision means the prefilter is wrong, not the AI.
- `m1`, `m2` can be zero or missing for a spec key (`massFor` falls back to 0): a collision with a ship of unknown mass must be a no-op, never a division by zero (`v1a = sqrt(v2b² m2 / m1)` in Oolite).
- Keep the Coriolis out of the pairwise pass in this milestone: station contact is the Phase 4 docking SAT (bounce, scrape, dock) and docking-slot scrape damage is explicitly out of scope. In Oolite, ramming the station's hull outside the slot also goes through `collideWithShip` with `otherIsStation` and kills the ram-er at speed (`dam1 = m_station * v² / 5e7` against a 256-energy bank); do not half-add that: decide it explicitly and record the divergence.

**Warning signs:**
- Damage applied while ships are moving apart.
- A pair taking damage on more than one tick for one contact.
- Any `launching` state with a collision event.

**Phase to address:** P-Collide.

---

### Pitfall 13: Equipment damage (CBT-08) has no place in the save, the F3 screen or the app-side profile

**What goes wrong:**
In Oolite, `takeInternalDamage` (`PlayerEntity.m:6097-6180`) rolls cargo first (`damage_to < [cargo count]` destroys a pod of cargo and says "<commodity> destroyed"), then equipment: it picks a damageable item by `damage_probability` (default 1.0; 0 only for missiles, mines, the passenger berth, cargo bay and a few others, `equipment.plist`), **removes** the key and **adds `<KEY>_DAMAGED`** "for possible future repair", then a cosmetic roll on `ship_trade_in_factor`. Wegolite has none of the surrounding structure:
- The equipment list lives in the app's `PlayerProfile` (`ctx.core.profile.equipment`), read by the sim as a read-only set rebuilt only when it changes (`equipmentSet()`, "Ownership travels beside the command, never inside it"). The sim cannot mutate it; it can only emit an event and let the app mutate the profile, and the set must be invalidated.
- A `_DAMAGED` key is rejected by the save validator (`FORBIDDEN_EQUIPMENT`, `save.ts:435`, and the equipment allow-lists), so storing it needs a save schema v5 and the F3 screen needs a row for it.
- Repair is CBT-12, outside this milestone, so a stored `_DAMAGED` equipment is a permanent loss with no way to fix it other than re-buying.
- Lasers are not in `equipment`; they are in `laserMounts`, so Oolite's weapon damage has no direct equivalent.
- The player has no per-entity random stream and `stepPlayerCombat` "never reads a random stream"; the internal-damage roll uses `ranrot_rand() & 31 < amount` repeatedly per hit (`PlayerEntity.m:5692, 5747`).
- Docking computer removal mid-run (the `removeEquipment` path cancels it in Oolite) needs the flight state's docking-computer state cleared.
- `ship_trade_in_factor` does not exist (`n_considered = (n_cargo + n_mass) * ship_trade_in_factor / 100`).

**How to avoid:**
- Decide minimal and faithful in one Key Decisions row before coding: the recommendation is **remove the key** (the player can buy it again at F3) rather than store `_DAMAGED`, with the divergence recorded, because storing damage requires a save bump plus a repair path this milestone does not have. The alternative (a v5 save with `_DAMAGED` keys) is cheap to add later when CBT-12 exists; the reverse is not.
- Roll internal damage inside the sim from a stream owned by the combat state, seeded `forkSeed(worldSeed, PLAYER_ID, "combat")` when a world is created, hashed only when non-pristine (like `isPristineCombat`). Never `Math.random`, and never the world stream (that would change the populator's draws on the next world).
- Port the roll exactly: per hit, `while (amount > 0) { if ((draw & 31) < amount) internal damage; amount -= 32 }`, cargo-first, equipment by `damage_probability` from the compiled `equipment.json`, cosmetic branch dropped (record it).
- The sim emits `equipmentDamaged { key }` and `cargoDestroyed { commodity }` events; the app applies one atomic profile update (the `applyFit` style), invalidates the equipment set, cancels docking-computer state, and prints Oolite's message (`@-damaged`, `@-destroyed`, `descriptions.plist`). A save written right after (arrival autosave) must see the updated profile: assert that with a test.
- The `?test=1` hook taints on mutation; do not add a debug path that damages equipment without tainting.

**Warning signs:**
- A `_DAMAGED` string in a profile with no migration and no F3 repair row.
- The sim importing the profile type.
- Equipment loss that survives a death reload (it should not: a load restores the profile of the last anchor).

**Phase to address:** P-Destroy (the internal-damage roll and events), P-Death (the app-side apply).

---

### Pitfall 14: Pod contents and NPC cargo do not exist; inventing a hashed commodity field is the expensive way

**What goes wrong:**
Oolite NPCs hold a `cargo` array filled at spawn according to a cargo flag (`ShipEntity.m:7318-7370`, `getContainersOfGoods:scarce:legal:`, the system's market), and `releaseCargoPodsDebris` (`ShipEntity.m:7814-7882`) throws each item out with a 70 % chance that drops by 30 points per survivor for an NPC (20 for the player), at most 15 pods. Wegolite NPCs have no cargo, the populator sets no cargo flag, and the pods cannot be scooped or identified in this milestone (scooping is CBT-11, out of scope). Adding commodity and quantity to every pod and cargo to every NPC changes the spawn draws (the inert world golden, plus populate order), the hash and the snapshot, to build state nobody can observe.

**How to avoid:**
- Be explicit: the observable part of "cargo pods by Oolite's cargo rule" is the count and the survival probabilities. Port the `cargo_chance` decay and the 15 limit exactly as a function of the number of cargo items; take the number of items from the compiled record's cargo capacity or `likely_cargo` (a content-build field, not a hashed one), generate the count lazily **at death** from the dying ship's own stream, and leave the commodity out of hashed state this milestone. State the choice in a Key Decisions row; CBT-11 then adds a commodity field in its own snapshot bump with the consumer present.
- Re-check Oolite's `cargo_type` and `cargo_carried` per hull before deciding the count: this research did not verify per-hull cargo capacities for the nine compiled records (MEDIUM).
- Spawn a pod as `kind: "cargo"`, scan class `CLASS_CARGO`, which the mass-lock and jump-blockage code already treats as non-locking (`NON_LOCKING_SCAN_CLASSES` includes it), and wreckage as `CLASS_NO_DRAW`, also non-locking; both have no entry in `shipMasses`, so they never block a jump (Oolite's own check counts any ship with enough mass, `ShipEntity.m:12498-12531`; a pod or chunk is far too light to matter).
- Do not leave the mass-lock check blind: a hulk that still has mass (a dead Anaconda's wreck) should not become a hidden jump blocker in either direction; test both.

**Warning signs:**
- A new `commodity` field in `serialize.ts` with no reader.
- A populate golden change from a debris plan.
- Jumps refused next to wreckage.

**Phase to address:** P-Destroy.

---

### Pitfall 15: The Oolite scripting/AI messages that make a fight a fight are not there

**What goes wrong:**
When an NPC is hit, Oolite does much more than subtract energy: `ShipEntity.m:11418-11560` records the aggressor (`setPrimaryAggressor:`, `setFoundTarget:`), calls `respondToAttackFrom:` (the AI's ATTACKED message), notifies group members (traders and escorts call their leader, pirates get a 50 % chance to help, police alert the whole group), marks attackers of police as offenders, and makes a group avoid friendly fire by switching the hunter to `ATTACK_FLY_FROM_TARGET`. Death calls `noteTargetDestroyed:` on the hunter and `noteKilledBy:` (`ShipEntity.m:7768-7773`). Without any of it, damage is just a number going down; with all of it, the scope is the backlog (priority AI, law). The risk is the middle: half-porting these notifications creates pairwise hidden dependencies that look like fidelity and are not.

**How to avoid:**
- Port only the notification that a native behaviour in the scope list needs to function: the victim learns who hit it (a hashed `nav.targetId` already exists) and an attacker whose target died loses it (`shipTargetLost` is already an event the steering posts; see divergence 5). Everything else is a recorded cut.
- Dead targets: ids are never reused (monotonic counter, no alias), so a stale `targetId` is safe to read but not to use. The behaviours treat "a target the view does not hold" as lost (the test pilot does, `test-pilot.ts` header). Verify each ported behaviour does, including escorts whose leader dies (divergence 7: "an inert leader refreshes nobody"; a follower of a dead leader keeps its last formation destination forever unless handled), the proximity alert naming a dead ship (divergence 17), the ident lock (`updateIdentTarget` already drops a lock whose ship left the world) and the tracking curve (restarts at `setTarget`).
- Keep the aggressor and friendly-fire rules out unless P-Fire's decision (Pitfall 1) requires them.

**Warning signs:**
- A behaviour reading `world.store.get(targetId)` without handling `undefined`.
- Followers of a dead leader orbiting a dead ship's last position.
- An event queued to a removed id at drain time (it is skipped, but is it counted as dropped?).

**Phase to address:** P-Fire, P-Destroy.

---

### Pitfall 16: AI fault containment does not cover the new combat code

**What goes wrong:**
FOUND-15 contains a throw only from an AI module's `think` or `onEvent`: `invoke` is the one `try/catch` in `stepWorld`, and the comment says "nothing else here has a try/catch, so a defect in the simulation itself still throws". `steerShip` (native steering) is "total (tests/sim/npc/steering.property)" and uncontained, and `resolveShots` is not wrapped. New fire, kill, debris and collision code runs in exactly those uncontained places. A throw there (an unloaded hull table, a bad octree, a division by zero in the damage formula, a `spawnEntity` result misread) aborts the fixed step inside the frame loop and takes the session down, with no `aiFaulted` event.

**How to avoid:**
- Keep the totality discipline: every new function in `src/sim/combat` and `src/sim/world` returns a result or ignores bad input, never throws; extend the property tests (`fast-check`, which is already a dev dependency) to random fights, random hull tables with missing keys (the "not loaded" state), zero and negative masses, non-finite positions and a full store.
- Do not widen the containment: catching in `stepSim` would hide real defects and change the hash. If a new path legitimately needs containment (calling an AI hook on death), add it inside `invoke` as a new `AiFaultSite` and keep the single containment point.
- Hull data is lazy: the same "not loaded, cannot be hit" rule must apply to collision and to a station hull; the lazily loaded artifact is absent until traffic content finishes loading.
- Record `aiFaulted` somewhere (todo IN-02: it is "recorded nowhere"); a fire-and-damage defect would otherwise degrade silently into a ship that stops fighting.

**Warning signs:**
- A `?.` or `!` on the hull table in damage code.
- A test that passes only because the hull table is loaded.
- An `aiFaulted` count nobody reads.

**Phase to address:** every phase (property test), enforced at P-Gate.

---

## Moderate Pitfalls

### Pitfall 17: The entity cap, scans and instanced render with hundreds of debris entities

**What goes wrong:**
`MAX_ENTITIES` is 256 and `NPC_INSTANCE_CAPACITY` equals it per primitive (`npc-ships.ts`), "contacts beyond it are dropped in order". Per-shot cost: `resolveShotHits` builds the candidate list for every shot with `targets.filter(...)` and runs the octree descent for each target that passes the sphere stage (`O(shots * ships)`); `view.scan` sorts all hits on every call and walks `candidateIds()` (every kind), so a test pilot or a ported behaviour that scans each think over 200 pods sorts 200 entries; `createShipField` loops all live entities twice per tick (`massLocked`, `blocks`); a pairwise collision pass is `n(n-1)/2` = 32,640 pairs at the cap per tick, 3.9 million pair tests per second. Rendering: each new model adds instanced primitives that "always cost their calls" (no frustum culling) against the 50-draw-call budget (`BUDGET_CEILING`; the NPC layer already uses up to 13), and `LASER_SHOT_POOL` is 32 shots, one `LineSegments`, with a 33rd overwriting the oldest.

**How to avoid:**
- Filter by kind in the scan (`ScanFilter.kinds` exists) and never feed pods and wreckage to the targeting, ident, steering or proximity candidates unless Oolite does (Oolite excludes `CLASS_CARGO` and `CLASS_ROCK` from several scans, `ShipEntity.m:8493-8520`). Add a dedicated test: a ship in a field of 200 pods still picks a ship as its target.
- Use an allocation-free pair loop with a cheap axis-sorted early-out and exclude wreckage and static-like entities before pairing; budget a measured maximum (say 0.3 ms per tick at 256 entities) and assert it in a Vitest benchmark guard or document it in `docs/PERFORMANCE.md`; do not claim real-GPU numbers, the containers run SwiftShader (QUAL-01 still open).
- New kinds must share a primitive model: one pod model with several instances, one wreck/chunk model; every extra model is draw calls and cold-start bytes. Check the traffic-on cold start (8,855,706 bytes against 9,437,184, headroom 581,478): new content loads lazily after the first in-flight frame (the Phase 12 latch), so keep it out of the boot `Promise.all`, and measure with `tests/e2e/budget.spec.ts`. New model files and textures are vendored only through the human-run `scripts/vendor-oolite.sh` with the cross-check, recorded in `ASSETS.md` and `NOTICE`.
- The event/shot volume: NPC `laserFired` events at the router, the pool of 32 and the HUD throttle (`shouldEmitThrottledMessage`, one message per kind per simulated second) mean a fight does not flood messages; keep damage messages in the same throttle.

**Warning signs:**
- `budget.spec.ts` draw-call count creeping up with each model.
- A scan sorted over every entity per think.
- A cold-start byte count that moved.

**Phase to address:** P-Destroy, P-Collide, P-Gate.

---

### Pitfall 18: Save schema — resist bumping it, and keep the death flow within v4

**What goes wrong:**
Save v4 holds `laserMounts`; combat state is deliberately not saved ("a Load starts pristine"). Death needs nothing new in the save (the last save is the anchor). The temptation is to add `legalStatus`, a death record, a damaged-equipment list or a "dead" mode, each a schema bump with an ordered migration chain (`v1 -> ... -> v4` exist), and "a save holding a newer version is inert and byte-identical" for older builds.

**How to avoid:**
- Stay on v4. Equipment damage as key removal (Pitfall 13) and a death that loads the anchor need no save field. If a field is truly unavoidable, extend only with the v3→v4 pattern: additive, migration to the neutral value, shared semantic validator for the writer and the parser, a worst-case size check against the 65,536-character cap (the v3 worst case is 40,427).
- Do not save NPCs or debris; entity ids still do not outlive a world, and the saved `nextEntityId` is the anchor counter, which debris spawned mid-leg never moves (it is read after populate).
- A save written at the arrival tick contains a profile that includes damage taken en route; the dead profile is never written (Pitfall 7).

**Warning signs:**
- A plan titled "save v5".
- `SAVE_VERSION` changed in a combat plan.

**Phase to address:** all, enforced by review.

---

### Pitfall 19: Oolite's death is not the whole of "game over"

**What goes wrong:**
In Oolite the player's death is `getDestroyedBy:` (`PlayerEntity.m:6187-6240`): it returns at once if the ship is docked ("Can't die while docked"), sets `energy = 0`, disengages autopilot, calls `noteKilledBy:` before the explosion, `becomeLargeExplosion:4.0` (which sets `STATUS_DEAD`), moves forward 100, resets rates and velocity, clears messages, plays game over, **removes all equipment** ("No scooping / equipment damage when dead") and shows the game-over screen. The escape pod branch runs *before* this when a pod exists (not in this milestone, Escape stays inert). The loop of "load the last save" belongs to the front end (`playerFileToLoad`), not the ship.

**How to avoid:**
- Port: no death while docked; death clears autopilot (docking computer state), the countdown and the ident lock; equipment is not touched in the app's persistent profile (the loaded save restores it anyway).
- The player's dead state must not be hit again, collide, or emit more `shipHit` events (the `STATUS_DEAD` early returns, `PlayerEntity.m:5607`); a later NPC shot in the same tick must not produce a second `playerDestroyed`.
- The dying scene is drawn for a moment (the explosion, the 100 m move, the speed set to 160) before the game-over screen; the minimum is a held frame with the game-over overlay, not an animation. The explosion visuals are not in the milestone's target list; do not add particle systems to make death feel finished.
- Oolite's text for the screen is part of its data (`descriptions.plist` "gameoverscreen"/"game-over"); take the wording from there and keep it in the app (events carry no strings).

**Warning signs:**
- A death while `mode === "docked"`.
- Two `playerDestroyed` events in one frame.
- Hand-written game-over copy that differs from `descriptions.plist`.

**Phase to address:** P-Death.

---

### Pitfall 20: Wreckage lifetime and other Oolite mechanics read wrong from the first look

**What goes wrong (MEDIUM confidence, verify before coding):**
- Wreckage lifetime is not a timer. `addWreckageFrom:` sets the wreck's `energy` to the lifetime (`Universe.m:5516`, 50-425 energy units for a full wreck, 125-325 for a hull chunk), sets `ship_temperature` to 1000 and a huge insulation (1e7), and `ShipEntity.m:2271-2272` runs `takeHeatDamage: delta_t * ship_temperature` while the temperature is above `SHIP_MAX_CABIN_TEMP`. Read literally that is a drain of about 1000 energy per second, so a wreck would last a fraction of a second. Check the arithmetic against the cooling branch (`:2262-2268`) and the model's actual drawn behaviour before choosing a lifetime; copy the mechanism, not a guess of "a few seconds".
- `canCollide` is false for wreckage, so wreckage is not a laser target either (`firstShipHitByLaserFromShip` requires `canCollide`, `Universe.m:5560`). Pods collide and can be shot.
- The cargo-pod and alloy models are separate hulls with their own octree, mass and radius. Without octrees in the hull artifact they are "not loaded" and cannot be hit or collided; the artifact is 89,673 bytes with a 200,000 gate, a new hull set grows it.
- Oolite's momentum from an explosion (`dealMomentumWithinDesiredRange: 0.125 * mass` within `collision_radius * 2.5`, `ShipEntity.m:8125`) pushes neighbours; do not port it unless a velocity model exists (Pitfall 9).
- Oolite's blast damage with distance falloff (`dealEnergyDamage:atRange:`, `:7599-7660`) belongs to missiles, mines and energy bombs, which are out of scope; do not apply it to a dying hull.

**How to avoid:** read each cited block before the plan, quote the line numbers in the plan, and add a FIDELITY.md row per mechanic ported or cut. The existing contract test (`tests/contract/fidelity.test.ts`) requires each divergence cell to quote a Key Decisions row; budget that documentation per plan.

**Phase to address:** P-Destroy.

---

### Pitfall 21: Tests that are too slow or too tied to browser timing

**What goes wrong:**
The CI `verify-full` run took 23.9 minutes on 134 specs; its Chromium specs run 2.5-3x slower than on the remote machine because WebGL is SwiftShader; the CI todo says to raise a spec's timeout at 60 % usage and to shard at 35-40 minutes. Combat and death are exactly the kind of feature that tempts ten new e2e specs. The simulation runs at about 0.1x real time in headless Chromium, so a fight "played in real time" in a spec is infeasible; the manual clock (`?test=1&clock=manual`, `advanceTicks`) exists for this, but it taints the session so no save is written, and the hook refuses while paused or behind an overlay.

**How to avoid:**
- Put the logic in Vitest and keep browser specs to the integration lines only: one death-and-reload journey with a seeded IndexedDB blob (not `?test=1`, no taint); one game-over guard spec for pause, chart and save-screen inertness; one NPC-fire spec using the hook spawn. Everything else — damage formulas, gate, cap, debris, collision, kill funnel — in unit and property tests.
- Do not assert on SwiftShader timing; assert on probe counters and simulated tick counts.
- Browser tests run only against the browser-test bundle (`npm run build:e2e`, traffic off by default; `?test=1&traffic=1` opts in).
- Remember the gate rules: pure `src/sim` plans need test, lint and typecheck; `src/app`, `src/render`, `src/input`, `src/ui` plans need `verify` on the remote machine; `verify-full` for render, input, persistence or network-guard changes and for the release. The milestone changes persistence-adjacent code (death load) and render, so plan at least one `verify-full` before release and run the acceptance run by hand (Pitfall 4).

**Warning signs:**
- A spec that waits on `flightTime` in a loaded SwiftShader tab.
- New specs that use more than 40 % of their timeout on CI.

**Phase to address:** every phase; P-Gate.

---

### Pitfall 22: HUD, probe and event router are closed sets

**What goes wrong:**
`ROUTED_EVENT_KINDS` and `EVENT_KIND_SUBSCRIBER` are closed literal lists (a reserved kind is not routed); `shipHit`, `shipDestroyed`, `playerDestroyed`, `shipSpawned`, `entityRemoved` are not routed today. The HUD has exactly eleven elements and a pinned layout; the probe shape is frozen; the router has a pinned subscriber order. Adding a damage readout, a "target destroyed" line or a game-over element in the obvious way breaks one of these pinned tests.

**How to avoid:**
- Route new kinds by editing the table (typecheck enforces completeness) and name the subscriber; keep the subscriber order pinned. Put messages in the existing `hudMessages` subscriber and its per-kind throttle. Put the game-over screen in a DOM overlay (title/pause style), not a twelfth HUD element (Key Decisions: "no twelfth HUD element").
- Events carry ids valid only for the world and tick that emitted them; the router must not store them (the guard enforces it). For `shipDestroyed` the app needs the spec key and position, not the id.
- Add probe fields additively and extend `probe-shape.spec.ts` in the same plan under an explicit sanction note, as plan 08-16 did.

**Warning signs:**
- A `HUD_ELEMENTS` length change.
- An id in `ctx` state outside the ident record.

**Phase to address:** P-Destroy, P-Death.

---

## Minor Pitfalls

### Pitfall 23: Units and constants drift (carried from the earlier combat ledger)

**What goes wrong:** Oolite macros are unparenthesised or instance-dependent: `SHIP_ENERGY_DAMAGE_TO_HEAT_FACTOR (mass > 400000 ? 200000 / mass : 0.5)` (`ShipEntity.h:67`), `PLAYER_INTERNAL_DAMAGE_FACTOR 31` (`PlayerEntity.h:331`), `COMBAT_AI_WEAPON_TEMP_USABLE`, the 50,000,000 divisor. A damage constant typed from memory is a finding waiting to happen.
**Prevention:** every constant goes in `src/sim/combat/constants.ts` with its Oolite file and line, and a pinning test; expand macros by hand and check against a worked example; no feel-tuning.

### Pitfall 24: Message and presentation flood

**What goes wrong:** one `shipHit` per NPC hit at 120 Hz in a fight prints a wall of text.
**Prevention:** reuse the per-kind one-second gate; Oolite prints "damaged"/"destroyed" for equipment/cargo only.

### Pitfall 25: Provenance of any new asset

**What goes wrong:** pods, alloy plates, wreckage and effect textures are new vendored content.
**Prevention:** human-run `scripts/vendor-oolite.sh`, SHA-256 cross-check against the pinned commit, `CHECKSUMS.sha256`, `ASSETS.md`/`NOTICE` rows, `check:dist` for dev-only code, and `assets:check` drift. Read behaviour from the checkout, consume data from the vendored copy.

### Pitfall 26: Changelog, version and documents

**What goes wrong:** user-visible combat and death ship with no `CHANGELOG.md` entry; `.planning` documents drift into the player's language.
**Prevention:** add `## [Unreleased]` entries in the same commit, in English; the milestone is a pre-1.0 minor release and the death rule is a breaking behavioural change worth calling out.

---

## Technical Debt Patterns

| Shortcut | Immediate benefit | Long-term cost | When acceptable |
|----------|-------------------|----------------|-----------------|
| Add each new entity field per plan | Small diffs | Three more snapshot bumps and goldens | Never; design once (Pitfall 3) |
| Kill an entity without committing | Smaller change | Snapshot throws, late `entityRemoved` | Never (Pitfall 5) |
| Sphere-only collision | Faster to write | Acceptance run throws, false contacts | Never (Pitfall 4, 12) |
| Fire from behaviours without the gate | NPCs visibly fight | 120 Hz spam, oracle gaps | Never (Pitfall 2) |
| Store commodity on every pod | "Complete" pods | Unobservable hashed state, populate golden churn | Until scooping exists (Pitfall 14) |
| Equipment `_DAMAGED` keys | Faithful names | Save v5 and no repair path | Only when CBT-12 is planned (Pitfall 13) |
| Copy `getTimeDelta` gates | Faithful code | Frame-rate-dependent world | Never (Pitfall 8) |
| A second Load implementation for death | Quicker | Two restore paths drift | Never (Pitfall 10) |
| Test combat in browser specs | Real rendering | CI at 35-40 minutes, SwiftShader flakes | Only the three integration specs (Pitfall 21) |

## Integration Gotchas

| Integration | Common mistake | Correct approach |
|-------------|----------------|------------------|
| `stepSim` order | Damage applied after commit | One commit after resolution; "no dead entity survives a step" invariant |
| Hyperspace jump step | Resolving hits on the tick the world is skipped | The jump step draws beams and hits nothing (`worldStepped` false); keep it |
| Player in `launching` | Colliding or being hit inside the tunnel | Oolite exempts `STATUS_LAUNCHING` from scrape damage; the player is a laser target while launching today (`step.ts:273-276`): decide and record |
| Static ids vs dynamic ids | Putting buoys into the dynamic store | Candidates by key, per-world state only for damage (Pitfall 11) |
| App profile vs sim | Sim mutating equipment/cargo | Sim emits events, app applies one atomic profile update |
| Autosave vs death | Writing on death or racing the read | Death latch first in every guard; read behind pending writes |
| Pause vs game over | Overlay and `resume` over a dead session | Game over is a frozen session state, not a pause |
| Acceptance harness | Letting any flyer die | Opt-in gating; rerun by hand on the remote machine |

## Performance Traps

| Trap | Symptoms | Prevention | When it breaks |
|------|----------|------------|----------------|
| O(n^2) pair collision with allocations | Frame time spikes in a crowded fight | Allocation-free loop, kind and class filters, wreckage excluded | Around 100-256 live entities |
| `scan` over pods | Targeting slow, picks pods | `kinds` filter, class exclusions | Tens of pods per kill |
| Per-shot `targets.filter` | GC pressure in fights | Build candidates once per tick | Many shooters |
| Draw calls per new model | Budget spec fails | Shared pod and wreck models, instanced | Each model adds calls |
| Laser pool 32 | Shots vanish early | Accept (presentation) or raise with a measured reason | 33 simultaneous shots |
| Cold-start bytes | `budget.spec.ts` ceiling | Lazy load after first in-flight frame | Any boot-path import |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| A command-supplied damage, energy or equipment value | A forged value mints health or removes equipment | Damage and death come only from the sim; commands carry no combat numbers (T-04-19 rule) |
| Trusting a stored blob after a death-load | A corrupt or future save loaded on the death screen | Same `parseSave`, allow-lists and status gates as boot; future blob stays byte-identical |
| New hook mutation without taint | A debug spawn becomes durable | Every hook mutation sets the taint, which skips autosave (T-13-27) |
| Unbounded entity creation | Memory/time | `spawnEntity` refuses at the cap; counters never reused |
| Content from the network | Licence and CSP | Vendor by the sanctioned script only; `connect-src 'self'` stays |

## UX Pitfalls

| Pitfall | User impact | Better approach |
|---------|-------------|-----------------|
| Instant restore with no game-over screen | Player cannot tell what happened | A held frame and a game-over overlay with Load last save and New game |
| Death returns to a pre-fight anchor with the same fight waiting | Death loop (the arrival autosave is a witchpoint anchor and the arrival world is regenerated deterministically) | Accept as authentic and note it; do not re-roll the world to hide it |
| Silent equipment or cargo loss | Player confused | Oolite's `@-damaged` and `@-destroyed` lines |
| Pods that cannot be collected | Look like loot | Accept for this milestone; do not add placeholder scooping |
| No save exists on death | Dead end | Offer New game and the title; never offer a Load that cannot work |

## "Looks Done But Isn't" Checklist

- [ ] **NPC fire:** a real session produces NPC shots, or the owner has accepted that it is test-world only (Pitfall 1).
- [ ] **Gate:** NPC fire has shot timer, heat, energy cost and `missedShots`, with oracle fixtures (Pitfall 2).
- [ ] **Kill:** one `shipDestroyed`, one `entityRemoved`, no dead entity at a returned `stepSim`, snapshot works between ticks (Pitfall 5).
- [ ] **Debris:** hash equal at 30/60/144 Hz with kills; spawn refused at the cap leaves draws unchanged (Pitfall 8).
- [ ] **Motion:** pods and wrecks move; a collision does not repeat every tick (Pitfall 9).
- [ ] **Statics:** a laser stops at the station and at a buoy; ident locks both; buoy radius is compiled (Pitfall 11).
- [ ] **Collision:** launching exempt, separating exempt, once per pair, octree stage used (Pitfall 12).
- [ ] **Death:** lethal damage decides in the funnel, game over freezes the sim, autosave refuses, pause and chart inert, load restores and clears held keys (Pitfalls 6, 7, 10).
- [ ] **Equipment:** a hit can remove equipment, the profile and the equipment set agree, a save after it is valid (Pitfall 13).
- [ ] **Acceptance:** 21 of 21 on the remote machine at every plan touching `src/sim/npc/**`, `src/sim/world/**`, `ships-npc.json`, and at P-Gate (Pitfall 4).
- [ ] **Goldens:** at most one new snapshot version and one regeneration, strip-and-rehash proven (Pitfall 3).
- [ ] **Docs:** Key Decisions rows (A7, N2, the floor, statics) amended; FIDELITY rows; CHANGELOG; provenance (Pitfalls 25, 26).

## Recovery Strategies

| Pitfall | Recovery cost | Recovery steps |
|---------|---------------|----------------|
| A golden regenerated more than once | MEDIUM | Revert to the single design; redo with strip-and-rehash |
| Acceptance fails after a combat plan | MEDIUM | Bisect by plan; restore opt-in gating; rerun on the remote machine |
| Death writes a save | HIGH for the player's progress | Add the latch; the overwritten anchor cannot be recovered, so test before release |
| Equipment `_DAMAGED` shipped | HIGH | Schema bump with migration, F3 repair row |
| Debris frozen in space | LOW | Add the motion model (if the field set was designed once, no bump) |
| Snapshot throws after kills | LOW | Commit after resolution |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention phase | Verification |
|---------|------------------|--------------|
| 1 Decision source | Roadmap, P-Fire | Key Decisions row; hook-spawn end-to-end spec |
| 2 Fire gate | P-Fire | Oracle fixtures; fire-rate unit tests; gate shared with the player |
| 3 Hashed fields | P-Hit design, P-Destroy | One snapshot version; strip-and-rehash |
| 4 Acceptance harness | P-Fire, P-Collide, P-Gate | 21/21 by hand on the remote machine, recorded in SUMMARY |
| 5 Commit order | P-Destroy | Invariant property test |
| 6 Old pins | P-Hit, P-Destroy, P-Death | Grep list of pinned tests, rows amended |
| 7 Autosave race | P-Death | Skip reason `dead`; arrival-then-death test; seeded blob e2e |
| 8 Determinism | P-Destroy | Cadence hash test; cap test |
| 9 Motion | P-Destroy, P-Collide | Drift test; single-contact test |
| 10 Death path | P-Death | Guard inventory; probe field; game-over spec |
| 11 Statics | P-Hit, P-Collide | Beam stops at statics; compiled buoy radius |
| 12 Collision rule | P-Collide | Worked examples from the C |
| 13 Equipment damage | P-Destroy, P-Death | Atomic profile update test |
| 14 Pod contents | P-Destroy | Count rule; no new commodity field |
| 15 Notifications | P-Fire, P-Destroy | Dead-target handling in each behaviour |
| 16 Containment | all | Property tests, totality |
| 17 Performance | P-Destroy, P-Collide, P-Gate | Budget spec, cold-start bytes |
| 18 Save schema | all | `SAVE_VERSION` unchanged |
| 19 Death mechanics | P-Death | Docked immunity; single event |
| 20 Wreckage details | P-Destroy | Quoted lines; FIDELITY rows |
| 21 Test cost | all | CI minutes; three integration specs |
| 22 Closed sets | P-Destroy, P-Death | Router table, probe shape |

## Phase-Specific Warnings

| Phase topic | Likely pitfall | Mitigation |
|-------------|---------------|------------|
| Hit funnel and statics | 3, 6, 11 | One `applyDamage`; design the whole field set; compiled static hulls |
| Destruction | 5, 8, 9, 13, 14, 17, 20 | Commit after resolution; own-stream draws; motion model; remove-key equipment; count-only pods |
| NPC fire | 1, 2, 4, 15, 16 | Owner decision on the trigger; the Oolite gate; opt-in; acceptance rerun |
| Collisions | 4, 9, 12, 17 | Octree stage; launching exempt; once per pair; statics excluded |
| Player death | 6, 7, 10, 13, 19 | Funnel decides; latch; one controller; reuse Load |
| Close-out | 4, 21, 25, 26 | Acceptance, `verify-full`, changelog, provenance |

## Research Flags for Phases

- **NPC fire (P-Fire):** needs deeper research and an owner decision first (Pitfall 1); also needs the oracle extended before porting.
- **Statics (P-Hit/P-Collide):** needs a small spike: build octrees for the Coriolis (with the dock slot) and the buoy at build time and check beam behaviour at the dock mouth.
- **Equipment damage (P-Destroy):** needs the owner's choice between key removal and `_DAMAGED` (Pitfall 13).
- **Destruction details (P-Destroy):** read `becomeExplosion` and `releaseCargoPodsDebris` end to end before planning; verify wreckage lifetime arithmetic (Pitfall 20) and per-hull cargo capacity (Pitfall 14).
- **Collision (P-Collide) and death (P-Death):** standard once the above are decided.

## Sources

All HIGH confidence unless noted; every claim was read in the working tree.

- Project: `.planning/PROJECT.md` Key Decisions (rows on the world store, entity ids, snapshot versions 2 and 3, A6/A7/N2, the energy floor, statics OQ4, the Phase 14 steering, divergences and acceptance rows, the autosave and Load rows, QUAL-05, probe shape, HUD), `AGENTS.md`, `.planning/WINDOWS.md` (entry 3 waived), todos `2026-11-15-lasers-and-ident-hit-stations-and-buoys`, `2026-11-16-phase-14-review-followups`, `2026-11-14-make-buoys-block-hyperspace-like-oolite`, `2026-11-16-ci-e2e-timeout-margins`, `2026-11-10-add-planet-and-sun-collision`.
- Wegolite source: `src/sim/sim.ts`, `src/sim/world/{step,world,store,control-impl,populate,ids,limits,entity,serialize,snapshot,ship-field,view-impl,contacts}.ts`, `src/sim/combat/{step,hit,shields,constants}.ts`, `src/sim/npc/behaviours/attack.ts`, `src/sim/ai/{registry,pilots/test-pilot}.ts`, `src/app/session/{sim-driver,save-controller,settings-controller,event-router,world-lifecycle}.ts`, `src/app/game-loop.ts`, `src/persistence/{autosave,store}.ts`, `src/render/bodies/{npc-ships,laser-shots}.ts`, `tests/acceptance/{detectors,thresholds}.ts`.
- Oolite checkout (`/home/opencode/git/oolite`, pinned 7437f22): `src/Core/Entities/ShipEntity.m` (`fireWeapon`/`fireMainWeapon` 9930-10010, `fireLaserShotInDirection` 10360-10440, `collideWithShip` ~11050-11145, `takeEnergyDamage` 11418-11560, `takeScrapeDamage` 11641-11676, `releaseCargoPodsDebris` 7814-7882, `becomeExplosion` 7891-8140, `checkShipsInVicinityForWitchJumpExit` 12498-12535, `canCollide` 1857-1875), `PlayerEntity.m` (`takeEnergyDamage` 5599-5700, `takeScrapeDamage` 5702-5750, `takeInternalDamage` 6097-6180, `getDestroyedBy` 6187-6240), `Universe.m` (`firstShipHitByLaserFromShip` 5549-5640, `addWreckageFrom` 5497-5525), `OOTypes.h` (`UNIVERSE_MAX_ENTITIES` 2048), `Resources/Config/{shipdata,equipment}.plist`.
- Confidence notes: wreckage lifetime arithmetic (Pitfall 20) and per-hull cargo (Pitfall 14) are MEDIUM and flagged for a read before planning; all other Oolite citations were read directly.
