# Phase 17: NPC Fire and Hits on the Player - Context

**Gathered:** 2026-11-18
**Status:** Ready for planning

<domain>
## Phase Boundary

NPC ships fire lasers at the player and at each other through Oolite's NPC fire gate (weapon temperature, energy, shot timer, range roll, `onTarget`). They fire only when the engine (Phase 14's attack behaviours, for a pilot that opted in) or a test pilot asks. NPC hits on the player go through the facing shield and then the energy bank by the shared hit rule. An NPC shot to zero energy by another NPC dies through Phase 15's kill path. In ordinary play NPCs never fire: populated ships keep `ai: null`, and there is no reflex AI, retaliation or wake-on-hit (owner decision 2026-11-16). The player's energy still floors at zero; death is Phase 20. Requirements: CBT-15, CBT-16.

</domain>

<decisions>
## Implementation Decisions

### The `?test=1` fight
- **D-01:** The hook keeps the **stationary shooter** (`spawnTestShooter`, `src/sim/ai/test-spawn.ts`), which now fires through the gate. The one opt-in browser spec that criterion 3 requires (hook shooter to the shield and energy readout on the HUD) uses it.
- **D-02:** The hook adds a second variant that spawns an **attacking NPC** flying Phase 14's attack behaviours against the player with fire opted in. It is for manual checks and UAT only and has no browser spec of its own. Tainting works as it does for every hook mutation, so the ship can never become durable.
- **D-03:** **NPC-vs-NPC** fire, and a kill of one NPC by another through the kill path, are proved in **Vitest scenarios only**: two pilots, with no hook variant and no browser spec. This keeps the 90 % Vitest rule and the single browser spec.
- **D-04:** The **range roll stays as in Oolite**: `range > randf() * weaponRange * (accuracy + 7.5)` refuses the shot, drawn from the shooter's own combat stream. The browser spec does not expect a hit on the first tick. It steps a bounded number of manual-clock ticks and waits for the shield to drop. The planner may shorten `TEST_SHOOTER_DISTANCE` so hits come sooner, but the gate gets no test-only bypass and accuracy is not pinned.

### How fire is switched on
- **D-05:** The opt-in to fire lives in the **AI module's params** (the flight-script pilot and the test pilot). Behaviours read it through `SteerContext` (for example `SteerContext.fire` or an equivalent; the name is Claude's discretion). A ship with `ai: null` has no params and therefore can never fire, which gives the production guarantee by construction. **No new hashed entity field** is added and the v4 field set stays frozen. A param key is put on the record only when it is set, as `test-pilot`'s `fire` is today, so existing flight-script worlds serialise and hash byte-identically.
- **D-06:** Port **every Oolite fire site and every hot-weapon branch** inside Phase 14's attack IN list: the `fireMainWeapon:` calls in `behaviour_evasive_action` (`ShipEntity.m:4035`), `behaviour_attack_sniper` (4454), `behaviour_fly_to_target_six` (4575; the twelve shares it), `behaviour_attack_fly_to_target` (4711) and `behaviour_flee_target` (4891) where reachable, plus the `weapon_temp > COMBAT_AI_WEAPON_TEMP_USABLE` branches (4456, 4577, 4713) and the ATTACK_TARGET dispatcher's weapon-temperature branch. Branches that are unreachable because aft, port and starboard weapons are none on every compiled record stay unreachable and are recorded as such. A world with no firing pilot keeps temperature 0, so its trajectories and hashes do not change. New source-cited oracle fixtures cover the gate and the hot branches, written first by a separate agent with no access to `src/sim/npc` (roadmap criterion 4).
- **D-07:** **Tick quantisation:** the shot timer uses `rechargeTicks = round(weapon_recharge_rate * 120)` against `tick - lastShotTick`, with Oolite's **NPC comparison** (`shotTime < weapon_recharge_rate` refuses, so `>=` allows; `ShipEntity.m:9946`). This deliberately differs from the player's strict `>` (`PlayerEntityControls.m:1185`), and both are correct to their sources. The decision row records the difference. `lastShotTick` 0 means ready (D-07 of Phase 15). Cooling runs every stepped tick as `max(temp - WEAPON_COOLING_FACTOR * dt, 0)` (`ShipEntity.m:2214-2218`, factor 6, `NPC_MAX_WEAPON_TEMP` 256, cutout 0.85; `ShipEntity.h:115-120`). A shot that fires costs `weapon_energy_use` from the shooter's energy and adds `weapon_shot_temperature` (`ShipEntity.m:9967-9975`). The float32 width of Oolite's temperature is the researcher's to settle against the oracle. D-07 revised by the owner 2026-11-19, UAT test 1: the shot timer uses Oolite's literal frame counts at 120 Hz (pulse 60, beam 13, mining 301, military 13; `literalShotFrames`, plan 17-01) instead of rounding the rate x 120 (the superseded 60, 12, 300 and 12); the NPC `>=`, the cooling, the cost and the heat are unchanged. Gap G-17-1 is closed by plans 17-11 (oracle) and 17-12 (port).

### The A7 test pilot
- **D-08:** **Every NPC shot goes through the gate.** No `ShipControl.fire` path bypasses it. The ungated A7 shot (any rate, no heat, no timer, no energy cost) is removed, the A7 Key Decisions row is amended in the same commit as the change, and every Phase 13 test or fixture that pins the 15-tick think cadence of shots is listed once with its reason and amended in the plan that changes the behaviour, not fixed piecemeal from red runs (the same rule as Phase 15 D-11).
- **D-09:** **The test pilot asks to fire every tick**, as Oolite's behaviours call `fireMainWeapon:` every frame, and only the gate sets the rate of fire. The 15-tick think cadence no longer sets it. How the per-tick request is made (a per-tick control step of the pilot, or a standing intent the world step reads) is the planner's choice, but the rate must be the gate's and the same at 30, 60 and 144 Hz.

### Carry-overs from Phases 15 and 16 (deferred, with tripwires)
- **D-10:** **Same-tick mutual kill:** credit stays **asymmetric by ascending shooter id**, as the ledger resolves today. The phase's decision row restates this as a divergence from Oolite, where the order comes from the entity update, and a Vitest scenario pins it.
- **D-11:** **No player hit feedback** in this phase (no flash, shake or sound). The player sees the hit only as the shields and energy falling on the HUD. `shipHit` still has no consumer, and the todo `2026-11-17-skip-shiphit-for-a-doomed-target.md` stays pending.
- **D-12:** **`shipTargetLost` stays as Phase 15 posts it** (to every ship that had the victim as its target). Phase 17 adds no new `onEvent` handler: fire reads the target from `nav`, and a dead or missing target is refused by the gate and the behaviour. If the planner finds it needs a second `onEvent`, it stops and asks the owner first, because narrowing the event needs an owner edit to Phase 15 criterion 1.
- **D-13:** **Tripwires, so the three deferrals are not forgotten** (owner request): the phase adds one guard test under `tests/guards/` for each deferral, and each guard's failure message names its todo.
  1. Nothing outside the kill path reads the kill credit (`shipDestroyed.killer`, `shipTargetDestroyed`, `shipKilledOther`). It fails when the first consumer (a bounty, rating or legal status) appears. Todo: revisit mutual-kill credit symmetry.
  2. `shipHit` has no consumer. It fails when the first subscriber (audio, hit flash, HUD indicator) appears. Todo: the existing `2026-11-17-skip-shiphit-for-a-doomed-target.md`.
  3. At most one module in `AI_REGISTRY` defines `onEvent`. It fails when a second one gains a handler. Todo: decide whether to narrow the kill-time `shipTargetLost` to the killer (needs the owner's edit to Phase 15 criterion 1).

  Two new pending todos are created (1 and 3). Todo 2 already exists and gets a pointer to its guard.

### Fixed by the roadmap and earlier decisions (not re-asked)
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

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Scope and requirements
- `.planning/ROADMAP.md`: Phase 17 section (goal, carry-overs, criteria 1 to 4, implied work, research flag, pitfalls)
- `.planning/REQUIREMENTS.md`: CBT-15, CBT-16, QUAL-11
- `.planning/PROJECT.md`, Key Decisions: A7 ("NPC fire shares only the hit and damage rule", amended here), the integer-tick laser recharge row (player's strict `>`), the Phase 14 steering scope and conventions rows ("no weapon fire from steering", amended here), the Phase 14 divergences row, the v4 snapshot row, and the ledger and kill path rows
- `.planning/phases/15-damage-ledger-and-kills/15-CONTEXT.md`: D-04, D-07, D-12, D-15 and D-16 (weapon field, kill events, totality)
- `.planning/phases/16-wreckage-cargo-and-the-entity-cap/16-VERIFICATION.md`: the D16-14 / OC-5 `shipHit` carry-over
- `.planning/research/PITFALLS.md`: pitfalls 1, 2, 4, 15 and 16
- `.planning/research/ARCHITECTURE.md` §7.6: SimEvent payloads (`laserFired`, `shipHit`)
- `.planning/milestones/v2.2-phases/14-npc-flight-and-steering-fidelity-gate/14-FIDELITY-REPORT.md`: oracle method and recorded divergences

### Oolite source (read from `/home/opencode/git/oolite`, never fetched)
- `src/Core/Entities/ShipEntity.m` 9851 onwards (`onTarget:withWeapon:`), 9900 to 10010 (`fireWeapon` gate), 10009 to 10050 (`fireMainWeapon:`), 10360 to 10440 (`fireLaserShotInDirection`), 2214 to 2218 (cooling)
- `src/Core/Entities/ShipEntity.m` behaviours: 3996 to 4037 (evasive), 4038 onwards (attack_target dispatcher), 4397 to 4460 (sniper), 4461 to 4581 (six/twelve), 4611 to 4732 (fly_to_target), 4840 to 4902 (flee)
- `src/Core/Entities/ShipEntity.h` 115 to 120 (cooling factor, max temperature, cutout, USABLE and READY)
- `src/Core/Entities/PlayerEntityControls.m:1185` (the player's strict gate, for the contrast in D-07)

### Pending todos
- `.planning/todos/pending/2026-11-17-skip-shiphit-for-a-doomed-target.md`: stays pending (D-11) and gets its guard (D-13.2)
- `.planning/todos/pending/2026-11-16-phase-14-review-followups.md`: the IN-04 manual rerun rule applies; IN-05 is not part of this phase

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/sim/ai/test-spawn.ts` `spawnTestShooter`: the hook shooter; the attacking variant can sit beside it.
- `src/sim/ai/pilots/test-pilot.ts`: has `params.fire` today (fires on each think). D-08 and D-09 move it onto the gate and a per-tick request.
- `src/sim/ai/pilots/flight-script.ts`: already drives ATTACK_* behaviours (lines ~151 to 160) and is the natural home for the opt-in param.
- `src/sim/world/control-impl.ts` `fire()` → `world.fireQueue`. `src/sim/combat/step.ts` `drainFireQueue` builds NPC `ShotRequest`s with no gate today (its comment cites A7); the gate, energy cost and heat belong on this path.
- `src/sim/world/entity.ts` weapon record (`temperature`, `lastShotTick`, `missedShots`); `src/sim/world/serialize.ts:160-166` hashes it pristine-omit; `src/sim/world/sanitize.ts:600-620` bounds it.
- `src/sim/npc/dispatch.ts` `SteerContext { view, stats, dt, draw, emit }`, the place for the fire opt-in and request.
- `src/sim/combat/ledger.ts`: ascending shooter-id resolution and player shield routing by shooter position.

### Established Patterns
- Draw rule: a steered ship draws only from its own combat stream through `ctx.draw`, and the range roll uses it.
- Optional params are put on the record only when set (`...(x === true ? { x: true } : {})`), so old worlds hash the same.
- Oracle independence: `tests/oracles/npc/` plus `tests/guards/oracle-independence.test.ts`; the static manifest `tests/sim/npc/oracle-groups.ts` and `oracle-coverage.test.ts` must list the new fixtures.
- The existing guard tests in `tests/guards/` are the pattern for the three D-13 tripwires.

### Integration Points
- `src/sim/npc/behaviours/{evasive,attack,attack-close,attack-evade,flee}.ts`: each has a comment marking the cut `fireMainWeapon:` site.
- `src/sim/npc/target.ts:122` and `src/sim/npc/track.ts:285,399`: `missedShots` pinned at 0, which now goes live.
- The `?test=1` hook in `src/app/` (shooter spawn route) and the probe shape and closed sets if the new hook variant adds a method.

</code_context>

<specifics>
## Specific Ideas

- Owner: "there is no benefit now, but we won't forget to redo this later?" (translated). A deferral needs a failing guard test and not only a todo (D-13).
- The attacking-NPC hook variant exists so the owner can watch a real dogfight in UAT.

</specifics>

<deferred>
## Deferred Ideas

- Symmetric credit for a mutual kill: when kill credit gets a consumer (D-10, tripwire D-13.1).
- Player hit feedback (sound, flash) and the doomed-target `shipHit` skip: when `shipHit` gets a consumer (D-11, tripwire D-13.2).
- Narrowing the kill-time `shipTargetLost` to the killer: before a second `onEvent` (D-12, tripwire D-13.3).
- Escort release (`escortCheckMother`): in the phase that first spawns escorts (roadmap carry-over, not this phase).

### Reviewed Todos (not folded)
- `2026-11-16-phase-14-review-followups.md` IN-05 (detector blind spot): needs the owner's trailer and is not part of this phase.

</deferred>

---

*Phase: 17-npc-fire-and-hits-on-the-player*
