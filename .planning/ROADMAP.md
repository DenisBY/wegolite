# Roadmap: Wegolite

## Milestones

- ✅ **v1.0 Wegolite v1 Core Loop** — Phases 1-7 (shipped 2026-11-08 as `v0.1.0`; archived 2026-11-10)
  - Full phase details: [.planning/milestones/v1.0-ROADMAP.md](milestones/v1.0-ROADMAP.md)
  - Requirements: [.planning/milestones/v1.0-REQUIREMENTS.md](milestones/v1.0-REQUIREMENTS.md)
  - Open at archive: QUAL-01 (60 fps evidence on the reference desktop), deferred by the owner on 2026-11-08 and again on 2026-11-13; it stays with the unscheduled performance phase (former Phase 23, see "Later (unscheduled)")
- ✅ **v2.0 Foundation** — Phase 8 (shipped 2026-11-13; no release tag, the latest release is `v0.3.0`)
  - Full phase details: [.planning/milestones/v2.0-ROADMAP.md](milestones/v2.0-ROADMAP.md) (also holds the former Phases 9-23 plan)
  - Requirements: [.planning/milestones/v2.0-REQUIREMENTS.md](milestones/v2.0-REQUIREMENTS.md) (also holds the 55 requirements of the former v2.1 Combat & Traffic plan and their phase mapping)
  - Open at archive: review WR-01 (contain a throwing AI module; now FOUND-15 in Phase 12); e2e flakes under load (D-2)
- ✅ **v2.1 World Population Base** — Phases 9-12 (shipped 2026-11-14; no release tag, the latest release is `v0.3.0`)
  - Full phase details: [.planning/milestones/v2.1-ROADMAP.md](milestones/v2.1-ROADMAP.md)
  - Requirements: [.planning/milestones/v2.1-REQUIREMENTS.md](milestones/v2.1-REQUIREMENTS.md)
  - Audit: [.planning/milestones/v2.1-MILESTONE-AUDIT.md](milestones/v2.1-MILESTONE-AUDIT.md) (tech_debt: 12/12 requirements, no blockers)
  - Open at archive: review WR-01 (a refused `begin()` at arrival leaves the origin world installed; now FOUND-17 in Phase 13), buoys not yet blocking hyperspace, the deferred real-Oolite mass check; all three are todos
- 🚧 **v2.2 Weapons and NPC Flight** — Phases 13-14 (in progress; roadmap created 2026-11-14)
  - Requirements: [.planning/REQUIREMENTS.md](REQUIREMENTS.md) (10 requirements: FOUND-17, INPUT-01, CBT-04 to CBT-07, DOCK-10, WORLD-07, AI-01, AI-11)
  - Phase details: below. The former plan for these two phases is in [.planning/milestones/v2.0-ROADMAP.md](milestones/v2.0-ROADMAP.md)

## Phases

<details>
<summary>✅ v1.0 Wegolite v1 Core Loop (Phases 1-7) — SHIPPED 2026-11-08, ARCHIVED 2026-11-10</summary>

- [x] Phase 1: Foundation, Containers & Compliance (7/7 plans) — completed 2026-11-02
- [x] Phase 2: Data Pipeline & Content Compiler (9/9 plans) — completed 2026-11-03
- [x] Phase 3: Flight in the Lave System (14/14 plans) — completed 2026-11-04
- [x] Phase 4: Manual Docking (8/8 plans) — completed 2026-11-05
- [x] Phase 5: Docked Economy & Station Screens (6/6 plans) — completed 2026-11-06
- [x] Phase 6: Hyperspace, Navigation & Persistence (17/17 plans) — completed 2026-11-07
- [x] Phase 7: Hardening & Community Release (12/12 plans) — completed 2026-11-08; QUAL-01 deferred by the owner

Total: 73 of 73 plans complete. Phase directories now live in `.planning/milestones/v1.0-phases/`.

</details>

<details>
<summary>✅ v2.0 Foundation (Phase 8) — SHIPPED 2026-11-13</summary>

- [x] Phase 8: Session Split and World Core (16/16 plans) — completed 2026-11-13; v1 play unchanged on a multi-entity world (stable ids, seeded streams, a world hash, the typed AI seam and a tick-stepping test hook)

Scope: narrowed on 2026-11-13 from Phases 8-23 to Phase 8 alone (PROJECT.md Key Decisions). Requirements FOUND-10 to FOUND-14, 5/5 complete. The AI seam, the snapshot codec and the reserved events are provisional until later phases exercise them; Phase 12 is the first. Phase directory now lives in `.planning/milestones/v2.0-phases/`.

</details>

<details>
<summary>✅ v2.1 World Population Base (Phases 9-12) — SHIPPED 2026-11-14</summary>

- [x] Phase 9: NPC Content (5/5 plans) — completed 2026-11-14
- [x] Phase 10: Ship Mass (4/4 plans) — completed 2026-11-14
- [x] Phase 11: Minimal Save Schema v3 (4/4 plans) — completed 2026-11-14
- [x] Phase 12: Inert Ships and the World Lifecycle (14/14 plans) — completed 2026-11-14

Total: 27 of 27 plans complete. Requirements 12/12. Phase directories now live in `.planning/milestones/v2.1-phases/`.

</details>

### 🚧 v2.2 Weapons and NPC Flight (In Progress)

**Milestone goal:** The player sees from four views and shoots lasers at ship hulls, and NPC ships fly with Oolite's flight model and native steering, proven against independently authored source-cited oracles. The gate to the later AI port (the harness spike and the owner's choice of oracle) closes in this milestone.

**Scope rule:** the necessary technical minimum, by owner decision on 2026-11-13 ("less, but better"). Two phases, below the 4-6 standard-granularity guide, because the owner scoped the milestone to what has a consumer; they are not padded. Sound, police, pirates, missiles, mining, priority AI, destruction and death, and QUAL-01 stay in the backlog. Phase numbers 13 and 14 are kept from the former Combat & Traffic plan so existing references (todos, Key Decisions, review notes) stay valid; there is no reset.

**Phase numbering:** continues from v2.1 (Phases 9-12). Decimal phases (for example 13.1) are urgent insertions.

- [x] **Phase 13: Views, Lasers and Shields** - A refused arrival no longer leaves a stale world; Oolite's keys for pause, ident and eject; four views; pulse, beam, military and mining lasers per facing hitting ships by their octree hull; shields and energy banks that absorb and recharge; docking restores them (completed 2026-11-15)
- [ ] **Phase 14: NPC Flight and Steering Fidelity Gate** - NPC ships seen flying with Oolite's flight model and nine native steering behaviours, proven against independently authored source-cited oracles; the dev-only harness spike and the owner's oracle choice close the gate to the AI port

**Staged verification:** WORLD-07 is the one staged requirement. Its drawn-and-on-the-scanner half shipped in Phase 12 (inert ships); Phase 14 completes it when the ships move. CBT-07 needs no stage: the shared hit rule is proved by a scripted test pilot, and autonomous NPC fire (CBT-15) is unscheduled.

**Changes from the former plan** (`.planning/milestones/v2.0-ROADMAP.md`, Phases 13 and 14):

- Phase 13 gains FOUND-17 (review WR-01) as its first plan, so a stale origin world cannot reach the weapon code. The Escape (double press) eject binding is bound but inert: the escape pod is unscheduled (former Phase 16), and a ship's energy floors at zero because destruction is unscheduled (former Phase 15).
- Phase 14 trims AI-01 to nine behaviours: idle, tumble, fly to destination, face, intercept, attack, flee, escort and avoid collision. Collect, tractored, mining and land on planet are AI-12 (Future Requirements). AI-11 (the harness spike and the oracle choice) is now its own requirement and a criterion.
- Phases 9-12 shipped less than the former plan assumed: Phase 10 built hull octrees at build time only, Phase 9 compiled no flight or energy stats, and Phase 11 added no combat save field. Phase 13 and Phase 14 therefore consume the smallest part they need of DATA-16, DATA-15 and SAVE-09 (see "Implied work" in each phase). No requirement text changed.

### Execution Order and Parallel Tracks

Phases 13 and 14 have no dependency on each other. Both build on the shipped Phase 12 and can run side by side.

| Phase | Depends on | Can run beside | Must land before |
|-------|------------|----------------|------------------|
| 13. Views, Lasers and Shields | Phase 12 (uses Phase 10 octrees and masses, Phase 11 save chain) | 14 | The unscheduled destruction phase (former Phase 15), which extends the damage function built here |
| 14. NPC Flight and Steering Fidelity Gate | Phase 12 (inert ships, the world step, the AI seam; Phase 10 mass and collision radius) | 13 | The unscheduled priority-AI phase (former Phase 18), which is planned only after the owner accepts the fidelity report |

Ordering rules:

- FOUND-17 is Phase 13's first plan. The INPUT-01 binding migration (Escape, P, R) is the next plan, before any view, laser or ident work relies on the keys; the browser specs that pressed Escape to pause or R to target the station are migrated in the same plan as the bindings (research PITFALLS 11).
- Phases 13 and 14 both extend `ShipControl`, the world entity state and the NPC records (13: fire, energy and shield state, NPC energy fields; 14: steering commands, flight stats). Keep each change additive; whichever phase lands second rebases its goldens and hash fixtures on the first. The shared files are the merge point, so parallel execution should not put both phases' seam plans in one wave.
- Every phase that adds buyable equipment extends the F3 visible set, the money-path boundary (PROJECT.md Key Decisions). Phase 13 adds the four laser keys with purchase, persistence and normal-play tests.
- Combat save fields land with the code that consumes them, each in its own ordered bump (Key Decision, 2026-11-13). The laser mounts are the first, so Phase 13 owns the v3 to v4 bump.
- Phase 14's AI work stays bounded: native steering and a spike only. The priority-AI port, the role phases and the station queue are not planned until the owner accepts the Phase 14 report and selects the decision oracle.
- Bulk verification is Vitest scenarios: at least 90 % of new behavioural assertions in both phases. Browser specs stay opt-in smoke or journey checks, with traffic off by default (the browser-test bundle default, Phase 12 WORLD-16).

## Phase Details

### Phase 13: Views, Lasers and Shields

**Goal**: The player can look and fire in four directions: lasers bought per facing hit ships by their Oolite octree hulls, shields and energy banks absorb and recharge damage, docking restores them, and Oolite's keys for pause, ident and eject are in place; a refused arrival no longer leaves a stale world behind
**Depends on**: Phase 12 (shipped in v2.1). It builds on Phase 10's build-time hull octrees and ship masses and on Phase 11's ordered save chain
**Parallel track**: Phase 14 can run beside this phase
**Requirements**: FOUND-17, INPUT-01, CBT-04, CBT-05, CBT-06, CBT-07, DOCK-10
**First plan**: FOUND-17 (review WR-01), before any binding or weapon work
**Success Criteria** (what must be TRUE):
  1. Settled first, before any weapon code relies on it. (a) A hyperspace arrival whose new world is refused (only a hand-edited save at the maximum world epoch can cause it) leaves no ship of the origin system in the destination: none is drawn, on the scanner, mass-locking the torus or blocking a jump, proven by a controller-level Vitest scenario. (b) P alone pauses, and Escape stays Back inside station sections. Escape (double press) is bound to eject and does nothing, because no escape pod can be bought in this milestone. R engages ident and locks the ship in the sights, and target-station moves to a free key. Every one is rebindable and listed in the controls panel, and the browser specs that pressed Escape to pause or R to target the station are migrated in this phase.
  2. The player can switch between fore, aft, port and starboard views, and buy pulse, beam, military and mining lasers per facing at F3, which now offers them. A new game and a migrated save start with the Cobra's Oolite default, a pulse laser on the fore mount. A purchase survives a reload through one ordered save bump (v3 to v4): an older build treats a v4 save as an inert future-version save, and the worst-case v4 save stays under the 65,536-character cap.
  3. The laser on the current facing fires a drawn shot with Oolite's damage, range, recharge and heat, and a laser that overheats cuts out until it cools. A shot hits a ship only where its Oolite octree hull is: a shot inside the bounding sphere but outside the hull misses, and a hit drains the target's energy by the damage function. A scripted test pilot firing through `ShipControl` hits the player and other ships by the same hit and damage rule; autonomous NPC fire is CBT-15 (unscheduled).
  4. Hits on the player drain the facing shield first and then the energy banks, and both recharge at Oolite's rates. The HUD shows fore and aft shields, energy, laser temperature and cabin temperature. Docking restores shields and energy to full and resets laser and cabin temperature, as Oolite does.
  5. At least 90 % of this phase's new behavioural assertions are Vitest scenarios, and any browser spec it adds is an opt-in smoke or journey check with traffic off by default.

**Scope note**: nothing is destroyed in this milestone. A ship's energy floors at zero, and the damage function built here is the one the unscheduled destruction phase extends. Only a scripted test pilot fires at the player, so shield and energy loss on the player is exercised through it (the test hook) and by the Vitest scenarios.
**Implied work** (flagged at roadmap creation; no requirement text changed, and the plan-phase step decides the exact split):
  - Runtime octree ray test and octree data delivery (the ray half of DATA-16). Phase 10 built octrees at build time only and ships none, so CBT-07 carries the port of the ray test and the delivery of octree data for the Cobra and the nine NPC hulls. Hull-against-hull queries stay with collisions (unscheduled).
  - NPC energy fields (a minimum of DATA-15). A hit target needs `max_energy` and its recharge rate on its record. The nine NPC records carry no such field today, so compile the minimum behind the strict schema, the golden and the drift gate.
  - Laser mounts in the save (a minimum of SAVE-09). Four facings, with the new-game default above, in the ordered v3 to v4 bump.
**Research flag**: Medium — octree ray tests and where the data lives (first-load ceiling 9,437,184 bytes, D11: raise only on a recorded measurement; traffic-on cold start is 8,839,791 bytes), the combat constants ledger (laser damage, range, recharge and heat; shield and energy rates), the HUD layout revision, the port and starboard view cameras
**Pitfalls to address**: 14 (constants ledger, worked-example tests, FIDELITY rows), 21 (the new gauges and the ident lock deliberately revise the pinned eleven-element HUD layout), 7 (damage events queued, never synchronous), 4 (NaN under damage), 19 (fire is a `ShipControl` command, the same for player and NPC), 26 (message-line flood in a fight), 11 (binding migration across existing browser specs), 10 (the v4 bump: ordered migration, worst-case size test)
**Decisions to settle**: where octree data ships and how the Cobra's reaches the first-load set; what the ident lock shows on the HUD while no missile exists; the cabin-temperature inputs (energy damage heats the cabin, `PlayerEntity.m:5673`; the sun and atmosphere heat inputs stay out with DEATH-03 and DEATH-05, unscheduled)
**Todos**: `2026-11-14-clear-world-when-arrival-begin-is-refused.md` (closed by FOUND-17). Review item IN-01 of that todo (the torus message wording when mass lock stops a running drive) is a candidate to fold in by owner decision; it is not a requirement
**Plans:** 16/16 plans complete in 9 waves

Plans:
**Wave 1**
- [x] 13-01-PLAN.md — FOUND-17: a refused arrival ends the origin world (controller-level scenario); IN-01 mass-lock wording (wave 1)

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 13-02-PLAN.md — INPUT-01: P pauses, Escape inert eject, R ident, U untarget, Q target station, view and fire keys, persisted-settings migration, README and CHANGELOG (wave 2)
- [x] 13-03-PLAN.md — Octree line test and two-stage laser hit rule, pure sim (wave 2)
- [x] 13-16-PLAN.md — NPC record combat fields: display name, energy, recharge, forward weapon and its position (wave 2)

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 13-04-PLAN.md — Lazy hull-octree artifact for the Cobra and nine NPC hulls (wave 3, after 13-16: both regenerate the content manifest)
- [x] 13-05-PLAN.md — Combat constants ledger, laser gating and heat, shields, energy banks, cabin temperature, player combat state (wave 3)
- [x] 13-06-PLAN.md — Profile laser mounts and the ordered save v3 to v4 bump (wave 3)
- [x] 13-07-PLAN.md — NPC energy on world entities, snapshot format v2, inert golden regenerated once (wave 3)

**Wave 4** *(blocked on Wave 3 completion)*
- [x] 13-08-PLAN.md — Player combat in stepSim: held fire in the control intent, views and facing, fire, hit and damage resolution, bookkeeping, DOCK-10 resets, hash (wave 4)
- [x] 13-09-PLAN.md — F3 laser purchase per facing with Oolite trade-in (normal-play purchase test); F5 laser lines (wave 4)

**Wave 5** *(blocked on Wave 4 completion)*
- [x] 13-10-PLAN.md — ShipControl.fire and the scripted pilot hitting player and ships by the same rule; NPC recharge; cross-cadence determinism (wave 5)

**Wave 6** *(blocked on Wave 5 completion)*
- [x] 13-11-PLAN.md — Session and Node replay wiring, hull load with the NPC catalogue, cold-start measurement (wave 6)
- [x] 13-15-PLAN.md — Ident in the sim (R, U, acquisition, loss, world boundaries); INPUT-01 Key Decisions; D-03/D-04 recorded as pending owner confirmation (wave 6)

**Wave 7** *(blocked on Wave 6 completion)*
- [x] 13-12-PLAN.md — Live HUD gauges (shields, energy, LT, CT) and throttled weapon and ident messages; lock message as one constant (wave 7)

**Wave 8** *(blocked on Wave 7 completion)*
- [x] 13-13-PLAN.md — Four view cameras, drawn laser shots, ident frame (wave 8)

**Wave 9** *(blocked on Wave 8 completion)*
- [x] 13-14-PLAN.md — Test-hook shooter, opt-in combat smoke, FIDELITY rows and Key Decisions, phase gates (verify-full only if the owner confirms) (wave 9)

**UI hint**: yes

### Phase 14: NPC Flight and Steering Fidelity Gate

**Goal**: NPC ships fly with Oolite's NPC flight model and native steering behaviours, proven against source-derived oracles, and a bounded spike settles how the differential harness will check the priority-AI port; the larger AI port starts only when the owner accepts the result
**Depends on**: Phase 12 (inert ships on screen, the world step and the AI seam; Phase 10's mass and collision radius on the NPC records)
**Parallel track**: runs beside Phase 13; gates the unscheduled priority-AI phase (former Phase 18)
**Requirements**: AI-01, WORLD-07, AI-11
**Success Criteria** (what must be TRUE):
  1. NPC ships move with Oolite's NPC flight model, using the speed, thrust and roll and pitch limits from their ship records. They steer with each native behaviour: idle, tumble, fly to destination, face, intercept, attack, flee, escort and avoid collision. Each behaviour passes oracle tests run against synthetic `WorldView` and `ShipControl` targets with fixed seeds. The oracle fixtures are authored independently of the port, in a separate plan by a separate agent from the porter. Each fixture is cited to Oolite source lines, with stated numeric tolerances and tick horizons, and a recorded rule converts Oolite's frame-rate-dependent constants to the 1/120 s step. Collect, tractored, mining and land on planet are AI-12 (Future) and are not built.
  2. A 20-seed acceptance run passes against thresholds stated in the phase plan before the run: no stuck ship, no tunnelling through a hull or the station, and no NaN repair.
  3. With traffic opted in, the player sees NPC ships flying in the system: scripted through the test hook, they fly to the station, intercept the player and flee, are drawn within the 50 draw-call budget and shown on the scanner. Their motion replays hash-identically at 30, 60 and 144 Hz. This completes WORLD-07.
  4. A time-boxed, dev-only spike runs selected AILib functions from the original Oolite JavaScript in Node against a stub host, and a check of `dist` asserts it is absent from the build. A fidelity report lists each behaviour's result against its oracle and the spike's outcome. The owner selects the oracle for later ported decisions (the differential harness by default, or source-cited traces only if the owner accepts that fallback), and the choice is recorded as a Key Decision. The unscheduled priority-AI phase is planned only after the owner accepts the report.
  5. At least 90 % of this phase's new behavioural assertions are Vitest scenarios, and any browser spec it adds is an opt-in smoke or journey check with traffic off by default.

**Scope note**: no priority AI exists in this milestone, so a ship flies only when a behaviour is assigned through the test hook; a ship with no AI stays inert (Phase 12 D-02). In normal play NPC ships therefore stay inert after v2.2, and criterion 3 is observable in a `?test=1` traffic-on session. The native steering is Objective-C and cannot run in Node, so the harness covers AILib JavaScript only and native behaviours are checked against source-cited traces.
**Implied work** (flagged at roadmap creation; no requirement text changed):
  - NPC flight fields (a minimum of DATA-15). The nine NPC records carry six fields plus mass and collision radius, so compile the speed, thrust, roll and pitch limits and whatever else the nine behaviours read, from `shipdata.plist` with `like_ship` resolved, behind the strict schema, the golden and the drift gate. Phase 13 adds the energy fields to the same records, so the two phases share one schema and one golden (see the ordering rule).
**Research flag**: High — read-through of the native `behaviour_*` methods (`ShipEntity.m:3700-5173` at the pinned snapshot 7437f22; the dispatch is at 2489-2609), their frame-rate-dependent constants and jitter, that `attack` dispatches into several sub-behaviours (the plan states which are in scope), and the stub-host scope of the harness
**Pitfalls to address**: 6 (`BEHAVIOUR_*` steering fidelity: per-behaviour oracles, 20-seed acceptance), 5 (the harness spike as the only independent check of the later port), 3 (integer tick timers), 4 (NaN in steering), 7 (steering requests queued), 19 (behaviours act only through `ShipControl`), 11 (oracles in Vitest, not the browser)
**Decisions to settle**: the stated acceptance thresholds (stuck, tunnelling, NaN repair) before the run; the time box and stub-host scope of the spike; the oracle choice at the gate (owner)
**Todos**: candidates to fold in by owner decision, not requirements: IN-02 (`aiFaulted` is emitted but nothing records it) and IN-04 (a failed NPC model is never retried, yet the ship still blocks and shows on the scanner), both from `2026-11-14-clear-world-when-arrival-begin-is-refused.md`
**Plans:** 6/19 plans executed in 14 waves (three owner checkpoints: the hash policy in 14-08, the 20-seed acceptance result and any breach resolution in 14-17, the fidelity report and oracle choice in 14-19; revised after the cross-AI reviews of 2026-11-15 (two rounds and a targeted third round on the acceptance design) and plan-check revision 1, which split the first oracle plan and the intercept plan and renumbered the plans in wave order)

Plans:
**Wave 1**
- [x] 14-01-PLAN.md — Oracle I, part 1 (separate agent, no `src/sim/npc` access): fixture schema and contract (leader-refresh and proximity rules, tracking-curve start), reference flight model and navigation maths, flight, idle, tumble, fly-to and face fixtures, the hardened oracle import guard
- [x] 14-02-PLAN.md — Oracle II (separate agent): intercept, flee and attack fixtures (dispatcher, in-scope sub-behaviours, perform entry draws) under a closed-form check rule; attack IN and OUT lists with the corrected EVASIVE reachability and the Shuttle's weapon range 0
- [x] 14-03-PLAN.md — NPC flight fields (speed, roll, pitch, thrust) behind schema, hand-written golden and drift gate; the build refuses keys the reachability analysis assumes absent
- [x] 14-04-PLAN.md — AI-11 dev-only harness spike: AILib and the shuttle AI in `node:vm` (one context per script, timeout on every entry) with a stub host, three deterministic traces, isolation guard, 14-SPIKE.md
- [x] 14-05-PLAN.md — Body radius in the world view: `BodyView.radius` for every body kind and the player's radius argument, with view tests

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 14-06-PLAN.md — Oracle I, part 2 (separate agent, before any `src/sim/npc` file): the frame-rate rule with its tolerance stated first, the 1/60 versus 1/120 grid, avoid-collision, proximity and escort fixtures
- [ ] 14-07-PLAN.md — Pre-committed gates: the post-build `dist` check (three markers, source maps skipped) in `verify`, `verify-full` and the Pages build; the 20-seed acceptance thresholds with their definitions, the flyer start placement with a designed near pass that raises an alert in every seed, the run minimums, the player parking rule, the three hull-crossing classes with their pre-declared escalation, and the empty accepted-crossings list outside the frozen set

**Wave 3** *(blocked on Wave 2 completion)*
- [ ] 14-08-PLAN.md — Steering record on every ship (signed tracking ticks), hash policy by owner decision (checkpoint) recorded in PROJECT.md, snapshot format 3, green intermediate commits

**Wave 4** *(blocked on Wave 3 completion)*
- [ ] 14-09-PLAN.md — Flight model tracer: steerShip with one SteerContext, sticks, attitude, thrust in Oolite's order, perform entry effects, idle, stop-still, tumble; the oracle runner with hook slots and the static oracle manifest; totality property; coverage measured

**Wave 5** *(blocked on Wave 4 completion)*
- [ ] 14-10-PLAN.md — trackDestination, fly to destination, face, new AI events, the rate-rule oracle; coverage measured (the avoid entry and exit move to 14-13)

**Wave 6** *(blocked on Wave 5 completion)*
- [ ] 14-11-PLAN.md — The world step flies AI ships (placeholder integrator replaced), `StepOptions.npcFlight` with one table builder and a mass fallback, re-pinned tests

**Wave 7** *(blocked on Wave 6 completion)*
- [ ] 14-12-PLAN.md — Target sensing with the body radius, the tracking curve started by `setTarget`, trackPrimaryTarget, intercept, target loss

**Wave 8** *(blocked on Wave 7 completion)*
- [ ] 14-13-PLAN.md — The avoid-collision entry and exit with the proximity call sites; flee, jink and evasive action with performFlee's draws

**Wave 9** *(blocked on Wave 8 completion)*
- [ ] 14-14-PLAN.md — Attack dispatcher and in-scope sub-behaviours (weapon range 0 when unarmed), no fire; forced-state dispatch table

**Wave 10** *(blocked on Wave 9 completion)*
- [ ] 14-15-PLAN.md — Proximity pass (live ships, station and player; alerts on steered ships), avoid collision, escort formation with the leader refresh in the world step; every oracle fixture assigned and run

**Wave 11** *(blocked on Wave 10 completion)*
- [ ] 14-16-PLAN.md — Test-only flight-script pilot with one goal metric per script, spawnTestFlyers, Vitest flyers scenario, 30/60/144 Hz replay

**Wave 12** *(blocked on Wave 11 completion)*
- [ ] 14-17-PLAN.md — The 20-seed acceptance run (`npm run test:acceptance`) against the pre-committed thresholds and run minimums, with the seed set-up, detectors, run registration and flight-script pilot frozen first, hull crossings classified in three classes, and an explicit owner checkpoint whose accepted crossing episodes, of any class, are listed in `accepted-crossings.ts`

**Wave 13** *(blocked on Wave 12 completion)*
- [ ] 14-18-PLAN.md — Session and replay flight table, `spawnTestFlyers` hook, opt-in browser smoke (remote specs)

**Wave 14** *(blocked on Wave 13 completion)*
- [ ] 14-19-PLAN.md — Grouped Key Decisions and about twelve FIDELITY rows, fidelity report, Vitest share, validation sign-off, the phase's single remote verify, owner gate (oracle choice) and its Key Decision

### Coverage

10 of 10 v2.2 requirements are mapped, each to exactly one phase (the phase that completes it). The traceability table is in `.planning/REQUIREMENTS.md`.

| Phase | Count | Requirements |
|-------|-------|--------------|
| 13 | 7 | FOUND-17, INPUT-01, CBT-04, CBT-05, CBT-06, CBT-07, DOCK-10 |
| 14 | 3 | AI-01, WORLD-07, AI-11 |

Phase 13 carries 7 of the 10 requirements: they share one player-visible surface (the input bindings, the views, the HUD and F3) and one damage function, and splitting them would leave a half-working weapon system with nothing to verify. Phase 14 carries 3: a high-risk fidelity gate that must stay isolated and independently verifiable.

## Later (unscheduled)

The former Phases 15-23 of the v2.1 Combat & Traffic plan stay unscheduled: destruction, hazards and death (15); bounties, salvage and the escape pod (16); audio and music (17); priority AI, peaceful traffic and the station queue (18); police, legal status and fines (19); pirates, hunters and rescue (20); missiles, ECM and defensive equipment (21); full traffic, asteroids and mining (22); performance hardening with traffic and QUAL-01 (23). They keep their numbers; Phases 13 and 14 moved into v2.2. Their phase details stay in `.planning/milestones/v2.0-ROADMAP.md`, and their requirements, with IDs and the former phase mapping, in `.planning/milestones/v2.0-REQUIREMENTS.md`. When their milestone starts, the milestone workflow re-states them and re-checks them against what Phases 9-14 proved. The parts cut from Phases 9-12 (DATA-12, DATA-14, DATA-15, DATA-16, SAVE-09, SAVE-10, AI-08) are listed under Future Requirements in `.planning/REQUIREMENTS.md`, together with AI-12 (collect, tractored, mining and land on planet, split from AI-01). Phases 13 and 14 consume part of three of them (the ray half of DATA-16, the energy and flight fields of DATA-15, the laser mounts of SAVE-09); the rest stays deferred.

Pending todos outside v2.2, which can run as quick tasks or join a phase by owner decision:

- `2026-11-10-add-planet-and-sun-collision.md` — former Phase 15 (after shields exist, which Phase 13 now delivers).
- `2026-11-11-cargo-purchase-cost-basis-tracking.md` — adds a save field, so it needs its own ordered bump after Phase 13's v4.
- `2026-11-11-terminal-color-palette-setting.md` — a UI setting with no requirement.
- `2026-11-14-make-buoys-block-hyperspace-like-oolite.md` and `2026-11-14-measure-oolite-reference-in-docker.md` — v2.1 follow-ups, no requirement.

## Progress

**Execution order:** v2.2: 13 ∥ 14 (no dependency between them; both build on the shipped Phase 12).

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 8. Session Split and World Core | v2.0 | 16/16 | Complete | 2026-11-13 |
| 9. NPC Content | v2.1 | 5/5 | Complete    | 2026-11-14 |
| 10. Ship Mass | v2.1 | 4/4 | Complete    | 2026-11-14 |
| 11. Minimal Save Schema v3 | v2.1 | 4/4 | Complete    | 2026-11-14 |
| 12. Inert Ships and the World Lifecycle | v2.1 | 14/14 | Complete    | 2026-11-14 |
| 13. Views, Lasers and Shields | v2.2 | 16/16 | Complete    | 2026-11-15 |
| 14. NPC Flight and Steering Fidelity Gate | v2.2 | 6/19 | In Progress | - |

## Backlog

### Phase 999.1: Narrow renderer interface and WebGPU migration estimate (BACKLOG)

**Goal:** Reduce the cost of a possible future move from `THREE.WebGLRenderer` (WebGL2) to `THREE.WebGPURenderer` (WebGPU with its built-in WebGL2 fallback) without migrating anything now. Two parts, both to be scheduled after Phase 8 so they do not collide with the `game-session.ts` split:

1. Type the renderer through a narrow interface (`render`, `setSize`, `info`, plus whatever the probe memory read needs) instead of `THREE.WebGLRenderer`. Current direct uses: `src/app/boot.ts`, `src/app/scene-manager.ts`, `src/app/game-session.ts`, `src/app/probe.ts` (`readMemory`), `src/render/exposure.ts`, and after the split `src/app/session/render-driver.ts`, `probe-publisher.ts`, `context.ts`.
2. Estimate the real migration scope before any decision. Custom GLSL today: `src/render/shaders/planet.glsl.ts`, `src/render/bodies/planet.ts`, `atmosphere.ts` and `nebulae.ts` (`ShaderMaterial` / `onBeforeCompile`). `WebGPURenderer` does not accept GLSL, so each needs a TSL (or WGSL) port. The Playwright probes and WebGL memory counters would also need a backend-neutral path. Optional spike: a throwaway branch with `WebGPURenderer` for one effect only.

**Requirements:** TBD
**Plans:** 0 plans

Constraints and notes:
- The stack decision (Three.js, WebGL2) stays in force; adopting `WebGPURenderer` needs an explicit Key Decisions row in `.planning/PROJECT.md` first.
- Three.js is at 0.187.0. `WebGLRenderer` is WebGL2 only; only `WebGPURenderer` selects a backend (WebGPU, else WebGL2, or `forceWebGL: true`).

Plans:
- [ ] TBD (promote with /gsd-review-backlog when ready)
