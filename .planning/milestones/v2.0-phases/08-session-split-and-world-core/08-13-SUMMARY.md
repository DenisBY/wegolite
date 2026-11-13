---
phase: 08-session-split-and-world-core
plan: 13
subsystem: simulation
tags: [snapshot, codec, determinism, world-core, fast-check, cross-cadence, boundary-parser]

requires:
  - phase: 08-session-split-and-world-core
    provides: 08-05 world core, limits.ts and hashWorld; 08-09 test pilot; 08-11 stepSim, stepWorld and sanitizeEntity
provides:
  - src/sim/world/snapshot.ts, WORLD_SNAPSHOT_FORMAT, WORLD_SNAPSHOT_VERSION, WorldSnapshot, EntitySnapshot, SnapshotError (23 reasons), snapshotWorld, parseWorldSnapshot, restoreWorld
  - tests/sim/world/snapshot.test.ts (the 1,000-tick live-versus-restored equality), snapshot-codec.test.ts (rejection table, field coverage, sanitizer-parser property), world-cadence.test.ts (30, 60 and 144 Hz world hashes across a launch and an arrival)
affects: [08-14, 08-15, 08-16, phase-11-saves]

actuals:
  tokens: 22264
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "a boundary parser that builds a fresh output tree while validating, reads each input property once into a local that is checked and copied, and never compares prototypes"
    - "a Record<keyof Entity, ...> table so adding an Entity field fails typecheck until the hash and codec round-trip has a mutation row for it"
    - "a fast-check property that spawns valid entities and then writes arbitrary values onto the live fields, so spawn validation cannot make it vacuous"

key-files:
  created:
    - src/sim/world/snapshot.ts
    - tests/sim/world/snapshot.test.ts
    - tests/sim/world/snapshot-codec.test.ts
    - tests/sim/world/world-cadence.test.ts
  modified: []

key-decisions:
  - "snapshotWorld writes -0 as 0 in every number leaf of the copy (JSON cannot carry -0, sanitize and canon already treat it as 0), so a live world and its restored twin snapshot to identical objects, not just identical JSON"
  - "SnapshotError carries 23 reason codes: the three snapshotWorld refusals (uncommitted, queue-not-empty, non-finite) and 20 parser reasons (not-object, unknown-key, forbidden-key, type, format, version, world-seed, next-id, entities, too-many-entities, entity-id, entity-order, magnitude, range, counter, stream, quaternion, vocabulary, string, param)"
  - "restoreWorld builds its entities from the tree parseWorldSnapshot returns, without a second copy, because that tree is fresh and private to the call; the no-aliasing rows prove it"
  - "the parser rejects a JSON null in a number slot as non-finite and a null or boolean element in a param array as param, while a scalar null param is legal, so the converse of the snapshotWorld non-finite refusal is only checked where it is decidable"

patterns-established:
  - "snapshot, parse and restore are checked three ways at every checkpoint: the hash, the exact snapshot JSON and toStrictEqual on the players, because hashWorld rounds to 1e-6"
  - "a scenario that needs the session's lifecycle before plan 08-15 carries its own copy of the bump-then-derive rule and names the test that checks the real one (plan 08-16 tick-parity)"

requirements-completed: [FOUND-12, FOUND-11]

coverage:
  - id: D1
    description: "A world restored from a JSON snapshot and the live world it came from hash identically, snapshot to bit-identical JSON and have strictly equal players at every 50th tick and after 1,000 further ticks, with test pilots, id gaps and nextId above the live count"
    requirement: FOUND-12
    verification:
      - kind: unit
        ref: "tests/sim/world/snapshot.test.ts#keeps the restored world equal to the live world for 1,000 ticks"
        status: pass
    human_judgment: false
  - id: D2
    description: "snapshotWorld emits plain deep-copied JSON-safe data and refuses an uncommitted dead entity, an undrained AI event and any non-finite number leaf (including scalar and array params) with a typed SnapshotError; restoreWorld validates through parseWorldSnapshot and shares no reference with its caller"
    requirement: FOUND-12
    verification:
      - kind: unit
        ref: "tests/sim/world/snapshot-codec.test.ts#snapshotWorld refusals and #snapshotWorld, parseWorldSnapshot and restoreWorld share no references"
        status: pass
    human_judgment: false
  - id: D3
    description: "parseWorldSnapshot is a strict boundary parser: 94 table rows with a named reason each, five non-object inputs and 27 forbidden-key rows over nine object levels, plus acceptance rows for the legal edge values"
    requirement: FOUND-12
    verification:
      - kind: unit
        ref: "tests/sim/world/snapshot-codec.test.ts#parseWorldSnapshot rejections and #parseWorldSnapshot acceptance"
        status: pass
    human_judgment: false
  - id: D4
    description: "The hash and the codec cover exactly the same fields (one mutation row per Entity field plus the four world-level fields), and every sanitized world snapshots to JSON the parser accepts with equal entity hashes, with sanitize idempotent (300 runs)"
    requirement: FOUND-11
    verification:
      - kind: unit
        ref: "tests/sim/world/snapshot-codec.test.ts#the serializer and the codec cover the same entity fields and #sanitizer and parser agree across every entity leaf"
        status: pass
    human_judgment: false
  - id: D5
    description: "The world hash is identical at 30, 60 and 144 Hz for a scripted run that launches (epoch 1 world), flies with test pilots, jumps Lave to Leesti (epoch 2 world) and flies 600 more ticks, with the old world untouched on the jump step"
    requirement: FOUND-12
    verification:
      - kind: unit
        ref: "tests/sim/world/world-cadence.test.ts#hashes the world identically at 30, 60 and 144 Hz across a launch and an arrival"
        status: pass
    human_judgment: false

duration: 35min
completed: 2026-11-13
status: complete
plan_head_before: 4ddfcfd36f2e402f602269732ee9b3308f043761
plan_head_after: 211a5433e6262af08bddbe5fa180d1c66527edd0
---

# Phase 8 Plan 13: Snapshot codec and resume equality Summary

**A strict snapshot codec (snapshotWorld, parseWorldSnapshot, restoreWorld with a 23-reason SnapshotError) proves the world is plain restorable data: a restored world and its live twin stay bit-identical for 1,000 ticks, and the world hash is identical at 30, 60 and 144 Hz across a launch and an arrival.**

## Performance

- **Duration:** about 35 min of active work (first read about 13:43Z, last task commit 14:15Z, SUMMARY after)
- **Tasks:** 3 (Task 1 tracer, Task 2 auto with tdd, Task 3 auto)
- **Files modified:** 4 (4 created, none modified)
- **Diff size:** 89,055 characters over `src` and `tests`, so `actuals.tokens` is 22,264 at chars/4

## Accomplishments

- **Task 1, the tracer (5a86c79).** `src/sim/world/snapshot.ts` exports `WORLD_SNAPSHOT_FORMAT` and `WORLD_SNAPSHOT_VERSION` (the only two `export const` values; every limit is imported from `./limits.js`, none declared or re-exported). `snapshotWorld` throws `SnapshotError` "uncommitted", "queue-not-empty" or "non-finite" (naming the entity id and field path of the first NaN or infinite number, scalar and array params included) before building any output, then deep-copies everything (`ai.params` on `Object.create(null)` in code-unit key order, `.slice()`-style array copies, `-0` written as `0`). `parseWorldSnapshot` builds a fresh tree while it validates, reads each own property exactly once, and checks every field against the shared limits. `restoreWorld` parses first, so it is not an unchecked entry point, then rebuilds the world with `createEntityStore({ nextId, entities })`, the stored world stream and `aiDropped`, and the constant `STATIC_ENTITIES`. The tracer proof (`snapshot.test.ts`): a Lave scenario with six spawns, four test pilots, ids 102 and 106 killed and committed (live ids 101, 103, 104, 105, nextId 107) and 300 warm-up ticks is snapshotted to JSON, parsed and restored, then both pairs run 1,000 ticks through `stepSim`; every 50 ticks and at the end the hashes, the exact `JSON.stringify(snapshotWorld(...))` text and the players (`toStrictEqual`) agree, with a divergence reporter that names the player line first, then the first diverging entity id. Further rows: statics recreated and never serialised, resume at tick k + 1 with no repeated or skipped tick, the next spawn gets id 107 in both worlds and never a killed id, and a `-0` coordinate does not split the runs. Mutation check: changing one restored `rng.ai` makes three of the six tests fail at tick 50 with "entity 101 diverged".
- **Task 2 (b028fb9).** `snapshot-codec.test.ts` (191 tests): 94 rejection-table rows each asserting a named reason and that `restoreWorld` refuses the same input, five non-object inputs, 27 `__proto__`/`constructor`/`prototype` rows over the nine object levels (root, entity, position, orientation, rng, nav, nav.destination, ai, ai.params) built with `JSON.parse` own keys, and a whole-text `__proto__` row proving no global pollution. Acceptance rows: a quaternion at `normSq = 1 + 5e-10`, scalar null/true/false params and a mixed array, nextId exactly `2 ** 32` with an entity of id `0xffffffff` (allocation then refused), worldSeed 0 and `0xffffffff`, the parser accepting its own null-prototype output, and a getter-backed `radius` read exactly once whose first value is the one copied. Edge rows: reversed key order, the never-spawned world equal to `hashFlight`, the empty world with `aiDropped` 5 (not never-spawned, hashes differently), the highest id killed before the snapshot, and "per-world restore" (restored world issues its stored 106, a fresh world at the same seed issues 101, no shared store). Refusal rows: uncommitted, queue-not-empty and ten non-finite poisons, each returning nothing. Anti-alias rows mutate the returned snapshot, the raw input and the parsed snapshot after restore. The `Record<keyof Entity, ...>` table has 25 mutation rows (every Entity field except `id` and `dead`, including a param type change `1` to `"1"`), the four world-level fields get the same hash-and-round-trip check with `snapshot.rng === world.rng.s`, and the 300-run fast-check property spawns 1 to 4 valid entities, writes arbitrary values (including NaN, infinities, `-0`, `1e200`, `1e13`, subnormal orientations, over-length strings and arrays, null and boolean params, and "constructor", "__proto__", "toString" and "" in the four enum leaves) onto the live fields, sanitizes, commits, hashes, snapshots, parses, restores and checks that a second sanitize repairs nothing. Mutation check: disabling sanitize's string truncation makes the property fail within six runs on an over-length `specKey`.
- **Task 3 (211a543).** `world-cadence.test.ts` replays one tick-indexed scenario (launch with an epoch-1 world from `worldSeedFor(marketSeedForSystem("g0-s7"), 1)` and three test pilots, 30 cruise steps clear of the station, the 1,800-step Lave to Leesti countdown, an arrival that applies the session's pose draw and replaces the world with `worldSeedFor(arrivalMarketSeed("g0-s55", marketSeedForSystem("g0-s7")), 2)` and three new pilots, then 600 steps) through the flight-cadence frame runner at 30, 60 and 144 Hz. Launch is at tick 1, arrival at tick 1,833 and the end at tick 2,433 at every cadence; 43 sampled world hashes agree, each over a world of three live entities, and the old world's entity hashes are unchanged by the jump step. The comment names why the scenario carries its own copy of the lifecycle rule (`createWorldLifecycle` arrives in plan 08-15) and that plan 08-16's tick-parity test checks the real one.

## Task Commits

1. **Task 1: snapshot codec and the 1,000-tick equality** - `5a86c79` (feat)
2. **Task 2: rejection table, field coverage, sanitizer-parser property** - `b028fb9` (test)
3. **Task 3: cross-cadence world hash** - `211a543` (test)

**Plan metadata:** the docs commit that carries this SUMMARY. The measured `commits: 3` is `git rev-list --count 4ddfcfd..211a543`.

## Gates

| Gate | Commit | Tree SHA | Where it ran |
| --- | --- | --- | --- |
| Task 1: targeted `snapshot.test.ts`, `typecheck`, `lint`, then `docker compose run --rm test` (130 files, 2,105 passed, 2 skipped; sim/world snapshot.ts 74.5 percent lines at that point, floors held) | `5a86c79` | `56c8c678344697003d6adf711eaa96b38ea0f104` | main tree, run on this plan's two files before the commit, content identical to the commit |
| Task 2: targeted codec test, `typecheck`, `lint`, `test` (131 files, 2,296 passed, 2 skipped; sim/world 99.05 percent lines, snapshot.ts 99.54 percent lines, 98.36 percent branches, 100 percent functions) | `b028fb9` | `be4cbf498d7a73cbd2ce047d6156321be3cdf55e` | main tree, same procedure |
| Task 3: targeted `world-cadence` plus `flight-cadence`, `typecheck`, `lint`, `test` (132 files, 2,300 passed, 2 skipped; src/sim floors held) | `211a543` | `ff3f0767308272b686f9a3d67d822975be1d3315` | main tree, same procedure |

Gate attribution: before the first gate `git status --porcelain --untracked-files=all` listed only this plan's files and the untracked review diagnostics under `.planning/`. `docker ps` for the project label was not empty: `wegolite-preview-1` (the Vite preview server, up for 42 hours before the plan started) was running. It serves the already-built `dist/` and writes neither `dist/` nor `coverage/`, and no other executor was active (plan 08-12 had not started), so the gates were run in the main tree instead of a detached worktree. `verify` and `verify-full` were not run (gate policy: src/sim logic and tests only, no browser code).

## Acceptance checks

- Task 1: `rg -c "1_000|1000"` in snapshot.test.ts is 5; `rg -n "structuredClone\(" src/sim` prints nothing; `class SnapshotError` is 1 and `"non-finite"` 5 in snapshot.ts; `JSON.stringify(snapshotWorld(` appears 2 times and `toStrictEqual` 1 time in snapshot.test.ts; `from "./limits.js"` is 1, `^export const` lists only the two snapshot constants, `SANITIZE_QUAT_TOLERANCE|MAX_SNAPSHOT_MAGNITUDE` and any redeclared limit value under src/sim/world and src/sim/ai print nothing.
- Task 2: 94 table rows plus 27 forbidden-key rows and 5 non-object rows (at least 20 required); `Record<keyof Entity,` is 1; `fc.assert|fc.property` is 2; `export const WORLD_SNAPSHOT_FORMAT|...VERSION` is 2 and `"queue-not-empty"` 3 in snapshot.ts; `"non-finite"` 10, `1e-160` 3, `worldSeed` 12, `fc.(constant|constantFrom|boolean)(` 11 and `per-world restore` 1 in the codec test.
- Task 3: `30, 60, 144` appears 5 times and `hyperspaceJumped` 4 times in world-cadence.test.ts; both cadence files and lint pass.

## TDD note (Task 2)

Task 2 is TDD over the parser Task 1 built (the plan keeps them together). The rejection table, acceptance rows and property were written against the rules and passed on the first run because Task 1's parser already followed every must-have, so there is no separate failing-test commit. Their sensitivity was checked by mutation instead (a changed restore stream and a disabled sanitize truncation both fail the suite) and each mutation was reverted before committing.

## Decisions Made

See `key-decisions` above. `-0` normalisation in the snapshot copy is the one choice the plan left open; it follows research assumption A4 (sanitize normalises `-0`) and keeps the emitted object, not only its JSON, equal across a round trip.

## Deviations from Plan

None - plan executed exactly as written. The plan's reason codes were left to the executor; the 23 listed in `key-decisions` name every rejection with its own code. The tracer feedback gate ran in auto mode: Task 1's `<verify>` (targeted test plus typecheck) was re-run end to end before Tasks 2 and 3 (`Tracer verified end-to-end - expanding`).

**Total deviations:** 0.

## Issues Encountered

- `tools/oolite-ingest/convert/textures.test.ts` failed once in the first full run of Task 3 (the known flake of deferred-items D-2 and the brief); the immediate rerun passed and the later full runs passed.
- Lint caught four unnecessary `as readonly string[]` assertions on the vocabulary tuples in snapshot.ts and one unnecessary cast in the codec test, and typecheck an `exactOptionalPropertyTypes` mismatch on `SpawnInit["ai"]` in snapshot.test.ts and a module-level `const` narrowing that does not reach a class method in world-cadence.test.ts; each was fixed before its task commit.

## Known Stubs

None.

## Threat Flags

None. `snapshotWorld`, `parseWorldSnapshot` and `restoreWorld` are the trust boundary the plan's threat model already names (T-08-24, T-08-25, T-08-55, T-08-56); no endpoint, auth path or file access was added.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 08-14 to 08-16 can import `snapshotWorld`, `parseWorldSnapshot` and `restoreWorld` from `src/sim/world/snapshot.ts`; Phase 11 (SAVE-07, SAVE-08) reuses the same parser and the limits from `src/sim/world/limits.ts`, and any field or limit change bumps `WORLD_SNAPSHOT_VERSION`.
- FOUND-11 stays open (plan 08-15 also declares it); FOUND-12 is ready after this plan.

## Self-Check: PASSED

- Created files exist: `src/sim/world/snapshot.ts`, `tests/sim/world/snapshot.test.ts`, `tests/sim/world/snapshot-codec.test.ts`, `tests/sim/world/world-cadence.test.ts`.
- Commits `5a86c79`, `b028fb9` and `211a543` are ancestors of HEAD.
