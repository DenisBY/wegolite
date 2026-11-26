---
phase: 21-roster-state-shape-and-seams
plan: 06
subsystem: sim-world-state
tags: [snapshot, hash, pristine-omit, field-set, sanitize, cadence, FOUND-20]
requires:
  - phase: 21-03
    provides: snapshot v5, the per-entity field set and the V5_ORDER segment order this plan sits beside
provides:
  - World.station, World.groups, World.populator (pristine-omit hash lines groups:, repop:, station: and optional snapshot keys)
  - PlayerCombatState.standing (legalStatus, kills) with the |std: suffix of the combat line
  - total sanitizers for every new record (fast-check properties)
  - the 30/60/144 Hz replay of the whole v5 field set
affects: [21-07, 21-12, phase-22, phase-24, phase-25, phase-26]
tech-stack:
  added: []
  patterns: [optional world snapshot keys omitted when pristine, strict ascending-unique id lists, repair-count sanitizers over unknown input, literal-text strip-and-rehash]
key-files:
  created:
    - tests/sim/world/v5-cadence.test.ts
  modified:
    - src/sim/world/limits.ts
    - src/sim/world/world.ts
    - src/sim/world/serialize.ts
    - src/sim/world/snapshot.ts
    - src/sim/world/sanitize.ts
    - src/sim/combat/state.ts
    - tests/sim/world/v5-hash.test.ts
    - tests/sim/world/snapshot-codec.test.ts
    - tests/sim/world/sanitize.test.ts
    - tests/sim/combat/state.test.ts
key-decisions:
  - "Station marks hold PLAYER_ID (100) or a dynamic id (the player and the ships are the offenders a station can mark); group ids and leaders are dynamic ids (101 up), a leader equal to its id is valid"
  - "Sanitizers return the repaired-field count (a list counts as one field); an out-of-bound leaf becomes the record's pristine value, as the v5 entity fields do, never a clamp"
  - "hashWorld repairs the three records itself (beside sanitizeBuoyStates); stepWorld's repairWorldFields is deliberately untouched, because no production path writes the records yet"
status: complete
commits: 3
plan_head_before: 5b40eb349086b179e008c6f7027f59a6bfd8f54e
plan_head_after: 0d0a8a32ae875752ed3c5b0c05481ae036d56716
actuals:
  tokens: 22000
  tasks: 2
  commits: 3
requirements-completed: [FOUND-20]
---

# Phase 21 Plan 06: The world half of the v5 field set Summary

**World.station, World.groups and World.populator plus the player's standing land inside snapshot v5 as optional, pristine-omit records with their hash lines, strict parser rows, total sanitizers and a 30/60/144 Hz replay; nothing plays differently and the frozen run is 21 of 21.**

## Tracer and task results

| Task | Commit | What it proved |
| ---- | ------ | -------------- |
| 1 (tracer) and 2, standing slice | `77bddc42` | `PlayerCombatState.standing`, `|std:` suffix, `sanitizeCombat` repair, `dockReset`/`launchReset` leave it alone, the bounds and constants in `limits.ts` |
| 1 (tracer) and 2, world slice | `ca3722ff` | `World.station` (the tracer shape: enum, counter, list) and the group and populator records through type, sanitize, hash line, optional snapshot key, strict parser and strip-and-rehash against literal texts |
| 2, cadence | `0d0a8a32` | `tests/sim/world/v5-cadence.test.ts`: two ships with every v5 entity field, every world record and a standing, 600 ticks, equal hashes at 30, 60 and 144 Hz |

The tracer gate (auto mode): the targeted run of `v5-hash`, `snapshot-codec`, `sanitize`, `inert-isolation`, `hash` and `state` tests (1,200 passed) and typecheck went end to end before the cadence test was added.

## The world and standing field table

| Field | Shape | Bound constant | Pristine | Hash text |
| ----- | ----- | -------------- | -------- | --------- |
| `World.station.alert` | integer 0..3 (Oolite `ALERT_CONDITION_*`, `ShipEntity.h:169-172`) | `STATION_ALERT_DOCKED` 0 .. `STATION_ALERT_RED` 3 | 1 (`STATION_ALERT_GREEN`) | `station:<alert>,<launched>,<marks joined by "/">` |
| `World.station.launched` | integer | `MAX_STATION_LAUNCHED` 255 | 0 | same line |
| `World.station.marks` | ascending unique ids from `PLAYER_ID` 100 | `MAX_STATION_MARKS` 32 | `[]` | same line (an empty list ends the text at the comma: `station:3,0,`) |
| `World.groups` | `{ id, leader }`, ascending unique dynamic ids | `MAX_WORLD_GROUPS` 128 | `[]` | `groups:<id>,<leader>;<id>,<leader>` |
| `World.populator` | `{ nextTick, rolls }`, each uint32 | `MAX_UINT32` | 0 and 0 | `repop:<nextTick>,<rolls>` |
| `standing.legalStatus` | integer | `MAX_BOUNTY` 65535 | 0 | combat line suffix `|std:<legalStatus>,<kills>` |
| `standing.kills` | integer | `MAX_KILL_TALLY` = `MAX_UINT32` | 0 | same suffix |

Print order in `hashWorld`: static-health line, `buoys:`, then `groups:`, `repop:`, `station:`, then the combat line (with its `|std:` suffix). Each prints only when not pristine. The snapshot keys are `station`, `groups` and `populator` (root allow-list extended), each written only when not pristine. `WORLD_SNAPSHOT_VERSION` is still 5.

## Strip-and-rehash, totality and cadence evidence

- `tests/sim/world/v5-hash.test.ts` (49 tests now): expected texts are literals (the captured pristine section plus the literal line), never computed with the serializers. Each of eight record cases prints exactly its one line; resetting the record reproduces the pristine hash; all three print in the fixed order whatever the assignment order; the lines sit after `buoys:` and before the combat line; a malformed list (unsorted, repeated) hashes equal to its repaired form; the standing prints only as the `|std:` suffix and deleting it reproduces the hash. The existing epoch 1 pin `c5949d60` test passes unchanged.
- `tests/sim/world/snapshot-codec.test.ts`: 36 rejection rows (alert 4, -1, 1.5, string and NaN; launched 256, -1, 0.5; 33 marks, a repeat, descending, below 100, above uint32, a fraction, a string element; 129 groups, a repeated id, descending ids, a leader below 101, a fractional and a string leader; populator -1, 2^32, 1.5; extra keys, null records, own `__proto__`), each naming the leaf; the boundaries (alert 0 and 3, launched 255, 32 marks, 128 groups, uint32 maxima, a founding leader) are accepted; pristine records write no key; round trips give an equal hash, equal text and no shared reference; a missing key restores the pristine record.
- `tests/sim/world/sanitize.test.ts`: tables for `sanitizeStation`, `sanitizeGroups`, `sanitizePopulator` (invalid marks dropped with valid neighbours kept, sorted, first of a repeated group kept, extra record keys removed, oversized lists cut to the lowest ids, counts per repaired field) and the fast-check totality property (400 runs): over malformed station, group and populator values the sanitizers never throw, the snapshot writer and strict parser accept the result, a second pass repairs nothing and changes no bit, and `hashWorld` never throws and agrees with the hash of the repaired value.
- `tests/sim/combat/state.test.ts` (50 tests): standing pristine and fresh per state, a single-field edit of either leaf is not pristine, dock and launch leave it equal, per-leaf repair counts, `-0` as 0, and a 300-run property over malformed standing values (never throws, valid, idempotent, serializable).
- `tests/sim/world/v5-cadence.test.ts` (3 tests): two ships, the first with every per-entity v5 field and per-facing temperatures, the second with a subset; the three world records and a standing set; 600 ticks at 30, 60 and 144 Hz frame cadence; the hashes at ticks 120, 300 and 600 (and every 60) are equal across cadences; the same scenario with the records at rest, or with the entity fields at rest, hashes differently (non-vacuous); and the records, the standing and the entity fields are still as set at the end.

## Gate results

| Gate | Command | Result |
| ---- | ------- | ------ |
| Targeted | `docker compose run --rm test npx vitest run` over `v5-hash`, `v5-cadence`, `snapshot-codec`, `sanitize`, `state`, `inert-isolation`, `hash` | all pass (1,200 passed, 1 skipped, before the cadence file; the cadence file 3 of 3) |
| Typecheck | `docker compose run --rm typecheck` | exit 0, no `error TS` line |
| Lint | `docker compose run --rm lint` (eslint then `prettier --check .`) | 0 problems, all files use Prettier style |
| Full unit run | `docker compose run --rm test` | 285 of 292 files, 8,078 tests passed, 7 failed, all `Test timed out in 5000ms` with three test containers on the machine at once (the run took 847 s); see below |
| Full unit run with retries | `docker compose run --rm test npx vitest run --retry=2` | 291 of 292 files, 8,084 passed, 1 failed (`tools/oolite-ingest/convert/textures.test.ts`, a 5 s timeout, unrelated to this plan) |
| The two named timeouts alone | `npx vitest run tests/sim/npc/hot-weapon.test.ts tools/oolite-ingest/convert/textures.test.ts` | 2 of 2 files, 40 of 40 tests passed (textures 4.3 s of its 5 s limit) |
| Pins | `inert-isolation.test.ts`, `flight-hash-pins.test.ts`, `hash.test.ts` | pass unchanged; `git diff --name-only 5b40eb34..HEAD -- tests/golden` is empty |

No `verify` was run, by the plan's gate policy (pure `src/sim`). No timeout was changed. The seven timeouts are load: they are not in files this plan touches, and the ones re-run alone pass; the coverage threshold line did not print in the retry run because `npx vitest run` skips the coverage option, so the coverage threshold of the bare `docker compose run --rm test` is the one open point (its failures were only the timeouts above; no threshold error line appeared).

## Remote frozen run

`~/.claude/scripts/wegolite-remote-run.sh run --rm test npm run test:acceptance` on the remote test machine at snapshot `0d0a8a32` (the last code commit; this plan changes `src/sim/world/**`): exit 0, **21 of 21 passed** (20 epochs plus the run-minimums test), 84.7 s. Every epoch reports `stuck 0`, `frozen 0`, `frustration 0`, `stationSphere 0`, `hullCrossingsUnexcused 0`, `repairs 0`, `aiFaulted 0`, `aiDropped 0`, `hashFailures 0`. Run totals: `stationArrivals` 40, `interceptArrivals` 40, `fleeArrivals` 40, `avoidCollisionEntries` 23, `attackTicksNearPlayer` 61,662, `stuckWindowsEvaluated` 175, `frozenWindowsEvaluated` 293, identical to the 21-03 run. Thresholds and detectors untouched (no `Detector-change-approved-by-owner` trailer needed).

## Deviations from Plan

### Auto-fixed Issues

None of Rules 1 to 3 fired in the code.

### Process deviations

**1. Commit split follows the code slices, not the two plan tasks**
- **Found during:** commit time
- **Issue:** the tracer (Task 1) and Task 2 share every source file (`limits.ts`, `world.ts`, `serialize.ts`, `snapshot.ts`, `sanitize.ts`), and the three world records were written in one pass; a per-task source split would have meant committing untested code or artificial stubs.
- **Fix:** three commits along real boundaries (standing and bounds; the three world records with their tests; the cadence test). The tracer gate was still honoured: the targeted run and typecheck passed end to end before the cadence work.
- **Commits:** `77bddc42`, `ca3722ff`, `0d0a8a32`

**2. `step.ts` not touched**
- The plan's file list excludes `src/sim/world/step.ts`, so `repairWorldFields` still repairs only the older records; the three new records are repaired by `hashWorld` (the key link of the plan) and by `snapshotWorld` refusing non-finite leaves. No production path writes them, and the totality property covers `hashWorld`. When Phase 22, 25 or 26 starts writing the records, they should join `repairWorldFields`.

**3. Test-run timeouts**
- see Gate results: seven 5 s timeouts under load in unrelated files, none changed, two re-run alone green, one (textures) still near its limit under load.

### Hand-offs followed

- V5_ORDER: this plan adds no per-entity segment; the world lines follow the entity section and `buoys:` as specified, so the order `bty, role, grp, ck, pod, fuel, inj, sys, wpf, wty, fine` is untouched.

## Known Stubs

None. The records are at rest by design (Phases 22, 25 and 26 write them) and every one is covered by a pristine-omit hash, so nothing renders a placeholder.

## Threat Flags

None beyond the plan's threat model: the new parser surface (T-21-12, T-21-13) is the strict allow-list, ascending-unique and bound checks above; nothing else at a trust boundary changed.

## Self-Check: PASSED

- `src/sim/world/limits.ts`, `world.ts`, `serialize.ts`, `snapshot.ts`, `sanitize.ts`, `src/sim/combat/state.ts`, `tests/sim/world/v5-cadence.test.ts` all present in the worktree.
- Commits `77bddc42`, `ca3722ff`, `0d0a8a32` are ancestors of HEAD.
- `rg -c "MAX_STATION_MARKS = 32" src/sim/world/limits.ts` is 1; `WORLD_SNAPSHOT_VERSION = 5;` is still present once in `snapshot.ts`; `sanitizeStation` appears in `sanitize.test.ts`, `standing` in `state.ts` at least 3 times, `groups:` and `repop:` in `serialize.ts`, and `fc.assert` in `state.test.ts`.
