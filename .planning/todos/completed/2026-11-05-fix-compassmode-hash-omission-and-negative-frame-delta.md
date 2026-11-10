---
created: 2026-11-05T18:08:24+01:00
title: Fix compassMode hash omission and negative frame delta
area: testing
severity: minor
files:
  - src/sim/flight/state.ts:118-141
  - src/sim/loop.ts:42
  - tests/sim/flight-cadence.test.ts:69
---

## Problem

`serializeFlight` omits `compassMode`, so two states with the same
`compassTarget` but different compass modes hash equal even though the next
`cycleCompass` behaves differently. The omission is a replay/hash blind spot,
not a current gameplay bug: the HUD reads `state.compassMode` directly.

`runToSteps` uses `Math.min(delta, MAX_FRAME_DELTA)`, which only caps the upper
bound. Negative or non-finite frame deltas subtract from the accumulator and
corrupt replay. The live loop in `src/app/game-loop.ts:42` already clamps with
`Math.min(Math.max(delta, 0), MAX_FRAME_DELTA)`, so this affects the replay
harness and the flight-cadence test helper only.

## Solution

Include `compassMode` in `serializeFlight` and add a regression test proving two
states with different modes hash differently.

Clamp `runToSteps` deltas to `[0, MAX_FRAME_DELTA]` and reject non-finite
values; mirror the fix in `tests/sim/flight-cadence.test.ts`. Do this before
Phase 6 persistence/replay work and before the code-guidelines skill codifies
the determinism rule.
