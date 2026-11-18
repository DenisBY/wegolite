# Phase 17: NPC Fire and Hits on the Player - Research

**Researched:** 2026-11-18
**Domain:** Deterministic fixed-timestep port of Oolite's NPC laser fire gate (weapon heat, energy, shot timer, range roll, `onTarget`) onto Wegolite's Phase 14 steering port, the Phase 13 hit rule and the Phase 15 ledger and kill path
**Confidence:** HIGH for the Oolite gate, the call sites and the in-repo integration points (every one read this session at file and line); MEDIUM for two numeric-representation points (the 0.1 s shot period and float32 temperature), which the oracle should settle

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** The hook keeps the **stationary shooter** (`spawnTestShooter`, `src/sim/ai/test-spawn.ts`), which now fires through the gate. The one opt-in browser spec that criterion 3 requires (hook shooter to the shield and energy readout on the HUD) uses it.
- **D-02:** The hook adds a second variant that spawns an **attacking NPC** flying Phase 14's attack behaviours against the player with fire opted in. It is for manual checks and UAT only and has no browser spec of its own. Tainting works as it does for every hook mutation, so the ship can never become durable.
- **D-03:** **NPC-vs-NPC** fire, and a kill of one NPC by another through the kill path, are proved in **Vitest scenarios only**: two pilots, with no hook variant and no browser spec. This keeps the 90 % Vitest rule and the single browser spec.
- **D-04:** The **range roll stays as in Oolite**: `range > randf() * weaponRange * (accuracy + 7.5)` refuses the shot, drawn from the shooter's own combat stream. The browser spec does not expect a hit on the first tick. It steps a bounded number of manual-clock ticks and waits for the shield to drop. The planner may shorten `TEST_SHOOTER_DISTANCE` so hits come sooner, but the gate gets no test-only bypass and accuracy is not pinned.
- **D-05:** The opt-in to fire lives in the **AI module's params** (the flight-script pilot and the test pilot). Behaviours read it through `SteerContext` (for example `SteerContext.fire` or an equivalent; the name is Claude's discretion). A ship with `ai: null` has no params and therefore can never fire, which gives the production guarantee by construction. **No new hashed entity field** is added and the v4 field set stays frozen. A param key is put on the record only when it is set, as `test-pilot`'s `fire` is today, so existing flight-script worlds serialise and hash byte-identically.
- **D-06:** Port **every Oolite fire site and every hot-weapon branch** inside Phase 14's attack IN list: the `fireMainWeapon:` calls in `behaviour_evasive_action` (`ShipEntity.m:4035`), `behaviour_attack_sniper` (4454), `behaviour_fly_to_target_six` (4575; the twelve shares it), `behaviour_attack_fly_to_target` (4711) and `behaviour_flee_target` (4891) where reachable, plus the `weapon_temp > COMBAT_AI_WEAPON_TEMP_USABLE` branches (4456, 4577, 4713) and the ATTACK_TARGET dispatcher's weapon-temperature branch. Branches that are unreachable because aft, port and starboard weapons are none on every compiled record stay unreachable and are recorded as such. A world with no firing pilot keeps temperature 0, so its trajectories and hashes do not change. New source-cited oracle fixtures cover the gate and the hot branches, written first by a separate agent with no access to `src/sim/npc` (roadmap criterion 4).
- **D-07:** **Tick quantisation:** the shot timer uses `rechargeTicks = round(weapon_recharge_rate * 120)` against `tick - lastShotTick`, with Oolite's **NPC comparison** (`shotTime < weapon_recharge_rate` refuses, so `>=` allows; `ShipEntity.m:9946`). This deliberately differs from the player's strict `>` (`PlayerEntityControls.m:1185`), and both are correct to their sources. The decision row records the difference. `lastShotTick` 0 means ready (D-07 of Phase 15). Cooling runs every stepped tick as `max(temp - WEAPON_COOLING_FACTOR * dt, 0)` (`ShipEntity.m:2214-2218`, factor 6, `NPC_MAX_WEAPON_TEMP` 256, cutout 0.85; `ShipEntity.h:115-120`). A shot that fires costs `weapon_energy_use` from the shooter's energy and adds `weapon_shot_temperature` (`ShipEntity.m:9967-9975`). The float32 width of Oolite's temperature is the researcher's to settle against the oracle.
- **D-08:** **Every NPC shot goes through the gate.** No `ShipControl.fire` path bypasses it. The ungated A7 shot (any rate, no heat, no timer, no energy cost) is removed, the A7 Key Decisions row is amended in the same commit as the change, and every Phase 13 test or fixture that pins the 15-tick think cadence of shots is listed once with its reason and amended in the plan that changes the behaviour, not fixed piecemeal from red runs (the same rule as Phase 15 D-11).
- **D-09:** **The test pilot asks to fire every tick**, as Oolite's behaviours call `fireMainWeapon:` every frame, and only the gate sets the rate of fire. The 15-tick think cadence no longer sets it. How the per-tick request is made (a per-tick control step of the pilot, or a standing intent the world step reads) is the planner's choice, but the rate must be the gate's and the same at 30, 60 and 144 Hz.
- **D-10:** **Same-tick mutual kill:** credit stays **asymmetric by ascending shooter id**, as the ledger resolves today. The phase's decision row restates this as a divergence from Oolite, where the order comes from the entity update, and a Vitest scenario pins it.
- **D-11:** **No player hit feedback** in this phase (no flash, shake or sound). The player sees the hit only as the shields and energy falling on the HUD. `shipHit` still has no consumer, and the todo `2026-11-17-skip-shiphit-for-a-doomed-target.md` stays pending.
- **D-12:** **`shipTargetLost` stays as Phase 15 posts it** (to every ship that had the victim as its target). Phase 17 adds no new `onEvent` handler: fire reads the target from `nav`, and a dead or missing target is refused by the gate and the behaviour. If the planner finds it needs a second `onEvent`, it stops and asks the owner first, because narrowing the event needs an owner edit to Phase 15 criterion 1.
- **D-13:** **Tripwires, so the three deferrals are not forgotten** (owner request): the phase adds one guard test under `tests/guards/` for each deferral, and each guard's failure message names its todo.
  1. Nothing outside the kill path reads the kill credit (`shipDestroyed.killer`, `shipTargetDestroyed`, `shipKilledOther`). It fails when the first consumer (a bounty, rating or legal status) appears. Todo: revisit mutual-kill credit symmetry.
  2. `shipHit` has no consumer. It fails when the first subscriber (audio, hit flash, HUD indicator) appears. Todo: the existing `2026-11-17-skip-shiphit-for-a-doomed-target.md`.
  3. At most one module in `AI_REGISTRY` defines `onEvent`. It fails when a second one gains a handler. Todo: decide whether to narrow the kill-time `shipTargetLost` to the killer (needs the owner's edit to Phase 15 criterion 1).

  Two new pending todos are created (1 and 3). Todo 2 already exists and gets a pointer to its guard.
- **D-14:** The decision to fire comes from the engine and test pilots only, and a Key Decisions row records it (criterion 3). No new firing decision source ships in the production bundle.
- **D-15:** The weapon state is Phase 15's v4 field: `temperature`, `lastShotTick` and `missedShots`, all pristine-omit. No snapshot bump. `missedShots` now moves (+1 on a miss, -1 on a hit, floored at 0) and feeds `onTarget`'s aim accuracy where Phase 14 pinned it at 0 (`src/sim/npc/target.ts`, `src/sim/npc/track.ts`).
- **D-16:** Hits resolve through the existing ledger in ascending shooter id. The player's shield and energy routing is Phase 13's shared hit rule (A7's shared half stays), so CBT-16 is mainly verification.
- **D-17:** QUAL-11 standing gate: rerun the 20-seed acceptance run by hand on the remote machine after every plan that changes `src/sim/npc/**`, `src/sim/world/**` or `ships-npc.json`, expect 21 of 21, and record the result in the SUMMARY. The frozen worlds opt in to nothing and stay byte-identical. New sim functions are total and covered by a fast-check property (Pitfall 16).
- **D-18:** Gate per plan as in AGENTS.md. Pure `src/sim/` plans run `test`, `lint` and `typecheck`. The hook and browser-spec plan runs `verify` on the remote test machine.

### Claude's Discretion

- The name and exact shape of the opt-in param and of the `SteerContext` field.
- How the test pilot asks every tick (D-09).
- The shooter distance for the hook and the browser spec's tick budget (D-04).
- The name and argument of the attacking-NPC hook variant (D-02).
- The plan split and wave order. Seam plans must not share a wave with any Phase 16 follow-up, and Phase 16 is already complete.
- How the guard tests detect a consumer (static import or reference scan, or the event router table), as long as they fail on the first real consumer.

### Deferred Ideas (OUT OF SCOPE)

- Symmetric credit for a mutual kill: when kill credit gets a consumer (D-10, tripwire D-13.1).
- Player hit feedback (sound, flash) and the doomed-target `shipHit` skip: when `shipHit` gets a consumer (D-11, tripwire D-13.2).
- Narrowing the kill-time `shipTargetLost` to the killer: before a second `onEvent` (D-12, tripwire D-13.3).
- Escort release (`escortCheckMother`): in the phase that first spawns escorts (roadmap carry-over, not this phase).
- Reviewed todo not folded: `2026-11-16-phase-14-review-followups.md` IN-05 (detector blind spot): needs the owner's trailer and is not part of this phase.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CBT-15 | NPC ships fire lasers at the player and at each other through Oolite's fire gate (weapon temperature, energy, shot timer, range roll, `onTarget`). The decision to fire comes from the engine and test pilots only; NPCs do not attack in ordinary play (recorded in Key Decisions). | Gate port (Findings Q1), fire sites and hot branches (Q2), opt-in and production guarantee (Q4), oracle-first process (Q5) |
| CBT-16 | NPC hits on the player pass through shields and the energy bank by Oolite's rules. | The shared hit rule already exists and is Oolite-checked (Q3); Phase 17 adds NPC-sourced verification and the browser route |
| QUAL-11 (standing, completes Phase 20) | Kills deterministic; hash equal at 30, 60, 144 Hz; frozen 20-seed run 21 of 21 after every plan touching `src/sim/npc/**`, `src/sim/world/**` or `ships-npc.json`. | Byte-identical argument (Q6), cross-cadence scenario, rerun schedule |
</phase_requirements>

## Project Constraints (from AGENTS.md)

`./CLAUDE.md` does not exist in the repository; the project rules are in `AGENTS.md` and the user's global memory. Directives that bind this phase (treated with the authority of locked decisions):

- **Everything runs in Docker; tests pass only in the container.** Commands: `docker compose run --rm test` (targeted: `... test npx vitest run <file>`), `lint`, `typecheck`, `verify` (fast gate), `verify-full`, `e2e sh -lc "npm run build:e2e && npx playwright test <spec>"`. Per the owner's slow-machine policy (memory), `verify`, `verify-full` and browser tests run on the remote machine `opencode@192.168.178.51` through `/home/opencode/.claude/scripts/wegolite-remote-run.sh`, from COMMITTED HEAD only. Gate by change type: pure `src/sim/` plans need `test`, `lint`, `typecheck`; browser-facing code (`src/app/`, `index.html`) needs `verify`.
- **No database, GPL-2.0-or-later, no OXP.** No new asset is added in this phase, so `NOTICE`/`ASSETS.md` are untouched.
- **Simulation core purity:** `src/sim/` imports no Three.js and touches no DOM; fixed timestep, deterministic, no frame time anywhere in the gate.
- **Content is compiled, never hand-edited** (`ships-npc.json` is generated; this phase should not need to change it).
- **Documentation language is English; decisions go in `.planning/PROJECT.md` Key Decisions; user-visible changes go under `## [Unreleased]` in `CHANGELOG.md` in the same commit.**
- **Subagent briefs** must include the Docker-only block, the Oolite checkout path `/home/opencode/git/oolite`, and the codebase-memory / `rg` instruction. The independent oracle agent additionally must be forbidden from reading `src/sim/npc/**` (see Q5).
- **Standing gate:** the 20-seed acceptance run (`npm run test:acceptance`) is in no gate; rerun it by hand on the remote machine after any plan touching `src/sim/npc/**`, `src/sim/world/**` or `src/content/generated/ships-npc.json`, and record the result in the plan SUMMARY. Thresholds and detectors are frozen (`Detector-change-approved-by-owner` trailer needed to change them). AGENTS.md also says "Revisit adding the run to `verify-full` when a later phase changes NPC behaviour" (see Open Question 4).

## Summary

Phase 17 turns Phase 14's attack behaviours from "never fire" into "fire through Oolite's NPC gate when a pilot opted in", keeps every world that does not opt in byte-identical, and lets the existing Phase 13 hit rule, Phase 15 ledger and Phase 15 kill path carry the consequences. Nothing in the hit, damage or kill funnel needs a new rule: an NPC shot already becomes a `ShotRequest`, resolves in ascending shooter id through `firstShipHit` against the player and the NPC ships, and lands through `applyLedger` (`routeDamage` for the player, energy for an NPC), and a lethal hit already destroys the ship through `killShip`. What is missing is exactly the gate state machine in front of that funnel, the heat and `missedShots` that now go live in the steering, and the pilot opt-in.

The research found six facts the planner must carry into tasks. (1) The Oolite gate order is fixed and one gate call draws exactly one unit `randf()` before `onTarget`, including for an unarmed ship and for a missing target; the draw count is part of the oracle. (2) Oolite keeps two temperatures, the forward one and a copy `weapon_temp` that `fireWeapon` refreshes at each call, but at all three hot-branch reads (sniper 4456, six 4577, fly-to 4713) the copy equals the forward temperature as it stood at the start of that update, so Wegolite's single `weapon.temperature` is exact provided the tail check reads it before this tick's shot adds heat and before this tick's cooling. (3) The Phase 14 sniper port has an early `return` where Oolite falls through to the cut fire site, which becomes a real defect the moment fire is live. (4) `nav.targetId` is 0 for the hook shooter today (it spawns in the hold phase with only `params.targetId`), so a gate that reads the target from `nav` (D-12) refuses every shot until the hold phase sets the target. (5) `missedShots` going live changes two Phase 14 functions (`currentAimTolerance` and the `min_d` term in `trackPrimaryTarget`), which the oracle fixtures must cover with non-zero values. (6) The 0.1 s lasers (beam and military; the beam is on Gecko, Krait and Viper, the hook shooter's hull) fire every 12 ticks under D-07's `round(rate * 120)` but every 13 ticks in a literal Oolite run at exactly 120 Hz, because Oolite's `weapon_recharge_rate` is the float `0.1f`; this is a recorded divergence the oracle should state, not a bug.

**Primary recommendation:** Put the whole NPC gate in one pure, total module `src/sim/npc/fire.ts` (gate, `onTarget`, cooling, all float32-rounded), call it from `drainFireQueue` in `src/sim/combat/step.ts` as the single gate site for both routes (`SteerContext.fire` from steering, `ShipControl.fire` from a pilot's think), keep `world.fireQueue` as an id list, give behaviours an optional `SteerContext.fire` built only when `ai.params.fire === true`, have the test pilot think every tick while it holds (`scheduleWake(self, 1)`) and set `nav.targetId`, and have a separate agent write the new oracle fixtures first.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Decision to fire (opt-in) | AI module params (`src/sim/ai/pilots/*`) | World step builds `SteerContext.fire` from `ai.params.fire` | `ai: null` has no params, so production ships cannot fire by construction (D-05, D-14) |
| Calls to fire at Oolite's sites, hot-weapon branches | Steering (`src/sim/npc/behaviours/*`) | `dispatch.ts` `SteerContext` | Phase 14 owns the behaviours; the cut sites are comment-marked there |
| The gate (temperature, energy, timer, range roll, `onTarget`), cooling | Pure sim module `src/sim/npc/fire.ts` | Called from `src/sim/combat/step.ts` | One gate site for both routes; total; unit- and oracle-testable without a world |
| Shot resolution, `missedShots` update | Combat step (`resolveShotHits`) | `firstShipHit` (Phase 13) | Existing single fixed resolution point after the world step (A6) |
| Damage, shields, energy, kills | Ledger (`applyLedger`, `routeDamage`) and `killShip` | `drainAiEventsNow` | Already built (Phases 13, 15); only verified here |
| Player shield and energy display | Existing HUD / probe `combat.fwdShield`, `combat.energy` | none | D-11: no new feedback |
| `?test=1` shooter and attacker spawn | Sim helper `src/sim/ai/test-spawn.ts` | App hook (`probe.ts`, `probe-publisher.ts`) | Hook taints the session; populator never calls it |
| Independent expected values | `tests/oracles/npc/**` | `tests/sim/npc/oracle-*.ts` consumers | Independence guard forbids any `src` import |

## Standard Stack

No new package is needed. The phase uses what the repository already pins [VERIFIED: `package.json` devDependencies read this session: `"vitest": "5.0.5"`, `"fast-check": "4.10.2"`, `"zod": "4.6.7"`, `"typescript": "6.0.2"`, `"@playwright/test": "1.64.1"`, `"three": "0.187.0"`, `"vite": "8.3.5"`].

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript (strict, `exactOptionalPropertyTypes`) | 6.0.2 | The gate, behaviours, wiring | Project stack |
| Vitest | 5.0.5 | Unit, scenario, oracle-consumer and guard tests | Project test runner (`npm run test:fast`, `npm test` with coverage) |
| fast-check | 4.10.2 | Totality properties for every new sim function (Pitfall 16, D-17) | Already used by `steering.property.test.ts`, `kill.property.test.ts` |
| zod | 4.6.7 | Oracle fixture schema (the only bare package the oracle tree may import) | `tests/oracles/npc/schema.ts` |
| Playwright | 1.64.1 | The one opt-in browser spec (hook shooter to HUD) | `tests/e2e/combat.spec.ts` |

### Supporting (in-repo modules to reuse, not rewrite)
| Module | Purpose | When to Use |
|--------|---------|-------------|
| `src/sim/combat/constants.ts` `LASER_STATS` | Energy, damage, recharge, shot temperature, range per laser | Gate inputs; do not copy numbers |
| `src/sim/npc/target.ts` `currentAimTolerance`, `targetBody`, `rangeToPrimaryTarget` | Aim tolerance and target validity | `onTarget` and the range |
| `src/sim/npc/tracking-curve.ts` `calculateTargetPosition` | `[self calculateTargetPosition]` (`ShipEntity.m:5412`) | `onTarget` |
| `src/sim/combat/hit.ts` `firstShipHit`, `ledger.ts`, `kill.ts` | Hit rule, damage, kill | Unchanged |
| `src/sim/rng.ts` `createRngState`, `rngNext` | The shooter's own `combat` stream | The range-roll draw |
| `src/sim/world/view-impl.ts` `createWorldView` | A view at drain time | `onTarget` and range inside `resolveShots` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Gate at the one drain site (recommended) | Gate inside `SteerContext.fire` at the behaviour call | Exact pre-move pose and range for steered ships, but `ShipControl.fire` cannot reach it (control has no view or player), the fire queue would have to carry rays, and `world.fireQueue` tests pin an id list. The drain site extends the already-recorded A6 divergence (resolution after the world step) by the shooter's own one update of attitude. |
| `fire` request carries a range | Id-only request, range recomputed at drain | Id-only keeps `fireQueue: EntityId[]`; the range differs from Oolite's call-time `range` by at most one tick of relative motion |

**Installation:** none (no `package.json` change, so no `docker compose down --volumes` is needed).

**Version verification:** not applicable, no package is added.

## Package Legitimacy Audit

No external package is installed or changed by this phase, so the Package Legitimacy Gate was not run and there is nothing to audit.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| (none) | n/a | n/a | n/a | n/a | n/a | n/a |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
 hook ?test=1 (taints session)            populator (12 ships, ai: null  -> can never fire)
   |                                              |
   |  spawnTestShooter / spawnTestAttacker        |
   v                                              |
 entity.ai.params.fire === true  <----------------+  (absent => no fire, hash unchanged)
   |
   |  tick T, stepWorld
   v
 UPDATE phase (ascending id, steered ships only)
   steerEntity -> steerShip(entity, ctx)         ctx.fire exists only when params.fire === true
      behaviour reads entity.weapon.temperature (F at start of tick, pre-shot, pre-cool)
      Oolite fire sites call ctx.fire()  ------------------+
      hot-weapon tail: temperature > 217.6 -> ATTACK_TARGET |  (pushes id, de-duplicated)
 THINK phase                                                |
   test pilot hold: setTarget once, scheduleWake(1),        |
   ctl.fire(self) every tick  ------------------------------+
   |                                                        v
   |                                              world.fireQueue: EntityId[]
   v
 resolveShots (after stepWorld, once per tick)
   1. drainFireQueue: sort ascending id, clear queue, then for each requester
        npcFireGate(...)  [temp -> energy -> timer -> ONE draw -> range -> onTarget]
          refuse: nothing changes (draw consumed after the cheap checks)
          fire:   energy -= use; temperature += shot heat; lastShotTick = T  -> ShotRequest(ray, laser)
   2. rechargeShips (energy += rate*dt)             (Oolite order: behaviour, then regen)
   3. coolShips (temperature = max(temp - fround(6*dt), 0))   (Oolite order: then cooling)
   4. every ShotRequest (player first, then ascending id): firstShipHit(ray, candidates)
        hit  -> HitRecord, shooter.missedShots = max(0, missed - 1)
        miss -> shooter.missedShots + 1 (saturating)
   5. applyLedger -> player: routeDamage(facing shield, then energy, floor 0)
                     NPC: energy -= amount, lethal list
   6. killShip (ascending victim id) -> drainAiEventsNow -> second commitWorld
   v
 events: laserFired, shipHit, shipDestroyed ... -> HUD reads probe combat.fwdShield / energy
```

### Recommended Project Structure
```
src/sim/npc/fire.ts                  # NEW: npcFireGate, onTarget, coolWeapon, float32 constants (pure, total)
src/sim/npc/dispatch.ts              # SteerContext gains optional `fire`
src/sim/npc/behaviours/{evasive,attack-evade,attack-close,attack,flee}.ts  # fire sites, hot branches
src/sim/npc/{target,track,constants}.ts   # missedShots live, NPC_WEAPON_TEMP removed
src/sim/combat/step.ts               # drainFireQueue runs the gate; cooling; missedShots at resolve
src/sim/world/step.ts                # steerEntity builds ctx.fire when ai.params.fire === true
src/sim/ai/pilots/{test-pilot,flight-script}.ts   # opt-in param; test pilot per-tick ask and nav target
src/sim/ai/test-spawn.ts             # spawnTestAttacker next to spawnTestShooter
src/app/{probe.ts,session/probe-publisher.ts}     # hook member (if the variant is added)
tests/oracles/npc/fire/              # NEW independent fixture family, schema, derivation, self-test
tests/sim/npc/{fire.oracle.test.ts,oracle-groups.ts,oracle-coverage.test.ts}   # consumers and manifest rows
tests/guards/                        # three D-13 tripwires (+ one recommended decision-source guard)
```

### Pattern 1: One pure gate, ported from `fireWeapon:` in Oolite's order

**What:** a total function over plain numbers returning a closed result, so the oracle can drive it without a world.
**When to use:** every NPC shot, both routes. The order is the Oolite order and must not be reordered, because the draw comes after the cheap refusals.

Oolite source (read this session) [CITED: `/home/opencode/git/oolite/src/Core/Entities/ShipEntity.m:9912-9993`]:

```objc
if (weapon_temp / NPC_MAX_WEAPON_TEMP >= WEAPON_COOLING_CUTOUT) return NO;      // 9935
if (energy <= weapon_energy_use * multiplier) return NO;                          // 9944
if ([self shotTime] < weapon_recharge_rate) return NO;                            // 9946
if (![weapon_type isTurretLaser]) {
    if (range > randf() * weaponRange * (accuracy + 7.5)) return NO;             // 9949
    if (range > weaponRange) return NO;                                           // 9951
}
if (![self onTarget:direction withWeapon:weapon_type]) return NO;                 // 9954
... fire ...
energy -= weapon_energy_use * multiplier;                                         // 9969
forward_weapon_temp += weapon_shot_temperature * multiplier;                      // 9972
```

Wegolite sketch (not final code; the names are the planner's):

```typescript
// Source: Oolite ShipEntity.m:9935-9972 (gate), ShipEntity.h:115-120 (constants)
export type NpcFireResult =
  | { readonly kind: "refused"; readonly drew: boolean }
  | { readonly kind: "fired"; readonly drew: true };

export function npcFireGate(input: NpcFireInput, draw: () => number): NpcFireResult {
  if (!(input.temperature / NPC_MAX_WEAPON_TEMP < WEAPON_COOLING_CUTOUT_F32)) return REFUSED_NO_DRAW; // NaN refuses
  if (!(input.energy > input.laser.energy)) return REFUSED_NO_DRAW;                                    // `<=` refuses
  if (input.lastShotTick !== 0 && input.tick - input.lastShotTick < input.rechargeTicks) return REFUSED_NO_DRAW;
  const u = draw();                                           // ONE draw, even with no target or no weapon
  if (input.range > u * input.weaponRange * (input.accuracy + 7.5)) return REFUSED_DREW;
  if (input.range > input.weaponRange) return REFUSED_DREW;
  if (!input.onTarget) return REFUSED_DREW;
  return FIRED;
}
```

### Pattern 2: Optional `SteerContext.fire`, built only for opted-in pilots

`SteerContext` is built in one place (`steerEntity`, `src/sim/world/step.ts`) from `{ view, stats, dt, draw, emit }` [VERIFIED: `src/sim/npc/dispatch.ts` `export interface SteerContext { readonly view: WorldView; readonly stats: NpcFlightStats; readonly dt: number; readonly draw: () => number; readonly emit: (event: SteerEvent) => void; }`]. Add `readonly fire?: () => void`, spread conditionally (`...(optedIn ? { fire: ... } : {})`, because `exactOptionalPropertyTypes` is on), where `fire` calls the same de-duplicating push `ShipControl.fire` uses. Optional keeps every existing test harness context (`tests/sim/npc/attack-support.ts`, `oracle-runner.ts`, `steering.property.test.ts`) compiling and meaning "not opted in", and the Phase 14 guard "steering never fires" (`attack.oracle.test.ts:36-47`, `attack-dispatch.test.ts:94`) stays true for them.

### Pattern 3: The pilot opt-in is a param key present only when set

`createTestPilotAi` already does this (`...(options.fire === true ? { fire: true } : {})`, `src/sim/ai/pilots/test-pilot.ts:75`). Give `createFlightScriptAi` the same `fire?: boolean` option and the same conditional spread, with the same key `fire`, so one world-step rule (`entity.ai.params.fire === true`) covers both pilots and every existing flight-script world serialises as before [VERIFIED: `flight-script.ts` `params` object has `script, phase, targetId, range, speed, frustrated` and no `fire`].

### Anti-Patterns to Avoid
- **A second hit or kill rule for NPC shots.** The funnel exists; the gate only produces `ShotRequest`s.
- **A new `ShipControl` member.** The member set is pinned by an exhaustive `Record<keyof ShipControl, true>` (`tests/sim/world/control.test.ts`, Pitfall 19). The existing `fire(id)` keeps its meaning "ask the gate".
- **Reading frame time or `performance.now()` anywhere in the gate** (the rate must be tick-derived).
- **A new hashed field or a new RNG stream.** D-05/D-15 freeze both; the draw uses `entity.rng.combat`.
- **Letting the gate throw.** It runs outside AI fault containment (Pitfall 16).

## Findings by Key Question

### Q1. The full NPC fire gate and its whole-tick mapping

**Oolite facts** [CITED: `ShipEntity.m` and `ShipEntity.h` at the paths below, all read this session]:

| Item | Oolite | Value | Wegolite mapping |
|------|--------|-------|------------------|
| Heat cutout | `weapon_temp / NPC_MAX_WEAPON_TEMP >= WEAPON_COOLING_CUTOUT` refuses (`ShipEntity.m:9935`) | `WEAPON_COOLING_FACTOR 6.0f`, `NPC_MAX_WEAPON_TEMP 256.0f`, `WEAPON_COOLING_CUTOUT 0.85f` (`ShipEntity.h:115-117`) | refuse when `temperature / 256 >= 0.85` (equivalently `temperature >= 217.6000061`); constants exist in `src/sim/npc/constants.ts` |
| Energy | `energy <= weapon_energy_use * multiplier` refuses (9944); multiplier is 1 unless `weapon_mount_mode` is `multiply` (477), authored by no compiled record [CITED: `rg weapon_mount_mode shipdata.plist` returned nothing] | pulse 0.8, beam 0.5, mining 1.4, military 1.1 | `energy <= LASER_STATS[laser].energy` refuses; a firing ship can never reach 0 by its own shot |
| Shot timer | `[self shotTime] < weapon_recharge_rate` refuses (9946); `shot_time += delta_t` at the end of each update (2221); reset to 0 only on a fired shot (10463); initial `INITIAL_SHOT_TIME 100.0` (`ShipEntity.h:102`, `ShipEntity.m:208`) | pulse 0.5 s, beam 0.1 s, mining 2.5 s, military 0.1 s | `lastShotTick === 0` ready, else `tick - lastShotTick >= rechargeTicks` with `rechargeTicks = round(rate * 120)` (D-07): pulse 60, beam and military 12, mining 300. `LASER_STATS[*].rechargeTicks` already holds `round(rate * 120)` [VERIFIED: `constants.ts:62`] |
| Range roll | `range > randf() * weaponRange * (accuracy + 7.5)` refuses (9949), then `range > weaponRange` refuses (9951); both only for non-turret lasers | range 12,500 pulse and mining, 15,000 beam, 30,000 military | one unit draw from `entity.rng.combat`, always taken once the three cheap checks pass |
| `onTarget` | 9851-9909: sun test, `dq` against `v_forward`, `aim*aim`, `astq` (details below) | | `onTarget` as a pure function of poses, target radius, aim tolerance |
| Cost on fire | `energy -= weapon_energy_use` (9969), `forward_weapon_temp += weapon_shot_temperature` (9972) | heat pulse 7, beam 3.2, mining 10, military 4.25 | `entity.energy -= energy`, `weapon.temperature += heat`, `weapon.lastShotTick = tick` |
| Cooling | `forward_weapon_temp = fmaxf(forward_weapon_temp - (float)(WEAPON_COOLING_FACTOR * delta_t), 0.0f)` (2215), after `processBehaviour` (2415) and the energy regeneration in the same `update:` | 6 per second | per stepped tick, after the gate: `temperature = max(fround(temperature - fround(6 * dt)), 0)` |
| Missed shots | `adjustMissedShots:-1` when the beam finds a ship (10396), `+1` otherwise (10425); floored at 0 (10468-10477) | | update at shot resolution in the combat step |

The LASER_STATS values quoted above are [VERIFIED: `src/sim/combat/constants.ts:72-110`: `EQ_WEAPON_PULSE_LASER: laserStats({ range: 12500, energy: 0.8, damage: 15, rechargeRate: 0.5, shotTemperature: 7,`; `EQ_WEAPON_BEAM_LASER: ... range: 15000, energy: 0.5, damage: 6, rechargeRate: 0.1, shotTemperature: 3.2,`; mining `range: 12500, energy: 1.4, damage: 50, rechargeRate: 2.5, shotTemperature: 10,`; military `range: 30000, energy: 1.1, damage: 12, rechargeRate: 0.1, shotTemperature: 4.25,`].

**The compiled NPC weapons** [VERIFIED: `src/content/generated/ships-npc.json` read this session]: pulse on adder, cobramk1, mamba, moray, sidewinder; beam on gecko, krait, viper; `EQ_WEAPON_NONE` on shuttle. The hook shooter is the Viper (`TEST_SHOOTER_KEY = "viper"`, `probe-publisher.ts:97`), so the browser spec fights a 0.1 s beam. Only forward weapons exist (aft, port and starboard are refused by the content build, Phase 14 row), so one temperature and one timer suffice.

**`onTarget` (`ShipEntity.m:9851-9909`)**, with the Wegolite parts it needs:
- turret laser: always YES (none compiled, unreachable); no target or target dead: NO.
- `isSunlit && target not sunlit && randf() < 0.75`: NO (9868). `isSunlit` defaults YES (`Entity.m:85`) and is cleared only inside a planet's shadow (`CollisionRegion.m:569-609`). Wegolite models no shadow, so both are sunlit, the clause is false and draws nothing. Record it next to Phase 14's "no sun glare" cut; do not add a draw.
- `rel_pos = calculateTargetPosition - position` (the reaction-time aim point, `calculateTargetPosition` in `tracking-curve.ts`), `urp = vector_normal_or_zbasis(rel_pos)` (zero vector gives the forward basis, which is Wegolite's local -Z), `dq = dot(urp, v_forward)` for the forward facing; `dq < 0` gives NO (9897).
- `aim = currentAimTolerance`; `dq > aim * aim` gives YES (9900-9901); else `astq = sqrt(1 - r*r / (d2 * 9))` and the result is `fabs(dq) >= astq` (9907-9909). A target radius so large that `r*r > 9*d2` makes `astq` NaN and the comparison false, which is NO; JavaScript gives the same.

**`weapon_temp` versus `forward_weapon_temp`.** Oolite refreshes the copy `weapon_temp` at the top of every `fireWeapon:` (9914-9921), cools it at 2214, and the three tail reads (`ShipEntity.m:4456, 4577, 4713`) come right after a `fireMainWeapon:` in the same function, so they see the forward temperature at the start of the update, which excludes the heat the shot just added. The dispatcher (4053, 4078-4089) and break-off (3932) read `forward_weapon_temp` itself. In Wegolite all of these are `entity.weapon.temperature` read during steering, which is before the drain adds heat and before cooling, so one field is exact. Constraint on the planner: cooling must run after the gate within the tick (Oolite cools at the end of `update:`); do not cool inside `steerEntity`.

**Settled numeric points (the "float32 width" item of D-07):**
1. **Temperature is float32.** Store `weapon.temperature` through `Math.fround` on every write: `temperature = fround(temperature + fround(shotHeat))` and `temperature = max(fround(temperature - fround(6 * dt)), 0)` (`(float)(6.0f * delta_t)` is a double product cast to float; `fround(6/120)` is 0.05000000074505806). Compare against `fround(0.85) * 256` = 217.60000610351562 [ASSUMED: arithmetic done this session in a scratch calculation, not run through the oracle]. Reason: the fixtures that count shots to the cutout (about 997 ticks for a beam at a 12-tick period, 3181 for a pulse; arithmetic ignoring the range roll and aim) are exactly the kind that a float64 drift could move by one tick. It costs nothing and keeps the hash a function of float32 values that round-trip through JSON exactly. Phase 14's rule 15 (GLfloat fields are float64 except `frustration` and `successFactor`) is extended, not contradicted: temperature joins the float32 list.
2. **The 0.1 s shot period is a recorded divergence.** `weapon_recharge_rate` is a `float` (`ShipEntity.h:345`), so `0.1f` is 0.10000000149; with `shot_time` a double that accumulates `1/120` per update, Oolite at exactly 120 Hz first allows a shot after 13 updates, not 12 [ASSUMED: scratch arithmetic: 13 additions reach 0.108, 12 reach about 0.1 which is below 0.1000000015]. D-07's `round(rate * 120)` gives 12. Oolite's real period varies with frame time anyway, so there is no single "true" tick count; the planner should keep D-07 (locked), state the 12-versus-13 difference in the decision row and the oracle's `derivation`, and optionally measure Oolite with the reference container (Open Question 1). Pulse (60) and mining (300) are exact in float32 and unaffected by the rate width.
3. **Gate arithmetic stays float64 except temperature.** `energy`, `range`, `accuracy` and the dot products are float64 in the port; a value within one float32 step of a threshold can decide differently (Phase 14 rule 15 already records this class).

**Unarmed and target-less gate calls still draw.** For `EQ_WEAPON_NONE` Oolite's `fireMainWeapon:` calls `setWeaponDataFromType:` with the NONE equipment object, whose `weapon_info` is `range = 32000; energy = 0.0; damage = 0.0; recharge_rate = 100.0; shot_temperature = 0.0` [CITED: `Resources/Config/equipment.plist:107-121`], so the energy check passes for any positive energy, `shot_time` (starting at 100) is not below 100, the roll draws one `randf()`, and the shot is not fired only because `isWeaponNone` (9958, `if (!isWeaponNone(weapon_type))`). After the call it resets the data from nil (10020-10043), which is why Phase 14 sees `weaponRange` 0. And with no target, `onTarget` returns NO only after the draw. So **a gate call that passes the three cheap checks always consumes exactly one draw, armed or not, target or not.** This is what the stream's draw count depends on, so it belongs in the oracle (a fixture "unarmed ship, energy above 0: one draw, no shot").

**Rate of fire at 30, 60 and 144 Hz.** The sim steps a fixed 1/120 s (`TICKS_PER_SECOND = 120`, `src/sim/ai/time.ts:17`); the render rate only changes how many whole steps run per frame. Every quantity above is a function of the integer tick or of `dt = 1/120`, so equality across rates follows if (a) nothing reads frame time, (b) the per-tick ask is per tick (D-09), and (c) the draw is per gate call. Prove it with a cross-cadence hash test copied from `tests/sim/npc/npc-cadence.test.ts` (its own frame runner, tick-indexed log) over a scenario with an opted-in attacker.

### Q2. Fire sites, hot-weapon branches and the cut points in `src/sim/npc/**`

Oolite call sites, all read this session (`ShipEntity.m`), against the Phase 14 IN list:

| Behaviour | Oolite fire call | Hot-weapon read after it | `onTarget` input | Wegolite cut point (read this session) |
|-----------|------------------|--------------------------|------------------|----------------------------------------|
| EVASIVE_ACTION, FLEE_EVASIVE_ACTION | 4035, after `frustration` and the hand-over, `fireMainWeapon:[self rangeToPrimaryTarget]`; the proximity-alert path returns first (4013-4016) | none | the same gate | `behaviours/evasive.ts` end of `behaviourEvasiveAction` (header comment: "`fireMainWeapon:` call (4035) is not ported") |
| ATTACK_SNIPER | 4454, after missiles and cloak | 4456: `weapon_temp > USABLE && accuracy >= COMBAT_AI_ISNT_AWFUL` gives ATTACK_TARGET | | `behaviours/attack-evade.ts` end of `behaviourAttackSniper` (comment "4449-4458: missiles, cloak, fireMainWeapon and the hot-weapon return") |
| ATTACK_FLY_TO_TARGET_SIX and _TWELVE | 4575 | 4577: `weapon_temp > USABLE` gives ATTACK_TARGET (unconditional) | | `behaviours/attack-close.ts` end of `behaviourFlyToTargetSix` (comment "4569-4579") |
| ATTACK_FLY_TO_TARGET | 4711 | 4713: `weapon_temp > USABLE && accuracy >= ISNT_AWFUL && aim_tolerance * range < CONFIDENCE`, then `if (aspect < 0 \|\| aft/port/starboard fitted) { frustration = 0; ATTACK_TARGET }`; `else if (accuracy >= FLEES_BETTER_2)` the accuracy-9 dodge (4721-4729) | | `behaviours/attack-close.ts` end of `behaviourAttackFlyToTarget` (comment "4706-4730") |
| FLEE_TARGET | 4891, only `if ([forward_weapon_type isTurretLaser])` (4890) | none | | `behaviours/flee.ts`: **unreachable**, no compiled turret laser; record it, port nothing |
| ATTACK_TARGET dispatcher | none | 4053, 4078-4089 read `forward_weapon_temp` against READY (64) and USABLE (217.6) | | `behaviours/attack.ts:164` `forwardWeaponTemp: number = NPC_WEAPON_TEMP` parameter; feed it `entity.weapon.temperature` |
| ATTACK_BREAK_OFF_TARGET | none | 3932: `forward_weapon_temp < COMBAT_AI_WEAPON_TEMP_READY` in the hand-over | | `behaviours/attack-evade.ts:184` `NPC_WEAPON_TEMP < NPC_WEAPON_TEMP_READY`; read the entity temperature |
| ATTACK_SLOW_DOGFIGHT, ATTACK_FLY_FROM_TARGET | none | none | | no change |

Out of the Phase 14 IN list and therefore not ported here, each stays "idle fallback" or unreachable: ATTACK_MINING_TARGET (4607), RUNNING_DEFENSE (4821, 4823, 4830), ATTACK_BROADSIDE (4328, 4330, 4288, 4333) and the scripted AI site (5391-5397) [CITED: `rg fireMainWeapon ShipEntity.m` list; Phase 14 Key Decisions row "Phase 14 NPC steering scope"].

**Defects and hazards the cut sites hide (verify each in the plan):**
- **Sniper early return (real defect once fire is live).** Wegolite: `if (range < SNIPER_BOUNCE_RANGE) { nav.behaviour = "ATTACK_TARGET"; return; }` [VERIFIED: `attack-evade.ts:88-90`]. Oolite: `if (range < 15000) { behaviour = BEHAVIOUR_ATTACK_TARGET; } else { ... }` and then it **continues** to the cloak, `fireMainWeapon:range` and the hot read (4413-4458) [CITED]. The port must become if/else with the tail shared. With no `ctx.fire` and temperature 0 the tail is a no-op, so the frozen worlds are unaffected and the existing `attack-evade.json` fixtures still pass; add a fixture for "range under 15,000 still requests fire".
- **The tail reads the temperature before the gate runs.** The hot-weapon read happens in the same tick as the request and before the drain adds heat. That is exactly Oolite's (see Q1) and needs no extra state, but it means a shooter that has just crossed the line does not go hot until the next tick, as Oolite.
- **Target cleared mid-tick.** `evasiveAction` can call `noteLostTargetAndGoIdle`, after which evasive still reaches its fire call (4035) with range 0 (Phase 14 comment in `evasive.ts`). The request is still made; the gate refuses at `onTarget` after drawing. Do not add an `if (target)` guard in the behaviour: it would remove a draw Oolite takes.
- **The accuracy-9 dodge of fly-to is still not ported** (Phase 14 divergence 21: it reads the target's weapon types, which `BodyView` does not carry). Hot-weapon branch ported, its `else if` twin stays out; the first branch's inner `if` has no `else`, so when the outer condition holds and the inner fails the dodge is skipped in Oolite too.
- **`missedShots` live changes two Phase 14 functions.** `currentAimTolerance` must apply `basic_aim /= 1.0 + missedShots / 4.0` for `accuracy >= 0` before the `>= 7.5` division by 5 (`ShipEntity.m:9769`; today `target.ts` has the `>= 7.5` division only), and `trackPrimaryTarget` must apply the `else if (accuracy >= COMBAT_AI_ISNT_AWFUL)` branch `min_d -= 0.0001 * missedShots; if (min_d < 0.001) { min_d = 0.001; max_factor *= 2; r_max_factor /= 2.0; }` (`ShipEntity.m:9134-9141`; `track.ts:399-400` documents it as unported). Both are exact no-ops at `missedShots` 0 (divide by 1, subtract 0), so the frozen worlds do not move. Existing oracle fixtures all have 0; the new family needs fixtures with non-zero `missedShots` (a schema field `self.missedShots`).
- **`NPC_WEAPON_TEMP`** (`src/sim/npc/constants.ts`, a constant 0 documented as "always 0, because no NPC fires in v2.2") must be deleted and its readers moved to `entity.weapon.temperature`; `tests/sim/npc/constants.test.ts` (141 tests) pins the ledger and must be amended in the same plan. Pitfall 2's warning sign is "`NPC_WEAPON_TEMP` still a constant after P-Fire".

**How hot branches change trajectories** (arithmetic from the gate, ignoring the roll): a continuously firing beam ship reaches `forward_weapon_temp >= 64` (READY) after 25 shots, about 289 ticks, so the dispatcher's `weapons_heating` branch begins (against the player, whom Phase 14 never lets target an NPC, `targetTargetsSelf` is false, so with `range < 0.5 * weaponRange` it backs off with ATTACK_FLY_FROM_TARGET and a jink); at 217.6 it has no usable weapon and takes EVASIVE_ACTION (accuracy >= 5, 75 % draw) or FLY_FROM / FLY_TO by aspect and range. A pulse ship reaches READY after 16 shots (about 901 ticks). So a fired-upon world diverges from Phase 14 trajectories in seconds, and the new behaviour fixtures must set the temperature explicitly [ASSUMED: scratch simulation, not an oracle result].

### Q3. Player hits, NPC-versus-NPC hits and the kill path

All of this already exists and was verified by Phase 13 and 15; Phase 17 verifies it with NPC sources.
- **Facing shield and energy:** `routeDamage` projects the attacker's offset on the player's forward axis, `>= 0` drains the forward shield, `< 0` the aft; the overflow drains energy, floored at 0, and heats the cabin by 0.5 per point [VERIFIED: `src/sim/combat/shields.ts:124-165` `const dForward = dot(attackerOffset, forward); ... if (!(dForward < 0)) { state.fwdShield -= remaining; ...`]. Oolite [CITED: `PlayerEntity.m:5635-5680`: `if (d_forward >= 0) { forward_shield -= amount; if (forward_shield < 0.0) { amount = -forward_shield; forward_shield = 0.0f; } else { amount = 0.0; } } else { aft_shield ... } ... if (amount > 0.0) { energy -= amount; ...`]. The only difference is Phase 13's recorded floor at 0 (Key Decisions row "Floor the player's energy at 0 until a death phase exists"), which Phase 17 keeps; the death check is Phase 20. Shields: `BASELINE_SHIELD_LEVEL = 128`, recharge 2 per second [VERIFIED: `constants.ts`].
- **Where the rule and the octree test live:** `src/sim/combat/hit.ts` `firstShipHit` (two-stage: bounding sphere then the octree descent of `octree.ts`), `src/sim/combat/ledger.ts` `applyLedger`, `src/sim/combat/shields.ts` `routeDamage`, `src/sim/world/kill.ts` `killShip` [VERIFIED: files read]. The player is a hit candidate with `PLAYER_HULL_KEY` only when a combat state is passed and the player is launching or in flight (`step.ts:287-305`); NPC ships are candidates when the world stepped.
- **Hit record:** `{ target, source, amount: LASER_STATS[laser].damage, sourcePosition }` with the shooter's centre as `sourcePosition`, which is what picks the shield [VERIFIED: `step.ts:322-330` `records.push({ target: hit.id, source: shot.shooter, amount: stats.damage, sourcePosition: {`, `ledger.ts` `HitRecord`]. An NPC at energy 0 after the ledger is killed by `killShip`, and `drainAiEventsNow` then delivers `shipTargetLost` to everything that held the victim and `shipTargetDestroyed` plus `shipKilledOther` to a live NPC killer.
- **Same-tick mutual kill:** two ships that kill each other in one tick are credited by the existing rule: victims die in ascending victim id, and a killer is credited only if still alive at that call, so the lower-id victim is credited to the other ship and the higher-id victim carries `NO_ENTITY` [VERIFIED: `step.ts` `resolveShots` doc, "In a same-tick mutual kill the lower-id victim is therefore credited to the other ship and the higher-id victim carries `NO_ENTITY`"; `kill.ts:87-98` `normaliseKiller`]. D-10 pins it with a Vitest scenario and a decision row. To make the scenario deterministic, feed `resolveShots` explicit `ShotRequest`s (its `shots` parameter) rather than rely on the gate and range roll.
- **Same-tick double hit:** a ship doomed earlier in a tick still gets `shipHit` for a later hit (`ledger.ts` module comment); with no consumer (D-11) that stays.
- **Own-energy cost never kills:** the gate refuses at `energy <= cost`, so a shooter keeps strictly positive energy; a shot's cost does make a long fight weaker (NPC energy is health; Pitfall 2 says do not skip it).

### Q4. The test-pilot and hook shooter route, the opt-in, and keeping production free of a decision source

**Where things live** [VERIFIED: files read this session]:
- `src/sim/ai/test-spawn.ts` `spawnTestShooter(world, player, record, tick, cargo?)`: spawns a test pilot with `fire: true`, `holdRange: TEST_SHOOTER_HOLD_RANGE` (2000), `ai.params.phase = "hold"`, `ai.params.targetId = PLAYER_ID`, `TEST_SHOOTER_DISTANCE = 1_500`, `speed: 0`, nose turned half a turn to face the player. `spawnTestFlyers` is the sibling for flight-script ships.
- `src/app/session/probe-publisher.ts` `spawnShooter` (`TEST_SHOOTER_KEY = "viper"`, `markHookMutation()` taints before the world is touched) and `spawnFlyers`; `src/app/probe.ts` `WegoliteSimTestHook` declares the members and `hook.tainted = true` after a successful spawn.
- A new hook member (the attacker variant, name Claude's discretion; recommended `spawnTestAttacker(): boolean`) touches: `test-spawn.ts` (new function), `probe.ts` (type and impl), `probe-publisher.ts` (spawn with taint), `tests/fixtures/probe-shape.json` (the member is listed twice, lines 1139 and 1366 for `spawnTestFlyers`), `tests/app/probe-shape-compare.test.ts:244-245`, `tests/app/session/probe-publisher.test.ts` (a describe like the `spawnTestFlyers` one), and `tests/helpers/tick-script.ts` if a replay step is wanted. The attacker is `createFlightScriptAi(tick, { script: "attack", targetId: PLAYER_ID, fire: true })` with the player as target; "attack" already runs `ctl.setTarget` then `ctl.perform("ATTACK_TARGET")` (`flight-script.ts` `start`).

**Two facts that break a naive port:**
1. **`nav.targetId` is 0 for the hook shooter.** `spawnEntity` initialises `nav: { behaviour: "IDLE", targetId: NO_ENTITY, ... }` [VERIFIED: `src/sim/world/world.ts:540-542`], `SpawnInit` has no nav field, and `spawnTestShooter` sets only `ai.params.targetId`. The pilot's `seek` calls `ctl.setTarget`, but the shooter spawns already in `hold`. The gate and `onTarget` read the target from `nav` (D-12), so without a fix the shooter never fires. In `hold`, set the target once: `if (view.ship(self)?.targetId !== targetId) ctl.setTarget(self, targetId)` (`ShipView.targetId` exists, `view.ts`). Do not call `setTarget` every tick: it restarts the tracking curve each time (`control-impl.ts` `setTarget` sets `trackingCount = 0`).
2. **`hold` does not run an attack behaviour.** The shooter's behaviour is STOP_STILL, which never calls fire. So the per-tick ask of D-09 must come from the pilot. Recommended: in `hold`, when `ai.params.fire === true`, call `ctl.scheduleWake(self, 1)` before `ctl.fire(self)`. `think` then runs every tick (the existing end-of-think `scheduleWake(self, ticks(0.1 + random() * 1.5))` cannot push it later: `scheduleWake` keeps the earlier of two wakes, `control-impl.ts` "Oolite's never-later rule"). This keeps all pilot logic in the pilot, adds no `ShipControl` member, and puts the ask on the tick (not the frame). Cost: one `random()` draw per tick from the pilot's own `ai` stream. The alternative (a world-step rule reading `ai.params.phase === "hold"`) couples the world step to a module's private param names.

**Production guarantee (criterion 3, D-14).** By construction: the populator spawns every ship with `ai: null` (`populate.ts`, `ai: null` at the spawn call; `stepWorld` skips `entity.ai === null`), `AI_REGISTRY` holds only `test-pilot` and `flight-script`, and the only code that constructs an AI component is `src/sim/ai/test-spawn.ts` [VERIFIED: `rg createFlightScriptAi|createTestPilotAi src` returned only `test-spawn.ts`, the two pilot files themselves]. The hook is reachable only under `?test=1` and taints the session. To make it mechanical, recommend one extra guard (not among the three D-13 tripwires, so a planner decision): a pure source scan, in the style of `tests/guards/entity-id-scope.test.ts` (`withoutComments` helper), asserting that under `src` no file other than `test-spawn.ts` and the two pilot modules references `createTestPilotAi`, `createFlightScriptAi` or the `fire` opt-in key, and that `populate.ts` contains no `ai:` other than `ai: null`; plus the existing populator test that every spawned ship is `ai: null`. The Key Decisions row required by criterion 3 should name this guard.

**The three D-13 tripwires, concrete detection** (the planner chooses, these fail on the first real consumer):
1. Kill credit: scan `src` (comments stripped) for `shipTargetDestroyed`, `shipKilledOther` and a `.killer` read, allowing only `src/sim/world/kill.ts`, `src/sim/events.ts`, `src/sim/ai/types.ts` (the name list), `src/sim/combat/ledger.ts` and `src/sim/combat/step.ts` (plumbing). Today `flight-script.ts` `onEvent` handles only `shipAIFrustrated`, `shipAchievedDesiredRange`, `shipNowFacingDestination`, `shipTargetLost`, and `event-router.ts:463` mentions "killer" only in a comment [VERIFIED].
2. `shipHit`: scan `src` for the literal `shipHit` outside `src/sim/events.ts` (type and `RESERVED_EVENT_KINDS`) and `src/sim/combat/ledger.ts` (the emitter), and check the app event router's subscriber table. Today `rg shipHit src/app` finds nothing [VERIFIED].
3. `onEvent`: `Object.values(AI_REGISTRY).filter((m) => m.onEvent !== undefined).length <= 1`, a runtime check. Today only `FLIGHT_SCRIPT` has one [VERIFIED: `flight-script.ts:287` `Object.freeze({ think, onEvent })`, `test-pilot.ts` `Object.freeze({ think })`].
Each failure message names its todo file. Create two new todos (kill-credit symmetry; narrow the kill-time `shipTargetLost`); add a pointer to the guard in `2026-11-17-skip-shiphit-for-a-doomed-target.md`.

### Q5. The oracle and fixture approach (so a separate agent can write fixtures first)

**How Phase 14 did it** [VERIFIED: files read]: `tests/oracles/npc/` holds zod-strict fixtures (`schema.ts`, ids kebab-case, every fixture carries `oolite` citations matching `^(?:src/Core|Resources)/...:a-b$`, a `derivation`, scripted `draws`, `checks`, `events`), an independent derivation module per family (`reference/*.ts`, `pursuit/derive.ts`, "imports nothing from `src/`") and a `*.self.test.ts` that re-derives every expected value. The port-side consumer is `tests/sim/npc/*.oracle.test.ts` using `oracle-runner.ts`, with the static manifest `tests/sim/npc/oracle-groups.ts` (each fixture file mapped to exactly one test file) and `oracle-coverage.test.ts` comparing the manifest to the files on disk. `tests/guards/oracle-independence.test.ts` mechanically refuses any `tests/oracles/**` import outside `node:`, `zod`, `vitest` or the oracle tree, and any file-system call naming a `src` path. The oracle is source-cited maths and hand-derived closed forms, not a run of Oolite (`14-FIDELITY-REPORT.md` "Independence limit"); the real-Oolite container (`tools/oolite-reference/run-remote.sh`, Oolite 1.93.1-255 headless on the remote machine, outputs kept outside the repo) exists to settle a question the source cannot.

**What Phase 17 must add (new family `tests/oracles/npc/fire/`, own schema file; the existing `OracleFixtureSchema` is a strict object with no weapon fields):**
1. **Gate fixtures** (pure function level): inputs `tick`, `lastShotTick`, `temperature`, `energy`, the weapon row, `accuracy`, `missedShots`, `range`, an `onTarget` boolean or geometry, scripted `draws`; expected `fired`, draws consumed, energy, temperature, `lastShotTick`. Cover: each refusal in order (heat at exactly 217.6000061 and just below; energy exactly equal to the cost; timer at `rechargeTicks - 1`, `rechargeTicks`, `rechargeTicks + 1`; `lastShotTick` 0 ready); a refusal before the draw consumes none; a refusal at the roll or range or `onTarget` consumes exactly one; an unarmed ship and a missing target consume one; the roll's boundary for accuracy -5, 0, 9; 12-versus-13 tick period for 0.1 s lasers stated in `derivation`.
2. **`onTarget` fixtures:** forward cone at accuracy below 0, in [0, 7.5) and at 7.5 and above; the `dq < 0` early NO; the `astq` branch; the `r*r > 9*d2` NaN; zero `rel_pos`; `missedShots` 0, 3 and 31 shifting the tolerance.
3. **Temperature trajectories in float32** (shots then cooling, 120 Hz and the fixed-tick rule), including the first tick the cutout refuses and the first tick cooling re-allows it.
4. **Behaviour fixtures** (one per fire site and hot branch of the table in Q2) that set `self.forwardWeaponTemp` and `self.missedShots` and check `behaviour` and "fire requested at tick k"; include sniper below 15,000, evasive with a vanished target, fly-to with the three-way inner condition, six with temperature just under and over 217.6, and the dispatcher's heating branch with the temperature a ship now actually has.
5. **`trackPrimaryTarget` with `missedShots` > 0** for accuracy in [0, 7.5) (the `min_d` branch and its 0.001 floor at 31 misses) and for 7.5 and above (unchanged).
6. **Rate-rule rows** in `frame-rate-rule.json` style: shot timer (time-compare, integer ticks), cooling (rate times dt), the roll (draw per call), recorded before any rate fixture exists.

**Process rules the plan must state** (these are process rules, only the import scan is mechanical): the oracle author is forbidden to read `src/sim/npc/**`, the new gate module and `tests/sim/npc/**`; the porter writes hand-derived unit tests first and opens a fixture only after they pass; a dispute is recorded, never settled by widening a tolerance. The port-side plan then adds the manifest rows and the runner support (`oracle-runner.ts` needs the new `self` fields and a recorder for `ctx.fire`), updates `oracle-coverage.test.ts`, and extends `frame-rate-rule`'s consumer if rows are added.

**Reference-container option.** To settle the 12-versus-13 period and the float32 point against the real game rather than the source, the planner can schedule a throwaway OXP probe through `tools/oolite-reference/run-remote.sh --addons DIR` that logs an NPC's shot ticks (OXP files and logs stay outside the repository; `log(this.name, "...")` needs two arguments). It is optional, not a gate, and listed as an open measurement in `.planning/todos/pending/2026-11-14-measure-oolite-reference-in-docker.md`.

### Q6. Byte-identical replay and the frozen acceptance run (what must not change)

**Why existing worlds cannot change, and the one subtle place.** A world that never opts in has (a) no `fire` param on any AI record, so `serializeEntity`'s `ai:` text is unchanged; (b) `weapon` pristine (`temperature 0`, `lastShotTick 0`, `missedShots 0`), which the hash omits [VERIFIED: `serialize.ts` prints `wpn:` only when any leaf is non-zero]; (c) no `ctx.fire`, so no queue entry, no gate and no draw; (d) `missedShots` 0, so `currentAimTolerance` divides by exactly 1 and `min_d -= 0.0001 * 0` is exact; (e) cooling that writes nothing when the temperature is 0 (do not write `-0` or touch the record). The acceptance harness hands the sim `options.combat.npcWeapons: realNpcWeapons()` and real hulls [VERIFIED: `tests/acceptance/detectors.ts:1144-1148`], so the only thing keeping its flyers silent is the absence of the opt-in, which `spawnTestFlyers` does not set. The flyers do run attack-family behaviours (intercept, the evasive hand-over), so every behaviour edit must be a pure no-op without `ctx.fire` and with temperature 0: the sniper restructure and the `missedShots` terms are the ones to prove with the frozen replay.

**Anchors that must not move** (never regenerate to make a gate pass; Phase 17 adds no field and no bump): `tests/golden/world/inert-lave-epoch1.json`, `tests/golden/world/flight-hash-pins.json` (`tests/sim/world/flight-hash-pins.test.ts`), the cross-cadence tests `tests/sim/npc/npc-cadence.test.ts` and `tests/sim/world/world-cadence.test.ts` (tick-indexed hash equality at 30, 60 and 144 Hz), the flyers scenario `tests/sim/npc/flyers.scenario.test.ts`, the Node twin in `tests/app/session/tick-flyers.test.ts`, and the acceptance numbers (minimum hull clearance 41.41 m at epoch 10, the designed near pass at 83 m, 61,662 attack ticks within 1,000 m, `aiFaulted 0`, `aiDropped 0`, `repairs 0`, run minimums 40/40/40 arrivals and 23 AVOID_COLLISION entries, per Pitfall 4). A passing run whose numbers moved is a failure of this requirement.

**What is expected to move, deliberately** (list once, in the plan that changes the behaviour, D-08): everything built on the ungated 15-tick shooter (Q-D08 table below) and the Node twin and browser pins of the shooter fight.

**Rerun schedule (D-17).** After every plan that touches `src/sim/npc/**` or `src/sim/world/**` (gate module, behaviours, `steerEntity`, pilot files under `src/sim/ai` are not in the list but `world/step.ts` is), run `npm run test:acceptance` on the remote machine, expect 21 of 21 and unchanged numbers, record it in that plan's SUMMARY. Plans that touch only `src/sim/combat/**`, `src/app/**` or tests do not need it, but the wiring plan edits `world/step.ts`, so it does.

### Q7. Pitfalls 1, 2, 4, 15 and 16 as they apply here (`.planning/research/PITFALLS.md`)

- **Pitfall 1 (nobody pulls the trigger):** resolved by the owner (no reflex AI, populated ships keep `ai: null`). Applied by testing the whole route from the hook spawn once end to end (hook shooter, gate, resolve, shield, readout) and by the decision-source guard in Q4.
- **Pitfall 2 (120 Hz spam once steering calls fire):** the gate in Q1 is the answer; the warning signs are "`ctl.fire` called from a behaviour with no timer test next to it", "a single NPC kills a ship in under a second", and `NPC_WEAPON_TEMP` still a constant. Gate sits before the draw as Oolite orders it. The document's advice to quantise "strict `>`, the same as the player's gate" is superseded by D-07 (NPC `>=`); do not unify the two comparators.
- **Pitfall 4 (acceptance run throws on a flyer death):** frozen worlds opt in to nothing; rerun by hand per plan; the harness would throw on a flyer death, so no test in this phase may reuse the acceptance world for a fight.
- **Pitfall 15 (dead-target handling):** the gate and every fire site tolerate a vanished target (`targetBody` returns undefined for a removed id; ids are never reused). Verify each ported site: the target-lost early returns precede the fire sites in sniper, six and fly-to, evasive has none (see Q2), and the tracking curve restarts on `setTarget`. The victim-side ATTACKED, `setPrimaryAggressor` and `ATTACKER_MISSED` reactions of Oolite (`ShipEntity.m:10438-10452` posts `shipBeingAttackedUnsuccessfully`, 11418-11560 the aggressor bookkeeping) are NOT ported (owner: no reflex AI), recorded as a cut.
- **Pitfall 16 (new combat code is outside AI fault containment):** `npcFireGate`, `onTarget`, `coolWeapon`, the drain and the `missedShots` update must be total: non-finite or negative energy, range, accuracy and temperature, a missing hull table (the lazily loaded "not loaded" state), a full store, a target that is the shooter itself, the accuracy sentinel `ACCURACY_UNRESOLVED = -100` (`src/sim/npc/state.ts:51`; a `ctl.fire` from an entity not yet updated reaches the drain with it, so refuse without drawing), `missedShots` saturating at `MAX_UINT32`. Extend `steering.property.test.ts` and `kill.property.test.ts` with random fights; keep the single containment point in `invoke`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| NPC shot hit test | A second ray or octree test | `firstShipHit` with `npcLaserRay` | Phase 13's two-stage rule is the shared half of A7 |
| Damage to the player | New shield maths | `applyLedger` and `routeDamage` | Oolite-checked, floors at 0 |
| Killing a ship | A second removal path | `killShip` then the second `commitWorld` | FOUND-19 one kill path, idempotent |
| Randomness | `Math.random`, a new stream, frame-time seeds | `rngNext(createRngState(entity.rng.combat))`, written back | Determinism and the draw rule (D-04); `sim-determinism-bans` guard |
| Aim point and tolerance | A second tracking or tolerance function | `calculateTargetPosition`, `currentAimTolerance` | Phase 14 already matches the oracle |
| Rate of fire | Seconds, `performance.now`, a frame counter | integer ticks (`rechargeTicks`, `lastShotTick`) | Identical at 30, 60 and 144 Hz |
| Weapon state storage | A new hashed field | `entity.weapon` (v4) | D-15, no snapshot bump |
| Float32 emulation | A custom rounding routine | `Math.fround` | The precedent for `frustration` |

**Key insight:** every hard part of NPC fire already exists as a funnel (hit, ledger, kill, snapshot, view, stream). The phase's risk is entirely in the order and the draw count of one small gate, the heat and `missedShots` feedback into steering, and keeping the no-opt-in path an exact no-op.

## D-08 Inventory: tests and fixtures that pin the ungated 15-tick shot

List once, amend in the plan that removes the ungated shot (not piecemeal). Found by `rg` over `tests` for `fire: true`, `createTestPilotAi`, `spawnTestShooter`, `.fire(`, `fireQueue` and the 15-tick wording; the planner must re-run those searches, because this list is from one pass.

| File | What it pins | Why it moves |
|------|--------------|--------------|
| `tests/sim/combat/npc-fire.test.ts` (`fireFrom` helper, ~14 tests incl. 1,500 m Viper drains 6, from behind, overflow, resolution order) | An NPC shot always resolves on the tick it is asked | Now refused by heat, energy, timer, roll or `onTarget`. Re-aim these at the part below the gate: feed `resolveShots` explicit `ShotRequest`s for the hit-rule tests; keep a gate-level suite for refusals. A pilot asking through `ctl.fire` is now subject to the draw. |
| `tests/sim/world/control.test.ts` (7 `ctl.fire` tests, `fireQueue` equality) | The queue only; stays valid (the request API is unchanged) | Verify only |
| `tests/sim/ai/test-pilot.test.ts:467-497` ("fires on every think while it holds") | Fire once per think | Becomes "asks every tick while it holds and sets its nav target" |
| `tests/sim/ai/test-spawn.test.ts:309-340` ("keeps firing on every think, so 360 ticks take the forward shield well below its start", 24 shots) | The 15-tick cadence and `THINK_INTERVAL_TICKS` | Rate is now the gate's; re-derive the expectation by hand |
| `tests/sim/world/step.test.ts:370` ("spaces its thinks by at most 15 ticks") | Think spacing of a test pilot | A holding firing pilot thinks every tick; a non-firing one is unchanged |
| `tests/sim/world/kill.test.ts:669, 910` and `tests/sim/combat/kill.property.test.ts:569-579, 1279-1314` | A pilot kills at its think cadence; queue truncation by `drainAiEventsNow` | Kill times move; the queue-truncation properties stay |
| `tests/e2e/combat.spec.ts:51` (`SHOOTING_TICKS = 360`, "24 thinks") and the twin pins `TWIN_KILL_OFFSET = 794`, `TWIN_ENTITIES_AT_KILL = 19`, `TWIN_HASH_60_AFTER_KILL = "34393ce1"` | The shooter fight timeline | The browser pins follow the Node twin: re-measure the twin first, then pin both, as in earlier phases |
| `tests/app/session/tick-parity.test.ts:530-535, 622, 667-700, 729, 778-805` (`killTick - spawnTick` 794, `HASH_60_AFTER_KILL`) | The Node twin of the same fight | Same |
| `tests/app/session/{probe-publisher,world-lifecycle,sim-driver}.test.ts`, `tests/helpers/tick-script.ts` | The hook spawn and replay steps | Verify; the new variant adds its own |
| `tests/sim/world/{world-cadence,debris-cadence,debris-cap,debris,snapshot}.test.ts` | Use the PLAYER's fire intent, not the pilot's | Verify only |
| `tests/sim/npc/{attack.oracle,attack-dispatch}.test.ts` ("no-fire guard", T-14-24) | Steering never fires and never spends energy | Stays true without the opt-in; reword to "without the opt-in" and add the opted-in cases beside them |
| `tests/sim/npc/constants.test.ts` | The `NPC_WEAPON_TEMP` 0 ledger | Amended with the constant's removal |
| `.planning/PROJECT.md` Key Decisions row "NPC fire shares only the hit and damage rule with the player's laser" (A7) and the Phase 14 rows "no weapon fire from steering" and "Phase 14 recorded divergences" items 21 and 22 | The ungated shot, weapon temperature 0, `missedShots` 0 | Amended in the same commit as the behaviour change |

## Common Pitfalls

### Pitfall A: the sniper early return
**What goes wrong:** with fire live, a sniper inside 15,000 m would never fire. **Why:** Phase 14 ported only the movement and turned the cut tail into a `return`. **How to avoid:** restructure to if/else and fall through to the fire request (Q2). **Warning signs:** an attacker that closes inside 15 km and goes silent; a missing oracle fixture for that branch.

### Pitfall B: the shooter has no target in `nav`
**What goes wrong:** the hook shooter never fires, and the browser spec times out on a shield that never drops. **Why:** `nav.targetId` is 0 at spawn and `hold` never sets it (Q4). **How to avoid:** set it in `hold`, once; a Vitest scenario "spawned shooter fires within N ticks" fails first. **Warning signs:** the gate refusing every tick with a draw consumed.

### Pitfall C: cooling or heat in the wrong place
**What goes wrong:** the cutout or the hot branch moves by one tick, or a hot branch reads the post-shot temperature. **Why:** Oolite's order is behaviour (reads), gate (heat), energy regen, cooling. **How to avoid:** cool after the gate in the combat step, never in `steerEntity`; behaviours read the temperature as it stands at steering time.

### Pitfall D: a draw added or removed
**What goes wrong:** every later draw of that shooter's `combat` stream shifts, so hashes and trajectories diverge from the oracle. **Why:** one draw per gate call that passes the three cheap checks, armed or not, target or not (Q1); none for a heat, energy or timer refusal. **How to avoid:** a fixture for each case; do not add target guards before the gate.

### Pitfall E: `missedShots` unbounded or live without its two consumers
**What goes wrong:** the counter climbs but tolerance and `min_d` ignore it (a fidelity hole), or tolerance divides toward zero. **How to avoid:** wire both consumers and the saturating update together; bound with `MAX_UINT32`; fixtures with non-zero values.

### Pitfall F: tick-count assertions copied from the old 15-tick cadence
**What goes wrong:** red tests are "fixed" by editing numbers. **How to avoid:** the D-08 inventory above, amended once.

### Pitfall G: pilot thinks every tick but the think also re-targets
**What goes wrong:** `setTarget` each tick restarts the tracking curve, the aim point collapses to the target position and hashes churn. **How to avoid:** set the target only when `view.ship(self)?.targetId` differs.

### Pitfall H: beam spam hits a render or readout limit
**What goes wrong:** a beam shooter makes about 10 `laserFired` events a second; the shot layer and event router were sized for the player's one shot every 0.1 to 0.5 s. **How to avoid:** the browser spec already runs under the draw-call budget; if the scene's shot layer drops pooled shots, that is a render finding to report, not a sim defect [ASSUMED: not verified against `src/render` this session].

## Code Examples

### Cooling and heat in float32 (D-07, settled)
```typescript
// Source: Oolite ShipEntity.m:2215 and 9972; float32 widths per ShipEntity.h:303-304 (GLfloat)
const COOL_PER_TICK = Math.fround(WEAPON_COOLING_FACTOR * dt);            // (float)(6.0f * delta_t)
export function coolWeapon(temperature: number): number {
  return Math.max(Math.fround(temperature - COOL_PER_TICK), 0);
}
export function heatWeapon(temperature: number, shotTemperature: number): number {
  return Math.fround(temperature + Math.fround(shotTemperature));
}
// Skip the write when temperature === 0 so a pristine entity stays pristine.
```

### The world step builds the optional context field
```typescript
// Source: src/sim/world/step.ts steerEntity (read this session); the optional spread is required by exactOptionalPropertyTypes
const optedIn = entity.ai?.params.fire === true;
steerShip(entity, {
  view, stats: statsFor(npc?.flight, entity.specKey), dt,
  draw: () => rngNext(stream),
  emit: (event) => { /* unchanged */ },
  ...(optedIn ? { fire: () => requestFire(world, entity.id) } : {}),
});
```

### `onTarget` as a pure function (sketch)
```typescript
// Source: Oolite ShipEntity.m:9851-9909. `urp` is the unit vector to the aim point, zero maps to local forward.
export function onTarget(dq: number, aimTolerance: number, targetRadius: number, d2: number): boolean {
  if (dq < 0) return false;
  if (dq > aimTolerance * aimTolerance) return true;
  const astq = Math.sqrt(1 - (targetRadius * targetRadius) / (d2 * 9)); // NaN when r*r > 9*d2
  return Math.abs(dq) >= astq;                                          // NaN compares false
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Ungated NPC shot, rate set by a 15-tick think (A7, Phase 13) | Gated: heat, energy, timer, roll, `onTarget`, rate set by the gate | Phase 17 | A7 row amended; D-08 inventory |
| `NPC_WEAPON_TEMP = 0`, `missedShots = 0` pinned in steering | Live entity state in `entity.weapon` (v4, Phase 15) | Phase 17 | Hot branches and aim feedback go live |
| Pilot fires on each think | Pilot asks each tick | Phase 17 (D-09) | Think cadence no longer limits fire |

**Deprecated or superseded:** PITFALLS 2's "strict `>` like the player's gate" for NPCs (superseded by D-07, Oolite's NPC `<` refusal is `>=` to allow); Phase 14's "no weapon fire from steering" row (amended here).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Real Oolite at exactly 1/120 s per update needs 13 updates between beam shots (float32 `0.1f`), not 12; derived from arithmetic, not a measured run | Q1 | If wrong the decision row overstates the divergence; low impact (D-07 is locked and records the choice) |
| A2 | Fire counts to READY and to the cutout (beam 25 shots / 289 ticks / 84 shots / 997 ticks; pulse 16 shots / 901 ticks / 54 shots / 3181 ticks) | Q1, Q2 | Used only to size fixtures and scenario horizons; recompute with the oracle |
| A3 | Beam shot rate causes no render shot-layer problem | Pitfall H | A render finding appears late in the browser spec; mitigation is a report, not a sim change |
| A4 | Float32 `temperature` has no snapshot, sanitiser or hash side effect beyond the existing bound `MAX_WEAPON_TEMPERATURE = 1e3` (`limits.ts:133`) | Q1 | Low: a float32 value is a valid double; confirm by the existing snapshot round-trip property |
| A5 | Unarmed ships draw once per gate call (NONE equipment object, `equipment.plist:107-121`, `fireMainWeapon:` 10009-10020) | Q1 | If wrong only an unarmed opted-in ship's draw count changes; no compiled world has one |
| A6 | The planner may choose any attacker hook member name | Q4 | None |

## Open Questions

1. **0.1 s period: 12 or 13 ticks?**
   - What we know: D-07 locks `round(rate * 120)` (12); a literal 120 Hz Oolite gives 13 because of the float rate.
   - What's unclear: whether the owner wants the decision row to record only the divergence, or to measure Oolite.
   - Recommendation: keep D-07, record the difference in the decision row and the fixture `derivation`; optionally measure with the reference container (Q5).
2. **Gate site: drain (recommended) or steering?**
   - What we know: both preserve draw order; the drain extends the recorded A6 divergence and keeps one gate site and `fireQueue: EntityId[]`; the steering site needs rays in a new queue and cannot serve `ctl.fire`.
   - Recommendation: the drain; record "onTarget and the range read the pose one update later than Oolite" in the decision row.
3. **Accuracy-9 dodge of fly-to stays unported (divergence 21).**
   - D-06 asks for the hot branches; the dodge is its `else if` twin and needs the target's weapon types, which `BodyView` does not carry. Recommendation: leave it, restate divergence 21, no new decision needed.
4. **Add `test:acceptance` to `verify-full`?**
   - AGENTS.md: "Revisit adding the run to `verify-full` when a later phase changes NPC behaviour." This phase changes NPC behaviour when opted in. CONTEXT D-17 keeps the by-hand run. Recommendation: surface to the owner at plan sign-off, do not change the gate unprompted.
5. **Fourth guard (decision source) beyond the three tripwires.**
   - Recommendation: add it (Q4); it is the mechanical proof of criterion 3's "no new firing decision source in the production bundle".

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Docker (local) | `test`, `lint`, `typecheck` | yes | 29.8.2 | none needed |
| Docker (remote test machine, `opencode@192.168.178.51`) | `verify`, `e2e`, `test:acceptance`, reference container | yes (reachable this session, SSH key, 16 CPUs) | 29.9.3 | none; owner policy forbids running these locally |
| Oolite source checkout `/home/opencode/git/oolite` | citations, oracle author | yes | pinned commit `7437f22` per FIDELITY.md | none |
| Headless real Oolite (`tools/oolite-reference/run-remote.sh`) | optional measurement of the shot period | yes (needs the remote machine) | 1.93.1-255 | source arithmetic |
| Host Node | scratch arithmetic only (not evidence) | yes, v26.10.0 | | |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** none.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.5 (unit, scenario, oracle consumers, guards, fast-check properties); Playwright 1.64.1 for the one browser spec |
| Config file | `vitest.config.ts` (coverage thresholds on `src/sim/**` lines 93, statements 91, functions 97, branches 86), `vitest.acceptance.config.ts`, `playwright` configs |
| Quick run command | `docker compose run --rm test npx vitest run <file>` (e.g. `tests/sim/npc`, `tests/sim/combat`, `tests/oracles`, `tests/guards`) |
| Full suite command | `docker compose run --rm test` (with coverage), then `lint`, `typecheck`; `verify` on the remote machine for the hook plan |
| Acceptance (standing gate) | `npm run test:acceptance` through `docker compose run --rm test npm run test:acceptance`, by hand on the remote machine |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CBT-15 | Gate refusals in Oolite order, one draw rule, rate of fire, cutout and cooling recover | oracle + unit + property | `... vitest run tests/sim/npc/fire.oracle.test.ts tests/sim/npc/fire.test.ts` | no, Wave 0 |
| CBT-15 | Oolite fire sites and hot branches request fire / change behaviour | oracle (behaviour fixtures) + unit | `... vitest run tests/sim/npc/attack.oracle.test.ts` (extended) and new unit files | partly, extend |
| CBT-15 | `missedShots` feeds aim tolerance and `min_d` | oracle + unit | `... vitest run tests/sim/npc/target.test.ts tests/sim/npc/track.test.ts` | exist, extend |
| CBT-15 | Rate identical at 30, 60, 144 Hz; replays after a snapshot | scenario | `... vitest run tests/sim/npc/fire-cadence.test.ts` (copy of `npc-cadence.test.ts` runner) | no, Wave 0 |
| CBT-15 | Ordinary play never fires (populated ships `ai: null`; decision-source guard) | guard + scenario | `... vitest run tests/guards/fire-decision-source.test.ts tests/sim/world/populate.test.ts` | guard no, populate yes |
| CBT-15 | Hook shooter and attacker spawn, taint, refusals | unit | `... vitest run tests/sim/ai/test-spawn.test.ts tests/app/session/probe-publisher.test.ts tests/app/probe-shape-compare.test.ts` | exist, extend |
| CBT-16 | NPC hit on the player: facing shield, then energy, floor 0, cabin heat | scenario | `... vitest run tests/sim/combat/npc-fire.test.ts` (re-aimed per the D-08 inventory) | exists, amend |
| CBT-16 | NPC-vs-NPC hit and kill through the kill path; mutual kill credit pinned (D-10) | scenario | `... vitest run tests/sim/combat/npc-fire.test.ts tests/sim/combat/kill.property.test.ts` | exist, add |
| CBT-15/16 | Whole route: hook shooter to the shield and energy on the HUD (bounded manual-clock ticks) | browser, one spec | `docker compose run --rm e2e sh -lc "npm run build:e2e && npx playwright test tests/e2e/combat.spec.ts"` on the remote machine | exists, amend |
| QUAL-11 | Frozen worlds byte-identical; hash equal across rates | golden + cadence + acceptance | `... vitest run tests/sim/world/flight-hash-pins.test.ts tests/sim/npc/npc-cadence.test.ts tests/sim/world/world-cadence.test.ts`; `npm run test:acceptance` (remote, by hand) | exist |
| D-13 | Three tripwires fail on the first consumer; each names its todo | guard | `... vitest run tests/guards` | no, Wave 0 |
| Pitfall 16 | New functions total on malformed input | fast-check property | `... vitest run tests/sim/npc/steering.property.test.ts tests/sim/combat/kill.property.test.ts` (extended) | exist, extend |
| Criterion 4 | New fixtures authored first, independent, listed in the manifest | oracle + guards | `... vitest run tests/guards/oracle-independence.test.ts tests/sim/npc/oracle-coverage.test.ts tests/oracles` | exist, extend |

### Sampling Rate
- **Per task commit:** the targeted `vitest run <file>` for the touched module, then `lint` and `typecheck` for `src/sim/` tasks.
- **Per wave merge:** `docker compose run --rm test` (full Vitest with coverage); on every plan touching `src/sim/npc/**` or `src/sim/world/**`, also the by-hand `npm run test:acceptance`, 21 of 21 and unchanged numbers, recorded in the SUMMARY.
- **Phase gate:** full `test`, `lint`, `typecheck`; `verify` on the remote machine for the hook and browser-spec plan (D-18); `verify-full` only if the owner confirms (render, input, persistence code is not touched here).

### Wave 0 Gaps
- [ ] `tests/oracles/npc/fire/` fixture family, its schema, derivation module and self-test, written by an agent with no access to `src/sim/npc` or the gate module
- [ ] `tests/sim/npc/fire.oracle.test.ts` consumer and rows in `oracle-groups.ts` / `oracle-coverage.test.ts`; `oracle-runner.ts` support for `self.forwardWeaponTemp`, `self.missedShots`, shot timer and energy, and a `ctx.fire` recorder
- [ ] `tests/sim/npc/fire.test.ts` (hand-derived gate unit tests, written before any fixture is opened) and `fire-cadence.test.ts`
- [ ] `tests/guards/` three tripwires (+ the decision-source guard) and the two new todo files
- [ ] An NPC-vs-NPC scenario file and a spawned-shooter-fires scenario (D-03, Pitfall B)

## Security Domain

`security_enforcement` is enabled (absent from config means enabled; `security_asvs_level` 1). The phase has no network, auth, storage or crypto surface; the relevant controls are input validation and keeping test seams out of play.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | none (static client, no accounts) |
| V3 Session Management | no | none |
| V4 Access Control | partly | The hook is reachable only under `?test=1`, taints the session before mutating, and the populator never calls the spawners; the new guard makes the "no decision source" rule mechanical |
| V5 Input Validation | yes | The hook member takes `unknown` from the page: validate and refuse (no spawn) after tainting, as `spawnTestShooter(cargo)` does; `ShipControl` and `spawnEntity` already bound every AI write to `limits.ts`; the new gate and `onTarget` are total on non-finite input |
| V6 Cryptography | no | none |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| A forged AI param (`fire: true`) on a snapshot or save | Tampering | Params are validated by the shared `ParamValue` domain in `spawnEntity`, `sanitizeEntity` and the snapshot parser; populated ships hold no AI; saves hold the profile, and a hook-tainted session never persists |
| Fire-queue or draw flood | Denial of service | `world.fireQueue` is bounded by `MAX_ENTITIES` and de-duplicated per actor; one draw per gate call; no loop depends on input size |
| Non-finite number reaching the hash | Tampering | Total gate; temperature bounded by `MAX_WEAPON_TEMPERATURE`; the pre-commit `sanitizeEntity` pass |
| Test seam shipped as a feature | Elevation of privilege | `?test=1` gating, taint, and the decision-source guard |

## Sources

### Primary (HIGH confidence)
- Oolite source `/home/opencode/git/oolite/src/Core/Entities/ShipEntity.m` lines 208, 477, 2214-2221, 2415, 3886-3995, 3996-4036, 4038-4130, 4397-4460, 4461-4581, 4611-4732, 4840-4902, 5412-5423, 6461-6475, 9761-9810, 9851-9909, 9912-10043, 10360-10477, 13041-13044; `ShipEntity.h` 102, 115-120, 298-304, 345; `Entity.m:85`; `CollisionRegion.m:557-609`; `OOEquipmentType.m:657-677`; `OOConstToString.m:268-281`; `PlayerEntity.m:5625-5700`; `Resources/Config/equipment.plist:107-121`
- Repository, read this session: `src/sim/npc/{dispatch,target,track,tracking-curve,constants,state,enter,stats}.ts`, `src/sim/npc/behaviours/*.ts`, `src/sim/combat/{step,ledger,weapons,shields,aim,hit,constants}.ts`, `src/sim/world/{step,control-impl,control,entity,serialize,sanitize,limits,world,view}.ts`, `src/sim/ai/{types,registry,test-spawn}.ts`, `src/sim/ai/pilots/{test-pilot,flight-script}.ts`, `src/app/probe.ts`, `src/app/session/probe-publisher.ts`, `src/content/generated/ships-npc.json`, `package.json`, `tests/oracles/npc/schema.ts`, `tests/guards/oracle-independence.test.ts`, `tests/sim/npc/{oracle-groups,oracle-runner,npc-cadence,attack.oracle,attack-dispatch}.test.ts`, `tests/sim/combat/npc-fire.test.ts`, `tests/e2e/combat.spec.ts`, `tests/acceptance/detectors.ts`
- Planning: `17-CONTEXT.md`, `ROADMAP.md` Phase 17, `REQUIREMENTS.md`, `PROJECT.md` Key Decisions (A7, recharge gate, Phase 14 rows, v4 row), `.planning/research/PITFALLS.md` 1, 2, 3, 4, 15, 16, `14-FIDELITY-REPORT.md`, `tools/oolite-reference/README.md`, the two named todos

### Secondary (MEDIUM confidence)
- Scratch arithmetic in a Python interpreter on the host (float32 rounding, 1/120 accumulation, shot counts to the cutout); not run through the oracle or the container, so tagged [ASSUMED] where used

### Tertiary (LOW confidence)
- None. No web search or Context7 lookup was needed: every finding comes from the local source trees, so the research-plan/research-store seam was not used (nothing to cache). No package is added, so the package-legitimacy gate did not apply.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH, no new package; versions read from `package.json`
- Architecture (gate order, call sites, drain-site wiring, opt-in): HIGH, each cited at file and line and cross-checked against the Wegolite cut sites
- Numeric representation (12 vs 13 ticks, float32 temperature): MEDIUM, arithmetic only, to be settled by the oracle or the reference container
- Pitfalls: HIGH for A, B, C, D (read in code); MEDIUM for H (not verified in `src/render`)

**Research date:** 2026-11-18
**Valid until:** 2026-12-18 (stable: the Oolite checkout is pinned and the repository is changed only by this milestone's phases; re-read `src/sim/world/step.ts` and `src/sim/combat/step.ts` if Phase 16 follow-ups or quick tasks touch them before planning)
