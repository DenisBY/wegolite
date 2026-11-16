---
phase: 14-npc-flight-and-steering-fidelity-gate
review: 14-REVIEW.md
recorded: 2026-11-16
---

# Phase 14 code review disposition

Every finding of `14-REVIEW.md` (0 critical, 4 warning, 6 info) is recorded here. All were `open`
at the close of plan execution. On 2026-11-16 the owner asked three independent models (Fable, Opus,
Sonnet) to verify each finding against the source and approved this triage: WR-01, WR-02 and WR-04
fixed, WR-03 comment corrected, the rest deferred or waived. The three models agreed on every
verdict except WR-04 (Opus: fix now; Fable and Sonnet: defer); the owner chose to fix it.

| ID | Severity | Disposition | Note |
|----|----------|-------------|------|
| WR-01 | warning | fixed | `massFor` now shares `isUsable` with `statsFor`: an unusable flight row is skipped and the Phase 12 masses answer (test in `tests/sim/npc/flight.test.ts`) |
| WR-02 | warning | fixed | `isUsable` requires `isMountKey(forwardWeapon)`, so an unknown weapon falls the whole row back to the defaults |
| WR-03 | warning | waived | Hardening (hash pin, proxy filter) waived: dev-only, operator's own checkout, and a proxy filter would not close the escape through injected host globals. The misleading `load.ts` header sentence was corrected |
| WR-04 | warning | fixed | Schema bounds roll and pitch at 1e3 and speed and thrust at 1e12, pinned equal to the sim limits by a test; `maxFlightSpeed` stays non-negative because Oolite authors speed-0 hulls (buoys). Generated data and hashes unchanged |
| IN-01 | info | waived | Deliberate, recorded divergence marker |
| IN-02 | info | deferred | Todo: docblock note on `stepWorld` (or a `dt === DT` assert) - see `.planning/todos/pending/2026-11-16-phase-14-review-followups.md` |
| IN-03 | info | waived | Fails closed; `dist/` has no symlinks |
| IN-04 | info | deferred | Todo, owner decision: add `test:acceptance` to `verify-full` or a scheduled run, or document when to rerun |
| IN-05 | info | deferred | Residual risk 6 for the owner; detectors are frozen (needs the `Detector-change-approved-by-owner` trailer) |
| IN-06 | info | waived | Rejected on purpose: resetting `steer` at the fault site changes hashed fields for faulted entities. Deterministic and harmless today |
