---
phase: 13-views-lasers-and-shields
plan: 07
subsystem: sim/world
tags: [world-model, energy, hash, snapshot, golden, combat]
requires:
  - phase: 13-views-lasers-and-shields
    provides: "13-16 NpcShip.maxEnergy and energyRechargeRate compiled into ships-npc.json"
provides:
  - "Entity.energy, maxEnergy and energyRechargeRate; SpawnInit.maxEnergy? and energyRechargeRate? (defaults 200 and 1.0, start at full energy)"
  - "limits.ts: NPC_DEFAULT_MAX_ENERGY, NPC_DEFAULT_ENERGY_RECHARGE_RATE, MAX_ENTITY_ENERGY (1e6), MAX_ENERGY_RECHARGE_RATE (1e3)"
  - "serializeEntity en:<energy>,<maxEnergy>,<rate> segment after repairs"
  - "sanitizeEntity repairs the bank before every hash"
  - "WORLD_SNAPSHOT_VERSION 2 with the three fields under strict keys and bounded limits"
  - "InertShipRecord and PlannedShip carry the energy; trafficContent maps it from the NPC catalogue; regenerated inert-lave-epoch1 golden"
affects: [13-10, 13-12, 14]
requirements-completed: [CBT-07]
actuals:
  tokens: 11067
  tasks: 3
  commits: 3
plan_head_before: 7b35ab38b2eeaa27c76f90b1e2a4a1773e1ef81f
plan_head_after: 7903139598a245133e3ba0a008cb159224b154f3
tech-stack:
  added: []
  patterns:
    - "A new entity field is added to Entity, spawn, hash text, sanitize and the snapshot codec in one change; the codec tests' per-field table (Record<keyof Entity, ...>) fails typecheck until a row exists"
    - "A golden that moves because of an appended hash segment is proven not to have moved the draws by stripping the segment and re-hashing to the previous fnv"
key-files:
  created: []
  modified:
    - src/sim/world/entity.ts
    - src/sim/world/world.ts
    - src/sim/world/limits.ts
    - src/sim/world/serialize.ts
    - src/sim/world/sanitize.ts
    - src/sim/world/snapshot.ts
    - src/sim/world/populate.ts
    - src/app/session/traffic.ts
    - tests/helpers/inert-world.ts
    - tests/sim/world/sanitize.test.ts
    - tests/sim/world/snapshot-codec.test.ts
    - tests/sim/world/populate.test.ts
    - tests/app/session/traffic.test.ts
    - tests/golden/world/inert-lave-epoch1.json
key-decisions:
  - "WORLD_SNAPSHOT_VERSION moved 1 -> 2 once; a version-1 snapshot is refused. World snapshots are not persisted in saves (SAVE-07 is later), so no data migration. The Key Decisions row is written by plan 13-14."
  - "inert-lave-epoch1.json regenerated once (fnv b23d11d8 -> ab72eedf, 12 ships). With the en: segments removed the section is byte-identical to the previous golden, so no population draw moved. flight-hash-pins.json untouched and green."
  - "Bounds: MAX_ENTITY_ENERGY 1e6 and MAX_ENERGY_RECHARGE_RATE 1e3 (the largest compiled record is 250 and 4). A change to either is a snapshot-format change."
  - "InertShipRecord.maxEnergy and energyRechargeRate are required, not optional, so a mapping site cannot silently fall back to the default; spawnEntity still defaults them for any other caller that omits them."
  - "Snapshot parser reasons: an energy above its own maxEnergy or a field above its limit is `magnitude`, a negative one `range`, a non-number `type`, null or NaN `non-finite`."
  - "No laser heat or shot timer on the entity (A7: NPC autonomous fire is CBT-15)."
coverage:
  - id: D1
    description: "Every spawned ship carries energy, maxEnergy and energyRechargeRate from its record, full at spawn, Oolite defaults 200 and 1.0 when omitted; malformed or out-of-domain input is refused with the existing reasons"
    requirement: CBT-07
    verification:
      - kind: unit
        ref: "tests/sim/world/sanitize.test.ts#the energy bank at spawn and in the hash (CBT-07)"
        status: pass
      - kind: unit
        ref: "tests/sim/world/populate.test.ts#spawns the Lave ships with the energy the NPC records name"
        status: pass
    human_judgment: false
  - id: D2
    description: "The bank is hashed and repaired: NaN, negative, over-bound and non-finite values never reach canon, repairs count once, and a second pass changes nothing"
    requirement: CBT-07
    verification:
      - kind: unit
        ref: "tests/sim/world/sanitize.test.ts#sanitizeEntity table"
        status: pass
    human_judgment: false
  - id: D3
    description: "Snapshot version 2 carries the bank under strict keys and bounded limits, round-trips to an equal hash, and refuses version 1 and every missing, extra, non-finite or out-of-bound field"
    requirement: CBT-07
    verification:
      - kind: unit
        ref: "tests/sim/world/snapshot-codec.test.ts#parseWorldSnapshot rejections"
        status: pass
      - kind: unit
        ref: "tests/sim/world/snapshot-codec.test.ts#the energy bank in the snapshot"
        status: pass
      - kind: unit
        ref: "tests/sim/world/snapshot-codec.test.ts#sanitizer and parser agree across every entity leaf"
        status: pass
    human_judgment: false
  - id: D4
    description: "The populator and trafficContent carry the compiled energy; the inert-world golden moved once and the population draws did not; the flight pins are untouched"
    requirement: CBT-07
    verification:
      - kind: unit
        ref: "tests/sim/world/populate.test.ts#is the pre-energy world plus one en: segment per ship: same ships at the same places (CBT-07)"
        status: pass
      - kind: unit
        ref: "tests/app/session/traffic.test.ts#maps the nine committed records to records and masses in catalogue order"
        status: pass
      - kind: unit
        ref: "tests/sim/world/flight-hash-pins.test.ts"
        status: pass
    human_judgment: false
---

# Phase 13 Plan 07: NPC energy bank in the world model Summary

**Every world ship now has a hashed, sanitised and snapshotted energy bank (energy, maxEnergy, energyRechargeRate) taken from its NPC record with Oolite's defaults 200 and 1.0, starting full; the world snapshot moved to version 2 and the inert Lave golden was regenerated once, with the population draws proven unchanged.**

## Performance

- **Duration:** about 25 min (including a 6 min `verify` run)
- **Tasks:** 3 of 3
- **Files modified:** 14 (7 sim, 1 app, 5 test files, 1 golden)

## Accomplishments

- `Entity` gains `energy`, `maxEnergy`, `energyRechargeRate`; `SpawnInit` gains the two optional bank fields. `spawnEntity` defaults them from `limits.ts` (`ShipEntity.m:291-292`), starts at `energy = maxEnergy`, and refuses a non-number (`malformed`) or an out-of-domain value (`outOfDomain`) before any id is allocated.
- `serializeEntity` appends one `en:` segment through `canon` after `repairs`. `sanitizeEntity` repairs a non-finite or out-of-domain bound to the default, holds energy in `0..maxEnergy` (non-finite becomes a full bank), counts one repair per call and normalises `-0` silently, idempotently.
- `snapshotWorld`, the strict-key parser and `restoreWorld` carry the three fields under `WORLD_SNAPSHOT_VERSION = 2`. Each property is read once into a checked local; `snapshotWorld` refuses a non-finite bank with `SnapshotError`.
- `InertShipRecord` and `PlannedShip` carry the bank; `populateInertWorld` passes it in `SpawnInit`; `trafficContent` and `laveInertRecords` map it from the NPC records (Adder 85/2, Viper 180/4, Sidewinder 240/2, Cobra Mk I 150/2.5, Krait 250/2.5, Moray 240/3).
- `inert-lave-epoch1.json` regenerated once with `tests/helpers/write-inert-world-golden.ts` (fnv `b23d11d8` to `ab72eedf`). A test strips the `en:` segments and re-hashes to `b23d11d8`, proving keys, positions, orientations and streams are unchanged.

## Task Commits

1. **Task 1: A spawned ship carries its energy bank into the world hash** - `c22e6b5` (feat)
2. **Task 2: Snapshot format v2 with the energy fields** - `092f1c6` (feat)
3. **Task 3: Populator and traffic records carry the compiled energy; regenerate the inert-world golden once** - `7903139` (feat)

## Deviations from Plan

None - plan executed exactly as written.

Notes (not deviations):

- Between `c22e6b5` and `092f1c6` the tree did not typecheck (`restoreWorld` and the codec test's per-field table lacked the new fields). Task 1's `<verify>` runs only the four named test files, which pass at `c22e6b5`; the type errors close in Task 2 as the plan orders the work.
- The plan lists no file for `tests/sim/world/snapshot.test.ts`; it needed no edit and passes unchanged.
- CHANGELOG.md not touched: the change is simulation-internal with no user-visible effect yet (the bank is consumed by later plans).
- `InertShipRecord` fields are required, which meant adding a shared `DEFAULT_BANK` to the synthetic records in `populate.test.ts` (no assertion changed or weakened).

## Verification

- `docker compose run --rm test npx vitest run tests/sim/world/store.test.ts tests/sim/world/sanitize.test.ts tests/sim/world/hash.test.ts tests/sim/world/flight-hash-pins.test.ts` : 4 files, 265 passed
- `docker compose run --rm test npx vitest run tests/sim/world/snapshot-codec.test.ts tests/sim/world/snapshot.test.ts` : 221 passed
- `docker compose run --rm test npx vitest run tests/sim/world/populate.test.ts tests/app/session/traffic.test.ts tests/sim/world/flight-hash-pins.test.ts tests/app/session/tick-parity.test.ts` : 51 passed
- `docker compose run --rm test npx vitest run` (whole suite, includes `tests/compliance.test.ts` SPDX check): 162 files, 3323 passed, 2 skipped
- `docker compose run --rm lint` and `docker compose run --rm typecheck` : clean
- `docker compose run --rm verify` : passed (27 Chromium e2e specs)
- Acceptance: `rg -c energy src/sim/world/serialize.ts` = 1; `rg -c NPC_DEFAULT_MAX_ENERGY src/sim/world/limits.ts` = 1; `rg -c 'WORLD_SNAPSHOT_VERSION = 2' src/sim/world/snapshot.ts` = 1; `rg -c maxEnergy src/app/session/traffic.ts` = 1; `git diff --stat tests/golden/world/flight-hash-pins.json` prints nothing.

## Known Stubs

None.

## Threat Flags

None. T-13-13 (snapshot energy fields) and T-13-14 (NaN energy reaching `canon`) are mitigated: strict keys, bounded limits, version 2 refuses version-1 shapes, `sanitizeEntity` repairs and counts before every hash, `spawnEntity` refuses out-of-domain input.

## Phase 14 note

Phase 14 extends the same entity record and golden in parallel. This change is additive (one trailing `en:` hash segment, three snapshot keys); whichever phase lands second rebases the golden and the snapshot version.

## Next

Ready for the next plan of wave 3 (the energy bank is consumed by the hit and damage plans 13-10 and 13-12; 13-14 writes the Key Decisions row for the snapshot bump and golden regeneration).

## Self-Check: PASSED

- Modified files exist on disk; commits `c22e6b5`, `092f1c6` and `7903139` are ancestors of HEAD.
- All acceptance criteria and plan verification commands re-run green in Docker.
