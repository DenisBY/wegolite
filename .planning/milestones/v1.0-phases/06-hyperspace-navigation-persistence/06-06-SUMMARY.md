---
phase: 06-hyperspace-navigation-persistence
plan: 06
subsystem: testing
tags: [e2e, playwright, save-fidelity, autosave, indexeddb, market-snapshot, phase-gate]

requires:
  - phase: 06-hyperspace-navigation-persistence
    provides: plan 06-04's arrival autosave, in-flight restore, deterministic target and HUD clock line
  - phase: 06-hyperspace-navigation-persistence
    provides: plan 06-05's F2 Save/Load overlay, manual Save and in-session Load
  - phase: 06-hyperspace-navigation-persistence
    provides: plan 06-02's v2 parse/migrate/validate pipeline and snapshot restore
provides:
  - the shared raw IndexedDB read/write helper for fidelity proofs
  - reload-after-arrival market, target and pose fidelity with a second-reload no-reroll proof
  - in-session Load market fidelity and reload-after-Load byte preservation
  - the five-trigger autosave matrix with no-write countdown and mid-flight windows
  - browser proof that v3 future blobs stay byte-identical (including manual Save) and corrupt v2 blobs are backed up
  - the recorded PROJECT.md phase decisions and a green container gate
affects: [verify-work 06, phase 6 close-out, future combat/persistence work]

actuals:
  tokens: 7856
  tasks: 3
  commits: 4
  plan_head_before: 060ee2d238b9a5ac98bae4b90f9be0f5266adadd
  plan_head_after: f94cdfa50f756523fae2897bafe40fc045799645

tech-stack:
  added: []
  patterns:
    - Raw IndexedDB seam shared by browser fidelity proofs, never a parsed or re-encoded value
    - Exact restored-pose comparison against the persisted blob; live pose bounded by speed × elapsed simulated time
    - Trigger-matrix assertions based on committed revisions, not queued writes
    - Future-version byte identity asserted after every reachable trigger

key-files:
  created:
    - tests/e2e/helpers/save-store.ts
  modified:
    - tests/e2e/hyperspace.spec.ts
    - tests/e2e/save-load.spec.ts
    - tests/e2e/autosave.spec.ts
    - tests/e2e/station.spec.ts
    - tests/e2e/docking.spec.ts
    - src/persistence/autosave.ts
    - .planning/PROJECT.md

key-decisions:
  - "The raw autosave blob is the only stable pose comparison after an arrival; the installed restore pose is compared to it within 1e-9, while the resumed live pose is bounded by speed × elapsed simulated time rather than a fixed distance."
  - "The trigger matrix runs trade, manual Save, pre-launch and arrival in one session, then proves the dock row through a fresh page and a real dock event; no countdown or ordinary-flight frame writes."
  - "A v3 future blob is asserted byte-identical after boot, trade, manual Save and launch, with no autosave.corrupt backup."
  - "The Phase 5→6 docking-computer blocker is re-scoped: Lave→Leesti reaches raw TL 10, but the dedicated browser purchase click remains outside this plan's file set."

requirements-completed: [NAV-01, NAV-02, NAV-03, NAV-04, NAV-05, NAV-06, SAVE-01, SAVE-02, SAVE-03, SAVE-04, SAVE-05, SAVE-06, WORLD-06]

coverage:
  - id: D1
    description: "Reload after a hyperspace arrival restores the same system, 17-good market, committed target and the exact installed pose from the raw autosave blob; a second reload repeats every value."
    requirement: "SAVE-06"
    verification:
      - kind: e2e
        ref: "tests/e2e/hyperspace.spec.ts#chart target, countdown, abort, refusal, arrival and reload"
        status: pass
    human_judgment: false
  - id: D2
    description: "An in-session Load restores the persisted market verbatim, and a page reload after the Load returns the same market from the untouched bytes."
    requirement: "SAVE-01"
    verification:
      - kind: e2e
        ref: "tests/e2e/save-load.spec.ts#an in-session Load restores the saved docked session without reloading"
        status: pass
      - kind: e2e
        ref: "tests/e2e/save-load.spec.ts#an in-session Load of an in-flight save returns to flight with the station hidden"
        status: pass
    human_judgment: false
  - id: D3
    description: "The five autosave triggers (dock, pre-launch, arrival, accepted trade, manual Save) each commit exactly one revision; ordinary flight and an active countdown write nothing."
    requirement: "SAVE-05"
    verification:
      - kind: e2e
        ref: "tests/e2e/autosave.spec.ts#the autosave trigger matrix writes exactly one revision per trigger and never mid-flight"
        status: pass
    human_judgment: false
  - id: D4
    description: "A v3 future blob stays byte-identical after boot, trade, manual Save and launch (no corrupt backup); an oversized v3 blob is still future; a corrupt v2 market snapshot is backed up before any clear."
    requirement: "SAVE-04"
    verification:
      - kind: e2e
        ref: "tests/e2e/autosave.spec.ts#a future-version blob is never cleared or replaced"
        status: pass
      - kind: e2e
        ref: "tests/e2e/autosave.spec.ts#an oversized future-version blob is still recognised and untouched"
        status: pass
      - kind: e2e
        ref: "tests/e2e/autosave.spec.ts#a v2 blob with an unknown market good is corrupt and backed up"
        status: pass
    human_judgment: false
  - id: D5
    description: "A launch reloads to the docked station at the pre-launch clock, never the +600 s launch clock."
    requirement: "SAVE-03"
    verification:
      - kind: e2e
        ref: "tests/e2e/autosave.spec.ts#a launch reloads to the station at the pre-launch clock, not +600 s"
        status: pass
      - kind: e2e
        ref: "tests/e2e/autosave.spec.ts#a pre-launch write offers Continue at exactly the docked clock"
        status: pass
    human_judgment: false
  - id: D6
    description: "PROJECT.md records the phase decisions, marks the Phase 4 +600 s row superseded and re-scopes the TL 9 browser blocker; the full container gate is green."
    requirement: "WORLD-06"
    verification:
      - kind: other
        ref: "docker compose run --rm verify"
        status: pass
    human_judgment: true
    rationale: "The decision text, supersession marker and blocker re-scope need a human reader; the automated gate only proves the code is green."

duration: 75min
completed: 2026-11-06
status: complete
---

# Phase 6 Plan 6: Hyperspace, Navigation & Persistence Summary

**Reload-after-arrival and in-session Load reproduce every market price, target and pose from the persisted blob, with a five-trigger autosave matrix and future/corrupt safety proven in the browser.**

## Performance

- **Duration:** 75 min (implementation + three full container gates)
- **Started:** 2026-11-06T21:03Z (after the wave-4 tracking commit)
- **Completed:** 2026-11-06T21:20Z (final commit)
- **Tasks:** 3
- **Files modified:** 8 (7 modified, 1 created)

## Accomplishments

- The arrival autosave is now proved end-to-end: the raw blob's `flight.position`/`orientation`/`speed` is the authoritative pose, `probe.restore` matches it within 1e-9, the 17-good market and target match before/after reload, and a second reload repeats every value.
- In-session Load restores the persisted market verifiably, and a reload after Load returns the same snapshot from byte-identical IndexedDB bytes.
- One test drives the five-trigger autosave matrix (trade, manual Save, pre-launch, arrival, dock) and proves no write occurs during ordinary flight or an active countdown.
- The v3 future blob is asserted byte-identical after boot, trade, a manual Save attempt and launch, with no `autosave.corrupt`; the corrupt-v2 market case and oversized-v3 case remain green.
- The full container gate is green: lint, typecheck, content drift, 1,082 unit tests, the production build and 73 Playwright tests.

## Task Commits

Each task was committed atomically:

1. **Task 1: Reload-after-arrival and Load market/pose fidelity** — `0583cfe` (test)
2. **Task 2: Autosave trigger matrix and future/corrupt safety** — `0039559` (test)
3. **Task 3a: Refresh stale phase-6 e2e expectations** — `bd81f61` (fix)
4. **Task 3b: Record phase 6 decisions in PROJECT.md** — `f94cdfa` (docs)

_Note: Task 3 was split into a phase-gate fix commit and a decision-record commit so the stale-expectation repair is reviewable on its own._

## Files Created/Modified

- `tests/e2e/helpers/save-store.ts` — shared raw IndexedDB `readRaw`/`writeRaw` seam.
- `tests/e2e/hyperspace.spec.ts` — raw-blob pose comparison, market/target equality, second-reload no-reroll proof.
- `tests/e2e/save-load.spec.ts` — in-session Load market equality, reload-after-Load byte preservation, shared helper.
- `tests/e2e/autosave.spec.ts` — trigger matrix, no-write windows, manual-Save future check, shared helper.
- `tests/e2e/station.spec.ts` — refreshed economy key set, scoped footer locator and snapshot stock expectations.
- `tests/e2e/docking.spec.ts` — docked-event autosave attempt expectation for the tainted computer-dock case.
- `src/persistence/autosave.ts` — corrected the stale pre/post-`beginLaunch` docstring.
- `.planning/PROJECT.md` — nine Phase 6 decision rows, the Phase 4 launch-clock supersession marker and the TL 9 blocker re-scope.

## Decisions Made

- The persisted raw blob is the only stable comparison for the restored pose; the live pose after reload is bounded by `speed × elapsed simulated seconds` because the resumed loop advances.
- The trigger matrix proves four triggers in one session and the dock row in a fresh page after a real dock event, avoiding a second jump while still asserting exactly one revision per trigger.
- The Phase 5→6 docking-computer browser proof is re-scoped, not claimed: the route now reaches Leesti (raw TL 10), but the dedicated purchase click was not added here.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical] Repaired three stale `station.spec.ts` expectations from earlier Phase 6 plans**
- **Found during:** Task 3 phase gate (the user identified them before execution)
- **Issue:** (a) the exact economy probe key set omitted `marketSystemId` added by 06-04; (b) `page.locator(".station-footer")` became a strict-mode violation once the chart and save-load footers existed; (c) the reload/redock stock expectation still assumed seed regeneration (16 t) instead of the persisted snapshot (15 t).
- **Fix:** added `marketSystemId` to the key list, scoped the footer geometry check to `#docked .station-footer`, and asserted the snapshot's 15 t after reload and redock. No assertion was weakened or skipped.
- **Files modified:** `tests/e2e/station.spec.ts`
- **Verification:** `npx playwright test tests/e2e/station.spec.ts` — 10 passed (2.1 min); full gate green.
- **Committed in:** `bd81f61`

**2. [Rule 2 - Missing critical] Updated the stale computer-dock autosave expectation**
- **Found during:** first full `verify` run (72 passed, 1 failed)
- **Issue:** `docking.spec.ts` expected `save.attempts === 1` because Phase 4/5 treated only launch/purchase as triggers. Phase 6 D-17 adds the docked event, so the tainted computer dock records a second attempt (launch already wrote once before the test seam tainted the profile).
- **Fix:** expect `attempts === 2`, `writes === 1`, `committed === 1` and `skipReason === "tainted"`; the test now describes the real D-17 contract instead of the retired one.
- **Files modified:** `tests/e2e/docking.spec.ts`
- **Verification:** targeted run 1 passed; full gate 73/73 passed.
- **Committed in:** `bd81f61`

**3. [Rule 1 - Bug] Corrected the autosave module's stale docstring**
- **Found during:** Task 3 decision recording
- **Issue:** the module header still claimed the snapshot was taken after `beginLaunch` and carried the +600 s clock, contradicting D-17 and the new pre-launch anchor.
- **Fix:** rewrote the header to state the snapshot is taken before `beginLaunch` while the state is still docked.
- **Files modified:** `src/persistence/autosave.ts`
- **Verification:** comment-only change; lint and typecheck clean; full gate green.
- **Committed in:** `bd81f61`

**4. [Rule 1 - Bug] Replaced a fixed live-pose distance tolerance with a physics-derived bound**
- **Found during:** second full `verify` run (72 passed, 1 failed)
- **Issue:** the first implementation compared the live pose to the saved pose with a fixed 2,000-unit tolerance; under full-suite CPU contention the resumed loop's probe read was 240,436 units from the blob, though the alone run was exact. The fixed number measured scheduler timing, not save fidelity.
- **Fix:** the live displacement is now asserted against `speed × elapsed simulated seconds` (the only motion a straight resumed loop can produce), with a relative floating-point residual. The exact `probe.restore` comparison against the blob within 1e-9 is unchanged and remains the authoritative proof.
- **Files modified:** `tests/e2e/hyperspace.spec.ts`
- **Verification:** third full gate green; the same test passes alone and under the two-worker suite.
- **Committed in:** `0583cfe` (the final tolerance lives in the Task 1 commit)

---

**Total deviations:** 4 auto-fixed (2 missing-critical test contracts, 1 stale doc bug, 1 flaky-tolerance bug).
**Impact on plan:** No production behaviour changed beyond a comment. All test repairs assert the current intended behaviour; no assertion was weakened or skipped.

## Issues Encountered

- **First full `verify` run:** 72 passed / 1 failed — the stale `docking.spec.ts` trigger count described above. Fixed and re-run.
- **Second full `verify` run:** 72 passed / 1 failed — the hyperspace live-pose fixed tolerance flaked under load. Replaced with the elapsed-time bound; the third full run passed 73/73.
- **Docking-computer TL 9 blocker:** the canonical Lave→Leesti route is 3.6 LY and Leesti is raw TL 10, so the Phase 5→6 precondition is satisfied. The dedicated browser purchase click was not added in 06-06 (outside its file set); the install rule remains proven by the Phase 5 `checkFit`/`applyFit` unit pair. The blocker is recorded in `PROJECT.md` as re-scoped, not silently resolved.

## Verification Evidence

| Command | Result |
| --- | --- |
| `docker compose run --rm e2e sh -lc "npm run build && npx playwright test tests/e2e/hyperspace.spec.ts tests/e2e/save-load.spec.ts"` | 8 passed (2.2 min) |
| `docker compose run --rm e2e sh -lc "npm run build && npx playwright test tests/e2e/autosave.spec.ts"` | 19 passed (4.0 min) |
| `docker compose run --rm e2e sh -lc "npm run build && npx playwright test tests/e2e/station.spec.ts"` | 10 passed (2.1 min) |
| `docker compose run --rm e2e sh -lc "npm run build && npx playwright test tests/e2e/docking.spec.ts -g 'Shift.C with the computer granted'"` | 1 passed (14.5 s) |
| `docker compose run --rm test` | 88 files, 1,082 tests passed (71.7 s) |
| `docker compose run --rm typecheck` | clean (both `tsconfig.json` and `tsconfig.sim.json`) |
| `docker compose run --rm lint` | ESLint clean; Prettier "All matched files use Prettier code style!" |
| `docker compose run --rm assets npm run assets:check` | `assets:check: no differences` |
| `docker compose run --rm verify` (first run) | FAILED — 72/73 e2e, stale `docking.spec.ts` attempts |
| `docker compose run --rm verify` (second run) | FAILED — 72/73 e2e, hyperspace live-pose fixed tolerance |
| `docker compose run --rm verify` (final run) | **exit 0** — lint, typecheck, assets:check, 1,082 unit tests, build, 73/73 Playwright (14.3 min e2e; 16 min 5 s total) |

## Threat Surface Scan

No new trust boundary beyond the plan's register. The new helper only reads/writes the existing `wegolite`/`saves` IndexedDB store; no network, package, schema or production trust-boundary change was added. The proofs exercise the existing future/corrupt classification and the 17-key allow-list.

## Known Stubs

None. Every assertion reads a committed probe value or the real IndexedDB bytes; no placeholder, skipped test or unrun verify remains.

## Next Phase Readiness

- Phase 6's browser gate is green and the SUMMARY records the decision supersessions.
- The remaining known gap is the dedicated browser purchase proof for the docking computer at Leesti (TL 10); the route is reachable and the rule is unit-proven.
- No production blockers from this plan.

## Self-Check: PASSED

- Created file `tests/e2e/helpers/save-store.ts` — FOUND.
- Commits `0583cfe`, `0039559`, `bd81f61`, `f94cdfa` are ancestors of HEAD — FOUND.
- `git rev-list --count 060ee2d..HEAD` = 4; no uncommitted task files remained.
- `.planning/PROJECT.md` contains the nine new rows, the supersession marker and the TL 9 re-scope.
- Final `docker compose run --rm verify` exit 0 with 73/73 Playwright tests.
