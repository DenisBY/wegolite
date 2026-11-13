---
phase: 08-session-split-and-world-core
plan: 05
subsystem: simulation
tags: [entity-store, world, ids, determinism, hash, spawn-validation, fast-check]

requires:
  - phase: 08-session-split-and-world-core
    provides: plan 08-02 rng.ts (RngState, forkSeed, worldSeedFor, rngNext), the recorded flights helper and the flight hash pins; plan 08-03 determinism lint bans and the entity-id scope guard
provides:
  - src/sim/world/ids.ts (fixed id table, closed Oolite vocabularies BEHAVIOUR_IDS, SCAN_CLASSES, ENTITY_KINDS, BODY_KINDS)
  - src/sim/world/limits.ts (the single owner of the seven shared serialised-domain limits)
  - src/sim/ai/types.ts (AI_KEYS, ParamValue domain, AiComponent)
  - src/sim/world/entity.ts, store.ts, world.ts (Entity, StaticEntity, ascending binary-search EntityStore, World, createWorld, spawnEntity, killEntity, commitWorld, isNeverSpawned, liveEntityCount, staticEntity)
  - src/sim/world/serialize.ts (serializeEntity, serializeWorldSection, entityHashes, hashWorld)
  - four PROJECT.md Key Decisions rows (fixed ids, monotonic ids, static entities, per-world id uniqueness)
affects: [08-06, 08-07, 08-09, 08-11, 08-13, 08-15, 08-16]

plan_head_before: 0e25a274dce3a085aa3b8a399ba57c9e54470367
plan_head_after: 039df6209ef342243ef6a58d2a96defd33071f1c

actuals:
  tokens: 36300
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "one limits module owns every shared serialised-domain constant; consumers import and never redefine"
    - "world hash = flight hash while isNeverSpawned (one exported predicate), section appended afterwards"
    - "injective hash line: ASCII-escaped JSON string leaves plus type-tagged params"
    - "store lookup is a binary search over a strictly ascending array; no Map or Set"
    - "per-world id counter lives in the store object; no module-level mutable binding"

key-files:
  created:
    - src/sim/world/ids.ts
    - src/sim/world/limits.ts
    - src/sim/ai/types.ts
    - src/sim/world/entity.ts
    - src/sim/world/store.ts
    - src/sim/world/world.ts
    - src/sim/world/serialize.ts
    - tests/sim/world/hash.test.ts
    - tests/sim/world/store.test.ts
  modified:
    - .planning/PROJECT.md

key-decisions:
  - "Fixed entity ids 0, 1-5 statics, 6-99 reserved, 100 player, dynamic from 101 (Key Decisions row a)"
  - "Monotonic entity ids from a stored counter, binary-search lookup instead of a Map (row b)"
  - "Static bodies are frozen layout references in world.statics, never hashed or stored dynamically (row c)"
  - "Entity id uniqueness is per world; nextId restarts at 101 in every new world (row d, CONTEXT D-06 amended 2026-11-12)"
  - "createEntityStore(init) throws a RangeError for a restored list that is not strictly ascending or not below nextId (not in the plan; protects the binary search and the id rule for the plan 08-13 restore path)"

patterns-established:
  - "Pattern: spawn validates against the shared domain before allocating, so a refusal never advances nextId"
  - "Pattern: store.allocate counts non-dead entities (not raw live.length) so kill frees a slot at once"

requirements-completed: [FOUND-11, FOUND-12]

coverage:
  - id: D1
    description: "An NPC-free world (absent, createWorld(1234), and worlds from worldSeedFor epochs 0, 1 and 2) hashes exactly as hashFlight and as the pinned golden on every sample of the three recorded flights"
    requirement: FOUND-12
    verification:
      - kind: unit
        ref: "tests/sim/world/hash.test.ts#equals hashFlight and the pinned golden on every recorded sample"
        status: pass
    human_judgment: false
  - id: D2
    description: "Dynamic ids are monotonic within a world, live is strictly ascending, get skips dead and static ids, kill/commit remove in place, and the 256 cap counts non-dead entities with a refused spawn leaving nextId unchanged"
    requirement: FOUND-11
    verification:
      - kind: unit
        ref: "tests/sim/world/store.test.ts#ids, order, kill and commit"
        status: pass
      - kind: unit
        ref: "tests/sim/world/store.test.ts#property: ids over spawn, kill and commit"
        status: pass
    human_judgment: false
  - id: D3
    description: "spawnEntity refuses every init outside the shared serialised domain (limits, enum leaves, non-unit quaternions, AI timers and params) without allocating, and createWorld throws a RangeError for a worldSeed outside 0..0xffffffff"
    requirement: FOUND-11
    verification:
      - kind: unit
        ref: "tests/sim/world/store.test.ts#spawn validation (shared serialised domain)"
        status: pass
      - kind: unit
        ref: "tests/sim/world/store.test.ts#createWorld seed and the shared limits"
        status: pass
    human_judgment: false
  - id: D4
    description: "The entity hash line is injective (1 vs \"1\", true vs \"true\", null vs \"null\", a forged line in specKey, specKeys sharing a low byte) and the five static entities are frozen layout references that never reach the hash"
    requirement: FOUND-11
    verification:
      - kind: unit
        ref: "tests/sim/world/hash.test.ts#entity hash line injectivity"
        status: pass
      - kind: unit
        ref: "tests/sim/world/hash.test.ts#fixed ids and static entities (D-06, D-07)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Per-world id scope: a fresh world restarts at 101 whatever happened elsewhere, same-seed worlds issue the same sequence, worlds of different seeds that both hold id 101 hash differently, and no store, world or serialize module holds a module-level mutable binding"
    requirement: FOUND-11
    verification:
      - kind: unit
        ref: "tests/sim/world/store.test.ts#per-world id scope (CONTEXT D-06 as amended 2026-11-12)"
        status: pass
      - kind: unit
        ref: "tests/sim/world/store.test.ts#per-world hash identity (RESEARCH Pattern 5)"
        status: pass
    human_judgment: false
  - id: D6
    description: "BEHAVIOUR_IDS (39) and SCAN_CLASSES (16) equal the ENTRY names of the Oolite OOBehaviour.tbl and OOScanClass.tbl in table order"
    requirement: FOUND-11
    verification:
      - kind: unit
        ref: "tests/sim/world/hash.test.ts#equals the ENTRY names of the Oolite tables in table order (OOLITE_SRC)"
        status: pass
    human_judgment: false

duration: 15min
completed: 2026-11-13
status: complete
---

# Phase 8 Plan 05: World Core Foundation Summary

**A pure-src/sim multi-entity world: fixed ids with per-world monotonic dynamic ids from 101, five frozen layout-reference statics, a binary-search entity store, spawn validation against one shared limits module, forked per-entity streams, and a composed world hash that equals the v1 flight hash until the first spawn.**

## Performance

- **Duration:** about 15 min
- **Started:** about 2026-11-13T09:41Z (not recorded to the second)
- **Completed:** 2026-11-13T09:57Z
- **Tasks:** 2 (Task 1 tracer, Task 2 TDD)
- **Files:** 9 created, 1 modified

## Accomplishments

- Task 1 (tracer): ids, shared limits, the AI param domain, entity and static records, the store, the world with `spawnEntity`, and the serializer, wired end to end. The tracer verify (hash and flight-pin test files, the OOLITE_SRC vocabulary case, typecheck) passed before Task 2 started, so expansion went ahead (`Tracer verified end-to-end -- expanding`).
- Task 2: 90 store tests (every spawn refusal row, the cap and uint32 ceiling, fork isolation, a 200-run fast-check property, per-world id scope and hash identity) and the four PROJECT.md Key Decisions rows.
- No file outside `src/sim/world`, `src/sim/ai`, `tests/sim/world` and `.planning/PROJECT.md` changed; no `src/app` file was touched (D-14).

## Task Commits

1. **Task 1: world core tracer** - `b5b834842f647aea82a74ffb6c0b34df6cac2c3e` (feat), tree `22a314441a33f59fd11c81b6e230ac0b934fd3e6`
2. **Task 2: store, spawn and stream invariants; Key Decisions rows** - `039df6209ef342243ef6a58d2a96defd33071f1c` (test), tree `f4a6e99db9ca85e7f06d5dad110ca63d99428c59`

**Plan metadata:** the docs commit that carries this SUMMARY, STATE.md and ROADMAP.md.

## Files Created/Modified

- `src/sim/world/ids.ts` - EntityId, fixed ids, MAX_ENTITIES, STATIC_BODY_IDS, BEHAVIOUR_IDS (39), SCAN_CLASSES (16), ENTITY_KINDS, BODY_KINDS; the per-world id scope documented in the header
- `src/sim/world/limits.ts` - MAX_ENTITY_MAGNITUDE, MAX_SNAPSHOT_STRING_LENGTH, MAX_SNAPSHOT_PARAM_LENGTH, MAX_AI_PARAMS_KEYS, MAX_UINT32, QUAT_UNIT_TOLERANCE, MIN_QUAT_NORM_SQ (no imports)
- `src/sim/ai/types.ts` - AI_KEYS, AiKey, ParamValue (documented domain), AiComponent
- `src/sim/world/entity.ts` - Entity, NavComponent, EntityStreams, SpawnInit, StaticEntity, StaticLayoutKey (derived from the Body-typed keys of SystemLayout)
- `src/sim/world/store.ts` - EntityStore and createEntityStore (binary search, non-dead cap, uint32 ceiling, in-place commit)
- `src/sim/world/world.ts` - World, frozen STATIC_ENTITIES, createWorld, staticEntity, isNeverSpawned, liveEntityCount, spawnEntity, killEntity, commitWorld
- `src/sim/world/serialize.ts` - serializeEntity, serializeWorldSection, entityHashes, hashWorld; private encodeHashString and type-tagged param encoding
- `tests/sim/world/hash.test.ts`, `tests/sim/world/store.test.ts` - the proofs above
- `.planning/PROJECT.md` - four Key Decisions rows, outcome "Phase 8 plan 08-05"

## Decisions Made

- Key Decisions rows (a) fixed ids, (b) monotonic ids with binary-search lookup, (c) statics as frozen layout references kept out of the hash, (d) per-world id uniqueness (CONTEXT D-06, owner amendment 2026-11-12), as the plan specified. Row (d) cites Oolite `OOTypes.h:165-171`, `Universe.m:5016-5020` and `Universe.m:9252`, and the plan 08-03 guard `tests/guards/entity-id-scope.test.ts`.
- `createEntityStore(init)` validates a restored list (strictly ascending, all below `nextId`) and throws a RangeError otherwise. The plan did not ask for it; it protects the binary search and the never-reused rule for plan 08-13's restore path.
- The plan's "AI params checked with `Object.hasOwn`" is satisfied by enumerating with `Object.keys` (own enumerable keys only), so an explicit `hasOwn` test would be dead code; an own `__proto__` key made by `JSON.parse` is refused by name and tested.

## Vocabulary check

- Command: `docker compose run --rm -v /home/opencode/git/oolite:/oolite:ro -e OOLITE_SRC=/oolite test npx vitest run tests/sim/world/hash.test.ts --reporter=verbose`
- Oolite commit: `4bb1f53de` (`git -C /home/opencode/git/oolite rev-parse --short HEAD`)
- Result: PASSED, 14 of 14 tests, 0 skipped; the case "equals the ENTRY names of the Oolite tables in table order (OOLITE_SRC)" ran and passed (39 behaviour ids from OOBehaviour.tbl and 16 scan classes from OOScanClass.tbl, full arrays compared in table order). The checkout is mounted read-only; nothing was fetched or copied into the repository.

## Gate evidence and attribution

All gates ran in the main tree (no detached worktree). Before each gate `git status --porcelain --untracked-files=all` listed only this plan's files (plus untracked review-diagnostics directories under `.planning/`). One compose container was running throughout, `wegolite-preview-1` (the production preview, up for 38 hours, which only serves an existing `dist/` and writes nothing during a test run), so the shared-bind-mount isolation condition is met in substance rather than literally (`docker ps` was not empty), as in plan 08-02.

| Gate | Result | Tree it ran on |
|------|--------|----------------|
| `npx vitest run` hash.test.ts and flight-hash-pins.test.ts (Task 1 verify) | 2 files, 17 passed, 1 skipped (the OOLITE_SRC case) | b5b8348 content (then uncommitted), main tree |
| OOLITE_SRC run of hash.test.ts | 14 passed, 0 skipped | same |
| `typecheck` and `lint` (Task 1) | exit 0 | same |
| `docker compose run --rm test` (full unit run, src/sim coverage floors) | exit 0, 114 files, 1665 passed, 2 skipped; src/sim/world 98.47 lines, 97.35 branches | tree 039df62 (b5b8348 plus the two Task 2 files, committed afterwards with no further edit) |
| `docker compose run --rm lint` and `typecheck` | both exit 0 | same tree, after one lint and one typecheck fix to store.test.ts |

The flaky `tools/oolite-ingest/convert/textures.test.ts` timeout seen in plan 08-04 did not occur in either full run.

## Acceptance criteria re-run

- Task 1: ids.ts and limits.ts have no import; no `new Map`/`new Set` in store.ts; `serializeFlight(` appears in serialize.ts and `git diff --quiet 5b189e4 -- src/sim/flight/state.ts` exits 0; the three id constants match; `layoutKey` appears 5 times and `Object.freeze` 6 in world.ts; one `isNeverSpawned` definition, used in serialize.ts, with no `nextId === FIRST_DYNAMIC_ID` there; `per-world` documented in ids.ts; the seven limit constants match their exact definitions; `./limits.js` imported once in each of world.ts and store.ts and no second definition of a shared value exists under src/sim/world or src/sim/ai; 4 `.includes(` and 2 `QUAT_UNIT_TOLERANCE` in world.ts; one `encodeHashString`. PASS.
- Task 2: 2 `fc.assert|fc.property` lines; 8 lines with `CLASS_FOO|"constructor"|1e-160`; 4 `RangeError`; 2 `per-world` titles; no module-level `let`/`var` in store.ts, world.ts or serialize.ts; PROJECT.md has 2 matches for `Universe.m:5014-5029|Universe.m:4841`, one `Entity id uniqueness is per world`, one `Universe.m:9252`, one `entity-id-scope`. `git diff --quiet 5b189e4 -- src/sim/flight src/sim/hyperspace/arrival.ts` exits 0; neither commit touches `src/app`. PASS.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test-side lint and exactOptionalPropertyTypes errors in store.test.ts**
- **Found during:** Task 2 (gate run before commit)
- **Issue:** an unused `_` parameter (eslint) and `{ speed: undefined }` passed to `Partial<SpawnInit>` (TS2379 under `exactOptionalPropertyTypes`).
- **Fix:** `Array.from({ length: 3 }, ...)` and an explicit init literal without `speed`.
- **Files modified:** tests/sim/world/store.test.ts
- **Verification:** lint, typecheck and the full unit run exit 0.
- **Committed in:** 039df62 (fixed before the commit)

### Additions

**2. [Rule 2 - Missing critical functionality] `createEntityStore(init)` validates its restored list**
- Throws a RangeError when the entities are not strictly ascending or not all below `nextId`; tested. Not asked for by the plan; see Decisions Made.

**Total deviations:** 1 auto-fixed bug (test code), 1 Rule 2 addition. **Impact:** none on plan scope or on any file outside the plan.

### Notes

- TDD ordering: Task 1 already created the implementation, and the plan commits Task 2's tests, store and world corrections and decision rows together. The Task 2 tests all passed on first run against the Task 1 code (no src change was needed in Task 2). Non-vacuity was spot-checked with one mutation: counting raw `live.length` instead of non-dead entities in `allocate` made "killing before commit frees non-dead slots at once" fail; the file was restored with `git checkout`.
- The 200-run property test is fast (the whole file runs in under 100 ms). Random command mixes rarely reach the 256 cap, which is why the cap has its own deterministic tests.

## Issues Encountered

None.

## Known Stubs

None. Broken-windows ledger: nothing to record.

## Threat Flags

None. The plan's mitigations are implemented as planned: T-08-09 (cap, refused spawn keeps nextId), T-08-10 (monotonic per-world ids, property test), T-08-41 (frozen statics, spawn validation, `nextId > 0xffffffff` refusal tested at 2 ** 32), T-08-49 (one limits module, enum `includes` checks, unit-quaternion rule, createWorld RangeError), T-08-50 (injective hash line rows).

## Next Phase Readiness

Plans 08-06 and later can import `EntityId`/ids, `limits.ts`, `World`, `spawnEntity`, `liveEntityCount` and `hashWorld`. Plan 08-07 (ShipControl), 08-11 (sanitize, step) and 08-13 (snapshot) must import the seven limits from `src/sim/world/limits.ts` and never redefine or re-export them; plan 08-11 adds `aiDropped` to the world and extends `isNeverSpawned` in the same task. Nothing outside `src/sim` may import `ids.ts` or `store.ts`.

## Self-Check: PASSED

- Files present: src/sim/world/ids.ts, limits.ts, entity.ts, store.ts, world.ts, serialize.ts, src/sim/ai/types.ts, tests/sim/world/hash.test.ts, tests/sim/world/store.test.ts.
- Commits present on HEAD: b5b8348, 039df62 (checked with `git merge-base --is-ancestor`).
