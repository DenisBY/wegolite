# Requirements: Wegolite

**Defined:** 2026-11-14
**Core Value:** A player can launch, fly, dock, and complete a profitable trade run between two star systems entirely in the browser — faithful to Oolite's rules, data, and feel.

## v2.2 Requirements — Weapons and NPC Flight

Requirements for milestone v2.2 (Phases 13 and 14). IDs and wording carry over from `milestones/v2.0-REQUIREMENTS.md`, except FOUND-17, AI-11 and AI-12, which are new. Scope is the necessary technical minimum by owner decision.

### Foundation

- [ ] **FOUND-17**: A refused `begin()` at arrival does not leave the origin world installed (WR-01)

### Input and Views

- [ ] **INPUT-01**: Default bindings follow Oolite for the new actions: Escape (double press) ejects, P pauses, R is ident; target-station moves to a free key; all remain rebindable and the controls panel lists them. The Escape/P migration lands before any phase relies on the old keys
- [ ] **CBT-04**: Player can switch between fore, aft, port and starboard views and fire the laser mounted on the current facing

### Weapons and Shields

- [ ] **CBT-05**: Player can buy pulse, beam, military and mining lasers per facing at F3; lasers have Oolite's damage, range, recharge and heat, and cut out when overheated
- [ ] **CBT-06**: Fore and aft shields and energy banks absorb and recharge damage at Oolite's rates; the HUD shows shields, energy, laser temperature and cabin temperature
- [ ] **CBT-07**: Lasers hit ships by their Oolite octree hull, and the same hit and damage rule applies to any ship firing through `ShipControl`
- [ ] **DOCK-10**: Docking restores shields and energy to full and resets laser and cabin temperature, as in Oolite

### NPC Flight

- [ ] **WORLD-07**: Player sees NPC ships flying in the system, drawn within the draw-call budget and shown on the scanner
- [ ] **AI-01**: NPC ships move with Oolite's NPC flight model and steer with its native behaviours: idle, tumble, fly to destination, face, intercept, attack, flee, escort and avoid collision
- [ ] **AI-11**: A time-boxed, dev-only spike runs selected AILib functions from the original Oolite JavaScript in Node against a stub host (absent from `dist`); a fidelity report lists each behaviour's result against its oracle, and the owner's choice of oracle for later ported decisions is recorded as a Key Decision

## Future Requirements

Deferred; tracked but not in the current roadmap. Former v2.1 Combat & Traffic requirements (phases 15-23 of the old plan) keep their IDs. Details: `milestones/v2.0-REQUIREMENTS.md`.

- **AI-12**: NPC steering behaviours collect, tractored, mining and land on planet (need cargo scooping and mining)

### Content

- **DATA-10**: The ship models and textures needed by the v2.0 roles (traders, pirates, police Vipers, hunters, shuttles, scavengers, missiles, cargo pods, escape capsules, wreckage, asteroids, rock hermit) are compiled from the pinned Oolite snapshot with provenance in `ASSETS.md`/`NOTICE` and the drift gate
- **DATA-11**: Every v2.0 ship carries its Oolite combat stats (energy, recharge, speed, thrust, weapons, missiles, bounty, roles, AI) and its mass computed from a build-time octree as Oolite does
- **DATA-12**: Sound effects and music are vendored with provenance; the CC BY 3.0 laser sounds are attributed; music ships only once its per-file provenance is resolved

### Save

- **SAVE-07**: Saves move to schema v3 in one bump with all v2.0 fields (world epoch, legal status, kills, rating, missile pylons, laser mounts, new equipment); v2 saves migrate in order and older builds treat v3 saves as inert future-version saves
- **SAVE-08**: NPCs are not saved: a save carries the world seed, counters and next entity id, and loading regenerates the canonical world at the saved leg anchor deterministically (the same world a fresh arrival at that anchor produces); a save taken in flight resumes at the leg anchor. Verified in stages: schema and anchor semantics first, regenerated inert world next, full traffic last

### World & Traffic

- **WORLD-08**: Each system is populated with traders, pirates, police, hunters, shuttles and scavengers at Oolite's rates for its government, economy, tech level and neighbours, and is repopulated over time
- **WORLD-09**: NPC ships launch from and dock at the main station through a simplified queue (a recorded divergence from Oolite's station queue)
- **WORLD-10**: Mass lock and hyperspace jump blockage take nearby NPC ships into account as in Oolite
- **WORLD-11**: The simulation keeps running while the galactic chart is open in flight, as in Oolite (supersedes the v1 freeze)
- **WORLD-12**: Asteroid fields and a rock hermit appear where Oolite places them
- **WORLD-14**: A hyperspace jump clears every non-static entity at jump commit and the destination is populated deterministically on arrival

### AI

- **AI-02**: The priority-AI framework (`PriorityAIController`: conditions, configurations, behaviours, branches, reconsider timing, event handlers) is ported so that role trees run as in Oolite
- **AI-03**: Trader, shuttle, scavenger and escort ships behave per Oolite's role AIs (route, flee when losing, call for help, dock)
- **AI-04**: Pirates and bounty hunters hunt, attack, demand cargo and break off per Oolite's role AIs
- **AI-05**: Police and the station defend the station, attack offenders and fugitives per government, and launch defenders
- **AI-06**: Missiles home on their target per Oolite's missile AI
- **AI-07**: Every AI symbol in the pinned Oolite sources (complete inventory, not only the chosen ones) is listed in a coverage manifest as ported, stubbed or not ported with a reason, and checked in CI; ported decisions are checked against the oracle the owner selects at the Phase 14 gate: by default a dev-only differential harness that runs the original Oolite JavaScript in Node against a stub host (never shipped to the browser), and independent source-cited traces only if the owner accepts that fallback
- **AI-08**: Ships with `nullAI`/`dumbAI` plist AIs behave as in Oolite (inert ships stay inert; cargo pods and wreckage tumble). Escape capsules fly under `oolite-shuttleAI.js` (`shipdata.plist`, `oolite_template_escape-capsule`) and belong to AI-10
- **AI-09**: The rock hermit behaves per Oolite's `oolite-rockHermitAI.js` (launches miners, scavengers and defenders)
- **AI-10**: NPC ships eject escape capsules by Oolite's rules when losing a fight, and the capsule flies as in Oolite

### Combat

- **CBT-15**: NPC ships fire their lasers at the player and at each other under their own AI
- **CBT-08**: Ships take damage, lose equipment to internal hits, and explode into wreckage and cargo pods; ship-to-ship collisions damage both ships by mass and closing speed
- **CBT-09**: Player can arm, lock and fire missiles and hardened missiles, and NPCs launch missiles at the player; missile blasts damage by distance
- **CBT-10**: Player can fire an ECM that destroys standard missiles in range, as in Oolite
- **CBT-11**: Player can scoop cargo pods with a fuel scoop and jettison cargo
- **CBT-12**: Player can repair damaged equipment at F3 at Oolite's repair price
- **CBT-13**: Player can buy and use an energy unit, shield boosters and a heat shield with Oolite's effects

### Law & Progression

- **LAW-01**: Attacking or killing ships in sight of police or the main station raises legal status by Oolite's bit-flag rules; F5 shows Clean, Offender or Fugitive
- **LAW-02**: Police respond to the player by legal status and government; offenders are fined at the main station; legal status halves on hyperspace
- **LAW-03**: The main station refuses docking instructions and the docking computer to fugitives
- **LAW-04**: Killing ships with a bounty pays the bounty, kills count toward Oolite's combat rating, and F5 shows the rating
- **LAW-05**: Player can scoop NPC escape capsules and is rewarded for them on docking
- **LAW-06**: Player can pay off pirate demands by dumping cargo, and pirates break off as in Oolite
- **LAW-07**: Launching from the main station with export contraband raises legal status as in Oolite, and using the docking computer while an offender can incur a fine and costs Oolite's extra time

### Death & Hazards

- **DEATH-01**: Player dies when energy reaches zero; without an escape pod the game is over and the last save can be loaded
- **DEATH-02**: Player can buy an escape pod and eject with Escape (double press); the pod keeps ship and equipment, wipes cargo and legal status, and advances the clock by Oolite's rule (tested at its boundaries), as in Oolite
- **DEATH-03**: Cabin temperature rises near the sun and damages the ship when too hot; contact with the planet or the sun destroys the ship
- **DEATH-04**: Player can mine asteroids with a mining laser and scoop the fragments
- **DEATH-05**: With a fuel scoop the player refuels by skimming the sun, and flying low through a planet's atmosphere heats the ship, at Oolite's rates

### Docking & Alerts

- **DOCK-08**: The HUD shows Oolite's alert condition (green, yellow, red) by its rules, and the docking computer refuses to engage in red alert
- **DOCK-09**: Scraping the docking slot damages the ship as in Oolite (supersedes v1's damage-free scrape)

### Audio

- **AUD-01**: The game plays Oolite's player-bound sound effects (lasers, hits, explosions, missiles, alerts, scoop, docking and hyperspace) through the Web Audio API, non-positional as in Oolite
- **AUD-02**: Audio starts only after a user gesture, suspends on pause, hidden tab and context loss, and has volume and mute settings
- **AUD-03**: Music plays on the title screen and while the docking computer flies, once provenance is resolved

### Quality

- **QUAL-01**: The game holds 60 fps at 1080p on mid-range desktop hardware within a documented draw-call/triangle budget (carried from v1; now measured with traffic)
- **QUAL-09**: A populated combat scene stays within the 50 draw-call budget in the container budget test
- **QUAL-10**: The simulation cost per frame with full traffic stays under a numeric bound declared before the hardening phase starts (deterministic workload gate in the container plus reference-desktop timing by a protocol fixed in `docs/PERFORMANCE.md`), and cold-start transfer stays under the first-load ceiling (NPC assets load lazily)

### Carried over from earlier milestones

- **DATA-12, DATA-14, DATA-15, DATA-16, SAVE-09, SAVE-10, AI-08**: cut from Phases 9-12; see `milestones/v2.1-REQUIREMENTS.md`
- **PROG-01**, **PROG-03**, **PROG-04**, **WORLD-13**, **CBT-14**, **PRES-02..PRES-09**: see `milestones/v2.0-REQUIREMENTS.md`

## Out of Scope

| Feature | Reason |
|---------|--------|
| OXP expansion packs and runtime scripting | Out of scope for now; revisit only by explicit decision (PROJECT.md) |
| Running Oolite's original JavaScript at runtime | Rejected for v2.0: closure-held AI and timer state cannot be saved or hashed; the AI-11 spike is dev-only |
| Multiplayer or any server component | Static client; no accounts, no network runtime |
| Database or server-side storage | Saves live in IndexedDB |
| Newtonian physics or yaw controls | Breaks Oolite's documented flight feel |
| Rebalanced prices, ship stats, economy or combat numbers | The project's value is fidelity to Oolite |
| Destruction, NPC fire and any consequence of damage beyond the floor at zero energy | Phase 15 and later; this milestone ships the damage function, not death |
| Sound, police, pirates, missiles, mining, priority AI, QUAL-01 | No consumer in this milestone; backlog |
| Native desktop or mobile app wrappers, cloud saves | Browser delivery is the point; needs a backend |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|

**Coverage:**
- v2.2 requirements: 10 total
- Mapped to phases: 0
- Unmapped: 10 ⚠️

---
*Requirements defined: 2026-11-14*
*Last updated: 2026-11-14 after v2.2 milestone start*
