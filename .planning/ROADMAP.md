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
- ✅ **v2.2 Weapons and NPC Flight** — Phases 13-14 (shipped 2026-11-16; no release tag, the latest release is `v0.3.0`)
  - Full phase details: [.planning/milestones/v2.2-ROADMAP.md](milestones/v2.2-ROADMAP.md)
  - Requirements: [.planning/milestones/v2.2-REQUIREMENTS.md](milestones/v2.2-REQUIREMENTS.md)
  - Audit: [.planning/milestones/v2.2-MILESTONE-AUDIT.md](milestones/v2.2-MILESTONE-AUDIT.md) (tech_debt: 10/10 requirements, no blockers)
  - Open at archive: lasers and ident do not yet hit stations or buoys (now CBT-17 in Phase 18); Phase 14 review follow-ups (acceptance run in no gate, frozen-detector blind spot, `dt` coupling), all todos
- 🚧 **v2.3 Combat and Death** — Phases 15-20 (in progress; roadmap created 2026-11-16)
  - Requirements: [.planning/REQUIREMENTS.md](REQUIREMENTS.md) (16 requirements: FOUND-18, FOUND-19, DATA-14 to DATA-16, CBT-08, CBT-12, CBT-15 to CBT-18, DEATH-01, DEATH-06, SAVE-09, WORLD-17, QUAL-11)
  - Research: [.planning/research/SUMMARY.md](research/SUMMARY.md)
  - Phase details: below. The former plan for destruction and death is in [.planning/milestones/v2.0-ROADMAP.md](milestones/v2.0-ROADMAP.md) (former Phase 15)

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

<details>
<summary>✅ v2.2 Weapons and NPC Flight (Phases 13-14) — SHIPPED 2026-11-16</summary>

- [x] Phase 13: Views, Lasers and Shields (16/16 plans) — completed 2026-11-15
- [x] Phase 14: NPC Flight and Steering Fidelity Gate (19/19 plans) — completed 2026-11-16

Total: 35 of 35 plans complete. Requirements 10/10. Phase directories now live in `.planning/milestones/v2.2-phases/`.

</details>

### 🚧 v2.3 Combat and Death (In Progress)

**Milestone goal:** Fights have consequences: NPC ships fire lasers, ships are destroyed, and the player can die.

**Scope rule:** the necessary technical minimum, by the owner's standing rule ("less, but better"). Six phases, the top of the 4-6 standard-granularity guide: the 16 requirements fall into six delivery boundaries, each with its own risk and its own gate (the one snapshot bump and the damage ledger, debris and the entity cap, the NPC fire gate, the statics hull table with collisions, equipment damage with the save bump, and the death path). The owner's decisions of 2026-11-16 (equipment damage persists in save v5 with an F3 repair; statics are hit by Oolite's subentity rule) are what keep the last two apart. They are not padded: there is no separate close-out phase (the milestone gates fold into Phase 20), and no phase exists for an internal-quality goal alone. Missiles and ECM, the escape pod, bounties and scooping, sun, planet, heat and alert condition, docking-slot scrape damage, audio, police and pirates, priority AI and traffic, mining and QUAL-01 stay in the backlog.

**Phase numbering:** continues from v2.2 (Phases 13-14); there is no reset. Decimal phases (for example 17.1) are urgent insertions.

- [x] **Phase 15: Damage Ledger and Kills** - A ship at zero energy is destroyed and removed through one damage ledger and one idempotent kill path; the tick boundary never holds a dead entity; the NPC records and entity state carry every field the milestone needs, in one snapshot bump (completed 2026-11-16)
- [x] **Phase 16: Wreckage, Cargo and the Entity Cap** - A destroyed ship explodes into alloy plates, cargo pods and wreckage by Oolite's cargo rule, drawn within the draw-call budget and held under the entity cap of 256, with the debris models vendored from the Oolite checkout (completed 2026-11-17)
- [x] **Phase 17: NPC Fire and Hits on the Player** - NPC ships fire lasers at the player and at each other through Oolite's fire gate when the engine or a test pilot says so; hits on the player pass through shields and energy; NPCs still never attack in ordinary play (completed 2026-11-19)
- [x] **Phase 18: Stations, Buoys and Collisions** - Lasers and ident hit the station and the navigation buoys (buoys can be destroyed); ship-ship and ship-buoy collisions damage both by Oolite's mass and closing-speed rule; the station hull stays damage-free (completed 2026-11-20)
- [x] **Phase 19: Equipment Damage and Repair** - Hits on the player can damage equipment; the damage persists in save schema v5, a damaged item stops counting as installed, and F3 repairs it at Oolite's price (completed 2026-11-22)
- [ ] **Phase 20: Player Death and Game Over** - The player dies at zero energy from any cause while in flight; game over reloads the page and offers Continue only when a loadable save exists, through one death path that autosave, pause and the title flow respect; the milestone's determinism and release gates close here

**Owner decisions in force** (taken 2026-11-16 at the start of the milestone, each recorded in PROJECT.md Key Decisions by the phase named):

| Decision | Recorded and consumed in |
|----------|--------------------------|
| NPC fire comes from the engine and test pilots only; there is no reflex AI and NPCs do not attack in ordinary play | Phase 17 |
| Equipment damage persists in save schema v5 with an F3 repair at Oolite's price (CBT-12 is in scope) | Phase 19 |
| Statics are hit by porting Oolite's subentity rule; the Coriolis octree is measured against the hull caps first | Phase 18 |
| The entity cap stays 256, with the thresholds 243 and 128 (Oolite's 0.95 and 0.50 scaled to it) | Phase 16 |
| Game over is a page reload | Phase 20 |
| Death happens only while `inFlight` | Phase 20 |
| Contact with the station hull stays damage-free | Phase 18 |
| Debris models are vendored from the local Oolite checkout | Phase 16 |
| One snapshot v4 bump with pristine-omit hashing | Phase 15 |

**Staged verification:** CBT-08 is the one staged requirement. Its destruction clauses (wreckage, alloy plates, cargo pods, the entity cap) are proved in Phase 16, and Phase 19 completes it with the internal-damage clause, so it is mapped to Phase 19 (the phase that completes it, as WORLD-07 was in v2.2) and is not checked off before then. QUAL-11 is a standing gate in every phase that touches `src/sim/npc/**`, `src/sim/world/**` or `src/content/generated/ships-npc.json`; it completes in Phase 20, where every kill source exists.

**Changes from the former plan** (`.planning/milestones/v2.0-ROADMAP.md`, former Phases 15, 16, 19 and 20):

- v2.3 takes destruction and player death from the former Phase 15, and the NPC fire gate from the former CBT-15 as an engine capability only. Hazards (sun, planet, heat, alert condition: DEATH-03, DEATH-05, DOCK-08) and docking-slot scrape damage (DOCK-09) stay unscheduled with the escape pod, bounties and scooping of the former Phase 16, and with the police, pirate and priority-AI work that would make NPCs attack in play.
- DATA-14, DATA-15, DATA-16 and SAVE-09 are re-stated for v2.3 in a narrower form than the former Future Requirements (NPC weapon and cargo fields, the four static and debris hulls, the debris assets, and one `damagedEquipment` field). The wider forms stay deferred.
- Recorded decisions this milestone changes, each amended in the phase named, in the same commit as the rule it changes: Phase 15 supersedes N2 ("nothing is destroyed this milestone", an NPC at energy 0 stays alive) and takes the third owner-chosen regeneration of Phase 14's frozen snapshot record, once. Phase 17 amends A7 ("NPC fire shares only the hit and damage rule with the player's laser") and Phase 14's "no weapon fire from steering". Phase 18 supersedes "Statics are neither laser nor ident targets". Phase 20 amends "Floor the player's energy at 0 until a death phase exists" (the floor stays; the death check is added).

### Execution Order and Parallel Tracks

Phase 15 goes first and alone: it designs every new hashed field once. Phases 16 and 17 then have no dependency on each other and can run side by side. Phases 18, 19 and 20 follow in order, each consuming the previous one.

| Phase | Depends on | Can run beside | Must land before |
|-------|------------|----------------|------------------|
| 15. Damage Ledger and Kills | Phase 14 (shipped in v2.2) | none | Everything else in the milestone |
| 16. Wreckage, Cargo and the Entity Cap | 15 | 17 | 18 (the barrel and alloy-plate models its hulls need, and debris from collision kills) |
| 17. NPC Fire and Hits on the Player | 15 (a shot must be able to kill) | 16 | 18 (both extend the hit resolver), 19 (the damage the player takes) |
| 18. Stations, Buoys and Collisions | 15, 16, 17 | none | 19 (collisions are a second damage source), 20 |
| 19. Equipment Damage and Repair | 15, 17, 18 | none | 20 (the death flow reloads the v5 save) |
| 20. Player Death and Game Over | 15 to 19 | none | The milestone close |

Ordering rules:

- Phase 15's first plan designs every new hashed entity field (weapon state, cargo, static health, debris motion) once, bumps the world snapshot once (version 3 to 4) and regenerates the inert Lave golden once (in the plan that first makes a populated ship non-pristine), with a strip-and-rehash proof back to the previous golden. Every field is omitted from the hash while it holds its default (pristine-omit), so a world that never fires, carries cargo or takes damage hashes as it did. No later phase bumps the snapshot version; a missing field is an amendment the owner approves, not a quiet second bump (FOUND-18).
- The one kill path (ledger, `killShip`, second commit, immediate AI drain) is the only way a ship leaves the world through damage. Phase 16 hangs debris off it, Phase 18 routes collisions and buoy destruction through it, and Phase 20 routes the player's death through it (FOUND-19).
- Phases 16 and 17 both extend the world step, the entity state and the hit resolver. Their field set is frozen by Phase 15, so neither bumps a schema, but their seam plans must not share a wave. Whichever lands second rebases on the first.
- The frozen 20-seed acceptance run is a standing gate (QUAL-11, AGENTS.md): rerun `npm run test:acceptance` by hand on the remote test machine after every plan that touches `src/sim/npc/**`, `src/sim/world/**` or `ships-npc.json`, and record the result in the plan's SUMMARY. The thresholds and detectors are frozen; changing them needs the owner's `Detector-change-approved-by-owner` trailer. The harness throws on any flyer death, so fire (Phase 17) and collisions (Phase 18) are gated: a pilot or world opts in, and the frozen worlds stay byte-identical.
- The save format moves once, in Phase 19 (v4 to v5, no migration: alpha, older saves are rejected; worst-case size test). Phase 20 never writes a save on death; the unscheduled cost-basis todo would need its own bump after v5.
- Every phase that adds a hashed or saved field extends the existing sanitiser, the snapshot parser bounds (`src/sim/world/limits.ts` only) and the closed sets (router table, probe shape, HUD). New combat code sits outside AI fault containment, so each new sim function is total on malformed input and covered by a fast-check property.
- Bulk verification is Vitest scenarios: at least 90 % of new behavioural assertions in every phase. Browser specs stay opt-in smoke or journey checks (the NPC-fire hook route, the debris draw-call budget, death-and-reload and the game-over guard), with traffic off by default.
- Gate choice is AGENTS.md's, per plan: pure `src/sim/` plans need `test`, `lint` and `typecheck`; browser-facing code needs `verify`; render, input and persistence changes (Phases 16, 19 and 20) end with `verify-full` on the remote test machine; from Phase 19 on it runs automatically at the phase gate, with no owner confirmation step (owner, 2026-11-21).

## Phase Details

### Phase 15: Damage Ledger and Kills

**Goal**: A ship whose energy reaches zero is destroyed and removed through one damage ledger and one idempotent kill path, the world never holds a dead entity at a tick boundary, and the NPC records and entity state carry every field the rest of the milestone needs, arriving in one snapshot bump
**Depends on**: Phase 14 (shipped in v2.2). It builds on Phase 13's damage function and energy banks, Phase 12's world step and Phase 14's frozen steering record
**Parallel track**: none; Phases 16 and 17 start after it
**Requirements**: FOUND-18, FOUND-19, DATA-14
**First plan**: the one entity-field design (FOUND-18): the weapon, cargo, static-health and debris-motion fields, their hash segments, the snapshot v4 bump and the one golden regeneration, taken in the plan that first makes a populated ship non-pristine (15-03, the cargo-at-spawn rule)
**Success Criteria** (what must be TRUE):
  1. A ship that the player's laser, or a scripted pilot's, brings to zero energy is destroyed on that tick: it leaves the 3D view and the scanner, an ident lock on it ends with its message, and any ship that had it as a target is told of it by an AI event delivered before the tick ends. The station and the player are never removed by this path (the station only absorbs hits in Phase 18, the player's death is Phase 20, and the player's energy still floors at zero until then).
  2. Every damage source goes through one ledger applied after the world step, and a world snapshot taken at any tick boundary holds no dead entity and no queued AI event. A kill on the tick a ship spawns, two ships that kill each other on one tick, and a repeated kill request each leave a snapshot that round-trips, proven by a property test over random fights.
  3. The new hashed entity fields (weapon state, cargo, static health, debris motion) arrive in one snapshot v4 bump and one regeneration of the inert Lave golden. Removing the new segment re-hashes the new golden to the old one, worlds that never fire, carry cargo or take damage hash as before (pristine-omit), and the hash replays equal at 30, 60 and 144 Hz.
  4. The nine NPC records carry weapon facings, `likely_cargo`, `max_cargo`, `fragment_chance` and `explosion_type`, compiled from Oolite's `shipdata.plist` with `like_ship` resolved and with provenance, behind the strict schema, the golden and the content drift gate.

**Scope note**: nothing explodes yet. A destroyed ship simply disappears; the explosion, wreckage, alloy plates and pods are Phase 16. A kill needs a damage source that can reach zero, which the player's laser and the test shooter already provide (Phase 13), so the phase is verified with them and needs no NPC fire.
**Standing gate**: QUAL-11. The plans that change `src/sim/world/**` and `ships-npc.json` are followed by the by-hand 20-seed run, 21 of 21, recorded in their SUMMARY.
**Implied work** (flagged at roadmap creation; no requirement text changed, and the plan-phase step decides the exact split):
  - New event kinds and payloads for destruction, removal and the lost ident lock, which widen the closed sets (event router table, probe shape) by design.
  - Existing tests and goldens that encode "nothing is destroyed" (a ship's energy floors at zero and the ship stays): list them, amend each pin and say why, rather than let them fail one by one.
  - The Key Decisions record of the field set: Phase 14's frozen steering record gets its third owner-chosen regeneration, with the strip-and-rehash proof, and the bounds live in `limits.ts` only.
**Research flag**: Low. The integration points (tick order, record shapes, the snapshot and the event router) were read in the tree during research; the design choices left are the debris motion model and the event payloads.
**Pitfalls to address** (research PITFALLS.md): 3 (every hashed field costs a bump: one bump, strip-and-rehash, pristine-omit), 4 (the frozen acceptance run throws on any flyer death), 5 (a kill after the commit leaves a dead entity at the boundary: second commit, idempotent `killShip`, a property test), 6 (old pins encode "nothing is destroyed"), 16 (new code is outside AI fault containment: totality), 22 (closed sets: router table, probe shape)
**Decisions to settle**: the debris motion model (heading and speed against a bounded velocity vector), decided in the first plan so a later phase never bumps the snapshot; the event kinds and payloads; the field bounds
**Todos**: none
**Plans**: 6/6 plans complete in 6 waves

Plans:
**Wave 1**
- [x] 15-01-PLAN.md — DATA-14: compile weapon facings, `likely_cargo`, `max_cargo`, `fragment_chance` and `explosion_type` into the NPC record (schema, golden, drift gate, NOTICE); carries the phase-wide D-11 inventory (wave 1)

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 15-02-PLAN.md — FOUND-18: the v4 field set (velocity, weapon with missed shots, cargo, per-world static health), pristine-omit hashing, snapshot version 4, sanitiser and bounds; Lave golden unchanged (wave 2)

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 15-03-PLAN.md — FOUND-18: cargo count at spawn from a stateless stream, the one Lave golden regeneration with the three-link strip proof, Key Decisions row; OD-1 accepted by the owner 2026-11-16 (wave 3)

**Wave 4** *(blocked on Wave 3 completion)*
- [x] 15-04-PLAN.md — FOUND-19: damage ledger, idempotent `killShip` (a dead or missing killer is `NO_ENTITY`), second commit; supersedes N2; cadence fight and browser kill step (wave 4)

**Wave 5** *(blocked on Wave 4 completion)*
- [x] 15-05-PLAN.md — FOUND-19: kill notifications by `drainAiEventsNow`, post-drain repair, survivors holding the dead id; OD-2 accepted by the owner 2026-11-16 (wave 5)

**Wave 6** *(blocked on Wave 5 completion)*
- [x] 15-06-PLAN.md — FOUND-19, FOUND-18: random-fight property test, kill cross-cadence scenario, 1,000-tick resume across a kill (wave 6)

### Phase 16: Wreckage, Cargo and the Entity Cap

**Goal**: A destroyed ship explodes into what Oolite leaves behind, alloy plates, cargo pods and wreckage, drawn within the draw-call budget and held under the entity cap, so a fight leaves a field of drifting debris without starving the world of room for ships
**Depends on**: Phase 15 (the ledger, the kill path, the debris and cargo entity fields and the compiled cargo data)
**Carry-over from Phase 15 reviews (2026-11-16)**: widen the router table for `shipDestroyed` without leaking the entity id (entity-id-scope guard); check for a doubled hit sound over the explosion, because a ship doomed earlier in the tick still gets `shipHit` (fix: skip it in `applyLedger` for a target already lethal); check Oolite's escort release when a leader dies (escorts keep their last destination today); the player kill tally (`ship_kills`) stays unmodelled, deferred with LAW-*.
**Parallel track**: Phase 17 can run beside this phase
**Requirements**: DATA-16, WORLD-17
**Staged**: CBT-08 (destruction clauses: wreckage, alloy plates, cargo pods, the entity cap). The requirement is mapped to Phase 19, which completes it with the internal-damage clause (see "Staged verification")
**Success Criteria** (what must be TRUE):
  1. A ship destroyed by the player's laser or a scripted pilot's explodes and leaves alloy plates, cargo pods and wreckage by Oolite's cargo rule (the alloy count from the ship's mass, up to three wrecks, the pod chance with its 15-pod limit, and the blast pushing neighbours), each piece drifting on its own path. The same seed and the same kill give the same debris, at any frame rate.
  2. The entity cap holds in a crowded fight. Debris is shed above Oolite's thresholds scaled to the cap of 256 (243 and 128, replacing its 0.95 and 0.50 of 2,048), a kill still resolves when the world refuses a spawn, no ship fails to spawn or die because of debris, and Oolite's frame-time term is dropped and recorded so the outcome never depends on the frame rate.
  3. The explosion, the debris, the pods and the flashes are drawn in a fixed number of draw calls however many pieces exist (instanced layers within the 50-call budget), live only in the render layer, and never change the world hash: the hash is equal with the layers on or off, and at 30, 60 and 144 Hz.
  4. The debris models and textures (wreckage, the alloy plate, the cargo barrel and the explosion particle sprites) are vendored from the local Oolite checkout through `scripts/vendor-oolite.sh` with `CHECKSUMS.sha256`, `ASSETS.md` and `NOTICE` rows, load lazily after the first frame, and keep the cold start under the 9,437,184-byte ceiling.

**Scope note**: no scooping exists in this milestone (CBT-11 is unscheduled). Pods and plates drift, can be shot, and are rammed in Phase 18; nothing picks them up. A pod carries a count, not a new commodity field (research PITFALLS 14).
**Implied work** (flagged at roadmap creation; no requirement text changed):
  - `explosions.plist` compiled to a render-side `explosions.json` behind the drift gate, and the per-hull cargo source for the nine ships.
**Standing gate**: QUAL-11 after the plans that change `src/sim/world/**`.
**Research flag**: Medium. Read `becomeExplosion` (`ShipEntity.m` 7891-8140) and `releaseCargoPodsDebris` (7814-7882) end to end before planning; the wreckage lifetime (about `E/1000` s) is LOW confidence, so pin the formula, mark it LOW in FIDELITY.md and add it to the deferred todo `2026-11-14-measure-oolite-reference-in-docker.md`; confirm the per-hull cargo and what the NPC cargo source is
**Pitfalls to address**: 8 (debris determinism: own-stream draws, no frame-time gate, draw even when `spawnEntity` refuses at the cap, fixed spawn order), 9 (the motion model), 14 (pod contents: no new hashed commodity field), 17 (the cap, scans and instanced render with hundreds of pieces), 20 (wreckage details read wrong at first look: quoted lines, FIDELITY rows), 25 (provenance of every new asset)
**Decisions to settle**: the wreckage lifetime formula; what a pod holds (a count, per PITFALLS 14, against a market-driven commodity); the debris spawn order and the dropped frame-time term, both recorded in Key Decisions and FIDELITY.md
**Todos**: `2026-11-14-measure-oolite-reference-in-docker.md` (the wreckage lifetime joins it)
**Plans**: 9/9 plans complete in 7 waves

Plans:
**Wave 1**
- [x] 16-01-PLAN.md — DATA-16: vendor the barrel, alloy and five wreck models and the explosion particle textures from the local Oolite checkout through a verified local-source mode of `scripts/vendor-oolite.sh` (owner checkpoint for the real run, OC-7)
- [x] 16-02-PLAN.md — WORLD-17, CBT-08 staged: cargo pods from the dying ship's own stream, drift, the per-piece cap at 243 (Phase 17 seam plan)

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 16-03-PLAN.md — DATA-16: debris GLBs (legacy wreck textures), the lazy `ships-debris.json` catalogue with build-time masses, radii and tumble rates
- [x] 16-04-PLAN.md — WORLD-17, CBT-08 staged: wreckage with Oolite's burn-down, the alloy plate, the blast on debris only, the test pilot's scan filter, 30/60/144 Hz equality and the boundary property (Phase 17 seam plan)

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 16-05-PLAN.md — DATA-16, WORLD-17: `explosions.json` and the particle textures, the NPC hull `boundingBox`

**Wave 4** *(blocked on Wave 3 completion)*
- [x] 16-06-PLAN.md — WORLD-17, DATA-16: the catalogues in the live session, `CombatOptions.debris` through one builder, the hook shooter's cargo argument, the Node twin's pinned hash

**Wave 5** *(blocked on Wave 4 completion)*
- [x] 16-07-PLAN.md — WORLD-17: `shipDestroyed` routed without the id; the pooled instanced explosion cloud and flash

**Wave 6** *(blocked on Wave 5 completion)*
- [x] 16-08-PLAN.md — WORLD-17: id-free debris contacts and the instanced debris layer with render-side tumble

**Wave 7** *(blocked on Wave 6 completion)*
- [x] 16-09-PLAN.md — WORLD-17, DATA-16: browser proof (draw calls, hash with the layers on, lazy cold start, asset decode), Key Decisions, FIDELITY, PERFORMANCE, todo, validation sign-off, `verify-full` after the owner's go (OC-6)

### Phase 17: NPC Fire and Hits on the Player

**Goal**: NPC ships fire lasers at the player and at each other through Oolite's fire gate when the engine or a test pilot tells them to, hits on the player pass through the shields and the energy bank as Oolite's do, and in ordinary play NPCs still never attack
**Carry-over from Phase 16 UAT (2026-11-17, owner decision OC-5 / D16-14)**: if this phase adds the first consumer of `shipHit` (a hit flash, screen shake or sound on the player), skip `shipHit` for a target already lethal in the same tick, per the todo `2026-11-17-skip-shiphit-for-a-doomed-target.md`; with no consumer in this phase the todo stays pending.
**Depends on**: Phase 15 (a shot must be able to kill). It builds on Phase 13's shared hit and damage rule and Phase 14's attack behaviours
**Carry-over from Phase 15 reviews (2026-11-16)**: NPC-vs-NPC fire makes the same-tick mutual kill reachable; restate the divergence from Oolite (credit is asymmetric by id) in this phase's decision row. Before a second AI module gains an `onEvent`, decide whether to narrow the kill-time `shipTargetLost` to the killer only (needs an owner edit to Phase 15 criterion 1); today's only handler is idempotent. Escort release (checked against Oolite 2026-11-16): an escort polls `escortCheckMother` (`escortAI.plist`, `ShipEntityAI.m:1591`) every 2.5 to 15 s, and when the leader is gone it resets its owner and group, gets `NOT_ESCORTING`, goes to `LOOK_FOR_BUSINESS` and scans for a new formation leader (`scanForFormationLeader`). Wegolite has no port of it: a follower of a dead leader flies at max speed to its last destination and hovers there (`kill.ts`, `behaviourFormationFormUp`). No escorts are spawned by `populate.ts` or `traffic.ts` today, so there is no gameplay effect; port `escortCheckMother` in whichever phase first spawns escorts.
**Parallel track**: Phase 16 can run beside this phase
**Requirements**: CBT-15, CBT-16
**Success Criteria** (what must be TRUE):
  1. A scripted pilot, or the shooter the `?test=1` hook spawns, fires only when Oolite's gate allows it: not while the weapon is hot (it cuts out at the temperature limit and cooling lets it fire again), not without the energy for the shot, not before the shot timer (whole ticks) has run out, and not out of range or off target. The rate of fire is Oolite's and is the same at 30, 60 and 144 Hz.
  2. NPC shots hit the player through the facing shield and then the energy bank with Oolite's numbers, and hit other NPC ships by the same octree hull rule. The hook-spawned fight is where the player watches the shields and energy fall (the opt-in browser spec), while an NPC shot to zero energy by another and its destruction through Phase 15's kill path are proved in Vitest scenarios (`tests/sim/combat/npc-vs-npc.scenario.test.ts`, D-03) (wording tightened to D-03: owner, UAT test 2, 2026-11-19).
  3. In ordinary play NPCs never fire: with no hook and no test pilot the world's ships stay inert, no new firing decision source ships in the production bundle, and a Key Decisions row records that the decision to fire comes from the engine and test pilots only. One opt-in browser spec proves the whole route, from a hook-spawned shooter to the shield and energy readout on the HUD.
  4. Phase 14's behaviour is unchanged: fire stays off unless a pilot opts in, so existing flight-script worlds replay byte-identically, and the new source-cited fire-gate fixtures, authored before the port by a separate agent with no access to `src/sim/npc`, all pass.

**Scope note**: owner decision of 2026-11-16: no reflex AI. A ship the player shoots does not retaliate or turn evasive, and the 12 populated ships keep `ai: null`. The research's wake-on-hit option and the priority-AI slice are out. The player's energy still floors at zero here; the death check is Phase 20.
**Implied work** (flagged at roadmap creation; no requirement text changed):
  - `SteerContext.fire`, the cut `fireMainWeapon:` call sites and hot-weapon branches of Phase 14's attack behaviours, and weapon temperature and the shot timer quantised to whole ticks (Phase 13 gave NPC shots no gate; steering calling fire at 120 Hz would otherwise be spam).
**Standing gate**: QUAL-11 after every plan that changes `src/sim/npc/**`: the by-hand 20-seed run, 21 of 21.
**Research flag**: High. Read the fire gate end to end (`fireMainWeapon` and `fireWeapon`, `ShipEntity.m` 9930-10010; `fireLaserShotInDirection`, 10360-10440), how `onTarget` is decided per attack behaviour, and how the hot-weapon branches change attacker trajectories; extend the oracle first, with fixtures written without reading `src/sim/npc`
**Pitfalls to address**: 1 (the decision source: resolved by the owner decision above, and tested through the whole route from the hook spawn), 2 (the fire gate), 4 (the frozen acceptance run), 15 (dead-target handling in each behaviour), 16 (totality)
**Decisions to settle**: how weapon temperature and `shot_time` quantise to ticks; which attack behaviours call fire and how `onTarget` maps onto the Phase 14 steering port; the name and place of the pilot's opt-in
**Todos**: `2026-11-16-phase-14-review-followups.md` (the IN-04 manual rerun rule is in force; IN-05, the detector blind spot, needs the owner trailer and is not part of this phase)
**Plans**: 13/13 plans complete; 10 plans in 8 waves plus 3 UAT gap-closure plans (G-17-1, G-17-4) in 3 waves

Plans:
**Wave 1**
- [x] 17-01-PLAN.md — CBT-15, criterion 4: independent oracle (separate agent, no access to `src/sim/npc`) for the fire gate's order and one-draw rule, onTarget with the live `missedShots` aim term, float32 heat and cooling, and the frame-rate rows; `COVERAGE.md`
- [x] 17-02-PLAN.md — CBT-15, criterion 4: independent oracle for the fire sites, the hot-weapon branches and the `missedShots` feedback in the attack behaviours
- [x] 17-03-PLAN.md — D-13 tripwires (kill credit, `shipHit`, a second `onEvent`) with their todos, and the decision-source guard (advisor decision 3)

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 17-04-PLAN.md — CBT-15: the pure NPC fire gate `src/sim/npc/fire.ts`, both `missedShots` readers, the gate and aim-feedback fixtures against the port, totality properties

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 17-05-PLAN.md — CBT-15, CBT-16: every NPC shot through the gate at the drain, cooling and `missedShots`, the per-tick hook shooter, the D-08 inventory and the A7 amendment, the Node twin then the browser spec re-pinned (shield and energy readout)

**Wave 4** *(blocked on Wave 3 completion)*
- [x] 17-06-PLAN.md — CBT-15: `SteerContext.fire` and the `fire` opt-in on the flight-script pilot, the evasive, sniper (restructured), six and fly-to fire sites, exclusive routes, byte-identical without the opt-in

**Wave 5** *(blocked on Wave 4 completion)*
- [x] 17-07-PLAN.md — CBT-15: the live temperature in the dispatcher, break-off and the hot-weapon tails, the float32 USABLE, the divergences row

**Wave 6** *(blocked on Wave 5 completion)*
- [x] 17-08-PLAN.md — CBT-15, criterion 4: the fire-site and hot-branch fixtures against the port (oracle runner weapon state and fire recorder, the fire-site consumer, an empty pending manifest)

**Wave 7** *(blocked on Wave 6 completion)*
- [x] 17-09-PLAN.md — CBT-15, CBT-16: NPC-versus-NPC fire and kills through the kill path, the same-tick mutual kill pinned (D-10 row), 30/60/144 Hz equality and the snapshot round trip, properties

**Wave 8** *(blocked on Wave 7 completion)*
- [x] 17-10-PLAN.md — CBT-15, CBT-16: the `?test=1` attacker hook (D-02), the decision-source Key Decisions row (criterion 3), CHANGELOG, validation sign-off, owner questions (the D-07 period first), the phase's one remote `verify`

**UAT gap closure** (2026-11-19; gap-closure waves restart at 1)

**Gap wave 1**
- [x] 17-11-PLAN.md — G-17-1, CBT-15, criterion 4: the independent fire oracle encodes the owner's revised D-07 (literal shot frames 60, 13, 301, 13 from `literalShotFrames`); the rule-dependent gate and heat fixtures re-derived by the oracle, the shot-timer row, the D-07 note (separate agent, no access to `src/sim`)

**Gap wave 2** *(blocked on gap wave 1 completion)*
- [x] 17-12-PLAN.md — G-17-1, CBT-15, CBT-16: `npcRechargeTicks` at the literal frame counts, the period inventory amended once, the Node twin then the browser spec re-pinned, the A7 and NPC fire gate rows, CHANGELOG, the remote combat spec and the QUAL-11 run

**Gap wave 3** *(blocked on gap wave 2 completion)*
- [x] 17-13-PLAN.md — G-17-4, CBT-15, CBT-16: the HUD probe publishes the drawn FWD/AFT shield bars and E1-E4 banks, the probe shape pinned, the combat spec asserts the drawn gauges fall; criterion 2 wording (UAT test 2) and the decision-source row's owner acceptance (UAT test 3); the remote `verify` and combat spec

### Phase 18: Stations, Buoys and Collisions

**Goal**: The Coriolis station and the navigation buoys become real targets and obstacles: lasers and ident hit them, buoys hold damage and can be destroyed, and ships that touch each other or a buoy damage both by Oolite's mass and closing-speed rule, while contact with the station hull stays damage-free
**Depends on**: Phase 15 (the ledger), Phase 16 (the barrel and alloy-plate models for their hulls, and debris from collision kills) and Phase 17 (both extend the hit resolver, and NPC shots use the same candidates)
**Carry-over from Phase 15 reviews (2026-11-16)**: `HitRecord.sourcePosition` is copied at queue time (Phase 15 close-out); keep it a copy when collision records are queued mid-step.
**Carry-over from Phase 16 UAT (2026-11-17, owner decision OC-3 / D16-03)**: pods, plates and wrecks are drift-only in Phase 16, so they are not laser, ident, ram, mass-lock or jump-blockage candidates yet. This phase gives the barrel and the alloy plate their hulls (criterion 1) and must also make cargo pods and plates shootable and ramming candidates (laser hits, octree-against-octree contact, once per contact, destroyed at zero energy); decide in the Key Decisions row whether wrecks get a hull or stay non-colliding (Oolite: wrecks never collide), and whether ident and mass-lock see debris. Add the matching success criterion when this phase is planned.
**Carry-over from Phase 16 UAT (2026-11-17, owner decision OC-4 / D16-04)**: the explosion blast pushes debris only in Phase 16. Ships have no drift integration until this phase's collision work, so decide here whether to port the blast onto ships and the player. Oolite's own push is at most 0.027 m/s on a ship and under 0.002 m/s on the player, so the expected answer is to leave it out and say so in the Key Decisions row; port it only if a visible effect appears once ships drift.
**Parallel track**: none
**Requirements**: DATA-15, CBT-17, CBT-18
**First plan**: measure the Coriolis octree (with its subentities) in the `assets` container against the hull caps, before any hit or collision code relies on it
**Success Criteria** (what must be TRUE):
  1. Settled first: the Coriolis octree is measured against the hull caps (16,384 nodes, 200,000 bytes) and either fits the existing artifact or ships as its own lazily loaded file, and the choice is a Key Decision. Hulls for the Coriolis, the buoy, the cargo barrel and the alloy plate are built from Oolite's octrees with provenance, behind the strict schema, a digest golden and the drift gate.
  2. A laser stops at what it hits. A shot at a ship behind the station hits the station and is absorbed (the station is never destroyed), a shot at a buoy damages it (250 energy), and a buoy shot to zero energy is destroyed and removed from the 3D view and the scanner. The station's subentities answer as Oolite's subentity rule decides, proven at the dock mouth by octree fixtures authored independently of the port.
  3. Ident locks the station and the buoys, shows their names, and the lock ends when a buoy is destroyed. This closes the todo `2026-11-15-lasers-and-ident-hit-stations-and-buoys.md`.
  4. Two ships, or a ship and a buoy (the player included), that touch octree against octree take damage by Oolite's mass and closing-speed rule, once per contact, and ships separating are ignored. A ship driven to zero energy by a collision is destroyed with its debris. Touching the station hull stays damage-free, docking is unchanged, and no arrival or launch pose overlaps a buoy hull.
  5. Worlds that never fire, ident or collide hash as before, and a collision scenario hashes equal at 30, 60 and 144 Hz.

**Scope note**: owner decisions of 2026-11-16: the statics are hit by porting Oolite's subentity rule (the merged-hull shortcut is not taken), and contact with the station hull stays damage-free until DOCK-09. The station absorbs hits; only buoys hold damage, in the per-world static-health field Phase 15 designed.
**Implied work** (flagged at roadmap creation; no requirement text changed):
  - What a destroyed buoy means for the scanner, the witchpoint beacon and `hyperspace-failure.spec.ts`, which parks the player at 0 m from the witchpoint buoy (its hull is about 100 m against the simulation's 10 m radius). A sanctioned fixture change with a Key Decisions row, plus a unit test that no arrival draw overlaps a buoy hull.
  - The collision rule's octree-against-octree stage, the launching exemption, once-per-pair resolution and the player's impulse response (research ARCHITECTURE section 4), each with worked examples from the Oolite C and fixtures written independently of the port.
**Standing gate**: QUAL-11 after the plans that change `src/sim/world/**` or the hull content.
**Research flag**: High. The Coriolis subentity rule and its dock mouth need a spike before the port; the collision rule's two halves (`collideWithShip` against `takeScrapeDamage`) are easy to port from the wrong half; octree-against-octree fixtures are written independently
**Pitfalls to address**: 4 (the acceptance harness), 9 (single contact: no energy gained or lost twice), 11 (statics are not world entities: the hull table and their poses), 12 (the collision rule's wrong half), 17 (pair cost)
**Decisions to settle**: the Coriolis hull's file (one artifact or a separate file); the destroyed-buoy semantics above; the player's response to impact; supersede the Key Decisions row "Statics are neither laser nor ident targets"
**Todos**: `2026-11-15-lasers-and-ident-hit-stations-and-buoys.md` (closed by CBT-17); `2026-11-14-make-buoys-block-hyperspace-like-oolite.md` touches the same fixture and is a candidate to fold in by owner decision, not a requirement; `2026-11-10-add-planet-and-sun-collision.md` loses its buoy half to CBT-18 (planet and sun stay unscheduled)
**Plans**: 22/22 plans complete; 22 plans in 13 waves (revised twice after plan checks and after two cross-AI review rounds; owner decisions PD-01..PD-08 in `18-CONTEXT.md`)

Plans:
**Wave 1**
- [x] 18-01-PLAN.md — DATA-15, criterion 1: measure the Coriolis octree in the `assets` container (first plan); the static hulls (Coriolis + 3 subentities, buoy + 1, barrel, alloy) ship as their own lazy file under a strict schema, golden and drift gate; Key Decision row, provenance
- [x] 18-02-PLAN.md — CBT-17, CBT-18: independent geometry oracle: dock-mouth and buoy beam fixtures from the vendored meshes, and a reference for Oolite's octree-against-octree test
- [x] 18-03-PLAN.md — CBT-18: independent response oracle: `collideWithShip`, drift braking, the player's scrape and the blast, each fixture derived from the C lines

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 18-10-PLAN.md — CBT-18: the player's drift (`FlightState.drift`), integrated and power-braked by raw thrust
- [x] 18-13-PLAN.md — DATA-15: the static hull artifact wired into the session and the sim's merged hull table (traffic-gated load, `fullHullTable()`)
- [x] 18-14-PLAN.md — CBT-17, CBT-18: per-world buoy state (displacement, drift, subentity energy) for PD-01/PD-02, pristine-omit in snapshot and hash
- [x] 18-20-PLAN.md — CBT-17, CBT-18: PD-03, the three research claims measured on real Oolite (dock mouth, buoy ram, pod/plate blockage radius) with recorded verdicts

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 18-04-PLAN.md — CBT-17, criterion 2: the Coriolis as a laser target through Oolite's subentity hit rule; it absorbs hits; supersedes "Statics are neither laser nor ident targets" (laser half)
- [x] 18-09-PLAN.md — CBT-18: octree-against-octree contact and its subentity composition as pure kernels held to the geometry oracle
- [x] 18-17-PLAN.md — CBT-18: drift integration and braking for NPC ships and buoys
- [x] 18-16-PLAN.md — CBT-18: `collideWithShip` response (parent and subentity velocity changes kept apart) and the heat-free player scrape as pure kernels held to the response oracle, after 18-20's measurements

**Wave 4** *(blocked on Wave 3 completion)*
- [x] 18-05-PLAN.md — CBT-17, criterion 2: buoys at 250 energy, recharge, destroyed at zero at their live pose

**Wave 5** *(blocked on Wave 4 completion)*
- [x] 18-15-PLAN.md — CBT-17: the buoy's frangible subentity (PD-01: 1 % on the buoy, full damage on the subentity, detached at 0); pods and plates become laser targets

**Wave 6** *(blocked on Wave 5 completion)*
- [x] 18-06-PLAN.md — CBT-17, criterion 3: ident on the station, buoys, pods and plates (never wrecks) with compiled names; the lock ends when a buoy dies; closes the lasers/ident todo

**Wave 7** *(blocked on Wave 6 completion)*
- [x] 18-07-PLAN.md — CBT-17: live buoys block a completing jump by Oolite's mass rule (D-09); the D-06 fixture moves to `[1000, 0, 0]`; the 2,048-layout clearance sweep; closes the buoy-blocking todo

**Wave 8** *(blocked on Wave 7 completion)*
- [x] 18-08-PLAN.md — CBT-17: a destroyed buoy leaves the view and scanner, a moved buoy is drawn where it is, a detached subentity is hidden; compass fallback (D-05) and the compass cycle FIDELITY row

**Wave 9** *(blocked on Wave 8 completion)*
- [x] 18-11-PLAN.md — CBT-18, criterion 4: the opt-in collision stage in `resolveShots` for the player, NPCs, pods and plates; station and launch excluded; kills and debris through the one kill path; rammed pods take damage (PD-05)
- [x] 18-22-PLAN.md — DATA-15, CBT-17: a new traffic-on browser spec: a destroyed nav buoy leaves the scanner, ident locks the station, the static chunk loads only with traffic on

**Wave 10** *(blocked on Wave 9 completion)*
- [x] 18-18-PLAN.md — CBT-18, criteria 4–5: buoys as movers with their subentity in the collision stage; 30/60/144 Hz equality, cost guard, the player-death tripwire

**Wave 11** *(blocked on Wave 10 completion)*
- [x] 18-21-PLAN.md — CBT-18: PD-06 and PD-08, live buoys join the NPC proximity pass behind Oolite's collision-chain prefilter so NPCs are alerted where Oolite alerts them; the re-pin rule, a populated collisions-on scenario, QUAL-11 under PD-07

**Wave 12** *(blocked on Wave 11 completion)*
- [x] 18-19-PLAN.md — CBT-18: the explosion blast pushes ships, buoys and the player (D-03); every exploding body is a blast source

**Wave 13** *(blocked on Wave 12 completion)*
- [x] 18-12-PLAN.md — phase close: todo moves, FIDELITY walk, tripwire evaluation, `verify-full` (PD-04) and QUAL-11 on the remote machine

### Phase 19: Equipment Damage and Repair

**Goal**: A hit on the player can damage the ship's equipment, the damage survives a reload, a damaged item stops counting as installed, and the player repairs it at F3 for Oolite's price
**Depends on**: Phase 15 (the ledger's player branch), Phase 17 and Phase 18 (NPC fire and collisions are the damage the player takes)
**Parallel track**: none
**Requirements**: CBT-08, CBT-12, SAVE-09
**Success Criteria** (what must be TRUE):
  1. When a hit gets through to the player's energy bank, Oolite's internal-damage rule (the `(rand & 31) < amount` loop, minus 32 per iteration) can damage an installed item. The draw comes from a seeded stream, so the same fight damages the same item at any frame rate, and the simulation reports it as an event that the app applies to the profile in one atomic update.
  2. A damaged item is shown as damaged (F5, F3 and one HUD message when it happens) and does not count as installed: for example a damaged docking computer does not dock the ship.
  3. At F3 the player repairs a damaged item at Oolite's repair price through the allow-listed money path; a repaired item counts as installed again, and an unaffordable repair is refused with its reason like any other F3 purchase.
  4. Saves move to schema v5 with `damagedEquipment` with no migration (alpha, no players: a v1 to v4 save is rejected through the existing corrupt path (owner 2026-11-21: unreadable would disable saving for the session)), the worst-case v5 save stays under the 65,536-character cap, and a damaged item is still damaged after Continue or Load.
  5. CBT-08 holds end to end in one hook-spawned fight: the enemy ship is destroyed with its debris and the player's ship leaves the fight with a damaged item. This completes CBT-08, whose destruction clauses Phase 16 proved.

**Scope note**: owner decision of 2026-11-16: equipment damage persists in save v5 and is repairable at F3 (CBT-12 is in scope). The research's alternative, removing the key on v4 with no repair, is not taken. Only the player's equipment is damaged; the simulation decides and emits events, and the app commits the profile.
**Implied work** (flagged at roadmap creation; no requirement text changed):
  - Oolite's damage probability per equipment item, compiled from `equipment.plist` behind the strict schema, the golden and the drift gate; the F3 repair row as a new allow-listed entry on the money path (the visible set grows by one, with purchase, persistence and normal-play tests as in Phase 13).
  - The save validator rejects a `_DAMAGED` equipment key today; v5 keeps the damage in its own field and does not reuse that key.
**Research flag**: Medium. Read the player's damage loop (`takeEnergyDamage`, `PlayerEntity.m` 5684-5697) and `takeInternalDamage` (6097-6185) end to end, the 50 % repair price (`PlayerEntity.m` 9105-9120), and which items can be damaged (`canBeDamaged` and `damage_probability` in `OOEquipmentType.m`; the research leans to "lasers are never internally damaged"); confirm the per-item mapping against what the equipment catalogue carries
**Pitfalls to address**: 13 (equipment damage has no place in the save, F3 or the profile: atomic profile update test), 18 (the save schema: v5 is now an owner decision, with no migration because the game is alpha, and a worst-case size test), 22 (closed sets: router table, probe shape, HUD)
**Decisions to settle**: which items can be damaged; whether the cargo-pod-loss branch that opens Oolite's `takeInternalDamage` roll is ported or recorded as a divergence (the requirements name equipment only, and the branch also shifts the odds of the equipment branch while the hold is full); the F3 repair row's copy; `ship_trade_in_factor` stays unpersisted (the research's lean)
**Todos**: `2026-11-11-cargo-purchase-cost-basis-tracking.md` needs its own ordered bump after v5 and stays unscheduled
**Plans**: 15/15 plans complete in 8 waves (owner answers of 2026-11-21 applied: D-05 factor 95, D-11 old saves `corrupt`, D-07/D-12 "Repair: X" is Oolite's own text; the save work is split in three after the plan check; the D-06 in-use tripwire moved out of 19-03 into 19-15 at the second plan check; the cross-AI review `19-REVIEWS.md` applied: 19-12 before 19-11, the internal-damage loop cap recorded as a divergence, the in-use tripwire pins its counts in `outfitting.ts`)

Plans:
**Wave 1**
- [x] 19-01-PLAN.md — CBT-08, CBT-12 (D-03): Oolite's per-item damage probability compiled into the equipment catalogue behind the strict schema, the golden and the drift gate
- [x] 19-02-PLAN.md — CBT-08 (D-01, D-02, D-04, D-05): the internal-damage roll as a pure module on its own stateless per-tick stream, the two damage events, the stream and factor-95 decisions, the hull-wear todo and tripwire
- [x] 19-06-PLAN.md — SAVE-09 (D-11): the save migration chain retired: only the current version is read, every older save is corrupt (Node and browser), the save suites on shared current-version builders, the dead alias tolerance deferred as a todo with its tripwire
- [x] 19-15-PLAN.md — CBT-08, CBT-12 (D-06): the in-use clauses Wegolite cannot exercise yet (autopilot, galactic jump, ANA) recorded in a todo, with a tripwire on their first consumer

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 19-03-PLAN.md — CBT-08, CBT-12, SAVE-09 (D-04, D-06, D-11): `PlayerProfile.damagedEquipment`, the damage and cargo-loss operations, the not-installed proof
- [x] 19-04-PLAN.md — CBT-08 (D-01, D-04): the roll on the ledger's player branch for laser and scrape hits, Oolite's pod list, the 30/60/144 Hz cadence proof
- [x] 19-07-PLAN.md — SAVE-09 (D-11): every save fixture follows the current version (browser fixtures and app tests on the shared builders, future versions at `SAVE_VERSION + 1`), SAVE-09 and criterion 4 worded for the corrupt path

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 19-05-PLAN.md — CBT-12 (D-08, D-09, D-10): the F3 repair door (half price, one tech level lower, at once) and the damaged-purchase refusal
- [x] 19-08-PLAN.md — SAVE-09 (D-11): save schema v5 with `damagedEquipment`, v4 corrupt like every older save, the worst case under the cap, the D-11 decision row

**Wave 4** *(blocked on Wave 3 completion)*
- [x] 19-09-PLAN.md — SAVE-09: the damaged-list save contract at every boundary, `economy.damagedEquipment` on the probe, a damaged item still damaged after Continue and Load in the browser
- [x] 19-10-PLAN.md — CBT-08, CBT-12 (D-01, D-07): the `damageFlow` subscriber's atomic commit, the router rows and Oolite's HUD messages

**Wave 5** *(blocked on Wave 4 completion)*
- [x] 19-12-PLAN.md — CBT-12 (D-07 to D-10): F3 "Repair: X" rows through the station controller, F5 "(damaged)" first, the `?test=1` grant limited to the F3 set, the repair and F5 decision rows (before 19-11, so damage goes live only once it is shown and repairable)

**Wave 6** *(blocked on Wave 5 completion)*
- [x] 19-11-PLAN.md — CBT-08 (D-01, D-03): the per-step internal-damage facts from the live profile, so hits damage equipment in play

**Wave 7** *(blocked on Wave 6 completion)*
- [x] 19-13-PLAN.md — CBT-08 (criterion 5): the hook-spawned fight in the Node twin and the browser: the enemy dies with its debris, the player leaves with a damaged item

**Wave 8** *(blocked on Wave 7 completion)*
- [x] 19-14-PLAN.md — phase close (D-05, D-07, D-12): FIDELITY rows E-154 to E-170, the reviewers' agreement recorded on every new divergence row, the station-palette decision row (the F3 repair row's colour), the divergence-rule outcome corrected for "Repair: X", `verify-full` (automatic phase gate)
**UI hint**: yes

### Phase 20: Player Death and Game Over

**Goal**: The player can die: at zero energy from any cause, in flight, the game is over and the page reloads to offer Continue from the last save, through one death path that autosave, pause and the title flow respect; the milestone's determinism and release gates close here
**Depends on**: Phases 15 to 19 (it consumes every damage source, the ledger's player branch and the v5 save)
**Carry-over from Phase 15 reviews (2026-11-16)**: decide what happens when the player and an NPC kill each other on one tick.
**Parallel track**: none
**Requirements**: DEATH-01, DEATH-06, QUAL-11
**Success Criteria** (what must be TRUE):
  1. A player in flight whose energy reaches zero, from an NPC laser, a collision with a ship or a buoy, or any other damage that goes through the ledger, dies on that tick: the ship explodes, the flight freezes and a game-over screen replaces the view. There is no escape pod to eject. A docked or launching player is never killed, because death needs `inFlight`.
  2. A dead player is never saved: no autosave, manual save or pending write replaces the last save with a dead or "docked" player, including a death on the same frame as an autosave, with the chart or the F2 screen open, while paused, during a hyperspace countdown, after a focus loss or after a WebGL context loss. Pause, held keys and the ident lock cannot revive or repeat the death.
  3. After game over the page reloads and the title offers Continue only when a loadable save exists. Continue resumes that save (docked or in flight, with its damaged equipment), and a browser with no save offers only New game.
  4. Kills are deterministic: one scenario holding an NPC-against-NPC kill, a collision kill and the player's death hashes the same at 30, 60 and 144 Hz, and the frozen 20-seed acceptance run is 21 of 21 after the last plan that touches `src/sim/npc/**`, `src/sim/world/**` or `ships-npc.json`. This completes QUAL-11.
  5. The release gate holds: `verify-full` exits 0 on the remote test machine, with the death-and-reload and game-over-guard browser specs in it.

**Scope note**: owner decisions of 2026-11-16: game over is a page reload, and death happens only while `inFlight`. The research's open question on dying while `launching` is closed by the second: a launching player's energy cannot reach death. The world is frozen with a deterministic dead hash during the game-over window.
**Implied work** (flagged at roadmap creation; no requirement text changed):
  - `FlightMode "dead"`, fail-closed in the roughly 48 mode references and the roughly 15 `paused` sites; `snapshotForSave` must refuse `dead` (it encodes any non-`inFlight` mode as `docked` today); one death flow that reuses the warm-Load install path, with `loadFromSave` taken out of F2 gating and every save status handled; a session latch ahead of every autosave and manual-save guard; a death-load that waits for queued writes (confirm `store.read()` waits).
  - Milestone close-out folded in: the FIDELITY.md rows and the Key Decisions amendments (the energy floor row and the `playerDestroyed` payload; N2 and A7 are amended in Phases 15 and 17), the CHANGELOG entries under `Unreleased`, the NOTICE and ASSETS provenance, and the CI e2e timeout margins check.
**Standing gate**: QUAL-11 (criterion 4) and the by-hand 20-seed rerun after the last touching plan.
**Research flag**: Low once the owner decisions above are in. The work is wide rather than uncertain: the inventory of mode gates, the death-flow wiring and the save-path latch (research ARCHITECTURE section 7 and PITFALLS 7 and 10)
**Pitfalls to address**: 6 (old pins encode "the player cannot die"), 7 (autosave races a death; a dead player must not be saved as docked), 10 (one death path and everything that must stop when it fires), 19 (Oolite's death is not the whole of "game over"), 22 (closed sets), 4, 21, 25 and 26 (close-out: acceptance, test cost, provenance, changelog)
**Decisions to settle**: the deterministic dead hash during the game-over window; the `playerDestroyed` event payload; the game-over copy; the Key Decisions amendments named under "Changes from the former plan"
**Todos**: `2026-11-16-ci-e2e-timeout-margins.md` (apply its 60 % rule to the new specs in the same change)
**Plans**: 12/13 plans executed in 6 waves, plus 2 UAT gap-closure plans in 2 gap waves (20-12, 20-13: owner decisions of 2026-11-24 on gaps G-20-1 and G-20-2 in `20-UAT.md`) (owner decisions D-01..D-16 in `20-CONTEXT.md`; 20-11 is the explosion layer the owner split out of 20-04 on 2026-11-23, numbered after the existing plans so no plan id moves; D-12's page reload replaces the in-session load pipeline of the implied work above, so no `loadSavedGame` and no `loadFromSave` refactor are planned)

Plans:
**Wave 1**
- [x] 20-01-PLAN.md — DEATH-01, DEATH-06, QUAL-11 (D-04, D-11): the one death path in the sim: the ledger's lethal check, `killPlayer`, the `"dead"` mode and the freeze (`resolveShots` included), the destroyable player in collisions, the tripwire retired and replaced by a producer-scope guard for `playerDestroyed`, `snapshotForSave` refusing a dead state (callers audited for the window before the latch) and the CHANGELOG line, all in the death commit, built in a fixed edit order with typecheck checkpoints; the nav-buoy ram measured first (idle launch, 250 and 350 m/s from full shields) and pinned, the idle launch included; the "cannot die" pins restated without hiding a death
- [x] 20-11-PLAN.md — DEATH-01 (D-01, D-01a, D-01b): the explosion layer for the player's death, split out of 20-04 (owner, 2026-11-23): per-add options (seed variant, flash, burst kind), Oolite's small and big fragment bursts with their speed range, lifetime and start size (`SMALL_BURST_*`/`BIG_BURST_*`, pinned with their `src/Core/Entities/OOParticleSystem.m` lines), and the pool of 16; every Phase 16 explosion unchanged

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 20-02-PLAN.md — DEATH-01 (D-09, D-10, D-11): the dock, jump and launching ticks, the countdown and ident, the mutual kill, the lethal ram with Oolite's reversal and the bank-only comparison, the ledger's lethal boundary, the freeze table over every sim entry point and the lethal-predicate property
- [x] 20-03-PLAN.md — QUAL-11: one scenario with an NPC-against-NPC kill, a collision kill and the player's death, equal at 30, 60 and 144 Hz and pinned as literals, with a stable dead hash; each kill proven feasible first, a per-kind fallback only as a recorded deviation
- [x] 20-04-PLAN.md — DEATH-06, DEATH-01 (D-01, D-07, D-08): `playerDestroyed` routed to `deathFlow`, the session latch set inside the dispatch, the save refusals (load and clear paths included, each with the skip reason `dead`) in front of 20-01's persistence refusal, the `gameOver` input context, the death flow adding the player's explosion as Oolite's eight bursts (four small, four big, D-01a) at 1x the collision radius with one flash in total (D-01b) through 20-11's layer options (depends on 20-01 and 20-11)
- [x] 20-05-PLAN.md — DEATH-01, DEATH-06 (D-02, D-03, D-05, D-06, D-07, D-12): the game-over view module (Oolite's three lines plus the cause line; fresh Space or click reloads) and its markup

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 20-06-PLAN.md — DEATH-01, DEATH-06 (D-06, D-07, D-08): the sim driver, the frame loop's game-over branch, pause, focus loss, context loss and the chart all refuse while dead
- [x] 20-07-PLAN.md — DEATH-01, DEATH-06 (D-12, D-13): the overlay wired into the session and shown on the lethal tick; CHANGELOG entry

**Wave 4** *(blocked on Wave 3 completion)*
- [x] 20-08-PLAN.md — DEATH-01 (D-01, D-01c, D-01d): the aft view 100 m back, the explosion on a presentation clock, the HUD hidden, the five-second fade, with its CHANGELOG sentence in the same commit (wave 4, after 20-07); NPC debris drifting on screen only while the sim stays frozen (the debris contact gains its velocity), with no time limit, the redraw idling once no moving piece is in the dead camera's view (D-01d: the frustum and Oolite's no-draw distance); `probe.death`

**Wave 5** *(blocked on Wave 4 completion)*
- [x] 20-09-PLAN.md — DEATH-01, DEATH-06 (D-13, D-14, D-16): one death route (a seeded full-speed ram into the nav buoy from at least 5 km, measured lethal in 20-01 and confirmed by a Node twin; a non-lethal twin stops the plan for a report, with no fallback route); death-and-reload through the manual-clock hook (the no-save variant exits by a click), game-over-guard in an unhooked, untainted session so its save checks can fail; with the CI timeout margins and the 90 % Vitest count

**Wave 6** *(blocked on Wave 5 completion)*
- [x] 20-10-PLAN.md — DEATH-01, DEATH-06, QUAL-11 (D-15): Key Decisions, the DEATH-01 wording, FIDELITY rows and excerpts (E-45 rewritten with its title, drifted line cells re-pointed), todos, the CHANGELOG check, remote `verify-full`, one recorded `e2e-cross` run and the 20-seed acceptance run (prerequisite: `20-REVIEWS.md` from `/gsd-review --phase 20`, present at `4e28360`: DIV-1..DIV-8 accepted, DIV-2's objection resolved by the owner's amended D-01; DIV-9, the one flash of D-01b, and the updated DIV-2 and DIV-7 accepted by fable, sonnet and deepseek-v4.1-flash in `## Round 2` at `c467a50`; 20-10 halts on any verdict missing at execution time); the burst-kind constants and the no-draw factor in the ledger (D-01a, D-01d), the DIV-9 row with Oolite's reduced-detail precedent, the DIV-2 row's remaining form differences and debris among DIV-7's moving layers, with no time limit and the redraw bounded by visibility (D-01c, D-01d; round 2's DIV-7 acceptance stands)

**UAT gap closure** (2026-11-24; gap-closure waves restart at 1)

**Gap wave 1**
- [x] 20-12-PLAN.md — G-20-1, DEATH-01: the dead camera coasts render-only at Oolite's 160 m/s looking aft on the presentation clock (sim, tick and hash frozen); the dust gets the coasting camera's delta and speed (0 when the camera has not moved), pinned by Vitest; the dead view draws every frame while shown (D-01e, owner-confirmed 2026-11-24: the redraw half of D-01d withdrawn); FIDELITY E-179 and DIV-7 revised on the owner's authority with the `## Round 3` record conditions (accepted 3/3 at `d7d91e9`: the dust streak form as a divergence, the range with no distance cap per D-01e, the corrected overtake thresholds), the camera-only coast row with excerpt E-181, the E-176 cross-reference, T-20-25 marked superseded in `20-SECURITY.md`, CHANGELOG; `verify-full` deferred to 20-13's phase gate; the flyer plates are Oolite's odds (no change)

**Gap wave 2** *(blocked on gap wave 1 completion)*
- [ ] 20-13-PLAN.md — G-20-2, DEATH-01, DEATH-06: the four game-over lines on a dark translucent panel inside the faded `#game-over` root, in Oolite's yellow; plan-level pre-flight: `## Round 3` ACCEPT verdicts on the backing (DIV-10) in `20-REVIEWS.md` (3/3 at `d7d91e9`, L1065, L1095, L1125, consensus L1134), else nothing is committed; the yellow ships only with the panel; the E-182 row carries Round 3's conditions (the panel dims the receding explosion, Oolite's comm-log backing precedent, the unmodelled 0.75 HUD alpha); the backing recorded first (excerpt E-182, a new Key Decision), then the panel and CHANGELOG in one commit; the phase gate's remote `verify-full`, covering 20-12 too; the credits glyph stays a todo

**UI hint**: yes

### Coverage

16 of 16 v2.3 requirements are mapped, each to exactly one phase (the phase that completes it). The traceability table is in `.planning/REQUIREMENTS.md`.

| Phase | Count | Requirements |
|-------|-------|--------------|
| 15 | 3 | FOUND-18, FOUND-19, DATA-14 |
| 16 | 2 | DATA-16, WORLD-17 |
| 17 | 2 | CBT-15, CBT-16 |
| 18 | 3 | DATA-15, CBT-17, CBT-18 |
| 19 | 3 | CBT-08, CBT-12, SAVE-09 |
| 20 | 3 | DEATH-01, DEATH-06, QUAL-11 |

Phases carry two or three requirements each because each is one delivery boundary with its own risk: the snapshot and ledger foundation, the debris and cap, the fire gate (a fidelity port that must stay isolated and independently verifiable, as Phase 14 was), the static hull table with collisions, the player's equipment damage with the save bump, and the death path with the milestone gates. CBT-08 and QUAL-11 are staged across phases (see "Staged verification"); each is mapped once, to the phase that completes it.

## Later (unscheduled)

The former plan's labels (Phases 15-23 of the v2.1 Combat & Traffic plan) are history only: v2.3 reuses the numbers 15-20 for its own phases. v2.3 takes destruction and player death from the former Phase 15 and the NPC fire gate from the former CBT-15 as an engine capability. Still unscheduled, in no particular order, and given fresh phase numbers when their milestone starts: hazards (sun, planet, heat and alert condition: DEATH-03, DEATH-05, DOCK-08) and docking-slot scrape damage (DOCK-09); bounties, salvage, scooping and the escape pod; audio and music; priority AI, peaceful traffic and the station queue; police, legal status and fines; pirates, hunters and rescue; missiles, ECM and defensive equipment; full traffic, asteroids and mining; performance hardening with traffic and QUAL-01. Their phase details stay in `.planning/milestones/v2.0-ROADMAP.md`, and their requirements, with IDs and the former phase mapping, in `.planning/milestones/v2.0-REQUIREMENTS.md`. When their milestone starts, the milestone workflow re-states them and re-checks them against what Phases 9-20 proved. AI-12 (collect, tractored, mining and land on planet, split from AI-01 in v2.2) stays deferred with them. The deferred requirement IDs are listed under v2 Requirements in `.planning/REQUIREMENTS.md`.

Pending todos outside v2.3, which can run as quick tasks or join a phase by owner decision:

- `2026-11-10-add-planet-and-sun-collision.md` — hazards stay unscheduled; its buoy half is closed by CBT-18 in Phase 18.
- `2026-11-11-cargo-purchase-cost-basis-tracking.md` — adds a save field, so it needs its own ordered bump after Phase 19's v5.
- `2026-11-11-terminal-color-palette-setting.md` — a UI setting with no requirement.
- `2026-11-14-make-buoys-block-hyperspace-like-oolite.md` — a v2.1 follow-up; it touches the same fixture as Phase 18's buoy work, so it is a candidate to fold in there.
- `2026-11-14-measure-oolite-reference-in-docker.md` — a v2.1 follow-up; the wreckage lifetime of Phase 16 joins it.
- `2026-11-16-ci-e2e-timeout-margins.md` and `2026-11-16-phase-14-review-followups.md` — apply to every browser spec and every NPC change in this milestone (the 60 % rule; the by-hand acceptance rerun). `2026-11-15-lasers-and-ident-hit-stations-and-buoys.md` is closed by CBT-17 in Phase 18.

## Progress

**Execution order:** v2.3: 15, then 16 ∥ 17, then 18, 19, 20.

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 8. Session Split and World Core | v2.0 | 16/16 | Complete | 2026-11-13 |
| 9. NPC Content | v2.1 | 5/5 | Complete    | 2026-11-14 |
| 10. Ship Mass | v2.1 | 4/4 | Complete    | 2026-11-14 |
| 11. Minimal Save Schema v3 | v2.1 | 4/4 | Complete    | 2026-11-14 |
| 12. Inert Ships and the World Lifecycle | v2.1 | 14/14 | Complete    | 2026-11-14 |
| 13. Views, Lasers and Shields | v2.2 | 16/16 | Complete    | 2026-11-15 |
| 14. NPC Flight and Steering Fidelity Gate | v2.2 | 19/19 | Complete    | 2026-11-16 |
| 15. Damage Ledger and Kills | v2.3 | 6/6 | Complete    | 2026-11-16 |
| 16. Wreckage, Cargo and the Entity Cap | v2.3 | 9/9 | Complete    | 2026-11-17 |
| 17. NPC Fire and Hits on the Player | v2.3 | 13/13 | Complete    | 2026-11-19 |
| 18. Stations, Buoys and Collisions | v2.3 | 22/22 | Complete    | 2026-11-20 |
| 19. Equipment Damage and Repair | v2.3 | 15/15 | Complete    | 2026-11-22 |
| 20. Player Death and Game Over | v2.3 | 12/13 | In Progress | - |

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
