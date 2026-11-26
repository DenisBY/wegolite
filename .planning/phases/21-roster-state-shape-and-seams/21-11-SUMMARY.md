---
phase: 21-roster-state-shape-and-seams
plan: 11
subsystem: app-loading
tags: [npc-models, prefetch, first-load, d-07, data-18, render-driver]
requires:
  - phase: 21-08
    provides: the 29-record catalogue, one GLB per record, the cold-start figures and the shared-geometry list
provides:
  - NpcModelLoader.prefetch and NPC_PREFETCH_CONCURRENCY (2)
  - the one-shot prefetch trigger on the first docked frame with traffic content
  - first-load and request-order assertions reworked for the prefetch
  - the measured prefetch volume and the roster's cold starts in docs/PERFORMANCE.md
affects: [21-17, 21-18, 21-19]
tech-stack:
  added: []
  patterns:
    - "a background FIFO beside the one-way latch, on the same per-key states map"
key-files:
  created: []
  modified:
    - src/app/npc-models.ts
    - src/app/session/render-driver.ts
    - tests/app/npc-models.test.ts
    - tests/app/session/render-driver.test.ts
    - tests/e2e/budget.spec.ts
    - tests/e2e/traffic.spec.ts
    - docs/PERFORMANCE.md
    - CHANGELOG.md
key-decisions:
  - "The prefetch set is the ship catalogue only (29 keys, catalogue order); debris GLBs stay on first appearance and the budget and traffic specs still require none of them before a kill"
  - "The trigger is the first docked frame with a non-empty traffic catalogue, once per driver; the latch at the end of renderFrame is unchanged"
  - "The ordering assertion is request order in the Playwright event log (first-load models and the hull chunk before the first NPC asset), not the page-side mode stamp, because the probe's mode lags the trigger frame by one"
patterns-established:
  - "Held-request e2e pattern with a prefetch: a held GLB pins the queue at NPC_PREFETCH_CONCURRENCY, so the requested set is exactly the first records plus the keys the flight asked for"
requirements-completed: [DATA-18]
duration: about 2h wall clock (most of it waiting on loaded containers)
completed: 2026-11-26
status: complete
commits: 3
plan_head_before: e9f795e4da35aee7dc0bcf82bbdf1dc73777b385
plan_head_after: dee26196878c9e8a8f915d2aaf6fbb98f8a4c06c
actuals:
  tokens: 40000
  tasks: 2
  commits: 3
---

# Phase 21 Plan 11: Background prefetch of the NPC hull models Summary

With traffic on, the docked session now downloads all 29 NPC hull GLBs and their textures in the background, two requests at a time, so ships draw at once when they first appear, while the first-load ceiling and the simulation stay untouched.

## Loader and trigger design

- `NpcModelLoader.prefetch(keys)` queues keys in a FIFO. A pump starts loads while fewer than `NPC_PREFETCH_CONCURRENCY` (2) prefetch loads are in flight and restarts on every settle. It uses the existing `states` map and `fetchKey`, so a key that is loading, loaded or failed is never fetched twice, a failure is recorded exactly as `request` records it (never retried, nothing printed) and the queue keeps draining. A queued key that `request` starts first is skipped when its turn comes. `prefetch` does not need `open()`; after `dispose()` it starts nothing, the queue is dropped and late resolutions are dropped. A key with no GLB is skipped without being remembered. A synchronous throw from `loadNpcModel` frees its slot.
- `render-driver.ts`: on the first frame where `currentState.mode === "docked"` and the traffic catalogue is non-empty, it calls `npcModels.prefetch(catalogue.map(key))` once (a per-driver flag). It runs before the drawing branch, so it also fires from a docked frame the redraw gate skipped. With no traffic content (traffic off) it never fires. Line `if (currentState.mode === "inFlight") npcModels.open();` and the per-frame `request` calls are unchanged. No entity id is named.
- Textures ride the GLB loads, as before; nothing else is fetched.

## Reworked assertions

- `traffic.spec.ts`, held-request test: with every NPC GLB held, the requested set is exactly the first `NPC_PREFETCH_CONCURRENCY` catalogue records while docked and while launching (proves the bound and the trigger), then those plus the present keys in flight; after release every catalogue GLB finishes.
- `traffic.spec.ts`, cold-start test: renamed to "before the prefetch trigger". An ordered request/finish event log shows that the Cobra, Coriolis and buoy models and the hull chunk were all requested before the first NPC asset; the cold-start bytes are measured to the first in-flight frame minus the bytes of the NPC asset set by path (the existing filter, now commented as D-07); every catalogue GLB is requested exactly once and every NPC asset finishes; the first page-side NPC fetch stamp is a `menu`/`docked` one (the probe mode lags the trigger frame). The per-frame "calls rise after the window" assertion became "greater than 0" because prefetched models may already be drawn at the first in-flight read (the held test still proves draw on arrival: 9 calls held, 17 loaded).
- `budget.spec.ts` (traffic off): unchanged ceiling and "no NPC asset" assertion, plus 30 settled loop frames after the first in-flight frame before the request log is read, so "none ever" is checked beyond the first in-flight frame. Header comment names plan 21-11. `FIRST_LOAD_BYTES_CEILING` and `DRAW_CALL_BUDGET` untouched (21-19 consolidates).

## Measurements (remote, browser-test bundle, snapshot c83a3de5)

| Measure | Value |
|---------|-------|
| Cold start, traffic off | 8,899,758 B (537,426 B under the 9,437,184 B ceiling) |
| Cold start, traffic on, NPC asset set excluded | 8,931,090 B (506,094 B under the ceiling) |
| Prefetch total (29 GLBs 3,030,300 B + 116 NPC-owned textures 28,212,055 B) | 31,242,355 B (29.8 MiB), matches plan 21-08's figures to the byte |
| Prefetch duration, first NPC request to last NPC response | 13,519 ms at concurrency 2 (localhost, remote test machine) |
| NPC responses | 29 GLBs, 157 texture responses (the repeats are shared textures served from cache with a zero body) |
| Draw calls | 10 at the first in-flight frame, 17 after the window, budget 50 |

The ~30 MB flagged assumption (A11) holds. Duplicated variant geometry (nine families, 21-08's list) is about 1.11 MB of GLB bytes, 3.6 % of the prefetch; the rest is texture data. The fallbacks (per-system prefetch, shared GLB with texture-only variants) stay recorded in `docs/PERFORMANCE.md`, not applied.

## CHANGELOG

`## [Unreleased]` / `### Changed`: "With NPC traffic on, the game now downloads the NPC ship models in the background while you are docked, two at a time, so ships draw at once when they first appear. ..." (`rg -c background CHANGELOG.md` was 0 before, is 1 now).

## Verification runs

- Targeted: `npc-models.test.ts` (21 tests, 9 new), `render-driver.test.ts` (65, 4 new), `entity-id-scope.test.ts`, `tick-parity.test.ts`: 126 passed.
- `typecheck`, `lint`: clean (lint after prettier of `docs/PERFORMANCE.md`).
- Full `docker compose run --rm test`: two runs with several worktrees on the machine; each had only 5 to 7 five-second timeouts in different sim files (`hot-weapon`, `tools-determinism`, `tick-flyers`, `collision-buoy`, `kill.property`, `attack-dispatch`, none touched by this plan). Re-run alone, all six files pass (118 tests). Not changed: timeouts.
- Remote `verify` at `dee26196`: exit 0, 28 e2e passed.
- Remote `budget.spec.ts` + `traffic.spec.ts` at `c83a3de5`: 6 passed, run twice (the second with the JSON reporter for the figures above).
- No acceptance run: no simulation or catalogue change. `git diff --name-only e9f795e4..HEAD -- src/sim` is empty; the twin literals and `hashWorld` are untouched.

## Deviations from Plan

None - plan executed as written. Two notes:

- The plan's first trigger alternative ("or the session is otherwise idle before launch") was not added: a new game and Continue both start docked, so the docked branch is the only entry; the menu has no traffic content yet (it loads at boot, before the first docked frame).
- The tracer gate was satisfied by the targeted unit run plus the remote spec run before expansion work; no checkpoint was needed (the task has no `blocking-human` gate).

## Known Stubs

None.

## Threat Flags

None. `prefetch` takes keys only; the path still comes from `glbFor` and `loadNpcModel` re-checks `NPC_GLB_PATH_PATTERN` (T-21-20); concurrency 2 and a one-shot trigger bound the download (T-21-21); no `src/sim` file changed (T-21-22).

## Self-Check: PASSED

- Files exist: `src/app/npc-models.ts` (`rg -c prefetch` is 11), `src/app/session/render-driver.ts` (`rg -c "npcModels.prefetch"` is 1), `21-11` named in both e2e specs.
- Commits exist: d17c00db (feat), c83a3de5 (test), dee26196 (docs); `git rev-list --count e9f795e4..HEAD` is 3, before this SUMMARY's own commit.
