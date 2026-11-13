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
- 🚧 **v2.1 World Population Base** — Phases 9-12 (in progress)

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

### 🚧 v2.1 World Population Base (In Progress)

**Milestone goal:** The world can hold real NPC ships: compiled from Oolite's data, given Oolite's mass, regenerated from the save's seed rather than saved, populated deterministically on arrival, and counted by mass lock and jump blockage. No NPC flight, AI or combat yet.

**Scope rule:** the necessary technical minimum, not player-visible features (owner, 2026-11-13: "less, but better"). Each phase is trimmed to what Phase 12 consumes. Phase numbers 9-12 are kept from the former plan so existing references (todos, Key Decisions, review notes) stay valid; the former Phases 13-23 keep their numbers in the unscheduled backlog.

- [ ] **Phase 9: NPC Content** - Ship models and textures of the six populator roles compiled from Oolite with provenance and the record fields the inert world uses, loaded lazily outside the first load
- [ ] **Phase 10: Ship Mass** - Build-time hull octrees give every role ship, the Cobra Mk III and the Coriolis Oolite's mass, and jump blockage uses one recorded Coriolis mass
- [ ] **Phase 11: Minimal Save Schema v3** - The world epoch, world counters and next entity id in schema v3, with an ordered v1 → v2 → v3 migration and leg-anchor semantics
- [ ] **Phase 12: Inert Ships and the World Lifecycle** - A contained AI fault and refused malformed spawns first; then inert ships drawn and on the scanner, mass lock and blockage by ships, the world running behind the chart, cleared at jump commit, repopulated on arrival and regenerated on reload

**Staged verification:** a requirement maps to the phase that completes it. Where an earlier phase delivers part of it, that phase states the part as a staged check: DATA-11 (the record fields in Phase 9, the octree mass that completes it in Phase 10) and SAVE-08 (schema and leg-anchor semantics in Phase 11, the regenerated inert world that completes it in Phase 12).

### Execution Order and Parallel Tracks

Critical path: **9 → 10 → 12**. Phase 11 runs beside Phases 9 and 10. Phase 10's build-time octree port and its Cobra Mk III and Coriolis worked examples use models vendored in v1, so the port can start beside Phase 9; the masses of the role ships need Phase 9's models.

| Phase | Depends on | Can run beside | Must land before |
|-------|------------|----------------|------------------|
| 9. NPC Content | Nothing in v2.1 (extends the v1.0 content pipeline) | 11; the octree port of 10 | 10 (role masses), 12 |
| 10. Ship Mass | 9 (role models) | 9 (port only), 11 | 12 (masses for mass lock and blockage) |
| 11. Minimal Save Schema v3 | Nothing in v2.1 (Phase 8 shipped the world lifecycle) | 9, 10 | 12 (regenerated world) |
| 12. Inert Ships and the World Lifecycle | 9, 10, 11 | — | — |

Ordering rules:

- Phase 12's first plan delivers FOUND-15 (review WR-01) and FOUND-16 (review IN-02) before any populator code is written.
- No NPC motion, AI decisions or combat in this milestone: ships are inert. The AI seam's first real consumer is the containment rule of FOUND-15.
- Browser tests run with traffic off by default (`&traffic=1` is the opt-in, Phase 8 D-10). New behavioural assertions go to Vitest; a new browser spec is an opt-in smoke check that asserts counts, never milliseconds (Pitfalls 11 and 28).
- Schema v3 adds only the world epoch, the world counters and the next entity id. Combat and law fields (SAVE-09) and the cargo cost-basis todo each wait for their own ordered bump, landing with the code that consumes them (Key Decision 2026-11-13).

## Phase Details

### Phase 9: NPC Content
**Goal**: The ships of the six populator roles exist as compiled content: models and textures from the pinned Oolite snapshot with provenance, ship records carrying the fields the inert world uses, and lazy loading that keeps them out of the first load
**Depends on**: Nothing in v2.1 (build-time track; extends the v1.0 content pipeline)
**Parallel track**: Content — runs beside Phase 11, and Phase 10's octree port can start beside it; must land before Phase 10 (role masses) and Phase 12
**Requirements**: DATA-10, DATA-13
**Staged check**: DATA-11 stage 1 (criterion 2, the record fields); DATA-11 completes in Phase 10 with the mass
**Success Criteria** (what must be TRUE):
  1. The content build emits models and WebP textures for the ships of the six populator roles (traders, pirates, police Vipers, hunters, shuttles, scavengers) from the pinned Oolite snapshot. Each vendored file is recorded in `ASSETS.md`, `NOTICE` and `CHECKSUMS.sha256`, and `assets:check` fails on any drift. No sound, music, cargo pod, missile, capsule, wreckage or asteroid is added.
  2. Each of those ship records carries the fields the inert world uses, taken from `shipdata.plist` with `like_ship` resolved: roles, AI name, scan class and model. Worked examples from the plist (at least the Viper, one trader and one pirate) pin them. No combat or flight stats are compiled (DATA-15 is deferred).
  3. NPC models and textures sit outside the first-load set: a cold start of the preview build fetches none of them, a role model can be fetched on demand and decodes, and the measured cold-start transfer stays under the 9,437,184-byte ceiling.
**Research flag**: Medium — the ship list per role comes from `shipdata.plist` `roles`; 17 of 194 ship records have a vendored model today. The former estimate of about 37 more models also counted pods, missiles, capsules, wreckage and asteroids, which are now DATA-14 and deferred
**Pitfalls to address**: 20 (catalogue growth behind the content golden and the drift gate; the client catalogue was trimmed to two entries by quick task 261109-s8k, so extend it with an explicit field list and never hand-edit generated data), 29 (licence and provenance of every new asset), 12 (first-load size: lazy role loading, D11)
**Decisions to settle**: which ship records represent each role (every record that carries the role, or the subset the first populator places); D11 first-load ceiling (raise only on a recorded measurement). D10 (music provenance) leaves this phase with DATA-12 and goes to the audio phase
**Plans**: TBD

### Phase 10: Ship Mass
**Goal**: Every ship the inert world uses has Oolite's mass, computed at build time from an Oolite octree of its hull, and jump blockage uses one recorded Coriolis mass
**Depends on**: Phase 9 (the role models). The build-time octree port and the Cobra Mk III and Coriolis worked examples use models vendored in v1, so they can start beside Phase 9
**Parallel track**: Octree (build time) — the port runs beside Phases 9 and 11; must land before Phase 12 (masses for mass lock and jump blockage)
**Requirements**: DATA-11
**Success Criteria** (what must be TRUE):
  1. The content build constructs an octree for each hull from its vendored `.dat` mesh and computes the ship's mass as Oolite does (`density * 20 * octree volume`, `ShipEntity.m:417-419`). Every role ship from Phase 9, the Cobra Mk III and the Coriolis station carry the mass in their compiled records, which completes DATA-11 together with the Phase 9 fields.
  2. Worked examples for the Cobra Mk III, the Coriolis station and the Viper reproduce Oolite's mass within a stated tolerance, each cited to the Oolite source lines it follows, and the three masses are entered in the constants ledger.
  3. The Coriolis octree mass is compared with the 455,223,200 that Phase 6 took from Oolite's source comment (`ShipEntity.m:12504`). Jump blockage then uses one recorded value, chosen by the owner if the two differ and recorded as a Key Decision, and the existing Coriolis blockage tests pass with it.
  4. The octree exists only at build time: no octree data ships in the bundle, `src/sim` reads only the compiled mass, and a changed mesh or octree rule fails `assets:check` through the mass golden. Runtime ray and hull queries (DATA-16) are not built.
**Research flag**: Medium — a spike must show the build-time octree reproduces Oolite's volume on the Cobra, Coriolis and Viper (octree depth; float32 versus float64 in the volume sum; Oolite stores mass as a `GLfloat`). Only the construction and volume parts of `Octree.m` and `OOMeshToOctreeConverter.m` are ported
**Pitfalls to address**: 14 (mass in the constants ledger with worked examples), 17 (collision shapes; the buoy now has a vendored model and therefore an octree volume), 4 (NaN and degenerate geometry in the build), 12 (no octree data in the first load)
**Decisions to settle**: the Coriolis blockage mass if the octree value differs from 455,223,200 (owner); whether the navigation buoy (model vendored by quick task 261111-g5n) and the dodecahedron and icosahedron stations gain an octree mass now, revisiting the 06-16 option (a) data gaps; the float precision of the volume computation
**Plans**: TBD

### Phase 11: Minimal Save Schema v3
**Goal**: A save records the world state of its leg anchor (the world epoch, the world counters and the next entity id) in a minimal schema v3, older saves migrate in order, and a loaded save continues the same world sequence the session that wrote it would have produced
**Depends on**: Nothing in v2.1 (Phase 8 shipped the world lifecycle, with the epoch kept in session memory)
**Parallel track**: Save — runs beside Phases 9 and 10; must land before Phase 12 (regenerated inert world)
**Requirements**: SAVE-07
**Staged check**: SAVE-08 stage 1 (criterion 4, schema and leg-anchor semantics); SAVE-08 completes in Phase 12
**Success Criteria** (what must be TRUE):
  1. A v1 or v2 save loads in this build, migrated in order v1 → v2 → v3, and resumes where it was. The next autosave writes v3, which adds only the world epoch, the world counters and the next entity id; no combat, law or cargo cost-basis field is added.
  2. A v3 save opened by an older build stays an inert future-version save whose bytes are never cleared or rewritten, and a corrupt v3 blob is copied to `autosave.corrupt` and never read back, as today.
  3. The worst-case v3 save, with every field at its bound, encodes under the 65,536-character cap, proven by a test that builds it.
  4. SAVE-08 stage 1: a v3 save holds no entity, only the epoch, counters and next entity id of its leg anchor (the docked station or the witchpoint arrival). Cold Continue and warm Load restore the saved epoch into the world lifecycle instead of restarting it at 0, so the next launch or arrival derives the same world seed as the session that wrote the save, and the world loaded at the anchor hashes identically to the world a fresh arrival there builds; at this stage that world holds only static bodies. A save taken in flight resumes at its leg anchor, never mid-leg.
**Research flag**: Low — the ordered migration chain, the strict schema, the shared validator and the golden blobs already exist
**Pitfalls to address**: 10 (a minimal bump with ordered migration and a worst-case size test; the former "one bump with every field" rule is superseded by the 2026-11-13 Key Decision), 2 (no closure-held random state in a save)
**Decisions to settle**: persisting the epoch makes the D-02 world-seed derivation one-way, so check the cross-check vector `worldSeedFor(marketSeedForSystem("g0-s7"), 1) = 0x2b4e037c` before the first v3 write; name now every world counter Phase 12's populator needs, because a counter found later costs another bump
**Plans**: TBD

### Phase 12: Inert Ships and the World Lifecycle
**Goal**: Space is no longer empty: inert NPC ships of the six roles are placed deterministically, drawn and on the scanner within budget, and mass-lock the torus and block jumps as in Oolite; the world keeps running behind the chart, is cleared at each jump commit, is repopulated on arrival and is regenerated from the save on reload, on a world step that contains a faulty AI module and refuses malformed spawns
**Depends on**: Phase 9, Phase 10, Phase 11
**Requirements**: FOUND-15, FOUND-16, WORLD-15, WORLD-10, WORLD-11, WORLD-14, WORLD-16, SAVE-08
**First plan**: delivers FOUND-15 (review WR-01) and FOUND-16 (review IN-02) before any populator code
**Success Criteria** (what must be TRUE):
  1. A world-step AI module that throws no longer escapes the step: the entity is handled by a recorded rule, the step completes and the world hash stays deterministic. `spawnEntity` given malformed input returns a refusal with a reason instead of throwing, and a refused spawn leaves the id counter unchanged. Both are proven in Vitest before any populator code lands.
  2. With traffic on, after a launch and after an arrival the player sees inert NPC ships of the six roles placed by a first populator, drawn with their Oolite models and shown on the existing scanner without a new HUD element. Their assets are fetched only when the system needs them, a populated scene stays within the 50 draw-call budget in the container budget test, and `nullAI` ships stay inert as in Oolite.
  3. With an NPC ship inside Oolite's mass-lock range the torus drive does not engage and the message reports a refused attempt, never "Torus disengaged" for a drive that never ran. A jump that completes inside a ship's blockage radius, using its Phase 10 mass, is refused; with the ship outside, both work. With traffic on, launch, manual docking, the docking computer and torus flight behave as in v1, and with traffic off (the browser default) every existing browser test passes unchanged.
  4. Opening the galactic chart in flight no longer freezes the game: the player's flight, the world and a running hyperspace countdown keep advancing behind the chart, as in Oolite. The one existing browser check of the v1 freeze (the D-01 suspension check in `tests/e2e/hyperspace.spec.ts`) is inverted, because WORLD-11 supersedes the freeze.
  5. A hyperspace jump removes every non-static entity at jump commit, and the destination is populated deterministically: the same route and seed give the same ships, ids and world hash. Reloading a save regenerates the inert world at its leg anchor, hashing identically to the world a fresh arrival there builds, which completes SAVE-08.
**Research flag**: Medium — instancing safety of the Cobra material path under `InstancedMesh`; placement for the first populator (where Oolite puts each role's ships; rates and repopulation timing are out of scope); Oolite's mass-lock range with real ships
**Pitfalls to address**: 4 and 7 (a throwing module and malformed spawns: WR-01 and IN-02), 12 (per-tick allocation, O(n²) scans, draw calls; instanced NPC meshes), 24 (mass lock and blockage with real blockers), 22 (the chart no longer freezes the simulation: owner decision D3), 25 (torus, launch and docking under traffic), 17 (static bodies keep fixed ids; no duplicate buoys), 21 (scanner contacts without new HUD elements), 23 (decide the below-24-fps behaviour), 11 (traffic opt-in in browser tests), 2 (per-entity streams for the populator), 10 (regeneration from the anchor, never an entity snapshot)
**Decisions to settle**:
  - D-05 (PROJECT.md, plan 08-15 row): once the populator spawns only with traffic on, the post-populate id counter differs by mode. Settle with the owner whether D-05 keeps that reading or populate burns the same ids with traffic off.
  - The rule that handles an entity whose AI module throws (FOUND-15), recorded as a Key Decision.
  - Any holder of an entity id outside the world (for example a render map keyed by id) needs a Key Decisions row stating how it is cleared at every world boundary (per-world id scope, plan 08-05 row).
  - How inert ships move: hold their placement, or keep Phase 8's constant-speed placeholder integrator (Key Decision (d)).
  - The below-24-fps behaviour (todo); its evidence under load waits for the unscheduled performance phase (former Phase 23).
  - Settled 2026-11-13 (owner): WORLD-11 against WORLD-16, the chart-freeze check in `tests/e2e/hyperspace.spec.ts` is inverted; it is the one sanctioned change to an existing browser test, and WORLD-16 records the exception.
**Todos**: `2026-11-10-keep-simulating-behind-the-chart.md` (closed by WORLD-11); `2026-11-10-fix-torus-refusal-message-under-mass-lock.md` (closed by WORLD-10; refusals become common once ships mass-lock); `2026-11-10-decide-behaviour-below-24-fps.md` (decide here)
**Plans**: TBD
**UI hint**: yes

### Coverage

12 of 12 v2.1 requirements are mapped, each to exactly one phase (the phase that completes it); staged checks are named in the earlier phases' success criteria.

| Phase | Count | Requirements |
|-------|-------|--------------|
| 9 | 2 | DATA-10, DATA-13 |
| 10 | 1 | DATA-11 |
| 11 | 1 | SAVE-07 |
| 12 | 8 | FOUND-15, FOUND-16, WORLD-15, WORLD-10, WORLD-11, WORLD-14, WORLD-16, SAVE-08 |

Phase 12 carries 8 of the 12 requirements by owner direction: it is the first consumer of the content, the mass and the regenerated save. Phases 10 and 11 carry one requirement each as separately verifiable risks (octree fidelity, the save bump).

## Later (unscheduled)

The former Phases 13-23 of the v2.1 Combat & Traffic plan are not scheduled: views, lasers and shields (13); NPC flight and the steering fidelity gate (14); destruction, hazards and death (15); bounties, salvage and the escape pod (16); audio and music (17); priority AI, peaceful traffic and the station queue (18); police, legal status and fines (19); pirates, hunters and rescue (20); missiles, ECM and defensive equipment (21); full traffic, asteroids and mining (22); performance hardening with traffic and QUAL-01 (23). They keep their numbers. Their phase details stay in `.planning/milestones/v2.0-ROADMAP.md`, and their requirements, with IDs and the former phase mapping, in `.planning/milestones/v2.0-REQUIREMENTS.md`. When their milestone starts, the milestone workflow re-states them and re-checks them against what Phases 9-12 proved. The parts cut from Phases 9-12 (DATA-12, DATA-14, DATA-15, DATA-16, SAVE-09, SAVE-10, WORLD-07, AI-08) are listed under Future Requirements in `.planning/REQUIREMENTS.md`.

Pending todos outside v2.1, which can run as quick tasks or join a phase by owner decision:

- `2026-11-10-add-planet-and-sun-collision.md` — former Phase 15 (after shields exist).
- `2026-11-11-cargo-purchase-cost-basis-tracking.md` — adds a save field, so it needs its own ordered bump after v3.
- `2026-11-11-terminal-color-palette-setting.md` — a UI setting with no requirement.

## Progress

**Execution order:** v2.1: (9 ∥ 11) → 10 → 12; Phase 10's octree port may start beside Phase 9.

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 8. Session Split and World Core | v2.0 | 16/16 | Complete | 2026-11-13 |
| 9. NPC Content | v2.1 | 0/TBD | Not started | - |
| 10. Ship Mass | v2.1 | 0/TBD | Not started | - |
| 11. Minimal Save Schema v3 | v2.1 | 0/TBD | Not started | - |
| 12. Inert Ships and the World Lifecycle | v2.1 | 0/TBD | Not started | - |

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
