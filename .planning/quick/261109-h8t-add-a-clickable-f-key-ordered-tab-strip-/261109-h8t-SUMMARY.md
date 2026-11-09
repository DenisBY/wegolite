---
phase: quick-261109-h8t
plan: 261109-h8t
subsystem: station-ui
tags: [station, tab-strip, input, f4-interfaces, playwright]
requires: []
provides:
  - pure station tab registry (src/ui/station-tabs.ts)
  - DOM hydrator for the shared strip (src/ui/station-nav.ts)
  - single navigateStation click sink in the session
  - live F4 Interfaces screen (stationInterfaces action)
affects:
  - src/input/actions.ts
  - src/input/keyboard.ts
  - src/ui/station.ts
  - src/ui/station-model.ts
  - src/app/game-session.ts
  - src/app/probe.ts
  - index.html
  - README.md
tech-stack:
  added: []
  patterns:
    - registry-hydrated nav, attributes mutated in place with a cached state key
    - availability derived from ACTION_CONTEXTS against a base context, never the live input context
key-files:
  created:
    - src/ui/station-tabs.ts
    - src/ui/station-nav.ts
    - tests/ui/station-tabs.test.ts
    - tests/ui/station-interfaces.test.ts
    - tests/e2e/station-tabs.spec.ts
  modified:
    - src/input/actions.ts
    - src/input/keyboard.ts
    - src/ui/station.ts
    - src/ui/station-model.ts
    - src/app/game-session.ts
    - src/app/probe.ts
    - index.html
    - README.md
    - tests/input/bindings.test.ts
    - tests/input/station-actions.test.ts
    - tests/e2e/docking.spec.ts
    - tests/e2e/station.spec.ts
    - .planning/PROJECT.md
decisions:
  - "Tab strip and Home screen are deliberate Wegolite additions; Launch tab enabled only on Home (D-03); active-tab re-click is a no-op"
  - "F4 Interfaces text is a literal pinned to the vendored descriptions.plist by a Vitest guard, not compiled by the content build"
  - "F1 and F4 join RESERVED_F_KEYS; real browser help-page behaviour is not tested, only the synthetic preventDefault"
metrics:
  duration: "about 1h45m (dominated by the 27 min verify-full run)"
  completed: 2026-11-09
status: complete
actuals:
  tokens: 52000
  tasks: 3
  commits: 3
plan_head_before: 154f1efc76b6c8b8166a1d9f82f8d21f2938290c
plan_head_after: 8564ded5cc6013487cf7b7e9d897ae6ad15d970a
---

# Phase quick-261109-h8t Plan 261109-h8t: Clickable F-key-ordered tab strip Summary

A registry-driven tab strip (Home, F1 Launch, F2 Save/Load, F3 Outfitting, F4 Interfaces, F5 Status, F6 Chart, F7 System data, F8 Market) is hydrated into the station shell, the chart and the Save/Load screen. Every click goes through one `navigateStation` sink that reuses the existing open paths, and F4 is now a live Interfaces screen showing Oolite's empty-state text.

## Commits

| Task | Commit | Description |
| ---- | ------ | ----------- |
| 1 | db2bce8 | Pure tab registry, `stationInterfaces` action (F4 / Digit4), F1 and F4 reserved, README row, unit tests |
| 2 | 68436a9 | `station-nav` hydrator, `navigateStation` sink, markup and scoped CSS in three surfaces, sub-tab setters, F4 panel, registry-generated hints, docking smoke test |
| 3 | 8564ded | `station-tabs.spec.ts`, reserved-key proof for F1 and F4, PROJECT.md Key Decisions row |

## Verification (all Docker)

- `docker compose run --rm test npx vitest run tests/ui/station-tabs.test.ts tests/ui/station-interfaces.test.ts tests/input tests/contract/readme.test.ts`: 108 passed.
- `docker compose run --rm typecheck` and `docker compose run --rm lint`: pass.
- `docker compose run --rm e2e sh -lc "npm run build && npm run test:e2e:fast"`: 19 passed (includes the new strip smoke test).
- `docker compose run --rm e2e sh -lc "npm run build && npx playwright test tests/e2e/station-tabs.spec.ts tests/e2e/station.spec.ts --project=chromium"`: 21 passed.
- `docker compose run --rm verify`: 19 e2e tests passed in the final run (I read the tail of the output, which showed no failures; the whole chain is repeated by verify-full).
- `docker compose run --rm verify-full`: exit code 0, 105 e2e tests passed (27.4 min).
- `src/sim` unchanged since the planning commit (`git diff --name-only 154f1ef..HEAD -- src/sim` is empty).
- `rg -c "clickable F-key-ordered tab strip" .planning/PROJECT.md` prints 1.
- Mutation check: with the `paused` and `isTabEnabled` guards removed from `navigateStation`, the paused force-click test failed (screen became market instead of staying home); the guards were then restored.

## Deviations from Plan

None - plan executed as written. Notes on judgement calls inside the plan's latitude:

- The force-enabled Launch tab test still passes with `navigateStation`'s guards removed, because the existing frame filter (launch only on the home screen) is the last guard (as the plan states). The test therefore proves the user-visible outcome (mode stays docked), not the sink-level guard alone.
- `.planning/config.json` shows as modified in the working tree; it was changed outside this task and was not staged or committed.

## Known Stubs

None. Shipyard and Market Info exist only as hidden registry slots by design (never rendered, no content), per the plan.

## Threat Flags

None. No new network endpoints, auth paths or schema changes were introduced.

## Self-Check: PASSED

- Created files exist: `src/ui/station-tabs.ts`, `src/ui/station-nav.ts`, `tests/ui/station-tabs.test.ts`, `tests/ui/station-interfaces.test.ts`, `tests/e2e/station-tabs.spec.ts`.
- Commits db2bce8, 68436a9 and 8564ded are on `main` (3 commits measured from `plan_head_before`).
