---
phase: quick-261110-f2r
plan: 261110-f2r
subsystem: sim
tags: [determinism, tests]
status: complete
---

# Quick task 261110-f2r: close two blind spots of the replay harness

## What changed

- `serializeFlight` writes `compassMode` after `compass`, so `hashFlight`
  tells apart automatic tracking from a compass locked to the same target.
- `clampFrameDelta` (new, `src/sim/loop.ts`) holds a delta to
  `[0, MAX_FRAME_DELTA]` and throws `RangeError` for NaN or an infinity.
  `runToSteps` uses it, and so do the loop copies in
  `tests/sim/flight-cadence.test.ts` and `tests/sim/dock-cadence.test.ts`,
  which had the same upper-bound-only cap.
- `tests/sim/replay-integrity.test.ts` (new) covers both.

No player-visible change: the HUD reads the mode directly, the live loop in
`src/app/game-loop.ts` already clamped, and the compass mode is not part of
the save. No CHANGELOG entry for that reason. No stored hash had to change:
the cadence tests compare hashes within a run.

## Verification

Run in Docker: `lint` and `typecheck` passed; `docker compose run --rm test`:
104 files, 1381 tests passed, 1 skipped. No browser test was run: nothing the
browser loads changed apart from one extra line in a string that only the
tests hash.
