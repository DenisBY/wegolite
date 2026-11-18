---
phase: quick
plan: 261118-emk
subsystem: economy / station screens (F3 outfitting)
status: complete
tags: [outfitting, f3, oolite-fidelity, ECON-05, ECON-08]
requires: []
provides:
  - isListedForPurchase (src/sim/player/outfitting.ts)
  - OutfittingModel.emptyText and OUTFITTING_EMPTY_TEXT (src/ui/station-model.ts)
  - the F3 empty-state line (index.html, src/ui/station.ts)
affects: [F3 outfitting screen, station controller confirm path]
tech-stack:
  added: []
  patterns:
    - "exhaustive Readonly<Record<FitRefusal, boolean>> listing table: a new refusal must be classified at compile time"
key-files:
  created: []
  modified:
    - src/sim/player/outfitting.ts
    - src/ui/station-model.ts
    - src/app/session/station-controller.ts
    - src/ui/station.ts
    - index.html
    - tests/sim/player/outfitting.test.ts
    - tests/ui/station-outfitting.test.ts
    - tests/app/session/station-controller.test.ts
    - tests/e2e/station.spec.ts
    - tests/e2e/autosave.spec.ts
    - CHANGELOG.md
    - FIDELITY.md
    - .planning/PROJECT.md
decisions:
  - "F3 lists an item only when Oolite's equipmentAllowed would (PlayerEntity.m:8293-8302); only insufficientCredits keeps a row listed, so credits never change which rows are listed"
  - "Unaffordable rows stay dimmed with 'Not enough credits' (owner decision 2026-11-18); the difference from Oolite's normal option colour is recorded in FIDELITY Open items (E-108)"
  - "Wegolite's integrity refusals (invalidPrice, invalidCondition) hide the row: a row that can never be bought is never advertised"
requirements: [ECON-05, ECON-08]
metrics:
  duration: 25min
  completed: 2026-11-18
actuals:
  tokens: 14100
  tasks: 2
  commits: 2
plan_head_before: b28fc7694dbad84a4db5601508bb7124fa7d8d5c
plan_head_after: e730ff4ccf52d91892c14c368f68cb2981174bd7
---

# Quick Task 261118-emk: Hide outfitting items that cannot be bought — Summary

F3 now lists only what Oolite's `equipmentAllowed` would list. An item above the
system's raw tech level, already fitted, or with no room to add it (full pylons,
full tank, no cargo space, 7-berth bound, nothing to remove) is hidden. An
unaffordable item stays listed, dimmed, with "Not enough credits". With nothing
listed, the screen shows Oolite's "No equipment available for purchase.".

## What changed

- `src/sim/player/outfitting.ts`: `isListedForPurchase(check)` over a frozen
  `Readonly<Record<FitRefusal, boolean>>` table. Only `insufficientCredits` is
  `true`. The doc comment cites `PlayerEntity.m:8293-8302`, says that credits are
  checked only in `tryBuyingItem` (`:9134`, `:9188`), and says the predicate
  depends on affordability being the last gate of `checkFit`, `checkLaserFit` and
  `canPurchase`. The money path (`checkFit`, `applyFit`, `checkLaserFit`,
  `applyLaserFit`) is unchanged.
- `src/ui/station-model.ts`: `buildOutfittingModel` skips rows that are not
  listed.
  - A laser row is listed when at least one facing passes every rule except
    affordability. When no facing is ok, its reason is the first listed refusal,
    "Not enough credits".
  - New `OutfittingModel.emptyText` and `OUTFITTING_EMPTY_TEXT`, pinned to the
    vendored `descriptions.plist`.
  - The facing sub-list and `fitReason` are unchanged.
- `src/app/session/station-controller.ts`: `confirmFit` does nothing on an empty
  list: no notice, no prompt, no save. It clears a stale pending prompt.
- `index.html` and `src/ui/station.ts`: a centred
  `<p data-field="outfitting-empty" hidden>`, filled from `emptyText`.
- `CHANGELOG.md`: an entry under [Unreleased] › Changed.
- `FIDELITY.md`: E-108 was the next free id at HEAD, because 261118-cyn had not
  landed. It adds a faithful Mechanics row (`src/sim/player/outfitting.ts:192`
  against `PlayerEntity.m:8293-8302`), a pin-verbatim excerpt and an Open items
  bullet.
- `.planning/PROJECT.md`: the TL 9 gate row ("Enforce the docking computer's TL
  9 gate against the raw system tech level") now carries the amendment in its
  Outcome cell.

## Re-pinned values and causes

All of these have one cause: rows above the tech level and other unfittable rows
are no longer emitted.

| Test | Before | After |
|------|--------|-------|
| station-outfitting: row keys at Lave | 13 keys (7 with Dock Comp, Gal Drive, Compass, Nav Array, Berth, Mining, Military) | 6 keys: Cargo Bay, Missile, Remove Missile, Remove Laser, Pulse, Beam |
| station-outfitting: Lave with fuel 34 | 14 keys | 7 keys (Fuel first) |
| station-outfitting: "short refusal reasons" | reasons "Requires TL n", "Pylons full", "Already installed", "No cargo space", "Maximum reached" | "listed and hidden rows": each case asserts the row is absent |
| station-outfitting: dimmed row + detail pane | EQ_DOCK_COMP ("A simple autopilot", 1500.0 ₢) | EQ_CARGO_BAY (name, description and price read from the catalogue; 400.0 ₢) |
| station-outfitting: missile label | asserted "Missile (4/4)" | 4/4 is hidden; asserts "Missile (0/4)" |
| station-outfitting: laser tech gate | Mining/Military "Requires TL 10" at Lave, Beam "Requires TL 4" at raw 3 | absent at Lave and raw 3 |
| station-outfitting: laser names/prices | built at Lave | built at raw TL 10, so Mining and Military are listed |
| e2e station.spec F3 journey | ArrowDown to Dock Comp, Y gives "Requires TL 9"; 1 + 6 downs to Remove Missile; 1 up after removal | Y on Cargo Bay at open gives "Not enough credits"; 2 downs; clamp lands on Remove Laser, 2 ups to Cargo Bay give "Not enough credits" (4000 > 1700 dc) |
| e2e station.spec market-then-F3 journey | 7 downs; 1 up, "Requires TL 5" | 2 downs; 2 ups, "Not enough credits" (4000 > 1662 dc) |
| e2e autosave.spec buy-and-removal | 1 + 6 downs; 1 up, "Requires TL 5" | 1 + 1 downs; 2 ups, "Not enough credits" |

New tests:

- The classification of all twelve refusals.
- Affordability is checked last: at 0 credits each check still returns
  techLevel, owned, pylonsFull, cargoSpace, maxInstances, fullFuel,
  nothingToRemove or noLaser.
- The listed-but-unaffordable Cargo Bay and Pulse laser.
- The full D-11 order at raw TL 10.
- The credits sweep: 4 tech levels × 7 profiles, with the same keys at 0 and at
  10,000,000 credits.
- The empty state, with the plist pin.
- Controller: buying the fourth missile moves the cursor to Remove Missile, and
  one further Y only opens the guard.
- Controller: on an empty list Y, Up and Down do nothing (no notice, no prompt,
  no save).

The facing sub-list tests ("opens the four facings …", "disables Remove Laser on
an empty facing …", "disables only the facings that cannot afford …") pass
unmodified, and so do all existing laser controller tests.

## Gate results

Local Docker:

- Targeted Vitest (outfitting, station-outfitting, station-interfaces,
  station-controller, economy-purity): 141 passed.
- `docker compose run --rm test` after Task 1: exit=0.
- `docker compose run --rm test` after Task 2: exit=0, 220 files, 5739 passed,
  10 skipped.
- `typecheck`: exit=0, after both tasks.
- `lint`: exit=0, after both tasks.
- Fidelity contract in verbatim mode, with `OOLITE_SRC` set to `git archive
  7437f22 src`: 9/9 passed, none skipped. The E-108 excerpt matches the pin.

Remote, one run at a time, on committed HEAD `e730ff4`:

- Targeted e2e (`station.spec.ts`, `autosave.spec.ts`, `station-tabs.spec.ts`,
  chromium): 46 passed. `exit=0 elapsed=132s snapshot=e730ff4`
- `verify`: assets:check no differences; 220 unit files passed; e2e smoke 27
  passed. `exit=0 elapsed=149s snapshot=e730ff4`

`verify-full` was not due: the change is browser-facing UI only, with no render,
input, persistence or network-guard change. The NPC acceptance run was not due
either: nothing under `src/sim/npc/**`, `src/sim/world/**` or `ships-npc.json`
changed. No known flake fired.

## For the owner

Oolite does not dim an unaffordable row. It draws the row in the item's
`displayColor` or `equipment_option_color` (`PlayerEntity.m:8381-8384`), with no
marker, and refuses the item only when you try to buy it (`:9134`). Wegolite
keeps the dimmed row and "Not enough credits", as you decided. FIDELITY Open
items (E-108) records the difference. Switching to the normal colour is a
one-line change to the row's `dimmed` flag in `buildOutfittingModel`.

Oolite's bargain tech days (`PlayerEntity.m:8274-8285`) are not modelled. They
stay in `.planning/todos/pending/2026-11-18-outfitting-bargain-tech-days.md`.

## Deviations from Plan

**1. [Rule 1 - Bug] The laser names/prices test needed raw TL 10.**

- **Found during:** Task 1.
- **Issue:** the plan did not list this test. It reads the Mining and Military
  rows at Lave, and those rows are now hidden.
- **Fix:** build the model at raw TL 10.
- **Files modified:** `tests/ui/station-outfitting.test.ts`.
- **Commit:** 789f46c.

**2. FIDELITY Open items cites `PlayerEntity.m:8381-8384` instead of the plan's
`8380-8384`.**

- **Found during:** Task 2.
- **Issue:** line 8380 at the pin is blank. The colour code is lines 8381-8384.
- **Fix:** cite the exact range.

**3. Wording of the PROJECT.md amendment.**

- **Found during:** Task 2.
- **Fix:** the plan's text was appended verbatim, after a period, to the
  existing Outcome cell.

Otherwise the plan was executed as written.

## Commits

- 789f46c feat(quick-261118-emk): list only the F3 equipment that can be fitted here, as Oolite
- e730ff4 test(quick-261118-emk): re-pin the F3 journeys and record Oolite's outfitting list

## Self-Check: PASSED

- The modified files exist: `src/sim/player/outfitting.ts`,
  `src/ui/station-model.ts`, `src/ui/station.ts`, `index.html`, `FIDELITY.md`.
- Commits 789f46c and e730ff4 are on main, unpushed.
