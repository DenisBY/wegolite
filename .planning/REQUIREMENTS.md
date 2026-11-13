# Requirements: Wegolite

**Defined:** 2026-11-02
**Milestone v2.0 defined:** 2026-11-11; narrowed to Phase 8 only on 2026-11-13 (owner decision, see `.planning/ROADMAP.md` and PROJECT.md Key Decisions)
**Core Value:** A player can launch, fly, dock, and complete a profitable trade run between two star systems entirely in the browser — faithful to Oolite's rules, data, and feel.

## v1 Requirements (archived)

The v1.0 milestone (Phases 1-7) shipped as `v0.1.0` on 2026-11-08 and was archived on 2026-11-10.
The full v1 requirement list (68 requirements, 67 complete) and its traceability table are in
`.planning/milestones/v1.0-REQUIREMENTS.md`. QUAL-01, still open, is deferred again (2026-11-13) and carried into v2.1 below.

## v2.0 Requirements — Foundation


Research: `.planning/research/SUMMARY.md` (and STACK, FEATURES, ARCHITECTURE, PITFALLS in the same directory).
Oolite (pinned `7437f22`) is the behavioural and data source of truth. Every ported mechanic gets a `FIDELITY.md` row;
every deliberate divergence is recorded in PROJECT.md Key Decisions. Oolite's gameplay JavaScript is ported by hand to
TypeScript; it is never executed at runtime.

### Foundation

- [ ] **FOUND-10**: Existing v1 play is unchanged after `src/app/game-session.ts` is split into subsystems: every v1 golden, unit and e2e test passes without regeneration, and the probe shape is unchanged
- [ ] **FOUND-11**: The simulation holds many entities (ships, stations, missiles, cargo pods, wreckage) with stable ids, never reused within the world that issued them (each new world restarts its dynamic ids, and no entity id outlives its world; owner decision 2026-11-12, Phase 8 CONTEXT D-06), and canonical id-order iteration; with no NPCs present the world hash equals the v1 flight hash
- [x] **FOUND-12**: All simulation randomness comes from serialisable seeded streams forked per entity and purpose; `src/sim` has no `Math.random`, `Date` or wall clock, and a live world and a restored world hash identically after 1,000 ticks
- [x] **FOUND-13**: AI code reads the world only through a typed `WorldView` and acts only through a typed `ShipControl`; AI state is plain serialisable data with integer tick timers
- [ ] **FOUND-14**: Tests can advance the simulation by N ticks through the test hook, and NPC traffic is off by default in browser tests and opt-in per spec

## v2.1 Requirements — Combat & Traffic (planned, unscheduled)

Moved out of v2.0 on 2026-11-13 with their phase mappings unchanged (Phases 9-23 in the v2.1 section of `.planning/ROADMAP.md`). They are tracked, not scheduled: before v2.1 starts, the milestone workflow re-checks them against what Phase 8's world core proved. Wording that says "v2.0" below was written before the move.

QUAL-01 (carried from v1) is deferred again by the owner on 2026-11-13; it stays with Phase 23 and its "measured with traffic" wording.

### Content

- [ ] **DATA-10**: The ship models and textures needed by the v2.0 roles (traders, pirates, police Vipers, hunters, shuttles, scavengers, missiles, cargo pods, escape capsules, wreckage, asteroids, rock hermit) are compiled from the pinned Oolite snapshot with provenance in `ASSETS.md`/`NOTICE` and the drift gate
- [ ] **DATA-11**: Every v2.0 ship carries its Oolite combat stats (energy, recharge, speed, thrust, weapons, missiles, bounty, roles, AI) and its mass computed from a build-time octree as Oolite does
- [ ] **DATA-12**: Sound effects and music are vendored with provenance; the CC BY 3.0 laser sounds are attributed; music ships only once its per-file provenance is resolved

### Save

- [ ] **SAVE-07**: Saves move to schema v3 in one bump with all v2.0 fields (world epoch, legal status, kills, rating, missile pylons, laser mounts, new equipment); v2 saves migrate in order and older builds treat v3 saves as inert future-version saves
- [ ] **SAVE-08**: NPCs are not saved: a save carries the world seed, counters and next entity id, and loading regenerates the canonical world at the saved leg anchor deterministically (the same world a fresh arrival at that anchor produces); a save taken in flight resumes at the leg anchor. Verified in stages: schema and anchor semantics first, regenerated inert world next, full traffic last

### World & Traffic

- [ ] **WORLD-07**: Player sees NPC ships flying in the system, drawn within the draw-call budget and shown on the scanner
- [ ] **WORLD-08**: Each system is populated with traders, pirates, police, hunters, shuttles and scavengers at Oolite's rates for its government, economy, tech level and neighbours, and is repopulated over time
- [ ] **WORLD-09**: NPC ships launch from and dock at the main station through a simplified queue (a recorded divergence from Oolite's station queue)
- [ ] **WORLD-10**: Mass lock and hyperspace jump blockage take nearby NPC ships into account as in Oolite
- [ ] **WORLD-11**: The simulation keeps running while the galactic chart is open in flight, as in Oolite (supersedes the v1 freeze)
- [ ] **WORLD-12**: Asteroid fields and a rock hermit appear where Oolite places them
- [ ] **WORLD-14**: A hyperspace jump clears every non-static entity at jump commit and the destination is populated deterministically on arrival

### AI

- [ ] **AI-01**: NPC ships move with Oolite's NPC flight model and steer with its native behaviours (idle, tumble, fly to destination, face, intercept, attack, flee, escort, avoid collision, collect, tractored, mining, land on planet)
- [ ] **AI-02**: The priority-AI framework (`PriorityAIController`: conditions, configurations, behaviours, branches, reconsider timing, event handlers) is ported so that role trees run as in Oolite
- [ ] **AI-03**: Trader, shuttle, scavenger and escort ships behave per Oolite's role AIs (route, flee when losing, call for help, dock)
- [ ] **AI-04**: Pirates and bounty hunters hunt, attack, demand cargo and break off per Oolite's role AIs
- [ ] **AI-05**: Police and the station defend the station, attack offenders and fugitives per government, and launch defenders
- [ ] **AI-06**: Missiles home on their target per Oolite's missile AI
- [ ] **AI-07**: Every AI symbol in the pinned Oolite sources (complete inventory, not only the chosen ones) is listed in a coverage manifest as ported, stubbed or not ported with a reason, and checked in CI; ported decisions are checked against the oracle the owner selects at the Phase 14 gate: by default a dev-only differential harness that runs the original Oolite JavaScript in Node against a stub host (never shipped to the browser), and independent source-cited traces only if the owner accepts that fallback
- [ ] **AI-08**: Ships with `nullAI`/`dumbAI` plist AIs behave as in Oolite (inert ships stay inert; cargo pods and wreckage tumble). Escape capsules fly under `oolite-shuttleAI.js` (`shipdata.plist`, `oolite_template_escape-capsule`) and belong to AI-10
- [ ] **AI-09**: The rock hermit behaves per Oolite's `oolite-rockHermitAI.js` (launches miners, scavengers and defenders)
- [ ] **AI-10**: NPC ships eject escape capsules by Oolite's rules when losing a fight, and the capsule flies as in Oolite

### Combat

- [ ] **CBT-04**: Player can switch between fore, aft, port and starboard views and fire the laser mounted on the current facing
- [ ] **CBT-05**: Player can buy pulse, beam, military and mining lasers per facing at F3; lasers have Oolite's damage, range, recharge and heat, and cut out when overheated
- [ ] **CBT-06**: Fore and aft shields and energy banks absorb and recharge damage at Oolite's rates; the HUD shows shields, energy, laser temperature and cabin temperature
- [ ] **CBT-07**: Lasers hit ships by their Oolite octree hull, and the same hit and damage rule applies to any ship firing through `ShipControl`
- [ ] **CBT-15**: NPC ships fire their lasers at the player and at each other under their own AI
- [ ] **CBT-08**: Ships take damage, lose equipment to internal hits, and explode into wreckage and cargo pods; ship-to-ship collisions damage both ships by mass and closing speed
- [ ] **CBT-09**: Player can arm, lock and fire missiles and hardened missiles, and NPCs launch missiles at the player; missile blasts damage by distance
- [ ] **CBT-10**: Player can fire an ECM that destroys standard missiles in range, as in Oolite
- [ ] **CBT-11**: Player can scoop cargo pods with a fuel scoop and jettison cargo
- [ ] **CBT-12**: Player can repair damaged equipment at F3 at Oolite's repair price
- [ ] **CBT-13**: Player can buy and use an energy unit, shield boosters and a heat shield with Oolite's effects

### Law & Progression

- [ ] **LAW-01**: Attacking or killing ships in sight of police or the main station raises legal status by Oolite's bit-flag rules; F5 shows Clean, Offender or Fugitive
- [ ] **LAW-02**: Police respond to the player by legal status and government; offenders are fined at the main station; legal status halves on hyperspace
- [ ] **LAW-03**: The main station refuses docking instructions and the docking computer to fugitives
- [ ] **LAW-04**: Killing ships with a bounty pays the bounty, kills count toward Oolite's combat rating, and F5 shows the rating
- [ ] **LAW-05**: Player can scoop NPC escape capsules and is rewarded for them on docking
- [ ] **LAW-06**: Player can pay off pirate demands by dumping cargo, and pirates break off as in Oolite
- [ ] **LAW-07**: Launching from the main station with export contraband raises legal status as in Oolite, and using the docking computer while an offender can incur a fine and costs Oolite's extra time

### Death & Hazards

- [ ] **DEATH-01**: Player dies when energy reaches zero; without an escape pod the game is over and the last save can be loaded
- [ ] **DEATH-02**: Player can buy an escape pod and eject with Escape (double press); the pod keeps ship and equipment, wipes cargo and legal status, and advances the clock by Oolite's rule (tested at its boundaries), as in Oolite
- [ ] **DEATH-03**: Cabin temperature rises near the sun and damages the ship when too hot; contact with the planet or the sun destroys the ship
- [ ] **DEATH-04**: Player can mine asteroids with a mining laser and scoop the fragments
- [ ] **DEATH-05**: With a fuel scoop the player refuels by skimming the sun, and flying low through a planet's atmosphere heats the ship, at Oolite's rates

### Docking & Alerts

- [ ] **DOCK-08**: The HUD shows Oolite's alert condition (green, yellow, red) by its rules, and the docking computer refuses to engage in red alert
- [ ] **DOCK-09**: Scraping the docking slot damages the ship as in Oolite (supersedes v1's damage-free scrape)
- [ ] **DOCK-10**: Docking restores shields and energy to full and resets laser and cabin temperature, as in Oolite

### Input

- [ ] **INPUT-01**: Default bindings follow Oolite for the new actions: Escape (double press) ejects, P pauses, R is ident; target-station moves to a free key; all remain rebindable and the controls panel lists them. The Escape/P migration lands before any phase that needs Escape to eject

### Audio

- [ ] **AUD-01**: The game plays Oolite's player-bound sound effects (lasers, hits, explosions, missiles, alerts, scoop, docking and hyperspace) through the Web Audio API, non-positional as in Oolite
- [ ] **AUD-02**: Audio starts only after a user gesture, suspends on pause, hidden tab and context loss, and has volume and mute settings
- [ ] **AUD-03**: Music plays on the title screen and while the docking computer flies, once provenance is resolved

### Quality

- [ ] **QUAL-01**: The game holds 60 fps at 1080p on mid-range desktop hardware within a documented draw-call/triangle budget (carried from v1; now measured with traffic)
- [ ] **QUAL-09**: A populated combat scene stays within the 50 draw-call budget in the container budget test
- [ ] **QUAL-10**: The simulation cost per frame with full traffic stays under a numeric bound declared before the hardening phase starts (deterministic workload gate in the container plus reference-desktop timing by a protocol fixed in `docs/PERFORMANCE.md`), and cold-start transfer stays under the first-load ceiling (NPC assets load lazily)

## Future Requirements

Deferred to later milestones. Tracked but not in the current roadmap.

- **PROG-01**: Missions, contracts, and rankings beyond the combat rating
- **PROG-03**: Shipyard with multiple purchasable ships
- **PROG-04**: Galactic hyperdrive and travel around all eight galaxies
- **WORLD-13**: Faithful port of Oolite's station launch/dock queue and docking instructions for NPCs
- **CBT-14**: Thargoids, witchspace interception and cascade weapons
- **PRES-02**: Mobile and touch controls
- **PRES-03**: Tutorial overlay
- **PRES-04**: Multiple save slots with JSON export/import
- **PRES-05**: Slow autopilot docking behaviour for the docking computer
- **PRES-06**: ANA route plotting and advanced compass modes
- **PRES-07**: Gamepad and mouse flight controls
- **PRES-08**: Offline play as an installable PWA
- **PRES-09**: Trading conveniences (remembered prices, cargo profit)
- **SAVE-09**: Mid-leg saves with a full world snapshot

Superseded by v2.0 requirements: CBT-01 (→ CBT-04..CBT-10), CBT-02 (→ WORLD-08, AI-03..AI-05, LAW-04), CBT-03 (→ CBT-08, DEATH-01, DEATH-02), PROG-02 (→ LAW-01..LAW-04), PRES-01 (→ AUD-01..AUD-03).

## Out of Scope

| Feature | Reason |
|---------|--------|
| OXP expansion packs and runtime scripting | Out of scope for now; revisit only by explicit decision (PROJECT.md) |
| Running Oolite's original JavaScript at runtime | Rejected for v2.0: closure-held AI and timer state cannot be saved or hashed |
| Multiplayer or any server component | Static client; no accounts, no network runtime |
| Database or server-side storage | Saves live in IndexedDB |
| Newtonian physics or yaw controls | Breaks Oolite's documented flight feel |
| Rebalanced prices, ship stats, economy or combat numbers | The project's value is fidelity to Oolite |
| NPC combat sounds and positional audio | Core Oolite plays none (`AL_NONE`, cockpit-fixed sources) |
| Cloaking, military jammer, trumbles, trade-in renovation, docking-clearance protocol, target memory, custom views | Oolite anti-features for this milestone (research FEATURES.md) |
| Native desktop or mobile app wrappers | Browser delivery is the point |
| Cloud saves and user accounts | Requires a backend |

## Traceability

Which phases cover which requirements. Filled by the v2.0 roadmap on 2026-11-11, revised after external review the same day, and split on 2026-11-13 when v2.0 was narrowed to Phase 8. Each requirement maps to the phase that completes it.

### v2.0 — Foundation

| Requirement | Phase | Status |
|-------------|-------|--------|
| FOUND-10 | Phase 8 | Pending |
| FOUND-11 | Phase 8 | Pending |
| FOUND-12 | Phase 8 | Complete |
| FOUND-13 | Phase 8 | Complete |
| FOUND-14 | Phase 8 | Pending |

### v2.1 — Combat & Traffic (planned, unscheduled)

| Requirement | Phase | Status |
|-------------|-------|--------|
| DATA-10 | Phase 9 | Pending |
| DATA-11 | Phase 10 | Pending |
| DATA-12 | Phase 9 | Pending |
| SAVE-07 | Phase 11 | Pending |
| SAVE-08 | Phase 22 | Pending |
| WORLD-07 | Phase 14 | Pending |
| WORLD-08 | Phase 22 | Pending |
| WORLD-09 | Phase 18 | Pending |
| WORLD-10 | Phase 12 | Pending |
| WORLD-11 | Phase 12 | Pending |
| WORLD-12 | Phase 22 | Pending |
| WORLD-14 | Phase 12 | Pending |
| AI-01 | Phase 14 | Pending |
| AI-02 | Phase 18 | Pending |
| AI-03 | Phase 18 | Pending |
| AI-04 | Phase 20 | Pending |
| AI-05 | Phase 19 | Pending |
| AI-06 | Phase 21 | Pending |
| AI-07 | Phase 18 | Pending |
| AI-08 | Phase 16 | Pending |
| AI-09 | Phase 22 | Pending |
| AI-10 | Phase 20 | Pending |
| CBT-04 | Phase 13 | Pending |
| CBT-05 | Phase 13 | Pending |
| CBT-06 | Phase 13 | Pending |
| CBT-07 | Phase 13 | Pending |
| CBT-15 | Phase 20 | Pending |
| CBT-08 | Phase 15 | Pending |
| CBT-09 | Phase 21 | Pending |
| CBT-10 | Phase 21 | Pending |
| CBT-11 | Phase 16 | Pending |
| CBT-12 | Phase 16 | Pending |
| CBT-13 | Phase 21 | Pending |
| LAW-01 | Phase 19 | Pending |
| LAW-02 | Phase 19 | Pending |
| LAW-03 | Phase 19 | Pending |
| LAW-04 | Phase 16 | Pending |
| LAW-05 | Phase 20 | Pending |
| LAW-06 | Phase 20 | Pending |
| LAW-07 | Phase 19 | Pending |
| DEATH-01 | Phase 15 | Pending |
| DEATH-02 | Phase 16 | Pending |
| DEATH-03 | Phase 15 | Pending |
| DEATH-04 | Phase 22 | Pending |
| DEATH-05 | Phase 15 | Pending |
| DOCK-08 | Phase 15 | Pending |
| DOCK-09 | Phase 15 | Pending |
| DOCK-10 | Phase 13 | Pending |
| INPUT-01 | Phase 13 | Pending |
| AUD-01 | Phase 17 | Pending |
| AUD-02 | Phase 17 | Pending |
| AUD-03 | Phase 17 | Pending |
| QUAL-01 | Phase 23 | Pending |
| QUAL-09 | Phase 23 | Pending |
| QUAL-10 | Phase 23 | Pending |

**Staged checks** (all v2.1) (an earlier phase delivers part of a requirement and states that part in its success criteria):
- SAVE-08: stage 1, schema and leg-anchor semantics, in Phase 11; stage 2, the regenerated inert world, in Phase 12; final stage, full traffic and repopulation, in Phase 22.
- DATA-11: Oolite combat stats compiled in Phase 9; the octree mass that completes it in Phase 10.
- WORLD-07: inert ships drawn within the draw-call budget and on the scanner in Phase 12; ships seen flying, which completes it, in Phase 14.
- AI-08: `nullAI` ships stay inert in Phase 12; cargo pods and wreckage (released from Phase 15) tumble under `dumbAI`, which completes it, in Phase 16.
- CBT-07 and CBT-15: the shared hit and damage rule for any `ShipControl` shooter in Phase 13 (CBT-07); police-versus-player autonomous fire proven in Phase 19 as part of AI-05 (a staged check of CBT-15); pirate, hunter and NPC-versus-NPC fire completes CBT-15 in Phase 20.
- AUD-01: the full sound map in Phase 17, with the scoop, missile and ECM sounds proven by synthetic events (Phase 17 does not depend on Phase 16); those sounds are proven in play in Phase 21, the first phase that depends on both Phases 16 and 17.
- AI-07: the generated manifest and the decision check land in Phase 18, against the oracle the owner selects at the Phase 14 gate; Phases 19-22 keep them green as roles are ported.

**Coverage:**
- v2.0 requirements: 5 total, 5 mapped to Phase 8 (FOUND-10, FOUND-11, FOUND-12, FOUND-13, FOUND-14), 0 unmapped
- v2.1 requirements (planned): 55 total, 55 mapped, 0 unmapped
- Per v2.1 phase:
  - Phase 9: 2 (DATA-10, DATA-12)
  - Phase 10: 1 (DATA-11)
  - Phase 11: 1 (SAVE-07)
  - Phase 12: 3 (WORLD-10, WORLD-11, WORLD-14)
  - Phase 13: 6 (CBT-04, CBT-05, CBT-06, CBT-07, DOCK-10, INPUT-01)
  - Phase 14: 2 (WORLD-07, AI-01)
  - Phase 15: 6 (CBT-08, DEATH-01, DEATH-03, DEATH-05, DOCK-08, DOCK-09)
  - Phase 16: 5 (AI-08, CBT-11, CBT-12, LAW-04, DEATH-02)
  - Phase 17: 3 (AUD-01, AUD-02, AUD-03)
  - Phase 18: 4 (WORLD-09, AI-02, AI-03, AI-07)
  - Phase 19: 5 (AI-05, LAW-01, LAW-02, LAW-03, LAW-07)
  - Phase 20: 5 (AI-04, AI-10, CBT-15, LAW-05, LAW-06)
  - Phase 21: 4 (AI-06, CBT-09, CBT-10, CBT-13)
  - Phase 22: 5 (SAVE-08, WORLD-08, WORLD-12, AI-09, DEATH-04)
  - Phase 23: 3 (QUAL-01, QUAL-09, QUAL-10)

---
*Requirements defined: 2026-11-02*
*Last updated: 2026-11-13: v2.0 narrowed to Phase 8 (5 requirements); the other 55 moved to v2.1, unscheduled*
