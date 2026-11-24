---
phase: 20-player-death-and-game-over
plan: 13
subsystem: ui
tags: [game-over, legibility, fidelity, gap-closure, phase-gate]
requires:
  - phase: 20-player-death-and-game-over
    provides: "plans 20-04, 20-12: the game-over overlay and the coasting dead view"
provides:
  - "the data-game-over-panel backing element inside the faded #game-over root"
  - "Oolite's message yellow for the four game-over lines"
  - "requirePanel in createGameOverOverlay (fail closed on a missing panel)"
  - "FIDELITY row and excerpt E-182 and the PROJECT.md Key Decision for the backing"
  - "the Phase 20 gate: remote verify and verify-full exit 0 on a HEAD containing 20-12 and 20-13"
affects: []
tech-stack:
  added: []
  patterns: ["a translucent backing panel as a descendant of the filtered root, so the saturate fade covers it"]
key-files:
  created: []
  modified:
    - index.html
    - src/ui/game-over.ts
    - tests/ui/game-over.test.ts
    - CHANGELOG.md
    - FIDELITY.md
    - .planning/PROJECT.md
key-decisions:
  - "The game-over lines are Oolite's yellow on a dark translucent panel (Phase 20, G-20-2): rgba(0, 0, 0, 0.6) with 0.6em 1.4em padding, a recorded divergence (Oolite draws no backdrop while dead), reviewer-agreed in Round 3 before the code"
requirements-completed: [DEATH-01, DEATH-06]
status: complete
duration: 55 min
completed: 2026-11-24
actuals:
  tokens: 45000
  tasks: 2
  commits: 2
plan_head_before: 3c1f37614fd5998c008740903ed2ba00a2702924
plan_head_after: 3a8f923933ad93606d2bd5f2df1b057b40d31cf8
---

# Phase 20 Plan 13: the legible game-over panel and the phase gate Summary

**The four game-over lines now sit on a `rgba(0, 0, 0, 0.6)` panel inside the faded `#game-over` root, in Oolite's message yellow `rgb(255, 255, 0)`; the backing is recorded as a reviewer-agreed divergence (FIDELITY E-182) before its code, and the Phase 20 gate (remote `verify` and `verify-full`) is green.**

## Pre-flight (Round 3, `20-REVIEWS.md` at d7d91e9)

`rg -n '^## Round 3'` printed L1027. DIV-10 verdicts read at their lines, all ACCEPT: Fable L1065, Opus L1095, Sonnet L1125; consensus row L1134 "Agreed (3/3), with record conditions below"; the yellow's consensus L1136 "Agreed (3/3)". The only OBJECT mention (L1138) is "No OBJECT". Pre-flight passed. No new review was run for this plan: the divergence is the one the Round 3 reviewers (three Agent-subagent models) agreed on before this plan, and the plan relies on that record.

## What was built

- **Task 1, record first (e59a1ea).** `FIDELITY.md`: a Mechanics row after the game-over view row (divergence, excerpt E-182 `GuiDisplayGen.m:1344-1349`, the six pin lines verbatim in an `objc` fence) and `PROJECT.md`: the Key Decision "The game-over lines are Oolite's yellow on a dark translucent panel (Phase 20, G-20-2)". The row applies Round 3 conditions 6 and 7: the 60 % panel dims the centre of the aft view where the receding explosion sits (owner to judge at UAT, values not tuned); Oolite's translucent comm-log backing (`hud.plist:390`) and the transparent message-GUI default (`hud.plist:377`) are cited; the unmodelled 0.75 `overall_alpha` (`Universe.m:4825`, `hud.plist:392`) is noted; the yellow ships only with the panel (about 1.07:1 on the white sun otherwise). The yellow's source is recorded in the same row: `showGameOver` resets the message GUI (`PlayerEntity.m:3632`), the reset sets `yellowColor` (`HeadUpDisplay.m:440`), 1, 1, 0 (`OOColor.m:279-282`). The row cites the Round 3 verdicts (Fable L1065, Opus L1095, Sonnet L1125, consensus L1134 and L1136, all @d7d91e9).
- **Task 2, the tracer (3a8f923).** `index.html`: the four `<p data-game-over-line>` elements wrapped in `<div data-game-over-panel>` inside `#game-over`; `#game-over` keeps `background: transparent` and its colour changes from `#33ff66` to `rgb(255, 255, 0)`; the new `#game-over [data-game-over-panel]` rule carries `padding: 0.6em 1.4em` and `background: rgba(0, 0, 0, 0.6)`; the rule comment is rewritten. `src/ui/game-over.ts`: `requirePanel(root)` (throws `Wegolite: the game-over overlay is missing its backing panel.`) and the four `requireLine(panel, name)` lookups; `textContent` writes, listeners and `setFilter` on the root unchanged; module doc extended. `tests/ui/game-over.test.ts`: `RootDouble` holds a `PanelDouble` with the lines, a missing-panel case, a lines-inside-the-panel case, and markup and CSS pins scoped to each rule block (panel opens before the first line and holds the four in order; root carries the yellow, no `#33ff66`, `background: transparent`; panel carries `rgba(0, 0, 0, 0.6)` and `0.6em 1.4em`). `CHANGELOG.md`: the Unreleased game-over entry gains "The Game Over lines are yellow, as in Oolite, on a dark panel so they stay readable against the sun or a lit station." (no version, no released section). The credits glyph, the score template and every font rule are untouched.
- **Re-pointed FIDELITY cells into `src/ui/game-over.ts`** (after prettier): `buildGameOverLines` 119 to 131, the backing row 211 to 161 (`requirePanel`'s `querySelector`), the Space-or-click row 188 to 212, the reload row 173 to 197. Each verified with `sed -n 'Np'`.
- The fade still covers the panel: it is a descendant of the root whose filter the render driver writes (E-174), and a black panel stays black under `saturate(0)`. No file under `src/sim` or `src/render` changed.

## Verification records

- Task 1: `tests/contract/fidelity.test.ts` 8 passed + 1 skipped without the pin tree, 9/9 with `/tmp/oolite-7437f22` mounted (`OOLITE_SRC`); prettier check clean; all Task 1 acceptance counts 1.
- Task 2 (RED then GREEN): the new cases failed before the markup and overlay change (14 failed), then `tests/ui/game-over.test.ts` 25/25, `tests/app/session/death-flow.test.ts` 21/21, `tests/contract/fidelity.test.ts` 9 (8 + 1 skipped); `typecheck` clean; prettier clean on the five touched files; every Task 2 acceptance count as expected (panel div 1, `rgba(0, 0, 0, 0.6)` 1, yellow 1, `missing its backing panel` in the module and the tests, CHANGELOG sentence 1 with line breaks folded, score template 1, `[0.7.0] - 2026-11-20` heading 1, `git diff --name-only 3c1f376 -- src/sim src/render` empty).
- Plan boundary, container: `docker compose run --rm test` exit 0, `lint` clean (eslint and prettier), `typecheck` clean.
- Remote `verify`: `snapshot=3a8f923`, `exit=0`, `elapsed=204s` (288 Vitest files, 7546 passed, 10 skipped; 28 Chromium smoke tests passed).
- Remote `verify-full` (the Phase 20 gate): `snapshot=3a8f923`, `exit=0`, `elapsed=949s`; Vitest 288 files and 7546 tests passed; Chromium 150 passed in 13.3 min plus the 2 closing specs passed (23.1 s); no failure, no flake rerun.
- Death specs against their budgets (the 60 % rule), from the verify-full run: `death-and-reload.spec.ts:277` 8.0 s and `:372` 6.3 s of the 120 s `test.setTimeout` (6.7 % and 5.3 %); `game-over-guard.spec.ts:151` 23.3 s against its larger budget (3 x 30 s + the death wait + 3 x 30 s, so at most 13 %). None is above 60 %.
- 20-12 ancestry: `git merge-base --is-ancestor e3efe20ddd105ddcd89eebb8d93dc5ddd5b695f7 3a8f923` exits 0, so the verify-full snapshot contains 20-12's last commit and its deferred `verify-full` is covered here.
- QUAL-11: `git diff --name-only 3c1f376 -- src/sim/npc src/sim/world src/content/generated/ships-npc.json` is empty, so the by-hand 20-seed acceptance run is not due.
- Tracer gate: auto mode is active (`workflow.auto_advance` true); the tracer's automated verify passed and the remote Chromium `verify` / `verify-full` started sessions from the real `index.html` (a missing panel would have thrown at session start, T-20-45), so expansion was not blocked.

## Deviations from Plan

None - plan executed exactly as written. (The FIDELITY.md table was not re-padded by prettier this time, so the diff is small.)

## Known Stubs

None.

## Threat Flags

None beyond the plan's register (T-20-44 mitigated: `textContent` writes unchanged and the existing verbatim-name case green; T-20-45 mitigated: fail-closed `requirePanel`, markup pin, real-`index.html` browser specs green).

## For /gsd-verify-work (gap G-20-2)

Human UAT re-test, Chromium and Firefox: die with the sun behind the text and again with a lit station face; all four lines read clearly in yellow on the dark panel at the start and, greyed, at the end of the five-second fade; over black space the panel is barely visible. Ask the owner to judge the explosion through the 60 % panel (Round 3 condition 6, centre of the aft view); record the judgement, do not tune values. The credits sign stays out of scope (todo 2026-11-24-credits-glyph-legibility).

## Self-Check: PASSED

- Commits e59a1ea and 3a8f923 exist on the branch (ancestor of HEAD); `data-game-over-panel` is in `index.html`, `src/ui/game-over.ts` and the tests; E-182 is in `FIDELITY.md`; the Key Decision is in `.planning/PROJECT.md`.
