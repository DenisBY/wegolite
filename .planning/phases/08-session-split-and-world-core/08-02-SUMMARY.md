---
phase: 08-session-split-and-world-core
plan: 02
subsystem: simulation
tags: [rng, mulberry32, mix32, murmurhash3, determinism, world-seed, golden, flight-hash]

requires:
  - phase: 08-session-split-and-world-core
    provides: plan 08-03 determinism bans (Math.random and Date are lint errors in src/sim) and the entity-id scope guard
provides:
  - tests/golden/world/flight-hash-pins.json, three recorded Node flights pinned from the unmodified phase baseline (additive golden, formatVersion 1)
  - tests/helpers/recorded-flights.ts (RECORDED_FLIGHT_NAMES, replayRecordedFlight, recordFlightHashes) and its writer tests/helpers/write-world-goldens.ts
  - src/sim/rng.ts with RngState, createRngState, rngNext, fmix32, mix32, RngPurpose, ENTITY_RNG_PURPOSES, RNG_PURPOSE_CODES, worldSeedFor, forkSeed
  - createSeededRandom delegating to rngNext with a bit-identical draw sequence
  - the "only serialisable streams in src/sim" import-aware source scan
  - the D-02 vector table (below) and a PROJECT.md Key Decisions row
affects: [08-05, 08-09, 08-11, 08-15, 08-16, phase-11]

plan_head_before: e36d6723e326833a44930c1774b8e97cd23d2aa6
plan_head_after: 04350a3cc84944457bffe339214f928c73d9133d

actuals:
  tokens: 12500
  tasks: 3
  commits: 2

tech-stack:
  added: []
  patterns:
    - "plain-data uint32 stream state (RngState) so every simulation draw can be hashed and snapshotted"
    - "one-way derivation pinned by literal vectors computed by an independent BigInt re-implementation, landed in the same commit as the implementation"
    - "source-scan guard that is import-aware (alias and namespace imports) beside a call count"
    - "frozen pre-split baseline golden, never regenerated after the split"

key-files:
  created:
    - src/sim/rng.ts
    - tests/helpers/recorded-flights.ts
    - tests/helpers/write-world-goldens.ts
    - tests/golden/world/flight-hash-pins.json
    - tests/sim/world/flight-hash-pins.test.ts
    - tests/sim/rng.test.ts
  modified:
    - src/sim/math.ts
    - .planning/PROJECT.md

key-decisions:
  - "Owner confirmed option-a at the Task 2 one-way checkpoint (2026-11-13, in Russian, recorded here in English, after reviewing the Round 5 cross-AI review, which found the derivation a bijection in each argument and raised no change): mix32 exactly as written in the plan, with fmix32 the MurmurHash3 finaliser and purpose codes world 1, ai 2, combat 3"
  - "worldSeedFor and forkSeed throw RangeError on a bad epoch or entity id, a non-finite seed, and (Round 5 B2) on any purpose key that is not an own key of the frozen RNG_PURPOSE_CODES (Object.hasOwn), so an inherited key such as constructor cannot fork a silent degenerate seed"
  - "The stream-overlap bound M^2*D/2^32 is recorded with Phase 8 figures in the Key Decisions row (Round 5 B1): the only Phase 8 simulation stream is the one-shot arrival stream (M=1, D=8, about 1.9e-9); a later-phase budget of M=256 and D about 4,800 gives about 7%"
  - "arrival.ts is not edited: its single RngState lives for one call at jump commit and never survives a tick, so no stream state needs saving or hashing, and the arrival goldens cannot move"

patterns-established:
  - "A new closure-held stream in src/sim fails tests/sim/rng.test.ts until it uses RngState; raising the count or adding an importer of createSeededRandom needs an AI-zone review (plan 08-09 adds the importNames lint ban)"
  - "The one-way D-02 arithmetic is never committed without its literal vectors"

requirements-completed: [FOUND-12, FOUND-11]

coverage:
  - id: D1
    description: "Three recorded Node flights (launch and fly, dock approach ending in a docked event, Lave to Leesti jump with the session's arrival draw) produce hashFlight values committed as an additive golden captured before src/sim/math.ts changed"
    requirement: FOUND-12
    verification:
      - kind: unit
        ref: "tests/sim/world/flight-hash-pins.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "createSeededRandom first eight outputs for five seeds are exact literals from the unmodified closure and the delegated implementation reproduces them bit for bit; the arrival tests and every pre-existing golden pass without regeneration"
    requirement: FOUND-12
    verification:
      - kind: unit
        ref: "tests/sim/rng.test.ts#createSeededRandom (pinned before delegation)"
        status: pass
      - kind: unit
        ref: "tests/sim/hyperspace-arrival.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "RngState is plain data and a JSON round trip mid-sequence continues identically; fmix32, mix32, worldSeedFor and forkSeed are pinned by literal vectors, with adjacency, 1,000-epoch and id-101-across-worlds distinctness and RangeError argument checks"
    requirement: FOUND-12
    verification:
      - kind: unit
        ref: "tests/sim/rng.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "A source scan fails if createSeededRandom( appears in src/sim other than its declaration and the single arrival.ts call, or if any file other than arrival.ts imports it under any alias, or any file namespace-imports math.js"
    requirement: FOUND-11
    verification:
      - kind: unit
        ref: "tests/sim/rng.test.ts#only serialisable streams in src/sim"
        status: pass
    human_judgment: false

duration: 22min
completed: 2026-11-13
status: complete
---

# Phase 8 Plan 02: Flight Hash Pins and the Serialisable Seeded Stream Summary

**Three recorded flights pinned from the unmodified tree, a plain-data mulberry32 `RngState` with a bit-identical draw sequence, and the owner-confirmed `mix32` world-seed derivation (`worldSeed = mix32(marketSeed, epoch)`) fixed by independently computed literal vectors.**

## Performance

- **Duration:** about 22 min (this continuation executor; Task 1 and Task 3 only, Task 2 was answered before it started)
- **Tasks:** 3 (Task 1 tracer, Task 2 decision checkpoint, Task 3 auto)
- **Files:** 6 created, 2 modified (src/sim/math.ts and .planning/PROJECT.md)

## Accomplishments

- Task 1 (tracer): `tests/helpers/recorded-flights.ts` replays three Node flights with StepOptions, controller choice, equipment, hyperspace facts, dock geometry and the session's arrival draw mirrored line by line from `src/app/game-session.ts`, and `tests/golden/world/flight-hash-pins.json` pins their sampled `hashFlight` values (26, 15 and 43 samples). Captured while `git diff 5b189e4 -- src/sim/math.ts` was empty. The tracer verify (the two test files) passed end to end before Task 3 started, so expansion went ahead.
- Task 2 (decision): recorded below.
- Task 3: `src/sim/rng.ts` (no imports), `createSeededRandom` now wraps `createRngState` and `rngNext`, 35 tests in `tests/sim/rng.test.ts`, and a PROJECT.md Key Decisions row.

## Task 2 decision record (checkpoint:decision, one-way door)

The owner answered **option-a** at the checkpoint, pre-resolved by the orchestrator before this executor started. The owner replied in Russian; recorded here in English: owner confirmed option-a, 2026-11-13, after reviewing the Round 5 cross-AI review, which found the derivation a bijection in each argument and raised no change. D-02 was not reopened and 08-CONTEXT.md is untouched by every commit of this plan.

Exact definitions implemented and pinned (all over unsigned 32-bit integers; `Math.imul` and unsigned shifts only):

- `fmix32(h)`: `h ^= h >>> 16; h = imul(h, 0x85ebca6b); h ^= h >>> 13; h = imul(h, 0xc2b2ae35); h ^= h >>> 16; return h >>> 0` (the MurmurHash3 32-bit finaliser).
- `mix32(a, b) = fmix32((a >>> 0) ^ fmix32((b + 0x9e3779b9) >>> 0))`.
- `worldSeedFor(marketSeed, epoch) = mix32(marketSeed, epoch)`.
- `forkSeed(worldSeed, entityId, purpose) = mix32(mix32(worldSeed, entityId), RNG_PURPOSE_CODES[purpose])`.
- `RNG_PURPOSE_CODES = { world: 1, ai: 2, combat: 3 }` (frozen, looked up by key, never iterated); `ENTITY_RNG_PURPOSES = ["ai", "combat"]`, `"world"` being forked with entity id 0.

## D-02 vectors

Computed by an independent BigInt re-implementation of the definition above, written from the Task 2 answer alone and run from `/tmp` (imports nothing from `src/sim/rng.ts`); pasted as literals into `tests/sim/rng.test.ts` in the same commit as `rng.ts`. `fmix32(1) = 0x514e28b7` also matches the published MurmurHash3 finaliser value. Lave market seed `marketSeedForSystem("g0-s7") = 3545325333` (0xd3515f15). Phase 11 re-checks this table before it persists epoch.

| Function | Inputs | Output |
|----------|--------|--------|
| fmix32 | 0x00000000 | 0x00000000 |
| fmix32 | 0x00000001 | 0x514e28b7 |
| fmix32 | 0xffffffff | 0x81f16f39 |
| mix32 | (0x00000000, 0x00000000) | 0xaa3e5b61 |
| mix32 | (0x00000001, 0x00000000) | 0x6f0b28e6 |
| mix32 | (0x00000000, 0x00000001) | 0x70f6c6d8 |
| mix32 | (0xffffffff, 0x00000007) | 0xb31d5126 |
| worldSeedFor | (Lave market seed, epoch 0) | 0xbeeeb287 |
| worldSeedFor | (Lave market seed, epoch 1) | 0x2b4e037c |
| worldSeedFor | (Lave market seed, epoch 2) | 0x8c95b06e |
| forkSeed | (worldSeedFor(Lave, 1), 101, "ai") | 0xc1560f16 |
| forkSeed | (worldSeedFor(Lave, 1), 101, "combat") | 0xfcbfc8e0 |
| forkSeed | (worldSeedFor(Lave, 1), 102, "ai") | 0xf7113db3 |
| forkSeed | (worldSeedFor(Lave, 1), 102, "combat") | 0xa4390060 |
| forkSeed | (worldSeedFor(Lave, 1), 0, "world") | 0x0d279bea |
| forkSeed | (worldSeedFor(Lave, 0), 101, "ai") | 0xbef32200 |
| forkSeed | (worldSeedFor(Lave, 2), 101, "ai") | 0x33c884e7 |
| forkSeed | (0xffffffff, 0xffffffff, "combat") | 0x65b4d1ed |

## Task Commits

1. **Task 1: Record the shipped flight hashes and RNG vectors** - `702e2c3` (test)
2. **Task 2: owner decision, option-a** - no commit (recorded in this SUMMARY and in the PROJECT.md row written by Task 3)
3. **Task 3: RngState, mix32 derivation, createSeededRandom delegation** - `04350a3` (feat)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] hyperspace arrival vacuity guard identified the arrival layout by object identity against a fresh `laveFixture()`**
- **Found during:** Task 1
- **Issue:** `laveFixture()` builds a new layout on every call, so comparing sample layouts against it classified every sample as "arrived" and the 20 km guard failed on the pre-jump samples (the ship is parked at 1e7 m there).
- **Fix:** the guard now compares against the first sample's layout (the origin layout) in the same replay.
- **Files modified:** tests/sim/world/flight-hash-pins.test.ts
- **Commit:** 702e2c3 (fixed before the commit)

### Plan additions from the checkpoint answer (Round 5 LOW suggestions, algorithm reviewer, 08-REVIEWS.md)

**2. [Rule 2 - Missing critical functionality] B2: unknown purpose keys throw**
- `forkSeed` rejects any purpose that is not an own key of the frozen `RNG_PURPOSE_CODES` (`Object.hasOwn`) with a RangeError, matching the other argument checks, so `"constructor"`, `"__proto__"`, `"toString"`, `"hasOwnProperty"`, `"valueOf"`, `""` and `"Combat"` can no longer fork a silent degenerate seed. Tested in `tests/sim/rng.test.ts`. No mix32 vector changed.

**3. B1: stream-overlap bound recorded**
- The PROJECT.md Key Decisions row states the bound M^2 * D / 2^32 with Phase 8 figures (M = 1 arrival stream per jump, D = 8 draws, about 1.9e-9) and the later-phase budget the reviewer quoted (M = 256, D about 4,800, about 7%). No code change.

### Notes

- `src/sim/math.ts` header said "No imports"; it now has the one import of `./rng.js`, and the header sentence was updated to say so. The plan did not list this edit; it follows directly from the delegation.
- Flight shape choices the plan left open: dock-approach docks with the docking computer (Shift+C path, EQ_DOCK_COMP fitted) after 600 scripted ticks; hyperspace-lave-leesti teleports the ship to (1e7, 0, 0) after the skipped launch, as tests/sim/hyperspace.test.ts does, so the commit is clear of the Coriolis mass lock. After the arrival the replay switches origin, layout, dock geometry and fuel to the Leesti values the session switches to.

**Total deviations:** 1 auto-fixed bug, 1 Rule 2 addition from the owner-relayed review suggestion, 1 documentation addition. **Impact:** none on plan scope; no mix32 vector, golden or caller file changed.

## Gate evidence and attribution

All gates ran in the main tree (no detached worktree). Before each, `git status --porcelain --untracked-files=all` listed only this plan's files (and untracked review-diagnostics directories under `.planning/`). One compose container was running throughout: `wegolite-preview-1` (the production preview, up for 37 hours, which only serves an existing `dist/` and writes nothing during a test run), so the shared-bind-mount isolation condition is met in substance rather than literally (`docker ps` was not empty).

| Gate | Result | Tree it ran on |
|------|--------|----------------|
| `npx vitest run tests/sim/world/flight-hash-pins.test.ts tests/sim/rng.test.ts` (Task 1 verify) | 2 files, 10 tests pass | parent e36d672 plus this plan's Task 1 files, main tree |
| `npx vitest run` of the four Task 3 files (rng, flight-hash-pins, hyperspace-arrival, autosave) | 4 files, 75 tests pass | e36d672 + 702e2c3 + this plan's uncommitted Task 3 files, main tree |
| `docker compose run --rm test` (full unit run with coverage floors) | exit 0, 111 files, 1554 passed, 1 skipped | same uncommitted tree as above, main tree |
| `docker compose run --rm lint` and `typecheck` | both exit 0 | committed 04350a3, main tree |

- Task 1 commit `702e2c3be77930501292f21efd0a473bbf62caef`, tree `2daf8e57059b60c4b6ae709ff0660204184c3151`.
- Task 3 commit `04350a3cc84944457bffe339214f928c73d9133d`, tree `60d05223cb8f58eb779c967498aec8dc19f46670`.
- The full unit run was not repeated on the committed 04350a3 tree: the working tree it ran on differed from that commit by nothing (status was exactly the four files then committed). Lint and typecheck were re-run on the committed tree.

## Acceptance criteria re-run

- Task 1: `git diff --quiet 5b189e4 -- src/sim/math.ts` exited 0 at the Task 1 commit (math.ts untouched until Task 3); golden has formatVersion 1 and exactly the three flight names; `rg -c toBeCloseTo tests/sim/rng.test.ts` prints nothing; the content, hyperspace, market, save and kinematic-probe goldens are byte-identical to 5b189e4. PASS.
- Task 3: `git diff --quiet 5b189e4 -- src/sim/hyperspace/arrival.ts src/render/bodies src/render/break-pattern.ts src/sim/flight tests/golden/...` exits 0; `rg -n "^import" src/sim/rng.ts` empty; `export function mix32` count 1; `rngNext` in math.ts 2; `mix32(` 16, `worldSeedFor(` 18, `forkSeed(` 23 in the test file; the commit that adds rng.ts also changes tests/sim/rng.test.ts; the "only serialisable streams in src/sim" and "id 101 across worlds" titles each appear once and pass; PROJECT.md has `mix32(marketSeed, epoch)`, `arrival.ts:73` and `Weyl`; the filtered `createSeededRandom(` scan outside math.ts prints exactly `src/sim/hyperspace/arrival.ts:73`; no namespace import of math.js in src/sim; no commit of this plan lists 08-CONTEXT.md. PASS.

## Issues Encountered

None. The verify-full baseline red noted by plan 08-01 (stale docked-home specs, deferred-items D-1) is outside this plan and was not run; this plan touches no browser code.

## Known Stubs

None.

## Threat Flags

None. No new network endpoint, auth path, file access pattern or schema at a trust boundary. T-08-03, T-08-04 and T-08-47 mitigations are implemented as planned (pinned draw literals plus untouched arrival tests, RangeError argument checks with pinned vectors, import-aware stream scan).

## Next Phase Readiness

Plans 08-05 (store, `spawnEntity`) and 08-15 (`worldLifecycle.begin`) can import `worldSeedFor`, `forkSeed`, `createRngState` and `rngNext` from `src/sim/rng.ts`, and must guard `epoch < 0xffffffff` and `nextId <= 0xffffffff` before calling. Plan 08-11 and later plans assert against `tests/golden/world/flight-hash-pins.json`. Phase 11 re-checks the D-02 vector table above before it persists epoch.

## Self-Check: PASSED

- Files present: src/sim/rng.ts, tests/helpers/recorded-flights.ts, tests/helpers/write-world-goldens.ts, tests/golden/world/flight-hash-pins.json, tests/sim/world/flight-hash-pins.test.ts, tests/sim/rng.test.ts.
- Commits present on HEAD: 702e2c3, 04350a3 (verified with `git merge-base --is-ancestor`).
