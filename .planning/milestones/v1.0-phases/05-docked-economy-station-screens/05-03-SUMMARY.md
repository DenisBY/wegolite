---
phase: 05-docked-economy-station-screens
plan: 03
subsystem: docked outfitting
tags: [outfitting, equipment, money, conditions, fuel, missiles, berths, removal, tdd]
requires:
  - 04 manual docking (profile, canPurchase/purchase, save bounds)
  - 05-01 extended profile (cargo/fuel/missiles/passengerBerths) and cargo pods
  - 05-02 exact pod capacity and the trusted plan/apply shape
provides:
  - VISIBLE_EQUIPMENT_KEYS, FUEL_CAPACITY, MAX_MISSILES, MAX_PASSENGER_BERTHS
  - FitContext, FitRefusal, FitCheck, fitPrice, checkFit, applyFit
  - REMOVAL_DESCRIPTIONS with Oolite-truthful missile/berth copy
  - the exported isValidPrice predicate shared with the profile module
affects:
  - 05-04 (F3 view model renders checkFit reasons and REMOVAL_DESCRIPTIONS)
  - 05-05 (session builds FitContext and calls applyFit then commitProfile)
  - 05-06 (phase gate re-runs this suite and the save bounds)
tech-stack:
  added: []
  patterns:
    - a visible-set refusal as the first money-path rule
    - fail-closed condition reading with a fixed refusal enum
    - phase-4 predicate delegation so no purchase rule is duplicated
    - removal economics mirroring Oolite's charge-then-trade-in
key-files:
  created:
    - src/sim/player/outfitting.ts
    - tests/sim/player/outfitting.test.ts
  modified:
    - src/sim/player/profile.ts
    - .planning/PROJECT.md
decisions:
  - The D-11 set is the exact ordered visible set and `notOffered` is the first check in both checkFit and applyFit.
  - The raw system tech level gates; the displayed +1 never does. The five single-instance keys delegate tech/owned/credits to canPurchase and append-and-charge to purchase.
  - Condition flags accept only true/"true" and requires_cargo_space only a finite integer 0..35; anything else is invalidCondition.
  - Fuel shows the fill cost (capacity - fuel) * 2; a full tank is fullFuel before the zero-cost price check.
  - Missile removal charges 200 dc then refunds 300 dc per mounted missile (+700 dc at three); berth removal charges 1000 dc with no refund.
  - Missiles are capped at 3 and berths at 7; both are integer counts, never duplicate equipment keys.
metrics:
  duration: 9 min
  completed: 2026-11-06
status: complete
actuals:
  tokens: 11945
  tasks: 2
  commits: 2
  plan_head_before: 1bcaf4be5193657b4aba16fedef3152a918ce06d
  plan_head_after: 9d6013946a01ca54a6837d593d4c4c3bf2498b24
---

# Phase 5 Plan 3: Peaceful Outfitting, Fail-Closed Conditions and Oolite Removal Economics Summary

One pure module decides every F3 row from the profile, the raw system tech level and the five v1 conditions — refusing out-of-set keys at the money path — then applies fuel fills, single-instance installs, missile/berth counts and Oolite's missile trade-in immediately, with no clock or install delay.

## What Was Built

### The visible set and pure availability (`src/sim/player/outfitting.ts`)

- `VISIBLE_EQUIPMENT_KEYS` is exactly D-11's ordered peaceful set: Fuel, Large Cargo Bay, Docking Computers, Galactic Hyperdrive, Advanced Space Compass, Advanced Navigational Array, Missile, Passenger Berth, then Remove Passenger Berth and Remove Missile.
- `checkFit` refuses `notOffered` for any other catalogue key first, so `EQ_ECM`, a laser, a shield booster or a forged record can never reach the money path. Keys the catalogue lacks are not looked up inside the module; callers pass the validated record.
- The order is fixed: visible set, key/catalogue price, fuel integrity, raw tech level, ownership, multiplicity, the five condition rules, affordability. Price is validated **before** the tech stage precisely so a corrupt catalogue row never reaches arithmetic; a comment records the deliberate difference from `canPurchase`.
- The five single-instance keys (`EQ_CARGO_BAY`, `EQ_DOCK_COMP`, `EQ_GAL_DRIVE`, `EQ_ADVANCED_COMPASS`, `EQ_ADVANCED_NAVIGATIONAL_ARRAY`) delegate their tech/owned/credits stage to Phase 4's `canPurchase`, mapping its reason straight onto `FitRefusal`. `applyFit` delegates their append-and-charge to `purchase`. Neither Phase 4 predicate is dead production code.
- Conditions fail closed: a present flag must be `true` or `"true"`, and `requires_cargo_space` must be a finite non-negative integer in 0..35. Anything else is `invalidCondition`, never "no requirement". Only the five v1 rules are read; `condition_script`, `available_to_all`, `weapon_info` and friends are ignored metadata. There is no script evaluator.
- `fitPrice` returns the catalogue price for non-fuel rows and `(fuelCapacity - fuel) * 2` for fuel. A full tank is `fullFuel`, not `invalidPrice`. Fractional or over-capacity fuel and a non-safe capacity refuse `invalidPrice`, and `fitPrice` itself fails closed on non-safe inputs so no fractional fill cost can reach the view model.
- Multiplicity: missiles are `pylonsFull` at the pylon capacity (capped at `MAX_MISSILES = 3`), berths are `maxInstances` at `MAX_PASSENGER_BERTHS = 7`, and a berth needs five free pods (`cargoSpace`).
- `REMOVAL_DESCRIPTIONS` carries app-side truthful copy: the missile row states the full catalogue-value re-sale, the berth row states that no refund is paid. The generated catalogue is never hand-edited.

### Immediate effects (`applyFit`)

- `applyFit` re-runs `checkFit` (including `notOffered`) and returns the **same** profile object on any refusal. It never mutates its input.
- `EQ_FUEL` sets fuel to the context capacity and subtracts exactly the fill cost. `EQ_MISSILE` and `EQ_PASSENGER_BERTH` increment their counts. The five single-instance keys append-and-charge through `purchase`, which spreads the profile so cargo, fuel, missiles and berths survive.
- `EQ_MISSILE_REMOVAL` charges 200 dc, computes `profile.missiles * ctx.missilePrice` before zeroing the count, then subtracts the fee and adds the full trade-in once: three missiles from 1000 dc become 1700 dc (+700), one missile becomes 1100 dc (+100), and 199 dc refuses `insufficientCredits` because the refund never counts toward affordability. This mirrors `PlayerEntity.m:9326-9330`, `:9410-9427` and `:9431-9438`.
- `EQ_PASSENGER_BERTH_REMOVAL` decrements one berth and subtracts exactly 1000 dc with no refund; it never adds credits.
- A forged trade-in price (`ctx.missilePrice` not a non-negative safe integer within `MAX_EQUIPMENT_PRICE`) refuses `invalidPrice` in `checkFit`, so the row is dimmed rather than silently no-opped at apply time.
- Every resulting field stays inside its save-schema bound: credits are safe and non-negative, fuel 0..70, missiles 0..3, berths 0..7, equipment unique.

### Profile

- `isValidPrice` is now exported from `src/sim/player/profile.ts` with its body unchanged. `outfitting.ts` imports it; the plan set has exactly one price predicate and one `MAX_EQUIPMENT_PRICE` bound.

### Decisions recorded in `.planning/PROJECT.md`

The missile cap of 3 and berth cap of 7, immediate purchase with no Oolite install delay, the adopted missile trade-in and non-refunding berth removal (already partly recorded), the v1 `requires_free_passenger_berth` reinterpretation, the visible set as a money-path boundary, and the berth-price and synthetic TL 9 install decisions that were already present.

## Tasks and Commits

| Task | Name | Commit |
|------|------|--------|
| 1 | Pure availability: visible set, notOffered, tech gate, fail-closed conditions, multiplicity, fuel price | `b4a19b7` |
| 2 | Apply: immediate effects, multi-instance counts, integer guards and Oolite removal economics | `9d60139` |

## Verification

All commands ran in Docker, never on the host.

| Command | Result |
|---|---|
| `docker compose run --rm test npx vitest run tests/sim/player/outfitting.test.ts` (Task 1) | 29 passed |
| `docker compose run --rm test npx vitest run tests/sim/player/outfitting.test.ts` (Task 2 RED) | 9 apply tests failed before implementation |
| `docker compose run --rm test npx vitest run tests/sim/player/outfitting.test.ts tests/sim/economy/cargo.test.ts tests/sim/player-profile.test.ts` | 84 passed (3 files) |
| `docker compose run --rm test` (full unit) | 76 files / 855 tests passed |
| `docker compose run --rm typecheck` | green (both projects) |
| `docker compose run --rm lint` | green (ESLint + Prettier) |

Acceptance checks: `VISIBLE_EQUIPMENT_KEYS`, `FitContext`, `FitRefusal`, `fitPrice`, `checkFit` and `applyFit` are exported; `rg "function isValidPrice" src/sim/player/outfitting.ts` is empty; no `condition_script`, `eval(`, `new Function`, `Math.random`, wall clock, DOM or Three.js appears in the module; both removal strings are present with the missile row stating the full-value trade-in and only the berth row stating no refund.

Task 2's TDD cycle was observed: the apply tests failed (9 failures) against the Task 1 stub, then passed after the effects were implemented. Task 1's availability tests passed on their first run after the module was written; the module and its tests were authored together.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Missile removal's trade-in price refuses in `checkFit`, not only `applyFit`**
- **Found during:** implementing the removal economics.
- **Issue:** the plan's Task 2 says `applyFit` must refuse `invalidPrice` when `ctx.missilePrice` is malformed. If only `applyFit` checked it, `checkFit` would approve the row and `applyFit` would return the profile silently with no reason the view model could render — the exact fail-open T-05-31 forbids.
- **Fix:** `checkFit` validates `ctx.missilePrice` as a non-negative safe integer within `MAX_EQUIPMENT_PRICE` for `EQ_MISSILE_REMOVAL`, so the row is refused with a fixed reason.
- **Files modified:** `src/sim/player/outfitting.ts`.
- **Commit:** `9d60139`.

**2. [Rule 2 - Missing critical functionality] `fitPrice` fails closed on fractional fuel/capacity**
- **Found during:** the first availability test run.
- **Issue:** `(70 - 69.5) * 2 = 1` is an integer, so a fractional tank produced a 1 dc row price instead of 0. `checkFit` refuses the purchase, but the view model would still show a fill cost computed from corrupt state.
- **Fix:** `fitPrice` returns 0 unless `profile.fuel` and `ctx.fuelCapacity` are safe integers, matching `checkFit`'s fuel integrity rule.
- **Files modified:** `src/sim/player/outfitting.ts`, `tests/sim/player/outfitting.test.ts`.
- **Commit:** `b4a19b7`.

**3. [Plan instruction interpretation] `PASSENGER_BERTH_PODS` is imported from `cargo.ts`**
- **Found during:** writing the condition rule.
- **Issue:** the plan's import list named the profile helpers only. Five tonnes per berth already exists as `PASSENGER_BERTH_PODS` in `src/sim/economy/cargo.ts`; restating it would create a second source of truth.
- **Fix:** import the existing constant and use `Math.max(catalogueN, PASSENGER_BERTH_PODS)` for a berth, so the D-14 five-tonne rule holds even if a record omitted the condition.
- **Files modified:** `src/sim/player/outfitting.ts`.
- **Commit:** `b4a19b7`.

No authentication gates and no package installs occurred. The plan estimated 48k tokens across 2 tasks; the realized diff is ~11.9k tokens over 2 task commits.

## Known Stubs

None. `applyFit` is complete for all ten visible keys; the F3 screen itself is plan 05-04's work, not a stub in this module.

## Threat Flags

None beyond the plan's threat register. T-05-07/08/09/22/23/31/33 are exercised by the unit tests: raw-tech equality and one-below, `notOffered` for `EQ_ECM`/lasers/defensive records, malformed conditions and non-safe fuel/price, the 0/1/3-missile and 199 dc removal boundaries, and the `canPurchase`/`purchase` delegation with a field-preserving profile.

## Self-Check: PASSED

- Created files exist: `src/sim/player/outfitting.ts`, `tests/sim/player/outfitting.test.ts`.
- Commits exist and are ancestors of HEAD: `b4a19b7`, `9d60139`.
- Measured commits: `git rev-list --count 1bcaf4b..9d60139` = 2, matching `actuals.commits`.
- Full unit suite, focused suites, typecheck and lint pass in Docker.
