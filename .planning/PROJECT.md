# Wegolite

## What This Is

Wegolite is a browser-based reimplementation of Oolite's core single-player experience — the open-source Elite clone. Players fly a Cobra Mk III out of a Coriolis station, dock manually, trade commodities between star systems, and improve their ship, all inside a desktop web browser with no install. It is an open-source fan project for the Oolite/Elite community; expansion packs (OXPs) are explicitly out of scope.

## Core Value

A player can launch, fly, dock, and complete a profitable trade run between two star systems entirely in the browser — faithful to Oolite's rules, data, and feel.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

(None yet — ship to validate)

### Active

<!-- Current scope. Building toward these. -->

- [ ] Player can launch from a Coriolis station into open space
- [ ] Player can fly with a faithful pitch/roll flight model (Elite-style controls, no yaw)
- [ ] Player can manually dock with a station, with a buyable docking computer as an assist
- [ ] Player can buy and sell the core commodity set at station markets, with prices driven by Oolite's economy rules
- [ ] Player can hyperspace between star systems using fuel and the galactic chart
- [ ] Player can view station screens: market, equipment, galactic chart, ship status
- [ ] Player can save and resume progress in the browser
- [ ] Ship, commodity, equipment, and system data is ported from Oolite's config files rather than invented
- [ ] Client maintains a steady frame rate on desktop hardware, with a clean separation between simulation and rendering

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- Combat, pirates, missiles, shields, energy banks — deferred to v2; v1 proves flight, navigation, and economy first
- NPC ship traffic and AI — deferred to v2 alongside combat; v1 space is intentionally empty
- Missions, contracts, ranking, and legal status — deferred; they depend on combat and a mature economy
- Expansion packs (OXPs) and scripting support — explicitly excluded from the project's premise
- Multiplayer or any server component — static client only, no backend
- Mobile and touch controls — deferred, but input and UI must sit behind abstractions that allow it
- Sound and music — deferred until the core loop is playable; asset pipeline will be added later

## Context

**The source game.** Oolite is written in Objective-C (with some C/C++) on GNUstep + SDL + OpenGL, spanning roughly 515 source files. It ships its own JavaScript engine for world scripts, which is why its gameplay logic maps cleanly onto TypeScript. It is licensed GPL-2.0-or-later, and its art, sound, and configuration files are additionally available under CC BY-NC-SA 3.0.

**Reusable data.** `Resources/Config/` holds the canonical plists: `shipdata.plist`, `trade-goods.plist`, `equipment.plist`, `world-scripts.plist`, plus `planetinfo.plist` with all 2,048 systems across the eight galaxies. These are the source of truth for faithful numbers.

**Prior art worth studying.** Oolite's docking approach, flight model constants, commodity price formula, and hyperspace distance rules are documented on the Oolite wiki and in the source. Port mechanics from documented behavior; port numbers from the config files.

**Why the browser.** The goal is zero-install access for fans on any modern desktop machine. A static site with WebGL2 is the lowest-friction delivery mechanism.

**Container-first development.** Every process in the project — dev server, production preview, unit tests, and browser tests — runs in Docker. The host machine is only expected to provide Docker and a browser; no host Node/npm install is authoritative. Because the client is static and saves live in IndexedDB, no database service is required. If server-side persistence is ever added, it gets its own Compose service with a healthcheck rather than a host install.

## Constraints

- **License**: GPL-2.0-or-later — chosen because the project ports Oolite's data and may port logic; mismatched licensing would make distribution indefensible.
- **Assets**: CC BY-NC-SA 3.0 — reused models, textures, and audio require attribution, share-alike, and forbid commercial use.
- **Tech stack**: TypeScript, Three.js on WebGL2, Vite for building, Vitest for unit tests. No game engine, no framework-level abstraction over the simulation.
- **Platform**: Desktop browsers (Chrome, Firefox, Safari) served as a static site. No backend, no accounts, no network calls at runtime. No database.
- **Containers**: The application (dev server and production preview) and the entire test suite run in Docker via Docker Compose. This includes headless browser tests — the image must ship the browsers, not download them on the host. Tests are only considered passing when they pass in the container. Host-side `npm test` is a convenience at most and never the source of truth.
- **Container reproducibility**: Compose must work from a clean checkout with one command, pin base images, and cache dependency layers. No service may require a manually installed host dependency beyond Docker itself.
- **Data fidelity**: System, commodity, equipment, and ship values come from Oolite's config, not from invention. Where the original is ambiguous, prefer documented Oolite behavior over guesswork.
- **Scope**: No expansion pack support. Ever, in this project's definition.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| TypeScript + Three.js instead of a WASM port of Oolite | GNUstep/Objective-C + legacy OpenGL would be a months-long build detour before the first frame; TypeScript matches Oolite's JavaScript-scripted logic | — Pending |
| Reuse Oolite's models, textures, and sounds | Fastest route to an authentic look and sound for a fan project; permitted under CC BY-NC-SA 3.0 | — Pending |
| Include hyperspace in v1 | Each system has a single station, so trading requires reaching a second market | — Pending |
| Defer combat to v2 | Combat is an independent system; v1 must first prove flight, docking, navigation, and economy | — Pending |
| Elite-style pitch/roll controls (no yaw) | Faithful to Oolite; yaw-free flight is central to the original feel | — Pending |
| Manual docking with a buyable docking computer | Preserves the skill and tension of docking without permanently blocking new players | — Pending |
| Desktop web only, mobile-ready architecture | Focus v1 effort while keeping input and UI behind interfaces so touch can be added later | — Pending |
| GPL-2.0-or-later for the project | Matches Oolite and is required for porting its code and data | — Pending |
| Docker for app runtime and all tests | Reproducible toolchain across contributors, no host drift, and the same image can serve the static build; headless browser tests stay self-contained | — Pending |
| No database service | The client is static and saves to IndexedDB; adding a DB now would be unused infrastructure | — Pending |
| Camera-relative rendering with a logarithmic depth buffer | Float32 world coordinates jitter at system scale (1.4e6 m); rendering relative to the camera keeps uploaded coordinates small and log depth separates near/far geometry | ✓ Phase 1 — marker placed at 1.4e6 m with 0.125 m ULP at that range (FOUND-08) |
| One multi-stage Dockerfile on `node:24-bookworm-slim`, with Chromium baked into the `ci` stage | Keeps app, tests, and CI on one pinned toolchain; no host install and no test-time browser download | ✓ Phase 1 — `docker compose run --rm verify` green from a clean, volume-free checkout |
| Determinism proven by 1/120 s fixed steps, cross-cadence hash equality, and checked-in golden fixtures | A single step rate plus cadence-independent hashes makes simulation regressions detectable without wall-clock flakiness | ✓ Phase 1 — identical hash at 30/60/144 Hz; golden fixture replays (FOUND-07) |
| No screenshot or pixel-diff evidence; assert renderer probes and console errors instead | Browser rendering evidence must be stable across machines; probe counters and error collection prove rendering without brittle image comparison | ✓ Phase 1 — precision and resize specs assert `renderer.info` counters, not pixels (D-08) |
| Launch roll is expressed in the station's world basis (D-10 reconciliation) | Oolite's authored `launchRoll = -station roll` is a ship-relative value; Wegolite gives the ship the station's world roll rate `+stationRollRadPerSec` about local `+Z` (the `stationAngle` axis), which is the same slot-steady motion in the other basis | ✓ Phase 3 — 03-02 proves the no-roll and doubled counter-rotation cases fail |
| Torus disengages on any pilot input (deliberately stricter than Oolite) | FLGT-04 requires pilot-input disengagement, while Oolite's keyboard path disengages on speed decrease and mass lock only; the stricter rule is kept and dust is the motion cue | ✓ Phase 3 — 03-04 implements it and 03-07 proves the dust cue |
| Calibrated-LDR exposure contract: linear light, `NoToneMapping`, one sRGB encode, exposure 1 | Reproduces the authored planet palette exactly (ACES would shift Lave's land and sea by several 8-bit levels and compress the polar whites) while reaching Oolite's measured station brightness with one sun intensity derived from Oolite's 3.75 radiance and 2.484 pre-exposure, not a taste-tuned 2.5 | ✓ Phase 3 — 03-10 pins the palette byte, 03-12 pins the lit station byte |
| Accept the SwiftShader e2e cadence as a known issue | Headless Chromium rasterises on SwiftShader (CPU) on the 4-CPU host; the message-expiry spec is a correctness wait on simulated `flightTime`, not a performance claim; the measured loaded frame is fill-bound (planet fragment shader ≈281 ms of 369 ms), and the cheap fixes (`antialias:false`, half resolution) would change the approved look; QUAL-01 (60 fps at 1080p, mid-range hardware) is measured separately on a real GPU in Phase 7 | Accepted 2026-11-04 — 29/29 green with a 300 s ceiling and pinned workers: 2; no product change |
| Measure the docking aperture at build time from the vendored `.dat` | The visible slot is the separate `oolite_coriolis_dock.dat` bbox (103.4123 × 241.888 × 250), not the hull; measuring at build keeps `src/sim` free of asset parsing and makes aperture drift an `assets:check` failure | ✓ Phase 4 — `04-01` emits `generated/dock-port.json`; `04-02` reproduces its corridor from the committed Cobra extents and validates every number in `createDockGeometry` |
| Apply the y auto-centre guard symmetrically | Oolite's `DockEntity.m:752` (`max.y > hh && min.y > -hh`) disables y correction exactly when the ship protrudes above the top edge, inconsistent with the x guard; the symmetric `max.y < hh && min.y > -hh` keeps the pull toward the port centre | ✓ Phase 4 — `04-02` `classifyCorridor` plus the y-guard boundary test |
| Leave the Phase 3 launch orientation untouched | `beginLaunch` keeps `orientation = stationBaseQuat`, which leaves the Cobra's wings across the tall slot; changing it would break the pinned launch camera and orientation test, so the need to roll roughly 90° is taught on approach instead | ✓ Phase 4 — `04-02` proves the wings-across launch pose is `outside`, never a straddle; `04-03` owns the teaching copy |
| Apply the auto-centre delta once per fixed 1/120 s tick | Oolite's correction is per call and therefore frame-rate dependent; the fixed step makes the pull deterministic and the 60/120/144 Hz replay hash-equal | ✓ Phase 4 — `04-02` `stepDocking` applies the port-frame delta with no `dt` scaling; `dock-cadence` proves hash equality |
| Use the union contact proxy (hull + tris + faceplate) | The faceplate protrudes to station-local z −534.298; a hull-only box would miss visible contact. The proxy is a conservative axis-aligned box, so contact can fire slightly before the mesh but never misses the faceplate | ✓ Phase 4 — `04-01` emits the contact box; `04-02` converts it once into port coordinates (`z` ≈ −1000.2561 … +34.0419) for `04-03`'s SAT |
| Arm the dock latch past the contact proxy, not at the mouth plane | Wegolite's Space-skipped launch has no `STATUS_LAUNCHING` status, so Oolite's early return (`DockEntity.m:718-720`) is unavailable; requiring `box.min.z > contactPort.zMax` makes the arming tick separated from the proxy along z, so a launch departure can never produce a contact response | ✓ Phase 4 — `04-02` `stepDocking` arms only there; natural and skipped-launch tests assert `dockArmed` flips exactly on the first qualifying tick with no scrape or dock |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-11-02 after Phase 1*
