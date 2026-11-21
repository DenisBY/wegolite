---
phase: quick
plan: 261121-bjl
subsystem: tests/e2e
tags: [e2e, timeouts, ci, first-launch]
requires: [261120-ryc]
provides: [FIRST_LAUNCH_WAIT_MS on every unskipped real-time launch wait in nine specs]
affects: [tests/e2e]
tech-stack:
  added: []
  patterns: ["budget rule: governing timeout = old non-launch budget + L x FIRST_LAUNCH_WAIT_MS, written as an expression"]
key-files:
  created: []
  modified:
    - tests/e2e/hyperspace.spec.ts
    - tests/e2e/core-loop.spec.ts
    - tests/e2e/autosave.spec.ts
    - tests/e2e/budget.spec.ts
    - tests/e2e/save-load.spec.ts
    - tests/e2e/station-tabs.spec.ts
    - tests/e2e/throttle.spec.ts
    - tests/e2e/settings.spec.ts
    - tests/e2e/station.spec.ts
    - .planning/todos/pending/2026-11-16-ci-e2e-timeout-margins.md
decisions:
  - "Second unskipped launches (settings Show FPS, station keyboard-only) count toward L because launchSeen only enables the skip key"
metrics:
  duration: ~45 min
  completed: 2026-11-21
status: complete
commits: 4
plan_head_before: 8b0ae03d389d4984fe354086c1d283d324aa8e13
plan_head_after: 41550f676dc7f30ff86fafba6e3d404d7fc302ad
actuals:
  tokens: 6000
  tasks: 3
  commits: 4
---

# Phase quick Plan 261121-bjl: remaining first-launch e2e waits Summary

Every e2e wait that spans an unskipped real-time launch in nine more specs now waits up to FIRST_LAUNCH_WAIT_MS (180 s), the governing budgets follow the 261120-ryc rule as code expressions, and the core-loop Diso arrival wait is widened from 180 s to 360 s.

## What changed

- hyperspace: waitForMode 180 s; chart-target test `1_140_000 + FIRST_LAUNCH_WAIT_MS`; blocked-refusal test gains `540_000 + FIRST_LAUNCH_WAIT_MS`; file-level 600 s kept.
- core-loop: arrival wait `scaled(360_000)`; file budget `scaled(1_320_000 + FIRST_LAUNCH_WAIT_MS)`.
- autosave: waitForMode 180 s; tainted-dock test gains `540_000 + ...`; trigger matrix `1_140_000 + ...`; file-level comment reworded; file-level 600 s kept.
- budget: waitForMode; file `240_000 + ...`.
- save-load: waitForMode; two tests gain `300_000 + ...`; file-level 360 s kept.
- station-tabs: waitForMode; three tests gain `120_000 + ...`; file-level 180 s kept.
- throttle: waitForMode; file `540_000 + ...`.
- settings (Show FPS): second in-flight wait 180 s; budget `120_000 + 2 * FIRST_LAUNCH_WAIT_MS`.
- station (keyboard-only): both in-flight waits 180 s; test gains `60_000 + 2 * FIRST_LAUNCH_WAIT_MS`; file-level 180 s kept.
- Todo `2026-11-16-ci-e2e-timeout-margins.md`: new "Status (2026-11-21, quick task 261121-bjl)" section, front-matter files extended, stays pending.

## Commits

- 3030739 test: hyperspace + core-loop (tracer)
- c905394 test: autosave, budget, save-load, station-tabs, throttle
- 191639a test: settings, station
- 41550f6 docs: the todo status section

## Verification

- Docker typecheck and lint passed after each task; full unit suite (`docker compose run --rm test`, then `npm run test:fast`, 269 files) passed before the last spec commit. No non-e2e guard reads any changed spec (rg over tests with `!tests/e2e/**` found only unrelated hits in tests/sim/torus.test.ts).
- All per-file count gates and exact-expression gates from the plan passed (hyperspace 3/2/4, core-loop 1/1/3, autosave 3/2/4, budget 1/1/3, save-load 3/2/4, station-tabs 4/3/5, throttle 1/1/3, settings 7/7/10, station 4/3/8).
- Remote (Chromium, committed snapshot 191639a, nine changed specs): 70 passed, 0 failed, 8.1 min (script elapsed 491 s). First run, no rerun needed.
- Scope guard: this task's commits touch only tests/ and .planning/ files.

## Waits left unchanged (reasons, also in the todo)

- Manual-clock specs (probe-shape other than the in-flight call, combat, laser-shots, statics, npc-flight, tick-hook, traffic): launch stepped with advanceTicks; only a probe-publish wait remains.
- engine.spec.ts:119: ends at launching/inFlight when the sim launch starts, not at the end of the launch view.
- docking.spec.ts:252: 2 s departure wait after waitForMode returned; the relaunch is skipped with the x key.
- Pre-launch anchor commit waits (autosave launchAndAwaitCommit and launching waits, save-load.spec.ts:398, station.spec.ts save and New-game commit waits): the anchor is written when the 1.5 s pre-roll ends, before the launch view.
- hyperspace.spec.ts:375: arrival-save commit wait, no launch.
- save-load.spec.ts:717-721, hyperspace-failure.spec.ts:117, autosave.spec.ts:661: Continue or Load straight into flight.

## Deviations from Plan

None - plan executed exactly as written. Note: commits were made on `main` (the orchestrator dispatched this sequential quick task onto the main working tree); no push or tag.

## Known Stubs

None.

## Threat Flags

None.

## Self-Check: PASSED

All nine spec files and the todo exist; commits 3030739, c905394, 191639a and 41550f6 are ancestors of HEAD.
