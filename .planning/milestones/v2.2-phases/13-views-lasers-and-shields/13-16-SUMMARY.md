---
phase: 13-views-lasers-and-shields
plan: 16
subsystem: content/npc-ships
tags: [content-compiler, npc-ships, schema, golden, drift-gate, combat]
requires:
  - phase: 13-views-lasers-and-shields
    provides: "13-01 foundation fixes (ordering only)"
provides:
  - "ships-npc.json records carry name, maxEnergy, energyRechargeRate, forwardWeapon and forwardWeaponPosition for all nine NPC hulls"
  - "NpcShipSchema (strict) with the five combat fields; compileNpcShips reads them with Oolite's defaults and fails the build with SCHEMA on an unknown weapon type"
  - "exported converter constants DEFAULT_MAX_ENERGY, DEFAULT_ENERGY_RECHARGE_RATE, DEFAULT_FORWARD_WEAPON and FORWARD_WEAPON_KEYS"
affects: [13-04, 13-07, 13-10, 13-12, 14]
actuals:
  tokens: 6186
  tasks: 2
  commits: 2
plan_head_before: 6eace2632965063bb487a2105ea0d08a8df70246
plan_head_after: ce091f93882cd2a37ee9e2d380eba12ac9f840a7
tech-stack:
  added: []
  patterns:
    - "A converter field reads an extra with Oolite's default when the key is absent and fails the build (SCHEMA) when the key is present but malformed, instead of silently defaulting"
    - "Plist WEAPON_* names are mapped through a closed frozen table and read with Object.hasOwn, never `in`"
key-files:
  created: []
  modified:
    - src/content/schemas/ship-npc.ts
    - tools/oolite-ingest/convert/npc-ships.ts
    - tools/oolite-ingest/convert/npc-ships.test.ts
    - src/content/generated/ships-npc.json
    - src/content/generated/manifest.json
    - tests/content/ships-npc.test.ts
    - tests/golden/content/ships-npc.json
key-decisions:
  - "No class field is compiled. The ident message names the ship only (advisor-recommended deviation from D-03 'name and class', PENDING OWNER CONFIRMATION); Oolite's class name equals the name for all nine stock hulls (ship_class_name defaults to name, ShipEntity.m:391-392). If the owner keeps D-03 literally, plan 13-12's message constant uses the existing scanClass field and this plan needs no content change."
  - "`name` is the authored display_name when present, else the authored name. No stock record authors display_name, so all nine take the plist name; a synthetic record pins the override."
  - "Energy fields are rounded to float32 (Oolite stores maxEnergy and energy_recharge_rate as float); all nine stock values are exactly representable, so no value moves."
  - "Negative zero in weapon_position_forward (the shuttle authors '-0.0') is normalised to 0 so the in-memory record equals its JSON round trip."
requirements-completed: [CBT-07]
coverage:
  - id: D1
    description: "Nine NPC records carry display name, max energy, energy recharge rate, forward weapon and forward weapon position from the vendored shipdata, with Oolite's defaults when absent"
    requirement: CBT-07
    verification:
      - kind: unit
        ref: "tools/oolite-ingest/convert/npc-ships.test.ts#pins the name, energy and forward weapon of all nine records"
        status: pass
      - kind: unit
        ref: "tools/oolite-ingest/convert/npc-ships.test.ts#takes Oolite's defaults when the keys are absent"
        status: pass
      - kind: unit
        ref: "tests/content/ships-npc.test.ts#carries the Adder's name, energy and forward weapon"
        status: pass
    human_judgment: false
  - id: D2
    description: "The new fields sit behind the strict schema, the regenerated golden and the assets drift gate"
    requirement: CBT-07
    verification:
      - kind: unit
        ref: "tests/content/ships-npc.test.ts#rejects a record missing any combat field"
        status: pass
      - kind: command
        ref: "docker compose run --rm assets npm run assets:check"
        status: pass
    human_judgment: false
  - id: D3
    description: "No class field is compiled; the lock message names the ship only (pending owner confirmation of the D-03 deviation)"
    requirement: CBT-07
    verification:
      - kind: unit
        ref: "tools/oolite-ingest/convert/npc-ships.test.ts#carries exactly the thirteen fields and passes the strict schema"
        status: pass
    human_judgment: true
    rationale: "The D-03 'name and class' versus 'name only' choice is the owner's; this plan only guarantees no content change is needed either way."
---

# Phase 13 Plan 16: NPC combat fields Summary

**The nine NPC records in `ships-npc.json` now carry Oolite's display name, max energy, energy recharge rate, forward weapon (EQ_WEAPON_* key) and float32 forward weapon position, compiled from the vendored shipdata with Oolite's defaults, behind a strict enum/finite-number schema, a once-regenerated golden and the drift gate.**

## Performance

- **Duration:** about 15 min
- **Tasks:** 2 of 2
- **Files modified:** 7 (3 source/schema/converter, 2 generated, 2 test files plus the golden)

## Accomplishments

- `NpcShipSchema` gains `name`, `maxEnergy`, `energyRechargeRate`, `forwardWeapon` (closed enum of the four lasers plus EQ_WEAPON_NONE) and `forwardWeaponPosition` (three finite numbers), each commented with its Oolite source line.
- `compileNpcShips` reads them: `name` = `display_name` else `name`; energy fields from `max_energy` / `energy_recharge_rate` with Oolite's defaults 200 and 1.0; `forwardWeapon` from `forward_weapon_type` through a frozen WEAPON_* to EQ_WEAPON_* table (absent: EQ_WEAPON_NONE; anything else fails with `contentError("SCHEMA", ...)`); position parsed from the three-number string with `Math.fround` per component (absent: 0, 0, 0). A present-but-malformed energy value or position also fails the build.
- `ships-npc.json` (3403 to 5411 bytes) and `manifest.json` regenerated with `docker compose run --rm assets`; 9 `maxEnergy` and 9 `forwardWeapon` entries.
- The golden `tests/golden/content/ships-npc.json` moved once, deliberately: thirteen-field list, new defaults, the five fields on every worked example (hand-computed from the plist values with an independent float32 rounding) and one source line per hull citing the plist line numbers.
- Tests: converter unit tests (nine compiled values, display_name override, defaults, weapon map, unknown type, malformed position, non-numeric and negative energy) and content tests (Adder name "Adder", maxEnergy 85, energyRechargeRate 2, pulse laser; schema refusals for a missing field, unknown weapon, negative/non-finite energy and a malformed position).

## Task Commits

1. **Task 1: NPC combat fields from shipdata through the converter to the strict schema and the golden** - `1679fa8` (feat)
2. **Task 2: Field rules, defaults and refusals, and the drift gate** - `ce091f9` (test)

The converter-level test file (`npc-ships.test.ts`) pins the golden, which Task 1 moved, so it was updated in the Task 2 commit; the tree is green at `ce091f9` (and at `1679fa8` only the golden-pinned converter test, fixed one commit later, was stale).

## Deviations from Plan

None - plan executed exactly as written.

Notes (not deviations): `compileNpcShips` rejects a present-but-invalid energy or position instead of defaulting (Oolite would default a non-numeric value); stock data never hits this, and failing the build matches the T-13-29 mitigation ("must not pass a bad number through"). CHANGELOG.md not touched: the change is content-pipeline internal with no user-visible effect yet.

## Phase 14 note

Phase 14 also extends the NPC record and golden with flight fields (ROADMAP ordering rule). This change is additive: whichever phase lands second rebases the golden's `fields`, `defaults` and example blocks.

## Verification

- `docker compose run --rm assets` : wrote 103 files, no SCHEMA error
- `docker compose run --rm assets npm run assets:check` : no differences
- `docker compose run --rm test npx vitest run tools/oolite-ingest tests/content tests/app/asset-cache-npc.test.ts tests/app/session/traffic.test.ts` : 24 files, 523 tests passed (includes `drift.test.ts`)
- `docker compose run --rm lint` : clean
- `docker compose run --rm typecheck` : clean
- Acceptance: `rg -c '"maxEnergy"' ships-npc.json` = 9, `rg -c '"forwardWeapon"'` = 9, `forwardWeaponPosition` in the schema >= 1.

## Known Stubs

None.

## Threat Flags

None. T-13-29 is mitigated: strict object, enum for the weapon, finite non-negative energy, unknown weapon type fails the build with SCHEMA, golden and drift gate.

## Next

Ready for the next plan in wave 2 (plan 13-04 regenerates `manifest.json` after this; 13-07 consumes the energy fields; 13-12 owns the ident message constant, pending the D-03 owner decision).

## Self-Check: PASSED

- Files modified exist on disk; commits `1679fa8` and `ce091f9` are ancestors of HEAD.
- All acceptance criteria and plan verification commands re-run green in Docker.
