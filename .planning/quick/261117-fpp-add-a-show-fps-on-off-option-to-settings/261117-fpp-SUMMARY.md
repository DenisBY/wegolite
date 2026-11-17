---
phase: quick-261117-fpp
plan: 261117-fpp
subsystem: ui
tags: [settings, performance, fps, ui]
status: complete
requires: []
provides:
  - "Settings > Show FPS counter (frames per second) checkbox, off by default"
  - "src/ui/fps-counter.ts: createFpsMeter (500 ms animation-frame window, 1000 ms gap restart), formatFps, createFpsCounter (throttled DOM readout)"
  - "optional `showFps` settings key: strict boolean, written only when on"
affects: [settings, session frame loop, session dispose, document footer]
actuals:
  tokens: 11431
  tasks: 2
  commits: 2
plan_head_before: 3ded22ecb424b133a9d9e7c09f601dc1dd3b911f
plan_head_after: 6e32eb9e76d87702cffbcd85d07431d0c9b09fb2
tech-stack:
  added: []
  patterns:
    - "Per-frame UI readout ticked from frame(now) right after probe.frames, writing textContent at most once per window"
key-files:
  created:
    - src/ui/fps-counter.ts
    - tests/ui/fps-counter.test.ts
  modified:
    - src/settings/schema.ts
    - src/settings/store.ts
    - src/ui/settings-panel.ts
    - index.html
    - src/app/session/context.ts
    - src/app/session/settings-controller.ts
    - src/app/session/start-session.ts
    - src/app/session/frame-loop.ts
    - src/app/game-session.ts
    - src/main.ts
    - CHANGELOG.md
    - tests/e2e/settings.spec.ts
    - tests/app/session/settings-controller.test.ts
    - tests/settings/schema.test.ts
    - tests/app/session-order.test.ts
    - tests/app/session/start-session.test.ts
    - docs/PERFORMANCE.md
    - README.md
key-decisions:
  - "The FPS counter counts session frame-loop passes (rAF `now`), not sim ticks or GPU draws, so docked and paused frames count (as planned)"
requirements-completed: []
duration: 17min
completed: 2026-11-17
---

# Quick task 261117-fpp: Show FPS option in Settings Summary

The pause menu's Settings panel gains a "Show FPS counter (frames per second)" checkbox. When it is on, a DOM readout "FPS: n", measured over 500 ms windows of animation frames, appears at the top-right of the document footer, in flight and while docked. The choice is stored as `showFps: true` in `wegolite.settings`, and Reset all settings clears it.

## What changed

- **`src/ui/fps-counter.ts` (new, no imports).** `createFpsMeter` counts frames from the caller's `now`. Once a window reaches 500 ms it returns `frames * 1000 / elapsed` and starts the next window. A gap over 1000 ms, or a timestamp that goes backwards, restarts the window and returns null. `formatFps` returns `FPS: <Math.round>`. `createFpsCounter` starts hidden and disabled. When enabled it writes the `FPS: --` placeholder, then writes `textContent` only on a readout whose rounded text changed. `dispose()` hides the readout, clears it and silences it. The module reads no clock and writes no HTML.
- **Settings.** `showFps` is allowlisted and strict-optional: absent means false, and any non-boolean, null included, rejects the blob with `settings.showFps: expected a boolean`. It defaults to false in `defaults()`, `mergeDefaults` copies it, and `saveSettings` writes it only when true. No version bump. The schema header now names the seven keys (it said "five", which was already stale).
- **Markup.** The checkbox (`data-settings-toggle="showFps"`) sits after High quality. `<span id="fps" hidden aria-hidden="true">` is the first child of the one `<footer>`. A commented `#fps` rule places it absolutely at top 0.35rem, right 1rem, colour #cfc.
- **Session.** The new field `ctx.runtime.fpsCounter`. The settings controller gains `syncShowFpsToggle` (called by `openSettings`) and `applyShowFps` (persists the choice, then calls `setEnabled`). `resetAllSettings` calls `fpsCounter.setEnabled(false)`, then syncs the toggle. `startSession` creates the counter from `fpsRoot` and enables it from `loaded.showFps`. `dispose()` disposes it right after the settings panel. The frame loop calls `ctx.runtime.fpsCounter?.frame(now)` on the line after the unchanged `probe.frames += 1;`. `fpsRoot` is threaded from `main.ts` through `GameSessionOptions` and `LifecycleDeps`.
- **Docs.** CHANGELOG `[Unreleased]` / Added bullet, in the same commit as the code. A `docs/PERFORMANCE.md` paragraph and a README Performance sentence say the counter is a quick reading, not QUAL-01 evidence, and adds no draw call.

## Commits

| Task | Commit | Message |
| --- | --- | --- |
| 1 | e5db87c | feat(quick-261117-fpp): add a Show FPS counter option to Settings |
| 2 | 6e32eb9 | test(quick-261117-fpp): pin the Show FPS edges and note the counter in the docs |

## Gate results

| Gate | Where / snapshot | Result |
| --- | --- | --- |
| Targeted Vitest (fps-counter, schema, settings-controller, start-session, session-order, redraw-gate, economy-purity, compliance, world-lifecycle) | local Docker, Task 1 | 9 files, 273 tests passed |
| typecheck, lint | local Docker, Tasks 1 and 2 | exit 0 (the first Task 1 run failed on two test typing issues and Prettier formatting; fixed before the commit) |
| Remote e2e `settings.spec.ts` | `wegolite-remote-run.sh run --rm e2e sh -lc "npm run build:e2e && npx playwright test tests/e2e/settings.spec.ts --reporter=list"` at **e5db87c** | exit 0, **7 of 7** passed (new Show FPS test 8.8 s), 58 s |
| Full unit suite | local Docker `docker compose run --rm test`, Task 2 | 217 files, 5575 passed, 10 skipped |
| Remote `verify` | `wegolite-remote-run.sh run --rm verify` at **6e32eb9** | exit 0, 150 s: lint, typecheck, `assets:check` no differences, 217 unit files (5575 passed, 10 skipped), build, `check:dist` (123 files, no harness marker), e2e smoke 27 of 27 |

No flaky test needed a rerun. The wrapper printed no "uncommitted tracked edits" note on either run. `verify-full` and the NPC acceptance run were not run: the plan does not require them, because nothing here touches render, input, IndexedDB persistence, the network guard or `src/sim/npc`.

## Non-vacuity checks (Task 2)

Each new edge test was run against a deliberately broken local copy of the production code. Each copy was then restored with `git checkout -- <file>`, and `git diff --quiet HEAD -- src` confirmed the restore.

| Broken edit | Result |
| --- | --- |
| `showFps` parse block removed from `parseSettings` | 4 "show FPS" schema/store tests failed |
| `ctx.runtime.fpsCounter?.dispose()` deleted | 3 dispose-order tests failed |
| The tick moved below the chart-open `return` | all 3 FPS-tick frame-loop tests failed |
| `fpsCounter.setEnabled(fresh.showFps)` dropped from reset | the reset test failed |

## Invariants

- `git diff --quiet 58f059b -- src/sim src/content src/app/probe.ts src/app/session/probe-publisher.ts src/app/redraw-gate.ts` exits 0.
- `probe.frames += 1;` is unchanged, and there are still exactly five `redrawGate.request();` calls (`redraw-gate.test.ts` is green). `economy-purity.test.ts` is green: no session file reads a wall clock.
- `src/ui/fps-counter.ts` contains no `performance.now(`, `Date.now(` or `innerHTML`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] A `SettingsV1` literal in a schema test needed the new field**
- **Found during:** Task 1 (typecheck)
- **Issue:** The `mergeDefaults` test in `tests/settings/schema.test.ts` builds a full `SettingsV1` literal. After `showFps` became a required member of the interface, typecheck failed.
- **Fix:** Added `showFps: false` to that literal. The five-key blob test the plan asked to keep unchanged was not touched.
- **Files modified:** tests/settings/schema.test.ts
- **Commit:** e5db87c

No other deviations. The plan's tests were written as specified. One Task 1 test had its own arithmetic wrong: the re-enable case closed its window at 98, not 100. The test was corrected before the commit, and the module was not changed.

## Threat Flags

None. The new surface (`showFps` parse, `#fps` DOM text) is exactly the plan's T-fpp-01..04, each mitigated as specified.

## Self-Check: PASSED

- FOUND: src/ui/fps-counter.ts, tests/ui/fps-counter.test.ts
- FOUND: e5db87c, 6e32eb9 (both ancestors of HEAD)
