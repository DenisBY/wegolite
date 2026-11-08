---
phase: 07-hardening-community-release
plan: 08
subsystem: testing
tags: [playwright, e2e, indexeddb, network-guard, console-guard, qual-03, qual-08]

# Dependency graph
requires:
  - phase: 06-hyperspace-navigation-persistence
    provides: arrival autosave, in-flight save restore and the trigger-matrix dock fixture that the journey reuses
  - phase: 07-hardening-community-release
    provides: plan 07-01 same-origin CSP and data: favicon, so the journey sees no off-origin request
provides:
  - tests/e2e/helpers/guards.ts: context-wide network guard, page console guard, exact engine-warning allowlist and expectCleanRun
  - tests/e2e/core-loop.spec.ts: one journey from new game through trade, launch, hyperspace, dock, sale, manual save and an exact restore, under both guards
affects:
  - 07-09 (same journey on a slower engine via WEGOLITE_E2E_WAIT_SCALE)
  - 07-11 (PROJECT.md record of D-17, and the second declarer of QUAL-08)

# Actuals (#2632) — chars/4 over the two files this plan changed; plan estimate was 90000
actuals:
  tokens: 5204
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Context-wide request guard: page.context() 'request' listener records every off-origin or non-GET request, including across reloads"
    - "Warnings allowed only by exact anchored RegExp with the emitting source named; any warning containing 'Wegolite' or 'THREE.' is refused even if a pattern matches"
    - "Every journey wait is multiplied by one WEGOLITE_E2E_WAIT_SCALE factor (default 1), fail-closed on a non-numeric or non-positive value"

key-files:
  created:
    - tests/e2e/helpers/guards.ts
    - tests/e2e/core-loop.spec.ts
  modified: []

key-decisions:
  - "The journey never enables the in-page test hook; each save-relevant step waits for a committed revision, and the only fixture is the game's own arrival blob rewritten at the Diso dock mouth (D-21)."
  - "The Chromium GL driver's ReadPixels stall warning is allowlisted by one exact pattern: it is browser-emitted, carries no Wegolite or THREE text, and no readPixels, getImageData or toDataURL call exists under src/ or tests/e2e/."
  - "Cargo and market rows are compared exactly with no normalisation: setCargo removes zero-quantity keys in the live state and the save validator rejects zero quantities, so both sides agree on an empty hold after the sale."
  - "The journey uses a local scaled waitReady rather than helpers/probe.ts waitForReady, which has a fixed 20 s bound; probe.ts is outside this plan's files_modified."
  - "The dock step asserts the docked state equals the arrival state (system, credits, cargo, market), an extra check beyond the plan's list, because the dock must not change the economy."

patterns-established:
  - "Guard helper pattern: attach watchNetwork(page.context(), baseURL) and watchConsole(page) before goto, and call expectCleanRun as the last statement of the journey."

requirements-completed: [QUAL-03, QUAL-08]

coverage:
  - id: D1
    description: "Guard helper: context-wide network guard (origin and GET), console error and warning capture, exact engine-warning allowlist and expectCleanRun"
    requirement: "QUAL-08"
    verification:
      - kind: e2e
        ref: "tests/e2e/core-loop.spec.ts#new game to launch to trade to hyperspace to dock to save and reload"
        status: pass
    human_judgment: false
  - id: D2
    description: "First leg on the shipped build: new game, Food purchase at Lave, Diso target on the long-range chart, launch, with zero offences"
    requirement: "QUAL-03"
    verification:
      - kind: e2e
        ref: "tests/e2e/core-loop.spec.ts#new game to launch to trade to hyperspace to dock to save and reload"
        status: pass
    human_judgment: false
  - id: D3
    description: "Hyperspace to Diso, dock through the arrival-blob fixture, and sell one tonne of Food at Diso, with a committed write at each save-relevant step"
    requirement: "QUAL-03"
    verification:
      - kind: e2e
        ref: "tests/e2e/core-loop.spec.ts#new game to launch to trade to hyperspace to dock to save and reload"
        status: pass
    human_judgment: false
  - id: D4
    description: "Manual F2 save, reload and Continue restore the docked Diso system, credits, cargo and every market row exactly as recorded before the save"
    requirement: "QUAL-03"
    verification:
      - kind: e2e
        ref: "tests/e2e/core-loop.spec.ts#new game to launch to trade to hyperspace to dock to save and reload"
        status: pass
    human_judgment: false
  - id: D5
    description: "The journey runs beside the rest of the browser suite under two workers in the e2e container"
    requirement: "QUAL-03"
    verification:
      - kind: e2e
        ref: "command: docker compose run --rm e2e (90 passed)"
        status: pass
    human_judgment: false
  - id: D6
    description: "WEGOLITE_E2E_WAIT_SCALE multiplies every journey wait for a slower engine"
    verification: []
    human_judgment: true
    rationale: "Only the default scale of 1 was exercised here; a run with a larger factor on a slower engine is plan 07-09's to prove."

# Metrics
duration: unrecorded (plan start time was not captured; journey wall time 3.3 min solo, 6.3 min inside the full suite)
completed: 2026-11-08
status: complete
commits: 3
plan_head_before: 6b379653694689313a443c4880a420d453cbc6e8
plan_head_after: d068504ed63c7231061fa4c7589704afab9170db
---

# Phase 7 Plan 08: Core-loop journey under the QUAL-08 guards Summary

**One fresh-context browser journey plays new game, Lave trade, launch, hyperspace to Diso, dock, Diso sale, manual save and an exact reload restore on the shipped build, with zero off-origin or non-GET requests and zero console or page errors.**

## Performance

- **Duration:** unrecorded (start time not captured)
- **Started:** not recorded
- **Completed:** 2026-11-08
- **Tasks:** 3 of 3 completed
- **Files modified:** 2 (both new)

## Accomplishments

- Shared guard helper `tests/e2e/helpers/guards.ts` with a context-wide request guard, a per-page console and page-error guard, an exact anchored engine-warning allowlist, and `expectCleanRun`.
- Journey spec `tests/e2e/core-loop.spec.ts` that completes the whole loop on one Chromium context, with the guards attached before the first navigation and asserted last.
- Save discipline held: no in-page hook query anywhere in the spec, every save-relevant step waited for a committed revision, and the dock used only the game's own arrival blob rewritten at the Diso dock mouth.
- The restored docked state after a manual save and reload equals the state recorded just before the save, exactly.
- Full browser suite green with the journey beside the other specs under two workers (90 passed).

## Task Commits

Each task was committed atomically:

1. **Task 1: End-to-end first leg under both guards** - `64ecf8b` (test)
2. **Task 2: Hyperspace to Diso, fixture dock and a sale at Diso** - `908c09f` (test)
3. **Task 3: Manual save, reload, Continue and exact restore** - `d068504` (test)

**Plan metadata:** recorded in the `docs(07-08)` commit that follows this SUMMARY (its hash is in `git log`, not repeated here).

_Tracer gate:_ Task 1 is `type="tracer"`. Auto mode was active (`workflow.auto_advance: true`), so the gate re-ran the tracer `<verify>` end to end, which passed, and the executor logged `⚡ Tracer verified end-to-end — expanding` before Task 2.

## Files Created/Modified

- `tests/e2e/helpers/guards.ts` - `NetworkOffence`, `watchNetwork(context, baseURL)`, `ConsoleProblems`, `watchConsole(page)`, `ENGINE_WARNING_ALLOWLIST`, `expectCleanRun(network, consoleProblems)`
- `tests/e2e/core-loop.spec.ts` - `WAIT_SCALE` from `WEGOLITE_E2E_WAIT_SCALE`, the journey test, and its local helpers (copied from the existing specs, since a spec never imports another spec)

## Decisions Made

- The journey buys Food at Lave and sells it at Diso, because trading needs the docked station. Both trades are real `save.committed` writes.
- The engine-warning allowlist holds one exact pattern, described below. It is the only allowlisted entry; no error or page error is ever allowlisted.
- `waitReady` is a local copy with a scaled 20 s bound. The shared `waitForReady` is fixed at 20 s, and `helpers/probe.ts` was not in this plan's file set.
- Market and cargo are compared exactly, without normalisation (see key-decisions above).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Lint error `no-useless-assignment` in `watchNetwork`**
- **Found during:** Task 1 verification (lint gate, after the first run)
- **Issue:** `sameOrigin` was initialised to `false` and then always assigned inside the `try`, so the initial value was dead code.
- **Fix:** declared `let sameOrigin: boolean;` and kept the `catch` assignment, which still fails closed.
- **Files modified:** `tests/e2e/helpers/guards.ts`
- **Verification:** `docker compose run --rm lint` exits 0 after the change.
- **Committed in:** `64ecf8b` (Task 1)

**Total deviations:** 1 auto-fixed (1 bug, lint). **Impact:** no change to what the guards assert.

## Engine warning allowlisted (planned contingency)

The first Task 1 run failed on the console-warning guard, which is the guard working as designed. Chromium's GL driver layer reported four warnings of the same kind (the last one with the "no longer repeat" suffix):

```
[.WebGL-0x1994001c8800]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels (http://127.0.0.1:4173/)
```

- **Source:** the browser's WebGL driver layer (ANGLE on SwiftShader in the headless e2e image). The reporting location is the page.
- **Why it is not Wegolite or THREE:** the text names neither, and the driver emits it, so the allowlist rule permits it.
- **Checked against our code:** no `readPixels`, `getImageData` or `toDataURL` call exists under `src/` or `tests/e2e/`. The stall is therefore the browser's own readback under software GL. It is not a product fault, but it is a fill-rate symptom consistent with the known SwiftShader cost recorded in PROJECT.md.
- **Pattern:** one exact anchored `RegExp` in `ENGINE_WARNING_ALLOWLIST`, which pins the hex context id and the origin `http://127.0.0.1:4173`. The no-longer-repeat variant is matched too.

## Issues Encountered

- **Ledger written after the first commit.** The plan-head ledger `gsd-plan-head-before-07-08` in `.git` was not written before the first task commit. It was written afterwards from the first commit's parent, `6b37965`, which is the HEAD recorded at session start. The measured commit count of 3 is therefore derived from that parent, not captured before the commit.
- **Start time not captured.** `PLAN_START_TIME` was not recorded, so `duration` is unrecorded.
- **Codebase-memory tools were not in this executor's tool set.** Code lookups used `rg` and direct file reads for the spec, helpers and `src/` symbols. Each lookup was checked against the file it cited.
- **`QUAL-08` is shared with plan 07-11.** The shared-ID gate in `update_requirements` decides whether `QUAL-08` may read `Complete` before 07-11 has a SUMMARY; see the state update below.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 07-09 can run this same journey on a slower engine by setting `WEGOLITE_E2E_WAIT_SCALE` through `docker compose run --rm -e WEGOLITE_E2E_WAIT_SCALE=<n> e2e`. The default in `verify` is 1. The compose file does not forward the variable by itself.
- Plan 07-11 records D-17 in PROJECT.md. The network guard here implements D-17 as written: origin plus GET, with `data:` and `blob:` excluded.
- The 90-test suite is green with this journey included, so no further e2e gap is open from this plan.

## Self-Check: PASSED

Verified after writing this SUMMARY:

- Created files exist: `tests/e2e/helpers/guards.ts`, `tests/e2e/core-loop.spec.ts`.
- Task commits are ancestors of HEAD: `64ecf8b`, `908c09f`, `d068504`.
- Acceptance greps: `export function (watchNetwork|watchConsole|expectCleanRun)` = 3; `test=1` in either file = 0; `WEGOLITE_E2E_WAIT_SCALE` = 4; `#title-continue` = 4 (plan asks at least 2); `writeRaw` = 2; `DOCK_OFFSET` = 2; `expectCleanRun(network, ...)` is the final statement of the test.

---
*Phase: 07-hardening-community-release*
*Completed: 2026-11-08*
