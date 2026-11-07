# Roadmap: Wegolite

## Overview

Wegolite is a fidelity port, so the roadmap is ordered by what is expensive to retrofit, not
by what is most fun to build first. A contributor with only Docker starts at a clean checkout;
phase 1 makes the container toolchain the definition of "passing" and settles the licence and
trademark posture before a single asset lands. Phase 2 turns a pinned Oolite snapshot into
typed, drift-checked content, because every later number comes from there. Phase 3 puts the
Cobra in a faithfully scaled Lave and proves the camera-relative render strategy at 1.4e6 m
while the flight model is tuned against a correct scene. Phase 4 is manual docking — the
hardest coupling in the project and the gate on everything "docked". Phase 5 closes
launch → dock → trade with the economy and station screens. Phase 6 opens the second market
with hyperspace and makes progress resumable. Phase 7 is the community release: fast,
cross-browser, documented, and legally clean.

Seven phases at standard granularity: the research recommended eight. World rendering and
flight are folded into one phase because the first playable flight is a single user-visible
capability — a renderer cannot be judged without a ship flying through it — while the container
toolchain and the content compiler stay separate because each is independently verifiable and
load-bearing for everything after it. Hyperspace math (WORLD-06) moved from the world category
into the travel phase so one module owns the fuel/distance rule instead of two.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation, Containers & Compliance** - Docker-only workflow, fixed-step loop, precision spike, licence and trademark posture (completed 2026-11-02)
- [x] **Phase 2: Data Pipeline & Content Compiler** - Pinned Oolite snapshot compiled at build time into typed content, GLB models, and a drift gate (completed 2026-11-03)
- [x] **Phase 3: Flight in the Lave System** - Launch from Lave's Coriolis and fly the Cobra through a faithful, stably rendered system (completed 2026-11-04)
- [x] **Phase 4: Manual Docking** - Skill-based docking with corridor feedback, plus the buyable docking computer (completed 2026-11-05)
- [x] **Phase 5: Docked Economy & Station Screens** - Market, outfitting, status, and system-data screens on Oolite's economy rules (completed 2026-11-06)
- [ ] **Phase 6: Hyperspace, Navigation & Persistence** - Chart targeting, fuel-gated jumps, and saves that resume exactly
- [ ] **Phase 7: Hardening & Community Release** - 60 fps, three-browser support, end-to-end coverage, docs, and a licensing audit

## Phase Details

### Phase 1: Foundation, Containers & Compliance
**Goal**: A contributor with only Docker can serve, test, and verify the project from a clean checkout, on a deterministic fixed-step loop with a render strategy that survives system-scale distances — and the licence, attribution, and trademark posture is in place before any asset is committed.
**Mode:** mvp
**Depends on**: Nothing (first phase)
**Requirements**: FOUND-01, FOUND-02, FOUND-03, FOUND-04, FOUND-05, FOUND-06, FOUND-07, FOUND-08, FOUND-09
**Success Criteria** (what must be TRUE):
  1. From a clean checkout with only Docker installed, one command serves the game with hot reload at a documented localhost port, and no host Node/npm is used at any point.
  2. `docker compose run --rm verify` runs lint, typecheck, unit tests, and containerised browser tests as a single chain, and the repository documents it as the only definition of done.
  3. A test runs the same scripted simulation at two different frame cadences and produces identical state hashes, proving the 1/120 s fixed step.
  4. A rendered marker at 1.4e6 m from the camera stays visually stable, with no float32 jitter and no depth fighting against nearer geometry.
  5. `LICENSE`, `NOTICE`, `ASSETS.md`, and a visible non-affiliation disclaimer are present, and no Frontier trademark appears in the product name or the shipped UI.
**Plans**: 7/7 plans complete
Plans:
**Wave 1**
- [x] 01-01-PLAN.md — Walking skeleton: container topology serves the live shell, headless Chromium proves the camera-relative render path at 1.4e6 m

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 01-02-PLAN.md — Toolchain gates: strict TypeScript, sim purity project, ESLint import zones, Vitest unit project, guard test

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 01-03-PLAN.md — Determinism harness: pure sim core, 1/120 s accumulator, cross-cadence hash equality, golden fixture

**Wave 4** *(blocked on Wave 3 completion)*
- [x] 01-04-PLAN.md — Precision proof: float64/ULP unit test and hardened browser smoke (log depth, placement, disclaimer, no console errors)

**Wave 5** *(blocked on Wave 4 completion)*
- [x] 01-05-PLAN.md — Compliance and command contract: LICENSE, NOTICE, ASSETS.md, compliance test, README, AGENTS updates

**Wave 6** *(blocked on Wave 5 completion)*
- [x] 01-06-PLAN.md — Operational rehearsal: dev/preview smoke scripts, verify fail-fast proof, volume-free clean-state verify

**Wave 7** *(gap closure — G-01-4 / CR-01)*
- [x] 01-07-PLAN.md — Resize repaint: render once per resize event behind a zero-size guard, plus a Playwright regression for resize and restore

### Phase 2: Data Pipeline & Content Compiler
**Goal**: Every system, commodity, ship, equipment item, and model the game uses is generated at build time from a pinned Oolite snapshot into typed content, and any unexplained drift fails the build.
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: DATA-01, DATA-02, DATA-03, DATA-04, DATA-05, DATA-06, DATA-07, DATA-08, DATA-09
**Success Criteria** (what must be TRUE):
  1. One build command regenerates systems, commodities, equipment, ships, and models from the pinned snapshot with no hand-edited values, and the verify step fails when regenerated output differs.
  2. All 2,048 systems across the eight galaxies and all 17 commodities are available as typed content with stable IDs, correct units, and Alien Items present but never tradeable.
  3. The Cobra Mk III and Coriolis load in-engine with correct orientation, winding, per-face normals, and bounding boxes, and the Coriolis letterbox reads correctly rather than mirrored.
  4. A malformed plist, a cyclic `like_ship` chain, or a broken mesh fails with a message naming the file and construct instead of producing a silently wrong number.
**Plans**: 9/9 plans complete
Plans:
**Wave 1**
- [x] 02-01-PLAN.md — Tracer: pinned snapshot, OpenStep parser, canonical JSON, manifest, `assets:build`/`assets:check` gate wired into `verify`, 17 commodities emitted

**Wave 2** *(blocked on Wave 1)*
- [x] 02-02-PLAN.md — Parser completeness over all 40 config plists, escapes and duplicate keys, the located failure contract and its fixtures

**Wave 3** *(blocked on Wave 2)*
- [x] 02-03-PLAN.md — Systems (2,048 across eight galaxies) with the eager-g0 / code-split g1–g7 loader, equipment (41), and label arrays as typed chunks with Lave and equipment goldens

**Wave 4** *(blocked on Waves 2-3; reads 02-03's generated tree in `assets:check`)*
- [x] 02-04-PLAN.md — `.dat` mesh parser: comma dialect, per-face TEXTURES, three normal modes, legacy winding repair, bounding-box validation

**Wave 5** *(blocked on Waves 2-4; writes `ships.json`/manifest after 02-04's `assets:check`)*
- [x] 02-05-PLAN.md — `like_ship` resolution with Oolite's real merge rules, cycle detection, and the full shipdata catalogue

**Wave 6** *(blocked on Waves 4-5)*
- [x] 02-06-PLAN.md — In-repo GLB writer: Cobra and the four-part Coriolis composite, axis conversion (reflection already yields glTF CCW; authored corners preserved), materials, dock transform

**Wave 7** *(blocked on Wave 6)*
- [x] 02-07-PLAN.md — Textures: referenced PNGs copied verbatim, deterministic greyscale emissive bake, V-orientation fixture

**Wave 8** *(blocked on Wave 7)*
- [x] 02-08-PLAN.md — Determinism guards: generator lint zone banning nondeterministic APIs, plus the arm64 vs amd64 byte-identity proof with an empty exclusion list

**Wave 9** *(blocked on Wave 8; serialized on `eslint.config.js`)*
- [x] 02-09-PLAN.md — Content boundary: type-only surface, runtime manifest assertion, sim-zone enforcement, provenance compliance, README

### Phase 3: Flight in the Lave System
**Goal**: The player launches from Lave's Coriolis station and flies the Cobra through a faithfully scaled, stably rendered system that reads as Oolite at a glance.
**Mode:** mvp
**Depends on**: Phase 2
**Requirements**: WORLD-01, WORLD-02, WORLD-03, WORLD-04, WORLD-05, FLGT-01, FLGT-02, FLGT-03, FLGT-04, FLGT-05, FLGT-06, FLGT-07, FLGT-08
**Success Criteria** (what must be TRUE):
  1. Starting a new game shows Lave with witchpoint, planet, sun, and Coriolis station at faithful relative positions and scale, lit and rendered so the scene is recognisably Oolite.
  2. The player launches from the station into flight and controls the ship with pitch and roll only — ramped rotation rates, 350 top speed, thrust-based acceleration, no yaw and no drift.
  3. The torus drive engages, mass-locks near the station and planet, and disengages on pilot input, and the HUD shows crosshair, scanner, compass, aegis indicator, bars, clock, message line, and condition light.
  4. The view stays stable from witchpoint to station — no visible jitter or z-fighting on the planet, station, or dock opening — across the full ~1.4e6 m extent.
  5. A browser without WebGL2 shows a clear fallback message instead of a blank canvas, and returning to a system after leaving it returns GPU memory to its baseline.
**Plans**: 14/14 plans complete; 5 gap-closure plans added from UAT (03-14 pending)
- [x] 03-01-PLAN.md
- [x] 03-02-PLAN.md
- [x] 03-03-PLAN.md
- [x] 03-04-PLAN.md
- [x] 03-05-PLAN.md
- [x] 03-06-PLAN.md
- [x] 03-07-PLAN.md
- [x] 03-08-PLAN.md
- [x] 03-09-PLAN.md
- [x] 03-10-PLAN.md — G-03-1: palette decoded once, per-channel Oolite terminator in one vector space
- [x] 03-11-PLAN.md — G-03-1: calibrated PlanetMix surface, coastline/snowline/relief, authored polar ice
- [x] 03-12-PLAN.md — G-03-1: one exposure contract, Oolite-bright station, authored emissive
- [x] 03-13-PLAN.md — G-03-2: viewport aspect applied on every camera install, with browser regression
- [x] 03-14-PLAN.md — G-03-3: planet per-pixel noise budget 16 -> 9 (the 10-eval fallback was taken); SwiftShader cadence accepted as a known issue (wait 300 s, `workers: 2` pinned)

### Phase 4: Manual Docking
**Goal**: The player can dock a Cobra by hand with real feedback and real risk, and can buy a docking computer when they would rather not.
**Mode:** mvp
**Depends on**: Phase 3
**Requirements**: DOCK-01, DOCK-02, DOCK-03, DOCK-04, DOCK-05, DOCK-06, DOCK-07
**Success Criteria** (what must be TRUE):
  1. A centred, correctly rolled approach through the visible opening docks the ship, entering docked mode cleanly at the 90% past-plane capture point.
  2. The station spins at Oolite's rate, docking tolerates station roll through x/y auto-centring, and the effective corridor matches the visible opening rather than a trigger sphere.
  3. An off-axis or too-fast approach scrapes or bounces with visible feedback, and every failure recovers to flight — no attempt ever traps the player.
  4. With the docking computer installed (TL 9, 1500 Cr), `Shift+C` docks instantly and advances the clock by 20 minutes.
  5. Launching autosaves, so a docked state is always resumable.
**Plans**: 8/8 plans complete; 3 gap-closure plans added from UAT
**Wave 1**
- [x] 04-01-PLAN.md — Wave 1: measure the dock aperture at build time, emit `dock-port.json`, typed loader, golden + drift check

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 04-02-PLAN.md — Wave 2: port-frame corridor, lane/capture, safety-band auto-centring, docked transition (tracer: aligned approach docks)

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 04-03-PLAN.md — Wave 3: box-hull bounce, scrape/bounce events, shake/flash feedback, no-trap invariant

**Wave 4** *(blocked on Wave 3 completion)*
- [x] 04-04-PLAN.md — Wave 4: credits, equipment purchase line, `Shift+C` docking computer (+20 min), aegis gate

**Wave 5** *(blocked on Wave 4 completion)*
- [x] 04-05-PLAN.md — Wave 5: IndexedDB autosave on launch, title Continue/New game restore

**Gap closure — Wave 1**
- [x] 04-06-PLAN.md — G-04-2: disabled purchase presentation, reason placement beside the control, `Shift+C` in Controls
- [x] 04-08-PLAN.md — G-04-4/G-04-5: committed sim regressions for the disarmed tunnel-end clamp and bounce orientation

**Gap closure — Wave 2** *(blocked on 04-06 because both touch `index.html`)*
- [x] 04-07-PLAN.md — G-04-3: confirm before New game discards a committed save

### Phase 5: Docked Economy & Station Screens
**Goal**: The player can trade at a station market, equip the ship, and read their status and the system's data, all through keyboard-driven screens faithful to Oolite's numbers.
**Mode:** mvp
**Depends on**: Phase 4
**Requirements**: ECON-01, ECON-02, ECON-03, ECON-04, ECON-05, ECON-06, ECON-07, ECON-08, ECON-09
**Success Criteria** (what must be TRUE):
  1. Market prices and stock match recorded fixtures — Oolite's economy-only formula, the 127-unit cap, same buy and sell price, integer decicredits, and trades that never move the price.
  2. Buying and selling respect the 20 t hold, available credits, and station stock; gold and platinum price per kg and gem-stones per g with correct pod conversions; credits can never go negative and every rejection states why.
  3. The F8 market, F3 outfitting, F5 status, and F7 system-data screens show correct names, units, prices, and figures, and are fully navigable and operable without a mouse.
  4. The outfitting screen lists only equipment whose tech level and conditions are met, and installs or removes legal items at the correct price.
**Plans**: 6/6 plans complete
**Wave 1**
- [x] 05-01-PLAN.md — Tracer: Lave market buy → autosave → reload; content peaks/names, economy core (buy), exact cargo/pods, shared reader/writer save semantics, bubble keyboard, F8; independent anchors and regression proofs

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 05-02-PLAN.md — Trading breadth: exact kg/g capacity, sell, sequential clamps, overflow, regression goldens plus independent reference vectors, determinism, PROJECT.md decisions

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 05-03-PLAN.md — Outfitting rules: D-11 visible set, `notOffered`, fail-closed conditions, integer fuel, multi-instance, Oolite missile trade-in and non-refunding berth removal with truthful copy, `canPurchase`/`purchase` delegation

**Wave 4** *(blocked on Wave 3 completion)*
- [x] 05-04-PLAN.md — Labels loader and pure view models for F8/F3/F5/F7, total-cost confirmation, truthful removal detail

**Wave 5** *(blocked on Wave 4 completion)*
- [x] 05-05-PLAN.md — F3/F5/F7 screens, two-state confirm, keyboard-only navigation, `defaultPrevented` no-reload proof with a negative control, derived home fuel, Tab focus containment

**Wave 6** *(blocked on Wave 5 completion)*
- [x] 05-06-PLAN.md — Save hardening and writer parity, full keyboard loop with pause, economy-purity guard with correct paths, phase gate
**UI hint**: yes

### Phase 6: Hyperspace, Navigation & Persistence
**Goal**: The player can pick a target on the galactic chart, jump to a second market, and reload the page into exactly the state they left.
**Mode:** mvp
**Depends on**: Phase 5
**Requirements**: NAV-01, NAV-02, NAV-03, NAV-04, NAV-05, NAV-06, SAVE-01, SAVE-02, SAVE-03, SAVE-04, SAVE-05, SAVE-06, WORLD-06
**Success Criteria** (what must be TRUE):
  1. The F6 chart plots all 256 systems of the current galaxy with short/long range and 7 LY connection lines; selecting a target shows its distance and fuel cost, and unreachable targets are refused.
  2. A jump needs fuel at least equal to the cost, counts down 15 seconds with an abort, advances the clock by distance² hours, and arrives at the destination witchpoint with a freshly generated market.
  3. Fuel is deducted as exactly `10 × max(0.1, distance)`, never goes negative, and the Lave→Diso and Lave→Zaonce fixtures produce the expected cost and jump time.
  4. Reloading the page restores the exact docked or in-flight state — credits, cargo, fuel, equipment, location, clock, orientation, velocity — and the market keeps its prior stock and prices, so reloading cannot reroll for profit.
  5. An older save migrates forward and a corrupt save fails safely without wiping good data, while the F2 screen saves and loads while docked and the game autosaves on launch and arrival.
**Plans**: 11/12 plans executed
- [x] 06-07-PLAN.md
- [x] 06-08-PLAN.md
- [x] 06-09-PLAN.md
- [x] 06-10-PLAN.md
- [x] 06-11-PLAN.md
- [ ] 06-12-PLAN.md
**Wave 1**
- [x] 06-01-PLAN.md — Hyperspace core: exact integer distance/fuel/time, 1800-step countdown, deterministic witchpoint arrival, Wave 0 fixtures
- [x] 06-02-PLAN.md — Save v2: one schema, ordered v1→v2 migration, 17-key market allow-list, docked/in-flight restore

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 06-03-PLAN.md — Chart model and canvas overlay: 256 systems, 875 edges, both ranges, selection and label collision

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 06-04-PLAN.md — End-to-end tracer: F6 target → H countdown → arrival scene/market swap → arrival autosave → reload; pre-launch anchor and in-flight Continue

**Wave 4** *(blocked on Wave 3 completion)*
- [x] 06-05-PLAN.md — F2 Save/Load screen: docked-only one slot, overwrite confirmation, in-session load, failed-load isolation

**Wave 5** *(blocked on Wave 4 completion)*
- [x] 06-06-PLAN.md — Reload market/pose fidelity, autosave trigger matrix, future/corrupt safety, full container phase gate

### Phase 7: Hardening & Community Release
**Goal**: The complete launch → fly → dock → trade → jump loop is fast, works on all three supported browsers, is documented, and is legally clean enough to hand to the Oolite community.
**Mode:** mvp
**Depends on**: Phase 6
**Requirements**: QUAL-01, QUAL-02, QUAL-03, QUAL-04, QUAL-05, QUAL-06, QUAL-07, QUAL-08
**Success Criteria** (what must be TRUE):
  1. The game holds 60 fps at 1080p on mid-range desktop hardware within the documented draw-call and triangle budget.
  2. The core loop plays through on current Chrome, Firefox, and Safari, and one end-to-end test covers new game → launch → trade → hyperspace → dock → save/load.
  3. Recovering a lost WebGL context or returning from a throttled tab resumes without corrupting simulation or save state, with no console errors and no runtime network calls during the loop.
  4. README and `FIDELITY.md` document build/run/test, controls, and each ported mechanic's Oolite source, and a licensing audit confirms `NOTICE`, `ASSETS.md`, the source offer, and the disclaimer all ship in the built site.
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation, Containers & Compliance | 7/7 | Complete    | 2026-11-02 |
| 2. Data Pipeline & Content Compiler | 9/9 | Complete    | 2026-11-03 |
| 3. Flight in the Lave System | 14/14 | Complete    | 2026-11-04 |
| 4. Manual Docking | 8/8 | Complete    | 2026-11-05 |
| 5. Docked Economy & Station Screens | 6/6 | Complete    | 2026-11-06 |
| 6. Hyperspace, Navigation & Persistence | 11/12 | In Progress | - |
| 7. Hardening & Community Release | 0/TBD | Not started | - |

## Roadmap Notes

- **Coverage:** 68 of 68 v1 requirements mapped, each to exactly one phase; none orphaned, none duplicated. Fourteen v2 requirements and the Out of Scope table in `REQUIREMENTS.md` are untouched by this milestone.
- **Requirement move:** WORLD-06 (pure hyperspace distance/fuel/jump-time math) is scheduled in Phase 6 with NAV-03 and NAV-06 so a single module owns the rule. It is still verified by the Lave→Diso and Lave→Zaonce fixtures before Phase 6 exits.
- **Research flags for plan-phase:** Phase 2 (OpenStep grammar edge cases, `like_ship` overlay order, `.dat` UV/normal semantics, Oolite Phong→glTF material conversion, byte-determinism across container architectures) and Phase 4 (measure the actual dock mesh before hard-coding corridor thresholds). Light research: Phase 3 (planet surface approach, log-depth vs two-pass on Safari) and Phase 6 (Playwright/WebGL and IndexedDB across reload inside the container).
- **No research needed:** Phase 1 is a walking skeleton, though the Compose topology is authored here from `PROJECT.md`'s constraints since research does not cover containers; Phase 5's formulas, fixtures, and screen contents are transcribed in `research/FEATURES.md`.
- **Container rule for every phase:** a green host run is not evidence. Each phase's success criteria are only considered met when they pass under `docker compose run --rm verify` (or `e2e`), which Phase 1 establishes.
