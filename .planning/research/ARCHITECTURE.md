# Architecture Research: v2.4 Pirates and Police

**Domain:** a traffic populator, a hand-ported priority AI, legal status, bounties, scooping and combat rating, added to an existing deterministic fixed-step simulation (Wegolite, a browser reimplementation of Oolite)
**Researched:** 2026-11-25 (supersedes the v2.3 architecture file; only the v2.4 integration is covered)
**Confidence:** HIGH for the integration points (read in the repository at `main` / `df4d01b0` and in the Oolite checkout `/home/opencode/git/oolite`); MEDIUM for Oolite fidelity details marked "research flag" (they need phase-level research, not a different architecture).

Scope: only how the five target features plug into what exists. Out of scope: missiles and ECM, escape pod and insurance, scavengers and shuttles, fuel scooping at the sun, contraband penalties, the main station's own AI (see Q1).

---

## 1. Decisions in one table

| # | Question | Recommendation | Confidence |
|---|----------|----------------|------------|
| 1 | What is "the priority AI" as data? | **Tree = code, state = params.** The priority lists of the in-scope role AIs are static, frozen TypeScript tables (closed string ids for conditions, configurations, behaviours, templates, handler sets), expanded once at module load. Per-ship state is only `AiComponent` (`aiKey: "priority"`, flat `params`, `wakeTick`). Nothing closes over per-ship state; the Oolite caches are recomputed, not stored. Hashing, snapshotting and sanitising need no new codec. | HIGH |
| 2 | Where does ongoing traffic live? | In **`stepWorld`** (sim), as a new last phase "populator" before the sanitise pass, driven by a hashed world-level `populator` record (next-roll tick, counter) and a stateless forked RNG per roll. Not in the app: the Node replay and the live session must produce one hash. Initial populate stays at world creation (`begin`/`resume`) and shares the plan module with the repopulator. | HIGH |
| 3 | Who owns the player's legal status (bounty) and kill tally? | **Sim-owned `PlayerStanding { bounty, kills }`, held inside `PlayerCombatState`** (rides the existing plumbing: `ctx.core.combat`, `resolveShots`, `hashWorld(combat)`), hashed pristine-omit. NPC AI reads it and the police AI writes it within the tick, so it cannot be a profile mirror fed by events (one-tick lag and a replay that does not route events would split the hash). The profile gets credits only; save v6 gets `legalStatus` and `shipKills`. | HIGH |
| 4 | How do NPCs leave the world? | New **`retireShip`** (`src/sim/world/retire.ts`): marks dead with no `shipDestroyed`, no debris, no kill credit, then the normal commit emits `entityRemoved`. `killShip` stays the only destruction path. Docking, landing, witchspace exit and out-of-range drift all use it. | HIGH |
| 5 | Groups and escorts | `Entity.ownerId` + `steer.escortSlot` already model mother/escort. Add **`Entity.groupId`** (uint, 0 none) and **`World.groups: { id, leader }[]`** (sorted). Membership is derived by scanning entities, never stored as a list. Leader reappointment is lazy, by the AI's `AppointGroupLeader` configuration, as in Oolite. | MEDIUM-HIGH |
| 6 | Comms between ships | Three channels, all plain data: (a) player-visible text = the existing `commsMessage` SimEvent, throttled by two tick timestamps in `params`; (b) ship-to-ship = `AiEvent` through `postAiEvent` (payload `a`, `b`, `n`); (c) Oolite's `oolite_intership` cargo-demand dictionary = **typed events** plus typed own-`params` (a ship never writes another ship's params; `ShipControl` stays actor-only). | HIGH |
| 7 | Scooping | A pod needs identity: today **every pod is anonymous** (`debris.ts` D16-24/OC-1 skips Oolite's commodity and amount draws). Add `Entity.podCommodity`/`podAmount` (snapshot v5), a **tractor stage** in the world step (new `world/scoop.ts`), a scoop branch in `combat/collide.ts` (PD-05 removed), a `cargoScooped` sim event (already reserved) and an app `scoopFlow` that commits the profile hold. Hold fullness reaches the sim as a per-step fact, like `internalDamage`. | HIGH |
| 8 | Hashed-shape changes | **One** bundled plan, first in the milestone: `WORLD_SNAPSHOT_VERSION` 4 to 5, every new field pristine-omit so every existing golden except the populate/debris ones keeps its bytes. `SAVE_VERSION` 5 to 6 once, in the standing phase. | HIGH |
| 9 | Content is the hidden critical path | Only **9 NPC hulls** are compiled (`adder, cobramk1, gecko, krait, mamba, moray, shuttle, sidewinder, viper`). Oolite's populator asks for freighters, medium/heavy pirate fighters, interceptors, aegis raiders, hunters of three weights, police patrol variants and assassins. The roster, their `aiType`, `bounty`, `escorts`, `accuracy` and the role-category table must be compiled (with models, `ASSETS.md`, `NOTICE`) before the populator is meaningful. | HIGH |
| 10 | Bounty timing | The milestone text says "paid on docking". **Oolite credits the bounty at the kill** (`PlayerEntity.m:6041-6092`, `collectBountyFor:` from `noteTargetDestroyed:`, `ShipEntity.m:8808`; message `bounty-awarded`). Docking-time payment applies only to rescued pods (`PlayerEntityContracts.m:86-130`). By the fidelity rule the default is immediate. Needs an owner decision before the standing phase is planned. | HIGH (fact), owner question |

---

## 2. Recommended architecture

```
                      app (src/app/session)                          sim (src/sim, pure)
  Lave system facts --> traffic.ts: PopulatorContent ----+
  role/category tables  step-options.ts: facts ---------+--> stepSim(player, world, layout, ..., combat{standing})
  hold / scoop facts ---------------------------------------+      |
                                                                   +-> stepFlight (+ docking check reads standing.bounty)
                                                                   +-> stepPlayerCombat
                                                                   +-> stepWorld
                                                                   |     update (native steering)  -> drift/debris/TRACTOR stage
                                                                   |     drain events -> think (priority AI: reconsider) -> drain
                                                                   |     POPULATOR phase (repop rolls, arrivals)         [NEW]
                                                                   |     sanitise -> commit
                                                                   +-> resolveShots (ledger -> kills)
                                                                         + AI attack events + offence broadcast        [NEW]
                                                                         + collectBountyFor / kills                     [NEW]
                                                                         + scoop branch in collide.ts                   [NEW]
  event-router -> standingFlow, scoopFlow, damageFlow, deathFlow <------- SimEvents
  save-controller <-- combat.standing (legalStatus, shipKills) -> save v6
```

Ordering facts the design leans on (all verified in code):

- `stepWorld` already runs update, drift, debris, drain, think, drain, tracking-curve start, proximity pass, sanitise, commit. Entities spawned during a tick land at indices at or above the length snapshot `n`, so they first act on the next tick. The populator phase therefore goes **after the second drain and before sanitise**, and needs no special case.
- The AI queue is empty at every tick boundary; `drainAiEventsNow` runs inside `resolveShots` before the second commit. Any event the new ledger and kill code post is delivered there (bounded: 8 passes, 4096 events).
- `ai.params` is `Record<string, ParamValue>` with scalars and flat arrays of numbers or strings only, at most `MAX_AI_PARAMS_KEYS = 32` keys, arrays at most 64 elements, strings at most 128 code units. No nested objects. This is the binding constraint on the priority AI state (section 4).
- A module that throws becomes `ai = null` (inert) and the world continues. A ported AI inherits this containment for free; a defect in `PRIORITY_TREES` must therefore be caught by tests, not by containment, because a contained fault silently produces a ship that floats.

---

## 3. Components: new versus modified

### 3.1 New modules

| Path | Responsibility | Talks to |
|------|----------------|----------|
| `src/sim/ai/priority/engine.ts` | The `AiModule` for key `"priority"`: `think` = reconsider (walk the tree, apply configuration, apply behaviour, schedule wake); `onEvent` = handler-set lookup. Port of `_reconsiderList` / `_reconsider` / `_resetReconsideration` (`oolite-priorityai.js:46-262`). | `tree.ts`, `behaviours.ts`, `conditions/*`, `responses.ts`, `ctl` |
| `src/sim/ai/priority/tree.ts` | Types `PriorityEntry`, `PriorityTree`; closed unions `ConditionId`, `ConfigurationId`, `BehaviourFnId`, `HandlerSetId`, `TreeKey`; the frozen `PRIORITY_TREES` record; template expansion (`templateReturnToBase`, `templateLeadPirateMission`, `templateWitchspaceJump*`) done once at load. | engine |
| `src/sim/ai/priority/trees/{trader,trader-opportunist,pirate,pirate-fighter,pirate-freighter,pirate-interceptor,police,police-station-patrol,police-witchpoint-patrol,bounty-hunter,bounty-hunter-leader,escort}.ts` | One file per Oolite role AI (`Resources/AIs/oolite-*.js`). Each exports a static config (the `oolite_flag_*` parameters, leader role, comms role, friendly roles) and its priority list. Variants of one script (police by `primaryRole`) are separate tree keys: setup-time branching must not survive into state. | `tree.ts` |
| `src/sim/ai/priority/conditions/*.ts` | The 48 conditions the in-scope roles call directly (plus their utility dependencies: `oddsAssessment`, `threatAssessment`, `allied`, `friendlyStation`, `shipInRoleCategory`). Pure `(pc: PriorityCtx) => boolean`. | `PriorityCtx` only |
| `src/sim/ai/priority/behaviours.ts` | The 18 behaviours and 19 configurations the in-scope roles use. Each makes `ctl` calls (`setTarget`, `setDestination`, `perform`, `scheduleWake`, new members of section 3.3) and writes only own `params`. | `ctl` |
| `src/sim/ai/priority/responses.ts` | Handler sets as data: `HANDLER_SETS: Record<HandlerSetId, Partial<Record<AiEventName, ResponseFnId>>>` for `standard`, `docking`, `escort`, `scooping`, `trackPlayer`, `expectWitchspace`. `responsesAddStandard` etc. become set selection (`params.hs`). | engine |
| `src/sim/ai/priority/context.ts` | `PriorityCtx`: the per-think facade over `AiContext` (own params typed accessors, scanner memo for this think only, `communicate`, `reconsiderNow/In`, ticks conversion). Not stored. | `types.ts` |
| `src/sim/ai/priority/params.ts` | The closed key list and typed getters/setters for the dynamic state (section 4.2). One place, so the 32-key bound is enforced by a unit test. | all of the above |
| `src/sim/ai/facts.ts` | `AiFacts`: static, injected content for AI decisions (role set and category membership per spec key, weapon summary, system government and economy, station facts). Type only; the AI zone may not import content. | `step-options.ts` builds it |
| `src/sim/ai/spawn.ts` | `createPriorityAi(tick, treeKey, init)`: the one constructor of a priority `AiComponent` (sets `tree`, `fire: true` when the hull has a forward weapon, initial wake). Mirrors `createFlightScriptAi`. | populator |
| `src/sim/world/retire.ts` | `retireShip(world, id, reason, events)`: idempotent removal with no debris and no kill credit; posts `shipTargetLost` to holders. | `world.ts`, `kill.ts` style notify |
| `src/sim/world/populator/facts.ts` | `PopulatorFacts`: government, economy, tech level, system id, hub counts, neighbour economics, bottleneck flag. Pure function of the chart (`systemsInRange` equivalent over the galaxy list). | `src/sim/hyperspace` distance code |
| `src/sim/world/populator/plan.ts` | Port of the rate calculation in `oolite-populator.js:228-627` (hourly rates for freighters, couriers, smugglers, pirate packs, hunters, police, assassins) and the initial group plan from the same rates. Pure, draws only from the RNG it is given. | `facts.ts` |
| `src/sim/world/populator/spawn.ts` | Group builders (`_addGroup`, `_addShips`, leaders, escorts via `ownerId` + `escortSlot`, bounty, cargo flag, location codes, AI attach). Replaces the body of `populateInertWorld`. | `placement.ts`, `ai/spawn.ts` |
| `src/sim/world/populator/repopulate.ts` | `stepPopulator(world, tick, ctx, events)`: every 2400 ticks (`SYSTEM_REPOPULATION_INTERVAL` 20 s, `Universe.m:6410-6418`) roll each hourly rate / 180, spawn incoming at the witchpoint or outgoing at the station/aegis; respects a populator-owned live-ship ceiling well below 256. | `plan.ts`, `spawn.ts` |
| `src/sim/world/scoop.ts` | The tractor stage: `startTractor(world, pod, scooperId)`, `stepTractor(world, player, dt)` (port of `behaviour_tractored`, `ShipEntity.m:3729-3800`: spring forces, 250 m escape, `scoopUp` at `2 x radius`), `canScoop` (front-facing, player: underside, hold not full, `has_scoop`). Pods are `kind:"cargo"` with `ai: null`; the TRACTORED state is `nav.behaviour = "TRACTORED"` plus `ownerId` (both already hashed). | `collide.ts`, `step.ts` |
| `src/sim/npc/behaviours/collect.ts` | Native `COLLECT_TARGET` steering (deferred in v2.2, STATE.md 2026-11-14) for pirates and police collecting salvage. | `dispatch.ts` |
| `src/sim/player/standing.ts` | `PlayerStanding`, `markOffender(standing, bits)` (`bounty \|= bits`, `PlayerEntity.m:6024-6034`), `legalStatusName(bounty)` (0 clean, 1-50 offender, 51+ fugitive, `OOConstToString.m:404-420`), `ratingFor(kills)`, `collectBountyFor(world, victim, ...)`, `halveOnArrival`, pristine/serialise/sanitise. | `combat/state.ts`, ledger |
| `src/sim/combat/offence.ts` | Port of `broadcastHitByLaserFrom:` (`ShipEntity.m:12280-12310`): when a hit victim has bounty 0 and an eligible scan class, post `offenceCommittedNearby(attacker, victim)` to every authority in range (police within scanner range of the victim, the main station if the victim is in aegis). | ledger, `postAiEvent` |
| `src/app/session/standing-flow.ts` | Router subscriber: `bountyAwarded` (credits, "bounty-awarded" text), `legalStatusChanged`, `shipDestroyed` with `killer === PLAYER_ID` for the kill message, rating change text. Commits credits through the in-flight profile commit used by `damage-flow`. | `ctx.core.profile`, `messages` |
| `src/app/session/scoop-flow.ts` | Subscriber for `cargoScooped`: adds to `profile.cargo` (units, pod rule of `economy/cargo.ts`), prints Oolite's pod-description line. | `economy/cargo.ts` |
| `tools/ai-harness/roles.ts` (modified from `load.ts`) | Dev-only differential harness generalised from "library + shuttle AI" to "library + any in-scope role AI". Stays out of `dist` (`check:dist`). | `tests/oracles/ai/` |
| `tests/oracles/ai/*`, `tests/oracles/traffic/*`, `tests/acceptance/traffic.acceptance.ts` | Per-condition and per-reconsideration fixtures from the harness; populator composition oracle from `tools/oolite-reference`; a **new** traffic acceptance scenario beside the frozen `npc-flight` one (the frozen thresholds are not edited). | |

### 3.2 Modified modules

| Path | Change | Risk |
|------|--------|------|
| `src/sim/ai/types.ts` | `AI_KEYS` += `"priority"`; `AI_EVENT_NAMES` extended with the events the standard handlers use (`shipAttackerDistracted`, `cargoDumpedNearby`, `escortAccepted`, `shipAcceptedEscort`, `escortDock`, `commsMessageReceived`, `playerWillEnterWitchspace`, `approachingPlanetSurface`, `shipWillEnterWormhole`, `shipScoopedFuel`, `stationWithdrewDockingClearance`, `wormholeSuggested`, `shipWitchspaceBlocked`); `AiContext` += `facts: AiFacts`. | The snapshot parser treats both lists as closed; update `sanitize.ts` and `snapshot.ts` together. |
| `src/sim/ai/registry.ts` | Register `"priority"`. | low |
| `src/sim/world/view.ts`, `view-impl.ts` | `ShipView` += `bounty`, `groupId`, `energy`, `maxEnergy`, `cargo`, `accuracy`, `escortSlot`, `ownerId`; `WorldView` += `playerStanding()`, `groupLeader(groupId)`, `specKeyOf(id)`. | The exhaustive `Record<keyof WorldView, true>` pin tests must be updated deliberately (Pitfall 19 applies: this is the "later phase that needs it"). |
| `src/sim/world/control.ts`, `control-impl.ts` | `ShipControl` += `say(key, params)`, `notify(to, name, a?, b?, n?)` (a bounded `postAiEvent` for ship-to-ship channels and group broadcast `notifyGroup`), `markOffender(target, bits)` (a ship target or `PLAYER_ID`), `setBounty(0)` (self), `joinGroup`/`leaveGroup`/`appointLeader`, `acceptEscort`/`releaseEscorts`, `requestDock`/`enterWitchspace`/`land` (all end in `retireShip` at the right range), `startScoop`. All actor-only for writes except through events. | Argument domain checks as today; one pin test. |
| `src/sim/world/entity.ts`, `world.ts`, `serialize.ts`, `sanitize.ts`, `snapshot.ts`, `limits.ts`, `ids.ts` | New fields (section 5). `limits.ts` gains `MAX_BOUNTY`, `MAX_GROUP_ID`, `MAX_POD_AMOUNT`. | The one bundled bump. |
| `src/sim/world/step.ts` | `stepWorld` gains the populator phase and the tractor stage (after `stepDebris`); `invoke` builds `AiContext.facts`; `NpcStepFacts` (in `npc/stats.ts`) carries `ai?: AiFacts` and `populator?: PopulatorContext`. | Populator phase must stay after the final drain so new ships act next tick. |
| `src/sim/world/populate.ts` | `INERT_POPULATION` and `planInertPopulation` are replaced by `populator/plan.ts`; keep `pickRecord`, `parseRoleToken`, `cargoCountAtSpawn`, `isScanClass`. `populateInertWorld` is kept as a test fixture entry (12 inert ships) or retired with its golden. | Re-pins `tests/golden/world/inert-lave-epoch1.json`: plan it once. |
| `src/sim/world/kill.ts` | `notifyKill` additionally posts `shipTargetDestroyed` etc. as today; no change to credit rules. Player kill credit stays in `resolveShots`. | low |
| `src/sim/world/debris.ts` | Pods take a commodity and an amount from the victim's cargo kind (port of `Universe.m:3854-3878`, `3977-3996`, `getContainersOfGoods`), drawn from a **stateless fork** `forkSeed(worldSeed, victimId, "pod")`, so the victim's `combat` stream order (D16-12) is unchanged and no pod-position draw moves. | The commodity roll needs the system's market quantities for plentiful/scarce goods: add them to `DebrisContext`. |
| `src/sim/world/contacts.ts` | `NpcContact.kind` gains `"hostile"` (and optionally `"offender"`) for scanner colour; `debrisContacts` feed the scanner for `CLASS_CARGO` (recorded gap D16-26, "deferred with scooping"). | HUD scanner model change. |
| `src/sim/combat/ledger.ts`, `combat/step.ts` | After each applied record post `shipBeingAttacked` (victim, `a` attacker) or `shipBeingAttackedUnsuccessfully` (shield absorbed) and `shipAttackedOther` (attacker, `a` victim) to **NPC** ids; call `offence.ts`; after the kill loop call `collectBountyFor` when `killer === PLAYER_ID`; `resolveShots` takes `combat.standing`. Today **nothing in the repo posts a being-attacked event** (`ai/types.ts` lists the names, no producer exists), so every reaction of the ported AI depends on this change. | Changes event order inside `resolveShots`; pin tests in `tests/sim/combat/`. |
| `src/sim/combat/collide.ts`, `combat/response.ts` | Add Oolite's scoop branch (`ShipEntity.m:11035-11042`) ahead of the damage rule: a scooper that `canScoop` a cargo entity tractors it instead of colliding (PD-05 comment removed). | One of two places the world side writes the player's `FlightState`; the tractor pulls nothing of the player, only the pod. |
| `src/sim/combat/state.ts` | `PlayerCombatState.standing: PlayerStanding`; `isPristineCombat` and `serializeCombat` extended pristine-omit; `dockReset` and `launchReset` must **not** touch it. | A test that pins `dockReset` field by field must be extended. |
| `src/sim/sim.ts` | Passes `combat?.standing` into `stepWorld`; no new step. | low |
| `src/sim/npc/dispatch.ts`, `npc/behaviours/*` | Add `COLLECT_TARGET`; confirm `TRACTORED` and `FLY_RANGE_FROM_DESTINATION` entries; the ported AI's behaviour set stays inside the 9 native behaviours plus collect (STATE 2026-11-14). | The 20-seed acceptance run applies (section 8). |
| `src/sim/dock/computer.ts`, `flight/step.ts` | Docking check: refuse a docking-computer request when `standing.bounty > 50` (`StationEntity.m:412`, `:1861`; `PlayerEntityControls.m:4701-4726`) with a new `DockDeniedReason` `"fugitive"`; the autopilot-dock fine roll (`:4743-4755`) is app/dock-time. Needs `standing` as a `StepOptions` fact (read-only inside `stepFlight`). | Manual docking is not refused by Oolite's clearance logic; research flag (section 9). |
| `src/sim/hyperspace/jump.ts` or `src/app/session/hyperspace-controller.ts` | Arrival: `standing.bounty = floor(bounty / 2)` (`PlayerEntity.m:6887`). | The arrival is an app block with a synchronous install rule (world-lifecycle rule (ii)); the halve is total. |
| `src/sim/player/outfitting.ts` | `VISIBLE_EQUIPMENT_KEYS` += `EQ_FUEL_SCOOPS` (already in the catalogue, 5250 decicredits at TL 5, `equipment.json`). | The F3 display order is pinned by tests. |
| `src/content/**`, `tools/oolite-ingest/**` | New converter rows: full NPC roster, `aiType`, `bounty`, `escorts`, `escort_role`, `accuracy` range, `has_scoop`, `scoop_position`, `cargo_type`, `pilot_role` hints, `role-categories.plist`, comms strings (`oolite-priorityai.js` `_getCommunication`, the `descriptions.plist` keys). `src/content/schemas/ship-npc.ts` gains the fields. | Models are CC BY-NC-SA: `ASSETS.md`, `NOTICE`, `CHECKSUMS.sha256`. Lazy chunk size and the load-time budget are affected. |
| `src/persistence/save.ts` | `SAVE_VERSION` 6: `legalStatus` (int 0..`MAX_BOUNTY`), `shipKills` (int); strict schema, no migration (D-11 precedent, alpha). Supersedes the Key Decision "no combat, law or cargo field in the save" (2026-11-13) for these two scalars only. `MAX_SAVE_CHARS` comment re-measured. | Golden saves regenerate. |
| `src/app/session/traffic.ts` | `createInertPopulate` becomes `createPopulate`; `trafficContent` also builds `PopulatorContent`, `AiFacts`, role tables; one builder shared with `tests/helpers/tick-script.ts` (Pitfall 11). | Node-runner purity rule stays. |
| `src/app/session/step-options.ts` | Adds `ai`, `populator`, `hold` (capacity pods, pods used, `hasScoop`) and `standing` facts to `StepOptionsInput`; built per step. | |
| `src/app/session/event-router.ts` | Routes `bountyAwarded`, `legalStatusChanged`, `cargoScooped`, `commsMessage`, `shipDestroyed` (kill text); new subscribers `standingFlow`, `scoopFlow`. | `EVENT_SUBSCRIBER_ORDER` is pinned by `tests/app/session-order.test.ts`: append, never insert. |
| `src/app/session/save-controller.ts`, `start-session.ts` | `snapshotForSave` reads `combat.standing`; Continue/Load seed `combat.standing` from the save (today `combat` is recreated fresh on Continue/Load). | A Continue must restore standing before the first `stepSim`. |
| `src/app/hud-model.ts`, `src/ui/station-model.ts` | F5 shows Legal Status (`labels.legalStatus`, 3 strings already compiled) and the rating with the kill count (`formatRating(rating, kills)` exists with `kills` hard-wired 0). HUD: scoop status dial, scanner colours. | |

### 3.3 Component boundaries

| Component | Responsibility | Communicates with |
|-----------|---------------|-------------------|
| Priority AI (`src/sim/ai/priority`) | Decide what to do and say; never move a ship | `ShipControl`, `WorldView`, `AiFacts` only (AI lint zone: add `facts.ts`, `priority/**` to the allow-list) |
| Native steering (`src/sim/npc`) | Move, aim, fire (gate) | `entity.nav`, `entity.steer`, `ctx.fire` |
| Populator (`src/sim/world/populator`) | Decide who exists and where | `world.rng`/forks, `spawnEntity`, `ai/spawn.ts` |
| Ledger/kill (`src/sim/combat`, `world/kill.ts`, `world/retire.ts`) | One place lowers energy, one removes ships | `postAiEvent`, `standing` |
| Standing (`src/sim/player/standing.ts`) | Legal status, kill tally, rating | ledger (writes), view/facts (reads), save (via app) |
| App flows (`src/app/session/*-flow.ts`) | Wording, profile, persistence | SimEvents only |

---

## 4. The priority AI as plain data

### 4.1 What is static and what is state

Oolite's `PriorityAIController` (`oolite-priorityai.js:38-593`) holds: the priority list (a code literal per role script), `parameters` (a dictionary), two caches (`__cache` cleared on every reconsideration, `__ltcache` cleared every 60 s), active handlers (rebuilt per behaviour), `lastCommSent/Heard`, a comms role and personality, a waypoint generator, one `Timer` (ECM). Map them:

| Oolite thing | Port | Stored? |
|--------------|------|---------|
| priority list, templates | `PRIORITY_TREES[treeKey]` frozen at load | no (code, selected by `params.tree`) |
| `oolite_flag_*` that the role script sets once | tree-level `config` constant | no |
| `parameters` that change at run time (selected station, planet, docking station, leader id, defense targets, waypoint index, cargo demand) | typed `params` keys | yes |
| `__cache` | scanner/odds memo inside one `think` | no |
| `__ltcache.oolite_nearestStation` | recompute (one station in v2.4) | no |
| `__ltcache.oolite_dockingclearpos` (a random point kept so the ship does not re-roll) | `params.dockPos` (3 numbers) | yes |
| current behaviour function | `params.beh` (closed id) | yes |
| active handlers (`applyHandlers`) | `params.hs` (closed handler-set id) | yes |
| `AIScriptWakeTime` | `ai.wakeTick`, never-later rule already in `scheduleWake` | yes |
| `lastCommSent`, `lastCommHeard` (seconds) | `params.cs`, `params.ch` (ticks) | yes |
| comms role / personality | `params.cr` (string), `params.cp` (string); personality chosen from `entityPersonality % n`, so derive it from the entity id and spec key, store only the choice | yes |
| waypoint generator closure | `params.wpgen` (closed id: `stationPatrol`, `witchpointPatrol`, `spacelanePatrol`) + `params.wp` (flat `[x,y,z,...]`, at most 64) | yes |
| ECM timer | out of scope (ECM deferred); no param | no |

The budget is about 24 of the 32 allowed keys. A unit test enumerates the closed key list and fails past 32.

### 4.2 `params` vocabulary (short keys, one module)

`tree`, `beh`, `hs`, `fire` (true for any hull with a forward weapon), `tgtAlt` (remembered target id), `def` (defense target ids, at most 8), `stn` (selected station id), `pln` (selected planet id), `dock` (docking station id), `dockPos`, `wpgen`, `wp`, `wpi`, `lead` (group leader hint, re-validated), `cdm` (cargo demand amount), `cdd` (demanded of me), `cdp` (paid), `cdmet`, `cs`, `ch`, `cr`, `cp`, `wsEntry` (witchspace plan tick), `wsDest` (system id), `lastOdds` (tick), `notePlayerRole`. Every stored entity id is re-checked with `view.isValid` at each use (the flight-script precedent); `killShip` never rewrites references (documented in `kill.ts`).

### 4.3 Reconsideration and timers

`think` runs only when `wakeTick` is due: set `nextThinkTick = MAX_UINT32` at creation so the periodic 15-tick think never fires (the priority AI has none, the engine's `aiAwoken` is wake-only). `reconsider: N` seconds becomes `ticks(N)` via `ai/time.ts`; `reconsiderNow` is `0.1 + (10 - accuracy)/10` seconds (`priorityai.js:441-448`), needing `accuracy` on `ShipView`. All `Math.random()` calls become `ctx.random()` (the entity's "ai" stream) **at the same call sites and in the same order**; the harness routes `Math.random` to the host draw (`load.ts` `RANDOM_INSTALLER`), which makes the draw sequence comparable.

### 4.4 Events and responses

`onEvent` maps `AiEvent.name` through `HANDLER_SETS[params.hs]` to a response id and runs it with the same `PriorityCtx`. Standard responses (`priorityai.js:4888-5660`) mostly call `reconsiderNow`, change target and `perform` an attack. The kill code already posts `shipTargetLost` to holders and `shipTargetDestroyed`/`shipKilledOther` to an NPC killer. New producers: ledger (being attacked, attacked other, unsuccessful), `offence.ts` (`offenceCommittedNearby`), populator (`shipLaunchedFromStation`), `ShipControl.notify` for help requests, distress, escort acceptance and cargo-demand traffic.

---

## 5. Hash, snapshot and save changes (one bundle each)

| Item | Where | Hash form | Why |
|------|-------|-----------|-----|
| `Entity.bounty` (uint) | `entity.ts`, `serialize.ts` | `;bty:n` omitted at 0 | NPC legal status is a field of every ship; it decides who police attack and what a kill pays (`ShipEntity.m:7097-7152`) |
| `Entity.groupId` (uint) | same | `;grp:n` omitted at 0 | Group membership |
| `Entity.cargoKind` (small enum) | same | `;ck:n` omitted at 0 | The populator's `CARGO_FLAG_*` decides what pods a dying ship releases; today only a count exists |
| `Entity.podCommodity`, `Entity.podAmount` | same | `;pod:c,a` omitted when both 0 | Scoopable identity; both 0 means an anonymous pod, the current behaviour |
| `World.groups: {id, leader}[]` | `world.ts`, `snapshot.ts` | one `groups:` line, omitted when empty | Leader per group |
| `World.populator { nextTick, rolls }` | same | one `repop:` line, omitted when `nextTick === 0` ("never armed") | The repopulation clock and a counter for stateless forked draws |
| `PlayerStanding` | `combat/state.ts` | appended to the combat line only when non-pristine | Read by the AI, written by police AI and kills |
| `AI_KEYS`, `AI_EVENT_NAMES` | `ai/types.ts` | none (closed vocabularies) | The snapshot parser rejects an unknown key |
| `WORLD_SNAPSHOT_VERSION` 4 to 5 | `snapshot.ts` | | The parser version check is strict; world snapshots are test-only, never in saves |
| `SAVE_VERSION` 5 to 6 | `persistence/save.ts` | | `legalStatus`, `shipKills` |

Golden consequences, to plan once: pristine-omit keeps `flight-hash-pins.json` and every golden whose world has none of the new fields. `tests/golden/world/inert-lave-epoch1.json` changes because the populate table changes, and the debris goldens change because pods draw a commodity (the stateless fork leaves the position draws alone). `tests/golden/save/*` regenerate at v6. The Phase 18 standing approval to re-pin twin hashes when the cause is measured and Node equals browser covers hash re-pins; confirm it extends to v2.4. The `;steer:` record stays frozen; none of these fields go inside it.

Saves keep the "NPCs regenerated at the leg anchor, never saved" rule. A Continue therefore resets the traffic (pirates a player already killed reappear) and re-arms the repopulation clock from the world seed. Standing and kills persist. Record this in Key Decisions so it is not rediscovered as a bug.

---

## 6. Data flows

### 6.1 Initial population (world creation)

`world-lifecycle.begin/resume` → `populate(world, {traffic})` (`traffic.ts` closure) → `populator/plan.ts` (system facts + `world.rng`, same draw discipline: location, pick, orientation) → `populator/spawn.ts` (`spawnEntity` with `ai: createPriorityAi(...)`, `ownerId`/`escortSlot` for escorts, `groupId`, `bounty`, cargo). No ids burned with traffic off (D-01). Arming the clock: `world.populator.nextTick = tick0 + floor(u * 2400)` from a stateless fork (Oolite `next_repopulation = randf() * INTERVAL`, `Universe.m:1293`).

### 6.2 Repopulation

`stepWorld` populator phase: `if (tick >= populator.nextTick)` → for each rate in fixed key order draw `forkSeed(worldSeed, populator.rolls++, "repop")`; spawn via `populator/spawn.ts`; `nextTick += 2400`. Incoming ships appear at the witchpoint with the AI already holding a destination; outgoing ships appear at `STATION_AEGIS`/aegis location codes. Guard: skip when live ships exceed a populator ceiling (recommend 40, tuned against the Oolite reference; debris shares the 256 cap and must keep its headroom).

### 6.3 An attack, a witness and an offence

1. NPC steering asks `ctx.fire`; the fire gate at the drain decides (exists).
2. `resolveShotHits` produces `HitRecord`s; `applyLedger` lowers energy (exists).
3. **New:** for each applied record the ledger posts `shipBeingAttacked` to an NPC victim and `shipAttackedOther` to an NPC shooter, and calls `offence.ts` when the victim's bounty is 0 and its scan class is eligible.
4. `offence.ts` posts `offenceCommittedNearby(attacker, victim)` to authorities in range.
5. `drainAiEventsNow` delivers them; the police `offenceCommittedNearby` response (`priorityai.js:5123-5170`) calls `ctl.markOffender(attacker, 7)`; for `PLAYER_ID` that writes `combat.standing.bounty |= 7` and emits `legalStatusChanged`.
6. Police `reconsiderNow` picks `conditionScannerContainsFugitive` / `SeriousOffender` and attacks. The player's `standing.bounty` is read through `view.playerStanding()`.

The player is never an AI entity, so any logic Oolite runs on the player as `this.ship` has to be implemented as a handler on the other party (as here) or in the sim code that owns the player (`standing.ts`).

### 6.4 A kill, a bounty and the tally

`killShip` marks the victim dead (entity still readable until the commit). Right after the kill loop in `resolveShots`: if `hit.killer === PLAYER_ID` then `collectBountyFor(world, victim, standing, events)`: score `10 * victim.bounty`; police victim marks the player `|= 64`; cargo/buoy/rock victims score a tenth and do not count; otherwise `kills++`. Events: `bountyAwarded {credits}` (new), `playerKill` (new, or reuse `shipDestroyed` plus a flag), `legalStatusChanged`. App `standingFlow` adds credits to the profile and prints text; the rating comes from `ratingFor(kills)` at display time. Credits are the only thing the profile gains; kills and bounty stay in `standing`.

### 6.5 Scooping

`stepFlight`/`collide.ts` detects a cargo entity touching the player's `scoop_position` zone with `canScoop` true (Fuel Scoops installed, `holdPods < capacity` from the per-step hold fact, pod in front and below) → `startTractor`. `stepTractor` pulls the pod; within `2 x radius` it emits `cargoScooped {scooper, commodity, amount}`, marks the pod dead through `killShip` (no event, no debris) and posts `shipWasScooped`/`shipScoopedOther`. App `scoopFlow` commits the hold. Because events are dispatched after **every** step (`sim-driver.ts:247`) and the hold fact is rebuilt every step, the next pod sees the new hold. The Node replay does not route events, so its hold fact is a constant: scoop tests in the replay must pass the fact explicitly.

---

## 7. Patterns to follow

### Pattern 1: tree as data, behaviour as registry id
**What:** `{ cond: "scannerContainsFugitive", pre: "checkScanner", config: "acquireScannedTarget", behaviour: "commenceAttackOnCurrentTarget", reconsider: 1 }` with `ConditionId` a string-literal union and the registries `Record<ConditionId, ConditionFn>`; exhaustiveness is a type error.
**When:** every role tree. **Why:** the differential harness can name a condition and compare it one by one against the original JS.

### Pattern 2: derive, never store, what the world already knows
Group membership from `groupId`, escorts from `ownerId`, hostility from `nav.behaviour` plus a valid target, "has a hostile target" from the ship view. Stored copies drift when a ship dies or retires.

### Pattern 3: stateless fork per roll
`forkSeed(worldSeed, counter, "repop" | "pod" | "cargo")` (the `cargoCountAtSpawn` precedent) so adding a draw to a feature never moves another feature's stream or the world stream.

### Pattern 4: events instead of cross-ship writes
Anything that in Oolite writes another ship's AI dictionary (`oolite_intership.*`, `setBounty` on the player, `setFoundTarget`) becomes an `AiEvent` or a `ShipControl` method that checks its target domain; the sim stays total and the actor-only invariant of `control-impl.ts` holds.

---

## 8. Anti-patterns to avoid

### Anti-pattern 1: running the original JS in the browser
Rejected in PROJECT.md (closure state cannot be hashed). The harness stays dev-only and out of `dist`.

### Anti-pattern 2: storing the legal status in the profile and feeding the sim from events
One tick of lag and a Node replay that does not route events give two worlds. The profile is for money and the hold.

### Anti-pattern 3: spawning traffic from the app on a timer
Wall-clock or frame-driven spawning breaks the cadence guarantee (`cadence.test.ts`) and the replay.

### Anti-pattern 4: widening `WorldView` with closures over the store
Every view object is a fresh plain copy (view.ts contract). Keep it that way; compute derived facts in AI code from copies.

### Anti-pattern 5: letting a contained AI fault hide a port bug
A throw makes the ship inert and emits `aiFaulted`. Acceptance runs must assert `aiFaulted` is 0 (the existing 20-seed run asserts `repairs 0`; add the fault count for the new scenario).

### Anti-pattern 6: station AI creep
Oolite's main station is itself a priority AI (`oolite-stationAI.js`: launch defence ships, patrols, traffic, alert levels). Statics hold no state and no AI today. Do not add one inside this milestone without a decision (Q1).

---

## 9. Scalability and cost

| Concern | Today | v2.4 expectation | Mitigation |
|---------|-------|------------------|------------|
| Live entities | 12 inert + debris, cap 256 | 15 to 40 ships plus debris | populator ceiling; debris cap unchanged |
| AI think cost | none | about 40 ships, each reconsidering every 0.1 to 5 s; scanner calls are O(n) | per-think scanner memo; `view.scan` already sorted; budget test in `tests/sim` |
| Event fan-out | drain bounded 8 passes / 4096 events | help/distress broadcasts to groups and authorities | existing bounds; assert `aiDropped` 0 in acceptance |
| Hash text size | per entity line | more optional segments | pristine-omit |
| Lazy content | 9 hulls | roughly 25 hulls plus models | the existing lazy chunks; measure first-load budget |

---

## 10. Suggested build order

Phase numbering continues at 21. Each phase is a vertical slice that keeps `docker compose run --rm test`, `lint`, `typecheck` green; browser-facing phases add `verify`; the 20-seed run is repeated by hand after any change under `src/sim/npc/**`, `src/sim/world/**` or `ships-npc.json` (AGENTS.md).

| # | Phase | Contents | Depends on | Gate |
|---|-------|----------|-----------|------|
| 21 | **Roster, state shape and seams** | (a) Content: NPC roster, `aiType`, `bounty`, escorts, role categories, comms strings, models and provenance. (b) The one bundled hashed-shape plan: snapshot v5, `bounty`/`groupId`/`cargoKind`/pod fields, `World.groups`, `World.populator`, `PlayerStanding` in combat state, AI vocabulary, `WorldView`/`ShipControl` extensions with pin tests, `retireShip`, ledger attack events and `offence.ts`. No behaviour change: all new fields pristine; goldens hold. | none | test, lint, typecheck, `assets:check` |
| 22 | **Populator, initial** | `populator/{facts,plan,spawn}.ts`, groups, escorts, bounty and cargo flag at spawn, replacing `INERT_POPULATION`; ships still `ai: null`. Composition checked against headless Oolite. One golden regeneration. | 21 | test; reference comparison |
| 23 | **Priority AI engine, traders and pirates** | `ai/priority/*` engine, params, responses, comms channels, group/escort handling, `trader`, `pirate*`, `escort` trees, `collect.ts` native behaviour stub, attach AI at spawn, `fire: true`. Harness generalised; condition fixtures. | 21, 22 | test; acceptance (new traffic scenario, frozen thresholds committed first) |
| 24 | **Police, legal status, bounty, standing** | `police*`, `bounty-hunter*` trees, `standing.ts`, `markOffender`, bounty on kill, kill tally, rating, docking check, arrival halving, save v6, `standingFlow`, F5 panel, scanner kinds. | 23 | `verify`; save goldens; acceptance |
| 25 | **Repopulation and departures** | `repopulate.ts`, witchpoint arrivals, station launches, NPC docking (simplified approach then `retireShip`), witchspace exit, planet landing, populator ceiling. | 22, 23, 24 | `verify`; 20-seed run by hand; reference rates |
| 26 | **Loot and scooping** | Pod identity and the cargo kind rule in `debris.ts`, `scoop.ts`, `collide.ts` scoop branch, F3 Fuel Scoops, `scoopFlow`, hold fact, pirate `CollectSalvage` and the cargo-demand protocol, scanner pods, render. | 21, 23, 24 | `verify-full` (render, input, persistence touched) |
| 27 | **Integration, acceptance, release gate** | Traffic acceptance across 20 seeds, anarchy pirate-attack scenario, "fire on a trader, police attack" scenario, reference comparison of composition and behaviour, FIDELITY rows, `verify-full`. | 21 to 26 | `verify-full` plus acceptance |

Ordering rationale:

- Content and the hash bundle come first because every later phase either needs the ships or pays for a second bump and a second golden regeneration.
- The populator before the AI lets composition be verified without behaviour noise, and gives the AI phase real ships to run on.
- Traders and pirates before police because police behaviour is a reaction to offences and to the player's standing, which needs the attack events and the engine working first. The `standing` type exists from phase 21, so police can be developed in phase 24 without a second sim-shape change; only the **save** bump waits for phase 24.
- Repopulation after the AI exists because arrivals and departures are AI behaviours (enter witchspace, dock, land) ending in `retireShip`.
- Scooping last among features: it needs pod identity (a golden-moving debris change), hold facts, a new F3 item and the AI's collect behaviours; shipping it earlier would force pirates to ignore loot, which is recorded as a divergence in phase 23 only if phase 26 slips.

---

## 11. Open questions and research flags

| Q | Question | Effect on architecture |
|---|----------|------------------------|
| Q1 | Does the main station launch defence ships and patrols (station AI)? Oolite's police response at a station is partly station-launched vipers. | Without it, "police attack an offender" comes only from populator-placed police. A station AI needs state on a static (new hashed field) and a launch path. Recommendation: defer, record in FIDELITY.md. |
| Q2 | Bounty paid at the kill (Oolite) or on docking (milestone text)? | Immediate is the default and needs no state. "On docking" needs `standing.pendingBounty` (a hashed, saved scalar). Decide before phase 24. |
| Q3 | Are hunters and assassins in v2.4? The pirate AI calls `conditionScannerContainsHunters`, and `INERT_POPULATION` already holds hunters. | Adds `bounty-hunter*` trees and assassin roles; recommend hunters yes, assassins no. |
| Q4 | NPC docking fidelity: Oolite's multi-stage docking instructions (`StationEntity.m:401-` `dockingInstructionsForShip`) or a simplified approach-then-retire. | Recommend simplified with a FIDELITY row; the player cannot see inside the dock. |
| Q5 | Manual docking by a fugitive: Oolite refuses clearance and the docking computer, but the slot is not a gate. | Research flag for phase 24; affects `dock/step.ts`. |
| Q6 | Role category table and comms strings: confirm all consumed keys are in `role-categories.plist` and `descriptions.plist`. | Content phase. |
| Q7 | Pirate cargo-demand protocol (`oolite_intership.cargodemand*`, 45 uses) needs the player as victim as well as NPCs. | Player-side demand (a comms prompt) is out of scope unless wanted; NPC-to-NPC only is consistent with "no player prompts". Decide in phase 26. |

Phase-level research flags: phase 21 (roster and populator rate port: `oolite-populator.js` is 2,736 lines and `systemsInRange` needs the galaxy graph), phase 23 (condition-by-condition port, harness stub scope), phase 24 (legal flows, docking check), phase 26 (pod commodity rule, tractor force constants). Phases 22, 25 and 27 follow existing patterns.

---

## Sources

- Repository (read at `main`, `df4d01b0`): `src/sim/ai/{types,registry,time}.ts`, `src/sim/ai/pilots/flight-script.ts`, `src/sim/world/{world,entity,step,control,control-impl,view,populate,kill,debris,contacts,serialize,snapshot,limits,ids}.ts`, `src/sim/npc/{dispatch,state,escort}.ts`, `src/sim/combat/{step,ledger,state}.ts`, `src/sim/sim.ts`, `src/sim/events.ts`, `src/sim/player/{profile,outfitting}.ts`, `src/sim/economy/cargo.ts`, `src/app/session/{traffic,world-lifecycle,step-options,sim-driver,save-controller,context}.ts`, `src/persistence/save.ts`, `src/content/generated/ships-npc.json`, `tools/ai-harness/load.ts`, `.planning/PROJECT.md`, `AGENTS.md`. HIGH.
- Oolite checkout `/home/opencode/git/oolite`: `Resources/Scripts/oolite-priorityai.js` (controller `:38-593`, conditions `:1407-2727`, behaviours `:2727-3950`, configurations `:3954-4880`, responses `:4888-6190`, templates `:6203-6470`), `Resources/Scripts/oolite-populator.js` (`:97-627`, `:1027-`), `Resources/AIs/oolite-{pirate,police,trader}AI.js` and siblings, `Resources/Config/role-categories.plist`, `src/Core/Entities/{PlayerEntity,ShipEntity,StationEntity,PlayerEntityControls,PlayerEntityContracts}.m`, `src/Core/{Universe,OOConstToString}.m`. HIGH for quoted line ranges; MEDIUM for how they compose at run time (not measured in a running Oolite).
