---
phase: 20-player-death-and-game-over
plan: 11
subsystem: render
tags: [explosions, three, instanced-mesh, oolite-fidelity, particle-system]

requires:
  - phase: 16-npc-ships
    provides: the ExplosionLayer cloud and flash (src/render/bodies/explosions.ts)
provides:
  - ExplosionAddOptions (variant, flash, kind) as an optional fifth parameter of ExplosionLayer.add
  - Oolite's small and big fragment-burst kinds with their speed range, lifetime and start size (D-01a)
  - the explosion pool of 16 (D-09)
affects: [20-04, 20-10]

plan_head_before: d8b37162e500e63f678f534d54c5ecf4ae83a57b
plan_head_after: 8426d54ae0f03a0f1ca960bf18ef014ab55776e6

actuals:
  tokens: 7000
  tasks: 2
  commits: 4

tech-stack:
  added: []
  patterns:
    - "per-add options folded into a render-only seed without moving the no-option seed string"
    - "per-slot flag and per-particle start-size arrays allocated once beside the existing ones"

key-files:
  created: []
  modified:
    - src/render/bodies/explosions.ts
    - tests/render/explosion-layer.test.ts

key-decisions:
  - "The kind is not part of the seed: small and big at one position, radius and variant draw the same directions and initial colours (one draw order for every kind)"
  - "An unknown kind, a non-integer or negative variant is skipped before a slot is taken, like other bad input"
  - "No CHANGELOG entry: an add without options draws exactly the Phase 16 explosion; the player's explosion is first shown by 20-07 and 20-08"

requirements-completed: [DEATH-01]

coverage:
  - id: D1
    description: "ExplosionLayer.add takes ExplosionAddOptions { variant, flash, kind }; variant 0 or absent keeps today's seed, a bad variant or kind is skipped"
    requirement: DEATH-01
    verification:
      - kind: unit
        ref: "tests/render/explosion-layer.test.ts#createExplosionLayer: the seed variant (D-01)"
        status: pass
    human_judgment: false
  - id: D2
    description: "An add with flash: false draws its cloud and never a flash; an absent flash stays true"
    requirement: DEATH-01
    verification:
      - kind: unit
        ref: "tests/render/explosion-layer.test.ts#createExplosionLayer: the per-add flash flag (D-01b)"
        status: pass
    human_judgment: false
  - id: D3
    description: "The small and big fragment-burst kinds take Oolite's speed range, lifetime and start size from nine pinned constants"
    requirement: DEATH-01
    verification:
      - kind: unit
        ref: "tests/render/explosion-layer.test.ts#createExplosionLayer: the fragment-burst constants (D-01a)"
        status: pass
      - kind: unit
        ref: "tests/render/explosion-layer.test.ts#createExplosionLayer: the small burst kind (D-01a)"
        status: pass
      - kind: unit
        ref: "tests/render/explosion-layer.test.ts#createExplosionLayer: the big burst kind (D-01a)"
        status: pass
    human_judgment: false
  - id: D4
    description: "The pool of 16 holds the player's eight bursts beside a same-moment explosion in two draw objects, with exactly two flashes"
    requirement: DEATH-01
    verification:
      - kind: unit
        ref: "tests/render/explosion-layer.test.ts#createExplosionLayer: the player's explosion as the death flow adds it (D-01, D-01b, D-09)"
        status: pass
      - kind: unit
        ref: "tests/render/explosion-layer.test.ts#createExplosionLayer: a fixed number of draw objects"
        status: pass
    human_judgment: false
  - id: D5
    description: "How the eight bursts look in the game (cloud form, flash, timing) is first visible once 20-04, 20-07 and 20-08 land"
    verification: []
    human_judgment: true
    rationale: "Nothing calls the new options until 20-04 (wave 2); the visual result is judged at the phase's UAT, not by a unit test"

duration: 33min
completed: 2026-11-23
status: complete
---

# Phase 20 Plan 11: Explosion layer options Summary

**ExplosionLayer.add gains a seed variant, a per-add flash flag and Oolite's small and big fragment-burst kinds (speed range, lifetime, start size from `src/Core/Entities/OOParticleSystem.m`), with the pool raised from 8 to 16 and every option-free add drawn exactly as before.**

## Performance

- **Duration:** 33 min
- **Started:** 2026-11-23T16:33:00Z
- **Completed:** 2026-11-23T17:07:00Z
- **Tasks:** 2 (a tracer and an auto task, both TDD)
- **Files modified:** 2

## Accomplishments

- `ExplosionAddOptions { variant?, flash?, kind? }` as the optional fifth parameter of `add`. `variant` is a non-negative integer, default 0, folded into the render-only seed: variant 0 or absent hashes today's string `${x},${y},${z},${radius}`, any other variant appends `,${variant}`. `flash` defaults to true; false keeps a per-slot flag (`flashEnabled`, a `Uint8Array` allocated once) so `update` never draws that slot's flash. `kind` is `"small"` or `"big"`; absent is the Phase 16 cloud.
- The nine burst constants, each documented with its full-path line at pin `7437f22`: `SMALL_BURST_MIN_SPEED` 100 and `SMALL_BURST_MAX_SPEED` 400 (`src/Core/Entities/OOParticleSystem.m:249-250`), `SMALL_BURST_DURATION` 1.5 (`:262`), `SMALL_BURST_SIZE_FACTOR` 32 (`:265`), `BIG_BURST_MIN_SPEED_BASE` 1 and `BIG_BURST_MIN_SPEED_PER_RADIUS` 0.5 (`:302`), `BIG_BURST_SPEED_SPAN` 4 (`:303`), `BIG_BURST_SIZE_FACTOR` 2 (`:310`, `:315`, `:342`), `BIG_BURST_DURATION` 1 (`:311`). A kind replaces exactly three cloud parameters: the speed range, the lifetime and the start size with its growth. A per-particle `startSize` array (allocated once) carries the start size; with no kind it is the speed, so the quad edge `2 (start + growth t)` is the same number as before.
- `EXPLOSION_POOL` 8 to 16: 160 cloud and 16 flash instances, still two draw objects for 16 and 50 adds in one frame; a seventeenth add overwrites the oldest.
- The player's explosion as 20-04 will add it (eight adds at one point, kinds small x4 then big x4, variants 1 to 8, a flash on the first alone) beside a default add: at t = 0.1 nine explosions live (90 cloud instances, two flash instances at x = 0 and x = 1000), at t = 0.5 no flash, at t = 1.2 50 cloud instances, at t = 1.5 nothing.
- Phase 16 cases untouched except the three pool-size pins (the pool pin, the oldest-overwrite case, the draw-object loop); the identical-particles case holds byte-identical.

## TDD Gate Compliance

- **Task 1 (tracer) RED** `3b22378`: target `createExplosionLayer: the per-add flash flag (D-01b) > draws a cloud and never a flash for an add with flash: false`; `gsd_run check tdd-red-evidence` returned `RED_EVIDENCE_OK` (`target_test_failed`) on a TAP run of that test. Semantic assessment: the target executed and failed on its planned assertion (`flashOf(layer).count` expected 0, received 1) because `add` took no options; the full-file run failed six planned assertions (pool 16, variants 1 and 2 identical, a bad variant drawn, the seventeen-add overwrite, the flash-less add beside a flashing one, the flash-less add alone). GREEN `84862ff`.
- **Task 2 RED** `24411d8`: target `the small burst kind (D-01a) > keeps the range whatever the radius`; `RED_EVIDENCE_OK`. Semantic assessment: failed on the planned speed-range assertion (28.95 against a minimum of 100) because `add` ignored `kind`; the full-file run failed seven planned assertions (constants undefined, small and big start sizes, the big 1.0 s life, the unknown kind, the nine-live case at t = 1.2). GREEN `8426d54`.
- No REFACTOR commit. RED evidence records live in the ignored `.gsd/tdd-evidence/20-11/` of the worktree.
- Tracer gate: after the Task 1 GREEN the tracer's `<verify>` (targeted Vitest plus typecheck) was re-run end to end and passed before Task 2 started.

## Task Commits

1. **Task 1: seed variant, flash flag, pool of 16 (tracer)** - `3b22378` (test), `84862ff` (feat)
2. **Task 2: small and big burst kinds (D-01a)** - `24411d8` (test), `8426d54` (feat)

**Plan metadata:** the commit holding this SUMMARY (docs: complete plan).

## Files Created/Modified

- `src/render/bodies/explosions.ts` - the options, the nine burst constants, `ExplosionBurstKind`, the per-slot flash flag, the per-particle start size, `EXPLOSION_POOL` 16, module and `add` docs
- `tests/render/explosion-layer.test.ts` - the variant, flash, burst-constant, small, big, kind-isolation and nine-live cases; the three pool-size pins moved to 16

## Decisions Made

- The kind is not folded into the seed, so both kinds at one position, radius and variant draw the same directions and initial colours (pinned by a case that also compares against a no-kind add).
- Bad input (non-integer or negative variant, unknown kind) is rejected in the same validation block as the other bad input, before the texture load and before a slot is taken; a case pins that a skipped add leaves sixteen valid adds around it all alive.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- A first `lint` run overlapped with the full `test` run and tripped on `src/sim/__purity_ban_math_random.ts`, a probe file the purity guard test writes temporarily; not a defect, rerun alone it passes.
- The first full `test` run had three load-induced timeouts (`textures.test.ts`, and two more); the second run failed one (`tests/guards/tools-determinism.test.ts`, a 30 s eslint-spawn timeout). Both files pass when run alone (25 tests); nothing in them touches the explosion layer.

## Gate Records

- Targeted per task: `tests/render/explosion-layer.test.ts` and `tests/app/dispose.test.ts` (64 tests) and `typecheck` exit 0.
- Plan boundary: `docker compose run --rm test` 279 of 280 files passed, the one failure a timeout that passes alone (see above); `docker compose run --rm lint` exit 0 (eslint and prettier).
- Remote `wegolite-remote-run.sh run --rm verify`: `snapshot 8426d54`, `exit=0 elapsed=205s` (lint, typecheck, content drift, unit tests, build, e2e smoke subset: 28 passed).
- Acceptance greps: `EXPLOSION_POOL = 16` 1; `ExplosionAddOptions` 1; `ExplosionBurstKind` 1; `(SMALL|BIG)_BURST_` exports 9; full-path citations 13 lines in the source and 8 in the tests; bare-name citations in the tests none; `toBe(8)` none; no change under `src/app` or `src/content`.

## Known Stubs

None. The new options are unused until 20-04 by design (wave 2).

## Threat Flags

None. The change adds no network, auth, file or schema surface; T-20-36 is mitigated as planned (pool of 16, nine-live case, variant 0 and no kind keeping the Phase 16 values, two draw objects pinned for 16 and 50 adds).

## Next Phase Readiness

20-04 can add the player's eight bursts through `ExplosionAddOptions` (`{ kind: "small", variant: 1, flash: true }`, then `flash: false` on the other seven, passing `flash` explicitly each time). 20-10 records the constants (`EXPLOSION_POOL`, the nine burst constants) in the constants ledger.

## Self-Check: PASSED

- `src/render/bodies/explosions.ts` and `tests/render/explosion-layer.test.ts` exist and carry the changes.
- Commits `3b22378`, `84862ff`, `24411d8`, `8426d54` are ancestors of HEAD; `commits: 4` measured from `plan_head_before`.
