---
phase: 19-equipment-damage-and-repair
plan: 05
subsystem: sim
tags: [outfitting, repair, f3-money-path, fast-check, oolite-fidelity]
requires:
  - phase: 19-equipment-damage-and-repair
    provides: "19-03 damagedEquipment and DAMAGEABLE_EQUIPMENT_KEYS; 19-01 damage probabilities"
provides:
  - "REPAIRABLE_EQUIPMENT_KEYS (the DAMAGEABLE_EQUIPMENT_KEYS array itself), RepairableKey, isRepairableKey"
  - "repairFitKey, parseRepairFitKey, repairPrice, repairTechLevel, checkRepair, applyRepair (the third F3 door)"
  - "PurchaseRefusal damaged; FitRefusal damaged and notDamaged (both hide their row)"
  - "SINGLE_INSTANCE_KEYS exported"
  - "D-03 guard tests/guards/damageable-equipment.test.ts"
affects: [19-08, 19-12, 19-14]
tech-stack:
  added: []
  patterns: ["allow-listed door with composite row key parsed by membership, never `in`", "identity on every refusal"]
key-files:
  created:
    - tests/guards/damageable-equipment.test.ts
  modified:
    - src/sim/player/outfitting.ts
    - src/sim/player/profile.ts
    - src/ui/station-model.ts
    - tests/sim/player/outfitting.test.ts
    - tests/sim/player-profile.test.ts
    - tests/sim/player/damage.property.test.ts
key-decisions:
  - "checkRepair refuses `notDamaged` before `owned`, so an installed (working) item is notDamaged and only a forged profile holding the key in both lists reaches `owned`"
  - "repair price is Math.ceil(price / 2) after isValidPrice; an invalid catalogue price gives 0 and checkRepair refuses invalidPrice first"
requirements-completed: [CBT-12]
status: complete
actuals:
  tokens: 14000
  tasks: 3
  commits: 3
plan_head_before: afcacdace61620c3865690cf06c2cee6beefa613
plan_head_after: 3c590124abfd75bcd7a0fb9590f06e430a419e91
duration: 45m
completed: 2026-11-21
---

# Phase 19 Plan 05: The repair door on the F3 money path Summary

A damaged dock computer, galactic drive, compass or navigational array can now be repaired through a closed, re-checked sim door at Oolite's half price and one raw tech level lower, applied at once; a damaged item can no longer be bought a second time (D-08, D-09, D-10, D-03).

## What was built

- **Repair door** (`src/sim/player/outfitting.ts`): `REPAIRABLE_EQUIPMENT_KEYS = DAMAGEABLE_EQUIPMENT_KEYS` (one definition, no second literal), `isRepairableKey`, `repairFitKey` (`<key>@repair`), `parseRepairFitKey` (exactly two `@` parts, a repairable key, the literal `repair`), `repairTechLevel` (`TL > 0 ? TL - 1 : 0`, `PlayerEntity.m:8270-8271`), `repairPrice` (`Math.ceil(price / 2)`, `:9115-9118`; the doc records both of Oolite's halving and `equipmentPriceFactor` orders), `checkRepair`, `applyRepair`. `applyRepair` re-runs `checkRepair`, charges the repair price, removes the key from `damagedEquipment`, appends it last to `equipment`, takes no time input and returns the same object on a refusal.
- **Damaged purchase refusal** (`src/sim/player/profile.ts`): `PurchaseRefusal` gains `damaged`; `canPurchase` returns it right after `owned`. `checkFit` (single-instance keys delegate to `canPurchase`) reports it, so the purchase row is replaced by the repair row (`PlayerEntity.m:8403-8411`). `purchase` already returned the same object for a damaged key (19-03).
- **Refusal copy** (`src/ui/station-model.ts`): `case "damaged": "Needs repair"` and `case "notDamaged": "Not damaged"` in the exhaustive `fitReason` switch. Both refusals are hidden-row reasons (`LISTED_REFUSALS`), so nothing on screen changes until 19-12.
- **Exported** `SINGLE_INSTANCE_KEYS` for the D-03 guard and the 19-12 `?test=1` grant.

## Refusal order

- `checkRepair`: `notOffered` (not in the allow-list) -> `invalidPrice` (key length, catalogue price, repair price) -> `notDamaged` (key not in `damagedEquipment`) -> `owned` (key also in `equipment`: a forged profile) -> `techLevel` (tech level or raw level not a safe integer, or raw below `repairTechLevel`) -> `insufficientCredits` (last, so the row stays listed).
- `canPurchase`: `techLevel` -> `owned` -> `damaged` -> `invalidPrice` -> `insufficientCredits`.

## Forged-key table (parseRepairFitKey returns null)

`EQ_ECM@repair`, `EQ_CARGO_BAY@repair`, `EQ_WEAPON_PULSE_LASER@repair`, `EQ_DOCK_COMP`, `EQ_DOCK_COMP@fore`, `EQ_DOCK_COMP@repair@repair`, `@repair`, `repair`, the empty string, `__proto__@repair`, `constructor@repair`, `eq_dock_comp@repair`, `EQ_DOCK_COMP@Repair`. `checkRepair` refuses EQ_ECM, EQ_CARGO_BAY, EQ_MISSILE, EQ_WEAPON_PULSE_LASER and EQ_FUEL as `notOffered` even when a forged profile lists them as damaged, and an undamaged repairable key as `notDamaged`.

## Tests

- `tests/sim/player/outfitting.test.ts` (84 -> 98 cases, 14 new): the tracer (dock computer at raw 8: 10000 -> 2500, appended last, input untouched; raw 7 refused `techLevel` with identity; both-lists forged profile `owned` with identity), the forged-key table, the four tech boundaries (raw 8, 9, 6, 5 ok and one below refused), TL 0 stays 0 and malformed levels refused, credits 7500 ok / 7499 `insufficientCredits` (row stays listed), tech before credits, unsafe credits, the four prices 7500, 25000, 3250, 11250, 15001 -> 7501, NaN / 1.5 / 0 / -2 / 1e9+1 / Infinity `invalidPrice`, field preservation (only credits, `equipment`, `damagedEquipment` change; the other damaged item keeps its place), two sequential repairs, and `checkFit` `damaged` with the row hidden.
- `tests/sim/player-profile.test.ts` (+2): `canPurchase` `damaged` (after the tech gate, before an invalid price), `purchase` identity for a damaged key.
- `tests/guards/damageable-equipment.test.ts` (4 cases, SPDX header, reads the real compiled `equipment.json`): repairable `toBe` damageable; every damageable key round-trips `parseRepairFitKey(repairFitKey(key))`; the set equals the `SINGLE_INSTANCE_KEYS` members with `damageProbability > 0`; no laser record, `NO_LASER` or `EQ_WEAPON_THARGOID_LASER` in it, while the catalogue still has `EQ_WEAPON_PULSE_LASER` above 0 and none of the `EQ_WEAPON_` records is single-instance. Every message names CONTEXT D-03.
- `tests/sim/player/damage.property.test.ts` (2 -> 3 cases): repair joins purchase, damage and cargo loss (300 runs of 1 to 40 operations, raw tech 0..15, credits 0..30000); the invariant (disjoint, duplicate-free, at most 64, damaged keys inside the set, safe cargo), refusal identity, an acceptance oracle (`check.ok` equals damaged and not installed and tech and credits), credits `op.credits - repairPrice`, the key last in `equipment`, and a non-vacuity assertion that at least one repair was accepted. The totality case (500 runs) feeds arbitrary strings, `__proto__`, NaN, Infinity, negatives and fractions to `parseRepairFitKey`, `checkRepair` and `applyRepair`: none throws, an accepted repair keeps credits a safe non-negative integer, a refusal is identity.

## Deviations from Plan

None. Plan executed as written. One detail: Task 1 added `notDamaged` and Task 2 added `damaged` to `FitRefusal` (the plan's split), so Task 1's `fitReason` carries one arm and Task 2 the second.

## Auth gates

None.

## Known Stubs

None. `applyRepair` has no caller yet by design: 19-12 wires the F3 row and the controller, and the CHANGELOG entry and Key Decisions row land there.

## Threat Flags

None. Mitigations T-19-08 (allow-list shared with the damageable set and pinned by the guard, strict two-part parse, `notOffered`/`notDamaged` before arithmetic, re-check inside `applyRepair`, identity on refusal), T-19-09 (`isValidPrice` on the catalogue price and the repair price, `isSafeCredits` before and after, the totality property) and T-19-10 (`canPurchase` refuses `damaged`, the disjointness property) are implemented and covered.

## Verification

- Targeted: `docker compose run --rm test npx vitest run tests/sim/player tests/sim/player-profile.test.ts tests/ui tests/guards/damageable-equipment.test.ts tests/guards/damaged-equipment-in-use.test.ts`: 20 files, 422 tests pass (before Task 3's additions; the property file then 3 of 3).
- Full `docker compose run --rm test` at HEAD 3c59012: 276 of 278 files and 7220 of 7222 tests passed, 10 skipped. The two failures were timeouts under load from sibling executors in files this plan did not touch (`tests/guards/tools-determinism.test.ts` 30 s, the documented flake `tools/oolite-ingest/convert/textures.test.ts` 5 s); rerun alone, both files pass (25 tests). No coverage error line was printed.
- `docker compose run --rm lint`: clean (a first lint during the full suite failed with ENOENT on the suite's `__purity_dom_probe.ts`, the same concurrency artefact 19-03 recorded; rerun alone it passes). `docker compose run --rm typecheck`: clean.
- Acceptance greps: the four `export function` lines 4, `REPAIRABLE_EQUIPMENT_KEYS = DAMAGEABLE_EQUIPMENT_KEYS;` 1, `case "notDamaged"` 1, `equipmentPriceFactor` 1, `"damaged"` in `profile.ts` 2, `DAMAGEABLE_EQUIPMENT_KEYS` in the guard 6, `EQ_WEAPON_` in the guard 4, `damaged: false|notDamaged: false` 2.
- The 19-15 in-use tripwire still passes: the new code names no `EQ_GAL_DRIVE` or `EQ_ADVANCED_NAVIGATIONAL_ARRAY` token in non-comment code and no `autopilot` token (the pins stay at 3).
- No remote run (pure `src/sim/player`, two `fitReason` arms behind hidden rows), no CHANGELOG entry and no Key Decisions row (both land in 19-12 where repair becomes visible), no NPC acceptance run, no twin hash moved.

## Self-Check: PASSED

Created and modified files exist (`tests/guards/damageable-equipment.test.ts`, `src/sim/player/outfitting.ts`, `src/sim/player/profile.ts`, `src/ui/station-model.ts`, the three test files); commits c7c5354, 7a03807 and 3c59012 are ancestors of HEAD; `commits: 3` is measured from the ledger (`rev-list afcacda..3c59012`).
