# Requirements: Wegolite

**Defined:** 2026-11-25
**Core Value:** A player can launch, fly, dock, and complete a profitable trade run between two star systems entirely in the browser — faithful to Oolite's rules, data, and feel.

Requirements for milestone v2.4 Pirates and Police (Phases 21 onward). IDs and wording carry over from `milestones/v2.0-REQUIREMENTS.md` where a backlog requirement already existed (narrowed to this milestone's scope where noted); the other IDs are new and continue each category's numbering. Scope is the necessary technical minimum by owner decision; every divergence from Oolite gets a `FIDELITY.md` row. Research: `.planning/research/SUMMARY.md` (owner answers to D1-D13 recorded below under Scope decisions).

## v2.4 Requirements

### Foundation and data

- [x] **FOUND-20**: Every new hashed field of the milestone (NPC bounty, role, group, cargo kind, pod commodity and amount, per-facing weapon type and temperature, fuel injection state, priority-AI state, `World.groups`, `World.populator`, `World.station`, the player's legal status and kill tally) arrives in one world snapshot bump (v4 to v5) with pristine-omit hashing; the inert populator, `INERT_POPULATION` and the frozen 20-seed acceptance inputs stay byte-identical, pinned by a hash test over epochs 1 to 20.
- [x] **DATA-17**: The NPC catalogue grows from 9 to the records the populator's trader, pirate, police and light-hunter roles resolve to (about 28 records on 18 models), compiled from Oolite with bounty, roles, auto-AI, scoop, escorts, `counts_as_kill`, fuel injection and aft weapons; the converter's `aft_weapon_type` refusal is lifted; `autoAImap.plist`, `role-categories.plist` and the comms strings of `descriptions.plist` are compiled.
- [x] **DATA-18**: The new hull models and textures are vendored from the local Oolite checkout through `scripts/vendor-oolite.sh` with `CHECKSUMS.sha256`, `ASSETS.md` and `NOTICE` rows, and load lazily outside the first-load ceiling.

### World population

- [x] **WORLD-08**: Each system is populated with traders, pirates (independents and packs), police and light bounty hunters at Oolite's rates for its government, economy, tech level and neighbours (`oolite-populator.js`), matching recorded oracle fixtures of Oolite's own script. *(Narrowed: scavengers, shuttles, medium and heavy hunters deferred.)*
- [ ] **WORLD-19**: The system is repopulated every 20 s by Oolite's rates (witchpoint arrivals, station launches), deterministically and bounded by a populator ceiling and entity-cap rule set from measured data.
- [ ] **WORLD-09**: NPC ships launch from the main station and leave the system (dock at the station, jump out at the witchpoint, land on the planet) through a simplified stand-in with one seam for a later faithful port; a departing ship never explodes, drops cargo or credits a kill. *(Recorded divergence from Oolite's station queue and NPC docking.)*
- [ ] **WORLD-20**: Each system's main station is the type Oolite builds from its `planetinfo.plist` `station` key (Coriolis, Dodecahedron, Icosahedron), with the measured model, mass, collision radius, dock port and launch view of that type; every Coriolis system stays byte-identical. *(Added 2026-11-26, owner request; Phase 22.1.)*
- [x] **QUAL-09**: A full anarchy population with combat stays within the draw-call budget; a render spike measures it before the populator ships, and any budget raise is an owner decision.

### NPC AI

- [ ] **AI-02**: Oolite's priority-AI framework (conditions, configurations, behaviours, reconsider timing, event handlers, groups, escorts, comms) is hand-ported to TypeScript as plain hashable data, and ported decisions, draws and wake times match traces recorded from the original JavaScript through the dev-only harness.
- [ ] **AI-03**: Traders and escorts behave per Oolite's role AIs: fly their route, flee when losing, call for help, dock or jump out.
- [ ] **AI-04**: Pirates (all four in-scope variants) pick victims by Oolite's odds rule, attack, demand cargo, collect loot and break off per Oolite's role AIs; light bounty hunters hunt offenders.
- [ ] **AI-05**: Police attack offenders and fugitives by legal status and government; the main station acts as an authority (alert level, marks offenders seen nearby and ships that hit it, launches police). *(Narrowed: station defence ships and the full `oolite-stationAI.js` deferred.)*
- [ ] **CBT-19**: NPC ships fire their lasers (fore and aft) at the player and at each other under their own AI in ordinary play. *(Lasers only: missiles are forced to zero at spawn behind a tripwire guard, todo `2026-11-25-missiles-and-ecm`.)*
- [ ] **CBT-20**: NPC ships with fuel injectors use them as Oolite's AIs do (speed and fuel); the player's fuel injectors stay out of scope.
- [ ] **AI-13**: Every behaviour a ported tree can request exists natively or is a recorded cut, checked by a reachability test; no ported ship falls back to idle silently, and the acceptance runs assert no faulted AI.
- [ ] **AI-12**: NPC ships collect cargo pods (collect and tractored behaviours). *(Narrowed: mining and land-on-planet steering deferred.)*

### Law and reward

- [ ] **LAW-01**: Attacking or killing ships in sight of police or the main station raises the player's legal status by Oolite's bit-flag rules (including the `bounty & 7 != 7` precedence as Oolite evaluates it); F5 shows Clean, Offender or Fugitive.
- [ ] **LAW-02**: Offenders are fined at the main station on docking; legal status halves on each hyperspace arrival.
- [ ] **LAW-03**: The main station refuses docking instructions and the docking computer to fugitives; manual docking is never refused.
- [ ] **LAW-04**: Killing a ship with a bounty pays 10 x bounty at the moment of the kill with Oolite's message; the credit goes to the ship whose damage zeroed the target's energy, independent of entity order, and the player is paid only if alive.
- [ ] **LAW-08**: Kills that count toward Oolite's combat rating increment the kill tally; F5 shows the rating (Harmless to Elite), and the tally and legal status survive save and load.
- [ ] **SAVE-11**: Saves move to schema v6 in one bump, adding legal status, kill tally and the scooped-pod list with no migration (an older save is corrupt, as at v5).

### Cargo

- [ ] **CBT-11**: Player can buy Fuel Scoops at F3 (damageable, repairable) and scoop cargo pods by Oolite's geometry and tractor rule; scooped pods are held as Oolite holds them until docking. Destroyed ships' pods carry a commodity and amount.
- [ ] **LAW-06**: Player can jettison cargo, and pirates whose cargo demand is met break off as in Oolite.

### Acceptance

- [ ] **QUAL-12**: Determinism holds with full traffic: the world hash is equal at 30, 60 and 144 Hz in a populated combat scenario; the frozen 20-seed run stays 21 of 21 after every plan touching `src/sim/npc/**`, `src/sim/world/**` or `ships-npc.json` (by hand on the remote machine), and a new traffic acceptance scenario in its own file runs 20 seeds against thresholds committed before the run.
- [ ] **QUAL-13**: In an anarchy pirates attack the player unprompted; a player who destroys a pirate is paid its bounty and can scoop its cargo; a player who fires on a clean trader becomes an Offender and is attacked by police; traffic composition and behaviour rates are compared against headless Oolite (`tools/oolite-reference`) with thresholds written first.

## Future Requirements

Deferred, tracked but not in this roadmap.

- **CBT-09**: Player can arm, lock and fire missiles and hardened missiles, and NPCs launch missiles (todo `2026-11-25-missiles-and-ecm`). *With CBT-10 and AI-06, the first work of the next milestone (owner, 2026-11-27).*
- **CBT-10**: Player can fire an ECM that destroys standard missiles in range
- **AI-06**: Missiles home on their target per Oolite's missile AI
- **AI-10**: NPC escape capsules; **LAW-05**: scooping capsules for a reward
- **LAW-07**: Contraband penalties on docking and launch (todo `2026-11-25-cargo-legality-penalties`)
- **LAW-09**: Dynamic player roles (pirate victim choice, police forgiveness)
- **AI-14**: Station defence ships and the full `oolite-stationAI.js`
- **WORLD-13**: Faithful port of Oolite's station launch/dock queue and NPC docking
- **WORLD-08b**: Scavengers, shuttles, medium and heavy hunter packs, assassins, trader opportunists
- **CBT-21**: Player fuel injectors
- Escape pod and insurance for the player; sun fuel scooping and hazards; sound and music; QUAL-01 steady frame rate

## Out of Scope

| Feature | Reason |
|---------|--------|
| Running Oolite's JavaScript at runtime | Rejected at v2.0: closure-held AI state cannot be saved or hashed; the JS runs only in the dev-only oracle harness |
| Saving NPCs | Existing leg-anchor rule: a Continue regenerates the system (killed pirates return), recorded in Key Decisions |
| Missions, contracts, passengers | Need this milestone first; next milestones |
| Rock hermits, asteroids, Thargoids | Not part of ordinary pirate and police traffic |

## Scope decisions (owner, 2026-11-25)

D1 bounty at the kill (Oolite); D2 minimal station responder; D3 simplified NPC departure and launch stand-in; D4 repopulation in; D5 catalogue to ~28 records with aft weapons; D6 draw-call spike in Phase 21; D7 pods carry a commodity, scooped pods held as Oolite holds them (saved list); D8 static player role; D9 light hunters only; D10 jettison in; D11 symmetric kill credit, settled in the first law plan; D12 frozen run stays manual, new traffic run in its own file; D13 NPC fuel injectors ported (player's not).

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| FOUND-20 | Phase 21 | Complete |
| DATA-17 | Phase 21 | Complete |
| DATA-18 | Phase 21 | Complete |
| WORLD-08 | Phase 22 | Complete |
| QUAL-09 | Phase 22 | Complete |
| WORLD-20 | Phase 22.1 | Pending |
| AI-02 | Phase 23 | Pending |
| AI-03 | Phase 23 | Pending |
| CBT-19 | Phase 23 | Pending |
| CBT-20 | Phase 23 | Pending |
| WORLD-09 | Phase 23 | Pending |
| CBT-11 | Phase 24 | Pending |
| LAW-06 | Phase 24 | Pending |
| AI-12 | Phase 24 | Pending |
| SAVE-11 | Phase 24 | Pending |
| AI-05 | Phase 25 | Pending |
| AI-04 | Phase 25 | Pending |
| LAW-01 | Phase 25 | Pending |
| LAW-02 | Phase 25 | Pending |
| LAW-03 | Phase 25 | Pending |
| LAW-04 | Phase 25 | Pending |
| LAW-08 | Phase 25 | Pending |
| WORLD-19 | Phase 26 | Pending |
| AI-13 | Phase 26 | Pending |
| QUAL-12 | Phase 26 | Pending |
| QUAL-13 | Phase 26 | Pending |

Staged requirements are mapped to the phase that completes them and are not checked off earlier: QUAL-09 (render spike in Phase 21, browser proof on the real populator in Phase 22); CBT-11 (pod commodity and amount drawn from Phase 21, scooping completes it in Phase 24); AI-04 (pirate trees in Phase 23, loot collection and the met-demand break-off in Phase 24, light hunters complete it in Phase 25); AI-13 (reachability test and no-silent-idle guard built in Phase 23 and grown in Phases 24 and 25, completed in Phase 26 where the acceptance runs assert no faulted AI); QUAL-12 (a standing gate from Phase 21 on, completed in Phase 26); QUAL-13 (boxed real-Oolite census spike in Phase 22, completed in Phase 26). WORLD-09 is delivered whole in Phase 23; SAVE-11 completes in Phase 24, and LAW-08 in Phase 25 proves the live legal status and kill tally survive it.

**Coverage:**
- v2.4 requirements: 26 total
- Mapped to phases: 26 (Phase 21: 3, Phase 22: 2, Phase 22.1: 1, Phase 23: 5, Phase 24: 4, Phase 25: 7, Phase 26: 4)
- Unmapped: 0 ✓

---
*Requirements defined: 2026-11-25*
*Last updated: 2026-11-27 (WORLD-20 added for inserted Phase 22.1; owner answers of 2026-11-27)*
