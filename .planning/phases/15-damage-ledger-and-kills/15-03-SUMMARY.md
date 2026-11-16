---
phase: 15-damage-ledger-and-kills
plan: 03
subsystem: sim
tags: [populator, cargo, rng, golden, snapshot-v4, found-18, strip-and-rehash]
status: complete

requires:
  - phase: 15-damage-ledger-and-kills
    provides: plan 15-01 NpcShip.likelyCargo and maxCargo; plan 15-02 SpawnInit.cargo, Entity.cargo, MAX_ENTITY_CARGO and the ;cargo: hash segment
provides:
  - "cargoCountAtSpawn: Oolite's setCargoFlag: counting rule per populator role, total, capped at MAX_ENTITY_CARGO"
  - "RNG purpose \"cargo\" (code 4), a stateless per-spawn stream that is never stored"
  - "populateInertWorld spawns each ship with its cargo count; trafficContent passes likelyCargo and maxCargo"
  - "the regenerated inert Lave golden (ff6489bf) with its three-link strip-and-rehash proof"
  - "PROJECT.md Key Decisions row 'World snapshot version 4' and the amended steering-record outcome"
affects: [16, 17, 18, 19, 20]

plan_head_before: 7f54f8c756d33bbca7e49eb05338d2dea8af13f3
plan_head_after: f6eb1bdc6dac66a1a33c3aad0f0f581688fc1534
commits: 2

actuals:
  tokens: 17500
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "A stateless per-spawn stream (forkSeed(worldSeed, id, purpose), purpose never stored) adds a hashed field to a populated world without moving world.rng, the id counter or any stored entity stream"
    - "Strip-and-rehash chain: each regeneration is proven by removing its new segments and recovering the previous golden's fnv"

key-files:
  created: []
  modified:
    - src/sim/rng.ts
    - src/sim/world/populate.ts
    - src/app/session/traffic.ts
    - tests/sim/rng.test.ts
    - tests/sim/world/populate.test.ts
    - tests/app/session/traffic.test.ts
    - tests/helpers/inert-world.ts
    - tests/golden/world/inert-lave-epoch1.json
    - .planning/PROJECT.md

key-decisions:
  - "The cargo count is a port of Oolite's setCargoFlag: counting rule (ShipEntity.m:7323-7373) for the cargo type oolite-populator.js gives each role: trader and shuttle full, pirate a Ranrot fraction, hunter, police and scavenger none; statistically equal to Oolite, not stream-equal"
  - "The count comes from the stateless stream forkSeed(worldSeed, id, \"cargo\") (code 4), so world.rng, ids and every stored stream are bit-identical to the same population without cargo"
  - "The one Lave golden regeneration is taken here (fnv c1068643 to ff6489bf), after the cargo-at-spawn rule; the order is recorded as pending owner acknowledgement (OD-1), not approved"
  - "The capacity ignores equipment_weight (0 for the nine stock ships); a later equipment phase must revisit it"

requirements-completed: []

duration: 13 min of work plus the remote runs (verify 145 s, acceptance 78 s)
completed: 2026-11-16
---

# Phase 15 Plan 03: Cargo at spawn and the one Lave golden regeneration Summary

**Populated NPCs now spawn with a cargo capsule count by Oolite's setCargoFlag: rule from a stateless per-spawn stream, and the inert Lave golden moved once, c1068643 to ff6489bf, with the strip-and-rehash chain back to c1068643, ab72eedf and b23d11d8.**

## Accomplishments

- `cargoCountAtSpawn(role, likelyCargo, maxCargo, rng)` ports the counting rule of `setCargoFlag:`: `num = floor(likely * (0.5 + r))` capped at the capacity when `likely > 0`, else the capacity, capped at 200. Traders and the shuttle take `num`; a pirate takes `floor(r2 * (1 + floor(num / 2)))` (0 without a second draw when `num` is 0); hunters, police and scavengers return 0 without drawing. Any input that is not a safe integer >= 0 counts as 0; an unknown role returns 0; it never throws. The doc cites `oolite-populator.js` (`:1448`, `1492-1522`, `1711-1713`, `1862-1865`), `StationEntity.m:1629`, names the unmodelled opportunist-trader branch and the `equipment_weight` assumption.
- `RngPurpose` gained `"cargo"` with code 4; `ENTITY_RNG_PURPOSES` stays `["ai", "combat"]`, so no entity stores a cargo stream.
- `populateInertWorld` reads the id the ship is about to get, forks `forkSeed(world.worldSeed, id, "cargo")` per spawn (0 when the id is outside `0..MAX_UINT32`, so `forkSeed` cannot throw) and passes the count as `SpawnInit.cargo`. The `?test=1` hooks spawn with cargo 0 (documented). `trafficContent` maps `likelyCargo` and `maxCargo` into the populator records.
- Stream isolation is tested without the golden: the Lave population from records with and without the two fields has equal `world.rng.s`, `nextId`, and per entity equal id, key, position, orientation and `rng`; the with-cargo section minus the v4 segments equals the without-cargo section.
- `tests/helpers/inert-world.ts` now maps the two fields, the golden writer was run once, and `populate.test.ts` holds the three-link strip proof and a hand-written twelve-row cargo table.

## Golden regeneration (FOUND-18, D-09)

- Old fnv `c1068643`, new fnv `ff6489bf` (12 ships, seed 726532988). One run of `tests/helpers/write-inert-world-golden.ts`, then prettier; the golden changed by exactly the fnv and the section text.
- Strip proof, asserted in `populate.test.ts`: removing every `;vel:`, `;wpn:` and `;cargo:` segment re-hashes to `c1068643`; then removing `;steer:` gives `ab72eedf`; then removing `en:` gives `b23d11d8`. No `;vel:` or `;wpn:` segment is present, and `;cargo:` appears once per loaded ship (five).
- The golden and its Key Decisions row are in one commit (`f6eb1bd`).

### Cargo counts of the twelve Lave ships

| id | role | key | cargo |
|----|------|-----|-------|
| 101 | trader | moray | 5 |
| 102 | trader | cobramk1 | 10 |
| 103 | trader | adder | 2 |
| 104 | hunter | sidewinder | 0 |
| 105 | hunter | sidewinder | 0 |
| 106 | pirate | krait | 0 |
| 107 | pirate | sidewinder | 0 |
| 108 | pirate | moray | 1 |
| 109 | police | viper | 0 |
| 110 | police | viper | 0 |
| 111 | shuttle | adder | 2 |
| 112 | scavenger | cobramk1 | 0 |

## Task Commits

1. **Task 1: cargo count from the compiled record through traffic content and the populator to the spawned entity (tracer)** - `cf7ef4e` (feat)
2. **Task 2: the one Lave golden regeneration, the three-link strip proof and the Key Decisions row** - `f6eb1bd` (feat)

The tracer gate: Task 1's verify (four test files and typecheck) was green before expansion, and the stream-isolation case proves no hashed stream moved.

## Remote gates (by hand on the remote machine, committed HEAD `f6eb1bd`)

- `wegolite-remote-run.sh run --rm verify`: exit 0, elapsed 145 s, Playwright 27 passed (the traffic.ts gate).
- `wegolite-remote-run.sh run --rm test npm run test:acceptance`: exit 0, elapsed 78 s, **21 of 21 pass** (20 epochs plus the run-minimums case). Across all 20 seeds `repairs` 0, `aiFaulted` 0, `aiDropped` 0, `hashFailures` 0. `ACCEPTANCE-TOTALS`: stationArrivals 40, interceptArrivals 40, fleeArrivals 40, avoidCollisionEntries 23, attackTicksNearPlayer 61662, stuckWindowsEvaluated 175, frozenWindowsEvaluated 294, identical to the 15-02 run; accepted-crossings unchanged (none). The run pins no hash (`tests/acceptance/detectors.ts` only checks that `hashWorld` does not throw), so the moved golden does not affect it; frozen acceptance worlds populated from cargo-carrying records now hash differently.

## Local gates

- Targeted per task: rng, populate, traffic, traffic-variants (Task 1); populate and hud-model (Task 2): pass.
- `docker compose run --rm test` (full, coverage thresholds met): 204 files, 5179 tests passed, 10 skipped. No literal hash pin over a traffic-populated world moved other than the golden and the strip pins, so nothing outside the D-11 inventory.
- `docker compose run --rm lint`: clean. `docker compose run --rm typecheck`: clean.
- All acceptance criteria of both tasks pass (`cargo: 4`, `cargoCountAtSpawn`, `likelyCargo: ship.likelyCargo`, `PIRATE_GOODS`, `equipment_weight`, `c1068643` in the test, the old fnv gone and `;cargo:` present in the golden, `World snapshot version 4`, `forward_weapon_temp` and `OD-1` in PROJECT.md, golden and PROJECT.md in one commit).

## Owner-decision state

OD-1 (the regeneration taken in plan 15-03 after the cargo-at-spawn rule instead of in the first plan, and the reading of D-09 that the populated Lave golden changes while the strip-the-segment proof holds) is **open: pending owner acknowledgement**. It is recorded as such in the PROJECT.md row; nothing was self-approved. If the owner declines, the plan's fallback is to move the cargo rule and the regeneration into plan 15-02 (cost recorded in the plan).

## Deviations from Plan

None - plan executed exactly as written.

Minor notes (no behaviour change): the stream-isolation test builds its with-cargo and without-cargo records inline (reading `ships-npc.json`) so it stays valid after Task 2 made the shared helper carry cargo; `CHANGELOG.md` is unchanged because the cargo count is not user-visible yet (nothing reads it until Phase 16).

## Known Stubs

None. `Entity.cargo` is written at spawn and read by no behaviour yet; its reader (the explosion's capsule drop) arrives in Phase 16 by design.

## Threat Flags

None. No new endpoint, auth path or trust boundary; the threat register T-15-08, T-15-09 and T-15-10 are mitigated by the stateless stream with its isolation test, the id range check before `forkSeed`, and the totality property test.

## Self-Check: PASSED

- All nine modified files exist; commits `cf7ef4e` and `f6eb1bd` are ancestors of HEAD; `commits: 2` measured from the plan-head ledger (`7f54f8c..HEAD`).
