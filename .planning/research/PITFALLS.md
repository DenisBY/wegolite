# Domain Pitfalls

**Domain:** Adding a populator, Oolite's priority AI (hand-ported), legal status and bounties, cargo scooping and combat rating to an existing deterministic, golden-hashed, Docker-tested browser port of Oolite (TypeScript, Three.js, IndexedDB saves, frozen 20-seed acceptance run), milestone v2.4 Pirates and Police.
**Researched:** 2026-11-25
**Confidence:** HIGH for every fact read from this repository and from the Oolite checkout (cited by file and line, checkout pin `7437f22`). MEDIUM for the effort and performance projections and for the "AppImage JS equals the checkout JS" assumption (not verified: see the Oolite-comparison section). No external sources were needed; the research-plan/research-store seam was not used because every finding comes from the two local source trees.
**Supersedes:** the v2.3 pitfalls file of 2026-11-16. Its pitfalls on the damage ledger, the kill path, the entity cap and the frozen acceptance run still hold and are restated here only where v2.4 changes them. Lessons from `.planning/RETROSPECTIVE.md` that apply directly: freeze the data shape of the milestone up front (v2.3 lesson 1), a silent fallback needs a build-time or tripwire check (v2.2 lesson 2), acceptance evidence that no gate re-runs decays (v2.2 lesson 3), a major bug found in UAT needs a debug session in the same phase (v2.3 lesson 3).

How to read this: every pitfall says what goes wrong, why it is likely *here*, how to prevent it, the warning sign, and the phase that must own it. Phase labels are suggestions for the roadmapper (numbering continues at 21):

- **P-Data** - the data shape: hashed entity fields, snapshot and save bumps, player-side law state, content catalogue growth, the guards that must be updated first.
- **P-Pop** - the populator, group and escort spawning, the world lifecycle, repopulation.
- **P-AI** - the priority AI framework and the role trees (pirate, trader, police, hunter, escort), events, groups, communications.
- **P-Law** - legal status, bounties, kill credit, combat rating, the main station's responses, the docking check.
- **P-Scoop** - pod contents, the scoop, the tractor, the hold.
- **P-Verify** - the acceptance rerun, the Oolite comparison, e2e, performance soak, FIDELITY and changelog close-out.

---

## Critical Pitfalls

### Pitfall C1: A new populator invalidates the frozen 20-seed acceptance run, the golden world and a dozen pins, because they all share the production populate path and the NPC catalogue

**What goes wrong:**
The 20-seed acceptance harness is not self-contained. `tests/helpers/traffic-fixture.ts` builds every epoch through `createInertPopulate` and `trafficContent` (`src/app/session/traffic.ts`) from the committed `src/content/generated/ships-npc.json`, then `tests/acceptance/detectors.ts` converts the 12 inert ships (ids 101-112) into scripted flyers by slot (`SCRIPT_MAPPING`, "by the populator's placement order", `src/sim/world/populate.ts:95-104`). `thresholds.ts` states what each slot can draw: "trader slots (101 to 103) the Adder, Moray or Cobra Mk I", and "every station, intercept, flee and attack slot draws an armed record whose maximum speed is at least the Adder's 240 m/s". If v2.4 edits `INERT_POPULATION`, `populateInertWorld`, `createInertPopulate` or merely adds hulls to `ships-npc.json` (Boa, Python, Anaconda, Asp, Fer-de-Lance, Viper interceptor are all `trader`, `pirate`, `hunter` or `police` roles), the weighted role pick changes which record each frozen slot draws. The frozen thresholds are then evaluated on a different experiment, and `thresholds.ts` may not be edited "not even for formatting" (a second commit fails plan 14-17's freeze check). The golden `tests/golden/world/inert-lave-epoch1.json`, `tests/sim/world/populate.test.ts`, `tests/app/session/render-driver.test.ts`, the Node tick-replay pins and the e2e spawn geometry share the same dependency.

**Why it happens:**
v2.4 says "populator" and the file is called `populate.ts`; the obvious move is to grow it in place. The coupling is invisible from the production side because the harness imports the production builder by design (so Node and the browser cannot drift, Pitfall 11 of Phase 12).

**How to avoid:**
- Write the new populator as a new function in a new file beside the old one (for example `src/sim/world/populate-system.ts`) and a new lifecycle closure (`createSystemPopulate`). Leave `populateInertWorld`, `INERT_POPULATION`, `InertShipRecord` and `createInertPopulate` byte-identical and still used by `laveInertWorld`. Switch the live session and the Node replay to the new closure only.
- Keep the nine existing records and their draw weights untouched for the frozen path. Put new hulls in an additive structure that the old path does not read (a second catalogue segment or a `populator: "system"` membership flag the inert path ignores), or the acceptance helper's pool changes. Do not "fix" this by editing the harness: that needs the `Detector-change-approved-by-owner` trailer and a 20-epoch rerun.
- Add a pin in the first plan: `hashWorld` of `laveInertWorld(epoch)` for epochs 1-20 must not change between the phase base and each commit (a measured-before, equal-after test, in the style of `tests/golden/world/flight-hash-pins.json`).
- Obey `AGENTS.md`: rerun `npm run test:acceptance` by hand on the remote test machine after any change under `src/sim/npc/**`, `src/sim/world/**` or `ships-npc.json` (v2.4 touches all three) and record the result in the plan SUMMARY. This is the phase `.planning/todos/pending/2026-11-16-phase-14-review-followups.md` IN-04 told the owner to revisit: put the owner question "add `test:acceptance` to `verify-full` now?" to the owner in the first plan.
- Two acceptance gaps that real AI exposes (`2026-11-16-phase-14-review-followups.md` IN-05 "a permanently idle attack, escort or face flyer", and `2026-11-20-acceptance-run-with-collisions-on.md`) both need the owner's approval for a separate harness addition. Ask once, early, and write the variant as a new file, never as an edit to the frozen set.

**Warning signs:**
- A diff that touches `INERT_POPULATION`, `populateInertWorld`, `createInertPopulate` or an existing record in `ships-npc.json`.
- `inert-lave-epoch1.json` or `flight-hash-pins.json` changing in a plan that did not set out to change them.
- An acceptance epoch that fails with a new class of violation (a station-sphere entry, a hull crossing) after a content-only change.

**Phase to address:** P-Data (isolate and pin), P-Pop (new function), P-Verify (manual rerun and owner decisions).

---

### Pitfall C2: Every new hashed field is designed late, so the snapshot and the save bump several times and the pinned goldens churn

**What goes wrong:**
v2.4 needs new state in at least six places, none of which exists today: per-NPC priority-AI state, NPC `bounty` (Oolite's offender score), group membership and leader, alert level, the 15-bit `entityPersonality`, per-entity pod contents (commodity and amount) for scooping, and the player's legal status, kill count and role history. Added one phase at a time, each is a `WORLD_SNAPSHOT_VERSION` (4 today) or `SAVE_VERSION` (5 today) bump and a golden regeneration. v2.3's lesson was the opposite: "Designing every hashed field of the milestone in Phase 15's first plans: no later phase bumped the snapshot, and Phases 16 and 17 ran side by side on a frozen field set."

A second trap: the player's law state has nowhere to live. `hashWorld(player, world, combat?)` (`src/sim/world/serialize.ts:268`) hashes the flight state, the world section, static health, buoys and the player's combat line. It does not hash `PlayerProfile` (credits, cargo, equipment). The sim must write legal status itself (Oolite's `markAsOffender` runs inside AI event responses and station hits, where no profile is in reach), so the state has to be a sim-side record passed through `stepSim` like `combat`, with its own pristine-omit hash line, or every cross-cadence hash and golden is blind to the whole law subsystem (a bounty paid in one cadence and not in another would not show).

**Why it happens:**
Each feature looks small ("add a bounty field"). The player-side blind spot arises because credits and cargo are app-owned and `PlayerProfile` is the natural place to put "legal status" and "kills".

**How to avoid:**
- The first plan of the first phase is a field-design plan, exactly as Phase 15 was. Output: the full list of new fields with type, bounds, pristine value, hash segment label and sanitiser, in one snapshot bump (v5) and one save bump (v6, no migration, as v5 did: PROJECT.md "older save is corrupt"), one golden regeneration, and a strip-and-rehash proof that removing the new segments reproduces the previous golden.
- Pristine-omit every new segment (v2.3 D-09 pattern: `;vel:`, `;wpn:`, `;cargo:`): a world with no pirate, no bounty, no group hashes as before. Print an optional segment whenever any component is non-default so omission never hides a difference.
- A new sim-side `PlayerLawState` (legal score as an integer, kill count, role weights and flags, distinct from `PlayerCombatState`) with `serializeLaw`, `sanitizeLaw`, `isPristineLaw`, appended in `hashWorld` after the combat line. The app persists it in the save and passes it back in; events notify the UI (`legalStatusChanged`). Add it to the cadence tests (30/60/144 Hz hash equality) and the save round-trip tests in the same plan.
- Hold groups as ordered arrays of ids (insertion order is Oolite's `ShipGroup` order), never a `Map` or an object keyed by id whose iteration order the hash would depend on. `for..in` and bare `sort` are lint-banned (`tests/guards/sim-determinism-bans.test.ts`); keep it that way.

**Warning signs:**
- A plan that says "add a field to `Entity`" and carries no snapshot-version line.
- `PlayerProfile` gaining `legalStatus` or `kills` with no corresponding hash segment.
- A second regeneration of `inert-lave-epoch1.json` in the milestone.

**Phase to address:** P-Data, first plans, before any behaviour exists.

---

### Pitfall C3: Oolite's priority AI holds its state in closures and entity references, which do not fit `AiComponent.params`

**What goes wrong:**
A `PriorityAIController` (`Resources/Scripts/oolite-priorityai.js:36`) keeps state in constructor-local variables: the priority list, `parameters` (including entity references such as `oolite_scanResultSpecific`, `oolite_lastAssist`, `oolite_distressAggressor`), a short-term `__cache` cleared on every reconsideration (line 202), a long-term `__ltcache` that expires on the game clock every 60 s (lines 205-209), `lastCommSent`, `lastCommHeard`, the communications role and personality, the waypoint generator and its route, plus ship-side state it reads and writes (`target`, `AIPrimaryAggressor`, `defenseTargets`, `alertCondition`, `group`, `AIScriptWakeTime`). Wegolite's `AiComponent` is `{aiKey, params, wakeTick, nextThinkTick}` with `params` limited to scalars and flat arrays, at most `MAX_AI_PARAMS_KEYS = 32` keys, no nesting, no entity ids that survive removal checks (`src/sim/ai/types.ts`, `src/sim/world/limits.ts`), and `AI_KEYS` is a closed list of two. A port that stuffs the controller into `params` will hit the 32-key limit (the library reads or writes 143 distinct `oolite_*` names across its conditions, configurations and responses), lose structure, and either be repaired by `sanitizeEntity` or refused by the snapshot parser.

**Why it happens:**
"A hand port" tempts a literal translation: a class with fields. Fields hold object references and Maps, which the world hash, the snapshot and the sanitiser cannot see. PROJECT.md already rejected running Oolite's JavaScript at runtime for exactly this reason ("closure-held AI and timer state cannot be serialised into saves or determinism hashes").

**How to avoid:**
- Copy the Phase 14 pattern: a typed, frozen-shape `PriorityState` record on `Entity` (like `SteerComponent`), with explicit fields for every parameter that any ported condition, configuration or behaviour reads, ids stored as `EntityId` that every reader resolves through `view.body`/`view.ship` and tolerates as removed (the rule at the top of `src/sim/world/kill.ts`), hashed as one pristine-omit segment, snapshotted and sanitised.
- The priority list itself is static code (frozen tables of entries), never state. The only per-ship state about it is the wake time and what the last pass chose, if a later pass reads it.
- Replace the two caches with explicit tick-stamped fields (`ltcacheStartTick`, plus named cached values), reset by the same rules; do not use JS objects as maps.
- Keep depth at most 2 under `src/sim/ai/` (for example `src/sim/ai/priority/pirate.ts`, not `ai/priority/roles/pirate.ts`): the AI lint zone rejects depth 3 ("AI modules at depth >= 3 have no configured allow-list", `eslint.config.*`, `tests/guards/ai-zone.test.ts` DEPTH3). The AI zone may import only `world/view`, `world/control`, `world/ids` and sim math, so every fact the AI needs (scan, group, bounty, energy, system government, station state) must be added to `WorldView` as a narrow member, with the exhaustive `Record<keyof WorldView, true>` test in `tests/sim/world/view.test.ts` updated each time.
- Add a coverage manifest of every `PriorityAIController` method and every `oolite_*` parameter the chosen roles reach, marked ported, stubbed or not ported, checked in CI (the v2.0 requirement AI-07 asked for exactly this; it was never built).

**Warning signs:**
- `ParamValue` or `MAX_AI_PARAMS_KEYS` raised "just for this".
- A `Map`, a class instance or a closure on an entity or in `src/sim/ai/**`.
- An AI module importing from `src/sim/world/world.js` (the lint zone will say so; do not suppress it).

**Phase to address:** P-Data (record shape), P-AI.

---

### Pitfall C4: Random draws are the hardest thing to port faithfully: 58 `Math.random()` calls in the priority AI, 95 in the populator, short-circuit order, and three different generators

**What goes wrong:**
`oolite-priorityai.js` calls `Math.random()` 58 times, the populator 95 (`oolite-populator.js`, for example `randomise` at line 646, `_setSkill` at 2290, `_setMissiles` at 2308). Faithful porting means one draw at the same program point with the same short-circuit shape, in a stream whose position is a function of the ship's own history only. Specific traps:
1. **Evaluation order.** `if (Math.random() < 0.9 && this.friendlyStation(system.mainStation))` (line 4233) draws first and then tests; `friendlyStation(...) && Math.random() < 0.9` draws only when the test passes. A "tidy" port that reorders changes the draw count for every later decision.
2. **Draws inside conditions.** `conditionCoinFlip` (line 2564) and `checkScannerWithPredicate` (line 705, a random start offset into the scan results) draw on every evaluation. The priority list is re-evaluated from the top at each reconsideration, so the draw count depends on which entries are reached, not only on state. Entries with `preconfiguration`, `notcondition`, `truebranch` and `falsebranch` must be evaluated in exactly `_reconsiderList`'s order (lines 74-195).
3. **Which stream.** Steering draws from the entity's `combat` stream (`ctx.draw()` in `src/sim/npc/dispatch.ts`); AI thinks draw from the `ai` stream (`AiContext.random`). Oolite has one global generator, so any assignment is a decision. Pick one rule (for example: priority-AI decisions on `ai`, fire and steering on `combat`) and write it in FIDELITY.md; do not mix by convenience. Adding a third purpose to `ENTITY_RNG_PURPOSES` is a snapshot-format change (C2).
4. **Accuracy is drawn lazily in Wegolite and at spawn in Oolite.** Oolite sets `accuracy = randf()*10 - 5` at ship init (`ShipEntity.m:665-672`, police and military flip a negative to positive) before the populator runs `_setSkill`. Wegolite resolves it at the first steer (`ACCURACY_UNRESOLVED = -100`, `src/sim/npc/state.ts:51`; `resolveAccuracy` in `dispatch.ts`). The priority AI reads `ship.accuracy` in `reconsiderNow` (`0.1 + (10 - accuracy)/10` s, line 459) and the populator reads it in `_setSkill`. If either runs before the first steer, it reads -100 and computes a wait of 11 s or a skill shift from the sentinel. Resolve accuracy at spawn in the populator (same stream, same first draw, so Phase 14's pinned steering trajectories do not move) and have every reader treat the sentinel as a fault.
5. **Float widths.** `randf()` and `ranrot_rand()` are float32 and integer in C; `Math.random()` is a float64 in `[0,1)`. Existing code already rounds the one product that Oolite rounds (`Math.fround(u * weaponRange)` in `src/sim/npc/fire.ts`); follow that rule per site and say so in a comment citing the C line, or a threshold such as `Math.random() < count - r` (populator line 648) flips on a boundary draw.
6. **Text and comms.** `expandDescription` picks random phrases. Those draws must never come from a sim stream (the text is not simulated), or the draw count would depend on whether a message was displayed.

**Why it happens:**
JavaScript in, TypeScript out looks like mechanical translation; the draw sites do not show up in a type check, and a changed draw count only shows up as a different trajectory 10 minutes later.

**How to avoid:**
- Build the port against the existing differential harness: `tools/ai-harness/load.ts` already runs the pinned `oolite-priorityai.js` in `node:vm` with `Math.random` routed to a host draw (`RANDOM_INSTALLER`), and `tools/ai-harness/spike.test.ts` is its first consumer. Extend it as the oracle: feed the same scripted sequence of draws and world facts to the original and to the port and compare the decision (chosen behaviour, wake delay, parameters set, number of draws consumed). A port that consumes a different number of draws fails at the first divergence. This is the same device that made Phase 14's 139 fixtures pass first time (RETROSPECTIVE v2.2).
- A source-scan manifest: every `Math.random` and `clock.*` site in the ported files listed with its TypeScript counterpart or a "not ported: reason" row (AI-07). A new site in a later Oolite pin fails the manifest.
- For the populator, fork a stateless stream per group exactly as cargo already does (`forkSeed(world.worldSeed, id, "cargo")`, `populate.ts` header), so adding or refusing one ship never moves another's draws.
- Property test (the D-04 pattern): spawning or killing a ship that is not in A's group and not A's target never changes A's later draws.

**Warning signs:**
- An `Math.random`-free port that reads "a random chance" as `rng() < p` in a helper with a different argument order.
- A decision test that passes with fixed draws but never asserts how many draws were consumed.
- A ship's trajectory changing when an unrelated far-away ship is added to the world.

**Phase to address:** P-AI (oracle, manifest), P-Pop (forked streams), P-Data (stream list).

---

### Pitfall C5: Oolite's timing is strict-greater, in seconds and driven by the player clock; Wegolite's AI timing is `>=` on rounded ticks with a minimum of one

**What goes wrong:**
- Oolite wakes a ship when `[PLAYER clockTimeAdjusted] > aiScriptWakeTime` (`ShipEntity.m:2480`, strict), once per update, at the end of that ship's update. Wegolite's world step wakes on `tick >= ai.wakeTick` (`src/sim/world/step.ts`, `wakeDue`). With `scheduleWake(ticks)` the "earlier wake wins" rule matches `_resetReconsideration` (line 235), but the off-by-one makes every reconsideration one tick early relative to Oolite unless the conversion adds it.
- `ticks(seconds)` in `src/sim/ai/time.ts` is `Math.max(1, Math.round(seconds * 120))`. The priority AI's delays are fractional (`0.1 + (10 - accuracy)/10`, `Math.random()` for the first wake at line 578, `500 + Math.random()*1000` for desired ranges at 3333). Whether a wake rounds up or down changes the tick at which a ship reacts; round-to-nearest is a rule the repo chose for `THINK_INTERVAL_TICKS` (Oolite's 0.125 s), not for a strict-greater timer.
- `clock.adjustedSeconds` (lines 50, 205, 234, 348, 358) versus `clock.seconds` (lines 2657, 3021, 3082, 3105): the first is the ship clock without the hyperspace jump adjustment; the second includes it. Both are wall-free game time, but Wegolite only has ticks. Every use site must be classified (wormholes and witchspace entry times, 60 s cache expiry, comms gating 10 s and 60 s, distress timestamps).
- `new Timer(...)` (priority AI lines 425 for ECM, 5586 for the 10 s self-destruct of an abandoned ship, and in the communications path) has no sim equivalent: the world has no timer facility, and a timer in JS state would be neither hashed nor saved. ECM is deferred, but the police AI sets `oolite_flag_selfDestructAbandonedShip` and abandoned ships (escape pods) are not modelled for NPCs.
- The world is stepped only while the player is `launching` or `inFlight` (`src/sim/sim.ts`) and not on the jump step; docked time and the chart do not advance NPC time. Any Oolite behaviour that relies on time passing while docked (the station launches ships; wormholes expire) has no counterpart.
- Oolite delivers AI messages and script events **synchronously** (`doScriptEvent`, `reactToAIMessage:` run the handler inside the call, for example `broadcastHitByLaserFrom` at `ShipEntity.m:12299-12301` sets the found target and runs `offenceCommittedNearby` on every authority in the same call). Wegolite queues AI events and delivers them first-in-first-out at two fixed points of the step ("nothing is delivered synchronously", `step.ts`), with at most 8 passes and 4096 events per drain (`MAX_AI_EVENT_PASSES`, `MAX_AI_EVENTS_PER_DRAIN`). A reaction that Oolite performs before the next line of the caller runs here one drain later, and a burst (an offence broadcast to every police ship, a group help request) can exceed the drain bounds and be silently dropped (`countAiDropped`).

**Why it happens:**
Timers look like a unit conversion. The strict comparison and the synchronous delivery are properties of Oolite's call structure, not of any single function.

**How to avoid:**
- Write one conversion in `src/sim/ai/time.ts` for "wake strictly after t seconds" (ceil of the product, then one more tick if exactly integral) and test it against the oracle; do not reuse `ticks()` for Oolite wake times. Record the rule in FIDELITY.md.
- Classify every clock site in a table (the manifest from C4) as ticks-since-spawn, ticks-since-world-epoch, or "not needed because the world is cleared at jump".
- Decide explicitly which reactions must stay synchronous: the offence broadcast and `respondToAttackFrom` sequence in the damage path (C6) should run as a direct function call inside the ledger pass, writing the found target and bounty at once, and only AI re-think requests should be queued. Document each as a recorded divergence if it goes through the queue.
- Bound every broadcast by `scannerRange` and by group size, and add a test with 60 ships that asserts `aiDropped === 0` after a distress storm.
- NPC timers (`self-destruct`, ECM) are cut, with a FIDELITY row and a tripwire like the missiles one.

**Warning signs:**
- A hash that differs by exactly one tick between the port and the oracle on the first reconsideration.
- `aiDropped` or `aiFaulted` events appearing in a soak test.
- A reaction that the oracle performs "within the same call" showing up one tick later.

**Phase to address:** P-AI.

---

### Pitfall C6: Oolite's damage path performs AI-visible side effects; Wegolite's ledger does not, and the obvious "fix" for the doomed-target todo skips the offence broadcast

**What goes wrong:**
In Oolite `takeEnergyDamage:` (`ShipEntity.m:11418-11590`) does much more than subtract energy. For a ship hit by another ship's weapon it: sets `primaryAggressor` and **sets the found target** (`setFoundTarget:`, which becomes the primary target if none), calls `broadcastHitByLaserFrom:` (an offence, `12279-12303`, before the energy check), and only `if (energy > 0)` calls `respondToAttackFrom:becauseOf:` (which is what posts the AI's `shipBeingAttacked` and drives retaliation). `noteTakingDamage:` (`ShipEntity.m:7714`, called from the damage path) draws `randf()` for every hit on a ship with a hostile target and `accuracy >= 5` and may switch it to evasive action (the `COMBAT_AI_IS_SMART` clause). The lethal blow still calls `[hunter noteTargetDestroyed:self]` before `getDestroyedBy:` (`11561`), and that is where bounty is collected (C8). Wegolite's ledger (`src/sim/combat/ledger.ts`, `step.ts`) applies the damage, emits `shipHit` (no consumer, tripwired by `tests/guards/ship-hit-consumers.test.ts`) and runs the kill path. None of the reactions exist.

The open todo `2026-11-17-skip-shiphit-for-a-doomed-target.md` says the first `shipHit` consumer must skip `shipHit` for a target already lethal in the same tick. Doing that literally also skips the offence broadcast for the killing blow. In Oolite the offence is recorded before the `energy > 0` test, so a player who kills a clean trader in one volley must still be marked and the police must still hear of it. Only the retaliation (`respondToAttackFrom:`) is skipped for a doomed target.

**Why it happens:**
The v2.3 ledger was deliberately a pure damage path; the todo describes only the audio double-play concern.

**How to avoid:**
- Split the consumers: add an explicit hit-reaction stage after `applyLedger` with three separate steps in Oolite's order: (1) aggressor, found target and `broadcastHitByLaserFrom` for every laser hit whether lethal or not; (2) `noteTakingDamage` evasive draw (a draw on the hit ship's stream, only when its conditions hold); (3) `respondToAttackFrom` only if energy remains. The todo's skip then applies only to audio and flash consumers of `shipHit`. Test: a clean ship killed by two shots in one tick produces one `shipDestroyed`, one offence broadcast and no retaliation event.
- Scrape damage (collisions) calls `noteTakingDamage` and `noteTargetDestroyed` but not `broadcastHitByLaserFrom` or `respondToAttackFrom` (`takeScrapeDamage:`, `ShipEntity.m:11640-11667`): ramming a trader is not an offence by the engine. Keep the two paths distinct and test both.
- The hit by the *player* is the one that produces the headline behaviour ("firing on a trader makes the player an Offender and the police attack"). It goes through `PlayerEntity`/`ShipEntity` code in two places: a clean NPC hit by the player (`ShipEntity.m:11478`) and a clean player hit by an NPC (`PlayerEntity.m:5643`). Both need the `bounty == 0` precondition (a ship with any bounty is not "innocent", `ShipEntity.m:12284`).
- Update `tests/guards/ship-hit-consumers.test.ts` allowlist and the todo in the same commit as the first consumer, as the guard's message already demands.

**Warning signs:**
- A plan that implements "the killing blow is exempt from reactions" as a single `if`.
- Police that never react when the player kills a trader in one pass.
- Evasive jinking never appearing on hit ships (the `randf()` draw missing).

**Phase to address:** P-AI (hit-reaction stage), P-Law (offence marking).

---

### Pitfall C7: Legal status is a bit-flag score with most of its logic inside the priority-AI JavaScript, not a three-value enum owned by the engine

**What goes wrong:**
Wegolite reserves `LegalStatus = "clean" | "offender" | "fugitive"` and a `legalStatusChanged` event (`src/sim/events.ts:41,188`). In Oolite the status is an integer: Clean below 1, Offender 1-50, Fugitive 51 and above (`OODisplayStringFromLegalStatus`, `OOConstToString.m:404`, thresholds 1 and 51). Offences are OR-ed in (`legalStatus |= offence_value`, `PlayerEntity.m:6032`; the NPC `bounty |= ...`, `ShipEntity.m:11846`), never added. Reasons and values come from many places, and **most of them are in the AI scripts**: `bounty | 7` "seen by police" (`oolite-priorityai.js:5169, 6033`), `| 15` "attacked police" and `| 63` "attacked main station" (5367, 5371), `| 8` "attacked innocent" from a distress call (5987), `bounty*4/5` "assisting police" (5321), plus the engine's `| 64` when a ship attacks police (`ShipEntity.m:11530`, `PlayerEntity.m:6068`), `| 64` or `| 96` from hitting the main station (`StationEntity.m:1139`), and `setBounty(legalStatus / 2)` on every jump (`Universe.m:1061`, `PlayerEntity.m:6887`, wormholes `WormholeEntity.m:389`). Police clean their own score every update (`ShipEntity.m:2145`). The fine threshold is `50 - government * 6` (`priorityai.js:841`). Fines are paid at the station (`PlayerEntity.m:10452-10465`). A system that tracks "offender/fugitive" as an enum cannot reproduce halving, OR-ing, the thresholds per government, or the bounty reward's dependence on the bounty value.

Concrete JavaScript-versus-TypeScript hazards in this area:
- `if (attacker.bounty & 7 != 7)` (line 5161): `!=` binds tighter than `&`, so the test is `bounty & false` and is always falsy: the upstream code always takes the `else` branch (communication priority 4). A clean TypeScript port `(bounty & 7) !== 7` silently changes behaviour. FIDELITY rule: reproduce the observable branch or record the divergence with reviewers' agreement; never fix silently.
- `setBounty` takes `JS_ValueToInt32` (`OOJSShip.m:2819-2828`): the float `bounty*4/5` is truncated toward zero, a negative argument is rejected without setting, and `|` is a 32-bit operation. Use `| 0` or `Math.trunc` and a bounded integer type.
- The legal status of NPCs and of the player share the `bounty` name; `isPolice` means scan class `CLASS_POLICE`, which the role assigns (`Universe.m:3645-3652`: role `police` and `interceptor` set the scan class), so the scan class must be set at spawn from the requested role.
- The main station is not an entity in Wegolite (a `StaticEntity` with `staticHealth`, no AI, no target, no alert level). `oolite-stationAI.js` sets `oolite_flag_markOffenders` and `oolite_flag_listenForDistressCall` and marks offenders `| 63`; the engine's `launchPolice` and `launchDefenseShip` start police ships. A port that omits the station's responder leaves "attack the main station" and "offence in aegis" (`AuthorityPredicate`, `ShipEntity.m:12261-12277`: the main station when the victim is in its aegis, and police within scanner range) with no listener, and police never learn about offences near the station.
- The docking check is `DOCKING_REFUSED` for a **player with legal status above 50** only in `dockingInstructionsForShip` (`StationEntity.m:412`) and the NPC clearance (`1861`): "note: non-player fugitives dock as normal". Manual docking is not refused. Implementing "the docking check" as a refusal in the dock-contact code would block manual docking, which Oolite does not do; the correct place is the docking-computer path and a new `dockDenied` reason (`src/sim/events.ts` has `notInstalled` and `outsideAegis` today).

**How to avoid:**
- Model the score as an integer in `PlayerLawState` (C2) with `markAsOffender(value)` (OR, no-op for police, cloaked and the station), `setBounty`, the jump halving, and the display mapping at 1 and 51; derive the enum only for display and for the event.
- Port the response components as data-driven handlers with a one-to-one list of `oolite_flag_*` parameters per role; cite the line of every constant in a comment.
- Decide in the first law plan how the main station responds (a minimal station responder in the world step that applies the `markOffenders` and `listenForDistressCall` handlers and the `| 63` and `| 64/96` marks, with `launchPolice` recorded as a deferred divergence or ported) and write it as a Key Decisions row; do not leave it implicit.
- Fines and the "pay fine" action are a separate small feature with their own player action (F-key at the station); decide if they are in v2.4. The milestone text lists "police attack an offender; the docking check" but not fines.

**Warning signs:**
- A `legalStatus` field typed as the three-string union.
- A unit test of "marks offender" that checks only `"offender"` and never a value such as 71 or the halving at jump.
- No test where a clean trader is hit inside the station's aegis and the station reacts.

**Phase to address:** P-Law, with the player-state shape in P-Data.

---

### Pitfall C8: Kill credit, bounty and the kill tally are the first consumers of three open tripwires, and the same-tick rules differ for the player

**What goes wrong:**
`.planning/todos/pending/2026-11-18-mutual-kill-credit-symmetry.md` says the first consumer of kill credit must first decide between keeping the asymmetry, making it symmetric, or ordering credit by update sequence, with `tests/guards/kill-credit-consumers.test.ts` failing at the first consumer. v2.4 adds consumers on day one: the player's bounty and kill tally, the kill-count rating, the "attacked police" mark, AI reactions to `shipTargetDestroyed` and `shipKilledOther`. Facts from Oolite that the decision must honour:
- The credit goes to the **damage dealer** (`hunter`), not to the ship's current target: `noteTargetDestroyed` is called on `hunter` at the lethal hit (`ShipEntity.m:11561`) and for lethal scrape damage by the other ship (`11667`), and `collectBountyFor:` runs for any `hunter`. The primary-target check only gates `removeTarget` (`8806-8812`). Wegolite's kill path posts the pair to the normalised killer "regardless of its own target" (`src/sim/world/kill.ts`), which matches, but then the **player** must be treated as a killer through the ledger record's source, not through an AI event, because the player has no AI.
- The player collects only if alive: `if ([self status] == STATUS_DEAD) return;` (`PlayerEntity.m:6044-6046`). A mutual kill of the player and an NPC in one tick pays nothing.
- Reward is `credits += 10 * [other bounty]` in decicredits, cut to a tenth for cargo (with a commodity amount, not a hulk), buoys and rocks, with no kill counted (`PlayerEntity.m:6062-6080`); `ship_kills++` only when `countsAsKill` is true (the record's `counts_as_kill`, default yes); and shooting police marks the player `| 64` from the same function.
- The reward message `bounty-awarded` is shown only when `score > 9`.
- `killer` normalisation drops a dead killer to `NO_ENTITY`, so an NPC killing the player in the same tick as the player kills it gets a kill and the player none; the todo's "order by update sequence" needs the world's per-tick update order specified, but the order here is id order by design (`step.ts` header, Key Decisions row (a)).
Two more tripwires fire at the same time: `tests/guards/on-event-handlers.test.ts` (`MAX_ON_EVENT_HANDLERS` is 1; the priority AI is a second `onEvent` module and the todo `2026-11-18-narrow-kill-time-ship-target-lost.md` requires the owner's edit of Phase 15 criterion 1 before the narrowing) and `tests/guards/fire-decision-source.test.ts` (no AI record outside `src/sim/ai/**`, and `populate.ts` must give `ai: null`).

**How to avoid:**
- Make the credit decision the **first plan of P-Law** with a test per case: player kills NPC; NPC kills NPC; player and NPC kill each other in one tick (no bounty to the dead player, Oolite rule); two NPCs kill each other (accept the id-order asymmetry for NPC-only credit and say why: the only NPC-side consumer is "shot a copper", which uses the shooter; or make credit symmetric); a ram kill; a pod, buoy or rock kill (a tenth, no tally).
- Route the player's reward from the ledger/kill path, never from `shipKilledOther` delivery.
- Treat the narrowing todo as a prerequisite owner question in the AI phase's first plan (it changes wording of a verified criterion, so it cannot be done silently), and make `onEvent` idempotency a property test over the whole priority module (a double-delivered `shipTargetLost` must not double a reconsideration or a distress call).
- Update the three guards' allowlists in the same commits as the consumers, each citing its todo.

**Warning signs:**
- A reward paid from an event handler.
- A test that kills one NPC with the player and nothing else.
- Guards "temporarily" excluded from a run.

**Phase to address:** P-Law first plan; P-AI for the `onEvent` and guard changes.

---

### Pitfall C9: The content scope: nine hulls, forward-weapon-only, no missiles, no escorts, no bounty, and AI chosen by role, not by `ai_type`

**What goes wrong:**
The compiled catalogue has nine ships (adder, cobramk1, gecko, krait, mamba, moray, shuttle, sidewinder, viper). A populator that composes traffic like Oolite's needs freighters (Boa, Anaconda, Python, Transporter, Lynx), the Asp, Fer-de-Lance, Cobra Mk III trader and interceptors. Specific blockers:
- `tools/oolite-ingest/convert/npc-ships.ts` deliberately fails the build for any record that authors `accuracy`, `reaction_time`, `scanner_range` or an aft, port or starboard weapon (`STEERING_ASSUMED_ABSENT_KEYS`). In `shipdata.plist` the Anaconda, Anaconda-pirate, Boa and Boa Mk II author `aft_weapon_type` (`oolite_template_anaconda`, `-boa`, `-boa-mk2`). Pirate packs "led by increasingly bigger freighters" (`populator.js` lines 1800-1860) and every large trader need these. Lifting the refusal means per-facing weapon temperatures (`WeaponComponent` holds forward only; "a snapshot-format change", `entity.ts`), the aft, broadside and running-defence branches of `behaviour_attack_target` that `attack.ts` records as cut (`ShipEntity.m:4078-4136`), and a `fireAftWeapon` path in the fire gate. The populator's `_setWeapons` (`populator.js:2225-2275`) also **assigns** forward and aft weapons by tech level (beam, military, aft beam) and `_setSkill` shifts accuracy, so even the nine existing hulls can arrive with an aft weapon the engine ignores.
- `missiles`, `escorts`, `escort_roles`, `bounty`, `has_escape_pod`, `counts_as_kill`, `scan_class` by role, `likely_cargo` and `max_cargo` are not all compiled. Pirates in Oolite often carry missiles (46 lines mentioning `missiles` in `shipdata.plist`). `considerFiringMissile` is called `if (missiles)` only (`ShipEntity.m:3989-3990, 4322-4323, ...`), but it draws `ranrot_rand()` on every call when missiles are present and fires them for a hurt ship. The clean cut is **missile count zero at spawn for every NPC** (so no draw and no launch), recorded in FIDELITY.md with a tripwire guard that fails when a compiled record with missiles reaches an AI (the guard that todo `2026-11-25-missiles-and-ecm.md` asks for). A cut that keeps the count and skips the call silently changes behaviour.
- The AI of a populated ship is chosen by the **role it was requested with** (`autoAImap.plist`, `Universe.m:3638-3643`, `defaultAIForRole`): a Cobra Mk I requested as `pirate` gets `oolite-pirateAI.js` although the record's `ai_type` is the trader AI (`ships-npc.json` shows `cobramk1: aiType oolite-traderAI.js`). Keying on `aiType` gives pirates trader behaviour. The scan class is also set by role (`police`, `interceptor`, `thargoid`), and `primaryRole` is kept (the AI branches on `primaryRole == "trader-smuggler"`, `"police-station-patrol"`).
- The role AIs reference roles through categories (`role-categories.plist`, `oolite_friendlyRoles`, `shipInRoleCategory`), including the player's roles (below).

**How to avoid:**
- Decide the catalogue boundary in P-Data with the owner: either (a) v2.4 ships only the nine hulls plus hulls without aft weapons (Asp, Fer-de-Lance, Cobra Mk III, Python?, check each with the converter) and records that traffic composition is compared by role class, not by hull; or (b) lifts the aft refusal as a planned, field-designed work item (per-facing temperatures in the one snapshot bump, the aft branches in `attack.ts`, new oracle fixtures). Do not discover it when the Anaconda build breaks.
- Add the role-to-AI table as compiled content with a test pinning equality with `autoAImap.plist`, in the style of the existing "schema bounds restated in content" pattern (RETROSPECTIVE v2.2).
- Compile `bounty`, `escorts`, `escort_roles`, `has_escape_pod`, `counts_as_kill`, `max_missiles` and `missiles` as fields (even if some are unused) so the converter fails on malformed values rather than defaulting silently (v2.2 lesson 2).
- Treat NPC escape pods (`has_escape_pod`, 25 % chance on a hit below 12.5 % energy, `ShipEntity.m:11569`, `abandonShip`) as a recorded cut: it takes a `ranrot_rand()` draw and spawns an escape capsule, which the milestone defers (AI-10, LAW-05).

**Warning signs:**
- `STEERING_ASSUMED_ABSENT_KEYS` being edited or a build error from the converter on a new hull.
- An NPC that has `missiles > 0` and a priority AI.
- A pirate Cobra Mk I flying with the trader tree.

**Phase to address:** P-Data (catalogue boundary, fields), P-Pop (role to AI), P-AI (cuts).

---

### Pitfall C10: Behaviours the priority AI asks for but the native port does not have fall back to idle without a sound

**What goes wrong:**
`BEHAVIOUR_ROUTES` (`src/sim/npc/dispatch.ts:127-152`) lists 23 ids; "An id with no entry runs `behaviour_idle:` and the thrust ramp, the recorded fallback". The priority AI calls `performCollect` (pirate and scavenger salvage; `COLLECT_TARGET`), `performLandOnPlanet`, `performMining`, `performStop` (ported as STOP_STILL), and sets `FLY_THRU_NAVPOINTS`, `CLOSE_TO_BROADSIDE_RANGE`, `RUNNING_DEFENSE`, `ATTACK_BROADSIDE*`, `TRACK_TARGET` and `TRACTORED` through the engine. The requirement AI-12 ("collect, tractored, mining and land on planet") is explicitly deferred. A ship whose tree selects an unported behaviour does not throw: it sits idle forever, and the 20-seed detectors cannot see it ("IN-05: the frozen detectors cannot see a permanently idle attack, escort or face flyer"). The pirate tree selects `behaviourCollectSalvage` whenever a scan finds salvage (`oolite-pirateAI.js:66-85`, the salvage entry at line 77); the trader tree ends in `behaviourDockWithStation`, `templateReturnToBase` and the witchspace templates; the police tree ends in `templateReturnToBase` and `behaviourCollectSalvage` for escape pods.

**How to avoid:**
- A reachability table (the Phase 14 device): for every `this.ship.perform*` and `this.ship.* ` engine call in the chosen trees (the list is in this research: `performFlyToRangeFromDestination` x16, `performAttack` x11, `performIdle`, `performFlee`, `performIntercept`, `performFaceDestination`, `performEscort`, `performTumble`, `performStop`, `performCollect`, `performLandOnPlanet`, `performMining`, `enterWormhole`, `exitSystem`, `dumpCargo`, `dockEscorts`, `launchDefenseShip`, `getSafeCourseToDestination`, `requestDockingInstructions`, `markTargetForFines`), a status of ported, replaced or cut, and a **tripwire test that fails when a ported role tree can request a behaviour id missing from `BEHAVIOUR_ROUTES`**, naming the cut that must be recorded.
- Replace the silent idle fallback for AI-requested behaviours with a test-visible refusal: `ShipControl.perform` for an unrouted id in a priority-AI ship posts `aiFaulted`-style telemetry in tests and fails the soak test; ordinary play keeps the fallback.
- Decide the cut per behaviour and record it: pirates' salvage branch (condition `conditionScannerContainsSalvageForGroup` returns false while salvage collection is cut; check that the branch below still behaves), traders' docking and witchspace exits (see Pitfall C11).

**Warning signs:**
- A soak test where a role's ships never move after the first reconsideration.
- `nav.behaviour` stuck on an id outside `BEHAVIOUR_ROUTES`.

**Phase to address:** P-AI.

---

### Pitfall C11: NPCs that leave the world by docking, landing, wormhole or hyperspace have no removal path, and the only one that exists is the kill path

**What goes wrong:**
Traders are mostly route followers whose exit is not death: dock at the main station, jump through witchspace (`templateWitchspaceJumpOutbound`, `enterWormhole`, `exitSystem`), land on the planet. Wegolite removes a ship only through `killShip` ("A ship leaves the world through this function and nowhere else in non-test code", `src/sim/world/kill.ts`), which emits `shipDestroyed`, releases debris, credits a killer and notifies targeters. Using it for departure would give every docking trader an explosion, pods, kill credit and a bounty. The station dock queue, launch and docking instructions for NPCs (`WORLD-13`) are deferred, as is witchspace (wormholes) and scavengers/shuttles. If the AI is ported with these branches cut and nothing replaces them, traders park at the station or fly in circles, pirates never leave, and the system fills until the entity cap (C12).

**How to avoid:**
- Add one non-lethal removal function (`departShip` / `removeShip(reason)`) beside `killShip`, with the same total, idempotent, tick-boundary-clean contract (marked dead, removed at the next commit, `entityRemoved` emitted, no debris, no credit), notification of targeters through `shipTargetLost` (not `shipTargetDestroyed`), group and escort cleanup, and a guard that no non-kill departure calls `killShip`.
- Decide the departure policy in the first AI plan and record it: for example, a trader that reaches the station's aegis and decides to dock is removed as `docked`; one that reaches the witchpoint and decides to jump is removed as `jumped`; one near the planet as `landed`. These are Wegolite-only exits and a recorded divergence from queueing and wormholes, with a plan for when WORLD-13 lands.
- Keep the player-visible effect minimal: no new rendering for departures.

**Warning signs:**
- `killShip` called with `NO_ENTITY` for a non-lethal reason.
- Traders accumulating at the station sphere (the frozen acceptance detects a station-sphere entry for its own flyers; ordinary play has no such detector).

**Phase to address:** P-Data (decision), P-AI.

---

### Pitfall C12: The 256 entity cap, pods that never expire, deferred scavengers, packs that fail halfway and no repopulation can collapse traffic within minutes of real combat

**What goes wrong:**
`MAX_ENTITIES` is 256 (Oolite's `UNIVERSE_MAX_ENTITIES` is 2048); `spawnEntity` refuses at the cap; debris spawns while at most 243 entities are live (pods and plates) and wreckage while at most 127 (`src/sim/world/debris.ts` header). Pods and plates "never expire" (D16-06), and in Oolite it is the scavengers and the player that clean them up. Scavengers and shuttles are deferred in v2.4, so a pod released by every kill lives until the player scoops it or the session ends. A trading system with 20 to 40 ships and several fights adds 5 to 15 pods per kill (`POD_LIMIT` 15) plus plates and wrecks. At the cap the populator, escorts and any later arrival refuse spawns, leaving: a pirate pack without its leader or followers (the group has a hole), escorts that never appear, and a world that can no longer refill. The refusal is silent (`spawnEntity` returns undefined; `populateInertWorld` "skips refusals").

The populator's own demand is also uncertain: the `randomise()` count of initial groups (populator.js:644-651) times pack sizes (2 to 8 pirates, up to 16 escorts per trader; `MAX_ESCORT_SLOT` 15) at the density formulas for a system with many neighbours (populator.js:218-560, driven by the economies and governments of every system within 7 LY and 3.5 LY of the current one) has not been computed for Wegolite's 2,048 systems. A central, rich hub may exceed 100 ships before any debris.

Finally Oolite's population is a steady state maintained by a repopulator (`$repopulatorFrequency*` per 20 s, populator.js:1038-1300) that adds incoming and outgoing groups; the shipped `populate.ts` states "no repopulation". Without it every kill, departure and docking permanently thins the system.

**How to avoid:**
- Compute the population distribution for all 2,048 systems offline (a test over `planetinfo` data) before choosing caps: the 95th-percentile initial count, and the maximum, with and without groups. Pick the initial population limit and the packs' refusal behaviour from the data, and state it in FIDELITY.md.
- Make a group spawn **atomic**: reserve the whole group's count before the first `spawnEntity`, or spawn the leader first and skip the rest as a unit; test that a refused follower never leaves a group with a hole and that ids and `world.rng` stay in the same position whether or not a spawn was refused (the populator's "forked draw" rule from C4).
- Decide pod lifetime explicitly: a pod-expiry rule with a FIDELITY row (the recorded divergence from Oolite, whose cleaners are deferred), or reserve headroom (a lower debris gate during fights). Add a soak test: 30 simulated minutes of NPC-versus-NPC fighting with the 10 busiest systems, asserting the live count stays below a stated bound and the populator can still add a ship.
- Decide repopulation in the first plan of P-Pop: initial population only (a recorded divergence from Oolite, with a time-limited consequence statement), or a timer-driven repopulator inside `stepWorld` on the world stream (ticks, not frame time).

**Warning signs:**
- `spawnEntity` returning undefined in ordinary play (add telemetry in tests).
- Escort groups with fewer members than `maxEscortCount`.
- Live count creeping up while the player idles.

**Phase to address:** P-Pop, P-Verify (soak).

---

## Moderate Pitfalls

### Pitfall M1: Groups, leaders and escorts are a different structure in Oolite than in Wegolite

**What goes wrong:**
The priority AI reasons about `ship.group`, `group.leader`, `group.ships`, `containsShip`, `allied()` (lines 500-570), appoints leaders (`configurationAppointGroupLeader`), and uses "leader's decision" shared state (`playerRoleAssessment`, lines 1170-1204, copying `oolite_player_role` from the leader). Wegolite has `ownerId` for escorts and `escortSlot` only. Order matters: `group.ships` is an array in insertion order with removal shifting later entries, and `setCommunicationsRole` iterates it from the end.

**How to avoid:** a world-level ordered group table (arrays of ids, leader id), hashed with pristine-omit, with removal on death and departure and leader re-appointment as Oolite's `OOShipGroup` does; a test of group integrity under kill, departure and cap refusal. Add `allied` as one tested function with the oracle.

**Warning signs:** a pack that does not regroup after its leader dies; an escort that attacks its own group.

**Phase to address:** P-Data, P-Pop, P-AI.

---

### Pitfall M2: Scan order and the 32-ship cap differ from Oolite

**What goes wrong:**
`checkScanner` walks the z-sorted entity list outwards from the ship, nearest-in-z first, up to `MAX_SCAN_NUMBER = 32` ships, requires `isValidTarget` and excludes cloaked ships (`ShipEntity.m:8448-8484`, `ShipEntity.h:99`); `findShipsMatchingPredicate` walks `sortedEntities`, ordered nearest-to-the-player first (`Universe.m:5090-5097`, `5932-5952`). Wegolite's `WorldView.scan` is id-ordered and uncapped. The priority AI picks the first match after a random offset (C4), so ordering and the cap decide which ship becomes a target in a crowd; the entity-id order is a deliberate determinism device (Key Decisions row (a)), but a different order can systematically bias, for example, police toward low-id ships.

**How to avoid:** implement the scan result as "up to 32, sorted by Oolite's z-chain order computed from positions deterministically (stable sort with an id tie-break)", or record the id order as a divergence with the measured effect on target-selection statistics. Test the cap with 60 ships in range.

**Phase to address:** P-AI.

---

### Pitfall M3: Communications are not cosmetic: `commsMessageReceived` changes behaviour

**What goes wrong:**
Cutting `communicate` looks safe because it mostly sets `lastCommSent`. But `responseComponent_standard_commsMessageReceived` (line 5024) makes a ship attack a sender that targets it ("deals with pirate demand case"), and `ship.commsMessage(...)` is the delivery path. Pirates' demands, traders' "I'll pay" messages, distress broadcasts and police warnings go through the same function and some drive reactions. Also `$commsAllowed` can disable messages, and `ignorePlayerFriendlyFire` uses `Math.random()` (line 5262-5330 area).

**How to avoid:** model a `commsMessageReceived` AI event (add to `AI_EVENT_NAMES`) carrying only sender and the behaviour-relevant key; keep the text out of the sim (the app expands and displays it from a render-side stream), and keep the gating windows (10 s, 60 s) as sim state because they decide which messages exist. Decide whether player-visible comms are in v2.4 (they feed the HUD's single FIFO line, 4 s per message, see M9).

**Phase to address:** P-AI.

---

### Pitfall M4: The player is part of the AI's inputs through hidden persistent role history

**What goes wrong:**
`playerRoleAssessment` picks one of `player.roleWeights` at random, once, and shares it through the group leader (lines 1170-1204); `shipInRoleCategory` uses it for "is the player a hunter, pirate or trader" decisions (line 1321, 5394). `PlayerEntity` keeps `roleWeights` (default `player-unknown` x8) and `roleWeightFlags`, updated by actions (`addRoleForAggression` at `PlayerEntity.m:4486-4510`, with a power-of-two counter and a `Ranrot()` slot draw), and persists them (`role_weights`, `role_weight_flags`, `PlayerEntity.m:879-882, 1425-1440`). Without it, pirates and hunters cannot tell whether to treat the player as a victim or a criminal, and "in an anarchy, pirates attack the player unprompted" has no defined mechanism beyond the default role.

**How to avoid:** include role weights and flags in `PlayerLawState` (C2), save them, hash them; pass the slot draw from the player's own stream. If the roadmap decides to cut them, record the default (`player-unknown`) as a divergence and test the AI's behaviour with it.

**Phase to address:** P-Data, P-Law.

---

### Pitfall M5: NPC-versus-NPC fights multiply per-tick costs that were sized for 12 inert ships

**What goes wrong:**
The 12-ship world made `runProximityPass`, `createShipField`, `sanitizeEntity`, `npcContacts` and the hit-candidate scans cheap. With 40 to 100 steered ships: proximity checks are all-pairs for ships (the prefilter applies to buoy pairs only, `2026-11-20-collision-chain-prefilter-all-pairs.md`); each reconsideration runs a scan and `threatAssessment` over scan results; `requestHelpFromGroup` and distress broadcasts are O(n^2); every laser shot tests the hull octree of each candidate ship; `hashWorld` string-builds every entity per call in tests (a 256-entity hash is on the order of 200 KB). The world also runs inside the fixed step: a slow tick slows the frame and, with the app's catch-up, the simulation lags.

**How to avoid:** a soak benchmark in the P-Verify plan (not a gate on the slow machine, but a measured number recorded in the SUMMARY): 100 ships, 60 simulated seconds, mean and p99 tick cost on the remote machine and in the browser; early-out all bounded loops by scanner range; keep the bounded drain constants; measure before optimising. The `verify-full` run is about 10 minutes on the remote machine, so plan gates by change type (AGENTS.md): sim-only plans run `test`, `lint`, `typecheck`; `src/app/session/traffic.ts`, render and UI plans run `verify`.

**Phase to address:** P-Verify; bounds in P-AI.

---

### Pitfall M6: Scooping is a two-stage tractor process in the collision chain, and the pods have no contents

**What goes wrong:**
- `collideWithShip` tests `canScoop` before any damage: needs the equipment that provides `EQ_CARGO_SCOOPS`, hold space, the other to be `CLASS_CARGO` with a cargo type, in front of the ship, and for the player below it (`v_up . loc > 0` rejects; `ShipEntity.m:11183-11208`). Then `scoopIn:` calls `getTractoredBy:` (`ShipEntity.m:11211`): the pod stops, its AI is replaced by nullAI, it becomes `BEHAVIOUR_TRACTORED` with status `BEING_SCOOPED`, its owner is the scooper, and every other scooper loses it as a target ("Dibs!"). `behaviour_tractored:` (`ShipEntity.m:3729`) then pulls it by a spring until within twice its collision radius and calls `scoopUp:`. `BEHAVIOUR_TRACTORED` is in the unported list (`dispatch.ts` header notes it is moved by a rule the fallback does not reproduce). Wegolite's collision stage documents "no scoop branch (11035-11042, PD-05): rammed pods take damage" (`src/sim/combat/response.ts`, `collide.ts:557`).
- Pods are anonymous: "Every pod is one anonymous `barrel` cargopod (D16-01, OC-1)" and "Draws for features not modelled are not taken (D16-24): Oolite's commodity, amount and 50 % pod role roll (`Universe.m:3863-3878`, `3977-3996`)". Scooping needs a commodity and amount per pod. Adding those draws moves every debris draw in every pinned debris test (they sit in the 13 per-pod draws, `POD_DRAWS_PER_SURVIVOR`), so it is a P-Data decision with one measured re-pin (the standing approval for twin hash re-pins applies only "if cause measured and Node=browser", memory note).
- The hold is app-side (`PlayerProfile.cargo`, capacity from equipment and passenger berths), the scoop decision is in the sim. The step needs the free hold as an input option (like `hyperspace.shipMasses`) and emits `cargoScooped` (already reserved in `events.ts`), and the app adds the commodity. Capacity has to count as Oolite does (`[cargo count] >= maxAvailableCargoSpace`, pods not tonnes).
- "Fuel Scoops" provides `EQ_CARGO_SCOOPS` (`equipment.json`), and a damaged scoop provides nothing (`hasEquipmentItemProviding:` matches the exact key or an item that provides it; the todo `2026-11-21-damaged-equipment-in-use.md` and `tests/guards/damaged-equipment-in-use.test.ts`). Test through the **installed** list, not the key.
- The related open divergences become live: debris does not inherit the ship's velocity (`2026-11-24-debris-inherits-ship-velocity.md`), so pods stay near the kill point and the geometry of "fly through the pods behind a fast kill" differs from Oolite; pods do not block jumps (`2026-11-20-divergence-d08-pods-plates-block-jump.md`), so a player may hyperspace with a pod nearby where Oolite refuses.

**How to avoid:** decide in P-Data whether pods carry a commodity (one re-pin) and their cargo draw order; port `canScoop`, the tractor and `scoopUp` as sim code in the collision stage ahead of the damage branch; add a TRACTORED behaviour to the routing table or give tractored pods a dedicated drift step (a recorded cut either way) and make tractored pods immune to laser and ram damage for the duration; update the damaged-equipment guard; pass the hold as a step input; schedule the debris-velocity todo with this phase, since scooping is where it shows.

**Phase to address:** P-Data (pod contents), P-Scoop.

---

### Pitfall M7: Populator formulas hide float and ordering traps

**What goes wrong:**
The counts depend on `system.info.systemsInRange()` (7 LY) and `systemsInRange(3.5)`, on `routeToSystem`, on `economy`, `government`, `techlevel` of neighbours, on a `bottleneck` test, and then on `randomise(count)`. Wegolite's hyperspace code already computes distances; deriving them a second time (squared-versus-root, float32 versus float64, inclusive versus strict compare at exactly 7.0 or 3.5) produces different neighbour sets for borderline systems. The rates are summed in a loop whose order is the order of the returned list (system id order); changing it changes rounding of the sums. Initial counts convert hourly rates to "per 20 s" by `/180` and `randomise` draws `Math.random()` twice and once more (`count*(0.25+0.75*(r1+r2))`, `if (r3 < count - floor(count)) r++`).

**How to avoid:** reuse the existing hyperspace distance and range functions (the ones the chart and fuel use), with the strictness the jump rules use; port the formulas as straight-line code with the C and JS line numbers in comments; verify against the oracle harness by loading `oolite-populator.js` in the same `node:vm` loader with a stub `system.info` (the harness approach in `tools/ai-harness/load.ts`), and compare counts for a table of systems.

**Phase to address:** P-Pop.

---

### Pitfall M8: The player-side accuracy of "pirates attack unprompted" depends on engine state the acceptance sentence assumes

**What goes wrong:**
Pirates choose targets by `conditionInCombat`, `configurationAcquireCombatTarget`, scanner predicates, `threatAssessment`, `conditionLosingCombat`, `ship.hasHostileTarget`, and by the player's role and cargo. A spawned pirate may be far from the player (the populator places packs at lane points, lane lengths are on the order of hundreds of kilometres, `l1length/600000` in the populator; the scanner range is 25.6 km), so "in an anarchy, pirates attack the player unprompted" needs a scenario where one is within range, and a Wegolite arrival at the witchpoint buoy places the player at a specific place relative to `LANE_WP` groups.

**How to avoid:** write the acceptance as a deterministic scenario test (a seed, a position, a tick budget) plus a statistical check over many seeds, and record in the plan what fraction of arrivals in an anarchy meet a pirate within N seconds in real Oolite (from the Oolite comparison) so the threshold is measured, not asserted.

**Phase to address:** P-Verify.

---

### Pitfall M9: The HUD message line is a single FIFO of 4 s per message

**What goes wrong:**
Bounty awards, legal changes, comms and kill notes all want the message line. The existing line is "one FIFO line with 4 s per message" (`2026-11-17-ui-flight-hud-differences-from-oolite.md`, R1: a 14.7 s delay for a reply). In a fight a backlog of 10 messages delays "Mass locked" or a bounty award by 40 s.

**How to avoid:** cap and prioritise (replace-newest for comms, preserve awards), or implement Oolite's message rules (priority, `clearPreviousMessage`, `addDelayedMessage` for the bounty at 0.15 s delay and 6-count duration, `PlayerEntity.m:6082-6085`). UAT must include a fight scene: v2.3 lesson 2 says schedule a gap-closure round for every HUD or screen change.

**Phase to address:** P-Law.

---

### Pitfall M10: The frozen acceptance semantics and the new AI both read "behaviour that never ends"

**What goes wrong:**
The acceptance harness (`tests/acceptance/detectors.ts`) throws on any flyer death, treats a repair, an AI fault or a drop as a violation and checks `hashWorld`. A change to the dispatch fallback (C10), the fire gate (`npcFireBlocked`, `fire.ts` header: a ship with no AI, or targeting itself, is refused before the gate) or the event drain bounds (C5) alters the flyers' scripted behaviour. `npcFireBlocked` is the one place where "a ship with no AI never fires" is enforced; with real AI on production ships the harness's flyers must still be refused when the harness opts out.

**How to avoid:** keep the frozen flyers on `flight-script` and keep `fire: true` opt-in for them; add a test that a frozen-world run produces identical per-tick hashes before and after each v2.4 plan (the C1 pin); never make the priority AI the default `aiKey` of the inert path.

**Phase to address:** P-AI, P-Verify.

---

## Minor Pitfalls

### Pitfall m1: Units and the reward formula
Oolite credits are tenths: `credits += 10 * bounty` is already in decicredits (`PlayerEntity.m:6062-6075`). Wegolite stores decicredits (`formatDecicredits`). A unit slip pays 10x or 0.1x; pin the three rewards (bounty 25, a pod, a buoy) in a test.

### Pitfall m2: Combat rating thresholds and the display
Thresholds are kill counts 8, 16, 32, 64, 128, 512, 2560, 6400 (`OOConstToString.m:373-397`, hex 0x8-0x1900); `formatRating` already prints `"%@   (%u)"` and `buildStatusModel` hardcodes kills 0 with a comment pointing at LAW. Counting from the first `shipKilledOther` rather than from `countsAsKill` and the cargo/buoy/rock exception inflates the tally. `ship_kills % 256 == 0` also posts a congratulation message.

### Pitfall m3: Legal status halves at each jump and at nothing else
The only automatic decay for the player is `legalStatus / 2` at arrival (`PlayerEntity.m:6887`, `Universe.m:1061`). Do not add time-based decay. Wegolite clears the world at jump commit; apply the halving at the same point the world is replaced (the jump step rule, `sim.ts` doc), and test it at all three cadences.

### Pitfall m4: `STATUS_LAUNCHING` and no-collision/no-damage windows
Oolite ignores scrapes while either ship is launching (`takeScrapeDamage:` line 11646) and v2.3 clamps the player's energy while launching (OQ-10). A pirate near the station at launch must not kill a launching player; check the fire gate for the same rule and test one case at the station.

### Pitfall m5: Fines, `markedForFines` and the police "fine" behaviour are a separate feature
`conditionScannerContainsFineableOffender` / `behaviourFineCurrentTarget` / `markTargetForFines` drive police toward offenders at or below the fine threshold without attacking. If fines are not in v2.4, record that such offenders are simply ignored (and that police scan for them every 10 s), not left to idle in an unported behaviour.

### Pitfall m6: `fuel scooping` is out of scope but the same equipment key serves both
"Fuel Scoops" is bought for cargo; fuel scooping at the sun is deferred with the hazards. A player who flies near the sun with scoops gets nothing, which is the recorded divergence; do not add partial fuel scooping.

### Pitfall m7: Process traps from earlier milestones that recur
(a) Later phases editing files an earlier phase's VERIFICATION covers make it stale: re-run the verifier at close (v2.1/v2.2 lessons). (b) Run `/gsd-audit-milestone` before closing (v2.3). (c) A major owner-reported bug during UAT gets a debug session in the same phase: the docked F-key bug is still open and v2.4 UAT will pass through the docked screens (F5, F8, F3). (d) The e2e specs run the browser-test bundle with traffic off by default; production has traffic on, so a spec that needs ships opts in with `?test=1&traffic=1`; check that no spec sees a pirate it did not ask for. (e) Docker only, no host Node: `docker compose down --volumes` after any dependency change (none expected).

---

## Oolite JavaScript to TypeScript porting traps (checklist)

| Trap | Where | Rule |
|------|-------|------|
| `Math.random()` is float64, `randf()` is float32, `ranrot_rand()` an integer | priorityai.js, populator.js, ShipEntity.m | Draw at the same point; `Math.fround` where C holds a float; `floor(u * N)` for `% N` (Wegolite's existing rule in `dispatch.ts`) |
| Short-circuit order decides whether a draw happens | `4233`, `4242`, `5349`, `5456` | Keep operand order; one test per site |
| `!=` binds tighter than `&` | `priorityai.js:5161` | Reproduce or record; never fix silently |
| `x \| y` and `JS_ValueToInt32` | `setBounty` args, `OOJSShip.m:2819` | 32-bit truncation toward zero; reject negatives |
| `==` and `!=` are loose | `AIScriptWakeTime == 0`, `cs[i].risk == 1`, `target != this.ship` | Port as strict compares only where all operands share a type; check `null` versus `undefined` (missing parameter is `null`, `getParameter` line 400) |
| `key in parameters` / property reads on user keys | `getParameter` | Use own-property checks (`Object.hasOwn`), as `aiModuleFor` already does (T-08-53) |
| `Object.keys` order and `for..in` | `applyHandlers`, `$repopulatorFrequency*` loops | Iterate a fixed array of names; the lint bans `for..in`; sort with an explicit comparator |
| Default `Array.prototype.sort` is lexicographic | any numeric sort | Always pass a comparator |
| JS numbers are float64, engine properties are float32 | `ship.speed`, `energy`, `accuracy`, `maxSpeed`, positions | Round values at the engine boundary (`Math.fround`) when the value is read back from a C float, not inside JS arithmetic |
| Entity references in parameters | all `oolite_*` entity params | Store ids, resolve through `view`, tolerate removal |
| Timers (`new Timer`) and `clock.*` | lines 50, 205, 234, 425, 5586 | Ticks in state; strict-greater wake; no timer objects |
| Closures capture `this.ship` | `aiStarted` of every role | Static tables take the ship as an argument |
| `Date`, `clock.seconds` vs `adjustedSeconds` | priorityai.js | Classify per site (C5) |
| JS `%` is the remainder, `ranrot_rand() % n` on a uint | `ShipEntity.m:10526` | Port to `Math.floor(u * n)` with the same n |
| Sorting threat lists, `Math.max` over `undefined` | `threatAssessment` | Guard totality: the AI zone must not throw (a throw makes the ship `ai = null`, one `aiFaulted` event) |

---

## How comparing against headless Oolite can mislead

The reference (`tools/oolite-reference`, Oolite 1.93.1-255 AppImage on the remote machine under Xvfb and llvmpipe) is the only running Oolite available; it measured masses and radii bit-exactly in v2.1. It is much weaker for traffic and fights:

1. **The reference JS may differ from the checkout.** The README records 14 commits of skew against the `7437f22` pin and says they do not touch `ShipEntity`, `Octree`, `OOMesh` or `Universe`; it does not say the same for `Resources/Scripts/oolite-populator.js`, `oolite-priorityai.js` and `Resources/AIs/*.js`, which carry the behaviour. Extract the AppImage's `Resources` and `sha256sum` those files against the checkout before any comparison; if they differ, port from the checkout's files and compare against the AppImage's text, and record which.
2. **No seed.** Oolite's generators are time-seeded and `Math.random` in the script context is the engine's own. One run is an anecdote; distribution comparison needs 20 to 30 runs per scenario (each run is minutes: `docked.steps` smoke is 40 s), a pre-written statistic (for example role counts by class, group-size histogram, bounty histogram, fraction of arrivals with a pirate within 60 game seconds), and thresholds written before the Wegolite run, in the manner of `thresholds.ts`.
3. **Game time is not wall time.** On llvmpipe the frame rate is low and `GameController.m:344` caps `delta_t` at `MINIMUM_GAME_TICK` 0.25 s, so game time runs slower than wall time and every update is coarse. Anything timing-sensitive (shot cadence, tracking curve, pursuit paths, collision tunnelling) differs for reasons that are not port defects. Compare structural outcomes (who attacks whom, who flees, who is marked, what is paid) and use game-clock timestamps from a probe OXP, not `waitlog` wall time.
4. **The comparison world is bigger than the port.** Real Oolite adds scavengers, shuttles, miners, hermits, asteroids, Thargoids, repopulator arrivals every 20 s and station launches. Filter by the roles Wegolite implements and compare initial population and then steady state separately; never compare totals.
5. **Different catalogue.** Wegolite has nine hulls and no aft weapons; Oolite draws Anacondas, Boas, Pythons and others. Compare by role class and by behaviour, and make the Wegolite side explicit about hull coverage.
6. **A docked, idle commander is not a flying player.** The scripted session (`docked.steps`) has no flight input; pirates need the player in range. Use a probe OXP to place or script the player, or measure NPC-versus-NPC encounters, and record that the player-attack acceptance is an in-Wegolite test, with the Oolite side giving rates only.
7. **Log perturbation and flush.** Output is flushed every 2 s with no signal handler; `log(name, text)` must use two arguments; a late flush can drop the last lines at exit. End every steps file with a `waitlog` on a sentinel the OXP prints after the last measurement.
8. **A reproduced upstream bug looks like a Wegolite bug.** Where Oolite's JS is wrong (the precedence bug in C7) the reference does the wrong thing and Wegolite's fidelity rule says to match it or record the divergence. Confirm any suspected bug in the running reference before writing a divergence row.
9. **The probe stays out of the repository.** The README is explicit that OXP support is out of scope and a probe OXP is a throwaway kept outside the repository; Oolite output (logs, screenshots) is CC BY-NC-SA and must not be committed.

---

## Phase-Specific Warnings

| Phase topic | Likely pitfall | Mitigation |
|-------------|----------------|------------|
| P-Data: field design | C2 piecemeal snapshot bumps; law state outside the hash | One design plan, one bump (snapshot v5, save v6), `PlayerLawState` hashed with pristine-omit |
| P-Data: catalogue | C1 shared acceptance fixture; C9 aft weapons, missiles, role-to-AI | Isolate the frozen path; decide hull boundary; compile bounty, escorts, missiles as zero |
| P-Data: removal and caps | C11 no non-lethal removal; C12 cap | Design `departShip`; compute population distribution for all systems |
| P-Pop: populator | C1, C4 forked streams, M7 float and order, C12 atomic groups, repopulation decision | New function; per-group `forkSeed`; atomic reserve; oracle on `oolite-populator.js` |
| P-AI: framework | C3 state shape, C4 draws, C5 timing, C10 unported behaviours, M2 scan order, M3 comms | Typed state, differential harness oracle, coverage manifest, reachability tripwire |
| P-AI: hit reactions | C6 ledger lacks side effects; shipHit todo | Hit-reaction stage with Oolite's order; update `ship-hit-consumers` guard |
| P-AI: roles | M1 groups, M4 player role history, C9 AI by role | Group table; role weights in law state; `autoAImap` content test |
| P-Law: status and bounty | C7 bit flags, station responder, docking refusal scope; C8 credit decision | Integer score; first plan decides credit; update kill, on-event, fire guards |
| P-Law: UI | M9 message FIFO; m2 rating | Cap or prioritise messages; UAT fight scene |
| P-Scoop | M6 pod contents, tractor, hold input, damaged scoops, debris velocity | One decided re-pin; tractor in collision stage; installed-list check; schedule debris velocity todo |
| P-Verify: acceptance | C1 rerun by hand on the remote machine; IN-04, IN-05 and the collisions-on variant need owner approval | Ask the owner once in the first plan; record results in SUMMARY |
| P-Verify: Oolite comparison | Oolite-comparison section above | Hash the reference JS, N runs, thresholds first, game-clock logs |
| P-Verify: performance | M5 per-tick cost; C12 soak | 100-ship soak, recorded numbers, bounded drains |

---

## Decisions the roadmapper should surface to the owner early

These are consequences of the findings above, not research conclusions; each wants a Key Decisions row and, where it diverges, a FIDELITY.md row with reviewer agreement.

1. Does v2.4 lift the aft-weapon refusal (needed for Anaconda, Boa and freighter-led packs) or keep the nine-plus hull set and compare by role class (C9)?
2. Repopulation: initial population only, or a timer-driven repopulator (C12)?
3. Pod lifetime or headroom rule while scavengers are deferred (C12), and whether pods carry a commodity now (M6).
4. NPC departure policy: dock, jump, land as Wegolite-only removals (C11).
5. The main station's responder and `launchPolice`: minimal marking only, or police launch (C7).
6. Kill credit rule for same-tick kills and the owner edit narrowing the kill-time `shipTargetLost` (C8).
7. Should `test:acceptance` join a gate, and may the harness gain a collisions-on and an idle-flyer variant (C1)?
8. Milestone text says bounties are "paid on docking"; in Oolite the bounty is paid at the kill (`collectBountyFor`, `PlayerEntity.m:6040-6091`) and what is paid on docking is the escape-capsule reward (LAW-05, deferred). Confirm the intended behaviour before the law plans are written.

---

## Sources

- Oolite checkout (pin `7437f22`): `Resources/Scripts/oolite-priorityai.js` (lines 36-340 constructor and reconsideration, 339-460 communications, 459 `reconsiderNow`, 567 `setPriorities`, 689 `checkScannerWithPredicate`, 841 `fineThreshold`, 1170 `playerRoleAssessment`, 5024, 5161, 5321-5371, 5987, 6033), `Resources/Scripts/oolite-populator.js` (215-700 counts, 1038-1300 repopulator, 1380-2110 group builders, 2225-2420 weapons, skill, missiles, `_addShips`), `Resources/AIs/oolite-pirateAI.js`, `oolite-policeAI.js`, `oolite-traderAI.js`, `oolite-stationAI.js`, `Resources/Config/autoAImap.plist`, `shipdata.plist`; `src/Core/Entities/ShipEntity.m` (665-672, 2145, 2480, 3731, 3989, 4078-4136, 8448, 8806, 10521, 11183, 11440-11580, 11640-11667, 11832, 12257-12303), `PlayerEntity.m` (879-882, 4486-4536, 5643, 6019-6091, 6887, 10452), `StationEntity.m` (412, 1125-1145, 1861), `Universe.m` (1061, 3624-3660, 5090-5097, 5932-5952), `OOConstToString.m` (373-420), `OOJSShip.m` (1335-1346, 2808-2830), `GameController.m` (344), `GameController.h` (36).
- Wegolite: `.planning/PROJECT.md`, `.planning/RETROSPECTIVE.md`, `AGENTS.md`, `.planning/todos/pending/` (mutual kill credit symmetry, narrow kill-time shipTargetLost, skip shipHit for a doomed target, cargo legality penalties, missiles and ECM, acceptance run with collisions on, phase 14 review follow-ups, damaged equipment in use, debris inherits ship velocity, D-08 pods block jump, collision-chain prefilter, UI differences from Oolite), `src/sim/world/{populate,step,kill,serialize,snapshot,limits,entity,debris,ids}.ts`, `src/sim/ai/{types,registry,time}.ts`, `src/sim/npc/{dispatch,fire,state}.ts`, `src/sim/npc/behaviours/attack.ts`, `src/sim/events.ts`, `src/sim/sim.ts`, `src/app/session/traffic.ts`, `src/persistence/save.ts`, `tests/acceptance/{thresholds,detectors}.ts`, `tests/helpers/traffic-fixture.ts`, `tests/guards/*`, `tools/ai-harness/*`, `tools/oolite-reference/README.md`, `tools/oolite-ingest/convert/npc-ships.ts`.
