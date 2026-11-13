---
phase: 05-docked-economy-station-screens
plan: 05
subsystem: station screens and keyboard loop
tags: [station-ui, outfitting, status, system-data, keyboard, e2e, probe, no-reload]
requires:
  - 05-01 station shell, actions, contexts and the F8 market
  - 05-03 checkFit/applyFit, FitContext and removal economics
  - 05-04 buildOutfittingModel, buildStatusModel, buildSystemDataModel and labels
provides:
  - F3 two-pane render branch with non-focusable rows and a guarded two-state confirm
  - F5 two-page status/manifest render branch and F7 templated system-data branch
  - session screen/page/selection dispatch, applyStationFit and one autosave per accepted fit
  - the complete probe.station and probe.economy shapes
  - keyboard-only title start, F5/F3/F7/F8 defaultPrevented proof and sentinel no-reload evidence
affects:
  - 05-06 (phase gate re-runs the station suites and the save bounds)
  - Phase 6 (F6 chart reuses the station shell and the direct-switch pattern)
tech-stack:
  added: []
  patterns:
    - model flags (`confirmable`, `dimmed`) gate every F3 action; the shell never re-derives a rule
    - the session owns pending/selection/page; the footer confirmation is computed per screen
    - capture-phase F-key `preventDefault` proved with a rebind-mode negative control
    - probe fields are additive and published before any assertion
key-files:
  created: []
  modified:
    - src/ui/station.ts
    - index.html
    - src/app/game-session.ts
    - src/app/probe.ts
    - tests/e2e/station.spec.ts
    - tests/e2e/scene.spec.ts
decisions:
  - F3 rows are model-driven `div`s; disabled rows stay selectable for their reason but carry confirmable=false, so no prompt or apply path is reachable.
  - stationSelection is shared by screen and reset on every open; a committed removal clamps the cursor by position to the nearest surviving row.
  - probe.station.pending is `{kind:"fit"|"trade", key}` and probe.economy.lastTrade records the last accepted buy/sell/fit/removal.
  - F5 page state is clamped to 1..2 and reset on open; only the status screen reacts to page actions.
  - Labels load beside equipment and commodities in start(), so a scalar LabelsError fails the boot visibly.
metrics:
  duration: 72 min
  completed: 2026-11-06
status: complete
actuals:
  tokens: 14052
  tasks: 2
  commits: 3
  plan_head_before: ba85a9ba1fcfc0d2469075350329da07547d8fe0
  plan_head_after: 069b7b685505be1cd3980cba42b846c036ba6ceb
---

# Phase 5 Plan 5: Full Keyboard Station Computer Summary

Turns the tracer market shell into the complete four-screen station computer: F3 buys and removes equipment through a two-state `[Y/N]` footer, F5 pages between status and a 16-row manifest, F7 renders the compiled system data, and every F-key is proved not to reload the browser with a `defaultPrevented` assertion plus a rebind-mode negative control.

## What Was Built

### F3 outfitting (`src/ui/station.ts`, `src/app/game-session.ts`, `index.html`)

- A two-pane branch: non-focusable `div.station-row` rows on the left (label, formatted price, dimmed short reason) and the selected item's title, description and price on the right. Removal rows use `REMOVAL_DESCRIPTIONS`, so the missile row states the full catalogue-value re-sale.
- `stationOutfitting` opens from home or any section, resets the selection to the first visible row and clears pending/notice. Up/Down clamps at both ends and a row change clears the pending line.
- `confirmFit` is the two-state machine: the first `stationConfirm` on a confirmable row opens `Buy <name> for <total>? [Y/N]`; the second re-resolves the pending key, re-runs `checkFit` and calls `applyFit`, then `commitProfile` + exactly one `autosave`.
- A disabled row (`confirmable === false`) never sets pending and never reaches `applyFit`; `KeyY` on Docking Computers at Lave leaves credits and `probe.save.committed` untouched. After a committed removal the selection clamps by position to the new last row, so a third `KeyY` only meets a disabled row and changes nothing.
- The home Launch button remains the only `<button>` on the docked screens; the click handler and the command filter both require `mode === "docked" && screen === "home"`.

### F5 status and F7 system data (`src/ui/station.ts`, `src/app/game-session.ts`, `index.html`)

- F5 renders page 1's nine labelled fields plus the equipment list (`Missile ×3`) and page 2's 16 tradeable commodities in their own units with `Load 0 of 20 t`; the `Page N/2` indicator is always visible. `Tab`/`PageDown` advance, `PageUp` returns, and paging never mutates the profile or writes a save.
- F7 renders `Data on Lave`, the seven `sysdata-*` rows plus the inhabitants row, and `System.description` verbatim; the model count is exactly 8 `dt` rows.
- `loadLabels()` joins the boot load beside equipment and commodities, and a `LabelsError` fails the boot visibly through the existing boundary.
- The home menu advertises all four sections; the shell still boots on `data-screen="home"` and no section is mounted until a key opens it. `formatFuel(70)` keeps `7.0 LY` and `setFuel` follows every profile commit.

### Probe and keyboard proof (`src/app/probe.ts`, `tests/e2e/station.spec.ts`)

- `probe.station` now carries `open`, `screen`, `selectedKey`, `page`, `pending` and `message`; `probe.economy` carries `fuel`, `missiles`, `passengerBerths`, `holdPods`, `capacityPods` and `lastTrade` — all added before any assertion.
- The whole `station.spec.ts` flow starts at the real initial focus: Tab to `#title-start`, Enter, then programmatic focus of `#title-confirm-accept` + Enter when a save exists. Continue after a reload uses the same keyboard path. No `page.click`/`hover`/`tap` remains.
- The primary no-reload proof installs a bubble-phase `window` listener that records `event.defaultPrevented` for synthetic cancelable F3/F5/F7/F8 events (all `true`), then sets `document.body.dataset.capture = "1"` and proves the same events report `false` (the capture listener must exist and must be conditional). Ctrl+F5 reports `false`. `window.__stationSentinel` and the navigation-entry count are asserted only as secondary signals after real F-key presses.
- `Tab` in `dockScreen` is consumed and `document.activeElement` stays inside `#station-screen`; Esc returns home without pausing; KeyP pauses/resumes without leaving the section; Digit1 is inert inside a section; F8/F3/F5/F7 switch directly between sections and are inert in flight.
- Dimming is proved through `getComputedStyle` opacity `0.6` on a zero-stock F8 row and the disabled F3 Docking Computers row, so deleting the CSS rule fails even while the model flag stays true.

## Tasks and Commits

| Task | Name | Commit |
|------|------|--------|
| 1 | F3 outfitting screen, two-state confirm, disabled-row guard and the complete probe | `5716393` |
| 2 | F5 two pages, F7 system data, sentinel no-reload and the keyboard-only start | `069b7b6` |
| — | Interleaved quick-task docs commit (not part of this plan) | `7d09115` |

`git rev-list --count ba85a9b..069b7b6` = 3 because a concurrent `docs: capture todo` commit landed between the two plan commits; the plan itself owns `5716393` and `069b7b6`.

## Verification

All commands ran in Docker, never on the host.

| Command | Result |
|---|---|
| `docker compose run --rm typecheck` | green (both projects) |
| `docker compose run --rm test npx vitest run tests/ui/station-outfitting.test.ts tests/sim/player/outfitting.test.ts` | 66 passed |
| `docker compose run --rm test npx vitest run tests/ui` | 4 files / 50 tests passed |
| `docker compose run --rm test` (full unit) | 81 files / 914 tests passed |
| `docker compose run --rm e2e ... station.spec.ts docking.spec.ts` | 12 passed |
| `docker compose run --rm e2e ... station.spec.ts scene.spec.ts precision.spec.ts fallback.spec.ts` | 16 passed |
| `docker compose run --rm lint` | green (ESLint + Prettier) |

Key browser evidence: F3 at Lave shows Large Cargo Bay `Not enough credits`, Docking Computers `Requires TL 9`, Missile `(3/3)` `Pylons full`, Remove Missile enabled at `Remove Missile — 20 Cr`, and no Fuel row. A first `KeyY` opens the prompt, the second commits 1700 dc with 0 missiles and one new save, and a third `KeyY` changes nothing. F5 reports `Page 1/2` then `Page 2/2` with 16 manifest rows; F7 reports every Lave figure and the verbatim description. A real F5/F3/F7/F8 press leaves `window.__stationSentinel` at `"before"` and the navigation-entry count at 1.

Acceptance greps: `stationOutfitting`, `buildOutfittingModel`, `applyFit`, `stationConfirm` and `kind: "fit"` are present; the full probe fields appear in `probe.ts`/`game-session.ts`; no `innerHTML`/`insertAdjacentHTML`/`outerHTML` appears in `src/ui/station.ts`; the only `createElement("button")` path remains the home Launch control; no `page.click`/`hover`/`tap` remains in `station.spec.ts`.

## Deviations from Plan

### Auto-fixed / interpretation issues

**1. [Plan structure] The F5/F7 render branches landed in the Task 1 commit**
- **Found during:** implementing the station shell.
- **Issue:** Task 2 owns the F5/F7 branches, but `src/ui/station.ts`, `index.html` and `src/app/game-session.ts` are the same files Task 1 rewrites; splitting the shell into two incremental states would have committed an intermediate panel structure only to replace it.
- **Fix:** the shell and session changes (including the F5/F7 branches and `loadLabels`) were committed with Task 1; Task 2's commit carries the F5/F7/F8 browser proofs and the scene-spec update. The plan's task split is preserved in the test/evidence layer.
- **Files modified:** `src/ui/station.ts`, `index.html`, `src/app/game-session.ts`.

**2. [Plan discretion] Probe `pending` and `lastTrade` shapes**
- **Found during:** completing the probe.
- **Issue:** the plan names the fields but not their shape.
- **Fix:** `pending` is `{kind:"fit"|"trade", key}` (JSON-safe, narrowable) and `lastTrade` is `{kind:"buy"|"sell"|"fit"|"removal", key, amount}`; both are published from the same session state the screens read.
- **Files modified:** `src/app/probe.ts`, `src/app/game-session.ts`.

**3. [Rule 2 - Missing critical functionality] CSS opacity for the dimmed proof**
- **Found during:** writing the F8/F3 dimming assertions.
- **Issue:** the existing `.dimmed` rule changed only `color`, so deleting it would leave `getComputedStyle(...).opacity` at 1 and the plan's computed-style proof could not fail.
- **Fix:** `.station-table tr.dimmed` and `.station-row.dimmed` now also set `opacity: 0.6`, asserted with `toHaveCSS`.
- **Files modified:** `index.html`.

**4. [Rule 2 - Missing critical functionality] Selection clamp after a committed removal**
- **Found during:** the third-KeyY proof.
- **Issue:** leaving `stationSelection` on the removed key would leave no selected row and make the detail null; clamping to the first row could put an affordable row under the next Y.
- **Fix:** the cursor clamps by position to the nearest surviving row (the new last row for the missile removal), which at 1700 dc is the unaffordable passenger berth, so a third `KeyY` opens nothing.
- **Files modified:** `src/app/game-session.ts`.

No authentication gates and no package installs occurred.

## Known Stubs

None. The four screens are complete for this plan's scope; save hardening, the paused-input proof and the phase gate remain 05-06's work.

## Threat Flags

None beyond the plan's threat register. T-05-12 is proved by the `defaultPrevented` assertion plus its capture-mode negative control and the chord exemption; T-05-13 by the context-only Esc/KeyP/Digit1 assertions; T-05-25 by non-focusable rows, the home-only Launch and the disabled-row `KeyY` no-op; T-05-26 by the paused synthetic-key proof. Every station string is written with `textContent`, and one `AbortController` owns every shell listener.

## Self-Check: PASSED

- Created files: none expected; all six modified files exist and are tracked.
- Commits exist and are ancestors of HEAD: `5716393`, `069b7b6` (plus the interleaved `7d09115`).
- Measured commits between the ledger base and HEAD: 3, matching `actuals.commits`; the plan owns two of them.
- Full unit suite, both scoped e2e runs, typecheck and lint pass in Docker.
