---
phase: quick
plan: 261125-ewd
subsystem: station-ui
tags: [market, station, mouse, fidelity, f8, footer]
requires: [261124-pze, 261124-ou6]
provides:
  - selectMarketRow (F8 row click) and activateMarketRow (F8 row double click) in the station controller
  - delegated click and dblclick listeners on the market row body, `selectable` row class
  - market footer hint naming the mouse, Left before Right
affects: [src/app/session/station-controller.ts, src/ui/station.ts, src/app/session/start-session.ts, src/app/game-session.ts, src/ui/station-hints.ts, index.html, FIDELITY.md]
tech-stack:
  added: []
  patterns:
    - "DOM sink re-validates against an allow-list and repeats every session guard (as sortMarket)"
    - "mouse sinks call flushQueuedEdges() before the controller (key-order rule of 261124-pze)"
key-files:
  created: []
  modified:
    - src/app/session/station-controller.ts
    - src/app/session/start-session.ts
    - src/app/game-session.ts
    - src/ui/station.ts
    - src/ui/station-hints.ts
    - index.html
    - tests/app/session/station-controller.test.ts
    - tests/ui/station-hints.test.ts
    - tests/e2e/station-fkeys.spec.ts
    - FIDELITY.md
    - CHANGELOG.md
    - README.md
key-decisions:
  - "A market double click plans Oolite's Enter trade (Shift buy max, else sell all when held, else buy max, with Oolite's else-if fall-through) and only opens the [Y/N] line; it never completes a trade (owner decision 2026-11-25, recorded as FIDELITY E-192, no new Key Decisions row)"
metrics:
  duration: ~35 min
  completed: 2026-11-25
status: complete
commits: 3
plan_head_before: 3a6dd4240809008088b75631832af4bef3227039
plan_head_after: 1af5d6896f2afe5fa53de60dd7657f2de8484ceb
actuals:
  tokens: 49500
  tasks: 3
  commits: 3
---

# Quick 261125-ewd: Market mouse row select and double click Summary

A click on an F8 market row selects it exactly as Up/Down would; a double click selects it and opens the `[Y/N]` line of the trade Oolite's Enter makes there (Shift buy max, else sell all when held, else buy max, with Oolite's fall-through). Both go through one guarded, allow-listed controller path, and keys queued in the same frame are flushed first. The market footer now names the mouse and lists Left before Right.

## Commits

| Task | Commit | Subject |
| ---- | ------ | ------- |
| 1 (tracer) | fc546edd | feat(quick-261125-ewd): a click on a market row selects it |
| 2 (tdd) | 62980bb4 | feat(quick-261125-ewd): a double click on a market row plans Oolite's Enter trade |
| 3 | 1af5d689 | docs(quick-261125-ewd): FIDELITY rows and excerpts for the market mouse, README |

## What was built

- `station-controller.ts`: `landSelection` (shared by `moveSelection` and the click), `commitMaxPlan` (shared by `planMax` and the double click), `marketMouseAllowed` (disposed, context lost, paused, game over, docked via a positive comparison, pre-roll, market screen, chart, Save/Load screen, overwrite question), `selectMarketRow(key)`, `activateMarketRow(key, shift)`. The double click calls only `planFor` and `commitMaxPlan`; it never calls `confirmTrade`, `applyBuy`, `applySell`, `commitProfile` or `autosave`.
- `station.ts`: `onMarketRowClick` and `onMarketRowDoubleClick`, one delegated listener each on the persistent `[data-market-rows]` tbody (shell AbortController signal), primary button only, a shared `marketRowKey` resolver (closest `tr[data-key]` inside the tbody, non-empty key). Rows with `row.selectable` get the `selectable` class; rows stay plain non-focusable `tr` elements.
- `index.html`: `user-select: none` on market rows, `cursor: pointer` on `tr.selectable` only.
- `start-session.ts` / `game-session.ts`: both handlers call `flushQueuedEdges()` and then the controller, passed through like `sortMarket`.
- `station-hints.ts`: market line `Up/Down/Click select · Double-click sell all/buy max · Left sells +1 · Right buys +1 · Shift max · Enter/Y confirm · N cancel · Esc back · P pause`.
- Records: FIDELITY rows E-191 (click, faithful), E-192 (double click, faithful, names the `[Y/N]` step and Phase 5 D-06), the hint divergence row that quotes the footer-legend Key Decision; excerpts E-191 (`PlayerEntityControls.m:744-763`) and E-192 (`2864-2883`), verbatim at 7437f22. CHANGELOG `[Unreleased]` has `### Added` and `### Changed`; README names the mouse on the market.

## Gate results

| Gate | Where | Snapshot | Result | Elapsed |
| ---- | ----- | -------- | ------ | ------- |
| station-controller + dead-mode-gates + queued-edge-flush (Task 1) | local Docker | working tree | 3 files, 84 passed | <1 s |
| station-fkeys, Chromium (Task 1 tracer) | remote | fc546edd | 13 passed | 30 s |
| station-controller + station-hints + dead-mode-gates (Task 2, RED then GREEN) | local Docker | working tree | RED: 9 failed / 76 passed; GREEN: 91 passed | <1 s |
| station-fkeys, Chromium (Task 2) | remote | 62980bb4 | 14 passed | 28 s |
| fidelity contract with `OOLITE_SRC=/oolite` | local Docker | working tree | 9 passed | <1 s |
| fidelity contract without `OOLITE_SRC` | local Docker | working tree | 8 passed, 1 skipped (verbatim case) | <1 s |
| full unit suite `test` | local Docker | working tree = 1af5d689 | 289 files, 7638 passed, 10 skipped | ~4 min |
| `lint` | local Docker | working tree | eslint clean, prettier clean | |
| `typecheck` | local Docker | working tree | clean | |
| station-fkeys + station + station-tabs, Chromium | remote | 1af5d689 | 40 passed | 90 s |
| `verify` | remote | 1af5d689 | unit 289 files, 7638 passed, 10 skipped; e2e smoke 28 passed | 207 s |
| `e2e-cross` (Firefox, includes both mouse cases) | remote | 1af5d689 | 16 passed | 86 s |

The remote wrapper ran from the worktree root without trouble. Every remote snapshot SHA above is a committed HEAD of this worktree branch. No `test:acceptance` run was needed: nothing under `src/sim/npc/**`, `src/sim/world/**` or `ships-npc.json` changed. `tests/guards/dead-mode-gates.test.ts` still pins 5 for `station-controller.ts`, because the new docked check is the positive `ctx.core.state?.mode === "docked"`.

Plan acceptance checks: `function selectMarketRow` 1, `onMarketRowClick` in 2 src files, `tr.selectable` 1, `function activateMarketRow` 1, `"dblclick"` 1, `"Double-click sell all/buy max"` 1, the old `Right buys +1 · Left sells +1` order 0, the new order in the hint test 2, `### Changed` in CHANGELOG 9 (was 8), `^### E-` 192, `quick 261125-ewd` in FIDELITY 3, `744-763` 3, `2864-2883` 2. `src/content/generated/`, `third_party/` and `.planning/PROJECT.md` are unchanged. The CHANGELOG diff against ebda38c0 is 14 lines added and 0 deleted, so the released sections are untouched.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] FIDELITY citations shifted by this plan were re-pointed**
- **Found during:** Task 3
- **Issue:** The new helpers and doc lines moved code that existing FIDELITY rows cite by line. The contract test only checks that a line exists in the file, so it would have stayed green with rows pointing at the wrong code: `station-controller.ts` 972, 981, 986, 1001 and 1014 (navigateByKey and the overwrite-question guard), and `station-hints.ts:94` (the F5 hint).
- **Fix:** I matched each row's old source line at 3a6dd424 to its new line (989, 998, 1003, 1018, 1031; `station-hints.ts:100`). The F3 repair-colour row cited `src/ui/station.ts:305`, which already pointed at a closing brace in `renderMarketRows` at the base commit, so it was stale before this plan. I pointed it at `renderOutfitting`'s class line, `src/ui/station.ts:344`.
- **Files modified:** FIDELITY.md
- **Commit:** 1af5d689

No other deviations. No spec outside this plan pinned the old market hint, so no other expectation changed.

## Open points (flags for the orchestrator, from the plan's Records finding)

1. No FIDELITY row and no PROJECT.md Key Decisions row records the market `[Y/N]` trade confirmation itself. It is Phase 5 D-06 (`.planning/milestones/v1.0-phases/05-docked-economy-station-screens/05-CONTEXT.md:31`). As the owner instructed, no Key Decision was added. The double-click row is `faithful` for the trade choice, and its Mechanic cell names the `[Y/N]` step and D-06. If the owner wants a dedicated Key Decisions row, only the two FIDELITY cells and one PROJECT.md row change.
2. The F5 hint decision (the PROJECT.md row that starts `A second F5 press opens Oolite's Manifest`) covers only the F5 hint. The mouse-hint divergence row therefore quotes the footer-legend decision `Unify the docked, chart and Save/Load footer on one two-line template with live key labels` (PROJECT.md:215).

## Known Stubs

None.

## Threat Flags

None beyond the plan's threat register. T-ewd-01 to T-ewd-04 are mitigated as planned: an allow-list plus repeated guards (unit-tested with `__proto__`, empty and unknown keys); the double click only plans, with an invariant test on profile, market, lastTrade, profiles and autosave, and the browser checks that credits and cargo do not change; `flushQueuedEdges` runs before both sinks, with browser cases for both orders; and the listeners are removed with the shell's AbortController.

## Self-Check: PASSED

- FOUND: src/app/session/station-controller.ts (`function selectMarketRow`, `function activateMarketRow`)
- FOUND: src/ui/station.ts (`"dblclick"`), src/app/session/start-session.ts (`onMarketRowDoubleClick`), index.html (`tr.selectable`), src/ui/station-hints.ts, tests/e2e/station-fkeys.spec.ts, FIDELITY.md (`### E-192 src/Core/Entities/PlayerEntityControls.m:2864-2883`)
- FOUND commits: fc546edd, 62980bb4, 1af5d689 (ancestors of HEAD)
