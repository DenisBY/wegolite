---
phase: 19-equipment-damage-and-repair
plan: 10
subsystem: app
tags: [event-router, damage-flow, hud-messages, atomic-commit, cbt-08, cbt-12]
requires:
  - phase: 19-equipment-damage-and-repair
    provides: "19-02 equipmentDamaged and cargoDestroyed sim events, 19-03 applyEquipmentDamaged and applyCargoDestroyed, 19-08 save v5 with damagedEquipment"
provides:
  - "damageFlow in EVENT_SUBSCRIBER_ORDER (stationFlow, worldLifecycle, damageFlow, hudMessages, dockFeedback, hyperspaceFlow)"
  - "ROUTED_EVENT_KINDS 22 to 24; equipmentDamaged and cargoDestroyed each routed to damageFlow alone"
  - "createDamageFlow, DamageFlowDeps, EQUIPMENT_DAMAGED_TEMPLATE, CARGO_DESTROYED_TEMPLATE, formatDamageMessage"
  - "the HUD length guard over every equipment and commodity damage message"
affects: [19-11, 19-12, 19-13, 19-14]
requirements-completed: [CBT-08, CBT-12]
actuals:
  tokens: 5000
  tasks: 2
  commits: 2
plan_head_before: f574b577a802162552bf58571f748f6f1c8ef961
plan_head_after: 2c457c97ec980fbb49cf989219a33890f5492a2a
tech-stack:
  added: []
  patterns:
    - "A gameplay subscriber that owns its HUD message and prints it only when its own commit took effect (hyperspaceFlow precedent)"
key-files:
  created:
    - tests/app/session/event-router-damage.test.ts
  modified:
    - src/app/session/event-router.ts
    - src/app/game-session.ts
    - tests/app/session-order.test.ts
    - tests/app/session/world-lifecycle.test.ts
    - tests/app/session/event-router-ident.test.ts
    - tests/app/session/sim-driver.test.ts
    - tests/app/session/tick-parity.test.ts
    - tests/guards/hud-message-length.test.ts
key-decisions:
  - "Both damage kinds are routed to damageFlow alone, which prints after its own commitProfile returned true; hudMessages has no damage arm (T-19-17)"
status: complete
---

# Phase 19 Plan 10: The damage subscriber Summary

**`damageFlow` applies each `equipmentDamaged` or `cargoDestroyed` event to the profile in one `commitProfile` call and prints Oolite's "%@ damaged." or "%@ destroyed." for 4.5 s after one `clearPrevious`, only when that commit took effect; the router now has 24 pinned kinds and six pinned subscribers.**

## Performance

- **Tasks:** 2 of 2 (Task 1 the tracer: one equipmentDamaged through router, commit and HUD)
- **Commits:** 2 code commits, measured from the plan base `f574b57` (`git rev-list --count`); the SUMMARY commit follows.
- **Estimate vs actual:** about 5,000 tokens (chars/4 over the realized diff, 408 added lines) against an estimate of 60,000.

## Task Commits

| Task | Commit  | Files |
| ---- | ------- | ----- |
| 1    | 9bba5dd | `src/app/session/event-router.ts`, `src/app/game-session.ts`, `tests/app/session/event-router-damage.test.ts`, `tests/app/session-order.test.ts`, `world-lifecycle.test.ts`, `event-router-ident.test.ts`, `sim-driver.test.ts`, `tick-parity.test.ts` |
| 2    | 2c457c9 | `src/app/session/event-router.ts` (cargo message), `tests/app/session/event-router-damage.test.ts`, `tests/guards/hud-message-length.test.ts` |

## Router diff

- `EVENT_SUBSCRIBER_ORDER` gains `damageFlow` after `worldLifecycle`; `ROUTED_EVENT_KINDS` gains `equipmentDamaged` and `cargoDestroyed`; `EVENT_KIND_SUBSCRIBER` routes both to `["damageFlow"]`. The module doc now says five gameplay subscribers and 24 routed kinds.
- `createDamageFlow(ctx, { commitProfile, messages })` is wired in `game-session.ts` with the station controller's `commitProfile` and the shared message queue. `createHudMessages` has no damage arm.
- Every router construction in the tests (four in `session-order.test.ts`, one typed record each in `session-order` and `sim-driver`, `world-lifecycle` x2, `tick-parity`, `event-router-ident`) supplies a `damageFlow` stub. `tick-parity.test.ts` gains only the stub line: no twin literal changed, none shifted.

## How the cargo arm knows the commit took effect

`applyCargoDestroyed` returns the same profile object on a refusal (no such goods, a non-positive or non-integer amount, or more than held). The station controller's `commitProfile` compares identity (`next === ctx.core.profile` returns false and changes nothing). `damageFlow` reads that boolean: on `false` it returns before any `clearPrevious` or `enqueue`. The equipment arm works the same way, so a repeated, uninstalled or non-damageable key prints nothing. Because only `damageFlow` ran the commit, no other subscriber could tell, which is why the messages live here and not in `hudMessages`.

## Verification

- Targeted files per task and `typecheck`: green at both task commits.
- `docker compose run --rm test npx vitest run tests/app tests/guards`: 53 files, 1044 tests passed.
- `docker compose run --rm test` (full): 277 of 279 files passed. The two failures were timeouts only (`tests/guards/tools-determinism.test.ts`, 30 s, and `tools/oolite-ingest/convert/textures.test.ts`, 5 s), both in files this plan did not touch, while a lint container ran concurrently. Rerun alone, both pass (25 tests). No coverage floor applies to `src/app`; no `src/sim` or `src/persistence` file changed.
- `docker compose run --rm lint`: clean (eslint, prettier). An earlier lint reported `src/sim/__purity_content_probe.ts`: a transient file a purity test writes during the full run while lint ran at the same time; the rerun alone is clean.
- Remote `verify` (fast gate): `snapshot 2c457c9` (= HEAD at the last code commit), `exit=0 elapsed=243s snapshot=2c457c9`; 27 Chromium e2e specs passed.

## Deviations from Plan

None - plan executed exactly as written. (Task 1's `cargoDestroyed` arm commits without printing, as the plan says; Task 2 adds the message.) The "Twenty" pin comment in `session-order.test.ts` became "Twenty-two" because 22 of the 24 kinds have one subscriber.

## Known Stubs

None. Nothing emits the two events in play until 19-11 supplies the facts, so nothing on screen changes and there is no CHANGELOG entry, as the plan states.

## Threat Flags

None.

## Self-Check: PASSED

- Files: `src/app/session/event-router.ts`, `src/app/game-session.ts`, `tests/app/session/event-router-damage.test.ts`, `tests/guards/hud-message-length.test.ts` present.
- Commits `9bba5dd` and `2c457c9` are ancestors of HEAD.
- Acceptance counts: `createDamageFlow` export 1, `equipmentDamaged: ["damageFlow"]` 1, `cargoDestroyed: ["damageFlow"]` 1, `createDamageFlow(` in `game-session.ts` 1, `toHaveLength(24)` in `session-order.test.ts` 1.
