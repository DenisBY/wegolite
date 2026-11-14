# Project Milestones: Wegolite

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
