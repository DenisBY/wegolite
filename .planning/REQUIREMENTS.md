# Requirements: Wegolite v2.3 Combat and Death

**Defined:** 2026-11-16
**Core Value:** A player can launch, fly, dock, and complete a profitable trade run between two star systems entirely in the browser, faithful to Oolite's rules, data, and feel.

## v1 Requirements

Requirements for this milestone. Each maps to roadmap phases (numbering continues at Phase 15).

### Foundation

- [ ] **FOUND-18**: All new hashed entity fields (weapon state, cargo, static health, debris motion) arrive in one snapshot v4 bump with one golden regeneration and a strip-and-rehash proof; existing worlds hash pristine-omit.
- [ ] **FOUND-19**: All damage goes through one ledger applied after the world step; the tick boundary never holds a dead entity or a queued AI event (second commit, idempotent `killShip`).

### Data

- [ ] **DATA-14**: The NPC record carries weapon facings, `likely_cargo`, `max_cargo`, `fragment_chance` and `explosion_type`, compiled from Oolite with provenance.
- [ ] **DATA-15**: Hulls for the Coriolis (with subentities), the buoy, the cargo barrel and the alloy plate are built from Oolite octrees; the Coriolis size is measured in the `assets` container and either fits the hull caps or ships as a separate file.
- [ ] **DATA-16**: Debris models and textures are vendored from the local Oolite checkout through `scripts/vendor-oolite.sh` with `CHECKSUMS.sha256`, `ASSETS.md` and `NOTICE` rows.

### Combat

- [ ] **CBT-15**: NPC ships fire lasers at the player and at each other through Oolite's fire gate (weapon temperature, energy, shot timer, range roll, `onTarget`). The decision to fire comes from the engine and test pilots only; NPCs do not attack in ordinary play (recorded in Key Decisions).
- [ ] **CBT-16**: NPC hits on the player pass through shields and the energy bank by Oolite's rules.
- [ ] **CBT-17**: Lasers and ident hit the station and the navigation buoys; the station only absorbs hits, buoys (250 energy) hold damage and can be destroyed; subentities are ported as in Oolite.
- [ ] **CBT-08**: A ship at zero energy explodes into wreckage, alloy plates and cargo pods by Oolite's cargo rule, under an entity cap of 256 with thresholds 243 and 128; internal hits damage the player's equipment.
- [ ] **CBT-18**: Ship-ship and ship-buoy collisions damage both by Oolite's mass and closing-speed rule (octree against octree); contact with the station stays damage-free as in v1.
- [ ] **CBT-12**: Damaged equipment is shown as damaged and can be repaired at F3 at Oolite's repair price.

### Death

- [ ] **DEATH-01**: The player dies at zero energy from any cause (only while `inFlight`); without an escape pod the game is over and the last save is loaded, through one death path that autosave, pause and the title flow respect.
- [ ] **DEATH-06**: A dead player is never autosaved; after game over the page reloads and offers Continue only when a loadable save exists.

### Save

- [ ] **SAVE-09**: Saves move to schema v5 with `damagedEquipment` and an ordered migration from v4; a damaged item does not count as installed.

### Render and Quality

- [ ] **WORLD-17**: Explosions, debris, pods and flashes are drawn within the draw-call budget and do not affect the world hash.
- [ ] **QUAL-11**: Kills are deterministic: the world hash is equal at 30, 60 and 144 Hz; the frozen 20-seed acceptance run stays 21 of 21 after every plan touching `src/sim/npc/**`, `src/sim/world/**` or `ships-npc.json`.

## v2 Requirements

Deferred; the former Phases 16-23 backlog minus what this milestone takes (see `.planning/milestones/v2.0-REQUIREMENTS.md`).

### Later

- **CBT-09 / CBT-10**: Missiles and ECM
- **DEATH-02**: Escape pod
- **LAW-01..LAW-07**: Legal status, police, bounties, combat rating, scooping escape capsules
- **CBT-11**: Scooping and jettisoning cargo
- **DEATH-03 / DEATH-05 / DOCK-08**: Sun, planet, heat and alert condition
- **DOCK-09**: Docking-slot scrape damage
- **AUD-01..AUD-03**: Audio
- **AI-02..AI-10**, **WORLD-08**, **WORLD-09**: Priority AI, role AIs, populator, station traffic
- **DEATH-04**, **AI-09**, **WORLD-12**: Mining, rock hermit, asteroids
- **QUAL-01**: 60 fps evidence

## Out of Scope

| Feature | Reason |
|---------|--------|
| NPCs attacking in ordinary play | Needs priority AI; owner chose engine-and-tests for v2.3 |
| Raising `MAX_ENTITIES` above 256 | Moves the hash domain and pair cost; decide separately with a measurement |
| Station-hull contact damage | Stays damage-free until DOCK-09 |
| Missiles, ECM, mines | Later milestone |
| Escape pod, bounties, scooping | Later milestone |
| Sun, planet, heat, alert condition | Later milestone |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| (filled by the roadmapper) | | |

**Coverage:**
- v1 requirements: 16 total
- Mapped to phases: 0
- Unmapped: 16 ⚠️

---
*Requirements defined: 2026-11-16*
*Last updated: 2026-11-16 after initial definition*
