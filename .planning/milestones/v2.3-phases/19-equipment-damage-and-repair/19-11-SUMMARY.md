---
phase: 19-equipment-damage-and-repair
plan: 11
subsystem: app-session
tags: [internal-damage, step-options, sim-driver, identity-cache, oolite-fidelity]
requires:
  - phase: 19-equipment-damage-and-repair
    provides: "19-01 compiled damageProbability; 19-04 CombatOptions.internalDamage, holdPods, capacityPodsFor; 19-10 damageFlow; 19-12 F5 listing, F3 repair row, restricted test grant"
provides:
  - "internalDamageFactsFor (pure, Node-safe) and StepOptionsInput.internalDamage"
  - "SessionCore.internalDamageKey and SessionCore.internalDamageCache"
  - "the per-step facts in the sim driver: damage is live in a real session"
  - "a CHANGELOG entry for live equipment damage and cargo loss"
affects: [19-13, 19-14]
tech-stack:
  added: []
  patterns: ["identity cache keyed on three source objects (profile, catalogue, commodities), the equipmentSet() pattern"]
key-files:
  created:
    - tests/app/session/step-options.test.ts
  modified:
    - src/app/session/step-options.ts
    - src/app/session/sim-driver.ts
    - src/app/session/context.ts
    - tests/app/session/sim-driver.test.ts
    - CHANGELOG.md
key-decisions:
  - "No new decision: the facts are the plan's D-01/D-03 wiring; probability only from the compiled catalogue, absent catalogue or commodities means no roll"
requirements-completed: [CBT-08]
status: complete
actuals:
  tokens: 14000
  tasks: 2
  commits: 2
plan_head_before: 7d21e2af00dffd6fb8d8d7f0f315f8bdd57fb97f
plan_head_after: bf45fe9cf4cc48add3df61610787a5f4af60f68e
duration: 35m
completed: 2026-11-21
---

# Phase 19 Plan 11: Live internal-damage facts Summary

Every fixed step of a session with the equipment catalogue and commodities loaded now hands `stepSim` the player's internal-damage facts (items in profile order with their compiled probability, the hold's capacity, the hold's pods), so a hit through the shields can damage an installed item or destroy a cargo pod in a real session, through the event path and `damageFlow` only.

## What was built

- **`internalDamageFactsFor(profile, catalogue, commodities)`** (`src/app/session/step-options.ts`): pure, importable by the Playwright Node runner (no Three, no DOM, no `import.meta.glob`). `items` = `profile.equipment` in order with `damageProbability` from the catalogue (0 for a key it lacks; zero-probability keys stay listed), `capacityPods` = `capacityPodsFor(equipment, passengerBerths)` (Oolite's `maxAvailableCargoSpace`, `ShipEntity.m:7198-7201`, capacity and not free space), `pods` = `holdPods(cargo, commodities)`.
- **`StepOptionsInput.internalDamage`**: placed under `combat.internalDamage` only when present (`exactOptionalPropertyTypes`).
- **Cache on the session core** (`context.ts`): `internalDamageKey` (`{ profile, catalogue, commodities }` the cache was built from) and `internalDamageCache`, both undefined in `createSessionState`.
- **Sim driver** (`sim-driver.ts`): a local `internalDamageFacts()` returns undefined until both catalogues are loaded, otherwise rebuilds only when any of the three identities changed, and the step passes the result to `buildStepOptions` (key omitted when undefined). Because the cache key includes the profile object, a damage commit (new profile without the key) and a cargo change (trade, destroyed pod) both produce a new facts object on the next step.
- **CHANGELOG** `Unreleased` / `Added`: the entry for live damage ("Docking Computers damaged."), and the 19-12 entry's "starts being damaged with a later change" caveat dropped because this plan makes it true.

## Tests

- `tests/app/session/sim-driver.test.ts` (+3, via `hooks.onOptions`): with the real equipment and commodities catalogues and equipment `[EQ_CARGO_BAY, EQ_DOCK_COMP]`, one berth, cargo `{ gold: 2700 }` the step carries `{ items: [EQ_CARGO_BAY 0, EQ_DOCK_COMP 1], capacityPods: 30, pods: [gold 1000, gold 1000, gold 201] }`; two steps share one facts object (T-19-18); after `applyEquipmentDamaged(..., "EQ_DOCK_COMP")` the items no longer list it, after cargo gold 2700 to 1700 the pods are `[1000, 201]`, each a new facts object; without the catalogue or without the commodities the key is absent (T-19-19).
- `tests/app/session/step-options.test.ts` (new, 8 tests): profile order, probability 0 for an unknown key and zero-probability keys kept, capacity 20 / 35 with the bay / 15 with one berth (and unchanged by a full hold), pods equal `holdPods`, no mutation of profile or catalogues, `buildStepOptions` key absent without facts and by identity with them, and D-03: with the five F3 keys installed the items above probability 0 equal `DAMAGEABLE_EQUIPMENT_KEYS` (compared in profile order and as a set).

## Verification

- Targeted vitest per task (`sim-driver`, `tick-parity`, `step-options`) and `docker compose run --rm typecheck`: clean. `tick-parity.test.ts` passes unchanged.
- Full `docker compose run --rm test`: 280 test files passed, no coverage threshold error. `docker compose run --rm lint`: clean (eslint and prettier).
- Remote combat spec: `/home/opencode/.claude/scripts/wegolite-remote-run.sh run --rm e2e sh -lc "npm run build:e2e && npx playwright test tests/e2e/combat.spec.ts --reporter=list"`: `1 passed`, `exit=0 elapsed=18s snapshot=bf45fe9` (equals HEAD of the two task commits). Every twin literal unchanged.
- Remote `run --rm verify`: `28 passed`, `exit=0 elapsed=223s snapshot=bf45fe9`. No known flake occurred.
- Acceptance greps: `export function internalDamageFactsFor` 1; `internalDamageCache` in `context.ts` 2; no non-comment `from "three"` / `document.` / `window.` / `import.meta.glob` in `step-options.ts` (the one hit is the module doc); `Docking Computers damaged` in `CHANGELOG.md` 1; `DAMAGEABLE_EQUIPMENT_KEYS` in the new test 3; `tests/e2e/combat.spec.ts` untouched.
- No twin hash or literal moved (the browser combat twin runs a new game with no equipment and no cargo; the tick-parity sessions load no equipment catalogue). No `src/sim/npc/**`, `src/sim/world/**` or `ships-npc.json` change, so no NPC acceptance run.

## Deviations from Plan

None. The plan executed as written. TDD note: the facts builder and the driver wiring were written together with their tests and committed per task (as in the earlier plans of this phase), not as separate RED/GREEN commits.

## Auth gates

None.

## Known Stubs

None.

## Threat Flags

None. The facts are read-only and derived each time from validated session data; no equipment is damaged outside a sim event and `damageFlow` (prohibition CBT-08 holds: no debug or normal-play path damages equipment directly).

## Self-Check: PASSED

- Files: `src/app/session/step-options.ts`, `src/app/session/sim-driver.ts`, `src/app/session/context.ts`, `tests/app/session/step-options.test.ts`, `tests/app/session/sim-driver.test.ts`, `CHANGELOG.md` present.
- Commits: `5077fc4` (feat, Task 1) and `bf45fe9` (test, Task 2) are ancestors of HEAD; `git rev-list --count 7d21e2a..HEAD` was 2 at the time of writing.
