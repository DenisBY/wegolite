---
phase: 06-hyperspace-navigation-persistence
plan: 05
subsystem: app
tags: [save-load, f2-overlay, manual-save, overwrite-confirm, in-session-load, failed-load-isolation, input-context, probe]

requires:
  - phase: 06-hyperspace-navigation-persistence
    provides: plan 06-02's v2 parse/migrate/validate pipeline, snapshot/restore and market snapshot
  - phase: 06-hyperspace-navigation-persistence
    provides: plan 06-04's mutable system, enterSystemById, in-flight install order and committed target
  - phase: 05-docked-economy-station-screens
    provides: the station shell header/footer language, single-slot autosave and probe groups
provides:
  - the docked-only F2 Save/Load overlay with its own saveScreen input context
  - one-slot manual Save that confirms before replacing a committed autosave
  - a committed-only save probe revision/clock/notice contract
  - an in-session Load that reuses parseSave + restoreFromSave and never reloads the page
  - failed-load isolation that leaves the session, scene and IndexedDB bytes untouched
affects: [06-06 end-to-end proof]

actuals:
  tokens: 18958
  tasks: 3
  commits: 3
  plan_head_before: 35ae2990d1917ed534d6d4f1aac47f52344d94fe
  plan_head_after: 1c6ccba7a7652506c1ec5e8637ad5a82446faa88

tech-stack:
  added: []
  patterns:
    - Opaque edge-driven overlay queued through the input source and applied by the session
    - One snapshot builder shared by autosave anchors and the manual F2 Save
    - Validate-and-build-before-swap, then one synchronous install block with no early return
    - Probe publishes committed save values only, never a queued request

key-files:
  created:
    - src/ui/save-load.ts
    - tests/e2e/save-load.spec.ts
  modified:
    - index.html
    - src/app/game-session.ts
    - src/app/probe.ts
    - src/input/actions.ts
    - src/input/keyboard.ts
    - tests/input/bindings.test.ts
    - tests/guards/economy-purity.test.ts

key-decisions:
  - "F2 is scoped to dockHome/dockScreen only; the session revalidates the live docked mode and refuses while paused or with the chart open."
  - "The screen actions are session-drained edges (like the chart), so open/close, row movement, Save, Load and the overwrite dialog all resolve in one input model."
  - "Escape in saveScreen maps to saveScreenReturn; while the overwrite dialog is open that action cancels the dialog instead of closing the screen, so a stray Escape never writes."
  - "The overwrite dialog is a title-style alertdialog with Cancel focused; Tab is trapped there and KeyN/KeyY join the semantic action layer."
  - "Autosave and manual Save share buildSnapshotInputs(), so the bytes from the same state are identical (the pre-launch anchor byte-equality is asserted)."
  - "probe.save.revision now reports the last committed revision (not the queued one); committed/committedRevision/lastClock/notice only advance after the transaction."
  - "Load is read-only: it never calls store.write, never reloads and leaves the loaded blob byte-identical; a successful load marks the slot valid so a later Save must confirm."
  - "Load precomputes the restored profile, market, seed and target before enterSystemById, then installs them in one block; a throw before that point leaves the live scene and session intact."
  - "The in-flight Load proof rewrites a validated v2 docked blob into the in-flight shape through the store seam, which the plan explicitly allows, instead of spending minutes on a real jump."

requirements-completed: [SAVE-01, SAVE-04, SAVE-05]

coverage:
  - id: D1
    description: "F2 opens only while docked, closes on Return/Escape, cannot open while paused/in flight and cannot leak screen actions into other contexts"
    requirement: "SAVE-05"
    verification:
      - kind: e2e
        ref: "tests/e2e/save-load.spec.ts#F2 opens the Save/Load screen only while docked and closes on Return/Escape"
        status: pass
      - kind: e2e
        ref: "tests/e2e/save-load.spec.ts#F2 is inert while paused and in flight"
        status: pass
      - kind: unit
        ref: "tests/input/bindings.test.ts#save screen bindings"
        status: pass
    human_judgment: false
  - id: D2
    description: "The overlay is a standalone full-screen sibling with one slot line, Save/Load/Return rows, textContent fields, no second footer and the pause overlay still above it"
    requirement: "SAVE-05"
    verification:
      - kind: e2e
        ref: "tests/e2e/save-load.spec.ts#F2 opens the Save/Load screen only while docked and closes on Return/Escape"
        status: pass
    human_judgment: false
  - id: D3
    description: "Manual Save writes the one autosave key, confirms before overwriting a committed slot, leaves bytes identical on Cancel and reports only the committed revision/clock"
    requirement: "SAVE-05"
    verification:
      - kind: e2e
        ref: "tests/e2e/save-load.spec.ts#a manual Save writes the one committed slot and the next Save asks before overwriting"
        status: pass
      - kind: e2e
        ref: "tests/e2e/save-load.spec.ts#a future or unreadable slot is refused and never overwritten"
        status: pass
    human_judgment: false
  - id: D4
    description: "In-session Load restores docked and in-flight saves through the shared pipeline, resets station/chart/F2 panels and never reloads the page"
    requirement: "SAVE-01"
    verification:
      - kind: e2e
        ref: "tests/e2e/save-load.spec.ts#an in-session Load restores the saved docked session without reloading"
        status: pass
      - kind: e2e
        ref: "tests/e2e/save-load.spec.ts#an in-session Load of an in-flight save returns to flight with the station hidden"
        status: pass
    human_judgment: false
  - id: D5
    description: "A corrupt, future or absent slot shows app-owned copy and leaves the current session, scene, profile, market and bytes untouched"
    requirement: "SAVE-04"
    verification:
      - kind: e2e
        ref: "tests/e2e/save-load.spec.ts#a failed Load shows the reason and leaves the session and bytes untouched"
        status: pass
    human_judgment: false

duration: 28min
completed: 2026-11-06
status: complete
---

# Phase 6 Plan 5: Save/Load Screen Summary

**Docked-only F2 Save/Load: one autosave slot, confirmed overwrite, committed-only probe values, and an in-session Load that validates and installs in one block without ever reloading or half-swapping.**

## Performance

- **Duration:** ~28 min (19:30Z → 19:58Z)
- **Tasks:** 3
- **Files changed:** 9 (+1,779 / −38)
- **Task commits:** 3

## Accomplishments

- `index.html` now owns a hidden `#save-load` sibling of `#docked`/`#chart`, below the pause overlay: station-style header, one slot line, Save/Load/Return rows, a key-hint footer `div` (never a `<footer>`) and a nested title-style overwrite `alertdialog`.
- `src/ui/save-load.ts` owns the overlay chrome: `createSaveLoadScreen` exposes `show/hide/isOpen/setSlot/setNotice/moveSelection/selection/activate/confirmOverwrite/cancelOverwrite/isConfirming/onSave/onLoad/onReturn/onOverwriteConfirmed/dispose`. Every dynamic string is `textContent`; the confirmation focuses Cancel, traps Tab and exposes `Escape` to the session so it cancels rather than closes.
- `src/input/actions.ts` adds `saveLoad` (F2), the seven `saveScreen*` actions, the `saveScreen` context, `F2` to `RESERVED_F_KEYS`, `saveScreen` to `pause`, and the Escape exemption pair (`saveScreen` + `saveScreenReturn`). `src/input/keyboard.ts` adds a dedicated save-screen queue drained by the session.
- `src/app/game-session.ts` opens F2 only with `state.mode === "docked"`, never while paused, with the chart open or already open; the frame freezes behind the opaque overlay; Return restores the exact station context and focuses `#station-screen`.
- Manual Save reuses the one `snapshotForSave` + `queueAutosave` path. An absent slot writes immediately; a committed valid slot raises the dialog and only Confirm writes. Corrupt/future/unreadable/unavailable slots are refused with the reason in the notice and probe. `probe.save.revision` now means the last committed revision, with `lastClock` and `notice` advancing only after the transaction.
- In-session Load reads the one key, runs `parseSave` (migration + validator + allow-lists), resolves and derives the saved system, restores profile/state/market/seed/target, builds the scene once, then installs state/profile/market/seed/target/pose in one synchronous block; it resets station/chart/F2, chooses `dockHome` or `flight` from the restored mode and paints one frame. Failure paths return before any mutation.
- `tests/e2e/save-load.spec.ts` proves the docked gate, footer count, pause/in-flight inertness, first-save byte shape equality with the pre-launch anchor, Cancel byte identity, one-revision confirm, bad-slot refusal, docked/in-flight load and failed-load isolation. `tests/input/bindings.test.ts` proves the context scoping and Escape/P behaviour.

## Task Commits

1. **Task 1: Docked-only F2 shell, context and e2e opener** — `38aac51` (feat)
2. **Task 2: Manual Save, overwrite confirmation, committed probe values** — `4f201f7` (feat)
3. **Task 3: In-session Load, failed-load isolation, binding proofs** — `1c6ccba` (feat)

**Plan metadata:** committed separately after this summary.

## Files Created/Modified

- `index.html` — `#save-load` markup and scoped CSS; one slot line, three rows, hidden overwrite dialog; no second `<footer>`.
- `src/ui/save-load.ts` — overlay controller, row highlight, textContent writers, focus trap and overwrite dialog.
- `src/app/game-session.ts` — F2 gate/open/close, frame freeze, manual Save, committed probe sync, in-session Load install and reset.
- `src/app/probe.ts` — optional `save.notice`; optional `saveScreen` group (`open`, `row`, `confirming`, `notice`).
- `src/input/actions.ts` — saveLoad/saveScreen actions, `saveScreen` context, F2 reserved, Escape pair, labels and bindings.
- `src/input/keyboard.ts` — `drainSaveScreenActions`, save-screen edge dispatch and queue clearing.
- `tests/e2e/save-load.spec.ts` — seven browser proofs (docked gate, inertness, save/overwrite, bad slots, docked load, in-flight load, isolation).
- `tests/input/bindings.test.ts` — save-screen registration, scoping, F2/escape/P and no-leak proofs.
- `tests/guards/economy-purity.test.ts` — three legitimate market producers now; the Load producer is pinned.

## Decisions Made

- The overlay is edge-driven and session-owned, matching the chart: the input layer queues `saveLoad`/`saveScreen*` and the frame drain applies them, so Return can close and Load can run without an app timer.
- Escape always raises `saveScreenReturn`; the session interprets it as Cancel while the dialog is open and Return otherwise. `KeyN` is the explicit Cancel.
- The manual Save refuses to run while another manual write is in flight but never blocks an autosave anchor; the store's monotonic revision queue still serialises every write.
- `canOverwrite` remains the single write gate (absent/valid only) and `statusSkipReason` now names `corrupt` so a refusal is never silent.
- Load does not write the blob back; the loaded slot becomes `valid` in memory so the next Save asks before overwriting. This closes the SAVE-05 idempotency assumption (load-without-write).
- A failed load keeps the overlay open with the app-owned copy; no state, scene, profile, market or bytes move.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] An existing binding test asserted `KeyL` was unbound**
- **Found during:** Task 1 targeted unit run
- **Issue:** `tests/input/bindings.test.ts` used `KeyL` as its example of an unbound code; the new `saveScreenLoad` default binds it.
- **Fix:** Changed the example to `KeyZ`, which no action uses, preserving the test's intent.
- **Files modified:** `tests/input/bindings.test.ts`
- **Verification:** 41 bindings tests pass.
- **Committed in:** `38aac51`

**2. [Rule 3 - Blocking] The economy purity guard expected exactly two market producers**
- **Found during:** full unit suite
- **Issue:** the guard counted `generateMarket(` calls in `game-session.ts`; the in-session Load is the third legitimate producer (restored snapshot or its saved seed).
- **Fix:** raised the count to three and pinned the Load call `generateMarket(savedSystem, catalogue, nextSeed)` beside the boot and arrival producers; the docked no-reseed assertions remain.
- **Files modified:** `tests/guards/economy-purity.test.ts`
- **Verification:** the guard file is 8/8 green and the full suite is 1,082/1,082.
- **Committed in:** `1c6ccba`

### Contract Adjustment (required by the plan, recorded for review)

**3. `probe.save.revision` now reports the committed revision**
- **Why:** Task 2 requires the probe to reflect the committed revision and clock, never an optimistic value. The session still reserves a monotonic revision for the store queue, but the published field only advances after the transaction commits. No existing test asserted the queued value.
- **Files modified:** `src/app/game-session.ts`, `src/app/probe.ts`
- **Committed in:** `4f201f7`

---

**Total deviations:** 2 auto-fixed blocking items plus 1 plan-required contract adjustment.
**Impact on plan:** the product contract is unchanged; both fixes are test/guard hygiene required by the new action table and the third legitimate market producer.

## Issues Encountered

- **Pre-existing `tests/e2e/station.spec.ts` failures (not caused by this plan, not fixed — scope boundary).** Running the station spec for regressions gives 7 passed / 3 failed, all stale expectations from earlier plans in this phase:
  1. `launch and redock reuse the persisted seed, prices and stock` — asserts the exact `economy` probe key set; it does not list `marketSystemId`, which plan 06-04 added.
  2. `F5 pages, F7 fields and direct section switching stay keyboard-only` — `page.locator(".station-footer")` is a strict locator; it already matched the station and chart footers (2 elements) after plan 06-03, and now also the save-load footer (3). The strict-mode failure predates this plan.
  3. `the whole station computer is keyboard-only, and every accepted action writes once` — expects the seed's Lave food stock (16) after reload, but plan 06-02's v2 restore correctly prefers the saved market snapshot (15).
  These are recorded for the orchestrator; this plan did not modify `tests/e2e/station.spec.ts`.
- No flakiness was observed in the save-load spec; the full file is 42 s with one worker.

## User Setup Required

None — no external service configuration, dependency or migration.

## Verification Evidence

| Command | Result |
| --- | --- |
| `docker compose run --rm test npx vitest run tests/input/bindings.test.ts` | 1 file, 41 tests passed |
| `docker compose run --rm test npx vitest run tests/guards/economy-purity.test.ts` | 1 file, 8 tests passed |
| `docker compose run --rm test` | 88 files, 1,082 tests passed |
| `docker compose run --rm typecheck` | `tsconfig.json` and `tsconfig.sim.json` clean |
| `docker compose run --rm lint` | ESLint clean; Prettier "All matched files use Prettier code style!" |
| `docker compose run --rm e2e sh -lc "npm run build && npx playwright test tests/e2e/save-load.spec.ts"` | 7 passed (42.1 s) |
| `docker compose run --rm e2e sh -lc "npm run build && npx playwright test tests/e2e/autosave.spec.ts tests/e2e/hyperspace.spec.ts"` | 20 passed (5.0 min) |
| `docker compose run --rm e2e sh -lc "npm run build && npx playwright test tests/e2e/station.spec.ts"` | 7 passed, 3 failed — all pre-existing stale expectations listed above |

## Threat Surface Scan

No new trust boundary beyond the plan's register. The F2 actions are scoped to `saveScreen`; Load parses and validates before building or swapping; a failed Load never writes or clears; the overwrite dialog focuses the safe action. No package, network endpoint or schema change was added. `#save-load` introduces no `<footer>` and no `innerHTML` writes.

## Known Stubs

None. Every Save/Load/Return path is wired; Save and Load both round-trip through the real IndexedDB store.

## Next Phase Readiness

- Plan 06-06 can assert the F2 screen through `probe.saveScreen` (`open`, `row`, `confirming`, `notice`), the committed `probe.save.revision/lastClock`, and `probe.restore` for both load modes.
- The manual Save and the pre-launch anchor produce identical bytes from the same state, so the phase gate can compare trigger revisions without a second encoder.
- No blockers. The three `station.spec.ts` failures above are the only red spec observed and they predate this plan.

## Self-Check: PASSED

- `[ -f index.html ]` → FOUND
- `[ -f src/ui/save-load.ts ]` → FOUND
- `[ -f tests/e2e/save-load.spec.ts ]` → FOUND
- `git merge-base --is-ancestor 38aac51 HEAD` → FOUND
- `git merge-base --is-ancestor 4f201f7 HEAD` → FOUND
- `git merge-base --is-ancestor 1c6ccba HEAD` → FOUND
