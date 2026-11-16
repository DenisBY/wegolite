---
phase: 13-views-lasers-and-shields
plan: 05
subsystem: sim
tags: [combat, lasers, shields, energy, cabin-temperature, constants-ledger, sanitize]
requires:
  - phase: 13-views-lasers-and-shields
    provides: "13-02 shared view and mount vocabulary (Facing, LaserKey, LaserMounts, NO_LASER)"
provides:
  - "src/sim/combat/constants.ts: the combat ledger (four lasers, heat, shield, energy, cabin, range numbers, Cobra weapon and view offsets, toWegoliteLocal), each with its Oolite file and line"
  - "fireGate, applyShot, coolWeapons, laserTempGauge: Oolite's laser gates, cost and cooling in integer ticks"
  - "rechargeEnergyAndShields, routeDamage, coolCabin, shieldGauge, energyBanks, cabinTempGauge"
  - "PlayerCombatState with createPlayerCombatState, isPristineCombat, dockReset, launchReset, sanitizeCombat, serializeCombat"
affects: [13-08, 13-10, 13-12, 13-15]
actuals:
  tokens: 18300
  tasks: 3
  commits: 3
plan_head_before: 8e07469e160f15e9f77538762adc69fdc6b96ec2
plan_head_after: ccddae3c9bbb982f0d87dc72e4da092291de34f5
tech-stack:
  added: []
  patterns:
    - "Ledger constants pinned by a test that reads the compiled JSON with node:fs (Pitfall 14)"
    - "Integer-tick quantisation of Oolite's strict float-seconds recharge gate"
    - "Pristine predicate so the world hash appends the combat line only after a fight (isNeverSpawned device)"
key-files:
  created:
    - src/sim/combat/constants.ts
    - src/sim/combat/weapons.ts
    - src/sim/combat/shields.ts
    - src/sim/combat/state.ts
    - tests/sim/combat/constants.test.ts
    - tests/sim/combat/weapons.test.ts
    - tests/sim/combat/shields.test.ts
    - tests/sim/combat/state.test.ts
  modified: []
key-decisions:
  - "Recharge gate in integer ticks: rechargeTicks = round(rate * 120) and the strict gate shotTicks > rechargeTicks gives shot periods 61 (pulse), 13 (beam, military) and 301 (mining); shot timers saturate at 12000 ticks, also their start value, so an idle state stays pristine"
  - "External cabin temperature is 0 (D-05) and heat insulation 1; the Oolite sun branch is not ported, cooling stops below the 60 floor with no clamp, so 256 falls under 60 after exactly 960 ticks (8.0 s)"
  - "routeDamage: applied is the overflow past the struck shield before the energy floor; the cabin heats by the full overflow, as Oolite does; a non-finite, zero or negative amount is a no-op; a non-finite side test falls to the forward shield"
  - "sanitizeCombat bounds: shields 0..128, energy 0..256, cabin 0..256, laser temperature 0..256, timers integer 0..12000; non-finite shield, energy or cabin return to the pristine value"
requirements-completed: [CBT-05, CBT-06, DOCK-10]
coverage:
  - id: D1
    description: "Every combat number lives in one ledger module with its Oolite file and line; the four lasers and the Cobra's energy, recharge, weapon and view offsets are pinned to the compiled content"
    requirement: CBT-05
    verification:
      - kind: unit
        ref: "tests/sim/combat/constants.test.ts#LASER_STATS (ledger vs equipment.json weapon_info) / Cobra constants (ledger vs ships-client.json extras)"
        status: pass
    human_judgment: false
  - id: D2
    description: "A laser fires only past its recharge in ticks (pulse 61, beam and military 13, mining 301), refuses overheat at 0.85 of 256 and noEnergy at or below the shot cost, and costs energy and heat; all four facings cool at 6 per second"
    requirement: CBT-05
    verification:
      - kind: unit
        ref: "tests/sim/combat/weapons.test.ts#held fire, worked examples / fireGate / coolWeapons"
        status: pass
    human_judgment: false
  - id: D3
    description: "Shields and energy recharge by Oolite's algorithm: banks first, lower shield first, ties to aft, 0.25 bank threshold"
    requirement: CBT-06
    verification:
      - kind: unit
        ref: "tests/sim/combat/shields.test.ts#rechargeEnergyAndShields"
        status: pass
    human_judgment: false
  - id: D4
    description: "A hit drains the facing shield then energy, floors energy at 0, heats the cabin by 0.5 per energy point (D-05); the cabin cools toward 0 at Oolite's rate, 256 to under 60 in 960 ticks, and stops below 60 (D-06)"
    requirement: CBT-06
    verification:
      - kind: unit
        ref: "tests/sim/combat/shields.test.ts#routeDamage / coolCabin"
        status: pass
    human_judgment: false
  - id: D5
    description: "Docking restores shields, energy, laser temperatures and cabin; launch resets the facing and temperatures; sanitizeCombat repairs non-finite and out-of-domain fields; serializeCombat is one canonical line"
    requirement: DOCK-10
    verification:
      - kind: unit
        ref: "tests/sim/combat/state.test.ts#dockReset (DOCK-10) / launchReset / sanitizeCombat / serializeCombat"
        status: pass
    human_judgment: false
duration: 16min
completed: 2026-11-14
status: complete
---

# Phase 13 Plan 05: Player Combat Core Summary

**The pure player combat core: a ledger of Oolite's combat numbers pinned to the compiled content, laser gating, heat and cut-out in integer ticks, Oolite's shield and energy recharge, damage routing with cabin heat, cabin cooling, and a player combat state with its dock and launch resets, sanitiser and canonical text.**

## Performance

- **Duration:** about 16 min (2026-11-14, 23:37 to 23:54 UTC)
- **Tasks:** 3 (1 tracer, 2 TDD)
- **Files:** 8 created, none modified (four modules, four test files; 1,986 lines)

## Accomplishments

- `constants.ts` is the single home of the combat numbers, each with an Oolite file and line (W, S, C rows of the RESEARCH ledger). `constants.test.ts` reads `equipment.json` `weapon_info` and the Cobra's `ships-client.json` extras with `node:fs` and pins range, energy, damage, recharge, shot temperature and colour of the four lasers, the derived ticks (60, 12, 300, 12), max energy 256, recharge 4 and the eight offset strings. A drift in either side fails a test (Pitfall 14).
- The laser path is a port in the Oolite tick order (fire gate and shot, then cooling and timers). Held fire gives a pulse period of 61 ticks, beam and military 13, mining 301. The first overheat refusal lands on the attempt after shot 56, at tick 3416, which matches the hand derivation (3.95 net heat per shot against the 217.6 cut-out) and RESEARCH's prediction.
- Shield and energy recharge follow `PlayerEntity.m:2575-2625` exactly, including the transient unclamped bank, the 0.25 bank threshold with the `- 0.1` guard, the lower-shield-first order and aft-first ties; worked numbers are in the test comments.
- `routeDamage` sends a hit ahead or exactly abeam to the forward shield and a hit from behind to the aft shield, spills the overflow into energy (floored at 0) and heats the cabin by 0.5 per point up to 256. Non-finite amounts are ignored (T-13-09).
- `coolCabin` pulls toward an external 0 (D-05); 256 falls under 60 after exactly 960 ticks (8.0 s, leaving 59.9078) and cooling then stops, pinned by simulation.
- `PlayerCombatState` has an exact pristine predicate (for plan 13-08's world-hash append), `dockReset` (DOCK-10), `launchReset`, `sanitizeCombat` (idempotent, counts repairs) and `serializeCombat` (one `combat=` line through `canon`).

## Task Commits

1. **Task 1: Ledger, laser gate and heat, state skeleton (tracer)** - `bea7280` (feat)
2. **Task 2: Shields, energy banks, damage routing and cabin temperature** - `0a1c212` (feat)
3. **Task 3: Pristine state, dock and launch resets, sanitiser and canonical text** - `ccddae3` (feat)

**Plan metadata:** recorded in the final docs commit.

## Files Created/Modified

- `src/sim/combat/constants.ts` - the ledger, `LASER_STATS`, offsets, `toWegoliteLocal`
- `src/sim/combat/weapons.ts` - `fireGate`, `applyShot`, `coolWeapons`, `laserTempGauge`
- `src/sim/combat/shields.ts` - recharge, `routeDamage`, `coolCabin`, gauges, `energyBanks`
- `src/sim/combat/state.ts` - `PlayerCombatState` and its create, pristine, reset, sanitise and serialise functions
- `tests/sim/combat/{constants,weapons,shields,state}.test.ts` - ledger pins, worked examples and behaviour cases

## Decisions Made

- Followed the plan's recorded choices (integer-tick gate, external temperature 0, insulation 1, order inside a tick, shot timers not reset at dock).
- `routeDamage` returns `{ shieldAbsorbed, applied }` with `applied` the overflow past the shield before the energy floor; the cabin heats by that full overflow, as in Oolite (`PlayerEntity.m:5669-5676`), even when energy is already near 0. Plan 13-08 and 13-10 use `shieldAbsorbed` for the `shipHit` event's `shield` flag.
- `sanitizeCombat` lower bound for the cabin is 0 (Oolite has no lower clamp; the undershoot below 60 is valid, so 60 is not a lower bound).
- `toWegoliteLocal` returns `+0`, never `-0`, for a zero z, so `toEqual` comparisons and `canon` text stay stable.

## Deviations from Plan

None - plan executed exactly as written. Two small hardening choices went beyond the plan's wording and are recorded above: `routeDamage` also ignores a zero or negative amount, and treats a non-finite attacker offset as forward. Both are covered by tests and fall under T-13-09.

**Total deviations:** 0. **Impact:** none.

## Verification

- `docker compose run --rm test npx vitest run tests/sim/combat/` - pass (constants 15, weapons 20, shields 25, state 39 tests, plus the earlier octree and hit tests)
- `docker compose run --rm test npx vitest run tests/compliance.test.ts` - pass (SPDX headers on all eight new files)
- `docker compose run --rm test` (full suite with coverage floors) - exit 0
- `docker compose run --rm lint` and `docker compose run --rm typecheck` - pass
- Acceptance greps: `rg -c 'LASER_STATS' constants.ts` = 1, `rg -c 'export function routeDamage'` = 1, `rg -c 'export function dockReset'` = 1; `rg 'src/content|from "three"'` over the combat modules prints nothing.
- No browser-facing code changed, so `verify` and `verify-full` were not run (pure `src/sim` plan).

## Known Stubs

None. These modules have no `stepSim` consumer yet by plan; plan 13-08 drives them.

## Threat Flags

None. T-13-09 (non-finite damage or state) is mitigated: `routeDamage` ignores non-finite amounts, `sanitizeCombat` repairs every field, and `serializeCombat` through `canon` throws on a non-finite value so an unsanitised state cannot hash silently.

## Next Phase Readiness

Ready for the next plan. 13-08 wires the order (fire gate and shot, then `coolWeapons`, `rechargeEnergyAndShields`, `coolCabin`; `dockReset` on the docked event, `launchReset` on launch), calls `sanitizeCombat` before hashing, appends `serializeCombat` only when `!isPristineCombat`, and passes `LASER_STATS`-derived ranges to the ray. 13-12 feeds the HUD from `shieldGauge`, `energyBanks` (returned as `[E1, E2, E3, E4]`, E4 the bottom bank), `laserTempGauge` and `cabinTempGauge` (a new game reads 0.234375).

## Self-Check: PASSED

- All eight created files exist; commits `bea7280`, `0a1c212`, `ccddae3` are ancestors of HEAD.
