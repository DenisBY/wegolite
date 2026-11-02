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

**Reusable data.** `Resources/Config/` holds the canonical plists: `shipdata.plist`, `commodities.plist`, `equipment.plist`, `world-scripts.plist`, plus the eight-galaxy system data. These are the source of truth for faithful numbers.

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
*Last updated: 2026-11-02 after initialization*
