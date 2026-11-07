---
phase: 06-hyperspace-navigation-persistence
plan: 15
subsystem: hyperspace
tags: [hyperspace, arrival, prng, oolite-parity, persistence, gap-closure]

# Dependency graph
requires:
  - phase: 06-hyperspace-navigation-persistence
    provides: witchpoint arrival install, in-flight autosave and restore, origin market seed chain
provides:
  - drawWitchpointExit(seed): one seeded draw of Oolite's radial offset, 3D quaternion direction and tilts
  - applyWitchpointArrival(state, layout, config, draw): 3D placement with the Oolite buoy push-out
  - Jump-commit draw from the origin's persisted market seed, with no save-schema change
affects: [hyperspace arrival, save/restore of in-flight poses, NAV-05 verification]

# Actuals (#2632)
actuals:
  tokens: 5081
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Arrival offset drawn once at jump commit from createSeededRandom, never per frame or on reload"

key-files:
  created: []
  modified:
    - src/sim/hyperspace/arrival.ts
    - src/app/game-session.ts
    - tests/sim/hyperspace-arrival.test.ts
    - tests/persistence/autosave.test.ts
    - tests/e2e/hyperspace.spec.ts
    - .planning/PROJECT.md
    - .planning/phases/06-hyperspace-navigation-persistence/06-CONTEXT.md

key-decisions:
  - "Arrival offset is a full 3D direction from Oolite's quaternion forward vector, keeping Oolite's corner weighting, with the 760 m safety push-out and a 12,800 m half-range"
  - "The draw seed is the origin's persisted market seed, so the offset is reproducible from the save and no save field is added"
  - "The hashed-pose PROJECT.md row stays as history; a new 3D row sits directly beneath it"
  - "CONTEXT.md deferred entry for the random exit offset is marked superseded by owner direction, citing plan 06-15"

patterns-established:
  - "Oolite draw ports keep Oolite's range and distribution; the stream change from Ranrot/gen_rnd_number to one seeded stream is recorded, not treated as a behaviour change"

requirements-completed: [NAV-05]

# Metrics
duration: not recorded (start timestamp was not captured)
completed: 2026-11-07
status: complete
---

# Phase 6 Plan 15: Seeded 3D Witchpoint Arrival Summary

**Witchpoint arrival offset drawn in three dimensions from the origin's seeded market PRNG at jump commit, following Oolite's leaveWitchspace, and a reload restores the saved pose without re-drawing it**

## Performance

- **Duration:** not recorded
- **Started:** not recorded
- **Completed:** 2026-11-07
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments

- The FNV-1a route hash that fixed the arrival offset is gone. `drawWitchpointExit(seed)` draws Oolite's radial value over plus or minus half the scanner range, a random quaternion whose forward vector gives a unit 3D direction (corner weighting kept), and three tilts, all from one `createSeededRandom` stream in a fixed order.
- `applyWitchpointArrival` applies Oolite's buoy push-out (`abs((int)d1) < min_d1`) and places the ship at the witchpoint plus the signed distance along the draw's direction on all three axes. Every arrival lies at least the 760 m safety distance and at most 12,800 m from the witchpoint. Speed, rates, torus, mode and dock latch are unchanged.
- The jump commit in `handleHyperspaceJumped` draws once from `previousSeed` (the origin's persisted market seed) before the synchronous install block. A reload installs the saved pose and never calls the draw.
- Unit proof: determinism, different-seed difference, Oolite range checks over 2,000 seeds, the 3D clamp over the same sweep, direction-times-distance agreement, all three axes taking both signs, and stationarity on all 1,750 directed galaxy-0 routes.
- Save round trip proves the restored pose matches the saved one within the SAVE-03 tolerance, and that a re-draw from the persisted seed would differ.
- Browser proof: the live arrival autosave pose sits between 700 m and 13,000 m from the witchpoint, alongside the unchanged G-1 restore assertions.

## Task Commits

Each task was committed atomically:

1. **Task 1: End-to-end seeded 3D arrival** - `309a40f` (feat)
2. **Task 2: Save round trip, PROJECT.md row and CONTEXT.md supersession** - `0dc514c` (test)
3. **Task 3: Browser bound check on the live arrival pose** - `45f4a49` (test)

**Plan metadata:** committed with this SUMMARY (docs: complete plan 06-15).

## Files Created/Modified

- `src/sim/hyperspace/arrival.ts` - `drawWitchpointExit`, the 3D `applyWitchpointArrival`, and the removed route hash
- `src/app/game-session.ts` - draws from the origin market seed at commit and passes the draw to the install
- `tests/sim/hyperspace-arrival.test.ts` - determinism, range, clamp, spread and stationarity cases
- `tests/persistence/autosave.test.ts` - call-site update, plus the reload-does-not-re-draw case
- `tests/e2e/hyperspace.spec.ts` - three-dimensional bound assertion on the live arrival autosave
- `.planning/PROJECT.md` - new 3D decision row directly beneath the superseded hashed-pose row
- `.planning/phases/06-hyperspace-navigation-persistence/06-CONTEXT.md` - supersession note on the deferred exit-offset entry

## Decisions Made

- Full 3D direction from Oolite's quaternion forward vector. Oolite's corner weighting in `quaternion_set_random` is kept deliberately because the port follows Oolite.
- The seed is the origin's persisted market seed. No save field is added, and the in-flight pose stays authoritative after a reload.
- The stream change (Ranrot and gen_rnd_number replaced by one seeded stream) keeps each draw's Oolite range and distribution. It is recorded here and does not change any distribution.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Autosave call site moved into the task 1 commit**
- **Found during:** Task 1 typecheck
- **Issue:** `tests/persistence/autosave.test.ts` called `applyWitchpointArrival` with the old origin and destination arguments. The task 1 typecheck gate could not pass while that call remained.
- **Fix:** The call was changed to `drawWitchpointExit(marketSeedForSystem("g0-s55"))`, the form task 2 specifies, and the change landed in commit `309a40f`. Task 2 then added only the new round-trip case.
- **Files modified:** `tests/persistence/autosave.test.ts`
- **Commit:** `309a40f`

**2. [Rule 3 - Blocking] Prettier formatting on the rewritten arrival test**
- **Found during:** Task 1 lint
- **Issue:** Prettier flagged `tests/sim/hyperspace-arrival.test.ts`.
- **Fix:** `prettier --write` on that one file, formatting only. No assertion changed.
- **Commit:** `309a40f`

### Shared-tree staging (not a code deviation)

`.planning/PROJECT.md` and `06-CONTEXT.md` already had uncommitted orchestrator hunks when this plan started. These included the superseded outcome on the hashed-pose row, the north-up and countdown row edits, and the D-06 and D-08 notes. Those hunks were not committed by this plan. This plan's hunks were staged through the index, built from the `HEAD` version plus the new row and note, so the commits hold only the new row and the supersession note.

Consequence: at `HEAD`, the hashed-pose row still shows its previous `✓ Phase 6` outcome. The orchestrator's superseded outcome for that row remains uncommitted in the working tree.

Total deviations: 2 auto-fixed (both Rule 3). Impact: none on runtime behaviour.

## Issues Encountered

None beyond the deviations above.

## Verification

Docker only, in the container:

| Command | Result |
|---|---|
| `docker compose run --rm test npx vitest run tests/sim/hyperspace-arrival.test.ts` | 13 passed |
| `docker compose run --rm test npx vitest run tests/persistence/autosave.test.ts` | 23 passed (includes "a reloaded in-flight arrival keeps the drawn pose and does not re-draw it") |
| `docker compose run --rm typecheck` | exit 0 |
| `docker compose run --rm lint` | exit 0 |
| `docker compose run --rm e2e sh -lc "npm run build && npx playwright test tests/e2e/hyperspace.spec.ts"` | exit 0, 2 passed (the arrival case and the chart arrow case) |
| `docker compose run --rm test` (full suite) | exit 0, 89 files and 1,123 tests passed |

The full `docker compose run --rm verify` is the phase gate and was not run per plan.

Grep acceptance at HEAD and after the change:
- FNV-1a literal in arrival.ts code lines: 2 to 0
- `arrivalWord` in arrival.ts and the arrival test: 2 and 4 to 0 and 0
- `createSeededRandom` in arrival.ts: 0 to 3
- `511.5` in arrival.ts: 0 to 5
- `drawWitchpointExit` in game-session.ts: 0 to 2
- `marketSeedForSystem` in the arrival test: 0 to 4
- New PROJECT.md row: 0 to 1, with the hashed-pose row still present
- CONTEXT.md supersession note: 0 to 1, with the original deferred text intact

## Self-Check: PASSED

- Commits `309a40f`, `0dc514c` and `45f4a49` exist on `main`.
- All files listed above exist and carry the stated changes.

## Known Stubs

None.

## Threat Flags

None. No new network endpoint, auth path, file access or schema change was introduced. The save format is unchanged.

## Next Phase Readiness

NAV-05 human item 1 (pose distribution) is closed by owner direction. The re-verifier should move that item in 06-VERIFICATION.md. STATE.md and ROADMAP.md progress were not updated by this executor because the orchestrator owns those files in this sequential run.
