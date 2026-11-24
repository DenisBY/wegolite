---
phase: 15-damage-ledger-and-kills
plan: 01
subsystem: content
tags: [oolite-ingest, npc-ships, shipdata-plist, zod, data-14, float32]
status: complete

requires:
  - phase: 14-npc-flight-and-steering-fidelity-gate
    provides: the 17-field NPC record, the converter and its hand-written golden
provides:
  - "NpcShipSchema with the ten DATA-14 fields (27 in total): likelyCargo, maxCargo, aft/port/starboard weapon types and positions, fragmentChance, explosionType"
  - "compileNpcShips reading likely_cargo, max_cargo, weapon_facings (mask-gated facing types), the three facing positions, fragment_chance and explosion_type"
  - "exported facingWeapon helper and DEFAULT_* constants for the new fields"
  - "regenerated ships-npc.json and manifest, hand-written golden at 27 fields, NOTICE paragraph naming every derived field"
affects: [15-03, 16, 17]

plan_head_before: 094bf9537038e2672717879a7e0c9d1eb30fa78a
plan_head_after: 41d0daa77afac32b878fc622c0bce4a89871d3e6
commits: 2

actuals:
  tokens: 70000
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Every facing's weapon type is read only when its weapon_facings bit is set (ShipEntity.m:298-306); positions are read whatever the mask says"
    - "float32 default for fragment_chance (Math.fround(0.9)) because Oolite's default parameter is a float"

key-files:
  created: []
  modified:
    - src/content/schemas/ship-npc.ts
    - tools/oolite-ingest/convert/npc-ships.ts
    - tools/oolite-ingest/convert/npc-ships.test.ts
    - tests/content/ships-npc.test.ts
    - tests/golden/content/ships-npc.json
    - src/content/generated/ships-npc.json
    - src/content/generated/manifest.json
    - NOTICE

key-decisions:
  - "fragmentChance default is Math.fround(0.9) = 0.8999999761581421, faithful to Oolite's float default parameter (OOCollectionExtractors.h:152)"
  - "fragment_chance is narrowed to a number (Oolite's fuzzy boolean also takes boolean and string spellings); the record keeps the probability and Phase 16 decides when to roll canFragment"
  - "weapon_facings is read through uintExtra (non-negative integer) and masked with 15: a negative mask, which Oolite's signed oo_intForKey would read as every facing, fails the build; none of the nine authors one"
  - "explosionType is null when explosion_type is absent (Oolite nil), never []; an authored empty array stays []"
  - "STEERING_ASSUMED_ABSENT_KEYS and its refusal loop are unchanged and now carry a comment that lifting it also needs per-facing weapon temperatures (a snapshot-format change), because the v4 weapon record holds one forward_weapon_temp"

requirements-completed: [DATA-14]

duration: 80 min
completed: 2026-11-16
---

# Phase 15 Plan 01: NPC record DATA-14 fields Summary

**The nine NPC records now carry cargo counts, all four weapon facings with positions, fragment chance and explosion type, compiled from Oolite's shipdata.plist behind the strict schema, a hand-written 27-field golden and the content drift gate.**

## Performance

- **Duration:** about 80 min
- **Tasks:** 2 (a tracer for the cargo fields, then the facings and the remaining fields)
- **Files modified:** 8

## Accomplishments

- `likelyCargo` and `maxCargo` (Oolite `oo_unsignedIntForKey`, default 0) compile end to end: adder 2/5, cobramk1 10/10, gecko 3/3, krait 2/2, mamba 3/4, moray 5/7, shuttle 0/30, sidewinder 0/0, viper 0/0, equal to the hand-written golden with `shipdata.plist` line sources.
- Weapon facings: `aftWeapon`, `portWeapon`, `starboardWeapon` and their three positions beside the forward pair. The facing type is read only when its `weapon_facings` bit is set; the compiled shuttle (mask 0, `shipdata.plist:3542`) has all four facings `EQ_WEAPON_NONE`. None of the nine forward weapons changed.
- `fragmentChance` (float32, default 0.8999999761581421) and `explosionType` (null for all nine) compile and validate; a malformed value fails the build naming the key and field.
- The aft, port and starboard mapping is pinned directly through the exported `facingWeapon` helper, since the refusal loop keeps the stock catalogue from authoring those types.
- `docker compose run --rm assets` regenerated only `ships-npc.json` and `manifest.json`; `assets:check` is green. NOTICE now names every field derived from `shipdata.plist`.

## Golden float32 values

Computed with `Math.fround` in the container (scratch script under `/tmp`, mounted as `/scratch`). Non-trivial roundings written into the golden:

| Ship | aft | port | starboard |
|------|-----|------|-----------|
| adder | 0, 0, -22.5 | -15, 0, -14.5 | 15, 0, -14.5 |
| cobramk1 | 0, 0, -27.5 | -35, -1, 0.5 | 35, -1, 0.5 |
| gecko | 0, 5.549570083618164, -12.155799865722656 | -13.75, -2.0625, -1.875 | 13.75, -2.0625, -1.875 |
| krait | 0, 0, -34.599998474121094 | -45, 0, -13.5 | 45, 0, -13.5 |
| mamba | 0, 1.518399953842163, -30.319299697875977 | -16.5, -3, 0 | 16.5, -3, 0 |
| moray | 0, -2.554795026779175, -27.782249450683594 | -30, -2, 6.25 | 30, -2, 6.25 |
| shuttle | 0, 0, -17.5 | -9, 0, 11.5 | 9, 0, 11.5 |
| sidewinder | 0, -6.5, -17.5 | -24.25, 0, 0 | 24.25, 0, 0 |
| viper | 0, 0, -27.5 | -12.5, 0, 0 | 12.5, 0, 0 |

`fragmentChance` default: 0.8999999761581421 (all nine records; none authors the key). `explosionType`: null for all nine.

## Task Commits

1. **Task 1: likelyCargo and maxCargo end to end (tracer)** - `139759b` (feat)
2. **Task 2: weapon facings, fragmentChance, explosionType, NOTICE** - `41d0daa` (feat)

The tracer gate was satisfied by re-running its verify (assets, three vitest files, assets:check) before expansion: all green. Plan metadata commit follows this SUMMARY.

## Deviations from Plan

None - plan executed exactly as written.

Minor notes (no behaviour change): the golden `defaults` gained a `weaponFacings: 15` entry so the `DEFAULT_WEAPON_FACINGS` pin has a hand-written counterpart; an authored empty `explosion_type` array is accepted and stays `[]` (distinct from the nil an absent key gives), pinned by a converter test; an unnecessary type assertion flagged by lint was removed.

## Gate results

- `docker compose run --rm assets` then `assets:check`: no differences.
- Targeted: `npc-ships.test.ts` (66), `tests/content/ships-npc.test.ts` (32), `tests/content/ships-hulls.test.ts` (21): all pass.
- `docker compose run --rm test`: 204 files passed, 5028 tests passed, 10 skipped, coverage thresholds met.
- `docker compose run --rm lint`: clean. `docker compose run --rm typecheck`: clean.
- All acceptance criteria of both tasks pass (counts of `likelyCargo`, `fragmentChance`, `explosionType: null`, `facingWeapon`, `forward_weapon_temp`, `oo_intForKey`, `3542`, `fragment_chance` in NOTICE; generated/third_party status lists only the two generated files).
- `verify` and `verify-full` were not run (content and tests only, per the plan's gate policy).
- Acceptance run taken after 15-02 (covers this plan's ships-npc.json change). The 20-seed NPC acceptance run is deferred to once, by hand on the remote machine, after plan 15-02's last commit.

## Known Stubs

None.

## Threat Flags

None. The new fields come from the vendored plist behind the strict schema; no new endpoint, auth path or trust boundary.

## Self-Check: PASSED

- All eight modified files exist; commits `139759b` and `41d0daa` are ancestors of HEAD; `commits: 2` measured from the plan-head ledger (`094bf95..HEAD`).
