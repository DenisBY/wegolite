---
phase: 22-initial-population
plan: 15
subsystem: browser-budget
tags: [qual-09, draw-calls, triangles, playwright, population, phase-gate, threejs-performance]

requires:
  - phase: 22-initial-population
    provides: "census golden specSystems (22-12), the live session populating through createSystemPopulate (22-14)"
provides:
  - "tests/e2e/population-anarchy.spec.ts: the QUAL-09 browser proof on the real populator (Qudira g0-s116, epoch 1), before and after a kill"
  - "docs/PERFORMANCE.md 'Populated anarchy (Phase 22, QUAL-09)' and a dated PROJECT.md note on the draw-call budget row"
  - "the Phase 22 gate: remote verify-full and the frozen 20-seed run green at 2d7dee83"
affects: [22-16]

actuals:
  tokens: 9500
  tasks: 2
  commits: 3
plan_head_before: 0e8d816cc2c6720d8f6aaf17a886a1e2e94d12cd
plan_head_after: 2d7dee83

tech-stack:
  added: []
  patterns:
    - "a browser spec derives the realised hull-key set from the Node census world (tests/helpers/population-census.ts), because the probe does not expose entity hull keys"
    - "settled counter reads after rendered frames, readiness by key (GLB and own textures finished), withinBudget for every assertion"

key-files:
  created:
    - tests/e2e/population-anarchy.spec.ts
  modified:
    - docs/PERFORMANCE.md
    - .planning/PROJECT.md

key-decisions:
  - "The spec runs one test per distinct census spec system; the census names Qudira for both the most ships and the most keys, so one test runs"
  - "The realised key set comes from the Node world (censusWorld), asserted equal in size to the golden's keys; the browser proves every key drawn through calls >= keys and triangles >= the realised NPC triangles"

patterns-established:
  - "Phase 22 QUAL-09 evidence: 32 calls / 132,468 triangles before a kill, 35 / 132,976 after, against 50 / 250,000"

requirements-completed: [QUAL-09]

coverage:
  - id: D1
    description: "The largest populated galaxy-0 anarchy (Qudira, 96 ships, 22 keys) boots in the browser through save, Continue and launch, and its entity count and epoch equal the census golden"
    requirement: QUAL-09
    verification:
      - kind: e2e
        ref: "tests/e2e/population-anarchy.spec.ts (remote, snapshot 83cd6fea and 2d7dee83 via verify-full)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Calls and triangles, read settled after rendered frames, are within DRAW_CALL_BUDGET (50) and TRIANGLE_BUDGET (250,000) before and after the kill with debris and explosion live"
    requirement: QUAL-09
    verification:
      - kind: e2e
        ref: "tests/e2e/population-anarchy.spec.ts (32/132,468 before, 35/132,976 after)"
        status: pass
    human_judgment: false
  - id: D3
    description: "The measurement is recorded (PERFORMANCE.md subsection, PROJECT.md note) with the budgets unchanged"
    requirement: QUAL-09
    verification:
      - kind: other
        ref: "rg -c 'Populated anarchy \\(Phase 22, QUAL-09\\)' docs/PERFORMANCE.md == 1; DRAW_CALL_BUDGET = 50 and TRIANGLE_BUDGET = 250_000 unchanged"
        status: pass
    human_judgment: false
  - id: D4
    description: "Phase gate: remote verify-full and the frozen 20-seed acceptance run (21 of 21) at the plan's last code HEAD"
    verification:
      - kind: other
        ref: "wegolite-remote-run.sh run --rm verify-full (exit 0); run --rm test npm run test:acceptance (exit 0, 21 passed)"
        status: pass
    human_judgment: false

duration: 75min
completed: 2026-11-26
status: complete
---

# Phase 22 Plan 15: Populated anarchy against the draw budgets (QUAL-09) Summary

**The largest galaxy-0 anarchy the census found (Qudira, 96 ships, 22 hull keys) boots from a docked save through the real populator and draws 32 calls and 132,468 triangles before a kill and 35 and 132,976 after it, inside the unchanged 50-call and 250,000-triangle budgets; the phase gate is green.**

## Performance

- **Duration:** about 75 min (remote: tracer spec 13 s, three-spec run 61 s, `verify-full` 1,214 s, acceptance 89 s)
- **Started:** 2026-11-26T19:00Z (approx.)
- **Completed:** 2026-11-26T20:12Z
- **Tasks:** 2 (task 1 a tracer)
- **Files modified:** 3 (one new)

## Accomplishments

- `tests/e2e/population-anarchy.spec.ts`: boots `specSystems` of the census golden (`dockedSaveAt("Qudira")` through `writeRaw`, reload, Continue, launch, `?test=1&traffic=1&clock=manual`), asserts the system, the world epoch (1) and `sim.entities` (96) equal the golden, waits by key until every realised hull's GLB and NPC textures finished downloading, reads `probe.calls` and `probe.triangles` settled (3 equal reads, 10 frames apart) after rendered frames through `withinBudget`, then kills the `?test=1` cargo shooter with the player's lasers (the scanner loses it; 97 entities with the shooter) and reads again 60 ticks after the kill with debris (4 entities) and explosion live. It also asserts calls >= the realised key count (22) and triangles >= the realised NPC triangles (91,456). No fixed sleep, no millisecond asserted.
- The measurement (SwiftShader counts, remote test machine):

| System | Epoch | Ships | Keys | Calls before | Triangles before | Calls after | Triangles after |
| ------ | ----- | ----- | ---- | ------------ | ---------------- | ----------- | --------------- |
| Qudira (`g0-s116`) | 1 | 96 | 22 | 32 | 132,468 | 35 | 132,976 |

  32 = the scene's 10 calls plus one per key (22). The kill added 3 calls. The analytic ceiling for this system is 10 + 22 + 1 + 2 + 7 = 42. Margins to 50: 15 measured, 8 at the ceiling. Triangles: 53 % of 250,000 (the scene's 41,012 plus the ships' 91,456; the census's analytic total 131,312 is within 1 %).
- `docs/PERFORMANCE.md` "Populated anarchy (Phase 22, QUAL-09)" after the Phase 21 spike; `.planning/PROJECT.md` row "Draw-call budget and NPC model loading for the v2.4 roster" gains a dated note (budget stays 50, 21-18 stays deferred, no raise).
- Largest-ships and most-keys systems are the same one (Qudira), so the spec runs one test; it would run both if a later census differed.

## Task Commits

1. **Task 1 (tracer): boot the census system, counts read after render** - `3f6e54a0` (test)
2. **Task 2: the fight and its debris** - `83cd6fea` (test)
3. **Task 2: PERFORMANCE.md subsection and PROJECT.md note** - `2d7dee83` (docs)

**Plan metadata:** the commit of this SUMMARY.

Tracer gate: re-ran the tracer `<verify>` (remote, 1 passed) before expansion; it passed, so the fight was added.

## Phase gate (no owner checkpoint)

| Run | Command | Result |
| --- | ------- | ------ |
| Targeted browser | `run --rm e2e sh -lc "npm run build:e2e && npx playwright test tests/e2e/population-anarchy.spec.ts tests/e2e/anarchy.spec.ts tests/e2e/budget.spec.ts"` | exit 0, 61 s, snapshot `83cd6fea`, 5 passed (anarchy.spec 39 calls / 92,686 triangles before, 41 / 93,174 after; budget.spec 3 passed) |
| `verify-full` | `run --rm verify-full` | exit 0, 1,214 s, snapshot `2d7dee83`: 322 unit files passed and 1 skipped, 10,453 tests passed and 16 skipped; 168 Chromium specs passed; 2 seam specs passed. No flake, no rerun |
| Acceptance | `run --rm test npm run test:acceptance` | exit 0, 89 s, snapshot `2d7dee83`: 21 of 21 passed |
| Local | `lint`, `typecheck` | clean |

`git diff --name-only 0e8d816c..HEAD -- tests/acceptance tests/golden/world/inert-lave-epochs-1-20.json tests/golden/world/inert-lave-epoch1.json src/sim/world/populate.ts` prints nothing. `budgets.ts` is untouched (`DRAW_CALL_BUDGET = 50;`, `TRIANGLE_BUDGET = 250_000;` each once). No `src/` file changed, so no twin hash, golden or CHANGELOG entry moved.

## Deviations from Plan

**1. [Rule 3 - Blocking] Distinct hull keys are not readable from the browser probe**
- **Found during:** Task 1
- **Issue:** the plan asks the spec to assert "the number of distinct hull keys among the contacts" equals the golden. The probe's scanner contacts are only `"ship"`; no hull key is exposed, and adding a probe field would change `src/` and its probe-shape fixture, out of scope.
- **Fix:** the realised key set comes from the Node world (`censusWorld` over the production path, `tests/helpers/population-census.ts`), whose row is asserted equal to the golden's ships, keys and triangles; its key set drives the by-key asset wait. The browser side proves the keys drawn through `sim.entities == golden ships`, calls >= golden keys and triangles >= the realised NPC triangles.
- **Files modified:** `tests/e2e/population-anarchy.spec.ts`
- **Committed in:** `3f6e54a0`

**Total deviations:** 1 auto-fixed (Rule 3). **Impact:** the browser equality check on keys is indirect (calls >= keys, and 32 = 10 + 22 exactly), not a per-key read; no scope creep, no `src/` change.

## Issues Encountered

None. No budget read exceeded 50 calls or 250,000 triangles, so no stop-and-report case arose and todo `2026-11-26-npc-variant-family-instancing` was not brought back.

## Known Stubs

None.

## Threat Flags

None. T-22-24 mitigated (settled reads after rendered frames, `withinBudget` fails on 0, calls >= keys, triangles >= realised NPC triangles). T-22-25 mitigated (budget constants pinned by greps and untouched, no traffic cut). T-22-SC: no package installed.

## Next Phase Readiness

Plan 22-16 (the real-Oolite census spike) depends on this plan and blocks nothing. QUAL-09 and WORLD-08 success criterion 5 are met on the real populator.

## Self-Check: PASSED

`tests/e2e/population-anarchy.spec.ts` exists; commits `3f6e54a0`, `83cd6fea` and `2d7dee83` are ancestors of HEAD (3 commits since the plan base `0e8d816c`, measured with `git rev-list --count`); `git diff --name-only 0e8d816c..HEAD` lists only the spec, PERFORMANCE.md and PROJECT.md (before this SUMMARY); STATE.md and ROADMAP.md are untouched.

---
*Phase: 22-initial-population*
*Completed: 2026-11-26*
