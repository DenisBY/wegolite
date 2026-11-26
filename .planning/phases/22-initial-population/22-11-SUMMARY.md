---
phase: 22-initial-population
plan: 11
subsystem: sim-world
tags: [populator, cargo-kind, pod-kind-todo, fidelity, witchpoint, entity-cap, debris-reserve, WORLD-08]

requires:
  - phase: 22-initial-population
    provides: "plan 22-10: populateSystemWorld, WITCHPOINT, POPULATION_ENTITY_LIMIT 152, POPULATION_DEBRIS_RESERVE 104, W = 21"
  - phase: 22-initial-population
    provides: "plans 22-07 to 22-09: the builders that set each ship's cargoKind"
provides:
  - "tests/sim/world/population/cargo-kind.test.ts: the runtime check of the folded pod-kind todo over sample worlds"
  - "the todo 2026-11-25-pod-kind-live-populator closed (todos/completed, resolution note, courier correction)"
  - "FIDELITY E-210 (WITCHPOINT, faithful) and E-211 (the cap rule, divergence); E-34, E-78, E-197, E-198 and E-206 rewritten"
  - "PROJECT.md Key Decisions row: Population entity cap and debris reserve (D-05, D-06)"
affects: [22-12, 22-13, 22-14]

plan_head_before: 3c6ef07fc23422243c60a79575766b0aa02ace49
plan_head_after: eb36b61b (task commits a34cff39 and eb36b61b; the SUMMARY commit follows)

actuals:
  tokens: 6500
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "The expected cargo kind per builder is written as a table in the test from Oolite's setCargoType calls, never read from the port"

key-files:
  created:
    - tests/sim/world/population/cargo-kind.test.ts
  modified:
    - tests/guards/pod-kind-fallback.test.ts
    - .planning/todos/completed/2026-11-25-pod-kind-live-populator.md
    - FIDELITY.md
    - .planning/PROJECT.md

key-decisions:
  - "The folded pod-kind todo is closed by a runtime check over Lave (20 seeds), the largest anarchy of the fixtures, Oresrati and every fixture system at epochs 1 to 3; the guard's allow-list is unchanged"
  - "The todo's 'couriers get ILLEGAL_GOODS' was a transcription error: only _addSmuggler sets ILLEGAL_GOODS (:1557); no divergence, no FIDELITY row"
  - "The cap rule is FIDELITY E-211 (divergence) citing Universe.m:1760-1764, the five-line tail of the populate loop (the loop heads would need 34 lines); the Key Decisions row records W = 21, reserve 104, limit 152"
  - "Escorts keep the identity orientation (Entity.m:72) and take three jitter draws, and a leaderless addGroup group's record names its first ship as id and leader: both recorded in E-206 and in the Key Decisions row"

requirements-completed: [WORLD-08]

duration: 45min
completed: 2026-11-26
status: complete
---

# Phase 22 Plan 11: Pod-kind runtime check and the spawn-side FIDELITY records Summary

**A runtime test populates the 35 fixture systems through the production spawn path and proves no live ship carries cargo with kind 0 and each kind is its builder's `setCargoType`; the folded todo is closed, and WITCHPOINT, the whole-group cap rule (W = 21, reserve 104, limit 152) and the inert-only role fallback are recorded in FIDELITY and Key Decisions.**

## Performance

- **Duration:** about 45 min
- **Tasks:** 2 (2 commits)
- **Files:** 1 created, 4 modified, 1 moved (the todo)

## Accomplishments

- **The pod-kind runtime check (Task 1, tracer).** `cargo-kind.test.ts` populates worlds with `populateSystemWorld` and compares every placed entity with the plan's ship and its builder. The expected kinds are Oolite's `setCargoType` calls written out as a table (pin `7437f22`, checked by line): arriving freighter and courier `scarce` (`:1448`, `:1492`, `:1499`, `:1514`, `:1522`), a medical hull's freighter `medical`, an offender freighter switched to the opportunist AI and every independent pirate and pack leader `pirate` (`:1713`, `:1864`), the smuggler `contraband` (`:1557`), every other ship and every engine escort and pack assistant no cargo. Sample worlds: Lave over 20 seeds; the largest anarchy of the fixtures (picked by planned ship count over epochs 1 to 3); Oresrati (`g7-s162`, one station patrol, no cargo); every fixture system (35 distinct systems in the 66 fixtures, the seed1 and seed2 fixtures of a system counted once) at epochs 1 to 3, with each of `scarce`, `pirate`, `contraband` and `unset` seen on some ship; and a medical-only catalogue (the Moray Medical Boat) that pins `medical`, which the full catalogue reaches through one hull. Mutation check: storing kind 0 for `contraband` in `spawn.ts` fails four of the five cases; the file was restored and is unchanged in the commit.
- **The todo closed.** `git mv` to `.planning/todos/completed/` with `resolved: 2026-11-26`, a resolution note (plans 22-07 to 22-11, the test, the unchanged allow-list) and the courier correction in the words "transcription error" with `:1482-1502`, `:1505-1525`, the `setCargoType` lines `:1492`, `:1499`, `:1514`, `:1522` and `:1557`. The original text is untouched. Only `PHASE_22_TODO` moved in `tests/guards/pod-kind-fallback.test.ts`; `INERT_PATH_FILES` is still `["src/sim/world/populate.ts"]`.
- **FIDELITY (Task 2).** New excerpt ids after E-209:
  - **E-210** `Universe.m:1784-1788`, `WITCHPOINT`, faithful; E-34's mechanic now names `WITCHPOINT` and says it takes no loop.
  - **E-211** `Universe.m:1760-1764` (the callback and the loop closers: the only per-group action, no entity check), divergence: whole groups, skip and continue in engine order, W = 21, reserve 104, limit 152, the group-record check, the trial spawn, "Oolite has no such cap", and that plan 22-12's census records whether it ever triggers and amends the row. The loop heads (`:1719`, `:1729`) sit outside the excerpt, which would span 34 lines; the row says so.
  - **E-197** and **E-78** now say the role-family fallback of `resolvePodCargoKind` serves the inert path only and the live populator sets every kind at spawn.
  - **E-206** gained the two spawn-side notes plan 22-10 flagged (identity orientation and three jitter draws for escorts; a leaderless `addGroup` group's record names its first ship).
- **Key Decisions.** The row "Population entity cap and debris reserve (D-05, D-06)" in `.planning/PROJECT.md`: the rule, the measured W and reserve arithmetic, the limit, the checks, Oolite has no cap, the two spawn-side notes, Reversibility: reversible.

## Task Commits

1. **Task 1 (tracer): the pod-kind runtime check, the todo closed** - `a34cff39` (test)
2. **Task 2: the FIDELITY rows and the D-05/D-06 Key Decisions row** - `eb36b61b` (docs)

Tracer gate: the targeted command (`cargo-kind`, `pod-kind-fallback`, `inert-isolation`) passed with Lave and then every sample world before the todo was moved; `end-of-phase` mode, automated `<verify>` only, so expansion followed.

## Deviations from Plan

**1. [Rule 1 - stale text] E-198's sentence "No ship reaches the kind before Phase 22 ports the populator's medical branch" was no longer true after plan 22-07** and sits next to the rows the plan rewrites; it now names the medical branch and the two tests that pin the fill and the kind. Commit `eb36b61b`.

**2. [Plan detail] The medical case is pinned by a medical-only catalogue**, because the committed catalogue has one medical hull and a freighter pick rarely reaches it in the sample worlds. The sweep over the full catalogue still checks that any medical hull's freighter is `medical`.

**3. [Plan detail] E-211 cites `Universe.m:1760-1764`**, not a wider range of `1707-1767`: the plan asks for the tightest range that shows the uncapped loop within the 20-line excerpt cap, and the loop heads cannot be included.

**Total deviations:** 1 auto-fixed text correction, 2 plan details. **Impact:** none on the outcome.

## Gates

- Targeted (Docker, local): `cargo-kind`, `pod-kind-fallback`, `inert-isolation`, `fidelity` (without `OOLITE_SRC`), the whole `tests/sim/world/population` directory and `npc-missiles-tripwire`: 505 passed, 1 skipped (the verbatim case, which the next line runs).
- **FIDELITY verbatim case with `OOLITE_SRC=/tmp/oolite-7437f22`** (`git archive 7437f22 src Resources`): 10 of 10 passed, the excerpt case ran (not skipped), E-210 and E-211 reproduce at the pin.
- `docker compose run --rm lint`: clean (eslint and Prettier; Prettier reformatted only the new test file before the commit). `docker compose run --rm typecheck`: clean.
- **Remote frozen 20-seed run (QUAL-12):** `~/.claude/scripts/wegolite-remote-run.sh run --rm test npm run test:acceptance` at snapshot `eb36b61b`: **exit 0, 88 s, 21 passed of 21**; `ACCEPTANCE-TOTALS {"stationArrivals":40,"interceptArrivals":40,"fleeArrivals":40,"avoidCollisionEntries":23,"attackTicksNearPlayer":61662,"stuckWindowsEvaluated":175,"frozenWindowsEvaluated":293}`, identical to the totals of plans 22-03 and 22-10 (this plan changes no `src/` file). Thresholds and detectors untouched.
- **Full Vitest suite (remote, with coverage):** `~/.claude/scripts/wegolite-remote-run.sh run --rm test` at snapshot `eb36b61b`: **exit 0, 303 s, 319 test files passed and 1 skipped, 10,404 tests passed and 15 skipped**; coverage thresholds held.
- Acceptance greps: `rg -c "^### E-[0-9]+ src/Core/Universe.m:1784-1788$" FIDELITY.md` = 1 (E-210); `rg -c "Population entity cap and debris reserve \(D-05, D-06\)" .planning/PROJECT.md` = 1; the guard's `INERT_PATH_FILES` line count 1; `git diff --name-only 67d12406..HEAD -- src/sim/world/populate.ts tests/golden/world` prints nothing.

## Threat Flags

None. T-22-32 (todo closed while a builder context falls back) is mitigated: the runtime check passes over every sample world before the move, and the guard's allow-list is unchanged. T-22-SC: no package installed.

## Known Stubs

None. No `src/` file changed, so no CHANGELOG.md entry (nothing user-visible).

## Notes for the next plans

- **22-12:** the census reads `skippedGroups` per committed system and amends E-211 and the Key Decisions row with whether the cap ever triggers; if a system reaches 152 it lowers `POPULATION_RESERVE_KILLS` toward 1 (below one kill's worth, the owner decides). `cargo-kind.test.ts` already sweeps the 35 fixture systems at epochs 1 to 3 with no skipped group.
- **22-13 and 22-14:** the live switch inherits the cargo-kind check through `populateSystemWorld`; the inert path and its goldens are untouched.

## Self-Check: PASSED

`tests/sim/world/population/cargo-kind.test.ts` and `.planning/todos/completed/2026-11-25-pod-kind-live-populator.md` exist and the pending path is gone; commits `a34cff39` and `eb36b61b` are ancestors of HEAD (2 commits since `3c6ef07f`, measured with `git rev-list --count`); `git diff --name-only 3c6ef07f..HEAD` lists the five files above (before this SUMMARY), so `populate.ts`, `tests/golden/`, `tests/oracles/`, STATE.md and ROADMAP.md are untouched.
