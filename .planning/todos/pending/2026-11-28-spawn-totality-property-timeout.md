---
created: 2026-11-28T09:45:00.000Z
title: Stop the populateSystemWorld totality property from timing out under full-suite load
area: tests
severity: low
files:
  - tests/sim/world/population/spawn.test.ts
---

## Problem

`tests/sim/world/population/spawn.test.ts` > "populateSystemWorld totality (fast-check) > never throws,
never leaves a partial group and never exceeds a limit" (`:960`) failed once with
`Test timed out in 5000ms` in a remote `verify` run on snapshot `a8544b3b` (2026-11-28, Phase 22.1
info-fix pass). The same file run alone on the same snapshot passed, the property in 934 ms, and the
next full `verify` on the same snapshot was green (10,857 tests). No change in that pass touched
`src/sim/` or the test.

So the property runs close to the default 5 s Vitest timeout when the suite saturates the remote
machine: a flake that can fail the gate without a defect. The memoised `solve` search the property
calls on every run is the likely cost.

## Solution

1. Measure the property's time under load (for example a full remote `test` run with
   `--reporter=verbose`, a few times) to see how close it runs to 5 s.
2. Pick one, with the reviewer models (test decision by model consensus):
   - give this one `it` an explicit timeout (for example 20 s) with a comment naming the cause; or
   - lower `numRuns` or the arbitraries' sizes, if that keeps the property's coverage; or
   - make the `solve` check cheaper.
3. Do not raise the global `testTimeout`.
