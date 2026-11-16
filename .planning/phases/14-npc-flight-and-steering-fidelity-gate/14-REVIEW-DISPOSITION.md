---
phase: 14-npc-flight-and-steering-fidelity-gate
review: 14-REVIEW.md
recorded: 2026-11-16
---

# Phase 14 code review disposition

Every finding of `14-REVIEW.md` (0 critical, 4 warning, 6 info) is recorded here. All are `open`
at the close of plan execution: the review is advisory and the orchestrator did not fix anything
during the unattended run. The owner triages them; none was waived.

| ID | Severity | Disposition | Note |
|----|----------|-------------|------|
| WR-01 | warning | open | `massFor` lacks the finite-and-positive guard that `statsFor` has (`src/sim/npc/stats.ts:174`) |
| WR-02 | warning | open | `statsFor` does not validate `forwardWeapon`; an unknown key throws inside steering |
| WR-03 | warning | open | AI harness loader: no checksum on `OOLITE_SRC` files; host realm leaks through the proxy. Dev-only |
| WR-04 | warning | open | Content schema accepts flight constants the runtime bounds then reject; speed 0 accepted |
| IN-01 | info | open | `if (!SHIPS_ARE_CREWED)` guards a constant `true` (necessity finding) |
| IN-02 | info | open | Tracking-curve clock tied to `TICKS_PER_SECOND` |
| IN-03 | info | open | `check:dist` follows symlinks; fs error exits 1 like "marker found" (fails closed) |
| IN-04 | info | open | The 20-seed acceptance run is in no gate |
| IN-05 | info | open | Frozen detectors cannot see a permanently idle attack/escort/face flyer; a fix needs the owner's `Detector-change-approved-by-owner` trailer (see also WINDOWS.md #3) |
| IN-06 | info | open | A flyer whose AI faults keeps stale steering state in its hash (deterministic, harmless today) |
