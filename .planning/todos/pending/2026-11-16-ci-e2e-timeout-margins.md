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
  - tests/e2e/core-loop.spec.ts
  - tests/e2e/budget.spec.ts
  - tests/e2e/save-load.spec.ts
  - tests/e2e/station-tabs.spec.ts
  - tests/e2e/throttle.spec.ts
  - tests/e2e/settings.spec.ts
  - tests/e2e/station.spec.ts
  - tests/e2e/helpers/probe.ts
audit_acknowledged:
  milestone: v2.3
  at: 2026-11-24
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

## Status (2026-11-20, quick task 261120-ryc)

- **Cause.** Quick tasks 261118-os8 (the 1.5 s pre-roll inside the dock slot) and 261118-spu (the HUD drawn during the
  launch) and Phase 18's cockpit launch view lengthened the full launch. The first launch of a fresh browser profile
  cannot be skipped (`launchSeen` is false in fresh settings, `src/app/session/start-session.ts`), and on CI the
  session is frame-bound (at most 5 fixed steps of 1/120 s per rendered frame on SwiftShader), so the full launch takes
  about 70 s of real time (`launch.spec.ts:72` passed in 1.2 min, 60 % of its old 120 s).
- **The run.** PR #1 CI run 44796363344 failed 17 tests, all at an inner launch wait of 30 s or 60 s, or at the 30 s
  default test timeout around `compliance-shipped.spec.ts:111`'s 120 s wait.
- **The fix.** `FIRST_LAUNCH_WAIT_MS = 180_000` in `tests/e2e/helpers/probe.ts`, plus the budget rule: a test or file
  timeout covering such a wait is its non-launch budget plus one `FIRST_LAUNCH_WAIT_MS` per unskipped launch, written
  as an expression in code. Test-only: no product code, launch sequence, `launchSeen` seeding or assertion changed.
- **Tests changed** (new budgets at scale 1; the shared helpers also serve tests that passed on that run):
  - `scene.spec.ts:15`: wait and budget 30 s + 180 s = 210 s;
  - `context-loss.spec.ts`: `waitForMode` 180 s, file budget 540 s + 180 s = 720 s;
  - `core-loop.spec.ts`: `waitForMode` `scaled(180 s)`, file budget `scaled(1,140 s + 180 s)` = 1,320 s;
  - `docking.spec.ts`: `waitForMode` 180 s; the aligned-pose test gains 90 s + 180 s = 270 s; the bounce and the two
    Shift+C tests 150 s + 180 s = 330 s; the file default of 120 s stays for the non-launching tests;
  - `flight.spec.ts`: `bootToFlight` 180 s, file budget 60 s + 180 s = 240 s;
  - `hud.spec.ts`: `launch()` 180 s; the scanner and the eleven-element tests 60 s + 180 s = 240 s; the message-line
    test 450 s + 180 s = 630 s (its 450 s message wait is unchanged);
  - `launch.spec.ts`: `waitForMode` 180 s (`waitForPreRoll` stays 30 s), file budget 90 s + 180 s = 270 s;
  - `probe-shape.spec.ts:294`: `waitForState` gains an optional timeout, the in-flight call passes 180 s, budget
    30 s + 180 s = 210 s;
  - `settings.spec.ts`: `startAndLaunch` 180 s; budgets 420 s (two launches, two tests), 240 s (two tests), 300 s,
    480 s (two launches) and 360 s;
  - `station.spec.ts:281` and `:823`: in-flight wait 180 s, budget 150 s + 180 s = 330 s each;
  - `compliance-shipped.spec.ts:111`: in-flight wait 180 s, budget 30 s + 180 s = 210 s.
- **Remote result.** The eleven changed specs, Chromium, committed snapshot 03faf01: 54 passed, 0 failed, 5.5 min
  (script elapsed 334 s).
- **The watch continues.** After the next sharded CI run, re-measure each launch-spanning test's share of its new
  budget and apply the Rule above. The specs that passed on run 44796363344 with their own launch waits
  (`station.spec.ts:847`, `save-load.spec.ts:721`, the `SLOW`-constant specs) were left unchanged and are the first to
  check.

## Status (2026-11-21, quick task 261121-bjl)

- **The run.** Main CI run 44812771006 at 20a9942: shard 2 took 16.4 min against about 10 min for the others.
  `hyperspace.spec.ts:196` and `:614` timed out in `waitForMode` (60 s) right after the first launch; 261120-ryc missed
  them because that file passed on run 44796363344. `core-loop.spec.ts:269` timed out in the 180 s arrival wait after
  the 15 s countdown, a frame-bound wait (at most 5 fixed steps of 1/120 s per rendered frame on SwiftShader, so at
  least 360 rendered frames) that `hyperspace.spec.ts` and the autosave trigger matrix already give 360 s.
- **The fix.** Every wait that spans an unskipped launch in real time now uses `FIRST_LAUNCH_WAIT_MS`, with the governing
  budget written as its non-launch part plus one constant per launch. Test-only: no product code, launch sequence, skip
  key, `launchSeen` seeding or assertion changed; no timeout was lowered.
  - `hyperspace.spec.ts`: `waitForMode` 180 s; the chart-target test 1,140 s + 180 s = 1,320 s; the blocked-refusal
    test gains 540 s + 180 s = 720 s; the file-level 600 s stays for the non-launching arrow-key test;
  - `core-loop.spec.ts`: the Diso arrival wait `scaled(360 s)` (was 180 s); file budget `scaled(1,320 s + 180 s)` =
    1,500 s (the non-launch part rises by the same 180 s);
  - `autosave.spec.ts`: `waitForMode` 180 s; the tainted-dock test gains 540 s + 180 s = 720 s; the trigger matrix
    1,140 s + 180 s = 1,320 s; file-level 600 s stays;
  - `budget.spec.ts`: `waitForMode` 180 s; file budget 240 s + 180 s = 420 s (three tests, one launch each);
  - `save-load.spec.ts`: `waitForMode` 180 s; the F2-in-flight and in-flight Load tests gain 300 s + 180 s = 480 s each;
  - `station-tabs.spec.ts` (found by the planner's sweep): `waitForMode` 180 s; the Launch-tab, in-flight chart and
    header-balance tests gain 120 s + 180 s = 300 s each;
  - `throttle.spec.ts`: `waitForMode` 180 s; file budget 540 s + 180 s = 720 s;
  - `settings.spec.ts` (Show FPS toggle) and `station.spec.ts:857`: both launches wait 180 s, because the launch after the
    reload also plays in full (`launchSeen` only enables the skip key); budgets 120 s + 2 x 180 s = 480 s and
    60 s + 2 x 180 s = 420 s.
- **Waits left unchanged, and why.**
  - probe-shape (except the in-flight call 261120-ryc changed), combat, laser-shots, statics, npc-flight, tick-hook and
    traffic `SLOW` = 30 s waits: they boot with `?test=1&clock=manual` and step the launch with `advanceTicks`; the
    in-flight wait only waits for a frame to publish the probe (tick-hook's `?clock=manual&traffic=1` case does not launch);
  - `engine.spec.ts:119` (90 s): ends when the sim launch starts after the 1.5 s pre-roll, not when the launch view ends;
  - `docking.spec.ts:252` (60 s): the 2 s departure wait after `waitForMode` inFlight returned; the relaunch at line 358
    is skipped with the x key;
  - autosave `launchAndAwaitCommit` (90 s), the autosave launching waits, `save-load.spec.ts:398` `waitForCommitted(3)`,
    the `station.spec.ts` save wait and the New-game commit wait: the pre-launch anchor is written on the fixed step that
    ends the 1.5 s pre-roll (quick 261118-os8), before the launch view plays;
  - `hyperspace.spec.ts:375` (60 s): the arrival-save commit wait after the jump, no launch;
  - `save-load.spec.ts:717-721`, `hyperspace-failure.spec.ts:117`, `autosave.spec.ts:661`: Continue or Load straight into
    flight, no launch.
- **Remote result.** The nine changed specs, Chromium, committed snapshot 191639a: 70 passed, 0 failed, 8.1 min (script
  elapsed 491 s). Local lint, typecheck and the full unit suite (269 files) passed before the last spec commit.
- **The watch continues.** After the next sharded CI run, re-measure each launch-spanning test's share of its budget per
  shard and apply the Rule above.

## Status (2026-11-23, Phase 20 plan 20-09)

- **The specs.** `tests/e2e/death-and-reload.spec.ts` (two tests) and `tests/e2e/game-over-guard.spec.ts` (one test),
  the two browser specs of the player-death phase. Both start in flight from a seeded save (`writeRaw`, then Continue),
  so neither plays an unskipped launch and no `FIRST_LAUNCH_WAIT_MS` enters a budget.
- **Budgets** (each an expression in code, the non-launch budget only):
  - death-and-reload, both tests: `4 * SLOW` = 4 x 30 s = 120 s (the first load, the seeded reload with Continue, the
    1,682 manual ticks with the dead page, the exit reload);
  - game-over-guard: `3 * SLOW + DEATH_WAIT_MS + 3 * SLOW` with `DEATH_WAIT_MS` = the twin's 1,682 ticks / 120 per second
    x 1000 ms x 10 (a loop at one tenth of real time) = 140.2 s, so about 320 s.
- **Measured on the remote machine** (Chromium, GPU, snapshots 81307c2 and 11a4064): death-and-reload 5.3 s and 5.1 s
  (6.4 s on the first run), game-over-guard 20.7 s (the real-time run to the death at 14 s of sim time, the 5 km seed
  being the dominant part). Three times those is 19 s (16 % of 120 s) and 62 s (19 % of 320 s), inside the 60 % rule.
- **The watch continues.** After the next sharded CI run, re-measure the three tests per shard. The one to check first
  is game-over-guard: its run to the death is frame-bound on SwiftShader (at most 5 fixed steps of 1/120 s per rendered
  frame), 14 s of sim time against the 140 s wait.

## 2026-11-25: laser-shots timed out on CI (release 0.8.1)

- **What failed.** `tests/e2e/laser-shots.spec.ts:80` (chromium shard 2/4, run 45587489443) hit the default 30 s
  test timeout; it took 22.1 s in the 0.8.0 run (74 % of 30 s). The spec had no `test.setTimeout` of its own, while
  its inner waits are already 30 s each.
- **Fix.** `test.setTimeout(120_000)`: four `SLOW` bounds; the launch is stepped on the manual clock, so no
  `FIRST_LAUNCH_WAIT_MS`. 22.1 s is 18 % of 120 s, inside the 60 % rule.
