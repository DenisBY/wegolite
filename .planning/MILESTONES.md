# Project Milestones: Wegolite

## v2.2 Weapons and NPC Flight (Shipped: 2026-11-16)

**Phases completed:** 2 phases, 35 plans, 87 tasks

**Key accomplishments:**
- `begin()` now ends the world and clears the leg anchor on every refused arrival, proven by a controller-level scenario at epoch 4,294,967,294, and a mass-lock stop of a running torus drive prints Oolite's "Hyperspeed mass-locked."
- INPUT-01 key migration: P alone pauses, R is ident, U untarget, Q target station, 1-4/F1-F4 are the four view commands in flight, A is a held fire field, Escape is an inert eject in flight, and saved legacy bindings migrate without losing customised keys.
- Oolite's laser hit rule ported into the pure sim: a float64 line-by-line port of the octree line test (visiting order, leaf-centre distance) and the two-stage nearest-ship search, with hull data supplied by the caller.
- A separate, lazily loaded `ships-hulls.json` carries the octrees and collision radii of the Cobra Mk III and the nine NPC hulls, compiled at build time with the existing `buildOctree` and `hullRadius`, behind a strict iterative-walker schema, a 200,000-byte gate and a golden digest.
- The pure player combat core: a ledger of Oolite's combat numbers pinned to the compiled content, laser gating, heat and cut-out in integer ticks, Oolite's shield and energy recharge, damage routing with cabin heat, cabin cooling, and a player combat state with its dock and launch resets, sanitiser and canonical text.
- Laser mounts persist: `PlayerProfile.laserMounts` starts on the Cobra's fore pulse laser, and the save format moves from v3 to v4 through one ordered, golden-pinned step that older saves and older builds both handle safely.
- Every world ship now has a hashed, sanitised and snapshotted energy bank (energy, maxEnergy, energyRechargeRate) taken from its NPC record with Oolite's defaults 200 and 1.0, starting full; the world snapshot moved to version 2 and the inert Lave golden was regenerated once, with the population draws proven unchanged.
- A held fire key now travels from the player controller through `stepSim` to Oolite's two-stage hit rule and drains an NPC's energy (fore pulse, Adder 85 to 70), with views selecting the facing, bookkeeping and the DOCK-10 resets following Oolite, and the combat state hashed only when it is not pristine so no pinned hash moves.
- Lasers can be bought per facing at F3 through a separate allow-listed money path with Oolite's price, tech-level and trade-in rules, a facing selection screen, and F5 listing each fitted laser.
- `ShipControl.fire` queues a shot on a world fire queue that `resolveShots` drains after the world step, so a scripted test pilot hits the player (forward or aft shield first, then energy and cabin heat) and other ships by the same two-stage hit rule and the same damage function as the player's own shots; NPC energy recharges at its record's rate, and a combat scenario hashes identically at 30, 60 and 144 Hz.
- The live session now steps combat: it creates a pristine combat state beside every flight state, passes the profile's laser mounts, the lazily loaded hull table and the NPC weapon map to `stepSim` as read-only options, hashes with combat in the probe, and the Node replay mirrors all of it; the traffic-on cold start with the hull chunk measures 8,855,706 bytes against the 9,437,184-byte ceiling.
- The flight HUD's FWD and AFT shields, four energy banks, laser temperature and cabin temperature now read the live combat state inside the unchanged eleven-element layout, and refused shots and ident events post Oolite's messages through a per-kind one-second gate; the ident lock text is one constant, name only, with D-03 PENDING OWNER CONFIRMATION.
- The player now sees the four cockpit views from the Cobra's Oolite view positions, every laser shot as a 0.09 s line in the laser's Oolite colour (one draw call, none when idle), and a corner-bracket frame around the ident-locked ship in the 3D view, all inside the unchanged eleven-element HUD.
- A `?test=1` hook now puts a firing Viper in the player's sights so shield loss is observable in the browser (one opt-in smoke: A heats the laser, the forward shield falls, R locks the ship), every ported combat mechanic has a FIDELITY row with a verbatim pinned excerpt, thirteen Key Decisions rows record the phase's remaining choices, and the validation is signed off with `verify-full` honestly open.
- R locks the nearest ship in the sights of the current view (25,500 m, sphere test on the collision radius, strict nearest, lower id on a tie), U drops the lock, a lock is lost beyond 25,600 m or when its ship is gone, and the target id is cleared at dock, jump commit and new sessions; D-03 and D-04 are recorded as advisor-recommended deviations PENDING OWNER CONFIRMATION, each with its exact one-place literal alternative.
- An independent, source-cited oracle for the NPC flight model and the idle, tumble, fly-to, fly-from and face behaviours: a strict fixture schema, float32-emulating reference maths transliterated from the pinned Oolite source, 32 fixtures, and a guard that keeps the tree free of Wegolite code.
- An independent, source-cited oracle for intercept, flee and the attack dispatcher with its in-scope sub-behaviours: 79 fixtures re-derived by a self-contained transliteration of the Oolite steering code, with the perform draws, the tracking-curve aim point and every frustration tick pinned.
- The nine NPC ship records now carry Oolite's max flight speed, roll, pitch and thrust as float32 (compiled from the vendored shipdata.plist with Oolite's 160 / 2.0 / 1.0 / 15.0 defaults), and the content build refuses any record that authors one of the six keys the steering port's reachability analysis assumes absent.
- The unmodified `oolite-priorityai.js` and `oolite-shuttleAI.js` run in two `node:vm` contexts against a recording stub host, wake on the engine's real `AIScriptWakeTime` / `aiAwoken` protocol, and give deterministic traces over a calm, a hostile and a reconsider-timing fixture, with the harness fenced out of `src/` and `public/` by a guard.
- `BodyView.radius` (the collision radius in metres) on every body the world view returns, from the entity, the layout or a new `playerRadius` argument, copied on every path and pinned per body kind, so the steering ports of plans 14-12 and 14-13 can read it.
- The recorded 1/120 s frame-rate rule with its cross-step tolerance committed before measurement, a ten-pose 1/60 versus 1/120 grid that agrees within it everywhere, and independent source-cited fixtures and reference code for avoid collision, the proximity zone and escort.
- `npm run check:dist` fails any `verify`, `verify-full` or Pages build whose bundle contains the dev-only AI harness or the AILib code (three markers, source maps skipped, exit 2 on a missing or empty `dist`), and `tests/acceptance/thresholds.ts` fixes the 20-seed acceptance criteria, the start placement with its designed near pass and the pre-declared escalation in a single commit ahead of the steering port.
- Every dynamic entity now carries one frozen plain-data steering record (`Entity.steer`), hashed as an always-present last `;steer:` segment, repaired by the sanitiser before every hash and snapshotted under `WORLD_SNAPSHOT_VERSION` 3, with the inert Lave golden regenerated exactly once (fnv `ab72eedf` to `c1068643`) and proven to differ only by that segment.
- `steerShip` runs Oolite's flight model (stick slew, attitude step, thrust ramp with the hyperspace decay) plus IDLE, STOP_STILL, STATION_KEEPING and TUMBLE through `ShipControl.perform`, and all 17 flight-model, idle and tumble oracle fixtures pass through a synthetic `WorldView` with every scripted draw consumed exactly.
- `trackDestination`, fly to destination (range dispatcher, to, from) and face destination are ported line by line and match every fly-to-destination, face-destination and rate-rule oracle fixture, with their three events posted as queued AI events and the recorded frame-rate rule confirmed at both 1/60 s and 1/120 s.
- A ship given INTERCEPT_TARGET now closes on its target with Oolite's primary-target steering: validity, range, aspect and loss as Oolite reads them, a literal `trackPrimaryTarget`, and a reaction-time tracking curve restarted by `setTarget`, started by the world step at the think tick and sampled every 60 ticks; all nine independent intercept fixtures pass first time.
- A native NPC ship now turns away from a proximity alert and resumes its saved task, flees its target with Oolite's retreat jink and its performFlee entry draws, and switches into the evasive behaviours exactly where Oolite does; all ten independent flee fixtures pass first time, with their draws consumed exactly.
- A native NPC ship assigned ATTACK_TARGET now picks and flies Oolite's attack sub-behaviours (fly to and from target, six and twelve, sniper, break-off, slow dogfight) without firing; all 60 independent attack fixtures pass with their draws consumed exactly, and the unarmed Shuttle's zero weapon range makes it alternate ATTACK_TARGET and ATTACK_FLY_FROM_TARGET every tick as Oolite's does.
- Steered NPC ships now warn each other, the station and the player through a once-per-tick proximity pass using Oolite's pair trigger and `setProximityAlert:`, avoid and resume as Oolite's `behaviour_avoid_collision:` does, and fly in the default V formation behind a leader whose world-step update refreshes its followers; all eight avoid and escort fixtures pass the first time they were run, and a static coverage test now proves that every fixture of both oracle trees is assigned to exactly one oracle test file and that only the out-of-scope ids take the idle fallback.
- A test-only `flight-script` AI key now assigns the native behaviours (station, intercept, flee, attack, escort, face) through `ShipControl` alone, `spawnTestFlyers` puts a Shuttle, a Viper and an Adder 3,000 m from the player, and in a 60 s Lave scenario the Shuttle reaches 2,500 m from the station, the Viper closes to 1,495 m of the player and the Adder opens the range to 17.2 km; with the three flyers active across a launch the world hash replays identically at 30, 60 and 144 Hz.
- A frozen acceptance harness (seed set-up, ten detectors, run minimums, a ten-line entry file behind a byte-for-byte gate) ran the 20 Lave epochs of the NPC flight port against the thresholds committed before the port: 21 of 21 cases pass in 137.6 s with an empty accepted-crossings list, zero of every failure counter on every seed and every run minimum met.
- The live session and the Node replay now hand the same `flightTableFrom` table to every step, the `?test=1` hook `spawnTestFlyers()` puts a Shuttle flying to the station, a Viper intercepting and an Adder fleeing into the world (tainting first), and one opt-in Chromium smoke shows them on the scanner, within the draw-call budget and equal, hash for hash, to the Node replay 1,200 ticks later.
- The Phase 14 decisions, fourteen contract-checked FIDELITY rows and the fidelity report are on record, and the report was accepted on 2026-11-16 by an owner-delegated review panel (not by the owner reading it), which chose the dev-only differential harness as the oracle for the AI port; AI-01, WORLD-07 and AI-11 are marked complete.

---

## v2.1 World Population Base (Shipped: 2026-11-14)

**Phases completed:** 4 phases, 27 plans, 27 tasks

**Key accomplishments:**
- AssetCache.loadNpcModel loads the nine Oolite NPC models on demand (memoised, path-guarded, freed by dispose), and a request-log browser test proves a cold start fetches none of the 9 GLBs or 43 textures while transferring 8,834,862 bytes under the unchanged 9,437,184-byte ceiling.
- Float32 port of Oolite's hull octree and its mass composition (hull plus ordered non-flasher subentity sum), bit-exact on all 16 vendored meshes: Cobra Mk III 214,737.6875, Coriolis station 515,483,904, navigation buoy 698,691.1875.
- The nine NPC records, the player Cobra Mk III and the Coriolis station now carry Oolite's float32 mass (Viper 34,040.6796875, Cobra 214,737.6875, Coriolis 515,483,904), required by the strict schema, pinned by a hand-written golden and the drift gate, and entered in FIDELITY.md's constants ledger with NOTICE provenance.
- Jump blockage now uses Oolite's computed Coriolis mass 515,483,904 (radius 7,179.7 m instead of 6,747.0 m), pinned to the compiled record by a test, with the owner's three answers recorded.
- The navigation buoy's computed mass, 698,691.1875, is compiled into ships-client.json as a third `buoy` entry, pinned by a test and covered by NOTICE, and every record and browser-test comment now agrees with the owner's answers.
- `WorldLifecycle.anchorNextEntityId` exposes the post-populate id counter of the leg's world, and the mix32 cross-check vector plus a real v2 writer golden are pinned before the first v3 write.
- Saves are now strict schema v3: every v2 field plus a required leg-anchor `epoch` and `nextEntityId`, written from the live world lifecycle, with v1 and v2 saves loading through the ordered v1 -> v2 -> v3 chain to epoch 0 and counter 101.
- Warm Load and cold Continue now re-anchor the world lifecycle at the saved epoch before an in-flight resume, so a loaded v3 save rebuilds exactly the world a fresh arrival at its anchor builds; the v3 bounds, writer gate, older-build inertness and the 40,427-character worst case are pinned at the reader.
- The two browser specs now assert a version-3 manual save and treat version 4 as the newer build, the changelog and Key Decisions record the v3 format and its compatibility break, and the owner-chosen `verify-full` gate exited 0.

**Closeout:** override_closeout. Phases 9-11 verification reads `stale` (later phases changed files their reports cover); every VERIFICATION.md and the milestone audit are `passed`. Known verification overrides: 3 newly acknowledged todos (WR-01, buoys block hyperspace, measure the Oolite reference in Docker), 16 carried forward. No release tag: the project's release tags (`v0.x.0`) are separate from GSD milestones.

---

## v2.0 Foundation (Shipped: 2026-11-13)

**Delivered:** v1 play unchanged on a multi-entity world core: `game-session.ts` split into typed controllers, stable per-world entity ids, seeded per-entity streams, a world hash, restorable test snapshots, a typed `WorldView`/`ShipControl` AI seam and a tick-stepping test hook. No player-visible feature ships in this milestone.

**Release:** no release tag at close (owner decision: milestone versions are not git tags; releases stay semver). The latest release is `v0.3.0`; Phase 8 work is on `main` after it.

**Scope:** narrowed on 2026-11-13 from Phases 8-23 to Phase 8 alone; Phases 9-23 and their 55 requirements are the unscheduled v2.1 Combat & Traffic (see PROJECT.md Key Decisions).

**Phases completed:** 8 (16 plans, 36 tasks); requirements FOUND-10 to FOUND-14, 5/5 complete.

**Key accomplishments:**
- `createGameSession` split in nine verified steps into a typed `SessionState` and controllers (render, chart, settings, station, save, hyperspace, event router, sim driver, frame loop), leaving a 532-line facade with the same exports and an unchanged probe shape
- Multi-entity world in `src/sim/world`: fixed ids for the five static bodies and the player (100), monotonic per-world dynamic ids from 101, a binary-search store, and a world hash that equals the v1 flight hash until the first spawn
- Determinism base: plain-data mulberry32 `RngState`, owner-confirmed `mix32(marketSeed, epoch)` world seeds and forked per-entity streams, and lint bans on unseeded randomness, wall clock, `for..in` and bare sort in `src/sim`
- Typed AI seam: read-only `WorldView`, write-only `ShipControl`, integer-tick timers, a frozen registry with a scripted test pilot, and an id-ordered world step with a bounded FIFO AI event queue
- Strict snapshot codec: a restored world stays bit-identical to its live twin for 1,000 ticks, and the world hash matches at 30, 60 and 144 Hz
- Test hook `advanceTicks`, `worldHash` and `probe.sim`: a browser run, a Node replay and the real sim driver read the same hash after a launch and 600 ticks

**Stats:**
- 1 phase, 16 plans, 36 tasks; 5 v2.0 requirements, all complete
- 85 files changed in `src/` and `tests/` (+26,612 / -3,256); about 32,000 lines of TypeScript in `src/` at close
- 2,407 unit tests and 128 Chromium specs green under `verify-full`; UAT passed; security 60/60 threats closed (2 accepted risks)
- 3 days, 2026-11-11 (phase context) to 2026-11-13 (close)

**Git range:** `fb40195` (docs(08): capture phase context) to `73341ab` (docs(phase-08): close 1 resolved todo(s)), 92 commits.

**Archive:**
- `milestones/v2.0-ROADMAP.md` (full roadmap at close, including the v2.1 phase details)
- `milestones/v2.0-REQUIREMENTS.md` (FOUND-10..14 complete, plus the 55 v2.1 requirements with their phase mapping)
- Phase directory `phases/08-session-split-and-world-core/` stays in place, as v1.0's phases did

**Pre-close audit (`audit-open`, 2026-11-13):** 20 items open. One (quick task `261104-p2m`) was already complete and cleared once its SUMMARY frontmatter YAML was fixed. Known verification overrides: 19 newly acknowledged, 0 carried forward from a prior close (see STATE.md Deferred Items): 8 debug sessions, 2 UAT files (phases 01 and 04), 6 pending todos and 3 deferred items (Phase 7 Safari wording; Phase 8 D-1, already fixed in the specs; Phase 8 D-2 flakes).

**Known issues carried forward:**
- WR-01: a throwing AI module is not contained by the world step; fix before Phases 12, 13 and 22
- Intermittent e2e flakes under host load (D-2, `hyperspace.spec.ts:194`, probe-shape in-flight state)
- `08-VALIDATION.md` is still a draft (Nyquist audit not run)
- QUAL-01 (60 fps evidence) stays deferred to v2.1 Phase 23

**What's next:** `/gsd-new-milestone` for v2.1 Combat & Traffic.

---

## v1.0 Wegolite v1 Core Loop (Shipped: 2026-11-08, archived 2026-11-10)

**Delivered:** A browser-only, faithful reimplementation of Oolite's core single-player loop: launch from Lave's Coriolis station, fly the Cobra Mk III, dock manually or with a docking computer, trade at station markets, hyperspace on fuel, and save or resume in IndexedDB.

**Release:** first public release tagged `v0.1.0` (commit 0693e17), 2026-11-08.

**Phases completed:** 1-7 (73 plans total: 7 + 9 + 14 + 8 + 6 + 17 + 12)

**Key accomplishments:**
- Docker-only workflow with a fixed 1/120 s deterministic simulation step and a camera-relative render path proven at 1.4e6 m
- Build-time content pipeline: pinned Oolite snapshot compiled into typed content (2,048 systems, 17 commodities, ships, equipment, GLB models) behind a drift gate
- Manual docking with a corridor derived from the Coriolis dock geometry, auto-centring, a bounce and scrape model, and a `Shift+C` docking computer
- Oolite economy-only market formula, 20 t hold rules and the F8/F3/F5/F7 keyboard-driven station screens
- F6 galactic chart, fuel-gated hyperspace countdown, and versioned saves that resume docked or in flight with market stock preserved
- Hardening: context-loss recovery, tab-throttle proof, FIDELITY.md with 26 mapped mechanics, licensing audit, and a core-loop journey test

**Stats:**
- 7 phases, 73 plans, 68 v1 requirements (67 complete, 1 open: QUAL-01)
- 7 days from the first phase (2026-11-02) to the release (2026-11-08)

**Git range:** `v0.1.0` (commit 0693e17) is the release point. The first and last phase commits were not re-derived for this entry.

**Archive:**
- `milestones/v1.0-ROADMAP.md` (full phase details at close)
- `milestones/v1.0-REQUIREMENTS.md` (full v1 list and traceability)

**Known Gaps (open at close, proceeded with by owner decision):**
- QUAL-01: 60 fps at 1080p on mid-range desktop hardware. Deferred by the owner on 2026-11-08. Still open. Not marked done.

**Pre-close audit (`audit-open`, read-only, 2026-11-10):** 16 items reported open, none acknowledged in this close. Debug sessions: 8 open. UAT gaps: 2 phases (01-UAT.md, 04-UAT.md), each with 0 pending scenarios. Quick task `261104-p2m` incomplete. Pending todos: 4 (all dated 2026-11-10). Deferred item: Phase 7 Safari wording in the WebGL2 fallback message. These items are carried forward unacknowledged. Acknowledging them, or resolving them, is a later decision.

**Carried forward:**
- Pending todos in `.planning/todos/pending/` (4)
- Quick tasks in `.planning/quick/` (not archived; archiving is opt-in)
- Phase directories in `.planning/phases/` (not moved)
- Work after the `v0.1.0` tag is recorded as quick tasks in `STATE.md` and is not part of this milestone

**What's next:** The next milestone is not yet defined. Start it with `/gsd-new-milestone`. Candidates are the v2 requirements in `REQUIREMENTS.md`, plus QUAL-01 as a frame-rate evidence task on the reference desktop.

---
