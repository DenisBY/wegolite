---
phase: 21-roster-state-shape-and-seams
plan: 13
subsystem: sim-events-and-render
tags: [explosions, velocity, destroy-events, fidelity, FOUND-20]
requires:
  - phase: 21-09
    provides: retireShip and the widened world views (no shared symbol edited here)
  - phase: 21-11
    provides: NPC model prefetch (no shared symbol edited here)
provides:
  - shipVelocity(entity), playerVelocity(state), totalVelocity(drift, orientation, speed) in src/sim/world/drift.ts
  - shipDestroyed.velocity and playerDestroyed.velocity (value copies, not hashed)
  - SMALL_BURST_DRIFT_FACTOR, BIG_BURST_DRIFT_FACTOR, CLOUD_DRIFT_FACTOR, CLOUD_MAX_DRIFT_SPEED
  - the velocity option of explosions.add
affects: [21-15]
tech-stack:
  added: []
  patterns: [one total-velocity definition shared by explosions and debris, render-only drift from a copied event value]
key-files:
  created: []
  modified:
    - src/sim/world/drift.ts
    - src/sim/events.ts
    - src/sim/world/kill.ts
    - src/sim/combat/death.ts
    - src/app/session/event-router.ts
    - src/render/bodies/explosions.ts
    - tests/sim/world/drift.test.ts
    - tests/sim/world/kill.test.ts
    - tests/sim/combat/death.test.ts
    - tests/sim/combat/death.property.test.ts
    - tests/sim/combat/step.test.ts
    - tests/sim/world/step.test.ts
    - tests/render/explosion-layer.test.ts
    - tests/app/session-order.test.ts
    - tests/app/session/death-flow.test.ts
    - tests/guards/player-death-producer.test.ts
    - FIDELITY.md
    - CHANGELOG.md
    - .planning/PROJECT.md
key-decisions:
  - "The ordinary NPC explosion cloud drifts at 1x with Oolite's 1000 m/s cap (OOExplosionCloudEntity.m:102-105), beside the plan's small 1x and big 0.85x factors"
  - "A destroyed buoy's event carries a copy of its own drift (its flight speed is 0), so every shipDestroyed has a velocity"
  - "totalVelocity normalises -0 to +0 and any non-finite component to 0, so events never carry a negative zero or a non-finite value"
requirements-completed: [FOUND-20]
duration: ~150min
completed: 2026-11-26
status: complete
commits: 3
plan_head_before: b09275fd620a59fcd76b86b0c1081be5bf689358
plan_head_after: 891c716d53c499d7e1aae07a4b412733e7fc62c4
actuals:
  tokens: 14000
  tasks: 2
  commits: 3
---

# Phase 21 Plan 13: Explosions drift with the ship that blew up Summary

Every explosion now moves with the ship that died, as Oolite's do: `killShip`, `destroyBuoy` and `killPlayer` copy the dying ship's total velocity into the destroy event, and the render layer moves each burst's centre by that velocity times a per-kind factor times the burst's age. Render-only: no hashed value moved, no golden or twin literal changed, and the remote frozen run is 21 of 21.

## What changed

- `shipVelocity` / `playerVelocity` (src/sim/world/drift.ts): Oolite's `-velocity` (`ShipEntity.m:11158-11166`), the drift plus the forward axis (-Z) times the flight speed, returned as a new object. Both go through `totalVelocity`, which is total on any input: a non-finite drift component, speed or orientation component counts as 0, and a result component that still overflows is 0; -0 reads +0. Defined independently of `attack.ts` (not edited; no import cycle risk). Plan 21-15 reuses `shipVelocity` for debris.
- Events: `shipDestroyed.velocity` and `playerDestroyed.velocity` (a `Vec3` value copy). A destroyed buoy's event carries a copy of its own drift.
- Router: `shipDestroyed` and the death flow's eight adds pass `{ velocity: event.velocity }` (and `kind`, `variant`, `flash` for the eight) to `scene.explosions.add`.
- Render layer: `SMALL_BURST_DRIFT_FACTOR = 1` (`OOParticleSystem.m:274`), `BIG_BURST_DRIFT_FACTOR = 0.85` (`:324`); the ordinary cloud takes 1x capped at 1000 m/s (`CLOUD_DRIFT_FACTOR`, `CLOUD_MAX_DRIFT_SPEED`, `OOExplosionCloudEntity.m:62, 102-105`). A missing or non-finite velocity component counts as 0 and the offset is skipped for a zero velocity, so a still explosion is exactly as before.

## The flash finding (checked at the pin 7437f22)

The flash moves. `OOFlashEffectEntity.m:74-76` (`explosionFlashFromEntity`) hands `[entity velocity]` to `initExplosionFlashWithPosition:velocity:size:`, which calls `[self setVelocity:vel]` (`:55-60`); `OOFlashEffectEntity -update:` calls `[super update:]` (`:98`), and `Entity -update:` calls `applyVelocity:` (`Entity.m:869`, body `:878-881`: `position += velocity * delta_t`). No effect class in the chain (`OOFlashEffectEntity` -> `OOLightParticleEntity` -> `Entity`) overrides `applyVelocity:`. So the flash drifts at 1x of the whole velocity (not capped; only the cloud caps at 1000 m/s). Implemented and tested.

## FIDELITY, CHANGELOG, PROJECT.md

- E-173 (table cell): the "absent velocity drift" clause is removed (`rg -c "absent velocity drift" FIDELITY.md` is 0) and the drift is stated as faithful with `OOParticleSystem.m:274` and `:324`; every other clause and the E-173 excerpt are untouched.
- E-179 (table cell): "which stay where they were added, so the player's eight bursts always recede" rewritten to the faithful drift; the todo pointer now says the explosion half is plan 21-13 and the debris half plan 21-15. The camera row (E-181's cell) no longer says the bursts stay at the death position.
- `.planning/PROJECT.md`: one clause ("the explosions stay where the ship died") rewritten, since it would have been false.
- No excerpt needed adding: `tests/contract/fidelity.test.ts` passes with the existing excerpt ids. Prettier re-padded the whole FIDELITY.md table (the diffstat is large, the content change is the three cells).
- CHANGELOG `[Unreleased]` `### Changed`: explosions now move with the ship that blew up, including your own.

## Tests

- drift.test.ts: the (1, 2, 3) / speed 100 -> (1, 2, -97) case, speed 0 equals the drift as a new object, a quarter turn, the player's (0, 0, 5) / speed 200 -> (0, 0, -195), two fast-check properties (total on hostile input incl. NaN, Infinity and 1e308 for `shipVelocity` and `playerVelocity`; equals drift plus forward x speed in the domain and exactly the drift at speed 0).
- kill.test.ts: the event velocity is a value copy (a later drift change does not reach it), a buoy's event carries its drift copy; existing literals gain the field.
- death.test.ts and death.property.test.ts: `killPlayer` posts the copy; a property over malformed drift, speed and orientation always posts a finite velocity.
- explosion-layer.test.ts: small 5 m in 0.5 s at velocity 10 m/s, big 4.25 m, cloud 5 m and capped to 500 m for 3000 m/s, zero or missing velocity leaves positions exactly equal, the flash moves 2 m in 0.2 s, non-finite components count as 0, a 1e4 velocity stays finite over a lifetime.
- session-order.test.ts and death-flow.test.ts: the router hands the event's velocity to the layer, once for the NPC and on each of the eight player bursts.
- Event literals in step.test.ts (sim world and combat), session-order and death-flow gained `velocity`.

## Gates

| Gate | Result |
|------|--------|
| Targeted Vitest (task 1 list plus death, death-property, producer guard, death-flow, fidelity contract) | green |
| `docker compose run --rm test` (local) | first run: 4 failures: `tools-determinism` (a 5 s lint-spawning timeout, passes alone) and 3 `tests/sim/combat/step.test.ts` event literals missing `velocity` (fixed in the third commit); after the fix those two files pass; the rest was 302 of 304 files green |
| `lint`, `typecheck` | green (after the third commit) |
| Remote `verify` (snapshot 891c716d) | exit 0: 304 test files / 8521 tests passed, 10 skipped; 28 Playwright tests passed |
| Remote `test npm run test:acceptance` (snapshot 891c716d) | exit 0: 21 of 21 passed (frozen run) |
| Goldens | `git diff --name-only b09275fd..HEAD -- tests/golden` lists nothing: no golden or twin literal moved |

## Deviations from Plan

**1. [Rule 3 - Blocking] The producer guard's declaration line.** `tests/guards/player-death-producer.test.ts` pinned the `playerDestroyed` union member as one line; the new `velocity` field makes prettier split it, so the guard failed on the current tree. The expected declaration is now the member's `kind: "playerDestroyed";` property line, and `isTypePosition` treats a `;`-terminated `kind: "playerDestroyed"` line as a type member (an object literal ends in a comma, still flagged). Every mutation case of the guard still fails as before; nothing was weakened.

**2. [Rule 2 - Missing critical] Buoy kills.** `destroyBuoy` also pushes `shipDestroyed`; the field is required, so it carries a copy of the buoy's own drift (flight speed 0). Otherwise a buoy's explosion would have no velocity at the layer.

**3. [Rule 1 - Fidelity] The cloud cap.** The plan named only the small and big factors; Oolite's ordinary cloud (the NPC explosion) takes the velocity at 1x but cut to 1000 m/s (`OOExplosionCloudEntity.m:102-105`). Implemented and tested, since an uncapped cloud would diverge silently.

**4. Task split.** The tracer and the player half share the event union, the router file and the test fixtures, so the code is one commit (`c9f33a22`) rather than one per task; the second commit (`dac33fed`) is the FIDELITY, CHANGELOG and PROJECT.md text, the third (`891c716d`) the gate fixes. Hooks ran on all three.

## Authentication gates

None.

## Known Stubs

None.

## Threat Flags

None. T-21-25 (an alias or id leaking through the event): the velocity is a fresh `Vec3` from `shipVelocity`/`playerVelocity` (tests assert it is not the drift object and does not follow later drift writes); `entity-id-scope`, `kill-credit-consumers` and `player-death-producer` guards green. T-21-26 (non-finite or huge velocity): totality property tests on both functions, and the layer's non-finite and sanitiser-bound cases.

## Self-Check: PASSED

- `src/sim/world/drift.ts`, `src/render/bodies/explosions.ts`, `src/sim/combat/death.ts` FOUND; `rg -c "export function shipVelocity" src/sim/world/drift.ts` is 1; `rg -c "SMALL_BURST_DRIFT_FACTOR = 1|BIG_BURST_DRIFT_FACTOR = 0.85" src/render/bodies/explosions.ts` is 2; `rg -c "absent velocity drift" FIDELITY.md` is 0; `rg -c "velocity" src/sim/combat/death.ts` is at least 1.
- Commits `c9f33a22`, `dac33fed`, `891c716d` are ancestors of HEAD.
