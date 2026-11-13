---
phase: 06-hyperspace-navigation-persistence
plan: 02
subsystem: persistence
tags: [save-v2, migration, zod, indexeddb, market-snapshot, in-flight-restore]

requires:
  - phase: 05-docked-economy-station-screens
    provides: the v1 save pipeline, market generator and docked profile seams
  - phase: 06-hyperspace-navigation-persistence
    provides: plan 06-01's market seed chaining and FlightState pose/countdown fields
provides:
  - SAVE_VERSION 2 with an ordered, pure v1 → v2 migration
  - strict v2 schema for mode, target, market snapshot and flight pose
  - a 17-key market allow-list separate from the 16-key cargo map
  - a 65,536-character pre-parse bound justified by v2 worst-case arithmetic
  - one semantic validator and one writer gate for boot, autosave and migration
  - docked and in-flight snapshot/restore with the live market verbatim
affects: [06-04 session wiring, 06-05 save/load UI, 06-06 end-to-end proof]

actuals:
  tokens: 18226
  tasks: 3
  commits: 3
  plan_head_before: 8a7242a4aa893bcbd551d86da0700eef290a1fe5
  plan_head_after: 0d95cf0c4cf386f3b8c826aba04ae271c0d681b5

tech-stack:
  added: []
  patterns:
    - Numeric version dispatch with one ordered pure migration per hop
    - One strict schema plus one semantic validator shared by reader and writer
    - Exactly one seed per encoding (market snapshot vs seed-only migration)

key-files:
  created:
    - tests/persistence/save-v2.test.ts
  modified:
    - src/persistence/save.ts
    - src/persistence/autosave.ts
    - src/main.ts
    - src/app/game-session.ts
    - tests/persistence/save.test.ts
    - tests/persistence/autosave.test.ts
    - tests/e2e/autosave.spec.ts

key-decisions:
  - "SaveV1Schema keeps z.literal(1) so it remains the migration input; SAVE_VERSION is 2."
  - "A v1 migration always emits marketSeed and never market, so every accepted v2 blob carries exactly one seed."
  - "The market snapshot is validated against a separate 17-key marketGoods allow-list, never the 16-key cargo map."
  - "A launching snapshot is encoded as docked; only a live inFlight state writes a pose."
  - "In-flight restore writes launchElapsed 0, matching the post-arrival producer, rather than inventing a completed launch."
  - "The boot restore prefers a saved market snapshot and falls back to generating only from a seed."

patterns-established:
  - "Version dispatch: null -> absent, oversize -> bounded sniff, parse, >2 -> future-version, 1 -> migrate, 2 -> strict schema, else corrupt."
  - "One validateSaveSemantics owns equipment/cargo, market, target, seed and pose rules for both read and write."
  - "snapshotForSave copies the live market verbatim and never regenerates a price or a seed."

requirements-completed: [SAVE-01, SAVE-02, SAVE-03, SAVE-04, SAVE-06]

coverage:
  - id: D1
    description: "Version dispatch and the ordered pure v1 -> v2 migration preserve every original field and derive only the missing seed"
    requirement: "SAVE-01"
    verification:
      - kind: unit
        ref: "tests/persistence/save-v2.test.ts#v1 → v2 migration"
        status: pass
      - kind: unit
        ref: "tests/persistence/save.test.ts#parseSave accept path"
        status: pass
    human_judgment: false
  - id: D2
    description: "The v2 schema and semantic validator reject forged market, target, pose and single-seed rows while accepting the four valid shapes"
    requirement: "SAVE-04"
    verification:
      - kind: unit
        ref: "tests/persistence/save-v2.test.ts#the market snapshot"
        status: pass
      - kind: unit
        ref: "tests/persistence/save-v2.test.ts#the flight pose"
        status: pass
      - kind: e2e
        ref: "tests/e2e/autosave.spec.ts#a v2 blob with an unknown market good is corrupt and backed up"
        status: pass
    human_judgment: false
  - id: D3
    description: "The 17-key market allow-list includes alien_items while the 16-key cargo map still excludes it"
    requirement: "SAVE-06"
    verification:
      - kind: unit
        ref: "tests/persistence/save-v2.test.ts#the market snapshot"
        status: pass
      - kind: unit
        ref: "tests/persistence/autosave.test.ts#docked and in-flight round trips"
        status: pass
    human_judgment: false
  - id: D4
    description: "Docked and in-flight snapshots round-trip the clock, pose, speed, rates, torus and the live market verbatim"
    requirement: "SAVE-03"
    verification:
      - kind: unit
        ref: "tests/persistence/autosave.test.ts#docked and in-flight round trips"
        status: pass
    human_judgment: false
  - id: D5
    description: "encodeSave always emits exactly one seed and never writes a docked pose; a 65,537-character blob is rejected before JSON.parse"
    requirement: "SAVE-02"
    verification:
      - kind: unit
        ref: "tests/persistence/save-v2.test.ts#encodeSave v2 projections"
        status: pass
      - kind: unit
        ref: "tests/persistence/save-v2.test.ts#the v2 size bound"
        status: pass
    human_judgment: false

duration: 20min
completed: 2026-11-06
status: complete
---

# Phase 6 Plan 2: Save Schema v2 Summary

**Version 2 save wire format with an ordered v1 migration, a 17-key market snapshot, pose validation and both docked and in-flight restore**

## Performance

- **Duration:** 20 min
- **Started:** 2026-11-06T17:31:00Z
- **Completed:** 2026-11-06T17:53:00Z
- **Tasks:** 3
- **Files modified:** 8

## Accomplishments

- `SAVE_VERSION` is 2 while `SaveV1Schema` stays pinned to `z.literal(1)`; `parseSave` dispatches 1 → `migrateV1ToV2`, 2 → `SaveV2Schema`, > 2 → `future-version`, and any other numeric version → `corrupt`.
- `migrateV1ToV2` is pure and total: it preserves every v1 field, forces `mode: "docked"`, keeps an existing seed or derives `marketSeedForSystem`, and leaves `market`/`flight` absent.
- `SaveV2Schema` adds the `mode` enum, an allow-listed `targetSystem`, a 17-good market snapshot and bounded flight pose; `validateSaveSemantics` enforces system-id equality, uniqueness, stock/price bounds, pose magnitude/finiteness, orientation length, pose-iff-`inFlight`, and the exactly-one-seed rule.
- The market snapshot is checked against `SaveAllowLists.marketGoods` (all 17 commodities, including `alien_items`), never the 16-key cargo map. `main.ts` builds it from the unfiltered commodity catalogue.
- `MAX_SAVE_CHARS` is 65,536 with the v2 worst-case arithmetic documented; an oversized blob is classified by a bounded 256-character version sniff before `JSON.parse`.
- `snapshotForSave` copies the live market verbatim, encodes `launching` as docked, and writes a pose only for `inFlight`. `restoreFromSave` branches on `mode` and applies the normalized pose, speed, rates, torus and clock with the full in-flight checklist.

## Task Commits

Each task was committed atomically:

1. **Task 1: Version 2 discriminator, ordered migration and strict v2 skeleton** - `d20f191` (feat)
2. **Task 2: Market snapshot, pose, target, 17-key allow-list, raised bound and v2 encoder** - `8970185` (feat)
3. **Task 3: Snapshot and restore both modes beside the profile and market** - `0d95cf0` (feat)

**Plan metadata:** committed separately after this summary.

## Files Created/Modified

- `src/persistence/save.ts` - `SAVE_VERSION 2`, `SaveV1Schema` (literal 1), `SaveV2Schema`, `SaveV2`, `migrateV1ToV2`, market/pose schemas, extended validator, v2 encoder and the 65,536 bound.
- `src/persistence/autosave.ts` - v2 `SaveInputs` projection, `profileFromSave(SaveV2)`, docked/in-flight `restoreFromSave`, and `RestoredGame.market`.
- `src/main.ts` - `marketGoods` built from all 17 commodities and the `SaveV2` boot type.
- `src/app/game-session.ts` - `SaveV2` call sites, live market passed to the writer, and the restored snapshot preferred on Continue.
- `tests/persistence/save-v2.test.ts` - migration, classification, market, pose, single-seed, encoder and size-bound tables.
- `tests/persistence/save.test.ts` - v1 accept rows became migration rows, future fixtures moved to version 3, and a v2 unknown-key row was added.
- `tests/persistence/autosave.test.ts` - v2 literals plus docked/in-flight round trips, verbatim-market proof and invalid-no-write proof.
- `tests/e2e/autosave.spec.ts` - both future fixtures moved to version 3 and a corrupt-v2 market-good case added.

## Decisions Made

- A v1 migration always carries `marketSeed`; a canonical write always carries `market` and omits `marketSeed`. The validator rejects both and neither, so every accepted blob has exactly one seed.
- A `launching` snapshot is encoded as `docked`; v2 has no `launching` mode and D-17 takes the pre-launch anchor before the transition.
- `restoreFromSave` sets `launchElapsed = 0` for an in-flight restore. The only in-flight producer is the post-arrival save, which also writes 0, and the field is read only while `launching`.
- The boot Continue path now prefers the saved market snapshot and falls back to `generateMarket` only for a seed-only migration; the system swap and in-flight UI installation remain plan 06-04's work.

## Deviations from Plan

### Auto-fixed Issues

**1. [Process - Intermediate typecheck] `marketGoods` started optional**
- **Found during:** Task 1 (v2 skeleton)
- **Issue:** Task 1's tests need a 17-key `marketGoods` set, but `main.ts` (a Task 2 file) builds the allow-list. A required field would have left the Task 1 commit failing `typecheck`.
- **Fix:** Declared `marketGoods` optional in Task 1 and made it required when the market schema and `main.ts` construction landed in Task 2.
- **Files modified:** `src/persistence/save.ts`
- **Verification:** `docker compose run --rm typecheck` is clean at the plan level.
- **Committed in:** `d20f191`, `8970185`

**2. [Rule 3 - Blocking] Lint/type fixes folded into the Task 3 commit**
- **Found during:** Task 3 verification (`npm run lint` / `typecheck`)
- **Issue:** Two unnecessary `as SaveV2`/`as SaveFlightPose` assertions failed `@typescript-eslint/no-unnecessary-type-assertion`; `exactOptionalPropertyTypes` rejected `marketSeed: undefined` in test overrides; Prettier flagged five files.
- **Fix:** Removed the assertions, omitted the undefined overrides, and ran Prettier on the changed files. Formatting and test-construction only; no production behaviour changed.
- **Files modified:** `src/persistence/save.ts`, `tests/persistence/save.test.ts`, `tests/persistence/save-v2.test.ts`
- **Verification:** `docker compose run --rm lint` and `typecheck` are green.
- **Committed in:** `0d95cf0` (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (1 process/typecheck, 1 blocking lint).
**Impact on plan:** Both were hygiene fixes to keep every commit typechecking and the lint gate green. No scope creep and no change to the v2 wire contract.

## Issues Encountered

- None during implementation. The plan's float/integer risk (Pitfall 1) does not apply here: fuel stays an integer at the writer boundary and the schema rejects a fractional value, which the existing tests cover.

## User Setup Required

None - no external service configuration required.

## Verification Evidence

- `docker compose run --rm test npx vitest run tests/persistence/save-v2.test.ts tests/persistence/save.test.ts tests/persistence/autosave.test.ts` → 3 files, 119 tests passed.
- `docker compose run --rm test` (whole unit suite) → 85 files, 1,038 tests passed.
- `docker compose run --rm typecheck` → `tsconfig.json` and `tsconfig.sim.json` clean.
- `docker compose run --rm lint` → ESLint clean and Prettier reports "All matched files use Prettier code style!".
- `docker compose run --rm e2e sh -lc "npm run build && npx playwright test tests/e2e/autosave.spec.ts --grep 'future-version|unknown market good'"` → 3 passed (both version-3 future fixtures and the corrupt-v2 market-good case).
- Targeted proofs: `save-v2.test.ts` covers the migration table, classification table, market/pose reject rows, single-seed encoder projections and the 65,537-character pre-parse bound; `autosave.test.ts` proves docked and in-flight round trips, verbatim market goods, the in-flight field checklist and the invalid-snapshot no-write path.

## Next Phase Readiness

- Plan 06-04 can call `snapshotForSave(state, profile, system, station, market, catalogue, targetId)` and `restoreFromSave` with a v2 save; the market snapshot is authoritative and never re-rolled.
- Plan 06-05's F2 Load shares the same `parseSave`/`restoreFromSave` pipeline and the same allow-lists; no second validator or store exists.
- Plan 06-06 should verify the arrival autosave with the real in-flight snapshot; the unit contract is already pinned.
- No blockers. One known limitation carried from the plan: a v2 save whose `system` is not the boot system still needs plan 06-04's `enterSystemById` before in-session reload is fully faithful.

---

## Self-Check: PASSED

All created files exist and all three task commits are ancestors of HEAD.

- `[ -f tests/persistence/save-v2.test.ts ]` → FOUND
- `[ -f .planning/phases/06-hyperspace-navigation-persistence/06-02-SUMMARY.md ]` → FOUND
- `git merge-base --is-ancestor d20f191 HEAD` → FOUND
- `git merge-base --is-ancestor 8970185 HEAD` → FOUND
- `git merge-base --is-ancestor 0d95cf0 HEAD` → FOUND
