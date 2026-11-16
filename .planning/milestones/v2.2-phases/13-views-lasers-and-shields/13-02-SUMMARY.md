---
phase: 13-views-lasers-and-shields
plan: 02
subsystem: input
tags: [keybindings, settings-migration, commands, views, input-frame]
requires:
  - phase: 13-views-lasers-and-shields
    provides: "13-01 foundation fixes (world lifecycle refusal, mass-lock message)"
provides:
  - "P alone pauses; Escape is Back in station sections, the chart and the save screen, and an inert eject in flight"
  - "R ident, U untarget, Q target station, 1-4/F1-F4 view keys (flight only), A held fire as keyboard-to-sim commands and an InputFrame field"
  - "setView, ident and untarget command kinds; InputFrame.fire; src/sim/combat/mounts.ts shared view and mount vocabulary"
  - "migrateLegacyBindings: stored legacy defaults move to the new keys, customised bindings survive"
affects: [13-03, 13-08, 13-15, phase-14]
actuals:
  tokens: 9600
  tasks: 3
  commits: 3
plan_head_before: 8e2035cc91710d5130687c8f633b11c19e487348
plan_head_after: 293c5c79cb9804343d9093e681a75c6b731b285c
tech-stack:
  added: []
  patterns:
    - "New flight actions are appended after hyperspace in ACTION_IDS so a stored custom binding of an older action wins a shared code"
    - "Settings migration rewrites only exact legacy values and only for blobs that predate the new actions"
key-files:
  created:
    - src/sim/combat/mounts.ts
  modified:
    - src/sim/commands.ts
    - src/sim/state.ts
    - src/input/actions.ts
    - src/input/keyboard.ts
    - src/input/bindings.ts
    - src/settings/schema.ts
    - src/app/session/settings-controller.ts
    - tests/input/bindings.test.ts
    - tests/input/station-actions.test.ts
    - tests/settings/schema.test.ts
    - README.md
    - CHANGELOG.md
key-decisions:
  - "The ident R-while-locked rule and the U untarget key follow Oolite (advisor recommendation, PENDING OWNER CONFIRMATION); this plan only binds the keys and plan 13-15 records the pending D-03/D-04 decisions."
  - "launch is a dockHome-only action: the number keys are view keys in flight and the in-flight launch skip is skipLaunch, not launch."
  - "Target station moves to KeyQ, the only letter Oolite's default block never binds."
requirements-completed: [INPUT-01]
coverage:
  - id: D1
    description: "P alone pauses; Escape no longer pauses by default and stays Back in station sections, the chart and the save screen"
    requirement: INPUT-01
    verification:
      - kind: unit
        ref: "tests/input/bindings.test.ts#does not pause on Escape with the default table"
        status: pass
      - kind: unit
        ref: "tests/input/station-actions.test.ts#Esc in dockScreen is Back only, never pause"
        status: pass
      - kind: e2e
        ref: "tests/e2e/settings.spec.ts (pause freezes the clock; overlay traps focus and Escape backs out one level)"
        status: pass
    human_judgment: false
  - id: D2
    description: "R produces ident, U untarget, Q target station, 1-4/F1-F4 in flight the four setView commands, A held sets frame.fire, and Digit1/F1 on the home screen still launches"
    requirement: INPUT-01
    verification:
      - kind: unit
        ref: "tests/input/bindings.test.ts#maps every edge action to its command / maps the number and function keys to the four views in flight / launches from Digit1 and F1 on the docked home screen only / holds fire in flight"
        status: pass
      - kind: e2e
        ref: "tests/e2e/station-tabs.spec.ts#the Launch tab launches only from Home"
        status: pass
    human_judgment: false
  - id: D3
    description: "A double Escape in flight does nothing (no command, no pause toggle) because no escape pod exists"
    requirement: INPUT-01
    verification:
      - kind: unit
        ref: "tests/input/bindings.test.ts#makes a double Escape in flight do nothing (no escape pod exists)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Stored legacy defaults (pause P+Escape, target station R) migrate on load; customised KeyQ, KeyU, KeyA and pause bindings survive and the new action stays unbound"
    requirement: INPUT-01
    verification:
      - kind: unit
        ref: "tests/settings/schema.test.ts#migrateLegacyBindings"
        status: pass
    human_judgment: false
  - id: D5
    description: "Every new action is rebindable, listed in the controls panel and in the README controls table"
    requirement: INPUT-01
    verification:
      - kind: unit
        ref: "tests/contract/readme.test.ts#QUAL-06 Controls table is derived from the bindings"
        status: pass
    human_judgment: false
duration: 55min
completed: 2026-11-14
status: complete
---

# Phase 13 Plan 02: Input Key Migration Summary

**INPUT-01 key migration: P alone pauses, R is ident, U untarget, Q target station, 1-4/F1-F4 are the four view commands in flight, A is a held fire field, Escape is an inert eject in flight, and saved legacy bindings migrate without losing customised keys.**

## Performance

- **Duration:** about 55 min
- **Tasks:** 3 (1 tracer, 1 TDD, 1 docs/browser check)
- **Files modified:** 13 (1 created)

## Accomplishments

- New shared vocabulary `src/sim/combat/mounts.ts` (`FACINGS`, `Facing`, `isFacing`, `LASER_KEYS`, `NO_LASER`, `MountKey`, `isMountKey`, `LaserMounts`, `DEFAULT_LASER_MOUNTS`), pure and free of content imports, for the views (CBT-04) and mounts (CBT-05).
- Eight new rebindable actions reach the sim boundary: `setView` (with a closed `Facing` payload), `ident` and `untarget` commands from edge keys, `InputFrame.fire` held in flight only, and `eject` bound to Escape with no command (Oolite guards eject on `hasEscapePod`; no pod exists this milestone).
- The default table is conflict-free (a sweep test proves no two actions with overlapping contexts share a default code). `launch` is dockHome-only.
- `migrateLegacyBindings` runs inside `mergeDefaults` before `createBindingMap`: exact legacy defaults move, a customised binding that already holds KeyQ/KeyU/KeyA/pause-Escape wins and the new action is left unbound. No settings version bump.
- README controls table and CHANGELOG updated; the two browser specs that touch pause, Escape and launch passed unchanged.

## Task Commits

1. **Task 1: Keys to commands, end to end** - `943a584` (feat)
2. **Task 2: Persisted-settings migration** - `af8de1f` (feat)
3. **Task 3: Controls documentation, CHANGELOG and the browser-spec check** - `293c5c7` (docs)

**Plan metadata:** recorded in the final docs commit.

## Files Created/Modified

- `src/sim/combat/mounts.ts` - facings, laser keys, mount vocabulary, stock Cobra mounts
- `src/sim/commands.ts` - `setView`, `ident`, `untarget` kinds
- `src/sim/state.ts` - optional `InputFrame.fire`
- `src/input/actions.ts` - eight actions, new defaults (pause P, target station Q), launch dockHome only, comments
- `src/input/keyboard.ts` - EDGE_COMMANDS for ident/untarget/views, `fire` in the flight frame, eject comment
- `src/input/bindings.ts` - doc comments for the Escape exemption (kept for stored blobs)
- `src/settings/schema.ts` - `migrateLegacyBindings`, called from `mergeDefaults`
- `src/app/session/settings-controller.ts` - resume comment no longer names Escape
- `tests/input/bindings.test.ts`, `tests/input/station-actions.test.ts`, `tests/settings/schema.test.ts` - pinned and new cases
- `README.md`, `CHANGELOG.md` - controls rows, pause line, Changed entry

## Decisions Made

- Followed the plan: keys only; the R-while-locked ident rule (Oolite's clear-and-reacquire) and the ident message wording remain PENDING OWNER CONFIRMATION and are recorded by plan 13-15.
- Escape cannot be captured for eject after a rebind except through Reset: the controls capture mode treats Escape as cancel (RESEARCH Pitfall 3). Not fixed here, as planned.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Migration gated on the blob predating the new actions**
- **Found during:** Task 2
- **Issue:** `mergeDefaults` also runs on every `saveSettings`, so rewriting every `targetStation: ["KeyR"]` would silently move a key a player deliberately chose on this build (after unbinding ident) back to Q on the next load.
- **Fix:** `pause` is rewritten only when the stored blob has no `eject` entry and `targetStation` only when it has no `ident` entry. A blob this build wrote always carries both, a legacy blob never does. All behaviours the plan lists still hold; one extra test pins the gate.
- **Files modified:** `src/settings/schema.ts`, `tests/settings/schema.test.ts`
- **Commit:** `af8de1f`

**2. [Rule 3 - Blocking] Tests pinning the old behaviour updated**
- **Found during:** Task 1
- **Issue:** Existing cases asserted Escape pauses (default table, dockHome, paused resume), Digit1/F1 launch in flight, and Digit4 inert in flight; the migration removes or changes those by design.
- **Fix:** Rewrote them to the new defaults and added stored-blob variants that keep the legacy Escape-pauses behaviour; `unbindAction` test now uses `launch`/`F1`.
- **Files modified:** `tests/input/bindings.test.ts`, `tests/input/station-actions.test.ts`
- **Commit:** `943a584`

### Acceptance-criterion note

- `rg -c '"ident"' src/input/actions.ts` returns 2, not the expected >=3: the object-literal entries (`ident:` in `DEFAULT_BINDINGS`, `ACTION_LABELS`, `ACTION_CONTEXTS`) are unquoted keys. The criterion's intent (union, ACTION_IDS, defaults, labels and contexts all carry the action) is met and covered by tests; the other four counted criteria match exactly.

### Process note

- The CHANGELOG `Changed` entry (P alone pauses, R to Q, settings migrated) landed in the Task 1 commit rather than Task 3, to keep the user-visible change and its changelog line together (AGENTS.md rule). No view, fire or ident changelog entry was added, per the plan.

**Total deviations:** 2 auto-fixed (1 bug-prevention, 1 blocking test update), 1 criterion note. **Impact:** none on scope.

## Verification

- `docker compose run --rm test npx vitest run tests/input tests/settings tests/contract/readme.test.ts` - pass
- `docker compose run --rm lint`, `docker compose run --rm typecheck` - pass
- `docker compose run --rm e2e sh -lc "npm run build:e2e && npx playwright test tests/e2e/settings.spec.ts tests/e2e/station-tabs.spec.ts"` - 20 passed, unchanged specs
- `docker compose run --rm verify` - exit 0: 153 test files, 3044 passed, 2 skipped; e2e smoke subset 27 passed

## Known Stubs

None. `fire`, `ident`, `untarget` and `setView` commands are produced but have no sim consumer yet by plan (13-03/13-08/13-15); they fall through the existing command switch untouched.

## Threat Flags

None. Threats T-13-02 (migration rewrites only exact legacy values after strict validation) and T-13-03 (closed `Facing` payload; the sim re-validates with `isFacing` in 13-08) are mitigated as planned.

## Next Phase Readiness

Ready for the next plan. 13-08 must copy `InputFrame.fire` into `ControlIntent.fire` and validate `setView.view` with `isFacing`; 13-15 implements ident and records the pending D-03/D-04 and INPUT-01 Key Decisions rows.

## Self-Check: PASSED

- `src/sim/combat/mounts.ts` exists; commits `943a584`, `af8de1f`, `293c5c7` are ancestors of HEAD.
