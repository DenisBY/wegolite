---
quick_id: 261125-gmc
type: quick
title: Digit aliases 2 and 6 for Save/Load and the chart
status: complete
subsystem: input
tags: [input, bindings, docked-f-keys, fidelity]
completed: 2026-11-25
key-files:
  modified:
    - src/input/actions.ts
    - tests/input/bindings.test.ts
    - tests/input/station-actions.test.ts
    - tests/e2e/station-fkeys.spec.ts
    - README.md
    - CHANGELOG.md
    - FIDELITY.md
decisions:
  - Digit2 is shared by viewAft (flight) and saveLoad (dockHome, dockScreen, chart); the contexts are disjoint, so createBindingMap keeps both owners without a code change.
  - Digit6 opens the chart in flight too, as F6 and Oolite's 6 do; no flight action used Digit6.
actuals:
  tokens: 3300
  tasks: 2
  commits: 2
plan_head_before: 52965b5a960c6e582bf6908e3ef03147df529e3d
plan_head_after: abc1ee84
---

# Quick 261125-gmc: Digit aliases 2 and 6 for Save/Load and the chart Summary

Docked, the digit 2 now opens Save/Load and the digit 6 opens the chart, as
F2 and F6 do. This matches Oolite's `key_gui_screen_options` ("2"/f2) and
`key_gui_chart_screens` ("6"/f6) in `Resources/Config/keyconfig2.plist:52-56`
and `:74-78` at the pin 7437f22. In flight, 2 is still the aft view and 6
opens the chart.

## What changed

- `src/input/actions.ts`: `saveLoad: ["F2", "Digit2"]` and
  `chart: ["F6", "Digit6"]`. Contexts are unchanged. The F-key stays first, so
  the tab strip and the hints still advertise F2 and F6.
- `createBindingMap` needed no change. `viewAft` (flight only) and `saveLoad`
  (dockHome, dockScreen, chart) do not share a context, so both keep `Digit2`,
  just as `Digit1` stays with both launch and viewFore. A unit test pins this.
- Text targets: `onKeyDown` already sends every key except F-keys from a
  focused text field back to the browser, so the Find planet box types 2 and 6.
  A new unit test drives the real `createKeyboardInputSource` listener against
  a stubbed DOM, and a browser case types `6238` into the box.
- Tests: the binding table, resolution in each context (dockHome, dockScreen,
  chart, saveScreen, flight) for all six digit aliases, and in-flight Digit2
  and Digit6. In `station-fkeys.spec.ts`, `pressFrom` now treats Digit2 and
  Digit6 like F2 and F6. There are two new browser cases: 2 and 6 from home,
  the market, the chart and the F2 screen (plus every digit alias from the F2
  screen), and the Find box typing.
- Records: the README Controls table (`F6 / 6`, `F2 / 2`; the readme contract
  derives these from the bindings). CHANGELOG `### Fixed`. FIDELITY E-183 now
  lists the aliases 2, 3, 4, 5, 6 and 8 and cites keyconfig2.plist:52-88.
  E-184 names the digit 6.

## Save/Load screen finding

There is no contradiction, so nothing was changed and the owner has nothing to
decide.

- Wegolite's F2 screen (`saveScreen` context) corresponds to Oolite's
  **GUI_SCREEN_OPTIONS**, the Load/Save options screen. That screen is not
  GUI_SCREEN_SAVE. Oolite polls GUI_SCREEN_OPTIONS through
  `pollDockedControls` → `pollGuiScreenControls` →
  `pollGuiScreenControlsWithFKeyAlias:YES`
  (`PlayerEntityControls.m:3889-3892`, `:4157-4165` at 7437f22). On it the
  digits 3, 4, 5, 6 and 8 switch screens, and 2 is ignored on its own screen
  (`gui_screen != GUI_SCREEN_OPTIONS`). Wegolite does the same: Digit3/4/5/8
  already did (quick 261124-pze), Digit6 now does, and Digit2 is inert there.
- Oolite's **GUI_SCREEN_SAVE** is the commander-name text entry. It polls
  with `FKeyAlias:NO` (`PlayerEntityControls.m:2168-2169` at the pin; the plan
  cited 2171-2172). Wegolite has no equivalent screen: it has one save slot and
  no name entry, and the only text input in the game is the chart's Find planet
  box. That box already behaves like FKeyAlias:NO, because the digits type and
  only the F-keys act.
- While the overwrite question is open (Oolite GUI_SCREEN_SAVE_OVERWRITE), the
  digits do nothing. That is the existing E-189 behaviour, and the new digits
  follow it.

## Deviations from Plan

- [Ordering] The CHANGELOG and README edits went into the Task 1 commit, not
  Task 2. The readme contract test checks the Controls table against
  `DEFAULT_BINDINGS`, and AGENTS.md wants the CHANGELOG entry in the same
  commit as the change. Committing them later would have left a commit with a
  red test. Task 2 holds only FIDELITY.md.
- The plan cited `PlayerEntityControls.m:2171-2172` for GUI_SCREEN_SAVE. At the
  pin the lines are 2168-2169. Only this SUMMARY cites them; no committed
  record does.

## Gates

| Gate | Where | Result |
| ---- | ----- | ------ |
| `test` (full Vitest) | local Docker | exit 0 |
| `lint`, `typecheck` | local Docker | clean |
| fidelity + readme contracts with OOLITE_SRC (7437f22), tests/input | local Docker | 5 files, 134 tests passed |
| station-fkeys + station specs, Chromium | remote, snapshot abc1ee84 | 28 passed |
| `verify` | remote, snapshot abc1ee84 | Vitest 289 files, 7647 passed / 10 skipped; e2e smoke 28 passed; exit 0 |
| `e2e-cross` (Firefox) | remote, snapshot abc1ee84 | 18 passed, both new digit cases included; exit 0 |

## Commits

- 60692d09 fix(quick-261125-gmc): bind the digit aliases 2 and 6 to Save/Load and the chart
- abc1ee84 docs(quick-261125-gmc): record the digit aliases 2 and 6 in FIDELITY.md

## Self-Check: PASSED

- All seven modified files exist, and both commits are ancestors of HEAD.
