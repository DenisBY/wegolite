---
phase: 07-hardening-community-release
plan: 03
subsystem: testing
tags: [golden-data, save-migration, persistence, hyperspace, vitest, QUAL-04]

requires:
  - phase: 06-hyperspace-navigation-persistence
    provides: production parseSave reader, migrateV1ToV2, hyperspace fuel and jump-time arithmetic
provides:
  - Checked-in Phase 4 and Phase 5 v1 save blobs with v2 migration goldens, proven through the production reader
  - Golden migration, idempotency and round-trip test (tests/persistence/save-golden.test.ts)
  - Oolite route fixtures as golden data read by tests/sim/hyperspace.test.ts
affects: [07-12 coverage thresholds (baseline includes these tests), future save-format changes, future hyperspace rule changes]

actuals:
  tokens: 1893
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Regression goldens are reviewed snapshots: produced once from the production function, then checked by hand against its documented rules; never regenerated blindly"
    - "Golden comparison uses canonical JSON (JSON.stringify of the parsed value), so Prettier whitespace cannot change a result"

key-files:
  created:
    - tests/golden/save/v1-phase4.json
    - tests/golden/save/v1-phase5.json
    - tests/golden/save/v2-from-v1-phase4.json
    - tests/golden/save/v2-from-v1-phase5.json
    - tests/persistence/save-golden.test.ts
    - tests/golden/hyperspace/routes.json
  modified:
    - tests/sim/hyperspace.test.ts

key-decisions:
  - "The v2 goldens were generated once by a one-off tsx script (kept under /tmp, outside the repo) that calls migrateV1ToV2 on the parsed v1 blobs, then reviewed field by field; the generator is not committed"
  - "Golden v1 blobs use the test allow-lists (g0-s7, coriolis-station, EQ_DOCK_COMP, food/gold/gem_stones); no validator or schema was loosened"
  - "The route table keeps system names as endpoints and resolves them through byName; COMMIT_ROUTES stays inline because it is a separate commit-timing table"

patterns-established:
  - "Golden save blobs are read as text and parsed through parseSave with the boot-shaped allow-lists, the same path the app uses"

requirements-completed: [QUAL-04]

coverage:
  - id: D1
    description: "Phase 4 v1 blob parses through parseSave and migrates to the checked-in v2 golden in canonical JSON"
    requirement: "QUAL-04"
    verification:
      - kind: unit
        ref: "tests/persistence/save-golden.test.ts#golden v1 save migration through the production reader > Phase 4 v1 blob"
        status: pass
    human_judgment: false
  - id: D2
    description: "Phase 5 v1 blob with every optional v1 field parses and migrates to the checked-in v2 golden in canonical JSON"
    requirement: "QUAL-04"
    verification:
      - kind: unit
        ref: "tests/persistence/save-golden.test.ts#golden v1 save migration through the production reader > Phase 5 v1 blob with every optional field"
        status: pass
    human_judgment: false
  - id: D3
    description: "Migration is idempotent and the migrated v2 re-parses to an equal object for both goldens"
    requirement: "QUAL-04"
    verification:
      - kind: unit
        ref: "tests/persistence/save-golden.test.ts#golden v1 save migration through the production reader"
        status: pass
    human_judgment: false
  - id: D4
    description: "Oolite route fixtures live in tests/golden/hyperspace/routes.json with unchanged expected numbers, read by the hyperspace test"
    requirement: "QUAL-04"
    verification:
      - kind: unit
        ref: "tests/sim/hyperspace.test.ts#Oolite chart arithmetic"
        status: pass
    human_judgment: false
  - id: D5
    description: "The v2 goldens are correct under the migration rules (hand review, recorded below)"
    verification: []
    human_judgment: true
    rationale: "Hand review of the golden content against migrateV1ToV2 is a judgment step; the test only proves the production path reproduces the reviewed bytes"

duration: ~10min
completed: 2026-11-07
status: complete
---

# Phase 7 Plan 03: Golden save migration and Oolite route fixtures

**Two real v1 save blobs migrate through the production reader to checked-in, byte-stable v2 goldens, and the five Oolite route fixtures are golden data read by the hyperspace test**

## Performance

- **Duration:** ~10 min (approximate; the plan start time was not recorded at executor start, so this is estimated from commit timestamps)
- **Started:** approximately 2026-11-07T21:58Z (estimate)
- **Completed:** 2026-11-07T22:05Z (verification finished)
- **Tasks:** 2
- **Files modified:** 8 (7 created or modified in the repository code and fixtures, plus this SUMMARY)

## Accomplishments

- Four save fixtures under `tests/golden/save/`: two v1 blobs (Phase 4 shape, Phase 5 shape using cargo in tonne, kilogram and gram units, fuel, missiles, passenger berths and marketSeed) and two v2 goldens produced from `migrateV1ToV2`.
- `tests/persistence/save-golden.test.ts` proves, per blob, that `parseSave` with the allow-lists returns `ok` with version 2, that the canonical JSON matches the golden, that migrating twice is byte-identical, and that the migrated v2 re-parses to an equal object (8 passing cases).
- `tests/golden/hyperspace/routes.json` holds the five Oolite route rows; `tests/sim/hyperspace.test.ts` reads them and resolves endpoints through `byName`. Every expected number is unchanged.
- `src/persistence/save.ts` and every other production file are unchanged.

## Task Commits

Each task was committed atomically:

1. **Task 1: End-to-end golden save migration** - `196f32e` (test)
2. **Task 2: Oolite route fixtures as golden data** - `3a0e543` (test)

**Plan metadata:** recorded in the follow-up docs commit that adds this SUMMARY, STATE.md and ROADMAP.md.

_Note: plan `type: execute`, so no TDD RED/GREEN commits were required._

## Hand review of the two v2 goldens

The goldens were produced once by calling `migrateV1ToV2(SaveV1Schema.parse(v1))` and then checked field by field against the function's doc comment and body.

- `v2-from-v1-phase4.json`: `version` is 2. `mode` is `docked`. `clockSeconds`, `credits`, `equipment`, `system` and `station` are copied unchanged from the v1 blob. The v1 blob had no `marketSeed`, so the migration derived it as `marketSeedForSystem("g0-s7")` = 3545325333, which equals the seed in `tests/golden/market/lave.json`, the Lave seed the market golden writer uses. There is no `market` key and no `flight` key, as the migration requires for a v1 save. No `cargo`, `fuel`, `missiles` or `passengerBerths` keys appear because the v1 blob did not carry them.
- `v2-from-v1-phase5.json`: `version` is 2 and `mode` is `docked`. `cargo` is carried as the three entries from the v1 blob (food 2 t, gold 499 kg, gem_stones 250 g), in input order. `fuel` 40, `missiles` 1 and `passengerBerths` 1 are carried. `marketSeed` is kept at the v1 value 3545325333 rather than re-derived. There is no `market` and no `flight`. Every other field matches the v1 input.

Both goldens match the rules: seed kept or derived, no market snapshot, cargo entries carried, version 2. No validator or schema was changed to make them pass.

## Files Created/Modified

- `tests/golden/save/v1-phase4.json` - Phase 4 v1 save blob (input)
- `tests/golden/save/v1-phase5.json` - Phase 5 v1 save blob with every optional v1 field (input)
- `tests/golden/save/v2-from-v1-phase4.json` - reviewed v2 golden for the Phase 4 blob
- `tests/golden/save/v2-from-v1-phase5.json` - reviewed v2 golden for the Phase 5 blob
- `tests/persistence/save-golden.test.ts` - golden migration, idempotency and round-trip proof
- `tests/golden/hyperspace/routes.json` - the five Oolite route fixtures as golden data
- `tests/sim/hyperspace.test.ts` - reads the route golden through `byName` instead of the inline literal

## Decisions Made

- The v2 goldens were generated by a one-off `tsx` script kept under `/tmp/wg-golden-gen` (outside the repository), run in the test container with the repository mounted. The generator is not committed, as the plan's "never add scratch files" rule requires.
- Golden blobs use the test allow-lists the existing persistence tests build; the production validator and schema are unchanged.
- Prettier was applied to the new JSON files and the test (`prettier --write`). This changed whitespace only; comparisons are canonical JSON, so the result is unaffected.

## Deviations from Plan

None - plan executed as written. Notes:

- The plan asked for at least six passing cases in `save-golden.test.ts`; four cases per blob (eight total) were written, so the minimum is exceeded.
- `CLAUDE.md` was not present at the repository root (the read returned "does not exist"). `AGENTS.md` was loaded from the system context and followed.

**Total deviations:** 0 auto-fixed.
**Impact on plan:** none.

## Verification Run (container)

| Command | Result |
| --- | --- |
| `docker compose run --rm test npx vitest run tests/persistence/save-golden.test.ts tests/persistence/save.test.ts tests/persistence/save-v2.test.ts` | PASS: 3 files, 111 tests (save-golden: 8) |
| `docker compose run --rm test npx vitest run tests/sim/hyperspace.test.ts` | PASS: 1 file, 41 tests |
| `docker compose run --rm test` (full unit suite) | PASS: 92 files, 1155 tests, exit 0 |
| `docker compose run --rm lint` (eslint + prettier --check) | PASS: exit 0 |
| `docker compose run --rm typecheck` (tsconfig and tsconfig.sim.json) | PASS: exit 0 |
| `docker compose run --rm test npx prettier --check tests/golden/save tests/persistence/save-golden.test.ts tests/golden/hyperspace tests/sim/hyperspace.test.ts` | PASS |

Acceptance checks:

- `ls tests/golden/save/` lists exactly the four JSON files: PASS.
- `rg -c 'name: "Lave -> ' tests/sim/hyperspace.test.ts`: no match (baseline 5): PASS.
- `rg -c "routes\.json" tests/sim/hyperspace.test.ts`: 1 (baseline 0): PASS.
- `rg -o '"jumpTimeSeconds"' tests/golden/hyperspace/routes.json | wc -l`: 5: PASS.
- `git diff --quiet 56cfad7 HEAD -- src/` exits 0, so no production file changed: PASS.

## Issues Encountered

- `requirements.ready-ids` reports QUAL-04 as blocked, because plan 07-12 also declares QUAL-04 and has no SUMMARY yet (shared-ID gate, #2388). Consequently `requirements.mark-complete` was not run for QUAL-04 and REQUIREMENTS.md is not checked off by this plan. The coverage half of QUAL-04 is plan 07-12; this plan delivers only the golden-data half. The `requirements-completed` frontmatter field copies the plan's `requirements` verbatim as the template requires; read it as "this plan contributed to QUAL-04", not "QUAL-04 is complete".

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 07-12 can measure its coverage baseline with these golden tests included (the plan states so).
- Any future save-format change must either keep these goldens byte-stable or update them after the same hand review.

## Self-Check: PASSED

- All seven created or modified files exist on disk (checked with `[ -f ]`).
- Commits `196f32e` and `3a0e543` are ancestors of HEAD.
- `gsd_run check evaluation-scope --plan 07-03 --commits-only` resolved with both commits on this branch.
- Production source (`src/`) is unchanged since the plan's starting commit `56cfad7`.

---
*Phase: 07-hardening-community-release*
*Completed: 2026-11-07*
