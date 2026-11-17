---
created: 2026-11-16T12:00:00.000Z
title: Watch the CI e2e timeout margins and shard when the run gets long
area: tests
severity: minor
files:
  - .github/workflows/verify.yml
  - playwright.config.ts
  - compose.yaml
  - tests/e2e/autosave.spec.ts
  - tests/e2e/hyperspace.spec.ts
  - tests/e2e/hud.spec.ts
  - tests/e2e/scene.spec.ts
  - tests/e2e/probe-shape.spec.ts
---

## Problem

The GitHub `verify` job (`ubuntu-latest`, 4 vCPU, `verify-full`) ran the release 0.4.0 in 23.9 minutes.
Its Chromium specs run about 2.5 to 3 times slower than on the remote test machine (for example
`hyperspace.spec.ts:194` 252 s against 90 s, `settings.spec.ts:259` 28 s against 11 s), because the
runner has no GPU and WebGL runs on SwiftShader.

Measured on that run (134 specs), the share of each test's own timeout that it used:
the largest are `probe-shape.spec.ts:286` (49% of the 30 s default), `compliance-shipped.spec.ts:111` (46%),
`scene.spec.ts:15` (46%), `autosave.spec.ts:433` (44% of 600 s) and `hyperspace.spec.ts:194` (42% of 600 s).
No test is within 40% of its timeout, so no timeout was changed. The failures seen so far came from
inner waits that depend on simulation timing (`launch.spec.ts:129`, fixed in 55bf6f6), not from the
test timeout.

## Rule

- When a spec uses 60% or more of its timeout on CI, raise the timeout (or fix the wait) in the same change.
- When the CI `verify` job passes 35 to 40 minutes, shard the browser run (`--shard=n/4` in a job matrix, each job
  with its own runner) instead of buying larger runners (paid only; self-hosted runners are unsafe on a public repo).

## Status (2026-11-17, quick task 261117-v1v)

- **Sharding is done.** The CI `verify` job had grown to about 37 min (e2e 30.6 min), inside the 35 to 40 min
  threshold. `.github/workflows/verify.yml` now runs a `checks` job (`docker compose run --rm verify-checks`,
  verify-full without the full Chromium stage) and a four-leg Chromium matrix (`--shard=N/4`, `fail-fast: false`,
  each leg on its own `ubuntu-latest` runner and building its own bundle), behind an aggregate `verify` job.
  The shards split by file (`fullyParallel: false`): at a055a78, 1/4 = 38 tests in 6 files, 2/4 = 33 in 11,
  3/4 = 32 in 9, 4/4 = 34 in 5 (137 in total). Shard 2 holds the three longest tests (`hyperspace.spec.ts:194`,
  `core-loop.spec.ts:265`, the HUD message line), so it is expected to be the slowest.
- **The trigger-matrix failure is explained.** On run 44081312313, `autosave.spec.ts` timed out in the arrival wait
  after the restarted countdown (180 s). The wait is frame-bound: at most 5 fixed steps of 1/120 s per rendered
  frame, so the 15 s countdown needs at least 360 rendered frames, and SwiftShader on CI fell below 2 fps.
- **Raised timeouts** (worst share on runs 44125946218, 44104008208 and 44081312313):
  - the autosave trigger matrix, 75 % of 600 s: per-test 1,200 s, fly-away 240 s to 480 s, arrival 180 s to 360 s
    (a timeout now reports renders, countdown, systemId and the last refusal);
  - `hyperspace.spec.ts:194`, 71 % of 600 s: per-test 1,200 s, fly-away 480 s, commit wait 360 s (the blocked-refusal
    test's countdown wait also 360 s);
  - the HUD message line, 64 % of 330 s: 480 s budget, 450 s wait;
  - `scene.spec.ts:15`, 76 % of 30 s: 60 s;
  - the in-flight probe shape, 79 % of 30 s: 60 s.
- **The watch continues.** After the first sharded CI runs, re-measure each test's share of its timeout per shard
  and apply the Rule above.
