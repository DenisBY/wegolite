# Requirements: Wegolite

**Defined:** 2026-11-02
**Core Value:** A player can launch, fly, dock, and complete a profitable trade run between two star systems entirely in the browser — faithful to Oolite's rules, data, and feel.

## v1 Requirements (archived)

The v1.0 milestone (Phases 1-7) shipped as `v0.1.0` on 2026-11-08 and was archived on 2026-11-10.
The full v1 requirement list (68 requirements, 67 complete) and its traceability table are in
`.planning/milestones/v1.0-REQUIREMENTS.md`.

### Open (deferred, not complete)

- [ ] **QUAL-01**: The game holds 60 fps at 1080p on mid-range desktop hardware within a documented draw-call/triangle budget — deferred by the owner on 2026-11-08 to a later phase; the Firefox and Chrome sampler results are recorded in docs/PERFORMANCE.md; the manual cold-start Load time was not supplied

## v2 Requirements

Deferred to a future release. Tracked but not in the current roadmap.

### Combat

Combat comes first in v2: without danger, trading carries no risk, credits only grow and there is nothing to spend them on. CBT-01 and CBT-02 give the rest of the progression its weight.

- **CBT-01**: Player can fire lasers and manage shields, energy, and missiles
- **CBT-02**: Pirate and police NPC ships spawn with AI and bounty
- **CBT-03**: Damage, destruction, and escape-pod outcomes work

### World & Progression

- **PROG-01**: Missions, contracts, and rankings
- **PROG-02**: Legal status and bounty hunting
- **PROG-03**: Shipyard with multiple purchasable ships
- **PROG-04**: Galactic hyperdrive and travel around all eight galaxies

### Presentation & Platform

- **PRES-01**: Sound effects and music with autoplay-safe handling
- **PRES-02**: Mobile and touch controls
- **PRES-03**: Tutorial overlay guiding launch, torus, compass, docking, and the first trade run
- **PRES-04**: Multiple save slots with JSON export/import (until then a manual save writes the same single slot as the autosave, so its overwrite prompt protects nothing; export also gives a way out of two tabs overwriting each other)
- **PRES-05**: Slow autopilot docking behaviour for the docking computer
- **PRES-06**: ANA route plotting and advanced compass modes
- **PRES-07**: Gamepad and mouse flight controls (manual docking on an analogue stick)
- **PRES-08**: Offline play as an installable PWA (the shipped build already makes no runtime network calls)
- **PRES-09**: Trading conveniences that do not change the rules: remembered prices of visited systems on the chart, and the profit on the cargo in the hold

## Out of Scope

Explicitly excluded to prevent scope creep.

| Feature | Reason |
|---------|--------|
| OXP expansion packs and scripting | Excluded by the project's premise; the core game only |
| Multiplayer or any server component | Static client; no accounts, no network runtime |
| Database or server-side storage | Saves live in IndexedDB; a DB would be unused infrastructure |
| Newtonian physics or yaw controls | Breaks Oolite's documented flight feel and fidelity goal |
| Rebalanced prices, ship stats, or economy | The project's value is fidelity to Oolite's config and rules |
| Native desktop or mobile app wrappers | Browser delivery is the point; mobile is a later web concern |
| Combat in v1 | Deferred to v2 so flight, docking, navigation, and economy land first |
| Cloud saves and user accounts | Requires a backend, which is explicitly out of scope |

## Traceability

The v1 traceability table is archived in `.planning/milestones/v1.0-REQUIREMENTS.md`. Only the
open v1 item is kept here:

| Requirement | Phase | Status |
|-------------|-------|--------|
| QUAL-01 | Phase 7 | Pending (deferred by the owner on 2026-11-08) |

Next milestone: v2 requirements are assigned to phases when `/gsd-new-milestone` builds the roadmap.

---
*Requirements defined: 2026-11-02*
*Archived v1 section: 2026-11-10 (milestone v1.0)*
