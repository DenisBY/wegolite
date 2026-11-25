---
quick_id: 261125-gmc
type: quick
title: Digit aliases 2 and 6 for Save/Load and the chart
created: 2026-11-25
autonomous: true
files_modified:
  - src/input/actions.ts
  - tests/input/*.test.ts
  - tests/e2e/station-fkeys.spec.ts
  - FIDELITY.md
  - CHANGELOG.md
  - README.md
---

# Digit aliases 2 and 6 for Save/Load and the chart

## Goal

Owner report (2026-11-25): docked, the digit 6 does not open the chart and the
digit 2 does not open Save/Load, while 3, 4, 5 and 8 work. Oolite binds both
digits as F-key aliases (`Resources/Config/keyconfig2.plist:52-77`:
`key_gui_screen_options` = "2"/f2, `key_gui_chart_screens` = "6"/f6) and polls
them through `pollGuiScreenControlsWithFKeyAlias:YES`
(`src/Core/Entities/PlayerEntityControls.m:3905-3990` at the checkout; verify
line numbers at pin 7437f22 with `git show 7437f22:<path>`). No Wegolite
decision excludes them: quick 261124-pze added 3/4/5/8 and missed 2 and 6.

## Task 1: bindings and tests

- `src/input/actions.ts`: `chart: ["F6", "Digit6"]`, `saveLoad: ["F2", "Digit2"]`.
  Contexts stay as they are (`chart` in flight, dockHome, dockScreen, chart,
  saveScreen; `saveLoad` in dockHome, dockScreen, chart). In flight `Digit2`
  stays the aft view (`viewAft`, flight context only), as in Oolite where the
  options key only acts docked. Check `createBindingMap` (src/input/bindings.ts)
  keeps both codes: a code shared by two actions with disjoint contexts must
  survive (as `Digit1` launch/viewFore does); if the map drops one, fix it the
  way `Digit1` is handled and pin it with a test.
- In-flight `Digit6` opens the chart, as F6 and Oolite's 6 do (Oolite polls
  the alias in flight). Confirm no other flight action uses `Digit6`.
- Text targets: the chart's Find planet box and any Save/Load text input must
  still TYPE `2` and `6` (only F-keys bypass text targets, quick 261124-pze
  F11). Add tests.
- Save/Load screen: Oolite's save-name screen (`GUI_SCREEN_SAVE`) polls with
  `FKeyAlias:NO` (`PlayerEntityControls.m:2171-2172`), so digits are not
  screen keys there. Check what Wegolite's saveScreen context does today with
  Digit3/4/5/8 (quick 261124-pze made them work on the F2 screen) and give
  `Digit6` the same behaviour for consistency. If that existing behaviour
  contradicts Oolite's save screen, do NOT change it in this task: report it
  in the SUMMARY as a finding for the owner.
- Tests: unit tests in the existing input test files (tests/input/) for the
  binding table and resolution per context (dockHome, dockScreen, chart,
  saveScreen, flight); browser cases in tests/e2e/station-fkeys.spec.ts that
  press `Digit2` and `Digit6` from a station screen and from the chart / F2
  screen, and type `6` in the Find planet box. Update any test that pins the
  binding table or "digit aliases 3, 4, 5 and 8".

## Task 2: records

- FIDELITY.md row "Docked, the screen keys F2, F3, ..." (around line 213) and
  any other row naming the digit aliases: say 2, 3, 4, 5, 6 and 8; cite
  keyconfig2.plist. Keep line citations correct (the contract test only checks
  that a cited line exists).
- CHANGELOG.md `## [Unreleased]` → `### Fixed`: "The digit keys 2 and 6 now
  open Save/Load and the chart, as F2 and F6 do (Oolite's aliases)."
- README.md: if it lists the digit aliases, update it.

## Gates

- Local: `docker compose run --rm test`, `lint`, `typecheck`; fidelity
  contract with OOLITE_SRC (extracted 7437f22 tree at
  /tmp/claude-1027/-home-opencode-git-wegolite/df5840cd-f17f-4d52-8840-3acb682581b8/scratchpad/oolite-7437f22,
  `docker compose run --rm -v <dir>:/oolite -e OOLITE_SRC=/oolite test npx vitest run tests/contract/fidelity.test.ts`).
- Remote (input change): station-fkeys + station Chromium specs, `verify`,
  `e2e-cross`, via `/home/opencode/.claude/scripts/wegolite-remote-run.sh`
  from the worktree root after committing.

## Reviewer and subagent brief

- Tests and builds run in Docker only. Host Node/npm/Playwright are not authoritative.
- Commands: `docker compose run --rm test` (Vitest), `docker compose run --rm test npx vitest run <file>`, `docker compose run --rm typecheck`, `docker compose run --rm lint`; browser via the remote wrapper.
- Scratch files under /tmp mounted into the container, never in the repo.
- Use codebase-memory MCP (project `wegolite`) when available; prefer `rg` over grep.
- Oolite reference checkout /home/opencode/git/oolite (read only).
- All committed text in English.
