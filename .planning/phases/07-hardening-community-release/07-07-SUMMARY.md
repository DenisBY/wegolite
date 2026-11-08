---
phase: 07-hardening-community-release
plan: 07
subsystem: testing
tags: [playwright, vite, test-seam, hyperspace, failure-injection, wr-04, qual-05]

requires:
  - phase: 06-hyperspace-navigation-persistence
    provides: committed-jump arrival build (G-7 ordering) and the failure surface (06-11)
  - phase: 07-hardening-community-release
    provides: inFlightSaveAt fixture (07-05) and the vite config plugin (07-01)
provides:
  - SessionFaults and GameSessionOptions.faults, consumed only in the committed-arrival build
  - Compile-time seam: __WEGOLITE_TEST_SEAMS__ is false in every shipped build and true only in the test-only build
  - Test-only build (vite.seams.config.ts) under node_modules/.wegolite-seams, served on 127.0.0.1:4175
  - Browser negative control for a failed destination build (WR-04), with a save-bytes and origin-state proof
  - Bundle scan proving the shipped JavaScript carries no trigger for the seam, with a positive control
affects:
  - phase 7 verification (QUAL-05 evidence, D-18 safety prohibition)
  - any future failure-injection seam (same single-option, compile-time-switch shape)

actuals:
  tokens: 4295
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Test-only seam: a constructor option plus a Vite define compile-time constant; the shipped build compiles the read out"
    - "Second Playwright webServer serves a test-only Vite build from node_modules/, never dist/"
    - "Kept probe reference across publishFailure, which replaces window.__wegolite"

key-files:
  created:
    - vite.seams.config.ts
    - tests/e2e/hyperspace-failure.spec.ts
  modified:
    - src/app/game-session.ts
    - src/main.ts
    - vite.config.ts
    - playwright.config.ts

key-decisions:
  - "D-18 seam form: an optional GameSessionOptions.faults consumed once, inside the committed-arrival try block between generateMarket and enterSystemById"
  - "readSessionFaults accepts only an object whose own failDestinationBuild is exactly true (T-07-20); it never reads the URL"
  - "The shipped config defines __WEGOLITE_TEST_SEAMS__ as false; the test config defines it as true and writes outside dist/"
  - "The spec mirrors the fault message as a literal rather than importing game-session.ts into the Playwright Node loader"

patterns-established:
  - "Failure-injection seams are compile-time guarded and reachable only from a separate test-only origin"
  - "Browser negative controls for a failed arrival assert origin system, market, fuel, lastJump, flight clock and save bytes"

requirements-completed: [QUAL-05]

coverage:
  - id: D1
    description: "A forced destination-build throw after a committed jump shows the arrival failure surface and publishes a failure probe naming the injected fault"
    requirement: "QUAL-05"
    verification:
      - kind: e2e
        ref: "tests/e2e/hyperspace-failure.spec.ts#a forced destination-build throw after a committed jump stops in the origin system with the save untouched"
        status: pass
    human_judgment: false
  - id: D2
    description: "The failed arrival keeps Lave as the system and market, leaves fuel, committed count and lastJump unchanged, freezes flightTime while the origin scene renders, and writes no save bytes"
    requirement: "QUAL-05"
    verification:
      - kind: e2e
        ref: "tests/e2e/hyperspace-failure.spec.ts#a forced destination-build throw after a committed jump stops in the origin system with the save untouched"
        status: pass
    human_judgment: false
  - id: D3
    description: "The shipped JavaScript bundle contains neither the fault global nor the compile-time constant, with a positive control on the test-only build"
    requirement: "QUAL-05"
    verification:
      - kind: e2e
        ref: "tests/e2e/hyperspace-failure.spec.ts#the shipped bundle contains no fault seam, and the test bundle does (positive control)"
        status: pass
    human_judgment: false
  - id: D4
    description: "The URL-enabled in-page state-mutation hook is unchanged"
    verification:
      - kind: other
        ref: "rg -c 'get(\"test\") === \"1\"' src/app/game-session.ts (prints 1)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Regression: the hyperspace arrival success path still passes with the seam compiled into the test build only"
    requirement: "QUAL-05"
    verification:
      - kind: e2e
        ref: "tests/e2e/hyperspace.spec.ts (3 passed)"
        status: pass
    human_judgment: false

# Metrics
duration: unknown (start timestamp not captured)
completed: 2026-11-08
status: complete
commits: 2
plan_head_before: ac32695
plan_head_after: 5ef9be3
---

# Phase 7 Plan 07: Destination-build fault seam and WR-04 browser negative control

**A test-only destination-build fault, compiled out of every shipped bundle, drives a real browser to prove a failed hyperspace arrival leaves the origin system, market, fuel, jump record, flight clock and save bytes untouched.**

## Performance

- **Duration:** unknown (start timestamp not captured)
- **Started:** not captured
- **Completed:** 2026-11-08
- **Tasks:** 2
- **Files modified:** 6 modified, 2 created

## Accomplishments

- `GameSessionOptions.faults` (`SessionFaults.failDestinationBuild`) throws inside the committed-arrival try block, after the destination market build and before the scene switch, so the existing G-7 failure surface is what runs.
- `src/main.ts` reads the test global only behind `__WEGOLITE_TEST_SEAMS__`; `vite.config.ts` defines it as `"false"`, so every shipped build compiles the read out.
- `vite.seams.config.ts` builds the test-only bundle under `node_modules/.wegolite-seams` (never `dist/`), served by a second Playwright `webServer` on 127.0.0.1:4175.
- A real-browser negative control shows the arrival failure copy, a failure probe naming the injected fault, Lave kept as system and market, unchanged fuel and committed count, `lastJump` still null, frozen `flightTime` while `renders` advances, and unchanged save bytes.
- A bundle scan over `dist/assets/*.js` finds neither the fault global nor the constant, with a vacuity guard and a positive control on the test-only build.

## Task Commits

1. **Task 1: End-to-end fault seam, test build only, forced arrival throw** - `656699e` (feat)
2. **Task 2: Origin-state proof and shipped-bundle scan** - `5ef9be3` (test)

**Plan metadata:** recorded in the docs commit that adds this SUMMARY, STATE.md and ROADMAP.md.

## Files Created/Modified

- `src/app/game-session.ts` - `SessionFaults`, `DESTINATION_BUILD_FAULT_MESSAGE`, `GameSessionOptions.faults`, the guarded throw in `handleHyperspaceJumped`
- `src/main.ts` - `declare const __WEGOLITE_TEST_SEAMS__`, `readSessionFaults(target)`, conditional `faults` option
- `vite.config.ts` - `define: { __WEGOLITE_TEST_SEAMS__: "false" }`
- `vite.seams.config.ts` (new) - test-only build config, define `"true"`, outDir `node_modules/.wegolite-seams`
- `playwright.config.ts` - `webServer` array with the 4175 test-build server (4173 entry unchanged)
- `tests/e2e/hyperspace-failure.spec.ts` (new) - the WR-04 negative control and the bundle scan

## Decisions Made

- The seam is one optional constructor option read once at session creation and consumed only inside the committed-arrival `try`, after `generateMarket` and before `enterSystemById`. Nothing else in the arrival path changed.
- `readSessionFaults` accepts only an object whose own `failDestinationBuild` is exactly `true` (T-07-20). It never touches the URL (`rg URLSearchParams src/main.ts` prints nothing).
- The spec holds its own copy of the fault message string rather than importing `game-session.ts`, which the Playwright Node loader is not set up to evaluate. This was a judgement call and was not separately tested.

## Verification Run (Docker only)

| Command | Result |
| --- | --- |
| `docker compose run --rm typecheck` (after Task 1) | pass (exit 0) |
| `docker compose run --rm lint` (after Task 1) | pass (exit 0) |
| `docker compose run --rm e2e sh -lc "npm run build && npx playwright test tests/e2e/hyperspace-failure.spec.ts"` (after Task 1) | pass, 1 passed (43.2 s) |
| `docker compose run --rm typecheck` (after Task 2) | pass (exit 0) |
| `docker compose run --rm lint` (after Task 2) | pass (exit 0) |
| `docker compose run --rm e2e sh -lc "npm run build && npx playwright test tests/e2e/hyperspace-failure.spec.ts"` (after Task 2) | pass, 2 passed (29.9 s) |
| `docker compose run --rm e2e sh -lc "npm run build && npx playwright test tests/e2e/hyperspace.spec.ts"` (regression) | pass, 3 passed (4.5 min) |

Acceptance greps (host working tree, after Task 2):

- `rg -c "faults\?: SessionFaults" src/app/game-session.ts` = 1
- `__WEGOLITE_TEST_SEAMS__` present in `vite.config.ts` (1), `vite.seams.config.ts` (2), `src/main.ts` (2)
- `rg -c URLSearchParams src/main.ts` = no match
- `rg -c 'get("test") === "1"' src/app/game-session.ts` = 1 (existing hook unchanged)
- `rg -c 4175 playwright.config.ts` = 2
- `__probeBeforeFault` occurrences in the spec = 5; `.wegolite-seams` in the spec = 1
- `find dist/assets -name '*.js' -exec grep -l __wegoliteFaults {} +` = no match

## Deviations from Plan

### Auto-fixed Issues

None to code. Notes on plan and process points, none of which changed behaviour:

**1. [Process - ledger] The per-plan commit ledger was not written before the first commit**
- **Found during:** SUMMARY write
- **Issue:** the protocol's step 0c ledger file was not created before commit `656699e`.
- **Fix:** the base was reconstructed as `ac32695`, the HEAD before the first plan commit and the parent of `656699e`. No other commit landed in between, so the measured count is exact: `git rev-list --count ac32695..HEAD` = 2.
- **Files modified:** none beyond the plan's
- **Committed in:** `656699e`, `5ef9be3`

**2. [Plan reference drift] Stale line references in the plan's `read_first`**
- **Found during:** Task 1
- **Issue:** the plan cites `game-session.ts` lines 2749-2753 for the URL test hook; it now sits near line 2805. The hook is unchanged (`get("test") === "1"` still matches once).

**Total deviations:** 0 auto-fixed code deviations; 2 process/reference notes above.
**Impact on plan:** none on behaviour or scope.

## Issues Encountered

- **Source maps carry the seam's name as source text (for the verifier).** `vite.config.ts` keeps `build.sourcemap: true`, so `dist/assets/index-*.js.map` contains `__wegoliteFaults` and `__WEGOLITE_TEST_SEAMS__` inside `sourcesContent`. The JavaScript bundle does not. The plan's prohibition says "the shipped bundle", and the scan covers executable `.js`, which matches that wording. The source is public and GPL by design, so the names are visible as source, not as a reachable trigger. If the owner wants the stricter reading (no seam name anywhere in `dist/`), that needs either `sourcemap: false` or a sourcemap scrub, and it is a decision for the owner rather than an executor change.
- **The seam build is not visible from the host.** `node_modules` is a named Docker volume, so `node_modules/.wegolite-seams` exists only inside the container. Host-side greps on that path return nothing; the in-container spec's positive control is the authoritative check.

## User Setup Required

None - no external service configuration required.

## Threat Flags

None. The new surface is the test-only origin on 4175, which is an existing threat-model boundary (T-07-18, T-07-19, T-07-20), not a new one.

## Next Phase Readiness

- WR-04 browser negative control exists and passes (06-VERIFICATION deferred item closed by test-seam work).
- The verifier should read the source-map residual above before marking the plan's D-18 prohibition (`status: unverified`, `flagged: true` in the plan's `must_haves`), which this run did not change.
- No blockers for the next plans in wave 2 from this plan.

---
*Phase: 07-hardening-community-release*
*Completed: 2026-11-08*

## Self-Check: PASSED
