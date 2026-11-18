---
created: 2026-11-17T18:00:00.000Z
title: Stop the content-boundary probe file from racing the explosions import test
area: tests
severity: minor
files:
  - tests/guards/content-boundary.test.ts
  - tests/content/explosions.test.ts
---

## Problem

`tests/guards/content-boundary.test.ts:150` writes a temporary file `src/sim/__purity_explosions_probe.ts`
while it runs. `tests/content/explosions.test.ts` ("is imported outside src/content by the session boot
only") scans `src/` for importers and, when the two run at the same time in different workers, finds the
probe and fails. Seen once in the remote `verify-full` on `e66c1dc` (quick task 261117-pij); a rerun passed.

## Solution

Make the scan ignore `__purity_*_probe.ts` files, or have the probes write outside the scanned tree (for
example a temp directory the guard points its checker at), or run the two files in the same worker. Pick the
smallest change that keeps both tests meaningful.

## Resolution

Done 2026-11-18: the four `sourceFiles` scanners in `tests/content/` (explosions, ships-npc, ships-hulls,
ships-debris) skip `__purity_*` probe files, as `tests/compliance.test.ts` and `tests/sim/rng.test.ts`
already did.
