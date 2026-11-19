---
phase: 17-npc-fire-and-hits-on-the-player
plan: 03
subsystem: testing
tags: [guards, tripwires, vitest, deferred-work]
requires:
  - phase: 15
    provides: kill path (killShip, notifyKill) and the kill notifications the guards watch
  - phase: 16
    provides: the shipHit todo this plan adds a guard pointer to
provides:
  - D-13.1 kill-credit consumer tripwire and its todo
  - D-13.2 shipHit consumer tripwire (guard pointer in the existing todo)
  - D-13.3 second-onEvent-handler tripwire and its todo
  - the firing decision source tripwire (advisor decision 3, narrowed by disposition 3)
affects: [17-04, 17-10]
status: complete
actuals:
  tokens: 20000
  tasks: 2
  commits: 2
plan_head_before: 01a866da90fe3e7230e6d81040b2a19aafb1ec46
plan_head_after: d088968d4970fc26c679929012057e8daaef89cc
tech-stack:
  added: []
  patterns:
    - "Comment-stripped source scan with a pure checker, a real-tree test and synthetic non-vacuity cases"
key-files:
  created:
    - tests/guards/kill-credit-consumers.test.ts
    - tests/guards/ship-hit-consumers.test.ts
    - tests/guards/on-event-handlers.test.ts
    - tests/guards/fire-decision-source.test.ts
    - .planning/todos/pending/2026-11-18-mutual-kill-credit-symmetry.md
    - .planning/todos/pending/2026-11-18-narrow-kill-time-ship-target-lost.md
  modified:
    - .planning/todos/pending/2026-11-17-skip-shiphit-for-a-doomed-target.md
key-decisions:
  - "Guards are tripwires with an allowlist updated in the same commit as the legitimate change; none is a proof"
  - "The populated-ships clause of the decision-source guard stays the runtime ai null check in populate.test.ts, with no static populate.ts scan"
requirements-completed: [CBT-15]
---

# Phase 17 Plan 03: Deferred-work tripwires Summary

Four guards under `tests/guards/` make this phase's three deferrals (D-10, D-11, D-12) and the firing decision source rule fail on the first real consumer, each with a message that names its todo or rule; no `src` change.

## Baselines re-checked (HEAD 01a866d, comment-stripped)

All baselines held, checked with `rg` and by the real-tree tests:

- `shipHit`: only `src/sim/events.ts` and `src/sim/combat/ledger.ts` in code; `src/sim/combat/step.ts` names it in comments only (line 380).
- `shipTargetDestroyed` / `shipKilledOther`: only `src/sim/ai/types.ts` (event-name list, lines 61-62) and `src/sim/world/kill.ts` (lines 113-114); `combat/step.ts` mentions them in comments only (line 369).
- Kill-credit read: only `hit.killer` at `src/sim/combat/step.ts:418`; otherwise `killer` is a parameter, a local or an object key in `kill.ts` and `ledger.ts`, and a type member in `events.ts:145`.
- `onEvent`: `FLIGHT_SCRIPT` only (`flight-script.ts` export at line 287); `TEST_PILOT` has `think` only.
- `createTestPilotAi`, `createFlightScriptAi` and `aiKey: "..."` literals: only under `src/sim/ai/` (`test-spawn.ts`, `pilots/flight-script.ts`, `pilots/test-pilot.ts`).
- `src/sim/ai/test-spawn.ts`: value-imported only by `src/app/session/probe-publisher.ts`, type-imported by `src/app/session/traffic.ts`.

## Guards, allowed files, non-vacuity cases

| Guard | Fails when | Allowed files | Todo or rule in message |
| --- | --- | --- | --- |
| `kill-credit-consumers.test.ts` (D-13.1) | `shipTargetDestroyed` or `shipKilledOther` named, or a kill-credit read (`.killer`, `?.killer`, `["killer"]`, `killer` key in an object destructuring pattern) | names: `src/sim/ai/types.ts`, `src/sim/world/kill.ts`; reads: those plus `src/sim/combat/ledger.ts`, `src/sim/combat/step.ts`, `src/sim/events.ts` | `.planning/todos/pending/2026-11-18-mutual-kill-credit-symmetry.md` |
| `ship-hit-consumers.test.ts` (D-13.2) | `shipHit` named in code | `src/sim/events.ts`, `src/sim/combat/ledger.ts` | `.planning/todos/pending/2026-11-17-skip-shiphit-for-a-doomed-target.md` |
| `on-event-handlers.test.ts` (D-13.3) | more than `MAX_ON_EVENT_HANDLERS` (1) modules in `AI_REGISTRY` define a function `onEvent` | none (runtime count) | `.planning/todos/pending/2026-11-18-narrow-kill-time-ship-target-lost.md` and "owner edit to Phase 15 criterion 1" |
| `fire-decision-source.test.ts` (advisor 3, disposition 3) | pilot builder named, or `aiKey` followed by a string literal, outside `src/sim/ai/**`; value import (import, export-from, dynamic, side-effect) of `sim/ai/test-spawn` outside `src/app/session/probe-publisher.ts` | `src/sim/ai/**`; `probe-publisher.ts` for the seam | `DECISION_SOURCE_RULE` (CBT-15, D-14, tripwire not a proof, update the allowlist in the same commit with the reason) |

Non-vacuity cases, each asserted inside its file:

- Kill credit: `event.killer`, `event?.killer`, a line-split `event.\n killer`, `event["killer"]`, `const { killer } = e`, `{ victim, killer }`, `{ killer: who }`, `{ killer = X }`, `({ killer }) =>`, a typed destructured parameter, and a `case "shipKilledOther"` in a pilot all fail. A local `killer`, a parameter `killer`, `({ victim, killer })` as an object literal, `[...killer]`, `{ victim: killer }`, array destructuring `[victim, killer]`, and comments pass. The kill path may read the credit; `events.ts` may not name the kill events.
- `shipHit`: an event-router subscriber row and an audio module fail; the two allowed files, comments (as in `combat/step.ts`) and `shipHitCount` pass.
- `onEvent`: a two-handler registry fails with the todo path and the owner edit; modules with no, undefined or non-function `onEvent` are not counted; the real registry has exactly the two keys and one handler.
- Decision source: a builder in `populate.ts`, `createTestPilotAi` in `game-session.ts`, an `aiKey` literal in `src/app`, a value import, a re-export, a dynamic import, a side-effect import and a multi-line import (reported at the specifier's line) of the seam fail. Pass: the one importer, `import type` and `export type` of the seam, a builder call and an AI literal in a new file under `src/sim/ai/`, a bare `fire: true`, `ctl.fire(self)`, `aiKey: AiKey` types, and comments.

## Todos

- Created `.planning/todos/pending/2026-11-18-mutual-kill-credit-symmetry.md` (D-10, D-13.1).
- Created `.planning/todos/pending/2026-11-18-narrow-kill-time-ship-target-lost.md` (D-12, D-13.3).
- Added a "Guard" section naming `tests/guards/ship-hit-consumers.test.ts` to `.planning/todos/pending/2026-11-17-skip-shiphit-for-a-doomed-target.md`; its status stays pending.

## Verification (Docker only)

- `docker compose run --rm test npx vitest run` on the four guards and `tests/sim/world/populate.test.ts`: 5 files, 74 tests, all passed.
- `docker compose run --rm lint`: eslint clean, prettier clean.
- `docker compose run --rm typecheck`: both tsc projects clean.
- No `verify`, no acceptance run (tests and planning files only, per the plan).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Weak-type error in the onEvent guard's test registries**
- **Found during:** Task 2 typecheck
- **Issue:** a registry entry with only `onEvent`-less `think` has no property in common with `{ onEvent?: unknown }` (TS2345)
- **Fix:** a local `OnEventRegistry` type with a required `think`
- **Files modified:** `tests/guards/on-event-handlers.test.ts`
- **Commit:** d088968 (fixed before the commit)

### Plan choices

- The optional invariant test in the assumption-delta block (ship A kills C while B also targets C; one `shipTargetLost` each; `flight-script` idempotent on a double delivery) was not written. It is optional, `world-support.ts` has no kill helper, and `tests/sim/world/kill.test.ts` and `flight-script.test.ts` already cover the kill-time delivery and the idempotent handler. The idempotence requirement is recorded in the narrow-`shipTargetLost` todo as an acceptance item for the plan that adds a second handler.
- The kill-event name scan uses the two-file allowlist from the plan's action text, which is narrower than the five-file kill path in the must-have; the credit-read scan uses the five-file kill path. Both hold on the real tree.
- The destructuring rule matches flat object patterns only (declarations, destructured parameters, typed parameters). A nested pattern or a credit carried through a renamed alias is not seen; the guard header and the todo say it is a tripwire.
- No CHANGELOG entry: tests and planning files only, no user-visible change.

## Known Stubs

None.

## Owner questions

None.

## Threat Flags

None. The guards add no network, auth, file-access or schema surface.

## Self-Check: PASSED

- Files present: the four guard files, the two new todos, the edited shipHit todo.
- Commits present on `main`: 06e4137 (Task 1), d088968 (Task 2); `git rev-list --count 01a866d..HEAD` was 2 before this SUMMARY commit.
