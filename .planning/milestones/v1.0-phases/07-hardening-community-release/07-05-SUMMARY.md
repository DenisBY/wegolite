---
phase: 07-hardening-community-release
plan: 05
subsystem: testing
tags: [playwright, performance, draw-calls, triangles, indexeddb-fixtures, reference-desktop, qual-01]

requires:
  - phase: 07-hardening-community-release
    provides: "07-CONTEXT.md D-10 to D-14 and the reference-machine open item (line 67)"
provides:
  - "Per-scene draw-call (<= 50) and triangle (<= 250 000) budget gate in five container scenes across two systems (Lave, Diso)"
  - "IndexedDB save fixtures (dockedSaveAt, inFlightSaveAt) encoded by the production encodeSave"
  - "First-load bytes regression ceiling (21 MiB, measured 20 996 848 bytes)"
  - "docs/PERFORMANCE.md: budget, container counts, load size, reference-desktop protocol, owner-measured Firefox and Chrome results"
affects: [07-11]

actuals:
  tokens: 6287
  tasks: 3
  commits: 6
  plan_head_before: 80e58eedb02a6e1abdd3befe493f6c5cffce1281
  plan_head_after: d73ba018aa03640a89f9633f5d7735b963830f73

tech-stack:
  added: []
  patterns:
    - "Budget gates assert deterministic renderer counters, never wall-clock frame times (research Pitfall 1)"
    - "Save fixtures go through the production encoder and the strict boot reader; no in-page test hook"

key-files:
  created:
    - tests/e2e/budget.spec.ts
    - tests/e2e/helpers/save-fixtures.ts
    - docs/PERFORMANCE.md
  modified: []

key-decisions:
  - "Draw-call and triangle budgets are the STACK.md research targets (50 calls, 250 000 triangles per frame), inclusive, with a zero-count vacuity guard"
  - "First-load bytes ceiling is the measured cold-start transfer rounded up to the next MiB (21 MiB); it is a regression ceiling, not a load budget (D-14)"
  - "The entry chunk (311 972 bytes gzip level 9, above the STACK.md 250 KB target) is recorded, not gated or fixed (D-14)"
  - "The reference-desktop pass criterion (p95 <= 17.5 ms and p99 <= 33.3 ms, per scenario and browser) was confirmed by the owner on 2026-11-08"
  - "Preliminary runs at 175 % display scaling (DPR 1.7647) are recorded as not official and do not fill the Results rows"

patterns-established:
  - "Budget scenes assert the live mode and systemId before reading counters, so a scene cannot pass by reading another scene"
  - "Owner-measured frame-time numbers are transcribed verbatim; the executor computes and rounds nothing"

requirements-completed: [QUAL-01]

coverage:
  - id: D1
    description: "Lave docked, launching and in-flight scenes gated at <= 50 draw calls and <= 250 000 triangles"
    requirement: "QUAL-01"
    verification:
      - kind: e2e
        ref: "tests/e2e/budget.spec.ts#Lave docked, launching and in-flight scenes stay within the draw-call and triangle budget"
        status: pass
    human_judgment: false
  - id: D2
    description: "Diso docked and in-flight scenes, reached through a production-encoded IndexedDB save fixture, gated at the same budget with a systemId check"
    requirement: "QUAL-01"
    verification:
      - kind: e2e
        ref: "tests/e2e/budget.spec.ts#a second system's docked and in-flight scenes stay within the budget"
        status: pass
    human_judgment: false
  - id: D3
    description: "Cold-start transfer to the first in-flight frame held under the 21 MiB regression ceiling"
    requirement: "QUAL-01"
    verification:
      - kind: e2e
        ref: "tests/e2e/budget.spec.ts#a cold start to the first in-flight frame stays under the first-load bytes ceiling"
        status: pass
    human_judgment: false
  - id: D4
    description: "docs/PERFORMANCE.md budget table, container counts, load size and reference-desktop protocol written down"
    requirement: "QUAL-01"
    verification: []
    human_judgment: true
    rationale: "Documentation content is not asserted by any test; only Prettier and ESLint check it. A reviewer must confirm the numbers match the annotations and the protocol"
  - id: D5
    description: "Owner-measured Firefox and Chrome frame-interval distributions at 100 % scaling and DPR 1, transcribed verbatim into docs/PERFORMANCE.md, with the owner's criterion confirmation"
    requirement: "QUAL-01"
    verification: []
    human_judgment: true
    rationale: "Frame times are measured on the owner's hardware, outside the container; no automated check can reproduce them. The owner confirmed the criterion and the runs are the only frame-rate evidence"

duration: 113min
completed: 2026-11-08
status: complete
---

# Phase 7 Plan 05: Frame budget gate, save fixtures, and the owner's reference-desktop record

**Draw-call and triangle budget gated in five container scenes across Lave and Diso, a 21 MiB first-load ceiling, and the owner's Firefox and Chrome frame-interval record at 100 % scaling and DPR 1 with the criterion confirmed by the owner**

## Performance

- **Duration:** about 113 min (first plan commit 09:30 to close-out commit 11:24 local; the start of this run was not timed)
- **Started:** 2026-11-08T08:30:55Z (first plan commit, 09:30:55 +01:00)
- **Completed:** 2026-11-08T10:24:02Z (close-out commit, 11:24:02 +01:00)
- **Tasks:** 3 (2 automated, 1 owner checkpoint resolved by the owner's reply)
- **Files modified:** 3 (all created by this plan)

## Accomplishments

- A per-scene budget spec asserts at most 50 draw calls and at most 250 000 triangles per rendered frame, inclusive, with a vacuity guard that fails a scene reporting zero calls or triangles. It never asserts a wall-clock frame time.
- Lave docked, launching and in-flight, and Diso docked and in-flight (reached through a `dockedSaveAt` fixture encoded by the production `encodeSave` and read by the unchanged boot validator) all pass the budget in the container. Three budget tests pass.
- A cold-start first-load transfer to the first in-flight frame was measured at 20 996 848 bytes and is held under a 21 MiB ceiling. The entry chunk is 1 582 446 bytes raw and 311 972 bytes gzip at level 9, which is over the STACK.md 250 KB target. That is recorded and not gated (D-14).
- The reference-desktop protocol (sampler, scenarios, pass criterion, D-13 rule) is written into `docs/PERFORMANCE.md`. The owner ran it in Firefox and Chrome and replied `recorded`. All eight rows are transcribed verbatim, and the owner confirmed the criterion.
- Preliminary runs at 175 % display scaling were recorded in a separate subsection marked "not official". They do not fill the Results rows.

## Task Commits

1. **Task 1: End-to-end budget gate, Lave scenes, budget written down** - `ae2f980` (test)
2. **Task 2: Diso scenes through a save fixture, first-load ceiling, reference-desktop protocol, preview started** - `6b37965` (test)
3. **Task 3: Owner's reference-desktop record (checkpoint, resolved by the owner's reply)**
   - Preliminary runs at 175 % scaling, recorded as not official - `6453a17` (docs)
   - Firefox 159.0.1 results (partial) - `c8e27d7` (docs)
   - Chrome 157.0.8103.39 results (criterion unconfirmed) - `efdf8ba` (docs)
   - Owner's confirmed criterion, close-out of the run - `d73ba01` (docs)

The plan-metadata commit (this SUMMARY, STATE.md and ROADMAP.md) is the commit that follows and is not listed here, because its hash is not known while this file is written.

## Owner's reply (quoted as given)

The owner's reply to the Task 3 checkpoint, as relayed:

> `recorded`

The coordinator also relayed that the owner confirmed the criterion (p95 at or below 17.5 ms and p99 at or below 33.3 ms, per scenario and browser), that the owner states performance is not the priority right now and functionality is, and that the owner skipped the cold-start Load time.

## Results (owner-measured, 100 % display scaling, DPR 1)

Pass is against the owner-confirmed criterion (p95 at or below 17.5 ms and p99 at or below 33.3 ms). The max column is recorded as given and is not part of the criterion.

| Scenario           | Browser | Count | p50 (ms) | p95 (ms) | p99 (ms) | max (ms) | Share above 16.7 ms | Share above 33.3 ms | Pass |
| ------------------ | ------- | ----- | -------- | -------- | -------- | -------- | ------------------- | ------------------- | ---- |
| Lave docked        | Chrome  | 1800  | 16.70    | 16.80    | 16.80    | 18.20    | 21.61 %             | 0 %                 | pass |
| Lave docked        | Firefox | 1800  | 16.66    | 16.68    | 16.68    | 16.68    | 0 %                 | 0 %                 | pass |
| Launch sequence    | Chrome  | 1795  | 16.70    | 16.80    | 16.80    | 66.50    | 40.11 %             | 0.11 %              | pass |
| Launch sequence    | Firefox | 1798  | 16.66    | 16.68    | 16.68    | 50.00    | 0.11 %              | 0.11 %              | pass |
| Lave in flight     | Chrome  | 1800  | 16.70    | 16.80    | 16.80    | 18.10    | 39.28 %             | 0 %                 | pass |
| Lave in flight     | Firefox | 1790  | 16.66    | 16.68    | 16.68    | 183.32   | 0.06 %              | 0.06 %              | pass |
| Hyperspace arrival | Chrome  | 1800  | 16.70    | 16.80    | 16.80    | 16.90    | 50.89 %             | 0 %                 | pass |
| Hyperspace arrival | Firefox | 1798  | 16.66    | 16.68    | 16.68    | 33.34    | 0.11 %              | 0.11 %              | pass |

Simulation-rate shares below 24 fps (frames slower than 41.7 ms): Firefox 0.00 %, 0.06 %, 0.06 % and 0.00 %; Chrome 0.00 %, 0.11 %, 0.00 % and 0.00 %, for Lave docked, Launch sequence, Lave in flight and Hyperspace arrival in that order.

Chrome's share of frames above 16.7 ms is 21 to 51 % while p50 is 16.70 ms and p95 is 16.80 ms. The criterion does not gate on the 16.7 ms share, so those rows pass, but the owner has not decided whether that share is acceptable. Firefox's share above 16.7 ms is 0 to 0.11 %.

## Machine and environment

- **Machine:** the owner's reference desktop (`07-CONTEXT.md` line 67). CPU Intel Core i5-13400F 2.50 GHz; RAM 32 GB; GPU NVIDIA GeForce RTX 4060 8 GB, driver 32.0.16.1088; OS Windows 10 Pro 22H2, build 19045.6466; display 3840x2160 at 60 Hz (monitor refresh 60 Hz).
- **Browsers:** Firefox 159.0.1 (owner-confirmed for the four Firefox readings). Chrome 157.0.8103.39, taken from the owner's machine record in `07-CONTEXT.md` and not separately verified in this run.
- **Display:** 100 % OS scaling and `devicePixelRatio` 1, per the owner. Launch sequence was sampled with start delay 0 in both browsers.
- **Serving:** the preview was served from Docker on an Intel N150 host over the LAN, as the owner confirmed for this setup. The location is not otherwise recorded. The preview this executor started on its own Docker host was stopped at close-out.
- **First load:** the cold-start Load time (DevTools Network, cache disabled) was not supplied. The owner skipped it. The First load field is left empty in `docs/PERFORMANCE.md`, and the document says so.

## Decisions Made

- The budget constants are the STACK.md research targets: at most 50 draw calls and at most 250 000 triangles per frame, inclusive, with zero counts failing. The planet noise budget `BUDGET_CEILING = 9` is unchanged (D-12).
- The first-load ceiling is 21 MiB, the measured 20 996 848 bytes rounded up to the next MiB. It is a regression ceiling and not a load budget (D-14).
- The entry chunk is recorded at 311 972 bytes gzip (level 9), over the STACK.md 250 KB target, and is not gated or fixed (D-14).
- The owner-confirmed criterion is p95 at or below 17.5 ms and p99 at or below 33.3 ms, per scenario and browser. The criterion was not changed by the executor.
- Preliminary runs at 175 % scaling are informational and not official. They do not fill the Results rows.
- No look change was made. Antialiasing, the 2x pixel-ratio cap, the resolution and the planet shader are unchanged (D-12, D-13).

## Deviations from Plan

**1. [Rule 1 - Bug] Browser predicate referenced a module-level constant**
- **Found during:** Task 1 (budget spec first run)
- **Issue:** the `waitForFunction` predicate read `SETTLE_FRAMES`, which is not defined in the browser context, so the first run failed with `ReferenceError`.
- **Fix:** the settle count is passed to the predicate as an argument (`{ since, frames }`).
- **Files modified:** `tests/e2e/budget.spec.ts`
- **Verification:** the Task 1 spec passes against a fresh build, and its annotations give the scene counts.
- **Committed in:** `ae2f980`

Two wording changes were made without any code change: the `?test=1` text was removed from a fixture comment so the plan's acceptance grep passes, and the Prettier reformat of the new files. Neither is a deviation in behaviour.

The measure-then-set step for `FIRST_LOAD_BYTES_CEILING` was prescribed by the plan (a placeholder run, then the measured value), so it is not a deviation.

**Total deviations:** 1 auto-fixed (1 bug, Rule 1).
**Impact on plan:** none on scope. The fix was needed to make the budget spec run at all.

## Issues Encountered

- **Shared checkout:** other sessions committed to this checkout while the plan ran (07-08 and 07-12 commits) and left uncommitted changes in `package.json`, `package-lock.json`, `vitest.config.ts`, `tests/contract/container-contract.test.ts` and `tests/guards/content-boundary.test.ts`. None of those were touched or committed by this plan.
- **Transient lint failure:** one lint run failed with an ESLint `ENOENT` on a `tools/oolite-ingest/__purity_*_probe.ts` file. A guard test in another running `test` container creates and removes that file in the same tree. Lint passed (exit 0) once that run finished. The failure was not caused by this plan's changes.
- **Ledger count:** `git rev-list --count 80e58ee..HEAD` returns 16, but 10 of those commits belong to other plans (07-08, 07-12). The plan's own commits, counted by subject, are 6. The `commits:` field uses 6.
- **Unused export:** `inFlightSaveAt` is exported and tested only indirectly. No spec in this plan uses it. The plan's artifact list requires it, so it was kept; it is a candidate for removal or use in a later plan.
- **Client area not confirmed:** the owner confirmed 100 % scaling and DPR 1, but the relayed data does not state that the client area was 1920x1080, which the protocol requires. A verifier should confirm that before treating the Results as the official 1920x1080 record.

## Known Stubs

None. The `inFlightSaveAt` note above is an unused helper, not a stub.

## Threat Flags

None. The plan adds no network endpoints, auth paths or trust-boundary changes.

## Next Phase Readiness

- Plan 07-11 depends on this plan. Its Task 2 records the D-10 to D-14 Key Decisions in `PROJECT.md`; this plan did not write those rows.
- The 16.7 ms share in Chrome (21 to 51 %) and the unconfirmed 1920x1080 client area are open items for the owner or verifier, as noted above. They do not block the close-out.
- QUAL-01 is marked complete per this plan's frontmatter, on the owner-confirmed criterion. A verifier should judge whether the Chrome 16.7 ms share is compatible with QUAL-01's "60 fps at 1080p" wording.

---
*Phase: 07-hardening-community-release*
*Completed: 2026-11-08*

## Self-Check: PASSED

Files present: `tests/e2e/budget.spec.ts`, `tests/e2e/helpers/save-fixtures.ts`, `docs/PERFORMANCE.md`, this SUMMARY. Commits present: `ae2f980`, `6b37965`, `6453a17`, `c8e27d7`, `efdf8ba`, `d73ba01`. Plan-attributable commit count: 6.
