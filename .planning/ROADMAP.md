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
- ✅ **v2.3 Combat and Death** — Phases 15-20 (shipped 2026-11-24; released as `v0.8.0`, tagged 2026-11-24, the latest release; the quick tasks since it sit under `[Unreleased]`)
  - Full phase details: [.planning/milestones/v2.3-ROADMAP.md](milestones/v2.3-ROADMAP.md)
  - Requirements: [.planning/milestones/v2.3-REQUIREMENTS.md](milestones/v2.3-REQUIREMENTS.md)
  - Audit: [.planning/milestones/v2.3-MILESTONE-AUDIT.md](milestones/v2.3-MILESTONE-AUDIT.md) (tech_debt: 16/16 requirements, no blockers)
  - Open at archive: the docked F-key bug from the Phase 19 UAT (major, undiagnosed) and the F6 toggle bug; review warnings of Phases 18 and 20; recorded Oolite divergences of Phases 18 and 19; all todos
- 🚧 **v2.4 Pirates and Police** — Phases 21-26 (in progress; roadmap created 2026-11-25)
  - Requirements: [.planning/REQUIREMENTS.md](REQUIREMENTS.md) (26 requirements: FOUND-20, DATA-17, DATA-18, WORLD-08, WORLD-09, WORLD-19, WORLD-20, QUAL-09, AI-02 to AI-05, AI-12, AI-13, CBT-11, CBT-19, CBT-20, LAW-01 to LAW-04, LAW-06, LAW-08, SAVE-11, QUAL-12, QUAL-13; owner scope decisions D1-D13, owner answers D14-D17 of 2026-11-27)
  - Research: [.planning/research/SUMMARY.md](research/SUMMARY.md) (with `STACK.md`, `FEATURES.md`, `ARCHITECTURE.md` and `PITFALLS.md` beside it)
  - Phase details: below

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

<details>
<summary>✅ v2.3 Combat and Death (Phases 15-20) — SHIPPED 2026-11-24</summary>

- [x] Phase 15: Damage Ledger and Kills (6/6 plans) — completed 2026-11-16
- [x] Phase 16: Wreckage, Cargo and the Entity Cap (9/9 plans) — completed 2026-11-17
- [x] Phase 17: NPC Fire and Hits on the Player (13/13 plans) — completed 2026-11-19
- [x] Phase 18: Stations, Buoys and Collisions (22/22 plans) — completed 2026-11-20
- [x] Phase 19: Equipment Damage and Repair (15/15 plans) — completed 2026-11-22
- [x] Phase 20: Player Death and Game Over (13/13 plans) — completed 2026-11-24

Total: 78 of 78 plans complete. Requirements 16/16. Phase directories now live in `.planning/milestones/v2.3-phases/`.

</details>

### 🚧 v2.4 Pirates and Police (In Progress)

**Milestone goal:** Combat happens in ordinary play: the populator fills each system with traders, pirates and police by Oolite's rules, pirates attack on their own, and the player earns bounties, changes legal status and scoops cargo.

**Scope rule:** the necessary technical minimum, by the owner's standing rule ("less, but better"), inside the owner's scope decisions D1-D13 of 2026-11-25 (REQUIREMENTS.md, "Scope decisions"). Six phases, the top of the 4-6 standard-granularity guide and one fewer than the research suggested (see "Changes from the research suggestion"); the owner inserted a seventh, Phase 22.1 (per-system main stations), on 2026-11-26. Each phase is one delivery boundary with its own risk: the catalogue with the one snapshot bump, the populator verified against Oolite's own script, the priority-AI port with traders and pirates, loot with the one save bump, the law, and a living system with the milestone acceptance. No phase exists for an internal-quality goal alone; the milestone close-out folds into Phase 26. Missiles and ECM, the escape pod and capsules, scavengers, shuttles, medium and heavy hunters, station defence ships, the faithful station queue, contraband penalties, dynamic player roles, the player's fuel injectors, hazards and audio stay in Future Requirements.

**Phase numbering:** continues from v2.3 (Phases 15-20); there is no reset. Decimal phases (for example 23.1) are urgent insertions.

- [x] **Phase 21: Roster, State Shape and Seams** - The NPC catalogue grows to the about 28 records the populator's roles resolve to, with aft weapons, fuel injection and their vendored models; every new hashed field of the milestone arrives in one snapshot v5 bump; the inert world stays byte-identical, and a render spike measures the draw calls of a full anarchy before any populator ships (completed 2026-11-26)
- [x] **Phase 22: Initial Population** - Each system is populated with traders, pirates, police and light bounty hunters by Oolite's populator rules, matching recorded oracle fixtures of Oolite's own script, placed as whole groups and drawn within the draw-call budget; the ships are still inert (completed 2026-11-26)
- [ ] **Phase 22.1: Per-system main stations** (INSERTED) - Each system's main station is the type Oolite gives it in `planetinfo.plist` (`station`: Coriolis, Dodecahedron or Icosahedron), with its own model, mass, collision radius, dock port and launch view, before Phase 23 traffic docks
- [ ] **Phase 22.2: Station as a collider for NPC ships (E-135)** (INSERTED) - The main station collides with NPC ships and pods as Oolite's does, or the divergence E-135 is kept with a recorded owner reason (moved out of 22.1 by owner decision D-B, 2026-11-27)
- [ ] **Phase 23: Priority AI, Traders and Pirates** - Oolite's priority AI, hand-ported as plain hashable data and matched against traces of the original JavaScript, flies traders, escorts and pirates in ordinary play: NPCs fire fore and aft lasers, use fuel injectors, launch from the station and leave by docking, jumping out or landing without dying
- [ ] **Phase 24: Loot, Scooping and Jettison** - The player buys Fuel Scoops and scoops pods that carry a commodity, jettisons cargo to satisfy a pirate, pirates collect loot, and scooped pods are held until docking and saved in schema v6
- [ ] **Phase 25: Police, Legal Status, Bounty and Rating** - Attacks seen by the law make the player an Offender or a Fugitive by Oolite's bit-flag rules; police, light bounty hunters and the main station respond; kills pay their bounty at the kill and build the combat rating; offenders are fined, fugitives are refused docking clearance, and standing survives save and load
- [ ] **Phase 26: Repopulation and Milestone Acceptance** - The system is repopulated every 20 s by Oolite's rates within a measured ceiling, and the milestone acceptance holds: pirates attack unprompted, a destroyed pirate pays and leaves cargo to scoop, firing on a trader brings the police, determinism and the release gate hold, and traffic is compared with headless Oolite

**Owner decisions in force** (taken 2026-11-25, REQUIREMENTS.md "Scope decisions"; each recorded in PROJECT.md Key Decisions, and in FIDELITY.md where it diverges from Oolite, by the phase named):

| # | Decision | Recorded and consumed in |
|---|----------|--------------------------|
| D1 | The bounty is paid at the kill, as in Oolite; docking pays only fines | Phase 25 |
| D2 | A minimal main-station responder: one hashed `World.station` record (alert level, offender marks, police launch through the D3 stand-in); no defence ships, no full `oolite-stationAI.js`, and the main station stays a static, not a dynamic entity. *Amended 2026-11-26 (owner, Phase 22.1): the main station is the system's own type (Coriolis, Dodecahedron or Icosahedron), still static* | Phase 21 (record shape), Phase 22.1 (station type), Phase 25 |
| D3 | A simplified NPC departure and station-launch stand-in, with one seam for a later faithful port | Phase 23 |
| D4 | Repopulation is in | Phase 26 |
| D5 | The catalogue grows to about 28 records, aft weapons included | Phase 21 (data), Phase 23 (aft fire) |
| D6 | A draw-call render spike in Phase 21, before the populator ships | Phase 21, completed in Phase 22 |
| D7 | Pods carry a commodity and amount; scooped pods are held as Oolite holds them, in a saved list | Phase 21 (fields), Phase 24 |
| D8 | A static player role (`player-unknown`, no forgiveness), a recorded divergence | Phase 23 (victim choice), Phase 25 (police) |
| D9 | Light bounty hunters only | Phase 22 (populator), Phase 25 (AI) |
| D10 | Jettison is in | Phase 24 |
| D11 | Symmetric kill credit, settled in the first law plan | Phase 25 |
| D12 | The frozen 20-seed run stays manual; a new traffic acceptance run lives in its own file | every phase (standing gate), Phase 26 |
| D13 | NPC fuel injectors are ported; the player's are not | Phase 21 (data, field), Phase 23 |
| D14 | (2026-11-27) The draw-call budget may be raised without waiting for the deferred 21-18 instancing, to at most about 80 calls with the fight's p95 at most 16.7 ms on the remote GPU (D-05's ceiling); lowering traffic is still never the fix | Quick task (the constant), Phases 23 to 26 (re-measures) |
| D15 | (2026-11-27) The Galactic Hyperdrive and the Advanced Navigational Array stay on sale at F3 although they do nothing yet: nobody plays the alpha, and keeping them saves re-adding them; a FIDELITY.md row and a tripwire record it | Quick task (todo `2026-11-27-inert-galactic-equipment-fidelity`) |
| D16 | (2026-11-27) Missiles and ECM (CBT-09, CBT-10, AI-06) are the first work of the next milestone (v2.5) | Next milestone |
| D17 | (2026-11-27) No break-pattern rings are added for docking or the witchspace exit: the launch keeps the fly-out view from the slot (E-113), and Oolite's pattern is the slot's polygon (`tunnel_corners`, rectangles by default), not a ring | none (recorded) |

Defaults taken from the research without a separate question (each a recorded cut or FIDELITY.md row where it differs from Oolite): every NPC spawns with zero missiles behind a tripwire guard; NPC `has_escape_pod` is false; scavengers and shuttles are removed from the populator table; sun-skim conditions are false; equal-priority populator entries run in the script's insertion order; comms text is expanded in the UI only, never in the sim.

**Staged verification:** each staged requirement is mapped once, to the phase that completes it, and is not checked off earlier.

- QUAL-09: the render spike is taken in Phase 21; the browser proof on the real populator completes it in Phase 22.
- CBT-11: pods carry a commodity and an amount from Phase 21 (the field and its draw); player scooping completes it in Phase 24.
- AI-04: the pirate trees arrive in Phase 23 (victim choice, attack, cargo demand, breaking off when losing), loot collection and the break-off on a met demand in Phase 24, and the light hunters complete it in Phase 25.
- AI-13: the reachability test and the no-silent-idle guard are built in Phase 23 and grow with each ported tree (Phases 24 and 25); Phase 26 completes it, where the acceptance runs assert no faulted AI.
- QUAL-12: a standing gate from Phase 21 on (the by-hand frozen run after every touching plan); the full-traffic cadence hashes and the new traffic acceptance run complete it in Phase 26.
- QUAL-13: Phase 22's boxed spike finds out whether a real-Oolite census can feed the comparison; Phase 26 completes it.

WORLD-09 is delivered whole in Phase 23, and its consumers follow (police launches in Phase 25, repopulation launches in Phase 26). SAVE-11 completes in Phase 24; Phase 25's LAW-08 proves that the live legal status and kill tally survive it.

**Changes from the research suggestion** (`.planning/research/SUMMARY.md`, Phases 21-27):

- Seven phases become six. WORLD-09 asks for one seam that both launches and retires ships, and traders need it to dock or jump out (AI-03), so the stand-in lands whole in Phase 23 instead of being split between Phases 23 and 25. Repopulation (WORLD-19) is then a single requirement, and it joins the milestone acceptance in Phase 26, because the acceptance story needs a system that turns over and the populator ceiling needs the soak data that phase measures.
- Loot and scooping come before the law phase instead of after repopulation. The owner's D7 puts the scooped-pod list into save v6 and D10 puts jettison in scope, so the pirate loop opened in Phase 23 (demand, loot, break off) closes in the next phase, the one save bump lands in the first phase with a live saved field, and the light hunters of Phase 25 find a real `CollectSalvage`. The pod commodity draw (research D7a) lands with its field in Phase 21, so the loot phase moves no debris golden.
- Owner answers that differ from the research's recommendation and widen scope: NPC fuel injection is ported (D13, CBT-20 in Phase 23), jettison is in (D10, LAW-06 in Phase 24), and scooped pods are a saved list rather than merged into the hold at scoop time (D7, SAVE-11 in Phase 24).

**Recorded decisions this milestone changes**, each amended in the phase named, in the same commit as the rule it changes:

- Phase 21: the Phase 14 content refusal (plan 14-03) is lifted for `aft_weapon_type`; the other refused keys are re-checked against the new records. The world snapshot moves from v4 to v5 (the v4 row covered the v2.3 field set only).
- Phase 22: the first inert populator (WORLD-15, `INERT_POPULATION`) stays for the frozen run and the inert goldens; the live traffic-on session moves to the new populator.
- Phase 23: "The decision to fire comes from the engine and test pilots only" (Phase 17, CBT-15 criterion 3) and its guard `tests/guards/fire-decision-source.test.ts` are superseded by CBT-19. The Phase 14 scope cuts for fuel injection and for the running-defense branch (reachable once a record carries an aft weapon) are reversed. If the kill-time `shipTargetLost` is narrowed, the owner edits Phase 15 criterion 1 first.
- Phase 24: save schema v6 supersedes v5 (no migration).
- Phase 25: Phase 17's D-10 (asymmetric credit for a same-tick mutual kill) is replaced by D11's symmetric credit.

### Execution Order and Parallel Tracks

The phases run in order, one at a time. Each consumes the one before it, and the two that could overlap (24 and 25) share the save bump, the F-screens and the AI trees, so they are kept sequential.

| Phase | Depends on | Can run beside | Must land before |
|-------|------------|----------------|------------------|
| 21. Roster, State Shape and Seams | Phase 20 (shipped in v2.3) | none | Everything else in the milestone |
| 22. Initial Population | 21 | none | 23 (the AI runs on real populated ships) |
| 22.1 Per-system main stations | 22 | none | 23 (traffic docks at and launches from the system's own station; the sim and content half at least) |
| 22.2 Station as a collider for NPC ships (E-135) | 22.1 | none | Runs right after 22.1 (owner decision 2026-11-27) |
| 23. Priority AI, Traders and Pirates | 21, 22, 22.1 | none | 24 (pirates that demand and collect), 25 (the engine and the launch stand-in), 26 |
| 24. Loot, Scooping and Jettison | 21, 23 | none | 25 (save v6, `CollectSalvage` for the hunters), 26 |
| 25. Police, Legal Status, Bounty and Rating | 21, 23, 24 | none | 26 (the police half of the acceptance; every role has its AI before repopulation spawns it) |
| 26. Repopulation and Milestone Acceptance | 21 to 25 | none | The milestone close |

Ordering rules:

- Phase 21's field-design plan designs every new hashed field of the milestone once (FOUND-20) and bumps the world snapshot once (v4 to v5) with pristine-omit hashing, so a world that uses none of the fields hashes as before. No later phase bumps the snapshot version; a missing field is an amendment the owner approves, not a quiet second bump. The inert populate path (`populateInertWorld`, `INERT_POPULATION`, `createInertPopulate`) is never edited: the new populator is built beside it.
- The save format moves once, in Phase 24 (v5 to v6, no migration: an older save is corrupt, as at v5), with legal status, the kill tally and the scooped-pod list designed together. NPCs stay unsaved: a Continue regenerates the system, so killed pirates return, while standing, kills and held pods persist.
- Ports are verified against Oolite's own JavaScript. The populator (Phases 22 and 26) and the priority AI (Phases 23 to 25) are checked against fixtures and traces recorded through the dev-only harness from the local checkout (`/home/opencode/git/oolite`) and committed under `tests/oracles/`, so CI replays them without the checkout. Oolite's scripts are never vendored and never run at runtime, and `check:dist` keeps the harness out of `dist`. Headless Oolite (`tools/oolite-reference`) is a sanity comparison (QUAL-13), not an oracle.
- The fidelity rule holds: Oolite's behaviour, data and text are the default, and every divergence (the departure stand-in, the minimal station responder, the static player role, each recorded cut) gets a FIDELITY.md row with reviewer agreement.
- Each tripwire is handled in the first plan that crosses it, and that plan takes the linked todo's fix with it: `ship-hit-consumers` (Phase 21's hit-reaction stage or Phase 23's first AI hit reaction, whichever names `shipHit` first), `on-event-handlers` (Phase 23, before the priority AI defines `onEvent`), `fire-decision-source` (Phase 23, superseded with its Key Decisions row) and `kill-credit-consumers` (Phase 25's first plan). The missiles guard asked for by todo `2026-11-25-missiles-and-ecm` lands with CBT-19 in Phase 23.
- The frozen 20-seed acceptance run is a standing gate (QUAL-12, AGENTS.md, D12): rerun `npm run test:acceptance` by hand on the remote test machine after every plan that touches `src/sim/npc/**`, `src/sim/world/**` or `ships-npc.json`, and record the result in that plan's SUMMARY. The thresholds and detectors are frozen; changing them needs the owner's `Detector-change-approved-by-owner` trailer. The new traffic acceptance lives in its own file (Phase 26), never in `thresholds.ts`.
- Bulk verification is Vitest scenarios: at least 90 % of new behavioural assertions in every phase. Browser specs stay opt-in smoke or journey checks on the browser-test bundle, with traffic off by default; no existing spec may meet an unrequested pirate.
- Every new sim function is total on malformed input and covered by a fast-check property. Bounds live in `src/sim/world/limits.ts` only. The closed sets (the event router table, appended to `EVENT_SUBSCRIBER_ORDER` and never inserted into; the probe shape; the HUD) widen by design, each in its own plan.
- Gate choice per plan is AGENTS.md's: pure `src/sim/` plans need `test`, `lint` and `typecheck`; browser-facing code needs `verify`; render, input, persistence and network-guard changes end with `verify-full` on the remote test machine, which runs automatically at the phase gate with no owner checkpoint (owner, 2026-11-21).

## Phase Details

### Phase 21: Roster, State Shape and Seams

**Goal**: The NPC catalogue holds every ship the populator's trader, pirate, police and light-hunter roles resolve to, with Oolite's bounty, roles, AI mapping, scoop, escorts, fuel injection and aft weapons, and every new hashed field of the milestone arrives in one snapshot bump, so no later phase reopens the data shape; the inert world and the frozen acceptance inputs stay byte-identical, and the draw-call cost of a full anarchy is measured before any populator ships
**Depends on**: Phase 20 (shipped in v2.3). It builds on Phase 9's content pipeline, Phase 15's pristine-omit hashing, Phase 16's pods and Phase 17's fire gate
**Parallel track**: none; everything else in the milestone starts after it
**Requirements**: FOUND-20, DATA-17, DATA-18
**Staged**: QUAL-09 (the render spike is taken here; mapped to Phase 22, where the populator ships). The last clause of CBT-11 (destroyed ships' pods carry a commodity and amount) lands here with the pod fields; CBT-11 is mapped to Phase 24
**First plan**: the inert-world isolation and its hash pin: `populateInertWorld`, `INERT_POPULATION` and `createInertPopulate` read an explicit list of the nine existing record keys, and the `laveInertWorld` hashes for epochs 1 to 20 are measured before any catalogue or field change and pinned equal after (pitfall C1)
**Success Criteria** (what must be TRUE):
  1. The compiled NPC catalogue holds the records the trader, pirate, police and light-hunter roles resolve to (about 28 records on 18 models, checked by resolving `like_ship` over the populator's roles), each with bounty, roles, auto-AI, scoop, escorts, `counts_as_kill`, fuel injection and fore and aft weapons from Oolite's `shipdata.plist`; `autoAImap.plist`, `role-categories.plist` and the comms strings of `descriptions.plist` are compiled; the converter accepts `aft_weapon_type`; all of it behind the strict schema, the golden and the content drift gate, with provenance.
  2. The new hull models and textures come from the local Oolite checkout through `scripts/vendor-oolite.sh` with `CHECKSUMS.sha256`, `ASSETS.md` and `NOTICE` rows, load lazily with traffic on, and a cold start stays under the 9,437,184-byte first-load ceiling with traffic on and off.
  3. Every new hashed field of the milestone (NPC bounty, role, group, cargo kind, pod commodity and amount, per-facing weapon type and temperature, fuel injection state, priority-AI state, `World.groups`, `World.populator`, `World.station`, the player's legal status and kill tally) arrives in one world snapshot bump, v4 to v5, with pristine-omit hashing: a world that uses none of them hashes as before, the inert populator, `INERT_POPULATION` and the frozen 20-seed acceptance inputs stay byte-identical (the epoch 1 to 20 pin holds), the frozen run stays 21 of 21, and the hash replays equal at 30, 60 and 144 Hz.
  4. A cargo pod released by a destroyed ship carries a commodity and an amount drawn from its own forked stream, so the draw moves no other draw; the debris goldens and twin hashes that move, move once, with the measured cause recorded.
  5. A render spike draws a full anarchy population of the new hulls with a fight and its debris and measures it against the 50-call budget before any populator ships; the measurement and the chosen fix (primitives merged per hull at build time, shared textures, or a budget raise the owner records) are written down.

**Scope note**: nothing plays differently yet. The live session still populates the 12-ship inert table, no ship has an AI that reads the new fields, the player's legal status and kills stay pristine, and the station record stays at rest. The seams the later phases share are built here with pin tests and no consumer in ordinary play (see the implied work).
**Implied work** (flagged at roadmap creation; no requirement text changed, and the plan-phase step decides the exact split):
  - The priority-AI state shape: about 24 flat `params` keys under the 32-key limit (enforced by a unit test), the closed `AI_KEYS` and `AI_EVENT_NAMES` vocabularies and the widened `WorldView`/`ShipControl`, pinned by tests, so the snapshot parser accepts Phase 23's state without a second bump.
  - A non-lethal `retireShip` removal path (Phase 23's stand-in uses it; it never explodes, drops cargo or credits a kill), and the ledger's hit-reaction stage, which records the aggressor and the offence for every laser hit, the lethal one included (Phases 23 and 25 consume it).
  - The per-facing weapon state and the shape of the fire gate's aft branch; aft firing itself is CBT-19 in Phase 23.

**Standing gate**: QUAL-12. Every plan that changes `src/sim/npc/**`, `src/sim/world/**` or `ships-npc.json` is followed by the by-hand 20-seed run on the remote test machine, 21 of 21, recorded in its SUMMARY.
**Research flag**: High; needs phase research. The aft-weapon lift (per-facing temperature, the attack behaviours and the fire gate, running-defense reachability), the 28-record converter widening, the draw-call options and the consolidated field design carry the milestone's highest design risk.
**Pitfalls to address** (research PITFALLS.md): C1 (the frozen run and the inert goldens share the populate path and the catalogue), C2 (piecemeal hashed fields), C6 (the damage path lacks the AI-visible side effects: the hit-reaction stage), C9 (content scope: aft weapons, missiles, AI chosen by role), C11 (no non-lethal removal path), M6 (pod fields)
**Decisions to settle**: the field set and its bounds (`src/sim/world/limits.ts` only); the draw-call fix; whether the Phase 18 standing approval to re-pin twin hashes (measured cause, Node equal to the browser) covers this milestone's re-pins (ask the owner once, in the first plan)
**Todos**: `2026-11-17-skip-shiphit-for-a-doomed-target.md` (if the hit-reaction stage becomes the first `shipHit` consumer, the skip comes with it and must never skip the offence broadcast; guard `ship-hit-consumers`); candidate, by owner decision: `2026-11-24-debris-inherits-ship-velocity.md` (it moves the same debris pins, so if it joins the milestone it joins this phase's one re-pin; it decides where pods drift, which matters for scooping in Phase 24)
**Plans**: 19/19 plans complete in 10 waves

Plans:
**Wave 1**
- [x] 21-01-PLAN.md — Wave 1: measure and pin the inert world for epochs 1-20, then `INERT_RECORD_KEYS` isolation, helper hardening, D-04 recorded (FOUND-20)

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 21-02-PLAN.md — Wave 2: vendor the 9 new hull models and 51 textures with provenance (DATA-18)
- [x] 21-03-PLAN.md — Wave 2: snapshot v5 and the per-entity field set with pristine-omit hashing, RNG purposes (FOUND-20)
- [x] 21-04-PLAN.md — Wave 2: hull octrees shared per model (`aliases`, `hullTable`), roster counts derived (DATA-18)

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 21-05-PLAN.md — Wave 3: the new NPC record fields on the nine, the aft refusal lifted, the zero-missiles tripwire, FIDELITY rows for NPC missiles, escape pods and NPC heat (DATA-17)
- [x] 21-06-PLAN.md — Wave 3: `World.station`, `.groups`, `.populator`, the player's standing, the 30/60/144 Hz replay (FOUND-20)
- [x] 21-07-PLAN.md — Wave 3: the priority-AI vocabulary (`"priority"`, `PRIORITY_PARAM_KEYS`, event names) and its unspawned guard (FOUND-20)

**Wave 4** *(blocked on Wave 3 completion)*
- [x] 21-08-PLAN.md — Wave 4: the 29-record roster, GLBs, textures, Cobra hull aliases, first load measured (DATA-17, DATA-18)
- [x] 21-09-PLAN.md — Wave 4: `retireShip`, the ledger hit-reaction stage, the widened views (FOUND-20)

**Wave 5** *(blocked on Wave 4 completion)*
- [x] 21-10-PLAN.md — Wave 5: compile `autoAImap`, `role-categories` and the comms subset (DATA-17)
- [x] 21-11-PLAN.md — Wave 5: background prefetch of the NPC models outside the first-load ceiling, first-load record (D-07; DATA-18)
- [x] 21-12-PLAN.md — Wave 5: per-facing fire queue and the aft branch shape, aft tripwire (FOUND-20)

**Wave 6** *(blocked on Wave 5 completion)*
- [x] 21-13-PLAN.md — Wave 6: explosions drift with the dying ship (D-02; render-only)
- [x] 21-14-PLAN.md — Wave 6: pod commodity and amount from the `pod` fork in the sim, the hook's cargo kind, the fallback tripwire (FOUND-20; CBT-11 clause staged)

**Wave 7** *(blocked on Wave 6 completion)*
- [x] 21-15-PLAN.md — Wave 7: debris inherits ship velocity, live goods and system market, the one re-pin (D-01; FOUND-20; CBT-11 clause staged)
- [x] 21-16-PLAN.md — Wave 7: the full-anarchy draw-call spike hook and spec (DATA-18; QUAL-09 staged)

**Wave 8** *(blocked on Wave 7 completion)*
- [x] 21-17-PLAN.md — Wave 8: D-05 fix (1): each NPC hull's primitives merged at build time into one draw call through texel-exact atlases, measured on the anarchy (DATA-18; QUAL-09 staged)

**Wave 9** *(blocked on Wave 8 completion)*
- [x] 21-18-PLAN.md — Wave 9: D-05 fix (2): variant hulls share one instanced mesh set (identical content and texture variants), measured (DATA-18; QUAL-09 staged)

**Wave 10** *(blocked on Wave 9 completion)*
- [x] 21-19-PLAN.md — Wave 10: GPU p95 and triangles, the budget decision after both fixes, shared budget constants, phase gate (DATA-18; QUAL-09 staged)

**Cross-cutting constraints:** <!-- gsd:generated -->
- The frozen run is 21 of 21 (remote, recorded; `src/sim/world/**` changes)

### Phase 22: Initial Population

**Goal**: Each system the player arrives in with traffic on is populated as Oolite's populator populates it: traders, pirates (independents and packs), police and light bounty hunters at the rates its government, economy, tech level and neighbours give, as whole groups at Oolite's locations, drawn within the draw-call budget; the ships are still inert
**Depends on**: Phase 21 (the catalogue, the bounty, group and cargo-kind fields, `World.populator` and the inert-world pin)
**Parallel track**: none
**Requirements**: WORLD-08, QUAL-09
**First plan**: the populator recorder: Oolite's own `oolite-populator.js` run through the dev-only harness over a spread of systems, with its fixtures committed under `tests/oracles/population/` before the port (the oracle-first rule of Phases 14 and 17)
**Success Criteria** (what must be TRUE):
  1. For every recorded system (at least an anarchy, a feudal system and a corporate state, with rich and poor economies at low and high tech levels), the ported planner, fed the recorded draws, produces exactly the groups Oolite's script produced: kinds, counts, ship records, leaders and followers, bounties, cargo kinds, weapon levels, skill and fuel injection. Scavengers, shuttles, medium and heavy hunters and assassins are absent as recorded cuts; trader opportunists keep their data effects (pirate goods, skill and weapons) and only their AI switch is a recorded cut (owner decision 22-CONTEXT D-10).
  2. Arriving in a system with traffic on places the planned ships at Oolite's locations (witchpoint, lanes and the station aegis; no planet location is in scope, owner decision 22-CONTEXT D-03) from the world seed through forked streams, so the same arrival always builds the same world and adding a group never moves another group's draws; a group spawns whole or not at all under the entity cap of 256, and no NPC carries a missile.
  3. The initial population size of all 2,048 systems is computed and recorded (mean, peak and the anarchy tail), and the largest populated world stays under the entity cap with room for debris.
  4. The frozen 20-seed acceptance run, `INERT_POPULATION` and the inert Lave goldens are untouched (21 of 21; the Phase 21 pin holds), browser specs stay traffic-off unless they opt in, and a populated traffic-on world hashes equal at 30, 60 and 144 Hz.
  5. The largest anarchy population, with a fight and its debris, draws within the 50-call budget in a browser spec (or within a budget raise the owner records), completing QUAL-09.

**Scope note**: populated ships keep `ai: null`: they are drawn, on the scanner, counted by mass lock and jump blockage, and can be shot, but they do not move. Bounty is only a field until Phase 25 pays it. The 12-ship inert table stays for the frozen path and its goldens; the live session moves to the new populator, and Key Decisions records the change beside the WORLD-15 row.
**Implied work** (flagged at roadmap creation; no requirement text changed):
  - The neighbourhood facts (`systemsInRange` within 7 LY and the `bottleneck` test over the galaxy graph), computed outside the planner and injected into it.
  - The traffic-on browser specs and Node twin hashes that encode the 12-ship population are re-pinned once, with the measured cause recorded.
  - A boxed spike on a real-Oolite census in the reference container (`tools/oolite-reference`, the start system chosen through a scenario save) that records whether QUAL-13's comparison can use it; LOW feasibility, and a failed spike is an answer, not a blocker.

**Standing gate**: QUAL-12
**Research flag**: Medium; needs phase research. `systemsInRange` and `bottleneck` over the galaxy graph, the recorder's stub-host scope, the float and ordering traps in the populator's formulas, and the real-Oolite start-system spike.
**Pitfalls to address**: C1 (the frozen path stays untouched), C4 (one forked stream per group and roll), C12 (atomic groups and the entity cap), M7 (float and ordering traps in the populator formulas), m7 (process traps from earlier milestones)
**Decisions to settle**: what the station and planet locations mean for a ship with no AI yet; how many systems the oracle records; the rule for a population that does not fit under the cap
**Todos**: `2026-11-25-missiles-and-ecm.md` (missiles are forced to zero at spawn here; its tripwire guard lands with CBT-19 in Phase 23)
**Plans**: 16/16 plans complete in 14 waves

Plans:
**Wave 1**
- [x] 22-01-PLAN.md — Wave 1: the populator recorder (Oolite's own script in the dev-only harness, stub host, strict schema, self-test) end to end for Lave seed 1, with the byte-for-byte rerun test (WORLD-08)

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 22-02-PLAN.md — Wave 2: the stratified sample (D-04), the all-2,048 neighbourhood table, the boundary draws and the ship facts, committed before the port (WORLD-08)
- [x] 22-03-PLAN.md — Wave 2: D-11, `MAX_WORLD_GROUPS` 256 and the empty-group pruning invariant (WORLD-08)

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 22-04-PLAN.md — Wave 3: the pure neighbourhood facts (`systemsInRange`, `bottleneck`) equal to the recorded table (WORLD-08)
- [x] 22-05-PLAN.md — Wave 3: the `hyperspaceMotor` record field compiled from Oolite (WORLD-08)

**Wave 4** *(blocked on Wave 3 completion)*
- [x] 22-06-PLAN.md — Wave 4: the entry table, cuts, rates, `randomise` and counts on the `pop` streams; the FIDELITY contract admits the script (WORLD-08)

**Wave 5** *(blocked on Wave 4 completion)*
- [x] 22-07-PLAN.md — Wave 5: freighters, the kit helpers and the engine escorts (D-08, D-10) replayed exactly (WORLD-08)

**Wave 6** *(blocked on Wave 5 completion)*
- [x] 22-08-PLAN.md — Wave 6: couriers and smugglers, every trade group replayed; the D-08 and D-10 FIDELITY and Key Decisions records (WORLD-08)

**Wave 7** *(blocked on Wave 6 completion)*
- [x] 22-09-PLAN.md — Wave 7: pirates, packs, hunters, police and interceptors; every recorded system replayed exactly (WORLD-08)

**Wave 8** *(blocked on Wave 7 completion)*
- [x] 22-10-PLAN.md — Wave 8: placement (WITCHPOINT) and atomic spawn under the cap with the measured debris reserve (WORLD-08)

**Wave 9** *(blocked on Wave 8 completion)*
- [x] 22-11-PLAN.md — Wave 9: the pod-kind runtime check closes the folded todo; the WITCHPOINT, cap-rule and inert-fallback records (D-05, D-06) (WORLD-08)

**Wave 10** *(blocked on Wave 9 completion)*
- [x] 22-12-PLAN.md — Wave 10: the 2,048-system census, no skipped group, launch-corridor hits, triangle and call bounds, the spec systems (WORLD-08, QUAL-09)

**Wave 11** *(blocked on Wave 10 completion)*
- [x] 22-13-PLAN.md — Wave 11: `createSystemPopulate`, the Node twin switch and its re-pins, the 30/60/144 Hz cadence (WORLD-08)

**Wave 12** *(blocked on Wave 11 completion)*
- [x] 22-14-PLAN.md — Wave 12: the live session switch, the browser re-pins, changelog and Key Decisions beside WORLD-15 (WORLD-08)

**Wave 13** *(blocked on Wave 12 completion)*
- [x] 22-15-PLAN.md — Wave 13: the QUAL-09 browser proof on the populated anarchy with a fight, and the phase gate (QUAL-09)

**Wave 14** *(blocked on Wave 13 completion)*
- [x] 22-16-PLAN.md — Wave 14: the boxed real-Oolite census spike, after the phase gate; no plan depends on it and it never blocks the phase (D-07; QUAL-13 groundwork)

**Cross-cutting constraints:** <!-- gsd:generated -->
- QUAL-12 standing gate: the frozen 20-seed run is 21 of 21 on the remote machine after this plan
- QUAL-12 standing gate: the frozen 20-seed run is 21 of 21 on the remote machine after this plan; the inert populator and its goldens are untouched

### Phase 22.1: Per-system main stations (INSERTED)

**Goal:** Each system's main station is built as Oolite builds it from the system's `planetinfo.plist` `station` key (`Universe.m:1550`, default `coriolis`): 1,824 systems keep the Coriolis, 167 get the Dodecahedron and 57 the Icosahedron, each with its own model, mass, collision radius, dock port (`tunnel_*`) and launch view, measured against the reference Oolite container; every Coriolis-only constant becomes per-station, and the station stays the static D2 entity
**Depends on:** Phase 22
**Parallel track**: none
**Requirements**: WORLD-20 (source todo `2026-11-18-per-system-main-station-types.md`, owner request 2026-11-26)
**First plan**: the measurements: the Dodecahedron and Icosahedron masses, collision radii, dock-port geometry (`tunnel_corners`, `tunnel_start_angle`, `tunnel_aspect_ratio`) and witchspace blockage read from the reference Oolite container (`tools/oolite-reference/run-remote.sh`, as quick task 261117-jji did for the Coriolis) and the shipdata entries, committed as fixtures before any code
**Split**: the phase lands in two halves. (a) The sim and content seam, which must land before Phase 23: the compiled per-station record (model key, mass, radius, dock port), `layout.ts` and `statics.ts` reading it, the dock corridor, collisions, aegis and the witchspace blockage per station. (b) The presentation, which may trail Phase 23: the vendored models and textures with provenance, the render loader in place of `loadCoriolis()`, the launch fly-out view through each slot shape, and the UI text.
**Success Criteria** (what must be TRUE):
  1. Every Coriolis system is byte-identical: no twin hash, debris golden, census golden or acceptance file moves, and the frozen `tests/acceptance` files (`STATION_RADIUS_M` included) are untouched; the frozen 20-seed run (Lave, a Coriolis) stays 21 of 21. The one admitted `tests/golden` change is `tests/golden/content/ships.json` gaining the Dodecahedron and Icosahedron station and subentity keys in `vendoredModelEntries` (their GLBs are vendored in this phase); its Coriolis entries and every other field stay byte-identical. (Ship positions in a Dodecahedron or Icosahedron system may legitimately differ from a Coriolis-for-all layout, because Oolite samples the aegis shell from `[[self station] collisionRadius] * 1.2`, `Universe.m:1813`; owner decision D-A of 2026-11-27.)
  2. A Dodecahedron or Icosahedron system builds its own station from the compiled record: model, mass, collision radius and dock port equal the measured Oolite values, and docking (manual and the docking computer), the dock corridor, collisions with ships, the aegis and the witchspace mass blockage use that station's values. "Collisions with ships" means (owner decision D-B of 2026-11-27): the per-kind station radius drives NPC proximity, placement and the dock corridor, and the per-kind hull drives the player's dock hull contact and laser hits, each tested per kind; the station stays a non-collider for NPC ships in this phase (E-135 unchanged here, taken up by the follow-up phase for E-135). The 2026-11-07 "non-blocking for lack of mass" decision is superseded by the measured mass.
  3. The player can launch from and dock at each of the three station types in the browser, with the fly-out view leaving through that station's slot shape, the station's model drawn, and the docked and launch UI naming the station type as Oolite does, not "Coriolis".
  4. Every place that assumed Coriolis constants reads the per-station record, and a guard fails on a new Coriolis-only constant outside the station record and the frozen acceptance files.

**Scope note**: the station stays static (D2): no station AI, no defence ships, no rotation change beyond each record's own spin. Rock hermits stay out (DEATH-04, AI-09, WORLD-12). Zaonce (Lave's neighbour, in `hyperspace.spec` and `routes.json`) becomes an Icosahedron; specs that fly there must follow.
**Implied work** (found by the 2026-11-26 audit; no requirement text changed):
  - Station flashers (`flasher` subentities, 14 on each station type in Oolite), absent today for every station. Deferred out of this phase by owner decision D-C of 2026-11-27 (absent for the Coriolis too, so unrelated to the station kind).
  - The hard-coded "Coriolis" strings and art in the UI and `index.html`.
  - Lighting from the sun's colour: ships and the station are lit pure white today and the dust has a fixed colour. Deferred out of this phase by owner decision D-C of 2026-11-27; it belongs with the tone-mapping todo `2026-11-27-tone-mapping-vs-oolite-aces.md`.
  - Whether the station becomes a collider for NPC ships (E-135), and `market_monitored` for the new types (LAW-07 relies on it).
  - The first-load headroom (about 535 KB below the 9 MiB ceiling): the two new station models must load lazily or fit.

**Standing gate**: QUAL-12 (the frozen 20-seed run after every plan touching `src/sim/world/**`)
**Decisions to settle**: whether the new station masses come from the compiled models (as the Coriolis since Phase 10) or from the container reading when they differ; how the fly-out view adapts to a six-sided slot
**Todos**: `2026-11-18-per-system-main-station-types.md`
**Plans:** 13 plans (half (a), the sim and content seam: 22.1-01 to 22.1-09; half (b), the presentation: 22.1-10 to 22.1-13)

Plans:
**Wave 1**
- [ ] 22.1-01-PLAN.md — Wave 1: the three stations and two real main stations measured in the reference Oolite container, committed as a numbers-only fixture with the oracle test; the `tunnel_*` premise corrected; owner decisions D-A, D-B and D-C recorded (WORLD-20)

**Wave 2** *(blocked on Wave 1 completion)*
- [ ] 22.1-02-PLAN.md — Wave 2: six station meshes vendored; one station record; the two new masses and radii compiled and pinned to the fixture; `system.station` a checked enum (WORLD-20)

**Wave 3** *(blocked on Wave 2 completion)*
- [ ] 22.1-03-PLAN.md — Wave 3: per-kind dock-port records and station hull artifacts with their loaders; the Coriolis files byte-identical (WORLD-20)

**Wave 4** *(blocked on Wave 3 completion)*
- [ ] 22.1-04-PLAN.md — Wave 4: the layout takes the station's compiled record (StationSpec); the boot station follows the starting system (WORLD-20)

**Wave 5** *(blocked on Wave 4 completion)*
- [ ] 22.1-05-PLAN.md — Wave 5: the witchspace blockage uses each station's own mass; the 2026-11-07 decision superseded (WORLD-20)
- [ ] 22.1-06-PLAN.md — Wave 5: the station laser target and ident through the layout; docking and the launch twist per slot (WORLD-20)
- [ ] 22.1-08-PLAN.md — Wave 5: the census and the launch corridor over each system's own station, measured first (digest and ship positions, at the measured radii); the census golden stays byte-identical (D-A) (WORLD-20)

**Wave 6** *(blocked on Wave 5 completion)*
- [ ] 22.1-07-PLAN.md — Wave 6: the station and its dock geometry follow the system at boot, Continue, F2 Load and every arrival; the refusal names the station (WORLD-20)

**Wave 7** *(blocked on Wave 6 completion)*
- [ ] 22.1-09-PLAN.md — Wave 7: the current and destination station hulls in the traffic-on session; the station-constants guard; seam (a) complete (WORLD-20)

**Wave 8** *(blocked on Wave 7 completion)*
- [ ] 22.1-10-PLAN.md — Wave 8: the station textures vendored and the Dodecahedron and Icosahedron GLBs built (WORLD-20)

**Wave 9** *(blocked on Wave 8 completion)*
- [ ] 22.1-11-PLAN.md — Wave 9: each system draws its own station model, loaded lazily with prefetch and late attach (WORLD-20)

**Wave 10** *(blocked on Wave 9 completion)*
- [ ] 22.1-12-PLAN.md — Wave 10: the docked screen names the station; launch and dock at all three types proven in the browser (WORLD-20)

**Wave 11** *(blocked on Wave 10 completion)*
- [ ] 22.1-13-PLAN.md — Wave 11: the phase gate on the remote, the deferred sun-colour lighting recorded (D-C), and the close-out (WORLD-20)

- QUAL-12 standing gate: the frozen 20-seed run is 21 of 21 on the remote machine after 22.1-04 and 22.1-06 (they touch `src/sim/world/**`) and at the phase gate
- Success Criterion 1: no Coriolis artifact, twin hash, census golden or frozen acceptance file changes, and no `tests/golden` file changes except the new stations' `vendoredModelEntries` in `tests/golden/content/ships.json` (plan 22.1-10; the Coriolis entry unchanged); the census golden stays byte-identical (D-A: measured first in plan 22.1-08; its owner-recorded fallback re-pin applies only to a measured non-Coriolis move); a moved Coriolis value is a seam bug, never a re-pin

### Phase 22.2: Station as a collider for NPC ships (E-135) (INSERTED)

**Goal:** The main station takes part in collisions with NPC ships and pods as Oolite's does (`CollisionRegion.m:327-343`: the station is the prime whenever it is in a pair), and a contact found through a subentity is resolved as Oolite resolves it, closing the recorded divergence E-135 (todo `2026-11-20-divergence-e135-station-collider-and-subentity-twice.md`), or the owner keeps the divergence with a recorded reason. Decide port-or-keep with the owner first; the player's damage-free dock hull contact (DOCK-09) is out of scope unless that decision says otherwise
**Requirements**: TBD (from the E-135 todo; owner decision 2026-11-27 moved it out of Phase 22.1, decision D-B)
**Depends on:** Phase 22.1
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 22.2 to break down)

### Phase 23: Priority AI, Traders and Pirates

**Goal**: Traffic comes alive in ordinary play: Oolite's priority AI, hand-ported to TypeScript as plain hashable data and matched against traces of the original JavaScript, flies traders, escorts and pirates; ships fire fore and aft lasers at the player and at each other, use fuel injectors as Oolite's AIs do, launch from the main station, and leave by docking, jumping out or landing without dying
**Depends on**: Phase 21 (the AI state shape, the seams and the aft weapons), Phase 22 (real populated ships to run on), Phase 22.1 (the sim half: traffic docks at and launches from the system's own station)
**Parallel track**: none
**Requirements**: AI-02, AI-03, CBT-19, CBT-20, WORLD-09
**Staged**: AI-04 (pirates pick victims, attack, send their cargo demand and break off when losing here; loot collection and the break-off on a met demand come in Phase 24, and the light hunters in Phase 25, where it is mapped). AI-13 (the reachability test and the no-silent-idle guard are built here for the trader, escort and pirate trees; mapped to Phase 26, where the acceptance runs assert no faulted AI)
**First plan**: the oracle and the tripwires before the engine port: the dev-only harness generalised into a recorder, with the trader, escort and pirate traces committed under `tests/oracles/ai/`; the reachability checklist; and the `on-event-handlers` tripwire settled before the priority AI defines `onEvent` (with the owner's edit of Phase 15 criterion 1 first, if the kill-time `shipTargetLost` is narrowed)
**Success Criteria** (what must be TRUE):
  1. The ported engine's decisions, parameter writes, random draws and wake times match the traces recorded from Oolite's original JavaScript for the trader, escort and pirate role AIs, across conditions, configurations, behaviours, reconsider timing, event handlers, groups, escorts and comms. The AI state is plain data that survives a snapshot round trip, and a populated system with fights hashes equal at 30, 60 and 144 Hz.
  2. Traders fly their route, flee when losing and call for help, and their escorts keep formation and defend them. Ships launch from the main station, and traders leave by docking at the station or jumping out at the witchpoint. A ship that leaves by docking, jumping or landing is removed through the stand-in without exploding, dropping cargo or crediting a kill, and the stand-in has one seam and a FIDELITY.md row.
  3. In an anarchy, pirates (all four in-scope variants) pick a victim by Oolite's odds rule and attack it, the player included and unprompted; they send Oolite's cargo demand and break off when losing. NPC ships fire fore and aft lasers at the player and at each other through Oolite's fire gate, and ships with fuel injectors use them for speed and burn fuel as Oolite's AIs do.
  4. Every behaviour the trader, escort and pirate trees can request exists natively or is a recorded cut, and a reachability test fails on any other; no ported ship falls back to idle silently, and a guard fails if an NPC with missiles reaches an AI.
  5. The frozen 20-seed run stays 21 of 21 after every plan that touches `src/sim/npc/**`, `src/sim/world/**` or `ships-npc.json`, and the flight-script and test-pilot worlds of Phases 14 and 17 replay byte-identically.

**Scope note**: police and light hunters keep `ai: null` until Phase 25, so nobody answers an offence yet and the player's legal status stays Clean. Pirates' loot collection (`CollectSalvage`) is a recorded stub until Phase 24, and their cargo demand cannot be met yet (jettison arrives in Phase 24). Comms reach the player on the HUD message line, with the text expanded in the UI only. The player's role is static (`player-unknown`, D8).
**Implied work** (flagged at roadmap creation; no requirement text changed):
  - The aft branch of the attack behaviours and the fire gate (running defense becomes reachable once a record carries an aft weapon) and per-facing weapon temperature, with new source-cited fixtures written before the port.
  - NPC fuel injection (speed and fuel) in the intercept and flee paths, with fixtures; the player's injectors stay out.
  - Escort release when a leader dies (`escortCheckMother`, noted at Phase 17), now that escorts spawn.
  - The decision-source guard and its Key Decisions row are superseded in the commit that lets AIs fire in ordinary play.
  - The HUD message line (one FIFO, 4 s a message) meets comms traffic; prioritise or cap it if the scenarios show flooding (M9).
  - Added by the 2026-11-26 audit: a "traffic on, AI off" test flag, so the nine browser specs and the Node twins built on inert ships keep passing once AI runs (build beside, switch on in one plan at the end, as Phase 22 did); a measured per-tick cost for about 100 AI ships and for the all-pairs collision chain; the explosion-near-station decisions E-147 and E-150; landing on the planet without planet collisions; engine exhaust plumes (Oolite draws them for the Cobra and 24 other hulls, Wegolite for none) measured against the draw-call budget.
  - Criterion 2's "ships launch from the main station" cannot be seen in ordinary play in this phase (launches come with the police in Phase 25 and repopulation in Phase 26): prove it with a Vitest scenario through the stand-in, and say so when the phase is planned.

**Standing gate**: QUAL-12
**Research flag**: High; needs phase research. The condition-by-condition port with draw-order checks, the harness stub growth per role, `reconsiderNow` and wake semantics (strict-greater, in seconds), synchronous against queued reactions, scan order and the 32-ship cap; fuel injection (in scope by D13 after the research recommended the cut) and the departure and launch stand-in (D3).
**Pitfalls to address**: C3 (closure state does not fit `params`), C4 (draw order and short-circuit order), C5 (strict-greater timing), C10 (silent idle fallbacks), C11 (removal paths), M1 (groups, leaders and escorts), M2 (scan order and the 32-ship cap), M3 (comms change behaviour), M4 (the player's role, static by D8), M5 (per-tick cost with tens of ships), M9 (the HUD message FIFO), M10 (behaviour that never ends)
**Decisions to settle**: the stand-in's approach and retire distances and where station launches and planet departures place ships; the `shipTargetLost` narrowing; which requested behaviours are recorded cuts. Before the phase pins its goldens: the pod and plate lifetime rule and whether `MAX_ENTITIES` widens (the census peak is 134 of 152, and pods and plates never expire); whether the NPC scoop state and the player's "marked for fines" flag need fields (the snapshot stays v5 unless the owner approves an amendment; the save bump is Phase 24's)
**Todos**: `2026-11-18-narrow-kill-time-ship-target-lost.md` (tripwire `on-event-handlers`); `2026-11-25-missiles-and-ecm.md` (the guard named in CBT-19); `2026-11-17-skip-shiphit-for-a-doomed-target.md` and `2026-11-19-player-ident-lock-in-target-targets-self.md` (both `resolves_phase: 23`); candidate: `2026-11-20-hud-message-word-wrap-like-oolite.md` (comms lines longer than 60 characters)
**Plans**: TBD

### Phase 24: Loot, Scooping and Jettison

**Goal**: Cargo changes hands as in Oolite: the player buys Fuel Scoops and scoops the pods destroyed ships leave, each carrying a commodity, jettisons cargo to buy off a pirate, pirates collect loot, and scooped pods are held as Oolite holds them until docking and survive save and load in schema v6
**Depends on**: Phase 21 (pod identity), Phase 23 (the AI engine, and pirates that demand cargo)
**Parallel track**: none
**Requirements**: CBT-11, LAW-06, AI-12, SAVE-11
**First plan**: the save v6 shape, designed once with all three fields (legal status, kill tally, scooped-pod list) before any held pod is written; an older save is corrupt, as at v5
**Success Criteria** (what must be TRUE):
  1. The player can buy Fuel Scoops on the F3 equipment screen, and they can be damaged and repaired there like other equipment. With working scoops, a pod met by Oolite's scoop geometry and tractor rule is drawn in and scooped with its commodity and amount; a damaged or missing scoop, or a full hold, refuses as Oolite does.
  2. Scooped pods are held as Oolite holds them until docking, when they join the hold. An in-flight save keeps them, and they survive save and load in schema v6, which arrives in one bump adding legal status, the kill tally and the scooped-pod list, with no migration (an older save is reported corrupt).
  3. The player can jettison cargo as a pod, and a pirate whose cargo demand is met breaks off as in Oolite.
  4. NPC ships collect pods with Oolite's collect and tractored behaviours: a pirate that destroys or robs a ship goes after its pods, which completes the pirate loop of Phase 23, and a scooping scenario hashes equal at 30, 60 and 144 Hz.

**Scope note**: fuel scooping at the sun stays with the hazards, although the same equipment key serves both (m6). Scooped contraband carries no penalty yet (LAW-07, todo `2026-11-25-cargo-legality-penalties`). No escape capsules are spawned, so there is nothing to rescue. Legal status and the kill tally are saved but stay Clean and zero until Phase 25 writes them.
**Implied work** (flagged at roadmap creation; no requirement text changed):
  - The tractor stage and the scoop branch of the collision stage, shared by the player and NPCs, with source-cited fixtures.
  - A pod lifetime or eviction rule decided from measured data, since scavengers are deferred and nothing else removes pods (C12, research D7c).
  - Pods on the scanner, the jettison key (rebindable and listed in the controls panel), the scoop and jettison messages on the HUD, and Fuel Scoops in the F3 visible set.
  - The Key Decisions row on saving: NPCs are still regenerated, so a Continue brings killed pirates back, while standing, kills and held pods persist.

**Standing gate**: QUAL-12
**Research flag**: Medium; needs phase research. The tractor force constants, the `canScoop` geometry (the player's underside rule), hold capacity in pods, jettison (in scope by D10 after the research recommended it out) and the held-pod model (D7).
**Pitfalls to address**: M6 (scooping is a two-stage tractor process in the collision chain), m6 (one equipment key for cargo and fuel scooping), C12 (pods that never expire)
**Decisions to settle**: the pod lifetime rule, for alloy plates as well as pods (unless Phase 23 settled it); that pods and plates block a witchspace jump as in Oolite (D-08); scooping with a damaged scoop; what the manifest shows for held pods in flight; the jettison key; a draw-call re-measure with pods on the scanner and in view
**Todos**: `2026-11-25-cargo-legality-penalties.md` (stays deferred; scooped contraband is legal until it lands)
**Plans**: TBD
**UI hint**: yes

### Phase 25: Police, Legal Status, Bounty and Rating

**Goal**: The law works by Oolite's rules: attacks seen by police or the main station make the player an Offender or a Fugitive, police and light bounty hunters hunt offenders, the station marks offenders and launches police, kills of wanted ships pay their bounty at the kill and build the combat rating, offenders are fined on docking, fugitives are refused docking clearance, and standing survives save and load
**Depends on**: Phase 21 (the standing and station fields, the hit-reaction stage), Phase 23 (the AI engine and the launch stand-in), Phase 24 (save v6, `CollectSalvage`)
**Parallel track**: none
**Requirements**: AI-05, AI-04, LAW-01, LAW-02, LAW-03, LAW-04, LAW-08
**First plan**: kill credit (D11): symmetric credit for every consumer this phase adds (the bounty, the tally, the "attacked police" mark), a test per case, the `kill-credit-consumers` tripwire updated and the mutual-kill todo closed
**Success Criteria** (what must be TRUE):
  1. A player who fires on or kills a clean ship in sight of police or the main station becomes an Offender, and then a Fugitive, by Oolite's bit-flag rules, including the `bounty & 7 != 7` precedence as Oolite evaluates it (a FIDELITY.md row, never silently fixed). The F5 status screen shows Clean, Offender or Fugitive, and legal status halves on each hyperspace arrival.
  2. Police attack offenders and fugitives by legal status and government, matching traces recorded from Oolite's police AI. The main station raises its alert level, marks offenders seen nearby and ships that hit it, and launches police. In an anarchy or a feudal system, light bounty hunters hunt offenders (pirates, and an offending player) and collect salvage.
  3. Killing a ship with a bounty pays 10 x bounty at the moment of the kill with Oolite's message; the credit goes to the ship whose damage zeroed the target's energy, whatever the entity order, and the player is paid only if alive.
  4. Kills that count toward Oolite's combat rating raise the kill tally, and the F5 status screen shows the rating from Harmless to Elite. An offender whom police have marked for fines is fined on docking at the main station by Oolite's rule, and the tally and legal status survive save and load.
  5. The main station refuses docking instructions and the docking computer to a fugitive with Oolite's messages, while manual docking is never refused.

**Scope note**: the player's role stays static (`player-unknown`, D8), so a first laser hit on a clean ship is an offence with no forgiveness. There are no station defence ships and no full station AI (AI-14), and the station stays a static, not a dynamic entity (D2). No escape capsules, so no capsule rewards (LAW-05), and no contraband penalties (LAW-07).
**Implied work** (flagged at roadmap creation; no requirement text changed):
  - The police and light-hunter trees with their recorded traces; the offence marks as AI handlers and engine marks (`| 7`, `| 15`, `| 63`, `| 8`, `| 64`); the station responder; the police launch through the Phase 23 stand-in.
  - Scanner kinds for police and offenders, the fine and refusal messages, and HUD message priority (M9).
  - Property tests: legal status never falls except by Oolite's rules (halving at arrival, the paid fine), and the rating is monotone in kills.

**Standing gate**: QUAL-12
**Research flag**: Medium; needs phase research. The legal flows and the station responder, the scope of the docking check (manual docking is not refused), and the D11 credit cases.
**Pitfalls to address**: C6 (the damage path's AI-visible side effects), C7 (legal status is a bit-flag score kept mostly in AI scripts), C8 (kill credit, bounty and tally are the first consumers of three tripwires), M4 (the player's role history), M9 (the HUD message FIFO), m1 (units and the reward formula), m2 (rating thresholds and display), m3 (halving only at a jump), m5 (fines and `markedForFines` are a separate feature)
**Decisions to settle**: how much of `launchPolice` the station responder takes (D2's scope); the fine's rounding and the partial payment when credits are short; message wording where Oolite's text depends on the build; whether LAW-07 (contraband penalties) joins, being cheap once `markAsOffender` exists; the autopilot disengage on a damaged docking computer (the Phase 19 note); a draw-call re-measure with police in the fight
**Todos**: `2026-11-18-mutual-kill-credit-symmetry.md` (first plan; tripwire `kill-credit-consumers`)
**Plans**: TBD
**UI hint**: yes

### Phase 26: Repopulation and Milestone Acceptance

**Goal**: The system stays alive and bounded for as long as the player flies, repopulated every 20 s by Oolite's rates, and the milestone's acceptance holds end to end: in an anarchy pirates attack unprompted, a destroyed pirate pays its bounty and leaves cargo to scoop, firing on a clean trader brings the police, determinism and the release gate hold with full traffic, and traffic is compared with headless Oolite
**Depends on**: Phases 21 to 25 (repopulation spawns every role, so every role has its AI first)
**Parallel track**: none
**Requirements**: WORLD-19, AI-13, QUAL-12, QUAL-13
**First plan**: the thresholds: the new traffic acceptance scenario's thresholds and the Oolite comparison's thresholds, committed before any run
**Success Criteria** (what must be TRUE):
  1. Every 20 s the system gains witchpoint arrivals and station launches at Oolite's rates, matching recorded fixtures of Oolite's repopulator, deterministically from the world's forked streams; a soak of a full anarchy with repeated kills stays under a populator ceiling and an entity-cap rule set from the measured data and recorded.
  2. In an anarchy, pirates attack the player unprompted; a player who destroys a pirate is paid its bounty and can scoop its cargo; a player who fires on a clean trader becomes an Offender and is attacked by police. Each is a Vitest scenario, and one opt-in browser journey plays the whole story.
  3. With full traffic and combat, the world hash is equal at 30, 60 and 144 Hz. The new traffic acceptance scenario, in its own file, runs 20 seeds against the thresholds committed first and asserts no faulted AI and no silent idle fallback in any ported tree, and the frozen 20-seed run is 21 of 21 after the last plan that touches `src/sim/npc/**`, `src/sim/world/**` or `ships-npc.json`.
  4. Traffic composition and behaviour rates are compared against headless Oolite (`tools/oolite-reference`; the reference scripts hashed against the checkout first, several runs per scenario, game-clock logs) against the thresholds committed first, and the result is recorded.
  5. The release gate holds: `verify-full` exits 0 on the remote test machine, and every divergence of the milestone has its FIDELITY.md row.

**Scope note**: a Continue regenerates the system at the leg anchor (killed pirates return) and re-arms the repopulation clock from the world seed; standing, kills and held pods persist. The real-Oolite comparison gives rates, not an oracle: the player-attack acceptance is an in-Wegolite test.
**Implied work** (flagged at roadmap creation; no requirement text changed):
  - The milestone close-out folded in: FIDELITY.md rows and excerpts, the Key Decisions rows and amendments listed under "Recorded decisions this milestone changes", the CHANGELOG entries under `Unreleased`, the NOTICE and ASSETS provenance check, the CI e2e timeout margins of the new specs, and the milestone audit.

**Standing gate**: QUAL-12, completed here (criterion 3).
**Research flag**: Low; standard patterns, except the Oolite comparison design (research PITFALLS.md, "How comparing against headless Oolite can mislead": hash the reference JavaScript first, several runs per scenario with thresholds written first, game-clock rather than wall-clock logs).
**Pitfalls to address**: C12 (the cap and the collapse of traffic), M5 (per-tick cost with up to about 110 ships), M8 (the acceptance sentence assumes engine state), M10 (detectors and behaviour that never ends), the headless-Oolite comparison traps, m7
**Decisions to settle**: the populator ceiling and the entity-cap rule (repopulation ports `systemWillRepopulate`, with recorded fixtures, and the pirates that launch from the planet); the Oolite comparison's sample size (about 20 samples a system) and its exclusion of the cut ship classes, counting light hunters by their group leader's role (Oolite's medium and heavy hunter packs carry `hunter` wingmen that Wegolite cuts with the packs); the traffic scenario's thresholds; whether the traffic run, which plays with collisions on as ordinary play does, closes the collisions-on todo or a separate collisions-on variant of the frozen run is still wanted (owner)
**Todos**: `2026-11-20-acceptance-run-with-collisions-on.md` (owner question above); `2026-11-14-measure-oolite-reference-in-docker.md` (the reference container); `2026-11-16-ci-e2e-timeout-margins.md` (the 60 % rule for the new specs); `2026-11-16-phase-14-review-followups.md` (IN-05 still needs the owner's trailer); candidate: `2026-11-20-collision-chain-prefilter-all-pairs.md` (if the soak's per-tick cost needs it)
**Plans**: TBD

### Coverage

26 of 26 v2.4 requirements are mapped, each to exactly one phase (the phase that completes it). The traceability table is in `.planning/REQUIREMENTS.md`.

| Phase | Count | Requirements |
|-------|-------|--------------|
| 21 | 3 | FOUND-20, DATA-17, DATA-18 |
| 22 | 2 | WORLD-08, QUAL-09 |
| 22.1 | 1 | WORLD-20 |
| 23 | 5 | AI-02, AI-03, CBT-19, CBT-20, WORLD-09 |
| 24 | 4 | CBT-11, LAW-06, AI-12, SAVE-11 |
| 25 | 7 | AI-05, AI-04, LAW-01, LAW-02, LAW-03, LAW-04, LAW-08 |
| 26 | 4 | WORLD-19, AI-13, QUAL-12, QUAL-13 |

Phase 25 carries the most requirements because the law is one mechanism seen from seven sides (marks, police, hunters, bounty, rating, fines, the docking check); splitting it would separate the police from the legal status they act on. QUAL-09, CBT-11, AI-04, AI-13, QUAL-12 and QUAL-13 are staged across phases (see "Staged verification"); each is mapped once, to the phase that completes it.

## Later (unscheduled)

The former plan's labels (Phases 15-23 of the v2.1 Combat & Traffic plan) are history only: v2.3 reused the numbers 15-20 and v2.4 uses 21-26 for their own phases. v2.4 takes the priority AI with traders, escorts, pirates, police and light hunters, the populator with repopulation, legal status, bounties, fines and the combat rating, and cargo scooping and jettison. Still unscheduled, in no particular order, and given fresh phase numbers when their milestone starts: hazards (sun, planet, heat and alert condition: DEATH-03, DEATH-05, DOCK-08) and docking-slot scrape damage (DOCK-09); the escape pod and insurance, NPC escape capsules and capsule rewards (AI-10, LAW-05); missiles, ECM and defensive equipment (CBT-09, CBT-10, AI-06); station defence ships and the full station AI (AI-14); the faithful station queue and NPC docking (WORLD-13); scavengers, shuttles, medium and heavy hunters, assassins and trader opportunists (WORLD-08b); contraband penalties (LAW-07); dynamic player roles (LAW-09); the player's fuel injectors (CBT-21); asteroids and mining (the mining half of the former AI-12); audio and music; performance hardening with traffic and QUAL-01. The v2.4 deferrals are listed under Future Requirements in `.planning/REQUIREMENTS.md`; the older forms, with IDs and the former phase mapping, stay in `.planning/milestones/v2.0-REQUIREMENTS.md` and `.planning/milestones/v2.0-ROADMAP.md`.

Pending todos (41 in `.planning/todos/pending` on 2026-11-25) can run as quick tasks or join a phase by owner decision; the ones v2.4's phases consume are named in each phase's Todos line. The docked F-key bugs (`2026-11-22-bug-docked-f-keys-unreliable.md`, `2026-11-22-bug-f6-toggles-back-to-previous-screen.md`, now in `.planning/todos/completed`) were fixed by debug session docked-f-keys and released in `v0.8.0`.

## Progress

**Execution order:** v2.4: 21, 22, 22.1, 23, 24, 25, 26, in order.

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
| 20. Player Death and Game Over | v2.3 | 13/13 | Complete    | 2026-11-24 |
| 21. Roster, State Shape and Seams | v2.4 | 19/19 | Complete    | 2026-11-26 |
| 22. Initial Population | v2.4 | 16/16 | Complete    | 2026-11-26 |
| 22.1 Per-system main stations | v2.4 | 0/TBD | Not started | - |
| 22.2 Station as a collider for NPC ships (E-135) | v2.4 | 0/TBD | Not started | - |
| 23. Priority AI, Traders and Pirates | v2.4 | 0/TBD | Not started | - |
| 24. Loot, Scooping and Jettison | v2.4 | 0/TBD | Not started | - |
| 25. Police, Legal Status, Bounty and Rating | v2.4 | 0/TBD | Not started | - |
| 26. Repopulation and Milestone Acceptance | v2.4 | 0/TBD | Not started | - |

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

### Phase 999.2: Visual fidelity: tone mapping, sun-coloured lighting and station flashers (BACKLOG)

**Goal:** Bring the rendered image closer to what Oolite shows, in one place, because the three items move the same visual calibration. (1) Tone mapping: Oolite tone-maps the whole frame with ACES in `oolite-final.fragment` (`:187-215`, `:817-819`; SDR default `OOSDR_TONEMAPPER_ACES`, `MyOpenGLView.m:257`), while Wegolite uses the calibrated-LDR contract of `src/render/exposure.ts` (`NoToneMapping`, one point calibrated). Measure several points against the reference Oolite container and decide (todo `2026-11-27-tone-mapping-vs-oolite-aces.md`). (2) Lighting from the system sun's colour: ships and stations are lit pure white today (todo `2026-11-27-lighting-from-sun-colour`, created by plan 22.1-13). (3) Station flashers: the 14 `flasher` subentities of each station template, absent for every station (todo `2026-11-27-station-flashers`, created by plan 22.1-11).

**Requirements:** TBD
**Plans:** 0 plans

Constraints and notes:
- Deferred out of Phase 22.1 by owner decision D-C (2026-11-27); placed in the backlog for the next milestone by owner decision the same day.
- Each change is a fidelity decision: record it in PROJECT.md Key Decisions and FIDELITY.md, and re-pin only the visual pins it moves with the cause measured (Node = browser).
- Probe evidence only, no screenshot or pixel-diff evidence (PROJECT.md D-08); the reference container's screenshots stay out of the repository and only the numbers are committed.

Plans:
- [ ] TBD (promote with /gsd-review-backlog when ready)
