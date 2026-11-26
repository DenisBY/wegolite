---
phase: 21-roster-state-shape-and-seams
plan: 03
subsystem: sim-world-state
tags: [snapshot, hash, pristine-omit, field-set, rng, FOUND-20]
requires:
  - phase: 21-01
    provides: the epoch 1-20 inert golden (the unmoved pin this plan must not touch)
provides:
  - WORLD_SNAPSHOT_VERSION 5, the one v2.4 per-entity field set with pristine-omit hashing
  - the stateless RNG purposes pod 6, scoop 7, repop 8, inj 9
  - the C2 audit of every in-scope per-ship spawn-time value
affects: [21-05, 21-06, 21-07, 21-12, 21-14, phase-22, phase-23, phase-25]
tech-stack:
  added: []
  patterns: [pristine-omit hash segments, strict allow-list snapshot parser, per-leaf sanitize repair, shared boundary table for spawn/snapshot/sanitize tests]
key-files:
  created:
    - tests/sim/world/v5-hash.test.ts
    - tests/helpers/v5-fields.ts
  modified:
    - src/sim/world/limits.ts
    - src/sim/world/entity.ts
    - src/sim/world/world.ts
    - src/sim/world/serialize.ts
    - src/sim/world/snapshot.ts
    - src/sim/world/sanitize.ts
    - src/sim/rng.ts
    - tests/sim/world/snapshot-codec.test.ts
    - tests/sim/world/sanitize.test.ts
    - tests/sim/world/spawn-refusal.test.ts
    - tests/sim/rng.test.ts
    - tests/sim/world/hash.test.ts
    - tests/sim/world/world-cadence.test.ts
    - tests/sim/combat/npc-fire.test.ts
    - .planning/PROJECT.md
key-decisions:
  - "World snapshot version 5: the one v2.4 field set, pristine-omit hashing (PROJECT.md Key Decisions, supersedes the version 4 row)"
  - "being_fined is the per-entity markedForFines field, not a world-level mark (RESEARCH Open Question 7)"
  - "A bad injector.accumulator repairs to Oolite's initial 1.0, never to null, so a repair never erases equipment"
status: complete
commits: 3
plan_head_before: a0a7fd4d602ac3edc89e02b31bff30e8bb39ba3f
plan_head_after: 7bd81fa5be1b37269eb6215e535c1fd2b887a09c
actuals:
  tokens: 37800
  tasks: 3
  commits: 3
requirements-completed: [FOUND-20]
---

# Phase 21 Plan 03: One snapshot bump, the entity half of the v2.4 field set Summary

**Snapshot v4 to v5 once: eleven pristine-omit hash segments (bounty, role, group, cargo kind, pod contents, fuel, injector, home/destination systems, per-facing weapon temperatures and types, the police fine mark), a strict v5 codec, per-leaf repair, spawn refusals and four stateless RNG purposes, with every existing golden untouched.**

## Tracer and task results

| Task | Commit | What it proved |
| ---- | ------ | -------------- |
| 1 (tracer) | `f646a2c0` | `bounty` through limits, entity, spawn, hash, snapshot and sanitize; `WORLD_SNAPSHOT_VERSION` 4 to 5; version 4 and 6 refused with reason `version`; epoch 1 `hashWorld` FNV still `c5949d60`; strip-and-rehash proof in `tests/sim/world/v5-hash.test.ts` |
| 2 | `c7463f62` | role, groupId, cargoKind (frozen `CARGO_KINDS`), podCommodity + podAmount, fuel, homeSystem + destinationSystem through the proven path; shared boundary table `tests/helpers/v5-fields.ts` used by the spawn, snapshot and sanitize tests; fast-check round-trip and sanitize idempotence |
| 3 | `7bd81fa5` | injector, per-facing temperatures and types, `markedForFines`, RNG purposes, the C2 audit, the Key Decisions row, full gates |

The tracer gate (task 1, auto mode): the targeted Vitest run (942 tests) and typecheck passed end to end before tasks 2 and 3 widened the path.

## The final entity field table

Fixed segment order after `cargo:`: `bty, role, grp, ck, pod, fuel, inj, sys, wpf, wty, fine` (a segment prints only for a non-pristine value). Every bound is in `src/sim/world/limits.ts`; every field is always written by `snapshotEntity`, required by the strict parser (an unknown or missing key is refused), refused one step outside its bound, repaired per leaf by `cleanV5Fields` and refused by `spawnEntity` (`malformed` for a wrong type, `outOfDomain` outside the bound).

| Field | Type | Bound constant | Pristine | Segment |
| ----- | ---- | -------------- | -------- | ------- |
| `bounty` | integer | `MAX_BOUNTY` 65535 | 0 | `bty:50` |
| `role` | string `[a-z0-9-]` | `MAX_ROLE_LENGTH` 32, `ROLE_PATTERN` | "" | `role:"trader"` |
| `groupId` | 0 or dynamic id (101 to `MAX_UINT32`) | `FIRST_DYNAMIC_ID`, `MAX_UINT32` | 0 | `grp:101` |
| `cargoKind` | index into `CARGO_KINDS` | 0 to 6 (tuple length) | 0 (unset) | `ck:4` |
| `podCommodity` + `podAmount` | string `[a-z0-9_]` + integer | `MAX_COMMODITY_KEY_LENGTH` 64, `COMMODITY_KEY_PATTERN`; `MAX_POD_AMOUNT` 255 | "" and 0 | `pod:"food",3` (one segment, printed when either part is not pristine) |
| `fuel` | integer | `MAX_SHIP_FUEL` 65535 | 0 | `fuel:7` |
| `injector` | `{ accumulator }` or null | `MAX_INJECTOR_ACCUMULATOR` 1 | null | `inj:1.000000` (prints at accumulator 0 too) |
| `homeSystem` + `destinationSystem` | integer | -1 (`NO_SYSTEM_INDEX`) to `MAX_SYSTEM_INDEX` 255 | -1 and -1 | `sys:7,-1` |
| `weapon.aftTemperature`, `portTemperature`, `starboardTemperature` | float | `MAX_WEAPON_TEMPERATURE` 1e3 | 0 | `wpf:12.500000,0.000000,0.000000`; the forward `wpn:` segment is unchanged |
| `weaponTypes { fore, aft, port, starboard }` | null or `EQ_WEAPON_*` | `MAX_WEAPON_TYPE_LENGTH` 32, `WEAPON_TYPE_PATTERN` | all null | `wty:z,"EQ_WEAPON_BEAM_LASER",z,z` (`z` = null; `EQ_WEAPON_NONE` is distinct) |
| `markedForFines` | boolean | none | false | `fine:1` |

`CARGO_KINDS` = unset, plentiful, scarce, medical, contraband, pirate, uniform, mapped to `OOCargoFlag` 501 to 505 and 510; `CARGO_FLAG_NONE`, `CANISTERS` and `FULL_PASSENGERS` have no index because Oolite releases no commodity pod for them (`OOTypes.h:100-108`, `OOJSShip.m:2924-2930`).

Float leaves (`accumulator`, the three temperatures) print through `canon`, integer leaves through `int`, so a float32-representable value round-trips and hashes identically at any step rate. The entity-level field codec snapshot keys are the field names above (flat), plus `injector`, `weaponTypes` and the three `weapon.*Temperature` leaves.

## Strip-and-rehash evidence and unmoved pins

- `tests/sim/world/v5-hash.test.ts` (31 tests): the pristine two-ship section is a captured literal (the text ends at `cargo:3` and `steer:...,ep:0`, the v4 shape); every field alone prints exactly its one segment as the last segment; deleting the segment reproduces the pristine line and its FNV; all eleven labels together print in the fixed order whatever the assignment order; `pod:` prints when only the commodity or only the amount is non-pristine; null and `EQ_WEAPON_NONE` hash apart; a fast-check property round-trips random in-bound entities through snapshot, parse and restore and shows `sanitizeEntity` repairs nothing, and a second property shows sanitize idempotent over corrupt values.
- Unmoved: the epoch 1-20 golden (`tests/golden/world/inert-lave-epochs-1-20.json`, epoch 1 `hashWorld` FNV `c5949d60`), `tests/golden/world/inert-lave-epoch1.json`, `tests/golden/world/flight-hash-pins.json` and every twin literal. `git diff --name-only a0a7fd4d..HEAD -- tests/golden` is empty. Nothing was re-pinned.

## C2 audit: every in-scope per-ship spawn-time value and its home

Sources: `oolite-populator.js` at pin `7437f22` (the trader, pirate, police and light-hunter paths `_addFreighter`, `_addCourier`, `_addSmuggler`, `_addPiratePack`, `_addPirateAssistant`, `_addHunterPack`, `_policeLaunch`, `_setWeapons`, `_setSkill`, `_setMissiles`, `_setFuel`, `_setReturnFuel`, `_setEscortWeapons`) and `ShipEntity.m` `setUpShipFromDictionary` (lines 253 to 560), against what `oolite-priorityai.js` later reads.

| Per-ship value (Oolite source) | Home |
| ------------------------------ | ---- |
| `bounty` (`t[0].bounty`, `setBounty`; `ShipEntity.m:559`) | v5 `bounty` |
| `primaryRole` (`:2089`, `:2110`, the `addShips` role) | v5 `role` |
| `group`, `escortGroup` (`_addGroup`, `ship.group`) | v5 `groupId` (membership derived by scanning); plan 21-06 `World.groups` holds the leader record |
| cargo flag (`setCargoType` PLENTIFUL, SCARCE, MEDICAL, ILLEGAL, PIRATE goods, `:1448-1557`, `:1713`, `:1864`) | v5 `cargoKind` |
| pod contents at release (`Universe.m:3990-3994`) | v5 `podCommodity` and `podAmount`, drawn by the stateless `pod` fork (6) in plan 21-14 |
| `fuel` (`:1394`, `:1683`, `:1975`, `:2015`, `:2042`, `_setFuel`, `_setReturnFuel`) | v5 `fuel` |
| `fuel_accumulator` (`ShipEntity.m:557`, `:5845-5852`) and `EQ_FUEL_INJECTION` (`:1560`, `:1766`, `:1972`, `:2006`, `:2040`; `has_fuel_injection` `:361-362`) | v5 `injector` (non-null means fitted); the equipment roll is the stateless `inj` fork (9), Phase 22 |
| `EQ_FUEL_SCOOPS` (`has_scoop`, `ShipEntity.m:339`) | stateless `scoop` fork (7), Phase 22; the 21-05 record holds the probability |
| `homeSystem`, `destinationSystem` (`:1391-1400`, `:1490-1521`, `:1548-1555`, `:1585-1586`, `:1642-1643`, `:1808-1809`) | v5 `homeSystem`, `destinationSystem` |
| forward and aft weapon type overrides (`_setWeapons` `:2217-2272`, `_setEscortWeapons`) | v5 `weaponTypes` (null versus `EQ_WEAPON_NONE`); the record holds the compiled default |
| per-facing weapon temperatures (`aft_weapon_temp`, `port_weapon_temp`, `starboard_weapon_temp`, `ShipEntity.m:9930-9990`) | v5 `weapon.aftTemperature`, `portTemperature`, `starboardTemperature` |
| `being_fined` (`ShipEntity.h:248`, `ShipEntity.m:253`, `:12434-12439`, `oolite-priorityai.js:2189-2194`, `:3146-3160`) | v5 `markedForFines`, distinct from `World.station.marks` (plan 21-06) |
| `accuracy` (`_setSkill` `:2278-2293`; `setAccuracy:` `ShipEntity.m:1126-1143`) | existing `steer.accuracy` |
| escort slot | existing `steer.escortSlot` |
| `EQ_SHIELD_BOOSTER` (`:1831`, `:1973`, `:2010`; `ShipEntity.m:3243-3249` adds 256 to `maxEnergy`) and `EQ_SHIELD_ENHANCER` (also x1.5 recharge) | existing `maxEnergy` and `energyRechargeRate` |
| owner of an escort or pod | existing `ownerId` |
| `entityPersonality` | stateless-fork derivation from `(worldSeed, entityId)`, no field |
| `maxEscorts` (`p.maxEscorts = 16`, `:2094`, `:2111`; read at `oolite-priorityai.js:2392`) | derived from `role` (a constant per police role) and the 21-05 record's `escorts`; no per-ship state |
| `autoAI`, `autoWeapons`, `hasHyperspaceMotor`, `scannerRange`, `cargoSpaceCapacity`, max speed and the other record keys the AI reads | compiled record fields (plan 21-05), not per-ship state |
| `switchAI` (the opportunist, bounty-hunter, pirate AIs), `oolite_intership` cargo-demand values and the persisted `oolite_*` parameters | the AI component `ai` and its `params`, plan 21-07 (the cargo-demand values are written at run time, not at spawn; plan 21-07 must pack them into its key list) |
| NPC cabin temperature and `heat_insulation` (`:1467`, `:1473`; `ShipEntity.m` heat model) | recorded cut: FIDELITY row E-196 and a Key Decisions row 'NPCs have no cabin temperature or heat insulation in v2.4', both by plan 21-05 |
| missiles (`_setMissiles`, `ship.missiles`, `max_missiles`; `ShipEntity.m:313-330`) | recorded cut: FIDELITY row E-194, a Key Decisions row and the guard `tests/guards/npc-missiles-tripwire.test.ts`, all by plan 21-05 |
| NPC escape pod (`removeEquipment("EQ_ESCAPE_POD")` `:2014`, `:2041`; `has_escape_pod` `ShipEntity.m:340-341`) | recorded cut: FIDELITY row E-195 and a Key Decisions row, by plan 21-05 |
| `EQ_ECM` (`:1832`, `:1974`, `:2007`; `has_ecm` `ShipEntity.m:336-337`; fired through `oolite-priorityai.js:416-428`) | cut by the scope decision 'missiles and ECM deferred' (PROJECT.md v2.4 scope, todo `2026-11-25-missiles-and-ecm`, REQUIREMENTS CBT-10). **Open item for the owner:** plan 21-05's rows E-194 and E-195 name missiles and the escape pod only, so ECM has no FIDELITY row and no guard yet; add an ECM clause to E-194 (or a row) in plan 21-05 |
| `EQ_CLOAKING_DEVICE`, `EQ_QC_MINE`, `EQ_MILITARY_JAMMER`, `EQ_MILITARY_SCANNER_FILTER` (record flags, `ShipEntity.m:343`, `:357`, `:366-368`) | not set by any in-scope populator path and not read by any in-scope priority-AI path (`rg` over `oolite-priorityai.js`); no home needed |
| `scanClass` | existing `scanClass` |

Nothing in scope is left without a home; the one open item is the missing ECM row above. No extra v5 field was found necessary.

## Gate results

| Gate | Command | Result |
| ---- | ------- | ------ |
| Unit and integration | `docker compose run --rm test` (final run at `7bd81fa5`) | 291 of 291 files passed, 7,976 tests passed, 10 skipped; the coverage report printed and no threshold error |
| Typecheck | `docker compose run --rm typecheck` | exit 0, no `error TS` line |
| Lint | `docker compose run --rm lint` (eslint then `prettier --check .`) | 0 problems, all files use Prettier style |
| Remote frozen run | `wegolite-remote-run.sh run --rm test npm run test:acceptance` | exit 0, 21 of 21 passed (below) |
| Pins | `inert-isolation.test.ts`, `flight-hash-pins.test.ts`, `hash.test.ts` | pass unchanged; `git diff --name-only a0a7fd4d..HEAD -- tests/golden` is empty |

No `verify` was run, by the plan's gate policy (pure `src/sim`).

## Remote frozen run

`~/.claude/scripts/wegolite-remote-run.sh run --rm test npm run test:acceptance` on the remote test machine at snapshot `7bd81fa5` (the Task 3 commit; this plan changes `src/sim/world/**`): exit 0, **21 of 21 passed** (20 epochs plus the run-minimums test), 83.98 s. Every epoch reports `stuck 0`, `frozen 0`, `frustration 0`, `stationSphere 0`, `hullCrossingsUnexcused 0`, `repairs 0`, `aiFaulted 0`, `aiDropped 0`, `hashFailures 0`. Run totals: `stationArrivals` 40, `interceptArrivals` 40, `fleeArrivals` 40, `avoidCollisionEntries` 23, `attackTicksNearPlayer` 61,662, `stuckWindowsEvaluated` 175, `frozenWindowsEvaluated` 293. Thresholds and detectors untouched (no `Detector-change-approved-by-owner` trailer needed).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Plan text contradicts itself on the segment order**
- **Found during:** Task 3
- **Issue:** the must_haves truth and Task 1 fix the order `bty, role, grp, ck, pod, fuel, inj, sys, wpf, wty, fine`, but Task 3's action says to append `inj:` after `sys:`.
- **Fix:** implemented the truth's order (`inj:` before `sys:`) and pinned it in `v5-hash.test.ts` (`V5_ORDER`). Nothing outside this plan reads the order yet; plans 21-06 and 21-12 must use it.
- **Files modified:** `src/sim/world/serialize.ts`, `tests/sim/world/v5-hash.test.ts`
- **Commit:** `7bd81fa5`

**2. [Rule 3 - Blocking] Existing tests that build or compare a `WeaponComponent` literal**
- **Found during:** Tasks 2 and 3 (typecheck and the full `test` run)
- **Issue:** `WeaponComponent` gained three required leaves, so literals in `hash.test.ts`, `world-cadence.test.ts`, `sanitize.test.ts`, `snapshot-codec.test.ts` and five `toEqual` expectations in `tests/sim/combat/npc-fire.test.ts` no longer matched.
- **Fix:** added the three zero leaves to those literals; no behaviour assertion changed.
- **Commit:** `7bd81fa5`

### Plan clarifications (not deviations)

- `hashWorld` does not itself call `sanitizeEntity`; as before, `stepWorld` sanitizes every live entity once per tick before any hash (`serialize.ts` module doc), and `cleanV5Fields` runs inside that pass (the plan's key link "hashWorld repairs through sanitizeEntity" is satisfied through the per-tick pass). A corrupt in-memory v5 string cannot forge a segment because `encodeHashString` quotes it, and `canon` still throws on a non-finite float, which the per-tick pass prevents.
- `groupId` is validated as 0 or an integer in 101 to `MAX_UINT32` inline in `world.ts`, `snapshot.ts` and `sanitize.ts`; `ids.ts` has no id-validity helper and imports nothing, so no shared helper was added.
- The `injector` repair leaf: a bad accumulator becomes 1 (Oolite's initial value, `ShipEntity.m:557`); only a non-object injector becomes null.
- Two small constants beyond the plan's list were added to `limits.ts`: `MAX_INJECTOR_ACCUMULATOR` (1), `NO_SYSTEM_INDEX` (-1), and the three key patterns `ROLE_PATTERN`, `COMMODITY_KEY_PATTERN`, `WEAPON_TYPE_PATTERN`.

## Known Stubs

None. No production path sets any new field in this plan (Phase 22 and later do); every new field is exercised by tests only.

## Threat Flags

None. The parser surface the plan's threat model covers (T-21-06 to T-21-08) is the only new surface.

## Issues Encountered

- The first two full `test` runs on this shared machine (other wave-2 executors run Docker at the same time) failed three files on **timeouts only**: `tools/oolite-ingest/convert/textures.test.ts` (5 s), `tests/guards/tools-determinism.test.ts` (30 s) and `tests/sim/combat/kill.property.test.ts` (5 s). All three pass in isolation (13.7 s for the four affected files together) and in the third full run; none touches this plan's code.
- The first full run also found five `toEqual` expectations in `tests/sim/combat/npc-fire.test.ts` that pinned the three-leaf weapon record; fixed (Deviation 2).
- The Task 2 commit (`c7463f62`) carried three eslint errors (`@typescript-eslint/no-redundant-type-constituents` on `groupId: EntityId | 0`, because `EntityId` is `number`). The Task 3 commit types `groupId` as `EntityId` (doc: 0 = none), which is the same domain; the parser, the sanitize leaf and the spawn check still refuse everything but 0 or a dynamic id. The tree at `7bd81fa5` is lint clean.
- Nothing about plan 21-01's pins moved; nothing was re-pinned, so no re-pin authority was used.

## Self-Check: PASSED
