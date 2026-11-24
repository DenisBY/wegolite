---
created: 2026-11-21T07:30:00.000Z
title: Watch a one-off planet-noise polar-cap failure on CI
area: tests, render
severity: minor
files:
  - tests/render/planet-noise.test.ts
  - src/render/planet-noise.ts
audit_acknowledged:
  milestone: v2.3
  at: 2026-11-24
---

## Problem

On main CI run 44812771006 (commit 20a9942, job `checks`), one unit test failed once:

```
tests/render/planet-noise.test.ts > calibrated polar cap (pinned system g0-s7)
  > grows the cap when the authored ice fraction grows
AssertionError: expected 0.21800000000000003 to be less than 0.21800000000000003
  at tests/render/planet-noise.test.ts:319
```

`calibrateSurface` computes `polarCap = (1 - ice) * (0.28 + 0.24 * land)` from
clamped inputs (`src/render/planet-noise.ts`, around line 370). For Lave's land
fraction (0.65), 0.218 is the value for `ice = 0.5`, so the call with the authored
`POLAR_FRACTION = 0.05` returned the colder value as well. The function is pure;
nothing in it explains equal results for 0.05 and 0.5.

A rerun of only the `checks` job on the same commit passed (269 of 269 files), and
the test passed on every earlier CI run and locally. No cause is known.

## When to act

- If it fails again, capture the run id, the runner image and the Node version from
  the log, and check the other files in the same Vitest worker for shared state
  (module-level caches such as `RAW_SURFACE_CACHE`, mocks or spies left in place).
- If it does not recur within the next ten CI runs on main, close this todo.
