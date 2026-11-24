---
phase: 15
reviewers: [opus, fable]
reviewed_at: 2026-11-16
plans_reviewed: [15-01, 15-02, 15-03, 15-04, 15-05, 15-06]
round_2_reviewed_at: 2026-11-16
round_2_head: 8511629
---

# Cross-AI Plan Review: Phase 15

Both reviews were run as independent Claude subagents (opus, fable), read-only, verifying against the source. No external CLI was used.

## Opus Review

# Phase 15 plan review (Damage Ledger and Kills), independent reviewer: Opus

Scope: plans 15-01 to 15-05, checked against the tree at `689ca3c`, the Oolite checkout at `/home/opencode/git/oolite` and the vendored `third_party/oolite/`. Nothing was run; I made no edits to tracked files. Every claim below cites the file and line I read.

Overall: the plans are well-grounded. Almost every interface they name exists with the stated signature. The D-11 inventory line references check out. The strip-and-rehash mechanism is sound. The main gaps are not in what the plans touch but in what they do not look at:

- **Dangling ids.** The kill path is the first removal of an entity in real play. Nothing has audited the ids that other ships hold after a removal, and nothing tests them.
- **The kill-on-spawn case is underspecified.** As written, the directed case collapses into "killed on its first step".
- **The single weapon temperature.** The one-way field quietly assumes forward-only NPC weapons, and Oolite tracks temperature per facing.

---

## 15-01

### 1. Summary
This plan covers DATA-14. It compiles `likelyCargo`, `maxCargo`, aft, port and starboard weapon types and positions, `fragmentChance` and `explosionType` into the strict NPC schema. It also covers the hand-written golden, the regenerated `ships-npc.json` with its manifest, and the NOTICE paragraph. It carries the phase-wide D-11 inventory and the canonical artifact names. There are two tasks, a tracer for the cargo pair and then the rest.

### 2. Strengths
- The Oolite semantics are cited correctly:
  - Every facing type is read only behind its `weapon_facings` bit, and the mask defaults to 15 (`oolite/src/Core/Entities/ShipEntity.m:297-305`).
  - `max_cargo` and `likely_cargo` are read with `oo_unsignedIntForKey` (`:378`, `:566`).
  - `fragment_chance` is a fuzzy boolean with a 0.9 default (`:372`).
  - An absent `explosion_type` is nil, which Oolite treats differently from an empty array (research notes `ShipEntity.m:491`, `:7960-7981`).
- The forward weapon now follows the mask too. I checked the risky record: the shuttle authors `weapon_facings = 0` (`third_party/oolite/Config/shipdata.plist`, about line 3542), and its compiled `forwardWeapon` is already `EQ_WEAPON_NONE` (`src/content/generated/ships-npc.json:192`). So gating forward by the mask changes no existing record, as the plan claims.
- Keeping the refusal loop over `STEERING_ASSUMED_ABSENT_KEYS` is right, and a mutation-guard criterion protects it.
- The D-11 inventory is accurate where I sampled it:
  - `tests/sim/combat/step.test.ts:622-634` is the N2 test.
  - `tests/sim/world/sanitize.test.ts:1094-1101` is the "steer is last" pin.
  - `tests/sim/rng.test.ts:195` is the purpose-code pin.
  - `tests/sim/combat/ident.test.ts:473` is the only direct `resolveShots` caller outside `sim.ts`.
- I ran the straggler recipe again. It finds nothing lethal outside the listed rows; the `liveEntityCount` hits in `tests/app/session/*` are population counts, not survival assertions.

### 3. Concerns
- **LOW: `fragmentChance` is inconsistent between its default and an authored value.** `floatExtra` applies `Math.fround` to an authored value but returns the fallback untouched (`tools/oolite-ingest/convert/npc-ships.ts:156-164`). The default compiles to exactly `0.9`; an authored `0.9` compiles to `0.8999999762`. None of the nine authors the key, so nothing breaks today. It is still a latent golden and fidelity wrinkle, because Oolite keeps the probability as a float.
- **LOW: the converter is stricter than Oolite on fuzzy-boolean values.** `oo_fuzzyBooleanForKey` also accepts `YES`/`NO` and strings, while `floatExtra` fails the build on them. Failing loudly is acceptable, but the plan should say it is a deliberate narrowing.
- **LOW: the acceptance run here adds little.** The plan schedules the remote 20-seed run because `ships-npc.json` changed, but no sim code reads the new fields until 15-03. AGENTS.md still requires the run. If the slow machine is the bottleneck, one run after wave 1 covers both 15-01 and 15-02 (see the cross-plan section).

### 4. Suggestions
- Pass the fallback through `Math.fround` as well, or document that only authored values are float32 and pin the default in the golden as `0.9`.
- State in the converter header that string or boolean `fragment_chance` values are refused on purpose.

### 5. Risk assessment
**LOW.** This is a content and schema change behind a strict schema, a hand-written golden and the drift gate. The values I spot-checked match the vendored plist and the research table.

---

## 15-02

### 1. Summary
This plan designs the one v4 field set before any behaviour uses it:
- `Entity.velocity`, `Entity.weapon {temperature, lastShotTick, missedShots}` and `Entity.cargo`.
- A per-world `staticHealth`.
- Hash segments `;vel:`, `;wpn:` and `;cargo:` after `;steer:`, and a `statics:` line, all omitted while pristine.
- `WORLD_SNAPSHOT_VERSION` 4, with the parser, the sanitiser and bounds in `limits.ts`.

The Lave golden must stay `c1068643`.

### 2. Strengths
- Pristine-omit works as described. `serializeEntity` joins fixed segments ending with `steer:` (`src/sim/world/serialize.ts`, the `serializeEntity` body). Appending segments only when they hold a non-zero value leaves every pristine line byte-identical, and the unchanged-golden criterion is a real mutation guard.
- The segment text cannot break the strip regex. `vecText` and `canon` output contain no `;`, and the `/;(?:vel|wpn|cargo):[^;\n]*/g` regex anchors on the leading `;`. It therefore cannot match labels inside `steer:` such as `acc:` or `pa:`.
- The sanitiser and parser helpers the plan names exist and agree on domains:
  - `cleanSymmetric`, `cleanRange` and `cleanUint32` are at `src/sim/world/sanitize.ts:122-150` and `:347-352`.
  - `limitedNumber` and `uint32` are at `src/sim/world/snapshot.ts:545-567`.
  - So the existing sanitiser-parser agreement property can cover the new leaves.
- Both `Entity` construction sites are covered: the spawn `make` callback in `world.ts` and the entity literal in `restoreWorld`. I found no hand-built `Entity` literals in the tests that typecheck would trip on.
- No migration is needed for the version bump. `snapshotWorld` and `restoreWorld` have no callers in `src/app` (rg over `src` finds none outside `snapshot.ts`), so world snapshots really are not persisted.
- Calling `sanitizeStaticHealth` inside `hashWorld` follows an existing precedent: `hashWorld` already repairs the combat state before printing it (`serialize.ts`, the `sanitizeCombat(combat)` call).

### 3. Concerns
- **MEDIUM: one weapon temperature hard-codes "forward weapon only" in a one-way field.**
  - Oolite keeps a temperature for each facing: `forward_weapon_temp`, `aft_weapon_temp`, `port_weapon_temp` and `starboard_weapon_temp`, plus the active `weapon_temp` (`ShipEntity.h:303-304`). It cools each one (`ShipEntity.m:2213-2218`) and reads them when choosing an attack facing (`ShipEntity.m:4078-4088`).
  - Plan 15-01 compiles all four facings, and the roadmap says Phase 17 reads them.
  - A single `temperature` is correct only while no NPC has a non-forward weapon. That is guaranteed today only indirectly, by the converter's `STEERING_ASSUMED_ABSENT_KEYS` refusal loop.
  - The plan never states this link. If a later phase lifts the refusal (an OXP-free change to the catalogue, or a ship with an aft laser), the result is a second snapshot bump.
- **LOW: `lastShotTick = 0` is a sentinel meaning "never fired".** Oolite starts `shot_time` at a large "long ago" value instead. Phase 17 must special-case 0 rather than compute `tick - 0` as the time since the last shot. The plan documents the meaning; the key-decision row should also say that the gate treats 0 as ready to fire.
- **LOW: the hash label `statics:` reads like the existing `World.statics`.** That field is the static entity table (`src/sim/world/world.ts:104`). A more specific label, such as `shp:` or `staticHealth:`, avoids confusing the two in a hash diff.
- **LOW: repairs to static health are not counted.** `sanitizeStaticHealth` has no counter, and the acceptance run's `repairs 0` check reads only entity repairs. A corrupt `staticHealth` would be silently healed, which is acceptable, but the plan says "repairs 0" as though it covered statics.
- **LOW: the D-01 wording undersells velocity.** The `Entity.velocity` doc says "Phase 16 writes it". Phase 16 criterion 1 also has "the blast pushing neighbours", which writes ships' velocity, and Phase 18 rebounds will too. Say "any phase that applies drift" so nobody reads it as debris-only.

### 4. Suggestions
- Name the field `forwardTemperature`, or document that `temperature` is Oolite's `forward_weapon_temp`, kept valid by the `STEERING_ASSUMED_ABSENT_KEYS` refusal. Add a cross-reference comment on that refusal loop saying that lifting it requires a snapshot bump.
- Add one test to `hash.test.ts`: a weapon with only `lastShotTick` set (temperature 0, missed 0) still prints `;wpn:`. The plan covers the `missedShots`-only case; covering all three single-leaf cases closes the pristine-hiding threat (T-15-06) completely.

### 5. Risk assessment
**MEDIUM.** The mechanics are low risk and well guarded: the unchanged golden, the refusal rows and the agreement property. The risk is the one-way nature of the field design. The weapon record's per-facing gap is the one place where the design could force the second bump the phase exists to prevent.

---

## 15-03

### 1. Summary
This plan sets each populated NPC's cargo count at spawn with a port of Oolite's `setCargoFlag:`. The count comes from a stateless stream, `forkSeed(worldSeed, id, "cargo")` with code 4. The plan maps the two record fields through `trafficContent`, regenerates the Lave golden once with the three-link strip proof (`c1068643` → `ab72eedf` → `b23d11d8`), and records the v4 field set in Key Decisions in the same commit.

### 2. Strengths
- The core design is right. A stateless fork leaves `world.rng`, `nextId` and every stored stream bit-identical, so the strip proof back to `c1068643` is a genuine invariant and not a hope.
- `forkSeed` already validates the purpose with `Object.hasOwn` (`src/sim/rng.ts:124-135`). Adding `cargo: 4` to the frozen table is the only change needed. The test of unknown purposes (`tests/sim/rng.test.ts:300-314`) is unaffected.
- The port of `setCargoFlag:` matches Oolite's code at `ShipEntity.m:7323-7373`:
  - Truncation of `likely_cargo * (0.5 + randf())`.
  - The cap at `maxAvailableCargoSpace` (`:7198-7201`) and at 200.
  - `Ranrot() % (1 + num/2)` for pirates.
- `rngNext` returns a value in [0, 1) (`src/sim/rng.ts:36-42`), so `floor(rngNext * (1 + floor(num/2)))` is the right analogue of the modulo.
- The "at least 4 ships carry cargo" assertion holds by arithmetic:
  - Moray trader: `floor(5 × [0.5, 1.5))` ≥ 2.
  - Cobra Mk I: ≥ 5.
  - Adder: `floor(2 × 0.5)` = 1, so ≥ 1.
  - The shuttle slot uses the Adder record, so ≥ 1.
- Checking the id with `forkSeed` before calling it keeps the function total (`forkSeed` throws outside uint32).
- I found no other literal world hash pinned over a traffic-populated world: an `rg` for 8-hex literals finds only `populate.test.ts:509,522`.

### 3. Concerns
- **LOW-MEDIUM: the wrong Oolite source is cited for which ships get cargo.**
  - The plan cites the legacy `Universe.m:2538/2554` path. The live populator in Oolite 1.80+ is `Resources/Scripts/oolite-populator.js`, which `src/sim/world/populate.ts:19` itself names as its source.
  - There, pirates get `PIRATE_GOODS` only when the group is not placed at a station or planet (`oolite-populator.js:1711-1713` and `:1862-1865`). Traders get `goods` (plentiful or scarce, `:1448`, `:1492-1522`).
  - Applying the pirate rule regardless of location is a small fidelity divergence. Record it in FIDELITY or Key Decisions, or gate it on the populator location.
- **LOW: one Task 1 stop condition cannot trigger.** Task 1 says to stop if "the full suite shows a literal hash pinned over a traffic-populated world that moves", but Task 1 runs only four targeted test files. The full suite first runs in Task 2. Either run the full suite in Task 1 or drop the condition; my search suggests nothing would trip it anyway.
- **LOW: equipment weight is assumed to be 0 for the nine ships.** This holds for the stock data, but `maxAvailableCargoSpace` subtracts `equipment_weight`. A comment naming the assumption would let a later equipment phase find it.

### 4. Suggestions
- Cite `oolite-populator.js` as the source of which roles get cargo, and keep `ShipEntity.m:7323-7373` for the counting rule. Add a divergence row for the location condition on pirate cargo.
- Record the twelve per-ship counts in the SUMMARY, as the output section asks. Also add them as a small table assertion in `populate.test.ts`, so a later change to `cargoCountAtSpawn` fails on a readable diff rather than only on an FNV value.

### 5. Risk assessment
**LOW.** The determinism argument is airtight, and the golden regeneration is guarded at both ends: the old FNV stays pinned through Task 1, and the strip proof runs after the regeneration. Remote `verify` is scheduled because `traffic.ts` changes.

---

## 15-04

### 1. Summary
This plan covers FOUND-19:
- `applyLedger` in a new `src/sim/combat/ledger.ts`, which applies every hit record in ascending shooter id, decides lethality afterwards and credits the first lethal source.
- An idempotent `killShip` in a new `src/sim/world/kill.ts`, which posts the D-04 AI events.
- An exported `drainAiEventsNow`, which truncates the fire queue to its length on entry.
- A second `commitWorld` before `updateIdentTarget`.

It also amends the N2 pins, the cadence fight and the stale comments.

### 2. Strengths
- The tick-order analysis is correct:
  - `stepSim` runs `stepWorld` and then `resolveShots` (`src/sim/sim.ts:104-122`).
  - `stepWorld` drains AI events twice, sanitises and commits (`src/sim/world/step.ts:126-165`).
  - The post-drain passes (`startPendingTrackingCurves`, `runProximityPass`) post no AI events; `rg postAiEvent|emit` finds none in `proximity.ts` or `tracking-curve.ts`.
  - So after the immediate drain and the second commit, the boundary is clean.
- `snapshotWorld` refuses a dead entity, a queued AI event and a queued fire request (`src/sim/world/snapshot.ts:437-457`). The plan's mechanisms address each of the three.
- The idempotence and totality claims hold on the existing primitives:
  - `store.kill` returns false for a missing or dead id.
  - `store.get` hides dead entities (`src/sim/world/store.ts:89-115`).
  - `indexOfId` terminates for NaN, because every comparison is false and `high` falls (`store.ts:48-58`).
  - Static ids 1-5 and `PLAYER_ID` 100 never enter the store.
- `deliverAiEvent` skips dead targets (`step.ts:283-286`), and the view enumerates only non-dead entities (`view-impl.ts:149-150`). Handlers run during the immediate drain therefore never see a victim.
- Truncating the fire queue during the immediate drain is necessary and correct:
  - `ctl.fire` pushes onto `world.fireQueue` (`control-impl.ts:122-129`).
  - `drainFireQueue` has already cleared that queue earlier in `resolveShotHits` (`combat/step.ts:198-199`).
  - Without the truncation, an `onEvent` that fires would leave a request queued at the boundary.
- The ledger keeps the write-log invariant (`tests/sim/combat/step.test.ts:575-586`). It reads the energy before a single write, and nothing after the write reads it.
- The D-05 claim checks out. `identLost` is already routed to `hudMessages` with "Target lost." (`src/app/session/event-router.ts:118`, `:385-386`), and the reserved kinds are pinned as passing through the router (`tests/app/session-order.test.ts:870-897`). The router table and the probe shape therefore need no edit.
- The removal is visible with no render work. The render driver reads `npcContacts` fresh every frame and keeps no per-index state (`src/app/session/render-driver.ts:191-194`), and `npcContacts` skips dead entities (`contacts.ts`).
- The notification divergence is honestly recorded. Oolite's `noteTargetDestroyed` acts only when the primary target matches (`ShipEntity.m:8806-8812`), and other ships hear about the loss through `noteLostTargetAndGoIdle` (`:8774-8803`). The planned Key Decisions row says exactly this.

### 3. Concerns
- **MEDIUM: other ships' references to the dead id are not audited.**
  - `killEntity` has no caller anywhere in `src/` (rg: only its definition at `src/sim/world/world.ts:538`). This phase makes removal happen in real play for the first time.
  - Other ships keep the dead id in `nav.targetId`, `steer.proximityAlert` (written at `npc/proximity.ts:148`), `steer.saved.targetId`, and an escort's `ownerId`, whose leader refresh walks followers (`npc/escort.ts:66-78`).
  - The snapshot parser checks these ids only as uint32 (`snapshot.ts:690`, `:799`, `:869`, `:979`), so round trips are safe.
  - What has not been checked is whether every steering consumer handles a removed id. Examples: `proximityAlertBody` (`npc/avoid.ts:10-11` says it re-reads through `ctx.view`), escort behaviour after its mother is removed, and the attack behaviours.
  - Phase 14's steering property test may cover missing ids, but the plan never says so. The D-11 inventory, the RESEARCH notes and the 15-05 fight generator (inert ships and test pilots only) never exercise a native-steered ship whose target, escort mother or proximity body was killed.
- **LOW-MEDIUM: the mutual kill is not what Oolite does.**
  - Oolite fires lasers inside each ship's update and kills on the lethal hit (`ShipEntity.m:11556-11563`). The first ship to update kills the second before the second fires, so Oolite never produces a same-frame laser mutual kill.
  - The ledger applies every record before deciding who dies. That is the existing Phase 13 rule, "Damage is never applied mid-resolution" (`combat/step.ts:14-19`), so the design is consistent.
  - The plan's new Key Decisions row does not name this as a divergence from Oolite.
- **LOW: a ship that is already doomed still gets hit events.** It receives a `shipHit` event after its lethal record. In Oolite it would already be dead. The HUD and future audio may show hits on a ship that has died; say so in the docs.
- **LOW: the event order in the docs leaves out AI faults.** An `aiFaulted` event emitted during the immediate drain falls between `shipDestroyed*` and `entityRemoved*`. The documented order (`laserFired*`, `shipHit*`, `shipDestroyed*`, `entityRemoved*`, ident) should mention it.
- **LOW: the straggler sweep comes after the behaviour change, not with it.** Task 1 flips N2 but verifies only four files. Task 2 verifies six. The full suite and the D-11 straggler recipe run in Task 3. That contradicts the spirit of D-11 ("no piecemeal fixing by red runs"); running the recipe in Task 1 costs nothing.
- **LOW: no browser gate follows the change.** After 15-04 the live loop can remove entities, but no browser gate runs for the rest of the phase. Remote `verify` last runs in 15-03, before kills exist. This is policy-compliant (sim-only change), yet success criterion 1 ("leaves the 3D view and the scanner") is proven only by `npcContacts` unit tests.

### 4. Suggestions
- Add a short "dangling reference" inventory to Task 2: every field that holds another entity's id (`nav.targetId`, `steer.proximityAlert`, `steer.saved.targetId`, `ownerId`, test-pilot `params.targetId`), each with the line that tolerates a removed id.
- Add one `kill.test.ts` case that kills, in turn, an escort mother, a ship that another ship holds in `proximityAlert`, and the target of a ship in an attack behaviour. Then step 120 ticks with the real flight table and assert no throw, no `aiFaulted` and a clean boundary.
- Add one sentence to the "supersedes N2" Key Decisions row: simultaneous resolution allows same-tick mutual kills, which Oolite's sequential update does not.
- Move the D-11 straggler recipe into Task 1's action.
- Optionally run `verify` once on the remote machine after 15-04, or at the end of the phase, so the first live-loop kill runs through the e2e smoke.

### 5. Risk assessment
**MEDIUM.** The boundary mechanism is correct and well traced. The unexamined surface is the downstream code that, until now, never saw a referenced entity disappear in normal play.

---

## 15-05

### 1. Summary
This plan adds a tests-only proof:
- Directed cases through `stepSim`: kill on the spawn tick, mutual kill in both id orders, and a repeated kill request.
- A random-fight property that checks the boundary invariants and snapshot round trip after every tick, plus a replay from a mid-fight snapshot.
- A totality property for `applyLedger`, `killShip` and `drainAiEventsNow`.
- A cross-cadence kill scenario with non-pristine cargo, weapon and velocity.
- A 1,000-tick resume across a kill, and the validation sign-off.

### 2. Strengths
- `boundaryHolds` checks exactly what `snapshotWorld` refuses (`snapshot.ts:437-457`). It also checks that the round trip is equal on both the hash and the re-snapshot JSON, which is the right strength of test for success criterion 2.
- The directed mutual-kill case is feasible with existing machinery:
  - `ctl.fire` works for inert ships, because `actor()` needs only a live entity (`control-impl.ts:52-55`).
  - `drainFireQueue` does not require an AI (`combat/step.ts:205-213`).
  - The Viper's compiled weapon is a beam laser at 6 damage, which kills at `maxEnergy` 1 even after one tick of recharge.
- The cadence scenario's `;cargo:3` assertion at the first sample is safe. Sampling is every 30 ticks from `COMBAT_START_TICK` 2 (`tests/sim/world/world-cadence.test.ts:376-379`, `:508`). The pulse laser's period is 61 ticks (`combat/constants.ts:44-50`), so a 30-energy Adder is still alive at tick 30.
- The totality inputs include NaN source positions for records that hit the player. `routeDamage` handles a NaN offset without throwing: `!(dForward < 0)` sends it to the forward shield (`combat/shields.ts:130-135`).

### 3. Concerns
- **MEDIUM: "kill on the tick a ship spawns" is underspecified and probably vacuous as written.**
  - The store spawns immediately; there is no pending list (`store.ts:100-108`).
  - `stepWorld` uses `tick = player.tick`, which the flight step has already advanced (`step.ts:69-79`). An entity spawned "at the current tick" before `stepSim` therefore has `spawnTick = T` and is killed on tick `T+1`.
  - Phase 15 has no in-tick spawner: `ShipControl` has no spawn or kill (`control-impl.ts:59-129`).
  - So the case reduces to "killed on its first stepped tick", which the random property covers anyway.
  - The case that actually matters arrives in Phase 16: debris spawned inside `killShip` after `stepWorld`'s sanitise pass (`step.ts:153-158`) and before the second commit.
  - The plan should define the directed case precisely: spawn at `player.tick + 1`, or spawn from inside the tick through a test hook. It should also structure the harness so that Phase 16 can add an in-`resolveShots` spawn source.
- **MEDIUM: the fight generator never exercises native-steered NPCs.** It uses only inert ships and test pilots, so it inherits the dangling-reference gap described under 15-04. Every test pilot is steered by `steerShip`, because steering runs for any entity with an AI (`step.ts:107-118`), but test pilots never enter the escort, attack, avoid or flee behaviours.
- **LOW: the "told of it" property is narrower than it looks.** Test pilots set up the way `spawnTestShooter` does it write `ai.params.targetId` directly (`ai/test-spawn.ts:83-84`) and never `nav.targetId`. They are not "holders" under D-04, so the random property never asserts the `shipTargetLost` fan-out. That is fine, but the plan should say the fan-out is proven only by the unit tests in `kill.test.ts`.
- **LOW: the property may be slow on the test machine.** About 100 runs × up to 60 ticks, each with a snapshot, JSON round trip, parse, restore and two hashes, plus a full replay, is likely tens of seconds on the slow machine. The plan already asks for the wall time to be recorded. Consider capping `numRuns` at 50 with a seeded `fc.configureGlobal`, or snapshotting at every tick only for a subset of runs.

### 4. Suggestions
- Rewrite directed case (1) as: "spawn with `spawnTick` = the tick the next step will run (`player.tick + 1`), so spawn and kill share one tick number". Add a note that Phase 16 extends it with a spawn inside the kill.
- Add one generator branch that spawns a native-steered attacker (an existing attack `AiKey`, or `ctl.perform` of an attack behaviour) aimed at another generated ship. This closes the 15-04 dangling-reference gap in the property itself.

### 5. Risk assessment
**MEDIUM.** The tests are well aimed and the plan writes no production code. However, two of the roadmap's named cases (kill on spawn, plus the native-steering surface) are weaker than their labels suggest. The plan would pass while leaving those risks for Phase 16 and Phase 17 to find.

---

## Cross-plan assessment

### Dependencies and waves
- Wave 1 (15-01 ∥ 15-02) shares no files: content and tools against `src/sim/world`. The waves are correct.
- If the two plans run in one working tree rather than separate worktrees, a full `docker compose run --rm test` in one can catch the other half-finished. Both Task-final steps run the full suite. Run wave 1 in worktrees or one after the other.
- 15-03 correctly needs both wave-1 plans: it needs `NpcShip.likelyCargo` and `SpawnInit.cargo`.
- 15-04 → 15-05 are sequential. The `.planning/PROJECT.md` edits (15-03, 15-04) and the `world-cadence.test.ts` edits (15-04, 15-05) are serial, so they cannot conflict.

### The four ROADMAP success criteria
1. **Destroyed on the tick, removed from the view and the scanner, ident ends, holders notified, station and player safe.**
   - Covered by 15-04 Tasks 1 and 2.
   - "Leaves the 3D view" is proven only at the `npcContacts` level. That is acceptable given `render-driver.ts:191-194`, but no gate exercises it in a browser after 15-04.
2. **One ledger, a clean boundary, and the three cases round-trip by property.**
   - The mechanism is in 15-04 and the proof in 15-05.
   - The kill-on-spawn case is weaker than its label (see 15-05).
3. **One v4 bump, one golden regeneration, the strip proof, pristine-omit, and 30/60/144 Hz.**
   - Covered by 15-02, 15-03 and the 15-05 cadence scenario.
   - The `statics:` line is outside the golden `section`, so the strip proof says nothing about it. That is fine, because statics are pristine in the golden.
   - Note that 15-05 sets velocity and weapon by hand and nothing integrates them. The cadence test therefore proves only that the values print deterministically, which is all Phase 15 can prove.
4. **DATA-14.** Covered by 15-01.

### Determinism and hash
- Pristine-omit, the strip-and-rehash mechanism, the stateless cargo fork and the ascending-id kill order are all sound.
- The kill tick cannot depend on frame cadence: the ledger runs inside the fixed step, and pulse fire is quantised to `rechargeTicks`.
- The mutual-kill, kill-on-spawn and repeated-kill snapshots will round-trip. Dead entities are committed before the boundary, and the parser does not cross-check dangling ids, which are plain uint32 values (`snapshot.ts:690`, `:799`, `:869`, `:979`).

### Totality (D-15)
`applyLedger`, `killShip`, `drainAiEventsNow`, `cargoCountAtSpawn` and `sanitizeStaticHealth` are each specified as total, with a fuzz property. The primitives they build on are total, as checked above. The only uncovered totality surface is downstream steering facing a removed id. The steering is probably total too, but nothing in this phase shows it.

### Scope
- Scope is tight and matches "less, but better". Nothing explodes, and no router or probe edit is made.
- `missedShots` (D-16) and static health (D-08) are owner decisions.
- The one field that looks like scope creep, compiling the aft, port and starboard positions that nothing reads, is mandated by D-10 and costs nothing at runtime.

### Security
- The snapshot parser keeps closed key lists. Each new key has a refusal row (versions 3 and 5, over-bound, negative, non-integer, unknown keys), and `FORBIDDEN_KEYS` still applies through `asObject`.
- A fan-out of kill notifications is bounded by the queue cap (`MAX_AI_QUEUE_LENGTH` 4096, `world.ts:100`) and the drain caps (`step.ts:50-53`).
- No new ids leave the sim: `shipDestroyed` and `entityRemoved` are reserved and unrouted.

### Gate efficiency
- Four remote 20-seed runs are scheduled (after 15-01, 15-02, 15-03 and 15-04). One run after wave 1 covers both 15-01 and 15-02, which saves one slow-machine run without weakening the AGENTS.md rule.
- Consider one remote `verify` at the end of the phase, because 15-04 changes what the live loop does.

## Overall risk assessment

**MEDIUM.** The plans are unusually well traced to source. I verified nearly every cited line and helper, and the hash and snapshot invariants are mechanically sound. Three issues keep this from LOW:

1. Removal of entities in real play is new, and no plan audits or property-tests the steering code that holds a now-dead id (15-04 and 15-05).
2. The single weapon `temperature` in the one-way v4 field set silently depends on the forward-only NPC catalogue, while Oolite tracks temperature per facing (15-02). Document the link, or name the field for the forward facing, before the bump is frozen.
3. The kill-on-spawn directed case, as written, does not test what its name says (15-05).

None of these is a blocker. Each one is a few lines of plan text plus one test.

## Fable Review

# Phase 15 (Damage Ledger and Kills): independent plan review

Reviewer: Fable (read-only). Nothing was run, built or modified; every claim below was checked by reading the tree at `689ca3c` and the Oolite checkout at `/home/opencode/git/oolite`. Line numbers are those of the current files.

**Verdict in one paragraph.** The five plans are sound and I found no defect that would stop the phase reaching its four success criteria. The core mechanisms hold when traced through the source: the strip-and-rehash chain, pristine-omit, the mutual-kill credit rule, the kills-then-drain-then-commit order and the totality of the kill path. The concerns are of three kinds: (1) process: wave 1 runs two plans in one working tree with full-suite gates, and the phase's only browser gate runs before the kill behaviour exists; (2) one invariant gap: AI handlers now run after the per-tick sanitise pass; (3) test strength: the random-fight property can pass vacuously and never runs a real `onEvent` handler through `stepSim`. All are cheap to fix in the plan text.

Severity counts: HIGH 0; MEDIUM 7 entries (5 distinct, because the shared working tree and the missing browser gate are each listed under two plans); LOW 21.

---

## 15-01

### 1. Summary
Compiles the ten DATA-14 fields (`likelyCargo`, `maxCargo`, three more weapon facings and positions, `fragmentChance`, `explosionType`) into the nine NPC records, behind the strict schema, the hand-written golden, the drift gate and NOTICE. It also carries the phase-wide D-11 inventory.

### 2. Strengths
- The cargo values in the plan match the vendored plist: adder 2/5 (`third_party/oolite/Config/shipdata.plist:125,143`), gecko 3/3 (`:2291,2318`), krait 2/2 (`:2531,2549`), mamba 3/4 (`:2603,2629`), moray 5/7 (`:2800,2831`); sidewinder and viper author neither key.
- The facing-mask rule is Oolite's: `weapon_facings = oo_intForKey(default VALID_WEAPON_FACINGS) & VALID_WEAPON_FACINGS`, each type read only behind its bit (`oolite/src/Core/Entities/ShipEntity.m:298-306`). The claim that no forward weapon changes holds: every template of the nine that authors `weapon_facings` has bit 1 set (adder `:160` = 1, gecko `:2330` = 1, krait `:2561` = 1, moray `:2848` = 15, sidewinder `:3598` = 1, viper `:3963` = 1).
- `explosionType` null for all nine is right: `explosion_type` is authored only on alloy, asteroid, barrel, boulder and similar templates (`shipdata.plist:179,547,609,965`), none of the nine. The nil-versus-empty distinction is kept.
- Keeping `STEERING_ASSUMED_ABSENT_KEYS` (`tools/oolite-ingest/convert/npc-ships.ts:132-138`, refusal loop `:240`) keeps Phase 14's assumption guarded.
- The D-11 inventory is accurate where I sampled it: the N2 test is at `tests/sim/combat/step.test.ts:622`; the only literal hash pins in the test tree are `ab72eedf` and `b23d11d8` (`tests/sim/world/populate.test.ts:509,522`) and the golden's `c1068643`. No other test pins a hash over a populated world, so the "stop and report" clause in 15-03 should not fire.

### 3. Concerns
- **MEDIUM: wave 1 shares one working tree with 15-02.** `.planning/config.json` has `"parallelization": true` and `"use_worktrees": false`. Both plans end with full `docker compose run --rm test`, `lint` and `typecheck` over the bind-mounted tree. 15-02 Task 1 leaves the tree failing typecheck until `world.ts`, `snapshot.ts` and `snapshot-codec.test.ts` all change (the plan says so itself), so 15-01's full gates can go red for reasons outside its scope, and the reverse. The per-plan acceptance run "at the committed HEAD" also cannot be attributed to one plan when commits interleave.
- **LOW: the aft, port and starboard mapping is unreachable for real data and hard to test.** The refusal loop fails the build when any of the three types is authored, so `facingWeapon` for those facings can only return the default. A synthetic test entry that authors `aft_weapon_type` hits the refusal first. The three fields are compiled constants (`EQ_WEAPON_NONE`) until Phase 17 lifts the refusal.
- **LOW: `fragment_chance` is a fuzzy boolean, not a plain float.** `oo_fuzzyBooleanForKey` (`ShipEntity.m:372`) also accepts boolean spellings and Oolite rolls it once at ship setup into `canFragment`. The plan reads it with `floatExtra` (a non-number fails the build). None of the nine authors it, so nothing breaks today; the divergence (probability kept, roll deferred to the explosion) should be stated in the schema comment so Phase 16 does not add a hashed `canFragment` field later.
- **LOW: positions are float32 values "computed in the container with a scratch script"** and then typed into the hand-written golden. This is the same code path as the converter, so the golden is not an independent oracle for the six new triples. Acceptable (the forward position already works this way), but say so in the golden's sources.

### 4. Suggestions
- Either make 15-02 depend on 15-01 (or the reverse), or state in both plans that the full-suite gates and the acceptance run are taken once after both plans' last commits. Sequencing costs almost nothing here.
- Add one converter test that temporarily bypasses the refusal (or tests `facingWeapon` directly) so the non-forward mapping has a pin before Phase 17 depends on it.
- Record the fuzzy-boolean note beside `DEFAULT_FRAGMENT_CHANCE`.

### 5. Risk assessment
**LOW.** Additive content behind an existing strict schema and drift gate; nothing reads the new fields until 15-03. The only real exposure is the shared working tree.

---

## 15-02

### 1. Summary
Adds `Entity.velocity`, `Entity.weapon {temperature, lastShotTick, missedShots}`, `Entity.cargo` and `World.staticHealth`, hashed pristine-omit, snapshot version 3 to 4, with sanitiser, parser and bounds. No behaviour changes; the Lave golden must stay `c1068643`.

### 2. Strengths
- Pristine-omit is mechanically sound. `serializeEntity` joins segments with `;` and `steer:` is last (`src/sim/world/serialize.ts:134-150`); appending value-gated segments after it leaves a pristine line byte-identical. The unchanged golden is a real guard: any segment printed for a pristine entity fails `populate.test.ts`.
- The `statics:` line is appended in `hashWorld`, not in `serializeWorldSection`, so the golden's `section` text and the strip proof are unaffected, and a never-spawned world with a damaged buoy still hashes differently (`serialize.ts:197-210`, `isNeverSpawned` at `world.ts:177-184`).
- `lastShotTick` 0 as "never fired" is safe: `FlightState.tick` starts at 0 (`src/sim/flight/state.ts:94`) and `stepWorld` reads the already-advanced tick (`src/sim/world/step.ts:85`), so the first world tick is 1.
- The static maxima are right for every main station type: coriolis, dodecahedron and icosahedron all author `max_energy = 25000` (`shipdata.plist:1732,1913,2370`); the buoy template authors 250 (`:1021`) and `buoy-witchpoint` inherits it (`:1111`).
- The cargo bound 200 is Oolite's own cap (`ShipEntity.m:7337-7343`).
- Sanitising static health inside `hashWorld` follows the existing `sanitizeCombat` precedent (`serialize.ts:206`), and covers ticks that do not step the world, where `repairWorldFields` (`step.ts:200-208`) does not run.
- World snapshots are not persisted (no `snapshotWorld` or `restoreWorld` caller under `src/app`), so refusing v3 with no migration is correct.

### 3. Concerns
- **MEDIUM: shared working tree with 15-01** (see 15-01). This plan is the one that breaks typecheck mid-task.
- **LOW: version 4 has two shapes between Task 1 and Task 3.** Task 1 sets `WORLD_SNAPSHOT_VERSION = 4` with three entity keys; `staticHealth` becomes a required root key in Task 3. Harmless because nothing is persisted, but each task commits. If Task 3 slips, a "v4" without `staticHealth` exists in history.
- **LOW: buoys recharge.** The buoy template has `energy_recharge_rate = 2` (`shipdata.plist:1018`). `StaticHealth` holds energy only, which is fine (the rate is a constant), but the doc should say that a recharged buoy returns to pristine and its `statics:` line disappears again, so Phase 18 does not read that as a bug.
- **LOW: `sanitizeStaticHealth` repairs silently.** Entity repairs are counted in the hashed `entity.repairs`, and the acceptance detector sums them (`tests/acceptance/thresholds.ts:766`). A static-health repair returns a boolean that nobody counts, so a corrupt static value would be invisible to the standing gate. "Non-finite becomes the maximum" also heals a buoy on corruption; that is a defensible choice but should be written down.
- **LOW: negative zero in the static snapshot.** The plan says entity fields go through `noNegativeZero` in `snapshotEntity` (as `snapshot.ts:395-425` does today) but does not say it for `staticHealth`. JSON hides the difference, but the in-memory snapshot deep-equality used by the codec tests would not.
- **LOW: D-02 puts debris lifetime in `energy`.** Today only `kind === "ship"` is a hit candidate (`src/sim/combat/step.ts:284-293`) and only ships recharge (`:223-231`). If Phase 16 or 18 makes pods or wreckage hittable, `energy` would mean both health and lifetime. D-02 is owner-locked; the plan should carry one sentence in the `Entity` doc that the two meanings are exclusive per kind.

### 4. Suggestions
- Commit Task 1 and Task 3's snapshot shape together, or keep the version constant at 3 until Task 3 and bump it there.
- Apply `noNegativeZero` to the three static values in `snapshotWorld`.
- State the recharge and repair-counting notes in the `StaticHealth` doc.

### 5. Risk assessment
**MEDIUM.** One-way hashed fields, and the plan touches the parser, sanitiser, hash and spawn together. The guards (unchanged golden, agreement property over every new leaf, refusal row per key) are the right ones and I found no hole in them.

---

## 15-03

### 1. Summary
Gives each populated NPC a cargo count at spawn from a stateless per-id stream, regenerates the Lave golden once with a three-link strip proof, and records the v4 decision in PROJECT.md.

### 2. Strengths
- The port of `setCargoFlag:` is faithful (`ShipEntity.m:7323-7373`): `num = likely_cargo * (0.5 + randf())` truncated into an unsigned and capped at the capacity when `likely_cargo > 0`, else the capacity; cap 200; pirate takes `Ranrot() % (1 + num / 2)` only when `num > 0`. The role mapping is right: trader `FULL_SCARCE` (`Universe.m:2538`), pirate `PIRATE` (`:2554`), shuttle `FULL_SCARCE` (`StationEntity.m:1629`); hunters, police and scavengers get no `setCargoFlag:` call, and none of the nine authors `cargo_carried` (`ShipEntity.m:570-578` would otherwise set a flag at setup).
- The strip proof works as claimed. `populateInertWorld` draws only `world.rng` (`src/sim/world/populate.ts:248-271`), and the count comes from `forkSeed(worldSeed, id, "cargo")`, which touches neither `world.rng`, `nextId` nor the stored `ai` and `combat` streams (`world.ts:468-471`). So the new section differs from the old only by `;cargo:<n>` segments, and the regex `/;(?:vel|wpn|cargo):[^;\n]*/g` restores the old text exactly. Stripping the v4 segments before `;steer:` is also the right order whatever the existing steer regex consumes.
- "At least four ships carry cargo" is guaranteed, not lucky: traders moray (5/7), cobramk1 (10/10) and adder (2/5) give at least 2, 5 and 1; the shuttle role flown by an adder gives at least 1.
- Totality is handled: `forkSeed` throws on an out-of-range id, and the plan checks `nextId` first, mirroring `spawnEntity`'s own `idExhausted` check (`world.ts:441-444`).
- The same-commit rule for the golden and its Key Decisions row is enforced by an acceptance check.

### 3. Concerns
- **MEDIUM: the phase's only remote `verify` runs here, before kills exist.** 15-03 runs `verify` because it edits `src/app/session/traffic.ts`. 15-04 then changes what the player sees (a ship disappears, "Target lost.") and adds a CHANGELOG entry, but is classed "pure `src/sim/`, no `verify`". That follows the letter of AGENTS.md, but success criterion 1 is a browser-visible claim and the production bundle has traffic on, so the player can now destroy Lave traffic. No browser gate runs after that change in this phase.
- **LOW: the cargo rule lives only in `populateInertWorld`.** The other spawn sites are the test hooks (`src/sim/ai/test-spawn.ts:85,243`), which will spawn with cargo 0. That is fine for Phase 15, but Phase 16's hook-spawned "kill a trader, see pods" check needs a way to pass a count; `SpawnInit.cargo` exists, so just note it.
- **LOW: the reference to `Universe.m:2538` is the legacy `addShipWithRole` path.** Oolite 1.90 populates through the JS populator, which sets the cargo type differently per route; the count rule is the same, so D-06 (count only) is unaffected. Say so in the Key Decisions row to avoid a later "wrong source" finding.
- **LOW: CONTEXT says the frozen acceptance worlds "stay byte-identical".** After this plan any world populated from records that carry cargo hashes differently. The acceptance run pins no hash (`tests/acceptance/detectors.ts:1126,1181` only checks that `hashWorld` does not throw), so the run stays valid; the sentence in the SUMMARY should not repeat the byte-identical claim.

### 4. Suggestions
- Move the phase's one remote `verify` to after 15-04's last commit (or run it again there). It costs one remote run and puts the kill behaviour behind the browser gate.
- Add to the stream-isolation test an explicit assertion that `serializeWorldSection` with the v4 segments stripped is equal between the with-cargo and without-cargo populations; that is the proof's premise, tested without the golden.

### 5. Risk assessment
**LOW to MEDIUM.** The regeneration is one-way and owner-visible, but the mechanism is simple and the proof is tight.

---

## 15-04

### 1. Summary
Introduces `applyLedger`, `killShip`, `drainAiEventsNow` and a second `commitWorld` in `resolveShots`, supersedes N2, and amends the old pins.

### 2. Strengths
- The order "ledger, kills, immediate drain, second commit, ident" is correct against the source. `snapshotWorld` throws on a dead entity, a queued AI event or a queued fire request (`src/sim/world/snapshot.ts:438-457`); kills mark dead, the drain empties `aiQueue`, the commit removes, and `updateIdentTarget` then sees `store.get` return undefined (`src/sim/combat/ident.ts:67-74,194-200`) and emits `identLost` only when engaged.
- Mutual kill traced: `resolveShotHits` builds every `HitRecord` before any damage applies (`src/sim/combat/step.ts:297-320`), so both records exist. The ledger marks nothing dead, so both sources are live ships when credit is resolved. `killShip(A, killer B)` then `killShip(B, killer A)`: A's id is still a valid uint32, so B's `shipDestroyed` carries A. Events posted to B before B dies are skipped at delivery because `store.get` hides dead entities (`src/sim/world/store.ts:92-97`, `step.ts:290-291`). Both orders give the symmetric result.
- Totality holds for odd ids: `indexOfId` is a comparison-only binary search (`store.ts:48-59`), so NaN, 1.5 and huge ids terminate and return -1; ids 1-5 and 100 are never in the store (`src/sim/world/ids.ts:38-48`).
- The "closed sets need no edit" claim is true. `shipDestroyed` and `entityRemoved` are already in the union and in `RESERVED_EVENT_KINDS` (`src/sim/events.ts:139-147,205-221`), reserved kinds are pinned to pass the router with no effect (`tests/app/session-order.test.ts:935-948`), and `identLost` is already routed to "Target lost." (`src/app/session/event-router.ts:118,385-386`).
- The view and scanner claim is true without new render code: one `npcContacts` call per frame feeds the model requests, the instanced layer and the scanner (`src/app/session/render-driver.ts:191-195`), and it reads the live store with no cached ids (`src/sim/world/contacts.ts:44-67`).
- Oolite fidelity of the kill rule and notifications: death at `energy <= 0.0`, never the main station (`ShipEntity.m:11557-11563`); the hunter gets `noteTargetDestroyed` then `shipKilledOther` (`:11561`, `:7761`), and `removeTarget` gives the killer `shipTargetLost` first (`:8774-8796`). The plan's event order (lost, destroyed, killed-other) matches. The deviation (killer told regardless of its primary target, `:8806-8812`) is recorded.
- `ShipControl` cannot spawn or kill (`src/sim/world/control-impl.ts:58-131`), so a handler in the immediate drain cannot create a dead or new entity behind the second commit. Every control write is domain-checked.
- Truncating `fireQueue` to its entry length is right: `drainFireQueue` has already cleared it (`combat/step.ts:198-199`), and `fire` dedupes by `includes` on the queue itself (`control-impl.ts:127-129`), so no stale marker survives.

### 3. Concerns
- **MEDIUM: AI handlers now run after the per-tick sanitise pass.** Today every `think` and `onEvent` call happens before the loop at `src/sim/world/step.ts:157-160` ("so no non-finite or out-of-domain value reaches a hash or a snapshot", T-08-21). `drainAiEventsNow` runs handlers after that loop, with the entity's live `ai` component in the context (`step.ts:234-240`), and `hashWorld` does not sanitise entities. A handler that writes an out-of-domain `ai.params` value in the immediate drain reaches the tick boundary unrepaired, where `snapshotWorld` throws "non-finite" (`snapshot.ts:462`). Real exposure today is small: the only `onEvent` in the registry is the flight script's (`src/sim/ai/pilots/flight-script.ts:271-285`), and it writes bounded params and validated control calls. But the plan declares the boundary invariant as a must-have and adds no test or code for it, and Phase 17 will add handlers.
- **MEDIUM: no browser-level evidence of success criterion 1 in this phase** (see 15-03). The existing spec does not reach a kill: it holds fire for 30 ticks before the shooter appears (`tests/e2e/combat.spec.ts:98-118`). The D-11 "no change" verdict for it is correct, which is exactly why nothing in the browser tests exercises a kill.
- **LOW: D-05 and the ROADMAP say the closed sets "change by design"; the plan changes nothing.** The plan's reasoning is correct and it records a Key Decisions row. It should also say explicitly that this narrows D-05's expectation, since CONTEXT asks to "amend them and say why".
- **LOW: a target set in the immediate drain starts its tracking curve one tick late.** `setTarget` leaves the curve pending (`control-impl.ts:66-70`) and `startPendingTrackingCurves` runs only inside `stepWorld` after the think-phase drain (`step.ts:149`). After the immediate drain the pending state crosses the boundary (it is hashed as `t0`, so the round trip holds) and `steerShip`'s defensive start picks it up next tick (`src/sim/npc/tracking-curve.ts:26-28`). Deterministic, but a small departure from the "at the think tick" rule that should be documented in `drainAiEventsNow`.
- **LOW: holders get `shipTargetLost` twice by design** (kill time, then steering's `noteLostTargetAndGoIdle` on the next update, `src/sim/npc/target.ts:148-166`), because `killShip` never clears another ship's `nav.targetId`. The flight script reacts to `shipTargetLost` with `finish` only while not done (`flight-script.ts:279-280`), so it is idempotent today. Pinning the pair is good; note that any future handler must be idempotent for this event.
- **LOW: `killShip` scans every live ship per kill** to find holders. With `MAX_ENTITIES` 256 (`ids.ts:53`) and the 4096 queue cap (`world.ts:100`) this is bounded and overflow is counted in the hashed `aiDropped`. Fine; just keep the scan in ascending id as written.
- **LOW: asymmetry in a mutual kill is invisible but real.** The lower-id victim's killer is still alive when its events are posted, so two or three events are queued and then skipped at delivery, spending drain budget; the higher-id victim's killer is already dead and nothing is posted. No hash effect unless the budget overflows. A unit case that asserts `aiDropped` is unchanged after a mutual kill would close it.
- **LOW: possible lint zone or import-cycle surprise.** `combat/step.ts` will import `world/step.ts` (for `drainAiEventsNow`) and `AI_REGISTRY`; today it imports neither (`combat/step.ts:23-44`). The ESLint config has per-zone `no-restricted-imports` blocks (`eslint.config.*:380-605`). I did not find a rule that forbids it, but the plan should name the check.

### 4. Suggestions
- After `drainAiEventsNow` and before the second commit, run `sanitizeEntity` over the live entities (a no-op for in-domain state, so `repairs` stays 0), or restrict it to entities whose handler ran. Add a kill.test case with an injected `onEvent` that writes `NaN` into `ai.params` and assert `snapshotWorld` succeeds at the boundary. If the owner prefers not to sanitise twice, record why in the Key Decisions row.
- Add one browser step to `tests/e2e/combat.spec.ts` (hold fire on the hook-spawned shooter until it is gone; assert the contact count drops and the "Target lost." message appears), and run `verify` remotely once after this plan.
- State in the `drainAiEventsNow` doc: handlers run after the sanitise pass and after `startPendingTrackingCurves`; what each implies.

### 5. Risk assessment
**MEDIUM.** This is the behaviour change of the phase and sits outside AI fault containment. The design is right and the traces hold; the residual risk is the post-sanitise handler window and the missing browser gate.

---

## 15-05

### 1. Summary
Tests only: three directed kill cases with a snapshot round trip, a random-fight boundary property, a totality property, a kill cross-cadence scenario with non-pristine v4 fields, a 1,000-tick resume across a kill, and the validation sign-off.

### 2. Strengths
- `boundaryHolds` checks exactly what `snapshotWorld` refuses (`snapshot.ts:438-457`) and adds the JSON, parse, restore, hash and re-snapshot equalities, which is the roadmap's wording of criterion 2.
- The mutual-kill construction is reachable: inert Vipers do not move (`step.ts:112-115` skips `ai === null`), a request queued through `createShipControl(...).fire` survives `stepWorld` and is drained in `resolveShots`, and the Viper has a beam laser in the compiled record.
- The cross-cadence scenario exercises `;cargo:`, `;wpn:` and `;vel:` together with two kills from two sources, which is the only place in the phase where the three segments meet real stepping at 30, 60 and 144 Hz.
- Replaying from a mid-fight snapshot with equal final hash and equal remaining events is a strong determinism check.

### 3. Concerns
- **MEDIUM: the random-fight property can pass vacuously.** Nothing requires that any run contains a kill, a mutual kill or a spawn-tick kill. With energies up to 60, recharge up to 2 and 20 to 60 ticks, many runs will kill nothing, and the three named cases are covered only by the directed tests. The roadmap asks for the three cases "proven by a property test over random fights".
- **MEDIUM: no real `onEvent` handler runs through `stepSim` in any test of the phase.** `stepSim` always passes `AI_REGISTRY` (`src/sim/sim.ts:116`), the test pilot has no `onEvent` (`src/sim/ai/pilots/test-pilot.ts:132`), and the random fights use only inert ships and test pilots. So under `stepSim` the immediate drain only ever skips events. The delivery path is tested with an injected registry through direct calls, never together with the ledger, the second commit and the snapshot round trip.
- **LOW: "kill on the spawn tick" means "killed in the first step after a between-steps spawn".** No in-step spawn path exists today: `ShipControl` has no spawn, and the only callers of `spawnEntity` are the populator and the test hooks (`populate.ts:268`, `test-spawn.ts:85,243`). That is the strongest case reachable now, but Phase 16 will spawn debris inside the step, after the sanitise pass and the first commit. Name the limitation in the test so Phase 16 extends it.
- **LOW: the test pilot's target is in `ai.params`, not `nav.targetId`.** A pilot pre-set to the hold phase never calls `setTarget` (`test-pilot.ts:104-118`, `test-spawn.ts:83-84`), so it is not a "holder" for `shipTargetLost`. The plan's holder cases set `nav.targetId` directly in 15-04, which works; the cross-cadence scenario should not assume the Viper receives a kill-time event.
- **LOW: the cross-cadence scenario's exact outcome is fragile.** After the Sidewinder dies the Viper drops to seek (`test-pilot.ts:107-112`), scans, flies to the nearest body and fires along its nose every think. It may hit the Adder before the player's laser kills it (the Adder recharges between pulse shots, so 30 energy needs three hits), which would break "the Adder credited to `PLAYER_ID`". It stays deterministic across cadences, so only the non-vacuity assertion is at risk; the executor will need to tune geometry.
- **LOW: the sign-off sets `nyquist_compliant: true` from SUMMARY reports**, including the by-hand remote runs. That is the workflow's design, but the validation file should cite the HEAD of each recorded acceptance run.

### 4. Suggestions
- Make the property non-vacuous: count kills across the property's runs and assert a floor after `fc.assert`, and bias the generator (some ships with energy 1, some pairs built nose to nose with both firing, some ships spawned on the current tick with energy 1) so each named case occurs in generated runs.
- Add flight-script ships whose `nav.targetId` is a likely victim to the random fights, so the real `onEvent` (`flight-script.ts:271-285`) runs in the immediate drain under `stepSim`, followed by the snapshot round trip. This also tests the post-sanitise window raised under 15-04.
- In the totality property, add a handler that writes an out-of-domain param, and assert the boundary still snapshots (pairs with the 15-04 suggestion).

### 5. Risk assessment
**LOW.** Tests only. The risk is false confidence from a vacuous property, not breakage.

---

## Cross-plan assessment

**Dependency and wave order.** 15-03 depends on 15-01 and 15-02, 15-04 on 15-03, 15-05 on 15-04: correct, and no two plans in different waves conflict on a file. Wave 1 is the one problem: 15-01 and 15-02 share no file but share one working tree and both run whole-suite gates (MEDIUM above). The ROADMAP's "first plan designs every field, bumps once and regenerates once" is split across 15-02 and 15-03 with 15-01 as content; the research records why (open question 4) and nothing behavioural lands before the field design, so the intent is kept.

**Hash and snapshot determinism.**
- Pristine-omit: sound for entities and for static health (traced above). The unchanged golden in 15-02 and the three-link strip in 15-03 are complementary guards.
- Strip-and-rehash: the chain `new -> c1068643 -> ab72eedf -> b23d11d8` holds provided the cargo draw is stateless, which the design guarantees.
- 30/60/144 Hz: nothing in the new code reads frame time. `lastShotTick` is an integer tick, the ledger order is ascending shooter id (`combat/step.ts:298`), kills run in ascending victim id, and the drain is first in first out. The cross-cadence test covers kills plus all three entity segments. Static health is not covered at multiple cadences, which is acceptable because nothing writes it in this phase.
- One gap for FOUND-18's "no later bump": the field set looks sufficient for Phases 16 to 20 as scoped (debris motion, lifetime in `energy`, fire-gate state, capsule count, buoy health). Two things to keep in view: a pod's commodity has no field (D-06 draws it at the explosion; if Phase 16 wants to keep it, `specKey` is the only hashed place), and D-17 leaves collision contact state to Phase 18, which is an accepted second-bump risk.

**Do mutual kill, kill on spawn and repeated kill leave a round-tripping snapshot?** Yes, by trace: in each case every dead entity is committed by the second `commitWorld`, `aiQueue` is emptied by the immediate drain (events to dead ships are consumed and skipped), `fireQueue` is cleared by `drainFireQueue` and re-truncated, and ids are never reissued because `nextId` only grows (`store.ts:103-106`). The one way to break the round trip is a handler writing a bad value after the sanitise pass (15-04 MEDIUM).

**Totality (D-15).** `applyLedger`, `killShip`, `cargoCountAtSpawn` and the sanitisers are total as specified. Two pre-existing throws remain on the path and are correctly left alone: `stepWorld` on a bad `dt` (`step.ts:80-84`) and `forkSeed` on a bad id (guarded in 15-03). `drainAiEventsNow` builds its view outside containment, as `stepWorld` does.

**Oolite fidelity.** Good where checked: death threshold, station exemption, notification order, cargo count rule and caps, facing mask, static energies. Recorded deviations (killer told regardless of primary target, statistically equal cargo draw, fragment roll deferred) are reasonable.

**Scope.** No scope creep. The plans stay inside D-01 to D-17; nothing explodes, no NPC fires on its own, no router or probe change. The aft, port and starboard weapon fields are constants today but are required by D-10.

**Security.** No new trust boundary in practice: snapshots are not persisted and no package changes. The parser additions follow the existing closed-key, bounded-number pattern. Entity ids still do not leave the sim (no new app-facing export).

**ROADMAP success criteria.**
1. Kill on that tick, gone from view and scanner, ident message, AI event before the tick ends, station and player exempt: **met at sim level** (15-04); **not shown in a browser** in this phase.
2. One ledger after the world step, clean boundary, three named cases, property test: **met** (15-04, 15-05), with the vacuity and handler-coverage caveats.
3. One v4 bump, one regeneration, strip proof, pristine-omit, 30/60/144 Hz: **met** (15-02, 15-03, 15-05).
4. Nine records with the DATA-14 fields behind schema, golden, drift gate and provenance: **met** (15-01).

## Overall risk

**MEDIUM.** The design is correct and unusually well traced to the source; I expect the phase to reach its goal. The risk that remains is concentrated in three places, in priority order:

1. Put a browser gate after the kill behaviour: one remote `verify` after 15-04, ideally with one added kill step in `combat.spec.ts`.
2. Close the post-sanitise handler window in `drainAiEventsNow` (sanitise again before the second commit, with a test), and run a real `onEvent` handler through `stepSim` in the random fights.
3. Sequence 15-01 and 15-02 or share their final gates, and make the random-fight property prove it saw kills.

## Consensus Summary

Both reviewers rate overall risk MEDIUM, with no HIGH concern. The tick-boundary mechanism, pristine-omit hashing, strip-and-rehash and the stateless cargo stream hold when traced through the source.

### Agreed or independently raised concerns
- **No browser gate covers a kill** (both): the only remote `verify` runs in 15-03, before 15-04 changes what the player sees.
- **Random-fight property is weaker than its name** (both): it can pass with no kill (fable); the "kill on the spawn tick" case really means "first step" because nothing spawns mid-tick in Phase 15 (opus).
- **Stale ids held by survivors** (opus): `nav.targetId`, `steer.proximityAlert`, `steer.saved.targetId`, escort `ownerId`; and AI `onEvent` handlers run after the sanitise pass (fable), so a bad `ai.params` write could reach the boundary unrepaired.
- **Weapon record has one temperature** (opus): Oolite keeps one per facing; safe only while no stock NPC has aft/port/starboard weapons.
- **15-01 and 15-02 in parallel in one working tree** (fable): both run whole-suite gates and 15-02 breaks typecheck mid-task.

### Divergent or lower-severity
- 15-03 cites the legacy `Universe.m` path for cargo; the live source is `oolite-populator.js` (pirates carry cargo only away from a station or planet).
- Same-tick mutual kills differ from Oolite's sequential update; record in Key Decisions.
- `fragmentChance` default is not rounded to float32 like authored values.
- `statics:` hash label reads like the existing `World.statics`.
- One remote acceptance run after wave 1 would cover 15-01 and 15-02.

---

# Round 2 (plans at HEAD 8511629, six plans / six waves)

Both reviews were run as independent, read-only Claude subagents (opus, fable) against the revised plans, verifying claims against the source and the Oolite checkout. No external CLI was used. Round 1 above is kept as history; the plans carry a `### Round 1 — cc096f6` ledger for it. Open owner decisions OD-1 (15-03) and OD-2 (15-05) were checked by both reviewers: their stated consequences are correct (one addition under OD-1, see Fable 15-03).

Both reviewers confirmed that round-1 findings are genuinely resolved, that every HEAD acceptance `rg`/`grep` value stated in the plans matches the tree, and that every Oolite citation checked is accurate. Overall risk: Opus MEDIUM, Fable MEDIUM. One HIGH finding (shared by both) and two MEDIUM, all in 15-04.

## Round 2 findings, actionable (consolidated)

| # | Sev | Plan | Finding | Raised by |
|---|-----|------|---------|-----------|
| R2-1 | HIGH | 15-04 Task 2 (browser step 4 in `tests/e2e/combat.spec.ts`) | The kill step's tick budget ignores the hook-spawned Viper's return fire. The Viper is a test pilot with `fire: true` in hold phase (`src/sim/ai/test-spawn.ts:78-84`, `src/sim/ai/pilots/test-pilot.ts:108-125`), thinking every <=15 ticks (`src/sim/ai/time.ts:23`), beam 6 damage, no NPC heat or energy cost (`src/sim/combat/step.ts:185-191`), so up to 48 damage/s on the player. Player bank 256 recharges 4/s, forward shield takes up to 2/s (`src/sim/combat/shields.ts:44-98,130-160`); the fire gate refuses at bank <= 0.8 (`src/sim/combat/weapons.ts:38-60`). Steps 2-3 already expose the player for ~360 ticks. Bank drains to the refusal threshold in ~650-680 ticks; the player's pulse laser (15 per hit every 61-62 ticks) needs ~14 hits, ~850-870 ticks, against a Viper of 180 energy recharging 4/s (`src/content/generated/ships-npc.json:243-253`). So the laser is refused before the kill, the Viper recharges, the loop ends on the 3,000-tick bound. `laserRefused` is also routed to `hudMessages` (`src/app/session/event-router.ts:115,361-364`) and would overwrite "Target lost." Outcome depends on the shooter's hit rate (Fable: with half the shots hitting, the step passes), which the plan does not compute. The plan's fallback ("stop and report") fires only at the last remote step. | both |
| R2-2 | MEDIUM | 15-04 Task 1 (and Task 2) | The straggler halt rule ("a hit in any other file halts the task before any edit") contradicts itself: the recipe returns hits in ~15 files at HEAD (mostly `liveEntityCount`/`energyOf` uses the rule does not break), and `tests/sim/world/world-cadence.test.ts` genuinely breaks when kills begin but is assigned to Task 2, i.e. "another file" relative to Task 1's `<files>`. A literal executor halts; a liberal one ignores the rule. Intent: a pin the new rule breaks that is not in the D-11 inventory halts the task. Either carve out rows already assigned to a later task of the same plan or move the cadence amendment into Task 1. | both |
| R2-3 | LOW-MEDIUM | 15-04, 15-05 | "`killShip` is the only removal path in non-test code" overclaims: `sanitizeEntity` marks an entity dead on an unknown `kind` (`src/sim/world/sanitize.ts:623`, header `:42-46`), a corruption repair with no `shipDestroyed` and no notification. Carve it out in the must-have, the `killEntity` doc and the Key Decisions rows. | fable |
| R2-4 | LOW | 15-04 | The `killEntity(` guard filters comment lines only inside `world.ts`; a doc mention such as "unlike `killEntity(`" in `kill.ts` would trip it. Mention the name without the parenthesis or widen the filter. | opus |
| R2-5 | LOW | 15-04 browser step | After the kill, ident stays engaged and re-scans (`src/sim/combat/ident.ts:186-213`, `firstEntityTargetedByPlayer` `:91-121`); a ship in the nose cylinder would re-lock, so `identLocked` becomes true again and the HUD message changes. Assert on the drop, or accept either "Target lost." or a fresh lock; the step must not depend on no other ship being in the sights. | both |
| R2-6 | LOW-MEDIUM | 15-05 Task 2 | The 120-tick dangling case asserts "the test pilot is back in its seek phase" at the end, but after the first think post-kill the pilot rescans with the default `scanRange` 25,600 and locks the nearest ship, returning to `hold` (`test-pilot.ts:68-99`). Assert the departure from `hold` with `params.targetId` cleared on the first think after the kill, or give it a small `scanRange`. | opus |
| R2-7 | LOW | 15-05 / 15-04 | After 15-05, any 15-04 `kill.test.ts` case that kills with a live NPC killer leaves events in `aiQueue`; a later `snapshotWorld` throws `queue-not-empty` (`src/sim/world/snapshot.ts:446-450`). Note that those cases may need `drainAiEventsNow`. | opus |
| R2-8 | LOW | 15-05 | OD-2 check `git diff --quiet c9cf622 -- ... tests/fixtures` fails if the R2-1 fix adds a probe hook (changes `tests/fixtures/probe-shape.json`). Scope the check or amend it with any hook change. | opus |
| R2-9 | LOW | 15-05 | Pitfall 9 "two `shipTargetLost`" pair is observable only with a non-finishing handler (the real flight script `finish`es on the first event, `src/sim/ai/pilots/flight-script.ts:173-178,279-285`). Name the recording module and the direct `nav.targetId` write; reword the Key Decisions sentence to "a holder whose handler does not change behaviour". The fan-out-past-the-caps case must pre-fill `world.aiQueue` directly. | fable |
| R2-10 | LOW-MEDIUM | 15-06 Task 2 | The "spawn now" branch can miss its non-vacuity floor for a structural reason: the player's laser is gated by `shotTicks > 61` (`weapons.ts:51`) and a nearer ship can take the shot. Tell the executor to spawn on a tick when the laser is ready and place the ship nearest along the nose. The replay-from-snapshot check must apply the same between-step spawns to both worlds. | fable, opus |
| R2-11 | LOW | 15-06 | (a) Random-fight mutual-kill predicate: count a mutual kill only when each victim's credited killer is the other ship (a third ship's lower-id record can become the credited killer). (b) Task 3 "assert no kill-time AI event for the Viper under `stepSim`" is unobservable (`stepSim` uses `AI_REGISTRY`); assert the Viper's `nav.targetId` is never the Sidewinder. (c) "world section at the first sample contains `;cargo:3`" needs the section text and a pinned sample tick before the Adder's second lethal hit (~61 ticks after the first shot). | opus |
| R2-12 | LOW | 15-01 | (a) Ledger row still says "five sequential waves"; it is six. (b) `weapon_facings` is read through `uintExtra`, narrowing Oolite's signed `oo_intForKey` mask (`ShipEntity.m:298`); state it beside `DEFAULT_WEAPON_FACINGS` like the fuzzy-boolean note. (c) The shuttle template authors `weapon_facings = 0` (round 1 said every template has bit 1 set): record mask 0 in the golden's shuttle `sources` line and use the shuttle as the real-data mask pin in the converter test. | opus, fable |
| R2-13 | LOW | 15-03 | OD-1 "if no" consequence is incomplete: Task 1 edits `src/app/session/traffic.ts`, so moving it into 15-02 changes 15-02's gate from local-only to also needing the remote `verify`. Add that to the OD-1 cost line. | fable |
| R2-14 | LOW | 15-02 | `hashWorld` now mutates `world.staticHealth` on repair and is called from the probe (`src/app/session/probe-publisher.ts:174`) and the acceptance detectors; documented and harmless unless the state is corrupt, keep the doc sentence. Also unconfirmed: whether the codec "missing `staticHealth`" row reports reason "not-object" for an absent key (`asObject` on `undefined`); treat as an executor check. | opus, fable |
| R2-15 | INFO | cross-plan | Fable asks whether the 15-04 and 15-05 acceptance runs could be taken once after 15-05 (nothing fires in the frozen worlds, so 15-04's run cannot observe a kill). Owner's gate policy decides; no change proposed. | fable |

### Suggested route for R2-1 (non-binding, both reviewers)

- Prove the kill in a Vitest session twin first (the tick-parity harness already holds the fire key, `tests/app/session/tick-parity.test.ts:107-174`), read off the kill tick and the bank level, and make the remote browser run confirmatory; write the player-energy budget into the plan whichever option is taken.
- (a) Give the kill step a non-firing target (hook option or separate target hook; changes `tests/fixtures/probe-shape.json`, so amend the OD-2 diff check, R2-8); or (b) hold A from the moment the shooter spawns (Opus estimate: kill at ~795 ticks against energy exhaustion at ~945, thin margin); or (c) mount a military laser for step 4 through the existing `grantEquipment` hook (`src/app/probe.ts:335-340`) if it mounts lasers (12 per hit every 14 ticks, kill in ~230 ticks); or (d) prove "leaves the scanner" in an app-level Vitest session test instead of the browser.

## Opus Review (round 2)

Overall MEDIUM. Opus ran all stated HEAD acceptance checks (energy-write prints `step.ts:227`, `step.ts:344`, `sanitize.ts:653`; filtered `killEntity(` check prints nothing; cycle guard prints nothing; `sanitizeEntity(` once in `src/sim/world/step.ts`; CHANGELOG range check prints 0): all match.

- **15-01 (LOW).** Facing gate matches Oolite (`ShipEntity.m:298-306`); `fragment_chance` default float (`:372`), `explosion_type` nil (`:491`); vendored adder 2/5, `weapon_facings = 1` (`third_party/oolite/Config/shipdata.plist:125,143,160`); all `explosion_type` lines belong to non-NPC templates (`:179,547,609,965`). No test builds a full `NpcShip` by hand (`tests/app/session/traffic.test.ts:149` spreads). Concerns: stale "five waves", signed-mask narrowing (R2-12).
- **15-02 (MEDIUM, one-way fields).** Closed file set right (`keyof Entity` pin at `tests/sim/world/snapshot-codec.test.ts:1403`); `sanitize.ts` imports only `entity`, `ids`, `limits` (`:52-78`) so no cycle; `serialize.ts:199-208` already repairs combat state in `hashWorld`; pristine-omit after `;steer:` keeps a fresh line identical (`serialize.ts:126-150`); the "two v4 shapes" rejection is sound (no `snapshotWorld`/`restoreWorld`/`parseWorldSnapshot` caller under `src/app` or `src/persistence`). Concerns: R2-14.
- **15-03 (LOW-MEDIUM).** Counting rule matches `setCargoFlag:` (`ShipEntity.m:7323-7373`); placements match (`src/sim/world/populate.ts:94-105`, `oolite-populator.js:1488-1495`, `StationEntity.m:1629`); "at least four cargo segments" holds for any draw; the existing strip regex `;steer:[^;\n]*` (`tests/sim/world/populate.test.ts:507`) would leave `;cargo:` behind so the plan correctly amends both strip tests; no other literal hash is pinned over a traffic-populated world. No concerns beyond OD-1 (consequences stated correctly).
- **15-04 (MEDIUM-HIGH).** Mutual-kill credit is consistent (`store.get` returns undefined for a dead uncommitted entity, `src/sim/world/store.ts:91-96`; ascending victim id; D-04). Ident path works unchanged (`ident.ts:186-213`, `event-router.ts:385-386`); the write-log pin survives (`tests/sim/combat/step.test.ts:576-592`); the cadence Adder (85 energy, recharge 2/s) dies after ~7 hits (~370 of 720 ticks, `tests/sim/world/world-cadence.test.ts:453-466`); render is index-addressed (`src/render/bodies/npc-ships.ts:25-28`). Concerns: R2-1 (HIGH), R2-2, R2-4, R2-5.
- **15-05 (MEDIUM).** Drain reuses `drainAiEvents`/`invoke` containment (`src/sim/world/step.ts:252-298`); delivery to dead victim/killer skipped (`:310-311`); nothing after `stepWorld`'s final drain posts AI events, so the empty-queue early return is valid; the dangling-reference inventory is accurate (`src/sim/npc/target.ts:153-166`, `avoid.ts:36-47`, `behaviours/formation.ts:51-54`, `test-pilot.ts:104-112`, `snapshot.ts:289-293,979`); only two `resolveShots` callers (`sim.ts:121`, `tests/sim/combat/ident.test.ts:473`); cycle guard sound; OD-2 premise holds (`event-router.ts:118`, `tests/app/session-order.test.ts:870`). Concerns: R2-6, R2-7, R2-8.
- **15-06 (LOW-MEDIUM).** Spawn-tick construction correct (`src/sim/sim.ts:73-117`, `step.ts:85`); duel branch works (`test-pilot.ts:44-60`); flight-script holders exercise real `onEvent` (`flight-script.ts:271-285`); non-vacuity counters close round 1's gap. Concerns: R2-10, R2-11.
- **Cross-plan.** Strictly sequential 01..06; `resolveShots` keeps its signature through 15-04 and gains `layout` in 15-05; between them `killShip` posts no events; threat IDs and ledger rows moved with the work. Criterion 1 browser half depends on the 15-04 step (R2-1); criteria 2-4 met. No determinism hole; totality design total (`indexOfId` terminates on NaN, `src/sim/world/store.ts:48-58`); no scope excess; no security issue.

## Fable Review (round 2)

Overall MEDIUM; severity counts HIGH 1, MEDIUM 2, LOW 12. Fable verified every Oolite citation the plans use (ShipEntity.m 298-306, 372, 378, 479-481, 491, 566, 2213-2218, 7198-7201, 7323-7373 incl. the 200 cap at 7337, 8659-8665, 8774-8812, 10473-10477, 11556-11563; ShipEntity.h 116, 303-304; OOTypes.h 196-206; OOCollectionExtractors.h 152; PlayerEntity.m 3708; oolite-populator.js 1418-1431, 1448, 1492-1522, 1711-1713, 1862-1865; OOJSShip.m 2901-2935; StationEntity.m 1629), every test line reference in the D-11 inventory, and ran every acceptance check with a stated HEAD value: all match.

- **15-01 (LOW).** Converter/schema claims verified (`tools/oolite-ingest/convert/npc-ships.ts:150-165,173-192,239-249`; `src/content/schemas/ship-npc.ts:45-98` strict, 17 fields); plist values verified for all nine (adder 2/5, cobramk1 10/10, gecko 3/3, krait 2/2, mamba 3/4, shuttle `max_cargo` 30 via template, sidewinder and viper author neither); `Math.fround(0.9)` faithful (`OOCollectionExtractors.h:152`); NOTICE paragraph rewrite scoped (`NOTICE:74-84`). Concerns: R2-12(b),(c).
- **15-02 (MEDIUM).** Pristine-omit mechanically sound (`src/sim/world/serialize.ts:134-150`); codec hooks exist as cited (`snapshot.ts:80,437-456,930-948,1029-1037,1110-1141`; codec test rows `:256-259,879,1403,1951,108`); no `World` literal outside `world.ts`/`snapshot.ts`; `sanitize.ts:11-12` "declares and exports no constant" makes the `^export const == 0` guard meaningful; `lastShotTick` 0 is safe because the first world tick is 1 (`world/step.ts:85`). Concerns: R2-14, plus the accepted "v4 two shapes" intermediate.
- **15-03 (LOW-MEDIUM).** `setCargoFlag:` port faithful; stream isolation holds by construction (`populate.ts:248-271`, `rng.ts:124-135`); `RNG_PURPOSE_CODES` pin at `tests/sim/rng.test.ts:195`; `trafficContent` six-field record (`src/app/session/traffic.ts:68-76`, `tests/app/session/traffic.test.ts:42-49`); same-commit check sound (last golden commit `36d1abd` does not touch PROJECT.md). Concern: R2-13.
- **15-04 (MEDIUM-HIGH).** Tail order right against the source (`snapshot.ts:437-456`, `store.ts:92-97`, `ident.ts:67-74,188-200`, `contacts.ts:44-67`); `resolveShotHits` queues every record before applying any (`combat/step.ts:297-320`); Oolite death at `energy <= 0.0` with the main station exempt (`ShipEntity.m:11556-11563`), the recorded same-tick mutual-kill divergence is genuine; `hud.contacts` is a list of `"ship"` ids (`src/app/hud-model.ts:101-115`, `probe-publisher.ts:453-456`); CHANGELOG has `## [0.4.0] - 2026-11-16` (`CHANGELOG.md:9`). Concerns: R2-1 (HIGH), R2-2, R2-3, R2-5.
- **15-05 (MEDIUM).** Drain design matches the primitives (`world/step.ts:221-298`, `world.ts:505-534`); a handler cannot spawn or kill (`src/sim/ai/control-impl.ts:58-134`); fire-queue truncation correct (`combat/step.ts:198-199`, `control-impl.ts:127-129`); dangling-reference inventory accurate; cycle guard verified (`rg -l` prints nothing; only importers `sim.ts` and type-only `flight/step.ts`; `eslint.config.js:374-397` no zone forbids `combat -> world/step`). Concerns: R2-9.
- **15-06 (LOW).** Spawn-tick construction admissible (`world.ts:325-327,470`); mutual-kill construction reachable (`maxEnergy: 1` in `isLegalEnergy`, `world.ts:203-205`); fixed-seed precedent verified (`tests/sim/dock-no-trap.test.ts:179`); the cross-cadence Viper is not a holder (`test-spawn.ts:81-84`) and the `scanRange` guard is sound; `COMPARE_TICKS = 1_000` exists (`snapshot.test.ts:53`). Concerns: R2-10.
- **Cross-plan.** Six serial waves, no file conflicts across waves, threat IDs partitioned without overlap (01-03, 04-07, 08-10, 12/14/15/16, 11/13/20/21, 17-19/22). The 5->6 split broke nothing structural; seams: R2-2 and R2-3. Cost: four remote acceptance runs, two remote `verify`, one remote browser run (R2-15). Suggestions: build the browser step's Vitest twin first, then make the remote run confirmatory; reword both halt rules; carve out the sanitiser removal; accept either "Target lost." or a fresh lock; add the shuttle mask-0 pin; add the remote `verify` to the OD-1 cost line.
