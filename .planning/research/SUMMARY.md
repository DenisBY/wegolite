# Project Research Summary

**Project:** Wegolite
**Domain:** Browser-based 3D space-trading game — a faithful reimplementation of Oolite's core single-player loop (flight, manual docking, 17-commodity trade, hyperspace across 8 galaxies), delivered as a static desktop web client
**Researched:** 2026-11-02
**Confidence:** HIGH

## Executive Summary

Wegolite is a fidelity port, not a genre game. Its value proposition is that every number — Cobra pitch/roll rates, Lave's food price, the 0.4 LY jump quantisation, the docking corridor's forgiveness envelope — comes from Oolite's own config and source rather than from design judgement. That single fact dictates the architecture: a pure, deterministic, headless-testable simulation core fed by build-time-compiled Oolite data, with Three.js as a downstream projection of simulation state and DOM (not canvas) for station screens. Research converged on TypeScript + Three.js `WebGLRenderer` on WebGL2 + Vite + Vitest, with Playwright for the browser seam and IndexedDB for saves. Three stack traps were identified and should be treated as settled: do **not** use `WebGPURenderer` (still experimental in r187, requires TSL, unsupported on Firefox/Linux); do **not** use an XML/`JSON` plist parser (Oolite config is OpenStep ASCII with comments, unquoted keys, and `like_ship` inheritance); and do **not** parse `.dat`/`.plist` at runtime (convert to GLB/typed JSON at build time and validate in CI).

The four research streams agree on the build order and it is not the obvious one. Two things are catastrophic to retrofit and must exist before any feature work: the **fixed-timestep loop with camera-relative rendering** (Oolite's system spans ~1.4e6 m, where float32 ULP is 12.5 cm and a single near/far range z-fights the station), and the **data pipeline** (2,048 systems from `planetinfo.plist`, 17 commodities, `like_ship`-resolved Cobra). Everything else — flight feel, docking, market screens, hyperspace — is tuning and UI on top of those two foundations. The recommended arc is: foundation and compliance → content compiler → world/scale → flight → docking → docked economy and screens → hyperspace and persistence → hardening. The loop only closes at phase 7, which is the honest cost of fidelity.

The dominant risks are legal, not technical. Oolite's `LICENSE.md` dual-licenses code under GPL-2.0-or-later and artwork/config under CC BY-NC-SA 3.0, which are incompatible, and "Elite"/"Cobra"/"Oolite" are Frontier trademarks that no open-source licence grants. A single collapsed `LICENSE` file or an "Elite in your browser" page title can end the project faster than any bug. The second-tier risks are fidelity risks that read as "not Oolite" within 60 seconds: $5 food displayed as 50 Cr (decicredits), a smoothed hull (per-face normals discarded), a ship that flies tail-first (axis conversion), Newtonian drift (wrong flight model), or a trigger-sphere dock. All of these have cheap, specific preventions documented in PITFALLS.md and must be encoded as tests in the phase that owns them.

**Container constraint (added after research):** every application and test process runs in Docker via Docker Compose — dev server, production preview, Vitest (node and browser projects), and Playwright with browsers baked into the image. The research is largely silent on this (see *Gaps to Address*), and two of its instructions actively violate it: `npx playwright install chromium` and host-side `npm ci`/`npm test`. Phase 1 must own the container toolchain, and no later phase may treat a host run as evidence.

## Key Findings

### Recommended Stack

TypeScript (native CLI 7.0.2 for `tsc`, aliased TS 6.0.2 for the tooling API that typescript-eslint requires), Three.js 0.187.0 with `WebGLRenderer`, Vite 8.3.5, Vitest 5.0.5 (node + browser projects), Playwright 1.64.1, Node 24 LTS, IndexedDB via `idb-keyval`, zod 4.6.7 at every trust boundary, `@gltf-transform/core` for build-time GLB authoring. Pin every version exactly — Three has no semver and deletes deprecated APIs on a schedule; `@types/three` must match `three` to the minor. Full detail and rationale: `STACK.md`.

**Core technologies:**
- **TypeScript (strict)** — the simulation language; matches Oolite's own JavaScript-scripted gameplay logic and gives a headless, unit-testable core.
- **Three.js 0.187 `WebGLRenderer`** — thin renderer, not an engine. You keep the loop, the scene composition, and the flight model. `WebGPURenderer` is explicitly rejected for v1.
- **Vite 8 (Rolldown)** — dev server and production bundling; subpath-safe static output (`base: './'`), no router, no env vars at runtime.
- **Vitest 5 + Playwright 1.64** — Vitest `node` project for all `sim/` and `tools/` rules; Vitest `browser` project for WebGL/DOM smoke tests; Playwright for the single end-to-end user story. Never pixel-snapshot the 3D scene.
- **IndexedDB (`idb-keyval`) + zod** — versioned save envelope, one record per slot plus autosave; schema-validated on load and on import. `localStorage` is for settings only.
- **Build-time asset pipeline (`tsx` + `@gltf-transform/core` + in-repo OpenStep and `.dat` parsers)** — emits typed JSON, GLB, and a manifest with the pinned Oolite commit; `assets:verify` fails CI on drift.

**Explicitly excluded:** React/R3F, Babylon/PlayCanvas, any physics engine, `three-stdlib`, Draco/Meshopt/KTX2 (payload is ~10 small meshes), a state-management library, CSS frameworks, PWA/service worker, and the `plist` npm package.

### Expected Features

The v1 cut is the full launch → fly → dock → trade → jump loop, and nothing else. FEATURES.md locks an opinionated line: 19 table-stakes items, a set of cheap later differentiators, and a long anti-feature list that exists to stop scope creep.

**Must have (table stakes):**
- **Cobra Mk III flight model, pitch/roll only** — 350 u/s, thrust 32 (accel `5 × thrust = 160 u/s²`), pitch 1 / roll 2 rad/s with 2/4 rad/s² ramping; Aristotelian velocity; no yaw (a deliberate divergence from modern Oolite, which added yaw in 1.66).
- **Launch from a Coriolis station** — docked state, 2 s scripted exit, `launchRoll = -station_roll`, +10 min clock.
- **In-system scene** — sun, planet, station in orbit, nav buoy, witchpoint. No asteroids, no NPC traffic.
- **Torus jump drive** — `j`, 32× rising to 1024× with distance, mass-locked. Without it the loop is a 20-minute flight; it is core navigation, not polish.
- **Manual docking** — invisible corridor from the dock subentity's bounding box (not the visible slit), 1.5× safety envelope, x/y auto-centring, 90 % past-plane capture, speed-scaled scrape damage, station spin about local **Z**.
- **Hyperspace** — chart target, 15 s abortable countdown, `10 × max(0.1, distance)` fuel, distance quantised via integer truncation to 0.4 LY, jump time `distance²` hours, arrival at the witchpoint.
- **Galactic chart** — short and long range, 7 LY graph edges, target selection, distance/fuel display.
- **17-commodity market** — Oolite's exact `OOCommodities.m` formula (economy-only bias, triangular `randf() - randf()` term), 127 stock cap, same buy/sell price, decicredit integers, kg/g pod accounting for gold/platinum/gem-stones.
- **Market, outfitting, status, chart, save/load screens** — DOM tables and real controls; F8/F3/F5/F6/F2 equivalents.
- **Docking computer** — `EQ_DOCK_COMP` TL 9 / 1500 Cr; `Shift+C` instant dock (+20 min) first, `c` scripted autopilot immediately after.
- **Save/resume at stations** — docked only, autosave on launch, versioned schema, IndexedDB.
- **HUD subset** — crosshair, scanner, compass, aegis, speed/roll/pitch bars, fuel, clock, message line, condition light. Combat dials removed, not inert.
- **Build-time data ingestion** — all eight galaxies, commodities, equipment, Cobra + Coriolis stats, descriptions.

**Should have (competitive, P2):**
- F7 system-data screen (data already present; near-zero cost).
- Advanced Navigational Array route plotting + chart filters (progression reward).
- Advanced Space Compass target cycling.
- Galactic Hyperdrive and the one-way 8-galaxy ring.
- Multiple slots, JSON export/import, save metadata.
- Mass-dependent fuel pricing; equipment install-time clock advance.
- Full slow-autopilot docking with the clearance ritual.
- Tutorial/onboarding overlay — arguably the highest-value P2 given the docking learning curve.

**Defer (v2+):** combat/shields/energy/weapons/missiles, NPC traffic and AI, legal status/bounty/police, missions/contracts, shipyard and multiple ships, fuel scoops and sun-skimming, misjumps/Thargoids, audio, mobile/touch. OXPs are never in scope.

**Deliberate anti-features:** dynamic supply/demand price impact (Oolite prices do not move with trades), save-anywhere, yaw/Newtonian flight, autodock without buying the computer, and rebalanced starting credits. Each is documented with its reason so it cannot be re-added in a review.

### Architecture Approach

A single-instance `GameState` owned by an `app/GameSession`, stepped by a fixed-timestep loop, projected one-way into a Three.js scene and a set of DOM screens. Three invariants carry the whole design: `sim/` imports nothing but `sim/` and `content/types` (enforced by ESLint import zones and proved by unit tests that never load Three or the DOM); the renderer only reads state and never writes it; and every interaction is a `Command` in and a `SimEvent` out, so the UI cannot mutate simulation state. ARCHITECTURE.md also picks the non-obvious resolution to the precision problem — keep float64 metres in the sim and subtract the camera origin in double precision before each float32 GPU upload, with `logarithmicDepthBuffer` for the 2,500 km far plane.

**Major components:**
1. **`app/`** — composition root, game loop (accumulator, ≤5 steps/frame, 0.25 s delta clamp, accumulator reset on resume), mode machine (single `mode` discriminant — no `isDocked && isJumping`), save slots.
2. **`sim/`** — `math` (hand-written `Vec3`/`Quat`, seeded PRNG), `time`, `state`, `flight` (rate slewing + quaternion integration), `navigation`, `economy` (integer decicredits), `docking` (corridor test + controller), `commands`/`events`, `save` (versioned envelope + ordered migrations).
3. **`content/`** — generated, typed, read-only data + GLB + manifest, checked in and diffed in CI; `SystemDef`/`ShipDef`/`CommodityDef`/`EquipmentDef` with units in the field names.
4. **`render/`** — `WebGLRenderer` config, camera rig (floating origin), `sync.ts` (camera-relative transform pass), scene manager (`Menu`/`System`/`Hyperspace`/`Station`), body factories, HUD projection.
5. **`ui/`** — DOM screens with `mount/update/unmount`, re-rendered on `GameState.version` change, not per frame.
6. **`input/`** — device adapters → immutable `InputFrame` sampled once per frame + discrete action queue.
7. **`persistence/`** — IndexedDB slots, autosave, export/import; migrations live in `sim/save`, not here.
8. **`tools/oolite-ingest/`** — OpenStep parser, `.dat` parser, GLB writer, per-galaxy system JSON, manifest, `--check` mode.
9. **`tests/`** — golden replays with state hashes, Playwright specs.

### Critical Pitfalls

Top risks with the cheapest effective prevention. Full list, warning signs, and recovery costs: `PITFALLS.md`.

1. **Collapsing Oolite's two licences into one.** `LICENSE.md` grants GPL-2.0-or-later for the work *and additionally* CC BY-NC-SA 3.0 for artwork and config files, which are GPL-incompatible. **Avoid:** elect GPL-2.0-or-later for assets explicitly, and ship `LICENSE`, `LICENSE-ASSETS`, `NOTICE`, `THIRD_PARTY_NOTICES`, `TRADEMARKS.md`, and a per-file `assets-manifest.json` with provenance and the preferred form for modification (keep the raw `.dat`/`.plist`/PNG). In Phase 1, before the first asset is committed.
2. **"Elite"/"Cobra"/"Oolite" as branding.** Copyright licences grant no trademark rights; Frontier owns Elite, the Elite logo, Cobra, and the Cobra logo. **Avoid:** product name stays Wegolite; no marks in the title, domain, logo, or store listing; visible non-affiliation disclaimer in the footer, not just the README.
3. **Stale data names and wrong units.** `PROJECT.md` still says `commodities.plist`; current Oolite ships `trade-goods.plist`. Prices are decicredits in `trade-goods`/`equipment` but credits in `shipyard`; `planetinfo.radius` is km multiplied by 10 at runtime; fuel is tenths of a LY. **Avoid:** a written units-and-provenance contract before economy code, unit-suffixed field names, and golden tests (food 5.0 Cr, cargo bay 400 Cr, Cobra 0.350 LS, planet radius `km × 10`).
4. **Treating Oolite formats as JSON/XML, or importing `.dat` as if it were glTF.** OpenStep ASCII needs a real recursive-descent parser with `like_ship` resolution and cycle detection; `.dat` UVs are texel units divided by the declared texture size, the first three `FACES` integers are colours (first = smooth group), faces with >3 vertices truncate to the first three, and normals are per-face. **Avoid:** build-time parsers with upstream fixtures, an explicit axis/winding contract (+Z → −Z with winding reversal), a bbox assertion per model (`oolite_cobra3.dat` ≈ 130×35×81, Coriolis hull ≈ 1000×1000×996), and a visual test on the asymmetric Coriolis letterbox.
5. **Float32 world coordinates.** At 500 km, float32 ULP is 3.1 cm; at 1.4e6 m it is 12.5 cm, and a single near/far range gives ~1.2 km depth error at 100 km. **Avoid:** float64 sim + camera-relative double subtraction before upload, `logarithmicDepthBuffer`, coplanar station layers offset explicitly, and never globally rescaling the world.
6. **Newtonian or instant-turn flight.** Oolite is a kinematic "aeroplane in space": scalar `flightSpeed`, `position += forward * speed * dt`, ramped angular rates with damping. **Avoid:** implement the exact model, expose constants from data, script expected rate/accel curves, and test 60/144 Hz parity.
7. **Docking as a trigger sphere or strict mesh collision.** Both fail; Oolite uses a forgiving corridor derived from the dock bbox with auto-centring and a 90 % capture plane. **Avoid:** model the corridor, spin the station about local Z, add alignment/roll/speed cues and scrape feedback, script perfect/10°-off/too-fast/wrong-roll approaches.
8. **Saving only credits and cargo, then regenerating the market.** **Avoid:** persist prices, quantities, and PRNG state in a versioned DTO; never `JSON.stringify(gameState)`; write round-trip tests; handle quota and private-mode failures.
9. **Browser-runtime assumptions.** Audio gesture gating, lost `keyup` on blur, tab throttling, `webglcontextlost`, Safari variance. **Avoid:** clear input and pause on `blur`/`visibilitychange`, context-loss handlers, capped DPR, a WebGL2 capability check page, and a Safari smoke test from Phase 1.
10. **A player-only architecture that makes the combat hole "v2".** **Avoid:** a thin `Entity`/`Ship`/`Station`/`PlayerShip` model and a `ShipController` interface from the start, proved by making the docking computer an `AIController` flying the same corridor.

## Implications for Roadmap

Recommended: **8 phases**. The ordering rule is *containers and compliance → precision and loop → data → scene → flight → docking → screens and economy → travel and save → hardening*. Anything needing "docked" comes after docking; anything needing a second market comes after hyperspace; the save schema is finalised only once the state models stop moving.

### Phase 1: Foundation, Containers & Compliance
**Rationale:** Three things here are unrecoverable if deferred — the Docker toolchain (every later phase's definition of "passing"), the fixed-step loop plus camera-relative render strategy (retrofitting touches every entity and shader), and the licence/trademark posture (retrofitting means pulling a release). Proving the loop against a cube costs a day and de-risks the entire project.
**Delivers:** `docker compose` with services for `app` (Vite dev, `--host 0.0.0.0`), `preview` (static build served), `test` (Vitest node project), `e2e` (Playwright with browsers baked in), `lint`, `typecheck`, `verify` (the full CI chain in one command); pinned base images and dependency layers cached in the image; `.env.example` for ports. Repo skeleton, strict `tsconfig`, ESLint flat config with `no-restricted-imports`/import zones forbidding `three` under `src/sim/**`, Prettier. `sim/math`, `sim/time`, `app/GameLoop`, camera-relative renderer, starfield + one cube, determinism harness. `LICENSE` (GPL-2.0), `LICENSE-ASSETS`, `NOTICE`, `TRADEMARKS.md`, `assets-manifest.json` scaffold, visible disclaimer, product name locked to Wegolite. `docs/FIDELITY.md` and the units-and-provenance contract opened.
**Uses:** TypeScript 7 + 6 aliases, Vite 8, Vitest 5, Three 0.187, Node 24 LTS base image.
**Avoids:** licence collapse (P1), trademark (P2), float32/depth instability (P6), browser-runtime breakage (P11 checklist), combat-shaped architecture (P9).
**Research flag:** none needed for the code; **the Compose/Docker file has no research backing and must be authored from PROJECT.md's constraints and the stack's peer versions.**

### Phase 2: Data Pipeline & Fidelity (Content Compiler)
**Rationale:** Every later phase reads these numbers. Hand-retyping Oolite values is exactly where fidelity dies, and the compiler's output types shape how the sim consumes data — so it precedes content *consumption* even though it follows the loop's type skeleton.
**Delivers:** `tools/oolite-ingest/` with an OpenStep ASCII parser (comments, unquoted keys, `yes`/`no`, trailing commas, `<hex>`, duplicate-key overlay), `like_ship`/`is_template`/`shipdata-overrides` resolution with cycle detection, `.dat` parser (triangle truncation, per-face normals, UV divide by declared size, optional `TEXTURES`/`NAMES`/`NORMALS` handling), GLB writer with explicit +Z→−Z conversion and winding reversal, systems/commodities/equipment/ships generators, `manifest.json` with the pinned Oolite commit and attribution, `assets:build` / `assets:verify` determinism gate, and a whitelist that fails the build on unknown keys. Pinned Oolite snapshot under `content/oolite/` with `SOURCE.md`.
**Addresses:** "data ported from Oolite's config rather than invented"; all 2048 systems, 17 commodities, equipment catalog, Cobra + Coriolis.
**Avoids:** stale filenames and unit drift (P3), plist/inheritance bugs (P4), DAT/material import bugs (P5).
**Research flag:** **yes** — the parsers are the highest-novelty work in the project. Plan-phase research should target `OOMesh.m` grammar edge cases, `like_ship` overlay order, GLB material conversion fidelity (Oolite Phong `gloss`/`shininess`/`specular_color` vs glTF metallic-roughness, and alpha-channel `emission_map` extraction), and the container-determinism question below.

### Phase 3: World Rendering & Scale (System Scene)
**Rationale:** Validates the coordinate strategy against real distances (planet at ~452 km, sun at ~905 km, station at `2 × planet_radius`) *before* flight feel is tuned — otherwise tuning happens against a scene that will later move. Camera-relative rendering must exist before anyone writes a shader or a custom material that assumes world space.
**Delivers:** `SystemDef` → layout derivation, `SystemScene` (sun, planet, station + dock/faceplate/tris subentities, nav buoy, dust, starfield), scene manager with `Menu`/`System`/`Hyperspace`/`Station`, `ResourceCache`, scene dispose with `renderer.info.memory` returning to baseline, hyperspace distance/fuel math (pure, unit-tested), dev overlay for draw calls/triangles/ULP.
**Uses:** Three `WebGLRenderer` with `logarithmicDepthBuffer`, `MeshStandardMaterial`/`MeshPhongMaterial` only, one directional + ambient/hemisphere light, no shadows, no post.
**Avoids:** float32 jitter and z-fighting (P6), corrupted model orientation (P5).
**Research flag:** **yes, narrowly** — planet surface fidelity (Oolite's `land_color`/`sea_color`/`polar_color` + noise vs a baked texture) and the log-depth vs two-pass `RenderStrategy` decision on Safari/integrated GPUs.

### Phase 4: Flight, Input & Launch
**Rationale:** The core feel is the product's credibility test, and it needs a real scene to be judged. It also produces the first `ShipController` and the first recordable input log, which the determinism harness and the docking computer reuse.
**Delivers:** attitude rate slewing (2 rad/s² roll, 4 rad/s² pitch, 4× faster reversal, 1.0 rad/s² damping), quaternion integration (roll about local Z then pitch about local X), `flightSpeed` slew at `5 × thrust`, `launching` mode with 2 s scripted exit and `launchRoll`, keyboard bindings with semantic actions (`pitchUp`, `rollLeft`, `hyperspace`, …), Ctrl precision modifier, torus drive with mass lock, HUD subset, pause/options, blur/visibility input clearing.
**Addresses:** Cobra flight model, launch, torus, HUD.
**Avoids:** Newtonian/instant-turn feel (P7), variable-dt physics, browser input stalls (P11).
**Research flag:** **no** — the model is fully specified in FEATURES.md §D and PITFALLS P7 with source line references. This is a tuning phase; deeper research would add nothing.

### Phase 5: Manual Docking
**Rationale:** The hardest coupling in the project — input, collision, station rotation, camera, and mode transitions must all agree — and it gates every "docked" feature. Only meaningful once flight is stable and the station pose/corridor dimensions exist from phases 2–3.
**Delivers:** dock-space transform, corridor inclusion test from the dock subentity bbox with 1.5× safety, x/y auto-centring, 90 % capture plane, scrape/damage feedback and abort path, roll-alignment and speed cues, `docking` sub-mode, `Docked` event, autosave trigger. Docking computer as a `DockingController` feeding the normal flight step — `Shift+C` instant dock (+20 min) first, then the scripted approach.
**Addresses:** manual docking, docking computer.
**Avoids:** trigger-sphere or strict-mesh docking (P8), combat-shaped controller hole (P9 — this is where the `ShipController` interface proves itself).
**Research flag:** **yes** — the effective gate and required roll are explicitly MEDIUM confidence in FEATURES.md (the port is widened at runtime and `DockEntity` has a `portUpVectorForShipsBoundingBox:` twist rule). Plan-phase research should measure the actual dock mesh axes and the visible-vs-collision opening before thresholds are hard-coded. Also needs an explicit decision on the v1 damage model (bounce-only vs a small collision-only hull pool).

### Phase 6: Docked Mode, Economy & Station Screens
**Rationale:** Closes the playable loop — launch → dock → trade — and is the first point where the state models have settled enough to design a save schema against. Market math can be built earlier, but shipping it before docking invites a roadmap that drifts into "economy first, flight later", which inverts the core value.
**Delivers:** mode machine with `docked`/`screens`, `sim/economy` (Oolite price and quantity formulas, `economicBias`, 127 cap, integer decicredits, kg/g pod accounting), trade commands/reducers with guards and `TradeCompleted`/`CommandRejected` events, DOM screens for market/outfitting/status/chart, equipment catalog filtered to functional v1 items with raw-TL gating and `available_to_all`, keyboard focus management.
**Addresses:** 17-commodity market, cargo hold, market/outfitting/status/chart screens, equipment purchase.
**Avoids:** unit/decicredit drift (P3), save-reload market exploits (P10 — market state must be persistable here), inert combat HUD/equipment.
**Research flag:** **no** — formulas, worked Lave/Zaonce examples, screen contents, and equipment TLs/prices are fully transcribed in FEATURES.md §A–G. Standard DOM patterns.

### Phase 7: Hyperspace, Persistence & Full Loop
**Rationale:** Requires stable state shape (6) *and* both scenes (3, 5). The chart can be drawn in 6; the jump can only be completed once arrival and market regeneration exist. Save goes last because schema v1 should describe a finished v1 — but the envelope is designed in phase 1.
**Delivers:** 15 s countdown with abort, fuel guard, integer-truncation distance, `distance²` clock advance, witchspace/tunnel, pre-build-during-tunnel scene swap with origin/interpolation reset, destination market generation, `SaveEnvelope` v1 with `toSavePayload`/`fromSavePayload`, ordered migrations, zod validation, IndexedDB slots + autosave + delete, JSON export/import, quota/private-mode handling, the Playwright end-to-end loop (launch → fly → dock → trade → jump → reload → continue).
**Addresses:** hyperspace, chart target selection, save/resume.
**Avoids:** save/reload arbitrage and non-reproducible prices (P10), scene-swap hitching and GPU leaks.
**Research flag:** **no** for the mechanics; **yes, lightly** for the container-side Playwright/WebGL determinism and IndexedDB persistence across page reload in the image.

### Phase 8: Hardening, Polish & Community Release
**Rationale:** Enhances a working loop rather than unblocking validation. It is also where the community-fidelity verdict lands, so it needs real Oolite players, not just tests.
**Delivers:** full slow autopilot and clearance ritual (optional, default off), F7, ANA route plotting + filters, advanced compass, galactic hyperdrive and the 8-galaxy ring, multiple slots, external/aft views, mouse flight and remap presets, mass-dependent fuel and install-time clocks, tutorial overlay, performance pass against the 60 fps budget, Chrome/Firefox/Safari matrix, context-loss recovery, capability page, hosted `docs/FIDELITY.md` and `docs/DATA-FIDELITY.md` divergence lists, classic-key defaults, final licence/trademark re-audit before launch.
**Addresses:** all P2 differentiators, onboarding, cross-browser support.
**Avoids:** community rejection (P12), pre-launch legal exposure (P1, P2), Safari-last-week rewrites (P11).
**Research flag:** **partly** — cross-browser WebGL/depth/perf behaviour on the oldest supported hardware is unmeasured (STACK.md lists Safari GPU performance as an open question).

### Phase Ordering Rationale

- **Containers first, not last.** PROJECT.md makes container execution the definition of "tests pass". A host-run green suite is explicitly not evidence, so the Compose topology cannot be a Phase 8 packaging task. Note that the research's own instructions violate this (`npx playwright install chromium`, host `npm ci`) — Phase 1 must translate them into Dockerfile steps.
- **Loop before content.** Content types are shaped by how the sim consumes them; building the compiler first tends to produce a schema that mirrors the plist instead of the game.
- **Renderer before flight.** Flight tuning is subjective and needs a correct scene; the camera-relative pass must exist before any shader or material assumes world-space positions.
- **Hyperspace math early, hyperspace presentation late.** The distance/fuel rule is pure and needed by the chart in phase 6; the tunnel and scene swap are presentation and need the scene manager.
- **Save schema last, save envelope first.** Design the envelope in phase 1 with a trivial state; finalise fields only after economy and equipment stop moving.
- **Cross-research conflict to resolve in Phase 1:** the four files disagree on the fixed step — ARCHITECTURE.md specifies `DT = 1/120` (2.9 m/step at top speed, more docking margin), while STACK.md and PITFALLS.md say 1/60 (5.8 m/step). Adopt **1/120** per ARCHITECTURE's rationale; it is cheaper to over-sample than to retune docking. Likewise adopt **IndexedDB** for saves (STACK/ARCHITECTURE/PITFALLS/PROJECT.md) over FEATURES.md's `localStorage` suggestion, and pick one tool directory name (`tools/oolite-ingest` per STACK.md, over ARCHITECTURE.md's `tools/oolite-data`).
- **PITFALLS.md numbers phases slightly differently** (it puts Flight before World Rendering). Its *content* maps directly onto this plan: P1/P2→Phase 1, P3/P4/P5→Phase 2, P6→Phase 3, P7→Phase 4, P8→Phase 5, P10→Phase 6, P11→Phases 1/6/8, P12→Phase 8.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2 (Content Compiler)** — highest novelty: OpenStep grammar edge cases, `like_ship` overlay order, `.dat` triangle/UV/normal semantics, Oolite Phong→glTF material conversion, and byte-determinism of generated assets across container architectures.
- **Phase 3 (World Rendering & Scale)** — planet-surface fidelity approach and the log-depth vs two-pass render strategy on Safari/integrated GPUs.
- **Phase 5 (Manual Docking)** — the effective gate geometry and required roll are MEDIUM confidence; measure the actual dock mesh rather than trusting a remembered 192×64.
- **Phase 7 (Hyperspace & Persistence)** — lightly: Playwright/WebGL behaviour inside the container, and IndexedDB durability across reloads in the browser image.
- **Phase 8 (Hardening)** — cross-browser and integrated-GPU performance are unmeasured (STACK.md open question).

Phases with standard patterns (skip research-phase):
- **Phase 1 (Foundation)** — the code is a walking skeleton; note that the *Docker* portion is unresearched, so treat container topology as a design task within the phase, not a research task.
- **Phase 4 (Flight & Input)** — fully specified to source-line level; this is playtesting, not research.
- **Phase 6 (Economy & Screens)** — formulas, fixtures, screen contents, and equipment tables are transcribed; plain DOM work.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Versions, peer ranges, bundle sizes, and licences verified against npm, Three r187 release/manual, Vite 8 and Vitest 5 announcements, and MDN BCD. MEDIUM on the Oolite ingestion effort. **Unresearched: the entire Docker/Compose layer.** |
| Features | HIGH | Commodity table, price/quantity formula, ship/station stats, fuel/hyperspace rules, docking trigger, equipment TLs/prices, and screen contents read from Oolite `master` source and config. MEDIUM on scope cut-lines and the Coriolis effective gate. |
| Architecture | HIGH | Oolite `src/Core/**` cloned and read directly; Three r187 renderer source read; loop cross-checked against Gaffer On Games. Numeric claims sourced, not recalled. |
| Pitfalls | HIGH for engine/data/licence facts; MEDIUM for legal interpretation and browser quirks | `LICENSE.md` read at commit `7437f22`; browser claims cross-checked against MDN; legal statements are engineering risk, not legal advice. |

**Overall confidence:** HIGH for the technical plan. MEDIUM for the containerisation layer and for legal/trademark posture (which needs a professional read before launch).

### Gaps to Address

- **Containerization is absent from all four research files.** STACK.md's install and CI instructions (`npx playwright install chromium`, host `npm ci`, `npm test`, `npx playwright test`) directly contradict PROJECT.md's container constraint, and ARCHITECTURE.md's "run WebGL with SwiftShader in CI" is the only hint of container awareness. **Handle in Phase 1:** author the Compose topology from the version matrix (Node 24 LTS base for app/test; a Playwright image or a base with browsers installed at build time, version-matched to `@playwright/test` 1.64.1; `--no-sandbox` and SwiftShader flags for headless WebGL), pin every base tag, cache dependency layers, and make `docker compose run --rm verify` the single definition of done. Backfill STACK.md with the container section during Phase 1 so later phases do not re-derive it.
- **Byte-determinism of generated assets across host architectures.** `assets:verify` diffs regenerated output. Float formatting and GLB writer output should be stable within one image, but arm64 macOS Docker vs amd64 CI has not been verified. Decide whether determinism is claimed per-image or per-arch, and if the latter, compare hashes instead of bytes.
- **Node/Vitest browser-mode inside a container.** Vitest 5's `browser` project with the Playwright provider needs a browser binary and a display-less launch path inside the image; this is unproven here. Validate early in Phase 1 rather than discovering it in Phase 6.
- **`PROJECT.md` is stale on data filenames.** It names `commodities.plist`; current Oolite ships `trade-goods.plist`. Update it in Phase 1 and record the pinned Oolite commit.
- **Pin the Oolite snapshot.** "Latest master" is not reproducible and the file names have drifted. Choose a release tag/commit, vendor it under `content/oolite/`, and record it in `SOURCE.md` and `manifest.json`.
- **Material fidelity decision.** Approximate metallic-roughness vs a custom Oolite-style Phong material changes the look, not the pipeline. Preserve `gloss`/`shininess`/`specular_color`/`emission_modulate_color` in `extras` either way, then decide in Phase 3.
- **Coriolis dock geometry is MEDIUM confidence.** The model bbox (≈103 × 242 × 250) and the visible slit (≈192 × 64) disagree because Oolite widens the gate at runtime. Measure and assert in-engine during Phase 2/5.
- **v1 damage model for docking is undecided.** Bounce-only vs a small collision-only hull pool. FEATURES.md recommends (b) if schedule allows; decide in Phase 5 or docking loses its tension.
- **Version pins need a sanity pass at install time.** The stack file pins very specific current versions (TS 7.0.2 + 6.0.2 alias, Vite 8.3.5, Three 0.187.0, Vitest 5.0.5). Verify they resolve and that the TS dual-alias setup works in the container before Phase 1 exit.
- **Safari and integrated-GPU performance are unmeasured.** The v1 empty-space scene should be far under budget, but verify on the oldest supported machine before adding any v2 content.
- **Legal review.** Licence election and trademark usage are engineering-risk findings written by researchers, not counsel. Get a read before the first public post, not before launch.

## Sources

### Primary (HIGH confidence)
- **Oolite source, `github.com/OoliteProject/oolite` @ `master` (commit `7437f22`, read 2026-11-02)** — `LICENSE.md` (dual GPL-2.0-or-later / CC BY-NC-SA 3.0, sound and library carve-outs); `OOCommodities.m` (price/quantity/economic-bias, `MAIN_SYSTEM_MARKET_LIMIT 127`); `OOCommodityMarket.m`; `OOMesh.m` (`.dat` grammar, triangle truncation, UV normalisation, per-face normals); `DockEntity.m` (corridor, port dimensions, 1.5× safety, 90 % capture, scrape damage); `ShipEntity.m`/`ShipEntity.h` (`SHIP_THRUST_FACTOR 5.0`, rate setters, `moveForward:`); `PlayerEntity.m`/`PlayerEntityControls.m`/`PlayerEntityLoadSave.m` (start state, applyRoll:andClimb:, jump fuel/time, market persistence, save fields); `PlanetEntity.m`/`OOPlanetEntity.m` (`collision_radius = radius_km * 10`); `Universe.m` (system setup, market regeneration, station roll, fast-dock flag); `legacy_random.h` (0.4 LY integer-truncation distance); `GameController.h` (`MINIMUM_GAME_TICK 0.25`); `OOEntityStatus.tbl`.
- **Oolite `Resources/Config/`** — `trade-goods.plist` (17 commodities, peaks, decicredits), `equipment.plist` (positional tuples, prices, TLs, conditions), `shipdata.plist` (Cobra player template 350/32/1.0/2.0/20, Coriolis `station_roll 0.08`, `market_definition = ()`, subentities at z≈500.2561, alpha `emission_map`), `shipyard.plist` (prices in credits), `planetinfo.plist` (2048 systems keyed `galaxy system`, `radius` in km, `stations_require_docking_clearance = no`), `descriptions.plist`, `hud.plist`, `keyconfig.plist`.
- **Oolite `Resources/Models/`** — `oolite_cobra3.dat` (bbox ≈130×35×81), `cobra3_redux.dat` (legacy, 130×30×65), `oolite_coriolis.dat` (hull ≈1000×1000×996), `oolite_coriolis_dock.dat`, `new_coriolis.dat`.
- **Three.js r187 (2026-10-30)** — release notes; manual `webgpurenderer.html` ("still in an experimental state"; `WebGLRenderer` "recommended choice for pure WebGL 2 applications"); `docs/pages/WebGLRenderer.html.md` (WebGL2-only since r163); `src/renderers/WebGLRenderer.js` (`logarithmicDepthBuffer`, `reversedDepthBuffer`/`EXT_clip_control`); `src/core/Object3D.js` (float64 `matrixWorld` before float32 upload).
- **Vite 8 announcement (2026-03-12)** — Rolldown default, 10–30× builds, Node requirements.
- **Vitest 5 announcement (2026-09-03)** — Vite ≥6.4, Node ≥22.12, Browser Mode, exact peer pins.
- **TypeScript 7.0 announcement (2026-07-08)** — native compiler, no programmatic API in 7.0, official `@typescript/typescript6` + `@typescript/native` alias recipe.
- **MDN** — WebGL2 and WebGPU browser-compat data; Autoplay guide (audio gesture gating); Pointer Lock API; Page Visibility API; Storage quotas and eviction; WebGL best practices and `webglcontextlost`.
- **npm registry (2026-11-02)** — exact versions, licences, and unpacked sizes for `three`, `@types/three`, `vite`, `vitest`, `typescript`, `eslint`, `typescript-eslint`, `@playwright/test`, `@gltf-transform/core`, `zod`, `idb-keyval`, `fast-check`.
- **Gaffer On Games, "Fix Your Timestep!"** — accumulator loop, step clamping, interpolation alpha.

### Secondary (MEDIUM confidence)
- **Elite Wiki** — Trade-goods (abridged), Commodities.plist (old 8-bit formula obsolete since 1.81), Hyperspace Drive, Docking, How to Dock, Docking Computers, Docking Clearance Protocol (conflicts with shipped config), HUD, Oolite Keyboard Controls, Roll vs Yaw crusades (yaw added in v1.66), Oolite (non-Newtonian flight).
- **Oolite readthedocs / oolite.space starting guide** — F-key screen map, docked commands, Lave start and docking practice.
- **Frontier Developments, "Legal Notices"** — Elite, Elite logo, Cobra, Cobra logo are trademarks.
- **Wikipedia, "Oolite (video game)"** — GPL-2.0-or-later source, dual-licensed resources.
- **Footnote (confidence: MEDIUM, not authoritative)** — `@plist/openstep.parse` as a parser fallback (verify comment/trailing-comma/`yes`/`no` handling first).

### Tertiary (LOW confidence)
- **Prior art** — `atomic14/harmless`, `JamesRandall/webGLite`, `KeithTheDev/elite-js`, `0bOne/obelite`, `fesh0r/newkind` — design reference for classic-key defaults and docking feedback; not authority for numbers.
- **Community forum threads** (Oolite BB, JavaScript/Emscripten 2015; WebGPU Reboot 2023) — evidence that OXP support is the top community expectation; used only to inform positioning, not implementation.
- **Float32 precision write-ups** — "The Perils of World Space", WebGL Fundamentals precision lesson, Godot large-world precision, OVGrid floating-origin post — corroborate the ULP arithmetic; the architecture's own derivation is the operative artifact.

---

*Research completed: 2026-11-02*
*Ready for roadmap: yes — with the container layer treated as Phase 1 design work, not inherited research*
