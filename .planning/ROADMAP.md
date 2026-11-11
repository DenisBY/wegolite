# Roadmap: Wegolite

## Milestones

- ✅ **v1.0 Wegolite v1 Core Loop** — Phases 1-7 (shipped 2026-11-08 as `v0.1.0`; archived 2026-11-10)
  - Full phase details: [.planning/milestones/v1.0-ROADMAP.md](milestones/v1.0-ROADMAP.md)
  - Requirements: [.planning/milestones/v1.0-REQUIREMENTS.md](milestones/v1.0-REQUIREMENTS.md)
  - Open at archive: QUAL-01 (60 fps evidence on the reference desktop), deferred by the owner on 2026-11-08; carried into v2.0 Phase 23
- 🚧 **v2.0 Foundation & Combat** — Phases 8-23 (in progress; roadmap created 2026-11-11, restructured the same day after external review)

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

Total: 73 of 73 plans complete. Phase directories remain in `.planning/phases/`.

</details>

## 🚧 v2.0 — Foundation & Combat

**Milestone goal:** Space stops being empty: traders, pirates and police fly each system with Oolite's AI, the player can fight, die or eject, and their actions change their legal status, built on a new multi-entity world model.

**Sources:** the 60 v2.0 requirements in `.planning/REQUIREMENTS.md`, each mapped to exactly one phase below (the phase that completes it); research in `.planning/research/SUMMARY.md` (with `STACK.md`, `FEATURES.md`, `ARCHITECTURE.md` and `PITFALLS.md`). Pitfall numbers below are the numbers in `PITFALLS.md`. Owner decisions D2-D8 and the v2.0 extras are recorded in PROJECT.md Key Decisions.

**Phase numbering:** continues from v1.0, so v2.0 starts at Phase 8. Decimal phases (for example 15.1) are urgent insertions. The numeric order is a valid execution order: every phase depends only on lower-numbered phases.

**Staged verification:** a requirement maps to the phase that completes it. Where an earlier phase delivers part of it, that phase states the part in its success criteria: SAVE-08 (Phases 11, 12 and 22), DATA-11 (stats in 9, mass in 10), WORLD-07 (inert ships drawn in 12, flying in 14), AI-08 (`nullAI` in 12, `dumbAI` tumble in 16), CBT-07 and CBT-15 (the shared hit rule in 13, police-versus-player fire in 19, pirate, hunter and NPC-versus-NPC fire in 20), AUD-01 (the sound map in 17, scoop, missile and ECM sounds in play in 21).

### Review changes

The first draft had 12 phases (8-19). Four external reviews (Gemini 4 Argon, DeepSeek V4 Pro, GPT-6 Luna, Kimi K3.1 Pro) all returned "approve with changes", and the owner accepted every finding on 2026-11-11 ("accept everything, ~16 phases"). REQUIREMENTS.md grew from 50 to 60 requirements. What changed and why:

- **Octree runtime split from content** (DeepSeek, Kimi). Build-time octrees, ship mass and the runtime hull queries are Phase 10. It can start beside Phase 8 and lands before the first hit test (D4). DATA-11 now completes there.
- **Combat split in two** (all four reviews: the old Phase 12 had 7 requirements across three systems). Phase 13 covers views, lasers, shields, the octree hit rule for any `ShipControl` shooter and docking restoration (DOCK-10). Phase 15 covers destruction, collisions, hazards, alerts and death.
- **Escape/P/R bindings moved earlier** (Gemini, DeepSeek, Kimi). INPUT-01 moves from the old Phase 16 to Phase 13, before the escape pod (Phase 16), so the pause, ident and target-station migration and the browser specs that use those keys settle once.
- **AI split into a fidelity gate and the framework** (all four; PITFALLS 6 says steering must not share a phase with the framework). Phase 14 is NPC flight and native steering with source-cited oracles, stated stuck and tunnelling thresholds, a bounded differential-harness spike and an owner gate. Phase 18 is the priority-AI framework, peaceful roles, the station queue and the manifest. The manifest is now a complete inventory generated from the pinned sources, and the priority-tree structural diff is a criterion (DeepSeek, Kimi). The dev-only harness stays by owner Key Decision, although Kimi and GPT-6 Luna suggested dropping it. Native steering is Objective-C and is checked by source-cited traces, as they asked.
- **Inert-ship AIs and world lifecycle moved to the inert phase** (Gemini, DeepSeek). The new AI-08 (`nullAI`/`dumbAI`, split from AI-06) and the new WORLD-14 (clear at jump commit, repopulate on arrival) land in Phase 12, where those ships first exist. Round 2 below moves AI-08's completion to Phase 16.
- **NPC fire got its own requirement** (GPT-6 Luna, Kimi). A test pilot proves the shared rule, not autonomous fire. The new CBT-15 lands in Phase 20 with NPC-versus-player and NPC-versus-NPC scenarios.
- **Law split in two** (DeepSeek, Kimi). Phase 19 covers police, legal status, fines, fugitive refusal, and the new LAW-07 for contraband on launch and fast-dock fines (Gemini). Phase 20 covers pirates, hunters, demands and rescue, plus the new AI-10 for NPC escape capsules, with an end-to-end rescue scenario (Kimi).
- **SAVE-08 verified in stages, anchor-based** (GPT-6 Luna, Kimi). The schema and anchor stage is in Phase 11, the regenerated inert world in Phase 12, and full traffic in Phase 22, which completes it. The comparison is always against a fresh arrival at the saved leg anchor, never the mid-leg world.
- **Missing table-stakes rules placed** (Gemini). The new DOCK-08 (red alert and the docking-computer lockout), DOCK-09 (slot scrape damage) and DEATH-05 (sun-skimming and atmospheric heat) are in Phase 15. The new DOCK-10 (docking restoration) is in Phase 13. Phase 15 also owns wreckage lifetime and the entity cap (DeepSeek) and the cargo rule for pods. Phase 16 owns tractor scooping (Gemini).
- **Rock hermit AI and the location-generator spike** (Gemini, Kimi). The new AI-09 joins asteroids and mining in Phase 22. A time-boxed location-generator spike is a noted task in Phase 18, so Phase 22 starts with named-system golden vectors.
- **Escape-pod clock pinned** (GPT-6 Luna). DEATH-02 states Oolite's rule, 43,200 s plus 5,400 s times a 7-bit draw (`PlayerEntity.m:5830`), tested at 43,200 s and 729,000 s.
- **Music provenance decided in content, played in audio** (GPT-6 Luna). Phase 9 delivers only the audited decision; Phase 17 plays music if the decision allows it.
- **Audio no longer waits for missiles** (Kimi). Phase 17 starts after Phase 15, when the player combat sounds exist.
- **Hardening has fixed budgets** (DeepSeek, GPT-6 Luna, Kimi). The numeric simulation bound, the container workload, the triangle budget and the reference-desktop protocol are declared before Phase 23 starts (QUAL-10). A breach becomes a follow-up phase; there is no in-phase Web Worker pivot.
- **Kept unchanged:** Phase 8 (owner direction; Kimi's proposed split of Phase 8 was declined), the inert-before-AI order, traffic off by default in browser tests, and anchored saves without NPCs. Gemini's PROJECT.md wording fix was already applied.

**Round 2** (2026-11-11; Gemini 4 Argon approve, DeepSeek V4 Pro, GPT-6 Luna and Kimi K3.1 Pro approve with changes; the owner asked for these targeted fixes, keeping 16 phases and 60/60 coverage):

1. AI-08 no longer covers capsules: Oolite's escape capsule flies under `oolite-shuttleAI.js` (`shipdata.plist`, `oolite_template_escape-capsule`), so capsules stay with AI-10. AI-08 now completes in Phase 16, where pods and wreckage (released from Phase 15) tumble. Phase 12 keeps a staged check that `nullAI` ships stay inert.
2. Phase 16 now depends on Phase 14, because tumbling and tractor scooping are native steering behaviours. `tractored` (`BEHAVIOUR_TRACTORED`, `ShipEntity.m:11217`) is added to AI-01's behaviour list.
3. WORLD-07 ("NPC ships flying") now completes in Phase 14, where ships move. Phase 12 keeps a staged check: inert ships drawn within budget and on the scanner.
4. Phase 14's oracles run against synthetic `WorldView`/`ShipControl` targets with fixed seeds, independent of content that arrives later. The fixtures are authored independently of the port, in a separate plan by a separate agent from the porter, and each is cited to Oolite source lines, so the port cannot validate itself.
5. Phase 19 proves police-versus-player autonomous fire as part of AI-05, as a staged check of CBT-15. Phase 20 completes CBT-15 with the pirate, hunter and NPC-versus-NPC scenarios.
6. Phase 21 now depends on Phase 20: pirates and hunters are the main hostile missile launchers, and criterion 2 names the launcher roles.
7. Phase 21 adds `EQ_ECM` and `EQ_HARDENED_MISSILE` to the F3 visible set (the money-path boundary in `src/sim/player/outfitting.ts`), with purchase, persistence and normal-play firing tests. The F3 ordering rule is updated.
8. AI-07: ported decisions are checked against the oracle the owner selects at the Phase 14 gate. The default is the dev-only differential harness; source-cited traces are used only if the owner accepts that fallback. Phases 14 and 18 say the same.
9. Phase 17 proves the scoop sound with a synthetic event, like the missile and ECM sounds, and still does not depend on Phase 16. Phase 21, the first phase that depends on both 16 and 17, proves all three sounds in play.
10. The critical path is now 8 → 11 → 12 → (13 ∥ 14) → 18 → 19 → 20 → 22 → 23, and Phase 16 depends on 14.
11. The Vitest rule is now an acceptance criterion in every combat and AI phase (13, 14, 15, 16, 18, 19, 20, 21, 22): at least 90 % of new behavioural assertions are Vitest scenarios, and browser specs are opt-in smoke or journey checks only. To keep five criteria per phase, closely related criteria were merged in Phases 13, 14, 15 and 22.

### Phase list

- [ ] **Phase 8: Session Split and World Core** - v1 play unchanged on a multi-entity world: stable ids, seeded streams, a world hash, the typed AI seam and a tick-stepping test hook
- [ ] **Phase 9: NPC Content and Sound Provenance** - Ships, pods, capsules, asteroids and sounds compiled from Oolite with provenance and combat stats, kept out of the first load; an audited music decision
- [ ] **Phase 10: Hull Octrees and Ship Mass** - Build-time octrees and Oolite's mass for every v2.0 hull, and runtime ray and hull queries that match Oolite
- [ ] **Phase 11: Save Schema v3** - One bump with every v2.0 field, ordered migration, and saves that carry only the seed and counters of a leg anchor
- [ ] **Phase 12: Inert Ships and the World Lifecycle** - Inert NPC ships drawn and on the scanner within budget, mass lock and jump blockage by ships, the world running behind the chart, cleared at each jump and repopulated on arrival
- [ ] **Phase 13: Views, Lasers and Shields** - Four views, Oolite's lasers hitting octree hulls, shields and energy banks, docking restoration, and Oolite's keys for eject, pause and ident
- [ ] **Phase 14: NPC Flight and Steering Fidelity Gate** - NPC ships seen flying with Oolite's flight model and native steering, proven against independently authored source-cited oracles; the harness spike and the owner's oracle choice gate the AI port
- [ ] **Phase 15: Destruction, Hazards and Death** - Damage, wreckage and cargo, collisions, slot scrapes, heat, sun-skimming, planet and sun contact, the alert condition, and death
- [ ] **Phase 16: Bounties, Salvage and the Escape Pod** - Bounties and combat rating, tumbling pods and wreckage, tractor scooping and jettison, repairs, and ejecting to continue on Oolite's terms
- [ ] **Phase 17: Audio and Music** - Oolite's player-bound sound effects through Web Audio, autoplay-safe, with volume settings, and music where its provenance allows
- [ ] **Phase 18: Priority AI, Peaceful Traffic and the Station Queue** - The priority-AI framework, traders, shuttles, scavengers and escorts, the simplified station queue, the differential check and the complete AI manifest
- [ ] **Phase 19: Police, Legal Status and Fines** - Offences and legal status, police and station defence, fines, fugitive refusal, contraband on launch and fast-dock fines
- [ ] **Phase 20: Pirates, Hunters and Rescue** - Pirates and hunters, cargo demands, NPC fire against the player and each other, NPC escape capsules and rescue rewards
- [ ] **Phase 21: Missiles, ECM and Defensive Equipment** - Standard and hardened missiles, the missile AI, ECM, energy unit, shield boosters and heat shield, with hardened missiles and the ECM now sold at F3
- [ ] **Phase 22: Full Traffic, Asteroids and Mining** - Oolite's populator rates and repopulation, regenerated traffic on reload, asteroid fields, the rock hermit and its AI, and mining
- [ ] **Phase 23: Performance Hardening with Traffic** - Combat draw-call and triangle budgets, a pre-declared simulation-cost bound, lazy first load, and 60 fps evidence on the reference desktop

### Execution Order and Parallel Tracks

Critical path: **8 → 11 → 12 → (13 ∥ 14) → 18 → 19 → 20 → 22 → 23**. Phases 13 and 14 run side by side after Phase 12, and Phase 18 needs both. The AI track is the riskiest chain, so its fidelity gate (14) starts right after the first inert ships. The combat track continues 13 → 15 → 16. Phase 16 also depends on Phase 14 (tumbling and tractor scooping are native steering), Phase 19 needs 15, and Phase 20 needs 16.

| Track | Phases | Can run beside | Must land before |
|-------|--------|----------------|------------------|
| Critical path | 8 → 11 → 12 → (13 ∥ 14) → 18 → 19 → 20 → 22 → 23 | — | — |
| Content (build time) | 9 | 8, 10, 11 | 12 |
| Octree runtime and mass | 10 | 8, 9, 11 | 12 (ship masses for blockage), 13 (first hit test, D4) |
| Combat | 13 → 15 → 16 (16 also needs 14) | 14 beside 13 and 15 | 18 (needs 13), 19 (needs 15), 20 (needs 16) |
| Audio | 17 | 16, 18, 19, 20 | 21 (missile sounds in play), 23 |
| Missiles and equipment | 21 (after 20) | 22 | 23 |

Ordering rules (research ARCHITECTURE section 12, the PITFALLS ordering constraints and the external reviews):

- The session split comes first and changes no behaviour; the world core follows it in the same phase (Phase 8, unchanged).
- No AI motion (Phase 14) before inert ships are on screen (Phase 12): the first visible ships test the render and budget assumptions.
- The octree runtime (Phase 10) lands before the first hit test (Phase 13), per owner decision D4. Ship masses from it are needed by jump blockage in Phase 12.
- Save v3 (Phase 11) lands before the first new persisted field (the laser mounts of Phase 13) and before the inert world is regenerated from a save (Phase 12).
- The Escape/P/R binding migration (INPUT-01, Phase 13) lands before the escape pod (Phase 16).
- The priority-AI port and the role phases (18-20, 22) start only after the owner accepts the Phase 14 fidelity report and selects the decision oracle. Phase 16 needs Phase 14 because pod and wreckage tumbling and tractor scooping are native steering behaviours.
- Shields and the damage function (Phase 13) come before planet, sun and buoy collisions (Phase 15), per the owner's deferral of the collision todo.
- NPC docking is the simplified queue (owner decision D8). It lands with the trader AI in Phase 18, before any trader docks, and police launches reuse it in Phase 19.
- Audio (Phase 17) starts once the player combat sounds exist (Phase 15). It does not wait for missiles, whose event types are reserved in Phase 8.
- Bulk AI and combat verification runs as Vitest scenarios: at least 90 % of new behavioural assertions. Browser specs stay opt-in smoke and journey coverage, with traffic off by default (Pitfalls 11 and 28). Every combat and AI phase (13, 14, 15, 16, 18, 19, 20, 21, 22) carries this as an acceptance criterion.
- Every phase that adds buyable equipment extends the F3 visible set, which is the money-path boundary (PROJECT.md Key Decisions): lasers in 13, fuel scoop (`EQ_FUEL_SCOOPS`) in 15, escape pod (`EQ_ESCAPE_POD`) in 16, and in 21 the hardened missile (`EQ_HARDENED_MISSILE`), ECM (`EQ_ECM`), energy unit, shield boosters and heat shield. Each addition has purchase, persistence and normal-play tests.

## Phase Details

### Phase 8: Session Split and World Core
**Goal**: The game plays exactly as before, but runs on a multi-entity world model with stable ids, seeded per-entity random streams, a world hash and a typed seam for AI, and tests can step the simulation by ticks
**Depends on**: Nothing in v2.0 (builds on the shipped v1.0 code)
**Parallel track**: Phases 9 and 10 can run beside this phase
**Requirements**: FOUND-10, FOUND-11, FOUND-12, FOUND-13, FOUND-14
**Success Criteria** (what must be TRUE):
  1. A player can start, launch, fly, dock, trade, hyperspace, save and reload exactly as before `src/app/game-session.ts` is split into subsystems: every v1 golden, unit and e2e test passes without regeneration, and the published probe shape is unchanged.
  2. With no NPC present, a recorded flight produces the same world hash as its v1 flight hash, entity ids are never reused (a removed entity's id never comes back), and every simulation pass visits entities in id order.
  3. A world restored from a snapshot and the live world it came from hash identically after 1,000 ticks, and lint rejects `Math.random`, `Date`, wall-clock reads, `for..in` and bare `.sort()` anywhere in `src/sim`.
  4. A scripted test pilot reads the world only through `WorldView` and acts only through `ShipControl`; its state survives a JSON round trip, its timers are integer ticks, and lint rejects an AI module that imports simulation internals.
  5. A browser spec can advance the simulation by N ticks through the test hook and reads the same hash as a Vitest run of the same N ticks, and NPC traffic stays off unless the spec opts in.
**Research flag**: Low — standard patterns (research ARCHITECTURE sections 4-7)
**Pitfalls to address**: 8 (split behind a probe-shape snapshot; re-point `tests/app/redraw-gate.test.ts` and `tests/guards/economy-purity.test.ts`, which read the session file as text), 9 (empty-world hash identity), 1 (id order), 2 (forked `(worldSeed, entityId, purpose)` streams), 3 (integer tick time base), 4 (NaN and transcendentals), 7 (cross-entity events queued, never synchronous), 19 (narrow, read-only AI seam), 17 (fixed ids for planet, sun, station and buoys), 11 and 27 (`advanceTicks`, traffic off by default, a test hook that does not become a god object), 13 (audio event types reserved now, including missile, ECM and scoop events), 10 (the anchored-save decision only)
**Decisions to settle**: D1 world seed policy (SAVE-07's saved world epoch implies the recommended `mix32(marketSeed, epoch)`; confirm in discuss-phase); the fixed id table for static bodies
**Todos**: `2026-11-11-check-ci-after-0-2-0-and-the-shift-c-docking-timeout.md` — FOUND-10's baseline is a green `verify-full`, so the Shift+C docking flake is settled before the split starts
**Plans**: TBD

### Phase 9: NPC Content and Sound Provenance
**Goal**: Every ship, pod, missile, capsule, asteroid and sound v2.0 needs is compiled from the pinned Oolite snapshot with provenance and Oolite's combat stats, kept out of the first load, and each music track has an audited provenance decision
**Depends on**: Nothing in v2.0 (build-time track; extends the v1.0 content pipeline)
**Parallel track**: Content — runs beside Phases 8, 10 and 11; must land before Phase 12
**Requirements**: DATA-10, DATA-12
**Success Criteria** (what must be TRUE):
  1. The content build emits models and WebP textures for every v2.0 role from the pinned Oolite snapshot: traders, pirates, police Vipers, hunters, shuttles, scavengers, missiles, cargo pods, escape capsules, wreckage, asteroids, the rock hermit and the ships it launches. Each is recorded in `ASSETS.md` and `NOTICE`, and `assets:check` fails on any drift.
  2. Every v2.0 ship record carries Oolite's energy, recharge, speed, thrust, weapons, missiles, bounty, roles and AI, checked against worked examples from `shipdata.plist`. This is DATA-11's stat half; the octree mass that completes DATA-11 follows in Phase 10.
  3. Oolite's player-bound sound effects ship with provenance, and the CC BY 3.0 laser sounds are attributed in `ASSETS.md` and `NOTICE`.
  4. Each music track has a recorded provenance decision: it ships with resolved per-file provenance, or it is recorded as blocked and is absent from the build. Playback belongs to Phase 17.
  5. NPC models and sounds are emitted as lazily loaded assets outside the first-load set, so the cold-start transfer stays under the 9,437,184-byte ceiling.
**Research flag**: Medium — about 37 more models are needed; music provenance (D10)
**Pitfalls to address**: 20 (catalogue growth behind the content golden and the drift gate), 29 (licence and provenance of every new asset), 12 (first-load size: lazy role loading, D11), 14 (start the constants ledger with the ship stats)
**Decisions to settle**: D10 music provenance; D11 first-load ceiling (raise only on a recorded measurement)
**Plans**: TBD

### Phase 10: Hull Octrees and Ship Mass
**Goal**: Every v2.0 hull has an Oolite octree built at build time that gives the ship Oolite's mass, and a runtime octree answers ray and hull-against-hull queries the way Oolite does, before the first laser fires
**Depends on**: Nothing to start (the `Octree.m` port and the Cobra and Coriolis oracles use models vendored in v1); the mass of every v2.0 ship needs Phase 9's models
**Parallel track**: Octree — runs beside Phases 8, 9 and 11; must land before Phase 12 (ship masses for jump blockage) and Phase 13 (first hit test, D4)
**Requirements**: DATA-11
**Success Criteria** (what must be TRUE):
  1. The build emits an octree for every v2.0 hull, and each ship's mass is computed as Oolite does (`density * 20 * octree volume`, `ShipEntity.m:417-419`). Worked examples for the Cobra Mk III, the Coriolis station and the Viper match Oolite, which completes DATA-11 together with the stats compiled in Phase 9.
  2. The Coriolis station's octree mass is compared with the 455,223,200 that Phase 6 took from Oolite's source comment (`ShipEntity.m:12504`). The jump-blockage rule then uses one recorded value, chosen by owner decision if the two differ.
  3. Ray and hull-against-hull queries on the runtime octree agree with Oolite's results in oracle tests on the Cobra Mk III, the Coriolis station and the Viper, at the float precision the spike chose and recorded.
**Research flag**: Medium — a spike must show the octree reproduces Oolite's results on the Cobra, Coriolis and Viper (float32 versus float64, octree depth); the runtime port of `Octree.m` is about 400 lines
**Pitfalls to address**: 14 (mass in the constants ledger with worked examples), 17 (collision shapes; the buoy now has a vendored model and therefore an octree volume), 4 (NaN and degenerate geometry in queries), 12 (octree data size kept out of the first load)
**Decisions to settle**: whether the navigation buoy (model vendored by quick task 261111-g5n) and the dodecahedron and icosahedron stations gain an octree mass now, revisiting the 06-16 option (a) data gaps; the octree float precision
**Plans**: TBD

### Phase 11: Save Schema v3
**Goal**: Saves carry every v2.0 field in one schema bump, older saves migrate in order, and a save records only the world seed and counters of its leg anchor, so loading rebuilds the canonical world at that anchor
**Depends on**: Phase 8
**Parallel track**: Save — runs beside Phases 9 and 10; must land before Phase 12 (regenerated inert world) and Phase 13 (laser mounts)
**Requirements**: SAVE-07
**Staged check**: stage 1 of 3 of the save-regeneration requirement, which completes in Phase 22 (criterion 4)
**Success Criteria** (what must be TRUE):
  1. A v1 or v2 save loads in this build, migrated in order to schema v3, and resumes where it was. The next autosave writes v3 with the world epoch, legal status, kills, rating, missile pylons, laser mounts and new-equipment fields at their defaults.
  2. A v3 save opened by an older build stays an inert future-version save whose bytes are never cleared or rewritten, and a corrupt v3 blob is copied aside and never read back, as today.
  3. The worst-case v3 save, with every field at its bound, stays under the 65,536-character cap.
  4. SAVE-08 stage 1 (schema and anchor): a v3 save contains no NPC, only the world seed, epoch, counters and next entity id. A save taken in flight resumes at its leg anchor (the docked station or the witchpoint arrival), never mid-leg. The world loaded from it hashes identically to the world a fresh arrival at that anchor builds; at this stage that world holds only static bodies.
**Research flag**: Low — standard patterns
**Pitfalls to address**: 10 (one bump, ordered migration, worst-case size test), 2 (no closure-held random state in a save), 18 (profile fields shaped for one atomic death and escape-pod update)
**Decisions to settle**: every v2.0 field must be in this one bump. If the owner wants the cargo cost-basis todo (`2026-11-11-cargo-purchase-cost-basis-tracking.md`) in v2.0, its field joins this bump; otherwise it waits for the next one
**Plans**: TBD

### Phase 12: Inert Ships and the World Lifecycle
**Goal**: Space is no longer empty: inert NPC ships appear, drawn and on the scanner within budget, mass-lock the torus and block jumps as in Oolite, and the world keeps running behind the chart, is cleared at each jump and is repopulated deterministically on arrival
**Depends on**: Phase 8, Phase 9, Phase 10, Phase 11
**Requirements**: WORLD-10, WORLD-11, WORLD-14
**Staged checks**: WORLD-07 (criterion 1; completes in Phase 14 when ships move) and AI-08 (criterion 5; completes in Phase 16)
**Success Criteria** (what must be TRUE):
  1. After launch the player sees inert NPC ships, placed by a first populator and drawn with their Oolite models, shown on the scanner. Their assets are fetched only when the system needs them, and a populated scene stays within the 50 draw-call budget in the container budget test.
  2. With an NPC ship inside Oolite's mass-lock range the torus drive does not engage and the refusal message is correct. A jump that completes inside a ship's blockage radius is refused. With the ship outside, both work.
  3. Opening the galactic chart in flight no longer freezes the game: ships keep moving and a running hyperspace countdown keeps counting behind the chart, and the hyperspace browser tests prove it.
  4. A hyperspace jump removes every non-static entity at jump commit, and the destination is populated deterministically: the same route and seed give the same ships, ids and world hash. SAVE-08 stage 2: reloading a save regenerates the same inert world at its anchor, hashing identically to a fresh arrival there.
  5. `nullAI` ships stay inert, as in Oolite. With traffic on, launch, manual docking, the docking computer and torus flight behave as in v1, and with traffic off every existing browser test passes unchanged.
**Research flag**: Medium — instancing safety of the Cobra material path under `InstancedMesh`; placement for the first populator; Oolite's mass-lock range with real ships
**Pitfalls to address**: 12 (per-tick allocation, O(n²) scans, draw calls), 24 (mass lock and blockage with real blockers), 22 (the chart no longer freezes the simulation: owner decision D3), 25 (torus, launch and docking under traffic), 17 (static bodies keep fixed ids; no duplicate buoys), 21 (scanner contacts without new HUD elements), 23 (decide the below-24-fps behaviour), 11 (traffic opt-in in browser tests), 2 (per-entity streams for the populator)
**Todos**: `2026-11-10-keep-simulating-behind-the-chart.md` (closed by WORLD-11); `2026-11-10-fix-torus-refusal-message-under-mass-lock.md` (refusals become common once ships mass-lock); `2026-11-10-decide-behaviour-below-24-fps.md` (decide here; evidence in Phase 23)
**Plans**: TBD
**UI hint**: yes

### Phase 13: Views, Lasers and Shields
**Goal**: The player can aim and fire: four views, Oolite's lasers bought per facing and hitting ships by their octree hulls, shields and energy banks that absorb and recharge, docking that restores them, and Oolite's keys for eject, pause and ident
**Depends on**: Phase 10, Phase 11, Phase 12
**Parallel track**: Phase 14 can run beside this phase
**Requirements**: CBT-04, CBT-05, CBT-06, CBT-07, DOCK-10, INPUT-01
**Success Criteria** (what must be TRUE):
  1. The player can switch between fore, aft, port and starboard views and buy pulse, beam, military and mining lasers per facing at F3, which now offers them. The laser on the current facing fires with Oolite's damage, range, recharge and heat, and an overheated laser cuts out until it cools.
  2. A laser shot hits a ship only where its Oolite octree hull is: a shot inside the bounding sphere but outside the hull misses. A scripted test pilot firing through `ShipControl` hits the player and other ships by the same hit and damage rule. Autonomous NPC fire is CBT-15 in Phase 20.
  3. Hits drain the facing shield and then the energy banks, and both recharge at Oolite's rates. The HUD shows fore and aft shields, energy, laser temperature and cabin temperature. Docking restores shields and energy to full and resets laser and cabin temperature as Oolite does.
  4. P alone pauses, and Escape stays Back inside station sections. Escape (double press) is bound to eject and does nothing until an escape pod is fitted in Phase 16. R engages ident and locks the ship in the sights, and target-station moves to a free key. Every one is rebindable and listed in the controls panel, and the browser specs that pressed Escape to pause or R to target the station are migrated in this phase.
  5. At least 90 % of this phase's new behavioural assertions are Vitest scenarios, and any browser spec it adds is an opt-in smoke or journey check with traffic off by default.
**Scope note**: until Phase 15 a ship's energy floors at zero and nothing is destroyed; the damage function built here is the one Phase 15 extends
**Research flag**: Medium — hit-geometry details (octree ray tests, D4), the combat constants ledger, the HUD layout revision
**Pitfalls to address**: 14 (constants ledger, worked-example tests, FIDELITY rows), 21 (the new gauges and the ident lock deliberately revise the pinned eleven-element HUD layout), 7 (damage events queued, never synchronous), 4 (NaN under damage), 19 (fire is a `ShipControl` command, the same for player and NPC), 26 (message-line flood in a fight), 11 (binding migration across existing browser specs)
**Plans**: TBD
**UI hint**: yes

### Phase 14: NPC Flight and Steering Fidelity Gate
**Goal**: NPC ships fly with Oolite's NPC flight model and native steering behaviours, proven against source-derived oracles, and a bounded spike settles how the differential harness will check the priority-AI port; the larger AI port starts only when the owner accepts the result
**Depends on**: Phase 12 (inert ships on screen; ship stats from Phase 9)
**Parallel track**: runs beside Phases 13 and 15; gates Phase 18 and must land before Phase 16
**Requirements**: AI-01, WORLD-07
**Success Criteria** (what must be TRUE):
  1. NPC ships move with Oolite's NPC flight model, using the speed, thrust and roll and pitch limits from their ship records. They steer with each native behaviour: idle, tumble, fly to destination, face, intercept, attack, flee, escort, avoid collision, collect, tractored, mining and land on planet. Each behaviour passes oracle tests run against synthetic `WorldView` and `ShipControl` targets with fixed seeds, independent of content that arrives later (asteroids and the rock hermit come in Phase 22). The oracle fixtures are authored independently of the port, in a separate plan by a separate agent from the porter. Each fixture is cited to Oolite source lines, with stated numeric tolerances and tick horizons, and a recorded rule converts Oolite's frame-rate-dependent constants to the 1/120 s step.
  2. A 20-seed acceptance run passes against thresholds stated in the phase plan before the run: no stuck ship, no tunnelling through a hull or the station, and no NaN repair.
  3. With traffic opted in, the player sees NPC ships flying in the system: scripted through the test hook, they fly to the station, intercept the player and flee, drawn within the 50 draw-call budget and shown on the scanner. Their motion replays hash-identically at 30, 60 and 144 Hz.
  4. A time-boxed spike runs selected AILib functions from the original Oolite JavaScript in Node against a stub host; it is dev-only, and a check of `dist` asserts it is absent from the build. A fidelity report lists each behaviour's result against its oracle and the spike's outcome. At this gate the owner selects the oracle for ported decisions: the differential harness by default, or source-cited traces only if the owner accepts that fallback. The choice is recorded as a Key Decision, and Phase 18 is planned only after the owner accepts the report.
  5. At least 90 % of this phase's new behavioural assertions are Vitest scenarios, and any browser spec it adds is an opt-in smoke or journey check with traffic off by default.
**Research flag**: High — read-through of the native behaviours (`ShipEntity.m:3700-5136`), their frame-rate-dependent constants and jitter, and the stub-host scope of the harness
**Pitfalls to address**: 6 (`BEHAVIOUR_*` steering fidelity: per-behaviour oracles, 20-seed acceptance), 5 (the harness spike as the only independent check of the later port), 3 (integer tick timers), 4 (NaN in steering), 7 (steering requests queued), 19 (behaviours act only through `ShipControl`), 11 (oracles in Vitest, not the browser)
**Plans**: TBD

### Phase 15: Destruction, Hazards and Death
**Goal**: Fights and flying have consequences: ships take damage and explode into wreckage and cargo, collisions and the docking slot do damage, the sun, the planet and the atmosphere heat or destroy the ship, the alert condition warns the player, and a player at zero energy dies
**Depends on**: Phase 13
**Parallel track**: Phase 14 can run beside this phase
**Requirements**: CBT-08, DEATH-01, DEATH-03, DEATH-05, DOCK-08, DOCK-09
**Success Criteria** (what must be TRUE):
  1. A ship under fire loses equipment to internal hits and explodes into wreckage and cargo pods whose contents follow Oolite's cargo rule. Wreckage and pods are released and expire, an entity cap removes the oldest first (their `dumbAI` tumble lands in Phase 16), and a collision with a ship or a navigation buoy damages both by Oolite's mass and closing-speed rule.
  2. The player dies when energy reaches zero from any cause. Without an escape pod the game is over and the last save can be loaded, through one death path that autosave, pause and the title flow respect.
  3. Cabin temperature rises near the sun and damages the ship when too hot, and contact with the planet or the sun destroys the ship. With a fuel scoop, which F3 now offers, skimming the sun refuels, and flying low through a planet's atmosphere heats the ship, at Oolite's rates.
  4. The HUD shows Oolite's alert condition (green, yellow or red) by its flag rules for hostiles, mass lock, critical energy, hull heat above 90 % and low altitude (`PlayerEntity.m:2976-2993`, `:5122-5140`). The docking computer refuses to engage in red alert (`PlayerEntityControls.m:4677`). Scraping the docking slot damages the ship by Oolite's rule, 5 × step × speed (`DockEntity.m:698`, `:740`), which supersedes v1's damage-free scrape, and a scrape that drains the energy to zero kills the player.
  5. At least 90 % of this phase's new behavioural assertions are Vitest scenarios, and any browser spec it adds is an opt-in smoke or journey check with traffic off by default.
**Research flag**: Medium — collision, heat, alert and sun-skimming constants; wreckage lifetime is low-confidence in research; the buoy collision radius
**Pitfalls to address**: 14 (constants ledger and FIDELITY rows), 17 (planet, sun and buoy collisions only after shields; the buoy collision radius), 18 (one death path; game over against autosave, pause and the title flow), 7 (damage and death events queued), 4 (NaN under collisions), 12 (entity cap and pooled wreckage), 21 (alert indicator within the revised HUD), 26 (message-line flood)
**Todos**: `2026-11-10-add-planet-and-sun-collision.md` (planet, sun and both buoys; decide the buoy collision radius, since the simulation radius is 10 m and the drawn model is about 100 m across)
**Plans**: TBD
**UI hint**: yes

### Phase 16: Bounties, Salvage and the Escape Pod
**Goal**: A fight pays and a lost fight is survivable: kills pay bounties and build a combat rating, cargo can be scooped and jettisoned, damage repaired, and the player can eject and continue on Oolite's terms
**Depends on**: Phase 11, Phase 14 (the native tumble and tractored behaviours), Phase 15 (and Phase 13 for the eject binding)
**Parallel track**: Phases 17 and 18 can run beside this phase
**Requirements**: CBT-11, CBT-12, LAW-04, DEATH-02, AI-08
**Success Criteria** (what must be TRUE):
  1. Killing a ship that carries a bounty pays the bounty at once, every kill counts toward Oolite's combat rating, F5 shows the rating, and both survive a reload.
  2. Cargo pods and wreckage tumble as Oolite's `dumbAI` ships do, and `nullAI` ships stay inert. With a fuel scoop the player scoops cargo pods into the hold, pulled in by Oolite's native tractored behaviour, and is refused when the hold is full. The player can also jettison cargo as pods.
  3. Equipment damaged in a fight is shown as damaged and can be repaired at F3 at Oolite's repair price.
  4. With an escape pod, which F3 now offers, a double press of Escape ejects. The player continues docked at the main station with ship and equipment kept, cargo and legal status wiped and no cash payout. The clock advances by Oolite's rule, 43,200 s plus 5,400 s times a 7-bit draw from a seeded stream (`PlayerEntity.m:5830`), tested at 43,200 s and 729,000 s.
  5. At least 90 % of this phase's new behavioural assertions are Vitest scenarios, and any browser spec it adds is an opt-in smoke or journey check with traffic off by default.
**Scope note**: legal status is set through the test hook until Phase 19 raises it in play
**Research flag**: Medium — the pod's clock jump against the v1 clock model; tractor behaviour; rating thresholds
**Pitfalls to address**: 18 (death, pod and insurance against autosave, pause and the title flow; one atomic profile update), 10 (first use of the v3 fields), 14 (bounty, rating thresholds and repair price from Oolite), 2 (the pod clock draw from a seeded stream)
**Plans**: TBD
**UI hint**: yes

### Phase 17: Audio and Music
**Goal**: The game sounds like Oolite: player-bound sound effects through the Web Audio API, autoplay-safe, with volume settings, and music where its provenance allows
**Depends on**: Phase 9, Phase 15 (the player combat sounds exist); it does not wait for missiles
**Parallel track**: Audio — runs beside Phases 16, 18, 19 and 20
**Requirements**: AUD-01, AUD-02, AUD-03
**Success Criteria** (what must be TRUE):
  1. Lasers, hits, explosions, alerts, docking and hyperspace play Oolite's player-bound sound effects through the Web Audio API, non-positional as in Oolite. The scoop, missile and ECM sounds are mapped to the event types reserved in Phase 8 and proven here with synthetic events, so this phase does not depend on Phase 16. Phase 21, the first phase that depends on both 16 and 17, proves them in play.
  2. No sound plays and no audio error reaches the console before the first user gesture. Audio suspends on pause, on a hidden tab and on WebGL context loss, and resumes with the game.
  3. The settings panel has volume and mute controls that persist across reloads.
  4. If Phase 9 recorded the music provenance as resolved, music plays on the title screen and while the docking computer flies. Otherwise no music ships, and the gap is recorded against D10.
**Research flag**: Medium — audio state under headless browsers in the container; music provenance (D10)
**Pitfalls to address**: 13 (gesture-created context, one suspend owner, `probe.audio`), 29 (music provenance), 12 (decoded size: music streams through a media element rather than decoding), 28 (no timing gates on SwiftShader)
**Plans**: TBD
**UI hint**: yes

### Phase 18: Priority AI, Peaceful Traffic and the Station Queue
**Goal**: NPC ships go about their business under Oolite's priority AI: traders, shuttles, scavengers and escorts fly their roles, flee and call for help, and launch from and dock at the main station. The port is checked against the original AI, and a complete inventory shows what is not yet ported
**Depends on**: Phase 13, Phase 14 (fidelity report accepted by the owner)
**Parallel track**: Phases 16 and 17 can run beside this phase
**Requirements**: AI-02, AI-03, AI-07, WORLD-09
**Success Criteria** (what must be TRUE):
  1. Traders launch from the main station, fly their routes and dock through the simplified station queue, a divergence recorded under D8. Shuttles land on the planet, scavengers collect loose cargo pods, and escorts hold formation on their leader.
  2. A trader the player attacks flees and calls for help as Oolite's trader AI does. The decision comes from the ported `PriorityAIController` (conditions, configurations, behaviours, branches, reconsider timing in integer ticks, event handlers), with scenario goldens per role.
  3. For each ported role, the decisions agree with the oracle the owner selected at the Phase 14 gate: the dev-only differential harness by default, or source-cited traces only if the owner accepted that fallback. The priority-tree structural diff against the pinned sources passes.
  4. A coverage manifest generated from every AI symbol in the pinned sources (`Resources/AIs` and the AILib) lists each symbol as ported, stubbed, or not ported with a reason. CI fails when a symbol is missing from the manifest or unknown to the sources, and the later role phases keep it green.
  5. At least 90 % of this phase's new behavioural assertions are Vitest scenarios, and any browser spec it adds is an opt-in smoke or journey check with traffic off by default.
**Spike (time-boxed, noted task)**: the populator location generators (`LANE_WP`, `LANE_PS`, `PLANET_ORBIT_*`, deterministic RANROT streams) produce named-system golden vectors for Lave, an anarchy and a corporate state, with tolerances. Phase 22 starts from them
**Research flag**: High — the `PriorityAIController` port (`__cache`/`__ltcache`, handlers, reconsider timers) and the harness stub host at the scope Phase 14 chose
**Pitfalls to address**: 5 (AILib drift: generated manifest, priority-tree structural diff, differential harness), 6 (behaviours driven by the framework), 3 (integer tick reconsider timers), 7 (AI events drained in FIFO order), 15 (scope creep: the not-ported list), 16 (the simplified station queue, owner decision D8, recorded as a divergence), 25 (launch and docking under traffic), 11 (role scenarios in Vitest)
**Plans**: TBD

### Phase 19: Police, Legal Status and Fines
**Goal**: The player's actions have legal consequences: offences raise legal status, police and the station respond by status and government, offenders are fined, fugitives are refused, and smuggling and fast docking carry Oolite's penalties
**Depends on**: Phase 15, Phase 18
**Requirements**: AI-05, LAW-01, LAW-02, LAW-03, LAW-07
**Success Criteria** (what must be TRUE):
  1. Attacking or killing ships in sight of police or the main station raises legal status by Oolite's bit-flag rules (`PlayerEntity.m:6024-6040`). F5 shows Clean, Offender or Fugitive, and legal status halves on each hyperspace jump.
  2. Police and the station respond by legal status and government. The station launches defenders through the simplified queue, and police attack offenders and fugitives under their own AI. Police fire hits the player by the shared octree rule; this proves police-versus-player autonomous fire as part of AI-05, a staged check of CBT-15, which completes in Phase 20. An offender is fined at the main station.
  3. A fugitive (legal status above 50) is refused docking instructions and the docking computer at the main station (`PlayerEntityControls.m:4726`).
  4. Launching from the main station with export contraband in the hold raises legal status as Oolite does. Using the docking computer while an offender can incur a fine by Oolite's roll and costs Oolite's extra time (`PlayerEntityControls.m:4743-4750`).
  5. At least 90 % of this phase's new behavioural assertions are Vitest scenarios, and any browser spec it adds is an opt-in smoke or journey check with traffic off by default.
**Research flag**: High — police rules and offence flags (`bounty | 15`, `| 63`), scan-class interplay, the `offenceCommittedNearby` fan-out, and the contraband rule
**Pitfalls to address**: 14 (fines, legal-status thresholds and the fine roll from Oolite), 7 (offence fan-out through queued events), 5 and 6 (police and station trees: scenario goldens and the differential check), 2 (the fine roll from a seeded stream), 15 (no missions or contracts), 10 (legal status persisted in v3)
**Plans**: TBD
**UI hint**: yes

### Phase 20: Pirates, Hunters and Rescue
**Goal**: Space is dangerous and fights have more than two sides: pirates and bounty hunters hunt and demand cargo, NPCs fire on the player and on each other under their own AI, losing NPCs eject capsules, and rescued capsules pay on docking
**Depends on**: Phase 16, Phase 19
**Requirements**: AI-04, AI-10, CBT-15, LAW-05, LAW-06
**Success Criteria** (what must be TRUE):
  1. Pirates and bounty hunters hunt, attack, demand cargo and break off as Oolite's role AIs do, and dumping the demanded cargo makes the pirates break off.
  2. NPC fire under their own AI completes, with scenario goldens for two cases. Against the player: pirates and bounty hunters attack, and their hits land by the octree rule and drain the player's shields. Against each other: hunters and police engage pirates, and a pirate is destroyed by NPC fire.
  3. An NPC losing a fight ejects an escape capsule by Oolite's rules, and the capsule flies as Oolite's does, distinct from a cargo pod.
  4. In one end-to-end scenario an NPC is destroyed, its capsule is scooped, and on docking the player is rewarded by Oolite's rescue rule.
  5. At least 90 % of this phase's new behavioural assertions are Vitest scenarios, and any browser spec it adds is an opt-in smoke or journey check with traffic off by default.
**Research flag**: High — pirate demand and break-off rules, hunter targeting, the capsule ejection conditions and the rescue reward
**Pitfalls to address**: 5 and 6 (pirate and hunter trees: scenario goldens and the differential check), 14 (rescue rewards and demand amounts from Oolite), 7 (combat and ejection events queued), 15 (no missions or contracts), 26 (message-line flood from demands and calls for help)
**Plans**: TBD

### Phase 21: Missiles, ECM and Defensive Equipment
**Goal**: The player and NPCs fight with missiles and ECM, and the player can fit Oolite's energy unit, shield boosters and heat shield
**Depends on**: Phase 14, Phase 15, Phase 17, Phase 19, Phase 20 (pirates and hunters are the main hostile missile launchers)
**Parallel track**: Phase 22 can run beside this phase
**Requirements**: AI-06, CBT-09, CBT-10, CBT-13
**Success Criteria** (what must be TRUE):
  1. F3 now offers hardened missiles (`EQ_HARDENED_MISSILE`) and an ECM (`EQ_ECM`), added to the visible set that is the money-path boundary in `src/sim/player/outfitting.ts`, and both purchases survive a reload. In normal play the player arms a missile, locks it with ident, and fires standard and hardened missiles that home by Oolite's missile AI, and a missile blast damages ships by distance.
  2. Pirates, bounty hunters and police launch missiles at the player under their own AI during an attack.
  3. In normal play the player's ECM destroys standard missiles in range, and hardened missiles resist it as in Oolite, with the resistance drawn from a seeded stream.
  4. The player can buy an energy unit, shield boosters and a heat shield at F3, and each changes energy recharge, shield capacity or heating by Oolite's numbers.
  5. At least 90 % of this phase's new behavioural assertions are Vitest scenarios, and any browser spec it adds is an opt-in smoke or journey check with traffic off by default.
**Staged check (AUD-01)**: in normal play, missile launch, lock, ECM and cargo scooping play the Oolite sounds mapped in Phase 17; this is the first phase that depends on both Phase 16 and Phase 17
**Research flag**: Low — standard patterns; the energy unit, shield booster and heat shield were added after research and need a short Oolite read-through
**Pitfalls to address**: 14 (blast falloff, ECM pulse radii, equipment effects), 2 (the hardened missile's ECM resistance draws from a seeded stream, not `Math.random` as in AILib), 7 (missile and ECM events queued), 21 (missile and ident indicators on the HUD), 26 (message-line flood)
**Plans**: TBD
**UI hint**: yes

### Phase 22: Full Traffic, Asteroids and Mining
**Goal**: Each system is populated and repopulated the way Oolite does it, a reload regenerates the same traffic, asteroid fields and rock hermits appear where Oolite places them, the hermit behaves as Oolite's does, and the player can mine
**Depends on**: Phase 16, Phase 18 (and its location-generator spike), Phase 19, Phase 20
**Parallel track**: Phase 21 can run beside this phase
**Requirements**: WORLD-08, WORLD-12, AI-09, DEATH-04, SAVE-08
**Success Criteria** (what must be TRUE):
  1. Each system gets traders, pirates, police, hunters, shuttles and scavengers at Oolite's rates for its government, economy, tech level and neighbours within 7 LY and 3.5 LY, matching worked examples for Lave, an anarchy and a corporate state.
  2. Traffic is topped up over time by Oolite's repopulation rule. SAVE-08 final stage: reloading a save taken at either anchor regenerates the same full traffic and the same repopulation, hashing identically to a fresh arrival at that anchor after the same number of ticks.
  3. Asteroid fields and a rock hermit appear where Oolite places them, matching the named-system golden vectors from the Phase 18 spike, and the hermit behaves per Oolite's `oolite-rockHermitAI.js`: it launches miners, scavengers and defenders.
  4. The player can break up an asteroid with a mining laser and scoop the fragments.
  5. At least 90 % of this phase's new behavioural assertions are Vitest scenarios, and any browser spec it adds is an opt-in smoke or journey check with traffic off by default.
**Hand-off to Phase 23**: before this phase closes, `docs/PERFORMANCE.md` drafts the full-traffic workload and the numeric budgets that Phase 23's entry gate needs
**Research flag**: Medium — the populator location generators are the least documented part (the Phase 18 spike reduces this); asteroids and rock hermits were added after research
**Pitfalls to address**: 15 (populator scope: no thargoids, missions or contracts), 16 (the station launch and dock queue under full traffic), 24 (mass lock and blockage in a busy system), 25 (torus, launch and docking under full traffic), 12 (traffic cost), 23 (low-fps behaviour under load), 10 (regeneration from the anchor, never an entity snapshot)
**Plans**: TBD

### Phase 23: Performance Hardening with Traffic
**Goal**: A full, fighting system still runs smoothly: draw calls, triangles, simulation cost and first-load size stay within budgets declared before the phase starts, and 60 fps at 1080p is evidenced on the reference desktop by a fixed protocol
**Depends on**: Phase 17, Phase 21, Phase 22
**Entry gate (QUAL-10)**: before this phase is planned, `docs/PERFORMANCE.md` declares, and the owner signs off: the numeric simulation-cost bound per frame (research suggests 4 ms p95 on the reference desktop), the deterministic container workload and its operation-count limit, the populated triangle budget, and the fixed reference-desktop protocol extended with traffic scenes (machine, browsers, 1920x1080 at DPR 1, scene list, warm-up, sample count, metrics and report format). The existing protocol and pass criterion confirmed on 2026-11-08 are the base
**Requirements**: QUAL-01, QUAL-09, QUAL-10
**Success Criteria** (what must be TRUE):
  1. A populated combat scene, with traffic, laser fire, explosions and missiles, stays within the 50 draw-call budget and the declared triangle budget in the container budget test.
  2. With full traffic, the deterministic container workload stays under the declared operation-count limit and the simulation cost per frame on the reference desktop stays under the declared bound. The cold-start transfer stays under the first-load ceiling, with NPC assets loaded lazily.
  3. On the reference desktop at 1080p, run by the fixed protocol, a populated system meets the 60 fps pass criterion (p95 frame time at most 17.5 ms, p99 at most 33.3 ms), and the result is recorded in `docs/PERFORMANCE.md`.
  4. The below-24-fps behaviour decided in Phase 12 is shown to hold in the heaviest declared scene.
**Scope rule**: no Web Worker and no budget change inside this phase. A breached bound is recorded in `docs/PERFORMANCE.md` and becomes a follow-up phase (a decimal insertion), not an in-phase pivot. No timing evidence comes from SwiftShader
**Research flag**: Low — standard patterns
**Pitfalls to address**: 12 (performance with full traffic), 23 (below-24-fps behaviour with heavier frames), 28 (never gate on SwiftShader timing), 11 (suite wall-time budget)
**Todos**: `2026-11-10-decide-behaviour-below-24-fps.md` (the decision from Phase 12 gets its evidence here)
**Plans**: TBD

### Unscheduled Todos

These pending todos are not part of any v2.0 phase. They can run as quick tasks, or join a phase by owner decision.

- `2026-11-11-terminal-color-palette-setting.md` — a UI setting with no v2.0 requirement.
- `2026-11-11-cargo-purchase-cost-basis-tracking.md` — no v2.0 requirement; it adds a save field, so if the owner wants it in v2.0 it joins the single v3 bump in Phase 11.

### Coverage

60 of 60 v2.0 requirements are mapped, each to exactly one phase (the phase that completes it); staged checks are named in the earlier phases' success criteria. The traceability table is in `.planning/REQUIREMENTS.md`.

| Phase | Count | Requirements |
|-------|-------|--------------|
| 8 | 5 | FOUND-10, FOUND-11, FOUND-12, FOUND-13, FOUND-14 |
| 9 | 2 | DATA-10, DATA-12 |
| 10 | 1 | DATA-11 |
| 11 | 1 | SAVE-07 |
| 12 | 3 | WORLD-10, WORLD-11, WORLD-14 |
| 13 | 6 | CBT-04, CBT-05, CBT-06, CBT-07, DOCK-10, INPUT-01 |
| 14 | 2 | AI-01, WORLD-07 |
| 15 | 6 | CBT-08, DEATH-01, DEATH-03, DEATH-05, DOCK-08, DOCK-09 |
| 16 | 5 | CBT-11, CBT-12, LAW-04, DEATH-02, AI-08 |
| 17 | 3 | AUD-01, AUD-02, AUD-03 |
| 18 | 4 | AI-02, AI-03, AI-07, WORLD-09 |
| 19 | 5 | AI-05, LAW-01, LAW-02, LAW-03, LAW-07 |
| 20 | 5 | AI-04, AI-10, CBT-15, LAW-05, LAW-06 |
| 21 | 4 | AI-06, CBT-09, CBT-10, CBT-13 |
| 22 | 5 | WORLD-08, WORLD-12, AI-09, DEATH-04, SAVE-08 |
| 23 | 3 | QUAL-01, QUAL-09, QUAL-10 |

Phases 10 and 11 carry one requirement each by owner direction: each is a separately verifiable risk (octree fidelity, the one save bump) that the reviews asked to isolate. Phase 14 carries AI-01 and the completion of WORLD-07.

## Progress

**Execution order:** 8 → (9 and 10 beside 8) → 11 → 12 → (13 ∥ 14; 14 may continue beside 15) → 15 → 16 → (17 beside 16-20) → 18 → 19 → 20 → (21 ∥ 22) → 23

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 8. Session Split and World Core | v2.0 | 0/TBD | Not started | - |
| 9. NPC Content and Sound Provenance | v2.0 | 0/TBD | Not started | - |
| 10. Hull Octrees and Ship Mass | v2.0 | 0/TBD | Not started | - |
| 11. Save Schema v3 | v2.0 | 0/TBD | Not started | - |
| 12. Inert Ships and the World Lifecycle | v2.0 | 0/TBD | Not started | - |
| 13. Views, Lasers and Shields | v2.0 | 0/TBD | Not started | - |
| 14. NPC Flight and Steering Fidelity Gate | v2.0 | 0/TBD | Not started | - |
| 15. Destruction, Hazards and Death | v2.0 | 0/TBD | Not started | - |
| 16. Bounties, Salvage and the Escape Pod | v2.0 | 0/TBD | Not started | - |
| 17. Audio and Music | v2.0 | 0/TBD | Not started | - |
| 18. Priority AI, Peaceful Traffic and the Station Queue | v2.0 | 0/TBD | Not started | - |
| 19. Police, Legal Status and Fines | v2.0 | 0/TBD | Not started | - |
| 20. Pirates, Hunters and Rescue | v2.0 | 0/TBD | Not started | - |
| 21. Missiles, ECM and Defensive Equipment | v2.0 | 0/TBD | Not started | - |
| 22. Full Traffic, Asteroids and Mining | v2.0 | 0/TBD | Not started | - |
| 23. Performance Hardening with Traffic | v2.0 | 0/TBD | Not started | - |
