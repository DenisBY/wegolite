---
phase: 19-equipment-damage-and-repair
plan: 12
subsystem: ui
tags: [outfitting, repair, f3-money-path, f5-status, test-hook, oolite-fidelity]
requires:
  - phase: 19-equipment-damage-and-repair
    provides: "19-05 repair door (checkRepair, applyRepair, parseRepairFitKey, SINGLE_INSTANCE_KEYS); 19-09 probe field; 19-10 damage flow"
provides:
  - "OutfittingRow.verb, REPAIR_LABEL_TEMPLATE, REPAIR_DETAIL_TEMPLATE, DAMAGED_STATUS_SUFFIX"
  - "the F3 repair row and detail, the verb-driven prompt, confirmRepair in the station controller"
  - "F5 lists damaged items first as `<name> (damaged)` in damage order"
  - "WegoliteLastTradeProbe.kind repair"
  - "the ?test=1 grantEquipment limited to SINGLE_INSTANCE_KEYS"
  - "two Key Decisions rows and a CHANGELOG entry"
affects: [19-11, 19-13, 19-14]
tech-stack:
  added: []
  patterns: ["composite row key parsed through an allow-list before the money path", "record re-read from the live catalogue at the second confirm"]
key-files:
  created: []
  modified:
    - src/ui/station-model.ts
    - src/app/session/station-controller.ts
    - src/app/probe.ts
    - src/app/session/probe-publisher.ts
    - tests/app/session/station-controller.test.ts
    - tests/ui/station-outfitting.test.ts
    - tests/ui/station-status.test.ts
    - tests/app/session/probe-publisher.test.ts
    - .planning/PROJECT.md
    - CHANGELOG.md
key-decisions:
  - "Repair at F3 for half price, one tech level lower, at once (Key Decisions row; no repair time, FIDELITY E-163; the Repair: label is Oolite's own rendered text, E-170)"
  - "F5 lists damaged items first, marked (damaged), in damage order (Key Decisions row; the one F5 divergence quoted by E-165 and E-169)"
requirements-completed: [CBT-12]
status: complete
actuals:
  tokens: 40000
  tasks: 3
  commits: 3
plan_head_before: e37410137716c03c40db943fa9f139fbd50b3a02
plan_head_after: 6a152aea7e04f813c0d29249a4299cd160a16336
duration: 50m
completed: 2026-11-21
---

# Phase 19 Plan 12: F3 repair door and F5 damaged list Summary

A damaged docking computer, galactic drive, compass or navigational array is now shown as damaged in F5 and repaired at F3 for Oolite's half price and one tech level lower, through the real station controller, with the `?test=1` grant limited to what F3 can install.

## What was built

- **F3 repair row** (`src/ui/station-model.ts`): in the VISIBLE loop a repairable key that is in `damagedEquipment` builds its row from `checkRepair` instead of `checkFit`, at the position the purchase row would have; key `<key>@repair`, label `Repair: <name>` (`REPAIR_LABEL_TEMPLATE` `" Repair:%@"` applied to Oolite's `" %@ "` wrapped name and trimmed), cost `repairPrice`, verb `Repair`. The selected repair row's detail is the item description followed by ` (Price is for repairing the existing system).` (`REPAIR_DETAIL_TEMPLATE`). `OutfittingRow.verb` is `Buy` on every other row, facing rows included.
- **Controller** (`station-controller.ts`): the prompt is `${row.verb} ${row.name} for <price>? [Y/N]`. `confirmFit` parses `parseRepairFitKey` first, looks the item up in the live `ctx.core.equipmentCatalogue` by the parsed key, and routes the second Y to the new `confirmRepair` (`checkRepair` re-check, `applyRepair`, identity means the state moved: notice `That repair is no longer available`, no commit; success records `lastTrade { kind: "repair", key: "<key>@repair", amount: 1 }`, one `commitProfile`, one autosave, clamp by position). A repair key never reaches `checkFit`/`applyFit`; a forged `EQ_ECM@repair` shows `Not offered`.
- **F5** (`buildStatusModel`): damaged items first, `<name> (damaged)` (`DAMAGED_STATUS_SUFFIX`), in damage order, falling back to the key for an unknown one.
- **Probe**: `WegoliteLastTradeProbe.kind` gains `"repair"` (union widened only; `probe-shape.json` unchanged).
- **Test hook** (`applyTestEquipment`): grants only a catalogue key in `SINGLE_INSTANCE_KEYS`, refuses a damaged key, counts `equipment` plus `damagedEquipment` against `MAX_EQUIPMENT_KEYS`. The measured callers (`tests/e2e/station.spec.ts:310, 1067`, `tests/e2e/docking.spec.ts:570, 629`) all grant `EQ_DOCK_COMP`, still accepted.
- **Records**: two Key Decisions rows (each outcome cell ends with `Reviewers: Fable, Kimi K3.1 Pro and Qwen4 Max agree (19-REVIEWS.md)`) and a CHANGELOG `Unreleased` / `Added` entry.

## Tests (journey counts and pins)

- `tests/app/session/station-controller.test.ts` (+5): the Tibedied (raw 8) journey: 10000 decicredits to 2500, `EQ_DOCK_COMP` last in `equipment`, `damagedEquipment []`, prompt `Repair Docking Computers for 750.0 ₢? [Y/N]`, `lastTrade` repair, exactly one `profiles` entry (commit) and one `autosave` call, `equipmentSet()` holds the item again, cursor clamped; the Buy prompt unchanged; catalogue replaced between the two Y presses (price 16000) charges 8000; a repair never reaches the purchase path; forged `EQ_ECM@repair`, `EQ_DOCK_COMP@fore`, `EQ_CARGO_BAY@repair` show Not offered.
- `tests/ui/station-outfitting.test.ts` (+9): repair row replaces the purchase row at the same index (Riinus), Tibedied lists repair where the item is not for sale, Leleer lists neither, Lave no repair, damaged `EQ_GAL_DRIVE` at Riinus `Repair: Galactic Hyperdrive` 2500.0 ₢ and absent at raw 8, 7499 listed/dimmed/`Not enough credits`/not confirmable (7500 confirmable), undamaged/non-repairable keys list no repair row, plist pins (`equip-repair-@` and `upgradeinfo-@-price-is-for-repairing` equal the exported templates; template on the wrapped name, trimmed, equals the label for every repairable item), detail text.
- `tests/ui/station-status.test.ts` (+3): F5 order (`Advanced Space Compass (damaged)`, `Docking Computers (damaged)`, `Large Cargo Bay`, missiles, berths, lasers) and the reversed damage order, key fallback, plist `equipment-@-not-available` = `%@ (N/A)` and the F5 text differs from it.
- `tests/app/session/probe-publisher.test.ts` (+5, new grant cases; harness `commit` made injectable): undamaged `EQ_DOCK_COMP` granted and taints; damaged refused with nothing committed; `EQ_WEAPON_PULSE_LASER`, `EQ_ECM`, `EQ_FUEL` refused (asserted to be catalogue keys, so the guard is what refuses); unknown key and duplicate refused; 60 installed + 4 damaged refuses any grant, 60 + 3 grants.

## Verification

- Targeted vitest per task and `docker compose run --rm typecheck`: clean after each task. TDD note: Task 1's controller journey was run RED first (3 repair tests failed on the planned assertions) before the implementation; commits are one per task as in earlier plans of this phase, not split RED/GREEN.
- Tracer gate (auto mode): the Task 1 journey, the existing F3 tests and typecheck were re-run end-to-end after Task 1 and passed before expansion.
- Full `docker compose run --rm test`: exit 0 (no coverage threshold error). `docker compose run --rm lint`: clean.
- Remote `verify` (the wrapper was started while sibling executors also queued; the wrapper serialises on its lock): `snapshot 6a152ae` (equals HEAD), `exit=0 elapsed=220s snapshot=6a152ae`; 279 files, 7320 tests passed, 10 skipped, 28 Playwright specs passed. No known flake occurred.
- Acceptance greps all met (Key Decisions rows 1/1, reviewers field 2, no PENDING, `SINGLE_INSTANCE_KEYS.has(key)` 1, `profile.damagedEquipment.includes(key)` 1, `reverse catalogue order` 1, `REPAIR_LABEL_TEMPLATE` 1, `Buy ${row.name}` 0, `applyRepair(` 1, plist-pin files 2).
- No twin hash moved, no `src/sim/npc/**`, `src/sim/world/**` or `ships-npc.json` change, so no NPC acceptance run.

## Deviations from Plan

None. The plan executed as written.

## Auth gates

None.

## Known Stubs

None.

## Threat Flags

None. T-19-20 (repair key routed only to `confirmRepair`, forged key Not offered) and T-19-21 (hook limited to `SINGLE_INSTANCE_KEYS`, damaged key refused, both lists bounded) are implemented and tested.

## Self-Check: PASSED

All ten modified files exist; commits dacdd5d, c2c7b44 and 6a152ae are ancestors of HEAD; `commits: 3` is measured from the ledger (`rev-list e374101..6a152ae`).
