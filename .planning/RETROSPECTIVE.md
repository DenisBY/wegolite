# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

v1.0 (Phases 1-7) closed before this file existed; its record is in `MILESTONES.md` and `milestones/v1.0-*`.

## Milestone: v2.0 — Foundation

**Shipped:** 2026-11-13
**Phases:** 1 | **Plans:** 16 | **Sessions:** not tracked

### What Was Built
- `game-session.ts` split in nine gated steps into a typed `SessionState` and controllers, leaving a 532-line facade with the same exports and an unchanged probe shape
- A multi-entity world in `src/sim/world` with per-world ids, seeded per-entity streams (`mix32` derivation), a world hash equal to the v1 flight hash until the first spawn, and a strict snapshot codec
- A typed AI seam (`WorldView`, `ShipControl`, integer-tick timers, a scripted test pilot) and an id-ordered world step with a bounded AI event queue
- A tick-stepping test hook (`advanceTicks`, `worldHash`, `probe.sim`) with browser/Node hash parity

### What Worked
- Safety nets before the refactor: the frozen probe shape, pinned v1 flight hashes and a recorded verify-full baseline (plan 08-01/08-02) made every split step checkable as green or red on its own merits
- One step per commit, with a gate on each, and verify-full on a detached worktree at the risky steps (D-12); no split step had to be reverted
- Narrowing the milestone to Phase 8 (2026-11-13) after three independent model reviews; it removed speculative persistence (Phase 11) and phases with no consumer (9, 10)
- Recording each divergence from Oolite as a Key Decisions row with source citations as it was made, rather than at the end

### What Was Inefficient
- The phase base was red: two stale e2e assertions (D-1) from an unrelated redesign commit were found only by the 08-01 baseline, so the gates could not be read until they were fixed
- Flaky e2e specs under host load (D-2 and two more seen in 08-16) cost reruns of the slow verify-full gate on an already slow machine
- The milestone was planned as 16 phases and then cut to one, so the roadmap, requirements and decisions written for Phases 9-23 needed a scope rewrite in the middle of execution
- The Nyquist validation (`08-VALIDATION.md`) was left as a draft

### Patterns Established
- A frozen observable contract (probe shape, flight hashes, golden vectors) is pinned before any structural refactor, and changes to it come only in one deliberate, announced commit (D-13)
- Determinism rules live in lint (`src/sim` bans on unseeded randomness, wall clock, `for..in`, bare sort) and in source-scan guards, each proven by a negative control
- Seams with no production consumer yet are labelled provisional in the roadmap and PROJECT.md until a later phase exercises them
- Gate choice follows the change type: pure `src/sim` work runs test, lint and typecheck; browser-facing work runs verify; verify-full only at the gated steps and for release

### Key Lessons
1. Run the full gate on the phase base before the first change; a red base hides every later signal.
2. Make e2e assertions latch on events instead of polling one-frame values; otherwise slow hosts turn them into flakes.
3. Cut scope at the first point where the next phases have no consumer; a provisional seam is fine if it is labelled and has a named phase that will prove it.
4. Contain errors at a seam (WR-01) before the first real module plugs into it, not after.

### Cost Observations
- Model mix: not tracked
- Sessions: not tracked
- Notable: on this slow machine verify-full dominates wall time, so the policy of running it only at the gated steps (D-12) saved the most time

---

## Milestone: v2.1 — World Population Base

**Shipped:** 2026-11-14
**Phases:** 4 | **Plans:** 27

### What Was Built
- NPC content: nine role ships compiled from Oolite with provenance, lazy-loaded outside the first load.
- Ship mass: a float32 build-time hull octree, bit-exact on 16 meshes; jump blockage uses the computed Coriolis mass.
- Save schema v3: world epoch, counters and next entity id; NPCs regenerated at the leg anchor, never saved.
- Inert world lifecycle: 12 inert ships drawn and on the scanner, counted by mass lock and blockage, cleared at jump commit and repopulated on arrival, world running behind the chart.

### What Worked
- Scope kept to "the technical minimum" (inert ships, no AI or combat); the audit found 12/12 requirements and no blockers.
- Staged requirements (DATA-11, SAVE-08) let early phases pin fields and semantics before the phase that completes them.
- Containing the AI fault and refusing malformed spawns in Phase 12's first plan, before the populator existed.

### What Was Inefficient
- Later phases edited files covered by earlier VERIFICATION.md reports, so phases 9-11 read `stale` at close and needed an override.
- Phase 12 took 14 plans; the browser check was left to UAT at the end.

### Patterns Established
- The simulation never depends on render assets: mass lock, blockage and the scanner read the world and compiled masses only.
- Owner decisions on fidelity differences (Coriolis mass) are recorded as Key Decisions with the Oolite source cited.

### Key Lessons
1. Check cross-phase file ownership when verifying early phases; re-verify at milestone end or accept stale reports explicitly.
2. A one-line invariant hole (WR-01: end() before begin()) is cheaper to fix in the phase than to carry as a todo.

### Cost Observations
- Model mix: not tracked
- Sessions: not tracked
- Notable: verify-full remains the dominant cost on this machine

---

## Milestone: v2.2 - Weapons and NPC Flight

**Shipped:** 2026-11-16
**Phases:** 2 | **Plans:** 35

### What Was Built
- Views, lasers and shields: four cockpit views, lasers bought per facing that hit ships by their Oolite octree hull, shields and energy banks with a live HUD, docking resets, Oolite's Escape/P/R bindings, save schema v4 (laser mounts) and the FOUND-17 fix (a refused arrival no longer keeps the origin world).
- NPC flight and steering: Oolite's flight model and nine native behaviours ported from an independent source-cited oracle (139 fixtures, 1,015 checks), a frozen `Entity.steer` record in the world hash (snapshot v3), a frozen 20-seed acceptance run (21/21), and a dev-only AILib spike kept out of `dist` by `check:dist`.

### What Worked
- An oracle written independently of the port, with the thresholds committed before the port: the 139 fixtures passed first time on the later behaviours, and the acceptance run could not be tuned after the fact.
- Re-verifying the earlier phase at close (Phase 13) instead of overriding the stale report: one verifier run, no regression, a clean closeout.
- Having three of the owner's own models (Fable, Opus, Sonnet) triage the review findings independently; they agreed on nine of ten and Fable caught one the reviewer missed.

### What Was Inefficient
- Two owner checkpoints (14-17, 14-19) were answered by a model panel while the owner slept, and the verifier correctly held the phase at `human_needed` until the owner ratified them the next day.
- Executors took many hours per plan on the slow remote gate; a wrong spec assertion (14-18) and a guard failure from a doc comment (14-11) each cost a rerun.
- The 20-seed acceptance run is in no gate, so its protection depends on a manual rerun rule (recorded in `AGENTS.md`).

### Patterns Established
- Delegating a reversible owner checkpoint requires unanimity of the panel, a stop on disagreement or irreversible risk, and explicit ratification before the phase closes.
- Schema bounds that mirror runtime domains are restated in content with a test pinning equality, because content never imports the sim.
- Frozen test harnesses change only with an owner trailer; known weaknesses are waived in `WINDOWS.md` with a reason, not edited silently.

### Key Lessons
1. A later phase that edits files an earlier phase covers makes that phase `stale` at close; re-run the verifier then, it is cheaper than an override.
2. A silent fallback (stats rows that fail a domain check fall back to defaults) needs the same bounds at build time, or bad data flies unnoticed.
3. Acceptance evidence that no gate re-runs decays; either put it in a gate or write the rerun rule down.

### Cost Observations
- Model mix: not tracked
- Sessions: not tracked
- Notable: verify-full (about 9-10 minutes on the remote machine) stays the dominant gate cost

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Sessions | Phases | Key Change |
|-----------|----------|--------|------------|
| v1.0 | not tracked | 7 | Docker-only gates, deterministic fixed-step simulation, content compiled from Oolite configs |
| v2.0 | not tracked | 1 | Safety nets before refactoring, gate by change type, scope cut to one phase mid-milestone |
| v2.1 | not tracked | 4 | Technical-minimum scope, staged requirements, simulation independent of render assets |
| v2.2 | not tracked | 2 | Independent oracle plus frozen thresholds, delegated owner checkpoints with ratification, re-verify instead of override |

### Cumulative Quality

| Milestone | Tests | Coverage | Zero-Dep Additions |
|-----------|-------|----------|-------------------|
| v1.0 | not recorded | not recorded | not recorded |
| v2.0 | 2,407 unit, 128 Chromium specs | not recorded | 0 (no new npm packages) |
| v2.1 | 132 Chromium specs (unit count not recorded) | not recorded | 0 |
| v2.2 | 4,997 unit tests in 203 files | not recorded | 0 (no new npm packages) |

### Top Lessons (Verified Across Milestones)

1. Determinism is protected by tooling (lint bans, pinned hashes, guards), not by review alone.
2. Flaky browser specs under load recur; treat them as a hygiene backlog item rather than rerunning indefinitely.
