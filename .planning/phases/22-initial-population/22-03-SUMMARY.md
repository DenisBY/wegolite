---
phase: 22-initial-population
plan: 03
subsystem: sim-world
status: complete
tags: [groups, pruning, snapshot-v5, fast-check, WORLD-08, D-11]

requires:
  - phase: 21-roster-state-shape-and-seams
    provides: "World.groups, GroupRecord, the strict parser and sanitizeGroups, the v5 hash line `groups:`"
provides:
  - "MAX_WORLD_GROUPS = 256, equal to MAX_ENTITIES, with the corrected reasoning"
  - "pruneEmptyGroups(world), exported from src/sim/world/world.ts and run by commitWorld"
  - "tests/sim/world/groups-prune.test.ts: the bound equality, the prune cases, the hash returning to the groupless text, the fast-check invariant"
  - "Key Decisions row 'World group bound 256 and group pruning (D-11)' in PROJECT.md"
affects: [22-10, 22-12, 23, 25, 26]

actuals:
  tokens: 10100
  tasks: 2
  commits: 2
plan_head_before: 5714fe2261898a9a774fba09ccde4646e54f0a6a
plan_head_after: 0279de17f70c6ba075a108516b2ca7eb340ce37b

key-files:
  created:
    - tests/sim/world/groups-prune.test.ts
  modified:
    - src/sim/world/limits.ts
    - src/sim/world/world.ts
    - tests/sim/world/snapshot-codec.test.ts
    - tests/sim/world/sanitize.test.ts
    - tests/sim/world/v5-cadence.test.ts
    - .planning/PROJECT.md

key-decisions:
  - "D-11 recorded as an amendment inside snapshot v5 (no WORLD_SNAPSHOT_VERSION bump, no hash, golden or pin moved)"

requirements-completed: [WORLD-08]
completed: 2026-11-26
---

# Phase 22 Plan 03: Group bound 256 and empty-group pruning Summary

`MAX_WORLD_GROUPS` is now 256, equal to the entity cap, and `commitWorld` prunes every group record that no live ship carries, so the bound can never trigger before the populator writes its first record.

## What was built

- **The bound.** `src/sim/world/limits.ts` sets `MAX_WORLD_GROUPS = 256` as a literal (the file takes no imports) with a corrected doc comment: every record has at least one live ship, so the record count cannot exceed the live dynamic entities, whose cap is `MAX_ENTITIES` (256). The file header names D-11 as the one recorded exception to "a changed value is a version bump".
- **The pruning rule.** `pruneEmptyGroups(world)` in `src/sim/world/world.ts` keeps a record while at least one live, non-dead entity carries its id as `groupId`. One pass builds the set of live group ids; `world.groups` is replaced by a filtered array only when something is removed, so an empty or unchanged list keeps its identity, no `groups:` hash line appears or moves, and the order stays strictly ascending. It returns the number removed. `commitWorld` calls it after `world.store.commit()` and still returns the removed entity ids. Both commit sites (`src/sim/world/step.ts` and `src/sim/combat/step.ts`) go through `commitWorld`, so both prune. A group whose leader died while a follower lives keeps its record with the leader id as written (leader succession is Phase 23).
- **The tests.** `tests/sim/world/groups-prune.test.ts` (10 tests): `MAX_WORLD_GROUPS === MAX_ENTITIES === 256`; both members dead removes the record; follower-only dead and leader-only dead keep it (leader id unchanged); a memberless record is pruned before the store commit; the `hashWorld` of the pruned world equals the hash of the same world built without a record, and differs while the group lives (the guard against a vacuous equality); an empty list and an unchanged list keep the array object; survivors stay ascending; and a fast-check property (`numRuns: 300`) over arbitrary sequences of group spawns (1 to 8 ships), kills of any live ship and commits shows `groups.length <= live dynamic entities`, no memberless record, strictly ascending order.
- **Codec and sanitizer rows.** `snapshot-codec.test.ts`: the "129 groups" refusal is now "257 groups" built from `MAX_WORLD_GROUPS + 1` (reason `range`), and the existing accepting row uses `MAX_WORLD_GROUPS` instead of a literal 128. `sanitize.test.ts`: the case is retitled "accepts 256 groups and keeps the lowest 256 of 257" (its body already used the constant).
- **PROJECT.md.** Key Decisions row "World group bound 256 and group pruning (D-11)" after the v5 row: the owner decision, 256 equals `MAX_ENTITIES`, the pruning rule, the paired property, why it is an amendment inside v5 (the bound is not hashed, records are serialised and none was written before Phase 22, the parser only widens), the lone-ship note (applied by 22-10, measured by 22-12), and reversibility.

## Gates

| Gate | Result |
| ---- | ------ |
| `groups-prune` + `v5-hash` + `inert-isolation` (Task 1 verify) | 99 passed |
| `groups-prune`, `snapshot-codec`, `sanitize`, `v5-hash`, `inert-isolation` (Task 2 verify) | all passed |
| `docker compose run --rm test` (full) | 8599 passed on the first full run after fixing `v5-cadence`; two failures were 30 s and 5 s timeouts under load (`tests/guards/tools-determinism.test.ts`, `tests/sim/npc/attack-dispatch.test.ts`) and both pass when rerun alone (71 tests). The load came from the parallel executor sharing the machine |
| `docker compose run --rm lint` | exit 0, eslint clean, Prettier clean (one Prettier warning on the new test file was fixed with `prettier --write`) |
| `docker compose run --rm typecheck` | exit 0 (both tsconfigs) |
| Remote frozen 20-seed run (`wegolite-remote-run.sh run --rm test npm run test:acceptance`, snapshot `0279de17`) | exit 0, **21 passed of 21** (epochs 1 to 20 plus the totals check), 84.85 s. `ACCEPTANCE-TOTALS {"stationArrivals":40,"interceptArrivals":40,"fleeArrivals":40,"avoidCollisionEntries":23,"attackTicksNearPlayer":61662,"stuckWindowsEvaluated":175,"frozenWindowsEvaluated":293}` |

`rg` acceptance checks: `MAX_WORLD_GROUPS = 256` x1, `= 128` x0, `export function pruneEmptyGroups` x1, limits.ts imports 0, `"129 groups"` x0, the Key Decisions row x1, `fc.assert` x1, `WORLD_SNAPSHOT_VERSION = 5;` x1 (no bump).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Two existing tests wrote memberless group records and stepped the world**
- **Found during:** Task 2 full `docker compose run --rm test`
- **Issue:** With pruning in `commitWorld`, a record with no live member disappears at the first step. `tests/sim/world/v5-cadence.test.ts` wrote two records (101, 102) while no ship carried group 102, then asserted both survive; `tests/sim/world/snapshot-codec.test.ts` ("a corrupted record world snapshots into text the parser reads back") wrote records 105 and 102 with no ships and stepped the world.
- **Fix:** v5-cadence writes one record (101, carried by both ships whenever the entity fields are set) and expects that one; the codec test spawns one ship per group (`groupId` 105 and 102) so the repair under test still runs on live records. Their intent (records are not rewritten by the step; an unsorted list is repaired) is unchanged. No hash, golden or pin moved.
- **Files modified:** `tests/sim/world/v5-cadence.test.ts`, `tests/sim/world/snapshot-codec.test.ts`
- **Commit:** 0279de17

**2. [Task split] The fast-check property landed in the Task 1 commit**
- The plan puts the property in Task 2. I wrote the whole `groups-prune.test.ts` in one pass and committed it with Task 1 (`50924c41`); Task 2 then added the codec, sanitizer, PROJECT.md and the two test repairs. No behaviour differs.

## Known Stubs

None.

## Threat Flags

None. The threat register entries are covered: T-22-07 by `pruneEmptyGroups` and the property, T-22-08 by the unchanged id, ascending and duplicate checks re-tested at 256 and 257.

## Self-Check: PASSED

- `src/sim/world/limits.ts`, `src/sim/world/world.ts`, `tests/sim/world/groups-prune.test.ts`: present.
- Commits `50924c41` and `0279de17` are on the branch; `WORLD_SNAPSHOT_VERSION` still 5; STATE.md and ROADMAP.md untouched.
