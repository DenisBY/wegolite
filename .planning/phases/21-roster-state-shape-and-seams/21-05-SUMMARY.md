---
phase: 21-roster-state-shape-and-seams
plan: 05
subsystem: content
tags: [content, converter, schema, fidelity, tripwire, npc-record]
requires:
  - phase: 21-01
    provides: the nine-record inert pin
  - phase: 21-03
    provides: snapshot v5 entity fields (C2 audit pointing at E-196)
provides:
  - "the twelve DATA-17 NPC record fields (bounty, autoAi, autoWeapons, hasScoop, hasFuelInjection, fuel, scoopPosition, countsAsKill, escorts, escortRoles, missiles, maxMissiles) behind the strict schema"
  - "aft_weapon_type accepted by the converter; the other five steering keys still refused"
  - "hyphen-tolerant model pattern for plan 21-08 (oolite_boa-mk2.dat)"
  - "tests/guards/npc-missiles-tripwire.test.ts"
  - "FIDELITY E-194, E-195, E-196 and two new Key Decisions rows"
affects: [21-08, 21-12, phase-22, phase-23]
tech-stack:
  added: []
  patterns:
    - "fuzzy booleans stored as float32 probabilities, rolled per ship at spawn"
    - "record bounds restated in content with a test pinning them to the sim's limits"
key-files:
  created:
    - tests/guards/npc-missiles-tripwire.test.ts
  modified:
    - tools/oolite-ingest/convert/npc-ships.ts
    - tools/oolite-ingest/convert/npc-ships.test.ts
    - src/content/schemas/ship-npc.ts
    - src/content/generated/ships-npc.json
    - src/content/generated/manifest.json
    - tests/golden/content/ships-npc.json
    - tests/content/ships-npc.test.ts
    - FIDELITY.md
    - .planning/PROJECT.md
key-decisions:
  - "NPCs carry no missiles and no escape pod in v2.4 (Key Decisions row; FIDELITY E-194, E-195; ECM cut with missiles)"
  - "NPCs have no cabin temperature or heat insulation in v2.4 (Key Decisions row; FIDELITY E-196)"
  - "Plan 14-03 refusal row amended: aft_weapon_type lifted, five keys stay refused"
  - "Record bounty bounded by the entity limit MAX_BOUNTY 65535, not Oolite's unsigned int"
status: complete
commits: 3
plan_head_before: 5b40eb349086b179e008c6f7027f59a6bfd8f54e
plan_head_after: 202c9bd3641216bee5bf5ab6f2f80c304eb40bcb
actuals:
  tokens: 60000
  tasks: 3
  commits: 3
---

# Phase 21 Plan 05: NPC record fields, the aft refusal lifted and the zero-missiles tripwire Summary

**The nine NPC records now carry the twelve DATA-17 role fields from vendored bytes to the golden, the converter accepts `aft_weapon_type`, and a tripwire plus FIDELITY E-194 to E-196 record that NPCs spawn with no missiles, no escape pod and no cabin temperature.**

## Accomplishments

- **New record fields (Task 1, tracer).** `bounty` (integer 0..65535, default 0), `autoAi` (fuzzy, default 1), `autoWeapons` (fuzzy, default 0), `hasScoop` and `hasFuelInjection` (fuzzy, default 0), `fuel` (integer 0..65535, default 0), `scoopPosition` (float32 vector, default 0 0 0), `countsAsKill` (boolean, default true), `escorts` (integer 0..16), `escortRoles` (list of `{ min, max, role }` with int8 bounds and an empty-string role allowed, else null), `missiles` and `maxMissiles` (data only, 0..32, resolved with Oolite's clamps: `max_missiles` defaults to `missiles`, capped at 32, `missiles` capped at it). Fuzzy keys accept a boolean (`yes` is 1, `no` is 0) or a number in 0..1 stored as float32; a present malformed value fails the build (a SCHEMA content error naming the key), never a silent default. The strict object stays; `has_escape_pod` and `heat_insulation` are not fields and an extra key is rejected.
- **Authored values on the nine records.** From the vendored templates: `auto_weapons` on seven hulls, `has_scoop` on adder (1), cobramk1 (0.95), gecko (1), krait (0.95), mamba (0.95), moray (1), `has_fuel_injection` on krait (0.65), `fuel` 70 on adder, cobramk1, krait, moray, `missiles` on adder, cobramk1, gecko, viper (1) and moray (2), and a `scoop_position` on the first six. Nothing authors `bounty`, `counts_as_kill`, `escorts` or `escort_roles`, so those take Oolite's defaults; the shuttle takes every default.
- **Golden.** `tests/golden/content/ships-npc.json` gains the twelve fields in `fields`, `defaults` and every example, transcribed independently from the plist lines of the nine templates (not read from the generated file), with a source note. Record counts in the content tests and the converter test derive from `NPC_SHIP_KEYS` (and the golden), so plan 21-08's twenty new records edit no literal.
- **Aft refusal lifted (Task 2).** `STEERING_ASSUMED_ABSENT_KEYS` is now `accuracy`, `reaction_time`, `scanner_range`, `port_weapon_type`, `starboard_weapon_type` (pinned by a test); a record authoring the aft key compiles with its position, a record authoring a port type still fails. The model pattern is `^oolite_[a-z0-9_-]+\.dat$` (anchored; a test rejects `oolite_Boa.dat`, `oolite_boa.dat.bak`, `x_oolite_boa.dat`). The PROJECT.md Key Decisions row of the plan 14-03 refusal is amended.
- **Tripwire and FIDELITY (Task 3).** `tests/guards/npc-missiles-tripwire.test.ts` fails with file and line, naming `2026-11-25-missiles-and-ecm` and CBT-19, on a non-comment `missiles`/`maxMissiles` member access, bracket access or destructuring in `src/sim/` outside `src/sim/player/` or in `src/app/session/traffic.ts`, and on a missile member declared in `src/sim/world/entity.ts`; comments and the player's pylons pass; a vacuity floor (at least 100 scoped files, the populator, the bridge and the entity present) and seven cases. FIDELITY rows E-194 (NPC missile load, `ShipEntity.m:313-330`), E-195 (NPC escape pod, `:340-341`) and E-196 (NPC cabin heat, `:11432-11440`) with verbatim excerpts, and two new Key Decisions rows ("NPCs carry no missiles and no escape pod in v2.4", "NPCs have no cabin temperature or heat insulation in v2.4"). The ECM hand-off from wave 2 is applied: E-194 and the first Key Decisions row state that the `EQ_ECM` Oolite's populator awards is cut with missiles (todo `2026-11-25-missiles-and-ecm`).

## Task Commits

1. Task 1 (tracer): `f45544c5` - compile the DATA-17 role fields for every NPC record
2. Task 2: `a865268d` - lift the aft_weapon_type refusal and allow a hyphen in the model name
3. Task 3: `202c9bd3` - zero-missiles tripwire, FIDELITY E-194 to E-196 and their Key Decisions rows

## Decisions Made

- The record `bounty` bound is the entity field's own limit (`MAX_BOUNTY` 65535, plan 21-03), restated as `MAX_RECORD_BOUNTY` in the schema with a test pinning it equal to the sim's constant. Oolite holds an unsigned int; the stock maximum is 250. A bigger record bounty would be refused at spawn, so the build refuses it first.
- `missiles` and `max_missiles` are resolved at compile time by Oolite's clamps (so `max_missiles = 7` on some hulls of plan 21-08 compile as 7, and any above 32 as 32); the `has_energy_bomb` slot adjustment is not ported (no record authors it).

## Deviations from Plan

### Auto-fixed or adjusted

**1. [Rule 1 - Plan slip] The aft test uses `WEAPON_PULSE_LASER`, not `EQ_WEAPON_PULSE_LASER`**
- **Found during:** Task 2
- **Issue:** The plan's behaviour case authors `aft_weapon_type = "EQ_WEAPON_PULSE_LASER"` and expects it to compile. `facingWeapon` maps the `WEAPON_*` legacy names only, and an existing Phase 13 test deliberately refuses `EQ_WEAPON_PULSE_LASER` as a forward weapon (a recorded narrowing of `OOWeaponTypeFromString`, which also takes EQ names). The roster authors `WEAPON_*` names (`WEAPON_PULSE_LASER`, `WEAPON_BEAM_LASER`).
- **Fix:** I first widened `facingWeapon` to accept EQ identifiers, saw the Phase 13 test fail, and reverted that change rather than reverse a recorded narrowing; the new aft case uses `WEAPON_PULSE_LASER` (still compiles to `aftWeapon` "EQ_WEAPON_PULSE_LASER" with its position). Widening to EQ names stays a one-line change if a later plan needs it.
- **Files modified:** tools/oolite-ingest/convert/npc-ships.test.ts

**2. [Rule 2 - Correctness] Record bounty bounded by 65535**
- **Found during:** Task 3 (read of the plan 21-03 Key Decisions row for entity bounds)
- **Issue:** The planned reader allowed any non-negative integer, but the entity's `bounty` is bounded by `MAX_BOUNTY` 65535, so a larger compiled value would be refused at spawn.
- **Fix:** `MAX_RECORD_BOUNTY` 65535 in the schema, the converter and tests (65535 compiles, 65536 fails, constant pinned equal to the sim's).
- **Commit:** `202c9bd3`

**3. [Rule 3 - Blocking] `expect` on `hasFuelInjection` in an existing schema test**
- The existing content test "rejects an extra field" named `hasFuelInjection` as an unknown field; it is now a real field, so the probe is `hasEscapePod`. The existing converter test "leaves has_fuel_injection and missiles uncompiled" now asserts the opposite (compiled as data), as the plan requires.

No other deviations. The acceptance criterion `rg -c '"aft_weapon_type"'` is 1 and `rg -c "plan 21-05" .planning/PROJECT.md` is at least 1.

## Verification

- `docker compose run --rm test npx vitest run` over the converter test, content test, inert-isolation, compliance-assets, tripwire and FIDELITY contract tests: green (the inert fields of the nine records equal `tests/golden/world/inert-records-nine.json`; the epoch 1-20 pin and the twin literals are untouched).
- `docker compose run --rm typecheck`: clean. `docker compose run --rm lint`: clean (eslint and prettier). `docker compose run --rm assets npm run assets:check`: no differences.
- Full `docker compose run --rm test`: 8003 passed, 10 skipped, 8 failed in two full runs, every failure a 5 s `TestTimeoutError` or a heavy-load timeout in files unrelated to this plan (`oracle-independence`, `tools-determinism`, `tick-flyers`, `world-lifecycle`, `kill.property`, `attack-dispatch`, `hot-weapon`, `textures`). Rerun alone, six of the eight files passed together and `kill.property` (12 tests) and `attack-dispatch` (66 tests) passed one at a time; no timeout was changed. The machine was running several worktree containers at once (the wave-3 brief records this sporadic cause).
- Remote frozen run: `~/.claude/scripts/wegolite-remote-run.sh run --rm test npm run test:acceptance` on commit `202c9bd3`: exit 0, 21 passed (epochs 1-20 plus the run minimums), 0 failed; every epoch `aiFaulted` 0, `hashFailures` 0, `stuck` 0, `frozen` 0; totals `stationArrivals` 40, `interceptArrivals` 40, `fleeArrivals` 40, `avoidCollisionEntries` 23, `attackTicksNearPlayer` 61662. QUAL-12 satisfied (21 of 21).

## Known Stubs

None. The compiled `missiles`, `maxMissiles`, `autoAi`, `hasScoop`, `hasFuelInjection`, `escorts`, `escortRoles`, `bounty`, `fuel`, `scoopPosition` and `countsAsKill` are data with no consumer yet by design (Phase 22 reads most of them; the missile counts have the tripwire and no consumer until CBT-19).

## Threat Flags

None: no new endpoint, auth path or trust boundary; T-21-33 and T-21-34 are mitigated as planned (readers fail the build on malformed values; the tripwire and E-194 guard the missile counts).

## Hand-offs

- **21-08:** the twenty new records go through these readers; `NPC_SHIP_KEYS` growth needs no test edit; the model pattern already admits `oolite_boa-mk2.dat`, but the converter's own model pattern in `glb.ts` and the GLB path pattern (`NPC_GLB_PATH_PATTERN`) are separate and plan 21-08 widens them if a hull needs it; the other five steering keys are re-checked over all 29 records by the existing refusal loop. `facingWeapon` still maps `WEAPON_*` names only.
- **21-12:** per-facing fire reads `aftWeapon` and `aftWeaponPosition`; the nine records keep `EQ_WEAPON_NONE`.
- **Phase 22:** `autoAi`, `hasScoop`, `hasFuelInjection`, `escorts`, `escortRoles`, `bounty`, `fuel`, `scoopPosition` and `countsAsKill` are stored as probabilities or values; rolls are per ship at spawn.
- **Phase 23 (CBT-19):** extends `tests/guards/npc-missiles-tripwire.test.ts` to the AI side in its own commit.

## Self-Check: PASSED

- Created `tests/guards/npc-missiles-tripwire.test.ts`, FOUND.
- Commits `f45544c5`, `a865268d`, `202c9bd3`, all ancestors of HEAD.
- `rg -c "^### E-19[456] " FIDELITY.md` is 3; the two new Key Decisions rows appear once each.
