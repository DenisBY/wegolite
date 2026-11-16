---
phase: 14-npc-flight-and-steering-fidelity-gate
plan: 03
subsystem: content
tags: [content-build, npc-ships, shipdata, flight-model, drift-gate, oolite-fidelity]

requires:
  - phase: 13-views-lasers-and-shields
    provides: the NPC record schema, converter and hand-written golden extended here (plan 13-16 did the same for the energy fields)
provides:
  - maxFlightSpeed, maxFlightRoll, maxFlightPitch and thrust (float32) on all nine NPC records, behind the strict schema, the hand-written golden and the assets drift gate
  - Oolite's defaults 160, 2.0, 1.0 and 15.0 (ShipEntity.m:263-270) as named converter constants
  - STEERING_ASSUMED_ABSENT_KEYS, the build-time refusal of accuracy, reaction_time, scanner_range, aft_weapon_type, port_weapon_type and starboard_weapon_type
affects: [14-18, 14-19]

requirements-completed: []
requirements-advanced: [AI-01]

actuals:
  tokens: 8300
  tasks: 2
  commits: 3

tech-stack:
  added: []
  patterns:
    - "A build-time guard on the assumption a port relies on: a pin bump that authors a key the port assumes absent fails the content build with a SCHEMA error naming the key"

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
  - "The refusal tests a key by presence in the resolved record (Object.hasOwn), not by value, so an authored value equal to Oolite's default is still refused: the port's reachability analysis assumes the key is not authored, and a later pin that authors the default would be an unreviewed decision"
  - "has_fuel_injection and missiles stay uncompiled and unrefused (afterburner and missiles are recorded scope cuts); a test asserts the converter code and the records never name them"

patterns-established:
  - "The converter's expected values are pinned three ways: the hand-written golden (read from the plist), a table in the test (float32 of the plain plist number), and a loop that reads the resolved catalogue entry"

coverage:
  - id: D1
    description: "The nine NPC records carry maxFlightSpeed, maxFlightRoll, maxFlightPitch and thrust as float32 from the resolved plist, with Oolite's defaults when absent, behind the strict schema, the hand-edited golden and the drift gate"
    requirement: "AI-01"
    verification:
      - kind: unit
        ref: "tools/oolite-ingest/convert/npc-ships.test.ts#NPC flight fields (AI-01, minimum of DATA-15)"
        status: pass
      - kind: unit
        ref: "tests/content/ships-npc.test.ts#NpcShipCatalogueSchema"
        status: pass
      - kind: command
        ref: "docker compose run --rm assets npm run assets:check"
        status: pass
    human_judgment: false
  - id: D2
    description: "The content build refuses a resolved NPC record that authors accuracy, reaction_time, scanner_range, aft_weapon_type, port_weapon_type or starboard_weapon_type; the nine stock records compile unchanged"
    requirement: "AI-01"
    verification:
      - kind: unit
        ref: "tools/oolite-ingest/convert/npc-ships.test.ts#NPC steering assumptions (AI-01, T-14-06)"
        status: pass
      - kind: command
        ref: "docker compose run --rm assets npm run assets:check"
        status: pass
    human_judgment: false
  - id: D3
    description: "No flight value was typed into src/content/generated or rebalanced; every number comes from the pinned shipdata.plist through the content build"
    requirement: "AI-01"
    verification: []
    human_judgment: true
    rationale: "A process prohibition. The drift gate proves the committed file equals the build output, and the golden was edited from the plist, but nothing mechanical shows who typed a number."

duration: 14min
completed: 2026-11-15
status: complete
plan_head_before: 6966da80cac392756cd36a874fc9a8a36c9d6472
plan_head_after: df97bdcd4da1b38b49bae5d9f19ff076f6f6ba65
---

# Phase 14 Plan 03: NPC flight constants in the content build Summary

**The nine NPC ship records now carry Oolite's max flight speed, roll, pitch and thrust as float32 (compiled from the vendored shipdata.plist with Oolite's 160 / 2.0 / 1.0 / 15.0 defaults), and the content build refuses any record that authors one of the six keys the steering port's reachability analysis assumes absent.**

## Performance

- **Duration:** about 14 min
- **Completed:** 2026-11-15
- **Tasks:** 2 of 2 (Task 1 was the `tracer`: its four verify commands passed, so expansion followed)
- **Files:** 7 modified (about 33 KB of diff, 438 insertions, 32 deletions), none created

## Accomplishments

- `NpcShipSchema` (strict) gained `maxFlightSpeed`, `maxFlightRoll`, `maxFlightPitch` and `thrust`, each finite and non-negative, each commented with the plist key and Oolite's default line.
- `compileNpcShips` reads them with `floatExtra` (float32, a non-finite value fails the build) and falls back to `DEFAULT_MAX_FLIGHT_SPEED` 160, `DEFAULT_MAX_FLIGHT_ROLL` 2, `DEFAULT_MAX_FLIGHT_PITCH` 1 and `DEFAULT_THRUST` 15.
- `docker compose run --rm assets` regenerated `ships-npc.json` (5411 to 6415 bytes) and the `manifest.json` row; nothing else under `src/content/generated/` or `public/models/` moved.
- The values, re-read from the vendored plist (every one matches the RESEARCH table; the plist lines are in the golden's `sources`):

| Ship | max_flight_speed | max_flight_roll | max_flight_pitch | thrust |
|------|-----------------|-----------------|------------------|--------|
| adder | 240 | 2.8 | 2 | 30 |
| cobramk1 | 260 | 2 | 1.2 | 25 |
| gecko | 300 | 3 | 1.5 | 45 |
| krait | 300 | 2.75 | 1.5 | 35 |
| mamba | 320 | 2.1 | 1.4 | 32 |
| moray | 300 | 2.5 | 1.5 | 32 |
| shuttle | 80 | 2 | 0.9 | 16 |
| sidewinder | 370 | 2.8 | 1.6 | 37 |
| viper | 320 | 2.8 | 1.8 | 32 |

  The record holds the float32 of each (roll 2.8 is 2.799999952316284, mamba pitch 1.4 is 1.399999976158142, shuttle pitch 0.9 is 0.8999999761581421, and so on).
- The hand-written golden `tests/golden/content/ships-npc.json` was edited by hand from the plist values (no writer exists): the four fields in all nine examples, the `fields` list (seventeen), the `defaults` block and eleven new `sources` lines with the plist line numbers.
- `STEERING_ASSUMED_ABSENT_KEYS` (exported) is checked in `compileNpcShips` right after `like_ship` resolution and the GLB-ownership check: a resolved record that has any of the six keys fails with a SCHEMA `ContentError` on the record key, whose message names the key, says the Phase 14 steering port relies on Oolite's default for it and that a pin bump adding it needs a new decision.
- Tests (all Docker): converter test 51 cases (flight values for nine ships, three-way pinned; the defaults; non-finite and non-numeric rejection; a negative value naming `viper.maxFlightSpeed`; one refusal case per key, a default-valued refusal, a stock-records-carry-none check, an uncompiled-`has_fuel_injection`/`missiles` check); `tests/content/ships-npc.test.ts` now rejects other extras (`accuracy`, `maxFlightYaw`, `hasFuelInjection`) and a missing or bad flight field.

## Facts the later plans need

- **Field names on `NpcShip`:** `maxFlightSpeed`, `maxFlightRoll`, `maxFlightPitch`, `thrust` (numbers, float32). Plan 14-18 (which wires the runtime `flight` key into `TrafficContent`) reads them from `loadNpcCatalogue()`. `maxFlightYaw` is not compiled and the schema rejects it; Oolite defaults it to the pitch value (ShipEntity.m:267), so a port that needs yaw uses `maxFlightPitch`.
- **No stock ship takes a default** for any of the four keys, so the 160 / 2.0 / 1.0 / 15.0 defaults are exercised only by the converter test (a Viper with the keys deleted).
- **The refusal checks the resolved record**, so a key authored on an `oolite_template_*` parent trips it for the child too. The plist authors `aft_weapon_type` (lines 211, 372, 641, 798) and `scanner_range` (3708, 3756) on ships outside the nine (not compiled), so they do not trip it today.
- **The `.planning/phases/.../14-RESEARCH.md` claim holds:** none of `accuracy`, `reaction_time`, `scanner_range` or the three extra weapon-mount types is authored for any of the nine.

## Task Commits

1. **Task 1 (tracer): compile the four flight fields** - `fa3c2bb` (feat)
2. **Task 2, RED: the six refusal cases fail** - `3cd8aad` (test)
3. **Task 2, GREEN: refuse the assumption keys** - `df97bdc` (feat)

**Plan metadata:** the docs commit that carries this file, STATE.md, ROADMAP.md and REQUIREMENTS.md.

## Verification (run in Docker)

- `docker compose run --rm assets`: wrote 104 files; `docker compose run --rm assets npm run assets:check`: "no differences" (run after Task 1 and again after Task 2).
- `docker compose run --rm test npx vitest run tests/content/ships-npc.test.ts tools/oolite-ingest/convert/npc-ships.test.ts`: 2 files, 74 tests, pass. RED run before the Task 2 change: 7 of 51 converter tests failed (the six keys plus the default-valued case), as intended.
- `docker compose run --rm test` (full suite with coverage, after the last commit): 173 files, 3814 passed, 2 skipped (pre-existing).
- `docker compose run --rm lint` and `docker compose run --rm typecheck`: clean, after both tasks. No test file that types NPC records needed an edit.
- Acceptance counts: `rg -c maxFlightSpeed src/content/schemas/ship-npc.ts` 1; `rg -c '"maxFlightSpeed"' src/content/generated/ships-npc.json` 9; `rg -c '"maxFlightSpeed"' tests/golden/content/ships-npc.json` 11 (see deviation 1); `rg -c reaction_time tools/oolite-ingest/convert/npc-ships.ts` 1.
- No `verify` was run: content and tools only, owner gate policy.

## Decisions Made

- See key-decisions above. The converter's doc comment names the afterburner and missiles as scope cuts and the test pins that the code never names them.

## Deviations from Plan

**1. [Acceptance count] The golden's `"maxFlightSpeed"` count is 11, not 9**
- **Found during:** Task 1 acceptance check
- **Issue:** the criterion `rg -c '"maxFlightSpeed"'` == 9 counts lines, and the golden also lists the field in its `fields` array (the "exactly the seventeen fields" test reads it) and in its `defaults` block, so 9 example records plus those two lines is 11. `rg -c '"maxFlightSpeed":'` (key form) is 10: nine records plus `defaults`.
- **Fix:** none needed; the intent (all nine records carry it) holds, and the `fields` and `defaults` entries are required by the existing golden structure.
- **Commit:** `fa3c2bb`

**2. [Rule 1 - existing test] An existing schema test used `maxFlightSpeed` as its example of a rejected extra field**
- **Found during:** Task 1
- **Issue:** `tests/content/ships-npc.test.ts` asserted that `{...record, maxFlightSpeed: 350}` is rejected, which is now a field.
- **Fix:** the test rejects `accuracy`, `maxFlightYaw` and `hasFuelInjection` instead.
- **Files modified:** `tests/content/ships-npc.test.ts`
- **Commit:** `fa3c2bb`

**Total deviations:** 1 auto-fixed plus 1 acceptance-count note. **Impact:** none on the plan's scope.

## Known Stubs

None.

## Threat Flags

None. The change adds build-time input reads and a build-time refusal only; the strict schema still rejects any unknown field at load (T-14-05, T-14-06 mitigated as planned).

## Self-Check: PASSED

- All seven modified files exist and are committed; commits `fa3c2bb`, `3cd8aad` and `df97bdc` are ancestors of HEAD; the drift gate, tests, lint and typecheck were re-run after the last code edit.
