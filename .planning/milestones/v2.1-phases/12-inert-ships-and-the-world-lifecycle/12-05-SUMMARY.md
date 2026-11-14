---
phase: 12-inert-ships-and-the-world-lifecycle
plan: 05
subsystem: app
tags: [torus, mass-lock, hyperspace-refusal, hud-copy, step-options]
requires:
  - phase: 12-inert-ships-and-the-world-lifecycle
    provides: "plan 12-04: ShipField, hyperspaceRefused.blocker, StepOptions.hyperspace.shipMasses (sim half of WORLD-10)"
provides:
  - "torusRefused SimEvent: a j request refused under mass lock (body or ship) is its own event, never a torusDisengaged for a drive that never ran"
  - "Router copy 'Hyperspeed mass-locked.' (Oolite descriptions.plist line 521); ROUTED_EVENT_KINDS is 15"
  - "refusalCopy(reason, blocker?) with 'Witchspace jump aborted: too close to a ship' for blocker ship; the station copy and the probe's lastRefusal { reason } are unchanged"
  - "StepOptionsInput.shipMasses copied into hyperspace.shipMasses only when present"
  - "WORLD-10 Key Decisions row completed; CHANGELOG entry; todo 2026-11-10 closed"
affects: [12-08]
status: complete
actuals:
  tokens: 7100
  tasks: 3
  commits: 5
plan_head_before: 4028cf6368222aac1ac385c97097e719d584cc02
plan_head_after: ed6ce0441292d21f6147f4255fe6260d27009b74
tech-stack:
  added: []
  patterns:
    - "a refusal is its own event kind, distinct from the stop of a running mechanism; the app owns the wording"
    - "optional step-option key omitted (not set to undefined) under exactOptionalPropertyTypes, like stationMass"
key-files:
  created: []
  modified:
    - src/sim/events.ts
    - src/sim/flight/torus.ts
    - src/app/session/event-router.ts
    - src/app/session/hyperspace-controller.ts
    - src/app/session/step-options.ts
    - tests/sim/torus.test.ts
    - tests/sim/world/ship-field.test.ts
    - tests/app/session-order.test.ts
    - tests/app/session/hyperspace-controller.test.ts
    - tests/app/session/sim-driver.test.ts
    - CHANGELOG.md
    - .planning/PROJECT.md
key-decisions:
  - "A refused torus toggle emits torusRefused (reason massLock) for every lock source; torusDisengaged stays for a running drive that loses the lock, is toggled off, or gets input."
  - "The ship blocker has its own fixed copy (44 characters); the blocker never reaches the probe's lastRefusal (T-12-11)."
requirements-completed: [WORLD-10]
---

# Phase 12 Plan 05: Refusal event and copies (app half of WORLD-10) Summary

A torus request refused under mass lock now emits its own `torusRefused` event and the HUD prints Oolite's "Hyperspeed mass-locked.", a jump refused next to a ship says "too close to a ship", and `buildStepOptions` carries the ship masses the session will supply in plan 12-08.

## Performance

- **Duration:** about 11 min
- **Started:** 2026-11-14T17:33Z
- **Completed:** 2026-11-14T17:44Z
- **Tasks:** 3
- **Files modified:** 12 (plus the todo moved)

## Accomplishments

- **Tracer (Task 1).** `torusRefused { reason: "massLock" }` is a new `SimEvent`; the single refused-toggle branch of `stepTorus` emits it instead of `torusDisengaged`, so bodies and ships share it. The router maps it to `hudMessages` and enqueues "Hyperspeed mass-locked."; `ROUTED_EVENT_KINDS` is 15. A running drive that loses the lock, a toggle-off and input still emit `torusDisengaged` and print "Torus disengaged". The torus pin in tests/sim/torus.test.ts and the ship-caused row through `stepSim` (tests/sim/world/ship-field.test.ts) assert `torusRefused` and no `torusDisengaged`. The tracer gate re-ran the four targeted Vitest files green (96 tests) before expansion.
- **Copy and builder (Task 2).** `refusalCopy(reason, blocker?)` returns "Witchspace jump aborted: too close to a ship" for blocker `ship` and keeps the Coriolis copy for `station` or no blocker; the router passes `event.blocker` and still stores `lastRefusal = { reason }` only (a row checks the keys are exactly `["reason"]`). `StepOptionsInput.shipMasses` is copied into `hyperspace.shipMasses` and the key is absent otherwise. The module keeps its Node-importable surface (one extra type import from `src/sim/world/ship-field.ts`).
- **Docs and bookkeeping (Task 3).** The WORLD-10 Key Decisions row now records the refusal event, both copies and the builder, with status "Phase 12 plans 12-04 (simulation) and 12-05 (refusal event and copies)". CHANGELOG `Unreleased > Changed` names the new copy. The torus todo was moved to `.planning/todos/completed/` with `git mv` and a Resolution section.

## Gates run (all in Docker)

| Gate | Result |
| --- | --- |
| Task 1 targeted Vitest (torus, mass-lock, ship-field, session-order) | 4 files, 96 tests passed (RED run: 4 failed first) |
| Task 2 targeted Vitest (hyperspace-controller, sim-driver, session-order, world-lifecycle) | 4 files, 128 tests passed (RED run: 3 failed first) |
| `docker compose run --rm typecheck` | exit 0, no `error TS` |
| `docker compose run --rm test` (full, coverage) | exit 0, 144 files, 2,849 passed, 2 skipped, no coverage error |
| `docker compose run --rm lint` | exit 0 (ESLint and Prettier clean) |
| `docker compose run --rm verify` | exit 0, Chromium 27 passed |

## Task commits

| Task | Commit | Note |
| --- | --- | --- |
| 1 RED | 1d7ccbd | test(12-05): a refused torus request is torusRefused, routed to Hyperspeed mass-locked. |
| 1 GREEN | 793ea2c | feat(12-05): a refused torus request emits torusRefused and prints Hyperspeed mass-locked. |
| 2 RED | 394aafa | test(12-05): ship blocker copy and step-options shipMasses |
| 2 GREEN | ca772eb | feat(12-05): ship blocker refusal copy and shipMasses in the step-options builder |
| 3 | ed6ce04 | docs(12-05): WORLD-10 row, changelog entry, torus todo closed |

`commits: 5` is measured from the persisted ledger (`git rev-list --count 4028cf6..HEAD` before the SUMMARY commit).

## Deviations from Plan

None - plan executed exactly as written. Two small additions inside the plan's scope: the ship-field.test.ts refusal row (the plan's "ship-caused row through stepSim" lives in the existing ship-field torus describe block, since it already has the hand-built world helpers), and the router doc comment count ("14 routed kinds" became 15).

## Known Stubs

None. `shipMasses` is intentionally still not supplied by the session: plan 12-08 builds it from `ships-npc.json` and hands it to `buildStepOptions`, so no ship blocks a jump in the running app until then (also recorded in the 12-04 summary).

## Threat Flags

None. T-12-11 is mitigated as planned: a two-value kind chooses fixed text, no entity id or name reaches the HUD, and the probe's `lastRefusal` keeps `{ reason }` (guard acceptance count and the key-list row).

## Notes for later plans

- Plan 12-08 must pass `shipMasses` (from the compiled NPC records) to `buildStepOptions`; until then the key is omitted.
- No browser spec reads the torus or refusal copies (`rg 'Torus disengaged|mass-locked' tests/e2e` finds nothing).

## Self-Check: PASSED

- Modified files exist; commits 1d7ccbd, 793ea2c, 394aafa, ca772eb, ed6ce04 are ancestors of HEAD.
- Acceptance counts re-run: `torusRefused` in events.ts 1 and torus.ts 2; "Hyperspeed mass-locked." in event-router.ts 1; `toHaveLength(15)` 1; "too close to a ship" 1; `refusalCopy(event.reason, event.blocker)` 1; `lastRefusal = { reason: event.reason }` 1; `shipMasses` in step-options.ts 4; CHANGELOG "Hyperspeed mass-locked" 1; PROJECT.md "Phase 12 plans 12-04 (simulation) and 12-05" 1; todo moved (completed exists, pending absent).
