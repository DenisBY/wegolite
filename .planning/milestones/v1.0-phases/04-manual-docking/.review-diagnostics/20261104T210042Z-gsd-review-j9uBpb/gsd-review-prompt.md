# Cross-AI Plan Review Request

You are reviewing implementation plans for a software project phase.
Provide structured feedback on plan quality, completeness, and risks.

## Project Context

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

## Phase 4: Manual Docking
### Roadmap Section

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
**Plans**: 5 plans in 5 waves
- [ ] 04-01-PLAN.md — Wave 1: measure the dock aperture at build time, emit `dock-port.json`, typed loader, golden + drift check
- [ ] 04-02-PLAN.md — Wave 2: port-frame corridor, lane/capture, safety-band auto-centring, docked transition (tracer: aligned approach docks)
- [ ] 04-03-PLAN.md — Wave 3: box-hull bounce, scrape/bounce events, shake/flash feedback, no-trap invariant
- [ ] 04-04-PLAN.md — Wave 4: credits, equipment purchase line, `Shift+C` docking computer (+20 min), aegis gate
- [ ] 04-05-PLAN.md — Wave 5: IndexedDB autosave on launch, title Continue/New game restore


### Requirements Addressed

- [ ] **DOCK-01**: The docking corridor is derived from the Coriolis dock geometry and matches the visible opening
- [ ] **DOCK-02**: The station spins at the Oolite rate, and docking tolerates station roll with x/y auto-centring
- [ ] **DOCK-03**: Off-axis contact produces scrape damage or bounce feedback, using the v1 collision-only hull model
- [ ] **DOCK-04**: Crossing 90% past the dock plane while aligned transitions cleanly into docked mode
- [ ] **DOCK-05**: A docking computer can be bought (TL 9, 1500 Cr) and grants instant docking on `Shift+C` with a +20 minute clock advance
- [ ] **DOCK-06**: A failed docking attempt never traps the player; they recover to flight with clear feedback
- [ ] **DOCK-07**: The game autosaves on launch so the docked state is always resumable

### Docked Mode, Economy & Station Screens
| DOCK-01 | Phase 4 | Pending |
| DOCK-02 | Phase 4 | Pending |
| DOCK-03 | Phase 4 | Pending |
| DOCK-04 | Phase 4 | Pending |
| DOCK-05 | Phase 4 | Pending |
| DOCK-06 | Phase 4 | Pending |
| DOCK-07 | Phase 4 | Pending |
| ECON-01 | Phase 5 | Pending |
| ECON-02 | Phase 5 | Pending |
| ECON-03 | Phase 5 | Pending |
| ECON-04 | Phase 5 | Pending |
| ECON-05 | Phase 5 | Pending |
| ECON-06 | Phase 5 | Pending |
| ECON-07 | Phase 5 | Pending |
| ECON-08 | Phase 5 | Pending |
| ECON-09 | Phase 5 | Pending |
| NAV-01 | Phase 6 | Pending |
| NAV-02 | Phase 6 | Pending |
| NAV-03 | Phase 6 | Pending |
| NAV-04 | Phase 6 | Pending |
| NAV-05 | Phase 6 | Pending |
| NAV-06 | Phase 6 | Pending |
| SAVE-01 | Phase 6 | Pending |
| SAVE-02 | Phase 6 | Pending |
| SAVE-03 | Phase 6 | Pending |
| SAVE-04 | Phase 6 | Pending |
| SAVE-05 | Phase 6 | Pending |
| SAVE-06 | Phase 6 | Pending |
| QUAL-01 | Phase 7 | Pending |
| QUAL-02 | Phase 7 | Pending |
| QUAL-03 | Phase 7 | Pending |
| QUAL-04 | Phase 7 | Pending |
| QUAL-05 | Phase 7 | Pending |
| QUAL-06 | Phase 7 | Pending |
| QUAL-07 | Phase 7 | Pending |
| QUAL-08 | Phase 7 | Pending |

**Coverage:**
- v1 requirements: 68 total
- Mapped to phases: 68
- Unmapped: 0

---
*Requirements defined: 2026-11-02*

### User Decisions (CONTEXT.md)

# Phase 4: Manual Docking - Context

**Gathered:** 2026-11-04
**Status:** Ready for planning

<domain>
## Phase Boundary

The player can fly a Cobra into the visible Coriolis opening by hand and dock, or fail and recover. Delivered in this phase:

- A docking corridor derived from the actual dock mesh and the ship's bounding box (not a trigger sphere), matching the visible aperture.
- Station-roll tolerance through x/y auto-centring, with scrape feedback while the player is being pulled in.
- 90 % past-plane capture into a clean `docked` mode.
- Elastic bounce, scrape message, camera shake and HUD flash on a failed approach; no damage stat, no trap states.
- A docking computer bought from a single line in the docked panel, and instant docking on `Shift+C` inside the station aegis with +20 minutes of clock.
- An IndexedDB autosave written on launch, restored through Continue / New game on the title screen.

Not in this phase: trade, market, the outfitting screen, flight-state persistence, save migrations, the F2 save screen, damage/energy/shields, sound, NPC traffic, missions, OXPs.

</domain>

<decisions>
## Implementation Decisions

### Corridor and capture (DOCK-01, DOCK-02, DOCK-04)
- **D-01:** Port Oolite's `shipIsInDockingCorridor` rule. The corridor starts from the dock mesh aperture and expands in ×1.25 steps until the ship's bounding box fits within 90 % of the aperture width and height. The bbox is evaluated in the port's frame, so the corridor rotates with the station. — **Reversibility:** costly — the aperture semantics are the contract the sim, the renderer feedback and the e2e probes all assume; changing them later means re-deriving thresholds and rewriting the docking tests.
- **D-02:** No explicit roll threshold. The bbox in the port frame is the only roll test; a rolled ship simply presents a wider footprint and fits worse, exactly as in Oolite. — **Reversibility:** reversible.
- **D-03:** Auto-centring follows Oolite: inside the 50 % safety band (`safety = 1.5` × aperture) with the nose inside, apply a continuous proportional x/y correction toward the port centre (`correction_factor = -min.z / (max.z - min.z)`) and scrape feedback each tick; capture when `0.90 · max.z + 0.10 · min.z < 0`. — **Reversibility:** costly — capture timing and correction strength define the feel of the whole phase and are asserted by tests; changing them invalidates tuned evidence.
- **D-04:** Speed does not gate docking. A fast but well-aligned approach captures, as in Oolite; "too fast" is interpreted as "did not get aligned in time", not as a separate rule. — **Reversibility:** reversible.
- **D-05:** A simultaneous opposite-edge straddle inside the safety band (bbox `min.x < -ww && max.x > ww`, or the same on y) is a failure and bounces. Oolite's fatal collision branch is not ported, because v1 has no damage model.

### Failure, feedback and recovery (DOCK-03, DOCK-06)
- **D-06:** No invented hull-integrity or health stat in v1. A failed approach costs time and position only. Real damage arrives with the v2 energy model. — **Reversibility:** reversible.
- **D-07:** Failure physics is an elastic bounce: velocity is reflected about the contact normal with a damping factor, orientation is preserved, and control returns on the same tick. No hard stop, no teleport back to an approach point. — **Reversibility:** reversible.
- **D-08:** Feedback channels are the HUD message line plus a short camera shake and a red HUD frame flash lasting 0.3–0.5 s. No sound (out of scope) and no new particle system. All three channels must be observable from the renderer probe. — **Reversibility:** reversible.
- **D-09:** Every failure recovers to `inFlight` on the same tick. No attempt may leave the player stuck inside geometry, in a limbo mode, or unable to retry. Defensive push-out applies only if the ship somehow ends up inside the station hull.

### Docking computer (DOCK-05)
- **D-10:** The docking computer is bought from one line in the existing docked panel: `Docking Computers — 1500.0 Cr`, with the TL 9 requirement and the credit deduction enforced against the player's real credits in decicredits. The default new game starts at 100.0 Cr and therefore cannot afford it — that is faithful Oolite economy, not a bug. The e2e grants credits through the existing probe/dev seam to exercise the purchase. Phase 5 replaces this line with the outfitting screen.
- **D-11:** `Shift+C` engages only inside `stationAegisRange` (51 200 units, 2 × scanner range, matching Oolite's `AEGIS_*`). Outside it the action produces a message, no docking and no clock change.
- **D-12:** Activation is instant with no animation: the same tick transitions `mode → docked`, shows the docked panel, advances the clock by 20 minutes and posts "Docking computers engaged". No timers, no scripted fly-in, no fade.

### Persistence (DOCK-07)
- **D-13:** On launch, write a versioned JSON save to IndexedDB containing the schema version, mode, clock, credits, owned equipment, and the system/station identity. The docked pose is derived from the layout on restore rather than stored as float position/quaternion. — **Reversibility:** costly — the save schema becomes a public contract that Phase 6 must migrate; shipping it unversioned would force a destructive migration.
- **D-14:** On boot, if a save exists the title screen offers Continue and New game. Continue restores the docked state; New game clears the save and starts fresh at Lave. D-09 of Phase 3 (start screen leading straight to the dock) is extended, not replaced.
- **D-15:** Phase 6 owns flight-state persistence, market state, migrations and the F2 save screen. Phase 4 saves only what a docked resume needs.

### the agent's Discretion
- How the dock aperture is measured from the `coriolis.glb` dock node (this is the ROADMAP research flag) and how numeric jitter around the measured plane is handled.
- The bounce restitution coefficient, camera-shake amplitude and flash timing within the stated 0.3–0.5 s, provided the probe can observe them.
- Save key naming, internal validation, and how a corrupt or future-version save is rejected, within the versioned-JSON requirement.
- Where the new `dockingComputer` action is surfaced in the controls/settings list.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase contract
- `.planning/ROADMAP.md` §Phase 4 (lines 142–153) — goal, DOCK-01..07 mapping, the five success criteria and the "measure the dock mesh" research flag.
- `.planning/REQUIREMENTS.md` — DOCK-01..07 verbatim; note that shields, energy banks and combat are out of scope for v1.
- `.planning/PROJECT.md` §Key Decisions — manual docking with a buyable computer; no screenshot evidence, probe assertions only; SwiftShader cadence accepted as a known issue.

### Prior phase context
- `.planning/phases/03-flight-in-the-lave-system/03-CONTEXT.md` — D-01..D-15, including the minimal docked panel (D-09), the scripted launch (D-10), the message-line-only teaching (D-11) and the localStorage-vs-IndexedDB split (D-12).
- `.planning/phases/03-flight-in-the-lave-system/03-VERIFICATION.md` — what the flight phase already proves about pose, mode and probes.

### Oolite behaviour (read-only checkout)
- `/home/opencode/git/oolite/src/Core/Entities/DockEntity.m` — `shipIsInDockingCorridor:` (~line 604): aperture expansion, in-lane test, 50 % safety band, scrape correction, 90 % capture; `pullInShipIfPermitted:`; `launchShip:`.
- `/home/opencode/git/oolite/Resources/Config/shipdata.plist` — `oolite_coriolis_dock` subentity definition.

### Content and assets
- `src/content/generated/equipment.json` — `EQ_DOCK_COMP`: 15 000 decicredits (1 500.0 Cr), tech level 9.
- `src/content/generated/ships.json` — `coriolis-station`: `station_roll = 0.08`, `rotating: true`, and the `is_dock` subentity position that `dockOffset` comes from.
- `third_party/oolite/` — the licence-audited vendored input, including the station model used for the aperture measurement.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/sim/world/layout.ts` — `SystemLayout` already exposes `stationBaseQuat`, `stationToPlanet`, `stationRollRadPerSec`, `dockOffset`, `scannerRange` and `stationAegisRange`; the corridor frame is derivable without new world data.
- `src/sim/flight/state.ts` — `FlightMode` and `dockMouthPosition(layout)` already define the docked pose; `serializeFlight`/`hashFlight` give a canonical text encoding to extend for the save.
- `src/app/mode.ts` — `advanceMode` is the single place to add `dock`/`undock` transitions instead of mutating `mode` ad hoc.
- `src/ui/docked.ts` — the docked panel already binds `[data-field]` and `[data-action]` with `textContent`; the purchase line extends the same panel.
- `src/input/actions.ts` — add a `dockingComputer` action to the existing semantic action map and defaults.
- `src/content/ships.ts` — `playerShip()` and `stationShip()` give the catalogue entries needed for bbox and dock measurement.
- `src/sim/flight/launch.ts` — the launch sequence is the natural hook for writing the autosave.

### Established Patterns
- `src/sim/` is pure TypeScript: no Three.js, no DOM, deterministic, fixed 1/120 s step. Docking geometry and capture belong there; feedback and UI stay downstream through events/probes.
- No screenshot or pixel-diff assertions; e2e asserts `window.__wegolite` probes and console errors.
- State mutations go through typed transitions, and every numeric field is `assertFinite`-guarded in the layout.
- Text reaches the DOM only through `textContent` (Pitfall 16).

### Integration Points
- `src/app/game-session.ts` — owns the docked/in-flight screen switch, the HUD canvas visibility and the docked panel lifecycle; the restore path and the Shift+C transition both land here.
- `src/render/bodies/station.ts` — holds the dock node and its transform; the aperture measurement reads from the same model.
- `src/app/hints.ts` — message-line hints, the channel for scrape and "too far" feedback.
- `src/settings/store.ts` — the existing versioned-JSON storage pattern to mirror for the IndexedDB save (separate store, separate key).
- No IndexedDB code exists yet anywhere in `src/`; this phase introduces the first one.

</code_context>

<specifics>
## Specific Ideas

- Corridor capture is Oolite's weighted plane test: `0.90 · max.z + 0.10 · min.z < 0`.
- Aperture expansion is `while (ship bbox width > ww · 0.90) ww *= 1.25`, and the same for height; then `ww *= 0.5; hh *= 0.5`.
- Safety band is `1.5 ×` the aperture; correction factor is `-min.z / (max.z - min.z)`.
- Station aegis is 51 200 units (2 × the 25 600 scanner range) — reuse the existing constant, do not invent a new radius.
- Docking computer: 15 000 decicredits = 1 500.0 Cr, TL 9, from `equipment.json`.
- New game starts at 100.0 Cr (1 000 decicredits) and 7.0 LY of fuel; the computer is deliberately unaffordable until trade exists.
- Clock advances by exactly 20 minutes on a computer dock, and by exactly 10 minutes on launch (Phase 3 D-10).
- The station rotates at 0.08 rad/s about its local Z; the corridor frame must follow it, which is what makes auto-centring necessary.
- Coriolis dock mesh sits 0.2561 m outside the hull and is a separate node — do not derive the aperture from the hull box.

</specifics>

<deferred>
## Deferred Ideas

- Outfitting screen with real equipment browsing and installation — Phase 5; the Phase 4 single purchase line is replaced there.
- Trading, market prices and cargo — Phase 5.
- Full flight-state persistence, market persistence, save migrations and the F2 save screen — Phase 6 (D-15).
- Damage, energy banks, shields, destruction and respawn — v2 combat model; Phase 4 deliberately has no damage stat.
- Oolite-faithful docking-computer autopilot fly-in instead of instant docking — rejected for DOCK-05 in this phase; may return as an option later.
- Sound and music for scrape/impact feedback — out of scope for v1.
- NPC traffic and docking queues — out of scope for v1.

</deferred>

---

*Phase: 04-Manual Docking*
*Context gathered: 2026-11-04*

### Research Findings

# Phase 4: Manual Docking - Research

**Researched:** 2026-11-04
**Domain:** Deterministic docking-corridor geometry (Oolite port), elastic hull response, docking-computer purchase, versioned IndexedDB autosave
**Confidence:** HIGH for corridor semantics and aperture numbers (read from Oolite source and the vendored `.dat`); MEDIUM for hull-collision/bounce design and feel constants (no Oolite equivalent is ported); MEDIUM for save/UI wiring (repo seams read, nothing built yet)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

### Corridor and capture (DOCK-01, DOCK-02, DOCK-04)
- **D-01:** Port Oolite's `shipIsInDockingCorridor` rule. The corridor starts from the dock mesh aperture and expands in ×1.25 steps until the ship's bounding box fits within 90 % of the aperture width and height. The bbox is evaluated in the port's frame, so the corridor rotates with the station. — **Reversibility:** costly — the aperture semantics are the contract the sim, the renderer feedback and the e2e probes all assume; changing them later means re-deriving thresholds and rewriting the docking tests.
- **D-02:** No explicit roll threshold. The bbox in the port frame is the only roll test; a rolled ship simply presents a wider footprint and fits worse, exactly as in Oolite. — **Reversibility:** reversible.
- **D-03:** Auto-centring follows Oolite: inside the 50 % safety band (`safety = 1.5` × aperture) with the nose inside, apply a continuous proportional x/y correction toward the port centre (`correction_factor = -min.z / (max.z - min.z)`) and scrape feedback each tick; capture when `0.90 · max.z + 0.10 · min.z < 0`. — **Reversibility:** costly — capture timing and correction strength define the feel of the whole phase and are asserted by tests; changing them invalidates tuned evidence.
- **D-04:** Speed does not gate docking. A fast but well-aligned approach captures, as in Oolite; "too fast" is interpreted as "did not get aligned in time", not as a separate rule. — **Reversibility:** reversible.
- **D-05:** A simultaneous opposite-edge straddle inside the safety band (bbox `min.x < -ww && max.x > ww`, or the same on y) is a failure and bounces. Oolite's fatal collision branch is not ported, because v1 has no damage model.

### Failure, feedback and recovery (DOCK-03, DOCK-06)
- **D-06:** No invented hull-integrity or health stat in v1. A failed approach costs time and position only. Real damage arrives with the v2 energy model. — **Reversibility:** reversible.
- **D-07:** Failure physics is an elastic bounce: velocity is reflected about the contact normal with a damping factor, orientation is preserved, and control returns on the same tick. No hard stop, no teleport back to an approach point. — **Reversibility:** reversible.
- **D-08:** Feedback channels are the HUD message line plus a short camera shake and a red HUD frame flash lasting 0.3–0.5 s. No sound (out of scope) and no new particle system. All three channels must be observable from the renderer probe. — **Reversibility:** reversible.
- **D-09:** Every failure recovers to `inFlight` on the same tick. No attempt may leave the player stuck inside geometry, in a limbo mode, or unable to retry. Defensive push-out applies only if the ship somehow ends up inside the station hull.

### Docking computer (DOCK-05)
- **D-10:** The docking computer is bought from one line in the existing docked panel: `Docking Computers — 1500.0 Cr`, with the TL 9 requirement and the credit deduction enforced against the player's real credits in decicredits. The default new game starts at 100.0 Cr and therefore cannot afford it — that is faithful Oolite economy, not a bug. The e2e grants credits through the existing probe/dev seam to exercise the purchase. Phase 5 replaces this line with the outfitting screen.
- **D-11:** `Shift+C` engages only inside `stationAegisRange` (51 200 units, 2 × scanner range, matching Oolite's `AEGIS_*`). Outside it the action produces a message, no docking and no clock change.
- **D-12:** Activation is instant with no animation: the same tick transitions `mode → docked`, shows the docked panel, advances the clock by 20 minutes and posts "Docking computers engaged". No timers, no scripted fly-in, no fade.

### Persistence (DOCK-07)
- **D-13:** On launch, write a versioned JSON save to IndexedDB containing the schema version, mode, clock, credits, owned equipment, and the system/station identity. The docked pose is derived from the layout on restore rather than stored as float position/quaternion. — **Reversibility:** costly — the save schema becomes a public contract that Phase 6 must migrate; shipping it unversioned would force a destructive migration.
- **D-14:** On boot, if a save exists the title screen offers Continue and New game. Continue restores the docked state; New game clears the save and starts fresh at Lave. D-09 of Phase 3 (start screen leading straight to the dock) is extended, not replaced.
- **D-15:** Phase 6 owns flight-state persistence, market state, migrations and the F2 save screen. Phase 4 saves only what a docked resume needs.

### the agent's Discretion
- How the dock aperture is measured from the `coriolis.glb` dock node (this is the ROADMAP research flag) and how numeric jitter around the measured plane is handled.
- The bounce restitution coefficient, camera-shake amplitude and flash timing within the stated 0.3–0.5 s, provided the probe can observe them.
- Save key naming, internal validation, and how a corrupt or future-version save is rejected, within the versioned-JSON requirement.
- Where the new `dockingComputer` action is surfaced in the controls/settings list.

### Deferred Ideas (OUT OF SCOPE)
- Outfitting screen with real equipment browsing and installation — Phase 5; the Phase 4 single purchase line is replaced there.
- Trading, market prices and cargo — Phase 5.
- Full flight-state persistence, market persistence, save migrations and the F2 save screen — Phase 6 (D-15).
- Damage, energy banks, shields, destruction and respawn — v2 combat model; Phase 4 deliberately has no damage stat.
- Oolite-faithful docking-computer autopilot fly-in instead of instant docking — rejected for DOCK-05 in this phase; may return as an option later.
- Sound and music for scrape/impact feedback — out of scope for v1.
- NPC traffic and docking queues — out of scope for v1.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DOCK-01 | The docking corridor is derived from the Coriolis dock geometry and matches the visible opening | Aperture measured from vendored `oolite_coriolis_dock.dat`: 103.4123 × 241.888 × 250 (§Aperture Measurement). Recommend build-time emit into generated JSON. |
| DOCK-02 | The station spins at the Oolite rate, and docking tolerates station roll with x/y auto-centring | Roll rate is **0.1256637 rad/s** (50 s period), not 0.08 (§Pitfall 1). Port frame follows `stationBaseQuat · axisAngle(z, stationAngle)`. Oolite auto-centring semantics cited line-by-line. |
| DOCK-03 | Off-axis contact produces scrape damage or bounce feedback, using the v1 collision-only hull model | Hull is a 1000×1000×~996 box (vendored `.dat`); bounce needs a transient impulse vector because `FlightState.speed` is scalar (§Hull collision + bounce). |
| DOCK-04 | Crossing 90% past the dock plane while aligned transitions cleanly into docked mode | `0.90·max.z + 0.10·min.z < 0` (DockEntity.m:711, :766). `stepDocking` runs after position + station-angle update in `stepFlight`. |
| DOCK-05 | A docking computer can be bought (TL 9, 1500 Cr) and grants instant docking on `Shift+C` with +20 min clock | `EQ_DOCK_COMP` price 15000 decicredits, TL 9 verified. **Lave raw TL is 4 → purchase is TL-gated at Lave (§Open Question 1).** Keyboard layer has no modifier chord support today (§Shift+C). |
| DOCK-06 | A failed docking attempt never traps the player; recovery to flight with clear feedback | No `limbo` mode; bounce + push-out in same tick; feedback via sim events → app-side `DockFeedback` → probe. |
| DOCK-07 | The game autosaves on launch so the docked state is always resumable | New `src/persistence/` module: port + IndexedDB adapter + pure validator; hook on the `launched` sim event. No new dependency. |
</phase_requirements>

## Summary

The visible Coriolis opening is the bounding box of the **separate** `oolite_coriolis_dock.dat` mesh, and Oolite's port dimensions are exactly that bbox size (`DockEntity.m:1044-1045`). Measured from the vendored file it is **103.4123 (x) × 241.888 (y) × 250 (z)**, with the mouth plane at the mesh's z = 0 and the tunnel extending 250 m inward. The slot is therefore **tall** (x < y); a Cobra (130 × 34.97 wide-flat bbox) fits only when rolled roughly 90° so its wings run along the slot's long axis. Oolite's launch code applies exactly that 90° twist; Wegolite's Phase 3 launch does not (§Pitfall 5). The aperture is deterministic input data, so it should be **measured at build time from the `.dat` (already parsed by `tools/oolite-ingest`) and emitted into generated JSON**, then consumed by `src/sim/` as plain numbers — no runtime GLB inspection, no hard-coded literal in sim code.

The Oolite algorithm (`DockEntity.m:604-774`) is small and fully read. The three things CONTEXT.md does not spell out and the planner must decide: (1) Oolite's y-axis auto-centring guard on line 752 is **inconsistent with the x guard** on line 748 (looks like an upstream bug); (2) Oolite's non-lane failure is ordinary octree collision, which Wegolite does not have — a hull collision shape and a bounce impulse must be introduced (the hull is a plain box, so this is cheap); (3) the flight model stores a scalar `speed`, so "reflect velocity about the contact normal while keeping orientation" needs a small transient `impulse` vector in `FlightState`.

Two issues need user attention before planning: **the docking computer is TL-gated and Lave's raw tech level is 4** (Oolite compares raw system TL ≥ equipment TL), so D-10 as written cannot complete a purchase at Lave without a test seam; and **CONTEXT.md's "0.08 rad/s" station roll is the authored right-angles/second value** — the real rate the code already uses is 0.1256637 rad/s.

**Primary recommendation:** Add one pure module `src/sim/dock/` (port frame, corridor classifier, hull collision, computer dock), driven from a new `stepDocking` call in `stepFlight` after the station-angle update; emit aperture + hull + ship-bbox numbers from `tools/oolite-ingest` into a new generated file; keep feedback (message/shake/flash) in an app-side `DockFeedback` driven by new `SimEvent`s and published to `window.__wegolite`; write the save through a small injected-port IndexedDB module with an in-memory fake in Vitest (no `fake-indexeddb`/`idb` dependency).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Dock aperture/hull/ship-bbox measurement | Build (`tools/oolite-ingest`) | — | Deterministic function of vendored `.dat`; already parsed + bounds-asserted there; keeps sim free of asset parsing |
| Port frame, corridor classification, capture, auto-centre | `src/sim/dock/` (pure) | — | Must be deterministic at 1/120 s and unit-testable; sim purity rule |
| Hull collision + bounce impulse | `src/sim/dock/` + `FlightState` | — | Position/velocity are sim state; feedback is not |
| Computer dock (`Shift+C`) | `src/sim` command → `stepFlight` | `src/input` (chord), app (message) | Mode + clock are sim state and change on the same tick (D-12) |
| Credits / equipment / TL gate | `src/sim/player/` (pure) | `src/content` (equipment JSON loader) | Pure rule over injected catalogue data; hash-neutral |
| Message line, camera shake, red flash | App/render (`src/app/dock-feedback.ts`, HUD draw, camera) | probe | Presentation only; never in `src/sim/` |
| Autosave / restore | `src/persistence/` (IndexedDB adapter) | app session | Browser API; validator is pure and Node-testable |
| Title Continue/New game, docked purchase line | `src/ui/` DOM (`textContent` only) | app session | Existing panel pattern |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| (no new runtime dependency) | — | Phase 4 is pure TS over existing `three@0.187.0`, `zod@4.6.7` | [VERIFIED: package.json:25-28 `"three": "0.187.0"`, `"zod": "4.6.7"`] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `zod` (existing) | 4.6.7 | Validate the parsed save blob and the new generated `dock-port.json` | Same pattern as `src/content/schemas/*` |
| `vitest` (existing) | 5.0.5 | Unit tests incl. in-memory `SaveStore` fake | [VERIFIED: package.json devDependencies] |
| `@playwright/test` (existing) | 1.64.1 | Real-IndexedDB reload proof in the container | [VERIFIED: package.json devDependencies] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-written ~60-line IDB adapter + in-memory port fake | `idb` | Seam flagged **SUS (too-new)** by the legitimacy gate; wrapper buys little for one object store |
| In-memory port fake in Vitest | `fake-indexeddb` (devDependency) | Seam flagged **SUS (too-new)**; would need `checkpoint:human-verify`. Not needed — the adapter is ~25 lines of IDB glue proved by Playwright |
| 8-corner AABB for ship footprint | Full 1548-vertex Cobra mesh | AABB is what D-01 says ("bounding box"); mesh vertices are Oolite's actual behaviour (`findBoundingBoxRelativeToPosition`) and slightly more permissive when rolled — optional later refinement |

**Installation:** none.

**Version verification:** no packages added. Legitimacy gate was run only to evaluate the two optional IDB helpers (below) and both were rejected.

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| fake-indexeddb | npm | latest 6.2.7 published 2026-10-30 | ~11.1M/wk | github.com/dumbmatter/fakeIndexedDB | SUS (`too-new`) | **Not recommended** (not needed). If the planner insists: devDependency only + `checkpoint:human-verify` before install |
| idb | npm | latest published 2026-10-06 | ~35.6M/wk | github.com/jakearchibald/idb | SUS (`too-new`) | **Not recommended** (not needed) |

[VERIFIED: `gsd-tools query package-legitimacy check --ecosystem npm fake-indexeddb idb` run this session; both verdict `SUS`, reason `too-new`, `postinstall: null`.] Both names were selected from training knowledge, so they are `[ASSUMED]` as recommendations regardless of registry existence.

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** fake-indexeddb, idb — neither is part of the recommended plan.

## Aperture Measurement (ROADMAP research flag)

**Recommendation: measure at build time from the vendored `.dat`, emit into generated JSON, consume as numbers in `src/sim/`.** Evidence:

- Oolite itself derives the port from the dock mesh bbox: `DockEntity.m:1044-1045` — `BoundingBox bb = [self boundingBox];` / `port_dimensions = make_vector(bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z);` [VERIFIED: /home/opencode/git/oolite/src/Core/Entities/DockEntity.m:1044-1045]
- Vendored dock mesh header: `// model size: 103.412 x 241.888 x 250.000` [VERIFIED: third_party/oolite/Models/oolite_coriolis_dock.dat:5]. Vertex min/max computed this session from all 244 vertices: x ∈ [-53.4118, 50.0005], y ∈ [-120.944, 120.944], z ∈ [-250.0, 0.0] [VERIFIED: computed from third_party/oolite/Models/oolite_coriolis_dock.dat].
- The ingest tool already records the same extents and fails the build on drift: `"oolite_coriolis_dock.dat": { x: 103.4123, y: 241.888, z: 250 },` [VERIFIED: tools/oolite-ingest/convert/dat.ts:121], enforced by `assertBounds(mesh, modelBounds(name), file)` [VERIFIED: tools/oolite-ingest/generate.ts:185] and exposed by `boundingBox(mesh)` [VERIFIED: tools/oolite-ingest/convert/dat.ts:709].
- Dock subentity placement (authored frame): `subentity_key = "oolite_coriolis_dock"; … position = (0, 0, 500.2561); is_dock = true;` [VERIFIED: /home/opencode/git/oolite/Resources/Config/shipdata.plist:1758-1761]. `deriveSystemLayout` uses `Math.abs(dockPosition[2])` as `dockOffset` [VERIFIED: src/sim/world/layout.ts:165]. The mouth plane is the mesh's z = 0; the tunnel runs 250 m *behind* it.
- The GLB already carries the dock translation and a separate `dock` node ("The Phase 2 GLB already separates the four coplanar layers … already carries the dock translation at local `-500.2561`; re-adding either would double the offset", src/render/bodies/station.ts:7-9). Runtime GLB inspection is therefore **unnecessary and more fragile** than the `.dat` (node transforms, float32 quantisation, Z-negation). Never derive the aperture from the hull box: hull is `x∈[-500,500] y∈[-500,500] z∈[-500,495.918]` [VERIFIED: computed from third_party/oolite/Models/oolite_coriolis.dat].
- Ship footprint: the committed golden already records Cobra bounds in the **Wegolite frame** — `"converted": { "min": [-65, -13.968799591064453, -43.46549987792969], "max": [65, 20.9960994720459, 37.907100677490234] }` [VERIFIED: tests/golden/content/ship-bounds.json:9-12]. Nose is local −Z (min z = −43.4655).

**Derived numbers (hand-computed from the above + DockEntity.m:632-654, rounded):**

| Quantity | Value |
|----------|-------|
| Port dims `(ww, hh, dd)` before expansion | 103.4123, 241.888, 250 |
| `rotatedPort` (`ww >= hh ? NO : YES`) | YES (slot is tall) |
| Cobra bbox extents (x, y, z) | 130, 34.965, 81.372 |
| `rotatedShip` | NO (130 ≥ 34.965) → `rotationsMatch` false → compare ship **y** vs `ww·0.90`, ship **x** vs `hh·0.90` |
| Expansion loops | None fire (34.965 ≤ 93.07; 130 ≤ 217.70) |
| Half-aperture after `*= 0.5` | `ww = 51.706`, `hh = 120.944` |
| Safety band (×1.5) | 77.56 × 181.42 half-extents |
| Roll tolerance (approx., AABB-corner model) | x-extent in port frame ≈ 130·sinφ + 35·cosφ ≤ 103.4 → φ ≲ 35° from "wings along slot" `[ASSUMED: planner should compute exactly in a unit test]` |

**Where measurement lives:** add a pure emitter in `tools/oolite-ingest/convert/` (e.g. `dock-port.ts`) that reads the three meshes `readModels` already loads (`generate.ts:171-190`) and emits `src/content/generated/dock-port.json` (canonical JSON, registered in the manifest like the other emitters, `generate.ts:133-139`). Emit, **already in the Wegolite frame (Z negated, same as GLB conversion, glb.ts:19)**: `port` {width, height, depth, centre offset not needed (Oolite tests against the port origin, see Pitfall 6)}, `hull` half-extents, `cobra` bbox. A drift test then pins it (existing `drift.test.ts` pattern, `npm run assets:check`). `src/content/` exposes it through a typed loader; **`src/sim/` must not import generated content** (tests/helpers/lave.ts:7-8 explains the existing rule) so the app passes the numbers into a `DockGeometry` value that `src/sim/dock/` accepts as an argument.

## Oolite Corridor Algorithm (as read)

All citations: `/home/opencode/git/oolite/src/Core/Entities/DockEntity.m` [VERIFIED: Read this session].

| Step | Lines | Verbatim | Notes |
|------|-------|----------|-------|
| Frame | 621-624 | `Quaternion q0 = quaternion_multiply(orientation, [station orientation]);` `vi = vector_right_from_quaternion(q0)`, `vj = …up…`, `vk = …forward…` | Port quat × station quat; roll is inherent |
| Ship bbox in port frame | 626-629 | `HPVector port_pos = [self absolutePositionForSubentity];` `arbb = [ship findBoundingBoxRelativeToPosition:port_pos i:vi j:vj k:vk];` | Mesh-vertex projection, relative to the **port origin** |
| Port dims | 632-634 | `ww = port_dimensions.x; hh = …y; dd = …z` | |
| Orientation match | 636-639 | `rotatedPort = (ww >= hh) ? NO : YES;` `rotatedShip = …` | |
| Expansion | 641-651 | `while (shipbb.max.x - shipbb.min.x > ww * 0.90) ww *= 1.25;` (and y/hh; swapped when rotations mismatch) | Uses the ship's **local** bbox (`[ship boundingBox]`), not the port-frame one |
| Halve | 653-654 | `ww *= 0.5; hh *= 0.5;` | |
| Past-end reject | 691-693 | `if (arbb.max.z < -dd) { return NO; }` | Ship entirely beyond the 250 m tunnel |
| In-lane | 695 | `(arbb.max.x < ww) && (arbb.min.x > -ww) && (arbb.max.y < hh) && (arbb.min.y > -hh)` | Strict inequalities |
| Capture (in-lane) | 711 | `if (0.90 * arbb.max.z + 0.10 * arbb.min.z < 0.0) // we're 90% in docking position!` → `pullInShipIfPermitted` | |
| Launching shortcut | 718 | `if ([ship status] == STATUS_LAUNCHING) {` → `return YES` | Launch never fights the corridor |
| Safety band | 724-726 | `GLfloat safety = 1.0 + (50.0 / 100.0);` `(arbb.min.x > -safety * ww) && (arbb.max.x < safety * ww) && …y…` | |
| Nose inside | 727 | `if (arbb.min.z < 0.0) // got our nose inside` | Correction only runs once the nose crosses the plane |
| Straddle (fatal in Oolite) | 730-734 | `if ((arbb.min.x < -ww && arbb.max.x > ww) \|\| (arbb.min.y < -hh && arbb.max.y > hh)) { … return NO;` | CONTEXT D-05 turns this into a bounce |
| Correction factor | 737 | `GLfloat correction_factor = -arbb.min.z / (arbb.max.z - arbb.min.z);` | Proportion of ship inside, 0..1 |
| Damage + events | 740-742 | `[ship takeScrapeDamage:5 * [UNIVERSE getTimeDelta] * [ship flightSpeed] from:station];` + `shipCollided` script events | **Not ported** (no damage model). Oolite has **no per-tick text message** here — scrape feedback in Oolite is sound + damage (`PlayerEntity.m:5701-5745`). The scrape *message* cadence is a Wegolite invention (see Pitfall 8) |
| Delta | 744-746 | `delta.x = 0.5f * (arbb.max.x + arbb.min.x) * correction_factor;` (same for y) | Centre-of-bbox offset × proportion inside |
| x guard | 748-751 | `if (arbb.max.x < ww && arbb.min.x > -ww) { delta.x = 0.0f; }` | Correct: no x correction when x is inside |
| **y guard** | 752-753 | `if (arbb.max.y > hh && arbb.min.y > -hh) {` → `delta.y = 0.0f` | **Inconsistent** with x guard (`>` vs `<`); likely upstream bug |
| Apply | 758-762 | `pos.x -= delta.y * vj.x + delta.x * vi.x;` … `[ship setPosition:pos];` | Position shift each tick, no velocity change |
| Capture (band) | 766 | `if (0.90f * arbb.max.z + 0.10f * arbb.min.z < 0.0f) {` → pull in | |
| Result | 770 / 773 | `return YES; // okay NOW we're in the docking corridor!` / `return NO;` | |
| Launch twist | 824-826 | `if ((port_dimensions.x < port_dimensions.y) ^ (bb.max.x - bb.min.x < bb.max.y - bb.min.y)) { quaternion_rotate_about_axis(&q1, launchVector, M_PI * 0.5); // to account for the slot being at 90 degrees to vertical` | Oolite rolls the Cobra 90° at launch |

**Omitted by CONTEXT.md (deliberately or not):** docking-clearance message (681-685), `allow_docking`/launch-only-dock scrape-and-bounce branch (696-708, irrelevant for the Coriolis `allow_docking` true), fatal straddle (734), shield/hull damage (740), `shipCollided` events. **Oolite's non-lane failure is ordinary octree collision** in `ShipEntity.m` (~11060-11135): elastic exchange along the contact vector plus `takeScrapeDamage`. Recommendation: do not port the octree; use the box hull below.

**Recommendation on the y-guard bug:** port **symmetrically** (`if (arbb.max.y < hh && arbb.min.y > -hh) delta.y = 0`) and record the deviation in a code comment + `.planning/PROJECT.md` Key Decisions. Faithful reproduction would disable y auto-centring exactly when the ship protrudes above the top edge. This is a user-visible fidelity choice → raised as Open Question 3.

## Architecture Patterns

### System Architecture Diagram

```
 Build time                         Runtime (app)                              Runtime (sim, 1/120 s)
 ----------                         -------------                              ----------------------
 third_party/oolite/Models/*.dat ─► tools/oolite-ingest ─► generated/dock-port.json
   (dock, hull, cobra bounds)                                  │
                                                               ▼  typed loader (src/content)
                                           DockGeometry (plain numbers) ─────────────┐
 keyboard (Shift+C chord) ─► Command{dockingComputer} ──┐                              ▼
 UI Launch button ───────► Command{launch} ──────────────┼─► stepFlight(state, layout, config, intent, commands, dt)
                                                         │     1 drain commands (launch / dockingComputer)
                                                         │     2 attitude, torus, speed/position   (inFlight only)
                                                         │     3 station angle, flightTime, clock
                                                         │     4 stepDocking(state, layout, geometry):    ◄── NEW, after 3
                                                         │          port frame = f(stationBaseQuat, stationAngle)
                                                         │          classify: none │ lane │ band(+auto-centre) │ capture │ straddle
                                                         │          hull collision (outside lane) → bounce impulse + push-out
                                                         ▼
                                           SimEvent[]: docked{via} │ scrape │ bounce │ dockDenied{reason}
                                                         │
                         ┌───────────────────────────────┴──────────────────────────────┐
                         ▼                                                              ▼
              handleEvent (game-session)                                    persistence (on `launched`)
              ├ messages.enqueue(...)                                       SaveV1 → zod-validated → IDB put
              ├ DockFeedback.trigger(shake, flash)  (flightTime clock)      boot: read → validate → title Continue
              ├ docked.show / hide, purchase line
              └ probe.dock {…}  (window.__wegolite)
```

### Recommended Project Structure
```
src/sim/dock/
├── geometry.ts        # DockGeometry type + assertFinite guard (numbers only)
├── port-frame.ts      # portFrame(layout, stationAngle) → {origin,i,j,k}
├── corridor.ts        # classifyCorridor(frame, geometry, pose) → outcome + correction
├── hull.ts            # box-hull collision → {normal, depth} | null; push-out
├── step.ts            # stepDocking(state, layout, geometry) → SimEvent[]
└── computer.ts        # dockWithComputer(state, layout) (aegis gate, +1200 s)
src/sim/player/profile.ts      # {credits:int decicredits, equipment:string[]}, canPurchase(), purchase()
src/persistence/save.ts        # SaveV1 type, zod schema, parseSave(), encode (pure)
src/persistence/idb-store.ts   # SaveStore port + IndexedDB adapter; memory-store.ts for tests
src/app/dock-feedback.ts       # shake/flash envelopes on the sim flightTime clock
src/content/dock-port.ts       # typed loader for generated/dock-port.json
tools/oolite-ingest/convert/dock-port.ts
```

### Pattern 1: Port frame in the Wegolite coordinate system
**What:** Wegolite negated Z, so the dock/outward normal is station-local **−Z**. Station orientation at time *t* is exactly what the renderer uses: `mul(layout.stationBaseQuat, axisAngle(0, 0, 1, stationAngle))` [VERIFIED: src/render/bodies/station.ts:209-212]. Use `i = rotate(q,(1,0,0))`, `j = rotate(q,(0,1,0))`, `k = rotate(q,(0,0,-1))` (outward). Port origin = `station.position + k·dockOffset`, which equals `dockMouthPosition(layout)` [VERIFIED: src/sim/flight/state.ts:119-124] because the roll axis passes through it. The ship's port-frame bbox is `dot(corner − origin, i/j/k)` over the 8 corners of the Wegolite-frame Cobra AABB rotated by the ship quaternion. Oolite's `k` points *out*; capture condition `0.9·max.z + 0.1·min.z < 0` therefore holds unchanged with `z = dot(·, k)`.
**Example:**
```typescript
// Source: derived from DockEntity.m:621-629 + src/render/bodies/station.ts:209-212 (this repo)
const q = mul(layout.stationBaseQuat, axisAngle(0, 0, 1, state.stationAngle));
const i = rotate(q, vec(1, 0, 0));
const j = rotate(q, vec(0, 1, 0));
const k = rotate(q, vec(0, 0, -1)); // outward; Wegolite dock/forward is local -Z
const origin = add(layout.station.position, scale(k, layout.dockOffset));
```

### Pattern 2: `stepDocking` placement and mode ordering
**What:** In `stepFlight`, run docking **after** step 5 (station angle/flightTime/clock) and **only when `state.mode === "inFlight"`** and not `launchedThisStep` [step order: src/sim/flight/step.ts:57-133]. The port frame must use the *post-increment* `stationAngle` or the corridor lags the visible slot by one tick. On capture: `mode = "docked"`, `speed = 0`, `rollRate = pitchRate = 0`, `position = dockMouthPosition(layout)`, `orientation = layout.stationBaseQuat`, push `{kind:"docked", via:"manual"}`. Clock does **not** advance on a manual dock (only launch +600 s, computer dock +1200 s). `state.stationAngle` is left as-is; `beginLaunch` resets it to 0 anyway [VERIFIED: src/sim/flight/launch.ts:55 `state.stationAngle = 0;`]. Because the existing roll update is gated on `modeAtStart !== "docked"` [step.ts:115], docking this tick still advances the angle once — harmless.
**Why mode lives in sim, transitions in `advanceMode`:** extend `ModeTransition` in `src/app/mode.ts:18` (`"launch" | "launchComplete"`) with `"dock"`; the table there is a presentation mirror, not an authority (`mode.ts:11-12`). The authoritative write is in `stepDocking`/`computer.ts`.

### Pattern 3: Hull collision + bounce (the part Oolite does not give us)
**What:** The Coriolis hull is a box in station-local coords (±500 on x/y; z from −495.918…+500 in the authored frame, i.e. mirrored in Wegolite). Transform the ship's 8 AABB corners into station-local coordinates; if any corner is inside the hull box **and the ship is not classified lane/band**, resolve along the axis of least penetration: normal = that face's world normal, push position out by the penetration depth, apply an impulse `v' = v − (1+e)(v·n)n` and then `speed` is recomputed. Because `FlightState.speed` is scalar along forward [VERIFIED: src/sim/flight/speed.ts `state.position = add(state.position, scale(forward, state.speed * dt))`], add to `FlightState`: `impulse: Vec3` (world m/s, exponentially damped, e.g. τ ≈ 0.6 s) integrated into `position` each inFlight tick, plus integer counters `bounceCount`, `scrapeTicks`, `dockCount` for hash/probe. `speed` is multiplied by a damping factor (e.g. 0.35) at contact; orientation is untouched (D-07). Restitution `e` ≈ 0.5, impulse floor ≥ 8 m/s so a zero-speed brush still separates (Oolite's own "must provide at least 1 m/s" rule, ShipEntity.m ~11100-11103) `[ASSUMED: tuning values]`.
**Trap-state guard (D-09):** if a corner is deep inside the box (penetration > half-extent along every axis) push out along the **outward dock normal** if inside the tunnel footprint, else along the nearest face. Never leave `mode` anywhere but `inFlight`.
**Oolite caveat:** Oolite hulls use an octree and tunnel walls are collidable; the box model with an aperture exception (lane/band ⇒ corridor-protected) gives the same macro behaviour for the single Coriolis. The tunnel interior (z 0…−250 from the mouth) must not be hull-collidable inside the lane/band footprint or the ship would bounce on its way in.

### Pattern 4: Feedback outside the sim
**What:** `SimEvent` gains `{kind:"scrape"}` (once per tick while auto-centring), `{kind:"bounce", speed:number}`, `{kind:"docked", via}`, `{kind:"dockDenied", reason:"outsideAegis"|"notInstalled"}` [event union at src/sim/events.ts:34-40; events carry no copy]. `handleEvent` (src/app/game-session.ts:291-321) maps them: message via `messages.enqueue` (4 s sim-clock expiry, queue cap 4 — src/render/hud/messages.ts), a **throttled** scrape message (≥ 1.0 s of `flightTime` between enqueues, else the 4-slot queue floods at 120 Hz), `DockFeedback.trigger(...)`. **Do not use `HintController`** for these: it is once-per-install teaching persisted in settings (`hints.ts:1-12,73-114`). `DockFeedback` keeps `{shakeUntil, flashUntil, amplitude}` on the **sim `flightTime`** (pause-safe, deterministic) and exposes `shakeOffset(flightTime)` and `flashAlpha(flightTime)`. Camera shake is added where the cockpit camera pose is computed (`computeCockpitCamera(pose.position, pose.orientation)`, src/app/game-session.ts:445) as a small deterministic sinusoid (no `Math.random`); the red frame flash is a new field on the HUD model drawn by `drawHud` (src/render/hud/draw.ts:352). Publish `probe.dock = { outcome, scrapeCount, bounceCount, dockCount, shake: number, flash: number, lastMessage }` (new optional field on `WegoliteProbe`, src/app/probe.ts:81-124) so e2e asserts numbers, never pixels. Flash 0.4 s, shake 0.35 s, amplitude ~0.6 m camera offset `[ASSUMED: tuning]`.

### Anti-Patterns to Avoid
- **A trigger sphere / distance check for capture** — contradicts DOCK-01; use the port-frame bbox.
- **Computing the port frame from the previous tick's `stationAngle`** — one-tick lag; run after step 5.
- **Mutating `state.mode` from `game-session.ts`** — all docking transitions happen inside `stepFlight` so replay/hash stay authoritative.
- **Putting shake/flash/message state into `FlightState`** — pollutes hashing and `src/sim/` purity; keep in `src/app/`.
- **Storing the docked pose (float position/quaternion) in the save** — D-13: derive from the layout.
- **Importing generated JSON in `src/sim/`** — violates the content-boundary guard; inject numbers.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Dock/hull/ship bounds | Hand-typed constants in sim | Build-time emit from `.dat` through existing `boundingBox`/`assertBounds` | Drift protection already exists (`dat.ts:709`, `generate.ts:185`) |
| Quaternion/vector maths | New helpers | `src/sim/math.ts` (`mul`, `axisAngle`, `rotate`, `normalize`, `add`, `scale`, `sub`, `vec`, `moveToward`, `clamp`) | Already used by launch/speed (launch.ts:17, speed.ts) |
| Save validation | Ad-hoc `typeof` checks | `zod` strict object (same dependency as content schemas) + explicit `version` literal | Corrupt/foreign blobs rejected the way `settings/schema.ts` does |
| Canonical hashing | `JSON.stringify` | `canon`/`fnv1a32` in `src/sim/hash.ts`, extend `serializeFlight` | Pattern C is already enforced (state.ts:91-96) |
| Message queue / expiry | New timers | `createMessageQueue` (sim-clock expiry) | Pause-safe by construction |
| IndexedDB helpers | `idb`/`fake-indexeddb` | A tiny `SaveStore` port + ~25 line adapter + in-memory implementation | Both helper packages are `SUS (too-new)`; one object store needs no wrapper |

**Key insight:** every "new" mechanic here is a thin layer over existing seams (layout frame, `stepFlight` order, event→message path, settings-store pattern). The only genuinely new maths is the OBB-vs-box hull response.

## Integration Seams (exact current APIs)

| File | Signature / anchor | Lines |
|------|--------------------|-------|
| `src/sim/world/layout.ts` | `interface SystemLayout { planet, sun, station, navBuoy, witchpoint: Body; stationToPlanet: Vec3; stationBaseQuat: Quat; stationRollRadPerSec: number; dockOffset: number; scannerRange; stationAegisRange; planetAegisRange; sunDir; rotationSpeed }`; `deriveSystemLayout(system: System, stationDef: ShipDef): SystemLayout` | 47-68, 122-125 |
| `src/sim/world/layout.ts` | `const STATION_AEGIS_RANGE = 51_200;` `const SCANNER_RANGE = 25_600;` `const STATION_RADIUS = 500;` | 71-76 |
| `src/sim/flight/state.ts` | `type FlightMode = "docked" \| "launching" \| "inFlight";` `interface FlightState {tick, mode, clockSeconds, flightTime, position, orientation, speed, pitchRate, rollRate, torus, stationAngle, launchElapsed, launchCount, compassMode, compassTarget}`; `initFlightState(layout)`, `poseOf`, `serializeFlight`, `hashFlight`, `dockMouthPosition(layout)`, `CLOCK_START = 2_084_004 * 86_400` | 18, 29-51, 60, 63-84, 95-116, 119-124 |
| `src/sim/flight/step.ts` | `stepFlight(state, layout, config, intent, commands: readonly Command[], dt): SimEvent[]` — command switch at 58-84; mode at 87-90; per-mode motion 95-110; station roll/clock gated `modeAtStart !== "docked"` at 115-128 | 37-134 |
| `src/sim/flight/launch.ts` | `beginLaunch(state, layout, config): boolean` (`+= 600` clock, dock-mouth pose, `speed = config.launchSpeed`, `stationAngle = 0`), `completeLaunch`, `stepLaunch`, `LAUNCH_DURATION = 2` | 38-57, 60-65, 72-96 |
| `src/sim/commands.ts` | `type Command = {kind:"launch"} \| {kind:"skipLaunch"} \| {kind:"toggleTorus"} \| {kind:"setPaused";paused} \| {kind:"cycleCompass"} \| {kind:"targetStation"}` | 13-19 |
| `src/sim/events.ts` | `SimEvent` union: `launched`, `launchComplete`, `torusEngaged{factor}`, `torusDisengaged{reason}`, `massLockChanged{locked}`, `compassTargetChanged{target}` | 34-40 |
| `src/app/mode.ts` | `advanceMode(mode, transition: "launch" \| "launchComplete")`, `screenForMode(mode)` | 18, 22-35 |
| `src/app/game-session.ts` | `createGameSession(options): GameSession`; `handleEvent` 291-321; `updateProbe` 323-414; `renderFrame` 416-501 (`hudCanvas.hidden = isDocked` at 473-475); `frame` 521-587 (per-step controller choice + `stepFlight` at 555-577); `start()` 589-717 (`initFlightState` at 627, `title.hide(); docked.show(system.name); docked.onLaunch(...)` at 709-713); test hook only under `?test=1` at 705-707 | as listed |
| `src/app/hints.ts` | `HintContext`, `hintText(id,bindings)`, `createHintController` — once-per-install, persisted; **not** the channel for scrape/bounce | 28-130 |
| `src/ui/docked.ts` | `DOCKED_CREDITS = "100.0 Cr"` (constant, **no real credits state exists**), `DockedPanel {show(systemName), hide(), setMessage(text), onLaunch(handler), dispose()}`, `requireField(root, field)` via `[data-field]`, Launch via `[data-action="launch"]` | 13-15, 17-24, 26-78 |
| `index.html` | `#docked` panel: fields `system`, `credits`, `ship`, `fuel`, `message`, button `data-action="launch"` | 274-288 |
| `src/ui/title.ts` | `TitleScreen {show, hide, onStart(handler), dispose}`; single `#title-start` button | 90-129 |
| `src/main.ts` | `title.onStart(() => { void session.start(); })` | 195-197 |
| `src/input/actions.ts` | `ActionId` union (12 ids), `ACTION_IDS`, `DEFAULT_BINDINGS` (frozen `Record<ActionId, readonly string[]>`), `ACTION_LABELS` | 142-211 |
| `src/input/keyboard.ts` | `EDGE_COMMANDS: Partial<Record<ActionId, Command>>`; `keyDown(code, repeat)` has **no modifier argument**; `onKeyDown` drops any Ctrl/Meta/Alt chord except `ControlLeft/Right`, Shift is not filtered | 29-34, 80-94, 152-177 |
| `src/content/ships.ts` | `loadShipCatalogue()`, `findShip`, `playerShip(catalogue)`, `stationShip(catalogue)` (`oolite_template_cobra3-player`, `coriolis-station`) | 21-22, 33-74 |
| `src/content/schemas/equipment.ts` | `techLevel: z.number().int()`; **no equipment loader exists in `src/content/`** (only the schema) | 24 |
| `src/settings/store.ts` | `loadSettings(storage = localStorage)`, `saveSettings`, `resetSettings`; key `wegolite.settings` + `wegolite.settings.corrupt`; newer version ⇒ defaults without overwrite | 41-106 |
| `src/app/probe.ts` | `WegoliteProbe` (additive optional fields), `createTestHook(state, scenes)` → `{setPosition, setSpeed, swapSystem, disposeSystem}` only under `?test=1` | 81-124, 156-172 |

**Quoted discrete values:** `const STATION_AEGIS_RANGE = 51_200;` [VERIFIED: src/sim/world/layout.ts:76]; `export type FlightMode = "docked" | "launching" | "inFlight";` [VERIFIED: src/sim/flight/state.ts:18]; `state.clockSeconds += 600;` [VERIFIED: src/sim/flight/launch.ts:48]; `export const DOCKED_CREDITS = "100.0 Cr";` [VERIFIED: src/ui/docked.ts:13]; `"key": "EQ_DOCK_COMP", "name": "Docking Computers", "price": 15000, "priceUnit": "decicredits", "techLevel": 9` [VERIFIED: src/content/generated/equipment.json:58-62]; `stationRoll: 0.08` and `isDock: true … position: [0, 0, 500.2561]` [VERIFIED: src/content/generated/ships.json coriolis-station shipDef, read this session]; `expect(layout.stationRollRadPerSec).toBe(0.125_663_706_143_591_74);` [VERIFIED: tests/sim/layout.test.ts:102].

## Shift+C, Credits and Purchase

- **Keyboard:** bindings are `KeyboardEvent.code` strings with no chord notion [src/input/keyboard.ts:80-94]. Add `dockingComputer` to `ActionId`, `ACTION_IDS`, `DEFAULT_BINDINGS` (`["KeyC"]`), `ACTION_LABELS`, and `EDGE_COMMANDS` (`{kind:"dockingComputer"}`), then make the *keyboard layer* require Shift for that one action: extend `InputState.keyDown(code, repeat?, mods?: {shift: boolean})` and a small `REQUIRES_SHIFT: ReadonlySet<ActionId>`; `onKeyDown` already lets Shift through. Plain `C` without Shift must not fire. Rebinding UI (`src/ui/controls.ts`) stays code-only, so the Shift requirement is documented in the action label ("Docking computer (Shift+)"). Existing tests that count actions must be updated (`tests/input/bindings.test.ts`, `tests/settings/schema.test.ts` — settings blobs from older builds lack the new action key; `mergeDefaults` must supply it, settings.ts:184-198 pattern).
- **Credits:** there is **no credits state anywhere** — only the constant `DOCKED_CREDITS`. Introduce `PlayerProfile {credits: number /* integer decicredits */; equipment: readonly string[]}` in `src/sim/player/profile.ts` (not in `FlightState`, so `hashFlight`/cadence tests stay untouched). New game: `credits = 1000` (100.0 Cr, CONTEXT "Specifics"). `formatCredits(decicredits)` = `(d/10).toFixed(1) + " Cr"`. Docked panel gets one extra row `[data-field="dockcomp"]` + `[data-action="buy-dockcomp"]` (extend `requireField` pattern, `textContent` only).
- **Equipment data:** no loader exists; add `src/content/equipment.ts` mirroring `ships.ts` (lazy `?raw` JSON + zod `EquipmentSchema`). `EQ_DOCK_COMP` values quoted above.
- **TL gate:** Oolite compares the **raw** system tech level to the equipment TL: `if (localtl < effectivetl) { return false; }` with `localtl = system.info.techlevel` [VERIFIED: /home/opencode/git/oolite/Resources/Scripts/oolite-conditions.js:80-91]. Lave's `techLevelRaw` is **4** [VERIFIED: computed from src/content/generated/systems/g0.json, id `g0-s7`, `techLevelRaw: 4`; the schema stores the raw value with no +1: src/content/schemas/system.ts:20-21]. Therefore a faithful TL-9 gate **refuses the purchase at Lave**. See Open Question 1.

## Persistence (IndexedDB)

**State of the repo:** no IndexedDB code exists [VERIFIED: `rg -n indexedDB src tests` → no matches; ran this session]. Settings are a `localStorage` versioned blob [src/settings/store.ts:1-15]; saves must use a **different** store and key (store.ts header: "IndexedDB stays reserved for game saves").

**Recommended minimal design**
- DB `wegolite`, version 1, one object store `saves`, one record key `"autosave"` (`[ASSUMED]` naming — discretion item).
- `SaveV1 = { version: 1, mode: "docked", clockSeconds: number, credits: number /* integer decicredits */, equipment: string[], system: { id: "g0-s7" }, station: { key: "coriolis-station" } }`. Stored as a **plain JSON string** (not a structured-clone object) so validation is one `JSON.parse` + zod, mirroring `loadSettings`. No float pose, no timestamps/host data.
- Pure `parseSave(raw: unknown): {ok:true; save} | {ok:false; reason:"corrupt"|"future-version"}` in `src/persistence/save.ts`: strict zod object, `version` literal 1, `clockSeconds` finite and ≥ `CLOCK_START`, `credits` safe non-negative integer, `equipment` ≤ N known keys from the equipment catalogue, system id must exist in the loaded galaxy. `version > 1` → `future-version`, **left untouched in IDB** (never overwritten — same rule as settings, store.ts:58-65); corrupt → treated as no save and (best-effort) copied to key `"autosave.corrupt"`.
- `SaveStore` port `{ read(): Promise<string | null>; write(json: string): Promise<void>; clear(): Promise<void> }`. `IndexedDbSaveStore` opens lazily, wraps each request in a Promise, and **swallows/ reports** failures (private mode, quota): a failed write must never break the game (store.ts:91-95 precedent). `MemorySaveStore` in `src/persistence/` for Vitest and e2e-independent unit tests.
- **Hook:** write on the `launched` event in `handleEvent` (src/app/game-session.ts:293-298). The save payload uses the state *after* `beginLaunch` (clock already +600 s) but declares `mode: "docked"` — i.e. "resume docked at this clock". The write is fire-and-forget (`void store.write(...)`) and must not block the frame loop.
- **Restore:** boot reads the save before the title is shown (async, with the store injected); title gets a second button `#title-continue` (hidden when no valid save). **Keep `#title-start` as "New game"**: existing specs click it on fresh contexts [tests/e2e/aspect.spec.ts:43, dispose.spec.ts:29,115, launch.spec.ts:100]. Note `launch.spec.ts:96-102` reloads *after a launch*, so with autosave present that spec must still pass: `#title-start` = New game clears the save and starts fresh, which matches the spec's expectation (docked, `launch.seen` true because `launchSeen` is in `localStorage`). Continue = `initFlightState(layout)` then overwrite `clockSeconds`, plus profile restore.
- **Interaction with localStorage settings:** none beyond sharing boot; New game does **not** touch `wegolite.settings` (bindings/hints survive).
- **Vitest strategy:** unit-test `parseSave` (table-driven: valid, wrong version, future version, NaN clock, negative credits, unknown equipment, extra keys, truncated JSON), the autosave-on-`launched` mapping with `MemorySaveStore`, and Continue/New-game state derivation. **Real IndexedDB is proved only in Playwright** (reload within the container, `window.__wegolite.mode === "docked"` and `clock` equal to the saved clock). No new dependency.

## Common Pitfalls

### Pitfall 1: Station roll rate is 0.1256637 rad/s, not 0.08
**What goes wrong:** CONTEXT.md "Specifics" says "The station rotates at 0.08 rad/s". `station_roll = 0.08` is authored in right-angles/second; the sim already converts it (`stationRollRadPerSec: (stationRoll * Math.PI) / 2`, layout.ts:181; pinned to `0.125_663_706_143_591_74` / 50 s period in tests/sim/layout.test.ts:102-103). Tuning auto-centring against 0.08 would under-estimate the port's edge speed by ~57 %.
**How to avoid:** always read `layout.stationRollRadPerSec`. Port-edge speed at the far corner of the safety band ≈ ω·r ≈ 0.1257 × ~190 m ≈ 24 m/s.
**Warning signs:** a hard-coded `0.08` anywhere in `src/sim/dock/` or tests.

### Pitfall 2: Station roll frame vs ship frame
**What goes wrong:** the port frame rotates with `stationAngle`; the ship frame does not (the player's roll is independent). An approach flown "level" in the world is progressively mis-rolled relative to the slot.
**How to avoid:** project **in the port frame** only; never compare ship world axes to station base axes. Test with `stationAngle` ≠ 0 (e.g. 0, π/4, π/2, π).

### Pitfall 3: Float jitter around the capture plane
**What goes wrong:** the capture test is `0.9·max.z + 0.1·min.z < 0` on a value that crosses zero at ~3 m/tick.
**How to avoid:** the sim is deterministic float64; compute everything from **relative** vectors (`corner − port origin`), never from absolute world positions (|station| ≈ 8×10⁴…10⁵ m); no epsilon in the sim (strict `< 0`, Oolite does the same). Tests use a ±1e-9 tolerance only when constructing boundary poses. Speed is capped at 350 u/s ⇒ 2.9 m/tick ≪ the 81 m ship length, so the plane cannot be tunnelled; but the `?test=1` `setSpeed` hook can inject arbitrary speed — clamp inside `stepDocking` tests, not in the hook.

### Pitfall 4: Mode transition ordering
**What goes wrong:** docking inside the per-step callback while `renderFrame`/`showHint` read `state.mode` the same frame can show the flight HUD over the docked panel or fire the "launch" hint twice.
**How to avoid:** all state writes happen in `stepFlight`; the app reacts to the `docked` event in `handleEvent` (call `docked.show(system.name)`, `hudCanvas.hidden = true`, reset input via `input.clearAll()`, `launchSequence.reset()`). `renderFrame` already derives `hudCanvas.hidden` from `mode` (game-session.ts:473-475) — keep it the single source. Reset `currentPose`/`previousPose` to the docked pose on dock (else `interpolatePose` smears the camera across the teleport).

### Pitfall 5: Phase 3 launch does not apply Oolite's 90° twist
**What goes wrong:** `beginLaunch` sets `orientation = layout.stationBaseQuat` (launch.ts:50) and `tests/sim/launch.test.ts:112` expects exactly that (`expect(state.orientation).toEqual(fixture.layout.stationBaseQuat)`). Oolite rolls the Cobra 90° when `(port x < port y) XOR (ship x < ship y)` (DockEntity.m:824-826), which is true here. After launch the player therefore leaves the station with wings **across** the tall slot — and the first thing they must learn for re-docking is "roll 90°".
**How to avoid:** do **not** silently change launch orientation in Phase 4 (would break the pinned Phase 3 test and the launch camera). Teach the roll via an on-approach message. Raise as Open Question 2.

### Pitfall 6: Port origin is not the dock-mesh bbox centre
**What goes wrong:** the dock mesh x range is [-53.4118, 50.0005] (centre −1.706). Oolite tests lane membership against the **port origin** (`DockEntity.m:695`: `arbb.max.x < ww … arbb.min.x > -ww`), not the bbox centre.
**How to avoid:** treat the aperture as symmetric ±`width/2` about the origin (exactly Oolite). Do not "centre" using the mesh bbox.

### Pitfall 7: Auto-centring is a continuous positional shift
**What goes wrong:** the correction (DockEntity.m:758-762) adds `delta` to position **every tick** and changes no velocity. At 120 Hz the pull is much stronger than Oolite's variable frame rate if `delta` is not tied to `dt`; Oolite's own `delta` is per-call (frame-rate dependent!).
**How to avoid:** D-03 says "continuous proportional correction": apply `delta` per fixed tick (as ported, 1/120 s steps) and verify in a test that docking success is **cadence independent** (the sim step is fixed, so `flight-cadence.test.ts`-style 60/144 Hz replays hash-equal). Also: the `delta` depends on the bbox centre offset × proportion-inside, which is 0 until the nose crosses the plane (`min.z < 0`), so there is no pre-plane pull — hence the player must be in the *band* when the nose arrives.

### Pitfall 8: Scrape message flooding
**What goes wrong:** Oolite emits per-tick scrape *damage + sound*, not text. Enqueuing one message per tick overflows the 4-slot queue (messages.ts, cap 4) and the line flickers.
**How to avoid:** emit a `scrape` sim event each correcting tick, but throttle the *message* to ≥ 1 s of `flightTime` and let shake/flash be edge-triggered (restart envelopes only when idle).

### Pitfall 9: Trap states
**What goes wrong:** a ship stationary inside the lane (speed 0) with the nose past the plane never meets the 90 % condition; or a ship teleported inside the hull box.
**How to avoid:** the player can always accelerate forward (speed cap min 0, speed.ts clamp) and pitch/roll out; in the band they are pulled to centre; outside lane/band a face contact bounces. Add the defensive push-out for any state with corners inside the hull box outside the corridor footprint, and a property test: *from any initial pose near the station, ≤ N ticks of any input never leaves `mode` ≠ `inFlight` unless captured*.

### Pitfall 10: Hash and golden churn
**What goes wrong:** extending `serializeFlight` changes every `hashFlight` value. The Phase 1 golden is a **separate** sim state (`tests/golden/kinematic-probe.json`, src/sim/state.ts) and is unaffected, and the two flight tests that call `hashFlight` compare runs against each other (tests/sim/flight-cadence.test.ts:95, flight-controller.test.ts:87) — no literal hash is pinned [VERIFIED: `rg` for 8-hex literals returned none]. Append new lines at the **end** of `serializeFlight` (`impulse`, `dockCount`, `bounceCount`) and extend `initFlightState`.

### Pitfall 11: Generated-content drift gates
**What goes wrong:** adding `generated/dock-port.json` without registering it in the manifest/drift check fails `assets:check` and the content-boundary guard.
**How to avoid:** add the emitter to `generateContent` (generate.ts:133-139) and regenerate with `docker compose run --rm assets`; verify with `docker compose run --rm assets npm run assets:check`.

## Code Examples

### Corridor classification (pure; reference shape for the planner)
```typescript
// Source: DockEntity.m:632-773 (this research) — Wegolite frame, port origin as centre.
export type CorridorOutcome =
  | { kind: "outside" }
  | { kind: "lane" }                               // in lane, nose not yet at capture
  | { kind: "band"; deltaX: number; deltaY: number }  // auto-centre + scrape
  | { kind: "straddle" }                           // D-05: bounce
  | { kind: "capture" };

export function apertureHalfExtents(
  port: { width: number; height: number },
  shipLocal: { width: number; height: number },     // local bbox extents x,y
): { ww: number; hh: number } {
  let ww = port.width;
  let hh = port.height;
  const rotatedPort = ww < hh;
  const rotatedShip = shipLocal.width < shipLocal.height;
  const [a, b] = rotatedPort === rotatedShip
    ? [shipLocal.width, shipLocal.height]
    : [shipLocal.height, shipLocal.width];
  while (a > ww * 0.9) ww *= 1.25;
  while (b > hh * 0.9) hh *= 1.25;
  return { ww: ww * 0.5, hh: hh * 0.5 };
}
```
(`while` is bounded because `port.width > 0` — assert it at geometry construction, otherwise a 0 aperture loops forever: a hang, not an error.)

### Computer dock
```typescript
// D-11/D-12: same-tick transition; the aegis gate uses the existing layout constant.
if (lengthSquared(sub(state.position, layout.station.position)) <= layout.stationAegisRange ** 2) {
  state.mode = "docked"; state.speed = 0;
  state.position = dockMouthPosition(layout);
  state.orientation = layout.stationBaseQuat;
  state.clockSeconds += 20 * 60;               // exactly 1200 s
  events.push({ kind: "docked", via: "computer" });
} else {
  events.push({ kind: "dockDenied", reason: "outsideAegis" });
}
```
(Uses `aegisStatus(position, layout) === "dockingRange"` from src/sim/world/aegis.ts:34-52 instead of re-deriving; require equipment ownership in the **app** before pushing the command, and also guard in the sim so a stray command is a no-op.)

### Save validation skeleton
```typescript
// Source: pattern of src/settings/schema.ts + zod 4.6.7 (project dependency)
const SaveV1 = z.strictObject({
  version: z.literal(1),
  mode: z.literal("docked"),
  clockSeconds: z.number().finite().min(CLOCK_START),
  credits: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  equipment: z.array(z.string().max(64)).max(64),
  system: z.strictObject({ id: z.string().max(16) }),
  station: z.strictObject({ key: z.string().max(64) }),
});
```

## State of the Art

| Old approach | Current approach | When changed | Impact |
|--------------|------------------|--------------|--------|
| Oolite autopilot fly-in (docking computer) | Instant dock + 20 min clock (D-12) | Phase 4 decision | No scripted path code; deferred idea preserved |
| Oolite damage on scrape | Time/position cost + bounce | D-06 | No hull stat; no damage test surface |
| Hand-typed corridor numbers | Build-time measured, drift-checked JSON | This research | Aperture change fails `assets:check` |

**Deprecated/outdated:** the Phase 1 "probe" sim state is separate from flight state; do not extend `src/sim/state.ts` for docking.

## Runtime State Inventory

Not a rename/refactor/migration phase — section omitted. (New persisted state: IndexedDB `wegolite`/`saves`/`autosave`, owned by this phase; `wegolite.settings` in localStorage is unchanged.)

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Roll tolerance ≈ 35° from "wings along slot" under the AABB-corner model | Aperture Measurement | Feel of "correctly rolled"; compute exactly in a unit test |
| A2 | Bounce restitution ≈ 0.5, speed damping 0.35, impulse τ ≈ 0.6 s, impulse floor 8 m/s | Pattern 3 | Feel only; D-07 gives the shape, CONTEXT delegates constants |
| A3 | Flash 0.4 s, shake 0.35 s, amplitude ≈ 0.6 m | Pattern 4 | Must stay within the 0.3–0.5 s stated range |
| A4 | AABB-corner ship footprint is acceptable vs Oolite's mesh-vertex bbox | Standard Stack | Slightly stricter than Oolite when rolled |
| A5 | Box hull ±500 (authored z −500…495.918, faceplate to ±500) is a good-enough collision shape | Pattern 3 | Edge-case clipping at faceplate; verify visually via probe positions |
| A6 | Save key/DB names (`wegolite`/`saves`/`autosave`) | Persistence | Cosmetic; discretion item |
| A7 | Throttle scrape message to ≥ 1 s of `flightTime` | Pitfall 8 | UX only |
| A8 | Save clock = post-launch clock (+600 s already applied) | Persistence | Resumed clock differs by 10 min from a "pre-launch" interpretation |

## Open Questions

1. **TL gate vs Lave (blocks DOCK-05 purchase UX).**
   - Known: `EQ_DOCK_COMP` TL 9; Oolite refuses purchase when `system.info.techlevel < equipment TL` (oolite-conditions.js:80-91); Lave raw TL = 4; D-10 wants the TL requirement "enforced" and the e2e to "grant credits".
   - Unclear: should Lave's line show "unavailable — requires TL 9" (faithful), or should the Phase 4 line bypass the TL gate?
   - Recommendation: implement `canPurchase(profile, item, systemTechLevelRaw)` faithfully and unit-test it with a synthetic TL ≥ 9 system record; show the Lave line disabled with a reason; the e2e uses an additional `?test=1` hook `grantEquipment("EQ_DOCK_COMP")` / `setCredits(n)` for the Shift+C path. **Needs user confirmation** (changes how SC4 is demonstrated).
2. **Launch orientation twist (Pitfall 5).** Recommend leaving Phase 3 launch untouched and teaching the roll; alternatively add the Oolite 90° twist and update `tests/sim/launch.test.ts:112` + launch camera. User decision.
3. **Oolite y-guard bug (DockEntity.m:752).** Recommend symmetric fix with a recorded deviation. User may prefer bug-for-bug.
4. **Station roll wording in CONTEXT** ("0.08 rad/s") should be corrected to 0.1256637 rad/s to avoid mis-tuned tests.
5. **Save clock semantics (A8)** and whether manual/computer docking should also autosave (DOCK-07 says launch only).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Docker | All tests (AGENTS.md non-negotiable) | ✓ | 29.8.2 | — |
| Docker Compose | `docker compose run --rm test/e2e/verify/assets` | ✓ | 5.6.0 | — |
| Host Node/npm | Not authoritative (do not use for evidence) | not probed | — | Containers |
| Playwright browsers | e2e (IndexedDB reload) | baked in the Playwright image per AGENTS.md; not probed from host | — | — |

**Missing dependencies with no fallback:** none identified.

## Validation Architecture

> `workflow.nyquist_validation: true` [VERIFIED: .planning/config.json].

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.5 (node env, `unit` project) + Playwright 1.64.1 (e2e) [VERIFIED: package.json, vitest.config.ts] |
| Config file | `vitest.config.ts`, `playwright.config.ts` |
| Quick run command | `docker compose run --rm test` (scope with `npx vitest run tests/sim/dock-*.test.ts` inside the container) |
| Full suite command | `docker compose run --rm verify` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DOCK-01 | Aperture from emitted JSON equals 103.4123×241.888×250; half-extents 51.706/120.944 for the Cobra; no hand-typed constants | unit + drift | `docker compose run --rm assets npm run assets:check`; `tests/sim/dock-corridor.test.ts` | ❌ Wave 0 |
| DOCK-02 | Port frame follows `stationAngle`; auto-centring pulls a band ship toward origin; replay equal at 60/120/144 Hz | unit (property) | `tests/sim/dock-corridor.test.ts`, `tests/sim/dock-cadence.test.ts` | ❌ Wave 0 |
| DOCK-03 | Off-axis/rolled ship bounces; impulse reflects about face normal; orientation unchanged; straddle bounces | unit | `tests/sim/dock-hull.test.ts` | ❌ Wave 0 |
| DOCK-04 | Capture exactly when `0.9·max.z + 0.1·min.z < 0`; docked pose = `dockMouthPosition`; mode `docked` same tick | unit | `tests/sim/dock-capture.test.ts` | ❌ Wave 0 |
| DOCK-05 | Shift+C chord gating; aegis gate; +1200 s; purchase maths in decicredits; TL refusal | unit | `tests/input/bindings.test.ts` (extend), `tests/sim/dock-computer.test.ts`, `tests/sim/player-profile.test.ts` | ❌ Wave 0 |
| DOCK-06 | No trap state: fuzzed approach poses always end `inFlight` or `docked`; probe exposes shake/flash/message | unit (fast-check, existing dep) + e2e | `tests/sim/dock-no-trap.test.ts`, `tests/e2e/docking.spec.ts` | ❌ Wave 0 |
| DOCK-07 | `parseSave` accept/reject table; autosave on `launched`; Continue restores docked clock; real IDB reload | unit + e2e | `tests/persistence/save.test.ts`, `tests/e2e/autosave.spec.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** the new unit file(s) for the touched module in the container.
- **Per wave merge:** `docker compose run --rm test` + `docker compose run --rm typecheck` + `docker compose run --rm lint`.
- **Phase gate:** `docker compose run --rm verify` green before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `tests/sim/dock-*.test.ts`, `tests/sim/player-profile.test.ts`, `tests/persistence/save.test.ts`, `tests/e2e/docking.spec.ts`, `tests/e2e/autosave.spec.ts`
- [ ] Shared fixture: Lave layout via `tests/helpers/lave.ts` (exists) + a helper that constructs a ship pose in the **port frame** (so tests state "nose 5 m past plane, rolled 90°" rather than world coordinates)
- [ ] Generated-data golden for `dock-port.json` (pattern: `tests/golden/content/ship-bounds.json`)
- [ ] Extend `?test=1` hook: `setOrientation`, `setStationAngle`, `grantEquipment`, `setCredits` (mutate live state only — existing rule, probe.ts:16-17) and probe field `probe.dock`
- [ ] Guard tests that must stay green: `tests/guards/sim-purity.test.ts` (no Three/DOM in `src/sim/`), `tests/guards/content-boundary.test.ts` (no generated-content import in sim)

**e2e probes (no pixels):** `probe.dock.outcome`, `probe.dock.shake > 0` / `flash > 0` right after a bounce and `== 0` after 0.6 s of `flightTime`, `probe.hud.message` text, `probe.mode`, `probe.clock` delta = 1200 for the computer dock, `probe.position`/`probe.orientation` unchanged in orientation after bounce.

## Security Domain

> `security_enforcement` enabled, ASVS level 1, block on high [VERIFIED: .planning/config.json].

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | single-player, no accounts |
| V3 Session Management | no | — |
| V4 Access Control | partial | `?test=1` hook is the only privileged surface; keep it mutating live state only, never saves/arbitrary code (probe.ts:16-17) |
| V5 Input Validation | **yes** | zod strict validation of the IndexedDB blob and `dock-port.json`; `textContent` only in DOM (Pitfall 16); allow-listed action ids |
| V6 Cryptography | no | no secrets; do not invent save "signing" (non-goal) |
| V8 Data Protection | yes (light) | no timestamps/host data in the save; no PII |
| V12 Files/Resources | partial | IDB quota/availability failures caught, never fatal |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Tampered/corrupt save poisons state (NaN clock, negative/huge credits, unknown equipment) | Tampering | `parseSave`: strict schema, finite/integer/range checks, allow-listed equipment keys; reject → no save |
| Future-version save overwritten by older build | Tampering/Repudiation | `version > 1` ⇒ do not write/clear; surface as no-Continue |
| XSS via equipment/system names rendered in docked panel | Elevation | `textContent` only; names come from the catalogue, not the save |
| Prototype pollution via `JSON.parse` of save | Tampering | zod strict object (no passthrough); `Object.create(null)` pattern from settings/schema.ts:97 if building maps |
| `?test=1` hook abused to mutate credits/equipment in production | Elevation | Hook exists only with the query param and mutates live state only — no persistence from the hook (a granted credit must not be written unless the player launches normally; document as test-only) |
| Infinite loop in aperture expansion from zero/NaN geometry | DoS | assert `width > 0 && height > 0 && finite` in `DockGeometry` construction (`assertFinite` pattern, layout.ts:92-104) |
| Save write failure blocks the frame loop | DoS | fire-and-forget Promise with caught rejection |

## Sources

### Primary (HIGH confidence)
- `/home/opencode/git/oolite/src/Core/Entities/DockEntity.m` lines 604-774 (corridor), 804-826 (launch twist), 1039-1058 (port dimensions) — Read this session.
- `/home/opencode/git/oolite/src/Core/Entities/StationEntity.m:703-716` (station delegates to each dock subentity).
- `/home/opencode/git/oolite/src/Core/Entities/PlayerEntity.m:5701-5745` (scrape damage = shields/sound only) and `ShipEntity.m` ~11060-11135 (generic collision exchange).
- `/home/opencode/git/oolite/Resources/Config/shipdata.plist:1758-1761, 4752-4773` (dock subentity, dock model).
- `/home/opencode/git/oolite/Resources/Scripts/oolite-conditions.js:70-95` (TL purchase gate); `third_party/oolite/Config/equipment.plist:90-96` (`9, 15000, "Docking Computers", "EQ_DOCK_COMP"`).
- `/home/opencode/git/wegolite/third_party/oolite/Models/oolite_coriolis_dock.dat`, `oolite_coriolis.dat`, `oolite_cobra3.dat` (vertex bounds computed this session).
- Repo files read this session: src/sim/world/layout.ts, src/sim/flight/{state,step,launch,speed}.ts, src/sim/{commands,events,loop}.ts, src/sim/world/aegis.ts, src/app/{game-session,mode,hints,probe,boot,hud-model}.ts, src/ui/{docked,title}.ts, src/input/{actions,keyboard}.ts, src/settings/store.ts, src/content/ships.ts, src/render/bodies/station.ts, src/render/hud/messages.ts, tools/oolite-ingest/{generate.ts,convert/dat.ts}, tests/golden/content/ship-bounds.json, tests/sim/layout.test.ts, tests/e2e/launch.spec.ts, index.html, package.json, vitest.config.ts, tsconfig.sim.json, .planning/config.json.
- `gsd-tools query package-legitimacy check` output for `fake-indexeddb`, `idb`.

### Secondary (MEDIUM confidence)
- `.planning/phases/04-manual-docking/04-CONTEXT.md`, `.planning/REQUIREMENTS.md` (DOCK-01..07), `.planning/ROADMAP.md` §Phase 4.

### Tertiary (LOW confidence)
- Tuning constants (restitution, damping, shake/flash amplitude, roll tolerance) — `[ASSUMED]`, see Assumptions Log.

## Project Constraints (from AGENTS.md)

- Everything runs in Docker; a host test run is not evidence. Commands: `docker compose run --rm test | e2e | verify | lint | typecheck | assets`.
- No `npm install` on the host; dependency changes require image rebuild + `docker compose down --volumes` (none planned).
- `src/sim/` is pure TypeScript — no Three.js, no DOM; deterministic 1/120 s fixed timestep; content data is compiled from Oolite configs at build time, never hand-edited.
- No database; IndexedDB only for saves; no server storage.
- GPL-2.0-or-later code; Oolite-derived data stays CC BY-NC-SA 3.0 — the new `dock-port.json` is derived from vendored `.dat`; record provenance in `NOTICE`/`ASSETS.md` (generated data derived from the pinned snapshot).
- Record significant decisions (aperture-from-`.dat`, y-guard deviation, save schema v1) in `.planning/PROJECT.md` Key Decisions.
- Use codebase-memory MCP and `rg` over `grep` when exploring; include Oolite reference path `/home/opencode/git/oolite` in subagent prompts.
- Start file-changing work through a GSD command (this phase: `/gsd-execute-phase`).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; legitimacy gate run on the only candidates.
- Oolite algorithm and aperture numbers: HIGH — source and mesh read this session.
- Architecture (hull/bounce/feedback/persistence): MEDIUM — new design over verified seams; tuning constants assumed.
- Pitfalls: HIGH for items 1, 2, 5, 6, 10; MEDIUM for 7, 8, 9.

**Research date:** 2026-11-04
**Valid until:** 2026-12-04 (stable; re-check only if the Oolite snapshot pin or `layout.ts` changes)

### Plans to Review

#### .planning/phases/04-manual-docking/04-01-PLAN.md

---
phase: 04-manual-docking
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/content/schemas/dock-port.ts
  - src/content/dock-port.ts
  - src/content/dock-port.test.ts
  - src/content/generated/dock-port.json
  - src/content/generated/manifest.json
  - tools/oolite-ingest/convert/dock-port.ts
  - tools/oolite-ingest/convert/dock-port.test.ts
  - tools/oolite-ingest/generate.ts
  - tests/golden/content/dock-port.json
  - NOTICE
autonomous: true
requirements: [DOCK-01]
estimate:
  tokens: 70000
  raw_tokens: 35000
  tasks: 2
  confidence: low
must_haves:
  truths:
    - "The docking aperture (103.4123 x 241.888 x 250) is measured at build time from third_party/oolite/Models/oolite_coriolis_dock.dat, not typed into src/sim."
    - "Hull half-extents and Cobra bbox are emitted in the Wegolite frame (Z negated) by the same emitter."
    - "assets:check fails if the emitted dock-port.json drifts from the vendored .dat."
    - "A zero, negative, NaN or missing aperture is rejected by the schema (no infinite expansion loop downstream)."
  artifacts:
    - { path: "tools/oolite-ingest/convert/dock-port.ts", provides: "pure emitter" }
    - { path: "src/content/generated/dock-port.json", provides: "generated aperture/hull/ship numbers" }
    - { path: "src/content/schemas/dock-port.ts", provides: "zod DockPortSchema shared by emitter and loader" }
    - { path: "src/content/dock-port.ts", provides: "typed loadDockPort()" }
    - { path: "tests/golden/content/dock-port.json", provides: "golden for the measured values" }
  key_links:
    - "generate.ts emitted[] -> manifest hash -> drift check (assets:check)"
    - "src/content/dock-port.ts -> (app, plan 04-02) -> DockGeometry plain numbers -> src/sim/dock"
  prohibitions:
    - "Do not import src/content/generated/* from src/sim/."
    - "Do not hand-edit src/content/generated/dock-port.json; regenerate with the assets service."
    - "Do not derive the aperture from the hull box or by inspecting the GLB at runtime."
---

<objective>
As a player, I want the docking opening the sim tests against to be exactly the visible Coriolis slot, so that what I line up with is what lets me dock (DOCK-01).

Purpose: the corridor contract (D-01, costly) rests on measured numbers, never typed literals.
Output: build-time emitter, generated `dock-port.json`, zod schema, typed loader, golden + drift coverage.
</objective>

<execution_context>
@/home/opencode/.config/opencode/gsd-core/workflows/execute-plan.md
@/home/opencode/.config/opencode/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/phases/04-manual-docking/04-CONTEXT.md
@.planning/phases/04-manual-docking/04-RESEARCH.md
</context>

<read_first>
- .planning/phases/04-manual-docking/04-RESEARCH.md (sections "Aperture Measurement", Pitfall 6, Pitfall 11)
- tools/oolite-ingest/generate.ts (generateContent, readModels, emitted[])
- tools/oolite-ingest/convert/dat.ts (boundingBox, assertBounds, MODEL_BOUNDS)
- tools/oolite-ingest/convert/equipment.ts (emitter + safeParse pattern)
- src/content/ships.ts (lazy ?raw loader), tests/golden/content/ship-bounds.json
- Oolite reference checkout: /home/opencode/git/oolite/src/Core/Entities/DockEntity.m:1039-1058
</read_first>

<assumptions_flagged>
- DOCK-01 unclassified (no spec): edge probe not resolved; treated as "aperture must equal the dock-mesh bbox, symmetric about the port origin (Pitfall 6)".
- Hull z-range in the Wegolite frame is [-495.918, 500] (Oolite [-500, 495.918] mirrored); taken from the emitted measurement, never typed.
- Reversibility: aperture semantics = costly (D-01, already settled by user in CONTEXT). No one-way decision, so no checkpoint:decision.
</assumptions_flagged>

<tasks>

<task type="tracer" reversibility="costly">
  <name>Task 1 (tracer): dock aperture end-to-end — .dat to emitted JSON to typed loader</name>
  <files>src/content/schemas/dock-port.ts, tools/oolite-ingest/convert/dock-port.ts, tools/oolite-ingest/generate.ts, src/content/generated/dock-port.json, src/content/generated/manifest.json, src/content/dock-port.ts, src/content/dock-port.test.ts</files>
  <action>
  Per D-01. Create zod `DockPortSchema` (strict object: `version: 1`, `source` string, `port: {width, height, depth}`; each dimension finite and > 0). Create pure `emitDockPort(meshes)` in tools/oolite-ingest/convert/dock-port.ts that calls the existing `boundingBox` on the parsed `oolite_coriolis_dock.dat` mesh and sets width/height/depth to max-min per axis (Oolite DockEntity.m:1044-1045: dimensions are bbox extents; do NOT centre the aperture on the bbox, Pitfall 6). Validate through `DockPortSchema.safeParse` and throw `contentError("SCHEMA", ...)` on failure exactly like emitEquipment. Return `{path: "dock-port.json", bytes}` as canonical JSON. Register it in the `emitted` array in generateContent (generate.ts) using the meshes `readModels` already returns. Regenerate with `docker compose run --rm assets` (never hand-edit). Create `src/content/dock-port.ts` with cached lazy `?raw` import like ships.ts, `loadDockPort()` that parses JSON as unknown and validates with the schema, throwing a named error when the file is missing or invalid. Test (src/content/dock-port.test.ts, read file with readFileSync as tests/helpers/lave.ts does): width 103.4123, height 241.888, depth 250 (toBeCloseTo 4), and schema rejects 0, -1, NaN, Infinity, missing fields, extra keys.
  </action>
  <verify>
    <automated>docker compose run --rm assets npm run assets:check && docker compose run --rm test npx vitest run src/content/dock-port.test.ts</automated>
    <fails_when>assets:check exits non-zero with a drift/manifest mismatch, or vitest reports a failed dock-port schema/aperture assertion.</fails_when>
  </verify>
  <acceptance_criteria>
  - `src/content/generated/dock-port.json` exists and is listed in `src/content/generated/manifest.json`.
  - `rg -n "103.4123|241.888" src/sim` returns no match (no typed constants in sim).
  - Loader test passes with the three measured numbers; invalid inputs throw.
  </acceptance_criteria>
  <done>The aperture flows from the vendored .dat through generation and the typed loader, drift-checked.</done>
</task>

<task type="auto" reversibility="costly">
  <name>Task 2: expand — hull + Cobra bbox in the Wegolite frame, golden, provenance</name>
  <files>src/content/schemas/dock-port.ts, tools/oolite-ingest/convert/dock-port.ts, tools/oolite-ingest/convert/dock-port.test.ts, src/content/generated/dock-port.json, src/content/generated/manifest.json, tests/golden/content/dock-port.json, NOTICE</files>
  <action>
  Extend the schema with `hull: {halfX, halfY, zMin, zMax}` and `ship: {min: [x,y,z], max: [x,y,z]}`, all finite, halfX/halfY > 0, zMin < zMax. Emitter: hull from `boundingBox` of `oolite_coriolis.dat` (halfX=max(|min.x|,|max.x|), halfY likewise); convert Z to the Wegolite frame by negation and swap (zMin = -oolite.max.z, zMax = -oolite.min.z; mirror glb.ts:19). Ship from `oolite_cobra3.dat` bbox with the same Z negation (expected min z -43.4655, max z 37.9071, matching tests/golden/content/ship-bounds.json `converted`). The port block stays in Oolite dimension terms (extents are sign-free). Regenerate with the assets service. Create tests/golden/content/dock-port.json pinning port/hull/ship to 4 decimals and a unit test in convert/dock-port.test.ts that (a) compares the emitter output with the golden, (b) proves a mesh with zero-width dock bbox throws SCHEMA, (c) proves output bytes are identical across two runs (determinism). Add a NOTICE line recording that dock-port.json is derived from the pinned CC BY-NC-SA 3.0 Oolite snapshot (consistent with existing generated-data provenance entries).
  </action>
  <verify>
    <automated>docker compose run --rm assets npm run assets:check && docker compose run --rm test npx vitest run tools/oolite-ingest/convert/dock-port.test.ts src/content/dock-port.test.ts tests/guards/content-boundary.test.ts</automated>
    <fails_when>Any listed vitest file fails, the content-boundary guard flags a generated import from src/sim, or assets:check reports drift.</fails_when>
  </verify>
  <acceptance_criteria>
  - Golden cobra min z = -43.4655 and max z = 37.9071 (±1e-4); hull zMin ≈ -495.918, zMax = 500.
  - NOTICE mentions dock-port.json provenance.
  </acceptance_criteria>
  <done>Hull and ship numbers are emitted, golden-pinned and provenance-recorded.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| vendored .dat -> emitter | build input, licence-audited, checksum-pinned |
| generated JSON -> runtime loader | shipped static asset parsed by the app |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-04-01 | Tampering | dock-port.json drift | medium | mitigate | emitted[] registration + manifest hash + `assets:check`; golden test |
| T-04-02 | Denial of service | zero/NaN aperture hanging the x1.25 expansion loop in plan 04-02 | high | mitigate | zod schema requires finite > 0 for every dimension; tests for 0, -1, NaN, Infinity |
| T-04-03 | Tampering | untrusted save data (IndexedDB) | high | accept | not touched here; owned by plan 04-05 (strict zod parseSave) |
| T-04-04 | Elevation | Shift+C / keyboard input | low | accept | not touched here; owned by plan 04-04 |
| T-04-05 | Denial of service | resource exhaustion / malformed save | medium | accept | no runtime allocation in this plan; save DoS owned by 04-05 |
| T-04-SC | Tampering | npm/pip/cargo installs | high | mitigate | no packages added (verified: package.json untouched); idb/fake-indexeddb rejected as SUS |
</threat_model>

<verification>
`docker compose run --rm assets npm run assets:check` and the scoped vitest runs above are green; `docker compose run --rm typecheck` and `lint` green.
</verification>

<success_criteria>Aperture, hull and ship bbox come only from generated, drift-checked data; invalid geometry is unrepresentable.</success_criteria>

<output>
Create `.planning/phases/04-manual-docking/04-01-SUMMARY.md` when done
</output>

## Artifacts this phase produces (this plan)
dock-port emitter, generated JSON, schema, loader, golden, NOTICE entry.

## Quality gate self-check
- [x] DOCK-01 covered (D-01 cited) - [x] tracer first - [x] every verify has fails_when - [x] threat model incl. save/input/resource/DoS - [x] no deferred ideas - [x] Edge: DOCK-01 flagged assumption

#### .planning/phases/04-manual-docking/04-02-PLAN.md

---
phase: 04-manual-docking
plan: 02
type: execute
wave: 2
depends_on: ["04-01"]
files_modified:
  - src/sim/dock/geometry.ts
  - src/sim/dock/port-frame.ts
  - src/sim/dock/corridor.ts
  - src/sim/dock/step.ts
  - src/sim/flight/step.ts
  - src/sim/flight/state.ts
  - src/sim/flight/launch.ts
  - src/sim/events.ts
  - src/app/mode.ts
  - src/app/game-session.ts
  - src/app/probe.ts
  - tests/helpers/dock-pose.ts
  - tests/sim/dock-corridor.test.ts
  - tests/sim/dock-capture.test.ts
  - tests/sim/dock-cadence.test.ts
  - tests/e2e/docking.spec.ts
autonomous: true
requirements: [DOCK-01, DOCK-02, DOCK-04]
estimate:
  tokens: 120000
  raw_tokens: 60000
  tasks: 3
  confidence: low
must_haves:
  truths:
    - "A Cobra rolled to match the slot and centred on the opening, flown in, enters docked mode the tick 0.90*max.z+0.10*min.z < 0, with the docked pose equal to the dock-mouth pose."
    - "The corridor is the port-frame bounding box of the ship against the measured aperture, not a trigger sphere; it follows stationAngle (tested at 0, pi/4, pi/2, pi)."
    - "Inside the 1.5x safety band with the nose past the plane, the ship is shifted toward the port centre each fixed tick; roll tolerance comes only from the bbox."
    - "Speed never gates docking (D-04)."
    - "Replay is hash-identical when the same ticks are sampled at 60/120/144 Hz."
    - "Launch (including skipLaunch) never triggers a dock/straddle on the first inFlight ticks."
  artifacts:
    - { path: "src/sim/dock/corridor.ts", provides: "classifyCorridor + apertureHalfExtents" }
    - { path: "src/sim/dock/step.ts", provides: "stepDocking" }
    - { path: "tests/helpers/dock-pose.ts", provides: "port-frame pose builder" }
  key_links:
    - "stepFlight -> stepDocking after station-angle update (post-increment angle)"
    - "src/content/dock-port.ts -> game-session -> DockGeometry argument of stepFlight"
    - "SimEvent docked -> handleEvent -> docked panel show"
  prohibitions:
    - "No trigger sphere or distance check for capture."
    - "No hard-coded 0.08 roll rate; use layout.stationRollRadPerSec."
    - "No epsilon in capture/lane comparisons (strict Oolite inequalities)."
    - "src/sim must not import generated content, Three.js or DOM."
    - "Phase 3 beginLaunch orientation is not changed (tests/sim/launch.test.ts:112 pins it)."
---

<objective>
As a player, I want to roll my Cobra to the slot, fly through the visible opening and have the game dock me cleanly even though the station spins, so that manual docking works (DOCK-01, DOCK-02, DOCK-04).

Purpose: pure deterministic corridor/capture in `src/sim/dock/`, wired to the app.
Output: port frame, classifier, `stepDocking`, `docked` event, app handling, tests incl. e2e.
</objective>

<execution_context>
@/home/opencode/.config/opencode/gsd-core/workflows/execute-plan.md
@/home/opencode/.config/opencode/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/phases/04-manual-docking/04-CONTEXT.md
@.planning/phases/04-manual-docking/04-RESEARCH.md
</context>

<read_first>
- 04-RESEARCH.md: "Oolite Corridor Algorithm", Patterns 1-2, Pitfalls 1-4, 6, 7, Code Examples
- /home/opencode/git/oolite/src/Core/Entities/DockEntity.m:604-774 (read directly; do not fetch over network)
- src/sim/flight/step.ts, state.ts, launch.ts; src/sim/math.ts; src/sim/world/layout.ts
- src/render/bodies/station.ts:201-214 (renderer roll quaternion); tests/helpers/lave.ts; tests/sim/launch.test.ts; tests/sim/flight-cadence.test.ts
- src/app/game-session.ts (handleEvent, frame, start), src/app/mode.ts, src/app/probe.ts, tests/e2e/launch.spec.ts
</read_first>

<assumptions_flagged>
- DOCK-02 boundary probe, answered: lane membership is strict (`max.x < ww && min.x > -ww`, same for y) so exactly ±ww/±hh is NOT in lane; safety band is strict at ±1.5*ww/hh; nose-inside gate is `min.z < 0` strict, so `min.z == 0` produces no correction and no capture; capture is strict `< 0` so `0.9*max.z+0.1*min.z == 0` does NOT dock; past-end reject `max.z < -dd`. One step either side of each is a unit test.
- DOCK-02 precision probe, answered: everything is computed from relative vectors (corner minus port origin), float64, no epsilon; test fixtures may build boundary poses with 1e-9 tolerance only. Non-finite bbox values => outcome `outside`, state untouched, never NaN written to state. Correction denominator `max.z - min.z <= 0` => no correction.
- DOCK-01 and DOCK-04 unclassified. Reversibility: capture timing/auto-centre strength = costly (D-03, user-settled); no one-way decisions, no checkpoint:decision.
- Decision: auto-centre delta is applied per fixed 1/120 s tick exactly as ported (not scaled by dt); fixed step makes it deterministic and Oolite's own call is frame-rate dependent.
- Decision (Oolite `STATUS_LAUNCHING` shortcut equivalent): a new `FlightState.dockArmed` flag is false after beginLaunch and becomes true once the ship's port-frame `min.z >= 0` (tail clear of the plane); while false stepDocking does nothing. Needed because skipLaunch leaves the wing-across ship at the mouth, which would otherwise register a straddle on tick one.
- Accepted deviation (orchestrator-resolved): Phase 3 launch leaves wings across the tall slot; the player must roll ~90 deg to re-dock; taught by message in plan 04-03.
- y-guard: ported symmetrically (`if (max.y < hh && min.y > -hh) delta.y = 0`), deviating from DockEntity.m:752 (`max.y > hh`). Add a code comment and a PROJECT.md Key Decisions row (done in this plan, Task 2).
</assumptions_flagged>

<tasks>

<task type="tracer" reversibility="costly">
  <name>Task 1 (tracer): aligned approach docks end-to-end in the sim (lane + capture only)</name>
  <files>src/sim/dock/geometry.ts, src/sim/dock/port-frame.ts, src/sim/dock/corridor.ts, src/sim/dock/step.ts, src/sim/flight/step.ts, src/sim/flight/state.ts, src/sim/flight/launch.ts, src/sim/events.ts, tests/helpers/dock-pose.ts, tests/sim/dock-capture.test.ts</files>
  <action>
  Per D-01, D-03 (capture), D-04. geometry.ts: `DockGeometry {port:{width,height,depth}, hull:{halfX,halfY,zMin,zMax}, ship:{min:Vec3,max:Vec3}}` and `createDockGeometry(raw)` that throws a named `DockGeometryError` unless every number is finite, port dims and hull halves > 0, so the expansion loop terminates. port-frame.ts: `portFrame(layout, stationAngle)` returning origin, i, j, k using q = mul(layout.stationBaseQuat, axisAngle(0,0,1,stationAngle)), i=rotate(q,(1,0,0)), j=rotate(q,(0,1,0)), k=rotate(q,(0,0,-1)) outward, origin = station.position + k*layout.dockOffset; a test asserts origin equals dockMouthPosition(layout) at stationAngle 0 (and at any angle, since the roll axis passes through it). corridor.ts: `apertureHalfExtents(port, shipLocalExtents)` implementing DockEntity.m:632-654 (rotatedPort = width<height, rotatedShip = shipWidth<shipHeight, ×1.25 loops against 0.90, then ×0.5), `shipPortBox(frame, geometry, orientation, position)` = min/max of the 8 rotated Cobra AABB corners, relative to origin, projected on i/j/k, and `classifyCorridor` returning outside | lane | band | straddle with `capture:boolean`, `deltaX`, `deltaY` per DockEntity.m:660-773 (this task implements lane and capture; band/straddle fields exist in the type and are filled in Task 2). step.ts: `stepDocking(state, layout, geometry): SimEvent[]` runs only when `state.mode === "inFlight"` and `dockArmed`; on capture set mode "docked", speed 0, rollRate 0, pitchRate 0, position = dockMouthPosition(layout), orientation = layout.stationBaseQuat, push `{kind:"docked", via:"manual"}`, increment `dockCount`; clock is NOT advanced. state.ts: add `dockArmed` (init true), `dockCount` (init 0), append `dockArmed=` and `dockCount=` lines at the END of serializeFlight. launch.ts beginLaunch sets `dockArmed = false`. stepDocking arms when box.min.z >= 0. events.ts: add `{kind:"docked"; via:"manual"|"computer"}`. stepFlight gains a trailing optional parameter `dock?: DockGeometry`; when given and the tick did not launch, call stepDocking AFTER the station-angle/flightTime/clock update (post-increment angle). tests/helpers/dock-pose.ts: `placeShipInPortFrame(fixture, {stationAngle, x, y, noseZ, rollAboutK})` returning a FlightState inFlight whose Cobra port-frame bbox has min/max as requested (rotate Cobra so wings run along the slot's long axis for the aligned case). dock-capture.test.ts: aligned centred ship at 40 m/s ends docked with exactly one `docked` event, pose == dockMouthPosition/stationBaseQuat, clockSeconds delta equals only the elapsed ticks; capture at speed 350 also docks (D-04); strict boundary: a pose with 0.9*max.z+0.1*min.z exactly 0 (built from relative numbers) does not dock and one tick later does.
  </action>
  <verify>
    <automated>docker compose run --rm test npx vitest run tests/sim/dock-capture.test.ts tests/sim/launch.test.ts tests/sim/flight-cadence.test.ts tests/guards/sim-purity.test.ts tests/guards/content-boundary.test.ts</automated>
    <fails_when>dock-capture does not reach mode "docked", launch/cadence tests regress, or a guard reports a forbidden import in src/sim.</fails_when>
  </verify>
  <acceptance_criteria>
  - `rg -n "0\.08" src/sim/dock` returns nothing.
  - Launch -> skipLaunch -> 5 s of idle flight ends inFlight with dockCount 0 (test).
  - tests/sim/launch.test.ts still passes unmodified.
  </acceptance_criteria>
  <done>A correctly rolled, centred approach docks cleanly in the sim; launch cannot self-dock.</done>
</task>

<task type="auto" tdd="true" reversibility="costly">
  <name>Task 2: expand — safety band auto-centring, straddle classification, boundary and roll tests</name>
  <files>src/sim/dock/corridor.ts, src/sim/dock/step.ts, tests/sim/dock-corridor.test.ts, tests/sim/dock-cadence.test.ts, .planning/PROJECT.md</files>
  <behavior>
  - Exact lane edges: min.x == -ww or max.x == ww is not lane; one epsilon-step inside is lane (same for y).
  - Band edge: min.x == -1.5*ww is outside band; just inside is band.
  - min.z == 0 in band: no correction; min.z = -1e-9: correction with factor ~0.
  - Straddle (min.x < -ww and max.x > ww, or y equivalent) classified straddle; no state change in this plan beyond classification.
  - Band ship offset +x is shifted toward centre by 0.5*(max.x+min.x)*factor along -i each tick; x untouched if inside lane x; y guard symmetric.
  - Non-finite orientation/position input => outside, state not mutated.
  - Corridor identical at stationAngle 0, pi/4, pi/2, pi for a ship placed by port-frame pose; ship rolled 35 deg about k still fits, 60 deg does not (computed exactly, replacing the research's approximate A1).
  - 60/120/144 Hz sampling of the same tick sequence yields equal hashFlight.
  </behavior>
  <action>
  Per D-02, D-03, D-05 (classification only). Implement band branch of classifyCorridor per DockEntity.m:724-773 with the symmetric y-guard (comment cites DockEntity.m:752 and the deviation) and correction factor `-min.z/(max.z-min.z)` guarded for non-positive denominator. In stepDocking apply the band delta to position as `pos -= deltaY*j + deltaX*i` each tick (no velocity change) and push one `{kind:"scrape"}` event per correcting tick (add the `scrape` kind to events.ts here; response/feedback is plan 04-03). Straddle outcome: stepDocking performs no state change in this plan (plan 04-03 adds the bounce response). Add the PROJECT.md Key Decisions rows: aperture measured at build from .dat; y-guard symmetric deviation; launch twist not applied; fixed-tick per-tick delta. Write the tests listed in behavior using placeShipInPortFrame; cadence test mirrors tests/sim/flight-cadence.test.ts.
  </action>
  <verify>
    <automated>docker compose run --rm test npx vitest run tests/sim/dock-corridor.test.ts tests/sim/dock-cadence.test.ts tests/sim/dock-capture.test.ts</automated>
    <fails_when>Any boundary, roll-tolerance, finite-guard or cadence-equality assertion fails.</fails_when>
  </verify>
  <acceptance_criteria>
  - Each boundary has tests one step either side.
  - PROJECT.md contains the four new Key Decisions rows.
  - hashFlight equal across 60/120/144 Hz runs.
  </acceptance_criteria>
  <done>Auto-centring and corridor semantics are pinned by boundary tests and follow the rolling station.</done>
</task>

<task type="auto" reversibility="reversible">
  <name>Task 3: wire app — geometry injection, docked event handling, test-hook seams, e2e</name>
  <files>src/app/mode.ts, src/app/game-session.ts, src/app/probe.ts, tests/e2e/docking.spec.ts</files>
  <action>
  Load `loadDockPort()` in session start, build `DockGeometry` via createDockGeometry and pass it as the trailing arg of each stepFlight call in `frame`. Extend `ModeTransition` with `"dock"` and rewrite `advanceMode` with explicit cases (it currently assumes any non-launch transition is launchComplete). In `handleEvent` case "docked": call `docked.show(system.name)`, hide HUD canvas via existing mode derivation, `input.clearAll()`, reset launch presentation, and sync currentPose/previousPose to the docked pose to avoid interpolation smear (Pitfall 4). Never mutate `state.mode` from the app. Extend the `?test=1` hook (live state only, no persistence) with `setOrientation(w,x,y,z)` and `setStationAngle(rad)`; add additive probe field `dock?: {dockCount:number; outcome:string}`. e2e docking.spec.ts: boot via `#title-start`, launch, use the hook to place the ship in front of the slot rolled to match and with forward speed, wait for probe.mode === "docked", assert docked panel visible, clock unchanged by the dock beyond elapsed flight, zero console errors; assert `window.__wegolite.test` absent without `?test=1` (existing rule).
  </action>
  <verify>
    <automated>docker compose run --rm e2e sh -lc "npm run build && npx playwright test tests/e2e/docking.spec.ts tests/e2e/launch.spec.ts"</automated>
    <fails_when>probe.mode never becomes "docked", the docked panel stays hidden, launch.spec regresses, or any console error is logged.</fails_when>
  </verify>
  <acceptance_criteria>
  - `docker compose run --rm typecheck` and `lint` pass.
  - DOM text still set only via textContent.
  </acceptance_criteria>
  <done>A real browser session docks through the visible opening and shows the docked panel.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| content JSON -> sim | validated plain numbers only |
| ?test=1 hook -> live state | privileged dev seam |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-----------|-----------------|
| T-04-06 | Denial of service | expansion loop with bad aperture | high | mitigate | createDockGeometry throws on non-finite/<=0; unit test |
| T-04-07 | Tampering | NaN/Infinity pose writing NaN into state | high | mitigate | finite guard returns outside without mutation; test |
| T-04-08 | Elevation | ?test=1 hook setOrientation/setStationAngle | medium | mitigate | hook exists only with query param, mutates live state only, never saves; e2e asserts absent without param |
| T-04-09 | Tampering | untrusted save data | high | accept | not touched here; plan 04-05 |
| T-04-10 | Elevation | Shift+C/keyboard input | low | accept | not touched here; plan 04-04 |
| T-04-11 | Denial of service | resource exhaustion per tick | low | mitigate | stepDocking is O(1) (8 corners), no allocation loops; cadence test bounds ticks |
| T-04-SC | Tampering | npm/pip/cargo installs | high | mitigate | no new packages |
</threat_model>

<verification>
Scoped vitest + e2e above, then `docker compose run --rm test`, `typecheck`, `lint`.
</verification>

<success_criteria>Success criteria 1 and 2 of the phase hold in sim and browser.</success_criteria>

<output>
Create `.planning/phases/04-manual-docking/04-02-SUMMARY.md` when done
</output>

## Artifacts this phase produces (this plan)
src/sim/dock/{geometry,port-frame,corridor,step}.ts, dockArmed/dockCount state, `docked` and `scrape` events, dock-pose test helper, docking e2e.

## Quality gate self-check
- [x] D-01..D-05 cited - [x] tracer first - [x] boundary/precision edges lifted - [x] prohibitions in must_haves - [x] fails_when on every verify - [x] threat model complete

#### .planning/phases/04-manual-docking/04-03-PLAN.md

---
phase: 04-manual-docking
plan: 03
type: execute
wave: 3
depends_on: ["04-02"]
files_modified:
  - src/sim/dock/hull.ts
  - src/sim/dock/step.ts
  - src/sim/flight/state.ts
  - src/sim/flight/step.ts
  - src/sim/events.ts
  - src/app/dock-feedback.ts
  - src/app/game-session.ts
  - src/app/hud-model.ts
  - src/app/probe.ts
  - src/render/hud/draw.ts
  - src/render/launch-camera.ts
  - tests/sim/dock-hull.test.ts
  - tests/sim/dock-no-trap.test.ts
  - tests/app/dock-feedback.test.ts
  - tests/e2e/docking.spec.ts
autonomous: true
requirements: [DOCK-03, DOCK-06]
estimate:
  tokens: 130000
  raw_tokens: 65000
  tasks: 3
  confidence: low
must_haves:
  truths:
    - "An off-axis or rolled-wrong approach touches the hull or straddles the slot and bounces: velocity reflected about the contact normal with damping, orientation unchanged, mode stays inFlight on the same tick."
    - "Scrape, bounce, docked and dockDenied facts are sim events; copy, shake and flash live app-side."
    - "Shake lasts 0.35 s, flash 0.4 s, on the sim flightTime clock, deterministic, observable in probe.dock."
    - "Scrape message throttled to >= 1 s of flightTime; no HintController use."
    - "No failure leaves a trap state: fuzzed approaches always end inFlight or docked; a ship placed inside the hull is pushed out in one tick."
  artifacts:
    - { path: "src/sim/dock/hull.ts", provides: "box hull OBB contact + push-out" }
    - { path: "src/app/dock-feedback.ts", provides: "DockFeedback envelopes" }
    - { path: "tests/sim/dock-no-trap.test.ts", provides: "always-recover invariant" }
  key_links:
    - "stepDocking outcome (outside|straddle) -> hull.ts bounce -> FlightState.impulse"
    - "SimEvent scrape/bounce -> handleEvent -> messages + DockFeedback + probe.dock"
  prohibitions:
    - "No hull-integrity or damage stat (D-06)."
    - "No hard stop and no teleport back to an approach point (D-07)."
    - "No Math.random in shake/flash."
    - "Do not use HintController for dock feedback."
    - "Bounce must not change orientation."
    - "No new particle system or sound."
---

<objective>
As a player, when I fly sloppily into the station I get a visible scrape or bounce with a message, shake and red flash, and I can always try again, so that docking has real risk but no trap (DOCK-03, DOCK-06).

Purpose: the physics and feedback of failure.
Output: hull module, impulse state, events, DockFeedback, HUD flash, camera shake, probe, invariant tests.
</objective>

<execution_context>
@/home/opencode/.config/opencode/gsd-core/workflows/execute-plan.md
@/home/opencode/.config/opencode/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/phases/04-manual-docking/04-CONTEXT.md
@.planning/phases/04-manual-docking/04-RESEARCH.md
@.planning/phases/04-manual-docking/04-02-PLAN.md
</context>

<read_first>
- 04-RESEARCH.md Pattern 3, Pattern 4, Pitfalls 8-10
- src/sim/dock/{corridor,step}.ts (from 04-02), src/sim/flight/{speed,state,step}.ts
- src/render/hud/messages.ts, src/render/hud/draw.ts:352-401, src/app/hud-model.ts, src/render/launch-camera.ts:106-118, src/app/game-session.ts handleEvent/renderFrame
- tests/sim/flight-cadence.test.ts (fast-check usage is an existing dependency), tests/e2e/launch.spec.ts
</read_first>

<assumptions_flagged>
- DOCK-03/DOCK-06 unclassified edges: surfaced as follows. Zero-speed brush: impulse floor of 8 m/s outward guarantees separation. Ship centre inside hull: defensive push-out. Ship at speed 350 u/s: 2.9 m/tick vs ~81 m ship cannot tunnel the 1000 m box; the test hook may inject larger speed, so push-out also runs for any inside-corner state regardless of speed.
- Tuning constants (assumed, feel only): restitution e=0.5, speed damping 0.35, impulse decay by implicit-Euler step factor 1/(1+dt/0.6) (deterministic arithmetic, no Math.exp), impulse floor 8 m/s, shake amplitude 0.6 m, shake 0.35 s, flash 0.4 s. All within D-08's 0.3-0.5 s.
- Hull is the box from dock-port.json (halfX/halfY ±500, z[-495.918,500] in station-local Wegolite frame). Corridor outcomes lane/band suppress hull collision for the tick (tunnel interior is not collidable inside the footprint); outcomes outside/straddle are collidable. Suppressed entirely while dockArmed is false.
- All bounce decisions here are reversible (D-07 shape, constants discretionary).
</assumptions_flagged>

<tasks>

<task type="tracer" reversibility="reversible">
  <name>Task 1 (tracer): one off-axis approach bounces and recovers, end-to-end sim to probe</name>
  <files>src/sim/dock/hull.ts, src/sim/dock/step.ts, src/sim/flight/state.ts, src/sim/flight/step.ts, src/sim/events.ts, tests/sim/dock-hull.test.ts, src/app/dock-feedback.ts, src/app/game-session.ts, src/app/probe.ts, tests/app/dock-feedback.test.ts</files>
  <action>
  Per D-05, D-07, D-09. FlightState: add `impulse: Vec3` (init zero), `bounceCount`, `scrapeTicks`, appended at the END of serializeFlight after plan 04-02's lines. hull.ts: `hullContact(frame-independent station quat, stationPos, shipCorners, hull)` transforms the 8 ship corners into station-local coordinates (rotate by the conjugate of mul(stationBaseQuat, axisAngle(0,0,1,stationAngle))), finds corners strictly inside the box, for each takes its least-penetration face, picks the deepest, and returns {normalWorld, depth} where depth is the max penetration of any inside corner along that face normal so one push-out clears all corners; returns null otherwise. step.ts: when classifyCorridor gives `outside` or `straddle` and dockArmed, run hullContact; on contact push position out by depth along normalWorld, then v = forward*speed + impulse; if dot(v,n) < 0 then v' = v - (1+0.5)*dot(v,n)*n; raise outward normal speed to at least 8 if lower; speed = max(0, dot(v',forward))*0.35; impulse = v' - forward*speed; orientation untouched; push `{kind:"bounce", speed:<impact normal speed>, cause:"hull"}`, bounceCount++. For `straddle` (D-05) push position outward along the port outward k by -min.z, apply the same reflection with n=k, cause "straddle". Each inFlight tick (when stepDocking runs, before collision), position += impulse*dt and impulse *= 1/(1+dt/0.6); finite-guard every value, a non-finite impulse is zeroed. Add the `bounce` event kind to events.ts with `cause`. dock-feedback.ts: `createDockFeedback()` with `trigger(kind, flightTime)`, `shakeOffset(flightTime): Vec3` (deterministic sinusoid times linear envelope, amplitude 0.6 m, 0.35 s), `flashAlpha(flightTime)` (0..1 linear decay, 0.4 s), no randomness, restarts envelopes only when idle. game-session handleEvent: enqueue fixed-copy messages through `messages.enqueue` (bounce hull: "Hull contact - pull away and line up with the slot"; straddle: "Too wide for the slot - roll 90 degrees to match the opening"), call DockFeedback.trigger, publish `probe.dock = {outcome, scrapeCount, bounceCount, dockCount, shake, flash, lastMessage}`. Test (dock-hull.test.ts): a ship flying into a hull face at 100 m/s with the wing-across pose bounces once, orientation quaternion equal before/after, mode inFlight, speed finite and >= 0, outward normal velocity >= 8 afterwards; dock-feedback unit test: shake 0 at 0.36 s and flash 0 at 0.41 s, > 0 inside, identical on replay.
  </action>
  <verify>
    <automated>docker compose run --rm test npx vitest run tests/sim/dock-hull.test.ts tests/app/dock-feedback.test.ts tests/sim/dock-capture.test.ts tests/sim/dock-cadence.test.ts tests/guards/sim-purity.test.ts</automated>
    <fails_when>The bounce test shows a changed orientation, a mode other than inFlight, a non-finite value, or envelope values nonzero after expiry; or 04-02 capture/cadence tests regress.</fails_when>
  </verify>
  <acceptance_criteria>
  - `rg -n "Math.random" src/app/dock-feedback.ts src/sim/dock` returns nothing.
  - Cadence hash equality still holds with impulse in the hash.
  </acceptance_criteria>
  <done>One failing approach bounces, recovers the same tick and reports through events and the probe.</done>
</task>

<task type="auto" tdd="true" reversibility="reversible">
  <name>Task 2: expand — no-trap invariant, deep-inside push-out, scrape message throttle</name>
  <files>src/sim/dock/hull.ts, src/sim/dock/step.ts, tests/sim/dock-no-trap.test.ts, tests/sim/dock-hull.test.ts, src/app/game-session.ts</files>
  <behavior>
  - Ship centre placed inside the hull box (also inside the tunnel footprint but misaligned) ends outside the box after one tick, mode inFlight.
  - Property (fast-check): from random poses within 1500 m of the station with random orientation and random bounded intent for up to 2000 ticks, mode is never "launching"/"limbo" and ends inFlight or docked; position always finite.
  - Opposite-edge straddle with speed 0 still separates (impulse floor).
  - Scrape events fire each correcting tick but at most one scrape message per 1.0 s of flightTime reaches the queue.
  - Launch -> immediate skipLaunch does not bounce (dockArmed gate).
  </behavior>
  <action>
  Per D-09. Add the defensive branch: when the ship centre is inside the hull box, choose the face by the centre's least penetration, push so all corners clear (reuse depth maximum), and apply the same impulse path. Implement throttled scrape messaging in handleEvent using `lastScrapeMessageTime` on flightTime (>= 1.0 s). Write the property test with fixed seeds, bounded runs (numRuns 50) so it stays under 60 s.
  </action>
  <verify>
    <automated>docker compose run --rm test npx vitest run tests/sim/dock-no-trap.test.ts tests/sim/dock-hull.test.ts</automated>
    <fails_when>The property test finds a seed that ends in a non-inFlight, non-docked mode or non-finite position, or the inside-hull case remains inside after one tick.</fails_when>
  </verify>
  <acceptance_criteria>
  - Seeds recorded in the test file for replay.
  - Throttle test asserts <= 1 scrape message in 1 s of ticks.
  </acceptance_criteria>
  <done>No approach can wedge the player; message line does not flood.</done>
</task>

<task type="auto" reversibility="reversible">
  <name>Task 3: expand — camera shake, red HUD flash, e2e feedback proof</name>
  <files>src/render/launch-camera.ts, src/app/hud-model.ts, src/render/hud/draw.ts, src/app/game-session.ts, tests/e2e/docking.spec.ts</files>
  <action>
  Per D-08. Add an optional shake offset parameter to computeCockpitCamera (added to the camera position only, default zero, so existing callers/tests are unchanged); game-session passes DockFeedback.shakeOffset(state.flightTime) at the cockpit-pose call. Add `flashAlpha` to the HUD model and draw a red frame (strokeRect/fill with alpha) in drawHud only when > 0; DOM text still via textContent only. e2e: using the hook, place the Cobra wing-across in front of the hull moving forward, assert probe.dock.bounceCount >= 1, probe.dock.shake > 0 and flash > 0 right after, hud message contains the expected copy, then after >= 0.6 s of flightTime shake == 0 and flash == 0, probe.mode === "inFlight", and a second approach attempt can bounce again (retry possible). No screenshots, no pixel reads.
  </action>
  <verify>
    <automated>docker compose run --rm e2e sh -lc "npm run build && npx playwright test tests/e2e/docking.spec.ts tests/e2e/hud.spec.ts"</automated>
    <fails_when>shake or flash stay 0 after a bounce, remain >0 after 0.6 s, the HUD spec regresses, or a console error is logged.</fails_when>
  </verify>
  <acceptance_criteria>
  - `docker compose run --rm typecheck` and `lint` green.
  - Manual-only note retained: feel of shake/flash is judged by a human (VALIDATION Manual-Only).
  </acceptance_criteria>
  <done>All three feedback channels are observable via the probe and expire inside the 0.3-0.5 s window.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| ?test=1 hook -> sim state | can inject extreme speed/pose |
| sim events -> DOM text | fixed app-owned copy only |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-----------|-----------------|
| T-04-12 | Denial of service | NaN/Infinity impulse or extreme injected speed freezing the sim | high | mitigate | finite guard zeroes impulse; push-out runs for any inside-corner state independent of speed; property test |
| T-04-13 | Denial of service | scrape message flood at 120 Hz | medium | mitigate | >= 1 s flightTime throttle + test |
| T-04-14 | Tampering | untrusted save data | high | accept | not touched here; plan 04-05 |
| T-04-15 | Elevation | Shift+C / keyboard input | low | accept | not touched here; plan 04-04 |
| T-04-16 | Denial of service | resource exhaustion in property test / per tick | low | mitigate | O(8 corners) per tick; fuzz bounded numRuns/ticks |
| T-04-17 | Elevation | XSS via event copy | low | mitigate | copy is fixed strings via textContent / canvas text, never from save or event payload |
| T-04-SC | Tampering | npm/pip/cargo installs | high | mitigate | no packages added; fast-check already a dependency |
</threat_model>

<verification>
Scoped runs above then `docker compose run --rm test`, `typecheck`, `lint`.
</verification>

<success_criteria>Phase success criterion 3 holds: failures give visible feedback and always recover.</success_criteria>

<output>
Create `.planning/phases/04-manual-docking/04-03-SUMMARY.md` when done
</output>

## Artifacts this phase produces (this plan)
hull.ts, impulse/bounce/scrape counters, `bounce` event, DockFeedback, HUD flash, camera shake, probe.dock.

## Quality gate self-check
- [x] D-05..D-09 cited - [x] no D-06 damage stat - [x] tracer first - [x] precision/NaN edges lifted - [x] threat model complete

#### .planning/phases/04-manual-docking/04-04-PLAN.md

---
phase: 04-manual-docking
plan: 04
type: execute
wave: 4
depends_on: ["04-03"]
files_modified:
  - src/sim/player/profile.ts
  - src/sim/commands.ts
  - src/sim/events.ts
  - src/sim/dock/computer.ts
  - src/sim/flight/step.ts
  - src/content/equipment.ts
  - src/input/actions.ts
  - src/input/keyboard.ts
  - src/settings/schema.ts
  - src/ui/docked.ts
  - index.html
  - src/app/game-session.ts
  - src/app/probe.ts
  - tests/sim/player-profile.test.ts
  - tests/sim/dock-computer.test.ts
  - tests/input/bindings.test.ts
  - tests/settings/schema.test.ts
  - tests/e2e/docking.spec.ts
  - .planning/PROJECT.md
autonomous: true
requirements: [DOCK-05]
estimate:
  tokens: 110000
  raw_tokens: 55000
  tasks: 3
  confidence: low
must_haves:
  truths:
    - "The docked panel shows 'Docking Computers — 1500.0 Cr (TL 9)'; buying deducts exactly 15000 decicredits and is refused when credits are short or already owned."
    - "A new game has 1000 decicredits (100.0 Cr) so the computer is unaffordable until credits exist."
    - "Shift+C (never plain C) inside stationAegisRange with the computer installed docks on the same tick, adds exactly 1200 s, emits docked{via:'computer'}."
    - "Outside the aegis, or without the computer, Shift+C emits dockDenied, changes no mode and no clock."
  artifacts:
    - { path: "src/sim/player/profile.ts", provides: "PlayerProfile, canPurchase, purchase, formatCredits" }
    - { path: "src/sim/dock/computer.ts", provides: "dockWithComputer" }
    - { path: "src/content/equipment.ts", provides: "typed equipment loader" }
  key_links:
    - "keyboard chord (Shift+KeyC) -> Command dockingComputer{installed} -> stepFlight -> dockWithComputer -> aegisStatus"
    - "docked panel buy button -> profile.purchase -> credits field textContent"
  prohibitions:
    - "No Oolite autopilot fly-in or animation (deferred; D-12 is instant)."
    - "No outfitting screen or market (Phase 5)."
    - "Credits/equipment stay out of FlightState and out of hashFlight."
    - "Do not duplicate the 51200 radius; reuse aegisStatus/layout.stationAegisRange."
---

<objective>
As a player with 1500 Cr and the Docking Computers fitted, I want to press Shift+C near the station and be docked immediately (20 minutes later), so that I can skip a manual approach (DOCK-05).

Purpose: real credits state, a purchasable computer, and instant computer docking.
Output: profile module, equipment loader, command/chord, docked panel line, tests, e2e.
</objective>

<execution_context>
@/home/opencode/.config/opencode/gsd-core/workflows/execute-plan.md
@/home/opencode/.config/opencode/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/phases/04-manual-docking/04-CONTEXT.md
@.planning/phases/04-manual-docking/04-RESEARCH.md
</context>

<read_first>
- 04-RESEARCH.md "Shift+C, Credits and Purchase", Computer dock example
- src/sim/world/aegis.ts (aegisStatus), src/sim/flight/step.ts, src/sim/flight/launch.ts
- src/input/{actions,keyboard}.ts, tests/input/bindings.test.ts, src/settings/schema.ts mergeDefaults, tests/settings/schema.test.ts
- src/ui/docked.ts, index.html #docked panel, src/content/schemas/equipment.ts, src/content/ships.ts, src/content/generated/equipment.json (EQ_DOCK_COMP: 15000 decicredits, TL 9)
</read_first>

<assumptions_flagged>
- Orchestrator resolution (RECORD in PROJECT.md Key Decisions): the docked line shows the TL 9 requirement but `canPurchase` checks ownership + credits ONLY. Oolite compares raw system TL (Lave = 4) to equipment TL and would refuse; a faithful gate would make DOCK-05 unreachable at Lave. Full TL gating is deferred to Phase 5's outfitting screen. This is an explicit Oolite deviation.
- DOCK-05 unclassified edges: credits exactly 15000 -> purchase succeeds leaving 0; 14999 -> refused; already owned -> refused; double click -> second refused. Shift+C while docked/launching -> ignored with no event (mode not inFlight). Aegis boundary is inclusive (<=) as in aegisStatus: exactly at range docks, one unit beyond denies.
- Command carries `installed: boolean` supplied by the app from the profile; the sim guards `!installed` as dockDenied "notInstalled" so a stray command cannot dock. Single-player trust boundary.
- Where Shift is required: a REQUIRES_SHIFT set in the keyboard layer; default binding KeyC; label states "Docking computer (Shift+)". Rebinding stays code-only.
- Reversibility: costly=none; reversible. No one-way decisions.
</assumptions_flagged>

<tasks>

<task type="tracer" reversibility="reversible">
  <name>Task 1 (tracer): Shift+C with the computer fitted docks instantly, sim + keyboard end-to-end</name>
  <files>src/sim/commands.ts, src/sim/events.ts, src/sim/dock/computer.ts, src/sim/flight/step.ts, src/input/actions.ts, src/input/keyboard.ts, src/settings/schema.ts, tests/sim/dock-computer.test.ts, tests/input/bindings.test.ts, tests/settings/schema.test.ts</files>
  <action>
  Per D-11, D-12. commands.ts: add `{kind:"dockingComputer"; installed: boolean}`. events.ts: add `{kind:"dockDenied"; reason:"notInstalled"|"outsideAegis"}`. computer.ts `dockWithComputer(state, layout, installed): SimEvent[]`: if state.mode !== "inFlight" return [] ; if !installed return dockDenied notInstalled; if aegisStatus(position, layout) !== "dockingRange" return dockDenied outsideAegis; else mode "docked", speed 0, rates 0, impulse zero (if present), position = dockMouthPosition(layout), orientation = layout.stationBaseQuat, `clockSeconds += 1200`, dockCount++, dockArmed true, event docked{via:"computer"}. stepFlight handles the command in its switch (before motion; a docked result skips that tick's motion because mode changes). actions.ts: add `dockingComputer` to ActionId, ACTION_IDS, DEFAULT_BINDINGS (["KeyC"]), ACTION_LABELS ("Docking computer (Shift+)"). keyboard.ts: `keyDown(code, repeat?, mods?: {shift:boolean})`, a REQUIRES_SHIFT set containing dockingComputer so without shift the action neither enqueues nor marks the key held; onKeyDown passes event.shiftKey; EDGE_COMMANDS cannot hold `installed`, so the input layer emits `{kind:"dockingComputer", installed:false}` and the session overwrites `installed` from the profile before stepping (document in a comment). settings mergeDefaults supplies the new action for older blobs. Tests: dock-computer.test.ts: inside aegis docks, clock delta exactly 1200 (no elapsed ticks added since same-tick), event once; outside denies with zero clock/mode change; exactly at range docks, 1 unit beyond denies; not installed denies; not inFlight ignored; hash of profile untouched. bindings test: plain C emits nothing, Shift+C emits once, repeat emits nothing, other bindings unaffected; settings test: old blob missing the action merges the default.
  </action>
  <verify>
    <automated>docker compose run --rm test npx vitest run tests/sim/dock-computer.test.ts tests/input/bindings.test.ts tests/settings/schema.test.ts tests/sim/launch.test.ts</automated>
    <fails_when>Any of: dock does not occur inside aegis, clock delta != 1200, plain C enqueues a command, an older settings blob fails to merge, or launch tests regress.</fails_when>
  </verify>
  <acceptance_criteria>
  - `rg -n "51_?200" src/sim/dock src/input` returns nothing (no duplicated radius).
  - Existing action-count assertions updated and passing.
  </acceptance_criteria>
  <done>Shift+C with the computer fitted docks in the sim with exactly +20 minutes.</done>
</task>

<task type="auto" tdd="true" reversibility="reversible">
  <name>Task 2: expand — credits, equipment catalogue, purchase rule</name>
  <files>src/sim/player/profile.ts, src/content/equipment.ts, tests/sim/player-profile.test.ts, .planning/PROJECT.md</files>
  <behavior>
  - newProfile() = {credits:1000, equipment:[]}.
  - canPurchase: false when owned, false when credits < price, true at credits === price; no TL input parameter (deviation).
  - purchase returns a new profile with credits reduced by exactly 15000 and the key appended once; invalid input returns the same profile unchanged (no throw, no negative credits).
  - formatCredits(15000) === "1500.0 Cr"; formatCredits(1000) === "100.0 Cr".
  - credits stay safe non-negative integers; a non-integer/NaN grant is rejected.
  - loadEquipment() validates with the existing EquipmentSchema and exposes EQ_DOCK_COMP price 15000, techLevel 9.
  </behavior>
  <action>
  Per D-10. Implement the pure profile module over an injected `{key, price}` item (no content import inside src/sim; the app passes the catalogue item). Implement src/content/equipment.ts mirroring ships.ts (lazy ?raw, zod EquipmentSchema, named error). Append the Key Decisions row recording the TL-gate deviation and its Phase 5 resolution.
  </action>
  <verify>
    <automated>docker compose run --rm test npx vitest run tests/sim/player-profile.test.ts tests/guards/content-boundary.test.ts tests/guards/sim-purity.test.ts</automated>
    <fails_when>A purchase boundary (14999/15000/owned) assertion fails or a guard reports src/sim importing content.</fails_when>
  </verify>
  <acceptance_criteria>
  - PROJECT.md Key Decisions mentions the TL 9 gate deviation.
  </acceptance_criteria>
  <done>Credits and purchase maths are pure, integer-safe and boundary-tested.</done>
</task>

<task type="auto" reversibility="reversible">
  <name>Task 3: expand — docked-panel purchase line, session wiring, e2e</name>
  <files>src/ui/docked.ts, index.html, src/app/game-session.ts, src/app/probe.ts, tests/e2e/docking.spec.ts</files>
  <action>
  Per D-10, D-11, D-12. Replace constant DOCKED_CREDITS with a `setCredits(text)` panel method; add `[data-field="dockcomp"]` and `[data-action="buy-dockcomp"]` to #docked in index.html and to createDockedPanel (requireField pattern, AbortController handler, textContent only). The line text is "Docking Computers — 1500.0 Cr (TL 9)" built from the loaded catalogue through formatCredits; disable the button when owned or unaffordable and show the reason in the existing message field (never throw). Session holds the PlayerProfile (new game: newProfile()), overwrites `installed` on drained dockingComputer commands from the profile, maps dockDenied to fixed messages ("No docking computer installed", "Too far from the station to engage docking computer") and docked{via:"computer"} to "Docking computers engaged". Extend the `?test=1` hook with `setCredits(n)` and `grantEquipment(key)` (live state only; validated finite non-negative integer / known key; never persisted by the hook). Probe adds `profile?: {credits:number; equipment:string[]}`. e2e: new game shows 100.0 Cr and a disabled purchase; hook setCredits(20000) then buy -> credits 5000 and equipment contains EQ_DOCK_COMP; launch, skip, press Shift+C -> probe.mode "docked", clock delta since the pre-press probe is 1200 (+ at most the wall ticks between reads: assert via the sim clock before/after on a paused session or compare to 1200 within one frame's dt); plain C does nothing; far from the station (hook setPosition beyond 51200) Shift+C leaves mode inFlight and posts the message.
  </action>
  <verify>
    <automated>docker compose run --rm e2e sh -lc "npm run build && npx playwright test tests/e2e/docking.spec.ts tests/e2e/launch.spec.ts tests/e2e/settings.spec.ts"</automated>
    <fails_when>Purchase leaves credits unchanged/negative, Shift+C does not reach docked inside the aegis, plain C docks, the far case changes mode, other specs regress, or a console error is logged.</fails_when>
  </verify>
  <acceptance_criteria>
  - All dynamic panel text via textContent; typecheck and lint green.
  - The docked line literally reads "Docking Computers — 1500.0 Cr (TL 9)".
  </acceptance_criteria>
  <done>The player can buy the computer and use Shift+C from the browser.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| keyboard -> input layer | untrusted key events, modifier state |
| ?test=1 hook -> profile | privileged dev seam granting credits/equipment |
| equipment JSON -> app | generated asset validated by zod |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-----------|-----------------|
| T-04-18 | Elevation | Shift+C chord bypass (plain C, repeat, held key) | medium | mitigate | REQUIRES_SHIFT in keyDown; tests for plain C, repeat, other bindings |
| T-04-19 | Tampering | forged `installed` flag / equipment via hook | medium | mitigate | session derives `installed` from profile; hook validates key against catalogue and integer credits, exists only with ?test=1, never persists |
| T-04-20 | Tampering | credits overflow / negative / NaN | high | mitigate | purchase keeps safe non-negative integers, refuses invalid; boundary tests |
| T-04-21 | Tampering | untrusted save data | high | accept | save forging of equipment is blocked by plan 04-05 allow-list; not touched here |
| T-04-22 | Denial of service | resource exhaustion / malformed save | low | accept | no loops/allocation added; save DoS owned by 04-05 |
| T-04-23 | Elevation | XSS via panel text | low | mitigate | textContent only; copy from catalogue/fixed strings |
| T-04-SC | Tampering | npm/pip/cargo installs | high | mitigate | no packages added |
</threat_model>

<verification>
Scoped runs then `docker compose run --rm test`, `typecheck`, `lint`.
</verification>

<success_criteria>Phase success criterion 4: Shift+C docks instantly with the computer (TL 9 line shown, 1500 Cr) and advances the clock 20 minutes.</success_criteria>

<output>
Create `.planning/phases/04-manual-docking/04-04-SUMMARY.md` when done
</output>

## Artifacts this phase produces (this plan)
PlayerProfile, equipment loader, computer dock, dockingComputer command/action, docked purchase line, hook seams.

## Quality gate self-check
- [x] D-10..D-12 cited - [x] TL deviation recorded - [x] tracer first - [x] boundary edges lifted - [x] threat model complete - [x] no deferred idea (autopilot) included

#### .planning/phases/04-manual-docking/04-05-PLAN.md

---
phase: 04-manual-docking
plan: 05
type: execute
wave: 5
depends_on: ["04-04"]
files_modified:
  - src/persistence/save.ts
  - src/persistence/store.ts
  - src/persistence/memory-store.ts
  - src/persistence/idb-store.ts
  - src/persistence/autosave.ts
  - src/ui/title.ts
  - index.html
  - src/main.ts
  - src/app/game-session.ts
  - src/app/probe.ts
  - tests/persistence/save.test.ts
  - tests/persistence/autosave.test.ts
  - tests/e2e/autosave.spec.ts
  - .planning/PROJECT.md
autonomous: true
requirements: [DOCK-07]
estimate:
  tokens: 110000
  raw_tokens: 55000
  tasks: 3
  confidence: low
must_haves:
  truths:
    - "Launching writes a versioned JSON autosave (version, mode 'docked', post-launch clock already +600 s, credits, equipment, system id, station key) to IndexedDB db 'wegolite', store 'saves', key 'autosave'."
    - "Docking (manual or computer) does NOT autosave."
    - "On boot a valid save shows #title-continue; #title-start stays 'New game' and clears the save."
    - "Continue restores docked state: clock, credits, equipment; pose derived from the layout."
    - "Corrupt, truncated, wrongly-typed or future-version saves never crash boot and are never overwritten (future) / are treated as no save (corrupt)."
    - "A failed IndexedDB open/read/write never breaks the frame loop."
  artifacts:
    - { path: "src/persistence/save.ts", provides: "SaveV1 zod strict schema, pure parseSave, encodeSave" }
    - { path: "src/persistence/idb-store.ts", provides: "IndexedDbSaveStore" }
    - { path: "src/persistence/memory-store.ts", provides: "MemorySaveStore" }
    - { path: "tests/e2e/autosave.spec.ts", provides: "real IndexedDB reload proof" }
  key_links:
    - "SimEvent launched -> handleEvent -> encodeSave -> store.write (fire-and-forget, caught)"
    - "boot -> store.read -> parseSave -> title Continue visibility"
  prohibitions:
    - "No new npm dependency (idb and fake-indexeddb are SUS)."
    - "No docked pose floats, timestamps or host data in the save."
    - "Do not autosave on docking."
    - "Do not overwrite a future-version save."
    - "The ?test=1 hook must not write saves."
    - "Do not touch localStorage settings on New game."
---

<objective>
As a player, I want the game to autosave when I launch and offer Continue when I come back, so that my docked state is always resumable (DOCK-07).

Purpose: first IndexedDB persistence, versioned and validated (D-13..D-15).
Output: persistence module, autosave hook, title Continue/New game, unit and e2e proof.
</objective>

<execution_context>
@/home/opencode/.config/opencode/gsd-core/workflows/execute-plan.md
@/home/opencode/.config/opencode/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/phases/04-manual-docking/04-CONTEXT.md
@.planning/phases/04-manual-docking/04-RESEARCH.md
</context>

<read_first>
- 04-RESEARCH.md "Persistence (IndexedDB)" and Security Domain
- src/settings/store.ts + schema.ts (versioning/corrupt precedent), tests/settings/schema.test.ts (FakeStorage)
- src/ui/title.ts, src/main.ts:191-197, index.html #title-screen, src/app/game-session.ts start()/handleEvent
- tests/e2e/launch.spec.ts:96-102 (reload after launch expects #title-start to start fresh), tests/e2e/helpers/probe.ts
</read_first>

<assumptions_flagged>
- DOCK-07 unclassified edges surfaced: autosave with no IndexedDB (private mode) -> silent no-op; quota error -> caught; two rapid launches -> last write wins; save from an unknown system id -> corrupt; credits as float/negative/huge/NaN -> corrupt; equipment not in catalogue -> corrupt; extra keys -> corrupt (strict); `version` 2+ -> future-version, untouched; `version` 0/missing -> corrupt.
- Orchestrator resolutions applied: the saved clock is the POST-launch clock (+600 s already applied) with mode "docked"; autosave only on launch.
- Reversibility: save schema + DB/store/key names = costly (D-13, user-settled; Phase 6 must migrate, hence version field). No one-way decision, so no checkpoint:decision.
- Corrupt blobs are best-effort copied to key 'autosave.corrupt' (never read back).
</assumptions_flagged>

<tasks>

<task type="tracer" reversibility="costly">
  <name>Task 1 (tracer): launch writes a validated save; Continue restores it (memory store, end-to-end in unit test)</name>
  <files>src/persistence/save.ts, src/persistence/store.ts, src/persistence/memory-store.ts, src/persistence/autosave.ts, tests/persistence/save.test.ts, tests/persistence/autosave.test.ts</files>
  <action>
  Per D-13, D-15. save.ts: zod strict `SaveV1` {version: literal 1, mode: literal "docked", clockSeconds: finite, >= CLOCK_START, credits: int 0..Number.MAX_SAFE_INTEGER, equipment: array max 64 of strings max 64, system {id max 16}, station {key max 64}}. Pure `parseSave(raw: string|null)` returns {ok:true, save}|{ok:false, reason:"corrupt"|"future-version"|"absent"}: JSON.parse in try/catch, version > 1 on an otherwise object blob => "future-version" before strict validation, then strict schema, then caller-supplied allow-lists (known equipment keys, known system id) so the module stays content-free. `encodeSave(inputs)` builds a SaveV1 and JSON.stringify's it. store.ts defines `SaveStore {read(): Promise<string|null>; write(json): Promise<void>; clear(): Promise<void>}`. memory-store.ts implements it. autosave.ts: `autosaveOnLaunch(store, snapshot)` fire-and-forget: calls write, catches and swallows rejection; `restoreFromSave(save, layout, profileFactory)` returns initFlightState(layout) with clockSeconds overwritten and the profile restored (docked pose derived, no stored pose). Tests: table-driven parseSave (valid; truncated JSON; version 0; version 2 => future-version; NaN/Infinity/negative/float/huge credits; clock below CLOCK_START; unknown equipment; extra key; __proto__ key; oversized arrays; wrong mode; unknown system id); autosave test with MemorySaveStore: launch snapshot written once with clock = pre-launch + 600; a store whose write rejects does not throw or reject unhandled; future-version blob in the store is never replaced by an autosave of an older build (the write path is only reached after launch, so assert clear-on-New-game is the only deletion and is skipped for future-version unless the user explicitly chooses New game -> then it is cleared); restore yields mode "docked" at saved clock.
  </action>
  <verify>
    <automated>docker compose run --rm test npx vitest run tests/persistence/save.test.ts tests/persistence/autosave.test.ts tests/guards/sim-purity.test.ts</automated>
    <fails_when>Any reject-table row is accepted, a valid save is rejected, a rejected write throws/unhandled-rejects, or restore yields a mode other than docked.</fails_when>
  </verify>
  <acceptance_criteria>
  - `rg -n "idb|fake-indexeddb" package.json` returns nothing.
  - Save JSON contains no position/orientation/timestamp keys (test asserts the key set).
  </acceptance_criteria>
  <done>The validated save contract and restore path are proven against an in-memory store.</done>
</task>

<task type="auto" reversibility="costly">
  <name>Task 2: expand — IndexedDbSaveStore adapter, launch hook, title Continue / New game</name>
  <files>src/persistence/idb-store.ts, src/ui/title.ts, index.html, src/main.ts, src/app/game-session.ts, src/app/probe.ts</files>
  <action>
  Per D-13, D-14. idb-store.ts: `IndexedDbSaveStore` opens lazily (DB "wegolite" v1, object store "saves", key "autosave"), wraps each IDBRequest in a Promise, every failure path (open blocked, private mode, quota, abort) resolves read to null / swallows write and clear with no throw; stores the JSON string (not a structured object). index.html adds `#title-continue` (hidden by default, label "Continue"); keep `#title-start` text "New game". title.ts gains `onContinue(handler)` and `setContinueVisible(boolean)` with textContent/hidden only; main.ts reads the store and parseSave before showing the title, shows Continue only for ok saves, wires onStart to clear the store (best-effort) then `session.start({fresh:true})` and onContinue to `session.start({restore: save})`. A future-version blob hides Continue and New game must NOT clear it silently: New game proceeds, the blob is left untouched until the next successful launch autosave (document; the user-visible consequence is that a future save is only replaced by an explicit New game plus launch). handleEvent case "launched" calls `autosaveOnLaunch` with the post-beginLaunch snapshot (clock already +600, mode "docked", profile credits/equipment, system id, station key); never on "docked". Probe adds `save?: {writes:number; lastClock:number|null; continueVisible:boolean}`. The ?test=1 hook is NOT extended and must not call the store.
  </action>
  <verify>
    <automated>docker compose run --rm test npx vitest run tests/persistence tests/app tests/guards</automated>
    <fails_when>An existing app/boot/dispose test regresses, a guard fails, or persistence unit tests fail after wiring.</fails_when>
  </verify>
  <acceptance_criteria>
  - `docker compose run --rm typecheck` and `lint` green.
  - `rg -n "innerHTML" src/ui/title.ts` returns nothing.
  </acceptance_criteria>
  <done>The browser path writes and reads the real store and the title offers Continue/New game.</done>
</task>

<task type="auto" reversibility="reversible">
  <name>Task 3: expand — real-IndexedDB e2e, corrupt/future saves, regression of reload specs</name>
  <files>tests/e2e/autosave.spec.ts, .planning/PROJECT.md</files>
  <action>
  Per D-14 and Phase 3 D-09. Specs (fresh Playwright context each): (1) New game -> launch -> probe.save.writes >= 1 -> reload -> #title-continue visible -> Continue -> probe.mode "docked" and probe.clock equals the saved post-launch clock (clock before launch + 600), docked panel visible; (2) manually dock (hook pose) -> reload shows Continue still pointing at the launch-time clock (no autosave on docking); (3) New game after a save clears it: reload shows no Continue after clicking #title-start then reloading before any launch; (4) inject via page.evaluate into the real IndexedDB a corrupt string, then a version 2 blob: boot has no console error, Continue hidden, the version 2 blob is byte-identical afterwards (read back); (5) launch.spec reload scenario still passes. Add the PROJECT.md Key Decisions row for save schema v1 (db/store/key names, strict zod, no new deps, post-launch clock, launch-only autosave). No pixel assertions.
  </action>
  <verify>
    <automated>docker compose run --rm e2e sh -lc "npm run build && npx playwright test tests/e2e/autosave.spec.ts tests/e2e/launch.spec.ts tests/e2e/dispose.spec.ts tests/e2e/aspect.spec.ts"</automated>
    <fails_when>Continue is missing after a launch+reload, restored clock differs from the saved clock, a future-version blob changes, boot logs a console error, or an existing spec regresses.</fails_when>
  </verify>
  <acceptance_criteria>
  - Final gate: `docker compose run --rm verify` green.
  - PROJECT.md contains the save-schema Key Decisions row.
  </acceptance_criteria>
  <done>Phase success criterion 5: launching autosaves and the docked state is resumable, proven in a real browser.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| IndexedDB blob -> app | untrusted: user-editable, corruptible, possibly from a newer build |
| ?test=1 hook | must not reach the store |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-----------|-----------------|
| T-04-24 | Tampering | forged credits/clock/equipment/system in save | high | mitigate | strict zod SaveV1 + integer/range checks + equipment and system allow-lists; reject table test |
| T-04-25 | Tampering | prototype pollution via JSON.parse | high | mitigate | strict schema rejects unknown keys incl. __proto__; no object merge of parsed data; test row |
| T-04-26 | Tampering/Repudiation | older build overwriting a future-version save | medium | mitigate | version>1 => future-version, Continue hidden, never written/cleared automatically; e2e byte-identical check |
| T-04-27 | Denial of service | malformed/oversized save crashing or hanging boot | high | mitigate | JSON.parse in try/catch, array/string max lengths, rejected => treated as no save, copied to autosave.corrupt best effort; e2e boots without console error |
| T-04-28 | Denial of service | IndexedDB unavailable, quota exceeded, blocked open | medium | mitigate | every adapter path swallows; fire-and-forget write never awaited by frame loop; unit test with rejecting store |
| T-04-29 | Denial of service | resource exhaustion by repeated launch writes | low | mitigate | single key overwritten, payload < 1 KB, bounded by launch cadence (>=2 s launch sequence) |
| T-04-30 | Elevation | Shift+C/keyboard input | low | accept | handled and tested in plan 04-04; no input surface added here |
| T-04-31 | Elevation | ?test=1 hook writing saves | medium | mitigate | hook not extended with store access; e2e asserts no save write from hook calls |
| T-04-32 | Information disclosure | host data in save | low | mitigate | schema has no timestamp/pose/host keys; key-set test |
| T-04-SC | Tampering | npm/pip/cargo installs | high | mitigate | none added; idb and fake-indexeddb rejected (SUS too-new) so no human-verify checkpoint needed |
</threat_model>

<verification>
`docker compose run --rm verify` green; scoped runs above.
</verification>

<success_criteria>Launching autosaves; a validated save restores a docked game via Continue; hostile saves are inert.</success_criteria>

<output>
Create `.planning/phases/04-manual-docking/04-05-SUMMARY.md` when done
</output>

## Artifacts this phase produces (this plan)
src/persistence/*, title Continue button, autosave hook, probe.save, autosave e2e, Key Decisions row.

## Quality gate self-check
- [x] D-13..D-15 cited - [x] launch-only autosave - [x] tracer first - [x] corrupt/future/DoS threats concrete and tested - [x] no Phase 6 scope (no flight-state, migrations, F2)


## Review Instructions

**Verify against source — do not review the plan text in isolation.** The plans reference real files, migrations, routes, and tests in this repo.
1. Open the referenced files and check each claim against the actual code.
2. For every strength or concern, cite concrete `path/to/file:line` evidence plus the mechanism.
3. When a plan asserts a mechanism works (a guard, a query filter, a test that exercises a path), trace whether it actually does what is claimed — do not take the plan's word for it.
4. If you cannot read the repo (no file access), say so and downgrade that finding to an open question rather than asserting it.

Findings citing `file:line` evidence are weighted far more heavily than impressionistic ones; a review that only restates the plan's own claims has low value.

**Plan coverage is mandatory.** Give **every** plan id its own `##`-level section headed with that id **verbatim** (e.g. `## 04-01`) before writing any cross-plan comparison, an overall risk assessment, or a consensus-style summary. A review that stops before every id has its own section is an incomplete review, not a summary — if you must stop early, say so explicitly and name which ids you did not reach.

Analyze each plan and provide:
1. **Summary** — One-paragraph assessment
2. **Strengths** — What's well-designed (bullet points)
3. **Concerns** — Potential issues, gaps, risks (bullet points with severity: HIGH/MEDIUM/LOW)
4. **Suggestions** — Specific improvements (bullet points)
5. **Risk Assessment** — Overall risk level (LOW/MEDIUM/HIGH) with justification

Focus on:
- Missing edge cases or error handling
- Dependency ordering issues
- Scope creep or over-engineering
- Security considerations
- Performance implications
- Whether the plans actually achieve the phase goals

Output your review in markdown format.

## Plan Coverage Manifest

Total plans in this review: 5

Plan ids (give each one its own `##`-level section, headed verbatim):
- 04-01
- 04-02
- 04-03
- 04-04
- 04-05
