---
phase: 08-session-split-and-world-core
plan: 11
subsystem: simulation
tags: [world-step, stepSim, ai-event-queue, sanitize, reserved-events, determinism, d-14]

requires:
  - phase: 08-session-split-and-world-core
    provides: 08-05 world core, limits and hashWorld; 08-07 WorldView and ShipControl; 08-09 AI registry and test pilot; 08-10 event router keyed to RoutedKind
provides:
  - src/sim/world/step.ts, stepWorld(world, player, layout, dt, registry?), AiRegistry, MAX_AI_EVENT_PASSES (8), MAX_AI_EVENTS_PER_DRAIN (4096), the private own-key lookup aiModuleFor
  - src/sim/sim.ts, stepSim(player, world, layout, config, intent, commands, dt, options?) with the jump-step rule
  - src/sim/world/sanitize.ts, sanitizeEntity(entity), field-complete, idempotent, exports no constant
  - src/sim/world/world.ts extended with World.aiQueue, World.aiDropped, MAX_AI_QUEUE_LENGTH (4096), postAiEvent, countAiDropped and isNeverSpawned with aiDropped === 0
  - src/sim/world/serialize.ts world section gains an aiDropped line
  - src/sim/events.ts, 15 reserved SimEvent kinds with the ARCHITECTURE 7.6 field names, LaserKind, LegalStatus, RESERVED_EVENT_KINDS
  - tests/sim/world/step.test.ts (29), tests/sim/world/sanitize.test.ts (121); PROJECT.md Key Decisions rows (a) to (h)
affects: [08-12, 08-13, 08-14, 08-15, 08-16]

actuals:
  tokens: 20208
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "stepWorld walks the live array by index over a length snapshot, so a spawn made during a tick is first updated and thinks next tick and a dead entity is skipped"
    - "AI dispatch looks modules up with Object.hasOwn over an injectable registry; a prototype name such as constructor is skipped, then nulled by sanitize"
    - "an event queue drained in bounded passes with a delivery budget and a queue cap, every well-formed drop counted in a saturating hashed counter"
    - "sanitize cleans each leaf into a {value, repaired} pair and replaces a readonly Vec3 or Quat only when a component changed, so a clean entity keeps its object identity and bits"

key-files:
  created:
    - src/sim/world/step.ts
    - src/sim/sim.ts
    - src/sim/world/sanitize.ts
    - tests/sim/world/step.test.ts
    - tests/sim/world/sanitize.test.ts
  modified:
    - src/sim/world/world.ts
    - src/sim/world/serialize.ts
    - src/sim/events.ts
    - tests/sim/world/hash.test.ts
    - tests/sim/world/store.test.ts
    - .planning/PROJECT.md

key-decisions:
  - "stepWorld repairs the world-level scalars (world.rng.s, world.aiDropped) at the start of the step, not just before the commit, because the drains read and increment aiDropped"
  - "an entity of an unknown kind is marked dead only when it is not already dead, which keeps sanitizeEntity idempotent (a second call would otherwise count the same repair again)"
  - "postAiEvent returns void; the saturating drop increment is the exported helper countAiDropped, shared by the post-time cap and the drain"
  - "Key Decisions rows (a) to (h) were appended to PROJECT.md after the per-world id row, each marked Phase 8 plan 08-11"

patterns-established:
  - "a poison-injection test spawns a clean entity and corrupts it afterwards, because spawnEntity refuses non-finite and out-of-domain values"

requirements-completed: []

coverage:
  - id: D1
    description: "stepSim composes the unchanged stepFlight with an id-ordered world step; an empty world leaves serializeFlight text and hashWorld equal to the flight hash at every tick of a scripted flight; the world is not stepped while docked or on the hyperspaceJumped step"
    requirement: FOUND-11
    verification:
      - kind: unit
        ref: "tests/sim/world/step.test.ts (stepFlight versus stepSim without a world versus stepSim with an empty world, never steps while docked, jump-step rule over a 1,800-step countdown)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Queued AI events: FIFO non-synchronous delivery, the 8-pass cap, the 4096 delivery budget and 4096 queue cap with the exact conservation law for aiDropped, saturation, malformed events ignored, isNeverSpawned and the hash see aiDropped"
    requirement: FOUND-13
    verification:
      - kind: unit
        ref: "tests/sim/world/step.test.ts (queued AI events, 10 tests)"
        status: pass
    human_judgment: false
  - id: D3
    description: "sanitizeEntity repairs every leaf serializeEntity and the snapshot parser read, counts one repair per call, never counts a normalisation, is idempotent to the bit, and the stepped world never throws in hashWorld after injected poison"
    requirement: FOUND-12
    verification:
      - kind: unit
        ref: "tests/sim/world/sanitize.test.ts (121 table and counting tests with a repairs-delta and a second-call check) and tests/sim/world/step.test.ts per-tick sanitising"
        status: pass
    human_judgment: false
  - id: D4
    description: "The 15 presentation and audio kinds are reserved with the section 7.6 names, entityRemoved is emitted per committed removal in ascending order, and every divergence is a Key Decisions row"
    requirement: FOUND-11
    verification:
      - kind: unit
        ref: "tests/sim/world/step.test.ts (entityRemoved and the reserved event kinds; the object-literal field names are pinned by docker compose run --rm typecheck)"
        status: pass
    human_judgment: false

duration: 35min
completed: 2026-11-13
status: complete
plan_head_before: 58c8e738792416916d9f5f6cb99d81b8e5746989
plan_head_after: 40260b0dd1814c923c52d5cd5841a65927868f99
---

# Phase 8 Plan 11: The world step Summary

**stepSim runs the unchanged flight step and then an id-ordered stepWorld (update, think, bounded FIFO AI event drains, per-entity sanitize, commit), with 15 reserved presentation event kinds and eight Key Decisions rows recording every divergence from Oolite.**

## Performance

- **Duration:** about 35 min of active work (first task commit 14:29 local, last 14:48 local, plus reading and planning before it)
- **Tasks:** 3 (Task 1 tracer, Task 2 auto with tdd, Task 3 auto)
- **Files modified:** 11 (5 created, 6 modified)
- **Diff size:** 2,250 insertions and 8 deletions over `src` and `tests` (80,833 added characters, so `actuals.tokens` is 20,208 at chars/4)

## Accomplishments

- **Task 1, the tracer (759f86d).** `stepWorld` validates `dt`, then updates and thinks over a length snapshot in ascending id order, dispatching through `aiModuleFor` (`Object.hasOwn`), with the `WorldView` built lazily and each think drawing from a local copy of the entity's own `ai` stream. `stepSim` calls `stepFlight` first, unchanged, and steps the world only when a world is passed, the player is launching or in flight, and the flight events hold no `hyperspaceJumped`. Tracer check: serialized flight text and `hashWorld` equal `hashFlight` at every tick of a scripted flight with an empty world, the wake-before-`nextThinkTick` case thinks on the wake tick and re-arms both timers to integers (17), and a hyperspace countdown changes the world every step before the jump and not on the jump step.
- **Task 2 (e2abf6d).** `World.aiQueue` and the hashed `aiDropped`; `postAiEvent` validates `to`, `name`, `a`, `b`, `n` and queues a copy of only the known fields; the drain runs before and after the thinks with at most 8 passes and 4096 dequeued events, drops and counts the remainder, and the cap on the queue is 4096. `sanitizeEntity` repairs position, orientation (degenerate, subnormal and overflow norms to identity, a renormalisation re-checked), speeds and ranges, radius, specKey, uint32 fields, AI timers, `ai.params` (keys, values, arrays), `repairs` itself and the four closed vocabularies, and `stepWorld` runs it on every live entity before the commit.
- **Task 3 (40260b0).** `SimEvent` gains the 15 reserved kinds (`laserKind` replaces §7.6's `kind`), `RESERVED_EVENT_KINDS`, `LaserKind` and `LegalStatus`; `stepWorld` emits `entityRemoved` per committed removal in ascending order; PROJECT.md Key Decisions rows (a) to (h) record ascending-id order, queued events and their caps, skip-the-dead, the placeholder integrator, the wake reading, the PITFALLS 4 engine scope, the §7.6 payload names with the id lifetime rule, and the jump-step rule.

## Task Commits

1. **Task 1: world step end to end** - `759f86d` (feat)
2. **Task 2: queued AI events, stream isolation, sanitising** - `e2abf6d` (feat)
3. **Task 3: reserved event kinds, entityRemoved, Key Decisions** - `40260b0` (feat)

**Plan metadata:** the docs commit that carries this SUMMARY. The measured `commits: 3` is `git rev-list --count 58c8e73..40260b0`.

## Ordering with plan 08-10

08-10 committed first (`329b9f8`, with its router already keyed to `RoutedKind`). Widening `SimEvent` here needed no `src/app` edit: typecheck and `tests/app/session-order.test.ts` stayed green against the 29-kind union. `src/app/session/event-router.ts` was not touched, so the plan brief's `verify` run for a touched router did not apply.

## Gates

| Gate | Commit | Tree SHA | Where it ran |
| --- | --- | --- | --- |
| `docker compose run --rm test` (129 files, 2,099 passed, 2 skipped, src/sim coverage floors held; sim/world 98.88 percent lines), `typecheck`, `lint` | `40260b0` | `caa2b455ebe2a63b284ae7ee24f01c6105bd1b02` | main tree; `git status` listed only this plan's files and the untracked review diagnostics, run before the final commit with identical content (`docker ps` was not queried, but no other executor was active: 08-10 had already committed) |

`verify` and `verify-full` were not run (gate policy: src/sim logic and tests only, and no `src/app` file was edited).

## Acceptance checks

- Task 1: `rg -c "stepFlight\(" src/sim/sim.ts` is 1; `git diff --quiet 5b189e4 -- src/sim/flight` exits 0; `.live.length` appears in step.ts and no `for (const x of world.store.live)`; `Object.hasOwn(registry` appears and `registry[...].think|onEvent` does not; `hyperspaceJumped` appears in sim.ts.
- Task 2: `MAX_AI_EVENT_PASSES = 8`, `MAX_AI_EVENTS_PER_DRAIN = 4096` (step.ts) and `MAX_AI_QUEUE_LENGTH = 4096` (world.ts) once each; `sanitizeEntity(` in step.ts; `./limits.js` imported once in sanitize.ts, which exports no constant; no `SANITIZE_QUAT_TOLERANCE` or `MAX_SNAPSHOT_MAGNITUDE`; no redeclared limit value under src/sim/world or src/sim/ai; the sanitize table holds the `1e-160`, `CLASS_FOO` and `"constructor"` rows.
- Task 3: events.ts holds the reserved kinds and the §7.6 spellings, no `...Id: EntityId` field, "world and tick" in its comment; PROJECT.md rows (f), (g) and (h) carry the greppable phrases; no Math transcendental in the world-core modules; FIDELITY.md unchanged; the only golden touched since `5b189e4` is `tests/golden/world/flight-hash-pins.json`; no exhaustive-switch construct exists.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Two existing tests pinned the exact world-section text**
- **Found during:** Task 2 (full test run)
- **Issue:** `tests/sim/world/hash.test.ts` and `tests/sim/world/store.test.ts` compared `serializeWorldSection` to the literal text `worldSeed=...\nnextId=...\nrng=...`, which the new `aiDropped=` line extends. Neither file is in the plan's `files_modified`.
- **Fix:** appended `\naiDropped=0` to the two expected strings.
- **Files modified:** tests/sim/world/hash.test.ts, tests/sim/world/store.test.ts
- **Commit:** e2abf6d

**2. [Rule 3 - Blocking] `Vec3` and `Quat` have readonly components**
- **Found during:** Task 2 (the sim typecheck inside `tests/guards/content-boundary.test.ts`, then `docker compose run --rm typecheck`)
- **Issue:** the first sanitize draft assigned components in place.
- **Fix:** the cleaners return a `{value, repaired}` pair and replace the vector or quaternion only when a component changed; test corruption goes through a loose cast. Behaviour is unchanged.
- **Files modified:** src/sim/world/sanitize.ts, tests/sim/world/sanitize.test.ts
- **Commit:** e2abf6d

### Plan clarifications (no behaviour beyond the plan)

- An unknown `kind` marks the entity dead only when it is not already dead, so the second sanitize call is a no-op (the plan requires idempotence and "marks dead" together).
- `stepWorld` repairs `world.rng.s` and `world.aiDropped` at the start of the step rather than at the sanitize phase, because the drains increment `aiDropped`.
- `ai.params` keys are listed with `Object.keys` (own enumerable keys only), which is the property the plan's `Object.hasOwn` enumeration needs; no second filter was added.
- `postAiEvent` returns void and the saturating drop increment is the exported helper `countAiDropped`.

**Total deviations:** 2 auto-fixed (1 Rule 1, 1 Rule 3). **Impact:** none on the plan's contracts.

## Issues Encountered

- `tools/oolite-ingest/convert/textures.test.ts` timed out at 5000 ms in the first full run (the known flake, deferred-items D-2); the next full runs passed with it.
- The branch of `cleanOrientation` that falls back to identity when a renormalisation still lands outside `QUAT_UNIT_TOLERANCE` cannot be reached with any input whose squared norm is at least `MIN_QUAT_NORM_SQ` (renormalising a norm of 1e-6 or more is accurate); it is kept because the plan requires the re-check, and it is the one uncovered branch.

## Known Stubs

None. The constant-speed integrator is the plan's deliberate Phase 8 model (Key Decisions row (d)), pinned by one labelled test.

## Threat Flags

None. No new endpoint, auth path or trust-boundary file access was added.

## Self-Check: PASSED

- Created files exist: step.ts, sim.ts, sanitize.ts, step.test.ts, sanitize.test.ts.
- Commits `759f86d`, `e2abf6d` and `40260b0` are ancestors of HEAD.
