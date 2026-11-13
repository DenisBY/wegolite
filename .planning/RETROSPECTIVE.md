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

## Cross-Milestone Trends

### Process Evolution

| Milestone | Sessions | Phases | Key Change |
|-----------|----------|--------|------------|
| v1.0 | not tracked | 7 | Docker-only gates, deterministic fixed-step simulation, content compiled from Oolite configs |
| v2.0 | not tracked | 1 | Safety nets before refactoring, gate by change type, scope cut to one phase mid-milestone |

### Cumulative Quality

| Milestone | Tests | Coverage | Zero-Dep Additions |
|-----------|-------|----------|-------------------|
| v1.0 | not recorded | not recorded | not recorded |
| v2.0 | 2,407 unit, 128 Chromium specs | not recorded | 0 (no new npm packages) |

### Top Lessons (Verified Across Milestones)

1. Determinism is protected by tooling (lint bans, pinned hashes, guards), not by review alone.
2. Flaky browser specs under load recur; treat them as a hygiene backlog item rather than rerunning indefinitely.
