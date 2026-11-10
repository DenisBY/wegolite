# Requirements: Wegolite

**Defined:** 2026-11-02
**Core Value:** A player can launch, fly, dock, and complete a profitable trade run between two star systems entirely in the browser — faithful to Oolite's rules, data, and feel.

## v1 Requirements

Requirements for the initial release. Each maps to a roadmap phase.

### Foundation, Containers & Compliance

- [x] **FOUND-01**: From a clean checkout, `docker compose up app` serves the game with hot reload, with no host Node/npm install required
- [x] **FOUND-02**: `docker compose up preview` builds and serves the production bundle as a static site
- [x] **FOUND-03**: `test`, `e2e`, `lint`, `typecheck`, and aggregate `verify` services run entirely in containers, and `verify` is the documented definition of done
- [x] **FOUND-04**: Images pin base tags and cache dependency layers; browser binaries are baked in, never downloaded at test time
- [x] **FOUND-05**: Repository skeleton enforces TypeScript strict mode, lint/format, and an import-zone rule that forbids `src/sim/` from importing Three.js or touching the DOM
- [x] **FOUND-06**: `LICENSE` (GPL-2.0-or-later), `NOTICE` (Oolite attribution), `ASSETS.md` (per-asset provenance), and a non-affiliation/trademark disclaimer are present
- [x] **FOUND-07**: The simulation advances on a deterministic fixed 1/120 s step with an accumulator, and a test proves identical results across different frame cadences
- [x] **FOUND-08**: A camera-relative rendering spike shows a marker at 1.4e6 m without float32 jitter or z-fighting
- [x] **FOUND-09**: `AGENTS.md` documents the container-only workflow, and its commands work verbatim from a clean checkout

### Data Pipeline & Fidelity

- [x] **DATA-01**: A build-time OpenStep ASCII plist parser handles comments, unquoted keys, nested dictionaries/arrays, and fails with actionable parse errors
- [x] **DATA-02**: `like_ship`/template inheritance resolves with cycle detection and per-key overrides
- [x] **DATA-03**: A `.dat` mesh parser reads `NVERTS`/`NFACES`/`VERTEX`/`FACES`/`TEXTURES`/`END`, truncates faces above three vertices, and produces per-face normals
- [x] **DATA-04**: The converter emits GLB plus a content manifest, applying the Oolite +Z-forward to Three −Z-forward coordinate and winding conversion verified by fixture
- [x] **DATA-05**: All 2,048 systems across all eight galaxies are ingested from `planetinfo.plist` with stable IDs, names, and positions
- [x] **DATA-06**: All 17 commodities are ingested from `trade-goods.plist` with correct units (decicredits, kg, g), and Alien Items are parsed but never tradeable
- [x] **DATA-07**: Cobra Mk III, Coriolis station, equipment catalogue, and Lave starting-system data are available as typed, compiled content
- [x] **DATA-08**: Golden fidelity tests compare generated content against a pinned Oolite snapshot, and the build fails on unexplained drift
- [x] **DATA-09**: The Oolite source snapshot is pinned to a specific release/commit and recorded in the repository

### World Rendering & Scale

- [x] **WORLD-01**: A new game loads Lave with witchpoint, planet, sun, and Coriolis station at faithful relative positions and scale
- [x] **WORLD-02**: The full system extent renders without visible jitter or z-fighting on the planet, station, and dock opening
- [x] **WORLD-03**: Starfield, lighting, and planet rendering produce a recognisably Oolite-like scene at v1 fidelity
- [x] **WORLD-04**: The scene manager swaps systems without leaking GPU resources, verified by a dispose test
- [x] **WORLD-05**: The app detects missing WebGL2 support and shows a clear fallback message instead of failing silently
- [x] **WORLD-06**: A pure hyperspace-math module computes distance, fuel cost, and jump time, matching Lave→Diso and Lave→Zaonce fixtures

### Flight, Input & Launch

- [x] **FLGT-01**: The player launches from the Coriolis station into flight, with the +10 minute clock advance and launch roll
- [x] **FLGT-02**: Elite-style pitch and roll work from the keyboard with no yaw and Oolite's ramped rotation rates
- [x] **FLGT-03**: Flight uses Oolite's Aristotelian model: speed cap 350, thrust acceleration 160 u/s², no drift-based Newtonian physics
- [x] **FLGT-04**: The torus drive (`j`) engages 32×–1024×, mass-locks near the station/planet, and disengages on pilot input
- [x] **FLGT-05**: The HUD shows crosshair, 25.6 km scanner, compass, aegis indicator, speed/roll/pitch/fuel bars, clock, message line, and condition light
- [x] **FLGT-06**: The player can pause, rebind controls, and have settings persist locally
- [x] **FLGT-07**: Input flows through an action/command layer so touch or gamepad support can be added without touching the simulation
- [x] **FLGT-08**: A `ShipController` seam allows combat and NPC ships to be added later without retrofitting the flight model

### Manual Docking

- [x] **DOCK-01**: The docking corridor is derived from the Coriolis dock geometry and matches the visible opening
- [x] **DOCK-02**: The station spins at the Oolite rate, and docking tolerates station roll with x/y auto-centring
- [x] **DOCK-03**: Off-axis contact produces scrape damage or bounce feedback, using the v1 collision-only hull model
- [x] **DOCK-04**: Crossing 90% past the dock plane while aligned transitions cleanly into docked mode
- [x] **DOCK-05**: A docking computer can be bought (TL 9, 1500 Cr) and grants instant docking on `Shift+C` with a +20 minute clock advance
- [x] **DOCK-06**: A failed docking attempt never traps the player; they recover to flight with clear feedback
- [x] **DOCK-07**: The game autosaves on launch so the docked state is always resumable

### Docked Mode, Economy & Station Screens

- [x] **ECON-01**: Market prices and stock are computed with Oolite's economy-only formula and 127-unit cap, matching recorded fixtures
- [x] **ECON-02**: The 16 tradeable commodities buy and sell at the same price, trades do not move prices, and all money is integer decicredits
- [x] **ECON-03**: The 20 t cargo hold is enforced, with gold/platinum priced per kg and gem-stones per g using correct ton-pod conversions
- [x] **ECON-04**: The F8 market screen shows names, units, price, stock, and hold, and supports quantity selection with confirmation
- [x] **ECON-05**: The F3 outfitting screen lists equipment with correct tech level and price, and installs/removes legal items
- [x] **ECON-06**: The F5 ship status screen shows credits, fuel, cargo, equipment, and ship identity
- [x] **ECON-07**: The F7 system data screen shows economy, government, tech level, population, productivity, and radius
- [x] **ECON-08**: Insufficient funds, hold space, or stock are blocked with clear messages, and credits can never go negative
- [x] **ECON-09**: All station screens are DOM/CSS, keyboard-navigable, and usable without a mouse

### Hyperspace, Navigation & Persistence

- [x] **NAV-01**: The F6 galactic chart plots all 256 systems in the current galaxy with continuous wheel zoom, drag panning and 7 LY connection lines; it opens on the local view around the current system and Tab toggles the whole-galaxy view
- [x] **NAV-02**: The player can select a target and see its distance and fuel cost, and unreachable targets are blocked
- [x] **NAV-03**: Hyperspace requires fuel at least equal to the cost, with a 70-unit tank and a 7.0 LY maximum jump
- [x] **NAV-04**: A 15-second countdown can be aborted with pilot input, and a completed jump advances the clock by distance² hours
- [x] **NAV-05**: Arrival occurs at the destination witchpoint with a freshly generated market and the new system scene
- [x] **NAV-06**: Fuel is deducted exactly `10 × max(0.1, distance)` and can never go negative
- [x] **SAVE-01**: Saves are a single versioned JSON object with a numeric `version`, validated by a strict schema; older versions migrate in order, a newer version is left untouched, and a corrupt blob is backed up before any clear
- [x] **SAVE-02**: IndexedDB persists credits, cargo, fuel, equipment, location, clock, RNG state, and per-system market snapshots
- [x] **SAVE-03**: Loading restores the exact docked or in-flight state, including orientation and velocity
- [x] **SAVE-04**: Ordered migrations upgrade older saves, and corrupt saves fail safely without wiping good data
- [x] **SAVE-05**: The F2 save/load UI works while docked, with autosaves on launch and hyperspace arrival
- [x] **SAVE-06**: A reloaded market retains its prior stock and prices, so reloading cannot reroll for profit

### Hardening & Community Release

- [ ] **QUAL-01**: The game holds 60 fps at 1080p on mid-range desktop hardware within a documented draw-call/triangle budget — deferred by the owner on 2026-11-08 to a later phase; the Firefox and Chrome sampler results are recorded in docs/PERFORMANCE.md; the manual cold-start Load time was not supplied
- [x] **QUAL-02**: The core loop passes on current stable Chrome and current stable Firefox (Safari is not claimed in Phase 7)
- [x] **QUAL-03**: An end-to-end test covers new game → launch → trade → hyperspace → dock → save/load
- [x] **QUAL-04**: Simulation, economy, hyperspace, and save migrations have unit coverage, alongside golden content tests
- [x] **QUAL-05**: WebGL context loss and tab throttling recover without corrupting simulation or save state
- [x] **QUAL-06**: README covers build/run/test, controls, and fidelity notes, and `FIDELITY.md` maps ported mechanics to Oolite sources
- [x] **QUAL-07**: A licensing audit confirms NOTICE, ASSETS.md, source offer, and disclaimer ship in the built site
- [x] **QUAL-08**: The shipped build makes no runtime network calls and logs no console errors during the core loop

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

Which phases cover which requirements. Populated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| FOUND-01 | Phase 1 | Complete |
| FOUND-02 | Phase 1 | Complete |
| FOUND-03 | Phase 1 | Complete |
| FOUND-04 | Phase 1 | Complete |
| FOUND-05 | Phase 1 | Complete |
| FOUND-06 | Phase 1 | Complete |
| FOUND-07 | Phase 1 | Complete |
| FOUND-08 | Phase 1 | Complete |
| FOUND-09 | Phase 1 | Complete |
| DATA-01 | Phase 2 | Complete |
| DATA-02 | Phase 2 | Complete |
| DATA-03 | Phase 2 | Complete |
| DATA-04 | Phase 2 | Complete |
| DATA-05 | Phase 2 | Complete |
| DATA-06 | Phase 2 | Complete |
| DATA-07 | Phase 2 | Complete |
| DATA-08 | Phase 2 | Complete |
| DATA-09 | Phase 2 | Complete |
| WORLD-01 | Phase 3 | Complete |
| WORLD-02 | Phase 3 | Complete |
| WORLD-03 | Phase 3 | Complete |
| WORLD-04 | Phase 3 | Complete |
| WORLD-05 | Phase 3 | Complete |
| WORLD-06 | Phase 6 | Complete |
| FLGT-01 | Phase 3 | Complete |
| FLGT-02 | Phase 3 | Complete |
| FLGT-03 | Phase 3 | Complete |
| FLGT-04 | Phase 3 | Complete |
| FLGT-05 | Phase 3 | Complete |
| FLGT-06 | Phase 3 | Complete |
| FLGT-07 | Phase 3 | Complete |
| FLGT-08 | Phase 3 | Complete |
| DOCK-01 | Phase 4 | Complete |
| DOCK-02 | Phase 4 | Complete |
| DOCK-03 | Phase 4 | Complete |
| DOCK-04 | Phase 4 | Complete |
| DOCK-05 | Phase 4 | Complete |
| DOCK-06 | Phase 4 | Complete |
| DOCK-07 | Phase 4 | Complete |
| ECON-01 | Phase 5 | Complete |
| ECON-02 | Phase 5 | Complete |
| ECON-03 | Phase 5 | Complete |
| ECON-04 | Phase 5 | Complete |
| ECON-05 | Phase 5 | Complete |
| ECON-06 | Phase 5 | Complete |
| ECON-07 | Phase 5 | Complete |
| ECON-08 | Phase 5 | Complete |
| ECON-09 | Phase 5 | Complete |
| NAV-01 | Phase 6 | Complete |
| NAV-02 | Phase 6 | Complete |
| NAV-03 | Phase 6 | Complete |
| NAV-04 | Phase 6 | Complete |
| NAV-05 | Phase 6 | Complete |
| NAV-06 | Phase 6 | Complete |
| SAVE-01 | Phase 6 | Complete |
| SAVE-02 | Phase 6 | Complete |
| SAVE-03 | Phase 6 | Complete |
| SAVE-04 | Phase 6 | Complete |
| SAVE-05 | Phase 6 | Complete |
| SAVE-06 | Phase 6 | Complete |
| QUAL-01 | Phase 7 | Pending |
| QUAL-02 | Phase 7 | Complete |
| QUAL-03 | Phase 7 | Complete |
| QUAL-04 | Phase 7 | Complete |
| QUAL-05 | Phase 7 | Complete |
| QUAL-06 | Phase 7 | Complete |
| QUAL-07 | Phase 7 | Complete |
| QUAL-08 | Phase 7 | Complete |

**Coverage:**
- v1 requirements: 68 total
- Mapped to phases: 68
- Unmapped: 0

---
*Requirements defined: 2026-11-02*
*Last updated: 2026-11-02 after roadmap creation*
