---
phase: 12-inert-ships-and-the-world-lifecycle
plan: 03
subsystem: build
tags: [vite-define, test-flags, browser-test-bundle, container-contract, traffic-default]
requires:
  - phase: 12-inert-ships-and-the-world-lifecycle
    provides: "plan 12-02 AI fault containment and malformed spawn input (no direct code dependency; wave order)"
provides:
  - "__WEGOLITE_TRAFFIC_DEFAULT__ build-time define: true in vite.config.ts (production, D-10 unchanged), false in vite.e2e.config.ts and vite.seams.config.ts, true under Vitest"
  - "parseTestFlags(search, trafficDefault = true): without the hook traffic is the bundle default; with the hook it is exactly traffic=1"
  - "npm run build:e2e and vite.e2e.config.ts: the browser-test bundle (default dist/ output)"
  - "e2e, e2e-cross, verify and verify-full build the e2e bundle; preview and the Pages deploy keep the production build"
  - "no-leak contract in tests/contract/container-contract.test.ts; AGENTS.md documents the build:e2e targeted command; Key Decisions row 'Browser test builds default traffic off'"
affects: [12-08, 12-09, 12-11, 12-12]
status: complete
actuals:
  tokens: 8500
  tasks: 2
  commits: 3
plan_head_before: d5c1386ebdb98e27cdce40bbcf6f533c195336c3
plan_head_after: c02639cde8e85c330f2f41f1a16929fb2f8930fc
tech-stack:
  added: []
  patterns:
    - "build-time define per bundle (precedent __WEGOLITE_TEST_SEAMS__): vite.e2e.config.ts is mergeConfig(base, { define })"
    - "text-level contract over config files and compose services, with the file's executable() helper so comments never count"
key-files:
  created:
    - vite.e2e.config.ts
  modified:
    - vite.config.ts
    - vite.seams.config.ts
    - vitest.config.ts
    - package.json
    - src/app/session/test-flags.ts
    - src/app/session/start-session.ts
    - tests/app/session/test-flags.test.ts
    - tests/e2e/tick-hook.spec.ts
    - compose.yaml
    - playwright.config.ts
    - tests/contract/container-contract.test.ts
    - AGENTS.md
    - .planning/PROJECT.md
key-decisions:
  - "Production keeps NPC traffic on for a plain session (D-10 unchanged); only the browser-test bundles default it off, so the 34 plain page.goto calls and budget.spec.ts run unchanged once plan 12-08 wires the populator (owner decision 1, 2026-11-14)."
  - "The URL never overrides the build default without the hook: ?traffic=1 and ?test=2&traffic=1 give the bundle default in both bundles (T-12-07)."
  - "The define cannot leak: the container contract pins the production true, the two test configs' false, the build and build:e2e scripts, the preview and Pages builds and exactly four build:e2e services (T-12-06)."
requirements-completed: []
---

# Phase 12 Plan 03: Browser-test bundle with traffic default off Summary

A build-time `__WEGOLITE_TRAFFIC_DEFAULT__` define gives the browser-test bundle (`npm run build:e2e`) a plain-session traffic default of off while production keeps it on, and a container contract keeps the define out of the deployed bundle.

WORLD-16 is delivered over several plans, so `requirements-completed` is empty here and WORLD-16 was deliberately not marked complete.

## Performance

- **Duration:** about 9 min of agent time plus about 6 min of the `verify` gate
- **Started:** 2026-11-14T17:10Z
- **Completed:** 2026-11-14T17:20Z
- **Tasks:** 2
- **Files modified:** 14 (1 created)

## Accomplishments

- **Tracer (Task 1).** The define is read by `start-session.ts` and passed as the second argument of `parseTestFlags`, which uses it for the non-hook case. A plain session in the e2e bundle has `probe.sim.traffic` false even for `/?clock=manual&traffic=1`; `?test=1&traffic=1` still opts in. Verified end to end in the browser by the tick-hook spec (5 passed) on a freshly built e2e bundle, and by the four targeted Vitest files (141 passed).
- **Wiring and guard (Task 2).** `e2e`, `e2e-cross`, `verify` and `verify-full` now run `npm run build:e2e`; `preview` and `.github/workflows/pages.yml` keep `npm run build`. The container contract gained a describe block "the traffic default never reaches the deployed bundle" (define values, no `outDir` in vite.e2e.config.ts, preview and Pages builds, exactly four `build:e2e` services), and the exact `verify`, `verify-full` and `e2e-cross` command pins moved to `build:e2e`.
- **Docs.** AGENTS.md names `docker compose run --rm e2e sh -lc "npm run build:e2e && npx playwright test <spec>"` and carries a Docker-workflow bullet on the two bundles. PROJECT.md has the Key Decisions row "Browser test builds default traffic off" and a pointer sentence in the "Test-only manual clock" row.

## The one changed browser assertion (owner decision 1)

In `tests/e2e/tick-hook.spec.ts`, the test "the clock and traffic flags are inert without ?test=1" changed in exactly two places:

1. The URL `/?clock=manual&traffic=0` became `/?clock=manual&traffic=1`.
2. `expect(before.traffic).toBe(true)` became `expect(before.traffic).toBe(false)`.

Both are consequences of owner decision 1: the e2e bundle's plain default is off, so with `traffic=0` the inertness check would be vacuous; with `traffic=1` the test still proves the URL cannot change traffic without the hook. A comment in the test names the Key Decisions row. This is the first of the three existing browser assertions Phase 12 changes (the others: plan 12-08's expired opt-in entity count and plan 12-14's chart inversion). Nothing else in the file changed.

## Task Commits

1. **Task 1: tracer, a build-time define reaches parseTestFlags**: `4ebb62e` (test, RED rows) then `1ef2a21` (feat, GREEN)
2. **Task 2: services build the e2e bundle, no-leak contract, decision recorded**: `c02639c` (feat)

**Plan metadata:** the docs commit that carries this SUMMARY, STATE.md and ROADMAP.md.

## Gates run (all in Docker)

- RED: `docker compose run --rm test npx vitest run tests/app/session/test-flags.test.ts` failed 4 rows before the change (the `trafficDefault` argument was ignored), as intended.
- `docker compose run --rm test npx vitest run tests/app/session/test-flags.test.ts tests/app/session/sim-driver.test.ts tests/app/session-order.test.ts tests/app/session/world-lifecycle.test.ts`: 4 files, 141 tests passed. The world-lifecycle source pin `ctx.runtime.testFlags = parseTestFlags(` still matches.
- `docker compose run --rm e2e sh -lc "npm run build:e2e && npx playwright test tests/e2e/tick-hook.spec.ts"`: 5 passed.
- `docker compose run --rm test npx vitest run tests/contract/container-contract.test.ts tests/app/session/test-flags.test.ts`: 2 files, 46 tests passed.
- `docker compose run --rm verify` (lint, typecheck, assets:check, test, `build:e2e`, test:e2e:fast): exit 0, 27 Playwright tests passed, about 5 min 51 s. Run once at the end, as the plan says.

## Acceptance criteria

All command criteria pass at the final HEAD: define `"true"` in vite.config.ts (1), `"false"` in vite.e2e.config.ts (1) and vite.seams.config.ts (1), the `build:e2e` script (1), `trafficDefault` in test-flags.ts (3), old assertion and old URL absent (0, 0), `npm run build:e2e` in compose.yaml (4), `npm run build &&` in compose.yaml (1, only `preview`), `build:e2e` in pages.yml (0), `build:e2e` in the contract test (8), the AGENTS.md command (1), the Key Decisions row (2 matches: the row and the pointer sentence).

## Deviations from Plan

### Formatting-driven

**1. [Rule 3 - Blocker, cosmetic] The start-session call is formatted over several lines**
- **Found during:** Task 1 acceptance criteria
- **Issue:** The criterion `rg -c 'parseTestFlags\(window\.location\.search, __WEGOLITE_TRAFFIC_DEFAULT__\)' src/app/session/start-session.ts` expects the call on one line, but with the added comment and the 80-column Prettier rule the call is formatted as `parseTestFlags(\n window.location.search,\n __WEGOLITE_TRAFFIC_DEFAULT__,\n)`. The single-line `rg -c` prints 0 for it.
- **Fix:** Kept Prettier's format (`lint` runs `prettier --check`). The criterion holds with multiline matching: `rg -Uc 'parseTestFlags\(\s*window\.location\.search,\s*__WEGOLITE_TRAFFIC_DEFAULT__,?\s*\)' src/app/session/start-session.ts` prints 1. The only later mention of the pattern is prose in 12-08-PLAN.md (a context line, not a gate).
- **Files modified:** none beyond the plan's list
- **Commit:** 1ef2a21

**2. CHANGELOG.md not touched.** The change is build tooling, tests and contributor documentation with no user-visible behaviour (production behaviour is unchanged), which AGENTS.md lets a changelog omit.

**Total deviations:** 1 cosmetic (acceptance regex vs Prettier), no behaviour deviations. **Impact:** none.

## Known Stubs

None.

## Threat Flags

None. The only new surface is a build define and an npm script; no endpoint, auth path or file-access pattern was added (T-12-06, T-12-07 and T-12-08 are mitigated as planned; T-12-SC accepted, no package installed).

## Next Phase Readiness

Plan 12-08 can wire the populator into the session: a plain session in the e2e, e2e-cross, verify and verify-full bundles has no NPC traffic, so budget.spec.ts and the plain specs run unchanged. Plain browser specs no longer exercise the shipped traffic default; plans 12-09 (Vitest traffic variants) and 12-12 (opt-in traffic spec, including the traffic-on cold start) cover it.

## Self-Check: PASSED

- Created file present: vite.e2e.config.ts.
- Commits `4ebb62e`, `1ef2a21` and `c02639c` are ancestors of HEAD; `git rev-list --count d5c1386..HEAD` is 3 at SUMMARY time (matches `commits: 3`).
- No tracked-file deletions in the three task commits.
