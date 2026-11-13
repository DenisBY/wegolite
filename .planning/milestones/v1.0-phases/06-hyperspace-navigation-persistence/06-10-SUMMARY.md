---
phase: 06-hyperspace-navigation-persistence
plan: 10
subsystem: ui
tags: [hud, fuel, chart, arrow-selection, canvas, playwright, vitest]

# Dependency graph
requires:
  - phase: 06-hyperspace-navigation-persistence
    provides: "profile.fuel tenths (06-01/06-04), the galactic chart model and painter (06-03), the session wiring (06-04)"
provides:
  - "Flight HUD fuel bar and fuel text derived from the live profile tank"
  - "HUD probe fields fuelText and fuel, asserted in the browser after a jump"
  - "Short-range arrow selection restricted to visible systems, inside a 45-degree cone scored by squared distance"
  - "Selected chart marker and label painted and labelled even when a range toggle leaves it off-window"
  - "Chart comments that record the visible-only selection and the north-up orientation as a decision"
affects: [06-12 PROJECT.md decision rows, phase 7 UI hardening]

# Actuals (#2632) - chars/4 over the full content of the 11 files changed (HEAD at aa5476a..c49d86e)
actuals:
  tokens: 50570
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Required live-state inputs (fuelTenths) placed before defaulted parameters so no caller can fall back to a constant tank"
    - "Arrow navigation walks the same visibility predicate the painter uses, so a selection is always painted"

key-files:
  created: []
  modified:
    - src/app/hud-model.ts
    - src/app/game-session.ts
    - src/app/probe.ts
    - src/main.ts
    - src/ui/chart-model.ts
    - src/ui/chart-draw.ts
    - tests/ui/hud-model.test.ts
    - tests/hud/projection.test.ts
    - tests/ui/chart-model.test.ts
    - tests/ui/chart-draw.test.ts
    - tests/e2e/hyperspace.spec.ts

key-decisions:
  - "buildHudModel takes fuelTenths as a required fifth parameter, before the defaulted flashAlpha and hyperspaceTarget, so the bar and the text share one live source and no caller can silently draw a full tank."
  - "nearestInDirection rejects forward <= 0 and lateral > forward (a 45-degree cone), scores by squared distance in distance space, and breaks exact ties by systemIndex. Arrows pass only the visible systems."
  - "The selected marker is forced into the painted set and the label set, so an off-window selection is never invisible or unlabelled."
  - "The chart orientation comment cites Oolite's full chart: GuiDisplayGen.m drawStarChart uses a negative vertical scale (vscale = -height / ...). Wegolite negates chart-y for north-up. The divergence is recorded as a PROJECT.md row by plan 06-12."

patterns-established:
  - "Pattern: a probe field derived from the HUD model is published from the same frame's model, so the browser proof reads one consistent snapshot."
  - "Pattern: the visibility predicate lives in the model (marker.visible) and both the arrow path and the painter consume it."

requirements-completed: [NAV-01, NAV-02, NAV-03]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "The flight HUD fuel bar and fuel text are the live tank: 34/70 and 3.4 LY after Lave to Diso, with half-tank and zero-tank unit cases"
    requirement: "NAV-03"
    verification:
      - kind: unit
        ref: "tests/ui/hud-model.test.ts#derives the fuel bar and text from the live tank"
        status: pass
      - kind: e2e
        ref: "tests/e2e/hyperspace.spec.ts#chart target, countdown, abort, refusal, arrival and reload"
        status: pass
    human_judgment: false
  - id: D2
    description: "Short-range arrow selection lands only on a visible system; a Right press from Lave never selects Ermaso"
    requirement: "NAV-02"
    verification:
      - kind: unit
        ref: "tests/ui/chart-model.test.ts#short-range arrow selection"
        status: pass
      - kind: unit
        ref: "tests/ui/chart-model.test.ts#nearestInDirection"
        status: pass
    human_judgment: false
  - id: D3
    description: "A selection left off-window by a range toggle is still painted and labelled"
    requirement: "NAV-02"
    verification:
      - kind: unit
        ref: "tests/ui/chart-draw.test.ts#drawChart off-window selection"
        status: pass
      - kind: unit
        ref: "tests/ui/chart-model.test.ts#keeps an off-window selection in the label set"
        status: pass
    human_judgment: false
  - id: D4
    description: "The chart comments record that only visible systems are arrow-selectable and that the north-up orientation is a recorded decision"
    requirement: "NAV-01"
    verification: []
    human_judgment: true
    rationale: "Comment wording is a documentation judgment with no executable oracle; the PROJECT.md row it points at is written by plan 06-12."

# Metrics
duration: ~13min (approximate; start time was not recorded, estimated from the first tool call at ~12:20Z)
completed: 2026-11-07
status: complete
---

# Phase 6 Plan 10: Live HUD fuel and visible-only chart arrows Summary

**HUD fuel bar and text now read the live 34/70 tank after a jump, and chart arrows can only land on a system the window paints**

## Performance

- **Duration:** ~13 min (approximate)
- **Started:** ~2026-11-07T12:20Z (estimated; not recorded)
- **Completed:** 2026-11-07T12:31Z (last task commit `c49d86e` at 12:31:05Z)
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments

- G-4 closed: `buildHudModel` requires the live `fuelTenths`; `buildBars` and `formatFuel` both derive from it. After Lave to Diso the bar is 34/70 and the text reads `3.4 LY`, not a full tank.
- The HUD probe publishes `fuelText` and `fuel`; the hyperspace browser spec asserts both after the jump.
- G-5 closed: short-range arrows walk only the visible systems, inside a 45-degree cone, scored by squared distance with a `systemIndex` tie-break. The first Right from Lave no longer selects the off-window Ermaso.
- A selection that a range toggle leaves off-window is still painted and labelled, so the readout never names an invisible marker.
- Chart comments are corrected: the D-04 marker comment no longer claims every system is arrow-reachable, and the projection comment states that the north-up negation is a recorded decision.

## Task Commits

Each task was committed atomically on `main`:

1. **Task 1: Drive the HUD fuel bar and text from the live profile tank** - `707ce58` (fix)
2. **Task 2: Constrain arrow selection to visible systems and paint/label the selection** - `c49d86e` (fix)

**Plan metadata:** recorded in the following `docs(06-10)` commit (STATE.md, ROADMAP.md, REQUIREMENTS.md, this SUMMARY.md).

## Files Created/Modified

- `src/app/hud-model.ts` - required `fuelTenths` parameter; live fuel bar and text; non-finite and negative tanks clamp to empty
- `src/app/game-session.ts` - passes `profile.fuel` into the HUD model; publishes `fuelText`/`fuel` on `probe.hud`; `moveChartSelection` walks only visible systems
- `src/app/probe.ts` - `WegoliteHudProbe` gains `fuelText` and `fuel`; the failure literal sets them
- `src/main.ts` - boot probe literal carries `fuelText: ""` and `fuel: 0`
- `src/ui/chart-model.ts` - `visibleSystemIds`; cone and squared-distance `nearestInDirection`; selected label forced; corrected comments
- `src/ui/chart-draw.ts` - the marker paint predicate includes the selected marker
- `tests/ui/hud-model.test.ts` - half-tank, zero-tank, full-tank and non-finite-tank cases; call sites pass a tank
- `tests/hud/projection.test.ts` - call sites pass the fixture tank
- `tests/ui/chart-model.test.ts` - cone rejection, squared-distance winner, visible-only short-range step, off-window label
- `tests/ui/chart-draw.test.ts` - off-window selected marker painted and labelled; unselected off-window marker not painted
- `tests/e2e/hyperspace.spec.ts` - post-jump HUD assertions `3.4 LY` and `34/70`

## Decisions Made

- `buildHudModel(state, layout, config, message, fuelTenths, flashAlpha = 0, hyperspaceTarget = "")`. The tank is required and sits before the defaulted parameters (TS1016), so a missed caller fails typecheck instead of drawing a full tank.
- The arrow score is squared distance in distance space (`dy` is halved chart-y), not the old `lateral * 1000 + forward` alignment score. A candidate with `lateral > forward` is rejected.
- The chart orientation comment cites Oolite's own code: `src/Core/GuiDisplayGen.m`, `drawStarChart`, uses `vscale = -height / (2 * ...)`. The plan's wording ("bottom-left GL origin") was not verified, so the comment states the measured negative scale instead.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Prettier formatting in the chart model test**
- **Found during:** Task 2 (`docker compose run --rm lint`)
- **Issue:** `prettier --check` flagged `tests/ui/chart-model.test.ts` after the new cases were added, which blocks the lint gate.
- **Fix:** Ran `prettier --write` on that single file, with no content change beyond formatting.
- **Files modified:** tests/ui/chart-model.test.ts
- **Verification:** `docker compose run --rm lint` exits 0; the chart unit suites still pass 34/34.
- **Committed in:** `c49d86e` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking, formatting only)
**Impact on plan:** No scope change. Formatting only.

## Issues Encountered

- The pre-existing uncommitted `.planning/STATE.md`, `.planning/config.json`, `.planning/state.json` and untracked diagnostics were left unstaged. Each commit staged explicit paths only.
- No browser or unit failures occurred. The hyperspace spec passed on the first run after each task, and the full Vitest suite passed (88 files) before Task 2 was committed.

## Verification Run (Docker only)

- `docker compose run --rm test npx vitest run tests/ui/hud-model.test.ts tests/hud/projection.test.ts` - 18 passed
- `docker compose run --rm test npx vitest run tests/ui/chart-model.test.ts tests/ui/chart-draw.test.ts` - 34 passed
- `docker compose run --rm test` - 88 files passed
- `docker compose run --rm typecheck` - exit 0 (both `tsconfig.json` and `tsconfig.sim.json`)
- `docker compose run --rm lint` - exit 0 (after the Prettier fix)
- `docker compose run --rm e2e sh -lc "npm run build && npx playwright test tests/e2e/hyperspace.spec.ts"` - 1 passed (run after Task 1 and again after Task 2)

## Known Stubs

None. The HUD and chart paths render live state; no placeholder values were introduced.

## Threat Flags

None. No new network endpoint, auth path, file access or schema change was introduced.

## Next Phase Readiness

- G-4 and G-5 are closed. The G-9 decision rows in `PROJECT.md` are written by plan 06-12, which this plan's source comments point at.
- Not in scope here and still open in phase 6: G-1 (arrival and restore latch), G-2 (countdown survives dock), G-3 (overwrite dialog), G-6 (same-frame double H), G-7 (unguarded destination build), G-8 (stale message after Load). These belong to the other gap-closure plans.

---
*Phase: 06-hyperspace-navigation-persistence*
*Completed: 2026-11-07*
