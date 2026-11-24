---
phase: 19-equipment-damage-and-repair
plan: 01
subsystem: content
tags: [equipment, oolite-ingest, zod, golden-fixture, damage-probability]
requires:
  - phase: 02-content-pipeline
    provides: the equipment converter, EquipmentSchema and the drift gate
provides:
  - EquipmentSchema.damageProbability (strict, finite number >= 0)
  - damageProbabilityOf in the equipment converter
  - regenerated equipment.json and manifest with damageProbability on all 41 records
  - golden fixture version 2 pinning techLevel, price and damageProbability
affects: [19-02, 19-03, 19-04, 19-05, 19-08, 19-11]
actuals:
  tokens: 21000
  tasks: 2
  commits: 3
plan_head_before: e67f8c5022ab3c8e6d7c25657d038a88fd44609c
plan_head_after: 7cfd87f72d81623f68914c91fbd964c543718df3
tech-stack:
  added: []
  patterns:
    - "Fail-closed SCHEMA content error naming the entry key for a malformed authored value"
key-files:
  created: []
  modified:
    - src/content/schemas/equipment.ts
    - tools/oolite-ingest/convert/equipment.ts
    - tools/oolite-ingest/convert/equipment.test.ts
    - tests/golden/content/equipment.json
    - src/content/generated/equipment.json
    - src/content/generated/manifest.json
    - tests/sim/player-profile.test.ts
key-decisions:
  - "A record is a missile or mine from its authored is_external_store, else from the _MISSILE/_MINE key suffix (an explicit no overrides the suffix, OOEquipmentType.m:223)"
  - "is_external_store accepts only yes/no/true/false/1/0 (bool, string or integer); Oolite's wider oo_boolForKey spellings are refused until a vendored record needs one"
requirements-completed: [CBT-08, CBT-12]
status: complete
---

# Phase 19 Plan 01: Equipment damage probability Summary

Oolite's per-item damage probability is now a compiled, schema-validated field on every equipment record, pinned by a hand-written golden and the drift gate.

## Accomplishments

- `EquipmentSchema.damageProbability` is `z.number().min(0)` and required; Zod 4 rejects NaN and Infinity.
- `damageProbabilityOf` follows `OOEquipmentType.m`: a missile or mine (authored `is_external_store`, else the `_MISSILE`/`_MINE` suffix) gives 0; otherwise the authored `damage_probability`, else 1. A non-number or negative `damage_probability`, or an unrecognisable `is_external_store`, throws `SCHEMA` naming `<KEY>.damage_probability` or `<KEY>.is_external_store`.
- `src/content/generated/equipment.json` and `manifest.json` regenerated with `docker compose run --rm assets` (41 `damageProbability` lines); no hand edit.
- The golden fixture (version 2) was written from the plist by hand before the converter was compared against it; it agreed on the first run, so there is no converter/plist disagreement.

## Records with damageProbability 0

Seven, the authored zeros of `equipment.plist` (lines 23, 32, 239, 252, 286, 383, 486): EQ_MISSILE, EQ_CARGO_BAY, EQ_TRUMBLE, EQ_PASSENGER_BERTH, EQ_HARDENED_MISSILE, EQ_QC_MINE, EQ_OOLITE_TUTORIAL_CONTROLS. EQ_MISSILE, EQ_HARDENED_MISSILE and EQ_QC_MINE are also zero by suffix. All other 34 records (including the four F3 damageable items EQ_DOCK_COMP, EQ_GAL_DRIVE, EQ_ADVANCED_COMPASS, EQ_ADVANCED_NAVIGATIONAL_ARRAY, and every laser) compile to 1. No vendored record sets `is_external_store`.

## Task Commits

1. Task 1 (tracer): `2fce6c1` feat: schema field, `damageProbabilityOf`, regenerated content, tracer test
2. Task 2: `eb16ca8` test: version-2 golden and the rule-edge cases
3. Lint fix: `7cfd87f` test: drop an unused destructured binding found by the plan-boundary lint run

## Verification

- `docker compose run --rm assets`: wrote 122 files, no SCHEMA error.
- `docker compose run --rm assets npm run assets:check`: no differences (exit 0).
- Targeted vitest (`equipment.test.ts`, `drift.test.ts`, `player-profile.test.ts`): passed.
- Plan boundary after the last commit: `docker compose run --rm test` 269 test files passed, exit 0; `docker compose run --rm lint` clean; `docker compose run --rm typecheck` clean. No remote run (content and tests only).
- Acceptance greps: `damageProbability` in the schema, one `function damageProbabilityOf`, 41 `"damageProbability"` lines in both `equipment.json` and the golden, golden `"version": 2` once.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Unused binding failed lint**
- **Found during:** plan-boundary lint run
- **Issue:** `const { damageProbability: _omitted, ...without } = first;` tripped `@typescript-eslint/no-unused-vars`
- **Fix:** build the record without the field via a spread copy and `delete`
- **Files modified:** `tools/oolite-ingest/convert/equipment.test.ts`
- **Commit:** `7cfd87f`

Otherwise the plan executed as written. No CHANGELOG entry: the change is internal content and test tooling, not user-visible. The combat twin literals were not touched and no twin hash shifted. The NPC acceptance run is not triggered.

## Known Stubs

None.

## Threat Flags

None. T-19-01 is mitigated: fail-closed `SCHEMA` at build, strict schema at build and load, golden pins every value.

## Self-Check: PASSED

Files and commits `2fce6c1`, `eb16ca8`, `7cfd87f` verified present.
