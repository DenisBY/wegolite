# Project Milestones: Wegolite

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
